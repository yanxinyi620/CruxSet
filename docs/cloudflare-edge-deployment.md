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

`DB` 是 Worker 的必需 D1 绑定。未绑定时，`/api/v1/bootstrap` 会返回 `503 SERVICE_UNAVAILABLE`，应用不能作为可用的 Cloudflare Web 站点运行。`edge/wrangler.jsonc` 同时将 R2 桶 `cruxset-media` 绑定为 `MEDIA`；没有该绑定时，管理员图片上传不可用，受签名的分割发布也不能完成。

## 配置与部署

在仓库根目录完成 Cloudflare 登录，并确认 `edge/wrangler.jsonc` 中的 D1 `DB`、R2 `MEDIA`、域名路由和 `web/dist` 静态资源配置适用于目标账户与环境。首次部署需要创建 D1 数据库和 R2 桶，将创建得到的 D1 数据库 ID 写入该配置，并为分割发布设置密钥：

```bash
wrangler login
wrangler d1 create cruxset-db
wrangler r2 bucket create cruxset-media
wrangler secret put SEGMENTATION_PUBLISH_KEY --config edge/wrangler.jsonc
```

构建前端、应用 D1 迁移并部署 Worker：

```bash
npm run web:build
wrangler d1 migrations apply cruxset-db --remote --config edge/wrangler.jsonc
wrangler deploy --config edge/wrangler.jsonc
```

生产数据库 ID、域名路由和 `SEGMENTATION_PUBLISH_KEY` 是部署环境配置。不要把密钥写入仓库或前端构建产物。部署后应验证公开浏览、注册/登录、线路写入，以及具备管理员账户和 `MEDIA` 绑定时的图片上传与墙面发布；浏览器不承担 AI 推理，分割结果由实验台签名后提交给 Worker。
