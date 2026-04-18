/**
 * ClockSync tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClockSync } from '../clock-sync.js';

describe('ClockSync', () => {
  let clockSync: ClockSync;

  beforeEach(() => {
    clockSync = new ClockSync();
  });

  it('should initialize with zero skew', () => {
    const stats = clockSync.getStats();
    expect(stats.skewMs).toBe(0);
    expect(stats.sampleCount).toBe(0);
    expect(stats.confidence).toBe('low');
  });

  it('should record samples and calculate skew', () => {
    const now = Date.now();

    // Simulate server 100ms ahead of local
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50, // 50ms RTT
      serverTimestamp: now + 25 + 100, // midpoint + 100ms skew
    });

    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 150,
      serverTimestamp: now + 125 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 200,
      localReceivedAt: now + 250,
      serverTimestamp: now + 225 + 100,
    });

    const stats = clockSync.getStats();
    expect(stats.sampleCount).toBe(3);
    expect(stats.skewMs).toBe(100); // Server is 100ms ahead
    expect(stats.confidence).toBe('medium'); // 3-9 samples
  });

  it('should use median to resist outliers', () => {
    const now = Date.now();

    // Most samples have 100ms skew
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 150,
      serverTimestamp: now + 125 + 100,
    });

    // Outlier with 500ms skew
    clockSync.recordSample({
      localSentAt: now + 200,
      localReceivedAt: now + 250,
      serverTimestamp: now + 225 + 500,
    });

    clockSync.recordSample({
      localSentAt: now + 300,
      localReceivedAt: now + 350,
      serverTimestamp: now + 325 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 400,
      localReceivedAt: now + 450,
      serverTimestamp: now + 425 + 100,
    });

    const stats = clockSync.getStats();
    // Median should be 100, not affected by 500ms outlier
    expect(stats.skewMs).toBe(100);
  });

  it('should maintain rolling window', () => {
    const clockSync = new ClockSync({ sampleWindowSize: 3 });
    const now = Date.now();

    // Add 5 samples (window size = 3, so only last 3 should be kept)
    for (let i = 0; i < 5; i++) {
      clockSync.recordSample({
        localSentAt: now + i * 100,
        localReceivedAt: now + i * 100 + 50,
        serverTimestamp: now + i * 100 + 25 + 100,
      });
    }

    const stats = clockSync.getStats();
    expect(stats.sampleCount).toBe(3);
  });

  it('should return low confidence with insufficient samples', () => {
    const clockSync = new ClockSync({ minRttSamples: 5 });
    const now = Date.now();

    // Add only 2 samples (below minRttSamples)
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 150,
      serverTimestamp: now + 125 + 100,
    });

    const stats = clockSync.getStats();
    expect(stats.skewMs).toBe(0); // Insufficient samples
    expect(stats.confidence).toBe('low');
  });

  it('should return high confidence with many samples and low variance', () => {
    const now = Date.now();

    // Add 10 samples with consistent 100ms skew
    for (let i = 0; i < 10; i++) {
      clockSync.recordSample({
        localSentAt: now + i * 100,
        localReceivedAt: now + i * 100 + 50,
        serverTimestamp: now + i * 100 + 25 + 100,
      });
    }

    const stats = clockSync.getStats();
    expect(stats.sampleCount).toBe(10);
    expect(stats.skewMs).toBe(100);
    expect(stats.confidence).toBe('high'); // 10+ samples with low stddev
  });

  it('should adjust local time to server time', () => {
    const now = Date.now();

    // Server is 100ms ahead
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 150,
      serverTimestamp: now + 125 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 200,
      localReceivedAt: now + 250,
      serverTimestamp: now + 225 + 100,
    });

    const localTime = now + 1000;
    const serverTime = clockSync.toServerTime(localTime);

    expect(serverTime).toBe(localTime + 100);
  });

  it('should adjust server time to local time', () => {
    const now = Date.now();

    // Server is 100ms ahead
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 150,
      serverTimestamp: now + 125 + 100,
    });

    clockSync.recordSample({
      localSentAt: now + 200,
      localReceivedAt: now + 250,
      serverTimestamp: now + 225 + 100,
    });

    const serverTime = now + 1000;
    const localTime = clockSync.toLocalTime(serverTime);

    expect(localTime).toBe(serverTime - 100);
  });

  it('should reset samples', () => {
    const now = Date.now();

    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25 + 100,
    });

    expect(clockSync.getStats().sampleCount).toBe(1);

    clockSync.reset();

    const stats = clockSync.getStats();
    expect(stats.sampleCount).toBe(0);
    expect(stats.skewMs).toBe(0);
    expect(stats.lastUpdatedAt).toBe(0);
  });

  it('should calculate estimated RTT', () => {
    const now = Date.now();

    // RTT of 50ms
    clockSync.recordSample({
      localSentAt: now,
      localReceivedAt: now + 50,
      serverTimestamp: now + 25,
    });

    // RTT of 60ms
    clockSync.recordSample({
      localSentAt: now + 100,
      localReceivedAt: now + 160,
      serverTimestamp: now + 130,
    });

    // RTT of 40ms
    clockSync.recordSample({
      localSentAt: now + 200,
      localReceivedAt: now + 240,
      serverTimestamp: now + 220,
    });

    const stats = clockSync.getStats();
    expect(stats.estimatedRttMs).toBe(50); // Median of [40, 50, 60]
  });

  it('should update lastUpdatedAt when recording samples', () => {
    const beforeTime = Date.now();

    clockSync.recordSample({
      localSentAt: beforeTime,
      localReceivedAt: beforeTime + 50,
      serverTimestamp: beforeTime + 25,
    });

    const stats = clockSync.getStats();
    expect(stats.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTime);
    expect(stats.lastUpdatedAt).toBeLessThanOrEqual(Date.now());
  });
});
