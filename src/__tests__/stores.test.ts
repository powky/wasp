/**
 * Store tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../stores/memory.js';
import type { Session, SessionStatus, ProviderType } from '../types.js';

describe('Stores', () => {
  describe('MemoryStore', () => {
    let store: MemoryStore;

    beforeEach(() => {
      store = new MemoryStore();
    });

    it('should save a session', async () => {
      const session: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);

      const loaded = await store.load('session-1');
      expect(loaded).toEqual(session);
    });

    it('should load a session', async () => {
      const session: Session = {
        id: 'session-1',
        phone: '27821234567',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);

      const loaded = await store.load('session-1');
      expect(loaded?.id).toBe('session-1');
      expect(loaded?.phone).toBe('27821234567');
    });

    it('should return null for non-existent session', async () => {
      const loaded = await store.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('should delete a session', async () => {
      const session: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);
      await store.delete('session-1');

      const loaded = await store.load('session-1');
      expect(loaded).toBeNull();
    });

    it('should list all sessions', async () => {
      const session1: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      const session2: Session = {
        id: 'session-2',
        status: 'DISCONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session1);
      await store.save(session2);

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
    });

    it('should list sessions with filter', async () => {
      const session1: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        orgId: 'org-1',
        createdAt: new Date(),
      };

      const session2: Session = {
        id: 'session-2',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        orgId: 'org-2',
        createdAt: new Date(),
      };

      await store.save(session1);
      await store.save(session2);

      const filtered = await store.list({ orgId: 'org-1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('session-1');
    });

    it('should check if session exists', async () => {
      const session: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);

      expect(await store.exists('session-1')).toBe(true);
      expect(await store.exists('non-existent')).toBe(false);
    });

    it('should update a session', async () => {
      const session: Session = {
        id: 'session-1',
        status: 'CONNECTING' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);

      await store.update('session-1', {
        status: 'CONNECTED' as SessionStatus,
        phone: '27821234567',
      });

      const updated = await store.load('session-1');
      expect(updated?.status).toBe('CONNECTED');
      expect(updated?.phone).toBe('27821234567');
    });

    it('should throw error when updating non-existent session', async () => {
      await expect(store.update('non-existent', { status: 'CONNECTED' as SessionStatus })).rejects.toThrow(
        'Session non-existent not found'
      );
    });

    it('should clear all sessions', async () => {
      const session1: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      const session2: Session = {
        id: 'session-2',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session1);
      await store.save(session2);

      await store.clear();

      const sessions = await store.list();
      expect(sessions).toHaveLength(0);
      expect(store.size).toBe(0);
    });

    it('should return correct size', async () => {
      expect(store.size).toBe(0);

      const session: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);
      expect(store.size).toBe(1);

      await store.delete('session-1');
      expect(store.size).toBe(0);
    });

    it('should create session copies to prevent external mutation', async () => {
      const session: Session = {
        id: 'session-1',
        status: 'CONNECTED' as SessionStatus,
        provider: 'BAILEYS' as ProviderType,
        createdAt: new Date(),
      };

      await store.save(session);

      const loaded = await store.load('session-1');
      loaded!.phone = '27829999999'; // Mutate

      const reloaded = await store.load('session-1');
      expect(reloaded?.phone).toBeUndefined(); // Original unaffected
    });
  });
});
