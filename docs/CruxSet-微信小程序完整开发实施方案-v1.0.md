# CruxSet 微信小程序完整开发实施方案 v1.0

## 0. 文档用途

本文档是 CruxSet 第一阶段和第二阶段的完整产品、数据和技术实施规格。

目标是让开发模型可以按照本文档直接拆分任务、实现、测试和交付。

开发过程中遵循：

> **本文档明确规定的业务规则优先于模型自行推测。**

如果实现过程中发现局部技术细节需要调整：

1. 优先保证数据模型兼容；
2. 优先保证手机端操作体验；
3. 不擅自增加本文档范围之外的大功能；
4. 不为了 Phase 2 的 AI 能力增加 Phase 1 的复杂度。

---

# 1. 产品名称

正式项目名称：

**CruxSet**

建议：

```text
产品名：CruxSet
Repository：cruxset
项目根目录：cruxset/
```

当前产品定位：

> 将真实攀岩墙数字化，让用户能够创建、查看、搜索、分享和挑战攀岩线路。

产品未来不限于 Spraywall。

需要允许扩展到：

```text
Spraywall
Home Wall
可调角度训练墙
普通训练墙
抱石馆墙面
其他可数字化攀岩墙
```

---

# 2. 产品核心概念

CruxSet 的核心数据关系：

```text
Wall
 │
 ├── Layout A
 │     │
 │     ├── Hold H001
 │     ├── Hold H002
 │     ├── Hold H003
 │     └── ...
 │
 └── Layout B
       │
       └── Holds

Problem
 │
 ├── Wall
 ├── Layout
 ├── Angle
 ├── Grade
 ├── Foot Rule
 └── Hold IDs
```

核心原则：

> Problem 永远引用 Hold ID，而不是屏幕坐标。

---

# 3. 开发阶段

项目分为两个阶段。

---

# Phase 1

目标：

> 完成一个不依赖 AI、可以真正拿到攀岩馆使用的微信小程序 MVP。

实现：

```text
墙面管理
Layout 管理
人工岩点标记
Canvas 墙面交互
创建线路
查看线路
搜索线路
顺序浏览
随机线路
微信分享
```

Phase 1 不依赖视觉模型。

目标成本：

```text
≈ ¥0
```

采用：

```text
微信小程序体验版
+
CloudBase 免费开发/体验环境
```

---

# Phase 2

目标：

> 使用管理员 PC 上的本地视觉模型辅助生成岩点 Polygon。

实现：

```text
Phase 1 Hold Center
        ↓
MobileSAM / SAM
        ↓
自动分割
        ↓
Polygon
        ↓
人工审核
        ↓
更新 Layout
```

AI 不运行在小程序。

不租 GPU。

目标成本：

```text
≈ ¥0
```

---

# 4. 技术架构

Phase 1：

```text
                 微信用户
                    │
                    ▼
             微信小程序体验版
                    │
                    ▼
          Repository / API abstraction
                    │
          CloudBase（Phase 1 默认适配器）
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Database    Storage    Cloud Functions
```

Phase 2 增加：

```text
管理员 PC
    │
    ▼
Local Annotator
    │
    ▼
MobileSAM
    │
    ▼
Polygon JSON
    │
    ▼
CloudBase Layout
```

---

# 5. 技术栈

## 小程序

使用：

```text
微信原生小程序
TypeScript
Canvas 2D
services / repository abstraction
```

Phase 1 不使用：

```text
Taro
uni-app
Flutter
React Native
```

---

# 6. Phase 1 默认数据适配器：CloudBase

CloudBase 是 Phase 1 的默认推荐实现，不是业务层硬性绑定。页面和组件不得直接调用 `wx.cloud`，必须通过 `services` / `repository` 抽象访问数据，例如 `problemService.list()`、`problemService.get()`、`problemService.create()`、`wallService.list()` 和 `layoutService.get()`。未来切换 FastAPI 或其他独立后端时，只替换适配层。

使用：

```text
CloudBase Database
CloudBase Storage
Cloud Functions
```

Phase 1 不加入：

```text
VPS
Docker Server
FastAPI 云服务器
Redis
消息队列
GPU Server
```

---

# 7. 项目目录

建议：

```text
cruxset/
│
├── miniprogram/
│   │
│   ├── app.ts
│   ├── app.json
│   ├── app.wxss
│   │
│   ├── pages/
│   │   ├── walls/
│   │   ├── wall/
│   │   ├── problem/
│   │   │   ├── detail/
│   │   │   └── editor/
│   │   ├── admin/
│   │   │   └── layout-editor/
│   │   └── me/
│   │
│   ├── components/
│   │   ├── wall-canvas/
│   │   ├── angle-picker/
│   │   ├── grade-picker/
│   │   ├── foot-rule-picker/
│   │   └── problem-card/
│   │
│   ├── services/
│   │   ├── cloud.ts
│   │   ├── users.ts
│   │   ├── walls.ts
│   │   ├── layouts.ts
│   │   └── problems.ts
│   │
│   ├── utils/
│   │   ├── geometry.ts
│   │   ├── transform.ts
│   │   ├── random.ts
│   │   └── validators.ts
│   │
│   └── types/
│       ├── user.ts
│       ├── wall.ts
│       ├── layout.ts
│       └── problem.ts
│
├── cloudfunctions/
│   ├── login/
│   ├── saveProblem/
│   ├── deleteProblem/
│   └── adminLayout/
│
├── tools/
│   └── annotator/
│       ├── app/
│       ├── static/
│       ├── data/
│       ├── requirements.txt
│       └── README.md
│
├── scripts/
│   ├── seed.ts
│   └── migrate-layout.ts
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── product-rules.md
│   └── manual-test.md
│
├── README.md
└── .gitignore
```

---

# 8. 用户身份模型

这是项目硬性架构约束。

禁止业务数据直接把：

```text
openid
```

作为用户主键或业务外键。

必须增加 CruxSet 自己的用户层。

---

# 9. users

建议：

```ts
interface User {
    id: string

    openid: string

    unionid?: string

    displayName?: string
    avatarUrl?: string

    createdAt: number
    updatedAt: number
}
```

身份关系：

```text
微信
 ↓
OpenID
 ↓
users.openid
 ↓
users.id
 ↓
CruxSet Business Data
```

---

# 10. 业务数据引用用户

所有业务数据只能保存：

```text
userId
```

例如：

```text
problems.createdBy
```

保存：

```text
usr_xxx
```

而不是：

```text
openid
```

---

# 11. 未来身份扩展

未来如果增加：

```text
Apple
手机号
Google
微信 App
公众号
```

再拆成：

```text
users
```

和：

```text
user_identities
```

例如：

```text
user_identities
-------------------
userId
provider
providerUserId
```

Phase 1 暂不实现。

---

# 12. ID 设计

数据库内部对象全部使用不可变 ID。

推荐：

```text
usr_xxx
wall_xxx
layout_xxx
problem_xxx
```

可以使用：

```text
ULID
```

或者 CloudBase `_id`。

不要使用用户可见编号作为数据库主键。

---

# 13. Wall

Wall 表示：

> 一面真实物理攀岩墙。

示例：

```json
{
  "id": "wall_001",

  "name": "日坛 Spraywall",

  "description": "",

  "activeLayoutId": "layout_202608",

  "angleOptions": [
    20,
    25,
    30,
    35,
    40,
    45
  ],

  "createdAt": 0,
  "updatedAt": 0
}
```

---

# 14. Layout

Layout 表示：

> 某面墙某一次装点布局。

因为 Spraywall 会 Reset，因此：

```text
Wall
 ├── Layout 2026-08
 ├── Layout 2026-12
 └── Layout 2027-04
```

不能覆盖历史 Layout。

---

# 15. Layout Phase 1

```json
{
  "id": "layout_202608",

  "wallId": "wall_001",

  "name": "2026-08 Layout",

  "imageFileId": "cloud://...",

  "imageWidth": 4032,
  "imageHeight": 3024,

  "geometryType": "circle",

  "version": 1,

  "holds": [],

  "createdAt": 0,
  "updatedAt": 0
}
```

---

# 16. Hold Phase 1

Phase 1：

```json
{
  "id": "H001",

  "x": 0.4231,
  "y": 0.3187,

  "radius": 0.018,

  "kind": "hold"
}
```

支持：

```text
hold
volume
```

暂时不分类：

```text
jug
crimp
sloper
pinch
pocket
```

---

# 17. 坐标系统

数据库禁止保存屏幕像素坐标。

统一使用：

```text
0 ~ 1
```

归一化坐标。

例如：

```text
normalizedX = imageX / imageWidth
normalizedY = imageY / imageHeight
```

因此：

```text
x = 0.5
y = 0.5
```

永远表示图片中心。

---

# 18. Problem

Problem 表示一条线路。

完整结构：

```ts
interface Problem {

    id: string

    number: string

    wallId: string
    layoutId: string

    name?: string
    description?: string

    angle: number

    grade: string

    footRule:
        | 'feet_follow'
        | 'specified'
        | 'all'

    holds: {

        start: string[]

        foot: string[]

        hand: string[]

        assist: string[]

        finish: string[]
    }

    createdBy: string

    createdAt: number
    updatedAt: number
}
```

---

# 19. 自动线路编号

每条 Problem 保存：

```text
id
```

和：

```text
number
```

两者不同。

例如：

```text
id:
problem_01JXYZ...

number:
CS-000128
```

用户看到：

```text
CS-000128
```

数据库关联使用：

```text
problem.id
```

---

# 20. 线路名称

线路名称：

```text
name
```

可选。

例如：

```text
左侧动态
```

因此显示：

```text
CS-000128 · 左侧动态
```

如果没有名字：

```text
CS-000128
```

---

# 21. 线路说明

```text
description
```

可选。

例如：

```text
起步后右手直接上蓝色大点。
```

Phase 1 可以限制合理长度，例如：

```text
<= 500 字
```

---

# 22. 线路难度

Phase 1 使用：

```text
V0
V1
V2
...
V12
```

暂时不要：

```text
V4+
V4-
```

未来可以扩展。

---

# 23. 岩点角色

Problem 中支持五类角色：

```text
Start
Foot
Hand
Assist
Finish
```

---

# 24. UI 颜色

统一使用：

```text
Start
绿色

Foot
黄色

Hand
蓝色

Assist
橙色

Finish
紫色
```

这套颜色必须在：

```text
线路编辑
线路详情
图例
分享页面
```

保持一致。

红色保留用于：

```text
错误
删除
警告
```

---

# 25. Foot Rule

这是 CruxSet Phase 1 的正式业务规则。

支持：

```ts
type FootRule =
  | 'feet_follow'
  | 'specified'
  | 'all'
```

默认：

```text
feet_follow
```

---

# 26. feet_follow

默认模式。

规则：

> 线路所有手类点都允许脚踩，同时可以设置额外的黄色 Foot Only 岩点。

手类点包括：

```text
Start
Hand
Assist
Finish
```

权限：

| 类型 | 手 | 脚 |
|---|---|---|
| Start | ✓ | ✓ |
| Hand | ✓ | ✓ |
| Assist | ✓ | ✓ |
| Finish | ✓ | ✓ |
| Foot | ✗ | ✓ |

因此：

```text
黄色 = Foot Only
```

---

# 27. specified

规则：

> 脚只能踩黄色 Foot。

权限：

| 类型 | 手 | 脚 |
|---|---|---|
| Start | ✓ | ✗ |
| Hand | ✓ | ✗ |
| Assist | ✓ | ✗ |
| Finish | ✓ | ✗ |
| Foot | ✗ | ✓ |

此模式必须：

```text
foot.length >= 1
```

---

# 28. all

规则：

> 当前 Layout 所有允许踩的岩点都可以作为脚点。

手类点仍然定义线路手部动作。

通常：

```text
foot = []
```

即可。

Phase 1 不需要强制禁止 foot，但 UI 默认不要求额外设置黄色脚点。

---

# 29. 默认 Foot Rule

新建 Problem 时：

```ts
footRule = 'feet_follow'
```

用户可以主动修改。

---

# 30. 线路创建完整流程

用户：

```text
选择墙面
    ↓
选择 Layout
    ↓
点击「设置线路」
    ↓
选择 Angle
    ↓
选择 Grade
    ↓
Foot Rule
默认 feet_follow
    ↓
设置岩点
    ↓
Start
Foot
Hand
Assist
Finish
    ↓
可选线路名称
    ↓
可选线路说明
    ↓
保存
    ↓
服务器生成线路编号
```

---

# 31. 墙面选择

首页：

```text
CruxSet

选择墙面

┌──────────────────────┐
│ 日坛 Spraywall        │
│ Active Layout         │
└──────────────────────┘

┌──────────────────────┐
│ Wall B               │
└──────────────────────┘
```

不要把产品写死为只有一面 Spraywall。

---

# 32. Layout 选择

进入 Wall 后允许选择：

```text
Active Layout
```

未来也允许查看：

```text
历史 Layout
```

Phase 1 至少保证数据模型支持。

---

# 33. Wall Detail

推荐：

```text
日坛 Spraywall

Layout:
2026-08

Angle:
20° 25° 30° 35° 40° 45°

Grade:
全部 V2 V3 V4 V5 V6 ...

[搜索线路...]

--------------------------------

CS-000121
V4 · 35°

CS-000122 · 左侧动态
V4 · 35°

CS-000123
V4 · 35°

--------------------------------

[ 🎲 随机线路 ]

[ + 设置线路 ]
```

---

# 34. 线路筛选上下文

用户选择：

```text
Wall
+
Layout
+
Angle
+
Grade
```

后得到：

```text
Filtered Problems
```

后续：

```text
搜索
顺序浏览
随机线路
```

全部基于这个集合。

---

# 35. 搜索线路

支持：

```text
线路编号
```

或者：

```text
线路名称
```

搜索。

例如：

```text
128
```

可以匹配：

```text
CS-000128
```

输入：

```text
左侧动态
```

匹配：

```text
CS-000128 · 左侧动态
```

名称搜索建议：

```text
case insensitive
substring match
```

---

# 36. 默认排序

线路列表默认：

```text
Problem.number ASC
```

例如：

```text
CS-000121
CS-000122
CS-000123
...
```

---

# 37. 顺序线路模式

线路详情支持：

```text
← 上一条

CS-000128

下一条 →
```

上一条和下一条必须基于：

```text
当前 Filtered Problems
```

不能跳到其他：

```text
Wall
Layout
Angle
Grade
```

---

# 38. 随机线路

用户可以：

```text
🎲 随机线路
```

随机范围：

```text
当前 Wall
+
当前 Layout
+
当前 Angle
+
当前 Grade
```

---

# 39. 随机规则

推荐：

```text
一轮内不重复
```

例如当前：

```text
35°
V4
```

有 18 条线路。

创建：

```text
Random Queue
```

使用 Fisher-Yates Shuffle。

用户：

```text
🎲 CS-000132
↓
换一条
↓
🎲 CS-000127
↓
换一条
↓
🎲 CS-000145
```

直到 18 条全部使用。

然后：

```text
重新 Shuffle
```

---

# 40. Random Session

Phase 1 不需要保存训练历史。

Random Queue 可以：

```text
只存在客户端内存
```

或者：

```text
session storage
```

即可。

不要为了随机线路增加复杂后端。

---

# 41. Canvas

墙面交互全部使用：

```text
Canvas 2D
```

不要：

```text
一个 Hold = 一个 View
```

避免 300~600 个 DOM/WXML 节点。

---

# 42. View Transform

维护：

```ts
interface ViewTransform {

    scale: number

    offsetX: number

    offsetY: number
}
```

转换：

```text
screenX =
imageX × scale + offsetX

screenY =
imageY × scale + offsetY
```

逆变换：

```text
imageX =
(screenX - offsetX) / scale

imageY =
(screenY - offsetY) / scale
```

---

# 43. 手势

必须支持：

```text
单指拖动
双指缩放
单击岩点
```

优先级：

```text
2 fingers
→ zoom

1 finger + movement
→ pan

1 finger + short/no movement
→ tap
```

---

# 44. Tap 判定

建议：

```text
movement <= 8 px

duration <= 300 ms
```

避免拖动结束时误选 Hold。

---

# 45. Zoom

建议：

```text
minScale =
fit image width

maxScale =
minScale × 5
```

Zoom 应以双指中心作为 anchor。

---

# 46. Phase 1 Hold Hit Test

Circle：

```text
dx² + dy² <= radius²
```

如果多个 Hold 同时命中：

```text
1. 普通 hold 优先于 volume

2. 距离中心最近

3. radius 更小优先
```

---

# 47. 自动吸附

用户不需要非常精准点击。

如果没有直接命中：

```text
snapRadiusScreen ≈ 15~25 px
```

搜索最近 Hold。

必须把屏幕 Snap Radius 通过：

```text
scale
```

换算到图片坐标。

---

# 48. Problem Editor

页面主要结构：

```text
┌───────────────────────┐
│ Wall / Layout          │
│ 35° · V4               │
│ Feet Follow            │
├───────────────────────┤
│                       │
│                       │
│     Wall Canvas       │
│                       │
│                       │
├───────────────────────┤
│ Start Foot Hand       │
│ Assist Finish         │
│ Undo Clear Save       │
└───────────────────────┘
```

---

# 49. 角色选择

例如当前：

```text
Hand
```

点击 H035：

```text
holds.hand += H035
```

如果再次点击：

```text
取消
```

---

# 50. 角色冲突

默认：

> 一个 Hold 同时只能拥有一个显式线路角色。

如果 H035 当前是：

```text
Hand
```

用户切换：

```text
Foot
```

再点击：

```text
H035
```

则：

```text
Hand → Foot
```

不要同时保留两个显式角色。

---

# 51. Undo

Problem Editor 必须支持：

```text
Undo
```

至少覆盖：

```text
Add Hold
Remove Hold
Change Role
```

---

# 52. 保存校验

所有 Problem 必须：

```text
Wall 存在
Layout 存在
Angle 合法
Grade 合法
FootRule 合法
Start >= 1
Finish >= 1
```

所有 Hold ID 必须属于：

```text
layoutId
```

---

# 53. Foot Rule 校验

## feet_follow

```text
foot >= 0
```

允许黄色 Foot Only。

---

## specified

```text
foot >= 1
```

---

## all

```text
foot >= 0
```

通常为空。

---

# 54. 服务端校验

不能只依赖前端。

Cloud Function：

```text
saveProblem
```

必须重新验证：

```text
User
Wall
Layout
Angle
Grade
FootRule
Hold IDs
```

---

# 55. 线路编号生成

线路编号必须：

> 服务端生成。

禁止客户端自己：

```text
max(number) + 1
```

避免并发重复。

推荐：

```text
CS-000001
CS-000002
...
```

需要实现原子计数器。

例如：

```text
counters
```

集合：

```json
{
  "id": "problem_number",
  "value": 128
}
```

创建线路时：

```text
transaction
 ↓
value + 1
 ↓
CS-000129
```

---

# 56. Problem Detail

显示：

```text
CS-000128 · 左侧动态

日坛 Spraywall
2026-08 Layout

35°
V4

脚点规则：
手脚同点

[Wall Canvas]

说明：
起步后右手直接上蓝色大点。

← 上一条

🎲 换一条

下一条 →
```

---

# 57. Foot Rule 中文显示

```text
feet_follow
→ 手脚同点

specified
→ 指定脚点

all
→ 全墙脚点
```

必要时增加简短说明。

---

# 58. 微信分享

Problem Detail：

```ts
onShareAppMessage()
```

路径：

```text
/pages/problem/detail?id=problem_xxx
```

体验成员打开后直接进入：

```text
对应 Problem
```

---

# 59. 管理员权限

增加：

```text
admins
```

但只引用：

```text
userId
```

禁止：

```text
openid
```

例如：

```json
{
  "userId": "usr_xxx",
  "role": "admin"
}
```

---

# 60. 管理员鉴权

前端可以：

```text
隐藏管理入口
```

但安全判断必须在：

```text
Cloud Function
```

重新验证：

```text
currentUser.id
```

是否存在于：

```text
admins
```

---

# 61. Phase 1 建墙

管理员：

```text
创建 Wall
 ↓
上传 Wall Image
 ↓
创建 Layout
 ↓
进入 Layout Editor
 ↓
连续点击 Hold
 ↓
H001
H002
H003
...
 ↓
调整
 ↓
发布
```

---

# 62. 快速标点

不能：

```text
点击
→ 弹窗
→ 保存
→ 下一点
```

必须支持：

```text
Continuous Add Mode
```

例如：

```text
+ Add Hold

click
→ H001

click
→ H002

click
→ H003
```

默认：

```text
kind = hold

radius = defaultRadius
```

---

# 63. 编辑 Hold

管理员可以：

```text
拖动中心
调整 radius
hold / volume
删除
Undo
```

Undo 至少：

```text
50 steps
```

---

# 64. Layout 图片

保存：

```text
Original
```

同时日常小程序使用：

```text
Display Image
```

建议最长边：

```text
1600~2048 px
```

---

# 65. CloudBase Collections

Phase 1：

```text
users
walls
layouts
problems
admins
counters
```

暂时不要增加：

```text
comments
likes
followers
training
ascents
```

---

# 66. Cloud Functions

## login

流程：

```text
wxContext.OPENID
 ↓
users.openid
 ↓
不存在：
创建 User
 ↓
返回 user.id
```

---

## saveProblem

负责：

```text
身份
校验
编号生成
Problem 保存
```

---

## deleteProblem

允许：

```text
Problem 创建者
或
Admin
```

---

## adminLayout

负责：

```text
createWall
createLayout
updateLayout
publishLayout
```

---

# 67. 缓存

Wall / Layout 低频变化。

本地缓存：

```text
layout:{layoutId}:{version}
```

version 不变：

```text
使用缓存
```

version 更新：

```text
重新下载
```

---

# 68. Problem Draft

线路编辑过程中：

```text
wx.setStorageSync()
```

保存 Draft：

```text
problemDraft:{layoutId}
```

保存成功后：

```text
delete draft
```

网络失败时：

```text
不能丢失用户线路
```

---

# 69. Phase 1 明确不开发

禁止自行加入：

```text
AI 自动识别岩点
AI 出线路
排行榜
评论
点赞
关注
好友
聊天
复杂用户主页
完攀统计
训练计划
独立 Web 后台
独立 Server
GPU
```

---

# 70. Phase 1 Definition of Done

必须：

1. 微信体验版正常运行。
2. 支持多个 Wall。
3. Wall 支持 Layout。
4. 管理员可以人工创建至少 300 个 Hold。
5. 手机 Canvas 可以平滑缩放。
6. 可以拖动墙面。
7. 密集 Hold 可以准确选择。
8. 支持 Start。
9. 支持 Foot。
10. 支持 Hand。
11. 支持 Assist。
12. 支持 Finish。
13. 五类角色颜色正确。
14. 支持 feet_follow。
15. feet_follow 为默认。
16. 支持 specified。
17. 支持 all。
18. 支持 Angle。
19. 支持 Grade。
20. 自动生成线路编号。
21. 支持可选 Name。
22. 支持可选 Description。
23. 可以保存 Problem。
24. 可以读取 Problem。
25. 可以按 Wall 过滤。
26. 可以按 Layout 过滤。
27. 可以按 Angle 过滤。
28. 可以按 Grade 过滤。
29. 可以按 Number 搜索。
30. 可以按 Name 搜索。
31. 可以按 Number 顺序浏览。
32. 支持上一条/下一条。
33. 支持随机线路。
34. 一轮随机不重复。
35. 支持微信分享。
36. Problem 使用 user.id，不使用 OpenID。
37. Problem 只引用 Hold ID。
38. 不同手机尺寸 Hold 坐标正确。

---

# 71. Phase 2

Phase 2 不重构业务层。

只增加：

```text
Local Annotator
+
Polygon Geometry
```

---

# 72. AI 模型

第一实现：

```text
MobileSAM
```

原因：

```text
CPU 可运行
Point Prompt
模型较轻
```

不要求 NVIDIA GPU。

---

# 73. Phase 2 环境

```text
Python 3.11
PyTorch
MobileSAM
OpenCV
Pillow
NumPy
FastAPI
Uvicorn
```

---

# 74. Annotator 启动

```bash
cd tools/annotator

python -m venv .venv
```

Linux/macOS：

```bash
source .venv/bin/activate
```

Windows：

```powershell
.venv\Scripts\activate
```

安装：

```bash
pip install -r requirements.txt
```

启动：

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8765
```

打开：

```text
http://127.0.0.1:8765
```

---

# 75. Phase 2 核心原则

不要：

```text
Image
 ↓
AI 自动寻找全部 400 Holds
```

而是：

```text
已有 Hold Center
 ↓
SAM Point Prompt
 ↓
Mask
 ↓
Polygon
```

---

# 76. Phase 1 → Phase 2 升级

例如 Phase 1：

```text
H001 center
H002 center
H003 center
```

Phase 2：

```text
H001.center
 ↓
SAM
 ↓
H001.polygon

H002.center
 ↓
SAM
 ↓
H002.polygon
```

必须：

> 保持 Hold ID 不变。

这样所有旧 Problem 自动兼容。

---

# 77. SAM Embedding

图片：

```text
Image
 ↓
Image Encoder
 ↓
Embedding
```

只执行一次。

之后：

```text
H001 prompt
→ mask

H002 prompt
→ mask
```

禁止每次点击重新执行 Encoder。

---

# 78. Working Image

AI 工作图片最长边：

```text
≈ 1600 px
```

保持比例。

最终 Polygon：

```text
Working Pixel
 ↓
Normalized
 ↓
0~1
```

---

# 79. Mask → Polygon

OpenCV：

```python
findContours()
```

取最大外轮廓。

然后：

```python
approxPolyDP()
```

初始：

```text
epsilon =
0.005 × perimeter
```

根据真实墙测试调整。

目标：

```text
10~50 points / Hold
```

---

# 80. Phase 2 Hold

```json
{
  "id": "H001",

  "x": 0.4231,
  "y": 0.3187,

  "bbox": [
    0.401,
    0.295,
    0.447,
    0.351
  ],

  "polygon": [
    [0.410, 0.301],
    [0.432, 0.297],
    [0.447, 0.318],
    [0.438, 0.345],
    [0.412, 0.351],
    [0.401, 0.325]
  ],

  "kind": "hold"
}
```

保留：

```text
x
y
```

不要因为有 Polygon 删除 center。

---

# 81. Polygon Hit Test

第一层：

```text
bbox
```

第二层：

```text
pointInPolygon()
```

使用：

```text
Ray Casting
```

---

# 82. 重叠规则

如果：

```text
Volume
+
Hold
```

同时命中：

```text
Hold 优先
```

多个 Hold：

```text
面积更小优先
```

---

# 83. Phase 2 Annotator UI

```text
┌──────────────────────────────────────┐
│ CruxSet Vision                       │
├─────────────────────────┬────────────┤
│                         │ H001 ✓     │
│                         │ H002 ✓     │
│     Wall Image          │ H003 ⚠     │
│                         │ H004 ✓     │
│                         │ ...        │
├─────────────────────────┴────────────┤
│ Add Retry Delete Undo Save Export    │
└──────────────────────────────────────┘
```

---

# 84. AI 审核

模型输出：

```text
✓ 正常
```

或者：

```text
⚠ 可疑
```

可疑条件：

```text
面积异常小
面积异常大
polygon < 3
大片接触图片边缘
```

不要自动删除。

---

# 85. Retry

SAM 如果返回多个 Candidate：

```text
Candidate 1
Candidate 2
Candidate 3
```

默认：

```text
最高 score
```

管理员可以：

```text
Retry / Next Candidate
```

---

# 86. Negative Point

Phase 2 后半可以增加：

```text
Shift + Click
```

作为：

```text
Negative Prompt
```

但不是 Phase 2 初版阻塞功能。

---

# 87. 自动保存

Annotator：

```text
每次修改
 ↓
debounce 500ms
 ↓
session.json
```

防止浏览器崩溃丢失标注。

---

# 88. Export

导出：

```text
layout.json
```

数据格式必须直接兼容：

```text
CloudBase Layout
```

禁止创建第二套格式。

---

# 89. Layout Version

小修正：

```text
version += 1
```

重新装点：

```text
NEW layoutId
```

禁止覆盖历史 Layout。

---

# 90. Phase 2 Definition of Done

必须：

1. 本地工具可以打开真实墙图。
2. CPU 可以完成 Embedding。
3. Hold Center 可以作为 Point Prompt。
4. 普通岩点能得到合理 Mask。
5. Mask 能转 Polygon。
6. Polygon 可以人工审核。
7. 可以 Retry。
8. 可以 Delete。
9. 可以 Add Hold。
10. 可以 Undo。
11. 可以自动保存。
12. 可以导入 Phase 1 Layout。
13. H001 等 ID 保持不变。
14. 可以批量升级已有 Holds。
15. 可以 Export。
16. 小程序支持 Polygon。
17. Polygon Hit Test 正确。
18. 旧 Problem 无需迁移。
19. 手机仍保持良好性能。

---

# 91. Phase 2 明确不做

禁止扩展：

```text
YOLO 全自动检测
Grounding DINO
云 GPU
视觉 API
训练专用模型
任意用户上传墙图自动识别
```

这些属于：

```text
Phase 3+
```

---

---

# 91.1 用户自主管理墙面与线路（后续阶段）

不设置“提交审核”步骤。用户创建或修改自己的墙面、Layout 和线路后立即生效。

```text
用户创建墙面 / 上传墙图
        ↓
自动识别候选岩点 + 用户人工校正
        ↓
保存 Layout 与线路（立即生效）
```

数据访问仍通过云函数执行所有权校验：普通用户只能管理 `ownerId` 等于当前 `users.id` 的墙面及其 Layout，且只能管理 `createdBy` 等于自己的线路；管理员可管理全部内容。公开浏览由 `visibility` 控制，不以审核状态控制。新建 Wall 的 `visibility` 默认值为 `private`；创建者可在创建或编辑时改为 `public`。

正式集合不向客户端开放写权限；用户上传图片使用其专属存储路径，后续增加相应的上传记录与存储规则。

# 92. 单元测试

重点测试：

## geometry

```text
circleHitTest
bboxHitTest
pointInPolygon
nearestHold
snapHold
```

## transform

```text
imageToScreen
screenToImage
normalize
denormalize
zoomAroundAnchor
```

要求：

```text
image
→ screen
→ image
```

误差接近 0。

---

# 93. Problem Validation Test

覆盖：

```text
无 Start
无 Finish
非法 Hold
非法 Angle
非法 Grade
非法 FootRule

specified 无 Foot

feet_follow 无 Foot
feet_follow 有 Foot

all 无 Foot
```

---

# 94. User Identity Test

必须测试：

```text
OpenID A
 ↓
User A
 ↓
user.id
```

业务表中不得出现：

```text
openid
```

作为业务外键。

---

# 95. 真机测试

至少：

```text
1 Android
+
1 iPhone
```

测试：

```text
Pan
Zoom
Tap
Zoom 后 Tap
小 Hold
重叠 Hold
Volume Hold
连续选点
FootRule
线路保存
搜索
上一条
下一条
随机
分享
```

---

# 96. 开发任务顺序

Codex 按以下顺序实施。

## Phase 1A — Foundation

```text
Task 01
初始化 CruxSet 项目。

Task 02
建立 TypeScript Types。

Task 03
实现 users 身份模型。

Task 04
实现 Wall / Layout / Hold Mock Data。

Task 05
建立 CloudBase Collections。
```

---

# Phase 1B — Wall Canvas

```text
Task 06
显示 Wall Image。

Task 07
实现 Coordinate Transform。

Task 08
实现 Pan。

Task 09
实现 Pinch Zoom。

Task 10
实现 Circle Hold Render。

Task 11
实现 Hit Test。

Task 12
实现 Snap Selection。

Task 13
真机验证 Canvas。
```

---

# Phase 1C — Problem

```text
Task 14
实现 Problem Model。

Task 15
实现五种 Hold Role。

Task 16
实现颜色系统。

Task 17
实现 FootRule。

Task 18
默认 feet_follow。

Task 19
实现 Problem Editor。

Task 20
实现 Undo。

Task 21
实现 Draft。
```

---

# Phase 1D — Backend

```text
Task 22
login Cloud Function。

Task 23
saveProblem。

Task 24
线路编号原子生成。

Task 25
Problem Validation。

Task 26
deleteProblem。

Task 27
Admin Permission。
```

---

# Phase 1E — Browse

```text
Task 28
Wall Selector。

Task 29
Layout Selector。

Task 30
Angle Filter。

Task 31
Grade Filter。

Task 32
Number Search。

Task 33
Name Search。

Task 34
Number ASC Sort。

Task 35
Previous / Next。

Task 36
Random Queue。

Task 37
Fisher-Yates Shuffle。

Task 38
Random No Repeat。
```

---

# Phase 1F — Admin

```text
Task 39
Admin Layout Editor。

Task 40
Continuous Add Hold。

Task 41
Move Hold。

Task 42
Resize Hold。

Task 43
Hold / Volume。

Task 44
Admin Undo。

Task 45
真实墙标注。
```

---

# Phase 1G — Finish

```text
Task 46
Problem Detail。

Task 47
微信分享。

Task 48
Error Handling。

Task 49
Cache。

Task 50
Android 真机测试。

Task 51
iPhone 真机测试。

Task 52
Phase 1 Bug Fix。

Task 53
Phase 1 Freeze。
```

---

# Phase 2

```text
Task 54
建立 tools/annotator。

Task 55
实现图片浏览。

Task 56
集成 MobileSAM。

Task 57
Image Embedding Cache。

Task 58
Point Prompt。

Task 59
Mask Preview。

Task 60
Mask → Polygon。

Task 61
Polygon Simplification。

Task 62
Candidate Retry。

Task 63
Import Phase 1 Layout。

Task 64
Center → Polygon Batch Upgrade。

Task 65
Review UI。

Task 66
Auto Save。

Task 67
Export JSON。

Task 68
小程序 Polygon Render。

Task 69
BBox Hit Test。

Task 70
Point In Polygon。

Task 71
真实 Layout Migration。

Task 72
真机性能测试。

Task 73
Phase 2 Freeze。
```

---

# 97. Codex 每个 Task 的执行规则

每个 Task 必须：

```text
1. 先阅读当前代码。

2. 明确本 Task 修改范围。

3. 不顺手开发后续功能。

4. 实现。

5. 添加必要测试。

6. 执行测试。

7. 修复失败。

8. 执行 TypeScript/Python 检查。

9. 更新必要文档。

10. 汇报修改文件。

11. 汇报测试结果。

12. 汇报仍存在的问题。
```

---

# 98. 产品优先级

任何冲突都按照：

```text
数据正确性

>

手机墙面交互体验

>

线路创建效率

>

线路浏览效率

>

真实岩馆可用性

>

AI 分割效果

>

附加功能
```

处理。

---

# 99. Phase 1 最终用户流程

```text
                 CruxSet
                    │
                    ▼
                 选择墙面
                    │
                    ▼
                选择 Layout
                    │
                    ▼
                 选择角度
                    │
                    ▼
                 选择难度
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
        搜索       顺序       随机
          │         │         │
          └─────────┼─────────┘
                    ▼
                 查看线路
                    │
             ┌──────┴──────┐
             ▼             ▼
          上/下一条       分享


或者：


Wall
 ↓
Layout
 ↓
设置线路
 ↓
Angle
 ↓
Grade
 ↓
Foot Rule
默认 Feet Follow
 ↓
选择：

绿色 Start
黄色 Foot Only
蓝色 Hand
橙色 Assist
紫色 Finish
 ↓
可选 Name
 ↓
可选 Description
 ↓
Save
 ↓
服务端生成
CS-000XXX
```

---

# 100. Phase 2 最终流程

```text
Phase 1 Layout
      │
      ▼
H001 Center
      │
      ▼
MobileSAM
      │
      ▼
H001 Mask
      │
      ▼
Polygon

H002 Center
      │
      ▼
MobileSAM
      │
      ▼
Polygon

...
      │
      ▼
人工审核
      │
      ▼
Export
      │
      ▼
Layout Version + 1
      │
      ▼
CloudBase
      │
      ▼
小程序重新加载
      │
      ▼
Circle
  ↓
Polygon


旧线路：

CS-000001
CS-000002
CS-000003

仍引用：

H001
H002
H003

因此：

Problem 数据无需修改。
```

---

# 101. 最终硬性约束

开发过程中必须始终遵守以下规则。

### 1

```text
Problem
```

只引用：

```text
Hold ID
```

不引用屏幕坐标。

### 2

业务数据只引用：

```text
users.id
```

不引用：

```text
openid
```

### 3

OpenID 只用于：

```text
微信身份 → CruxSet User
```

映射。

### 4

Wall 与 Layout 必须分离。

### 5

重新装点必须创建：

```text
New Layout
```

不能覆盖历史布局。

### 6

数据库坐标统一：

```text
0~1 normalized
```

### 7

Problem 默认：

```text
footRule = feet_follow
```

### 8

Feet Follow：

```text
Start
Hand
Assist
Finish
```

均可脚踩。

黄色：

```text
Foot
```

只能脚踩。

### 9

Specified：

```text
脚只能使用黄色 Foot。
```

### 10

All：

```text
当前 Layout 全墙可踩岩点均可作为脚点。
```

### 11

线路编号：

```text
服务器自动生成
```

并且：

```text
Problem ID != Problem Number
```

### 12

AI 不是 Phase 1 前置条件。

### 13

Phase 2 AI 只负责：

```text
Hold Geometry
```

不能侵入 Problem 核心业务逻辑。

### 14

前两阶段不得因为未来可能需求而过度设计。

---

# 102. 最终交付目标

完成 Phase 1 后，CruxSet 必须已经能够在真实攀岩馆中完成：

> **选墙 → 选角度 → 找线路 → 看线路 → 随机线路 → 创建线路 → 分享线路**

完成 Phase 2 后，在不修改历史线路的情况下，将：

> **人工圆形岩点**

升级为：

> **AI 辅助生成的真实岩点 Polygon**

整个项目的核心目标不是：

> 做一个复杂的 AI 攀岩 Demo。

而是：
