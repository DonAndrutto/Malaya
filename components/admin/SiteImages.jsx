'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Site Images admin tab — upload/replace the website's non-product imagery
// (logo, hero slideshow, banners, Tashi portrait/badge). Images go to Firebase
// Storage; their URLs are saved to Firestore (siteSettings/images) and read
// live by the storefront.
//
// Every upload area previews the slot at the SAME aspect ratio the storefront
// renders it at (see SITE-IMAGES-AUDIT.md), with the recommended pixel size and
// ratio, so what the studio uploads matches what visitors see:
//   • cover-cropped slots (hero, banners) — a cropped preview + draggable focal
//     point, shaped to the real banner ratio.
//   • uncropped slots (logo, badge, portrait) — a "contain" preview showing the
//     whole image exactly as it ships, no focal point.
// The obsolete portrait "Home category tiles" grid has been removed — the
// homepage tiles it fed no longer exist on the storefront.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { T, ghostBtn } from './theme';
import { CATEGORIES } from '@/lib/data/site-data';
import { subscribeSiteSettings, saveSiteSettings } from '@/lib/site-settings';
import { uploadImage } from '@/lib/upload';
import { resizeImageFile } from '@/lib/image-resize';
import { FIREBASE_ENABLED } from '@/lib/firebase';

const card = { background: T.panel, border: `1px solid ${T.line}`, padding: 20, marginBottom: 16 };
const headStyle = { fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.accent, marginBottom: 4 };
const linkBtn = { background: 'transparent', border: 'none', color: T.danger, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', padding: 0 };

// ── Aspect-ratio helpers ──────────────────────────────────────────────────────
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const ratioLabel = (w, h) => { const g = gcd(w, h) || 1; return `${w / g}:${h / g}`; };
const dimsLabel = (w, h) => `${w.toLocaleString()} × ${h.toLocaleString()} px`;

// Small caption: "1920 × 720 px  ·  8:3".
function Spec({ w, h }) {
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>
      <span>{dimsLabel(w, h)}</span>
      <span style={{ padding: '1px 7px', border: `1px solid ${T.line2}`, borderRadius: 2, letterSpacing: '0.06em', color: T.accent, fontWeight: 600 }}>{ratioLabel(w, h)}</span>
    </span>
  );
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

const frameBg = (tone) => (tone === 'brand' ? '#2a2016' : tone === 'light' ? '#fbf7ee' : T.bg);

// Cover-cropped preview with a drag-to-set focal point. Maps the pointer
// position within the frame to a CSS object-position ("x% y%"), which the
// storefront applies to the live banner/hero/tile. `aspect` shapes the frame to
// the slot's real on-site ratio.
function FocalFrame({ url, aspect, pos, onChange }) {
  const frame = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState(pos || 'center');
  useEffect(() => { setLocal(pos || 'center'); }, [pos]);

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
    <>
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
    </>
  );
}

// Preview frame shaped to the slot's true on-site aspect ratio.
//   fit="cover"   — the storefront crops this slot (hero/banner/tile): cropped
//                   preview + draggable focal point.
//   fit="contain" — the storefront shows the whole image (logo/badge/portrait):
//                   contain it so the admin sees exactly what ships, no focal.
// With no image, shows a labelled placeholder at the same ratio.
function SlotPreview({ url, w, h, fit = 'cover', tone, pos, onPos }) {
  const aspect = `${w} / ${h}`;
  const base = { position: 'relative', width: '100%', aspectRatio: aspect, overflow: 'hidden', border: `1px solid ${T.line2}`, background: frameBg(tone) };

  if (!url) {
    return (
      <div style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.faint }}>{ratioLabel(w, h)}</span>
      </div>
    );
  }
  if (fit === 'contain') {
    return (
      <div style={base}>
        <img src={url} alt="" draggable={false} onError={(e) => { e.target.style.display = 'none'; }}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    );
  }
  return <FocalFrame url={url} aspect={aspect} pos={pos} onChange={onPos} />;
}

// ── Slot definitions ──────────────────────────────────────────────────────────
// Each single-image slot, sized to its real on-site render (see the audit).
const BRAND_SLOTS = [
  { k: 'logo', label: 'Header logo', folder: 'site/logo', w: 480, h: 160, fit: 'contain', tone: 'brand', pw: 380,
    hint: 'Shown in the site header on every page, sitting on the brown bar. A transparent PNG keeps its background clear; width can vary — height is scaled to fit.' },
  { k: 'tashiBadge', label: 'Tashi Mannox badge', folder: 'site/tashi', w: 240, h: 240, fit: 'contain', tone: 'light', pw: 200,
    hint: 'Corner badge on collaboration pieces (catalogue cards & product pages). Transparent PNG recommended.' },
];

const BANNER_SLOTS = [
  { k: 'homeBanner', label: 'Home “Order Now” banner', folder: 'site/banners', w: 1920, h: 720, fit: 'cover', focal: true, pw: 620,
    hint: 'Full-width band near the foot of the home page, reused as the “Order Now” banner on every product page.' },
  { k: 'pageBanner', label: 'Default page banner', folder: 'site/banners', w: 1920, h: 480, fit: 'cover', focal: true, pw: 620,
    hint: 'Breadcrumb banner on Contact, Order and Tashi Mannox, and the fallback for any page/category without its own banner.' },
  { k: 'aboutBanner', label: 'About page banner', folder: 'site/banners', w: 1920, h: 480, fit: 'cover', focal: true, pw: 620,
    hint: 'Breadcrumb banner at the top of the About page.' },
  { k: 'tashiPhoto', label: 'Tashi Mannox portrait', folder: 'site/tashi', w: 1000, h: 1200, fit: 'contain', tone: 'light', pw: 300,
    hint: 'Portrait on the Tashi Mannox collaboration page. Shown uncropped at its own proportions.' },
];

// Home hero slide — full-width home slideshow.
const HERO_SPEC = { w: 2400, h: 1350 };
// Per-category breadcrumb banner atop each product page.
const CAT_SPEC = { w: 1920, h: 480 };

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

  // A single-image slot (logo, banner, portrait, …). The preview frame is sized
  // to the slot's real on-site aspect ratio, with the recommended dimensions.
  const single = (s) => {
    const current = settings[s.k] || null;
    return (
      <div style={card} key={s.k}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={headStyle}>{s.label}</div>
          <Spec w={s.w} h={s.h} />
        </div>
        {s.hint && <div style={{ fontSize: 12, color: T.muted, margin: '2px 0 12px' }}>{s.hint}</div>}
        <div style={{ maxWidth: s.pw }}>
          <SlotPreview url={current} w={s.w} h={s.h} fit={s.fit} tone={s.tone}
            pos={posOf(current)} onPos={(v) => setPos(current, v)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ fontSize: 11, color: current ? T.good : T.faint }}>{current ? 'Custom image set' : 'Using default'}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {current && <button onClick={() => apply({ [s.k]: null })} style={linkBtn}>Reset to default</button>}
            <PickButton label={current ? 'Replace' : 'Upload'} busy={busy === s.k} onFile={(f) => upload(s.k, s.folder, f, (url) => apply({ [s.k]: url }))} />
          </div>
        </div>
      </div>
    );
  };

  // Hero slideshow (ordered list).
  const heroList = Array.isArray(settings.heroSlides) ? settings.heroSlides : [];
  const usingCustomHero = heroList.length > 0;
  const setHero = (arr) => apply({ heroSlides: arr });

  // Per-category product-page banners (keyed by category). Shown atop every
  // /product/<id> page of that category; falls back to the default page banner.
  const catBanner = (cat) => (settings.categoryBanners && settings.categoryBanners[cat]) || null;
  const setCatBanner = (cat, url) => apply({ categoryBanners: { ...(settings.categoryBanners || {}), [cat]: url } });
  const resetCatBanner = (cat) => { const t = { ...(settings.categoryBanners || {}) }; delete t[cat]; apply({ categoryBanners: t }); };
  const defaultBanner = settings.pageBanner || null;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '30px 28px 80px' }}>
      <h2 style={{ fontFamily: T.serif, fontSize: 30, color: T.ink, margin: '0 0 6px' }}>Site images</h2>
      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 8px' }}>
        Replace the website&rsquo;s banners, slideshow, logo and portrait. Each preview matches the shape the image is shown at on the live site — upload at (or above) the recommended size for a crisp, correctly-cropped result. Uploads save to Firebase and appear on the live site immediately.
      </p>
      {!FIREBASE_ENABLED && (
        <div style={{ ...card, background: T.card, borderColor: T.danger, color: T.danger, fontSize: 13 }}>
          Firebase is not configured — uploads are disabled. Add the NEXT_PUBLIC_FIREBASE_* env vars to enable them.
        </div>
      )}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Brand</h3>
      {BRAND_SLOTS.map(single)}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Home hero slideshow</h3>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: T.muted }}>Each slide fills the full-width home hero.</div>
          <Spec w={HERO_SPEC.w} h={HERO_SPEC.h} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '10px 0 14px' }}>
          <div style={{ fontSize: 12, color: T.muted }}>{heroList.length} slide{heroList.length === 1 ? '' : 's'}</div>
          {usingCustomHero && <button onClick={() => apply({ heroSlides: null })} style={linkBtn}>Reset to default</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {heroList.map((src, i) => (
            <div key={src + i} style={{ border: `1px solid ${T.line}`, padding: 10, background: T.card }}>
              <SlotPreview url={src} w={HERO_SPEC.w} h={HERO_SPEC.h} fit="cover" pos={posOf(src)} onPos={(v) => setPos(src, v)} />
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

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Banners &amp; portrait</h3>
      {BANNER_SLOTS.map(single)}

      <h3 style={{ ...headStyle, marginTop: 24, color: T.muted }}>Category product-page banners</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <p style={{ fontSize: 12, color: T.muted, margin: 0, maxWidth: 560 }}>
          Each category shows its own banner at the top of every product page in that category (e.g. /product/N024-S). Categories without a banner use the default page banner above.
        </p>
        <Spec w={CAT_SPEC.w} h={CAT_SPEC.h} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14, marginBottom: 16 }}>
        {CATEGORIES.map((cat) => {
          const cur = catBanner(cat);
          const preview = cur || defaultBanner;
          return (
            <div key={cat} style={{ border: `1px solid ${T.line}`, padding: 12, background: T.panel }}>
              <SlotPreview url={preview} w={CAT_SPEC.w} h={CAT_SPEC.h} fit="cover" pos={posOf(preview)} onPos={(v) => setPos(preview, v)} />
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
