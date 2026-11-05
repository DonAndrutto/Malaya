# Vajra / Dorje refresh — 5 November 2026

The approved shelf contains 38 existing storefront records. `lib/content/vajra-refresh.js`
contains the exact IDs, captions, copy and field-level migration rules.

## Editorial scope

- Include single vajras, repeated single-vajra motifs, and vajra-and-bell pairs.
- Exclude every double vajra/dorje, Phurba/Dorje Phurba, the bell-only
  E019BB-S-BD earrings, and both Vajra Guru mantra necklaces. Double dorje will
  have its own topic later; existing products are not merged or deleted.
- Use Medium consistently within the selected vajra names. N007 is the large
  Vajra Guru mantra necklace; N007C is the small version. Preserve names the
  owner has already corrected instead of replacing them with an old audit.
- Replace “CZ Diamonds” with “cubic zirconia” in the shared catalogue and
  ledger display logic and all public override copy, including products outside
  this topic. Historical financial source files remain unchanged.
- Retain substantive product stories, including Dobchu framing and promises.
  Fill only empty stories or the generic Malaya manufacturer sentence.
- Use a short Explore introduction with a specific Bhutan reference in the
  supporting text. Preserve the topic's publication status and hero image.

## Shelf behavior

The opening grid selects twelve pieces after prioritising current In stock
and legacy Low stock status. Existing catalogue order breaks ties. Remaining
pieces appear below, without repeating the opening twelve. Made to order,
Sold out and unknown status do not count as on hand.

The checked live snapshot had seven in-stock pieces: B013-S, N015-S, B015A-S,
BA005-S-CZ, P027-S, R017A-S and E018-S-BCZ. This list is evidence for the
review, not a hard-coded stock list. Stock changes reorder both grids.

Product-grid settings expose stock priority, offset and captions in Explore
admin. Captions are optional; existing grids retain their current behavior.
Both Vajra grids carry the full caption map because stock changes move pieces
between them; when editing a caption, update it in both grids.

## Apply the content migration

The signed-in **Admin → Explore → Review Vajra refresh** control reads current
Firebase data and shows the pieces and exact field changes. **Apply approved
refresh** downloads a before-state backup, writes all changes in one transaction,
saves the previous topic in History, and refreshes both storefront caches. It
aborts if an intervening edit changed a reviewed record. This uses the existing
admin session and Firestore rules; no terminal credentials are needed.

If the cache refresh fails after the database commit, use **Retry storefront
refresh**. The UI distinguishes saved content from refreshed public pages and
does not repeat the data writes during that retry.

Deploy the matching renderer before applying content that uses its new grid
fields. No live writes are performed by a normal build or by the default
script invocation. The initial brief's no-merge/no-deploy constraint remains
in force until separately authorised.

Using Node 24, prepare a fresh public-data snapshot outside the repository:

```sh
node scripts/refresh-vajra.mjs --output /path/outside-the-repo/vajra-plan.json
```

Review the `changes` array: each entry contains the document's current
version, its before-state and only the fields to change. The script refuses
to overwrite an existing plan. Its dry run needs no administrator access.

After reviewing the plan, an authorised Firebase administrator with configured
Application Default Credentials can apply it:

```sh
node scripts/refresh-vajra.mjs --apply /path/outside-the-repo/vajra-plan.json
```

The target project is fixed to `malaya-catalogue`. All writes are committed in
one transaction. Any concurrent edit to a touched document aborts the entire
operation; regenerate and review the plan rather than overwriting it. The
existing topic is also checkpointed in its normal revision history. Keep the
plan as the product before-state backup; do not commit credentials or plans.

After applying, revalidate both `site` and `explore` through the signed-in
admin. Verify the public topic, its stock ordering and a sample of changed
product pages. A normal admin save pings the relevant cache scope.

For a rollback, restore the topic using Explore History. Restore only the
changed product fields from the plan's `before` entries, checking for newer
edits first; delete a field if it did not exist previously. Do not overwrite
whole documents or revert later stock/photo edits.

## Validation

- `npm test -- --runInBand`: 76 tests passed.
- `npm run lint`: passed with existing image-element warnings.
- `npm run build`: passed.
- Read-only live-data simulation: 38 included/linked records, no excluded
  records, no remaining “CZ Diamonds” in displayed copy, no changes to prices,
  quantities, stock, images or sales codes, and no further patches on a second
  application of the same plan.
- Fresh dry run: 45 documents with changed fields (44 product overrides and
  the Vajra topic). Counts may change with subsequent owner edits.

The dry run is not evidence that live content has been updated. Applying the
plan requires authenticated Firebase write access.
