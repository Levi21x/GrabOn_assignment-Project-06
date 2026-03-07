/**
 * GrabOn Mock Webhook Server
 * 
 * Simulates 6 distribution channel endpoints with realistic failure rates.
 * Segment 1: Basic scaffold — endpoints return 200 OK.
 * Segment 4: Will add failure simulation and retry-compatible responses.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();

// CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

const PORT = process.env.WEBHOOK_PORT || 3001;

// In-memory delivery log (for dashboard integration in Segment 5)
const deliveryLog = [];

// Channel failure rates (used in Segment 4)
const FAILURE_RATES = {
  email: 0.03,
  whatsapp: 0.30,  // elevated for visible retry demo
  push: 0.05,
  glance: 0.40,   // elevated for visible retry demo
  payu: 0.02,
  instagram: 0.07
};

// Failure reasons pool
const FAILURE_REASONS = ['rate_limited', 'timeout', 'server_error'];

/**
 * Create a webhook handler for a given channel
 */
function createWebhookHandler(channel) {
  return (req, res) => {
    const deliveryId = uuidv4();
    const timestamp = new Date().toISOString();

    // Simulate failure based on channel failure rate
    const shouldFail = Math.random() < FAILURE_RATES[channel];

    if (shouldFail) {
      const reason = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
      const statusCode = reason === 'rate_limited' ? 429 : 500;

      const entry = {
        delivery_id: deliveryId,
        channel,
        timestamp,
        status: 'failed',
        reason,
        payload: req.body
      };
      deliveryLog.push(entry);

      console.log(`[Webhook] ❌ ${channel.toUpperCase()} — FAILED (${reason})`);
      return res.status(statusCode).json({ status: 'failed', reason });
    }

    // Success
    const entry = {
      delivery_id: deliveryId,
      channel,
      timestamp,
      status: 'delivered',
      payload: req.body
    };
    deliveryLog.push(entry);

    console.log(`[Webhook] ✅ ${channel.toUpperCase()} — Delivered (${deliveryId})`);
    return res.status(200).json({
      status: 'delivered',
      delivery_id: deliveryId,
      timestamp
    });
  };
}

// Register webhook endpoints
app.post('/webhooks/email', createWebhookHandler('email'));
app.post('/webhooks/whatsapp', createWebhookHandler('whatsapp'));
app.post('/webhooks/push', createWebhookHandler('push'));
app.post('/webhooks/glance', createWebhookHandler('glance'));
app.post('/webhooks/payu', createWebhookHandler('payu'));
app.post('/webhooks/instagram', createWebhookHandler('instagram'));

// Delivery log endpoint (for dashboard in Segment 5)
app.get('/webhooks/log', (req, res) => {
  res.json(deliveryLog);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', channels: Object.keys(FAILURE_RATES) });
});

app.listen(PORT, () => {
  console.log(`[GrabOn Webhook Server] Running on http://localhost:${PORT}`);
  console.log(`[GrabOn Webhook Server] Channels: email, whatsapp, push, glance, payu, instagram`);
  console.log(`[GrabOn Webhook Server] Failure simulation: ENABLED`);
});
