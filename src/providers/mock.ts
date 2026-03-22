/**
 * Mock provider for testing
 *
 * A lightweight provider that doesn't require real WhatsApp connections.
 * Used in tests to verify WaSP core functionality without external dependencies.
 */

import { EventEmitter } from 'events';
import type {
  Provider,
  ProviderType,
  Message,
  SendMessageOptions,
} from '../types.js';
import { MessageType, EventType } from '../types.js';

/**
 * Mock provider options
 */
export interface MockProviderOptions {
  /** Simulate connection delay (ms) */
  connectionDelay?: number;
  /** Simulate send delay (ms) */
  sendDelay?: number;
  /** Auto-emit QR code */
  emitQR?: boolean;
  /** Fail connection */
  failConnection?: boolean;
  /** Fail send */
  failSend?: boolean;
}

/**
 * Mock provider
 *
 * Simulates WhatsApp connection without actually connecting.
 * Useful for unit tests and development.
 *
 * @example
 * ```typescript
 * import { MockProvider } from '@wasp/core/providers/mock';
 *
 * const provider = new MockProvider({
 *   connectionDelay: 100,
 *   emitQR: true,
 * });
 *
 * await provider.connect('test-session');
 * await provider.sendMessage('27821234567@s.whatsapp.net', 'Hello!');
 * ```
 */
export class MockProvider implements Provider {
  readonly type: ProviderType = 'BAILEYS' as ProviderType; // Pretend to be Baileys for tests
  readonly events: EventEmitter = new EventEmitter();

  private phoneNumber: string | null = null;
  private qrCode: string | null = null;
  private options: Required<MockProviderOptions>;
  private currentSessionId: string | null = null;
  private _connected: boolean = false;

  constructor(options?: MockProviderOptions) {
    this.options = {
      connectionDelay: options?.connectionDelay ?? 10,
      sendDelay: options?.sendDelay ?? 5,
      emitQR: options?.emitQR ?? false,
      failConnection: options?.failConnection ?? false,
      failSend: options?.failSend ?? false,
    };
  }

  /**
   * Connect to mock WhatsApp
   */
  async connect(sessionId: string, _options?: unknown): Promise<void> {
    if (this._connected) {
      return; // Already connected
    }

    this.currentSessionId = sessionId;

    if (this.options.failConnection) {
      throw new Error('Mock connection failed');
    }

    // Simulate connection delay
    if (this.options.connectionDelay > 0) {
      await this.sleep(this.options.connectionDelay);
    }

    // Emit QR if requested
    if (this.options.emitQR) {
      this.qrCode = 'mock-qr-code-data';
      this.events.emit('qr', this.qrCode);
      this.events.emit('event', {
        type: EventType.SESSION_QR,
        sessionId: this.currentSessionId!,
        timestamp: new Date(),
        data: { qr: this.qrCode },
      });
    }

    // Mock phone number
    this.phoneNumber = '27821234567';
    this._connected = true;

    this.events.emit('connected', { phone: this.phoneNumber });
    this.events.emit('event', {
      type: EventType.SESSION_CONNECTED,
      sessionId: this.currentSessionId!,
      timestamp: new Date(),
      data: { phone: this.phoneNumber },
    });
  }

  /**
   * Disconnect from mock WhatsApp
   */
  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    this.currentSessionId = null;
    this.phoneNumber = null;
    this.qrCode = null;
    this._connected = false;

    this.events.emit('disconnected', { shouldReconnect: false });
  }

  /**
   * Send a mock message
   */
  async sendMessage(
    to: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<Message> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    if (this.options.failSend) {
      throw new Error('Mock send failed');
    }

    // Simulate send delay
    if (this.options.sendDelay > 0) {
      await this.sleep(this.options.sendDelay);
    }

    const message: Message = {
      id: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      from: this.phoneNumber ?? '',
      to,
      type: options?.media ? MessageType.IMAGE : MessageType.TEXT,
      content,
      timestamp: new Date(),
      isGroup: to.includes('@g.us'),
      groupId: to.includes('@g.us') ? to : undefined,
      mediaUrl: options?.media ? (typeof options.media === 'string' ? options.media : undefined) : undefined,
      mediaMimeType: options?.mediaMimeType,
    };

    this.events.emit('event', {
      type: EventType.MESSAGE_SENT,
      sessionId: this.currentSessionId!,
      timestamp: new Date(),
      data: message,
    });

    return message;
  }

  /**
   * Send a mock reaction
   */
  async sendReaction(_messageId: string, _emoji: string): Promise<void> {
    if (!this._connected) {
      throw new Error('Not connected');
    }

    // Mock implementation - just succeed
    await this.sleep(this.options.sendDelay);
  }

  /**
   * Get mock QR code
   */
  async getQR(): Promise<string | null> {
    return this.qrCode;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get mock phone number
   */
  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  /**
   * Simulate receiving a message
   */
  simulateIncomingMessage(from: string, content: string): void {
    if (!this._connected) {
      return;
    }

    const message: Message = {
      id: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      from,
      to: this.phoneNumber ?? '',
      type: MessageType.TEXT,
      content,
      timestamp: new Date(),
      isGroup: from.includes('@g.us'),
      groupId: from.includes('@g.us') ? from : undefined,
    };

    this.events.emit('message', message);
    this.events.emit('event', {
      type: EventType.MESSAGE_RECEIVED,
      sessionId: this.currentSessionId!,
      timestamp: new Date(),
      data: message,
    });
  }

  /**
   * Simulate disconnect
   */
  simulateDisconnect(reason: string = 'connection_lost'): void {
    this._connected = false;

    this.events.emit('disconnected', { reason, shouldReconnect: true });
    this.events.emit('event', {
      type: EventType.SESSION_DISCONNECTED,
      sessionId: this.currentSessionId!,
      timestamp: new Date(),
      data: { reason, shouldReconnect: true },
    });
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
