/**
 * Multi-Session Example
 *
 * Demonstrates WaSP's multi-tenant capability by managing
 * 3 simultaneous WhatsApp sessions with isolated state.
 *
 * Usage:
 *   npx tsx examples/multi-session.ts
 *
 * Each session operates independently. Perfect for:
 * - Multi-tenant SaaS platforms
 * - Managing multiple WhatsApp Business accounts
 * - Testing session isolation
 */

import { WaSP, RedisStore } from '../src';

const SESSIONS = [
  { id: 'customer-support', orgId: 'org-acme', name: 'Support Team' },
  { id: 'sales-team', orgId: 'org-acme', name: 'Sales Team' },
  { id: 'notifications', orgId: 'org-techco', name: 'TechCo Alerts' },
];

async function main() {
  // Use Redis for session persistence across restarts
  // Falls back to MemoryStore if Redis not available
  let store;
  try {
    store = new RedisStore({
      host: 'localhost',
      port: 6379,
      keyPrefix: 'wasp:multi:',
    });
    console.log('✅ Using Redis store for persistence\n');
  } catch (error) {
    console.log('⚠️  Redis unavailable, using memory store\n');
  }

  const wasp = new WaSP({
    store,
    queue: {
      minDelay: 2000,
      maxDelay: 5000,
      priorityLanes: true,
    },
  });

  console.log('Multi-Session Manager\n');
  console.log('Creating 3 sessions...\n');

  // Create all sessions
  for (const config of SESSIONS) {
    try {
      await wasp.createSession(config.id, 'BAILEYS', {
        orgId: config.orgId,
        metadata: { name: config.name },
      });
      console.log(`✅ Created session: ${config.name} (${config.id})`);
    } catch (error) {
      console.error(`❌ Failed to create ${config.name}:`, error);
    }
  }

  console.log('\n');

  // Handle QR codes for each session
  wasp.on('SESSION_QR', (event) => {
    const config = SESSIONS.find(s => s.id === event.sessionId);
    console.log(`\n📱 QR Code for ${config?.name || event.sessionId}:`);
    console.log(event.data.qr);
    console.log('\n');
  });

  // Track connections
  wasp.on('SESSION_CONNECTED', (event) => {
    const config = SESSIONS.find(s => s.id === event.sessionId);
    console.log(`✅ ${config?.name || event.sessionId} connected as ${event.data.phone}`);
  });

  // Log messages with session context
  wasp.on('MESSAGE_RECEIVED', async (event) => {
    const msg = event.data;
    const config = SESSIONS.find(s => s.id === event.sessionId);

    console.log(`\n📨 [${config?.name}] Message from ${msg.from}:`);
    console.log(`   "${msg.content}"`);

    // Example: Route to different handlers based on session
    if (event.sessionId === 'customer-support') {
      console.log('   → Routing to support ticket system');
    } else if (event.sessionId === 'sales-team') {
      console.log('   → Routing to CRM');
    } else if (event.sessionId === 'notifications') {
      console.log('   → Logging notification delivery');
    }
  });

  // List all sessions periodically
  setInterval(async () => {
    console.log('\n--- Session Status ---');
    for (const config of SESSIONS) {
      const session = await wasp.getSession(config.id);
      if (session) {
        console.log(`${config.name}: ${session.status} ${session.phone ? `(${session.phone})` : ''}`);
      }
    }
    console.log('----------------------\n');
  }, 30000); // Every 30s

  // Cleanup on exit
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down all sessions...');
    for (const config of SESSIONS) {
      try {
        await wasp.destroySession(config.id);
        console.log(`✅ Destroyed: ${config.name}`);
      } catch (error) {
        console.error(`❌ Error destroying ${config.name}:`, error);
      }
    }
    process.exit(0);
  });
}

main().catch(console.error);
