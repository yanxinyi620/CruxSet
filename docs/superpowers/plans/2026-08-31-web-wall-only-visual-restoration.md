# Web Wall-Only Visual Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the pre-migration Web workspace visual hierarchy and full annotation tooling while keeping every view and request Wall-only.

**Architecture:** Reuse the pre-Wall-only `d610b2a` page shells, CSS class vocabulary and editor controls as the visual reference, but rebuild their state bindings around `Wall`, `Problem.wallId`, `PreviewSession` and `ApiSession`. Candidate holds and ROI remain transient editor state; only confirmed holds are persisted to a private Wall.

**Tech Stack:** TypeScript, Vite, Vitest, DOM Canvas, FastAPI local API.

---

## File map

- Web page composition: `web/src/main.ts`
- Wall-only editor state: `web/src/wall-hold-editor.ts`, `web/src/ui-behavior.ts`
- Candidate/ROI behavior: `web/src/candidate-editor.ts`, `web/src/auto-detect.ts`, `web/src/draft-canvas.ts`
- Shared visual styling: `web/src/styles/{device,editor,base}.css`
- Regression tests: `tests/web-visual-restoration.test.ts`, `tests/web-interaction-safety.test.ts`, `tests/dev-preview-*.test.ts`

### Task 1: Restore the application shell and Wall-only browse/manage cards

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/device.css`
- Test: `tests/web-visual-restoration.test.ts`

- [ ] **Step 1: Write failing visual-shell assertions**

```ts
it('renders the original login shell and Wall-only hubs', async () => {
  expect(loginShell()).toContain('本地创作工作台')
  expect(renderedCreate).toContain('hero-card')
  expect(renderedMe).toContain('hub-card')
  expect(renderedBrowse).toContain('wall-card')
  expect(source).not.toMatch(/layoutId|activeLayoutId|data-layout/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/web-visual-restoration.test.ts`

Expected: FAIL because the simplified shell lacks the legacy visual classes and explanatory content.

- [ ] **Step 3: Restore page shells using Wall data**

Restore the branded login shell, `lead`, `hero-card`, `action-card`, `hub-card`, `wall-card`, `mine-card` and problem-group markup from `d610b2a`. Bind every image, hold count and visibility label to the one Wall object. Browse opens `/wall/:wallId`; drafts list `wall.visibility === 'private'`; management cards list owned Walls and Problems grouped by `problem.wallId`.

- [ ] **Step 4: Preserve protected deletion and escaping**

Keep `confirmAndDelete`, escaped dynamic text, `WALL_IN_USE` feedback and accessible back buttons in restored cards.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- tests/web-visual-restoration.test.ts tests/web-interaction-safety.test.ts tests/dev-preview-routable.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/main.ts web/src/styles/device.css tests/web-visual-restoration.test.ts tests/web-interaction-safety.test.ts
git commit -m "feat: restore wall-only web workspace shell"
```

### Task 2: Restore the full Wall annotation workspace

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/editor.css`
- Modify: `web/src/wall-hold-editor.ts`
- Test: `tests/web-visual-restoration.test.ts`

- [ ] **Step 1: Write failing Wall editor tests**

```ts
it('shows ROI, detection and candidate controls for a private Wall', () => {
  const html = renderWallEditor(privateWall)
  expect(html).toContain('自动识别')
  expect(html).toContain('确认全部')
  expect(html).toContain('识别区域')
})

it('does not show editable annotation controls for a published Wall', () => {
  expect(renderWallEditor(publicWall)).toContain('disabled')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/web-visual-restoration.test.ts`

Expected: FAIL because the current Wall editor has no candidate or ROI UI.

- [ ] **Step 3: Reintroduce candidate and ROI state around WallHoldEditor**

Use this state shape:

```ts
type WallEditorContext = {
  wall: Wall; editor: WallHoldEditor; candidates: Hold[]
  selectedCandidateId: string | null; roi: Roi; detecting: boolean
  mode: DraftMode; selectedId: string | null; kind: 'hold' | 'volume'
  dirty: boolean; published: boolean; toast?: string
}
```

Render the restored draft toolbar, candidate list and ROI controls. Candidate confirm/delete/type actions must use `confirmCandidate`, `confirmCandidates`, `removeCandidate`, `changeCandidateKind` and `holdsForPersistence`. Persist only `editor.value()` via `updateWallHolds` or `publishWall`.

- [ ] **Step 4: Restore automatic detection with Wall image metadata**

Load `wall.imageFileId`, call `autoDetectHolds(image, { roi })`, and apply results through `createAutoDetectController`. Keep the confirmation prompt when replacing existing candidates and show success/failure toast text.

- [ ] **Step 5: Bind the restored DraftCanvas callbacks**

Pass confirmed holds and candidates into `DraftCanvasView`; bind move/select/confirm/delete callbacks so candidate interactions update the restored controls and WallHoldEditor state. Public Walls remain fully disabled.

- [ ] **Step 6: Run focused verification**

Run: `npm test -- tests/web-visual-restoration.test.ts tests/candidate-editor.test.ts tests/auto-detect.test.ts tests/web-interaction-safety.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/main.ts web/src/styles/editor.css web/src/wall-hold-editor.ts tests/web-visual-restoration.test.ts
git commit -m "feat: restore wall annotation workspace"
```

### Task 3: Restore full route and problem-editor presentation

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/editor.css`
- Test: `tests/web-visual-restoration.test.ts`
- Test: `tests/create-drafts-flow.test.ts`

- [ ] **Step 1: Write failing editor/detail presentation tests**

```ts
it('uses the restored field, chip, role toolbar and legend layout on a Wall', () => {
  const html = renderProblemEditor(publicWall)
  expect(html).toContain('class="field"')
  expect(html).toContain('class="chip"')
  expect(html).toContain('class="role-btn"')
  expect(html).toContain('class="legend"')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/web-visual-restoration.test.ts tests/create-drafts-flow.test.ts`

Expected: FAIL because the current simplified problem editor omits the full field layout.

- [ ] **Step 3: Restore Wall-only problem editor/detail shells**

Use the former editor layout with angle, grade, foot-rule fields, role legend, canvas and named fields. Replace all old Layout reads with the selected `Wall`; submit `createProblem(wall.id, draft)`. Detail loads one `Problem` and `getWall(problem.wallId)`.

- [ ] **Step 4: Keep current safety behavior**

Retain duplicate-save blocking, redraw after undo/clear, escaped values, error toasts and navigation cleanup.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- tests/web-visual-restoration.test.ts tests/create-drafts-flow.test.ts tests/web-interaction-safety.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/main.ts web/src/styles/editor.css tests/web-visual-restoration.test.ts tests/create-drafts-flow.test.ts
git commit -m "feat: restore wall route editor presentation"
```

### Task 4: Full verification and visual acceptance

**Files:**
- Modify only if a verification failure exposes a Wall-only regression

- [ ] **Step 1: Scan for forbidden model leakage**

Run: `rg -n "layoutId|activeLayoutId|data-layout|/layouts" web/src tests/web-visual-restoration.test.ts`

Expected: no active product match; historical references are not copied into Web source.

- [ ] **Step 2: Run automated verification**

Run: `npm test && npm run build && npm run web:build`

Expected: all commands exit 0.

- [ ] **Step 3: Run local visual acceptance**

Open `http://localhost:5173`, log in, and verify the restored login shell, public Wall card, private Wall editor candidate/ROI controls, publish lock, restored route editor and protected Wall deletion.

- [ ] **Step 4: Inspect final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the intended Web visual-restoration files changed.

- [ ] **Step 5: Commit any correction**

```bash
git commit -m "fix: complete wall-only visual restoration"
```
