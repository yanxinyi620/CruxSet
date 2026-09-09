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
./scripts/cruxset-web start --setup
./scripts/cruxset-web status
```

该脚本构建前端、配置 Caddy 与 systemd，并启动 Quick Tunnel。需要固定域名时，用 `cloudflared tunnel login`、`cloudflared tunnel create cruxset` 创建具名 Tunnel；其入口仍指向 `http://127.0.0.1:8080`。

## 发布与验收

实验台选择 `web` 时只创建本机公开 Wall；`both` 先创建本机 Wall，再独立发布到 CloudBase。完整流程见 [分割实验台](../tools/segmentation-lab/README.md)，验收见 [测试与验收](testing.md)。
