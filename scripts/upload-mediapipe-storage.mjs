#!/usr/bin/env node
/**
 * Uploads the MediaPipe vision assets to a public Supabase Storage bucket so the
 * hand-tracking WASM/models are served from the Supabase CDN instead of the
 * free.nf host (which aborts large response bodies).
 *
 * Reads VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 * Never prints secrets. Run:  node scripts/upload-mediapipe-storage.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const env = path.join(projectRoot, '.env');

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envVars = loadEnv(env);
const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SERVICE_ROLE = envVars.SUPABASE_SERVICE_ROLE_KEY;
const PERSONAL_TOKEN = envVars.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Project ref from the VITE_SUPABASE_URL host (<ref>.supabase.co).
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return null;
  }
})();

const BUCKET = 'mediapipe';
const API = `${SUPABASE_URL}/storage/v1`;
const MGMT = 'https://api.supabase.com/v1/projects';

// [relative path in bucket, local file, content-type]
const FILES = [
  ['wasm/vision_wasm_internal.wasm', 'public/mediapipe/wasm/vision_wasm_internal.wasm', 'application/wasm'],
  ['wasm/vision_wasm_internal.js', 'public/mediapipe/wasm/vision_wasm_internal.js', 'application/javascript'],
  ['hand_landmarker.task', 'public/mediapipe/hand_landmarker.task', 'application/octet-stream'],
];

function mgmtHeaders() {
  if (!PERSONAL_TOKEN) throw new Error('Missing SUPABASE_ACCESS_TOKEN (needed to create the bucket via Management API)');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${PERSONAL_TOKEN}` };
}

async function ensureBucket() {
  const res = await fetch(`${API}/bucket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ name: BUCKET, public: true, file_size_limit: 25 * 1024 * 1024, allowed_mime_types: null }),
  });
  if (res.ok) {
    console.log(`🪣  Bucket '${BUCKET}' created (public).`);
    return;
  }
  const err = await res.text();
  // "Bucket already exists" / 409 is fine.
  if (res.status === 409 || err.toLowerCase().includes('already exists')) {
    const upd = await fetch(`${API}/bucket/${BUCKET}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ public: true }),
    });
    if (!upd.ok) console.log(`⚠️  Bucket exists; could not force public (${upd.status}).`);
    else console.log(`🪣  Bucket '${BUCKET}' exists (public).`);
    return;
  }
  console.error(`❌  Failed to create bucket: ${res.status} ${err.slice(0, 200)}`);
  process.exit(1);
}

async function uploadFile(bucketPath, localPath, contentType) {
  const full = path.join(projectRoot, localPath);
  if (!fs.existsSync(full)) {
    console.error(`⚠️  Local file missing, skipping: ${localPath}`);
    return false;
  }
  const buf = fs.readFileSync(full);
  const res = await fetch(`${API}/object/${BUCKET}/${bucketPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-upsert-file': 'true',
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE, // new-format secret keys also keyed via apikey header
    },
    body: new Uint8Array(buf),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌  Upload ${bucketPath} failed: ${res.status} ${err.slice(0, 200)}`);
    return false;
  }
  console.log(`✅  ${bucketPath}  (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${contentType})`);
  return true;
}

(async () => {
  console.log('→ Ensuring bucket...');
  await ensureBucket();
  console.log('→ Uploading files...');
  let ok = 0;
  for (const [bp, lp, ct] of FILES) {
    if (await uploadFile(bp, lp, ct)) ok++;
  }
  console.log(`\nDone: ${ok}/${FILES.length} uploaded.`);
  if (ok === FILES.length) {
    console.log(`\nPublic base URL:\n  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`);
  } else {
    console.error('\nSome uploads failed. Check the errors above.');
    process.exit(1);
  }
})();