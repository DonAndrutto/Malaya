import { selectGridProducts } from './explore-shared';

test('stock priority is applied before slicing; opening and continuation do not overlap', () => {
  const items = [
    { id: 'sold', stock: 'Sold out' },
    { id: 'one', stock: 'In stock' },
    { id: 'order', stock: 'Made to order' },
    { id: 'two', stock: 'Low Stock' },
    { id: 'unknown' },
    { id: 'three', stock: 'IN-STOCK' },
  ];
  const before = [...items];
  const first = selectGridProducts(items, { stockFirst: true, limit: 2 });
  const rest = selectGridProducts(items, { stockFirst: true, offset: 2 });
  expect(first.map((p) => p.id)).toEqual(['one', 'two']);
  expect(rest.map((p) => p.id)).toEqual(['three', 'sold', 'order', 'unknown']);
  expect(new Set([...first, ...rest].map((p) => p.id)).size).toBe(items.length);
  expect(items).toEqual(before);
});

test('old grids retain their order and duplicate references consume only one slot', () => {
  const a = { id: 'a', stock: 'Sold out' };
  const b = { id: 'b', stock: 'In stock' };
  expect(selectGridProducts([a, null, a, b], { limit: 2 })).toEqual([a, b]);
});
