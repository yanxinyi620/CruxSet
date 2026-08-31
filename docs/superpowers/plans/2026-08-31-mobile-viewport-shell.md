# Mobile Viewport Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Web route fill the mobile browser viewport edge-to-edge while preserving the desktop preview frame.

**Architecture:** The shared `.device` shell owns viewport sizing, so one mobile rule applies to every route rendered by `web/src/main.ts`. The root document fills the browser canvas, while safe-area spacing remains on inner header and navigation content.

**Tech Stack:** TypeScript, Vite, Vitest, CSS.

---

### Task 1: Lock the mobile shell contract with a regression test

**Files:**
- Modify: `tests/dev-preview-responsive-shell.test.ts`
- Test: `tests/dev-preview-responsive-shell.test.ts`

- [ ] **Step 1: Add a failing test for edge-to-edge mobile sizing**

```ts
it('uses an edge-to-edge mobile viewport shell without legacy device dimensions', () => {
  const css = readFileSync('web/src/styles/responsive.css', 'utf8')
  const legacyDeviceCss = readFileSync('web/src/styles/device.css', 'utf8')
  expect(css).toMatch(/\.device \{\n  width: 100vw;\n  height: 100dvh;\n  margin: 0;/)
  expect(legacyDeviceCss).not.toMatch(/width: min\(390px, 100vw\);|height: 844px;/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/dev-preview-responsive-shell.test.ts`

Expected: FAIL because the shell uses `width: 100%` and `device.css` still declares fixed `390px` and `844px` dimensions.

- [ ] **Step 3: Implement the minimal shared-shell CSS update**

In `web/src/styles/responsive.css`, change the mobile `.device` width declaration from `100%` to `100vw`; keep `height: 100dvh`, zero margin, zero border radius, and no shadow. In `web/src/styles/device.css`, delete the legacy `.device` block that declares `width: min(390px, 100vw)` and `height: 844px`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/dev-preview-responsive-shell.test.ts`

Expected: PASS with 3 tests passing.

- [ ] **Step 5: Commit the implementation**

```bash
git add web/src/styles/responsive.css web/src/styles/device.css tests/dev-preview-responsive-shell.test.ts
git commit -m "fix: fill mobile browser viewport"
```

### Task 2: Validate the Web application

**Files:**
- Verify: `web/src/styles/base.css`
- Verify: `web/src/styles/responsive.css`
- Verify: `web/src/styles/device.css`

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`

Expected: PASS with zero failures.

- [ ] **Step 2: Type-check all project code**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Build the production Web bundle**

Run: `npm run web:build`

Expected: Vite completes with exit code 0 and writes `web/dist`.

- [ ] **Step 4: Review the diff against the design**

Run: `git diff HEAD~1 -- web/src/styles/responsive.css web/src/styles/device.css tests/dev-preview-responsive-shell.test.ts`

Expected: mobile sizing is shared by `.device`, no fixed `390px` or `844px` mobile shell values remain, and desktop breakpoint rules remain present.
