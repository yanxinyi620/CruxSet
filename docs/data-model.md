# CruxSet Phase 1 数据模型

CloudBase 集合：`users`、`walls`、`layouts`、`problems`、`admins`、`counters`。

- `users.id` 是业务用户主键；`openid` 仅用于登录映射。
- `walls` 表示物理墙，`activeLayoutId` 指向当前布局。
- `layouts` 表示一次装点，历史布局不可覆盖；小修订通过同一逻辑 `id` 写入新 `version` 文档；Hold 的 `x/y/radius` 使用 0–1 normalized coordinate。
- `problems` 通过 `wallId`、`layoutId` 和 `holds` 中的 Hold ID 引用布局，`id` 与用户可见 `number` 必须不同。
- `admins` 只保存 `userId` 与 `role`。
- `counters/problem_number` 用于服务端事务生成 `CS-000001` 格式编号。

Phase 1 暂不创建评论、点赞、关注、训练记录等集合。
