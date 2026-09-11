# 本地 Web 工作台

本地 Web 支持账户登录、线路创作和管理员墙面创作：Vite 前端通过 FastAPI 使用 SQLite 与本地媒体。它可独立运行，分割实验台通过同一个 Web 地址访问、由独立本机进程运行。正式公网访问使用 [Cloudflare Web](cloudflare-edge-deployment.md)。

## 能力

管理员可上传墙图、创建私有 Wall、标注岩点、发布墙面，并管理线路。已发布墙面锁定几何；需要修改岩点时创建新的私有 Wall。

本地实验台已接入登录、授权和用户数据隔离，**没有应用云端的图片 10 张、保留任务 20 个、每日任务 20 次、公开墙面 10 面额度**。本机性能、磁盘和模型配置仍决定实际可运行规模。

本地创作者可在“我的 → 我的墙面”删除自己拥有的墙面；同时删除所有关联线路，并清理不再被其他墙面引用的原图和展示图。管理员保留原有全站墙面管理权限。撤销实验台授权不影响用户清理自己的已有墙面。来源实验与校准仍在实验台单独管理。实验台 04 区域右侧提供“管理我的墙面”跳转入口。

## 启动

安装 Node.js、Python/uv 后，在仓库根目录运行：

```bash
npm install
./scripts/cruxset-dev start
./scripts/cruxset-dev status
```

首次需要运行本机模型时，可先在 `tools/segmentation-lab` 执行 `uv sync --extra models --extra test` 安装依赖，具体模型配置见[实验台说明](../tools/segmentation-lab/README.md)。

脚本启动 FastAPI（8000）、Web（5173）与分割实验台（8765）。打开 `http://localhost:5173`，管理员或已获实验台授权的用户在“我的”点击“分割实验台”，会在新标签页打开 `http://localhost:5173/segmentation-lab/`。访问实验台数据需要主站登录和实验台授权；管理员默认可用，普通用户由管理员在“我的 → 管理中心 → 用户”开通。日志和 PID 位于 `.runtime/cruxset-dev`。首次创建管理员：

```bash
cd server
PYTHONPATH=. uv run python scripts/create_local_admin.py admin@example.com
```

当前仓库仅保留 `scripts/cruxset-dev`；旧 `cruxset-web`、Caddy 与 Quick Tunnel 管理方式已移除。日常命令为 `start`、`restart`、`stop`、`status`。本地使用无需配置 CloudBase；仅在选择 CloudBase 发布目标时，才需要在 `/etc/cruxset.env` 配置相应 URL、签名密钥和管理员 OpenID。

## 页面与请求路径

```text
本地 Web /                         → 主站页面
         /segmentation-lab/        → 共享实验台页面（本地模式）
         /api/v1/segmentation-lab/ → FastAPI 8000 鉴权 → 签名内部请求 → 8765 /api/
         /api/v1/                 → FastAPI 8000
```

页面源码仍在 `tools/segmentation-lab/static`，分割核心与独立计算进程保持不变。FastAPI 使用现有会话，每次重新检查实验台授权，并签名转发内部请求。8765 的 API 不再接受浏览器直连；使用同域集成入口完成登录、查看和操作。普通获授权用户可发布本地 Web；管理员还可使用配置好的 CloudBase、Cloudflare 目标，跨平台身份仍由目标配置决定。

数据仍位于原 `SEG_LAB_DATA_DIR`，与云端独立。每个实验的 `owner.json` 记录所有者，任务和校准继承该实验归属；所有用户（包括管理员）只能访问自己的实验。无归属旧实验幂等分配给有效的配置管理员，否则选择最早创建的管理员；已有归属不覆盖，原图、候选及校准文件不改写。没有管理员时实验台 API 返回配置错误，先创建管理员即可。撤销授权后下一次请求即拒绝，历史实验和已发布墙面保留。已经启动的计算可以完成，不会自动发布。

实验台未启动时 FastAPI 返回 `LAB_UNAVAILABLE`（503），主站仍可使用。私有实验 API 禁止缓存，防止切换账户后继续显示旧账户图片。

本地构建和预览：

```bash
npm run web:build:local       # 生成 web/dist-local
npm run web:preview:local    # 默认 http://localhost:4173；8000、8765 仍需运行
```

默认 `npm run web:build` 仍生成 Cloudflare 使用的 `web/dist`，不会被本地构建覆盖。Vite 开发入口支持 localhost、回环地址与私网 IPv4 主机名，公开域名不能通过它访问实验台。

## HTTP、HTTPS 与会话

开发脚本设置 `SESSION_COOKIE_SECURE=false`，供本地 HTTP 使用。手动启动 FastAPI 默认是 `true`；若通过普通 HTTP 访问，登录 Cookie 可能受限。使用同一个主机名访问主站与实验台，避免在 `localhost`、`127.0.0.1` 和不同域名间切换导致会话不一致。

Secure 属性控制浏览器会话传输，不控制模型计算或后台发布。本地实验台通过带签名身份的内部请求调用发布 API，不依赖浏览器把 Cookie 发送到 8765。`CRUXSET_BASE_URL` 指向后台 API，`CRUXSET_WEB_URL` 决定发布后的浏览链接和独立页面返回主站的地址。正式 Cloudflare HTTPS 站点使用自己的账户和会话。

## 服务端环境参数

服务端直接读取进程环境变量，不自动加载 `server/.env`。本节仅列出 `/etc/cruxset.env` 现有配置之外的可选参数及默认值。

- `cruxset-dev`：API 继承启动终端的环境变量。脚本从终端或 `/etc/cruxset.env` 读取会话、内部请求与发布密钥；缺失时在 `.runtime/cruxset-dev` 生成三份独立的持久随机密钥（权限 600），旧公开示例密钥自动替换。首次切换会话密钥后需要重新登录。脚本不会将整个环境文件加载到 API。需要覆盖 API 默认值时，在启动命令中传入或提前导出相应变量。
- 手动运行管理员脚本：同样需要在当前终端显式传入或导出变量，不会自动读取 `/etc/cruxset.env`。使用自定义数据库路径时，创建管理员与 API 必须设置相同的 `CRUXSET_DATABASE_URL`。

### 本地 Web API

下表的默认值指变量未设置时的代码行为；空字符串不等同于未设置。

| 参数 | 默认值及启动方式差异 | 用途 |
| --- | --- | --- |
| `SESSION_COOKIE_SECURE` | 开发脚本固定 `false`；手动启动 API 时默认 `true` | Cookie 的 Secure 属性，由启动方式管理，无需写入环境文件 |
| `CRUXSET_LAB_INTERNAL_KEY` | 开发脚本持久生成；手动部署缺失时兼容使用发布密钥 | FastAPI 和 8765 必须相同，不发送到浏览器 |
| `CRUXSET_LOCAL_LAB_URL` | `http://127.0.0.1:8765` | FastAPI 内部转发地址，仅允许本机 HTTP |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS 允许的前端来源；代码还允许指定本地及私网地址的 5173 端口 |
| `MAX_UPLOAD_BYTES` | `10485760`（10 MiB） | 普通图片上传大小上限 |
| `SEGMENTATION_MAX_UPLOAD_BYTES` | `52428800`（50 MiB） | 分割发布时原图和展示图各自的大小上限 |
| `CRUXSET_DATABASE_URL` | 仓库 `server/data/cruxset.db` 的绝对路径 | SQLite 文件路径，并非数据库连接 URL；显式填写相对路径时相对于工作目录 |
| `CRUXSET_MEDIA_DIR` | `./data/media` | 媒体目录，相对于工作目录；开发脚本以 `server` 为 API 工作目录 |

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

实验台选择 `web` 时创建归当前用户所有的本机公开 Wall，不再将所有新墙面归到固定管理员。CloudBase 和 Cloudflare 需要分别选择对应目标发布。完整流程见 [分割实验台](../tools/segmentation-lab/README.md)，验收见 [测试与验收](testing.md)。
