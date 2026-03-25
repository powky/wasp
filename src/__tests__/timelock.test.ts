/**
 * Timelock tests - reachout throttling detection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageQueue } from '../queue.js';
import { EventType } from '../types.js';
import type { ReachoutTimelockInfo } from '../types.js';

describe('MessageQueue - Timelock', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue({
      minDelay: 10,
      maxDelay: 20,
      maxConcurrent: 1,
      priorityLanes: false,
    });
  });

  describe('EventType.REACHOUT_TIMELOCK', () => {
    it('should exist and equal "REACHOUT_TIMELOCK"', () => {
      expect(EventType.REACHOUT_TIMELOCK).toBe('REACHOUT_TIMELOCK');
    });
  });

  describe('isSessionTimelocked()', () => {
    it('should return false for unknown session', () => {
      expect(queue.isSessionTimelocked('unknown-session')).toBe(false);
    });

    it('should return true after setTimelocked()', () => {
      queue.setTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });

    it('should return false after clearTimelocked()', () => {
      queue.setTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);

      queue.clearTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(false);
    });

    it('should auto-expire timelocks with past expiresAt', () => {
      // Set timelock with expiry in the past
      const pastDate = new Date(Date.now() - 1000);
      queue.setTimelocked('session-1', pastDate);

      // Should auto-expire and return false
      expect(queue.isSessionTimelocked('session-1')).toBe(false);
    });

    it('should not auto-expire timelocks with future expiresAt', () => {
      // Set timelock with expiry in the future
      const futureDate = new Date(Date.now() + 10000);
      queue.setTimelocked('session-1', futureDate);

      // Should still be locked
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });

    it('should persist without expiry when expiresAt is not provided', () => {
      queue.setTimelocked('session-1');

      // Should remain locked
      expect(queue.isSessionTimelocked('session-1')).toBe(true);

      // Still locked after some time
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });
  });

  describe('setTimelocked()', () => {
    it('should mark session as timelocked', () => {
      queue.setTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });

    it('should accept expiresAt parameter', () => {
      const expiresAt = new Date(Date.now() + 5000);
      queue.setTimelocked('session-1', expiresAt);
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });

    it('should accept enforcementType parameter', () => {
      queue.setTimelocked('session-1', undefined, 'STRICT');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);
    });

    it('should emit "timelocked" event', async () => {
      const eventPromise = new Promise((resolve) => {
        queue.once('timelocked', (data) => {
          expect(data.sessionId).toBe('session-1');
          expect(data.enforcementType).toBe('STRICT');
          resolve(undefined);
        });
      });

      queue.setTimelocked('session-1', undefined, 'STRICT');
      await eventPromise;
    });

    it('should emit "timelocked" event with expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 5000);

      const eventPromise = new Promise((resolve) => {
        queue.once('timelocked', (data) => {
          expect(data.sessionId).toBe('session-1');
          expect(data.expiresAt).toEqual(expiresAt);
          resolve(undefined);
        });
      });

      queue.setTimelocked('session-1', expiresAt);
      await eventPromise;
    });
  });

  describe('clearTimelocked()', () => {
    it('should clear the timelock', () => {
      queue.setTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);

      queue.clearTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(false);
    });

    it('should emit "timelock-lifted" event', async () => {
      queue.setTimelocked('session-1');

      const eventPromise = new Promise((resolve) => {
        queue.once('timelock-lifted', (data) => {
          expect(data.sessionId).toBe('session-1');
          resolve(undefined);
        });
      });

      queue.clearTimelocked('session-1');
      await eventPromise;
    });

    it('should not throw when clearing non-existent timelock', () => {
      expect(() => {
        queue.clearTimelocked('unknown-session');
      }).not.toThrow();
    });
  });

  describe('clearQueue()', () => {
    it('should also clear timelock for that session', () => {
      queue.setTimelocked('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(true);

      queue.clearQueue('session-1');
      expect(queue.isSessionTimelocked('session-1')).toBe(false);
    });

    it('should not affect timelocks for other sessions', () => {
      queue.setTimelocked('session-1');
      queue.setTimelocked('session-2');

      queue.clearQueue('session-1');

      expect(queue.isSessionTimelocked('session-1')).toBe(false);
      expect(queue.isSessionTimelocked('session-2')).toBe(true);
    });
  });

  describe('clearAll()', () => {
    it('should clear all timelocks', () => {
      queue.setTimelocked('session-1');
      queue.setTimelocked('session-2');
      queue.setTimelocked('session-3');

      expect(queue.isSessionTimelocked('session-1')).toBe(true);
      expect(queue.isSessionTimelocked('session-2')).toBe(true);
      expect(queue.isSessionTimelocked('session-3')).toBe(true);

      queue.clearAll();

      expect(queue.isSessionTimelocked('session-1')).toBe(false);
      expect(queue.isSessionTimelocked('session-2')).toBe(false);
      expect(queue.isSessionTimelocked('session-3')).toBe(false);
    });
  });

  describe('Auto-expiry events', () => {
    it('should emit "timelock-lifted" event on auto-expiry', async () => {
      const pastDate = new Date(Date.now() - 1000);
      queue.setTimelocked('session-1', pastDate);

      const eventPromise = new Promise((resolve) => {
        queue.once('timelock-lifted', (data) => {
          expect(data.sessionId).toBe('session-1');
          resolve(undefined);
        });
      });

      // Trigger auto-expiry check
      queue.isSessionTimelocked('session-1');
      await eventPromise;
    });

    it('should not emit "timelock-lifted" for active timelocks', async () => {
      const futureDate = new Date(Date.now() + 10000);
      let eventEmitted = false;

      queue.once('timelock-lifted', () => {
        eventEmitted = true;
      });

      queue.setTimelocked('session-1', futureDate);
      queue.isSessionTimelocked('session-1');

      // Wait a bit to ensure no event is emitted
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(eventEmitted).toBe(false);
    });
  });

  describe('ReachoutTimelockInfo type', () => {
    it('should be instantiable with required fields', () => {
      const info: ReachoutTimelockInfo = {
        isActive: true,
        newContactsBlocked: true,
      };

      expect(info.isActive).toBe(true);
      expect(info.newContactsBlocked).toBe(true);
    });

    it('should accept optional enforcementType', () => {
      const info: ReachoutTimelockInfo = {
        isActive: true,
        enforcementType: 'STRICT',
        newContactsBlocked: true,
      };

      expect(info.enforcementType).toBe('STRICT');
    });

    it('should accept optional expiresAt', () => {
      const expiresAt = new Date(Date.now() + 5000);
      const info: ReachoutTimelockInfo = {
        isActive: true,
        expiresAt,
        newContactsBlocked: true,
      };

      expect(info.expiresAt).toEqual(expiresAt);
    });

    it('should accept all fields together', () => {
      const expiresAt = new Date(Date.now() + 5000);
      const info: ReachoutTimelockInfo = {
        isActive: true,
        enforcementType: 'MODERATE',
        expiresAt,
        newContactsBlocked: true,
      };

      expect(info.isActive).toBe(true);
      expect(info.enforcementType).toBe('MODERATE');
      expect(info.expiresAt).toEqual(expiresAt);
      expect(info.newContactsBlocked).toBe(true);
    });
  });

  describe('Multiple sessions', () => {
    it('should manage timelocks independently per session', () => {
      queue.setTimelocked('session-1');
      queue.setTimelocked('session-2');

      expect(queue.isSessionTimelocked('session-1')).toBe(true);
      expect(queue.isSessionTimelocked('session-2')).toBe(true);

      queue.clearTimelocked('session-1');

      expect(queue.isSessionTimelocked('session-1')).toBe(false);
      expect(queue.isSessionTimelocked('session-2')).toBe(true);
    });

    it('should handle different expiry times per session', () => {
      const pastDate = new Date(Date.now() - 1000);
      const futureDate = new Date(Date.now() + 10000);

      queue.setTimelocked('session-1', pastDate);
      queue.setTimelocked('session-2', futureDate);

      // Session 1 should be expired, session 2 should be active
      expect(queue.isSessionTimelocked('session-1')).toBe(false);
      expect(queue.isSessionTimelocked('session-2')).toBe(true);
    });
  });
});
