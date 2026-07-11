import {
  RING_SIZES, RING_SIZE_MIN, RING_SIZE_MAX, isRingCategory,
  normalizeRingSizes, ringSizeQty, ringSizesTotal, ringSizeEntries, ringSizeSummary,
} from './ring-sizes';

describe('ring size ladder', () => {
  test('covers EU 42–70 inclusive', () => {
    expect(RING_SIZES[0]).toBe(RING_SIZE_MIN);
    expect(RING_SIZES[RING_SIZES.length - 1]).toBe(RING_SIZE_MAX);
    expect(RING_SIZES).toHaveLength(29);
  });

  test('only the Rings category is ring-sized', () => {
    expect(isRingCategory('Rings')).toBe(true);
    expect(isRingCategory('Pendants')).toBe(false);
    expect(isRingCategory(undefined)).toBe(false);
  });
});

describe('normalizeRingSizes', () => {
  test('keeps valid entries, including explicit zeros', () => {
    expect(normalizeRingSizes({ 50: 1, '52': 2, 54: 0 }))
      .toEqual({ 50: 1, 52: 2, 54: 0 });
  });

  test('drops out-of-range sizes and junk values', () => {
    expect(normalizeRingSizes({ 41: 1, 71: 1, 50: 'x', 52: '3' }))
      .toEqual({ 52: 3 });
  });

  test('clamps negatives and fractions to whole non-negative units', () => {
    expect(normalizeRingSizes({ 50: -2, 52: 1.6 })).toEqual({ 50: 0, 52: 2 });
  });

  test('returns null when nothing valid remains', () => {
    expect(normalizeRingSizes(null)).toBeNull();
    expect(normalizeRingSizes({})).toBeNull();
    expect(normalizeRingSizes({ 12: 1 })).toBeNull();
    expect(normalizeRingSizes([50, 52])).toBeNull();
  });
});

describe('reading a size map', () => {
  const sizes = { 50: 1, 52: 3, 54: 0, 57: 2 };

  test('ringSizeQty — 0 for untracked sizes', () => {
    expect(ringSizeQty(sizes, 52)).toBe(3);
    expect(ringSizeQty(sizes, '52')).toBe(3);
    expect(ringSizeQty(sizes, 60)).toBe(0);
    expect(ringSizeQty(null, 52)).toBe(0);
  });

  test('ringSizesTotal — the qty the SKU carries overall', () => {
    expect(ringSizesTotal(sizes)).toBe(6);
    expect(ringSizesTotal(null)).toBe(0);
  });

  test('ringSizeEntries — ladder order, zeros kept', () => {
    expect(ringSizeEntries(sizes)).toEqual([
      { size: 50, qty: 1 }, { size: 52, qty: 3 }, { size: 54, qty: 0 }, { size: 57, qty: 2 },
    ]);
    expect(ringSizeEntries(null)).toEqual([]);
  });

  test('ringSizeSummary — the "50 (1) · 52 (3)" admin line', () => {
    expect(ringSizeSummary(sizes)).toBe('50 (1) · 52 (3) · 54 (0) · 57 (2)');
  });
});

describe('resolved products carry sizes', () => {
  // The resolver wires the override's `sizes` map onto the storefront record
  // (product page selector + admin desk both read it from there).
  const { resolveProduct } = require('./resolve');
  const base = {
    id: 'r1', name: 'Dorje Ring', sub: 'Silver', category: 'Rings',
    collection: 'Ritual Objects', material: 'Silver 925', listPrice: 220,
    salePrice: null, stock: 'In stock', img: null, tag: null, salesCode: 'R017A-S',
  };

  test('override sizes surface on the product', () => {
    const p = resolveProduct(base, { sizes: { 50: 1, 52: 2 } });
    expect(p.sizes).toEqual({ 50: 1, 52: 2 });
  });

  test('no sizes → null (never an empty map)', () => {
    expect(resolveProduct(base, {}).sizes).toBeNull();
    expect(resolveProduct(base, undefined).sizes).toBeNull();
  });
});
