# 本地 Web 工作台

本地 Web 是管理员创作工作台：Vite 前端通过 FastAPI 使用 SQLite 与本地媒体。它可独立运行，分割实验台也在本机运行；Cloudflare Tunnel 只是可选的公网入口。

## 能力

管理员可上传墙图、创建私有 Wall、标注岩点、发布墙面，并管理线路。已发布墙面锁定几何；需要修改岩点时创建新的私有 Wall。

## 启动

安装 Node.js、Python/uv 后，在仓库根目录运行：

```bash
npm install
./scripts/cruxset-dev start
./scripts/cruxset-dev status
```

脚本启动 FastAPI（8000）、Web（5173）与分割实验台（8765）。日志和 PID 位于 `.runtime/cruxset-dev`。首次创建管理员：

```bash
cd server
PYTHONPATH=. uv run python scripts/create_local_admin.py admin@example.com
```

日常命令为 `start`、`restart`、`stop`、`status`。启动分割实验台时，`/etc/cruxset.env` 中必须配置 CloudBase URL、签名密钥和管理员 OpenID；这些变量只用于选择 CloudBase 发布目标。

## 长期运行与公网访问

可通过 Caddy 与 Cloudflare Tunnel 将本机服务暴露到公网：浏览器 HTTPS → Tunnel → Caddy :8080 → Web 构建产物与 FastAPI。该方式仍依赖本机持续运行，不是 Cloudflare Workers 部署。

在 WSL 启用 systemd 后，执行：

```bash
./scripts/cruxset-web start
./scripts/cruxset-web status
```

每次 `start` 与 `restart` 都会重新安装依赖、构建前端、更新 Caddy 与 systemd 配置后再启动 Quick Tunnel，但不会启用 WSL 启动自动运行。

`cruxset-web` 只启动 Caddy、FastAPI 和 Quick Tunnel，不启动分割实验台；分割实验台由 `cruxset-dev` 单独管理。每次 `start` 或 `restart` 获取新的 Quick Tunnel 地址后，脚本会尝试更新并推送独立仓库 `/home/yanxi/code/project/cruxset-live-url` 的 `latest.json`（可用 `LIVE_URL_REPO` 指定其他路径）。目标目录必须是有效 Git 仓库且已有 `latest.json`；提交或推送失败不会阻止本地服务启动。

该仓库的 `main` 分支通过 GitHub Pages 自动部署。访问 [cruxset-live-url](https://yanxinyi620.github.io/cruxset-live-url/) 时，页面读取最新的 `latest.json`，校验后自动跳转到当前随机的 `trycloudflare.com` 地址；GitHub Pages 的部署和缓存传播可能需要几十秒到几分钟。

## 发布与验收

实验台选择 `web` 时只创建本机公开 Wall；`both` 先创建本机 Wall，再独立发布到 CloudBase。完整流程见 [分割实验台](../tools/segmentation-lab/README.md)，验收见 [测试与验收](testing.md)。
