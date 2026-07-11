// ─────────────────────────────────────────────────────────────────────────────
// Sales & Orders — the pure order/client model shared by the admin Sales desk
// (components/admin/Sales.jsx) and its persistence layer (lib/sales.js).
//
// Every sale is an Order, whatever channel it arrives through: manual admin
// entry is simply the first order *source*. A future Stripe Checkout, website
// checkout, WhatsApp flow or payment link creates the same Order object (same
// fields, same statuses, same payment block) so no migration is ever needed —
// integrations only fill in `source` and the payment fields automatically
// instead of the admin typing them.
//
// An order stores a denormalised customer snapshot (name/email/address as they
// were when the order was placed) plus an optional `clientId` link into the
// reusable client database. Order history and lifetime totals are *derived*
// from the orders collection (clientStats) — never stored twice.
//
// Money: `currency` + plain amounts, no automatic conversion. Totals are always
// recomputed from the items (orderTotals), never trusted from storage.
// ─────────────────────────────────────────────────────────────────────────────

// Order currencies. Append here to add a currency — everything else (selects,
// totals, CSV, invoice) picks it up automatically. No conversion anywhere.
export const CURRENCIES = ['BTN', 'USD', 'EUR', 'GBP'];
const CURRENCY_SYMBOLS = { BTN: 'Nu. ', USD: '$', EUR: '€', GBP: '£' };

export function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency];
  const s = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return sym ? `${sym}${s}` : `${s} ${currency || ''}`.trim();
}

// ── Order lifecycle ──────────────────────────────────────────────────────────
// `rank` orders the fulfilment pipeline (used by the inventory-deduction
// trigger: reaching a stage implies passing the earlier ones, so jumping
// Draft → Shipped still deducts). Cancelled/Refunded sit outside the pipeline.
export const ORDER_STATUSES = [
  { key: 'draft', label: 'Draft', rank: 0 },
  { key: 'pending_payment', label: 'Pending Payment', rank: 1 },
  { key: 'paid', label: 'Paid', rank: 2 },
  { key: 'in_production', label: 'In Production', rank: 3 },
  { key: 'ready_to_ship', label: 'Ready to Ship', rank: 4 },
  { key: 'shipped', label: 'Shipped', rank: 5 },
  { key: 'delivered', label: 'Delivered', rank: 6 },
  { key: 'cancelled', label: 'Cancelled', rank: -1 },
  { key: 'refunded', label: 'Refunded', rank: -1 },
];
export const ORDER_STATUS_KEYS = ORDER_STATUSES.map((s) => s.key);
const STATUS_BY_KEY = Object.fromEntries(ORDER_STATUSES.map((s) => [s.key, s]));
export function statusLabel(key) { return (STATUS_BY_KEY[key] || {}).label || key || '—'; }
export function statusRank(key) { const s = STATUS_BY_KEY[key]; return s ? s.rank : -1; }

// Statuses that count as a completed purchase (for a client's lifetime total).
export function isPurchaseStatus(key) { return statusRank(key) >= 2; }

// Where an order originated. Manual is the only source the admin creates today;
// the rest are reserved for integrations that will write the same Order object.
export const ORDER_SOURCES = [
  { key: 'manual', label: 'Manual' },
  { key: 'stripe', label: 'Stripe Checkout' },
  { key: 'website', label: 'Website checkout' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'payment_link', label: 'Payment link' },
];
export function sourceLabel(key) {
  return (ORDER_SOURCES.find((s) => s.key === key) || {}).label || key || 'Manual';
}

// Payment block — manual today; a Stripe webhook later fills the same fields
// (method 'stripe', status 'paid', date, and the payment-intent id in
// `reference`) with no schema change.
export const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'Card', 'Stripe', 'PayPal', 'WhatsApp', 'Other'];
export const PAYMENT_STATUSES = [
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'refunded', label: 'Refunded' },
];
export function paymentStatusLabel(key) {
  return (PAYMENT_STATUSES.find((s) => s.key === key) || {}).label || key || '—';
}

// ── Order numbers ────────────────────────────────────────────────────────────
// Human-facing, auto-generated, yearly sequence: MJ-2026-0042.
export function formatOrderNumber(year, seq) {
  return `MJ-${year}-${String(Math.max(1, Math.round(Number(seq) || 1))).padStart(4, '0')}`;
}
export function parseOrderNumber(number) {
  const m = /^MJ-(\d{4})-(\d+)$/.exec(String(number || '').trim());
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}
// Fallback allocation (demo mode / offline): next free sequence for the year,
// derived from the orders already loaded.
export function nextOrderNumberFromList(orders, now = new Date()) {
  const year = now.getFullYear();
  let max = 0;
  (orders || []).forEach((o) => {
    const p = parseOrderNumber(o && o.number);
    if (p && p.year === year && p.seq > max) max = p.seq;
  });
  return formatOrderNumber(year, max + 1);
}

// ── Blank records ────────────────────────────────────────────────────────────
export function newSalesId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function blankCustomer() {
  return { clientId: null, name: '', email: '', phone: '', country: '', shippingAddress: '', billingAddress: '', notes: '' };
}

export function blankOrderItem() {
  return { productId: null, name: '', sku: '', metal: '', ringSize: null, qty: 1, unitPrice: null, discount: null };
}

export function blankOrder({ number = '', now = Date.now() } = {}) {
  return {
    number,
    source: 'manual',
    status: 'draft',
    currency: 'USD',
    customer: blankCustomer(),
    items: [],
    payment: { method: '', status: 'unpaid', date: '', reference: '' },
    shipping: { date: '', trackingNumber: '', carrier: '' },
    notes: '',
    productionNotes: '',
    timeline: [{ at: now, type: 'created' }],
    inventoryDeducted: false,
    inventoryDeductions: [], // movements recorded when the deduction ran ({ id, size, qty })
    createdAt: now,
    updatedAt: now,
  };
}

export function blankClient(now = Date.now()) {
  return { name: '', email: '', phone: '', country: '', addresses: [], notes: '', createdAt: now, updatedAt: now };
}

// Defensive read of a stored order: whatever integration wrote it, the desk
// always sees the full shape (missing blocks become their blanks).
export function normalizeOrder(raw, id) {
  const b = blankOrder();
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    ...b,
    ...o,
    id: id || o.id,
    customer: { ...b.customer, ...(o.customer || {}) },
    items: Array.isArray(o.items) ? o.items.map((it) => ({ ...blankOrderItem(), ...(it || {}) })) : [],
    payment: { ...b.payment, ...(o.payment || {}) },
    shipping: { ...b.shipping, ...(o.shipping || {}) },
    timeline: Array.isArray(o.timeline) ? o.timeline : b.timeline,
  };
}

export function normalizeClient(raw, id) {
  const b = blankClient();
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    ...b,
    ...c,
    id: id || c.id,
    addresses: Array.isArray(c.addresses) ? c.addresses.filter((a) => typeof a === 'string') : [],
  };
}

// ── Totals ───────────────────────────────────────────────────────────────────
// Per line: qty × unit price − discount (discount is an amount off the line, in
// the order currency). Totals are recomputed from items every time.
export function lineTotal(item) {
  const qty = Math.max(0, Number(item && item.qty) || 0);
  const unit = Number(item && item.unitPrice) || 0;
  const disc = Math.max(0, Number(item && item.discount) || 0);
  return Math.max(0, qty * unit - disc);
}

export function orderTotals(order) {
  const items = (order && order.items) || [];
  let subtotal = 0;
  let discount = 0;
  items.forEach((it) => {
    subtotal += Math.max(0, Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    discount += Math.max(0, Number(it.discount) || 0);
  });
  const total = Math.max(0, subtotal - discount);
  const units = items.reduce((s, it) => s + Math.max(0, Number(it.qty) || 0), 0);
  return { subtotal, discount, total, units };
}

// ── Dashboard filtering / sorting ────────────────────────────────────────────
export function orderSearchText(o) {
  const c = o.customer || {};
  return [
    o.number, c.name, c.email, c.phone, c.country,
    ...(o.items || []).map((it) => `${it.name} ${it.sku}`),
  ].filter(Boolean).join(' ').toLowerCase();
}

// Filters: free-text query, status key, customer, currency, and an inclusive
// created-at date range ('YYYY-MM-DD' strings from <input type=date>).
// `customer` accepts the namespaced dropdown values — 'client:<id>' matches
// the linked client only, 'name:<name>' matches unlinked orders by exact name
// only — so two customers sharing a name never collapse into one filter. Bare
// values keep the historical behaviour (clientId or exact-name match).
export function filterOrders(orders, { q = '', status = '', customer = '', currency = '', from = '', to = '' } = {}) {
  const query = q.trim().toLowerCase();
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  return (orders || []).filter((o) => {
    if (status && o.status !== status) return false;
    if (currency && o.currency !== currency) return false;
    if (customer) {
      const c = o.customer || {};
      if (customer.startsWith('client:')) {
        if (c.clientId !== customer.slice(7)) return false;
      } else if (customer.startsWith('name:')) {
        if (c.clientId || (c.name || '').trim() !== customer.slice(5)) return false;
      } else if (c.clientId !== customer && (c.name || '').trim() !== customer) {
        return false;
      }
    }
    if (fromMs != null && (o.createdAt || 0) < fromMs) return false;
    if (toMs != null && (o.createdAt || 0) > toMs) return false;
    if (query && !orderSearchText(o).includes(query)) return false;
    return true;
  });
}

export const ORDER_SORTS = {
  date: (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
  number: (a, b) => String(a.number || '').localeCompare(String(b.number || '')),
  customer: (a, b) => String((a.customer || {}).name || '').localeCompare(String((b.customer || {}).name || '')),
  status: (a, b) => statusRank(a.status) - statusRank(b.status),
  total: (a, b) => orderTotals(a).total - orderTotals(b).total,
};

// ── Client statistics (derived, never stored) ────────────────────────────────
// Order history + lifetime purchases for one client. Totals are kept per
// currency (no conversion): { USD: 1200, EUR: 300 }.
export function clientStats(clientId, orders) {
  const mine = (orders || [])
    .filter((o) => (o.customer || {}).clientId === clientId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const lifetime = {};
  mine.forEach((o) => {
    if (!isPurchaseStatus(o.status)) return;
    const cur = o.currency || 'USD';
    lifetime[cur] = (lifetime[cur] || 0) + orderTotals(o).total;
  });
  return { orders: mine, count: mine.length, lifetime };
}

export function fmtLifetime(lifetime) {
  const keys = Object.keys(lifetime || {}).sort();
  return keys.length ? keys.map((c) => fmtMoney(lifetime[c], c)).join(' · ') : '—';
}

// ── Duplicate order ──────────────────────────────────────────────────────────
// Repeat customer: copy the customer, currency, items and production notes into
// a fresh Draft with its own number and a clean payment/shipping/timeline.
export function duplicateOrder(order, { number, now = Date.now() } = {}) {
  return {
    ...blankOrder({ number, now }),
    currency: order.currency || 'USD',
    customer: { ...blankCustomer(), ...(order.customer || {}) },
    items: (order.items || []).map((it) => ({ ...blankOrderItem(), ...it })),
    productionNotes: order.productionNotes || '',
  };
}

// ── Automatic inventory deduction ────────────────────────────────────────────
// When an order is marked Paid or Shipped (configurable — salesSettings.deductOn:
// 'off' | 'paid' | 'shipped'), stock for each line linked to a catalogue item
// comes off the same override layer the Inventory desk edits:
//
//   • a ring line with a chosen size on a per-size-tracked item decrements that
//     size (floor 0 — a size that isn't in the ladder counts as 0 on hand, i.e.
//     made to order, and never falls through to the pooled qty, which would
//     desync the total from the size ladder)
//   • any other line with a tracked quantity decrements `qty` (floor 0) and
//     leaves the status alone — availability wording stays a studio decision
//   • untracked lines (qty == null) and free-text lines are skipped
//
// Several lines of the same product compound on one working copy — a ring sold
// in two sizes on one order decrements both — and the plan emits exactly one
// patch per product. Status is only ever *downgraded*: stocking out an
// 'In stock' item flips it to 'Made to order'; a deduction never resurrects a
// studio-set 'Made to order' / 'Sold out' back to 'In stock'.
//
// Pure: takes the resolved product map (buildSiteData().SITE_BY_ID) and returns
// { patches, movements } — the caller applies the patches, then stores the
// movements (the units *actually* removed, after the floor at 0) on the order
// so a cancellation can restore precisely what was taken; recomputing from the
// items would over-restore whenever more units were ordered than were on hand.
export function shouldDeductInventory(order, newStatus, deductOn) {
  if (!deductOn || deductOn === 'off') return false;
  if (order && order.inventoryDeducted) return false;
  const trigger = statusRank(deductOn === 'shipped' ? 'shipped' : 'paid');
  const rank = statusRank(newStatus);
  return rank >= trigger;
}

function blankWork(p) {
  return {
    p,
    sizes: p.sizes ? { ...p.sizes } : null,
    qty: p.qty != null ? Math.max(0, Number(p.qty) || 0) : null,
    sized: false,
    pooled: false,
    labels: [],
    moves: [],
  };
}
const sizesTotal = (sizes) => Object.keys(sizes).reduce((s, k) => s + (Number(sizes[k]) || 0), 0);

export function planInventoryDeduction(order, byId) {
  const work = new Map(); // product id → working copy its lines compound on
  ((order && order.items) || []).forEach((it) => {
    const qty = Math.max(0, Math.round(Number(it.qty) || 0));
    const p = it.productId ? byId[it.productId] : null;
    if (!p || !qty) return;
    let w = work.get(p.id);
    if (!w) { w = blankWork(p); work.set(p.id, w); }
    const sizeKey = it.ringSize != null && it.ringSize !== '' ? String(it.ringSize) : null;
    if (w.sizes) {
      // Per-size tracking owns this item: a line without a chosen size can't
      // be attributed to a size, so it is skipped rather than desyncing qty.
      if (!sizeKey) return;
      const before = Math.max(0, Number(w.sizes[sizeKey]) || 0);
      const taken = Math.min(before, qty);
      if (!taken) return; // nothing on hand in this size — made to order
      w.sizes[sizeKey] = before - taken;
      w.sized = true;
      w.moves.push({ size: sizeKey, qty: taken });
      w.labels.push(`${p.name} · size ${sizeKey} −${taken}`);
    } else if (w.qty != null) {
      const taken = Math.min(w.qty, qty);
      if (!taken) return;
      w.qty -= taken;
      w.pooled = true;
      w.moves.push({ size: null, qty: taken });
      w.labels.push(`${p.name} −${taken}`);
    }
  });
  const patches = [];
  const movements = [];
  work.forEach((w) => {
    if (!w.sized && !w.pooled) return;
    const patch = w.sized ? { sizes: w.sizes, qty: sizesTotal(w.sizes) } : { qty: w.qty };
    if (w.sized && patch.qty <= 0 && w.p.stock === 'In stock') patch.stock = 'Made to order';
    patches.push({ id: w.p.id, label: w.labels.join(' · '), patch });
    w.moves.forEach((m) => movements.push({ id: w.p.id, ...m }));
  });
  return { patches, movements };
}

export function inventoryDeductionPatches(order, byId) {
  return planInventoryDeduction(order, byId).patches;
}

// Exact inverse of a deduction, built from the movements recorded when it ran
// (order.inventoryDeductions). Adds the removed units back to the same size /
// pooled counters and recomputes the total; the availability status is never
// touched — restoring stock must not resurrect a 'Made to order' / 'Sold out'
// wording the studio may since have set deliberately.
export function inventoryRestockPatches(order, byId) {
  const work = new Map();
  ((order && order.inventoryDeductions) || []).forEach((m) => {
    const qty = Math.max(0, Math.round(Number(m && m.qty) || 0));
    const p = m && m.id ? byId[m.id] : null;
    if (!p || !qty) return;
    let w = work.get(p.id);
    if (!w) { w = blankWork(p); work.set(p.id, w); }
    if (m.size != null && w.sizes) {
      const k = String(m.size);
      w.sizes[k] = Math.max(0, Number(w.sizes[k]) || 0) + qty;
      w.sized = true;
      w.labels.push(`${p.name} · size ${k} +${qty}`);
    } else {
      // Pooled restore — also the fallback when the size ladder was removed
      // after the sale, so the units still come back somewhere visible.
      w.pooledAdd = (w.pooledAdd || 0) + qty;
      w.pooled = true;
      w.labels.push(`${p.name} +${qty}`);
    }
  });
  const patches = [];
  work.forEach((w) => {
    if (!w.sized && !w.pooled) return;
    const patch = w.sized
      ? { sizes: w.sizes, qty: sizesTotal(w.sizes) + (w.pooledAdd || 0) }
      : { qty: (w.qty || 0) + (w.pooledAdd || 0) };
    patches.push({ id: w.p.id, label: w.labels.join(' · '), patch });
  });
  return patches;
}

// ── CSV export (accounting) ──────────────────────────────────────────────────
const csvEsc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const isoDate = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

export function ordersCsv(orders) {
  const cols = [
    'number', 'date', 'status', 'source', 'customer', 'email', 'phone', 'country',
    'currency', 'subtotal', 'discount', 'total', 'units',
    'paymentMethod', 'paymentStatus', 'paymentDate', 'paymentReference',
    'shippingDate', 'carrier', 'trackingNumber', 'items', 'notes',
  ];
  const rows = (orders || []).map((o) => {
    const t = orderTotals(o);
    const c = o.customer || {};
    const pay = o.payment || {};
    const ship = o.shipping || {};
    const items = (o.items || [])
      .map((it) => `${it.qty || 0}× ${it.name || it.sku || 'item'}${it.sku ? ` [${it.sku}]` : ''}${it.ringSize != null && it.ringSize !== '' ? ` size ${it.ringSize}` : ''}`)
      .join('; ');
    return {
      number: o.number, date: isoDate(o.createdAt), status: statusLabel(o.status), source: sourceLabel(o.source),
      customer: c.name, email: c.email, phone: c.phone, country: c.country,
      currency: o.currency, subtotal: t.subtotal, discount: t.discount, total: t.total, units: t.units,
      paymentMethod: pay.method, paymentStatus: paymentStatusLabel(pay.status), paymentDate: pay.date, paymentReference: pay.reference,
      shippingDate: ship.date, carrier: ship.carrier, trackingNumber: ship.trackingNumber,
      items, notes: o.notes,
    };
  });
  return [cols.join(',')].concat(rows.map((r) => cols.map((k) => csvEsc(r[k])).join(','))).join('\n');
}

// ── Printable invoice ────────────────────────────────────────────────────────
// A deliberately simple, self-contained HTML document — print (or save as PDF)
// from the browser. `seller` defaults are injected by the caller (SITE_INFO).
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function invoiceHtml(order, { seller = {} } = {}) {
  const t = orderTotals(order);
  const c = order.customer || {};
  const cur = order.currency || 'USD';
  const rows = (order.items || []).map((it) => `
      <tr>
        <td>${esc(it.name || '—')}${it.sku ? `<div class="mut">SKU ${esc(it.sku)}</div>` : ''}
          ${it.metal ? `<div class="mut">${esc(it.metal)}${it.ringSize != null && it.ringSize !== '' ? ` · Size ${esc(it.ringSize)}` : ''}</div>`
    : (it.ringSize != null && it.ringSize !== '' ? `<div class="mut">Size ${esc(it.ringSize)}</div>` : '')}</td>
        <td class="num">${esc(it.qty || 0)}</td>
        <td class="num">${esc(fmtMoney(it.unitPrice, cur))}</td>
        <td class="num">${it.discount ? '−' + esc(fmtMoney(it.discount, cur)) : '—'}</td>
        <td class="num">${esc(fmtMoney(lineTotal(it), cur))}</td>
      </tr>`).join('');
  const address = [c.name, c.shippingAddress, c.country].filter(Boolean).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(order.number || '')}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #2a2520; margin: 48px; }
  h1 { font-size: 26px; letter-spacing: .28em; text-transform: uppercase; margin: 0 0 2px; }
  .kick { font-size: 11px; letter-spacing: .3em; text-transform: uppercase; color: #8a6a3b; margin-bottom: 34px; }
  .head { display: flex; justify-content: space-between; gap: 40px; margin-bottom: 34px; }
  .mut { color: #7a6f63; font-size: 12px; }
  .lbl { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: #8a6a3b; margin-bottom: 6px; }
  .block { white-space: pre-line; font-size: 14px; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #7a6f63; border-bottom: 1px solid #2a2520; padding: 8px 6px; }
  td { border-bottom: 1px solid rgba(42,37,32,.15); padding: 10px 6px; vertical-align: top; }
  .num, th.num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 14px; margin-left: auto; width: 280px; font-size: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 6px; }
  .totals .grand { border-top: 1px solid #2a2520; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 16px; }
  .foot { margin-top: 44px; font-size: 12px; color: #7a6f63; line-height: 1.6; }
  @media print { body { margin: 24px; } }
</style></head><body>
  <h1>${esc(seller.name || 'Malaya Jewellery')}</h1>
  <div class="kick">Invoice</div>
  <div class="head">
    <div>
      <div class="lbl">Billed to</div>
      <div class="block">${esc(address || '—')}</div>
      ${c.email ? `<div class="mut" style="margin-top:6px">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>` : (c.phone ? `<div class="mut" style="margin-top:6px">${esc(c.phone)}</div>` : '')}
      ${c.billingAddress ? `<div class="lbl" style="margin-top:14px">Billing address</div><div class="block">${esc(c.billingAddress)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="lbl">Invoice</div>
      <div style="font-size:18px;font-weight:700">${esc(order.number || '—')}</div>
      <div class="mut" style="margin-top:4px">${esc(isoDate(order.createdAt) || '')}</div>
      <div class="mut">Status: ${esc(statusLabel(order.status))} · Payment: ${esc(paymentStatusLabel((order.payment || {}).status))}</div>
      ${(order.payment || {}).method ? `<div class="mut">Method: ${esc(order.payment.method)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Discount</th><th class="num">Total</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="mut">No items</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${esc(fmtMoney(t.subtotal, cur))}</span></div>
    ${t.discount ? `<div><span>Discount</span><span>−${esc(fmtMoney(t.discount, cur))}</span></div>` : ''}
    <div class="grand"><span>Total (${esc(cur)})</span><span>${esc(fmtMoney(t.total, cur))}</span></div>
  </div>
  <div class="foot">
    ${(seller.address || []).map((l) => esc(l)).join('<br>')}
    ${seller.email ? `<br>${esc(seller.email)}` : ''}${seller.whatsapp ? ` · WhatsApp ${esc(seller.whatsapp)}` : ''}
    <br><br>Thank you for your order.
  </div>
</body></html>`;
}
