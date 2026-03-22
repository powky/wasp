/**
 * Webhook Forwarder Example
 *
 * Forwards all WhatsApp messages to a webhook URL.
 * Useful for integrating WhatsApp with other services (Zapier, n8n, etc.)
 *
 * Usage:
 *   WEBHOOK_URL=https://webhook.site/your-id npx tsx examples/webhook-forwarder.ts
 *
 * All incoming messages will be POSTed to the webhook URL as JSON.
 */

import { WaSP } from '../src';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://webhook.site/test';

async function main() {
  const wasp = new WaSP();

  console.log(`Webhook Forwarder - forwarding to: ${WEBHOOK_URL}\n`);

  // Create session
  await wasp.createSession('webhook-forwarder', 'BAILEYS');

  // QR code
  wasp.on('SESSION_QR', (event) => {
    console.log('Scan QR code:\n', event.data.qr);
  });

  // Connected
  wasp.on('SESSION_CONNECTED', (event) => {
    console.log('✅ Connected as:', event.data.phone);
  });

  // Forward all messages to webhook
  wasp.on('MESSAGE_RECEIVED', async (event) => {
    const msg = event.data;

    const payload = {
      id: msg.id,
      from: msg.from,
      content: msg.content,
      type: msg.type,
      timestamp: msg.timestamp,
      isGroup: msg.isGroup,
    };

    console.log(`📨 Forwarding message from ${msg.from} to webhook...`);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`✅ Forwarded successfully (${response.status})`);
      } else {
        console.error(`❌ Webhook error: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Failed to forward:', error);
    }
  });
}

main().catch(console.error);
