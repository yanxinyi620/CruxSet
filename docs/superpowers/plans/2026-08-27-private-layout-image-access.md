# Private Layout Image Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep CloudBase storage private while allowing the mini program to render published Layout images through controlled temporary URLs.

**Architecture:** `getLayoutImageUrl` validates that a requested file belongs to a published Layout, or that its caller is an administrator previewing a draft. It returns a CloudBase-generated HTTPS temporary URL. `layoutService` becomes the only client adapter for that function, and the canvas continues to use its existing failure fallback.

**Tech Stack:** WeChat Mini Program TypeScript, CloudBase `wx-server-sdk`, Vitest, Node.js verification script.

---

### Task 1: Add a deployable, guarded image URL cloud function

**Files:**
- Create: `cloudfunctions/getLayoutImageUrl/index.js`
- Create: `cloudfunctions/getLayoutImageUrl/package.json`
- Modify: `scripts/verify-phase1.mjs`

- [ ] **Step 1: Write the failing structural verification**

Require `cloudfunctions/getLayoutImageUrl/index.js` and verify that its package declares `wx-server-sdk` and its source calls `getTempFileURL`.

- [ ] **Step 2: Run verification to confirm failure**

Run: `npm run verify:phase1 -- --release`

Expected: `FAIL` because `getLayoutImageUrl` is absent.

- [ ] **Step 3: Implement the cloud function**

Implement this decision flow:

```js
const layouts = await db.collection('layouts').where({ imageFileId: fileID }).limit(1).get()
const layout = layouts.data[0] || (await db.collection('layouts').where({ displayImageFileId: fileID }).limit(1).get()).data[0]
if (!layout) throw new Error('LAYOUT_IMAGE_NOT_FOUND')
if (!layout.published && !isAdmin) throw new Error('FORBIDDEN')
const result = await cloud.getTempFileURL({ fileList: [fileID] })
return { url: result.fileList[0].tempFileURL }
```

Resolve `isAdmin` from cloud-function OPENID → `users.id` → `admins.userId`; reject empty or non-`cloud://` IDs.

- [ ] **Step 4: Run verification**

Run: `npm run verify:phase1 -- --release`

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/getLayoutImageUrl scripts/verify-phase1.mjs
git commit -m "feat: serve private layout images through cloud function"
```

### Task 2: Switch Canvas image loading to the guarded adapter

**Files:**
- Modify: `miniprogram/services/layouts.ts`
- Modify: `miniprogram/components/wall-canvas/index.ts`
- Test: `tests/layout-image-service.test.ts`

- [ ] **Step 1: Write the failing service test**

Mock the cloud-call adapter and assert that `getLayoutImageUrl('cloud://env/layout.jpg')` calls `getLayoutImageUrl` with `{ fileID }` and resolves its `url` value.

- [ ] **Step 2: Run the focused test to confirm failure**

Run: `npx vitest run tests/layout-image-service.test.ts`

Expected: `FAIL` because the adapter does not exist.

- [ ] **Step 3: Implement the minimal adapter and Canvas use**

Expose `getLayoutImageUrl(fileID)` from `layouts.ts` using the existing `call` helper. Replace the current private `downloadCloudImage(fileID)` branch in the canvas with this adapter; preserve `imageError` and hold rendering on rejection.

- [ ] **Step 4: Run focused and full checks**

Run: `npx vitest run tests/layout-image-service.test.ts && npm test && npm run build`

Expected: all tests pass and both TypeScript projects type-check.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/services/layouts.ts miniprogram/components/wall-canvas/index.ts tests/layout-image-service.test.ts
git commit -m "feat: load layout images through guarded URLs"
```

### Task 3: Document deployment and validate the complete release structure

**Files:**
- Modify: `docs/cloudbase-setup.md`
- Modify: `docs/manual-test.md`

- [ ] **Step 1: Document the fifth cloud function**

Add `getLayoutImageUrl` to the required deployed functions and state that storage remains “仅创建者可读写”.

- [ ] **Step 2: Add manual acceptance cases**

Document: published Layout image renders for a normal user; draft image URL is denied to a normal user; an administrator can preview a draft; invalid file IDs are rejected.

- [ ] **Step 3: Run full release verification**

Run: `npm test && npm run build && npm run verify:phase1 -- --release && git diff --check`

Expected: all commands succeed.

- [ ] **Step 4: Commit**

```bash
git add docs/cloudbase-setup.md docs/manual-test.md
git commit -m "docs: explain private layout image deployment"
```
