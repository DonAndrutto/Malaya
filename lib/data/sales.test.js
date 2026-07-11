import {
  formatOrderNumber, parseOrderNumber, nextOrderNumberFromList,
  blankOrder, normalizeOrder, duplicateOrder,
  lineTotal, orderTotals, filterOrders, ORDER_SORTS,
  clientStats, isPurchaseStatus, statusLabel, statusRank,
  shouldDeductInventory, inventoryDeductionPatches,
  ordersCsv, invoiceHtml, fmtMoney, CURRENCIES,
} from './sales';

const item = (over = {}) => ({ productId: null, name: 'Dorje Ring', sku: 'R017A-S', metal: 'Silver 925', ringSize: null, qty: 1, unitPrice: 240, discount: null, ...over });
const order = (over = {}) => normalizeOrder({ ...blankOrder({ number: 'MJ-2026-0001', now: 1000 }), ...over }, over.id || 'o1');

describe('order numbers', () => {
  test('format MJ-YYYY-NNNN, zero-padded', () => {
    expect(formatOrderNumber(2026, 42)).toBe('MJ-2026-0042');
    expect(formatOrderNumber('2026', 12345)).toBe('MJ-2026-12345');
  });

  test('parse round-trips and rejects junk', () => {
    expect(parseOrderNumber('MJ-2026-0042')).toEqual({ year: 2026, seq: 42 });
    expect(parseOrderNumber('nope')).toBeNull();
  });

  test('fallback allocation continues the current year and ignores other years', () => {
    const now = new Date('2026-07-11T12:00:00Z');
    const orders = [{ number: 'MJ-2026-0041' }, { number: 'MJ-2025-0900' }, { number: 'garbage' }];
    expect(nextOrderNumberFromList(orders, now)).toBe('MJ-2026-0042');
    expect(nextOrderNumberFromList([], now)).toBe('MJ-2026-0001');
  });
});

describe('totals', () => {
  test('line total = qty × unit − discount, floored at zero', () => {
    expect(lineTotal(item({ qty: 2, unitPrice: 240 }))).toBe(480);
    expect(lineTotal(item({ qty: 2, unitPrice: 240, discount: 40 }))).toBe(440);
    expect(lineTotal(item({ qty: 1, unitPrice: 10, discount: 99 }))).toBe(0);
    expect(lineTotal(item({ qty: -3, unitPrice: 240 }))).toBe(0);
  });

  test('order totals sum items and discounts', () => {
    const o = order({ items: [item({ qty: 2, unitPrice: 240, discount: 40 }), item({ qty: 1, unitPrice: 100 })] });
    expect(orderTotals(o)).toEqual({ subtotal: 580, discount: 40, total: 540, units: 3 });
  });

  test('blank orders and junk items do not explode', () => {
    expect(orderTotals(order())).toEqual({ subtotal: 0, discount: 0, total: 0, units: 0 });
    expect(orderTotals(order({ items: [{ qty: 'x', unitPrice: 'y' }] })).total).toBe(0);
  });

  test('money formatting knows every supported currency', () => {
    expect(CURRENCIES).toEqual(['BTN', 'USD', 'EUR', 'GBP']);
    expect(fmtMoney(1200, 'USD')).toBe('$1,200');
    expect(fmtMoney(99.5, 'EUR')).toBe('€99.50');
    expect(fmtMoney(500, 'BTN')).toBe('Nu. 500');
    expect(fmtMoney(10, 'XXX')).toBe('10 XXX');
  });
});

describe('lifecycle', () => {
  test('every requested status exists with a label', () => {
    ['draft', 'pending_payment', 'paid', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'refunded']
      .forEach((k) => expect(statusLabel(k)).not.toBe('—'));
    expect(statusLabel('pending_payment')).toBe('Pending Payment');
  });

  test('purchase statuses are paid and later; cancelled/refunded are not', () => {
    expect(isPurchaseStatus('paid')).toBe(true);
    expect(isPurchaseStatus('delivered')).toBe(true);
    expect(isPurchaseStatus('pending_payment')).toBe(false);
    expect(isPurchaseStatus('cancelled')).toBe(false);
    expect(isPurchaseStatus('refunded')).toBe(false);
  });
});

describe('filters & sorts', () => {
  const orders = [
    order({ id: 'a', number: 'MJ-2026-0001', status: 'paid', currency: 'USD', createdAt: new Date('2026-01-10').getTime(), customer: { clientId: 'k1', name: 'Ana' }, items: [item()] }),
    order({ id: 'b', number: 'MJ-2026-0002', status: 'draft', currency: 'EUR', createdAt: new Date('2026-03-05').getTime(), customer: { clientId: null, name: 'Ben' }, items: [item({ name: 'Vajra Pendant', sku: 'P001' })] }),
    order({ id: 'c', number: 'MJ-2026-0003', status: 'paid', currency: 'USD', createdAt: new Date('2026-07-01').getTime(), customer: { clientId: 'k1', name: 'Ana' } }),
  ];

  test('search matches number, customer and item text', () => {
    expect(filterOrders(orders, { q: 'vajra' }).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(orders, { q: '0003' }).map((o) => o.id)).toEqual(['c']);
    expect(filterOrders(orders, { q: 'ana' }).map((o) => o.id)).toEqual(['a', 'c']);
  });

  test('status, currency, customer and date-range filters', () => {
    expect(filterOrders(orders, { status: 'draft' }).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(orders, { currency: 'EUR' }).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(orders, { customer: 'k1' }).map((o) => o.id)).toEqual(['a', 'c']);
    expect(filterOrders(orders, { customer: 'Ben' }).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(orders, { from: '2026-02-01', to: '2026-06-30' }).map((o) => o.id)).toEqual(['b']);
    expect(filterOrders(orders, { to: '2026-01-10' }).map((o) => o.id)).toEqual(['a']);
  });

  test('sorts by date and total', () => {
    const byDate = orders.slice().sort(ORDER_SORTS.date);
    expect(byDate.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    const byTotal = orders.slice().sort(ORDER_SORTS.total);
    expect(byTotal[0].id).toBe('c'); // no items → 0
  });
});

describe('clientStats', () => {
  test('derives order history and per-currency lifetime totals from purchases only', () => {
    const orders = [
      order({ id: 'a', status: 'paid', currency: 'USD', createdAt: 3, customer: { clientId: 'k1', name: 'Ana' }, items: [item({ unitPrice: 100 })] }),
      order({ id: 'b', status: 'delivered', currency: 'EUR', createdAt: 2, customer: { clientId: 'k1', name: 'Ana' }, items: [item({ unitPrice: 50 })] }),
      order({ id: 'c', status: 'cancelled', currency: 'USD', createdAt: 1, customer: { clientId: 'k1', name: 'Ana' }, items: [item({ unitPrice: 999 })] }),
      order({ id: 'd', status: 'paid', currency: 'USD', customer: { clientId: 'k2', name: 'Ben' }, items: [item({ unitPrice: 1 })] }),
    ];
    const stats = clientStats('k1', orders);
    expect(stats.count).toBe(3);
    expect(stats.orders.map((o) => o.id)).toEqual(['a', 'b', 'c']); // newest first
    expect(stats.lifetime).toEqual({ USD: 100, EUR: 50 });
  });
});

describe('duplicateOrder', () => {
  test('copies customer, currency, items and production notes; resets lifecycle', () => {
    const src = order({
      status: 'delivered', currency: 'EUR',
      customer: { clientId: 'k1', name: 'Ana', email: 'a@x.com' },
      items: [item({ qty: 2 })], productionNotes: 'engrave OM',
      payment: { method: 'Cash', status: 'paid', date: '2026-01-01', reference: 'x' },
      shipping: { date: '2026-01-05', trackingNumber: 'T1', carrier: 'DHL' },
      inventoryDeducted: true,
    });
    const dup = duplicateOrder(src, { number: 'MJ-2026-0099', now: 5000 });
    expect(dup.number).toBe('MJ-2026-0099');
    expect(dup.status).toBe('draft');
    expect(dup.currency).toBe('EUR');
    expect(dup.customer.name).toBe('Ana');
    expect(dup.items).toHaveLength(1);
    expect(dup.productionNotes).toBe('engrave OM');
    expect(dup.payment.status).toBe('unpaid');
    expect(dup.shipping.trackingNumber).toBe('');
    expect(dup.inventoryDeducted).toBe(false);
    expect(dup.timeline).toEqual([{ at: 5000, type: 'created' }]);
  });
});

describe('inventory deduction', () => {
  const byId = {
    r1: { id: 'r1', name: 'Dorje Ring', category: 'Rings', stock: 'In stock', qty: 4, sizes: { 50: 1, 52: 3 } },
    p1: { id: 'p1', name: 'Vajra Pendant', category: 'Pendants', stock: 'In stock', qty: 2, sizes: null },
    u1: { id: 'u1', name: 'Untracked', category: 'Pendants', stock: 'In stock', qty: null, sizes: null },
  };

  test('trigger honours the configurable setting, the pipeline rank and the one-shot flag', () => {
    const o = order();
    expect(shouldDeductInventory(o, 'paid', 'paid')).toBe(true);
    expect(shouldDeductInventory(o, 'shipped', 'paid')).toBe(true); // jumping past Paid still deducts
    expect(shouldDeductInventory(o, 'paid', 'shipped')).toBe(false);
    expect(shouldDeductInventory(o, 'shipped', 'shipped')).toBe(true);
    expect(shouldDeductInventory(o, 'paid', 'off')).toBe(false);
    expect(shouldDeductInventory(o, 'cancelled', 'paid')).toBe(false);
    expect(shouldDeductInventory({ ...o, inventoryDeducted: true }, 'paid', 'paid')).toBe(false);
  });

  test('ring line with a chosen size decrements that size and recomputes total/status', () => {
    const o = order({ items: [item({ productId: 'r1', ringSize: 50, qty: 1 })] });
    const patches = inventoryDeductionPatches(o, byId);
    expect(patches).toHaveLength(1);
    expect(patches[0].id).toBe('r1');
    expect(patches[0].patch).toEqual({ sizes: { 50: 0, 52: 3 }, qty: 3, stock: 'In stock' });
  });

  test('last sized unit flips a ring to made-to-order, never Sold out', () => {
    const one = { r1: { ...byId.r1, qty: 1, sizes: { 50: 1 } } };
    const o = order({ items: [item({ productId: 'r1', ringSize: 50, qty: 1 })] });
    expect(inventoryDeductionPatches(o, one)[0].patch).toEqual({ sizes: { 50: 0 }, qty: 0, stock: 'Made to order' });
  });

  test('plain line decrements qty (floored at 0) and leaves status alone', () => {
    const o = order({ items: [item({ productId: 'p1', qty: 5 })] });
    expect(inventoryDeductionPatches(o, byId)).toEqual([
      { id: 'p1', label: 'Vajra Pendant −5', patch: { qty: 0 } },
    ]);
  });

  test('untracked, free-text and unknown lines are skipped', () => {
    const o = order({
      items: [
        item({ productId: 'u1' }),
        item({ productId: null }),
        item({ productId: 'ghost' }),
        item({ productId: 'p1', qty: 0 }),
      ],
    });
    expect(inventoryDeductionPatches(o, byId)).toEqual([]);
  });
});

describe('exports', () => {
  test('CSV carries one row per order with totals, payment and shipping', () => {
    const o = order({
      number: 'MJ-2026-0042', status: 'paid', currency: 'USD',
      createdAt: new Date('2026-07-11T10:00:00Z').getTime(),
      customer: { name: 'Ana, "the first"', email: 'a@x.com', country: 'Bhutan' },
      items: [item({ qty: 2, unitPrice: 240, discount: 40, ringSize: 54 })],
      payment: { method: 'Bank transfer', status: 'paid', date: '2026-07-12', reference: '' },
      shipping: { date: '2026-07-15', trackingNumber: 'TRK9', carrier: 'DHL' },
    });
    const csv = ordersCsv([o]);
    const [head, row] = csv.split('\n');
    expect(head).toContain('number,date,status');
    expect(row).toContain('MJ-2026-0042');
    expect(row).toContain('2026-07-11');
    expect(row).toContain('"Ana, ""the first"""'); // proper CSV escaping
    expect(row).toContain('440'); // total after discount
    expect(row).toContain('Bank transfer');
    expect(row).toContain('TRK9');
    expect(row).toContain('size 54');
  });

  test('invoice HTML includes number, items, totals and escapes markup', () => {
    const o = order({
      number: 'MJ-2026-0042', currency: 'EUR',
      customer: { name: '<b>Ana</b>', shippingAddress: 'Rue 1\nParis' },
      items: [item({ qty: 2, unitPrice: 100, discount: 20 })],
    });
    const html = invoiceHtml(o, { seller: { name: 'Malaya Jewellery', email: 'cs@malayajewelry.com' } });
    expect(html).toContain('MJ-2026-0042');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('€180'); // grand total
    expect(html).toContain('Dorje Ring');
    expect(html).toContain('cs@malayajewelry.com');
  });
});

describe('normalizeOrder', () => {
  test('fills missing blocks so integrations can write sparse documents', () => {
    const o = normalizeOrder({ number: 'MJ-2026-0001', source: 'stripe', items: [{ name: 'X' }] }, 'oX');
    expect(o.id).toBe('oX');
    expect(o.customer.name).toBe('');
    expect(o.payment.status).toBe('unpaid');
    expect(o.shipping.carrier).toBe('');
    expect(o.items[0].qty).toBe(1);
    expect(Array.isArray(o.timeline)).toBe(true);
  });
});
