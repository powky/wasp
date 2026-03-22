/**
 * Built-in middleware for WaSP
 */

import type { Middleware, WaspEvent, EventType } from './types.js';

/**
 * Logger middleware
 *
 * Logs all events to console or custom logger.
 *
 * @param logger Logger instance (defaults to console)
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * wasp.use(logger());
 * wasp.use(logger(customLogger));
 * ```
 */
export function logger(
  logger: {
    debug?: (message: string, ...args: unknown[]) => void;
    info?: (message: string, ...args: unknown[]) => void;
  } = console
): Middleware {
  return async (event: WaspEvent, next: () => Promise<void>) => {
    const timestamp = event.timestamp.toISOString();
    const message = `[${timestamp}] ${event.type} - Session: ${event.sessionId}`;

    if (logger.debug) {
      logger.debug(message, event.data);
    } else if (logger.info) {
      logger.info(message);
    }

    await next();
  };
}

/**
 * Auto-reconnect middleware
 *
 * Automatically attempts to reconnect sessions when they disconnect.
 *
 * @param options Reconnect options
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * wasp.use(autoReconnect({ maxAttempts: 5, backoff: 'exponential' }));
 * ```
 */
export function autoReconnect(options?: {
  /** Maximum reconnection attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: 'linear' | 'exponential';
  /** Events that should NOT trigger reconnect */
  ignoreEvents?: EventType[];
}): Middleware {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelay = options?.initialDelay ?? 1000;
  const backoff = options?.backoff ?? 'exponential';
  const ignoreEvents = options?.ignoreEvents ?? [];

  // Track reconnection attempts per session
  const attempts = new Map<string, number>();

  return async (event: WaspEvent, next: () => Promise<void>) => {
    // Only handle disconnect events
    if (event.type !== 'SESSION_DISCONNECTED' || ignoreEvents.includes(event.type)) {
      await next();
      return;
    }

    // Get current attempt count
    const currentAttempts = attempts.get(event.sessionId) ?? 0;

    // Check if we should attempt reconnection
    if (currentAttempts >= maxAttempts) {
      attempts.delete(event.sessionId);
      await next();
      return;
    }

    // Calculate delay
    let delay = initialDelay;
    if (backoff === 'exponential') {
      delay = initialDelay * Math.pow(2, currentAttempts);
    } else {
      delay = initialDelay * (currentAttempts + 1);
    }

    // Wait before reconnecting
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Increment attempt counter
    attempts.set(event.sessionId, currentAttempts + 1);

    // Note: The actual reconnection logic should be handled by the WaSP instance
    // This middleware just tracks attempts and delays

    await next();

    // Reset attempts on successful reconnection
    if (event.type === 'SESSION_CONNECTED') {
      attempts.delete(event.sessionId);
    }
  };
}

/**
 * Rate limit middleware
 *
 * Prevents event flooding by rate limiting event emissions.
 *
 * @param options Rate limit options
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * wasp.use(rateLimit({ maxEvents: 100, window: 60000 }));
 * ```
 */
export function rateLimit(options?: {
  /** Maximum events per window */
  maxEvents?: number;
  /** Window duration in ms */
  window?: number;
  /** Events to rate limit (empty = all events) */
  events?: EventType[];
}): Middleware {
  const maxEvents = options?.maxEvents ?? 100;
  const window = options?.window ?? 60000; // 1 minute
  const targetEvents = options?.events ?? [];

  // Track events per session
  const eventCounts = new Map<string, { count: number; resetAt: number }>();

  return async (event: WaspEvent, next: () => Promise<void>) => {
    // Check if this event type should be rate limited
    if (targetEvents.length > 0 && !targetEvents.includes(event.type)) {
      await next();
      return;
    }

    const now = Date.now();
    const key = event.sessionId;

    // Get or create counter
    let counter = eventCounts.get(key);
    if (!counter || now >= counter.resetAt) {
      counter = { count: 0, resetAt: now + window };
      eventCounts.set(key, counter);
    }

    // Increment counter
    counter.count++;

    // Check if limit exceeded
    if (counter.count > maxEvents) {
      // Drop event (don't call next)
      return;
    }

    await next();
  };
}

/**
 * Error handler middleware
 *
 * Catches errors in middleware chain and emits error events.
 *
 * @param onError Error handler function
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * wasp.use(errorHandler((error, event) => {
 *   console.error('Event error:', error);
 *   Sentry.captureException(error);
 * }));
 * ```
 */
export function errorHandler(
  onError?: (error: Error, event: WaspEvent) => void
): Middleware {
  return async (event: WaspEvent, next: () => Promise<void>) => {
    try {
      await next();
    } catch (error) {
      if (onError) {
        onError(error as Error, event);
      }
      // Re-throw to allow other error handlers
      throw error;
    }
  };
}
