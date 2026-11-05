import { applySymbolsRefresh, prepareSymbolsRefresh } from './symbols-admin';
import { getFirebase } from '../firebase';
import { getDocsFromServer, runTransaction } from 'firebase/firestore';
jest.mock('../firebase', () => ({ getFirebase: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: (_db, path) => ({ path }), doc: (_db, path) => ({ path }), getDocsFromServer: jest.fn(), runTransaction: jest.fn() }));
const data = { catalogueOverrides: { p029: { name: 'Double Dorje Pendant', topics: ['owner-link'], qty: 4 } }, exploreTopics: { 'the-endless-knot': { slug: 'the-endless-knot', title: 'The Endless Knot', published: false } }, exploreGroups: {} };
beforeEach(() => {
  jest.clearAllMocks();
  getFirebase.mockReturnValue({ app: { options: { projectId: 'malaya-catalogue' } }, db: {}, auth: { currentUser: {} } });
  getDocsFromServer.mockImplementation(async ({ path }) => ({ docs: Object.entries(data[path]).map(([id, d]) => ({ id, data: () => d })) }));
});
const transaction = (plan, changedPath) => ({
  get: jest.fn(async ({ path }) => { const g = plan.guards.find((g) => g.path === path); const value = path === changedPath ? { ...g.before, qty: 99 } : g.before; return { exists: () => value !== null, data: () => value }; }),
  set: jest.fn(), update: jest.fn(),
});
test('concurrent stock or owner edits abort all writes', async () => {
  const plan = await prepareSymbolsRefresh(); const tx = transaction(plan, 'catalogueOverrides/p029');
  runTransaction.mockImplementation(async (_db, fn) => fn(tx));
  await expect(applySymbolsRefresh(plan)).rejects.toThrow('newer edit');
  expect(tx.update).not.toHaveBeenCalled(); expect(tx.set).not.toHaveBeenCalled();
});
test('reads every guard before writes and stores the existing topic revision', async () => {
  const plan = await prepareSymbolsRefresh(); const tx = transaction(plan);
  runTransaction.mockImplementation(async (_db, fn) => fn(tx));
  await applySymbolsRefresh(plan);
  expect(tx.get).toHaveBeenCalledTimes(plan.guards.length);
  expect(Math.max(...tx.get.mock.invocationCallOrder)).toBeLessThan(Math.min(...tx.set.mock.invocationCallOrder, ...tx.update.mock.invocationCallOrder));
  expect(tx.update).toHaveBeenCalledWith({ path: 'catalogueOverrides/p029' }, { topics: ['owner-link', 'double-dorje'], _updated: expect.any(Number) });
  expect(tx.set).toHaveBeenCalledWith({ path: expect.stringMatching(/^exploreTopics\/the-endless-knot\/revisions\//) }, { ...data.exploreTopics['the-endless-knot'], _savedAt: expect.any(Number) });
});
test('rejects new records and plan tampering before any transaction', async () => {
  const plan = await prepareSymbolsRefresh();
  plan.changes[0].patch.topics.push('unreviewed-topic');
  await expect(applySymbolsRefresh(plan)).rejects.toThrow('changed');
  expect(runTransaction).not.toHaveBeenCalled();
});
test('requires the existing authenticated target project', async () => {
  getFirebase.mockReturnValue({});
  await expect(prepareSymbolsRefresh()).rejects.toThrow('Sign in');
  getFirebase.mockReturnValue({ app: { options: { projectId: 'other' } }, db: {}, auth: { currentUser: {} } });
  await expect(prepareSymbolsRefresh()).rejects.toThrow('Sign in');
});
