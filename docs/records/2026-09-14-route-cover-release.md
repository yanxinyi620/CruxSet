# 2026-09-14 线路画布缩放发布记录

- 代码提交：`59a75c1`。
- 线路详情、创建/编辑及详情全屏采用等比铺满居中；高度不变，保存弹窗继续完整容纳。
- 发布前验证：86 个测试文件、459 项测试通过；前端、小程序和 Edge 类型检查通过；云端 Web 构建成功。

## Cloudflare

- Worker：`cruxset-edge`。
- 版本：`f01125e7-fc1d-4972-8efc-86e2174d7524`。
- 地址：https://cruxset.xinyilab.top。
- 首页和 bootstrap 可访问，接口返回有效 JSON；线上 `/assets/index-Co_fRd6Z.js` 与本次构建逐字节一致。
- 本次同时包含此前已提交的 Web 线路详情统一变更。

## 小程序

- AppID：`wx123fe6920af8c5a9`。
- 开发版本：`2026.09.14.2`。
- 开发者工具 CLI 返回上传成功，包大小 148817 字节。
- 使用 scripts/build-wechat-preview.mjs 编译 44 个模块，并验证 15 个页面入口。
- 上传目录：`C:\Users\yanxi\CruxSet-release-20260914-cover`。
- 上传回执：`C:\Users\yanxi\CruxSet-release-20260914-cover-upload.json`。
- 按用户要求仅上传开发版本，未提交审核、未正式发布。
- 本次不涉及云函数变更或数据库迁移。
