import { ProductPage } from '@/components/store/site/SitePages';
import { getServerProduct, getServerContent } from '@/lib/server/site';
import { jsonLd, productJsonLd, breadcrumbJsonLd } from '@/lib/seo';

// Re-render (ISR) so admin edits reach metadata/JSON-LD within a few minutes.
export const revalidate = 300;

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
              { name: p.category, path: `/#cat-${p.category}` },
              { name: p.name, path: `/product/${p.id}` },
            ])),
          }}
        />
      )}
      <ProductPage id={params.id} />
    </>
  );
}
