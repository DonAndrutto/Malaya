// ─────────────────────────────────────────────────────────────────────────────
// Canonical material taxonomy for the whole site (catalogue, ledger, extras and
// the admin desk). The studio uses one strict list of metals; everything else —
// legacy values stored in old overrides, the loose strings in the stock ledger,
// and the free-text sub-titles in the catalogue — is normalised onto it.
//
//   • detectMaterial(text)   — derive a material from a name/sub-title.
//   • normalizeMaterial(m)   — map any legacy/loose value onto the strict list.
//
// Vermeil and plain "gold plated" are gold over a silver core, so they collapse
// into "Yellow Gold Plated" (rose-toned plating → "Rose Gold Plated").
// ─────────────────────────────────────────────────────────────────────────────

export const MATERIALS = [
  'Silver 925',
  '14k Yellow Gold',
  '18k Yellow Gold',
  '14k White Gold',
  '18k White Gold',
  '14k Rose Gold',
  '18k Rose Gold',
  'Platinum',
  'Yellow Gold Plated',
  'Rose Gold Plated',
];

const MATERIAL_SET = new Set(MATERIALS);

// Stock / availability states. "Low stock" has been merged into "In stock" —
// the studio judges stock visually via the Units column and the sort controls.
export const STOCK_OPTIONS = ['In stock', 'Made to order', 'Sold out', 'Archived'];

// Special attributes an item can carry (any combination). Order = display order.
export const SPECIALS = [
  { key: 'sale', label: 'Sale' },
  { key: 'tashi', label: 'Tashi Mannox' },
  { key: 'new', label: 'New' },
];
export const SPECIAL_KEYS = SPECIALS.map((s) => s.key);

// Legacy / loose → strict. Karat-less white & rose gold default to 14k (the most
// common in the catalogue); the studio can promote individual pieces to 18k.
const LEGACY_MATERIAL = {
  '18k gold': '18k Yellow Gold',
  '14k gold': '14k Yellow Gold',
  'yellow gold': '14k Yellow Gold',
  gold: '14k Yellow Gold',
  'white gold': '14k White Gold',
  'rose gold': '14k Rose Gold',
  vermeil: 'Yellow Gold Plated',
  'gold plated': 'Yellow Gold Plated',
  'gold-plated': 'Yellow Gold Plated',
  'rose gold plated': 'Rose Gold Plated',
  silver: 'Silver 925',
  'silver 925': 'Silver 925',
  '925 silver': 'Silver 925',
  sterling: 'Silver 925',
  platinum: 'Platinum',
};

export function normalizeMaterial(m, fallback = 'Silver 925') {
  if (!m) return fallback;
  if (MATERIAL_SET.has(m)) return m;
  const key = String(m).trim().toLowerCase();
  return LEGACY_MATERIAL[key] || detectMaterial(m, fallback);
}

function karatOf(s) {
  if (/\b18\s*k|18k|18\s*ct|18\s*karat|\b18\b/.test(s)) return '18k';
  if (/\b14\s*k|14k|14\s*ct|14\s*karat|\b14\b/.test(s)) return '14k';
  return null;
}

// Derive a strict material from free text (a name + sub-title). The order of the
// checks matters: plating/vermeil and the white/rose tints win over the bare
// "gold"/karat signals so "vermeil gold" → plated, "white 18k gold" → white.
export function detectMaterial(text, fallback = 'Silver 925') {
  const s = String(text || '').toLowerCase();
  if (s.includes('platinum')) return 'Platinum';

  const k = karatOf(s);
  const rose = s.includes('rose');

  if (s.includes('vermeil') || s.includes('plated') || /gold[\s-]*plate/.test(s)) {
    return rose ? 'Rose Gold Plated' : 'Yellow Gold Plated';
  }
  if (s.includes('white')) return (k === '18k' ? '18k' : '14k') + ' White Gold';
  if (rose) return (k === '18k' ? '18k' : '14k') + ' Rose Gold';
  if (s.includes('gold') || k || s.includes('solid gold')) {
    if (k === '14k') return '14k Yellow Gold'; // an explicit karat always wins
    if (k === '18k' || s.includes('solid gold') || s.includes('18 yellow')) return '18k Yellow Gold';
    return '14k Yellow Gold';
  }
  if (s.includes('silver') || s.includes('sterling') || s.includes('925')) return 'Silver 925';
  return fallback;
}

// ── Metal grouping (for the bulk price-adjust scope) ─────────────────────────
// "Solid gold" tracks the gold spot price (all karats / colours). "Silver-core"
// covers plain silver plus the plated pieces (gold over a silver base). Platinum
// stands alone.
export const METAL_GROUPS = {
  'Solid gold': ['14k Yellow Gold', '18k Yellow Gold', '14k White Gold', '18k White Gold', '14k Rose Gold', '18k Rose Gold'],
  'Silver & plated': ['Silver 925', 'Yellow Gold Plated', 'Rose Gold Plated'],
  Platinum: ['Platinum'],
};

export function metalGroupOf(material) {
  for (const g of Object.keys(METAL_GROUPS)) {
    if (METAL_GROUPS[g].includes(material)) return g;
  }
  return null;
}

// ── Special attributes resolution ────────────────────────────────────────────
// An override may carry an explicit `specials` array (the admin multi-select);
// otherwise we seed it from the item's legacy `tag` ('new' / 'sale'). Tashi is
// never auto-derived — the studio toggles it per item.
export function resolveSpecials(baseTag, override) {
  const o = override || {};
  if (Array.isArray(o.specials)) return o.specials.filter((k) => SPECIAL_KEYS.includes(k));
  const arr = [];
  if (baseTag === 'new') arr.push('new');
  if (baseTag === 'sale') arr.push('sale');
  return arr;
}
