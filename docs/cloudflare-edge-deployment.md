# Cloudflare 静态边缘部署

本文描述尚在开发中的免费边缘部署。它不要求开通 R2，也不替代小程序 CloudBase。

| 能力 | 本机工作台 | 边缘站点 |
| --- | --- | --- |
| 公开墙与展示图浏览 | 是 | 是 |
| 线路浏览与编辑 | 是 | 认证迁移完成后启用 |
| 新建墙、图片上传、岩点标注 | 是 | 否 |
| SAM/YOLO、图像处理 | 是 | 否 |
| 私有草稿与原图 | 是 | 否 |

公开图片由 `server/scripts/export_edge_snapshot.py` 从受控本地媒体目录导出。它只处理已发布的公开墙，将展示图复制为内容哈希文件，并写入 `.runtime/edge-public/manifest.json`；该目录不提交版本库。导出不会读取或输出账户密码、管理员记录、私有墙和私有问题。

部署时先构建静态资源和图片，再验证静态图片可用，最后登记墙元数据到 D1。静态资源与 D1 不是同一个事务：静态部署失败时不得写入墙元数据；D1 失败时可留下未引用图片，但不能发布缺图墙。后续发布必须保留线上仍被引用的哈希图片。

上线写入前必须完成认证可行性验证。当前本地 Argon2 登录不能直接假定适用于免费 Worker；在此之前，边缘站点只提供公开只读能力。

当前 Worker 已实现 `GET /api/v1/walls`、`GET /api/v1/problems` 和只读 `GET /api/v1/bootstrap`。墙面和线路接口都支持 `limit`（默认 20，最大 50）和 `cursor` 游标；线路接口还支持 `wallId` 筛选。Bootstrap 会返回公开数据和 `readOnly` 能力标记。没有绑定 D1 时接口会返回 `503 SERVICE_UNAVAILABLE`，不会回退到静态页面。

连接真实 Cloudflare 环境前，需要在本机完成 `wrangler login`，再创建 D1 数据库并将数据库绑定命名为 `DB`。数据库 ID 和生产域名属于部署环境配置，不写入仓库；完成绑定后先执行 `wrangler d1 migrations apply <database> --remote`，再进行 Worker 部署。当前开发阶段不执行登录、创建数据库或远端迁移。
