#!/usr/bin/env node
/**
 * Test the gemini-proxy Supabase Edge Function end-to-end.
 * Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env, sends an
 * analysis prompt, and prints the HTTP status + body.
 *
 * Usage: node scripts/test-gemini-proxy.mjs
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
      const m = line.match(/^\s*(VITE_[A-Z0-9_]+)=(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }

  const url = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env');
    process.exitCode = 1;
    return;
  }

  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/gemini-proxy`;
  const prompt = process.argv[2] || 'Answer with a single short English sentence: what is 2+2?';
  const body = JSON.stringify({ prompt, mode: 'analysis' });

  console.log(`POST ${endpoint}`);
  console.log(`prompt: ${prompt}`);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
      },
      body,
    });
    const text = await resp.text();
    console.log(`STATUS: ${resp.status}`);
    console.log(`BODY: ${text.slice(0, 1000)}`);
    if (resp.ok) {
      console.log('✅ Proxy works (200 OK)');
      process.exitCode = 0;
      return;
    }
    if (resp.status === 503) {
      console.log('❌ 503: GEMINI_API_KEY missing on Supabase project (secrets)');
    } else if (resp.status === 500) {
      console.log('❌ 500: Gemini returned an error. Read BODY above (e.g. 400/403/429 means the KEY is wrong, restricted, or quota exhausted).');
    }
    process.exitCode = 1;
  } catch (err) {
    console.error('❌ Network/parse error:', String(err));
    process.exitCode = 1;
  }
}

main();
