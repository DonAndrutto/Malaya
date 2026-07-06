# Explore — architectural audit (post-Phase 2)

*A code-verified review of the implemented Explore knowledge system against the sixteen
architectural principles set for the next refinement pass — before large-scale content
entry and the Facebook-archive import.*

**Status: AUDIT — no changes implemented.** Every claim below was verified against the
code as merged in PR #20 (commits `cd5f6cc` → `5722bae`); file:line references point at
the current tree. Where the implementation already satisfies a principle — even
differently than described — the recommendation is to leave it unchanged. Architectural
stability is preferred over theoretical elegance throughout.

---

## Verdict at a glance

**Zero critical architectural issues.** The implementation matches the approved
architecture (EXPLORE.md) with unusual fidelity — several of its promises (the byte-size
meter, sectioned search, live draft preview at the real URL) are already delivered, not
just planned. The system is structurally ready for years of editorial growth. Three
items should land before large-scale content entry; all are small and additive, none is
a restructure.

| # | Principle | Classification |
|---|---|---|
| 1 | Keyword matching is a migration tool only | **Documentation only** |
| 2 | `catalogueOverrides` as adaptation layer | **No action required** |
| 3 | Topic pages must remain block-based | **No action required** |
| 4 | Editorial Images → reusable assets | **No action required** |
| 5 | Groups are navigation shelves | **No action required** |
| 6 | Related Topics smarter over time | **No action required** |
| 7 | Prepare for Tags without implementing | **Documentation only** |
| 8 | Floating Products → visual editing | **Low-priority technical debt** |
| 9 | Revision history | **Recommended before large-scale content entry** |
| 10 | Search architecture | **No action required** |
| 11 | Hero image variants | **No action required** |
| 12 | Galleries → Media Collections | **Documentation only** |
| 13 | Empty Topics are first-class citizens | **No action required** |
| 14 | URL permanence | **Recommended before large-scale content entry** |
| 15 | Content portability | **Documentation only** |
| 16 | Asset reuse | **Recommended before large-scale content entry** |
| — | Editorial principle (knowledge before commerce) | **No action required** — verified |
| — | Architecture as a cross-cutting theme | **No action required** — verified |
| — | Authoring experience | Findings folded into #8, #9, #16 |

---

## Part I — the sixteen principles

### 1. Keyword matching is a migration tool only — **Documentation only**

**What the implementation does.** Keyword inference exists in exactly one place:
`scripts/seed-explore.mjs`. Each seed topic carries a `keywords` array of regex
fragments; `matchTopics()` (`scripts/seed-explore.mjs:327-345`) tests them against
`"${name} ${sub}"` per catalogue item and writes the hits to
`catalogueOverrides/{id}.topics`. The script is re-run-safe by design: existing topic
and group docs are **skipped** unless `--force` (`:389`, `:407`), product links are
written with `arrayUnion` so studio-added links are never disturbed (`:424-427`), and
`--dry-run` / `--skip-links` flags scope what it touches (`:38-40`).

The runtime derives every product↔topic relationship from explicit `topics` arrays —
verified across all five surfaces that consume the relationship: the catalogue Symbol
filter builds options and filters from `p.topics` (`components/store/site/SitePages.jsx:116`,
`:131`); topic product grids use `topicProducts()` (`lib/explore-shared.js:59-61`); the
product-page symbolism section maps `p.topics` (`SitePages.jsx:337`); the Tashi strip
collects `p.topics` from tashi-flagged pieces (`:495`); search boosts products whose
`topics` intersect matched topics (`lib/explore-shared.js:106`). No name-based inference
anywhere.

Two adjacent facts, checked so they aren't mistaken for violations: (a)
`RELATED_KEYWORDS` (`lib/data/site-data.js:254`) is a runtime keyword table, but it
powers the pre-Explore product→product "You May Also Like" cross-sell and never touches
topics; (b) topic `aliases` are used at runtime only for search scoring
(`explore-shared.js:91`), wiki-link resolution (`lib/wiki-links.js:40`), and JSON-LD
`alternativeHeadline` (`lib/seo.js:114`) — never to infer product links.

**Why documentation only.** The principle's hard requirement — *the runtime must never
infer relationships from product names* — is fully satisfied, and the admin's two
editing surfaces (Topic editor "Linked pieces", Inventory "Symbolism" checklist) both
write the one `catalogueOverrides` field, making the admin the single source of truth
already. What's missing is only a recorded lifecycle for the script.

**Smallest practical change.** Two sentences of documentation, no code: mark
`seed-explore.mjs` as migration-scoped (to be archived once the Facebook-archive import
is complete — it remains useful until then as the house pattern for a fresh-environment
seed), and record the one footgun: `--force` does a **full overwrite** of topic/group
docs, so after the studio has edited seeded topics, `--force` would destroy their work.
This audit section is that documentation; a one-line pointer in the script header would
complete it during the next pass.

### 2. `catalogueOverrides` is an acceptable adaptation layer — **No action required**

**What the implementation does.** The override layer is encapsulated at exactly two
read choke points: `resolveProduct()` sets `topics: Array.isArray(o.topics) ? o.topics : []`
(`lib/data/resolve.js:43`) and the stock-ledger resolver does the same
(`lib/data/ledger.js:105`). Every downstream consumer — filter, grids, symbolism
section, Tashi, search, admin panels — reads the **resolved** `p.topics`, never the
override doc. Write paths are similarly contained: the Topic editor's
`toggleProductTopic` (`components/admin/ExploreAdmin.jsx:527-536`), the Inventory
drawer's commit (`components/admin/Inventory.jsx:201-205`), and the seed script — all
through the existing `saveOverrides` transport.

**Why no action.** If products someday carry `topics: []` natively, the migration is:
add a base fallback at the two resolver lines (`o.topics` → `o.topics : (base.topics || [])`),
repoint the two admin write paths, and update `validOverride` in the rules. Zero
downstream consumers change, because they already read the merged product. That is as
clean as an adaptation layer gets in this codebase — the same shape as every other
overridable field. Notably, `topics` deliberately has **no** base fallback today (unlike
`val(f)` fields), which keeps Firestore the sole authority during the external-schema
era; that asymmetry is the correct current behaviour, not an oversight.

### 3. Topic pages must remain block-based — **No action required**

**What the implementation does.** The schema is an ordered `blocks` array inside the
topic doc; the renderer is a registry map `BLOCK_COMPONENTS` of all nine types
(`components/store/site/ExplorePages.jsx:235-245`) consumed by `BlockRenderer`, where an
unknown type renders `null` (`:253-254`) and every block component self-guards missing
props. The page template is: hero → breadcrumbs → optional draft note →
`<BlockRenderer>` (`:309-330`) — no fixed form fields, no predefined sections inside
the article.

Three *derived, conditional* sections render outside the blocks array, and each is
either suppressible or purely informational:

- **Auto pieces rail** ("Pieces bearing this symbol") — renders after the article only
  when linked pieces exist AND the article hasn't placed its own linked-mode
  `productGrid` (`hasOwnGrid`, `:306`, `:332`). This is EXPLORE.md §5's automatic
  bidirectional link, not a fixed layout: the editor overrides its placement by adding a
  `productGrid` block wherever they want it.
- **Auto related rail** — same pattern, suppressed by any `relatedTopics` block
  (`hasOwnRelated`, `:307`, `:342`).
- **"Part of …" shelf line** — a footer line listing the shelving groups (`:350-360`),
  navigation metadata rather than content.

The admin editor is equally block-pure: the meta card holds only metadata
(title/slug/subtitle/excerpt/aliases/hero/published), and all content editing is the
block list (add from `BLOCK_TYPES`, ▲▼ reorder, per-type forms). One nuance: a
**manual**-mode `productGrid` does not suppress the auto rail — deliberate, since a
hand-curated grid and "everything linked" are different statements, and an editor who
wants full control adds a linked-mode grid instead.

**Why no action.** Pages are composed entirely of blocks; the derived rails are
catalogue reflections that disappear with the catalogue (see #13) and yield to editorial
placement. One honest deviation from EXPLORE.md's "one registry entry" claim: the admin
side per-type behaviour lives in three colocated `switch` statements plus the
`BLOCK_TYPES` list (`ExploreAdmin.jsx:50`, `:67`, `:230`; `explore-shared.js:15`), so a
new block type touches four admin sites plus one renderer entry. All additive, all in
two files, no schema or template change — consolidating them into a single block
descriptor would be refactoring for elegance with no authoring payoff. Not recommended.

### 4. Editorial Images should evolve toward reusable assets — **No action required**

**What the implementation does.** Hotspots live inline on the `editorialImage` block as
fraction coordinates (`{x, y, productId, label}`), edited visually (click-to-place,
drag-to-move — `ExploreAdmin.jsx:141-224`) and rendered defensively
(`ExplorePages.jsx:138-161`).

**Why no action.** The block envelope is a plain object and the security rules
deliberately do not deep-validate block internals (`firebase/firestore.rules:94-96`) —
so the future migration EXPLORE.md §3.4 already scripts (extract block → `exploreAssets`
doc, block keeps an `assetId` reference, renderer resolves with inline fallback) is
purely additive: no rules change, no migration of existing docs, old blocks keep
working. The architecture does not make the evolution difficult; building the asset
collection before reuse actually emerges would be speculative. (The *admin* reuse
affordance is a separate, real gap — see #16.)

### 5. Groups are navigation shelves — **No action required**

**What the implementation does.** Membership and per-shelf order live only on the group
doc (`topicSlugs`); topic docs have no group field. Everything downstream honours that:

- **One canonical URL** — `/explore/topic/<slug>` is the only topic route; no
  group-scoped topic URL exists (route inventory confirms), and `topic`/`search` are
  reserved group slugs (`explore-shared.js:10`, enforced at `ExploreAdmin.jsx:859`).
- **Breadcrumbs degrade, never depend** — the server computes a deterministic primary
  group and *conditionally* inserts it (`app/(store)/explore/topic/[slug]/page.jsx:44`,
  `:61`); with zero groups the JSON-LD is Home → Explore → Topic, the hero kicker falls
  back to "Explore" (`ExplorePages.jsx:314`), the crumb and "Part of" line simply omit
  (`:324`, `:350`).
- **Article JSON-LD is group-free** (`lib/seo.js:104-119`); the sitemap lists every
  published topic regardless of shelving (`app/sitemap.js:61`).
- **Group deletion destroys nothing** — reverse lookups are pure in-memory scans
  returning `[]`/`null` (`explore-shared.js:48-56`); `fetchTopic` never touches groups;
  unpublished groups vanish from the published-only maps and the topic page renders on.
- **Multi-shelf membership is real** — three seed topics sit on two shelves each, and
  the "Part of" line lists all shelves.

**Why no action.** No accidental ownership exists anywhere in routing, URLs,
breadcrumbs, rendering, or deletion semantics. One conscious consequence to be aware of,
not a defect: a topic on **no** shelf is reachable via canonical URL, sitemap, search,
and product cross-links, but has no browse path from `/explore` (the landing renders
shelves only). That is the model working as designed — an unshelved track. If the
library outgrows shelves, an "All symbols A–Z" index on the landing is a small additive
page; noted on the roadmap as optional.

### 6. Related Topics should become smarter over time — **No action required**

**What the implementation does.** The block stores `{mode: 'auto'|'manual', slugs?,
title?}`. Auto mode is one pure function — `relatedTopics()` collects shared-group
siblings in shelf order (`lib/explore-shared.js:64-74`); manual mode resolves explicit
slugs defensively (`ExplorePages.jsx:197`).

**Why no action.** Every future signal named by the principle is an implementation
change inside that one function, not a schema change: shared products (`ctx.products`
is already passed to the renderer — `ExplorePages.jsx:247`, `:275-283`), future tags
(would arrive on the summaries the function already receives), content similarity (a
precomputed score could be derived from blocks at save time). Blocks already stored as
`mode: 'auto'` automatically get smarter the day the function does. The stable
`mode`/`slugs` contract is exactly the seam the principle asks for.

### 7. Prepare for Tags without implementing them — **Documentation only**

**What the implementation does / would tolerate.** Firestore docs are schemaless and
every reader is defensive, so existing topics need no migration when `tags: []` arrives.
The write path is the only gate: `validTopic`'s `keys().hasOnly([...])` rejects unknown
fields (`firebase/firestore.rules:97-109`) — a deliberate security posture, already
documented as the house pattern ("any new field requires a rules change and redeploy").

**Why documentation only.** Adding tags later is four additive touch points, none of
which is a redesign — the value of this audit item is writing the checklist down so the
non-obvious ones aren't missed:

1. `firestore.rules` — add `'tags'` to `validTopic.hasOnly` + `optList(d,'tags',N)`
   (and to `validOverride` if products get tags), then deploy rules.
2. `TOPIC_SUMMARY_FIELDS` (`lib/server/explore.js:16-19`) — **the easy one to forget**:
   without it, tags exist on the doc but are invisible to listings, search, and filters,
   which all read the projection.
3. One admin input (the `aliases` comma-split field at `ExploreAdmin.jsx:692-694` is the
   copyable pattern).
4. One scoring line in `searchExplore` (`explore-shared.js:88-93`).

Rendering, routing, and existing documents tolerate the new field with no changes.

### 8. Floating Products should eventually become visual editing — **Low-priority technical debt**

**What the implementation does.** Two mechanisms exist today:

- The structured **`floatProduct` block** already *is* visual editing: product picker,
  left/right toggle, caption field, optional custom cut-out PNG upload
  (`ExploreAdmin.jsx:250-276`) — no syntax written, rendered directly without Markdown
  (`ExplorePages.jsx:132-136`).
- The **inline `![[float: …]]`** form (for floats *inside* prose) has an "Insert
  floating product" picker in the richText form (`ExploreAdmin.jsx:238-240`), a
  side/caption/`src=` grammar parsed order-tolerantly (`lib/wiki-links.js:89-105`),
  graceful degradation for unresolvable refs (`:102`), and — the load-bearing property —
  the admin preview renders through the **production** `BlockRenderer`
  (`ExploreAdmin.jsx:821`), so the author sees the real float immediately.

**Why low-priority debt.** The transition the principle asks about is architecturally
complete: block-level floats are already visual, and the inline picker means editors
never need to memorise the grammar. The one rough edge is that the inline picker
**appends the shortcode to the end of the Markdown** (`(b.md || '') + …`) rather than
inserting at the cursor — in a long article the author must cut and paste it into
position. BlogAdmin already solved this with `insertAtCursor`
(`components/admin/BlogAdmin.jsx:99-107`).

**Smallest practical change.** Port the `insertAtCursor` pattern (a `ref` +
`selectionStart/End` splice) to the richText form's three insert pickers. A few dozen
lines, pure authoring polish, no schema or renderer involvement; it can land any time,
which is why it is *low-priority* rather than pre-content-entry.

### 9. Revision history — **Recommended before large-scale content entry**

**What the implementation does.** There is no revision history, snapshot, undo, or
editorial export anywhere (confirmed across scripts/, lib/, components/admin/ — the only
export in the app is the inventory JSON/CSV download). Saves are whole-document
`setDoc`, last-write-wins. Three discovered behaviours compound the risk beyond what the
brief assumed:

- **Autosave is aggressive**: every meta field persists on blur and *every block
  mutation* (add/edit/reorder/delete) persists the entire topic immediately
  (`ExploreAdmin.jsx:619`, `:679`). A slip — deleting the wrong block, mangling a long
  Markdown passage — overwrites the only copy instantly, with no undo.
- **Writes are fire-and-forget**: `setDoc(...).catch(() => {})`
  (`lib/explore.js:60`) with localStorage updated first — a rules rejection or network
  failure is silently swallowed while the editor sees their edit "saved" locally.
- **Deletion cascades are real** (`ExploreAdmin.jsx:593-616`): correct behaviour, but
  behind a single `confirm()` with no way back.

**Why elevated above the brief's "roadmap entry" hint.** The brief said to recommend
only a roadmap entry *unless architectural preparation is needed now*. Architecturally,
nothing is needed — a history bolt-on fits the design as-is. The elevation is
operational, and honest: this system is about to hold hundreds of hours of irreplaceable
editorial writing, and the discovered autosave-plus-swallowed-errors semantics make
silent content loss a *when*, not *if*, at that scale. The safety net should exist
before the writing does.

**Smallest practical change** (pick one; both stay lightweight, neither touches the
schema):

- **Save-time snapshots**: on each admin save, also write the previous doc to
  `exploreTopics/{slug}/revisions/{timestamp}`, pruned to the last ~20; one admin-only
  `match` block in the rules; a minimal "Restore" list in the editor can even come
  later — the data being there is the insurance.
- **Scheduled export**: a `scripts/export-explore.mjs` (house style per
  `scrape-stories.mjs`) dumping all topics/groups to dated JSON. Cheaper still, coarser
  granularity — and it doubles as the portability proof for #15.

### 10. Search architecture — **No action required**

**What the implementation does.** `searchExplore()` already returns **sectioned**
results `{topics, groups, products}` (`lib/explore-shared.js:82-119`) with tiered
scoring: topic title/slug (3) > aliases (2) > subtitle/excerpt (1); groups by
name/description; products boosted +2 when linked to a matched topic — the relationship
itself is a relevance signal, exactly as designed — +1 on text match. The Explore
landing renders three labelled sections — "Symbols & Topics", "Shelves", "Pieces"
(`ExplorePages.jsx:87-116`) — and the catalogue typeahead surfaces knowledge rows above
product rows (`SitePages.jsx:253-270`). Searching "vajra" today produces exactly the
separated result classes the principle demands. All of it runs over the summary
projection — never full blocks (`lib/server/explore.js:15-19`).

**Why no action.** Grouped search isn't just *possible* without redesigning the data
model — it is implemented. The deliberate gap is body-text search (tier 3), and its
upgrade path needs no schema change: flatten block text into a `searchText` summary
field at save time (rules + projection additions per the #7 checklist), or push
summaries to an external index. Blocks were designed to flatten; nothing to prepare now.

### 11. Hero image variants — **No action required**

**What the implementation does.** One `heroImage` URL plus a `heroPos` focal point
serves all contexts: topic-page hero background (`ExplorePages.jsx:311-312`), OG/Twitter
metadata (`app/(store)/explore/topic/[slug]/page.jsx:33-35`), Article JSON-LD
(`lib/seo.js:113`), and listing cards — where `SiteImg` applies next/image
srcset optimisation (`ExplorePages.jsx:34-37`, `components/store/site/SiteShell.jsx:106-130`).
The focal-point convention is the current answer to aspect-ratio variance, and it is
honoured everywhere the image renders.

**Why no action.** Evolving to explicit variants (`portrait`, `landscape`, `thumbnail`,
`social`) is the same additive-field recipe as #7: new optional fields (or a
`heroImages: {}` map) with every consumer falling back to `heroImage` — existing topics
unaffected, rules + projection touched, no migration. Nothing in the current schema
resists that evolution, and inventing variant fields before an editorial need exists
would be speculative. When social-sharing crops become a real requirement, start with a
single `heroSocial` field rather than a full variant system.

### 12. Galleries should become Media Collections — **Documentation only**

**What the implementation does.** One gallery type exists: `architectureGallery`, with
items `{src, caption?, location?}` — images only, rendered as a masonry figure list
(`ExplorePages.jsx:218-233`). (EXPLORE.md's block table never promised a generic
gallery; the architecture gallery *is* the cross-cutting architectural lens block.)

**Why documentation only.** The naming is scoped, but it never becomes restrictive,
because new block types are additive by construction: when non-image media arrives
(video, 3D, manuscript scans), the right move is a **new sibling `mediaCollection`
block** whose items carry a `kind` discriminator — not an overload or rename of
`architectureGallery`, which would force a data migration of authored content for zero
editorial gain. The item shape is also forward-compatible: adding `kind` to gallery
items later is tolerated by the defensive renderer. The decision worth recording (here,
and it is now recorded): *architectureGallery stays what it is; generality arrives as a
sibling type.*

### 13. Empty Topics are first-class citizens — **No action required**

**What the implementation does.** Every commerce surface disappears cleanly when the
catalogue doesn't reference a topic — verified through the full conditional chain and
locked by e2e specs written to pass in both empty and populated states
(`e2e/explore.spec.js:1-5`):

- Auto pieces rail: gated on `pieces.length > 0` (`ExplorePages.jsx:332`).
- Linked-mode `productGrid` block: renders `null` on zero matches (`:186`).
- Product-page symbolism section: entirely absent for unlinked pieces
  (`SitePages.jsx:455`; e2e `:115` asserts the zero-regression).
- Symbol filter: an option exists only while ≥1 visible product links the topic; the
  control itself hides when no options remain (`SitePages.jsx:112-123`, `:217`).
- Tashi strip: absent until a tashi-flagged piece links a published topic (`:525`).

If every Endless Knot product disappeared tomorrow, `/explore/topic/endless-knot`
renders hero, article blocks, related symbols, and shelf line — a complete article with
no commercial residue. The principle holds.

**Why no action.** The catalogue-state requirement is satisfied end to end. One
observation for the record, editorial rather than architectural: a *published* topic
with **zero blocks** renders hero + title over an empty article body (the `excerpt` is
card/meta text, never on-page prose), with no "coming soon" affordance — the draft note
appears only on unpublished topics (`ExplorePages.jsx:326-328`). The workflow already
covers this (all 29 seeds shipped as drafts *with* a placeholder richText block;
publishing is a deliberate act), so no change is required. If the studio ever wants a
guard, the smallest is an admin nudge when publishing a blockless topic — noted, not
recommended now.

### 14. URL permanence — **Recommended before large-scale content entry**

**What the implementation does.** The slug is the doc id is the URL — one canonical
page per topic by construction. The admin **does** let the studio rename slugs, and the
rename cascade is half-excellent: `persist()` moves the doc and rewrites every group
`topicSlugs` entry and every product override `topics` entry (`ExploreAdmin.jsx:561-580`)
— shelves and product links never dangle. Deletion prunes references the same way
(`:593-616`), and every resolver tolerates dangling slugs regardless
(`explore-shared.js:40-44`).

What a rename does *not* survive today:

- **The old URL 404s.** No redirect or alias mechanism exists: `fetchTopic` looks up
  the exact doc id only (`lib/server/explore.js:23-26`), `aliases` are never consulted
  for routing, and `next.config.mjs` carries only the static `/catalogue` redirect
  (`:66-68`). Inbound links, indexed URLs, and printed references break silently
  (the page renders a `noindex` not-found).
- **In-content references by slug.** `[[topic: old-slug]]` inside other topics' or blog
  posts' Markdown degrades to plain text (title- and alias-keyed wiki links survive,
  since the resolver indexes all three — `lib/wiki-links.js:38-41`); manual
  `relatedTopics.slugs` inside *other* topics' blocks are silently dropped from rails.
- **The sharpest finding of this audit**: the rename path has **no target-slug
  collision guard**. `uniqueTopicSlug` dedupes only for new topics
  (`ExploreAdmin.jsx:549`); on rename, `putTopic(slug, topic)` (`:581`) will silently
  **overwrite an existing topic** that already owns the target slug — the one real
  data-loss path found anywhere in the system.

**Why recommended-before rather than critical.** The architecture itself already
delivers the principle's foundation (one permanent canonical URL, no group coupling,
references cascaded); the gaps are missing safety nets in one admin function and one
route, both additive to close. They are classified *before large-scale content entry*
because both grow with the corpus: every new page multiplies rename collision surface,
and every month of inbound links raises the cost of a redirect-less rename.

**Smallest practical changes** (in priority order):

1. **Collision guard** — ~4 lines in `persist()`: if renaming and `data.topics[slug]`
   exists, abort with an alert. Fixes the data-loss path outright.
2. **`previousSlugs` + route fallback** — on rename, append the old slug to an optional
   `previousSlugs: []` on the topic (rules `hasOnly` + `optList`; add to
   `TOPIC_SUMMARY_FIELDS`). In the topic route, when `fetchTopic` misses, scan the
   summaries for a topic whose `previousSlugs` contains the requested slug and issue a
   `permanentRedirect()` to the canonical URL. ~15 lines total; old URLs, SEO equity,
   and printed links survive every future rename, forever.
3. *(Optional, later)* extend the rename cascade to sweep `relatedTopics.slugs` arrays
   and `[[topic: old-slug]]` tokens across the topic corpus the admin already holds in
   memory — nice-to-have once 1–2 exist, since title/alias-form wiki links already
   survive and `previousSlugs` makes stale slug links merely redirect-resolved.

### 15. Content portability — **Documentation only**

**What the implementation does.** The content model is already portable by
construction: each topic is one self-contained JSON document; prose is Markdown inside
`richText`/`callout` blocks; structure is typed plain-object blocks that flatten
trivially (the property §8's search tiering was designed around); references are stable
ids/slugs rather than embedded objects; `[[wiki links]]` are an Obsidian-compatible
grammar. Nothing couples content to React, Next.js, or the website — the renderer is one
consumer of a neutral format. The gaps are (a) no export tooling exists yet, and (b)
image `src` URLs point into Firebase Storage, so any true export needs an asset
download/manifest pass (the same pattern `seed-local-images.mjs` already established in
reverse).

**Why documentation only.** No schema improvement is needed for portability — the
schema is the portable artifact. What's wanted is a roadmap entry for
`scripts/export-explore.mjs` (house style per `scrape-stories.mjs`): dump
topics/groups to dated JSON, optionally flatten each topic to Markdown (front-matter +
blocks-to-prose, floats/grids as shortcodes), and emit an asset manifest of referenced
Storage URLs. Books, PDFs, catalogues, and future apps consume from there. Pairs
naturally with #9 — one script can be both the backup and the portability proof; if the
export route is chosen there, this principle's roadmap item lands for free.

### 16. Asset reuse — **Recommended before large-scale content entry**

**What the implementation does.** The *data layer* is reuse-friendly: any block `src`
accepts any Storage URL, hotspots/captions live on the block rather than the binary, and
the `floatProduct` block defaults to the product's own `images[0]` — the single
most-reused asset class costs nothing extra by design. The *admin* is not:
`ImageUpload` and `GalleryUpload` are upload-only (`ExploreAdmin.jsx:112-136`,
`:439-463`) — no URL paste, no browser of prior uploads (SiteImages is slot-based, not a
library). Every upload gets a unique timestamped immutable path
(`lib/upload.js:19-22`). Consequence: reusing a photograph on a second topic means
re-uploading the original file — a duplicate Storage object per reuse, plus the
authoring friction of locating the original on disk.

**Why recommended-before.** Duplication compounds from the first day of bulk entry and
is never realistically deduplicated afterwards; the Facebook archive multiplies the
photographic volume. This is the one place where asset management genuinely becomes a
future bottleneck — in authoring cost first, storage second.

**Smallest practical change.** Not a media library. Add a paste-URL affordance to
`ImageUpload`/`GalleryUpload` ("use an existing image" — accept
`firebasestorage.googleapis.com` URLs, matching the CSP allowlist), so an editor can
copy an image URL from another topic or the preview and reuse it without re-uploading.
A modest follow-up when justified: a "recent Explore uploads" mini-picker listing
`site/explore/**` via the Storage list API. The full `exploreAssets` collection (#4)
stays deferred until annotated-image reuse actually emerges.

---

## Part II — cross-cutting reviews

### The editorial principle: knowledge first, commerce second — **verified, no action**

The rendering order embodies the hierarchy: hero → editorial blocks → *then* pieces →
related knowledge → shelf line. Commerce never precedes or interrupts the article unless
the author deliberately places a product block mid-prose; the automatic rail sits after
the last word and vanishes with the catalogue (#13). Products enter the editorial flow
only as illustrations the author invokes — floats and hotspots resolve live catalogue
data (name, price, availability) without duplicating any of it into topic docs, and a
dangling product id renders nothing rather than an error. The admin mirrors the
hierarchy: the block list is the editor's main workspace; "Linked pieces" is a side
panel. The "Endless Knot test" passes in code and in CI: unlink every product and the
topic page remains a complete article; the e2e suite asserts the absence states
explicitly. The strongest structural guarantee is quiet but decisive: **product docs
point at topics; topic docs never point at products** — commerce holds the reference,
knowledge stays pure.

### Architecture as a cross-cutting theme — **verified, no action**

The seeded top-level structure is exactly the four approved shelves — Eight Auspicious
Symbols, Sacred Symbols, Sacred Seed Syllables, Ritual Objects
(`scripts/seed-explore.mjs:263-284`) — with **no Architecture group**, and nothing in
the code special-cases architecture as a category. The lens exists where it belongs: the
`architectureGallery` block, placeable on any topic. A future "Architecture in Bhutan"
landing is an aggregation page over topics containing such blocks — buildable additively
whenever desired (at most, wanting a cheap "has architecture content" summary flag,
derivable at save time). Nothing to prepare now.

### Authoring experience — findings folded into #8, #9, #16

The strongest authoring assets are already in place: the preview pane renders the
**production** `BlockRenderer` (it cannot drift from the site), a signed-in admin gets a
live draft preview at the topic's real URL (`lib/explore.js:112-137`), the promised
1 MiB byte-size meter ships (`ExploreAdmin.jsx:656-657`, red past 800 KB), and both
association panels are honest about their single storage location. The three authoring
frictions worth spending on are exactly the classified items: content safety under
aggressive autosave (#9), cursor-position float insertion (#8), and image reuse (#16).
Two soft ceilings are worth knowing about, not acting on: the admin tab subscribes to
the **full** topics collection including blocks (`lib/explore.js:101-110`) and mirrors
it to localStorage (quota failures are caught and degrade to no-cache,
`lib/explore.js:41-44`) — at many hundreds of heavy articles the admin's initial load
grows accordingly, and the failure mode is a slower tab, not breakage. Revisit only if
the studio feels it.

---

## Part III — conclusions

### 1. Overall architectural assessment

The implementation is a faithful, sometimes better-than-promised realisation of the
approved architecture. The three load-bearing decisions all held: membership on Groups
(topics stay pure knowledge), product→topic links stored once on overrides and derived
in both directions, blocks inside the topic doc behind a registry renderer. The
verification principle cut both ways: several brief-level worries proved already solved
(sectioned search, byte meter, group-independent breadcrumbs, empty-state grace), and
the genuinely new findings (rename collision, redirect-less renames, upload-only reuse)
are implementation-level gaps, not design flaws. **No critical architectural issues
exist.**

### 2. Remaining risks

- **Rename-overwrite data loss** (#14) — the single most urgent line item; a few-line
  guard closes it.
- **No content safety net under last-write-wins autosave** (#9) — silent-loss risk
  grows linearly with corpus value; fire-and-forget writes can also mask save failures.
- **Redirect-less slug changes** (#14) — SEO and inbound-link erosion once real
  traffic and citations exist.
- **Asset duplication drift** (#16) — irreversible-in-practice once bulk entry begins.
- **Soft scaling ceilings, accepted and documented**: admin full-collection subscribe +
  localStorage mirror (graceful degradation); ISR listings' 5-minute propagation;
  summaries-in-memory joins (~1,000-topic honest ceiling per EXPLORE.md). None needs
  action at the stated ambition.

### 3. Suggested roadmap before importing the Facebook archive

1. **Slug safety** (#14): rename collision guard; `previousSlugs` + permanent-redirect
   fallback in the topic route (rules + projection additions alongside).
2. **Content safety net** (#9, delivers #15): save-time revision snapshots *or*
   `scripts/export-explore.mjs` scheduled dumps — one mechanism, kept lightweight.
3. **Asset reuse affordance** (#16): paste-URL support in `ImageUpload`/`GalleryUpload`.
4. **Authoring polish, optional** (#8): cursor-position insertion for the richText
   pickers.
5. **Then the import itself** (EXPLORE.md §11): clusterer keyed on `aliases`, reviewed
   mapping, images re-uploaded to Storage via a `seed-local-images`-style pass, content
   appended as draft blocks.
6. **After the import**: archive `seed-explore.mjs` (migration complete); consider the
   optional A–Z topic index as the library outgrows its shelves.

Items 1–3 are small, independent, additive changes; nothing on this list restructures
anything, so the zero-regression guarantee for the catalogue is preserved by
construction — the same untouched-surface argument PR #20 shipped under.

### 4. Is the architecture ready for years of editorial growth?

**Yes.** The core entities are right, the boundaries between them are enforced in the
places that matter (storage shape, rules, routes, renderers — not just convention), and
every anticipated evolution examined by this audit — tags, hero variants, media
collections, reusable assets, body search, native product topics, smarter relatedness —
lands as an *additive* change against the current schema. The system's honest risks are
operational safety nets around a sound core, and all of them are cheaper to install now
than after the library is full. Land roadmap items 1–3, then write — for years.
