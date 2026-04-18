/**
 * wrapSocket — WaSP Socket Wrapper
 *
 * Wraps an existing Baileys socket's sendMessage with WaSP's anti-ban queue.
 * Use this when you have an existing Baileys socket (e.g. from OpenClaw or
 * another agent runtime) and want WaSP's queue without replacing session management.
 *
 * @example
 * ```ts
 * import { wrapSocket } from 'wasp-protocol';
 *
 * // After your existing Baileys/OpenClaw socket is created:
 * const wrappedSock = wrapSocket(sock, 'my-session-id');
 *
 * // Use exactly like normal sock — delays + anti-ban applied automatically
 * await wrappedSock.sendMessage(jid, { text: 'Hello!' });
 * ```
 */

import { MessageQueue } from './queue.js';
import type { QueueOptions } from './types.js';

export interface WrappedSocket {
  sendMessage: (...args: unknown[]) => Promise<unknown>;
  /** Access the underlying WaSP queue for priority/config */
  _waspQueue: MessageQueue;
  /** Access the original unwrapped socket */
  _originalSocket: unknown;
}

/**
 * Wrap an existing Baileys socket with WaSP's anti-ban message queue.
 *
 * @param sock - Existing Baileys socket (from makeWASocket or OpenClaw)
 * @param sessionId - Unique session identifier for queue tracking
 * @param queueOptions - Optional WaSP queue configuration
 * @returns Wrapped socket with WaSP queue applied to sendMessage
 */
export function wrapSocket<T extends { sendMessage: (...args: unknown[]) => Promise<unknown> }>(
  sock: T,
  sessionId: string,
  queueOptions?: Partial<QueueOptions>
): T & WrappedSocket {
  const queue = new MessageQueue(queueOptions);
  const originalSend = sock.sendMessage.bind(sock);

  const wrappedSend = (...args: unknown[]): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      queue.enqueue({
        sessionId,
        to: typeof args[0] === 'string' ? args[0] : 'unknown',
        content: typeof args[1] === 'string' ? args[1] : JSON.stringify(args[1] ?? ''),
        priority: 5,
        resolve: async () => {
          try {
            const result = await originalSend(...args);
            resolve(result);
            return result as never;
          } catch (err) {
            reject(err);
            throw err;
          }
        },
        reject,
        queuedAt: new Date(),
      });
    });
  };

  return Object.assign(sock, {
    sendMessage: wrappedSend,
    _waspQueue: queue,
    _originalSocket: sock,
  });
}
