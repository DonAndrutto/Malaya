'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Override layer shared between the admin console and the public catalogue.
//
// The admin writes partial patches per product id (name, price, stock, image
// URL, …). Those patches are mirrored to Firestore (collection `catalogueOverrides`,
// one document per product id) when Firebase is configured, with localStorage
// kept as a synchronous cache so the existing admin UI keeps working unchanged
// and the catalogue paints instantly before the live data arrives.
//
// Sensitive inventory fields (currently `unitCost`) are never written to the
// publicly-readable catalogueOverrides docs; they are split out into the
// admin-only `inventoryPrivate` collection (see firebase/firestore.rules) and
// merged back in for the admin via subscribeOverrides({ includePrivate }).
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';
import { pingRevalidate } from './revalidate-ping';

export const OVERRIDE_KEY = 'malaya:overrides:v1';
const COLLECTION = 'catalogueOverrides';
const PRIVATE_COLLECTION = 'inventoryPrivate';
// Fields that must never land in the publicly-readable override docs.
const PRIVATE_FIELDS = ['unitCost'];

export function loadOverrides() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; } catch { return {}; }
}

function writeLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch {}
}

const logWriteError = (id) => (err) => {
  // Surface failed mirrors (e.g. security rules rejecting a write) instead of
  // losing edits silently — the localStorage copy still holds the change.
  console.error(`[malaya] Failed to save override "${id}" to Firestore:`, err && err.code ? err.code : err);
};

// Split one override patch into its public part and its private part.
function splitPrivate(o) {
  if (!o) return { pub: o, priv: null };
  let priv = null;
  const pub = { ...o };
  PRIVATE_FIELDS.forEach((f) => {
    if (f in pub) {
      if (pub[f] !== null && pub[f] !== undefined) { priv = priv || {}; priv[f] = pub[f]; }
      delete pub[f];
    }
  });
  return { pub, priv };
}

// Persist the whole override map: localStorage immediately, then mirror only the
// changed per-product documents to Firestore (public and private split apart).
// Resolves `true` once every mirrored write landed (or there was nothing to
// mirror), `false` if any was rejected — callers that must sequence on the
// cloud copy (the Sales desk's inventory deduction) await this; everyone else
// can keep ignoring the result exactly as before (rejections are handled here,
// so nothing floats unhandled).
export function saveOverrides(obj) {
  const prev = loadOverrides();
  writeLocal(obj);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return Promise.resolve(true);
  const { db } = getFirebase();
  if (!db) return Promise.resolve(true);
  const jobs = [];
  const track = (p, id) => jobs.push(p.then(() => true, (err) => { logWriteError(id)(err); return false; }));
  try {
    const ids = new Set([...Object.keys(prev), ...Object.keys(obj)]);
    ids.forEach((id) => {
      if (JSON.stringify(prev[id] || null) === JSON.stringify(obj[id] || null)) return;
      const { pub, priv } = splitPrivate(obj[id]);
      const { priv: prevPriv } = splitPrivate(prev[id]);
      if (pub && Object.keys(pub).length) {
        track(setDoc(doc(db, COLLECTION, id), { ...pub, _updated: Date.now() }), id);
      } else {
        track(deleteDoc(doc(db, COLLECTION, id)), id);
      }
      if (priv) {
        track(setDoc(doc(db, PRIVATE_COLLECTION, id), { ...priv, _updated: Date.now() }), id);
      } else if (prevPriv) {
        track(deleteDoc(doc(db, PRIVATE_COLLECTION, id)), id);
      }
    });
  } catch {
    return Promise.resolve(false);
  }
  return Promise.all(jobs).then((oks) => {
    const ok = oks.every(Boolean);
    // Catalogue overrides feed the server-rendered HTML of every route
    // (prices, stock, publish flags) — purge it once the writes are ACKED.
    if (ok && jobs.length) pingRevalidate('site');
    return ok;
  });
}

// Subscribe to the canonical override map. Emits the local cache immediately,
// then live Firestore updates (falling back to cross-tab localStorage sync when
// Firebase is not configured). Returns an unsubscribe function.
//
// Options:
//   skipCache      — the caller already has fresher server-rendered data:
//                    don't emit the localStorage cache up front, and ignore
//                    Firestore snapshots served purely from its empty local
//                    cache (offline / blocked network) so they can't wipe the
//                    server data; only backend-confirmed snapshots apply.
//   includePrivate — also subscribe to the admin-only inventoryPrivate
//                    collection and merge its fields back in (admin console;
//                    requires an admin sign-in or the reads are denied).
export function subscribeOverrides(cb, { skipCache = false, includePrivate = false } = {}) {
  if (typeof window === 'undefined') return () => {};
  if (!skipCache || !FIREBASE_ENABLED) cb(loadOverrides());
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      let pub = null;
      let priv = includePrivate ? null : {};
      const emit = () => {
        if (!pub) return; // wait for the public snapshot; private is best-effort
        const merged = {};
        Object.keys(pub).forEach((id) => { merged[id] = { ...pub[id] }; });
        Object.keys(priv || {}).forEach((id) => {
          merged[id] = { ...(merged[id] || {}), ...priv[id] };
        });
        writeLocal(merged);
        cb(merged);
      };
      const unsubs = [
        onSnapshot(
          collection(db, COLLECTION),
          (snap) => {
            if (skipCache && snap.metadata.fromCache) return;
            const map = {};
            snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = rest; });
            pub = map;
            emit();
          },
          () => {},
        ),
      ];
      if (includePrivate) {
        unsubs.push(onSnapshot(
          collection(db, PRIVATE_COLLECTION),
          (snap) => {
            const map = {};
            snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = rest; });
            priv = map;
            emit();
          },
          () => { priv = {}; emit(); }, // non-admin: keep working without costs
        ));
      }
      return () => unsubs.forEach((u) => u());
    }
  }
  const onStorage = (e) => { if (e.key === OVERRIDE_KEY) cb(loadOverrides()); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export const MalayaOverrides = {
  KEY: OVERRIDE_KEY, load: loadOverrides, save: saveOverrides, subscribe: subscribeOverrides,
};
