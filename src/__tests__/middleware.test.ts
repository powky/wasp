/**
 * Middleware tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '../middleware/logger.js';
import { autoReconnect } from '../middleware/autoReconnect.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimit.js';
import type { WaspEvent, EventType } from '../types.js';

describe('Middleware', () => {
  describe('logger', () => {
    it('should log events', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const middleware = logger();
      const event: WaspEvent = {
        type: 'MESSAGE_RECEIVED' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: { from: '27821234567', content: 'Hello' },
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      // Logger formats message as single string
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WaSP]')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('MESSAGE_RECEIVED')
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('session-1')
      );
      expect(next).toHaveBeenCalled();

      logSpy.mockRestore();
    });

    it('should use custom logger', async () => {
      const customLog = vi.fn();
      const middleware = logger({
        log: customLog,
      });

      const event: WaspEvent = {
        type: 'SESSION_CONNECTED' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: { phone: '27821234567' },
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      expect(customLog).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('autoReconnect', () => {
    it('should emit reconnect event on disconnect', async () => {
      const middleware = autoReconnect({ maxAttempts: 3 });

      const event: WaspEvent = {
        type: 'SESSION_DISCONNECTED' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: { reason: 'connection_lost', shouldReconnect: true },
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      expect(next).toHaveBeenCalled();
    });

    it('should not reconnect if maxAttempts reached', async () => {
      const middleware = autoReconnect({ maxAttempts: 0 });

      const event: WaspEvent = {
        type: 'SESSION_DISCONNECTED' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: { reason: 'connection_lost', shouldReconnect: true },
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('errorHandler', () => {
    it('should catch and handle errors', async () => {
      const onError = vi.fn();
      const middleware = errorHandler(onError);

      const event: WaspEvent = {
        type: 'SESSION_ERROR' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: { error: new Error('Test error') },
      };

      const next = vi.fn().mockRejectedValue(new Error('Next error'));

      await middleware(event, next);

      expect(onError).toHaveBeenCalledWith(expect.any(Error), event);
    });

    it('should call next if no error', async () => {
      const onError = vi.fn();
      const middleware = errorHandler(onError);

      const event: WaspEvent = {
        type: 'MESSAGE_RECEIVED' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: {},
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      expect(next).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('rateLimit', () => {
    it('should allow messages within rate limit', async () => {
      const middleware = rateLimit({
        maxMessages: 10,
        windowMs: 1000,
      });

      const event: WaspEvent = {
        type: 'MESSAGE_SENT' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: {},
      };

      const next = vi.fn().mockResolvedValue(undefined);

      await middleware(event, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block messages exceeding rate limit', async () => {
      const middleware = rateLimit({
        maxMessages: 2,
        windowMs: 1000,
      });

      const event: WaspEvent = {
        type: 'MESSAGE_SENT' as EventType,
        sessionId: 'session-1',
        timestamp: new Date(),
        data: {},
      };

      const next = vi.fn().mockResolvedValue(undefined);

      // Send 3 messages quickly
      await middleware(event, next);
      await middleware(event, next);
      await middleware(event, next);

      // First 2 should pass, 3rd should be blocked
      expect(next).toHaveBeenCalledTimes(2);
    });
  });
});
