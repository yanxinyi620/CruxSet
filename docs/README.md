# 文档导航

从[项目 README](../README.md)了解产品与快速启动，再按任务选择下列文档。以下指南介绍当前功能、配置和验收方法。

## 使用与部署

| 文档 | 何时阅读 |
| --- | --- |
| [本地 Web](guides/local-web.md) | 启动开发环境、创建账户、配置本机实验台 |
| [Cloudflare 部署](guides/cloudflare-edge-deployment.md) | 部署 Web、Worker、D1 与 R2，完成上线检查 |
| [微信小程序](guides/miniprogram-cloudbase.md) | 导入开发者工具、部署 CloudBase、发布小程序 |
| [云端实验台](guides/segmentation-cloud.md) | 配置 Actions、模型预设、权限、额度与发布申请 |
| [实验台操作说明](../tools/segmentation-lab/README.md) | 配置模型、人工校准、导出和发布 |

## 架构、验证与专题

| 文档 | 内容 |
| --- | --- |
| [线路浏览与创作](guides/routes.md) | 三端入口、编辑流程、墙图适配、轮廓及压暗规则 |
| [设计参考](reference.md) | 数据模型、账户与权限边界、生命周期 |
| [测试与验收](testing.md) | 自动化检查与各端人工验收 |
| [小程序浏览缓存](topics/miniprogram-cache.md) | 数据和图片缓存、失效与验证 |
| [管理员线路双向补齐](topics/admin-route-sync.md) | 显式同步规则、部署依赖与一致性 |

## 文档放置规则

- 根目录 `README.md`：项目总览、快速开始与主要入口。
- `docs/` 一级：文档导航、跨端设计参考、统一测试验收。
- `guides/`：持续维护的使用与部署指南。
- `topics/`：缓存、同步等专项机制说明，避免堆放到一级目录。
- `records/`：带日期的验收与操作记录；持续有效的操作方法应同时写入指南。
- `benchmarks/`：性能测量与实验记录；已有实验输出目录保留原路径以便追溯。
- `superpowers/`：设计与实施历史。

新增文档时优先扩充已有指南；确需新建时按上述职责归类，并在本导航或所属指南中增加入口。移动文档须同步更新仓库内引用。
