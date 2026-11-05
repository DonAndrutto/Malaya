import { applyVajraAdminRefresh, refreshVajraStorefront } from './vajra-admin';
import { getFirebase } from '../firebase';
import { runTransaction } from 'firebase/firestore';
import { assertVajraSnapshotUnchanged } from './vajra-change-set';

jest.mock('../firebase', () => ({ getFirebase: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: (_db, path) => ({ path }),
  getDocsFromServer: jest.fn(), getDocFromServer: jest.fn(), runTransaction: jest.fn(),
}));

const session = () => ({ app: { options: { projectId: 'malaya-catalogue' } }, db: {}, auth: { currentUser: { getIdToken: async () => 'test-token' } } });
const snap = (data) => ({ exists: () => data !== null, data: () => data });
const changes = [
  { path: 'catalogueOverrides/p017', before: { name: 'Vajra', qty: 4 }, patch: { topics: ['vajra'] } },
  { path: 'exploreTopics/vajra', before: { slug: 'vajra', title: 'Vajra', blocks: [] }, patch: { excerpt: 'Approved copy' } },
];

beforeEach(() => { jest.clearAllMocks(); getFirebase.mockReturnValue(session()); });

test('aborts the entire refresh when another editor changed any reviewed record', async () => {
  const tx = { get: jest.fn().mockResolvedValueOnce(snap({ name: 'New owner title', qty: 4 })).mockResolvedValueOnce(snap(changes[1].before)), update: jest.fn(), set: jest.fn() };
  runTransaction.mockImplementation(async (_db, work) => work(tx));
  await expect(applyVajraAdminRefresh({ changes })).rejects.toThrow('A newer edit exists');
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.set).not.toHaveBeenCalled();
});

test('writes only reviewed fields and checkpoints the old topic in the same transaction', async () => {
  const tx = { get: jest.fn().mockResolvedValueOnce(snap(changes[0].before)).mockResolvedValueOnce(snap(changes[1].before)), update: jest.fn(), set: jest.fn() };
  runTransaction.mockImplementation(async (_db, work) => work(tx));
  await applyVajraAdminRefresh({ changes });
  expect(tx.update).toHaveBeenNthCalledWith(1, { path: changes[0].path }, { topics: ['vajra'], _updated: expect.any(Number) });
  expect(tx.update).toHaveBeenNthCalledWith(2, { path: changes[1].path }, { excerpt: 'Approved copy', _updated: expect.any(Number) });
  expect(tx.set).toHaveBeenCalledWith({ path: expect.stringMatching(/^exploreTopics\/vajra\/revisions\/\d+$/) }, { ...changes[1].before, _savedAt: expect.any(Number) });
});

test('ignores map key order but rejects a real nested edit', () => {
  expect(() => assertVajraSnapshotUnchanged({ path: 'test', before: { name: 'Vajra', topics: ['vajra', 'bell'] } }, { topics: ['vajra', 'bell'], name: 'Vajra' })).not.toThrow();
  expect(() => assertVajraSnapshotUnchanged({ path: 'test', before: { topics: ['vajra'] } }, { topics: ['double-vajra'] })).toThrow();
});

test('rejects unauthenticated sessions and out-of-scope writes before the transaction', async () => {
  getFirebase.mockReturnValue({});
  await expect(applyVajraAdminRefresh({ changes })).rejects.toThrow('Sign in');
  getFirebase.mockReturnValue(session());
  await expect(applyVajraAdminRefresh({ changes: [{ ...changes[0], patch: { qty: 100 } }] })).rejects.toThrow('unsupported');
  expect(runTransaction).not.toHaveBeenCalled();
});

test('reports cache failures explicitly and allows retry without writing data again', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  try {
    await expect(refreshVajraStorefront()).rejects.toThrow('Saved to Firebase');
    global.fetch.mockResolvedValue({ ok: true });
    await expect(refreshVajraStorefront()).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith('/api/revalidate?scope=site', expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith('/api/revalidate?scope=explore', expect.any(Object));
    expect(runTransaction).not.toHaveBeenCalled();
  } finally { global.fetch = originalFetch; }
});
