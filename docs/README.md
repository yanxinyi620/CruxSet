# 文档导航

从[项目 README](../README.md)了解产品与快速启动，再按任务选择下列文档。使用指南描述当前行为；历史记录中的测试数量、部署状态与旧方案仅对应记录当时。

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
| [设计参考](reference.md) | 数据模型、账户与权限边界、生命周期 |
| [测试与验收](testing.md) | 自动化检查与各端人工验收 |
| [小程序浏览缓存](topics/miniprogram-cache.md) | 数据和图片缓存、失效与验证 |
| [管理员线路双向补齐](topics/admin-route-sync.md) | 显式同步规则、部署依赖与一致性 |

## 实测与历史记录

- [SAM 2.1 参数测试报告](../output/sam21-baseline-2026-09-13/SAM21-report.md)：369岩点墙面的参数比较与推荐基线；[材料说明](../output/sam21-baseline-2026-09-13/README-report.md)区分仓库材料与本地完整数据。
- [性能与运行记录](benchmarks/)：特定版本、输入与环境下的测量，不作为后续版本的性能保证。
- [小程序手机 UI 验收记录](records/2026-09-12-miniprogram-mobile-ui-audit.md)：历史截图对照、验收范围与调试记录。
- [设计方案](superpowers/specs/)、[实施计划](superpowers/plans/)与[设计历史](superpowers/history/)：保留决策过程；日常使用以当前指南与代码为准。

## 文档放置规则

- 根目录 `README.md`：项目总览、快速开始与主要入口。
- `docs/` 一级：文档导航、跨端设计参考、统一测试验收。
- `guides/`：持续维护的使用与部署指南。
- `topics/`：缓存、同步等专项机制说明，避免堆放到一级目录。
- `records/`：带日期的验收与操作记录；持续有效的操作方法应同时写入指南。
- `benchmarks/`：性能测量与实验记录；已有实验输出目录保留原路径以便追溯。
- `superpowers/`：设计与实施历史。

新增文档时优先扩充已有指南；确需新建时按上述职责归类，并在本导航或所属指南中增加入口。移动文档须同步更新仓库内引用。
