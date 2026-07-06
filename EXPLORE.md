# Explore — architecture & data-model proposal

*A parallel editorial system for Bhutanese & Vajrayana symbolism — a digital catalogue raisonné where knowledge lives alongside commerce.*

**Status: APPROVED & IMPLEMENTED (Phase 2).** Approved with one amendment: the
29 seed topics ship as **drafts** (`published: false`) so no thin placeholder
pages get indexed — the studio publishes each topic from /admin → Explore once
real content is ready (Part III's SEO note (c), resolved). Everything else
landed as proposed. Seed with `npm run seed-explore`; deploy rules first
(`firebase deploy --only firestore:rules`).

---

## Part I — Phase 0 report: the codebase as it stands

### Stack

| Layer | What's actually there |
|---|---|
| Framework | **Next.js 14.2 (App Router)**, plain JavaScript/JSX (no TypeScript), React 18 |
| Hosting | Vercel (`vercel.json`), ISR everywhere (`revalidate = 300`), Vercel image optimizer (AVIF/WebP) |
| Data / CMS | **Firebase**: Firestore (content), Storage (images), Auth (admin sign-in). There is **no external CMS** — the repo ships its own bespoke admin console at `/admin` |
| Styling | One global stylesheet (`app/globals.css`) scoped under `.malaya-site`; palette brown `#3B231A` / gold `#b08d57`; Poppins body, Raleway headings. The admin styles itself inline from `components/admin/theme.js` |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-slug`, plus a custom Obsidian-style `[[wiki link]]` resolver (`lib/wiki-links.js`) that already links to products, posts and pages |
| Testing | Playwright e2e suite (`e2e/*.spec.js`) + preview-deployment CI (`.github/workflows/e2e.yml`) |

### How data flows (the pattern everything follows)

The site has a distinctive, consistent three-way data access pattern that Explore must respect:

1. **Client, live** — the browser subscribes to Firestore with `onSnapshot`, backed by a localStorage cache for instant first paint and offline resilience (`lib/overrides.js`, `lib/blog.js`, `lib/site-settings.js`, `lib/site-content.js`).
2. **Server, ISR** — layouts, `generateMetadata`, JSON-LD and the sitemap read the *same public documents* over the Firestore REST API with Next's fetch cache (`lib/server/firestore.js`), so crawlers get real content in the HTML. Every read fails soft.
3. **Scripts, Admin SDK** — seed/import scripts (`scripts/*.mjs`) bypass the security rules with a service account.

### How products work

Products are **not** a database table. They are a resolved merge:

- Static base data in the repo: `lib/data/products.js` (127 catalogue items), `SITE_EXTRA` (live-site extras) in `lib/data/site-data.js`, and the stock ledger `lib/data/stock-ledger.json`.
- A Firestore override layer: `catalogueOverrides/{id}` — one doc of partial edits per item (name, prices, `images[]`, `story`, `specials[]`, `published`, `mergedInto`, …).
- `buildSiteData(overrides)` (in `lib/data/site-data.js`) runs identically on server and client and produces `SITE_PRODUCTS` / `SITE_BY_ID`, handed to every page through `SiteDataContext`.

A resolved product already carries: `id, name, sub, category, collection, material, stock, price/listPrice/salePrice, images[], story, specials[] (incl. 'tashi'), salesCode, productionCode`.

**Critical constraint:** `firebase/firestore.rules` validates override docs with `keys().hasOnly([...])` — *any new product field requires a rules change and redeploy* (`firebase deploy --only firestore:rules`).

### Routing map (today)

| Route | What it is |
|---|---|
| `/` | Home = hero slideshow + **the entire catalogue** as one category-grouped scroll (`CatalogueScroll` in `SitePages.jsx`) |
| `/product/[id]` | Product detail. ISR + `generateMetadata` + Product/Breadcrumb JSON-LD; alias/sales-code ids canonicalise to the master id |
| `/tashi` | Tashi Mannox collaboration page — admin-editable intro copy + a grid of products flagged with the `tashi` special |
| `/blog`, `/blog/[slug]` | Markdown articles from Firestore `blogPosts/{slug}`, server-rendered with JSON-LD |
| `/about`, `/contact`, `/order`, `/policy/[slug]` | Static-ish pages fed by admin-editable content |
| `/admin` | The bespoke console: Inventory, Content, Site images, Blog tabs |
| `/catalogue` | 308 → `/` |

### How the existing filters actually work

There is no faceted filter panel. The catalogue's sticky bar (`.cat-bar`) has exactly three controls:

1. **Category** — a dropdown *jump menu* (scrolls to a section; scroll-spy highlights the current one).
2. **Metal** — a two-button toggle group (`Gold` / `Silver`), filtering via `materialFamilyOf(p.material)` (`lib/data/materials.js`). This is the only true *filter*.
3. **Search** — a typeahead over name/sub/sales-code that jumps to a product page.

The new **Symbol** filter must slot into this bar and behave like the Metal toggle does (stateful filter over `sections`' items) — not like a rebuilt faceted UI.

### Other constraints discovered

- **CSP is strict** (`next.config.mjs`): images only from `self`, `data:`, `blob:` and `firebasestorage.googleapis.com`. All editorial imagery (including floating PNGs) must be uploaded to the studio's Firebase Storage — no third-party hosts.
- **Firestore doc limit is 1 MiB** — relevant to storing content blocks inside a topic doc (analysed in §11).
- **Security rules only allow provable public list reads** — the blog's public list works because the client queries `where('published' == true)` and the rule checks `resource.data.published == true`. Explore collections must copy this pattern exactly.
- The Tashi page is *not* literally static — its copy is admin-editable and its product grid is data-driven (`specials` includes `'tashi'`). "Unchanged" means visually and behaviourally unchanged.
- `lib/wiki-links.js` + the Blog admin's `LinkPicker` are an existing, studio-familiar idiom for embedding product references inside rich text. The Floating Product PNG mechanism should extend this rather than invent a second syntax.
- `scripts/scrape-stories.mjs` shows the house style for standalone content-import tooling (Phase 3 will mirror it).

---

## Part II — Phase 1: information architecture & data model

### 1. Core mental model — everything orbits the Topic

```
                       ┌────────────────────────┐
      curates ────────▶│    KNOWLEDGE TOPIC     │◀──────── points to
      (navigation      │  one canonical page    │          (commerce)
       only)           │  /explore/topic/<slug> │
┌──────────────┐       │                        │       ┌──────────────┐
│    GROUP     │       │  title · hero · blocks │       │   PRODUCT    │
│ (nav shelf)  │──────▶│  ordered content       │◀──────│ topics: []   │
└──────────────┘  N:M  └────────────────────────┘  N:M  └──────────────┘
```

- A **Topic** ("Endless Knot", "Hung", "Vajra") *is* a long-form editorial page. It owns its content, its URL, its metadata. It knows nothing about which shelves display it.
- A **Group** ("Sacred Symbols", "Eight Auspicious Symbols") is a *curated navigation shelf*: a name, a description, and an **ordered list of Topic references**. Groups own nothing; deleting a Group deletes no knowledge.
- A **Product** *points at* Topics (`topics: ['endless-knot']`). Products are evidence of the idea; the Topic is the idea.

Everything else in this proposal — URLs, queries, rendering, the Symbol filter, search, the Tashi block — is derived from these three relationships without duplicating data.

### 2. The multi-parent relationship — where should membership live?

Three candidate shapes, judged against this codebase (Firestore has no joins; the app's idiom is "load small collections whole, join in memory in `buildSiteData`-style resolvers"):

| Shape | Verdict |
|---|---|
| **(a) Join collection** `topicGroupLinks/{id}` | Correct in SQL; wrong here. Firestore can't join, so every page pays an extra collection read, the admin must keep three collections consistent, and security rules multiply. Justified only at cardinalities (10⁴+ links) this catalogue will never reach. **Rejected.** |
| **(b) Topic holds `groups: []`** | Tempting ("the Topic is the centre"), but it puts a *navigation* concern inside the *knowledge* object, and it cannot express **per-group ordering** — "Eight Auspicious Symbols" has a traditional canonical order that is a property of the shelf, not of the Endless Knot. Curating a shelf would mean editing N topic docs. **Rejected.** |
| **(c) Group holds ordered `topicSlugs: []`** ✅ | Membership *and* ordering live in the one object whose entire job is curation. Adding a topic to two shelves = two array entries; the topic doc never changes. One write per curation act. The reverse lookup ("which groups show this topic?") is an in-memory scan of a ~10–20 doc collection that Explore pages load anyway. |

**Recommendation: (c).** This also *sharpens* the brief's assumption rather than challenging it: Groups aren't merely "primarily navigation" — they are **purely** navigation. The cleanest abstraction is that a Group is a *playlist*, and Topics are the *tracks*. A track can sit on many playlists; deleting a playlist never deletes music; the playlist owns its own running order.

Consequences:

- **One canonical page per Topic** falls out structurally — a Topic has exactly one document and one URL regardless of how many Groups reference it.
- **SEO**: group pages render links to `/explore/topic/<slug>`; the topic page's breadcrumb uses a deterministic *primary group* (the first group by `order` that contains the topic). No duplicate content is ever generated because no group-scoped topic URL exists (§4).
- **Query simplicity**: group page = 1 group doc + its topics' summaries; topic page = 1 topic doc + tiny groups collection for the "Part of …" line. No fan-out writes, no join reads.
- **Admin from either side**: the Topic editor still shows "Groups" checkboxes — ticking one writes to the *group* doc (appends the slug). One storage location, two editing surfaces (§10). The same principle is reused for product links (§5).
- **Dangling refs**: deleting/unpublishing a topic leaves a slug in some `topicSlugs` arrays; resolvers drop unknown/unpublished slugs silently (exactly how `HOME_BEST`/`MEGA_FEATURED` already tolerate missing ids), and the admin save path prunes them opportunistically.

### 3. Database / CMS schema

Firebase Firestore is the CMS (see §10 for why we extend it rather than adopt Sanity/Strapi). Two new collections + one new field on the existing override docs. All documents follow the house conventions: doc id = slug, `_updated` timestamp, public read of published docs, admin-only writes validated by rules.

#### 3.1 `exploreTopics/{slug}` — the Knowledge Topic

```js
{
  slug: 'endless-knot',              // == doc id (rule-enforced, like blogPosts)
  title: 'The Endless Knot',
  subtitle: 'Palbeu · དཔལ་བེའུ',      // optional display subtitle (native names)
  excerpt: 'One or two sentences.',  // card text + meta description + search
  aliases: ['Eternal Knot', 'Shrivatsa', 'Palbeu'],  // search & import matching
  heroImage: 'https://firebasestorage…',   // uploaded via existing pipeline
  heroPos: '50% 35%',                // focal point, same convention as imgPos
  blocks: [ /* ordered content blocks — §3.3 */ ],
  published: false,                  // draft until flipped, like blogPosts
  _updated: 1730000000000,
}
```

Notes:
- No `groups` field (§2) and no `products` field (§5) — the Topic stays pure knowledge.
- `excerpt` doubles as the meta description; no separate SEO fields until a real need appears (self-critique §12).
- Placeholder-era topics are just `{slug, title, excerpt, published, blocks: [one richText block]}` — the schema demands nothing more.

#### 3.2 `exploreGroups/{slug}` — the navigation shelf

```js
{
  slug: 'eight-auspicious-symbols',  // == doc id
  name: 'Eight Auspicious Symbols',
  description: 'The Ashtamangala — eight sacred emblems…',
  heroImage: 'https://…',            // optional banner for the listing page
  heroPos: '50% 50%',
  order: 4,                          // position in Explore navigation
  topicSlugs: [                      // MEMBERSHIP + per-shelf ORDER (§2)
    'endless-knot', 'dharma-wheel', 'treasure-vase', 'lotus',
    'conch', 'victory-banner', 'golden-fish', 'parasol',
  ],
  published: true,
  _updated: 1730000000000,
}
```

#### 3.3 Content blocks — the composable page

`blocks` is an ordered array of plain objects, discriminated by `type`. Each entry carries a stable `id` (for React keys and drag-reorder in the admin) and only the props its type needs:

```js
// Common envelope
{ id: 'b-1730000000-x1', type: '<blockType>', ...props }
```

| `type` | Props | Renders as |
|---|---|---|
| `richText` | `md` (Markdown, GFM + `[[wiki links]]` + float embeds §3.6) | Editorial prose via the existing `<Markdown>` pipeline |
| `floatProduct` | `productId`, `side: 'left'\|'right'`, `caption?` | Block-level floating transparent product PNG, clickable → `/product/<id>`; the *inline* variant lives inside `richText` (§3.6) |
| `editorialImage` | `src`, `alt`, `caption?`, `pos?`, `hotspots: [...]` (§3.4) | Full-bleed lifestyle photo with clickable product hotspots |
| `quote` | `text`, `attribution?` | Large serif pull-quote |
| `divider` | `style?: 'rule'\|'knot'` | The existing `.rule-dot` motif / an ornamental variant |
| `productGrid` | `mode: 'linked'\|'manual'`, `ids?: []`, `title?`, `limit?` | Product cards via the existing `<SiteProductCard>`; `linked` auto-fills from §5 |
| `relatedTopics` | `mode: 'auto'\|'manual'`, `slugs?: []`, `title?` | Topic cards; `auto` = siblings from shared groups |
| `callout` | `title?`, `md`, `tone?: 'note'\|'ritual'` | Bordered aside (pronunciation, ritual use, provenance) |
| `architectureGallery` | `items: [{src, caption?, location?}]` | Masonry/scroll gallery of the symbol in Bhutanese architecture |

**Future block types are additive by construction**: the renderer is a registry map `{type → component}` (§9); an unknown `type` renders `null`. Adding "video embed" later = one new component + one registry entry + one admin form — the topic template, the schema, and every existing document are untouched. Old clients meeting new block types degrade silently instead of crashing.

**Why blocks live inside the topic doc** (not a subcollection): one read renders the whole page (server and client); ordering is the array order (no `orderBy` bookkeeping); the localStorage-cache pattern works unchanged. The 1 MiB doc cap is analysed in §12 — text-only blocks with image *URLs* put even a lavish article at ~50–100 KB.

#### 3.4 Editorial-image hotspots

Stored as JSON on the `editorialImage` block, coordinates as **fractions of the rendered image** (resolution-independent, responsive for free):

```js
hotspots: [
  { x: 0.62, y: 0.41, productId: 'p016', label: 'Endless Knot pendant, 18k' },
  { x: 0.31, y: 0.70, productId: 'P045-YGP' },   // sales codes resolve via SITE_BY_ID
]
```

The brief asks for hotspots to be "reusable". Two options were weighed:

- **Inline on the block (recommended for v1)** — the admin uploads a photo and drags hotspots in the same editor breath; no indirection, no extra reads, no orphaned asset docs. Re-using an annotated image across topics is expected to be rare in practice.
- *Shared `exploreAssets/{id}` collection* — one edit point if the same annotated photo appears in many topics, at the cost of a second admin surface and per-block fetches. **Deferred**: if reuse emerges, a migration is mechanical (extract block → asset doc, block keeps `assetId`), and the block envelope already tolerates the new shape.

#### 3.5 Product → Topic link (one new field)

```js
// catalogueOverrides/{productId}  — existing doc, ONE new field:
{ …existing fields…, topics: ['endless-knot', 'dharma-wheel'] }
```

- `firestore.rules`: add `'topics'` to `validOverride`'s `hasOnly` list + `optList(d, 'topics', 20)`.
- `lib/data/resolve.js`: resolved products gain `topics: o.topics || []` (one line; zero effect on any existing surface).
- This is the **single source of truth** for the product–topic relationship — §5 shows both directions derived from it, §6 drives the filter from it, §7 drives the Tashi block from it.

#### 3.6 Floating Product PNG — the rich-text embed

**Mechanism**: extend the existing wiki-link grammar (the studio already writes `[[product: P045-YGP]]` in blog posts) with a float directive:

```
![[float: P045-YGP | right]]
![[float: p016 | left | Endless Knot pendant in 18k white gold]]
```

`lib/wiki-links.js` currently rewrites `![[…]]` embeds; the `float:` form resolves the product (id / sales code / name — the resolver already matches all three), and the Markdown component renders it as a dedicated `<FloatingProduct>` element: transparent product image (the product's own `images[0]` — **no duplicate image upload; the PNG is the product's existing photo**), floated with text wrap, fully wrapped in a `<Link href="/product/…">`. An explicit image override (`![[float: p016 | right | src=https://firebasestorage…]]`) is supported for cut-out PNGs uploaded specifically for editorial use.

**Editor approach**: the Blog admin's `LinkPicker` pattern, extended — an "Insert floating product" button opens the same product search, writes the shortcode at the cursor, and the split-pane live preview shows the real float immediately. One grammar, one picker, one renderer for blog *and* Explore. Unresolvable embeds degrade to nothing (never a broken image), matching current wiki-link behaviour.

#### 3.7 Auxiliary models

None. Gallery items are props of their block; hotspots are props of theirs. Every model that could exist as a collection was tested against "does anything query it independently?" — nothing does, so nothing gets one.

#### 3.8 Firestore security rules (delta)

```
// firestore.rules — additions (same idioms as blogPosts)

function validTopic(d, slug) {
  return d.keys().hasOnly(['slug','title','subtitle','excerpt','aliases',
      'heroImage','heroPos','blocks','published','_updated'])
    && d.slug == slug
    && optStr(d, 'title', 300) && optStr(d, 'subtitle', 300)
    && optStr(d, 'excerpt', 1000)
    && optStr(d, 'heroImage', 2048) && optStr(d, 'heroPos', 50)
    && optList(d, 'aliases', 30)
    && optList(d, 'blocks', 200)
    && optBool(d, 'published') && optNum(d, '_updated');
}

function validGroup(d, slug) {
  return d.keys().hasOnly(['slug','name','description','heroImage','heroPos',
      'order','topicSlugs','published','_updated'])
    && d.slug == slug
    && optStr(d, 'name', 300) && optStr(d, 'description', 2000)
    && optStr(d, 'heroImage', 2048) && optStr(d, 'heroPos', 50)
    && optNum(d, 'order') && optList(d, 'topicSlugs', 300)
    && optBool(d, 'published') && optNum(d, '_updated');
}

match /exploreTopics/{slug} {
  allow read: if resource.data.published == true || isAdmin();
  allow write: if isAdmin()
    && (request.method == 'delete' || validTopic(request.resource.data, slug));
}
match /exploreGroups/{slug} {
  allow read: if resource.data.published == true || isAdmin();
  allow write: if isAdmin()
    && (request.method == 'delete' || validGroup(request.resource.data, slug));
}
// validOverride: + 'topics' in hasOnly, + optList(d, 'topics', 20)
```

(Block internals are not deep-validated by rules — Firestore CEL makes recursive list-of-map validation impractical. The write surface is admin-only and size-capped; the renderer treats every block prop defensively. Storage rules gain a `site/explore/**` upload path under the existing admin-only write rule.)

#### 3.9 API logic (no new API — two thin modules in the house style)

```
lib/explore.js            'use client' — mirrors lib/blog.js exactly:
  subscribeTopic(slug, cb)          // onSnapshot on one doc (live admin edits)
  subscribeExploreAdmin(cb)         // full topics+groups for the admin tab
  saveTopic(slug, topic) / deleteTopic(slug)
  saveGroup(slug, group) / deleteGroup(slug)
  topicProducts(slug, SITE_PRODUCTS)      // p.topics.includes(slug)
  groupsOfTopic(slug, groups)             // in-memory reverse lookup (§2)
  relatedTopics(topic, groups, topicsMeta)// shared-group siblings

lib/server/explore.js     server — mirrors lib/server/firestore.js:
  fetchTopic(slug)                  // fetchDoc + published check (ISR)
  fetchPublishedGroups()            // runQuery where published==true (ISR)
  fetchPublishedTopicSummaries()    // runQuery + select PROJECTION:
                                    //   slug,title,subtitle,excerpt,aliases,
                                    //   heroImage,heroPos — NEVER blocks
```

`fetchPublishedTopicSummaries()` is the load-bearing decision for scale: the Firestore REST `runQuery` supports a `select` field mask, so listing pages, the layout, the Symbol filter, search and the sitemap all pay for ~150 bytes/topic instead of whole articles. At 200 topics that is ~30 KB — the full-article reads happen only on the one topic page being viewed. (The client SDK cannot project fields, which is why Explore listings are ISR-rendered rather than live-subscribed — §9.)

### 4. URL structure

```
/explore                          Explore landing — all Groups, curated order
/explore/<group-slug>             Group listing — its Topics, its order
    /explore/sacred-symbols
    /explore/eight-auspicious-symbols
/explore/topic/<topic-slug>       THE canonical Topic page (exactly one per Topic)
    /explore/topic/endless-knot
```

- **No group-scoped topic URLs** (`/explore/sacred-symbols/endless-knot` does not exist). A topic reachable from four shelves still has one URL — duplicate-content penalties are impossible by construction, not by canonical-tag repair. `topic` (plus `search`) are reserved words no group slug may take (enforced in the admin's slug validation).
- **Scales flat to 200+ topics**: the URL space is two segments deep forever; no renumbering, no pagination coupling, groups can be reshuffled without a single redirect.
- **Every topic page ships** (all server-rendered, as `/product/[id]` does today):
  - `alternates.canonical: /explore/topic/<slug>`
  - `Article` JSON-LD (headline, description = excerpt, image = hero, publisher = the existing `Organization` `@id`), `BreadcrumbList` JSON-LD via the existing `breadcrumbJsonLd()` — `Home → Explore → <Primary Group> → <Topic>` where *primary group* = first containing group by `order`
  - `ItemList` JSON-LD on group pages (`CollectionPage`)
  - OpenGraph/Twitter cards from hero + excerpt
- **Internal linking mesh** (discoverability without duplication): group pages → topics; topic pages → sibling topics (`relatedTopics`), linked products, and parent groups; product pages → their topics (§5); the Tashi page → his topics (§7); `[[topic: …]]` wiki-links from blog posts and product stories (one-line extension of the existing resolver). Sitemap gains `/explore`, group pages, and every published topic with `lastModified` from `_updated`.
- **Nav**: one new entry, `Explore`, in `SITE_NAV`/header between Home and Tashi Mannox (admin-renamable via `content.nav` like every other label).

### 5. Bidirectional product–topic linking

Stored **once** (`catalogueOverrides/{id}.topics`, §3.5), derived in both directions, editable from both sides:

- **Topic page → "Pieces bearing this symbol"**: automatic — `SITE_PRODUCTS.filter(p => p.topics.includes(slug))`, rendered with the existing `<SiteProductCard>`. Zero curation beyond the link itself; publish/merge/sold-out logic is inherited because it operates on the already-resolved catalogue. The `productGrid` block in `linked` mode is this same query, placeable mid-article.
- **Product page → "The symbolism behind this design"**: automatic — a small block above "You May Also Like" listing the product's topics (title + excerpt line, linking to each canonical topic page). Renders nothing when `topics` is empty, so **every existing product page is pixel-identical until the studio links a topic**.
- **Admin, from the product side**: the Inventory `ItemDrawer` gains a "Symbolism" checklist (styled like the existing Specials toggles) writing `topics` to the item's override.
- **Admin, from the topic side**: the Topic editor's "Linked pieces" panel searches the inventory (same typeahead the admin already has) and toggles this topic's slug in each chosen product's `catalogueOverrides` doc. Two surfaces, one field — the two views can never disagree.

### 6. Catalogue Symbol filter

- **Placement & behaviour**: a third control in the existing `.cat-bar`, visually and behaviourally cloned from the current pair — a dropdown listing symbols (matching the category jump menu's `.cat-menu` styling, since symbols will outgrow a toggle row), with counts, single-select, tap-again-to-clear, exactly like `fam` for Metal.
- **Data-driven**: options = topics that are linked to ≥1 currently-visible product — computed from `SITE_PRODUCTS` (`p.topics`) with display names from the topic summaries already in context (§3.9). Link a topic in the admin → the filter option appears; remove the last link → it disappears. No hardcoded list anywhere.
- **Mechanics**: one more `useState` in `CatalogueScroll` and one more predicate in the existing `useMemo` (`!sym || p.topics.includes(sym)`) — the same shape as the Metal filter, composing with it. The catalogue page is **not** rebuilt, restructured or restyled; products without topics simply never match a symbol filter, and with no symbol selected the page is byte-for-byte today's page.

### 7. The Tashi Mannox page

**Zero new storage; fully derived.** The set "Topics where Tashi's calligraphy appears" already exists implicitly in the data: *topics linked to products carrying the `tashi` special* —

```js
tashiTopics = topicsOf( SITE_PRODUCTS.filter(p => p.tashi) )   // in-memory
```

An unobtrusive strip is appended **below** the existing product grid (nothing above it moves): *"Sacred forms in his hand — Hung · Om · Ah · …"* — a row of quiet text links to the canonical topic pages, styled with the page's existing kicker/rule-dot vocabulary. The section renders `null` while no tashi-flagged product has topics, so the page ships literally unchanged on day one and lights up by itself as the studio links topics. The studio curates it exactly the way they already curate this page: by flagging pieces — no second list to maintain, no association to forget to update. (If a purely-editorial association is ever wanted — a topic with no product — a `featuredOnTashi` boolean on the topic is a five-line additive change.)

### 8. Search architecture

**Schema-first** (implementation can follow later), three relevance tiers:

| Tier | Source fields | Cost | When |
|---|---|---|---|
| 1. Identity | topic `title`, `aliases`, `slug`; group `name`; product name/sub/code (existing) | In memory already (§3.9 summaries) | v1 — ship with Explore |
| 2. Context | topic `excerpt`; group membership (a topic's group names boost it) | In memory already | v1 |
| 3. Body | flattened block text (`richText.md`, quotes, captions, callouts) | Needs full docs | Later, schema-ready now |

- **v1**: the existing catalogue typeahead is extended to a sectioned unified search — *Topics / Groups / Products*. "Endless Knot" surfaces the topic (title hit, tier 1), all linked products (via `p.topics` — **the relationship itself is a relevance signal**: products linked to a matched topic rank above products that merely contain the words), and sibling topics from shared groups. The Explore landing gets the same box more prominently. Aliases make Tibetan/Sanskrit variants ("Palbeu", "Shrivatsa") findable — an editorial superpower for this catalogue.
- **Why blocks don't hurt relevance**: because content is *structured*, indexing can weight fields (title ≫ alias ≫ excerpt ≫ quote ≫ body) instead of scoring one undifferentiated HTML blob — a direct payoff of §3.3.
- **Upgrade path** (deliberate, not speculative): when body search is wanted, a `searchText` string (flattened from blocks, ~derived data) is added to the summary projection, or the summaries are pushed to Algolia/Typesense/Pagefind at build time. Nothing in the schema changes — blocks were designed to flatten.

### 9. Rendering strategy — data → page

```
Firestore exploreTopics/endless-knot
        │
        ▼  server (ISR 300s, fails soft — lib/server/explore.js)
app/(store)/explore/topic/[slug]/page.jsx
   ├─ generateMetadata()        title · excerpt · canonical · OG
   ├─ <script> Article + BreadcrumbList JSON-LD
   └─ <TopicPage initialTopic={…}>            client component
            │  subscribeTopic(slug)            live admin edits (one doc)
            ▼
       <BlockRenderer blocks={topic.blocks}>
            │   const BLOCK_COMPONENTS = {
            │     richText: RichTextBlock,          // <Markdown> + float embeds
            │     floatProduct: FloatProductBlock,
            │     editorialImage: HotspotImageBlock,
            │     quote: QuoteBlock, divider: DividerBlock,
            │     productGrid: ProductGridBlock,    // ← SITE_PRODUCTS from context
            │     relatedTopics: RelatedTopicsBlock,
            │     callout: CalloutBlock,
            │     architectureGallery: GalleryBlock,
            │   }
            ▼
       blocks.map(b => { const C = BLOCK_COMPONENTS[b.type];
                         return C ? <C key={b.id} {...b} /> : null; })
```

- **The page template is finished the day it ships.** It renders hero + title + `<BlockRenderer>`. New block types touch the registry and add a component; the template, route, schema, rules and all existing topics are untouched. Unknown types render nothing — old cached clients survive new content.
- Product-aware blocks (`floatProduct`, `productGrid`, hotspots, the linked-products rail) resolve ids through `SITE_BY_ID` from the **existing** context — Explore renders live product names, prices, sale states and images with no product data duplicated into topic docs, ever. A dangling product id renders nothing.
- **Listing pages** (`/explore`, `/explore/<group>`) are server-rendered from projections (§3.9) with ISR — deliberately *not* live-subscribed, because the client SDK can't project fields and shipping 200 full articles to paint a card grid is the one genuine scalability trap in this design. A 5-minute editorial propagation delay matches what `generateMetadata` already accepts on product pages; the admin's own preview is instant (§10). The **topic page** does subscribe (one doc) — so "edit in admin, see it live on the site" still works where it matters.
- Visual language: a new `.explore-*` family in `globals.css` under the `.malaya-site` scope — same tokens (brown/gold, Raleway/Poppins), *museum-catalogue* proportions: narrower measure (~68ch), larger serif display sizes, generous whitespace, full-bleed imagery. Reuses `SiteProductCard`, `SiteImg`, `PageBanner`, `rule-dot` verbatim. Nothing outside `.explore-*` changes, so the catalogue cannot regress by CSS accident.

### 10. Admin architecture

**Recommendation: extend the existing bespoke `/admin` console. Do not adopt Sanity/Strapi/Supabase.**

The decision is about totals, not features. An external CMS would mean: a second auth system next to Firebase Auth; a second media library next to the Storage pipeline (upload → resize → immutable URL) the admin already has; a second deployment; porting or abandoning the localStorage-offline pattern; and splitting the studio's workflow across two consoles for content that must cross-reference the catalogue on every screen (product pickers inside rich text, hotspots, linked-pieces panels — all needing live `SITE_PRODUCTS`, which the existing admin has *in memory* and a SaaS CMS would need a custom plugin to fetch). The Blog tab already proves this console can do editorial authoring with live preview. Explore is that pattern with structured blocks instead of one Markdown body.

**New "Explore" tab** (5th tab in `AdminApp`), two views in the BlogAdmin list/editor idiom:

- **Groups view** — list ordered by `order`; create/rename/describe; and per group an ordered, drag-sortable topic list (add from a topic picker, remove, reorder) — this *is* the §2 model, edited directly.
- **Topics view → Topic editor**:
  - *Meta card*: title, slug (auto from title, `slugify` reuse, uniqueness + reserved-word check), subtitle, excerpt, aliases, hero upload (existing `uploadImage`/`resizeImageFile`), Published toggle.
  - *Groups*: checkboxes for every group — **writes to the group docs** (§2); a topic newly ticked appends to that group's `topicSlugs`.
  - *Linked pieces*: inventory typeahead → toggles this slug in each product's override (§5).
  - *Blocks list*: one row per block — type badge, summary line, ▲▼ reorder, edit, delete; "Add block ▾" menu of the §3.3 registry. Each type gets a small purpose-built form (richText = the Blog textarea + LinkPicker + "Insert floating product"; productGrid = mode toggle + picker; quote/callout/divider = trivial fields; gallery = multi-upload with captions).
  - *Hotspot editor* (inside the editorialImage form): the uploaded photo rendered at editing size; **click to place** a pin, **drag to move** (pointer events → fractions), click a pin to attach a product via the same picker, delete on the pin. No code, no JSON hand-editing — the admin never sees coordinates.
  - *Live preview*: split pane rendering the real `<BlockRenderer>` inside a `.malaya-site`-scoped pane (exactly how BlogAdmin previews with the real `<Markdown>`) — the preview **is** the production renderer, so it cannot drift.
- **"Add Dragon with zero code"** — the acceptance test this design is built around: New topic → title "Dragon" → save → tick "Sacred Symbols" → publish. The page exists at `/explore/topic/dragon` with the full template, appears on the group page, in the sitemap, in search, and (once a product links it) in the Symbol filter and on that product's page. No file in the repo changes.

### 11. Future Facebook import — schema fit

The Phase 3 helper (standalone Node script in the `scripts/*.mjs` house style) stays **outside** the CMS: it reads the Facebook JSON export, clusters posts against topic `slug` + `title` + `aliases` keyword sets, and emits a reviewable CSV/JSON mapping (`topicSlug → [{postId, date, snippet, images[], confidence}]`). Nothing about the schema needs to change for it, by design:

- `aliases` is the matching dictionary the clusterer keys on.
- Reviewed snippets become **appended `richText` / `editorialImage` blocks** — import is additive; placeholder blocks are simply replaced or pushed down.
- A topic growing from placeholder to a substantial illustrated article is a *content* event, not a schema event: more blocks, same document, same template. Facebook images must be re-uploaded to Firebase Storage (CSP + longevity); the import mapping carries source URLs for a later `seed-local-images`-style upload pass.

---

## Part III — Architectural self-critique

**Likely future bottlenecks**

1. *Topic doc size (1 MiB cap).* Text blocks with image URLs put a lavish article at 50–100 KB — 10× headroom. The realistic risk is a pathological `architectureGallery` (hundreds of items) or pasted mega-articles post-Facebook-import. Mitigation now: rules cap `blocks` at 200 + admin byte-size meter on save. Escape hatch (mechanical, non-breaking): overflow blocks to `exploreTopics/{slug}/blocks/{chunk}` subcollection docs; the renderer concatenates. Not built until a real article threatens the cap.
2. *Rules can't deep-validate block internals.* An admin write could store a malformed block. Accepted: writes are admin-only and size-capped, and the renderer is defensive (unknown type / missing prop → render nothing). The alternative (exploding blocks into typed subcollections for CEL's benefit) would sacrifice the one-read page for a validation the trust model doesn't require.
3. *Fan-out writes from the topic editor* (group docs + product overrides). Firestore has `writeBatch`; the editor commits association changes atomically. Last-write-wins between two simultaneous admins is the existing console's semantics everywhere — not worsened, documented.

**Scalability** — the design's honest ceiling is ~1,000 topics, set by "load summaries whole + in-memory join" (~150 KB of summaries) — 5× the stated 200-topic ambition, and the failure mode is gradual (a slower layout fetch), not a wall. The deliberate trade taken: Explore *listings* give up live-subscription (ISR only) to avoid shipping full articles to card grids; §9 argues a 5-minute editorial delay is the right price. If it ever isn't, on-demand revalidation (a webhook the admin save calls) is a bolt-on.

**Admin UX risks** — (a) The block editor is the biggest single build item in Phase 2; scoped honestly: linear list + ▲▼ + per-type forms, *not* drag-and-drop WYSIWYG page-building. The split preview is what makes that austerity acceptable. (b) The hotspot editor must handle touch; pointer-events with fraction math is small but fiddly — budgeted as its own step. (c) Two-sided association editing risks "where do I do X?" confusion; both panels will carry one-line captions ("Also editable from the product's drawer"). (d) No standalone draft-preview URL for an unpublished topic — the admin's preview pane covers v1; a signed preview route is a known, additive follow-up.

**SEO weaknesses** — (a) Content lives in Firestore, invisible to crawlers *unless* server-rendered — addressed structurally (every Explore route is ISR-server-rendered with metadata + JSON-LD, the exact `/product/[id]` recipe), but it's the invariant to protect in review. (b) Breadcrumb needs a deterministic primary group — defined (§4); a multi-parent topic's other shelves are plain internal links, which Google treats as navigation, not duplication. (c) Placeholder-era thin content across 29 seeded topics could look low-quality at scale; seeds ship `published: true` for the initial list per the brief, but the toggle exists precisely so the studio can stage real content — flagged for an editorial decision, not an engineering one.

**Opportunities to simplify (considered and taken/rejected)** — *Taken*: no join collection; no asset collection; no per-topic SEO fields; no new API layer; no external CMS; Tashi block fully derived; hotspots inline; excerpt doubles as meta description. *Rejected as false simplicity*: *"reuse blogPosts with tags as topics"* — one Markdown body can't express hotspots, floats, auto product grids, or per-group ordering; the editorial ambition is exactly what blocks buy. *"skip Groups, put group names on topics"* — loses curated shelf order (the Eight Auspicious Symbols have a canonical sequence) and turns every shelf rename into N topic writes.

**Is there a better architecture than the one requested?** One material deviation is already argued above (§2): membership lives on Groups, not Topics, and no join table — that *is* my "cleaner abstraction" answer to the brief's open question. Beyond that: had this been a greenfield build, a typed headless CMS (Sanity) with portable-text blocks would be a contender. In *this* repo — with auth, storage, rules, offline caching, ISR readers, an admin console, and a studio trained on it — the requested direction (extend the existing system) is genuinely the right one, and I recommend it without reservation.

---

## Part IV — Phase 2 implementation plan (post-approval, for reference)

1. **Data layer** — rules delta (§3.8) + deploy; `resolve.js` `topics` passthrough; `lib/explore.js`; `lib/server/explore.js`; seed script `scripts/seed-explore.mjs` (Admin SDK): 4 groups, 29 unique topics from the brief's list (Endless Knot, Lotus and Dharma Wheel each appearing in two groups — the multi-parent proof), placeholder blocks, ≥1 product link each via keyword match against the catalogue.
2. **Admin** — Explore tab: Groups view, Topic editor, block forms, hotspot editor, association panels, preview; Inventory drawer "Symbolism" checklist.
3. **Explore frontend** — `/explore`, `/explore/[group]`, `/explore/topic/[slug]`; `BlockRenderer` + the nine block components; `.explore-*` CSS; nav entry.
4. **Integration** — product-page symbolism section; Symbol filter in `.cat-bar`; Tashi strip; `[[topic: …]]` wiki-links; sitemap + JSON-LD.
5. **Verification** — Playwright specs for every integration point **plus regression runs of the existing suite** (`e2e/storefront|cart|seo|images|inventory-sync`) to hold the zero-regression guarantee; new `e2e/explore.spec.js`.

Each step lands as an independently green commit on `claude/explore-editorial-system-vz24cx`.

---

## Ready to implement?

This document is the Phase 1 checkpoint. Points most worth a deliberate yes/no before code:

1. **CMS**: extend the existing Firebase + `/admin` console (no external CMS) — §10.
2. **Relationship shape**: Groups hold ordered `topicSlugs`; products hold `topics`; no join collection — §2, §5.
3. **URLs**: `/explore`, `/explore/<group>`, `/explore/topic/<slug>` — §4.
4. **Listings are ISR (5-min propagation), topic pages live-subscribe** — §9.
5. **Floating PNG syntax**: `![[float: <product> | left|right]]` via the existing wiki-link/LinkPicker idiom — §3.6.
6. **Seed topics publish immediately** with placeholder content (vs. seeding as drafts) — SEO note in Part III.

**Approve (or amend any of the above), and Phase 2 begins.**
