# Dual-Client Next Steps Implementation Plan

**Goal:** Complete the local Web creation loop, publish approved Web content to CloudBase, and independently finish Mini Program CloudBase verification.

**Architecture:** `web/ → server/ → SQLite + local media` is an offline-first administrator workspace. `miniprogram/ → cloudfunctions/ → CloudBase` remains an independent mobile path. Only validated published packages move from Web to CloudBase; drafts never synchronize.

## Current baseline

- [x] Responsive Web shell, LAN access, local administrator password login.
- [x] SQLite persistence, local image upload, fixed demo Wall / two Layouts / four Problems.
- [x] Web reads SQLite data after login and can create a Wall plus draft Layout from an image.
- [x] Server API can create Wall / Layout, publish a Layout (lock + holds), create a Problem, and delete a Layout with cascade confirmation.
- [x] Mini Program Mock mode, three-tab UI, CloudBase adapters and cloud-function skeletons.
- [ ] Web has no draft-Layout annotation editor (add holds on an unpublished Layout); the problem editor's "保存线路" still writes to the in-memory Mock — `ApiSession` overrides reads only, so createLayout / updateLayout / publishLayout / createProblem / deleteProblem / deleteLayout / deleteWall all still fall back to Mock.
- [ ] Server lacks `DELETE /problems/{id}` and `DELETE /walls/{id}` (SQLite repository lacks `delete_problem` / `delete_wall`).
- [ ] Web annotation interaction (pinch zoom, continuous Hold creation, Hold/Volume choice, move / radius / delete / Undo) is not ported.
- [ ] Web publication-package export and CloudBase importer.
- [ ] Mini Program CloudBase deployment and real-device acceptance.

## Priorities（后续开发顺序）

1. **Web 草稿标注、发布、真实线路写入与删除** — Web draft annotation, publish, real Problem writes & deletes.
2. **Web 标注交互完善** — Web annotation interaction refinement.
3. **发布包导出** — Publication-package export.
4. **CloudBase 导入** — CloudBase import.
5. **小程序独立 CloudBase 与真机验收** — Mini Program independent CloudBase & real-device acceptance.

Order rationale: the local creation loop must persist real data to SQLite before any downstream export / import is meaningful, so the data path (draft → publish → Problem write / delete) comes first; interaction polish is deferred until writes are correct; Mini Program CloudBase verification is last because it consumes imported published content and must be proven with FastAPI stopped.

## Tasks

### 1. Web 草稿标注、发布、真实线路写入与删除 (Web draft annotation, publish, real Problem writes & deletes)

Goal: close the local creation loop end-to-end in SQLite — no Mock write call left in the Web path.

- **Draft Layout annotation:** build the `draft-editor` page so an administrator can add holds (0–1 normalized coordinates) to an unpublished Layout and persist them through the API.
- **Publish from Web:** publish a draft Layout via the existing `POST /layouts/{id}/publish` with server-side validation (≥ 2 holds), permanent lock and version bump; after publish the Layout leaves “我的草稿” and is routable.
- **Real Problem writes:** route `createProblem` / `deleteProblem` in `ApiSession` to FastAPI instead of Mock, so “保存线路” persists to SQLite; delete removes the Problem and is reflected on the Web after reload.
- **Server additions:** `DELETE /problems/{id}` (creator or admin only) and `DELETE /walls/{id}?confirmCascade=true`; add `delete_problem` / `delete_wall` to the SQLite repository.
- **Replace remaining Mock write calls:** make `ApiSession` override createLayout / updateLayout / publishLayout / createProblem / deleteProblem / deleteLayout / deleteWall to hit the API.
- **Cascade rules:** deleting a published Layout removes its Problems; deleting a Wall removes its Layouts and Problems; both require explicit confirmation (reuse the existing two-step dialog).
- **Tests:** API lifecycle tests (create → publish → problem write / delete → cascade delete), repository contract, and Web session tests proving no Mock write remains.

### 2. Web 标注交互完善 (Web annotation interaction refinement)

Goal: make the Web annotator comfortable for real use, mirroring the interaction already proven in the Mini Program domain.

- Touch pinch zoom on the wall canvas with a stable anchor (single-finger pan + two-finger pinch).
- Continuous Hold creation (H001, H002, …) without modal interruptions.
- Hold / Volume choice with default radius; move center, adjust radius, delete, and ≥ 50-step Undo.
- Server-side normalized-coordinate validation for draft Layout holds (reject screen pixel coordinates).
- Performance check with 300–600 holds on the Web canvas.

### 3. 发布包导出 (Publication-package export)

Goal: produce a validated, checksummed package that contains only published, internally consistent content.

- Export published Wall / Layout / Problems and their images into a checksummed zip (JSON content + media files).
- Reject drafts and any invalid references (missing Wall / Layout / Hold / media).
- Include a manifest with content version and checksums; verify the archive round-trips.

### 4. CloudBase 导入 (CloudBase import)

Goal: import a validated publication package into CloudBase safely and idempotently.

- Implement dry-run and an explicit `--apply` importer; validate all content before any upload / write.
- Keep business `users.id`-referenced semantics; regenerate `problem_number` through the `counters` transaction where required.
- Persist an import receipt so the same package cannot be imported twice.
- Tests: dry-run rejects invalid packages; `--apply` is idempotent.

### 5. 小程序独立 CloudBase 与真机验收 (Mini Program independent CloudBase & real-device acceptance)

Goal: the Mini Program runs standalone against CloudBase — with FastAPI stopped — and passes real-device acceptance.

- Deploy CloudBase resources: collections, indexes, permission rules and cloud functions per `docs/cloudbase-setup.md` and `config/cloudbase.collections.json`.
- Switch `runtimeMode` to `'cloudbase'`; verify imported published content appears in the Lines flow.
- Verify native user upload / annotation / routing with FastAPI stopped (no Web dependency at runtime).
- Real-device acceptance on at least one Android and one iPhone per `docs/manual-test.md`; document backup, administrator reset, export / import and rollback.

## Required checks

```bash
cd server && uv run pytest -q
npm test
npm run web:build
npm run build
git diff --check
```