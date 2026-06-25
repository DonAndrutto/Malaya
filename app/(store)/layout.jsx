'use client';

// Storefront layout — wraps every store route with the Malaya chrome (header,
// footer) and provides the resolved catalogue + site-image settings via context.
// Subscribes to the admin override layer and site settings (Firestore-backed,
// localStorage-cached) so edits in /admin flow into the catalogue live.

import { useEffect, useMemo, useState } from 'react';
import { buildSiteData, resolveContent } from '@/lib/data/site-data';
import { subscribeOverrides } from '@/lib/overrides';
import { subscribeSiteSettings } from '@/lib/site-settings';
import { subscribeSiteContent } from '@/lib/site-content';
import { subscribeBlog } from '@/lib/blog';
import { SiteDataContext, migrateCartAliases } from '@/components/store/site/store';
import { SiteHeader, SiteFooter } from '@/components/store/site/SiteShell';

export default function StoreLayout({ children }) {
  const [overrides, setOverrides] = useState({});
  const [settings, setSettings] = useState({});
  const [savedContent, setSavedContent] = useState({});
  const [blogPosts, setBlogPosts] = useState({});

  useEffect(() => subscribeOverrides(setOverrides), []);
  useEffect(() => subscribeSiteSettings(setSettings), []);
  useEffect(() => subscribeSiteContent(setSavedContent), []);
  useEffect(() => subscribeBlog(setBlogPosts), []);

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
      </div>
    </SiteDataContext.Provider>
  );
}
