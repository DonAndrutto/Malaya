import { fetchCollection, fetchDoc, REVALIDATE_SECONDS, CATALOGUE_CACHE_TAG, SETTINGS_CACHE_TAG } from '@/lib/server/firestore';
import { imageCheckAllowed, imageCheckSamples, renderImageCheck } from '@/lib/image-check';

// Reading request.url opts preview GET out of route caching; explicit 24h
// Firestore fetch policies remain intact. The response itself is no-store.

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request) {
  // Standalone HTML route: no root layout, Firebase SDK, analytics or toolbar.
  if (!imageCheckAllowed(process.env.VERCEL_ENV, process.env.NODE_ENV)) {
    return new Response('Not found', { status: 404, headers });
  }
  if (new URL(request.url).searchParams.get('control') === '1') {
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="46"><rect width="64" height="46" rx="5" fill="#286143"/><text x="32" y="29" text-anchor="middle" fill="white" font-family="sans-serif" font-size="17">OK</text></svg>', { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
  }
  const [overrides, settings] = await Promise.all([
    fetchCollection('catalogueOverrides', REVALIDATE_SECONDS, [CATALOGUE_CACHE_TAG]),
    fetchDoc('siteSettings/images', REVALIDATE_SECONDS, [SETTINGS_CACHE_TAG]),
  ]);
  const { html, policy } = renderImageCheck(imageCheckSamples(overrides, settings));
  return new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': policy } });
}
