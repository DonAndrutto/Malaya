// Storefront layout (server half) — reads the admin's Firestore data on the
// server (ISR-cached, lib/server/firestore.js) so the HTML ships with the
// live catalogue, imagery and copy: crawlers see real content and the first
// paint doesn't wait for the client-side Firestore round trip. The client
// half (StoreLayoutClient) hydrates with the same data, then subscribes to
// Firestore so admin edits still flow in live.

import { getServerLayoutData } from '@/lib/server/site';
import { resolveContent, resolveHeroSlides } from '@/lib/data/site-data';
import { jsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/seo';
import StoreLayoutClient from '@/components/store/site/StoreLayoutClient';

export default async function StoreLayout({ children }) {
  const { overrides, settings, savedContent, blogPosts, exploreGroups, exploreTopics } = await getServerLayoutData();
  const content = resolveContent(savedContent);
  // The home hero is a CSS background image, which browsers only discover
  // late; preloading the first slide pulls the LCP image forward. The slide
  // list is resolved exactly as HomePage resolves it (collection slides first,
  // legacy slideshow as fallback) so the preload always matches what renders.
  const heroSlides = resolveHeroSlides(settings);
  const firstSlide = heroSlides.length ? heroSlides[0].src : null;

  return (
    <>
      {firstSlide && <link rel="preload" as="image" href={firstSlide} fetchPriority="high" />}
      {/* Reveal-on-scroll needs JS (reveal.js); without it, show everything. */}
      <noscript><style>{'.malaya-site .reveal{opacity:1}'}</style></noscript>
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
