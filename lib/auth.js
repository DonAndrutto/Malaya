'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Admin authentication — Firebase Auth (email / password).
//
// The /admin console signs in against Firebase Auth so that the tightened
// security rules (`request.auth != null`) accept its writes. Create the studio
// user once in the Firebase console (Authentication → Email/Password), then sign
// in with that email + password.
//
// When Firebase isn't configured (FIREBASE_ENABLED === false, e.g. a bare local
// checkout), the admin falls back to the previous demo behaviour so you can't
// lock yourself out — see AdminApp.
// ─────────────────────────────────────────────────────────────────────────────

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase, FIREBASE_ENABLED } from './firebase';

export { FIREBASE_ENABLED };

// True when the signed-in user is an actual admin — the `admin` custom claim
// (scripts/grant-admin.mjs) or an allowlist document at admins/{uid}, the same
// definition the security rules enforce (firebase/firestore.rules isAdmin()).
// The rules are the real boundary; this check exists so a self-registered
// account is told "no admin access" instead of being shown an admin shell
// whose every read is silently denied.
export async function checkIsAdmin(user) {
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult();
    if (token && token.claims && token.claims.admin === true) return true;
  } catch {}
  try {
    const { db } = getFirebase();
    if (!db) return false;
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

// Sign in with email + password. Resolves to the Firebase user, or throws a
// Firebase auth error (see friendlyAuthError for readable messages).
export async function signIn(email, password) {
  const { auth } = getFirebase();
  if (!auth) throw new Error('Authentication is unavailable in this context.');
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOutUser() {
  const { auth } = getFirebase();
  if (auth) await signOut(auth);
}

// Subscribe to auth state. Emits the current user (or null) immediately and on
// every change. Returns an unsubscribe function.
export function subscribeAuth(cb) {
  const { auth } = getFirebase();
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

// Map Firebase auth error codes to messages suitable for the sign-in form.
export function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  switch (code) {
    case 'auth/invalid-email': return 'That email address looks invalid.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/too-many-requests': return 'Too many attempts — try again shortly.';
    case 'auth/network-request-failed': return 'Network error — check your connection.';
    case 'auth/operation-not-allowed': return 'Email/Password sign-in is not enabled for this project.';
    default: return (err && err.message) ? err.message : 'Sign-in failed.';
  }
}
