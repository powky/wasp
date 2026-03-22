/**
 * Echo Bot Example
 *
 * A simple bot that echoes back any message it receives.
 * Perfect for testing WaSP integration and message flow.
 *
 * Usage:
 *   npx tsx examples/echo-bot.ts
 *
 * 1. Scan QR code with WhatsApp
 * 2. Send a message to the bot
 * 3. Bot echoes it back
 */

import { WaSP } from '../src';

async function main() {
  // Create WaSP instance with debug logging
  const wasp = new WaSP({
    debug: true,
    queue: {
      minDelay: 1000,  // 1s min delay
      maxDelay: 2000,  // 2s max delay
    },
  });

  console.log('Starting Echo Bot...');

  // Create session
  const session = await wasp.createSession('echo-bot', 'BAILEYS');
  console.log('Session created:', session.id);

  // Listen for QR code
  wasp.on('SESSION_QR', (event) => {
    console.log('\n📱 Scan this QR code with WhatsApp:\n');
    console.log(event.data.qr);
  });

  // Listen for connection
  wasp.on('SESSION_CONNECTED', (event) => {
    console.log('✅ Connected as:', event.data.phone);
    console.log('Echo bot is ready! Send any message to test.\n');
  });

  // Echo incoming messages
  wasp.on('MESSAGE_RECEIVED', async (event) => {
    const msg = event.data;
    console.log(`📨 Received: "${msg.content}" from ${msg.from}`);

    // Echo back
    await wasp.sendMessage(event.sessionId, msg.from, `Echo: ${msg.content}`);
    console.log(`📤 Echoed back to ${msg.from}`);
  });

  // Handle errors
  wasp.on('SESSION_ERROR', (event) => {
    console.error('❌ Session error:', event.data.error);
  });

  // Keep process alive
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await wasp.destroySession('echo-bot');
    process.exit(0);
  });
}

main().catch(console.error);
