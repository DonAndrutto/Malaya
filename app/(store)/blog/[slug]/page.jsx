import { BlogPost } from '@/components/store/site/BlogPages';

export function generateMetadata({ params }) {
  const slug = params.slug || '';
  const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: (title || 'Blog') + ' · Malaya Jewellery' };
}

export default function Page({ params }) {
  return <BlogPost slug={params.slug} />;
}
