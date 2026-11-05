'use client';

import { collection, doc, getDocsFromServer, getDocFromServer, runTransaction } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { buildVajraChangeSet, assertVajraSnapshotUnchanged } from './vajra-change-set';

function adminSession() {
  const { app, db, auth } = getFirebase();
  if (!db || !auth?.currentUser || app?.options.projectId !== 'malaya-catalogue') {
    throw new Error('Sign in to Malaya administration before applying this refresh.');
  }
  return { db, auth };
}

export async function prepareVajraAdminRefresh() {
  const { db } = adminSession();
  const [catalogue, topic] = await Promise.all([
    getDocsFromServer(collection(db, 'catalogueOverrides')),
    getDocFromServer(doc(db, 'exploreTopics/vajra')),
  ]);
  if (!topic.exists()) throw new Error('The existing Vajra topic could not be found.');
  return buildVajraChangeSet(Object.fromEntries(catalogue.docs.map((d) => [d.id, d.data()])), topic.data());
}

export async function applyVajraAdminRefresh(plan) {
  const { db } = adminSession();
  if (!plan?.changes?.length || plan.changes.length > 450) throw new Error('Review a valid refresh plan first.');
  const now = Date.now();
  const refs = plan.changes.map((change) => {
    const product = /^catalogueOverrides\/[^/]+$/.test(change.path);
    const allowed = product ? ['name', 'sub', 'story', 'topics'] : ['title', 'subtitle', 'excerpt', 'aliases', 'blocks'];
    if ((!product && change.path !== 'exploreTopics/vajra') || Object.keys(change.patch).some((key) => !allowed.includes(key))) {
      throw new Error('The refresh contains an unsupported change.');
    }
    return doc(db, change.path);
  });
  await runTransaction(db, async (tx) => {
    // Complete every read and concurrency check before queuing any write.
    const current = await Promise.all(refs.map((ref) => tx.get(ref)));
    current.forEach((snapshot, i) => assertVajraSnapshotUnchanged(plan.changes[i], snapshot.exists() ? snapshot.data() : null));
    plan.changes.forEach((change, i) => {
      const patch = { ...change.patch, _updated: now };
      if (current[i].exists()) tx.update(refs[i], patch);
      else tx.set(refs[i], patch);
      if (change.path === 'exploreTopics/vajra') {
        tx.set(doc(db, `exploreTopics/vajra/revisions/${now}`), { ...current[i].data(), _savedAt: now });
      }
    });
  });
}

export async function refreshVajraStorefront() {
  const { auth } = adminSession();
  const token = await auth.currentUser.getIdToken();
  const responses = await Promise.all(['site', 'explore'].map((scope) => fetch(`/api/revalidate?scope=${scope}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  })));
  if (responses.some((r) => !r.ok)) throw new Error('Saved to Firebase, but the storefront cache could not be refreshed. Retry the storefront refresh.');
}
