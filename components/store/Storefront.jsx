'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { T } from '@/components/admin/theme';
import { PRODUCTS, COLLECTIONS, CATEGORIES, MATERIALS, fmtPrice } from '@/lib/data/products';
import { resolveCatalogue } from '@/lib/data/resolve';
import { loadOverrides, OVERRIDE_KEY } from '@/lib/overrides';

// Items in these states never appear in the public catalogue.
const HIDDEN_STOCK = ['Archived'];

const SORTS = [
  ['featured', 'Featured'],
  ['new', 'New arrivals'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
  ['name', 'Name (A–Z)'],
];

export default function Storefront() {
  const [overrides, setOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [collection, setCollection] = useState('');
  const [category, setCategory] = useState('');
  const [material, setMaterial] = useState('');
  const [sort, setSort] = useState('featured');
  const [active, setActive] = useState(null);

  // Read the studio's saved edits, and stay in sync if the admin desk is open in
  // another tab.
  useEffect(() => {
    setOverrides(loadOverrides());
    const onStorage = (e) => {
      if (e.key === OVERRIDE_KEY) setOverrides(loadOverrides());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resolved = useMemo(
    () => resolveCatalogue(PRODUCTS, overrides).filter((p) => !HIDDEN_STOCK.includes(p.stock)),
    [overrides]
  );

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = resolved.filter((p) => {
      if (collection && p.collection !== collection) return false;
      if (category && p.category !== category) return false;
      if (material && p.material !== material) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q))) return false;
      return true;
    });
    switch (sort) {
      case 'new': out = out.slice().sort((a, b) => (b.tag === 'new') - (a.tag === 'new')); break;
      case 'price-asc': out = out.slice().sort((a, b) => a.price - b.price); break;
      case 'price-desc': out = out.slice().sort((a, b) => b.price - a.price); break;
      case 'name': out = out.slice().sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return out;
  }, [resolved, search, collection, category, material, sort]);

  const hasFilter = search || collection || category || material;
  const clearAll = () => { setSearch(''); setCollection(''); setCategory(''); setMaterial(''); };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.ink, fontFamily: T.sans }}>
      <Header />
      <Hero count={resolved.length} />

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px 90px' }}>
        <FilterBar
          {...{ search, setSearch, collection, setCollection, category, setCategory,
            material, setMaterial, sort, setSort }}
          shown={items.length}
          total={resolved.length}
          hasFilter={hasFilter}
          clearAll={clearAll}
        />

        {items.length === 0 ? (
          <div style={{ padding: '90px 0', textAlign: 'center', color: T.muted, fontFamily: T.serif, fontSize: 24 }}>
            Nothing matches those filters yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 26, marginTop: 30 }}>
            {items.map((p) => <Card key={p.id} p={p} onOpen={() => setActive(p)} />)}
          </div>
        )}
      </main>

      <Footer />
      {active && <QuickView p={active} onClose={() => setActive(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────── Header ────
function Header() {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(244,238,227,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px' }}>
        {/* spacer keeps the wordmark optically centred against the corner link */}
        <div style={{ width: 70 }} />
        <span style={{ fontFamily: T.serif, fontSize: 26, letterSpacing: '0.34em', textTransform: 'uppercase', color: T.ink }}>Malaya</span>
        <Link
          href="/admin"
          title="Studio administration"
          style={{ width: 70, textAlign: 'right', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.faint, textDecoration: 'none' }}
        >
          Admin
        </Link>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────── Hero ────
function Hero({ count }) {
  return (
    <section style={{ textAlign: 'center', padding: '64px 28px 40px' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.34em', textTransform: 'uppercase', color: T.accent, marginBottom: 16 }}>
        Handcrafted in Bhutan
      </div>
      <h1 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: 'clamp(38px, 6vw, 60px)', lineHeight: 1.05, margin: 0, color: T.ink }}>
        Sacred forms, in gold &amp; silver
      </h1>
      <p style={{ maxWidth: 560, margin: '20px auto 0', fontSize: 15, lineHeight: 1.7, color: T.muted }}>
        A collection of {count} pieces — mantras, ritual objects and healing stones,
        translated into fine jewellery.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────── Filter bar ────
function FilterBar({ search, setSearch, collection, setCollection, category, setCategory,
  material, setMaterial, sort, setSort, shown, total, hasFilter, clearAll }) {
  return (
    <div style={{ position: 'sticky', top: 60, zIndex: 20, background: T.bg, paddingTop: 18, paddingBottom: 16, borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.line2}`, padding: '9px 12px', minWidth: 230, flex: '1 1 230px', maxWidth: 320 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the collection…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: T.ink, fontSize: 13, fontFamily: T.sans, flex: 1 }} />
        </div>
        <Select value={collection} onChange={setCollection} all="All collections" options={COLLECTIONS} />
        <Select value={category} onChange={setCategory} all="All categories" options={CATEGORIES} />
        <Select value={material} onChange={setMaterial} all="All materials" options={MATERIALS} />
        <div style={{ flex: 1 }} />
        <Select value={sort} onChange={setSort} options={SORTS} isSort />
      </div>
      <div style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span>{shown} of {total} pieces</span>
        {hasFilter && (
          <button onClick={clearAll} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function Select({ value, onChange, all, options, isSort }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: T.card, border: `1px solid ${value && !isSort ? T.accent : T.line2}`, color: value && !isSort ? T.accent : T.ink, fontSize: 12, padding: '9px 10px', fontFamily: T.sans, cursor: 'pointer', letterSpacing: '0.02em' }}>
      {all && <option value="">{all}</option>}
      {options.map((o) => Array.isArray(o)
        ? <option key={o[0]} value={o[0]}>{isSort ? `Sort · ${o[1]}` : o[1]}</option>
        : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────── Product card ────
function Card({ p, onOpen }) {
  const soldOut = p.stock === 'Sold out';
  const off = p.onSale ? Math.round((1 - p.salePrice / p.listPrice) * 100) : 0;
  return (
    <button onClick={onOpen}
      style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: T.sans, color: T.ink }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
        <img src={p.img} alt={p.name} loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: soldOut ? 0.55 : 1, transition: 'transform 0.5s ease' }}
          onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <Badge p={p} off={off} />
      </div>
      <div style={{ padding: '14px 2px 0' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.faint, marginBottom: 5 }}>{p.collection}</div>
        <div style={{ fontFamily: T.serif, fontSize: 19, lineHeight: 1.15 }}>{p.name}</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{p.sub}</div>
        <div style={{ marginTop: 9, display: 'flex', alignItems: 'baseline', gap: 9 }}>
          {p.onSale && <span style={{ fontSize: 13, color: T.faint, textDecoration: 'line-through' }}>{fmtPrice(p.listPrice)}</span>}
          <span style={{ fontSize: 15, color: p.onSale ? T.accent : T.ink, letterSpacing: '0.02em' }}>{fmtPrice(p.price)}</span>
        </div>
      </div>
    </button>
  );
}

function Badge({ p, off }) {
  const tag =
    p.stock === 'Sold out' ? { text: 'Sold out', bg: T.danger }
    : p.onSale ? { text: `−${off}%`, bg: T.accent }
    : p.stock === 'Made to order' ? { text: 'Made to order', bg: T.ink }
    : p.stock === 'Low stock' ? { text: 'Low stock', bg: T.accent }
    : p.tag === 'new' ? { text: 'New', bg: T.ink }
    : null;
  if (!tag) return null;
  return (
    <span style={{ position: 'absolute', top: 10, left: 10, background: tag.bg, color: T.panel, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '4px 8px' }}>
      {tag.text}
    </span>
  );
}

// ─────────────────────────────────────────────────── Quick view ────
function QuickView({ p, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const off = p.onSale ? Math.round((1 - p.salePrice / p.listPrice) * 100) : 0;
  const soldOut = p.stock === 'Sold out';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,10,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 820, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', background: T.panel, border: `1px solid ${T.line2}`, boxShadow: '0 30px 80px rgba(0,0,0,0.32)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div style={{ background: T.card, aspectRatio: '1 / 1', position: 'relative', borderRight: `1px solid ${T.line}` }}>
          <img src={p.img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: soldOut ? 0.6 : 1 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <div style={{ padding: '32px 30px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.accent }}>{p.collection}</div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 24, cursor: 'pointer', lineHeight: 1, marginTop: -6 }}>×</button>
          </div>
          <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: 30, lineHeight: 1.12, margin: '12px 0 4px' }}>{p.name}</h2>
          <div style={{ fontSize: 14, color: T.muted }}>{p.sub}</div>

          <div style={{ margin: '22px 0', display: 'flex', alignItems: 'baseline', gap: 12 }}>
            {p.onSale && <span style={{ fontSize: 18, color: T.faint, textDecoration: 'line-through' }}>{fmtPrice(p.listPrice)}</span>}
            <span style={{ fontFamily: T.serif, fontSize: 32, color: p.onSale ? T.accent : T.ink }}>{fmtPrice(p.price)}</span>
            {p.onSale && <span style={{ fontSize: 12, letterSpacing: '0.08em', color: T.accent }}>−{off}%</span>}
          </div>

          <dl style={{ margin: 0, borderTop: `1px solid ${T.line}` }}>
            <Spec label="Category" value={p.category} />
            <Spec label="Material" value={p.material} />
            <Spec label="Availability" value={p.stock} />
            <Spec label="Reference" value={p.code} />
          </dl>

          <div style={{ marginTop: 'auto', paddingTop: 26 }}>
            <button disabled={soldOut}
              style={{ width: '100%', background: soldOut ? 'transparent' : T.ink, color: soldOut ? T.faint : T.panel, border: soldOut ? `1px solid ${T.line2}` : 'none', padding: '15px', fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', cursor: soldOut ? 'not-allowed' : 'pointer', fontFamily: T.sans }}>
              {soldOut ? 'Sold out' : p.stock === 'Made to order' ? 'Enquire to order' : 'Enquire about this piece'}
            </button>
            <div style={{ fontSize: 11, color: T.faint, textAlign: 'center', marginTop: 12, letterSpacing: '0.04em' }}>
              Every piece is made to commission. Contact the studio to reserve.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${T.line}` }}>
      <dt style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: T.ink }}>{value}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────── Footer ────
function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${T.line2}`, background: T.panel }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 28px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: T.serif, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase' }}>Malaya</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Fine Buddhist jewellery, handcrafted in Bhutan.</div>
        </div>
        <div style={{ fontSize: 11, color: T.faint, letterSpacing: '0.08em' }}>
          © {new Date().getFullYear()} Malaya Jewellery · <Link href="/admin" style={{ color: T.faint, textDecoration: 'none' }}>Studio admin</Link>
        </div>
      </div>
    </footer>
  );
}
