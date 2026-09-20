# R2 write reduction: quota preflight and unchanged calibration saves

## Scope

Implement the two highest-priority improvements from the R2 audit: reject already-full image/wall quotas before R2 access, and avoid saving an unchanged calibration again. Publication request locking and model-run duplicate submission are covered by the subsequently approved companion design `2026-09-20-r2-submission-dedup-design.md`. Do not replace independent calibration image copies with shared references: deleting a task must not break a saved calibration.

## Quotas

- Read the owner's current administrator status and retained-image/public-wall count before storage access.
- Reject a known-full quota with the existing 429 error code and message. Administrators retain their exemption.
- Existing D1 quota triggers remain authoritative. This is an early check, not an atomic slot reservation: requests racing for the final available slot can still do storage work before a trigger rejects one. Retained data cannot exceed the quota.
- Repeating a completed publication continues to use its receipt without storage writes.

## Calibration saves

- Compare validated candidates, changes and immutable image provenance using a SHA-256 digest of canonical JSON. Preserve array order because candidate order is meaningful; sort object keys.
- Reuse an active saved result with the same experiment and digest, returning 200 and `reused:true`; create a changed result with 201 and `reused:false`.
- Acquire a ten-minute D1 lease per experiment/digest before copying files. A simultaneous duplicate returns 409 and can retry to obtain the completed result without R2 writes.
- Recheck existing results after acquiring the lease. Fence the final insert with the lease token and expiry, and release only the token owned by that request. A failed or superseded write enters the existing cleanup queue under its own unique prefix.
- Keep image provenance when the original task is deleted. Explicitly resumed calibrations supply their ID so a subsequent save uses the displayed snapshot, not whichever calibration happens to be newest.
- Upgrade legacy calibration hashes lazily by reading their existing JSON when relevant. Do not rewrite legacy files or scan the bucket.
- Deleted calibrations are not reused. A calibration whose published wall was deleted may be saved as a new snapshot to preserve the existing re-publication workflow.

## Page behavior

- First save of loaded model candidates remains available. After a successful save, submitting unchanged content makes no network request.
- Resuming a saved calibration establishes its saved baseline. Modifications then create a new independent snapshot. Previously published calibrations still reach server validation on an unchanged save: a deleted public wall needs a new snapshot, while an existing wall reuses the old snapshot without R2 writes.
- Capture the submitted content and view version before awaiting the request. Edits made during saving remain dirty; a response from another view cannot mark the current view saved.
- The page is shared with the local Python lab. Extra source-calibration metadata is accepted by its existing dictionary request contract; local storage behavior is unchanged.

## Migration and validation

Apply additive `0018_lab_calibration_save_dedup.sql` before deploying this code. The current Worker uses explicit calibration insert columns, so it remains compatible while the migration is applied. Existing calibration content is untouched; image provenance is backfilled from the source task where available, otherwise from its own independent display key.

Verify zero R2 calls on known-full quotas, administrator exemptions and concurrent quota limits, unchanged and concurrent saves, JSON key-order equivalence, legacy records, deleted tasks/calibrations, expired and superseded leases, partial upload cleanup, shared-page save behavior, and local lab API compatibility. No deployment is included in this implementation step.
