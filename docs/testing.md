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

## 本地 Web（SQLite）

- [ ] 启动 FastAPI 与 Web 后，管理员可以登录。
- [ ] 上传 JPEG、PNG 或 WebP 并创建私有 Wall。
- [ ] 私有 Wall 可标注岩点；至少两个岩点后可发布。
- [ ] 已发布 Wall 可浏览、定线，且墙图正常显示。
- [ ] 发布后不能修改 Wall 的墙图、几何或岩点。

## 小程序 Mock 模式

- [ ] 保持 `runtimeMode = 'mock'`，未部署云函数也可编译并打开小程序。
- [ ] 创建页可编辑私有 Wall；公开且至少两个岩点的 Wall 可用于新建线路。
- [ ] 新建线路只提交 `wallId`，所选 Hold 必须属于该 Wall。
- [ ] 删除含关联线路的 Wall 显示不可删除提示；删除线路后可删除该 Wall。

## CloudBase 与真机

- [ ] `adminWall` 的 create、update、publish 使用 `{ action, data }` 信封，更新接受 `{ id, ...patch }`。
- [ ] 私有 Wall 图仅所有者或管理员能通过 `getWallImageUrl` 预览；公开墙图正常显示。
- [ ] 普通用户不能修改他人私有 Wall，不能取得无关联私有文件的访问地址。
- [ ] 发布前不足两个 Hold 返回 `WALL_NOT_ROUTABLE`；发布后更新返回 `WALL_LOCKED`。
- [ ] 删除有关联 Problem 的 Wall 返回 `WALL_IN_USE`，且不级联删除 Problem。
- [ ] 至少在一台 Android 与一台 iPhone 上验证单指拖动、双指缩放、密集 Hold 命中和性能。
- [ ] 验证墙图上传、Wall 发布、线路保存和分享链接。
## 分割实验台发布验收

- [ ] 在实验台选择已保存校准结果并点击“发布到 CruxSet”。
- [ ] 刷新 Web 浏览页后出现新的公开 Wall，岩点数量与校准结果一致。
- [ ] 新 Wall 可正常定线，并出现在管理员“我的墙面”。
- [ ] 有线路时删除 Wall 被阻止；删除线路后可以删除 Wall。
- [ ] 再次发布同一校准结果生成新的 Wall ID，不修改旧 Wall。
