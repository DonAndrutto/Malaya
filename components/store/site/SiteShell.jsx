'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell for the Malaya storefront: header (mega menu, account & cart
// dropdowns), footer, product card, page banner, and image-with-fallback.
// Navigation uses the Next.js App Router (next/link + usePathname).
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CATEGORIES, COLLECTIONS, SITE_NAV, SITE_INFO, fmtPrice, siteImg, cdnFallback,
} from '@/lib/data/site-data';
import { useCart, removeFromCart, cartTotal, useSiteData } from './store';

const catHref = (c) => `/catalogue?category=${encodeURIComponent(c)}`;
const colHref = (c) => `/catalogue?collection=${encodeURIComponent(c)}`;

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
        {onSale ? (
          <span className="pcard-label pcard-label-sale">SALE</span>
        ) : p.tag === 'new' ? (
          <span className="pcard-label">NEW</span>
        ) : null}
        {p.tashi && (
          <img className="pcard-tashi" src={siteImg('tashi.jpg')} alt="Tashi Mannox"
            title="Malaya Jewelry Collaboration with Tashi Mannox" />
        )}
        <span className="pcard-quick">
          <img src={siteImg('icon/malaya.jpg')} alt="" style={{ objectFit: 'scale-down', width: 65 }} />
        </span>
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
    <div className="page-banner" style={{ backgroundImage: `url(${bg})` }}>
      <div className="site-container">
        <strong className="page-banner-title">{title}</strong>
        {subtitle && <span className="page-banner-sub">{subtitle}</span>}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function MegaMenu() {
  const { MEGA_FEATURED } = useSiteData();
  return (
    <div className="mega">
      <div className="mega-inner">
        <div className="mega-col">
          <h4 className="mega-head">Categories</h4>
          {CATEGORIES.map((c) => <Link key={c} href={catHref(c)} className="mega-link">{c}</Link>)}
        </div>
        <div className="mega-col">
          <h4 className="mega-head">Collections</h4>
          {COLLECTIONS.map((c) => <Link key={c} href={colHref(c)} className="mega-link">{c}</Link>)}
        </div>
        <div className="mega-col mega-col-wide">
          <h4 className="mega-head">Shop Collection</h4>
          <div className="mega-products">
            {MEGA_FEATURED.map((p) => (
              <Link key={p.id} className="mega-product" href={`/product/${p.id}`}>
                <SiteImg src={p.img} alt={p.name} />
                <span className="mega-product-name">{p.name}</span>
                <span className="mega-product-sub">{p.sub}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mega-col mega-col-promo">
          <img src={siteImg('mega4.jpg')} alt="Mystical Beings" />
          <h4 className="mega-promo-title">Mystical Beings</h4>
          <p className="mega-promo-desc">Add a splash of colour to your Jewelry with Malaya.</p>
          <Link href={colHref('Mystical Beings')} className="btn-malaya btn-malaya-sm">Order Now</Link>
        </div>
      </div>
    </div>
  );
}

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

function AccountDropdown() {
  return (
    <div className="hdr-drop hdr-drop-account">
      <a href="#" className="hdr-drop-link" onClick={(e) => e.preventDefault()}>Log In</a>
      <a href="#" className="hdr-drop-link" onClick={(e) => e.preventDefault()}>Create an account</a>
      <h4 className="hdr-drop-head" style={{ marginTop: 10 }}>Support Centre</h4>
      <a href="#" className="hdr-drop-link" onClick={(e) => e.preventDefault()}>FAQs</a>
      <a href="#" className="hdr-drop-link" onClick={(e) => e.preventDefault()}>Shipping &amp; Returns</a>
      <Link href="/contact" className="hdr-drop-link">Contact Us</Link>
      <a href={'mailto:' + SITE_INFO.email} className="hdr-drop-link">Send an Email</a>
      <span className="hdr-drop-note">Call us on WhatsApp: {SITE_INFO.whatsapp}</span>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const { settings } = useSiteData();
  const items = useCart();
  const count = items.reduce((s, i) => s + i.qty, 0);
  return (
    <header className="site-header">
      <div className="hdr-top">
        <div className="site-container hdr-top-inner">
          <Link href="/" className="hdr-logo">
            <img src={settings.logo || siteImg('logo.png')} alt="Malaya Jewelry" />
          </Link>
          <div className="hdr-icons">
            <div className="hdr-icon-wrap">
              <button className="hdr-icon-btn" title="Account">
                <img src={siteImg('icon/icon-lock.png')} alt="Account" />
              </button>
              <AccountDropdown />
            </div>
            <div className="hdr-icon-wrap">
              <Link className="hdr-icon-btn" href="/order" title="My order">
                <img src={siteImg('icon/icon-cart.png')} alt="Cart" />
                <span className="hdr-cart-count">{count}</span>
              </Link>
              <CartDropdown items={items} />
            </div>
          </div>
        </div>
      </div>
      <nav className="hdr-nav">
        <div className="site-container hdr-nav-inner">
          {SITE_NAV.map((item) => {
            if (item.href) {
              return <a key={item.label} className="hdr-nav-link" href={item.href} target="_blank" rel="noreferrer">{item.label}</a>;
            }
            if (item.mega) {
              const active = pathname.startsWith('/catalogue') || pathname.startsWith('/product');
              return (
                <div key={item.label} className="hdr-nav-mega">
                  <Link className={'hdr-nav-link' + (active ? ' active' : '')} href={item.path}>
                    {item.label} <span className="hdr-caret">▾</span>
                  </Link>
                  <MegaMenu />
                </div>
              );
            }
            const active = pathname === item.path;
            return (
              <Link key={item.label} className={'hdr-nav-link' + (active ? ' active' : '')} href={item.path}>{item.label}</Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="ftr-contact-strip">
        <div className="site-container">
          <h3>Questions about Malaya Jewelry? <Link href="/contact">Contact Us</Link></h3>
        </div>
      </div>
      <div className="site-container ftr-cols">
        <div className="ftr-col">
          <h4 className="ftr-head">Malaya Information</h4>
          {SITE_INFO.address.map((l) => <p key={l} className="ftr-line">{l}</p>)}
          <p className="ftr-line" style={{ marginTop: 14 }}>Call us now on WhatsApp:<br />
            <a href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer">{SITE_INFO.whatsapp}</a></p>
          <p className="ftr-line">Email: <a href={'mailto:' + SITE_INFO.email}>{SITE_INFO.email}</a></p>
        </div>
        <div className="ftr-col">
          <h4 className="ftr-head">Info Links</h4>
          <Link className="ftr-link" href="/about">About</Link>
          <Link className="ftr-link" href="/contact">Contact</Link>
          <a className="ftr-link" href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
          <a className="ftr-link" href="#" onClick={(e) => e.preventDefault()}>Terms and Conditions</a>
          <a className="ftr-link" href="#" onClick={(e) => e.preventDefault()}>Cookie policy</a>
          <a className="ftr-link" href="#" onClick={(e) => e.preventDefault()}>Refund policy</a>
        </div>
        <div className="ftr-col">
          <h4 className="ftr-head">Follow Us</h4>
          <p className="ftr-line">Get latest news and proposals</p>
          <div className="ftr-social">
            <a href={SITE_INFO.facebook} target="_blank" rel="noreferrer" title="Malaya Jewelry on Facebook">f</a>
            <a href={SITE_INFO.instagram} target="_blank" rel="noreferrer" title="Malaya Jewelry on Instagram">IG</a>
            <a href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer" title="Chat on WhatsApp">✆</a>
          </div>
        </div>
      </div>
      <div className="ftr-bottom">
        <div className="site-container">
          <span>© 2018–2026 Malaya Jewelry</span>
          <span>Thimphu, Bhutan · <Link href="/admin" title="Studio administration" style={{ color: 'inherit' }}>Studio admin</Link></span>
        </div>
      </div>
    </footer>
  );
}
