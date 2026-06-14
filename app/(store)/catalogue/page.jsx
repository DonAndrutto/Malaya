import { CataloguePage } from '@/components/store/site/SitePages';

export const metadata = {
  title: 'Catalogue · Malaya Jewelry',
  description: 'Browse the full Malaya Jewelry catalogue — filter by category and collection.',
};

const first = (v) => (Array.isArray(v) ? v[0] : v);

export default function Page({ searchParams }) {
  const sp = searchParams || {};
  return (
    <CataloguePage
      category={first(sp.category)}
      collection={first(sp.collection)}
      q={first(sp.q)}
    />
  );
}
