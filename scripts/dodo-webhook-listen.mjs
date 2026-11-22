#!/usr/bin/env node
// Forwards Dodo Payments TEST-mode webhooks to the local API, so checkout and plan
// upgrades can be tested without a public URL.
//
// Usage:  pnpm dodo:webhooks
//
// It runs Dodo's official CLI (`dodo wh listen`), signed in with DODO_PAYMENTS_API_KEY
// from the root .env. The CLI registers a test-mode webhook endpoint on Dodo's relay
// and forwards each event, with Dodo's signature headers, to the local webhook route.
// Put that endpoint's signing secret in DODO_PAYMENTS_WEBHOOK_KEY (see docs/dodo-payments.md).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = 'dodopayments-cli@3.7.4';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv(file) {
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const env = readEnv(join(root, '.env'));
const key = env.DODO_PAYMENTS_API_KEY ?? '';
if (!key.startsWith('dodo_test_')) {
  console.error('DODO_PAYMENTS_API_KEY in .env must be a test-mode key (dodo_test_…). Webhook forwarding only works in test mode.');
  process.exit(1);
}
const apiUrl = (process.argv[2] || env.API_URL || 'http://localhost:3001/api').replace(/\/+$/, '');
const target = `${apiUrl}/v1/billing/webhook/dodo`;
console.log(`Forwarding Dodo test-mode webhooks to ${target}. Press Ctrl+C to stop.`);

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', CLI, 'wh', 'listen', target], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DODO_PAYMENTS_API_KEY: key, DODO_PAYMENTS_ENVIRONMENT: 'test_mode' },
});
child.on('exit', (code) => process.exit(code ?? 0));
