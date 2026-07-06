'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Explore — the parallel editorial system for Bhutanese & Vajrayana symbolism.
// Mirrors lib/blog.js: each document lives in Firestore with a localStorage
// cache for instant paint + cross-tab sync, and live snapshots so edits made in
// /admin appear immediately where a page subscribes.
//
// Two collections:
//   exploreTopics/{slug} — a knowledge Topic: one canonical editorial page.
//     { slug, title, subtitle, excerpt, aliases[], heroImage, heroPos,
//       blocks[], published }
//   exploreGroups/{slug} — a navigation Group (curated shelf). Membership AND
//     per-shelf order both live in the ordered topicSlugs array — a Group is a
//     playlist, Topics are the tracks. Deleting a Group deletes no knowledge.
//     { slug, name, description, heroImage, heroPos, order, topicSlugs[],
//       published }
//
// The product ↔ topic relationship is stored once, on the product's override
// (catalogueOverrides/{id}.topics — see lib/data/resolve.js), and derived in
// both directions from here.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export const EXPLORE_TOPICS_KEY = 'malaya:explore-topics:v1';
export const EXPLORE_GROUPS_KEY = 'malaya:explore-groups:v1';
const TOPICS = 'exploreTopics';
const GROUPS = 'exploreGroups';

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

function loadLocal(key) {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}

function writeLocal(key, obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}

export function loadTopics() { return loadLocal(EXPLORE_TOPICS_KEY); }
export function loadGroups() { return loadLocal(EXPLORE_GROUPS_KEY); }

// Persist one document (pass null/undefined to delete): localStorage first,
// then mirror the single Firestore document — the saveBlogPost pattern.
function saveDoc(key, collectionName, slug, data) {
  if (!slug) return;
  const all = loadLocal(key);
  if (data) all[slug] = { ...data, slug }; else delete all[slug];
  writeLocal(key, all);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return;
  const { db } = getFirebase();
  if (!db) return;
  try {
    if (data) setDoc(doc(db, collectionName, slug), { ...data, slug, _updated: Date.now() }).catch(() => {});
    else deleteDoc(doc(db, collectionName, slug)).catch(() => {});
  } catch {}
}

export function saveTopic(slug, topic) { saveDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, topic); }
export function deleteTopic(slug) { saveDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, null); }
export function saveGroup(slug, group) { saveDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, group); }
export function deleteGroup(slug) { saveDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, null); }

function subscribeCollection(key, collectionName, cb, { publishedOnly = false, skipCache = false } = {}) {
  if (typeof window === 'undefined') return () => {};
  if (!skipCache || !FIREBASE_ENABLED) cb(loadLocal(key));
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      const src = publishedOnly
        ? query(collection(db, collectionName), where('published', '==', true))
        : collection(db, collectionName);
      return onSnapshot(
        src,
        (snap) => {
          // A cache-only miss (offline/blocked network) must not wipe the
          // caller's server-rendered data.
          if (skipCache && snap.metadata.fromCache) return;
          const map = {};
          snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = { ...rest, slug: d.id }; });
          writeLocal(key, map);
          cb(map);
        },
        () => {},
      );
    }
  }
  const onStorage = (e) => { if (e.key === key) cb(loadLocal(key)); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

// Full topics + groups (drafts included) for the admin Explore tab. The full
// list reads are only permitted for signed-in admins (see firestore.rules).
export function subscribeExploreAdmin(cb) {
  let topics = loadTopics();
  let groups = loadGroups();
  const emit = () => cb({ topics, groups });
  const unsubs = [
    subscribeCollection(EXPLORE_TOPICS_KEY, TOPICS, (m) => { topics = m; emit(); }),
    subscribeCollection(EXPLORE_GROUPS_KEY, GROUPS, (m) => { groups = m; emit(); }),
  ];
  return () => unsubs.forEach((u) => u());
}

// Live view of ONE topic document — the storefront topic page subscribes so
// "edit in admin, see it live on the site" works where it matters. Reading an
// unpublished/deleted topic is denied by the rules for visitors; the error
// callback keeps whatever data the caller already has (fails soft).
export function subscribeTopic(slug, cb, { skipCache = false } = {}) {
  if (typeof window === 'undefined' || !slug) return () => {};
  if (!skipCache || !FIREBASE_ENABLED) {
    const cached = loadTopics()[slug];
    if (cached) cb(cached);
  }
  if (!FIREBASE_ENABLED) return () => {};
  const { db } = getFirebase();
  if (!db) return () => {};
  return onSnapshot(
    doc(db, TOPICS, slug),
    (snap) => {
      if (skipCache && snap.metadata.fromCache) return;
      if (!snap.exists()) { cb(null); return; }
      const { _updated, ...rest } = snap.data();
      cb({ ...rest, slug });
    },
    () => {},
  );
}

// ── Derived views (in-memory joins over the small collections) ───────────────

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

// Approximate Firestore document size — the admin's byte-size meter against
// the 1 MiB cap (blocks live inside the topic doc; see EXPLORE.md §12).
export function topicByteSize(topic) {
  try { return new TextEncoder().encode(JSON.stringify(topic || {})).length; } catch { return 0; }
}
