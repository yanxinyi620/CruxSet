# 三种运行形态文档设计

## 目标

以当前可运行代码为准，清楚说明 CruxSet 的小程序 CloudBase、本地 Web 和 Cloudflare Web 三种运行形态，避免维护者把小程序 Mock、Cloudflare Tunnel 或旧的只读边缘方案误认为独立产品形态或当前限制。

## 范围与信息结构

README 作为入口，新增三种形态的简明对照：入口、运行时、数据归属、可以执行的主要操作，以及与其他形态的数据关系。`docs/reference.md` 用同一模型说明数据边界和分割实验台的三个发布目标；`docs/cloudflare-edge-deployment.md` 则只记录 Workers 的实际能力、D1/R2 的依赖和部署限制。`docs/testing.md` 按运行形态列出可验证的行为。

小程序的 `mock` 是 CloudBase 客户端的离线演示设置，不是一种部署形态；Cloudflare Tunnel 只是本地 Web 的网络入口，也不新增运行时或数据存储。

## 三种形态

| 形态 | 前端与服务 | 数据与媒体 | 当前功能边界 |
| --- | --- | --- | --- |
| 小程序 CloudBase | 微信原生小程序、CloudBase 云函数 | CloudBase 数据库与私有 Storage | 浏览公开墙面；创建、编辑和删除自己的线路；管理员管理满足条件的墙面。没有墙面创建、图片上传、岩点标注或 AI。 |
| 本地 Web | Vite Web、FastAPI | SQLite 与本地媒体目录 | 管理员完整创作流程：上传墙图、创建私有 Wall、标注岩点、发布、线路管理和本机分割实验台。 |
| Cloudflare Web | 与本地 Web 相同的 Vite 构建产物、Workers | D1；配置 `MEDIA` 时使用 R2 | 浏览、注册、登录、个人资料、线路写入；管理员可在配置 R2 后上传图片、创建、标注、发布和删除自己创建的墙面。分割发布可由受签名请求写入；不提供浏览器内 AI 任务。 |

三者的 Wall、Hold、Problem 字段语义相同，但 CloudBase、SQLite、D1 是三个互不自动同步的数据集。实验台的 `web`、`cloudbase`、`cloudflare` 与 `both` 发布目标分别写入指定系统；各目标的成败独立呈现。

## 约束与验证

文档不改变任何接口、部署配置或数据。更新后以 `rg` 检查旧的“Cloudflare 仅只读”“Cloudflare 不能创建墙面/上传图片”等描述是否还作为现状出现，并运行 Markdown 链接与标题的轻量检查。
