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

// Every server-side Explore read is labelled with this cache tag so the admin
// publish flow can purge them on demand (app/api/revalidate → revalidateTag):
// flipping `published` in the admin becomes visible on the very next request
// instead of waiting out the ISR TTL. The TTL stays as the safety net.
export const EXPLORE_CACHE_TAG = 'explore';

// The summary projection — everything cards/filters/search need, NEVER blocks.
export const TOPIC_SUMMARY_FIELDS = [
  'slug', 'title', 'subtitle', 'excerpt', 'aliases', 'previousSlugs',
  'heroImage', 'heroPos', 'published', '_updated',
];

// One full topic document (or null). Drafts and unknown slugs are denied by
// the security rules / filtered here, so they never render or get indexed.
export async function fetchTopic(slug) {
  const topic = await fetchDoc(`exploreTopics/${encodeURIComponent(slug)}`, REVALIDATE_SECONDS, [EXPLORE_CACHE_TAG]);
  return topic && topic.published && topic.title ? { ...topic, slug } : null;
}

// Published groups → { [slug]: group }. Small collection, read whole.
export const fetchPublishedGroups = unstable_cache(
  () => runPublishedQuery('exploreGroups'),
  ['explore-groups'],
  { revalidate: REVALIDATE_SECONDS, tags: [EXPLORE_CACHE_TAG] },
);

// Published topic summaries → { [slug]: summary } (projection above).
export const fetchPublishedTopicSummaries = unstable_cache(
  () => runPublishedQuery('exploreTopics', { select: TOPIC_SUMMARY_FIELDS }),
  ['explore-topic-summaries'],
  { revalidate: REVALIDATE_SECONDS, tags: [EXPLORE_CACHE_TAG] },
);
