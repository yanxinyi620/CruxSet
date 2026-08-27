# Layout 发布锁定设计

## 目标

保护已经创建的线路：某个 Layout 首次发布后，其岩点集合和坐标不可再修改。需要补点、移动或删除岩点时，创建新的 Layout，而不是编辑旧 Layout。

## 用户体验

```text
新建墙面 → 创建初始 Layout（草稿） → 开始标注 → 发布
                                           │
                                           └── 可反复保存、撤销、增删岩点

已发布 Layout → 锁定，不能继续标注
             → 创建新 Layout → 标注并发布新版本
```

“我的墙面”中，未发布的初始 Layout 显示“开始标注”；已发布 Layout 不显示“继续标注”，显示“创建新 Layout”。用户不需要通过开发者工具传入页面参数才能完成初始标注。

## 数据与线路兼容性

- Layout 的 `id` 和每次保存生成的 `version` 共同定位一份不变的岩点快照。
- Problem 继续保存其创建时的 `layoutId` 与 `layoutVersion`；旧线路永远读取该快照，不跟随墙面的当前 Layout 改变。
- `walls.activeLayoutId` 仅指向目前公开浏览的 Layout；它不修改任何旧线路。
- 新 Layout 使用新的 `id`，初始为 `published: false`、`version: 1`，可独立标注和发布。

## 服务端规则

- `updateLayout` 与 `publishLayout` 只允许目标 Layout 当前最新快照尚未发布。
- 一旦某 Layout 最新快照为 `published: true`，两种写入操作均返回 `LAYOUT_LOCKED`。
- `createLayout` 仍允许墙面创建者或管理员调用，用于创建全新的草稿 Layout。
- 所有权限检查保持在 `wallManager` 云函数中；页面不自行判断授权来替代服务端校验。

## 页面与错误处理

- Layout 编辑器加载到已发布 Layout 时显示“该 Layout 已发布并锁定”，不提供岩点编辑控件和发布按钮。
- 未发布草稿照常提供连续标点、Volume、撤销、删除、上传和发布。
- 从“我的墙面”可进入当前草稿的编辑器；若没有草稿，则可创建新 Layout。
- 收到 `LAYOUT_LOCKED` 时，页面提示“Layout 已发布，不能修改；请创建新的 Layout”。本地草稿不得覆盖已发布数据。

## 非目标

- 不迁移、删除或重写既有 Layout / Problem 数据。
- 不实现同一 Layout 的多人协作或审核流程。
- 不在本次加入自动岩点识别或 Polygon 标注。
