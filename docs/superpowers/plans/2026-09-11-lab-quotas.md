# Cloud lab quota implementation plan

Goal: enforce the approved creator quotas without changing local execution.
Architecture: SQLite/D1 transactional triggers plus a persistent daily ledger; API translates quota violations and reports usage.

- [x] Add boundary and deletion tests to edge/tests/segmentation-lab.test.ts and observe failures.
- [x] Add migration 0011: image/task/wall triggers, daily ledger and historical backfill. Keep existing two-active-task check.
- [x] Translate quota errors, clean failed publication resources, expose usage on experiment list and show cloud-only text.
- [x] Verify quota boundaries, daily rollover, deletion, ownership, existing regressions and builds; document migration requirement.

User correction implemented: wall removal stays in My → My Walls; creator deletion is ownership-checked, removes related routes/holds/published media, and queues failed media cleanup. Cloud lab links there in a new tab; no unpublish controls.

Validation: 276 tests across 59 files; root and Worker typechecks, Web typecheck, cloud/local Web builds, Phase 1 structure checks, isolated Wrangler D1 migration application all passed. Browser with synthetic API data verified creator entry, quota text, direct management popup and double-confirmed deletion. No remote deployment or real data modifications performed.

Deployment (2026-09-11, explicitly requested): applied 0011_lab_quotas.sql remotely and deployed Worker version ced44e8b-f6a6-4349-b854-21c7312cf9e8. Remote D1 rejected unparenthesized CASE expressions inside a trigger; wrapped those expressions in parentheses without changing semantics, reran all 19 quota/migration tests, and successfully applied the migration. Verified migration tracking and all five triggers on remote D1. No user content was created or deleted for deployment verification.
