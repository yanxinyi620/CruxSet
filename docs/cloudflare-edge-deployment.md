# Cloudflare Edge 部署

Cloudflare Web 是 CruxSet 的第三种 Web 运行形态：它由 Workers 提供 API，并以同一份 `web/dist` 提供前端资源。它使用独立的 D1 和 R2 数据；这些数据不会与本地 Web 的 SQLite/本地媒体，或小程序的 CloudBase 数据库与 Storage 自动同步。Cloudflare Tunnel 只把本地 Web 暴露到公网，并不是此部署方式的一部分，也不把本地 FastAPI 或 SQLite 迁移到 Workers。

| 能力 | Cloudflare Web |
| --- | --- |
| 公开墙面、岩点与线路浏览 | 是 |
| 注册、登录、查看及更新个人资料 | 是 |
| 创建、编辑与删除自己的线路 | 是 |
| 管理员上传图片、创建私有墙面、保存岩点、发布墙面 | 是；需要 R2 `MEDIA` 绑定 |
| 管理员删除自己创建的墙面 | 是；同时删除其关联线路与 R2 图片 |
| 分割实验台发布 | 是；请求须使用 `SEGMENTATION_PUBLISH_KEY` 的签名，且需要 D1 与 R2 |
| 浏览器内运行 SAM、YOLO 或其他 AI 任务 | 否 |

管理员和获授权的创作者可以使用共享 Web 账户的[云端分割实验台](./segmentation-cloud.md)。Worker 只负责私有任务、D1/R2 元数据和发布；模型运行在 GitHub Actions 中，不改变本地实验台的启动方式。云端链路的 GitHub 配置、任务时限和私有对象规则见该文档。

`DB` 是 Worker 的必需 D1 绑定。未绑定时，`/api/v1/bootstrap` 会返回 `503 SERVICE_UNAVAILABLE`，应用不能作为可用的 Cloudflare Web 站点运行。`edge/wrangler.jsonc` 同时将 R2 桶 `cruxset-media` 绑定为 `MEDIA`；没有该绑定时，管理员图片上传不可用，受签名的分割发布也不能完成。

## 配置与部署

在仓库根目录完成 Cloudflare 登录，并确认 `edge/wrangler.jsonc` 中的 D1 `DB`、R2 `MEDIA`、域名路由和 `web/dist` 静态资源配置适用于目标账户与环境。首次部署需要创建 D1 数据库和 R2 桶，将创建得到的 D1 数据库 ID 写入该配置，并为分割发布设置密钥：

项目已将 Wrangler 安装为本地开发依赖。当前环境不要求全局安装 Wrangler，以下命令统一使用 `npx wrangler` 调用项目版本。

```bash
npx wrangler login
npx wrangler d1 create cruxset-db
npx wrangler r2 bucket create cruxset-media
npx wrangler secret put SEGMENTATION_PUBLISH_KEY --config edge/wrangler.jsonc
```

构建前端、应用 D1 迁移并部署 Worker：

```bash
npm run web:build
npx wrangler d1 migrations apply cruxset-db --remote --config edge/wrangler.jsonc
npx wrangler deploy --config edge/wrangler.jsonc
```

生产数据库 ID、域名路由和 `SEGMENTATION_PUBLISH_KEY` 是部署环境配置。不要把密钥写入仓库或前端构建产物。部署后应验证公开浏览、注册/登录、线路写入，以及具备管理员账户和 `MEDIA` 绑定时的图片上传与墙面发布；浏览器不承担 AI 推理，分割结果由实验台签名后提交给 Worker。

## 注册并升级为管理员

Cloudflare Edge 的注册入口只创建普通用户（`role='user'`），首个注册账户也不会自动成为管理员。管理员需要先在网站注册，再由具有目标 D1 数据库管理权限的维护者修改账户角色。

1. 打开已部署的网站，在登录页点击「注册」，填写邮箱、至少 8 位的密码以及确认密码，完成普通账户注册。
2. 在 Cloudflare 的 D1 控制台打开该 Worker 的 `DB` 绑定对应的数据库（当前配置为 `cruxset-db`）。将下面的 `admin@example.com` 替换为刚注册的邮箱，使用小写形式，然后执行：

   ```sql
   UPDATE admins
   SET role = 'admin',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
   WHERE email_normalized = 'admin@example.com';
   ```

3. 查询账户角色，确认返回的 `role` 为 `admin`：

   ```sql
   SELECT email_normalized, role
   FROM admins
   WHERE email_normalized = 'admin@example.com';
   ```

   如果没有返回记录，请确认账户已在该 Cloudflare 网站注册、邮箱填写正确，并且操作的是该部署使用的 D1 数据库。
4. 刷新网站以重新获取权限，或退出后重新登录。管理员上传墙图、创作和发布墙面还需要配置 R2 的 `MEDIA` 绑定。

Cloudflare D1 与本地 Web、CloudBase 的账户数据相互独立。在本地运行 `scripts/create_local_admin.py` 不会创建或升级 Cloudflare Edge 的管理员账户。

## 实验台授权

部署此版本前先应用 `0010_lab_access.sql` 数据库迁移，再部署 Worker 与 Web 资源。管理员在“我的 → 管理中心 → 用户”开通或撤销普通用户的实验台权限；授权自动包含公开发布自己的校准结果，不授予网站管理权限。

Web 与 `/segmentation-lab/` 使用同域 API 和登录会话。此前只在 `api` 子域持有登录会话的用户，需要在主域重新登录一次。开通权限后刷新“我的”即可看到实验台入口；撤销后下一次实验台 API 请求即被拒绝，保留已有数据和已发布墙面。
