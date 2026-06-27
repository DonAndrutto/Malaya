import { ProductPage } from '@/components/store/site/SitePages';
import { PRODUCTS } from '@/lib/data/products';
import { STOCK_ROWS } from '@/lib/data/stock-data';

export function generateMetadata({ params }) {
  const p = PRODUCTS.find((x) => x.id === params.id);
  const row = p ? null : STOCK_ROWS.find((r) => r.sku === params.id);
  const name = p ? p.name : (row ? row.name : null);
  const sub = p ? p.sub : (row ? row.material : '');
  return {
    title: (name || 'Product') + ' · Malaya Jewellery',
    description: name ? `${name}${sub ? ' — ' + sub : ''}. Handcrafted by Malaya Jewellery in Bhutan.` : undefined,
  };
}

export default function Page({ params }) {
  return <ProductPage id={params.id} />;
}
