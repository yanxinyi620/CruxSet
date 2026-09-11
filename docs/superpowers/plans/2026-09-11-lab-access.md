# Lab Access Implementation Plan

**Goal:** Implement the approved shared-account lab authorization, including public publication.
**Architecture:** Persist an explicit account grant, resolve it on every existing session, and expose effective capabilities to the shared Web UI. Keep runner credentials and experiment ownership unchanged.
**Tech Stack:** Workers, D1 SQL, TypeScript, Vite, Vitest.

- [x] Add integration tests in edge/tests/segmentation-lab.test.ts for grant/revoke using existing sessions, role boundaries, input validation and ownership. Run `npx vitest run edge/tests/segmentation-lab.test.ts` and observe missing-feature failures.
- [x] Add edge/migrations/0010_lab_access.sql: `ALTER TABLE admins ADD COLUMN lab_enabled INTEGER NOT NULL DEFAULT 0 CHECK (lab_enabled IN (0,1));`. Create focused edge/src/lab-access.ts helpers and administrator endpoint. Read lab_enabled in session/auth projections; replace lab administrator gate with effective grant, expose capabilities and no-store responses.
- [x] Parameterize the existing complete runner/calibration/publication test for administrator and authorized member. Assert public wall ownership and denial after revocation; retain all runner and ownership checks.
- [x] Extend tests/admin-management.test.ts, tests/web-api-client.test.ts and tests/segmentation-lab-web.test.ts for permission actions, same-origin requests and 401/403 distinctions. Observe failures, then implement typed API action, member role labels, management controls, capability-only lab entry and accurate permission errors.
- [x] Update docs/segmentation-cloud.md and docs/testing.md with granting, revocation, migration and same-origin session behavior. Check all changed code for unintended privilege expansion.
- [x] Run `npm test`, `npm run build`, `npx tsc -p web/tsconfig.json`, `npm run edge:typecheck`, `npm run web:build`, `npm run edge:build`, and `npm run verify:phase1`. Inspect diff and report migration/deployment requirements without deploying production.

## Verification record

Local browser verification used an isolated Wrangler D1/R2 state under `/tmp`, with two throwaway test accounts. Administrator grant changed the member label to 创作者; a fresh member login immediately showed the lab entry; navigating to the lab reused the same session. Administrator revocation caused the already-open lab API to return 403 with a permission message and removed the entry on reloading 我的. No remote deployment or real model task was started.

Independent code review found no actionable defects. Existing build warnings about the Wrangler WASM rule and proxy configuration remain unchanged.
