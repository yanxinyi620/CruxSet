# 自动识别基础修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Web 自动识别支持矩形 ROI、较高分析分辨率、像素级最小组件过滤和正确的宽高归一化，并用真实墙图回归测试验证基础行为。

**Architecture:** 保持 `autoDetectHolds(image, options)` 作为 DOM 入口，在纯函数 `detectFromPixels` 前增加 ROI 裁剪和结果坐标映射。编辑器只保存当前会话的 ROI，通过独立的小型裁剪控件设置，不把识别参数写入 Layout。

**Tech Stack:** TypeScript、Canvas 2D、Vitest、Vite。

---

### Task 1: 扩展识别器的 ROI 和像素阈值接口

**Files:**
- Modify: `web/src/auto-detect.ts`
- Test: `tests/auto-detect.test.ts`

- [ ] **Step 1: Write failing tests** for a rectangular ROI mapping, non-square component radius normalization, and a component retained by pixel threshold despite a small area ratio.

```ts
it('maps detections from an ROI back to full-image coordinates', () => {
  const data = makeImage(100, 100, [circle(60, 50, 6, [220, 60, 60])])
  const [hold] = detectFromPixels(50, 50, cropPixels(data, 100, 100, 50, 25, 50, 50), {
    roi: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
    minComponentPixels: 10,
  })
  expect(hold.x).toBeCloseTo(0.6, 1)
  expect(hold.y).toBeCloseTo(0.5, 1)
})

it('uses equivalent width and height for normalized radius', () => {
  const data = makeImage(200, 100, [rectangle(100, 50, 20, 10, [220, 60, 60])])
  const [hold] = detectFromPixels(200, 100, data, { minComponentPixels: 20 })
  expect(hold.radius).toBeCloseTo(0.1, 1)
})
```

- [ ] **Step 2: Run the focused test and verify it fails** because `roi`, `minComponentPixels`, and the new mapping behavior do not exist.

Run: `npm test -- --run tests/auto-detect.test.ts`

- [ ] **Step 3: Implement the minimal interface and mapping**: add `Roi`, `roi`, `minComponentPixels`, `minSidePixels`, `dropBoundaryComponents`, and `morphology` options; crop the analysis canvas to the ROI; use ROI area for ratios; map center, bbox, polygon, and radius back to full-image normalized coordinates.

- [ ] **Step 4: Run focused tests** and confirm all auto-detection tests pass.

Run: `npm test -- --run tests/auto-detect.test.ts`

- [ ] **Step 5: Commit** the pure detection changes.

```bash
git add web/src/auto-detect.ts tests/auto-detect.test.ts
git commit -m "feat: improve auto detection geometry and filtering"
```

### Task 2: Improve default analysis behavior and boundary handling

**Files:**
- Modify: `web/src/auto-detect.ts`
- Test: `tests/auto-detect.test.ts`

- [ ] **Step 1: Write failing tests** covering the higher default analysis size, small components retained through `minComponentPixels`, and optional rejection of ROI-edge components.

```ts
it('does not reject a valid small component only because of full-image area ratio', () => {
  const data = makeImage(200, 200, [circle(100, 100, 4, [220, 60, 60])])
  expect(detectFromPixels(200, 200, data, { minAreaRatio: 0, minComponentPixels: 20 })).toHaveLength(1)
})

it('can drop components touching the ROI boundary', () => {
  const data = makeImage(100, 100, [rectangle(0, 40, 8, 8, [220, 60, 60])])
  expect(detectFromPixels(100, 100, data, { minAreaRatio: 0, minComponentPixels: 10, dropBoundaryComponents: true })).toEqual([])
})
```

- [ ] **Step 2: Run focused tests and verify the new tests fail.**

Run: `npm test -- --run tests/auto-detect.test.ts`

- [ ] **Step 3: Implement defaults** with `maxDim: 1280`, pixel-based minimum filtering, conservative morphology defaults, and boundary-component rejection when enabled. Keep color thresholds and volume threshold configurable.

- [ ] **Step 4: Run focused tests and then the full test suite.**

Run: `npm test -- --run tests/auto-detect.test.ts`

Run: `npm test`

- [ ] **Step 5: Commit** the detection defaults and boundary behavior.

```bash
git add web/src/auto-detect.ts tests/auto-detect.test.ts
git commit -m "feat: make auto detection resolution aware"
```

### Task 3: Add session-only ROI editing to the draft editor

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/editor.css`
- Test: `tests/auto-detect.test.ts`

- [ ] **Step 1: Write a failing pure-state test** for clamping and resetting a draft-session ROI, keeping ROI outside persisted Layout data.

```ts
it('normalizes and resets a draft detection ROI', () => {
  expect(normalizeRoi({ x: -0.2, y: 0.1, width: 1.4, height: 0.8 })).toEqual({ x: 0, y: 0.1, width: 1, height: 0.8 })
  expect(resetRoi()).toEqual({ x: 0, y: 0, width: 1, height: 1 })
})
```

- [ ] **Step 2: Run the focused test and verify it fails** because the session ROI helpers and UI do not exist.

- [ ] **Step 3: Implement a small ROI control** with numeric percentages and reset action. Store the normalized ROI only in `DraftCtx`; pass it to `autoDetectHolds`; show a processing state and disable repeated clicks; keep existing holds when detection returns no results or fails.

- [ ] **Step 4: Run all tests and build.**

Run: `npm test`

Run: `npm run build`

- [ ] **Step 5: Commit** the draft editor ROI flow.

```bash
git add web/src/main.ts web/src/styles/editor.css tests/auto-detect.test.ts
git commit -m "feat: add draft detection region controls"
```

### Task 4: Add a real-wall-image regression fixture and final verification

**Files:**
- Create: `tests/fixtures/ritan-spraywall-0822.jpg`
- Modify: `tests/auto-detect.test.ts`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Add the existing repository wall image as a test fixture** without modifying the source asset.

- [ ] **Step 2: Write the regression test** that loads the fixture through the test environment’s image decoder or a checked-in pixel fixture, invokes the detector with an explicit wall ROI, and asserts valid normalized coordinates, non-empty detections, and no result outside the ROI.

- [ ] **Step 3: Run the regression test and verify it passes** with the implemented ROI and filtering behavior.

Run: `npm test -- --run tests/auto-detect.test.ts`

- [ ] **Step 4: Update manual test documentation** with the expected workflow: upload wall image, open draft, set wall ROI, run detection, inspect counts, and manually correct results.

- [ ] **Step 5: Run final verification.**

Run: `npm test`

Run: `npm run build`

Run: `npm run web:build`

- [ ] **Step 6: Commit** the fixture, regression coverage, and manual verification notes.

```bash
git add tests/fixtures/ritan-spraywall-0822.jpg tests/auto-detect.test.ts docs/manual-test.md
git commit -m "test: add real wall auto detection regression"
```
