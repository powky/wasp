/**
 * Group Monitor Example
 *
 * Monitors WhatsApp groups and logs all activity.
 * Useful for moderation, analytics, or archiving group messages.
 *
 * Usage:
 *   npx tsx examples/group-monitor.ts
 *
 * Logs all messages from groups to console.
 * Can be extended to save to database, trigger alerts, etc.
 */

import { WaSP } from '../src';
import { writeFileSync, appendFileSync } from 'fs';

const LOG_FILE = './group-activity.log';

async function main() {
  const wasp = new WaSP({
    queue: {
      minDelay: 2000,
      maxDelay: 4000,
    },
  });

  console.log('Group Monitor starting...\n');

  // Create session
  await wasp.createSession('group-monitor', 'BAILEYS');

  // QR code
  wasp.on('SESSION_QR', (event) => {
    console.log('Scan QR code:\n', event.data.qr);
  });

  // Connected
  wasp.on('SESSION_CONNECTED', (event) => {
    console.log('✅ Connected as:', event.data.phone);
    console.log('Monitoring all groups...\n');

    // Initialize log file
    writeFileSync(LOG_FILE, `Group Monitor Log - Started ${new Date().toISOString()}\n\n`);
  });

  // Monitor group messages
  wasp.on('MESSAGE_RECEIVED', (event) => {
    const msg = event.data;

    // Only log group messages
    if (!msg.isGroup) return;

    const logEntry = {
      timestamp: msg.timestamp.toISOString(),
      groupId: msg.groupId,
      from: msg.from,
      type: msg.type,
      content: msg.content,
    };

    // Console output
    console.log(`[${logEntry.timestamp}] ${msg.groupId}`);
    console.log(`  From: ${msg.from}`);
    console.log(`  Message: ${msg.content}\n`);

    // Log to file
    appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  });

  // Track group joins/leaves
  wasp.on('GROUP_JOIN', (event) => {
    console.log(`✅ Joined group: ${event.data.groupId}`);
    appendFileSync(LOG_FILE, `JOINED: ${event.data.groupId} at ${event.timestamp.toISOString()}\n`);
  });

  wasp.on('GROUP_LEAVE', (event) => {
    console.log(`❌ Left group: ${event.data.groupId}`);
    appendFileSync(LOG_FILE, `LEFT: ${event.data.groupId} at ${event.timestamp.toISOString()}\n`);
  });

  console.log(`📁 Activity logged to: ${LOG_FILE}\n`);
}

main().catch(console.error);
