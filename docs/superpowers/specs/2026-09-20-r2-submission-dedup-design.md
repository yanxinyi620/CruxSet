# R2 duplicate submission prevention

## Approved scope

Extend the R2 write reduction work to the two remaining medium-priority items: concurrent publication-request snapshot creation and repeated model run/retry clicks. Direct Cloudflare wall publication is not changed by this extension.

## Publication snapshots

Before reading or writing R2, acquire a ten-minute D1 lease keyed by calibration ID and target. A concurrent requester either gets an already completed application or a 409 SUBMISSION_IN_PROGRESS response without touching storage. Recheck existing applications after acquiring the lease to cover a creation completing between the first lookup and lease acquisition.

Write both snapshot objects under a unique application prefix, then insert the visible pending application only while the same token still owns an unexpired lease. Keep the existing unique active-application index as final protection. On a failed or superseded attempt, confirm that its application was not committed, enqueue durable exact-snapshot cleanup, and attempt it immediately. Token-qualified release never removes a successor's lease. Do not delete snapshot objects merely because a D1 response failed: first query whether that application ID was committed.

## Model submissions

The shared page disables the clicked confirm/retry button while a request is pending. A set also blocks simultaneous identical submissions if a button is replaced by a list refresh. In cloud mode each submission intent gets a UUID; retain it until both the POST and list refresh succeed. Network and server failures reuse the UUID. Definitive identity conflicts or deleted-task responses (409/410) discard it so a later click can create a fresh intent. This in-memory identity survives retries in the same page session, not a full page reload. Local mode keeps its existing body contract and receives the button protection.

The Worker accepts an optional submissionId. A unique index on (owner_id, submission_id) prevents duplicate task records. An existing matching submission returns its original task and status before quota admission or GitHub dispatch. Reusing an ID with a different experiment/model/normalized parameter set returns 409; replaying a deleted task returns 410. Requests without IDs retain backward compatibility. A deliberate new run gets a fresh ID even with the same model parameters.

The guarded INSERT filters an existing identity before quota triggers run. Only the creator dispatches GitHub Actions, so a replay does not consume daily quota or start a second runner. Dispatch failure remains a failed task; replaying that ID does not redispatch. This is not a distributed outbox: a Worker interruption between admission and dispatch can leave a queued task to expire under the existing timeout policy.

## Migration and validation

Apply `0018_lab_calibration_save_dedup.sql` and then additive `0019_lab_submission_dedup.sql` before deployment. Migration 0019 adds the snapshot lease table and a nullable submission_id column with a partial unique index; old task insert statements name their columns and remain compatible.

Validate two total snapshot puts under concurrent requests; lock contention with zero R2 reads; partial-upload cleanup; expired/superseded leases; replay at quota boundaries; deleted and failed task replays; repeated confirmation/retry clicks; lost-response and failed-refresh retries; deliberate new submissions. Keep the existing authorization, quota and publication test suite.
