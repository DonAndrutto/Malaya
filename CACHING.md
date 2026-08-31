# Caching, revalidation and Vercel resource use

Why the storefront costs what it costs on Vercel Hobby, what was changed, and
what is left. Companion to `FIREBASE.md` (data model), `EXPLORE.md`
(Explore architecture) and `IMAGES.md` (why the image optimizer is off).

---

## 1. The two-layer model

The storefront has **two independent freshness mechanisms**, and they do
different jobs. Confusing them is how the resource bill got out of hand.

| | Mechanism | Job |
|---|---|---|
| **A** | On-demand invalidation — `lib/revalidate-ping.js` → `POST /api/revalidate` → `revalidateTag` / `revalidatePath` | **Publishing.** An admin write lands in Firestore, Firestore ACKs it, the admin pings the storefront, the affected caches are dropped. The change is live on the next request. |
| **B** | Time-based ISR (`REVALIDATE_SECONDS`) | **Self-healing.** Only matters when (A) never fired — admin closed the tab mid-flight, offline, endpoint 5xx. |

(A) is the publishing path. (B) is a backstop. It was set to **300 seconds**,
which meant every crawled route re-rendered and rewrote its ISR entry up to
**288×/day** to discover that nothing had changed. That, not visitor traffic,
is what pushed the Hobby ISR-write allowance past 200,000/month.

It is now **86,400 seconds (24h)**, defined once in
`lib/server/firestore.js` as `REVALIDATE_SECONDS`.

Route segment config (`export const revalidate = …`) must be a statically
analysable literal in Next 14, so those routes cannot import the constant.
`lib/server/cache-policy.test.js` pins every literal in `app/` to it instead,
so the two cannot drift.

---

## 2. Route → cache → invalidation map

Cache tags below are the real ones, read out of `.next/server/app/*.meta`
after a build (`x-next-cache-tags`), not inferred.

Next stamps **every tag touched while rendering a route** onto that route's
cache entry. Because `app/(store)/layout.jsx` reads catalogue overrides, site
settings, blog posts and Explore data on every route, every storefront route
ends up carrying `site-data`, `blog` *and* `explore`. That single fact
explains the whole invalidation picture.

| Route | Build | Cached? | Effective TTL | Purged by |
|---|---|---|---|---|
| `/` | Static | yes | 86400 | `site` · `blog` · `explore` |
| `/about` `/contact` `/order` `/tashi` `/blog` `/explore` | Static | yes | 86400 | `site` · `blog` · `explore` |
| `/policy/[slug]` | **SSG** (4 params) | yes | 86400 | `site` · `blog` · `explore` |
| `/sitemap.xml` | Static route | yes | 86400 | see §4 caveat |
| `/robots.txt` | Static route | yes | never (no data) | `revalidatePath('/', 'layout')` only |
| `/admin` | Static | yes | never (no data) | `revalidatePath('/', 'layout')` only |
| **`/product/[id]`** | **Dynamic** | **no** | — | n/a — rendered fresh every request |
| **`/blog/[slug]`** | **Dynamic** | **no** | — | n/a |
| **`/explore/[group]`** | **Dynamic** | **no** | — | n/a |
| **`/explore/topic/[slug]`** | **Dynamic** | **no** | — | n/a |
| `/api/revalidate` | Route handler | no | — | n/a |

Data sources:

| Reader | Layer | TTL | Tag |
|---|---|---|---|
| `fetchDoc` / `fetchCollection` | Next fetch data cache | `REVALIDATE_SECONDS` | caller's (`site-data`, `blog`, `explore`) |
| `fetchPublishedBlogPosts` | `unstable_cache` (POST bypasses the fetch cache) | `REVALIDATE_SECONDS` | `blog` |
| `fetchPublishedGroups` / `fetchPublishedTopicSummaries` | `unstable_cache` | `REVALIDATE_SECONDS` | `explore` |
| `fetchTopic` | `fetchDoc` | `REVALIDATE_SECONDS` | `explore` |

Everything above is additionally wrapped in React's `cache()` for
**per-request** memoisation — see §6.

### Admin scopes

| Scope | Pinged from | Purges |
|---|---|---|
| `blog` | `lib/blog.js` | tag `blog`, `/blog`, `/blog/[slug]`, `/sitemap.xml` |
| `explore` | `lib/explore.js` | tag `explore`, `/explore`, `/explore/[group]`, `/explore/topic/[slug]`, `/sitemap.xml` |
| `site` | `lib/overrides.js`, `lib/site-settings.js`, `lib/site-content.js` | tag `site-data`, **`revalidatePath('/', 'layout')`** |

---

## 3. Verified behaviour

Against a production build of `next@14.2.35` (`next build && next start`):

```
GET /                            s-maxage=86400   (was s-maxage=300)
GET /explore, /blog, /tashi …    s-maxage=86400
GET /policy/privacy              s-maxage=86400, x-nextjs-cache: HIT  (was uncached)
GET /product/<id>                private, no-cache, no-store          (unchanged — see §4)

revalidateTag('site-data')  → /, /about, /blog, /explore, /tashi, /policy/* all MISS on
                              the next request, i.e. an admin catalogue or site-copy edit
                              still republishes every affected route immediately.
revalidateTag('blog')       → /blog and / MISS.
revalidateTag('explore')    → /explore and / MISS.
revalidatePath('/','layout')→ every route MISS, /admin included.
```

Product / blog / topic JSON-LD, canonical URLs and `<title>` are still
server-rendered, and no page emits a `/_next/image` URL (images continue to be
served straight from Firebase Storage — `IMAGES.md`).

---

## 4. Known limitations

**Dynamic routes are not cached at all.** `/product/[id]`, `/blog/[slug]`,
`/explore/[group]` and `/explore/topic/[slug]` have no `generateStaticParams`,
and in Next 14 a dynamic segment without it never enters the prerender
manifest — so it is rendered on the server for *every single request* and sent
with `Cache-Control: private, no-cache, no-store`. Their `export const
revalidate` currently has no effect on the routes themselves; it only bounds
their data reads.

That is ~290 product pages plus every blog post and Explore topic re-rendering
per crawler hit, and it is the dominant remaining consumer of **Fluid Active
CPU** — not ISR writes, of which it generates none.

The fix is one line per route:

```js
export function generateStaticParams() { return []; }
```

An empty array prerenders nothing at build time but marks the route
cacheable — requests render on demand and the result is stored (this is
exactly what `/policy/[slug]` now does, verified above).

**It is deliberately not applied yet**, because it converts CPU into ISR
writes and the size of that conversion depends on crawler behaviour that can
only be measured in production: every one of those ~290 pages carries the
`site-data` tag, so each `site` purge makes all of them rewritable. Worst case
is `pages × purges/day` writes. Apply it *after* the ISR-write graph has
settled at its new baseline, ideally together with the §5 narrowing, and watch
the write count for a day.

**Metadata routes ignore cache tags when self-hosted.** Next 14's built-in
filesystem cache handler only tests tags for cache entries of kind `PAGE` and
`FETCH`, never `ROUTE`. So under `next start`, neither `revalidateTag` nor
`revalidatePath('/sitemap.xml')` drops a cached `sitemap.xml`; only the TTL
does. Vercel ships its own cache handler, so this may not apply in production,
but assume a worst case of one day for a new URL to reach the sitemap. It is
linked from the storefront immediately regardless, and search engines refetch
sitemaps roughly daily.

---

## 5. Stage 2 — narrowing the blast radius (proposed, not implemented)

Today a single price edit drops **every** storefront route out of cache,
including every blog article and every Explore topic. Two causes, in order of
importance:

1. **`app/(store)/layout.jsx` reads everything.** `getServerLayoutData()`
   loads catalogue overrides, site settings, site content, blog posts, Explore
   groups and Explore topic summaries, and hands them all to
   `StoreLayoutClient` as the seed for its live Firestore subscriptions. Every
   route therefore depends on every mutable collection.
2. **`revalidatePath('/', 'layout')` in the `site` scope.** This resolves to
   the implicit tag `_N_T_/layout`, which *every* app route derives — the
   widest purge Next offers.

Note that (2) is **near-redundant given (1)**: `revalidateTag('site-data')`
alone already purges every route the store layout wraps, plus the sitemap. The
only entries (2) adds are `/admin` and `/robots.txt`, neither of which reads
site data. Deleting it would be safe and would save two regenerations per
admin save — which is why it is *not* the interesting target. The layout is.

The direction, in dependency order:

1. **Split `getServerLayoutData()` by consumer.** The global chrome
   (`SiteHeader`, `SiteFooter`, `CartNotice`) needs site settings and resolved
   content — not the catalogue, not blog posts, not Explore. Move catalogue
   overrides down to the routes that render products (`/`, `/product/[id]`,
   `/tashi`), blog data to `/blog*`, Explore data to `/explore*`.
2. **Then tags can be meaningful**: `site-settings`, `site-content`,
   `catalogue`, `blog`, `explore` — each purging only the routes that read it.
   `product:<id>` / `blog:<slug>` / `explore-topic:<slug>` are only worth it if
   per-item purging is added on the admin side too; a whole-catalogue tag is
   probably the right granularity for ~290 products.
3. **Then** `generateStaticParams` on the dynamic routes (§4) becomes cheap,
   because a price edit no longer invalidates ~290 product pages plus the blog.

**Constraint that must survive the refactor:** `StoreLayoutClient` seeds its
Firestore subscriptions from these props, and pages read the catalogue through
`SiteDataContext`. Moving a read out of the layout means the *client* context
must still be seeded, or the first paint regresses and hydration diverges from
the server HTML. Client-side live subscriptions are **not** a substitute for
server-rendered HTML where crawlers are concerned: product metadata, JSON-LD,
canonical URLs and the Explore/blog article bodies must stay in the server
response. That is what makes this a real refactor rather than a tag rename,
and why it was not folded into this pass.

---

## 6. CPU notes

- Every server reader (`lib/server/site.js`, `lib/server/explore.js`,
  `fetchPublishedBlogPosts`) is wrapped in React's `cache()`. A product
  request used to resolve the whole catalogue **three** times — once in
  `generateMetadata`, once in the page, once in the layout — re-decoding
  ~290 Firestore documents and re-running `buildSiteData` each time. Next's
  fetch dedupe covers the network hop but not that work; `cache()` collapses
  it to one per request. Cross-request caching (TTL, tags) is unchanged.
- `runPublishedQuery` uses a `select` field mask so listings never pay for
  article bodies (`EXPLORE.md` §3.9).
- Nothing in `app/` is `force-dynamic`, `revalidate = 0`, `fetchCache:
  'force-no-store'` or `cache: 'no-store'` outside `app/api` — asserted by
  `lib/server/cache-policy.test.js`.
- There is no middleware, so no per-request edge invocation.

---

## 7. What to watch on the Vercel usage dashboard

- **ISR Writes** should collapse to roughly `cached routes × 1/day` plus one
  write per route per admin publish. A flat line that does *not* drop within
  ~24h of deploy means on-demand purges are firing far more often than
  expected — check how often the admin saves.
- **Fluid Active CPU** should fall modestly (fewer duplicate decodes, far
  fewer Firestore round trips), not collapse. The big CPU win is still §4.
- **ISR Reads / Edge Requests** should rise slightly as a share, because more
  requests are now served from cache instead of regenerating.
- **Function Invocations** should be roughly unchanged: the uncached dynamic
  routes still invoke per request.
- **Image Optimization** must stay at zero. `images.unoptimized` is on
  purpose (`IMAGES.md`) and `cache-policy.test.js` asserts it.
