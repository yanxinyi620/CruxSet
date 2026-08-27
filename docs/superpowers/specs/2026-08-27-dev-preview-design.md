# CruxSet 高保真开发预览器设计

## 目标

在不改变原生微信小程序交付方式的前提下，新增一个独立的浏览器预览器。它应当能快速、可交互地验证 CruxSet 的页面布局、视觉层级和主要用户流程，使日常界面迭代不再依赖微信开发者工具的手动编译与截图。

原生小程序仍是唯一的发布产物；浏览器预览器是开发和设计核验工具。

## 非目标

- 不将项目迁移到 Taro、React Native 或其他跨端框架。
- 不解析、编译或运行 WXML/WXSS。
- 不调用 `wx` API、CloudBase、云函数、真实图片上传或微信分享能力。
- 不取代微信开发者工具对原生 Canvas、系统字体、安全区、登录和云端权限的最终验收。

## 架构

新增独立目录：

```text
dev-preview/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.ts
    preview-app.ts
    app-shell.ts
    routes.ts
    preview-store.ts
    data-adapter.ts
    device-frame.ts
    pages/
    components/
    styles/
```

`dev-preview` 使用 Vite 和 TypeScript，但不成为 `miniprogram` 的构建依赖。根目录提供 `npm run preview` 命令，启动地址为 `http://localhost:5173`。

页面通过浏览器端的轻量路由和状态容器驱动。它们不得直接复制维护一套领域规则：墙面、Layout、线路及其脚点规则继续来自现有的 `miniprogram/domain` 类型、`miniprogram/data` 种子数据和 Mock Repository 的业务约束。预览器仅增加一个适配层，屏蔽 `wx` 和 CloudBase 依赖，保存浏览器会话内的可变状态。

```text
预览页面 / 组件
        ↓
Preview Store（路由、弹窗、暂存 UI 状态）
        ↓
Data Adapter（浏览器兼容接口）
        ↓
Mock Repository + Domain types + Demo data
```

## 高保真页面镜像

第一批镜像覆盖已存在的用户主流程，并与原生页面保持清晰的对应关系：

| 预览页面 | 对应原生页面 | 主要用途 |
| --- | --- | --- |
| 线路 | `pages/walls/index` | 先浏览墙面；选择已发布 Layout 后查看、筛选、搜索或随机线路 |
| 墙面详情 | `pages/wall/index` | Layout、角度、难度、线路列表与进入设置线路 |
| 创建 | `pages/create/index` | 新建墙面、打开我的草稿、选择符合条件的墙面/Layout 新建线路 |
| 标注草稿 | `pages/admin/layout-editor/index` | 预览连续标点、岩点/Volume 和发布前状态 |
| 设置线路 | `pages/problem/editor/index` | 选择岩点角色、脚点规则、名称和保存 |
| 线路详情 | `pages/problem/detail/index` | 岩点可视化、线路元数据和上下条/随机浏览 |
| 我的 | `pages/me/index` | 墙面与 Layout 状态、二次确认删除与级联删除说明 |

页面不追求像素级模拟微信的内部控件；但必须镜像产品的信息架构、交互结果、空状态、错误状态和视觉 token。每个预览页面使用语义清晰的 HTML/CSS 组件，而非把 WXML 复制为字符串。

## 交互范围

预览器中的操作必须是可点击、可观察的真实流程，而非静态示意：

- 底部 Tab 导航、页面前进/返回、墙面与 Layout 选择。
- 条件筛选、编号/名称搜索、上一条/下一条与一轮不重复的随机线路。
- 新建、编辑墙面；默认私有、可切换公开；图片选择使用本地预览占位能力。
- 从“我的草稿”恢复未发布 Layout；在预览画布上创建、选择、删除模拟岩点，并发布 Layout。
- 只有已发布且至少有两个岩点的 Layout 才能进入设置线路。
- 设置线路时选择 Start / Hand / Assist / Finish / Foot，应用 `feet_follow`、`specified`、`all` 规则并保存。
- 删除墙面或 Layout 时显示两次确认；已发布 Layout 或墙面删除后，在当前预览会话中级联删除关联线路。

会话数据只在浏览器内保存。刷新页面后重置为种子数据，除非后续专门增加 `localStorage` 持久化需求；第一版不做持久化，以保证每次视觉测试可重复。

## 设备框架

预览器提供可切换设备壳和内容视口：

- iPhone 16 Pro
- iPhone SE
- Pixel
- 自定义宽 × 高

每个设备壳都包含简化的微信导航栏、页面内容区、底部 TabBar 和安全区。设备切换只改变视觉视口与安全区变量，不改变领域数据或路由状态。

## 视觉系统

预览器和原生小程序使用同一组命名的设计 token：背景、文字层级、边框、强调色、圆角、间距和阴影。预览器可以用 CSS 自定义属性实现；原生端在 `app.wxss` 和页面 WXSS 中采用对应值。

每次视觉修改遵循此核验顺序：

1. 在 `npm run preview` 中操作到目标状态并查看截图。
2. 将被认可的 token、结构与状态反馈到对应 WXML/WXSS。
3. 在微信开发者工具中对该原生页面做最终差异核验。

这避免把浏览器概念图误当作已验证的原生界面。

## 错误处理与边界

- 不可定线的 Layout 显示明确原因和回到草稿的入口，不暴露“设置线路”操作。
- 对不允许的发布、保存、删除操作，预览器显示与小程序一致的业务提示。
- 浏览器不模拟真实 CloudBase 失败；网络、权限、登录和上传失败只在原生 CloudBase 验收阶段覆盖。
- 预览适配层不得导入会在浏览器执行时访问 `wx` 的代码路径。

## 验证

- 为浏览器端的路由、可定线条件、保存/删除级联和随机线路队列添加自动化测试。
- 复用或扩展现有 domain/Mock Repository 测试，保证预览器不绕过已有业务规则。
- `npm test` 与 `npm run build` 必须持续通过。
- `npm run preview` 必须启动 Vite 并能在浏览器完成上述关键流程。

## 交付标准

完成后，开发者可运行一条命令打开本地预览器，在四种设备视口中交互完成“浏览墙面和线路”“创建并发布墙面 Layout”“设置并保存线路”“删除关联对象”四类流程；原生小程序代码、CloudBase 架构和发布流程不被替换或破坏。
