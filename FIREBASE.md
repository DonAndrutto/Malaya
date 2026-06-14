# Firebase, images & the admin → catalogue link

The storefront (real routes: `/`, `/catalogue`, `/product/[id]`, `/tashi`,
`/about`, `/contact`, `/order`) reads the catalogue from a shared override layer.
The `/admin` console writes to that layer, and **Firebase** persists it:

- **Firestore** holds the admin's edits and image URLs
  - `catalogueOverrides/{productId}` — per-product edits (name, sub, category,
    collection, material, stock, list/sale price, **`img`** = uploaded photo URL)
  - `siteSettings/images` — site-element image URLs (logo, hero slideshow,
    category tiles, banners, Tashi portrait)
- **Storage** holds the uploaded image files
  - `products/{productId}/…` — product photos
  - `site/{slot}/…` — hero slides, banners, tiles, logo, portrait

The public site subscribes to Firestore live, so an edit or upload in `/admin`
appears on the catalogue immediately (and across devices). localStorage is kept
as a cache for instant first paint and offline use.

## 1. Configuration

The Firebase web config is **public** by design (the API key only identifies the
project — access is controlled by the rules below), so the project values are
baked into `lib/firebase.js`. To point at a different project, set the
`NEXT_PUBLIC_FIREBASE_*` vars (see `.env.example`) in Vercel / `.env.local`.

## 2. Deploy the security rules

Rules live in `firebase/` and are referenced by `firebase.json`:

```bash
npm i -g firebase-tools     # once
firebase login
firebase deploy --only firestore:rules,storage --project malaya-catalogue
```

In the Firebase console, make sure **Cloud Firestore** and **Storage** are
enabled for the project.

### ⚠ Write access

The shipped rules allow **public reads** and, so uploads work before you set up
auth, **open writes** to the two collections / Storage paths (image files only,
< 15 MB). Before launch, tighten them:

1. Enable an auth provider (e.g. Email/Password) in the Firebase console and
   create your studio user.
2. In `firebase/firestore.rules` and `firebase/storage.rules`, switch the
   `allow write: if true` / `isAdminImage()` lines to the commented
   `request.auth != null` versions and redeploy.
3. Ask and I'll wire the admin login to Firebase Auth (it currently accepts any
   credentials).

## 3. Seed the existing images into the repo (optional)

By default images are served from the live CDN, which works today. To serve them
from the repo instead:

```bash
npm run fetch-images        # downloads into public/images/{products,site}
# commit public/images, then set:
NEXT_PUBLIC_IMAGE_SOURCE=local
```

`<SiteImg>` falls back local → CDN → smaller-size, so a missing local file still
resolves. Run the script where `malayajewelrybhutan.com` is reachable (some
sandboxes block it).

## 4. Using the admin

- **Catalogue prices / Mass edit / Stock ledger** — edit any product field.
- **Edit drawer → Image** — upload/replace a product photo (→ Storage → the URL
  is saved to the product's Firestore doc → shows on the catalogue).
- **Site images tab** — replace the logo, hero slideshow, category tiles,
  banners and the Tashi portrait.
