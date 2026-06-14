'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Public storefront — the "Malaya Site" design (home, catalogue, product detail,
// Tashi Mannox, about, contact, order). A hash-routed client SPA.
//
// The catalogue is rebuilt from the shared admin override layer (lib/overrides),
// so every edit made in the /admin console flows straight into the live site —
// on navigation in the same tab, and live across tabs via the `storage` event.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { buildSiteData } from '@/lib/data/site-data';
import { loadOverrides, OVERRIDE_KEY } from '@/lib/overrides';
import { useRoute, SiteDataContext } from './site/store';
import { SiteHeader, SiteFooter } from './site/SiteShell';
import {
  HomePage, CataloguePage, ProductPage, TashiPage, AboutPage, ContactPage, OrderPage,
} from './site/SitePages';

export default function Storefront() {
  const [overrides, setOverrides] = useState({});
  const route = useRoute();

  // Read the studio's saved edits, and stay in sync if the admin desk is open in
  // another tab.
  useEffect(() => {
    setOverrides(loadOverrides());
    const onStorage = (e) => { if (e.key === OVERRIDE_KEY) setOverrides(loadOverrides()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const siteData = useMemo(() => buildSiteData(overrides), [overrides]);

  let page;
  switch (route.page) {
    case '':
    case 'home':      page = <HomePage />; break;
    case 'catalogue': page = <CataloguePage key={route.sub + '|' + route.value} route={route} />; break;
    case 'product':   page = <ProductPage route={route} />; break;
    case 'tashi':     page = <TashiPage />; break;
    case 'about':     page = <AboutPage />; break;
    case 'contact':   page = <ContactPage />; break;
    case 'order':     page = <OrderPage />; break;
    default:          page = <HomePage />;
  }

  return (
    <SiteDataContext.Provider value={siteData}>
      <div className="malaya-site">
        <SiteHeader route={route} />
        {page}
        <SiteFooter />
      </div>
    </SiteDataContext.Provider>
  );
}
