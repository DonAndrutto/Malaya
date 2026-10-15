'use client';

import { useEffect, useMemo, useState } from 'react';
import { subscribeBlog } from '@/lib/blog';
import { SiteDataContext, useSiteData } from './store';

// Route-local editorial data layers over the shared cart/chrome catalogue.
// Initial props render on the server and hydrate unchanged; live blog updates
// are attached only when a route actually uses blog data.
export default function StoreRouteClient({ children, initialBlog, exploreGroups, exploreTopics }) {
  const parent = useSiteData();
  const [live, setLive] = useState({ initial: initialBlog, data: initialBlog });
  const blogPosts = live.initial === initialBlog ? live.data : initialBlog;
  useEffect(() => {
    if (initialBlog === undefined) return undefined;
    setLive({ initial: initialBlog, data: initialBlog });
    return subscribeBlog((data) => setLive({ initial: initialBlog, data }), { publishedOnly: true, skipCache: true });
  }, [initialBlog]);
  const ctx = useMemo(() => ({
    ...parent,
    ...(initialBlog !== undefined ? { blogPosts: blogPosts || {} } : {}),
    ...(exploreGroups !== undefined ? { exploreGroups, exploreTopics } : {}),
  }), [parent, initialBlog, blogPosts, exploreGroups, exploreTopics]);
  return <SiteDataContext.Provider value={ctx}>{children}</SiteDataContext.Provider>;
}
