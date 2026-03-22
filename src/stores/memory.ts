/**
 * In-memory session store
 *
 * Simple Map-based store for development and testing.
 * NOT recommended for production - sessions are lost on restart.
 */

import type { Session, Store } from '../types.js';

/**
 * In-memory session store
 */
export class MemoryStore implements Store {
  private sessions: Map<string, Session> = new Map();

  /**
   * Save session state
   */
  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  /**
   * Load session state
   */
  async load(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  /**
   * Delete session state
   */
  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  /**
   * List all sessions
   */
  async list(filter?: Partial<Session>): Promise<Session[]> {
    let sessions = Array.from(this.sessions.values());

    // Apply filters if provided
    if (filter) {
      sessions = sessions.filter((session) => {
        for (const [key, value] of Object.entries(filter)) {
          if (session[key as keyof Session] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Return copies to prevent external mutation
    return sessions.map((s) => ({ ...s }));
  }

  /**
   * Check if session exists
   */
  async exists(id: string): Promise<boolean> {
    return this.sessions.has(id);
  }

  /**
   * Update session metadata
   */
  async update(id: string, updates: Partial<Session>): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    // Merge updates
    Object.assign(session, updates);
    this.sessions.set(id, session);
  }

  /**
   * Clear all sessions (useful for testing)
   */
  async clear(): Promise<void> {
    this.sessions.clear();
  }

  /**
   * Get session count
   */
  get size(): number {
    return this.sessions.size;
  }
}
