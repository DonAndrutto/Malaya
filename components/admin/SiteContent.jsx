'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site Content admin tab — edit every real piece of page copy and every external
// link (hero/about/tashi/footer text, contact details, social URLs, …). Saves a
// partial nested patch to Firestore (siteSettings/content via lib/site-content.js);
// empty fields fall back to the studio defaults (lib/data/site-data CONTENT_DEFAULTS),
// so clearing a field resets it. Read live by the storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
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
    ['Tashi Mannox', ['nav', 'tashi'], 'text'],
    ['Contact', ['nav', 'contact'], 'text'],
    ['About', ['nav', 'about'], 'text'],
    ['Instagram (nav label)', ['nav', 'instagram'], 'text'],
  ]],
  ['Home tiles & banner', [
    ['Rings tile', ['home', 'tiles', 'Rings'], 'text'],
    ['Bracelets tile', ['home', 'tiles', 'Bracelets'], 'text'],
    ['Earrings tile', ['home', 'tiles', 'Earrings'], 'text'],
    ['Pendants tile', ['home', 'tiles', 'Pendants'], 'text'],
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
    ['Figure caption', ['about', 'caption'], 'text'],
    ['Body — blank line between paragraphs', ['about', 'body'], 'paras'],
  ]],
  ['Tashi Mannox page', [
    ['Kicker', ['tashi', 'kicker'], 'text'],
    ['Name', ['tashi', 'name'], 'text'],
    ['Role', ['tashi', 'role'], 'text'],
    ['Intro — blank line between paragraphs', ['tashi', 'intro'], 'paras'],
    ['Products section title', ['tashi', 'productsTitle'], 'text'],
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

export default function SiteContent() {
  const [saved, setSaved] = useState({});
  const [toast, setToast] = useState('');
  useEffect(() => subscribeSiteContent(setSaved), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t); }, [toast]);

  const set = (path, value) => setSaved((prev) => { const next = setAt(prev, path, value); saveSiteContent(next); return next; });

  const Field = ([label, path, type]) => {
    const cur = getAt(saved, path);
    const edited = cur !== undefined && cur !== '';
    const ph = defaultText(path, type);
    const multiline = type === 'area' || type === 'paras' || type === 'lines';
    const rows = type === 'paras' ? 6 : (type === 'lines' ? 3 : 2);
    return (
      <div key={path.join('.')} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle}>{label}{edited ? ' ·' : ''}</label>
          {edited && <button onClick={() => set(path, '')} style={resetBtn} title="Reset to default">reset</button>}
        </div>
        {multiline
          ? <textarea value={cur || ''} placeholder={ph} rows={rows} onChange={(e) => set(path, e.target.value)} style={{ ...fieldStyle(edited), resize: 'vertical', lineHeight: 1.6 }} />
          : <input value={cur || ''} placeholder={ph} onChange={(e) => set(path, e.target.value)} style={fieldStyle(edited)} />}
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
        Edit the website&rsquo;s text and links. Changes save automatically and appear on the live site immediately; clear a field to restore its original wording.
      </p>
      {SECTIONS.map(([title, fields]) => (
        <div key={title} style={card}>
          <h3 style={headStyle}>{title}</h3>
          {fields.map(Field)}
        </div>
      ))}
      {toast && <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: T.ink, color: T.panel, padding: '12px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{toast}</div>}
    </div>
  );
}
