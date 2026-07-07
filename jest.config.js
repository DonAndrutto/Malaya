// Unit tests for pure data/logic modules (lib/**). Uses Next's own SWC-based
// Jest transform (next/jest) so `@/` aliases and JSON imports resolve exactly
// as they do in the app, with no separate Babel/webpack config to maintain.
// The storefront's user-facing behaviour is covered by the Playwright e2e
// suite (e2e/, `npm run test:e2e`); this suite is for logic that's awkward to
// assert on through the rendered DOM (e.g. catalogue ordering).
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'node',
  testMatch: ['<rootDir>/lib/**/*.test.js'],
});
