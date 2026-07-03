// Technical SEO & security-header regressions: structured data, metadata,
// sitemap/robots and the hardened response headers.

import { test, expect } from '@playwright/test';
import { gotoHome, jsonLdBlocks, blockImages } from './helpers';

test.describe('Structured data', () => {
  // JSON-LD/meta live in the HTML; photo delivery is covered elsewhere.
  test.beforeEach(async ({ page }) => blockImages(page));
  test('home page carries Organization and WebSite JSON-LD', async ({ page }) => {
    await gotoHome(page);
    const types = (await jsonLdBlocks(page)).map((b) => b['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
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
  });

  test('robots.txt allows the store and blocks /admin and /order', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const txt = await res.text();
    expect(txt).toMatch(/Allow: \//);
    expect(txt).toMatch(/Disallow: \/admin/);
    expect(txt).toMatch(/Disallow: \/order/);
    expect(txt).toMatch(/Sitemap: .*\/sitemap\.xml/);
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
