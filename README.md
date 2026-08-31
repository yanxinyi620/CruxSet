# CruxSet

CruxSet 是用于数字化真实攀岩墙的系统：用户通过微信小程序浏览、筛选和创建线路；管理员通过本地 Web 工作台维护墙面、岩点和线路；独立的分割实验台用于探索 AI 岩点识别。

```text
本地 Web 创作台 → FastAPI → SQLite + 本地图片
                         ↓（仅显式发布）
                    CloudBase 发布包

微信小程序 → CloudBase 云函数 → CloudBase 数据库 / 存储

分割实验台：独立本地服务，可显式发布已校准结果到本机 FastAPI
```

Web 与小程序共享 Wall、Hold、Problem 的字段语义，但不共享草稿、登录会话或后端。Web 草稿只保存在本地；小程序不依赖 FastAPI 在线运行。

## 文档

- [设计参考](docs/reference.md)：架构、数据模型、业务规则与安全边界
- [测试与验收](docs/testing.md)：自动化检查和人工验收清单
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

本地 Web 与实验台发布：

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

## 微信小程序

使用微信开发者工具导入仓库根目录；工具会读取 `project.config.json`，小程序源码位于 `miniprogram/`。

运行模式配置位于 [runtime.ts](miniprogram/config/runtime.ts)：

```ts
export const runtimeMode: RuntimeMode = 'mock'
```

默认 `mock` 模式使用固定的日坛 Spraywall 和四条示例线路，不需要部署 CloudBase；创建、标注、发布等数据只在本次运行期间保留。准备 CloudBase 验收时改为 `'cloudbase'` 并重新编译；体验版或正式发布前必须使用该模式。

小程序通过 CloudBase 云函数访问线上数据，不依赖 FastAPI 在线运行；Web 草稿也不会自动同步到 CloudBase。部署步骤见下一节。

不要把私有环境配置或密钥提交到仓库。

## CloudBase 部署与验收

将 `miniprogram/config/runtime.ts` 的 `runtimeMode` 改为 `cloudbase`，并在 `miniprogram/app.ts` 配置实际 CloudBase 环境 ID。随后：

1. 创建 `users`、`walls`、`problems`、`admins`、`counters` 五个集合，导入 [集合声明](config/cloudbase.collections.json)，并应用 [权限规则](config/cloudbase.rules.json)。
2. 部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`deleteProblem`、`getWallImageUrl` 六个云函数；每个函数均在云端安装 `wx-server-sdk` 依赖。
3. 为已有 Wall 补齐 `ownerId` 与 `visibility`；墙图保持私有存储，经 `getWallImageUrl` 权限校验后提供短期访问地址。
4. 运行 `npm run verify:phase1`；正式发布前运行 `npm run verify:phase1 -- --release`，再按[测试与验收](docs/testing.md)完成 CloudBase 和 Android/iPhone 真机检查。

数据与业务约束见[设计参考](docs/reference.md)，真机检查见[测试与验收](docs/testing.md)。

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
miniprogram/       微信原生小程序（独立运行）
cloudfunctions/    小程序 CloudBase 云函数入口
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

打开 `http://127.0.0.1:8765/`，在 **04 人工校准** 的已保存校准结果中点击“发布”。发布成功后会打开 CruxSet Web；每次发布都创建一面新的公开 Wall，不覆盖旧 Wall。
