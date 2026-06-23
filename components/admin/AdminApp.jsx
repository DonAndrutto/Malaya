'use client';

import { useState, useEffect, useRef } from 'react';
import { T, ghostBtn } from './theme';
import { COLLECTIONS, CATEGORIES, MATERIALS, STOCK_OPTIONS, fmtPrice } from '@/lib/data/products';
import { saveOverrides, subscribeOverrides } from '@/lib/overrides';
import { uploadImage } from '@/lib/upload';
import { FIREBASE_ENABLED } from '@/lib/firebase';
import { signIn, signOutUser, subscribeAuth, friendlyAuthError } from '@/lib/auth';
import Inventory from './Inventory';
import MassEdit from './MassEdit';
import SiteContent from './SiteContent';
import SiteImages from './SiteImages';

const SESSION_KEY = 'malaya:admin:session';

function money(n) { return fmtPrice(Math.round(Number(n) || 0)); }

// ─────────────────────────────────────────────────── Login ────
// Firebase Auth (email/password). When Firebase isn't configured we fall back to
// the old demo behaviour (any credentials) so a bare checkout still opens.
function Login({ onDemoLogin }) {
  const [email, setEmail] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!FIREBASE_ENABLED) {
      onDemoLogin(email.trim() || 'studio');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), p);
      // subscribeAuth (in AdminApp) flips the view once sign-in resolves.
    } catch (e2) {
      setErr(friendlyAuthError(e2));
    } finally {
      setBusy(false);
    }
  };
  const field = {
    width: '100%', background: T.card, border: `1px solid ${T.line2}`, color: T.ink,
    padding: '13px 14px', fontSize: 14, fontFamily: T.sans, outline: 'none', letterSpacing: '0.02em',
  };
  const label = { fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.muted, marginBottom: 7, display: 'block' };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 24 }}>
      <div style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ fontFamily: T.serif, fontSize: 30, letterSpacing: '0.3em', textTransform: 'uppercase', color: T.ink }}>Malaya</div>
          <div style={{ fontSize: 10, letterSpacing: '0.34em', textTransform: 'uppercase', color: T.accent, marginTop: 8 }}>Studio Administration</div>
        </div>
        <form onSubmit={submit} style={{ background: T.panel, border: `1px solid ${T.line}`, padding: '30px 30px 26px' }}>
          <div style={{ fontFamily: T.serif, fontSize: 24, color: T.ink, marginBottom: 4 }}>Sign in</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, marginBottom: 22 }}>Access the price &amp; inventory desk.</div>
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Email</span>
            <input style={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" autoFocus />
          </div>
          <div style={{ marginBottom: err ? 14 : 24 }}>
            <span style={label}>Password</span>
            <input style={field} type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div style={{ fontSize: 12, color: T.danger, marginBottom: 18, letterSpacing: '0.02em' }}>{err}</div>}
          <button type="submit" disabled={busy} style={{ width: '100%', background: T.ink, color: T.panel, border: 'none', padding: '15px', fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: T.sans }}>
            {busy ? 'Signing in…' : 'Enter'}
          </button>
          {!FIREBASE_ENABLED && <div style={{ fontSize: 11, color: T.faint, textAlign: 'center', marginTop: 16, letterSpacing: '0.04em' }}>Firebase not configured — demo mode (any credentials).</div>}
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────── EditDrawer ────
// Full per-item editor used by the Mass-edit grid (the Inventory desk has its
// own drawer). Edits are saved per product id and flow into the live catalogue.
export function EditDrawer({ r, base, fieldEdited, commit, resetItem, onClose }) {
  const off = r.onSale ? Math.round((1 - r.salePrice / r.listPrice) * 100) : 0;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,16,10,0.32)' }}>
      <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw', background: T.panel, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.18)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div style={{ width: 56, height: 56, flexShrink: 0, background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
              <img src={r.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.serif, fontSize: 22, lineHeight: 1.1 }}>{r.name}</div>
              <div style={{ fontSize: 10, color: T.faint, letterSpacing: '0.12em', marginTop: 4 }}>{r.code} · {r.id.toUpperCase()}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FieldText label="Sales code" value={r.salesCode} edited={fieldEdited(r.id, 'salesCode')} base={base.salesCode} onCommit={(v) => commit(r.id, { salesCode: v })} onRevert={() => commit(r.id, { salesCode: base.salesCode })} />
            <FieldText label="Production code" value={r.productionCode} edited={fieldEdited(r.id, 'productionCode')} base={base.productionCode} onCommit={(v) => commit(r.id, { productionCode: v })} onRevert={() => commit(r.id, { productionCode: base.productionCode })} />
          </div>
          <FieldText label="Name" value={r.name} edited={fieldEdited(r.id, 'name')} base={base.name} onCommit={(v) => commit(r.id, { name: v })} onRevert={() => commit(r.id, { name: base.name })} />
          <FieldText label="Subtitle / detail" value={r.sub} edited={fieldEdited(r.id, 'sub')} base={base.sub} onCommit={(v) => commit(r.id, { sub: v })} onRevert={() => commit(r.id, { sub: base.sub })} />
          <FieldSelect label="Category" value={r.category} options={CATEGORIES} edited={fieldEdited(r.id, 'category')} base={base.category} onCommit={(v) => commit(r.id, { category: v })} onRevert={() => commit(r.id, { category: base.category })} />
          <FieldSelect label="Collection" value={r.collection} options={COLLECTIONS} edited={fieldEdited(r.id, 'collection')} base={base.collection} onCommit={(v) => commit(r.id, { collection: v })} onRevert={() => commit(r.id, { collection: base.collection })} />
          <FieldSelect label="Material" value={r.material} options={MATERIALS} edited={fieldEdited(r.id, 'material')} base={base.material} onCommit={(v) => commit(r.id, { material: v })} onRevert={() => commit(r.id, { material: base.material })} />
          <FieldSelect label="Stock / availability" value={r.stock} options={STOCK_OPTIONS} edited={fieldEdited(r.id, 'stock')} base={base.stock} onCommit={(v) => commit(r.id, { stock: v })} onRevert={() => commit(r.id, { stock: base.stock })} />
          <GalleryField r={r} base={base} edited={fieldEdited(r.id, 'img') || fieldEdited(r.id, 'images')} commit={commit} />
          <StoryField r={r} edited={fieldEdited(r.id, 'story')} commit={commit} />
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 6, paddingTop: 18 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.accent, marginBottom: 14 }}>Pricing</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FieldNum label="List price" value={r.listPrice} edited={fieldEdited(r.id, 'listPrice')} base={base.listPrice} onCommit={(v) => commit(r.id, { listPrice: v })} onRevert={() => commit(r.id, { listPrice: base.listPrice })} />
              <FieldNum label="Sale price" value={r.salePrice} placeholder="—" edited={fieldEdited(r.id, 'salePrice')} base={base.salePrice} onCommit={(v) => commit(r.id, { salePrice: v })} onRevert={() => commit(r.id, { salePrice: base.salePrice })} clearable onClear={() => commit(r.id, { salePrice: null })} />
            </div>
            <div style={{ marginTop: 14, padding: '12px 14px', background: T.card, border: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.muted }}>Sells for</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                {r.onSale && <span style={{ textDecoration: 'line-through', color: T.faint, fontSize: 14 }}>{money(r.listPrice)}</span>}
                <span style={{ fontFamily: T.serif, fontSize: 24, color: r.onSale ? T.accent : T.ink }}>{money(r.price)}</span>
                {r.onSale && <span style={{ fontSize: 11, color: T.accent, letterSpacing: '0.06em' }}>−{off}%</span>}
              </span>
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <button onClick={() => resetItem(r.id)} style={{ background: 'transparent', border: 'none', color: T.danger, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Reset to original</button>
          <button onClick={onClose} style={{ background: T.ink, color: T.panel, border: 'none', padding: '13px 28px', fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}>Done</button>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────── GalleryField ────
// Upload one or more product photos to Firebase Storage; the download URLs are
// committed to the override (img = images[0], mirrored to Firestore) so they
// flow into the catalogue immediately. Items may have zero, one, or many photos.
function GalleryField({ r, base, edited, commit }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const images = r.images && r.images.length ? r.images : (r.img ? [r.img] : []);
  const setImages = (arr) => commit(r.id, { images: arr.length ? arr : null, img: arr[0] || null });
  const add = async (files) => {
    const arr = files ? Array.from(files) : [];
    if (!arr.length) return;
    if (!FIREBASE_ENABLED) { alert('Firebase is not configured — image uploads are unavailable.'); return; }
    setBusy(true);
    try {
      const urls = [];
      for (const f of arr) urls.push(await uploadImage(`products/${r.id}`, f));
      setImages([...images, ...urls]);
    } catch (err) {
      alert('Upload failed: ' + (err && err.message ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };
  const removeAt = (i) => setImages(images.filter((_, j) => j !== i));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= images.length) return; const a = images.slice(); [a[i], a[j]] = [a[j], a[i]]; setImages(a); };
  return (
    <FieldShell label="Images / gallery" edited={edited} base="original" showBase={edited} onRevert={() => commit(r.id, { images: null, img: base.img })}>
      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 9, marginBottom: 11 }}>
          {images.map((src, i) => (
            <div key={src + i} style={{ border: `1px solid ${i === 0 ? T.accent : T.line2}`, background: T.card, position: 'relative' }}>
              <div style={{ aspectRatio: '1 / 1', overflow: 'hidden' }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.opacity = 0.3; }} />
              </div>
              {i === 0 && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', background: T.accent, color: '#fff', padding: '2px 5px' }}>Main</span>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 5px' }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <GIcon label="◀" title="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} />
                  <GIcon label="▶" title="Move later" disabled={i === images.length - 1} onClick={() => move(i, 1)} />
                </div>
                <GIcon label="✕" title="Remove image" danger onClick={() => removeAt(i)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        style={{ border: `1px dashed ${T.line2}`, background: T.card, padding: '16px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', color: T.muted }}>
        <div style={{ fontSize: 12, letterSpacing: '0.04em' }}>{busy ? 'Uploading…' : (images.length ? 'Add more images' : 'Upload image(s)')}</div>
        <div style={{ fontSize: 10.5, color: T.faint, marginTop: 4 }}>Click or drop photos here · the first image is the main one</div>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => { const fs = e.target.files; e.target.value = ''; add(fs); }} style={{ display: 'none' }} />
      </div>
      {!FIREBASE_ENABLED && <span style={{ fontSize: 10, color: T.faint, display: 'block', marginTop: 6 }}>Connect Firebase to enable uploads</span>}
    </FieldShell>
  );
}
function GIcon({ label, title, onClick, disabled, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ background: 'transparent', border: `1px solid ${T.line}`, color: disabled ? T.faint : (danger ? T.danger : T.muted), fontSize: 10, lineHeight: 1, padding: '3px 5px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{label}</button>
  );
}

// ─────────────────────────────────────────────────── StoryField ────
// Editable narrative saved to the product's Firestore doc and rendered on the
// live product page (blank lines separate paragraphs).
function StoryField({ r, edited, commit }) {
  const [v, setV] = useState(r.story || '');
  useEffect(() => setV(r.story || ''), [r.story]);
  return (
    <FieldShell label="Story" edited={edited} base="" showBase={edited} onRevert={() => commit(r.id, { story: '' })}>
      <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(r.id, { story: v })} rows={5}
        placeholder="Describe this piece — materials, symbolism, craft. Shown on the product page."
        style={{ ...inputStyle(edited), resize: 'vertical', minHeight: 112, lineHeight: 1.6 }} />
    </FieldShell>
  );
}

// ─────────────────────────────────────────────────── Field helpers ────
function FieldShell({ label, edited, base, onRevert, children, showBase = true }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: edited ? T.accent : T.muted }}>{label}{edited ? ' ·' : ''}</span>
        {edited && showBase && (
          <button onClick={onRevert} title="Revert to original" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 10, color: T.faint, letterSpacing: '0.04em' }}>
            was <span style={{ textDecoration: 'line-through' }}>{base == null || base === '' ? '—' : String(base)}</span> · revert
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
const inputStyle = (edited) => ({ width: '100%', background: T.card, border: `1px solid ${edited ? T.accent : T.line2}`, color: T.ink, padding: '11px 12px', fontSize: 14, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' });
function FieldText({ label, value, edited, base, onCommit, onRevert }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return (
    <FieldShell label={label} edited={edited} base={base} onRevert={onRevert}>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} style={inputStyle(edited)} />
    </FieldShell>
  );
}
function FieldSelect({ label, value, options, edited, base, onCommit, onRevert }) {
  return (
    <FieldShell label={label} edited={edited} base={base} onRevert={onRevert}>
      <select value={value} onChange={(e) => onCommit(e.target.value)} style={{ ...inputStyle(edited), cursor: 'pointer' }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </FieldShell>
  );
}
function FieldNum({ label, value, edited, base, onCommit, onRevert, placeholder, clearable, onClear }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <FieldShell label={label} edited={edited} base={base} onRevert={onRevert} showBase={!clearable}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: 11, color: T.faint, fontSize: 14 }}>$</span>
        <input value={v} placeholder={placeholder || '0'} inputMode="numeric"
          onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => onCommit(v.trim() === '' ? null : v.trim())}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          style={{ ...inputStyle(edited), paddingLeft: 26 }} />
        {clearable && value != null &&
          <button onClick={onClear} title="Clear sale" style={{ position: 'absolute', right: 8, top: 8, background: 'transparent', border: 'none', color: T.muted, fontSize: 16, cursor: 'pointer' }}>×</button>}
      </div>
    </FieldShell>
  );
}

// ─────────────────────────────────────────────────── Console (shell with tabs) ────
function Console({ user, onLogout }) {
  const [tab, setTab] = useState('inventory');
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    const saved = localStorage.getItem('malaya:admin:tab');
    // The old "ledger" and "catalogue" tabs are now one unified Inventory list.
    if (saved) setTab(saved === 'ledger' || saved === 'catalogue' ? 'inventory' : saved);
    // Hydrate from Firestore (with the localStorage cache for an instant paint),
    // and stay in sync with edits made on other devices.
    return subscribeOverrides(setOverrides);
  }, []);

  const update = (updater) => setOverrides((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    saveOverrides(next);
    return next;
  });

  useEffect(() => {
    try { localStorage.setItem('malaya:admin:tab', tab); } catch {}
  }, [tab]);

  const TABS = [['inventory', 'Inventory'], ['massedit', 'Mass edit'], ['content', 'Content'], ['site', 'Site images']];
  const tabBtn = (active) => ({ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '6px 2px', color: active ? T.ink : T.muted, borderBottom: `2px solid ${active ? T.accent : 'transparent'}` });

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, height: 56, boxSizing: 'border-box', background: T.panel, borderBottom: `1px solid ${T.line2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <span style={{ fontFamily: T.serif, fontSize: 23, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.ink }}>Malaya</span>
          <nav style={{ display: 'flex', gap: 22 }}>
            {TABS.map(([k, lbl]) => <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{lbl}</button>)}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', color: T.muted }}>Signed in as <span style={{ color: T.ink }}>{user}</span></span>
          <button onClick={onLogout} style={ghostBtn()}>Log out</button>
        </div>
      </header>

      {tab === 'inventory' && <Inventory overrides={overrides} setOverrides={update} />}
      {tab === 'massedit' && <MassEdit overrides={overrides} setOverrides={update} editDrawer={EditDrawer} />}
      {tab === 'content' && <SiteContent />}
      {tab === 'site' && <SiteImages />}
    </div>
  );
}

// ─────────────────────────────────────────────────── Root app ────
export default function AdminApp() {
  // undefined = still resolving auth state, null = signed out, object = signed in.
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      // Demo mode: restore the localStorage session.
      const saved = localStorage.getItem(SESSION_KEY);
      setUser(saved ? { email: saved, demo: true } : null);
      return;
    }
    // Firebase Auth drives the session; persists across reloads.
    return subscribeAuth(setUser);
  }, []);

  if (user === undefined) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.muted, fontFamily: T.sans, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading…</div>;
  }
  if (!user) {
    return <Login onDemoLogin={(u) => { localStorage.setItem(SESSION_KEY, u); setUser({ email: u, demo: true }); }} />;
  }
  const onLogout = async () => {
    if (FIREBASE_ENABLED) { await signOutUser(); }
    else { localStorage.removeItem(SESSION_KEY); setUser(null); }
  };
  return <Console user={user.email || 'studio'} onLogout={onLogout} />;
}
