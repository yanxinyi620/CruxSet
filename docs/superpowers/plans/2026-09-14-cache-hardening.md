# Mini program cache hardening implementation plan

User approved both batches and related-wall route invalidation in this task. Execute inline using the existing debugging, test-driven-development and verification workflows.

**Goal:** Keep complete lists and hot walls cached, make reads non-destructive, provide predictable manual refresh and failure feedback, and bound persistent writes.

**Architecture:** Keep strict and persistent browsing caches and their existing TTLs. Separate pending requests from an LRU of completed values. Seed route details only into spare capacity, reserving room for pending parent lists. Add a force option propagated through browse reads; manual refresh waits for network while normal stale reads remain immediate. Classify writes explicitly and infer the affected wall from cached route data, with conservative fallback if unknown. Persist under a conservative per-key budget using UTF-8 JSON byte counts, shrink/retry writes and retain payload-free diagnostics.

## Tasks

- [x] Add failing regressions for 120 public routes, shared in-flight requests under eviction, hot-record retention, and read-only deletion inspection.
- [x] Implement pending-request separation, opportunistic seeds and LRU in `services/read-cache.ts`; add forced reads, persistence diagnostics and bounded shrink/retry.
- [x] Implement explicit write classification and affected-wall invalidation in `services/cloud.ts`, retaining conservative fallback when wall identity is unavailable. Preserve write-before/write-after race guards.
- [x] Propagate force options through `browse-data.ts` and `personal-data.ts`; add pull-to-refresh lifecycle support in `browse-page.ts`. Configure the walls, route browser and personal routes pages for native pull-to-refresh.
- [x] Unify cached-content loading and nonblocking failure feedback in browsing pages, personal pages, own walls, drafts and management; preserve filters and expansion. Permissions stay strict, revoked content is removed.
- [x] Add forced-refresh, lifecycle, network/revocation, targeted invalidation, UTF-8 budget/quota and restoration regressions. Run focused tests, all tests, type checks and code review.
- [x] Update cache documentation and verification results; leave changes in the current checkout for preview. No deployment or mini program upload is part of this task.

## Verification results

- Full regression: `npm test` passed, 90 files and 514 tests.
- Type checks: `npm run build` passed for the project and mini program.
- `git diff --check` passed.
- Code review findings were fixed and covered by regressions: revoked route data cannot reappear through filters, and write invalidation during pull refresh causes a fresh read before completion. Follow-up review found no additional concrete correctness issues.
- Changes remain in the existing checkout. No mini program upload, deployment, or real-device acceptance test was performed.
