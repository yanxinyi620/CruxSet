# 2026-09-14 实验台刷新与申请删除上线

- 功能提交：`b0d6187`，已推送至 `origin/cloudflare`。
- 本地和云端实验台按状态轮询、后台暂停、失败退避；运行任务每 5 秒、待审核申请每 30 秒、空闲列表每 60 秒更新。
- 已发布和已拒绝申请可由管理员或申请者删除，从双方列表移除，保留重复发布防护与目标墙面。墙面编号移至“已发布”悬浮提示。
- 发布前验证：91 个测试文件、531 项测试；26 项本地 Python 发布测试；仓库和 Edge 类型检查；本地和云端 Web 构建均通过。

## Cloudflare

- Worker：`cruxset-edge`。
- 版本：`dbeb19db-bd45-4761-b905-76764d8b2d78`。
- 生产地址：https://cruxset.xinyilab.top。
- 已按顺序应用远端 D1 迁移 `0015_wall_update_order.sql` 和 `0016_lab_publish_request_deletion.sql`。
- 首页、我的墙面入口、实验台页面、健康接口和 bootstrap 均返回 200；健康状态为 `ok`，bootstrap 返回有效 JSON。
- 线上实验台 index.html 和 runtime.js 与本次云端构建逐字节一致。
- 未登录读取发布申请返回预期的 401。权限与实际删除行为由本地/云端自动化测试验证；上线检查未修改真实用户数据。
