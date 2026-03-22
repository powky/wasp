/**
 * PostgreSQL session store
 *
 * Persistent session storage using PostgreSQL.
 * Recommended for production when you need relational queries.
 */

import type { Session, Store, SessionStatus, ProviderType } from '../types.js';
import { InvalidTableNameError, SessionNotFoundError } from '../errors.js';

// PostgreSQL client type - dynamically imported
type PgPool = any;

/**
 * PostgreSQL store configuration
 */
export interface PostgresStoreConfig {
  /** PostgreSQL connection string */
  connectionString?: string;
  /** Table name */
  tableName?: string;
  /** Auto-create table if not exists */
  autoCreate?: boolean;
}

/**
 * PostgreSQL session store
 *
 * Uses pg connection pool for optimal performance.
 * Auto-creates table schema if autoCreate is enabled.
 *
 * @example
 * ```typescript
 * import { PostgresStore } from '@wasp/core/stores/postgres';
 *
 * const store = new PostgresStore({
 *   connectionString: 'postgresql://user:pass@localhost/wasp',
 *   tableName: 'wasp_sessions',
 *   autoCreate: true,
 * });
 * ```
 *
 * Table schema:
 * ```sql
 * CREATE TABLE wasp_sessions (
 *   id VARCHAR(255) PRIMARY KEY,
 *   phone VARCHAR(50),
 *   status VARCHAR(50) NOT NULL,
 *   provider VARCHAR(50) NOT NULL,
 *   org_id VARCHAR(255),
 *   connected_at TIMESTAMP,
 *   created_at TIMESTAMP NOT NULL,
 *   last_activity_at TIMESTAMP,
 *   metadata JSONB
 * );
 * CREATE INDEX idx_wasp_sessions_org_id ON wasp_sessions(org_id);
 * CREATE INDEX idx_wasp_sessions_status ON wasp_sessions(status);
 * ```
 */
export class PostgresStore implements Store {
  private pool: PgPool | null = null;
  private config: Required<PostgresStoreConfig>;
  private initPromise: Promise<void> | null = null;

  constructor(config?: PostgresStoreConfig) {
    const tableName = config?.tableName ?? 'wasp_sessions';

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new InvalidTableNameError(tableName);
    }

    this.config = {
      connectionString: config?.connectionString ?? 'postgresql://localhost/wasp',
      tableName,
      autoCreate: config?.autoCreate ?? false,
    };

    this.initPromise = this.initializePool();
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  private async initializePool(): Promise<void> {
    try {
      const module = await import('pg');
      const Pool = (module as any).Pool || module.default?.Pool;
      this.pool = new Pool({
        connectionString: this.config.connectionString,
      });

      // Test connection
      await this.pool.query('SELECT NOW()');

      if (this.config.autoCreate) {
        await this.createTableIfNotExists();
      }
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('pg not installed. Run: npm install pg');
      }
      throw error;
    }
  }

  /**
   * Ensure pool is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  /**
   * Create table and indexes if they don't exist
   */
  private async createTableIfNotExists(): Promise<void> {
    if (!this.pool) throw new Error('Pool not initialized');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        phone VARCHAR(50),
        status VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        org_id VARCHAR(255),
        connected_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL,
        last_activity_at TIMESTAMP,
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_org_id
        ON ${this.config.tableName}(org_id);

      CREATE INDEX IF NOT EXISTS idx_${this.config.tableName}_status
        ON ${this.config.tableName}(status);
    `;

    await this.pool.query(createTableSQL);
  }

  /**
   * Save session (upsert)
   */
  async save(session: Session): Promise<void> {
    await this.ensureInitialized();
    if (!this.pool) throw new Error('Pool not initialized');

    const sql = `
      INSERT INTO ${this.config.tableName}
        (id, phone, status, provider, org_id, connected_at, created_at, last_activity_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id)
      DO UPDATE SET
        phone = EXCLUDED.phone,
        status = EXCLUDED.status,
        provider = EXCLUDED.provider,
        org_id = EXCLUDED.org_id,
        connected_at = EXCLUDED.connected_at,
        last_activity_at = EXCLUDED.last_activity_at,
        metadata = EXCLUDED.metadata
    `;

    await this.pool.query(sql, [
      session.id,
      session.phone ?? null,
      session.status,
      session.provider,
      session.orgId ?? null,
      session.connectedAt ?? null,
      session.createdAt,
      session.lastActivityAt ?? null,
      JSON.stringify(session.metadata ?? {}),
    ]);
  }

  /**
   * Load session by ID
   */
  async load(id: string): Promise<Session | null> {
    await this.ensureInitialized();
    if (!this.pool) throw new Error('Pool not initialized');

    const sql = `SELECT * FROM ${this.config.tableName} WHERE id = $1`;
    const result = await this.pool.query(sql, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.pool) throw new Error('Pool not initialized');

    const sql = `DELETE FROM ${this.config.tableName} WHERE id = $1`;
    await this.pool.query(sql, [id]);
  }

  /**
   * List sessions with optional filter
   */
  async list(filter?: Partial<Session>, limit?: number, offset?: number): Promise<Session[]> {
    await this.ensureInitialized();
    if (!this.pool) throw new Error('Pool not initialized');

    let sql = `SELECT * FROM ${this.config.tableName}`;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramCount = 1;

    if (filter) {
      if (filter.status !== undefined) {
        conditions.push(`status = $${paramCount++}`);
        params.push(filter.status);
      }

      if (filter.provider !== undefined) {
        conditions.push(`provider = $${paramCount++}`);
        params.push(filter.provider);
      }

      if (filter.orgId !== undefined) {
        conditions.push(`org_id = $${paramCount++}`);
        params.push(filter.orgId);
      }

      if (filter.phone !== undefined) {
        conditions.push(`phone = $${paramCount++}`);
        params.push(filter.phone);
      }

      if (filter.id !== undefined) {
        conditions.push(`id = $${paramCount++}`);
        params.push(filter.id);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
    }

    sql += ' ORDER BY created_at DESC';

    // Add pagination
    if (limit !== undefined && limit > 0) {
      sql += ` LIMIT $${paramCount++}`;
      params.push(limit);
    }

    if (offset !== undefined && offset > 0) {
      sql += ` OFFSET $${paramCount++}`;
      params.push(offset);
    }

    const result = await this.pool.query(sql, params);
    return result.rows.map(this.rowToSession);
  }

  /**
   * Check if session exists
   */
  async exists(id: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.pool) throw new Error('Pool not initialized');

    const sql = `SELECT EXISTS(SELECT 1 FROM ${this.config.tableName} WHERE id = $1)`;
    const result = await this.pool.query(sql, [id]);
    return result.rows[0]?.exists ?? false;
  }

  /**
   * Update session
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
   * Convert database row to Session object
   */
  private rowToSession(row: any): Session {
    return {
      id: row.id,
      phone: row.phone ?? undefined,
      status: row.status as SessionStatus,
      provider: row.provider as ProviderType,
      orgId: row.org_id ?? undefined,
      connectedAt: row.connected_at ? new Date(row.connected_at) : undefined,
      createdAt: new Date(row.created_at),
      lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at) : undefined,
      metadata: row.metadata ?? {},
    };
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
