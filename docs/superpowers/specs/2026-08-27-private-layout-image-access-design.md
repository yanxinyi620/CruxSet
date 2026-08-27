# 私有墙图访问设计

## 目标

在 CloudBase 免费环境保持云存储“仅创建者可读写”时，让所有小程序用户仍能查看已发布 Layout 的墙图。

## 决定

新增云函数 `getLayoutImageUrl`。小程序不再以 `wx.cloud.downloadFile` 直接读取 `cloud://` 墙图，而是调用该函数取得短期 HTTPS 地址，再交给 Canvas 加载。

## 访问规则

- `fileID` 必须匹配 `layouts.imageFileId` 或 `layouts.displayImageFileId`。
- 普通用户只可取得 `published: true` Layout 的图片地址。
- 管理员可取得未发布 Layout 的图片地址，用于创建和编辑预览。
- 其他文件 ID 一律拒绝；客户端不能借此函数读取任意私有文件。

## 数据流

```text
wall-canvas
  → layoutService.getLayoutImageUrl(fileID)
  → getLayoutImageUrl 云函数
  → 验证 Layout 发布状态 / 管理员身份
  → CloudBase getTempFileURL
  → 短期 HTTPS 地址
  → Canvas Image
```

## 失败处理

云函数返回未授权、未找到或存储错误时，客户端沿用现有“墙图加载失败，仍可使用岩点”提示，不阻塞岩点展示和操作。

## 非目标

- 不放开云存储读取权限。
- 不改变数据库集合权限。
- 不新增上传审核或发布审核流程。
- 不在本次实现用户上传目录隔离；该项属于后续用户自主管理内容阶段。
