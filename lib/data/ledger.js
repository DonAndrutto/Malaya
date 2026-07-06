// ─────────────────────────────────────────────────────────────────────────────
// Stock-ledger → storefront bridge.
//
// The physical stock ledger (lib/data/stock-data.js, the studio "Total Stock"
// sheet) is the real inventory. Any line can be taken "online" from the admin
// (override field `published: true`) — at which point it becomes a first-class
// storefront product keyed by its SKU, carrying:
//
//   published : boolean   — visible on the live storefront
//   story     : string    — editable narrative/description (Firestore-saved)
//   images    : string[]  — gallery of uploaded image URLs (img = images[0])
//
// A line can be published with **no image at all** (image-independent); the
// storefront falls back to a monogram placeholder until photos are added later.
// These fields live on the same `catalogueOverrides/{sku}` doc the ledger desk
// already writes, so persistence/sync come for free (see lib/overrides.js).
// ─────────────────────────────────────────────────────────────────────────────

import { STOCK_ROWS, stockStatus } from './stock-data.js';
import { PRODUCTS } from './products.js';
import { normalizeMaterial, resolveSpecials } from './materials.js';

const PRODUCTS_BY_ID = {};
PRODUCTS.forEach((p) => { PRODUCTS_BY_ID[p.id] = p; });

// Classify a ledger line into a storefront collection (mirrors the catalogue
// heuristic so the existing collection filters keep working for published lines).
export function ledgerCollection(name) {
  const t = (name || '').toLowerCase();
  if (/\b(hri|om|ah|hung|tam|bam|dhi|dzam|syllable|mantra|tara)\b/.test(t)) return 'Heart Syllables';
  if (/(vajra|dorje|phurba|drigug|bell|melong|gau|chakra|mala|conch|banner|parasol|fish|knot|wheel|dharma|samaya)/.test(t)) return 'Ritual Objects';
  if (/(turquoise|coral|quartz|sapphire|ruby|onyx|agate|lapis|carnelian|stone|poppy|petal)/.test(t)) return 'Healing Stones';
  if (/(skull|dakini|deity|laughing|longevity)/.test(t)) return 'Mystical Beings';
  if (/diamond/.test(t)) return 'Malaya Splendor';
  return 'Malaya Collection';
}

// Base storefront record for a ledger line (before admin overrides). When the
// line is linked to a legacy catalogue product, borrow its photo as the default
// image so publishing a linked line keeps a picture; otherwise there is none.
export function ledgerStorefrontBase(row) {
  const linked = (row.productIds || []).map((id) => PRODUCTS_BY_ID[id]).filter(Boolean);
  const img = linked.length ? linked[0].img : null;
  return {
    id: row.sku,
    ledger: true,
    productIds: row.productIds || [],
    name: row.name,
    sub: row.material || '',
    category: row.category,
    material: row.material,
    collection: ledgerCollection(row.name),
    salesCode: row.sku,
    productionCode: row.code,
    listPrice: row.retail != null ? Math.round(row.retail) : null,
    salePrice: null,
    stock: stockStatus(row.qty),
    img,
    images: img ? [img] : [],
    story: '',
    tag: null,
  };
}

// Merge a ledger line's base with its admin override into a storefront product.
export function resolveLedgerStorefront(row, override) {
  const base = ledgerStorefrontBase(row);
  const o = override || {};
  const text = (f) => (f in o && o[f] != null && o[f] !== '' ? o[f] : base[f]);

  const listPrice = Number('retail' in o && o.retail != null ? o.retail : base.listPrice) || base.listPrice || 0;
  const rawSale = 'salePrice' in o ? o.salePrice : null;
  const salePrice = rawSale == null || rawSale === '' ? null : Number(rawSale);
  const onSale = salePrice != null && !isNaN(salePrice) && salePrice > 0 && listPrice && salePrice < listPrice;

  const images = Array.isArray(o.images) && o.images.length
    ? o.images
    : (o.img ? [o.img] : base.images);
  const stock = 'stock' in o ? o.stock : ('qty' in o ? stockStatus(Number(o.qty)) : base.stock);
  const specials = resolveSpecials(null, o);

  return {
    id: base.id,
    ledger: true,
    productIds: base.productIds,
    published: o.published === true,
    name: text('name'),
    sub: text('sub'),
    category: text('category'),
    material: normalizeMaterial(text('material')),
    collection: base.collection,
    salesCode: text('salesCode'),
    productionCode: text('productionCode'),
    listPrice,
    salePrice,
    onSale,
    price: onSale ? salePrice : listPrice,
    stock,
    img: images[0] || null,
    images,
    story: 'story' in o && o.story != null ? o.story : base.story,
    tag: null,
    specials,
    tashi: specials.includes('tashi'),
    topics: Array.isArray(o.topics) ? o.topics : [],
  };
}

export { STOCK_ROWS };
