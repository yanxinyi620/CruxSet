# WSL 上长期运行 Web 工作台

本手册将本机 WSL 配置为持续运行的 CruxSet Web 服务。前端使用构建产物，Caddy 提供静态文件并将 `/api` 转发给仅监听本机的 FastAPI；Cloudflare 的具名 Tunnel 再将一个固定域名转发到 Caddy。

```text
浏览器 HTTPS → Cloudflare Tunnel → Caddy :8080
                                  ├─ /      → Web 构建产物
                                  └─ /api/* → FastAPI 127.0.0.1:8000
```

请先在 Cloudflare 中托管一个域名，并将下文的 `app.example.com` 换成该域名下实际使用的子域名。所有 WSL 命令均应从仓库根目录执行，除非另有说明。

## 0. 前置检查

本手册使用 systemd 保持服务在后台运行。先确认 WSL 已启用 systemd：

```bash
ps -p 1 -o comm=
```

输出应为 `systemd`。若不是，请在 WSL 中执行：

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

然后在 **Windows PowerShell** 中执行 `wsl --shutdown`，重新打开 WSL 后再次检查。还应关闭电脑的自动睡眠；电脑、网络或 WSL 停止时，服务会中断。

## 1. 安装运行组件并构建前端

`cloudflared` 已安装时无需重复安装。安装 Caddy，然后安装项目依赖、执行检查并生成静态文件：

```bash
sudo apt update
sudo apt install -y caddy rsync
npm ci
npm test
npm run build
npm run web:build
```

将构建结果复制到由 Caddy 读取的目录：

```bash
sudo install -d -o caddy -g caddy -m 755 /srv/cruxset/web
sudo rsync -a --delete web/dist/ /srv/cruxset/web/
sudo chown -R caddy:caddy /srv/cruxset/web
```

## 2. 配置 Caddy

将 Caddy 只监听 WSL 本机的 `8080` 端口。Cloudflare 已经在公网一侧提供 HTTPS，因此此处不需要本地 TLS 证书。

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
127.0.0.1:8080 {
    encode zstd gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        root * /srv/cruxset/web
        try_files {path} /index.html
        file_server
    }
}
EOF

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl -I http://127.0.0.1:8080/
```

## 3. 将 FastAPI 设为 systemd 服务

创建仅 root 可读的环境文件。命令会在终端中提示你输入一个稳定的随机会话密钥；请把它保存到密码管理器，之后不要随意更换，否则所有已登录会话都会失效。

```bash
read -rsp '输入并保存 SESSION_SECRET：' SESSION_SECRET; echo
sudo install -m 600 /dev/null /etc/cruxset.env
printf 'SESSION_SECRET=%s\nSESSION_COOKIE_SECURE=true\nWEB_ORIGIN=https://app.example.com\n' "$SESSION_SECRET" | sudo tee /etc/cruxset.env >/dev/null
unset SESSION_SECRET
```

从仓库根目录执行以下命令，生成服务文件。这里会自动记录当前 WSL 用户、仓库绝对路径和 `uv` 的绝对路径：

```bash
CRUXSET_USER="$USER"
CRUXSET_ROOT="$PWD"
UV_BIN="$(command -v uv)"
test -n "$UV_BIN"

sudo tee /etc/systemd/system/cruxset-api.service >/dev/null <<EOF
[Unit]
Description=CruxSet FastAPI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$CRUXSET_USER
WorkingDirectory=$CRUXSET_ROOT/server
EnvironmentFile=/etc/cruxset.env
ExecStart=$UV_BIN run uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cruxset-api
curl http://127.0.0.1:8000/healthz
sudo systemctl status cruxset-api --no-pager
```

如果项目依赖包含 `uv` 管理的 Python 环境，上述服务会在每次启动时由 `uv run` 确保环境可用。

## 4. 创建并安装具名 Cloudflare Tunnel

先完成 Cloudflare 登录。该命令会输出一个 URL，请在 Windows 浏览器中打开并选择持有 `app.example.com` 的域名：

```bash
cloudflared tunnel login
cloudflared tunnel create cruxset
cloudflared tunnel list
```

从最后一条命令的输出中复制新 Tunnel 的 UUID，然后设置变量。以下示例中的 UUID 必须替换：

```bash
TUNNEL_ID='00000000-0000-0000-0000-000000000000'
APP_HOST='app.example.com'
test -f "$HOME/.cloudflared/$TUNNEL_ID.json"
```

创建 Tunnel 配置和 DNS 路由：

```bash
cat > "$HOME/.cloudflared/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $APP_HOST
    service: http://127.0.0.1:8080
  - service: http_status:404
EOF

cloudflared tunnel route dns cruxset "$APP_HOST"
sudo cloudflared --config "$HOME/.cloudflared/config.yml" service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

现在在浏览器打开 `https://app.example.com`。外部为 HTTPS，所以 FastAPI 必须保持 `SESSION_COOKIE_SECURE=true`；Caddy 与 FastAPI 之间仍可安全地使用本机 HTTP。

## 5. 上线后检查与日常更新

初次访问后，确认登录响应的 Cookie 有 `Secure` 和 `HttpOnly` 属性，并在浏览器中验证登录、退出、图片上传和 API 请求。查看服务日志：

```bash
sudo journalctl -u cruxset-api -u caddy -u cloudflared -f
```

更新 Web 前端时，在仓库根目录执行：

```bash
npm ci
npm test
npm run build
npm run web:build
sudo rsync -a --delete web/dist/ /srv/cruxset/web/
sudo chown -R caddy:caddy /srv/cruxset/web
```

更新 FastAPI 代码或 Python 依赖后，额外执行：

```bash
sudo systemctl restart cruxset-api
curl http://127.0.0.1:8000/healthz
```

静态文件更新不需要重启 Caddy。变更 `/etc/caddy/Caddyfile` 时，先验证再重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 安全与备份

- 在 Cloudflare Zero Trust 中为 `app.example.com` 配置 Cloudflare Access，限制为自己的邮箱或团队身份；不要仅依赖随机 URL 或应用登录页。
- 不要把 `/etc/cruxset.env`、Tunnel 凭据文件或 SQLite 数据库提交到 Git。
- 定期备份 `server/data/cruxset.db` 和项目中的本地上传图片；先停止 `cruxset-api` 再执行文件级 SQLite 备份，或使用 SQLite 的在线备份方式。
- 此方案依赖一台 PC 持续在线，适合个人/内部工具和低流量场景，不提供云服务器级别的高可用性。
