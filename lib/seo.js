// ─────────────────────────────────────────────────────────────────────────────
// Structured-data (JSON-LD) builders. Rendered server-side from the same
// Firestore-backed data the storefront shows (lib/server/site.js), so search
// engines see the admin's live names, prices, stock and imagery.
// ─────────────────────────────────────────────────────────────────────────────

import { SITE_URL, SITE_NAME } from './server/site';

// Serialize for a <script type="application/ld+json"> body. `<` is escaped so
// admin-entered text can never terminate the script tag (XSS via "</script>").
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

const abs = (path) => (path && /^https?:\/\//.test(path) ? path : `${SITE_URL}${path || ''}`);

// schema.org/ItemAvailability from the storefront stock label.
function availabilityOf(stock) {
  switch (stock) {
    case 'Sold out':
    case 'Archived': return 'https://schema.org/OutOfStock';
    case 'Made to order': return 'https://schema.org/PreOrder';
    default: return 'https://schema.org/InStock';
  }
}

export function organizationJsonLd(content, settings = {}) {
  const ct = content.contact;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    ...(settings.logo ? { logo: settings.logo } : {}),
    email: ct.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: (ct.address || []).join(', '),
      addressLocality: 'Thimphu',
      addressCountry: 'BT',
    },
    sameAs: [ct.facebook, ct.instagram, ct.pinterest, ct.linktree].filter(Boolean),
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function productJsonLd(p, content) {
  const url = abs(`/product/${p.id}`);
  const description = (p.story && p.story.trim().split(/\n\s*\n|\n/)[0])
    || `${p.name}${p.sub ? ` — ${p.sub}` : ''}. ${content.product.credit}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    description,
    url,
    ...(p.images && p.images.length ? { image: p.images } : {}),
    ...(p.salesCode ? { sku: p.salesCode } : {}),
    ...(p.productionCode ? { mpn: p.productionCode } : {}),
    ...(p.material ? { material: p.material } : {}),
    category: p.category,
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(p.price > 0 ? {
      offers: {
        '@type': 'Offer',
        url,
        price: p.price,
        priceCurrency: 'USD',
        availability: availabilityOf(p.stock),
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': `${SITE_URL}/#organization` },
      },
    } : {}),
  };
}

// items: [{ name, path }] — the current page goes last (no item URL needed).
export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.path ? { item: abs(it.path) } : {}),
    })),
  };
}

// Explore topic page — the canonical editorial article for a symbol.
export function exploreTopicJsonLd(topic) {
  const url = abs(`/explore/topic/${topic.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: topic.title,
    url,
    ...(topic.excerpt ? { description: topic.excerpt } : {}),
    ...(topic.heroImage ? { image: [topic.heroImage] } : {}),
    ...(Array.isArray(topic.aliases) && topic.aliases.length ? { alternativeHeadline: topic.aliases.join(', ') } : {}),
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntityOfPage: url,
  };
}

// Explore group page — a curated shelf of topic pages (CollectionPage+ItemList).
export function exploreGroupJsonLd(group, topics) {
  const url = abs(`/explore/${group.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    name: group.name,
    url,
    ...(group.description ? { description: group.description } : {}),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: (topics || []).map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: t.title,
        url: abs(`/explore/topic/${t.slug}`),
      })),
    },
  };
}

export function blogPostingJsonLd(post) {
  const url = abs(`/blog/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    headline: post.title,
    url,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.cover ? { image: [post.cover] } : {}),
    ...(post.date ? { datePublished: post.date } : {}),
    ...(Array.isArray(post.tags) && post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntityOfPage: url,
  };
}
