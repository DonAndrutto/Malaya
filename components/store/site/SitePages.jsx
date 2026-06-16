'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Storefront pages: Home, Catalogue (filters + pagination), Product detail,
// Tashi Mannox, About, Contact, and the order/cart page. Route-driven via the
// Next.js App Router; admin-managed images come from `settings` on the context.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CATEGORIES, COLLECTIONS, fmtPrice, siteImg,
  HOME_HERO, HOME_TILES, TASHI_INTRO, ABOUT_LEAD, ABOUT_BODY, SITE_INFO,
} from '@/lib/data/site-data';
import {
  useCart, addToCart, setCartQty, removeFromCart, cartTotal, showToast, useSiteData,
} from './store';
import { SiteImg, SiteProductCard, PageBanner } from './SiteShell';

const catHref = (c) => `/catalogue?category=${encodeURIComponent(c)}`;
const colHref = (c) => `/catalogue?collection=${encodeURIComponent(c)}`;

// ── Home ─────────────────────────────────────────────────────────────────────
function HeroSlider({ slides }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5200);
    return () => clearInterval(t);
  }, [slides.length]);
  return (
    <div className="hero">
      {slides.map((src, i) => (
        <div key={src + i} className={'hero-slide' + (i === idx ? ' on' : '')}
          style={{ backgroundImage: `url(${src})` }} />
      ))}
      <div className="hero-overlay">
        <h2 className="hero-title">Malaya Jewelry</h2>
        <span className="hero-sub">Bhutan</span>
        <Link className="btn-malaya" href="/catalogue">View All Collections</Link>
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
  const { HOME_BEST, settings } = useSiteData();
  const slides = settings.heroSlides && settings.heroSlides.length ? settings.heroSlides : HOME_HERO;
  return (
    <main className="malaya-page" data-screen-label="Home">
      <HeroSlider slides={slides} />

      <section className="home-tiles site-container">
        {HOME_TILES.map((t) => (
          <Link key={t.title} className="home-tile" href={catHref(t.cat)}>
            <SiteImg src={(settings.homeTiles && settings.homeTiles[t.cat]) || t.img} alt={t.title} />
            <span className="home-tile-body">
              <span className="home-tile-title">{t.title}</span>
              <span className="home-tile-cta">View All</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="home-best site-container">
        <h2 className="section-title">Malaya Jewelry</h2>
        <div className="rule-dot" />
        <div className="pgrid pgrid-3">
          {HOME_BEST.map((p) => <SiteProductCard key={p.id} p={p} />)}
        </div>
        <div className="home-best-cta">
          <Link className="btn-malaya" href="/catalogue">View All Collections</Link>
        </div>
      </section>

      <section className="home-banner" style={{ backgroundImage: `url(${settings.homeBanner || siteImg('banner12.jpg')})` }}>
        <div className="home-banner-inner">
          <h2>Malaya Jewelry — Order Now</h2>
          <Link className="btn-malaya btn-malaya-light" href="/catalogue">View All Collections</Link>
        </div>
      </section>
    </main>
  );
}

// ── Catalogue ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 24;

export function CataloguePage({ category, collection, q }) {
  const { SITE_PRODUCTS } = useSiteData();
  const [cats, setCats] = useState(category ? [category] : []);
  const [cols, setCols] = useState(collection ? [collection] : []);
  const [search, setSearch] = useState(q || '');
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(0);

  // Re-seed filters when the URL query changes (e.g. a mega-menu / tile click).
  useEffect(() => {
    setCats(category ? [category] : []);
    setCols(collection ? [collection] : []);
    setSearch(q || '');
    setPage(0);
  }, [category, collection, q]);
  useEffect(() => { setPage(0); }, [cats, cols, search, sort]);

  const toggle = (list, setList, v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  let out = SITE_PRODUCTS.slice();
  if (cats.length) out = out.filter((p) => cats.includes(p.category));
  if (cols.length) out = out.filter((p) => cols.includes(p.collection));
  if (search) {
    const s = search.toLowerCase();
    out = out.filter((p) => (p.name + ' ' + p.sub).toLowerCase().includes(s));
  }
  switch (sort) {
    case 'new':        out.sort((a, b) => (b.tag === 'new') - (a.tag === 'new')); break;
    case 'price-asc':  out.sort((a, b) => a.price - b.price); break;
    case 'price-desc': out.sort((a, b) => b.price - a.price); break;
    case 'name':       out.sort((a, b) => a.name.localeCompare(b.name)); break;
    default: break;
  }
  const pages = Math.max(1, Math.ceil(out.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = out.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const bannerTitle = cats.length === 1 ? cats[0] : (cols.length === 1 ? cols[0] : 'Catalogue');

  return (
    <main className="malaya-page" data-screen-label="Catalogue">
      <PageBanner title={bannerTitle} subtitle="Malaya Jewelry" />
      <div className="site-container shop-layout">
        <aside className="shop-sidebar">
          <input className="shop-search" type="search" placeholder="Search…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <h4 className="shop-filter-head">Categories</h4>
          {CATEGORIES.map((c) => {
            const n = SITE_PRODUCTS.filter((p) => p.category === c).length;
            if (!n) return null;
            return (
              <label key={c} className="shop-check">
                <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(cats, setCats, c)} />
                <span>{c}</span><em>{n}</em>
              </label>
            );
          })}
          <h4 className="shop-filter-head">Collections</h4>
          {COLLECTIONS.map((c) => {
            const n = SITE_PRODUCTS.filter((p) => p.collection === c).length;
            if (!n) return null;
            return (
              <label key={c} className="shop-check">
                <input type="checkbox" checked={cols.includes(c)} onChange={() => toggle(cols, setCols, c)} />
                <span>{c}</span><em>{n}</em>
              </label>
            );
          })}
          {(cats.length > 0 || cols.length > 0 || search) && (
            <button className="shop-clear" onClick={() => { setCats([]); setCols([]); setSearch(''); }}>Clear filters</button>
          )}
        </aside>
        <div className="shop-main">
          <div className="shop-toolbar">
            <span className="shop-count">{out.length} items</span>
            <select className="shop-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="featured">Featured</option>
              <option value="new">New first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
          {visible.length === 0 ? (
            <p className="shop-count" style={{ padding: '40px 0' }}>Nothing matches those filters yet.</p>
          ) : (
            <div className="pgrid pgrid-3">
              {visible.map((p) => <SiteProductCard key={p.id} p={p} />)}
            </div>
          )}
          {pages > 1 && (
            <div className="shop-pager">
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} className={'shop-page' + (i === safePage ? ' on' : '')}
                  onClick={() => { setPage(i); window.scrollTo({ top: 0 }); }}>{i + 1}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Product detail ───────────────────────────────────────────────────────────
export function ProductPage({ id }) {
  const { SITE_PRODUCTS, SITE_BY_ID } = useSiteData();
  const p = SITE_BY_ID[id];
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  useEffect(() => { setQty(1); setActive(0); }, [id]);

  if (!p) {
    return (
      <main className="malaya-page" data-screen-label="Product not found">
        <PageBanner title="Not found" subtitle="Malaya Jewelry" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This item could not be found. <Link href="/catalogue">Back to the catalogue.</Link></p>
        </div>
      </main>
    );
  }

  const related = SITE_PRODUCTS.filter((x) => x.collection === p.collection && x.id !== p.id).slice(0, 4);
  const sold = p.stock === 'Sold out' || p.stock === 'Archived';

  // Gallery: every uploaded image, falling back to the single primary photo.
  const images = (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []);
  const hero = images[Math.min(active, images.length - 1)] || images[0] || null;
  const monogram = (p.productionCode || p.salesCode || p.name || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'M';

  // Editable story (admin-saved), split into paragraphs; default Malaya blurb.
  const story = (p.story && p.story.trim())
    ? p.story.trim().split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean)
    : ['Designed and crafted by Malaya Jewelry in Thimphu, Bhutan — inspired by the spiritual traditions of the Himalayas.'];

  return (
    <main className="malaya-page" data-screen-label={'Product · ' + p.name}>
      <PageBanner title={p.name} subtitle={p.sub} />
      <div className="site-container pd-layout">
        <div className="pd-media">
          <div className="pd-photo">
            {hero
              ? <SiteImg src={hero} alt={p.name} />
              : <div className="pd-noimg"><span>{monogram}</span></div>}
            {p.tashi && <img className="pd-tashi" src={siteImg('tashi.jpg')} alt="Tashi Mannox"
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
            <Link href="/catalogue">Catalogue</Link><span>/</span>
            <Link href={catHref(p.category)}>{p.category}</Link>
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
              <tr><th>Collection</th><td><Link href={colHref(p.collection)}>{p.collection}</Link></td></tr>
              {p.tashi && <tr><th>Design</th><td>Calligraphy by Tashi Mannox</td></tr>}
            </tbody>
          </table>
          <div className="pd-story">
            {story.map((para, i) => <p key={i} className="pd-desc">{para}</p>)}
          </div>
          <div className="pd-buy">
            <div className="pd-qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span>{qty}</span>
              <button onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button className="btn-malaya" disabled={sold}
              onClick={() => addToCart(p.id, qty)}>{sold ? 'Sold Out' : 'Add to Order'}</button>
          </div>
          <a className="pd-whatsapp" href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer">
            Ask about this piece on WhatsApp →
          </a>
        </div>
      </div>
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
  const { TASHI_PRODUCTS, settings } = useSiteData();
  return (
    <main className="malaya-page" data-screen-label="Tashi Mannox">
      <PageBanner title="Collaboration" subtitle="With Malaya Jewelry" />
      <div className="site-container tashi-intro">
        <div className="tashi-text">
          <h3 className="tashi-kicker">Malaya Jewelry Collaboration With</h3>
          <h2 className="tashi-name">Tashi Mannox</h2>
          <h4 className="tashi-role">Calligraphy Artist</h4>
          {TASHI_INTRO.map((para, i) => <p key={i} className="tashi-para">{para}</p>)}
        </div>
        <div className="tashi-photo">
          <SiteImg src={settings.tashiPhoto || siteImg('Tashi-Mannox.jpg')} alt="Tashi Mannox" />
        </div>
      </div>
      <section className="site-container tashi-products">
        <h2 className="section-title">Tashi Mannox &amp; Malaya Jewelry</h2>
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
  const { settings } = useSiteData();
  return (
    <main className="malaya-page" data-screen-label="About">
      <PageBanner title="About" subtitle="Malaya Jewelry" img={settings.aboutBanner || siteImg('banner31.jpg')} />
      <article className="site-container about-article">
        <p className="about-date">Oct 23, 2016</p>
        <h1 className="about-title">Malaya Jewelry Bhutan</h1>
        <p className="about-lead">{ABOUT_LEAD}</p>
        <div className="about-tags">
          {CATEGORIES.map((c) => <Link key={c} href={catHref(c)}>{c}</Link>)}
        </div>
        <p className="about-from">A letter from: The Shop Team at Malaya Jewelry in Bhutan</p>
        <p className="about-para">{ABOUT_BODY[0]}</p>
        <figure className="about-figure">
          <SiteImg src={siteImg('malaya-jewelry-hand-craft.jpg')} alt="Malaya Jewelry hand craft" />
          <figcaption>Malaya Jewelry — inspired by traditional Bhutanese and Buddhist iconography</figcaption>
        </figure>
        {ABOUT_BODY.slice(1).map((para, i) => <p key={i} className="about-para">{para}</p>)}
      </article>
    </main>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────
export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const body = encodeURIComponent(form.message + '\n\n— ' + form.name + ' (' + form.email + ')');
    window.open('mailto:' + SITE_INFO.email + '?subject=' + encodeURIComponent('Malaya Jewelry enquiry') + '&body=' + body);
    showToast('Opening your email app…');
  };
  return (
    <main className="malaya-page" data-screen-label="Contact">
      <PageBanner title="Contact" subtitle="Malaya Jewelry" />
      <div className="site-container contact-layout">
        <div className="contact-info">
          <h2 className="section-title" style={{ textAlign: 'left' }}>Visit Us</h2>
          {SITE_INFO.address.map((l) => <p key={l} className="ftr-line" style={{ color: '#555' }}>{l}</p>)}
          <h4 className="shop-filter-head" style={{ marginTop: 26 }}>WhatsApp</h4>
          <p><a className="contact-link" href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer">{SITE_INFO.whatsapp}</a></p>
          <h4 className="shop-filter-head">Email</h4>
          <p><a className="contact-link" href={'mailto:' + SITE_INFO.email}>{SITE_INFO.email}</a></p>
          <h4 className="shop-filter-head">Follow</h4>
          <div className="ftr-social ftr-social-dark">
            <a href={SITE_INFO.facebook} target="_blank" rel="noreferrer" title="Facebook">f</a>
            <a href={SITE_INFO.instagram} target="_blank" rel="noreferrer" title="Instagram">IG</a>
            <a href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer" title="WhatsApp">✆</a>
          </div>
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
  const { SITE_BY_ID } = useSiteData();
  const items = useCart();
  const total = cartTotal(items, SITE_BY_ID);
  return (
    <main className="malaya-page" data-screen-label="My Order">
      <PageBanner title="My Order" subtitle="Malaya Jewelry" />
      <div className="site-container order-layout">
        {items.length === 0 ? (
          <div className="order-empty">
            <p>Your order is empty.</p>
            <Link className="btn-malaya" href="/catalogue">Browse the Catalogue</Link>
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
                href={SITE_INFO.whatsappUrl} target="_blank" rel="noreferrer">Checkout via WhatsApp</a>
              <p className="order-note">We confirm availability, shipping and payment over WhatsApp or email.</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
