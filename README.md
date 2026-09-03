# CruxSet

CruxSet 是用于数字化真实攀岩墙的系统：用户通过微信小程序浏览公开墙面、查看和创建线路，并编辑或删除自己的线路；管理员可在小程序管理、删除墙面。本地 Web 工作台负责墙面创建、岩点标注和线路管理；独立分割实验台可将人工校准结果发布为本地 Web 和/或小程序 CloudBase 的公开墙面。

```text
本地 Web 创作台 → FastAPI → SQLite + 本地图片
                         ↓（仅显式发布）
                    CloudBase 发布包

微信小程序 → CloudBase 云函数 → CloudBase 数据库 / 存储

分割实验台：独立本地服务，可显式发布已校准结果到本机 FastAPI 和/或 CloudBase
```

Web 与小程序共享 Wall、Hold、Problem 的字段语义，但不共享草稿、登录会话或后端。Web 草稿只保存在本地；小程序不依赖 FastAPI 在线运行。

## 文档

- [设计参考](docs/reference.md)：架构、数据模型、业务规则与安全边界
- [测试与验收](docs/testing.md)：自动化检查和人工验收清单
- [WSL 长期运行部署](docs/wsl-cloudflare-tunnel.md)：使用 Caddy、具名 Cloudflare Tunnel 和 systemd 在本机持续提供 Web 工作台
- [分割实验台](tools/segmentation-lab/README.md)：独立 AI 岩点分割工具的使用说明
- [历史规格与计划](docs/superpowers/)：开发过程记录，不作为当前实现的权威说明

如文档存在冲突，以完整产品与技术规格为准。

## 本地开发

要求：Node.js 18+、npm，以及微信开发者工具。

```bash
npm install
npm test
npm run build
npm run verify:phase1
```

其中 `npm run build` 只执行 TypeScript 类型检查，不会生成 Web 静态文件。需要将本地 Web 工作台构建为 Vite 静态产物时，从仓库根目录运行：

```bash
npm run web:build
```

构建结果位于 `web/dist`。部署时还需要由 Web 服务器提供该目录，并将同源的 `/api` 请求反向代理到 FastAPI；本地开发无需构建，直接按下文启动 Vite 即可。

本地 Web 与实验台发布：

推荐使用后台管理脚本，一次启动 API、Web 和分割实验台：

    ./scripts/cruxset-dev start
    ./scripts/cruxset-dev status
    ./scripts/cruxset-dev restart
    ./scripts/cruxset-dev stop

脚本固定使用本地开发发布密钥和发布者 ID，并将实验台连接到配置的 CloudBase HTTP 路由；日志与 PID 文件保存在未提交的 .runtime/cruxset-dev 目录。脚本启动时会从 `/etc/cruxset.env` 读取 `CRUXSET_CLOUDBASE_SIGNING_KEY` 和 `CRUXSET_CLOUDBASE_OWNER_OPENID`；也可用同名环境变量覆盖。下面的三终端方式保留用于排查。

```bash
# 终端一：启动 CruxSet API
export CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret'
export CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID='usr_web_lgjUPpx-3eu-s1_r'
cd server
SESSION_COOKIE_SECURE=false \
CRUXSET_SEGMENTATION_PUBLISH_KEY="$CRUXSET_SEGMENTATION_PUBLISH_KEY" \
CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID="$CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID" \
PYTHONPATH=. uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# 终端二：从仓库根目录启动 Web
npm run web -- --host 0.0.0.0
```

电脑打开 `http://localhost:5173`；手机使用电脑局域网 IP，例如 `http://192.168.x.x:5173`。Web 会将 `/api` 请求代理到电脑本机的 FastAPI `127.0.0.1:8000`，手机无需直接访问 8000 端口。首次创建本地管理员：`cd server && PYTHONPATH=. uv run python scripts/create_local_admin.py name@example.com`。如需启动分割实验台并发布校准结果，请继续使用下面“手动启动并从实验台发布”的终端三命令。

### 管理员账户初始化

重新部署后如果保留原数据库，管理员账户会继续保留；如果数据库被清空，需要重新创建：

```bash
cd server
PYTHONPATH=. uv run python scripts/create_local_admin.py admin@example.com
```

脚本会交互式要求输入密码。也可以通过 `ADMIN_BOOTSTRAP_PASSWORD` 环境变量传入密码。已有账户需要重置密码时，使用 `--reset-password` 参数。生产环境应保持稳定的 `SESSION_SECRET`，HTTPS 使用 `SESSION_COOKIE_SECURE=true`；本地 HTTP 开发使用 `SESSION_COOKIE_SECURE=false`。

## 微信小程序

使用微信开发者工具导入仓库中的 **`wechat/` 目录**，而不是仓库根目录；工具会读取 `wechat/project.config.json`，只扫描其中的小程序与云函数源码，避免加载 Web、服务端和分割实验台文件。

运行模式配置位于 [runtime.ts](wechat/miniprogram/config/runtime.ts)：

```ts
export const runtimeMode: RuntimeMode = 'cloudbase'
```

当前默认 `cloudbase` 模式使用已配置的 CloudBase 环境；重新编译后可直接验证公开墙面和线路。需要离线演示时，可临时改为 `'mock'`，它使用固定的日坛 Spraywall 和四条示例线路，数据只在本次运行期间保留。

小程序通过 CloudBase 云函数访问线上数据，不依赖 FastAPI 在线运行；Web 草稿也不会自动同步到 CloudBase。部署步骤见下一节。

不要把私有环境配置或密钥提交到仓库。

## CloudBase 部署与验收

确认 `wechat/miniprogram/config/runtime.ts` 的 `runtimeMode` 为 `cloudbase`，并在 `wechat/miniprogram/app.ts` 配置实际 CloudBase 环境 ID。随后：

1. 创建 `users`、`walls`、`problems`、`admins`、`counters`、`segmentationPublishes` 六个集合，导入 [集合声明](config/cloudbase.collections.json)，并应用 [权限规则](config/cloudbase.rules.json)。
2. 部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`updateProblem`、`deleteProblem`、`getWallImageUrl`、`storageUpload`、`segmentationPublish` 九个云函数；`storageUpload` 还会安装 `@cloudbase/node-sdk`，用于以云函数自身的 CloudBase 权限申请 Storage 直传凭证。
3. 为已有 Wall 补齐 `ownerId` 与 `visibility`；墙图保持私有存储，经 `getWallImageUrl` 权限校验后提供短期访问地址。
4. 运行 `npm run verify:phase1`；正式发布前运行 `npm run verify:phase1 -- --release`，再按[测试与验收](docs/testing.md)完成 CloudBase 和 Android/iPhone 真机检查。

数据与业务约束见[设计参考](docs/reference.md)，真机检查见[测试与验收](docs/testing.md)。

分割实验台同步还需要 `storageUpload` 的 HTTP 网关 URL 和 `segmentationPublish` HTTP 触发器 URL，分别填入 `CRUXSET_CLOUDBASE_STORAGE_URL`、`CRUXSET_CLOUDBASE_FUNCTION_URL`。在 `/etc/cruxset.env` 写入以下服务端配置（权限建议为 `600`）：

```bash
CRUXSET_CLOUDBASE_STORAGE_URL='https://<环境域名>/api/storage-upload'
CRUXSET_CLOUDBASE_FUNCTION_URL='https://<环境域名>/api/segmentation-publish'
CRUXSET_CLOUDBASE_SIGNING_KEY='与两个云函数相同的随机密钥'
CRUXSET_CLOUDBASE_OWNER_OPENID='CloudBase 管理员的 OpenID'
```

`scripts/cruxset-dev` 会读取该文件，shell 中同名变量优先。实验台先以签名的小 JSON 元数据向 `storageUpload` 申请临时上传凭证，再将原图和完整校准 JSON 直传 CloudBase Storage，最后仅将 JSON 的 `fileID` 提交给 `segmentationPublish`；这避免了 HTTP 网关的请求体限制，且本地与 CloudBase 的岩点几何保持一致。两个 HTTP 网关路由均使用 `POST`、关闭网关身份认证、保持默认跨域和路径透传设置即可；认证由 HMAC 签名完成。必须在 CloudBase 控制台将 Storage 设为私有；客户端不直接读取对象，`getWallImageUrl` 是墙图唯一访问入口。

## 核心规则

- Problem 只引用 Hold ID，不保存屏幕坐标。
- 业务数据引用 CruxSet `users.id`，OpenID 只用于微信身份映射。
- Wall 是墙图、几何和岩点的唯一对象；私有 Wall 可编辑，公开后锁定。
- 公开且至少包含两个岩点的 Wall 可被选择定线。
- 所有岩点坐标使用 0–1 normalized coordinate。
- `Problem.id` 与用户可见的 `Problem.number` 不同。
- 线路编号由服务端原子生成。
- 默认 `feet_follow`：Start、Hand、Assist、Finish 可手抓也可脚踩；黄色 Foot 只能脚踩。

## 目录概览

```text
web/               本地 Web 创作工作台
server/            FastAPI、SQLite、本地图片与发布工具
wechat/miniprogram/       微信原生小程序（独立运行）
wechat/cloudfunctions/    小程序 CloudBase 云函数入口
src/domain/        可测试的共享领域规则
src/repository/    数据访问边界
tests/             自动测试
docs/              权威规格与实施计划
tools/segmentation-lab/  独立的 AI 岩点分割与人工校准实验台
```

## 当前验证命令

```bash
npm test
npm run build
```

`npm run build` 会同时检查共享领域代码和微信小程序 TypeScript。

## 手动启动并从实验台发布

以下是本机手动启动 Web、CruxSet API 与分割实验台的完整方式。发布使用同一个仅本机使用的密钥；不要把密钥写入仓库或浏览器代码。

选择一个随机密钥。由于终端环境变量不会自动共享，请在**终端一和终端三分别**执行以下两行，并确保密钥完全相同：

```bash
export CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret'
export CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID='usr_web_lgjUPpx-3eu-s1_r'
```

终端一，启动 CruxSet API：

```bash
cd server
SESSION_COOKIE_SECURE=false \
CRUXSET_SEGMENTATION_PUBLISH_KEY="$CRUXSET_SEGMENTATION_PUBLISH_KEY" \
CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID="$CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID" \
PYTHONPATH=. uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

终端二，启动 Web：

```bash
npm run web -- --host 0.0.0.0
```

终端三，启动实验台：

```bash
cd tools/segmentation-lab
SEG_LAB_DATA_DIR=./data \
CRUXSET_SEGMENTATION_PUBLISH_KEY="$CRUXSET_SEGMENTATION_PUBLISH_KEY" \
CRUXSET_BASE_URL='http://127.0.0.1:8000' \
CRUXSET_WEB_URL='http://127.0.0.1:5173' \
uv run uvicorn segmentation_lab.api:app --host 127.0.0.1 --port 8765
```

打开 `http://127.0.0.1:8765/`，在 **04 人工校准** 的已保存校准结果中点击“发布”。发布目标默认是 `web`，只创建本机 CruxSet 的公开 Wall；选择 `cloudbase` 时，原图与完整、已签名的校准 JSON 分别经临时凭证直传私有 CloudBase Storage，`segmentationPublish` 再通过 JSON 的 `payloadFileId` 下载、验签并写入墙面；选择 `both` 则两路独立执行并分别显示状态。每次发布都创建一面新的公开 Wall，不覆盖旧 Wall。
