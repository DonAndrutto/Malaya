import { getServerSiteData, SITE_URL } from '@/lib/server/site';
import { fetchPublishedBlogPosts } from '@/lib/server/firestore';

export const revalidate = 3600;

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
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
  const [{ SITE_PRODUCTS }, blogPosts] = await Promise.all([
    getServerSiteData(),
    fetchPublishedBlogPosts(),
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

  return [...statics, ...products, ...posts];
}
