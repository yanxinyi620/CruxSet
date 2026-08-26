# CruxSet Phase 1 实施摘要

> 权威完整规格见 [CruxSet 微信小程序完整开发实施方案 v1.0](./CruxSet-微信小程序完整开发实施方案-v1.0.md)。如本摘要与完整规格冲突，以完整规格为准。

## 目标

构建一个微信小程序 MVP，用于数字化攀岩训练墙，支持墙面/Layout、人工岩点标注、线路创建与线路浏览。

## 核心规则

- 线路引用 Hold ID，不引用屏幕坐标。
- 岩点类型：`start`、`hand`、`assist`、`foot`、`finish`。
- 默认 `footRule` 为 `feet_follow`：所有手类点可踩；黄色 `foot` 只能脚踩。
- `specified`：只能踩线路指定的 `foot` 点。
- `all`：所有可踩岩点均可踩，通常无需额外指定 Foot。
- 线路编号自动生成且唯一；支持自定义名称。
- 线路筛选顺序：Wall → Layout → Angle → Grade。
- 搜索同时匹配编号与名称。
- 顺序浏览按当前筛选结果的编号升序；随机浏览在当前结果集内 Fisher-Yates 洗牌，单轮不重复。

## Phase 1 功能

1. 墙面与 Layout 列表/创建。
2. Canvas 墙面图片上的 Hold 创建、移动、删除与类型设置。
3. 线路创建、编辑、详情查看。
4. 按墙面、Layout、角度、难度筛选线路。
5. 按编号/名称搜索，上一条/下一条，随机训练。
6. 微信分享所需的线路详情数据结构与页面入口。

## 数据模型

```ts
type HoldType = 'start' | 'hand' | 'assist' | 'foot' | 'finish'
type FootRule = 'feet_follow' | 'specified' | 'all'

interface Hold {
  id: string
  layoutId: string
  type: HoldType
  x: number
  y: number
  radius: number
  polygon?: Array<[number, number]>
}

interface Problem {
  id: string
  number: string
  name?: string
  wallId: string
  layoutId: string
  angle: number
  grade: string
  footRule: FootRule
  holds: {
    start: string[]
    hand: string[]
    assist: string[]
    foot: string[]
    finish: string[]
  }
  createdAt: string
}
```

## 架构与边界

首轮采用可在本地运行的 TypeScript 核心域模块，页面层通过 repository 接口访问数据；数据 repository 先使用内存/本地适配器，后续可替换为 CloudBase，不改变业务逻辑。随机、筛选、搜索、编号生成和脚点规则全部作为纯函数测试。

## 验收标准

- 默认创建线路使用 `feet_follow`。
- 搜索能命中编号或名称，且只在当前筛选结果中导航。
- 顺序浏览严格按编号升序。
- 随机一轮内不重复，耗尽后可重新洗牌。
- 无效 Hold ID、空线路、非法角度/难度输入会被拒绝。
- 核心测试通过，项目可构建。

## 暂不包含

用户社交、评论、排行榜、云端鉴权、AI 自动识别与 Polygon 自动生成。这些属于后续阶段。
