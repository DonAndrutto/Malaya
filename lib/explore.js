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
// both directions. The pure derived views (shelf order, reverse lookups,
// related topics, search) live in lib/explore-shared.js so the ISR server
// pages run the same joins; they are re-exported here for client callers.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export * from './explore-shared';

export const EXPLORE_TOPICS_KEY = 'malaya:explore-topics:v1';
export const EXPLORE_GROUPS_KEY = 'malaya:explore-groups:v1';
const TOPICS = 'exploreTopics';
const GROUPS = 'exploreGroups';

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
function saveExploreDoc(key, collectionName, slug, data) {
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

export function saveTopic(slug, topic) { saveExploreDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, topic); }
export function deleteTopic(slug) { saveExploreDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, null); }
export function saveGroup(slug, group) { saveExploreDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, group); }
export function deleteGroup(slug) { saveExploreDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, null); }

function subscribeExploreCollection(key, collectionName, cb, { publishedOnly = false, skipCache = false } = {}) {
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
    subscribeExploreCollection(EXPLORE_TOPICS_KEY, TOPICS, (m) => { topics = m; emit(); }),
    subscribeExploreCollection(EXPLORE_GROUPS_KEY, GROUPS, (m) => { groups = m; emit(); }),
  ];
  return () => unsubs.forEach((u) => u());
}

// Live view of ONE topic document — the storefront topic page subscribes so
// "edit in admin, see it live on the site" works where it matters. Reading an
// unpublished/deleted topic is denied by the rules for visitors; the error
// callback keeps whatever data the caller already has (fails soft). An admin
// signed in on this browser IS allowed the read — which quietly gives the
// studio a live draft preview at the topic's real URL.
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
