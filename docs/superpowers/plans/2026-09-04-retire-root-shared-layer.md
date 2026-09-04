# Retire Root Shared Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused root `src/` shared layer while retaining tests for the implementations that actually run in the mini program and Web workbench.

**Architecture:** Mini-program interaction and route-domain tests will directly import `wechat/miniprogram/domain/`. Web tests remain responsible for `web/src/`. Legacy root-only repositories, ID generation, demo fixtures, API contracts, and user helpers will be removed with their tests because no runtime owner exists.

**Tech Stack:** TypeScript, Vitest, WeChat Mini Program TypeScript compiler, Vite.

---

### Task 1: Retarget mini-program domain tests

**Files:**
- Modify: `tests/geometry.test.ts`
- Modify: `tests/polygon-bbox.test.ts`
- Modify: `tests/gesture.test.ts`
- Modify: `tests/transform.test.ts`
- Modify: `tests/editor.test.ts`
- Modify: `tests/routes.test.ts`
- Modify: `tests/routable-wall.test.ts`
- Modify: `tests/wall-lifecycle.test.ts`

- [ ] **Step 1: Replace root-domain imports with mini-program imports.**

```ts
import { circleHitTest, nearestHold, pointInPolygon } from '../wechat/miniprogram/domain/geometry.js'
import { GestureController } from '../wechat/miniprogram/domain/gesture.js'
import { clampTransform, imageToScreen, screenToImage, zoomAroundAnchor } from '../wechat/miniprogram/domain/transform.js'
import ProblemEditor from '../wechat/miniprogram/domain/editor.js'
import { createProblem, filterProblems, searchProblems } from '../wechat/miniprogram/domain/routes.js'
import { isRoutableWall } from '../wechat/miniprogram/domain/routable-wall.js'
import type { Wall } from '../wechat/miniprogram/domain/types.js'
```

- [ ] **Step 2: Keep existing assertions unchanged.**

The tests continue to cover hit-testing, transform boundaries, gestures, editor undo/restore, route validation, and routable walls. The only required editor change is using its default import.

- [ ] **Step 3: Run the migrated test group.**

Run: `npx vitest run tests/geometry.test.ts tests/polygon-bbox.test.ts tests/gesture.test.ts tests/transform.test.ts tests/editor.test.ts tests/routes.test.ts tests/routable-wall.test.ts tests/wall-lifecycle.test.ts`

Expected: 8 test files pass.

- [ ] **Step 4: Commit.**

```bash
git add tests/geometry.test.ts tests/polygon-bbox.test.ts tests/gesture.test.ts tests/transform.test.ts tests/editor.test.ts tests/routes.test.ts tests/routable-wall.test.ts tests/wall-lifecycle.test.ts
git commit -m "test: cover mini program domain implementations"
```

### Task 2: Retarget browse and random behavior

**Files:**
- Modify: `tests/browse.test.ts`
- Modify: `tests/random.test.ts`
- Delete: `tests/shared-domain-imports.test.ts`

- [ ] **Step 1: Import the mini-program browse implementation and types.**

```ts
import { browseProblems } from '../wechat/miniprogram/domain/browse.js'
import type { Problem } from '../wechat/miniprogram/domain/types.js'
```

Remove the `adjacentProblem` assertion because the mini-program browse module does not own adjacent navigation; its detail page handles that after fetching a filtered list.

- [ ] **Step 2: Import the mini-program random implementation.**

```ts
import { RandomSession } from '../wechat/miniprogram/domain/random.js'
```

Keep the existing no-duplicate-per-cycle assertions.

- [ ] **Step 3: Delete `tests/shared-domain-imports.test.ts`.**

It compares the mini-program against the implementation being retired and would preserve the removed dependency.

- [ ] **Step 4: Run changed tests.**

Run: `npx vitest run tests/browse.test.ts tests/random.test.ts`

Expected: both files pass.

- [ ] **Step 5: Commit.**

```bash
git add tests/browse.test.ts tests/random.test.ts tests/shared-domain-imports.test.ts
git commit -m "test: remove root shared layer comparisons"
```

### Task 3: Remove root-only test coverage

**Files:**
- Delete: `tests/fixtures.test.ts`
- Delete: `tests/ids.test.ts`
- Delete: `tests/memory-repository.test.ts`
- Delete: `tests/problem-service.test.ts`
- Delete: `tests/users.test.ts`

- [ ] **Step 1: Delete the listed tests.**

They cover only the retired demo image fixture, ID generation, memory repository, memory route-number service, and user helper. Production CloudBase and FastAPI paths have separate ownership and test boundaries.

- [ ] **Step 2: Verify no test imports root `src/`.**

Run: `rg -n "['\"](?:\.\./)+src/|from ['\"][^'\"]*src/" tests web wechat`

Expected: no output.

- [ ] **Step 3: Commit.**

```bash
git add tests/fixtures.test.ts tests/ids.test.ts tests/memory-repository.test.ts tests/problem-service.test.ts tests/users.test.ts
git commit -m "test: remove retired shared layer coverage"
```

### Task 4: Remove the root shared implementation

**Files:**
- Delete: `src/contracts/api.ts`
- Delete: `src/data/demo-problems.ts`
- Delete: `src/data/demo.ts`
- Delete: `src/domain/*.ts`
- Delete: `src/repository/*.ts`
- Delete: `src/index.ts`

- [ ] **Step 1: Confirm no remaining code imports.**

Run: `rg -n "['\"](?:\.\./)+src/|from ['\"][^'\"]*src/" --glob '*.{ts,tsx,js,mjs}' --glob '!node_modules/**' --glob '!docs/**' .`

Expected: no output.

- [ ] **Step 2: Delete only the root `src/` files.**

Do not remove `web/src/` or `wechat/miniprogram/`.

- [ ] **Step 3: Run complete verification.**

Run: `npm test && npm run build && npm run web:build`

Expected: Vitest, both TypeScript checks, and Vite build pass.

- [ ] **Step 4: Verify repository boundary and commit.**

Run: `test ! -d src && git status --short`

```bash
git add -A src tests
git commit -m "refactor: remove retired root shared layer"
```
