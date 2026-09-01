import { PolicyPage } from '@/components/store/site/SitePages';

const TITLES = {
  privacy: 'Privacy Policy',
  terms: 'Terms and Conditions',
  cookie: 'Cookie Policy',
  refund: 'Refund Policy',
};

// The four policy slugs are a fixed, closed set (they are also exactly what
// app/sitemap.js publishes). Declaring them turns this route from "dynamic,
// server-rendered on every request" into four prerendered pages that hold in
// the full route cache — a dynamic segment with no generateStaticParams is
// never cacheable in Next 14, so every crawler hit on /policy/* was paying for
// a fresh render of a page whose only mutable input (site copy) already
// invalidates it on demand. `dynamicParams` stays at its default, so an
// unknown slug still renders the same "not found" body it does today.
export function generateStaticParams() {
  return Object.keys(TITLES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const title = TITLES[params.slug] || 'Policy';
  return {
    title: title + ' · Malaya Jewellery',
    description: `${title} — Malaya Jewellery, handcrafted Buddhist jewellery from Bhutan.`,
  };
}

export default function Page({ params }) {
  return <PolicyPage slug={params.slug} />;
}
