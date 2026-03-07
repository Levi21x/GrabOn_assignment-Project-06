/**
 * Test script for the Localized Copy Generation Engine (Segments 2+3)
 * 
 * Calls Claude API with a sample deal and prints all 54 variants
 * grouped by channel → variant → language.
 * 
 * Usage: node test-generate.js [zomato|makemytrip|myntra]
 * Requires: ANTHROPIC_API_KEY in .env file
 */

import dotenv from 'dotenv';
dotenv.config();

import { generateLocalizedCopy } from './tools/localized_copy_generator.js';

// 3 Demo merchant deals
const SAMPLE_DEALS = {
  zomato: {
    merchant_id: 'zomato_001',
    merchant_name: 'Zomato',
    category: 'food',
    discount_value: 50,
    discount_type: 'percentage',
    expiry_timestamp: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    min_order_value: 299,
    max_redemptions: 10000,
    exclusive_flag: true
  },
  makemytrip: {
    merchant_id: 'mmt_001',
    merchant_name: 'MakeMyTrip',
    category: 'travel',
    discount_value: 1500,
    discount_type: 'flat',
    expiry_timestamp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    min_order_value: 5000,
    max_redemptions: 500,
    exclusive_flag: false
  },
  myntra: {
    merchant_id: 'myntra_001',
    merchant_name: 'Myntra',
    category: 'fashion',
    discount_value: 40,
    discount_type: 'percentage',
    expiry_timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    min_order_value: 0,
    max_redemptions: 50000,
    exclusive_flag: false
  }
};

const CHANNELS = ['email', 'whatsapp', 'push', 'glance', 'payu_banner', 'instagram'];
const STRATEGIES = ['urgency', 'value', 'social_proof'];
const LANGUAGES = ['en', 'hi', 'te'];
const LANG_NAMES = { en: 'English', hi: 'Hindi', te: 'Telugu' };

const CHAR_LIMITS = {
  'whatsapp.message': 160,
  'push.title': 50,
  'push.body': 100,
  'glance.card_text': 160,
  'payu_banner.banner_text': 40
};

function charInfo(channel, field, text) {
  const key = `${channel}.${field}`;
  const limit = CHAR_LIMITS[key];
  if (!limit) return `[${text.length} chars]`;
  const over = text.length > limit;
  return `[${text.length}/${limit}${over ? ' ⚠️ OVER' : ''}]`;
}

async function main() {
  const dealKey = process.argv[2] || 'zomato';
  const deal = SAMPLE_DEALS[dealKey];

  if (!deal) {
    console.error(`Unknown deal: ${dealKey}. Available: ${Object.keys(SAMPLE_DEALS).join(', ')}`);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  GrabOn Localized Copy Generation Engine — Test Run             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Merchant:  ${deal.merchant_name}`);
  console.log(`  Category:  ${deal.category}`);
  console.log(`  Discount:  ${deal.discount_type === 'percentage' ? deal.discount_value + '%' : '₹' + deal.discount_value} off`);
  console.log(`  Min Order: ${deal.min_order_value > 0 ? '₹' + deal.min_order_value : 'None'}`);
  console.log(`  Expires:   ${new Date(deal.expiry_timestamp).toLocaleString()}`);
  console.log(`  Exclusive: ${deal.exclusive_flag ? 'Yes' : 'No'}`);
  console.log();
  console.log('  Generating 54 copy variants (6 channels × 3 strategies × 3 languages)...');
  console.log();

  try {
    const startTime = Date.now();
    const result = await generateLocalizedCopy(deal);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n  ✅ Generated ${result.validation.total_variants} variants in ${elapsed}s`);
    console.log(`     Model: ${result.model_used}`);
    console.log(`     Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);

    // Print all 54 variants
    for (const channel of CHANNELS) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`  📢 ${channel.toUpperCase().replace('_', ' ')}`);
      console.log(`${'═'.repeat(70)}`);

      for (const strategy of STRATEGIES) {
        console.log(`\n  🎯 ${strategy.toUpperCase().replace('_', ' ')}`);

        for (const lang of LANGUAGES) {
          const variant = result.variants[channel]?.[strategy]?.[lang];
          if (!variant) {
            console.log(`     ${LANG_NAMES[lang]}: ❌ MISSING`);
            continue;
          }

          console.log(`     ${LANG_NAMES[lang]}:`);
          for (const [field, value] of Object.entries(variant)) {
            const info = charInfo(channel, field, value);
            console.log(`       ${field}: "${value}" ${info}`);
          }
        }
      }
    }

    // Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log('  VALIDATION SUMMARY');
    console.log(`${'═'.repeat(70)}`);

    if (result.validation.char_limit_warnings.length > 0) {
      console.log(`\n  ⚠️  ${result.validation.char_limit_warnings.length} CHARACTER LIMIT VIOLATIONS:`);
      result.validation.char_limit_warnings.forEach(w => console.log(`     - ${w.message}`));
    } else {
      console.log('\n  ✅ All character limits respected');
    }

    if (result.validation.uniqueness_warnings.length > 0) {
      console.log(`\n  ⚠️  ${result.validation.uniqueness_warnings.length} SIMILARITY WARNINGS:`);
      result.validation.uniqueness_warnings.forEach(w => console.log(`     - ${w.message}`));
    } else {
      console.log('  ✅ All variants are sufficiently unique');
    }

    console.log(`\n  Total: ${result.validation.total_variants}/54 variants generated`);
    console.log('  ✅ Test complete.\n');

  } catch (error) {
    console.error(`\n  ❌ Error: ${error.message}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('  → ANTHROPIC_API_KEY is not set in .env file');
      console.error('  → Copy .env.example to .env and add your key');
    }
    process.exit(1);
  }
}

main();
