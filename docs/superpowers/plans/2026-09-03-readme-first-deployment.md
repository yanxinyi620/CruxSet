# README First-Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder README so a first-time maintainer can deploy CruxSet in operational sequence without duplicated startup instructions.

**Architecture:** Keep README as the concise entry point. Put setup and launch steps before CloudBase and mini-program deployment, then describe calibrated-wall publishing and link detailed operations to `docs/`.

**Tech Stack:** Markdown, Git.

---

### Task 1: Rebuild README around the first-deployment path

**Files:**

- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-09-03-readme-first-deployment-design.md`

- [ ] **Step 1: Snapshot headings and links**

Run `rg -n '^##|^###|\\]\\(' README.md`. Expected: current sections for overview, development, mini-program, CloudBase, rules, and publishing.

- [ ] **Step 2: Move content into the approved sequence**

Use this heading order:

```markdown
## 文档
## 1. 快速验证
## 2. 启动本地工作台
### 管理员账户初始化
### 手动启动（排查用）
## 3. 部署小程序与 CloudBase
## 4. 发布校准墙面并验收
## 参考
### 核心规则
### 目录概览
```

Keep `scripts/cruxset-dev` as the recommended startup path. Move three-terminal commands under the local-workbench section and remove duplicate API/Web commands. Keep collections, functions, private Storage, HTTP gateway, and `/etc/cruxset.env` together.

- [ ] **Step 3: Make the publication path explicit**

State that the experiment lab uploads the original image and full signed calibration JSON to private Storage, then `segmentationPublish` receives only `payloadFileId`, downloads and verifies JSON, and creates the public wall.

- [ ] **Step 4: Verify**

Run `git diff --check` and `rg -n 'runtimeMode|storageUpload|segmentationPublish|payloadFileId|cruxset-dev' README.md`. Expected: no whitespace errors and all deployment-critical terms remain.

- [ ] **Step 5: Commit**

Run `git add README.md && git commit -m "docs: reorganize README for first deployment"`.

### Task 2: Verify linked deployment references

**Files:**

- Verify: `README.md`, `docs/reference.md`, `docs/testing.md`, `docs/wsl-cloudflare-tunnel.md`

- [ ] **Step 1: Check local document targets**

Run `test -f docs/reference.md && test -f docs/testing.md && test -f docs/wsl-cloudflare-tunnel.md && test -f tools/segmentation-lab/README.md`. Expected: exit code 0.

- [ ] **Step 2: Check publication terminology**

Run `rg -n 'payloadFileId|完整.*JSON|100 KB|100KB|storageUpload|segmentationPublish' README.md docs/*.md tools/segmentation-lab/README.md`. Expected: all documents describe the same direct-Storage JSON flow and do not require polygon simplification.
