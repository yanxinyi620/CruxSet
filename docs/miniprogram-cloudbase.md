# 微信小程序 CloudBase

小程序是独立的移动端运行形态：`wechat/miniprogram/` 通过 CloudBase 云函数访问 CloudBase 数据库和私有 Storage，不依赖本地 FastAPI、SQLite 或 Cloudflare Workers。

## 能力

用户可浏览、筛选、连续查看与全屏预览线路，创建/编辑/删除自己的线路，修改昵称，管理自己拥有的墙面。管理员可上传图片、创建私有草稿、手动或轻量自动标注岩点、发布墙面，并通过管理中心查看全站墙面与用户。小程序不提供分割实验台、模型任务、实验台授权/额度和跨平台审核。

## 部署

1. 在微信开发者工具中导入 `wechat/`，不要导入仓库根目录。
2. 创建 `users`、`walls`、`problems`、`admins`、`counters`、`segmentationPublishes`、`storageUploads`、`adminUploads`、`wallDeletionJobs` 集合，并导入 `config/cloudbase.collections.json` 和 `config/cloudbase.rules.json`。
3. 部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`updateProblem`、`deleteProblem`、`getWallImageUrl`、`storageUpload`、`segmentationPublish` 九个云函数。`storageUpload` 与 `adminWall` 必须安装各自 `package.json` 中的全部依赖。
   - `wallManager` 的执行超时设为 **20 秒**，不要使用默认 3 秒；墙面列表涉及身份校验、墙面读取和线路计数，冷启动或数据库波动可能超过 3 秒。后续重新部署须保留此设置。2026-09-13 已在环境 `cloud1-d0g8toggn7735e61e` 更新。
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

使用本地实验台登录的管理员选择配置好的 `cloudbase` 目标；普通本地创作者不具备跨平台发布权限，云端实验台只发布当前 Cloudflare 站点。实验台的 `cloudbase` 目标只写入 CloudBase。发布目标需要分别选择；所有发布都创建新的公开 Wall，不会同步或覆盖其他运行形态的数据。

Cloudflare 的实验台授权和数量额度不适用于小程序账户。小程序与 Web 一样，所有者或管理员确认删除墙面后，会清理所有关联线路和不再被其他墙面引用的图片。普通用户不会因此获得墙面创建权限。

## 验收

按 [测试与验收](testing.md) 的“小程序：CloudBase”与“分割实验台发布验收”执行真机检查。

## 新建、标注与管理

- 管理员进入“创建 → 新建墙面”，选择相册图片或拍照，输入名称后创建私有草稿。图片经画布转换为 JPEG，最长边 2400，上传文件上限 2 MiB；过大图片会提示重新选择。PNG/WebP 来源也先转换，上传接口仅接受经过验证的 PNG/JPEG。
- “创建 → 标注岩点”进入自己的草稿，支持添加、移动（先选岩点再点击新位置）、删除、撤销/恢复、清空、保存。轻量自动识别使用与 Web 相同的像素算法，以最长边 640 分析，不调用 AI 模型。自动结果可撤销和人工修正。
- 至少两个有效岩点才能发布；发布后墙图和几何锁定，可立即浏览与定线。
- “我的 → 我的墙面”只显示本人墙面；“管理中心”仅管理员可用，展示全站墙面和用户的必要资料。微信 OpenID/UnionID 不展示；不新增邮箱登录或账号绑定。
- 删除需确认关联线路数量。大批量删除尚未完成时保留“继续删除”，失败的图片清理可由管理员点击“重试待清理图片”；该动作也回收 24 小时过期、未关联墙面的上传。无需把 Storage 改为公开。
- 小程序通过 `getWallImageUrl` 获取授权短期地址，再下载到临时文件以供跨页面缓存。发布环境须把返回图片域名配置为微信下载合法域名；缓存按用户/文件隔离，过期或本地文件失效会重新获取。

更新云函数与集合配置后再发布小程序，防止新页面调用旧的停用接口。数据库事务遵循 CloudBase 的[单文档操作与数量限制](https://docs.cloudbase.net/database/transaction)，历史编号以分批方式补齐，新写入使用持久计数器。
