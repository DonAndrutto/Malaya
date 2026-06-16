#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Build the master stock ledger from the curated image folders.
//
// The sub-folder names in your master image directory are the DEFINITIVE SKU
// list. This script turns them into lib/data/stock-ledger.json (which the app
// imports via lib/data/stock-data.js) plus a reviewable lib/data/stock-ledger.csv.
//
//   node scripts/build-inventory.mjs                       # scan folders → json + csv
//   node scripts/build-inventory.mjs "/path/to/Images"     # custom master folder
//   node scripts/build-inventory.mjs --dry-run             # preview, no writes
//   node scripts/build-inventory.mjs --fresh               # ignore prior values
//   node scripts/build-inventory.mjs --from-csv lib/data/stock-ledger.csv
//                                                          # import an edited CSV
//
// For each SKU folder it records:
//   sku        the folder name (verbatim — the source of truth)
//   code       base production code (SKU up to the first "-")
//   name       carried over from the existing ledger if the SKU matches, else ""
//   category   inferred from the code prefix (P→Pendants, E→Earrings, …)
//   material   inferred from the SKU suffixes (-S→Silver, -YG14→14k Gold, …)
//   qty/cost/retail   carried over from the existing ledger when the SKU matches
//   productId/productIds   linked legacy catalogue listings (from products.js CODE_MAP)
//
// Folder scan PRESERVES prior name/category/material/qty/cost/retail for SKUs
// that still exist (idempotent — safe to re-run as you add folders); only brand
// new SKUs get inferred defaults and blank numbers for you to fill in (in /admin,
// or by editing the CSV and re-importing with --from-csv). --fresh ignores all
// prior values. Nothing here touches Firebase.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'lib/data/stock-ledger.json');
const OUT_CSV = path.join(ROOT, 'lib/data/stock-ledger.csv');
const DEFAULT_DIR = '/Users/andrzejsmacair/Desktop/Malaya Website Images';

const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.includes(name);
const opt = (name) => { const i = ARGS.indexOf(name); return i >= 0 ? ARGS[i + 1] : null; };
const DRY = flag('--dry-run');
const FRESH = flag('--fresh');
const FROM_CSV = opt('--from-csv');
const IMAGES_DIR = ARGS.find((a) => !a.startsWith('--') && a !== FROM_CSV) || process.env.IMAGES_DIR || DEFAULT_DIR;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const isImage = (f) => IMAGE_EXT.has(path.extname(f).toLowerCase());
const naturally = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const deriveCode = (sku) => String(sku).split('-')[0];

// ── Inference from the SKU naming convention ─────────────────────────────────
const CATEGORY = {
  P: 'Pendants', E: 'Earrings', N: 'Necklaces', R: 'Rings', B: 'Bracelets',
  BA: 'Bangles', BR: 'Brooches', CL: 'Cufflinks', CC: 'Chains', AC: 'Accessories',
};
function inferCategory(code) {
  const alpha = (String(code).match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
  return CATEGORY[alpha] || CATEGORY[alpha[0]] || 'Accessories';
}
function inferMaterial(sku) {
  const toks = String(sku).toUpperCase().split('-');
  const has = (re) => toks.some((t) => re.test(t));
  if (has(/^PT$/) || has(/PLATIN/)) return 'Platinum';
  if (has(/^WG/)) return 'White Gold';
  if (has(/^RG/)) return 'Rose Gold';                       // RG14, RGP
  if (has(/^YGP$/) || has(/^GP$/) || has(/GOLDPLATED?/)) return 'Gold Plated';
  if (has(/^YG?18/) || has(/^18K?$/)) return '18k Gold';
  if (has(/^YG?14/) || has(/^14K?$/)) return '14k Gold';
  if (has(/VERMEIL/) || has(/^V$/)) return 'Vermeil';
  if (has(/^S$/) || has(/SILVER/)) return 'Silver';
  return '';
}

// ── Data sources ─────────────────────────────────────────────────────────────
// Legacy catalogue links: productId → salesCode in products.js. We re-derive the
// links for each SKU so a published ledger line still supersedes its catalogue
// twin where the SKU matches.
async function readCodeMap() {
  try {
    const txt = await readFile(path.join(ROOT, 'lib/data/products.js'), 'utf8');
    const m = txt.match(/export const CODE_MAP\s*=\s*(\{[\s\S]*?\});/);
    return m ? JSON.parse(m[1]) : {};
  } catch { return {}; }
}
function linksFor(sku, codeMap) {
  const productIds = Object.keys(codeMap).filter((pid) => codeMap[pid] === sku);
  return { productId: productIds[0] || null, productIds };
}
async function readExisting() {
  try { return JSON.parse(await readFile(OUT_JSON, 'utf8')); } catch { return []; }
}

// ── CSV ──────────────────────────────────────────────────────────────────────
const CSV_COLS = ['sku', 'code', 'name', 'category', 'material', 'qty', 'cost', 'retail', 'images', 'productIds'];
const csvEsc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function toCsv(rows) {
  const lines = [CSV_COLS.join(',')];
  for (const r of rows) {
    lines.push(CSV_COLS.map((c) =>
      c === 'images' ? (r._images ?? '') :
      c === 'productIds' ? csvEsc((r.productIds || []).join(' ')) :
      csvEsc(r[c]),
    ).join(','));
  }
  return lines.join('\n') + '\n';
}
function parseCsv(text) {
  const out = []; let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out;
}

// JSON row = the fields stock-data.js consumes (drops the CSV-only `_images`).
const num = (v) => (v == null || v === '' ? null : (isNaN(Number(v)) ? null : Number(v)));
function jsonRow(r) {
  return {
    sku: r.sku, code: r.code, name: r.name || '', category: r.category, material: r.material,
    qty: num(r.qty), cost: num(r.cost), retail: num(r.retail),
    productId: r.productId || null, productIds: r.productIds || [],
  };
}

async function fromFolders() {
  if (!existsSync(IMAGES_DIR)) {
    console.error(`✗ Images directory not found:\n    ${IMAGES_DIR}`);
    console.error('  Pass the folder as an argument or set IMAGES_DIR=/path/to/folder');
    process.exit(1);
  }
  const codeMap = await readCodeMap();
  const prior = {};
  if (!FRESH) for (const r of await readExisting()) prior[r.sku] = r;

  const entries = await readdir(IMAGES_DIR, { withFileTypes: true });
  const skus = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(naturally);
  if (!skus.length) { console.error(`✗ No SKU sub-folders found in ${IMAGES_DIR}`); process.exit(1); }

  const rows = [];
  let carried = 0, fresh = 0, withImages = 0, empty = 0;
  for (const sku of skus) {
    const files = (await readdir(path.join(IMAGES_DIR, sku))).filter(isImage);
    const prev = prior[sku] || null;
    if (prev) carried++; else fresh++;
    if (files.length) withImages++; else empty++;
    const code = deriveCode(sku);
    const { productId, productIds } = linksFor(sku, codeMap);
    rows.push({
      sku, code,
      name: (prev && prev.name) || '',
      category: (prev && prev.category) || inferCategory(code),
      material: (prev && prev.material) || inferMaterial(sku),
      qty: prev ? prev.qty : null,
      cost: prev ? prev.cost : null,
      retail: prev ? prev.retail : null,
      productId, productIds,
      _images: files.length,
    });
  }
  return { rows, summary: { total: rows.length, carried, fresh, withImages, empty } };
}

async function fromCsv(file) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(abs)) { console.error(`✗ CSV not found: ${abs}`); process.exit(1); }
  const codeMap = await readCodeMap();
  const table = parseCsv(await readFile(abs, 'utf8')).filter((r) => r.length && r.some((c) => c !== ''));
  if (table.length < 2) { console.error('✗ CSV has no data rows.'); process.exit(1); }
  const head = table[0].map((h) => h.trim());
  const col = (r, name) => { const i = head.indexOf(name); return i >= 0 ? r[i] : ''; };
  const rows = [];
  for (const r of table.slice(1)) {
    const sku = (col(r, 'sku') || '').trim();
    if (!sku) continue;
    const code = (col(r, 'code') || '').trim() || deriveCode(sku);
    const { productId, productIds } = linksFor(sku, codeMap); // links always come from CODE_MAP
    rows.push({
      sku, code,
      name: (col(r, 'name') || '').trim(),
      category: (col(r, 'category') || '').trim() || inferCategory(code),
      material: (col(r, 'material') || '').trim() || inferMaterial(sku),
      qty: col(r, 'qty'), cost: col(r, 'cost'), retail: col(r, 'retail'),
      productId, productIds,
      _images: (col(r, 'images') || '').trim(),
    });
  }
  rows.sort((a, b) => naturally(a.sku, b.sku));
  return { rows, summary: { total: rows.length } };
}

async function main() {
  const { rows, summary } = FROM_CSV ? await fromCsv(FROM_CSV) : await fromFolders();

  if (FROM_CSV) console.log(`Importing inventory from CSV: ${FROM_CSV}`);
  else console.log(`Building inventory from folders: ${IMAGES_DIR}${FRESH ? '  (--fresh)' : ''}`);
  console.log(`  ${summary.total} SKU(s)` +
    (summary.carried != null ? ` · ${summary.carried} carried over · ${summary.fresh} new · ${summary.withImages} with images${summary.empty ? ` · ${summary.empty} empty` : ''}` : '') +
    (DRY ? '   (dry run — no writes)' : ''));

  const missingNum = rows.filter((r) => num(r.retail) == null).length;
  if (missingNum) console.log(`  note: ${missingNum} SKU(s) have no retail price yet — set it before publishing.`);

  if (DRY) {
    console.log('');
    for (const r of rows.slice(0, 12)) {
      console.log(`  ${r.sku.padEnd(20)} ${String(r.category).padEnd(11)} ${String(r.material || '—').padEnd(12)} imgs:${r._images ?? '?'}`);
    }
    if (rows.length > 12) console.log(`  … and ${rows.length - 12} more`);
    console.log('\nDry run complete — nothing written.');
    return;
  }

  await writeFile(OUT_JSON, JSON.stringify(rows.map(jsonRow), null, 2) + '\n');
  await writeFile(OUT_CSV, toCsv(rows));
  console.log(`\nWrote ${rows.length} rows:`);
  console.log(`  ${path.relative(process.cwd(), OUT_JSON)}   (master — the app reads this)`);
  console.log(`  ${path.relative(process.cwd(), OUT_CSV)}   (review / edit, then re-import with --from-csv)`);
  console.log('\nNext: commit these files, then `node scripts/seed-local-images.mjs` to upload the photos.');
}

main().catch((e) => { console.error(e); process.exit(1); });
