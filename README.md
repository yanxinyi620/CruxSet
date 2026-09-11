# CruxSet

CruxSet 将真实攀岩墙数字化，支持墙面浏览、线路创作，以及图像分割和人工校准。

## 三种运行形态

```text
微信小程序：wechat/miniprogram → CloudBase 云函数 → CloudBase DB + 私有 Storage
本地 Web：web（Vite）          → FastAPI           → SQLite + 本地媒体
Cloudflare Web：web/dist       → Workers           → D1 + R2（MEDIA 绑定）
```

| 形态 | 主要能力 | 使用与部署 |
| --- | --- | --- |
| 微信小程序 | 浏览公开墙面，创建、编辑和删除自己的线路；管理员管理符合删除条件的墙面 | [小程序 CloudBase](docs/miniprogram-cloudbase.md) |
| 本地 Web | 管理员墙面创作、标注和发布；线路管理；共享本地账户的分割实验台 | [本地 Web](docs/local-web.md) |
| Cloudflare Web | 注册登录、资料与线路管理；管理员墙面创作；创作者使用云端实验台并管理自己的公开墙面 | [Cloudflare 部署](docs/cloudflare-edge-deployment.md) |

三套账户、授权与数据各自独立，不会自动同步。分割实验台可按权限显式发布到指定目标；发布不等于同步。

## 分割实验台

本地和云端共享页面与分割核心，都从 Web 的“我的 → 分割实验台”在新标签页进入 `/segmentation-lab/`，共享各自主站的登录会话。管理员默认可用，普通账户由管理员开通后成为创作者；授权包含计算、校准、SVG 导出和公开发布自己的结果，不包含网站管理权限。所有用户，包括管理员，只能查看自己的实验数据。

| 项目 | 本地实验台 | 云端实验台 |
| --- | --- | --- |
| 计算位置 | 独立本机 Python 进程（8765），经 FastAPI 鉴权访问 | GitHub Actions；Worker 管理任务、权限与文件 |
| 数据 | 本地实验目录 | D1 元数据与私有 R2 实验对象 |
| 模型 | SAM2、SAM2 tiled；SAM3 需配置 | SAM2、SAM2 tiled |
| 发布目标 | 创作者发布到本地 Web；管理员可额外选择配置好的 CloudBase、Cloudflare | 当前 Cloudflare 站点 |
| 数量额度 | 不应用云端数量额度 | 创作者保留图片 10 张、任务 20 个、每日任务 20 次、公开墙面 10 面；所有账户同时排队或运行最多 2 个任务 |

云端删除旧图片、任务或墙面后释放相应保留额度，每日次数不退回，按北京时间零点重置。管理员不受新增四项数量额度限制。

实验台 **04 人工校准**的校准按钮右侧提供“管理我的墙面”，跳转到对应 Web 的“我的墙面”。本地与云端创作者均可在此删除自己的墙面、关联线路与发布图片；来源实验和校准单独保留。

操作与模型配置见[实验台说明](tools/segmentation-lab/README.md)，Actions 配置与额度细则见[云端实验台](docs/segmentation-cloud.md)。

## 本地快速开始

安装 Node.js、Python 3.12+ 和 uv 后，在仓库根目录运行：

```bash
npm install
./scripts/cruxset-dev start
./scripts/cruxset-dev status
```

打开 <http://localhost:5173>。首次创建本地管理员、模型依赖安装与环境参数见[本地 Web](docs/local-web.md)。当前统一使用 `cruxset-dev` 管理本地三个进程，旧 `cruxset-web` / Quick Tunnel 启动方式已移除，正式公网使用 Cloudflare 部署。

## 文档与验证

[文档导航](docs/README.md)汇总当前指南；[设计参考](docs/reference.md)说明数据和权限边界；[测试与验收](docs/testing.md)列出自动化检查与各端验收。

```bash
npm test
npm run build
npm run edge:typecheck
npm run verify:phase1
```

本地 Python 服务和实验台还需运行各自测试。发布 Cloudflare 前先构建 `web/dist`、应用全部 D1 迁移（含 `0010_lab_access.sql` 与 `0011_lab_quotas.sql`），再部署 Worker；完整命令见[部署指南](docs/cloudflare-edge-deployment.md)。
