# Caching, publishing and resource use

## Current policy (review branch, 15 October 2026)

Next 14.2.35 has two relevant server caches: the Data Cache for Firestore
responses and the Full Route Cache for HTML/RSC. `fetchCollection` already
uses a 24-hour tagged Data Cache. Rendering a detail route does **not** imply
a new ~290-document database read each time. React `cache()` also deduplicates
reader work within a render. The share of production CPU attributable to any
route remains unmeasured.

The normal storefront safety-net TTL remains 86,400 seconds; the sitemap
remains at 3,600 seconds. Publishing uses authenticated on-demand invalidation
after Firestore acknowledges a write. The ping is debounced per scope for
1.2 seconds and is best effort; it can fail, so a successful document save is
not proof that the server cache has already refreshed.

SiteContent now uses local drafts and explicit Save (see EDITOR-SAVING.md).
Typing and reset buttons do not write or purge. Other admin save behavior is
unchanged apart from the scopes below.

## Dependency graph

The shared layout seeds catalogue overrides, site content and image settings
for SSR/hydration. The catalogue is retained intentionally: CartNotice,
header CartDropdown and StoreLayoutClient alias migration need current product
names, prices and aliases on **every** storefront route, including editorial
and legal pages. Removing it blindly would break persistent carts.

Blog and Explore data have moved to `StoreRouteData` / `StoreRouteClient` at
routes that actually use them. Initial props preserve server-rendered content
and hydration; published blog live subscriptions attach only on blog-consuming
routes. Explore continues to use projected summaries, with a single-topic live
subscription for the article itself.

| Route | Extra data above shared catalogue/content/settings |
|---|---|
| Home, product detail, Tashi | Explore summaries/groups (filters and symbol links) |
| Blog index | Blog |
| Blog detail | Blog + Explore (Markdown references) |
| Explore index | Explore (shelves and product search) |
| Explore group | Explore (server-rendered shelf) |
| Explore topic | Blog + Explore (article references and related products) |
| About, contact, order, policies | None |
| Sitemap | Catalogue + blog + Explore; no shared layout |

This intentionally does not eliminate every cross-family invalidation:
Explore edits invalidate product pages that render topic links, and blog edits
invalidate topic pages that resolve blog references. Catalogue edits still
invalidate the storefront because of its shared cart. A future client-only
cart catalogue would require separate freshness/offline/hydration design.

## Invalidation

| Admin scope | Data tag | Explicit paths |
|---|---|---|
| catalogue | catalogue | sitemap |
| content | site-content | none |
| settings | site-settings | none |
| blog | blog | blog index/detail, sitemap |
| explore | explore | Explore index/group/topic, sitemap |
| site (legacy open admin tabs) | old site-data + all three new shared tags | sitemap |

No root-layout path purge remains. `/admin` and `/robots.txt` are not evicted
by a storefront edit. Collection/document tags are the simplest sufficient
scheme; per-item tags are not needed here. Tags naturally invalidate cached
routes that consumed them. Legacy `site` callers remain accepted so an older
open admin tab can publish after this deployment.

Product, blog, Explore group and Explore topic routes return an **empty**
`generateStaticParams` list. This enables first-request generation and caching;
it prebuilds zero detail pages. Existing metadata, canonical URLs, JSON-LD,
soft-not-found behavior, topic rename redirects and sitemap generation stay
intact. Missing/unpublished routes carry the family dependency so publishing
can invalidate a previously cached missing result.

## Evidence and reproduction

Baseline at `5ff52d4` (with the editor-only fix, before cache changes): all four
detail families returned `private, no-cache, no-store` on first and repeated
requests with no `x-nextjs-cache` header. Baseline unit suite: 66 tests passing.

Use the isolated runtime suite:

```sh
npm ci
npm test -- --runInBand
node scripts/cache-test/run.mjs
```

Install Playwright's Chromium if it is unavailable. The runner removes its
own generated `.next` directory, builds in production mode, starts localhost
port 3101, and writes evidence under a new temporary directory. Do not run it
concurrently with `next dev` or another build.

`preload.cjs` is a **test-process-only** fetch adapter, never imported by app
code. It replaces Firestore and auth responses with isolated JSON fixtures;
other external server requests throw. Browser checks block all external URLs.
No test changes production Firestore content or credentials. The runtime test
asserts actual `MISS` → `HIT`, targeted purges and unaffected `HIT` routes,
cached-missing-to-published content, unpublishing, noindex and renamed-topic
308 redirects. Browser checks cover desktop/mobile cart alias merging by ring
size, quantities, prices, missing products, notice persistence through client
navigation, reload, checkout text and absence of hydration errors. Unit tests
cover editor failures/recovery and authenticated scope mapping.

The existing source-policy tests guard declarations; they do not prove caching
at runtime. The fixture suite exercises the real Next production caches, but
not Vercel's distributed cache handler or live Firebase SDK subscriptions.
Read-only preview checks complement it. The legacy write-through E2E suite
is restricted to explicitly isolated runs; a saved CI write flag alone cannot
authorize production Firebase edits from a preview. Signed-in preview saves require an
isolated staging Firebase project; existing previews use the production web
config, so **do not edit production content to test them**.

## Sitemap limitation and resource hypotheses

Next 14's filesystem cache handler historically does not apply tags to cached
metadata ROUTE entries as it does PAGE/FETCH entries. The fixture suite still
observes sitemap HIT after purges; it preserves the one-hour TTL. Vercel has
its own handler, whose targeted sitemap behavior remains unverified here.
New content discovery therefore retains that hourly backstop.

The previous document attributed possible CPU and ISR pressure to crawler
traffic and short TTLs. These remain hypotheses without route-level production
attribution. The supplied Hobby dashboard values (1h47m CPU of 4h, 13K ISR
writes of 200K) are reported snapshots, not a verified exhaustion forecast.
There is no savings guarantee. Measure CPU, invocations, ISR reads/writes and
admin purge frequency separately after any approved release; compare equivalent
traffic windows. Enabling more route entries trades rendering work for ISR
writes, especially after a catalogue edit.

## Review, release and rollback

The branch has separate editor and cache commits. Review the preview and
isolated evidence before deciding on production. No merge, production deploy,
billing/firewall/credential change or Firestore-rule deployment is part of this
work. Confirm a signed-in save on isolated staging data before production.

Before merge: close the PR or discard the review branch/preview. After a future
approved release: revert only the cache commit to keep the editor fix, or revert
both commits in reverse order to restore the old behavior. No data migration is
required. If the released site needs an immediate hosting rollback, restore the
previous verified production deployment through a separately approved Vercel
rollback; that can change auto-assignment behavior, so inspect project state
before subsequent production releases. Keep the legacy scope during rollback.
