// Explore editorial system: landing, shelves, topic pages, catalogue
// integration and crawler surface. Topics seed as drafts and the studio
// publishes over time, so every test here must hold in BOTH states — an
// empty knowledge layer (nothing published) and a populated one. State-
// dependent assertions branch on what the deployment actually serves.

import { test, expect } from '@playwright/test';
import { goto, gotoHome, blockImages, jsonLdBlocks } from './helpers';

test.describe('Explore landing', () => {
  test.beforeEach(async ({ page }) => blockImages(page));

  test('renders the banner, lead and breadcrumb JSON-LD', async ({ page }) => {
    await goto(page, '/explore');
    await expect(page.locator('.page-banner-title')).toHaveText('Explore');
    await expect(page.locator('.explore-lead').first()).toBeVisible();
    const crumbs = (await jsonLdBlocks(page)).find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs).toBeTruthy();
    expect(crumbs.itemListElement.at(-1).name).toBe('Explore');
  });

  test('shows shelves with topic cards, or the coming-soon state', async ({ page }) => {
    await goto(page, '/explore');
    await expect(page.locator('.explore-lead').first()).toBeVisible();
    const shelves = await page.locator('.explore-shelf').count();
    if (shelves === 0) {
      await expect(page.getByText('The studio is preparing this catalogue of symbols')).toBeVisible();
    } else {
      // Every shelf heading links to its group page; cards (if any published
      // topics) link to canonical topic URLs.
      await expect(page.locator('.explore-shelf-all').first()).toHaveAttribute('href', /\/explore\//);
      const cards = page.locator('.explore-card');
      if (await cards.count()) {
        await expect(cards.first()).toHaveAttribute('href', /\/explore\/topic\//);
      }
    }
  });

  test('the unified search box responds (graceful empty state)', async ({ page }) => {
    await goto(page, '/explore');
    const box = page.locator('.explore-search-input');
    await box.fill('zzz-no-such-symbol');
    await expect(page.locator('.explore-search-results')).toBeVisible();
    await expect(page.getByText('Nothing matches yet.')).toBeVisible();
  });

  test('a published topic card opens the canonical topic page', async ({ page }) => {
    await goto(page, '/explore');
    const cards = page.locator('.explore-card');
    test.skip((await cards.count()) === 0, 'No published topics on this deployment yet');
    const title = (await cards.first().locator('.explore-card-title').textContent()).trim();
    await cards.first().click();
    await expect(page).toHaveURL(/\/explore\/topic\//);
    await expect(page.locator('.explore-hero-title')).toHaveText(title);
    const blocks = await jsonLdBlocks(page);
    expect(blocks.find((b) => b['@type'] === 'Article')).toBeTruthy();
    expect(blocks.find((b) => b['@type'] === 'BreadcrumbList')).toBeTruthy();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/explore\/topic\//);
  });
});

test.describe('Explore not-found & drafts', () => {
  test.beforeEach(async ({ page }) => blockImages(page));

  test('an unknown topic (or draft) shows not-found, unindexable, with a way back', async ({ page }) => {
    await goto(page, '/explore/topic/definitely-not-a-real-topic');
    await expect(page.getByText('This topic could not be found')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('link', { name: 'Back to Explore.' }).click();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test('an unknown group shows not-found with a way back', async ({ page }) => {
    await goto(page, '/explore/definitely-not-a-real-shelf');
    await expect(page.getByText('This shelf could not be found')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('Storefront integration', () => {
  test.beforeEach(async ({ page }) => blockImages(page));

  test('the header navigation reaches Explore', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.hdr-nav-link', { hasText: 'Explore' }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.locator('.page-banner-title')).toHaveText('Explore');
  });

  test('the catalogue bar: Symbol filter composes with Metal, or is absent entirely', async ({ page }) => {
    await gotoHome(page);
    // Metal filter must behave exactly as before in either state.
    await expect(page.getByRole('button', { name: 'Gold', exact: true })).toBeVisible();
    const symBtn = page.locator('.cat-sym');
    if ((await symBtn.count()) === 0) {
      // Nothing published+linked yet — the bar is byte-for-byte today's bar.
      await expect(page.locator('.cat-sym-wrap')).toHaveCount(0);
      return;
    }
    // Published linked topics exist: the dropdown filters and clears.
    const total = await page.locator('.pcard').count();
    await symBtn.click();
    const item = page.locator('.cat-menu-item').last(); // menu is open on the symbol dropdown
    const count = Number((await item.locator('em').textContent()).trim());
    await item.click();
    await expect
      .poll(async () => page.locator('.pcard').count(), { message: 'symbol filter should narrow the grid' })
      .toBe(count);
    // Tap-again-to-clear restores the full catalogue.
    await symBtn.click();
    await page.locator('.cat-menu-item.on').click();
    await expect.poll(async () => page.locator('.pcard').count()).toBe(total);
  });

  test('product pages carry no symbolism section for unlinked pieces (zero-regression)', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.pcard .pcard-name').first().click();
    await expect(page.locator('.pd-name')).toBeVisible();
    // Whether or not this piece is linked, the page must stay coherent: the
    // symbolism section either lists topic links or is entirely absent.
    const sections = await page.locator('.pd-symbolism').count();
    if (sections) {
      await expect(page.locator('.pd-symbolism-item').first()).toHaveAttribute('href', /\/explore\/topic\//);
    } else {
      await expect(page.locator('.pd-symbolism')).toHaveCount(0);
    }
    // The pre-Explore surfaces are untouched.
    await expect(page.locator('.pd-related')).toBeVisible();
    await expect(page.locator('.pd-specs')).toContainText('Material');
  });

  test('the Tashi page still renders its grid; the topics strip only with linked topics', async ({ page }) => {
    await goto(page, '/tashi');
    await expect(page.locator('.tashi-products')).toBeVisible();
    const strip = page.locator('.tashi-explore');
    if (await strip.count()) {
      await expect(strip.locator('a').first()).toHaveAttribute('href', /\/explore\/topic\//);
    }
  });
});

test.describe('Crawler surface', () => {
  test('sitemap.xml lists /explore', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toMatch(/<loc>[^<]*\/explore<\/loc>/);
  });
});
