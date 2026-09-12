# 小程序 Web 功能同步：开发交付

日期：2026-09-11。分支：`codex/miniprogram-web-parity`，基于 `41700a0`。工作目录：`/home/yanxi/code/project/CruxSet-miniprogram-parity`。原工作目录中其他实验台改动保持原状。本次未发布云函数、小程序或修改线上数据库。

## 完成内容

- 统一微信身份初始化，业务调用等待身份；失败可重试。
- 线路详情沿用筛选条件，支持全屏；草稿按用户、新建/编辑对象隔离，保留名称、说明、角色与参数。
- 画布修复 ready 生命周期、部分抬指继续拖动、编辑时缩放复位；图片缓存跨页面复用，过期与失效恢复。
- 我的墙面与管理员管理中心分离；用户列表返回必要字段；所有列表分批完整读取。
- 所有者/管理员确认后级联删除墙面及所有线路，保留共享图片。未完成删除保留继续入口；媒体失败记录重试，旧分割发布回执不能恢复已删墙面。
- 管理员选择相册/相机图片，画布转为 JPEG 后上传，云端解码校验并以私有回执确认归属。创建请求可幂等重试。
- 私有草稿支持添加/移动/删除岩点、撤销/恢复、清空、保存、至少两个岩点后公开发布与锁定。
- 小程序和 Web 共用轻量像素识别算法；小程序限制分析分辨率，识别结果保留多边形，支持人工修正和撤销。Web 页面行为保持。
- CloudBase 事务使用官方支持的文档操作；历史编号分批回填，共用持久计数器。测试模型限制事务操作数量并模拟失败回滚。

## 已执行验证

| 检查 | 结果 |
| --- | --- |
| `npm test -- --reporter=dot` | 70 个测试文件，329 项通过 |
| `npm run build` | 根项目及小程序 TypeScript 通过 |
| `npx tsc -p web/tsconfig.json` | 通过 |
| `npm run web:build` | 云端 Web 构建通过 |
| `npm run web:build:local` | 本机 Web 构建通过 |
| `npm run verify:phase1 -- --release` | 结构、真实 AppID 与部署入口检查通过，不代表已发布 |
| 本机微信 `wcc.exe` | 17 个 WXML 模板编译通过 |
| 本机微信 `wcsc.exe` | 18 个 WXSS 样式编译通过 |
| `git diff --check` | 通过 |

新增可执行测试覆盖身份并发、筛选上下文、完整草稿、墙面管理确认、上传重试、发布锁定、识别后移动状态、画布生命周期/手势，以及 CloudBase 大列表、123 面历史墙编号、上传解码、轮廓校验、事务限制、删除恢复、图片权限和回执删除标记。前后端均经过独立规格与代码复审，发现的问题已修复。

## 部署与待验收

1. 测试环境先按 `config/cloudbase.collections.json` 建立所需集合和索引，新增 `adminUploads`、`wallDeletionJobs`；按规则保持业务集合与 Storage 私有。
2. 部署更新的 `adminWall`、`wallManager`、`saveProblem`、`updateProblem`、`getWallImageUrl`、`segmentationPublish`，连同每个目录中的辅助文件。`adminWall` 必须安装新增解码依赖，本地可执行 `npm ci --prefix wechat/cloudfunctions/adminWall`。其余原有云函数仍需保持部署。
3. 微信下载合法域名需覆盖 `getWallImageUrl` 返回的图片域名。再导入该分支的 `wechat/` 目录，执行 `docs/testing.md` 小程序验收清单。
4. CloudBase 实际运行、并发冲突与耗时仍需测试环境验证；本地测试不能替代服务器行为。Android/iPhone 的图片方向、全屏、弱网、密集岩点与识别性能也尚未真机验证。

本次仅完成开发，不包含实验台、三端账号绑定/数据自动同步或生产发布。
