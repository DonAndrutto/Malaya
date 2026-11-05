import { buildSiteData } from '../data/site-data';
import { cleanApprovedCopy, normaliseVajraSize, planVajraRefresh, VAJRA_CAPTIONS } from './vajra-refresh';

const topic = { slug: 'vajra', title: 'Old title', published: true, heroImage: 'existing-photo', heroPos: '40% 50%', blocks: [] };
const thinStory = 'Designed and crafted by Malaya Jewellery international.';
const make = (overrides) => planVajraRefresh({ products: buildSiteData(overrides).SITE_PRODUCTS, overrides, topic });

test('scope contains single vajra and paired bell, excluding double vajra, deity, mantra and bell-only records', () => {
  expect(Object.keys(VAJRA_CAPTIONS)).toHaveLength(38);
  for (const id of ['p123', 'p102', 'N007C-YGP', 'P005-S', 'E019BB-S-BD']) expect(VAJRA_CAPTIONS[id]).toBeUndefined();
  const overrides = {
    p123: { name: 'Double Dorje Cufflinks', topics: ['vajra', 'other'] },
    'P005-S': { topics: ['vajra', 'phurba'] },
    'N007C-YGP': { topics: ['vajra', 'mantras'] },
    'unpublished-alias': { topics: ['vajra', 'other'] },
  };
  const result = make(overrides);
  expect(result.patches.p123).toEqual({ topics: ['other'] });
  expect(result.patches['P005-S'].topics).toEqual(['phurba']);
  expect(result.patches['N007C-YGP'].topics).toEqual(['mantras']);
  expect(result.patches['unpublished-alias'].topics).toEqual(['other']);
});

test('keeps owner edits, substantive promises, Dobchu stories and commercial fields', () => {
  const overrides = {
    p114: { name: 'Vajra Earrings, 5 Prongs', story: 'An owner-corrected description.', topics: ['other'], qty: 6, price: 321, images: ['photo'] },
    'R017A-YG18': { published: true, name: 'Dorje and Bell Samaya Ring', sub: '18k Gold, Enamel', story: 'Dobchu: protection and promises retained.' },
    p017: { name: 'Vajra Pendant Large', story: thinStory },
  };
  const result = make(overrides);
  expect(result.patches.p114).toEqual({ topics: ['other', 'vajra'] });
  expect(result.patches['R017A-YG18']).toEqual({ topics: ['vajra'] });
  expect(result.patches.p017.story).toBe(VAJRA_CAPTIONS.p017);
  expect(result.patches.p017.name).toBe('Vajra Pendant, Large');
  expect(result.topic).toMatchObject({ published: true, heroImage: 'existing-photo', heroPos: '40% 50%' });
  for (const patch of Object.values(result.patches)) expect(Object.keys(patch).every((key) => ['name', 'sub', 'story', 'topics'].includes(key))).toBe(true);
});

test('renamed or removed candidate aborts inclusion rather than inferring a new identity', () => {
  const result = make({ p017: { name: 'Double Dorje Pendant' } });
  expect(result.missing).toContain('p017');
  expect(result.included).not.toContain('p017');
});

test('cleans cubic zirconia across all override records, preserves actual diamonds', () => {
  const result = make({ unrelated: { name: 'CZ Diamonds', sub: 'CZ diamonds and natural diamonds', story: 'White CZ Diamonds.' } });
  expect(result.patches.unrelated).toEqual({ name: 'cubic zirconia', sub: 'cubic zirconia and natural diamonds', story: 'White cubic zirconia.' });
  expect(cleanApprovedCopy('CZ code; 18k gold and diamonds')).toBe('CZ code; 18k gold and diamonds');
});

test('uses owner-confirmed mantra sizes without adding either necklace to this shelf', () => {
  const result = make({ p102: { name: 'Vajra Guru Mantra Smaller', story: thinStory }, 'N007C-YGP': { published: true, story: thinStory } });
  expect(result.patches.p102.name).toBe('Vajra Guru Mantra Necklace, Large');
  expect(result.patches['N007C-YGP'].name).toBe('Vajra Guru Mantra Necklace, Small');
  expect(result.patches.p102.story).toContain('larger');
  expect(result.patches['N007C-YGP'].story).toContain('smaller');
  expect(result.included).not.toContain('p102');
  expect(result.included).not.toContain('N007C-YGP');
});

test('size wording is consistent and the refresh is idempotent', () => {
  for (const name of ['Vajra Pendant Mid', 'Vajra Pendant Mid-Size', 'Vajra Pendant Medium Size']) expect(normaliseVajraSize(name)).toBe('Vajra Pendant, Medium');
  const initial = { p017: { name: 'Vajra Pendant Large', story: thinStory } };
  const first = make(initial);
  const applied = { ...initial };
  for (const [id, patch] of Object.entries(first.patches)) applied[id] = { ...applied[id], ...patch };
  const again = planVajraRefresh({ products: buildSiteData(applied).SITE_PRODUCTS, overrides: applied, topic: first.topic });
  expect(again.patches).toEqual({});
  expect(again.topic).toEqual(first.topic);
});
