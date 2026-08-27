# 用户自主管理墙面设计

## 目标

所有用户可通过“我的墙面”创建、管理自己的 Wall 与 Layout；新建墙面默认私有，创建者可切换为公开。正式数据继续经云函数写入。

## 用户体验

```text
首页：公开墙面
我的：当前用户的全部墙面 + 新建墙面
新建：墙名、Layout 名、墙图、可见性（默认私有）
编辑：创建者或管理员可编辑、标注和切换可见性
```

用户将公开墙面切换为私有后，墙面、Layout 和线路保留，但仅其创建者和管理员可在“我的墙面”访问。

## 数据与授权

`walls` 增加：

- `ownerId: string`，创建时由云函数从 OPENID 映射为 `users.id`，不信任客户端输入。
- `visibility: 'private' | 'public'`，默认 `private`。

所有 Layout 操作先取得所属 Wall，再验证 `wall.ownerId === currentUser.id` 或调用者为管理员。管理员可管理任何墙面；其他用户不能修改不属于自己的 Wall 或 Layout。

## 服务边界

将 `adminLayout` 更名为通用 `wallManager` 云函数，避免用管理员身份作为用户功能入口。它支持：`createWall`、`updateWall`、`createLayout`、`updateLayout`、`publishLayout`。旧 `adminLayout` 不再由客户端调用。

`listWalls` 使用云函数返回“公开墙面 + 当前用户拥有的墙面”；`listMyWalls` 仅返回当前用户拥有的墙面。页面不直接写数据库。

## 非目标

- 不引入提交审核。
- 不删除既有 Wall、Layout 或 Problem。
- 不在本次实现其他用户的协作编辑权限。
