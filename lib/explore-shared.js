// ─────────────────────────────────────────────────────────────────────────────
// Explore — pure derived views shared by server and client. No Firebase, no
// 'use client': the ISR listing pages (app/(store)/explore/*) and the live
// client surfaces (lib/explore.js re-exports everything here) run the exact
// same in-memory joins over the small topics/groups collections.
// ─────────────────────────────────────────────────────────────────────────────

// /explore/<group-slug> is the group URL space; these first segments belong to
// routes, so no group may take them (enforced by the admin's slug validation).
export const RESERVED_GROUP_SLUGS = ['topic', 'search'];

// Content-block registry metadata (type + admin label). The renderer's
// {type → component} map lives in components/store/site/ExplorePages.jsx;
// an unknown type renders nothing, so new types are additive by construction.
export const BLOCK_TYPES = [
  { type: 'richText', label: 'Text' },
  { type: 'floatProduct', label: 'Floating product' },
  { type: 'editorialImage', label: 'Editorial image (hotspots)' },
  { type: 'quote', label: 'Pull quote' },
  { type: 'divider', label: 'Divider' },
  { type: 'productGrid', label: 'Product grid' },
  { type: 'relatedTopics', label: 'Related topics' },
  { type: 'callout', label: 'Callout' },
  { type: 'architectureGallery', label: 'Architecture gallery' },
];

export function newBlockId() {
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// {slug: group} map → array in navigation order (order, then name).
export function groupList(map, { publishedOnly = false } = {}) {
  return Object.values(map || {})
    .filter((g) => g && g.name && (!publishedOnly || g.published))
    .sort((a, b) => ((a.order ?? 1e9) - (b.order ?? 1e9)) || String(a.name).localeCompare(String(b.name)));
}

// A group's topics in the shelf's own order. Unknown / unpublished slugs are
// dropped silently (dangling refs are tolerated, exactly like HOME_BEST ids).
export function topicsOfGroup(group, topicsMap, { publishedOnly = true } = {}) {
  return ((group && group.topicSlugs) || [])
    .map((slug) => (topicsMap || {})[slug])
    .filter((t) => t && t.title && (!publishedOnly || t.published));
}

// Reverse lookup: which groups shelve this topic? (In-memory scan of a small
// collection — see EXPLORE.md §2.) Sorted by navigation order.
export function groupsOfTopic(slug, groupsMap, { publishedOnly = true } = {}) {
  return groupList(groupsMap, { publishedOnly })
    .filter((g) => Array.isArray(g.topicSlugs) && g.topicSlugs.includes(slug));
}

// Deterministic primary group (breadcrumbs): first containing group by order.
export function primaryGroupOf(slug, groupsMap) {
  return groupsOfTopic(slug, groupsMap)[0] || null;
}

// "Pieces bearing this symbol" — products linked to the topic via overrides.
export function topicProducts(slug, products) {
  return (products || []).filter((p) => Array.isArray(p.topics) && p.topics.includes(slug));
}

// Sibling topics from shared groups, in shelf order, excluding the topic itself.
export function relatedTopics(topic, groupsMap, topicsMap, n = 6) {
  if (!topic || !topic.slug) return [];
  const out = [];
  const seen = new Set([topic.slug]);
  groupsOfTopic(topic.slug, groupsMap).forEach((g) => {
    topicsOfGroup(g, topicsMap).forEach((t) => {
      if (out.length < n && !seen.has(t.slug)) { seen.add(t.slug); out.push(t); }
    });
  });
  return out;
}

// ── Unified search (v1 — identity + context tiers, in-memory) ────────────────
// Sectioned results over topic summaries, groups and resolved products. The
// product ↔ topic relationship is itself a relevance signal: pieces linked to
// a matched topic rank above pieces that merely contain the words.
function textHas(text, q) { return String(text || '').toLowerCase().includes(q); }

export function searchExplore(query, { topics = {}, groups = {}, products = [] } = {}, limit = 6) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { topics: [], groups: [], products: [] };

  const topicHits = Object.values(topics)
    .filter((t) => t && t.title && t.published !== false)
    .map((t) => {
      let score = 0;
      if (textHas(t.title, q) || textHas(t.slug, q)) score = 3; // tier 1 — identity
      else if ((t.aliases || []).some((a) => textHas(a, q))) score = 2; // aliases (Palbeu, Shrivatsa…)
      else if (textHas(t.subtitle, q) || textHas(t.excerpt, q)) score = 1; // tier 2 — context
      return { t, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((e) => e.t);

  const groupHits = groupList(groups, { publishedOnly: true })
    .filter((g) => textHas(g.name, q) || textHas(g.description, q));

  const matchedSlugs = new Set(topicHits.map((t) => t.slug));
  const productHits = products
    .map((p) => {
      let score = 0;
      if ((p.topics || []).some((s) => matchedSlugs.has(s))) score += 2; // linked to a matched topic
      if (textHas(`${p.name} ${p.sub || ''} ${p.salesCode || ''}`, q)) score += 1;
      return { p, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((e) => e.p);

  return {
    topics: topicHits.slice(0, limit),
    groups: groupHits.slice(0, limit),
    products: productHits.slice(0, limit + 2),
  };
}

// Approximate Firestore document size — the admin's byte-size meter against
// the 1 MiB cap (blocks live inside the topic doc; see EXPLORE.md §12).
export function topicByteSize(topic) {
  try { return new TextEncoder().encode(JSON.stringify(topic || {})).length; } catch { return 0; }
}
