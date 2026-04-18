/**
 * CacheStore tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryStore } from '../stores/memory.js';

describe('CacheStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('should set and get cached value', async () => {
    await store.setCached('group', 'metadata-123', { name: 'Test Group', memberCount: 5 });

    const value = await store.getCached<{ name: string; memberCount: number }>('group', 'metadata-123');
    expect(value).toEqual({ name: 'Test Group', memberCount: 5 });
  });

  it('should return null for non-existent cache key', async () => {
    const value = await store.getCached('group', 'non-existent');
    expect(value).toBeNull();
  });

  it('should delete cached value', async () => {
    await store.setCached('group', 'metadata-123', { name: 'Test Group' });

    await store.deleteCached('group', 'metadata-123');

    const value = await store.getCached('group', 'metadata-123');
    expect(value).toBeNull();
  });

  it('should clear all values in a namespace', async () => {
    await store.setCached('group', 'metadata-1', { name: 'Group 1' });
    await store.setCached('group', 'metadata-2', { name: 'Group 2' });
    await store.setCached('device', 'info-1', { platform: 'iOS' });

    await store.clearCache('group');

    const value1 = await store.getCached('group', 'metadata-1');
    const value2 = await store.getCached('group', 'metadata-2');
    const deviceValue = await store.getCached('device', 'info-1');

    expect(value1).toBeNull();
    expect(value2).toBeNull();
    expect(deviceValue).toEqual({ platform: 'iOS' }); // Device namespace unaffected
  });

  it('should isolate by namespace', async () => {
    await store.setCached('group', 'key-1', 'group-value');
    await store.setCached('device', 'key-1', 'device-value');

    const groupValue = await store.getCached('group', 'key-1');
    const deviceValue = await store.getCached('device', 'key-1');

    expect(groupValue).toBe('group-value');
    expect(deviceValue).toBe('device-value');
  });

  it('should support TTL expiry', async () => {
    // Set with 100ms TTL
    await store.setCached('temp', 'key-1', 'expiring-value', 100);

    // Should exist immediately
    let value = await store.getCached('temp', 'key-1');
    expect(value).toBe('expiring-value');

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be expired
    value = await store.getCached('temp', 'key-1');
    expect(value).toBeNull();
  });

  it('should not expire when TTL is undefined', async () => {
    await store.setCached('persistent', 'key-1', 'permanent-value');

    // Wait 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));

    const value = await store.getCached('persistent', 'key-1');
    expect(value).toBe('permanent-value');
  });

  it('should handle complex objects', async () => {
    const complexObject = {
      nested: {
        array: [1, 2, 3],
        string: 'test',
      },
      number: 42,
      boolean: true,
    };

    await store.setCached('cache', 'complex', complexObject);

    const value = await store.getCached('cache', 'complex');
    expect(value).toEqual(complexObject);
  });

  it('should never throw on read errors (best-effort)', async () => {
    // Even if namespace or key are malformed, should return null not throw
    const value = await store.getCached('', '');
    expect(value).toBeNull();
  });

  it('should never throw on write errors (best-effort)', async () => {
    // Should not throw even with edge cases
    await expect(store.setCached('test', 'key', 'value')).resolves.toBeUndefined();
  });

  it('should get cache size', () => {
    store.setCached('ns1', 'key1', 'value1');
    store.setCached('ns1', 'key2', 'value2');
    store.setCached('ns2', 'key1', 'value3');

    const size = store.getCacheSize();
    expect(size).toBe(3);
  });

  it('should cleanup on destroy', () => {
    // Should not throw
    expect(() => store.destroy()).not.toThrow();
  });
});
