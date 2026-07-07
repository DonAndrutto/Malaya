# Storefront visual audit & image-presentation redesign plan

Analysis and planning only — **no code changes in this PR**. This document audits
every non-product image surface on the storefront, then proposes a ranked,
PR-grouped redesign that modernises the image presentation while keeping the
identity elegant, minimal and premium — closer to a luxury editorial
publication than a conventional ecommerce catalogue.

Companion docs: `IMAGES.md` (delivery pipeline), `SITE-IMAGES-AUDIT.md` (admin
upload slots), `EXPLORE.md` / `EXPLORE-AUDIT.md` (editorial layer).

## Ground rules honoured throughout

- **Catalogue product thumbnails are out of scope by instruction.** The white
  card background and the hover-to-reveal second photo (`.pcard-thumb`,
  `.pcard-alt`) are intentional and must not change in appearance or
  behaviour. Nothing proposed below touches `.pcard*`, the product-page
  gallery, or any product photograph presentation inside cards.
- **Performance is a constraint, not an afterthought.** Images are served
  unoptimized straight from Firebase Storage (one ~400 KB master per image,
  longest side ≤ 2048 px, immutable-cached — see `IMAGES.md`). Two useful
  consequences for this redesign:
  - *Taller banners are free.* Every banner is `background-size: cover` over
    the same master file; showing a taller crop reveals more of bytes already
    downloaded. Height changes cost zero bandwidth.
  - *CSS background banners load eagerly.* `background-image` is not
    lazy-loaded, so below-the-fold banners (home "Order Now", `pd-explore`)
    download their ~400 KB master on every first view even if never scrolled
    to. Converting them to layered `SiteImg` elements (needed anyway for
    transform-based motion) makes them lazy — a measurable win.
- **Animations stay subtle**: opacity, small translates (≤ 16 px), very slow
  scales (≤ 6 %), durations 0.5–1.2 s for entrances and 6 s+ for ambient
  motion. Everything transform/opacity only (compositor-friendly, no layout
  thrash). No bounce, no spin, no scroll-jacking, no carousels beyond the
  existing hero.
- **`prefers-reduced-motion` is currently ignored site-wide.** Any PR that
  adds motion must ship a global reduced-motion fallback (static first frame,
  instant reveals). This is a hard requirement, listed as part of PR 1.
- The admin focal-point system (`settings.imgPos` → `posFor()`) must keep
  working on every surface that has it today, and be honoured by any new
  panning/parallax layer.

---

## 1. Complete visual audit

Rendered sizes come from `app/globals.css`; the site container is
`max-width: 1500px`. "Static rectangle" below means: a cover-cropped
background image with a flat dark overlay and text that renders in the same
frame as the rest of the page — no independent life of its own.

### 1.1 Homepage hero (`.hero`, `HeroSlider` — `SitePages.jsx`)

- **Dimensions:** full-bleed, `height: 76vh` clamped to 420–820 px
  (≈ 684 px on a 900 px-tall laptop). Slides are CSS `background-size: cover`
  divs.
- **Behaviour:** admin-managed slideshow (`settings.heroSlides`), auto-advance
  every 5.2 s with a 1.1 s opacity crossfade. Centred overlay (title,
  letter-spaced subtitle, CTA) sits on a flat `rgba(0,0,0,.18)` scrim covering
  the whole frame. 48 px circular arrow buttons either side; 9 px dot pager at
  the bottom. The brown header is superimposed with a brown→transparent
  gradient. The first slide is preloaded server-side with
  `fetchPriority="high"` (`app/(store)/layout.jsx`) — LCP is already handled.
- **Strengths:** full-bleed and confident; the crossfade is calm; the header
  gradient melting into the image is genuinely premium; per-image focal
  points; LCP preload already in place; graceful empty state (dark ground).
- **Weaknesses:** each slide is a **frozen frame for 5.2 s** — the single
  biggest "static rectangle" feeling on the site; the flat full-frame scrim
  dulls the photography evenly instead of protecting only the text zone; the
  text block is welded to the page (it never re-enters per slide, so slide
  changes feel like wallpaper swaps behind fixed type); the round arrows and
  dots read as app chrome, not editorial; 820 px cap leaves dead space
  under the hero on tall monitors.

**Redesign proposal:**
- **Gentle drift (Ken Burns, restrained):** the active slide's image layer
  scales 1.00 → ~1.05 over the slide's lifetime (CSS animation,
  transform-only), alternating direction/origin per slide so consecutive
  slides don't repeat the same move. Imperceptible as "animation", but the
  image breathes. Requires slides to become layered `<img>`/`SiteImg`
  elements (or an inner background div) so the transform doesn't fight
  `background-position` focal points.
- **Independent text entrance:** on each slide change, the title/sub/CTA
  group fades and rises ~10 px, slightly delayed behind the image crossfade.
  Text and image stop living and dying together.
- **Scrim rework:** replace the flat 18 % veil with a subtle bottom-and-centre
  weighted gradient so highlights in the photography stay bright.
- **Quieter chrome:** hairline chevrons that appear on hover/pointer
  proximity instead of permanent filled circles; dots become short dashes.
- **Optional:** relax `max-height` toward ~92vh on screens > 1000 px tall.
- Reduced motion: no drift, instant crossfade, text renders in place.

### 1.2 Homepage "Order Now" banner (`.home-banner`)

- **Dimensions:** full-bleed; `.home-banner-inner` padding 110 px top/bottom
  → ≈ 300–330 px tall.
- **Behaviour:** static cover background (`settings.homeBanner` — the *same
  image* also used on every product page's order banner), flat
  `rgba(20,12,8,.45)` panel across the entire frame, centred uppercase `h2` +
  white button. No motion of any kind.
- **Strengths:** one clear message and CTA; the tallest secondary banner on
  the site; admin focal point works.
- **Weaknesses:** the 45 % full-frame overlay reduces the photograph to a
  dark texture; completely static; the image repeats on every product page,
  so by the time a visitor returns home it is invisible; a conventional
  ecommerce promo strip in a site that wants to be a publication.
- **Redesign proposal:** grow into a **cinematic closing band** (~52–60vh,
  capped ~560 px); bottom-weighted gradient scrim instead of the flat panel;
  headline and CTA **reveal on scroll** (single fade-up, once); optionally a
  slight parallax drift of the image layer (see cross-cutting item C).
  Give it its own admin image slot (or at least stop sharing with the
  product-page banner) so home has a distinct closing image.

### 1.3 The generic page banner (`.page-banner`, `PageBanner` — `SiteShell.jsx`)

Used on: **Explore landing, Explore group pages, Blog index, About, Tashi,
Contact, Order, Policy pages, product pages (per-category image), and all
not-found states.** This is the "too thin" banner.

- **Dimensions:** full-bleed strip, `min-height: 120px` (real height
  ~110–130 px with title + subtitle).
- **Behaviour:** cover-cropped background (category banner → explicit `img` →
  `settings.pageBanner` fallback), flat `rgba(30,18,10,.35)` scrim,
  left-aligned 24 px title with a small inline subtitle. Static.
- **Strengths:** consistent wayfinding; cheap; never pushes content far down
  on utility pages (right instinct for Order/Contact); focal point support.
- **Weaknesses:** at ~120 px, photography is cropped into an unrecognisable
  letterbox sliver — the worst offender for "banners are too thin";
  the *same default image* renders on most routes, producing wallpaper
  blindness; the flagship editorial surfaces (Explore, Journal, About, Tashi)
  open with the identical utility strip as the cart page — no hierarchy
  between a chapter of the brand and a checkout screen.

**Redesign proposal — a two-tier banner system (one component, `variant` prop):**
- **Chapter tier** — About, Tashi, Explore landing, Explore group pages, Blog
  index: **~34–42vh (min ~280 px)** editorial header with kicker / display
  title / subtitle hierarchy (borrowing the existing `.explore-hero` type
  system), bottom-weighted gradient scrim, text fades up once on load.
  Taller crop = more photography, zero new bytes.
- **Utility tier** — Contact, Order, Policy, not-found: keep a slim band,
  nudged to ~160 px so the image reads as a photograph rather than a smear;
  gradient scrim; otherwise unchanged. Checkout flows should stay quiet.
- **Product pages:** keep the slim tier (the product photo must stay the
  first big image), but see 1.6 for the banner-vs-breadcrumb option.

### 1.4 Collection / category headers

- **Home catalogue sections** (`.cat-section`): text-only — centred 30 px
  Raleway title + gold rule. **No imagery, by design.**
- **Product-page category banner** (`settings.categoryBanners[cat]` via
  `PageBanner`): the only place category imagery appears "as a header", at
  120 px.
- **Strengths:** the text-only catalogue scroll keeps the endless grid calm
  and product-first — this actively protects the thumbnail presentation the
  studio wants untouched.
- **Weaknesses:** category identity photography effectively never displays at
  a legible size; the long scroll has no breathing room between sections
  (sections sit 40 px apart).
- **Redesign proposal:** **do not** insert image interludes into the
  catalogue scroll — it would fight the thumbnails and add page weight for
  hundreds of products. Instead: (a) increase inter-section whitespace
  (~40 px → ~72 px) so each category feels like a chapter; (b) let category
  photography live properly on the product page's "Explore {category}" tile
  (1.6) and the taller chapter banners. A slim, optional per-category kicker
  line ("Chapter III — Rings") is a typography-only enhancement if more
  rhythm is wanted later.

### 1.5 Explore

**Landing (`/explore`):**
- **Dimensions/behaviour:** opens with the generic 120 px `PageBanner`
  (default image, static), then lead paragraph, search, and shelves of topic
  cards (4:3 cover thumbs, hover scale 1.04 + card lift — consistent with the
  rest of the site).
- **Strengths:** the shelf/card system below the fold is strong: clean grid,
  good hover behaviour, graceful monogram fallback for missing images.
- **Weaknesses:** the brand's most editorial section opens with the same thin
  utility strip as the cart; every shelf renders the identical 4-across grid
  — no rhythm, nothing featured.
- **Redesign proposal:** chapter-tier header (1.3) with its own image slot;
  **editorial rhythm in the shelves** — the first topic of each shelf (or a
  flagged "featured" topic) renders as a wide 2-column card with a larger
  16:9 crop and excerpt, remaining topics in the existing grid. Magazine
  cadence with the existing card componentry.

**Group / shelf pages (`/explore/<group>`):**
- **Dimensions/behaviour:** `PageBanner` with `group.heroImage` — a real,
  curated hero image displayed at **120 px tall**. Static.
- **Weaknesses:** this is the clearest single waste of good imagery on the
  site: a dedicated hero uploaded per shelf, cropped to a sliver.
- **Redesign proposal:** reuse the **topic hero** (`.explore-hero`) treatment
  at chapter height — kicker "Explore", display title, description below.
  Component already exists; the group page just doesn't use it.

**Topic pages (`/explore/topic/<slug>`, `.explore-hero`):**
- **Dimensions:** full-bleed; padding 64/58 px + kicker/title/sub ≈
  **240–280 px**. Brown gradient when no image; cover image + flat
  `rgba(30,18,10,.44)` scrim when set.
- **Behaviour:** static. Body blocks below: hotspot editorial images
  (in-article, width 820 px article measure), 2-column gallery, floating
  product cut-outs (min(44%, 300 px)), pull quotes, callouts. Hotspots pulse
  on hover only.
- **Strengths:** the best header on the site — real type hierarchy, graceful
  fallback, per-topic focal point; the block system is already an editorial
  toolkit (this is the design language the rest of the site should move
  toward).
- **Weaknesses:** hero still modest for an article opening; flat scrim; the
  article's editorial images and quotes all render instantly — a long topic
  page has no unfolding.
- **Redesign proposal:** heroes with an image grow to **~46–52vh**; gradient
  scrim; title group fades up on load. Optional subtle parallax on the hero
  image layer (cross-cutting item C). In-article: editorial figures, galleries
  and quotes join the reveal-on-scroll system (single 0.6 s fade-up at
  ~15 % visibility — an unfolding read, not an animation show).

### 1.6 Product page editorial banners

- **Top banner:** `PageBanner` with the category image — 120 px strip
  (audited in 1.3).
- **"Order Now" banner (`.pd-order-banner`):** full-bleed, padding 40 px +
  ~110 px frosted-glass card ≈ **190 px tall**; flat `rgba(30,18,10,.22)`
  scrim; the glass card fades up on page load (`lux-fade-up`). Shares its
  image with the home banner.
- **"Explore {category}" tile (`.pd-explore`):** full-bleed,
  `min-height: 220px`, cover image, 40 % scrim darkening to 52 % on hover,
  title letter-spacing eases open on hover, inner text fades up on load.
- **Strengths:** the frosted-glass order card is already a premium,
  photography-respecting device — keep it; the explore tile's hover
  behaviours are exactly the right register of subtle.
- **Weaknesses:** at 190 px the order-banner photograph is nearly invisible
  behind card + scrim; both banners animate on *page load* (they're below
  the fold — the entrance has already finished before anyone sees it);
  the explore tile's image fallback chain still reads the legacy
  `settings.homeTiles` slot removed from the admin
  (see `SITE-IMAGES-AUDIT.md` — flagged for a storefront follow-up);
  both banners are eager-loading CSS backgrounds (~400 KB each) on **every**
  product page view.
- **Redesign proposal:** order banner grows to **~300–340 px** with the glass
  card offset to one side (editorial asymmetry) and a gradient scrim; both
  banners switch load-time entrances to **reveal-on-scroll** (the entrance
  finally happens where the visitor can see it); explore tile to
  ~280–300 px with a gentle image scale on hover (matching card language);
  convert both to layered lazy `SiteImg` (bandwidth win, and required for
  any image-layer motion); drop the dead `homeTiles` branch and dead tile CSS
  in the same change.

### 1.7 About page

- **Dimensions/behaviour:** 120 px `PageBanner` (`settings.aboutBanner`),
  then a pure-text article (max-width 920 px). `.about-figure` CSS exists but
  **no component renders it** — the page has no body imagery at all.
- **Strengths:** restrained, readable long-form typography; category tag row
  is a nice touch.
- **Weaknesses:** the page that tells the brand story is the least visual
  page on the site; the dedicated banner upload renders at 120 px.
- **Redesign proposal:** chapter-tier header; **one to two editorial figures**
  in the body (atelier / workshop / place photography) as full-width figures
  with captions on the article measure, alternating with text — the dead
  `.about-figure` CSS is the intended hook. Requires new admin slots (or an
  images-in-content mechanism), so this is a coupled admin + storefront
  change. Generous whitespace; a serif drop-cap or Cormorant lead line would
  push it further toward print without new imagery.

### 1.8 Tashi Mannox page

- **Dimensions/behaviour:** opens with the **generic default** `PageBanner`
  (no dedicated banner slot exists for this page), then a two-column intro:
  text left, portrait right (`settings.tashiPhoto`, uncropped ~5:6, column
  ≈ 660 px wide), then the product grid, then the derived topic-links strip.
- **Strengths:** the uncropped portrait is the correct instinct (never crop a
  portrait into a banner); the two-column intro is solid editorial layout;
  the quiet topic-link footer is elegant.
- **Weaknesses:** the site's single collaboration page opens with the same
  banner as the refund policy; the portrait just appears (no presentation);
  a page about a **calligrapher** contains no calligraphy imagery outside
  product shots.
- **Redesign proposal:** dedicated banner slot (ideally a wide crop of his
  brushwork) at chapter height; portrait gets a reveal-on-scroll and a small
  caption line (name · practice) in the caption style used by Explore
  figures; optional full-bleed calligraphy interlude band between intro and
  products (same banner componentry, no new machinery). Admin slot additions
  couple this with 1.7.

### 1.9 Journal (blog)

**Index (`/blog`):**
- **Dimensions/behaviour:** 120 px generic `PageBanner`, then a uniform
  3-column card grid (3:2 cover thumbs, hover lift + 1.04 scale).
- **Strengths:** cards are consistent with Explore; clean.
- **Weaknesses:** no hierarchy — the latest story renders identically to the
  oldest; generic thin banner again.
- **Redesign proposal:** chapter-tier header; **featured-first layout** — the
  newest (or a flagged) post renders full-width above the grid: wide ~21:9
  image with title/date/excerpt beside or beneath it; remaining posts keep
  the existing grid. Classic magazine front page, built from existing pieces.

**Post (`/blog/<slug>`):**
- **Dimensions/behaviour:** full-width `.blog-hero` cover image at
  aspect-ratio 16:6 (≈ 540 px tall at 1440 px viewport), `priority`-loaded,
  then a narrow 760 px article. Body images render as plain centred `<img>`.
- **Strengths:** the full-bleed hero with the title *below* in the article
  measure is already the most editorial page opening on the site; correct
  priority loading.
- **Weaknesses:** hero appears abruptly; body images are unstyled relative to
  Explore's figure treatment (no captions styling, no rhythm).
- **Redesign proposal:** minor — a slow settle on the hero (opacity + 1.02→1
  scale over ~0.9 s, load-time only, reduced-motion aware); adopt Explore's
  figure/caption styling for Markdown body images; slightly more whitespace
  around the title block. This page mostly needs less than the others.

### 1.10 Footer

- **Dimensions/behaviour:** no photographic imagery — brown contact strip,
  three text columns on `#faf8f5`, brand-coloured social icons (hover lift +
  tooltip).
- **Strengths:** a quiet, text-led close is the *right* luxury move; the
  coloured social icons are the one loud element.
- **Weaknesses:** none structural. Adding imagery here would compete with the
  closing banners above it.
- **Redesign proposal:** deliberately **keep the footer imagery-free** and
  record that as a decision. Optional refinements only: more vertical
  whitespace, and consider monochrome (brown/gold) social icons to complete
  the editorial register — flagged as a taste call for the studio, not a
  recommendation this plan depends on.

### 1.11 Decorative imagery & micro-devices

- **Inventory:** gold rule (`.rule-dot`), Explore's ◆ divider, the Tashi
  corner badge on cards/product photos, Cormorant monogram placeholders for
  missing images, the frosted-glass cart notice.
- **Assessment:** all healthy and on-brand; the monogram fallbacks and glass
  surfaces are quietly excellent. The ◆ divider deserves wider use (About,
  Journal posts) as the brand's section mark. No redesign needed — reuse.

### 1.12 Cross-cutting observations

1. **No scroll-driven presentation exists anywhere.** All entrances are
   load-time (`lux-fade-up`) — and two of the three uses are below the fold,
   so the animation plays unseen. One tiny `IntersectionObserver` hook +
   a `.reveal` CSS class fixes both.
2. **Every overlay is a flat veil** (18–45 % darkness edge to edge). A small
   set of shared gradient scrims (bottom-weighted for text-at-bottom,
   centre-vignette for centred text) would immediately make the same
   photography look richer on every banner.
3. **`prefers-reduced-motion` is unsupported site-wide** — required baseline
   before adding more motion.
4. **CSS-background banners are eager and untransformable.** The same
   conversion (layered `SiteImg` inside an overflow-hidden frame) yields lazy
   loading *and* a motion-capable image layer.
5. **Image repetition:** `homeBanner` on home + every product page;
   `pageBanner` default on most routes. Distinct slots per surface would do
   as much for perceived quality as any animation.

---

## 2. Ranked improvements (with difficulty)

Ranked by impact-per-risk on the "luxury editorial" goal. Difficulty:
**Low** (hours, CSS-mostly) · **Medium** (a day-ish, component work) ·
**High** (multi-day, admin + storefront + testing).

| # | Improvement | Surfaces | Difficulty | Notes |
|---|---|---|---|---|
| 1 | **Two-tier banner system** — chapter headers (~34–42vh) for About, Tashi, Explore landing/groups, Blog index; slim-but-taller utility tier elsewhere | `PageBanner` + 10 routes | **Medium** | Kills "banners too thin" in one move; taller crops cost zero bytes |
| 2 | **Gradient scrim system** replacing all flat overlays | hero, all banners, tiles | **Low** | Pure CSS; biggest visual gain per line changed |
| 3 | **Reveal-on-scroll utility** (+ global `prefers-reduced-motion` support) applied to banner text, section titles, Explore figures/quotes | site-wide | **Medium** | One IO hook + one CSS class; fixes unseen below-fold entrances |
| 4 | **Hero: slow drift + independent text entrance + quieter chrome** | homepage hero | **Medium** | Needs slides converted to layered elements; LCP preload already exists — keep it |
| 5 | **Explore group pages adopt the topic-hero treatment** | `/explore/<group>` | **Low** | Component already exists; rescues curated hero images from the 120 px strip |
| 6 | **Product-page banner pass**: taller order banner w/ offset glass card, taller explore tile, scroll-triggered entrances, lazy layered images, drop legacy `homeTiles` fallback + dead tile CSS | product pages | **Medium** | Includes the storefront follow-up flagged in `SITE-IMAGES-AUDIT.md`; bandwidth win on every product view |
| 7 | **Home "Order Now" → cinematic closing band** with its own image slot | homepage | **Medium** | Low risk; small admin addition for the dedicated slot |
| 8 | **Journal featured-post magazine layout** + post-hero settle + figure styling for body images | `/blog`, `/blog/<slug>` | **Medium** | Existing card componentry recomposed |
| 9 | **Explore landing rhythm** — featured wide topic card per shelf | `/explore` | **Medium** | Alternating image rhythm without new data (first topic = featured), optional admin flag later |
| 10 | **About & Tashi editorial upgrades** — dedicated Tashi banner slot, About body figures (revive `.about-figure`), portrait presentation, calligraphy interlude | About, Tashi + admin | **High** | Only item needing new admin slots/schema; pairs naturally with #7's slot work |
| 11 | **Whitespace & rhythm pass** — catalogue section spacing, title margins, footer breathing room | home scroll, footer | **Low** | Quiet but compounding; zero risk to thumbnails |
| 12 | **Subtle parallax on tall banners** (transform-based image layer, ≤ 8 % travel, desktop-pointer only, reduced-motion off) | topic heroes, home banner, order banner | **High** | Deliberately last: nice-to-have, needs the most cross-device QA; ship only after 1–7 prove the layered-image architecture |

Explicitly **not proposed**: image interludes inside the catalogue scroll,
autoplaying video, scroll-jacked sections, hover effects on catalogue
thumbnails, text-over-product-photo treatments, or any change to the
white-background / hover-second-image card behaviour.

---

## 3. PR grouping

Each PR is independently shippable and visually coherent on its own; order
matters because later PRs reuse earlier machinery.

**PR A — Motion & scrim foundations** *(items 2, 3; Low–Medium)*
Global `prefers-reduced-motion` support, the `.reveal` IntersectionObserver
utility, the gradient-scrim CSS system applied to existing banners at current
sizes, and retargeting the two below-fold `lux-fade-up` entrances to
scroll-trigger. No layout or height changes — a pure presentation-quality PR
that everything else builds on.

**PR B — Banner architecture** *(items 1, 5, 11; Medium)*
The two-tier `PageBanner` (chapter/utility variants), applied per route;
Explore group pages switch to the topic-hero treatment; the whitespace pass.
This is the PR where "banners are too thin" visibly dies.

**PR C — Homepage hero** *(item 4; Medium)*
Layered slides, slow drift, per-slide text entrance, quieter arrows/dots,
optional height relaxation. Self-contained in `HeroSlider` + hero CSS.

**PR D — Product page & home closing banners** *(items 6, 7; Medium)*
Order banner + explore tile redesign, lazy layered images, scroll entrances,
`homeTiles` fallback removal + dead CSS deletion, home banner cinematic band,
new dedicated home-banner slot in the admin.

**PR E — Journal & Explore editorial layouts** *(items 8, 9; Medium)*
Featured-post front page, post-hero settle, body-figure styling; featured
topic cards on the Explore landing.

**PR F — About & Tashi storytelling** *(item 10; High)*
New admin slots (Tashi banner, About figures) plus their storefront
rendering. Kept last of the core PRs because it is the only schema-touching
work.

**PR G (optional) — Parallax layer** *(item 12; High)*
Only if PRs A–D land well and the studio wants more depth. Small, isolated,
easy to revert.

---

## 4. Success criteria

- Photography is legible at real sizes on every editorial route (no curated
  image rendered under ~280 px tall on chapter pages).
- Every entrance happens where the visitor can see it; nothing moves for
  users with reduced motion enabled.
- No regression to catalogue thumbnail appearance or behaviour (existing e2e
  coverage in `e2e/` should be extended with a card-hover snapshot before
  PR B lands, as a guard).
- Page weight on product pages goes **down** (two eager 400 KB backgrounds
  become lazy); home LCP stays flat (preload untouched).
- The identity — brown/gold, Raleway/Poppins/Cormorant, glass surfaces, gold
  rules — is untouched; only presentation of imagery changes.
