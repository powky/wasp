/**
 * Baileys provider implementation
 *
 * Integrates @whiskeysockets/baileys with WaSP protocol.
 */

import { EventEmitter } from 'events';
import type {
  Provider,
  ProviderType,
  Message,
  MessageType,
  SendMessageOptions,
  EventType,
} from '../types.js';

// Baileys types (will be imported from @whiskeysockets/baileys)
// These are placeholder types - actual types come from the library
type BaileysSocket = any;
type BaileysEvent = any;
type WAMessage = any;

/**
 * Baileys provider options
 */
export interface BaileysProviderOptions {
  /** Authentication state directory */
  authDir?: string;
  /** Print QR to console */
  printQR?: boolean;
  /** Browser metadata */
  browser?: [string, string, string];
  /** Logger instance */
  logger?: any;
}

/**
 * Baileys provider
 *
 * Implements the Provider interface using @whiskeysockets/baileys.
 *
 * @example
 * ```typescript
 * import { BaileysProvider } from '@wasp/core/providers/baileys';
 *
 * const provider = new BaileysProvider({
 *   authDir: './auth_states',
 *   printQR: true,
 * });
 *
 * await provider.connect('session-1');
 * await provider.sendMessage('27821234567@s.whatsapp.net', 'Hello!');
 * ```
 */
export class BaileysProvider implements Provider {
  readonly type: ProviderType = 'BAILEYS' as ProviderType;
  readonly events: EventEmitter = new EventEmitter();

  private socket: BaileysSocket | null = null;
  private options: BaileysProviderOptions;
  private sessionId: string | null = null;
  private phoneNumber: string | null = null;
  private qrCode: string | null = null;

  constructor(options?: BaileysProviderOptions) {
    this.options = {
      authDir: options?.authDir ?? './auth_states',
      printQR: options?.printQR ?? false,
      browser: options?.browser ?? ['WaSP', 'Chrome', '1.0.0'],
      logger: options?.logger,
    };
  }

  /**
   * Connect to WhatsApp using Baileys
   */
  async connect(sessionId: string, options?: unknown): Promise<void> {
    this.sessionId = sessionId;

    try {
      // TODO: Implement actual Baileys connection
      // This is a stub that shows the structure

      /*
      const { default: makeWASocket, useMultiFileAuthState } = await import('@whiskeysockets/baileys');

      const authDir = `${this.options.authDir}/${sessionId}`;
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: this.options.printQR,
        browser: this.options.browser,
        logger: this.options.logger,
      });

      // Handle QR code
      this.socket.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.events.emit('qr', qr);
        }

        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
          this.events.emit('disconnected', { shouldReconnect });
        } else if (connection === 'open') {
          this.phoneNumber = this.socket.user?.id?.split(':')[0] ?? null;
          this.events.emit('connected', { phone: this.phoneNumber });
        }
      });

      // Handle credentials update
      this.socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', ({ messages, type }: any) => {
        if (type === 'notify') {
          for (const msg of messages) {
            const normalized = this.normalizeMessage(msg);
            this.events.emit('message', normalized);
          }
        }
      });
      */

      // Temporary stub - emit connected after delay
      setTimeout(() => {
        this.phoneNumber = '27821234567';
        this.events.emit('connected', { phone: this.phoneNumber });
      }, 100);

    } catch (error) {
      this.events.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      // TODO: Implement actual disconnect
      // await this.socket.logout();
      // this.socket = null;
    }
    this.sessionId = null;
    this.phoneNumber = null;
    this.qrCode = null;
    this.events.emit('disconnected', { shouldReconnect: false });
  }

  /**
   * Send a message
   */
  async sendMessage(
    to: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<Message> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    try {
      // TODO: Implement actual message sending
      /*
      const jid = this.formatJid(to);
      const message: any = { text: content };

      if (options?.quoted) {
        message.quoted = options.quoted;
      }

      if (options?.media) {
        // Handle media messages
      }

      const sent = await this.socket.sendMessage(jid, message);
      return this.normalizeMessage(sent);
      */

      // Temporary stub
      const message: Message = {
        id: `msg-${Date.now()}`,
        from: this.phoneNumber ?? '',
        to,
        type: 'TEXT' as MessageType,
        content,
        timestamp: new Date(),
        isGroup: to.includes('@g.us'),
        groupId: to.includes('@g.us') ? to : undefined,
      };

      return message;
    } catch (error) {
      this.events.emit('error', error);
      throw error;
    }
  }

  /**
   * Send a reaction
   */
  async sendReaction(messageId: string, emoji: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    // TODO: Implement reaction sending
    /*
    const reactionMessage = {
      react: {
        text: emoji,
        key: { id: messageId },
      },
    };
    await this.socket.sendMessage(jid, reactionMessage);
    */
  }

  /**
   * Get QR code for authentication
   */
  async getQR(): Promise<string | null> {
    return this.qrCode;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && this.phoneNumber !== null;
  }

  /**
   * Get session phone number
   */
  getPhoneNumber(): string | null {
    return this.phoneNumber;
  }

  /**
   * Normalize Baileys message to WaSP format
   */
  private normalizeMessage(msg: WAMessage): Message {
    // TODO: Implement actual normalization
    /*
    const message: Message = {
      id: msg.key.id!,
      from: msg.key.remoteJid!,
      to: this.phoneNumber!,
      type: this.getMessageType(msg),
      content: this.getMessageContent(msg),
      timestamp: new Date(msg.messageTimestamp! * 1000),
      isGroup: msg.key.remoteJid!.endsWith('@g.us'),
      groupId: msg.key.remoteJid!.endsWith('@g.us') ? msg.key.remoteJid! : undefined,
    };
    return message;
    */

    return {} as Message; // Stub
  }

  /**
   * Format phone number to Baileys JID format
   */
  private formatJid(phone: string): string {
    // Remove spaces, dashes, etc.
    const cleaned = phone.replace(/[^\d]/g, '');

    // If already has @s.whatsapp.net or @g.us, return as-is
    if (phone.includes('@')) {
      return phone;
    }

    // Otherwise append @s.whatsapp.net
    return `${cleaned}@s.whatsapp.net`;
  }
}
