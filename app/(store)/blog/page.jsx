import { staticPageMetadata } from '@/lib/metadata';
import { BlogIndex } from '@/components/store/site/BlogPages';

export const metadata = staticPageMetadata({
  path: '/blog',
  image: 'blog',
  title: 'Blog · Malaya Jewellery',
  description: 'Stories, symbols and craft from Malaya Jewellery — exploring Vajrayana art and the traditions of the Himalayas.',
});

export default function Page() {
  return <BlogIndex />;
}
