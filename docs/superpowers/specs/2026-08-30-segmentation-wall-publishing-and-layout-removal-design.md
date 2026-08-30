# 分割结果发布与 Wall 扁平化设计

日期：2026-08-30  
状态：已确认

## 1. 背景与目标

Spraywall 分割实验台已经可以保存人工校准结果，并按原图像素坐标导出岩点 polygon 与 SVG。CruxSet 当前使用 `Wall → Layout` 两层结构：墙面保存业务信息，Layout 保存图片与岩点几何，线路同时引用墙面和 Layout。

个人使用场景不需要维护“同一墙面的多个布局版本”。每次校准结果都可以作为一个独立、可浏览和可定线的对象管理，因此本设计彻底移除 Layout 层，将图片和岩点几何合并进 Wall。实验台通过本机管理员发布接口一键创建新 Wall。

目标如下：

- 在实验台选择一个已保存的校准结果，并一键发布到本机 CruxSet；
- 每次发布都创建一面新的 Wall，不覆盖或修改已有 Wall；
- 发布成功后，刷新 CruxSet 浏览页即可看到新 Wall 并进行定线；
- 管理员账户可在“我的墙面”中查看、重命名和删除新 Wall；
- SVG 只用于预览和导出，结构化 polygon JSON 是权威几何数据；
- 删除 Layout 实体、相关接口和版本规则，使线路只绑定 Wall。

## 2. 产品规则

### 2.1 发布语义

- 发布入口位于分割实验台的校准结果区域。
- 用户先选择一个已保存的校准结果，再点击“发布到 CruxSet”。
- 每次主动发布都生成新的 `publishRequestId`，并创建新的 Wall。
- 同一原图或同一校准结果允许发布多次；每次都是不同 Wall。
- 发布不修改、替换或隐藏任何已有 Wall，也不迁移已有线路。
- 新 Wall 创建后立即公开可浏览，并出现在管理员“我的墙面”列表中。

### 2.2 Wall 不可变边界

Wall 尚未被线路引用时，可以重命名或删除。Wall 已有线路后：

- 仍可修改名称、描述、可见性和角度选项；
- 不允许修改原图、图片尺寸、岩点集合、岩点 ID 或 polygon；
- 不允许直接删除，必须先删除引用它的线路。

重新分割、重新校准或修改岩点几何时，应从实验台再次发布为一面新 Wall。

### 2.3 删除规则

- 无线路引用的 Wall 可以删除；删除时一并删除其专属图片。
- 有线路引用的 Wall 删除请求返回冲突错误，并提供关联线路数量。
- 共享图片只有在没有其他数据引用时才删除。
- 删除 CruxSet Wall 不删除实验台中的实验、校准结果或发布记录。
- 本阶段不增加归档功能。

## 3. 扁平数据模型

### 3.1 Wall

Wall 直接包含用于展示和定线的全部信息：

```ts
interface WallSource {
  type: "segmentation_lab"
  experimentId: string
  calibrationId: string
  publishRequestId: string
}

interface Wall {
  id: string
  name: string
  description: string
  imageFileId: string
  displayImageFileId?: string
  imageWidth: number
  imageHeight: number
  geometryType: "circle" | "polygon"
  holds: Hold[]
  angleOptions: number[]
  ownerId: string
  visibility: "private" | "public"
  source?: WallSource
  createdAt: number
  updatedAt: number
}
```

`source` 用于追踪发布来源和保证请求幂等。手工创建或迁移得到的 Wall 可以没有该字段。

### 3.2 Hold

分割服务提交原图像素坐标，CruxSet 保存归一化几何：

```ts
interface Hold {
  id: string
  x: number
  y: number
  radius: number
  kind: "hold" | "volume"
  bbox?: readonly [number, number, number, number]
  polygon?: readonly (readonly [number, number])[]
  sourceId?: string
}
```

- `id` 由 CruxSet 按稳定顺序生成，格式为 `H001`、`H002`；
- `sourceId` 保存实验台候选或校准实例 ID，仅用于追踪；
- `polygon`、`bbox`、中心点和半径全部以图片宽高归一化；
- polygon 是显示与精确命中的首选几何；中心点和半径用于回退、快速索引及现有圆形墙面兼容。

正式岩点 ID 的排序必须确定且可测试。先按 bbox 顶边从上到下排序，在同一容差带内按 bbox 左边从左到右排序，最后以 `sourceId` 作为稳定决胜字段。

### 3.3 Problem

线路只引用 Wall：

```ts
interface Problem {
  id: string
  wallId: string
  number: string
  name?: string
  description?: string
  angle: number
  grade: Grade
  footRule: FootRule
  holds: ProblemHolds
  createdBy: string
  createdAt: number
  updatedAt: number
}
```

移除 `layoutId` 和 `layoutVersion`。线路中的岩点角色继续保存 Hold ID；Wall 几何锁定保证这些引用不会漂移。

### 3.4 删除的概念

系统不再保留：

- `Layout` 实体与存储集合；
- `Wall.activeLayoutId`；
- `Problem.layoutId` 与 `Problem.layoutVersion`；
- Layout 草稿、发布、切换、版本锁定及管理接口；
- 墙面与 Layout 两套相互嵌套的管理页面。

## 4. 系统边界与数据流

```text
实验台选择已保存校准结果
        ↓
实验台服务读取原图和最终 polygon
        ↓
使用本机发布密钥调用 CruxSet 管理员发布 API
        ↓
CruxSet 校验图片和几何
        ↓
保存图片、转换 Hold、创建公开 Wall
        ↓
返回 Wall ID、岩点数量和浏览地址
        ↓
实验台保存发布记录并显示“在 CruxSet 中打开”
        ↓
CruxSet 浏览页与“我的墙面”刷新后出现新 Wall
```

实验台负责选择校准结果、读取本地产物、组装请求和展示发布状态。CruxSet 是正式 Wall ID、Hold ID、图片存储、权限和删除规则的唯一权威方。

## 5. 本机认证与权限

发布使用最小权限的静态管理员发布密钥，不引入 OAuth 或普通用户会话：

```http
Authorization: Bearer <local-publish-key>
```

- 两个服务均只监听回环地址；
- 相同密钥分别保存在实验台与 CruxSet 的本机环境配置中；
- 密钥不得进入浏览器、前端构建产物、日志、数据库或版本库；
- 该密钥只能调用分割 Wall 发布接口，不能管理账户、线路或其他管理员能力；
- CruxSet 配置指定一个现有管理员账户作为发布 Wall 的 `ownerId`；
- 日常查看、重命名和删除仍使用该管理员账户的正常登录会话。

启动时如果密钥或目标管理员配置缺失，发布接口保持不可用，并给出本机配置错误，不回退为匿名发布。

## 6. 发布 API

### 6.1 请求

新增专用接口：

```http
POST /api/admin/segmentation-walls
Content-Type: multipart/form-data
Authorization: Bearer <local-publish-key>
```

表单包含：

- `image`：校准所基于的原始墙图；
- `metadata`：UTF-8 JSON。

```json
{
  "publishRequestId": "uuid",
  "sourceExperimentId": "uuid",
  "sourceCalibrationId": "uuid",
  "wallName": "日坛 spraywall 0822 · 2026-08-30 21:37",
  "description": "由 Spraywall Lab 发布",
  "imageWidth": 3837,
  "imageHeight": 2737,
  "angleOptions": [0],
  "holds": [
    {
      "sourceId": "candidate-0092",
      "kind": "hold",
      "polygon": [[1748, 219], [1746, 229], [1751, 240]]
    }
  ]
}
```

请求中的 polygon 使用原图像素坐标。SVG 不随发布请求提交，也不由 CruxSet 解析。

### 6.2 校验与转换

CruxSet 必须验证：

- 请求密钥、请求体大小和图片 MIME 类型；
- 图片实际尺寸与 metadata 声明一致；
- calibration、experiment 和 request ID 格式合法；
- 至少存在一个岩点，数量不超过配置上限；
- 每个 polygon 至少有三个不同的有效点；
- 坐标为有限数值并位于图片范围内；
- polygon 面积大于最低阈值，不自相交且 bbox 有效；
- `kind` 只能是 `hold` 或 `volume`；
- 同一次请求中的 `sourceId` 唯一。

转换阶段计算归一化 polygon、bbox、面积质心和等效半径。若多边形质心落在凹 polygon 外，中心点改用保证位于 polygon 内的代表点。单个岩点失败时拒绝整个请求，并返回其 `sourceId` 和具体原因，不静默丢弃。

### 6.3 响应

```json
{
  "wallId": "wall-id",
  "wallName": "日坛 spraywall 0822 · 2026-08-30 21:37",
  "holdCount": 295,
  "browsePath": "/walls/wall-id",
  "created": true
}
```

相同 `publishRequestId` 的重试返回第一次成功创建的同一 Wall，并将 `created` 设为 `false`。同一个请求 ID 如果携带不同内容，返回冲突错误。

### 6.4 事务与补偿

发布在业务上必须具备原子性：

1. 完整校验请求；
2. 写入临时图片；
3. 创建 Wall 记录；
4. 将图片提升为正式媒体文件；
5. 提交发布来源与幂等记录。

任一步骤失败都不得暴露半成品 Wall。数据库事务失败时删除临时或孤立图片；正式图片提升失败时回滚 Wall。服务进程意外终止后，定期或启动时清理超过安全时限且无数据引用的临时文件。

## 7. 实验台交互

校准结果列表增加发布能力：

- 选择一个已保存的校准结果；
- 展示原图名称、尺寸、岩点数量、校准时间和上次发布记录；
- 可编辑 Wall 名称，默认值为“原图名称 · 校准时间”；
- 点击“发布到 CruxSet”；
- 发布中禁止重复点击；
- 成功后显示 Wall ID、岩点数量、发布时间和“在 CruxSet 中打开”；
- 失败时保留选择、名称和请求 ID，并允许安全重试；
- 用户再次主动点击“另存为新墙面发布”时生成新的请求 ID。

实验台在校准数据旁保存追加式发布记录，包括请求 ID、目标服务、Wall ID、时间、状态和最后一次错误。发布记录不改变校准结果本身。

## 8. CruxSet 浏览与管理

### 8.1 浏览

浏览页直接列出满足可见性和可定线条件的 Wall，不再经过 `activeLayoutId` 解析。卡片使用 Wall 自身图片、名称和岩点数量。进入 Wall 后即可选择岩点并创建线路。

公开 Wall 对所有浏览用户可见；私有 Wall 只对所有者可见。分割发布创建的 Wall 默认是 `public`。

### 8.2 我的墙面

管理员“我的”页面提供单层 Wall 管理：

- 查看并进入定线；
- 修改名称、描述、可见性和角度选项；
- 查看关联线路数量；
- 删除没有线路引用的 Wall；
- 对有线路引用的 Wall 展示删除阻止原因。

界面不再出现 Layout、当前布局、布局版本或发布布局等术语。

### 8.3 绘制与命中

Web 与小程序画布均优先绘制 polygon，并按线路角色填充或描边。点击命中优先使用 point-in-polygon；没有 polygon 的旧数据继续使用中心点和半径命中。缩放、平移和角色分配行为保持不变。

## 9. 既有数据迁移

迁移按每个既有 Layout 创建一面独立 Wall：

1. 读取原 Wall 与其所有 Layout；
2. 为每个 Layout 创建新的 Wall ID；
3. 从 Layout 复制名称、图片、尺寸、geometryType 和 holds；
4. 从原 Wall 复制描述、角度、所有者和可见性；
5. 名称优先使用 Layout 名称；缺失或重名时组合原墙面名与 Layout 名；
6. 将引用该 Layout 的 Problem 指向新 Wall ID；
7. 移除 Problem 的 `layoutId` 和 `layoutVersion`；
8. 验证每个 Problem 引用的 Hold ID 都存在于目标 Wall；
9. 验证计数、图片引用和所有权后，删除旧 Layout 与旧 Wall 数据。

迁移必须可在事务或可恢复的分阶段流程中执行。迁移前创建数据备份；任何引用校验失败都中止清理阶段并输出具体实体 ID。迁移完成后不保留双写或长期兼容层。

本地演示数据、内存仓库、SQLite、CloudBase 适配器、云函数协议和测试夹具必须同步迁移，避免不同运行模式出现两套模型。

## 10. 错误处理

- CruxSet 未启动：实验台提示本机服务不可连接并保留安全重试入口；
- 发布密钥错误：提示发布配置无效，不展示密钥内容；
- 管理员账户不存在：CruxSet 返回服务配置错误；
- 图片或 polygon 非法：返回具体字段和 `sourceId`；
- 请求超时：实验台使用相同请求 ID 查询或重试；
- 请求 ID 冲突：提示生成新发布请求，不覆盖既有 Wall；
- 数据库或媒体失败：CruxSet 回滚 Wall 并清理中间图片；
- 删除有线路的 Wall：返回冲突错误和引用数量；
- 浏览图片加载失败：保留 Wall 卡片和明确错误，不影响其他 Wall。

## 11. 测试与验收

### 11.1 单元测试

- 像素坐标到归一化坐标转换；
- polygon 合法性、自相交、面积、bbox、质心和代表点；
- Hold 稳定排序与正式 ID 生成；
- Wall 几何锁定规则；
- Problem 只绑定 Wall 后的领域规则；
- 无引用图片清理判断。

### 11.2 API 与仓库测试

- 正确、缺失和错误发布密钥；
- 合法真实图片与 295 个校准岩点发布；
- 图片尺寸不符、越界点、非法 polygon 和重复 source ID；
- 相同请求 ID 幂等重试与内容冲突；
- 媒体或数据库失败后的事务回滚；
- 无线路 Wall 删除成功；
- 有线路 Wall 删除被阻止；
- 所有仓库适配器遵守相同契约。

### 11.3 迁移测试

- 一个 Wall 一个 Layout；
- 一个 Wall 多个 Layout，转换为多个 Wall；
- Problem 正确映射到对应的新 Wall；
- Hold ID 与线路角色引用完整；
- 图片、创建者、可见性和角度保持一致；
- 迁移校验失败时不清理旧数据；
- 迁移完成后不存在 Layout 引用。

### 11.4 端到端验收

1. 在实验台选择已保存校准结果；
2. 点击发布并得到 Wall ID；
3. 刷新 CruxSet，浏览页出现新 Wall；
4. 打开新 Wall，polygon 与原图精确对齐；
5. 选择岩点完成一条线路并保存；
6. 线路重新打开后角色绑定正确；
7. 管理员“我的墙面”能看到该 Wall；
8. 有线路时删除受到保护；
9. 删除线路后可以删除 Wall；
10. 再次主动发布同一校准结果会创建另一面新 Wall。

## 12. 范围外

本阶段不包含：

- 线上或跨机器发布；
- OAuth、多管理员发布授权或密钥管理界面；
- 自动同步实验台校准结果；
- 在 CruxSet 中修改分割 polygon；
- Wall 归档或软删除；
- 同一 Wall 的版本、Layout 或几何更新；
- 从 CruxSet 反向删除实验台数据；
- 将 SVG 作为业务数据导入或解析。

## 13. 实施边界

该改动同时包含数据模型扁平化和本机发布通道，实施计划必须按可验证阶段推进：先完成领域模型与迁移能力，再迁移浏览、定线和管理流程，最后接入发布 API 与实验台按钮。任何阶段都不得长期保留新旧模型双写。
