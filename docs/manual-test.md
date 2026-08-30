# Phase 1 人工测试清单

## 本地 Web（SQLite）

- [ ] 启动 FastAPI 与 `npm run web`，管理员可以登录。
- [ ] 新建墙面上传 JPEG/PNG/WebP 后，创建私有 Wall。
- [ ] 私有 Wall 可标注岩点；至少两个岩点后可以发布。
- [ ] 已发布 Wall 可浏览和定线，且墙图能正常显示。
- [ ] 发布后无法修改 Wall 的墙图、几何或岩点。

## 本地 Mock 模式

- [ ] 保持 `runtimeMode = 'mock'`，不部署云函数也可编译并打开小程序。
- [ ] 创建页可继续编辑私有 Wall；公开且至少有两个岩点的 Wall 可用于新建线路。
- [ ] 创建线路只提交 `wallId`，并且所选 Hold 必须属于该 Wall。
- [ ] 删除存在关联线路的 Wall 时显示不可删除提示；删除线路后可删除 Wall。

## 微信开发者工具（CloudBase 模式）

- [ ] `adminWall` 的 create、update 和 publish 调用使用 `{ action, data }` 信封，并接受 `{ id, ...patch }` 更新载荷。
- [ ] 私有 Wall 图仅拥有者或管理员可通过 `getWallImageUrl` 预览；公开 Wall 图可正常显示。
- [ ] 普通用户不能修改其他用户的私有 Wall，也不能取得无关联私有文件的地址。
- [ ] 发布前少于两个岩点返回 `WALL_NOT_ROUTABLE`；发布后更新返回 `WALL_LOCKED`。
- [ ] 删除有 Problem 的 Wall 返回 `WALL_IN_USE`，不级联删除 Problem。

## 真机（至少 Android 1 台、iPhone 1 台）

- [ ] 单指拖动墙面，双指缩放且锚点稳定。
- [ ] 缩放后点击密集 Hold 仍准确，300–600 个 Hold 绘制无明显卡顿。
- [ ] 墙图上传、Wall 发布、线路保存和分享链接可正常完成。
