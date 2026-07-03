// Shared helpers for the Malaya E2E suite.

import { expect } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
export const ALLOW_WRITES = process.env.E2E_ALLOW_WRITES === '1';
export const TEST_ITEM_ID = process.env.E2E_TEST_ITEM_ID || 'p001';

// Navigate without waiting for the window `load` event: store pages keep
// streaming catalogue imagery well past DOM readiness (especially against a
// cold deployment/optimizer), so tests wait for content assertions instead.
export function goto(page, path) {
  return page.goto(path, { waitUntil: 'domcontentloaded' });
}

// Skip photo delivery for tests that assert on text/behaviour only. The
// catalogue pages request hundreds of optimized images; dropping them keeps
// navigation-heavy tests fast and deterministic on cold deployments (image
// rendering itself is covered by the storefront/SEO suites).
export async function blockImages(page) {
  await page.route('**/_next/image**', (route) => route.abort());
  await page.route('https://firebasestorage.googleapis.com/**', (route) => route.abort());
}

// Open the home page and wait for the catalogue grid to be populated.
export async function gotoHome(page) {
  await goto(page, '/');
  await expect(page.locator('.pcard').first()).toBeVisible();
}

// Navigate to the first product whose "Add to Order" button is enabled
// (skipping sold-out pieces). Returns its name.
export async function openBuyableProduct(page) {
  await gotoHome(page);
  const cards = page.locator('.pcard .pcard-name');
  const count = Math.min(await cards.count(), 6);
  for (let i = 0; i < count; i++) {
    const name = (await cards.nth(i).textContent())?.trim();
    await cards.nth(i).click();
    await expect(page.locator('.pd-name')).toBeVisible();
    const buy = page.locator('.pd-order-buy button.btn-malaya');
    if (await buy.isEnabled()) return name;
    await page.goBack();
    await expect(page.locator('.pcard').first()).toBeVisible();
  }
  throw new Error('No in-stock product found among the first catalogue cards');
}

// Sign in to /admin with the configured credentials. `path` lets tests use
// deep links such as /admin?edit=<id>.
export async function adminSignIn(page, path = '/admin') {
  await goto(page, path);
  await page.getByPlaceholder('you@studio.com').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /enter/i }).click();
  await expect(page.getByText('Signed in as')).toBeVisible({ timeout: 20_000 });
}

// Parse every JSON-LD block on the current page → array of objects.
export async function jsonLdBlocks(page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((t) => JSON.parse(t));
}
