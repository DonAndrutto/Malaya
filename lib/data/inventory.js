// ─────────────────────────────────────────────────────────────────────────────
// Unified inventory — the single "list of items" behind the admin desk.
//
// Historically the admin had two overlapping lists: the studio price-sheet
// catalogue (lib/data/products.js, keyed p001…) and the physical stock ledger
// (lib/data/stock-data.js, keyed by SKU). They overlap — a ledger line can be
// linked to one or more catalogue listings — so showing both was redundant.
//
// This module merges them into one de-duplicated list of "entities":
//
//   • Every catalogue product (rich, fully-priced, public-facing). It already
//     carries the matched ledger line's qty/unit-cost (see products.js stock
//     enrichment), so the inventory numbers come along for free. Edits are saved
//     under the product id — exactly the override the live catalogue reads, so
//     the storefront is unaffected.
//
//   • Every ledger SKU that is NOT linked to a catalogue listing (the physical
//     inventory that has no price-sheet entry). Edits are saved under the SKU,
//     and the publish toggle takes the line online — exactly as the old ledger
//     desk did.
//
// Linked ledger lines are represented by their catalogue listing (the richer
// record), so each physical piece appears exactly once.
// ─────────────────────────────────────────────────────────────────────────────

import { PRODUCTS, MATERIALS } from './products';
import { STOCK_ROWS, stockStatus } from './stock-data';
import { ledgerCollection } from './ledger';
import { SITE_EXTRAS } from './site-data';

// Catalogue ids that are already represented by a ledger line, so the standalone
// catalogue entity is the canonical record and the linked ledger rows fold in.
const LINKED_CATALOGUE_IDS = new Set();
STOCK_ROWS.forEach((r) => (r.productIds || []).forEach((id) => LINKED_CATALOGUE_IDS.add(id)));

// A catalogue product → unified entity (override key = product id).
function catalogueEntity(p) {
  const b = p.base;
  return {
    key: p.id,
    kind: 'catalogue',
    sku: b.salesCode || null,
    productIds: [p.id],
    base: {
      name: b.name, sub: b.sub, category: b.category, collection: b.collection,
      material: b.material, qty: b.qty, unitCost: b.unitCost,
      retail: p.listPrice, salePrice: null,
      salesCode: b.salesCode, productionCode: b.productionCode,
      stock: b.stock, img: p.img, images: p.img ? [p.img] : [], story: '',
    },
  };
}

// A ledger-only SKU → unified entity (override key = SKU).
function ledgerEntity(r) {
  return {
    key: r.sku,
    kind: 'ledger',
    sku: r.sku,
    productIds: [],
    base: {
      name: r.name || '', sub: r.material || '', category: r.category,
      collection: ledgerCollection(r.name), material: r.material || '',
      qty: r.qty, unitCost: r.cost, retail: r.retail, salePrice: null,
      salesCode: r.sku, productionCode: r.code, stock: stockStatus(r.qty),
      img: null, images: [], story: '',
    },
  };
}

// A live-site "extra" (Tashi Mannox earrings/brooches/cufflinks, …) → unified
// entity. These have no price-sheet code; edits save under the x-id, exactly the
// override the storefront reads (extras are now fully override-aware).
function extraEntity(p) {
  return {
    key: p.id,
    kind: 'extra',
    sku: null,
    productIds: [p.id],
    base: {
      name: p.name, sub: p.sub, category: p.category, collection: p.collection,
      material: p.material, qty: null, unitCost: null,
      retail: p.listPrice, salePrice: null, salesCode: '', productionCode: '',
      stock: p.stock || 'In stock', img: p.img,
      images: p.images && p.images.length ? p.images : (p.img ? [p.img] : []), story: '',
    },
  };
}

export const INVENTORY = [
  ...PRODUCTS.map(catalogueEntity),
  ...STOCK_ROWS.filter((r) => !(r.productIds && r.productIds.length)).map(ledgerEntity),
  ...SITE_EXTRAS.map(extraEntity),
];

export const INVENTORY_BY_KEY = {};
INVENTORY.forEach((e) => { INVENTORY_BY_KEY[e.key] = e; });

// A ledger SKU that has no name, price or quantity yet — a placeholder created
// from a curated image folder, not a real catalogue item. Hidden by default.
export function isBlankEntity(e) {
  return e.kind === 'ledger' && !(e.base.name && e.base.name.trim())
    && e.base.retail == null && e.base.qty == null && e.base.unitCost == null;
}

// ── Metal grouping (for bulk price adjustments) ──────────────────────────────
// "Gold" = solid gold (14k/18k, including white & rose gold alloys), whose value
// tracks the gold spot price, so the studio can adjust all gold pieces at once.
// "Silver" covers the silver-core pieces — plain silver plus vermeil and gold-
// plated, which are gold over a silver base. Platinum stands alone.
export const METAL_GROUPS = {
  Gold: ['18k Gold', '14k Gold', 'White Gold', 'Rose Gold'],
  Silver: ['Silver', 'Vermeil', 'Gold Plated'],
  Platinum: ['Platinum'],
};

export function metalGroupOf(material) {
  for (const g of Object.keys(METAL_GROUPS)) {
    if (METAL_GROUPS[g].includes(material)) return g;
  }
  return null;
}

// Scope options for the bulk-adjust modal: all items, by metal group, or by an
// exact material. Encoded as "" | "group:Gold" | "mat:18k Gold".
export const METAL_SCOPES = [
  { value: '', label: 'All metals' },
  ...Object.keys(METAL_GROUPS).map((g) => ({ value: `group:${g}`, label: `${g} — all types`, group: true })),
  ...MATERIALS.map((m) => ({ value: `mat:${m}`, label: m })),
];

export function matchesMetalScope(scope, material) {
  if (!scope) return true;
  if (scope.startsWith('group:')) {
    const g = scope.slice(6);
    return (METAL_GROUPS[g] || []).includes(material);
  }
  if (scope.startsWith('mat:')) return material === scope.slice(4);
  return true;
}

// ── Duplicate detection helpers (for the merge assistant) ────────────────────
// Words that only describe a variant (metal, colour, size, stones) — stripped so
// the same design in different materials/sizes collapses to one name. The item
// type (pendant/earrings/…) is kept and groups are keyed by category too, so a
// pendant and earrings of the same syllable are never treated as duplicates.
const VARIANT_WORDS = new Set([
  'silver', 'gold', 'vermeil', 'plated', 'goldplated', '14k', '18k', 'white', 'rose', 'yellow', 'platinum',
  'cz', 'diamond', 'diamonds', 'enamel', 'green', 'blue', 'red', 'black', 'sapphire', 'ruby', 'coral', 'turquoise',
  'with', 'and', 'the', 'of', 'a', 'small', 'smaller', 'large', 'larger', 'big', 'bigger', 'medium', 'mid',
  'mini', 'micro', 'solid', 'pair', 'set', 'frameless', 'openable', 'hanging', 'flat', 'round', 'oval', 'size',
]);

export function normalizeName(name, sub = '') {
  return `${name || ''} ${sub || ''}`
    .toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w && !VARIANT_WORDS.has(w)).join(' ').trim();
}

// Group key used by the duplicate finder: same category + same normalised name.
export function dupKey(item) {
  return `${item.category || ''}|${normalizeName(item.name, item.sub)}`;
}

// Pick the most likely "master" of a duplicate group: most images wins, then a
// real item code, then catalogue/ledger over a code-less extra.
const KIND_RANK = { catalogue: 0, ledger: 1, extra: 2 };
export function pickMaster(items) {
  return items.slice().sort((a, b) => {
    const ai = (a.images || []).length, bi = (b.images || []).length;
    if (bi !== ai) return bi - ai;
    const ac = a.salesCode || a.productionCode ? 0 : 1;
    const bc = b.salesCode || b.productionCode ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
  })[0];
}
