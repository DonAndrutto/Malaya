// Image delivery pipeline: direct Firebase Storage serving, lazy loading and
// LCP prioritization. Photos deliberately bypass the Vercel image optimizer
// (whose Hobby transformation quota runs out — see IMAGES.md), so these tests
// pin the direct-URL contract: pre-optimised masters, immutable caching.

import { test, expect } from '@playwright/test';
import { gotoHome } from './helpers';
test.describe('Image delivery', () => {
  test('catalogue photos are lazy and served directly from Storage', async ({ page }) => {
    await gotoHome(page);
    const img = page.locator('.pcard-thumb img').first();
    // Direct Firebase Storage URL — never the optimizer (/_next/image).
    await expect(img).toHaveAttribute('src', /firebasestorage\.googleapis\.com/);
    await expect(img).toHaveAttribute('loading', 'lazy');

    // Storage answers with an image and the year-long immutable cache the
    // uploader sets (lib/upload.js) — direct serving relies on both.
    const src = await img.getAttribute('src');
    const res = await page.request.get(src);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toMatch(/^image\//);
    expect(res.headers()['cache-control']).toMatch(/immutable/);
  });

  test('the product hero is prioritized, not lazy (LCP)', async ({ page }) => {
    await gotoHome(page);
    // First card that actually has a photo.
    await page.locator('.pcard:has(.pcard-thumb img)').first().locator('.pcard-thumb').click();
    const hero = page.locator('.pd-photo img').first();
    await expect(hero).toBeVisible();
    await expect(hero).not.toHaveAttribute('loading', 'lazy');
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
  });
});
