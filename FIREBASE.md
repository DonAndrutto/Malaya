# Firebase, images & the admin → catalogue link

The storefront (real routes: `/`, `/catalogue`, `/product/[id]`, `/tashi`,
`/about`, `/contact`, `/order`) reads the catalogue from a shared override layer.
The `/admin` console writes to that layer, and **Firebase** persists it:

- **Firestore** holds the admin's edits and image URLs
  - `catalogueOverrides/{id}` — per-item edits, where `{id}` is a catalogue
    product id (`p001`), a live-site extra (`x001`) **or a stock-ledger SKU**
    (`P020-S`). Fields:
    - name, sub, category, collection, material, stock, list/sale price
    - **`published`** (boolean) — when set on a ledger SKU, that stock line goes
      live on the storefront (keyed by its SKU). Items can be published with **no
      image** at all.
    - **`story`** (string) — editable narrative shown on the product page
      (blank lines separate paragraphs)
    - **`images`** (string[]) — gallery of uploaded photo URLs. `img` mirrors
      `images[0]` (the primary photo) for the many single-image surfaces
      (cards, cart, mega-menu).
    - **`topics`** (string[]) — Explore knowledge-topic slugs this piece is
      linked to (drives the topic page's product grid, the product page's
      symbolism section and the catalogue Symbol filter).
  - `siteSettings/images` — site-element image URLs (logo, hero slideshow,
    category tiles, banners, Tashi portrait)
  - `exploreTopics/{slug}` — Explore knowledge topics: block-based editorial
    pages (`/explore/topic/<slug>`). Draft until `published: true`. Seed with
    `npm run seed-explore` (topics seed as **drafts** so no placeholder pages
    get indexed; publish each from /admin → Explore when content is ready).
  - `exploreGroups/{slug}` — Explore navigation shelves; membership and
    per-shelf order live in the ordered `topicSlugs` array.
- **Storage** holds the uploaded image files
  - `products/{productId}/…` — product photos
  - `site/{slot}/…` — hero slides, banners, tiles, logo, portrait
    (`site/explore/{slug}/…` — Explore heroes, hotspot photos, galleries)

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

The repo pins the CLI's default project in `.firebaserc`, so a bare
`firebase deploy` from this directory always targets **malaya-catalogue** —
without the pin the CLI silently uses whatever project `firebase use` last
selected, and a deploy can "succeed" against the wrong project while the real
site keeps enforcing stale rules. The tell for stale rules is the admin's
`⚠ Cloud save failed (permission-denied)` toast on writes that the current
rules in `firebase/` clearly allow; the deployed rules are shown in the
Firebase console → Firestore → Rules.

In the Firebase console, make sure **Cloud Firestore** and **Storage** are
enabled for the project.

To verify Explore seed data landed on the project the site actually reads
(no credentials needed — this is the same public query the storefront runs):

```bash
curl -sS -X POST 'https://firestore.googleapis.com/v1/projects/malaya-catalogue/databases/(default)/documents:runQuery' \
  -H 'Content-Type: application/json' \
  -d '{"structuredQuery":{"from":[{"collectionId":"exploreGroups"}],"where":{"fieldFilter":{"field":{"fieldPath":"published"},"op":"EQUAL","value":{"booleanValue":true}}}}}'
# expect the 4 seeded shelves; a bare [{"readTime":…}] means the collection is empty
```

### Write access — admin sign-in (Firebase Auth) + allowlist

The admin console signs in with **Firebase Auth (Email/Password)**. The shipped
rules require the signed-in user to actually be an **admin** — either the
`admin: true` custom claim or an allowlist document at `admins/{uid}`. A bare
`request.auth != null` check is *not* enough: with Email/Password enabled,
anyone on the internet can self-register an account against the public web API
key, so "any signed-in user" is effectively "anyone". To go live:

1. In the Firebase console → **Authentication** → enable the **Email/Password**
   provider, then **Add user** with the studio's email + password.
   *Recommended:* also disable public sign-up (Authentication → Settings →
   User actions → un-tick "Enable create") so strangers can't register at all.
2. Grant that account admin rights (uses the Admin SDK service account, see
   §3 for credentials):

   ```bash
   node scripts/grant-admin.mjs studio@example.com
   ```

   This sets the custom claim **and** creates `admins/{uid}`, so it takes
   effect immediately. `--revoke` undoes it; `--list` shows current admins.
3. **Deploy the rules only after step 2** (step 2 above in this file),
   otherwise the studio's own writes are rejected until the grant runs.
4. Sign in at `/admin` with that email + password.

If unit costs were previously saved by an older app version, migrate them out
of the publicly-readable override docs once:

```bash
node scripts/grant-admin.mjs --scrub-costs
```

`lib/auth.js` wraps sign-in/out; `lib/firebase.js` exposes the auth instance.
If Firebase isn't configured at all (a bare local checkout), the admin falls
back to demo mode (any credentials) — **development builds only**; production
builds never allow demo sign-in.

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

## 3a. Master inventory & local image seeding (current workflow)

The stock ledger's SKUs are defined by **`lib/data/stock-ledger.json`** — the
single source of truth that `lib/data/stock-data.js` imports. It is generated
from the **names of the curated image sub-folders**, so the folders you keep
locally are authoritative:

```
Malaya Website Images/
  P020-S/        front.jpg  side.jpg
  P033-14K-MOP/  1.jpg  2.jpg
```

**Step 1 — build the inventory** (no Firebase needed):

```bash
node scripts/build-inventory.mjs "/path/to/Malaya Website Images"
node scripts/build-inventory.mjs --dry-run     # preview
node scripts/build-inventory.mjs --fresh       # ignore prior values, re-infer
node scripts/build-inventory.mjs --from-csv lib/data/stock-ledger.csv   # import an edited CSV
```

Writes `lib/data/stock-ledger.json` (the master the app reads) and a reviewable
`lib/data/stock-ledger.csv`. Folder names become SKUs; `category` and `material`
are inferred from the SKU convention; `name`/`qty`/`cost`/`retail` are carried
over for SKUs that already existed (set the rest in `/admin`, or edit the CSV and
re-import). Catalogue links (`productId`) are re-derived from `products.js`.
Commit both files.

**Step 2 — upload the photos** (Admin SDK; bypasses rules):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
node scripts/seed-local-images.mjs --dry-run   # preview, offline
node scripts/seed-local-images.mjs             # upload + write Firestore
node scripts/seed-local-images.mjs --force     # re-upload even if present
```

For each SKU folder it uploads every image to `products/{SKU}/…` and writes
`catalogueOverrides/{SKU}` with the `images` gallery and the primary `img`
(merged — never clobbers `published`/`story`/prices). Idempotent. Because the
inventory is built from these same folders, none are flagged "unknown".

**Step 3 — publish**: open `/admin → Stock ledger` and toggle lines **Online**.

> `scripts/fetch-images.mjs` (section 3) is the older path that pulled imagery
> from the live CDN; the local-folder workflow here supersedes it.

## 4. Using the admin

- **Stock ledger** — the real inventory (the studio "Total Stock" sheet). Each
  line has an **Online / Publish** toggle (in the row and the edit drawer):
  flipping it on lists that exact stock line on the live storefront, keyed by its
  SKU. A line can be published **with no image** — the storefront shows a
  monogram placeholder until photos are added. Publishing a line that is linked
  to a legacy catalogue listing supersedes that listing online (no duplicates).
- **Edit drawer → Story** — a free-text narrative saved to the item's Firestore
  doc and rendered on the product page (blank lines start a new paragraph).
- **Edit drawer → Images / gallery** — upload one or many photos (click or drag &
  drop). Reorder or remove them; the first image is the primary one. Works the
  same on the **Catalogue prices / Mass edit** drawers for the existing catalogue.
- **Site images tab** — replace the logo, hero slideshow, category tiles,
  banners and the Tashi portrait.
