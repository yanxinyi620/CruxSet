# CruxSet 开发实施计划

> 权威需求：[CruxSet 微信小程序完整开发实施方案 v1.0](./CruxSet-微信小程序完整开发实施方案-v1.0.md)。本文件只记录开发顺序、当前进度与验证门槛；如有冲突，以权威需求为准。

## 状态说明

- `[x]` 已实现并通过自动检查。
- `[-]` 已有基础实现，但尚未达到完整验收标准。
- `[ ]` 尚未实现。

Phase 1 完成前不得提前开发 Phase 2。每个任务均遵循：先测试、再实现、运行 `npm test` 与 `npm run build`、更新进度。

## 当前基线

- [x] 微信原生小程序项目骨架与 TypeScript 检查
- [x] Wall、Layout、Hold、Problem、User 领域类型
- [x] Problem ID 与可见编号分离
- [x] 默认 `feet_follow` 与三种 Foot Rule 基础校验
- [x] 当前筛选结果的搜索、排序和不重复随机队列
- [x] Circle/Polygon 基础命中和坐标变换纯函数
- [-] 墙面列表、线路列表、详情、编辑和管理页面已具备 Demo/服务接入，仍待线上数据完善
- [-] CloudBase 服务、集合声明和云函数入口已建立，真实环境尚未部署
- [-] Canvas、手势和真实数据读写已具备基础实现，真机验收尚未完成

---

## Phase 1A — Foundation

### A1. 项目与共享类型

- [x] 初始化原生微信小程序、npm、Vitest 和严格 TypeScript。
- [x] 定义独立的 `users.id`，业务模型不以 OpenID 作为外键。
- [x] 定义 Wall、Layout、Hold、Problem 与 normalized coordinate 数据结构。
- [-] 将共享领域模块接入小程序构建流程，避免小程序页面复制类型和规则（编辑页与 Canvas 已接入，页面层类型仍待清理）。
- [x] 增加稳定的 ID 生成器与 ID 前缀测试：`usr_`、`wall_`、`layout_`、`problem_`。

### A2. CloudBase 基础

- [-] 配置真实小程序 AppID 与 CloudBase 环境 ID（小程序服务层已建立，真实环境待配置）。
- [-] 建立 `users`、`walls`、`layouts`、`problems`、`admins`、`counters` 集合（机器可读声明与配置清单已建立，真实环境待执行）。
- [x] 编写最小开发种子数据：一面 Wall、一个 Layout、多个 Hold。
- [-] 记录集合索引、权限规则和环境初始化步骤（基础文档已建立，真实环境索引/权限待配置）。

验证：小程序可启动；类型检查通过；种子 Wall/Layout 可读取；业务记录中不存在 OpenID 外键。

---

## Phase 1B — Wall Canvas

### B1. Canvas 渲染

- [-] 创建 `wall-canvas` 组件，以 Canvas 2D 绘制墙图和 Hold（组件已建立，300–600 个 Hold 性能待真机验证）。
- [-] 根据图片和画布尺寸计算 fit-width `minScale`，限制 `maxScale = minScale × 5`（Canvas 已按容器宽度初始化基础缩放与 DPR，手势动态尺寸待真机验证）。
- [x] 使用统一角色色：Start 绿、Foot 黄、Hand 蓝、Assist 橙、Finish 紫。
- [-] 处理图片加载失败、空 Layout 和画布尺寸变化（加载失败/空 Layout 已处理，尺寸变化待真机验证）。

### B2. 坐标与手势

- [x] 实现 `imageToScreen`、`screenToImage`、normalize、denormalize 和 anchor zoom 纯函数。
- [x] 实现 Circle 命中、Polygon 基础命中与最近岩点选择。
- [-] 实现单指 Pan、双指 Pinch Zoom、短按 Tap 的手势状态机（领域控制器已完成，待真机接线验证）。
- [x] 使用移动不超过 8px、持续不超过 300ms 判断 Tap。
- [x] 将 15–25px 屏幕吸附半径按 scale 转换到图片坐标。
- [-] 完成重叠优先级：普通 Hold 优先于 Volume，其次最近中心、较小半径（领域命中已完成，待 Canvas 真实场景验证）。

验证：坐标往返误差接近 0；缩放锚点不漂移；缩放后仍能准确选择密集岩点；完成 Android 与 iPhone Canvas 真机检查。

---

## Phase 1C — Problem Editor

### C1. 编辑状态

- [x] 定义五种线路角色与三个 Foot Rule，默认 `feet_follow`。
- [x] 实现 Start、Finish、角度、难度、Hold ID 和 `specified` Foot 校验基础。
- [-] 实现角色工具栏、点击切换、再次点击取消和单 Hold 单角色迁移（领域状态、编辑页面与 Canvas 点选已接入，待真机验证）。
- [-] 实现至少覆盖 Add、Remove、Change Role 的 Undo（领域状态、编辑页面与 Canvas 点选已接入，待真机验证）。
- [x] 实现 Clear 的二次确认。
- [x] 实现名称与不超过 500 字的说明输入。

### C2. 草稿与保存

- [-] 使用 `problemDraft:{layoutId}` 自动保存编辑草稿（已接入编辑页面，待完整 Problem 保存流程）。
- [ ] 页面恢复时提示继续或丢弃草稿。
- [ ] 网络失败保留草稿，服务端保存成功后删除草稿。
- [ ] 在 UI 中解释三种 Foot Rule 的手脚权限。

验证：五种角色颜色一致；角色冲突不会产生重复 Hold ID；退出或网络失败不丢线路；核心 Foot Rule、角色冲突和基础字段已有自动测试，云函数真实调用待完成。

---

## Phase 1D — Cloud Functions

### D1. 用户与权限

- [-] 实现 `login`：OPENID 只用于查找/创建 User，返回 `users.id`（云函数、小程序启动登录与缓存已建立，待真实环境部署验证）。
- [ ] 实现 `admins` 的 userId 鉴权，前端隐藏入口但不承担安全判断。
- [-] 增加身份测试，证明业务表不保存 OpenID 外键（纯身份映射测试已建立，云端业务写入验证待完成）。

### D2. Problem 写操作

- [-] 实现 `saveProblem` 服务端完整校验（入口、小程序调用服务与基础校验已建立，编辑页已调用并传递当前 Wall/Layout，待真实环境验证）。
- [-] 使用事务更新 `counters/problem_number`，生成唯一 `CS-000001` 编号（入口已建立，待真实环境验证）。
- [-] 创建时生成不可变 `problem_xxx` ID，确保 ID 不等于编号（入口已建立，待真实环境验证）。
- [-] 实现 `deleteProblem`，仅创建者或管理员可删除（入口已建立，待真实环境验证）。
- [-] 对云函数返回统一的用户可读错误码（稳定错误码与小程序错误映射已建立，真实调用验证待完成）。

### D3. Layout 管理

- [-] 实现 `adminLayout` 的 createWall、createLayout、updateLayout、publishLayout（鉴权入口已建立，具体操作待真实环境接入）。
- [-] 重新装点必须新建 Layout；小修订只增加 version（云函数规则已修正并增加版本纯函数测试，真实环境待验证）。
- [ ] 保存原图与 1600–2048px 日常展示图的文件 ID。

验证：并发创建线路编号不重复；伪造 userId、Hold ID、Wall/Layout、角度或难度均被服务端拒绝。

---

## Phase 1E — Browse & Share

- [-] 墙面列表和 Wall Detail 已有静态页面骨架。
- [-] 接入 Wall、历史/Active Layout 数据（首页 Wall 服务与 Wall Detail 动态读取已建立，真实环境验证待完成）。
- [-] 实现角度、难度筛选和当前上下文持久化（Demo 页面已接入筛选，云端上下文待完成）。
- [x] 领域层支持编号/名称子串搜索及编号升序。
- [-] 将搜索、上一条/下一条接入当前 Filtered Problems（领域层完成，Demo/远端详情页已接入当前 Wall/Layout/Angle/Grade 导航）。
- [x] 领域层支持 Fisher–Yates 单轮不重复随机队列。
- [-] 将随机训练会话接入页面，结果耗尽后重新洗牌（已接入 Demo 页面，待持久化会话与云端数据）。
- [-] 完成 Problem Detail 的墙图、图例、说明和 Foot Rule 中文显示（真实 Problem/Layout 动态读取、详情 Canvas 和 Foot Rule 动态说明已接入，图例和真实环境待完成）。
- [-] 分享入口已有骨架；已接入 Demo Problem ID，待 CloudBase 数据落地加载。

验证：搜索、顺序和随机均不越过当前 Wall + Layout + Angle + Grade；分享链接可直达对应线路。

---

## Phase 1F — Admin Layout Editor

- [-] 实现管理员创建 Wall、上传图片与创建 Layout 流程（编辑页、图片上传与草稿已接入，真实 CloudBase 操作待验证）。
- [-] 实现 Continuous Add Mode，连续创建 H001、H002……（领域与页面已接入，待真实 Canvas 点位与图片）。
- [-] 默认 `kind = hold` 与默认 radius；支持 Hold/Volume 切换（领域与页面已接入，待真实 Canvas 点位）。
- [-] 实现移动中心、调整 radius、删除与至少 50 步 Undo（删除/Undo/归一化点选/位置与半径控件已接入，待真机验证）。
- [ ] 保证所有坐标以 0–1 保存，禁止保存屏幕像素。
- [ ] 使用真实墙图人工标注至少 300 个 Hold 并验证性能。

验证：连续标点不弹窗打断；刷新后 Hold ID、位置、半径和版本保持正确。

---

## Phase 1G — Release

- [-] 完成加载、空状态、网络失败、权限失败和保存失败反馈（主要页面已覆盖，发布前需统一审查）。
- [-] 按 `layout:{layoutId}:{version}` 实现 Layout 缓存与失效（工具与小程序读取已完成，真实数据验证待完成）。
- [x] 补齐产品规则、数据模型、架构和人工测试文档。
- [ ] 在至少一台 Android 和一台 iPhone 完成规格中的真机清单。
- [-] 修复阻塞问题，生成微信体验版并完成 Phase 1 Freeze（本地与 `--release` 门禁已建立；真实 AppID、CloudBase 和真机仍待完成）。

最终门槛：完整规格第 70 节的 38 项 Definition of Done 全部通过。

---

## Phase 2 — Local Vision Annotator

Phase 1 Freeze 后才开始。

- [ ] 创建 Python 3.11 + FastAPI 本地标注工具。
- [ ] 集成 MobileSAM，单张图片只计算一次 embedding。
- [ ] 使用既有 Hold Center 作为 Point Prompt，不进行全图自动检测。
- [ ] 完成 Mask 候选预览、Retry、审核和异常标记。
- [ ] 使用 OpenCV 将 Mask 转换为简化 Polygon，并保持 Hold ID 不变。
- [ ] 实现 500ms debounce 自动保存和 CloudBase Layout 兼容 JSON 导出。
- [-] 小程序增加 BBox + Point-in-Polygon 两阶段命中（已实现 BBox 预过滤与 Point-in-Polygon，真实 Polygon 性能待验证）。
- [ ] 迁移真实 Layout 并完成手机性能验证。

最终门槛：完整规格第 90 节的 19 项 Definition of Done 全部通过，历史 Problem 无需迁移。

## 每次交付检查

```bash
npm test
npm run build
git status --short
```

每次汇报必须包含：完成任务、修改文件、测试结果、未解决问题和下一任务。
