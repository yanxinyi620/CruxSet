# 微信小程序项目隔离设计

## 目标

将微信开发者工具的打开目录缩小为独立的 `wechat/` 子项目，避免扫描根仓库中的分割模型、Python 虚拟环境、实验数据、Web 构建产物和服务端数据。

## 目录与边界

```text
wechat/
├─ miniprogram/       微信小程序源码与其 TypeScript 配置
├─ cloudfunctions/    CloudBase 云函数
├─ project.config.json
└─ project.private.config.json
```

小程序专用的领域代码随 `miniprogram/` 迁移。Web、FastAPI、分割实验台、根目录 Node 测试与配置继续位于仓库根目录；不移动或删除它们。微信开发者工具以后仅导入 `wechat/`。

## 构建与兼容性

根目录 `npm run build` 更新为检查 `wechat/miniprogram/tsconfig.json`。根目录测试仍可从现有共享领域目录运行。CloudBase 云函数名称、数据库集合、HTTP 网关 URL 与运行时环境 ID不变。

根目录 README、CloudBase 部署说明与验证文档改为指向新目录和导入方式。旧的根目录 `project.config.json` 与 `project.private.config.json` 删除，避免开发者工具误打开仓库根目录后继续全量扫描。

## 验收

1. `npm run build` 与现有测试通过。
2. `wechat/project.config.json` 的 `miniprogramRoot` 和 `cloudfunctionRoot` 指向项目内目录。
3. 小程序内不存在对仓库根目录 `src/` 的相对导入。
4. 开发者工具导入 `wechat/` 时不需要扫描根目录的 `tools/`、`server/` 或根 `node_modules/`。
