# Review notes — 15 October 2026

## Scope

Fresh clone of DonAndrutto/Malaya on `codex/site-content-cache-review`. The
older clean Mac checkout at `~/Claude/Malaya` was not changed. Remote main and
Vercel production were rechecked at `5ff52d4d9f5eecb66789209110ef7625a3d346a7`.
Production deployment: `dpl_3N5JKXjLNtF4DGbPdEBN22pBRC21`.

The first commit fixes SiteContent drafts/saving. The second splits editorial
cache dependencies and invalidation, enables on-demand detail caching, adds
cart regressions and documents the policy. A follow-up guards product order
controls until hydration, fixing early clicks/size selections dropped during
slower preview navigation. No data migration, production write,
credential/rule/billing/firewall change, merge or production deployment.

## Validation

- Baseline: 66 existing unit tests, lint and isolated production build passed.
  All four detail families returned no-store on cold and warm requests.
- Editor: 7 new interaction/save tests pass for normal edits, no typing writes,
  pending acknowledgement, rejected writes/retry, reset, remote snapshots,
  interrupted editing, recovery and discard.
- Final unit suite: 81 tests in 8 suites pass.
- Final lint passes with pre-existing font/image warnings only.
- Real Next 14.2.35 production build/runtime with isolated fetch adapter:
  four detail families MISS then HIT; actual HTML body/title/canonical/JSON-LD
  verified; auth 401/unknown scope 400; targeted invalidation and unaffected
  cache hits; publish/unpublish/noindex; topic rename 308; sitemap and catalogue
  redirect preserved. All four detail families appear in the dynamic cache
  manifest with empty prebuild lists.
- Desktop and 390px mobile browser checks: cart alias migration combines same
  size quantities without combining different sizes; current names/prices,
  missing-product removal support, notice across client navigation, reload,
  chosen size and WhatsApp checkout text; no hydration errors.
- Existing Playwright cart/SEO suite plus the new cross-route cart regression:
  19 tests pass (desktop + mobile cart, desktop SEO/security).

Run `node scripts/cache-test/run.mjs` to reproduce the isolated build, actual
cache checks, browser checks and Playwright suite. Server external requests are
replaced/blocked; browser external requests are blocked. No app test-mode bypass
is shipped. See CACHING.md and EDITOR-SAVING.md for design and limitations.

## Limits before production approval

Catalogue remains a shared server dependency because the header basket,
CartNotice and cart alias migration use it on all store routes. Catalogue,
settings and copy edits therefore still invalidate shared storefront HTML.
Blog/Explore purges are narrower; product symbol links and Markdown references
retain necessary cross-family dependencies. No measured CPU savings claim.

Tests use the real local Next cache handler with isolated data, not Vercel's
distributed handler or a live Firebase write. The sitemap's 1-hour backstop is
preserved because local tag purges do not evict the metadata-route cache.
Preview Firebase defaults point at production: inspect previews read-only.
The write-through E2E suite now additionally requires an isolated run, so an
existing CI write flag cannot silently edit production through the preview.
A signed-in save against isolated staging Firebase data remains a release gate.
Draft recovery requires sessionStorage and browser unload prompts are subject
to browser policy. Same-field multi-editor saves remain last-write-wins.

## Rollback

Before merge, close the PR/discard its preview. After a separately approved
release, revert the cache commit to retain the editor fix, or revert cache then
editor to return to the baseline. No Firestore schema/data rollback is needed.
An emergency hosting rollback to the deployment above requires separate
production approval; inspect Vercel auto-assignment afterward. No rollback was
executed as part of this task.
