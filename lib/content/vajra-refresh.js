import { normaliseStoneCopy } from '../data/product-copy';

// Approved editorial scope, 5 November 2026. IDs are existing storefront
// records, not keyword guesses. Double dorje, mantra, bell-only and Phurba
// products deliberately do not belong to this topic.
export const VAJRA_CAPTIONS = {
  'p017': 'A five-pronged vajra in sterling silver, suspended from a chain.',
  'P027-S': 'A medium vajra pendant in sterling silver, with chain.',
  'p076': 'A medium vajra pendant in 14K yellow gold.',
  'P027-YG18': 'A medium vajra pendant in 18K yellow gold.',
  'p023': 'The vajra in a small pendant of 18K yellow gold.',
  'R017A-S': 'Vajra and bell meet in sterling silver and black enamel.',
  'R017A-S-T': 'Vajra and bell in sterling silver with blue enamel.',
  'R017A-YG18': 'A combined vajra-and-bell motif in 18K gold with enamel.',
  'R017B-S': 'Vajra and bell in sterling silver, without enamel.',
  'R017B-YG18-DIA': 'Vajra and bell in 18K yellow gold with a central diamond.',
  'R023-YG14-CIT-DIA': 'Citrine and diamonds with vajra details in 14K yellow gold.',
  'R023-YG14-RR': 'Ruby and diamonds with vajra details in 14K yellow gold.',
  'R047-YG18': 'Vajra and bell engravings in an 18K yellow-gold band.',
  'E011AA-YG18': 'Vajra earrings in 18K yellow gold with diamond accents.',
  'E011AB-YG18': 'Vajra and bell earrings in 18K yellow gold with diamonds.',
  'p114': 'Five-pronged vajra earrings in sterling silver with black diamonds.',
  'E052-YG14-AMB': 'Amber earrings with vajra details, lotus caps and Bumpa clasps in 14K yellow gold.',
  'N005B-YG14-DIA': 'A five-pronged vajra in 14K yellow gold with diamonds.',
  'N006-AMB-B': 'Amber with vajra elements in 14K yellow gold.',
  'N015-S': 'A small five-pronged vajra on a 45 cm sterling-silver chain.',
  'p099': 'A flat vajra form in 18K yellow gold.',
  'N017-S': 'A three-dimensional five-pronged vajra on a 45 cm sterling-silver chain.',
  'B008B-S-BLK': 'A polished sterling-silver vajra clasp with stingray leather.',
  'B008B-TT-BLK': 'A vajra clasp in oxidised silver and 18K gold, paired with black stingray leather.',
  'B009-RG14': 'A vajra clasp in 14K rose gold with tan leather.',
  'p010': 'A sterling-silver chain with a vajra clasp.',
  'B009-YG14': 'A vajra clasp in 14K yellow gold with black leather.',
  'B013-S': 'A flat three-pronged vajra on a 19 cm sterling-silver chain.',
  'B013-YG14': 'A flat three-pronged vajra on a 19 cm chain in 14K yellow gold.',
  'B015A-S': 'Repeated vajra forms in a 19 cm sterling-silver bracelet.',
  'B015B-S': 'Repeated vajra forms in a 23 cm sterling-silver bracelet.',
  'BA003-S': 'A substantial sterling-silver bangle with a repeating vajra design.',
  'BA005-S-CZ': 'A sterling-silver vajra bangle with cubic zirconia.',
  'BA005-YGP-CZ': 'A gold-plated vajra bangle with cubic zirconia.',
  'C003-S': 'Large vajra and bell mala counters in rhodium-plated sterling silver.',
  'C004-S': 'Vajra and bell mala counters in rhodium-plated sterling silver.',
  'C004-RGP': 'Vajra and bell counters in rose-gold-plated silver, used to mark mantra recitations.',
  'C004-YG14': 'Vajra and bell mala counters in 14K yellow gold.',
};

export function cleanApprovedCopy(value) {
  if (typeof value !== 'string') return value;
  return normaliseStoneCopy(value)
    .replace(/throughout the Himalayan kingdoms of Bhutan, Sikkim, Ladakh and Nepal/gi, 'across the Himalayan region, including Bhutan, Sikkim, Ladakh and Nepal');
}

export function normaliseVajraSize(name) {
  return name.replace(/\bMid(?:[- ]Size)?\b/gi, 'Medium')
    .replace(/\bMedium Size\b/gi, 'Medium')
    .replace(/\b(Vajra (?:Pendant|Necklace)) (Small|Medium|Large)\b/g, '$1, $2')
    .replace(/^Medium Vajra Necklace$/, 'Vajra Necklace, Medium');
}

export function refreshVajraTopic(topic, captions) {
  return {
    ...topic,
    title: 'Vajra', subtitle: 'Dorje · རྡོ་རྗེ་',
    excerpt: 'A Buddhist ritual implement and a symbol of the indestructible nature of awakened mind.',
    aliases: [...new Set([...(topic.aliases || []), 'Dorje', 'rdo rje', 'Diamond Sceptre', 'Thunderbolt'])],
    blocks: [
      { id: 'vajra-introduction', type: 'richText', md: 'The vajra—dorje in Tibetan—is a Buddhist ritual implement and a symbol of the indestructible nature of awakened mind. Its balanced form brings opposing crowns of prongs together around a central hub. Often held with the bell, it expresses compassionate method in union with wisdom.' },
      { id: 'vajra-opening', type: 'productGrid', mode: 'linked', title: 'Vajra / Dorje', stockFirst: true, limit: 12, offset: 0, captions },
      { id: 'vajra-practice', type: 'richText', md: '## Vajra and bell\n\nIn ritual, the vajra represents skilful means and the bell represents wisdom. Their pairing remains part of Buddhist practice across the Himalayan region, including Bhutan. Malaya interprets these forms in pendants, earrings, rings, necklaces, bracelets and mala counters.\n\n## In jewellery\n\nThe single vajra appears as a complete form, a clasp or a repeated motif. The selection brings together these approaches in silver and gold, alongside pieces pairing the vajra with the bell.' },
      { id: 'vajra-more', type: 'productGrid', mode: 'linked', title: 'Further pieces', stockFirst: true, limit: 0, offset: 12, captions },
    ],
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const thin = (s) => !String(s || '').trim() || /^Designed and crafted by Malaya Jewellery international\.?\s*$/i.test(s);

// Returns only changed fields. The runner uses document-version preconditions
// and a rollback snapshot, so another editor's intervening changes abort apply.
export function planVajraRefresh({ products, overrides, topic }) {
  if (!topic || topic.slug !== 'vajra') throw new Error('Existing vajra topic required');
  const patches = {};
  const add = (id, field, value, current) => {
    if (!same(value, current)) (patches[id] ||= {})[field] = value;
  };
  for (const [id, o] of Object.entries(overrides)) {
    for (const key of ['name', 'sub', 'story']) {
      if (typeof o[key] === 'string') add(id, key, cleanApprovedCopy(o[key]), o[key]);
    }
  }
  const captions = {};
  const missing = [];
  for (const [id, caption] of Object.entries(VAJRA_CAPTIONS)) {
    const p = products.find((p) => p.id === id);
    if (!p) { missing.push(id); continue; }
    // Recheck current identity: do not relink a renamed double vajra/mantra.
    if (/\bdouble\s+(?:vajra|dorje)|\b(?:phurba|kilaya|mantra)\b/i.test(`${p.name} ${p.sub}`)) {
      missing.push(id); continue;
    }
    captions[id] = caption;
    add(id, 'topics', [...new Set([...(p.topics || []), 'vajra'])], p.topics || []);
    add(id, 'name', normaliseVajraSize(cleanApprovedCopy(p.name)), p.name);
    if (thin(p.story)) add(id, 'story', caption, p.story);
  }
  // Remove stale associations from every other record, including aliases and
  // unpublished entries. Other topic links and all non-copy fields survive.
  for (const [id, o] of Object.entries(overrides)) {
    if (!captions[id] && Array.isArray(o.topics) && o.topics.includes('vajra')) {
      add(id, 'topics', o.topics.filter((t) => t !== 'vajra'), o.topics);
    }
  }
  for (const p of products) {
    for (const key of ['name', 'sub', 'story']) {
      if (typeof p[key] === 'string' && !(key in (patches[p.id] || {}))) {
        add(p.id, key, cleanApprovedCopy(p[key]), p[key]);
      }
    }
  }
  // Owner-confirmed size distinction; neither mantra belongs to this shelf.
  for (const [id, size, oldName] of [
    ['p102', 'Large', 'Vajra Guru Mantra Smaller'],
    ['N007C-YGP', 'Small', 'Vajra Guru Mantra New, Small, Yellow Gold Plated, CZ Diamonds'],
  ]) {
    const p = products.find((p) => p.id === id);
    if (!p) continue;
    if (cleanApprovedCopy(p.name) === cleanApprovedCopy(oldName)) add(id, 'name', `Vajra Guru Mantra Necklace, ${size}`, p.name);
    if (thin(p.story)) add(id, 'story', `${size === 'Large' ? 'The larger' : 'The smaller'} Vajra Guru mantra necklace, in gold plating${id === 'N007C-YGP' ? ' with cubic zirconia' : ''}. This piece presents the mantra associated with Guru Rinpoche.`, p.story);
  }
  return { patches, topic: refreshVajraTopic(topic, captions), included: Object.keys(captions), missing };
}
