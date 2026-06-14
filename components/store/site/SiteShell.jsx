'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell for the Malaya storefront: header (mega menu, account & cart
// dropdowns), footer, product card, page banner, and the image-with-fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  CATEGORIES, COLLECTIONS, SITE_NAV, SITE_INFO, fmtPrice, siteImg,
} from '@/lib/data/site-data';
import {
  navTo, useCart, removeFromCart, cartTotal, useSiteData,
} from './store';

// ── Image with S-size fallback (the live site serves both M and S variants) ──
export function SiteImg({ src, alt, style, className }) {
  return (
    <img
      src={src} alt={alt || ''} loading="lazy" className={className} style={style}
      onError={(e) => {
        if (!e.target.dataset.fb) { e.target.dataset.fb = '1'; e.target.src = src.replace('M.', 'S.'); }
      }}
    />
  );
}

// ── Product card — bordered photo, centred name/subtitle (matches live site) ──
export function SiteProductCard({ p }) {
  const open = (e) => { e.preventDefault(); navTo('#/product/' + p.id); };
  const onSale = p.onSale || p.tag === 'sale';
  return (
    <div className="pcard">
      <a className="pcard-thumb" href={'#/product/' + p.id} onClick={open}>
        <SiteImg src={p.img} alt={p.name} />
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
      </a>
      <h5 className="pcard-text">
        <a href={'#/product/' + p.id} onClick={open} className="pcard-name">{p.name}</a>
        <a href={'#/product/' + p.id} onClick={open} className="pcard-sub">{p.sub}</a>
      </h5>
    </div>
  );
}

// ── Page banner (thin breadcrumb banner like the live site) ──────────────────
export function PageBanner({ title, subtitle, img }) {
  return (
    <div className="page-banner" style={{ backgroundImage: `url(${img || siteImg('banner33.jpg')})` }}>
      <div className="site-container">
        <strong className="page-banner-title">{title}</strong>
        {subtitle && <span className="page-banner-sub">{subtitle}</span>}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function MegaMenu({ onNavigate }) {
  const { MEGA_FEATURED } = useSiteData();
  const go = (hash) => (e) => { e.preventDefault(); onNavigate(); navTo(hash); };
  return (
    <div className="mega">
      <div className="mega-inner">
        <div className="mega-col">
          <h4 className="mega-head">Categories</h4>
          {CATEGORIES.map((c) => (
            <a key={c} href={'#/catalogue/cat/' + encodeURIComponent(c)} className="mega-link"
              onClick={go('#/catalogue/cat/' + encodeURIComponent(c))}>{c}</a>
          ))}
        </div>
        <div className="mega-col">
          <h4 className="mega-head">Collections</h4>
          {COLLECTIONS.map((c) => (
            <a key={c} href={'#/catalogue/col/' + encodeURIComponent(c)} className="mega-link"
              onClick={go('#/catalogue/col/' + encodeURIComponent(c))}>{c}</a>
          ))}
        </div>
        <div className="mega-col mega-col-wide">
          <h4 className="mega-head">Shop Collection</h4>
          <div className="mega-products">
            {MEGA_FEATURED.map((p) => (
              <a key={p.id} className="mega-product" href={'#/product/' + p.id} onClick={go('#/product/' + p.id)}>
                <SiteImg src={p.img} alt={p.name} />
                <span className="mega-product-name">{p.name}</span>
                <span className="mega-product-sub">{p.sub}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="mega-col mega-col-promo">
          <img src={siteImg('mega4.jpg')} alt="Mystical Beings" />
          <h4 className="mega-promo-title">Mystical Beings</h4>
          <p className="mega-promo-desc">Add a splash of colour to your Jewelry with Malaya.</p>
          <a href="#/catalogue/col/Mystical%20Beings" className="btn-malaya btn-malaya-sm"
            onClick={go('#/catalogue/col/' + encodeURIComponent('Mystical Beings'))}>Order Now</a>
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
        <a href="#/order" className="btn-malaya btn-malaya-sm" onClick={(e) => { e.preventDefault(); navTo('#/order'); }}>View Order</a>
        <a href="#/order" className="btn-malaya btn-malaya-sm btn-malaya-gold" onClick={(e) => { e.preventDefault(); navTo('#/order'); }}>Checkout</a>
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
      <a href="#/contact" className="hdr-drop-link" onClick={(e) => { e.preventDefault(); navTo('#/contact'); }}>Contact Us</a>
      <a href={'mailto:' + SITE_INFO.email} className="hdr-drop-link">Send an Email</a>
      <span className="hdr-drop-note">Call us on WhatsApp: {SITE_INFO.whatsapp}</span>
    </div>
  );
}

export function SiteHeader({ route }) {
  const items = useCart();
  const count = items.reduce((s, i) => s + i.qty, 0);
  const [megaOpen, setMegaOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="hdr-top">
        <div className="site-container hdr-top-inner">
          <a href="#/" className="hdr-logo" onClick={(e) => { e.preventDefault(); navTo('#/'); }}>
            <img src={siteImg('logo.png')} alt="Malaya Jewelry" />
          </a>
          <div className="hdr-icons">
            <div className="hdr-icon-wrap">
              <button className="hdr-icon-btn" title="Account">
                <img src={siteImg('icon/icon-lock.png')} alt="Account" />
              </button>
              <AccountDropdown />
            </div>
            <div className="hdr-icon-wrap">
              <a className="hdr-icon-btn" href="#/order" title="My order"
                onClick={(e) => { e.preventDefault(); navTo('#/order'); }}>
                <img src={siteImg('icon/icon-cart.png')} alt="Cart" />
                <span className="hdr-cart-count">{count}</span>
              </a>
              <CartDropdown items={items} />
            </div>
          </div>
        </div>
      </div>
      <nav className="hdr-nav">
        <div className="site-container hdr-nav-inner">
          {SITE_NAV.map((item) => {
            const active = item.hash && (route.page === item.hash.slice(2) || (item.hash === '#/' && route.page === ''));
            if (item.href) {
              return <a key={item.label} className="hdr-nav-link" href={item.href} target="_blank" rel="noreferrer">{item.label}</a>;
            }
            if (item.mega) {
              return (
                <div key={item.label} className={'hdr-nav-mega' + (megaOpen ? ' open' : '')}
                  onMouseEnter={() => setMegaOpen(true)} onMouseLeave={() => setMegaOpen(false)}>
                  <a className={'hdr-nav-link' + (route.page.startsWith('catalogue') || route.page === 'product' ? ' active' : '')}
                    href={item.hash} onClick={(e) => { e.preventDefault(); setMegaOpen(false); navTo(item.hash); }}>
                    {item.label} <span className="hdr-caret">▾</span>
                  </a>
                  <MegaMenu onNavigate={() => setMegaOpen(false)} />
                </div>
              );
            }
            return (
              <a key={item.label} className={'hdr-nav-link' + (active ? ' active' : '')} href={item.hash}
                onClick={(e) => { e.preventDefault(); navTo(item.hash); }}>{item.label}</a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
export function SiteFooter() {
  const go = (hash) => (e) => { e.preventDefault(); navTo(hash); };
  return (
    <footer className="site-footer">
      <div className="ftr-contact-strip">
        <div className="site-container">
          <h3>Questions about Malaya Jewelry?{' '}
            <a href="#/contact" onClick={go('#/contact')}>Contact Us</a>
          </h3>
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
          <a className="ftr-link" href="#/about" onClick={go('#/about')}>About</a>
          <a className="ftr-link" href="#/contact" onClick={go('#/contact')}>Contact</a>
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
          <span>Thimphu, Bhutan · <a href="/admin" title="Studio administration" style={{ color: 'inherit' }}>Studio admin</a></span>
        </div>
      </div>
    </footer>
  );
}
