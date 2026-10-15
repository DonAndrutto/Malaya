'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site Content admin tab — edit every real piece of page copy and every external
// link (hero/about/tashi/footer text, contact details, social URLs, …). Saves a
// partial nested patch to Firestore (siteSettings/content via lib/site-content.js);
// empty fields fall back to the studio defaults (lib/data/site-data CONTENT_DEFAULTS),
// so clearing a field resets it. Read live by the storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { T } from './theme';
import { CONTENT_DEFAULTS, whatsappUrlFor } from '@/lib/data/site-data';
import { subscribeSiteContent, saveSiteContent } from '@/lib/site-content';

const card = { background: T.panel, border: `1px solid ${T.line}`, padding: '18px 20px', marginBottom: 16 };
const headStyle = { fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accent, margin: '0 0 14px' };
const labelStyle = { fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted, marginBottom: 6, display: 'block' };
const fieldStyle = (edited) => ({ width: '100%', background: T.card, border: `1px solid ${edited ? T.accent : T.line2}`, color: T.ink, padding: '10px 12px', fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' });
const resetBtn = { background: 'transparent', border: 'none', color: T.faint, fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer', padding: 0 };

// Editable sections → [label, path, type]. type: text | area | paras | lines.
const SECTIONS = [
  ['Brand & Hero', [
    ['Hero title', ['hero', 'title'], 'text'],
    ['Hero subtitle', ['hero', 'subtitle'], 'text'],
    ['Hero button', ['hero', 'cta'], 'text'],
    ['Home section title', ['home', 'sectionTitle'], 'text'],
  ]],
  ['Navigation labels', [
    ['Home', ['nav', 'home'], 'text'],
    ['Catalogue', ['nav', 'catalogue'], 'text'],
    ['Explore', ['nav', 'explore'], 'text'],
    ['Tashi Mannox', ['nav', 'tashi'], 'text'],
    ['Blog', ['nav', 'blog'], 'text'],
    ['Contact', ['nav', 'contact'], 'text'],
    ['About', ['nav', 'about'], 'text'],
  ]],
  ['Home banner', [
    ['Order-now banner title', ['home', 'bannerTitle'], 'text'],
    ['Order-now banner button', ['home', 'bannerCta'], 'text'],
  ]],
  ['Page banners', [
    ['Catalogue subtitle', ['banners', 'catalogueSubtitle'], 'text'],
    ['About title', ['banners', 'about', 'title'], 'text'],
    ['About subtitle', ['banners', 'about', 'subtitle'], 'text'],
    ['Contact title', ['banners', 'contact', 'title'], 'text'],
    ['Contact subtitle', ['banners', 'contact', 'subtitle'], 'text'],
    ['Order title', ['banners', 'order', 'title'], 'text'],
    ['Order subtitle', ['banners', 'order', 'subtitle'], 'text'],
    ['Tashi title', ['banners', 'tashi', 'title'], 'text'],
    ['Tashi subtitle', ['banners', 'tashi', 'subtitle'], 'text'],
  ]],
  ['About page', [
    ['Date', ['about', 'date'], 'text'],
    ['Heading', ['about', 'title'], 'text'],
    ['Lead paragraph', ['about', 'lead'], 'area'],
    ['Attribution', ['about', 'from'], 'text'],
    ['Body — blank line between paragraphs', ['about', 'body'], 'paras'],
  ]],
  ['Tashi Mannox page', [
    ['Kicker', ['tashi', 'kicker'], 'text'],
    ['Name', ['tashi', 'name'], 'text'],
    ['Role', ['tashi', 'role'], 'text'],
    ['Intro — blank line between paragraphs', ['tashi', 'intro'], 'paras'],
    ['Products section title', ['tashi', 'productsTitle'], 'text'],
  ]],
  ['Product page', [
    ['Default credit line — shown on items without their own Story', ['product', 'credit'], 'area'],
  ]],
  ['Mega-menu promo', [
    ['Title', ['mega', 'promoTitle'], 'text'],
    ['Description', ['mega', 'promoDesc'], 'area'],
    ['Button', ['mega', 'promoCta'], 'text'],
  ]],
  ['Footer', [
    ['Contact strip', ['footer', 'contactStrip'], 'text'],
    ['Follow note', ['footer', 'followNote'], 'text'],
    ['Copyright', ['footer', 'copyright'], 'text'],
    ['Location', ['footer', 'location'], 'text'],
  ]],
  ['Contact & social', [
    ['Address — one line each', ['contact', 'address'], 'lines'],
    ['WhatsApp numbers — one per line', ['contact', 'whatsapp'], 'lines'],
    ['Email', ['contact', 'email'], 'text'],
    ['Facebook URL', ['contact', 'facebook'], 'text'],
    ['Instagram URL', ['contact', 'instagram'], 'text'],
    ['Pinterest URL', ['contact', 'pinterest'], 'text'],
    ['Linktree URL', ['contact', 'linktree'], 'text'],
  ]],
  ['Legal pages', [
    ['Privacy Policy — title', ['legal', 'privacy', 'title'], 'text'],
    ['Privacy Policy — body (blank line between paragraphs)', ['legal', 'privacy', 'body'], 'paras'],
    ['Terms and Conditions — title', ['legal', 'terms', 'title'], 'text'],
    ['Terms and Conditions — body (blank line between paragraphs)', ['legal', 'terms', 'body'], 'paras'],
    ['Cookie Policy — title', ['legal', 'cookie', 'title'], 'text'],
    ['Cookie Policy — body (blank line between paragraphs)', ['legal', 'cookie', 'body'], 'paras'],
    ['Refund Policy — title', ['legal', 'refund', 'title'], 'text'],
    ['Refund Policy — body (blank line between paragraphs)', ['legal', 'refund', 'body'], 'paras'],
  ]],
];

const getAt = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setAt(obj, path, value) {
  const next = { ...obj };
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) { const k = path[i]; cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; }
  const last = path[path.length - 1];
  if (value === '' || value == null) delete cur[last]; else cur[last] = value;
  return next;
}
function defaultText(path, type) {
  const d = getAt(CONTENT_DEFAULTS, path);
  if (Array.isArray(d)) return d.join(type === 'lines' ? '\n' : '\n\n');
  return d == null ? '' : String(d);
}

export default function SiteContent({ user = 'studio', onPendingChange = () => {} }) {
  const [draft, setDraft] = useState({});
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const latest = useRef({});
  const edits = useRef({});
  const saving = useRef(false);
  const draftOwner = useRef(null);
  const draftRevision = useRef(0);
  const key = `malaya:content-draft:${user}`;
  const dirty = Object.keys(edits.current).length > 0;

  useEffect(() => {
    // Session-scoped recovery survives reload, auth interruption and tab changes.
    try {
      const recovered = JSON.parse(sessionStorage.getItem(key));
      // Accept drafts stored by the first explicit-Save implementation too.
      edits.current = (recovered?.schema === 1 ? recovered.edits : recovered) || {};
    } catch {}
    return subscribeSiteContent((published) => {
      latest.current = published;
      if (saving.current) return;
      let next = published;
      Object.entries(edits.current).forEach(([path, value]) => { next = setAt(next, path.split('.'), value); });
      setDraft(next);
      setStatus(Object.keys(edits.current).length ? 'pending' : 'idle');
    });
  }, [key]);

  useEffect(() => {
    onPendingChange(dirty || status === 'saving');
    const beforeUnload = (event) => {
      if (!Object.keys(edits.current).length && !saving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); onPendingChange(false); };
  }, [dirty, status, onPendingChange]);

  const set = (path, value) => {
    if (saving.current) return;
    const id = path.join('.');
    if ((getAt(latest.current, path) || '') === value) delete edits.current[id];
    else edits.current[id] = value;
    if (!draftOwner.current) draftOwner.current = `${Date.now()}-${Math.random()}`;
    draftRevision.current += 1;
    try {
      sessionStorage.setItem(key, JSON.stringify({ schema: 1, owner: draftOwner.current, revision: draftRevision.current, edits: edits.current }));
    } catch {}
    setDraft((prev) => setAt(prev, path, value));
    setError('');
    setStatus('pending');
  };

  const save = async () => {
    if (saving.current || !Object.keys(edits.current).length) return;
    saving.current = true;
    setStatus('saving');
    setError('');
    // Only this exact recovery revision belongs to this save. A remounted
    // editor can create a newer revision before this request acknowledges.
    let submittedDraft = null;
    try { submittedDraft = sessionStorage.getItem(key); } catch {}
    // Preserve remote changes to untouched fields received while editing.
    let next = latest.current;
    Object.entries(edits.current).forEach(([path, value]) => { next = setAt(next, path.split('.'), value); });
    try {
      await saveSiteContent(next);
      latest.current = next;
      edits.current = {};
      try {
        if (submittedDraft !== null && sessionStorage.getItem(key) === submittedDraft) sessionStorage.removeItem(key);
      } catch {}
      setDraft(next);
      setStatus('success');
    } catch (err) {
      setError('Save failed. Your draft is kept in this tab. Check your connection and retry.');
      setStatus('error');
    } finally { saving.current = false; }
  };

  const discard = () => {
    if (!window.confirm('Discard unsaved site content changes?')) return;
    edits.current = {};
    try { sessionStorage.removeItem(key); } catch {}
    setDraft(latest.current);
    setError('');
    setStatus('idle');
  };

  const Field = ([label, path, type]) => {
    const cur = getAt(draft, path);
    const edited = cur !== undefined && cur !== '';
    const ph = defaultText(path, type);
    const multiline = type === 'area' || type === 'paras' || type === 'lines';
    const rows = type === 'paras' ? 6 : (type === 'lines' ? 3 : 2);
    return (
      <div key={path.join('.')} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label htmlFor={`content-${path.join("-")}`} style={labelStyle}>{label}{edited ? ' ·' : ''}</label>
          {edited && <button onClick={() => set(path, '')} style={resetBtn} title="Reset to default">reset</button>}
        </div>
        {multiline
          ? <textarea id={`content-${path.join("-")}`} disabled={status === 'saving' || status === 'loading'} value={cur || ''} placeholder={ph} rows={rows} onChange={(e) => set(path, e.target.value)} style={{ ...fieldStyle(edited), resize: 'vertical', lineHeight: 1.6 }} />
          : <input id={`content-${path.join("-")}`} disabled={status === 'saving' || status === 'loading'} value={cur || ''} placeholder={ph} onChange={(e) => set(path, e.target.value)} style={fieldStyle(edited)} />}
        {path[0] === 'contact' && path[1] === 'whatsapp' && (
          <div style={{ fontSize: 10.5, color: T.faint, marginTop: 5 }}>One number per line — each gets its own chat link. The first is used for one-tap links: {whatsappUrlFor((cur || ph).split('\n')[0]).split('&')[0]}…</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '30px 28px 80px' }}>
      <h2 style={{ fontFamily: T.serif, fontSize: 30, color: T.ink, margin: '0 0 6px' }}>Site content</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 20px' }}>
        Edit the website&rsquo;s text and links. Choose Save to publish your changes; clear a field to restore its original wording.
      </p>
      <div style={{ ...card, position: 'sticky', top: 72, zIndex: 20 }}>
        <button onClick={save} disabled={!dirty || status === 'saving' || status === 'loading'} style={{ ...fieldStyle(true), width: 'auto', cursor: 'pointer' }}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button>
        <button onClick={discard} disabled={!dirty || status === 'saving'} style={{ ...resetBtn, marginLeft: 20 }}>Discard draft</button>
        <p role={error ? 'alert' : 'status'} aria-live="polite" style={{ color: error ? T.danger : T.muted, marginBottom: 0 }}>
          {error || (status === 'loading' ? 'Loading…' : status === 'saving' ? 'Waiting for save confirmation…' : dirty ? 'Unsaved changes — draft kept in this tab.' : status === 'success' ? 'Saved. Storefront refresh requested.' : 'All changes saved.')}
        </p>
      </div>
      {SECTIONS.map(([title, fields]) => (
        <div key={title} style={card}>
          <h3 style={headStyle}>{title}</h3>
          {fields.map(Field)}
        </div>
      ))}

    </div>
  );
}
