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

import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
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

// A Firestore write that fails outright (a rules rejection — offline writes
// just stay queued) must not be swallowed while localStorage tells the editor
// "saved": log the REAL error (path + Firestore error code) and broadcast it
// so the admin UI can warn (ExploreAdmin listens).
export const EXPLORE_SAVE_ERROR_EVENT = 'malaya:explore-save-error';
function notifySaveError(e, path) {
  const code = (e && e.code) || '';
  const message = (e && e.message) || String(e);
  console.error(`[explore] Firestore write REJECTED at ${path}: ${code} ${message}`, e);
  try {
    window.dispatchEvent(new CustomEvent(EXPLORE_SAVE_ERROR_EVENT, { detail: { path, code, message } }));
  } catch {}
}

// The storefront's server pages read Explore over ISR-cached fetches
// (lib/server/explore.js). Writes here go straight from the browser to
// Firestore, so after the server ACKS one, the storefront's caches must be
// told to drop their copy — otherwise a freshly published (or unpublished)
// topic keeps serving stale listings until the 5-minute TTL runs out.
// Debounced so autosave bursts and multi-document operations (a rename
// rewrites shelves and product links) collapse into one purge; fire-and-
// forget because a failed ping only means falling back to the TTL.
let revalidateTimer = null;
function scheduleStorefrontRevalidate() {
  if (typeof window === 'undefined') return;
  clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => {
    fetch('/api/revalidate?scope=explore', { method: 'POST' }).catch(() => {});
  }, 1200);
}

// Persist one document (pass null/undefined to delete): localStorage first,
// then mirror the single Firestore document — the saveBlogPost pattern.
// Returns the cloud write's outcome so destructive callers can sequence on it:
// a promise of true (server accepted) / false (server REJECTED — already
// logged + broadcast), or null when no Firestore write is in play.
function saveExploreDoc(key, collectionName, slug, data) {
  if (!slug) return null;
  const all = loadLocal(key);
  if (data) all[slug] = { ...data, slug }; else delete all[slug];
  writeLocal(key, all);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return null;
  const { db } = getFirebase();
  if (!db) return null;
  const path = `${collectionName}/${slug}`;
  try {
    const write = data
      ? setDoc(doc(db, collectionName, slug), { ...data, slug, _updated: Date.now() })
      : deleteDoc(doc(db, collectionName, slug));
    return write.then(
      () => { scheduleStorefrontRevalidate(); return true; },
      (e) => { notifySaveError(e, path); return false; },
    );
  } catch { return null; }
}

// ── Revision snapshots (content safety net) ─────────────────────────────────
// Saves are whole-document last-write-wins under aggressive autosave, so each
// admin save first checkpoints the topic's PREVIOUS state to
// exploreTopics/{slug}/revisions/{timestamp} (admin-only — see
// firestore.rules), at most once per REVISION_MIN_INTERVAL_MS, pruned to the
// newest REVISION_KEEP snapshots. Deleting a topic (and the delete leg of a
// rename) checkpoints unconditionally first; the subcollection survives the
// parent document's deletion — deliberately, these are the recovery copies.
export const REVISION_KEEP = 20;
const REVISIONS = 'revisions';
const REVISION_MIN_INTERVAL_MS = 5 * 60 * 1000;
const REVISION_AT_KEY = 'malaya:explore-rev-at:v1';

function snapshotTopicRevision(slug, prev, { force = false } = {}) {
  if (!FIREBASE_ENABLED || typeof window === 'undefined' || !slug || !prev || !prev.title) return;
  const at = loadLocal(REVISION_AT_KEY);
  const now = Date.now();
  if (!force && at[slug] && now - at[slug] < REVISION_MIN_INTERVAL_MS) return;
  const { db } = getFirebase();
  if (!db) return;
  at[slug] = now;
  writeLocal(REVISION_AT_KEY, at);
  try {
    const col = collection(db, TOPICS, slug, REVISIONS);
    setDoc(doc(col, String(now)), { ...prev, slug, _savedAt: now })
      .then(async () => {
        // Prune beyond the newest REVISION_KEEP (ids are ms timestamps, so
        // lexicographic order is chronological order).
        const snap = await getDocs(col);
        const ids = snap.docs.map((d) => d.id).sort();
        await Promise.all(ids.slice(0, Math.max(0, ids.length - REVISION_KEEP))
          .map((id) => deleteDoc(doc(col, id))));
      })
      // Snapshots are best-effort insurance, but a failure must be visible:
      // a rejection here is an early warning that the deployed rules lag the
      // deployed code (the revisions match block is missing).
      .catch((e) => console.warn(`[explore] revision snapshot failed for ${slug}:`, (e && e.code) || e));
  } catch {}
}

// Unthrottled checkpoint of the topic's current state (before delete/restore).
export function checkpointTopic(slug) {
  snapshotTopicRevision(slug, loadTopics()[slug], { force: true });
}

// Newest-first list of snapshots for the editor's History panel.
export async function listTopicRevisions(slug) {
  if (!FIREBASE_ENABLED || typeof window === 'undefined' || !slug) return [];
  const { db } = getFirebase();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, TOPICS, slug, REVISIONS));
    return snap.docs
      .map((d) => {
        const { _savedAt, _updated, ...rest } = d.data();
        return { id: d.id, savedAt: _savedAt || Number(d.id) || 0, topic: { ...rest, slug } };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

export function saveTopic(slug, topic) {
  snapshotTopicRevision(slug, loadTopics()[slug]);
  return saveExploreDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, topic);
}
export function deleteTopic(slug) {
  checkpointTopic(slug);
  return saveExploreDoc(EXPLORE_TOPICS_KEY, TOPICS, slug, null);
}
export function saveGroup(slug, group) { return saveExploreDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, group); }
export function deleteGroup(slug) { return saveExploreDoc(EXPLORE_GROUPS_KEY, GROUPS, slug, null); }

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
        // A denied/failed subscription silently leaves the caller on stale
        // localStorage — log the real reason (e.g. permission-denied when the
        // deployed rules predate the Explore collections).
        (e) => console.warn(`[explore] ${collectionName} subscription error:`, (e && e.code) || e),
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
