'use client';

// Renders blog & Explore Markdown: GitHub-flavoured Markdown (tables, task
// lists, …) plus Obsidian [[wiki links]] resolved to posts/products/topics/
// pages, and ![[float: …]] embeds rendered as clickable floating product
// images (FloatingProduct). Heading ids come from rehype-slug so in-post
// section anchors work. Raw HTML is intentionally NOT enabled (no rehype-raw),
// so content can't inject markup.

import { useMemo } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { resolveWikiLinks, parseFloatSrc } from '@/lib/wiki-links';
import FloatingProduct from './FloatingProduct';

function MdLink({ href = '', children, node, ...props }) {
  if (href.startsWith('/')) return <Link href={href}>{children}</Link>;
  if (href.startsWith('#')) return <a href={href}>{children}</a>;
  return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
}

export default function Markdown({ source, posts = [], products = [], topics = [] }) {
  const md = resolveWikiLinks(source || '', { posts, products, topics });
  const byId = useMemo(() => {
    const m = {};
    products.forEach((p) => { if (p && p.id) m[p.id] = p; });
    return m;
  }, [products]);

  // Float embeds arrive as images with a #float= fragment src (survives the
  // URL sanitiser); everything else stays a plain markdown image.
  const MdImg = ({ src = '', alt = '', node, ...props }) => {
    const float = parseFloatSrc(src);
    if (float) {
      return <FloatingProduct p={float.id ? byId[float.id] : null} side={float.side}
        caption={float.caption || undefined} src={float.src || undefined} />;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" {...props} />;
  };

  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{ a: MdLink, img: MdImg }}>
        {md}
      </ReactMarkdown>
    </div>
  );
}
