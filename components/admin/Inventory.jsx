'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Inventory — the single, unified list of items for the admin desk. It replaces
// the old separate "Stock ledger" and "Catalogue prices" tabs (see
// lib/data/inventory.js for how the two are merged into one de-duplicated list).
//
// Every row edits the same override layer the live storefront reads, so changes
// flow straight to the site:
//   • catalogue entities save under their product id (the catalogue override)
//   • ledger-only entities save under their SKU (and publish takes them online)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react';
import { T } from './theme';
import { CATEGORIES, MATERIALS, STOCK_OPTIONS } from '@/lib/data/products';
import { stockStatus } from '@/lib/data/stock-data';
import { resolveProduct } from '@/lib/data/resolve';
import {
  INVENTORY, INVENTORY_BY_KEY, isBlankEntity,
  METAL_SCOPES, matchesMetalScope,
} from '@/lib/data/inventory';
import { saveOverrides } from '@/lib/overrides';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';

function m0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
function m2(n) { if (n == null || n === '' || isNaN(Number(n))) return '—'; return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }

function ghost(disabled) {
  return { background: 'transparent', border: `1px solid ${T.line2}`, color: disabled ? T.faint : T.ink, padding: '9px 14px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1 };
}

// Override field name for a generic field, per entity kind (the catalogue stores
// its list price under `listPrice`; the ledger under `retail`).
const ovField = (kind, g) => (kind === 'catalogue' && g === 'retail' ? 'listPrice' : g);
const NUMERIC = ['retail', 'salePrice', 'qty', 'unitCost'];

export default function Inventory({ overrides, setOverrides }) {
  const ENTITIES = useMemo(() => INVENTORY, []);
  const ORDER = useMemo(() => ENTITIES.map((e) => e.key), [ENTITIES]);

  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fMat, setFMat] = useState('');
  const [fAvail, setFAvail] = useState('');
  const [sort, setSort] = useState('default');
  const [showBlank, setShowBlank] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m) => setToast(m);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast]);

  const blankCount = useMemo(() => ENTITIES.filter(isBlankEntity).length, [ENTITIES]);

  // ── Resolve an entity (base + its override) into a display record ───────────
  const resolve = (key) => {
    const e = INVENTORY_BY_KEY[key];
    const b = e.base;
    const o = overrides[key] || {};
    let name, sub, category, collection, material, salesCode, productionCode, stock, retail, salePrice, onSale, images, img, story;

    if (e.kind === 'catalogue') {
      const rp = resolveProduct({ ...b, id: e.key, listPrice: b.retail, salePrice: b.salePrice, tag: null }, o);
      name = rp.name; sub = rp.sub; category = rp.category; collection = rp.collection; material = rp.material;
      salesCode = rp.salesCode; productionCode = rp.productionCode; stock = rp.stock;
      retail = rp.listPrice; salePrice = rp.salePrice; onSale = rp.onSale; images = rp.images; img = rp.img; story = rp.story;
    } else {
      const val = (f) => (f in o ? o[f] : b[f]);
      name = val('name'); sub = val('sub'); category = val('category'); collection = b.collection; material = val('material');
      salesCode = val('salesCode'); productionCode = val('productionCode');
      retail = numOrNull(val('retail')); salePrice = numOrNull(val('salePrice'));
      onSale = salePrice != null && retail != null && salePrice > 0 && salePrice < retail;
      stock = 'stock' in o ? o.stock : stockStatus(numOrNull(val('qty')));
      images = Array.isArray(o.images) && o.images.length ? o.images : (o.img ? [o.img] : (b.images || []));
      img = images[0] || b.img || null;
      story = 'story' in o && o.story != null ? o.story : '';
    }

    const qty = numOrNull('qty' in o ? o.qty : b.qty);
    const unitCost = numOrNull('unitCost' in o ? o.unitCost : b.unitCost);
    const sellRetail = onSale ? salePrice : retail;
    const online = e.kind === 'catalogue' ? stock !== 'Archived' : o.published === true;
    const marginPct = unitCost != null && sellRetail ? (1 - unitCost / sellRetail) * 100 : null;
    const markupPct = unitCost != null && unitCost > 0 && sellRetail != null ? (sellRetail / unitCost - 1) * 100 : null;
    return {
      key, kind: e.kind, sku: e.sku, productId: e.kind === 'catalogue' ? e.key : null,
      name, sub, category, collection, material, salesCode, productionCode,
      qty, unitCost, retail, salePrice, onSale, sellRetail, stock, online,
      marginUnit: unitCost != null && sellRetail != null ? sellRetail - unitCost : null,
      marginPct, markupPct,
      costValue: unitCost != null && qty != null ? unitCost * qty : null,
      retailValue: retail != null && qty != null ? retail * qty : null,
      images, img, story,
    };
  };

  const itemEdited = (key) => { const o = overrides[key]; return !!(o && Object.keys(o).length); };
  const fieldEdited = (key, g) => {
    const e = INVENTORY_BY_KEY[key]; const o = overrides[key]; if (!o) return false;
    const f = ovField(e.kind, g);
    if (!(f in o)) return false;
    const baseV = e.base[g];
    if (NUMERIC.includes(g)) {
      const a = o[f] === '' || o[f] == null ? null : Number(o[f]);
      const c = baseV == null ? null : Number(baseV);
      return a !== c;
    }
    return o[f] !== baseV;
  };

  // ── Commit a generic patch to an entity's override ─────────────────────────
  const commit = (key, patch) => {
    setOverrides((prev) => {
      const e = INVENTORY_BY_KEY[key];
      const next = { ...prev };
      const o = { ...(next[key] || {}) };
      const p = { ...patch };

      // Unified online/offline control maps onto each kind's mechanism.
      if ('online' in p) {
        if (e.kind === 'catalogue') p.stock = p.online ? e.base.stock : 'Archived';
        else o.published = p.online === true;
        delete p.online;
      }

      Object.keys(p).forEach((g) => {
        const f = ovField(e.kind, g);
        let v = p[g];
        if (NUMERIC.includes(g)) v = numOrNull(v);
        if (typeof v === 'string') v = v.trim();
        const baseV = e.base[g];
        let same;
        if (g === 'images' || g === 'img') same = false; // arrays/urls: always store the explicit choice
        else if (NUMERIC.includes(g)) same = (v == null && baseV == null) || Number(v) === Number(baseV);
        else same = v === baseV;
        const dropNullPrice = f === 'listPrice' && v == null; // never store a blank catalogue list price
        if (same || dropNullPrice) delete o[f]; else o[f] = v;
      });

      // Tidy publish flag if it fell back to default.
      if (e.kind === 'ledger' && o.published !== true) delete o.published;

      if (Object.keys(o).length === 0) delete next[key]; else next[key] = o;
      saveOverrides(next);
      return next;
    });
  };

  const resetItem = (key) => {
    setOverrides((prev) => { const n = { ...prev }; delete n[key]; saveOverrides(n); return n; });
    flash('Item reset to original');
  };
  const resetAll = () => {
    if (!confirm('Reset every item back to its original studio values? This clears all manual edits.')) return;
    setOverrides(() => { saveOverrides({}); return {}; });
    flash('All edits cleared');
  };

  // ── Filtering / sorting ────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = ORDER.map(resolve).filter((r) => {
      const e = INVENTORY_BY_KEY[r.key];
      if (!showBlank && isBlankEntity(e)) return false;
      if (fCat && r.category !== fCat) return false;
      if (fMat && r.material !== fMat) return false;
      if (fAvail === 'low' && !(r.qty != null && r.qty > 0 && r.qty <= 2)) return false;
      if (fAvail === 'out' && !(r.qty != null && r.qty <= 0)) return false;
      if (fAvail === 'in' && !(r.qty != null && r.qty > 2)) return false;
      if (fAvail === 'nocost' && r.unitCost != null) return false;
      if (fAvail === 'online' && !r.online) return false;
      if (fAvail === 'offline' && r.online) return false;
      if (fAvail === 'noimage' && r.img) return false;
      if (fAvail === 'onsale' && !r.onSale) return false;
      if (q && !(r.name.toLowerCase().includes(q) || (r.salesCode || '').toLowerCase().includes(q) || (r.productionCode || '').toLowerCase().includes(q) || r.key.toLowerCase().includes(q))) return false;
      return true;
    });
    const by = {
      units: (a, b) => (a.qty || 0) - (b.qty || 0),
      'units-desc': (a, b) => (b.qty || 0) - (a.qty || 0),
      'price-desc': (a, b) => (b.retail || 0) - (a.retail || 0),
      'price-asc': (a, b) => (a.retail || 0) - (b.retail || 0),
      margin: (a, b) => (b.marginPct ?? -1) - (a.marginPct ?? -1),
      value: (a, b) => (b.retailValue ?? 0) - (a.retailValue ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    if (by[sort]) out.sort(by[sort]);
    return out;
  // eslint-disable-next-line
  }, [overrides, search, fCat, fMat, fAvail, sort, showBlank]);

  const stats = useMemo(() => {
    let items = 0, units = 0, retailVal = 0, online = 0, low = 0, out = 0;
    ENTITIES.forEach((e) => {
      if (isBlankEntity(e)) return;
      const r = resolve(e.key);
      items++;
      units += r.qty || 0;
      if (r.online) online++;
      if (r.qty != null && r.qty <= 0) out++; else if (r.qty != null && r.qty <= 2) low++;
      if (r.retailValue != null) retailVal += r.retailValue;
    });
    return { items, units, retailVal, online, low, out };
  // eslint-disable-next-line
  }, [overrides, ENTITIES]);

  const editedCount = ORDER.filter(itemEdited).length;

  // ── Bulk adjust (scoped by the current filters + an optional metal) ─────────
  const applyBulk = ({ action, pct, round, scope }) => {
    const targets = rows.filter((r) => matchesMetalScope(scope, r.material));
    const roundTo = (n) => (round === 5 ? Math.round(n / 5) * 5 : Math.round(n));
    targets.forEach((r) => {
      if (action === 'inc' || action === 'dec') {
        const factor = action === 'inc' ? 1 + pct / 100 : 1 - pct / 100;
        commit(r.key, { retail: Math.max(1, roundTo((r.retail || 0) * factor)) });
      } else if (action === 'sale') {
        const v = Math.max(1, roundTo((r.retail || 0) * (1 - pct / 100)));
        commit(r.key, { salePrice: r.retail && v < r.retail ? v : null });
      } else if (action === 'clearSale') {
        commit(r.key, { salePrice: null });
      }
    });
    setBulkOpen(false);
    const label = { inc: 'Raised', dec: 'Lowered', sale: 'Put on sale', clearSale: 'Cleared sale on' }[action];
    flash(`${label} ${targets.length} item${targets.length === 1 ? '' : 's'}`);
  };

  const exportData = (fmt) => {
    const data = rows.map((r) => ({
      key: r.key, type: r.kind, salesCode: r.salesCode, productionCode: r.productionCode,
      name: r.name, category: r.category, material: r.material, units: r.qty,
      unitCost: r.unitCost, retail: r.retail, salePrice: r.salePrice,
      marginPct: r.marginPct == null ? '' : r.marginPct.toFixed(1), status: r.stock,
      online: r.online ? 'yes' : 'no', images: r.images.length,
    }));
    let blob, fname;
    if (fmt === 'json') { blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); fname = 'malaya-inventory.json'; }
    else {
      const cols = ['key', 'type', 'salesCode', 'productionCode', 'name', 'category', 'material', 'units', 'unitCost', 'retail', 'salePrice', 'marginPct', 'status', 'online', 'images'];
      const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = [cols.join(',')].concat(data.map((row) => cols.map((c) => esc(row[c])).join(','))).join('\n');
      blob = new Blob([csv], { type: 'text/csv' }); fname = 'malaya-inventory.csv';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Exported ${fmt.toUpperCase()} · ${data.length} items`);
  };

  const editing = editKey ? resolve(editKey) : null;
  const anyFilter = search || fCat || fMat || fAvail || sort !== 'default';

  return (
    <div>
      <div style={{ padding: '22px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: T.serif, fontSize: 38, margin: 0, lineHeight: 1 }}>Inventory</h1>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, letterSpacing: '0.04em' }}>
              {rows.length} of {stats.items} items · <span style={{ color: stats.online ? T.good : T.muted }}>{stats.online} online</span>
              {editedCount > 0 && <> · <span style={{ color: T.accent }}>{editedCount} edited</span></>} · one list of every catalogue piece &amp; stock SKU
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setBulkOpen(true)} style={ghost()}>Bulk adjust…</button>
            <button onClick={() => exportData('csv')} style={ghost()}>Export CSV</button>
            <button onClick={() => exportData('json')} style={ghost()}>Export JSON</button>
            <button onClick={resetAll} disabled={!editedCount} style={ghost(!editedCount)}>Reset all</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: T.line2, border: `1px solid ${T.line2}` }}>
          <Stat label="Items" value={stats.items.toLocaleString('en-US')} sub="catalogue + stock" />
          <Stat label="Units on hand" value={stats.units.toLocaleString('en-US')} />
          <Stat label="Retail value" value={m0(stats.retailVal)} sub="stocked lines" />
          <Stat label="Online" value={stats.online.toLocaleString('en-US')} sub="live on storefront" accent />
          <Stat label="Low / sold out" value={`${stats.low} / ${stats.out}`} />
        </div>
      </div>

      <div style={{ padding: '16px 28px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 240 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1 }} />
        </div>
        <Pick value={fCat} onChange={setFCat} all="All categories" options={CATEGORIES} />
        <Pick value={fMat} onChange={setFMat} all="All materials" options={MATERIALS} />
        <Pick value={fAvail} onChange={setFAvail} all="All availability" options={[['online', 'Online'], ['offline', 'Offline'], ['onsale', 'On sale'], ['noimage', 'No image'], ['low', 'Low stock'], ['out', 'Sold out'], ['in', 'In stock'], ['nocost', 'Missing cost']]} pairs />
        <Pick value={sort} onChange={setSort} all="Sort: default order" options={[['name', 'Name A–Z'], ['price-desc', 'Highest price'], ['price-asc', 'Lowest price'], ['units', 'Fewest units'], ['units-desc', 'Most units'], ['margin', 'Highest margin'], ['value', 'Highest value']]} pairs />
        {anyFilter && <button onClick={() => { setSearch(''); setFCat(''); setFMat(''); setFAvail(''); setSort('default'); }} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>Clear</button>}
        {blankCount > 0 &&
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, cursor: 'pointer', letterSpacing: '0.04em', userSelect: 'none' }}>
            <input type="checkbox" checked={showBlank} onChange={(e) => setShowBlank(e.target.checked)} style={{ accentColor: T.accent }} />
            Show {blankCount} blank stock SKUs
          </label>}
      </div>

      <div style={{ padding: '16px 28px 80px' }}>
        <div style={{ border: `1px solid ${T.line}`, background: T.panel }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.card }}>
                {[['Item', 'left'], ['Material', 'left'], ['Units', 'right'], ['Cost', 'right'], ['Retail', 'right'], ['Sale', 'right'], ['Margin', 'right'], ['Status', 'left'], ['', 'right']].map(([h, al], i) => (
                  <th key={i} style={{ textAlign: al, padding: '11px 14px', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, borderBottom: `1px solid ${T.line2}`, position: 'sticky', top: 56, background: T.card, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <ItemRow key={r.key} r={r} edited={itemEdited(r.key)} fieldEdited={fieldEdited} commit={commit} onEdit={() => setEditKey(r.key)} />)}
              {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>No items match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <ItemDrawer r={editing} base={INVENTORY_BY_KEY[editKey].base} fieldEdited={fieldEdited} commit={commit} resetItem={resetItem} onClose={() => setEditKey(null)} />}
      {bulkOpen && <BulkModal rows={rows} onApply={applyBulk} onClose={() => setBulkOpen(false)} />}
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

function ItemRow({ r, edited, fieldEdited, commit, onEdit }) {
  const statusColor = { 'Sold out': T.danger, 'Archived': T.faint, 'Low stock': T.accent, 'Made to order': T.muted }[r.stock] || T.good;
  const lowQty = r.qty != null && r.qty <= 2;
  return (
    <tr style={{ borderBottom: `1px solid ${T.line}`, background: edited ? 'rgba(138,106,59,0.045)' : 'transparent' }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', position: 'relative' }}>
            {r.img ? <img src={r.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.serif, fontSize: 13, color: T.faint }}>{(r.productionCode || r.key).replace(/[^A-Za-z]/g, '').slice(0, 2) || '—'}</div>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.serif, fontSize: 15.5, lineHeight: 1.15, color: T.ink }}>{r.name || <span style={{ color: T.faint }}>Unnamed SKU</span>}</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><span style={{ color: T.muted }}>SKU</span> {r.salesCode || r.key}</span>
              {r.productionCode && <span><span style={{ color: T.muted }}>MODEL</span> {r.productionCode}</span>}
              <span style={{ color: r.online ? T.good : T.faint, letterSpacing: '0.06em' }}>{r.online ? '● online' : '○ offline'}</span>
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 14px' }}>
        <select value={MATERIALS.includes(r.material) ? r.material : ''} onChange={(e) => commit(r.key, { material: e.target.value })}
          style={{ background: 'transparent', border: `1px solid ${fieldEdited(r.key, 'material') ? T.accent : T.line}`, color: fieldEdited(r.key, 'material') ? T.accent : T.ink, fontSize: 12, padding: '5px 6px', fontFamily: T.sans, cursor: 'pointer', maxWidth: 116 }}>
          <option value="">{r.material || '—'}</option>
          {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}><NumCell value={r.qty} edited={fieldEdited(r.key, 'qty')} onCommit={(v) => commit(r.key, { qty: v })} width={46} placeholder="—" color={lowQty ? T.accent : T.ink} /></td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}><NumCell value={r.unitCost} edited={fieldEdited(r.key, 'unitCost')} onCommit={(v) => commit(r.key, { unitCost: v })} money placeholder="—" /></td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}><NumCell value={r.retail} edited={fieldEdited(r.key, 'retail')} onCommit={(v) => commit(r.key, { retail: v })} money placeholder="—" /></td>
      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
        <NumCell value={r.salePrice} edited={fieldEdited(r.key, 'salePrice')} onCommit={(v) => commit(r.key, { salePrice: v })} money placeholder="—" />
        {r.onSale && <div style={{ fontSize: 10, color: T.accent, marginTop: 2 }}>−{Math.round((1 - r.salePrice / r.retail) * 100)}%</div>}
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {r.marginPct == null ? <span style={{ color: T.faint }}>—</span> : <span style={{ color: r.marginPct < 40 ? T.danger : T.ink, fontWeight: 500 }}>{r.marginPct.toFixed(0)}%</span>}
        {r.marginUnit != null && <div style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{m2(r.marginUnit)}/ea</div>}
      </td>
      <td style={{ padding: '10px 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: statusColor, whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />{r.stock}
        </span>
      </td>
      <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <PublishPill on={r.online} onToggle={() => commit(r.key, { online: !r.online })} />
          <button onClick={onEdit} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Edit</button>
        </div>
      </td>
    </tr>
  );
}

function PublishPill({ on, onToggle }) {
  return (
    <button onClick={onToggle} title={on ? 'Online — click to take offline' : 'Offline — click to take online'}
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

// ─────────────────────────────────────────────────── BulkModal ────
function BulkModal({ rows, onApply, onClose }) {
  const [action, setAction] = useState('inc');
  const [pct, setPct] = useState(10);
  const [round, setRound] = useState(1);
  const [scope, setScope] = useState('');
  const needsPct = action !== 'clearSale';
  const count = rows.filter((r) => matchesMetalScope(scope, r.material)).length;
  const scopeLabel = (METAL_SCOPES.find((s) => s.value === scope) || {}).label || 'All metals';
  const where = scope ? `the ${count} shown ${scopeLabel} item${count === 1 ? '' : 's'}` : `all ${count} shown item${count === 1 ? '' : 's'}`;
  const desc = {
    inc: `Raise the retail price of ${where} by ${pct}%.`,
    dec: `Lower the retail price of ${where} by ${pct}%.`,
    sale: `Put ${where} on sale at ${pct}% off their retail price.`,
    clearSale: `Remove the sale price from ${where}.`,
  }[action];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 24 }}>Bulk adjust</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>Adjust prices across the items currently shown — everything, or just one metal.</div>
        </div>
        <div style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 10 }}>Action</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[['inc', 'Raise retail'], ['dec', 'Lower retail'], ['sale', 'Put on sale'], ['clearSale', 'Clear sale']].map(([k, lbl]) => (
              <button key={k} onClick={() => setAction(k)} style={{ padding: '11px 10px', fontSize: 12, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${action === k ? T.accent : T.line2}`, background: action === k ? 'rgba(138,106,59,0.1)' : T.card, color: action === k ? T.accent : T.ink }}>{lbl}</button>
            ))}
          </div>

          <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 8 }}>Metal</div>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: '100%', background: T.card, border: `1px solid ${scope ? T.accent : T.line2}`, color: scope ? T.accent : T.ink, fontSize: 13, padding: '11px 12px', fontFamily: T.sans, cursor: 'pointer', marginBottom: 20 }}>
            {METAL_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.group ? `${s.label}` : (s.value.startsWith('mat:') ? `  ${s.label}` : s.label)}</option>)}
          </select>

          {needsPct && (
            <div style={{ display: 'flex', gap: 18, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 8 }}>Percent</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${T.line2}`, background: T.card }}>
                  <input type="number" min="0" value={pct} onChange={(e) => setPct(Math.max(0, Number(e.target.value)))} style={{ width: 64, textAlign: 'right', background: 'transparent', border: 'none', color: T.ink, fontSize: 16, padding: '9px 8px', outline: 'none', fontFamily: T.sans }} />
                  <span style={{ padding: '0 12px 0 4px', color: T.muted, fontSize: 15 }}>%</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.muted, marginBottom: 8 }}>Round to</div>
                <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}` }}>
                  {[[1, '$1'], [5, '$5']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setRound(k)} style={{ padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontFamily: T.sans, border: 'none', background: round === k ? T.ink : T.card, color: round === k ? T.panel : T.ink }}>{lbl}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, background: T.card, border: `1px solid ${T.line}`, padding: '12px 14px' }}>{desc}</div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <button onClick={() => onApply({ action, pct, round, scope })} disabled={!count} style={{ background: T.ink, color: T.panel, border: 'none', padding: '12px 26px', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: count ? 'pointer' : 'not-allowed', opacity: count ? 1 : 0.4, fontFamily: T.sans }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── ItemDrawer ────
function ItemDrawer({ r, base, fieldEdited, commit, resetItem, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '92vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.img ? <img src={r.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
                : <span style={{ fontFamily: T.serif, fontSize: 16, color: T.faint }}>{(r.productionCode || r.key).slice(0, 3)}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.serif, fontSize: 21, lineHeight: 1.12 }}>{r.name || 'Unnamed SKU'}</div>
              <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 4 }}>{r.salesCode || r.key} · {r.kind === 'catalogue' ? 'catalogue item' : 'stock SKU'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          <div style={{ marginBottom: 20, padding: '14px 16px', background: r.online ? 'rgba(91,110,74,0.10)' : T.card, border: `1px solid ${r.online ? T.good : T.line2}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: r.online ? T.good : T.muted }}>Storefront</div>
                <div style={{ fontFamily: T.serif, fontSize: 21, color: T.ink, marginTop: 2 }}>{r.online ? 'Online' : 'Offline'}</div>
              </div>
              <Switch on={r.online} onChange={(v) => commit(r.key, { online: v })} />
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6, marginTop: 10 }}>
              {r.online
                ? <>Live on the storefront. <a href={`/product/${encodeURIComponent(r.key)}`} target="_blank" rel="noreferrer" style={{ color: T.accent }}>View on site →</a></>
                : (r.kind === 'catalogue' ? 'Offline (archived) — switch on to list it on the live storefront again.' : 'Publish to list this stock line on the live storefront. You can publish now and add images later.')}
            </div>
          </div>

          <DField label="Item name" value={r.name} edited={fieldEdited(r.key, 'name')} base={base.name} onCommit={(v) => commit(r.key, { name: v })} onRevert={() => commit(r.key, { name: base.name })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DField label="Sales code (SKU)" value={r.salesCode} edited={fieldEdited(r.key, 'salesCode')} base={base.salesCode} onCommit={(v) => commit(r.key, { salesCode: v })} onRevert={() => commit(r.key, { salesCode: base.salesCode })} />
            <DField label="Production code" value={r.productionCode} edited={fieldEdited(r.key, 'productionCode')} base={base.productionCode} onCommit={(v) => commit(r.key, { productionCode: v })} onRevert={() => commit(r.key, { productionCode: base.productionCode })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DSel label="Category" value={r.category} options={CATEGORIES} edited={fieldEdited(r.key, 'category')} base={base.category} onCommit={(v) => commit(r.key, { category: v })} onRevert={() => commit(r.key, { category: base.category })} />
            <DSel label="Material" value={r.material} options={MATERIALS} edited={fieldEdited(r.key, 'material')} base={base.material} onCommit={(v) => commit(r.key, { material: v })} onRevert={() => commit(r.key, { material: base.material })} />
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Inventory</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <DNum label="Units on hand" value={r.qty} placeholder="—" edited={fieldEdited(r.key, 'qty')} base={base.qty} onCommit={(v) => commit(r.key, { qty: v })} onRevert={() => commit(r.key, { qty: base.qty })} />
              <DSel label="Status" value={r.stock} options={STOCK_OPTIONS} edited={fieldEdited(r.key, 'stock')} base={base.stock} onCommit={(v) => commit(r.key, { stock: v })} onRevert={() => commit(r.key, { stock: base.stock })} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Pricing &amp; margin</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <DNum label="Unit cost" money value={r.unitCost} placeholder="—" edited={fieldEdited(r.key, 'unitCost')} base={base.unitCost} onCommit={(v) => commit(r.key, { unitCost: v })} onRevert={() => commit(r.key, { unitCost: base.unitCost })} />
              <DNum label="Retail" money value={r.retail} placeholder="—" edited={fieldEdited(r.key, 'retail')} base={base.retail} onCommit={(v) => commit(r.key, { retail: v })} onRevert={() => commit(r.key, { retail: base.retail })} />
              <DNum label="Sale price" money value={r.salePrice} placeholder="—" edited={fieldEdited(r.key, 'salePrice')} base={base.salePrice} onCommit={(v) => commit(r.key, { salePrice: v })} onRevert={() => commit(r.key, { salePrice: null })} />
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Readout label="Gross margin" value={r.marginPct == null ? '—' : r.marginPct.toFixed(1) + '%'} sub={r.marginUnit == null ? 'cost unknown' : m2(r.marginUnit) + ' / unit'} />
              <Readout label="Markup" value={r.markupPct == null ? '—' : r.markupPct.toFixed(0) + '%'} sub={r.markupPct == null ? 'cost unknown' : 'over unit cost'} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Story</div>
            <DTextArea value={r.story} edited={fieldEdited(r.key, 'story')} onCommit={(v) => commit(r.key, { story: v })} onRevert={() => commit(r.key, { story: '' })}
              placeholder="Tell this piece's story — materials, symbolism, craft. Shown on the product page (blank lines start a new paragraph)." />
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent }}>Images</div>
              <div style={{ fontSize: 10, color: T.faint }}>{r.images.length} photo{r.images.length === 1 ? '' : 's'} · gallery</div>
            </div>
            <Gallery sku={r.key} images={r.images} onChange={(arr) => commit(r.key, { images: arr.length ? arr : null, img: arr[0] || null })} />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button onClick={() => resetItem(r.key)} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Reset to original</button>
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
  return <DShell label={label} edited={edited} base={base} onRevert={onRevert}><select value={options.includes(value) ? value : ''} onChange={(e) => onCommit(e.target.value)} style={{ ...dFieldStyle(edited), cursor: 'pointer' }}>{!options.includes(value) && <option value="">{value || '—'}</option>}{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></DShell>;
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

function Switch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} role="switch" aria-checked={on} title={on ? 'Online' : 'Offline'}
      style={{ position: 'relative', width: 52, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? T.good : T.line2, transition: 'background .15s', flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}

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

function Pick({ value, onChange, all, options, pairs }) {
  const isSort = all.startsWith('Sort');
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: T.card, border: `1px solid ${value && value !== 'default' ? T.accent : T.line2}`, color: value && value !== 'default' ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em' }}>
      <option value={isSort ? 'default' : ''}>{all}</option>
      {options.map((o) => pairs ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
