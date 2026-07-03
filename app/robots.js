import { SITE_URL } from '@/lib/server/site';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The admin console and the visitor's cart are private surfaces.
        disallow: ['/admin', '/order'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
