/**
 * Logger middleware
 *
 * Logs all WaSP events to console or custom logger.
 */

import type { Middleware, WaspEvent } from '../types.js';

export interface LoggerOptions {
  /** Custom log function */
  log?: (message: string, ...args: unknown[]) => void;
  /** Include event data in logs */
  includeData?: boolean;
}

/**
 * Logger middleware
 *
 * Logs all events passing through the pipeline.
 *
 * @example
 * ```typescript
 * wasp.use(logger());
 *
 * // With custom logger
 * wasp.use(logger({
 *   log: (msg) => winston.info(msg),
 *   includeData: true,
 * }));
 * ```
 */
export function logger(options?: LoggerOptions): Middleware {
  const logFn = options?.log ?? console.log.bind(console);
  const includeData = options?.includeData ?? false;

  return async (event: WaspEvent, next: () => Promise<void>) => {
    const timestamp = event.timestamp.toISOString();
    const message = `[WaSP] ${timestamp} | ${event.type} | Session: ${event.sessionId}`;

    if (includeData) {
      logFn(message, event.data);
    } else {
      logFn(message);
    }

    await next();
  };
}
