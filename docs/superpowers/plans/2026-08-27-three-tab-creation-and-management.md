# Three-tab Creation and Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give “线路 / 创建 / 我的” a coherent visual system and a safe Draft-to-published lifecycle.

**Architecture:** Pages keep using the service layer. A pure Draft selector drives Create; Mock and CloudBase enforce the same routable-Layout and cascading-delete rules. My is status plus confirmed deletion only.

**Tech Stack:** TypeScript, WXML/WXSS, CloudBase functions, Mock Repository, Vitest.

---

### Task 1: Model Draft selection and enforce routable Layouts

**Files:**
- Create: `miniprogram/domain/draft-layout.ts`, `src/domain/draft-layout.ts`, `tests/draft-layout.test.ts`, `tests/mock-routable-problem.test.ts`
- Modify: `miniprogram/services/mock-repository.ts`, `cloudfunctions/saveProblem/index.js`

- [ ] **Step 1: Write the failing Draft selector test**

```ts
import { expect, it } from 'vitest'
import { draftLayoutsForWalls } from '../src/domain/draft-layout.js'
const walls = [{ id: 'wall_a' }, { id: 'wall_b' }] as any
const layouts = [
  { id: 'draft_a', wallId: 'wall_a', published: false },
  { id: 'published_a', wallId: 'wall_a', published: true },
  { id: 'foreign', wallId: 'wall_x', published: false }
] as any
it('returns only unpublished layouts belonging to supplied walls', () => {
  expect(draftLayoutsForWalls(walls, layouts)).toEqual([
    { id: 'draft_a', wallId: 'wall_a', published: false }
  ])
})
```

- [ ] **Step 2: Confirm the test fails**

Run: `npm test -- tests/draft-layout.test.ts`

Expected: FAIL because `src/domain/draft-layout.js` does not exist.

- [ ] **Step 3: Implement the selector and Node test export**

```ts
// miniprogram/domain/draft-layout.ts
import type { Layout, Wall } from './types.js'
export const draftLayoutsForWalls = (walls: readonly Wall[], layouts: readonly Layout[]) => {
  const wallIds = new Set(walls.map(wall => wall.id))
  return layouts.filter(layout => wallIds.has(layout.wallId) && !layout.published)
}

// src/domain/draft-layout.ts
export { draftLayoutsForWalls } from '../../miniprogram/domain/draft-layout.js'
```

- [ ] **Step 4: Write the failing Mock route-write test**

```ts
import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'
it('rejects a route against an unpublished Layout', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls()
  const [layout] = await repo.listLayouts(wall.id)
  await expect(repo.createProblem(wall.id, layout.id, {})).rejects.toThrow('LAYOUT_NOT_ROUTABLE')
})
```

- [ ] **Step 5: Confirm the route-write test fails**

Run: `npm test -- tests/mock-routable-problem.test.ts`

Expected: FAIL because the Mock repository currently permits that write.

- [ ] **Step 6: Add the guard in Mock and CloudBase**

After loading the Wall/Layout pair and before metadata validation in both `MockRepository.createProblem` and `cloudfunctions/saveProblem/index.js`, add:

```ts
if (!layout.published || wall.activeLayoutId !== layout.id || layout.holds.length < 2) {
  throw new Error('LAYOUT_NOT_ROUTABLE')
}
```

Use JavaScript syntax in the cloud function. This guarantees the Create-page filter cannot be bypassed.

- [ ] **Step 7: Verify and commit**

Run: `npm test -- tests/draft-layout.test.ts tests/mock-routable-problem.test.ts && npm test && npm run build`

Expected: all tests pass and both TypeScript projects compile.

```bash
git add miniprogram/domain/draft-layout.ts src/domain/draft-layout.ts tests/draft-layout.test.ts tests/mock-routable-problem.test.ts miniprogram/services/mock-repository.ts cloudfunctions/saveProblem/index.js
git commit -m "feat: enforce draft and routing lifecycle"
```

### Task 2: Add owner-authorized cascading delete operations

**Files:**
- Create: `tests/mock-deletion.test.ts`
- Modify: `miniprogram/services/mock-repository.ts`, `miniprogram/services/layouts.ts`, `miniprogram/services/walls.ts`, `cloudfunctions/wallManager/index.js`

- [ ] **Step 1: Write failing Mock cascade tests**

```ts
import { expect, it } from 'vitest'
import { createMockRepository } from '../miniprogram/services/mock-repository.js'
it('deletes an owned published Layout and its routes', async () => {
  const repo = createMockRepository()
  const [wall] = await repo.listMyWalls(); const [layout] = await repo.listLayouts(wall.id)
  const holds = [{ id: 'H001', x: .1, y: .1, radius: .02, kind: 'hold' }, { id: 'H002', x: .2, y: .2, radius: .02, kind: 'hold' }] as any
  await repo.publishLayout(wall.id, layout.id, holds)
  await repo.createProblem(wall.id, layout.id, { angle: 20, grade: 'V0', holds: { start: ['H001'], finish: ['H002'] } })
  await repo.deleteLayout(wall.id, layout.id)
  await expect(repo.getLayout(layout.id)).rejects.toThrow('LAYOUT_NOT_FOUND')
  expect(await repo.listProblems({ layoutId: layout.id })).toEqual([])
})
it('deletes an owned wall together with layouts and routes', async () => {
  const repo = createMockRepository(); const [wall] = await repo.listMyWalls()
  await repo.deleteWall(wall.id)
  await expect(repo.getWall(wall.id)).rejects.toThrow('WALL_NOT_FOUND')
  expect(await repo.listProblems({ wallId: wall.id })).toEqual([])
})
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npm test -- tests/mock-deletion.test.ts`

Expected: FAIL because neither delete method exists.

- [ ] **Step 3: Implement Mock methods and service exports**

Add owner-checked `deleteLayout(wallId, layoutId)` and `deleteWall(wallId)` to `MockRepository`. The first removes every version of that Layout and matching Problems, clears `activeLayoutId` if necessary, and returns `{ ok: true }`. The second removes its Wall, all descendant Layout versions, and all Problems, then returns `{ ok: true }`.

Expose only services to pages:

```ts
// layouts.ts
export const deleteLayout = (wallId: string, layoutId: string) =>
  isMockMode() ? mockRepository.deleteLayout(wallId, layoutId) : wallManager('deleteLayout', { wallId, layoutId })
// walls.ts
export const deleteWall = (wallId: string) =>
  isMockMode() ? mockRepository.deleteWall(wallId) : wallManager('deleteWall', { wallId })
```

- [ ] **Step 4: Add CloudBase server-side cascades**

Extend `writeActions` in `wallManager` with `deleteLayout` and `deleteWall`. Reuse `wallAccess` and `owner` before any removal. `deleteLayout` must verify it belongs to the Wall, remove every `layouts` document matching `{id, wallId}`, remove Problems matching `{wallId, layoutId}`, and clear the active Layout ID if it matches. `deleteWall` must remove all `problems` and `layouts` matching `wallId`, then the Wall document. Return `{ ok: true }`.

Put the cascade in the cloud function, never in the page. Use a transaction if the deployed SDK supports query/remove in a transaction; otherwise keep each operation in this owner-authorized function and document the order.

- [ ] **Step 5: Add the owner regression case and verify**

```ts
it('rejects another owner wall deletion', async () => {
  const repo = createMockRepository()
  ;(repo as any).walls.push({ id: 'foreign', ownerId: 'another-user', visibility: 'private' })
  await expect(repo.deleteWall('foreign')).rejects.toThrow('FORBIDDEN')
})
```

Run: `npm test -- tests/mock-deletion.test.ts && npm test && npm run build`

```bash
git add tests/mock-deletion.test.ts miniprogram/services/mock-repository.ts miniprogram/services/layouts.ts miniprogram/services/walls.ts cloudfunctions/wallManager/index.js
git commit -m "feat: cascade wall and layout deletion"
```

### Task 3: Make Create the only Draft-resume entry

**Files:**
- Modify: `miniprogram/pages/create/index.ts`, `miniprogram/pages/create/index.wxml`, `miniprogram/pages/create/index.wxss`
- Test: `tests/draft-layout.test.ts`

- [ ] **Step 1: Extend the selector test to cover two owned Drafts**

Add `draft_b` for `wall_b` and assert both Draft IDs are returned while published layouts remain absent.

- [ ] **Step 2: Run the test**

Run: `npm test -- tests/draft-layout.test.ts`

Expected: PASS after updating the exact expected result.

- [ ] **Step 3: Load Drafts and routable Walls into separate collections**

In `onShow`, load `listMyWalls()` and `listWalls()`. Load Layouts of owned Walls, flatten them, call `draftLayoutsForWalls`, and map results to `wallId`, `layoutId`, `wallName`, `layoutName`, and visibility. Preserve the existing merged owned/public plus `isRoutableWall` logic for a separate `routableWalls` collection. Save `drafts`, `routableWalls`, and `loading`.

Add:

```ts
resumeDraft(e) {
  const { wallId, layoutId } = e.currentTarget.dataset
  wx.navigateTo({ url: `/pages/admin/layout-editor/index?wallId=${wallId}&layoutId=${layoutId}` })
}
```

- [ ] **Step 4: Replace Create WXML with three explicit sections**

Render, in order:

1. A purple `新建墙面` hero bound to `createWall`.
2. `继续创建` Draft rows bound to `resumeDraft`, with empty text `没有未发布的标注草稿`.
3. `设置线路` rows from `routableWalls` bound to `openWall`, with empty text `先发布一个至少包含两个岩点的 Layout，再开始设置线路`.

The hero says: `上传照片、设置可见范围，然后开始首次标注。` Draft rows say: `继续标注未发布的墙面与 Layout`. Do not use `activeLayoutId` to identify Drafts.

- [ ] **Step 5: Style the selected C direction**

Use a #6046d6 / #8368e8 hero, #f8f8fc page background, white #e5e5ef-bordered cards, 16–20rpx radius, 32rpx headings, 24rpx metadata, and 180rpx bottom padding. Avoid large pill controls.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- tests/draft-layout.test.ts tests/mock-routable-problem.test.ts && npm test && npm run build`

```bash
git add miniprogram/pages/create/index.ts miniprogram/pages/create/index.wxml miniprogram/pages/create/index.wxss tests/draft-layout.test.ts
git commit -m "feat: separate draft resumption from route creation"
```

### Task 4: Make My status-and-delete only

**Files:**
- Modify: `miniprogram/pages/me/index.ts`, `miniprogram/pages/me/index.wxml`, `miniprogram/pages/me/index.wxss`
- Test: `tests/mock-deletion.test.ts`

- [ ] **Step 1: Establish the deletion test baseline**

Run: `npm test -- tests/mock-deletion.test.ts`

Expected: PASS after Task 2. This guards My’s service calls before changing UI.

- [ ] **Step 2: Replace handlers**

Remove `create`, `open`, `mark`, and `newLayout`. Keep `reload()` to fetch owner Walls and Layouts. Add `confirmDeleteLayout` and `confirmDeleteWall`. Both call `wx.showModal` with `confirmText: '删除'` and `confirmColor: '#d95b43'`; call the relevant service only if confirmed; reload only after success; show `删除失败，请稍后重试` on failure.

Published Layout confirmation must say it deletes all associated routes. Wall confirmation must say it deletes all Layouts and routes.

- [ ] **Step 3: Replace markup and styles**

Show Wall name, visibility, Layout count, and each Layout’s exact status: `草稿，尚未发布` or `已发布并锁定`. Each Layout has an outlined `删除 Layout` action; each Wall ends with a subdued `删除墙面` action. Do not render mark, edit, route, or new-Layout controls. Destructive controls use thin muted-red borders/text on white and 44px-equivalent hit areas.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/mock-deletion.test.ts && npm test && npm run build`

```bash
git add miniprogram/pages/me/index.ts miniprogram/pages/me/index.wxml miniprogram/pages/me/index.wxss tests/mock-deletion.test.ts
git commit -m "feat: manage wall status and cascading deletion"
```

### Task 5: Apply the shared visual system and browse-first Lines tab

**Files:**
- Modify: `miniprogram/app.wxss`, `miniprogram/app.json`, `miniprogram/pages/walls/index.wxml`, `miniprogram/pages/walls/index.wxss`

- [ ] **Step 1: Establish a build baseline**

Run: `npm run build`

Expected: PASS before visual edits.

- [ ] **Step 2: Define global C-direction tokens**

```css
page { background: #f8f8fc; color: #202039; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
.page { min-height: 100vh; padding: 40rpx 32rpx 180rpx; }
.page-kicker { color: #6046d6; font-size: 21rpx; font-weight: 800; letter-spacing: 3rpx; }
.page-title { margin: 14rpx 0 12rpx; font-size: 58rpx; font-weight: 800; letter-spacing: -3rpx; line-height: 1.08; }
.page-lead { color: #6f7187; font-size: 26rpx; line-height: 1.6; }
```

Keep aliases for legacy `.title`, `.eyebrow`, `.muted`, and `.card` until untouched pages migrate. Set the TabBar to deep indigo, muted lavender inactive text, and white selected text.

- [ ] **Step 3: Make Lines wall-first**

Use title `找线路` and lead `先选择一面公开墙，再选择 Layout 和线路。`. Each existing Wall card shows name, Layout label, angle label, and a chevron, retaining only `openWall`. Do not add search/random controls before Wall and Layout selection.

- [ ] **Step 4: Apply compact card WXSS**

Use 16–20rpx radius, 1rpx #e5e5ef borders, restrained shadows, 32rpx headings, 23–24rpx metadata, and 24rpx spacing. Avoid full capsule buttons.

- [ ] **Step 5: Verify and commit**

Run: `npm run build && npm test`

```bash
git add miniprogram/app.wxss miniprogram/app.json miniprogram/pages/walls/index.wxml miniprogram/pages/walls/index.wxss
git commit -m "feat: refresh browse tab visual system"
```

### Task 6: Update manual checks and perform release verification

**Files:**
- Modify: `docs/manual-test.md`, `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Replace stale manual checks**

Document that Drafts appear only in “创建 → 我的草稿”; published Layouts disappear from Drafts and lock; only published active Layouts with two Holds can set routes; My offers status/delete only; Published Layout deletion removes its routes; Wall deletion removes all descendants; 375px layout has no horizontal overflow or TabBar overlap.

- [ ] **Step 2: Update implementation status**

Record Create Draft resumption, My status/delete-only behavior, server-side cascades, and write-time route eligibility. Do not mark CloudBase deployment or device testing complete.

- [ ] **Step 3: Run complete verification**

```bash
npm test
npm run build
npm run verify:phase1 -- --release
git status --short
```

Expected: all checks pass and no tracked modifications remain.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/manual-test.md docs/IMPLEMENTATION_PLAN.md
git commit -m "docs: record draft and deletion workflows"
```

## Coverage review

- C-direction visual hierarchy and spacing: Tasks 3–5.
- Wall-first Lines flow: Task 5.
- New wall, Draft resumption, and eligible route setup: Tasks 1 and 3.
- Status/delete-only My: Task 4.
- Published lock, write protection, ownership, and cascades: Tasks 1–2.
- Mock/CloudBase parity and acceptance checks: Tasks 1, 2, and 6.
