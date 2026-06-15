#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed Firebase with the existing Malaya imagery from the live site.
//
//   node scripts/fetch-images.mjs            # seed everything
//   node scripts/fetch-images.mjs --force    # re-upload even if already present
//   node scripts/fetch-images.mjs --dry-run  # list what would happen, no writes
//
// For each image it:
//   1. downloads it from https://malayajewelrybhutan.com  (into memory only —
//      nothing is written to the repo, so the checkout stays lightweight),
//   2. uploads it to the Firebase Storage bucket
//        products/{productId}/{file}   — catalogue photos
//        site/{slot}/{file}            — logo, hero, tiles, banners, portrait
//   3. writes the resulting Storage download URL back to Firestore
//        catalogueOverrides/{productId}.img        — per product
//        siteSettings/images                        — site imagery (one doc)
//
// The storefront already reads those Firestore fields live, so once this runs the
// site serves every image from your own Firebase (no CDN, nothing committed).
//
// ── Credentials ──────────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK, which bypasses the security rules, so it works
// whether or not the open/authenticated rules are deployed. Provide a service
// account one of these ways:
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// Create one in the Firebase console → Project settings → Service accounts →
// "Generate new private key". The bucket defaults to the project's, or set
// FIREBASE_STORAGE_BUCKET / NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to override.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://malayajewelrybhutan.com/';
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  'malaya-catalogue.firebasestorage.app';

const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry-run');

// ── Site imagery: which CDN file backs each Firestore slot ───────────────────
// Mirrors the defaults in lib/data/site-data.js and the folders SiteImages.jsx
// uploads to. `images/` is the CDN prefix for non-product imagery.
const SITE_IMAGES = [
  { slot: 'logo',        folder: 'site/logo',    file: 'logo.png' },
  { slot: 'homeBanner',  folder: 'site/banners', file: 'banner12.jpg' },
  { slot: 'pageBanner',  folder: 'site/banners', file: 'banner33.jpg' },
  { slot: 'aboutBanner', folder: 'site/banners', file: 'banner31.jpg' },
  { slot: 'tashiPhoto',  folder: 'site/tashi',   file: 'Tashi-Mannox.jpg' },
];
const HERO_FILES = [
  'home/home6/malaya-jewelry-a.jpg', 'home/home6/malaya-jewelry-b.jpg',
  'home/home6/malaya-jewelry-c.jpg', 'home/home6/malaya-jewelry-d.jpg',
];
const TILE_FILES = {
  Rings:     'pages/637029624591107629A.jpg',
  Bracelets: 'pages/636932877383986659B.jpg',
  Earrings:  'pages/637029624591127589C.jpg',
  Pendants:  'pages/637029624591137561D.jpg',
};

// ── Product id → image filename ──────────────────────────────────────────────
// Parsed straight from the data files (line by line, so quotes/apostrophes in
// names don't matter): the price-sheet items (p###) live in products.js, the
// live-site extras (x###) in site-data.js.
async function productImages() {
  const map = {};
  const sources = [
    { rel: 'lib/data/products.js', id: /'(p\d{3})'/ },
    { rel: 'lib/data/site-data.js', id: /'(x\d{3})'/ },
  ];
  for (const { rel, id } of sources) {
    const txt = await readFile(path.join(ROOT, rel), 'utf8');
    for (const line of txt.split('\n')) {
      const i = line.match(id);
      const f = line.match(/(\d{6,}[A-Za-z]?\.jpe?g)/);
      if (i && f && !map[i[1]]) map[i[1]] = f[1];
    }
  }
  return map;
}

// ── Storage upload ───────────────────────────────────────────────────────────
const contentTypeOf = (file) => (/\.png$/i.test(file) ? 'image/png' : 'image/jpeg');

function downloadUrl(bucketName, dest, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
}

// Download `srcUrl` into memory and upload it to `dest` in the bucket, returning
// a Firebase download URL. Reuses an existing object (and its token) unless
// --force is set, so reruns are cheap and idempotent.
async function seedImage(bucket, dest, srcUrl) {
  const file = bucket.file(dest);
  if (!FORCE) {
    const [exists] = await file.exists();
    if (exists) {
      const [meta] = await file.getMetadata();
      const token = (meta.metadata && meta.metadata.firebaseStorageDownloadTokens || '').split(',')[0];
      if (token) return { url: downloadUrl(bucket.name, dest, token), status: 'skip' };
    }
  }
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
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

async function main() {
  const credential = await loadCredential();
  if (!credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('✗ No service account found. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT (see the header of this file).');
    process.exit(1);
  }
  initializeApp({
    ...(credential ? { credential } : {}),
    storageBucket: DEFAULT_BUCKET,
  });
  const bucket = getStorage().bucket();
  const db = getFirestore();

  const products = await productImages();
  const productIds = Object.keys(products);
  const siteCount = SITE_IMAGES.length + HERO_FILES.length + Object.keys(TILE_FILES).length;
  console.log(`Seeding ${productIds.length} product images + ${siteCount} site images`);
  console.log(`  bucket: ${bucket.name}${DRY ? '   (dry run — no writes)' : ''}\n`);

  let ok = 0, skip = 0, fail = 0;
  const tally = (s) => { s === 'ok' ? ok++ : skip++; };

  // Products → Storage + catalogueOverrides/{id}.img
  for (const id of productIds) {
    const file = products[id];
    const dest = `products/${id}/${file}`;
    try {
      if (DRY) { console.log(`  · ${id}  ${file}`); continue; }
      const { url, status } = await seedImage(bucket, dest, CDN + 'products/' + file);
      await db.collection('catalogueOverrides').doc(id).set(
        { img: url, _updated: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tally(status);
    } catch (e) {
      fail++;
      console.warn(`  ✗ ${id} (${file}): ${e.message}`);
    }
  }

  // Site imagery → Storage, collected into a single siteSettings/images doc.
  const siteDoc = {};
  const seedSite = async (folder, file, label) => {
    const dest = `${folder}/${file.split('/').pop()}`;
    if (DRY) { console.log(`  · ${label}  ${file}`); return null; }
    const { url, status } = await seedImage(bucket, dest, CDN + 'images/' + file);
    tally(status);
    return url;
  };

  try {
    for (const { slot, folder, file } of SITE_IMAGES) {
      const url = await seedSite(folder, file, slot);
      if (url) siteDoc[slot] = url;
    }
    const hero = [];
    for (const file of HERO_FILES) {
      const url = await seedSite('site/hero', file, 'hero');
      if (url) hero.push(url);
    }
    if (hero.length) siteDoc.heroSlides = hero;
    const tiles = {};
    for (const [cat, file] of Object.entries(TILE_FILES)) {
      const url = await seedSite('site/tiles', file, `tile ${cat}`);
      if (url) tiles[cat] = url;
    }
    if (Object.keys(tiles).length) siteDoc.homeTiles = tiles;

    if (!DRY && Object.keys(siteDoc).length) {
      await db.collection('siteSettings').doc('images').set(
        { ...siteDoc, _updated: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  } catch (e) {
    fail++;
    console.warn(`  ✗ site imagery: ${e.message}`);
  }

  if (DRY) {
    console.log('\nDry run complete — no images were uploaded and no documents written.');
    return;
  }
  console.log(`\nDone. ${ok} uploaded, ${skip} already present, ${fail} failed.`);
  console.log('Firestore now points every image at Firebase Storage — the storefront updates live.');
}

main().catch((e) => { console.error(e); process.exit(1); });
