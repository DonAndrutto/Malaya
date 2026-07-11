// Cart & checkout journey: add to order, quantities, totals, persistence and
// the WhatsApp checkout hand-off. The cart is localStorage-backed, so these
// tests never touch shared state.

import { test, expect } from '@playwright/test';
import { goto, blockImages, openBuyableProduct } from './helpers';

test.describe('Cart', () => {
  // Cart behaviour is text/state-driven; photo delivery is covered elsewhere.
  test.beforeEach(async ({ page }) => blockImages(page));
  test('add to order → notice, header count, order page line', async ({ page }) => {
    const name = await openBuyableProduct(page);
    await page.locator('.pd-order-buy button.btn-malaya').click();

    // Actionable "added" notice names the product.
    const notice = page.locator('.cart-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(name);
    await expect(page.locator('.hdr-cart-count').first()).toHaveText('1');

    await notice.getByRole('link', { name: /go to basket/i }).click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.locator('.order-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.order-name')).toContainText(name);
  });

  test('quantity controls update line and order totals', async ({ page }) => {
    await openBuyableProduct(page);
    // Use the product-page stepper to order 2 units.
    await page.locator('.pd-qty button[aria-label="Increase quantity"]').click();
    await page.locator('.pd-order-buy button.btn-malaya').click();
    await goto(page, '/order');

    const qty = page.locator('.order-table .pd-qty span');
    await expect(qty).toHaveText('2');
    const totalOf = async () => Number((await page.locator('.order-total strong').textContent()).replace(/[^0-9.]/g, ''));
    const totalAt2 = await totalOf();
    expect(totalAt2).toBeGreaterThan(0);

    await page.locator('.order-table .pd-qty button').first().click(); // −
    await expect(qty).toHaveText('1');
    await expect.poll(totalOf).toBeCloseTo(totalAt2 / 2, 0);
  });

  test('cart persists across a reload and can be emptied', async ({ page }) => {
    await openBuyableProduct(page);
    await page.locator('.pd-order-buy button.btn-malaya').click();
    await goto(page, '/order');
    await expect(page.locator('.order-table tbody tr')).toHaveCount(1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.order-table tbody tr')).toHaveCount(1);

    await page.locator('.order-table .hdr-cart-x').click();
    await expect(page.locator('.order-empty')).toContainText('Your order is empty.');
    await expect(page.locator('.hdr-cart-count').first()).toHaveText('0');
  });

  test('checkout hands off to WhatsApp with the actual order in the message', async ({ page }) => {
    const name = await openBuyableProduct(page);
    await page.locator('.pd-order-buy button.btn-malaya').click();
    await goto(page, '/order');
    const checkout = page.getByRole('link', { name: /checkout via whatsapp/i });
    await expect(checkout).toHaveAttribute('href', /api\.whatsapp\.com/);
    await expect(checkout).toHaveAttribute('target', '_blank');
    // The prefilled text must carry the order itself — item, quantity and
    // total — not just a greeting (the studio confirms from this message).
    const href = await checkout.getAttribute('href');
    const text = decodeURIComponent(new URL(href).searchParams.get('text') || '');
    expect(text).toContain(name);
    expect(text).toMatch(/× 1/);
    expect(text).toMatch(/Total:/);
  });

  test('a chosen ring size travels into the cart line and checkout message', async ({ page }) => {
    // p009 is a ring (see .claude/skills/verify/SKILL.md): the size dropdown
    // must put the size on the cart line, keep a second size as its own line,
    // and carry both into the WhatsApp text.
    await goto(page, '/product/p009');
    const select = page.locator('.pd-size-select');
    await expect(select).toBeVisible();
    await select.selectOption('54');
    await page.locator('.pd-order-buy button.btn-malaya').click();
    await select.selectOption('56');
    await page.locator('.pd-order-buy button.btn-malaya').click();

    await goto(page, '/order');
    await expect(page.locator('.order-table tbody tr')).toHaveCount(2);
    await expect(page.locator('.order-table')).toContainText('Ring size 54');
    await expect(page.locator('.order-table')).toContainText('Ring size 56');
    const href = await page.getByRole('link', { name: /checkout via whatsapp/i }).getAttribute('href');
    const text = decodeURIComponent(new URL(href).searchParams.get('text') || '');
    expect(text).toContain('size 54 EU');
    expect(text).toContain('size 56 EU');
  });

  // The sold-out regression (ordering disabled for "Sold out" stock) is
  // covered by the admin↔storefront inventory-sync suite, which can control
  // an item's stock state end-to-end (e2e/inventory-sync.spec.js).
});
