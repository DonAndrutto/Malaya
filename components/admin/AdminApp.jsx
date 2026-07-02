'use client';

import { useState, useEffect } from 'react';
import { T, ghostBtn } from './theme';
import { saveOverrides, subscribeOverrides } from '@/lib/overrides';
import { FIREBASE_ENABLED } from '@/lib/firebase';
import { signIn, signOutUser, subscribeAuth, friendlyAuthError } from '@/lib/auth';
import Inventory from './Inventory';
import SiteContent from './SiteContent';
import SiteImages from './SiteImages';
import BlogAdmin from './BlogAdmin';

const SESSION_KEY = 'malaya:admin:session';

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

// ─────────────────────────────────────────────────── Console (shell with tabs) ────
function Console({ user, onLogout }) {
  const [tab, setTab] = useState('inventory');
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    // A /admin?edit=<id> deep-link (e.g. "Edit in admin" from a product page)
    // always lands on the Inventory list so the item's editor can open.
    const editParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('edit');
    if (editParam) {
      setTab('inventory');
    } else {
      const saved = localStorage.getItem('malaya:admin:tab');
      // The old "ledger", "catalogue" and "mass edit" tabs are now one unified
      // Inventory list.
      if (saved) setTab(['ledger', 'catalogue', 'massedit'].includes(saved) ? 'inventory' : saved);
    }
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

  const TABS = [['inventory', 'Inventory'], ['content', 'Content'], ['site', 'Site images'], ['blog', 'Blog']];
  const tabBtn = (active) => ({ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', padding: '6px 2px', color: active ? T.ink : T.muted, borderBottom: `2px solid ${active ? T.accent : 'transparent'}` });

  return (
    <div className="malaya-admin" style={{ minHeight: '100vh', background: T.bg }}>
      <header className="adm-header" style={{ position: 'sticky', top: 0, zIndex: 30, minHeight: 56, boxSizing: 'border-box', background: T.panel, borderBottom: `1px solid ${T.line2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 28px', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.serif, fontSize: 23, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.ink }}>Malaya</span>
          <nav style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {TABS.map(([k, lbl]) => <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{lbl}</button>)}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="https://malayajewellery.com" target="_blank" rel="noreferrer" style={{ ...ghostBtn(), textDecoration: 'none' }}>View site ↗</a>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', color: T.muted }}>Signed in as <span style={{ color: T.ink }}>{user}</span></span>
          <button onClick={onLogout} style={ghostBtn()}>Log out</button>
        </div>
      </header>

      {tab === 'inventory' && <Inventory overrides={overrides} setOverrides={update} />}
      {tab === 'content' && <SiteContent />}
      {tab === 'site' && <SiteImages />}
      {tab === 'blog' && <BlogAdmin />}
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
