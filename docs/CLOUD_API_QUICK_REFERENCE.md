# Cloud API Quick Reference

One-page reference for WaSP Cloud API Provider.

## Setup

```typescript
import { WaSP } from 'wasp-protocol';

const wasp = new WaSP({ defaultProvider: 'CLOUD_API' });

await wasp.createSession('session-1', 'CLOUD_API', {
  accessToken: 'YOUR_ACCESS_TOKEN',      // From Meta Developer Console
  phoneNumberId: '123456789012345',      // Your WhatsApp Business Phone ID
  webhookVerifyToken: 'my-secret-token', // Optional, for webhooks
});
```

## Send Messages

### Text
```typescript
await wasp.sendMessage('session-1', '15551234567', 'Hello!');
```

### Buttons (max 3)
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: 'Choose:' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'a', title: 'Option A' }},
        { type: 'reply', reply: { id: 'b', title: 'Option B' }},
      ],
    },
  },
});
```

### List
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'interactive',
  interactive: {
    type: 'list',
    body: { text: 'Select:' },
    action: {
      button: 'Menu',
      sections: [{
        title: 'Products',
        rows: [
          { id: '1', title: 'Item 1', description: 'R99' },
          { id: '2', title: 'Item 2', description: 'R149' },
        ],
      }],
    },
  },
});
```

### Image
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'image',
  image: { link: 'https://example.com/image.jpg', caption: 'Look!' },
});
```

### Location
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'location',
  location: {
    latitude: -33.9249,
    longitude: 18.4241,
    name: 'Cape Town',
  },
});
```

### Contact
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'contacts',
  contacts: [{
    name: { formatted_name: 'John Doe' },
    phones: [{ phone: '+27821234567' }],
  }],
});
```

### Template
```typescript
await wasp.sendMessage('session-1', '15551234567', {
  type: 'template',
  template: {
    name: 'welcome_msg',
    language: { code: 'en' },
    components: [{
      type: 'body',
      parameters: [{ type: 'text', text: 'John' }],
    }],
  },
});
```

### Reaction
```typescript
import { CloudAPIProvider } from 'wasp-protocol';
const provider = wasp.getProvider('session-1') as CloudAPIProvider;
await provider.sendReaction('wamid.message-id', '👍');
```

## Webhooks

### Verification (GET)
```typescript
import express from 'express';
import { CloudAPIProvider } from 'wasp-protocol';

app.get('/webhook', (req, res) => {
  const challenge = CloudAPIProvider.verifyWebhook(req, 'your-token');
  challenge ? res.send(challenge) : res.sendStatus(403);
});
```

### Receiver (POST)
```typescript
app.post('/webhook', (req, res) => {
  const messages = CloudAPIProvider.parseWebhook(req.body);
  messages.forEach(msg => console.log(msg.content));
  res.sendStatus(200);
});
```

## Handle Incoming

```typescript
wasp.on('MESSAGE_RECEIVED', async (event) => {
  const msg = event.data;

  // Button click
  if (msg.raw?.interactive?.button_reply) {
    const id = msg.raw.interactive.button_reply.id;
    console.log('Button:', id);
  }

  // List selection
  if (msg.raw?.interactive?.list_reply) {
    const id = msg.raw.interactive.list_reply.id;
    console.log('List:', id);
  }

  // Auto-reply
  await wasp.sendMessage(event.sessionId, msg.from, 'Got it!');
});
```

## Message Structure

### Interactive Button
```typescript
{
  type: 'interactive',
  interactive: {
    type: 'button',
    header?: { type: 'text', text: 'Header' },
    body: { text: 'Body text' },
    footer?: { text: 'Footer' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'id', title: 'Title' }}
      ],
    },
  },
}
```

### Interactive List
```typescript
{
  type: 'interactive',
  interactive: {
    type: 'list',
    header?: { type: 'text', text: 'Header' },
    body: { text: 'Body text' },
    footer?: { text: 'Footer' },
    action: {
      button: 'Button Text',
      sections: [
        {
          title: 'Section',
          rows: [
            { id: 'id', title: 'Title', description: 'Desc' }
          ],
        }
      ],
    },
  },
}
```

## Rate Limits

- **Free tier**: 1,000 messages/day
- **Paid tier**: Unlimited (with business verification)
- **Speed**: 80 messages/second max

Use WaSP queue:
```typescript
const wasp = new WaSP({
  queue: {
    minDelay: 1000,  // 1 second between messages
    maxDelay: 2000,
  },
});
```

## Common Errors

| Error | Meaning | Solution |
|-------|---------|----------|
| Invalid OAuth access token | Token expired | Regenerate in Meta console |
| Message failed to send | Recipient hasn't messaged you | Wait for inbound message |
| Parameter value is not valid | Invalid message structure | Check message format |

## Environment Variables

```bash
export META_ACCESS_TOKEN="YOUR_ACCESS_TOKEN"
export META_PHONE_NUMBER_ID="123456789012345"
export WEBHOOK_VERIFY_TOKEN="my-secret-token"
```

## Examples

- `/root/wasp/examples/cloud-api-buttons.ts` - All message types
- `/root/wasp/examples/cloud-api-webhook-server.ts` - Webhook server
- `/root/wasp/examples/cloud-api-shop-bot.ts` - E-commerce bot

## Docs

- Full guide: `/root/wasp/docs/CLOUD_API_PROVIDER.md`
- Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api

## Testing

```bash
npm run build
npm test  # All tests including Cloud API
```
