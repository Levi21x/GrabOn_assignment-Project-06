/**
 * GrabOn Frontend API Server
 * 
 * Express server on port 3002 that bridges the React frontend
 * to the MCP tool handler. Uses Server-Sent Events (SSE) for
 * real-time progress streaming.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// Load env from mcp-server/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', 'mcp-server', '.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.error('[GrabOn API Server] Failed to load .env:', dotenvResult.error.message);
  console.error('[GrabOn API Server] Tried path:', envPath);
}

// Dynamic imports from mcp-server modules
import { generateLocalizedCopy } from '../mcp-server/tools/localized_copy_generator.js';
import { deliverAllVariants } from '../mcp-server/delivery/engine.js';

const app = express();
const PORT = process.env.FRONTEND_SERVER_PORT || 3002;
const httpServer = createServer(app);

// WebSocket server — broadcasts MCP deal_complete events to the React dashboard
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[GrabOn WS] Client connected (${wsClients.size} total)`);
  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[GrabOn WS] Client disconnected (${wsClients.size} remaining)`);
  });
  ws.on('error', () => wsClients.delete(ws));
});

function broadcastDealComplete(payload) {
  const msg = JSON.stringify({ type: 'deal_complete', ...payload });
  let sent = 0;
  wsClients.forEach(ws => {
    if (ws.readyState === 1) { ws.send(msg); sent++; }
  });
  console.log(`[GrabOn WS] Broadcast deal_complete to ${sent}/${wsClients.size} clients`);
}

app.use(cors());
app.use(express.json());

// In-memory store for processed deals
const dealsStore = new Map();

// SSE clients per deal
const sseClients = new Map();

/**
 * Send SSE event to all clients watching a deal
 */
function sendSSE(dealId, event, data) {
  const clients = sseClients.get(dealId) || [];
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(message));
}

/**
 * POST /api/distribute — Start deal distribution pipeline
 */
app.post('/api/distribute', async (req, res) => {
  const dealId = uuidv4();
  const params = req.body;

  // Validate required fields
  if (!params.merchant_name || !params.category || !params.discount_value || !params.discount_type) {
    return res.status(400).json({ error: 'Missing required fields: merchant_name, category, discount_value, discount_type' });
  }

  // Initialize deal in store
  const deal = {
    deal_id: dealId,
    ...params,
    status: 'processing',
    created_at: new Date().toISOString(),
    progress: [],
    variants: null,
    deliveries: null,
    summary: null
  };
  dealsStore.set(dealId, deal);

  // Return immediately with deal_id
  res.json({ deal_id: dealId, status: 'processing', message: 'Deal distribution pipeline started' });

  // Run pipeline asynchronously
  runPipeline(dealId, params).catch(err => {
    console.error(`[API] Pipeline error for ${dealId}:`, err.message);
    const deal = dealsStore.get(dealId);
    if (deal) {
      deal.status = 'error';
      deal.error = err.message;
      addProgress(dealId, 'error', `Pipeline failed: ${err.message}`);
    }
  });
});

/**
 * Add progress event and broadcast via SSE
 */
function addProgress(dealId, type, message) {
  const deal = dealsStore.get(dealId);
  if (!deal) return;
  const event = { type, message, timestamp: new Date().toISOString() };
  deal.progress.push(event);
  sendSSE(dealId, 'progress', event);
}

/**
 * Run the full distribution pipeline
 */
async function runPipeline(dealId, params) {
  const deal = dealsStore.get(dealId);

  addProgress(dealId, 'info', `Deal received — ${params.merchant_name} (${params.category}) | ${params.discount_value}${params.discount_type === 'percentage' ? '%' : params.discount_type === 'flat' ? ' flat' : ' BOGO'} off`);

  // Step 1: Generate copy
  addProgress(dealId, 'loading', 'Calling Claude API to generate copy variants...');

  try {
    const copyResult = await generateLocalizedCopy({
      ...params,
      deal_id: dealId
    });

    deal.variants = copyResult.variants;
    deal.model_used = copyResult.model_used;
    deal.usage = copyResult.usage;
    deal.validation = copyResult.validation;

    addProgress(dealId, 'success', `Generated ${copyResult.validation.total_variants} localized copy variants (${copyResult.model_used})`);

    // Send the full variants data
    sendSSE(dealId, 'variants', {
      variants: copyResult.variants,
      validation: copyResult.validation
    });

  } catch (err) {
    addProgress(dealId, 'error', `Copy generation failed: ${err.message}`);
    deal.status = 'error';
    deal.error = err.message;
    sendSSE(dealId, 'complete', { status: 'error', error: err.message });
    return;
  }

  // Step 2: Deliver to webhooks
  addProgress(dealId, 'loading', 'Firing webhook deliveries for all 54 strings...');

  try {
    const deliveryReport = await deliverAllVariants(deal.variants, (event) => {
      if (event.type === 'delivery_progress') {
        const r = event.result;
        sendSSE(dealId, 'delivery', {
          ...r,
          completed: event.completed,
          total: event.total
        });
      }
    });

    deal.deliveries = deliveryReport.deliveries;
    deal.summary = deliveryReport.summary;
    deal.status = 'completed';

    addProgress(dealId, 'success', `Delivery complete: ${deliveryReport.summary.delivered}/${deliveryReport.summary.total} delivered (${deliveryReport.summary.success_rate}% success rate)`);

    sendSSE(dealId, 'complete', {
      status: 'completed',
      summary: deliveryReport.summary
    });

  } catch (err) {
    addProgress(dealId, 'error', `Delivery failed: ${err.message}`);
    deal.status = 'error';
    deal.error = err.message;
    sendSSE(dealId, 'complete', { status: 'error', error: err.message });
  }
}

/**
 * GET /api/deals/:id/stream — SSE stream for real-time updates
 */
app.get('/api/deals/:id/stream', (req, res) => {
  const dealId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Register client
  if (!sseClients.has(dealId)) sseClients.set(dealId, []);
  sseClients.get(dealId).push(res);

  // Send existing progress events (catch up)
  const deal = dealsStore.get(dealId);
  if (deal) {
    for (const event of deal.progress) {
      res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
    }
    if (deal.variants) {
      res.write(`event: variants\ndata: ${JSON.stringify({ variants: deal.variants, validation: deal.validation })}\n\n`);
    }
    if (deal.deliveries) {
      // Send all delivery results
      for (const d of deal.deliveries) {
        res.write(`event: delivery\ndata: ${JSON.stringify(d)}\n\n`);
      }
    }
    if (deal.status === 'completed' || deal.status === 'error') {
      res.write(`event: complete\ndata: ${JSON.stringify({ status: deal.status, summary: deal.summary, error: deal.error })}\n\n`);
    }
  }

  // Cleanup on disconnect
  req.on('close', () => {
    const clients = sseClients.get(dealId) || [];
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

/**
 * POST /api/mcp-push — Receive deal payload from MCP server and broadcast to WS clients
 */
app.post('/api/mcp-push', (req, res) => {
  const payload = req.body;
  if (!payload || !payload.deal_id) {
    return res.status(400).json({ error: 'Missing deal_id in payload' });
  }
  // Store in dealsStore so loadDeal() and pastDeals sidebar work
  if (!dealsStore.has(payload.deal_id)) {
    dealsStore.set(payload.deal_id, {
      deal_id:      payload.deal_id,
      merchant_name: payload.merchant_name || payload.merchant || '',
      merchant:     payload.merchant_name || payload.merchant || '',
      category:     payload.category || 'general',
      discount_value: payload.discount_value,
      discount_type:  payload.discount_type,
      status:       'completed',
      created_at:   payload.created_at || new Date().toISOString(),
      progress:     payload.progress || [],
      variants:     payload.variants || null,
      deliveries:   payload.deliveries || [],
      summary:      payload.summary || null,
      validation:   payload.validation || null,
      via_mcp:      true
    });
  }
  broadcastDealComplete(payload);
  res.json({ ok: true, clients_notified: wsClients.size });
});

/**
 * GET /api/deals/:id — Get deal data (polling fallback)
 */
app.get('/api/deals/:id', (req, res) => {
  const deal = dealsStore.get(req.params.id);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
});

/**
 * GET /api/deals — List all processed deals
 */
app.get('/api/deals', (req, res) => {
  const deals = Array.from(dealsStore.values()).map(d => ({
    deal_id: d.deal_id,
    merchant: d.merchant_name,
    category: d.category,
    status: d.status,
    created_at: d.created_at,
    total_variants: d.validation?.total_variants || 0,
    delivery_summary: d.summary
  }));
  res.json(deals);
});

/**
 * GET /health — Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    deals_processed: dealsStore.size,
    anthropic_key_set: !!process.env.ANTHROPIC_API_KEY
  });
});

httpServer.listen(PORT, () => {
  console.log(`[GrabOn API Server] Running on http://localhost:${PORT}`);
  console.log(`[GrabOn API Server] WebSocket server on ws://localhost:${PORT}`);
  console.log(`[GrabOn API Server] Anthropic key: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET — copy generation will fail'}`);
});
