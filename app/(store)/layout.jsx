// Storefront layout (server half) — reads the admin's Firestore data on the
// server (ISR-cached, lib/server/firestore.js) so the HTML ships with the
// live catalogue, imagery and copy: crawlers see real content and the first
// paint doesn't wait for the client-side Firestore round trip. The client
// half (StoreLayoutClient) hydrates with the same data, then subscribes to
// Firestore so admin edits still flow in live.

import { getServerLayoutData } from '@/lib/server/site';
import { resolveContent } from '@/lib/data/site-data';
import { jsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/seo';
import StoreLayoutClient from '@/components/store/site/StoreLayoutClient';

export default async function StoreLayout({ children }) {
  const { overrides, settings, savedContent, blogPosts, exploreGroups, exploreTopics } = await getServerLayoutData();
  const content = resolveContent(savedContent);
  // The home hero is a CSS background image, which browsers only discover
  // late; preloading the first slide pulls the LCP image forward.
  const firstSlide = Array.isArray(settings.heroSlides) ? settings.heroSlides[0] : null;

  return (
    <>
      {firstSlide && <link rel="preload" as="image" href={firstSlide} fetchPriority="high" />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd(content, settings)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }}
      />
      <StoreLayoutClient
        initialOverrides={overrides}
        initialSettings={settings}
        initialContent={savedContent}
        initialBlog={blogPosts}
        initialExploreGroups={exploreGroups}
        initialExploreTopics={exploreTopics}
      >
        {children}
      </StoreLayoutClient>
    </>
  );
}
