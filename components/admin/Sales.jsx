'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Sales — the top-level order desk: every sale, whatever its origin, in one
// dashboard. Independent of the Inventory/Content/Blog/Explore tabs.
//
//   • Orders view — search / sort / filter (status, customer, date, currency),
//     manual order creation, per-order editor drawer (customer, currency,
//     items with automatic totals, lifecycle status + timeline, payment,
//     shipping, notes, production notes), duplicate, printable invoice and a
//     CSV export for accounting.
//   • Clients view — the reusable client database. Order history and lifetime
//     purchases are derived live from the orders (lib/data/sales.js
//     clientStats), never stored twice.
//
// Orders write through lib/sales.js (Firestore `orders` / `clients`, admin-
// only). Marking an order Paid or Shipped (configurable) deducts the sold
// units from the same catalogueOverrides layer the Inventory desk edits —
// including per-size ring stock.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react';
import { T, ghostBtn } from './theme';
import { MATERIALS } from '@/lib/data/products';
import { buildSiteData, SITE_INFO } from '@/lib/data/site-data';
import { RING_SIZES, isRingCategory, ringSizeQty } from '@/lib/data/ring-sizes';
import {
  CURRENCIES, ORDER_STATUSES, statusLabel, statusRank, ORDER_SOURCES, sourceLabel,
  PAYMENT_METHODS, PAYMENT_STATUSES, isPurchaseStatus,
  blankOrder, blankOrderItem, blankClient, duplicateOrder,
  lineTotal, orderTotals, fmtMoney, fmtLifetime, filterOrders, ORDER_SORTS,
  clientStats, shouldDeductInventory, planInventoryDeduction, inventoryRestockPatches,
  ordersCsv, invoiceHtml, isoDate,
} from '@/lib/data/sales';
import {
  subscribeSales, saveOrder, deleteOrder, saveClient, deleteClient,
  saveSalesSettings, allocateOrderNumber, newOrderId, newClientId, SALES_SETTINGS_DEFAULTS,
} from '@/lib/sales';

const STATUS_COLOR = {
  draft: '#7a6f63', pending_payment: '#8a6a3b', paid: '#5b6e4a', in_production: '#8a6a3b',
  ready_to_ship: '#8a6a3b', shipped: '#5b6e4a', delivered: '#5b6e4a',
  cancelled: '#a4502b', refunded: '#a4502b',
};
const statusColor = (key) => STATUS_COLOR[key] || T.muted;
const today = () => new Date().toISOString().slice(0, 10);

function ghost(disabled) {
  return { ...ghostBtn(disabled) };
}
const primaryBtn = { background: T.ink, color: T.panel, border: 'none', padding: '9px 16px', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans };

export default function Sales({ overrides, setOverrides }) {
  const [data, setData] = useState({ orders: {}, clients: {}, settings: SALES_SETTINGS_DEFAULTS });
  useEffect(() => subscribeSales(setData), []);
  const settings = data.settings || SALES_SETTINGS_DEFAULTS;

  // Catalogue products for the item picker and the inventory deduction — the
  // same resolved records the storefront sells.
  const SITE = useMemo(() => buildSiteData(overrides || {}), [overrides]);

  const [view, setView] = useState('orders'); // 'orders' | 'clients'
  const [editId, setEditId] = useState(null); // order drawer
  const [clientEditId, setClientEditId] = useState(null); // client drawer
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m) => setToast(m);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const orders = useMemo(
    () => Object.values(data.orders).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data.orders],
  );
  const clients = useMemo(
    () => Object.values(data.clients).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [data.clients],
  );

  // ── Order actions ──────────────────────────────────────────────────────────
  const createOrder = async (prefill) => {
    if (creating) return;
    setCreating(true);
    try {
      const number = await allocateOrderNumber(orders);
      const id = newOrderId();
      const order = { id, ...blankOrder({ number }) };
      if (prefill && prefill.customer) order.customer = { ...order.customer, ...prefill.customer };
      saveOrder(order);
      setView('orders');
      setClientEditId(null);
      setEditId(id);
      flash(`Order ${number} created`);
    } finally { setCreating(false); }
  };

  // Apply inventory patches to the override layer and wait for the cloud
  // mirror before the caller writes the order doc, so order state and stock
  // can't silently diverge: an explicit rejection (e.g. security rules) rolls
  // the local copy back and aborts, while a slow / offline mirror proceeds
  // optimistically after a short grace — Firestore queues the write, matching
  // the desk's latency-compensated behaviour everywhere else.
  const applyInventoryPatches = async (patches) => {
    let before;
    const saved = setOverrides((prev) => {
      before = prev;
      const n = { ...prev };
      patches.forEach(({ id: pid, patch: pp }) => { n[pid] = { ...(n[pid] || {}), ...pp }; });
      return n;
    });
    const ok = await Promise.race([
      Promise.resolve(saved).then((r) => r !== false),
      new Promise((res) => { setTimeout(() => res(true), 4000); }),
    ]);
    if (!ok && before) setOverrides(() => before);
    return ok;
  };

  // Central order patch: status changes append to the timeline, sync the
  // obvious payment/shipping fields, fire the (configurable) one-shot
  // inventory deduction, and restock when a deducted order leaves the
  // pipeline (cancelled / refunded).
  const commitOrder = async (id, patch) => {
    const cur = data.orders[id];
    if (!cur) return;
    const now = Date.now();
    const next = { ...cur, ...patch, updatedAt: now };
    if (patch.status && patch.status !== cur.status) {
      next.timeline = [...(cur.timeline || []), { at: now, type: 'status', status: patch.status }];
      if (patch.status === 'paid' && next.payment.status !== 'paid') {
        next.payment = { ...next.payment, status: 'paid', date: next.payment.date || today() };
      }
      if (patch.status === 'refunded') next.payment = { ...next.payment, status: 'refunded' };
      if (patch.status === 'shipped' && !next.shipping.date) {
        next.shipping = { ...next.shipping, date: today() };
      }
      if (shouldDeductInventory(cur, patch.status, settings.deductOn)) {
        const { patches, movements } = planInventoryDeduction(next, SITE.SITE_BY_ID);
        if (patches.length) {
          if (!(await applyInventoryPatches(patches))) {
            flash('⚠ Inventory update was rejected — status not changed');
            return;
          }
          // Only a real deduction consumes the one-shot flag: an order whose
          // lines are still free-text / untracked keeps it unset, so items
          // added later still deduct on a future status change. The recorded
          // movements are what a cancellation restores (exactly what was
          // taken, after the floor at 0 — not what was ordered).
          next.inventoryDeducted = true;
          next.inventoryDeductions = movements;
          next.timeline = [...next.timeline, { at: now, type: 'inventory', note: patches.map((p) => p.label).join(' · ') }];
          flash(`Inventory deducted — ${patches.map((p) => p.label).join(', ')}`);
        }
      }
      if ((patch.status === 'cancelled' || patch.status === 'refunded') && cur.inventoryDeducted) {
        const patches = inventoryRestockPatches(cur, SITE.SITE_BY_ID);
        if (patches.length) {
          if (!(await applyInventoryPatches(patches))) {
            flash('⚠ Inventory restock was rejected — status not changed');
            return;
          }
          next.inventoryDeducted = false;
          next.inventoryDeductions = [];
          next.timeline = [...next.timeline, { at: now, type: 'inventory', note: `Restocked — ${patches.map((p) => p.label).join(' · ')}` }];
          flash(`Inventory restocked — ${patches.map((p) => p.label).join(', ')}`);
        }
        // No recorded movements (order deducted before they existed, or its
        // products no longer resolve): nothing can be restored automatically —
        // the flag stays set so re-activating can't deduct a second time, and
        // the drawer keeps its manual-adjustment note.
      }
    }
    saveOrder(next);
  };

  const duplicate = async (o) => {
    const number = await allocateOrderNumber(orders);
    const id = newOrderId();
    saveOrder({ id, ...duplicateOrder(o, { number }) });
    setEditId(id);
    flash(`Duplicated as ${number}`);
  };

  const removeOrder = async (o) => {
    if (!confirm(`Delete order ${o.number || o.id}? This cannot be undone.`)) return;
    let note = '';
    if (o.inventoryDeducted) {
      // Put the deducted units back before the record (and with it the only
      // trace of the deduction) disappears. Without recorded movements there
      // is nothing to restore — same manual-adjustment case as the drawer note.
      const patches = inventoryRestockPatches(o, SITE.SITE_BY_ID);
      if (patches.length) {
        if (!(await applyInventoryPatches(patches))) {
          flash('⚠ Inventory restock was rejected — order not deleted');
          return;
        }
        note = ` — restocked ${patches.map((p) => p.label).join(', ')}`;
      }
    }
    deleteOrder(o.id);
    if (editId === o.id) setEditId(null);
    flash(`Order deleted${note}`);
  };

  const printInvoice = (o) => {
    const w = window.open('', '_blank', 'width=780,height=920');
    if (!w) { flash('Allow pop-ups to print invoices'); return; }
    w.document.write(invoiceHtml(o, {
      seller: { name: 'Malaya Jewellery', address: SITE_INFO.address, email: SITE_INFO.email, whatsapp: SITE_INFO.whatsapp },
    }));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 300);
  };

  // ── Client actions ─────────────────────────────────────────────────────────
  const createClient = () => {
    const id = newClientId();
    saveClient({ id, ...blankClient() });
    setClientEditId(id);
    flash('New client — add their details');
  };
  const commitClient = (id, patch) => {
    const cur = data.clients[id];
    if (!cur) return;
    saveClient({ ...cur, ...patch, updatedAt: Date.now() });
  };
  const removeClient = (c) => {
    const stats = clientStats(c.id, orders);
    if (!confirm(`Delete client “${c.name || c.id}”? Their ${stats.count} order${stats.count === 1 ? '' : 's'} stay untouched (each order keeps its own customer details).`)) return;
    deleteClient(c.id);
    if (clientEditId === c.id) setClientEditId(null);
    flash('Client deleted');
  };

  // Push the order's customer snapshot into the client database — updating the
  // linked record, or creating (and linking) a new one.
  const saveCustomerToDb = (o) => {
    const c = o.customer || {};
    if (!(c.name || '').trim() && !(c.email || '').trim()) { flash('Add a customer name or email first'); return; }
    const now = Date.now();
    const addr = (c.shippingAddress || '').trim();
    if (c.clientId && data.clients[c.clientId]) {
      const cl = data.clients[c.clientId];
      const addresses = addr && !cl.addresses.includes(addr) ? [...cl.addresses, addr] : cl.addresses;
      saveClient({ ...cl, name: c.name, email: c.email, phone: c.phone, country: c.country, addresses, updatedAt: now });
      flash('Client record updated');
    } else {
      const id = newClientId();
      saveClient({
        id, ...blankClient(now), name: c.name, email: c.email, phone: c.phone,
        country: c.country, addresses: addr ? [addr] : [], notes: c.notes || '',
      });
      commitOrder(o.id, { customer: { ...c, clientId: id } });
      flash('Saved to the client database');
    }
  };

  // ── Dashboard filters ──────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCustomer, setFCustomer] = useState('');
  const [fCurrency, setFCurrency] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'date' ? 'desc' : 'asc'); }
  };

  // Filter-by-customer options: every client, plus distinct unlinked customer
  // names typed straight into orders. Values are namespaced (client:<id> /
  // name:<name>) so a saved client and an unlinked customer who happen to
  // share a name stay two separate, correctly-filtering entries.
  const customerOptions = useMemo(() => {
    const opts = new Map();
    clients.forEach((c) => opts.set(`client:${c.id}`, c.name || c.email || c.id));
    orders.forEach((o) => {
      const c = o.customer || {};
      const name = (c.name || '').trim();
      if (!c.clientId && name && !opts.has(`name:${name}`)) opts.set(`name:${name}`, name);
    });
    return [...opts.entries()];
  }, [clients, orders]);

  const rows = useMemo(() => {
    const out = filterOrders(orders, { q, status: fStatus, customer: fCustomer, currency: fCurrency, from: fFrom, to: fTo });
    const cmp = ORDER_SORTS[sortKey];
    if (cmp) { out.sort(cmp); if (sortDir === 'desc') out.reverse(); }
    return out;
  }, [orders, q, fStatus, fCustomer, fCurrency, fFrom, fTo, sortKey, sortDir]);

  const anyFilter = q || fStatus || fCustomer || fCurrency || fFrom || fTo;
  const clearFilters = () => { setQ(''); setFStatus(''); setFCustomer(''); setFCurrency(''); setFFrom(''); setFTo(''); };

  const stats = useMemo(() => {
    let open = 0;
    const revenue = {};
    orders.forEach((o) => {
      const r = statusRank(o.status);
      if (r >= 1 && r <= 5) open++;
      if (isPurchaseStatus(o.status)) {
        const cur = o.currency || 'USD';
        revenue[cur] = (revenue[cur] || 0) + orderTotals(o).total;
      }
    });
    return { open, revenue };
  }, [orders]);

  const exportCsv = () => {
    const blob = new Blob([ordersCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'malaya-orders.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Exported CSV · ${rows.length} order${rows.length === 1 ? '' : 's'}`);
  };

  const editingOrder = editId ? data.orders[editId] : null;
  const editingClient = clientEditId ? data.clients[clientEditId] : null;

  const HEADS = [
    { k: 'number', label: 'Order', cls: 'sls-cell-number' },
    { k: 'customer', label: 'Customer', cls: 'sls-cell-customer' },
    { k: 'date', label: 'Date', cls: 'sls-cell-date' },
    { k: 'status', label: 'Status', cls: 'sls-cell-status' },
    { k: 'total', label: 'Total', cls: 'sls-cell-total', num: true },
    { k: '', label: 'Currency', cls: 'sls-cell-currency' },
    { k: '', label: '', cls: 'sls-cell-actions' },
  ];

  const subTab = (active) => ({ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '6px 2px', color: active ? T.ink : T.muted, borderBottom: `2px solid ${active ? T.accent : 'transparent'}` });

  return (
    <div>
      <div className="adm-pad" style={{ padding: '22px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: T.serif, fontSize: 38, margin: 0, lineHeight: 1 }}>Sales</h1>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, letterSpacing: '0.04em' }}>
              Every sale is an order, whatever its source — manual today, Stripe / website / WhatsApp later, all in this one dashboard.
            </div>
            <nav style={{ display: 'flex', gap: 20, marginTop: 14 }}>
              <button onClick={() => setView('orders')} style={subTab(view === 'orders')}>Orders ({orders.length})</button>
              <button onClick={() => setView('clients')} style={subTab(view === 'clients')}>Clients ({clients.length})</button>
            </nav>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {view === 'orders'
              ? (
                <>
                  <button onClick={() => createOrder()} disabled={creating} style={{ ...primaryBtn, opacity: creating ? 0.6 : 1 }}>{creating ? 'Creating…' : '+ New order'}</button>
                  <button onClick={exportCsv} disabled={!rows.length} style={ghost(!rows.length)}>Export CSV</button>
                </>
              )
              : <button onClick={createClient} style={primaryBtn}>+ New client</button>}
            <button onClick={() => setSettingsOpen(true)} style={ghost()}>Settings…</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: T.line2, border: `1px solid ${T.line2}` }}>
          <Stat label="Orders" value={orders.length.toLocaleString('en-US')} sub="all sources" />
          <Stat label="Open" value={stats.open.toLocaleString('en-US')} sub="pending → shipped" accent />
          <Stat label="Revenue" value={fmtLifetime(stats.revenue)} sub="paid & fulfilled · per currency" small />
          <Stat label="Clients" value={clients.length.toLocaleString('en-US')} sub="reusable database" />
        </div>
      </div>

      {view === 'orders' && (
        <>
          <div className="adm-pad" style={{ padding: '16px 28px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 200, flex: '1 1 200px', maxWidth: 300 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, customer, item…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1, minWidth: 0 }} />
            </div>
            <Pick value={fStatus} onChange={setFStatus} all="All statuses" options={ORDER_STATUSES.map((s) => [s.key, s.label])} pairs />
            <Pick value={fCustomer} onChange={setFCustomer} all="All customers" options={customerOptions} pairs />
            <Pick value={fCurrency} onChange={setFCurrency} all="All currencies" options={CURRENCIES} />
            <DateInput value={fFrom} onChange={setFFrom} label="From" />
            <DateInput value={fTo} onChange={setFTo} label="To" />
            {anyFilter && <button onClick={clearFilters} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>Clear</button>}
          </div>

          <div className="adm-pad" style={{ padding: '16px 28px 90px' }}>
            <div className="sls-list">
              <div className="sls-head">
                {HEADS.map((h, i) => (
                  h.k
                    ? <button key={i} className={'inv-th' + (h.num ? ' num' : '')} onClick={() => toggleSort(h.k)}>
                        {h.label}{sortKey === h.k && <span className="inv-th-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </button>
                    : <span key={i} className="inv-th" style={{ cursor: 'default' }}>{h.label}</span>
                ))}
              </div>
              {rows.map((o) => (
                <OrderRow key={o.id} o={o} onEdit={() => setEditId(o.id)} onInvoice={() => printInvoice(o)}
                  onDuplicate={() => duplicate(o)} onDelete={() => removeOrder(o)} />
              ))}
              {rows.length === 0 && (
                <div style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20, background: T.panel }}>
                  {orders.length === 0 ? 'No orders yet — create the first one.' : 'No orders match the current filters.'}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {view === 'clients' && (
        <ClientsView clients={clients} orders={orders} onEdit={setClientEditId} onDelete={removeClient} onNew={createClient} />
      )}

      {editingOrder && (
        <OrderDrawer o={editingOrder} clients={clients} data={data} products={SITE.SITE_PRODUCTS}
          commit={(patch) => commitOrder(editingOrder.id, patch)}
          onSaveClient={() => saveCustomerToDb(editingOrder)}
          onDelete={() => removeOrder(editingOrder)}
          onDuplicate={() => duplicate(editingOrder)}
          onInvoice={() => printInvoice(editingOrder)}
          onClose={() => setEditId(null)} />
      )}
      {editingClient && (
        <ClientDrawer c={editingClient} orders={orders}
          commit={(patch) => commitClient(editingClient.id, patch)}
          onDelete={() => removeClient(editingClient)}
          onNewOrder={() => createOrder({
            customer: {
              clientId: editingClient.id, name: editingClient.name, email: editingClient.email,
              phone: editingClient.phone, country: editingClient.country,
              shippingAddress: editingClient.addresses[0] || '', notes: editingClient.notes || '',
            },
          })}
          onOpenOrder={(id) => { setClientEditId(null); setView('orders'); setEditId(id); }}
          onClose={() => setClientEditId(null)} />
      )}
      {settingsOpen && (
        <SettingsModal settings={settings}
          onSave={(patch) => { saveSalesSettings(patch); setSettingsOpen(false); flash('Sales settings saved'); }}
          onClose={() => setSettingsOpen(false)} />
      )}
      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', boxShadow: '0 10px 30px rgba(0,0,0,0.25)', maxWidth: '90vw' }}>{toast}</div>}
    </div>
  );
}

function Stat({ label, value, sub, accent, small }) {
  return (
    <div style={{ background: T.panel, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted }}>{label}</div>
      <div style={{ fontFamily: T.serif, fontSize: small ? 19 : 27, lineHeight: 1.15, marginTop: 5, color: accent ? T.accent : T.ink, overflowWrap: 'anywhere' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 3, letterSpacing: '0.02em' }}>{sub}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const color = statusColor(status);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />{statusLabel(status)}
    </span>
  );
}

function OrderRow({ o, onEdit, onInvoice, onDuplicate, onDelete }) {
  const t = orderTotals(o);
  const c = o.customer || {};
  return (
    <div className="sls-row" style={{ background: T.panel }}>
      <div className="sls-cell sls-cell-number">
        <span className="sls-cell-label">Order</span>
        <button onClick={onEdit} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontFamily: T.serif, fontSize: 15.5, color: T.ink, display: 'block' }}>{o.number || '—'}</span>
          <span style={{ fontSize: 10, color: T.faint, letterSpacing: '0.08em' }}>{sourceLabel(o.source)}</span>
        </button>
      </div>
      <div className="sls-cell sls-cell-customer" style={{ minWidth: 0 }}>
        <span className="sls-cell-label">Customer</span>
        <div style={{ fontSize: 13.5, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || <span style={{ color: T.faint }}>—</span>}</div>
        {(c.email || c.country) && <div style={{ fontSize: 10.5, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.email, c.country].filter(Boolean).join(' · ')}</div>}
      </div>
      <div className="sls-cell sls-cell-date">
        <span className="sls-cell-label">Date</span>
        <span style={{ fontSize: 12.5, color: T.muted }}>{isoDate(o.createdAt) || '—'}</span>
      </div>
      <div className="sls-cell sls-cell-status">
        <span className="sls-cell-label">Status</span>
        <StatusPill status={o.status} />
      </div>
      <div className="sls-cell num sls-cell-total">
        <span className="sls-cell-label">Total</span>
        <strong style={{ fontSize: 14 }}>{fmtMoney(t.total, o.currency)}</strong>
      </div>
      <div className="sls-cell sls-cell-currency">
        <span className="sls-cell-label">Currency</span>
        <span style={{ fontSize: 12, color: T.muted }}>{o.currency}</span>
      </div>
      <div className="sls-cell sls-cell-actions">
        <button onClick={onEdit} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Edit</button>
        <button onClick={onInvoice} title="Printable invoice" style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Invoice</button>
        <button onClick={onDuplicate} title="Duplicate this order" style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>⧉</button>
        <button onClick={onDelete} title="Delete order" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '7px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── Clients view ────
function ClientsView({ clients, orders, onEdit, onDelete }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const rows = query
    ? clients.filter((c) => `${c.name} ${c.email} ${c.phone} ${c.country}`.toLowerCase().includes(query))
    : clients;
  return (
    <div className="adm-pad" style={{ padding: '16px 28px 90px' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1, minWidth: 0 }} />
        </div>
      </div>
      <div className="slc-list">
        <div className="slc-head">
          {['Client', 'Contact', 'Country', 'Orders', 'Lifetime purchases', ''].map((l, i) => (
            <span key={i} className="inv-th" style={{ cursor: 'default' }}>{l}</span>
          ))}
        </div>
        {rows.map((c) => {
          const stats = clientStats(c.id, orders);
          return (
            <div key={c.id} className="slc-row" style={{ background: T.panel }}>
              <div className="slc-cell slc-cell-name">
                <span className="sls-cell-label">Client</span>
                <button onClick={() => onEdit(c.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: T.serif, fontSize: 15.5, color: T.ink }}>
                  {c.name || 'Unnamed client'}
                </button>
              </div>
              <div className="slc-cell slc-cell-contact" style={{ minWidth: 0 }}>
                <span className="sls-cell-label">Contact</span>
                <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="slc-cell slc-cell-country">
                <span className="sls-cell-label">Country</span>
                <span style={{ fontSize: 12.5, color: T.muted }}>{c.country || '—'}</span>
              </div>
              <div className="slc-cell slc-cell-orders">
                <span className="sls-cell-label">Orders</span>
                <span style={{ fontSize: 14 }}>{stats.count}</span>
              </div>
              <div className="slc-cell slc-cell-lifetime">
                <span className="sls-cell-label">Lifetime</span>
                <span style={{ fontSize: 13, color: T.ink }}>{fmtLifetime(stats.lifetime)}</span>
              </div>
              <div className="slc-cell sls-cell-actions">
                <button onClick={() => onEdit(c.id)} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Edit</button>
                <button onClick={() => onDelete(c)} title="Delete client" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '7px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20, background: T.panel }}>
            {clients.length === 0 ? 'No clients yet — they are also saved automatically from orders.' : 'No clients match this search.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── Order drawer ────
function OrderDrawer({ o, clients, data, products, commit, onSaveClient, onDelete, onDuplicate, onInvoice, onClose }) {
  const t = orderTotals(o);
  const c = o.customer || {};
  const [pickerOpen, setPickerOpen] = useState(false);
  const commitCustomer = (patch) => commit({ customer: { ...c, ...patch } });
  const commitPayment = (patch) => commit({ payment: { ...o.payment, ...patch } });
  const commitShipping = (patch) => commit({ shipping: { ...o.shipping, ...patch } });
  const commitItems = (items) => commit({ items });

  const linkedClient = c.clientId ? data.clients[c.clientId] : null;
  const rank = statusRank(o.status);
  const tlDate = (status) => {
    const e = (o.timeline || []).filter((x) => x.type === 'status' && x.status === status).pop();
    return e ? isoDate(e.at) : '';
  };
  const milestones = [
    { label: 'Created', date: isoDate(o.createdAt), done: true },
    { label: 'Paid', date: o.payment.date || tlDate('paid'), done: rank >= 2 || o.payment.status === 'paid' },
    { label: 'Shipped', date: o.shipping.date || tlDate('shipped'), done: rank >= 5 },
    { label: 'Delivered', date: tlDate('delivered'), done: rank >= 6 },
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 720, maxWidth: '96vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.serif, fontSize: 24, lineHeight: 1.1 }}>{o.number || 'Order'}</span>
              <StatusPill status={o.status} />
            </div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 4 }}>
              {sourceLabel(o.source)} order · created {isoDate(o.createdAt) || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Timeline milestones */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 20 }}>
            {milestones.map((m, i) => (
              <div key={m.label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', top: 6, right: '50%', width: '100%', height: 2, background: m.done ? T.good : T.line2 }} />}
                <div style={{ position: 'relative', width: 13, height: 13, borderRadius: '50%', margin: '0 auto', background: m.done ? T.good : T.panel, border: `2px solid ${m.done ? T.good : T.line2}`, boxSizing: 'border-box' }} />
                <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.done ? T.ink : T.faint, marginTop: 7 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{m.date || ''}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <SSel label="Status" value={o.status} options={ORDER_STATUSES.map((s) => [s.key, s.label])} pairs onCommit={(v) => commit({ status: v })} />
            <SSel label="Source" value={o.source} options={ORDER_SOURCES.map((s) => [s.key, s.label])} pairs onCommit={(v) => commit({ source: v })} />
            <SSel label="Currency" value={o.currency} options={CURRENCIES} onCommit={(v) => commit({ currency: v })} />
          </div>
          {o.inventoryDeducted && (rank === -1) && (
            <div style={{ fontSize: 11.5, color: T.danger, background: 'rgba(164,80,43,0.07)', border: `1px solid ${T.line}`, padding: '9px 12px', marginBottom: 14, lineHeight: 1.5 }}>
              Inventory was deducted for this order and could not be restocked automatically (no recorded movements) — if the pieces come back into stock, adjust their units in the Inventory desk.
            </div>
          )}

          {/* Customer */}
          <Section title="Customer"
            aside={(
              <span style={{ display: 'inline-flex', gap: 12 }}>
                <button onClick={() => setPickerOpen(true)} style={linkBtn}>Choose existing…</button>
                <button onClick={onSaveClient} style={linkBtn}>{linkedClient ? 'Update client record' : 'Save to client database'}</button>
              </span>
            )}>
            {linkedClient && (
              <div style={{ fontSize: 11.5, color: T.good, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                ● Linked to client <strong style={{ color: T.ink }}>{linkedClient.name || linkedClient.email}</strong>
                <button onClick={() => commitCustomer({ clientId: null })} style={{ ...linkBtn, color: T.muted }}>Unlink</button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <SField label="Name" value={c.name} onCommit={(v) => commitCustomer({ name: v })} />
              <SField label="Email" value={c.email} onCommit={(v) => commitCustomer({ email: v })} />
              <SField label="Phone / WhatsApp" value={c.phone} onCommit={(v) => commitCustomer({ phone: v })} />
              <SField label="Country" value={c.country} onCommit={(v) => commitCustomer({ country: v })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <SArea label="Shipping address" rows={3} value={c.shippingAddress} onCommit={(v) => commitCustomer({ shippingAddress: v })} />
              <SArea label="Billing address" rows={3} value={c.billingAddress} placeholder="Same as shipping" onCommit={(v) => commitCustomer({ billingAddress: v })} />
            </div>
            <SArea label="Customer notes" rows={2} value={c.notes} placeholder="Internal notes about this customer…" onCommit={(v) => commitCustomer({ notes: v })} />
          </Section>

          {/* Items */}
          <Section title="Items">
            <ItemsEditor items={o.items} currency={o.currency} products={products} onCommit={commitItems} />
            <div style={{ marginTop: 14, marginLeft: 'auto', maxWidth: 300, fontSize: 13.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 2px', color: T.muted }}><span>Subtotal</span><span>{fmtMoney(t.subtotal, o.currency)}</span></div>
              {t.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 2px', color: T.muted }}><span>Discount</span><span>−{fmtMoney(t.discount, o.currency)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 2px 2px', marginTop: 4, borderTop: `1px solid ${T.line2}`, fontFamily: T.serif, fontSize: 19 }}>
                <span>Total</span><strong>{fmtMoney(t.total, o.currency)} <span style={{ fontSize: 12, color: T.muted, fontFamily: T.sans }}>{o.currency}</span></strong>
              </div>
            </div>
          </Section>

          {/* Payment */}
          <Section title="Payment" hint="Manual for now — a Stripe integration will fill these same fields automatically.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <SSel label="Method" value={o.payment.method} options={PAYMENT_METHODS} blank="—" onCommit={(v) => commitPayment({ method: v })} />
              <SSel label="Payment status" value={o.payment.status} options={PAYMENT_STATUSES.map((s) => [s.key, s.label])} pairs onCommit={(v) => commitPayment({ status: v })} />
              <SField label="Payment date" type="date" value={o.payment.date} onCommit={(v) => commitPayment({ date: v })} />
              <SField label="Reference" value={o.payment.reference} placeholder="Receipt no. / transfer ref / Stripe id…" onCommit={(v) => commitPayment({ reference: v })} />
            </div>
          </Section>

          {/* Shipping */}
          <Section title="Shipping">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <SField label="Shipping date" type="date" value={o.shipping.date} onCommit={(v) => commitShipping({ date: v })} />
              <SField label="Carrier" value={o.shipping.carrier} placeholder="DHL / Bhutan Post…" onCommit={(v) => commitShipping({ carrier: v })} />
              <SField label="Tracking number" value={o.shipping.trackingNumber} onCommit={(v) => commitShipping({ trackingNumber: v })} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <SArea label="Internal notes" rows={3} value={o.notes} placeholder="Anything about this order — only visible here." onCommit={(v) => commit({ notes: v })} />
            <SArea label="Production notes" rows={3} value={o.productionNotes} placeholder="Engraving, resizing, gemstone changes…" onCommit={(v) => commit({ productionNotes: v })} />
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            <div style={{ display: 'grid', gap: 0 }}>
              {(o.timeline || []).slice().reverse().map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 2px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
                  <span style={{ color: T.faint, fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: T.ink }}>
                    {e.type === 'created' && 'Order created'}
                    {e.type === 'status' && <>Status → <strong style={{ color: statusColor(e.status) }}>{statusLabel(e.status)}</strong></>}
                    {e.type === 'inventory' && <>Inventory deducted{e.note ? <span style={{ color: T.muted }}> — {e.note}</span> : ''}</>}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete</button>
            <button onClick={onDuplicate} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Duplicate</button>
            <button onClick={onInvoice} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Invoice</button>
          </div>
          <button onClick={onClose} style={{ background: T.ink, color: T.panel, border: 'none', padding: '13px 28px', fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Done</button>
        </div>
      </aside>

      {pickerOpen && (
        <ClientPicker clients={clients}
          onPick={(cl) => {
            commitCustomer({
              clientId: cl.id, name: cl.name, email: cl.email, phone: cl.phone, country: cl.country,
              shippingAddress: c.shippingAddress || cl.addresses[0] || '', notes: c.notes || cl.notes || '',
            });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

const linkBtn = { background: 'transparent', border: 'none', color: T.accent, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', padding: 0, fontFamily: T.sans };

function Section({ title, aside, hint, children }) {
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 8, paddingTop: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent }}>{title}</div>
        {aside}
      </div>
      {hint && <div style={{ fontSize: 11, color: T.faint, margin: '-6px 0 12px', lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────── Items editor ────
function ItemsEditor({ items, currency, products, onCommit }) {
  const list = items || [];
  // Stable per-row React keys, parallel to the list and editor-local (nothing
  // extra is written to the order): keying by array index would re-attach a
  // row's in-progress typeahead state to the wrong line when a middle row is
  // removed.
  const rowKeys = useRef([]);
  const nextKey = useRef(0);
  while (rowKeys.current.length < list.length) rowKeys.current.push(`row${nextKey.current++}`);
  if (rowKeys.current.length > list.length) rowKeys.current.length = list.length;
  const setItem = (i, patch) => onCommit(list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i) => {
    rowKeys.current.splice(i, 1);
    onCommit(list.filter((_, j) => j !== i));
  };
  const addItem = () => onCommit([...list, blankOrderItem()]);
  return (
    <div>
      {list.map((it, i) => (
        <ItemLine key={rowKeys.current[i]} it={it} currency={currency} products={products}
          onChange={(patch) => setItem(i, patch)} onRemove={() => removeItem(i)} />
      ))}
      {list.length === 0 && <div style={{ fontSize: 12.5, color: T.faint, padding: '4px 0 10px' }}>No items yet — add a product below.</div>}
      <button onClick={addItem} style={{ ...ghost(), padding: '9px 14px' }}>+ Add item</button>
    </div>
  );
}

function ItemLine({ it, currency, products, onChange, onRemove }) {
  const [q, setQ] = useState(null); // null = not searching; string = typeahead open
  const query = (q || '').trim().toLowerCase();
  const matches = query
    ? products.filter((p) => `${p.name} ${p.sub || ''} ${p.salesCode || ''}`.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const product = it.productId ? products.find((p) => p.id === it.productId) : null;
  const ring = product ? isRingCategory(product.category) : it.ringSize != null;
  const pick = (p) => {
    onChange({
      productId: p.id, name: p.name + (p.sub ? ` — ${p.sub}` : ''), sku: p.salesCode || p.id,
      metal: p.material || '', ringSize: null, unitPrice: p.price ?? null,
    });
    setQ(null);
  };
  const numField = (v) => (v == null ? '' : String(v));
  const inp = { background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '9px 10px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box', width: '100%' };
  const lbl = { display: 'block', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.muted, marginBottom: 4 };
  return (
    <div style={{ border: `1px solid ${T.line2}`, background: T.card, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ position: 'relative' }}>
          <span style={lbl}>Product {it.productId ? <em style={{ color: T.good, fontStyle: 'normal' }}>· linked</em> : <em style={{ color: T.faint, fontStyle: 'normal' }}>· type to search or enter freely</em>}</span>
          <input value={q != null ? q : (it.name || '')} placeholder="Search the catalogue or type a name…"
            onChange={(e) => { setQ(e.target.value); if (it.productId) onChange({ productId: null }); }}
            onFocus={() => { if (q == null) setQ(it.name || ''); }}
            onBlur={() => setTimeout(() => { if (q != null) { onChange({ name: q }); setQ(null); } }, 150)}
            style={{ ...inp, background: T.panel }} />
          {q != null && matches.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 22, top: '100%', left: 0, right: 0, background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', maxHeight: 260, overflowY: 'auto' }}>
              {matches.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 30, height: 30, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
                    {p.img && <img src={p.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />}
                  </div>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink }}>
                    {p.name}
                    <span style={{ fontSize: 10, color: T.faint, marginLeft: 6 }}>{p.salesCode || p.id} · {p.material}</span>
                  </span>
                  <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>${(p.price || 0).toLocaleString('en-US')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <span style={lbl}>SKU</span>
          <ItemText value={it.sku} onCommit={(v) => onChange({ sku: v })} style={inp} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: ring ? '1.4fr 1fr 64px 1fr 1fr 1fr auto' : '1.4fr 64px 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div>
          <span style={lbl}>Metal</span>
          <select value={MATERIALS.includes(it.metal) ? it.metal : ''} onChange={(e) => onChange({ metal: e.target.value })} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">{it.metal || '—'}</option>
            {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {ring && (
          <div>
            <span style={lbl}>Ring size · EU</span>
            <select value={it.ringSize == null ? '' : String(it.ringSize)}
              onChange={(e) => onChange({ ringSize: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ ...inp, cursor: 'pointer' }}>
              <option value="">—</option>
              {RING_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}{product && product.sizes ? ` (${ringSizeQty(product.sizes, s)} on hand)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <span style={lbl}>Qty</span>
          <ItemText value={numField(it.qty)} numeric onCommit={(v) => onChange({ qty: v === '' ? 1 : Math.max(1, Math.round(Number(v) || 1)) })} style={{ ...inp, textAlign: 'right' }} />
        </div>
        <div>
          <span style={lbl}>Unit price</span>
          <ItemText value={numField(it.unitPrice)} numeric onCommit={(v) => onChange({ unitPrice: v === '' ? null : Number(v) })} style={{ ...inp, textAlign: 'right' }} />
        </div>
        <div>
          <span style={lbl}>Discount</span>
          <ItemText value={numField(it.discount)} numeric placeholder="—" onCommit={(v) => onChange({ discount: v === '' ? null : Math.max(0, Number(v) || 0) })} style={{ ...inp, textAlign: 'right' }} />
        </div>
        <div>
          <span style={lbl}>Line total</span>
          <div style={{ padding: '9px 2px', fontSize: 13.5, textAlign: 'right', whiteSpace: 'nowrap' }}><strong>{fmtMoney(lineTotal(it), currency)}</strong></div>
        </div>
        <button onClick={onRemove} title="Remove item" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '9px 10px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans, alignSelf: 'end' }}>✕</button>
      </div>
    </div>
  );
}

// Text input that commits on blur/Enter (numeric filters digits as you type).
function ItemText({ value, onCommit, numeric, placeholder, style }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <input value={v} placeholder={placeholder} inputMode={numeric ? 'decimal' : undefined}
      onChange={(e) => setV(numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
      onBlur={() => onCommit(v.trim())}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={style} />
  );
}

// ─────────────────────────────────────────────────── Client picker ────
function ClientPicker({ clients, onPick, onClose }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = (query
    ? clients.filter((c) => `${c.name} ${c.email} ${c.phone} ${c.country}`.toLowerCase().includes(query))
    : clients).slice(0, 60);
  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 22 }}>Choose a client</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Fills the order&rsquo;s customer details from the client database — no duplicate records.</div>
        </div>
        <div style={{ padding: '12px 22px' }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…"
            style={{ width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '10px 12px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '0 10px 10px' }}>
          {list.map((cl) => (
            <button key={cl.id} onClick={() => onPick(cl)} style={{ width: '100%', display: 'block', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontFamily: T.serif, fontSize: 15, color: T.ink }}>{cl.name || 'Unnamed client'}</div>
              <div style={{ fontSize: 10.5, color: T.faint, letterSpacing: '0.04em' }}>{[cl.email, cl.phone, cl.country].filter(Boolean).join(' · ') || '—'}</div>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.muted }}>{clients.length ? 'No matching clients.' : 'No clients yet — save one from an order first.'}</div>}
        </div>
        <div style={{ padding: '12px 22px', borderTop: `1px solid ${T.line}`, textAlign: 'right' }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── Client drawer ────
function ClientDrawer({ c, orders, commit, onDelete, onNewOrder, onOpenOrder, onClose }) {
  const stats = clientStats(c.id, orders);
  const setAddress = (i, v) => {
    const arr = c.addresses.slice();
    if (v === null) arr.splice(i, 1); else arr[i] = v;
    commit({ addresses: arr });
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '96vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <div style={{ fontFamily: T.serif, fontSize: 24, lineHeight: 1.1 }}>{c.name || 'Unnamed client'}</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 4 }}>
              {stats.count} order{stats.count === 1 ? '' : 's'} · lifetime {fmtLifetime(stats.lifetime)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SField label="Name" value={c.name} onCommit={(v) => commit({ name: v })} />
            <SField label="Email" value={c.email} onCommit={(v) => commit({ email: v })} />
            <SField label="Phone / WhatsApp" value={c.phone} onCommit={(v) => commit({ phone: v })} />
            <SField label="Country" value={c.country} onCommit={(v) => commit({ country: v })} />
          </div>

          <Section title="Shipping addresses" aside={<button onClick={() => commit({ addresses: [...c.addresses, ''] })} style={linkBtn}>+ Add address</button>}>
            {c.addresses.length === 0 && <div style={{ fontSize: 12, color: T.faint }}>No saved addresses — they are also captured from orders.</div>}
            {c.addresses.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <SArea label={`Address ${i + 1}`} rows={2} value={a} onCommit={(v) => setAddress(i, v)} style={{ flex: 1, marginBottom: 0 }} />
                <button onClick={() => setAddress(i, null)} title="Remove address" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '8px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans, marginTop: 21 }}>✕</button>
              </div>
            ))}
          </Section>

          <Section title="Internal notes">
            <SArea label="Notes" rows={3} value={c.notes} placeholder="Preferences, sizes, anniversaries…" onCommit={(v) => commit({ notes: v })} />
          </Section>

          <Section title="Order history" aside={<button onClick={onNewOrder} style={linkBtn}>+ New order for this client</button>}>
            {stats.orders.length === 0 && <div style={{ fontSize: 12, color: T.faint }}>No orders yet.</div>}
            {stats.orders.map((o) => (
              <button key={o.id} onClick={() => onOpenOrder(o.id)} style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 2px', background: 'transparent', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontFamily: T.serif, fontSize: 14.5, color: T.ink }}>{o.number}</span>
                <span style={{ fontSize: 11, color: T.faint }}>{isoDate(o.createdAt)}</span>
                <span style={{ flex: 1 }}><StatusPill status={o.status} /></span>
                <strong style={{ fontSize: 13 }}>{fmtMoney(orderTotals(o).total, o.currency)}</strong>
              </button>
            ))}
          </Section>
        </div>
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete</button>
          <button onClick={onClose} style={{ background: T.ink, color: T.panel, border: 'none', padding: '13px 28px', fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Done</button>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────── Settings ────
function SettingsModal({ settings, onSave, onClose }) {
  const [deductOn, setDeductOn] = useState(settings.deductOn || 'paid');
  const OPTIONS = [
    ['paid', 'When an order is marked Paid', 'Stock comes off as soon as the money arrives (also fires when a Draft jumps straight to Shipped).'],
    ['shipped', 'When an order is marked Shipped', 'Stock comes off when the parcel actually leaves.'],
    ['off', 'Never (manual)', 'The Sales desk never touches inventory — adjust units in the Inventory tab yourself.'],
  ];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 24 }}>Sales settings</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>Automatic inventory deduction — each order deducts at most once, and per-size ring stock is handled.</div>
        </div>
        <div style={{ padding: '20px 24px', display: 'grid', gap: 10 }}>
          {OPTIONS.map(([k, label, desc]) => (
            <label key={k} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '12px 14px', border: `1px solid ${deductOn === k ? T.accent : T.line2}`, background: deductOn === k ? 'rgba(138,106,59,0.07)' : T.card, cursor: 'pointer' }}>
              <input type="radio" name="deductOn" checked={deductOn === k} onChange={() => setDeductOn(k)} style={{ accentColor: T.accent, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontSize: 13.5, color: T.ink }}>{label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{desc}</span>
              </span>
            </label>
          ))}
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <button onClick={() => onSave({ deductOn })} style={{ ...primaryBtn, padding: '12px 26px' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── Form helpers ────
const sFieldStyle = { width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '10px 11px', fontSize: 13.5, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' };
const sLabel = { display: 'block', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted, marginBottom: 6 };

function SField({ label, value, onCommit, type = 'text', placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const commitNow = (val) => { if (val !== (value || '')) onCommit(val); };
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={sLabel}>{label}</span>
      <input type={type} value={v} placeholder={placeholder}
        onChange={(e) => { setV(e.target.value); if (type === 'date') commitNow(e.target.value); }}
        onBlur={() => commitNow(v)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        style={sFieldStyle} />
    </div>
  );
}

function SArea({ label, value, onCommit, rows = 3, placeholder, style }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <div style={{ marginBottom: 14, ...(style || {}) }}>
      <span style={sLabel}>{label}</span>
      <textarea value={v} rows={rows} placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value || '')) onCommit(v); }}
        style={{ ...sFieldStyle, resize: 'vertical', lineHeight: 1.55 }} />
    </div>
  );
}

function SSel({ label, value, options, onCommit, pairs, blank }) {
  const opts = pairs ? options : options.map((o) => [o, o]);
  const known = opts.some(([k]) => k === value);
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={sLabel}>{label}</span>
      <select value={known ? value : ''} onChange={(e) => onCommit(e.target.value)} style={{ ...sFieldStyle, cursor: 'pointer' }}>
        {(!known || blank != null) && <option value="">{known ? blank : (value || blank || '—')}</option>}
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

function DateInput({ value, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: T.card, border: `1px solid ${value ? T.accent : T.line2}`, padding: '6px 10px' }}>
      <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: value ? T.accent : T.muted }}>{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 12.5, fontFamily: T.sans, colorScheme: 'light' }} />
    </label>
  );
}

function Pick({ value, onChange, all, options, pairs }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: T.card, border: `1px solid ${value ? T.accent : T.line2}`, color: value ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em', maxWidth: 190 }}>
      <option value="">{all}</option>
      {options.map((o) => (pairs ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  );
}
