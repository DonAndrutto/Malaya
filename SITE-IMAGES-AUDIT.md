# Site Images — admin slot audit

Phase 1 audit of the admin **Site images** tab
(`components/admin/SiteImages.jsx`), mapping every upload slot to its real
storefront usage before the cleanup. Scope is **admin only** — no storefront
markup, CSS or behaviour is changed in this PR, and no Firestore schema
changes are made. Every existing uploaded image keeps rendering, because the
storefront read paths (the `settings.*` keys) are untouched.

## How the slots reach the storefront

Uploads save to Firebase Storage; their download URLs are written to one
Firestore document, `siteSettings/images`, under fixed keys. The storefront
reads those keys live (`components/store/site/*`). The admin is only an editor
for those keys — removing an admin upload area does **not** delete any stored
image, and any key the storefront still reads keeps working.

## Slot inventory

Sizes below are the *rendered* boxes on the live site (from `app/globals.css`),
not the upload size. All banner/hero/tile slots are CSS `background-size: cover`
or `object-fit: cover`, so the image is centre-cropped to the box; the exact
box ratio flexes a little with the viewport, so the "recommended" column is a
clean, safely-oversized master that crops well.

| Slot (admin) | Key | Where it renders | CSS box | Real orientation | Old admin preview | Recommended upload | Ratio | Verdict |
|---|---|---|---|---|---|---|---|---|
| Header logo | `logo` | Site header, every page | `.hdr-logo img` — `height:74px; width:auto` (contain, transparent) | Horizontal, **not** cropped | 92×92 **square** thumb | 480 × 160 px | ≈ 3:1 (flexible width) | **Stay** — reshape |
| Tashi Mannox badge | `tashiBadge` | Corner badge on catalogue cards (`.pcard-tashi`, 44px) & product pages (`.pd-tashi`, 54px) | `width:44–54px; height:auto` (contain, transparent) | Square, **not** cropped | 92×92 square thumb | 240 × 240 px | 1:1 | **Stay** |
| Home hero slideshow | `heroSlides[]` | Home hero (`.hero`, `height:76vh`, cover) | Full-bleed, ~2:1–2.3:1 | Wide landscape | 16:9 focal ✓ | 2400 × 1350 px | 16:9 | **Stay** — add dims |
| Home "Order Now" banner | `homeBanner` | Home foot (`.home-banner`) **and** every product page (`.pd-order-banner`), cover | Full-bleed short band | Wide landscape | 3:1 focal | 1920 × 720 px | 8:3 | **Stay** |
| Default page banner | `pageBanner` | Breadcrumb banner (`.page-banner`, `min-height:120px`, cover) on Contact / Order / Tashi / Policy / 404, and the fallback for every other banner | Full-bleed thin band | Wide landscape | 3:1 focal | 1920 × 480 px | 4:1 | **Stay** |
| About page banner | `aboutBanner` | About page `.page-banner` | same as page banner | Wide landscape | 3:1 focal | 1920 × 480 px | 4:1 | **Stay** |
| Tashi Mannox portrait | `tashiPhoto` | Tashi page (`.tashi-photo img` — `width:100%; height:auto`) | Portrait, **not** cropped (rendered ~5:6) | Portrait | 92×92 square thumb, no preview | 1000 × 1200 px | 5:6 | **Stay** — reshape |
| Category product-page banners | `categoryBanners[cat]` | Top of every `/product/<id>` of that category (`.page-banner` via `category`); also feeds the product-page "Explore" tile | same as page banner | Wide landscape | 3:1 focal | 1920 × 480 px | 4:1 | **Stay** |
| **Home category tiles** | `homeTiles[cat]` | **Homepage tiles removed.** Only a hidden first-choice fallback for the product-page "Explore {category}" tile (`.pd-explore`) | `.home-tile img` is **dead CSS** (`aspect-ratio:3/4`, rendered by no component); the live tile is the wide `.pd-explore` band | Portrait frame is dead; live use is a **wide** band | **3:4 portrait** focal | — | — | **Remove** |

## Classification

- **Actively used (8):** `logo`, `tashiBadge`, `heroSlides`, `homeBanner`,
  `pageBanner`, `aboutBanner`, `tashiPhoto`, `categoryBanners`.
  All kept; all reshaped so the preview frame matches the on-site aspect ratio
  and now show the recommended pixel size + ratio.
- **Legacy:** `homeTiles` ("Home category tiles"). Built for a homepage
  category-tile section that has since been removed from the storefront.
- **Duplicated:** `homeTiles` vs `categoryBanners`. Both are per-category
  images, and both ultimately feed the same product-page "Explore {category}"
  tile (`exploreImg = homeTiles[cat] || categoryBanners[cat] || pageBanner`).
- **Unreachable:** the *portrait* `3:4` tile that `homeTiles` was previewed as.
  The CSS that rendered it (`.home-tiles`, `.home-tile*`, `.home-best*` in
  `app/globals.css`) is dead — no component renders those classes.
- **Obsolete → removed:** the **"Home category tiles"** admin grid. It is the
  portrait upload box the storefront no longer surfaces as tiles, and it
  duplicates the per-category "Category banners" grid for the only tile it
  still touches.

## What changed in the admin

1. **Removed** the "Home category tiles" section (the portrait `3:4` grid).
2. Every remaining slot now renders its **preview frame at the true on-site
   aspect ratio**, with a **recommended pixel size** and **ratio badge**:
   - Cover-cropped slots (hero, banners, category banners) keep the draggable
     focal-point picker, now shaped to the real banner ratio instead of a
     generic `3:1`.
   - Uncropped slots (logo, badge, portrait) show a **contain** preview — what
     actually ships — instead of a square 92×92 thumbnail: the logo on a
     header-toned frame, the badge as `1:1`, the portrait as `5:6`.

## Deliberately out of scope (storefront — future PR)

Kept untouched to honour "no storefront changes in this PR", flagged here for a
follow-up storefront-only change:

- **`homeTiles` read path.** The storefront still reads `homeTiles` as the
  first fallback for the "Explore {category}" tile, so any image already
  uploaded there keeps rendering. New/edited Explore-tile images should be set
  via **Category banners** (the surviving per-category slot). A follow-up
  storefront PR can drop the redundant `homeTiles` branch from `exploreImg` so
  the fallback is simply `categoryBanners → pageBanner`.
- **Dead tile CSS.** `.home-tiles`, `.home-tile`, `.home-tile-body`,
  `.home-tile-title`, `.home-tile-cta`, `.home-best`, `.home-best-cta` in
  `app/globals.css` are rendered by no component and can be deleted in the same
  storefront PR.
