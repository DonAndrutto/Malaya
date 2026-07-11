// ─────────────────────────────────────────────────────────────────────────────
// Server-side Firestore reader (REST, unauthenticated public reads).
//
// The storefront's client bundle subscribes to Firestore live; on the server
// (layouts, generateMetadata, sitemap, JSON-LD) we read the same public data
// over the Firestore REST API with Next's fetch cache (ISR revalidation), so
// pages are served with real catalogue data in the HTML without shipping any
// credentials — these reads are governed by the same security rules as the
// browser. Every helper fails soft (returns {}/null) so a Firestore outage
// never takes the storefront down; pages fall back to the built-in catalogue.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export const REVALIDATE_SECONDS = 300;

// Cache tags for on-demand purging (app/api/revalidate): the admin save paths
// ping their scope after an ACKED write, so published changes go live on the
// next request instead of waiting out the TTL. EXPLORE_CACHE_TAG lives in
// lib/server/explore.js.
export const BLOG_CACHE_TAG = 'blog';
export const SITE_CACHE_TAG = 'site-data';

// Decode a Firestore REST `Value` into a plain JS value.
function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}

function decodeFields(fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => { out[k] = decodeValue(v); });
  return out;
}

const docId = (name) => String(name || '').split('/').pop();

// Fetch a single document, e.g. fetchDoc('siteSettings/images') → {…} | null.
// Optional `tags` label the cached fetch for on-demand revalidation
// (revalidateTag from app/api/revalidate) on top of the time-based TTL.
export async function fetchDoc(path, revalidate = REVALIDATE_SECONDS, tags) {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      next: { revalidate, ...(Array.isArray(tags) && tags.length ? { tags } : {}) },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const { _updated, ...rest } = decodeFields(json.fields);
    return rest;
  } catch {
    return null;
  }
}

// Fetch a whole (publicly readable) collection → { [docId]: data }. Optional
// `tags` label the cached fetches for on-demand revalidation, as in fetchDoc.
export async function fetchCollection(name, revalidate = REVALIDATE_SECONDS, tags) {
  const out = {};
  try {
    let pageToken = '';
    do {
      const url = `${BASE}/${name}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, {
        next: { revalidate, ...(Array.isArray(tags) && tags.length ? { tags } : {}) },
      });
      if (!res.ok) return out;
      const json = await res.json();
      (json.documents || []).forEach((d) => {
        const { _updated, ...rest } = decodeFields(d.fields);
        out[docId(d.name)] = rest;
      });
      pageToken = json.nextPageToken || '';
    } while (pageToken);
  } catch {}
  return out;
}

// Generic "published == true" collection read → { [slug]: data }. Uses
// runQuery (POST) because the security rules only allow public list reads for
// the published == true query. An optional `select` field mask projects just
// the named fields — the load-bearing trick for Explore topic *summaries*
// (listings never pay for article bodies; see lib/server/explore.js). The
// original `_updated` is kept as `updated` (sitemap lastModified).
//
// Callers MUST wrap this in unstable_cache (POST responses never enter the
// fetch data cache; the wrapper is what provides ISR + tag purging). The fetch
// itself carries no `cache` option: an explicit `cache: 'no-store'` throws
// DynamicServerError during static generation — including every ISR
// revalidation — which the fail-soft catch would swallow, permanently baking
// EMPTY results into the prerendered Explore/blog pages. Inside an
// unstable_cache callback Next already forces fetchCache: 'force-no-store',
// so the bare fetch stays uncached without tripping the dynamic bailout.
export async function runPublishedQuery(collectionId, { select } = {}) {
  const out = {};
  try {
    const res = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'published' },
              op: 'EQUAL',
              value: { booleanValue: true },
            },
          },
          ...(Array.isArray(select) && select.length
            ? { select: { fields: select.map((f) => ({ fieldPath: f })) } }
            : {}),
          limit: 500,
        },
      }),
    });
    if (!res.ok) return out;
    const rows = await res.json();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row.document) return;
      const { _updated, ...rest } = decodeFields(row.document.fields);
      const id = docId(row.document.name);
      out[id] = { ...rest, slug: id, ...(_updated != null ? { updated: _updated } : {}) };
    });
  } catch {}
  return out;
}

// Published blog posts → { [slug]: post }. Cached via unstable_cache since
// POST requests bypass the fetch cache.
export const fetchPublishedBlogPosts = unstable_cache(
  async () => {
    const posts = await runPublishedQuery('blogPosts');
    // Blog callers never used `updated`; keep the historical shape.
    Object.values(posts).forEach((p) => { delete p.updated; });
    return posts;
  },
  ['blog-published'],
  { revalidate: REVALIDATE_SECONDS, tags: [BLOG_CACHE_TAG] },
);
