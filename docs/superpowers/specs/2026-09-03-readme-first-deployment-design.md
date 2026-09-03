# README 首次部署者信息架构

## 目标

将 README 调整为首次部署者可顺序执行的入口文档，同时不删减现有部署、开发和发布事实。

## 读者与范围

默认读者是首次在本机部署 CruxSet、CloudBase 与微信小程序的维护者。README 不展开长期运行、Tunnel 或完整测试细节，而是链接至 `docs/` 的对应文档。

## 结构

1. 概览：产品边界、三个运行组件和数据流。
2. 快速验证：依赖、安装、构建与自动化验证命令。
3. 本地工作台：使用 `scripts/cruxset-dev` 启动 Web、API 与实验台；管理员初始化作为可选步骤。手动三终端命令集中在本节，避免重复。
4. 小程序与 CloudBase：导入 `wechat/`、运行模式、集合/规则、云函数、私有 Storage、HTTP 网关与 `/etc/cruxset.env` 配置。
5. 发布与验收：实验台发布到 Web/CloudBase/both 的过程，说明原图与完整签名 JSON 的 Storage 直传及 `payloadFileId`。
6. 参考：核心规则、目录概览、外部文档链接。

## 约束

- 默认小程序模式保持 `cloudbase`，但保留 `mock` 离线演示说明。
- 不改动 Web、云函数、实验台或小程序行为。
- 不复制 `docs/wsl-cloudflare-tunnel.md` 的长期运行步骤。
- 不复制 `docs/testing.md` 的完整验收清单。

## 验证

检查 Markdown 链接与命令路径仍存在，运行 `git diff --check`。本次为文档重排，不需要修改或重新部署运行时代码。
