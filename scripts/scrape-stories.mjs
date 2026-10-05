#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — scrape the product "stories" from the old live Malaya site.
//
// The main catalogue grid is rendered client-side with JavaScript, so its product
// links never appear in the static HTML cheerio sees. This script therefore builds
// the list of product URLs WITHOUT touching the catalogue page, using either:
//
//   • the XML sitemap                       (Option A — preferred, default)
//   • the local lib/data/stock-ledger.json  (Option B — fallback / offline)
//
//   node scripts/scrape-stories.mjs                    # sitemap, then ledger fallback
//   node scripts/scrape-stories.mjs --source sitemap   # sitemap only
//   node scripts/scrape-stories.mjs --source ledger     # ledger only (no catalogue/sitemap)
//   node scripts/scrape-stories.mjs --sitemap <url>     # override the sitemap URL
//   node scripts/scrape-stories.mjs --limit 5           # only the first 5 (test run)
//   node scripts/scrape-stories.mjs --delay 800         # ms between requests (default 600)
//   node scripts/scrape-stories.mjs --concurrency 4     # parallel fetches (default 4)
//   node scripts/scrape-stories.mjs --debug             # dump the 1st product's HTML
//   node scripts/scrape-stories.mjs --out path.json     # override the output file
//
// For every product page it pulls out
//   · code         — the sales code  (N024-S)
//   · title        — the item name   (OM AH HUNG Mantra Silver Necklace)
//   · description  — the detailed description
//                    (Om Ah Hung syllable Necklace, Silver, Rhodinated, Chain 48cm)
//   · story        — the "Story Behind" text
// and writes lib/data/scraped-stories.json (one object per product, each field its
// own key/column).
//
// Nothing is uploaded — this only reads the live site and writes one local JSON
// file, so it is safe to re-run. Extraction uses several fallbacks (JSON-LD,
// labelled sections, then meta tags) because the live markup can vary; run once
// with --debug, eyeball the output, and tweak STORY_LABELS / DESC_LABELS if a
// field comes back empty.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://malayajewelrybhutan.com';
const LEDGER_PATH = path.resolve(ROOT, 'lib/data/stock-ledger.json');

// Candidate sitemap locations, tried in order until one yields product URLs.
const SITEMAP_CANDIDATES = [
  `${ORIGIN}/sitemap.xml`,
  `${ORIGIN}/sitemap-products.xml`,
  `${ORIGIN}/product-sitemap.xml`,
  `${ORIGIN}/sitemap_index.xml`,
  `${ORIGIN}/sitemap-index.xml`,
];

// ── Tunables (override via CLI flags) ────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const SOURCE = flag('source', 'auto'); // auto | sitemap | ledger
const SITEMAP_OVERRIDE = flag('sitemap', '');
const LIMIT = Number(flag('limit', 0)) || 0; // 0 = no limit
const DELAY = Number(flag('delay', 600)); // ms between requests per worker
const CONCURRENCY = Math.max(1, Number(flag('concurrency', 4)));
const DEBUG = args.includes('--debug');
const OUT = path.resolve(ROOT, flag('out', 'lib/data/scraped-stories.json'));

// Labels that introduce the "story" block. The first that matches wins. The
// detailed description is whatever product copy sits *outside* the story block.
const STORY_LABELS = ['story behind', 'the story behind', 'story', 'meaning', 'symbolism'];
const DESC_LABELS = ['description', 'details', 'product details', 'specification', 'specifications'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// A product page path: /malaya-jewelry/<Category>/<Code>.
const PRODUCT_PATH = /^\/malaya-jewelry\/[^/]+\/[^/?#]+\/?$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Network: fetch with a browser UA, retrying only when it's worth retrying ──
// Retries network errors, 429 and 5xx with exponential backoff; a definitive 4xx
// (e.g. 404 for a ledger SKU that has no public page) fails immediately.
class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

async function fetchText(url, attempt = 1) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = 2 ** attempt * 1000; // 2s, 4s, 8s
    console.warn(`  … retry ${attempt} for ${url} (${err.message}) — waiting ${wait / 1000}s`);
    await sleep(wait);
    return fetchText(url, attempt + 1);
  }
  if (res.ok) return res.text();
  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 4) {
    const wait = 2 ** attempt * 1000;
    console.warn(`  … retry ${attempt} for ${url} (HTTP ${res.status}) — waiting ${wait / 1000}s`);
    await sleep(wait);
    return fetchText(url, attempt + 1);
  }
  throw new HttpError(res.status, url);
}

// ── Source A: sitemap(s) ─────────────────────────────────────────────────────
// Handles both <urlset> (leaf sitemaps) and <sitemapindex> (an index that points
// to child sitemaps). Recurses one level into the index, preferring children whose
// URL hints at products, and returns every <loc> that looks like a product page.
async function urlsFromSitemap(startUrls) {
  const seen = new Set();
  const products = new Map(); // normalised path -> absolute url
  const queue = [...startUrls];

  const addIfProduct = (loc) => {
    let abs;
    try {
      abs = new URL(loc, ORIGIN);
    } catch {
      return;
    }
    if (abs.origin !== ORIGIN || !PRODUCT_PATH.test(abs.pathname)) return;
    const key = abs.pathname.replace(/\/$/, '').toLowerCase();
    if (!products.has(key)) products.set(key, abs.origin + abs.pathname);
  };

  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    let xml;
    try {
      xml = await fetchText(url);
    } catch (err) {
      console.warn(`  sitemap: ${url} — ${err.message}`);
      continue;
    }
    const $ = cheerio.load(xml, { xmlMode: true });

    const isIndex = $('sitemapindex').length > 0;
    if (isIndex) {
      const children = $('sitemap > loc')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
      // Visit product-ish children first, then the rest, deepest depth = 1.
      const ranked = children.sort(
        (a, b) => (/(product|item|shop)/i.test(b) ? 1 : 0) - (/(product|item|shop)/i.test(a) ? 1 : 0),
      );
      queue.push(...ranked);
    } else {
      $('url > loc').each((_, el) => addIfProduct($(el).text().trim()));
    }
  }
  return [...products.values()];
}

// ── Source B: local ledger ───────────────────────────────────────────────────
// Reads the authoritative SKUs and builds /malaya-jewelry/<Category>/<sku>.
async function urlsFromLedger() {
  const rows = JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
  const seen = new Map();
  for (const row of rows) {
    const sku = (row.sku || '').trim();
    const category = (row.category || '').trim();
    if (!sku || !category) continue;
    const pathname = `/malaya-jewelry/${encodeURIComponent(category)}/${encodeURIComponent(sku)}`;
    if (!seen.has(sku)) seen.set(sku, ORIGIN + pathname);
  }
  return [...seen.values()];
}

// ── Extraction (per product page) ────────────────────────────────────────────
const clean = (s) =>
  (s || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Pull name / description / sku out of any JSON-LD Product blocks, if present.
function fromJsonLd($) {
  const out = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
    for (const node of nodes) {
      const types = [].concat(node?.['@type'] || []);
      if (!types.map((t) => String(t).toLowerCase()).includes('product')) continue;
      if (node.name && !out.title) out.title = clean(node.name);
      if (node.description && !out.description) out.description = clean(node.description);
      const sku = node.sku || node.mpn || node.productID;
      if (sku && !out.code) out.code = clean(String(sku));
    }
  });
  return out;
}

// Find the element whose own text equals/starts with one of `labels`, then gather
// the readable text that follows it (siblings, or the rest of its container) up to
// the next label-like heading. Returns '' when no label matches.
function sectionByLabel($, labels) {
  const norm = (t) => clean(t).toLowerCase().replace(/[:\-–—]\s*$/, '').trim();
  let result = '';
  $('h1,h2,h3,h4,h5,h6,strong,b,p,span,div,dt,label').each((_, el) => {
    if (result) return;
    const own = norm($(el).clone().children().remove().end().text());
    const full = norm($(el).text());
    const hit = labels.find((l) => own === l || own.startsWith(l) || full === l);
    if (!hit) return;

    // Text after a colon on the same element, e.g. "Description: Silver chain 48cm".
    const inline = clean($(el).text()).replace(/^[^:]*:\s*/, '');
    if (inline && inline.toLowerCase() !== hit) {
      result = inline;
      return;
    }
    // Inline label whose value lives in the parent, e.g. "<strong>Story:</strong> text".
    const inlineTag = /^(strong|b|span|label|dt)$/i.test(el.tagName);
    if (inlineTag) {
      const fromParent = clean($(el).parent().text()).replace(/^[^:]*:\s*/, '');
      if (fromParent && fromParent.toLowerCase() !== hit) {
        result = fromParent;
        return;
      }
    }
    // Otherwise collect following siblings until the next heading-ish element.
    // For an inline label that means the siblings of its container, not the label.
    const anchor = inlineTag ? $(el).parent() : $(el);
    const parts = [];
    anchor.nextAll().each((__, sib) => {
      if (/^h[1-6]$/i.test(sib.tagName)) return false;
      const txt = clean($(sib).text());
      if (txt) parts.push(txt);
      return undefined;
    });
    result = clean(parts.join(' '));
  });
  return result;
}

function extractProduct(html, url) {
  const $ = cheerio.load(html);
  const codeFromUrl = clean(decodeURIComponent(url.split('/').pop() || ''));

  const ld = fromJsonLd($);

  const title =
    ld.title ||
    clean($('h1').first().text()) ||
    clean($('meta[property="og:title"]').attr('content')) ||
    clean($('title').text());

  const story = sectionByLabel($, STORY_LABELS);

  // Detailed description: prefer JSON-LD, then a labelled Description/Details
  // section, then the og:description / meta description as a last resort.
  let description =
    ld.description ||
    sectionByLabel($, DESC_LABELS) ||
    clean($('meta[property="og:description"]').attr('content')) ||
    clean($('meta[name="description"]').attr('content'));

  // Never let the story text leak into the description column.
  if (description && story && description.includes(story)) {
    description = clean(description.replace(story, ''));
  }

  return {
    code: ld.code || codeFromUrl,
    title,
    description,
    story,
    url,
  };
}

// ── Simple bounded-concurrency worker pool ───────────────────────────────────
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
      if (DELAY) await sleep(DELAY);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

// ── Gather the list of product URLs from the chosen source ───────────────────
async function gatherUrls() {
  const wantSitemap = SOURCE === 'auto' || SOURCE === 'sitemap';
  const wantLedger = SOURCE === 'auto' || SOURCE === 'ledger';

  if (wantSitemap) {
    const starts = SITEMAP_OVERRIDE ? [SITEMAP_OVERRIDE] : SITEMAP_CANDIDATES;
    console.log(`Reading sitemap (${SITEMAP_OVERRIDE || 'auto-discover'})…`);
    let urls = [];
    try {
      urls = await urlsFromSitemap(starts);
    } catch (err) {
      console.warn(`  sitemap failed: ${err.message}`);
    }
    if (urls.length) {
      console.log(`  sitemap → ${urls.length} product URL(s).`);
      return urls;
    }
    if (SOURCE === 'sitemap') {
      throw new Error(
        'No product URLs in the sitemap. Try --sitemap <url> with the real sitemap, ' +
          'or use --source ledger to build URLs from lib/data/stock-ledger.json.',
      );
    }
    console.warn('  sitemap yielded nothing — falling back to the local ledger.');
  }

  if (wantLedger) {
    console.log(`Reading ledger: ${path.relative(ROOT, LEDGER_PATH)}…`);
    const urls = await urlsFromLedger();
    console.log(`  ledger → ${urls.length} product URL(s).`);
    return urls;
  }

  return [];
}

async function main() {
  let urls = await gatherUrls();
  if (!urls.length) {
    console.error('✗ No product URLs to scrape.');
    process.exit(1);
  }

  if (LIMIT) urls = urls.slice(0, LIMIT);
  console.log(`\nScraping ${urls.length} product page(s) with concurrency ${CONCURRENCY}…\n`);

  let done = 0;
  let firstDumped = false;
  const records = await pool(urls, CONCURRENCY, async (url) => {
    try {
      const html = await fetchText(url);
      if (DEBUG && !firstDumped) {
        firstDumped = true;
        await writeFile(path.resolve(ROOT, 'lib/data/_debug-product.html'), html);
        console.log('  (debug) wrote lib/data/_debug-product.html for inspection');
      }
      const rec = extractProduct(html, url);
      done++;
      const miss = ['title', 'description', 'story'].filter((k) => !rec[k]);
      console.log(
        `  [${done}/${urls.length}] ${rec.code}  ${rec.title || '(no title)'}` +
          (miss.length ? `   ⚠ empty: ${miss.join(', ')}` : ''),
      );
      return rec;
    } catch (err) {
      done++;
      const code = clean(decodeURIComponent(url.split('/').pop() || ''));
      const note = err.status === 404 ? 'no public page (404)' : err.message;
      console.warn(`  [${done}/${urls.length}] ✗ ${code} — ${note}`);
      return { code, url, error: err.message };
    }
  });

  // Keep only the products that actually resolved; report the misses separately.
  const scraped = records.filter((r) => r && !r.error);
  const failed = records.filter((r) => r && r.error);

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(scraped, null, 2) + '\n');

  const withStory = scraped.filter((r) => r.story).length;
  console.log(
    `\nDone. ${scraped.length} scraped (${withStory} with a story), ${failed.length} skipped/failed.`,
  );
  console.log(`Saved → ${path.relative(ROOT, OUT)}`);
  if (scraped.length && withStory < scraped.length) {
    console.log(
      'Tip: if "story"/"description" are empty, run with --debug, open\n' +
        '     lib/data/_debug-product.html, and tweak STORY_LABELS / DESC_LABELS.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
