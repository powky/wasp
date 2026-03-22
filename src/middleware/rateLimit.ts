/**
 * Rate limit middleware
 *
 * Limits message sending rate per session.
 */

import type { Middleware, WaspEvent } from '../types.js';

export interface RateLimitOptions {
  /** Maximum messages per window */
  maxMessages?: number;
  /** Time window in milliseconds */
  windowMs?: number;
}

/**
 * Rate limit middleware
 *
 * Prevents sessions from exceeding message rate limits.
 *
 * @example
 * ```typescript
 * wasp.use(rateLimit({
 *   maxMessages: 10,
 *   windowMs: 60000, // 10 messages per minute
 * }));
 * ```
 */
export function rateLimit(options?: RateLimitOptions): Middleware {
  const maxMessages = options?.maxMessages ?? 10;
  const windowMs = options?.windowMs ?? 60000;

  const sessionCounts = new Map<string, { count: number; resetAt: number }>();

  return async (event: WaspEvent, next: () => Promise<void>) => {
    if (event.type === 'MESSAGE_SENT') {
      const { sessionId } = event;
      const now = Date.now();

      let record = sessionCounts.get(sessionId);

      // Reset if window expired
      if (!record || now >= record.resetAt) {
        record = {
          count: 0,
          resetAt: now + windowMs,
        };
        sessionCounts.set(sessionId, record);
      }

      // Check limit
      if (record.count >= maxMessages) {
        const waitTime = record.resetAt - now;
        console.warn(`[RateLimit] Session ${sessionId} exceeded rate limit. Wait ${waitTime}ms`);
        return; // Block event
      }

      // Increment counter
      record.count++;
    }

    await next();
  };
}
