# Site content publishing

Site content edits are drafts until **Save changes** is clicked. The editor
shows unsaved, saving, confirmed and failed states. Inputs freeze during a
save to prevent newer edits being mistaken for the acknowledged snapshot.

Firestore acknowledgement is required before the published local cache is
updated or revalidation is scheduled. A rejected write remains retryable.
Draft patches are kept in sessionStorage under the signed-in user, survive
reload/remount in the same tab, and are removed only after success or explicit
Discard. Storage can be unavailable in restricted browsers; beforeunload and
admin tab/logout warnings still protect an active draft, but recovery then
cannot be guaranteed. Browser unload prompts depend on browser policy.

Live snapshots update untouched fields without replacing edited fields.
Save applies the edited fields over the latest observed snapshot. Concurrent
edits to the same field still use last-write-wins; this is not a transactional
multi-editor conflict-resolution system. Firestore optimistic pending-write
snapshots are not treated as published content.

Verification: editor interaction tests cover no writes while typing, pending
acknowledgement, rejected save and retry, incoming snapshots, interruption and
recovery, explicit discard and reset-to-default. Save-helper tests verify that
failure cannot update the published local cache or issue a purge. All use
isolated mocks; no production content writes are needed.
