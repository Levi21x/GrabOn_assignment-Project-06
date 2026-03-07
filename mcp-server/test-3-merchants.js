/**
 * Test all 3 merchant deals end-to-end to satisfy the demo requirement.
 */
import { handleDistributeDeal } from './tools/distribute_deal.js';

// Always use a future timestamp so these tests never fail with "deal expired"
const in72h = () => new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

const deals = [
  {
    merchant_id: 'zomato_001', merchant_name: 'Zomato', category: 'food',
    discount_value: 50, discount_type: 'percentage',
    expiry_timestamp: in72h(), min_order_value: 299,
    max_redemptions: 10000, exclusive_flag: true
  },
  {
    merchant_id: 'mmt_001', merchant_name: 'MakeMyTrip', category: 'travel',
    discount_value: 1500, discount_type: 'flat',
    expiry_timestamp: in72h(), min_order_value: 5000,
    max_redemptions: 5000, exclusive_flag: false
  },
  {
    merchant_id: 'myntra_001', merchant_name: 'Myntra', category: 'fashion',
    discount_value: 40, discount_type: 'percentage',
    expiry_timestamp: in72h(), min_order_value: 999,
    max_redemptions: 20000, exclusive_flag: true
  }
];

console.log('\n══════════════════════════════════════════════════════');
console.log('  GrabOn MCP — 3 Merchant End-to-End Test');
console.log('══════════════════════════════════════════════════════\n');

for (const deal of deals) {
  console.log(`\n▶ Processing: ${deal.merchant_name} (${deal.category})`);
  const r = await handleDistributeDeal(deal);

  const allStrings = r.all_54_strings || {};
  const count = Object.values(allStrings)
    .flatMap(ch => Object.values(ch).flatMap(st => Object.values(st))).length;

  console.log(`  Status         : ${r.status}`);
  console.log(`  Strings built  : ${count}/54`);
  console.log(`  Delivered      : ${r.delivery_summary?.delivered}/${r.total_strings_generated}`);
  console.log(`  Success rate   : ${r.delivery_summary?.success_rate}`);
  console.log(`  Retries        : ${r.delivery_logs?.filter(l => l.includes('retried')).length || 0}`);

  // Print first 3 strings as sample
  const firstChannel = Object.keys(allStrings)[0];
  const firstStrategy = Object.keys(allStrings[firstChannel])[0];
  console.log(`\n  Sample strings (${firstChannel} / ${firstStrategy}):`);
  for (const [lang, text] of Object.entries(allStrings[firstChannel][firstStrategy])) {
    console.log(`    [${lang}] ${text.substring(0, 100)}`);
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  All 3 merchants processed ✅');
console.log('══════════════════════════════════════════════════════\n');
