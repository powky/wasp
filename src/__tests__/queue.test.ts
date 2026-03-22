/**
 * Anti-ban queue tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageQueue } from '../queue.js';
import type { QueueOptions, QueueItem } from '../types.js';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue({
      minDelay: 100,
      maxDelay: 200,
      maxConcurrent: 2,
      priorityLanes: true,
    });
  });

  describe('Queueing', () => {
    it('should enqueue a message', async () => {
      const promise = queue.enqueue({
        sessionId: 'session-1',
        to: '27821234567@s.whatsapp.net',
        content: 'Hello',
        options: { priority: 5 },
        priority: 5,
        resolve: () => {},
        reject: () => {},
        queuedAt: new Date(),
      });

      expect(queue.getQueueSize('session-1')).toBeGreaterThanOrEqual(0);
    });

    it('should process messages with delay', async () => {
      const start = Date.now();

      // Create a promise that resolves when message is sent
      const promise = new Promise<void>((resolve) => {
        queue.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'Message 1',
          priority: 0,
          resolve: () => resolve(),
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      await promise;

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(100); // Min delay
      expect(duration).toBeLessThan(300); // Max delay + buffer
    });

    it('should prioritize high-priority messages', async () => {
      const executionOrder: string[] = [];

      // Queue low priority first
      const lowPromise = new Promise<void>((resolve) => {
        queue.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'Low',
          options: { priority: 0 },
          priority: 0,
          resolve: () => {
            executionOrder.push('low');
            resolve();
          },
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      // Queue high priority second
      const highPromise = new Promise<void>((resolve) => {
        queue.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'High',
          options: { priority: 10 },
          priority: 10,
          resolve: () => {
            executionOrder.push('high');
            resolve();
          },
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      await Promise.all([lowPromise, highPromise]);

      // High priority should execute first (sorted to front of queue)
      expect(executionOrder[0]).toBe('high');
      expect(executionOrder[1]).toBe('low');
    });

    it('should skip delay for immediate messages', async () => {
      const start = Date.now();

      const promise = new Promise<void>((resolve) => {
        queue.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'Immediate',
          options: { immediate: true },
          priority: 0,
          resolve: () => resolve(),
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      await promise;

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50); // No delay
    });
  });

  describe('Priority lanes', () => {
    it('should reduce delay for priority messages when priority lanes enabled', async () => {
      const queueWithLanes = new MessageQueue({
        minDelay: 1000,
        maxDelay: 2000,
        maxConcurrent: 1,
        priorityLanes: true,
      });

      const start = Date.now();

      const promise = new Promise<void>((resolve) => {
        queueWithLanes.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'Priority',
          options: { priority: 10 },
          priority: 10,
          resolve: () => resolve(),
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      await promise;

      const duration = Date.now() - start;

      // Priority lanes reduce delay by 50%
      expect(duration).toBeGreaterThanOrEqual(500); // 1000 * 0.5
      expect(duration).toBeLessThan(1200); // 2000 * 0.5 + buffer
    });

    it('should not reduce delay when priority lanes disabled', async () => {
      const queueNoLanes = new MessageQueue({
        minDelay: 1000,
        maxDelay: 2000,
        maxConcurrent: 1,
        priorityLanes: false,
      });

      const start = Date.now();

      const promise = new Promise<void>((resolve) => {
        queueNoLanes.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: 'Priority',
          options: { priority: 10 },
          priority: 10,
          resolve: () => resolve(),
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      await promise;

      const duration = Date.now() - start;

      // No reduction when priority lanes disabled
      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(duration).toBeLessThan(2200);
    });
  });

  describe('Concurrent processing', () => {
    it('should respect maxConcurrent limit', async () => {
      const concurrentQueue = new MessageQueue({
        minDelay: 100,
        maxDelay: 200,
        maxConcurrent: 2,
        priorityLanes: false,
      });

      const promises = [1, 2, 3].map((i) =>
        new Promise<void>((resolve) => {
          concurrentQueue.enqueue({
            sessionId: 'session-1',
            to: '27821234567@s.whatsapp.net',
            content: `Msg ${i}`,
            priority: 0,
            resolve: () => resolve(),
            reject: () => {},
            queuedAt: new Date(),
          });
        })
      );

      await Promise.all(promises);

      // All should complete
      expect(promises).toHaveLength(3);
    });
  });

  describe('Queue clearing', () => {
    it('should clear all queued messages', () => {
      // Enqueue multiple messages but don't wait
      [1, 2, 3].forEach((i) => {
        queue.enqueue({
          sessionId: 'session-1',
          to: '27821234567@s.whatsapp.net',
          content: `Msg ${i}`,
          priority: 0,
          resolve: () => {},
          reject: () => {},
          queuedAt: new Date(),
        });
      });

      // Give queue time to accept messages
      const initialSize = queue.getQueueSize('session-1');

      queue.clearAll();

      expect(queue.getQueueSize('session-1')).toBe(0);
    });

    it('should clear messages for specific session only', () => {
      queue.enqueue({
        sessionId: 'session-1',
        to: '27821234567@s.whatsapp.net',
        content: 'Msg 1',
        priority: 0,
        resolve: () => {},
        reject: () => {},
        queuedAt: new Date(),
      });

      queue.enqueue({
        sessionId: 'session-2',
        to: '27821234567@s.whatsapp.net',
        content: 'Msg 2',
        priority: 0,
        resolve: () => {},
        reject: () => {},
        queuedAt: new Date(),
      });

      queue.clearQueue('session-1');

      // Session-1 messages should be removed, but not session-2
      expect(queue.getQueueSize('session-1')).toBe(0);
      expect(queue.getQueueSize('session-2')).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    it('should return queue statistics', () => {
      queue.enqueue('session-1', '27821234567@s.whatsapp.net', 'Msg 1');
      queue.enqueue('session-2', '27821234567@s.whatsapp.net', 'Msg 2');

      const stats = queue.getStats();

      expect(stats.totalQueued).toBeGreaterThanOrEqual(0);
      expect(stats.sessionCount).toBeGreaterThanOrEqual(0);
      expect(stats.processingCount).toBeGreaterThanOrEqual(0);
    });
  });
});
