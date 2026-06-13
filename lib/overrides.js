// localStorage override layer shared between admin and catalogue.
// The admin writes partial patches per product id; catalogue reads them on load.
// Swap saveOverrides() body to a POST /api/overrides call when ready for a real backend.

export const OVERRIDE_KEY = 'malaya:overrides:v1';

export function loadOverrides() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; }
  catch { return {}; }
}

export function saveOverrides(obj) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(obj)); } catch {}
}

export const MalayaOverrides = { KEY: OVERRIDE_KEY, load: loadOverrides, save: saveOverrides };
