# Web Wall-Only Visual Restoration Design

日期：2026-08-31  
状态：待审阅

## 目标

在不恢复 Layout 领域模型、字段、路由或存储的前提下，将本地 Web 工作台恢复为 Wall-only 迁移前的完整视觉层次和编辑体验。

## 保留的体验

- 恢复原有登录页：品牌页头、说明文案、带标签的邮箱/密码输入和主登录按钮。
- 恢复三栏移动端工作台壳、墙面/线路卡片、分组管理页、编辑页字段区、圆角画布、角色图例与工具栏。
- 恢复 Wall 编辑时的候选岩点、ROI、自动识别、确认/删除候选等完整工具栏视觉与交互；候选确认结果直接写入私有 Wall 的 `holds`。
- 保留现有的错误提示、删除确认、XSS 转义、无障碍标签、发布后几何锁定和重复提交防护。

## Wall-Only 映射

| 旧界面概念 | 恢复后的实际数据 |
| --- | --- |
| 墙面卡片 + 当前 Layout | 单个 Wall 卡片；图片、尺寸、岩点直接读取 `wall` |
| Layout 选择页 | 直接打开 Wall 详情或 Wall 编辑器 |
| Layout 标注草稿 | 私有 Wall |
| 发布 Layout | 发布 Wall：变为 `public` 且锁定几何 |
| 线路绑定 Layout | 线路仅绑定 `problem.wallId`，画布使用该 Wall 的 `holds` |

## 实现边界

- 以合并前提交 `d610b2a` 的 Web 页面壳、CSS 类名和交互布局作为视觉参考，不恢复其中的 Layout 类型或数据访问方法。
- 重建为清晰的 Wall-only 视图函数/状态对象；避免把旧版 `main.ts` 的 Layout 分支直接复制回来。
- 优先复用现有 `WallCanvasView`、`DraftCanvasView`、`WallHoldEditor`、会话和 API 客户端。
- 不改变 FastAPI、CloudBase、小程序、数据迁移或分割实验台范围。

## 验收与测试

- 增加 Web 视图回归测试，覆盖登录页、浏览、创建、Wall 编辑、线路编辑、“我的墙面/线路”、候选岩点与 ROI 工具栏。
- 测试所有恢复后的页面只传递 Wall ID 和 `problem.wallId`，且产品源代码无 Layout 领域字段/路由。
- 运行 `npm test`、`npm run build`、`npm run web:build`；手动确认登录后的公开浏览、私有草稿编辑、Wall 发布锁定和线路创建。
