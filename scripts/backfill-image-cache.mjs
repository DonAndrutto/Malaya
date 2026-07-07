#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Backfill immutable Cache-Control metadata on existing Storage images.
//
//   node scripts/backfill-image-cache.mjs             # fix every image
//   node scripts/backfill-image-cache.mjs --dry-run   # report only
//
// Visitors download images straight from Firebase Storage (the Next.js image
// optimizer is disabled — see IMAGES.md), so an object's Cache-Control header
// is what keeps repeat views free. Today's upload paths (lib/upload.js,
// seed-local-images.mjs, fetch-images.mjs) all set it, but images uploaded
// before that policy existed serve `private, max-age=0` — i.e. every page
// view re-downloads them. Object names are unique and never rewritten, so
// the year-long immutable policy is always safe.
//
// Only the cacheControl field is patched; download tokens and other metadata
// are untouched. Reruns are idempotent (already-correct objects are skipped).
//
// ── Credentials ──────────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK (bypasses security rules). Provide a service
// account one of these ways:
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const DRY_RUN = process.argv.includes('--dry-run');
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Returns { credential, saProject }. A pointed-to key file that does NOT
// exist is a hard error, and main() refuses a service account belonging to a
// different project than the target (same guard as grant-admin.mjs).
async function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    const sa = JSON.parse(inline);
    return { credential: cert(sa), saProject: sa.project_id || '' };
  }
  const file = inline || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    if (!existsSync(file)) {
      throw new Error(`Service-account file not found: ${file} — fix FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS (refusing to fall back to application-default credentials).`);
    }
    const sa = JSON.parse(await readFile(file, 'utf8'));
    return { credential: cert(sa), saProject: sa.project_id || '' };
  }
  return { credential: applicationDefault(), saProject: '' };
}

async function main() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue';
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  const { credential, saProject } = await loadCredential();
  if (saProject && saProject !== projectId) {
    throw new Error(`Service account belongs to project "${saProject}" but the target is "${projectId}" — nothing changed. Use that project's key, or set NEXT_PUBLIC_FIREBASE_PROJECT_ID deliberately.`);
  }
  console.log(`Target Firebase project: ${projectId} (bucket: ${bucketName})${DRY_RUN ? ' — DRY RUN' : ''}`);
  initializeApp({ credential, projectId });
  const bucket = getStorage().bucket(bucketName);

  const [files] = await bucket.getFiles();
  let fixed = 0, ok = 0, skipped = 0;
  for (const file of files) {
    const meta = file.metadata || {};
    if (!/^image\//.test(meta.contentType || '')) { skipped += 1; continue; }
    if (meta.cacheControl === IMMUTABLE) { ok += 1; continue; }
    console.log(`  ${DRY_RUN ? 'would fix' : 'fixing'} ${file.name}  (was: ${meta.cacheControl || 'none'})`);
    if (!DRY_RUN) await file.setMetadata({ cacheControl: IMMUTABLE });
    fixed += 1;
  }
  console.log(`✓ ${files.length} objects: ${fixed} ${DRY_RUN ? 'need fixing' : 'fixed'}, ${ok} already correct, ${skipped} non-image skipped.`);
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1); });
