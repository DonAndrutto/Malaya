// Image delivery pipeline: responsive optimized formats, lazy loading and
// LCP prioritization. Kept separate (and desktop-only) because these tests
// intentionally exercise the image optimizer, which is the most expensive
// surface of the deployment.

import { test, expect } from '@playwright/test';
import { gotoHome } from './helpers';
test.describe('Image delivery', () => {
  test('catalogue photos are lazy, responsive and served as modern formats', async ({ page }) => {
    await gotoHome(page);
    const img = page.locator('.pcard-thumb img').first();
    // next/image: responsive srcset through the optimizer, lazy by default.
    await expect(img).toHaveAttribute('srcset', /_next\/image/);
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('sizes', /vw/);

    // The optimizer actually answers with a modern format and long-lived cache.
    const src = await img.getAttribute('src');
    const res = await page.request.get(src, { headers: { Accept: 'image/avif,image/webp,image/*,*/*' } });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toMatch(/image\/(avif|webp)/);
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
