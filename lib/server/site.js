// ─────────────────────────────────────────────────────────────────────────────
// Server-side view of the storefront data. Mirrors what the client builds in
// app/(store)/layout.jsx — the same buildSiteData/resolveContent over the
// admin's Firestore overrides — so layouts, generateMetadata, JSON-LD and the
// sitemap all see the exact catalogue the visitor will see, in the HTML.
// ─────────────────────────────────────────────────────────────────────────────

import { cache } from 'react';
import { buildSiteData, resolveContent } from '@/lib/data/site-data';
import {
  fetchCollection, fetchDoc, REVALIDATE_SECONDS, CATALOGUE_CACHE_TAG, SETTINGS_CACHE_TAG, CONTENT_CACHE_TAG,
} from './firestore';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://malayajewellery.com').replace(/\/+$/, '');

export const SITE_NAME = 'Malaya Jewellery';

// The catalogue is a real shared dependency: header basket prices, added-item
// notices and cart alias migration must work even on editorial/legal routes.
// Blog and Explore are seeded only into routes that render those features.
export const getServerLayoutData = cache(async () => {
  const [overrides, settings, savedContent] = await Promise.all([
    fetchCollection('catalogueOverrides', REVALIDATE_SECONDS, [CATALOGUE_CACHE_TAG]),
    fetchDoc('siteSettings/images', REVALIDATE_SECONDS, [SETTINGS_CACHE_TAG]),
    fetchDoc('siteSettings/content', REVALIDATE_SECONDS, [CONTENT_CACHE_TAG]),
  ]);
  return { overrides: overrides || {}, settings: settings || {}, savedContent: savedContent || {} };
});

// Resolved catalogue (base data + admin overrides), server-side.
export const getServerSiteData = cache(async () => {
  const overrides = await fetchCollection('catalogueOverrides', REVALIDATE_SECONDS, [CATALOGUE_CACHE_TAG]);
  return buildSiteData(overrides || {});
});

// A single resolved product (or null) — override-aware, alias-aware.
export async function getServerProduct(id) {
  const { SITE_BY_ID } = await getServerSiteData();
  return SITE_BY_ID[id] || null;
}

export const getServerContent = cache(async () => {
  const saved = await fetchDoc('siteSettings/content', REVALIDATE_SECONDS, [CONTENT_CACHE_TAG]);
  return resolveContent(saved || {});
});
