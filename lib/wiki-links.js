// ─────────────────────────────────────────────────────────────────────────────
// Obsidian-style cross-links for blog content. Converts [[wiki links]] and
// ![[embeds]] into standard Markdown links *before* rendering, resolving targets
// to blog posts, catalogue products, or site pages so the studio can link content
// the way they do in Obsidian. Supports:
//
//   [[Post Title]]            → /blog/<slug>      (untyped: tries post, then product, then page)
//   [[post: my-slug]]         → /blog/my-slug
//   [[product: P045-YGP]]     → /product/<id>     (matches id, sales/production code, or name)
//   [[item: p001]]            → /product/p001
//   [[page: about#story]]     → /about#story       (home/about/tashi/contact/blog/order)
//   [[Target#Heading]]        → …#<slugified-heading>  (post headings get ids via rehype-slug)
//   [[target|Alias text]]     → link text = "Alias text"
//   ![[https://…/img.jpg|alt]] → image embed
//
// Unresolved links degrade to plain text (no broken hrefs). Standard Markdown
// links are untouched.
// ─────────────────────────────────────────────────────────────────────────────

import GithubSlugger from 'github-slugger';

const PAGE_ROUTES = { home: '/', about: '/about', tashi: '/tashi', contact: '/contact', blog: '/blog', order: '/order' };

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

export function buildLinkIndex({ posts = [], products = [] } = {}) {
  const postBySlug = {}; const postByTitle = {};
  posts.forEach((p) => { if (!p) return; if (p.slug) postBySlug[norm(p.slug)] = p; if (p.title) postByTitle[norm(p.title)] = p; });
  const prodByKey = {};
  products.forEach((p) => { if (!p) return; [p.id, p.salesCode, p.productionCode, p.name].forEach((k) => { if (k) prodByKey[norm(k)] = p; }); });
  return { postBySlug, postByTitle, prodByKey };
}

function headingAnchor(heading) {
  return new GithubSlugger().slug(String(heading || ''));
}

function resolveTarget(raw, idx) {
  let target = String(raw).trim();
  let alias = null;
  const pipe = target.indexOf('|');
  if (pipe !== -1) { alias = target.slice(pipe + 1).trim(); target = target.slice(0, pipe).trim(); }

  let hash = '';
  const hashAt = target.indexOf('#');
  if (hashAt !== -1) { hash = target.slice(hashAt + 1).trim(); target = target.slice(0, hashAt).trim(); }

  let type = null; let value = target;
  const colon = target.indexOf(':');
  if (colon !== -1) { type = norm(target.slice(0, colon)); value = target.slice(colon + 1).trim(); }
  const key = norm(value);

  let href = null; let label = alias || value;

  const asProduct = () => { const p = idx.prodByKey[key]; if (p) { href = '/product/' + p.id; if (!alias) label = p.name; return true; } return false; };
  const asPost = () => { const p = idx.postBySlug[key] || idx.postByTitle[key]; if (p) { href = '/blog/' + p.slug; if (!alias) label = p.title; return true; } return false; };
  const asPage = () => { if (PAGE_ROUTES[key] !== undefined) { href = PAGE_ROUTES[key]; if (!alias) label = value; return true; } return false; };

  if (type === 'product' || type === 'item') asProduct();
  else if (type === 'post' || type === 'blog') asPost();
  else if (type === 'page') asPage();
  else { asPost() || asProduct() || asPage(); }

  if (!href) return null;
  if (hash) href += '#' + headingAnchor(hash);
  return { href, label };
}

function escapeLabel(s) { return String(s).replace(/([[\]])/g, '\\$1'); }

export function resolveWikiLinks(md, ctx = {}) {
  if (!md || md.indexOf('[[') === -1) return md || '';
  const idx = buildLinkIndex(ctx);
  // Embeds first: ![[url|alt]] → image.
  let out = md.replace(/!\[\[([^\]]+)\]\]/g, (m, inner) => {
    const [url, alt] = inner.split('|');
    return `![${(alt || '').trim()}](${url.trim()})`;
  });
  // Links: [[target|alias]] → [alias](href), unresolved → plain text.
  out = out.replace(/\[\[([^\]]+)\]\]/g, (m, inner) => {
    const r = resolveTarget(inner, idx);
    if (!r) return escapeLabel(inner.split('|').pop().split(':').pop().split('#')[0].trim());
    return `[${escapeLabel(r.label)}](${r.href})`;
  });
  return out;
}
