# Image delivery

How product / blog / explore photography gets from the admin console to a
visitor's screen, and why the Next.js (Vercel) image optimizer is **disabled**.

## The pipeline

1. **Upload (admin console).** Every image picked in the admin is first
   downscaled in the browser by `resizeImageFile()` (`lib/image-resize.js`):
   longest side ≤ 2048 px; opaque photos are re-encoded as JPEG within a
   ~400 KB budget (transparent PNG/WebP keep their format, ~600 KB budget).
2. **Storage.** `uploadImage()` (`lib/upload.js`) writes the file to Firebase
   Storage under a unique timestamped name with
   `Cache-Control: public, max-age=31536000, immutable`, and the returned
   download URL is stored in Firestore (`catalogueOverrides`, blog posts,
   explore topics, `siteSettings/images`). One file per image — no variants.
3. **Render (storefront).** All content imagery goes through the `SiteImg`
   wrapper (`components/store/site/SiteShell.jsx`), the only `next/image`
   consumer. With `images.unoptimized: true` (`next.config.mjs`) the browser
   downloads the stored file **directly from Firebase Storage** — no
   `/_next/image` URLs anywhere. `next/image` is kept because lazy loading,
   width/height layout reservation, and `priority` (LCP preload +
   `fetchpriority="high"`) all work without the optimizer.

Blog *body* images (Markdown `![…]()`) always rendered as plain `<img>`
(`components/store/site/Markdown.jsx`) and page banners are CSS backgrounds —
neither ever used the optimizer.

## Why the optimizer is disabled

The site runs on the Vercel **Hobby** plan, whose monthly Image Optimization
transformation quota the catalogue exhausts. Once the cap is hit, only
transformations already in Vercel's edge cache keep serving; every *new*
(image, width, format) combination fails with a 402 and `SiteImg`'s `onError`
hides the element. That produced the confusing failure pattern that prompted
this change:

- **Thumbnails kept working** — small variants are requested on every listing
  render across the whole catalogue, so they were cached before the cap.
- **Full-size product photos vanished** — large hero variants are only
  requested when a specific product page is opened, so less-visited products'
  variants were never cached and every fresh request failed.
- **Blog imagery kept working** — body images bypass the optimizer entirely,
  and the few cover variants were already cached.

Disabling optimization only for the catalogue was considered and rejected: the
quota is project-wide (blog/explore would inherit the same failure mode), all
image kinds share the single `SiteImg` wrapper (no clean seam), and catalogue
thumbnails are the heaviest quota consumers anyway.

Direct serving is safe **because uploads are already delivery-ready**: masters
are pre-sized and byte-budgeted at upload time (step 1), immutable-cached for
a year (step 2), the bucket is publicly readable (`firebase/storage.rules`),
the CSP `img-src` already allows `firebasestorage.googleapis.com`, and
`app/layout.jsx` preconnects to it.

## One-off step: backfill Cache-Control on old images

The uploader has only set the immutable Cache-Control header since the
"production hardening" commit, and older runs of `scripts/fetch-images.mjs`
never set one at all. Anything uploaded without it serves
`private, max-age=0` — every page view re-downloads it, which was harmless
behind the optimizer's own cache but is wasteful when serving directly. A
census at the time of this change: **1082 of 1084** live product images
lacked the header. Run (with the same service-account setup as
`grant-admin`):

    npm run backfill-image-cache -- --dry-run   # report what would change
    npm run backfill-image-cache                # patch cacheControl metadata

It is idempotent and only touches the `cacheControl` field of `image/*`
objects (download tokens are untouched). `fetch-images.mjs` now sets the
header itself, so newly seeded images don't need this. The e2e suite
(`e2e/images.spec.js`) asserts the immutable header on catalogue photos, so
it will flag a bucket that still needs this backfill.

## Trade-offs accepted

- **Grids are heavier.** A card slot that previously received a ~15–40 KB
  right-sized AVIF now downloads the ~400 KB master. Lazy loading bounds the
  initial page weight and the immutable cache makes it a one-time cost per
  browser, but first visits ship more bytes.
- **No AVIF/WebP for opaque photos.** Masters are JPEG; format conversion only
  happened in the optimizer.
- **Image egress moves from Vercel to Firebase Storage.** Watch the Firebase
  console's Storage download usage; each visitor cache-miss now downloads the
  master from the bucket.

## If this needs revisiting

- **Revert (Vercel Pro / higher quota):** restore the previous `images` block
  in `next.config.mjs` (git history of this change has it: `remotePatterns`
  for `firebasestorage.googleapis.com`, `formats: ['image/avif','image/webp']`,
  `deviceSizes`, `imageSizes`, `minimumCacheTTL: 31536000`) and put the
  optimizer assertions back in `e2e/images.spec.js`. Nothing else changed —
  `SiteImg` call sites still pass `sizes`, which is inert while unoptimized.
- **If grid bandwidth becomes a measured problem** (Firebase egress or slow
  first paints): generate a small thumbnail variant at upload time alongside
  the master — `resizeImageFile()` already does canvas resizing, so a second
  pass (e.g. 480 px) plus a `thumb` field on products and a one-off backfill
  script is an additive change. Do not reintroduce keyword-matching or
  runtime resizing infrastructure for this.
