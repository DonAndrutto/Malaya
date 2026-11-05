import { normaliseStoneCopy } from './product-copy';
import { resolveProduct } from './resolve';
import { resolveLedgerStorefront } from './ledger';

test('normalises the old stone name without changing genuine diamonds or SKU codes', () => {
  expect(normaliseStoneCopy('White CZ Diamonds, natural diamonds, P001-CZ')).toBe('White cubic zirconia, natural diamonds, P001-CZ');
  expect(normaliseStoneCopy(null)).toBeNull();
});

test('both catalogue and ledger resolve corrected copy from base and override data', () => {
  const base = { id: 'test', name: 'CZ Diamonds Pendant', sub: 'CZ diamonds', story: 'Set with CZ Diamonds.', listPrice: 10 };
  const row = { sku: 'test', name: base.name, retail: 10 };
  const catalogue = resolveProduct(base, {});
  const ledger = resolveLedgerStorefront(row, { sub: base.sub, story: base.story, published: true });
  for (const p of [catalogue, ledger]) {
    expect(p.name).toBe('cubic zirconia Pendant');
    expect(p.sub).toBe('cubic zirconia');
    expect(p.story).toBe('Set with cubic zirconia.');
    expect(p.price).toBe(10);
  }
  expect(resolveProduct(base, { name: 'Owner title', sub: 'CZ Diamonds' }).name).toBe('Owner title');
  expect(base.name).toBe('CZ Diamonds Pendant');
});
