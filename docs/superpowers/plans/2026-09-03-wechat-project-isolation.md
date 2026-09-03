# 微信小程序项目隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微信小程序与 CloudBase 云函数迁入独立 `wechat/` 目录，使微信开发者工具不再扫描根仓库的大型非小程序文件。

**Architecture:** `wechat/project.config.json` 是开发者工具唯一入口，项目内包含 `miniprogram/` 与 `cloudfunctions/`。根目录继续保存 Web、FastAPI、实验台和 Node 验证；根脚本改为指向新小程序 TypeScript 配置。

**Tech Stack:** 微信原生小程序、CloudBase Node 云函数、TypeScript、npm、Vitest。

---

### Task 1: 迁移微信项目文件

**Files:**
- Create: `wechat/project.config.json`
- Create: `wechat/project.private.config.json`
- Move: `miniprogram/` → `wechat/miniprogram/`
- Move: `cloudfunctions/` → `wechat/cloudfunctions/`
- Delete: 根目录 `project.config.json`、`project.private.config.json`

- [ ] **Step 1: 检查迁移前的配置入口**

Run: `test -f project.config.json && test -d miniprogram && test -d cloudfunctions`

Expected: exit code 0。

- [ ] **Step 2: 执行目录移动并调整开发者工具根配置**

将两个目录移入 `wechat/`，并把原根目录项目配置移动到 `wechat/`。`wechat/project.config.json` 保持：

```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "compileType": "miniprogram"
}
```

- [ ] **Step 3: 验证隔离边界**

Run: `test -f wechat/project.config.json && test -d wechat/miniprogram && test -d wechat/cloudfunctions && test ! -e project.config.json`

Expected: exit code 0。

- [ ] **Step 4: Commit**

```bash
git add -A wechat miniprogram cloudfunctions project.config.json project.private.config.json
git commit -m "refactor: isolate WeChat developer project"
```

### Task 2: 更新构建、验证与文档入口

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-phase1.mjs`
- Modify: `README.md`
- Modify: `docs/reference.md`
- Modify: `docs/testing.md`
- Modify: `docs/wsl-cloudflare-tunnel.md`
- Modify: `tools/segmentation-lab/README.md`

- [ ] **Step 1: 查找旧路径引用**

Run: `rg -n 'miniprogram/|cloudfunctions/|project\.config\.json' --glob '!node_modules/**'`

Expected: 列出根脚本、文档和验证器中需要改为 `wechat/` 的引用。

- [ ] **Step 2: 更新根构建入口**

将 `package.json` 的构建命令改为：

```json
"build": "tsc --noEmit && tsc -p wechat/miniprogram/tsconfig.json --noEmit"
```

- [ ] **Step 3: 更新验证器和文档**

验证器使用 `wechat/miniprogram`、`wechat/cloudfunctions` 和 `wechat/project.config.json`；文档明确说明微信开发者工具应导入 `wechat/`，而不是仓库根目录。

- [ ] **Step 4: 运行验证**

Run: `npm run build && npm test && npm run verify:phase1 && git diff --check`

Expected: 全部成功。

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-phase1.mjs README.md docs tools/segmentation-lab/README.md
git commit -m "docs: point WeChat setup to isolated project"
```
