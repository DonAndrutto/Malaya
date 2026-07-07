'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell for the Malaya storefront: header (logo + centred nav + cart),
// footer, product card, page banner, and image-with-fallback.
// Navigation uses the Next.js App Router (next/link + usePathname).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { fmtPrice, posFor, bgImage } from '@/lib/data/site-data';
import { useCart, removeFromCart, cartTotal, useSiteData, useAddedNotice } from './store';
import { Reveal } from './reveal';

// ── Inline icons (crisp at any size, no extra image assets) ──────────────────
export function BasketIcon({ size = 21 }) {
  return (
    <svg className="hdr-icon-svg" viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h16l-1.1 11.1a2 2 0 0 1-2 1.9H7.1a2 2 0 0 1-2-1.9L4 8z" />
      <path d="M8.5 8 12 3l3.5 5" />
      <path d="M9 11.5v4M15 11.5v4" />
    </svg>
  );
}

export function SocialIcon({ name, size = 18 }) {
  if (name === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M13.5 21v-7h2.4l.4-2.9h-2.8V9.27c0-.84.24-1.42 1.45-1.42l1.45-.01V5.13a20.7 20.7 0 0 0-2.12-.11c-2.1 0-3.54 1.28-3.54 3.64v2.05H8.3V14h2.4v7h2.8z" />
      </svg>
    );
  }
  if (name === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.6" />
        <circle cx="12" cy="12" r="3.7" />
        <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (name === 'pinterest') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.748-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.987C24.007 5.367 18.641.001 12.017.001z" />
      </svg>
    );
  }
  if (name === 'linktree') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M13.736 5.853l4.005-4.117 2.325 2.38-4.2 4.005h5.908v3.305h-5.937l4.229 4.108-2.325 2.334-5.74-5.769-5.741 5.769-2.325-2.334 4.229-4.108H2.226V8.121h5.909l-4.2-4.005 2.324-2.38 4.005 4.117V0h3.472zM10.264 18.715h3.472V24h-3.472z" />
      </svg>
    );
  }
  // whatsapp
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.53 15.2L2 22l4.92-1.27A10 10 0 1 0 12 2zm0 1.83a8.17 8.17 0 0 1 6.9 12.55l-.2.32.6 2.18-2.24-.59-.31.18A8.17 8.17 0 1 1 12 3.83zM8.9 7.6c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.2.87 2.35 1 2.51.12.16 1.7 2.7 4.18 3.68 2.06.81 2.48.65 2.93.6.45-.04 1.43-.58 1.63-1.15.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.63-1.2-1.42-1.34-1.66-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41z" />
    </svg>
  );
}

// Brand-coloured social row used in the footer and on the Contact page. Reads the
// admin-editable links from site content; the Linktree icon shows a hover tooltip.
export function SocialLinks() {
  const { content } = useSiteData();
  const ct = content.contact;
  const links = [
    { name: 'facebook', url: ct.facebook, label: 'Malaya Jewellery on Facebook' },
    { name: 'instagram', url: ct.instagram, label: 'Malaya Jewellery on Instagram' },
    { name: 'whatsapp', url: ct.whatsappUrl, label: 'Chat on WhatsApp' },
    { name: 'pinterest', url: ct.pinterest, label: 'Malaya Jewellery on Pinterest' },
    { name: 'linktree', url: ct.linktree, label: 'All Links to Social Media', tip: true },
  ].filter((l) => l.url);
  return (
    <div className="ftr-social">
      {links.map((l) => (
        <a key={l.name} className={'soc soc-' + l.name + (l.tip ? ' soc-tip' : '')}
          href={l.url} target="_blank" rel="noreferrer" title={l.label} aria-label={l.label}
          data-tip={l.tip ? l.label : undefined}>
          <SocialIcon name={l.name} size={20} />
        </a>
      ))}
    </div>
  );
}

// ── Image (Firebase-hosted) ──────────────────────────────────────────────────
// Renders nothing when there's no src (so a missing photo never produces a
// broken/stray request); hides itself if the image fails to load.
//
// Images are served directly from Firebase Storage — the image optimizer is
// disabled (`images.unoptimized` in next.config.mjs; see IMAGES.md), so the
// file the admin console uploads (already downscaled and byte-budgeted by
// lib/image-resize.js) is exactly what visitors download. next/image is kept
// for what still works without the optimizer: lazy loading by default,
// width/height reserving space so the page doesn't shift while photos load,
// and `priority` (preload + fetchpriority) for above-the-fold imagery (LCP).
// Layout stays CSS-driven exactly as before (the classes size the element).
// Anything from an unknown host (e.g. a hand-pasted external URL in an old
// override) still falls back to a plain lazy <img>.
const NEXT_IMAGE_SRC = /^(\/(?!\/)|https:\/\/firebasestorage\.googleapis\.com\/)/;

export function SiteImg({
  src, alt, style, className,
  sizes = '(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 400px',
  width = 1200, height = 1200, priority = false, quality,
}) {
  if (!src) return null;
  const hide = (e) => { e.currentTarget.style.visibility = 'hidden'; };
  if (!NEXT_IMAGE_SRC.test(src)) {
    return (
      <img
        src={src} alt={alt || ''} loading="lazy" decoding="async"
        className={className} style={style} onError={hide}
      />
    );
  }
  return (
    <Image
      src={src} alt={alt || ''} className={className} style={style}
      width={width} height={height} sizes={sizes} quality={quality}
      priority={priority} onError={hide}
    />
  );
}

// ── Product card — bordered photo, centred name/subtitle (matches live site) ──
export function SiteProductCard({ p }) {
  const { settings } = useSiteData();
  const specials = p.specials || [];
  const onSale = p.onSale || specials.includes('sale') || p.tag === 'sale';
  const isNew = specials.includes('new') || p.tag === 'new';
  const monogram = (p.productionCode || p.salesCode || p.name || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'M';
  return (
    <div className="pcard">
      <Link className="pcard-thumb" href={`/product/${p.id}`}>
        {p.img
          ? <SiteImg src={p.img} alt={p.name} />
          : <span className="pcard-noimg">{monogram}</span>}
        {p.img && p.images && p.images[1] && (
          <SiteImg className="pcard-alt" src={p.images[1]} alt={p.name} />
        )}
        {onSale ? (
          <span className="pcard-label pcard-label-sale">SALE</span>
        ) : isNew ? (
          <span className="pcard-label">NEW</span>
        ) : null}
        {p.tashi && settings.tashiBadge && (
          <SiteImg className="pcard-tashi" src={settings.tashiBadge} alt="Tashi Mannox"
            width={88} height={88} sizes="44px" />
        )}
      </Link>
      <h5 className="pcard-text">
        <Link href={`/product/${p.id}`} className="pcard-name">{p.name}</Link>
        <Link href={`/product/${p.id}`} className="pcard-sub">{p.sub}</Link>
      </h5>
    </div>
  );
}

// ── Page banner (admin-overridable default image via settings.pageBanner) ────
// `category` opts a page into a per-category banner (settings.categoryBanners),
// falling back to the explicit `img`, then the default page banner.
// Two tiers (VISUAL-AUDIT PR B): the default utility band stays slim so
// checkout-register pages keep quiet, while `variant="chapter"` opens the
// editorial routes (About, Tashi, Explore landing, Journal index) with a tall
// header — the subtitle becomes a kicker line above a display-size title, and
// the bottom-weighted scrim protects the text zone only. Same master image at
// a taller crop, so the upgrade costs zero extra bytes (IMAGES.md).
// `plain` drops the photographic banner entirely and shows only the brown
// header gradient (used on product pages, which were over-cluttered with
// banners) with the title tucked into the top-left corner and no subtitle.
// `bannerKey` names a settings slot (e.g. 'exploreBanner') so admin-uploaded
// banners reach pages whose PageBanner is rendered from a server component.
export function PageBanner({ title, subtitle, img, category, variant, bannerKey, plain }) {
  const { settings } = useSiteData();
  const catBanner = category && settings.categoryBanners ? settings.categoryBanners[category] : null;
  const keyed = bannerKey ? settings[bannerKey] : null;
  const bg = plain ? null : (catBanner || img || keyed || settings.pageBanner || null);
  const chapter = variant === 'chapter';
  return (
    <div className={'page-banner' + (chapter ? ' page-banner-chapter' : '') + (plain ? ' page-banner-plain' : '')}
      style={plain ? undefined : { backgroundImage: bgImage(bg), backgroundPosition: posFor(settings, bg) }}>
      <Reveal className="site-container">
        {chapter && subtitle && <span className="page-banner-kicker">{subtitle}</span>}
        <strong className="page-banner-title">{title}</strong>
        {!chapter && !plain && subtitle && <span className="page-banner-sub">{subtitle}</span>}
      </Reveal>
    </div>
  );
}

// ── "Added to your order" notice ─────────────────────────────────────────────
// Mounted once in the store layout. Shows an actionable card when something is
// added to the cart: the item name, a Go-to-basket link, and a close button.
// Auto-dismisses after a few seconds (timer resets on each new add).
export function CartNotice() {
  const [notice, clear] = useAddedNotice();
  const { SITE_BY_ID } = useSiteData();
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(clear, 6000);
    return () => clearTimeout(t);
  }, [notice]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!notice) return null;
  const p = SITE_BY_ID[notice.id];
  const name = (p && p.name) || 'This item';
  return (
    <div className="cart-notice" role="status" aria-live="polite">
      {p && p.img && <SiteImg className="cart-notice-img" src={p.img} alt={name} width={104} height={104} sizes="52px" />}
      <div className="cart-notice-body">
        <span className="cart-notice-text">Added <strong>{name}</strong> to your order</span>
        <Link href="/order" className="cart-notice-basket" onClick={clear}>Go to basket →</Link>
      </div>
      <button type="button" className="cart-notice-x" onClick={clear} aria-label="Dismiss">×</button>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function CartDropdown({ items }) {
  const { SITE_BY_ID } = useSiteData();
  const total = cartTotal(items, SITE_BY_ID);
  return (
    <div className="hdr-drop hdr-drop-cart">
      <h4 className="hdr-drop-head">Items in my order</h4>
      {items.length === 0 ? (
        <p className="hdr-drop-empty">Your order is empty.</p>
      ) : (
        <div className="hdr-cart-list">
          {items.map((i) => {
            const p = SITE_BY_ID[i.id];
            if (!p) return null;
            return (
              <div key={i.id} className="hdr-cart-row">
                <SiteImg src={p.img} alt={p.name} width={88} height={88} sizes="44px" />
                <span className="hdr-cart-name">{p.name}<em>{i.qty} × {fmtPrice(p.price)}</em></span>
                <button className="hdr-cart-x" onClick={() => removeFromCart(i.id)} title="Remove">×</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="hdr-cart-total"><strong>TOTAL</strong><span>{total.toLocaleString('en-US')} USD</span></div>
      <div className="hdr-cart-btns">
        <Link href="/order" className="btn-malaya btn-malaya-sm">View Order</Link>
        <Link href="/order" className="btn-malaya btn-malaya-sm btn-malaya-gold">Checkout</Link>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const { settings, content } = useSiteData();
  const items = useCart();
  const count = items.reduce((s, i) => s + i.qty, 0);
  // The header is brown brand-wide. On the home page it is superimposed over the
  // hero slideshow with a brown→transparent gradient; every other page shows it
  // as a solid brown bar above the content.
  const overlay = pathname === '/';
  // Contact was merged into About: its details already live in the footer and
  // on other pages, so the primary nav carries a single About entry.
  const NAV = [
    { label: content.nav.home, path: '/' },
    { label: content.nav.explore, path: '/explore' },
    { label: content.nav.tashi, path: '/tashi' },
    { label: content.nav.blog, path: '/blog' },
    { label: content.nav.about, path: '/about' },
    { label: content.nav.instagram, href: content.contact.instagram },
  ];
  return (
    <header className={'site-header' + (overlay ? ' site-header--overlay' : '')}>
      <div className="site-container hdr-bar">
        <Link href="/" className="hdr-logo">
          {settings.logo
            ? <SiteImg src={settings.logo} alt="Malaya Jewellery" width={240} height={74} sizes="240px" priority />
            : <span className="hdr-logo-text">Malaya Jewellery</span>}
        </Link>
        <nav className="hdr-nav">
          {NAV.map((item) => {
            if (item.href) {
              return <a key={item.label} className="hdr-nav-link" href={item.href} target="_blank" rel="noreferrer">{item.label}</a>;
            }
            const active = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
            return (
              <Link key={item.label} className={'hdr-nav-link' + (active ? ' active' : '')} href={item.path}>{item.label}</Link>
            );
          })}
        </nav>
        <div className="hdr-icons">
          <div className="hdr-icon-wrap">
            <Link className="hdr-icon-btn" href="/order" title="My order">
              <BasketIcon />
              <span className="hdr-cart-count">{count}</span>
            </Link>
            <CartDropdown items={items} />
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
export function SiteFooter() {
  const { content } = useSiteData();
  const ct = content.contact;
  // The small "Studio admin" link is the only admin entry point. On a product
  // page it deep-links straight to that item's editor in the admin.
  const pathname = usePathname() || '/';
  const productId = pathname.startsWith('/product/') ? pathname.slice('/product/'.length).split('/')[0] : '';
  const adminHref = productId ? `/admin?edit=${encodeURIComponent(productId)}` : '/admin';
  return (
    <footer className="site-footer">
      <div className="ftr-contact-strip">
        <div className="site-container">
          <h3>{content.footer.contactStrip} <Link href="/contact">Contact Us</Link></h3>
        </div>
      </div>
      <div className="site-container ftr-cols">
        <div className="ftr-col">
          <h4 className="ftr-head">Malaya Information</h4>
          {ct.address.map((l) => <p key={l} className="ftr-line">{l}</p>)}
          <p className="ftr-line" style={{ marginTop: 14 }}>Call us now on WhatsApp:<br />
            {ct.whatsappList.map((w) => (
              <a key={w.number} href={w.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>{w.number}</a>
            ))}</p>
          <p className="ftr-line">Email: <a href={'mailto:' + ct.email}>{ct.email}</a></p>
        </div>
        <div className="ftr-col">
          <h4 className="ftr-head">Info Links</h4>
          <Link className="ftr-link" href="/about">About</Link>
          <Link className="ftr-link" href="/contact">Contact</Link>
          <Link className="ftr-link" href="/policy/privacy">{content.legal.privacy.title}</Link>
          <Link className="ftr-link" href="/policy/terms">{content.legal.terms.title}</Link>
          <Link className="ftr-link" href="/policy/cookie">{content.legal.cookie.title}</Link>
          <Link className="ftr-link" href="/policy/refund">{content.legal.refund.title}</Link>
        </div>
        <div className="ftr-col">
          <h4 className="ftr-head">Follow Us</h4>
          <p className="ftr-line">{content.footer.followNote}</p>
          <SocialLinks />
        </div>
      </div>
      <div className="ftr-bottom">
        <div className="site-container">
          <span>{content.footer.copyright}</span>
          <span>{content.footer.location} · <Link href={adminHref} title="Studio administration" style={{ color: 'inherit' }}>Studio admin</Link></span>
        </div>
      </div>
    </footer>
  );
}
