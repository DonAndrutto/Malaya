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
// Two reserved keys extend the patch model beyond plain field edits:
//   _deleted : true   — soft-delete. The item is hidden from the storefront and
//                       the admin lists; clearing the flag restores it.
//   _custom  : true   — a brand-new item created in the admin. The doc is the
//                       whole record (no static base behind it); buildSiteData
//                       publishes it like a ledger line. Hard-deleting one just
//                       removes its doc.
// ─────────────────────────────────────────────────────────────────────────────

import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export const OVERRIDE_KEY = 'malaya:overrides:v1';
const COLLECTION = 'catalogueOverrides';

export function loadOverrides() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; } catch { return {}; }
}

function writeLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch {}
}

// Persist the whole override map: localStorage immediately, then mirror only the
// changed per-product documents to Firestore.
export function saveOverrides(obj) {
  const prev = loadOverrides();
  writeLocal(obj);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return;
  const { db } = getFirebase();
  if (!db) return;
  try {
    const ids = new Set([...Object.keys(prev), ...Object.keys(obj)]);
    ids.forEach((id) => {
      if (JSON.stringify(prev[id] || null) === JSON.stringify(obj[id] || null)) return;
      if (obj[id] && Object.keys(obj[id]).length) {
        setDoc(doc(db, COLLECTION, id), { ...obj[id], _updated: Date.now() }).catch(() => {});
      } else {
        deleteDoc(doc(db, COLLECTION, id)).catch(() => {});
      }
    });
  } catch {}
}

// Subscribe to the canonical override map. Emits the local cache immediately,
// then live Firestore updates (falling back to cross-tab localStorage sync when
// Firebase is not configured). Returns an unsubscribe function.
export function subscribeOverrides(cb) {
  if (typeof window === 'undefined') return () => {};
  cb(loadOverrides());
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      return onSnapshot(
        collection(db, COLLECTION),
        (snap) => {
          const map = {};
          snap.forEach((d) => { const { _updated, ...rest } = d.data(); map[d.id] = rest; });
          writeLocal(map);
          cb(map);
        },
        () => {},
      );
    }
  }
  const onStorage = (e) => { if (e.key === OVERRIDE_KEY) cb(loadOverrides()); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export const MalayaOverrides = {
  KEY: OVERRIDE_KEY, load: loadOverrides, save: saveOverrides, subscribe: subscribeOverrides,
};
