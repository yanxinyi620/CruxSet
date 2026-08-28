# 管理员 Web 创作端与统一 API 设计

## 目标

将现有 `dev-preview` 演进为正式 Web 创作端，同时保留微信原生小程序。两个客户端共享业务数据、规则与服务端权限，但保留各自独立的 UI 和平台能力实现。

Web 第一期仅限管理员使用，支持登录后创建墙面、上传墙图、标注 Hold、发布 Layout 与创建线路。

## 已确认边界

- 微信小程序与 Web 是两个正式客户端，不要求 WXML/WXSS 与 Web HTML/CSS 一套渲染代码。
- 两端共享数据模型、业务规则、API 契约、错误码和权限判断。
- 浏览器不得直接访问 CloudBase 数据库、任意云存储文件或现有小程序专用云函数。
- Web 第一期不开放普通用户注册、登录、创作或 Web 账号与微信账号绑定。
- Web 管理员使用邮箱 + 密码登录；不提供自助注册。
- 管理员账户由受控命令或部署时初始化创建；密码只保存强哈希，绝不保存明文。
- 所有业务记录仍引用 CruxSet `users.id`；Web 身份不能写入或替代微信 OpenID。
- Wall 默认私有；草稿只在创建者的草稿入口显示；任一公开 Layout 都可独立浏览和定线；发布后 Layout 锁定。

## 架构

```text
                         ┌───────────────────────┐
微信小程序 ─ services ───┤                       │
                         │  统一 Application API  │
Web 管理端 ─ services ───┤  身份 / 权限 / 错误码   │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ↓                ↓                ↓
                 Users/Admins   Wall/Layout/Problem  Storage
                    └────────────────┴────────────────┘
                               CloudBase 数据与文件
```

`src/domain` 成为唯一的跨端纯业务规则来源：类型、坐标、命中、Layout 生命周期、线路校验、筛选、随机与编辑状态。现有 `miniprogram/domain` 中的重复模块迁移或改为从该来源导出，禁止后续双份维护。

`miniprogram/services` 和未来 `web/services` 只依赖同一套 API 契约。小程序适配器可继续通过 CloudBase 调用；Web 适配器通过 HTTPS API 调用。页面不得直接访问数据库、云函数或 Storage。

## 身份与授权

### 小程序

```text
wx.login → 服务端验证微信身份 → users.id → 小程序会话
```

OpenID 只保留在用户身份映射中，不进入 Wall、Layout、Problem 等业务记录。

### Web 管理端

```text
管理员邮箱 + 密码 → 服务端核验 passwordHash → users.id + admins.userId → HttpOnly 会话 Cookie
```

- 不提供公开注册页面或注册 API。
- 初始管理员由受控初始化命令创建，并同时写入 `users` 与 `admins`。
- 密码使用专用、带盐的慢哈希算法；登录接口限制尝试频率并返回通用失败信息。
- Web 会话使用短期、`HttpOnly`、`Secure`、`SameSite` Cookie；变更密码、退出或管理员撤权后应失效。
- API 每次写入和敏感读取都以会话中的 `users.id` 查询 `admins.userId`，不信任前端提交的身份或角色。

## 统一 API 契约

以下是客户端所见的能力边界；具体 CloudBase 或 HTTP 路由可在实现时映射，但输入、输出、错误码语义保持一致。

| 域 | 能力 |
|---|---|
| Auth | 小程序身份交换、管理员邮箱密码登录、当前会话、退出 |
| User | 当前用户资料与管理员状态 |
| Wall | 浏览公开墙、管理可见墙、创建、更新、删除 |
| Layout | 查询、创建草稿、更新草稿、发布、删除、获取安全图片 URL |
| Problem | 按 Wall/Layout 查询、搜索、创建、删除、详情与随机所需摘要 |
| Media | 授权上传、图片元数据、短期受控读取 URL |

响应统一为成功数据或稳定错误码。至少包括：`AUTH_REQUIRED`、`FORBIDDEN`、`WALL_NOT_FOUND`、`LAYOUT_NOT_FOUND`、`LAYOUT_LOCKED`、`LAYOUT_NOT_ROUTABLE`、`INVALID_*`、`RATE_LIMITED`。

## Web 第一期功能

### 管理员登录

- 登录、退出、登录失败提示和受保护路由。
- 未登录访问创作页时跳转到登录页。
- 已登录管理员可看到当前身份和退出入口。

### 墙面与 Layout

- 创建私有 Wall、上传墙图、创建初始草稿 Layout。
- 草稿列表、继续标注、连续添加 Hold、Volume、删除、Undo、发布。
- 已发布 Layout 只读；调整岩点必须新建草稿 Layout。
- 多个公开 Layout 按发布时间倒序显示；任一公开且至少两个 Hold 的 Layout 可定线。
- 删除 Layout 采用二次确认并级联删除关联线路。

### 线路

- 选择公开 Wall 和 Layout，按角度 / 难度 / 名称或编号浏览线路。
- 创建线路，遵循现有五种 Hold 角色和三种 Foot Rule。
- 线路详情、筛选、顺序浏览和一轮不重复随机。

Web 不强制模仿小程序页面：导航、安全区、Canvas 和键鼠交互按浏览器习惯实现，但使用同一设计令牌与业务文案。

## 文件与图片安全

- 浏览器先向 API 请求受控上传凭据或由 API 代理上传；不暴露数据库管理员凭据。
- Layout 图片读取由 API 根据 Layout 发布状态与调用者权限生成短期 URL。
- 未发布 Layout 图片仅所有者或管理员可读取；已发布 Layout 图片可按公开浏览规则读取。
- 上传路径按 Wall/Layout/版本隔离，服务端校验 MIME、大小和归属。

## 分阶段实施

1. **收敛共享核心**：合并重复领域模块；定义 API 类型、统一错误码与 Repository 接口；小程序维持现有行为。
2. **服务端 API 与管理员身份**：增加管理员账号初始化、密码哈希、登录会话、HTTP API 与完整服务端权限测试。
3. **Web 创作端**：将 `dev-preview` 重构为正式 Web 应用，接入登录、墙面、上传、Canvas 标注、发布、定线与管理。
4. **联调与发布准备**：小程序、Web 对同一数据进行读写；完成权限、并发、上传、手机和桌面浏览器验收。

任何阶段不得让 Web 直接绕过统一 API 访问 CloudBase。普通 Web 用户、邮箱重置、双因素认证、微信与 Web 账号绑定及第三方 OAuth 均不属于第一期。

## 测试与验收

- 同一 Wall / Layout / Problem 在小程序与 Web 显示一致；任一端创建的数据可被另一端按权限读取。
- Web 管理员不能伪造其他 `users.id`、管理员角色、Wall 所有者或 Layout 状态。
- 非管理员会话不能访问创作、上传或写入 API。
- 草稿 Layout 不出现在公开浏览与定线候选中；多个公开 Layout 均可独立定线。
- 发布后的 Layout 不能通过任何 API 或客户端修改岩点。
- Layout 删除级联删除其 Problem，Wall 删除级联删除全部 Layout 与 Problem。
- 密码未出现在日志、API 响应、数据库业务记录或浏览器本地存储中。

## 非目标

- 小程序迁移 Taro、uni-app 或其他跨端 UI 框架。
- 普通 Web 用户账户与公共创作权限。
- 自助注册、邮箱验证 / 密码重置、微信账号绑定、第三方 OAuth、双因素认证。
- 将浏览器页面硬做成微信小程序 1:1 镜像。
