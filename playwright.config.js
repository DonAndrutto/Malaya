// Playwright E2E configuration.
//
// Local:  npx playwright test          (starts `npm run dev` automatically)
// CI:     BASE_URL=<deployment> npx playwright test
//         (.github/workflows/e2e.yml points BASE_URL at the Vercel Preview
//          Deployment for every pushed commit)
//
// Optional env (see .env.example):
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — enables the signed-in admin suite
//   E2E_ALLOW_WRITES=1                   — enables the admin↔storefront
//                                          inventory-sync test (writes to and
//                                          restores one product's sale price)
//   E2E_TEST_ITEM_ID                     — product used by the sync test (p001)

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Escape hatch for environments with a system-provided Chromium instead of
// the Playwright-managed download (e.g. sandboxed CI images).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
    {
      // The buying journey must also work on phones (most WhatsApp customers).
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], launchOptions },
      testMatch: /(storefront|cart)\.spec\.js/,
    },
  ],
  // When BASE_URL isn't provided, run against a local dev server.
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
