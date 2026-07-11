# Verify — Malaya storefront & admin

How to run and drive this Next.js app to observe changes end-to-end.

## Build & launch

```bash
npm install          # fresh containers have no node_modules
npm run build && npm start          # production on :3000
```

`next dev` and `next start` share `.next/` — never run both at once
(the dev server corrupts what the production server is serving).

## The data source gotcha

`lib/firebase.js` hard-codes the production Firebase web config as
fallbacks, so **every checkout is production-connected**: the server
layout ships real Firestore overrides and the client subscribes live.
Reads are safe; writes are rejected by security rules unless signed in
as an admin. Consequences for verification:

- localStorage injections (`malaya:overrides:v1`, `malaya:blog:v1`)
  are ignored by the storefront while Firebase is enabled
  (`skipCache` subscriptions never emit the local cache).
- To exercise the localStorage path (and the admin desk in demo mode —
  any email/password signs in), temporarily patch `FIREBASE_ENABLED`
  in lib/firebase.js to `false` and run `npx next dev -p 3001`.
  Revert the patch before committing.

## Driving with Playwright

Chromium is pre-installed (`PLAYWRIGHT_BROWSERS_PATH`). ESM scripts
must live inside the repo to resolve `@playwright/test`. The sandbox
proxy hangs/blocks external hosts (Google Fonts, analytics,
firebasestorage returns 403), so `page.goto(..., { waitUntil: 'load' })`
times out — always:

```js
await ctx.route('**/*', (r) => {
  const u = r.request().url();
  if (u.startsWith('http://localhost') || u.startsWith('data:')) return r.continue();
  return r.abort();
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
```

Product images therefore never paint here — use `data:` URIs in
injected overrides when the test needs a real gallery.

## Flows worth driving

- Storefront product page: `/product/p009` (ring), `/product/p086`
  (design with metal variants), `/product/p127` (unique design).
- Admin desk: `/admin` → search → Edit opens the item drawer.
- Mobile checks: context `{ viewport: {width: 390, height: 844},
  isMobile: true, hasTouch: true }`.

## Gotchas found the hard way

- `.hdr-bar` is also `.site-container`; narrow-screen
  `.site-container { padding: 0 14px }` shorthands override equal-
  specificity header padding rules that appear earlier in globals.css.
- A `margin-top` on the first element of a page collapses through the
  wrappers and drags the absolutely-positioned header down — use
  padding on `.malaya-page` instead.
- Unit tests: `npm test` (jest); extension-less imports mean lib
  modules cannot be imported by plain `node`.
