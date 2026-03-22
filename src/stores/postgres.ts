/**
 * PostgreSQL session store
 *
 * Persistent session storage using PostgreSQL.
 * Recommended for production when you need relational queries.
 */

import type { Session, Store } from '../types.js';

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
 * TODO: Implement using pg
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
 * Expected table schema:
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
 * ```
 */
export class PostgresStore implements Store {
  private config: Required<PostgresStoreConfig>;

  constructor(config?: PostgresStoreConfig) {
    this.config = {
      connectionString: config?.connectionString ?? '',
      tableName: config?.tableName ?? 'wasp_sessions',
      autoCreate: config?.autoCreate ?? false,
    };

    // TODO: Initialize pg client/pool
    throw new Error('PostgresStore not yet implemented. Use MemoryStore for now.');
  }

  async save(session: Session): Promise<void> {
    // TODO: Implement
    // INSERT INTO wasp_sessions ... ON CONFLICT (id) DO UPDATE ...
    throw new Error('Not implemented');
  }

  async load(id: string): Promise<Session | null> {
    // TODO: Implement
    // SELECT * FROM wasp_sessions WHERE id = $1
    throw new Error('Not implemented');
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement
    // DELETE FROM wasp_sessions WHERE id = $1
    throw new Error('Not implemented');
  }

  async list(filter?: Partial<Session>): Promise<Session[]> {
    // TODO: Implement with dynamic WHERE clause
    throw new Error('Not implemented');
  }

  async exists(id: string): Promise<boolean> {
    // TODO: Implement
    // SELECT EXISTS(SELECT 1 FROM wasp_sessions WHERE id = $1)
    throw new Error('Not implemented');
  }

  async update(id: string, updates: Partial<Session>): Promise<void> {
    // TODO: Implement
    // UPDATE wasp_sessions SET ... WHERE id = $1
    throw new Error('Not implemented');
  }
}
