# Site content publishing

Site content edits are drafts until **Save changes** is clicked. The editor
shows unsaved, saving, confirmed and failed states. Inputs freeze during a
save to prevent newer edits being mistaken for the acknowledged snapshot.

Firestore acknowledgement is required before the published local cache is
updated or revalidation is scheduled. A rejected write remains retryable.
Draft patches are stored with an owner/revision in sessionStorage under the signed-in user, survive
reload/remount in the same tab, and are removed only after success or explicit
Discard. Save completion clears only the exact submitted revision, so an older
unmounted save cannot erase a newer editor draft. Legacy plain draft maps
remain recoverable. Storage can be unavailable in restricted browsers; beforeunload and
admin tab/logout warnings still protect an active draft, but recovery then
cannot be guaranteed. Browser unload prompts depend on browser policy.

Live snapshots update untouched fields without replacing edited fields.
Save applies the edited fields over the latest observed snapshot. Concurrent
edits to the same field still use last-write-wins; this is not a transactional
multi-editor conflict-resolution system. Firestore optimistic pending-write
snapshots are not treated as published content. The listener requests metadata
changes so a pending-to-acknowledged transition still reaches a remounted editor
even when document data does not change. See the [Firestore metadata-events
contract](https://firebase.google.com/docs/firestore/query-data/listen#events-metadata-changes).

Verification: editor interaction tests cover no writes while typing, pending
acknowledgement, rejected save and retry, incoming snapshots, interruption and
recovery, explicit discard and reset-to-default. Save-helper tests verify that
failure cannot update the published local cache or issue a purge. All use
isolated mocks; no production content writes are needed.

Independent review regressions reproduce delayed Save → unmount → remount →
new edits → old Save acknowledgement → second recovery, including newer edits
whose final value matches the older submission. Listener tests model the
metadata-only acknowledgement with both editor/local-cache and SSR skipCache
subscription modes. These tests fail before the respective fixes.
