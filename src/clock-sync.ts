/**
 * Clock synchronization utility
 *
 * RTT-adjusted clock sync inspired by jlucaso1/whatsapp-rust's unified_session approach.
 * Calculates server-to-local time skew using rolling median to resist outliers.
 */

import type { ClockSyncConfig, ClockSyncSample, ClockSyncStats } from './types.js';

/**
 * Clock synchronization manager
 *
 * Maintains a rolling window of RTT samples to estimate clock skew between
 * local and server time. Uses median of skew measurements to resist outliers.
 *
 * @example
 * ```typescript
 * const clockSync = new ClockSync({ sampleWindowSize: 10 });
 *
 * // When you get a server timestamp from a request/response round-trip:
 * clockSync.recordSample({
 *   localSentAt: Date.now(),
 *   localReceivedAt: Date.now() + 100,
 *   serverTimestamp: serverTime
 * });
 *
 * // Adjust local time to server time:
 * const serverTime = clockSync.toServerTime(Date.now());
 *
 * // Get stats:
 * const stats = clockSync.getStats();
 * console.log(`Skew: ${stats.skewMs}ms, Confidence: ${stats.confidence}`);
 * ```
 */
export class ClockSync {
  private config: Required<ClockSyncConfig>;
  private samples: Array<{ rtt: number; skew: number }> = [];
  private lastUpdatedAt: number = 0;

  constructor(config?: ClockSyncConfig) {
    this.config = {
      sampleWindowSize: config?.sampleWindowSize ?? 10,
      minRttSamples: config?.minRttSamples ?? 3,
    };
  }

  /**
   * Record a new clock sync sample
   *
   * Calculates RTT and skew from the round-trip, adds to rolling window.
   *
   * @param sample Clock sync sample
   */
  recordSample(sample: ClockSyncSample): void {
    const rtt = sample.localReceivedAt - sample.localSentAt;
    const midpoint = sample.localSentAt + rtt / 2;
    const skew = sample.serverTimestamp - midpoint;

    this.samples.push({ rtt, skew });

    // Keep only the most recent samples (rolling window)
    if (this.samples.length > this.config.sampleWindowSize) {
      this.samples.shift();
    }

    this.lastUpdatedAt = Date.now();
  }

  /**
   * Get estimated clock skew in milliseconds
   *
   * Returns median skew from all samples (resists outliers).
   * Returns 0 if insufficient samples.
   *
   * @returns Skew in ms (negative = local ahead, positive = local behind)
   */
  getSkewMs(): number {
    if (this.samples.length < this.config.minRttSamples) {
      return 0;
    }

    const skews = this.samples.map((s) => s.skew).sort((a, b) => a - b);
    return this.median(skews);
  }

  /**
   * Adjust local timestamp to server-aligned time
   *
   * @param localMs Local timestamp in milliseconds
   * @returns Server-aligned timestamp
   */
  toServerTime(localMs: number): number {
    const skew = this.getSkewMs();
    return localMs + skew;
  }

  /**
   * Adjust server timestamp to local-aligned time
   *
   * @param serverMs Server timestamp in milliseconds
   * @returns Local-aligned timestamp
   */
  toLocalTime(serverMs: number): number {
    const skew = this.getSkewMs();
    return serverMs - skew;
  }

  /**
   * Get clock sync statistics
   *
   * @returns Current statistics
   */
  getStats(): ClockSyncStats {
    const sampleCount = this.samples.length;
    const skewMs = this.getSkewMs();

    // Calculate median RTT
    const rtts = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    const estimatedRttMs = this.median(rtts);

    // Calculate confidence
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (sampleCount >= this.config.minRttSamples) {
      const skewStdDev = this.standardDeviation(this.samples.map((s) => s.skew));

      if (sampleCount >= 10 && skewStdDev < 500) {
        confidence = 'high';
      } else if (sampleCount >= 3) {
        confidence = 'medium';
      }
    }

    return {
      skewMs,
      estimatedRttMs,
      sampleCount,
      confidence,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }

  /**
   * Reset all samples
   */
  reset(): void {
    this.samples = [];
    this.lastUpdatedAt = 0;
  }

  /**
   * Calculate median of an array
   */
  private median(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Calculate standard deviation of an array
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

    return Math.sqrt(variance);
  }
}
