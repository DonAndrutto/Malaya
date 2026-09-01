# Caching, revalidation and Vercel resource use

A decision document, not a description. It separates what was **measured**
from what is **inferred** from what is **deferred**, so the next change to this
system starts from evidence rather than from this file's own conclusions.

Companion to `FIREBASE.md` (data model), `EXPLORE.md` (Explore architecture)
and `IMAGES.md` (why the Vercel image optimizer is off).

---

## 1. The two-layer model

The storefront has two independent freshness mechanisms doing different jobs.
Conflating them is how the resource bill got out of hand.

| | Mechanism | Job |
|---|---|---|
| **A** | On-demand invalidation — `lib/revalidate-ping.js` → `POST /api/revalidate` → `revalidateTag` / `revalidatePath` | **Publishing.** An admin write lands in Firestore, Firestore ACKs, the admin pings the storefront, the affected caches are dropped. The change is live on the next request. |
| **B** | Time-based ISR (`REVALIDATE_SECONDS`) | **Self-healing.** Only matters when (A) never fired — admin offline, tab closed mid-flight, endpoint 5xx. |

(A) is the publishing path. (B) is a backstop, now **86,400s (24h)**, defined
once in `lib/server/firestore.js`.

### How ISR actually expires — request-driven, not cron-driven

This distinction matters for every estimate in this document. A TTL does not
schedule anything. It decides when a cached entry becomes **eligible** for
regeneration; the regeneration — and its ISR write — happens only when a
**request arrives** for an entry that has gone stale. No requests, no writes,
however short the TTL.

So the correct reading of the old setting is: with a 300s TTL, a route became
eligible for regeneration up to 288 times a day, and a route walked regularly
by crawlers could therefore be regenerated on roughly that cadence, writing a
fresh ISR entry each time for content that changes a few times a week. It is
not that 288 daily regenerations were guaranteed — it is that nothing stopped
them, and the observed usage is consistent with them happening.

### Route segment literals

Next 14 requires `export const revalidate` to be a statically analysable
literal, so those routes cannot import the constant.
`lib/server/cache-policy.test.js` pins every literal in `app/` to the policy
instead, with intentional departures listed in an explicit exceptions map — so
a deviation has to be argued, not merely tolerated.

**The one exception is `app/sitemap.js` at 3600s.** See §3.

---

## 2. A — Proven facts

Everything in this section was observed directly, against a production build
of `next@14.2.35` (`next build` + `next start`), or read out of the build
output. Nothing here is inference.

### Before this change

- Every cached storefront route had an **effective ISR TTL of 300s**, from
  `prerender-manifest.json` (`initialRevalidateSeconds: 300`).
- `app/sitemap.js` declared `revalidate = 3600` but its **effective** TTL was
  also **300**, inherited from its data reads. Next takes the *lowest*
  revalidate value seen while rendering a route, so a segment config cannot
  raise a TTL its own fetches have lowered.
- `/policy/[slug]` was rendered on every request and returned
  `Cache-Control: private, no-cache, no-store`.

### The uncached dynamic routes

- `/product/[id]`, `/blog/[slug]`, `/explore/[group]` and
  `/explore/topic/[slug]` have **no `generateStaticParams`**, and are
  consequently **absent from `dynamicRoutes` in `prerender-manifest.json`**.
- They serve `Cache-Control: private, no-cache, no-store, max-age=0,
  must-revalidate` and carry **no `x-nextjs-cache` header at all** — they are
  not in the full route cache, so they are server-rendered per request.
- Their `export const revalidate` therefore does **not** apply to the routes
  themselves. It only bounds their data reads.
- This is unchanged by this PR, deliberately (§4).
- Scale: `sitemap.xml` currently publishes **303 URLs, 289 of them products**.

### After this change

- Every cached route reports `initialRevalidateSeconds: 86400` except
  `/sitemap.xml` at `3600`, and `/robots.txt` + `/admin` at `false` (no data
  dependencies at all).
- `/policy/{privacy,terms,cookie,refund}` are now prerendered (`● SSG` in the
  build output) and serve `s-maxage=86400`, `x-nextjs-cache: HIT`.
- An unknown policy slug (`/policy/anything-else`) still returns **HTTP 200
  with the same soft "not found" body** — `dynamicParams` is at its default,
  so it renders on demand and is then cached. It did **not** become a hard 404.

### Which tags actually invalidate what

Read out of `.next/server/app/*.meta` (`x-next-cache-tags`) after a build —
these are the real tags, not inferred ones. Next stamps **every tag touched
while rendering a route** onto that route's cache entry, and
`app/(store)/layout.jsx` reads catalogue overrides, site settings, site
content, blog posts and Explore data on every route. So every storefront route
carries `site-data`, `blog` **and** `explore`:

```
/           → site-data, blog, explore, _N_T_/layout, _N_T_/(store)/layout, _N_T_/(store)/page, _N_T_/
/about      → site-data, blog, explore, … (same shape)
/sitemap.xml→ site-data, blog, explore, _N_T_/sitemap.xml/route, …
/robots.txt → _N_T_/layout, _N_T_/robots.txt/route, …      (no data tags)
/admin      → _N_T_/layout, _N_T_/admin/page, …            (no data tags)
```

Purges, exercised against the running build:

```
revalidateTag('site-data')   → /, /about, /blog, /explore, /tashi, /policy/* all MISS next request
revalidateTag('blog')        → /blog and / MISS
revalidateTag('explore')     → /explore and / MISS
revalidatePath('/','layout') → every route MISS, /admin included
```

So **admin publishing still works**: a catalogue, site-copy, blog or Explore
edit drops the affected routes on the next request exactly as before.

### Other verified invariants

- `POST /api/revalidate` — 401 unauthenticated, 400 unknown scope, 405 on GET.
- Product / blog / topic `<title>`, canonical URLs and JSON-LD remain
  server-rendered.
- **No page emits a `/_next/image` URL.** Images continue to be served
  straight from Firebase Storage (`images.unoptimized`, see `IMAGES.md`),
  asserted by `lib/server/cache-policy.test.js`.
- Nothing in `app/` outside `app/api` is `force-dynamic`, `revalidate = 0`,
  `fetchCache: 'force-no-store'` or `cache: 'no-store'` — also asserted.
- There is no middleware, so no per-request edge invocation.

### Admin purge frequency (audited, not changed)

Which operations purge, and how often. Debounce lives in
`lib/revalidate-ping.js`: **1200 ms, trailing edge, one timer per scope**,
reset on each call, fire-and-forget, admin token required.

| Save path | Fires on | Scope |
|---|---|---|
| `saveOverrides` — Inventory field commit, publish toggle, bulk adjust, add/delete/merge, Explore↔product links, Sales desk stock deduction | field **blur** / select change / explicit action | `site` |
| `saveSiteSettings` — SiteImages upload complete, focal-point drag **end**, hero config change | discrete action | `site` |
| `saveSiteContent` — SiteContent copy fields | **every keystroke** (`onChange`) | `site` |
| `saveBlogPost` — BlogAdmin `persist` | field blur, publish toggle, explicit Save, cover upload | `blog` |
| `saveTopic` / `saveGroup` — ExploreAdmin `persist`, block edits, membership toggles | field blur, block change, publish toggle, explicit Save | `explore` |

Findings:

- **Bulk operations collapse to one purge.** `applyBulk` loops `commit` over
  every matching row; each resolved write resets the same 1200 ms timer, so a
  200-item reprice produces a single `site` purge, not 200.
- **Most editing is blur-driven**, so a purge costs roughly one per field the
  editor leaves — not one per character.
- **`SiteContent` is the exception: it writes to Firestore on every
  keystroke.** The ping debounce still collapses a continuous typing burst
  into one purge, but every natural pause longer than 1.2s starts a new one.
  A sustained copy-editing session can therefore produce on the order of
  50–150 `site` purges. (The per-keystroke *Firestore* write is a separate
  cost — Firestore's, not Vercel's — and would be worth a blur/debounce fix on
  its own merits. Left alone here: out of scope for a cache change.)
- Scopes are independent timers, so a session touching copy *and* inventory
  runs two purge streams.

**Why that is currently affordable, and the number that matters for §4:** a
`site` purge invalidates roughly **13 cached routes**. Even a pathological
150-purge session has an upper bound of ~1,950 regenerations, and only if
something requests every route between every purge — which will not happen.
If the ~290 dynamic detail routes were made cacheable, that same session's
upper bound becomes ~45,000. That ratio, not any theoretical argument, is why
§4 is deferred until there is production data.

---

## 3. Why the sitemap is an intentional exception

`app/sitemap.js` is set to **3600s**, not 86400s, and
`lib/server/cache-policy.test.js` encodes that in `REVALIDATE_EXCEPTIONS` so
it reads as a decision rather than drift.

**Proven:** Next 14's built-in filesystem cache handler checks cache tags only
for entries of kind `PAGE` and `FETCH`, never `ROUTE`
(`node_modules/next/dist/server/lib/incremental-cache/file-system-cache.js`).
Verified behaviourally: with the sitemap cached, `revalidateTag('site-data')`,
`revalidatePath('/sitemap.xml')`, `…('/sitemap.xml','page')`,
`…('/sitemap.xml','layout')` and `revalidatePath('/','layout')` all left it a
`HIT`. `/` went `MISS` under the same calls.

**Unknown:** Vercel ships its own cache handler, so the on-demand purges in
`app/api/revalidate` may well work in production. That is not something to
stake content discovery on.

**Decision:** a 1-hour floor means a newly published product, post or topic
reaches the sitemap within the hour regardless of whether the metadata-route
purge works. The cost is ~24 regenerations/day ≈ **720/month** against a
200,000/month allowance — under 1% even if a regeneration bills several write
units. Everything else keeps the 24h safety net.

---

## 4. B — Strong hypotheses (not proven)

Flagged as hypotheses on purpose. Each one is stated with what would confirm
it, because acting on an unconfirmed hypothesis is how the current situation
arose.

### H1 — Crawler-driven regeneration caused the ISR-write overrun

The site does not have the human traffic to explain ~200,000 writes/month, the
old effective TTL was 300s on every cached route, and ISR regeneration is
triggered by requests against stale entries. Repeated crawler traffic against
a short TTL fits the observed usage.

*Not proven:* there is no per-route write attribution from the Vercel
dashboard here, and the contribution of admin-triggered purges (§2) versus
TTL expiry has not been separated.

*Confirmed by:* ISR Writes collapsing after this deploy. If they do not, the
purge frequency in §2 is the next suspect, not the TTL.

### H2 — The uncached dynamic routes are a substantial CPU consumer

`/product/[id]`, `/blog/[slug]`, `/explore/[group]` and
`/explore/topic/[slug]` execute a server render on **every** request — that
part is proven (§2) — and the product route alone covers 289 crawler-visible
URLs. They are therefore the **leading remaining hypothesis** for Fluid Active
CPU: a large URL population with no cache in front of it.

*Not proven:* the build proves these routes are dynamic. It does **not**
establish what share of Fluid Active CPU they consume. There is no production
resource attribution here, and per-render cost has not been profiled.

*Confirmed by:* Fluid Active CPU staying high after this deploy while ISR
Writes fall (CASE A in §6). If CPU falls sharply too (CASE C), the duplicated
per-request data work removed in this PR was a larger component than assumed
and H2 is weaker than it looks.

---

## 5. C — Deferred experiments

Documented, deliberately not implemented. In dependency order.

### D1 — Make the dynamic detail routes cacheable

One line per route:

```js
export function generateStaticParams() { return []; }
```

An empty array prerenders nothing at build time but marks the route
cacheable — requests render on demand and the result is stored. This is
exactly what `/policy/[slug]` now does, and its `● SSG` build classification
plus `x-nextjs-cache: HIT` confirm the mechanism works.

**Why deferred.** It converts CPU into persisted ISR entries. Under the
current layout architecture every one of those ~290 routes would inherit the
`site-data`, `blog` and `explore` tags, so a single catalogue or copy edit
would invalidate the whole population and crawlers would repopulate it. The
upper bound moves from ~13 regenerations per purge to ~303 (§2). Having just
exceeded the ISR-write quota, trading a measured problem for an unmeasured one
is the wrong order of operations.

**Preconditions:** a settled post-deploy ISR-write baseline (§6), a known
admin purge rate, and preferably D2 first.

### D2 — Split the global layout cache-dependency graph

The root cause of the wide blast radius:

```
app/(store)/layout.jsx
  → getServerLayoutData()
      → catalogue overrides + site settings + site content + blog + Explore
          → every storefront route inherits every one of those cache dependencies
```

Direction: the global chrome (`SiteHeader`, `SiteFooter`, `CartNotice`) needs
site settings and resolved content — not the catalogue, not blog posts, not
Explore. Move catalogue overrides down to the routes that render products
(`/`, `/product/[id]`, `/tashi`), blog data to `/blog*`, Explore data to
`/explore*`.

**Constraint that must survive it:** `StoreLayoutClient` seeds its Firestore
subscriptions from these props, and pages read the catalogue through
`SiteDataContext`. Moving a read out of the layout means the client context
must still be seeded, or first paint regresses and hydration diverges from the
server HTML. Client-side live subscriptions are **not** a substitute for
server-rendered HTML where crawlers are concerned: product metadata, JSON-LD,
canonical URLs and article bodies must stay in the server response. That is
what makes this a real refactor rather than a tag rename.

### D3 — Granular tags

Only meaningful after D2: `site-settings`, `site-content`, `catalogue`,
`blog`, `explore`, each purging only the routes that read it. Per-item tags
(`product:<id>`, `blog:<slug>`, `explore-topic:<slug>`) are worth it only if
per-item purging is added on the admin side too; a whole-catalogue tag is
probably the right granularity for ~290 products.

### D4 — Remove the broad `revalidatePath('/', 'layout')`

Kept for now. Worth knowing that it is **near-redundant**:
`revalidateTag('site-data')` already purges everything the store layout wraps
plus the sitemap; the extra call only adds `/admin` and `/robots.txt`, neither
of which reads site data. Deleting it would save two regenerations per admin
save and fix nothing structural. The breadth comes from D2, not from this
line — which is exactly why this is the *last* item, not the first.

---

## 6. Post-deployment measurement plan

**Change nothing architectural in this area for ~72 hours after deploy**,
unless there is a correctness regression. The point of the wait is to get a
clean baseline; another change on top makes both unreadable.

Watch these five independently in the Vercel usage dashboard:

1. ISR Writes
2. Fluid Active CPU
3. Function Invocations
4. ISR Reads
5. Image Optimization transformations

### Interpretation

**CASE A — ISR Writes collapse, Fluid CPU stays high.**
Stage 1 fixed the ISR problem and H1 is confirmed. Dynamic route rendering
becomes the leading CPU target; D1 (with D2) becomes the next experiment.

**CASE B — ISR Writes stay unexpectedly high.**
Do **not** proceed to D1. Investigate on-demand purge frequency first: the
admin may be saving far more often than §2 assumes, in which case the
remaining writes are purge-driven, not TTL-driven, and D1 would multiply them
by ~23×. Instrument or observe admin sessions before changing caching again.

**CASE C — Fluid CPU also falls sharply.**
Repeated per-request server/data work was a larger component than expected and
H2 is weaker than it looks. Reassess whether Stage 2 is needed at all before
spending the risk budget on it.

**CASE D — Admin edits do not appear immediately.**
Treat as a correctness regression, not a tuning problem. Debug the on-demand
purge flow: check that the ping fires (network tab on save), that the token is
accepted (401s), and that the scope matches the content. **Do not compensate
by shortening the global TTL back to five minutes** — that reintroduces the
original problem while leaving the actual bug in place.

### Expected shape

- **ISR Writes** — should fall to roughly `cached routes × 1/day` plus one
  write per route per admin publish, plus ~24/day for the sitemap.
- **Fluid Active CPU** — a modest fall (duplicate decodes removed, Firestore
  round trips down from every 5 minutes to once a day, four fewer dynamic
  routes). Not a collapse; see H2.
- **ISR Reads / Edge Requests** — rise slightly as a share, as more requests
  are served from cache instead of regenerating.
- **Function Invocations** — roughly unchanged; the uncached dynamic routes
  still invoke per request.
- **Image Optimization** — must stay at zero.

---

## 7. Per-request memoisation (CPU)

Every server reader — `lib/server/site.js`, `lib/server/explore.js`,
`fetchPublishedBlogPosts`, and `getPost` in the blog route — is wrapped in
React's `cache()`.

A product request asks for the resolved catalogue three times:
`generateMetadata`, the page component, and the layout's own read. Next's
fetch dedupe covers the network hop, but each caller still paid for
deserialising the whole `catalogueOverrides` collection and re-running
`buildSiteData` over ~290 products. `cache()` collapses that to once per
request.

Safety properties, checked deliberately:

- **No user- or session-specific data is memoised.** Every wrapped reader is a
  public Firestore read governed by the public security rules; none touches
  `cookies()`, `headers()` or auth state.
- **Arguments are stable and primitive** — either no arguments, or a single
  slug string.
- **No cross-request leakage.** React's `cache` scope is per request; entries
  do not outlive it.
- **Tags and Data Cache behaviour are unchanged.** `cache()` wraps *outside*
  `unstable_cache` / the tagged fetches, so the first call within a request
  still registers the same tags and TTL; subsequent calls would have
  registered identical ones. Confirmed by the post-change `.meta` files, which
  carry the same `site-data,blog,explore` tag sets as before.
