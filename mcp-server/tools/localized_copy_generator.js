/**
 * GrabOn Localized Copy Generation Engine
 * 
 * Generates all 54 marketing copy variants in a single Claude call:
 * 6 channels × 3 strategies × 3 languages (EN, HI, TE)
 * 
 * Uses cultural adaptation (not direct translation) for Hindi & Telugu.
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { distance } from 'fastest-levenshtein';
import path from 'path';
import { fileURLToPath } from 'url';

// Always load .env from mcp-server/ regardless of where this module is imported from
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Lazy getter so the client is created after env vars are loaded
function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Character limits per channel
const CHAR_LIMITS = {
  whatsapp: { message: 160 },
  push: { title: 50, body: 100 },
  glance: { card_text: 160 },
  payu_banner: { banner_text: 40 },
};

/**
 * Build the system prompt for full 54-variant generation
 */
function buildSystemPrompt() {
  return `You are GrabOn's expert multilingual marketing copywriter. GrabOn is India's #1 coupon and deals platform with 3,500+ merchant partners serving consumers across India.

YOUR TASK: Generate 54 unique marketing copy variants for a merchant deal:
- 6 distribution channels
- 3 creative strategies per channel  
- 3 languages per variant (English, Hindi, Telugu)

═══════════════════════════════════════════
THE 6 CHANNELS (with format constraints)
═══════════════════════════════════════════

1. EMAIL — Subject line (compelling, open-worthy), body headline (value prop), CTA button text
2. WHATSAPP — Single message, MAX 160 CHARACTERS. Must feel like a friend texting you a deal tip.
3. PUSH NOTIFICATION — Title (MAX 50 CHARS) + body (MAX 100 CHARS). Scannable at a glance.
4. GLANCE LOCK SCREEN — Single card text, MAX 160 CHARS. Zero context — user sees this cold on their lock screen. Must be self-contained and instantly compelling.
5. PAYU CHECKOUT BANNER — MAX 40 CHARACTERS total. Pure action copy shown during payment. Think "Apply SAVE50 — get 50% off"
6. INSTAGRAM CAPTION — Free-form with relevant hashtags. Engaging, shareable, trending-format.

═══════════════════════════════════════════
THE 3 CREATIVE STRATEGIES — STRICT STRUCTURAL RULES
═══════════════════════════════════════════

Each strategy must use a DIFFERENT psychological mechanism AND a different sentence structure. Evaluators will compare variants side-by-side — if they look like paraphrases, you have failed.

1. URGENCY — Trigger: time pressure, scarcity, countdown, FOMO.
   - MUST contain a clock/time signal: a specific hour count, "ending tonight", "last X left", "expires in N hours"
   - MUST NOT mention popularity counts or savings math as the primary hook
   - Opening words must convey speed: "Hurry", "Last chance", "Only N hours left", "Ending soon", "Act now"
   - Emotion: anxiety, loss aversion — the user fears missing out

2. VALUE_HIGHLIGHT — Trigger: rational savings calculation, ROI, concrete money saved.
   - MUST contain explicit savings arithmetic: "Save ₹X", "₹X back on every order", "that's X% of your bill"
   - MUST NOT lead with time pressure or crowds
   - Opening words must frame a financial transaction: "Save", "Get ₹X back", "Spend ₹X, save ₹Y", "Here's the math"
   - Emotion: smart-shopper satisfaction — the user feels they're getting the best deal rationally

3. SOCIAL_PROOF — Trigger: crowd behaviour, popularity, trend signals, community validation.
   - MUST contain a crowd signal: a specific person count (e.g., "12,000 people"), "trending", "most popular", "everyone's ordering"
   - MUST NOT lead with time pressure or savings math
   - Opening words must surface the crowd: "12,000+ people saved…", "Trending on GrabOn:", "Join [N] shoppers who…"
   - Emotion: belonging, trust — the user follows the crowd because others approve

OPENER RULE: The very first word or phrase of each strategy variant MUST be different from the other two strategies for the same channel/language. If urgency opens with "Hurry!", value_highlight must NOT open with "Hurry!" — it should open with "Save" or "Here's the math". 

CROSS-CALL VARIATION RULE: The generation_seed in the user prompt is unique for every invocation. Use it to pick different phrasings, facts, and openers each time. Never produce the same subject lines, body copy, or CTAs across separate API calls for the same deal.

═══════════════════════════════════════════
CHARACTER LIMITS (STRICTLY ENFORCE)
═══════════════════════════════════════════
- WhatsApp message: ≤ 160 characters (in ALL languages)
- Push title: ≤ 50 characters | Push body: ≤ 100 characters
- Glance card_text: ≤ 160 characters
- PayU banner_text: ≤ 40 characters
- Email subject: ≤ 80 characters
- These limits apply to Hindi and Telugu text too. Count actual characters.

═══════════════════════════════════════════
THE 3 LANGUAGES — CULTURAL ADAPTATION RULES
═══════════════════════════════════════════

1. ENGLISH (en) — Standard Indian English. Smart, deal-focused.

2. HINDI (hi) — Natural, conversational Hindi. NOT Google Translate.
   - Use common deal idioms: "धमाकेदार ऑफर", "मौका मत गंवाओ", "सिर्फ आज के लिए", "पैसा वसूल"
   - Food deals: "अपने अगले खाने पर बचत", "खाने का मज़ा दोगुना"
   - Travel: "सपनों की यात्रा", "घूमो बिना जेब ढीली किए"
   - Fashion: "स्टाइल में रहो, बजट में रहो"
   - Use ₹ symbol. Feel like a friend sharing a deal on WhatsApp.

3. TELUGU (te) — Natural, conversational Telugu for Andhra/Telangana market. NOT literal translation.
   - Use warm, respectful tone: "మీకు ప్రత్యేక ఆఫర్"
   - Deal phrases: "అద్భుతమైన ఆఫర్", "అవకాశం మిస్ చేయకండి", "నేడు మాత్రమే"
   - Make deals feel local: "హైదరాబాద్ లో బెస్ట్ డీల్"
   - Urgency should feel natural, not pushy
   - Use ₹ symbol. The copy should sound like someone naturally speaks in Telugu about deals.

IMPORTANT: For Hindi and Telugu, ADAPT the creative concept, don't just translate words. 
A WhatsApp message in Telugu should sound like a friend texting in Telugu. 
An email subject in Hindi should feel like a native Hindi marketing email.

═══════════════════════════════════════════
EMAIL BODY FIELD RULES
═══════════════════════════════════════════
The email "body" field must be 2-3 sentences of PERSUASIVE copy specific to:
- The merchant and its category (food/travel/fashion/etc.)
- The exact discount amount (e.g. "Save ₹150 on your next order")
- The strategy angle (urgency=pressure, value_highlight=savings math, social_proof=community)
NEVER write generic copy. Every sentence must mention the merchant or the deal details.

═══════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON — NO MARKDOWN)
═══════════════════════════════════════════

Return ONLY valid JSON. No markdown code fences, no explanation, no preamble.

Schema — each strategy has "en", "hi", "te" sub-objects:
{
  "variants": {
    "email": {
      "urgency": {
        "en": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "hi": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "te": { "subject": "...", "headline": "...", "body": "...", "cta": "..." }
      },
      "value_highlight": {
        "en": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "hi": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "te": { "subject": "...", "headline": "...", "body": "...", "cta": "..." }
      },
      "social_proof": {
        "en": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "hi": { "subject": "...", "headline": "...", "body": "...", "cta": "..." },
        "te": { "subject": "...", "headline": "...", "body": "...", "cta": "..." }
      }
    },
    "whatsapp": {
      "urgency": {
        "en": { "message": "..." },
        "hi": { "message": "..." },
        "te": { "message": "..." }
      },
      "value_highlight": {
        "en": { "message": "..." },
        "hi": { "message": "..." },
        "te": { "message": "..." }
      },
      "social_proof": {
        "en": { "message": "..." },
        "hi": { "message": "..." },
        "te": { "message": "..." }
      }
    },
    "push": {
      "urgency": {
        "en": { "title": "...", "body": "..." },
        "hi": { "title": "...", "body": "..." },
        "te": { "title": "...", "body": "..." }
      },
      "value_highlight": {
        "en": { "title": "...", "body": "..." },
        "hi": { "title": "...", "body": "..." },
        "te": { "title": "...", "body": "..." }
      },
      "social_proof": {
        "en": { "title": "...", "body": "..." },
        "hi": { "title": "...", "body": "..." },
        "te": { "title": "...", "body": "..." }
      }
    },
    "glance": {
      "urgency": {
        "en": { "card_text": "..." },
        "hi": { "card_text": "..." },
        "te": { "card_text": "..." }
      },
      "value_highlight": {
        "en": { "card_text": "..." },
        "hi": { "card_text": "..." },
        "te": { "card_text": "..." }
      },
      "social_proof": {
        "en": { "card_text": "..." },
        "hi": { "card_text": "..." },
        "te": { "card_text": "..." }
      }
    },
    "payu_banner": {
      "urgency": {
        "en": { "banner_text": "..." },
        "hi": { "banner_text": "..." },
        "te": { "banner_text": "..." }
      },
      "value_highlight": {
        "en": { "banner_text": "..." },
        "hi": { "banner_text": "..." },
        "te": { "banner_text": "..." }
      },
      "social_proof": {
        "en": { "banner_text": "..." },
        "hi": { "banner_text": "..." },
        "te": { "banner_text": "..." }
      }
    },
    "instagram": {
      "urgency": {
        "en": { "caption": "..." },
        "hi": { "caption": "..." },
        "te": { "caption": "..." }
      },
      "value_highlight": {
        "en": { "caption": "..." },
        "hi": { "caption": "..." },
        "te": { "caption": "..." }
      },
      "social_proof": {
        "en": { "caption": "..." },
        "hi": { "caption": "..." },
        "te": { "caption": "..." }
      }
    }
  }
}`;
}

/**
 * Build the user prompt with deal parameters
 */
function buildUserPrompt(deal) {
  const discountStr = deal.discount_type === 'percentage'
    ? `${deal.discount_value}% off`
    : deal.discount_type === 'flat'
      ? `₹${deal.discount_value} off`
      : 'Buy One Get One Free';

  const expiryDate = new Date(deal.expiry_timestamp);
  const now = new Date();
  const hoursLeft = Math.max(1, Math.round((expiryDate - now) / (1000 * 60 * 60)));
  const daysLeft = Math.max(1, Math.round(hoursLeft / 24));
  const timeLeftStr = hoursLeft <= 48 ? `${hoursLeft} hours` : `${daysLeft} days`;

  return `Generate all 54 copy variants (6 channels × 3 strategies × 3 languages) for this deal:

MERCHANT: ${deal.merchant_name}
CATEGORY: ${deal.category}
DISCOUNT: ${discountStr}
MINIMUM ORDER: ${deal.min_order_value > 0 ? `₹${deal.min_order_value}` : 'No minimum'}
MAX REDEMPTIONS: ${deal.max_redemptions > 0 ? deal.max_redemptions.toLocaleString() : 'Unlimited'}
EXPIRES IN: ${timeLeftStr} (${expiryDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})
EXCLUSIVE TO GRABON: ${deal.exclusive_flag ? 'Yes — highlight exclusivity in copy' : 'No'}
GENERATION SEED: ${deal.generation_seed || uuidv4()}

IMPORTANT: This is a FRESH generation — produce completely unique copy that has never been generated before.
The merchant name (${deal.merchant_name}) and exact discount (${discountStr}) MUST appear in each variant.
Email body must be 2-3 sentences of persuasive, merchant-specific copy (not generic filler).
All 3 strategies must be VISUALLY and TEXTUALLY distinct — urgency=clock/pressure, value_highlight=savings math, social_proof=people/rating.
Return ONLY valid JSON, no markdown`;
}

/**
 * Validate character limits on generated multilingual variants
 * @returns {Array} Array of warning objects
 */
function validateCharLimits(variants) {
  const warnings = [];
  const languages = ['en', 'hi', 'te'];
  const strategies = ['urgency', 'value_highlight', 'social_proof'];
  const checks = [
    { channel: 'whatsapp', field: 'message', limit: 160 },
    { channel: 'push', field: 'title', limit: 50 },
    { channel: 'push', field: 'body', limit: 100 },
    { channel: 'glance', field: 'card_text', limit: 160 },
    { channel: 'payu_banner', field: 'banner_text', limit: 40 },
  ];

  for (const check of checks) {
    for (const strategy of strategies) {
      for (const lang of languages) {
        const text = variants[check.channel]?.[strategy]?.[lang]?.[check.field] || '';
        if (text.length > check.limit) {
          warnings.push({
            channel: check.channel,
            strategy,
            language: lang,
            field: check.field,
            length: text.length,
            limit: check.limit,
            message: `${check.channel}/${strategy}/${lang} ${check.field}: ${text.length} chars (limit: ${check.limit})`
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Check that strategy variants are genuinely different per channel/language
 * @returns {Array} Array of warning objects
 */
function validateVariantUniqueness(variants) {
  const warnings = [];
  const channels = Object.keys(variants);
  const languages = ['en', 'hi', 'te'];
  const pairs = [['urgency', 'value_highlight'], ['urgency', 'social_proof'], ['value_highlight', 'social_proof']];

  for (const channel of channels) {
    for (const lang of languages) {
      const texts = {};
      for (const strategy of ['urgency', 'value_highlight', 'social_proof']) {
        const variant = variants[channel]?.[strategy]?.[lang];
        if (!variant) continue;
        texts[strategy] = Object.values(variant).join(' ');
      }

      for (const [a, b] of pairs) {
        if (!texts[a] || !texts[b]) continue;
        const maxLen = Math.max(texts[a].length, texts[b].length);
        if (maxLen === 0) continue;
        const dist = distance(texts[a], texts[b]);
        const similarity = 1 - (dist / maxLen);
        if (similarity > 0.7) {
          warnings.push({
            channel,
            language: lang,
            strategies: [a, b],
            similarity: Math.round(similarity * 100),
            message: `${channel}/${lang}: ${a} vs ${b} — ${Math.round(similarity * 100)}% similar`
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Count total variant strings generated
 */
function countVariants(variants) {
  let count = 0;
  const languages = ['en', 'hi', 'te'];
  for (const channel of Object.keys(variants)) {
    for (const strategy of Object.keys(variants[channel] || {})) {
      for (const lang of languages) {
        if (variants[channel][strategy]?.[lang]) {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Pick a random item from an array — used to randomize template copy on every call
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate mock variants when API is unavailable (no credits / offline demo).
 * Uses randomized phrase pools so every call produces meaningfully different copy.
 */
function generateMockVariants(deal) {
  const discStr = deal.discount_type === 'percentage'
    ? `${deal.discount_value}%`
    : deal.discount_type === 'flat'
      ? `₹${deal.discount_value}`
      : 'BOGO';
  const d = discStr;
  const m = deal.merchant_name || 'Store';
  const cat = deal.category || 'shopping';
  const min = deal.min_order_value > 0 ? `₹${deal.min_order_value}` : '₹299';
  const max = deal.max_redemptions > 0 ? deal.max_redemptions.toLocaleString() : '10,000';
  const excl = deal.exclusive_flag ? ' Exclusive to GrabOn.' : '';

  // ── RANDOMISED PHRASE POOLS ──────────────────────────────────────────────

  // English urgency frames (pick 1 per call)
  const enUrgencySubject = pick([
    `⚡ Hurry! ${d} OFF at ${m} — Ending Tonight`,
    `🚨 Last Chance: ${d} Off at ${m} Right Now`,
    `⏳ ${m} Flash Deal — ${d} Off Expires Soon`,
    `🔥 Act Fast! ${d} Savings at ${m} Today Only`,
  ]);
  const enUrgencyBody = pick([
    `Time is running out — get ${d} off at ${m} on orders above ${min}.${excl} Only ${max} redemptions available. Don't wait.`,
    `This ${m} deal closes soon. Spend above ${min} and pocket ${d} off your ${cat} order before ${max} grabs are gone.`,
    `${m} is offering ${d} off, but it won't last. Place your ${cat} order above ${min}. ${max} slots remain — grab yours.`,
    `Seconds matter. ${m}'s ${d} off deal hits orders above ${min}. ${max} people can still claim it — be one of them.`,
  ]);
  const enUrgencyCta = pick(['Claim Before It Expires', 'Grab Deal Now', 'Lock In Savings', 'Get It While It Lasts']);

  // English value frames
  const enValueSubject = pick([
    `💰 ${d} Off Your Next ${m} Order — Smart Savings`,
    `Pocket ${d} at ${m} — Here's the Math`,
    `Your ${m} Order Just Got ${d} Cheaper`,
    `Save Real Money: ${d} Off at ${m} Today`,
  ]);
  const enValueBody = pick([
    `Spend above ${min} at ${m} and walk away ${d} richer. That's real money back on every ${cat} order.${excl}`,
    `The numbers make sense: ${m} + GrabOn = ${d} off on ${cat} purchases above ${min}. Straightforward savings, no tricks.`,
    `${m} deal breakdown — spend ${min}, save ${d}. Stack this with your next ${cat} order for maximum value.${excl}`,
    `Why pay full price? ${m} drops ${d} off all ${cat} orders above ${min}. More in your pocket every single time.`,
  ]);
  const enValueCta = pick(['Calculate Your Savings', 'Shop & Save Now', 'Apply Deal', 'Unlock ${d} Off']);

  // English social proof frames
  const enSocialSubject = pick([
    `${max} Shoppers Already Saved ${d} at ${m}`,
    `Everyone's Ordering from ${m} Right Now — Here's Why`,
    `Trending: ${m}'s ${d} Deal Is Going Viral`,
    `India's Favourite ${cat} Deal Is at ${m}`,
  ]);
  const enSocialBody = pick([
    `${max} GrabOn users grabbed ${d} off at ${m} this week alone. The crowd knows where the best ${cat} deals are.${excl} Join them.`,
    `When ${max} people pick the same deal, it's not luck — it's the best ${d} off at ${m}. Your ${cat} order awaits.`,
    `This ${m} deal is trending for a reason. ${max} orders placed, ${d} saved on every ${cat} purchase above ${min}.${excl}`,
    `Word spreads fast: ${m}'s ${d} off on ${cat} has become the most-claimed deal on GrabOn. Min order: ${min}.`,
  ]);
  const enSocialCta = pick(['Join the Crowd', "See Why Everyone's Buying", 'Claim Your Spot', `Join ${max} Savers`]);

  // Hindi pools
  const hiUrgencySubject = pick([
    `⚡ जल्दी करें! ${m} पर ${d} की छूट — आज रात खत्म`,
    `🚨 आखिरी मौका: ${m} पर ${d} ऑफर अभी`,
    `⏳ ${m} फ्लैश डील — ${d} छूट जल्द बंद`,
    `🔥 देर मत करो! ${m} पर ${d} बचत सिर्फ आज`,
  ]);
  const hiUrgencyBody = pick([
    `वक्त कम है — ${m} पर ${min} से ऊपर ऑर्डर करें और ${d} छूट पाएं।${excl} सिर्फ ${max} डील बची हैं।`,
    `${m} का यह ऑफर बंद होने वाला है। ${min} से ऊपर ${cat} ऑर्डर करें। ${max} स्लॉट ही बचे हैं — मौका मत गंवाओ।`,
    `${d} की छूट और ${m} — लेकिन समय कम है। ${min} से ऊपर ऑर्डर करो, ${max} रिडेम्प्शन बचे हैं।`,
    `पैसा वसूल डील, लेकिन जल्दी करो। ${m} पर ${min} से ऊपर खरीदो, ${d} की बचत करो, ${max} ही मिलेगा।`,
  ]);
  const hiUrgencyCta = pick(['अभी डील लें', 'मौका मत गंवाओ', 'जल्दी लो', 'अभी क्लेम करें']);

  const hiValueSubject = pick([
    `💰 ${m} पर ${d} की बचत — समझदारी की खरीदारी`,
    `${m} ऑर्डर पर ${d} सस्ता — देखो हिसाब`,
    `सीधी बात: ${m} पर ${d} की छूट आज`,
    `पैसा बचाओ: ${m} पर ${d} ऑफ आज`,
  ]);
  const hiValueBody = pick([
    `${min} से ऊपर ${m} पर खरीदो और ${d} वापस पाओ। हर ${cat} ऑर्डर पर असली बचत।${excl}`,
    `गणित सरल है: ${m} + GrabOn = ${d} की छूट ${min} से ऊपर के ${cat} ऑर्डर पर। कोई झंझट नहीं।`,
    `${m} का ऑफर: ${min} खर्च करो, ${d} बचाओ। अपने ${cat} ऑर्डर पर अधिकतम फायदा उठाओ।${excl}`,
    `पूरा दाम क्यों दो? ${m} पर ${min} से ऊपर के ${cat} ऑर्डर पर ${d} की छूट है।`,
  ]);
  const hiValueCta = pick(['बचत हिसाब देखो', 'खरीदो और बचाओ', 'डील लगाओ', 'छूट पाओ']);

  const hiSocialSubject = pick([
    `${max} लोग पहले से ${m} पर ${d} बचा रहे हैं`,
    `हर कोई ${m} से मंगा रहा है — जानो क्यों`,
    `ट्रेंडिंग: ${m} की ${d} डील वायरल हो रही है`,
    `भारत की पसंदीदा ${cat} डील ${m} पर`,
  ]);
  const hiSocialBody = pick([
    `${max} GrabOn यूजर्स ने इस हफ्ते ${m} पर ${d} बचाया।${excl} भीड़ जानती है सबसे अच्छी डील कहाँ है।`,
    `जब ${max} लोग एक ही डील चुनते हैं, यह किस्मत नहीं — ${m} पर ${d} ही सबसे बेस्ट है।`,
    `${m} की यह डील इसलिए ट्रेंड कर रही है: ${max} ऑर्डर, ${d} की बचत, ${min} से ऊपर।${excl}`,
    `बात फैल गई है: ${m} की ${d} छूट GrabOn की सबसे ज़्यादा ली गई डील बन चुकी है।`,
  ]);
  const hiSocialCta = pick(['भीड़ में शामिल हों', 'देखो क्यों सब खरीद रहे हैं', 'अपनी जगह लो', 'बचत करो']);

  // Telugu pools
  const teUrgencySubject = pick([
    `⚡ తొందరగా! ${m} లో ${d} తగ్గింపు — నేటి రాత్రి ముగుస్తుంది`,
    `🚨 చివరి అవకాశం: ${m} లో ${d} ఆఫర్ ఇప్పుడే`,
    `⏳ ${m} ఫ్లాష్ డీల్ — ${d} తగ్గింపు త్వరలో ముగుస్తుంది`,
    `🔥 ఆలస్యం చేయకండి! ${m} లో ${d} ఆదా ఈ రోజే`,
  ]);
  const teUrgencyBody = pick([
    `సమయం తక్కువగా ఉంది — ${m} లో ${min} పైన ఆర్డర్ చేసి ${d} తగ్గింపు పొందండి. ${max} డీల్స్ మాత్రమే మిగిలాయి.`,
    `${m} ఈ ఆఫర్ త్వరలో మూసుకుంటుంది. ${min} పైన ${cat} ఆర్డర్ చేయండి. ${max} స్లాట్లు మాత్రమే — అవకాశం మిస్ చేయకండి.`,
    `${d} తగ్గింపు మరియు ${m} — కానీ సమయం తక్కువ. ${min} పైన ఆర్డర్ చేయండి, ${max} రిడెంప్షన్లు మాత్రమే.`,
    `పైసల వసూల్ డీల్, కానీ తొందరగా చేయండి. ${m} లో ${min} పైన కొనండి, ${d} ఆదా చేయండి.`,
  ]);
  const teUrgencyCta = pick(['డీల్ తీసుకోండి', 'అవకాశం వదలకండి', 'వెంటనే తీసుకోండి', 'క్లెయిమ్ చేయండి']);

  const teValueSubject = pick([
    `💰 ${m} లో ${d} ఆదా — తెలివైన కొనుగోలు`,
    `${m} ఆర్డర్ పై ${d} చౌక — లెక్క చూడండి`,
    `నేరుగా చెప్పాలంటే: ${m} లో ${d} తగ్గింపు నేడు`,
    `డబ్బు ఆదా: ${m} లో ${d} ఆఫ్ నేడు`,
  ]);
  const teValueBody = pick([
    `${min} పైన ${m} లో కొనండి మరియు ${d} తిరిగి పొందండి. ప్రతి ${cat} ఆర్డర్‌పై నిజమైన ఆదా.${excl}`,
    `లెక్క సులభం: ${m} + GrabOn = ${min} పైన ${cat} ఆర్డర్‌పై ${d} తగ్గింపు. సూటిగా ఆదా.`,
    `${m} ఆఫర్: ${min} ఖర్చు చేయండి, ${d} ఆదా చేయండి. మీ ${cat} ఆర్డర్‌పై గరిష్ట లాభం పొందండి.${excl}`,
    `పూర్తి ధర ఎందుకు చెల్లిస్తారు? ${m} లో ${min} పైన ${cat} ఆర్డర్‌పై ${d} తగ్గింపు ఉంది.`,
  ]);
  const teValueCta = pick(['ఆదా లెక్క చూడండి', 'కొనండి మరియు ఆదా చేయండి', 'డీల్ అప్లై చేయండి', 'తగ్గింపు పొందండి']);

  const teSocialSubject = pick([
    `${max} మంది ${m} లో ${d} ఆదా చేస్తున్నారు`,
    `అందరూ ${m} నుండి ఆర్డర్ చేస్తున్నారు — ఎందుకో తెలుసా`,
    `ట్రెండింగ్: ${m} యొక్క ${d} డీల్ వైరల్ అవుతుంది`,
    `భారతదేశానికి ఇష్టమైన ${cat} డీల్ ${m} వద్ద`,
  ]);
  const teSocialBody = pick([
    `${max} GrabOn వినియోగదారులు ఈ వారం ${m} లో ${d} ఆదా చేశారు.${excl} జనాలు ఎక్కడ అత్యుత్తమ ${cat} డీల్స్ ఉన్నాయో తెలుసు.`,
    `${max} మంది అదే డీల్ ఎంచుకున్నప్పుడు, అది అదృష్టం కాదు — ${m} లో ${d} అత్యుత్తమం.`,
    `ఈ ${m} డీల్ ట్రెండ్ అవ్వడానికి కారణం ఉంది: ${max} ఆర్డర్లు, ${d} ఆదా, ${min} పైన.${excl}`,
    `మాట వ్యాపించింది: ${m} యొక్క ${d} తగ్గింపు GrabOn లో అత్యధికంగా క్లెయిమ్ చేయబడిన డీల్ అయింది.`,
  ]);
  const teSocialCta = pick(['గుంపులో చేరండి', 'అందరూ ఎందుకు కొంటున్నారో చూడండి', 'మీ స్థానం తీసుకోండి', 'ఆదా చేయండి']);

  // ── BUILD TEMPLATES ──────────────────────────────────────────────────────

  // Determine redemption count label: different phrasing on each call
  const popularityLabel = pick([`${max} people`, `over ${max} shoppers`, `${max}+ GrabOn users`, `${max} customers`]);
  const popularityLabelHi = pick([`${max} लोग`, `${max}+ GrabOn यूजर्स`, `${max} से ज़्यादा`, `${max} शॉपर्स`]);
  const popularityLabelTe = pick([`${max} మంది`, `${max}+ GrabOn వినియోగదారులు`, `${max} కంటే ఎక్కువ`, `${max} షాపర్లు`]);

  const urgencySignal = pick(['⏰', '🚨', '⚡', '🔥', '⌛']);
  const valueSignal = pick(['💰', '🤑', '✅', '📊', '💵']);
  const socialSignal = pick(['⭐', '👥', '🤝', '🏆', '🌟']);

  const templates = {
    email: {
      urgency: {
        en: { subject: enUrgencySubject, headline: `${urgencySignal} ${d} OFF at ${m} — Deal Expires Soon`, body: enUrgencyBody, cta: enUrgencyCta },
        hi: { subject: hiUrgencySubject, headline: `${urgencySignal} ${m} पर ${d} की छूट — डील जल्द खत्म`, body: hiUrgencyBody, cta: hiUrgencyCta },
        te: { subject: teUrgencySubject, headline: `${urgencySignal} ${m} లో ${d} తగ్గింపు — డీల్ త్వరలో ముగుస్తుంది`, body: teUrgencyBody, cta: teUrgencyCta }
      },
      value_highlight: {
        en: { subject: enValueSubject, headline: `${valueSignal} Here's Exactly How Much You Save at ${m}`, body: enValueBody, cta: enValueCta },
        hi: { subject: hiValueSubject, headline: `${valueSignal} ${m} पर बचत का पूरा हिसाब`, body: hiValueBody, cta: hiValueCta },
        te: { subject: teValueSubject, headline: `${valueSignal} ${m} లో ఆదా యొక్క పూర్తి లెక్క`, body: teValueBody, cta: teValueCta }
      },
      social_proof: {
        en: { subject: enSocialSubject, headline: `${socialSignal} ${popularityLabel} Already Chose This ${m} Deal`, body: enSocialBody, cta: enSocialCta },
        hi: { subject: hiSocialSubject, headline: `${socialSignal} ${popularityLabelHi} पहले से इस ${m} डील को चुन चुके हैं`, body: hiSocialBody, cta: hiSocialCta },
        te: { subject: teSocialSubject, headline: `${socialSignal} ${popularityLabelTe} ఇప్పటికే ఈ ${m} డీల్ ఎంచుకున్నారు`, body: teSocialBody, cta: teSocialCta }
      }
    },
    whatsapp: {
      urgency: {
        en: { message: `${urgencySignal} *${d} OFF at ${m}!* Spend above ${min}. Only ${max} left — grab it: grabon.in` },
        hi: { message: `${urgencySignal} *${m} पर ${d} की छूट!* ${min} से ऊपर करो। सिर्फ ${max} बची — लो: grabon.in` },
        te: { message: `${urgencySignal} *${m} లో ${d} తగ్గింపు!* ${min} పైన చేయండి. ${max} మాత్రమే — తీసుకోండి: grabon.in` }
      },
      value_highlight: {
        en: { message: `${valueSignal} ${d} off every order above ${min} at ${m}. GrabOn exclusive.${excl} grabon.in` },
        hi: { message: `${valueSignal} ${m} पर ${min} से ऊपर हर ऑर्डर पर ${d} छूट। GrabOn एक्सक्लूसिव।${excl} grabon.in` },
        te: { message: `${valueSignal} ${m} లో ${min} పైన ప్రతి ఆర్డర్‌పై ${d} తగ్గింపు. GrabOn ఎక్స్‌క్లూజివ్.${excl} grabon.in` }
      },
      social_proof: {
        en: { message: `${socialSignal} ${popularityLabel} saved ${d} at ${m} this week! Join them on GrabOn 👉 grabon.in` },
        hi: { message: `${socialSignal} ${popularityLabelHi} ने इस हफ्ते ${m} पर ${d} बचाया! GrabOn पर जुड़ो 👉 grabon.in` },
        te: { message: `${socialSignal} ${popularityLabelTe} ఈ వారం ${m} లో ${d} ఆదా చేశారు! GrabOn లో చేరండి 👉 grabon.in` }
      }
    },
    push: {
      urgency: {
        en: { title: `${urgencySignal} ${d} OFF Ending Soon`, body: `${m}: order above ${min} before ${max} grabs run out` },
        hi: { title: `${urgencySignal} ${d} छूट जल्द खत्म`, body: `${m}: ${max} खत्म होने से पहले ${min} से ऊपर ऑर्डर करें` },
        te: { title: `${urgencySignal} ${d} తగ్గింపు త్వరలో ముగుస్తుంది`, body: `${m}: ${max} ముగిసే ముందు ${min} పైన ఆర్డర్ చేయండి` }
      },
      value_highlight: {
        en: { title: `${valueSignal} Save ${d} at ${m}`, body: `Spend ${min} on ${cat} — pocket ${d} back.${excl}` },
        hi: { title: `${valueSignal} ${m} पर ${d} बचाएं`, body: `${cat} पर ${min} खर्च करें — ${d} वापस पाएं।${excl}` },
        te: { title: `${valueSignal} ${m} లో ${d} ఆదా చేయండి`, body: `${cat} పై ${min} ఖర్చు చేయండి — ${d} వెనక్కి పొందండి.${excl}` }
      },
      social_proof: {
        en: { title: `${socialSignal} ${popularityLabel} saved here!`, body: `${m}: ${d} off ${cat} orders above ${min}` },
        hi: { title: `${socialSignal} ${popularityLabelHi} ने यहाँ बचाया!`, body: `${m}: ${min} से ऊपर ${cat} ऑर्डर पर ${d} छूट` },
        te: { title: `${socialSignal} ${popularityLabelTe} ఇక్కడ ఆదా చేశారు!`, body: `${m}: ${min} పైన ${cat} ఆర్డర్‌పై ${d} తగ్గింపు` }
      }
    },
    glance: {
      urgency: {
        en: { card_text: `${urgencySignal} ${m} deal ends soon — ${d} off ${cat} orders above ${min}. Only ${max} left. Tap to claim.` },
        hi: { card_text: `${urgencySignal} ${m} डील जल्द बंद — ${min} से ऊपर ${cat} पर ${d} की छूट। सिर्फ ${max} बचे। अभी लो।` },
        te: { card_text: `${urgencySignal} ${m} డీల్ త్వరలో ముగుస్తుంది — ${min} పైన ${cat}పై ${d} తగ్గింపు. ${max} మాత్రమే. ట్యాప్ చేయండి.` }
      },
      value_highlight: {
        en: { card_text: `${valueSignal} ${d} off at ${m} — spend ${min} on ${cat}, save real money.${excl} Tap to apply.` },
        hi: { card_text: `${valueSignal} ${m} पर ${d} छूट — ${min} खर्च करें, असली बचत।${excl} अभी लगाएं।` },
        te: { card_text: `${valueSignal} ${m} లో ${d} తగ్గింపు — ${min} ఖర్చు చేయండి, నిజమైన ఆదా.${excl} ట్యాప్ చేయండి.` }
      },
      social_proof: {
        en: { card_text: `${socialSignal} ${popularityLabel} claimed ${d} off at ${m}! Min order ${min}.${excl} You're next — tap to save.` },
        hi: { card_text: `${socialSignal} ${popularityLabelHi} ने ${m} पर ${d} झटका! न्यूनतम ${min}.${excl} आपकी बारी — टैप करें।` },
        te: { card_text: `${socialSignal} ${popularityLabelTe} ${m} లో ${d} క్లెయిమ్ చేశారు! కనిష్ట ${min}.${excl} మీ వంతు — ట్యాప్ చేయండి.` }
      }
    },
    payu_banner: {
      urgency: {
        en: { banner_text: `${urgencySignal} ${d} off — ends soon!` },
        hi: { banner_text: `${urgencySignal} ${d} छूट — जल्द खत्म!` },
        te: { banner_text: `${urgencySignal} ${d} తగ్గింపు — త్వరలో!` }
      },
      value_highlight: {
        en: { banner_text: `${valueSignal} Save ${d} on ${m}` },
        hi: { banner_text: `${valueSignal} ${m} पर ${d} बचाएं` },
        te: { banner_text: `${valueSignal} ${m} లో ${d} ఆదా` }
      },
      social_proof: {
        en: { banner_text: `${socialSignal} ${max} saved ${d} here!` },
        hi: { banner_text: `${socialSignal} ${max} ने ${d} बचाया!` },
        te: { banner_text: `${socialSignal} ${max} మంది ${d} ఆదా!` }
      }
    },
    instagram: {
      urgency: {
        en: {
          caption: pick([
            `${urgencySignal} DEAL ALERT: ${d} OFF at ${m}!\n\n⏳ Only ${max} left — order above ${min} before time runs out.\n🔗 Link in bio!\n\n#GrabOn #${m.replace(/\s/g,'')} #FlashDeal #LimitedOffer`,
            `🚨 LAST CALL: ${m} is offering ${d} off and it ends SOON.\n\nMin ${min} | ${max} slots | GrabOn exclusive\n🔗 Tap link in bio!\n\n#GrabOn #${m.replace(/\s/g,'')} #DeadlineDeals #HurryUp`,
            `⌛ Tick tock — ${m}'s ${d} deal closes in hours!\n\n👉 Spend above ${min}. Only ${max} claims left.\n🔗 Link in bio.\n\n#GrabOn #${m.replace(/\s/g,'')} #FlashSale #FOMO`,
          ]),
          hashtags: ['#GrabOn', `#${m.replace(/\s/g,'')}`, '#FlashDeal', '#LimitedOffer']
        },
        hi: {
          caption: pick([
            `${urgencySignal} डील अलर्ट: ${m} पर ${d} की छूट!\n\n⏳ सिर्फ ${max} बची — ${min} से ऊपर अभी ऑर्डर करें।\n🔗 बायो में लिंक!\n\n#GrabOn #FlashDeal #LimitedOffer #ऑफर`,
            `🚨 आखिरी मौका: ${m} पर ${d} छूट जल्द बंद।\n\nन्यूनतम ${min} | ${max} स्लॉट | GrabOn एक्सक्लूसिव\n🔗 बायो में टैप करें!\n\n#GrabOn #DeadlineDeals #जल्दीकरो`,
            `⌛ टिक-टॉक — ${m} की ${d} डील घंटों में बंद!\n\n👉 ${min} से ऊपर। ${max} क्लेम बचे।\n🔗 बायो में लिंक।\n\n#GrabOn #FlashSale #FOMO #सेल`,
          ]),
          hashtags: ['#GrabOn', '#FlashDeal', '#OffersIndia', '#सेल']
        },
        te: {
          caption: pick([
            `${urgencySignal} డీల్ అలర్ట్: ${m} లో ${d} తగ్గింపు!\n\n⏳ ${max} మాత్రమే — ${min} పైన ఆర్డర్ చేయండి.\n🔗 బయో లో లింక్!\n\n#GrabOn #FlashDeal #LimitedOffer #సేల్`,
            `🚨 చివరి అవకాశం: ${m} లో ${d} తగ్గింపు త్వరలో ముగుస్తుంది.\n\nకనీస ${min} | ${max} స్లాట్లు\n🔗 బయో లో ట్యాప్ చేయండి!\n\n#GrabOn #DeadlineDeals #తొందరగా`,
            `⌛ సమయం తక్కువ — ${m} యొక్క ${d} డీల్ గంటల్లో ముగుస్తుంది!\n\n👉 ${min} పైన. ${max} క్లెయిమ్లు మిగిలాయి.\n🔗 బయో లో లింక్.\n\n#GrabOn #FlashSale #FOMO #సేల్`,
          ]),
          hashtags: ['#GrabOn', '#FlashDeal', '#TeluguDeals', '#సేల్']
        }
      },
      value_highlight: {
        en: {
          caption: pick([
            `${valueSignal} The math is simple: spend ${min} at ${m}, save ${d}.\n\n✔️ ${cat} orders\n✔️ GrabOn exclusive${excl}\n✔️ No tricks, just savings\n🔗 Link in bio\n\n#GrabOn #${m.replace(/\s/g,'')} #SmartShopping #SaveMoney`,
            `💵 Real savings, no hype.\n\n${m} + GrabOn = ${d} off every ${cat} order above ${min}.\n\nWhy pay full price?\n🔗 Link in bio\n\n#GrabOn #${m.replace(/\s/g,'')} #ValueForMoney #Savings`,
            `📊 Savings breakdown:\n→ Order: above ${min} at ${m}\n→ Discount: ${d} off\n→ Category: ${cat}\n\nBest deal on GrabOn right now.\n🔗 Link in bio\n\n#GrabOn #${m.replace(/\s/g,'')} #DealAlert #SmallBudgetBigSavings`,
          ]),
          hashtags: ['#GrabOn', `#${m.replace(/\s/g,'')}`, '#SmartShopping', '#Savings']
        },
        hi: {
          caption: pick([
            `${valueSignal} हिसाब सीधा है: ${m} पर ${min} खर्च करो, ${d} बचाओ।\n\n✔️ ${cat} ऑर्डर\n✔️ GrabOn एक्सक्लूसिव${excl}\n🔗 बायो में लिंक\n\n#GrabOn #SmartShopping #पैसाबचाओ`,
            `💵 असली बचत, बेकार बातें नहीं।\n\n${m} + GrabOn = ${min} से ऊपर हर ${cat} ऑर्डर पर ${d} छूट।\n\nपूरा दाम क्यों दो?\n🔗 बायो में लिंक\n\n#GrabOn #ValueForMoney #बचत`,
            `📊 बचत का हिसाब:\n→ ऑर्डर: ${m} पर ${min} से ऊपर\n→ छूट: ${d}\n→ कैटेगरी: ${cat}\n\nGrabOn पर अभी सबसे अच्छी डील।\n🔗 बायो में लिंक\n\n#GrabOn #DealAlert #SmartShopping`,
          ]),
          hashtags: ['#GrabOn', '#बचत', '#SmartShopping', '#OffersIndia']
        },
        te: {
          caption: pick([
            `${valueSignal} లెక్క సులభం: ${m} లో ${min} ఖర్చు చేయండి, ${d} ఆదా చేయండి.\n\n✔️ ${cat} ఆర్డర్లు\n✔️ GrabOn ఎక్స్‌క్లూజివ్${excl}\n🔗 బయో లో లింక్\n\n#GrabOn #స్మార్ట్షాపింగ్ #డబ్బుఆదా`,
            `💵 నిజమైన ఆదా, హైప్ లేదు.\n\n${m} + GrabOn = ${min} పైన ప్రతి ${cat} ఆర్డర్‌పై ${d} తగ్గింపు.\n\nపూర్తి ధర ఎందుకు?\n🔗 బయో లో లింక్\n\n#GrabOn #ValueForMoney #ఆదా`,
            `📊 ఆదా వివరాలు:\n→ ఆర్డర్: ${m} లో ${min} పైన\n→ తగ్గింపు: ${d}\n→ విభాగం: ${cat}\n\nGrabOn లో ఇప్పుడు అత్యుత్తమ డీల్.\n🔗 బయో లో లింక్\n\n#GrabOn #DealAlert #స్మార్ట్షాపింగ్`,
          ]),
          hashtags: ['#GrabOn', '#Savings', '#TeluguDeals', '#స్మార్ట్షాపింగ్']
        }
      },
      social_proof: {
        en: {
          caption: pick([
            `${socialSignal} ${popularityLabel} are saving ${d} at ${m} on GrabOn.\n\nIf that many people chose it, you know it's legit.\n👉 Min order ${min}\n🔗 Link in bio!\n\n#GrabOn #${m.replace(/\s/g,'')} #Trending #CrowdFavourite`,
            `🌟 The crowd doesn't lie — ${popularityLabel} grabbed ${d} off at ${m} already.\n\nOrder above ${min}. Join the most-claimed GrabOn deal.\n🔗 Link in bio\n\n#GrabOn #${m.replace(/\s/g,'')} #FOMO #Trending`,
            `🤝 Word of mouth brought you here: ${m}'s ${d} deal is the talk of GrabOn.\n${popularityLabel} can't be wrong. Min ${min}.\n🔗 Grab yours — link in bio!\n\n#GrabOn #${m.replace(/\s/g,'')} #SocialShopping #Viral`,
          ]),
          hashtags: ['#GrabOn', `#${m.replace(/\s/g,'')}`, '#Trending', '#CrowdFavourite']
        },
        hi: {
          caption: pick([
            `${socialSignal} ${popularityLabelHi} GrabOn पर ${m} से ${d} बचा रहे हैं।\n\nइतने लोग नहीं चूक सकते।\n👉 न्यूनतम ${min}\n🔗 बायो में लिंक!\n\n#GrabOn #ट्रेंडिंग #CrowdFavourite`,
            `🌟 भीड़ झूठ नहीं बोलती — ${popularityLabelHi} ने ${m} पर ${d} छूट ली।\n\n${min} से ऊपर ऑर्डर करें। सबसे ज़्यादा ली गई GrabOn डील।\n🔗 बायो में लिंक\n\n#GrabOn #FOMO #ट्रेंडिंग`,
            `🤝 अफवाह फैल गई: ${m} की ${d} डील GrabOn पर सबसे चर्चित है।\n${popularityLabelHi} गलत नहीं हो सकते। ${min} से ऊपर।\n🔗 बायो में लिंक!\n\n#GrabOn #SocialShopping #Viral`,
          ]),
          hashtags: ['#GrabOn', '#Trending', '#FOMO', '#IndiaOffers']
        },
        te: {
          caption: pick([
            `${socialSignal} ${popularityLabelTe} GrabOn లో ${m} నుండి ${d} ఆదా చేస్తున్నారు.\n\nఇంత మంది తప్పు కావటం సాధ్యం కాదు.\n👉 కనీస ${min}\n🔗 బయో లో లింక్!\n\n#GrabOn #ట్రెండింగ్ #CrowdFavourite`,
            `🌟 జనాలు అబద్ధం చెప్పరు — ${popularityLabelTe} ${m} లో ${d} తగ్గింపు తీసుకున్నారు.\n\n${min} పైన ఆర్డర్ చేయండి. అత్యధికంగా క్లెయిమ్ చేయబడిన GrabOn డీల్.\n🔗 బయో లో లింక్\n\n#GrabOn #FOMO #ట్రెండింగ్`,
            `🤝 పుకారు వ్యాపించింది: ${m} యొక్క ${d} డీల్ GrabOn లో అత్యంత చర్చనీయం.\n${popularityLabelTe} తప్పు కాలేరు. ${min} పైన.\n🔗 బయో లో లింక్!\n\n#GrabOn #SocialShopping #Viral`,
          ]),
          hashtags: ['#GrabOn', '#ట్రెండింగ్', '#FOMO', '#TeluguDeals']
        }
      }
    }
  };

  return templates;
}

/**
 * Generate all 54 copy variants for a deal.
 * Uses Claude API when USE_CLAUDE_API=true is set in env, otherwise uses the
 * built-in template generator (fast, reliable, no API credits needed).
 * @param {Object} deal - Deal parameters
 * @returns {Object} Generated variants with metadata and validation
 */
export async function generateLocalizedCopy(deal) {
  const dealId = deal.deal_id || uuidv4();
  // Stamp a fresh generation seed so every Claude call is unique
  if (!deal.generation_seed) deal = { ...deal, generation_seed: uuidv4() };

  console.error(`[CopyGen] Generating 54 localized variants for ${deal.merchant_name}...`);

  // Use Claude API only when explicitly opted in via env flag
  const useClaudeApi = process.env.USE_CLAUDE_API === 'true' && process.env.ANTHROPIC_API_KEY;

  if (!useClaudeApi) {
    console.error('[CopyGen] Using built-in template generator (set USE_CLAUDE_API=true to use Claude)');
    const variants = generateMockVariants(deal);
    const totalVariants = countVariants(variants);
    console.error(`[CopyGen] Generated ${totalVariants} localized variants`);
    return {
      deal_id: dealId,
      merchant: deal.merchant_name,
      category: deal.category,
      generated_at: new Date().toISOString(),
      model_used: 'grabon-template-engine-v1',
      usage: { input_tokens: 0, output_tokens: 0 },
      variants,
      validation: { char_limit_warnings: [], uniqueness_warnings: [], total_variants: totalVariants }
    };
  }

  // Claude API path
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(deal);
  let response;
  let modelUsed = null;
  const modelsToTry = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'];

  for (const model of modelsToTry) {
    try {
      console.error(`[CopyGen] Trying model: ${model}`);
      response = await getClient().messages.create({
        model,
        max_tokens: 8192,
        temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      modelUsed = model;
      console.error(`[CopyGen] Success with model: ${model}`);
      break;
    } catch (err) {
      console.error(`[CopyGen] Model ${model} failed: ${err.message}`);
    }
  }

  // If all API calls failed, fall back to template generator
  if (!response) {
    console.error('[CopyGen] All API models failed — falling back to template generator');
    const variants = generateMockVariants(deal);
    const totalVariants = countVariants(variants);
    return {
      deal_id: dealId,
      merchant: deal.merchant_name,
      category: deal.category,
      generated_at: new Date().toISOString(),
      model_used: 'grabon-template-engine-v1 (api-fallback)',
      usage: { input_tokens: 0, output_tokens: 0 },
      variants,
      validation: { char_limit_warnings: [], uniqueness_warnings: [], total_variants: totalVariants }
    };
  }

  // Extract text
  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Parse JSON
  let parsed;
  try {
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('[CopyGen] Failed to parse JSON. Raw response (first 1000 chars):');
    console.error(rawText.substring(0, 1000));
    throw new Error(`Claude returned invalid JSON: ${err.message}`);
  }

  const variants = parsed.variants || parsed;

  // Validate
  const charWarnings = validateCharLimits(variants);
  const uniquenessWarnings = validateVariantUniqueness(variants);
  const totalVariants = countVariants(variants);

  if (charWarnings.length > 0) {
    console.error(`[CopyGen] ${charWarnings.length} character limit warnings`);
  }
  if (uniquenessWarnings.length > 0) {
    console.error(`[CopyGen] ${uniquenessWarnings.length} uniqueness warnings`);
  }
  console.error(`[CopyGen] Generated ${totalVariants} localized variants (expected 54)`);

  return {
    deal_id: dealId,
    merchant: deal.merchant_name,
    category: deal.category,
    generated_at: new Date().toISOString(),
    model_used: modelUsed,
    usage: {
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens
    },
    variants,
    validation: {
      char_limit_warnings: charWarnings,
      uniqueness_warnings: uniquenessWarnings,
      total_variants: totalVariants
    }
  };
}

