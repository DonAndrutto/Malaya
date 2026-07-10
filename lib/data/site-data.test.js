// Catalogue ordering (see compareCatalogueOrder in site-data.js):
//   1. Higher available stock (qty) first.
//   2. Sold-out pieces always sink below every in-stock piece.
//   3. Among sold-out pieces, ones marked New surface first.
//   4. Anything still tied keeps its prior relative order.
//
// The unit tests below exercise the comparator directly; the integration test
// drives the real buildSiteData() pipeline (resolve.js + ledger.js + this
// file) with a handful of real catalogue ids so a regression in how `qty` is
// threaded through overrides/ledger data is caught too, not just the sort.
import { buildSiteData, compareCatalogueOrder, isInStock, resolveHeroSlides } from './site-data';

const item = (over) => ({ stock: 'In stock', qty: null, specials: [], tag: null, ...over });

describe('compareCatalogueOrder', () => {
  test('ranks higher qty before lower qty among in-stock items', () => {
    const low = item({ qty: 2 });
    const high = item({ qty: 9 });
    expect(compareCatalogueOrder(high, low)).toBeLessThan(0);
    expect(compareCatalogueOrder(low, high)).toBeGreaterThan(0);
  });

  test('unknown quantity ranks below known quantities but still above sold out', () => {
    const known = item({ qty: 1 });
    const unknown = item({ qty: null });
    const soldOut = item({ stock: 'Sold out', qty: null });
    expect(compareCatalogueOrder(known, unknown)).toBeLessThan(0);
    expect(compareCatalogueOrder(unknown, soldOut)).toBeLessThan(0);
  });

  test('sold out always sinks below every in-stock item regardless of qty', () => {
    const soldOutHighQty = item({ stock: 'Sold out', qty: 999 });
    const inStockLowQty = item({ stock: 'In stock', qty: 1 });
    expect(compareCatalogueOrder(inStockLowQty, soldOutHighQty)).toBeLessThan(0);
    expect(compareCatalogueOrder(soldOutHighQty, inStockLowQty)).toBeGreaterThan(0);
  });

  test('among sold-out items, New-marked pieces surface first', () => {
    const soldOutNew = item({ stock: 'Sold out', specials: ['new'] });
    const soldOutOther = item({ stock: 'Sold out' });
    expect(compareCatalogueOrder(soldOutNew, soldOutOther)).toBeLessThan(0);
    expect(compareCatalogueOrder(soldOutOther, soldOutNew)).toBeGreaterThan(0);
  });

  test('the legacy `tag` field is honoured the same way the New badge reads it', () => {
    const soldOutTaggedNew = item({ stock: 'Sold out', tag: 'new' });
    const soldOutOther = item({ stock: 'Sold out' });
    expect(compareCatalogueOrder(soldOutTaggedNew, soldOutOther)).toBeLessThan(0);
  });

  test('equal-ranked items are left tied, leaving Array#sort to keep them stable', () => {
    expect(compareCatalogueOrder(item({ qty: 5 }), item({ qty: 5 }))).toBe(0);
    expect(compareCatalogueOrder(item({ stock: 'Sold out' }), item({ stock: 'Sold out' }))).toBe(0);
  });
});

describe('buildSiteData catalogue ordering', () => {
  test('applies all four priorities together across the built SITE_PRODUCTS list', () => {
    const overrides = {
      p001: { qty: 3, stock: 'In stock' },
      p002: { qty: 40, stock: 'In stock' },
      p003: { qty: 0, stock: 'Sold out', specials: ['new'] },
      p004: { qty: 0, stock: 'Sold out' },
      p005: { qty: null, stock: 'In stock' }, // untracked/made-to-order
    };
    const { SITE_PRODUCTS } = buildSiteData(overrides);
    const order = SITE_PRODUCTS.map((p) => p.id).filter((id) => overrides[id]);
    expect(order).toEqual(['p002', 'p001', 'p005', 'p003', 'p004']);
  });

  test('preserves the existing relative order for ties (priority 4)', () => {
    const overrides = {
      p010: { qty: 7, stock: 'In stock' },
      p011: { qty: 7, stock: 'In stock' },
    };
    const { SITE_PRODUCTS } = buildSiteData(overrides);
    const order = SITE_PRODUCTS.map((p) => p.id);
    // p010 precedes p011 in the studio catalogue source order; tied on every
    // sort key, they must stay in that order rather than swap.
    expect(order.indexOf('p010')).toBeLessThan(order.indexOf('p011'));
  });

  test('an admin-set quantity override reorders the catalogue without a separate stock edit', () => {
    const before = buildSiteData({}).SITE_PRODUCTS.map((p) => p.id);
    const { SITE_PRODUCTS } = buildSiteData({ p127: { qty: 10_000 } });
    expect(SITE_PRODUCTS[0].id).toBe('p127');
    expect(before[0]).not.toBe('p127');
  });
});

// The storefront "In Stock" filter: on-hand pieces only. 'Low stock' was
// merged into 'In stock' (stock-data.js) but legacy overrides may still carry
// the old string — both must pass; Sold out / Made to order must not.
describe('isInStock', () => {
  test('accepts In stock and the legacy Low stock in any casing', () => {
    expect(isInStock({ stock: 'In stock' })).toBe(true);
    expect(isInStock({ stock: 'In Stock' })).toBe(true);
    expect(isInStock({ stock: 'Low stock' })).toBe(true);
    expect(isInStock({ stock: 'Low Stock' })).toBe(true);
  });

  test('rejects sold-out, made-to-order, archived and missing statuses', () => {
    expect(isInStock({ stock: 'Sold out' })).toBe(false);
    expect(isInStock({ stock: 'Made to order' })).toBe(false);
    expect(isInStock({ stock: 'Archived' })).toBe(false);
    expect(isInStock({})).toBe(false);
    expect(isInStock(null)).toBe(false);
  });
});

// Homepage hero slides (resolveHeroSlides): category slides when configured,
// legacy plain slideshow otherwise.
describe('resolveHeroSlides', () => {
  const cfg = {
    heroCategories: {
      Rings: { img: 'https://x/rings.jpg', order: 2, enabled: true },
      Pendants: { img: 'https://x/pendants.jpg', order: 1, enabled: true, cta: 'Discover Pendants' },
      Earrings: { img: 'https://x/no.jpg', enabled: false }, // disabled → hidden
      Brooches: { enabled: true }, // no image → hidden
    },
    heroSlides: ['https://x/legacy.jpg'],
  };

  test('enabled categories with an image become ordered slides with View All CTAs', () => {
    const slides = resolveHeroSlides(cfg);
    expect(slides.map((s) => s.category)).toEqual(['Pendants', 'Rings']);
    expect(slides[0].cta).toBe('Discover Pendants'); // admin override
    expect(slides[1].cta).toBe('View All Rings'); // default CTA format
    expect(slides[1].href).toBe('#cat-Rings'); // catalogue section anchor
  });

  test('merged sections use their display label in the default CTA', () => {
    const slides = resolveHeroSlides({
      heroCategories: { Bracelets: { img: 'https://x/b.jpg', enabled: true } },
    });
    expect(slides[0].cta).toBe('View All Bracelets & Bangles');
    expect(slides[0].href).toBe('#cat-Bracelets');
  });

  test('falls back to the legacy plain slideshow when no category slide is live', () => {
    const slides = resolveHeroSlides({ heroSlides: ['https://x/a.jpg', 'https://x/b.jpg'] });
    expect(slides.map((s) => s.src)).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
    // No category binding: the component falls back to content.hero.cta.
    expect(slides[0].category).toBeNull();
    expect(slides[0].cta).toBeNull();
    expect(slides[0].href).toBe('#catalogue');
  });

  test('handles empty settings without crashing', () => {
    expect(resolveHeroSlides({})).toEqual([]);
    expect(resolveHeroSlides(undefined)).toEqual([]);
  });
});
