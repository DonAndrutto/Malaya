import { getServerSiteData, SITE_URL } from '@/lib/server/site';
import { fetchPublishedBlogPosts } from '@/lib/server/firestore';
import { fetchPublishedGroups, fetchPublishedTopicSummaries } from '@/lib/server/explore';

// ISR safety net. 24h, matching REVALIDATE_SECONDS (lib/server/firestore.js):
// admin publishes purge this route on demand, so the TTL only has to catch a
// ping that never landed. Route segment config must be a statically analysable
// literal, so it cannot import the constant — lib/server/cache-policy.test.js
// pins the two together. See CACHING.md.
//
// The TTL matters more here than elsewhere: this is a metadata *route*, and
// Next 14's built-in filesystem cache handler only checks cache tags for
// entries of kind PAGE and FETCH — never ROUTE — so neither revalidateTag nor
// revalidatePath('/sitemap.xml') actually drops a cached sitemap when
// self-hosting (verified against next@14.2.35). Both are still called from
// app/api/revalidate because Vercel's own cache handler is a different
// implementation, but do not rely on them: assume a newly published product,
// post or topic can take up to a day to appear HERE. It is linked from the
// storefront the moment it publishes either way, and search engines refetch a
// sitemap roughly daily, so a 24h floor costs nothing measurable. Drop this to
// 3600 if you ever want the old behaviour back — it costs ~24 writes/day.
export const revalidate = 86400;

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/explore', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/tashi', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/policy/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/policy/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/policy/cookie', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/policy/refund', priority: 0.2, changeFrequency: 'yearly' },
];

export default async function sitemap() {
  const [{ SITE_PRODUCTS }, blogPosts, exploreGroups, exploreTopics] = await Promise.all([
    getServerSiteData(),
    fetchPublishedBlogPosts(),
    fetchPublishedGroups(),
    fetchPublishedTopicSummaries(),
  ]);

  const statics = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path === '/' ? '' : r.path}` || SITE_URL,
    priority: r.priority,
    changeFrequency: r.changeFrequency,
  }));

  const products = SITE_PRODUCTS.map((p) => ({
    url: `${SITE_URL}/product/${encodeURIComponent(p.id)}`,
    priority: 0.8,
    changeFrequency: 'weekly',
  }));

  const posts = Object.values(blogPosts)
    .filter((p) => p && p.title)
    .map((p) => ({
      url: `${SITE_URL}/blog/${encodeURIComponent(p.slug)}`,
      priority: 0.6,
      changeFrequency: 'monthly',
      ...(p.date && !Number.isNaN(Date.parse(p.date)) ? { lastModified: new Date(p.date) } : {}),
    }));

  // Explore: published shelves and every published topic page (lastModified
  // from the document's own _updated stamp — `updated` in the projection).
  const groups = Object.values(exploreGroups)
    .filter((g) => g && g.name)
    .map((g) => ({
      url: `${SITE_URL}/explore/${encodeURIComponent(g.slug)}`,
      priority: 0.6,
      changeFrequency: 'weekly',
    }));
  const topics = Object.values(exploreTopics)
    .filter((t) => t && t.title)
    .map((t) => ({
      url: `${SITE_URL}/explore/topic/${encodeURIComponent(t.slug)}`,
      priority: 0.6,
      changeFrequency: 'monthly',
      ...(t.updated && !Number.isNaN(Number(t.updated)) ? { lastModified: new Date(Number(t.updated)) } : {}),
    }));

  return [...statics, ...products, ...posts, ...groups, ...topics];
}
