# CruxSet 高保真开发预览器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可交互的 Vite 浏览器预览器，用真实的 CruxSet Mock 领域逻辑快速核验页面流程与视觉效果，而不改变原生小程序交付方式。

**Architecture:** `dev-preview` 是一个独立的原生 TypeScript/Vite 单页应用。浏览器路由与 UI 状态位于 `dev-preview/src`，数据访问通过 `PreviewRepository` 适配现有 `MockRepository` 和领域类型；预览器不导入任何 `wx` 依赖的 service 文件。每一页用语义化 DOM 映射对应的小程序页面，最终再把已认可的视觉 token 同步回 WXML/WXSS。

**Tech Stack:** TypeScript、Vite、Vitest、原生 DOM/CSS、现有 `miniprogram/domain` 和 `MockRepository`。

---

## 文件结构

| 路径 | 责任 |
| --- | --- |
| `package.json` | 增加预览和预览测试脚本，以及 Vite 依赖。 |
| `dev-preview/vite.config.ts` | Vite 根目录、端口 5173、静态资源和测试配置。 |
| `dev-preview/index.html` | 预览器入口。 |
| `dev-preview/public/assets/mock/ritan-spraywall-0822.jpg` | 浏览器预览器使用的本地墙面静态图片副本。 |
| `dev-preview/src/data/preview-repository.ts` | 将 `MockRepository` 暴露成浏览器安全、可重置的预览数据接口。 |
| `dev-preview/src/preview-store.ts` | 路由、设备、对话框、通知和会话数据的唯一 UI 状态来源。 |
| `dev-preview/src/routes.ts` | 路由名称、参数和 URL 编解码。 |
| `dev-preview/src/app-shell.ts` | 微信式设备壳、导航栏、TabBar、设备切换器。 |
| `dev-preview/src/pages/*.ts` | 线路、创建、我的、墙面、标注、线路编辑、线路详情的 DOM 镜像。 |
| `dev-preview/src/components/*.ts` | 可复用墙面视觉、弹窗、模拟岩点画布、表单和卡片。 |
| `dev-preview/src/styles/*.css` | token、布局、页面和组件视觉样式。 |
| `tests/dev-preview-*.test.ts` | 预览数据、路由和关键流程的无 DOM 逻辑测试。 |

### Task 1: 安装并验证 Vite 预览器骨架

**Files:**
- Modify: `package.json`
- Create: `dev-preview/tsconfig.json`
- Create: `dev-preview/vite.config.ts`
- Create: `dev-preview/index.html`
- Create: `dev-preview/public/assets/mock/ritan-spraywall-0822.jpg`（从 `miniprogram/assets/mock/ritan-spraywall-0822.jpg` 复制）
- Create: `dev-preview/src/main.ts`
- Create: `dev-preview/src/styles/tokens.css`
- Create: `dev-preview/src/styles/base.css`
- Test: `tests/dev-preview-build.test.ts`

- [ ] **Step 1: 写出失败的预览器构建配置测试**

```ts
// tests/dev-preview-build.test.ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('dev preview scaffold', () => {
  it('has a Vite entry point and configuration', () => {
    expect(existsSync(resolve('dev-preview/index.html'))).toBe(true)
    expect(existsSync(resolve('dev-preview/vite.config.ts'))).toBe(true)
    expect(existsSync(resolve('dev-preview/src/main.ts'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `npm test -- tests/dev-preview-build.test.ts`

Expected: FAIL，因为 `dev-preview` 目录尚不存在。

- [ ] **Step 3: 添加 Vite 配置与入口**

在根 `package.json` 的 scripts 中加入：

```json
"preview": "vite --config dev-preview/vite.config.ts",
"preview:build": "vite build --config dev-preview/vite.config.ts"
```

在 devDependencies 中加入：

```json
"vite": "^6.0.0"
```

使用以下最小配置，确保端口固定并在 monorepo 根解析文件：

```ts
// dev-preview/vite.config.ts
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: previewRoot,
  publicDir: resolve(previewRoot, 'public'),
  server: { port: 5173, strictPort: true },
  build: { outDir: resolve(previewRoot, 'dist'), emptyOutDir: true },
})
```

`index.html` 提供 `<main id="app"></main>` 并加载 `/src/main.ts`。将 `miniprogram/assets/mock/ritan-spraywall-0822.jpg` 原样复制到 `dev-preview/public/assets/mock/ritan-spraywall-0822.jpg`，使 Mock Repository 中的 `/assets/mock/ritan-spraywall-0822.jpg` 在 Vite 中可访问。`main.ts` 导入两个样式文件并将一个临时 shell 渲染到 `#app`。`tokens.css` 至少定义 `--ink`、`--canvas`、`--surface`、`--accent`、`--line`、`--radius-card`、`--safe-bottom`；`base.css` 负责 box sizing、页面背景和可访问焦点样式。

- [ ] **Step 4: 运行单测和 Vite 构建**

Run: `npm test -- tests/dev-preview-build.test.ts && npm run preview:build`

Expected: 测试通过；Vite 输出 `dev-preview/dist`。

- [ ] **Step 5: 提交骨架**

```bash
git add package.json package-lock.json dev-preview tests/dev-preview-build.test.ts
git commit -m "feat: add Vite development preview scaffold"
```

### Task 2: 建立浏览器安全的数据适配层与可重置会话

**Files:**
- Create: `dev-preview/src/data/preview-repository.ts`
- Create: `dev-preview/src/data/preview-session.ts`
- Test: `tests/dev-preview-repository.test.ts`

- [ ] **Step 1: 写出失败的可重置数据会话测试**

```ts
// tests/dev-preview-repository.test.ts
import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../dev-preview/src/data/preview-session.js'

describe('PreviewSession', () => {
  it('creates a private wall and restores seeded data after reset', async () => {
    const session = new PreviewSession()
    const created = await session.createWall({ name: '测试墙面', visibility: 'public' })
    expect((await session.getWall(created.id)).visibility).toBe('public')
    session.reset()
    await expect(session.getWall(created.id)).rejects.toThrow('WALL_NOT_FOUND')
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `npm test -- tests/dev-preview-repository.test.ts`

Expected: FAIL，因为 `PreviewSession` 尚未定义。

- [ ] **Step 3: 实现适配层，不导入 `miniprogram/services/*.ts`**

实现 `PreviewSession`，内部用 `createMockRepository()` 创建实例并在 `reset()` 时替换实例。公开以下浏览器安全方法：

```ts
listWalls(): Promise<Wall[]>
listMyWalls(): Promise<Wall[]>
getWall(id: string): Promise<Wall>
listLayouts(wallId: string): Promise<Layout[]>
getLayout(id: string): Promise<Layout>
listProblems(filter?: Partial<Pick<Problem, 'wallId' | 'layoutId' | 'angle' | 'grade'>>): Promise<Problem[]>
createWall(data: Partial<Wall>): Promise<{ id: string }>
createLayout(wallId: string, data: CreateLayoutInput): Promise<Layout>
updateLayout(wallId: string, layoutId: string, holds: Hold[]): Promise<Layout>
publishLayout(wallId: string, layoutId: string, holds: Hold[]): Promise<Layout>
createProblem(wallId: string, layoutId: string, draft: Partial<Problem>): Promise<{ id: string; number: string }>
deleteLayout(wallId: string, layoutId: string): Promise<{ ok: true }>
deleteWall(wallId: string): Promise<{ ok: true }>
```

`CreateLayoutInput` 只包含 `name`、`imageFileId`、`imageWidth`、`imageHeight` 与可选 `geometryType`。本模块只能导入 `miniprogram/domain/types.js`、`miniprogram/domain/routable-wall.js` 和 `miniprogram/services/mock-repository.js`；不得导入包含 `wx` 的 `layouts.ts`、`walls.ts` 或 `cloud.ts`。

- [ ] **Step 4: 运行适配层测试**

Run: `npm test -- tests/dev-preview-repository.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交数据适配层**

```bash
git add dev-preview/src/data tests/dev-preview-repository.test.ts
git commit -m "feat: add resettable preview data session"
```

### Task 3: 实现路由与可测试的预览状态容器

**Files:**
- Create: `dev-preview/src/routes.ts`
- Create: `dev-preview/src/preview-store.ts`
- Test: `tests/dev-preview-store.test.ts`

- [ ] **Step 1: 写出失败的路由与删除确认测试**

```ts
// tests/dev-preview-store.test.ts
import { describe, expect, it } from 'vitest'
import { PreviewStore } from '../dev-preview/src/preview-store.js'

describe('PreviewStore', () => {
  it('requires two explicit confirmations before a wall is deleted', async () => {
    const store = new PreviewStore()
    const wall = await store.createWall({ name: '待删除墙面' })
    store.requestWallDeletion(wall.id)
    expect(store.state.dialog?.step).toBe(1)
    store.confirmDialog()
    expect(store.state.dialog?.step).toBe(2)
    await store.confirmDialog()
    await expect(store.session.getWall(wall.id)).rejects.toThrow('WALL_NOT_FOUND')
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `npm test -- tests/dev-preview-store.test.ts`

Expected: FAIL，因为 store 和路由尚未定义。

- [ ] **Step 3: 定义路由和状态 API**

在 `routes.ts` 定义下列显式路由 union 与纯函数：

```ts
export type PreviewRoute =
  | { name: 'browse' }
  | { name: 'create' }
  | { name: 'me' }
  | { name: 'wall'; wallId: string }
  | { name: 'draft-editor'; wallId: string; layoutId: string }
  | { name: 'problem-editor'; wallId: string; layoutId: string }
  | { name: 'problem-detail'; problemId: string }

export const toPreviewUrl = (route: PreviewRoute): string => {
  if (route.name === 'browse' || route.name === 'create' || route.name === 'me') return `/${route.name}`
  if (route.name === 'wall') return `/wall/${encodeURIComponent(route.wallId)}`
  if (route.name === 'problem-detail') return `/problem/${encodeURIComponent(route.problemId)}`
  return `/${route.name}/${encodeURIComponent(route.wallId)}/${encodeURIComponent(route.layoutId)}`
}

export const fromPreviewUrl = (url: URL): PreviewRoute => {
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'create') return { name: 'create' }
  if (parts[0] === 'me') return { name: 'me' }
  if (parts[0] === 'wall' && parts[1]) return { name: 'wall', wallId: parts[1] }
  if (parts[0] === 'problem' && parts[1]) return { name: 'problem-detail', problemId: parts[1] }
  if (parts[0] === 'draft-editor' && parts[1] && parts[2]) return { name: 'draft-editor', wallId: parts[1], layoutId: parts[2] }
  if (parts[0] === 'problem-editor' && parts[1] && parts[2]) return { name: 'problem-editor', wallId: parts[1], layoutId: parts[2] }
  return { name: 'browse' }
}
```

`PreviewStore` 持有 `session`、`state.route`、`state.device`、`state.dialog`、`state.toast`，并提供 `subscribe(listener)`、`navigate(route)`、`setDevice(device)`、`createWall(input)`、`requestWallDeletion(id)` 和 `confirmDialog()`。`confirmDialog()` 对第 1 次确认只升级 `step`，第 2 次确认调用 `session.deleteWall()`、关闭弹窗、导航到 `me` 并设置成功 toast。每个变更都通过 `emit()` 重新渲染。

- [ ] **Step 4: 运行状态测试**

Run: `npm test -- tests/dev-preview-store.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交路由和状态容器**

```bash
git add dev-preview/src/routes.ts dev-preview/src/preview-store.ts tests/dev-preview-store.test.ts
git commit -m "feat: add interactive preview state and routes"
```

### Task 4: 构建设备壳、通用组件和线路/创建/我的三大入口

**Files:**
- Create: `dev-preview/src/app-shell.ts`
- Create: `dev-preview/src/components/dialog.ts`
- Create: `dev-preview/src/components/wall-visual.ts`
- Create: `dev-preview/src/pages/browse-page.ts`
- Create: `dev-preview/src/pages/create-page.ts`
- Create: `dev-preview/src/pages/me-page.ts`
- Create: `dev-preview/src/styles/shell.css`
- Create: `dev-preview/src/styles/pages.css`
- Modify: `dev-preview/src/main.ts`
- Test: `tests/dev-preview-routable.test.ts`

- [ ] **Step 1: 写出失败的可定线门槛测试**

```ts
// tests/dev-preview-routable.test.ts
import { describe, expect, it } from 'vitest'
import { PreviewSession } from '../dev-preview/src/data/preview-session.js'
import { listRoutableLayouts } from '../dev-preview/src/data/preview-repository.js'

describe('listRoutableLayouts', () => {
  it('excludes unpublished zero-hold drafts from the route editor', async () => {
    const session = new PreviewSession()
    const mine = await session.listMyWalls()
    const routable = await listRoutableLayouts(session, mine)
    expect(routable.some(item => item.layout.name === '2026-08 本地草稿')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `npm test -- tests/dev-preview-routable.test.ts`

Expected: FAIL，因为 `listRoutableLayouts` 尚未定义。

- [ ] **Step 3: 实现三入口和通用 UI**

在数据适配层增加 `listRoutableLayouts(session, walls)`，对每个墙面读取 active Layout，并用既有 `isRoutableWall` 过滤。

`app-shell.ts` 负责：设备选择、模拟状态栏/导航栏、页面内容容器、TabBar、安全区和 toast。TabBar 必须只包含 `线路`、`创建`、`我的`，并调用 `store.navigate()`。

`browse-page.ts` 必须先显示可浏览墙面卡片；点击卡片进入墙面页，不能在未选择墙面/Layout 时直接展示线路列表。`create-page.ts` 必须包含“新建墙面”“我的草稿”“新建线路”三部分；“新建线路”只显示 `listRoutableLayouts` 的结果。`me-page.ts` 只显示状态和删除入口，不显示继续标注入口。删除组件调用 store 的两次确认 API。

墙面视觉组件必须使用真实墙面字段、Layout 发布状态、岩点数量与可访问标签；不能用伪造的固定文案替代数据。

- [ ] **Step 4: 运行入口测试和构建**

Run: `npm test -- tests/dev-preview-routable.test.ts && npm run preview:build`

Expected: PASS；预览器成功构建。

- [ ] **Step 5: 提交入口页面**

```bash
git add dev-preview/src tests/dev-preview-routable.test.ts
git commit -m "feat: add preview shell and primary navigation"
```

### Task 5: 实现墙面浏览、草稿标注和设置线路的交互镜像

**Files:**
- Create: `dev-preview/src/components/hold-canvas.ts`
- Create: `dev-preview/src/pages/wall-page.ts`
- Create: `dev-preview/src/pages/draft-editor-page.ts`
- Create: `dev-preview/src/pages/problem-editor-page.ts`
- Create: `dev-preview/src/pages/problem-detail-page.ts`
- Modify: `dev-preview/src/preview-store.ts`
- Test: `tests/dev-preview-route-editor.test.ts`

- [ ] **Step 1: 写出失败的发布后锁定与线路保存测试**

```ts
// tests/dev-preview-route-editor.test.ts
import { describe, expect, it } from 'vitest'
import { PreviewStore } from '../dev-preview/src/preview-store.js'

describe('preview route workflow', () => {
  it('publishes a draft with two holds, then permits saving a route', async () => {
    const store = new PreviewStore()
    const wall = (await store.session.listMyWalls())[0]
    const layout = (await store.session.listLayouts(wall.id))[0]
    await store.publishDraft(wall.id, layout.id, [
      { id: 'H001', x: 0.2, y: 0.2, radius: 0.02, kind: 'hold' },
      { id: 'H002', x: 0.8, y: 0.8, radius: 0.02, kind: 'hold' },
    ])
    const result = await store.saveProblem(wall.id, layout.id, {
      grade: 'V2', angle: 30, footRule: 'feet_follow',
      holds: { start: ['H001'], foot: [], hand: [], assist: [], finish: ['H002'] },
    })
    expect(result.number).toMatch(/^CS-/)
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `npm test -- tests/dev-preview-route-editor.test.ts`

Expected: FAIL，因为 `publishDraft` 与 `saveProblem` 尚未定义。

- [ ] **Step 3: 增加工作流操作并构建页面**

`hold-canvas.ts` 用相对坐标的 SVG/HTML 画布呈现图片、岩点、角色颜色和选中态；点击空白处在草稿模式新建圆形 Hold，点击现有 Hold 选中或为当前线路角色切换选中。禁止用 Canvas API，使预览更易截图、检查和测试。

`PreviewStore` 增加：

```ts
publishDraft(wallId: string, layoutId: string, holds: Hold[]): Promise<Layout>
saveProblem(wallId: string, layoutId: string, draft: Partial<Problem>): Promise<{ id: string; number: string }>
deleteLayoutWithConfirmation(wallId: string, layoutId: string): void
```

`publishDraft` 调用 session 后刷新并导航到墙面；已发布 Layout 页面显示“已锁定，不支持继续标注”。`saveProblem` 必须依赖 `MockRepository.createProblem()` 已有的 `LAYOUT_NOT_ROUTABLE` 校验，成功后进入线路详情。

`wall-page.ts` 按先 Layout 后线路的顺序显示；支持角度、难度、编号/名称搜索和用既有 `RandomSession` 随机浏览。`problem-editor-page.ts` 提供角色、脚点规则、名称、难度和保存操作，默认 `feet_follow`。`problem-detail-page.ts` 显示线路画布、规则以及上一条/下一条和随机入口。

- [ ] **Step 4: 运行工作流测试与构建**

Run: `npm test -- tests/dev-preview-route-editor.test.ts && npm run preview:build`

Expected: PASS；发布后的 Layout 能保存线路，未发布草稿不能进入设置线路。

- [ ] **Step 5: 提交主要交互流程**

```bash
git add dev-preview/src tests/dev-preview-route-editor.test.ts
git commit -m "feat: add interactive preview route workflows"
```

### Task 6: 完成视觉核验、开发文档和全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `dev-preview/src/styles/tokens.css`
- Modify: `dev-preview/src/styles/shell.css`
- Modify: `dev-preview/src/styles/pages.css`
- Test: `tests/dev-preview-routes.test.ts`

- [ ] **Step 1: 写出失败的 URL 路由往返测试**

```ts
// tests/dev-preview-routes.test.ts
import { describe, expect, it } from 'vitest'
import { fromPreviewUrl, toPreviewUrl } from '../dev-preview/src/routes.js'

describe('preview URLs', () => {
  it('round trips a problem editor route', () => {
    const route = { name: 'problem-editor', wallId: 'wall_1', layoutId: 'layout_1' } as const
    expect(fromPreviewUrl(new URL(toPreviewUrl(route), 'http://localhost:5173'))).toEqual(route)
  })
})
```

- [ ] **Step 2: 运行测试，确认它失败或补齐缺失分支**

Run: `npm test -- tests/dev-preview-routes.test.ts`

Expected: 先 FAIL（如果 URL 编解码尚未完整）；完成实现后 PASS。

- [ ] **Step 3: 完成视觉与使用文档**

在 `README.md` 加入“浏览器开发预览”小节，提供：

```bash
npm run preview
```

并说明打开 `http://localhost:5173`、预览器使用可重置 Mock 数据、最终仍须在微信开发者工具中验收。更新 `docs/IMPLEMENTATION_PLAN.md` 的当前状态，将本功能列为“开发体验：高保真浏览器预览器”。

在样式中实现以下设备尺寸：iPhone 16 Pro `402×874`、iPhone SE `375×667`、Pixel `412×915` 和自定义宽高；切换后导航栏、TabBar 和内容区域均没有溢出。对所有按钮、输入、弹窗焦点态加入可见 keyboard focus 样式。

- [ ] **Step 4: 运行全量自动验证**

Run: `npm test && npm run build && npm run preview:build && npm run verify:phase1 -- --release`

Expected: Vitest 全部通过；两个 TypeScript 编译通过；预览器构建通过；Phase 1 校验通过。

- [ ] **Step 5: 手动视觉检查**

Run: `npm run preview`

在浏览器逐一检查 iPhone 16 Pro、iPhone SE、Pixel：

1. 线路页先显示墙面，选择 Layout 后才显示线路。
2. 创建页的草稿能发布，发布后显示锁定状态。
3. 从新建线路保存后能进入线路详情。
4. 我的页只有状态/删除，删除走两次确认。
5. 所有页面的 TabBar 未被内容遮挡。

- [ ] **Step 6: 提交文档与最终视觉修订**

```bash
git add README.md docs/IMPLEMENTATION_PLAN.md dev-preview tests/dev-preview-routes.test.ts
git commit -m "docs: document interactive development preview"
```

## 计划自检

- 规格中的浏览、创建、草稿发布、定线、删除、设备切换、错误边界和最终验收均被 Task 1–6 覆盖。
- 预览器只导入领域类型与 Mock Repository，未在任何任务中导入 `wx` service。
- 可定线门槛、发布锁定、随机队列和两次确认删除均沿用或直接测试现有业务规则。
- 所有新增行为在实现前都有明确的失败测试和精确命令；没有待定步骤。
