import { buildSiteData, isInStock } from '../data/site-data';
import { documentFingerprint } from './vajra-change-set';

// This batch does not run the Vajra migration or edit any product copy.
export const SYMBOLS_VERSION = 'explore-symbols-2026-11-05';
export const SYMBOLS = [
  { key: 'knot', slug: 'the-endless-knot', title: 'Endless Knot', aliases: ['Endless Knot', 'Infinity Knot', 'Eternity Knot', 'Eternal Knot', 'Palbeu'], subtitle: 'Palbeu · དཔལ་བེའུ།',
    intro: 'The endless knot is a continuous interlacing form, known in Tibetan as Palbeu. One of the Eight Auspicious Symbols, it expresses interdependence and the inseparability of wisdom and compassion. These pieces explore its crossings and open spaces as pendants, earrings, bracelets and rings.',
    pattern: /\b(?:endless|infinity|eternity|eternal) knots?\b/ },
  { key: 'bell', slug: 'ritual-bell', title: 'Bell', aliases: ['Bell', 'Ritual Bell', 'Drilbu', 'Ghanta', 'Gantha'], subtitle: 'Drilbu · དྲིལ་བུ།',
    intro: 'The ritual bell, drilbu in Tibetan and ghanta in Sanskrit, represents wisdom in Vajrayana Buddhism. It is traditionally paired with the vajra, which represents skilful means. This selection includes the bell on its own and pieces that bring the two forms together.',
    pattern: /\b(?:bell|drilbu|ghanta|gantha)\b/ },
  { key: 'eight', slug: 'eight-auspicious-symbols', title: 'Eight Auspicious Symbols', aliases: ['Eight Lucky Signs', '8 Lucky Signs', 'Auspicious Signs', 'Auspicious Symbols', 'Ashtamangala', 'Tashi Tagye'], subtitle: 'Tashi Tagye · Ashtamangala',
    intro: 'The Eight Auspicious Symbols bring together the parasol, golden fish, treasure vase, lotus, conch, endless knot, victory banner and Dharma wheel. They appear throughout Buddhist art in the Himalayan region. Here, complete eight-symbol designs sit alongside pieces explicitly identified with an individual auspicious emblem; the captions distinguish the two.',
    pattern: /\b(?:(?:eight|8) (?:lucky|auspicious) (?:signs|symbols)|auspicious (?:signs|symbols)|ashtamangala|tashi tagye|single auspicious)\b/ },
  { key: 'tara', slug: 'tara', title: 'Tara', aliases: ['Tara', 'Tam', 'Tam Syllable', 'Tara Mantra'], subtitle: 'Tam · ཏཱཾ།',
    intro: 'Tara is a figure of awakened compassion in Buddhist practice, closely associated with the seed syllable Tam. This selection brings together Tam calligraphy and pieces explicitly named for Tara or her mantra. The syllable and the mantra offer distinct approaches to lettering in jewellery.',
    pattern: /\b(?:tara|tam)\b/ },
  { key: 'double', slug: 'double-dorje', title: 'Double Dorje', aliases: ['Double Dorje', 'Double Vajra', 'Crossed Vajra', 'Vishvavajra', 'Vishva-vajra'], subtitle: 'Crossed vajra · Vishvavajra',
    intro: 'The double dorje, or crossed vajra, extends the vajra form in four directions around a shared centre. It is associated with awakened activity in Buddhist iconography. These pieces use the crossed form as a central emblem, a repeated bead or a detail within a larger design.',
    pattern: /\b(?:(?:double|crossed) (?:dorje|vajra)|vishva[ -]?vajra)\b/ },
  { key: 'phurba', slug: 'phurba', title: 'Phurba', aliases: ['Phurba', 'Phurpa', 'Kila', 'Kilaya'], subtitle: 'Phurpa · Kila',
    intro: 'The phurba, also called phurpa or kila, is a ritual implement associated with Vajrakilaya practice. Its characteristic form has a three-sided blade. The catalogue interprets this form in pendants, earrings and mala counters, with each piece retaining its own scale and construction.',
    pattern: /\b(?:phurba|phurpa|kila|kilaya)\b/ },
  { key: 'hung', slug: 'hung', title: 'Hung Syllable', aliases: ['Hung', 'Hum', 'Hūṃ'], subtitle: 'Hūṃ · ཧཱུྃ།',
    intro: 'Hung, also written Hūṃ, is a seed syllable associated with awakened mind in Tibetan Buddhist practice. Its written form gives these pieces their calligraphic structure. The selection includes standalone syllables and designs whose catalogue descriptions explicitly identify Hung within them.',
    pattern: /\b(?:hung|hum)\b/, syllable: true },
  { key: 'ah', slug: 'ah', title: 'Ah Syllable', aliases: ['Ah', 'Āḥ'], subtitle: 'Āḥ · ཨཱཿ',
    intro: 'Ah, written Āḥ in Sanskrit transliteration, is associated with awakened speech in the familiar sequence Om Ah Hung. Its open calligraphic form appears here in pendants, earrings and brooches. The explicitly named Om Ah Hung necklace is included as a composition of three syllables.',
    pattern: /\bah\b/, syllable: true },
  { key: 'om', slug: 'om', title: 'Om Syllable', aliases: ['Om', 'Oṃ'], subtitle: 'Oṃ · ཨོཾ།',
    intro: 'Om, written Oṃ in Sanskrit transliteration, is associated with awakened body in the sequence Om Ah Hung. These pieces give the syllable a distinct calligraphic presence, from pendants to earrings and brooches. The explicitly named Om Ah Hung necklace brings it together with Ah and Hung.',
    pattern: /\bom\b/, syllable: true },
  { key: 'hri', slug: 'hri', title: 'Hri Syllable', aliases: ['Hri', 'Hrih', 'Hrīḥ'], subtitle: 'Hrīḥ · ཧྲཱིཿ',
    intro: 'Hri, or Hrīḥ, is associated with the Lotus family of Buddhas, including Amitabha and Chenrezig. The catalogue presents the syllable in pendants and brooches of different scales. Each piece draws its outline from the written character.',
    pattern: /\bhrih?\b/, syllable: true },
];

export const normaliseSymbolText = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const equal = (a, b) => documentFingerprint(a) === documentFingerprint(b);

// Scan meaningful text only: a URL's encoded filename is not image alt text.
export function productEvidence(p, override = {}) {
  const result = [];
  for (const key of ['name', 'title', 'slug', 'sub', 'story', 'description', 'tags', 'tag', 'specials', 'alt', 'imageAlt']) {
    const value = p[key] ?? override[key];
    if (typeof value === 'string' && value) result.push({ field: key, text: value });
    if (Array.isArray(value)) value.filter((v) => typeof v === 'string').forEach((text) => result.push({ field: key, text }));
  }
  for (const [i, img] of (p.images || override.images || []).entries()) {
    if (img && typeof img === 'object' && img.alt) result.push({ field: `images[${i}].alt`, text: img.alt });
  }
  return result;
}

export function classifySymbol(p, definition, override = {}) {
  const evidence = productEvidence(p, override).filter((e) => definition.pattern.test(normaliseSymbolText(e.text)));
  if (!evidence.length) return { eligible: false, evidence };
  const identity = evidence.some((e) => ['name', 'title', 'slug', 'sub', 'tags', 'alt', 'imageAlt'].includes(e.field) || e.field.endsWith('.alt'));
  // A syllable inside a quoted mantra is not a design identification. The
  // explicitly titled OM AH HUNG composition is different and is included.
  const descriptionIdentifiesSyllable = evidence.some((e) => {
    const t = normaliseSymbolText(e.text);
    return new RegExp(`(?:syllable\\s+(?:${definition.key === 'hung' ? 'hung|hum' : definition.key === 'hri' ? 'hrih?' : definition.key})\\b|\\b(?:${definition.key === 'hung' ? 'hung|hum' : definition.key === 'hri' ? 'hrih?' : definition.key})\\s+syllable)`).test(t);
  });
  if (definition.syllable && !identity && !descriptionIdentifiesSyllable) {
    return { eligible: false, uncertain: 'Syllable occurs in contextual text without explicit design identification.', evidence };
  }
  if (!definition.syllable && !identity && !['knot', 'eight'].includes(definition.key)) {
    return { eligible: false, uncertain: 'Contextual mention needs design confirmation.', evidence };
  }
  const individual = definition.key === 'eight' && (/\bsingle auspicious\b/.test(normaliseSymbolText(p.name)) || !/\b(?:eight|8) (?:lucky|auspicious) (?:signs|symbols)\b/.test(normaliseSymbolText(p.name)));
  return { eligible: true, evidence, kind: definition.key === 'eight' ? (individual ? 'individual emblem' : 'complete eight-symbol design') : null };
}

const SPECIAL_CAPTIONS = {
  cms92zhgydosk: 'A flexible bangle with eternity-knot details.',
  p078: 'An endless-knot pendant from the individual auspicious-symbol series.',
  p089: 'A Hri syllable pendant, listed as the Love Charm.',
  p110: 'The eight auspicious signs brought together in a necklace.',
  p002: 'Om, Ah and Hung brought together in a silver necklace.',
  cmw42rullmlqh: 'A large silver vajra necklace with Hung engraved on the central hub.',
  p064: 'Clover-shaped earrings with double vajras, mother of pearl and diamonds.',
  'E023-YG14-TQ': 'Double dorje and endless-knot earrings with blue sapphire and turquoise in 14K gold.',
  'N014-YGP': 'A layered gold-plated necklace with double vajra, endless knot and Malaya emblem.',
  'R017B-S': 'Vajra and bell in a silver Samaya ring without enamel.',
  'E019BB-S-BD': 'Silver bell earrings with cubic zirconia and black diamonds.',
  'P047B-YG14': 'A medium phurba pendant in 14K yellow and white gold, 4.98 g; pendant only.',
  'R047-WG18': 'Bell engravings in an 18K white-gold band.',
  'R047-YG18': 'Vajra and bell engravings in an 18K yellow-gold band.',
  'BR001-TT': 'A round silver brooch with partial gold plating and all eight symbols.',
  'E008-YG14-GE': 'Double-dorje stud earrings with 29 tsavorites in 14K yellow gold.',
  'E008-YG14-RR': 'Double-dorje stud earrings with 29 red rubies in 14K yellow gold.',
  'P023-WH18-BS': 'A 43 mm Hung syllable pendant with blue sapphires.',
  'P057-WG14-DIA': 'A small Hung syllable pendant with 0.41 ct of diamond and chain.',
  'R020B-YG18': 'An 18K gold infinity-knot band with 0.13 ct of diamonds.',
  p040: 'A victory-banner pendant in 14K gold with 0.10 ct of diamonds.',
  p045: 'A victory-banner pendant from the individual auspicious-symbol series.',
  p046: 'A lotus pendant from the individual auspicious-symbol series.',
  p047: 'A conch pendant from the individual auspicious-symbol series.',
  p048: 'A Dharma-wheel pendant from the individual auspicious-symbol series.',
  p049: 'A vase pendant from the individual auspicious-symbol series.',
  p050: 'A parasol pendant from the individual auspicious-symbol series.',
  p051: 'A pair-of-fish pendant from the individual auspicious-symbol series.',
  p014: 'A Tara mantra pendant with agate.',
  p055: 'A large phurba pendant in solid 14K gold.',
};

// Use only the record's explicit text, never infer stones or karat from an SKU
// or the catalogue's fallback material. Disputed details are omitted below.
export function symbolCaption(p, definition, kind) {
  const t = `${p.name || ''} ${p.sub || ''}`;
  let caption = SPECIAL_CAPTIONS[p.id];
  if (!caption) {
    const category = ({ Pendants: 'pendant', Rings: 'ring', Earrings: 'earrings', Brooches: 'brooch', Bracelets: 'bracelet', Bangles: 'bangle', Necklaces: 'necklace', Cufflinks: 'cufflinks', Accessories: 'mala counters' })[p.category] || 'piece';
    const motif = definition.key === 'eight' ? p.name.replace(/,.*$/, '') : ({ knot: 'Endless-knot', bell: /vajra|dorje/i.test(t) ? 'Vajra-and-bell' : 'Bell', tara: /\btam\b/i.test(t) ? 'Tam syllable' : 'Tara mantra', double: 'Double-dorje', phurba: 'Phurba', hung: 'Hung syllable', ah: 'Ah syllable', om: 'Om syllable', hri: 'Hri syllable' })[definition.key];
    const metal = /rose gold plated|rose.gold.plated/i.test(t) ? 'rose-gold plating'
      : /(?:gold plat|vermeil|\bYGP\b)/i.test(t) ? 'gold plating'
      : (t.match(/(?:14|18)\s*k(?:arat)?\s*(?:yellow|white|rose)?\s*gold/i)?.[0] || t.match(/(?:yellow|white|rose)\s*gold\s*(?:14|18)\s*k/i)?.[0])
      || (/\bplatinum\b/i.test(t) ? 'platinum' : /\bsilver\b/i.test(t) ? 'silver' : '');
    let detail = /\bcubic zirconia\b|\bCZ\b/i.test(t) ? 'cubic zirconia' : /\bdiamonds?\b/i.test(t) && !/Full Diamond/i.test(t) ? 'diamonds' : '';
    const enamel = /\b(?:no|without) enamel\b/i.test(t) ? '' : t.match(/(?:blue|green|white|black) enamel/i)?.[0] || (/\benamel\b/i.test(t) ? 'enamel' : '');
    if (enamel) detail = [detail, enamel.toLowerCase()].filter(Boolean).join(' and ');
    caption = `${motif}${definition.key === 'eight' ? '' : ` ${category}`}${metal ? ` in ${metal.replace(/\s+/g, ' ').trim().toLowerCase().replace(/(14|18)k/g, '$1K')}` : ''}${detail ? ` with ${detail}` : ''}.`;
  }
  return definition.key === 'eight' ? `${kind === 'individual emblem' ? 'Individual emblem' : 'Complete eight-symbol design'}: ${caption[0].toLowerCase()}${caption.slice(1)}` : caption;
}

const KNOWN_GAPS = {
  cms92zhgydosk: 'Gold-plated title/subtitle conflicts with solid 14K story; caption omits metal.',
  p078: 'P031F-S SKU conflicts with gold-plated subtitle/material; caption omits metal.',
  p089: 'P018-RGP SKU conflicts with yellow/vermeil gold text; caption omits metal colour.',
  p110: 'N003-YGP SKU conflicts with 14K material field; caption omits metal.',
  p014: 'P045-YGP SKU conflicts with Silver subtitle; existing text retained.',
  p057: 'Shares SKU P021-YG18 with p066 but has a distinct canonical ID and size description; no records merged.',
  p066: 'Shares SKU P021-YG18 with p057 but has a distinct canonical ID and size description; no records merged.',
};

export function resolveSymbolTopics(topics) {
  return SYMBOLS.map((definition) => {
    const names = new Set([definition.slug, ...definition.aliases, definition.title].map(normaliseSymbolText));
    // Only exact topic identity matches; an alias like "Tam" reuses an existing
    // Tam topic for Tara rather than creating a second page for the same shelf.
    const candidates = Object.entries(topics).filter(([id, t]) => names.has(normaliseSymbolText(id)) || names.has(normaliseSymbolText(t.slug)) || names.has(normaliseSymbolText(t.title)) || (t.aliases || []).some((a) => names.has(normaliseSymbolText(a))));
    if (candidates.length > 1) throw new Error(`Multiple existing topics match ${definition.title}; reconcile manually before applying.`);
    const [slug, before] = candidates[0] || [definition.slug, null];
    if (before && before.slug !== slug) throw new Error(`Topic path/slug mismatch: ${slug}`);
    return { ...definition, slug, before };
  });
}

export function buildSymbolsChangeSet(overrides, topics, groups = {}) {
  const { SITE_PRODUCTS: products } = buildSiteData(overrides);
  const definitions = resolveSymbolTopics(topics);
  const shelves = definitions.map((d) => {
    const pieces = [], gaps = [];
    for (const p of products) {
      const match = classifySymbol(p, d, overrides[p.id]);
      if (match.uncertain) gaps.push({ id: p.id, reason: match.uncertain, evidence: match.evidence });
      if (d.key === 'knot' && !match.eligible && /\binfinity\b|\beternity\b/i.test(p.name)) gaps.push({ id: p.id, reason: 'Infinity/eternity wording does not explicitly identify a knot; excluded pending confirmation.' });
      if (!match.eligible) continue;
      pieces.push({ id: p.id, title: p.name, sku: p.salesCode || null, url: `/product/${encodeURIComponent(p.id)}`, details: p.sub || '', material: p.material || '', stock: p.stock || '', kind: match.kind, evidence: match.evidence, caption: symbolCaption(p, d, match.kind) });
      if (KNOWN_GAPS[p.id]) gaps.push({ id: p.id, reason: KNOWN_GAPS[p.id] });
    }
    return { key: d.key, slug: d.slug, title: d.title, count: pieces.length, inStock: pieces.filter(isInStock).length, pieces, gaps };
  });
  const changes = [];
  const add = (path, before, patch) => { if (Object.keys(patch).length) changes.push({ path, before: before || null, patch }); };
  const managedSlugs = new Set(definitions.map((d) => d.slug));
  // All catalogue aliases stay intact. Only canonical live IDs are linked.
  const ids = new Set([...Object.keys(overrides), ...products.map((p) => p.id)]);
  for (const id of ids) {
    const prior = overrides[id]?.topics || [];
    const desired = [...prior.filter((s) => !managedSlugs.has(s)), ...shelves.filter((s) => s.pieces.some((p) => p.id === id)).map((s) => s.slug)];
    const unique = [...new Set(desired)];
    // Retain existing ordering when membership has not changed.
    if (prior.length !== unique.length || prior.some((s) => !unique.includes(s))) add(`catalogueOverrides/${id}`, overrides[id], { topics: unique });
  }
  definitions.forEach((d, i) => {
    const captions = Object.fromEntries(shelves[i].pieces.map((p) => [p.id, p.caption]));
    const blocks = [
      { id: `${d.slug}-introduction`, type: 'richText', md: d.intro },
      { id: `${d.slug}-opening`, type: 'productGrid', mode: 'linked', title: d.title, stockFirst: true, limit: 12, offset: 0, captions },
      { id: `${d.slug}-more`, type: 'productGrid', mode: 'linked', title: 'Further pieces', stockFirst: true, limit: 0, offset: 12, captions },
    ];
    // Preserve owner-authored non-grid blocks; replace only this batch's own
    // introduction. Existing product placements are checkpointed in history.
    const retained = (d.before?.blocks || []).filter((b) => !['productGrid', 'floatProduct'].includes(b.type) && ![`${d.slug}-introduction`, `${d.slug}-opening`, `${d.slug}-more`].includes(b.id));
    blocks.splice(2, 0, ...retained);
    const desired = { slug: d.slug, title: d.title, subtitle: d.before?.subtitle || d.subtitle, excerpt: d.intro.split('. ')[0] + '.', aliases: [...new Set([...(d.before?.aliases || []), ...d.aliases])], blocks, published: true };
    if (desired.aliases.length > 30) throw new Error(`Too many aliases for ${d.slug}`);
    const patch = Object.fromEntries(Object.entries(desired).filter(([k, v]) => !equal(d.before?.[k], v)));
    add(`exploreTopics/${d.slug}`, d.before, patch);
  });
  // Reuse the existing ritual shelf; one symbol shelf exposes all new pages.
  const groupPlans = [
    { slug: 'ritual-objects', name: 'Ritual Objects', keys: ['bell', 'phurba'], order: 4 },
    { slug: 'symbols', name: 'Symbols & Syllables', keys: SYMBOLS.map((d) => d.key), order: 2 },
  ];
  for (const g of groupPlans) {
    const before = groups[g.slug] || null;
    const slugs = g.keys.map((key) => definitions.find((d) => d.key === key).slug);
    const desired = before ? { topicSlugs: [...new Set([...(before.topicSlugs || []), ...slugs])] }
      : { slug: g.slug, name: g.name, description: 'Explore the forms and calligraphy found in the Malaya catalogue.', topicSlugs: slugs, order: g.order, published: true };
    add(`exploreGroups/${g.slug}`, before, Object.fromEntries(Object.entries(desired).filter(([k, v]) => !equal(before?.[k], v))));
  }
  const guards = [];
  for (const [collectionName, data] of [['catalogueOverrides', overrides], ['exploreTopics', topics], ['exploreGroups', groups]]) {
    for (const [id, before] of Object.entries(data)) guards.push({ path: `${collectionName}/${id}`, before });
  }
  for (const change of changes) if (!guards.some((g) => g.path === change.path)) guards.push({ path: change.path, before: null });
  return { version: SYMBOLS_VERSION, project: 'malaya-catalogue', scanned: products.length, shelves, changes, guards };
}

export function assertSymbolsPlan(plan) {
  if (plan?.version !== SYMBOLS_VERSION || plan.project !== 'malaya-catalogue' || plan.shelves?.length !== 10 || !Array.isArray(plan.guards) || !Array.isArray(plan.changes) || plan.changes.length > 450) throw new Error('Invalid symbol refresh plan.');
  const paths = new Set();
  for (const c of plan.changes) {
    const [collectionName, id, extra] = c.path.split('/');
    const allowed = collectionName === 'catalogueOverrides' ? ['topics'] : collectionName === 'exploreTopics' && plan.shelves.some((s) => s.slug === id) ? ['slug', 'title', 'subtitle', 'excerpt', 'aliases', 'blocks', 'published'] : collectionName === 'exploreGroups' && ['symbols', 'ritual-objects'].includes(id) ? ['slug', 'name', 'description', 'topicSlugs', 'order', 'published'] : [];
    if (!id || extra || id === 'vajra' || !allowed.length || paths.has(c.path) || Object.keys(c.patch).some((k) => !allowed.includes(k))) throw new Error(`Out-of-scope change: ${c.path}`);
    if (!plan.guards.some((g) => g.path === c.path && equal(g.before, c.before))) throw new Error(`Missing before-state guard: ${c.path}`);
    paths.add(c.path);
  }
}
