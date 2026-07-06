// ─────────────────────────────────────────────────────────────────────────────
// Obsidian-style cross-links for blog & Explore content. Converts [[wiki links]]
// and ![[embeds]] into standard Markdown *before* rendering, resolving targets
// to blog posts, catalogue products, Explore topics or site pages so the studio
// can link content the way they do in Obsidian. Supports:
//
//   [[Post Title]]            → /blog/<slug>      (untyped: post → product → topic → page)
//   [[post: my-slug]]         → /blog/my-slug
//   [[product: P045-YGP]]     → /product/<id>     (matches id, sales/production code, or name)
//   [[item: p001]]            → /product/p001
//   [[topic: endless-knot]]   → /explore/topic/<slug>  (matches slug, title, or alias)
//   [[page: about#story]]     → /about#story       (home/about/tashi/explore/contact/blog/order)
//   [[Target#Heading]]        → …#<slugified-heading>  (post headings get ids via rehype-slug)
//   [[target|Alias text]]     → link text = "Alias text"
//   ![[https://…/img.jpg|alt]] → image embed
//   ![[float: P045-YGP | right]]                → floating product image, wrapped
//   ![[float: p016 | left | A caption]]           in a link to the product page
//   ![[float: p016 | right | src=https://…]]      (custom cut-out PNG override)
//     — encoded as ![caption](#float=<payload>) and rendered by <Markdown>'s
//       image component (components/store/site/Markdown.jsx → FloatingProduct).
//
// Unresolved links degrade to plain text and unresolved embeds to nothing (no
// broken hrefs, never a broken image). Standard Markdown links are untouched.
// ─────────────────────────────────────────────────────────────────────────────

import GithubSlugger from 'github-slugger';

const PAGE_ROUTES = { home: '/', about: '/about', tashi: '/tashi', explore: '/explore', contact: '/contact', blog: '/blog', order: '/order' };

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

export function buildLinkIndex({ posts = [], products = [], topics = [] } = {}) {
  const postBySlug = {}; const postByTitle = {};
  posts.forEach((p) => { if (!p) return; if (p.slug) postBySlug[norm(p.slug)] = p; if (p.title) postByTitle[norm(p.title)] = p; });
  const prodByKey = {};
  products.forEach((p) => { if (!p) return; [p.id, p.salesCode, p.productionCode, p.name].forEach((k) => { if (k) prodByKey[norm(k)] = p; }); });
  const topicByKey = {};
  topics.forEach((t) => {
    if (!t || !t.slug) return;
    [t.slug, t.title, ...(Array.isArray(t.aliases) ? t.aliases : [])].forEach((k) => { if (k) topicByKey[norm(k)] = t; });
  });
  return { postBySlug, postByTitle, prodByKey, topicByKey };
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
  const asTopic = () => { const t = idx.topicByKey[key]; if (t) { href = '/explore/topic/' + t.slug; if (!alias) label = t.title; return true; } return false; };
  const asPage = () => { if (PAGE_ROUTES[key] !== undefined) { href = PAGE_ROUTES[key]; if (!alias) label = value; return true; } return false; };

  if (type === 'product' || type === 'item') asProduct();
  else if (type === 'post' || type === 'blog') asPost();
  else if (type === 'topic' || type === 'symbol' || type === 'explore') asTopic();
  else if (type === 'page') asPage();
  else { asPost() || asProduct() || asTopic() || asPage(); }

  if (!href) return null;
  if (hash) href += '#' + headingAnchor(hash);
  return { href, label };
}

function escapeLabel(s) { return String(s).replace(/([[\]])/g, '\\$1'); }

// ![[float: …]] → ![caption](#float=<uri-encoded JSON>). The fragment form
// survives react-markdown's URL sanitiser (a custom protocol would not); the
// Markdown image component decodes it back. Returns '' when unresolvable.
export const FLOAT_SRC_PREFIX = '#float=';

function floatEmbed(inner, idx) {
  // inner = "float: <ref> | <side> | <caption or src=…>" (segments optional)
  const parts = inner.split('|').map((s) => s.trim());
  const ref = parts[0].slice(parts[0].indexOf(':') + 1).trim();
  let side = 'right'; let caption = ''; let src = '';
  parts.slice(1).forEach((seg) => {
    if (!seg) return;
    const low = seg.toLowerCase();
    if (low === 'left' || low === 'right') side = low;
    else if (low.startsWith('src=')) src = seg.slice(4).trim();
    else caption = seg;
  });
  const p = idx.prodByKey[norm(ref)];
  if (!p && !src) return ''; // unresolvable → nothing, never a broken image
  const payload = { ...(p ? { id: p.id } : {}), side, ...(caption ? { caption } : {}), ...(src ? { src } : {}) };
  return `![${escapeLabel(caption || (p ? p.name : ''))}](${FLOAT_SRC_PREFIX}${encodeURIComponent(JSON.stringify(payload))})`;
}

export function parseFloatSrc(srcValue) {
  if (!srcValue || !srcValue.startsWith(FLOAT_SRC_PREFIX)) return null;
  try { return JSON.parse(decodeURIComponent(srcValue.slice(FLOAT_SRC_PREFIX.length))); } catch { return null; }
}

export function resolveWikiLinks(md, ctx = {}) {
  if (!md || md.indexOf('[[') === -1) return md || '';
  const idx = buildLinkIndex(ctx);
  // Embeds first: ![[float: …]] → floating product; ![[url|alt]] → image.
  let out = md.replace(/!\[\[([^\]]+)\]\]/g, (m, inner) => {
    if (/^\s*float\s*:/i.test(inner)) return floatEmbed(inner, idx);
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
