/**
 * CredentialStore tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../stores/memory.js';

describe('CredentialStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('should save and load string credential', async () => {
    await store.saveCredential('session-1', 'auth-token', 'secret-token-123');

    const value = await store.loadCredential('session-1', 'auth-token');
    expect(value).toBe('secret-token-123');
  });

  it('should save and load Buffer credential', async () => {
    const buffer = Buffer.from('binary-data');

    await store.saveCredential('session-1', 'device-key', buffer);

    const value = await store.loadCredential('session-1', 'device-key');
    expect(Buffer.isBuffer(value)).toBe(true);
    expect(value?.toString()).toBe('binary-data');
  });

  it('should return null for non-existent credential', async () => {
    const value = await store.loadCredential('session-1', 'non-existent');
    expect(value).toBeNull();
  });

  it('should delete credential', async () => {
    await store.saveCredential('session-1', 'auth-token', 'secret');

    await store.deleteCredential('session-1', 'auth-token');

    const value = await store.loadCredential('session-1', 'auth-token');
    expect(value).toBeNull();
  });

  it('should list credential keys', async () => {
    await store.saveCredential('session-1', 'auth-token', 'token1');
    await store.saveCredential('session-1', 'device-key', 'key1');
    await store.saveCredential('session-1', 'refresh-token', 'refresh1');

    const keys = await store.listCredentialKeys('session-1');
    expect(keys).toHaveLength(3);
    expect(keys).toContain('auth-token');
    expect(keys).toContain('device-key');
    expect(keys).toContain('refresh-token');
  });

  it('should return empty array for session with no credentials', async () => {
    const keys = await store.listCredentialKeys('session-1');
    expect(keys).toEqual([]);
  });

  it('should clear all credentials for a session', async () => {
    await store.saveCredential('session-1', 'auth-token', 'token1');
    await store.saveCredential('session-1', 'device-key', 'key1');

    await store.clearCredentials('session-1');

    const keys = await store.listCredentialKeys('session-1');
    expect(keys).toEqual([]);
  });

  it('should isolate credentials by session ID', async () => {
    await store.saveCredential('session-1', 'auth-token', 'token1');
    await store.saveCredential('session-2', 'auth-token', 'token2');

    const value1 = await store.loadCredential('session-1', 'auth-token');
    const value2 = await store.loadCredential('session-2', 'auth-token');

    expect(value1).toBe('token1');
    expect(value2).toBe('token2');
  });

  it('should update existing credential', async () => {
    await store.saveCredential('session-1', 'auth-token', 'old-token');

    await store.saveCredential('session-1', 'auth-token', 'new-token');

    const value = await store.loadCredential('session-1', 'auth-token');
    expect(value).toBe('new-token');
  });

  it('should get total credential count', () => {
    store.saveCredential('session-1', 'auth-token', 'token1');
    store.saveCredential('session-1', 'device-key', 'key1');
    store.saveCredential('session-2', 'auth-token', 'token2');

    const count = store.getTotalCredentialCount();
    expect(count).toBe(3);
  });
});
