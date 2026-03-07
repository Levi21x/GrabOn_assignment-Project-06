/**
 * GrabOn Copy Generation Engine
 * 
 * Calls the Claude API to generate 18 marketing copy variants
 * for 6 channels × 3 creative strategies (urgency, value, social-proof).
 * 
 * Enforces character limits and validates variant uniqueness.
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { distance } from 'fastest-levenshtein';

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Character limits per channel
const CHAR_LIMITS = {
  whatsapp: { message: 160 },
  push: { title: 50, body: 100 },
  glance: { card_text: 160 },
  payu_banner: { banner_text: 40 },
  // email and instagram have no strict char limits
};

/**
 * Build the system prompt for Claude to generate deal copy
 */
function buildSystemPrompt() {
  return `You are GrabOn's expert marketing copywriter. GrabOn is India's #1 coupon and deals platform with 3,500+ merchant partners.

BRAND VOICE: Smart, deal-focused, conversational Indian English. Speak to deal-savvy Indian consumers. Use ₹ for currency. Keep it punchy, not corporate.

YOUR TASK: Generate 18 unique marketing copy variants for a merchant deal. You must create copy for 6 distribution channels, each with 3 creative strategy variants.

═══════════════════════════════════════════
THE 6 CHANNELS (with format constraints)
═══════════════════════════════════════════

1. EMAIL — Subject line (compelling open-worthy), body headline (value prop), CTA button text
2. WHATSAPP — Single message, MAX 160 CHARACTERS. Must feel like a friend texting you a deal tip.
3. PUSH NOTIFICATION — Title (MAX 50 CHARS) + body (MAX 100 CHARS). Scannable at a glance.
4. GLANCE LOCK SCREEN — Single card text, MAX 160 CHARS. Zero context — user sees this cold on their lock screen. Must be self-contained and instantly compelling.
5. PAYU CHECKOUT BANNER — MAX 40 CHARACTERS total. Pure action copy shown during payment. Think "Apply SAVE50 — get 50% off"
6. INSTAGRAM CAPTION — Free-form with relevant hashtags. Engaging, shareable, trending-format.

═══════════════════════════════════════════
THE 3 CREATIVE STRATEGIES (must be genuinely different)
═══════════════════════════════════════════

1. URGENCY — Time pressure, scarcity, FOMO. Words like: "Last chance", "Ending tonight", "Only X left", "Don't miss out"
2. VALUE — Savings amount, ROI, rational benefit. Words like: "Save ₹X", "Worth ₹X for just ₹Y", "Best price", "Maximum savings"  
3. SOCIAL PROOF — Popularity, trust, community. Words like: "X people grabbed this", "Trending now", "Most popular", "Top-rated deal"

CRITICAL: Each variant MUST use a fundamentally different persuasion angle. Do NOT just swap synonyms. An urgency variant should make the reader feel time pressure. A value variant should make them calculate savings. A social proof variant should make them feel they're missing what others already have.

═══════════════════════════════════════════
CHARACTER LIMITS (STRICTLY ENFORCE)
═══════════════════════════════════════════
- WhatsApp message: ≤ 160 characters
- Push title: ≤ 50 characters  
- Push body: ≤ 100 characters
- Glance card_text: ≤ 160 characters
- PayU banner_text: ≤ 40 characters
- Email & Instagram: no hard limit, but keep email subject ≤ 80 chars

═══════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON — NO MARKDOWN)
═══════════════════════════════════════════

Return ONLY valid JSON. No markdown code fences, no explanation, no preamble. Just the JSON object.

The schema:
{
  "variants": {
    "email": {
      "urgency": { "subject": "...", "headline": "...", "cta": "..." },
      "value": { "subject": "...", "headline": "...", "cta": "..." },
      "social_proof": { "subject": "...", "headline": "...", "cta": "..." }
    },
    "whatsapp": {
      "urgency": { "message": "..." },
      "value": { "message": "..." },
      "social_proof": { "message": "..." }
    },
    "push": {
      "urgency": { "title": "...", "body": "..." },
      "value": { "title": "...", "body": "..." },
      "social_proof": { "title": "...", "body": "..." }
    },
    "glance": {
      "urgency": { "card_text": "..." },
      "value": { "card_text": "..." },
      "social_proof": { "card_text": "..." }
    },
    "payu_banner": {
      "urgency": { "banner_text": "..." },
      "value": { "banner_text": "..." },
      "social_proof": { "banner_text": "..." }
    },
    "instagram": {
      "urgency": { "caption": "..." },
      "value": { "caption": "..." },
      "social_proof": { "caption": "..." }
    }
  }
}`;
}

/**
 * Build the user prompt with deal parameters injected
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

  return `Generate all 18 copy variants for this deal:

MERCHANT: ${deal.merchant_name}
CATEGORY: ${deal.category}  
DISCOUNT: ${discountStr}
MINIMUM ORDER: ${deal.min_order_value > 0 ? `₹${deal.min_order_value}` : 'No minimum'}
MAX REDEMPTIONS: ${deal.max_redemptions > 0 ? deal.max_redemptions.toLocaleString() : 'Unlimited'}
EXPIRES IN: ${timeLeftStr} (${expiryDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})
EXCLUSIVE TO GRABON: ${deal.exclusive_flag ? 'Yes — mention exclusivity' : 'No'}

Generate the 18 variants now. Return ONLY JSON.`;
}

/**
 * Validate character limits on generated variants
 * @returns {Array} Array of warning strings
 */
function validateCharLimits(variants) {
  const warnings = [];

  // WhatsApp
  for (const strategy of ['urgency', 'value', 'social_proof']) {
    const msg = variants.whatsapp?.[strategy]?.message || '';
    if (msg.length > 160) {
      warnings.push(`⚠️  WhatsApp/${strategy}: ${msg.length} chars (limit: 160)`);
    }
  }

  // Push
  for (const strategy of ['urgency', 'value', 'social_proof']) {
    const title = variants.push?.[strategy]?.title || '';
    const body = variants.push?.[strategy]?.body || '';
    if (title.length > 50) {
      warnings.push(`⚠️  Push/${strategy} title: ${title.length} chars (limit: 50)`);
    }
    if (body.length > 100) {
      warnings.push(`⚠️  Push/${strategy} body: ${body.length} chars (limit: 100)`);
    }
  }

  // Glance
  for (const strategy of ['urgency', 'value', 'social_proof']) {
    const text = variants.glance?.[strategy]?.card_text || '';
    if (text.length > 160) {
      warnings.push(`⚠️  Glance/${strategy}: ${text.length} chars (limit: 160)`);
    }
  }

  // PayU
  for (const strategy of ['urgency', 'value', 'social_proof']) {
    const text = variants.payu_banner?.[strategy]?.banner_text || '';
    if (text.length > 40) {
      warnings.push(`⚠️  PayU/${strategy}: ${text.length} chars (limit: 40)`);
    }
  }

  return warnings;
}

/**
 * Check that different strategy variants are genuinely different
 * Uses word overlap as a simple similarity metric
 * @returns {Array} Array of warning strings
 */
function validateVariantUniqueness(variants) {
  const warnings = [];
  const channels = Object.keys(variants);

  for (const channel of channels) {
    const strategies = ['urgency', 'value', 'social_proof'];
    const texts = {};

    for (const strategy of strategies) {
      const variant = variants[channel]?.[strategy];
      if (!variant) continue;
      // Concatenate all text fields for this variant
      texts[strategy] = Object.values(variant).join(' ');
    }

    // Compare each pair
    const pairs = [['urgency', 'value'], ['urgency', 'social_proof'], ['value', 'social_proof']];
    for (const [a, b] of pairs) {
      if (!texts[a] || !texts[b]) continue;
      const maxLen = Math.max(texts[a].length, texts[b].length);
      if (maxLen === 0) continue;
      const dist = distance(texts[a], texts[b]);
      const similarity = 1 - (dist / maxLen);
      if (similarity > 0.7) {
        warnings.push(`⚠️  ${channel}: ${a} vs ${b} are ${Math.round(similarity * 100)}% similar — variants should be more distinct`);
      }
    }
  }

  return warnings;
}

/**
 * Generate 18 copy variants for a deal using Claude API
 * @param {Object} deal - Deal parameters
 * @returns {Object} Generated variants with metadata
 */
export async function generateCopyVariants(deal) {
  const dealId = deal.deal_id || uuidv4();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(deal);

  console.error(`[CopyGen] Generating 18 variants for ${deal.merchant_name}...`);

  // Try claude-sonnet-4-5 first, fall back to claude-sonnet-4-5 or haiku
  let response;
  const modelsToTry = ['claude-sonnet-4-5-20250514', 'claude-sonnet-4-5-20250514', 'claude-haiku-3-5-20241022'];

  for (const model of modelsToTry) {
    try {
      console.error(`[CopyGen] Trying model: ${model}`);
      response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      console.error(`[CopyGen] Success with model: ${model}`);
      break;
    } catch (err) {
      console.error(`[CopyGen] Model ${model} failed: ${err.message}`);
      if (model === modelsToTry[modelsToTry.length - 1]) throw err;
    }
  }

  // Extract text from Claude's response
  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Parse JSON — handle possible markdown code fences
  let parsed;
  try {
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error('[CopyGen] Failed to parse Claude response as JSON. Raw response:');
    console.error(rawText.substring(0, 500));
    throw new Error(`Claude returned invalid JSON: ${err.message}`);
  }

  const variants = parsed.variants || parsed;

  // Validate character limits
  const charWarnings = validateCharLimits(variants);
  if (charWarnings.length > 0) {
    console.error('[CopyGen] Character limit warnings:');
    charWarnings.forEach(w => console.error(`  ${w}`));
  }

  // Validate variant uniqueness
  const uniquenessWarnings = validateVariantUniqueness(variants);
  if (uniquenessWarnings.length > 0) {
    console.error('[CopyGen] Uniqueness warnings:');
    uniquenessWarnings.forEach(w => console.error(`  ${w}`));
  }

  // Count total variants generated
  let totalVariants = 0;
  for (const channel of Object.keys(variants)) {
    for (const strategy of Object.keys(variants[channel])) {
      totalVariants++;
    }
  }

  console.error(`[CopyGen] Generated ${totalVariants} variants (expected 18)`);

  return {
    deal_id: dealId,
    merchant: deal.merchant_name,
    category: deal.category,
    generated_at: new Date().toISOString(),
    model_used: response.model,
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
