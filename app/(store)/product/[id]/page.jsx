import { ProductPage } from '@/components/store/site/SitePages';
import { PRODUCTS } from '@/lib/data/products';

export function generateMetadata({ params }) {
  const p = PRODUCTS.find((x) => x.id === params.id);
  return {
    title: (p ? p.name : 'Product') + ' · Malaya Jewelry',
    description: p ? `${p.name} — ${p.sub}. Handcrafted by Malaya Jewelry in Bhutan.` : undefined,
  };
}

export default function Page({ params }) {
  return <ProductPage id={params.id} />;
}
