'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Explore — the editorial knowledge layer (/explore, /explore/<group>,
// /explore/topic/<slug>). Listing markup (cards, shelves) is prop-driven so
// the ISR server pages can compose it; the topic page is the one live surface
// (it subscribes to its single Firestore document, so admin edits appear
// immediately). Content is an ordered array of typed blocks rendered through
// the BLOCK_COMPONENTS registry — an unknown type renders nothing, so new
// block types are additive and old clients degrade silently.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { subscribeTopic, topicProducts, relatedTopics, groupsOfTopic, primaryGroupOf, searchExplore } from '@/lib/explore';
import { bgImage } from '@/lib/data/site-data';
import { useSiteData, blurActiveElement } from './store';
import { SiteImg, SiteProductCard } from './SiteShell';
import { Reveal } from './reveal';
import FloatingProduct from './FloatingProduct';
import Markdown from './Markdown';

// Resolve a product reference (id, merged alias or sales code) through the
// already-resolved catalogue. A dangling reference renders nothing.
const productOf = (ref, byId) => (ref && byId && byId[ref]) || null;

const initialsOf = (s) => (String(s || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()) || 'M';

// ── Topic card (listings, related rails, search) ─────────────────────────────
export function TopicCard({ t }) {
  if (!t || !t.title) return null;
  return (
    <Link href={`/explore/topic/${t.slug}`} className="explore-card">
      <span className="explore-card-thumb">
        {t.heroImage
          ? <SiteImg src={t.heroImage} alt={t.title} width={640} height={480}
              sizes="(max-width: 700px) 100vw, 320px"
              style={t.heroPos ? { objectPosition: t.heroPos } : undefined} />
          : <span className="explore-card-noimg">{initialsOf(t.title)}</span>}
      </span>
      <span className="explore-card-body">
        <strong className="explore-card-title">{t.title}</strong>
        {t.subtitle && <em className="explore-card-sub">{t.subtitle}</em>}
        {t.excerpt && <span className="explore-card-excerpt">{t.excerpt}</span>}
      </span>
    </Link>
  );
}

// Featured topic — the shelf's first topic opens as a wide two-column card
// (16:9 crop + excerpt) so every shelf leads with a moment of rhythm instead
// of an undifferentiated grid (VISUAL-AUDIT PR E).
function TopicFeature({ t }) {
  if (!t || !t.title) return null;
  return (
    <Link href={`/explore/topic/${t.slug}`} className="explore-feature">
      <span className="explore-feature-thumb">
        {t.heroImage
          ? <SiteImg src={t.heroImage} alt={t.title} width={1280} height={720}
              sizes="(max-width: 880px) 100vw, 800px"
              style={t.heroPos ? { objectPosition: t.heroPos } : undefined} />
          : <span className="explore-card-noimg">{initialsOf(t.title)}</span>}
      </span>
      <span className="explore-feature-body">
        <strong className="explore-feature-title">{t.title}</strong>
        {t.subtitle && <em className="explore-card-sub">{t.subtitle}</em>}
        {t.excerpt && <span className="explore-card-excerpt">{t.excerpt}</span>}
        <span className="explore-feature-more">Read the story →</span>
      </span>
    </Link>
  );
}

// ── Shelf (one group + its topics, in the shelf's own order) ─────────────────
export function ExploreShelf({ group, topics }) {
  return (
    <section className="explore-shelf">
      <div className="explore-shelf-head">
        <h2 className="section-title" style={{ textAlign: 'left' }}>
          <Link href={`/explore/${group.slug}`}>{group.name}</Link>
        </h2>
        <Link className="explore-shelf-all" href={`/explore/${group.slug}`}>
          View shelf{topics.length ? ` (${topics.length})` : ''} →
        </Link>
      </div>
      {group.description && <p className="explore-shelf-desc">{group.description}</p>}
      <div className="rule-dot" style={{ margin: '14px 0 26px' }} />
      {topics.length ? (
        <>
          <TopicFeature t={topics[0]} />
          {topics.length > 1 && (
            <div className="explore-tgrid">{topics.slice(1).map((t) => <TopicCard key={t.slug} t={t} />)}</div>
          )}
        </>
      ) : <p className="explore-empty">The studio is preparing this shelf — check back soon.</p>}
    </section>
  );
}

// ── Unified Explore search (landing) — Topics / Groups / Products ────────────
export function ExploreSearch() {
  const { SITE_PRODUCTS, exploreTopics, exploreGroups } = useSiteData();
  const [q, setQ] = useState('');
  const results = useMemo(
    () => searchExplore(q, { topics: exploreTopics, groups: exploreGroups, products: SITE_PRODUCTS }),
    [q, exploreTopics, exploreGroups, SITE_PRODUCTS],
  );
  const any = results.topics.length + results.groups.length + results.products.length > 0;
  return (
    <div className="explore-search">
      <input type="search" className="explore-search-input" value={q}
        placeholder="Search symbols, shelves and pieces — try “Palbeu” or “Endless Knot”…"
        onChange={(e) => setQ(e.target.value)} />
      {q.trim() && (
        // Release the search field when a result is tapped: a focused input
        // keeps the mobile keyboard (and iOS's focus zoom) alive across the
        // client-side route change, so the product page could open zoomed in.
        <div className="explore-search-results" onClick={blurActiveElement}>
          {!any && <p className="explore-empty">Nothing matches yet.</p>}
          {results.topics.length > 0 && (
            <div className="explore-search-group">
              <h4 className="shop-filter-head">Symbols &amp; Topics</h4>
              {results.topics.map((t) => (
                <Link key={t.slug} className="explore-search-row" href={`/explore/topic/${t.slug}`}>
                  <strong>{t.title}</strong>{t.subtitle && <em> · {t.subtitle}</em>}
                </Link>
              ))}
            </div>
          )}
          {results.groups.length > 0 && (
            <div className="explore-search-group">
              <h4 className="shop-filter-head">Shelves</h4>
              {results.groups.map((g) => (
                <Link key={g.slug} className="explore-search-row" href={`/explore/${g.slug}`}>
                  <strong>{g.name}</strong>
                </Link>
              ))}
            </div>
          )}
          {results.products.length > 0 && (
            <div className="explore-search-group">
              <h4 className="shop-filter-head">Pieces</h4>
              {results.products.map((p) => (
                <Link key={p.id} className="explore-search-row" href={`/product/${p.id}`}>
                  <strong>{p.name}</strong>{p.sub && <em> · {p.sub}</em>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Content blocks ────────────────────────────────────────────────────────────
// Every component reads its own props defensively (missing prop → render
// nothing) because rules can't deep-validate block internals.

function RichTextBlock({ md, ctx }) {
  if (!md) return null;
  return <Markdown source={md} posts={ctx.posts} products={ctx.products} topics={ctx.topics} />;
}

function FloatProductBlock({ productId, side, caption, src, ctx }) {
  const p = productOf(productId, ctx.byId);
  if (!p && !src) return null;
  return <FloatingProduct p={p} side={side} caption={caption} src={src} />;
}

function HotspotImageBlock({ src, alt, caption, pos, hotspots, ctx }) {
  if (!src) return null;
  return (
    <Reveal as="figure" className="explore-figure">
      <span className="explore-hotspot-wrap">
        <SiteImg src={src} alt={alt || caption || ''} width={1600} height={1000} sizes="(max-width: 900px) 100vw, 820px"
          style={pos ? { objectPosition: pos } : undefined} />
        {(hotspots || []).map((h, i) => {
          const p = h && productOf(h.productId, ctx.byId);
          if (!p || !(h.x >= 0 && h.x <= 1 && h.y >= 0 && h.y <= 1)) return null;
          return (
            <Link key={i} href={`/product/${p.id}`} className="explore-hotspot"
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              aria-label={h.label || p.name}>
              <span className="explore-hotspot-dot" />
              <span className="explore-hotspot-tip">{h.label || p.name}</span>
            </Link>
          );
        })}
      </span>
      {caption && <figcaption>{caption}</figcaption>}
    </Reveal>
  );
}

function QuoteBlock({ text, attribution }) {
  if (!text) return null;
  return (
    <Reveal as="blockquote" className="explore-quote">
      <p>{text}</p>
      {attribution && <cite>{attribution}</cite>}
    </Reveal>
  );
}

function DividerBlock({ style }) {
  if (style === 'knot') return <div className="explore-divider" aria-hidden="true"><span>◆</span></div>;
  return <div className="rule-dot" style={{ margin: '34px auto' }} />;
}

function ProductGridBlock({ mode, ids, title, limit, ctx }) {
  const linked = mode !== 'manual';
  let items = linked
    ? topicProducts(ctx.topic && ctx.topic.slug, ctx.products)
    : (ids || []).map((id) => productOf(id, ctx.byId)).filter(Boolean);
  const seen = new Set();
  items = items.filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (limit > 0) items = items.slice(0, limit);
  if (!items.length) return null;
  return (
    <section className="explore-block-products">
      {title && <Reveal><h2 className="section-title">{title}</h2><div className="rule-dot" /></Reveal>}
      <div className="pgrid pgrid-3">{items.map((p) => <SiteProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}

function RelatedTopicsBlock({ mode, slugs, title, ctx }) {
  const items = mode === 'manual'
    ? (slugs || []).map((s) => ctx.topicsMap[s]).filter((t) => t && t.title && t.published !== false)
    : relatedTopics(ctx.topic, ctx.groupsMap, ctx.topicsMap);
  if (!items.length) return null;
  return (
    <section className="explore-related">
      <h3 className="explore-related-title">{title || 'Related symbols'}</h3>
      <div className="explore-tgrid explore-tgrid-tight">{items.map((t) => <TopicCard key={t.slug} t={t} />)}</div>
    </section>
  );
}

function CalloutBlock({ title, md, tone, ctx }) {
  if (!md && !title) return null;
  return (
    <aside className={'explore-callout' + (tone === 'ritual' ? ' explore-callout-ritual' : '')}>
      {title && <h4 className="explore-callout-title">{title}</h4>}
      {md && <Markdown source={md} posts={ctx.posts} products={ctx.products} topics={ctx.topics} />}
    </aside>
  );
}

function GalleryBlock({ items }) {
  const list = (items || []).filter((it) => it && it.src);
  if (!list.length) return null;
  return (
    <div className="explore-gallery">
      {list.map((it, i) => (
        <Reveal as="figure" key={i} className="explore-gallery-item">
          <SiteImg src={it.src} alt={it.caption || ''} width={900} height={1200} sizes="(max-width: 700px) 100vw, 400px" />
          {(it.caption || it.location) && (
            <figcaption>{it.caption}{it.caption && it.location ? ' — ' : ''}{it.location && <em>{it.location}</em>}</figcaption>
          )}
        </Reveal>
      ))}
    </div>
  );
}

const BLOCK_COMPONENTS = {
  richText: RichTextBlock,
  floatProduct: FloatProductBlock,
  editorialImage: HotspotImageBlock,
  quote: QuoteBlock,
  divider: DividerBlock,
  productGrid: ProductGridBlock,
  relatedTopics: RelatedTopicsBlock,
  callout: CalloutBlock,
  architectureGallery: GalleryBlock,
};

// ctx: { topic, products, byId, topicsMap, groupsMap, topics, posts } — the
// admin's live preview builds the same shape, so the preview IS this renderer.
export function BlockRenderer({ blocks, ctx }) {
  return (
    <>
      {(blocks || []).map((b, i) => {
        const C = b && BLOCK_COMPONENTS[b.type];
        return C ? <C key={b.id || i} {...b} ctx={ctx} /> : null;
      })}
    </>
  );
}

// ── The canonical topic page ─────────────────────────────────────────────────
export function TopicPage({ slug, initialTopic = null }) {
  const { SITE_PRODUCTS, SITE_BY_ID, blogPosts, exploreTopics, exploreGroups } = useSiteData();
  const [topic, setTopic] = useState(initialTopic);

  // Live view of this one document: admin edits stream straight onto the page.
  // Visitors can't read drafts (rules) — the subscription then never fires and
  // the server-rendered state stands; a signed-in admin sees the draft live.
  useEffect(
    () => subscribeTopic(slug, (t) => setTopic(t), { skipCache: true }),
    [slug],
  );

  const posts = useMemo(() => Object.values(blogPosts || {}), [blogPosts]);
  const topicsList = useMemo(() => Object.values(exploreTopics || {}), [exploreTopics]);
  const ctx = useMemo(() => ({
    topic,
    products: SITE_PRODUCTS,
    byId: SITE_BY_ID,
    topicsMap: exploreTopics || {},
    groupsMap: exploreGroups || {},
    topics: topicsList,
    posts,
  }), [topic, SITE_PRODUCTS, SITE_BY_ID, exploreTopics, exploreGroups, topicsList, posts]);

  if (!topic || !topic.title) {
    return (
      <main className="malaya-page" data-screen-label="Topic not found">
        <div className="explore-hero"><div className="site-container">
          <span className="explore-hero-kicker">Explore</span>
          <h1 className="explore-hero-title">Not found</h1>
        </div></div>
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This topic could not be found. <Link href="/explore">Back to Explore.</Link></p>
        </div>
      </main>
    );
  }

  const blocks = topic.blocks || [];
  const shelves = groupsOfTopic(slug, exploreGroups || {});
  const primary = primaryGroupOf(slug, exploreGroups || {});
  const pieces = topicProducts(slug, SITE_PRODUCTS);
  const siblings = relatedTopics(topic, exploreGroups || {}, exploreTopics || {});
  // The automatic rails stay out of the way when the article already places
  // the equivalent block itself (EXPLORE.md §5).
  const hasOwnGrid = blocks.some((b) => b && b.type === 'productGrid' && b.mode !== 'manual');
  const hasOwnRelated = blocks.some((b) => b && b.type === 'relatedTopics');

  return (
    <main className="malaya-page explore-page" data-screen-label={'Explore · ' + topic.title}>
      <div className={'explore-hero' + (topic.heroImage ? ' explore-hero-img' : '')}
        style={topic.heroImage ? { backgroundImage: bgImage(topic.heroImage), backgroundPosition: topic.heroPos || 'center' } : undefined}>
        <Reveal className="site-container">
          <span className="explore-hero-kicker">{primary ? primary.name : 'Explore'}</span>
          <h1 className="explore-hero-title">{topic.title}</h1>
          {topic.subtitle && <span className="explore-hero-sub">{topic.subtitle}</span>}
        </Reveal>
      </div>

      <article className="site-container explore-article">
        <nav className="explore-crumbs">
          <Link href="/">Home</Link><span>/</span>
          <Link href="/explore">Explore</Link>
          {primary && <><span>/</span><Link href={`/explore/${primary.slug}`}>{primary.name}</Link></>}
        </nav>
        {topic.published === false && (
          <p className="explore-draft-note">Draft — visible only to the studio. Publish it from the admin’s Explore tab.</p>
        )}
        <BlockRenderer blocks={blocks} ctx={ctx} />
      </article>

      {!hasOwnGrid && pieces.length > 0 && (
        <section className="site-container explore-pieces">
          <Reveal>
            <h2 className="section-title">Pieces bearing this symbol</h2>
            <div className="rule-dot" />
          </Reveal>
          <div className="pgrid pgrid-3">{pieces.map((p) => <SiteProductCard key={p.id} p={p} />)}</div>
        </section>
      )}

      {(!hasOwnRelated && siblings.length > 0) || shelves.length > 0 ? (
        <section className="site-container explore-foot">
          {!hasOwnRelated && siblings.length > 0 && (
            <>
              <h3 className="explore-related-title">Related symbols</h3>
              <div className="explore-tgrid explore-tgrid-tight">
                {siblings.map((t) => <TopicCard key={t.slug} t={t} />)}
              </div>
            </>
          )}
          {shelves.length > 0 && (
            <p className="explore-partof">
              Part of{' '}
              {shelves.map((g, i) => (
                <span key={g.slug}>
                  {i > 0 && ' · '}
                  <Link href={`/explore/${g.slug}`}>{g.name}</Link>
                </span>
              ))}
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
