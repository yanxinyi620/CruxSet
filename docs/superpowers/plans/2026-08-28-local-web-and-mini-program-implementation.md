# Local Web and Mini Program Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a self-contained local Web creation workspace and retain the Mini Program's independent CloudBase creation workflow, linked only by validated publication packages.

**Architecture:** Web uses responsive mobile-first UI, FastAPI, SQLite and a local media directory. The Mini Program keeps Node Cloud Functions and CloudBase. An explicit exporter/importer transfers only published data from Web to CloudBase; drafts never synchronize.

**Tech Stack:** Vite, TypeScript, FastAPI, Python `sqlite3`, SQLite, uv, CloudBase Node Cloud Functions, CloudBase database and storage.

---

## File structure

```text
server/app/repositories/sqlite.py       local Web persistence
server/app/services/                    Web wall/layout/problem and publishing rules
server/app/api/                         local Web HTTP API
server/app/publishing/                  manifest validation and package export
server/scripts/import_cloudbase.py      explicit CloudBase importer
web/                                    responsive Web client
miniprogram/                            independent native client
cloudfunctions/                         Mini Program Node functions
```

`web/` is the formal local Web client. The earlier `dev-preview/` prototype has been migrated into this directory.

### Task 1: Reset the Web backend boundary to SQLite

**Files:** Create `server/app/repositories/sqlite.py`, `server/app/database.py`, `server/tests/test_sqlite_repository.py`; modify `server/pyproject.toml`, `server/app/main.py`.

- [x] Write tests that create a temporary SQLite database, persist a wall, a draft Layout and a Problem, then re-open the repository and assert data remains.
- [x] Run `cd server && uv run pytest tests/test_sqlite_repository.py -q`; expect import failure.
- [x] Implement SQLite repository methods for users, walls, Layout snapshots and Problems with Python `sqlite3`. Set SQLite as the default `app.state.repository`; select database URL from `CRUXSET_DATABASE_URL`, defaulting to a project-local SQLite path. Media metadata is implemented in Task 3.
- [x] Run `cd server && uv run pytest -q`; expect all API and repository tests to pass.
- [ ] Commit `feat: add local SQLite web repository`.

### Task 2: Complete local Web creator API lifecycle

**Files:** Modify `server/app/api/creator.py`, `server/app/services/walls.py`, `server/app/services/layouts.py`, `server/app/services/problems.py`; create `server/tests/test_creator_lifecycle_api.py`.

- [ ] Write failing tests for listing walls/layouts/problems, editing only a draft Layout, rejection of editing a published Layout, deleting a Layout with its Problems, and deleting a Wall with all descendants.
- [ ] Run the focused test; expect missing routes/service failures.
- [ ] Add GET/PATCH/DELETE API endpoints and move lifecycle checks into focused services. Keep rule: two Holds minimum for publication and routing; published Layouts are immutable; cascade deletion requires a `confirmCascade: true` request field.
- [ ] Run `cd server && uv run pytest -q`; expect pass.
- [ ] Commit `feat: complete local creator lifecycle API`.

### Task 3: Add local image storage and upload API

**Files:** Create `server/app/services/media.py`, `server/app/api/media.py`, `server/tests/test_local_media_api.py`; modify `.env.example` and `main.py`.

- [ ] Write a failing multipart-upload test that asserts image extension/content type validation, generated media ID, read endpoint, and rejection of files over `MAX_UPLOAD_BYTES`.
- [ ] Run the test; expect a 404 route.
- [ ] Store files outside the SQLite file in `CRUXSET_MEDIA_DIR`; persist metadata in SQLite; return API URLs rather than operating-system paths.
- [ ] Run all server tests; expect pass.
- [ ] Commit `feat: add local web media storage`.

### Task 4: Create responsive Web shell and authentication

**Files:** Create `web/package.json`, `web/vite.config.ts`, `web/src/main.ts`, `web/src/api.ts`, `web/src/styles/app.css`, `web/tests/navigation.test.ts`.

- [ ] Write a failing Vitest test for three fixed bottom navigation actions: `线路`, `创建`, `我的`, and a back action on a secondary route.
- [ ] Run `cd web && npm test`; expect setup failure.
- [ ] Create a responsive mobile-first Vite application: no iPhone device frame; use full mobile viewport, safe-area padding and a centered max-width only on wide screens. Add administrator email/password login backed by local FastAPI.
- [ ] Run Web tests and production build; expect pass.
- [ ] Commit `feat: add responsive local web shell`.

### Task 5: Implement Web Lines, Create and My flows

**Files:** Create `web/src/pages/lines.ts`, `web/src/pages/create.ts`, `web/src/pages/mine.ts`, `web/src/pages/editor.ts`; create `web/tests/creator-flows.test.ts`.

- [ ] Write failing API-mocked tests covering: Lines requires a published Wall/Layout; Create shows new Wall, drafts, and new Problem; Mine lists Layout rows separately and groups Problems by Layout.
- [ ] Run focused Web tests; expect missing page modules.
- [ ] Implement the three main pages, secondary back navigation, upload, draft editor entry, publish action, route editor, explicit cascade delete confirmation, and the existing Foot Rule semantics.
- [ ] Run `cd web && npm test && npm run build`; expect pass.
- [ ] Commit `feat: add local web creator flows`.

### Task 6: Implement Canvas annotation for Web

**Files:** Create `web/src/wall-canvas.ts`, `web/src/annotation-state.ts`, `web/tests/annotation-state.test.ts`.

- [ ] Write failing pure-state tests for normalized coordinates, continuous Hold IDs, tap selection, Hold/Volume kind, Undo and immutable published Layout editing rejection.
- [ ] Run the focused test; expect missing module.
- [ ] Reuse only stable pure algorithms from `src/domain/`; implement browser Canvas interactions separately for mouse and touch.
- [ ] Run Web tests/build and visually inspect mobile-width and desktop-width browser layouts.
- [ ] Commit `feat: add web layout annotation`.

### Task 7: Define and export validated publication packages

**Files:** Create `server/app/publishing/manifest.py`, `server/app/api/publishing.py`, `server/tests/test_publication_export.py`.

- [ ] Write failing tests that reject draft Layout export and verify a valid package contains manifest, checksums and only referenced media.
- [ ] Run focused tests; expect missing module.
- [ ] Export deterministic `schemaVersion: 1` zip packages. Validate IDs, Hold references, published status and media SHA-256 before generating output.
- [ ] Run all server tests; expect pass.
- [ ] Commit `feat: export validated publication packages`.

### Task 8: Import Web publication packages into CloudBase

**Files:** Create `server/scripts/import_cloudbase.py`, `server/app/publishing/cloudbase_import.py`, `server/tests/test_cloudbase_import_plan.py`; modify `server/app/repositories/cloudbase.py`.

- [ ] Write fake-adapter tests proving validation completes before any CloudBase call and duplicate package IDs are rejected.
- [ ] Run the focused test; expect missing importer.
- [ ] Add a CLI requiring CloudBase credentials, target environment and explicit `--apply`. Upload images first, create Wall/Layout/Problems only after all validation succeeds, and save an import receipt / source package ID to prevent accidental re-import.
- [ ] Run server tests plus a dry run; expect pass without CloudBase credentials.
- [ ] Commit `feat: import published web packages to CloudBase`.

### Task 9: Preserve and validate Mini Program independence

**Files:** Modify `docs/IMPLEMENTATION_PLAN.md`, `docs/manual-test.md`, `cloudfunctions/*` only when a publication compatibility gap is proven; create `tests/publication-compatibility.test.ts`.

- [ ] Write a fixture-based test showing an imported published Layout is visible to Lines, while a draft Layout is absent from Lines and available only in Create drafts.
- [ ] Run `npm test -- tests/publication-compatibility.test.ts`; expect missing fixture/test.
- [ ] Add fixtures and only the minimal CloudBase schema compatibility changes needed. Do not make Mini Program pages call FastAPI.
- [ ] Run `npm test && npm run build`, then perform CloudBase import and Mini Program manual read verification.
- [ ] Commit `test: verify web publication compatibility with mini program`.

### Task 10: Update documentation and release checks

**Files:** Modify `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/architecture.md`, `docs/manual-test.md`.

- [ ] Document local Web startup with `uv`, the media/database locations, admin bootstrap, publication export/import, backup and recovery procedure.
- [ ] Add an end-to-end checklist: local create → publish → export → validate → CloudBase import → Mini Program browse.
- [ ] Run `cd server && uv run pytest -q`, `cd web && npm test && npm run build`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Commit `docs: document local web publishing workflow`.
