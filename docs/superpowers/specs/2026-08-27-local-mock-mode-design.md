# 本地 Mock 模式设计

## 目标

开发时默认不依赖 CloudBase，即可在微信开发者工具中浏览、创建、标注、发布和创建替代 Layout；准备真实验收时仅切换数据源配置，再使用现有 CloudBase 云函数与存储。

## 运行模式

```text
mock（默认）：
页面 → services → Mock Repository → 固定种子数据 + 内存运行数据

cloudbase（验收）：
页面 → services → CloudBase Repository → 云函数 + 私有存储
```

模式由单一的运行时配置决定。页面不得读取模式，也不得直接调用 `wx.cloud`。切换到 CloudBase 时，开发者只修改配置中的模式值并重新编译。

## Mock 数据

种子数据每次小程序启动时重新创建，所有写操作仅保留在当前运行内存中；重新编译或重启后恢复初始状态。

固定数据包含：

- 保留现有公开示例墙与示例线路，用于浏览、搜索、随机与线路详情。
- 增加“日坛 Spraywall · 本地标注草稿”私有墙面，归属于固定 Mock 用户。
- 该墙面有一个未发布 Layout，使用 `miniprogram/assets/mock/ritan-spraywall-0822.jpg` 作为本地墙图，可从“我的 → 开始标注”进入。
- Mock 用户 ID 为稳定的 `usr_mock_owner`，因此“我的墙面”及写入权限行为可重复验证。

## Repository 边界

在 `miniprogram/services/` 内保留现有公开服务函数签名，例如 `listWalls()`、`getLayout()`、`adminLayout()`、`saveProblem()` 与 `uploadWallImage()`。

- CloudBase 实现维持现有云函数调用。
- Mock 实现提供相同函数语义，并以纯 TypeScript 内存集合保存 Wall、Layout 版本快照与 Problem。
- 图片上传在 Mock 模式直接返回选择器提供的临时路径；种子 Layout 返回项目内静态墙图路径。
- Mock 的 `getLayoutImageUrl` 原样返回上述本地路径，不生成临时云端 URL。
- Mock 登录不调用 `login` 云函数，直接返回固定用户 ID。

Mock Repository 必须同样执行 Layout 发布锁定：发布后 `updateLayout` 与二次发布返回 `LAYOUT_LOCKED`；替代标注必须新建 Layout。它无需模拟 CloudBase 的 OPENID 或真实存储 ACL。

## 应用启动与错误处理

`app.ts` 仅在 CloudBase 模式初始化 `wx.cloud` 与远端登录。在 Mock 模式初始化固定用户。

若 Mock 模式服务调用出现逻辑错误，页面继续使用现有错误提示；不得因为缺少 `wx.cloud` 而失败。模式名称仅在开发日志中输出，不在正式用户界面增加开关。

## 验证

自动化测试覆盖：

1. Mock 种子每次创建返回完整且独立的数据；
2. 本地用户可找到草稿 Layout，并完成发布锁定；
3. 发布后的旧 Layout 与其线路快照保持不变，新 Layout 可继续标注；
4. Mock 图片路径可由 Layout 图片服务取得；
5. CloudBase 模式保留当前服务调用协议。

手工验证覆盖：

1. Mock 默认启动，不部署任何云函数也可打开“我的 → 开始标注”；
2. 重新编译后 Mock 数据恢复；
3. 切换为 CloudBase 后，真实环境不再使用 Mock 数据。

## 非目标

- 不在用户界面提供运行模式切换或本地数据重置按钮。
- 不模拟 CloudBase 数据库规则、真实 OPENID、临时文件 URL 或多账号隔离。
- 不修改当前 CloudBase 数据结构或部署流程。

