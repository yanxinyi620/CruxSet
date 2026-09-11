# 文档导航

本目录的使用指南按当前代码维护；下列文档共同描述现有功能，更新基准为 2026-09-11。

| 文档 | 内容 |
| --- | --- |
| [项目总览](../README.md) | 三种运行形态、本地与云端实验台、快速开始 |
| [本地 Web](local-web.md) | 开发启动、账户与授权、HTTP 会话、本机计算与环境参数 |
| [Cloudflare 部署](cloudflare-edge-deployment.md) | Workers、D1、R2、数据库迁移和上线检查 |
| [云端实验台](segmentation-cloud.md) | GitHub Actions、私有实验、创作者额度与资源生命周期 |
| [微信小程序](miniprogram-cloudbase.md) | CloudBase 部署、发布目标和小程序边界 |
| [设计参考](reference.md) | 数据语义、权限划分及各端删除规则 |
| [测试与验收](testing.md) | 自动化命令和人工验收清单 |
| [实验台操作说明](../tools/segmentation-lab/README.md) | 模型配置、校准、发布、本地存储和基准复现 |

`benchmarks/` 保存特定日期、输入和模型条件下的实测记录，不代表之后版本的性能保证。`superpowers/specs/`、`superpowers/plans/` 和 `superpowers/history/` 保留设计与实施历史，其中的旧方案、测试数量和部署状态可能已被后续改动替代；日常使用以以上指南和当前代码为准。
