'use client';

// Renders blog Markdown: GitHub-flavoured Markdown (tables, task lists, …) plus
// Obsidian [[wiki links]] resolved to posts/products/pages. Heading ids come from
// rehype-slug so in-post section anchors work. Raw HTML is intentionally NOT
// enabled (no rehype-raw), so post content can't inject markup.

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { resolveWikiLinks } from '@/lib/wiki-links';

function MdLink({ href = '', children, node, ...props }) {
  if (href.startsWith('/')) return <Link href={href}>{children}</Link>;
  if (href.startsWith('#')) return <a href={href}>{children}</a>;
  return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
}

export default function Markdown({ source, posts = [], products = [] }) {
  const md = resolveWikiLinks(source || '', { posts, products });
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={{ a: MdLink }}>
        {md}
      </ReactMarkdown>
    </div>
  );
}
