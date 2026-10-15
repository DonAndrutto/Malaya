# Missing-image investigation — 15 October 2026

## Cause observed on the connected Mac

Real Chromium image loading was tested at 1440px and 390px against preview
`ae31f7c` and production `5ff52d4`, without image interception or substitutions.
Both failed identically: `net::ERR_NAME_NOT_RESOLVED` for
`firebasestorage.googleapis.com`; image `naturalWidth` remained zero. There
was no HTTP response/status from Storage because hostname resolution failed.
A direct OS/Node lookup and curl confirmed the same error.

The sampled catalogue and `/product/p009` image URLs were exactly identical
between preview and production, including object paths and download tokens.
Examples are `products/P055-S/P055-S-1.jpg` and
`products/R046-S-ON/R046-S-ON-1.jpg`. The logo, home hero background and Tashi
badge settings also reached the rendered page. The settings dependency remains
in the shared layout and is preserved by the nested route context. CSP permits
the Storage host. No source image/context regression was found.

The Mac's normal resolver fails for this hostname, while Google's public
DNS-over-HTTPS resolves it successfully. This narrows the failure to the
normal device/network DNS path, not the bucket, tokens or preview build.
Device-specific network identifiers are omitted from this public report.
The particular DNS policy responsible has not been changed or determined.

## Real delivery verification

A diagnostic Chromium process was launched with a temporary host-resolver
mapping using a current public DNS answer. It still requested the original
Firebase HTTPS URLs and validated TLS normally. No application URL rewrite,
proxy, Vercel optimizer, replacement image, OS DNS change, VPN change, Storage
permission/rule change or production content mutation was used.

With only that diagnostic DNS mapping, preview and production return HTTP 200
with image/jpeg or image/png. Visible catalogue photos and the product hero
decode at 800px intrinsic width on desktop/mobile; the logo and CSS hero
background also decode. Screenshots show the actual jewellery. There are no
image console errors in those checks. Aborted lazy requests caused by leaving
a page are distinct from failed visible-image delivery.

This is **not** a claim that normal Mac DNS was repaired. For normal browsers
on this network, `firebasestorage.googleapis.com` must be allowed/resolved by
the active VPN/DNS path, or an approved working DNS configuration must be used.
No device networking or privacy settings were changed as part of the PR.

## Regression coverage added

The earlier cart/SEO suites deliberately blocked images, and the old image
checks could treat an element's presence as success. `e2e/images.spec.js` now
checks real HTTP image responses, complete loading, positive decoded pixel
dimensions and visible catalogue/product images. It also checks that shared
settings reach the logo and home hero background, and retains the direct
Storage/no-optimizer, immutable-cache and LCP-priority contracts. Image tests
now run on mobile as well as desktop (six cases).

Normal acceptance run (uses ordinary DNS; will detect this Mac's failure):

```sh
BASE_URL=<preview> node scripts/check-image-delivery.mjs
```

Explicit diagnostic comparison:

```sh
BASE_URL=<preview> node scripts/check-image-delivery.mjs --public-dns
```

The diagnostic flag affects only that test browser process and logs its use.
It is not enabled by default and does not alter runtime app behavior. The
runner disables write-through tests and clears E2E admin credential variables.
Both acceptance and diagnostic checks use real image bytes, never fixtures.
