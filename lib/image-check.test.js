import { createHash } from 'node:crypto';
import { imageCheckAllowed, imageCheckSamples, renderImageCheck, IMAGE_CHECK_SCRIPT } from './image-check';

test('diagnostic is allowed only on preview or local development', () => {
  expect(imageCheckAllowed('preview', 'production')).toBe(true);
  expect(imageCheckAllowed(undefined, 'development')).toBe(true);
  expect(imageCheckAllowed('production', 'production')).toBe(false);
  expect(imageCheckAllowed(undefined, 'test')).toBe(false);
});
test('only a bounded set of existing HTTPS Firebase Storage samples is accepted', () => {
  const src = 'https://firebasestorage.googleapis.com/v0/b/example/o/sample.jpg?alt=media&token=public';
  const samples = imageCheckSamples({ p009: { img: src } }, { heroSlides: [src] });
  expect(samples.length).toBeLessThanOrEqual(3);
  expect(samples.find(s => s.label === 'Product photo').src).toBe(src);
  expect(imageCheckSamples({ p009: { img: 'https://unapproved.example/sample.jpg' } }, { heroSlides: ['javascript:alert(1)'] })).toEqual([]);
});
test('standalone diagnostic permits only its fixed script and public image requests', () => {
  const { html, policy } = renderImageCheck([{ label: 'Image', src: 'https://firebasestorage.googleapis.com/test?x="</section><script>bad()</script>' }]);
  expect(html).not.toContain('<script>bad()');
  expect(policy).toContain(`script-src 'sha256-${createHash('sha256').update(IMAGE_CHECK_SCRIPT).digest('base64')}'`);
  expect(policy).not.toContain('vercel.live');
  expect(html).not.toMatch(/va\.vercel|speed-insights|firestore\.googleapis/);
  expect(IMAGE_CHECK_SCRIPT).not.toMatch(/sendBeacon|localStorage|sessionStorage|userAgent|platform|screen\.|location\.|geolocation/);
  expect(IMAGE_CHECK_SCRIPT).toContain('slice(0, 2500)');
  expect(IMAGE_CHECK_SCRIPT).toContain('8000');
  expect(IMAGE_CHECK_SCRIPT).toContain("credentials: 'omit'");
  expect(() => new Function(IMAGE_CHECK_SCRIPT)).not.toThrow();
});
