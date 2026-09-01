import { ProductPage } from '@/components/store/site/SitePages';
import { getServerProduct, getServerContent } from '@/lib/server/site';
import { CATEGORY_TO_SECTION } from '@/lib/data/site-data';
import { jsonLd, productJsonLd, breadcrumbJsonLd } from '@/lib/seo';

// ISR safety net. 24h, matching REVALIDATE_SECONDS (lib/server/firestore.js):
// admin publishes purge this route on demand, so the TTL only has to catch a
// ping that never landed. Route segment config must be a statically analysable
// literal, so it cannot import the constant — lib/server/cache-policy.test.js
// pins the two together. See CACHING.md.
export const revalidate = 86400;

export async function generateMetadata({ params }) {
  const p = await getServerProduct(params.id);
  if (!p) {
    return { title: 'Product · Malaya Jewellery', robots: { index: false, follow: false } };
  }
  const title = `${p.name} · Malaya Jewellery`;
  const description = (p.story && p.story.trim().split(/\n\s*\n|\n/)[0])
    || `${p.name}${p.sub ? ` — ${p.sub}` : ''}. Created by Malaya Jewellery.`;
  return {
    title,
    description,
    // Merged duplicates and sales-code URLs resolve to the master listing;
    // pointing the canonical at the master id keeps one indexed URL per piece.
    alternates: { canonical: `/product/${p.id}` },
    openGraph: {
      title,
      description,
      url: `/product/${p.id}`,
      ...(p.img ? { images: [{ url: p.img, alt: p.name }] } : {}),
    },
    twitter: { card: p.img ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function Page({ params }) {
  const [p, content] = await Promise.all([getServerProduct(params.id), getServerContent()]);
  return (
    <>
      {p && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(p, content)) }}
        />
      )}
      {p && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              // The on-page anchors are per *section* (Chains → Necklaces,
              // Bangles → Bracelets) — same mapping as the visible breadcrumb.
              { name: p.category, path: `/#cat-${CATEGORY_TO_SECTION[p.category] || p.category}` },
              { name: p.name, path: `/product/${p.id}` },
            ])),
          }}
        />
      )}
      <ProductPage id={params.id} />
    </>
  );
}
