# R2 cleanup scheduling

Approved scope: reduce repeated R2 lists without discarding delayed uploads or durable cleanup failures. R2 is object storage; cleanup metadata stays in D1.

## Behavior

- Business deletion and cleanup enqueue share a D1 transaction. Immediate work processes only that target, at most one page of 500 objects.
- A normal prefix has an initial pass, a pass two hours after enqueue, and a final pass 24 hours after enqueue. Existing five-minute cron remains unchanged for task expiry and publication reconciliation.
- Cron selects at most 30 due records ordered by next execution time. Sleeping records consume no R2 requests and no processing slots.
- Truncated listings continue on the next five-minute tick. Delete the returned page and list from the beginning next time: deleted objects disappear, avoiding pagination cursor invalidation.
- Failure retries wait 5, 15, 30, 60 minutes, then stay at 60 minutes. Failures remain durable even after the protection window expires, and emit a structured `lab_gc_retry` error without upstream exception contents.
- Full object keys and fixed publication snapshots use direct deletes. Variable experiment/task/calibration prefixes use list/delete. Existing wall image reference checks remain in place.
- A late upload re-enqueues cleanup, sets it due immediately, extends the protection deadline to at least 24 hours from that event, and increments a version. It is processed by the next cron if not already handled by an inline call.
- An atomic five-minute lease prevents normal overlapping passes on the same record. Version and lease-token conditions prevent an obsolete pass from finalizing a refreshed record. Expired leases are recoverable; storage deletion is idempotent, so an exceptionally slow pass can overlap after lease expiry without corrupting queue state.
- The two-hour checkpoint follows the current runner validity window (120 minutes; GitHub job timeout 90 minutes). The 24-hour interval is a conservative retained window, not proof that every in-flight network request has terminated.

## Files

- `edge/src/lab/gc.ts`: enqueue statement, target processing, due queue processing.
- `edge/src/lab/tasks.ts`: keep task expiry; delegate cleanup and re-enqueue invalid late uploads.
- `edge/src/lab/index.ts`: targeted experiment/task/calibration deletion with atomic durable enqueue.
- `edge/src/lab/publish-requests.ts`, `edge/src/index.ts`: direct snapshot/media deletion through the shared scheduler.
- `edge/migrations/0017_lab_gc_schedule.sql`: scheduling metadata, lease/version, index and legacy backfill.
- Dedicated GC and migration tests plus deletion/upload integration tests.

## Acceptance

An ordinary one-page prefix produces three lists across 24 hours, rather than approximately 288. There are no lists before a record is due. Waiting records do not block new targets. Test oversized prefixes, failures after 24 hours, parallel sweeps, expired leases, late uploads during finalization, legacy migration and exact-key deletion.

## Rollout prerequisite

Deployment completed on 2026-09-20; see `docs/records/2026-09-20-r2-cleanup-release.md`. The pre-migration Worker contained `INSERT OR IGNORE INTO lab_gc VALUES (?,?)`; adding columns makes that SQL invalid. Do not apply migration 0017 against that unmodified Worker, and do not deploy the new scheduler before its schema exists.

Use a compatibility rollout:
1. From the currently deployed revision, change each two-value cleanup insert to `INSERT OR IGNORE INTO lab_gc(prefix,created_at) VALUES (?,?)`, without deploying any new scheduler queries yet. Test and deploy that compatibility-only Worker first. Allow existing requests from the prior version to drain.
2. Apply migration 0017. Legacy rows retain their original timestamps and get one due pass; normal scheduling follows. Legacy inserts with explicit columns still work during this interval.
3. Deploy the new Worker and check due queue progress and `lab_gc_retry` logs. If rollback is needed, roll back to the compatibility-only Worker, not the older positional-insert version. Leave additive schema columns intact.

The initial implementation was local only. Production rollout was subsequently explicitly authorized and completed; the release record captures deployed versions and verification.
