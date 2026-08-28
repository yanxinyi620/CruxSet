# CruxSet 双存储数据模型

本地 Web SQLite 与 CloudBase 使用相同的 Wall、Layout、Hold、Problem 字段语义，但保存独立数据集。Web 草稿仅存 SQLite；只有已发布 Layout、关联 Problems 和图片可作为发布包导入 CloudBase。

CloudBase 集合：`users`、`walls`、`layouts`、`problems`、`admins`、`counters`。

- `users.id` 是业务用户主键；`openid` 仅用于登录映射。
- `walls` 表示物理墙；它可以拥有多个 Layout，业务上不存在“当前/活动 Layout”。Wall 默认私有；只要至少存在一个已发布 Layout，Wall 即可公开浏览。
- `layouts` 表示一次装点，历史布局不可覆盖；小修订通过同一逻辑 `id` 写入新 `version` 文档。`published: false` 为仅创建者可见、可标注的草稿；`published: true` 为公开且永久锁定的 Layout。Hold 的 `x/y/radius` 使用 0–1 normalized coordinate。
- `problems` 通过 `wallId`、`layoutId` 和 `holds` 中的 Hold ID 引用布局，`id` 与用户可见 `number` 必须不同。
- `admins` 只保存 `userId` 与 `role`。
- `counters/problem_number` 用于服务端事务生成 `CS-000001` 格式编号。

Phase 1 暂不创建评论、点赞、关注、训练记录等集合。
