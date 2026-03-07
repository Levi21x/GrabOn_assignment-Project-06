/**
 * distribute_deal tool handler — Full Pipeline
 * 
 * Runs the complete deal distribution pipeline:
 * 1. Validate input parameters
 * 2. Call Claude API for copy generation + localization (54 strings)
 * 3. Fire webhook deliveries with retry logic
 * 4. Return structured result to Claude Desktop
 */

import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

import { generateLocalizedCopy } from './localized_copy_generator.js';
import { deliverAllVariants } from '../delivery/engine.js';

/**
 * Handle the distribute_deal MCP tool call.
 * @param {Object} params - Deal parameters from the MCP tool call
 * @returns {Object} Pipeline result
 */
export async function handleDistributeDeal(params) {
  const dealId = uuidv4();

  // ── Edge case: validate expiry is in the future ──────────────────────────
  const expiryDate = new Date(params.expiry_timestamp);
  if (isNaN(expiryDate.getTime())) {
    return {
      status: 'error',
      deal_id: dealId,
      stage: 'input_validation',
      error: `Invalid expiry_timestamp: "${params.expiry_timestamp}" is not a valid ISO 8601 date.`,
      hint: 'Use format: "2026-12-31T23:59:59Z"'
    };
  }
  const hoursUntilExpiry = (expiryDate - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilExpiry <= 0) {
    return {
      status: 'error',
      deal_id: dealId,
      stage: 'input_validation',
      error: `Deal has already expired. expiry_timestamp "${params.expiry_timestamp}" is in the past.`,
      hint: 'Provide a future expiry date, e.g. "2026-12-31T23:59:59Z"'
    };
  }
  if (hoursUntilExpiry < 1) {
    console.error(`[GrabOn MCP] ⚠️  Warning: deal expires in less than 1 hour — urgency copy will reflect extreme scarcity`);
  }

  // ── Edge case: validate discount_value is positive ───────────────────────
  if (params.discount_value <= 0) {
    return {
      status: 'error',
      deal_id: dealId,
      stage: 'input_validation',
      error: `discount_value must be greater than 0 (received: ${params.discount_value})`,
      hint: 'Use a positive number, e.g. 50 for 50% off or 1500 for ₹1500 flat discount.'
    };
  }
  if (params.discount_type === 'percentage' && params.discount_value > 100) {
    return {
      status: 'error',
      deal_id: dealId,
      stage: 'input_validation',
      error: `discount_value of ${params.discount_value}% is invalid — percentage discounts cannot exceed 100%.`,
      hint: 'Did you mean discount_type: "flat"? For a ₹1500 flat discount use discount_type: "flat".'
    };
  }

  console.error(`[GrabOn MCP] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.error(`[GrabOn MCP] Deal received: ${params.merchant_name} (${params.category})`);
  console.error(`[GrabOn MCP] Deal ID: ${dealId}`);
  console.error(`[GrabOn MCP] Discount: ${params.discount_value}${params.discount_type === 'percentage' ? '%' : params.discount_type === 'flat' ? ' flat' : ' BOGO'}`);

  // Step 1: Generate 54 localized copy variants
  console.error(`[GrabOn MCP] Step 1: Generating 54 localized copy variants...`);
  let copyResult;
  try {
    copyResult = await generateLocalizedCopy({
      ...params,
      deal_id: dealId
    });
    console.error(`[GrabOn MCP] Copy generation complete: ${copyResult.validation.total_variants} variants`);
  } catch (err) {
    console.error(`[GrabOn MCP] Copy generation failed: ${err.message}`);
    return {
      status: 'error',
      deal_id: dealId,
      stage: 'copy_generation',
      error: err.message,
      hint: !process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY is not set in .env' : 'Check API key and network connection'
    };
  }

  // Step 2: Deliver to webhooks
  console.error(`[GrabOn MCP] Step 2: Delivering ${copyResult.validation.total_variants} strings to webhook endpoints...`);
  let deliveryReport;
  try {
    deliveryReport = await deliverAllVariants(copyResult.variants);
    console.error(`[GrabOn MCP] Delivery complete: ${deliveryReport.summary.delivered}/${deliveryReport.summary.total} delivered`);
  } catch (err) {
    console.error(`[GrabOn MCP] Delivery failed: ${err.message}`);
    // Still return copy results even if delivery fails
    return {
      status: 'partial_success',
      deal_id: dealId,
      merchant: params.merchant_name,
      total_strings_generated: copyResult.validation.total_variants,
      copy_generation: 'success',
      delivery: 'failed',
      delivery_error: err.message,
      hint: 'Webhook server may not be running. Start it with: cd webhook-server && node index.js',
      sample_copy: extractSampleCopy(copyResult.variants)
    };
  }

  // Step 3: Build complete result with ALL 54 formatted strings
  const result = {
    status: 'success',
    deal_id: dealId,
    merchant: params.merchant_name,
    category: params.category,
    discount: `${params.discount_value}${params.discount_type === 'percentage' ? '%' : params.discount_type === 'flat' ? ' flat (₹)' : ' BOGO'}`,
    expires_in: `${Math.round(hoursUntilExpiry)} hours`,
    total_strings_generated: copyResult.validation.total_variants,
    model_used: copyResult.model_used,
    delivery_summary: {
      delivered: deliveryReport.summary.delivered,
      failed: deliveryReport.summary.failed,
      success_rate: `${deliveryReport.summary.success_rate}%`,
      channels: deliveryReport.summary.channels
    },
    delivery_logs: buildDeliveryLogs(deliveryReport),
    all_54_strings: formatAll54Strings(copyResult.variants),
    dashboard_url: `http://localhost:5173`,
    validation: {
      char_limit_warnings: copyResult.validation.char_limit_warnings.length,
      uniqueness_warnings: copyResult.validation.uniqueness_warnings.length
    }
  };

  console.error(`[GrabOn MCP] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.error(`[GrabOn MCP] Pipeline complete for ${params.merchant_name}`);
  console.error(`[GrabOn MCP] ${deliveryReport.summary.delivered}/${deliveryReport.summary.total} delivered (${deliveryReport.summary.success_rate}%)`);
  console.error(`[GrabOn MCP] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  // Push full payload to the React dashboard via frontend-server WebSocket bridge
  // Fire-and-forget — never block or fail the MCP response
  const dashboardPush = async () => {
    try {
      const pushPayload = {
        deal_id:        dealId,
        merchant_name:  params.merchant_name,
        merchant:       params.merchant_name,
        category:       params.category,
        discount_value: params.discount_value,
        discount_type:  params.discount_type,
        status:         'completed',
        created_at:     new Date().toISOString(),
        variants:       copyResult.variants,
        deliveries:     deliveryReport.deliveries,
        summary:        deliveryReport.summary,
        validation:     copyResult.validation,
        via_mcp:        true,
        progress: [
          { type: 'info',    message: `[MCP] Deal received — ${params.merchant_name} (${params.category})`, timestamp: new Date().toISOString() },
          { type: 'success', message: `[MCP] Generated ${copyResult.validation.total_variants} localized copy variants`, timestamp: new Date().toISOString() },
          { type: 'success', message: `[MCP] Delivered ${deliveryReport.summary.delivered}/${deliveryReport.summary.total} strings (${deliveryReport.summary.success_rate}% success)`, timestamp: new Date().toISOString() },
        ]
      };
      const res = await fetch('http://localhost:3002/api/mcp-push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(pushPayload),
        signal:  AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const r = await res.json();
        console.error(`[GrabOn MCP] Dashboard push OK — ${r.clients_notified} WS client(s) notified`);
      } else {
        console.error(`[GrabOn MCP] Dashboard push returned ${res.status}`);
      }
    } catch (pushErr) {
      console.error(`[GrabOn MCP] Dashboard push failed (non-critical): ${pushErr.message}`);
    }
  };
  dashboardPush();
  return result;
}

/**
 * Format all 54 variants into numbered, labelled strings for Claude Desktop output
 */
function formatAll54Strings(variants) {
  const channels = ['email', 'whatsapp', 'push', 'glance', 'payu_banner', 'instagram'];
  const strategies = ['urgency', 'value_highlight', 'social_proof'];
  const languages = ['en', 'hi', 'te'];
  const langLabels = { en: 'English', hi: 'Hindi', te: 'Telugu' };
  const channelLabels = {
    email: 'Email', whatsapp: 'WhatsApp', push: 'Push Notification',
    glance: 'Glance Lock Screen', payu_banner: 'PayU Checkout Banner', instagram: 'Instagram'
  };
  const strategyLabels = {
    urgency: 'Urgency', value_highlight: 'Value Highlight', social_proof: 'Social Proof'
  };

  const result = {};
  let index = 1;

  for (const channel of channels) {
    result[channelLabels[channel]] = {};
    for (const strategy of strategies) {
      result[channelLabels[channel]][strategyLabels[strategy]] = {};
      for (const lang of languages) {
        const v = variants?.[channel]?.[strategy]?.[lang];
        let text = '';
        if (v) {
          if (channel === 'email') {
            text = `Subject: ${v.subject || ''} | Body: ${v.body || ''} | CTA: ${v.cta || ''}`;
          } else if (channel === 'whatsapp') {
            text = v.message || '';
          } else if (channel === 'push') {
            text = `Title: ${v.title || ''} | Body: ${v.body || ''}`;
          } else if (channel === 'glance') {
            text = `Headline: ${v.headline || ''} | ${v.card_text || ''}`;
          } else if (channel === 'payu_banner') {
            text = `${v.headline || ''} | ${v.banner_text || ''} | CTA: ${v.cta || ''}`;
          } else if (channel === 'instagram') {
            text = v.caption || '';
          }
        }
        result[channelLabels[channel]][strategyLabels[strategy]][langLabels[lang]] = `#${String(index).padStart(2,'0')} ${text}`;
        index++;
      }
    }
  }

  return result;
}

/**
 * Build human-readable delivery logs from the delivery report
 */
function buildDeliveryLogs(deliveryReport) {
  if (!deliveryReport?.deliveries) return [];
  return deliveryReport.deliveries.map(r => {
    const retryNote = r.attempts > 1 ? ` (retried ${r.attempts - 1}x)` : '';
    const status = r.status === 'delivered' ? '✅ DELIVERED' : '❌ FAILED';
    return `${status} → ${r.channel} | ${r.variant} | ${r.language}${retryNote}`;
  });
}

