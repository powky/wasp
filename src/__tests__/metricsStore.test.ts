/**
 * MetricsStore tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../stores/memory.js';

describe('MetricsStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('should increment metric', async () => {
    await store.increment('session-1', 'messages-sent');

    const value = await store.get('session-1', 'messages-sent');
    expect(value).toBe(1);
  });

  it('should increment by custom delta', async () => {
    await store.increment('session-1', 'bytes-transferred', 1024);

    const value = await store.get('session-1', 'bytes-transferred');
    expect(value).toBe(1024);
  });

  it('should accumulate increments', async () => {
    await store.increment('session-1', 'messages-sent');
    await store.increment('session-1', 'messages-sent');
    await store.increment('session-1', 'messages-sent', 3);

    const value = await store.get('session-1', 'messages-sent');
    expect(value).toBe(5);
  });

  it('should return 0 for non-existent metric', async () => {
    const value = await store.get('session-1', 'non-existent');
    expect(value).toBe(0);
  });

  it('should get all metrics for a session', async () => {
    await store.increment('session-1', 'messages-sent', 10);
    await store.increment('session-1', 'messages-received', 5);
    await store.increment('session-1', 'errors', 2);

    const metrics = await store.getAll('session-1');

    expect(metrics).toEqual({
      'messages-sent': 10,
      'messages-received': 5,
      errors: 2,
    });
  });

  it('should return empty object for session with no metrics', async () => {
    const metrics = await store.getAll('session-1');
    expect(metrics).toEqual({});
  });

  it('should reset specific metric', async () => {
    await store.increment('session-1', 'messages-sent', 10);
    await store.increment('session-1', 'messages-received', 5);

    await store.reset('session-1', 'messages-sent');

    const sentValue = await store.get('session-1', 'messages-sent');
    const receivedValue = await store.get('session-1', 'messages-received');

    expect(sentValue).toBe(0);
    expect(receivedValue).toBe(5); // Unaffected
  });

  it('should reset all metrics for a session', async () => {
    await store.increment('session-1', 'messages-sent', 10);
    await store.increment('session-1', 'messages-received', 5);
    await store.increment('session-1', 'errors', 2);

    await store.reset('session-1');

    const metrics = await store.getAll('session-1');
    expect(metrics).toEqual({});
  });

  it('should isolate metrics by session ID', async () => {
    await store.increment('session-1', 'messages-sent', 10);
    await store.increment('session-2', 'messages-sent', 20);

    const value1 = await store.get('session-1', 'messages-sent');
    const value2 = await store.get('session-2', 'messages-sent');

    expect(value1).toBe(10);
    expect(value2).toBe(20);
  });

  it('should handle negative deltas', async () => {
    await store.increment('session-1', 'balance', 100);
    await store.increment('session-1', 'balance', -30);

    const value = await store.get('session-1', 'balance');
    expect(value).toBe(70);
  });

  it('should handle concurrent increments atomically', async () => {
    // Simulate concurrent increments
    await Promise.all([
      store.increment('session-1', 'counter'),
      store.increment('session-1', 'counter'),
      store.increment('session-1', 'counter'),
      store.increment('session-1', 'counter'),
      store.increment('session-1', 'counter'),
    ]);

    const value = await store.get('session-1', 'counter');
    expect(value).toBe(5);
  });
});
