// Explore landing — every published Group as a curated shelf of Topic cards.
// Server-rendered from the topic-summary projection with ISR (never article
// bodies — lib/server/explore.js); deliberately not live-subscribed, the same
// ≤5-minute propagation generateMetadata already accepts on product pages.

import { fetchPublishedGroups, fetchPublishedTopicSummaries } from '@/lib/server/explore';
import { groupList, topicsOfGroup } from '@/lib/explore-shared';
import { jsonLd, breadcrumbJsonLd } from '@/lib/seo';
import { ExploreShelf, ExploreSearch } from '@/components/store/site/ExplorePages';
import { PageBanner } from '@/components/store/site/SiteShell';

export const revalidate = 300;

export const metadata = {
  title: 'Explore · Malaya Jewellery',
  description: 'A living catalogue of Bhutanese and Vajrayana symbolism — sacred symbols, seed syllables and ritual objects, and the Malaya pieces that carry them.',
  alternates: { canonical: '/explore' },
  openGraph: {
    title: 'Explore · Malaya Jewellery',
    description: 'A living catalogue of Bhutanese and Vajrayana symbolism — the knowledge behind every Malaya piece.',
    url: '/explore',
  },
};

export default async function Page() {
  const [groups, topics] = await Promise.all([
    fetchPublishedGroups(),
    fetchPublishedTopicSummaries(),
  ]);
  const shelves = groupList(groups, { publishedOnly: true })
    .map((g) => ({ group: g, topics: topicsOfGroup(g, topics) }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Explore', path: '/explore' },
          ])),
        }}
      />
      <main className="malaya-page explore-page" data-screen-label="Explore">
        <PageBanner variant="chapter" title="Explore" subtitle="The symbolism behind the collection" bannerKey="exploreBanner" />
        <div className="site-container explore-wrap">
          <p className="explore-lead">
            Every Malaya piece carries a story older than jewellery itself. Explore the sacred
            symbols, seed syllables and ritual objects of Bhutan and the Vajrayana world — and
            the pieces that keep them alive in gold and silver.
          </p>
          <ExploreSearch />
          {shelves.length === 0 && (
            <p className="explore-empty" style={{ padding: '48px 0' }}>
              The studio is preparing this catalogue of symbols — check back soon.
            </p>
          )}
          {shelves.map(({ group, topics: shelfTopics }) => (
            <ExploreShelf key={group.slug} group={group} topics={shelfTopics} />
          ))}
        </div>
      </main>
    </>
  );
}
