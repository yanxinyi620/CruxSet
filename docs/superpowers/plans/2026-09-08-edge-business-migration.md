# Edge business migration implementation plan

> For agentic workers: use superpowers:subagent-driven-development for the isolated frontend task; complete backend and deployment in this session.

**Goal:** Move public Web browsing, accounts, route creation/editing/deletion and administrator management to the existing Worker and D1, without R2 or private media uploads.

**Architecture:** Both custom domains target cruxset-edge; Web calls the API domain with credentialed CORS. Static Assets holds only public images. D1 keeps existing IDs and relations and gains credentials, sessions, login throttling, complete hold geometry, and atomic counters through additive migrations. Local private data stays local.

**Tech stack:** TypeScript Worker, D1 SQLite, existing Vite Web, Python migration tooling.

## Tasks

- [ ] Authentication feasibility: verify existing Argon2id parameters and Workers runtime compatibility with original passwords. No password reset or weaker password storage. Stop production enablement if platform limits prevent secure verification.
- [ ] Backend tests and implementation: add migration 0002; credentials and revocable 8-hour sessions; register/login/me/profile/logout/admin users; origin checks and credentialed CORS; route validation, creator/admin permissions, atomic numbering and wall deletion semantics. Disable image uploads, draft authoring and segmentation uploads explicitly.
- [ ] Frontend tests and implementation: production API hostname, public guest browsing and login, credentialed requests, capability-gated wall authoring, public image URLs, full list loading through pagination. Preserve local behavior.
- [ ] Import preparation: consistent local snapshot; fresh remote export; compare overlapping public wall and route IDs; migrate 4 users (1 admin, 3 users), 1 published public wall, 369 holds and 12 routes; preserve polygons, source metadata, password hashes and all business IDs. Never overwrite remote-only data or private assets.
- [ ] Verification: schema and real SQLite integration tests, account/role tests, route lifecycle and unauthorized operations, frontend type/build checks, Worker dry deployment, migration rehearsal and foreign-key checks.
- [ ] Production: back up D1, apply additive migration and reviewed import, deploy public assets and Worker with keep-vars, bind Web Custom Domain, verify DNS/HTTPS/health/bootstrap/images and authentication on deployed runtime. Stop on Cloudflare login/permission/API errors. Do not enable paid subscriptions.
- [ ] Final report: migrated counts, supported capabilities, test evidence, deployed version, network measurements and any concrete limitations.

## Accepted scope details

No PWA, offline support, R2, CloudBase migration or cloud model inference. Existing admins collection contains all login accounts: role determines administrator privileges. Administrator wall deletion follows the current local API: associated routes are deleted transactionally; public image removal is deferred to a later static deployment. Public immutable geometry remains locked. Account migration does not migrate old browser sessions; users log in again.
