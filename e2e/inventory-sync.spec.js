// Admin ↔ storefront inventory synchronization, end to end: an edit saved in
// the admin console must appear on the live product page (Firestore-backed
// override layer). This suite WRITES to the deployment's Firestore — it edits
// one product's sale price and stock status and restores both — so it only
// runs when explicitly enabled:
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD  admin credentials
//   E2E_ALLOW_WRITES=1                    opt-in for the mutation
//   E2E_TEST_ITEM_ID                      the sacrificial product (default p001)

import { test, expect } from '@playwright/test';
import { goto, ADMIN_EMAIL, ADMIN_PASSWORD, ALLOW_WRITES, TEST_ITEM_ID, adminSignIn } from './helpers';

const ENABLED = !!(ADMIN_EMAIL && ADMIN_PASSWORD && ALLOW_WRITES);

test.describe('Inventory synchronization (admin → storefront)', () => {
  test.skip(!ENABLED, 'Requires E2E_ADMIN_EMAIL/PASSWORD and E2E_ALLOW_WRITES=1');
  test.describe.configure({ mode: 'serial' });

  // Drawer form fields (DField/DNum/DSel in components/admin/Inventory.jsx):
  // the label span and its control share the same field container.
  const drawerField = (page, label, control = 'input') =>
    page.locator('aside span')
      .filter({ hasText: new RegExp(`^${label}( ·)?$`) })
      .locator(`xpath=ancestor::div[2]//${control}`);

  test('a sale price set in the admin appears on the product page — and reverts', async ({ page, context }) => {
    test.setTimeout(120_000);
    await adminSignIn(page, `/admin?edit=${encodeURIComponent(TEST_ITEM_ID)}`);
    await expect(page.getByText('Pricing & margin')).toBeVisible({ timeout: 20_000 });

    const saleInput = drawerField(page, 'Sale price');
    const retailInput = drawerField(page, 'Retail');
    const statusSelect = drawerField(page, 'Status', 'select');

    const originalSale = (await saleInput.inputValue()).trim();
    const originalStatus = await statusSelect.inputValue();
    const retail = Number(await retailInput.inputValue());
    expect(retail, `product ${TEST_ITEM_ID} needs a retail price`).toBeGreaterThan(1);
    const salePrice = Math.max(1, Math.round(retail * 0.9));

    const store = await context.newPage();
    try {
      // ── Apply: sale price + sold-out status ────────────────────────────────
      await saleInput.fill(String(salePrice));
      await saleInput.press('Enter');
      await statusSelect.selectOption('Sold out');

      await goto(store, `/product/${TEST_ITEM_ID}`);
      const price = store.locator('.pd-price');
      // The server HTML may still be ISR-cached; the live Firestore
      // subscription must deliver the update.
      await expect(price.locator('s')).toBeVisible({ timeout: 30_000 });        // struck list price
      await expect(price.locator('strong')).toContainText(String(salePrice));   // sale price shown
      await expect(price.locator('.pd-stock')).toHaveText('Sold out');
      const buy = store.locator('.pd-order-buy button.btn-malaya');
      await expect(buy).toBeDisabled();                                         // regression: no ordering
      await expect(buy).toHaveText(/sold out/i);
    } finally {
      // ── Revert both fields, whatever happened above ────────────────────────
      await saleInput.fill(originalSale);
      await saleInput.press('Enter');
      await statusSelect.selectOption(originalStatus);
    }

    // ── Verify the revert reached the storefront ─────────────────────────────
    await store.reload({ waitUntil: 'domcontentloaded' });
    if (!originalSale) {
      await expect(store.locator('.pd-price s')).toHaveCount(0, { timeout: 30_000 });
    }
    await expect(store.locator('.pd-price .pd-stock')).toHaveText(originalStatus, { timeout: 30_000 });
    await store.close();
  });
});
