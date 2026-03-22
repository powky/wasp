/**
 * WaSP - WhatsApp Session Protocol
 *
 * Core class that manages WhatsApp sessions, message routing,
 * event handling, and multi-tenant isolation.
 */

import { EventEmitter } from 'events';
import { MessageQueue } from './queue.js';
import { MemoryStore } from './stores/memory.js';
import { SessionNotFoundError } from './errors.js';
import type {
  WaspConfig,
  Session,
  SessionStatus,
  Provider,
  ProviderType,
  Store,
  Message,
  SendMessageOptions,
  WaspEvent,
  EventType,
  Middleware,
  QueueItem,
} from './types.js';

/**
 * Default WaSP configuration
 */
const DEFAULT_CONFIG: Required<Omit<WaspConfig, 'logger'>> & Pick<WaspConfig, 'logger'> = {
  store: new MemoryStore(),
  queue: {
    minDelay: 2000,
    maxDelay: 5000,
    maxConcurrent: 1,
    priorityLanes: true,
  },
  defaultProvider: 'BAILEYS' as ProviderType,
  debug: false,
  logger: undefined,
};

/**
 * WaSP - WhatsApp Session Protocol
 *
 * Main class for managing WhatsApp sessions and message routing.
 *
 * @example
 * ```typescript
 * import { WaSP } from '@wasp/core';
 *
 * const wasp = new WaSP({
 *   debug: true,
 *   queue: {
 *     minDelay: 3000,
 *     maxDelay: 7000,
 *   },
 * });
 *
 * // Create session
 * const session = await wasp.createSession('my-session', 'BAILEYS');
 *
 * // Listen for events
 * wasp.on('MESSAGE_RECEIVED', (event) => {
 *   console.log('New message:', event.data);
 * });
 *
 * // Send message
 * await wasp.sendMessage('my-session', '27821234567', 'Hello!');
 * ```
 */
export class WaSP extends EventEmitter {
  private config: Required<Omit<WaspConfig, 'logger'>> & Pick<WaspConfig, 'logger'>;
  private store: Store;
  private queue: MessageQueue;
  private sessions: Map<string, { session: Session; provider: Provider }> = new Map();
  private middlewares: Middleware[] = [];

  constructor(config?: WaspConfig) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      queue: { ...DEFAULT_CONFIG.queue, ...config?.queue },
    };

    this.store = config?.store ?? new MemoryStore();
    this.queue = new MessageQueue(this.config.queue);

    // Setup queue event forwarding
    this.setupQueueEvents();

    this.log('info', 'WaSP initialized', { config: this.config });
  }

  /**
   * Create and connect a new session
   *
   * @param id Unique session identifier
   * @param providerType Provider to use (BAILEYS, WHATSMEOW, CLOUD_API)
   * @param options Provider-specific connection options
   * @returns Created session
   *
   * @example
   * ```typescript
   * const session = await wasp.createSession('org-123-user-456', 'BAILEYS', {
   *   authDir: './auth_states',
   * });
   * ```
   */
  async createSession(
    id: string,
    providerType?: ProviderType,
    options?: { orgId?: string; metadata?: Record<string, unknown> }
  ): Promise<Session> {
    // Check if session already exists
    if (this.sessions.has(id)) {
      throw new Error(`Session ${id} already exists`);
    }

    // Create session object
    const session: Session = {
      id,
      status: 'CONNECTING' as SessionStatus,
      provider: providerType ?? this.config.defaultProvider,
      orgId: options?.orgId,
      createdAt: new Date(),
      metadata: options?.metadata,
    };

    // Save to store
    await this.store.save(session);

    // Create provider instance
    const provider = await this.createProvider(session.provider, options);

    // Store session and provider
    this.sessions.set(id, { session, provider });

    // Setup provider event handlers
    this.setupProviderEvents(id, provider);

    // Connect provider
    try {
      await provider.connect(id, options);

      // Update session status (provider's 'connected' event handler will also update this)
      session.status = 'CONNECTED' as SessionStatus;
      session.connectedAt = new Date();
      session.phone = provider.getPhoneNumber() ?? undefined;
      await this.store.update(id, session);

      this.log('info', 'Session created', { sessionId: id, provider: session.provider });

      // Note: SESSION_CONNECTED event is emitted by setupProviderEvents handler
      // Don't emit duplicate event here

      return session;
    } catch (error) {
      // Clean up on connection failure
      this.sessions.delete(id);
      await this.store.delete(id);
      throw error;
    }
  }

  /**
   * Destroy a session
   *
   * Disconnects and removes all session data.
   *
   * @param id Session ID
   */
  async destroySession(id: string): Promise<void> {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new SessionNotFoundError(id);
    }

    const { provider } = entry;

    // Remove all event listeners to prevent memory leak
    provider.events.removeAllListeners();

    // Disconnect provider
    await provider.disconnect();

    // Clear queue
    this.queue.clearQueue(id);

    // Remove from sessions map
    this.sessions.delete(id);

    // Delete from store
    await this.store.delete(id);

    this.log('info', 'Session destroyed', { sessionId: id });

    // Emit disconnected event
    await this.emitEvent({
      type: 'SESSION_DISCONNECTED' as EventType,
      sessionId: id,
      timestamp: new Date(),
      data: { reason: 'destroyed' },
    });
  }

  /**
   * Get session by ID
   *
   * @param id Session ID
   * @returns Session or null if not found
   */
  async getSession(id: string): Promise<Session | null> {
    // Try memory first
    const entry = this.sessions.get(id);
    if (entry) {
      return { ...entry.session };
    }

    // Try store
    return await this.store.load(id);
  }

  /**
   * List all sessions
   *
   * @param filter Optional filter criteria
   * @returns Array of sessions
   */
  async listSessions(filter?: Partial<Session>): Promise<Session[]> {
    return await this.store.list(filter);
  }

  /**
   * Send a message
   *
   * Messages are queued with anti-ban delays unless immediate option is set.
   *
   * @param sessionId Session ID to send from
   * @param to Recipient phone number or group ID
   * @param content Message content
   * @param options Send options
   * @returns Sent message
   *
   * @example
   * ```typescript
   * // Regular message
   * await wasp.sendMessage('session-1', '27821234567', 'Hello!');
   *
   * // Priority message (reduced delay)
   * await wasp.sendMessage('session-1', '27821234567', 'URGENT', { priority: 10 });
   *
   * // Immediate message (skip queue)
   * await wasp.sendMessage('session-1', '27821234567', 'Alert', { immediate: true });
   * ```
   */
  async sendMessage(
    sessionId: string,
    to: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<Message> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new SessionNotFoundError(sessionId);
    }

    const { provider } = entry;

    // If immediate, bypass queue
    if (options?.immediate) {
      const message = await provider.sendMessage(to, content, options);

      await this.emitEvent({
        type: 'MESSAGE_SENT' as EventType,
        sessionId,
        timestamp: new Date(),
        data: message,
      });

      // Update last activity
      await this.store.update(sessionId, { lastActivityAt: new Date() });

      return message;
    }

    // Otherwise, queue the message
    return await this.queue.enqueue({
      sessionId,
      to,
      content,
      options,
      priority: options?.priority ?? 0,
      queuedAt: new Date(),
      resolve: async (_message: Message) => {
        // This will be called when queue processes the item
        const sent = await provider.sendMessage(to, content, options);

        await this.emitEvent({
          type: 'MESSAGE_SENT' as EventType,
          sessionId,
          timestamp: new Date(),
          data: sent,
        });

        // Update last activity
        await this.store.update(sessionId, { lastActivityAt: new Date() });

        return sent;
      },
      reject: (error: Error) => {
        throw error;
      },
    } as QueueItem);
  }

  /**
   * Subscribe to events
   *
   * @param event Event type or '*' for all events
   * @param handler Event handler
   *
   * @example
   * ```typescript
   * wasp.on('MESSAGE_RECEIVED', (event) => {
   *   console.log('New message:', event.data);
   * });
   *
   * wasp.on('*', (event) => {
   *   console.log('Any event:', event.type);
   * });
   * ```
   */
  on(event: EventType | '*', handler: (event: WaspEvent) => void): this {
    super.on(event, handler);
    return this;
  }

  /**
   * Add middleware
   *
   * Middleware is executed in order for each event.
   *
   * @param middleware Middleware function
   *
   * @example
   * ```typescript
   * import { logger, autoReconnect } from '@wasp/core/middleware';
   *
   * wasp.use(logger());
   * wasp.use(autoReconnect({ maxAttempts: 5 }));
   * ```
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Create provider instance
   */
  private async createProvider(type: ProviderType, options?: unknown): Promise<Provider> {
    // Check if options include a mock provider instance (for testing)
    if (options && typeof options === 'object' && 'mockProvider' in options) {
      return (options as any).mockProvider as Provider;
    }

    switch (type) {
      case 'BAILEYS': {
        const { BaileysProvider } = await import('./providers/baileys.js');
        return new BaileysProvider(options as any);
      }
      case 'WHATSMEOW':
        throw new Error('Whatsmeow provider not yet implemented');
      case 'CLOUD_API':
        throw new Error('Cloud API provider not yet implemented');
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Setup provider event handlers
   */
  private setupProviderEvents(sessionId: string, provider: Provider): void {
    // Connected
    provider.events.on('connected', async (data) => {
      await this.store.update(sessionId, {
        status: 'CONNECTED' as SessionStatus,
        connectedAt: new Date(),
        phone: data.phone,
      });

      await this.emitEvent({
        type: 'SESSION_CONNECTED' as EventType,
        sessionId,
        timestamp: new Date(),
        data,
      });
    });

    // Disconnected
    provider.events.on('disconnected', async (data) => {
      await this.store.update(sessionId, {
        status: 'DISCONNECTED' as SessionStatus,
      });

      await this.emitEvent({
        type: 'SESSION_DISCONNECTED' as EventType,
        sessionId,
        timestamp: new Date(),
        data,
      });
    });

    // QR code
    provider.events.on('qr', async (qr) => {
      await this.emitEvent({
        type: 'SESSION_QR' as EventType,
        sessionId,
        timestamp: new Date(),
        data: { qr },
      });
    });

    // Message received
    provider.events.on('message', async (message: Message) => {
      await this.store.update(sessionId, { lastActivityAt: new Date() });

      await this.emitEvent({
        type: 'MESSAGE_RECEIVED' as EventType,
        sessionId,
        timestamp: new Date(),
        data: message,
      });
    });

    // Error
    provider.events.on('error', async (error) => {
      this.log('error', 'Provider error', { sessionId, error });

      await this.emitEvent({
        type: 'SESSION_ERROR' as EventType,
        sessionId,
        timestamp: new Date(),
        data: { error },
      });
    });
  }

  /**
   * Setup queue event forwarding
   */
  private setupQueueEvents(): void {
    this.queue.on('sending', ({ sessionId, to }) => {
      this.log('debug', 'Sending queued message', { sessionId, to });
    });

    this.queue.on('error', ({ sessionId, error }) => {
      this.log('error', 'Queue error', { sessionId, error });
    });
  }

  /**
   * Emit event through middleware chain
   */
  private async emitEvent(event: WaspEvent): Promise<void> {
    // Execute middleware chain
    let index = 0;
    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        // End of chain - emit to listeners
        this.emit(event.type, event);
        this.emit('*', event);
        return;
      }

      const middleware = this.middlewares[index];
      index++;
      await middleware(event, next);
    };

    try {
      await next();
    } catch (error) {
      this.log('error', 'Middleware error', { event, error });
      throw error;
    }
  }

  /**
   * Internal logger
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (!this.config.debug && level === 'debug') {
      return;
    }

    if (this.config.logger) {
      this.config.logger[level]?.(message, data);
    } else if (level !== 'debug') {
      console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
        `[WaSP] ${message}`,
        data
      );
    }
  }
}
