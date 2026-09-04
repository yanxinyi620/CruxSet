# Mini Program Web Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the shared WeChat Mini Program experience into functional and visual alignment with the existing Web workbench without changing any Web files or behavior.

**Architecture:** The Mini Program remains the only client changed. Its public flow becomes wall list → wall overview → route browser → read-only route detail; creation and personal route editing stay in their existing native page flows. CloudBase `wallManager` remains the authenticated data boundary and adds profile read/update plus safe setter display data.

**Tech Stack:** WeChat Mini Program WXML/WXSS/TypeScript, CloudBase cloud functions, Vitest, TypeScript.

---

### Task 1: Add CloudBase profile and public setter data contracts

**Files:**
- Modify: `wechat/cloudfunctions/wallManager/index.js`
- Modify: `wechat/miniprogram/services/users.ts`
- Modify: `wechat/miniprogram/services/walls.ts`
- Modify: `wechat/miniprogram/services/problems.ts`
- Create: `tests/miniprogram-profile-and-setter.test.ts`

- [ ] **Step 1: Add failing contract tests.**

Test the pure response helpers or extracted helpers for these rules: session exposes `userId`, `isAdmin`, and `displayName`; a profile update trims and rejects empty or over-40-character names; public route data exposes `setterName` as display name or `用户`; OpenID and UnionID never appear in client-facing results.

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npx vitest run tests/miniprogram-profile-and-setter.test.ts`

Expected: FAIL because the profile and setter contracts do not exist yet.

- [ ] **Step 3: Implement authenticated CloudBase operations.**

Extend `wallManager` so `getSession` returns only `{ userId, isAdmin, displayName }`. Add an `updateProfile` action that authenticates through `identity`, trims `data.displayName`, rejects empty or longer-than-40-character values with `INVALID_INPUT`, updates only `displayName` and `updatedAt`, and returns the safe session shape. For `getProblem` and `listProblems`, derive `setterName` from the creator user record and return `用户` when no display name exists; never spread or return the user record.

- [ ] **Step 4: Add Mini Program service wrappers.**

Expose `getProfile()` and `updateProfile(displayName)` from `services/users.ts`. Keep `currentUserIsAdmin()` using `getSession`; update problem types/usage only as needed for optional `setterName`. Do not expose direct database access to pages.

- [ ] **Step 5: Run focused tests and type checks.**

Run: `npx vitest run tests/miniprogram-profile-and-setter.test.ts && npm run build`

Expected: focused tests and both TypeScript checks pass.

- [ ] **Step 6: Commit.**

```bash
git add wechat/cloudfunctions/wallManager/index.js wechat/miniprogram/services/users.ts wechat/miniprogram/services/walls.ts wechat/miniprogram/services/problems.ts tests/miniprogram-profile-and-setter.test.ts
git commit -m "feat: support mini program profiles and route setters"
```

### Task 2: Align public wall browsing and route detail flow

**Files:**
- Modify: `wechat/miniprogram/app.json`
- Modify: `wechat/miniprogram/pages/walls/index.wxml`
- Modify: `wechat/miniprogram/pages/walls/index.wxss`
- Modify: `wechat/miniprogram/pages/walls/index.ts`
- Modify: `wechat/miniprogram/pages/wall/index.wxml`
- Modify: `wechat/miniprogram/pages/wall/index.wxss`
- Modify: `wechat/miniprogram/pages/wall/index.ts`
- Create: `wechat/miniprogram/pages/route-browser/index.json`
- Create: `wechat/miniprogram/pages/route-browser/index.wxml`
- Create: `wechat/miniprogram/pages/route-browser/index.wxss`
- Create: `wechat/miniprogram/pages/route-browser/index.ts`
- Modify: `wechat/miniprogram/pages/problem/detail/index.wxml`
- Modify: `wechat/miniprogram/pages/problem/detail/index.wxss`
- Modify: `wechat/miniprogram/pages/problem/detail/index.ts`
- Modify: `wechat/miniprogram/domain/browse.ts`
- Modify: `wechat/miniprogram/domain/types.ts`
- Create: `tests/miniprogram-public-browse.test.ts`

- [ ] **Step 1: Add failing navigation and behavior tests.**

Cover the route contract: wall list opens `/pages/wall/index`; wall overview opens `/pages/route-browser/index`; route browser has no search/random action and defaults to no angle/grade restriction; route detail is read-only and includes setter/description/pager data; wall and route pages use the Web-aligned labels.

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npx vitest run tests/miniprogram-public-browse.test.ts`

Expected: FAIL because the route-browser page and updated navigation are absent.

- [ ] **Step 3: Convert the wall page into a Web-style overview.**

Keep the existing wall image and metadata, remove inline route filters, search input, route cards, and random button, and add a single “浏览线路” action that navigates to the new route-browser page.

- [ ] **Step 4: Create the route-browser page.**

Implement angle and grade filters with default “全部”, a route list, empty state, and navigation to the read-only problem detail page. Preserve the active filter context in page data/storage as needed for previous/next navigation. Do not add keyword search or random selection.

- [ ] **Step 5: Align problem detail behavior.**

Remove owner edit/delete controls. Display route number, wall, angle, grade, foot rule, setter name, description, role legend, and previous/next actions. Previous/next must remain inside the active filtered route list.

- [ ] **Step 6: Align wall list layout and labels.**

Use the Web card hierarchy and copy, while retaining the mini program’s native page and touch behavior. Ensure wall counts are sourced from available CloudBase data without adding a Web change.

- [ ] **Step 7: Run focused tests and type checks.**

Run: `npx vitest run tests/miniprogram-public-browse.test.ts && npm run build`

Expected: focused tests and TypeScript checks pass.

- [ ] **Step 8: Commit.**

```bash
git add wechat/miniprogram/app.json wechat/miniprogram/pages/walls wechat/miniprogram/pages/wall wechat/miniprogram/pages/route-browser wechat/miniprogram/pages/problem/detail wechat/miniprogram/domain/browse.ts wechat/miniprogram/domain/types.ts tests/miniprogram-public-browse.test.ts
git commit -m "feat: align mini program public browsing"
```

### Task 3: Align creation and personal route management

**Files:**
- Modify: `wechat/miniprogram/pages/create/index.wxml`
- Modify: `wechat/miniprogram/pages/create/index.wxss`
- Modify: `wechat/miniprogram/pages/me/index.wxml`
- Modify: `wechat/miniprogram/pages/me/index.wxss`
- Modify: `wechat/miniprogram/pages/me/index.ts`
- Modify: `wechat/miniprogram/pages/me/problems/index.wxml`
- Modify: `wechat/miniprogram/pages/me/problems/index.wxss`
- Modify: `wechat/miniprogram/pages/me/problems/index.ts`
- Modify: `wechat/miniprogram/pages/problem/editor/index.wxml`
- Modify: `wechat/miniprogram/pages/problem/editor/index.wxss`
- Modify: `wechat/miniprogram/pages/problem/editor/index.ts`
- Create: `wechat/miniprogram/pages/profile/index.json`
- Create: `wechat/miniprogram/pages/profile/index.wxml`
- Create: `wechat/miniprogram/pages/profile/index.wxss`
- Create: `wechat/miniprogram/pages/profile/index.ts`
- Create: `tests/miniprogram-personal-pages.test.ts`

- [ ] **Step 1: Add failing personal-page tests.**

Cover that “我的” contains profile and my routes, profile uses manual nickname entry with “未设置昵称” fallback, save failure preserves the old value, my routes are grouped by wall with edit/delete actions, and the public detail page has no owner actions. Cover that creation remains “创建 → 选择公开墙面 → 新建线路”.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run tests/miniprogram-personal-pages.test.ts`

Expected: FAIL because profile page and the aligned templates are not implemented.

- [ ] **Step 3: Add the profile page.**

Show the current CruxSet nickname or “未设置昵称”. Save a manually entered trimmed nickname through `updateProfile`; reject empty input locally, show the existing error style on failure, and do not replace the previously displayed value after a failed save. Do not call any WeChat nickname authorization API.

- [ ] **Step 4: Update the “我的” hub and my-routes page.**

Add the profile card. Keep the existing wall-management entry only for its approved administrator/Web-exclusive role. Make route groups and edit/delete affordances follow the Web hierarchy. Remove any route-detail click path that would make public detail the editing entry point; route rows may still open read-only detail, while edit/delete remain explicit actions in “我的线路”.

- [ ] **Step 5: Align create and route editor presentation.**

Keep the native picker and page navigation, but match Web copy, card hierarchy, role colors, selected states, canvas-first ordering, save/undo/clear feedback, and metadata grouping. Do not add wall upload, annotation, or Web-only management features to the mini program.

- [ ] **Step 6: Run focused tests and type checks.**

Run: `npx vitest run tests/miniprogram-personal-pages.test.ts && npm run build`

Expected: focused tests and TypeScript checks pass.

- [ ] **Step 7: Commit.**

```bash
git add wechat/miniprogram/pages/create wechat/miniprogram/pages/me wechat/miniprogram/pages/profile wechat/miniprogram/pages/problem/editor tests/miniprogram-personal-pages.test.ts
git commit -m "feat: align mini program personal route flows"
```

### Task 4: Apply the Web visual language to shared Mini Program pages

**Files:**
- Modify: `wechat/miniprogram/app.wxss`
- Modify: `wechat/miniprogram/pages/walls/index.wxss`
- Modify: `wechat/miniprogram/pages/wall/index.wxss`
- Modify: `wechat/miniprogram/pages/route-browser/index.wxss`
- Modify: `wechat/miniprogram/pages/problem/detail/index.wxss`
- Modify: `wechat/miniprogram/pages/create/index.wxss`
- Modify: `wechat/miniprogram/pages/me/index.wxss`
- Modify: `wechat/miniprogram/pages/me/problems/index.wxss`
- Modify: `wechat/miniprogram/pages/profile/index.wxss`
- Modify: `wechat/miniprogram/pages/problem/editor/index.wxss`
- Create: `tests/miniprogram-visual-language.test.ts`

- [ ] **Step 1: Add visual-contract tests.**

Assert shared Mini Program styles use the Web-aligned purple accent, deep-purple navigation, card surfaces, warm emphasis, and shared empty/error state classes; assert wall and editor styles no longer use the old deep-green theme values.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npx vitest run tests/miniprogram-visual-language.test.ts`

Expected: FAIL while old green selectors or inconsistent shared styles remain.

- [ ] **Step 3: Update shared tokens and page styles.**

Normalize colors, radii, borders, typography hierarchy, button/label states, canvas containers, error states, and empty states to the existing Web values translated to `rpx`. Keep TabBar and native controls as platform adaptations.

- [ ] **Step 4: Run visual-contract tests and build.**

Run: `npx vitest run tests/miniprogram-visual-language.test.ts && npm run build`

Expected: focused tests and both TypeScript checks pass.

- [ ] **Step 5: Commit.**

```bash
git add wechat/miniprogram/app.wxss wechat/miniprogram/pages tests/miniprogram-visual-language.test.ts
git commit -m "style: align shared mini program pages with web"
```

### Task 5: Full verification and scope audit

**Files:**
- Verify only: `web/`
- Verify only: `wechat/miniprogram/`
- Verify only: `wechat/cloudfunctions/`

- [ ] **Step 1: Verify Web is unchanged.**

Run: `git diff bda6660..HEAD --name-only -- web`

Expected: no output for the implementation commits; no Web file is modified.

- [ ] **Step 2: Verify forbidden Mini Program features are absent.**

Run: `rg -n "randomProblem|RandomSession|placeholder=.*搜索|搜索编号|随机线路" wechat/miniprogram`

Expected: no public browsing or page-handler matches; historical documentation may be reviewed separately.

- [ ] **Step 3: Run the complete verification suite.**

Run: `npm test && npm run build && npm run web:build`

Expected: all tests pass, TypeScript checks pass, and Web production build succeeds.

- [ ] **Step 4: Verify final status.**

Run: `git status --short`

Expected: clean worktree after commits.
