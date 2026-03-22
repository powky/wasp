/**
 * Core type definitions for WaSP (WhatsApp Session Protocol)
 */

import { EventEmitter } from 'events';

/**
 * Session status enumeration
 */
export enum SessionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  BANNED = 'BANNED',
  THROTTLED = 'THROTTLED',
  ERROR = 'ERROR',
}

/**
 * Message type enumeration
 */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  LOCATION = 'LOCATION',
  CONTACT = 'CONTACT',
  REACTION = 'REACTION',
  STICKER = 'STICKER',
  POLL = 'POLL',
  POLL_UPDATE = 'POLL_UPDATE',
}

/**
 * Event type enumeration
 */
export enum EventType {
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_DELIVERED = 'MESSAGE_DELIVERED',
  MESSAGE_READ = 'MESSAGE_READ',
  SESSION_CONNECTED = 'SESSION_CONNECTED',
  SESSION_DISCONNECTED = 'SESSION_DISCONNECTED',
  SESSION_QR = 'SESSION_QR',
  SESSION_ERROR = 'SESSION_ERROR',
  GROUP_JOIN = 'GROUP_JOIN',
  GROUP_LEAVE = 'GROUP_LEAVE',
  PRESENCE_UPDATE = 'PRESENCE_UPDATE',
}

/**
 * Provider type enumeration
 */
export enum ProviderType {
  BAILEYS = 'BAILEYS',
  WHATSMEOW = 'WHATSMEOW',
  CLOUD_API = 'CLOUD_API',
}

/**
 * Session metadata interface
 */
export interface SessionMetadata {
  /** Organization ID (for multi-tenant applications) */
  orgId?: string;
  /** Application-specific data */
  [key: string]: unknown;
}

/**
 * Session state
 */
export interface Session {
  /** Unique session identifier */
  id: string;
  /** WhatsApp phone number (with country code, e.g., "27821234567") */
  phone?: string;
  /** Current session status */
  status: SessionStatus;
  /** Provider type */
  provider: ProviderType;
  /** Organization ID */
  orgId?: string;
  /** Timestamp when session connected */
  connectedAt?: Date;
  /** Timestamp when session was created */
  createdAt: Date;
  /** Timestamp of last activity */
  lastActivityAt?: Date;
  /** Additional metadata */
  metadata?: SessionMetadata;
}

/**
 * Quoted/replied message reference
 */
export interface QuotedMessage {
  /** Message ID being quoted */
  id: string;
  /** Sender of quoted message */
  from: string;
  /** Content of quoted message */
  content: string;
}

/**
 * Normalized message format
 */
export interface Message {
  /** Unique message identifier */
  id: string;
  /** Sender phone number */
  from: string;
  /** Recipient phone number or group ID */
  to: string;
  /** Message type */
  type: MessageType;
  /** Message content (text, caption, or serialized data) */
  content: string;
  /** Timestamp when message was created */
  timestamp: Date;
  /** Whether message is from a group */
  isGroup: boolean;
  /** Group ID if isGroup is true */
  groupId?: string;
  /** Quoted/replied message */
  quotedMessage?: QuotedMessage;
  /** Media URL (for IMAGE, VIDEO, AUDIO, DOCUMENT) */
  mediaUrl?: string;
  /** Media MIME type */
  mediaMimeType?: string;
  /** Additional provider-specific data */
  raw?: unknown;
}

/**
 * WaSP event
 */
export interface WaspEvent<T = unknown> {
  /** Event type */
  type: EventType;
  /** Session ID that triggered the event */
  sessionId: string;
  /** Event timestamp */
  timestamp: Date;
  /** Event-specific data */
  data: T;
}

/**
 * Message send options
 */
export interface SendMessageOptions {
  /** Message to quote/reply to */
  quoted?: string;
  /** Priority (higher = sent first) */
  priority?: number;
  /** Skip anti-ban queue (use with caution) */
  immediate?: boolean;
  /** Media URL or buffer */
  media?: string | Buffer;
  /** Media MIME type */
  mediaMimeType?: string;
}

/**
 * Queue configuration options
 */
export interface QueueOptions {
  /** Minimum delay between messages (ms) */
  minDelay: number;
  /** Maximum delay between messages (ms) */
  maxDelay: number;
  /** Maximum concurrent message processing */
  maxConcurrent: number;
  /** Enable priority lanes (priority messages skip delay) */
  priorityLanes: boolean;
  /** Maximum queue size per session (0 = unlimited) */
  maxQueueSize?: number;
}

/**
 * Provider interface - must be implemented by all WhatsApp libraries
 */
export interface Provider {
  /** Provider type */
  readonly type: ProviderType;

  /** Event emitter for provider events */
  readonly events: EventEmitter;

  /**
   * Connect to WhatsApp
   * @param sessionId Session identifier
   * @param options Provider-specific connection options
   */
  connect(sessionId: string, options?: unknown): Promise<void>;

  /**
   * Disconnect from WhatsApp
   */
  disconnect(): Promise<void>;

  /**
   * Send a message
   * @param to Recipient phone number or group ID
   * @param content Message content
   * @param options Send options
   */
  sendMessage(
    to: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<Message>;

  /**
   * Send a reaction to a message
   * @param messageId Message ID to react to
   * @param emoji Reaction emoji
   */
  sendReaction(messageId: string, emoji: string): Promise<void>;

  /**
   * Get QR code for authentication (if applicable)
   */
  getQR?(): Promise<string | null>;

  /**
   * Check if provider is connected
   */
  isConnected(): boolean;

  /**
   * Get session phone number
   */
  getPhoneNumber(): string | null;
}

/**
 * Store interface - pluggable session storage
 */
export interface Store {
  /**
   * Save session state
   * @param session Session to save
   */
  save(session: Session): Promise<void>;

  /**
   * Load session state
   * @param id Session ID
   */
  load(id: string): Promise<Session | null>;

  /**
   * Delete session state
   * @param id Session ID
   */
  delete(id: string): Promise<void>;

  /**
   * List all sessions
   * @param filter Optional filter criteria
   * @param limit Optional limit on number of results
   * @param offset Optional offset for pagination
   */
  list(filter?: Partial<Session>, limit?: number, offset?: number): Promise<Session[]>;

  /**
   * Check if session exists
   * @param id Session ID
   */
  exists(id: string): Promise<boolean>;

  /**
   * Update session metadata
   * @param id Session ID
   * @param updates Partial session updates
   */
  update(id: string, updates: Partial<Session>): Promise<void>;
}

/**
 * WaSP configuration
 */
export interface WaspConfig {
  /** Session store (defaults to in-memory) */
  store?: Store;

  /** Message queue options */
  queue?: Partial<QueueOptions>;

  /** Default provider options */
  defaultProvider?: ProviderType;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom logger */
  logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}

/**
 * Middleware function type
 */
export interface Middleware {
  (event: WaspEvent, next: () => Promise<void>): Promise<void>;
}

/**
 * Message queue item
 */
export interface QueueItem {
  /** Session ID */
  sessionId: string;
  /** Recipient */
  to: string;
  /** Message content */
  content: string;
  /** Send options */
  options?: SendMessageOptions;
  /** Promise resolve - can return void or Promise<Message> */
  resolve: (message?: Message) => void | Promise<Message>;
  /** Promise reject */
  reject: (error: Error) => void;
  /** Timestamp when queued */
  queuedAt: Date;
  /** Priority */
  priority: number;
}
