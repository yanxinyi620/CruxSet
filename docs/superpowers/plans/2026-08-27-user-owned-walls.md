# User-Owned Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every user create and manage private or public walls while preserving CloudBase client read-only data access.

**Architecture:** Replace the administrator-only write endpoint with `wallManager`. It derives the caller from CloudBase OPENID, writes `ownerId` and default `visibility: 'private'` itself, and verifies wall ownership for every later Layout or visibility action. The “我的” page calls read-only query functions for the caller’s walls and exposes the entry point.

**Tech Stack:** WeChat Mini Program TypeScript, CloudBase `wx-server-sdk`, Vitest, native Mini Program pages.

---

### Task 1: Define ownership and visibility in the mini program model

**Files:**
- Modify: `miniprogram/domain/types.ts`
- Modify: `src/domain/types.ts`
- Test: `tests/user-owned-wall.test.ts`

- [ ] **Step 1: Write failing type/fixture test**

Create a Wall fixture with `ownerId: 'usr_owner'` and `visibility: 'private'`; assert those fields remain available to consumers.

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run tests/user-owned-wall.test.ts`

Expected: FAIL because Wall has no ownership fields.

- [ ] **Step 3: Add the fields**

Add `ownerId: string` and `visibility: 'private'|'public'` to both Wall declarations. Update demo walls to use `usr_demo` and `public`.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/user-owned-wall.test.ts && npm run build`

Commit: `git commit -m "feat: model wall ownership and visibility"`

### Task 2: Replace administrator-only wall writes with ownership-checked writes

**Files:**
- Create: `cloudfunctions/wallManager/index.js`
- Create: `cloudfunctions/wallManager/package.json`
- Modify: `scripts/verify-phase1.mjs`
- Modify: `docs/cloudbase-setup.md`

- [ ] **Step 1: Extend deployment verification before implementation**

Require `wallManager`, `wx-server-sdk`, and source markers for `ownerId`, `visibility`, and `FORBIDDEN`.

- [ ] **Step 2: Run verification to show the missing function failure**

Run: `npm run verify:phase1 -- --release`

Expected: FAIL because `wallManager` is absent.

- [ ] **Step 3: Implement `wallManager`**

Implement `createWall`, `updateWall`, `createLayout`, `updateLayout`, `publishLayout`, `listBrowseWalls`, `listMyWalls`, `getWall`, `getLayout`, `listProblems`, `getProblem`. Resolve the caller from OPENID. `createWall` stores `{ ownerId: caller.id, visibility: data.visibility === 'public' ? 'public' : 'private' }`. All other actions load the Wall and allow only its owner or an `admins.userId` match. Read actions return only public content, content owned by the caller, or all content to an administrator. Keep current hold, image and immutable version validation.

- [ ] **Step 4: Verify and commit**

Run: `npm run verify:phase1 -- --release`

Commit: `git commit -m "feat: manage walls through ownership-checked function"`

### Task 3: Add read services and “我的墙面” navigation

**Files:**
- Modify: `miniprogram/services/walls.ts`
- Modify: `miniprogram/services/layouts.ts`
- Modify: `miniprogram/pages/me/index.ts`
- Modify: `miniprogram/pages/me/index.wxml`
- Modify: `miniprogram/pages/admin/index.ts`
- Modify: `miniprogram/pages/admin/index.wxml`
- Test: `tests/wall-manager-service.test.ts`

- [ ] **Step 1: Write failing service test**

Mock the shared cloud-call adapter. Assert that `wallManager('createWall', data)` calls `wallManager`; assert `listMyWalls()` calls the dedicated read endpoint and does not directly write the database.

- [ ] **Step 2: Run focused test**

Run: `npx vitest run tests/wall-manager-service.test.ts`

Expected: FAIL because the services do not exist.

- [ ] **Step 3: Implement services and pages**

Expose `wallManager` and move `listWalls`, `getWall`, `getLayout`, `listProblems`, and `getProblem` to its guarded read actions. Change the existing creation page title to “新建墙面”, add a private/public picker defaulted to private, upload under a user-scoped path, and use `wallManager`. Implement “我的” as the visible entry point with a “新建墙面” button and owned-wall list.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/wall-manager-service.test.ts && npm test && npm run build`

Commit: `git commit -m "feat: add my walls entry and visibility controls"`

### Task 4: Validate release structure and document migration

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/manual-test.md`
- Modify: `docs/cloudbase-setup.md`

- [ ] **Step 1: Document existing Wall migration**

State that existing Walls need `ownerId` and `visibility`; use the console to assign the initial Wall to `usr_mtb4ge9d_hvdfr1` and choose `public` or `private`.

- [ ] **Step 2: Add manual acceptance cases**

Add cases for private-wall isolation, public-wall homepage browsing, owner edits, non-owner rejection, and client collection permissions set to “所有用户不可读写”.

- [ ] **Step 3: Run complete release checks and commit**

Run: `npm test && npm run build && npm run verify:phase1 -- --release && git diff --check`

Commit: `git commit -m "docs: verify user-owned wall access"`
