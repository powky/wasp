/**
 * Example: Cloud API Webhook Server
 *
 * Demonstrates how to set up an Express server to receive
 * incoming messages from Meta's WhatsApp Cloud API webhooks.
 *
 * Requirements:
 * - npm install express
 * - Public URL or ngrok tunnel for webhook endpoint
 * - Meta webhook configured to point to this server
 */

import express from 'express';
import { WaSP, CloudAPIProvider } from '../src/index.js';

const app = express();
app.use(express.json());

// Create WaSP instance
const wasp = new WaSP({
  defaultProvider: 'CLOUD_API',
  debug: true,
});

// Webhook verify token (set this in Meta Developer Console)
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'my-secret-verify-token';

// Cloud API credentials
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '123456789012345';

// Initialize session
let sessionId: string;

async function initializeSession() {
  sessionId = 'cloud-webhook-session';

  const session = await wasp.createSession(sessionId, 'CLOUD_API', {
    accessToken: ACCESS_TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
    webhookVerifyToken: VERIFY_TOKEN,
  });

  console.log('✓ Session created:', session.id);
  console.log('✓ Phone number:', session.phone);

  // Listen for incoming messages
  wasp.on('MESSAGE_RECEIVED', async (event) => {
    console.log('📩 Received message:', {
      from: event.data.from,
      type: event.data.type,
      content: event.data.content,
    });

    // Auto-reply example
    const message = event.data;

    // Handle text messages
    if (message.type === 'TEXT') {
      const text = message.content.toLowerCase();

      if (text.includes('hello') || text.includes('hi')) {
        // Send greeting with buttons
        await wasp.sendMessage(sessionId, message.from, {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Hello! How can I help you today?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: 'menu', title: 'View Menu' } },
                { type: 'reply', reply: { id: 'order', title: 'Place Order' } },
                { type: 'reply', reply: { id: 'support', title: 'Get Support' } },
              ],
            },
          },
        });
      } else if (text.includes('menu')) {
        // Send menu list
        await wasp.sendMessage(sessionId, message.from, {
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: 'Here is our menu. Select a category:' },
            action: {
              button: 'View Menu',
              sections: [
                {
                  title: 'Food',
                  rows: [
                    { id: 'burgers', title: 'Burgers', description: 'Beef, chicken, veggie' },
                    { id: 'pizza', title: 'Pizza', description: 'Various toppings' },
                    { id: 'salads', title: 'Salads', description: 'Fresh and healthy' },
                  ],
                },
                {
                  title: 'Drinks',
                  rows: [
                    { id: 'soft', title: 'Soft Drinks', description: 'Coke, Fanta, Sprite' },
                    { id: 'juice', title: 'Fresh Juice', description: 'Orange, apple, grape' },
                  ],
                },
              ],
            },
          },
        });
      } else if (text.includes('location') || text.includes('where')) {
        // Send location
        await wasp.sendMessage(sessionId, message.from, {
          type: 'location',
          location: {
            latitude: -33.9249,
            longitude: 18.4241,
            name: 'Our Restaurant',
            address: '123 Main St, Cape Town, South Africa',
          },
        });
      } else if (text.includes('contact')) {
        // Send contact
        await wasp.sendMessage(sessionId, message.from, {
          type: 'contacts',
          contacts: [
            {
              name: {
                formatted_name: 'Customer Support',
                first_name: 'Customer',
                last_name: 'Support',
              },
              phones: [{ phone: '+27215551234', type: 'WORK' }],
              emails: [{ email: 'support@example.com', type: 'WORK' }],
            },
          ],
        });
      } else {
        // Default response
        await wasp.sendMessage(
          sessionId,
          message.from,
          'Thank you for your message! Type "menu" to see our offerings or "hello" for options.'
        );
      }
    }

    // Handle reactions
    if (message.type === 'REACTION') {
      console.log(`User reacted with ${message.content} to a message`);
    }

    // Handle interactive button replies
    if (message.raw?.interactive?.button_reply) {
      const buttonId = message.raw.interactive.button_reply.id;
      console.log(`User clicked button: ${buttonId}`);

      switch (buttonId) {
        case 'menu':
          await wasp.sendMessage(sessionId, message.from, '📋 Loading menu...');
          break;
        case 'order':
          await wasp.sendMessage(sessionId, message.from, '🛒 Starting order process...');
          break;
        case 'support':
          await wasp.sendMessage(
            sessionId,
            message.from,
            '👋 Connecting you with support. How can we assist?'
          );
          break;
      }
    }

    // Handle interactive list replies
    if (message.raw?.interactive?.list_reply) {
      const listId = message.raw.interactive.list_reply.id;
      const listTitle = message.raw.interactive.list_reply.title;
      console.log(`User selected from list: ${listId} (${listTitle})`);

      await wasp.sendMessage(
        sessionId,
        message.from,
        `Great choice! You selected: ${listTitle}`
      );
    }
  });
}

// Webhook verification endpoint (GET request from Meta)
app.get('/webhook', (req, res) => {
  console.log('📞 Webhook verification request:', req.query);

  const challenge = CloudAPIProvider.verifyWebhook(req, VERIFY_TOKEN);

  if (challenge) {
    console.log('✓ Webhook verified successfully');
    res.send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook receiver endpoint (POST request from Meta)
app.post('/webhook', (req, res) => {
  console.log('📨 Webhook received:', JSON.stringify(req.body, null, 2));

  try {
    // Parse webhook payload into WaSP messages
    const messages = CloudAPIProvider.parseWebhook(req.body);

    console.log(`✓ Parsed ${messages.length} message(s)`);

    // Emit each message as a WaSP event
    for (const message of messages) {
      wasp.emit('MESSAGE_RECEIVED', {
        type: 'MESSAGE_RECEIVED',
        sessionId,
        timestamp: new Date(),
        data: message,
      });
    }

    // Acknowledge receipt immediately (Meta requires 200 within 20 seconds)
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const health = wasp.getHealth();
  res.json({
    status: 'ok',
    ...health,
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Initialize WaSP session first
    await initializeSession();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 Webhook server running on port ${PORT}`);
      console.log(`\n📝 Configuration:`);
      console.log(`   - Webhook URL: http://localhost:${PORT}/webhook`);
      console.log(`   - Verify Token: ${VERIFY_TOKEN}`);
      console.log(`   - Phone Number ID: ${PHONE_NUMBER_ID}`);
      console.log(`\n⚙️ Setup instructions:`);
      console.log(`   1. Expose this server to the internet (use ngrok for testing):`);
      console.log(`      ngrok http ${PORT}`);
      console.log(`   2. Configure webhook in Meta Developer Console:`);
      console.log(`      URL: https://your-ngrok-url.ngrok.io/webhook`);
      console.log(`      Verify Token: ${VERIFY_TOKEN}`);
      console.log(`   3. Subscribe to 'messages' webhook events`);
      console.log(`\n✨ Ready to receive messages!\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await wasp.destroySession(sessionId);
  process.exit(0);
});

// Start the server
start().catch(console.error);
