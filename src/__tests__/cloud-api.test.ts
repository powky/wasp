/**
 * Tests for CloudAPIProvider
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CloudAPIProvider } from '../providers/cloud-api.js';
import { NotConnectedError, InvalidSessionIdError } from '../errors.js';
import { MessageType } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('CloudAPIProvider', () => {
  let provider: CloudAPIProvider;

  beforeEach(() => {
    provider = new CloudAPIProvider({
      accessToken: 'YOUR_ACCESS_TOKEN',
      phoneNumberId: '123456789012345',
      apiVersion: 'v22.0',
    });

    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if accessToken is missing', () => {
      expect(() => {
        new CloudAPIProvider({
          accessToken: '',
          phoneNumberId: '123',
        });
      }).toThrow('CloudAPIProvider requires accessToken');
    });

    it('should throw if phoneNumberId is missing', () => {
      expect(() => {
        new CloudAPIProvider({
          accessToken: 'token',
          phoneNumberId: '',
        });
      }).toThrow('CloudAPIProvider requires phoneNumberId');
    });

    it('should set default values', () => {
      expect(provider.type).toBe('CLOUD_API');
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should validate session ID format', async () => {
      await expect(provider.connect('invalid/session')).rejects.toThrow(InvalidSessionIdError);
    });

    it('should verify token by calling Graph API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_phone_number: '+1 555 123 4567',
          id: '123456789012345',
        }),
      });

      await provider.connect('test-session');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/123456789012345',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer YOUR_ACCESS_TOKEN',
          },
        })
      );

      expect(provider.isConnected()).toBe(true);
      expect(provider.getPhoneNumber()).toBe('15551234567');
    });

    it('should handle connection errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            message: 'Invalid OAuth access token',
            type: 'OAuthException',
            code: 190,
            fbtrace_id: 'abc123',
          },
        }),
      });

      await expect(provider.connect('test-session')).rejects.toThrow(
        'Cloud API connection failed: Invalid OAuth access token'
      );

      expect(provider.isConnected()).toBe(false);
    });

    it('should emit connected event on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_phone_number: '+1 555 123 4567',
        }),
      });

      const connectedSpy = vi.fn();
      provider.events.on('connected', connectedSpy);

      await provider.connect('test-session');

      expect(connectedSpy).toHaveBeenCalledWith({
        phone: '15551234567',
      });
    });
  });

  describe('disconnect', () => {
    it('should set connected state to false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.connect('test-session');
      expect(provider.isConnected()).toBe(true);

      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });

    it('should emit disconnected event', async () => {
      const disconnectedSpy = vi.fn();
      provider.events.on('disconnected', disconnectedSpy);

      await provider.disconnect();

      expect(disconnectedSpy).toHaveBeenCalledWith({
        shouldReconnect: false,
      });
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      // Connect first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          display_phone_number: '+1 555 123 4567',
        }),
      });
      await provider.connect('test-session');
      mockFetch.mockClear();
    });

    it('should throw if not connected', async () => {
      await provider.disconnect();

      await expect(
        provider.sendMessage('27821234567', 'Hello')
      ).rejects.toThrow(NotConnectedError);
    });

    it('should send text message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.123' }],
        }),
      });

      const message = await provider.sendMessage('27821234567@s.whatsapp.net', 'Hello World');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v22.0/123456789012345/messages',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer YOUR_ACCESS_TOKEN',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '27821234567',
            type: 'text',
            text: { body: 'Hello World' },
          }),
        })
      );

      expect(message.id).toBe('wamid.123');
      expect(message.content).toBe('Hello World');
      expect(message.type).toBe(MessageType.TEXT);
    });

    it('should send text message with quoted reply', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.456' }],
        }),
      });

      await provider.sendMessage('27821234567', 'Reply text', {
        quoted: 'wamid.original',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.context).toEqual({ message_id: 'wamid.original' });
    });

    it('should send interactive button message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.interactive' }],
        }),
      });

      await provider.sendMessage('27821234567', {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Choose an option' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
              { type: 'reply', reply: { id: 'no', title: 'No' } },
            ],
          },
        },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('interactive');
      expect(callBody.interactive.type).toBe('button');
      expect(callBody.interactive.action.buttons).toHaveLength(2);
    });

    it('should send interactive list message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.list' }],
        }),
      });

      await provider.sendMessage('27821234567', {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: 'Select a product' },
          action: {
            button: 'View Menu',
            sections: [
              {
                title: 'Main Dishes',
                rows: [
                  { id: 'pizza', title: 'Pizza', description: 'Delicious pizza' },
                  { id: 'burger', title: 'Burger', description: 'Juicy burger' },
                ],
              },
            ],
          },
        },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('interactive');
      expect(callBody.interactive.type).toBe('list');
      expect(callBody.interactive.action.sections).toHaveLength(1);
    });

    it('should send template message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.template' }],
        }),
      });

      await provider.sendMessage('27821234567', {
        type: 'template',
        template: {
          name: 'welcome_message',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: 'John' }],
            },
          ],
        },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('template');
      expect(callBody.template.name).toBe('welcome_message');
    });

    it('should send location message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.location' }],
        }),
      });

      await provider.sendMessage('27821234567', {
        type: 'location',
        location: {
          latitude: -33.9249,
          longitude: 18.4241,
          name: 'Cape Town',
          address: 'South Africa',
        },
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('location');
      expect(callBody.location.latitude).toBe(-33.9249);
    });

    it('should send contact message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'wamid.contact' }],
        }),
      });

      await provider.sendMessage('27821234567', {
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: 'John Doe',
              first_name: 'John',
              last_name: 'Doe',
            },
            phones: [{ phone: '+27821234567', type: 'MOBILE' }],
          },
        ],
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('contacts');
      expect(callBody.contacts[0].name.formatted_name).toBe('John Doe');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            message: 'Message failed to send',
            type: 'OAuthException',
            code: 100,
            fbtrace_id: 'xyz789',
          },
        }),
      });

      await expect(
        provider.sendMessage('27821234567', 'Test')
      ).rejects.toThrow('Cloud API send failed: Message failed to send (code: 100)');
    });
  });

  describe('sendReaction', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ display_phone_number: '+1 555 123 4567' }),
      });
      await provider.connect('test-session');
      mockFetch.mockClear();
    });

    it('should send reaction message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [],
          messages: [{ id: 'wamid.reaction' }],
        }),
      });

      await provider.sendReaction('wamid.123', '👍');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('reaction');
      expect(callBody.reaction.message_id).toBe('wamid.123');
      expect(callBody.reaction.emoji).toBe('👍');
    });
  });

  describe('getQR', () => {
    it('should return null (Cloud API does not use QR)', async () => {
      const qr = await provider.getQR();
      expect(qr).toBeNull();
    });
  });

  describe('getSocket', () => {
    it('should return null (Cloud API is REST-based)', () => {
      const socket = provider.getSocket();
      expect(socket).toBeNull();
    });
  });

  describe('verifyWebhook', () => {
    it('should return challenge if token matches', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'my-secret-token',
          'hub.challenge': 'challenge-string-123',
        },
      };

      const result = CloudAPIProvider.verifyWebhook(req, 'my-secret-token');
      expect(result).toBe('challenge-string-123');
    });

    it('should return null if token does not match', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge-string-123',
        },
      };

      const result = CloudAPIProvider.verifyWebhook(req, 'my-secret-token');
      expect(result).toBeNull();
    });

    it('should return null if mode is not subscribe', () => {
      const req = {
        query: {
          'hub.mode': 'invalid',
          'hub.verify_token': 'my-secret-token',
          'hub.challenge': 'challenge-string-123',
        },
      };

      const result = CloudAPIProvider.verifyWebhook(req, 'my-secret-token');
      expect(result).toBeNull();
    });
  });

  describe('parseWebhook', () => {
    it('should parse text message from webhook', () => {
      const webhookBody = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '987654321098765',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15551234567',
                    phone_number_id: '123456789012345',
                  },
                  contacts: [
                    {
                      profile: { name: 'John Doe' },
                      wa_id: '27821234567',
                    },
                  ],
                  messages: [
                    {
                      from: '27821234567',
                      id: 'wamid.abc123',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'Hello from webhook!' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const messages = CloudAPIProvider.parseWebhook(webhookBody);

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('wamid.abc123');
      expect(messages[0].content).toBe('Hello from webhook!');
      expect(messages[0].type).toBe(MessageType.TEXT);
      expect(messages[0].from).toBe('27821234567@s.whatsapp.net');
    });

    it('should parse image message from webhook', () => {
      const webhookBody = {
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: '123456789012345',
                  },
                  messages: [
                    {
                      from: '27821234567',
                      id: 'wamid.img123',
                      timestamp: '1234567890',
                      type: 'image',
                      image: {
                        caption: 'Check this out!',
                        mime_type: 'image/jpeg',
                        sha256: 'abc123',
                        id: 'media-id-123',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const messages = CloudAPIProvider.parseWebhook(webhookBody);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MessageType.IMAGE);
      expect(messages[0].content).toBe('Check this out!');
      expect(messages[0].mediaUrl).toBe('media-id-123');
      expect(messages[0].mediaMimeType).toBe('image/jpeg');
    });

    it('should parse interactive button reply from webhook', () => {
      const webhookBody = {
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '123456789012345' },
                  messages: [
                    {
                      from: '27821234567',
                      id: 'wamid.btn123',
                      timestamp: '1234567890',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: {
                          id: 'yes',
                          title: 'Yes',
                        },
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const messages = CloudAPIProvider.parseWebhook(webhookBody);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MessageType.TEXT);
      expect(messages[0].content).toBe('Yes');
    });

    it('should parse reaction from webhook', () => {
      const webhookBody = {
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '123456789012345' },
                  messages: [
                    {
                      from: '27821234567',
                      id: 'wamid.reaction123',
                      timestamp: '1234567890',
                      type: 'reaction',
                      reaction: {
                        message_id: 'wamid.original',
                        emoji: '❤️',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const messages = CloudAPIProvider.parseWebhook(webhookBody);

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe(MessageType.REACTION);
      expect(messages[0].content).toBe('❤️');
    });

    it('should handle empty or invalid webhook body', () => {
      expect(CloudAPIProvider.parseWebhook({})).toEqual([]);
      expect(CloudAPIProvider.parseWebhook({ entry: [] })).toEqual([]);
      expect(CloudAPIProvider.parseWebhook({ entry: [{ changes: [] }] })).toEqual([]);
    });

    it('should skip non-message changes', () => {
      const webhookBody = {
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '123456789012345' },
                  statuses: [
                    {
                      id: 'wamid.status',
                      status: 'delivered',
                      timestamp: '1234567890',
                      recipient_id: '27821234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const messages = CloudAPIProvider.parseWebhook(webhookBody);
      expect(messages).toEqual([]);
    });
  });
});
