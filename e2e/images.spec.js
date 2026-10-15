// These are real delivery checks: never block Storage and never substitute
// fixture/data URLs. An <img> with a box but zero decoded pixels must fail.
import { test, expect } from '@playwright/test';
import { goto, gotoHome } from './helpers';

async function decoded(img) {
  await img.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((node) => ({ complete: node.complete, decoded: node.naturalWidth > 0 && node.naturalHeight > 0 })), {
    message: 'Image must finish loading and contain decoded pixels; check DNS/network/HTTP failures',
  }).toEqual({ complete: true, decoded: true });
}

function captureImages(page) {
  const responses = new Map();
  page.on('response', (response) => {
    if (response.request().resourceType() === 'image') responses.set(response.url(), response);
  });
  return responses;
}

function delivered(responses, src) {
  const response = responses.get(src);
  expect(response, `No image response for ${src}`).toBeTruthy();
  expect(response.status(), src).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\//);
  return response;
}

test.describe('Image delivery', () => {
  const diagnostics = new WeakMap();
  test.beforeEach(async ({ page }) => {
    const events = [];
    diagnostics.set(page, events);
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'image') events.push({ url: request.url(), error: request.failure()?.errorText });
    });
    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) events.push({ url: response.url(), status: response.status() });
    });
    page.on('console', (message) => { if (message.type() === 'error') events.push({ console: message.text() }); });
  });
  test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await info.attach('image-network-errors', {
      body: JSON.stringify(diagnostics.get(page), null, 2), contentType: 'application/json',
    });
  });
  test('visible catalogue photos decode from direct Storage responses', async ({ page }, info) => {
    const responses = captureImages(page);
    await gotoHome(page);
    const img = page.locator('.pcard-thumb img:not(.pcard-alt)').first();
    await decoded(img);
    await expect(img).toHaveAttribute('src', /firebasestorage\.googleapis\.com/);
    await expect(img).toHaveAttribute('loading', 'lazy');
    const src = await img.getAttribute('src');
    expect(src).not.toContain('/_next/image');
    const response = delivered(responses, src);
    expect(response.headers()['cache-control']).toMatch(/immutable/);
    await page.screenshot({ path: info.outputPath('catalogue-loaded.png') });
  });

  test('product hero decodes and is prioritized for LCP', async ({ page }, info) => {
    const responses = captureImages(page);
    await goto(page, '/product/p009');
    const hero = page.locator('.pd-photo img').first();
    await decoded(hero);
    await expect(hero).not.toHaveAttribute('loading', 'lazy');
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
    delivered(responses, await hero.getAttribute('src'));
    await page.screenshot({ path: info.outputPath('product-loaded.png') });
  });

  test('shared image settings reach the hero background and logo', async ({ page }, info) => {
    const responses = captureImages(page);
    await gotoHome(page);
    const logo = page.locator('.hero-logo').first();
    await decoded(logo);
    delivered(responses, await logo.getAttribute('src'));
    const background = await page.locator('.hero-slide-img').first().evaluate((node) => getComputedStyle(node).backgroundImage);
    const src = background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    expect(src, 'Hero setting must produce an image URL').toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    const size = await page.evaluate(async (url) => {
      const image = new Image(); image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, src);
    expect(size.width).toBeGreaterThan(0); expect(size.height).toBeGreaterThan(0);
    delivered(responses, src);
    await page.locator('.hero-slide-img').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('hero-loaded.png') });
  });
});
