/**
 * Webhook delivery system
 *
 * Handles POST delivery of WaSP events to configured webhook URLs
 * with retry logic and HMAC signature verification.
 */

import crypto from 'crypto';
import type { WebhookConfig, WaspEvent } from './types.js';

export class WebhookManager {
  private webhooks: WebhookConfig[];
  private logger?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };

  constructor(webhooks: WebhookConfig[], logger?: any) {
    this.webhooks = webhooks;
    this.logger = logger;
  }

  /**
   * Deliver event to all configured webhooks
   * Fire-and-forget with retry logic
   */
  async deliverEvent(event: WaspEvent): Promise<void> {
    if (this.webhooks.length === 0) return;

    // Process webhooks in parallel (fire-and-forget)
    const deliveries = this.webhooks.map((webhook) => {
      // Check if webhook is interested in this event type
      if (webhook.events && webhook.events.length > 0) {
        if (!webhook.events.includes(event.type)) {
          return Promise.resolve();
        }
      }

      // Deliver with retry in background
      return this.deliverToWebhook(webhook, event).catch((error) => {
        // Log error but don't propagate (fire-and-forget)
        this.logger?.error?.('Webhook delivery failed after retries', { webhook: webhook.url, error });
      });
    });

    // Don't wait for deliveries to complete
    Promise.all(deliveries).catch(() => {
      // Ignore errors - already logged
    });
  }

  /**
   * Deliver event to a specific webhook with retry logic
   */
  private async deliverToWebhook(webhook: WebhookConfig, event: WaspEvent): Promise<void> {
    const maxRetries = webhook.retries ?? 3;
    const timeout = webhook.timeout ?? 5000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.postToWebhook(webhook, event, timeout);
        this.logger?.debug?.('Webhook delivered', {
          url: webhook.url,
          event: event.type,
          attempt: attempt + 1,
        });
        return; // Success
      } catch (error) {
        lastError = error as Error;
        this.logger?.warn?.('Webhook delivery attempt failed', {
          url: webhook.url,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          error,
        });

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw lastError ?? new Error('Webhook delivery failed');
  }

  /**
   * POST event to webhook URL with HMAC signature
   */
  private async postToWebhook(
    webhook: WebhookConfig,
    event: WaspEvent,
    timeout: number
  ): Promise<void> {
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WaSP-Webhook/1.0',
    };

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payload)
        .digest('hex');
      headers['X-WaSP-Signature'] = signature;
    }

    // Use native fetch (Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
