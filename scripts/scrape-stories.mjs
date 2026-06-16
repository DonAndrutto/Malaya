#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — scrape the product "stories" from the old live Malaya site.
//
//   node scripts/scrape-stories.mjs                 # scrape everything
//   node scripts/scrape-stories.mjs --limit 5       # only the first 5 (test run)
//   node scripts/scrape-stories.mjs --delay 800     # ms between requests (default 600)
//   node scripts/scrape-stories.mjs --concurrency 4 # parallel fetches (default 4)
//   node scripts/scrape-stories.mjs --debug         # dump the 1st product's HTML
//   node scripts/scrape-stories.mjs --out path.json # override the output file
//
// What it does:
//   1. fetches the catalogue page  https://malayajewelrybhutan.com/malaya-jewelry-products
//      and extracts the URL of every individual product detail page
//      (links shaped like  /malaya-jewelry/<Category>/<Code> , e.g. .../Necklaces/N024-S),
//   2. visits each product page and pulls out
//        · code         — the sales code  (N024-S)
//        · title        — the item name   (OM AH HUNG Mantra Silver Necklace)
//        · description  — the detailed description
//                         (Om Ah Hung syllable Necklace, Silver, Rhodinated, Chain 48cm)
//        · story        — the "Story Behind" text,
//   3. writes everything to  lib/data/scraped-stories.json  (one object per product,
//      each field in its own column/key).
//
// Nothing is uploaded anywhere — this only reads the live site and writes one local
// JSON file, so it is safe to re-run. Extraction uses several fallbacks (JSON-LD,
// labelled sections, then plain headings) because the live markup can vary; run once
// with --debug, eyeball lib/data/scraped-stories.json, and tweak the SELECTORS /
// LABELS below if any field comes back empty.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://malayajewelrybhutan.com';
const CATALOGUE_URL = `${ORIGIN}/malaya-jewelry-products`;

// ── Tunables (override via CLI flags) ────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const LIMIT = Number(flag('limit', 0)) || 0;            // 0 = no limit
const DELAY = Number(flag('delay', 600));               // ms between requests per worker
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Network: fetch with a browser UA, retry + exponential backoff ────────────
async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = 2 ** attempt * 1000; // 2s, 4s, 8s
    console.warn(`  … retry ${attempt} for ${url} (${err.message}) — waiting ${wait / 1000}s`);
    await sleep(wait);
    return fetchHtml(url, attempt + 1);
  }
}

// ── Step 1: collect product URLs off the catalogue page ──────────────────────
// A product link is any href under /malaya-jewelry/ with two more path segments
// (category + sales code), e.g. /malaya-jewelry/Necklaces/N024-S. We resolve
// relative links, drop the catalogue page itself, and de-duplicate.
const PRODUCT_PATH = /^\/malaya-jewelry\/[^/]+\/[^/?#]+\/?$/i;

function extractProductUrls(html) {
  const $ = cheerio.load(html);
  const seen = new Map(); // normalised path -> absolute url
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, ORIGIN);
    } catch {
      return;
    }
    if (abs.origin !== ORIGIN) return;
    if (!PRODUCT_PATH.test(abs.pathname)) return;
    const key = abs.pathname.replace(/\/$/, '').toLowerCase();
    if (!seen.has(key)) seen.set(key, abs.origin + abs.pathname);
  });
  return [...seen.values()];
}

// ── Step 2: extract the four fields from a product page ──────────────────────
const clean = (s) =>
  (s || '')
    .replace(/ /g, ' ')
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

async function main() {
  console.log(`Fetching catalogue:  ${CATALOGUE_URL}`);
  const catalogueHtml = await fetchHtml(CATALOGUE_URL);
  let urls = extractProductUrls(catalogueHtml);

  if (!urls.length) {
    console.error(
      '\n✗ No product links found on the catalogue page.\n' +
        '  The catalogue may render its product grid with JavaScript, so the static\n' +
        '  HTML has no <a> links. Open the page in a browser, confirm the product-link\n' +
        '  shape (e.g. /malaya-jewelry/Necklaces/N024-S), and adjust PRODUCT_PATH — or\n' +
        '  paste the real product URLs into a list and feed them to extractProduct().',
    );
    process.exit(1);
  }

  if (LIMIT) urls = urls.slice(0, LIMIT);
  console.log(`Found ${urls.length} product page(s). Scraping with concurrency ${CONCURRENCY}…\n`);

  let done = 0;
  let firstDumped = false;
  const records = await pool(urls, CONCURRENCY, async (url) => {
    try {
      const html = await fetchHtml(url);
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
      console.warn(`  [${done}/${urls.length}] ✗ ${url} — ${err.message}`);
      return { code: clean(decodeURIComponent(url.split('/').pop() || '')), url, error: err.message };
    }
  });

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(records, null, 2) + '\n');

  const ok = records.filter((r) => r && !r.error).length;
  const withStory = records.filter((r) => r && r.story).length;
  console.log(`\nDone. ${ok}/${records.length} scraped, ${withStory} with a story.`);
  console.log(`Saved → ${path.relative(ROOT, OUT)}`);
  if (withStory < ok) {
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
