/**
 * Baileys provider implementation
 *
 * Integrates @whiskeysockets/baileys with WaSP protocol.
 * Production-grade patterns extracted from WhatsAuction.
 */

import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import type {
  Provider,
  ProviderType,
  Message,
  SendMessageOptions,
} from '../types.js';
import { MessageType, EventType } from '../types.js';
import { InvalidSessionIdError, NotConnectedError } from '../errors.js';

// Baileys types - dynamically imported
type BaileysSocket = any;
type WAMessage = any;

/**
 * Baileys provider options
 */
export interface BaileysProviderOptions {
  /** Authentication state directory */
  authDir?: string;
  /** Print QR to console */
  printQR?: boolean;
  /** Browser metadata [name, description, version] */
  browser?: [string, string, string];
  /** Pino logger instance */
  logger?: any;
  /** Proxy URL (SOCKS5) */
  proxyUrl?: string;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Allowed media directory (for file path security) */
  allowedMediaDir?: string;
}

/**
 * Baileys provider
 *
 * Implements the Provider interface using @whiskeysockets/baileys.
 * Includes production-ready patterns: exponential backoff, Bad MAC handling,
 * proper disconnect detection, and memory leak mitigation.
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
  private phoneNumber: string | null = null;
  private qrCode: string | null = null;
  private options: Required<BaileysProviderOptions>;
  private currentSessionId: string | null = null;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;
  private isManualDisconnect: boolean = false;
  private _connected: boolean = false;

  // Message deduplication to prevent processing same message multiple times
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000;

  constructor(options?: BaileysProviderOptions) {
    this.options = {
      authDir: options?.authDir ?? './auth_states',
      printQR: options?.printQR ?? false,
      browser: options?.browser ?? ['WaSP', 'Chrome', '120.0.0'],
      logger: options?.logger ?? { level: 'silent', child: () => ({ level: 'silent' }) },
      proxyUrl: options?.proxyUrl ?? '',
      maxReconnectAttempts: options?.maxReconnectAttempts ?? 5,
      allowedMediaDir: options?.allowedMediaDir ?? '',
    };

    // Ensure auth directory exists
    const authDir = this.options.authDir;
    if (authDir && !fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
  }

  /**
   * Calculate reconnection delay with exponential backoff and jitter
   */
  private getReconnectDelay(): number {
    const baseDelay = 1000; // 1 second
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000 // Max 60 seconds
    );
    // Add ±25% jitter to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Connect to WhatsApp using Baileys
   */
  async connect(sessionId: string, _options?: unknown): Promise<void> {
    // Validate session ID to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new InvalidSessionIdError(sessionId);
    }

    if (this.isConnecting) {
      return;
    }

    if (this.socket && this._connected) {
      return; // Already connected
    }

    this.currentSessionId = sessionId;
    this.isConnecting = true;
    this.isManualDisconnect = false;

    try {
      // Dynamic import to make Baileys optional peer dependency
      let makeWASocket: any;
      let useMultiFileAuthState: any;
      let DisconnectReason: any;
      let getContentType: any;

      try {
        // @ts-ignore - Optional peer dependency, dynamically imported
        const baileys = await import('@whiskeysockets/baileys');
        makeWASocket = baileys.default;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        DisconnectReason = baileys.DisconnectReason;
        getContentType = baileys.getContentType;
      } catch (error) {
        throw new Error(
          'Baileys not installed. Run: npm install @whiskeysockets/baileys'
        );
      }

      const baseAuthDir = this.options.authDir;
      const authDir = path.join(baseAuthDir, sessionId);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      // Optional proxy support
      let agent: any;
      if (this.options.proxyUrl) {
        try {
          // Note: socks-proxy-agent is optional - users must install separately
          // @ts-ignore - Optional peer dependency, dynamically imported
          const module = await import('socks-proxy-agent');
          const SocksProxyAgent = (module as any).SocksProxyAgent;
          agent = new SocksProxyAgent(this.options.proxyUrl);
        } catch {
          console.warn('[BaileysProvider] socks-proxy-agent not installed, skipping proxy');
        }
      }

      this.socket = makeWASocket({
        auth: state,
        logger: this.options.logger,
        printQRInTerminal: this.options.printQR,
        browser: this.options.browser,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        ...(agent ? { agent, fetchAgent: agent } : {}),
        // Required for group message handling
        getMessage: async () => undefined,
      });

      // Handle connection updates
      this.socket.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.events.emit('qr', qr);
          this.events.emit('event', {
            type: EventType.SESSION_QR,
            sessionId: this.currentSessionId!,
            timestamp: new Date(),
            data: { qr },
          });
        }

        if (connection === 'close') {
          const boom = lastDisconnect?.error as any;
          const reason = boom?.output?.statusCode;
          const errorMessage = boom?.message || '';

          // Categorize errors for appropriate handling
          const isBadMac = errorMessage.includes('Bad MAC') || errorMessage.includes('hmac mismatch');
          const isStreamError = reason === DisconnectReason?.restartRequired || errorMessage.includes('Stream Errored');
          const isLoggedOut = reason === DisconnectReason?.loggedOut;
          const isReplaced = reason === DisconnectReason?.connectionReplaced;
          const shouldReconnect = !this.isManualDisconnect && !isLoggedOut && !isReplaced;

          this.socket = null;
          this._connected = false;
          this.isConnecting = false;

          if (this.isManualDisconnect) {
            this.events.emit('disconnected', { reason, shouldReconnect: false });
            this.events.emit('event', {
              type: EventType.SESSION_DISCONNECTED,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: { reason: 'manual', shouldReconnect: false },
            });
          } else if (isBadMac) {
            // Bad MAC errors indicate corrupted session — clear session keys
            try {
              const sessionFiles = fs.readdirSync(authDir)
                .filter(f => f.startsWith('session-') || f.startsWith('pre-key-') || f.startsWith('sender-key-'));
              for (const file of sessionFiles) {
                fs.unlinkSync(path.join(authDir, file));
              }
            } catch {
              // Ignore cleanup errors
            }

            // Reconnect after cleanup — shorter delay
            if (this.reconnectAttempts < 3) {
              this.reconnectAttempts++;
              const delay = 2000 + Math.random() * 2000;
              setTimeout(() => this.connect(this.currentSessionId!), delay);
            } else {
              // Bad MAC persists — full reset needed
              fs.rmSync(authDir, { recursive: true, force: true });
              this.events.emit('disconnected', { reason: 'loggedOut', shouldReconnect: false });
              this.events.emit('event', {
                type: EventType.SESSION_ERROR,
                sessionId: this.currentSessionId!,
                timestamp: new Date(),
                data: { error: new Error('Bad MAC error persists - full auth reset needed') },
              });
            }
          } else if (isStreamError) {
            // Stream errors are transient — quick reconnect
            this.reconnectAttempts++;
            const delay = Math.min(1000 * this.reconnectAttempts, 5000);
            setTimeout(() => this.connect(this.currentSessionId!), delay);
          } else if (reason === 405) {
            // 405 = rate limited — preserve credentials
            this.events.emit('disconnected', { reason: 'rate-limited', shouldReconnect: false });
            this.events.emit('event', {
              type: EventType.SESSION_ERROR,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: { error: new Error('Rate limited by WhatsApp') },
            });
          } else if (shouldReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            // Auto-reconnect with exponential backoff
            this.reconnectAttempts++;
            const delay = this.getReconnectDelay();
            setTimeout(() => this.connect(this.currentSessionId!), delay);
          } else if (isLoggedOut) {
            // Logged out — clear auth
            if (!this.isManualDisconnect) {
              fs.rmSync(authDir, { recursive: true, force: true });
            }
            this.events.emit('disconnected', { reason: 'loggedOut', shouldReconnect: false });
            this.events.emit('event', {
              type: EventType.SESSION_DISCONNECTED,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: { reason: 'loggedOut', shouldReconnect: false },
            });
          } else if (isReplaced) {
            this.events.emit('disconnected', { reason: 'replaced', shouldReconnect: false });
            this.events.emit('event', {
              type: EventType.SESSION_DISCONNECTED,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: { reason: 'replaced', shouldReconnect: false },
            });
          } else {
            // Permanent disconnect
            this.events.emit('disconnected', { reason: 'unknown', shouldReconnect: false });
            this.events.emit('event', {
              type: EventType.SESSION_DISCONNECTED,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: { reason: 'max-retries', shouldReconnect: false },
            });
          }
        }

        if (connection === 'open') {
          this.phoneNumber = this.socket.user?.id?.split(':')[0] ?? null;
          this._connected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.events.emit('connected', { phone: this.phoneNumber });
          this.events.emit('event', {
            type: EventType.SESSION_CONNECTED,
            sessionId: this.currentSessionId!,
            timestamp: new Date(),
            data: { phone: this.phoneNumber },
          });
        }
      });

      // Handle credentials update
      this.socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', async ({ messages, type }: any) => {
        if (type !== 'notify') return; // Skip non-notification messages

        for (const msg of messages) {
          const normalized = this.normalizeMessage(msg, getContentType);
          if (normalized) {
            // Deduplication
            if (this.processedMessages.has(normalized.id)) {
              continue;
            }
            this.processedMessages.add(normalized.id);

            // Trim deduplication cache
            if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
              const entries = Array.from(this.processedMessages);
              const toDelete = Math.floor(entries.length * 0.3); // Remove 30%
              for (let i = 0; i < toDelete; i++) {
                this.processedMessages.delete(entries[i]!);
              }
            }

            this.events.emit('message', normalized);
            this.events.emit('event', {
              type: EventType.MESSAGE_RECEIVED,
              sessionId: this.currentSessionId!,
              timestamp: new Date(),
              data: normalized,
            });
          }
        }
      });
    } catch (error) {
      this.isConnecting = false;
      this.events.emit('error', error);
      this.events.emit('event', {
        type: EventType.SESSION_ERROR,
        sessionId: this.currentSessionId!,
        timestamp: new Date(),
        data: { error },
      });
      throw error;
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    this.isManualDisconnect = true;

    if (this.socket) {
      try {
        await this.socket.logout();
      } catch {
        // Ignore logout errors
      }
      this.socket = null;
    }

    this.currentSessionId = null;
    this.phoneNumber = null;
    this.qrCode = null;
    this._connected = false;
    this.processedMessages.clear();
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
    if (!this.socket || !this._connected) {
      throw new NotConnectedError();
    }

    try {
      const jid = this.formatJid(to);
      const message: any = { text: content };

      if (options?.quoted) {
        message.quoted = options.quoted;
      }

      // Handle media
      if (options?.media) {
        if (typeof options.media === 'string') {
          // URL or file path
          if (options.media.startsWith('http://') || options.media.startsWith('https://')) {
            message.image = { url: options.media };
          } else {
            // File path - validate it's within allowed directory
            if (this.options.allowedMediaDir) {
              const resolvedPath = path.resolve(options.media);
              const allowedDir = path.resolve(this.options.allowedMediaDir);

              if (!resolvedPath.startsWith(allowedDir)) {
                throw new Error(`Media file path must be within allowed directory: ${allowedDir}`);
              }
            } else {
              throw new Error('File path media requires allowedMediaDir to be configured for security');
            }

            message.image = fs.readFileSync(options.media);
          }
        } else {
          // Buffer
          message.image = options.media;
        }
        message.caption = content;
        delete message.text;
      }

      const sent = await this.socket.sendMessage(jid, message);

      const result: Message = {
        id: sent.key.id ?? `msg-${Date.now()}`,
        from: this.phoneNumber ?? '',
        to,
        type: options?.media ? MessageType.IMAGE : MessageType.TEXT,
        content,
        timestamp: new Date(),
        isGroup: to.includes('@g.us'),
        groupId: to.includes('@g.us') ? to : undefined,
        mediaUrl: options?.media ? (typeof options.media === 'string' ? options.media : undefined) : undefined,
        mediaMimeType: options?.mediaMimeType,
      };

      this.events.emit('event', {
        type: EventType.MESSAGE_SENT,
        sessionId: this.currentSessionId!,
        timestamp: new Date(),
        data: result,
      });

      return result;
    } catch (error) {
      this.events.emit('error', error);
      throw error;
    }
  }

  /**
   * Send a reaction
   */
  async sendReaction(_messageId: string, _emoji: string): Promise<void> {
    if (!this.socket || !this._connected) {
      throw new NotConnectedError();
    }

    // Note: This requires the message key which we don't have in the current interface
    // For now, we throw an error
    throw new Error('Reaction sending requires message key - use provider directly for reactions');
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
    return this._connected && this.socket !== null;
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
  private normalizeMessage(msg: WAMessage, getContentType: any): Message | null {
    try {
      const messageContent = msg.message;
      if (!messageContent) return null;

      const contentType = getContentType(messageContent);
      if (!contentType) return null;

      const content = messageContent[contentType];
      let text = '';
      let messageType = MessageType.TEXT;
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;

      // Extract text based on content type
      if (contentType === 'conversation') {
        text = messageContent.conversation;
      } else if (contentType === 'extendedTextMessage') {
        text = content.text ?? '';
      } else if (contentType === 'imageMessage') {
        text = content.caption ?? '';
        messageType = MessageType.IMAGE;
        mediaMimeType = content.mimetype;
      } else if (contentType === 'videoMessage') {
        text = content.caption ?? '';
        messageType = MessageType.VIDEO;
        mediaMimeType = content.mimetype;
      } else if (contentType === 'audioMessage') {
        messageType = MessageType.AUDIO;
        mediaMimeType = content.mimetype;
      } else if (contentType === 'documentMessage') {
        text = content.caption ?? '';
        messageType = MessageType.DOCUMENT;
        mediaMimeType = content.mimetype;
      } else if (contentType === 'stickerMessage') {
        messageType = MessageType.STICKER;
        mediaMimeType = content.mimetype;
      } else {
        return null; // Unsupported message type
      }

      const fromJid = msg.key.remoteJid ?? '';
      const senderJid = msg.key.participant ?? fromJid;

      // Extract quoted message if present
      let quotedMessage;
      if (content.contextInfo?.quotedMessage) {
        quotedMessage = {
          id: content.contextInfo.stanzaId ?? '',
          from: content.contextInfo.participant ?? '',
          content: content.contextInfo.quotedMessage.conversation ?? '',
        };
      }

      return {
        id: msg.key.id ?? `msg-${Date.now()}`,
        from: senderJid,
        to: fromJid,
        type: messageType,
        content: text,
        timestamp: new Date((msg.messageTimestamp as number) * 1000),
        isGroup: fromJid.includes('@g.us'),
        groupId: fromJid.includes('@g.us') ? fromJid : undefined,
        quotedMessage,
        mediaUrl,
        mediaMimeType,
        raw: msg,
      };
    } catch (error) {
      this.events.emit('error', error);
      return null;
    }
  }

  /**
   * Format phone number to WhatsApp JID
   */
  private formatJid(identifier: string): string {
    // If already a JID, return as-is
    if (identifier.includes('@')) {
      return identifier;
    }

    // Otherwise, assume it's a phone number
    const normalized = identifier.replace(/[^0-9]/g, '');
    return `${normalized}@s.whatsapp.net`;
  }
}
