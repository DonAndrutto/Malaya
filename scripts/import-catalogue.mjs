#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Import the Malaya 2025 catalogue / pricing sheet into the master stock ledger.
//
// The catalogue (lib/data/catalogue-2025-source.csv) is the studio's authoritative
// price + description sheet. Its columns are:
//
//   Sales Code , Description , USD , Ngultrum
//
// It carries the proper item NAME (the "Description" — the make/composition) and
// the current USD retail price, but NOT the "Story Behind" narrative (a Firestore
// override field, not ledger data) nor the unit Cost (kept on the ledger, never
// supplied by this sheet — so it is preserved untouched here).
//
// This script folds that sheet into the master ledger keyed by SKU:
//
//   • existing ledger SKU  → set name = Description, retail = USD (authoritative),
//                            fill blank category/material; KEEP code, qty, COST,
//                            image count and catalogue links untouched.
//   • new SKU              → add a fresh ledger line (qty/cost blank, no images),
//                            with category/material inferred from the SKU + text.
//   • ledger SKU not in the sheet → carried over unchanged.
//
// ── No duplicates ────────────────────────────────────────────────────────────
// The same physical item is often written with different punctuation/spacing or
// re-ordered suffixes across the two sources, e.g.
//
//     "P016- YG14"  ==  "P016-YG14"          (stray space)
//     "E010-B-YG14" ==  "E010B-YG14"         (variant letter split out)
//     "E008/GE/YG14"==  "E008-GE-YG14"       (slashes vs dashes)
//     "E008-YG14-RR"==  "E008-RR-YG14"       (suffix order)
//
// To guarantee absolutely no duplicates we match on a DUAL canonical key:
//   stripKey — uppercase, all non-alphanumerics removed   (catches punctuation/
//              spacing/slash + letter-split variants)
//   sortKey  — uppercase tokens, sorted, joined           (catches suffix re-order)
// A catalogue row merges into an existing ledger line if EITHER key matches; only
// when neither matches is a brand-new line created. The final ledger is asserted
// to contain no two rows sharing either key.
//
//   node scripts/import-catalogue.mjs                       # import the source sheet
//   node scripts/import-catalogue.mjs path/to/sheet.csv     # custom source file
//   node scripts/import-catalogue.mjs --dry-run             # report only, no writes
//
// Writes (unless --dry-run):
//   lib/data/stock-ledger.json   master — the app reads this
//   lib/data/stock-ledger.csv    reviewable mirror (re-import with build-inventory)
//   lib/data/catalogue-2025.csv  cleaned, de-duped sheet (salesCode,description,usd,ngultrum)
//
// Nothing here touches Firebase.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = path.join(ROOT, 'lib/data/stock-ledger.json');
const OUT_CSV = path.join(ROOT, 'lib/data/stock-ledger.csv');
const OUT_CATALOGUE = path.join(ROOT, 'lib/data/catalogue-2025.csv');
const DEFAULT_SOURCE = path.join(ROOT, 'lib/data/catalogue-2025-source.csv');

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const SOURCE = ARGS.find((a) => !a.startsWith('--')) || DEFAULT_SOURCE;

const naturally = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
const deriveCode = (sku) => String(sku).split('-')[0].trim();

// ── Canonical keys (dedup) ───────────────────────────────────────────────────
const stripKey = (sku) => String(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
const sortKey = (sku) =>
  String(sku).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).sort().join('-');

// ── SKU tidy-up (for brand-new lines only) ───────────────────────────────────
function niceSku(raw) {
  return String(raw)
    .trim()
    .replace(/\s*\/\s*/g, '-')   // slashes → dashes:  E008/GE/YG14 → E008-GE-YG14
    .replace(/\s*-\s*/g, '-')    // tidy dash spacing: "P016- YG14"  → P016-YG14
    .replace(/\s+/g, ' ');       // collapse remaining internal whitespace
}

// ── Inference (mirrors scripts/build-inventory.mjs) ──────────────────────────
const CATEGORY = {
  P: 'Pendants', E: 'Earrings', N: 'Necklaces', R: 'Rings', B: 'Bracelets',
  BA: 'Bangles', BR: 'Brooches', CL: 'Cufflinks', CC: 'Chains', AC: 'Accessories',
};
// Description-noun → category, used when the code prefix is numeric/ambiguous
// (EXT…, CH…, CA…, C…, bare numbers) so chains/rings aren't mis-filed.
function categoryFromText(desc) {
  const d = (desc || '').toLowerCase();
  if (/\bextension\b/.test(d)) return 'Chains';
  if (/\bring\b/.test(d)) return 'Rings';
  if (/\bearring/.test(d)) return 'Earrings';
  if (/\bcufflink/.test(d)) return 'Cufflinks';
  if (/\bbrooch\b/.test(d)) return 'Brooches';
  if (/\bbangle\b/.test(d)) return 'Bangles';
  if (/\bbracelet\b/.test(d)) return 'Bracelets';
  if (/\bnecklace\b/.test(d)) return 'Necklaces';
  if (/\bpendant\b/.test(d)) return 'Pendants';
  if (/(mala counter|tally counter|mala counters)/.test(d)) return 'Accessories';
  if (/\bchain\b/.test(d)) return 'Chains';
  return null;
}
function inferCategory(sku, desc) {
  const alpha = (deriveCode(sku).match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
  if (CATEGORY[alpha]) return CATEGORY[alpha];           // BA/BR/CL/CC then P/E/N/R/B
  if (CATEGORY[alpha[0]]) {
    // Single-letter prefix that maps (e.g. E), but double-check obvious mis-files
    // for the awkward C-family (Counters=Accessories, CH/CA chains) and EXT.
    const fromText = categoryFromText(desc);
    if (fromText && /^(EXT|CH|CA|C)$/.test(alpha)) return fromText;
    return CATEGORY[alpha[0]];
  }
  return categoryFromText(desc) || 'Accessories';
}
function inferMaterial(sku, desc) {
  const toks = String(sku).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const has = (re) => toks.some((t) => re.test(t));
  if (has(/^PT$/) || has(/PLATIN/)) return 'Platinum';
  if (has(/^WG/) || has(/^WH/)) return 'White Gold';
  if (has(/^RG/)) return 'Rose Gold';
  if (has(/^YGP$/) || has(/^GP$/) || has(/GOLDPLATED?/)) return 'Gold Plated';
  if (has(/^Y?G?18/) || has(/^18K?$/)) return '18k Gold';
  if (has(/^Y?G?14/) || has(/^14K?$/)) return '14k Gold';
  if (has(/VERMEIL/) || has(/^V$/)) return 'Vermeil';
  if (has(/^S$/) || has(/SILVER/)) return 'Silver';
  // fall back to the description
  const d = (desc || '').toLowerCase();
  if (/platinum/.test(d)) return 'Platinum';
  if (/white gold|white 14k|white 18k/.test(d)) return 'White Gold';
  if (/rose gold/.test(d)) return 'Rose Gold';
  if (/gold plated|vermeil/.test(d)) return 'Gold Plated';
  if (/18k|18 k/.test(d)) return '18k Gold';
  if (/14k|14 k/.test(d)) return '14k Gold';
  if (/silver/.test(d)) return 'Silver';
  return '';
}

// ── Legacy catalogue links (productId → salesCode in products.js CODE_MAP) ────
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

// ── CSV (mirrors scripts/build-inventory.mjs) ────────────────────────────────
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

const num = (v) => (v == null || v === '' ? null : (isNaN(Number(v)) ? null : Number(v)));
const money = (v) => {
  const cleaned = String(v == null ? '' : v).replace(/[^0-9.]/g, '');
  return cleaned === '' ? null : Number(cleaned);
};
function jsonRow(r) {
  return {
    sku: r.sku, code: r.code, name: r.name || '', category: r.category, material: r.material,
    qty: num(r.qty), cost: num(r.cost), retail: num(r.retail),
    productId: r.productId || null, productIds: r.productIds || [],
  };
}

// ── Load existing ledger (the CSV is a superset of the JSON: it also keeps the
//    per-SKU image count, so we merge on top of the CSV to lose nothing) ───────
async function readLedgerRows() {
  if (!existsSync(OUT_CSV)) return [];
  const table = parseCsv(await readFile(OUT_CSV, 'utf8')).filter((r) => r.length && r.some((c) => c !== ''));
  if (table.length < 2) return [];
  const head = table[0].map((h) => h.trim());
  const col = (r, name) => { const i = head.indexOf(name); return i >= 0 ? (r[i] ?? '') : ''; };
  return table.slice(1).map((r) => ({
    sku: col(r, 'sku').trim(),
    code: col(r, 'code').trim(),
    name: col(r, 'name'),
    category: col(r, 'category').trim(),
    material: col(r, 'material').trim(),
    qty: col(r, 'qty').trim(),
    cost: col(r, 'cost').trim(),
    retail: col(r, 'retail').trim(),
    _images: col(r, 'images').trim(),
    productIds: col(r, 'productIds').trim().split(/\s+/).filter(Boolean),
  })).filter((r) => r.sku);
}

// ── Parse the 2025 catalogue sheet ───────────────────────────────────────────
async function readCatalogue(file) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!existsSync(abs)) { console.error(`✗ Catalogue not found: ${abs}`); process.exit(1); }
  const table = parseCsv(await readFile(abs, 'utf8')).filter((r) => r.length && r.some((c) => c !== ''));
  if (table.length < 2) { console.error('✗ Catalogue has no data rows.'); process.exit(1); }
  const head = table[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => head.findIndex((h) => h.includes(name));
  const iCode = idx('sales'), iDesc = idx('description'), iUsd = idx('usd'), iNgu = idx('ngultrum');
  const rows = [];
  for (const r of table.slice(1)) {
    const raw = (r[iCode] ?? '').trim();
    if (!raw) continue;
    rows.push({
      raw,
      sku: niceSku(raw),
      description: (r[iDesc] ?? '').trim().replace(/\s+/g, ' '),
      usd: money(r[iUsd]),
      ngultrum: money(iNgu >= 0 ? r[iNgu] : ''),
    });
  }
  return rows;
}

async function main() {
  const codeMap = await readCodeMap();
  const ledger = await readLedgerRows();
  const catalogue = await readCatalogue(SOURCE);

  // Index existing ledger rows by both canonical keys.
  const byStrip = new Map(), bySort = new Map();
  for (const row of ledger) {
    byStrip.set(stripKey(row.sku), row);
    bySort.set(sortKey(row.sku), row);
  }
  const findExisting = (sku) => byStrip.get(stripKey(sku)) || bySort.get(sortKey(sku)) || null;

  const report = { updated: 0, added: 0, nameChanged: 0, priceChanged: 0,
                   dupSkipped: [], catDupes: [], conflicts: [] };
  const seen = new Map(); // canonical (strip) → catalogue sku already processed this run

  for (const c of catalogue) {
    // Intra-sheet de-duplication.
    const sk = stripKey(c.sku);
    if (seen.has(sk)) { report.catDupes.push(`${c.raw}  (≡ ${seen.get(sk)})`); continue; }
    seen.set(sk, c.raw);

    const existing = findExisting(c.sku);
    if (existing) {
      // Surface a description-noun vs ledger-category mismatch for human review
      // (e.g. a "bangle" written under a B0xx bracelet code) — but never drop data.
      const noun = categoryFromText(c.description);
      if (noun && existing.category && noun !== existing.category) {
        report.conflicts.push(`${existing.sku}: sheet text reads "${noun}" but ledger says "${existing.category}" — ${c.description.slice(0, 60)}`);
      }
      if ((existing.name || '') !== c.description && c.description) report.nameChanged++;
      const newRetail = c.usd == null ? existing.retail : String(c.usd);
      if (String(existing.retail || '') !== String(newRetail || '')) report.priceChanged++;

      if (c.description) existing.name = c.description;            // authoritative description
      if (c.usd != null) existing.retail = String(c.usd);          // authoritative USD retail
      if (!existing.category) existing.category = inferCategory(existing.sku, c.description);
      if (!existing.material) existing.material = inferMaterial(existing.sku, c.description);
      // cost, qty, images, code, sku: left exactly as they were.
      report.updated++;
    } else {
      const sku = c.sku;
      ledger.push({
        sku,
        code: deriveCode(sku),
        name: c.description,
        category: inferCategory(sku, c.description),
        material: inferMaterial(sku, c.description),
        qty: '', cost: '', retail: c.usd == null ? '' : String(c.usd),
        _images: '',
        productIds: [],
        _new: true,
      });
      // keep the indexes fresh so later sheet rows can still de-dup against this
      byStrip.set(stripKey(sku), ledger[ledger.length - 1]);
      bySort.set(sortKey(sku), ledger[ledger.length - 1]);
      report.added++;
    }
  }

  // Advisory: a brand-new sheet SKU that shares a base code + material with a
  // PRE-EXISTING priced ledger line may be the same item under a renamed code
  // (e.g. "…-RR" vs "…-SRB"). Kept separate (codes genuinely differ) but listed.
  const priorByCodeMat = new Map();
  for (const row of ledger) {
    if (row._new) continue;
    priorByCodeMat.set(`${row.code}|${row.material}`, row);
  }
  for (const row of ledger) {
    if (!row._new) continue;
    const twin = priorByCodeMat.get(`${row.code}|${row.material}`);
    if (twin && num(twin.retail) != null) {
      report.overlaps = report.overlaps || [];
      report.overlaps.push(`${row.sku}  (new)  ↔  ${twin.sku}  (existing, $${twin.retail})  — same ${row.code} / ${row.material}`);
    }
  }

  // Re-derive catalogue links from CODE_MAP for every row (as build-inventory does).
  for (const row of ledger) {
    const { productId, productIds } = linksFor(row.sku, codeMap);
    row.productId = productId; row.productIds = productIds;
  }

  ledger.sort((a, b) => naturally(a.sku, b.sku));

  // ── Final no-duplicate assertion ───────────────────────────────────────────
  const exact = new Map(), strip = new Map(), sort = new Map();
  const residual = [];
  for (const r of ledger) {
    for (const [label, map, key] of [['sku', exact, r.sku], ['stripKey', strip, stripKey(r.sku)], ['sortKey', sort, sortKey(r.sku)]]) {
      if (map.has(key)) residual.push(`${label} clash: "${r.sku}" ≡ "${map.get(key)}"`);
      else map.set(key, r.sku);
    }
  }
  if (exact.size !== ledger.length) {
    console.error('✗ Exact duplicate SKUs in result — aborting.');
    residual.forEach((m) => console.error('   ' + m));
    process.exit(1);
  }

  // ── Cleaned, de-duped catalogue sheet (preserves Ngultrum) ─────────────────
  const catOut = [['salesCode', 'description', 'usd', 'ngultrum'].join(',')];
  const catRows = [];
  const catSeen = new Set();
  for (const c of catalogue) {
    const sk = stripKey(c.sku);
    if (catSeen.has(sk)) continue;
    catSeen.add(sk);
    catRows.push(c);
  }
  catRows.sort((a, b) => naturally(a.sku, b.sku));
  for (const c of catRows) {
    catOut.push([csvEsc(c.sku), csvEsc(c.description), c.usd == null ? '' : c.usd, c.ngultrum == null ? '' : c.ngultrum].join(','));
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`Catalogue source : ${path.relative(process.cwd(), path.resolve(SOURCE))}`);
  console.log(`  ${catalogue.length} sheet rows → ${catRows.length} unique items` +
    (report.catDupes.length ? ` (${report.catDupes.length} in-sheet duplicate(s) collapsed)` : ''));
  console.log(`Ledger           : ${report.updated} updated · ${report.added} added · ${ledger.length} total`);
  console.log(`  ${report.nameChanged} name(s) set/changed · ${report.priceChanged} price(s) set/changed`);
  if (report.catDupes.length) {
    console.log(`\n  In-sheet duplicates collapsed:`);
    report.catDupes.forEach((m) => console.log('    • ' + m));
  }
  if (report.conflicts.length) {
    console.log(`\n  ⚠ Review — description/category mismatches (kept ledger category, applied sheet name+price):`);
    report.conflicts.forEach((m) => console.log('    • ' + m));
  }
  if (report.overlaps && report.overlaps.length) {
    console.log(`\n  ⚠ Possible overlaps — new sheet code vs existing priced line (distinct codes, both kept):`);
    report.overlaps.forEach((m) => console.log('    • ' + m));
  }
  if (residual.length) {
    console.log(`\n  ⚠ Residual near-duplicate keys (manual review):`);
    residual.forEach((m) => console.log('    • ' + m));
  }
  const noRetail = ledger.filter((r) => num(r.retail) == null).length;
  if (noRetail) console.log(`\n  note: ${noRetail} ledger SKU(s) still have no retail price (not in the 2025 sheet).`);

  if (DRY) { console.log('\nDry run — nothing written.'); return; }

  await writeFile(OUT_JSON, JSON.stringify(ledger.map(jsonRow), null, 2) + '\n');
  await writeFile(OUT_CSV, toCsv(ledger));
  await writeFile(OUT_CATALOGUE, catOut.join('\n') + '\n');
  console.log(`\nWrote:`);
  console.log(`  ${path.relative(process.cwd(), OUT_JSON)}   (master — the app reads this)`);
  console.log(`  ${path.relative(process.cwd(), OUT_CSV)}   (reviewable mirror)`);
  console.log(`  ${path.relative(process.cwd(), OUT_CATALOGUE)}   (cleaned 2025 sheet, incl. Ngultrum)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
