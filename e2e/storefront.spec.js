// Storefront critical journeys: browsing the catalogue, category navigation,
// search, product detail, informational pages and legacy-route regressions.

import { test, expect } from '@playwright/test';
import { goto, gotoHome, blockImages } from './helpers';

test.describe('Home & catalogue', () => {
  // Behavioural tests skip photo delivery (hundreds of optimized images per
  // catalogue page); the pipeline itself is covered by the Image delivery suite.
  test.beforeEach(async ({ page }) => blockImages(page));

  test('home renders the hero and a populated, category-grouped catalogue', async ({ page }) => {
    await gotoHome(page);
    await expect(page.locator('.hero')).toBeVisible();
    expect(await page.locator('.cat-section').count()).toBeGreaterThan(2);
    expect(await page.locator('.pcard').count()).toBeGreaterThan(10);
    // Every card links to a product page.
    await expect(page.locator('.pcard .pcard-thumb').first()).toHaveAttribute('href', /\/product\//);
  });

  test('category menu jumps between catalogue sections', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.cat-current').click();
    const menu = page.locator('.cat-menu');
    await expect(menu).toBeVisible();
    const items = menu.locator('.cat-menu-item');
    expect(await items.count()).toBeGreaterThan(2);
    // Jump to a middle section — the last section can be too short to reach
    // the top of the viewport, in which case the scroll-spy (correctly)
    // keeps highlighting the section above it.
    const target = items.nth(2);
    const label = (await target.locator('span').first().textContent()).trim();
    await target.click();
    await expect(menu).not.toBeVisible();
    // The chosen section scrolls into view under the sticky bar.
    await expect(page.locator('.cat-section-title', { hasText: label }).first()).toBeInViewport();
  });

  test('metal filter narrows the catalogue and can be cleared', async ({ page }) => {
    await gotoHome(page);
    const total = await page.locator('.pcard').count();
    await page.getByRole('button', { name: 'Gold', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gold', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => page.locator('.pcard').count(), { message: 'gold filter should reduce the grid' })
      .toBeLessThan(total);
    await page.getByRole('button', { name: 'Gold', exact: true }).click();
    await expect.poll(async () => page.locator('.pcard').count()).toBe(total);
  });

  test('search typeahead finds a product and navigates to it', async ({ page }) => {
    await gotoHome(page);
    // Search for a word from a real product so the test tracks live data.
    const name = (await page.locator('.pcard-name').first().textContent()).trim();
    const term = name.split(/\s+/).find((w) => w.length > 3) || name;
    await page.locator('.cat-search').fill(term);
    const row = page.locator('.cat-search-row').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.locator('.pd-name')).toBeVisible();
  });
});

test.describe('Product page', () => {
  test.beforeEach(async ({ page }) => blockImages(page));

  test('shows details, specs, price and related pieces', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.pcard .pcard-name').first().click();
    await expect(page.locator('.pd-name')).toBeVisible();
    await expect(page.locator('.pd-price strong')).toHaveText(/\$[\d,]+/);
    await expect(page.locator('.pd-specs')).toContainText('Material');
    await expect(page.locator('.pd-crumbs')).toContainText('Home');
    await expect(page.locator('.pd-whatsapp')).toHaveAttribute('href', /api\.whatsapp\.com/);
    // Cross-sell row is always filled.
    expect(await page.locator('.pd-related .pcard').count()).toBeGreaterThan(0);
  });

  test('unknown product id shows the not-found message with a way back', async ({ page }) => {
    await goto(page, '/product/definitely-not-a-real-id');
    await expect(page.getByText('This item could not be found')).toBeVisible();
    await page.getByRole('link', { name: 'Back to the catalogue.' }).click();
    await expect(page.locator('.hero')).toBeVisible();
  });
});

test.describe('Site pages & regressions', () => {
  // These journeys assert copy and routing, not imagery.
  test.beforeEach(async ({ page }) => blockImages(page));

  test('main navigation reaches every page', async ({ page }) => {
    for (const [path, marker] of [
      ['/tashi', '.tashi-products'],
      ['/about', '.about-article'],
      ['/contact', '.contact-form'],
      ['/blog', '.blog-wrap'],
    ]) {
      await goto(page, path);
      await expect(page.locator(marker)).toBeVisible();
    }
  });

  test('legacy /catalogue route redirects to the home catalogue', async ({ page }) => {
    await goto(page, '/catalogue');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.pcard').first()).toBeVisible();
  });

  test('policy pages render their admin-editable copy', async ({ page }) => {
    for (const slug of ['privacy', 'terms', 'cookie', 'refund']) {
      await goto(page, `/policy/${slug}`);
      await expect(page.locator('.about-title')).not.toBeEmpty();
      expect((await page.locator('.about-para').count())).toBeGreaterThan(0);
    }
  });

  test('footer links to the studio admin entry point', async ({ page }) => {
    await gotoHome(page);
    await expect(page.getByRole('link', { name: 'Studio admin' })).toHaveAttribute('href', '/admin');
  });
});

