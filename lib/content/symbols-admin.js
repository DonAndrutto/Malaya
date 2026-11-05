'use client';

import { collection, doc, getDocsFromServer, runTransaction } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { buildSymbolsChangeSet, assertSymbolsPlan } from './symbols-refresh';
import { documentFingerprint, assertVajraSnapshotUnchanged } from './vajra-change-set';
export { refreshVajraStorefront as refreshSymbolsStorefront } from './vajra-admin';

function session() {
  const { app, db, auth } = getFirebase();
  if (!db || !auth?.currentUser || app?.options.projectId !== 'malaya-catalogue') throw new Error('Sign in to Malaya administration before applying this refresh.');
  return db;
}

export async function prepareSymbolsRefresh() {
  const db = session();
  const results = await Promise.all(['catalogueOverrides', 'exploreTopics', 'exploreGroups'].map((name) => getDocsFromServer(collection(db, name))));
  return buildSymbolsChangeSet(...results.map((r) => Object.fromEntries(r.docs.map((d) => [d.id, d.data()]))));
}

export async function applySymbolsRefresh(plan) {
  assertSymbolsPlan(plan);
  if (!plan.changes.length) return;
  const db = session();
  // Catch new/deleted records too, and reject altered plans. Transaction reads
  // then protect every reviewed document against edits during this preflight.
  const fresh = await prepareSymbolsRefresh();
  if (documentFingerprint(plan) !== documentFingerprint(fresh)) throw new Error('Catalogue or Explore content changed. Review a fresh plan before applying.');
  const now = Date.now();
  await runTransaction(db, async (tx) => {
    const snapshots = await Promise.all(plan.guards.map((g) => tx.get(doc(db, g.path))));
    snapshots.forEach((s, i) => assertVajraSnapshotUnchanged(plan.guards[i], s.exists() ? s.data() : null));
    plan.changes.forEach((c) => {
      const ref = doc(db, c.path);
      const patch = { ...c.patch, _updated: now };
      if (c.before) tx.update(ref, patch);
      else tx.set(ref, patch);
      if (c.path.startsWith('exploreTopics/') && c.before) tx.set(doc(db, `${c.path}/revisions/${now}`), { ...c.before, _savedAt: now });
    });
  });
}
