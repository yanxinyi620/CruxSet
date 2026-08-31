# 使用与部署

本文说明 CruxSet 的运行方式、当前交付状态与 CloudBase 验收步骤。

## 本地开发

前置条件：Node.js 18+、npm、微信开发者工具；Web 服务还需要 Python 3.12+ 与 `uv`。

```bash
npm install
npm test
npm run build
```

将仓库根目录导入微信开发者工具。默认 `miniprogram/config/runtime.ts` 为 `mock` 模式，使用固定示例数据，不需要部署 CloudBase；创建和标注数据仅在当前运行期间保留。

启动本地 Web 创作台：

```bash
cd server && PYTHONPATH=. uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
# 另开终端
npm run web
```

在电脑访问 `http://localhost:5173`。局域网设备可使用电脑的局域网 IP 访问。首次创建本地管理员：

```bash
cd server && PYTHONPATH=. uv run python scripts/create_local_admin.py name@example.com
```

### 实验台发布到本机 Web

启动步骤与环境变量见[根 README 的手动启动说明](../README.md#手动启动并从实验台发布)。这条发布路径只支持本机 `127.0.0.1` 服务：实验台提交原图和已校准 polygon，FastAPI 创建新的公开 Wall，Web 刷新后即可浏览和定线。每次发布都是新增 Wall，不覆盖任何已有墙面或线路。

## 当前交付状态

Phase 1 已完成小程序页面与核心领域逻辑、本地 Mock、CloudBase 云函数适配，以及 Web 创作台的本地 FastAPI/SQLite 流程。尚未完成真实 CloudBase 环境部署、真机验收及线上数据初始化。

分割实验台是独立验证工具，不属于 Phase 1 的小程序运行依赖；其启动与限制见[分割实验台 README](../tools/segmentation-lab/README.md)。

## CloudBase 配置与发布验收

准备真实验收时，将 `miniprogram/config/runtime.ts` 的 `runtimeMode` 改为 `cloudbase`，并在 `miniprogram/app.ts` 配置实际 CloudBase 环境 ID。不要提交真实环境 ID、密钥或其他私有配置。

1. 创建 `users`、`walls`、`problems`、`admins`、`counters` 五个集合，并导入 [集合声明](../config/cloudbase.collections.json)。建议建立 `users.openid`、`admins.userId` 唯一索引，以及 `problems.wallId + angle + grade` 和 `problems.number` 索引。
2. 应用 [权限规则](../config/cloudbase.rules.json)：客户端不直接读写业务集合，所有读写经云函数完成。
3. 在每个云函数目录安装 `wx-server-sdk`，并部署 `login`、`adminWall`、`wallManager`、`saveProblem`、`deleteProblem`、`getWallImageUrl`；部署时选择云端安装依赖，不上传 `node_modules`。
4. 对已有 Wall 补齐 `ownerId` 与 `visibility`。墙图保持私有存储，统一由 `getWallImageUrl` 在权限校验后生成短期访问地址。
5. 运行以下发布前检查，再按[测试与验收](testing.md)完成微信开发者工具和真机检查：

```bash
npm run verify:phase1
npm run verify:phase1 -- --release
```

后一个命令会要求真实小程序 AppID。本地检查不能替代真实 CloudBase 与 Android/iPhone 验收。
