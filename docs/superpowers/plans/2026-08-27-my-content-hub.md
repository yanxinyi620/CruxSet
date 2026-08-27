# 我的内容中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“我的”拆为“我的墙面”和“我的线路”两个可管理入口。

**Architecture:** 在现有 service 层增加按当前用户过滤的线路读取和授权删除；“我的”页只显示两个入口，新建两个列表页承载墙面管理与线路管理。

**Tech Stack:** 原生微信小程序 WXML/WXSS/TypeScript、现有 service/Mock Repository、Vitest。

---

### Task 1: 用户线路读取与删除授权

**Files:**
- Modify: `miniprogram/services/problems.ts`
- Modify: `miniprogram/services/mock-repository.ts`
- Test: `tests/my-problems.test.ts`

- [ ] **Step 1: 写出失败测试**

```ts
it('lists only problems created by the current user', async () => {
  const repository = createMockRepository()
  const mine = await repository.listMyProblems()
  expect(mine.every(problem => problem.createdBy === mockCurrentUserId)).toBe(true)
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm test -- tests/my-problems.test.ts`

Expected: FAIL，因为 `listMyProblems` 尚未定义。

- [ ] **Step 3: 最小实现**

在 Mock Repository 增加 `listMyProblems()`，按 `createdBy === mockCurrentUserId` 与 `createdAt` 降序过滤。CloudBase 路径在 `problems.ts` 增加 `listMyProblems()`，调用 `wallManager('listMyProblems')`；云函数按登录用户 ID 查询。`deleteProblem` 在 Mock 和云端都验证创建者或管理员身份。

- [ ] **Step 4: 验证通过并提交**

Run: `npm test -- tests/my-problems.test.ts`

```bash
git add miniprogram/services cloudfunctions/wallManager tests/my-problems.test.ts
git commit -m "feat: add current user problem management"
```

### Task 2: 两个入口与独立列表页面

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/me/index.{ts,wxml,wxss}`
- Create: `miniprogram/pages/me/walls/index.{ts,wxml,wxss,json}`
- Create: `miniprogram/pages/me/problems/index.{ts,wxml,wxss,json}`
- Test: `tests/my-content-routes.test.ts`

- [ ] **Step 1: 写出失败路由测试**

```ts
it('registers the two management pages', () => {
  const pages = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')).pages
  expect(pages).toContain('pages/me/walls/index')
  expect(pages).toContain('pages/me/problems/index')
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm test -- tests/my-content-routes.test.ts`

Expected: FAIL，因为两个路由不存在。

- [ ] **Step 3: 实现页面**

“我的”使用两张入口卡，分别显示墙面数与线路数。墙面列表迁移当前状态/删除逻辑；线路列表调用 `listMyProblems()`，每项显示编号、名称、墙面、Layout、角度和难度，点击进入详情，删除前确认并调用 `deleteProblem()` 后刷新。

- [ ] **Step 4: 验证并提交**

Run: `npm test && npm run build`

```bash
git add miniprogram/app.json miniprogram/pages/me tests/my-content-routes.test.ts
git commit -m "feat: add my walls and my problems pages"
```

### Task 3: 预览器同步与最终检查

**Files:**
- Modify: `dev-preview/src/main.ts`
- Modify: `dev-preview/src/styles/*.css`
- Modify: `README.md`

- [ ] **Step 1: 将预览器“我的”页改为两个入口**

入口卡显示数量和说明；点击可进入墙面/线路列表模拟状态。

- [ ] **Step 2: 运行验证**

Run: `npm test && npm run build && npm run preview:build && npm run verify:phase1 -- --release`

Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
git add dev-preview README.md
git commit -m "style: mirror my content hub in preview"
```
