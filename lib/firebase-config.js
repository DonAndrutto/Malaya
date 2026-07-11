// ─────────────────────────────────────────────────────────────────────────────
// Firebase web config — shared by the browser SDK bootstrap (lib/firebase.js)
// and server code that talks to Google's Identity Toolkit / Firestore REST
// endpoints (app/api/revalidate). A Firebase *web* config is not a secret: the
// apiKey only identifies the project; all access is governed by the Storage /
// Firestore security rules (see firebase/ in the repo root). The values below
// are the project defaults and can be overridden with NEXT_PUBLIC_FIREBASE_*
// env vars.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDiSC-I6ikROES0cVlOU1NLDaWbFNfVCVc',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'malaya-catalogue.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'malaya-catalogue',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'malaya-catalogue.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '216422624651',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:216422624651:web:60bff934f822dab03ad38e',
};

// True when we have enough config to talk to Firebase at all.
export const FIREBASE_ENABLED = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
