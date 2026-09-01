// ─────────────────────────────────────────────────────────────────────────────
// Server-side view of the storefront data. Mirrors what the client builds in
// app/(store)/layout.jsx — the same buildSiteData/resolveContent over the
// admin's Firestore overrides — so layouts, generateMetadata, JSON-LD and the
// sitemap all see the exact catalogue the visitor will see, in the HTML.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { buildSiteData, resolveContent } from '@/lib/data/site-data';
import {
  fetchCollection, fetchDoc, fetchPublishedBlogPosts, REVALIDATE_SECONDS, SITE_CACHE_TAG,
} from './firestore';
import { fetchPublishedGroups, fetchPublishedTopicSummaries } from './explore';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://malayajewellery.com').replace(/\/+$/, '');

export const SITE_NAME = 'Malaya Jewellery';

// Every reader here is wrapped in React's `cache` (per-request memoisation).
// A single product request asks for the resolved catalogue three times —
// generateMetadata, the page component, and the layout's own read — and each
// call used to re-deserialise the whole catalogueOverrides collection and
// re-run buildSiteData over ~290 products. Next's fetch dedupe covers the
// network hop but not that decode/merge work, which is the bulk of the CPU on
// an uncached render. `cache` collapses it to once per request; the values,
// cache tags and TTLs are unchanged.

// Everything the store layout needs to server-render with live data. Each
// piece fails soft to {} so the static catalogue still renders on any error.
export const getServerLayoutData = cache(async () => {
  const [overrides, settings, savedContent, blogPosts, exploreGroups, exploreTopics] = await Promise.all([
    fetchCollection('catalogueOverrides', REVALIDATE_SECONDS, [SITE_CACHE_TAG]),
    fetchDoc('siteSettings/images', REVALIDATE_SECONDS, [SITE_CACHE_TAG]),
    fetchDoc('siteSettings/content', REVALIDATE_SECONDS, [SITE_CACHE_TAG]),
    fetchPublishedBlogPosts(),
    fetchPublishedGroups(),
    fetchPublishedTopicSummaries(),
  ]);
  return {
    overrides: overrides || {},
    settings: settings || {},
    savedContent: savedContent || {},
    blogPosts: blogPosts || {},
    exploreGroups: exploreGroups || {},
    exploreTopics: exploreTopics || {},
  };
});

// Resolved catalogue (base data + admin overrides), server-side.
export const getServerSiteData = cache(async () => {
  const overrides = await fetchCollection('catalogueOverrides', REVALIDATE_SECONDS, [SITE_CACHE_TAG]);
  return buildSiteData(overrides || {});
});

// A single resolved product (or null) — override-aware, alias-aware.
export async function getServerProduct(id) {
  const { SITE_BY_ID } = await getServerSiteData();
  return SITE_BY_ID[id] || null;
}

export const getServerContent = cache(async () => {
  const saved = await fetchDoc('siteSettings/content', REVALIDATE_SECONDS, [SITE_CACHE_TAG]);
  return resolveContent(saved || {});
});
