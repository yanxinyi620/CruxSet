# Wall-Only Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Layout layer from CruxSet so every Wall directly owns its image and holds, and every Problem references only a Wall.

**Architecture:** Migrate the shared TypeScript domain first, then make repositories and the FastAPI service persist the flat model, and finally move the Web, mini-program, cloud functions, fixtures, and documentation to the same contract. Existing Layout records are converted one-for-one into independent Wall records; no segmentation-lab publishing endpoint or UI is included in this phase.

**Tech Stack:** TypeScript 5, Vitest, WeChat Mini Program, Vite, Python 3/FastAPI/Pydantic, SQLite, CloudBase cloud functions, pytest.

---

## Scope boundary

This plan implements only the first approved phase:

- Wall owns image metadata, geometry type, and holds.
- Problem owns `wallId` and no Layout fields.
- Creation produces an editable private Wall; publishing makes that Wall public and geometry-locked.
- Browse, route creation, route detail, “我的墙面”, media authorization, and deletion operate on Wall.
- Existing Layout snapshots migrate to independent Walls.

It explicitly does **not** add `/api/admin/segmentation-walls`, a publish key, calibration metadata, or a segmentation-lab publish button.

## File map

- Shared domain: `src/domain/types.ts`, `src/domain/routes.ts`, `src/domain/routable-wall.ts`, `src/contracts/api.ts`, mirrored/re-exported mini-program domain modules.
- Core TypeScript tests: existing `src/**/*.test.ts` plus new `src/domain/wall-lifecycle.test.ts`.
- Python persistence: `server/app/repositories/{protocols,memory,sqlite,cloudbase}.py`, `server/app/migrations.py`.
- Local API: `server/app/api/creator.py`, `server/app/api/media.py`, `server/app/seed.py`.
- Web data boundary: `web/src/api.ts`, `web/src/data/{preview-session,api-session,preview-repository}.ts`.
- Web UI: `web/src/routes.ts`, `web/src/main.ts`, `web/src/{draft-canvas,wall-canvas}.ts` and their tests.
- Mini-program data/services: `miniprogram/domain/*.ts`, `miniprogram/services/*.ts`, `miniprogram/data/*.ts`.
- Mini-program pages: wall picker/editor/detail and “我的墙面” files under `miniprogram/pages/` plus `miniprogram/app.json`.
- CloudBase: `cloudfunctions/adminLayout`, `cloudfunctions/saveProblem`, `cloudfunctions/getLayoutImageUrl`, `cloudfunctions/wallManager`, collection/rule configuration.
- Verification/docs: server tests, `docs/manual-test.md`, `docs/data-model.md`, `docs/architecture.md`, `scripts/verify-phase1.mjs`.

### Task 1: Flatten the shared TypeScript domain

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `miniprogram/domain/types.ts`
- Modify: `src/domain/routes.ts`
- Modify: `miniprogram/domain/routes.ts`
- Modify: `src/domain/routable-wall.ts`
- Modify: `miniprogram/domain/routable-wall.ts`
- Delete: `src/domain/layout-version.ts`
- Delete: `src/domain/layout-publication.ts`
- Delete: `src/domain/draft-layout.ts`
- Delete: `miniprogram/domain/draft-layout.ts`
- Create: `tests/wall-lifecycle.test.ts`
- Modify: Layout-focused tests under `tests/`, including `tests/routes.test.ts`, `tests/routable-wall.test.ts`, `tests/layout-version.test.ts`, `tests/layout-publication.test.ts`, and `tests/draft-layout.test.ts`

- [ ] **Step 1: Write failing Wall-only domain tests**

Create tests that compile against the intended contract and prove route validation uses `wall.holds`:

```ts
import { describe, expect, it } from 'vitest'
import type { Wall } from '../src/domain/types.js'
import { createProblem } from '../src/domain/routes.js'
import { isRoutableWall } from '../src/domain/routable-wall.js'

const wall: Wall = {
  id: 'wall_1', name: 'A', description: '', imageFileId: 'media_1',
  imageWidth: 1000, imageHeight: 800, geometryType: 'polygon',
  holds: [
    { id: 'H001', x: .2, y: .3, radius: .02, kind: 'hold' },
    { id: 'H002', x: .7, y: .6, radius: .02, kind: 'hold' },
  ],
  angleOptions: [20], ownerId: 'usr_1', visibility: 'public',
  createdAt: 1, updatedAt: 1,
}

describe('wall-only lifecycle', () => {
  it('routes directly on a public wall', () => expect(isRoutableWall(wall)).toBe(true))
  it('rejects unknown wall holds', () => expect(() => createProblem({
    id: 'problem_1', number: 'CS-000001', wallId: wall.id, angle: 20,
    grade: 'V1', holds: { start: ['H001'], finish: ['missing'] }, createdBy: 'usr_1', now: 2,
  }, wall)).toThrow('unknown hold: missing'))
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- tests/wall-lifecycle.test.ts`

Expected: FAIL because `Wall` lacks image/hold fields and `createProblem` still requires a Layout.

- [ ] **Step 3: Replace the shared contract with Wall-only types**

Make `Wall` own the former Layout fields, delete `Layout`, and remove `layoutId/layoutVersion` from `Problem`:

```ts
export interface Wall {
  id: string; name: string; description: string
  imageFileId: string; displayImageFileId?: string
  imageWidth: number; imageHeight: number
  geometryType: 'circle' | 'polygon'; holds: Hold[]
  angleOptions: number[]; ownerId: string
  visibility: 'private' | 'public'
  createdAt: number; updatedAt: number
}
export interface Problem {
  id: string; number: string; wallId: string
  name?: string; description?: string; angle: number; grade: Grade
  footRule: FootRule; holds: ProblemHolds; createdBy: string
  createdAt: number; updatedAt: number
}
```

Change `createProblem(draft, wall)` to validate IDs against `wall.holds`, and change problem filters to `wallId | angle | grade`. Define routability as `wall.visibility === 'public' && wall.holds.length >= 2`.

- [ ] **Step 4: Remove obsolete lifecycle modules and repair domain tests**

Delete Layout publication/version/draft helpers. Update tests to use private editable Wall fixtures or public locked Wall fixtures, without compatibility aliases.

- [ ] **Step 5: Run the domain suite and type check**

Run: `npm test -- tests/wall-lifecycle.test.ts tests/routes.test.ts tests/routable-wall.test.ts && npm run build`

Expected: focused tests PASS; type check may still report Web/service Layout references, which are intentionally handled in later tasks. Record the error list as the migration checklist.

- [ ] **Step 6: Commit**

```bash
git add src/domain miniprogram/domain src/contracts tests
git commit -m "refactor: flatten wall domain model"
```

### Task 2: Flatten repository contracts and add a recoverable SQLite migration

**Files:**
- Modify: `server/app/repositories/protocols.py`
- Modify: `server/app/repositories/memory.py`
- Modify: `server/app/repositories/sqlite.py`
- Modify: `server/app/repositories/cloudbase.py`
- Create: `server/app/migrations.py`
- Rewrite: `server/tests/test_repository_contract.py`
- Rewrite: `server/tests/test_sqlite_repository.py`
- Create: `server/tests/test_wall_only_migration.py`

- [ ] **Step 1: Write failing flat repository contract tests**

Require only Wall and Problem persistence:

```python
def test_repository_persists_wall_geometry_and_problem(repository):
    wall = {"id": "wall_1", "imageFileId": "media_1", "holds": [{"id": "H001"}]}
    repository.insert_wall(wall)
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    assert repository.find_wall("wall_1")["holds"] == [{"id": "H001"}]
    assert repository.list_problems() == [{"id": "problem_1", "wallId": "wall_1"}]
```

Add migration coverage with one legacy Wall containing two Layouts and Problems pointing to each Layout. Assert two independent Walls are produced and each Problem points to the correct new Wall while preserving Hold IDs.

- [ ] **Step 2: Run repository tests and confirm they fail**

Run: `cd server && uv run --extra test pytest -q tests/test_repository_contract.py tests/test_sqlite_repository.py tests/test_wall_only_migration.py`

Expected: FAIL because repositories expose Layout operations and no migration exists.

- [ ] **Step 3: Reduce the repository protocol**

Keep these content methods in addition to existing user/admin methods:

```python
def insert_wall(self, wall: Document) -> None: ...
def replace_wall(self, wall: Document) -> None: ...
def find_wall(self, wall_id: str) -> Document | None: ...
def list_walls(self) -> list[Document]: ...
def delete_wall(self, wall_id: str) -> None: ...
def insert_problem(self, problem: Document) -> None: ...
def find_problem(self, problem_id: str) -> Document | None: ...
def list_problems(self) -> list[Document]: ...
def delete_problem(self, problem_id: str) -> None: ...
def count_problems_for_wall(self, wall_id: str) -> int: ...
```

Remove all `find/list/insert/replace/delete_layout` and `delete_problems_for_layout` operations.

- [ ] **Step 4: Implement the same contract in all repositories**

Memory and SQLite replace a Wall atomically by ID. CloudBase reads/writes only `walls` and `problems`. `delete_wall` does not cascade Problems; callers must enforce the no-reference rule.

- [ ] **Step 5: Implement the legacy migration as a pure transform plus SQLite runner**

Define:

```python
def flatten_legacy_documents(walls: list[dict], layouts: list[dict], problems: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return independent flat walls and rewritten problems; raise ValueError on broken references."""
```

Use the latest snapshot of each Layout. Generate a deterministic new Wall ID from the legacy Layout ID (for example `wall_from_<layout-id>` with collision checking), copy Layout geometry into Wall, copy owner/description/visibility/angles from the parent Wall, rewrite each Problem, and validate every assigned Hold ID. The SQLite runner performs backup, transform, validation, transaction commit, and only then drops legacy Layout storage.

- [ ] **Step 6: Run repository and migration tests**

Run: `cd server && uv run --extra test pytest -q tests/test_repository_contract.py tests/test_sqlite_repository.py tests/test_wall_only_migration.py`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/app/repositories server/app/migrations.py server/tests/test_repository_contract.py server/tests/test_sqlite_repository.py server/tests/test_wall_only_migration.py
git commit -m "refactor: persist wall-only content model"
```

### Task 3: Replace Layout APIs with a Wall lifecycle

**Files:**
- Modify: `server/app/api/creator.py`
- Modify: `server/app/api/media.py`
- Modify: `server/app/seed.py`
- Rewrite: `server/tests/test_layout_lifecycle_api.py` as `server/tests/test_wall_lifecycle_api.py`
- Rewrite: `server/tests/test_draft_annotation.py`
- Rewrite: `server/tests/test_draft_and_deletion_api.py`
- Modify: `server/tests/test_creator_lifecycle_api.py`
- Modify: `server/tests/test_creator_permissions.py`
- Modify: `server/tests/test_local_media_api.py`
- Modify: `server/tests/test_seed_data.py`

- [ ] **Step 1: Write failing Wall lifecycle API tests**

Cover these exact endpoints and rules:

```text
POST   /api/v1/walls                 create private editable Wall with image and empty holds
PUT    /api/v1/walls/{id}/holds      save valid holds while private
POST   /api/v1/walls/{id}/publish    require >=2 holds; set visibility=public
POST   /api/v1/problems              accept wallId only; validate against wall.holds
DELETE /api/v1/walls/{id}            succeed with zero Problems; return 409 with references
GET    /api/v1/walls                 return flat Wall documents
```

Example assertion:

```python
response = client.post("/api/v1/problems", json={
    "wallId": wall_id, "angle": 20, "grade": "V1",
    "holds": {"start": ["H001"], "finish": ["H002"]},
}, cookies=admin_cookie)
assert response.status_code == 201
assert "layoutId" not in response.json()["problem"]
```

- [ ] **Step 2: Run the API tests and confirm they fail**

Run: `cd server && uv run --extra test pytest -q tests/test_wall_lifecycle_api.py tests/test_draft_annotation.py tests/test_draft_and_deletion_api.py tests/test_local_media_api.py`

Expected: FAIL on missing Wall hold/publish endpoints and required `layoutId`.

- [ ] **Step 3: Replace request models and endpoints**

Make `WallInput` accept `imageFileId`, dimensions, `geometryType`, and optional empty `holds`. Replace Layout endpoints with Wall hold-save/publish handlers. Publishing changes only visibility and holds; after public publication, geometry writes return `WALL_LOCKED` (409).

- [ ] **Step 4: Bind route creation and media authorization directly to Wall**

`ProblemInput` contains no Layout fields. `create_problem` requires a public Wall with at least two holds and validates assigned Hold IDs against `wall["holds"]`. Media access locates the owning Wall by `imageFileId` or `displayImageFileId`; public images are readable, while private images require the owner/admin session.

- [ ] **Step 5: Protect Wall deletion when Problems exist**

Return:

```python
raise ApiError("WALL_IN_USE", f"Wall has {count} problems", 409)
```

Do not cascade-delete Problems and do not accept `confirmCascade`.

- [ ] **Step 6: Replace seed data with two independent public Walls**

Move the published Layout image/holds into one Wall and the former draft data into a private Wall. Seed Problems reference only the public Wall.

- [ ] **Step 7: Run the full server suite**

Run: `cd server && uv run --extra test pytest -q`

Expected: PASS with no API payload, repository call, or fixture containing `layoutId`, `layoutVersion`, `activeLayoutId`, or a Layout collection.

- [ ] **Step 8: Commit**

```bash
git add server/app server/tests
git commit -m "refactor: expose wall-only creator API"
```

### Task 4: Flatten Web API and session boundaries

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/data/preview-session.ts`
- Modify: `web/src/data/api-session.ts`
- Modify: `web/src/data/preview-repository.ts`
- Modify: `tests/dev-preview-api-session.test.ts`
- Modify: `tests/dev-preview-repository.test.ts`
- Modify: `tests/web-api-client.test.ts`

- [ ] **Step 1: Write failing Web session tests**

Assert browse data contains only `{ walls, problems }`, creation returns a Wall, route creation accepts `(wallId, draft)`, and deletion preserves a Wall when the API reports `WALL_IN_USE`.

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test -- tests/dev-preview-api-session.test.ts tests/dev-preview-repository.test.ts tests/web-api-client.test.ts`

Expected: FAIL because sessions cache and fetch Layouts.

- [ ] **Step 3: Replace the local client contract**

Use:

```ts
export type BrowseData = { walls: unknown[]; problems: unknown[] }
export type NewWallDraft = {
  name: string; image: File; imageWidth: number; imageHeight: number
}
```

`loadBrowseData()` makes only `/walls` and `/problems` requests. `createWall` uploads the image and posts one complete private Wall. Add `saveWallHolds`, `publishWall`, and `deleteWall`; remove every Layout client method.

- [ ] **Step 4: Flatten session interfaces and implementations**

Sessions expose:

```ts
listWalls(): Promise<Wall[]>
listMyWalls(): Promise<Wall[]>
getWall(id: string): Promise<Wall>
createWall(input: CreateWallInput): Promise<Wall>
updateWallHolds(wallId: string, holds: Hold[]): Promise<Wall>
publishWall(wallId: string, holds: Hold[]): Promise<Wall>
createProblem(wallId: string, draft: Partial<Problem>): Promise<Problem>
deleteWall(wallId: string): Promise<{ ok: true }>
```

Remove Layout caches, list/get/create/delete methods and filters.

- [ ] **Step 5: Run Web data tests**

Run: `npm test -- tests/dev-preview-api-session.test.ts tests/dev-preview-repository.test.ts tests/web-api-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.ts web/src/data
git commit -m "refactor: flatten web data sessions"
```

### Task 5: Move the Web interface to Wall-only navigation

**Files:**
- Modify: `web/src/routes.ts`
- Modify: `web/src/main.ts`
- Modify: `web/src/candidate-editor.ts`
- Modify: `web/src/draft-canvas.ts`
- Modify: `web/src/wall-canvas.ts`
- Modify: `tests/dev-preview-build.test.ts`
- Modify: `tests/dev-preview-responsive-shell.test.ts`
- Modify: `tests/dev-preview-routable.test.ts`
- Modify: `tests/create-drafts-flow.test.ts`
- Modify: `tests/layout-management-routes.test.ts`
- Modify: `web/src/styles/editor.css`

- [ ] **Step 1: Write failing route and UI state tests**

Require these routes:

```ts
type PreviewRoute =
  | { name: 'browse' | 'create' | 'me' }
  | { name: 'wall'; wallId: string }
  | { name: 'wall-editor'; wallId: string }
  | { name: 'problem-editor'; wallId: string }
  | { name: 'problem-detail'; problemId: string }
```

Test URLs contain no Layout ID and Wall cards use `wall.imageFileId`, `wall.holds`, and `wall.visibility`.

- [ ] **Step 2: Run focused Web tests and confirm they fail**

Run: `npm test -- tests/dev-preview-build.test.ts tests/dev-preview-routable.test.ts tests/create-drafts-flow.test.ts tests/layout-management-routes.test.ts`

Expected: FAIL on Layout routes and data lookups.

- [ ] **Step 3: Replace routing and all page joins**

Browse public routable Walls directly. Wall detail loads Problems by `wallId`. Problem editor loads one Wall and its holds. Problem detail loads its `problem.wallId`. Remove Layout picker/join logic and all Layout labels.

- [ ] **Step 4: Make creation/editing operate on a private Wall**

The existing “new wall + draft Layout” sequence becomes one `createWall` call followed by `/wall-editor/:wallId`. Saving writes holds to the private Wall; publishing locks geometry and makes it public. “我的草稿” lists private Walls rather than Layouts.

- [ ] **Step 5: Make management delete Walls without cascade confirmation**

“我的墙面” lists one card per owned Wall. A 409 `WALL_IN_USE` response displays the route count and leaves the card intact. Remove Layout deletion controls.

- [ ] **Step 6: Run Web tests and build**

Run: `npm test -- tests/dev-preview-build.test.ts tests/dev-preview-responsive-shell.test.ts tests/dev-preview-routable.test.ts tests/create-drafts-flow.test.ts tests/layout-management-routes.test.ts && npm run web:build`

Expected: PASS; built UI contains no visible “Layout”, “布局版本”, or “当前布局” wording.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "refactor: use walls throughout web UI"
```

### Task 6: Flatten mini-program services and pages

**Files:**
- Modify: `miniprogram/services/mock-repository.ts`
- Modify: `miniprogram/services/cloud.ts`
- Delete: `miniprogram/services/layouts.ts`
- Modify: `miniprogram/services/walls.ts`
- Modify: `miniprogram/services/problems.ts`
- Modify: `miniprogram/services/index.ts`
- Modify: `miniprogram/pages/walls/index.{ts,wxml}`
- Modify: `miniprogram/pages/wall/index.{ts,wxml}`
- Modify: `miniprogram/pages/problem/detail/index.ts`
- Modify: `miniprogram/pages/problem/editor/index.ts`
- Replace: `miniprogram/pages/layout-picker/` with `miniprogram/pages/wall-picker/`
- Replace: `miniprogram/pages/admin/layout-editor/` with `miniprogram/pages/admin/wall-editor/`
- Modify: `miniprogram/pages/admin/index.{ts,wxml,json}`
- Modify: `miniprogram/pages/create/drafts/index.{ts,wxml}`
- Modify: `miniprogram/pages/create/index.wxml`
- Modify: `miniprogram/pages/me/walls/index.{ts,wxml,wxss}`
- Modify: `miniprogram/app.json`
- Modify: service and page tests under `tests/`, including `tests/mock-repository.test.ts`, `tests/mock-publication.test.ts`, `tests/mock-deletion.test.ts`, `tests/layout-service-contract.test.ts`, and `tests/create-drafts-flow.test.ts`

- [ ] **Step 1: Write failing repository and page-model tests**

Assert the repository has no Layout methods, route creation accepts one Wall ID, private Walls appear as drafts, public Walls with at least two holds appear in the picker, and deletion returns `WALL_IN_USE` without cascading.

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test -- miniprogram`

Expected: FAIL on Layout service/page dependencies.

- [ ] **Step 3: Replace repository methods and mock state**

Store `walls: Wall[]` and `problems: Problem[]` only. Implement create/update/publish/delete operations with the same rules as FastAPI. CloudBase calls the renamed Wall operations.

- [ ] **Step 4: Rename picker and editor pages**

Use query parameters containing only `wallId`. Rename storage keys from `layoutDraft:<id>` to `wallDraft:<id>`, editor titles to “墙面标注”, and publish messages to “墙面已发布”. Update `app.json` paths.

- [ ] **Step 5: Replace page data joins and visible wording**

All browse/detail/editor/management pages read image and holds from Wall. “我的草稿” means private editable Walls. “新建线路” selects a public routable Wall. Remove every Layout status chip and Layout ID dataset.

- [ ] **Step 6: Run mini-program tests and type checking**

Run: `npm test -- miniprogram && npm run build`

Expected: PASS with no source import from `services/layouts`, `domain/draft-layout`, or a Layout page path.

- [ ] **Step 7: Commit**

```bash
git add miniprogram
git commit -m "refactor: use walls throughout mini program"
```

### Task 7: Replace CloudBase Layout functions and storage rules

**Files:**
- Replace: `cloudfunctions/adminLayout/` with `cloudfunctions/adminWall/`
- Modify: `cloudfunctions/saveProblem/index.js`
- Replace: `cloudfunctions/getLayoutImageUrl/` with `cloudfunctions/getWallImageUrl/`
- Modify: `cloudfunctions/wallManager/index.js`
- Modify: `cloudfunctions/README.md`
- Modify: `config/cloudbase.collections.json`
- Modify: `config/cloudbase.rules.json`
- Modify: `project.config.json`

- [ ] **Step 1: Add contract tests or a verification script for cloud payloads**

Extend `scripts/verify-phase1.mjs` to fail if CloudBase source contains `collection('layouts')`, `layoutId`, `activeLayoutId`, `adminLayout`, or `getLayoutImageUrl`, and to require `adminWall` and `getWallImageUrl`.

- [ ] **Step 2: Run verification and confirm it fails**

Run: `npm run verify:phase1`

Expected: FAIL listing the legacy cloud function contracts.

- [ ] **Step 3: Implement Wall create/save/publish operations**

`adminWall` verifies the authenticated owner/admin, creates a complete private Wall, updates holds only while private, and publishes only with at least two holds. It never reads or writes a Layout collection.

- [ ] **Step 4: Update Problem and media functions**

`saveProblem` accepts `wallId`, loads the Wall, verifies public/routable state, and validates assigned Hold IDs against `wall.holds`. `getWallImageUrl` finds image ownership on Wall and follows the same public/private rule as FastAPI.

- [ ] **Step 5: Enforce protected Wall deletion**

`wallManager` counts Problems for the Wall and returns `WALL_IN_USE` instead of cascading. Remove Layout deletion actions.

- [ ] **Step 6: Remove the layouts collection configuration**

Update collection indexes/rules and CloudBase documentation so only Walls and Problems carry content geometry and references.

- [ ] **Step 7: Run verification**

Run: `npm run verify:phase1`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions config project.config.json scripts/verify-phase1.mjs
git commit -m "refactor: flatten cloud wall storage"
```

### Task 8: Migrate fixtures, demos, documentation, and remove dead Layout files

**Files:**
- Modify: `src/data/demo.ts`
- Modify: `src/data/demo-problems.ts`
- Modify: `miniprogram/data/demo.ts`
- Modify: `miniprogram/data/demo-problems.ts`
- Modify: `docs/data-model.md`
- Modify: `docs/architecture.md`
- Rewrite: `docs/manual-test.md`
- Modify or delete: remaining files found by the legacy scan

- [ ] **Step 1: Extend the legacy scan to all product source and current docs**

Add a verification list that rejects active product references to:

```text
interface Layout
layoutId
layoutVersion
activeLayoutId
/layouts
collection('layouts')
```

Exclude historical committed specs/plans from this scan so design history remains readable.

- [ ] **Step 2: Run the scan and capture remaining files**

Run: `rg -n "\bLayout\b|layoutId|layoutVersion|activeLayoutId|/layouts|collection\('layouts'\)" src miniprogram web server cloudfunctions config scripts docs/manual-test.md docs/data-model.md docs/architecture.md`

Expected: matches remain only in files scheduled in this task; after edits the command exits with no matches.

- [ ] **Step 3: Replace demo data with independent Walls**

Move each demo Layout's image/holds into its own Wall and point demo Problems directly to the matching Wall. Preserve all route role Hold IDs.

- [ ] **Step 4: Rewrite current documentation**

Document Wall as the sole wall/image/geometry object, private Wall as editable draft, public Wall as geometry-locked and routable, protected deletion, and Problem's single `wallId` reference. Remove Layout workflows from the manual checklist.

- [ ] **Step 5: Delete dead modules and run the scan again**

Run the exact `rg` command from Step 2.

Expected: no matches in active product code/current docs.

- [ ] **Step 6: Run all static and unit verification**

Run: `npm test && npm run build && npm run web:build && npm run verify:phase1`

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/data miniprogram/data docs scripts
git add -u
git commit -m "docs: complete wall-only migration"
```

### Task 9: Run full integration and manual acceptance

**Files:**
- Modify only if a verification failure exposes an omitted Wall-only migration
- Reference: `docs/manual-test.md`

- [ ] **Step 1: Run all automated suites from a clean process**

Run:

```bash
npm test
npm run build
npm run web:build
npm run verify:phase1
cd server && uv run --extra test pytest -q
```

Expected: every command exits 0 with no skipped migration-critical test.

- [ ] **Step 2: Exercise the local API flow**

Start the local service, authenticate as the configured administrator, create a private Wall with an image, save two holds, publish it, create a Problem using only `wallId`, and verify the response documents contain no Layout fields.

- [ ] **Step 3: Exercise the Web acceptance flow**

Verify:

1. a private Wall appears in “我的草稿” but not public browse;
2. publishing makes it visible in browse and locks geometry;
3. a route can be created and reopened with correct Hold roles;
4. “我的墙面” blocks deletion while the route exists;
5. deleting the route then allows Wall deletion.

- [ ] **Step 4: Exercise the mini-program mock flow**

Repeat the browse, route creation, management, and protected deletion checks with no Layout wording or Layout-shaped request.

- [ ] **Step 5: Verify migration against a disposable legacy database copy**

Run the migration on a copy containing one parent Wall, multiple Layouts, and Problems for each Layout. Confirm independent Walls, correct image/hold ownership, correct Problem mapping, and no deleted source database until validation succeeds.

- [ ] **Step 6: Inspect the final diff and repository state**

Run: `git diff --check && git status --short && git log --oneline -10`

Expected: no whitespace errors, no accidental generated artifacts staged, and only intentional Wall-only changes since the plan commit.

- [ ] **Step 7: Commit any verification-only correction**

If Step 1–6 required a correction, stage only those files and commit:

```bash
git commit -m "fix: complete wall-only verification"
```

If no correction was required, do not create an empty commit.

## Phase-one completion gate

Stop after Task 9 and hand the Wall-only CruxSet build to the user for confirmation. Do not implement any segmentation-lab publishing API, secret, UI control, or source metadata until the user explicitly approves this phase.
