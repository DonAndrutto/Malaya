'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Inventory — the single, unified desk for every item the studio sells. It now
// replaces the legacy "Mass edit" tab too: the full catalogue, every stock SKU,
// the live-site extras and any studio-created item live in one sortable, inline-
// editable, mobile-friendly list (see lib/data/inventory.js for the merge).
//
// Every row edits the same override layer the live storefront reads, so changes
// flow straight to the site:
//   • catalogue / extra / custom items save under their id (the catalogue override)
//   • ledger-only items save under their SKU (and publish takes them online)
//   • a catalogue listing also reads photos/story uploaded under a linked SKU
//     (legacy uploads), so they finally show here as well as on the site.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react';
import { T } from './theme';
import { CATEGORIES, MATERIALS, STOCK_OPTIONS } from '@/lib/data/products';
import { SPECIALS, SPECIAL_KEYS, resolveSpecials, normalizeMaterial } from '@/lib/data/materials';
import { stockStatus } from '@/lib/data/stock-data';
import { resolveProduct } from '@/lib/data/resolve';
import {
  INVENTORY, INVENTORY_BY_KEY, isBlankEntity,
  METAL_SCOPES, matchesMetalScope, dupKey, pickMaster,
  customEntities, customEntity, isCustomOverride, newCustomKey,
} from '@/lib/data/inventory';
import { saveOverrides } from '@/lib/overrides';
import { subscribeExploreAdmin } from '@/lib/explore';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';

function m0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
function m2(n) { if (n == null || n === '' || isNaN(Number(n))) return '—'; return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function numOrNull(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
function sameArr(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }

function ghost(disabled) {
  return { background: 'transparent', border: `1px solid ${T.line2}`, color: disabled ? T.faint : T.ink, padding: '9px 14px', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: disabled ? 0.5 : 1 };
}

// Override field name for a generic field, per entity kind (the catalogue stores
// its list price under `listPrice`; the ledger under `retail`).
const ovField = (kind, g) => (kind !== 'ledger' && g === 'retail' ? 'listPrice' : g);
const NUMERIC = ['retail', 'salePrice', 'qty', 'unitCost'];
const STOCK_RANK = Object.fromEntries(STOCK_OPTIONS.map((s, i) => [s, i]));

export default function Inventory({ overrides, setOverrides }) {
  const customs = useMemo(() => customEntities(overrides), [overrides]);
  const ENTITIES = useMemo(() => [...INVENTORY, ...customs], [customs]);
  const ENTITY_BY_KEY = useMemo(() => {
    const m = { ...INVENTORY_BY_KEY };
    customs.forEach((e) => { m[e.key] = e; });
    return m;
  }, [customs]);
  const ORDER = useMemo(() => ENTITIES.map((e) => e.key), [ENTITIES]);
  const entityFor = (key, src) => ENTITY_BY_KEY[key] || (isCustomOverride((src || overrides)[key]) ? customEntity(key) : null);

  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fMat, setFMat] = useState('');
  const [fAvail, setFAvail] = useState('');
  const [fSpecial, setFSpecial] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [showBlank, setShowBlank] = useState(false);
  const [showMerged, setShowMerged] = useState(false);
  const [editKey, setEditKey] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mergeKey, setMergeKey] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m) => setToast(m);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t); }, [toast]);

  // Explore knowledge topics — the drawer's "Symbolism" checklist links items
  // to topics (writes the `topics` field on this item's override).
  const [exploreTopics, setExploreTopics] = useState({});
  useEffect(() => subscribeExploreAdmin(({ topics }) => setExploreTopics(topics)), []);

  // Honour /admin?edit=<id> deep-links ("Edit in admin" from a product page):
  // open that item's editor once it resolves, then strip the param so a refresh
  // or closing the drawer doesn't reopen it.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || typeof window === 'undefined') return;
    const key = new URLSearchParams(window.location.search).get('edit');
    if (!key) { deepLinkDone.current = true; return; }
    if (ENTITY_BY_KEY[key] || isCustomOverride(overrides[key])) {
      deepLinkDone.current = true;
      setEditKey(key);
      const url = new URL(window.location.href);
      url.searchParams.delete('edit');
      window.history.replaceState({}, '', url);
    }
  }, [ENTITY_BY_KEY, overrides]);

  const blankCount = useMemo(() => ENTITIES.filter(isBlankEntity).length, [ENTITIES]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  // ── Resolve an entity (base + its override) into a display record ───────────
  const resolve = (key) => {
    const e = ENTITY_BY_KEY[key];
    const b = e.base;
    const own = overrides[key] || {};
    // Read photos/story uploaded under a linked stock SKU so legacy uploads show
    // here (and editing then writes them to the canonical id).
    let o = own;
    if (e.linkedSku && overrides[e.linkedSku]) {
      const lo = overrides[e.linkedSku];
      o = { ...own };
      ['images', 'img', 'story'].forEach((f) => { if (!(f in o) && f in lo) o[f] = lo[f]; });
    }
    let name, sub, category, collection, material, salesCode, productionCode, stock, retail, salePrice, onSale, images, img, story, specials, topics;

    if (e.kind !== 'ledger') {
      const rp = resolveProduct({ ...b, id: e.key, listPrice: b.retail, salePrice: b.salePrice, tag: b.tag || null }, o);
      name = rp.name; sub = rp.sub; category = rp.category; collection = rp.collection; material = rp.material;
      salesCode = rp.salesCode; productionCode = rp.productionCode; stock = rp.stock;
      retail = rp.listPrice; salePrice = rp.salePrice; onSale = rp.onSale; images = rp.images; img = rp.img; story = rp.story;
      specials = rp.specials; topics = rp.topics;
    } else {
      const val = (f) => (f in o ? o[f] : b[f]);
      name = val('name'); sub = val('sub'); category = val('category'); collection = b.collection; material = normalizeMaterial(val('material'));
      salesCode = val('salesCode'); productionCode = val('productionCode');
      retail = numOrNull(val('retail')); salePrice = numOrNull(val('salePrice'));
      onSale = salePrice != null && retail != null && salePrice > 0 && salePrice < retail;
      stock = 'stock' in o ? o.stock : stockStatus(numOrNull(val('qty')));
      images = Array.isArray(o.images) && o.images.length ? o.images : (o.img ? [o.img] : (b.images || []));
      img = images[0] || b.img || null;
      story = 'story' in o && o.story != null ? o.story : '';
      specials = resolveSpecials(null, o);
      topics = Array.isArray(o.topics) ? o.topics : [];
    }

    const qty = numOrNull('qty' in o ? o.qty : b.qty);
    const unitCost = numOrNull('unitCost' in o ? o.unitCost : b.unitCost);
    const sellRetail = onSale ? salePrice : retail;
    const online = e.kind !== 'ledger' ? stock !== 'Archived' : o.published === true;
    const marginPct = unitCost != null && sellRetail ? (1 - unitCost / sellRetail) * 100 : null;
    const markupPct = unitCost != null && unitCost > 0 && sellRetail != null ? (sellRetail / unitCost - 1) * 100 : null;
    return {
      key, kind: e.kind, custom: !!e.custom, sku: e.sku, productId: e.kind !== 'ledger' ? e.key : null,
      mergedInto: own.mergedInto || null, deleted: !!own.deleted,
      name, sub, category, collection, material, salesCode, productionCode,
      qty, unitCost, retail, salePrice, onSale, sellRetail, stock, online,
      specials, tashi: specials.includes('tashi'), topics: topics || [],
      marginUnit: unitCost != null && sellRetail != null ? sellRetail - unitCost : null,
      marginPct, markupPct,
      costValue: unitCost != null && qty != null ? unitCost * qty : null,
      retailValue: retail != null && qty != null ? retail * qty : null,
      images, img, story,
    };
  };

  const itemEdited = (key) => { const o = overrides[key]; return !!(o && Object.keys(o).filter((k) => k !== '_custom').length); };
  const fieldEdited = (key, g) => {
    const e = entityFor(key); const o = overrides[key]; if (!e || !o) return false;
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
      const e = entityFor(key, prev) || customEntity(key);
      const next = { ...prev };
      const o = { ...(next[key] || {}) };
      const p = { ...patch };

      // Unified online/offline control maps onto each kind's mechanism.
      if ('online' in p) {
        if (e.kind !== 'ledger') p.stock = p.online ? e.base.stock : 'Archived';
        else o.published = p.online === true;
        delete p.online;
      }
      // Merge alias (set from the "Merge into…" picker; reversible).
      if ('mergedInto' in p) { if (p.mergedInto) o.mergedInto = p.mergedInto; else delete o.mergedInto; delete p.mergedInto; }
      // Soft-delete flag (static items); custom items are removed outright elsewhere.
      if ('deleted' in p) { if (p.deleted) o.deleted = true; else delete o.deleted; delete p.deleted; }
      // Special attributes (Sale / Tashi Mannox / New).
      if ('specials' in p) {
        const arr = (Array.isArray(p.specials) ? p.specials : []).filter((k) => SPECIAL_KEYS.includes(k));
        const baseArr = resolveSpecials(e.base.tag, null);
        if (sameArr(arr, baseArr)) delete o.specials; else o.specials = arr;
        delete p.specials;
      }
      // Explore knowledge-topic links (the "Symbolism" checklist).
      if ('topics' in p) {
        const arr = (Array.isArray(p.topics) ? p.topics : []).filter(Boolean).slice(0, 20);
        if (arr.length) o.topics = arr; else delete o.topics;
        delete p.topics;
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
        if ((same && !e.custom) || dropNullPrice) delete o[f]; else o[f] = v;
      });

      if (e.kind === 'ledger' && o.published !== true) delete o.published;
      if (e.custom) o._custom = true; // a custom item's doc always carries its marker

      if (Object.keys(o).length === 0) delete next[key]; else next[key] = o;
      saveOverrides(next);
      return next;
    });
  };

  const toggleSpecial = (key, sk, current) => {
    const set = new Set(current || []);
    if (set.has(sk)) set.delete(sk); else set.add(sk);
    commit(key, { specials: SPECIAL_KEYS.filter((k) => set.has(k)) });
  };

  const resetItem = (key) => {
    setOverrides((prev) => { const n = { ...prev }; delete n[key]; saveOverrides(n); return n; });
    flash('Item reset to original');
  };
  const resetAll = () => {
    if (!confirm('Reset every item back to its original studio values? This clears all manual edits (studio-created items are kept).')) return;
    setOverrides((prev) => {
      const next = {};
      Object.keys(prev).forEach((k) => { if (isCustomOverride(prev[k])) next[k] = prev[k]; });
      saveOverrides(next);
      return next;
    });
    flash('All edits cleared');
  };

  // ── CRUD: add a brand-new item / permanently delete an item ────────────────
  const addItem = () => {
    const key = newCustomKey();
    setOverrides((prev) => {
      const next = { ...prev, [key]: { _custom: true, name: '', category: 'Pendants', material: 'Silver 925', stock: 'In stock' } };
      saveOverrides(next);
      return next;
    });
    setEditKey(key);
    flash('New item — add its details, photo and price');
  };
  const deleteItem = (key) => {
    const e = entityFor(key);
    const custom = e && e.custom;
    const label = displayName(key);
    if (!confirm(custom
      ? `Permanently delete “${label}”? This removes the item completely.`
      : `Delete “${label}”? It will be removed from the storefront and the inventory list. You can restore it later via the “Deleted” filter.`)) return;
    if (custom) setOverrides((prev) => { const n = { ...prev }; delete n[key]; saveOverrides(n); return n; });
    else commit(key, { deleted: true });
    setEditKey(null);
    flash('Item deleted');
  };
  const restoreItem = (key) => { commit(key, { deleted: false }); flash('Item restored'); };

  // ── Merge / de-duplicate ───────────────────────────────────────────────────
  const displayName = (key) => { const e = entityFor(key); if (!e) return key; const o = overrides[key] || {}; return (o.name != null && o.name !== '' ? o.name : e.base.name) || key; };
  const mergeInto = (dupK, masterK) => {
    if (!masterK || masterK === dupK) return;
    commit(dupK, { mergedInto: masterK });
    const master = resolve(masterK), dup = resolve(dupK);
    if ((!master.images || !master.images.length) && dup.img) commit(masterK, { images: [dup.img], img: dup.img });
    setMergeKey(null);
    flash('Merged into ' + displayName(masterK));
  };
  const unmerge = (key) => { commit(key, { mergedInto: null }); flash('Un-merged'); };

  // Active (non-merged, non-blank, non-deleted) items — for merge picker & suggestions.
  const activeItems = useMemo(() => ORDER.map(resolve).filter((r) => !r.mergedInto && !r.deleted && !isBlankEntity(ENTITY_BY_KEY[r.key])), [overrides, ORDER]); // eslint-disable-line
  const mergedCount = useMemo(() => ORDER.filter((k) => (overrides[k] || {}).mergedInto).length, [overrides, ORDER]);
  const deletedCount = useMemo(() => ORDER.filter((k) => (overrides[k] || {}).deleted).length, [overrides, ORDER]);
  const dupGroups = useMemo(() => {
    const m = {};
    activeItems.forEach((r) => { const k = dupKey(r); (m[k] = m[k] || []).push(r); });
    return Object.values(m).filter((g) => g.length > 1).map((g) => ({ items: g, master: pickMaster(g) }));
  }, [activeItems]);

  // ── Filtering / sorting ────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = ORDER.map(resolve).filter((r) => {
      const e = ENTITY_BY_KEY[r.key];
      if (fAvail === 'deleted') { if (!r.deleted) return false; } else if (r.deleted) return false;
      if (!showBlank && isBlankEntity(e)) return false;
      if (!showMerged && r.mergedInto) return false;
      if (fCat && r.category !== fCat) return false;
      if (fMat && r.material !== fMat) return false;
      if (fSpecial && !r.specials.includes(fSpecial)) return false;
      if (fAvail === 'out' && !(r.qty != null && r.qty <= 0)) return false;
      if (fAvail === 'in' && !(r.qty != null && r.qty > 0)) return false;
      if (fAvail === 'low' && !(r.qty != null && r.qty > 0 && r.qty <= 2)) return false;
      if (fAvail === 'nocost' && r.unitCost != null) return false;
      if (fAvail === 'online' && !r.online) return false;
      if (fAvail === 'offline' && r.online) return false;
      if (fAvail === 'noimage' && r.img) return false;
      if (fAvail === 'onsale' && !r.onSale) return false;
      if (q && !(r.name.toLowerCase().includes(q) || (r.salesCode || '').toLowerCase().includes(q) || (r.productionCode || '').toLowerCase().includes(q) || r.key.toLowerCase().includes(q))) return false;
      return true;
    });
    const cmp = {
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
      material: (a, b) => (a.material || '').localeCompare(b.material || ''),
      qty: (a, b) => (a.qty ?? -Infinity) - (b.qty ?? -Infinity),
      unitCost: (a, b) => (a.unitCost ?? -Infinity) - (b.unitCost ?? -Infinity),
      retail: (a, b) => (a.retail ?? -Infinity) - (b.retail ?? -Infinity),
      salePrice: (a, b) => (a.salePrice ?? -Infinity) - (b.salePrice ?? -Infinity),
      stock: (a, b) => (STOCK_RANK[a.stock] ?? 9) - (STOCK_RANK[b.stock] ?? 9),
    };
    if (sortKey && cmp[sortKey]) { out.sort(cmp[sortKey]); if (sortDir === 'desc') out.reverse(); }
    return out;
  // eslint-disable-next-line
  }, [overrides, search, fCat, fMat, fAvail, fSpecial, sortKey, sortDir, showBlank, showMerged]);

  const stats = useMemo(() => {
    let items = 0, units = 0, retailVal = 0, online = 0, out = 0;
    ENTITIES.forEach((e) => {
      if (isBlankEntity(e)) return;
      const o = overrides[e.key] || {};
      if (o.deleted) return;
      const r = resolve(e.key);
      items++;
      units += r.qty || 0;
      if (r.online) online++;
      if (r.qty != null && r.qty <= 0) out++;
      if (r.retailValue != null) retailVal += r.retailValue;
    });
    return { items, units, retailVal, online, out };
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
      online: r.online ? 'yes' : 'no', specials: r.specials.join('|'), images: r.images.length,
    }));
    let blob, fname;
    if (fmt === 'json') { blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); fname = 'malaya-inventory.json'; }
    else {
      const cols = ['key', 'type', 'salesCode', 'productionCode', 'name', 'category', 'material', 'units', 'unitCost', 'retail', 'salePrice', 'marginPct', 'status', 'online', 'specials', 'images'];
      const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const csv = [cols.join(',')].concat(data.map((row) => cols.map((c) => esc(row[c])).join(','))).join('\n');
      blob = new Blob([csv], { type: 'text/csv' }); fname = 'malaya-inventory.csv';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    flash(`Exported ${fmt.toUpperCase()} · ${data.length} items`);
  };

  const editing = editKey ? resolve(editKey) : null;
  const anyFilter = search || fCat || fMat || fAvail || fSpecial || sortKey;

  const HEADS = [
    { k: 'name', label: 'Item', cls: 'inv-cell-item' },
    { k: 'material', label: 'Material' },
    { k: 'qty', label: 'Units', num: true },
    { k: 'unitCost', label: 'Cost', num: true },
    { k: 'retail', label: 'Retail', num: true },
    { k: 'salePrice', label: 'Sale', num: true },
    { k: 'stock', label: 'Status' },
    { k: '', label: 'Special' },
    { k: '', label: '' },
  ];

  return (
    <div>
      <div className="adm-pad" style={{ padding: '22px 28px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: T.serif, fontSize: 38, margin: 0, lineHeight: 1 }}>Inventory</h1>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8, letterSpacing: '0.04em' }}>
              {rows.length} of {stats.items} items · <span style={{ color: stats.online ? T.good : T.muted }}>{stats.online} online</span>
              {editedCount > 0 && <> · <span style={{ color: T.accent }}>{editedCount} edited</span></>} · every catalogue piece, stock SKU &amp; studio-added item in one list
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={addItem} style={{ background: T.ink, color: T.panel, border: 'none', padding: '9px 16px', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>+ Add item</button>
            <button onClick={() => setSuggestOpen(true)} style={ghost()}>Find duplicates{dupGroups.length ? ` (${dupGroups.length})` : ''}…</button>
            <button onClick={() => setBulkOpen(true)} style={ghost()}>Bulk adjust…</button>
            <button onClick={() => exportData('csv')} style={ghost()}>Export CSV</button>
            <button onClick={resetAll} disabled={!editedCount} style={ghost(!editedCount)}>Reset all</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: T.line2, border: `1px solid ${T.line2}` }}>
          <Stat label="Items" value={stats.items.toLocaleString('en-US')} sub="catalogue + stock + added" />
          <Stat label="Units on hand" value={stats.units.toLocaleString('en-US')} />
          <Stat label="Retail value" value={m0(stats.retailVal)} sub="stocked lines" />
          <Stat label="Online" value={stats.online.toLocaleString('en-US')} sub="live on storefront" accent />
          <Stat label="Sold out" value={stats.out.toLocaleString('en-US')} />
        </div>
      </div>

      <div className="adm-pad" style={{ padding: '16px 28px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code…" style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1, minWidth: 0 }} />
        </div>
        <Pick value={fCat} onChange={setFCat} all="All categories" options={CATEGORIES} />
        <Pick value={fMat} onChange={setFMat} all="All materials" options={MATERIALS} />
        <Pick value={fSpecial} onChange={setFSpecial} all="Any special" options={SPECIALS.map((s) => [s.key, s.label])} pairs />
        <Pick value={fAvail} onChange={setFAvail} all="All availability" options={[['online', 'Online'], ['offline', 'Offline'], ['onsale', 'On sale'], ['noimage', 'No image'], ['in', 'In stock'], ['low', 'Low (≤2)'], ['out', 'Sold out'], ['nocost', 'Missing cost'], ['deleted', `Deleted${deletedCount ? ` (${deletedCount})` : ''}`]]} pairs />
        {anyFilter && <button onClick={() => { setSearch(''); setFCat(''); setFMat(''); setFAvail(''); setFSpecial(''); setSortKey(''); }} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em' }}>Clear</button>}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {mergedCount > 0 &&
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, cursor: 'pointer', letterSpacing: '0.04em', userSelect: 'none' }}>
              <input type="checkbox" checked={showMerged} onChange={(e) => setShowMerged(e.target.checked)} style={{ accentColor: T.accent }} />
              Show {mergedCount} merged
            </label>}
          {blankCount > 0 &&
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.muted, cursor: 'pointer', letterSpacing: '0.04em', userSelect: 'none' }}>
              <input type="checkbox" checked={showBlank} onChange={(e) => setShowBlank(e.target.checked)} style={{ accentColor: T.accent }} />
              Show {blankCount} blank stock SKUs
            </label>}
        </div>
      </div>

      <div className="adm-pad" style={{ padding: '16px 28px 90px' }}>
        <div className="inv-list">
          <div className="inv-head">
            {HEADS.map((h, i) => (
              h.k
                ? <button key={i} className={'inv-th' + (h.num ? ' num' : '')} onClick={() => toggleSort(h.k)}>
                    {h.label}{sortKey === h.k && <span className="inv-th-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                : <span key={i} className="inv-th" style={{ cursor: 'default', textAlign: i === HEADS.length - 1 ? 'right' : 'left' }}>{h.label}</span>
            ))}
          </div>
          {rows.map((r) => (
            <ItemRow key={r.key} r={r} edited={itemEdited(r.key)} fieldEdited={fieldEdited} commit={commit}
              onToggleSpecial={(sk) => toggleSpecial(r.key, sk, r.specials)}
              onEdit={() => setEditKey(r.key)} onDelete={() => deleteItem(r.key)} onRestore={() => restoreItem(r.key)}
              onMerge={() => setMergeKey(r.key)} onUnmerge={() => unmerge(r.key)}
              masterName={r.mergedInto ? displayName(r.mergedInto) : null} />
          ))}
          {rows.length === 0 && <div style={{ padding: 56, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 20, background: T.panel }}>No items match the current filters.</div>}
        </div>
      </div>

      {editing && <ItemDrawer r={editing} base={entityFor(editKey).base} fieldEdited={fieldEdited} commit={commit} resetItem={resetItem} onDelete={() => deleteItem(editKey)} onToggleSpecial={(sk) => toggleSpecial(editKey, sk, editing.specials)} exploreTopics={exploreTopics} onClose={() => setEditKey(null)} />}
      {bulkOpen && <BulkModal rows={rows} onApply={applyBulk} onClose={() => setBulkOpen(false)} />}
      {mergeKey && <MergePicker row={resolve(mergeKey)} candidates={activeItems.filter((c) => c.key !== mergeKey)} onPick={(masterK) => mergeInto(mergeKey, masterK)} onClose={() => setMergeKey(null)} />}
      {suggestOpen && <SuggestModal groups={dupGroups} onMerge={mergeInto} onClose={() => setSuggestOpen(false)} />}
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

function ItemRow({ r, edited, fieldEdited, commit, onToggleSpecial, onEdit, onDelete, onRestore, onMerge, onUnmerge, masterName }) {
  const statusColor = { 'Sold out': T.danger, 'Archived': T.faint, 'Made to order': T.muted }[r.stock] || T.good;
  const lowQty = r.qty != null && r.qty <= 2;
  return (
    <div className="inv-row" style={{ background: r.deleted ? 'rgba(164,80,43,0.06)' : (edited ? 'rgba(138,106,59,0.045)' : T.panel), opacity: r.mergedInto ? 0.6 : 1 }}>
      <div className="inv-cell inv-cell-item">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', position: 'relative' }}>
            {r.img ? <img src={r.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.serif, fontSize: 13, color: T.faint }}>{(r.productionCode || r.key).replace(/[^A-Za-z]/g, '').slice(0, 2) || '—'}</div>}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <InlineName value={r.name} edited={fieldEdited(r.key, 'name')} onCommit={(v) => commit(r.key, { name: v })} />
            <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><span style={{ color: T.muted }}>SKU</span> {r.salesCode || r.key}</span>
              {r.custom && <span style={{ color: T.accent }}>added</span>}
              {r.deleted
                ? <span style={{ color: T.danger, letterSpacing: '0.06em' }}>deleted</span>
                : r.mergedInto
                  ? <span style={{ color: T.accent, letterSpacing: '0.06em' }}>merged → {masterName}</span>
                  : <span style={{ color: r.online ? T.good : T.faint, letterSpacing: '0.06em' }}>{r.online ? '● online' : '○ offline'}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="inv-cell inv-cell-material">
        <span className="inv-cell-label">Material</span>
        <select value={MATERIALS.includes(r.material) ? r.material : ''} onChange={(e) => commit(r.key, { material: e.target.value })}
          style={{ width: '100%', maxWidth: 128, background: 'transparent', border: `1px solid ${fieldEdited(r.key, 'material') ? T.accent : T.line}`, color: fieldEdited(r.key, 'material') ? T.accent : T.ink, fontSize: 12, padding: '5px 6px', fontFamily: T.sans, cursor: 'pointer' }}>
          <option value="">{r.material || '—'}</option>
          {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="inv-cell num inv-cell-units"><span className="inv-cell-label">Units</span><NumCell value={r.qty} edited={fieldEdited(r.key, 'qty')} onCommit={(v) => commit(r.key, { qty: v })} width={46} placeholder="—" color={lowQty ? T.accent : T.ink} /></div>
      <div className="inv-cell num inv-cell-cost"><span className="inv-cell-label">Cost</span><NumCell value={r.unitCost} edited={fieldEdited(r.key, 'unitCost')} onCommit={(v) => commit(r.key, { unitCost: v })} money placeholder="—" /></div>
      <div className="inv-cell num inv-cell-retail"><span className="inv-cell-label">Retail</span><NumCell value={r.retail} edited={fieldEdited(r.key, 'retail')} onCommit={(v) => commit(r.key, { retail: v })} money placeholder="—" /></div>
      <div className="inv-cell num inv-cell-sale">
        <span className="inv-cell-label">Sale</span>
        <NumCell value={r.salePrice} edited={fieldEdited(r.key, 'salePrice')} onCommit={(v) => commit(r.key, { salePrice: v })} money placeholder="—" />
        {r.onSale && <div style={{ fontSize: 10, color: T.accent, marginTop: 2 }}>−{Math.round((1 - r.salePrice / r.retail) * 100)}%</div>}
      </div>

      <div className="inv-cell inv-cell-status">
        <span className="inv-cell-label">Status</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: statusColor, whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />{r.stock}
        </span>
      </div>

      <div className="inv-cell inv-cell-special">
        <span className="inv-cell-label">Special</span>
        <SpecialsCell value={r.specials} onToggle={onToggleSpecial} />
      </div>

      <div className="inv-cell inv-cell-actions">
        {r.deleted ? (
          <button onClick={onRestore} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Restore</button>
        ) : r.mergedInto ? (
          <button onClick={onUnmerge} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Un-merge</button>
        ) : (
          <>
            <PublishPill on={r.online} onToggle={() => commit(r.key, { online: !r.online })} />
            <button onClick={onEdit} style={{ ...ghost(), padding: '7px 12px', fontSize: 10 }}>Edit</button>
          </>
        )}
        {!r.deleted && <button onClick={onDelete} title="Delete item" style={{ background: 'transparent', border: `1px solid ${T.line2}`, color: T.danger, padding: '7px 9px', fontSize: 11, lineHeight: 1, cursor: 'pointer', fontFamily: T.sans }}>🗑</button>}
        {!r.deleted && !r.mergedInto && (
          <a href={`/product/${encodeURIComponent(r.key)}`} target="_blank" rel="noreferrer" title="Preview this item on the storefront"
            style={{ ...ghost(), padding: '7px 12px', fontSize: 10, textDecoration: 'none' }}>View ↗</a>
        )}
      </div>
    </div>
  );
}

function InlineName({ value, edited, onCommit }) {
  const [v, setV] = useState(value || '');
  const [focus, setFocus] = useState(false);
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <input value={v} placeholder="Unnamed item"
      onChange={(e) => setV(e.target.value)} onFocus={() => setFocus(true)}
      onBlur={() => { setFocus(false); onCommit(v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${edited ? T.accent : (focus ? T.line2 : 'transparent')}`, color: edited ? T.accent : T.ink, fontFamily: T.serif, fontSize: 15.5, lineHeight: 1.2, padding: '1px 0', outline: 'none' }} />
  );
}

function SpecialsCell({ value, onToggle }) {
  const [open, setOpen] = useState(false);
  const active = value || [];
  const label = active.length ? SPECIALS.filter((s) => active.includes(s.key)).map((s) => s.label).join(', ') : 'None';
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} title="Set special attributes"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 124, padding: '6px 9px', fontSize: 11, cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${active.length ? T.accent : T.line2}`, background: active.length ? 'rgba(138,106,59,0.08)' : 'transparent', color: active.length ? T.accent : T.muted }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', zIndex: 21, top: 'calc(100% + 4px)', left: 0, minWidth: 168, background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 14px 34px rgba(0,0,0,0.18)', padding: 6 }}>
            {SPECIALS.map((s) => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', cursor: 'pointer', fontSize: 12.5, color: T.ink }}>
                <input type="checkbox" checked={active.includes(s.key)} onChange={() => onToggle(s.key)} style={{ accentColor: T.accent }} />
                {s.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
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
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
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
            {METAL_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.group ? `${s.label}` : (s.value.startsWith('mat:') ? `  ${s.label}` : s.label)}</option>)}
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

// ─────────────────────────────────────────────────── MergePicker ────
function MergePicker({ row, candidates, onPick, onClose }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = (s ? candidates.filter((c) => (c.name || '').toLowerCase().includes(s) || (c.salesCode || '').toLowerCase().includes(s) || c.key.toLowerCase().includes(s)) : candidates).slice(0, 80);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 24 }}>Merge into…</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>Hide <strong style={{ color: T.ink }}>{row.name || row.key}</strong> and keep the item you pick as the master. Reversible at any time.</div>
        </div>
        <div style={{ padding: '14px 24px' }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the item to keep…" style={{ width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink, padding: '10px 12px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '0 12px 12px' }}>
          {list.map((c) => (
            <button key={c.key} onClick={() => onPick(c.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
                {c.img && <img src={c.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: T.serif, fontSize: 15, color: T.ink }}>{c.name || c.key}</div>
                <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.08em' }}>{c.salesCode || c.key} · {c.category} · {c.images.length} photo{c.images.length === 1 ? '' : 's'}</div>
              </div>
            </button>
          ))}
          {list.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.muted }}>No matching items.</div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.line}`, textAlign: 'right' }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── SuggestModal ────
function SuggestModal({ groups, onMerge, onClose }) {
  const [masters, setMasters] = useState({});
  const [done, setDone] = useState({});
  const masterFor = (g, i) => masters[i] || g.master.key;
  const mergeGroup = (g, i) => {
    const mk = masterFor(g, i);
    g.items.forEach((it) => { if (it.key !== mk) onMerge(it.key, mk); });
    setDone((d) => ({ ...d, [i]: true }));
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 70px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: T.serif, fontSize: 24 }}>Suggested duplicates</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>{groups.length} group{groups.length === 1 ? '' : 's'} of same-name items in the same category. Choose the master (most photos pre-selected) and merge the rest into it.</div>
        </div>
        <div style={{ overflowY: 'auto', padding: '8px 24px 12px' }}>
          {groups.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 18 }}>No duplicates found.</div>}
          {groups.map((g, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${T.line}`, padding: '14px 0', opacity: done[i] ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12 }}>
                <div style={{ fontFamily: T.serif, fontSize: 16 }}>{g.items[0].name} <span style={{ fontSize: 11, color: T.faint }}>· {g.items[0].category} · {g.items.length} items</span></div>
                {!done[i]
                  ? <button onClick={() => mergeGroup(g, i)} style={{ background: T.ink, color: T.panel, border: 'none', padding: '8px 16px', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>Merge {g.items.length - 1} →</button>
                  : <span style={{ fontSize: 11, color: T.good, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Merged ✓</span>}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {g.items.map((it) => {
                  const isMaster = masterFor(g, i) === it.key;
                  return (
                    <label key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: `1px solid ${isMaster ? T.accent : T.line}`, background: isMaster ? 'rgba(138,106,59,0.07)' : T.card, cursor: done[i] ? 'default' : 'pointer' }}>
                      <input type="radio" name={`master-${i}`} checked={isMaster} disabled={done[i]} onChange={() => setMasters((m) => ({ ...m, [i]: it.key }))} style={{ accentColor: T.accent }} />
                      <div style={{ width: 30, height: 30, flexShrink: 0, background: T.bg, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
                        {it.img && <img src={it.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />}
                      </div>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.ink }}>{it.sub || it.material || '—'}
                        <span style={{ fontSize: 10, color: T.faint, marginLeft: 8 }}>{it.salesCode || it.key} · {it.images.length} img</span>
                      </span>
                      {isMaster && <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.accent }}>Master</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${T.line}`, textAlign: 'right' }}>
          <button onClick={onClose} style={ghost()}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── ItemDrawer ────
function ItemDrawer({ r, base, fieldEdited, commit, resetItem, onDelete, onToggleSpecial, exploreTopics, onClose }) {
  const toggleTopic = (slug) => {
    const set = new Set(r.topics || []);
    if (set.has(slug)) set.delete(slug); else set.add(slug);
    commit(r.key, { topics: [...set] });
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '94vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.img ? <img src={r.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
                : <span style={{ fontFamily: T.serif, fontSize: 16, color: T.faint }}>{(r.productionCode || r.key).slice(0, 3)}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.serif, fontSize: 21, lineHeight: 1.12 }}>{r.name || 'Unnamed item'}</div>
              <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.1em', marginTop: 4 }}>{r.salesCode || r.key} · {r.kind === 'ledger' ? 'stock SKU' : (r.kind === 'extra' ? 'collaboration item' : (r.kind === 'custom' ? 'studio-created item' : 'catalogue item'))}</div>
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
                : (r.kind === 'ledger' ? 'Publish to list this stock line on the live storefront. You can publish now and add images later.' : 'Offline (archived) — switch on to list it on the live storefront again.')}
            </div>
          </div>

          <DField label="Item name" value={r.name} edited={fieldEdited(r.key, 'name')} base={base.name} onCommit={(v) => commit(r.key, { name: v })} onRevert={() => commit(r.key, { name: base.name })} />
          <DField label="Subtitle / detail" value={r.sub} edited={fieldEdited(r.key, 'sub')} base={base.sub} onCommit={(v) => commit(r.key, { sub: v })} onRevert={() => commit(r.key, { sub: base.sub })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DField label="Sales code (SKU)" value={r.salesCode} edited={fieldEdited(r.key, 'salesCode')} base={base.salesCode} onCommit={(v) => commit(r.key, { salesCode: v })} onRevert={() => commit(r.key, { salesCode: base.salesCode })} />
            <DField label="Production code" value={r.productionCode} edited={fieldEdited(r.key, 'productionCode')} base={base.productionCode} onCommit={(v) => commit(r.key, { productionCode: v })} onRevert={() => commit(r.key, { productionCode: base.productionCode })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <DSel label="Category" value={r.category} options={CATEGORIES} edited={fieldEdited(r.key, 'category')} base={base.category} onCommit={(v) => commit(r.key, { category: v })} onRevert={() => commit(r.key, { category: base.category })} />
            <DSel label="Material" value={r.material} options={MATERIALS} edited={fieldEdited(r.key, 'material')} base={base.material} onCommit={(v) => commit(r.key, { material: v })} onRevert={() => commit(r.key, { material: base.material })} />
          </div>

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Special attributes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SPECIALS.map((s) => {
                const on = r.specials.includes(s.key);
                return (
                  <button key={s.key} onClick={() => onToggleSpecial(s.key)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${on ? T.accent : T.line2}`, background: on ? 'rgba(138,106,59,0.12)' : T.card, color: on ? T.accent : T.muted }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? T.accent : T.line2 }} />{s.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 8, lineHeight: 1.6 }}>“Tashi Mannox” lists this piece on the Tashi Mannox page. An item can carry several.</div>
          </div>

          <SymbolismChecklist topics={exploreTopics} selected={r.topics || []} onToggle={toggleTopic} />

          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 18, paddingTop: 18 }}>
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
            <DTextArea value={r.story} edited={fieldEdited(r.key, 'story')} commit={commit} keyId={r.key}
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
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => resetItem(r.key)} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Reset</button>
            <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Delete</button>
          </div>
          <button onClick={onClose} style={{ background: T.ink, color: T.panel, border: 'none', padding: '13px 28px', fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Done</button>
        </div>
      </aside>
    </div>
  );
}

// Drawer "Symbolism" checklist — links the item to Explore knowledge topics
// (chips styled like the Specials toggles). One storage location, two editing
// surfaces: the same field is editable from the topic editor's Linked pieces
// panel in the Explore tab.
function SymbolismChecklist({ topics, selected, onToggle }) {
  const [q, setQ] = useState('');
  const all = Object.values(topics || {})
    .filter((t) => t && t.title)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const query = q.trim().toLowerCase();
  const shown = query
    ? all.filter((t) => `${t.title} ${(t.aliases || []).join(' ')}`.toLowerCase().includes(query))
    : all;
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 18, paddingTop: 18 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 12 }}>Symbolism</div>
      {all.length === 0 ? (
        <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.6 }}>No Explore topics yet — create them in the Explore tab, then link pieces here.</div>
      ) : (
        <>
          {all.length > 12 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter topics…"
              style={{ ...dFieldStyle(false), marginBottom: 10, padding: '8px 10px', fontSize: 12.5 }} />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 190, overflowY: 'auto' }}>
            {shown.map((t) => {
              const on = selected.includes(t.slug);
              return (
                <button key={t.slug} onClick={() => onToggle(t.slug)} title={t.excerpt || t.title}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, border: `1px solid ${on ? T.accent : T.line2}`, background: on ? 'rgba(138,106,59,0.12)' : T.card, color: on ? T.accent : T.muted }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? T.accent : T.line2 }} />
                  {t.title}{t.published === false ? ' (draft)' : ''}
                </button>
              );
            })}
            {shown.length === 0 && <div style={{ fontSize: 12, color: T.muted }}>No topics match.</div>}
          </div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 8, lineHeight: 1.6 }}>
            Linked topics appear on this piece’s page (“The symbolism behind this design”), on the topic’s page and in the catalogue Symbol filter. Also editable from the topic’s “Linked pieces” panel in the Explore tab.
          </div>
        </>
      )}
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
        {edited && onRevert && <button onClick={onRevert} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>was <span style={{ textDecoration: 'line-through' }}>{base == null || base === '' ? '—' : String(base)}</span> · revert</button>}
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
function DTextArea({ value, edited, commit, keyId, placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <DShell label="Narrative" edited={edited} base="" onRevert={() => commit(keyId, { story: '' })}>
      <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(keyId, { story: v })} placeholder={placeholder} rows={5}
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
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: T.card, border: `1px solid ${value ? T.accent : T.line2}`, color: value ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em' }}>
      <option value="">{all}</option>
      {options.map((o) => pairs ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
