#!/usr/bin/env node
/**
 * Test a Google Gemini API key directly against the Generative Language API.
 * Useful to validate a key BEFORE putting it in Supabase.
 *
 * The key is read (in priority order) from:
 *   1. the GEMINI_API_KEY variable in the project's .env file (recommended —
 *      the key never leaves your machine and is never printed), or
 *   2. the CLI argument (optional, for one-off tests; avoid sharing it in chats).
 *
 * Usage:
 *   node scripts/test-gemini-key.mjs                 # reads GEMINI_API_KEY from .env
 *   node scripts/test-gemini-key.mjs <API_KEY>       # explicit key (optional)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = path.join(root, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8').replace(/\r/g, '');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }

  const key = process.argv[2] || env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) {
    console.error('No API key found. Add GEMINI_API_KEY to your .env or pass it as an argument.');
    console.error('Usage: node scripts/test-gemini-key.mjs [API_KEY]');
    process.exitCode = 1;
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: 'Answer with a single short English sentence: what is 2+2?' }] }],
  });

  console.log(`Testing key ${key.slice(0, 12)}... directly against Gemini API`);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await resp.text();
    console.log(`STATUS: ${resp.status}`);
    console.log(`BODY: ${text.slice(0, 800)}`);

    if (resp.ok) {
      console.log('✅ Key valid and working');
      process.exitCode = 0;
      return;
    }
    if (resp.status === 403 && text.includes('API_KEY_SERVICE_BLOCKED')) {
      console.log('❌ KEY_BLOCKED: the Generative Language API is blocked/disabled for this key.');
      console.log('   Fix: generate a new key at https://aistudio.google.com/apikey');
    } else if (resp.status === 400 && text.includes('API key')) {
      console.log('❌ INVALID_KEY: this key does not look valid.');
    } else if (resp.status === 429) {
      console.log('❌ QUOTA: key valid but quota exhausted.');
    } else {
      console.log('❌ Unexpected response. Read BODY above.');
    }
    process.exitCode = 1;
  } catch (err) {
    console.error('❌ Network error:', String(err));
    process.exitCode = 1;
  }
}

main();
