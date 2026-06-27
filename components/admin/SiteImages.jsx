'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site Images admin tab — upload/replace the website's non-product imagery
// (logo, hero slideshow, category tiles, banners, Tashi portrait). Images go to
// Firebase Storage; their URLs are saved to Firestore (siteSettings/images) and
// read live by the storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { T, ghostBtn } from './theme';
import { siteImg, HOME_HERO, HOME_TILES, CATEGORIES } from '@/lib/data/site-data';
import { subscribeSiteSettings, saveSiteSettings } from '@/lib/site-settings';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';

// Built-in fallback image for the original category tiles (Rings, Bracelets, …).
const TILE_DEFAULTS = Object.fromEntries(HOME_TILES.map((t) => [t.cat, t.img]));

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

// Drag-to-set focal point for a cover-cropped image. Maps the pointer position
// within the preview frame to a CSS object-position ("x% y%"), which the
// storefront applies to the live banner/hero/tile. `aspect` shapes the preview.
function FocalPicker({ url, aspect, pos, onChange }) {
  const frame = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState(pos || 'center');
  useEffect(() => { setLocal(pos || 'center'); }, [pos]);
  if (!url) return null;

  const objPos = local === 'center' ? '50% 50%' : local;
  const [hx, hy] = objPos.split(' ').map((v) => parseFloat(v));
  const at = (clientX, clientY) => {
    const el = frame.current; if (!el) return local;
    const r = el.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)));
    const v = `${x}% ${y}%`;
    setLocal(v);
    return v;
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div ref={frame}
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); at(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging) at(e.clientX, e.clientY); }}
        onPointerUp={(e) => { setDragging(false); onChange(at(e.clientX, e.clientY)); }}
        style={{ position: 'relative', width: '100%', aspectRatio: aspect, overflow: 'hidden', cursor: 'move', border: `1px solid ${T.line2}`, background: T.bg, touchAction: 'none', userSelect: 'none' }}>
        <img src={url} alt="" draggable={false} onError={(e) => { e.target.style.display = 'none'; }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: objPos, display: 'block', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', left: `${hx}%`, top: `${hy}%`, width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.45)', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: T.faint }}>Drag to reposition · {local === 'center' ? 'centred' : local}</span>
        {local !== 'center' && <button onClick={() => { setLocal('center'); onChange('center'); }} style={linkBtn}>Reset position</button>}
      </div>
    </div>
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

  // Focal point ("x% y%") per image URL, applied by the storefront to cover-cropped slots.
  const posOf = (url) => (settings.imgPos && settings.imgPos[url]) || 'center';
  const setPos = (url, value) => apply({ imgPos: { ...(settings.imgPos || {}), [url]: value } });

  const upload = async (key, folder, file, applyUrl) => {
    if (!FIREBASE_ENABLED) { alert('Connect Firebase to upload site images.'); return; }
    setBusy(key);
    try { applyUrl(await uploadImage(folder, await resizeImageFile(file))); }
    catch (e) { alert('Upload failed: ' + (e && e.message ? e.message : String(e))); }
    finally { setBusy(''); }
  };

  // A single-image slot (logo, banner, portrait, …).
  const single = ({ k, label, hint, folder, current, fallback, focal }) => (
    <div style={card}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
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
      {focal && current && <FocalPicker url={current} aspect={focal} pos={posOf(current)} onChange={(v) => setPos(current, v)} />}
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

  // Per-category product-page banners (keyed by category). Shown atop every
  // /product/<id> page of that category; falls back to the default page banner.
  const catBanner = (cat) => (settings.categoryBanners && settings.categoryBanners[cat]) || null;
  const setCatBanner = (cat, url) => apply({ categoryBanners: { ...(settings.categoryBanners || {}), [cat]: url } });
  const resetCatBanner = (cat) => { const t = { ...(settings.categoryBanners || {}) }; delete t[cat]; apply({ categoryBanners: t }); };
  const defaultBanner = settings.pageBanner || siteImg('banner33.jpg');

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
      {single({ k: 'logo', label: 'Header logo', hint: 'Shown in the site header. A transparent PNG keeps its transparency.', folder: 'site/logo', current: settings.logo, fallback: siteImg('logo.png') })}
      {single({ k: 'tashiBadge', label: 'Tashi Mannox badge', hint: 'Corner badge on collaboration pieces (catalogue cards & product pages). Transparent PNG recommended.', folder: 'site/tashi', current: settings.tashiBadge, fallback: siteImg('tashi.jpg') })}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Home hero slideshow</h3>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: T.muted }}>{heroList.length} slide{heroList.length === 1 ? '' : 's'} · shown on the home page</div>
          {usingCustomHero && <button onClick={() => apply({ heroSlides: null })} style={linkBtn}>Reset to default</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          {heroList.map((src, i) => (
            <div key={src + i} style={{ border: `1px solid ${T.line}`, padding: 10, background: T.card }}>
              <FocalPicker url={src} aspect="16 / 9" pos={posOf(src)} onChange={(v) => setPos(src, v)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
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
      <p style={{ fontSize: 12, color: T.muted, margin: '0 0 12px' }}>
        One image per category, reused as the &ldquo;Explore&rdquo; tile at the foot of every product page in that category.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
        {CATEGORIES.map((cat) => {
          const cur = tileUrl(cat);
          const preview = cur || TILE_DEFAULTS[cat] || null;
          return (
            <div key={cat} style={{ border: `1px solid ${T.line}`, padding: 12, background: T.panel }}>
              <FocalPicker url={preview} aspect="3 / 4" pos={posOf(preview)} onChange={(v) => setPos(preview, v)} />
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, margin: '10px 0 4px' }}>{cat}</div>
              <div style={{ fontSize: 10.5, color: cur ? T.good : T.faint, marginBottom: 8 }}>{cur ? 'Custom image set' : (TILE_DEFAULTS[cat] ? 'Using default' : 'No image yet')}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <PickButton label={cur ? 'Replace' : 'Upload'} busy={busy === `tile-${cat}`} onFile={(f) => upload(`tile-${cat}`, 'site/tiles', f, (url) => setTile(cat, url))} />
                {cur && <button onClick={() => resetTile(cat)} style={linkBtn}>Reset</button>}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Banners &amp; portrait</h3>
      {single({ k: 'homeBanner', label: 'Home “Order Now” banner', hint: 'Full-width banner near the foot of the home page.', folder: 'site/banners', current: settings.homeBanner, fallback: siteImg('banner12.jpg'), focal: '3 / 1' })}
      {single({ k: 'pageBanner', label: 'Default page banner', hint: 'Breadcrumb banner on Contact, Order, and any category without its own banner.', folder: 'site/banners', current: settings.pageBanner, fallback: siteImg('banner33.jpg'), focal: '3 / 1' })}
      {single({ k: 'aboutBanner', label: 'About page banner', hint: 'Banner at the top of the About page.', folder: 'site/banners', current: settings.aboutBanner, fallback: siteImg('banner31.jpg'), focal: '3 / 1' })}
      {single({ k: 'tashiPhoto', label: 'Tashi Mannox portrait', hint: 'Portrait on the Tashi Mannox collaboration page.', folder: 'site/tashi', current: settings.tashiPhoto, fallback: siteImg('Tashi-Mannox.jpg') })}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Category product-page banners</h3>
      <p style={{ fontSize: 12, color: T.muted, margin: '0 0 12px' }}>
        Each category shows its own banner at the top of every product page (e.g. /product/N024-S). Categories without a banner use the default page banner above.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14, marginBottom: 16 }}>
        {CATEGORIES.map((cat) => {
          const cur = catBanner(cat);
          return (
            <div key={cat} style={{ border: `1px solid ${T.line}`, padding: 12, background: T.panel }}>
              <FocalPicker url={cur || defaultBanner} aspect="3 / 1" pos={posOf(cur || defaultBanner)} onChange={(v) => setPos(cur || defaultBanner, v)} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '10px 0 0' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{cat}</div>
                  <div style={{ fontSize: 10.5, color: cur ? T.good : T.faint }}>{cur ? 'Custom banner set' : 'Using default'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <PickButton label={cur ? 'Replace' : 'Upload'} busy={busy === `catban-${cat}`} onFile={(f) => upload(`catban-${cat}`, 'site/banners', f, (url) => setCatBanner(cat, url))} />
                  {cur && <button onClick={() => resetCatBanner(cat)} style={linkBtn}>Reset</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
