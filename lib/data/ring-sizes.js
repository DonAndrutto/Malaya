// ─────────────────────────────────────────────────────────────────────────────
// Ring-size inventory (EU sizes 42–70).
//
// Ring size is an inventory attribute, not a product attribute: one SKU may
// hold stock in several sizes and never spawns a second SKU or listing.
// Quantities live on the item's override under `sizes` — a map of EU size →
// units on hand, e.g. { "50": 1, "52": 2, "54": 0 } — alongside the existing
// `qty`, which the admin keeps in step with the size total (see the commit
// handling in components/admin/Inventory.jsx). A size with no stock simply
// sells as made to order on the product page.
// ─────────────────────────────────────────────────────────────────────────────

export const RING_SIZE_MIN = 42;
export const RING_SIZE_MAX = 70;

export const RING_SIZES = [];
for (let s = RING_SIZE_MIN; s <= RING_SIZE_MAX; s += 1) RING_SIZES.push(s);

// Ring sizing applies to the Rings category only.
export function isRingCategory(category) { return category === 'Rings'; }

// Sanitize a stored/edited size map: keys clamped to the EU 42–70 ladder,
// quantities to non-negative integers. Returns null when nothing valid remains
// (the override field is dropped rather than storing an empty map).
export function normalizeRingSizes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let any = false;
  Object.keys(raw).forEach((k) => {
    const size = Math.round(Number(k));
    if (!(size >= RING_SIZE_MIN && size <= RING_SIZE_MAX)) return;
    const qty = Number(raw[k]);
    if (isNaN(qty)) return;
    out[String(size)] = Math.max(0, Math.round(qty));
    any = true;
  });
  return any ? out : null;
}

// Units on hand in one size (0 when untracked).
export function ringSizeQty(sizes, size) {
  const n = sizes ? Number(sizes[String(size)]) : NaN;
  return isNaN(n) ? 0 : n;
}

// Units on hand across every size.
export function ringSizesTotal(sizes) {
  if (!sizes) return 0;
  return Object.keys(sizes).reduce((sum, k) => sum + (Number(sizes[k]) || 0), 0);
}

// Tracked sizes in ladder order. Explicit zero entries stay visible ("54 (0)")
// so the admin sees exactly what is tracked, sold out included.
export function ringSizeEntries(sizes) {
  if (!sizes) return [];
  return Object.keys(sizes)
    .map((k) => ({ size: Number(k), qty: Number(sizes[k]) || 0 }))
    .sort((a, b) => a.size - b.size);
}

// Compact "50 (1) · 52 (3)" line for the inventory list and exports.
export function ringSizeSummary(sizes, sep = ' · ') {
  return ringSizeEntries(sizes).map((e) => `${e.size} (${e.qty})`).join(sep);
}
