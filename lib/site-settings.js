'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site-element image settings — hero slideshow, banners, the Tashi portrait, etc.
// Stored in Firestore at `siteSettings/images` (single document) with a
// localStorage cache, mirroring the override layer's pattern.
//
// Known slots (all optional — defaults from lib/data/site-data.js are used when
// a slot is unset):
//   heroSlides:  string[]   home hero slideshow
//   homeTiles:   { Rings, Bracelets, Earrings, Pendants: url }
//   homeBanner:  string     "Order Now" banner
//   pageBanner:  string     default breadcrumb banner
//   aboutBanner: string
//   tashiPhoto:  string     Tashi Mannox portrait (collaboration page)
//   tashiBadge:  string     Tashi Mannox corner badge (catalogue cards / product pages)
//   logo:        string
//   imgPos:      { [imageUrl]: "x% y%" }  focal point for cover-cropped
//                                         hero/tile/banner images (admin-dragged)
// ─────────────────────────────────────────────────────────────────────────────

import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export const SITE_SETTINGS_KEY = 'malaya:site-settings:v1';
const COLLECTION = 'siteSettings';
const DOC_ID = 'images';

export function loadSiteSettings() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY)) || {}; } catch { return {}; }
}

function writeLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(obj)); } catch {}
}

export function saveSiteSettings(obj) {
  writeLocal(obj);
  if (!FIREBASE_ENABLED || typeof window === 'undefined') return;
  const { db } = getFirebase();
  if (!db) return;
  setDoc(doc(db, COLLECTION, DOC_ID), { ...obj, _updated: Date.now() }).catch(() => {});
}

export function subscribeSiteSettings(cb) {
  if (typeof window === 'undefined') return () => {};
  cb(loadSiteSettings());
  if (FIREBASE_ENABLED) {
    const { db } = getFirebase();
    if (db) {
      return onSnapshot(
        doc(db, COLLECTION, DOC_ID),
        (snap) => {
          const data = snap.exists() ? snap.data() : {};
          const { _updated, ...rest } = data;
          writeLocal(rest);
          cb(rest);
        },
        () => {},
      );
    }
  }
  const onStorage = (e) => { if (e.key === SITE_SETTINGS_KEY) cb(loadSiteSettings()); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
