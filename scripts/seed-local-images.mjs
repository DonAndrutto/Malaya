#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed Firebase from a LOCAL folder of product images (no scraping).
//
//   node scripts/seed-local-images.mjs                 # upload everything
//   node scripts/seed-local-images.mjs "/path/to/dir"  # custom master folder
//   node scripts/seed-local-images.mjs --dry-run       # list what would happen
//   node scripts/seed-local-images.mjs --force         # re-upload even if present
//
// Expects a MASTER directory whose sub-folders are named exactly after the
// product SKUs, each holding one or more image files:
//
//   Malaya Website Images/
//     P034-WG14/        front.jpg  side.jpg  …
//     P033-14K-MOP/     1.jpg      2.jpg     …
//
// For every SKU folder it:
//   1. reads each image file inside it,
//   2. uploads them to Firebase Storage  →  products/{SKU}/{filename}
//   3. collects the resulting Firebase download URLs,
//   4. writes them to Firestore  →  catalogueOverrides/{SKU}
//        images : [url, …]   (the gallery, in filename order)
//        img    : images[0]  (the primary photo)
//      with { merge: true }, so existing fields (published, story, price, …) are
//      preserved. Publishing a line stays a separate, deliberate step in /admin.
//
// Idempotent: an object already in Storage is reused (its existing download
// token is kept) unless --force, and Firestore is simply refreshed — so it is
// safe to run repeatedly. Adding a photo to a folder and re-running appends it;
// removing one and re-running drops it from the `images` array.
//
// ── Credentials ──────────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK (bypasses security rules). Provide a service
// account one of these ways:
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// The bucket defaults to the project's, or set FIREBASE_STORAGE_BUCKET /
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to override.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The studio's master image folder. Override with a positional arg or IMAGES_DIR.
const DEFAULT_DIR = '/Users/andrzejsmacair/Desktop/Malaya Website Images';
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  'malaya-catalogue.firebasestorage.app';

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');
const DRY = ARGS.includes('--dry-run');
const IMAGES_DIR = ARGS.find((a) => !a.startsWith('--')) || process.env.IMAGES_DIR || DEFAULT_DIR;

// Which file types count as images, and their content types.
const IMAGE_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
};
const isImage = (f) => Object.prototype.hasOwnProperty.call(IMAGE_TYPES, path.extname(f).toLowerCase());
const contentTypeOf = (f) => IMAGE_TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';

// Make a Storage-safe object filename (keep the extension, tame spaces/quotes).
const safeName = (name) => name.replace(/[^\w.\-]+/g, '_');
// Natural order so "2.jpg" sorts before "10.jpg".
const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function downloadUrl(bucketName, dest, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
}

// Upload one local file to `dest`, returning a Firebase download URL. Reuses an
// existing object (and its token) unless --force, keeping reruns cheap.
async function uploadFile(bucket, dest, localPath) {
  const file = bucket.file(dest);
  if (!FORCE) {
    const [exists] = await file.exists();
    if (exists) {
      const [meta] = await file.getMetadata();
      const token = ((meta.metadata && meta.metadata.firebaseStorageDownloadTokens) || '').split(',')[0];
      if (token) return { url: downloadUrl(bucket.name, dest, token), status: 'skip' };
    }
  }
  const buffer = await readFile(localPath);
  const token = randomUUID();
  await file.save(buffer, {
    resumable: false,
    contentType: contentTypeOf(dest),
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return { url: downloadUrl(bucket.name, dest, token), status: 'ok' };
}

// ── Firebase Admin init ──────────────────────────────────────────────────────
async function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) return cert(JSON.parse(inline));
  const file = inline || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file && existsSync(file)) return cert(JSON.parse(await readFile(file, 'utf8')));
  return null; // fall back to applicationDefault via env
}

// Soft check: SKUs the storefront already knows about (from the stock ledger).
// Folders outside this set still upload — they just won't surface online until a
// matching ledger line exists and is published.
async function knownSkus() {
  try {
    const txt = await readFile(path.join(ROOT, 'lib/data/stock-data.js'), 'utf8');
    const set = new Set();
    for (const m of txt.matchAll(/sku:\s*'([^']+)'/g)) set.add(m[1]);
    return set;
  } catch {
    return new Set();
  }
}

async function main() {
  if (!existsSync(IMAGES_DIR)) {
    console.error(`✗ Images directory not found:\n    ${IMAGES_DIR}`);
    console.error('  Pass the folder as an argument or set IMAGES_DIR=/path/to/folder');
    process.exit(1);
  }

  const entries = await readdir(IMAGES_DIR, { withFileTypes: true });
  const skuDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(naturally);

  if (!skuDirs.length) {
    console.error(`✗ No SKU sub-folders found in ${IMAGES_DIR}`);
    process.exit(1);
  }

  // A dry run only reads the disk — no credentials or network needed.
  let bucket = null, db = null;
  if (!DRY) {
    const credential = await loadCredential();
    if (!credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error('✗ No service account found. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT (see the header of this file).');
      process.exit(1);
    }
    initializeApp({
      ...(credential ? { credential } : {}),
      storageBucket: DEFAULT_BUCKET,
    });
    bucket = getStorage().bucket();
    db = getFirestore();
  }

  const known = await knownSkus();
  console.log(`Seeding local images from: ${IMAGES_DIR}`);
  console.log(`  bucket: ${DRY ? DEFAULT_BUCKET + '   (dry run — no writes)' : bucket.name}`);
  console.log(`  ${skuDirs.length} SKU folder(s)\n`);

  let uploaded = 0, reused = 0, docs = 0, emptyFolders = 0, failed = 0;
  const unknown = [];

  for (const sku of skuDirs) {
    const dir = path.join(IMAGES_DIR, sku);
    let files;
    try {
      files = (await readdir(dir)).filter(isImage).sort(naturally);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${sku}: cannot read folder — ${e.message}`);
      continue;
    }
    if (!files.length) {
      emptyFolders++;
      console.warn(`  · ${sku}: no image files — skipped`);
      continue;
    }
    if (known.size && !known.has(sku)) unknown.push(sku);

    if (DRY) {
      console.log(`  · ${sku}: ${files.length} image(s) → catalogueOverrides/${sku}.images`);
      files.forEach((f) => console.log(`      products/${sku}/${safeName(f)}`));
      continue;
    }

    const urls = [];
    let partial = false;
    for (const f of files) {
      const dest = `products/${sku}/${safeName(f)}`;
      try {
        const { url, status } = await uploadFile(bucket, dest, path.join(dir, f));
        urls.push(url);
        if (status === 'ok') uploaded++; else reused++;
      } catch (e) {
        failed++;
        partial = true;
        console.warn(`  ✗ ${sku}/${f}: ${e.message}`);
      }
    }
    if (!urls.length) {
      console.warn(`  ✗ ${sku}: all uploads failed — Firestore not updated`);
      continue;
    }
    try {
      await db.collection('catalogueOverrides').doc(sku).set(
        { images: urls, img: urls[0], _updated: FieldValue.serverTimestamp() },
        { merge: true },
      );
      docs++;
      console.log(`  ✓ ${sku}: ${urls.length} image(s)${partial ? ' (some failed)' : ''}`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${sku}: Firestore write failed — ${e.message}`);
    }
  }

  if (unknown.length) {
    console.log(`\nHeads-up: ${unknown.length} folder(s) aren't in the stock ledger (lib/data/stock-data.js):`);
    console.log(`  ${unknown.join(', ')}`);
    console.log('  Their images are saved, but a SKU only appears on the storefront once a matching');
    console.log('  ledger line exists AND is toggled Online. We can extend the ledger in a later phase.');
  }

  if (DRY) {
    console.log('\nDry run complete — nothing uploaded, no documents written.');
    return;
  }

  console.log(`\nDone. ${uploaded} uploaded, ${reused} already present, ${docs} Firestore doc(s) updated, ${emptyFolders} empty folder(s), ${failed} failure(s).`);
  console.log('\nNext: open /admin → Stock ledger and toggle the seeded lines Online to publish them.');
}

main().catch((e) => { console.error(e); process.exit(1); });
