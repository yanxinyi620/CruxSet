# CruxSet

CruxSet 将真实攀岩墙数字化：微信小程序浏览公开墙面、查看和创建线路，并编辑或删除自己的线路；管理员可管理和删除墙面。本地 Web 工作台负责墙面创建、岩点标注和线路管理；分割实验台可将人工校准结果发布到本机 Web 和/或小程序 CloudBase。

```text
本地 Web 创作台 → FastAPI → SQLite + 本地图片
分割实验台 ───────┬──────→ 本地 Web Wall
                 └──────→ CloudBase Storage + 云函数 → 小程序
```

Web 与小程序共享 Wall、Hold、Problem 字段语义，但不共享草稿、会话或后端。Web 草稿只保存在本地；小程序不依赖 FastAPI。

## 文档导航

- [设计参考](docs/reference.md)：架构、数据模型、业务规则与安全边界
- [测试与验收](docs/testing.md)：自动化检查和人工验收清单
- [WSL 长期运行部署](docs/wsl-cloudflare-tunnel.md)：Caddy、Cloudflare Tunnel 与 systemd
- [分割实验台](tools/segmentation-lab/README.md)：AI 分割与人工校准

## 1. 快速验证

要求：Node.js 18+、npm、Python/uv，以及微信开发者工具。

```bash
npm install
npm test
npm run build
npm run verify:phase1
```

`npm run build` 只做 TypeScript 检查；Web 静态构建使用 `npm run web:build`，产物位于 `web/dist`。

## 2. 启动本地工作台

推荐一次启动 API、Web 和分割实验台：

```bash
./scripts/cruxset-dev start
./scripts/cruxset-dev status
./scripts/cruxset-dev restart
./scripts/cruxset-dev stop
```

脚本日志和 PID 位于 `.runtime/cruxset-dev`，并从 `/etc/cruxset.env` 读取 CloudBase 配置。首次创建本地管理员：

```bash
cd server
PYTHONPATH=. uv run python scripts/create_local_admin.py admin@example.com
```

### 手动启动（排查用）

终端一：`cd server && SESSION_COOKIE_SECURE=false CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret' CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID='usr_web_lgjUPpx-3eu-s1_r' PYTHONPATH=. uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`。

终端二：`npm run web -- --host 0.0.0.0`。

终端三：

```bash
cd tools/segmentation-lab
SEG_LAB_DATA_DIR=./data CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret' CRUXSET_BASE_URL='http://127.0.0.1:8000' CRUXSET_WEB_URL='http://127.0.0.1:5173' uv run uvicorn segmentation_lab.api:app --host 127.0.0.1 --port 8765
```

Web 地址为 `http://localhost:5173`，实验台地址为 `http://127.0.0.1:8765/`。

## 3. 部署小程序与 CloudBase

微信开发者工具导入 **`wechat/` 目录**，不要导入仓库根目录。运行模式位于 [runtime.ts](wechat/miniprogram/config/runtime.ts)：

```ts
export const runtimeMode: RuntimeMode = 'cloudbase'
```

当前环境为 `cloud1-d0g8toggn7735e61e`；离线演示可临时改为 `mock`。

1. 创建 `users`、`walls`、`problems`、`admins`、`counters`、`segmentationPublishes` 六个集合，导入 [集合声明](config/cloudbase.collections.json) 和 [权限规则](config/cloudbase.rules.json)。
2. 部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`updateProblem`、`deleteProblem`、`getWallImageUrl`、`storageUpload`、`segmentationPublish` 九个云函数；`storageUpload` 需安装 `@cloudbase/node-sdk`。
3. 将 Storage 设为私有；墙图由 `getWallImageUrl` 校验后提供短期地址。
4. 两个 HTTP 路由均使用 `POST`、关闭网关身份认证，保持默认跨域和路径透传设置。

在 `/etc/cruxset.env`（可用 `sudoedit /etc/cruxset.env`）配置：

```bash
CRUXSET_CLOUDBASE_STORAGE_URL='https://<环境域名>/api/storage-upload'
CRUXSET_CLOUDBASE_FUNCTION_URL='https://<环境域名>/api/segmentation-publish'
CRUXSET_CLOUDBASE_SIGNING_KEY='与两个云函数相同的随机密钥'
CRUXSET_CLOUDBASE_OWNER_OPENID='CloudBase 管理员的 OpenID'
```

## 4. 发布校准墙面并验收

在实验台 **04 人工校准** 的已保存结果中点击“发布”：`web` 只创建本机 Wall；`cloudbase` 将原图和完整、已签名的校准 JSON 分别直传私有 Storage；`both` 两路独立执行。`segmentationPublish` 只接收小型 `payloadFileId`，下载并验签完整 JSON 后创建公开墙面，因此避开云函数文本请求体 100 KB 和二进制请求体 6 MB 限制。每次发布创建新的 Wall，不覆盖旧 Wall。

小程序重新编译后刷新公开墙面，确认墙图、岩点、线路查看，以及创建、编辑、删除自己的线路。正式验收运行 `npm run verify:phase1 -- --release`，并按[测试与验收](docs/testing.md)完成真机检查。

## 5. 参考

### 核心规则

- Problem 只引用 Hold ID，不保存屏幕坐标。
- 业务数据引用 CruxSet `users.id`，OpenID 只用于微信身份映射。
- Wall 是墙图、几何和岩点的唯一对象；公开后锁定。
- 所有岩点坐标使用 0–1 normalized coordinate。
- 线路编号由服务端原子生成；`Problem.id` 与用户可见的 `Problem.number` 不同。

### 目录概览

```text
web/                    本地 Web 创作工作台
server/                 FastAPI、SQLite、本地图片与发布工具
wechat/miniprogram/     微信原生小程序
wechat/cloudfunctions/  CloudBase 云函数
src/domain/             可测试的共享领域规则
tests/                  自动测试
docs/                   权威参考与部署文档
tools/segmentation-lab/  AI 分割与人工校准实验台
```

不要把私有环境配置或密钥提交到仓库。
