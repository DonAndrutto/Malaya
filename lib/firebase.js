'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Firebase (client SDK) — lazy, browser-only initialisation. The web config
// itself lives in lib/firebase-config.js (shared with server code; not a
// secret — access is governed by the security rules in firebase/).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { firebaseConfig, FIREBASE_ENABLED } from './firebase-config';

export { FIREBASE_ENABLED };

let _app = null;
let _db = null;
let _storage = null;
let _auth = null;

// Returns { app, db, storage, auth } in the browser, or nulls during SSR.
export function getFirebase() {
  if (typeof window === 'undefined' || !FIREBASE_ENABLED) {
    return { app: null, db: null, storage: null, auth: null };
  }
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _db = getFirestore(_app);
    _storage = getStorage(_app);
    _auth = getAuth(_app);
  }
  return { app: _app, db: _db, storage: _storage, auth: _auth };
}
