# 小程序公开墙面与线路功能改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 Web/FastAPI/SQLite/分割实验台行为的前提下，收缩小程序为公开墙面与线路客户端，并将校准后的公开墙面单向同步到 CloudBase。

**Architecture:** 小程序继续通过云函数访问 CloudBase；新增独立同步器负责将分割实验台已发布的本地结果上传 CloudBase Storage 并写入 `walls`。Web 与本地 FastAPI 保持原路径，同步失败不得影响本地数据。

**Tech Stack:** 微信原生小程序、TypeScript、Node.js Cloud Functions、wx-server-sdk、CloudBase Storage/数据库、Python 分割实验台。

---

### Task 1: 收缩小程序导航与普通用户页面

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/custom-tab-bar/index.ts`
- Modify: `miniprogram/pages/create/index.ts`
- Modify: `miniprogram/pages/create/index.wxml`
- Modify: `miniprogram/pages/create/drafts/index.ts`
- Modify: `miniprogram/pages/create/drafts/index.wxml`
- Modify: `miniprogram/pages/me/index.ts`
- Modify: `miniprogram/pages/me/index.wxml`
- Test: `tests/miniprogram-scope.test.ts`

- [ ] **Step 1: Write failing tests** verifying no user-facing route or tap handler navigates to wall creation, wall drafts, or hold annotation, while route creation and my-problems remain reachable.
- [ ] **Step 2: Run `npm test -- tests/miniprogram-scope.test.ts` and confirm failure because the old create-wall paths still exist.**
- [ ] **Step 3: Remove wall creation/draft/annotation pages from `app.json`, remove the wall-creation hero and wall-draft entry from the Create page, and retain only the route-creation entry. Keep the administrator wall list reachable only from an admin-gated My page entry.**
- [ ] **Step 4: Run the focused test and `npm run build`; confirm the route editor and public wall pages still compile.**
- [ ] **Step 5: Commit locally with `git commit -m "feat: narrow miniprogram to public wall routes"`.**

### Task 2: Add route editing service and Cloud Function authorization

**Files:**
- Create: `cloudfunctions/updateProblem/index.js`
- Create: `cloudfunctions/updateProblem/package.json`
- Modify: `miniprogram/services/problems.ts`
- Modify: `miniprogram/pages/problem/editor/index.ts`
- Modify: `miniprogram/pages/problem/editor/index.wxml`
- Test: `tests/cloudbase-problem-update.test.ts`

- [ ] **Step 1: Write failing tests** for owner-only updates, preservation of `id`/`number`, public-wall requirement, angle-option validation, V0–V12 validation, Start/Finish requirements, duplicate/unknown Hold rejection, and 500-character descriptions.
- [ ] **Step 2: Run the focused test and confirm the update function is missing.**
- [ ] **Step 3: Implement `updateProblem` using the same identity lookup and validation rules as `saveProblem`; read the stored Problem and Wall, reject non-owner edits, then update only editable fields while preserving identifiers and timestamps.**
- [ ] **Step 4: Add `updateProblem` to the mini-program service and make the editor accept an optional `problemId`; load an existing Problem, initialize fields/Hold selections, and save through update instead of create.**
- [ ] **Step 5: Run focused tests and `npm run build`; confirm new and existing route flows compile and pass.**
- [ ] **Step 6: Commit locally with `git commit -m "feat: support owner route editing in cloudbase"`.**

### Task 3: Restrict administrator wall operations without affecting Web

**Files:**
- Modify: `miniprogram/pages/me/walls/index.ts`
- Modify: `miniprogram/pages/me/walls/index.wxml`
- Modify: `miniprogram/pages/me/index.ts`
- Modify: `cloudfunctions/adminWall/index.js`
- Modify: `cloudfunctions/wallManager/index.js`
- Test: `tests/miniprogram-admin-wall-scope.test.ts`

- [ ] **Step 1: Write failing tests** proving ordinary users cannot reach the wall-management page or invoke wall deletion, administrators can list and delete walls, and walls referenced by a Problem cannot be deleted.
- [ ] **Step 2: Run the focused test and verify the old un-gated management behavior fails.**
- [ ] **Step 3: Add a server-side admin action/list response and a client-side admin check; remove mini-program calls to `createWall`, `updateWall`, `updateWallHolds`, and `publishWall` while retaining admin wall listing/deletion.**
- [ ] **Step 4: Keep `adminWall` changes isolated to CloudBase functions; do not touch `server/app` or existing Web routes.**
- [ ] **Step 5: Run focused tests, existing wall lifecycle tests, and `npm run build`.**
- [ ] **Step 6: Commit locally with `git commit -m "feat: limit miniprogram wall management to admins"`.**

### Task 4: Implement isolated segmentation-to-CloudBase synchronizer

**Files:**
- Create: `tools/segmentation-lab/src/segmentation_lab/cloudbase_sync.py`
- Create: `tools/segmentation-lab/tests/test_cloudbase_sync.py`
- Create: `cloudfunctions/segmentationPublish/index.js`
- Create: `cloudfunctions/segmentationPublish/package.json`
- Modify: `tools/segmentation-lab/src/segmentation_lab/config.py`
- Modify: `tools/segmentation-lab/src/segmentation_lab/api.py` only by adding an optional post-success hook that cannot change the existing response path
- Modify: `config/cloudbase.collections.json`

- [ ] **Step 1: Write failing tests** for polygon normalization, Hold ID generation, required metadata, unsupported kinds, idempotent `publishRequestId`, and failure isolation from the local publish record.
- [ ] **Step 2: Run `cd tools/segmentation-lab && uv run pytest tests/test_cloudbase_sync.py -q` and confirm failure because the synchronizer does not exist.**
- [ ] **Step 3: Implement the synchronizer as a separate service boundary. It should upload the image to CloudBase Storage, call a privileged `segmentationPublish` function with signed metadata, and record success/failure separately from the existing local calibration publish record.**
- [ ] **Step 4: Implement the cloud function to validate signed requests, resolve a CloudBase `ownerId`, reject conflicting reused request IDs, write a public polygon Wall, and return the existing Wall ID for retries.**
- [ ] **Step 5: Add a unique/indexed publication receipt collection or equivalent atomic guard; do not use the local Web administrator ID as the CloudBase owner.**
- [ ] **Step 6: Run the focused sync tests and existing segmentation-lab tests; confirm the original FastAPI publish tests remain unchanged and passing.**
- [ ] **Step 7: Commit locally with `git commit -m "feat: sync calibrated walls to cloudbase"`.**

### Task 5: Align CloudBase fixtures, error mapping, and route UI

**Files:**
- Modify: `miniprogram/services/errors.ts`
- Modify: `miniprogram/pages/me/problems/index.ts`
- Modify: `miniprogram/pages/me/problems/index.wxml`
- Modify: `miniprogram/pages/problem/detail/index.ts`
- Modify: `miniprogram/pages/problem/detail/index.wxml`
- Test: `tests/miniprogram-route-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests** for create → view → edit → delete by owner, rejection for another user, and rendering of synchronized polygon walls.
- [ ] **Step 2: Run the focused tests and confirm the edit action and synchronized-wall fixture are missing.**
- [ ] **Step 3: Add edit/delete actions to the owner’s route list/detail UI, map stable cloud error codes to user-facing Chinese messages, and ensure wall image loading continues through temporary URLs.**
- [ ] **Step 4: Add a fixture representing a public polygon Wall with `cloud://` image ID and source metadata; keep private/draft Walls out of browse results.**
- [ ] **Step 5: Run focused tests and `npm run build`.**
- [ ] **Step 6: Commit locally with `git commit -m "feat: complete miniprogram route lifecycle"`.**

### Task 6: Full verification and local handoff

**Files:**
- Modify: `README.md` to document the optional one-way CloudBase synchronizer and its required server-only configuration
- Test: existing Web, server, and mini-program suites

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npm run build`.**
- [ ] **Step 3: Run `cd server && uv run pytest -q`.**
- [ ] **Step 4: Run `cd tools/segmentation-lab && uv run pytest -q`.**
- [ ] **Step 5: Run `git diff --check` and inspect `git status --short --branch`.**
- [ ] **Step 6: Perform CloudBase acceptance: sync one calibrated public Wall, browse it with FastAPI stopped, create a route, edit it, delete it, and verify an administrator can delete an unused Wall.**
- [ ] **Step 7: Commit any documentation-only changes locally; do not push to GitHub unless explicitly requested.**
