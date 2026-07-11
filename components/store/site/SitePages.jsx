'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Storefront pages: Home (slideshow + full category-grouped catalogue scroll),
// Product detail, Tashi Mannox, About, Contact, and the order/cart page.
// Route-driven via the Next.js App Router; admin-managed images come from
// `settings` on the context.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CATEGORIES, MATERIALS, CATALOGUE_SECTIONS, CATEGORY_TO_SECTION,
  fmtPrice, posFor, bgImage, resolveHeroSlides, isInStock, relatedProducts, whatsappUrlFor,
} from '@/lib/data/site-data';
import { materialFamilyOf } from '@/lib/data/materials';
import { dupKey } from '@/lib/data/inventory';
import { RING_SIZES, isRingCategory, ringSizeQty } from '@/lib/data/ring-sizes';
import { searchExplore } from '@/lib/explore-shared';
import {
  useCart, addToCart, setCartQty, removeFromCart, cartTotal, cartLineKey, showToast, useSiteData, blurActiveElement,
} from './store';
import { SiteImg, SiteProductCard, PageBanner, SocialLinks } from './SiteShell';
import { Reveal, prefersReducedMotion } from './reveal';

// The combined catalogue is shown as one long scroll, grouped by category in
// the fixed CATALOGUE_SECTIONS order (lib/data/site-data.js — shared with the
// hero slides and the admin's per-category hero config).
const sectionAnchor = (cat) => `/#cat-${CATEGORY_TO_SECTION[cat] || cat}`;

// Layered banner image (VISUAL-AUDIT PR D). A CSS-background banner downloads
// eagerly (~400 KB master on every first view, seen or not) and its crop can't
// be transformed; an absolutely-positioned SiteImg layer is lazy by default
// and gives hover/drift motion a compositor-friendly element. Frames must be
// position:relative + overflow:hidden with the scrim (::before) and content
// z-indexed above the layer.
function BannerImg({ src, settings, alt = '' }) {
  if (!src) return null;
  return (
    <SiteImg className="banner-img" src={src} alt={alt} width={1920} height={720}
      sizes="100vw" style={{ objectPosition: posFor(settings, src) }} />
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
// Hero slideshow (VISUAL-AUDIT PR C). Each slide layers its image in an inner
// div so the slow Ken Burns drift (CSS transform on the layer) never fights
// the admin focal point (background-position on the same layer). The drift
// pauses while a slide is hidden and resumes on return, so the outgoing frame
// never snaps mid-crossfade. The first slide's image URL is unchanged, so the
// layout's LCP preload keeps matching it.
//
// The overlay splits in two: the brand group (logo above the wordmark) mounts
// once and fades in once — the maison signature holds still while the imagery
// moves beneath it. Only the CTA is keyed by the slide index, remounting on
// each change so its entrance plays slightly behind the image fade.
//
// Slides are category-based (resolveHeroSlides): each one carries a product
// category's hero image and its own CTA ("View All Rings", "View All
// Pendants"…) anchored to that category's section of the catalogue scroll.
// Legacy plain slides (no category binding) fall back to the admin-editable
// content.hero.cta.
function HeroSlider({ slides, settings, content }) {
  const [idx, setIdx] = useState(0);
  const count = slides.length;
  useEffect(() => {
    if (count < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 6200);
    return () => clearInterval(t);
  }, [count]);
  // Guard against the slide list shrinking under a live settings update.
  const active = count ? Math.min(idx, count - 1) : 0;
  const current = slides[active] || {};
  return (
    <div className="hero">
      {slides.map((s, i) => (
        <div key={s.src + i} className={'hero-slide' + (i === active ? ' on' : '')}>
          <div className="hero-slide-img"
            style={{ backgroundImage: bgImage(s.src), backgroundPosition: posFor(settings, s.src) }} />
        </div>
      ))}
      <div className="hero-overlay">
        <div className="hero-text">
          <div className="hero-brand">
            {settings.logo && (
              // The uploaded logo asset is square (800×800): matching intrinsic
              // dimensions keep next/image's reserved box and the rendered
              // proportions in agreement (the CSS sets the height, width:auto).
              <SiteImg className="hero-logo" src={settings.logo} alt="" width={800} height={800}
                sizes="240px" priority />
            )}
            <h2 className="hero-title">{content.hero.title}</h2>
            {content.hero.subtitle && <span className="hero-sub">{content.hero.subtitle}</span>}
          </div>
          <div key={active} className="hero-cta-row">
            <a className="hero-cta" href={current.href || '#catalogue'}>{current.cta || content.hero.cta}</a>
          </div>
        </div>
      </div>
      {count > 1 && (
        <>
          <button className="hero-arrow hero-arrow-l" aria-label="Previous slide"
            onClick={() => setIdx((active + count - 1) % count)}>‹</button>
          <button className="hero-arrow hero-arrow-r" aria-label="Next slide"
            onClick={() => setIdx((active + 1) % count)}>›</button>
          <div className="hero-dots">
            {slides.map((_, i) => (
              <button key={i} className={'hero-dot' + (i === active ? ' on' : '')} onClick={() => setIdx(i)}
                aria-label={'Slide ' + (i + 1)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HomePage() {
  const { settings, content } = useSiteData();
  const slides = resolveHeroSlides(settings);
  const homeBannerSrc = settings.homeBanner || null;
  return (
    <main className="malaya-page" data-screen-label="Home">
      <HeroSlider slides={slides} settings={settings} content={content} />

      <CatalogueScroll />

      {/* Cinematic closing band (PR D): a lazy layered image — the ~400 KB
          master no longer downloads for visitors who never scroll here. */}
      <section className="home-banner">
        <BannerImg src={homeBannerSrc} settings={settings} />
        <div className="home-banner-inner">
          <Reveal as="h2">{content.home.bannerTitle}</Reveal>
          <Reveal as="a" className="btn-malaya btn-malaya-light" href="#catalogue">{content.home.bannerCta}</Reveal>
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
  const { SITE_PRODUCTS, exploreTopics, exploreGroups } = useSiteData();
  const router = useRouter();

  const [active, setActive] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [fam, setFam] = useState(''); // '' | 'gold' | 'silver' — metal filter
  const [inStock, setInStock] = useState(false); // availability filter (on-hand pieces only)
  const [coll, setColl] = useState(''); // '' | collection name — set by hero CTA deep links
  const [sym, setSym] = useState(''); // '' | topic slug — symbol filter
  const [symOpen, setSymOpen] = useState(false);

  // Collection deep links (/#coll-<name>): apply the collection filter and
  // bring the catalogue into view. The hero no longer emits these (its slides
  // promote categories via /#cat-<key> anchors), but the handler stays so
  // existing bookmarks and shared links keep working. Listens for hash
  // changes so in-page clicks work too; a fresh page load jumps instantly
  // (smooth scrolling races hydration), an in-page click scrolls smoothly.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const applyHash = (smooth) => {
      const h = window.location.hash || '';
      if (!h.startsWith('#coll-')) return;
      let name = '';
      try { name = decodeURIComponent(h.slice('#coll-'.length)); } catch {}
      if (!name) return;
      setColl(name);
      requestAnimationFrame(() => {
        const el = document.getElementById('catalogue');
        if (el) el.scrollIntoView({ behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto', block: 'start' });
      });
    };
    applyHash(false);
    const onHashChange = () => applyHash(true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const clearColl = () => {
    setColl('');
    // Drop the hash so a refresh doesn't resurrect the cleared filter.
    if (window.location.hash.startsWith('#coll-')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Everything except the category grouping and the symbol filter — shared by
  // the section builder and the symbol-option counter below.
  const baseMatch = (p) => (!fam || materialFamilyOf(p.material) === fam)
    && (!inStock || isInStock(p))
    && (!coll || p.collection === coll);

  // Symbol filter options — data-driven: published topics linked to ≥1 product
  // visible under the current metal/availability/collection filters. Link a
  // topic in the admin and the option appears; remove the last link and it
  // disappears. With no published linked topic the control itself never
  // renders, so today's bar is unchanged.
  const symOptions = useMemo(() => {
    const counts = {};
    SITE_PRODUCTS.forEach((p) => {
      if (!baseMatch(p)) return;
      (p.topics || []).forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    });
    return Object.keys(counts)
      .map((slug) => ({ slug, t: (exploreTopics || {})[slug], count: counts[slug] }))
      .filter((e) => e.t && e.t.title)
      .sort((a, b) => String(a.t.title).localeCompare(String(b.t.title)));
  }, [SITE_PRODUCTS, exploreTopics, fam, inStock, coll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sym && !symOptions.some((o) => o.slug === sym)) setSym(''); }, [symOptions, sym]);

  const sections = useMemo(() => (
    CATALOGUE_SECTIONS
      .map((s) => ({
        ...s,
        items: SITE_PRODUCTS.filter((p) => s.cats.includes(p.category)
          && baseMatch(p)
          && (!sym || (p.topics || []).includes(sym))),
      }))
      .filter((s) => s.items.length > 0)
  ), [SITE_PRODUCTS, fam, inStock, coll, sym]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const query = q.trim().toLowerCase();
  const matches = query
    ? SITE_PRODUCTS.filter((p) => `${p.name} ${p.sub || ''} ${p.salesCode || ''}`.toLowerCase().includes(query)).slice(0, 8)
    : [];
  // Unified search: knowledge results (Topics / Shelves) surface above the
  // product rows. With no published Explore content this stays empty and the
  // typeahead behaves exactly as before.
  const knowledge = useMemo(
    () => (query ? searchExplore(query, { topics: exploreTopics, groups: exploreGroups, products: [] }, 4) : { topics: [], groups: [] }),
    [query, exploreTopics, exploreGroups],
  );
  // blurActiveElement: release the search field before navigating, so the
  // mobile keyboard / iOS focus zoom can't follow us onto the product page.
  const goToProduct = (id) => { setQ(''); setSearchOpen(false); blurActiveElement(); router.push('/product/' + id); };
  const goTo = (path) => { setQ(''); setSearchOpen(false); blurActiveElement(); router.push(path); };

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
          <div className="cat-fam-group" role="group" aria-label="Filter by metal and availability">
            <button type="button" className={'cat-fam' + (fam === 'gold' ? ' on' : '')}
              aria-pressed={fam === 'gold'} onClick={() => setFam(fam === 'gold' ? '' : 'gold')}>Gold</button>
            <button type="button" className={'cat-fam' + (fam === 'silver' ? ' on' : '')}
              aria-pressed={fam === 'silver'} onClick={() => setFam(fam === 'silver' ? '' : 'silver')}>Silver</button>
            <button type="button" className={'cat-fam' + (inStock ? ' on' : '')}
              aria-pressed={inStock} onClick={() => setInStock(!inStock)}>In Stock</button>
          </div>
          {coll && (
            <button type="button" className="cat-fam cat-coll on" onClick={clearColl}
              title="Clear collection filter" aria-label={'Clear collection filter: ' + coll}>
              <span>{coll}</span><span className="cat-coll-x" aria-hidden="true">×</span>
            </button>
          )}
          {symOptions.length > 0 && (
            <div className="cat-sym-wrap">
              <button type="button" className={'cat-fam cat-sym' + (sym ? ' on' : '')}
                aria-pressed={!!sym} aria-expanded={symOpen} onClick={() => setSymOpen((o) => !o)}>
                <span>{sym ? ((exploreTopics || {})[sym] || {}).title || 'Symbol' : 'Symbol'}</span>
                <span className="cat-caret">▾</span>
              </button>
              {symOpen && (
                <>
                  <div className="cat-overlay" onClick={() => setSymOpen(false)} />
                  <div className="cat-menu">
                    {sym && (
                      <button type="button" className="cat-menu-item" onClick={() => { setSym(''); setSymOpen(false); }}>
                        <span>All symbols</span>
                      </button>
                    )}
                    {symOptions.map((o) => (
                      <button key={o.slug} type="button" className={'cat-menu-item' + (o.slug === sym ? ' on' : '')}
                        onClick={() => { setSym(o.slug === sym ? '' : o.slug); setSymOpen(false); }}>
                        <span>{o.t.title}</span><em>{o.count}</em>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <div className="cat-search-wrap">
            <input className="cat-search" type="search" placeholder="Search by name or code…" value={q}
              onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) goToProduct(matches[0].id); if (e.key === 'Escape') setSearchOpen(false); }} />
            {searchOpen && query && (
              <>
                <div className="cat-overlay" onClick={() => setSearchOpen(false)} />
                <div className="cat-search-results">
                  {knowledge.topics.map((t) => (
                    <button key={'t-' + t.slug} type="button" className="cat-search-row" onClick={() => goTo('/explore/topic/' + t.slug)}>
                      <span className="cat-search-noimg cat-search-kind">✦</span>
                      <span className="cat-search-text">
                        <span className="cat-search-name">{t.title}</span>
                        <span className="cat-search-sub">Symbol · Explore{t.subtitle ? ' · ' + t.subtitle : ''}</span>
                      </span>
                    </button>
                  ))}
                  {knowledge.groups.map((g) => (
                    <button key={'g-' + g.slug} type="button" className="cat-search-row" onClick={() => goTo('/explore/' + g.slug)}>
                      <span className="cat-search-noimg cat-search-kind">✦</span>
                      <span className="cat-search-text">
                        <span className="cat-search-name">{g.name}</span>
                        <span className="cat-search-sub">Shelf · Explore</span>
                      </span>
                    </button>
                  ))}
                  {matches.length + knowledge.topics.length + knowledge.groups.length === 0 ? (
                    <div className="cat-search-empty">No matches</div>
                  ) : matches.map((p) => (
                    <button key={p.id} type="button" className="cat-search-row" onClick={() => goToProduct(p.id)}>
                      {p.img ? <SiteImg src={p.img} alt="" width={88} height={88} sizes="44px" /> : <span className="cat-search-noimg" />}
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
          No pieces match this selection yet.
        </div>
      )}
      {sections.map((s) => (
        <section key={s.key} id={'cat-' + s.key} className="cat-section site-container">
          <Reveal>
            <h2 className="section-title cat-section-title">{s.label}</h2>
            <div className="rule-dot" />
          </Reveal>
          <div className="pgrid pgrid-3">
            {s.items.map((p) => <SiteProductCard key={p.id} p={p} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Product detail ───────────────────────────────────────────────────────────
// Shopper-facing labels for the metal options (the strict material taxonomy,
// shortened where the full name reads as inventory jargon).
const METAL_LABELS = {
  'Silver 925': 'Silver',
  'Yellow Gold Plated': 'Gold Plated',
  'Rose Gold Plated': 'Rose Gold Plated',
};

// Customer-friendly metal names for the WhatsApp enquiry text (the strict
// taxonomy's "Silver 925" reads better as "Sterling Silver" in a message).
const WA_METAL_LABELS = {
  'Silver 925': 'Sterling Silver',
  'Yellow Gold Plated': 'Gold Plated (Vermeil)',
};

export function ProductPage({ id }) {
  const { SITE_PRODUCTS, SITE_BY_ID, content, settings, exploreTopics } = useSiteData();
  const router = useRouter();
  const p = SITE_BY_ID[id];
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [size, setSize] = useState(null); // selected EU ring size — shown for availability and carried into the cart
  // Page URL for the WhatsApp enquiry, set after hydration: reading
  // window.location during render would make the server- and client-rendered
  // href differ (a React hydration mismatch), since the server has no window.
  const [pageUrl, setPageUrl] = useState(null);
  const galleryRef = useRef(null);
  useEffect(() => {
    setQty(1); setActive(0); setSize(null);
    setPageUrl(window.location.href);
    if (galleryRef.current) galleryRef.current.scrollTo({ left: 0 });
  }, [id]);
  // If this id was merged into a master, canonicalise the URL to the master.
  useEffect(() => { if (p && p.id && p.id !== id) router.replace(`/product/${p.id}`); }, [p, id, router]);

  // Metal options: sibling listings of the SAME design in other metals. The
  // group key is dupKey (same category + the variant-stripped name the admin's
  // duplicate finder uses), so the selector can only ever land on this
  // design's own SKUs — never another product, category or unrelated variant.
  // One option per material; a material with several listings prefers the
  // in-stock one (the current listing always represents its own metal).
  const metalVariants = useMemo(() => {
    if (!p) return [];
    const key = dupKey(p);
    const byMetal = new Map();
    SITE_PRODUCTS.forEach((x) => {
      if (dupKey(x) !== key) return;
      const prev = byMetal.get(x.material);
      if (x.id === p.id || !prev || (prev.id !== p.id && !isInStock(prev) && isInStock(x))) {
        byMetal.set(x.material, x);
      }
    });
    return MATERIALS.filter((m) => byMetal.has(m)).map((m) => ({ material: m, product: byMetal.get(m) }));
  }, [SITE_PRODUCTS, p]);

  if (!p) {
    return (
      <main className="malaya-page" data-screen-label="Product not found">
        <PageBanner title="Not found" subtitle="Malaya Jewellery" />
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

  // Explore knowledge topics linked to this piece (published summaries only).
  // Renders nothing until the studio links a topic, so every existing product
  // page is pixel-identical until then.
  const symbolism = (p.topics || []).map((s) => (exploreTopics || {})[s]).filter((t) => t && t.title);

  // "Order Now" banner background — its own admin slot since PR D, falling
  // back to the home banner so existing sites keep their image until the
  // studio uploads a distinct one. The "Explore <category>" tile reads the
  // category banner then the default page banner (the legacy homeTiles slot
  // was removed from the admin — see SITE-IMAGES-AUDIT.md).
  const orderBannerSrc = settings.orderBanner || settings.homeBanner || null;
  const exploreImg = (settings.categoryBanners && settings.categoryBanners[p.category])
    || settings.pageBanner || null;

  const isRing = isRingCategory(p.category);

  // WhatsApp enquiry pre-filled with everything the studio needs to answer:
  // product name, SKU, the metal, any chosen ring size, and the page URL —
  // one detail per line, e.g.
  //   Hello! I'm interested in the Dorje Ring.
  //   SKU: R017A-S
  //   Metal: Sterling Silver
  //   Size: 54
  //   https://www.malayajewellery.com/product/…
  const waText = [
    `Hello! I'm interested in the ${p.name}.`,
    p.salesCode ? `SKU: ${p.salesCode}` : null,
    p.material ? `Metal: ${WA_METAL_LABELS[p.material] || p.material}` : null,
    isRing && size != null ? `Size: ${size}` : null,
    pageUrl,
  ].filter(Boolean).join('\n');
  const waUrl = whatsappUrlFor(content.contact.whatsapp, waText);

  // Gallery: every uploaded image, falling back to the single primary photo.
  // The photos live in a scroll-snap strip — swipe (or drag) moves between
  // them and the thumbnails stay in step; tapping the photo never swaps it.
  const images = (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []);
  const monogram = (p.productionCode || p.salesCode || p.name || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'M';
  const onGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (i !== active) setActive(i);
  };
  const showImage = (i) => {
    setActive(i);
    const el = galleryRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // Editable story (admin-saved), split into paragraphs; falls back to the global
  // credit line (admin Content → Product page).
  const story = (p.story && p.story.trim())
    ? p.story.trim().split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean)
    : [content.product.credit];

  return (
    <main className="malaya-page" data-screen-label={'Product · ' + p.name}>
      <PageBanner plain title={p.name} />
      <div className="site-container pd-layout">
        <div className="pd-media">
          <div className="pd-photo">
            {images.length
              ? (
                <div className="pd-gallery" ref={galleryRef} onScroll={onGalleryScroll}
                  aria-label={`${p.name} — photo gallery`}>
                  {images.map((src, i) => (
                    <div key={src + i} className="pd-slide">
                      <SiteImg src={src} alt={i === 0 ? p.name : `${p.name} — view ${i + 1}`} priority={i === 0}
                        sizes="(max-width: 900px) 100vw, 620px" width={1240} height={1240} />
                    </div>
                  ))}
                </div>
              )
              : <div className="pd-noimg"><span>{monogram}</span></div>}
            {p.tashi && settings.tashiBadge && <SiteImg className="pd-tashi" src={settings.tashiBadge}
              alt="Tashi Mannox" width={108} height={108} sizes="54px" />}
          </div>
          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((src, i) => (
                <button key={src + i} type="button" className={'pd-thumb' + (i === active ? ' on' : '')}
                  onClick={() => showImage(i)} aria-label={`View image ${i + 1}`}>
                  <SiteImg src={src} alt={`${p.name} — view ${i + 1}`} width={148} height={148} sizes="74px" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pd-info">
          <nav className="pd-crumbs">
            <Link href="/">Home</Link><span>/</span>
            <Link href={sectionAnchor(p.category)}>{p.category}</Link>
          </nav>
          <h1 className="pd-name">{p.name}</h1>
          <p className="pd-sub">{p.sub}</p>
          <div className="pd-price">
            {p.onSale && <s>{fmtPrice(p.listPrice)}</s>}
            <strong>{fmtPrice(p.price)}</strong>
            <span className="pd-stock">{p.stock}</span>
          </div>
          <div className="rule-dot" style={{ margin: '18px 0' }} />

          {/* Metal — switches between this design's own metal variants (other
              SKUs of the same piece); the URL moves to that variant's listing
              and nothing else about the page context changes. */}
          {metalVariants.length > 1 && (
            <div className="pd-opt">
              <span className="pd-opt-label">Metal</span>
              <div className="pd-metals" role="group" aria-label="Metal">
                {metalVariants.map(({ material, product: v }) => {
                  const on = material === p.material;
                  return (
                    <button key={material} type="button" className={'pd-metal' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() => { if (!on && v.id !== p.id) router.push(`/product/${v.id}`); }}>
                      {METAL_LABELS[material] || material}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ring size — a dropdown (never every size at once): availability
              within this SKU only. Each option says in stock / made to order;
              choosing a size never changes the product, SKU or price. */}
          {isRing && (
            <div className="pd-opt">
              <span className="pd-opt-label">Ring Size <em>· EU</em></span>
              <select className="pd-size-select" aria-label="Ring size (EU)"
                value={size == null ? '' : String(size)}
                onChange={(e) => setSize(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Select your size…</option>
                {RING_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {`Size ${s} — ${ringSizeQty(p.sizes, s) > 0 ? 'in stock' : 'made to order'}`}
                  </option>
                ))}
              </select>
              {size != null && (
                <p className="pd-size-status">
                  Size {size} — {ringSizeQty(p.sizes, size) > 0 ? <strong>in stock</strong> : 'made to order'}
                </p>
              )}
              <p className="pd-size-note">
                Standard women&rsquo;s sizes: 50–57 · Standard men&rsquo;s sizes: 57–68 ·{' '}
                <Link href="/blog/ring-sizing">Ring Size Guide</Link>
              </p>
            </div>
          )}

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
          <a className="pd-whatsapp" href={waUrl} target="_blank" rel="noreferrer">
            Ask about this piece on WhatsApp →
          </a>
        </div>
      </div>

      {/* Both banner entrances are scroll-triggered: they sit below the fold,
          so a load-time animation would finish before anyone saw it. Their
          images are lazy layers (PR D) — two ~400 KB eager backgrounds no
          longer load on every product view. */}
      <section className="pd-order-banner">
        <BannerImg src={orderBannerSrc} settings={settings} />
        <div className="site-container pd-order-layout">
          <Reveal className="pd-order-card">
            <div className="pd-order-head">
              <span className="pd-order-kicker">Order Now</span>
              <span className="pd-order-price">
                {p.onSale && <s>{fmtPrice(p.listPrice)}</s>}
                <strong>{fmtPrice(p.price)}</strong>
              </span>
            </div>
            <div className="pd-order-buy">
              <div className="pd-qty">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty(qty + 1)}>+</button>
              </div>
              <button className="btn-malaya" disabled={sold}
                onClick={() => addToCart(p.id, qty, isRing ? size : null)}>{sold ? 'Sold Out' : 'Add to Order'}</button>
            </div>
          </Reveal>
        </div>
      </section>

      <Link className="pd-explore" href={sectionAnchor(p.category)}>
        <BannerImg src={exploreImg} settings={settings} />
        <Reveal as="span" className="pd-explore-inner">
          <em className="pd-explore-kicker">Discover more</em>
          <strong className="pd-explore-title">Explore {p.category}</strong>
        </Reveal>
      </Link>

      {symbolism.length > 0 && (
        <section className="site-container pd-symbolism">
          <Reveal>
            <h2 className="section-title">The Symbolism Behind This Design</h2>
            <div className="rule-dot" />
          </Reveal>
          <div className="pd-symbolism-grid">
            {symbolism.map((t) => (
              <Link key={t.slug} href={`/explore/topic/${t.slug}`} className="pd-symbolism-item">
                <strong>{t.title}</strong>
                {t.subtitle && <em>{t.subtitle}</em>}
                {t.excerpt && <span>{t.excerpt}</span>}
                <span className="pd-symbolism-more">Read the story →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="site-container pd-related">
          <Reveal>
            <h2 className="section-title">You May Also Like</h2>
            <div className="rule-dot" />
          </Reveal>
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
  const { TASHI_PRODUCTS, settings, content, exploreTopics } = useSiteData();
  // "Sacred forms in his hand" — fully derived, zero new storage: the topics
  // linked to pieces carrying the tashi special (EXPLORE.md §7). Renders null
  // while no tashi-flagged piece has a published topic, so the page ships
  // unchanged and lights up by itself as the studio links topics.
  const tashiTopics = useMemo(() => {
    const seen = new Set();
    const out = [];
    TASHI_PRODUCTS.forEach((p) => (p.topics || []).forEach((s) => {
      if (seen.has(s)) return;
      seen.add(s);
      const t = (exploreTopics || {})[s];
      if (t && t.title) out.push(t);
    }));
    return out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }, [TASHI_PRODUCTS, exploreTopics]);
  return (
    <main className="malaya-page" data-screen-label="Tashi Mannox">
      <PageBanner variant="chapter" title={content.banners.tashi.title} subtitle={content.banners.tashi.subtitle}
        img={settings.tashiBanner || null} />
      <div className="site-container tashi-intro">
        <div className="tashi-text">
          <h3 className="tashi-kicker">{content.tashi.kicker}</h3>
          <h2 className="tashi-name">{content.tashi.name}</h2>
          <h4 className="tashi-role">{content.tashi.role}</h4>
          {content.tashi.intro.map((para, i) => <p key={i} className="tashi-para">{para}</p>)}
        </div>
        <Reveal as="figure" className="tashi-photo">
          <SiteImg src={settings.tashiPhoto || null} alt={content.tashi.name}
            sizes="(max-width: 900px) 100vw, 460px" width={920} height={1100} priority />
          <figcaption className="tashi-photo-caption">{content.tashi.name} · {content.tashi.role}</figcaption>
        </Reveal>
      </div>
      {settings.tashiCalligraphy && (
        <Reveal className="tashi-interlude">
          <BannerImg src={settings.tashiCalligraphy} settings={settings} />
        </Reveal>
      )}
      <section className="site-container tashi-products">
        <Reveal>
          <h2 className="section-title">{content.tashi.productsTitle}</h2>
          <div className="rule-dot" />
        </Reveal>
        <div className="pgrid pgrid-3">
          {TASHI_PRODUCTS.map((p) => <SiteProductCard key={p.id} p={p} />)}
        </div>
      </section>
      {tashiTopics.length > 0 && (
        <section className="site-container tashi-explore">
          <Reveal>
            <h3 className="tashi-explore-kicker">Sacred forms in his hand</h3>
            <div className="rule-dot" />
          </Reveal>
          <p className="tashi-explore-links">
            {tashiTopics.map((t, i) => (
              <span key={t.slug}>
                {i > 0 && <span className="tashi-explore-sep"> · </span>}
                <Link href={`/explore/topic/${t.slug}`}>{t.title}</Link>
              </span>
            ))}
          </p>
        </section>
      )}
    </main>
  );
}

// Full-width editorial figure dropped into the About article body — the
// `.about-figure` CSS has existed since PR A but had no JSX consumer until
// this one (VISUAL-AUDIT §1.7 / PR F).
function AboutFigure({ src, caption, pos }) {
  if (!src) return null;
  return (
    <Reveal as="figure" className="about-figure">
      <SiteImg src={src} alt={caption || ''} width={1600} height={1000} sizes="(max-width: 900px) 100vw, 920px"
        style={{ objectPosition: pos || 'center' }} />
      {caption && <figcaption>{caption}</figcaption>}
    </Reveal>
  );
}

// ── About ────────────────────────────────────────────────────────────────────
export function AboutPage() {
  const { settings, content } = useSiteData();
  const about = content.about;
  // Up to two admin-uploaded figures, spread evenly through the body
  // paragraphs (e.g. 2 figures across 5 paragraphs land after the 1st and
  // the 3rd) so the article alternates text and photography.
  const figures = (Array.isArray(settings.aboutFigures) ? settings.aboutFigures : [])
    .filter((f) => f && f.src).slice(0, 2);
  const figureAfter = new Map();
  figures.forEach((fig, k) => {
    const pos = Math.min(about.body.length - 1,
      Math.max(0, Math.floor(((k + 1) * about.body.length) / (figures.length + 1)) - 1));
    figureAfter.set(pos, fig);
  });
  return (
    <main className="malaya-page" data-screen-label="About">
      <PageBanner variant="chapter" title={content.banners.about.title} subtitle={content.banners.about.subtitle} img={settings.aboutBanner || null} />
      <article className="site-container about-article">
        <p className="about-date">{about.date}</p>
        <h1 className="about-title">{about.title}</h1>
        <p className="about-lead">{about.lead}</p>
        <div className="about-tags">
          {CATEGORIES.map((c) => <Link key={c} href={sectionAnchor(c)}>{c}</Link>)}
        </div>
        <p className="about-from">{about.from}</p>
        {about.body.map((para, i) => (
          <Fragment key={i}>
            <p className="about-para">{para}</p>
            {figureAfter.has(i) && <AboutFigure {...figureAfter.get(i)} pos={posFor(settings, figureAfter.get(i).src)} />}
          </Fragment>
        ))}
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
    window.open('mailto:' + ct.email + '?subject=' + encodeURIComponent('Malaya Jewellery enquiry') + '&body=' + body);
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
  // The checkout hand-off IS the WhatsApp message: it must carry the actual
  // order — every line with its reference and chosen ring size, plus the
  // total — so the studio can confirm without asking everything again.
  const waText = [
    "Hello! I'd like to place this order:",
    ...items.map((i) => {
      const p = SITE_BY_ID[i.id];
      if (!p) return null;
      return `• ${p.name}${p.salesCode ? ` (${p.salesCode})` : ''}${i.size != null ? ` — size ${i.size} EU` : ''} × ${i.qty}`;
    }).filter(Boolean),
    `Total: ${fmtPrice(total)}`,
  ].join('\n');
  const waHref = whatsappUrlFor(content.contact.whatsapp, waText);
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
                  if (!p) {
                    // The piece was removed from the catalogue after it was
                    // added: keep the line visible with a working remove
                    // button, or the header count never matches the table.
                    return (
                      <tr key={cartLineKey(i)}>
                        <td className="order-thumb" />
                        <td colSpan={3}>
                          <span className="order-name">Item no longer available</span>
                          <span className="order-sub">This piece has left the catalogue — please remove it.</span>
                        </td>
                        <td />
                        <td><button className="hdr-cart-x" onClick={() => removeFromCart(i.id, i.size)} title="Remove">×</button></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={cartLineKey(i)}>
                      <td className="order-thumb">
                        <Link href={`/product/${p.id}`}><SiteImg src={p.img} alt={p.name} width={148} height={148} sizes="74px" /></Link>
                      </td>
                      <td>
                        <Link className="order-name" href={`/product/${p.id}`}>{p.name}</Link>
                        <span className="order-sub">{p.sub}</span>
                        {i.size != null && <span className="order-sub">Ring size {i.size} · EU</span>}
                      </td>
                      <td>{fmtPrice(p.price)}</td>
                      <td>
                        <div className="pd-qty pd-qty-sm">
                          <button onClick={() => setCartQty(i.id, i.qty - 1, i.size)}>−</button>
                          <span>{i.qty}</span>
                          <button onClick={() => setCartQty(i.id, i.qty + 1, i.size)}>+</button>
                        </div>
                      </td>
                      <td><strong>{fmtPrice(p.price * i.qty)}</strong></td>
                      <td><button className="hdr-cart-x" onClick={() => removeFromCart(i.id, i.size)} title="Remove">×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <aside className="order-summary">
              <h4 className="shop-filter-head">Order Summary</h4>
              <div className="order-total"><span>TOTAL</span><strong>{fmtPrice(total)}</strong></div>
              <a className="btn-malaya btn-malaya-gold" style={{ display: 'block', textAlign: 'center' }}
                href={waHref} target="_blank" rel="noreferrer">Checkout via WhatsApp</a>
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
        <PageBanner title="Not found" subtitle="Malaya Jewellery" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This page could not be found. <Link href="/">Back to the home page.</Link></p>
        </div>
      </main>
    );
  }
  return (
    <main className="malaya-page" data-screen-label={'Policy · ' + data.title}>
      <PageBanner title={data.title} subtitle="Malaya Jewellery" />
      <article className="site-container about-article">
        <h1 className="about-title">{data.title}</h1>
        {data.body.map((para, i) => <p key={i} className="about-para">{para}</p>)}
      </article>
    </main>
  );
}
