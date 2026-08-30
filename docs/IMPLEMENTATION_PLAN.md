# CruxSet 实施计划

本文是当前实施状态与验收门槛。旧版产品说明已归档至 `docs/superpowers/history/`，不代表当前数据模型。

## 当前数据模型

- Wall 是墙图、尺寸、几何和 Hold 的唯一对象。
- 私有 Wall 只允许拥有者或管理员编辑；公开后永久锁定。
- 公开且至少有两个 Hold 的 Wall 可用于浏览和创建 Problem。
- Problem 只保存 `wallId` 与 Hold ID；线路编号由服务端事务生成。
- CloudBase 只存储 `users`、`walls`、`problems`、`admins` 和 `counters` 集合。

## Phase 1 完成项

- [x] 微信原生页面骨架、领域模型、坐标变换和 Hold 编辑交互。
- [x] 本地 Mock 数据、Wall 生命周期和 Problem 校验。
- [x] CloudBase 身份映射、Wall 创建/更新/发布、Problem 保存与受保护删除。
- [x] 私有 Wall 图的拥有者/管理员预览与公开 Wall 图临时 URL。
- [x] `npm run verify:phase1` 的云函数、权限、旧数据模型和文档门禁。

## 真实环境验收

- [ ] 创建 CloudBase 环境并建立当前五个集合及索引。
- [ ] 部署 `login`、`adminWall`、`saveProblem`、`deleteProblem`、`getWallImageUrl` 和 `wallManager`。
- [ ] 在微信开发者工具中以 CloudBase 模式完成私有 Wall 创建、标注、发布和 Problem 创建。
- [ ] 验证公开后的 Wall 返回 `WALL_LOCKED`，且有 Problem 的 Wall 返回 `WALL_IN_USE`。
- [ ] 在 Android 与 iPhone 上验证墙图缩放、Hold 命中和性能。

## 验证命令

```bash
npm test
npm run build
npm run verify:phase1
```

`npm run verify:phase1 -- --release` 还会要求真实小程序 AppID。
