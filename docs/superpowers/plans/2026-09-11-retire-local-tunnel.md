# 本地公网部署退役计划

**Goal:** 收敛到本地开发与正式云端服务。
**Architecture:** 仅删除专用部署层，保留本地服务、鉴权与发布核心。
**Tech Stack:** Bash、systemd、Markdown、Vitest、pytest。

- [x] 删除专用脚本、测试和旧部署设计文档，更新 README、本地手册、共享历史说明。
- [x] 移除本机专用部署残留，保留共享环境及数据。
- [x] 检查引用，运行启动、入口及发布测试，检查差异。

验证：7 项本地启动与入口测试、17 项服务端发布与网关测试、28 项实验台发布与 CloudBase 测试通过；脚本语法及差异检查通过。

用户执行系统清理后已复核：两个 CruxSet systemd 单元、/etc/caddy/Caddyfile 和 /srv/cruxset/web 静态副本均已删除；Caddy 已停用且禁用自启；共享 /etc/cruxset.env 保留。已删除的 API 单元仍有 systemd 历史 failed 状态，无运行进程或可加载单元，不影响退役。
