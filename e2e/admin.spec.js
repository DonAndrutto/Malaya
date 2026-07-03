// Admin console: authentication gate, storefront/admin isolation, and (when
// credentials are provided) the signed-in dashboard and inventory desk.
// These tests are read-only — nothing is saved to Firestore.

import { test, expect } from '@playwright/test';
import { goto, ADMIN_EMAIL, ADMIN_PASSWORD, TEST_ITEM_ID, adminSignIn } from './helpers';

const HAS_CREDS = !!(ADMIN_EMAIL && ADMIN_PASSWORD);

test.describe('Authentication gate', () => {
  test('the console is hidden behind the sign-in form', async ({ page }) => {
    await goto(page, '/admin');
    await expect(page.getByText('Studio Administration')).toBeVisible();
    await expect(page.getByPlaceholder('you@studio.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••')).toBeVisible();
    // No admin chrome (tabs, inventory) without a session.
    await expect(page.getByText('Signed in as')).not.toBeVisible();
    await expect(page.locator('.inv-row')).toHaveCount(0);
  });

  test('an /admin?edit deep link still lands on the sign-in gate', async ({ page }) => {
    await goto(page, `/admin?edit=${TEST_ITEM_ID}`);
    await expect(page.getByText('Studio Administration')).toBeVisible();
    await expect(page.getByText('Signed in as')).not.toBeVisible();
  });

  test('wrong credentials are rejected', async ({ page }) => {
    await goto(page, '/admin');
    await page.getByPlaceholder('you@studio.com').fill(`nobody-${Date.now()}@example.com`);
    await page.getByPlaceholder('••••••••').fill('definitely-wrong');
    await page.getByRole('button', { name: /enter/i }).click();
    // Whatever the exact Firebase error, we must remain outside the console.
    await expect(page.getByText('Signed in as')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Studio Administration')).toBeVisible();
  });
});

test.describe('Admin/storefront isolation', () => {
  test('the admin page carries no storefront chrome, and vice versa', async ({ page }) => {
    await goto(page, '/admin');
    await expect(page.locator('.malaya-site')).toHaveCount(0);
    await expect(page.locator('.site-header')).toHaveCount(0);

    await goto(page, '/');
    await expect(page.locator('.malaya-admin')).toHaveCount(0);
    await expect(page.locator('.adm-header')).toHaveCount(0);
  });
});

test.describe('Signed-in dashboard', () => {
  test.skip(!HAS_CREDS, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');

  test('sign in → tabs, inventory desk, stats and sign out', async ({ page }) => {
    await adminSignIn(page);
    for (const tab of ['Inventory', 'Content', 'Site images', 'Blog']) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    // The inventory desk lists the merged catalogue + ledger.
    await expect(page.locator('.inv-row').first()).toBeVisible({ timeout: 20_000 });
    expect(await page.locator('.inv-row').count()).toBeGreaterThan(10);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByText('Studio Administration')).toBeVisible();
  });

  test('inventory search narrows the list', async ({ page }) => {
    await adminSignIn(page);
    const rows = page.locator('.inv-row');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const before = await rows.count();
    await page.getByPlaceholder('Search name or code…').fill(TEST_ITEM_ID);
    await expect.poll(async () => rows.count()).toBeLessThan(before);
  });

  test('a product deep link opens its editor drawer after sign-in', async ({ page }) => {
    await adminSignIn(page, `/admin?edit=${TEST_ITEM_ID}`);
    // Drawer shows the storefront publish switch and the pricing section.
    await expect(page.getByText('Pricing & margin')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Sale price')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Pricing & margin')).not.toBeVisible();
  });
});
