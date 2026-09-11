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

会话 Cookie 的 Secure 属性由启动方式固定：`cruxset-dev` 使用 `SESSION_COOKIE_SECURE=false`，适用于本地 HTTP 开发；`cruxset-web` 使用 `SESSION_COOKIE_SECURE=true`，适用于 Tunnel 的 HTTPS 入口。`/etc/cruxset.env` 无需配置此参数。

`cruxset-web` 只启动 Caddy、FastAPI 和 Quick Tunnel，不启动分割实验台；分割实验台由 `cruxset-dev` 单独管理。每次 `start` 或 `restart` 获取新的 Quick Tunnel 地址后，脚本会尝试更新并推送独立仓库 `/home/yanxi/code/project/cruxset-live-url` 的 `latest.json`（可用 `LIVE_URL_REPO` 指定其他路径）。目标目录必须是有效 Git 仓库且已有 `latest.json`；提交或推送失败不会阻止本地服务启动。

该仓库的 `main` 分支通过 GitHub Pages 自动部署。访问 [cruxset-live-url](https://yanxinyi620.github.io/cruxset-live-url/) 时，页面读取最新的 `latest.json`，校验后自动跳转到当前随机的 `trycloudflare.com` 地址；GitHub Pages 的部署和缓存传播可能需要几十秒到几分钟。

## 服务端环境参数

服务端直接读取进程环境变量，不自动加载 `server/.env`。本节仅列出 `/etc/cruxset.env` 现有配置之外的可选参数及默认值。

- `cruxset-web`：API 的 systemd 服务通过 `EnvironmentFile=/etc/cruxset.env` 加载配置。可选 API 参数也可写入该文件，修改后执行 `./scripts/cruxset-web restart` 生效。
- `cruxset-dev`：API 继承启动终端的环境变量，再由脚本覆盖 Cookie Secure 属性和本地分割发布凭据。脚本只从 `/etc/cruxset.env` 补充实验台所需的部分配置，不会将整个文件加载到 API。需要覆盖 API 默认值时，在启动命令中传入或提前导出相应变量。
- 手动运行管理员脚本：同样需要在当前终端显式传入或导出变量，不会自动读取 `/etc/cruxset.env`。使用自定义数据库路径时，创建管理员与 API 必须设置相同的 `CRUXSET_DATABASE_URL`。

### 本地 Web API

下表的默认值指变量未设置时的代码行为；空字符串不等同于未设置。

| 参数 | 默认值及启动方式差异 | 用途 |
| --- | --- | --- |
| `SESSION_COOKIE_SECURE` | 开发脚本固定 `false`，Web 服务启动命令固定 `true`；手动启动 API 时默认 `true` | Cookie 的 Secure 属性，由启动方式管理，无需写入环境文件 |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS 允许的前端来源；代码还允许指定本地及私网地址的 5173 端口 |
| `MAX_UPLOAD_BYTES` | `10485760`（10 MiB） | 普通图片上传大小上限 |
| `SEGMENTATION_MAX_UPLOAD_BYTES` | `52428800`（50 MiB） | 分割发布时原图和展示图各自的大小上限 |
| `CRUXSET_DATABASE_URL` | 仓库 `server/data/cruxset.db` 的绝对路径 | SQLite 文件路径，并非数据库连接 URL；显式填写相对路径时相对于工作目录 |
| `CRUXSET_MEDIA_DIR` | `./data/media` | 媒体目录，相对于工作目录；两个启动方式均以 `server` 为 API 工作目录 |

例如，为开发 API 设置普通图片上传上限：

```bash
MAX_UPLOAD_BYTES=20971520 ./scripts/cruxset-dev restart
```

该值会由 API 进程继承，但不会保存；后续不带该变量重启且终端未导出它时，恢复默认值。

### 本地管理员初始化

本地管理员使用 `server/scripts/create_local_admin.py` 创建或重置密码，与 API 使用同一 SQLite 数据库。

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `ADMIN_BOOTSTRAP_PASSWORD` | 无；未设置或为空时交互询问 | 创建或重置本地管理员密码 |

实验台通过 HTTP 发布到 CloudBase/Cloudflare 的参数见 [分割实验台配置](../tools/segmentation-lab/README.md)。

## 发布与验收

实验台选择 `web` 时只创建本机公开 Wall。CloudBase 和 Cloudflare 需要分别选择对应目标发布。完整流程见 [分割实验台](../tools/segmentation-lab/README.md)，验收见 [测试与验收](testing.md)。
