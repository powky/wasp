/**
 * Example: CloudAPIProvider with Interactive Buttons
 *
 * Demonstrates how to use Meta's WhatsApp Cloud API to send
 * interactive button messages through WaSP.
 *
 * Requirements:
 * - Meta WhatsApp Business Account
 * - Access token from Meta Business Manager
 * - Phone Number ID from WhatsApp Cloud API
 */

import { WaSP } from '../src/index.js';

async function main() {
  // Create WaSP instance with Cloud API as default provider
  const wasp = new WaSP({
    defaultProvider: 'CLOUD_API',
    debug: true,
  });

  try {
    // Create session with Cloud API provider
    const session = await wasp.createSession('cloud-session-1', 'CLOUD_API', {
      accessToken: process.env.META_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || '123456789012345',
      webhookVerifyToken: 'my-secret-verify-token',
    });

    console.log('✓ Session created:', session.id);
    console.log('✓ Phone number:', session.phone);

    // Listen for events
    wasp.on('MESSAGE_RECEIVED', (event) => {
      console.log('📩 Received message:', event.data);
    });

    wasp.on('MESSAGE_SENT', (event) => {
      console.log('✉️ Sent message:', event.data);
    });

    // Example 1: Simple text message
    console.log('\n--- Example 1: Text Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      'Hello! This is a text message from Cloud API.',
      { immediate: true }
    );

    // Example 2: Interactive button message
    console.log('\n--- Example 2: Button Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: 'Would you like to continue?' },
          footer: { text: 'Powered by WaSP' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'yes', title: 'Yes, continue' } },
              { type: 'reply', reply: { id: 'no', title: 'No, cancel' } },
            ],
          },
        },
      },
      { immediate: true }
    );

    // Example 3: Button message with header
    console.log('\n--- Example 3: Button with Header ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'interactive',
        interactive: {
          type: 'button',
          header: {
            type: 'text',
            text: '🎉 Special Offer!',
          },
          body: { text: 'Get 50% off your first purchase. Interested?' },
          footer: { text: 'Offer expires in 24 hours' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'claim', title: 'Claim Offer' } },
              { type: 'reply', reply: { id: 'later', title: 'Remind me later' } },
              { type: 'reply', reply: { id: 'skip', title: 'Not interested' } },
            ],
          },
        },
      },
      { immediate: true }
    );

    // Example 4: List message
    console.log('\n--- Example 4: List Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: 'Our Menu',
          },
          body: { text: 'Select your favorite dish' },
          footer: { text: 'All items freshly prepared' },
          action: {
            button: 'View Menu',
            sections: [
              {
                title: 'Main Dishes',
                rows: [
                  { id: 'pizza', title: 'Pizza Margherita', description: 'Classic Italian pizza - R89' },
                  { id: 'burger', title: 'Beef Burger', description: 'Juicy angus beef - R75' },
                  { id: 'pasta', title: 'Pasta Carbonara', description: 'Creamy pasta - R82' },
                ],
              },
              {
                title: 'Desserts',
                rows: [
                  { id: 'cake', title: 'Chocolate Cake', description: 'Rich chocolate - R45' },
                  { id: 'icecream', title: 'Ice Cream', description: 'Vanilla/Chocolate - R35' },
                ],
              },
            ],
          },
        },
      },
      { immediate: true }
    );

    // Example 5: Location message
    console.log('\n--- Example 5: Location Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'location',
        location: {
          latitude: -33.9249,
          longitude: 18.4241,
          name: 'Table Mountain',
          address: 'Cape Town, South Africa',
        },
      },
      { immediate: true }
    );

    // Example 6: Template message (requires pre-approved template)
    console.log('\n--- Example 6: Template Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'template',
        template: {
          name: 'welcome_message',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'John' }, // Replace {{1}} in template
              ],
            },
          ],
        },
      },
      { immediate: true }
    );

    // Example 7: Contact message
    console.log('\n--- Example 7: Contact Message ---');
    await wasp.sendMessage(
      'cloud-session-1',
      '15551234567',
      {
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: 'John Doe',
              first_name: 'John',
              last_name: 'Doe',
            },
            phones: [
              { phone: '+27821234567', type: 'MOBILE' },
              { phone: '+27215551234', type: 'WORK' },
            ],
            emails: [{ email: 'john.doe@example.com', type: 'WORK' }],
          },
        ],
      },
      { immediate: true }
    );

    console.log('\n✓ All examples sent successfully!');

    // Keep process alive to receive messages
    console.log('\n🔄 Listening for incoming messages... (Ctrl+C to exit)');

    // Handle incoming webhooks
    // In a real application, you would set up an Express server:
    /*
    import express from 'express';
    import { CloudAPIProvider } from '@wasp/core';

    const app = express();
    app.use(express.json());

    // Webhook verification
    app.get('/webhook', (req, res) => {
      const challenge = CloudAPIProvider.verifyWebhook(req, 'my-secret-verify-token');
      if (challenge) {
        res.send(challenge);
      } else {
        res.sendStatus(403);
      }
    });

    // Webhook receiver
    app.post('/webhook', (req, res) => {
      const messages = CloudAPIProvider.parseWebhook(req.body);

      for (const message of messages) {
        wasp.emit('MESSAGE_RECEIVED', {
          type: 'MESSAGE_RECEIVED',
          sessionId: 'cloud-session-1',
          timestamp: new Date(),
          data: message,
        });
      }

      res.sendStatus(200);
    });

    app.listen(3000, () => console.log('Webhook server listening on port 3000'));
    */
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
