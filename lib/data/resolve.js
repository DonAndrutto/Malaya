// Shared override-resolution used by both the admin desk and the public catalogue.
// The admin writes partial patches per product id (see lib/overrides.js); this merges
// a product's studio base values with any saved patch into a single display record.

import { normalizeMaterial, resolveSpecials } from './materials';

// Coerce an admin-entered quantity (override or base) to a number, treating
// '' / null / undefined as "not tracked" rather than zero.
export function numOrNull(v) { return v === '' || v == null ? null : Number(v); }

export function resolveProduct(base, override) {
  const o = override || {};
  const val = (f) => (f in o ? o[f] : base[f]);
  const specials = resolveSpecials(base.tag, o);

  const listPrice = Number('listPrice' in o ? o.listPrice : base.listPrice) || base.listPrice;
  const rawSale = 'salePrice' in o ? o.salePrice : base.salePrice;
  const salePrice = rawSale === null || rawSale === undefined || rawSale === '' ? null : Number(rawSale);
  const onSale = salePrice != null && !isNaN(salePrice) && salePrice > 0 && salePrice < listPrice;

  // Gallery: prefer the override's image array, then a single legacy `img`
  // override, then the studio base photo. img stays = images[0] for the many
  // places that read a single `p.img` (cards, cart, mega menu).
  const images = Array.isArray(o.images) && o.images.length
    ? o.images
    : ('img' in o && o.img ? [o.img] : (base.img ? [base.img] : []));

  return {
    id: base.id,
    img: images[0] || base.img,
    images,
    story: 'story' in o && o.story != null ? o.story : (base.story || ''),
    code: val('salesCode'),
    salesCode: val('salesCode'),
    productionCode: val('productionCode'),
    name: val('name'),
    sub: val('sub'),
    category: val('category'),
    collection: val('collection'),
    material: normalizeMaterial(val('material')),
    stock: val('stock'),
    // Units on hand, as tracked in the admin Inventory desk (lib/data/inventory.js)
    // — the same number, never duplicated. Feeds catalogue ordering only; the
    // storefront never displays it.
    qty: numOrNull(val('qty')),
    tag: base.tag,
    specials,
    tashi: specials.includes('tashi'),
    // Explore knowledge-topic links (slugs into exploreTopics) — the single
    // source of truth for the product ↔ topic relationship (lib/explore.js).
    topics: Array.isArray(o.topics) ? o.topics : [],
    listPrice,
    salePrice,
    onSale,
    price: onSale ? salePrice : listPrice,
  };
}

// Resolve the full catalogue (array of PRODUCTS) against a map of overrides keyed by id.
export function resolveCatalogue(products, overrides = {}) {
  return products.map((p) =>
    resolveProduct({ ...p.base, id: p.id, img: p.img, tag: p.tag }, overrides[p.id])
  );
}
