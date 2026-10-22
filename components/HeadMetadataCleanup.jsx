'use client';

// Next 15 / React 19: the page's <title>, <meta> and canonical <link> are
// server-rendered into <head> and only "claimed" by React when the page
// hydrates. A link clicked before hydration finishes (slow phones) navigates
// first, so the previous page's server-rendered tags are never claimed and
// never removed: the old title, canonical and OG tags stay next to the new
// ones. Next 14 always replaced them. This removes such leftovers, and only
// when React has already rendered a replacement for the same tag, so it never
// leaves a page without one (and does nothing before hydration).

import { useEffect } from 'react';

const SELECTOR = 'title, meta[name], meta[property], link[rel="canonical"]';

const keyOf = (el) => {
  if (el.tagName === 'TITLE') return 'title';
  if (el.tagName === 'LINK') return 'canonical';
  return el.hasAttribute('property') ? `p:${el.getAttribute('property')}` : `n:${el.getAttribute('name')}`;
};

const ownedByReact = (el) => Object.keys(el).some((k) => k.startsWith('__reactFiber$'));

function removeOrphans() {
  const groups = new Map();
  document.head.querySelectorAll(SELECTOR).forEach((el) => {
    const key = keyOf(el);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  });
  groups.forEach((els) => {
    if (!els.some(ownedByReact)) return;
    els.forEach((el) => { if (!ownedByReact(el)) el.remove(); });
  });
}

export default function HeadMetadataCleanup() {
  useEffect(() => {
    removeOrphans();
    const observer = new MutationObserver(removeOrphans);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
