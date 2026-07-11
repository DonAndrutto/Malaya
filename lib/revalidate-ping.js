'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Ping the storefront's on-demand revalidation endpoint (app/api/revalidate)
// after an ACKED admin write, so the server-rendered HTML picks the change up
// on the next request instead of waiting out the 5-minute ISR TTL.
//
// Debounced per scope so autosave bursts and multi-document operations
// collapse into one purge; fire-and-forget because a failed ping only means
// falling back to the TTL. Sends the signed-in admin's Firebase ID token —
// the endpoint verifies it and rejects anonymous calls.
// ─────────────────────────────────────────────────────────────────────────────

import { getFirebase, FIREBASE_ENABLED } from './firebase';

const timers = {};

export function pingRevalidate(scope) {
  if (typeof window === 'undefined' || !FIREBASE_ENABLED) return;
  clearTimeout(timers[scope]);
  timers[scope] = setTimeout(async () => {
    try {
      const { auth } = getFirebase();
      const user = auth ? auth.currentUser : null;
      const token = user ? await user.getIdToken() : null;
      if (!token) return; // signed out — the endpoint would reject the call
      await fetch(`/api/revalidate?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {}
  }, 1200);
}
