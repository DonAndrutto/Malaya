'use client';

// Storefront layout — wraps every store route with the Malaya chrome (header,
// footer) and provides the resolved catalogue + site-image settings via context.
// Subscribes to the admin override layer and site settings (Firestore-backed,
// localStorage-cached) so edits in /admin flow into the catalogue live.

import { useEffect, useMemo, useState } from 'react';
import { buildSiteData } from '@/lib/data/site-data';
import { subscribeOverrides } from '@/lib/overrides';
import { subscribeSiteSettings } from '@/lib/site-settings';
import { SiteDataContext } from '@/components/store/site/store';
import { SiteHeader, SiteFooter } from '@/components/store/site/SiteShell';

export default function StoreLayout({ children }) {
  const [overrides, setOverrides] = useState({});
  const [settings, setSettings] = useState({});

  useEffect(() => subscribeOverrides(setOverrides), []);
  useEffect(() => subscribeSiteSettings(setSettings), []);

  const siteData = useMemo(() => buildSiteData(overrides), [overrides]);
  const ctx = useMemo(() => ({ ...siteData, settings }), [siteData, settings]);

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
