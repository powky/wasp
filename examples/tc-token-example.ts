/**
 * TC Token Feature Example
 *
 * This example demonstrates how the TC token feature works in WaSP v0.3.0.
 * TC tokens are automatically managed — no manual intervention required!
 */

import { BaileysProvider } from '../src/providers/baileys.js';

async function main() {
  console.log('=== TC Token Feature Example ===\n');

  // Example 1: Default configuration (TC tokens enabled)
  console.log('1. Creating provider with default TC token config...');
  const provider1 = new BaileysProvider({
    authDir: './auth_states_example',
    printQR: true,
    // TC tokens are enabled by default
    // Tokens will be:
    // - Extracted from history sync automatically
    // - Stored to ./auth_states_example/{sessionId}/tc-tokens.json
    // - Attached to all 1:1 messages
    // - Pruned every 24 hours
  });

  console.log('✓ Provider created\n');

  // Example 2: Custom TC token configuration
  console.log('2. Creating provider with custom TC token config...');
  const provider2 = new BaileysProvider({
    authDir: './auth_states_custom',
    printQR: true,
    tcTokenConfig: {
      // Custom receiver mode settings (for token validity)
      bucketSize: 7 * 24 * 3600, // 7 days
      numBuckets: 4, // 4 buckets = 28 day total window

      // Custom sender mode settings (for re-issuance)
      senderBucketSize: 7 * 24 * 3600, // 7 days
      senderNumBuckets: 4, // 4 buckets

      // Custom pruning interval
      pruneInterval: 12 * 3600 * 1000, // 12 hours (instead of 24)

      // Custom CS token cache size
      cstokenCacheSize: 10, // Cache up to 10 CS tokens (instead of 5)
    },
  });

  console.log('✓ Provider created with custom config\n');

  // Example 3: Disabled TC tokens
  console.log('3. Creating provider with TC tokens disabled...');
  const provider3 = new BaileysProvider({
    authDir: './auth_states_disabled',
    printQR: true,
    tcTokenConfig: {
      disabled: true, // Turn off TC token feature entirely
    },
  });

  console.log('✓ Provider created with TC tokens disabled\n');

  // Example 4: Using the provider (TC tokens work automatically)
  console.log('4. Connecting and sending messages...');

  try {
    // Connect to WhatsApp
    await provider1.connect('example-session');

    // TC tokens are automatically:
    // 1. Extracted from history sync when connection opens
    // 2. Stored to disk at ./auth_states_example/example-session/tc-tokens.json
    // 3. Loaded from disk on subsequent connections

    // Send a message — TC token automatically attached!
    // await provider1.sendMessage(
    //   '27821234567@s.whatsapp.net',
    //   'Hello! TC tokens are working automatically.',
    //   {}
    // );

    console.log('✓ Message sent with automatic TC token attachment');

    // Token attachment logic:
    // - If TC token exists for recipient: attach as <tctoken>
    // - Else if nctSalt available: compute and attach CS token as <cstoken>
    // - Else: send without token (legacy behavior)

    // Automatic re-issuance:
    // - After sending, WaSP checks if we should re-issue a privacy token
    // - Re-issuance is fire-and-forget — doesn't block sending
    // - Triggers when sender timestamp moves to a new bucket

    // Cleanup
    await provider1.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n=== Example Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default main;
