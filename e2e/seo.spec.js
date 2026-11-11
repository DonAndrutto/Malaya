// Technical SEO & security-header regressions: structured data, metadata,
// sitemap/robots and the hardened response headers.

import { test, expect } from '@playwright/test';
import { gotoHome, jsonLdBlocks, blockImages } from './helpers';

const CANONICAL_ORIGIN = 'https://www.malayajewellery.com';

test.describe('Static page social previews', () => {
  test.beforeEach(async ({ page }) => blockImages(page));
  for (const [path, image] of [['/', 'home'], ['/about', 'about'], ['/contact', 'contact'], ['/blog', 'blog']]) {
    test(`${path} uses the canonical host and a 1200×630 social image`, async ({ page, request }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Next normalizes the origin's trailing slash in canonical/OG metadata.
      const url = `${CANONICAL_ORIGIN}${path === '/' ? '' : path}`;
      const imageUrl = `${CANONICAL_ORIGIN}/social/${image}`;
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', imageUrl);
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', imageUrl);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        await expect(page.locator(selector)).not.toHaveAttribute('content', /Tbilisi|Georgia|Bhutan|Thimphu/i);
      }
      const response = await request.get(`/social/${image}`);
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['content-type']).toContain('image/png');
      const png = await response.body();
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
    });
  }
});

test.describe('Structured data', () => {
  // JSON-LD/meta live in the HTML; photo delivery is covered elsewhere.
  test.beforeEach(async ({ page }) => blockImages(page));
  test('home page carries Organization and WebSite JSON-LD', async ({ page }) => {
    await gotoHome(page);
    const blocks = await jsonLdBlocks(page);
    const types = blocks.map((b) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    for (const block of blocks.filter((b) => ['Organization', 'WebSite'].includes(b['@type']))) {
      expect(new URL(block.url).origin).toBe(CANONICAL_ORIGIN);
    }
  });

  test('product page carries Product + BreadcrumbList JSON-LD and canonical/OG tags', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.pcard .pcard-name').first().click();
    await expect(page.locator('.pd-name')).toBeVisible();

    const blocks = await jsonLdBlocks(page);
    const product = blocks.find((b) => b['@type'] === 'Product');
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    expect(product).toBeTruthy();
    expect(product.name).toBe((await page.locator('.pd-name').textContent()).trim());
    expect(product.brand?.name).toBe('Malaya Jewellery');
    if (product.offers) {
      expect(product.offers.priceCurrency).toBe('USD');
      expect(product.offers.price).toBeGreaterThan(0);
      expect(product.offers.availability).toMatch(/schema\.org\/(InStock|OutOfStock|PreOrder)/);
    }
    expect(crumbs).toBeTruthy();
    expect(crumbs.itemListElement.length).toBe(3);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/product\//);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Malaya Jewellery/);
  });
});

test.describe('Crawler surface', () => {
  test('sitemap.xml lists the home page and product URLs', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('<urlset');
    expect(xml).toMatch(/<loc>[^<]*\/product\//);
    expect(xml).toMatch(/<loc>[^<]*\/tashi<\/loc>/);
    expect(xml).toContain(`<loc>${CANONICAL_ORIGIN}/</loc>`);
    for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      expect(new URL(url).origin).toBe(CANONICAL_ORIGIN);
      expect(new URL(url).pathname).not.toBe('/index');
    }
  });

  test('robots.txt allows the store and blocks /admin and /order', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    expect(txt).toMatch(/Allow: \//);
    expect(txt).toMatch(/Disallow: \/admin/);
    expect(txt).toMatch(/Disallow: \/order/);
    expect(txt).toMatch(/Sitemap: .*\/sitemap\.xml/);
    expect(txt).toContain(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`);
  });
});

test.describe('Security headers', () => {
  test('every page ships the hardened header set', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).toContain('firebasestorage.googleapis.com');
  });

  test('the admin console is unindexable and uncached', async ({ request }) => {
    const res = await request.get('/admin');
    const h = res.headers();
    expect(h['x-robots-tag']).toContain('noindex');
    expect(h['cache-control']).toContain('no-store');
  });

  test('the retired API stubs are gone', async ({ request }) => {
    for (const path of ['/api/auth', '/api/overrides', '/api/upload']) {
      const res = await request.post(path, { failOnStatusCode: false, data: {} });
      expect(res.status(), `${path} must not exist`).toBe(404);
    }
  });
});
