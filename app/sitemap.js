import { getServerSiteData, SITE_URL } from '@/lib/server/site';
import { fetchPublishedBlogPosts } from '@/lib/server/firestore';
import { fetchPublishedGroups, fetchPublishedTopicSummaries } from '@/lib/server/explore';

// INTENTIONAL EXCEPTION to the 24h policy — 1 hour, not REVALIDATE_SECONDS.
// lib/server/cache-policy.test.js encodes this exception explicitly so it
// reads as a decision, not as drift.
//
// Why: this is a metadata *route*, and Next 14's built-in filesystem cache
// handler only checks cache tags for entries of kind PAGE and FETCH — never
// ROUTE (verified against next@14.2.35). So when self-hosting, neither
// revalidateTag nor revalidatePath('/sitemap.xml') actually drops a cached
// sitemap; only the TTL does. Vercel ships its own cache handler, so the
// on-demand purges from app/api/revalidate may well work in production — but
// "may well" is not a basis for content discovery. A 1-hour floor makes a
// newly published product, post or topic reachable in the sitemap without
// depending on that uncertainty.
//
// The cost is negligible: 24 regenerations/day = ~720/month against a
// 200,000/month ISR-write allowance, i.e. well under 1% even if one
// regeneration bills several write units. Everything else on the storefront
// keeps the 24h safety net (REVALIDATE_SECONDS, lib/server/firestore.js).
export const revalidate = 3600;

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
