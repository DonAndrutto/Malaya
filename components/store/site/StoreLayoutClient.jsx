'use client';

// Storefront layout (client half) — wraps every store route with the Malaya
// chrome (header, footer) and provides the resolved catalogue + site-image
// settings via context. The server layout (app/(store)/layout.jsx) passes the
// Firestore data it rendered the HTML with as initial state; the live
// subscriptions below then keep the page in sync with edits made in /admin.

import { useEffect, useMemo, useState } from 'react';
import { buildSiteData, resolveContent } from '@/lib/data/site-data';
import { subscribeOverrides } from '@/lib/overrides';
import { subscribeSiteSettings } from '@/lib/site-settings';
import { subscribeSiteContent } from '@/lib/site-content';
import { subscribeBlog } from '@/lib/blog';
import { SiteDataContext, migrateCartAliases } from '@/components/store/site/store';
import { SiteHeader, SiteFooter, CartNotice } from '@/components/store/site/SiteShell';

export default function StoreLayoutClient({
  children,
  initialOverrides = {},
  initialSettings = {},
  initialContent = {},
  initialBlog = {},
}) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [settings, setSettings] = useState(initialSettings);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [blogPosts, setBlogPosts] = useState(initialBlog);

  // skipCache: the server-rendered props are fresher than the localStorage
  // cache, so wait for the live Firestore snapshot instead of flashing the
  // cached copy. The storefront only ever reads published blog posts (the
  // security rules deny it anything else).
  useEffect(() => subscribeOverrides(setOverrides, { skipCache: true }), []);
  useEffect(() => subscribeSiteSettings(setSettings, { skipCache: true }), []);
  useEffect(() => subscribeSiteContent(setSavedContent, { skipCache: true }), []);
  useEffect(() => subscribeBlog(setBlogPosts, { publishedOnly: true, skipCache: true }), []);

  const siteData = useMemo(() => buildSiteData(overrides), [overrides]);
  const content = useMemo(() => resolveContent(savedContent), [savedContent]);
  const ctx = useMemo(() => ({ ...siteData, settings, content, blogPosts }), [siteData, settings, content, blogPosts]);

  // Keep existing carts working when an item has been merged into a master.
  useEffect(() => migrateCartAliases(siteData.ALIASES), [siteData.ALIASES]);

  return (
    <SiteDataContext.Provider value={ctx}>
      <div className="malaya-site">
        <SiteHeader />
        {children}
        <SiteFooter />
        <CartNotice />
      </div>
    </SiteDataContext.Provider>
  );
}
