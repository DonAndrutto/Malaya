import { PolicyPage } from '@/components/store/site/SitePages';

const TITLES = {
  privacy: 'Privacy Policy',
  terms: 'Terms and Conditions',
  cookie: 'Cookie Policy',
  refund: 'Refund Policy',
};

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
