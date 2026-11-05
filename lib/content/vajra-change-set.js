import { buildSiteData } from '../data/site-data';
import { planVajraRefresh } from './vajra-refresh';

// A reviewed snapshot, not a background migration. Preserve all non-copy fields.
export function buildVajraChangeSet(overrides, topic) {
  const { SITE_PRODUCTS: products } = buildSiteData(overrides);
  const result = planVajraRefresh({ products, overrides, topic });
  if (result.missing.length) throw new Error(`Product identity changed: ${result.missing.join(', ')}. Review the shelf before applying.`);
  const changes = Object.entries(result.patches).map(([id, patch]) => ({
    path: `catalogueOverrides/${id}`, before: overrides[id] || null, patch,
  }));
  const patch = Object.fromEntries(['title', 'subtitle', 'excerpt', 'aliases', 'blocks']
    .filter((key) => JSON.stringify(topic[key]) !== JSON.stringify(result.topic[key]))
    .map((key) => [key, result.topic[key]]));
  if (Object.keys(patch).length) changes.push({ path: 'exploreTopics/vajra', before: topic, patch });
  return { changes, pieces: result.included.map((id) => products.find((p) => p.id === id)).map(({ id, name, salesCode, stock }) => ({ id, name, salesCode, stock })) };
}

// Firestore map key order is not meaningful. Array order is meaningful.
export function documentFingerprint(value) {
  const canonical = (v) => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
  return JSON.stringify(canonical(value));
}

export function assertVajraSnapshotUnchanged(change, current) {
  if (documentFingerprint(current) !== documentFingerprint(change.before)) {
    throw new Error(`A newer edit exists at ${change.path}. Review a fresh plan before applying.`);
  }
}
