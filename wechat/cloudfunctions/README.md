# CloudBase 云函数

这些目录是小程序业务入口，部署前需在微信开发者工具中为每个函数安装依赖并配置 CloudBase 环境。

- `login`：OPENID → `users.id`
- `saveProblem`：服务端校验并生成线路编号
- `updateProblem`：创建者更新线路；与 `saveProblem` 使用相同的名称/描述长度校验
- `deleteProblem`：创建者或管理员删除线路
- `storageUpload`：验证实验台签名元数据并返回 Storage 直传凭证；兼容旧的 multipart 图片上传
- `segmentationPublish`：接收分割实验台的签名 HTTP 发布请求，上传后的墙图文件 ID 与标准化岩点写入公开 Wall
- `adminWall`：管理员上传、创建私有草稿、保存岩点、公开发布与回收过期上传。上传需要 JPEG/PNG 解码依赖，部署时必须安装全部依赖。
- `wallManager`：公开墙面浏览；`listAdminWalls` 与 `deleteWall` 仅允许管理员调用。
- `getWallImageUrl`：按 Wall 的公开状态和拥有权换取墙图临时地址

云函数必须从数据库重新读取 Wall、User 和 Admin，不能信任客户端传入的权限或 Hold 数据。

错误码使用大写稳定字符串（如 `LOGIN_REQUIRED`、`FORBIDDEN`、`INVALID_HOLD_ID`），小程序端负责将错误码映射为用户可读提示。

部署 `storageUpload` 与 `segmentationPublish` 时，同时配置 `CRUXSET_CLOUDBASE_SIGNING_KEY`，并将其与实验台的 `CRUXSET_CLOUDBASE_SIGNING_KEY` 保持一致。`storageUpload` 只允许 HTTP `POST`，不接受小程序 `callFunction` 直接调用。实验台使用小 JSON 元数据请求（签名内容为按键排序的 canonical JSON `{contentLength,contentSha256,contentType,filename,timestamp}`），函数通过 `@cloudbase/node-sdk` 以当前云函数环境申请 Storage 凭证后返回 `{ fileID, uploadUrl, authorization, token, cloudObjectMeta, cloudPath }`；实验台再向 COS 的 `uploadUrl` 发出带 `Signature`、`x-cos-security-token`、`x-cos-meta-fileid` 和 URL 编码 `key` 的 `PUT` 上传，因此不会触发 HTTP 网关的小请求体限制。请在控制台部署时安装此函数 `package.json` 中的全部依赖。为兼容旧客户端，函数仍接受 multipart 上传（单文件上限 50 MiB，并校验图片魔数）。必须在 CloudBase 控制台将 Storage 权限设为私有（`wx-server-sdk` 的 `uploadFile` 不代替 ACL 设置）；客户端不直接读取 Storage，`getWallImageUrl` 是墙图唯一访问入口，部署验收必须确认这两项。

实验台先调用 `storageUpload` 获取直传凭证并上传原图，再以 `purpose: segmentation-payload` 获取第二份凭证并上传完整、已签名的校准 JSON；随后仅将该 JSON 的 `payloadFileId` 交给 `segmentationPublish`。后者从私有 Storage 下载 JSON、验证同名 HMAC 密钥后创建 Wall，因此文本 HTTP 请求始终低于 100 KB。旧 multipart 请求的原始 body（包括边界和表单头）仍必须不超过 50 MiB 加允许的 multipart 开销。上传回执集合（如启用）也仅允许云函数写入，禁止客户端读取。

## 小程序墙面生命周期

`adminWall` 接受 `{action,data}`：`uploadImage`（`base64,contentType,requestId`）、`createWall`（`name,imageFileId,imageWidth,imageHeight,requestId`）、`listDrafts`、`updateWallHolds`（`wallId,holds`）、`publishWall`（`wallId`）、`reclaimUploads`。上传返回 `{fileID,imageWidth,imageHeight}`，草稿与发布返回 Wall。客户端先将相册/相机图片转为方向固定且最长边不超过 2400 的 JPEG，再上传；云端实际解码验证，限制 2 MiB/16 MP。上传回执属于当前管理员，24 小时失效；相同请求重试不会重复创建，发布后几何锁定。

`wallManager` 增加 `listUsers`（管理员，安全字段）、`inspectWallDeletion`、`retryCleanup`。`deleteWall` 允许所有者或管理员，删除前需明确确认包含所有关联线路。返回 `deletionPending` 表示墙面/线路尚未删完，列表保留“继续删除”；只有 `cleanupPending` 表示剩余图片清理。删除记录持久保存，重复调用可继续，不恢复墙面；公开浏览排除正在删除的墙面。管理员管理中心的清理按钮同时重试删除任务与回收过期孤立上传。

新增 `adminUploads`、`wallDeletionJobs` 集合必须禁止客户端访问。墙面按现有最大墙面编号 +1，线路按同墙面现有最大序号 +1；清空后从 1 开始。`counters` 仅保留分配记录与事务并发锁，历史值不作为编号下限。新建/编辑线路与墙面删除共享事务内墙面状态检查，阻止删除期间增加关联内容。实验台发布回执保留删除标记，旧请求重试不会恢复已删除墙面。

本地测试前执行 `npm ci --prefix wechat/cloudfunctions/adminWall` 安装函数自身的图片校验依赖。
