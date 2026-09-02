# WSL Quick Tunnel 工作台管理脚本设计

## 目标

将 CruxSet 的 WSL 长期运行 Web 工作台收敛为一个脚本，使用无域名的 Cloudflare Quick Tunnel，并支持启动、停止、重启和状态查询。启动和重启完成后必须输出本次 Quick Tunnel 分配的临时 HTTPS 地址。

## 命令接口

脚本路径为 `scripts/cruxset-web`，从仓库任意目录调用均可：

```bash
./scripts/cruxset-web start [--setup]
./scripts/cruxset-web restart [--setup]
./scripts/cruxset-web stop
./scripts/cruxset-web status
```

`--setup` 仅允许与 `start` 或 `restart` 一起使用。它可重复执行，用于创建或更新服务配置；不使用该选项时，脚本只管理已经安装的服务。

## 服务结构

脚本管理三个 systemd 单元：

- `cruxset-api.service`：以当前 WSL 用户运行 FastAPI，仅绑定 `127.0.0.1:8000`。
- `caddy.service`：从 `/srv/cruxset/web` 提供前端构建产物，在 `127.0.0.1:8080` 监听，并将 `/api/*` 反向代理至 FastAPI。
- `cruxset-quick-tunnel.service`：以当前 WSL 用户运行 `cloudflared tunnel --url http://127.0.0.1:8080`，在进程异常退出时自动重启。

Quick Tunnel 服务依赖 Caddy 与 API 已启动。其公网地址是临时值，不写入配置文件；脚本通过本次服务启动后的 journal 日志提取最后一个 `https://*.trycloudflare.com` 地址。

## `--setup` 行为

执行 setup 时，脚本：

1. 验证 systemd、`uv`、`cloudflared`、Caddy、Node/npm 等必要运行组件可用，并在缺失时给出明确的安装提示。
2. 读取 `/etc/cruxset.env`。文件不存在时创建为 root 所有、权限 `0600`。
3. 对 `SESSION_SECRET`、`CRUXSET_SEGMENTATION_PUBLISH_KEY`、`CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID` 逐项检查：已有非空值永远保留；仅缺失项才交互输入。`SESSION_SECRET` 使用隐藏输入；其余两个值使用普通输入。
4. 强制写入或修正 `SESSION_COOKIE_SECURE=true`，同时保留环境文件中不属于本脚本管理的其他变量。
5. 生成 API systemd 单元，其中包含当前仓库绝对路径、当前 WSL 用户、当前 `uv` 绝对路径及 `/etc/cruxset.env`。
6. 生成 Caddy 配置，前端仅从 `/srv/cruxset/web` 提供；构建 `web/dist` 并同步至该目录。
7. 生成 Quick Tunnel systemd 单元，重载 systemd 配置。

setup 不安装系统软件、不修改现有密钥、不配置具名 Tunnel 或 Cloudflare DNS。

## 命令行为与错误处理

`start` 依次启动 Caddy、API 和 Quick Tunnel，校验本地健康接口后等待最多一个有限时间窗口获取临时 URL。`restart` 会先重启工作台服务，再使用相同的等待与输出流程。若 Quick Tunnel 未在窗口内产生 URL，命令失败并显示该单元最近日志，避免误报成功。

`stop` 停止 Quick Tunnel、API 和 Caddy；停止不存在或已停止的服务仍视为成功。`status` 显示三个服务的精简状态，并尽力显示 Quick Tunnel 日志中的最近 URL；没有 URL 时明确说明。

所有涉及 `/etc`、`/srv` 和 systemd 系统单元的操作使用 `sudo`。脚本在非 WSL/systemd 环境、缺少环境文件或运行组件时给出可操作的错误消息。

## 测试与文档

为脚本提取无副作用的 Bash 函数，并使用 shell 单元测试验证参数解析、环境文件缺失项补全策略、URL 提取与服务启动顺序。部署手册改为将首次部署入口指向 `start --setup`，并保留系统依赖安装与 Quick Tunnel 安全限制说明。
