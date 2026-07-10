'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Blog storefront: a magazine card grid index (/blog) and the single-post article
// (/blog/<slug>). Posts come from the live blog layer via SiteDataContext; product
// and post cross-links inside the body are resolved by <Markdown>.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { useSiteData } from './store';
import { SiteImg, PageBanner } from './SiteShell';
import { blogList } from '@/lib/blog';
import Markdown from './Markdown';

function initialsOf(s) {
  return (String(s || 'M').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()) || 'M';
}

// Featured post — the newest story opens the index full-width, magazine
// front-page style (VISUAL-AUDIT PR E): a wide 21:9 crop with the title,
// date and excerpt beneath it; the rest of the archive keeps the card grid.
function BlogFeature({ p }) {
  return (
    <article className="blog-feature">
      <Link className="blog-feature-thumb" href={`/blog/${p.slug}`}>
        {p.cover
          ? <SiteImg src={p.cover} alt={p.title} sizes="(max-width: 900px) 100vw, 1440px" width={1920} height={823} />
          : <span className="blog-card-noimg">{initialsOf(p.title)}</span>}
      </Link>
      <div className="blog-feature-body">
        {p.date && <span className="blog-card-date">{p.date}</span>}
        <Link href={`/blog/${p.slug}`} className="blog-feature-title">{p.title}</Link>
        {p.excerpt && <p className="blog-feature-excerpt">{p.excerpt}</p>}
        <Link href={`/blog/${p.slug}`} className="blog-feature-more">Read the story →</Link>
      </div>
    </article>
  );
}

function BlogCard({ p }) {
  return (
    <article className="blog-card">
      <Link className="blog-card-thumb" href={`/blog/${p.slug}`}>
        {p.cover
          ? <SiteImg src={p.cover} alt={p.title} sizes="(max-width: 700px) 100vw, 400px" width={800} height={534} />
          : <span className="blog-card-noimg">{initialsOf(p.title)}</span>}
      </Link>
      <div className="blog-card-body">
        {p.date && <span className="blog-card-date">{p.date}</span>}
        <Link href={`/blog/${p.slug}`} className="blog-card-title">{p.title}</Link>
        {p.excerpt && <p className="blog-card-excerpt">{p.excerpt}</p>}
      </div>
    </article>
  );
}

export function BlogIndex() {
  const { blogPosts, content } = useSiteData();
  const posts = blogList(blogPosts || {}, { publishedOnly: true });
  const [featured, ...rest] = posts;
  return (
    <main className="malaya-page" data-screen-label="Blog">
      <PageBanner variant="chapter" title={content.nav.blog || 'Blog'} subtitle="Malaya Jewellery" bannerKey="blogBanner" />
      <div className="site-container blog-wrap">
        {posts.length === 0 ? (
          <div className="blog-empty">No posts yet — check back soon.</div>
        ) : (
          <>
            <BlogFeature p={featured} />
            {rest.length > 0 && (
              <div className="blog-grid">
                {rest.map((p) => <BlogCard key={p.slug} p={p} />)}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export function BlogPost({ slug }) {
  const { blogPosts, SITE_PRODUCTS, exploreTopics } = useSiteData();
  const map = blogPosts || {};
  const p = map[slug] || Object.values(map).find((x) => x && x.slug === slug);
  const posts = Object.values(map);
  const topics = Object.values(exploreTopics || {});

  if (!p || !p.title || !p.published) {
    return (
      <main className="malaya-page" data-screen-label="Post not found">
        <PageBanner title="Not found" subtitle="Malaya Jewellery" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This post could not be found. <Link href="/blog">Back to the blog.</Link></p>
        </div>
      </main>
    );
  }

  return (
    <main className={'malaya-page' + (p.cover ? ' malaya-page-blog-cover' : ' malaya-page-header-pad')} data-screen-label={'Blog · ' + p.title}>
      {p.cover && <SiteImg className="blog-hero" src={p.cover} alt={p.title} priority sizes="100vw" width={1920} height={720} />}
      <article className="blog-article">
        {p.date && <div className="blog-meta">{p.date}</div>}
        <h1 className="blog-title">{p.title}</h1>
        {Array.isArray(p.tags) && p.tags.length > 0 && (
          <div className="blog-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
        )}
        <Markdown source={p.body} posts={posts} products={SITE_PRODUCTS || []} topics={topics} />
        <Link className="blog-back" href="/blog">← All posts</Link>
      </article>
    </main>
  );
}
