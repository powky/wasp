/**
 * Redis session store
 *
 * Persistent session storage using Redis.
 * Recommended for production multi-instance deployments.
 */

import type { Session, Store } from '../types.js';
import { SessionNotFoundError } from '../errors.js';

// Redis client type - dynamically imported
type RedisClient = any;

/**
 * Redis store configuration
 */
export interface RedisStoreConfig {
  /** Redis host */
  host?: string;
  /** Redis port */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number */
  db?: number;
  /** Key prefix */
  keyPrefix?: string;
  /** Session TTL (seconds) - 0 for no expiry */
  ttl?: number;
}

/**
 * Redis session store
 *
 * Uses ioredis for Redis connectivity.
 * Sessions are stored as JSON with optional TTL.
 * Uses SCAN for listing (not KEYS) to avoid blocking.
 *
 * @example
 * ```typescript
 * import { RedisStore } from '@wasp/core/stores/redis';
 *
 * const store = new RedisStore({
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'wasp:session:',
 *   ttl: 86400, // 24 hours
 * });
 * ```
 */
export class RedisStore implements Store {
  private redis: RedisClient | null = null;
  private config: Required<RedisStoreConfig>;
  private initPromise: Promise<void> | null = null;

  constructor(config?: RedisStoreConfig) {
    this.config = {
      host: config?.host ?? 'localhost',
      port: config?.port ?? 6379,
      password: config?.password ?? '',
      db: config?.db ?? 0,
      keyPrefix: config?.keyPrefix ?? 'wasp:session:',
      ttl: config?.ttl ?? 0, // 0 = no expiry
    };

    // Initialize Redis client - lazy loaded
    this.initPromise = this.initializeRedis();
  }

  /**
   * Initialize Redis client (dynamic import for optional peer dependency)
   */
  private async initializeRedis(): Promise<void> {
    try {
      const module = await import('ioredis');
      const Redis = module.default || module;
      this.redis = new (Redis as any)({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password || undefined,
        db: this.config.db,
        lazyConnect: false,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      await this.redis.ping();
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('ioredis not installed. Run: npm install ioredis');
      }
      throw error;
    }
  }

  /**
   * Ensure Redis is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  /**
   * Get Redis key with prefix
   */
  private getKey(id: string): string {
    return `${this.config.keyPrefix}${id}`;
  }

  /**
   * Serialize session to JSON (handle Date fields)
   */
  private serialize(session: Session): string {
    return JSON.stringify(session, (_key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  /**
   * Deserialize session from JSON (restore Date fields)
   */
  private deserialize(data: string): Session {
    const session = JSON.parse(data);
    if (session.createdAt) session.createdAt = new Date(session.createdAt);
    if (session.connectedAt) session.connectedAt = new Date(session.connectedAt);
    if (session.lastActivityAt) session.lastActivityAt = new Date(session.lastActivityAt);
    return session;
  }

  /**
   * Save session to Redis
   */
  async save(session: Session): Promise<void> {
    await this.ensureInitialized();
    if (!this.redis) throw new Error('Redis not initialized');

    const key = this.getKey(session.id);
    const value = this.serialize(session);

    if (this.config.ttl > 0) {
      await this.redis.set(key, value, 'EX', this.config.ttl);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Load session from Redis
   */
  async load(id: string): Promise<Session | null> {
    await this.ensureInitialized();
    if (!this.redis) throw new Error('Redis not initialized');

    const key = this.getKey(id);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return this.deserialize(data);
    } catch {
      return null;
    }
  }

  /**
   * Delete session from Redis
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.redis) throw new Error('Redis not initialized');

    const key = this.getKey(id);
    await this.redis.del(key);
  }

  /**
   * List all sessions matching filter
   * Uses SCAN to avoid blocking (not KEYS)
   */
  async list(filter?: Partial<Session>, limit?: number, offset?: number): Promise<Session[]> {
    await this.ensureInitialized();
    if (!this.redis) throw new Error('Redis not initialized');

    const pattern = this.getKey('*');
    const keys: string[] = [];

    // Use SCAN cursor to avoid blocking (prevents Redis from being blocked on large datasets)
    let cursor = '0';
    do {
      const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    if (keys.length === 0) {
      return [];
    }

    // Get all sessions in parallel
    const values = await this.redis.mget(keys);
    const sessions: Session[] = [];

    for (const value of values) {
      if (!value) continue;

      try {
        const session = this.deserialize(value);

        // Apply filter
        if (filter) {
          let matches = true;
          for (const [key, val] of Object.entries(filter)) {
            if (session[key as keyof Session] !== val) {
              matches = false;
              break;
            }
          }
          if (!matches) continue;
        }

        sessions.push(session);
      } catch {
        // Skip invalid sessions
        continue;
      }
    }

    // Apply pagination
    let result = sessions;
    if (offset !== undefined && offset > 0) {
      result = result.slice(offset);
    }
    if (limit !== undefined && limit > 0) {
      result = result.slice(0, limit);
    }

    return result;
  }

  /**
   * Check if session exists
   */
  async exists(id: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.redis) throw new Error('Redis not initialized');

    const key = this.getKey(id);
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Update session metadata
   */
  async update(id: string, updates: Partial<Session>): Promise<void> {
    const session = await this.load(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }

    const updated = { ...session, ...updates };
    await this.save(updated);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
