#!/usr/bin/env node
/**
 * Lumorius AI — Secret Generator
 * INMARTECH PVT LTD
 * 
 * Usage: node scripts/generate-secrets.js
 * Generates secure random values for your .env file.
 */

const crypto = require('crypto');

const gen = (bytes = 64) => crypto.randomBytes(bytes).toString('hex');

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║  Lumorius AI — Generated Secrets                  ║');
console.log('║  Copy these into your .env file                  ║');
console.log('╚══════════════════════════════════════════════════╝\n');

console.log(`JWT_SECRET=${gen()}`);
console.log(`JWT_REFRESH_SECRET=${gen()}`);
console.log(`SESSION_SECRET=${gen()}`);
console.log();
console.log('# Paste the above values into your .env file.');
console.log('# NEVER commit .env to version control.\n');
