'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Editable site copy & links — every real piece of page text and every external
// link (hero/about/tashi/footer copy, contact details, social URLs, …). Stored
// in Firestore at `siteSettings/content` (single document) with a localStorage
// cache, mirroring lib/site-settings.js. The saved object is a partial, nested
// patch over CONTENT_DEFAULTS (see lib/data/site-data.js → resolveContent);
// unset slots fall back to the studio defaults so the live site is unchanged
// until something is edited.
// ─────────────────────────────────────────────────────────────────────────────

import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';
import { pingRevalidate } from './revalidate-ping';

export const SITE_CONTENT_KEY = 'malaya:site-content:v1';
const COLLECTION = 'siteSettings';
const DOC_ID = 'content';

export function loadSiteContent() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SITE_CONTENT_KEY)) || {}; } catch { return {}; }
}

function writeLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SITE_CONTENT_KEY, JSON.stringify(obj)); } catch {}
}

export function saveSiteContent(obj) {
  writeLocal(obj);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return;
  const { db } = getFirebase();
  if (!db) return;
  setDoc(doc(db, COLLECTION, DOC_ID), { ...obj, _updated: Date.now() }).then(
    // Site copy feeds the server-rendered layout of every route — purge it.
    () => pingRevalidate('site'),
    // A rejected write must not be swallowed while the UI implies "saved".
    (err) => console.error('[malaya] Failed to save site content to Firestore:', err && err.code ? err.code : err),
  );
}

// { skipCache } suppresses the immediate localStorage emit when the caller
// already has fresher server-rendered data (see app/(store)/layout.jsx).
export function subscribeSiteContent(cb, { skipCache = false } = {}) {
  if (typeof window === 'undefined') return () => {};
  if (!skipCache || !FIREBASE_ENABLED) cb(loadSiteContent());
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      return onSnapshot(
        doc(db, COLLECTION, DOC_ID),
        (snap) => {
          // A cache-only miss (offline/blocked network) must not wipe the
          // caller's server-rendered data.
          if (skipCache && snap.metadata.fromCache) return;
          const data = snap.exists() ? snap.data() : {};
          const { _updated, ...rest } = data;
          writeLocal(rest);
          cb(rest);
        },
        () => {},
      );
    }
  }
  const onStorage = (e) => { if (e.key === SITE_CONTENT_KEY) cb(loadSiteContent()); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
