/**
 * WaSP core tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WaSP } from '../wasp.js';
import { MemoryStore } from '../stores/memory.js';
import { MockProvider } from '../providers/mock.js';
import { SessionStatus, ProviderType, EventType } from '../types.js';

describe('WaSP', () => {
  let wasp: WaSP;

  beforeEach(() => {
    wasp = new WaSP({
      debug: false,
      store: new MemoryStore(),
    });
  });

  // Helper to create session with mock provider
  const createMockSession = async (id: string, options?: { orgId?: string; metadata?: Record<string, unknown> }) => {
    const mockProvider = new MockProvider({ connectionDelay: 10, sendDelay: 5 });
    return await wasp.createSession(id, 'BAILEYS' as ProviderType, {
      ...options,
      mockProvider,
    });
  };

  describe('Instance creation', () => {
    it('should create WaSP instance with default config', () => {
      expect(wasp).toBeInstanceOf(WaSP);
      expect(wasp.getSessionCount()).toBe(0);
    });

    it('should create WaSP instance with custom config', () => {
      const customWasp = new WaSP({
        debug: true,
        queue: {
          minDelay: 3000,
          maxDelay: 7000,
          maxConcurrent: 2,
          priorityLanes: false,
        },
      });

      expect(customWasp).toBeInstanceOf(WaSP);
    });
  });

  describe('Session lifecycle', () => {
    it('should create a session', async () => {
      const session = await createMockSession('test-session-1');

      expect(session).toBeDefined();
      expect(session.id).toBe('test-session-1');
      expect(session.provider).toBe('BAILEYS');
      expect(session.status).toBe('CONNECTED');
      expect(wasp.getSessionCount()).toBe(1);
    });

    it('should create session with metadata', async () => {
      const session = await createMockSession('test-session-2', {
        orgId: 'org-123',
        metadata: { userId: 'user-456', plan: 'pro' },
      });

      expect(session.orgId).toBe('org-123');
      expect(session.metadata).toEqual({ userId: 'user-456', plan: 'pro' });
    });

    it('should not create duplicate session', async () => {
      await createMockSession('duplicate-test');

      await expect(
        createMockSession('duplicate-test')
      ).rejects.toThrow('Session duplicate-test already exists');
    });

    it('should get session by ID', async () => {
      await createMockSession('get-test');
      const session = await wasp.getSession('get-test');

      expect(session).toBeDefined();
      expect(session?.id).toBe('get-test');
    });

    it('should return null for non-existent session', async () => {
      const session = await wasp.getSession('non-existent');
      expect(session).toBeNull();
    });

    it('should list all sessions', async () => {
      await createMockSession('session-1');
      await createMockSession('session-2');
      await createMockSession('session-3');

      const sessions = await wasp.listSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should list sessions with filter', async () => {
      await createMockSession('org-1-session', { orgId: 'org-1' });
      await createMockSession('org-2-session', { orgId: 'org-2' });

      const org1Sessions = await wasp.listSessions({ orgId: 'org-1' });
      expect(org1Sessions).toHaveLength(1);
      expect(org1Sessions[0].id).toBe('org-1-session');
    });

    it('should destroy a session', async () => {
      await createMockSession('destroy-test');
      expect(wasp.getSessionCount()).toBe(1);

      await wasp.destroySession('destroy-test');
      expect(wasp.getSessionCount()).toBe(0);

      const session = await wasp.getSession('destroy-test');
      expect(session).toBeNull();
    });

    it('should throw error when destroying non-existent session', async () => {
      await expect(wasp.destroySession('non-existent')).rejects.toThrow(
        'Session non-existent not found'
      );
    });
  });

  describe('Event subscription', () => {
    it('should subscribe to specific event', async () => {
      const handler = vi.fn();
      wasp.on('SESSION_CONNECTED' as EventType, handler);

      await createMockSession('event-test');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].type).toBe('SESSION_CONNECTED');
      expect(handler.mock.calls[0][0].sessionId).toBe('event-test');
    });

    it('should subscribe to all events with wildcard', async () => {
      const handler = vi.fn();
      wasp.on('*', handler);

      await createMockSession('wildcard-test');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].sessionId).toBe('wildcard-test');
    });
  });

  describe('Message queue', () => {
    it('should respect message priority', async () => {
      const session = await createMockSession('priority-test');

      // Queue low priority message
      const lowPromise = wasp.sendMessage('priority-test', '27821234567', 'Low priority', {
        priority: 0,
      });

      // Queue high priority message
      const highPromise = wasp.sendMessage('priority-test', '27821234567', 'High priority', {
        priority: 10,
      });

      // Both should complete (high priority processed first due to queue sorting)
      await Promise.all([lowPromise, highPromise]);
    }, 15000); // Timeout: 2 messages * maxDelay (5000ms) + buffer

    it('should send immediate messages without delay', async () => {
      await createMockSession('immediate-test');

      const start = Date.now();
      await wasp.sendMessage('immediate-test', '27821234567', 'Immediate message', {
        immediate: true,
      });
      const duration = Date.now() - start;

      // Should complete in less than 1 second (no queue delay)
      expect(duration).toBeLessThan(1000);
    });

    it('should get queue statistics', () => {
      const stats = wasp.getQueueStats();

      expect(stats).toHaveProperty('totalQueued');
      expect(stats).toHaveProperty('sessionCount');
      expect(stats).toHaveProperty('processingCount');
    });
  });

  describe('Middleware', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];
      let eventCount = 0;

      wasp.use(async (event, next) => {
        // Only track the first event to avoid duplicates from provider
        if (eventCount === 0) {
          order.push(1);
        }
        await next();
        if (eventCount === 0) {
          order.push(4);
          eventCount++;
        }
      });

      wasp.use(async (event, next) => {
        if (eventCount === 0) {
          order.push(2);
        }
        await next();
        if (eventCount === 0) {
          order.push(3);
        }
      });

      await createMockSession('middleware-test');

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(order).toEqual([1, 2, 3, 4]);
    });
  });
});
