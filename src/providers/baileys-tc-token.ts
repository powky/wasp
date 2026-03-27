/**
 * TC Token Manager for Error 463 Prevention
 *
 * Implements rolling bucket-based TC token management and CS token fallback
 * to prevent WhatsApp's privacy token errors (error 463).
 *
 * Architecture:
 * - TC tokens: Extracted from history sync and privacy_token notifications
 * - CS tokens: Computed via HMAC-SHA256(nctSalt, recipientLid) as fallback
 * - Rolling bucket expiration: Tokens expire after (numBuckets * bucketSize) seconds
 * - Monotonicity guard: Reject older tokens when newer ones exist
 * - LRU cache: CS tokens cached for performance (max 5 entries)
 *
 * @module baileys-tc-token
 */

import { createHmac } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/** TC Token representation */
export interface TcToken {
  /** Token buffer (raw bytes) */
  token: Buffer;
  /** Receiver timestamp (when token was issued) */
  timestamp: number;
  /** Sender timestamp (when we sent the token) */
  senderTimestamp?: number;
}

/** TC Token manager configuration */
export interface TcTokenConfig {
  /** Rolling bucket size in seconds (default: 7 days) */
  bucketSize?: number;
  /** Number of rolling buckets (default: 4) */
  numBuckets?: number;
  /** Sender mode bucket size in seconds (default: 7 days) */
  senderBucketSize?: number;
  /** Sender mode number of buckets (default: 4) */
  senderNumBuckets?: number;
  /** Pruning interval in ms (default: 24h) */
  pruneInterval?: number;
  /** CS token LRU cache size (default: 5) */
  cstokenCacheSize?: number;
  /** Disable TC token feature entirely */
  disabled?: boolean;
}

/** Persisted token storage format */
interface TokenStorage {
  [jid: string]: {
    token: string; // base64
    timestamp: number;
    senderTimestamp?: number;
  };
}

/** CS token cache entry */
interface CsTokenCacheEntry {
  jid: string;
  token: Buffer;
}

/** Default configuration */
const DEFAULT_CONFIG: Required<Omit<TcTokenConfig, 'disabled'>> = {
  bucketSize: 7 * 24 * 3600, // 7 days
  numBuckets: 4,
  senderBucketSize: 7 * 24 * 3600,
  senderNumBuckets: 4,
  pruneInterval: 24 * 3600 * 1000, // 24 hours
  cstokenCacheSize: 5,
};

/**
 * TC Token Manager
 *
 * Manages TC tokens (from history sync / privacy notifications) and CS tokens
 * (computed via HMAC) for WhatsApp error 463 prevention.
 */
export class TcTokenManager {
  private config: Required<Omit<TcTokenConfig, 'disabled'>>;
  private authDir: string;
  private logger?: any;

  /** TC token store (JID → token) */
  private tokens: Map<string, TcToken> = new Map();

  /** NCT salt for CS token computation */
  private nctSalt: Buffer | null = null;

  /** CS token LRU cache */
  private csTokenCache: CsTokenCacheEntry[] = [];

  /** Pruning interval handle */
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(options: {
    authDir: string;
    sessionId: string;
    logger?: any;
    config?: TcTokenConfig;
  }) {
    this.authDir = options.authDir;
    // sessionId is kept in constructor signature for API consistency
    this.logger = options.logger;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
    };
  }

  /**
   * Check if a token is expired using rolling bucket logic
   *
   * @param timestamp Token timestamp (seconds)
   * @param mode 'receiver' or 'sender'
   * @returns true if expired
   */
  isTokenExpired(timestamp: number, mode: 'sender' | 'receiver'): boolean {
    const now = Math.floor(Date.now() / 1000);
    const bucketSize =
      mode === 'sender' ? this.config.senderBucketSize : this.config.bucketSize;
    const numBuckets =
      mode === 'sender' ? this.config.senderNumBuckets : this.config.numBuckets;

    const currentBucket = Math.floor(now / bucketSize);
    const tokenBucket = Math.floor(timestamp / bucketSize);
    const cutoffBucket = currentBucket - (numBuckets - 1);

    return tokenBucket < cutoffBucket;
  }

  /**
   * Get TC token for a JID
   *
   * @param jid WhatsApp JID
   * @returns Token or null if not found / expired
   */
  getTokenForJid(jid: string): TcToken | null {
    const token = this.tokens.get(jid);
    if (!token) return null;

    if (this.isTokenExpired(token.timestamp, 'receiver')) {
      this.tokens.delete(jid);
      return null;
    }

    return token;
  }

  /**
   * Store a TC token with monotonicity guard
   *
   * @param jid WhatsApp JID
   * @param token Token to store
   * @returns true if stored, false if rejected (older than existing)
   */
  storeToken(jid: string, token: TcToken): boolean {
    const existing = this.tokens.get(jid);

    // Monotonicity guard: reject if existing token is newer
    if (existing && existing.timestamp > token.timestamp) {
      this.logger?.debug?.(
        `[TcTokenManager] Rejected older token for ${jid}: existing=${existing.timestamp}, new=${token.timestamp}`
      );
      return false;
    }

    this.tokens.set(jid, token);
    this.logger?.debug?.(
      `[TcTokenManager] Stored token for ${jid}: timestamp=${token.timestamp}`
    );
    return true;
  }

  /**
   * Compute CS token for a recipient LID
   *
   * @param recipientLid Recipient's LID (phone number part of JID)
   * @returns CS token buffer or null if no nctSalt available
   */
  computeCsToken(recipientLid: string): Buffer | null {
    if (!this.nctSalt) {
      return null;
    }

    // Check LRU cache
    const cached = this.csTokenCache.find((entry) => entry.jid === recipientLid);
    if (cached) {
      // Move to end (LRU)
      this.csTokenCache = this.csTokenCache.filter((e) => e.jid !== recipientLid);
      this.csTokenCache.push(cached);
      return cached.token;
    }

    // Compute HMAC-SHA256
    const hmac = createHmac('sha256', this.nctSalt);
    hmac.update(recipientLid, 'utf8');
    const token = hmac.digest();

    // Add to cache
    this.csTokenCache.push({ jid: recipientLid, token });

    // Evict oldest if over limit
    if (this.csTokenCache.length > this.config.cstokenCacheSize) {
      this.csTokenCache.shift();
    }

    this.logger?.debug?.(
      `[TcTokenManager] Computed CS token for ${recipientLid}, cache size: ${this.csTokenCache.length}`
    );

    return token;
  }

  /**
   * Get token nodes for message stanza injection
   *
   * @param jid Recipient JID
   * @returns Array of WABinaryNode-compatible objects or null
   */
  getTokenNodes(jid: string): { tag: string; attrs: Record<string, string>; content: Buffer }[] | null {
    // Try TC token first
    const tcToken = this.getTokenForJid(jid);
    if (tcToken) {
      return [
        {
          tag: 'tctoken',
          attrs: {},
          content: tcToken.token,
        },
      ];
    }

    // Fallback to CS token
    const recipientLid = jid.split('@')[0] || '';
    const csToken = this.computeCsToken(recipientLid);
    if (csToken) {
      return [
        {
          tag: 'cstoken',
          attrs: {},
          content: csToken,
        },
      ];
    }

    return null;
  }

  /**
   * Check if we should send a new privacy token to this JID
   *
   * @param jid Recipient JID
   * @returns true if re-issuance needed
   */
  shouldSendNewToken(jid: string): boolean {
    const token = this.tokens.get(jid);
    if (!token || !token.senderTimestamp) {
      // No token or never sent — need to issue
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const currentBucket = Math.floor(now / this.config.senderBucketSize);
    const tokenBucket = Math.floor(token.senderTimestamp / this.config.senderBucketSize);

    // Re-issue if we've moved to a new bucket
    return currentBucket > tokenBucket;
  }

  /**
   * Process history sync to extract TC tokens
   *
   * @param conversations Array of conversation objects from Baileys
   */
  processHistorySync(conversations: any[]): void {
    let extracted = 0;

    for (const conv of conversations) {
      try {
        const jid = conv.id;
        const tcTokenBytes = conv.tcToken; // field 21
        const tcTokenTimestamp = conv.tcTokenTimestamp; // field 22
        const tcTokenSenderTimestamp = conv.tcTokenSenderTimestamp; // field 28

        if (jid && tcTokenBytes && tcTokenTimestamp) {
          const token: TcToken = {
            token: Buffer.from(tcTokenBytes),
            timestamp: tcTokenTimestamp,
            senderTimestamp: tcTokenSenderTimestamp,
          };

          if (this.storeToken(jid, token)) {
            extracted++;
          }
        }
      } catch (error) {
        this.logger?.warn?.(`[TcTokenManager] Failed to extract token from conversation:`, error);
      }
    }

    if (extracted > 0) {
      this.logger?.info?.(`[TcTokenManager] Extracted ${extracted} TC tokens from history sync`);
    }
  }

  /**
   * Process privacy_token notification stanza
   *
   * @param node Privacy token notification node
   */
  processPrivacyTokenNotification(node: any): void {
    try {
      // Example structure (WhatsApp-specific):
      // <notification type="privacy_token">
      //   <token jid="..." token="base64..." timestamp="123456789" />
      //   <token jid="..." token="base64..." timestamp="123456789" />
      // </notification>

      if (!node.content || !Array.isArray(node.content)) {
        return;
      }

      let extracted = 0;
      for (const child of node.content) {
        if (child.tag === 'token' && child.attrs) {
          const jid = child.attrs.jid;
          const tokenBase64 = child.attrs.token;
          const timestamp = parseInt(child.attrs.timestamp, 10);

          if (jid && tokenBase64 && !isNaN(timestamp)) {
            const token: TcToken = {
              token: Buffer.from(tokenBase64, 'base64'),
              timestamp,
            };

            if (this.storeToken(jid, token)) {
              extracted++;
            }
          }
        }
      }

      if (extracted > 0) {
        this.logger?.info?.(
          `[TcTokenManager] Extracted ${extracted} TC tokens from privacy_token notification`
        );
      }
    } catch (error) {
      this.logger?.warn?.(`[TcTokenManager] Failed to process privacy_token notification:`, error);
    }
  }

  /**
   * Set NCT salt for CS token computation
   *
   * @param salt NCT salt buffer
   */
  setNctSalt(salt: Buffer): void {
    this.nctSalt = salt;
    // Invalidate CS token cache since all CS tokens depend on salt
    this.csTokenCache = [];
    this.logger?.info?.(`[TcTokenManager] NCT salt updated, CS token cache cleared`);
  }

  /**
   * Prune expired tokens
   *
   * @returns Number of tokens removed
   */
  pruneExpired(): number {
    const before = this.tokens.size;

    for (const [jid, token] of this.tokens.entries()) {
      if (this.isTokenExpired(token.timestamp, 'receiver')) {
        this.tokens.delete(jid);
      }
    }

    const removed = before - this.tokens.size;
    if (removed > 0) {
      this.logger?.info?.(`[TcTokenManager] Pruned ${removed} expired tokens`);
    }

    return removed;
  }

  /**
   * Start automatic pruning interval
   */
  startPruning(): void {
    if (this.pruneTimer) {
      return; // Already started
    }

    this.pruneTimer = setInterval(() => {
      this.pruneExpired();
    }, this.config.pruneInterval);

    this.logger?.debug?.(
      `[TcTokenManager] Started pruning interval (${this.config.pruneInterval}ms)`
    );
  }

  /**
   * Stop automatic pruning interval
   */
  stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
      this.logger?.debug?.(`[TcTokenManager] Stopped pruning interval`);
    }
  }

  /**
   * Persist tokens to disk
   */
  async persist(): Promise<void> {
    try {
      const storage: TokenStorage = {};

      for (const [jid, token] of this.tokens.entries()) {
        storage[jid] = {
          token: token.token.toString('base64'),
          timestamp: token.timestamp,
          senderTimestamp: token.senderTimestamp,
        };
      }

      const filePath = path.join(this.authDir, 'tc-tokens.json');
      await fs.writeFile(filePath, JSON.stringify(storage, null, 2), 'utf8');

      this.logger?.debug?.(
        `[TcTokenManager] Persisted ${this.tokens.size} tokens to ${filePath}`
      );
    } catch (error) {
      this.logger?.error?.(`[TcTokenManager] Failed to persist tokens:`, error);
    }
  }

  /**
   * Load tokens from disk
   */
  async load(): Promise<void> {
    try {
      const filePath = path.join(this.authDir, 'tc-tokens.json');

      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist — not an error
        this.logger?.debug?.(`[TcTokenManager] No existing token file found`);
        return;
      }

      const data = await fs.readFile(filePath, 'utf8');
      const storage: TokenStorage = JSON.parse(data);

      let loaded = 0;
      for (const [jid, stored] of Object.entries(storage)) {
        const token: TcToken = {
          token: Buffer.from(stored.token, 'base64'),
          timestamp: stored.timestamp,
          senderTimestamp: stored.senderTimestamp,
        };

        // Skip expired tokens on load
        if (!this.isTokenExpired(token.timestamp, 'receiver')) {
          this.tokens.set(jid, token);
          loaded++;
        }
      }

      this.logger?.info?.(
        `[TcTokenManager] Loaded ${loaded} tokens from ${filePath} (skipped ${
          Object.keys(storage).length - loaded
        } expired)`
      );
    } catch (error) {
      this.logger?.error?.(`[TcTokenManager] Failed to load tokens:`, error);
    }
  }

  /**
   * Destroy manager (cleanup timers and caches)
   */
  destroy(): void {
    this.stopPruning();
    this.tokens.clear();
    this.csTokenCache = [];
    this.nctSalt = null;
    this.logger?.debug?.(`[TcTokenManager] Destroyed`);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTokens: number;
    csTokenCacheSize: number;
    hasNctSalt: boolean;
  } {
    return {
      totalTokens: this.tokens.size,
      csTokenCacheSize: this.csTokenCache.length,
      hasNctSalt: this.nctSalt !== null,
    };
  }
}
