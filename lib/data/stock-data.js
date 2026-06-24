// Physical stock ledger — the studio's master inventory.
//
// The SKUs (and their data) come from lib/data/stock-ledger.json, which is the
// single source of truth, generated from the curated image-folder names by
// scripts/build-inventory.mjs (see that file / FIREBASE.md). Edit the JSON (or
// the CSV → `--from-csv`) and the change flows everywhere the ledger is used:
// the admin Stock-ledger desk, the published-storefront bridge (lib/data/ledger.js)
// and the catalogue's stock enrichment (STOCK_BY_CODE, below).
//
// Row shape: sku (full SALES CODE) · code (base PRODUCTION code) · name ·
// category · material · qty (units on hand) · cost (unit cost USD) ·
// retail (list retail USD) · productId / productIds (linked catalogue listings).

import LEDGER from './stock-ledger.json';

export const STOCK_ROWS = LEDGER.map((r) => ({
  sku: r.sku,
  code: r.code || String(r.sku).split('-')[0],
  name: r.name || r.sku,
  category: r.category || 'Accessories',
  material: r.material || 'Silver',
  qty: r.qty == null || r.qty === '' ? null : Number(r.qty),
  cost: r.cost == null || r.cost === '' ? null : Number(r.cost),
  retail: r.retail == null || r.retail === '' ? null : Number(r.retail),
  productId: r.productId || null,
  productIds: Array.isArray(r.productIds) ? r.productIds : [],
}));

export const STOCK_BY_CODE = {};
STOCK_ROWS.forEach((r) => { STOCK_BY_CODE[r.sku] = r; });

// "Low stock" has been merged into "In stock" — anything on hand reads as
// In stock; the studio gauges low quantities from the Units column + sorting.
export function stockStatus(qty) {
  if (qty == null) return 'Made to order';
  if (qty <= 0) return 'Sold out';
  return 'In stock';
}
