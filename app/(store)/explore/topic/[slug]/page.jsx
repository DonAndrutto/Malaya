// THE canonical topic page — exactly one URL per Topic, however many shelves
// reference it (duplicate content is impossible by construction; see
// EXPLORE.md §4). Server-rendered with ISR + metadata + Article/Breadcrumb
// JSON-LD — the /product/[id] recipe — then the client component subscribes
// to the single Firestore document for live admin edits.

import { fetchTopic, fetchPublishedGroups } from '@/lib/server/explore';
import { primaryGroupOf } from '@/lib/explore-shared';
import { jsonLd, breadcrumbJsonLd, exploreTopicJsonLd } from '@/lib/seo';
import { TopicPage } from '@/components/store/site/ExplorePages';

export const revalidate = 300;

export async function generateMetadata({ params }) {
  const topic = await fetchTopic(params.slug);
  if (!topic) {
    // Drafts and unknown slugs resolve to null (rules deny the read) and are
    // kept out of the index.
    return { title: 'Explore · Malaya Jewellery', robots: { index: false, follow: false } };
  }
  const title = `${topic.title} · Explore · Malaya Jewellery`;
  const description = topic.excerpt
    || `${topic.title} — Bhutanese and Vajrayana symbolism from Malaya Jewellery.`;
  return {
    title,
    description,
    alternates: { canonical: `/explore/topic/${topic.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/explore/topic/${topic.slug}`,
      ...(topic.heroImage ? { images: [{ url: topic.heroImage, alt: topic.title }] } : {}),
    },
    twitter: { card: topic.heroImage ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function Page({ params }) {
  const [topic, groups] = await Promise.all([
    fetchTopic(params.slug),
    fetchPublishedGroups(),
  ]);
  const primary = topic ? primaryGroupOf(topic.slug, groups) : null;

  return (
    <>
      {topic && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(exploreTopicJsonLd(topic)) }}
        />
      )}
      {topic && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Explore', path: '/explore' },
              ...(primary ? [{ name: primary.name, path: `/explore/${primary.slug}` }] : []),
              { name: topic.title, path: `/explore/topic/${topic.slug}` },
            ])),
          }}
        />
      )}
      <TopicPage slug={params.slug} initialTopic={topic} />
    </>
  );
}
