'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { T } from './theme';
import { PRODUCTS, CATEGORIES, MATERIALS, STOCK_OPTIONS } from '@/lib/data/products';
import { STOCK_ROWS, stockStatus } from '@/lib/data/stock-data';
import { ledgerCollection } from '@/lib/data/ledger';
import { saveOverrides } from '@/lib/overrides';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';
import { useSort, sortRows, SortLabel } from './sortable';

const LEDGER_FIELDS = ['name', 'category', 'material', 'qty', 'unitCost', 'retail', 'salePrice', 'salesCode', 'productionCode', 'stock', 'published', 'story', 'images'];
const mono = '"SFMono-Regular", ui-monospace, "Menlo", monospace';

// Neutral base for an admin-created (`_custom`) line — its override doc holds the
// real values; this just gives resolve()/val() something to fall back to.
function customBase(sku) {
  return {
    name: '', category: 'Accessories', material: '', qty: null, unitCost: null,
    retail: null, salePrice: null, salesCode: sku, productionCode: String(sku).split('-')[0],
    stock: 'Made to order', productId: null, productIds: [], published: false,
    story: '', img: null, images: [],
  };
}

function m0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
function m2(n) { if (n == null || n === '' || isNaN(Number(n))) return '—'; return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }

function ghost(disabled) {
  return { background: 'transparent', border: `1px solid ${T.line2}`, color: disabled ? T.faint : T.ink, padding: '9px 14px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1 };
}

export default function StockLedger({ overrides, setOverrides }) {
  const ROWS = useMemo(() => STOCK_ROWS, []);
  const PRODUCTS_BY_ID = useMemo(() => {
    const m = {}; PRODUCTS.forEach((p) => { m[p.id] = p; }); return m;
  }, []);

  // Admin-created items live in the override map under their sales code, marked
  // `_custom`. They list alongside the physical ledger and can be published too.
  const customIds = useMemo(
    () => Object.keys(overrides).filter((id) => overrides[id] && overrides[id]._custom),
    [overrides],
  );

  const BASE = useMemo(() => {
    const m = {};
    ROWS.forEach((r) => {
      const p = (r.productId && PRODUCTS_BY_ID[r.productId]) || null;
      const img = p ? p.img : null;
      m[r.sku] = {
        name: r.name, category: r.category, material: r.material,
        qty: r.qty, unitCost: r.cost, retail: r.retail, salePrice: null,
        salesCode: r.sku, productionCode: r.code, stock: stockStatus(r.qty),
        productId: r.productId, productIds: r.productIds || [],
        published: false, story: '', img, images: img ? [img] : [],
        collection: ledgerCollection(r.name),
      };
    });
    customIds.forEach((id) => { if (!m[id]) m[id] = customBase(id); });
    return m;
  }, [ROWS, PRODUCTS_BY_ID, customIds]);

  // New items first, then the physical ledger in its natural order.
  const ORDER = useMemo(() => [...customIds, ...ROWS.map((r) => r.sku)], [customIds, ROWS]);

  const isCustom = (sku) => !!(overrides[sku] && overrides[sku]._custom);
  const isDeleted = (sku) => !!(overrides[sku] && overrides[sku]._deleted);

  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fAvail, setFAvail] = useState('');
  const { sort, toggle: toggleSort, clear: clearSort } = useSort();
  const [editSku, setEditSku] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m) => setToast(m);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast]);

  const val = (sku, f) => { const o = overrides[sku] || {}; return (f in o) ? o[f] : BASE[sku][f]; };
  const statusManual = (sku) => { const o = overrides[sku]; return !!(o && 'stock' in o); };

  const resolve = (sku) => {
    const b = BASE[sku];
    const o = overrides[sku] || {};
    const qty = numOrNull(val(sku, 'qty'));
    const unitCost = numOrNull(val(sku, 'unitCost'));
    const retail = numOrNull(val(sku, 'retail'));
    const salePrice = numOrNull(val(sku, 'salePrice'));
    const onSale = salePrice != null && retail != null && salePrice > 0 && salePrice < retail;
    const sellRetail = onSale ? salePrice : retail;
    const status = statusManual(sku) ? val(sku, 'stock') : stockStatus(qty);
    const marginPct = (unitCost != null && sellRetail) ? (1 - unitCost / sellRetail) * 100 : null;
    const markupPct = (unitCost != null && unitCost > 0 && sellRetail != null) ? (sellRetail / unitCost - 1) * 100 : null;
    const images = Array.isArray(o.images) && o.images.length ? o.images : (o.img ? [o.img] : (b.images || []));
    return {
      sku, name: val(sku, 'name'), category: val(sku, 'category'), material: val(sku, 'material'),
      salesCode: val(sku, 'salesCode'), productionCode: val(sku, 'productionCode'),
      qty, unitCost, retail, salePrice, onSale, sellRetail, status,
      marginUnit: (unitCost != null && sellRetail != null) ? sellRetail - unitCost : null,
      marginPct, markupPct,
      costValue: (unitCost != null && qty != null) ? unitCost * qty : null,
      retailValue: (retail != null && qty != null) ? retail * qty : null,
      productId: b.productId, productIds: b.productIds,
      published: o.published === true,
      story: ('story' in o && o.story != null) ? o.story : '',
      images, img: images[0] || b.img || null,
    };
  };

  // Custom items have no static base, so they're never "edited" diffs.
  const itemEdited = (sku) => { if (isCustom(sku)) return false; const o = overrides[sku]; if (!o) return false; return LEDGER_FIELDS.some((f) => f in o && o[f] !== BASE[sku][f]); };
  const fieldEdited = (sku, f) => { if (isCustom(sku)) return false; const o = overrides[sku]; return !!(o && f in o && o[f] !== BASE[sku][f]); };

  const commit = (sku, patch) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const o = { ...(next[sku] || {}) };
      // A custom doc is self-contained — store every field, never prune to a base.
      if (o._custom) {
        Object.keys(patch).forEach((f) => {
          let v = patch[f];
          if (['qty', 'unitCost', 'retail', 'salePrice'].includes(f)) v = numOrNull(v);
          o[f] = v;
        });
        o._custom = true;
        next[sku] = o;
        saveOverrides(next);
        return next;
      }
      Object.keys(patch).forEach((f) => {
        let v = patch[f];
        if (['qty', 'unitCost', 'retail', 'salePrice'].includes(f)) v = numOrNull(v);
        const baseV = BASE[sku][f];
        const same = (v == null && baseV == null) || v === baseV;
        if (same) delete o[f]; else o[f] = v;
      });
      if (Object.keys(o).length === 0) delete next[sku]; else next[sku] = o;

      const ids = BASE[sku].productIds || [];
      const mirrors = ['retail', 'salePrice', 'stock', 'img', 'images', 'story'];
      if (ids.length && mirrors.some((f) => f in patch)) {
        const rRetail = numOrNull(('retail' in o) ? o.retail : BASE[sku].retail);
        const rSale = ('salePrice' in o) ? numOrNull(o.salePrice) : null;
        const rStatus = ('stock' in o) ? o.stock : stockStatus(numOrNull(('qty' in o) ? o.qty : BASE[sku].qty));
        const rImages = Array.isArray(o.images) && o.images.length ? o.images : (o.img ? [o.img] : null);
        const rStory = ('story' in o && o.story != null) ? o.story : '';
        ids.forEach((pid) => {
          const p = PRODUCTS_BY_ID[pid]; if (!p) return;
          const po = { ...(next[pid] || {}) };
          if ('retail' in patch) { const lp = rRetail == null ? null : Math.round(rRetail); if (lp != null && lp !== p.base.listPrice) po.listPrice = lp; else delete po.listPrice; }
          if ('salePrice' in patch) { if (rSale != null) po.salePrice = Math.round(rSale); else delete po.salePrice; }
          if ('stock' in patch) { if (rStatus !== p.base.stock) po.stock = rStatus; else delete po.stock; }
          if ('images' in patch || 'img' in patch) {
            if (rImages && rImages.length) { po.images = rImages; po.img = rImages[0]; }
            else { delete po.images; delete po.img; }
          }
          if ('story' in patch) { if (rStory) po.story = rStory; else delete po.story; }
          if (Object.keys(po).length === 0) delete next[pid]; else next[pid] = po;
        });
      }
      saveOverrides(next);
      return next;
    });
  };

  const resetItem = (sku) => {
    setOverrides((prev) => {
      const n = { ...prev }; delete n[sku];
      (BASE[sku].productIds || []).forEach((pid) => { delete n[pid]; });
      saveOverrides(n);
      return n;
    });
    flash('Line reset to ledger original');
  };

  // Create a brand-new item. Keyed by its sales code; must be unique.
  const skuExists = (code) => !!BASE[code] || ROWS.some((r) => r.sku === code);
  const createItem = (form) => {
    const id = (form.salesCode || '').trim();
    const rec = {
      _custom: true,
      name: (form.name || '').trim() || 'Untitled item',
      category: form.category || 'Accessories',
      material: form.material || '',
      qty: numOrNull(form.qty), unitCost: numOrNull(form.unitCost), retail: numOrNull(form.retail),
      salesCode: id, productionCode: (form.productionCode || '').trim() || id.split('-')[0],
      stock: 'Made to order', published: false, story: '', images: [],
    };
    setOverrides((prev) => { const next = { ...prev, [id]: rec }; saveOverrides(next); return next; });
    setNewOpen(false);
    setEditSku(id);
    flash('New item created — add photos & publish when ready');
  };

  // Delete: custom items are removed outright; physical ledger lines are
  // soft-deleted (hidden, restorable from the “Deleted” filter).
  const deleteItem = (sku) => {
    const custom = isCustom(sku);
    const label = (overrides[sku] && overrides[sku].name) || (BASE[sku] && BASE[sku].name) || sku;
    const ok = confirm(custom
      ? `Delete “${label}” permanently? This custom item will be removed entirely.`
      : `Delete “${label}”? It will be hidden from the storefront and the desk — you can restore it later from the “Deleted” filter.`);
    if (!ok) return;
    setOverrides((prev) => {
      const next = { ...prev };
      if (custom) {
        delete next[sku];
      } else {
        next[sku] = { ...(next[sku] || {}), _deleted: true };
        (BASE[sku].productIds || []).forEach((pid) => { delete next[pid]; });
      }
      saveOverrides(next);
      return next;
    });
    setEditSku(null);
    flash(custom ? 'Item deleted' : 'Item deleted — restore from the “Deleted” filter');
  };

  const restoreItem = (sku) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const o = { ...(next[sku] || {}) };
      delete o._deleted;
      if (Object.keys(o).length === 0) delete next[sku]; else next[sku] = o;
      saveOverrides(next);
      return next;
    });
    flash('Item restored');
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = ORDER.map(resolve).filter((r) => {
      const del = isDeleted(r.sku);
      if (fAvail === 'deleted') { if (!del) return false; }
      else if (del) return false;          // deleted lines are hidden everywhere else
      if (fCat && r.category !== fCat) return false;
      if (fAvail === 'custom' && !isCustom(r.sku)) return false;
      if (fAvail === 'low' && !(r.qty != null && r.qty > 0 && r.qty <= 2)) return false;
      if (fAvail === 'out' && !(r.qty != null && r.qty <= 0)) return false;
      if (fAvail === 'in' && !(r.qty != null && r.qty > 2)) return false;
      if (fAvail === 'nocost' && r.unitCost != null) return false;
      if (fAvail === 'online' && !r.published) return false;
      if (fAvail === 'offline' && r.published) return false;
      if (fAvail === 'noimage' && r.img) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.salesCode.toLowerCase().includes(q) || r.productionCode.toLowerCase().includes(q))) return false;
      return true;
    });
    return sortRows(out, sort);
  // eslint-disable-next-line
  }, [overrides, search, fCat, fAvail, sort]);

  const stats = useMemo(() => {
    let units = 0, costVal = 0, retailVal = 0, costedRetail = 0, low = 0, out = 0, noCost = 0;
    ORDER.forEach((sku) => {
      const r = resolve(sku);
      units += r.qty || 0;
      if (r.qty != null && r.qty <= 0) out++;
      else if (r.qty != null && r.qty <= 2) low++;
      if (r.unitCost == null) noCost++;
      if (r.retailValue != null) retailVal += r.retailValue;
      if (r.costValue != null) { costVal += r.costValue; costedRetail += (r.retail * (r.qty || 0)); }
    });
    const marginVal = costedRetail - costVal;
    const marginPct = costedRetail > 0 ? (marginVal / costedRetail) * 100 : null;
    return { skus: ORDER.length, units, costVal, retailVal, marginVal, marginPct, low, out, noCost };
  // eslint-disable-next-line
  }, [overrides]);

  const editedCount = ORDER.filter(itemEdited).length;
  const onlineCount = ORDER.filter((sku) => (overrides[sku] || {}).published === true).length;

  const exportLedger = (fmt) => {
    const data = ORDER.map((sku) => {
      const r = resolve(sku);
      return { salesCode: r.salesCode, productionCode: r.productionCode, name: r.name, category: r.category, material: r.material, units: r.qty, unitCost: r.unitCost, retail: r.retail, salePrice: r.salePrice, marginPct: r.marginPct == null ? '' : r.marginPct.toFixed(1), totalCost: r.costValue, totalRetail: r.retailValue, status: r.status, online: r.published ? 'yes' : 'no', images: r.images.length, catalogueId: r.productId || '' };
    });
    let blob, fname;
    if (fmt === 'json') { blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); fname = 'malaya-stock-ledger.json'; }
    else {
      const cols = ['salesCode', 'productionCode', 'name', 'category', 'material', 'units', 'unitCost', 'retail', 'salePrice', 'marginPct', 'totalCost', 'totalRetail', 'status', 'online', 'images', 'catalogueId'];
      const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = [cols.join(',')].concat(data.map((row) => cols.map((c) => esc(row[c])).join(','))).join('\n');
      blob = new Blob([csv], { type: 'text/csv' }); fname = 'malaya-stock-ledger.csv';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Exported ${fmt.toUpperCase()} · ${data.length} lines`);
  };

  const editing = editSku ? resolve(editSku) : null;

  return (
    <div>
      <div style={{ padding: '22px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: T.serif, fontSize: 38, margin: 0, lineHeight: 1 }}>Stock ledger</h1>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, letterSpacing: '0.04em' }}>
              {rows.length} of {stats.skus} lines · <span style={{ color: onlineCount ? T.good : T.muted }}>{onlineCount} online</span> · toggle any line to publish it to the live storefront
              {editedCount > 0 && <> · <span style={{ color: T.accent }}>{editedCount} edited</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setNewOpen(true)} style={{ background: T.ink, color: T.panel, border: 'none', padding: '10px 16px', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>+ New item</button>
            <button onClick={() => exportLedger('csv')} style={ghost()}>Export CSV</button>
            <button onClick={() => exportLedger('json')} style={ghost()}>Export JSON</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: T.line2, border: `1px solid ${T.line2}` }}>
          <Stat label="Units on hand" value={stats.units.toLocaleString('en-US')} />
          <Stat label="Cost value" value={m0(stats.costVal)} sub="at unit cost" />
          <Stat label="Retail value" value={m0(stats.retailVal)} sub="at list price" />
          <Stat label="Gross margin" value={stats.marginPct == null ? '—' : stats.marginPct.toFixed(1) + '%'} sub={m0(stats.marginVal) + ' on costed lines'} accent />
          <Stat label="Low / sold out" value={`${stats.low} / ${stats.out}`} sub={stats.noCost ? stats.noCost + ' missing cost' : 'all costed'} />
        </div>
      </div>

      <div style={{ padding: '16px 28px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1 }} />
        </div>
        <Pick value={fCat} onChange={setFCat} all="All categories" options={CATEGORIES} />
        <Pick value={fAvail} onChange={setFAvail} all="All availability" options={[['online', 'Online'], ['offline', 'Offline'], ['noimage', 'No image'], ['low', 'Low stock'], ['out', 'Sold out'], ['in', 'In stock'], ['nocost', 'Missing cost'], ['custom', 'New items'], ['deleted', 'Deleted']]} pairs />
        <span style={{ fontSize: 11, color: T.faint, letterSpacing: '0.04em' }}>Click a column heading to sort</span>
        {(search || fCat || fAvail || sort) &&
          <button onClick={() => { setSearch(''); setFCat(''); setFAvail(''); clearSort(); }} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>Clear</button>}
      </div>

      <div style={{ padding: '16px 28px 80px' }}>
        <div style={{ border: `1px solid ${T.line}`, background: T.panel }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.card }}>
                {[['name', 'Item', 'left'], ['salesCode', 'Sales code', 'left'], ['qty', 'Units', 'right'], ['unitCost', 'Unit cost', 'right'], ['retail', 'Retail', 'right'], ['marginPct', 'Margin', 'right'], ['retailValue', 'Value', 'right'], ['status', 'Status', 'left'], [null, '', 'right']].map(([key, h, al], i) => (
                  <th key={i} style={{ textAlign: al, padding: '11px 14px', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, borderBottom: `1px solid ${T.line2}`, position: 'sticky', top: 56, background: T.card, whiteSpace: 'nowrap' }}>
                    {key ? <SortLabel label={h} sortKey={key} sort={sort} onSort={toggleSort} align={al} /> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <LedgerRow key={r.sku} r={r} edited={itemEdited(r.sku)} custom={isCustom(r.sku)} deleted={isDeleted(r.sku)} fieldEdited={fieldEdited} commit={commit} onEdit={() => setEditSku(r.sku)} onRestore={() => restoreItem(r.sku)} />)}
              {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>No stock lines match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <LedgerDrawer r={editing} base={BASE[editSku]} custom={isCustom(editSku)} fieldEdited={fieldEdited} commit={commit} resetItem={resetItem} deleteItem={deleteItem} onClose={() => setEditSku(null)} />}
      {newOpen && <NewItemModal exists={skuExists} onCreate={createItem} onClose={() => setNewOpen(false)} />}
      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>}
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ background: T.panel, padding: '14px 16px' }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted }}>{label}</div>
      <div style={{ fontFamily: T.serif, fontSize: 27, lineHeight: 1.1, marginTop: 5, color: accent ? T.accent : T.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 3, letterSpacing: '0.02em' }}>{sub}</div>}
    </div>
  );
}

function LedgerRow({ r, edited, custom, deleted, fieldEdited, commit, onEdit, onRestore }) {
  const statusColor = { 'Sold out': T.danger, 'Archived': T.faint, 'Low stock': T.accent, 'Made to order': T.muted }[r.status] || T.good;
  const lowQty = r.qty != null && r.qty <= 2;
  const rowBg = deleted ? 'rgba(164,80,43,0.05)' : (custom ? 'rgba(91,110,74,0.06)' : (edited ? 'rgba(138,106,59,0.045)' : 'transparent'));
  return (
    <tr style={{ borderBottom: `1px solid ${T.line}`, background: rowBg, opacity: deleted ? 0.6 : 1 }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', position: 'relative' }}>
            {r.img ? <img src={r.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.serif, fontSize: 13, color: T.faint }}>{(r.productionCode || '').replace(/[^A-Za-z]/g, '').slice(0, 2)}</div>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.serif, fontSize: 15.5, lineHeight: 1.15, color: T.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
              {r.name || <span style={{ color: T.faint }}>Untitled item</span>}
              {custom && <span style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.good, border: `1px solid ${T.good}`, padding: '1px 5px', borderRadius: 2 }}>New</span>}
              {deleted && <span style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.danger, border: `1px solid ${T.danger}`, padding: '1px 5px', borderRadius: 2 }}>Deleted</span>}
            </div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><span style={{ color: T.muted }}>MODEL</span> {r.productionCode}</span>
              <span style={{ color: r.published ? T.good : T.faint, letterSpacing: '0.06em' }}>{r.published ? '● online' : '○ offline'}</span>
              {!r.img && <span style={{ color: T.muted, letterSpacing: '0.06em' }}>no image</span>}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: mono, fontSize: 12, color: T.muted }}>{r.salesCode}</td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}><NumCell value={r.qty} edited={fieldEdited(r.sku, 'qty')} onCommit={(v) => commit(r.sku, { qty: v })} width={46} color={lowQty ? T.accent : T.ink} /></td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}><NumCell value={r.unitCost} edited={fieldEdited(r.sku, 'unitCost')} onCommit={(v) => commit(r.sku, { unitCost: v })} money placeholder="—" /></td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
        <NumCell value={r.retail} edited={fieldEdited(r.sku, 'retail')} onCommit={(v) => commit(r.sku, { retail: v })} money />
        {r.onSale && <div style={{ fontSize: 10, color: T.accent, marginTop: 2 }}>sale {m2(r.salePrice)}</div>}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {r.marginPct == null ? <span style={{ color: T.faint }}>—</span> : <span style={{ color: r.marginPct < 40 ? T.danger : T.ink, fontWeight: 500 }}>{r.marginPct.toFixed(0)}%</span>}
        {r.marginUnit != null && <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{m2(r.marginUnit)}/ea</div>}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', color: T.ink }}>
        {r.retailValue == null ? <span style={{ color: T.faint }}>—</span> : m0(r.retailValue)}
        {r.costValue != null && <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>cost {m0(r.costValue)}</div>}
      </td>
      <td style={{ padding: '10px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: statusColor, whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />{r.status}
        </span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {deleted ? (
          <button onClick={onRestore} style={{ ...ghost(), padding: '7px 12px', fontSize: 10, color: T.good, borderColor: T.good }}>Restore</button>
        ) : (
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <PublishPill on={r.published} onToggle={() => commit(r.sku, { published: !r.published })} />
            <button onClick={onEdit} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Edit</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// Compact online/offline switch used in the ledger table row.
function PublishPill({ on, onToggle }) {
  return (
    <button onClick={onToggle} title={on ? 'Online — click to unpublish' : 'Offline — click to publish to the live site'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${on ? T.good : T.line2}`, background: on ? 'rgba(91,110,74,0.12)' : 'transparent', color: on ? T.good : T.muted }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? T.good : T.faint }} />{on ? 'Online' : 'Publish'}
    </button>
  );
}

function NumCell({ value, onCommit, edited, money, placeholder, width = 60, color }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);
  const done = () => { const t = v.trim(); onCommit(t === '' ? null : t); };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      {money && <span style={{ color: edited ? T.accent : T.faint, fontSize: 12, marginRight: 1 }}>$</span>}
      <input value={v} placeholder={placeholder || '0'} inputMode="decimal"
        onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        style={{ width, textAlign: 'right', background: 'transparent', border: 'none', borderBottom: `1px solid ${edited ? T.accent : T.line2}`, color: edited ? T.accent : (color || T.ink), fontSize: 14, fontFamily: T.sans, padding: '4px 2px', outline: 'none', fontWeight: edited ? 600 : 400 }} />
    </div>
  );
}

function LedgerDrawer({ r, base, custom, fieldEdited, commit, resetItem, deleteItem, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '92vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.img ? <img src={r.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
                : <span style={{ fontFamily: T.serif, fontSize: 16, color: T.faint }}>{r.productionCode.slice(0, 3)}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.serif, fontSize: 21, lineHeight: 1.12 }}>{r.name}</div>
              <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 4 }}>{r.salesCode}{custom ? ' · custom item' : (r.productId ? ` · catalogue ${r.productId.toUpperCase()}` : ' · ledger only')}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          <div style={{ marginBottom: 20, padding: '14px 16px', background: r.published ? 'rgba(91,110,74,0.10)' : T.card, border: `1px solid ${r.published ? T.good : T.line2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: r.published ? T.good : T.muted }}>Storefront</div>
                <div style={{ fontFamily: T.serif, fontSize: 21, color: T.ink, marginTop: 2 }}>{r.published ? 'Online' : 'Offline'}</div>
              </div>
              <Switch on={r.published} onChange={(v) => commit(r.sku, { published: v })} />
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6, marginTop: 10 }}>
              {r.published
                ? <>Live on the storefront{!r.img ? ' — no image yet; you can add photos below at any time.' : '.'} <a href={`/product/${encodeURIComponent(r.sku)}`} target="_blank" rel="noreferrer" style={{ color: T.accent }}>View on site →</a></>
                : 'Publish to list this stock line on the live storefront. You can publish now and add images later.'}
              {r.published && r.productIds.length > 0 && <div style={{ marginTop: 6, color: T.faint }}>Supersedes {r.productIds.length} linked catalogue listing{r.productIds.length > 1 ? 's' : ''} online to avoid duplicates.</div>}
            </div>
          </div>
          <DField label="Item name" value={r.name} edited={fieldEdited(r.sku, 'name')} base={base.name} onCommit={(v) => commit(r.sku, { name: v })} onRevert={() => commit(r.sku, { name: base.name })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DField label="Sales code (SKU)" value={r.salesCode} edited={fieldEdited(r.sku, 'salesCode')} base={base.salesCode} onCommit={(v) => commit(r.sku, { salesCode: v })} onRevert={() => commit(r.sku, { salesCode: base.salesCode })} />
            <DField label="Production code" value={r.productionCode} edited={fieldEdited(r.sku, 'productionCode')} base={base.productionCode} onCommit={(v) => commit(r.sku, { productionCode: v })} onRevert={() => commit(r.sku, { productionCode: base.productionCode })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DSel label="Category" value={r.category} options={CATEGORIES} edited={fieldEdited(r.sku, 'category')} base={base.category} onCommit={(v) => commit(r.sku, { category: v })} onRevert={() => commit(r.sku, { category: base.category })} />
            <DSel label="Material" value={r.material} options={MATERIALS} edited={fieldEdited(r.sku, 'material')} base={base.material} onCommit={(v) => commit(r.sku, { material: v })} onRevert={() => commit(r.sku, { material: base.material })} />
          </div>
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Inventory</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <DNum label="Units on hand" value={r.qty} edited={fieldEdited(r.sku, 'qty')} base={base.qty} onCommit={(v) => commit(r.sku, { qty: v })} onRevert={() => commit(r.sku, { qty: base.qty })} />
              <DSel label="Status override" value={r.status} options={STOCK_OPTIONS} edited={fieldEdited(r.sku, 'stock')} base={base.stock} onCommit={(v) => commit(r.sku, { stock: v })} onRevert={() => commit(r.sku, { stock: base.stock })} />
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Pricing &amp; margin</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <DNum label="Unit cost" money value={r.unitCost} placeholder="—" edited={fieldEdited(r.sku, 'unitCost')} base={base.unitCost} onCommit={(v) => commit(r.sku, { unitCost: v })} onRevert={() => commit(r.sku, { unitCost: base.unitCost })} />
              <DNum label="Retail" money value={r.retail} edited={fieldEdited(r.sku, 'retail')} base={base.retail} onCommit={(v) => commit(r.sku, { retail: v })} onRevert={() => commit(r.sku, { retail: base.retail })} />
              <DNum label="Sale price" money value={r.salePrice} placeholder="—" edited={fieldEdited(r.sku, 'salePrice')} base={base.salePrice} onCommit={(v) => commit(r.sku, { salePrice: v })} onRevert={() => commit(r.sku, { salePrice: base.salePrice })} />
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Readout label="Gross margin" value={r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'} sub={r.marginUnit == null ? 'cost unknown' : m2(r.marginUnit) + ' / unit'} />
              <Readout label="Markup" value={r.markupPct == null ? '—' : r.markupPct.toFixed(0) + '%'} sub={r.markupPct == null ? 'cost unknown' : 'over unit cost'} />
              <Readout label="Stock cost value" value={r.costValue == null ? '—' : m2(r.costValue)} sub={r.qty == null ? '' : `${r.qty} × cost`} />
              <Readout label="Stock retail value" value={r.retailValue == null ? '—' : m2(r.retailValue)} sub={r.qty == null ? '' : `${r.qty} × retail`} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Story</div>
            <DTextArea value={r.story} edited={fieldEdited(r.sku, 'story')} onCommit={(v) => commit(r.sku, { story: v })} onRevert={() => commit(r.sku, { story: '' })}
              placeholder="Tell this piece's story — materials, symbolism, craft. Shown on the product page (blank lines start a new paragraph)." />
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent }}>Images</div>
              <div style={{ fontSize: 10, color: T.faint }}>{r.images.length} photo{r.images.length === 1 ? '' : 's'} · gallery</div>
            </div>
            <Gallery sku={r.sku} images={r.images} onChange={(arr) => commit(r.sku, { images: arr.length ? arr : null, img: arr[0] || null })} />
          </div>

          {r.productId && (
            <div style={{ marginTop: 18, padding: '12px 14px', background: T.card, border: `1px solid ${T.line}`, fontSize: 11.5, color: T.muted, lineHeight: 1.6 }}>
              Retail, sale price, availability, story &amp; images on this line flow to the live catalogue{r.productIds.length > 1 ? ` (${r.productIds.length} linked listings).` : '.'}
            </div>
          )}
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <button onClick={() => deleteItem(r.sku)} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete{custom ? '' : ' item'}</button>
            {!custom && <button onClick={() => resetItem(r.sku)} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Reset to ledger</button>}
          </div>
          <button onClick={onClose} style={{ background: T.ink, color: T.panel, border: 'none', padding: '13px 28px', fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Done</button>
        </div>
      </aside>
    </div>
  );
}

function Readout({ label, value, sub }) {
  return (
    <div style={{ padding: '11px 13px', background: T.card, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.muted }}>{label}</div>
      <div style={{ fontFamily: T.serif, fontSize: 22, color: T.ink, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// Drawer form helpers
function DShell({ label, edited, base, onRevert, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: edited ? T.accent : T.muted }}>{label}{edited ? ' ·' : ''}</span>
        {edited && <button onClick={onRevert} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>was <span style={{ textDecoration: 'line-through' }}>{base == null || base === '' ? '—' : String(base)}</span> · revert</button>}
      </div>
      {children}
    </div>
  );
}
const dFieldStyle = (edited) => ({ width: '100%', background: T.card, border: `1px solid ${edited ? T.accent : T.line2}`, color: T.ink, padding: '11px 12px', fontSize: 14, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' });
function DField({ label, value, edited, base, onCommit, onRevert }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return <DShell label={label} edited={edited} base={base} onRevert={onRevert}><input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} style={dFieldStyle(edited)} /></DShell>;
}
function DSel({ label, value, options, edited, base, onCommit, onRevert }) {
  return <DShell label={label} edited={edited} base={base} onRevert={onRevert}><select value={value} onChange={(e) => onCommit(e.target.value)} style={{ ...dFieldStyle(edited), cursor: 'pointer' }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></DShell>;
}
function DNum({ label, value, edited, base, onCommit, onRevert, placeholder, money }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <DShell label={label} edited={edited} base={base} onRevert={onRevert}>
      <div style={{ position: 'relative' }}>
        {money && <span style={{ position: 'absolute', left: 12, top: 11, color: T.faint, fontSize: 14 }}>$</span>}
        <input value={v} placeholder={placeholder || '0'} inputMode="decimal"
          onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => onCommit(v.trim() === '' ? null : v.trim())}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          style={{ ...dFieldStyle(edited), paddingLeft: money ? 26 : 12 }} />
      </div>
    </DShell>
  );
}

// Narrative/story editor (multi-line).
function DTextArea({ value, edited, onCommit, onRevert, placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <DShell label="Narrative" edited={edited} base="" onRevert={onRevert}>
      <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} placeholder={placeholder} rows={5}
        style={{ ...dFieldStyle(edited), resize: 'vertical', lineHeight: 1.6, minHeight: 116, fontFamily: T.sans }} />
    </DShell>
  );
}

// On/off switch for the publish (online) toggle.
function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} title={on ? 'Online' : 'Offline'}
      style={{ position: 'relative', width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? T.good : T.line2, transition: 'background .15s', flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}

// Multi-image gallery: upload (click or drag-drop) to Firebase Storage, reorder
// and remove. The first image is the primary photo. An item can have zero images.
function Gallery({ sku, images, onChange }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const list = images || [];
  const addFiles = async (files) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload images.'); return; }
    const arr = files ? Array.from(files) : [];
    if (!arr.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of arr) urls.push(await uploadImage(`products/${sku}`, await resizeImageFile(f)));
      onChange([...list, ...urls]);
    } catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(false); }
  };
  const removeAt = (i) => onChange(list.filter((_, j) => j !== i));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; const a = list.slice(); [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <div>
      {list.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 12 }}>
          {list.map((src, i) => (
            <div key={src + i} style={{ border: `1px solid ${i === 0 ? T.accent : T.line2}`, background: T.card, position: 'relative' }}>
              <div style={{ aspectRatio: '1 / 1', overflow: 'hidden' }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.opacity = 0.3; }} />
              </div>
              {i === 0 && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', background: T.accent, color: '#fff', padding: '2px 5px' }}>Main</span>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 5px', gap: 2 }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <IconBtn label="◀" title="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconBtn label="▶" title="Move later" disabled={i === list.length - 1} onClick={() => move(i, 1)} />
                </div>
                <IconBtn label="✕" title="Remove image" danger onClick={() => removeAt(i)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div onClick={() => ref.current && ref.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        style={{ border: `1px dashed ${T.line2}`, background: T.card, padding: '18px 16px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', color: T.muted }}>
        <div style={{ fontSize: 12, letterSpacing: '0.04em' }}>{busy ? 'Uploading…' : (list.length ? 'Add more images' : 'Upload images')}</div>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>Click or drop photos here · the first image is the main one</div>
        <input ref={ref} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { const fs = e.target.files; e.target.value = ''; addFiles(fs); }} />
      </div>
      {!FIREBASE_ENABLED && <div style={{ fontSize: 10, color: T.faint, marginTop: 6 }}>Connect Firebase to enable uploads.</div>}
    </div>
  );
}

function IconBtn({ label, title, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ background: 'transparent', border: `1px solid ${T.line}`, color: disabled ? T.faint : (danger ? T.danger : T.muted), fontSize: 10, lineHeight: 1, padding: '3px 5px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{label}</button>
  );
}

// Create-a-new-item dialog. The sales code is the item's key, so it must be
// non-empty and not collide with an existing ledger SKU or custom item.
function NewItemModal({ exists, onCreate, onClose }) {
  const [f, setF] = useState({ salesCode: '', name: '', category: 'Pendants', material: 'Silver', qty: '', unitCost: '', retail: '', productionCode: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const code = f.salesCode.trim();
  const dupe = code !== '' && exists(code);
  const valid = code !== '' && !dupe;
  const submit = () => { if (valid) onCreate(f); };
  const label = { fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 7, display: 'block' };
  const field = { width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '11px 12px', fontSize: 14, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 24 }}>New item</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5, lineHeight: 1.6 }}>Create a stock line from scratch. You can add photos, a story and publish it once it's saved.</div>
        </div>
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span style={label}>Sales code (SKU) *</span>
            <input value={f.salesCode} onChange={set('salesCode')} placeholder="e.g. P200-S" autoFocus style={{ ...field, fontFamily: mono, borderColor: dupe ? T.danger : T.line2 }} />
            {dupe && <span style={{ fontSize: 11, color: T.danger, marginTop: 6, display: 'block' }}>That sales code already exists — choose another.</span>}
          </div>
          <div>
            <span style={label}>Item name</span>
            <input value={f.name} onChange={set('name')} placeholder="e.g. Lotus Pendant, Silver" style={field} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <span style={label}>Category</span>
              <select value={f.category} onChange={set('category')} style={{ ...field, cursor: 'pointer' }}>{CATEGORIES.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            </div>
            <div>
              <span style={label}>Material</span>
              <select value={f.material} onChange={set('material')} style={{ ...field, cursor: 'pointer' }}>{MATERIALS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <span style={label}>Units</span>
              <input value={f.qty} onChange={(e) => setF((s) => ({ ...s, qty: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="0" inputMode="decimal" style={field} />
            </div>
            <div>
              <span style={label}>Unit cost</span>
              <input value={f.unitCost} onChange={(e) => setF((s) => ({ ...s, unitCost: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="—" inputMode="decimal" style={field} />
            </div>
            <div>
              <span style={label}>Retail</span>
              <input value={f.retail} onChange={(e) => setF((s) => ({ ...s, retail: e.target.value.replace(/[^0-9.]/g, '') }))} placeholder="0" inputMode="decimal" style={field} />
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <button onClick={submit} disabled={!valid} style={{ background: T.ink, color: T.panel, border: 'none', padding: '12px 26px', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.4, fontFamily: T.sans }}>Create item</button>
        </div>
      </div>
    </div>
  );
}

function Pick({ value, onChange, all, options, pairs }) {
  const isSort = all === 'Sort: ledger order';
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: T.card, border: `1px solid ${value && value !== 'default' ? T.accent : T.line2}`, color: value && value !== 'default' ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em' }}>
      <option value={isSort ? 'default' : ''}>{all}</option>
      {options.map((o) => pairs ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
