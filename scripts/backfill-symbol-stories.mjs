#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Backfill the per-product "Story Behind" (catalogueOverrides/{id}.story) with
// the studio's canonical symbol meanings — CONTENT ONLY, no schema or code
// changes. Every product whose name/subtitle clearly identifies one sacred
// symbol receives that symbol's canonical text; products that already have a
// story are NEVER touched, and products that can't be classified with
// confidence are left alone and listed in the report.
//
//   node scripts/backfill-symbol-stories.mjs --dry-run        # classify + report, writes nothing
//   node scripts/backfill-symbol-stories.mjs                  # apply (Admin SDK credentials required)
//   node scripts/backfill-symbol-stories.mjs --report out.json# also save the full per-item report
//
// Where the current stories come from:
//   • --dry-run reads the live catalogueOverrides through Firestore's public
//     REST endpoint (reads are public by rule), so a preview needs NO
//     credentials at all.
//   • a real run reads and writes through the Firebase Admin SDK. Right before
//     each write the document is re-checked, so a story typed in the admin
//     while this script runs is never clobbered.
//
// Which items are considered (same universe the storefront builds from,
// lib/data/site-data.js):
//   • catalogue products p001…        (lib/data/products.js RAW)
//   • live-site extras   x001…        (lib/data/site-data.js SITE_EXTRA)
//   • standalone stock-ledger SKUs    (lib/data/stock-ledger.json rows with no
//                                      productIds — they publish under their SKU)
//   • studio-created custom items c…  (override docs flagged _custom)
// Items marked deleted/mergedInto are skipped (the master listing carries the
// story). A catalogue product linked to a ledger SKU counts as "has a story"
// when EITHER doc carries one — mirroring mergedCatalogueOverride().
//
// "Empty" means the resolved story is missing or whitespace-only. The write is
// a merge-set of { story, _updated } — no other field is touched.
//
// ── Credentials (apply mode only — same as the other seed scripts) ──────────
//   • GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json  (recommended)
//   • FIREBASE_SERVICE_ACCOUNT=/path/to/serviceAccount.json
//   • FIREBASE_SERVICE_ACCOUNT='{ ...inline JSON... }'
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { firebaseConfig } from '../lib/firebase-config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const REPORT_PATH = ARGS.includes('--report') ? ARGS[ARGS.indexOf('--report') + 1] : '';

// ── The canonical symbol meanings (studio-approved texts) ────────────────────
// `match` — regex fragments tested (case-insensitively) against a product's
// name + subtitle. Order in this list is NOT precedence; every symbol is
// tested and ambiguities are resolved by the dominance rules further down.
// `stone` — gemstone/material entries lose to any motif match, because stones
// routinely appear in the subtitle of a motif piece ("Bumpa Pendant Turquoise").
const SYMBOLS = [
  {
    key: 'endless-knot', label: 'Endless Knot',
    match: ['endless\\s+knot', '(infinity|infinite|eternal)\\s+knot', 'shrivatsa', 'pelbe[\\s-]?u', 'palbeu'],
    story: 'The intertwining of lines reminds us that all events are conjoined together in a cycle of cause and effect. The knot also represents the binding to our karmic destiny. Since there is no beginning or end, it also symbolizes the infinite wisdom of the Buddha.',
  },
  {
    key: 'double-vajra', label: 'Double Vajra',
    match: ['double\\s+(vajras?|dorjes?)', 'vishva[\\s-]?vajras?', 'crossed\\s+vajras?'],
    story: 'The Double Vajra (Vishva Vajra) is formed from four lotus-mounted vajras radiating from a central hub toward the four directions, representing absolute stability. It is a central element of the Bhutanese National Emblem. In Buddhist cosmology it supports the universe itself, and in mandalas it forms the immovable foundation of the sacred palace. Its five points correspond to the five elements and the Five Buddha Families. It is also associated with Amoghasiddhi and his all-accomplishing wisdom.',
  },
  {
    key: 'vajra', label: 'Vajra',
    match: ['\\bvajras?\\b', '\\bdorjes?\\b'],
    story: 'The Vajra represents strength, resilience and the indestructible nature of mind, as well as the awakened qualities of the Buddha. Throughout the Himalayan world it serves as a reminder of the adamantine qualities of our true nature.',
  },
  {
    key: 'hung', label: 'Hung',
    match: ['\\bhung\\b'],
    story: 'HUNG represents the awakened mind and the indivisible union of wisdom and awareness. Its five components symbolize the Five Primordial Wisdoms, making it a reminder of the mind’s innate awakened nature.',
  },
  {
    key: 'tam', label: 'Tam',
    match: ['\\btam\\b', '\\btara\\b'],
    story: 'TAM is the heart syllable of Green Tara and represents her compassionate, protective activity. It embodies courage, loving care and liberation from fear.',
  },
  {
    key: 'bumpa', label: 'Bumpa / Tshe-Bum',
    match: ['\\bbumpa\\b', 'treasure\\s+vase', 'tshe[\\s-]?bum', '(longevity|long\\s*life)\\s+vase'],
    story: 'The Treasure Vase symbolizes inexhaustible abundance, longevity, wisdom and prosperity. Filled with precious substances, it represents the limitless qualities of the awakened mind.',
  },
  {
    key: 'phurba', label: 'Phurba',
    match: ['\\bphurba\\b', 'kilaya'],
    story: 'The Phurba is a ritual implement symbolizing the removal of outer, inner and secret obstacles. It represents the power to cut through negativity and transform obstacles into wisdom.',
  },
  {
    key: 'drigug', label: 'Drigug',
    match: ['\\bdrigug\\b', '\\bkartika\\b'],
    story: 'The Drigug (Kartika) symbolizes cutting through ego-clinging, attachment and delusion, revealing the freedom of awakened wisdom.',
  },
  {
    key: 'bell', label: 'Bell',
    match: ['\\bbell\\b', '\\bdrilbu\\b'],
    story: 'The Bell represents wisdom, openness and emptiness. Together with the Vajra it symbolizes the inseparable union of wisdom and skillful means.',
  },
  {
    key: 'samaya', label: 'Samaya',
    match: ['\\bsamaya\\b'],
    story: 'Samaya means sacred commitment. It represents integrity, devotion and the unwavering commitment to one’s path.',
  },
  {
    key: 'wrathful', label: 'Wrathful Symbols',
    match: ['\\bskulls?\\b', '\\bmahakala\\b', 'wrathful'],
    story: 'Wrathful symbols represent the transformation of fear, anger and the afflictive emotions into awakened wisdom. Rather than destruction, they symbolize fearless compassion and the power of inner transformation.',
  },
  {
    key: 'om', label: 'OM',
    match: ['\\bom\\b'],
    story: 'OM represents wholeness, primordial sound and the enlightened body, speech and mind. It symbolizes the totality of awakened experience.',
  },
  {
    key: 'hri', label: 'HRI',
    match: ['\\bhrih?\\b'],
    story: 'HRI is the heart syllable of the Lotus Family and is associated with compassion, love and enlightened activity.',
  },
  {
    key: 'bam', label: 'BAM',
    match: ['\\bbam\\b'],
    story: 'BAM is the seed syllable of Vajrayogini and Yeshe Tsogyal, representing fierce wisdom, transformative insight and awakened feminine energy.',
  },
  {
    key: 'a', label: 'A',
    match: ['\\bah?\\s+syllable\\b', '\\bsyllable\\s+ah?\\b'],
    story: 'The syllable A symbolizes primordial purity, unborn awareness and the ultimate nature of reality. It is especially significant in the Dzogchen tradition.',
  },
  {
    key: 'dhi', label: 'DHI',
    match: ['\\bdhi\\b'],
    story: 'DHI is the seed syllable of Manjushri and represents wisdom, intelligence and insight.',
  },
  {
    key: 'mani', label: 'Mani Mantra',
    match: ['\\bmani\\b'],
    story: 'The Mani Mantra, OM MANI PADME HUNG, embodies the compassion of Avalokiteshvara and serves as a reminder to cultivate kindness, wisdom and compassion.',
  },
  {
    key: 'blue-poppy', label: 'Blue Poppy',
    match: ['\\bpoppy\\b'],
    story: 'The Blue Poppy is the national flower of Bhutan and symbolizes the country’s unique natural beauty, resilience and cultural identity.',
  },
  {
    key: 'dharmachakra', label: 'Dharmachakra',
    match: ['dharma\\s*chakra', 'dharma\\s+wheel', 'wheel\\s+of\\s+dharma'],
    story: 'The Wheel of Dharma represents the Buddha’s teachings and the Noble Eightfold Path leading to awakening.',
  },
  {
    key: 'melong', label: 'Melong',
    match: ['\\bmelong\\b'],
    story: 'The Melong symbolizes the clear, reflective nature of mind, which remains unstained while perfectly reflecting all appearances.',
  },
  {
    key: 'buddha', label: 'Buddha',
    match: ['\\bbuddha\\b'],
    story: 'The Buddha represents awakening, wisdom and compassion, reminding us of our own potential for enlightenment.',
  },
  {
    key: 'coral', label: 'Coral', stone: true,
    match: ['\\bcoral\\b'],
    story: 'Red Coral symbolizes vitality, longevity, magnetizing activity and auspiciousness. In Himalayan traditions it is valued as both a precious gemstone and a spiritual support.',
  },
  {
    key: 'turquoise', label: 'Turquoise', stone: true,
    match: ['\\bturquoise\\b'],
    story: 'Turquoise symbolizes protection, healing and wellbeing, and has been treasured throughout the Himalayas for centuries as a stone of strength and good fortune.',
  },
  {
    key: 'amber', label: 'Amber', stone: true,
    match: ['\\bamber\\b'],
    story: 'Amber is fossilized tree resin formed over millions of years. Traditionally it symbolizes warmth, healing and the life-giving energy of nature.',
  },
];
const SYMBOL_BY_KEY = Object.fromEntries(SYMBOLS.map((s) => [s.key, s]));

// ── Classification ───────────────────────────────────────────────────────────
// Collect EVERY symbol whose pattern hits, then thin the set with dominance
// rules for the known containments. If exactly one candidate survives, the
// item is classified; zero → unmatched; two or more → ambiguous. Both of the
// latter are reported and left untouched — never guessed.
const DOMINATES = {
  'double-vajra': ['vajra'],            // "Double Dorje" also hits the bare vajra pattern
  phurba: ['vajra'],                    // "Vajrakilaya" contains vajra
  mani: ['om', 'hung', 'a', 'hri'],     // "OM MANI PADME HUNG" spells out its syllables
};

function classify(text) {
  // "Vajra Guru Mantra" is Guru Rinpoche's mantra, not the vajra implement —
  // there is no canonical text for it, so the phrase must not trip the Vajra
  // matcher. Blank it out before matching.
  const t = String(text || '').replace(/vajra\s+guru\s+mantra/gi, ' ');
  let hits = SYMBOLS.filter((s) => s.match.some((m) => new RegExp(m, 'i').test(t))).map((s) => s.key);
  for (const [winner, losers] of Object.entries(DOMINATES)) {
    if (hits.includes(winner)) hits = hits.filter((k) => k === winner || !losers.includes(k));
  }
  // A motif beats a gemstone: the stone is usually just the piece's material.
  if (hits.some((k) => !SYMBOL_BY_KEY[k].stone)) hits = hits.filter((k) => !SYMBOL_BY_KEY[k].stone);
  if (hits.length === 1) return { symbol: hits[0] };
  return { symbol: null, reason: hits.length ? `ambiguous: ${hits.join(' + ')}` : 'no symbol matched' };
}

// ── Catalogue extraction (same technique as scripts/seed-explore.mjs) ────────
// The lib data modules can't be imported directly under plain Node (their
// import chain pulls in a JSON module), so read the literal tables out of the
// source. Each item carries the override id its story must live under.
async function loadItems() {
  const items = []; // { id, name, sub, linkedSku? }
  const productsSrc = await readFile(path.join(ROOT, 'lib/data/products.js'), 'utf8');
  const rawMatch = productsSrc.match(/const RAW = \[([\s\S]*?)\n\];/);
  if (rawMatch) {
    new Function(`return [${rawMatch[1]}]`)() // [id, name, sub, file, tag, category, hue]
      .forEach(([id, name, sub]) => items.push({ id, name: name || '', sub: sub || '' }));
  }
  const siteSrc = await readFile(path.join(ROOT, 'lib/data/site-data.js'), 'utf8');
  const extraMatch = siteSrc.match(/const SITE_EXTRA = \[([\s\S]*?)\n\];/);
  if (extraMatch) {
    new Function(`return [${extraMatch[1]}]`)() // [id, name, sub, file, category]
      .forEach(([id, name, sub]) => items.push({ id, name: name || '', sub: sub || '' }));
  }
  if (!items.length) throw new Error('Could not extract the catalogue tables from lib/data — aborting.');

  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const ledger = JSON.parse(await readFile(path.join(ROOT, 'lib/data/stock-ledger.json'), 'utf8'));
  for (const row of ledger) {
    if (!row || !row.sku) continue;
    if (Array.isArray(row.productIds) && row.productIds.length) {
      // Linked line: the piece lists under its catalogue product(s); remember
      // the SKU so a story already saved under it counts as existing content.
      row.productIds.forEach((pid) => { if (byId[pid] && !byId[pid].linkedSku) byId[pid].linkedSku = row.sku; });
    } else if (!byId[row.sku]) {
      items.push({ id: row.sku, name: row.name || '', sub: row.material || '' });
      byId[row.sku] = items[items.length - 1];
    }
  }
  return items;
}

// ── Current overrides ────────────────────────────────────────────────────────
// Dry-run: Firestore public REST (catalogueOverrides reads are public by rule).
async function fetchOverridesRest() {
  const base = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/catalogueOverrides`;
  const fromVal = (v) => {
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromVal(x)]));
    return null;
  };
  const out = {};
  let pageToken = '';
  do {
    const url = `${base}?pageSize=300&key=${firebaseConfig.apiKey}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore REST read failed: HTTP ${res.status}`);
    const j = await res.json();
    for (const d of j.documents || []) {
      const id = decodeURIComponent(d.name.split('/').pop());
      out[id] = Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromVal(v)]));
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

// Apply mode: Admin SDK (same credential handling as scripts/seed-explore.mjs —
// a pointed-to key file that does not exist is a hard error, and a service
// account from a different project is refused).
async function loadCredential(admin) {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    const sa = JSON.parse(inline);
    return { credential: admin.cert(sa), saProject: sa.project_id || '' };
  }
  const file = inline || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    if (!existsSync(file)) {
      throw new Error(`Service-account file not found: ${file} — fix FIREBASE_SERVICE_ACCOUNT / GOOGLE_APPLICATION_CREDENTIALS (refusing to fall back to application-default credentials).`);
    }
    const sa = JSON.parse(await readFile(file, 'utf8'));
    return { credential: admin.cert(sa), saProject: sa.project_id || '' };
  }
  return { credential: admin.applicationDefault(), saProject: '' };
}

const hasStory = (o) => !!(o && typeof o.story === 'string' && o.story.trim());
const label = (it) => `${it.id}  ${[it.name, it.sub].filter(Boolean).join(' — ')}`;

async function main() {
  const items = await loadItems();
  console.log(`Backfill plan: ${items.length} base item(s) · ${SYMBOLS.length} symbol texts · ${DRY ? 'DRY RUN' : 'APPLY'}\n`);

  let db = null;
  let overrides;
  if (DRY) {
    overrides = await fetchOverridesRest();
  } else {
    const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
    const { credential, saProject } = await loadCredential({ cert, applicationDefault });
    if (saProject && saProject !== projectId) {
      throw new Error(`Service account belongs to project "${saProject}" but the backfill targets "${projectId}" — nothing written.`);
    }
    console.log(`Target Firebase project: ${projectId}`);
    initializeApp({ credential, projectId });
    db = getFirestore();
    overrides = {};
    (await db.collection('catalogueOverrides').get()).forEach((doc) => { overrides[doc.id] = doc.data(); });
  }

  // Studio-created custom items exist only in the override layer.
  for (const [id, o] of Object.entries(overrides)) {
    if (o && o._custom && !items.some((i) => i.id === id)) {
      items.push({ id, name: o.name || '', sub: o.sub || '' });
    }
  }

  const report = { updated: [], skippedExisting: [], unclassified: [] };
  for (const it of items) {
    const own = overrides[it.id];
    if (own && (own.deleted || (own.mergedInto && own.mergedInto !== it.id))) continue;

    // Admin overrides may rename a piece — classify the name the studio sees.
    const name = own && own.name != null && String(own.name).trim() ? own.name : it.name;
    const sub = own && own.sub != null && String(own.sub).trim() ? own.sub : it.sub;
    const { symbol, reason } = classify(`${name} ${sub}`);

    const existing = hasStory(own) || (it.linkedSku && hasStory(overrides[it.linkedSku]));
    if (existing) {
      // Only interesting for the report when we WOULD have written something.
      if (symbol) report.skippedExisting.push({ id: it.id, name, sub, symbol });
      continue;
    }
    if (!symbol) {
      report.unclassified.push({ id: it.id, name, sub, reason });
      continue;
    }

    if (!DRY) {
      const ref = db.doc(`catalogueOverrides/${it.id}`);
      const fresh = (await ref.get()).data();
      if (hasStory(fresh)) { report.skippedExisting.push({ id: it.id, name, sub, symbol }); continue; }
      await ref.set({ story: SYMBOL_BY_KEY[symbol].story, _updated: Date.now() }, { merge: true });
    }
    report.updated.push({ id: it.id, name, sub, symbol });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const bySymbol = {};
  report.updated.forEach((r) => { bySymbol[r.symbol] = (bySymbol[r.symbol] || 0) + 1; });
  console.log(`${DRY ? 'Would update' : 'Updated'} ${report.updated.length} product(s):`);
  SYMBOLS.forEach((s) => { if (bySymbol[s.key]) console.log(`  ${s.label.padEnd(20)} ${String(bySymbol[s.key]).padStart(3)}`); });
  console.log(`\nSkipped (already have a story): ${report.skippedExisting.length}`);
  report.skippedExisting.forEach((r) => console.log(`  ${label(r)}`));
  console.log(`\nNot confidently classified (untouched): ${report.unclassified.length}`);
  report.unclassified.forEach((r) => console.log(`  ${label(r)}   [${r.reason}]`));
  if (DRY) console.log('\nDry run — nothing written.');

  if (REPORT_PATH) {
    await writeFile(path.resolve(REPORT_PATH), JSON.stringify(report, null, 2) + '\n');
    console.log(`\nFull report saved → ${REPORT_PATH}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
