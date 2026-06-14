'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Firebase (client SDK) — lazy, browser-only initialisation.
//
// A Firebase *web* config is not a secret: the apiKey only identifies the
// project; all access is governed by the Storage / Firestore security rules
// (see firebase/ in the repo root). The values below are the project defaults
// and can be overridden with NEXT_PUBLIC_FIREBASE_* env vars.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDiSC-I6ikROES0cVlOU1NLDaWbFNfVCVc',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'malaya-catalogue.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'malaya-catalogue.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '216422624651',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:216422624651:web:60bff934f822dab03ad38e',
};

// True when we have enough config to talk to Firebase at all.
export const FIREBASE_ENABLED = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

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
