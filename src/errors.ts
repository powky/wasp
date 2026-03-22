/**
 * Custom error types for WaSP
 *
 * Type-safe errors for better error handling and debugging.
 */

/**
 * Error thrown when a session is not found
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when attempting operations on a disconnected session
 */
export class NotConnectedError extends Error {
  constructor(message: string = 'Not connected') {
    super(message);
    this.name = 'NotConnectedError';
  }
}

/**
 * Error thrown when a session ID is invalid
 */
export class InvalidSessionIdError extends Error {
  constructor(sessionId: string) {
    super(`Invalid session ID: ${sessionId}. Session IDs must contain only alphanumeric characters, hyphens, and underscores.`);
    this.name = 'InvalidSessionIdError';
  }
}

/**
 * Error thrown when queue is full
 */
export class QueueFullError extends Error {
  constructor(sessionId: string, maxSize: number) {
    super(`Queue for session ${sessionId} is full (max: ${maxSize})`);
    this.name = 'QueueFullError';
  }
}

/**
 * Error thrown when a table name is invalid
 */
export class InvalidTableNameError extends Error {
  constructor(tableName: string) {
    super(`Invalid table name: ${tableName}. Table names must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    this.name = 'InvalidTableNameError';
  }
}
