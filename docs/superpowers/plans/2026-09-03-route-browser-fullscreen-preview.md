# 线路浏览器全屏预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为线路浏览器中已选线路的墙面画布添加点击进入、再次点击退出的手机全屏预览。

**Architecture:** `WallCanvasView` 增加可选的背景轻点回调，并在未命中岩点时调用，保留既有拖动、缩放和岩点点击行为。`web/src/main.ts` 为路线浏览器详情维护短暂全屏状态，普通画布和覆盖层画布各自创建并销毁 `WallCanvasView`，不改变路由或当前选中线路。

**Tech Stack:** TypeScript、原生 DOM/CSS Canvas、Vitest、Vite。

---

## 文件结构

- 修改 `web/src/wall-canvas.ts`：抽出并测试岩点/画布轻点回调分派。
- 修改 `web/src/main.ts`：添加路线浏览器专属全屏状态、覆盖层渲染和资源释放。
- 修改 `web/src/styles/editor.css`：添加手机全屏覆盖层与画布容器样式。
- 修改 `tests/wall-management-routes.test.ts`：锁定路线浏览器详情的全屏入口和覆盖层标记。
- 创建 `tests/wall-canvas-tap.test.ts`：直接测试轻点、拖动和岩点点击的回调分流。

### Task 1: 扩展画布的轻点回调契约

**Files:**
- Modify: `web/src/wall-canvas.ts:14-27, 190-197`
- Create: `tests/wall-canvas-tap.test.ts`

- [ ] **Step 1: 编写失败的画布轻点测试**

创建 `tests/wall-canvas-tap.test.ts`：

```typescript
import { expect, it, vi } from 'vitest'
import { dispatchCanvasTap } from '../web/src/wall-canvas.js'

it('calls onTapCanvas when a short tap misses every hold', () => {
  const onTapCanvas = vi.fn()
  dispatchCanvasTap(undefined, vi.fn(), onTapCanvas)

  expect(onTapCanvas).toHaveBeenCalledOnce()
})

it('does not call onTapCanvas when a hold is selected', () => {
  const onTapCanvas = vi.fn(), onTapHold = vi.fn()
  dispatchCanvasTap('H001', onTapHold, onTapCanvas)

  expect(onTapHold).toHaveBeenCalledWith('H001')
  expect(onTapCanvas).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试并确认新选项尚不存在**

Run: `npm test -- tests/wall-canvas-tap.test.ts`

Expected: FAIL，`onTapCanvas` 不在 `WallCanvasOptions` 类型中。

- [ ] **Step 3: 实现最小画布回调**

在 `WallCanvasOptions` 中加入：

```typescript
  onTapCanvas?: () => void
```

在 `wall-canvas.ts` 的 `wallHoldAt()` 后新增：

```typescript
export const dispatchCanvasTap = (holdId: string | undefined, onTapHold: (holdId: string) => void, onTapCanvas?: () => void) => {
  if (holdId) onTapHold(holdId)
  else onTapCanvas?.()
}
```

在 `tap()` 的末尾替换为：

```typescript
    dispatchCanvasTap(hold?.id, this.opts.onTapHold, this.opts.onTapCanvas)
```

`pointerup` 已仅在短按、未移动且未双指缩放时调用 `tap()`；不要改变这段手势判断。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/wall-canvas-tap.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交画布契约**

```bash
git add web/src/wall-canvas.ts tests/wall-canvas-tap.test.ts
git commit -m "feat: support canvas background taps"
```

### Task 2: 渲染路线浏览器全屏预览

**Files:**
- Modify: `web/src/main.ts:91-130, 648-735`
- Modify: `web/src/styles/editor.css`
- Modify: `tests/wall-management-routes.test.ts`

- [ ] **Step 1: 为全屏页面标记写失败测试**

在 `tests/wall-management-routes.test.ts` 追加：

```typescript
it('offers a fullscreen canvas preview only for a selected route-browser detail', () => {
  const source = readFileSync('web/src/main.ts', 'utf8')
  expect(source).toContain('data-open-route-fullscreen')
  expect(source).toContain('id="route-fullscreen-preview"')
  expect(source).toContain('data-close-route-fullscreen')
  expect(source).toContain('viewportHeight: window.innerHeight')
})
```

- [ ] **Step 2: 运行测试并确认入口尚不存在**

Run: `npm test -- tests/wall-management-routes.test.ts`

Expected: FAIL，找不到 `data-open-route-fullscreen`。

- [ ] **Step 3: 添加短暂的全屏状态与画布销毁**

在 `web/src/main.ts` 顶部的预览状态旁新增：

```typescript
let routeFullscreen = false,
  fullscreenRoutePreview: WallCanvasView | null = null
```

在普通 `wallPreview` 销毁处也加入：

```typescript
  fullscreenRoutePreview?.destroy()
  fullscreenRoutePreview = null
  routeFullscreen = false
```

在路线浏览器的已选线路详情模板中，将 `#route-preview` 包在带入口的按钮容器中，并追加：

```typescript
<button class="route-fullscreen-entry" data-open-route-fullscreen>点击查看全屏</button>
${routeFullscreen ? '<div id="route-fullscreen-preview" class="route-fullscreen-preview" role="dialog" aria-modal="true"><button class="route-fullscreen-close" data-close-route-fullscreen aria-label="退出全屏">×</button><div id="route-fullscreen-canvas"></div></div>' : ''}
```

使用当前 `selected` 和 `selectedRoute` 创建普通画布时，定义并传入同一个打开回调，以使轻点岩点和轻点背景都可打开预览：

```typescript
      const openFullscreen = () => {
        routeFullscreen = true
        void render()
      }
      // WallCanvasView options
      onTapHold: openFullscreen,
      onTapCanvas: openFullscreen,
```

在普通画布创建后、且 `routeFullscreen` 为真时创建全屏实例：

```typescript
    fullscreenRoutePreview = new WallCanvasView(root.querySelector('#route-fullscreen-canvas') as HTMLElement, {
      imageUrl: selected.imageFileId, imageWidth: selected.imageWidth, imageHeight: selected.imageHeight,
      polygonCoordinates: 'normalized', viewportHeight: window.innerHeight, holds: selected.holds,
      getAssignments: () => selectedRoute.holds, getSelectedRole: () => null,
      onTapHold: () => { routeFullscreen = false; void render() },
      onTapCanvas: () => { routeFullscreen = false; void render() },
    })
```

为 `[data-open-route-fullscreen]` 和 `[data-close-route-fullscreen]` 绑定事件。两者均将 `routeFullscreen` 设为 `true` 或 `false` 后调用 `render()`；关闭按钮不依赖画布轻点。

- [ ] **Step 4: 添加手机全屏样式**

在 `web/src/styles/editor.css` 末尾添加：

```css
.route-fullscreen-entry{display:block;width:100%;margin:10px 0 2px;padding:8px;border:0;background:transparent;color:#5f50de;font-size:12px;font-weight:800}.route-fullscreen-preview{position:fixed;z-index:30;inset:0;display:grid;place-items:center;background:#121126}.route-fullscreen-preview::backdrop{background:#121126}.route-fullscreen-preview #route-fullscreen-canvas{width:100%;max-height:100dvh}.route-fullscreen-close{position:absolute;z-index:1;top:calc(12px + env(safe-area-inset-top));right:14px;width:36px;height:36px;border:0;border-radius:50%;background:#ffffffdd;color:#262143;font-size:26px;line-height:1}
```

- [ ] **Step 5: 运行路线浏览器与全屏相关测试**

Run: `npm test -- tests/wall-management-routes.test.ts tests/wall-canvas-tap.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交全屏路线预览**

```bash
git add web/src/main.ts web/src/styles/editor.css tests/wall-management-routes.test.ts
git commit -m "feat: add fullscreen route preview"
```

### Task 3: 完整验证

**Files:**
- Verify only: `tests/`
- Verify only: `web/`

- [ ] **Step 1: 运行完整前端测试和类型检查**

Run: `npm test && npm run build && npm run web:build`

Expected: 每条命令以 0 退出，Vitest 全绿，两个 TypeScript 配置及生产 Web 构建通过。

- [ ] **Step 2: 在手机宽度人工验证**

Run: `npm run web`

在“线路 → 墙面 → 浏览线路 → 任意线路详情”中确认：轻点普通墙面图打开全屏；全屏内可拖动和双指缩放；轻点未命中岩点区域或右上角关闭按钮退出；上/下一条线路、返回和筛选继续正常工作。确认“我的线路”的独立详情页没有全屏入口。

- [ ] **Step 3: 检查提交范围**

Run: `git status --short && git log --oneline -2`

Expected: 仅包含本计划的画布、路线浏览器、样式和测试提交；不提交 `.superpowers/brainstorm/` 临时文件。
