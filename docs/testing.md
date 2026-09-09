# 测试与验收

## 自动化检查

在仓库根目录运行：

```bash
npm test
npm run build
npm run verify:phase1
```

`npm run build` 会检查共享领域代码与小程序 TypeScript。发布前使用 `npm run verify:phase1 -- --release`，该命令要求真实 AppID。

分割实验台的测试在其目录内独立运行：

```bash
uv run --extra test pytest -s -q
```

## 本地 Web：完整创作（FastAPI、SQLite 与本地媒体）

- [ ] 启动 FastAPI 与 Web 后，管理员可以登录。
- [ ] 上传 JPEG、PNG 或 WebP 并创建私有 Wall。
- [ ] 私有 Wall 可标注岩点；至少两个岩点后可发布。
- [ ] 已发布 Wall 可浏览、定线，且墙图正常显示。
- [ ] 发布后不能修改 Wall 的墙图、几何或岩点。
- [ ] 已登录用户可创建、编辑和删除自己的线路；不能编辑或删除其他用户的线路。

## 小程序：CloudBase

- [ ] 编译并连接已配置的 CloudBase 环境，完成以下 CloudBase 验收。
- [ ] 小程序只显示公开墙面浏览、线路查看/创建、我的线路和管理员墙面管理入口；不显示创建墙面、上传、岩点标注或发布入口。
- [ ] 公开且至少两个岩点的 Wall 可用于新建线路。
- [ ] 新建线路只提交 `wallId`，所选 Hold 必须属于该 Wall。
- [ ] 创建者可编辑、删除自己的线路；其他用户不能编辑或删除。
- [ ] 删除含关联线路的 Wall 显示不可删除提示；删除线路后可删除该 Wall。

- [ ] 小程序不暴露墙面 create、update、hold annotation、publish 动作；`wallManager` 的 `listAdminWalls` 与 `deleteWall` 仅管理员可用。
- [ ] 私有 Wall 图仅所有者或管理员能通过 `getWallImageUrl` 预览；公开墙图正常显示。
- [ ] 普通用户不能修改他人私有 Wall，不能取得无关联私有文件的访问地址。
- [ ] 删除有关联 Problem 的 Wall 返回 `WALL_IN_USE`，且不级联删除 Problem。
- [ ] 至少在一台 Android 与一台 iPhone 上验证单指拖动、双指缩放、密集 Hold 命中和性能。
- [ ] 验证公开墙图、线路保存和分享链接。

## Cloudflare Web：公开浏览、认证与线路写入

- [ ] 未登录访问者可浏览已发布的公开 Wall、墙图和线路；私有或未发布 Wall 不出现在公开接口和页面中。
- [ ] 用户可注册、登录、退出并更新资料；登录后可创建、编辑和删除自己的线路，不能编辑或删除其他用户的线路。
- [ ] 浏览器端不运行 AI 任务。
- [ ] 配置 R2 `MEDIA` 后，管理员可上传墙图、创建私有 Wall、标注岩点，并在至少两个岩点后发布；发布的 Wall 可公开浏览和定线。
- [ ] 未配置 `MEDIA` 时，管理员的上传、墙面创作、岩点标注和发布入口均禁用；公开浏览、认证和线路写入仍可用。

## 分割实验台发布验收

- [ ] 在实验台选择已保存校准结果并点击“发布到 CruxSet”。
- [ ] `web` 目标只在本机 Web 创建新的公开 Wall；`cloudbase` 目标只在 CloudBase 创建；`cloudflare` 目标只在 Cloudflare Web 创建新的公开 Wall。
- [ ] `both` 先发布到 `web`，再发布到 `cloudbase`；两路结果独立呈现，任一路失败不撤销另一条已完成的结果。
- [ ] 选择 `cloudbase` 后，原图大于 6 MB 时仍能完成直传 Storage；完整签名校准 JSON 也会直传 Storage，`segmentationPublish` 仅接收小于 100 KB 的 `payloadFileId` 请求，随后出现新的公开 Wall，岩点数量与校准结果一致。
- [ ] 在小程序 CloudBase 模式刷新公开墙面列表，能看到新 Wall、墙图和岩点，并可正常创建线路。
- [ ] 管理员可在小程序查看并删除无关联线路的已发布墙面；有线路时删除被 `WALL_IN_USE` 阻止。
- [ ] 再次发布同一校准结果生成新的 Wall ID，不修改旧 Wall。
