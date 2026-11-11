import { staticPageMetadata } from '@/lib/metadata';
import { TashiPage } from '@/components/store/site/SitePages';

export const metadata = staticPageMetadata({
  path: '/tashi',
  title: 'Tashi Mannox · Malaya Jewellery',
  description: 'The Malaya Jewellery collaboration with master Tibetan calligrapher Tashi Mannox.',
});

export default function Page() {
  return <TashiPage />;
}
