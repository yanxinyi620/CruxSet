# 可设置线路墙面资格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从“创建 → 新建线路”排除没有可用已发布 Layout 的草稿墙面。

**Architecture:** 用一个纯领域函数将 Wall 与其当前 Layout 映射为“可设置线路”资格；创建页负责加载当前 Layout 后调用该函数。服务端与 Mock Repository 不改变数据模型或权限。

**Tech Stack:** TypeScript、微信小程序原生页面、Vitest。

---

### Task 1: Model routable Wall eligibility

**Files:**
- Create: `src/domain/routable-wall.ts`
- Create: `tests/routable-wall.test.ts`

- [ ] **Step 1: Write failing eligibility tests**

```ts
import { expect, it } from 'vitest'
import { isRoutableWall } from '../src/domain/routable-wall.js'

const wall = { id: 'w', activeLayoutId: 'l' } as any
const usable = { id: 'l', published: true, holds: [{ id: 'H001' }, { id: 'H002' }] } as any

it('requires the active published layout to have two holds', () => {
  expect(isRoutableWall(wall, usable)).toBe(true)
  expect(isRoutableWall({ ...wall, activeLayoutId: '' }, usable)).toBe(false)
  expect(isRoutableWall(wall, { ...usable, published: false })).toBe(false)
  expect(isRoutableWall(wall, { ...usable, holds: [{ id: 'H001' }] })).toBe(false)
  expect(isRoutableWall(wall, { ...usable, id: 'another' })).toBe(false)
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- tests/routable-wall.test.ts`

Expected: FAIL because `routable-wall.js` does not exist.

- [ ] **Step 3: Implement the pure predicate**

```ts
import type { Layout, Wall } from './types.js'
export const isRoutableWall = (wall: Wall, layout?: Layout) =>
  Boolean(wall.activeLayoutId && layout && layout.id === wall.activeLayoutId && layout.published && layout.holds.length >= 2)
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/routable-wall.test.ts && npm test && npm run build`

Expected: all tests pass.

```bash
git add src/domain/routable-wall.ts tests/routable-wall.test.ts
git commit -m "feat: define routable wall eligibility"
```

### Task 2: Filter the Create page and clarify the empty state

**Files:**
- Modify: `miniprogram/pages/create/index.ts`
- Modify: `miniprogram/pages/create/index.wxml`

- [ ] **Step 1: Add the failing selection scenario to the domain test**

Add an assertion that a private draft Wall with an empty active Layout does not pass `isRoutableWall`, while the public sample Wall does.

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- tests/routable-wall.test.ts`

Expected: FAIL until the predicate covers the actual seed shapes.

- [ ] **Step 3: Load and filter current Layouts**

In `onShow`, after merging owned and public Walls, run `getLayout(wall.activeLayoutId)` only for Walls with a non-empty active ID. Keep a Wall only when `isRoutableWall(wall, layout)` is true. Resolve failed Layout reads as `undefined` and exclude those Walls. Keep the existing Wall de-duplication before querying Layouts.

Change the empty message to:

```text
先发布一个已标注 Layout，再开始设置线路
```

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/routable-wall.test.ts && npm test && npm run build`

Expected: all tests pass and the mini program compiles.

```bash
git add miniprogram/pages/create/index.ts miniprogram/pages/create/index.wxml tests/routable-wall.test.ts
git commit -m "fix: hide draft walls from route creation"
```

### Task 3: Record the rule and complete checks

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Add manual verification**

Add checks that the local 日坛草稿 does not appear in “新建线路”, while the public example Wall does; after marking and publishing a private Wall with at least two Holds, it appears as an eligible Wall.

- [ ] **Step 2: Update implementation status**

Record the published-Layout / two-Hold qualification rule in the Phase 1 browsing or creation status.

- [ ] **Step 3: Final verification and commit**

Run: `npm test && npm run build && npm run verify:phase1 -- --release && git status --short`

Expected: all checks pass and worktree is clean after commits.

```bash
git add docs/IMPLEMENTATION_PLAN.md docs/manual-test.md
git commit -m "docs: record route eligibility checks"
```

