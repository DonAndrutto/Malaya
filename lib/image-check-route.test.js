import { GET } from '@/app/api/image-check/route';
import { fetchCollection, fetchDoc } from './server/firestore';

jest.mock('./server/firestore', () => ({
  fetchCollection: jest.fn(), fetchDoc: jest.fn(),
  REVALIDATE_SECONDS: 86400, CATALOGUE_CACHE_TAG: 'catalogue', SETTINGS_CACHE_TAG: 'site-settings',
}));
const previous = process.env.VERCEL_ENV;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous; });

test.each(['', '?control=1'])('production does not expose the diagnostic or read data (%s)', async (query) => {
  process.env.VERCEL_ENV = 'production';
  const response = await GET(new Request('https://example.test/api/image-check' + query));
  expect(response.status).toBe(404);
  expect(fetchCollection).not.toHaveBeenCalled();
  expect(fetchDoc).not.toHaveBeenCalled();
});
test('preview same-origin control is static and does not access Firestore', async () => {
  process.env.VERCEL_ENV = 'preview';
  const response = await GET(new Request('https://example.test/api/image-check?control=1'));
  expect(response.headers.get('content-type')).toBe('image/svg+xml');
  expect(await response.text()).toContain('>OK</text>');
  expect(fetchCollection).not.toHaveBeenCalled();
  expect(fetchDoc).not.toHaveBeenCalled();
});
test('preview report is no-store/noindex and emits no external script/analytics', async () => {
  process.env.VERCEL_ENV = 'preview';
  const src = 'https://firebasestorage.googleapis.com/v0/b/example/o/sample.jpg?alt=media';
  fetchCollection.mockResolvedValue({ p009: { img: src } });
  fetchDoc.mockResolvedValue({ heroSlides: [src] });
  const response = await GET(new Request('https://example.test/api/image-check'));
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('x-robots-tag')).toContain('noindex');
  expect(response.headers.get('content-security-policy')).toContain("script-src 'sha256-");
  expect(html).not.toMatch(/<script[^>]+src=|vercel\.live|analytics|speed-insights/);
  expect(fetchCollection).toHaveBeenCalledTimes(1);
  expect(fetchDoc).toHaveBeenCalledTimes(1);
});
