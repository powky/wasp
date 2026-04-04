# TC Token / CS Token Implementation (Error 463 Prevention)

## Overview

WaSP v0.3.0 includes automatic TC token and CS token management to prevent WhatsApp error 463 (privacy token errors). This feature is transparent to users — tokens are automatically extracted, stored, and attached to messages without any manual intervention required.

## How It Works

### Token Types

1. **TC Tokens** (Trust & Consent tokens)
   - Extracted from WhatsApp's history sync and privacy_token notifications
   - Stored per-JID with timestamps
   - Automatically attached to 1:1 messages (not groups or broadcast)
   - Expire after 28 days by default (rolling bucket window)

2. **CS Tokens** (Computed Signature tokens)
   - Fallback when no TC token is available
   - Computed via HMAC-SHA256(nctSalt, recipientLid)
   - Cached for performance (LRU cache, max 5 entries)
   - Automatically invalidated when nctSalt changes

### Architecture

```
┌─────────────────────┐
│  BaileysProvider    │
│                     │
│  ┌──────────────┐   │
│  │ TC Token     │   │
│  │ Manager      │   │
│  │              │   │
│  │ - Extract    │   │
│  │ - Store      │   │
│  │ - Compute CS │   │
│  │ - Prune      │   │
│  └──────────────┘   │
└─────────────────────┘
         ↓
    sendMessage()
         ↓
   [tctoken/cstoken]
    node attached
```

### Rolling Bucket Expiration

Tokens use a rolling bucket expiration strategy:

- **Bucket Size**: 7 days (default)
- **Number of Buckets**: 4 (default)
- **Total Window**: 28 days

Formula:
```javascript
currentBucket = floor(now / bucketSize)
tokenBucket = floor(timestamp / bucketSize)
cutoffBucket = currentBucket - (numBuckets - 1)
expired = tokenBucket < cutoffBucket
```

Two modes:
- **Receiver Mode**: Used for determining if stored tokens are valid for sending
- **Sender Mode**: Used for deciding when to re-issue privacy tokens

### Monotonicity Guard

Tokens have a built-in monotonicity guard:
- Only accepts newer tokens (by timestamp)
- Rejects older tokens if a newer one exists
- Prevents token rollback attacks

### Automatic Re-issuance

WaSP automatically re-issues privacy tokens when:
1. No token exists for a JID
2. Token has no sender timestamp
3. Sender timestamp has moved to a new bucket

Re-issuance is fire-and-forget — failures are silently ignored.

## Usage

### Basic Setup (Automatic)

```typescript
import { BaileysProvider } from 'wasp-protocol';

const provider = new BaileysProvider({
  authDir: './auth_states',
  // TC tokens enabled by default
});

await provider.connect('session-1');

// Tokens are automatically:
// - Extracted from history sync
// - Stored to disk (tc-tokens.json)
// - Attached to outgoing messages
// - Pruned every 24 hours
```

### Configuration

```typescript
const provider = new BaileysProvider({
  authDir: './auth_states',
  tcTokenConfig: {
    // Disable feature entirely
    disabled: false,

    // Receiver mode bucket settings (for token validity)
    bucketSize: 7 * 24 * 3600,      // 7 days (seconds)
    numBuckets: 4,                  // 4 buckets = 28 day window

    // Sender mode bucket settings (for re-issuance)
    senderBucketSize: 7 * 24 * 3600,
    senderNumBuckets: 4,

    // Pruning interval
    pruneInterval: 24 * 3600 * 1000, // 24 hours (ms)

    // CS token cache size
    cstokenCacheSize: 5,             // LRU cache size
  },
});
```

### Disable TC Tokens

```typescript
const provider = new BaileysProvider({
  authDir: './auth_states',
  tcTokenConfig: {
    disabled: true,
  },
});
```

## Persistence

TC tokens are automatically persisted to:
```
{authDir}/{sessionId}/tc-tokens.json
```

Format:
```json
{
  "27821234567@s.whatsapp.net": {
    "token": "base64-encoded-token",
    "timestamp": 1711234567,
    "senderTimestamp": 1711234600
  }
}
```

## Manual Access (Advanced)

For advanced use cases, you can access the TC token manager directly:

```typescript
import { BaileysProvider, TcTokenManager } from 'wasp-protocol';

const provider = new BaileysProvider({ authDir: './auth' });
await provider.connect('session-1');

// Access the manager (internal API)
const socket = provider.getSocket();
// Note: tcTokenManager is private, use at your own risk

// Check statistics
const manager = new TcTokenManager({
  authDir: './auth',
  sessionId: 'session-1',
});

await manager.load();
const stats = manager.getStats();
console.log(stats);
// {
//   totalTokens: 42,
//   csTokenCacheSize: 3,
//   hasNctSalt: true
// }

manager.destroy();
```

## How Tokens Are Extracted

### 1. History Sync

When Baileys receives history sync data:

```typescript
socket.ev.on('messaging-history.set', async ({ conversations }) => {
  // TcTokenManager extracts:
  // - conversation.tcToken (field 21)
  // - conversation.tcTokenTimestamp (field 22)
  // - conversation.tcTokenSenderTimestamp (field 28)

  tcTokenManager.processHistorySync(conversations);
  await tcTokenManager.persist();
});
```

### 2. Credentials Update (nctSalt)

When Baileys receives credential updates:

```typescript
socket.ev.on('creds.update', async (update) => {
  if (update.nctSalt) {
    tcTokenManager.setNctSalt(Buffer.from(update.nctSalt));
    // CS token cache is automatically invalidated
    await tcTokenManager.persist();
  }
});
```

### 3. Privacy Token Notifications

When WhatsApp sends privacy token updates:

```typescript
// Example node structure:
// <notification type="privacy_token">
//   <token jid="..." token="base64..." timestamp="123456789" />
// </notification>

tcTokenManager.processPrivacyTokenNotification(node);
```

## Message Injection

Tokens are injected via Baileys' `additionalNodes` option:

```typescript
const originalSendMessage = socket.sendMessage.bind(socket);
socket.sendMessage = async (jid, content, options) => {
  // Get tokens for this JID
  const tokenNodes = tcTokenManager.getTokenNodes(jid);

  if (tokenNodes) {
    options = options || {};
    options.additionalNodes = [
      ...(options.additionalNodes || []),
      ...tokenNodes,
    ];
  }

  const result = await originalSendMessage(jid, content, options);

  // Fire-and-forget: re-issue if needed
  if (tcTokenManager.shouldSendNewToken(jid)) {
    issuePrivacyToken(jid).catch(() => {});
  }

  return result;
};
```

Token nodes are formatted as:

```typescript
{
  tag: 'tctoken' | 'cstoken',
  attrs: {},
  content: Buffer  // 32-byte token
}
```

## Pruning

Automatic pruning runs every 24 hours by default:

```typescript
// Start pruning interval
tcTokenManager.startPruning();

// Manually prune
const removedCount = tcTokenManager.pruneExpired();
console.log(`Removed ${removedCount} expired tokens`);

// Stop pruning interval
tcTokenManager.stopPruning();
```

Expired tokens are removed based on receiver mode expiration.

## Testing

Comprehensive test suite included:

```bash
cd /root/wasp
npm test -- tc-token
```

Tests cover:
- Rolling bucket expiration (sender & receiver modes)
- CS token computation (HMAC-SHA256)
- LRU cache eviction
- Token storage and retrieval
- Monotonicity guard
- Pruning
- nctSalt change handling
- Persistence (save/load)
- History sync extraction
- Privacy token notification processing
- shouldSendNewToken logic

## Performance Considerations

1. **In-Memory Storage**: All tokens stored in Map for O(1) access
2. **LRU Cache**: CS tokens cached (max 5 entries) to avoid repeated HMAC computation
3. **Lazy Pruning**: Expired tokens only removed during:
   - Scheduled 24h pruning interval
   - Manual `pruneExpired()` call
   - Load from disk (skip expired)
4. **Fire-and-Forget Re-issuance**: Token re-issuance doesn't block message sending

## Security Notes

1. **Token Confidentiality**: Tokens are privacy-sensitive and should be protected
2. **File Permissions**: Ensure `tc-tokens.json` has appropriate permissions (600)
3. **Monotonicity**: The monotonicity guard prevents token rollback
4. **Salt Changes**: nctSalt changes invalidate all CS tokens (by design)

## Troubleshooting

### Tokens not being attached

Check:
1. Feature is enabled: `tcTokenConfig.disabled !== true`
2. Target is 1:1 chat (not group or broadcast)
3. Tokens exist: `tcTokenManager.getStats()`

### CS tokens not working

Check:
1. nctSalt is available: `stats.hasNctSalt === true`
2. Recipient LID is extracted correctly (phone number part of JID)

### High memory usage

Check:
1. Number of stored tokens: `stats.totalTokens`
2. Pruning is running: `tcTokenManager.startPruning()`
3. Adjust bucket settings to expire tokens faster

## Migration Notes

No migration needed — feature is backward compatible. Existing WaSP installations will automatically:
- Extract tokens from history sync on first connection
- Store tokens to `tc-tokens.json`
- Start using tokens immediately

To disable for a specific session:
```typescript
new BaileysProvider({
  tcTokenConfig: { disabled: true }
})
```

## Credits

Implementation based on WhatsApp protocol analysis and Baileys library patterns.

## License

MIT (same as WaSP)
