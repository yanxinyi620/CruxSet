# CloudBase Phase 1 配置清单

## 环境

1. 在微信公众平台创建小程序并取得真实 AppID。
2. 在微信开发者工具中打开仓库根目录，绑定 AppID。
3. 已配置 CloudBase 环境 `cloud1-d0g8toggn7735e61e`，并写入 `miniprogram/app.ts` 的 `wx.cloud.init`；如切换环境，只修改该配置。
4. 分别为 `login`、`saveProblem`、`deleteProblem`、`adminLayout`、`getLayoutImageUrl` 安装各目录的 `wx-server-sdk` 依赖并部署。部署时选择“创建并部署：云端安装依赖（不上传 node_modules）”。

部署前在项目根目录执行 `npm run verify:phase1`；该命令会检查云函数 JavaScript 语法和依赖声明。正式发布使用 `npm run verify:phase1 -- --release`，会强制要求真实 AppID。

## 集合与索引

创建 `users`、`walls`、`layouts`、`problems`、`admins`、`counters` 六个集合。建议索引：`users.openid` 唯一，`layouts.wallId + version`，`problems.wallId + layoutId + angle + grade`，`problems.number` 升序，`admins.userId` 唯一。

客户端权限策略记录在 [`config/cloudbase.rules.json`](../config/cloudbase.rules.json)：客户端只读 `walls`、`layouts`、`problems`，所有写入必须经过云函数。

## 权限原则

- 客户端不直接写 `problems`、`layouts`、`admins`、`counters`。
- 云函数重新识别 OPENID 并映射到 `users.id`。
- 删除线路仅允许创建者或管理员。
- 编号只能由 `saveProblem` 事务生成，忽略客户端编号。
- Layout 发布必须由管理员云函数完成。

## 云存储（免费环境）

免费环境使用“仅创建者可读写”，不必开放公开读取。

- 墙图上传后仍保持私有。
- 已发布 Layout 的墙图由 `getLayoutImageUrl` 云函数验证其 `fileID` 与发布状态后，换取短期 HTTPS 地址供小程序展示。
- 未发布 Layout 的墙图仅允许管理员通过该函数预览。
- 部署该函数后，普通用户不能用它换取任意私有文件的访问地址。

## 线上验收

配置完成后，按 [人工测试清单](./manual-test.md) 验证 Android 和 iPhone。当前仓库没有真实 AppID、环境 ID 或云端数据，本地检查不能替代线上验收。
