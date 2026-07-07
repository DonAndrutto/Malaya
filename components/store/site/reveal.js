'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Reveal-on-scroll (VISUAL-AUDIT PR A). One shared IntersectionObserver adds
// `.reveal-in` to `.reveal` elements once ~15% of them is visible, playing the
// house lux-fade-up entrance where the visitor can actually see it (the CSS
// lives next to the keyframes in globals.css). Each element is observed once
// and released after it enters. Browsers without IntersectionObserver reveal
// immediately; reduced-motion users get instant reveals via the global
// prefers-reduced-motion block in globals.css, and no-JS visitors via the
// <noscript> guard in the store layout.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef } from 'react';

let io = null;
function sharedObserver() {
  if (io === null && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('reveal-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.15 });
  }
  return io;
}

// True when the visitor asked the OS for reduced motion. JS-driven motion
// (smooth scrolling today; any future drift/parallax layer) must check this —
// CSS animations and transitions are already collapsed by the media block.
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Ref callback for elements carrying the `reveal` class.
export function useReveal() {
  const current = useRef(null);
  return useCallback((node) => {
    if (node) {
      const o = sharedObserver();
      if (o) { o.observe(node); current.current = node; }
      else node.classList.add('reveal-in');
    } else if (current.current) {
      if (io) io.unobserve(current.current);
      current.current = null;
    }
  }, []);
}

// <Reveal as="h2" className="…">…</Reveal> — the element renders with the
// `reveal` class and is wired to the shared observer.
export function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={className ? `reveal ${className}` : 'reveal'} {...rest}>
      {children}
    </Tag>
  );
}
