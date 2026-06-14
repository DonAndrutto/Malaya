'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site Images admin tab — upload/replace the website's non-product imagery
// (logo, hero slideshow, category tiles, banners, Tashi portrait). Images go to
// Firebase Storage; their URLs are saved to Firestore (siteSettings/images) and
// read live by the storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { T, ghostBtn } from './theme';
import { siteImg, HOME_HERO, HOME_TILES } from '@/lib/data/site-data';
import { subscribeSiteSettings, saveSiteSettings } from '@/lib/site-settings';
import { uploadImage } from '@/lib/upload';
import { FIREBASE_ENABLED } from '@/lib/firebase';

const card = { background: T.panel, border: `1px solid ${T.line}`, padding: 20, marginBottom: 16 };
const thumbBox = { width: 92, height: 92, flexShrink: 0, background: T.card, border: `1px solid ${T.line2}`, overflow: 'hidden' };
const thumbImg = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const headStyle = { fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accent, marginBottom: 4 };
const linkBtn = { background: 'transparent', border: 'none', color: T.danger, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', padding: 0 };

function Thumb({ src }) {
  return <div style={thumbBox}>{src ? <img src={src} alt="" style={thumbImg} onError={(e) => { e.target.style.display = 'none'; }} /> : null}</div>;
}

function PickButton({ label, busy, onFile }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={() => ref.current && ref.current.click()} style={ghostBtn(busy)}>
        {busy ? 'Uploading…' : label}
      </button>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} />
    </>
  );
}

export default function SiteImages() {
  const [settings, setSettings] = useState({});
  const [busy, setBusy] = useState('');
  useEffect(() => subscribeSiteSettings(setSettings), []);

  const apply = (patch) => setSettings((prev) => {
    const next = { ...prev, ...patch };
    saveSiteSettings(next);
    return next;
  });

  const upload = async (key, folder, file, applyUrl) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload site images.'); return; }
    setBusy(key);
    try { applyUrl(await uploadImage(folder, file)); }
    catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(''); }
  };

  // A single-image slot (logo, banner, portrait, …).
  const single = ({ k, label, hint, folder, current, fallback }) => (
    <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', minWidth: 0 }}>
        <Thumb src={current || fallback} />
        <div style={{ minWidth: 0 }}>
          <div style={headStyle}>{label}</div>
          {hint && <div style={{ fontSize: 12, color: T.muted }}>{hint}</div>}
          <div style={{ fontSize: 11, color: current ? T.good : T.faint, marginTop: 4 }}>{current ? 'Custom image set' : 'Using default'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <PickButton label={current ? 'Replace' : 'Upload'} busy={busy === k} onFile={(f) => upload(k, folder, f, (url) => apply({ [k]: url }))} />
        {current && <button onClick={() => apply({ [k]: null })} style={linkBtn}>Reset to default</button>}
      </div>
    </div>
  );

  // Hero slideshow (ordered list).
  const heroList = (settings.heroSlides && settings.heroSlides.length) ? settings.heroSlides : HOME_HERO;
  const usingCustomHero = !!(settings.heroSlides && settings.heroSlides.length);
  const setHero = (arr) => apply({ heroSlides: arr });

  // Home category tiles (keyed by category).
  const tileUrl = (cat) => (settings.homeTiles && settings.homeTiles[cat]) || null;
  const setTile = (cat, url) => apply({ homeTiles: { ...(settings.homeTiles || {}), [cat]: url } });
  const resetTile = (cat) => { const t = { ...(settings.homeTiles || {}) }; delete t[cat]; apply({ homeTiles: t }); };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '30px 28px 80px' }}>
      <h2 style={{ fontFamily: T.serif, fontSize: 30, color: T.ink, margin: '0 0 6px' }}>Site images</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 8px' }}>
        Replace the website&rsquo;s banners, slideshow and logo. Uploads save to Firebase and appear on the live site immediately.
      </p>
      {!FIREBASE_ENABLED && (
        <div style={{ ...card, background: T.card, borderColor: T.danger, color: T.danger, fontSize: 13 }}>
          Firebase is not configured — uploads are disabled. Add the NEXT_PUBLIC_FIREBASE_* env vars to enable them.
        </div>
      )}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Brand</h3>
      {single({ k: 'logo', label: 'Header logo', hint: 'Shown in the site header.', folder: 'site/logo', current: settings.logo, fallback: siteImg('logo.png') })}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Home hero slideshow</h3>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: T.muted }}>{heroList.length} slide{heroList.length === 1 ? '' : 's'} · shown on the home page</div>
          {usingCustomHero && <button onClick={() => apply({ heroSlides: null })} style={linkBtn}>Reset to default</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {heroList.map((src, i) => (
            <div key={src + i} style={{ border: `1px solid ${T.line}`, padding: 10, background: T.card }}>
              <div style={{ aspectRatio: '16 / 9', background: T.bg, border: `1px solid ${T.line}`, overflow: 'hidden', marginBottom: 8 }}>
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <PickButton label="Replace" busy={busy === `hero-${i}`} onFile={(f) => upload(`hero-${i}`, 'site/hero', f, (url) => { const a = heroList.slice(); a[i] = url; setHero(a); })} />
                <button onClick={() => setHero(heroList.filter((_, j) => j !== i))} style={linkBtn}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <PickButton label="Add slide" busy={busy === 'hero-add'} onFile={(f) => upload('hero-add', 'site/hero', f, (url) => setHero([...heroList, url]))} />
        </div>
      </div>

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Home category tiles</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
        {HOME_TILES.map((t) => {
          const cur = tileUrl(t.cat);
          return (
            <div key={t.cat} style={{ border: `1px solid ${T.line}`, padding: 12, background: T.panel }}>
              <div style={{ aspectRatio: '3 / 4', background: T.card, border: `1px solid ${T.line}`, overflow: 'hidden', marginBottom: 10 }}>
                <img src={cur || t.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 8 }}>{t.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <PickButton label={cur ? 'Replace' : 'Upload'} busy={busy === `tile-${t.cat}`} onFile={(f) => upload(`tile-${t.cat}`, 'site/tiles', f, (url) => setTile(t.cat, url))} />
                {cur && <button onClick={() => resetTile(t.cat)} style={linkBtn}>Reset</button>}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Banners &amp; portrait</h3>
      {single({ k: 'homeBanner', label: 'Home “Order Now” banner', hint: 'Full-width banner near the foot of the home page.', folder: 'site/banners', current: settings.homeBanner, fallback: siteImg('banner12.jpg') })}
      {single({ k: 'pageBanner', label: 'Default page banner', hint: 'Breadcrumb banner on Catalogue, Contact, Order, etc.', folder: 'site/banners', current: settings.pageBanner, fallback: siteImg('banner33.jpg') })}
      {single({ k: 'aboutBanner', label: 'About page banner', hint: 'Banner at the top of the About page.', folder: 'site/banners', current: settings.aboutBanner, fallback: siteImg('banner31.jpg') })}
      {single({ k: 'tashiPhoto', label: 'Tashi Mannox portrait', hint: 'Portrait on the Tashi Mannox collaboration page.', folder: 'site/tashi', current: settings.tashiPhoto, fallback: siteImg('Tashi-Mannox.jpg') })}
    </div>
  );
}
