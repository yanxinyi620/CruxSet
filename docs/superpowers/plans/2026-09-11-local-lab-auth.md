# Local lab authorization implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Preserve all existing uncommitted work and execute in the current feature checkout.

**Goal:** Apply the cloud account/ownership model to local lab, assigning existing unowned experiments to an administrator.

**Architecture:** FastAPI authenticates browsers and signs internal calls to the standalone lab. Lab verifies context and scopes file-backed experiments. Model computation stays separate.

**Tech Stack:** FastAPI, httpx, HMAC-SHA256, SQLite document accounts, Python file store, Vite.

- [x] Server authorization and gateway: add app/auth/lab.py, app/api/lab.py; extend auth user listing/PATCH, bootstrap capabilities, publish owner validation, main registration, httpx runtime dependency. Tests must demonstrate anonymous 401, unauthorized 403, live grant/revoke, strict origin/body, signed upstream requests, owner-aware publication and offline 503 before implementation.
- [x] Lab boundary: add segmentation_lab/access.py, ownership module and tests. Verify signed context method/path/query/body/expiry, reject direct API, safe identifiers and owner scope; idempotent owner sidecars with deterministic legacy admin; filter lists, owner-bound new experiments, admin-only external publish. Update existing API test clients to sign trusted internal context explicitly.
- [x] Integration: Vite API proxy to FastAPI, Caddy internal path to FastAPI, capabilities-only access, launcher shared key and documentation. Update real proxy tests and add server/lab ASGI roundtrip tests.
- [x] Migration: inspect local administrator IDs only (no credential output), initialize legacy owner sidecars with backups/manifest and verify no reassignment of owned experiments or changes to experiment payloads.
- [x] Review and verify: run server pytest, lab pytest, npm test, web/edge/root TypeScript checks, both Vite builds and shell harness tests; independent review for authentication and ownership bypasses; fix findings and repeat affected checks.

Target tests: server/tests/test_local_lab_auth.py, tools/segmentation-lab/tests/test_access.py, tests/local-lab-integration.test.ts, tests/local-lab-startup.test.ts, tests/web-cloud-access.test.ts. Commands use existing venv Python and npx vitest. No live inference required.

## Verification results

- FastAPI: 80 tests passed, including real HTTP across separate API/lab processes and public/local cookie behavior.
- Lab: 126 tests passed, including signature binding, owner scope, migration and admin-only external hooks.
- TypeScript: 269 tests passed; affected integration tests rerun after final wiring changes.
- Root, Web and Workers type checks passed; both web/dist and web/dist-local builds passed; two shell harnesses passed.
- Independent spec and security reviews completed; caching and fixed development-key findings corrected and re-reviewed.
- Existing 2 experiments assigned to the sole administrator. All 1,256 existing file hashes unchanged; local manifest stored under ignored .runtime.
- Idle dev services restarted. Live same-origin check: anonymous 401, admin sees 2 experiments, image 200/no-store, direct 8765 API 401.
- Real SAM inference was not rerun. HTTP task integration used a deterministic fake adapter; shared model code was unchanged.
