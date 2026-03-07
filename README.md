# GrabOn Multi-Channel Deal Distribution MCP

> **GrabOn Vibe Coder Challenge 2025 — Project 06**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org) [![MCP](https://img.shields.io/badge/MCP-stdio%20transport-blue)](https://modelcontextprotocol.io) [![Claude](https://img.shields.io/badge/Claude-3.5%20Sonnet-orange)](https://anthropic.com)

## The Problem

GrabOn is India's #1 coupon platform with 3,500+ merchant partners. When a merchant uploads a deal, the operations team manually rewrites it for every distribution channel — email, WhatsApp, push notifications, lock screens, checkout banners, and Instagram. Each channel has different character limits, tone requirements, and audience contexts. Each copy needs to be in English, Hindi, and Telugu. For high-frequency merchants, this creates a bottleneck of dozens of hours per week.

**This project eliminates that bottleneck entirely.**

Give the system one deal payload via Claude Desktop. It generates **54 unique, culturally-adapted marketing copy strings** (6 channels × 3 A/B strategies × 3 languages), delivers them to all channel endpoints with retry logic, and presents everything on a live real-time dashboard — in under 30 seconds.

---

## Live Demo

```
Claude Desktop: "Distribute a Zomato deal — 50% off on orders above ₹299, 
                 valid 48 hours, 10,000 redemptions, exclusive to GrabOn"

Output: 54 strings across 6 channels, delivered to all endpoints,
        dashboard auto-populates via WebSocket push.
```

**Dashboard:** `http://localhost:5173`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Desktop (User)                          │
│  "Distribute this Zomato deal..."                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdio (MCP Protocol — JSON-RPC 2.0)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MCP Server  :stdio                             │
│                                                                   │
│  distribute_deal(merchant_id, category, discount_value, ...)     │
│       │                                                           │
│       ├─ 1. Input validation (expiry, discount range, types)     │
│       │                                                           │
│       ├─ 2. Claude API  ──→  54 localized copy strings           │
│       │       claude-3-5-sonnet (with 2 model fallbacks)         │
│       │       temperature: 0.9, generation_seed: UUID            │
│       │                                                           │
│       ├─ 3. Delivery Engine  ──→  Webhook Server :3001           │
│       │       Promise.allSettled (concurrent)                    │
│       │       Exponential backoff: 1s → 2s → 4s, max 3 retries  │
│       │                                                           │
│       └─ 4. Dashboard Push  ──→  WebSocket :3002                 │
│               fire-and-forget, never blocks MCP response         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   :3001 Webhooks    :3002 API+WS     :5173 React
   (6 channel        (frontend        (dashboard —
    endpoints +       bridge +         live deal grid,
    failure sim +     SSE stream +     delivery tracker,
    retry compat)     MCP push recv)   A/B CTR sim)
```

### Data Flow: One Deal → 54 Strings

```
Input deal params
    │
    ▼
buildSystemPrompt()  ← channel rules, char limits, cultural idiom guide
buildUserPrompt()    ← merchant, discount, expiry, generation_seed (UUID)
    │
    ▼ Claude API (single call — all 54 at once for coherence)
    │
    ▼
validateCharLimits() ← flag any strings over WhatsApp/Push/Glance/PayU limits
validateVariantUniqueness() ← Levenshtein distance check — reject synonym swaps
    │
    ▼
deliverAllVariants() ← 54 concurrent HTTP POSTs to mock webhook endpoints
    │
    ▼
buildDeliverySummary() ← per-channel success rates, retry counts
    │
    ▼
WebSocket broadcast → React dashboard auto-loads deal
```

---

## Quickstart (3 steps)

### Prerequisites
- **Node.js 18+**
- **Anthropic API key** — get one free at [console.anthropic.com](https://console.anthropic.com)

### Step 1 — Install

```bash
git clone <repo-url>
cd grabon-deal-distributor
npm run install:all
```

### Step 2 — Configure

```bash
cp .env.example mcp-server/.env
# Open mcp-server/.env and set your ANTHROPIC_API_KEY
```

### Step 3 — Run

```bash
npm run start:all
# Starts: webhook server (:3001) + API server (:3002) + React dashboard (:5173)
```

Visit **http://localhost:5173** — the dashboard is live.

To test without the dashboard:
```bash
cd mcp-server
node test-3-merchants.js   # runs Zomato, MakeMyTrip, Myntra end-to-end
```

---

## Claude Desktop Setup

Add to your Claude Desktop config file:

| OS | Config path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "grabon-deal-distributor": {
      "command": "node",
      "args": ["C:/full/path/to/grabon-deal-distributor/mcp-server/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key-here",
        "USE_CLAUDE_API": "true",
        "WEBHOOK_BASE_URL": "http://localhost:3001"
      }
    }
  }
}
```

Restart Claude Desktop. Then try:

> *"Distribute a Zomato deal: 50% off food orders above ₹299, expires in 48 hours, 10,000 max redemptions, exclusive to GrabOn"*

---

## The 54 Strings

Each deal generates exactly 54 strings: **6 channels × 3 strategies × 3 languages**

| Channel | Format | Constraints |
|---|---|---|
| Email | subject + headline + body + CTA | subject ≤ 80 chars |
| WhatsApp | single message | ≤ 160 chars in all 3 languages |
| Push Notification | title + body | title ≤ 50, body ≤ 100 |
| Glance Lock Screen | card text | ≤ 160 chars, zero-context-readable |
| PayU Checkout Banner | banner text + CTA | ≤ 40 chars — pure action copy |
| Instagram | caption + hashtags | free-form, trending format |

| Strategy | Angle | Example |
|---|---|---|
| `urgency` | Time pressure, scarcity, FOMO | *"Only 847 redemptions left — deal ends in 4 hours"* |
| `value_highlight` | Savings math, ROI, rational benefit | *"Save ₹150 on every Zomato order above ₹299"* |
| `social_proof` | Popularity, trust signals, community | *"12,000 people grabbed this deal today"* |

| Language | Approach |
|---|---|
| English | Standard Indian English, deal-focused |
| Hindi | Natural conversational Hindi — not Google Translate. Uses idioms: *धमाकेदार ऑफर*, *मौका मत गंवाओ* |
| Telugu | Cultural adaptation for Andhra/Telangana market — *అద్భుతమైన ఆఫర్*, *అవకాశం మిస్ చేయకండి* |

---

## Edge Cases Handled

| Scenario | Behaviour |
|---|---|
| `expiry_timestamp` in the past | Returns error with helpful hint before any API call |
| Invalid ISO 8601 date | Immediate validation error, no waste of API credits |
| `discount_value > 100` with `percentage` type | Catches likely data entry error, suggests `flat` type |
| `discount_value = 0` | Rejected as invalid deal |
| Deal expiring in < 1 hour | Generates with warning; urgency copy reflects extreme scarcity |
| Claude API key missing | Returns partial_success with template-generated copy + diagnostic hint |
| All 3 Claude model attempts fail | Falls back to built-in template engine — pipeline never fully fails |
| Webhook endpoint down | Delivery engine retries up to 3× per string; copy still returned fully |
| WhatsApp/Glance char limit exceeded in Hindi/Telugu | Flagged in `validation.char_limit_warnings` — over-limit strings highlighted in dashboard |
| Duplicate / synonym-swap variants | `validateVariantUniqueness()` warns if strategies are >70% Levenshtein-similar |

---

## API Reference

### Tool: `distribute_deal`

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchant_id` | string | ✅ | Unique merchant identifier |
| `merchant_name` | string | ✅ | Display name (e.g. `"Zomato"`) |
| `category` | `food\|travel\|electronics\|fashion\|health\|beauty` | ✅ | Merchant category |
| `discount_value` | number | ✅ | Numeric value (50 = 50%, 1500 = ₹1500) |
| `discount_type` | `percentage\|flat\|bogo` | ✅ | Type of discount |
| `expiry_timestamp` | string | ✅ | ISO 8601 — must be in future |
| `min_order_value` | number | ➖ | Minimum order in ₹ (default: 0) |
| `max_redemptions` | number | ➖ | Max uses (default: 0 = unlimited) |
| `exclusive_flag` | boolean | ➖ | GrabOn exclusive (default: false) |

**Output:**

```json
{
  "status": "success",
  "deal_id": "a1b2c3d4-...",
  "merchant": "Zomato",
  "discount": "50%",
  "expires_in": "47 hours",
  "total_strings_generated": 54,
  "model_used": "claude-3-5-sonnet-20241022",
  "delivery_summary": {
    "delivered": 51,
    "failed": 3,
    "success_rate": "94%",
    "channels": {
      "email": { "total": 9, "delivered": 9, "failed": 0 },
      "whatsapp": { "total": 9, "delivered": 7, "failed": 2 }
    }
  },
  "delivery_logs": [
    "✅ DELIVERED → email | urgency | en",
    "❌ FAILED → whatsapp | value_highlight | te (retried 3x)"
  ],
  "all_54_strings": {
    "Email": {
      "Urgency": {
        "English": "#01 Subject: ⚡ Zomato deal ends in 47 hours...",
        "Hindi": "#02 Subject: ⚡ ज़ोमाटो ऑफर — सिर्फ 47 घंटे बाकी!",
        "Telugu": "#03 Subject: ⚡ జొమాటో డీల్ — 47 గంటలు మాత్రమే!"
      }
    }
  },
  "dashboard_url": "http://localhost:5173",
  "validation": {
    "char_limit_warnings": 2,
    "uniqueness_warnings": 0
  }
}
```

---

## Project Structure

```
grabon-deal-distributor/
├── mcp-server/                    # Core MCP server (Claude Desktop connects here)
│   ├── index.js                   # MCP server — registers distribute_deal tool
│   ├── tools/
│   │   ├── distribute_deal.js     # Pipeline orchestrator + input validation
│   │   └── localized_copy_generator.js  # Claude API + template fallback
│   ├── delivery/
│   │   └── engine.js              # Concurrent delivery + exponential backoff retry
│   ├── test-3-merchants.js        # End-to-end test: Zomato, MakeMyTrip, Myntra
│   ├── test-generate.js           # Copy generation only
│   ├── test-delivery.js           # Delivery engine only
│   └── .env                       # Your API key goes here (not committed)
│
├── webhook-server/                # Mock channel endpoints (:3001)
│   └── index.js                   # 6 endpoints with realistic failure simulation
│
├── frontend-server/               # API + WebSocket bridge (:3002)
│   └── index.js                   # SSE progress stream + WS broadcast from MCP
│
├── frontend/                      # React dashboard (:5173)
│   └── src/App.jsx                # Single-file app — deal form, output grid, delivery
│
├── package.json                   # Root: install:all + start:all scripts
├── .env.example                   # Template — copy to mcp-server/.env
├── claude_desktop_config.json     # Ready-to-use Claude Desktop config
└── README.md                      # This file
```

---

## Architecture Decisions

### Why stdio MCP transport?
Claude Desktop requires local MCP servers to communicate via stdio (stdin/stdout). This is the only supported transport for local tools — HTTP transport is for remote servers. Using stdio means zero network config and sub-millisecond connection latency.

### Why one Claude call for all 54 variants?
A single prompt for all 6 channels × 3 strategies × 3 languages ensures:
1. **Coherence** — all variants share the same deal understanding
2. **Cost** — ~1/18th the token cost vs. separate calls
3. **Cultural consistency** — Hindi/Telugu adaptations align with English creative intent
4. **Speed** — 20–30s vs. 5+ minutes for 18+ sequential calls

### Why template fallback instead of failing hard?
The system degrades gracefully — if the Claude API is unavailable (no key, rate-limited, network error), the built-in template engine generates all 54 valid strings using the deal data. This ensures the webhook delivery simulation and dashboard demo always work, even offline.

### Why Promise.allSettled and not Promise.all?
`Promise.allSettled` fires all 54 webhook deliveries concurrently and collects every result — including failures. `Promise.all` would abort on the first failure, which would mean a single WhatsApp rate-limit error could cancel all 53 other deliveries. With `allSettled`, one failure never corrupts the rest.

### Why exponential backoff (1s→2s→4s)?
Channel APIs (WhatsApp, push providers) enforce rate limits. Exponential backoff respects server-side cooling periods — retrying too fast would just re-trigger the rate limit. Three attempts with increasing delay gives ~5s window before permanently marking as failed.

### Why Levenshtein uniqueness validation?
The rubric requires variants to be "meaningfully different, not just synonym swaps." After Claude generates copy, `validateVariantUniqueness()` computes string edit-distance between all strategy pairs per channel/language. If two variants are >70% similar, a warning is logged — giving visibility into copy quality issues without blocking the pipeline.

---

## Webhook Simulation Details

The mock webhook server simulates realistic channel delivery conditions:

| Channel | Failure Rate | Why |
|---|---|---|
| Email | 3% | Email providers are generally reliable |
| WhatsApp | 30% | Business API has strict rate limits + phone number verification |
| Push | 5% | FCM/APNs are reliable but token expiry causes occasional failures |
| Glance | 40% | Elevated to make retry logic visually demonstrable |
| PayU | 2% | Checkout API has high SLA requirements |
| Instagram | 7% | Graph API occasional errors + content policy checks |

Failed deliveries trigger the retry engine: up to 3 attempts per delivery with 1s → 2s → 4s backoff.

---

## What I Would Do Differently

1. **Character limit enforcement in generation** — The current approach validates after Claude returns. A better approach: if any variants exceed limits, make a targeted repair call with specific violations listed. Especially needed for Hindi/Telugu where Unicode characters have different byte vs. display widths.

2. **Persistent deal history** — Deals are in-memory; a restart loses history. SQLite with `better-sqlite3` would add persistence in ~50 lines with zero infrastructure.

3. **Real channel integrations** — Swap mock webhooks for real sandbox APIs: SendGrid (email), WhatsApp Business API, Firebase FCM (push), Glance SDK, PayU checkout API. The delivery engine's interface is intentionally channel-agnostic — each mock endpoint could be replaced with a real client without changing the pipeline.

4. **Streaming generation** — Claude's streaming API would let the dashboard render copy word-by-word as it's generated, dramatically improving perceived speed and making the demo more compelling.

5. **A/B test feedback loop** — With 3 variants per channel, the system generates the infrastructure for proper A/B testing. Connecting delivery receipts + CTR data back to the strategy engine would let it learn which angle (urgency/value/social-proof) works best per merchant category and demographic.

6. **Merchant onboarding pipeline** — Currently the tool takes a flat payload. A real GrabOn integration would poll the merchant deals API for new uploads and automatically trigger distribution, making this a zero-touch pipeline.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| MCP Protocol | `@modelcontextprotocol/sdk` (stdio) | Official SDK — spec-compliant |
| AI Generation | `@anthropic-ai/sdk` — Claude 3.5 Sonnet | Best multilingual quality; structured JSON output |
| Delivery | `axios` + custom retry engine | `Promise.allSettled` concurrent, exponential backoff |
| Uniqueness check | `fastest-levenshtein` | String distance in O(n) — fast enough for 54 pairs |
| Mock Webhooks | Express.js | Lightweight, realistic failure simulation |
| Dashboard | React + Vite | Hot reload during development; fast production build |
| Real-time push | WebSocket (`ws` package) | Zero-polling MCP→Dashboard live sync |
| Progress stream | Server-Sent Events | Simple one-way streaming for dashboard form submissions |

**Total infrastructure cost: ₹0 (all free/open-source)**
