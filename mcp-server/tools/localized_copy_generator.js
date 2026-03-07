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
THE 3 CREATIVE STRATEGIES
═══════════════════════════════════════════

1. URGENCY — Time pressure, scarcity, FOMO. "Last chance", "Ending tonight", "Only X left"
2. VALUE — Savings amount, ROI, rational benefit. "Save ₹X", "Best price", "Maximum savings"
3. SOCIAL PROOF — Popularity, trust signals, community. "X people grabbed this", "Trending now", "Most popular"

CRITICAL: Each variant MUST use a fundamentally different persuasion angle. Urgency = time pressure. Value = rational savings. Social proof = community validation. Do NOT just swap synonyms.

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
 * Generate mock variants when API is unavailable (no credits / offline demo)
 */
function generateMockVariants(deal) {
  const d = deal.discount_value || '50%';
  const m = deal.merchant_name || 'Store';
  const cat = deal.category || 'shopping';
  const min = deal.min_order_value ? `₹${deal.min_order_value}` : '₹299';
  const max = deal.max_redemptions ? deal.max_redemptions.toLocaleString() : '10,000';

  const templates = {
    email: {
      urgency: {
        en: { subject: `⚡ ${d} OFF at ${m} — Ends Soon!`, body: `Don't miss out! Get ${d} off on orders above ${min} at ${m}. Only ${max} deals left. Grab yours before it's gone!`, cta: 'Claim Deal Now' },
        hi: { subject: `⚡ ${m} पर ${d} की छूट — जल्दी करें!`, body: `मत चूकिए! ${min} से ऊपर के ऑर्डर पर ${d} की छूट पाएं। सिर्फ ${max} डील बची हैं। अभी लूट लो!`, cta: 'अभी डील लें' },
        te: { subject: `⚡ ${m} వద్ద ${d} తగ్గింపు — తొందరగా!`, body: `మిస్ చేయకండి! ${min} పైన ఆర్డర్లపై ${d} తగ్గింపు పొందండి. ${max} డీల్స్ మాత్రమే మిగిలాయి!`, cta: 'డీల్ తీసుకో' }
      },
      value_highlight: {
        en: { subject: `Save Big: ${d} OFF at ${m}`, body: `Smart shoppers choose ${m}. Enjoy ${d} off when you spend above ${min}. Maximum savings, minimum spend.`, cta: 'Shop & Save' },
        hi: { subject: `बड़ी बचत: ${m} पर ${d} की छूट`, body: `होशियार खरीदार ${m} को चुनते हैं। ${min} से ऊपर खर्च करने पर ${d} की छूट। अधिकतम बचत, कम खर्च।`, cta: 'खरीदो और बचाओ' },
        te: { subject: `పెద్ద సేవింగ్స్: ${m} లో ${d} తగ్గింపు`, body: `తెలివైన కొనుగోలుదారులు ${m} ని ఎంచుకుంటారు. ${min} పైన ఖర్చు చేసినప్పుడు ${d} తగ్గింపు.`, cta: 'కొనుగోలు చేయండి' }
      },
      social_proof: {
        en: { subject: `10,000+ Users Already Saving at ${m}!`, body: `Join thousands of smart shoppers saving ${d} on every ${cat} order above ${min} at ${m}. Your turn to save!`, cta: 'Join & Save' },
        hi: { subject: `10,000+ यूजर पहले से ${m} पर बचत कर रहे हैं!`, body: `हजारों स्मार्ट शॉपर्स के साथ जुड़ें जो ${m} पर ${d} बचा रहे हैं। अब आपकी बारी!`, cta: 'जुड़ें और बचाएं' },
        te: { subject: `10,000+ వినియోగదారులు ${m} లో ఆదా చేస్తున్నారు!`, body: `వేలాది తెలివైన కొనుగోలుదారులతో చేరండి. ${m} లో ${d} ఆదా చేయండి.`, cta: 'చేరండి మరియు ఆదా చేయండి' }
      }
    },
    whatsapp: {
      urgency: {
        en: { message: `🔥 *${d} OFF at ${m}!* Order above ${min}. Only ${max} left! 👉 Grab now: grabon.in` },
        hi: { message: `🔥 *${m} पर ${d} की छूट!* ${min} से ऊपर ऑर्डर करें। सिर्फ ${max} बची हैं! 👉 अभी लें: grabon.in` },
        te: { message: `🔥 *${m} లో ${d} తగ్గింపు!* ${min} పైన ఆర్డర్ చేయండి. ${max} మాత్రమే మిగిలాయి! 👉 grabon.in` }
      },
      value_highlight: {
        en: { message: `💰 Save ${d} at ${m}! Min order ${min}. Use on GrabOn ✅ grabon.in` },
        hi: { message: `💰 ${m} पर ${d} बचाएं! न्यूनतम ऑर्डर ${min}। GrabOn पर उपयोग करें ✅ grabon.in` },
        te: { message: `💰 ${m} లో ${d} ఆదా చేయండి! కనీస ఆర్డర్ ${min}. GrabOn లో వాడండి ✅ grabon.in` }
      },
      social_proof: {
        en: { message: `⭐ 10K+ people saved ${d} at ${m} today! Join them 👉 grabon.in` },
        hi: { message: `⭐ 10K+ लोगों ने आज ${m} पर ${d} बचाया! आप भी जुड़ें 👉 grabon.in` },
        te: { message: `⭐ 10K+ మంది ఈ రోజు ${m} లో ${d} ఆదా చేశారు! మీరూ చేరండి 👉 grabon.in` }
      }
    },
    push: {
      urgency: {
        en: { title: `⚡ ${d} OFF Ends Soon!`, body: `${m}: Order above ${min} now` },
        hi: { title: `⚡ ${d} की छूट जल्द खत्म!`, body: `${m}: अभी ${min} से ऊपर ऑर्डर करें` },
        te: { title: `⚡ ${d} తగ్గింపు త్వరలో ముగుస్తుంది!`, body: `${m}: ఇప్పుడు ${min} పైన ఆర్డర్ చేయండి` }
      },
      value_highlight: {
        en: { title: `Save ${d} at ${m}`, body: `Min order ${min} — Exclusive GrabOn deal` },
        hi: { title: `${m} पर ${d} बचाएं`, body: `न्यूनतम ${min} — GrabOn एक्सक्लूसिव डील` },
        te: { title: `${m} లో ${d} ఆదా`, body: `కనిష్ట ${min} — GrabOn ఎక్స్‌క్లూజివ్` }
      },
      social_proof: {
        en: { title: `${max} People Saved Today!`, body: `Get ${d} off at ${m} — order above ${min}` },
        hi: { title: `${max} लोगों ने आज बचाया!`, body: `${m} पर ${d} छूट — ${min} से ऊपर ऑर्डर करें` },
        te: { title: `${max} మంది ఈ రోజు ఆదా చేశారు!`, body: `${m} లో ${d} తగ్గింపు — ${min} పైన ఆర్డర్` }
      }
    },
    glance: {
      urgency: {
        en: { headline: `⚡ Hurry! ${d} OFF at ${m}`, card_text: `Flash deal ending soon! Order above ${min} and save ${d} on ${cat}. ${max} redemptions only.` },
        hi: { headline: `⚡ जल्दी करें! ${m} पर ${d} की छूट`, card_text: `फ्लैश डील जल्द खत्म! ${min} से ऊपर ऑर्डर करें और ${d} बचाएं।` },
        te: { headline: `⚡ తొందరగా! ${m} లో ${d} తగ్గింపు`, card_text: `ఫ్లాష్ డీల్ త్వరలో ముగుస్తుంది! ${min} పైన ఆర్డర్ చేసి ${d} ఆదా చేయండి.` }
      },
      value_highlight: {
        en: { headline: `${d} OFF — ${m} Exclusive`, card_text: `Save big on your next ${cat} order. Get ${d} off when you spend above ${min} at ${m}.` },
        hi: { headline: `${d} की छूट — ${m} एक्सक्लूसिव`, card_text: `अपने अगले ऑर्डर पर बड़ी बचत। ${min} से ऊपर खर्च पर ${d} की छूट।` },
        te: { headline: `${d} తగ్గింపు — ${m} ఎక్స్‌క్లూజివ్`, card_text: `మీ తదుపరి ఆర్డర్‌పై పెద్ద ఆదా. ${min} పైన ఖర్చు చేస్తే ${d} తగ్గింపు.` }
      },
      social_proof: {
        en: { headline: `Trending: ${d} OFF at ${m}`, card_text: `Join ${max} smart shoppers saving on ${cat}. Order above ${min} and enjoy ${d} off!` },
        hi: { headline: `ट्रेंडिंग: ${m} पर ${d} छूट`, card_text: `${max} स्मार्ट शॉपर्स के साथ जुड़ें। ${min} से ऊपर ऑर्डर करें और ${d} बचाएं!` },
        te: { headline: `ట్రెండింగ్: ${m} లో ${d} తగ్గింపు`, card_text: `${max} తెలివైన కొనుగోలుదారులతో చేరండి. ${min} పైన ఆర్డర్ చేసి ${d} ఆదా!` }
      }
    },
    payu_banner: {
      urgency: {
        en: { headline: `${d} OFF at ${m}!`, banner_text: `Use at checkout`, cta: 'Grab Deal' },
        hi: { headline: `${m} पर ${d} छूट!`, banner_text: `चेकआउट पर उपयोग करें`, cta: 'डील लें' },
        te: { headline: `${m} లో ${d} తగ్గింపు!`, banner_text: `చెక్అవుట్‌లో వాడండి`, cta: 'డీల్ తీసుకో' }
      },
      value_highlight: {
        en: { headline: `Save ${d} Now`, banner_text: `Min order ${min}`, cta: 'Shop Now' },
        hi: { headline: `अभी ${d} बचाएं`, banner_text: `न्यूनतम ऑर्डर ${min}`, cta: 'अभी खरीदें' },
        te: { headline: `ఇప్పుడు ${d} ఆదా`, banner_text: `కనీస ఆర్డర్ ${min}`, cta: 'ఇప్పుడు కొనండి' }
      },
      social_proof: {
        en: { headline: `${max} Deals Claimed!`, banner_text: `${d} off — ${m}`, cta: 'Claim Yours' },
        hi: { headline: `${max} डील ली गईं!`, banner_text: `${d} छूट — ${m}`, cta: 'अपनी लें' },
        te: { headline: `${max} డీల్స్ క్లెయిమ్ అయ్యాయి!`, banner_text: `${d} తగ్గింపు — ${m}`, cta: 'మీది తీసుకోండి' }
      }
    },
    instagram: {
      urgency: {
        en: { caption: `🔥 FLASH DEAL ALERT! ${d} OFF at ${m} 🔥\n\n${max} deals only — grab yours NOW!\nMin order: ${min}\n\n🔗 Link in bio!\n\n#GrabOn #${m.replace(/\s/g,'')} #FlashSale #Deal`, hashtags: ['#GrabOn', `#${m.replace(/\s/g,'')}`, '#FlashSale', '#LimitedOffer'] },
        hi: { caption: `🔥 फ्लैश डील अलर्ट! ${m} पर ${d} की छूट 🔥\n\nसिर्फ ${max} डील — अभी लो!\nन्यूनतम ऑर्डर: ${min}\n\n🔗 बायो में लिंक!\n\n#GrabOn #ऑफर #सेल`, hashtags: ['#GrabOn', '#FlashSale', '#OffersIndia', '#सेल'] },
        te: { caption: `🔥 ఫ్లాష్ డీల్! ${m} లో ${d} తగ్గింపు 🔥\n\n${max} డీల్స్ మాత్రమే!\nకనీస ఆర్డర్: ${min}\n\n🔗 బయో లో లింక్!\n\n#GrabOn #సేల్`, hashtags: ['#GrabOn', '#FlashSale', '#TeluguDeals', '#సేల్'] }
      },
      value_highlight: {
        en: { caption: `💰 Smart Savings at ${m}!\n\n✅ ${d} OFF on ${cat} orders\n✅ Min order: ${min}\n✅ Exclusive on GrabOn\n\nSave more, spend less! 🛍️\n🔗 Link in bio\n\n#GrabOn #SmartShopping #Savings`, hashtags: ['#GrabOn', '#SmartShopping', '#Savings', '#${cat}'] },
        hi: { caption: `💰 ${m} पर स्मार्ट बचत!\n\n✅ ${cat} पर ${d} की छूट\n✅ न्यूनतम: ${min}\n✅ सिर्फ GrabOn पर\n\n#GrabOn #स्मार्टशॉपिंग #बचत`, hashtags: ['#GrabOn', '#बचत', '#SmartShopping', '#OffersIndia'] },
        te: { caption: `💰 ${m} లో స్మార్ట్ సేవింగ్స్!\n\n✅ ${d} తగ్గింపు\n✅ కనీస: ${min}\n✅ GrabOn లో మాత్రమే\n\n#GrabOn #స్మార్ట్షాపింగ్`, hashtags: ['#GrabOn', '#Savings', '#TeluguDeals'] }
      },
      social_proof: {
        en: { caption: `⭐ Everyone's saving at ${m}!\n\n${max} people already claimed ${d} OFF on ${cat}.\n\nDon't be left out 👉 min order ${min}\n🔗 Grab yours — link in bio!\n\n#GrabOn #Trending #FOMO`, hashtags: ['#GrabOn', '#Trending', '#FOMO', '#SocialShopping'] },
        hi: { caption: `⭐ सब ${m} पर बचत कर रहे हैं!\n\n${max} लोगों ने पहले से ${d} छूट ली।\n\nपीछे मत रहो 👉 न्यूनतम ${min}\n🔗 GrabOn पर लें!\n\n#GrabOn #ट्रेंडिंग`, hashtags: ['#GrabOn', '#Trending', '#FOMO', '#IndiaOffers'] },
        te: { caption: `⭐ అందరూ ${m} లో ఆదా చేస్తున్నారు!\n\n${max} మంది ఇప్పటికే ${d} తగ్గింపు తీసుకున్నారు.\n\n🔗 GrabOn లో తీసుకోండి!\n\n#GrabOn #ట్రెండింగ్`, hashtags: ['#GrabOn', '#Trending', '#FOMO', '#TeluguDeals'] }
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

