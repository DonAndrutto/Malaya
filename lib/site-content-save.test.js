import { saveSiteContent, SITE_CONTENT_KEY } from './site-content';
import { setDoc } from 'firebase/firestore';
import { pingRevalidate } from './revalidate-ping';
jest.mock('firebase/firestore', () => ({ doc: jest.fn(() => 'doc'), setDoc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock('./firebase', () => ({ FIREBASE_ENABLED: true, getFirebase: () => ({ db: {} }) }));
jest.mock('./revalidate-ping', () => ({ pingRevalidate: jest.fn() }));
beforeEach(() => { global.window = {}; global.localStorage = { setItem: jest.fn() }; jest.clearAllMocks(); });
afterEach(() => { delete global.window; delete global.localStorage; });
test('failure rejects without marking the local published cache as saved or purging', async () => {
  setDoc.mockRejectedValue(new Error('offline'));
  await expect(saveSiteContent({ hero: { title: 'draft' } })).rejects.toThrow('offline');
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(pingRevalidate).not.toHaveBeenCalled();
});
test('successful acknowledgement updates the published cache and schedules one purge', async () => {
  setDoc.mockResolvedValue();
  await saveSiteContent({ hero: { title: 'saved' } });
  expect(localStorage.setItem).toHaveBeenCalledWith(SITE_CONTENT_KEY, JSON.stringify({ hero: { title: 'saved' } }));
  expect(pingRevalidate).toHaveBeenCalledTimes(1);
});
