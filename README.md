# WaSP - WhatsApp Session Protocol

<div align="center">

```
██╗    ██╗ █████╗ ███████╗██████╗
██║    ██║██╔══██╗██╔════╝██╔══██╗
██║ █╗ ██║███████║███████╗██████╔╝
██║███╗██║██╔══██║╚════██║██╔═══╝
╚███╔███╔╝██║  ██║███████║██║
 ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚═╝
```

[![npm version](https://img.shields.io/npm/v/@wasp/core.svg)](https://www.npmjs.com/package/@wasp/core)
[![CI](https://github.com/kobie3717/wasp/actions/workflows/ci.yml/badge.svg)](https://github.com/kobie3717/wasp/actions)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen.svg)](https://github.com/kobie3717/wasp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

**The missing infrastructure layer between WhatsApp and your application**

[Quick Start](#quick-start) • [Features](#features) • [Documentation](#api-reference) • [Examples](#examples)

</div>

---

## Why WaSP?

Building WhatsApp integrations is painful. You're forced to:
- 🔄 Choose between incompatible libraries (Baileys, Whatsmeow, Cloud API)
- 🛠️ Re-implement session management, reconnection logic, and anti-ban systems for each project
- ⏱️ Manage complex queueing to avoid rate limits and bans
- 🏢 Handle multi-tenant architectures from scratch
- 🔌 Deal with provider-specific quirks and breaking changes

**WaSP solves this.** It's a protocol layer that provides a unified interface across WhatsApp providers with built-in session management, intelligent anti-ban queueing, and a powerful middleware system.

## Features

✨ **Unified API** — One interface across Baileys, Whatsmeow, and Cloud API providers
🏢 **Multi-tenant** — Session isolation with per-org/user sessions
🛡️ **Anti-ban queue** — Human-like delays, priority lanes, and rate limiting
💾 **Pluggable storage** — Memory, Redis, Postgres (or build your own)
🔧 **Middleware system** — Cross-cutting concerns (logging, reconnection, rate limiting)
📘 **TypeScript-first** — Full type safety with zero `any` types
🚀 **Production-ready** — Automatic reconnection, error handling, and graceful degradation
📡 **Event-driven** — Normalized event format across all providers

## Quick Start

### Installation

```bash
npm install @wasp/core

# Install your chosen provider (Baileys example)
npm install @whiskeysockets/baileys

# Optional: Install storage adapter
npm install ioredis  # For Redis store
npm install pg       # For Postgres store
```

### Basic Usage

```typescript
import { WaSP } from '@wasp/core';

// Create WaSP instance
const wasp = new WaSP({
  queue: {
    minDelay: 2000,      // Min 2s between messages
    maxDelay: 5000,      // Max 5s between messages
    priorityLanes: true, // Enable priority message lanes
  },
});

// Create a session (triggers QR code for authentication)
const session = await wasp.createSession('user-123', 'BAILEYS');

// Listen for QR code
wasp.on('SESSION_QR', (event) => {
  console.log('Scan this QR code:');
  console.log(event.data.qr);
});

// Listen for successful connection
wasp.on('SESSION_CONNECTED', (event) => {
  console.log(`Connected as ${event.data.phone}`);
});

// Listen for incoming messages
wasp.on('MESSAGE_RECEIVED', (event) => {
  const message = event.data;
  console.log(`From ${message.from}: ${message.content}`);

  // Auto-reply example
  if (message.content.toLowerCase() === 'hello') {
    wasp.sendMessage(event.sessionId, message.from, 'Hi there!');
  }
});

// Send a message (automatically queued with anti-ban delay)
await wasp.sendMessage('user-123', '27821234567@s.whatsapp.net', 'Hello from WaSP!');

// Send priority message (reduced delay for urgent messages)
await wasp.sendMessage('user-123', '27821234567@s.whatsapp.net', 'URGENT: Bid accepted!', {
  priority: 10,
});

// Send with media
await wasp.sendMessage('user-123', '27821234567@s.whatsapp.net', 'Check this out!', {
  media: '/path/to/image.jpg',
  mediaMimeType: 'image/jpeg',
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Application                            │
│  (Multi-tenant SaaS, Chatbot, Notification Service, etc.)        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ WaSP Unified API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          WaSP Core                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Session    │  │  Anti-Ban    │  │  Middleware  │          │
│  │   Manager    │  │    Queue     │  │   Pipeline   │          │
│  │              │  │  (Priority,  │  │  (Logger,    │          │
│  │ (Create,     │  │   Delays,    │  │   AutoRecon, │          │
│  │  Destroy,    │  │   RateLimit) │  │   Custom)    │          │
│  │  List)       │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          Pluggable Store (Session Persistence)           │  │
│  │      Memory  │  Redis  │  Postgres  │  Custom            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     Baileys     │  │   Whatsmeow     │  │   Cloud API     │
│    Provider     │  │    Provider     │  │    Provider     │
│  (Multi-device  │  │  (Go library,   │  │  (Official,     │
│   protocol)     │  │   high perf)    │  │   paid)         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
                     WhatsApp Servers
```

**Key Components:**

- **Session Manager**: Creates, destroys, and tracks multiple WhatsApp sessions (multi-tenant support)
- **Anti-Ban Queue**: Prevents bans with human-like delays, priority lanes, and rate limiting
- **Middleware Pipeline**: Compose cross-cutting concerns (logging, error handling, auto-reconnection)
- **Provider Abstraction**: Swap between Baileys, Whatsmeow, Cloud API without changing your code
- **Pluggable Store**: Choose persistence layer (Memory, Redis, Postgres, or custom)

## Provider Comparison

| Feature | Baileys | Whatsmeow | Cloud API |
|---------|---------|-----------|-----------|
| **Connection** | Multi-device protocol | Go WhatsApp library | Official Meta API |
| **Authentication** | QR code + session files | QR code + SQLite | Business account + token |
| **Ban Risk** | Medium (requires anti-ban) | Low | None (official) |
| **Cost** | Free | Free | Paid ($0.005-0.09/msg) |
| **Multi-device** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Media support** | ✅ Full | ✅ Full | ✅ Full |
| **Group support** | ✅ Full | ✅ Full | ⚠️ Limited |
| **Best for** | Small-medium scale | Medium-large scale | Enterprise |

**WaSP currently supports:** Baileys (v6.0+)
**Coming soon:** Whatsmeow, Cloud API

## Storage Options

### Memory Store (Default)
Fast, simple, **data lost on restart**. For development and testing only.

```typescript
import { WaSP, MemoryStore } from '@wasp/core';

const wasp = new WaSP({
  store: new MemoryStore(),
});
```

### Redis Store
Persistent, fast, ideal for **multi-instance deployments** and horizontal scaling.

```typescript
import { WaSP, RedisStore } from '@wasp/core';

const wasp = new WaSP({
  store: new RedisStore({
    host: 'localhost',
    port: 6379,
    password: 'your-redis-password',
    keyPrefix: 'wasp:session:',
    ttl: 86400, // 24 hours (0 = no expiry)
  }),
});
```

**Redis Store Features:**
- Session persistence across restarts
- Automatic TTL and cleanup
- Multi-instance safe (shared state)
- Fast lookup with key prefixes

### Postgres Store
Persistent, relational, **queryable**. Best for analytics, complex filtering, and audit trails.

```typescript
import { WaSP, PostgresStore } from '@wasp/core';

const wasp = new WaSP({
  store: new PostgresStore({
    connectionString: 'postgresql://user:pass@localhost/wasp',
    tableName: 'wasp_sessions',
    autoCreate: true, // Auto-create table if not exists
  }),
});
```

**Postgres Store Features:**
- Full SQL queries (analytics, reporting)
- JSONB metadata support
- Indexed lookups (orgId, status)
- Automatic table creation

**Table Schema:**
```sql
CREATE TABLE wasp_sessions (
  id VARCHAR(255) PRIMARY KEY,
  phone VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  org_id VARCHAR(255),
  connected_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_wasp_sessions_org_id ON wasp_sessions(org_id);
CREATE INDEX idx_wasp_sessions_status ON wasp_sessions(status);
```

## Anti-Ban Queue

WaSP's intelligent queue system prevents WhatsApp bans by simulating human behavior:

- **Random delays** between messages (2-5s default, configurable)
- **Priority lanes** for urgent messages (50% delay reduction)
- **Immediate bypass** for critical alerts (use sparingly!)
- **Rate limiting** per session with sliding windows
- **Concurrent control** to prevent message bursts

```typescript
// Regular message (2-5s delay)
await wasp.sendMessage('session-1', recipient, 'Hello');

// Priority message (1-2.5s delay, for time-sensitive messages)
await wasp.sendMessage('session-1', recipient, 'Bid accepted!', { priority: 10 });

// Immediate message (0s delay, CRITICAL ONLY - high ban risk!)
await wasp.sendMessage('session-1', recipient, 'EMERGENCY ALERT', { immediate: true });

// Check queue status
const stats = wasp.getQueueStats();
console.log(`Queued: ${stats.totalQueued}, Processing: ${stats.processingCount}`);
```

**Queue Configuration:**

```typescript
const wasp = new WaSP({
  queue: {
    minDelay: 2000,        // Minimum delay (ms)
    maxDelay: 5000,        // Maximum delay (ms)
    maxConcurrent: 3,      // Max parallel messages
    priorityLanes: true,   // Enable priority fast lane
  },
});
```

## Middleware System

WaSP's middleware pipeline allows you to compose cross-cutting concerns without polluting core logic.

### Built-in Middleware

```typescript
import { WaSP, logger, autoReconnect, errorHandler } from '@wasp/core';

const wasp = new WaSP();

// Log all events to console
wasp.use(logger());

// Auto-reconnect on disconnect (exponential backoff)
wasp.use(autoReconnect({
  maxAttempts: 5,
  baseDelay: 1000, // Start at 1s, doubles each retry
}));

// Centralized error handling
wasp.use(errorHandler((error, event) => {
  console.error(`Error in ${event.type}:`, error);
  // Send to Sentry, DataDog, etc.
}));
```

### Custom Middleware

```typescript
// Example: Rate limit per user
wasp.use(async (event, next) => {
  if (event.type === 'MESSAGE_RECEIVED') {
    const { from } = event.data;
    const count = await redis.incr(`ratelimit:${from}`);
    if (count > 10) {
      console.log(`Rate limit exceeded for ${from}`);
      return; // Skip next middleware
    }
  }
  await next();
});

// Example: Message analytics
wasp.use(async (event, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  await analytics.track({
    event: event.type,
    sessionId: event.sessionId,
    duration,
  });
});

// Example: Content moderation
wasp.use(async (event, next) => {
  if (event.type === 'MESSAGE_SENT') {
    const { content } = event.data;
    if (containsProfanity(content)) {
      console.warn('Blocked profane message');
      return;
    }
  }
  await next();
});
```

**Middleware execution order:** First registered → Last registered → Last registered (on return)

```
Middleware 1 (before)
  → Middleware 2 (before)
    → Core logic
  ← Middleware 2 (after)
← Middleware 1 (after)
```

## Event Types

WaSP emits normalized events across all providers:

| Event | Description | Data |
|-------|-------------|------|
| `SESSION_CONNECTED` | Session authenticated and ready | `{ phone: string }` |
| `SESSION_DISCONNECTED` | Session lost connection | `{ reason: string, shouldReconnect: boolean }` |
| `SESSION_QR` | QR code available for scanning | `{ qr: string }` |
| `SESSION_ERROR` | Session error occurred | `{ error: Error }` |
| `MESSAGE_RECEIVED` | Incoming message | `Message` object |
| `MESSAGE_SENT` | Outgoing message delivered | `Message` object |
| `MESSAGE_DELIVERED` | Message delivered to recipient | `{ id: string }` |
| `MESSAGE_READ` | Message read by recipient | `{ id: string }` |
| `GROUP_JOIN` | Bot joined a group | `{ groupId: string }` |
| `GROUP_LEAVE` | Bot left a group | `{ groupId: string }` |
| `PRESENCE_UPDATE` | User online/typing status | `{ from: string, status: string }` |

### Event Handling

```typescript
// Listen to specific event
wasp.on('MESSAGE_RECEIVED', (event) => {
  const message = event.data;
  console.log(`[${event.sessionId}] ${message.from}: ${message.content}`);
});

// Listen to all events (wildcard)
wasp.on('*', (event) => {
  console.log(`Event: ${event.type} from session ${event.sessionId}`);
});

// One-time listener
wasp.once('SESSION_CONNECTED', (event) => {
  console.log('First connection established!');
});

// Remove listener
const handler = (event) => console.log(event.type);
wasp.on('MESSAGE_SENT', handler);
wasp.off('MESSAGE_SENT', handler);
```

## Multi-Tenant Usage

WaSP is designed for **multi-tenant applications** where each user/organization manages their own WhatsApp session.

```typescript
// Create session per organization
await wasp.createSession('org-acme', 'BAILEYS', {
  orgId: 'org-acme',
  metadata: {
    companyName: 'Acme Corp',
    plan: 'enterprise',
    userId: 'user-123',
  },
});

await wasp.createSession('org-techco', 'BAILEYS', {
  orgId: 'org-techco',
  metadata: {
    companyName: 'Tech Co',
    plan: 'pro',
  },
});

// List all sessions for an organization
const acmeSessions = await wasp.listSessions({ orgId: 'org-acme' });
console.log(`Acme has ${acmeSessions.length} active sessions`);

// Send message from specific org's session
await wasp.sendMessage('org-acme', recipient, 'Hello from Acme!');
await wasp.sendMessage('org-techco', recipient, 'Hello from Tech Co!');

// Get session details
const session = await wasp.getSession('org-acme');
console.log(`Phone: ${session.phone}, Status: ${session.status}`);

// Destroy session when org unsubscribes
await wasp.destroySession('org-techco');
```

### Filtering Sessions

```typescript
// Get all connected sessions
const connectedSessions = await wasp.listSessions({
  status: 'CONNECTED'
});

// Get all Baileys sessions
const baileysSessions = await wasp.listSessions({
  provider: 'BAILEYS'
});

// Combine filters
const acmeConnected = await wasp.listSessions({
  orgId: 'org-acme',
  status: 'CONNECTED',
});
```

## API Reference

### Core Methods

#### `createSession(id, provider, options?)`
Create a new WhatsApp session.

```typescript
const session = await wasp.createSession('session-1', 'BAILEYS', {
  orgId: 'org-123',              // Optional: Organization ID
  metadata: { plan: 'pro' },     // Optional: Custom metadata
});
```

**Returns:** `Session` object
**Throws:** Error if session already exists

---

#### `destroySession(id)`
Disconnect and delete a session.

```typescript
await wasp.destroySession('session-1');
```

**Returns:** `Promise<void>`
**Throws:** Error if session not found

---

#### `getSession(id)`
Get session details by ID.

```typescript
const session = await wasp.getSession('session-1');
if (session) {
  console.log(`Status: ${session.status}, Phone: ${session.phone}`);
}
```

**Returns:** `Session | null`

---

#### `listSessions(filter?)`
List all sessions, optionally filtered.

```typescript
const sessions = await wasp.listSessions({
  orgId: 'org-123',
  status: 'CONNECTED',
});
```

**Returns:** `Session[]`

---

#### `sendMessage(sessionId, to, content, options?)`
Send a message through a session.

```typescript
const message = await wasp.sendMessage('session-1', '27821234567@s.whatsapp.net', 'Hello!', {
  priority: 5,                   // Optional: 0-10 (higher = faster)
  immediate: false,              // Optional: Skip queue (high ban risk)
  quoted: 'message-id-123',      // Optional: Reply to message
  media: '/path/to/file.jpg',    // Optional: Media file path or buffer
  mediaMimeType: 'image/jpeg',   // Optional: Media MIME type
});
```

**Returns:** `Promise<Message>`
**Throws:** Error if session not connected

---

#### `on(eventType, handler)`
Subscribe to events.

```typescript
wasp.on('MESSAGE_RECEIVED', (event) => {
  console.log('New message:', event.data);
});

// Wildcard listener
wasp.on('*', (event) => {
  console.log(`Event: ${event.type}`);
});
```

---

#### `use(middleware)`
Add middleware to event pipeline.

```typescript
wasp.use(async (event, next) => {
  console.log('Before:', event.type);
  await next();
  console.log('After:', event.type);
});
```

---

#### `getQueueStats()`
Get message queue statistics.

```typescript
const stats = wasp.getQueueStats();
console.log(`Queued: ${stats.totalQueued}, Processing: ${stats.processingCount}`);
```

**Returns:** `{ totalQueued: number, sessionCount: number, processingCount: number }`

---

#### `getSessionCount()`
Get total session count.

```typescript
const count = wasp.getSessionCount();
console.log(`Active sessions: ${count}`);
```

**Returns:** `number`

---

### Types

#### `Session`
```typescript
interface Session {
  id: string;                    // Unique session ID
  phone?: string;                // WhatsApp phone number (after connection)
  status: SessionStatus;         // CONNECTING | CONNECTED | DISCONNECTED | BANNED | THROTTLED | ERROR
  provider: ProviderType;        // BAILEYS | WHATSMEOW | CLOUD_API
  orgId?: string;                // Organization ID (multi-tenant)
  connectedAt?: Date;            // Connection timestamp
  createdAt: Date;               // Creation timestamp
  lastActivityAt?: Date;         // Last activity timestamp
  metadata?: SessionMetadata;    // Custom metadata
}
```

#### `Message`
```typescript
interface Message {
  id: string;                    // Unique message ID
  from: string;                  // Sender phone/JID
  to: string;                    // Recipient phone/JID or group ID
  type: MessageType;             // TEXT | IMAGE | VIDEO | AUDIO | DOCUMENT | etc.
  content: string;               // Message text or caption
  timestamp: Date;               // Message timestamp
  isGroup: boolean;              // Whether from a group
  groupId?: string;              // Group ID (if isGroup = true)
  quotedMessage?: QuotedMessage; // Replied message reference
  mediaUrl?: string;             // Media URL (for media messages)
  mediaMimeType?: string;        // Media MIME type
  raw?: unknown;                 // Provider-specific raw data
}
```

#### `WaspEvent`
```typescript
interface WaspEvent<T = unknown> {
  type: EventType;               // Event type
  sessionId: string;             // Session that triggered event
  timestamp: Date;               // Event timestamp
  data: T;                       // Event-specific data
}
```

## Examples

### Chatbot with Auto-Reply

```typescript
import { WaSP } from '@wasp/core';

const wasp = new WaSP();
await wasp.createSession('bot-1', 'BAILEYS');

wasp.on('MESSAGE_RECEIVED', async (event) => {
  const msg = event.data;

  if (msg.content.toLowerCase() === 'help') {
    await wasp.sendMessage(event.sessionId, msg.from,
      'Available commands:\n' +
      '- help: Show this message\n' +
      '- ping: Check if bot is alive\n' +
      '- time: Get current time'
    );
  } else if (msg.content.toLowerCase() === 'ping') {
    await wasp.sendMessage(event.sessionId, msg.from, 'Pong! 🏓');
  } else if (msg.content.toLowerCase() === 'time') {
    await wasp.sendMessage(event.sessionId, msg.from,
      `Current time: ${new Date().toLocaleString()}`
    );
  }
});
```

### Multi-Tenant Notification Service

```typescript
import { WaSP, RedisStore } from '@wasp/core';

const wasp = new WaSP({
  store: new RedisStore({ host: 'localhost', port: 6379 }),
});

// Provision sessions for each tenant
for (const tenant of tenants) {
  await wasp.createSession(tenant.id, 'BAILEYS', {
    orgId: tenant.id,
    metadata: { companyName: tenant.name },
  });
}

// Send notification to specific tenant's customers
async function sendNotification(tenantId: string, phoneNumbers: string[], message: string) {
  for (const phone of phoneNumbers) {
    await wasp.sendMessage(tenantId, `${phone}@s.whatsapp.net`, message, {
      priority: 5,
    });
  }
}

await sendNotification('tenant-123', ['27821234567', '27829876543'],
  'Your order has shipped! 🚚'
);
```

### QR Code Web Interface

```typescript
import express from 'express';
import { WaSP } from '@wasp/core';

const app = express();
const wasp = new WaSP();
const qrCodes = new Map();

// API: Create session and get QR
app.post('/sessions/:id', async (req, res) => {
  const { id } = req.params;

  await wasp.createSession(id, 'BAILEYS');

  // Wait for QR code
  const qr = await new Promise((resolve) => {
    wasp.once('SESSION_QR', (event) => {
      if (event.sessionId === id) resolve(event.data.qr);
    });
  });

  res.json({ qr });
});

// API: Check session status
app.get('/sessions/:id', async (req, res) => {
  const session = await wasp.getSession(req.params.id);
  res.json({
    status: session?.status,
    phone: session?.phone,
  });
});

app.listen(3000);
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/kobie3717/wasp.git
cd wasp

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint code
npm run lint

# Build for production
npm run build

# Development mode (watch + rebuild)
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Project Structure

```
wasp/
├── src/
│   ├── wasp.ts              # Core WaSP class
│   ├── types.ts             # TypeScript definitions
│   ├── queue.ts             # Anti-ban queue
│   ├── providers/
│   │   └── baileys.ts       # Baileys provider
│   ├── stores/
│   │   ├── memory.ts        # Memory store
│   │   ├── redis.ts         # Redis store
│   │   └── postgres.ts      # Postgres store
│   └── middleware/
│       ├── logger.ts        # Logger middleware
│       ├── autoReconnect.ts # Auto-reconnect middleware
│       └── errorHandler.ts  # Error handler middleware
├── tests/
│   └── __tests__/
│       └── wasp.test.ts     # Core tests
├── dist/                    # Built output (CJS + ESM)
├── package.json
├── tsconfig.json
└── README.md
```

### Roadmap

- [x] Baileys provider (v6.0+)
- [x] Memory store
- [x] Anti-ban queue with priority lanes
- [x] Middleware system
- [x] Redis store
- [x] Postgres store
- [ ] Whatsmeow provider
- [ ] Cloud API provider
- [ ] Message templates
- [ ] Webhook support
- [ ] Group management utilities
- [ ] Admin dashboard UI
- [ ] Metrics and monitoring
- [ ] Docker image
- [ ] Kubernetes manifests

## License

MIT © [Kobus Wentzel](https://github.com/kobie3717)

See [LICENSE](./LICENSE) file for details.

## Acknowledgments

Built with:
- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web multi-device API
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vitest](https://vitest.dev/) - Unit testing framework
- [tsup](https://tsup.egoist.dev/) - TypeScript bundler

## Support

- **Issues:** [Report bugs](https://github.com/kobie3717/wasp/issues)
- **Discussions:** [Ask questions](https://github.com/kobie3717/wasp/discussions)
- **Email:** kobie3717@gmail.com

## Real-World Usage

WaSP powers production WhatsApp integrations at:
- **WhatsAuction** (whatsauction.co.za) - Live auction platform with WhatsApp bidding
- **FlashVault VPN** (flashvault.co.za) - Customer notifications and support

## Security

For security issues, please email kobie3717@gmail.com instead of using the issue tracker.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

<div align="center">

**WaSP** - Because WhatsApp integrations shouldn't be this hard.

Made with ❤️ in South Africa

</div>
