# 角色岩点发光描边 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将有角色的岩点改为内部透明、角色色单层描边及白色外发光。

**Architecture:** 在 `WallCanvasView.redraw()` 中仅对有角色的岩点设置画布阴影并执行一次角色色描边。圆形和多边形共用同一段描边逻辑，因此效果保持一致；未分配角色的岩点继续不渲染。

**Tech Stack:** TypeScript、HTML Canvas 2D、Vitest。

---

### Task 1: 验证并实现单层发光描边

**Files:**
- Modify: `tests/wall-canvas-unassigned.test.ts`
- Modify: `web/src/wall-canvas.ts:250-280`

- [ ] **Step 1: 写出失败测试**

将测试替换为：

```ts
it('uses one role-colored outline with a white glow for assigned holds', () => {
  const source = readFileSync('web/src/wall-canvas.ts', 'utf8')
  expect(source).not.toContain('ctx.strokeStyle = "#ffffff"')
  expect(source).toContain('ctx.shadowColor = "#ffffff"')
  expect(source).toContain('ctx.strokeStyle = ROLE_COLORS[role]')
})
```

- [ ] **Step 2: 运行测试，确认它失败**

运行：`npm test -- tests/wall-canvas-unassigned.test.ts`

预期：失败，因为当前代码仍存在 `ctx.strokeStyle = "#ffffff"`，尚未设置白色阴影。

- [ ] **Step 3: 实施最小绘制改动**

将有角色的绘制块替换为：

```ts
if (role) {
  ctx.lineWidth = 2
  ctx.shadowColor = "#ffffff"
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = ROLE_COLORS[role]
  ctx.stroke()
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
}
```

- [ ] **Step 4: 运行测试和类型检查，确认通过**

运行：`npm test -- tests/wall-canvas-unassigned.test.ts && npm run build`

预期：测试通过，两个 TypeScript 项目均无类型错误。

- [ ] **Step 5: 提交改动**

```bash
git add web/src/wall-canvas.ts tests/wall-canvas-unassigned.test.ts docs/superpowers/plans/2026-09-03-role-hold-glow-outline.md
git commit -m "feat: use glowing role outlines for holds"
```
