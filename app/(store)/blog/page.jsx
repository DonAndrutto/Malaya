import StoreRouteData from '@/components/store/site/StoreRouteData';
import { BlogIndex } from '@/components/store/site/BlogPages';

export const metadata = {
  title: 'Blog · Malaya Jewellery',
  description: 'Stories, journal and notes from Malaya Jewellery in Thimphu, Bhutan.',
};

export default function Page() {
  return <StoreRouteData blog><BlogIndex /></StoreRouteData>;
}
