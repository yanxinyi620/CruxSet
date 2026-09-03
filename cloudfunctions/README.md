# CloudBase 云函数

这些目录是 Phase 1D 的入口骨架，部署前需在微信开发者工具中为每个函数安装依赖并配置 CloudBase 环境。

- `login`：OPENID → `users.id`
- `saveProblem`：服务端校验并生成线路编号
- `updateProblem`：创建者更新线路；与 `saveProblem` 使用相同的名称/描述长度校验
- `deleteProblem`：创建者或管理员删除线路
- `segmentationPublish`：接收分割实验台的签名 HTTP 发布请求，上传后的墙图文件 ID 与标准化岩点写入公开 Wall
- `adminWall`：已停用的小程序墙面变更入口；墙面创建、标注和发布不通过小程序执行。
- `wallManager`：公开墙面浏览；`listAdminWalls` 与 `deleteWall` 仅允许管理员调用。
- `getWallImageUrl`：按 Wall 的公开状态和拥有权换取墙图临时地址

云函数必须从数据库重新读取 Wall、User 和 Admin，不能信任客户端传入的权限或 Hold 数据。

错误码使用大写稳定字符串（如 `LOGIN_REQUIRED`、`FORBIDDEN`、`INVALID_HOLD_ID`），小程序端负责将错误码映射为用户可读提示。

部署 `segmentationPublish` 时，同时配置 `CRUXSET_CLOUDBASE_SIGNING_KEY`，并将其与实验台的 `CRUXSET_CLOUDBASE_SIGNING_KEY` 保持一致。它接收 JSON HTTP trigger body（不是嵌套的 `metadata` 适配格式），验证 `x-cruxset-signature`/body 中的签名后创建 Wall；实验台的 Storage 上传端点使用 `multipart/form-data` 的 `file` 字段，并须返回 `{ "fileID": "cloud://..." }`，该 ID 再随 JSON 请求提交给云函数。
