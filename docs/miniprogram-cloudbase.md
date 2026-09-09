# 微信小程序 CloudBase

小程序是独立的移动端运行形态：`wechat/miniprogram/` 通过 CloudBase 云函数访问 CloudBase 数据库和私有 Storage，不依赖本地 FastAPI、SQLite 或 Cloudflare Workers。

## 能力

用户可浏览公开墙面、创建/编辑/删除自己的线路。管理员可管理符合删除条件的墙面。小程序不提供墙面创建、图片上传、岩点标注或 AI 处理。

## 部署

1. 在微信开发者工具中导入 `wechat/`，不要导入仓库根目录。
2. 创建 `users`、`walls`、`problems`、`admins`、`counters`、`segmentationPublishes` 集合，并导入 `config/cloudbase.collections.json` 和 `config/cloudbase.rules.json`。
3. 部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`updateProblem`、`deleteProblem`、`getWallImageUrl`、`storageUpload`、`segmentationPublish` 九个云函数。`storageUpload` 需要安装其 `package.json` 中的依赖。
4. 将 Storage 设置为私有；通过 `getWallImageUrl` 发放墙图短期访问地址。
5. 为 `storageUpload` 与 `segmentationPublish` 配置相同的签名密钥，并将两个 HTTP 路由设为 `POST`、关闭网关身份认证。

## 启动与发布墙面

在微信开发者工具中编译小程序即可。人工校准墙面由分割实验台发布到 CloudBase；启动实验台前，在 `/etc/cruxset.env` 配置：

```bash
CRUXSET_CLOUDBASE_STORAGE_URL='https://<环境域名>/api/storage-upload'
CRUXSET_CLOUDBASE_FUNCTION_URL='https://<环境域名>/api/segmentation-publish'
CRUXSET_CLOUDBASE_SIGNING_KEY='<与云函数相同的随机密钥>'
CRUXSET_CLOUDBASE_OWNER_OPENID='<CloudBase 管理员 OpenID>'
```

实验台的 `cloudbase` 目标只写入 CloudBase；`both` 会在本地 Web 发布完成后再发布到 CloudBase。所有发布都创建新的公开 Wall，不会同步或覆盖其他运行形态的数据。

## 验收

按 [测试与验收](testing.md) 的“小程序：CloudBase”与“分割实验台发布验收”执行真机检查。
