# 三种运行形态文档更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让项目入口、架构参考、Cloudflare 部署说明和验收清单一致准确地描述当前的小程序 CloudBase、本地 Web 与 Cloudflare Web 三种运行形态。

**Architecture:** README 提供维护者首次接触项目时的总览；`docs/reference.md` 说明数据边界与发布目标；Cloudflare 文档记录 Workers/D1/R2 的已实现能力；验收文档把每种运行形态的实际边界转成可执行检查项。文档以 `wechat/miniprogram/config/runtime.ts`、`edge/src/index.ts`、`edge/wrangler.jsonc` 和 Web 能力协商为唯一事实来源。

**Tech Stack:** Markdown、Vite Web、FastAPI/SQLite、微信 CloudBase、Cloudflare Workers/D1/R2、ripgrep。

---

### Task 1: 建立入口页的三形态总览

**Files:**
- Modify: `README.md:3-17`
- Test: `README.md` 的内部链接和形态说明

- [ ] **Step 1: 替换简介后的双分支架构图**

将当前仅显示“本地 Web → CloudBase”的图替换为三个并列路径：

```text
小程序 → CloudBase 云函数 → CloudBase 数据库 + 私有 Storage
本地 Web → FastAPI → SQLite + 本地媒体
Cloudflare Web → Workers → D1 + R2（配置 MEDIA 时）
```

- [ ] **Step 2: 增加“当前三种运行形态”表格**

在架构图后加入小程序 CloudBase、本地 Web、Cloudflare Web 三行，明确每行的入口、持久化位置和主要能力；注明 Mock 是小程序的离线演示设置，Tunnel 只是本地 Web 的公网入口。

- [ ] **Step 3: 写明数据隔离和发布目标**

说明三个存储系统不自动同步；实验台的 `web`、`cloudbase`、`cloudflare` 和 `both` 是显式目标，且每个目标独立成功或失败。

- [ ] **Step 4: 验证入口页内容**

Run: `rg -n '当前三种运行形态|Mock|Tunnel|Cloudflare Web' README.md`

Expected: 三种形态、Mock 和 Tunnel 的定位均可检索到。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe runtime forms in readme"
```

### Task 2: 更新架构参考和实验台发布说明

**Files:**
- Modify: `docs/reference.md:3-17`
- Modify: `tools/segmentation-lab/README.md:5,38,85`
- Test: `docs/reference.md` 与实验台 README 中的目标名

- [ ] **Step 1: 将架构图扩展为三条数据路径**

在 `docs/reference.md` 的“架构与边界”中加入 Cloudflare Web → Workers → D1/R2，同时保留小程序与本地 Web 的独立路径。

- [ ] **Step 2: 增加三种数据集的隔离说明**

明确 SQLite、本机媒体、CloudBase 数据库/私有 Storage、D1/R2 互不自动同步；Wall、Hold、Problem 仅共享字段语义。保留小程序不能调用 FastAPI 的约束。

- [ ] **Step 3: 更新实验台目标说明**

将实验台 README 的目标列表扩展为 `web`、`cloudbase`、`cloudflare`、`both`，注明 Cloudflare 发布需要 Workers 的 D1、R2 和 `SEGMENTATION_PUBLISH_KEY` 已配置，且只创建新的公开 Wall。

- [ ] **Step 4: 验证目标名称一致性**

Run: `rg -n 'cloudflare|Cloudflare|web|cloudbase|both' docs/reference.md tools/segmentation-lab/README.md`

Expected: 两份文件均说明 Cloudflare 是显式发布目标，并保留 Web、CloudBase、both 的含义。

- [ ] **Step 5: Commit**

```bash
git add docs/reference.md tools/segmentation-lab/README.md
git commit -m "docs: clarify runtime data boundaries"
```

### Task 3: 以 Worker 实际能力重写 Cloudflare 部署说明

**Files:**
- Modify: `docs/cloudflare-edge-deployment.md:1-21`
- Test: `edge/src/index.ts:113-141` 与文档的能力对照

- [ ] **Step 1: 修正前置条件和能力表**

删除“无需 R2”“认证尚未迁移”“仅公开只读”的历史描述。表格列出公开浏览、账户和线路写入、管理员墙面创作、受签名实验台发布、浏览器内 AI 任务；对管理员墙面创作标注 R2 `MEDIA` 绑定是前提，AI 任务标为不可用。

- [ ] **Step 2: 列出当前 API 和绑定的运行事实**

说明 D1 未绑定时 API 返回 `503`；`bootstrap` 返回 `readOnly: false`、写入与认证能力；Workers 负责注册、登录、资料、线路和管理员墙面操作，R2 负责图片。说明部署需要构建 `web/dist`、D1 迁移、D1 绑定与 R2 `MEDIA` 绑定。

- [ ] **Step 3: 写明 Cloudflare 与其他形态的关系**

明确它不替代小程序 CloudBase；它和本地 Web 共用 Vite 前端但使用独立后端与数据集；Cloudflare Tunnel 不属于此部署形态。

- [ ] **Step 4: 验证过时断言已移除**

Run: `rg -n '仅.*只读|认证.*未|不要求开通 R2|新建墙.*否' docs/cloudflare-edge-deployment.md`

Expected: 无匹配；如存在匹配，只能是在历史背景而非当前能力陈述。

- [ ] **Step 5: Commit**

```bash
git add docs/cloudflare-edge-deployment.md
git commit -m "docs: align edge deployment with worker capabilities"
```

### Task 4: 按三种形态整理验收清单并完成文档验证

**Files:**
- Modify: `docs/testing.md:21-52`
- Test: 四份文档的标题、链接和过时表述扫描

- [ ] **Step 1: 保留并标注小程序 Mock 的定位**

将当前“本地 Web”“小程序 Mock”“CloudBase 与真机”段落调整为：本地 Web、小程序 CloudBase（含 Mock 演示说明）、Cloudflare Web。Mock 的检查保留在小程序段落内，明确它不是一种部署形态。

- [ ] **Step 2: 增加 Cloudflare Web 验收项**

加入 D1 可用时的公开浏览、注册/登录、创建/修改/删除个人线路；管理员在 `MEDIA` 存在时上传图片、创建私有 Wall、保存岩点并发布；无 `MEDIA` 时界面不得开放图片与墙面创作；浏览器内不得出现 AI 作业入口。

- [ ] **Step 3: 更新分割实验台验收项**

保留 Web、CloudBase、both 的独立结果检查，并增加 Cloudflare 发布配置完成后的独立结果检查；说明实验台发布不会同步三个数据集。

- [ ] **Step 4: 运行文档一致性检查**

Run: `rg -n '仅.*只读|认证.*未|不要求开通 R2|新建墙.*否' README.md docs/reference.md docs/testing.md docs/cloudflare-edge-deployment.md tools/segmentation-lab/README.md; rg -n '^#|^##|^###' README.md docs/reference.md docs/testing.md docs/cloudflare-edge-deployment.md tools/segmentation-lab/README.md`

Expected: 第一条命令没有当前能力的过时陈述；第二条命令列出各文件层次清晰的标题。

- [ ] **Step 5: Commit**

```bash
git add docs/testing.md
git commit -m "docs: add runtime-form acceptance checks"
```
