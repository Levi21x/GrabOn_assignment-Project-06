#!/usr/bin/env node

/**
 * GrabOn Multi-Channel Deal Distribution MCP Server
 * 
 * This MCP server connects to Claude Desktop via stdio transport
 * and exposes the `distribute_deal` tool for automated deal distribution
 * across 6 channels, 3 copy strategies, and 3 languages.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleDistributeDeal } from './tools/distribute_deal.js';

// Create MCP server instance
const server = new McpServer({
  name: 'grabon-deal-distributor',
  version: '1.0.0',
  description: 'Multi-Channel Deal Distribution MCP Server for GrabOn — generates 54 localized copy variants across 6 channels and delivers them via webhooks.'
});

// Register the distribute_deal tool
server.tool(
  'distribute_deal',
  'Distribute a merchant deal across 6 channels (Email, WhatsApp, Push, Glance Lock Screen, PayU Checkout, Instagram) with 3 copy variants (urgency, value, social-proof) in 3 languages (English, Hindi, Telugu). Generates 54 total strings and delivers them to all channel endpoints.',
  {
    merchant_id: z.string().describe('Unique merchant identifier (e.g., "zomato_001")'),
    merchant_name: z.string().describe('Display name of the merchant (e.g., "Zomato")'),
    category: z.enum(['food', 'travel', 'electronics', 'fashion', 'health', 'beauty']).describe('Merchant business category'),
    discount_value: z.number().describe('Numeric discount value (e.g., 50 for 50% or 1500 for ₹1500 flat)'),
    discount_type: z.enum(['percentage', 'flat', 'bogo']).describe('Type of discount: percentage, flat amount, or buy-one-get-one'),
    expiry_timestamp: z.string().describe('Deal expiry in ISO 8601 format (e.g., "2026-03-07T23:59:59Z")'),
    min_order_value: z.number().optional().default(0).describe('Minimum order value to avail the deal (in ₹)'),
    max_redemptions: z.number().optional().default(0).describe('Maximum number of times this deal can be redeemed (0 = unlimited)'),
    exclusive_flag: z.boolean().optional().default(false).describe('Whether the deal is exclusive to GrabOn')
  },
  async (params) => {
    try {
      const result = await handleDistributeDeal(params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              message: error.message || 'An unexpected error occurred during deal distribution.'
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
);

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running and listening on stdin/stdout
  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('[GrabOn MCP] Server started successfully — listening on stdio');
}

main().catch((error) => {
  console.error('[GrabOn MCP] Fatal error starting server:', error);
  process.exit(1);
});
