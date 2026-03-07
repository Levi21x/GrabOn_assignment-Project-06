/**
 * GrabOn Delivery Engine
 * 
 * Sends all 54 localized copy variants to mock webhook endpoints
 * with exponential backoff retry logic.
 * 
 * - Concurrent delivery using Promise.allSettled
 * - Max 3 retry attempts per delivery
 * - Backoff: 1s → 2s → 4s
 * - Tracks per-delivery status
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:3001';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Channel → webhook endpoint mapping
const CHANNEL_ENDPOINTS = {
  email: '/webhooks/email',
  whatsapp: '/webhooks/whatsapp',
  push: '/webhooks/push',
  glance: '/webhooks/glance',
  payu_banner: '/webhooks/payu',
  instagram: '/webhooks/instagram'
};

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deliver a single copy variant to its webhook endpoint with retry logic
 * @param {Object} delivery - Delivery descriptor
 * @returns {Object} Delivery result
 */
async function deliverWithRetry(delivery) {
  const { channel, variant, language, content } = delivery;
  const endpoint = `${WEBHOOK_BASE_URL}${CHANNEL_ENDPOINTS[channel]}`;
  const deliveryId = uuidv4();

  const result = {
    delivery_id: deliveryId,
    channel,
    variant,
    language,
    status: 'pending',
    attempts: 0,
    last_attempt: null,
    error: null,
    content
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    result.attempts = attempt;
    result.last_attempt = new Date().toISOString();

    try {
      const response = await axios.post(endpoint, {
        delivery_id: deliveryId,
        channel,
        variant,
        language,
        content,
        attempt
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 200 && response.data?.status === 'delivered') {
        result.status = 'delivered';
        result.delivery_id = response.data.delivery_id || deliveryId;
        return result;
      }
    } catch (err) {
      const statusCode = err.response?.status;
      const reason = err.response?.data?.reason || err.message;
      result.error = reason;

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.error(`[Delivery] ⚠️  ${channel}/${variant}/${language} — attempt ${attempt} failed (${reason}). Retrying in ${delay}ms...`);
        result.status = 'retrying';
        await sleep(delay);
      } else {
        console.error(`[Delivery] ❌ ${channel}/${variant}/${language} — permanently failed after ${MAX_RETRIES} attempts (${reason})`);
        result.status = 'permanently_failed';
      }
    }
  }

  return result;
}

/**
 * Flatten the 54-variant structure into an array of delivery descriptors
 */
function flattenVariants(variants) {
  const deliveries = [];
  const channels = Object.keys(variants);
  const strategies = ['urgency', 'value_highlight', 'social_proof'];
  const languages = ['en', 'hi', 'te'];

  for (const channel of channels) {
    for (const strategy of strategies) {
      for (const lang of languages) {
        const content = variants[channel]?.[strategy]?.[lang];
        if (content) {
          deliveries.push({
            channel,
            variant: strategy,
            language: lang,
            content
          });
        }
      }
    }
  }

  return deliveries;
}

/**
 * Deliver all 54 variants concurrently to webhook endpoints
 * @param {Object} variants - The nested variants object from copy generation
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Object} Complete delivery report
 */
export async function deliverAllVariants(variants, onProgress) {
  const deliveries = flattenVariants(variants);
  console.error(`[Delivery] Starting ${deliveries.length} concurrent deliveries...`);

  if (onProgress) {
    onProgress({ type: 'delivery_start', total: deliveries.length });
  }

  // Fire all deliveries concurrently
  const results = await Promise.allSettled(
    deliveries.map(async (delivery, index) => {
      const result = await deliverWithRetry(delivery);
      if (onProgress) {
        onProgress({
          type: 'delivery_progress',
          completed: index + 1,
          total: deliveries.length,
          result
        });
      }
      return result;
    })
  );

  // Collect results
  const deliveryResults = results.map(r =>
    r.status === 'fulfilled' ? r.value : {
      delivery_id: 'unknown',
      channel: 'unknown',
      variant: 'unknown',
      language: 'unknown',
      status: 'permanently_failed',
      attempts: 0,
      error: r.reason?.message || 'Unknown error'
    }
  );

  // Build summary
  const summary = buildDeliverySummary(deliveryResults);

  console.error(`[Delivery] Complete: ${summary.delivered}/${summary.total} delivered, ${summary.failed} failed`);

  if (onProgress) {
    onProgress({ type: 'delivery_complete', summary });
  }

  return {
    deliveries: deliveryResults,
    summary
  };
}

/**
 * Build a delivery summary from results
 */
function buildDeliverySummary(results) {
  const total = results.length;
  const delivered = results.filter(r => r.status === 'delivered').length;
  const failed = results.filter(r => r.status === 'permanently_failed').length;
  const retrying = results.filter(r => r.status === 'retrying').length;

  // Per-channel breakdown
  const channels = {};
  for (const r of results) {
    if (!channels[r.channel]) {
      channels[r.channel] = { total: 0, delivered: 0, failed: 0 };
    }
    channels[r.channel].total++;
    if (r.status === 'delivered') channels[r.channel].delivered++;
    if (r.status === 'permanently_failed') channels[r.channel].failed++;
  }

  // Format channel summaries
  const channelSummaries = {};
  for (const [ch, stats] of Object.entries(channels)) {
    const failStr = stats.failed > 0 ? ` (${stats.failed} failed after ${MAX_RETRIES} retries)` : '';
    channelSummaries[ch] = `${stats.delivered}/${stats.total} delivered${failStr}`;
  }

  return {
    total,
    delivered,
    failed,
    retrying,
    success_rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    channels: channelSummaries
  };
}
