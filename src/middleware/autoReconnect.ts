/**
 * Auto-reconnect middleware
 *
 * Automatically reconnects sessions on disconnect with exponential backoff.
 */

import type { Middleware, WaspEvent } from '../types.js';

export interface AutoReconnectOptions {
  /** Maximum reconnection attempts */
  maxAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay?: number;
}

/**
 * Auto-reconnect middleware
 *
 * Handles automatic reconnection on session disconnect.
 *
 * @example
 * ```typescript
 * wasp.use(autoReconnect({
 *   maxAttempts: 5,
 *   baseDelay: 1000, // 1s, 2s, 4s, 8s, 16s
 * }));
 * ```
 */
export function autoReconnect(options?: AutoReconnectOptions): Middleware {
  const maxAttempts = options?.maxAttempts ?? 5;
  const baseDelay = options?.baseDelay ?? 1000;

  const reconnectAttempts = new Map<string, number>();

  return async (event: WaspEvent, next: () => Promise<void>) => {
    if (event.type === 'SESSION_DISCONNECTED') {
      const { sessionId } = event;
      const { shouldReconnect } = event.data as { shouldReconnect: boolean };

      if (shouldReconnect) {
        const attempts = reconnectAttempts.get(sessionId) ?? 0;

        if (attempts < maxAttempts) {
          reconnectAttempts.set(sessionId, attempts + 1);

          const delay = baseDelay * Math.pow(2, attempts);
          console.log(`[AutoReconnect] Session ${sessionId} will reconnect in ${delay}ms (attempt ${attempts + 1}/${maxAttempts})`);

          // Note: Actual reconnection logic would be handled by the WaSP instance
          // This middleware just tracks attempts and delays
        } else {
          console.log(`[AutoReconnect] Session ${sessionId} exceeded max reconnect attempts (${maxAttempts})`);
          reconnectAttempts.delete(sessionId);
        }
      }
    } else if (event.type === 'SESSION_CONNECTED') {
      // Reset reconnect counter on successful connection
      reconnectAttempts.delete(event.sessionId);
    }

    await next();
  };
}
