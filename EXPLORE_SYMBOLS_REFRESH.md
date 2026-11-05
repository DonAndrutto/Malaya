# Ten Explore symbol sections — 5 November 2026

This batch publishes Endless Knot, Bell, Eight Auspicious Symbols, Tara,
Double Dorje, Phurba, Hung, Ah, Om and Hri using existing live products only.
The existing `the-endless-knot` draft is reused. The Vajra migration is not run.
The full reviewed inventory and unresolved catalogue issues are in
`EXPLORE_SYMBOLS_INVENTORY.md`.

## Review and apply

Admin → Explore → **Review fresh symbol changes** reads all catalogue overrides,
topics (including drafts) and groups from the server. It resolves the same
canonical catalogue as the storefront, scans every live listing regardless of
stock, and shows evidence, captions, uncertain matches and exact before/after
fields. **Apply reviewed symbol sections** downloads the complete before-state
plan before applying a single Firestore transaction. Existing topics are also
checkpointed in their normal revision history.

Only product `topics` fields are changed. Topic editorial fields/publication and
the two navigation shelves are updated; existing heroes and unrelated group
memberships survive. Owner-written product descriptions, quantities, stock,
prices, photographs, catalogue aliases and all unrelated topic associations
remain unchanged. The shared “cubic zirconia” display convention is preserved.

The preflight rejects a changed catalogue or topic collection, including new
records. Transactional reads protect every reviewed document against concurrent
edits. It rejects modified plans and out-of-scope patches. New documents created
after the preflight are not discovered by individual document transaction reads;
they cannot be overwritten and should be picked up by a fresh review. The
transaction must succeed completely before either cache is refreshed. A cache
failure is explicitly distinguished from a failed write and can be retried
without repeating writes. Existing authentication and security rules are used.

`scripts/lib/symbols-rest.mjs` exposes the same planner for an authenticated
operator: `prepareSymbolsRest(fetcher)` and
`applySymbolsRest(plan, fetcher, saveBackup)`. The caller supplies an existing
authorised ADC/CLI OAuth fetch wrapper and a durable backup callback; tokens must
never be written into plans or committed. It rereads the complete source,
compares the reviewed plan, reads all guards within a Firestore transaction and
commits field masks with existence preconditions. It does not refresh Vercel
caches: refresh both `site` and `explore` explicitly after commit.

## Curation and display

- Unicode diacritics and case are normalised; short syllables use term boundaries.
- Titles, subtitles, descriptions, available slugs/tags and explicit image alt
  metadata are scanned. Image URL filenames are not treated as alt text. The
  current storefront image alt text repeats product names and adds no evidence.
- A syllable merely quoted inside a mantra does not establish a design match.
  N024-S is explicitly titled OM AH HUNG, so belongs to those three sections.
  N004-S explicitly describes Hung engraved on its hub and belongs to Hung
  while retaining its existing Vajra association. N007 and N007C remain excluded.
- Double dorje is distinct from single vajra. Vajra-and-bell pairs retain both
  links; bell-only E019BB-S-BD does not gain a Vajra link. Phurba/Dorje Phurba
  matching does not introduce Vajra links.
- Seven complete eight-symbol designs and ten explicitly identified individual
  emblems are captioned separately. Generic “Infinity” without knot evidence is
  flagged rather than inferred. Explicit multi-motif pieces can appear in both
  appropriate shelves. Existing canonical IDs deduplicate aliases; shared SKUs
  do not justify merging distinct records.
- The opening twelve and remainder both use dynamic stock-first sorting and
  complementary offsets. Captions travel with the product when stock changes.
- Conflicting catalogue specifications remain noted for the later naming/data
  pass. Captions omit disputed metal details rather than invent a correction.

## Validation and recovery

`npm test -- --runInBand`, `npm run lint`, and `npm run build` validate the
implementation. Lint retains the existing image-element warnings. After apply,
compare every guarded document with its expected field-level change, check a
second plan is empty, and verify every public shelf, caption, stock ordering,
canonical product link and continuation grid. Deployment alone is not evidence
that Firebase has been updated.

Keep the reviewed plan outside the repository as the complete before-state
backup. Roll back only fields named in each change's patch, and only after
checking against the applied state for newer edits. If a field was absent in
`before`, delete that field rather than writing null. For newly created topics,
unpublish or remove only this batch's additions after checking for subsequent
edits. Restore existing topic content through History if appropriate. Do not
overwrite whole product documents or revert subsequent owner changes.
