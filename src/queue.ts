/**
 * Anti-ban message queue
 *
 * Implements human-like delays, rate limiting, and priority lanes
 * to prevent WhatsApp from flagging accounts as spam/bots.
 */

import { EventEmitter } from 'events';
import type { QueueOptions, QueueItem, Message } from './types.js';

/**
 * Default queue configuration
 */
const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  minDelay: 2000, // 2 seconds
  maxDelay: 5000, // 5 seconds
  maxConcurrent: 1, // Process one message at a time per session
  priorityLanes: true,
};

/**
 * Anti-ban message queue
 *
 * Queues messages per session with human-like random delays
 * to avoid WhatsApp rate limiting and ban detection.
 */
export class MessageQueue extends EventEmitter {
  private options: QueueOptions;
  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private lastSent: Map<string, number> = new Map();

  constructor(options?: Partial<QueueOptions>) {
    super();
    this.options = { ...DEFAULT_QUEUE_OPTIONS, ...options };
  }

  /**
   * Add message to queue
   *
   * @param item Queue item
   * @returns Promise that resolves when message is sent
   */
  async enqueue(item: QueueItem): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      const queueItem: QueueItem = {
        ...item,
        resolve,
        reject,
        queuedAt: new Date(),
        priority: item.priority ?? 0,
      };

      // Get or create session queue
      let queue = this.queues.get(item.sessionId);
      if (!queue) {
        queue = [];
        this.queues.set(item.sessionId, queue);
      }

      // Add to queue, sorted by priority (higher first)
      queue.push(queueItem);
      queue.sort((a, b) => b.priority - a.priority);

      this.emit('enqueued', { sessionId: item.sessionId, queueSize: queue.length });

      // Start processing if not already
      if (!this.processing.get(item.sessionId)) {
        this.processQueue(item.sessionId).catch((error) => {
          this.emit('error', { sessionId: item.sessionId, error });
        });
      }
    });
  }

  /**
   * Process queue for a session
   *
   * @param sessionId Session ID
   */
  private async processQueue(sessionId: string): Promise<void> {
    // Mark as processing
    this.processing.set(sessionId, true);

    try {
      const queue = this.queues.get(sessionId);
      if (!queue || queue.length === 0) {
        this.processing.set(sessionId, false);
        return;
      }

      // Get next item
      const item = queue.shift()!;

      // Calculate delay
      const delay = this.calculateDelay(sessionId, item);

      // Wait for delay
      if (delay > 0) {
        this.emit('delay', { sessionId, delay, queueSize: queue.length });
        await this.sleep(delay);
      }

      // Send message (will be handled by the caller's sendFn)
      try {
        this.emit('sending', { sessionId, to: item.to });

        // Note: The actual sending is done by the WaSP instance
        // This queue just manages timing and ordering
        // The resolve/reject will be called by the sender

        this.lastSent.set(sessionId, Date.now());
        this.emit('sent', { sessionId, queueSize: queue.length });
      } catch (error) {
        item.reject(error as Error);
        this.emit('error', { sessionId, error });
      }

      // Continue processing if queue not empty
      if (queue.length > 0) {
        // Don't await - let it run async
        this.processQueue(sessionId).catch((error) => {
          this.emit('error', { sessionId, error });
        });
      } else {
        this.processing.set(sessionId, false);
      }
    } catch (error) {
      this.processing.set(sessionId, false);
      this.emit('error', { sessionId, error });
    }
  }

  /**
   * Calculate delay before sending next message
   *
   * @param sessionId Session ID
   * @param item Queue item
   * @returns Delay in milliseconds
   */
  private calculateDelay(sessionId: string, item: QueueItem): number {
    // Immediate messages skip delay (use with caution)
    if (item.options?.immediate) {
      return 0;
    }

    // Priority messages have reduced delay
    const isPriority = item.priority > 0;
    if (isPriority && this.options.priorityLanes) {
      const minDelay = Math.floor(this.options.minDelay * 0.5);
      const maxDelay = Math.floor(this.options.maxDelay * 0.5);
      return this.randomDelay(minDelay, maxDelay);
    }

    // Check time since last message
    const lastSent = this.lastSent.get(sessionId) ?? 0;
    const timeSinceLastSent = Date.now() - lastSent;

    // If enough time has passed, minimal delay
    if (timeSinceLastSent >= this.options.maxDelay) {
      return this.randomDelay(
        Math.floor(this.options.minDelay * 0.3),
        Math.floor(this.options.minDelay * 0.7)
      );
    }

    // Otherwise, full random delay
    return this.randomDelay(this.options.minDelay, this.options.maxDelay);
  }

  /**
   * Generate random delay with human-like distribution
   *
   * Uses a slight bias toward the middle of the range
   * to mimic human typing patterns.
   *
   * @param min Minimum delay (ms)
   * @param max Maximum delay (ms)
   * @returns Random delay
   */
  private randomDelay(min: number, max: number): number {
    // Generate two random numbers and average them
    // This creates a slight bell curve distribution
    const rand1 = Math.random();
    const rand2 = Math.random();
    const avg = (rand1 + rand2) / 2;

    return Math.floor(min + avg * (max - min));
  }

  /**
   * Sleep for specified duration
   *
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get queue size for a session
   *
   * @param sessionId Session ID
   * @returns Queue size
   */
  getQueueSize(sessionId: string): number {
    return this.queues.get(sessionId)?.length ?? 0;
  }

  /**
   * Clear queue for a session
   *
   * @param sessionId Session ID
   */
  clearQueue(sessionId: string): void {
    const queue = this.queues.get(sessionId);
    if (queue) {
      // Reject all pending items
      queue.forEach((item) => {
        item.reject(new Error('Queue cleared'));
      });
      this.queues.delete(sessionId);
    }
    this.processing.delete(sessionId);
  }

  /**
   * Clear all queues
   */
  clearAll(): void {
    for (const sessionId of this.queues.keys()) {
      this.clearQueue(sessionId);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalQueued: number;
    sessionCount: number;
    processingCount: number;
  } {
    let totalQueued = 0;
    for (const queue of this.queues.values()) {
      totalQueued += queue.length;
    }

    let processingCount = 0;
    for (const processing of this.processing.values()) {
      if (processing) processingCount++;
    }

    return {
      totalQueued,
      sessionCount: this.queues.size,
      processingCount,
    };
  }
}
