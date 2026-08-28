# 候选标注交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将自动识别结果改为不覆盖手工标注的候选层，并支持候选逐个/批量确认、删除和类型修正。

**Architecture:** 新增纯函数候选状态模块，隔离候选与 `LayoutEditor` 的 confirmed holds；画布通过独立候选回调处理渲染和命中，`main.ts` 只负责状态编排与持久化边界。保存和发布继续只提交 `LayoutEditor.value()`。

**Tech Stack:** TypeScript、Canvas 2D、Vitest、Vite。

---

### Task 1: 建立候选状态转换模块

**Files:**
- Create: `web/src/candidate-editor.ts`
- Create: `tests/candidate-editor.test.ts`

- [ ] **Step 1: Write failing tests** for preserving confirmed holds, replacing candidates, confirming one/all, deleting, clearing, changing kind, and collision-free IDs.

```ts
it('confirms candidates without changing existing holds or reusing ids', () => {
  const confirmed = [hold('H001')]
  const candidates = [hold('H001'), hold('H009', 'volume')]
  const result = confirmCandidates(confirmed, candidates)
  expect(result.candidates).toEqual([])
  expect(result.confirmed.map(item => item.id)).toEqual(['H001', 'H002'])
  expect(result.confirmed[1].kind).toBe('volume')
})
```

- [ ] **Step 2: Run the focused test and verify it fails** because the candidate module does not exist.

Run: `npm test -- --run tests/candidate-editor.test.ts`

- [ ] **Step 3: Implement pure candidate operations** with immutable outputs: `replaceCandidates`, `confirmCandidate`, `confirmCandidates`, `removeCandidate`, `clearCandidates`, and `changeCandidateKind`. Generate the next `H###` ID from all confirmed and candidate IDs, preserving candidate geometry.

- [ ] **Step 4: Run focused and full tests.**

Run: `npm test -- --run tests/candidate-editor.test.ts`

Run: `npm test`

- [ ] **Step 5: Commit.**

```bash
git add web/src/candidate-editor.ts tests/candidate-editor.test.ts
git commit -m "feat: add candidate annotation state operations"
```

### Task 2: Extend draft canvas for candidate rendering and hit testing

**Files:**
- Modify: `web/src/draft-canvas.ts`
- Test: `tests/candidate-editor.test.ts`

- [ ] **Step 1: Write failing tests** for candidate state being rendered separately and candidate hit callbacks not mutating confirmed holds.

```ts
it('keeps candidate actions separate from confirmed holds', () => {
  const state = applyCandidateAction({ confirmed: [hold('H001')], candidates: [hold('H002')] }, { type: 'remove', id: 'H002' })
  expect(state.confirmed).toHaveLength(1)
  expect(state.candidates).toEqual([])
})
```

- [ ] **Step 2: Run the focused test and verify it fails.**

- [ ] **Step 3: Add candidate canvas options**: `candidates`, `selectedCandidateId`, `onSelectCandidate`, `onConfirmCandidate`, and `onDeleteCandidate`; draw candidates with dashed amber outlines and a translucent fill after confirmed holds; hit-test candidates before confirmed holds when they overlap.

- [ ] **Step 4: Update `setState`** to accept confirmed and candidate state without breaking existing callers, then run all tests and type checks.

Run: `npm test`

Run: `npm run build`

- [ ] **Step 5: Commit.**

```bash
git add web/src/draft-canvas.ts tests/candidate-editor.test.ts
git commit -m "feat: render draft detection candidates"
```

### Task 3: Integrate candidate workflow into the draft editor

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/editor.css`
- Test: `tests/candidate-editor.test.ts`

- [ ] **Step 1: Write failing tests** for automatic detection replacing only candidates, save/publish payload excluding candidates, and candidate actions updating the editor.

```ts
it('builds persistence payload from confirmed holds only', () => {
  expect(holdsForPersistence([hold('H001')], [hold('H002')])).toEqual([hold('H001')])
})
```

- [ ] **Step 2: Run the focused test and verify it fails.**

- [ ] **Step 3: Add candidate state to `DraftCtx`** and wire automatic detection to call `replaceCandidates` only. Add candidate count, `确认全部`, `清空候选`, selected-candidate actions, type toggles, and per-candidate confirm/delete controls. Keep candidate ROI and lifecycle protections from phase one.

- [ ] **Step 4: Ensure save/publish reads only confirmed editor state** and candidate actions update canvas/UI without writing candidates to API payloads. Keep failed/empty detection candidates unchanged as specified.

- [ ] **Step 5: Run tests and builds.**

Run: `npm test`

Run: `npm run build`

Run: `npm run web:build`

- [ ] **Step 6: Commit.**

```bash
git add web/src/main.ts web/src/styles/editor.css tests/candidate-editor.test.ts
git commit -m "feat: integrate candidate confirmation workflow"
```

### Task 4: Add interaction regression coverage and final verification

**Files:**
- Modify: `tests/candidate-editor.test.ts`
- Modify: `tests/create-drafts-flow.test.ts`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Add regression tests** for overlapping candidates, repeated detection replacing candidates only, cancel/failed detection preserving candidates, and confirmed-only persistence.

- [ ] **Step 2: Update manual test documentation** with candidate workflow: run detection, review candidate count, confirm selected/all, remove false positives, change hold/volume kind, save, reload, and verify unconfirmed candidates are absent.

- [ ] **Step 3: Run final verification.**

Run: `npm test`

Run: `npm run build`

Run: `npm run web:build`

Run: `npm run verify:phase1`

Run: `git diff --check`

- [ ] **Step 4: Commit.**

```bash
git add tests/candidate-editor.test.ts tests/create-drafts-flow.test.ts docs/manual-test.md
git commit -m "test: cover candidate annotation workflow"
```
