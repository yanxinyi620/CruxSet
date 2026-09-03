# CloudBase 云函数

这些目录是 Phase 1D 的入口骨架，部署前需在微信开发者工具中为每个函数安装依赖并配置 CloudBase 环境。

- `login`：OPENID → `users.id`
- `saveProblem`：服务端校验并生成线路编号
- `updateProblem`：创建者更新线路；与 `saveProblem` 使用相同的名称/描述长度校验
- `deleteProblem`：创建者或管理员删除线路
- `storageUpload`：验证实验台签名元数据并返回 Storage 直传凭证；兼容旧的 multipart 图片上传
- `segmentationPublish`：接收分割实验台的签名 HTTP 发布请求，上传后的墙图文件 ID 与标准化岩点写入公开 Wall
- `adminWall`：已停用的小程序墙面变更入口；墙面创建、标注和发布不通过小程序执行。
- `wallManager`：公开墙面浏览；`listAdminWalls` 与 `deleteWall` 仅允许管理员调用。
- `getWallImageUrl`：按 Wall 的公开状态和拥有权换取墙图临时地址

云函数必须从数据库重新读取 Wall、User 和 Admin，不能信任客户端传入的权限或 Hold 数据。

错误码使用大写稳定字符串（如 `LOGIN_REQUIRED`、`FORBIDDEN`、`INVALID_HOLD_ID`），小程序端负责将错误码映射为用户可读提示。

部署 `storageUpload` 与 `segmentationPublish` 时，同时配置 `CRUXSET_CLOUDBASE_SIGNING_KEY`，并将其与实验台的 `CRUXSET_CLOUDBASE_SIGNING_KEY` 保持一致。`storageUpload` 只允许 HTTP `POST`，不接受小程序 `callFunction` 直接调用。实验台使用小 JSON 元数据请求（签名内容为按键排序的 canonical JSON `{contentLength,contentSha256,contentType,filename,timestamp}`），函数通过 `@cloudbase/node-sdk` 以当前云函数环境申请 Storage 凭证后返回 `{ fileID, uploadUrl, authorization, token, cloudObjectMeta, cloudPath }`；实验台再向 COS 的 `uploadUrl` 发出带 `Signature`、`x-cos-security-token`、`x-cos-meta-fileid` 和 URL 编码 `key` 的 `PUT` 上传，因此不会触发 HTTP 网关的小请求体限制。请在控制台部署时安装此函数 `package.json` 中的全部依赖。为兼容旧客户端，函数仍接受 multipart 上传（单文件上限 50 MiB，并校验图片魔数）。必须在 CloudBase 控制台将 Storage 权限设为私有（`wx-server-sdk` 的 `uploadFile` 不代替 ACL 设置）；客户端不直接读取 Storage，`getWallImageUrl` 是墙图唯一访问入口，部署验收必须确认这两项。

实验台先调用 `storageUpload` 获取直传凭证并上传原图，再把返回的 `fileID` 随 JSON 请求提交给 `segmentationPublish`；后者仍需使用同名密钥验证签名并创建 Wall。旧 multipart 请求的原始 body（包括边界和表单头）仍必须不超过 50 MiB 加允许的 multipart 开销。上传回执集合（如启用）也仅允许云函数写入，禁止客户端读取。
