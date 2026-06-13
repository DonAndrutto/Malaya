'use client';

import { useState, useMemo, useEffect } from 'react';
import { T } from './theme';
import { PRODUCTS, COLLECTIONS, CATEGORIES, MATERIALS, STOCK_OPTIONS, fmtPrice } from '@/lib/data/products';
import { saveOverrides } from '@/lib/overrides';

const ME_FIELDS = ['salesCode', 'productionCode', 'name', 'sub', 'category', 'collection', 'material', 'stock', 'listPrice', 'salePrice'];
const mono = '"SFMono-Regular", ui-monospace, "Menlo", monospace';

function meNum(v) { const n = Number(v); return isNaN(n) ? null : n; }
function meMoney(n) { return fmtPrice(Math.round(Number(n) || 0)); }

function meGhost(disabled) {
  return { background: 'transparent', border: `1px solid ${T.line2}`, color: disabled ? T.faint : T.ink, padding: '9px 14px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1 };
}

const COLUMNS = [
  { key: 'salesCode',      label: 'Sales code',      type: 'text',   w: 158, mono: true },
  { key: 'productionCode', label: 'Production code', type: 'text',   w: 138, mono: true },
  { key: 'name',           label: 'Name',            type: 'text',   w: 240, serif: true },
  { key: 'sub',            label: 'Subtitle',        type: 'text',   w: 210 },
  { key: 'category',       label: 'Category',        type: 'select', w: 138, opts: () => CATEGORIES },
  { key: 'collection',     label: 'Collection',      type: 'select', w: 178, opts: () => COLLECTIONS },
  { key: 'material',       label: 'Material',        type: 'select', w: 138, opts: () => MATERIALS },
  { key: 'stock',          label: 'Stock',           type: 'select', w: 150, opts: () => STOCK_OPTIONS },
  { key: 'listPrice',      label: 'List price',      type: 'money',  w: 116, align: 'right' },
  { key: 'salePrice',      label: 'Sale price',      type: 'money',  w: 116, align: 'right', placeholder: '—' },
];

export default function MassEdit({ overrides, setOverrides, editDrawer: EditDrawer }) {
  const BASE = useMemo(() => {
    const m = {};
    PRODUCTS.forEach((p) => { m[p.id] = { ...p.base, code: p.code, img: p.img, hue: p.hue }; });
    return m;
  }, []);
  const ORDER = useMemo(() => PRODUCTS.map((p) => p.id), []);

  const [search, setSearch] = useState('');
  const [fCol, setFCol] = useState('');
  const [fCat, setFCat] = useState('');
  const [fMat, setFMat] = useState('');
  const [onlyEdited, setOnlyEdited] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState('');
  const flash = (msg) => setToast(msg);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast]);

  const val = (id, f) => { const o = overrides[id] || {}; return (f in o) ? o[f] : BASE[id][f]; };
  const resolve = (id) => {
    const b = BASE[id], o = overrides[id] || {};
    const listPrice = Number((('listPrice' in o) ? o.listPrice : b.listPrice)) || b.listPrice;
    const rawSale = ('salePrice' in o) ? o.salePrice : b.salePrice;
    const salePrice = (rawSale === null || rawSale === undefined || rawSale === '') ? null : Number(rawSale);
    const onSale = salePrice != null && !isNaN(salePrice) && salePrice > 0 && salePrice < listPrice;
    return {
      id, code: val(id, 'salesCode'), img: b.img, hue: b.hue,
      salesCode: val(id, 'salesCode'), productionCode: val(id, 'productionCode'),
      name: val(id, 'name'), sub: val(id, 'sub'), category: val(id, 'category'),
      collection: val(id, 'collection'), material: val(id, 'material'), stock: val(id, 'stock'),
      listPrice, salePrice, onSale, price: onSale ? salePrice : listPrice,
    };
  };
  const itemEdited = (id) => { const o = overrides[id]; if (!o) return false; return ME_FIELDS.some((f) => f in o && o[f] !== BASE[id][f]); };
  const fieldEdited = (id, f) => { const o = overrides[id]; return !!(o && f in o && o[f] !== BASE[id][f]); };
  const editedCount = ORDER.filter(itemEdited).length;

  const commit = (id, patch) => {
    setOverrides((prev) => {
      const next = { ...prev };
      const o = { ...(next[id] || {}) };
      Object.keys(patch).forEach((f) => {
        let v = patch[f];
        if (f === 'listPrice') v = meNum(v);
        if (f === 'salePrice') v = (v === '' || v === null || v === undefined) ? null : meNum(v);
        if (typeof v === 'string') v = v.trim();
        const baseV = BASE[id][f];
        const same = (f === 'salePrice') ? ((v == null) === (baseV == null) && Number(v) === Number(baseV)) : (v === baseV);
        if (same || (f === 'listPrice' && v == null)) delete o[f]; else o[f] = v;
      });
      if (Object.keys(o).length === 0) delete next[id]; else next[id] = o;
      saveOverrides(next);
      return next;
    });
  };
  const resetItem = (id) => { setOverrides((prev) => { const n = { ...prev }; delete n[id]; saveOverrides(n); return n; }); flash('Item reset to original'); };
  const resetAll = () => {
    if (!confirm('Reset every item back to its original studio values? This clears all manual edits across the catalogue.')) return;
    setOverrides(() => { saveOverrides({}); return {}; }); flash('All edits cleared');
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ORDER.map(resolve).filter((r) => {
      if (fCol && r.collection !== fCol) return false;
      if (fCat && r.category !== fCat) return false;
      if (fMat && r.material !== fMat) return false;
      if (onlyEdited && !itemEdited(r.id)) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q) || (r.salesCode || '').toLowerCase().includes(q) || (r.productionCode || '').toLowerCase().includes(q) || r.id.includes(q))) return false;
      return true;
    });
  // eslint-disable-next-line
  }, [overrides, search, fCol, fCat, fMat, onlyEdited]);

  const exportData = (fmt) => {
    const data = ORDER.map((id) => { const r = resolve(id), b = BASE[id]; return { id, salesCode: r.salesCode, productionCode: r.productionCode, name: r.name, sub: r.sub, category: r.category, collection: r.collection, material: r.material, stock: r.stock, listPrice: r.listPrice, salePrice: r.salePrice, effectivePrice: r.price, originalListPrice: b.listPrice, edited: itemEdited(id) }; });
    let blob, fname;
    if (fmt === 'json') { blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); fname = 'malaya-catalogue-items.json'; }
    else {
      const cols = ['id', 'salesCode', 'productionCode', 'name', 'sub', 'category', 'collection', 'material', 'stock', 'listPrice', 'salePrice', 'effectivePrice', 'originalListPrice', 'edited'];
      const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = [cols.join(',')].concat(data.map((row) => cols.map((c) => esc(row[c])).join(','))).join('\n');
      blob = new Blob([csv], { type: 'text/csv' }); fname = 'malaya-catalogue-items.csv';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Exported ${fmt.toUpperCase()} · ${data.length} items`);
  };

  const editing = editId ? resolve(editId) : null;
  const totalW = 250 + COLUMNS.reduce((s, c) => s + c.w, 0) + 96;

  return (
    <div style={{ background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <div style={{ padding: '22px 28px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: T.serif, fontSize: 38, margin: 0, lineHeight: 1 }}>Mass edit</h1>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, letterSpacing: '0.04em', maxWidth: 720, lineHeight: 1.6 }}>
              Every field of every catalogue item on one page — fix codes, names and prices in place. Edits save instantly and flow to the live catalogue. {rows.length} of {ORDER.length} shown · <span style={{ color: editedCount ? T.accent : T.muted }}>{editedCount} edited</span>.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => exportData('csv')} style={meGhost()}>Export CSV</button>
            <button onClick={() => exportData('json')} style={meGhost()}>Export JSON</button>
            <button onClick={resetAll} disabled={!editedCount} style={meGhost(!editedCount)}>Reset all</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 240 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1 }} />
          </div>
          <MePick value={fCol} onChange={setFCol} all="All collections" options={COLLECTIONS} />
          <MePick value={fCat} onChange={setFCat} all="All categories" options={CATEGORIES} />
          <MePick value={fMat} onChange={setFMat} all="All materials" options={MATERIALS} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, cursor: 'pointer', letterSpacing: '0.04em', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} style={{ accentColor: T.accent }} />
            Edited only
          </label>
          {(search || fCol || fCat || fMat || onlyEdited) &&
            <button onClick={() => { setSearch(''); setFCol(''); setFCat(''); setFMat(''); setOnlyEdited(false); }} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>Clear</button>}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.faint, letterSpacing: '0.04em' }}>Tab to move across · Enter to commit a cell</span>
        </div>
      </div>

      <div style={{ padding: '16px 28px 40px' }}>
        <div style={{ border: `1px solid ${T.line2}`, background: T.panel, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, minWidth: totalW, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '11px 14px', width: 250, minWidth: 250, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, position: 'sticky', top: 0, left: 0, zIndex: 5, background: T.card, borderBottom: `1px solid ${T.line2}`, borderRight: `1px solid ${T.line2}` }}>Item</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={{ textAlign: c.align || 'left', padding: '11px 14px', width: c.w, minWidth: c.w, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.muted, fontWeight: 600, position: 'sticky', top: 0, zIndex: 4, background: T.card, borderBottom: `1px solid ${T.line2}`, whiteSpace: 'nowrap' }}>{c.label}</th>
                ))}
                <th style={{ textAlign: 'right', padding: '11px 14px', width: 96, minWidth: 96, position: 'sticky', top: 0, zIndex: 4, background: T.card, borderBottom: `1px solid ${T.line2}` }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <MeRow key={r.id} r={r} edited={itemEdited(r.id)} fieldEdited={fieldEdited} commit={commit} resetItem={resetItem} onEdit={() => setEditId(r.id)} />)}
              {rows.length === 0 && <tr><td colSpan={COLUMNS.length + 2} style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20 }}>No items match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && EditDrawer &&
        <EditDrawer r={editing} base={BASE[editId]} fieldEdited={fieldEdited} commit={commit} resetItem={resetItem} onClose={() => setEditId(null)} />}
      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>}
    </div>
  );
}

function MeRow({ r, edited, fieldEdited, commit, resetItem, onEdit }) {
  const stickyBg = edited ? '#f3ead9' : T.panel;
  return (
    <tr style={{ background: edited ? 'rgba(138,106,59,0.10)' : 'transparent' }}>
      <td style={{ padding: '8px 14px', position: 'sticky', left: 0, zIndex: 2, background: stickyBg, borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line2}`, width: 250, minWidth: 250 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 40, height: 40, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', position: 'relative' }}>
            <img src={r.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
            {edited && <span title="Edited" style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: T.accent, boxShadow: '0 0 0 1.5px #fff' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.serif, fontSize: 15, lineHeight: 1.15, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 168 }}>{r.name || '—'}</div>
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 2, fontFamily: mono }}>{r.id.toUpperCase()}</div>
          </div>
        </div>
      </td>
      {COLUMNS.map((c) => (
        <td key={c.key} style={{ padding: 0, borderBottom: `1px solid ${T.line}`, width: c.w, minWidth: c.w, verticalAlign: 'middle' }}>
          <MeCell col={c} value={r[c.key]} edited={fieldEdited(r.id, c.key)} onCommit={(v) => commit(r.id, { [c.key]: v })}
            sale={c.key === 'salePrice' ? { onSale: r.onSale, listPrice: r.listPrice, salePrice: r.salePrice } : null} />
        </td>
      ))}
      <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', width: 96, minWidth: 96 }}>
        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {edited && <button onClick={() => resetItem(r.id)} title="Reset this item to original" style={{ background: 'transparent', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>↺</button>}
          <button onClick={onEdit} title="Open full editor" style={{ ...meGhost(), padding: '6px 11px', fontSize: 10 }}>Edit</button>
        </div>
      </td>
    </tr>
  );
}

function MeCell({ col, value, edited, onCommit, sale }) {
  const isMoney = col.type === 'money';
  const isSelect = col.type === 'select';
  const [v, setV] = useState(value == null ? '' : String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);

  const cellBg = edited ? 'rgba(138,106,59,0.07)' : (focus ? 'rgba(138,106,59,0.06)' : 'transparent');
  const textColor = edited ? T.accent : T.ink;
  const padX = isMoney ? 14 : 12;

  if (isSelect) {
    return (
      <select value={value} onChange={(e) => onCommit(e.target.value)} title={edited ? 'Edited' : undefined}
        style={{ width: '100%', height: 44, background: cellBg, border: 'none', outline: 'none', color: textColor, fontWeight: edited ? 600 : 400, fontSize: 13, fontFamily: T.sans, padding: `0 ${padX}px`, cursor: 'pointer', appearance: 'none', boxShadow: edited ? `inset 3px 0 0 ${T.accent}` : 'none' }}
        onFocus={(e) => { e.target.style.background = 'rgba(138,106,59,0.06)'; }}
        onBlur={(e) => { e.target.style.background = cellBg; }}>
        {(typeof col.opts === 'function' ? col.opts() : col.opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
        {value != null && value !== '' && !(typeof col.opts === 'function' ? col.opts() : col.opts || []).includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }

  const commit = () => { const t = v.trim(); onCommit(isMoney ? (t === '' ? null : t) : v); };
  const off = sale && sale.onSale ? Math.round((1 - sale.salePrice / sale.listPrice) * 100) : 0;

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 44, background: cellBg, boxShadow: edited ? `inset 3px 0 0 ${T.accent}` : 'none' }}>
      {isMoney && <span style={{ color: edited ? T.accent : T.faint, fontSize: 13, paddingLeft: padX }}>$</span>}
      <input value={v} placeholder={col.placeholder || (isMoney ? '0' : '')} inputMode={isMoney ? 'decimal' : undefined}
        onChange={(e) => setV(isMoney ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); commit(); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setV(value == null ? '' : String(value)); e.target.blur(); } }}
        style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', color: textColor, fontWeight: edited ? 600 : 400, fontSize: col.serif ? 14 : 13, fontFamily: col.mono ? mono : (col.serif ? T.serif : T.sans), padding: `0 ${padX}px`, paddingLeft: isMoney ? 3 : padX, textAlign: col.align || 'left', letterSpacing: col.mono ? '0.02em' : 'normal' }} />
      {sale && sale.onSale && <span style={{ position: 'absolute', right: 6, bottom: 3, fontSize: 9, color: T.accent, letterSpacing: '0.04em', pointerEvents: 'none' }}>−{off}%</span>}
    </div>
  );
}

function MePick({ value, onChange, all, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: T.card, border: `1px solid ${value ? T.accent : T.line2}`, color: value ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em' }}>
      <option value="">{all}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
