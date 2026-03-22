#!/usr/bin/env node

/**
 * WaSP CLI - Command-line interface for WhatsApp Session Protocol
 *
 * Usage:
 *   wasp connect [sessionId]     - Connect to WhatsApp and show QR
 *   wasp status [sessionId]      - Show session status
 *   wasp send <to> <message>     - Send a message
 *   wasp sessions                - List all sessions
 *   wasp health                  - Show health info
 */

import { Command } from 'commander';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { WaSP } from './wasp.js';
import { MemoryStore } from './stores/memory.js';
import type { Message } from './types.js';
import { ProviderType, EventType } from './types.js';

const program = new Command();

// Default session storage directory
const WASP_DIR = path.join(os.homedir(), '.wasp');
const SESSIONS_DIR = path.join(WASP_DIR, 'sessions');

// Ensure directories exist
if (!fs.existsSync(WASP_DIR)) {
  fs.mkdirSync(WASP_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

program
  .name('wasp')
  .description('WhatsApp Session Protocol CLI')
  .version('0.1.0');

/**
 * Connect command - Connect to WhatsApp and show QR
 */
program
  .command('connect')
  .argument('[sessionId]', 'Session ID to connect', 'default')
  .description('Connect to WhatsApp, show QR code, and listen for messages')
  .action(async (sessionId: string) => {
    console.log(chalk.blue('Starting WaSP...'));

    const wasp = new WaSP({
      debug: true,
      logger: {
        debug: (msg: string) => console.log(chalk.gray(`[DEBUG] ${msg}`)),
        info: (msg: string) => console.log(chalk.blue(`[INFO] ${msg}`)),
        warn: (msg: string) => console.log(chalk.yellow(`[WARN] ${msg}`)),
        error: (msg: string) => console.log(chalk.red(`[ERROR] ${msg}`)),
      },
    });

    // Listen for QR code
    wasp.on(EventType.SESSION_QR, (event) => {
      console.log(chalk.green('\nScan this QR code with WhatsApp:'));
      console.log('');
      qrcode.generate((event.data as any).qr, { small: true });
      console.log('');
    });

    // Listen for connection
    wasp.on(EventType.SESSION_CONNECTED, (event) => {
      console.log(chalk.green('✓ Connected to WhatsApp!'));
      console.log(chalk.cyan(`Phone: ${(event.data as any).phone || 'unknown'}`));
      console.log(chalk.cyan(`Session: ${sessionId}`));
      console.log('');
      console.log(chalk.gray('Listening for messages... (Ctrl+C to quit)'));
      console.log('');
    });

    // Listen for disconnection
    wasp.on(EventType.SESSION_DISCONNECTED, (event) => {
      console.log(chalk.red('✗ Disconnected from WhatsApp'));
      console.log(chalk.gray(`Reason: ${(event.data as any).reason || 'unknown'}`));
      if (!(event.data as any).shouldReconnect) {
        process.exit(0);
      }
    });

    // Listen for errors
    wasp.on(EventType.SESSION_ERROR, (event) => {
      console.error(chalk.red('Error:'), (event.data as any).error);
    });

    // Listen for incoming messages
    wasp.on(EventType.MESSAGE_RECEIVED, (event) => {
      const msg = event.data as Message;
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const from = msg.from.split('@')[0];

      console.log(chalk.cyan(`[${timestamp}]`), chalk.yellow(from), '→', msg.content);
    });

    // Connect
    try {
      await wasp.createSession(sessionId, ProviderType.BAILEYS, {
        authDir: SESSIONS_DIR,
        printQR: false, // We'll handle QR display ourselves
      } as any);

      // Keep process alive
      await new Promise(() => {
        // Never resolves - keep running until killed
      });
    } catch (error) {
      console.error(chalk.red('Failed to connect:'), error);
      process.exit(1);
    }
  });

/**
 * Status command - Show session status
 */
program
  .command('status')
  .argument('[sessionId]', 'Session ID to check', 'default')
  .description('Show session connection status')
  .action(async (sessionId: string) => {
    const wasp = new WaSP({
      store: new MemoryStore(),
    });

    try {
      // Check if session auth exists
      const authDir = path.join(SESSIONS_DIR, sessionId);
      if (!fs.existsSync(authDir)) {
        console.log(chalk.yellow('Session not found. Use "wasp connect" to create it.'));
        process.exit(0);
      }

      // Try to connect
      console.log(chalk.blue('Checking session status...'));

      let statusChecked = false;

      wasp.on(EventType.SESSION_CONNECTED, async (event) => {
        if (statusChecked) return;
        statusChecked = true;

        const session = await wasp.getSession(sessionId);
        if (!session) {
          console.log(chalk.red('Session not found'));
          process.exit(1);
        }

        console.log('');
        console.log(chalk.green('✓ Connected'));
        console.log(chalk.cyan(`Phone: ${(event.data as any).phone || 'unknown'}`));
        console.log(chalk.cyan(`Status: ${session.status}`));
        console.log(chalk.cyan(`Provider: ${session.provider}`));
        if (session.connectedAt) {
          const uptime = Date.now() - session.connectedAt.getTime();
          const hours = Math.floor(uptime / 3600000);
          const minutes = Math.floor((uptime % 3600000) / 60000);
          console.log(chalk.cyan(`Uptime: ${hours}h ${minutes}m`));
        }
        console.log('');

        await wasp.destroySession(sessionId);
        process.exit(0);
      });

      wasp.on(EventType.SESSION_DISCONNECTED, () => {
        if (statusChecked) return;
        statusChecked = true;
        console.log(chalk.red('✗ Disconnected'));
        process.exit(0);
      });

      await wasp.createSession(sessionId, ProviderType.BAILEYS, {
        authDir: SESSIONS_DIR,
        printQR: false,
      } as any);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!statusChecked) {
          console.log(chalk.yellow('Status check timed out'));
          process.exit(1);
        }
      }, 10000);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * Send command - Send a message
 */
program
  .command('send')
  .argument('<to>', 'Recipient phone number (e.g., 27821234567)')
  .argument('<message>', 'Message to send')
  .option('-s, --session <sessionId>', 'Session ID to use', 'default')
  .description('Send a WhatsApp message')
  .action(async (to: string, message: string, options: { session: string }) => {
    const sessionId = options.session;

    // Check if session exists
    const authDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(authDir)) {
      console.log(chalk.red('Session not found. Use "wasp connect" first.'));
      process.exit(1);
    }

    console.log(chalk.blue('Connecting to WhatsApp...'));

    const wasp = new WaSP();

    let sent = false;

    wasp.on(EventType.SESSION_CONNECTED, async () => {
      console.log(chalk.green('✓ Connected'));

      try {
        console.log(chalk.blue(`Sending message to ${to}...`));
        await wasp.sendMessage(sessionId, to, message);
        console.log(chalk.green('✓ Message sent!'));
        sent = true;

        await wasp.destroySession(sessionId);
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Failed to send:'), error);
        process.exit(1);
      }
    });

    wasp.on(EventType.SESSION_DISCONNECTED, () => {
      if (!sent) {
        console.log(chalk.red('Failed to connect'));
        process.exit(1);
      }
    });

    try {
      await wasp.createSession(sessionId, ProviderType.BAILEYS, {
        authDir: SESSIONS_DIR,
        printQR: false,
      } as any);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!sent) {
          console.log(chalk.red('Send timeout'));
          process.exit(1);
        }
      }, 30000);
    } catch (error) {
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

/**
 * Sessions command - List all sessions
 */
program
  .command('sessions')
  .description('List all active sessions')
  .action(() => {
    console.log(chalk.blue('WaSP Sessions:'));
    console.log('');

    const sessions = fs.readdirSync(SESSIONS_DIR);

    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found. Use "wasp connect" to create one.'));
      process.exit(0);
    }

    sessions.forEach((sessionId) => {
      const sessionPath = path.join(SESSIONS_DIR, sessionId);
      const stats = fs.statSync(sessionPath);

      console.log(chalk.cyan(`• ${sessionId}`));
      console.log(chalk.gray(`  Created: ${stats.birthtime.toLocaleString()}`));
      console.log(chalk.gray(`  Location: ${sessionPath}`));
      console.log('');
    });
  });

/**
 * Health command - Show health information
 */
program
  .command('health')
  .description('Show WaSP health and statistics')
  .action(async () => {
    console.log(chalk.blue('Initializing WaSP...'));

    const wasp = new WaSP();

    // Try to restore all sessions
    const sessions = fs.readdirSync(SESSIONS_DIR);

    console.log(chalk.blue(`Found ${sessions.length} session(s)`));
    console.log('');

    for (const sessionId of sessions.slice(0, 5)) {
      // Max 5 sessions for health check
      try {
        await wasp.createSession(sessionId, ProviderType.BAILEYS, {
          metadata: {
            authDir: SESSIONS_DIR,
            printQR: false,
          },
        } as any);
      } catch {
        // Ignore connection errors for health check
      }
    }

    // Wait a bit for connections
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const health = wasp.getHealth();

    console.log(chalk.green('Health Check:'));
    console.log('');
    console.log(chalk.cyan('Uptime:'), formatUptime(health.uptime));
    console.log('');
    console.log(chalk.cyan('Sessions:'));
    console.log(chalk.gray(`  Total: ${health.sessions.total}`));
    console.log(chalk.gray(`  Connected: ${health.sessions.connected}`));
    console.log(chalk.gray(`  Disconnected: ${health.sessions.disconnected}`));
    console.log('');
    console.log(chalk.cyan('Messages:'));
    console.log(chalk.gray(`  Sent: ${health.messages.sent}`));
    console.log(chalk.gray(`  Received: ${health.messages.received}`));
    console.log('');
    console.log(chalk.cyan('Memory:'));
    console.log(chalk.gray(`  Heap Used: ${formatBytes(health.memory.heapUsed)}`));
    console.log(chalk.gray(`  Heap Total: ${formatBytes(health.memory.heapTotal)}`));
    console.log('');

    // Cleanup
    for (const sessionId of wasp.getSessions()) {
      try {
        await wasp.destroySession(sessionId);
      } catch {
        // Ignore
      }
    }

    process.exit(0);
  });

// Helper functions
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

// Parse and execute
program.parse();
