# Test Baseline Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align four stale test assertions with the approved route-number and Web UI behavior, without changing product code.

**Architecture:** The production behavior is already implemented. Update only the affected Vitest files to assert durable outcomes: per-wall route numbering, visible login/editor structure, and the generic Create-tab panel transition. Re-run the suite after deterministic failures are resolved to establish whether `ENODATA` is reproducible.

**Tech Stack:** TypeScript, Vitest, Vite.

---

### Task 1: Assert per-wall route numbering

**Files:**
- Modify: `tests/problem-service.test.ts:10-16`
- Test: `tests/problem-service.test.ts`

- [ ] **Step 1: Replace the retired global-counter assertion with two saves on the same wall**

```ts
it('numbers routes by wall number and sequence within that wall', async () => {
  const service = new MemoryProblemService({ nextNumber: 7 })
  const draft = { wallId: demoWall.id, angle: 35, grade: 'V4' as const, holds: { start: ['H001'], finish: ['H002'] }, createdBy: 'usr_demo' }
  const first = await service.save({ wall: demoWall, draft })
  const second = await service.save({ wall: demoWall, draft })

  expect(first.number).toBe('CS-010001')
  expect(second.number).toBe('CS-010002')
  expect(first.id).not.toBe(first.number)
  expect((await service.list())[0].createdBy).toBe('usr_demo')
})
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/problem-service.test.ts`

Expected: both tests pass; no database file or running service is used.

### Task 2: Replace stale visual source assertions with current durable markers

**Files:**
- Modify: `tests/web-visual-restoration.test.ts:23-36`
- Test: `tests/web-visual-restoration.test.ts`

- [ ] **Step 1: Update the login test to assert its current title composition and actions**

Replace the body of `keeps the login screen focused on sign in and registration choices` with:

```ts
expect(source).toContain('<h1>CRUXSET <span>创作工作台</span></h1>')
expect(source).toContain('data-login')
expect(source).toContain('data-register')
expect(source).not.toContain('<small>CRUXSET</small><h1>本地创作工作台</h1>')
```

- [ ] **Step 2: Update the route-editor test to assert stable controls rather than the removed chip class**

Replace the body of `contains the restored problem editor presentation` with:

```ts
expect(source).toContain('class="field"')
expect(source).toContain('class="role-toolbar"')
expect(source).toMatch(/class="role-btn\s/)
expect(source).toContain('class="legend"')
expect(source).toContain('data-choice-open="angle"')
```

- [ ] **Step 3: Run the focused test**

Run: `npm test -- tests/web-visual-restoration.test.ts`

Expected: all four assertions pass.

### Task 3: Assert the generic Create-tab panel transition

**Files:**
- Modify: `tests/wall-management-routes.test.ts:50-55`
- Test: `tests/wall-management-routes.test.ts`

- [ ] **Step 1: Replace the retired direct assignment assertion**

Keep the existing `data-panel="new-route"` and `panel === "new-route"` expectations. Replace:

```ts
expect(source).toContain('panel = "new-route"')
```

with:

```ts
expect(source).toContain('panel = b.dataset.panel as typeof panel')
expect(source).toContain('syncUiUrl()')
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/wall-management-routes.test.ts`

Expected: all route and interaction assertions pass.

### Task 4: Verify the full baseline and investigate the runner error

**Files:**
- Modify: none
- Test: all Vitest files, TypeScript checks, Vite build

- [ ] **Step 1: Run the full test suite once after deterministic fixes**

Run: `npm test`

Expected: 40 test files and 173 tests pass without failures. Record whether Vitest reports `ENODATA`.

- [ ] **Step 2: Repeat the full test suite if `ENODATA` appears**

Run: `npm test`

Expected: if the error does not recur, report it as non-reproducible and do not alter source or test configuration. If it recurs, stop before changing code and inspect the exact failing module and Vitest environment.

- [ ] **Step 3: Run the build validations**

Run: `npm run build && npm run web:build`

Expected: TypeScript checks pass and Vite emits `web/dist`.

- [ ] **Step 4: Commit the completed baseline alignment**

```bash
git add tests/problem-service.test.ts tests/web-visual-restoration.test.ts tests/wall-management-routes.test.ts
git commit -m "test: align baseline with current web behavior"
```
