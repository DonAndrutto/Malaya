import { BlogPost } from '@/components/store/site/BlogPages';
import { fetchDoc, REVALIDATE_SECONDS, BLOG_CACHE_TAG } from '@/lib/server/firestore';
import { jsonLd, blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/seo';

export const revalidate = 300;

// Unpublished posts are denied by the security rules, so a draft (or unknown
// slug) simply resolves to null here and the page is kept out of the index.
async function getPost(slug) {
  const post = await fetchDoc(`blogPosts/${encodeURIComponent(slug)}`, REVALIDATE_SECONDS, [BLOG_CACHE_TAG]);
  return post && post.published && post.title ? { ...post, slug } : null;
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  if (!post) {
    return { title: 'Blog · Malaya Jewellery', robots: { index: false, follow: false } };
  }
  const title = `${post.title} · Malaya Jewellery`;
  const description = post.excerpt || `${post.title} — stories from Malaya Jewellery in Thimphu, Bhutan.`;
  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/blog/${post.slug}`,
      ...(post.date ? { publishedTime: post.date } : {}),
      ...(post.cover ? { images: [{ url: post.cover, alt: post.title }] } : {}),
    },
    twitter: { card: post.cover ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function Page({ params }) {
  const post = await getPost(params.slug);
  return (
    <>
      {post && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(blogPostingJsonLd(post)) }}
        />
      )}
      {post && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Blog', path: '/blog' },
              { name: post.title, path: `/blog/${post.slug}` },
            ])),
          }}
        />
      )}
      <BlogPost slug={params.slug} />
    </>
  );
}
