#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Standardize every catalogue item's NAME and SUBTITLE — CONTENT ONLY.
//
// Naming rules (studio decision):
//   • The name proper is ONE clean line that fits the product-page header:
//     the motif/design only, Title Case, with the size indicator kept in the
//     name after a comma — "Hung Syllable, Large", "Bell, Small".
//   • The item's own category (Pendant/Earrings/Ring/…) is NOT repeated in
//     the name — the category is self-explanatory on the site.
//   • Everything technical moves to the SUBTITLE: metal, stones & carats,
//     enamel, leather, finish, weight, dimensions, chain length, notes.
//
//   node scripts/standardize-names.mjs --dry-run          # report only (public REST, no credentials)
//   node scripts/standardize-names.mjs                    # apply (Admin SDK credentials required)
//   node scripts/standardize-names.mjs --csv plan.csv     # save the before/after table
//
// The write is a merge-set of { name, sub, _updated } on catalogueOverrides —
// stories, images, prices etc. are never touched. Items whose parsed name
// comes out empty or overlong are NOT written; they are listed under
// "needs attention" unless a curated entry exists in MANUAL below.
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
import { detectMaterial } from '../lib/data/materials.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const CSV_PATH = ARGS.includes('--csv') ? ARGS[ARGS.indexOf('--csv') + 1] : '';

// ── Curated names ────────────────────────────────────────────────────────────
// The automatic parser handles the regular patterns; the entries below pin the
// lines it cannot split confidently. Reviewed by hand — edit freely before
// applying.
const MANUAL = {
  p006:             { name: 'Intricate Turquoise',                 sub: '14k Yellow Gold, Turquoise, Diamonds' },
  p024:             { name: 'Oval Turquoise',                      sub: '14k Yellow Gold, Diamonds' },
  p051:             { name: 'Single Auspicious Pair of Fish',      sub: 'Solid Gold' },
  'P026-YG18':      { name: 'Bell',                                sub: '18k Yellow Gold, Diamond .025cts, 8.31g, Pendant only' },
  'R047-YG18':      { name: 'Band, Vajra & Bell Engravings',       sub: '18k Yellow Gold, Sizes 50–61' },
  'R047-WG18':      { name: 'Band, Bell Engravings',               sub: '18k White Gold, Sizes 50–54' },
  'R045-YG18':      { name: 'Band, Brushed & Polished',            sub: '18k Yellow Gold, 4.14g, Female Size' },
  'R025A-YG18':     { name: 'Dorje & Bell Wedding Bands, Pair',    sub: '18k Yellow Gold, 4 Diamonds, Sanded Finish, Inside Engraving, approx 17g' },
  'R025C-YG18':     { name: 'Dorje & Bell Wedding Bands, Pair',    sub: '18k Yellow Gold, 14 Diamonds, Brushed Finish, Protruding Design, Inside Engraving, approx 19g' },
  'R019A-WG18':     { name: 'Infinity Eternity Band',              sub: '18k White Gold, 6g, Male Size (59–60)' },
  'R020-YG18':      { name: 'Infinity Knot Eternal Band, Thin',    sub: '18k Yellow Gold, With Background, 4.7g, Female Size (51–55)' },
  'R020B-YG18':     { name: 'Infinity Knot Eternal Band',          sub: '18k Yellow Gold, Full Diamonds .13cts, 5.01g, Female Size (51–55)' },
  'R044-YG18-TQ':   { name: 'Oval Turquoise Diamond',              sub: '18k Yellow Gold, Turquoise 3.25cts, Diamonds .28cts, Endless Knot Gallery, 3.86g' },
  'N004-YG18-DIA':  { name: 'Vajra',                               sub: '18k Yellow Gold, Diamonds .24cts, With Chain 45–50cm, 20.9g' },
  'N006-AMB-B':     { name: 'Amber Bead, with Vajras',             sub: '14k Yellow Gold, Amber, Chain 55cm, 13.4g' },
  'N022-YG18-COR':  { name: 'Life Force Coral',                    sub: '18k Yellow Gold, Coral, Diamonds .77cts, 20.24g' },
  'P047B-YG14':     { name: 'Phurba, Medium',                      sub: '14k Yellow & White Gold, 4.98g, Pendant only' },
  'E017-YG14-TQ':   { name: 'Turquoise',                           sub: '14k Yellow Gold 9.1g, Diamonds .21cts, Total 13.72g' },
  'EXT 15cm-YG14':  { name: 'Chain Extension, 15cm',               sub: '14k Yellow Gold, adjustable to 10cm and 5cm, 0.92g' },
  'EXT 15cm-YG18':  { name: 'Chain Extension, 15cm',               sub: '18k Yellow Gold, 1.15g' },
  'CA040-YG14':     { name: 'Chain CA040',                         sub: '14k Yellow Gold, 2.66g' },
  'CC028-RG14-45':  { name: 'Chain CC028, 45cm',                   sub: '14k Rose Gold, Spring-lock' },
  'CC028-YG14':     { name: 'Chain CC028, 38–45cm',                sub: '14k Yellow Gold, 1.64g' },
  'CC3100':         { name: 'Chain CC3100, 45cm',                  sub: 'Silver, 1.47g' },
  'CH040-YGP':      { name: 'Chain CH040',                         sub: 'Gold Plated' },
  'CH060-S':        { name: 'Chain CH060, 45cm',                   sub: 'Silver, 7.31g' },
  '4022A.6G':       { name: 'Oval Malaya Aquamarine',              sub: '14k White Gold, 2.54g' },
  'R049-YG18-BS':   { name: 'Double Shank Diamond',                sub: '18k Yellow Gold, Diamonds .23cts, Blue Sapphire' },
  'E023-YG14-TQ':   { name: 'Double Dorje & Endless Knot',         sub: '14k Gold, Blue Sapphire & Turquoise, 10.07g' },
  'E052-YG14-AMB':  { name: 'Amber Bead, Lotus Cap & Bumpa Clasp', sub: '14k Yellow Gold, Amber' },
  'N014-YGP':       { name: 'Double Vajra, Endless Knot & Logo Layered', sub: 'Gold Plated' },
  'B008B-TT-BLK':   { name: 'Vajra Clasp, Two Tone',               sub: 'Oxidized Silver & 18k Gold Vajra, Sting-ray Leather, Noir' },
  'B008B-TT-SNOW':  { name: 'Vajra Clasp, Two Tone',               sub: 'Oxidized Silver & 18k Gold Vajra, Sting-ray Leather, Snow' },
  'B008B-S-BLK':    { name: 'Vajra Clasp',                         sub: 'Polished Silver, Sting-ray Leather, Noir' },
  'B008B-S-SNOW':   { name: 'Vajra Clasp',                         sub: 'Polished Silver, Sting-ray Leather, Natural' },
  'P036-S':         { name: 'Deity Gau Locket',                    sub: 'Silver, Sapphire Crystal, Openable, Replaceable Image, With Chain' },
  'P036-YGP':       { name: 'Deity Gau Locket',                    sub: 'Gold Plated, Sapphire Crystal, Openable, Replaceable Image, With Chain' },
  'R033-S-BDS':     { name: 'Kirtimukha (Tsipatta)',               sub: 'Silver, Black Diamonds, Yellow Sapphire .08cts, 20g' },
  'R005-S-YG14':    { name: 'Rahu',                                sub: 'Silver & 14k Yellow Gold, White Topaz, Black Diamonds, 2.8g' },
  'BA002-S':        { name: 'Infinity in the Middle Bangle',       sub: 'Silver, Stainless' },
  'BA002-YG14':     { name: 'Infinity in the Middle Bangle',       sub: '14k Yellow Gold, 5.2g' },
  'BA002-YGP':      { name: 'Infinity in the Middle Bangle',       sub: 'Gold Plated' },
  'C005-YG14':      { name: 'Phurba Mala Counter',                 sub: '14k Yellow Gold, 4.78g' },
  'C007-YGP':       { name: 'Phurba Mala Counter, Large',          sub: 'Vermeil Gold, 8.48g' },
  'C006-YG14':      { name: 'Drigug Mala Counter',                 sub: '14k Yellow Gold, 4.73g' },
  'C008-YGP':       { name: 'Drigug Mala Counter, Large',          sub: 'Gold Plated, 8.47g' },
  'N005B-YG14-DIA': { name: 'Vajra, Medium',                       sub: '14k Yellow Gold, Diamonds, 5 Prongs' },
};

// ── Vocabulary ───────────────────────────────────────────────────────────────
const CATEGORY_NOUN = {
  Pendants: 'pendants?', Earrings: 'ear\\s?rings?', Rings: 'rings?',
  Necklaces: 'necklaces?', Bracelets: 'bracelets?', Bangles: 'bangles?',
  Brooches: 'brooch(?:es)?', Cufflinks: 'cuff\\s?links?', Chains: 'chains?',
};

// Size words kept in the name (", Large"), normalised onto the studio scale.
const SIZE_MAP = {
  micro: 'Micro', small: 'Small', smaller: 'Small', mid: 'Medium',
  'mid size': 'Medium', 'mid-size': 'Medium', medium: 'Medium',
  large: 'Large', larger: 'Large', big: 'Large', xxl: 'XXL', jumbo: 'Jumbo',
};
const SIZE_RE = new RegExp(`(?:^|[\\s,(])(${Object.keys(SIZE_MAP).sort((a, b) => b.length - a.length).join('|')})(?=$|[\\s,.)])`, 'gi');

const STONE_COLOR = '(?:white|black|blue|red|green|yellow|purple|natural)';
const STONE_WORDS =
  '(?:cz\\s+diamonds?|cz|diamonds?|rubies|ruby|sapphires?|emeralds?|topaz|aquamarine|citrine|carnelian|onyx|agate|quartz|moonstone|mother\\s+of\\s+pearl|pearls?|lapis(?:\\s+lazuli)?|amber|coral|turquoise)';
const CARAT = '(?:[.\\d]+\\s*(?:cts?|carats?)\\.?)';

// Words that stay ALL-CAPS after title-casing.
const FORCE_CASE = { cz: 'CZ', xxl: 'XXL', '3d': '3D', mop: 'MOP' };
const SMALL_WORDS = new Set(['and', 'of', 'the', 'with', 'in', 'a', 'an', '&', 'to', 'on']);
// Tokens that may not survive at a name-segment's edge, plus whole segments
// that carry no meaning once the specs are gone.
const EDGE_JUNK = new Set(['with', 'and', 'a', 'an', 'the', '&', '+', 'of', 'in', 'to']);
const JUNK_SEGMENT = /^(?:[\d\s.+&:/-]*|size|sizes|total|weight|gold|set|design|ength)$/i;

const titleCase = (s) =>
  s.split(/\s+/).filter(Boolean).map((w, i) => {
    const clean = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (FORCE_CASE[clean]) return w.replace(/[a-z0-9]+/i, FORCE_CASE[clean]);
    if (i > 0 && SMALL_WORDS.has(clean)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');

const tidy = (s) => String(s || '')
  .replace(/\\+/g, ' ')
  .replace(/\s*,\s*/g, ', ')
  .replace(/(, )+/g, ', ')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[\s,.:;/-]+|[\s,.:;/-]+$/g, '')
  .trim();

// Title-case a spec phrase ("black diamonds .10 cts" → "Black Diamonds .10cts").
// A leading carat dot (".20cts") is significant and must not be trimmed away.
const specCase = (s) => titleCase(
  String(s || '').replace(/\s+/g, ' ').replace(/^[\s,:;/-]+|[\s,]+$/g, '').replace(/\.+$/g, ''),
).replace(/\s+(cts?)\b\.?/gi, '$1').replace(/[Cc]ts\b\.?/g, 'cts');

// ── Metal ────────────────────────────────────────────────────────────────────
// The sales code is the most reliable metal record for real SKUs; free text
// second; the ledger's material column third.
function metalFromCode(code) {
  const tokens = String(code || '').toUpperCase().split(/[-/ ]+/);
  for (const t of tokens) {
    if (t === 'S') return 'Silver';
    if (t === 'YGP' || t === 'GP') return 'Gold Plated';
    if (t === 'RGP') return 'Rose Gold Plated';
    if (t === 'PT') return 'Platinum';
    let m = t.match(/^(Y|W|R)?G(\d{2})?$/) || t.match(/^(Y|W|R)G(\d{2})$/) || t.match(/^(W|Y|R)H?(\d{2})$/);
    if (t.match(/^(\d{2})K(Y|W|R)?$/)) m = [t, t.slice(2, 3) || 'Y', t.slice(0, 2)];
    if (m && (m[2] || m[1])) {
      const colour = { Y: 'Yellow', W: 'White', R: 'Rose' }[m[1] || 'Y'] || 'Yellow';
      return m[2] ? `${m[2]}k ${colour} Gold` : `${colour} Gold`;
    }
    if (t === '14K') return '14k Yellow Gold';
    if (t === '18K') return '18k Yellow Gold';
  }
  return '';
}

const TEXT_HAS_METAL = /silver|gold|platinum|vermeil|plated|ygp|rgp/i;
function metalDisplay(text, code, material, codeFirst) {
  if (/vermeil/i.test(text)) return 'Vermeil Gold';
  if (/half\s+gold\s+plated/i.test(text)) return 'Silver, Half Gold Plated';
  const fromCode = metalFromCode(code);
  const fromText = TEXT_HAS_METAL.test(text)
    ? (() => {
        const m = detectMaterial(text, '');
        if (m === 'Silver 925') return 'Silver';
        if (m === 'Yellow Gold Plated') return 'Gold Plated';
        return m;
      })()
    : '';
  const fromMaterial = material
    ? (material === 'Silver' ? 'Silver' : material === 'Gold Plated' ? 'Gold Plated' : material)
    : '';
  const order = codeFirst ? [fromCode, fromText, fromMaterial] : [fromText, fromCode, fromMaterial];
  return order.find(Boolean) || 'Silver';
}

// ── The parser ───────────────────────────────────────────────────────────────
// Splits one messy title into { name, sub }. Specs are pulled out of the text
// into buckets first; the motif is whatever meaningful text remains.
function standardize({ name, sub, category, material, salesCode, codeFirst }) {
  let text = `${name || ''} ${sub || ''}`;
  const stones = []; const attrs = []; const dims = []; const notes = [];
  const grab = (bucket) => (re, fmt) => {
    text = text.replace(re, (...m) => {
      const v = typeof fmt === 'function' ? fmt(...m) : fmt;
      if (v) bucket.push(v);
      return ' ';
    });
  };
  const toStones = grab(stones); const toAttrs = grab(attrs);
  const toDims = grab(dims); const toNotes = grab(notes);

  // A gemstone within the first three words of the raw name is the subject of
  // the piece ("Turquoise Cabochon", "Purple Milk Quartz") and stays in it.
  const headWords = String(name || '').replace(/["“”']/g, '').split(/\s+/).slice(0, 3).join(' ').toLowerCase();

  text = text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // "EarringsSilver" → "Earrings Silver"
    .replace(/[“”]/g, '"').replace(/[’]/g, "'")
    .replace(/\bwhat\b/gi, ' ')          // ledger typo ("Bracelet what 18k gold")
    .replace(/\bCTS\.?/g, 'cts')
    .replace(/\bmala\s+tally\s+counter/gi, 'Mala Counter')
    .replace(/\bstudded\b/gi, ' ')
    .replace(/\bnew\b/gi, ' ');

  // Parenthesised notes: sizes are kept for the size pass; digit/metal/price
  // content is dropped; a single-word gloss stays in the name ("(Tsipatta)");
  // a longer gloss moves to the subtitle ("(Tashi Mannox Design)").
  text = text.replace(/\(([^)]*)\)/g, (all, inner) => {
    const t = inner.trim();
    if (/^(fe)?male size$/i.test(t)) { dims.push(t.replace(/\b\w/g, (c) => c.toUpperCase())); return ' '; }
    if (SIZE_MAP[t.toLowerCase()]) return `, ${t} `;
    if (/\d/.test(t) || /gold|silver|plated|vermeil|platinum/i.test(t)) return ' ';
    if (t.split(/\s+/).length > 1) { notes.push(titleCase(t)); return ' '; }
    return all; // one-word gloss — keep it
  });

  toNotes(/\btashi\s+mannox(\s+design)?\b/gi, 'Tashi Mannox Design');

  // Chain / dimensions / weight — before metals so "45cm Chain" is captured whole.
  toDims(/\bwith\s+chain\b[\s,]*((?:\d+(?:[-–]\d+)*\s*cm)?)/gi, (a, len) => (len ? `With Chain ${len.replace(/\s+/g, '')}` : 'With Chain'));
  toDims(/\bwith\s+(\d+(?:[-–]\d+)*\s*cm)\s+chain\b/gi, (a, len) => `With Chain ${len.replace(/\s+/g, '')}`);
  toDims(/\bchain\s+(?:length\s+)?(\d+(?:[-–]\d+)*\s*cm)\b/gi, (a, len) => `Chain ${len.replace(/\s+/g, '')}`);
  toDims(/\b\d+(?:[-–]\d+)*(?:\.\d+)?\s*cm\b/gi, (a) => a.replace(/\s+/g, ''));
  toDims(/\b\d+(?:\.\d+)?\s*mm\b/gi, (a) => a.replace(/\s+/g, ''));
  toDims(/\b(?:total\s+weight\s+|gold\s+weight\s+|approx\.?\s*)?(\d+(?:\.\d+)*)\.?\s*(?:g|grams?)\b\.?:?/gi, (a, n) => `${n}g`);
  toDims(/\bsizes?\s*[:#]?\s*\d+(?:\s*[-–]\s*\d+)?\b/gi, (a) => a.replace(/\s+/g, ' ').trim().replace(/^s/, 'S'));
  toDims(/\b(fe)?male\s+size\b/gi, (a) => a.replace(/\b\w/g, (c) => c.toUpperCase()));
  toDims(/\bregular\s+size\b/gi, 'Regular Size');

  // Stones — optional leading count/qualifier, colour pair, trailing or
  // leading carats. A stone in the motif head stays in the name.
  const stoneRe = new RegExp(
    `(?:${CARAT}\\s+)?(?:\\b(?:\\d+|single|full)\\s+)?\\b(?:${STONE_COLOR}(?:\\s+and\\s+${STONE_COLOR})?\\s+)?${STONE_WORDS}\\b(\\s*[,:]?\\s*${CARAT})?`,
    'gi',
  );
  text = text.replace(stoneRe, (all) => {
    const bare = all.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    const stoneWord = bare.split(' ').pop();
    if (stoneWord && headWords.includes(stoneWord)) return all; // motif stone
    stones.push(specCase(all));
    return ' ';
  });
  toStones(new RegExp(CARAT, 'gi'), (a) => specCase(a)); // orphan carat figures

  // Enamel / leather / finishes.
  toAttrs(/\b((?:tiffany\s+blue|blue|green|red|white|black)\s+)?enamel\b/gi, (a) => specCase(a));
  toAttrs(/\bsting-?ray\s+leather\b/gi, 'Sting-ray Leather');
  toAttrs(/\b(noir|snow|tan|pink)\s+(?:color|colour)\b/gi, (a, c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase());
  toAttrs(/\b(tan|black|blue|pink|white)\s+leather\b/gi, (a) => specCase(a));
  toAttrs(/\b(oxidized|rhodinated|rhodium|brushed(?:\s+finish(?:ed)?(?:\s+surface)?)?|sanded(?:\s+(?:finish|insert))?|polished(?:\s+edges)?)\b/gi, (a) => specCase(a));

  // Assembly notes worth keeping.
  toNotes(/\b(?:pendant\s+only|just\s+pendant)\b/gi, 'Pendant only');
  toNotes(/\bopenable\b/gi, 'Openable');
  toNotes(/\breplaceable\s+image\b/gi, 'Replaceable Image');
  toNotes(/\badjustable(\s+to\s+[^,]+)?\b/gi, (a) => tidy(a.charAt(0).toUpperCase() + a.slice(1)));
  toNotes(/\b(?:clasp|spring)-?\s?locks?\b/gi, (a) => specCase(a));
  toNotes(/,\s*clasp\b/gi, 'Clasp');
  toNotes(/\bomega\s+clip\b/gi, 'Omega Clip');
  toNotes(/,\s*clip\b/gi, 'Clip');
  toNotes(/\bcomfort\s+fit\b/gi, 'Comfort Fit');
  toNotes(/\bnames?\s+engraved[^,]*/gi, 'Inside Engraving');
  toNotes(/\b(five|5|four|4|three|3)[\s-]?prong(?:s|ed)?\b/gi, (a, n) => `${({ five: 5, four: 4, three: 3 })[n.toLowerCase()] || n} Prongs`);

  // Metals — the canonical display value is derived from code/text/ledger, so
  // metal words are simply removed from the text.
  const metal = metalDisplay(text, salesCode, material, codeFirst);
  text = text
    .replace(/\b(?:solid|sterling)\b/gi, ' ')
    .replace(/\b(?:yellow|white|rose)\s+gold\s+plat(?:ed|ing)\b/gi, ' ')
    .replace(/\bhalf\s+gold\s+plated\b/gi, ' ')
    .replace(/\bgold\s+plat(?:ed|ing)\b/gi, ' ')
    .replace(/\b(?:yellow|white|rose)\s*&\s*(?:yellow|white|rose)\s+gold\b/gi, ' ')
    .replace(/\b(?:yellow|white|rose)?\s*\d{2}\s*k(?:arat)?\b\s*(?:yellow|white|rose)?\s*(?:gold)?/gi, ' ')
    .replace(/\b\d{2}\s+(?:yellow|white|rose)\s+gold\b/gi, ' ')
    .replace(/\b(?:yellow|white|rose)\s+gold\b/gi, ' ')
    .replace(/\bvermeil\b\s*(?:gold)?/gi, ' ')
    .replace(/\b(?:silver\s*925|silver|gold|platinum|two\s+tone|stainless)\b/gi, ' ')
    .replace(/\bygp\b|\brgp\b|\b[wyr]g\d*\b/gi, ' ')
    .replace(/\b(?:yellow|white|rose)\b/gi, ' '); // colour word orphaned by the above

  // Ledger reference codes inside names (CC028, CH040 …).
  text = text.replace(/"/g, ' ').replace(/\b(?:CC|CH|CA|EXT)\s?\d+\w*\b/g, ' ');

  // Size → ", Size" suffix (last mention wins).
  let size = '';
  text = text.replace(SIZE_RE, (all, w) => { size = SIZE_MAP[w.toLowerCase()]; return ' '; });
  text = text.replace(/\b(?:three|3)[\s-]?dimensional\b/gi, '3D');

  // Drop the item's own category noun; everything else stays.
  if (CATEGORY_NOUN[category]) text = text.replace(new RegExp(`\\b${CATEGORY_NOUN[category]}\\b`, 'gi'), ' ');

  // Segment sweep: kill dangling connectives and meaningless leftovers.
  const segments = tidy(text).split(/\s*,\s*/).map((seg) => {
    const words = seg.split(/\s+/).filter(Boolean);
    while (words.length && EDGE_JUNK.has(words[0].toLowerCase())) words.shift();
    while (words.length && EDGE_JUNK.has(words[words.length - 1].toLowerCase().replace(/[.:]+$/, ''))) words.pop();
    return words.join(' ');
  }).filter((seg) => seg && !JUNK_SEGMENT.test(seg.replace(/[.:]+$/, '')));
  // De-duplicate repeated segments/words ("Dharma Chakra, Chakra").
  const dedup = [];
  for (const seg of segments) {
    const last = dedup[dedup.length - 1];
    if (last && (last.toLowerCase() === seg.toLowerCase() || last.toLowerCase().endsWith(` ${seg.toLowerCase()}`))) continue;
    dedup.push(seg);
  }

  // Adjacent duplicate words within a segment ("Dharma Chakra Chakra").
  let core = titleCase(tidy(dedup.join(', '))).replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
  if (size) core = core ? `${core}, ${size}` : '';

  // Sub: metal, stones (deduped — keep the most detailed mention of each
  // stone), attributes, dimensions, notes.
  const seenStones = [];
  for (const s of stones) {
    const word = s.toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(' ').pop();
    const prev = seenStones.findIndex((x) => x.word === word);
    if (prev === -1) seenStones.push({ word, s });
    else if (s.length > seenStones[prev].s.length) seenStones[prev] = { word, s };
  }
  const subLine = tidy([metal, ...seenStones.map((x) => x.s), ...attrs, ...dims, ...notes].filter(Boolean).join(', '));
  return { name: core, sub: subLine };
}

// ── Catalogue extraction (same technique as the other seed scripts) ─────────
async function loadItems() {
  const items = []; // { id, name, sub, category, material, salesCode, codeFirst }
  const productsSrc = await readFile(path.join(ROOT, 'lib/data/products.js'), 'utf8');
  const codeMatch = productsSrc.match(/export const CODE_MAP = (\{[\s\S]*?\});/);
  const codeMap = codeMatch ? JSON.parse(codeMatch[1]) : {};
  const rawMatch = productsSrc.match(/const RAW = \[([\s\S]*?)\n\];/);
  if (rawMatch) {
    new Function(`return [${rawMatch[1]}]`)() // [id, name, sub, file, tag, category, hue]
      .forEach(([id, name, sub, , , category]) =>
        items.push({ id, name: name || '', sub: sub || '', category: category || '', salesCode: codeMap[id] || '' }));
  }
  const siteSrc = await readFile(path.join(ROOT, 'lib/data/site-data.js'), 'utf8');
  const extraMatch = siteSrc.match(/const SITE_EXTRA = \[([\s\S]*?)\n\];/);
  if (extraMatch) {
    new Function(`return [${extraMatch[1]}]`)() // [id, name, sub, file, category]
      .forEach(([id, name, sub, , category]) =>
        items.push({ id, name: name || '', sub: sub || '', category: category || '' }));
  }
  if (!items.length) throw new Error('Could not extract the catalogue tables from lib/data — aborting.');
  const seen = new Set(items.map((i) => i.id));
  const ledger = JSON.parse(await readFile(path.join(ROOT, 'lib/data/stock-ledger.json'), 'utf8'));
  for (const row of ledger) {
    if (!row || !row.sku) continue;
    if (Array.isArray(row.productIds) && row.productIds.length) continue; // linked → catalogue listing is canonical
    if (seen.has(row.sku)) continue;
    seen.add(row.sku);
    items.push({
      id: row.sku, name: row.name || '', sub: '', category: row.category || '',
      material: row.material || '', salesCode: row.sku, codeFirst: true,
    });
  }
  return items;
}

// ── Current overrides (same access paths as backfill-symbol-stories) ────────
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

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const items = await loadItems();

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
      throw new Error(`Service account belongs to project "${saProject}" but this run targets "${projectId}" — nothing written.`);
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
      items.push({ id, name: o.name || '', sub: o.sub || '', category: o.category || 'Pendants', salesCode: o.salesCode || '' });
    }
  }

  const rows = [];
  let renamed = 0; let unchanged = 0; let attention = 0;
  for (const it of items) {
    const own = overrides[it.id];
    if (own && (own.deleted || (own.mergedInto && own.mergedInto !== it.id))) continue;

    // The name/sub the studio currently sees (override wins over base).
    const curName = own && own.name != null && String(own.name).trim() ? String(own.name) : it.name;
    const curSub = own && own.sub != null && String(own.sub).trim() ? String(own.sub) : it.sub;
    const curCat = (own && own.category) || it.category;

    let next; let flag = 'auto';
    if (MANUAL[it.id]) {
      next = MANUAL[it.id];
      flag = 'manual';
    } else {
      next = standardize({
        name: curName, sub: curSub, category: curCat,
        material: it.material, salesCode: it.salesCode, codeFirst: it.codeFirst,
      });
      // A name that dissolved entirely, or didn't get down to header size,
      // needs a human decision — report it, write nothing.
      if (!next.name || next.name.length > 48) flag = 'attention';
    }

    const changed = next.name !== curName || (next.sub || '') !== (curSub || '');
    rows.push({ id: it.id, category: curCat, curName, curSub, newName: next.name, newSub: next.sub, flag, changed });

    if (flag === 'attention') { attention += 1; continue; }
    if (!changed) { unchanged += 1; continue; }
    if (!DRY) {
      await db.doc(`catalogueOverrides/${it.id}`).set(
        { name: next.name, sub: next.sub, _updated: Date.now() },
        { merge: true },
      );
    }
    renamed += 1;
  }

  console.log(`Name standardization ${DRY ? '(DRY RUN)' : ''}`);
  console.log(`  ${DRY ? 'would rename' : 'renamed'}: ${renamed}`);
  console.log(`  already standard: ${unchanged}`);
  console.log(`  needs attention (not written): ${attention}`);
  for (const r of rows.filter((x) => x.flag === 'attention')) {
    console.log(`    ${r.id}  "${r.curName}" → "${r.newName}"`);
  }

  if (CSV_PATH) {
    const csv = ['id,category,flag,changed,current name,current sub,new name,new sub']
      .concat(rows.map((r) => [r.id, r.category, r.flag, r.changed ? 'yes' : '', r.curName, r.curSub, r.newName, r.newSub].map(csvCell).join(',')))
      .join('\n');
    await writeFile(path.resolve(CSV_PATH), csv + '\n');
    console.log(`\nBefore/after table saved → ${CSV_PATH}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
