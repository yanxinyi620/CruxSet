# 2026-09-14 线路角度统一更新

## 小程序

- AppID：`wx123fe6920af8c5a9`。
- 开发版本：`2026.09.14`，开发者工具命令行上传成功，包大小 148352 字节（144.9 KB）。
- 版本说明：统一线路角度为 0–70 度、每 5 度一档；修复新建和我的线路编辑选项不一致，兼容历史墙面。
- 根据用户要求，仅上传开发版本，未提交审核、未发布小程序正式版。后续在微信公众平台的版本管理中操作。
- 发布包由当前仓库源码生成，Windows 临时发布目录为 `C:\Users\yanxi\CruxSet-release-20260914-angles`；原项目仍是源码维护入口。

## CloudBase

生产环境 `cloud1-d0g8toggn7735e61e` 已成功部署 `saveProblem`、`updateProblem`、`routeSync`、`adminWall`、`segmentationPublish`，采用云端安装依赖。五个函数均为 Active，超时分别保持 3、3、60、3、60 秒，`wallManager` 仍保持 20 秒。

部署前代码已备份至本机 `C:\Users\yanxi\CruxSet-release-20260914-angles-backup`。重新下载五个线上函数，逐文件核对全部 13 个 JavaScript 文件，与本次源码一致。没有修改业务数据、集合或访问规则。

## Cloudflare Web

对应 Web/Edge 更新已部署至 `cruxset-edge`，版本 ID：`7fc710f0-8ed9-41e6-97f0-e0a160a06c09`。

生产主域名首页和 `/api/v1/bootstrap` 均返回 HTTP 200，bootstrap 返回有效 JSON；workers.dev 的 bootstrap 同样正常。构建和类型检查通过。未执行数据库迁移。
