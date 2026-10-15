import StoreRouteData from '@/components/store/site/StoreRouteData';
import { TashiPage } from '@/components/store/site/SitePages';

export const metadata = {
  title: 'Tashi Mannox · Malaya Jewellery',
  description: 'The Malaya Jewellery collaboration with master Tibetan calligrapher Tashi Mannox.',
};

export default function Page() {
  return <StoreRouteData explore><TashiPage /></StoreRouteData>;
}
