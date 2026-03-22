# CloudAPIProvider Guide

Meta's WhatsApp Cloud API provider for WaSP. This provider enables sending advanced interactive messages (buttons, lists) that aren't available in Baileys.

## Features

- ✅ **Text Messages** - Simple text with optional quoted replies
- ✅ **Interactive Buttons** - Up to 3 reply buttons per message
- ✅ **List Messages** - Dropdown menus with sections and rows
- ✅ **Template Messages** - Pre-approved message templates
- ✅ **Media Messages** - Images, videos, documents, audio
- ✅ **Location Messages** - Send GPS coordinates
- ✅ **Contact Messages** - Share vCards
- ✅ **Reaction Messages** - React to messages with emojis
- ✅ **Webhook Support** - Receive incoming messages via webhooks
- ✅ **No WebSocket** - REST-based, easier to deploy and scale

## Setup

### 1. Get Meta WhatsApp Business Account

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Create a WhatsApp Business Account
3. Add a phone number to your account

### 2. Get API Credentials

From the [Meta Developers Console](https://developers.facebook.com/):

- **Access Token**: Generate in App Dashboard → WhatsApp → API Setup
- **Phone Number ID**: Found in WhatsApp → API Setup
- **WABA ID**: WhatsApp Business Account ID (optional)

### 3. Install WaSP

```bash
npm install wasp-protocol
```

## Basic Usage

```typescript
import { WaSP } from 'wasp-protocol';

const wasp = new WaSP({
  defaultProvider: 'CLOUD_API',
});

// Create session
const session = await wasp.createSession('my-cloud-session', 'CLOUD_API', {
  accessToken: 'YOUR_ACCESS_TOKEN',
  phoneNumberId: '123456789012345',
});

// Send text message
await wasp.sendMessage('my-cloud-session', '27821234567', 'Hello!');
```

## Interactive Buttons

Send up to 3 reply buttons:

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'interactive',
  interactive: {
    type: 'button',
    header: {
      type: 'text',
      text: 'Order Confirmation',
    },
    body: {
      text: 'Your order is ready. Would you like us to deliver?',
    },
    footer: {
      text: 'Powered by WaSP',
    },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'deliver', title: 'Yes, deliver' } },
        { type: 'reply', reply: { id: 'pickup', title: 'I will pickup' } },
        { type: 'reply', reply: { id: 'cancel', title: 'Cancel order' } },
      ],
    },
  },
});
```

## List Messages

Send dropdown menus with sections:

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'interactive',
  interactive: {
    type: 'list',
    header: {
      type: 'text',
      text: 'Our Products',
    },
    body: {
      text: 'Select a category to browse:',
    },
    footer: {
      text: 'All prices in ZAR',
    },
    action: {
      button: 'View Products',
      sections: [
        {
          title: 'Electronics',
          rows: [
            { id: 'phone', title: 'Smartphones', description: 'Latest models - from R3,999' },
            { id: 'laptop', title: 'Laptops', description: 'Work and gaming - from R8,999' },
          ],
        },
        {
          title: 'Clothing',
          rows: [
            { id: 'shirts', title: 'T-Shirts', description: 'Cotton tees - from R149' },
            { id: 'jeans', title: 'Jeans', description: 'Denim jeans - from R499' },
          ],
        },
      ],
    },
  },
});
```

## Template Messages

Send pre-approved templates (must be approved by Meta first):

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'template',
  template: {
    name: 'order_confirmation', // Template name from Meta
    language: { code: 'en' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'John Doe' }, // Replaces {{1}}
          { type: 'text', text: 'ORD-12345' }, // Replaces {{2}}
        ],
      },
    ],
  },
});
```

## Media Messages

### Image

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'image',
  image: {
    link: 'https://example.com/product.jpg',
    caption: 'Check out this product!',
  },
});
```

### Video

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'video',
  video: {
    link: 'https://example.com/demo.mp4',
    caption: 'Product demo video',
  },
});
```

### Document

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'document',
  document: {
    link: 'https://example.com/catalog.pdf',
    filename: 'Product Catalog.pdf',
    caption: 'Our latest catalog',
  },
});
```

### Audio

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'audio',
  audio: {
    link: 'https://example.com/voice-note.ogg',
  },
});
```

## Location Messages

```typescript
await wasp.sendMessage('session-id', '27821234567', {
  type: 'location',
  location: {
    latitude: -33.9249,
    longitude: 18.4241,
    name: 'Table Mountain',
    address: 'Cape Town, South Africa',
  },
});
```

## Contact Messages

```typescript
await wasp.sendMessage('session-id', '27821234567', {
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
      emails: [
        { email: 'john@example.com', type: 'WORK' },
      ],
    },
  ],
});
```

## Reaction Messages

```typescript
import { CloudAPIProvider } from 'wasp-protocol';

const provider = wasp.getProvider('session-id') as CloudAPIProvider;
await provider.sendReaction('wamid.message-id-here', '👍');
```

## Webhook Setup

### 1. Create Webhook Server

```typescript
import express from 'express';
import { CloudAPIProvider } from 'wasp-protocol';

const app = express();
app.use(express.json());

const VERIFY_TOKEN = 'your-secret-token';

// Verification endpoint (GET)
app.get('/webhook', (req, res) => {
  const challenge = CloudAPIProvider.verifyWebhook(req, VERIFY_TOKEN);
  if (challenge) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receiver endpoint (POST)
app.post('/webhook', (req, res) => {
  const messages = CloudAPIProvider.parseWebhook(req.body);

  for (const message of messages) {
    console.log('Received:', message.content);
    // Process message here
  }

  res.sendStatus(200);
});

app.listen(3000);
```

### 2. Expose to Internet

For local testing, use [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 3. Configure in Meta Console

1. Go to Meta Developers Console → Your App → WhatsApp → Configuration
2. Set **Webhook URL**: `https://abc123.ngrok.io/webhook`
3. Set **Verify Token**: `your-secret-token`
4. Subscribe to **messages** event
5. Click "Verify and Save"

## Handling Incoming Messages

```typescript
wasp.on('MESSAGE_RECEIVED', async (event) => {
  const message = event.data;

  console.log('From:', message.from);
  console.log('Type:', message.type);
  console.log('Content:', message.content);

  // Handle button replies
  if (message.raw?.interactive?.button_reply) {
    const buttonId = message.raw.interactive.button_reply.id;
    console.log('User clicked button:', buttonId);
  }

  // Handle list replies
  if (message.raw?.interactive?.list_reply) {
    const listId = message.raw.interactive.list_reply.id;
    const listTitle = message.raw.interactive.list_reply.title;
    console.log('User selected:', listId, listTitle);
  }

  // Auto-reply
  await wasp.sendMessage(event.sessionId, message.from, 'Got your message!');
});
```

## Provider Options

```typescript
interface CloudAPIProviderOptions {
  accessToken: string;        // Required: Meta access token
  phoneNumberId: string;      // Required: WhatsApp phone number ID
  wabaId?: string;            // Optional: WhatsApp Business Account ID
  apiVersion?: string;        // Optional: API version (default: v22.0)
  webhookVerifyToken?: string; // Optional: For webhook verification
  baseUrl?: string;           // Optional: API base URL (default: https://graph.facebook.com)
  phoneNumber?: string;       // Optional: Your phone number (fetched if not provided)
}
```

## Error Handling

```typescript
try {
  await wasp.sendMessage('session-id', '27821234567', 'Hello');
} catch (error) {
  if (error.message.includes('Cloud API send failed')) {
    console.error('Meta API error:', error.message);
  }
}
```

Common errors:
- `Invalid OAuth access token` - Token expired or invalid
- `Message failed to send` - Invalid recipient or content
- `(#131009) Parameter value is not valid` - Invalid message structure

## Rate Limits

Meta Cloud API has rate limits:
- **1,000 messages per day** (free tier)
- **Unlimited** (paid tier with approved business verification)
- **80 messages per second** per phone number

Use WaSP's queue to respect limits:

```typescript
const wasp = new WaSP({
  queue: {
    minDelay: 1000, // 1 second between messages
    maxDelay: 2000,
    maxConcurrent: 1,
  },
});

// Messages are automatically queued
await wasp.sendMessage('session-id', '27821234567', 'Message 1');
await wasp.sendMessage('session-id', '27821234567', 'Message 2');
await wasp.sendMessage('session-id', '27821234567', 'Message 3');
```

## Hybrid Setup (Baileys + Cloud API)

Use Baileys for free messaging and Cloud API for interactive features:

```typescript
const wasp = new WaSP();

// Baileys session for regular messages
await wasp.createSession('baileys-1', 'BAILEYS', {
  authDir: './auth_states',
});

// Cloud API session for interactive messages
await wasp.createSession('cloud-1', 'CLOUD_API', {
  accessToken: 'YOUR_ACCESS_TOKEN',
  phoneNumberId: '123456789012345',
});

// Send regular message via Baileys (free)
await wasp.sendMessage('baileys-1', '27821234567', 'Regular text message');

// Send button message via Cloud API (paid, but has buttons)
await wasp.sendMessage('cloud-1', '27821234567', {
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: 'Choose an option' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'yes', title: 'Yes' }},
        { type: 'reply', reply: { id: 'no', title: 'No' }},
      ],
    },
  },
});
```

## Examples

Full working examples in `/examples`:
- `cloud-api-buttons.ts` - All message types
- `cloud-api-webhook-server.ts` - Complete webhook server with auto-replies

Run examples:

```bash
npm install express

# Set environment variables
export META_ACCESS_TOKEN="your-token"
export META_PHONE_NUMBER_ID="your-phone-id"
export WEBHOOK_VERIFY_TOKEN="your-verify-token"

# Run webhook server
npx tsx examples/cloud-api-webhook-server.ts
```

## Resources

- [Meta Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Interactive Messages Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#interactive-messages)
- [Template Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
- [Webhook Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)

## Troubleshooting

### "Invalid OAuth access token"

- Token expired (regenerate in Meta console)
- Wrong token for this phone number
- App not approved for production

### "Message failed to send"

- Recipient hasn't messaged your number first (24-hour window rule)
- Invalid phone number format
- User blocked your number

### Webhooks not receiving messages

- Webhook URL not HTTPS
- Verify token mismatch
- Not subscribed to 'messages' event
- Server not responding within 20 seconds

### Rate limit errors

- Free tier limit (1,000/day) reached
- Sending too fast (max 80/second)
- Use WaSP's queue system to throttle
