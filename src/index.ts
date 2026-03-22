/**
 * WaSP - WhatsApp Session Protocol
 *
 * A protocol layer for WhatsApp session management and message routing.
 * Provides a unified interface across Baileys, Whatsmeow, and Cloud API.
 *
 * @module @wasp/core
 */

// Main exports
export { WaSP } from './wasp.js';
export { MessageQueue } from './queue.js';

// Types
export type {
  WaspConfig,
  Session,
  Message,
  Provider,
  Store,
  WaspEvent,
  SendMessageOptions,
  QueueOptions,
  Middleware,
  SessionMetadata,
  QuotedMessage,
} from './types.js';

export {
  SessionStatus,
  MessageType,
  EventType,
  ProviderType,
} from './types.js';

// Stores
export { MemoryStore } from './stores/memory.js';
export { RedisStore } from './stores/redis.js';
export type { RedisStoreConfig } from './stores/redis.js';
export { PostgresStore } from './stores/postgres.js';
export type { PostgresStoreConfig } from './stores/postgres.js';

// Providers
export { BaileysProvider } from './providers/baileys.js';
export type { BaileysProviderOptions } from './providers/baileys.js';

// Middleware
export {
  logger,
  autoReconnect,
  rateLimit,
  errorHandler,
} from './middleware.js';
