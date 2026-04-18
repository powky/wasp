/**
 * Backend composition tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../stores/memory.js';
import type { Session, SessionStatus, ProviderType } from '../types.js';

describe('Backend Composition', () => {
  let backend: MemoryStore;

  beforeEach(() => {
    backend = new MemoryStore();
  });

  it('should implement all four store interfaces', () => {
    // SessionStore methods
    expect(typeof backend.save).toBe('function');
    expect(typeof backend.load).toBe('function');
    expect(typeof backend.delete).toBe('function');
    expect(typeof backend.list).toBe('function');
    expect(typeof backend.exists).toBe('function');
    expect(typeof backend.update).toBe('function');

    // CredentialStore methods
    expect(typeof backend.saveCredential).toBe('function');
    expect(typeof backend.loadCredential).toBe('function');
    expect(typeof backend.deleteCredential).toBe('function');
    expect(typeof backend.listCredentialKeys).toBe('function');
    expect(typeof backend.clearCredentials).toBe('function');

    // CacheStore methods
    expect(typeof backend.getCached).toBe('function');
    expect(typeof backend.setCached).toBe('function');
    expect(typeof backend.deleteCached).toBe('function');
    expect(typeof backend.clearCache).toBe('function');

    // MetricsStore methods
    expect(typeof backend.increment).toBe('function');
    expect(typeof backend.get).toBe('function');
    expect(typeof backend.getAll).toBe('function');
    expect(typeof backend.reset).toBe('function');
  });

  it('should handle end-to-end session lifecycle with all stores', async () => {
    // 1. Create session
    const session: Session = {
      id: 'session-1',
      status: 'CONNECTED' as SessionStatus,
      provider: 'BAILEYS' as ProviderType,
      phone: '27821234567',
      createdAt: new Date(),
    };

    await backend.save(session);

    // 2. Save credentials
    await backend.saveCredential('session-1', 'auth-token', 'secret-token-123');
    await backend.saveCredential('session-1', 'device-key', Buffer.from('device-key-data'));

    // 3. Cache some data
    await backend.setCached('group', 'metadata-abc', { name: 'Test Group', members: 5 });
    await backend.setCached('device', 'info-xyz', { platform: 'iOS', version: '15.0' });

    // 4. Track metrics
    await backend.increment('session-1', 'messages-sent', 10);
    await backend.increment('session-1', 'messages-received', 5);

    // 5. Verify all data
    const loadedSession = await backend.load('session-1');
    expect(loadedSession?.phone).toBe('27821234567');

    const authToken = await backend.loadCredential('session-1', 'auth-token');
    expect(authToken).toBe('secret-token-123');

    const groupMeta = await backend.getCached('group', 'metadata-abc');
    expect(groupMeta).toEqual({ name: 'Test Group', members: 5 });

    const metrics = await backend.getAll('session-1');
    expect(metrics['messages-sent']).toBe(10);
    expect(metrics['messages-received']).toBe(5);
  });

  it('should cleanup session across all stores', async () => {
    const session: Session = {
      id: 'session-1',
      status: 'CONNECTED' as SessionStatus,
      provider: 'BAILEYS' as ProviderType,
      createdAt: new Date(),
    };

    await backend.save(session);
    await backend.saveCredential('session-1', 'auth-token', 'token');
    await backend.increment('session-1', 'counter', 5);

    // Delete session
    await backend.delete('session-1');

    // Clear credentials
    await backend.clearCredentials('session-1');

    // Reset metrics
    await backend.reset('session-1');

    // Verify cleanup
    const loadedSession = await backend.load('session-1');
    expect(loadedSession).toBeNull();

    const creds = await backend.listCredentialKeys('session-1');
    expect(creds).toEqual([]);

    const metrics = await backend.getAll('session-1');
    expect(metrics).toEqual({});
  });

  it('should handle multiple sessions independently', async () => {
    // Session 1
    const session1: Session = {
      id: 'session-1',
      status: 'CONNECTED' as SessionStatus,
      provider: 'BAILEYS' as ProviderType,
      createdAt: new Date(),
    };

    await backend.save(session1);
    await backend.saveCredential('session-1', 'token', 'token-1');
    await backend.increment('session-1', 'messages', 10);

    // Session 2
    const session2: Session = {
      id: 'session-2',
      status: 'DISCONNECTED' as SessionStatus,
      provider: 'CLOUD_API' as ProviderType,
      createdAt: new Date(),
    };

    await backend.save(session2);
    await backend.saveCredential('session-2', 'token', 'token-2');
    await backend.increment('session-2', 'messages', 20);

    // Verify isolation
    const token1 = await backend.loadCredential('session-1', 'token');
    const token2 = await backend.loadCredential('session-2', 'token');

    expect(token1).toBe('token-1');
    expect(token2).toBe('token-2');

    const metrics1 = await backend.getAll('session-1');
    const metrics2 = await backend.getAll('session-2');

    expect(metrics1.messages).toBe(10);
    expect(metrics2.messages).toBe(20);
  });

  it('should support cache namespacing across sessions', async () => {
    // Session 1 caches in 'group' namespace
    await backend.setCached('group', 'meta-1', { sessionId: 'session-1', data: 'group-1' });

    // Session 2 caches in same 'group' namespace
    await backend.setCached('group', 'meta-2', { sessionId: 'session-2', data: 'group-2' });

    // Session 1 also caches in 'device' namespace
    await backend.setCached('device', 'info-1', { sessionId: 'session-1', platform: 'iOS' });

    // Clear 'group' namespace should affect both sessions
    await backend.clearCache('group');

    const groupMeta1 = await backend.getCached('group', 'meta-1');
    const groupMeta2 = await backend.getCached('group', 'meta-2');
    const deviceInfo = await backend.getCached('device', 'info-1');

    expect(groupMeta1).toBeNull();
    expect(groupMeta2).toBeNull();
    expect(deviceInfo).toEqual({ sessionId: 'session-1', platform: 'iOS' });
  });

  it('should provide statistics across all stores', () => {
    backend.save({ id: 'session-1', status: 'CONNECTED' as SessionStatus, provider: 'BAILEYS' as ProviderType, createdAt: new Date() });
    backend.save({ id: 'session-2', status: 'DISCONNECTED' as SessionStatus, provider: 'CLOUD_API' as ProviderType, createdAt: new Date() });

    backend.saveCredential('session-1', 'token', 'token1');
    backend.saveCredential('session-1', 'key', 'key1');
    backend.saveCredential('session-2', 'token', 'token2');

    backend.setCached('cache', 'key1', 'value1');
    backend.setCached('cache', 'key2', 'value2');

    expect(backend.size).toBe(2); // 2 sessions
    expect(backend.getTotalCredentialCount()).toBe(3); // 3 credentials
    expect(backend.getCacheSize()).toBe(2); // 2 cache entries
  });
});
