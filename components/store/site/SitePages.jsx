'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Storefront pages: Home (slideshow + full category-grouped catalogue scroll),
// Product detail, Tashi Mannox, About, Contact, and the order/cart page.
// Route-driven via the Next.js App Router; admin-managed images come from
// `settings` on the context.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CATEGORIES, fmtPrice, siteImg, posFor, HOME_HERO, HOME_TILES, relatedProducts,
} from '@/lib/data/site-data';
import { materialFamilyOf } from '@/lib/data/materials';
import { subscribeAuth } from '@/lib/auth';
import {
  useCart, addToCart, setCartQty, removeFromCart, cartTotal, showToast, useSiteData,
} from './store';
import { SiteImg, SiteProductCard, PageBanner, SocialLinks } from './SiteShell';

// The combined catalogue is shown as one long scroll, grouped by category in
// this fixed order. Some categories are merged into a single section.
const CATALOGUE_SECTIONS = [
  { key: 'Pendants',    label: 'Pendants',            cats: ['Pendants'] },
  { key: 'Rings',       label: 'Rings',               cats: ['Rings'] },
  { key: 'Earrings',    label: 'Earrings',            cats: ['Earrings'] },
  { key: 'Necklaces',   label: 'Necklaces',           cats: ['Necklaces', 'Chains'] },
  { key: 'Bracelets',   label: 'Bracelets & Bangles', cats: ['Bracelets', 'Bangles'] },
  { key: 'Brooches',    label: 'Brooches',            cats: ['Brooches'] },
  { key: 'Accessories', label: 'Accessories',         cats: ['Accessories'] },
  { key: 'Cufflinks',   label: 'Cufflinks',           cats: ['Cufflinks'] },
];
// Map any category → the section that hosts it, for /#cat-<key> deep links.
const CATEGORY_TO_SECTION = {};
CATALOGUE_SECTIONS.forEach((s) => s.cats.forEach((c) => { CATEGORY_TO_SECTION[c] = s.key; }));
const sectionAnchor = (cat) => `/#cat-${CATEGORY_TO_SECTION[cat] || cat}`;
// Built-in fallback tile image per category (admin can override via settings.homeTiles).
const HOME_TILE_IMG = Object.fromEntries(HOME_TILES.map((t) => [t.cat, t.img]));

// True once an admin (Firebase Auth) is signed in, so product pages can show a
// quick "Edit in admin" shortcut. Stays false when Firebase isn't configured.
function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => subscribeAuth((user) => setIsAdmin(!!user)), []);
  return isAdmin;
}

// ── Home ─────────────────────────────────────────────────────────────────────
function HeroSlider({ slides, settings, content }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5200);
    return () => clearInterval(t);
  }, [slides.length]);
  return (
    <div className="hero">
      {slides.map((src, i) => (
        <div key={src + i} className={'hero-slide' + (i === idx ? ' on' : '')}
          style={{ backgroundImage: `url(${src})`, backgroundPosition: posFor(settings, src) }} />
      ))}
      <div className="hero-overlay">
        <h2 className="hero-title">{content.hero.title}</h2>
        <span className="hero-sub">{content.hero.subtitle}</span>
        <a className="btn-malaya" href="#catalogue">{content.hero.cta}</a>
      </div>
      <button className="hero-arrow hero-arrow-l" onClick={() => setIdx((idx + slides.length - 1) % slides.length)}>‹</button>
      <button className="hero-arrow hero-arrow-r" onClick={() => setIdx((idx + 1) % slides.length)}>›</button>
      <div className="hero-dots">
        {slides.map((_, i) => (
          <button key={i} className={'hero-dot' + (i === idx ? ' on' : '')} onClick={() => setIdx(i)}
            aria-label={'Slide ' + (i + 1)} />
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const { settings, content } = useSiteData();
  const slides = settings.heroSlides && settings.heroSlides.length ? settings.heroSlides : HOME_HERO;
  const homeBannerSrc = settings.homeBanner || siteImg('banner12.jpg');
  return (
    <main className="malaya-page" data-screen-label="Home">
      <HeroSlider slides={slides} settings={settings} content={content} />

      <CatalogueScroll />

      <section className="home-banner" style={{ backgroundImage: `url(${homeBannerSrc})`, backgroundPosition: posFor(settings, homeBannerSrc) }}>
        <div className="home-banner-inner">
          <h2>{content.home.bannerTitle}</h2>
          <a className="btn-malaya btn-malaya-light" href="#catalogue">{content.home.bannerCta}</a>
        </div>
      </section>
    </main>
  );
}

// ── Combined catalogue scroll ─────────────────────────────────────────────────
// The full catalogue as one continuous scroll, grouped by category. A sticky
// bar announces the current category (updated by a scroll-spy) and can be tapped
// to jump to any category; a typeahead search jumps straight to a product page.
function CatalogueScroll() {
  const { SITE_PRODUCTS } = useSiteData();
  const router = useRouter();

  const [active, setActive] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [fam, setFam] = useState(''); // '' | 'gold' | 'silver' — metal filter

  const sections = useMemo(() => (
    CATALOGUE_SECTIONS
      .map((s) => ({ ...s, items: SITE_PRODUCTS.filter((p) => s.cats.includes(p.category) && (!fam || materialFamilyOf(p.material) === fam)) }))
      .filter((s) => s.items.length > 0)
  ), [SITE_PRODUCTS, fam]);

  useEffect(() => { if (sections.length && !active) setActive(sections[0].key); }, [sections, active]);

  // Scroll-spy: highlight whichever category sits just below the sticky bar.
  useEffect(() => {
    if (!sections.length || typeof IntersectionObserver === 'undefined') return;
    const els = sections.map((s) => document.getElementById('cat-' + s.key)).filter(Boolean);
    if (!els.length) return;
    const tops = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) tops.set(e.target.id, e.boundingClientRect.top);
        else tops.delete(e.target.id);
      });
      let topId = null; let topY = Infinity;
      tops.forEach((y, id) => { if (y < topY) { topY = y; topId = id; } });
      if (topId) setActive(topId.replace('cat-', ''));
    }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  // Honour /#cat-<key> deep links once the sections exist in the DOM.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.indexOf('#cat-') === 0) {
      const el = document.getElementById(hash.slice(1));
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
    }
  }, [sections.length]);

  const jumpTo = (key) => {
    setMenuOpen(false);
    const el = document.getElementById('cat-' + key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const query = q.trim().toLowerCase();
  const matches = query
    ? SITE_PRODUCTS.filter((p) => `${p.name} ${p.sub || ''} ${p.salesCode || ''}`.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const goToProduct = (id) => { setQ(''); setSearchOpen(false); router.push('/product/' + id); };

  if (!SITE_PRODUCTS.length) return null;
  const activeLabel = (sections.find((s) => s.key === active) || sections[0] || { label: '' }).label;

  return (
    <div className="cat-scroll" id="catalogue">
      <div className="cat-bar">
        <div className="site-container cat-bar-inner">
          <div className="cat-current-wrap">
            <button type="button" className="cat-current" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              <span>{activeLabel}</span><span className="cat-caret">▾</span>
            </button>
            {menuOpen && (
              <>
                <div className="cat-overlay" onClick={() => setMenuOpen(false)} />
                <div className="cat-menu">
                  {sections.map((s) => (
                    <button key={s.key} type="button" className={'cat-menu-item' + (s.key === active ? ' on' : '')} onClick={() => jumpTo(s.key)}>
                      <span>{s.label}</span><em>{s.items.length}</em>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="cat-fam-group" role="group" aria-label="Filter by metal">
            <button type="button" className={'cat-fam' + (fam === 'gold' ? ' on' : '')}
              aria-pressed={fam === 'gold'} onClick={() => setFam(fam === 'gold' ? '' : 'gold')}>Gold</button>
            <button type="button" className={'cat-fam' + (fam === 'silver' ? ' on' : '')}
              aria-pressed={fam === 'silver'} onClick={() => setFam(fam === 'silver' ? '' : 'silver')}>Silver</button>
          </div>
          <div className="cat-search-wrap">
            <input className="cat-search" type="search" placeholder="Search by name or code…" value={q}
              onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) goToProduct(matches[0].id); if (e.key === 'Escape') setSearchOpen(false); }} />
            {searchOpen && query && (
              <>
                <div className="cat-overlay" onClick={() => setSearchOpen(false)} />
                <div className="cat-search-results">
                  {matches.length === 0 ? (
                    <div className="cat-search-empty">No matches</div>
                  ) : matches.map((p) => (
                    <button key={p.id} type="button" className="cat-search-row" onClick={() => goToProduct(p.id)}>
                      {p.img ? <SiteImg src={p.img} alt="" /> : <span className="cat-search-noimg" />}
                      <span className="cat-search-text">
                        <span className="cat-search-name">{p.name}</span>
                        <span className="cat-search-sub">{p.sub}{p.salesCode ? ' · ' + p.salesCode : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {sections.length === 0 && (
        <div className="site-container" style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--muted)' }}>
          No pieces in this metal yet.
        </div>
      )}
      {sections.map((s) => (
        <section key={s.key} id={'cat-' + s.key} className="cat-section site-container">
          <h2 className="section-title cat-section-title">{s.label}</h2>
          <div className="rule-dot" />
          <div className="pgrid pgrid-3">
            {s.items.map((p) => <SiteProductCard key={p.id} p={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Product detail ───────────────────────────────────────────────────────────
export function ProductPage({ id }) {
  const { SITE_PRODUCTS, SITE_BY_ID, content, settings } = useSiteData();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const p = SITE_BY_ID[id];
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  useEffect(() => { setQty(1); setActive(0); }, [id]);
  // If this id was merged into a master, canonicalise the URL to the master.
  useEffect(() => { if (p && p.id && p.id !== id) router.replace(`/product/${p.id}`); }, [p, id, router]);

  if (!p) {
    return (
      <main className="malaya-page" data-screen-label="Product not found">
        <PageBanner title="Not found" subtitle="Malaya Jewelry" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This item could not be found. <Link href="/">Back to the catalogue.</Link></p>
        </div>
      </main>
    );
  }

  // Cross-sell by shared motif keywords (Dorje, Syllable, …), falling back to the
  // same category then anything; always excludes the item being viewed.
  const related = relatedProducts(p, SITE_PRODUCTS, 4);
  const sold = p.stock === 'Sold out' || p.stock === 'Archived';

  // "Order Now" banner background (shared with the home page banner) and the
  // "Explore <category>" tile image (admin Home category tiles → fallbacks).
  const orderBannerSrc = settings.homeBanner || siteImg('banner12.jpg');
  const exploreImg = (settings.homeTiles && settings.homeTiles[p.category])
    || HOME_TILE_IMG[p.category]
    || (settings.categoryBanners && settings.categoryBanners[p.category])
    || settings.pageBanner || siteImg('banner33.jpg');

  // Gallery: every uploaded image, falling back to the single primary photo.
  const images = (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []);
  const hero = images[Math.min(active, images.length - 1)] || images[0] || null;
  const heroAlt = images.length > 1 ? images[(Math.min(active, images.length - 1) + 1) % images.length] : null;
  const monogram = (p.productionCode || p.salesCode || p.name || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'M';

  // Editable story (admin-saved), split into paragraphs; falls back to the global
  // credit line (admin Content → Product page).
  const story = (p.story && p.story.trim())
    ? p.story.trim().split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean)
    : [content.product.credit];

  return (
    <main className="malaya-page" data-screen-label={'Product · ' + p.name}>
      <PageBanner title={p.name} subtitle={p.sub} category={p.category} />
      <div className="site-container pd-layout">
        <div className="pd-media">
          <div className="pd-photo">
            {hero
              ? <SiteImg src={hero} alt={p.name} />
              : <div className="pd-noimg"><span>{monogram}</span></div>}
            {heroAlt && <SiteImg className="pd-alt" src={heroAlt} alt={p.name} />}
            {p.tashi && <img className="pd-tashi" src={settings.tashiBadge || siteImg('tashi.jpg')} alt="Tashi Mannox"
              title="Malaya Jewelry Collaboration with Tashi Mannox" />}
          </div>
          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((src, i) => (
                <button key={src + i} type="button" className={'pd-thumb' + (i === active ? ' on' : '')}
                  onClick={() => setActive(i)} aria-label={`View image ${i + 1}`}>
                  <SiteImg src={src} alt={`${p.name} — view ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pd-info">
          <nav className="pd-crumbs">
            <Link href="/">Home</Link><span>/</span>
            <Link href={sectionAnchor(p.category)}>{p.category}</Link>
            {isAdmin && (
              <a className="pd-admin-edit" href={`/admin?edit=${encodeURIComponent(p.id)}`}>Edit in admin →</a>
            )}
          </nav>
          <h1 className="pd-name">{p.name}</h1>
          <p className="pd-sub">{p.sub}</p>
          <div className="pd-price">
            {p.onSale && <s>{fmtPrice(p.listPrice)}</s>}
            <strong>{fmtPrice(p.price)}</strong>
            <span className="pd-stock">{p.stock}</span>
          </div>
          <div className="rule-dot" style={{ margin: '18px 0' }} />
          <table className="pd-specs">
            <tbody>
              {p.salesCode && <tr><th>Reference</th><td>{p.salesCode}</td></tr>}
              <tr><th>Material</th><td>{p.material}</td></tr>
              <tr><th>Category</th><td>{p.category}</td></tr>
              <tr><th>Collection</th><td>{p.collection}</td></tr>
              {p.tashi && <tr><th>Design</th><td>Calligraphy by Tashi Mannox</td></tr>}
            </tbody>
          </table>
          <div className="pd-story">
            {story.map((para, i) => <p key={i} className="pd-desc">{para}</p>)}
          </div>
          <a className="pd-whatsapp" href={content.contact.whatsappUrl} target="_blank" rel="noreferrer">
            Ask about this piece on WhatsApp →
          </a>
        </div>
      </div>

      <section className="pd-order-banner" style={{ backgroundImage: `url(${orderBannerSrc})`, backgroundPosition: posFor(settings, orderBannerSrc) }}>
        <div className="pd-order-card">
          <span className="pd-order-kicker">Order Now</span>
          <div className="pd-price pd-order-price">
            {p.onSale && <s>{fmtPrice(p.listPrice)}</s>}
            <strong>{fmtPrice(p.price)}</strong>
          </div>
          <div className="pd-order-buy">
            <div className="pd-qty">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span>{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button className="btn-malaya" disabled={sold}
              onClick={() => addToCart(p.id, qty)}>{sold ? 'Sold Out' : 'Add to Order'}</button>
          </div>
        </div>
      </section>

      <Link className="pd-explore" href={sectionAnchor(p.category)}
        style={{ backgroundImage: `url(${exploreImg})`, backgroundPosition: posFor(settings, exploreImg) }}>
        <span className="pd-explore-inner">
          <em className="pd-explore-kicker">Discover more</em>
          <strong className="pd-explore-title">Explore {p.category}</strong>
        </span>
      </Link>

      {related.length > 0 && (
        <section className="site-container pd-related">
          <h2 className="section-title">You May Also Like</h2>
          <div className="rule-dot" />
          <div className="pgrid pgrid-4">
            {related.map((r) => <SiteProductCard key={r.id} p={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}

// ── Tashi Mannox collaboration ───────────────────────────────────────────────
export function TashiPage() {
  const { TASHI_PRODUCTS, settings, content } = useSiteData();
  return (
    <main className="malaya-page" data-screen-label="Tashi Mannox">
      <PageBanner title={content.banners.tashi.title} subtitle={content.banners.tashi.subtitle} />
      <div className="site-container tashi-intro">
        <div className="tashi-text">
          <h3 className="tashi-kicker">{content.tashi.kicker}</h3>
          <h2 className="tashi-name">{content.tashi.name}</h2>
          <h4 className="tashi-role">{content.tashi.role}</h4>
          {content.tashi.intro.map((para, i) => <p key={i} className="tashi-para">{para}</p>)}
        </div>
        <div className="tashi-photo">
          <SiteImg src={settings.tashiPhoto || siteImg('Tashi-Mannox.jpg')} alt={content.tashi.name} />
        </div>
      </div>
      <section className="site-container tashi-products">
        <h2 className="section-title">{content.tashi.productsTitle}</h2>
        <div className="rule-dot" />
        <div className="pgrid pgrid-3">
          {TASHI_PRODUCTS.map((p) => <SiteProductCard key={p.id} p={p} />)}
        </div>
      </section>
    </main>
  );
}

// ── About ────────────────────────────────────────────────────────────────────
export function AboutPage() {
  const { settings, content } = useSiteData();
  const about = content.about;
  return (
    <main className="malaya-page" data-screen-label="About">
      <PageBanner title={content.banners.about.title} subtitle={content.banners.about.subtitle} img={settings.aboutBanner || siteImg('banner31.jpg')} />
      <article className="site-container about-article">
        <p className="about-date">{about.date}</p>
        <h1 className="about-title">{about.title}</h1>
        <p className="about-lead">{about.lead}</p>
        <div className="about-tags">
          {CATEGORIES.map((c) => <Link key={c} href={sectionAnchor(c)}>{c}</Link>)}
        </div>
        <p className="about-from">{about.from}</p>
        <p className="about-para">{about.body[0]}</p>
        <figure className="about-figure">
          <SiteImg src={siteImg('malaya-jewelry-hand-craft.jpg')} alt="Malaya Jewelry hand craft" />
          <figcaption>{about.caption}</figcaption>
        </figure>
        {about.body.slice(1).map((para, i) => <p key={i} className="about-para">{para}</p>)}
      </article>
    </main>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────
export function ContactPage() {
  const { content } = useSiteData();
  const ct = content.contact;
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = encodeURIComponent(form.message + '\n\n— ' + form.name + ' (' + form.email + ')');
    window.open('mailto:' + ct.email + '?subject=' + encodeURIComponent('Malaya Jewelry enquiry') + '&body=' + body);
    showToast('Opening your email app…');
  };
  return (
    <main className="malaya-page" data-screen-label="Contact">
      <PageBanner title={content.banners.contact.title} subtitle={content.banners.contact.subtitle} />
      <div className="site-container contact-layout">
        <div className="contact-info">
          <h2 className="section-title" style={{ textAlign: 'left' }}>Visit Us</h2>
          {ct.address.map((l) => <p key={l} className="ftr-line" style={{ color: '#555' }}>{l}</p>)}
          <h4 className="shop-filter-head" style={{ marginTop: 26 }}>WhatsApp</h4>
          {ct.whatsappList.map((w) => (
            <p key={w.number}><a className="contact-link" href={w.url} target="_blank" rel="noreferrer">{w.number}</a></p>
          ))}
          <h4 className="shop-filter-head">Email</h4>
          <p><a className="contact-link" href={'mailto:' + ct.email}>{ct.email}</a></p>
          <h4 className="shop-filter-head">Follow</h4>
          <SocialLinks />
        </div>
        <form className="contact-form" onSubmit={submit}>
          <h2 className="section-title" style={{ textAlign: 'left' }}>Send a Message</h2>
          <label>Name<input type="text" required value={form.name} onChange={set('name')} /></label>
          <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label>Message<textarea rows="6" required value={form.message} onChange={set('message')} /></label>
          <button className="btn-malaya" type="submit">Send Email</button>
        </form>
      </div>
    </main>
  );
}

// ── Order / cart ─────────────────────────────────────────────────────────────
export function OrderPage() {
  const { SITE_BY_ID, content } = useSiteData();
  const items = useCart();
  const total = cartTotal(items, SITE_BY_ID);
  return (
    <main className="malaya-page" data-screen-label="My Order">
      <PageBanner title={content.banners.order.title} subtitle={content.banners.order.subtitle} />
      <div className="site-container order-layout">
        {items.length === 0 ? (
          <div className="order-empty">
            <p>Your order is empty.</p>
            <Link className="btn-malaya" href="/">Browse the Catalogue</Link>
          </div>
        ) : (
          <div className="order-grid">
            <table className="order-table">
              <thead>
                <tr><th /><th>Item</th><th>Price</th><th>Qty</th><th>Total</th><th /></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const p = SITE_BY_ID[i.id];
                  if (!p) return null;
                  return (
                    <tr key={i.id}>
                      <td className="order-thumb">
                        <Link href={`/product/${p.id}`}><SiteImg src={p.img} alt={p.name} /></Link>
                      </td>
                      <td>
                        <Link className="order-name" href={`/product/${p.id}`}>{p.name}</Link>
                        <span className="order-sub">{p.sub}</span>
                      </td>
                      <td>{fmtPrice(p.price)}</td>
                      <td>
                        <div className="pd-qty pd-qty-sm">
                          <button onClick={() => setCartQty(i.id, i.qty - 1)}>−</button>
                          <span>{i.qty}</span>
                          <button onClick={() => setCartQty(i.id, i.qty + 1)}>+</button>
                        </div>
                      </td>
                      <td><strong>{fmtPrice(p.price * i.qty)}</strong></td>
                      <td><button className="hdr-cart-x" onClick={() => removeFromCart(i.id)} title="Remove">×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <aside className="order-summary">
              <h4 className="shop-filter-head">Order Summary</h4>
              <div className="order-total"><span>TOTAL</span><strong>{total.toLocaleString('en-US')} USD</strong></div>
              <a className="btn-malaya btn-malaya-gold" style={{ display: 'block', textAlign: 'center' }}
                href={content.contact.whatsappUrl} target="_blank" rel="noreferrer">Checkout via WhatsApp</a>
              <p className="order-note">We confirm availability, shipping and payment over WhatsApp or email.</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Legal / policy pages (Privacy, Terms, Cookie, Refund) ────────────────────
// Title and body are admin-editable from the Content tab (content.legal[slug]).
export function PolicyPage({ slug }) {
  const { content } = useSiteData();
  const data = content.legal && content.legal[slug];
  if (!data) {
    return (
      <main className="malaya-page" data-screen-label="Policy not found">
        <PageBanner title="Not found" subtitle="Malaya Jewelry" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This page could not be found. <Link href="/">Back to the home page.</Link></p>
        </div>
      </main>
    );
  }
  return (
    <main className="malaya-page" data-screen-label={'Policy · ' + data.title}>
      <PageBanner title={data.title} subtitle="Malaya Jewelry" />
      <article className="site-container about-article">
        <h1 className="about-title">{data.title}</h1>
        {data.body.map((para, i) => <p key={i} className="about-para">{para}</p>)}
      </article>
    </main>
  );
}
