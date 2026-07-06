// ─────────────────────────────────────────────────────────────────────────────
// Server-side Explore readers (ISR, fail-soft) — mirrors lib/server/firestore.js.
//
// Listing pages (/explore, /explore/<group>), the layout, the catalogue Symbol
// filter, search and the sitemap all read topic *summaries*: a runQuery with a
// `select` projection, so they pay ~150 bytes per topic instead of whole
// articles. The full document is fetched only for the one topic page being
// viewed (fetchTopic). Every read fails soft — a Firestore outage never takes
// the storefront down; Explore surfaces simply render empty.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache } from 'next/cache';
import { fetchDoc, runPublishedQuery, REVALIDATE_SECONDS } from './firestore';

// The summary projection — everything cards/filters/search need, NEVER blocks.
export const TOPIC_SUMMARY_FIELDS = [
  'slug', 'title', 'subtitle', 'excerpt', 'aliases',
  'heroImage', 'heroPos', 'published', '_updated',
];

// One full topic document (or null). Drafts and unknown slugs are denied by
// the security rules / filtered here, so they never render or get indexed.
export async function fetchTopic(slug) {
  const topic = await fetchDoc(`exploreTopics/${encodeURIComponent(slug)}`);
  return topic && topic.published && topic.title ? { ...topic, slug } : null;
}

// Published groups → { [slug]: group }. Small collection, read whole.
export const fetchPublishedGroups = unstable_cache(
  () => runPublishedQuery('exploreGroups'),
  ['explore-groups'],
  { revalidate: REVALIDATE_SECONDS },
);

// Published topic summaries → { [slug]: summary } (projection above).
export const fetchPublishedTopicSummaries = unstable_cache(
  () => runPublishedQuery('exploreTopics', { select: TOPIC_SUMMARY_FIELDS }),
  ['explore-topic-summaries'],
  { revalidate: REVALIDATE_SECONDS },
);
