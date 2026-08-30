# CruxSet 双存储数据模型

本地 Web SQLite 与 CloudBase 使用相同的 Wall、Hold、Problem 字段语义，但保存独立数据集。Web 草稿仅存 SQLite；只有已发布 Wall、关联 Problems 和图片可作为发布包导入 CloudBase。

CloudBase 集合：`users`、`walls`、`problems`、`admins`、`counters`。

- `users.id` 是业务用户主键；`openid` 仅用于登录映射。
- `walls` 表示物理墙及其墙图、几何和岩点。Wall 默认私有、可标注；公开后永久锁定。Hold 的 `x/y/radius` 使用 0–1 normalized coordinate。
- `problems` 通过 `wallId` 和 `holds` 中的 Hold ID 引用 Wall，`id` 与用户可见 `number` 必须不同。
- `admins` 只保存 `userId` 与 `role`。
- `counters/problem_number` 用于服务端事务生成 `CS-000001` 格式编号。

Phase 1 暂不创建评论、点赞、关注、训练记录等集合。
