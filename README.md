# CruxSet

CruxSet 是用于数字化真实攀岩墙的微信原生小程序，目标是在真实岩馆完成：选墙、选 Layout、按角度和难度找线路、查看或随机线路、创建线路并微信分享。

## 当前进度

项目处于 Phase 1 开发阶段。目前已完成：

- 微信原生小程序及页面骨架
- Wall、Layout、Hold、Problem、User 领域类型
- 三种脚点规则，默认 `feet_follow`
- Problem 基础校验、筛选、搜索和随机队列
- Circle/Polygon 基础命中与坐标变换
- TypeScript 和 Vitest 自动检查

Canvas 手势和线路编辑基础已完成；CloudBase 云函数、管理员标点工具和真机验收仍在开发中。准确进度见 [实施计划](docs/IMPLEMENTATION_PLAN.md)。

## 文档

- [完整产品与技术规格](docs/CruxSet-微信小程序完整开发实施方案-v1.0.md)：权威需求来源
- [开发实施计划](docs/IMPLEMENTATION_PLAN.md)：阶段、任务、当前状态和验收门槛
- [架构说明](docs/architecture.md)：代码边界与运行方式
- [CloudBase 配置清单](docs/cloudbase-setup.md)：环境、集合、索引与权限
- [CloudBase 集合声明](config/cloudbase.collections.json)：集合、索引与写入边界

如文档存在冲突，以完整产品与技术规格为准。

## 本地开发

要求：Node.js 18+、npm，以及微信开发者工具。

```bash
npm install
npm test
npm run build
npm run verify:phase1
```

使用微信开发者工具导入仓库根目录；工具会读取 `project.config.json`，小程序源码位于 `miniprogram/`。

当前开发默认使用本地 Mock 数据，不需要部署 CloudBase。Mock 使用固定的日坛 Spraywall 墙图和草稿 Layout；创建、标注、发布等操作只保留到本次运行结束，重新编译即恢复初始数据。

运行模式配置位于 [runtime.ts](miniprogram/config/runtime.ts)：

```ts
export const runtimeMode: RuntimeMode = 'mock'
```

准备 CloudBase 验收时，将其改为 `'cloudbase'` 后重新编译；体验版或正式发布前必须使用 `'cloudbase'`。业务页面继续通过 services/repository 抽象访问数据，未来可替换为 FastAPI。接入真实 CloudBase 前，需要：

1. 创建 CloudBase 环境；
2. 在小程序初始化配置中指定环境；
3. 按实施计划建立集合、权限和云函数。

不要把私有环境配置或密钥提交到仓库。

集合与字段见 [数据模型](docs/data-model.md)，业务约束见 [产品规则](docs/product-rules.md)，真机检查见 [人工测试清单](docs/manual-test.md)。

## 核心规则

- Problem 只引用 Hold ID，不保存屏幕坐标。
- 业务数据引用 CruxSet `users.id`，OpenID 只用于微信身份映射。
- Wall 与 Layout 分离；重新装点必须创建新 Layout。
- 所有岩点坐标使用 0–1 normalized coordinate。
- `Problem.id` 与用户可见的 `Problem.number` 不同。
- 线路编号由服务端原子生成。
- 默认 `feet_follow`：Start、Hand、Assist、Finish 可手抓也可脚踩；黄色 Foot 只能脚踩。

## 目录概览

```text
miniprogram/       微信原生小程序
cloudfunctions/    CloudBase 云函数入口
src/domain/        可测试的共享领域规则
src/repository/    数据访问边界
tests/             自动测试
docs/              权威规格与实施计划
tools/annotator/   Phase 2 本地视觉标注器（Phase 1 后开发）
```

## 当前验证命令

```bash
npm test
npm run build
```

`npm run build` 会同时检查共享领域代码和微信小程序 TypeScript。
