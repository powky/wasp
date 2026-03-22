/**
 * Meta WhatsApp Cloud API provider implementation
 *
 * REST-based provider for Meta's WhatsApp Cloud API.
 * Enables interactive messages (buttons, lists) that aren't available in Baileys.
 */

import { EventEmitter } from 'events';
import type {
  Provider,
  ProviderType,
  Message,
  SendMessageOptions,
} from '../types.js';
import { MessageType, EventType } from '../types.js';
import { InvalidSessionIdError, NotConnectedError } from '../errors.js';

/**
 * Cloud API provider options
 */
export interface CloudAPIProviderOptions {
  /** Meta access token (starts with EAA...) */
  accessToken: string;
  /** WhatsApp Business Phone Number ID */
  phoneNumberId: string;
  /** WhatsApp Business Account ID (optional) */
  wabaId?: string;
  /** Graph API version (default: v22.0) */
  apiVersion?: string;
  /** Webhook verify token for incoming webhooks */
  webhookVerifyToken?: string;
  /** Base URL for Graph API (default: https://graph.facebook.com) */
  baseUrl?: string;
  /** Phone number for this account (optional, fetched if not provided) */
  phoneNumber?: string;
}

/**
 * Interactive button message structure
 */
export interface InteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

/**
 * Interactive list section
 */
export interface ListSection {
  title?: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

/**
 * Interactive message content
 */
export interface InteractiveMessage {
  type: 'interactive';
  interactive: {
    type: 'button' | 'list';
    header?: {
      type: 'text' | 'image' | 'video' | 'document';
      text?: string;
      image?: { link: string };
      video?: { link: string };
      document?: { link: string };
    };
    body: {
      text: string;
    };
    footer?: {
      text: string;
    };
    action: {
      buttons?: InteractiveButton[];
      button?: string; // For list messages
      sections?: ListSection[];
    };
  };
}

/**
 * Template message
 */
export interface TemplateMessage {
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters: Array<{
        type: string;
        text?: string;
        image?: { link: string };
        video?: { link: string };
        document?: { link: string };
      }>;
    }>;
  };
}

/**
 * Location message
 */
export interface LocationMessage {
  type: 'location';
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

/**
 * Contact message
 */
export interface ContactMessage {
  type: 'contacts';
  contacts: Array<{
    name: {
      formatted_name: string;
      first_name?: string;
      last_name?: string;
    };
    phones?: Array<{
      phone: string;
      type?: string;
    }>;
    emails?: Array<{
      email: string;
      type?: string;
    }>;
  }>;
}

/**
 * Media message
 */
export interface MediaMessage {
  type: 'image' | 'video' | 'audio' | 'document';
  [key: string]: any; // Dynamic key based on type
}

/**
 * Reaction message
 */
export interface ReactionMessage {
  type: 'reaction';
  reaction: {
    message_id: string;
    emoji: string;
  };
}

/**
 * Union type for all Cloud API message types
 */
export type CloudAPIMessageContent =
  | string
  | InteractiveMessage
  | TemplateMessage
  | LocationMessage
  | ContactMessage
  | MediaMessage
  | ReactionMessage;

/**
 * Cloud API error response
 */
interface CloudAPIError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}

/**
 * Cloud API success response
 */
interface CloudAPISendResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

/**
 * Webhook entry structure
 */
interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: 'whatsapp';
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: {
          caption?: string;
          mime_type: string;
          sha256: string;
          id: string;
        };
        video?: {
          caption?: string;
          mime_type: string;
          sha256: string;
          id: string;
        };
        audio?: {
          mime_type: string;
          sha256: string;
          id: string;
        };
        document?: {
          caption?: string;
          filename?: string;
          mime_type: string;
          sha256: string;
          id: string;
        };
        location?: {
          latitude: number;
          longitude: number;
          name?: string;
          address?: string;
        };
        contacts?: Array<{
          name: { formatted_name: string };
          phones?: Array<{ phone: string }>;
        }>;
        reaction?: {
          message_id: string;
          emoji: string;
        };
        interactive?: {
          type: string;
          button_reply?: {
            id: string;
            title: string;
          };
          list_reply?: {
            id: string;
            title: string;
            description?: string;
          };
        };
        context?: {
          from: string;
          id: string;
        };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: string;
  }>;
}

/**
 * Cloud API Provider
 *
 * Implements the Provider interface using Meta's WhatsApp Cloud API.
 * This is a REST-based provider (no WebSocket) that supports advanced
 * interactive messages like buttons and lists.
 *
 * @example
 * ```typescript
 * import { CloudAPIProvider } from '@wasp/core/providers/cloud-api';
 *
 * const provider = new CloudAPIProvider({
 *   accessToken: 'YOUR_ACCESS_TOKEN',
 *   phoneNumberId: '123456789012345',
 * });
 *
 * await provider.connect('session-1');
 *
 * // Send button message
 * await provider.sendMessage('15551234567', {
 *   type: 'interactive',
 *   interactive: {
 *     type: 'button',
 *     body: { text: 'Choose an option' },
 *     action: {
 *       buttons: [
 *         { type: 'reply', reply: { id: 'yes', title: 'Yes' }},
 *         { type: 'reply', reply: { id: 'no', title: 'No' }},
 *       ]
 *     }
 *   }
 * });
 * ```
 */
export class CloudAPIProvider implements Provider {
  readonly type: ProviderType = 'CLOUD_API' as ProviderType;
  readonly events: EventEmitter = new EventEmitter();

  private options: Required<CloudAPIProviderOptions>;
  private _connected: boolean = false;
  private currentSessionId: string | null = null;

  constructor(options: CloudAPIProviderOptions) {
    this.options = {
      accessToken: options.accessToken,
      phoneNumberId: options.phoneNumberId,
      wabaId: options.wabaId ?? '',
      apiVersion: options.apiVersion ?? 'v22.0',
      webhookVerifyToken: options.webhookVerifyToken ?? '',
      baseUrl: options.baseUrl ?? 'https://graph.facebook.com',
      phoneNumber: options.phoneNumber ?? '',
    };

    if (!this.options.accessToken) {
      throw new Error('CloudAPIProvider requires accessToken');
    }
    if (!this.options.phoneNumberId) {
      throw new Error('CloudAPIProvider requires phoneNumberId');
    }
  }

  /**
   * Connect to WhatsApp Cloud API
   *
   * For Cloud API, this verifies the access token by making a test API call
   */
  async connect(sessionId: string, _options?: unknown): Promise<void> {
    // Validate session ID
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new InvalidSessionIdError(sessionId);
    }

    this.currentSessionId = sessionId;

    try {
      // Verify token by fetching phone number info
      const url = `${this.options.baseUrl}/${this.options.apiVersion}/${this.options.phoneNumberId}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.options.accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json() as CloudAPIError;
        throw new Error(`Cloud API connection failed: ${error.error.message}`);
      }

      const data = await response.json() as any;

      // Extract phone number if available
      if (data.display_phone_number) {
        this.options.phoneNumber = data.display_phone_number.replace(/\D/g, '');
      }

      this._connected = true;

      this.events.emit('connected', { phone: this.options.phoneNumber });
      this.events.emit('event', {
        type: EventType.SESSION_CONNECTED,
        sessionId: this.currentSessionId,
        timestamp: new Date(),
        data: { phone: this.options.phoneNumber },
      });
    } catch (error) {
      this._connected = false;
      this.events.emit('error', error);
      this.events.emit('event', {
        type: EventType.SESSION_ERROR,
        sessionId: this.currentSessionId,
        timestamp: new Date(),
        data: { error },
      });
      throw error;
    }
  }

  /**
   * Disconnect from Cloud API
   *
   * For REST API, this just sets connected state to false
   */
  async disconnect(): Promise<void> {
    this._connected = false;
    this.currentSessionId = null;

    this.events.emit('disconnected', { shouldReconnect: false });
  }

  /**
   * Send a message via Cloud API
   */
  async sendMessage(
    to: string,
    content: string | CloudAPIMessageContent,
    options?: SendMessageOptions
  ): Promise<Message> {
    if (!this._connected) {
      throw new NotConnectedError();
    }

    try {
      const recipientPhone = this.formatPhoneNumber(to);

      // Build message payload
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
      };

      // Handle different message types
      if (typeof content === 'string') {
        // Simple text message
        payload.type = 'text';
        payload.text = { body: content };

        // Add context (quoted message) if provided
        if (options?.quoted) {
          payload.context = { message_id: options.quoted };
        }
      } else if (typeof content === 'object') {
        // Complex message (interactive, template, media, etc.)
        const typedContent = content as any;
        payload.type = typedContent.type;

        switch (typedContent.type) {
          case 'interactive':
            payload.interactive = typedContent.interactive;
            break;
          case 'template':
            payload.template = typedContent.template;
            break;
          case 'location':
            payload.location = typedContent.location;
            break;
          case 'contacts':
            payload.contacts = typedContent.contacts;
            break;
          case 'image':
          case 'video':
          case 'audio':
          case 'document': {
            const mediaType = typedContent.type;
            payload[mediaType] = typedContent[mediaType];
            break;
          }
          case 'reaction':
            payload.reaction = typedContent.reaction;
            break;
          default:
            throw new Error(`Unsupported message type: ${typedContent.type}`);
        }
      }

      // Send the message
      const url = `${this.options.baseUrl}/${this.options.apiVersion}/${this.options.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json() as CloudAPIError;
        throw new Error(`Cloud API send failed: ${error.error.message} (code: ${error.error.code})`);
      }

      const result = await response.json() as CloudAPISendResponse;

      // Build normalized message
      const messageContent = typeof content === 'string' ? content : this.extractContentText(content);
      const messageType = this.mapToMessageType(payload.type);

      const message: Message = {
        id: result.messages[0]?.id ?? `msg-${Date.now()}`,
        from: this.options.phoneNumber,
        to: recipientPhone,
        type: messageType,
        content: messageContent,
        timestamp: new Date(),
        isGroup: false,
        raw: result,
      };

      this.events.emit('event', {
        type: EventType.MESSAGE_SENT,
        sessionId: this.currentSessionId!,
        timestamp: new Date(),
        data: message,
      });

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
    await this.sendMessage('', {
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    } as ReactionMessage);
  }

  /**
   * Cloud API doesn't use QR codes
   */
  async getQR(): Promise<string | null> {
    return null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get phone number
   */
  getPhoneNumber(): string | null {
    return this.options.phoneNumber || null;
  }

  /**
   * Cloud API doesn't have a socket
   */
  getSocket(): null {
    return null;
  }

  /**
   * Verify webhook signature (for incoming webhooks)
   *
   * @param req Request object with query parameters
   * @param verifyToken Your webhook verify token
   * @returns Challenge string if verification succeeds, null otherwise
   */
  static verifyWebhook(
    req: { query: Record<string, string> },
    verifyToken: string
  ): string | null {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge || null;
    }

    return null;
  }

  /**
   * Parse incoming webhook payload into WaSP messages
   *
   * @param body Webhook POST body from Meta
   * @returns Array of normalized WaSP messages
   */
  static parseWebhook(body: any): Message[] {
    const messages: Message[] = [];

    if (!body.entry || !Array.isArray(body.entry)) {
      return messages;
    }

    for (const entry of body.entry as WebhookEntry[]) {
      if (!entry.changes || !Array.isArray(entry.changes)) {
        continue;
      }

      for (const change of entry.changes) {
        if (change.field !== 'messages' || !change.value.messages) {
          continue;
        }

        const metadata = change.value.metadata;

        for (const msg of change.value.messages) {
          try {
            const normalized = this.normalizeWebhookMessage(msg, metadata);
            if (normalized) {
              messages.push(normalized);
            }
          } catch (error) {
            console.error('[CloudAPIProvider] Failed to parse webhook message:', error);
          }
        }
      }
    }

    return messages;
  }

  /**
   * Normalize a webhook message to WaSP format
   */
  private static normalizeWebhookMessage(msg: any, metadata: any): Message | null {
    let content = '';
    let messageType = MessageType.TEXT;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let quotedMessage;

    // Extract content based on message type
    switch (msg.type) {
      case 'text':
        content = msg.text?.body ?? '';
        messageType = MessageType.TEXT;
        break;

      case 'image':
        content = msg.image?.caption ?? '';
        messageType = MessageType.IMAGE;
        mediaUrl = msg.image?.id; // Media ID, can be fetched later
        mediaMimeType = msg.image?.mime_type;
        break;

      case 'video':
        content = msg.video?.caption ?? '';
        messageType = MessageType.VIDEO;
        mediaUrl = msg.video?.id;
        mediaMimeType = msg.video?.mime_type;
        break;

      case 'audio':
        messageType = MessageType.AUDIO;
        mediaUrl = msg.audio?.id;
        mediaMimeType = msg.audio?.mime_type;
        break;

      case 'document':
        content = msg.document?.caption ?? '';
        messageType = MessageType.DOCUMENT;
        mediaUrl = msg.document?.id;
        mediaMimeType = msg.document?.mime_type;
        break;

      case 'location':
        content = msg.location?.name ?? msg.location?.address ?? 'Location';
        messageType = MessageType.LOCATION;
        break;

      case 'contacts':
        content = msg.contacts?.[0]?.name?.formatted_name ?? 'Contact';
        messageType = MessageType.CONTACT;
        break;

      case 'reaction':
        content = msg.reaction?.emoji ?? '';
        messageType = MessageType.REACTION;
        break;

      case 'interactive':
        // Button or list reply
        if (msg.interactive?.button_reply) {
          content = msg.interactive.button_reply.title;
        } else if (msg.interactive?.list_reply) {
          content = msg.interactive.list_reply.title;
        }
        messageType = MessageType.TEXT;
        break;

      case 'sticker':
        messageType = MessageType.STICKER;
        break;

      default:
        // Unsupported type
        return null;
    }

    // Extract quoted message context
    if (msg.context?.id) {
      quotedMessage = {
        id: msg.context.id,
        from: msg.context.from ?? '',
        content: '',
      };
    }

    return {
      id: msg.id,
      from: `${msg.from}@s.whatsapp.net`,
      to: `${metadata.phone_number_id}@s.whatsapp.net`,
      type: messageType,
      content,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      isGroup: false,
      quotedMessage,
      mediaUrl,
      mediaMimeType,
      raw: msg,
    };
  }

  /**
   * Format phone number (remove @ suffix if present)
   */
  private formatPhoneNumber(identifier: string): string {
    // Remove @s.whatsapp.net if present
    return identifier.replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
  }

  /**
   * Extract text content from complex message types
   */
  private extractContentText(content: CloudAPIMessageContent): string {
    if (typeof content === 'string') {
      return content;
    }

    const typed = content as any;

    if (typed.interactive?.body?.text) {
      return typed.interactive.body.text;
    }
    if (typed.template?.name) {
      return `Template: ${typed.template.name}`;
    }
    if (typed.location) {
      return typed.location.name || typed.location.address || 'Location';
    }
    if (typed.contacts?.[0]?.name?.formatted_name) {
      return typed.contacts[0].name.formatted_name;
    }
    if (typed.reaction?.emoji) {
      return typed.reaction.emoji;
    }

    return '';
  }

  /**
   * Map Cloud API message type to WaSP MessageType
   */
  private mapToMessageType(type: string): MessageType {
    const typeMap: Record<string, MessageType> = {
      text: MessageType.TEXT,
      image: MessageType.IMAGE,
      video: MessageType.VIDEO,
      audio: MessageType.AUDIO,
      document: MessageType.DOCUMENT,
      location: MessageType.LOCATION,
      contacts: MessageType.CONTACT,
      reaction: MessageType.REACTION,
      sticker: MessageType.STICKER,
      interactive: MessageType.TEXT, // Interactive messages are treated as text
      template: MessageType.TEXT,
    };

    return typeMap[type] ?? MessageType.TEXT;
  }
}
