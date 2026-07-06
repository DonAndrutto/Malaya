'use client';

// Floating product image — the Explore editorial device: a (transparent PNG)
// product photo floated into running text, fully clickable through to the
// product page. Used by the `floatProduct` content block and by the inline
// ![[float: …]] rich-text embed (components/store/site/Markdown.jsx), so blog
// and Explore share one renderer. Renders nothing when there is no image to
// show — an unresolvable embed degrades silently, never to a broken image.

import Link from 'next/link';
import { SiteImg } from './SiteShell';

export default function FloatingProduct({ p, side = 'right', caption, src }) {
  const img = src || (p && p.img) || null;
  if (!img) return null;
  const cls = 'explore-float explore-float-' + (side === 'left' ? 'left' : 'right');
  const body = (
    <>
      <SiteImg src={img} alt={(p && p.name) || caption || ''} width={640} height={640}
        sizes="(max-width: 700px) 60vw, 280px" />
      {(caption || (p && p.name)) && (
        <em className="explore-float-caption">{caption || `${p.name}${p.sub ? ' — ' + p.sub : ''}`}</em>
      )}
    </>
  );
  return p
    ? <Link href={`/product/${p.id}`} className={cls}>{body}</Link>
    : <span className={cls}>{body}</span>;
}
