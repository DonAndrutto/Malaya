#!/usr/bin/env node
// Default: read public data and write a reviewable plan. --apply is explicit.
import './lib/catalogue-loader.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const { buildSiteData } = await import('../lib/data/site-data.js');
const { planVajraRefresh } = await import('../lib/content/vajra-refresh.js');

const PROJECT = 'malaya-catalogue';
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const args = process.argv.slice(2);
const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const decode = (v) => {
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  return v.stringValue ?? v.booleanValue ?? v.timestampValue;
};
const fields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, decode(v)]));
const get = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Public Firestore read failed (${r.status})`);
  return r.json();
};

async function prepare() {
  const docs = {};
  let pageToken;
  do {
    const url = new URL(`${ROOT}/catalogueOverrides`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await get(url);
    for (const d of page.documents || []) docs[d.name.split('/').pop()] = d;
    pageToken = page.nextPageToken;
  } while (pageToken);
  const topicDoc = await get(`${ROOT}/exploreTopics/vajra`);
  const topic = fields(topicDoc.fields);
  const overrides = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, fields(d.fields)]));
  const { SITE_PRODUCTS: products } = buildSiteData(overrides);
  const result = planVajraRefresh({ products, overrides, topic });
  if (result.missing.length) throw new Error(`Reviewed product identity changed or disappeared: ${result.missing.join(', ')}. Review before proceeding.`);
  const changes = Object.entries(result.patches).map(([id, patch]) => ({
    path: `catalogueOverrides/${id}`, updateTime: docs[id]?.updateTime || null,
    before: overrides[id] || null, patch,
  }));
  // Limit writes to editorial fields; publication and image settings survive.
  const patch = Object.fromEntries(['title', 'subtitle', 'excerpt', 'aliases', 'blocks']
    .filter((key) => JSON.stringify(topic[key]) !== JSON.stringify(result.topic[key]))
    .map((key) => [key, result.topic[key]]));
  if (Object.keys(patch).length) changes.push({ path: 'exploreTopics/vajra', updateTime: topicDoc.updateTime, before: topic, patch });
  const plan = { version: 1, project: PROJECT, createdAt: new Date().toISOString(), included: result.included, changes };
  const output = value('--output');
  if (!output) throw new Error('Supply --output /path/outside-the-repo/vajra-plan.json for the review/backup file.');
  await writeFile(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Dry run: ${result.included.length} shelf pieces; ${changes.length} documents with changed fields. Plan: ${output}`);
}

async function apply(file) {
  const plan = JSON.parse(await readFile(file, 'utf8'));
  if (plan.version !== 1 || plan.project !== PROJECT || !Array.isArray(plan.changes)) throw new Error('Invalid plan');
  if (!plan.changes.length) { console.log('No changes to apply.'); return; }
  if (plan.changes.length > 450) throw new Error('Unexpected migration size');
  for (const change of plan.changes) {
    const product = /^catalogueOverrides\/[^/]+$/.test(change.path);
    const topic = change.path === 'exploreTopics/vajra';
    const allowed = product ? ['name', 'sub', 'story', 'topics'] : ['title', 'subtitle', 'excerpt', 'aliases', 'blocks'];
    if ((!product && !topic) || Object.keys(change.patch).some((k) => !allowed.includes(k))) throw new Error('Plan contains an out-of-scope write');
  }
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJECT, credential: applicationDefault() });
  const db = getFirestore();
  const revision = db.collection('exploreTopics/vajra/revisions').doc(String(Date.now()));
  // The plan is also the before-state backup. No write occurs if any touched
  // document changed since the dry run, even if an SDK transaction retries.
  await db.runTransaction(async (tx) => {
    const refs = plan.changes.map((c) => db.doc(c.path));
    const snapshots = await tx.getAll(...refs);
    for (let i = 0; i < snapshots.length; i++) {
      const current = snapshots[i];
      const change = plan.changes[i];
      const expected = change.updateTime ? Timestamp.fromDate(new Date(change.updateTime)) : null;
      // REST timestamps can carry nanoseconds; compare at full precision.
      if (expected) {
        const fraction = change.updateTime.match(/\.(\d+)Z$/)?.[1] || '';
        const precise = new Timestamp(expected.seconds, Number(fraction.padEnd(9, '0')));
        if (!current.exists || !current.updateTime.isEqual(precise)) throw new Error(`Concurrent edit: ${change.path}. Generate and review a fresh plan.`);
      } else if (current.exists) throw new Error(`New document appeared: ${change.path}. Generate a fresh plan.`);
    }
    for (let i = 0; i < plan.changes.length; i++) {
      const change = plan.changes[i];
      const patch = { ...change.patch, _updated: Date.now() };
      if (snapshots[i].exists) tx.update(refs[i], patch);
      else tx.create(refs[i], patch);
      if (change.path === 'exploreTopics/vajra') tx.create(revision, { ...snapshots[i].data(), _savedAt: Date.now() });
    }
  });
  console.log(`Applied ${plan.changes.length} documents atomically. Before-state backup: ${file}`);
  console.log('Revalidate both site and explore through the signed-in admin, or deploy the matching renderer, then verify the live shelf.');
}

try {
  if (args.includes('--apply')) {
    if (!value('--apply') || value('--apply').startsWith('--')) throw new Error('--apply requires a reviewed plan filename');
    await apply(value('--apply'));
  } else await prepare();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
