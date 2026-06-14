// Shared override-resolution used by both the admin desk and the public catalogue.
// The admin writes partial patches per product id (see lib/overrides.js); this merges
// a product's studio base values with any saved patch into a single display record.

export function resolveProduct(base, override) {
  const o = override || {};
  const val = (f) => (f in o ? o[f] : base[f]);

  const listPrice = Number('listPrice' in o ? o.listPrice : base.listPrice) || base.listPrice;
  const rawSale = 'salePrice' in o ? o.salePrice : base.salePrice;
  const salePrice = rawSale === null || rawSale === undefined || rawSale === '' ? null : Number(rawSale);
  const onSale = salePrice != null && !isNaN(salePrice) && salePrice > 0 && salePrice < listPrice;

  return {
    id: base.id,
    img: ('img' in o && o.img) ? o.img : base.img,
    code: val('salesCode'),
    salesCode: val('salesCode'),
    productionCode: val('productionCode'),
    name: val('name'),
    sub: val('sub'),
    category: val('category'),
    collection: val('collection'),
    material: val('material'),
    stock: val('stock'),
    tag: base.tag,
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
