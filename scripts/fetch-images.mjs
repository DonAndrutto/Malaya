#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Seed the repo with the existing Malaya imagery from the live site, so images
// can be served from /public/images instead of hot-linking the CDN.
//
//   node scripts/fetch-images.mjs
//
// Then set NEXT_PUBLIC_IMAGE_SOURCE=local to serve them locally.
//
// Product filenames are read from the catalogue data files; site imagery is a
// curated list. Run this where https://malayajewelrybhutan.com is reachable
// (some sandboxes block it). Already-downloaded files are skipped.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://malayajewelrybhutan.com/';
const OUT_PRODUCTS = path.join(ROOT, 'public', 'images', 'products');
const OUT_SITE = path.join(ROOT, 'public', 'images', 'site');

// Non-product imagery referenced by the storefront (paths under /images/).
const SITE_IMAGES = [
  'logo.png', 'tashi.jpg', 'Tashi-Mannox.jpg', 'mega4.jpg', 'malaya-jewelry-hand-craft.jpg',
  'banner12.jpg', 'banner31.jpg', 'banner33.jpg',
  'icon/icon-lock.png', 'icon/icon-cart.png', 'icon/malaya.jpg',
  'home/home6/malaya-jewelry-a.jpg', 'home/home6/malaya-jewelry-b.jpg',
  'home/home6/malaya-jewelry-c.jpg', 'home/home6/malaya-jewelry-d.jpg',
  'pages/637029624591107629A.jpg', 'pages/636932877383986659B.jpg',
  'pages/637029624591127589C.jpg', 'pages/637029624591137561D.jpg',
];

// Pull every product image filename out of the catalogue data files.
async function productFilenames() {
  const files = new Set();
  for (const rel of ['lib/data/products.js', 'lib/data/site-data.js']) {
    try {
      const txt = await readFile(path.join(ROOT, rel), 'utf8');
      for (const m of txt.matchAll(/\d{6,}[MS]\.(?:jpe?g)/gi)) files.add(m[0]);
    } catch { /* ignore */ }
  }
  return [...files];
}

async function download(url, dest) {
  if (existsSync(dest)) return 'skip';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return 'ok';
}

async function run(list, baseUrl, outDir, label) {
  let ok = 0, skip = 0, fail = 0;
  for (const rel of list) {
    try {
      const r = await download(baseUrl + rel, path.join(outDir, rel));
      r === 'ok' ? ok++ : skip++;
    } catch (e) {
      fail++;
      console.warn(`  ✗ ${rel}: ${e.message}`);
    }
  }
  console.log(`${label}: ${ok} downloaded, ${skip} already present, ${fail} failed`);
}

const products = await productFilenames();
console.log(`Fetching ${products.length} product images + ${SITE_IMAGES.length} site images from ${CDN}\n`);
await run(products, CDN + 'products/', OUT_PRODUCTS, 'products');
await run(SITE_IMAGES, CDN + 'images/', OUT_SITE, 'site   ');
console.log('\nDone. Commit public/images and set NEXT_PUBLIC_IMAGE_SOURCE=local to serve them from the repo.');
