/**
 * TC Token Manager tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TcTokenManager } from '../providers/baileys-tc-token.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createHmac } from 'crypto';

const TEST_AUTH_DIR = '/tmp/wasp-test-tc-tokens';
const TEST_SESSION_ID = 'test-session';

describe('TcTokenManager', () => {
  let manager: TcTokenManager;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_AUTH_DIR, { recursive: true });

    manager = new TcTokenManager({
      authDir: TEST_AUTH_DIR,
      sessionId: TEST_SESSION_ID,
      logger: undefined, // Silent logger for tests
    });
  });

  afterEach(async () => {
    manager.destroy();

    // Clean up test directory
    try {
      await fs.rm(TEST_AUTH_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Rolling bucket expiration', () => {
    it('should not expire token within valid window (receiver mode)', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 3600;

      // Token from 1 day ago should still be valid (window is 28 days by default)
      expect(manager.isTokenExpired(oneDayAgo, 'receiver')).toBe(false);
    });

    it('should expire token outside window (receiver mode)', () => {
      const now = Math.floor(Date.now() / 1000);
      const bucketSize = 7 * 24 * 3600; // 7 days
      const numBuckets = 4;
      const thirtyDaysAgo = now - 30 * 24 * 3600;

      // Token from 30 days ago should be expired (window is 28 days)
      expect(manager.isTokenExpired(thirtyDaysAgo, 'receiver')).toBe(true);
    });

    it('should handle boundary case at cutoff', () => {
      const now = Math.floor(Date.now() / 1000);
      const bucketSize = 7 * 24 * 3600;
      const numBuckets = 4;

      const currentBucket = Math.floor(now / bucketSize);
      const cutoffBucket = currentBucket - (numBuckets - 1);
      const cutoffTimestamp = cutoffBucket * bucketSize;

      // Token exactly at cutoff should not be expired
      expect(manager.isTokenExpired(cutoffTimestamp, 'receiver')).toBe(false);

      // Token just before cutoff should be expired
      expect(manager.isTokenExpired(cutoffTimestamp - 1, 'receiver')).toBe(true);
    });

    it('should use different config for sender vs receiver mode', () => {
      const customManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
        config: {
          bucketSize: 7 * 24 * 3600, // 7 days
          numBuckets: 4,
          senderBucketSize: 1 * 24 * 3600, // 1 day
          senderNumBuckets: 2,
        },
      });

      const now = Math.floor(Date.now() / 1000);
      const threeDaysAgo = now - 3 * 24 * 3600;

      // Token from 3 days ago: valid in receiver mode (28 day window)
      expect(customManager.isTokenExpired(threeDaysAgo, 'receiver')).toBe(false);

      // But expired in sender mode (2 day window)
      expect(customManager.isTokenExpired(threeDaysAgo, 'sender')).toBe(true);

      customManager.destroy();
    });
  });

  describe('CS token computation', () => {
    it('should return null when no nctSalt is set', () => {
      const token = manager.computeCsToken('27821234567');
      expect(token).toBeNull();
    });

    it('should compute HMAC-SHA256 correctly', () => {
      const salt = Buffer.from('test-salt-12345');
      manager.setNctSalt(salt);

      const recipientLid = '27821234567';
      const token = manager.computeCsToken(recipientLid);

      // Manually compute expected HMAC
      const expected = createHmac('sha256', salt).update(recipientLid, 'utf8').digest();

      expect(token).toEqual(expected);
    });

    it('should cache CS tokens (LRU)', () => {
      const salt = Buffer.from('test-salt');
      manager.setNctSalt(salt);

      const lid1 = '27821111111';
      const lid2 = '27822222222';

      // First call should compute
      const token1a = manager.computeCsToken(lid1);
      const token2a = manager.computeCsToken(lid2);

      // Second call should hit cache (same result, no recomputation)
      const token1b = manager.computeCsToken(lid1);
      const token2b = manager.computeCsToken(lid2);

      expect(token1a).toEqual(token1b);
      expect(token2a).toEqual(token2b);

      // Stats should show cache
      const stats = manager.getStats();
      expect(stats.csTokenCacheSize).toBe(2);
    });

    it('should evict oldest entry when cache exceeds max size', () => {
      const customManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
        config: {
          cstokenCacheSize: 3,
        },
      });

      const salt = Buffer.from('test-salt');
      customManager.setNctSalt(salt);

      // Add 4 entries (max is 3)
      customManager.computeCsToken('lid1');
      customManager.computeCsToken('lid2');
      customManager.computeCsToken('lid3');
      customManager.computeCsToken('lid4');

      const stats = customManager.getStats();
      expect(stats.csTokenCacheSize).toBe(3); // Should evict oldest

      customManager.destroy();
    });

    it('should invalidate cache when salt changes', () => {
      const salt1 = Buffer.from('salt1');
      const salt2 = Buffer.from('salt2');

      manager.setNctSalt(salt1);
      manager.computeCsToken('lid1');
      manager.computeCsToken('lid2');

      expect(manager.getStats().csTokenCacheSize).toBe(2);

      // Change salt — cache should be cleared
      manager.setNctSalt(salt2);
      expect(manager.getStats().csTokenCacheSize).toBe(0);
    });
  });

  describe('Monotonicity guard', () => {
    it('should accept newer token', () => {
      const jid = '27821234567@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      const olderToken = {
        token: Buffer.from('older'),
        timestamp: now - 1000,
      };

      const newerToken = {
        token: Buffer.from('newer'),
        timestamp: now,
      };

      expect(manager.storeToken(jid, olderToken)).toBe(true);
      expect(manager.storeToken(jid, newerToken)).toBe(true);

      const stored = manager.getTokenForJid(jid);
      expect(stored?.token).toEqual(Buffer.from('newer'));
    });

    it('should reject older token when newer exists', () => {
      const jid = '27821234567@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      const newerToken = {
        token: Buffer.from('newer'),
        timestamp: now,
      };

      const olderToken = {
        token: Buffer.from('older'),
        timestamp: now - 1000,
      };

      expect(manager.storeToken(jid, newerToken)).toBe(true);
      expect(manager.storeToken(jid, olderToken)).toBe(false);

      const stored = manager.getTokenForJid(jid);
      expect(stored?.token).toEqual(Buffer.from('newer'));
    });
  });

  describe('Token node generation', () => {
    it('should return tctoken node when valid token exists', () => {
      const jid = '27821234567@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      manager.storeToken(jid, {
        token: Buffer.from('test-tc-token'),
        timestamp: now,
      });

      const nodes = manager.getTokenNodes(jid);
      expect(nodes).toHaveLength(1);
      expect(nodes![0]).toEqual({
        tag: 'tctoken',
        attrs: {},
        content: Buffer.from('test-tc-token'),
      });
    });

    it('should fallback to cstoken when no tctoken', () => {
      const jid = '27821234567@s.whatsapp.net';
      const salt = Buffer.from('test-salt');
      manager.setNctSalt(salt);

      const nodes = manager.getTokenNodes(jid);
      expect(nodes).toHaveLength(1);
      expect(nodes![0]!.tag).toBe('cstoken');
      expect(nodes![0]!.content).toBeInstanceOf(Buffer);
      expect(nodes![0]!.content.length).toBe(32); // SHA256 output
    });

    it('should return null when neither tctoken nor cstoken available', () => {
      const jid = '27821234567@s.whatsapp.net';

      // No nctSalt, no TC token
      const nodes = manager.getTokenNodes(jid);
      expect(nodes).toBeNull();
    });

    it('should prefer tctoken over cstoken', () => {
      const jid = '27821234567@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      // Set both
      manager.setNctSalt(Buffer.from('salt'));
      manager.storeToken(jid, {
        token: Buffer.from('tc-token'),
        timestamp: now,
      });

      const nodes = manager.getTokenNodes(jid);
      expect(nodes![0]!.tag).toBe('tctoken');
      expect(nodes![0]!.content).toEqual(Buffer.from('tc-token'));
    });
  });

  describe('History sync extraction', () => {
    it('should extract tokens from conversation objects', () => {
      const conversations = [
        {
          id: '27821111111@s.whatsapp.net',
          tcToken: Buffer.from('token1'),
          tcTokenTimestamp: Math.floor(Date.now() / 1000) - 1000,
          tcTokenSenderTimestamp: Math.floor(Date.now() / 1000) - 500,
        },
        {
          id: '27822222222@s.whatsapp.net',
          tcToken: Buffer.from('token2'),
          tcTokenTimestamp: Math.floor(Date.now() / 1000) - 2000,
        },
      ];

      manager.processHistorySync(conversations);

      const token1 = manager.getTokenForJid('27821111111@s.whatsapp.net');
      const token2 = manager.getTokenForJid('27822222222@s.whatsapp.net');

      expect(token1?.token).toEqual(Buffer.from('token1'));
      expect(token1?.senderTimestamp).toBeDefined();
      expect(token2?.token).toEqual(Buffer.from('token2'));
    });

    it('should handle missing fields gracefully', () => {
      const conversations = [
        { id: '27821111111@s.whatsapp.net' }, // No token fields
        { tcToken: Buffer.from('token'), tcTokenTimestamp: 123456 }, // No id
        { id: '27822222222@s.whatsapp.net', tcToken: Buffer.from('token') }, // No timestamp
      ];

      // Should not throw
      expect(() => manager.processHistorySync(conversations)).not.toThrow();

      // No tokens should be stored
      expect(manager.getStats().totalTokens).toBe(0);
    });
  });

  describe('Pruning', () => {
    it('should remove expired tokens', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTimestamp = now - 30 * 24 * 3600; // 30 days ago
      const validTimestamp = now - 1 * 24 * 3600; // 1 day ago

      manager.storeToken('expired@s.whatsapp.net', {
        token: Buffer.from('expired'),
        timestamp: expiredTimestamp,
      });

      manager.storeToken('valid@s.whatsapp.net', {
        token: Buffer.from('valid'),
        timestamp: validTimestamp,
      });

      expect(manager.getStats().totalTokens).toBe(2);

      const removed = manager.pruneExpired();
      expect(removed).toBe(1);
      expect(manager.getStats().totalTokens).toBe(1);

      expect(manager.getTokenForJid('expired@s.whatsapp.net')).toBeNull();
      expect(manager.getTokenForJid('valid@s.whatsapp.net')).not.toBeNull();
    });

    it('should keep valid tokens', () => {
      const now = Math.floor(Date.now() / 1000);

      manager.storeToken('valid1@s.whatsapp.net', {
        token: Buffer.from('valid1'),
        timestamp: now - 1000,
      });

      manager.storeToken('valid2@s.whatsapp.net', {
        token: Buffer.from('valid2'),
        timestamp: now - 2000,
      });

      const removed = manager.pruneExpired();
      expect(removed).toBe(0);
      expect(manager.getStats().totalTokens).toBe(2);
    });

    it('should return correct count', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTimestamp = now - 30 * 24 * 3600;

      for (let i = 0; i < 5; i++) {
        manager.storeToken(`expired${i}@s.whatsapp.net`, {
          token: Buffer.from(`expired${i}`),
          timestamp: expiredTimestamp,
        });
      }

      const removed = manager.pruneExpired();
      expect(removed).toBe(5);
    });
  });

  describe('Persistence', () => {
    it('should save and load tokens correctly', async () => {
      const now = Math.floor(Date.now() / 1000);

      manager.storeToken('jid1@s.whatsapp.net', {
        token: Buffer.from('token1'),
        timestamp: now - 1000,
        senderTimestamp: now - 500,
      });

      manager.storeToken('jid2@s.whatsapp.net', {
        token: Buffer.from('token2'),
        timestamp: now - 2000,
      });

      await manager.persist();

      // Create new manager and load
      const newManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
      });

      await newManager.load();

      const token1 = newManager.getTokenForJid('jid1@s.whatsapp.net');
      const token2 = newManager.getTokenForJid('jid2@s.whatsapp.net');

      expect(token1?.token).toEqual(Buffer.from('token1'));
      expect(token1?.timestamp).toBe(now - 1000);
      expect(token1?.senderTimestamp).toBe(now - 500);

      expect(token2?.token).toEqual(Buffer.from('token2'));
      expect(token2?.timestamp).toBe(now - 2000);

      newManager.destroy();
    });

    it('should skip expired tokens on load', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredTimestamp = now - 30 * 24 * 3600;

      manager.storeToken('expired@s.whatsapp.net', {
        token: Buffer.from('expired'),
        timestamp: expiredTimestamp,
      });

      manager.storeToken('valid@s.whatsapp.net', {
        token: Buffer.from('valid'),
        timestamp: now - 1000,
      });

      await manager.persist();

      const newManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
      });

      await newManager.load();

      expect(newManager.getStats().totalTokens).toBe(1);
      expect(newManager.getTokenForJid('valid@s.whatsapp.net')).not.toBeNull();
      expect(newManager.getTokenForJid('expired@s.whatsapp.net')).toBeNull();

      newManager.destroy();
    });

    it('should handle missing file gracefully', async () => {
      const newManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: 'non-existent-session',
      });

      // Should not throw
      await expect(newManager.load()).resolves.not.toThrow();
      expect(newManager.getStats().totalTokens).toBe(0);

      newManager.destroy();
    });

    it('should serialize Buffer to base64 and deserialize back', async () => {
      const token = Buffer.from('test-token-binary-data-🔐');

      manager.storeToken('test@s.whatsapp.net', {
        token,
        timestamp: Math.floor(Date.now() / 1000),
      });

      await manager.persist();

      // Read raw file to verify base64 encoding
      const filePath = path.join(TEST_AUTH_DIR, 'tc-tokens.json');
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      expect(data['test@s.whatsapp.net'].token).toBe(token.toString('base64'));

      // Load and verify
      const newManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
      });

      await newManager.load();
      const loaded = newManager.getTokenForJid('test@s.whatsapp.net');
      expect(loaded?.token).toEqual(token);

      newManager.destroy();
    });
  });

  describe('shouldSendNewToken', () => {
    it('should return true when no token exists', () => {
      const jid = 'no-token@s.whatsapp.net';
      expect(manager.shouldSendNewToken(jid)).toBe(true);
    });

    it('should return true when token has no senderTimestamp', () => {
      const jid = 'no-sender@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      manager.storeToken(jid, {
        token: Buffer.from('token'),
        timestamp: now,
        // No senderTimestamp
      });

      expect(manager.shouldSendNewToken(jid)).toBe(true);
    });

    it('should return false when in same sender bucket', () => {
      const jid = 'same-bucket@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      manager.storeToken(jid, {
        token: Buffer.from('token'),
        timestamp: now,
        senderTimestamp: now - 1000, // 1000 seconds ago, same bucket
      });

      expect(manager.shouldSendNewToken(jid)).toBe(false);
    });

    it('should return true when moved to new sender bucket', () => {
      const customManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
        config: {
          senderBucketSize: 1, // 1 second buckets for testing
          senderNumBuckets: 4,
        },
      });

      const jid = 'new-bucket@s.whatsapp.net';
      const now = Math.floor(Date.now() / 1000);

      customManager.storeToken(jid, {
        token: Buffer.from('token'),
        timestamp: now,
        senderTimestamp: now - 10, // 10 seconds ago, definitely new bucket
      });

      expect(customManager.shouldSendNewToken(jid)).toBe(true);

      customManager.destroy();
    });
  });

  describe('Privacy token notification processing', () => {
    it('should extract tokens from notification nodes', () => {
      const now = Math.floor(Date.now() / 1000);
      const node = {
        tag: 'notification',
        attrs: { type: 'privacy_token' },
        content: [
          {
            tag: 'token',
            attrs: {
              jid: 'jid1@s.whatsapp.net',
              token: Buffer.from('token1').toString('base64'),
              timestamp: (now - 1000).toString(),
            },
          },
          {
            tag: 'token',
            attrs: {
              jid: 'jid2@s.whatsapp.net',
              token: Buffer.from('token2').toString('base64'),
              timestamp: (now - 2000).toString(),
            },
          },
        ],
      };

      manager.processPrivacyTokenNotification(node);

      const token1 = manager.getTokenForJid('jid1@s.whatsapp.net');
      const token2 = manager.getTokenForJid('jid2@s.whatsapp.net');

      expect(token1?.token).toEqual(Buffer.from('token1'));
      expect(token2?.token).toEqual(Buffer.from('token2'));
    });

    it('should handle malformed nodes gracefully', () => {
      const nodes = [
        { tag: 'notification', attrs: {} }, // No content
        { tag: 'notification', content: 'not-an-array' }, // Invalid content
        {
          tag: 'notification',
          content: [{ tag: 'token', attrs: {} }],
        }, // Missing fields
      ];

      for (const node of nodes) {
        expect(() => manager.processPrivacyTokenNotification(node)).not.toThrow();
      }
    });
  });

  describe('Automatic pruning', () => {
    it('should start and stop pruning interval', () => {
      manager.startPruning();
      // Starting again should be no-op
      manager.startPruning();

      manager.stopPruning();
      // Stopping again should be no-op
      manager.stopPruning();
    });

    it('should prune on interval', async () => {
      const fastManager = new TcTokenManager({
        authDir: TEST_AUTH_DIR,
        sessionId: TEST_SESSION_ID,
        config: {
          pruneInterval: 100, // 100ms for testing
        },
      });

      const now = Math.floor(Date.now() / 1000);
      const expiredTimestamp = now - 30 * 24 * 3600;

      fastManager.storeToken('expired@s.whatsapp.net', {
        token: Buffer.from('expired'),
        timestamp: expiredTimestamp,
      });

      fastManager.startPruning();

      // Wait for pruning to occur
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(fastManager.getStats().totalTokens).toBe(0);

      fastManager.destroy();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      manager.setNctSalt(Buffer.from('salt'));
      manager.computeCsToken('lid1');
      manager.computeCsToken('lid2');

      manager.storeToken('jid1@s.whatsapp.net', {
        token: Buffer.from('token1'),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const stats = manager.getStats();
      expect(stats.totalTokens).toBe(1);
      expect(stats.csTokenCacheSize).toBe(2);
      expect(stats.hasNctSalt).toBe(true);
    });

    it('should reflect no salt', () => {
      const stats = manager.getStats();
      expect(stats.hasNctSalt).toBe(false);
    });
  });
});
