// ─────────────────────────────────────────────────────────────────────────────
// Site-wide data for the Malaya Jewelry storefront (the "Malaya Site" design).
//
// The public catalogue is built from resolveCatalogue(PRODUCTS, overrides) so that
// every edit made in the /admin console (the shared localStorage override layer)
// flows straight into the live catalogue. On top of the studio catalogue we merge
// the items that appear on the live site but not in the price sheet — the
// Tashi-Mannox brooches/earrings/cufflinks, bangles and findings.
// ─────────────────────────────────────────────────────────────────────────────

import { PRODUCTS, COLLECTIONS, CATEGORIES, MATERIALS, fmtPrice } from './products';
import { resolveCatalogue } from './resolve';
import { STOCK_ROWS, resolveLedgerStorefront } from './ledger';

export { COLLECTIONS, CATEGORIES, MATERIALS, fmtPrice };

const SITE_BASE = 'https://malayajewelrybhutan.com/';

// Serve the seeded images from the repo's /public/images once they're present
// (run `node scripts/fetch-images.mjs`, then set NEXT_PUBLIC_IMAGE_SOURCE=local).
// Until then we serve from the live CDN, which still works today.
const LOCAL_IMAGES = process.env.NEXT_PUBLIC_IMAGE_SOURCE === 'local';

export const siteImg = (f) => (LOCAL_IMAGES ? '/images/site/' : SITE_BASE + 'images/') + f;
export const prodImg = (f) => (LOCAL_IMAGES ? '/images/products/' : SITE_BASE + 'products/') + f;

// Admin-chosen focal point ("x% y%") for a banner/hero/tile image URL, stored in
// site settings under `imgPos` (keyed by image URL). Defaults to centred crop.
export const posFor = (settings, url) => (settings && settings.imgPos && settings.imgPos[url]) || 'center';

// Map a local /images/... path back to its live-CDN URL, for the <SiteImg>
// onError fallback chain (local file missing → CDN → smaller size).
export function cdnFallback(src) {
  if (typeof src !== 'string') return null;
  if (src.startsWith('/images/products/')) return SITE_BASE + 'products/' + src.slice('/images/products/'.length);
  if (src.startsWith('/images/site/')) return SITE_BASE + 'images/' + src.slice('/images/site/'.length);
  return null;
}

// Items in these states never appear in the public storefront.
const HIDDEN_STOCK = ['Archived'];

// Every image featured on the Tashi Mannox collaboration page, in page order.
const TASHI_FILES = [
  '638472658222884798M.jpg', '638192669740154094M.jpg', '638025478972854961M.jpg',
  '637955106113062766M.jpg', '637955089861320079M.jpg', '637902378986609616M.jpg',
  '637746154110927262M.jpg', '637895150926827742M.jpg', '637719185223044388M.jpg',
  '637697784478494920M.jpg', '637697783403552653M.jpg', '637697782329801496M.jpg',
  '637352139877916545M.jpg', '637853527478274269M.jpeg', '637337797030044934M.jpg',
  '637323087572372768M.jpeg', '637259746373659011M.jpg', '637204480963779846M.jpeg',
  '637227574162242679M.jpeg', '637204870922541081M.jpeg', '637031026370200873M.jpeg',
  '636991020374610258M.jpeg', '636990993143770915M.jpeg', '636990964739728346M.jpeg',
  '636991029440964619M.jpeg', '637204726132505537M.jpeg', '637823399327389979M.jpg',
  '637517279809542898M.jpeg', '637916738733666237M.jpeg', '637336747023919241M.jpg',
  '637259778058727897M.jpg', '637866648572502724M.jpg', '637866651391311923M.jpg',
  '637894953958122516M.jpg', '637791007088936924M.jpeg', '637791004255848795M.jpeg',
  '637735863726682139M.jpeg', '637735859115470612M.jpeg', '637793082098660649M.jpeg',
  '637259773533736774M.jpg', '637188877408857935M.jpg', '637161062191441950M.jpg',
  '637338452133937761M.jpg', '637338451371377271M.jpg', '637338416020041210M.jpg',
  '637338415024651095M.jpg', '637338412214739026M.jpg', '637338410771967138M.jpg',
  '637338268562853727M.jpg', '637338267670126115M.jpg', '637338265179148427M.jpg',
  '637338263862174139M.jpg', '637338261510588451M.jpg', '637337778543293910M.jpg',
  '637337777156308192M.jpg', '637337771988719315M.jpg', '637337768486258885M.jpg',
  '637337762909412687M.jpg', '637337760785033783M.jpg', '637259771689159582M.jpg',
  '637259748927974643M.jpg', '637227550638566558M.jpeg', '637227557581044083M.jpeg',
  '637165622043956991M.jpg', '637165621352643619M.jpg', '637470480618665198M.jpg',
  '637338543812223395M.jpg',
];
const TASHI_SET = new Set(TASHI_FILES);

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

function siteMaterialOf(sub) {
  const s = sub.toLowerCase();
  if (s.includes('platinum')) return 'Platinum';
  if (s.includes('white gold') || s.includes('white 14k') || s.includes('white 18k')) return 'White Gold';
  if (s.includes('rose')) return 'Rose Gold';
  if (s.includes('vermeil')) return 'Vermeil';
  if (s.includes('gold plated')) return 'Gold Plated';
  if (s.includes('18k') || s.includes('solid gold')) return '18k Gold';
  if (s.includes('14k')) return '14k Gold';
  if (s.includes('silver')) return 'Silver';
  return 'Silver';
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
    'Platinum': 5400, '18k Gold': 1850, 'White Gold': 1400, 'Rose Gold': 1300,
    '14k Gold': 1250, 'Vermeil': 280, 'Gold Plated': 200, 'Silver': 240,
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
const SITE_EXTRAS = SITE_EXTRA
  .filter(([, , , file]) => !EXISTING_FILES.has(file))
  .map(([id, name, sub, file, category]) => {
    const material = siteMaterialOf(sub);
    const price = sitePriceOf(material, sub, id);
    const img = prodImg(file);
    return {
      id, name, sub, category, material,
      collection: siteCollectionOf(name, sub),
      img, images: [img], story: '',
      price, listPrice: price, salePrice: null, onSale: false,
      stock: 'In stock', tag: null, salesCode: null, qty: null,
      tashi: TASHI_SET.has(file),
    };
  });

// ── Builder ──────────────────────────────────────────────────────────────────
// Published stock-ledger lines lead the storefront, followed by the studio
// catalogue (minus any line a published ledger item supersedes) and the
// live-site extras. Every record carries `images`/`story` for the gallery and
// editable narrative on the product page.
export function buildSiteData(overrides = {}) {
  // 1. Ledger lines the admin has taken online (image-independent).
  const ledgerProducts = STOCK_ROWS
    .map((row) => resolveLedgerStorefront(row, overrides[row.sku]))
    .filter((p) => p.published && !HIDDEN_STOCK.includes(p.stock))
    .map((p) => ({ ...p, tashi: false }));

  // A published ledger line is the same physical item as any catalogue listing
  // it is linked to, so suppress those to avoid showing the piece twice online.
  const superseded = new Set();
  ledgerProducts.forEach((p) => (p.productIds || []).forEach((id) => superseded.add(id)));

  const catalogue = resolveCatalogue(PRODUCTS, overrides)
    .filter((p) => !HIDDEN_STOCK.includes(p.stock) && !superseded.has(p.id))
    .map((p) => ({ ...p, tashi: TASHI_SET.has(fileOf(p)) }));

  // Live-site extras carry no price-sheet entry, but the admin can still upload
  // images (now a gallery) and a story for them, stored under their id.
  const extras = SITE_EXTRAS.map((p) => {
    const o = overrides[p.id];
    if (!o) return p;
    const images = Array.isArray(o.images) && o.images.length ? o.images : (o.img ? [o.img] : p.images);
    return { ...p, img: images[0] || p.img, images, story: o.story != null ? o.story : p.story };
  });

  const SITE_PRODUCTS = [...ledgerProducts, ...catalogue, ...extras];
  const SITE_BY_ID = Object.fromEntries(SITE_PRODUCTS.map((p) => [p.id, p]));
  const TASHI_PRODUCTS = TASHI_FILES
    .map((f) => SITE_PRODUCTS.find((p) => fileOf(p) === f))
    .filter(Boolean);
  const HOME_BEST = ['x037', 'x038', 'x039', 'p059', 'x001', 'x030'].map((id) => SITE_BY_ID[id]).filter(Boolean);
  const MEGA_FEATURED = ['p058', 'x041', 'x042', 'p086'].map((id) => SITE_BY_ID[id]).filter(Boolean);

  return { SITE_PRODUCTS, SITE_BY_ID, TASHI_PRODUCTS, HOME_BEST, MEGA_FEATURED };
}

// ── Static page content ──────────────────────────────────────────────────────
export const SITE_NAV = [
  { label: 'Home', path: '/' },
  { label: 'Catalogue', path: '/catalogue', mega: true },
  { label: 'Tashi Mannox', path: '/tashi' },
  { label: 'Contact', path: '/contact' },
  { label: 'About', path: '/about' },
  { label: 'Instagram', href: 'https://www.instagram.com/malayajewelrybhutan.official' },
];

export const HOME_HERO = ['malaya-jewelry-a.jpg', 'malaya-jewelry-b.jpg', 'malaya-jewelry-c.jpg', 'malaya-jewelry-d.jpg']
  .map((f) => siteImg('home/home6/' + f));

export const HOME_TILES = [
  { title: 'Malaya Rings', img: siteImg('pages/637029624591107629A.jpg'), cat: 'Rings' },
  { title: 'Bracelets',    img: siteImg('pages/636932877383986659B.jpg'), cat: 'Bracelets' },
  { title: 'Earrings',     img: siteImg('pages/637029624591127589C.jpg'), cat: 'Earrings' },
  { title: 'Pendants',     img: siteImg('pages/637029624591137561D.jpg'), cat: 'Pendants' },
];

export const TASHI_INTRO = [
  'Tashi Mannox is considered one of the top Tibetan calligraphers in the world, who although highly acclaimed for his knowledge and mastery of the traditional Tibetan designs, is highly creative and innovative. He started his career as a young man, entering a monastic university and spending 4 years in retreat where aside from meditation he practiced the art of calligraphy by copying ancient manuscripts of timeless wisdom.',
  'He remained an ordained monk for over 17 years, all along studying arts including temple decoration, the significance of decorative motifs, etc. His unique and rare talent is his mastery of ancient and contemporary Tibetan (ཆོས་སྐད།) scripts, such as Lantsa, Wartu, Uchen etc.',
  'Now regarded as one of the foremost Tibetan calligraphers alive he works closely with Malaya Jewelry, creating uniquely accurate pieces of art based in the traditional art of calligraphy featured prominently in our Sacred Syllables collection.',
];

export const ABOUT_LEAD = 'Malaya Jewelry is a Bhutan based and inspired brand focused on designing and crafting jewelry with a deep connection to the spiritual traditions of the Himalayas.';
export const ABOUT_BODY = [
  'Malaya Jewelry is a Bhutan based and inspired brand focused on designing and crafting jewelry with a deep connection to the spiritual traditions of the Himalayas. We decided that sacred traditions need appropriate representation in the world of jewelry — helping others find inspiration, healing, protection and awakening.',
  'We work with a team of artists, craftsmen and visionaries from all over Europe and south east Asia, including France, Bhutan, Thailand, England and other countries.',
  'Each of the pieces comes into existence with a single spark of insight, yet many hours are necessary to perfect it — including tasks such as wax carving, calligraphy, drawing, 3D design, metal casting, filing, polishing and stone setting, etc.',
  'The items we create include unisex collections that can be worn by anyone, as well as items specifically designed for women as well as men. We use silver, gold, rhodium, platinum, diamonds and other precious materials in our creations.',
  'The brand started in 2016 and we have been regularly releasing new items ever since.',
];

export const SITE_INFO = {
  address: ['Malaya Jewelry, City Mall', 'Opposite Department of Tourism', 'Chubachu, Thimphu, Bhutan'],
  whatsapp: '+975 77794394',
  whatsappUrl: 'https://api.whatsapp.com/send?phone=+97577794394&text=Hi, I contacted you Through Malaya Bhutan website.',
  email: 'cs@malayajewelry.com',
  facebook: 'https://www.facebook.com/people/Malaya-Jewelry-Bhutan/61584607561278/',
  instagram: 'https://www.instagram.com/malayajewelrybhutan.official',
};
