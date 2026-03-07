/**
 * Test script for the Delivery Engine (Segment 4)
 * 
 * Uses mock variant data to test webhook delivery with retry logic.
 * Requires webhook server running on port 3001.
 * 
 * Usage:
 *   1. Start webhook server: cd webhook-server && node index.js
 *   2. Run: node test-delivery.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { deliverAllVariants } from './delivery/engine.js';

// Mock 54 variant data (simulates output from copy generator)
function createMockVariants() {
  const channels = ['email', 'whatsapp', 'push', 'glance', 'payu_banner', 'instagram'];
  const strategies = ['urgency', 'value', 'social_proof'];
  const languages = ['en', 'hi', 'te'];

  const variants = {};

  for (const channel of channels) {
    variants[channel] = {};
    for (const strategy of strategies) {
      variants[channel][strategy] = {};
      for (const lang of languages) {
        switch (channel) {
          case 'email':
            variants[channel][strategy][lang] = {
              subject: `[${strategy}][${lang}] Zomato 50% off — Don't miss out!`,
              headline: `[${strategy}][${lang}] Get half off your next meal on Zomato`,
              cta: `[${strategy}][${lang}] Grab Deal`
            };
            break;
          case 'whatsapp':
            variants[channel][strategy][lang] = {
              message: `[${strategy}][${lang}] 🍕 50% off Zomato above ₹299! Grab now →`
            };
            break;
          case 'push':
            variants[channel][strategy][lang] = {
              title: `[${strategy}][${lang}] Zomato 50% Off`,
              body: `[${strategy}][${lang}] Orders above ₹299. Limited time only!`
            };
            break;
          case 'glance':
            variants[channel][strategy][lang] = {
              card_text: `[${strategy}][${lang}] 50% off Zomato orders above ₹299 — exclusive on GrabOn!`
            };
            break;
          case 'payu_banner':
            variants[channel][strategy][lang] = {
              banner_text: `[${strategy}][${lang}] Apply ZOMATO50`
            };
            break;
          case 'instagram':
            variants[channel][strategy][lang] = {
              caption: `[${strategy}][${lang}] 🍕 Craving something delicious? Get 50% off on @zomato with GrabOn! 🔥\n\n#GrabOn #Zomato #FoodDeals #50PercentOff #Foodie`
            };
            break;
        }
      }
    }
  }

  return variants;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  GrabOn Delivery Engine — Test Run                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('  Using mock variant data (54 strings)');
  console.log('  Webhook server expected at: http://localhost:3001');
  console.log();

  const variants = createMockVariants();

  // Count
  let count = 0;
  for (const ch of Object.keys(variants)) {
    for (const st of Object.keys(variants[ch])) {
      for (const la of Object.keys(variants[ch][st])) {
        count++;
      }
    }
  }
  console.log(`  Total deliveries to send: ${count}`);
  console.log('  Starting concurrent delivery with retry logic...\n');

  const startTime = Date.now();

  const report = await deliverAllVariants(variants, (event) => {
    if (event.type === 'delivery_progress') {
      const r = event.result;
      const icon = r.status === 'delivered' ? '✅' : r.status === 'permanently_failed' ? '❌' : '🔄';
      process.stdout.write(`  ${icon} [${event.completed}/${event.total}] ${r.channel}/${r.variant}/${r.language} — ${r.status} (${r.attempts} attempt${r.attempts > 1 ? 's' : ''})\n`);
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'═'.repeat(70)}`);
  console.log('  DELIVERY REPORT');
  console.log(`${'═'.repeat(70)}`);
  console.log(`\n  Time:         ${elapsed}s`);
  console.log(`  Total:        ${report.summary.total}`);
  console.log(`  Delivered:    ${report.summary.delivered}`);
  console.log(`  Failed:       ${report.summary.failed}`);
  console.log(`  Success Rate: ${report.summary.success_rate}%`);

  console.log(`\n  PER-CHANNEL BREAKDOWN:`);
  for (const [channel, summary] of Object.entries(report.summary.channels)) {
    console.log(`    ${channel.padEnd(15)} ${summary}`);
  }

  // Show failed deliveries
  const failures = report.deliveries.filter(d => d.status === 'permanently_failed');
  if (failures.length > 0) {
    console.log(`\n  PERMANENTLY FAILED (${failures.length}):`);
    for (const f of failures) {
      console.log(`    ❌ ${f.channel}/${f.variant}/${f.language} — ${f.error} (${f.attempts} attempts)`);
    }
  }

  console.log('\n  ✅ Delivery test complete.\n');
}

main().catch(err => {
  console.error(`\n  ❌ Error: ${err.message}`);
  if (err.code === 'ECONNREFUSED') {
    console.error('  → Webhook server is not running. Start it with: cd webhook-server && node index.js');
  }
  process.exit(1);
});
