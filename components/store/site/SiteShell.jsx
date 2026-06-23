'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell for the Malaya storefront: header (logo + centred nav + cart),
// footer, product card, page banner, and image-with-fallback.
// Navigation uses the Next.js App Router (next/link + usePathname).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { fmtPrice, siteImg, cdnFallback, posFor } from '@/lib/data/site-data';
import { useCart, removeFromCart, cartTotal, useSiteData } from './store';

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

export function SocialIcon({ name, size = 17 }) {
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
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.6" />
        <circle cx="12" cy="12" r="3.7" />
        <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
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

// ── Image with local→CDN→smaller-size fallback ───────────────────────────────
export function SiteImg({ src, alt, style, className }) {
  return (
    <img
      src={src} alt={alt || ''} loading="lazy" className={className} style={style}
      onError={(e) => {
        const el = e.target;
        const tried = el.dataset.tried || '';
        const cur = el.getAttribute('src') || '';
        if (!tried.includes('cdn')) {
          const cdn = cdnFallback(cur);
          if (cdn) { el.dataset.tried = tried + 'cdn,'; el.src = cdn; return; }
        }
        if (!tried.includes('small') && cur.includes('M.')) {
          el.dataset.tried = (el.dataset.tried || '') + 'small,';
          el.src = cur.replace('M.', 'S.');
        }
      }}
    />
  );
}

// ── Product card — bordered photo, centred name/subtitle (matches live site) ──
export function SiteProductCard({ p }) {
  const onSale = p.onSale || p.tag === 'sale';
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
        ) : p.tag === 'new' ? (
          <span className="pcard-label">NEW</span>
        ) : null}
        {p.tashi && (
          <img className="pcard-tashi" src={siteImg('tashi.jpg')} alt="Tashi Mannox"
            title="Malaya Jewelry Collaboration with Tashi Mannox" />
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
export function PageBanner({ title, subtitle, img }) {
  const { settings } = useSiteData();
  const bg = img || settings.pageBanner || siteImg('banner33.jpg');
  return (
    <div className="page-banner" style={{ backgroundImage: `url(${bg})`, backgroundPosition: posFor(settings, bg) }}>
      <div className="site-container">
        <strong className="page-banner-title">{title}</strong>
        {subtitle && <span className="page-banner-sub">{subtitle}</span>}
      </div>
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
                <SiteImg src={p.img} alt={p.name} />
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
  const NAV = [
    { label: content.nav.home, path: '/' },
    { label: content.nav.tashi, path: '/tashi' },
    { label: content.nav.contact, path: '/contact' },
    { label: content.nav.about, path: '/about' },
    { label: content.nav.instagram, href: content.contact.instagram },
  ];
  return (
    <header className={'site-header' + (overlay ? ' site-header--overlay' : '')}>
      <div className="site-container hdr-bar">
        <Link href="/" className="hdr-logo">
          <img src={settings.logo || siteImg('logo.png')} alt="Malaya Jewelry" />
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
          <div className="ftr-social">
            <a href={ct.facebook} target="_blank" rel="noreferrer" title="Malaya Jewelry on Facebook" aria-label="Facebook"><SocialIcon name="facebook" /></a>
            <a href={ct.instagram} target="_blank" rel="noreferrer" title="Malaya Jewelry on Instagram" aria-label="Instagram"><SocialIcon name="instagram" /></a>
            <a href={ct.whatsappUrl} target="_blank" rel="noreferrer" title="Chat on WhatsApp" aria-label="WhatsApp"><SocialIcon name="whatsapp" /></a>
          </div>
        </div>
      </div>
      <div className="ftr-bottom">
        <div className="site-container">
          <span>{content.footer.copyright}</span>
          <span>{content.footer.location} · <Link href="/admin" title="Studio administration" style={{ color: 'inherit' }}>Studio admin</Link></span>
        </div>
      </div>
    </footer>
  );
}
