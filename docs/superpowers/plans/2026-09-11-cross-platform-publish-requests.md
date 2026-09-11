# Cross-platform publish requests implementation plan

**Goal:** 在现有实验台内提交和审核跨平台发布申请。

**Architecture:** 本地文件快照与独立申请存储，云端 D1 状态与 R2 快照；复用各自现有发布器。共享页面通过同一接口处理确认、列表与审核。开发继续使用用户指定的 cloudflare 分支。

**Tech Stack:** FastAPI/Python、Cloudflare Workers/D1/R2、现有 HTML/JavaScript、pytest/Vitest。

- [x] 本地后端：在独立 publish_requests 模块中保存快照、实现身份过滤/审核/重试；接入 api.py；先写隔离、403、快照、重复审核与发布归属测试。
- [x] 云端后端：增加 0012 申请迁移、申请路由及 CloudBase 服务端发布适配；先写权限、快照、目标、幂等和失败重试测试。独立快照位于 publish-requests 前缀，不受实验删除清理影响。
- [x] 共享页面：保持发布按钮位置，按 requestTargets 决定确认申请或直接发布；说明前新增列表，安全渲染文本、状态、预览链接和管理员操作。刷新同步申请状态，避免重复点击。
- [x] 集成验证：检查两端接口一致性，运行全量 TypeScript/Python 测试、类型检查及本地/云端构建；复核创作者不可通过直接发布接口绕过审核，不得越权查看或审核。
- [x] 文档：说明本地/云端独立申请、部署迁移与云端 CloudBase 配置要求。不自动部署或发布真实墙面。

## 验证记录

- TypeScript 全量 289 项通过；复核后新增 3 项云端几何边界测试，相关 edge/UI 45 项通过。
- 本地 API 82 项、实验台 137 项 Python 测试通过。
- Web/小程序与 Worker 类型检查、本地及云端 Web 构建、Worker 部署预演通过。
- 浏览器使用模拟 API 完成创作者提交及管理员通过流程，确认列表位于说明上方；没有执行真实跨平台发布。
- 独立代码复核发现的云端几何预校验问题已修复并复核通过。
- 2026-09-11 按用户要求应用生产迁移 0012，同步本地实验台已有四项 CloudBase 配置至 Worker secrets，并部署版本 `e3c06f84-f25c-4614-8d17-8299c6bfed14`。配置值未输出或写入仓库；没有执行真实发布。
