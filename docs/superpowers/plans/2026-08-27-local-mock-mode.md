# 本地 Mock 模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CruxSet 默认以固定的本地 Mock 数据运行，开发时不调用 CloudBase，并能通过单一配置切换到现有 CloudBase 服务。

**Architecture:** 新增一个纯 TypeScript 的 Mock Repository，保存固定种子数据及本次运行的可变副本。现有 service 文件维持页面 API 不变，按 `runtimeMode` 委托给 Mock 或现有 CloudBase 调用。应用启动按模式初始化固定用户或 CloudBase。

**Tech Stack:** 微信小程序原生 TypeScript/WXML、Vitest、现有 CloudBase services。

---

### Task 1: Runtime mode and deterministic mock seed

**Files:**
- Create: `miniprogram/config/runtime.ts`
- Create: `miniprogram/services/mock-repository.ts`
- Create: `tests/mock-repository.test.ts`
- Create: `miniprogram/assets/mock/ritan-spraywall-0822.jpg`

- [ ] **Step 1: Copy the user-provided test wall image**

Copy `/mnt/c/Users/yanxi/Desktop/日坛_spraywall_0822.jpg` to `miniprogram/assets/mock/ritan-spraywall-0822.jpg`. It must remain a repository asset and is never uploaded by Mock mode.

- [ ] **Step 2: Write failing seed isolation test**

```ts
import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('creates a fresh draft wall with the local wall image for each repository', async () => {
  const first = createMockRepository()
  const second = createMockRepository()
  const [wall] = await first.listMyWalls()
  const [layout] = await first.listLayouts(wall.id)
  expect(wall.name).toContain('日坛')
  expect(layout.published).toBe(false)
  expect(layout.imageFileId).toBe('/assets/mock/ritan-spraywall-0822.jpg')
  await first.updateWall(wall.id, { name: 'changed' })
  expect((await second.getWall(wall.id)).name).not.toBe('changed')
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test -- tests/mock-repository.test.ts`

Expected: FAIL because `mock-repository.js` does not exist.

- [ ] **Step 4: Implement runtime configuration and seed**

Create `miniprogram/config/runtime.ts`:

```ts
export type RuntimeMode = 'mock' | 'cloudbase'
export const runtimeMode: RuntimeMode = 'mock'
export const isMockMode = () => runtimeMode === 'mock'
```

Create a pure `MockRepository` with factory `createMockRepository()`. Each factory call clones:
- the existing public demo Wall, Layout and Problems;
- a private `wall_mock_ritan` owned by `usr_mock_owner`;
- an unpublished `layout_mock_ritan_draft` using `/assets/mock/ritan-spraywall-0822.jpg`, with an empty Hold list.

Expose `listWalls`, `listMyWalls`, `getWall`, `getLayout`, `listLayouts`, and `updateWall`. Reads must return clones, not internal mutable objects.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/mock-repository.test.ts && npm test && npm run build`

Expected: all tests and both TypeScript builds pass.

```bash
git add miniprogram/config/runtime.ts miniprogram/services/mock-repository.ts miniprogram/assets/mock/ritan-spraywall-0822.jpg tests/mock-repository.test.ts
git commit -m "feat: add deterministic local mock seed"
```

### Task 2: Mock write behavior and publication lock

**Files:**
- Modify: `miniprogram/services/mock-repository.ts`
- Create: `tests/mock-publication.test.ts`

- [ ] **Step 1: Write failing publication test**

```ts
import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'

it('locks a published mock layout and allows a separate replacement layout', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const [draft] = await repo.listLayouts(wall.id)
  await repo.publishLayout(wall.id, draft.id, [])
  await expect(repo.publishLayout(wall.id, draft.id, [])).rejects.toThrow('LAYOUT_LOCKED')
  const replacement = await repo.createLayout(wall.id, { name: 'replacement', imageFileId: '/assets/mock/ritan-spraywall-0822.jpg', imageWidth: 4096, imageHeight: 3072 })
  expect(replacement.id).not.toBe(draft.id)
  expect(replacement.published).toBe(false)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/mock-publication.test.ts`

Expected: FAIL because publication and replacement methods do not exist.

- [ ] **Step 3: Implement mock writes**

Add to the repository:
- `createWall(data)`, always assigning `ownerId: 'usr_mock_owner'` and defaulting visibility to `private`;
- `createLayout(wallId, data)`, creating a distinct Layout ID with `version: 1`, `published: false`, and `holds: []`;
- `updateLayout(wallId, layoutId, holds)` and `publishLayout(wallId, layoutId, holds)`;
- strict `LAYOUT_LOCKED` rejection whenever the latest snapshot is published;
- `createProblem(wallId, layoutId, draft)` and `deleteProblem(id)`, using the existing domain `createProblem` and monotonically increasing local `CS-000xxx` numbers;
- `uploadWallImage(filePath)` returning `{ fileID: filePath }`, and `getLayoutImageUrl(fileID)` returning `fileID`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/mock-publication.test.ts && npm test && npm run build`

Expected: all tests pass.

```bash
git add miniprogram/services/mock-repository.ts tests/mock-publication.test.ts
git commit -m "feat: model local mock writes and publication lock"
```

### Task 3: Route existing services through the selected data source

**Files:**
- Modify: `miniprogram/services/walls.ts`
- Modify: `miniprogram/services/layouts.ts`
- Modify: `miniprogram/services/problems.ts`
- Modify: `miniprogram/services/users.ts`
- Modify: `miniprogram/app.ts`
- Create: `tests/mock-service-mode.test.ts`

- [ ] **Step 1: Write failing service routing test**

```ts
import { expect, it } from 'vitest'
import { mockCurrentUserId, repositoryForMode } from '../miniprogram/services/mock-repository.js'

it('selects the stable mock identity and repository in mock mode', () => {
  expect(mockCurrentUserId).toBe('usr_mock_owner')
  expect(repositoryForMode('mock')).toBeDefined()
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- tests/mock-service-mode.test.ts`

Expected: FAIL because mode routing exports do not exist.

- [ ] **Step 3: Add service delegation**

Export one shared Mock Repository instance and `repositoryForMode(mode)` from `mock-repository.ts`. In each service function:
- when `isMockMode()`, call the equivalent Mock Repository method;
- otherwise preserve the existing `call(...)` or `wallManager(...)` implementation exactly.

`ensureUser()` returns `usr_mock_owner` and caches it in Mock mode. `app.ts` skips `wx.cloud.init` in Mock mode; it retains the existing CloudBase initialization unchanged for `cloudbase`.

The services exposed to pages remain named `listWalls`, `listMyWalls`, `getWall`, `adminLayout`, `getLayout`, `listLayouts`, `getLayoutImageUrl`, `uploadWallImage`, `saveProblem`, `deleteProblem`, `listProblems`, and `getProblem`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/mock-service-mode.test.ts && npm test && npm run build`

Expected: all tests pass.

```bash
git add miniprogram/services/walls.ts miniprogram/services/layouts.ts miniprogram/services/problems.ts miniprogram/services/users.ts miniprogram/app.ts miniprogram/services/mock-repository.ts tests/mock-service-mode.test.ts
git commit -m "feat: route services through local mock mode"
```

### Task 4: Document the developer and CloudBase verification workflows

**Files:**
- Modify: `README.md`
- Modify: `docs/manual-test.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Add exact mode-switch documentation**

Document that `miniprogram/config/runtime.ts` is committed with `runtimeMode = 'mock'`. Explain that CloudBase acceptance requires changing it to `'cloudbase'`, compiling, and deploying any changed cloud functions. State explicitly that a release build must use `cloudbase`.

- [ ] **Step 2: Add manual Mock checklist**

Add:
- start without CloudBase deployment;
- open “我的 → 日坛 Spraywall → 开始标注”;
- add Hold, publish, confirm lock;
- create a replacement Layout;
- recompile and confirm seed data resets;
- switch to CloudBase and confirm no Mock walls appear.

- [ ] **Step 3: Final verification and commit**

Run: `npm test && npm run build && npm run verify:phase1 -- --release && git status --short`

Expected: automated tests, build and Phase 1 structural verification pass; worktree contains only intentional changes.

```bash
git add README.md docs/manual-test.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: document local mock workflow"
```

