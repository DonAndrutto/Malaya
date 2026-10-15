import { fetchPublishedBlogPosts } from '@/lib/server/firestore';
import { fetchPublishedGroups, fetchPublishedTopicSummaries } from '@/lib/server/explore';
import StoreRouteClient from './StoreRouteClient';

// Declare the data dependencies where features consume them, so a blog save
// doesn't evict every product, and an Explore save doesn't evict /about.
export default async function StoreRouteData({ children, blog = false, explore = false }) {
  const [initialBlog, exploreGroups, exploreTopics] = await Promise.all([
    blog ? fetchPublishedBlogPosts() : undefined,
    explore ? fetchPublishedGroups() : undefined,
    explore ? fetchPublishedTopicSummaries() : undefined,
  ]);
  return <StoreRouteClient initialBlog={initialBlog} exploreGroups={exploreGroups} exploreTopics={exploreTopics}>{children}</StoreRouteClient>;
}
