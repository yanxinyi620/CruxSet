# Layout 发布锁定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Layout 在首次发布后不可再修改，并让墙面创建者无需开发者工具参数即可完成草稿标注或创建新 Layout。

**Architecture:** 页面只对草稿开放编辑操作；`wallManager` 是唯一数据库写入边界，在写入前锁定已发布 Layout。为“我的墙面”增加 Layout 摘要读取动作，管理页据此打开草稿或创建新 Layout。

**Tech Stack:** 微信小程序原生 TypeScript/WXML、CloudBase 云函数、Vitest。

---

### Task 1: Layout 发布状态领域模型

**Files:**
- Create: `src/domain/layout-publication.ts`
- Create: `tests/layout-publication.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `miniprogram/domain/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { canEditLayout, isLayoutPublished } from '../src/domain/layout-publication.js'

it('only treats an explicitly published layout as locked', () => {
  expect(isLayoutPublished({ published: true })).toBe(true)
  expect(isLayoutPublished({ published: false })).toBe(false)
  expect(isLayoutPublished({})).toBe(false)
  expect(canEditLayout({ published: true })).toBe(false)
  expect(canEditLayout({ published: false })).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layout-publication.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal domain API**

```ts
export type PublicationState = { published?: boolean }
export const isLayoutPublished = (layout: PublicationState) => layout.published === true
export const canEditLayout = (layout: PublicationState) => !isLayoutPublished(layout)
```

Add `published: boolean` immediately after `version` in both Layout interfaces.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/layout-publication.test.ts && npm test && npm run build`

Expected: all tests pass and both TypeScript builds complete without errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/layout-publication.ts tests/layout-publication.test.ts src/domain/types.ts miniprogram/domain/types.ts
git commit -m "feat: model layout publication state"
```

### Task 2: Lock published Layouts in CloudBase

**Files:**
- Modify: `cloudfunctions/wallManager/index.js`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Define real-environment acceptance cases**

Append to `docs/manual-test.md`:

```md
## Layout 发布锁定

- [ ] 墙面创建者可打开未发布 Layout，添加岩点并发布。
- [ ] 发布后再次调用 updateLayout，云函数返回 LAYOUT_LOCKED，且数据库没有新增版本。
- [ ] 发布后再次调用 publishLayout，云函数返回 LAYOUT_LOCKED。
- [ ] 创建新的 Layout 后，可在不改变旧 Layout 和旧线路的前提下标注并发布。
```

- [ ] **Step 2: Add the server lock**

After loading the latest Layout record and before creating `update` in `wallManager`, add:

```js
if (layout.published) throw new Error('LAYOUT_LOCKED')
```

Keep current ownership and `validHolds` checks intact. The shared update branch covers both `updateLayout` and `publishLayout`.

- [ ] **Step 3: Verify locally and deploy**

Run: `npm test && npm run build && npm run verify:phase1 -- --release`

Expected: all commands pass.

In WeChat Developer Tools, deploy `cloudfunctions/wallManager` using “上传并部署：云端安装依赖（不上传 node_modules）”, then complete the acceptance checklist.

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/wallManager/index.js docs/manual-test.md
git commit -m "fix: lock layouts after publication"
```

### Task 3: List current Layouts for a managed Wall

**Files:**
- Modify: `src/domain/layout-publication.ts`
- Create: `tests/layout-service-contract.test.ts`
- Modify: `cloudfunctions/wallManager/index.js`
- Modify: `miniprogram/services/layouts.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { expect, it } from 'vitest'
import { latestLayouts } from '../src/domain/layout-publication.js'

it('keeps only the newest snapshot for each layout id', () => {
  expect(latestLayouts([
    { id: 'layout_a', version: 1, published: false },
    { id: 'layout_a', version: 2, published: true },
    { id: 'layout_b', version: 1, published: false }
  ])).toEqual([
    { id: 'layout_a', version: 2, published: true },
    { id: 'layout_b', version: 1, published: false }
  ])
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- tests/layout-service-contract.test.ts`

Expected: FAIL because `latestLayouts` is not exported.

- [ ] **Step 3: Implement server action and service**

Extend the domain module:

```ts
export const latestLayouts = <T extends { id: string; version: number }>(layouts: T[]) =>
  Object.values(layouts.reduce<Record<string, T>>((latest, layout) => {
    if (!latest[layout.id] || latest[layout.id].version < layout.version) latest[layout.id] = layout
    return latest
  }, {}))
```

Add `listLayouts` in `wallManager` before the write guard. It must:
1. use `wallAccess(db, data.wallId, actor)`;
2. fetch only matching `wallId` records;
3. return only the largest `version` of each Layout `id`, ordered by `updatedAt` descending.

Add to `miniprogram/services/layouts.ts`:

```ts
export const listLayouts = (wallId: string) =>
  wallManager('listLayouts', { wallId }) as Promise<Layout[]>
```

- [ ] **Step 4: Verify**

Run: `npm test -- tests/layout-service-contract.test.ts && npm test && npm run build`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/layout-publication.ts tests/layout-service-contract.test.ts cloudfunctions/wallManager/index.js miniprogram/services/layouts.ts
git commit -m "feat: list current layouts for wall management"
```

### Task 4: Add explicit draft and replacement Layout routes

**Files:**
- Create: `miniprogram/pages/admin/layout-create/index.ts`
- Create: `miniprogram/pages/admin/layout-create/index.wxml`
- Create: `miniprogram/pages/admin/layout-create/index.wxss`
- Create: `miniprogram/pages/admin/layout-create/index.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/me/index.ts`
- Modify: `miniprogram/pages/me/index.wxml`
- Modify: `miniprogram/pages/me/index.wxss`
- Modify: `src/domain/layout-publication.ts`
- Create: `tests/layout-management-routes.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
import { expect, it } from 'vitest'
import { layoutEditorRoute, newLayoutRoute } from '../src/domain/layout-publication.js'

it('creates stable routes for a draft and a new layout', () => {
  expect(layoutEditorRoute('wall_1', 'layout_1')).toBe('/pages/admin/layout-editor/index?wallId=wall_1&layoutId=layout_1')
  expect(newLayoutRoute('wall_1')).toBe('/pages/admin/layout-create/index?wallId=wall_1')
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- tests/layout-management-routes.test.ts`

Expected: FAIL because route helpers do not exist.

- [ ] **Step 3: Implement routes and creation page**

Add:

```ts
export const layoutEditorRoute = (wallId: string, layoutId: string) =>
  `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}`
export const newLayoutRoute = (wallId: string) =>
  `/pages/admin/layout-create/index?wallId=${wallId}`
```

Register `pages/admin/layout-create/index` in `miniprogram/app.json`. The page reads `wallId`, accepts Layout name and image, uploads under `layouts/${wallId}/`, calls `adminLayout('createLayout', …)` with `holds: []` and `geometryType: 'circle'`, then redirects to the editor route.

On “我的墙面”, call `listLayouts(wall.id)`. Each newest Layout offers:
- `开始标注` when `published === false`, opening its editor;
- `已发布并锁定` and `创建新 Layout` when `published === true`.

No published Layout may have a navigation button to the editor.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/layout-management-routes.test.ts && npm test && npm run build`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/layout-publication.ts tests/layout-management-routes.test.ts miniprogram/app.json miniprogram/pages/admin/layout-create miniprogram/pages/me
git commit -m "feat: manage draft and replacement layouts"
```

### Task 5: Show published Layouts as read-only

**Files:**
- Modify: `src/domain/layout-publication.ts`
- Create: `tests/layout-editor-state.test.ts`
- Modify: `miniprogram/pages/admin/layout-editor/index.ts`
- Modify: `miniprogram/pages/admin/layout-editor/index.wxml`
- Modify: `miniprogram/pages/admin/layout-editor/index.wxss`

- [ ] **Step 1: Write failing editor-state test**

```ts
import { expect, it } from 'vitest'
import { layoutEditorState } from '../src/domain/layout-publication.js'

it('makes published layouts explicitly read-only', () => {
  expect(layoutEditorState({ published: true })).toEqual({ editable: false, message: '该 Layout 已发布并锁定' })
  expect(layoutEditorState({ published: false })).toEqual({ editable: true, message: '' })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- tests/layout-editor-state.test.ts`

Expected: FAIL because `layoutEditorState` does not exist.

- [ ] **Step 3: Implement state and render it**

Add:

```ts
export const layoutEditorState = (layout: PublicationState) =>
  isLayoutPublished(layout)
    ? { editable: false, message: '该 Layout 已发布并锁定' }
    : { editable: true, message: '' }
```

The editor sets `editable` and `lockMessage` from fetched Layout. It always renders the image and hold overlays; it renders upload, marker tools, deletion/sliders, Undo, and publish only when editable. All mutation handlers must return immediately when not editable. Map cloud error `LAYOUT_LOCKED` to “Layout 已发布，不能修改；请创建新的 Layout”, retaining no local draft that could overwrite it.

- [ ] **Step 4: Verify all checks**

Run: `npm test -- tests/layout-editor-state.test.ts && npm test && npm run build && npm run verify:phase1 -- --release`

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/layout-publication.ts tests/layout-editor-state.test.ts miniprogram/pages/admin/layout-editor
git commit -m "feat: show published layouts as read-only"
```

### Task 6: Update delivery checklist

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Update local/remote status**

Record the locking and self-service entry as locally complete, while keeping real-environment CloudBase deployment and device verification unchecked until `wallManager` has been deployed and tested.

- [ ] **Step 2: Add the end-to-end manual path**

Document: create wall → mark initial draft → publish → return to “我的” → confirm only “创建新 Layout” is available → create and publish replacement Layout → confirm old route still renders.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run build && npm run verify:phase1 -- --release && git status --short`

Expected: all automated checks pass and the worktree is clean after commits.

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md docs/manual-test.md
git commit -m "docs: record layout lock verification"
```

