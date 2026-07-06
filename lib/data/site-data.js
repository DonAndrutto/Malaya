// ─────────────────────────────────────────────────────────────────────────────
// Site-wide data for the Malaya Jewellery storefront (the "Malaya Site" design).
//
// The public catalogue is built from resolveCatalogue(PRODUCTS, overrides) so that
// every edit made in the /admin console (the shared localStorage override layer)
// flows straight into the live catalogue. On top of the studio catalogue we merge
// the items that appear on the live site but not in the price sheet — the
// Tashi-Mannox brooches/earrings/cufflinks, bangles and findings.
// ─────────────────────────────────────────────────────────────────────────────

import { PRODUCTS, COLLECTIONS, CATEGORIES, MATERIALS, fmtPrice } from './products';
import { detectMaterial } from './materials';
import { resolveProduct } from './resolve';
import { STOCK_ROWS, resolveLedgerStorefront } from './ledger';

export { COLLECTIONS, CATEGORIES, MATERIALS, fmtPrice };

// Override helpers (kept local to avoid a circular import with inventory.js).
const isDeleted = (o) => !!(o && o.deleted);
const isCustom = (o) => !!(o && o._custom);

// product id → the stock-ledger SKU it folds in (first link wins). Lets the
// storefront merge photos/story uploaded under a linked SKU into the catalogue
// listing, keeping one canonical product + URL per physical piece.
const SKU_FOR_PRODUCT = {};
STOCK_ROWS.forEach((r) => (r.productIds || []).forEach((id) => { if (!SKU_FOR_PRODUCT[id]) SKU_FOR_PRODUCT[id] = r.sku; }));
function mergedCatalogueOverride(productId, overrides) {
  const own = overrides[productId] || {};
  const sku = SKU_FOR_PRODUCT[productId];
  const linked = sku ? overrides[sku] : null;
  if (!linked) return own;
  const out = { ...own };
  ['images', 'img', 'story'].forEach((f) => { if (!(f in out) && f in linked) out[f] = linked[f]; });
  return out;
}

// The storefront is fully self-contained: every image is served from the
// studio's own Firebase (Storage download URLs saved in Firestore —
// `catalogueOverrides` for product photos, `siteSettings/images` for site
// imagery). There is no external CDN. These helpers therefore have no built-in
// image to point at; an unset slot simply has no image (the UI shows a neutral
// placeholder/monogram) until one is uploaded from the admin. They are kept as
// no-op shims so legacy callers that still pass a filename degrade gracefully
// instead of fetching from a third-party host.
export const siteImg = () => null;
export const prodImg = () => null;

// Admin-chosen focal point ("x% y%") for a banner/hero/tile image URL, stored in
// site settings under `imgPos` (keyed by image URL). Defaults to centred crop.
export const posFor = (settings, url) => (settings && settings.imgPos && settings.imgPos[url]) || 'center';

// CSS background-image value for a possibly-missing src (never emits url(null),
// which would trigger a stray request).
export const bgImage = (src) => (src ? `url(${src})` : 'none');

// No external fallback host — images come only from Firebase.
export function cdnFallback() { return null; }

// Items in these states never appear in the public storefront.
const HIDDEN_STOCK = ['Archived'];

// The Tashi Mannox collaboration page is now driven by the "Tashi Mannox" special
// attribute (toggled per item in the admin), not a hard-coded image list — so the
// studio curates exactly which pieces appear there.

// [id, name, sub, image file, category] — live-site items missing from products.js
const SITE_EXTRA = [
  ['x001', 'Tam Syllable Earrings',     'Silver, Green Enamel',       '637866648572502724M.jpg',  'Earrings'],
  ['x002', 'Om Syllable Earrings',      'Vermeil Gold, CZ',           '637866651391311923M.jpg',  'Earrings'],
  ['x003', 'Om Syllable Earrings',      'Silver, CZ',                 '637894953958122516M.jpg',  'Earrings'],
  ['x004', 'Tam Syllable Earrings',     'Silver, CZ Diamonds',        '637791007088936924M.jpeg', 'Earrings'],
  ['x005', 'Hung Syllable Earrings',    'Silver, Blue Enamel',        '637791004255848795M.jpeg', 'Earrings'],
  ['x006', 'Tam Syllable Earrings',     'Silver',                     '637735863726682139M.jpeg', 'Earrings'],
  ['x007', 'Tam Syllable Earrings',     'Vermeil Gold',               '637735859115470612M.jpeg', 'Earrings'],
  ['x008', 'Tam Syllable Earrings',     'Small, 18K Yellow Gold',     '637793082098660649M.jpeg', 'Earrings'],
  ['x009', 'Hung Syllable Earrings',    'Vermeil Gold',               '637259773533736774M.jpg',  'Earrings'],
  ['x010', 'Tam Syllable Earrings',     '18K Yellow Gold',            '637188877408857935M.jpg',  'Earrings'],
  ['x011', 'Hung Syllable Earrings',    '14k Yellow Gold',            '637161062191441950M.jpg',  'Earrings'],
  ['x012', 'Dzam Syllable Brooch',      'Vermeil Gold',               '637338452133937761M.jpg',  'Brooches'],
  ['x013', 'Dzam Syllable Brooch',      'Silver',                     '637338451371377271M.jpg',  'Brooches'],
  ['x014', 'Hung Syllable Brooch',      'Vermeil Gold, Smaller',      '637338416020041210M.jpg',  'Brooches'],
  ['x015', 'Hung Syllable Brooch',      'Silver, Small Size',         '637338415024651095M.jpg',  'Brooches'],
  ['x016', 'Bam Syllable Brooch',       'Vermeil Gold',               '637338412214739026M.jpg',  'Brooches'],
  ['x017', 'Bam Syllable Brooch',       'Silver',                     '637338410771967138M.jpg',  'Brooches'],
  ['x018', 'Om Syllable Brooch',        'Vermeil Gold',               '637338268562853727M.jpg',  'Brooches'],
  ['x019', 'Om Syllable Brooch',        'Silver',                     '637338267670126115M.jpg',  'Brooches'],
  ['x020', 'Ah Syllable Brooch',        'Vermeil Gold',               '637338265179148427M.jpg',  'Brooches'],
  ['x021', 'Ah Syllable Brooch',        'Silver',                     '637338263862174139M.jpg',  'Brooches'],
  ['x022', 'Tam Syllable Brooch',       'Smaller, Vermeil Gold',      '637338261510588451M.jpg',  'Brooches'],
  ['x023', 'Dhi Syllable Brooch',       'Vermeil Gold, Smaller',      '637337778543293910M.jpg',  'Brooches'],
  ['x024', 'Dhi Syllable Brooch',       'Silver, Smaller',            '637337777156308192M.jpg',  'Brooches'],
  ['x025', 'Tam Syllable Brooch Small', 'Silver',                     '637337771988719315M.jpg',  'Brooches'],
  ['x026', 'Hri Syllable Brooch',       'Silver, Large',              '637337768486258885M.jpg',  'Brooches'],
  ['x027', 'Dhi Syllable Brooch',       'Vermeil Gold, Large',        '637337762909412687M.jpg',  'Brooches'],
  ['x028', 'Dhi Syllable Brooch',       'Silver, Large',              '637337760785033783M.jpg',  'Brooches'],
  ['x029', 'Hri Syllable Brooch',       'Silver, Smaller',            '637259771689159582M.jpg',  'Brooches'],
  ['x030', 'Hri Syllable Brooch',       'Vermeil Gold',               '637259748927974643M.jpg',  'Brooches'],
  ['x031', 'Tam Syllable Brooch',       'Silver',                     '637227550638566558M.jpeg', 'Brooches'],
  ['x032', 'Tam Syllable Brooch',       'Vermeil Gold',               '637227557581044083M.jpeg', 'Brooches'],
  ['x033', 'Hung Syllable Brooch',      'Vermeil Gold, Large',        '637165622043956991M.jpg',  'Brooches'],
  ['x034', 'Hung Syllable Brooch',      'Silver, Larger',             '637165621352643619M.jpg',  'Brooches'],
  ['x035', 'Sun and Moon Calligraphy',  'Cufflinks Vermeil Gold',     '637470480618665198M.jpg',  'Cufflinks'],
  ['x036', 'Nyima and Dawa Sun & Moon', 'Silver Cufflinks',           '637338543812223395M.jpg',  'Cufflinks'],
  ['x037', 'Tam Syllable Earrings',     'Solid Gold',                 '637161056726440841M.jpg',  'Earrings'],
  ['x038', 'Hri Syllable Brooch',       'Gold, Large',                '637338284454251922M.jpg',  'Brooches'],
  ['x039', 'Hung Syllable Earrings',    'Silver',                     '637259747127779331M.jpg',  'Earrings'],
  ['x040', 'Infinity Edges Bangle',     'Silver, Adjustable',         '637187024967414567M.jpg',  'Bangles'],
  ['x041', 'Drigug Mala Counter',       'Large, Silver',              '638344849674411114M.jpg',  'Accessories'],
  ['x042', 'Samaya Signet Ring',        'Silver, Enamel',             '637336527618461314M.jpg',  'Rings'],
];

function siteMaterialOf(name, sub) {
  return detectMaterial(`${name} ${sub}`, 'Silver 925');
}
function siteCollectionOf(name, sub) {
  const t = (name + ' ' + sub).toLowerCase();
  if (/\b(hri|om|ah|hung|tam|bam|dhi|dzam|syllable|mantra|tara|calligraphy)\b/.test(t)) return 'Heart Syllables';
  if (/(vajra|dorje|phurba|drigug|bell|melong|gau|mala|conch|banner|parasol|fish|knot|wheel|dharma)/.test(t)) return 'Ritual Objects';
  if (/(turquoise|coral|quartz|sapphire|ruby|onyx|agate|stone|poppy)/.test(t)) return 'Healing Stones';
  if (/(skull|dakini|deity|laughing|nyima|dawa|sun and moon)/.test(t)) return 'Mystical Beings';
  if (/diamond/.test(t)) return 'Malaya Splendor';
  return 'Malaya Collection';
}
function sitePriceOf(material, sub, id) {
  const base = {
    'Platinum': 5400,
    '18k Yellow Gold': 1850, '18k White Gold': 1900, '18k Rose Gold': 1850,
    '14k Yellow Gold': 1250, '14k White Gold': 1300, '14k Rose Gold': 1300,
    'Yellow Gold Plated': 260, 'Rose Gold Plated': 260, 'Silver 925': 240,
  }[material] || 240;
  let p = base;
  const s = sub.toLowerCase();
  if (s.includes('diamond')) p += 400;
  if (s.includes('large') || s.includes('big')) p += 60;
  if (s.includes('small')) p -= 40;
  if (s.includes('cufflink')) p += 80;
  p += (id.charCodeAt(3) % 5) * 12;
  return p;
}

const fileOf = (p) => (p.img ? p.img.split('/').pop() : '');
const EXISTING_FILES = new Set(PRODUCTS.map((p) => fileOf(p)));

// Live-site extras never receive admin overrides (they aren't in the price sheet),
// so they're computed once.
export const SITE_EXTRAS = SITE_EXTRA
  .filter(([, , , file]) => !EXISTING_FILES.has(file))
  .map(([id, name, sub, file, category]) => {
    const material = siteMaterialOf(name, sub);
    const price = sitePriceOf(material, sub, id);
    const img = prodImg(file);
    return {
      id, name, sub, category, material,
      collection: siteCollectionOf(name, sub),
      img, images: img ? [img] : [], story: '',
      price, listPrice: price, salePrice: null, onSale: false,
      stock: 'In stock', tag: null, salesCode: null, qty: null,
    };
  });

// ── Custom (studio-created) products ──────────────────────────────────────────
// Items added from the admin's unified Inventory live entirely in the override
// layer (key `c…`, flag `_custom`). They become first-class storefront products.
function customProducts(overrides) {
  return Object.keys(overrides)
    .filter((id) => isCustom(overrides[id]) && !isDeleted(overrides[id]))
    .map((id) => {
      const o = overrides[id];
      const base = {
        id, name: '', sub: '', category: 'Pendants', collection: 'Malaya Collection',
        material: 'Silver 925', listPrice: Number(o.listPrice ?? o.retail) || 0, salePrice: null,
        stock: 'In stock', img: null, tag: null, salesCode: o.salesCode || null,
      };
      return resolveProduct(base, o);
    })
    .filter((p) => p.name && p.name.trim() && !HIDDEN_STOCK.includes(p.stock));
}

// ── Builder ──────────────────────────────────────────────────────────────────
// The storefront is the studio catalogue + live-site extras + any studio-created
// items, plus the stock-ledger lines the admin has taken online. Each physical
// piece appears once: a linked ledger line folds its photos/story into its
// catalogue listing (see mergedCatalogueOverride) rather than showing twice.
// Resolve the admin "merge" aliases: { duplicateId → masterId }, following any
// chain to the final master (cycle-guarded). Stored as `mergedInto` on the
// duplicate's override (lib/overrides.js), set from the Inventory desk.
export function resolveAliases(overrides = {}) {
  const direct = {};
  Object.keys(overrides).forEach((id) => {
    const m = overrides[id] && overrides[id].mergedInto;
    if (m && m !== id) direct[id] = m;
  });
  const out = {};
  Object.keys(direct).forEach((id) => {
    let t = direct[id]; const seen = new Set([id]);
    while (direct[t] && !seen.has(t)) { seen.add(t); t = direct[t]; }
    out[id] = t;
  });
  return out;
}

export function buildSiteData(overrides = {}) {
  const ALIASES = resolveAliases(overrides);
  const isMerged = (id) => Object.prototype.hasOwnProperty.call(ALIASES, id);

  // 1. Only UNLINKED ledger lines publish as standalone storefront products. A
  // linked line's data folds into its catalogue listing (step 2), so the piece
  // shows once.
  const ledgerProducts = STOCK_ROWS
    .filter((row) => !(row.productIds && row.productIds.length))
    .map((row) => resolveLedgerStorefront(row, overrides[row.sku]))
    .filter((p) => p.published && !HIDDEN_STOCK.includes(p.stock) && !isDeleted(overrides[p.id]));

  // 2. Studio catalogue. Each listing reads its own override merged with any
  // photos/story uploaded under a linked stock SKU, so legacy SKU uploads keep
  // showing on the canonical product page.
  const catalogue = PRODUCTS
    .map((p) => resolveProduct({ ...p.base, id: p.id, img: p.img, tag: p.tag }, mergedCatalogueOverride(p.id, overrides)))
    .filter((p) => !HIDDEN_STOCK.includes(p.stock) && !isDeleted(overrides[p.id]));

  // 3. Live-site extras + studio-created items — fully override-aware products.
  const extras = SITE_EXTRAS
    .map((p) => resolveProduct(p, overrides[p.id]))
    .filter((p) => !HIDDEN_STOCK.includes(p.stock) && !isDeleted(overrides[p.id]));
  const customs = customProducts(overrides);

  // Drop any item merged into another so each physical piece shows once; the
  // master listing carries it.
  const SITE_PRODUCTS = [...ledgerProducts, ...catalogue, ...extras, ...customs].filter((p) => !isMerged(p.id));
  const SITE_BY_ID = Object.fromEntries(SITE_PRODUCTS.map((p) => [p.id, p]));
  // A merged duplicate's id still resolves to its master, so old links and cart
  // entries keep working after a merge.
  Object.keys(ALIASES).forEach((dup) => { const m = SITE_BY_ID[ALIASES[dup]]; if (m) SITE_BY_ID[dup] = m; });
  // Old sales-code / stock-SKU links (e.g. /product/N024-S, admin "View on site")
  // resolve to the canonical listing.
  SITE_PRODUCTS.forEach((p) => {
    const sku = SKU_FOR_PRODUCT[p.id];
    [p.salesCode, sku].forEach((code) => { if (code && !SITE_BY_ID[code]) SITE_BY_ID[code] = p; });
  });

  // The Tashi Mannox page shows exactly the pieces flagged with the "Tashi
  // Mannox" special attribute (curated by the studio in the admin).
  const TASHI_PRODUCTS = SITE_PRODUCTS.filter((p) => p.tashi);
  const HOME_BEST = ['x037', 'x038', 'x039', 'p059', 'x001', 'x030'].map((id) => SITE_BY_ID[id]).filter(Boolean);
  const MEGA_FEATURED = ['p058', 'x041', 'x042', 'p086'].map((id) => SITE_BY_ID[id]).filter(Boolean);

  return { SITE_PRODUCTS, SITE_BY_ID, TASHI_PRODUCTS, HOME_BEST, MEGA_FEATURED, ALIASES };
}

// ── Related products ("You May Also Like") ───────────────────────────────────
// Motif-driven cross-sell: pieces that share a sacred motif in their name (Dorje,
// Phurba, a Heart Syllable, …) are surfaced together, falling back to the same
// category, then anything, so the row is always filled. Edit the list to tune it.
export const RELATED_KEYWORDS = [
  'Lucky', 'Dorje', 'Vajra', 'Drigug', 'Phurba', 'Bell', 'Ghanta', 'Hung', 'Tam', 'Om', 'Ah',
  'Bam', 'Dhi', 'Dzam', 'Hri', 'Syllable', 'Mantra', 'Tara', 'Kalachakra', 'Mandala',
  'Endless Knot', 'Conch', 'Lotus', 'Skull', 'Kapala', 'Dakini', 'Garuda', 'Naga',
  'Sun and Moon', 'Nyima', 'Dawa', 'Mala', 'Gau', 'Melong', 'Stupa', 'Wheel', 'Dharma',
];

function keywordsIn(text) {
  const s = String(text || '').toLowerCase();
  return RELATED_KEYWORDS.filter((k) => s.includes(k.toLowerCase()));
}

export function relatedProducts(p, all = [], n = 4) {
  if (!p) return [];
  const pool = all.filter((x) => x.id !== p.id);
  const mine = keywordsIn(`${p.name} ${p.sub || ''}`);
  const out = [];
  const seen = new Set();
  const push = (x) => { if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); } };
  if (mine.length) {
    pool
      .map((x) => ({ x, shared: keywordsIn(`${x.name} ${x.sub || ''}`).filter((k) => mine.includes(k)).length }))
      .filter((e) => e.shared > 0)
      .sort((a, b) => b.shared - a.shared)
      .forEach((e) => { if (out.length < n) push(e.x); });
  }
  // Fill from the same category, then anything, so the row always shows n items.
  if (out.length < n) pool.filter((x) => x.category === p.category).forEach((x) => { if (out.length < n) push(x); });
  if (out.length < n) pool.forEach((x) => { if (out.length < n) push(x); });
  return out.slice(0, n);
}

// ── Static page content ──────────────────────────────────────────────────────
export const SITE_NAV = [
  { label: 'Home', path: '/' },
  { label: 'Catalogue', path: '/catalogue', mega: true },
  { label: 'Explore', path: '/explore' },
  { label: 'Tashi Mannox', path: '/tashi' },
  { label: 'Contact', path: '/contact' },
  { label: 'About', path: '/about' },
  { label: 'Instagram', href: 'https://www.instagram.com/malayajewelrybhutan.official' },
];

// Hero slides come from the admin (settings.heroSlides, Firebase-hosted). No
// built-in CDN slides — an empty default just shows the hero's background until
// the studio uploads slideshow images.
export const HOME_HERO = [];

// Category tile metadata. Images are uploaded per category from the admin
// (settings.homeTiles, Firebase-hosted); there is no built-in image.
export const HOME_TILES = [
  { title: 'Rings',     img: null, cat: 'Rings' },
  { title: 'Bracelets', img: null, cat: 'Bracelets' },
  { title: 'Earrings',  img: null, cat: 'Earrings' },
  { title: 'Pendants',  img: null, cat: 'Pendants' },
];

export const TASHI_INTRO = [
  'Tashi Mannox is considered one of the top Tibetan calligraphers in the world, who although highly acclaimed for his knowledge and mastery of the traditional Tibetan designs, is highly creative and innovative. He started his career as a young man, entering a monastic university and spending 4 years in retreat where aside from meditation he practiced the art of calligraphy by copying ancient manuscripts of timeless wisdom.',
  'He remained an ordained monk for over 17 years, all along studying arts including temple decoration, the significance of decorative motifs, etc. His unique and rare talent is his mastery of ancient and contemporary Tibetan (ཆོས་སྐད།) scripts, such as Lantsa, Wartu, Uchen etc.',
  'Now regarded as one of the foremost Tibetan calligraphers alive he works closely with Malaya Jewellery, creating uniquely accurate pieces of art based in the traditional art of calligraphy featured prominently in our Sacred Syllables collection.',
];

export const ABOUT_LEAD = 'Malaya Jewellery is a Bhutan based and inspired brand focused on designing and crafting jewelry with a deep connection to the spiritual traditions of the Himalayas.';
export const ABOUT_BODY = [
  'Malaya Jewellery is a Bhutan based and inspired brand focused on designing and crafting jewelry with a deep connection to the spiritual traditions of the Himalayas. We decided that sacred traditions need appropriate representation in the world of jewelry — helping others find inspiration, healing, protection and awakening.',
  'We work with a team of artists, craftsmen and visionaries from all over Europe and south east Asia, including France, Bhutan, Thailand, England and other countries.',
  'Each of the pieces comes into existence with a single spark of insight, yet many hours are necessary to perfect it — including tasks such as wax carving, calligraphy, drawing, 3D design, metal casting, filing, polishing and stone setting, etc.',
  'The items we create include unisex collections that can be worn by anyone, as well as items specifically designed for women as well as men. We use silver, gold, rhodium, platinum, diamonds and other precious materials in our creations.',
  'The brand started in 2016 and we have been regularly releasing new items ever since.',
];

export const SITE_INFO = {
  address: ['Malaya Jewellery, City Mall', 'Opposite Department of Tourism', 'Chubachu, Thimphu, Bhutan'],
  whatsapp: '+975 77794394',
  whatsappUrl: "https://api.whatsapp.com/send?phone=+97577794394&text=I've contacted you via Malaya Jewellery International website.",
  email: 'cs@malayajewelry.com',
  facebook: 'https://www.facebook.com/people/Malaya-Jewelry-Bhutan/61584607561278/',
  instagram: 'https://www.instagram.com/malayajewelrybhutan.official',
  pinterest: 'https://in.pinterest.com/malayajewelry/malaya-jewelry/',
  linktree: 'https://linktr.ee/malayajewelry',
};

// ── Editable site copy & links ────────────────────────────────────────────────
// Every real piece of page text and every external link, with the values above
// as defaults. The admin "Content" tab saves a partial nested patch (Firestore
// siteSettings/content, see lib/site-content.js); resolveContent() merges it over
// these defaults so an unset slot keeps the original copy.

const DEFAULT_WA_TEXT = "I've contacted you via Malaya Jewellery International website.";
export function whatsappUrlFor(number, text = DEFAULT_WA_TEXT) {
  const digits = String(number || '').replace(/[^0-9]/g, '');
  return `https://api.whatsapp.com/send?phone=+${digits}&text=${encodeURIComponent(text)}`;
}

export const CONTENT_DEFAULTS = {
  nav: { home: 'Home', catalogue: 'Catalogue', explore: 'Explore', tashi: 'Tashi Mannox', blog: 'Blog', contact: 'Contact', about: 'About', instagram: 'Instagram' },
  hero: { title: 'Malaya Jewellery', subtitle: '', cta: 'View All Collections' },
  home: {
    sectionTitle: 'Malaya Jewellery', bannerTitle: 'Malaya Jewellery — Order Now', bannerCta: 'View All Collections',
    tiles: { Rings: 'Rings', Bracelets: 'Bracelets', Earrings: 'Earrings', Pendants: 'Pendants' },
  },
  banners: {
    catalogueSubtitle: 'Malaya Jewellery',
    about: { title: 'About', subtitle: 'Malaya Jewellery' },
    contact: { title: 'Contact', subtitle: 'Malaya Jewellery' },
    order: { title: 'My Order', subtitle: 'Malaya Jewellery' },
    tashi: { title: 'Collaboration', subtitle: 'With Malaya Jewellery' },
  },
  about: {
    date: 'Oct 23, 2016', title: 'Malaya Jewellery', lead: ABOUT_LEAD,
    from: 'A letter from: The Shop Team at Malaya Jewellery in Bhutan',
    caption: 'Malaya Jewellery — inspired by traditional Bhutanese and Buddhist iconography', body: ABOUT_BODY,
  },
  tashi: {
    kicker: 'Malaya Jewellery Collaboration With', name: 'Tashi Mannox', role: 'Calligraphy Artist',
    intro: TASHI_INTRO, productsTitle: 'Tashi Mannox & Malaya Jewellery',
  },
  mega: { promoTitle: 'Mystical Beings', promoDesc: 'Add a splash of colour to your Jewelry with Malaya.', promoCta: 'Order Now' },
  product: {
    credit: 'Designed and crafted by Malaya Jewellery in Thimphu, Bhutan — inspired by the spiritual traditions of the Himalayas.',
  },
  footer: {
    contactStrip: 'Questions about Malaya Jewellery?', followNote: 'Get latest news and proposals',
    copyright: '© 2018–2026 Malaya Jewellery', location: 'Thimphu, Bhutan',
  },
  contact: {
    address: SITE_INFO.address, whatsapp: SITE_INFO.whatsapp, email: SITE_INFO.email,
    facebook: SITE_INFO.facebook, instagram: SITE_INFO.instagram,
    pinterest: SITE_INFO.pinterest, linktree: SITE_INFO.linktree,
  },
  legal: {
    privacy: {
      title: 'Privacy Policy',
      body: [
        'Malaya Jewellery respects your privacy. We only collect the information you choose to share with us — such as your name, email address and the details you send when you contact us or place an order — and we use it solely to respond to your enquiry and fulfil your order.',
        'We never sell or rent your personal information to third parties. If you have any questions about how your data is handled, please contact us and we will be glad to help.',
      ],
    },
    terms: {
      title: 'Terms and Conditions',
      body: [
        'By using this website and placing an order with Malaya Jewellery you agree to these terms. All orders are subject to availability and confirmation of the price; we confirm availability, shipping and payment with you directly over WhatsApp or email before any order is finalised.',
        'All designs, images and content on this site remain the property of Malaya Jewellery and may not be reproduced without our written permission.',
      ],
    },
    cookie: {
      title: 'Cookie Policy',
      body: [
        'This website uses a small number of cookies to remember the contents of your order and to help us understand how the site is used. Cookies are tiny text files stored by your browser and contain no information that personally identifies you.',
        'You can disable cookies in your browser settings at any time, though some features — such as your saved order — may no longer work as expected.',
      ],
    },
    refund: {
      title: 'Refund Policy',
      body: [
        'Every Malaya Jewellery piece is crafted with great care. If something is not right with your order, please contact us within 14 days of receiving it and we will work with you to arrange a repair, exchange or refund where appropriate.',
        'Custom and made-to-order pieces may not be eligible for return. Please reach out over WhatsApp or email and we will be happy to discuss your particular situation.',
      ],
    },
  },
};

// Recursive merge: saved values win unless empty/undefined; arrays are handled
// separately (admin stores them as newline text — see asParas/asLines below).
function mergeContent(def, saved) {
  if (Array.isArray(def)) return Array.isArray(saved) ? saved : def;
  if (def && typeof def === 'object') {
    const out = {};
    for (const k of Object.keys(def)) out[k] = mergeContent(def[k], saved ? saved[k] : undefined);
    return out;
  }
  return saved === undefined || saved === null || saved === '' ? def : saved;
}
function asParas(v, fallback) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return fallback;
}
function asLines(v, fallback) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return fallback;
}

// Merge the saved partial content over the defaults into the structured object
// the storefront pages read (arrays for multi-line fields, derived whatsappUrl).
export function resolveContent(saved = {}) {
  const s = saved || {};
  const c = mergeContent(CONTENT_DEFAULTS, s);
  c.about.body = asParas(s.about && s.about.body, CONTENT_DEFAULTS.about.body);
  c.tashi.intro = asParas(s.tashi && s.tashi.intro, CONTENT_DEFAULTS.tashi.intro);
  c.contact.address = asLines(s.contact && s.contact.address, CONTENT_DEFAULTS.contact.address);
  // WhatsApp now supports one or more numbers (admin enters one per line). The
  // first number stays the primary used for single one-tap links; the footer and
  // contact page list every number with its own chat link.
  const numbers = asLines(s.contact && s.contact.whatsapp, [CONTENT_DEFAULTS.contact.whatsapp])
    .map((n) => String(n).trim()).filter(Boolean);
  const list = numbers.length ? numbers : [CONTENT_DEFAULTS.contact.whatsapp];
  c.contact.whatsapps = list;
  c.contact.whatsapp = list[0];
  c.contact.whatsappList = list.map((n) => ({ number: n, url: whatsappUrlFor(n) }));
  c.contact.whatsappUrl = whatsappUrlFor(list[0]);
  // Legal pages — title is merged above; bodies are stored as newline-separated
  // paragraphs and parsed here (mirrors about.body / tashi.intro).
  ['privacy', 'terms', 'cookie', 'refund'].forEach((k) => {
    c.legal[k].body = asParas(s.legal && s.legal[k] && s.legal[k].body, CONTENT_DEFAULTS.legal[k].body);
  });
  return c;
}
