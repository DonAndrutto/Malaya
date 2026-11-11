import { staticPageMetadata } from '@/lib/metadata';
import { AboutPage } from '@/components/store/site/SitePages';

export const metadata = staticPageMetadata({
  path: '/about',
  image: 'about',
  title: 'About · Malaya Jewellery',
  description: 'Discover Malaya, the Vajrayana fine jewellery brand by designer Andrzej Rybszleger since 2016. Himalayan traditions, fine craftsmanship and worldwide shipping.',
});

export default function Page() {
  return <AboutPage />;
}
