// Group listing — one curated shelf, its topics in the shelf's own order.
// `/explore/topic/...` never reaches this route: the static `topic` segment
// wins over this dynamic one, which is also why `topic` (and `search`) are
// reserved words no group slug may take.

import Link from 'next/link';
import { fetchPublishedGroups, fetchPublishedTopicSummaries } from '@/lib/server/explore';
import { topicsOfGroup } from '@/lib/explore-shared';
import { jsonLd, breadcrumbJsonLd, exploreGroupJsonLd } from '@/lib/seo';
import { TopicCard } from '@/components/store/site/ExplorePages';
import { PageBanner } from '@/components/store/site/SiteShell';

export const revalidate = 300;

async function getGroup(slug) {
  const groups = await fetchPublishedGroups();
  return groups[slug] || null;
}

export async function generateMetadata({ params }) {
  const group = await getGroup(params.group);
  if (!group) {
    return { title: 'Explore · Malaya Jewellery', robots: { index: false, follow: false } };
  }
  const title = `${group.name} · Explore · Malaya Jewellery`;
  const description = group.description || `${group.name} — Bhutanese and Vajrayana symbolism from Malaya Jewellery.`;
  return {
    title,
    description,
    alternates: { canonical: `/explore/${group.slug}` },
    openGraph: {
      title,
      description,
      url: `/explore/${group.slug}`,
      ...(group.heroImage ? { images: [{ url: group.heroImage, alt: group.name }] } : {}),
    },
  };
}

export default async function Page({ params }) {
  const [group, topics] = await Promise.all([
    getGroup(params.group),
    fetchPublishedTopicSummaries(),
  ]);

  if (!group) {
    return (
      <main className="malaya-page" data-screen-label="Shelf not found">
        <PageBanner title="Not found" subtitle="Explore" />
        <div className="site-container" style={{ padding: '60px 24px' }}>
          <p>This shelf could not be found. <Link href="/explore">Back to Explore.</Link></p>
        </div>
      </main>
    );
  }

  const shelfTopics = topicsOfGroup(group, topics);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(exploreGroupJsonLd(group, shelfTopics)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Explore', path: '/explore' },
            { name: group.name, path: `/explore/${group.slug}` },
          ])),
        }}
      />
      <main className="malaya-page explore-page" data-screen-label={'Explore · ' + group.name}>
        <PageBanner title={group.name} subtitle="Explore" img={group.heroImage || null} />
        <div className="site-container explore-wrap">
          <nav className="explore-crumbs">
            <Link href="/">Home</Link><span>/</span>
            <Link href="/explore">Explore</Link><span>/</span>
            <span>{group.name}</span>
          </nav>
          {group.description && <p className="explore-lead">{group.description}</p>}
          <div className="rule-dot" style={{ margin: '18px 0 30px' }} />
          {shelfTopics.length
            ? <div className="explore-tgrid">{shelfTopics.map((t) => <TopicCard key={t.slug} t={t} />)}</div>
            : <p className="explore-empty">The studio is preparing this shelf — check back soon.</p>}
        </div>
      </main>
    </>
  );
}
