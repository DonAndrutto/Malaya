// Operator API for the same review/apply facility. Supply an authenticated
// fetch using existing ADC/CLI credentials; never save tokens in a plan.
import './catalogue-loader.mjs';
const { buildSymbolsChangeSet, assertSymbolsPlan } = await import('../../lib/content/symbols-refresh.js');
const { documentFingerprint, assertVajraSnapshotUnchanged } = await import('../../lib/content/vajra-change-set.js');

export const ROOT = 'https://firestore.googleapis.com/v1/projects/malaya-catalogue/databases/(default)/documents';
const decode = (v) => v.mapValue ? decodeFields(v.mapValue.fields || {}) : v.arrayValue ? (v.arrayValue.values || []).map(decode) : 'integerValue' in v ? Number(v.integerValue) : v.doubleValue ?? v.stringValue ?? v.booleanValue ?? v.timestampValue ?? null;
export const decodeFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]));
const encode = (v) => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === 'object' ? { mapValue: { fields: encodeFields(v) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: v };
const encodeFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, encode(v)]));
async function request(fetcher, url, body) {
  const r = await fetcher(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`Firestore request failed (${r.status}): ${(await r.text()).slice(0, 500)}`);
  return r.json();
}
export async function readSymbolsSnapshot(fetcher) {
  const maps = await Promise.all(['catalogueOverrides', 'exploreTopics', 'exploreGroups'].map(async (name) => {
    const map = {}; let pageToken;
    do {
      const url = new URL(`${ROOT}/${name}`); url.searchParams.set('pageSize', '300');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await request(fetcher, url);
      for (const d of page.documents || []) map[d.name.split('/').pop()] = decodeFields(d.fields || {});
      pageToken = page.nextPageToken;
    } while (pageToken);
    return map;
  }));
  return { overrides: maps[0], topics: maps[1], groups: maps[2] };
}
export async function prepareSymbolsRest(fetcher) {
  const s = await readSymbolsSnapshot(fetcher);
  return buildSymbolsChangeSet(s.overrides, s.topics, s.groups);
}
export async function applySymbolsRest(plan, fetcher, saveBackup) {
  assertSymbolsPlan(plan);
  if (!plan.changes.length) return { changed: 0 };
  if (typeof saveBackup !== 'function') throw new Error('A durable before-state backup is required.');
  const fresh = await prepareSymbolsRest(fetcher);
  if (documentFingerprint(plan) !== documentFingerprint(fresh)) throw new Error('Catalogue or Explore changed; prepare and review a fresh plan.');
  await saveBackup(plan);
  const { transaction } = await request(fetcher, ROOT + ':beginTransaction', { options: { readWrite: {} } });
  try {
    const documents = plan.guards.map((g) => ROOT.replace('https://firestore.googleapis.com/v1/', '') + '/' + g.path);
    const results = await request(fetcher, ROOT + ':batchGet', { documents, transaction });
    const snapshots = new Map(results.filter((r) => r.found || r.missing).map((r) => [r.found?.name || r.missing, r.found ? decodeFields(r.found.fields || {}) : null]));
    plan.guards.forEach((g, i) => {
      if (!snapshots.has(documents[i])) throw new Error(`Missing transactional read: ${g.path}`);
      assertVajraSnapshotUnchanged(g, snapshots.get(documents[i]));
    });
    const now = Date.now();
    const writes = plan.changes.flatMap((c) => {
      const name = ROOT.replace('https://firestore.googleapis.com/v1/', '') + '/' + c.path;
      const patch = { ...c.patch, _updated: now };
      const write = { update: { name, fields: encodeFields(patch) }, updateMask: { fieldPaths: Object.keys(patch) }, currentDocument: { exists: !!c.before } };
      return c.before && c.path.startsWith('exploreTopics/') ? [write, { update: { name: `${name}/revisions/${now}`, fields: encodeFields({ ...c.before, _savedAt: now }) }, currentDocument: { exists: false } }] : [write];
    });
    const result = await request(fetcher, ROOT + ':commit', { writes, transaction });
    return { changed: plan.changes.length, commitTime: result.commitTime };
  } catch (error) {
    await request(fetcher, ROOT + ':rollback', { transaction }).catch(() => {});
    throw error;
  }
}
