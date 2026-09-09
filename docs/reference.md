# 设计参考

## 架构与边界

```text
微信小程序：wechat/miniprogram/ → Node 云函数 → CloudBase
                         → CloudBase DB + 私有 Storage
本地 Web：web/（Vite）          → FastAPI           → SQLite + 本地媒体
Cloudflare Web：web/dist         → Workers           → D1 + R2（MEDIA 配置）
```

三种运行形态各自保存独立数据：CloudBase 使用独立数据库和私有 Storage，本地 Web 使用 FastAPI、SQLite 与本地媒体，Cloudflare Web 使用 Workers、D1 与配置为 `MEDIA` 的 R2。它们只共享 Wall、Hold、Problem 的字段语义，数据不会自动同步。小程序独立运行，绝不依赖 FastAPI；Cloudflare Web 的浏览器端不运行 AI。Cloudflare 的管理员在具备 `MEDIA` 配置时可上传、创作、标注和发布墙面。

小程序页面和组件通过 `wechat/miniprogram/services/` 访问数据；页面不得直接依赖 CloudBase。小程序的坐标、命中、手势、线路校验、筛选、随机与编辑状态位于 `wechat/miniprogram/domain/`，可由 Vitest 独立验证；Web 的对应页面、编辑器和业务实现位于 `web/src/`。两端独立实现相同的字段语义，不再使用根目录共享领域层。

分割实验台使用 SAM 模型生成候选 polygon 并支持人工校准。可显式发布到本地 Web、CloudBase 或 Cloudflare Web；`both` 依次发布到本地 Web 和 CloudBase，并返回两路独立状态。选择 CloudBase 时，它先向 `storageUpload` 获取经过 HMAC 验证的短期上传凭证，原图和完整签名校准 JSON 均直传私有 Storage；随后仅将 JSON 的 `fileID` 交给 `segmentationPublish` 下载、验签并创建墙面。所有发布只新建目标中的公开 Wall，不读取、修改或删除该目标的既有数据。

## 数据模型

本地 Web SQLite、CloudBase 与 Cloudflare D1 使用相同的 Wall、Hold、Problem 字段语义，但保存三个独立数据集。CloudBase 使用 `users`、`walls`、`problems`、`admins`、`counters`；分割发布幂等回执如启用，保存在仅云函数可写的 `segmentationPublishes` 集合。Cloudflare 墙图存于配置为 `MEDIA` 的 R2。

- `users.id` 是业务用户主键；OpenID 仅用于登录映射。
- `walls` 保存物理墙、墙图、几何与岩点。岩点坐标 `x/y/radius` 均为 0–1 normalized coordinate。
- `problems` 只保存 `wallId` 与 Hold ID，不保存屏幕坐标；其内部 `id` 与用户可见的 `number` 不同。
- `admins` 保存 `userId` 与角色。
- `counters/problem_number` 由服务端事务生成 `CS-000001` 格式的线路编号。

Phase 1 不创建评论、点赞、关注或训练记录等集合。

## 业务规则

- 新线路默认脚点规则为 `feet_follow`：Start、Hand、Assist、Finish 可手抓或脚踩，黄色 Foot 只能脚踩。
- `specified` 只允许踩线路指定的 Foot，且至少需要一个；`all` 允许使用当前墙面全部可踩岩点，通常不填写 `foot[]`。
- 线路至少包含一个 Start 和一个 Finish；每个 Hold 最多一个显式线路角色。难度为 V0–V16，描述最多 500 字。
- 搜索、排序与随机仅作用于当前 Wall、Angle、Grade 的过滤结果；单个随机会话一轮内不重复，耗尽后重新洗牌。
- 小程序不提供创建墙面、上传墙图、岩点标注或发布能力；它只浏览公开 Wall、查看/创建线路、编辑/删除自己的线路，管理员额外可查看和删除墙面。
- 分割实验台发布的 Wall 直接为公开状态，且至少有两个 Hold 才可用于创建线路。小程序中有线路关联的 Wall 不可删除。
- 有关联 Problem 的 Wall 不可删除；若需修改已发布 Wall 的岩点，应新建私有 Wall。

## 安全边界

云函数必须根据当前登录身份重新读取 User、Admin 和 Wall。不能信任客户端传入的 `userId`、权限、编号或 Hold 数据。

- 客户端不得直接读写业务集合。
- 线路编号只能在 `saveProblem` 的事务中生成。
- Storage 保持私有；墙图只能由 `getWallImageUrl` 在校验公开状态、所有权或管理员身份后换取短期 URL。
- `storageUpload` 与 `segmentationPublish` 的 HTTP 网关入口均以服务端 HMAC 签名验证，CloudBase 管理员 OpenID 仅在云函数中解析为业务 `users.id`。
- 删除线路仅限创建者或管理员；删除 Wall 仅限管理员，且有关联线路时拒绝删除。
