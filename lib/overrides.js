// Override layer shared between the admin desk and the public catalogue.
//
// The server (/api/overrides, backed by KV) is the source of truth so studio edits
// are visible to every visitor. localStorage is kept as a fast local cache: it paints
// instantly on load and syncs across tabs in the same browser via the `storage` event.
//
// Flow: admin edits → saveOverrides() writes the cache and debounce-pushes to the
// server; catalogue/admin load → fetchOverrides() pulls the shared copy from the server.

export const OVERRIDE_KEY = 'malaya:overrides:v1';

// ── Local cache (localStorage) ──────────────────────────────────────────────
export function loadOverrides() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; }
  catch { return {}; }
}

// Write the cache only — does not push to the server. Used when applying a copy
// just fetched from the server, to avoid a redundant round-trip.
export function saveOverridesLocal(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch {}
}

// Write the cache and persist to the shared server store (debounced).
export function saveOverrides(obj) {
  saveOverridesLocal(obj);
  schedulePush(obj);
}

// ── Server sync ──────────────────────────────────────────────────────────────
export async function fetchOverrides() {
  if (typeof window === 'undefined') return {};
  const res = await fetch('/api/overrides', { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchOverrides ${res.status}`);
  const data = await res.json();
  return data.overrides || {};
}

let pushTimer = null;
let pending = null;

function schedulePush(obj) {
  if (typeof window === 'undefined') return;
  pending = obj;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 600);
}

async function flushPush() {
  if (pending == null) return;
  const overrides = pending;
  pending = null;
  try {
    await fetch('/api/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    });
  } catch {
    // Offline or server error — the localStorage cache still holds the edit;
    // it will be re-pushed on the next change.
  }
}

export const MalayaOverrides = { KEY: OVERRIDE_KEY, load: loadOverrides, save: saveOverrides, fetch: fetchOverrides };
