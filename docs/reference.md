# 设计参考

## 架构与边界

```text
本地 Web：web/ → FastAPI → SQLite + 本地图片
                         ↓ 仅显式发布
                    已发布数据包 → CloudBase

微信小程序：miniprogram/ → Node 云函数 → CloudBase
```

Web 是管理员本地创作工作台，小程序独立运行。二者共享 Wall、Hold、Problem 的字段语义，但 Web 草稿、会话和 SQLite 数据不会自动同步到 CloudBase。

小程序页面和组件通过 `miniprogram/services/` 访问数据；页面不得直接依赖 CloudBase。框架无关的坐标、命中、手势、线路校验、筛选、随机与编辑状态位于 `src/domain/`，可由 Vitest 独立验证。

分割实验台使用 SAM 模型生成候选 polygon 并支持人工校准，但目前不直接接入小程序、Web 或定线数据。

## 数据模型

Web SQLite 与 CloudBase 使用相同的 Wall、Hold、Problem 字段语义，但保存独立数据集。CloudBase 仅包含 `users`、`walls`、`problems`、`admins`、`counters`。

- `users.id` 是业务用户主键；OpenID 仅用于登录映射。
- `walls` 保存物理墙、墙图、几何与岩点。岩点坐标 `x/y/radius` 均为 0–1 normalized coordinate。
- `problems` 只保存 `wallId` 与 Hold ID，不保存屏幕坐标；其内部 `id` 与用户可见的 `number` 不同。
- `admins` 保存 `userId` 与角色。
- `counters/problem_number` 由服务端事务生成 `CS-000001` 格式的线路编号。

Phase 1 不创建评论、点赞、关注或训练记录等集合。

## 业务规则

- 新线路默认脚点规则为 `feet_follow`：Start、Hand、Assist、Finish 可手抓或脚踩，黄色 Foot 只能脚踩。
- `specified` 只允许踩线路指定的 Foot，且至少需要一个；`all` 允许使用当前墙面全部可踩岩点，通常不填写 `foot[]`。
- 线路至少包含一个 Start 和一个 Finish；每个 Hold 最多一个显式线路角色。难度为 V0–V12，描述最多 500 字。
- 搜索、排序与随机仅作用于当前 Wall、Angle、Grade 的过滤结果；单个随机会话一轮内不重复，耗尽后重新洗牌。
- 新 Wall 默认为私有，仅创建者或管理员可标注；首次发布后公开且永久锁定。公开且至少有两个 Hold 的 Wall 才可浏览与创建线路。
- 有关联 Problem 的 Wall 不可删除；若需修改已发布 Wall 的岩点，应新建私有 Wall。

## 安全边界

云函数必须根据当前登录身份重新读取 User、Admin 和 Wall。不能信任客户端传入的 `userId`、权限、编号或 Hold 数据。

- 客户端不得直接读写业务集合。
- 线路编号只能在 `saveProblem` 的事务中生成。
- 私有墙图仅所有者或管理员可预览；公开墙图也必须经受控短期 URL 提供。
- 删除线路仅限创建者或管理员；私有 Wall 的更新和发布仅限所有者或管理员。
