/**
 * Error handler middleware
 *
 * Catches and handles errors in the middleware pipeline.
 */

import type { Middleware, WaspEvent } from '../types.js';

export type ErrorCallback = (error: Error, event: WaspEvent) => void;

/**
 * Error handler middleware
 *
 * Catches errors and passes them to a custom handler.
 *
 * @example
 * ```typescript
 * wasp.use(errorHandler((error, event) => {
 *   console.error(`Error in ${event.type}:`, error);
 *   Sentry.captureException(error);
 * }));
 * ```
 */
export function errorHandler(onError: ErrorCallback): Middleware {
  return async (event: WaspEvent, next: () => Promise<void>) => {
    try {
      await next();
    } catch (error) {
      onError(error as Error, event);
    }
  };
}
