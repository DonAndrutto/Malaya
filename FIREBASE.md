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

### Write access — admin sign-in (Firebase Auth)

The admin console signs in with **Firebase Auth (Email/Password)** and the
shipped rules require authentication (`request.auth != null`) for all writes;
reads stay public. To go live:

1. In the Firebase console → **Authentication** → enable the **Email/Password**
   provider, then **Add user** with the studio's email + password.
2. Deploy the rules (step 2 above).
3. Sign in at `/admin` with that email + password.

`lib/auth.js` wraps sign-in/out; `lib/firebase.js` exposes the auth instance.
If Firebase isn't configured at all (a bare local checkout), the admin falls
back to demo mode (any credentials) so you can't lock yourself out.

> To temporarily re-open writes (no sign-in required) while testing, swap the
> active rule lines back to the commented `if true` versions and redeploy.

## 3. Seed the existing images into Firebase

`scripts/fetch-images.mjs` moves the live site's imagery into **your own
Firebase** — nothing is downloaded into the repo or committed (the checkout
stays lightweight). For each image it:

1. downloads it from `malayajewelrybhutan.com` into memory,
2. uploads it to Firebase **Storage** (`products/{id}/…`, `site/{slot}/…`),
3. writes the Storage URL into **Firestore** (`catalogueOverrides/{id}.img` and
   `siteSettings/images`), which the storefront reads live.

It uses the **Admin SDK**, so it bypasses the security rules (works whether or
not auth is set up). Provide a service account (console → Project settings →
Service accounts → Generate new private key):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
npm run fetch-images                 # seed everything
npm run fetch-images -- --dry-run    # preview, no writes
npm run fetch-images -- --force      # re-upload even if already present
```

Reruns are idempotent: images already in Storage are reused (their existing
download token is kept) and only Firestore is refreshed. Anything not yet seeded
keeps falling back to the CDN, so the site works throughout.

## 4. Using the admin

- **Catalogue prices / Mass edit / Stock ledger** — edit any product field.
- **Edit drawer → Image** — upload/replace a product photo (→ Storage → the URL
  is saved to the product's Firestore doc → shows on the catalogue).
- **Site images tab** — replace the logo, hero slideshow, category tiles,
  banners and the Tashi portrait.
