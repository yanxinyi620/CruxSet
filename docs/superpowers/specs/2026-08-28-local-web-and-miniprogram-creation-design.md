# 本地 Web 创作工作台与小程序创作端设计

## 目标

CruxSet 同时提供本地 Web 创作工作台和微信小程序创作端。Web 优先解决大图、Polygon 与复杂创作流程；小程序保留现场上传、标注与定线能力。两端不共享草稿，也不要求同时在线。

## 架构

```text
本地浏览器 Web
  ↓
本地 FastAPI
  ├─ SQLite 数据库
  └─ 本地图片目录
  ↓ 显式发布
已发布数据包（JSON + 图片）
  ↓ 导入
CloudBase 数据库 / 云存储
  ↑
小程序 → Node 云函数
```

FastAPI 仅是本地 Web 的后端，默认由管理员 PC 启动，不部署为 CloudBase HTTP 云函数。小程序继续使用 CloudBase Node 云函数与云存储，不依赖 FastAPI 在线。

## 客户端职责

### 本地 Web 创作工作台

- 沿用现有浏览器预览的移动优先视觉语言：固定 iPhone 13 尺寸的设备框，主入口为 `线路`、`创建`、`我的` 三个页面；不改造成传统桌面后台。
- `线路` 用于浏览公开的已发布 Wall / Layout 与线路；选定 Wall 和 Layout 后可搜索、顺序浏览和随机选择线路。
- `创建` 用于新建墙面、新建 Layout、进入“我的草稿”标注，以及基于已发布 Layout 新建线路。
- `我的` 用于查看本地创建的墙面、每个 Layout 的公开/草稿状态与删除操作，以及按 Layout 展开查看、删除本地创建的线路。
- 二级页面左上角必须有返回按钮；底部三栏导航保持固定，文字层级与现有小程序主入口一致。
- 管理本地墙面、Layout 和线路。
- 从本机选择墙面图片，保存到 Web 专用本地图片目录。
- 创建草稿 Layout，进行圆点或 Polygon 岩点标注。
- 创建、查看、搜索、顺序浏览和随机浏览线路。
- 发布本地 Layout；发布后 Layout 不可编辑。
- 将已发布墙面、Layout、线路和图片导出为可校验发布包。
- 删除本地 Layout 时级联删除其本地线路；删除墙面时级联删除其全部本地 Layout 和线路。

### 微信小程序

- 继续使用原生 WXML/WXSS、CloudBase Node 云函数、CloudBase 文档数据库和云存储。
- 支持用户上传墙面图片、创建草稿 Layout、标注、发布 Layout 和创建线路。
- 公开的已发布 Layout 可浏览和定线；草稿仅创建者可在“创建 / 我的草稿”查看。
- 已发布 Layout 不可继续标注。需要修订时创建新的 Layout。

### CloudBase

- 是小程序的正式云端数据与图片存储。
- 接受小程序云函数写入，也接受受控导入工具写入已发布 Web 数据包。
- 不保存 Web 未发布草稿，不参与 Web 草稿的实时同步。

## 统一的数据语义

两端使用相同的核心实体与字段语义：`User`、`Wall`、`Layout`、`Hold`、`Problem`。

- 一个 Wall 可以包含多个 Layout。
- Layout 草稿可编辑，已发布即锁定。
- 每个已发布 Layout 独立可定线；无“活跃 Layout”概念。
- 已发布 Layout 至少含两个岩点才能定线。
- 线路引用 Hold ID，不引用屏幕坐标。
- 默认脚点规则为 `feet_follow`；`specified` 与 `all` 的既定语义保持不变。
- 删除 Layout 需要二次确认并级联删除关联线路；删除 Wall 同样级联删除其 Layout 和线路。

## 发布包

发布包是一个目录或 zip 文件：

```text
manifest.json
images/
  <wall-or-layout-image>.<extension>
```

`manifest.json` 包含：

```json
{
  "schemaVersion": 1,
  "exportedAt": 0,
  "walls": [],
  "layouts": [],
  "problems": [],
  "images": []
}
```

只允许导出已发布 Layout，以及其所属 Wall、关联 Problems 和图片。导入工具必须验证：版本、实体 ID 唯一性、Wall/Layout 归属、Hold ID 引用、图片校验值、Layout 已发布状态和最少两个 Hold 的可定线条件。验证失败时整个包不写入 CloudBase。

导入 CloudBase 后生成新的云端 ID 映射；导入结果输出映射表与失败原因。重复导入同一个发布包必须被识别并拒绝，除非操作者明确选择创建一个独立副本。

## 现有实现的调整

已存在的 `server/` FastAPI、管理员登录与 CloudBase Repository 原型不删除，但后续调整为：

- 默认 Repository 改为 SQLite，而非 CloudBase。
- Web 管理员账户和会话仅存于本地 SQLite。
- 保留 `CloudBaseRepository`，但其职责收敛为发布导入工具的受控目标适配器，不作为 Web 运行期数据库。
- 已完成的 Web 创作 API 基础流程迁移到 SQLite Repository，并继续作为 Web UI 的 API。
- 小程序现有 CloudBase service / Node 云函数不改为调用 FastAPI。

## 不在本阶段范围内

- Web 草稿与 CloudBase 草稿的自动或双向同步。
- Web 普通用户注册、公开访问与多人协作。
- 已发布 Layout 的原地编辑或自动版本合并。
- 使用云端 AI 自动识别岩点；本地视觉辅助可作为后续独立阶段。

## 验收

1. 管理员 PC 离线启动 Web 后，可完整完成上传、标注、发布和定线，不需 CloudBase 凭据。
2. Web 可导出已发布数据包，并阻止未发布 Layout 导出。
3. 导入工具可将有效数据包写入 CloudBase；非法包无部分写入。
4. 小程序可读取导入后的公开 Wall、Layout、线路和图片。
5. 小程序可独立创建与发布自己的墙面、Layout、线路，无 FastAPI 运行要求。
6. 两端均遵循草稿可编辑、发布锁定、发布 Layout 可定线与删除级联的规则。
