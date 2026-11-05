import { SYMBOLS, classifySymbol, buildSymbolsChangeSet, assertSymbolsPlan, symbolCaption, resolveSymbolTopics } from './symbols-refresh';
import { buildSiteData, isInStock } from '../data/site-data';
import { selectGridProducts, topicProducts } from '../explore-shared';

const def = (key) => SYMBOLS.find((d) => d.key === key);
const classify = (key, name, story = '') => classifySymbol({ name, story }, def(key));
test('short syllables use meaningful terms and diacritic variants', () => {
  for (const name of ['Home charm', 'Thomas pendant', 'Shriya earrings', 'Hummingbird necklace', 'Brahma amulet']) {
    for (const key of ['om', 'ah', 'hung', 'hri']) expect(classify(key, name).eligible).toBe(false);
  }
  for (const [key, name] of [['om', 'Oṃ pendant'], ['ah', 'Āḥ pendant'], ['hung', 'Hūṃ pendant'], ['hri', 'Hrīḥ brooch']]) expect(classify(key, name).eligible).toBe(true);
});
test('mantras are not indiscriminately classified by their text', () => {
  for (const key of ['om', 'ah', 'hung']) {
    expect(classify(key, 'Vajra Guru Mantra', 'Om Ah Hum Vajra Guru Padma Siddhi Hum').eligible).toBe(false);
    expect(classify(key, 'OM AH HUNG Mantra').eligible).toBe(true);
  }
  expect(classify('hung', 'Vajra Necklace', 'The central hub is engraved with the Tibetan syllable Hung.').eligible).toBe(true);
});
test('synonyms, metadata and overlapping designs are recognised', () => {
  for (const name of ['Ghanta pendant', 'Gantha pendant', 'Drilbu earrings']) expect(classify('bell', name).eligible).toBe(true);
  for (const name of ['Vishvavajra', 'Vishva-vajra', 'Crossed Vajra']) expect(classify('double', name).eligible).toBe(true);
  for (const name of ['Phurpa', 'Kila', 'Kilaya', 'Dorje Phurba']) expect(classify('phurba', name).eligible).toBe(true);
  expect(classifySymbol({ name: 'Pendant', images: [{ alt: 'Endless knot' }] }, def('knot')).eligible).toBe(true);
  expect(classifySymbol({ name: 'Pendant', tags: ['eternity knot'] }, def('knot')).eligible).toBe(true);
  expect(classifySymbol({ name: 'Pendant', images: ['https://example.org/om-pendant.png'] }, def('om')).eligible).toBe(false);
  expect(classify('tara', 'Tam Earrings').eligible).toBe(true);
  expect(classify('tara', 'Tara Mantra Necklace').eligible).toBe(true);
});
test('complete eight-symbol pieces differ from individual emblems', () => {
  expect(classify('eight', 'Eight Auspicious Signs Necklace').kind).toBe('complete eight-symbol design');
  expect(classify('eight', 'Single Auspicious Conch').kind).toBe('individual emblem');
  expect(classify('eight', 'Infinity Bangle', 'The eternity knot is one of the eight auspicious symbols.').kind).toBe('individual emblem');
});
test('caption avoids negated enamel and stones inferred from SKUs', () => {
  expect(symbolCaption({ id: 'test', name: 'Bell Ring, no enamel', category: 'Rings', sub: 'Silver' }, def('bell'))).not.toContain('with enamel');
  expect(symbolCaption({ id: 'TEST-DIA', name: 'Bell Pendant', sub: 'Silver', category: 'Pendants' }, def('bell'))).not.toContain('diamond');
});
test('reuse existing slugs and fail on ambiguous parallel topics', () => {
  expect(resolveSymbolTopics({ tam: { slug: 'tam', title: 'Tam' } }).find((d) => d.key === 'tara').slug).toBe('tam');
  expect(() => resolveSymbolTopics({ tam: { slug: 'tam', title: 'Tam' }, tara: { slug: 'tara', title: 'Tara' } })).toThrow('Multiple existing');
});
test('field-only plan preserves Vajra, product copy, unrelated links and aliases', () => {
  const overrides = { p029: { topics: ['owner-topic'], name: 'Double Dorje Pendant', story: 'Owner wording', qty: 9 }, ghost: { mergedInto: 'p029', topics: ['double-dorje', 'owner-topic'] } };
  const topics = { vajra: { slug: 'vajra', title: 'Owner Vajra', blocks: [{ type: 'richText', md: 'Keep me' }] }, 'the-endless-knot': { slug: 'the-endless-knot', title: 'The Endless Knot', aliases: ['Palbeu'], heroImage: 'keep.jpg', published: false } };
  const plan = buildSymbolsChangeSet(overrides, topics);
  assertSymbolsPlan(plan);
  expect(plan.changes.some((c) => c.path === 'exploreTopics/vajra')).toBe(false);
  expect(plan.changes.find((c) => c.path === 'catalogueOverrides/p029').patch).toEqual({ topics: ['owner-topic', 'double-dorje'] });
  expect(plan.changes.find((c) => c.path === 'catalogueOverrides/ghost').patch).toEqual({ topics: ['owner-topic'] });
  expect(plan.changes.find((c) => c.path === 'exploreTopics/the-endless-knot').patch.heroImage).toBeUndefined();
  expect(plan.guards.find((g) => g.path === 'catalogueOverrides/p029').before).toEqual(overrides.p029);
});
test('second application is empty and all grids partition their canonical shelf', () => {
  const overrides = {}, topics = {}, groups = {};
  const first = buildSymbolsChangeSet(overrides, topics, groups);
  for (const c of first.changes) {
    const [coll, id] = c.path.split('/'); const target = { catalogueOverrides: overrides, exploreTopics: topics, exploreGroups: groups }[coll];
    target[id] = { ...(target[id] || {}), ...c.patch };
  }
  expect(buildSymbolsChangeSet(overrides, topics, groups).changes).toEqual([]);
  const { SITE_PRODUCTS: products } = buildSiteData(overrides);
  for (const s of first.shelves) {
    const items = topicProducts(s.slug, products);
    const a = selectGridProducts(items, { stockFirst: true, limit: 12 });
    const b = selectGridProducts(items, { stockFirst: true, offset: 12 });
    expect(new Set([...a, ...b].map((p) => p.id)).size).toBe(items.length);
    const ordered = [...a, ...b]; const firstOff = ordered.findIndex((p) => !isInStock(p));
    if (firstOff >= 0) expect(ordered.slice(firstOff).some(isInStock)).toBe(false);
  }
});
test('scope validation rejects product edits and Vajra reapplication', () => {
  const p = buildSymbolsChangeSet({}, {});
  p.changes.push({ path: 'catalogueOverrides/p029', before: null, patch: { stock: 'Sold out' } });
  expect(() => assertSymbolsPlan(p)).toThrow();
});
