# CruxSet 静态图片与免费边缘业务实施方案

> **For agentic workers:** 使用 superpowers:executing-plans 按任务执行，逐项勾选并记录验证证据。当前任务只交付文档，不开始编码、部署或开通订阅。

**Goal:** 图片由管理员在本机更新并随静态资源部署；电脑关机后公开浏览及已迁移线路业务继续运行，不开通 R2。

**Architecture:** Workers Static Assets 承载前端及公开展示图，Worker Free 承载轻量 API，D1 Free 为线上业务唯一写入源。本机保留创作和 AI；首次迁移与后续墙面增量发布严格分开，避免覆盖线上线路。

**Tech Stack:** 现有 Vite/TypeScript、Python/SQLite 导出工具；新增 TypeScript Worker、Wrangler、D1、Cloudflare Worker 测试支持。具体依赖版本在执行时按 Node 兼容范围安装并锁定。

**设计依据:** [架构方案](../../cloudflare-edge-architecture-proposal.md)。本计划所有新文件、命令和脚本均为拟创建项，勾选完成前不可视为已存在或已验证。

## 1. 实施顺序与交付边界

| 阶段 | 任务 | 可交付结果 | 放行条件 |
| --- | --- | --- | --- |
| A | 1–3 | 可审阅的公开导出包、免费 Worker 骨架 | 不含私有文件，静态请求不执行 Worker |
| B | 4–5 | 预发布 D1 与分页只读 Web | PC 关闭可浏览，所有记录/图片引用一致 |
| C | 6–7 | 云端身份与授权线路写入 | 认证方案验证通过，所有权限与并发测试通过 |
| D | 8–9 | 本机增量发布、异常防护 | 可重复发布，旧图片和线上线路不被覆盖 |
| E | 10 | 生产切换及回滚演练 | 冻结/迁移/恢复步骤演练通过 |

不并行改写共享领域层，也不为这个迁移重构整个 Web。每个任务完成后保留独立变更记录；执行时在隔离分支工作，不夹带用户现有未提交改动。认证是 C 阶段的明确决策门槛，不阻塞 A/B，也不能以“后续处理”为由上线无认证写入。

## 2. 文件职责

| 路径 | 操作与职责 |
| --- | --- |
| `edge/package.json`、`edge/tsconfig.json`、`edge/wrangler.jsonc`、`edge/vitest.config.ts` | 新建：独立 Worker 工程、绑定、开发/测试与部署配置 |
| `edge/src/index.ts`、`edge/src/errors.ts` | 新建：路由、统一错误、能力开关；不塞入领域实现 |
| `edge/src/walls.ts`、`edge/src/problems.ts` | 新建：公开查询、授权线路操作与校验 |
| `edge/src/auth.ts`、`edge/src/limits.ts` | 新建：身份适配、会话/权限、限流与维护开关 |
| `edge/src/publishing.ts` | 新建：本机专用幂等发布接口 |
| `edge/migrations/0001_business.sql` | 新建：业务表、索引与编号约束；认证相关迁移在方案确定后独立新增 |
| `edge/tests/*.test.ts` | 新建：Worker/D1 运行时测试，不使用模拟成功替代数据库并发验证 |
| `server/scripts/export_edge_snapshot.py`、`server/tests/test_edge_export.py` | 新建：一致快照、公开内容选择、首次导出与测试 |
| `scripts/prepare-edge-assets.mjs`、`scripts/publish-edge.mjs` | 新建：资源组装/检查、按阶段部署与发布 |
| `tests/edge-assets.test.ts`、`tests/edge-publish.test.ts` | 新建：包泄露检测、发布失败恢复与旧资源保留 |
| `web/src/api.ts`、`web/src/data/api-session.ts`、`web/src/main.ts` | 修改：分页、按需详情、云端能力与认证入口 |
| `web/vite.config.ts` | 修改：通过构建模式选择隔离的公开资源目录；本地默认配置保持可用 |
| `package.json`、`.gitignore` | 修改：边缘构建/验证入口，忽略凭据、快照与导出产物 |
| `docs/testing.md`、`docs/cloudflare-edge-deployment.md`、`README.md` | 修改/新建：验收、发布操作、回滚和文档导航 |

生成文件放 `.runtime/edge/`（私有快照、manifest、发布日志）与 `.runtime/edge-public/`（仅公开资源），都加入忽略规则。不能把数据库或整个 `server/data`、实验台 data 复制到 `web/public`。不要修改小程序身份体系。

## 3. 逐项任务

### 任务 1：建立迁移清单与基线

参考：`server/app/repositories/sqlite.py`、`server/app/api/creator.py`、`server/app/api/auth.py`、`web/src/api.ts`、`web/src/data/api-session.ts`、`tools/segmentation-lab/src/segmentation_lab/cruxset.py`。

- [ ] 运行现有验证，记录失败是否原先存在：根目录 `npm test`、`npm run build`、`npm run web:build`；server 目录 `uv run --extra test pytest -q`。先核对 server 的 test extra，若未定义使用项目现有测试依赖方式，不修改产品代码掩盖基线失败。
- [ ] 用 SQLite 只读连接和 backup API 生成一致快照，列出各 collection 的记录数量、最大编号、公开墙数、图片体积；报告不输出密码、邮箱或密钥。
- [ ] 确认哪些墙被选为首次公开迁移、历史线路和作者如何保留；有问题的引用列为导出错误，不能自动丢弃。
- [ ] 在部署手册记录线上/本地能力矩阵：云端线路编辑保留，上传/标注/AI 移至本机；认证迁移列为单独门槛。

验收：有基线和数据清单，不改变数据库与现网流量。

### 任务 2：导出公开墙与静态图片

文件：新建 `server/scripts/export_edge_snapshot.py`、`server/tests/test_edge_export.py`。

- [ ] 先编写导出测试，构造“一个公开墙、一个私有墙、关联线路、用户与密码字段”的临时 SQLite，断言公开包不出现私有记录/密码/原图路径。
- [ ] 测试缺图、非法坐标、重复 Hold ID、悬空 Problem 引用会使导出失败；测试重复导出相同图得到相同哈希路径。
- [ ] 实现两类独立输出：公开墙 manifest/展示图；私有首次迁移数据（业务用户与线路，认证凭据另按任务 6 处理）。使用显式字段白名单，不直接序列化全部 document。
- [ ] 从已有 displayImageFileId 读取合法本地图片，无展示图时在本机按既有 3072px WebP 规则生成。只接受受控媒体目录内的路径，拒绝路径穿越与任意远端下载。
- [ ] 生成以下 manifest 合同，wall 使用现有公开 Wall 字段，`imageFileId` 与 `displayImageFileId` 均指向本次展示图，避免客户端回退到本机原图：

```ts
// 在 edge/src/publishing.ts 和脚本中以同一合同验证，sha256 为小写十六进制。
type StaticWallPublish = {
  schemaVersion: 1
  releaseId: string
  walls: Array<{
    wall: Record<string, unknown>
    image: { path: string; sha256: string; bytes: number; width: number; height: number }
  }>
}
```

- [ ] 在 server 运行 `uv run --extra test pytest tests/test_edge_export.py -q`，预期全部通过，失败情况下无可被误当作成功的完整包。

验收：每张公开墙图与 Hold 坐标一致，输出目录隔离且可重复生成。

### 任务 3：建立 Static Assets + Worker 工程

文件：新建 edge 配置与 `edge/src/index.ts`、`edge/src/errors.ts`、`edge/tests/routing.test.ts`；修改根 package.json、Vite 配置和忽略规则。

- [ ] 初始化 edge 独立依赖并锁定版本；配置 `edge:test`、`edge:typecheck`、`edge:dev`、`edge:build` 根脚本，测试与类型检查不能遗漏 edge。
- [ ] 配置骨架（实际数据库 ID 由创建环境后写入相应配置；不把示例名称当真实 ID）：

```jsonc
{
  "name": "cruxset-edge",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-08",
  "assets": {
    "directory": "../web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/v1/*"]
  }
}
```

- [ ] 先测试未知 `/api/v1/*` 返回 JSON 404、静态图片返回 image/webp、页面深链返回 HTML；不注册 upload/jobs 路由，已知禁用能力返回 `CAPABILITY_UNAVAILABLE`。
- [ ] 实现 `/api/v1/healthz` 和统一 `{error:{code,message}}`，不输出内部异常、SQL 或环境变量。
- [ ] 分离本地和云端构建模式，云端复制公开图片到 `web/dist/wall-images`，不得复制私有 manifest。保持本地 FastAPI 代理。
- [ ] 运行 `npm run edge:test -- routing`、`npm run edge:typecheck`、`npm run edge:build`；部署前用 Wrangler dry-run 检查包与绑定，不创建 R2/KV/付费服务。

验收：配置中无 R2，免费计划下的静态请求路由与包内容符合设计。

### 任务 4：D1 schema 与一次性数据迁移

文件：`edge/migrations/0001_business.sql`、`edge/tests/migration.test.ts`；扩展导出器私有 SQL 输出。

- [ ] 设计显式表：users、admins（角色映射）、walls、holds、problems、counters、static_wall_publishes、asset_refs。保留原 ID 与可见编号；身份凭据不进入公开表响应。
- [ ] 索引至少覆盖公开墙排序、`problems.wallId`、作者查询、墙内编号唯一性；Hold 以 `(wallId,id)` 约束归属。引用字段与已有数据一一映射，不复制 JSON 全表扫描模式。
- [ ] 先测试孤立 Hold/Problem、重复编号被拒绝，首次导入幂等；使用 D1 本地测试运行时验证迁移，不仅在 Python SQLite 上通过。
- [ ] 导出私有 migration SQL/批次，区分初次导入与后续发布。参数/SQL 长度按 D1 限制分批，每批可追踪；失败后禁止半成品环境切流。
- [ ] 在新建预发布 D1 上应用迁移并导入。以 count、主键集合、最大编号、图片路径、Hold 引用核对快照；没有真实环境 ID 时只完成本地验证，不伪造远端成功。
- [ ] 运行 `npm run edge:test -- migration`，记录实际 D1 rows_read/rows_written 与数据库容量。

验收：公开业务导入无丢失，私有墙不出现在公开查询，生产未切换。

### 任务 5：只读 API、分页与前端能力

文件：`edge/src/walls.ts`、`edge/src/problems.ts`、`edge/tests/browse.test.ts`；修改 API 客户端、ApiSession、main.ts；新增 `tests/edge-browse-session.test.ts`。

- [ ] 先用 55 条记录测试跨页无遗漏、无重复，非法游标/limit>50 被规范处理；私人墙和作者敏感字段不返回。
- [ ] 返回墙/线路列表 `items + nextCursor` 的明确合同；bootstrap 保留 user 并增加 capabilities、首屏数据/游标。为本地旧响应保留适配，不能把不同合同直接强制类型转换。
- [ ] 实现带稳定 `(createdAt,id)` 排序的游标分页；墙详情按需读取 holds，条件过滤在 SQL 完成。
- [ ] 改 ApiSession：未知墙通过详情获取，不把首屏当全部数据；按分页状态加载线路，刷新后不丢当前选中墙。测试第二页墙的查看、线路编辑入口与返回导航。
- [ ] 云端隐藏上传/草稿/标注/AI，保留本地；服务端同时拒绝这些接口。只读阶段线上不展示可提交写入按钮。
- [ ] 运行 `npm run edge:test -- browse`、`npm test -- tests/edge-browse-session.test.ts`、`npm run web:build`。预发布关闭本机服务后验证图片、墙详情和第二页线路。

验收：只读阶段独立可用，不以启用不安全登录换取“完整上线”。

### 任务 6：认证可行性门槛与身份迁移

文件：新建 `docs/cloudflare-edge-auth-decision.md`、`edge/tests/auth.test.ts`、`edge/src/auth.ts`；修改 `web/src/api.ts`、`web/src/main.ts`。

- [ ] 使用与现有 `PasswordHasher()` 等效安全参数的代表性密码哈希，在真实 Workers Free 验证兼容性、CPU 和内存。测试登录、错误密码、并发；不将本机 wall time 当 Worker CPU。
- [ ] 若稳定不满足 10 ms/128 MB，记录拒绝沿用的证据，评估外部身份提供方的免费条件、目标用户可达性和注册方式，并提交具体选择供确认。不得自行降低参数、把密码传回 PC，或默默改变用户登录方式。
- [ ] 决策文档必须写明：选用机制、当前账户迁移、邮箱是否验证、provider subject 到 `users.id` 映射、Cookie/CSRF/退出与密钥轮换。身份绑定禁止仅凭客户端声称的邮箱自动继承历史作者或管理员。
- [ ] 决策确定后实现 auth 适配与独立 schema 迁移；管理员由受控初始化指定，不靠前端角色字段。保留历史用户 ID 与线路作者，无法映射的账户保持不可登录且不转移所有权。
- [ ] 测试过期/伪造身份、跨站写入、退出后会话、普通用户管理员接口、角色变更、登录限流。响应不泄露 passwordHash。
- [ ] 运行 `npm run edge:test -- auth`、`npm run edge:typecheck`，真实免费环境再次检查 CPU，达到验收后才开启任务 7 写入。

验收：认证选择有证据且被确认；如果不通过，B 阶段只读可保留，C/E 的完整上线不能标记完成。

### 任务 7：线路写入与删除保护

文件：`edge/src/problems.ts`、`edge/src/walls.ts`、`edge/tests/problem-writes.test.ts`、`edge/tests/permissions.test.ts`。

- [ ] 从现有 FastAPI 测试迁移行为用例：所有者可编辑/删除、他人不可编辑、非法 Hold 被拒绝、有线路墙不可删、普通用户不可管理墙。
- [ ] 实现创建/编辑/删除线路、资料更新及管理员删墙；保留当前错误码和编号格式，具体服务端规则参考 `server/app/api/creator.py`，不复制其中对全库列表的查询方式。
- [ ] 编号分配、线路写入和关联保护使用条件语句与 D1 事务性 batch；保留唯一约束。删除墙与并发新建线路必须由数据库约束/原子操作保证，不用先查询再独立删除。
- [ ] 添加并发创建测试，验证编号不冲突；重试策略须有上限，不能在配额耗尽时自旋。采用请求幂等键时定义同键不同内容返回 409。
- [ ] 测试模型为普通用户时更新资料不会升级角色；所有角色来自服务端授权表。
- [ ] 运行 `npm run edge:test -- problem-writes permissions` 与根 `npm test`，预发布实际操作后核对 D1 数据。

验收：PC 离线时授权用户可完成线路生命周期，线上数据不会回写到本机旧数据库。

### 任务 8：本机增量发布工具

文件：`scripts/prepare-edge-assets.mjs`、`scripts/publish-edge.mjs`、`edge/src/publishing.ts`、`edge/tests/publishing.test.ts`、`tests/edge-assets.test.ts`、`tests/edge-publish.test.ts`。

- [ ] 先测试资源包只包含白名单文件、拒绝超 25 MiB 文件与超 20,000 总文件；文件计数包含前端产物，不只算图片。
- [ ] 资源组装依据线上 asset_refs 与当前包保留所有仍被引用的哈希图片。若本地缺少旧图片，先从可信线上地址取得并验哈希；取回失败则阻止部署，不静默删图。
- [ ] Worker 发布接口仅接受单墙小批次和受控发布凭据，限制 JSON 大小/hold 数；利用 ASSETS 检查对应路径真实存在且内容类型正确。图像全文件哈希由发布工具验证，避免 Worker 为大图计算哈希超 CPU；凭据不进入前端。
- [ ] 将墙/Hold/图片引用/发布 ID 在 D1 原子提交，同 ID 同内容幂等、不同内容 409。接口不接受 users/problems 的覆盖导入。
- [ ] 编排命令按固定状态执行：prepare → build → deploy → verify-images → publish-metadata → verify-wall。新增 `npm run edge:publish -- --manifest <本地清单路径> --environment staging`；真实执行前将参数解析与失败状态持久化实现完毕。
- [ ] 对部署失败、图片校验失败、数据库提交失败、成功响应丢失逐一测试。重试从相同发布 ID 恢复，不重复墙/编号；新包不能导致旧墙图片消失。
- [ ] 运行 `npm run edge:test -- publishing`、`npm test -- tests/edge-assets.test.ts tests/edge-publish.test.ts`，再用一面测试墙完整发布两次，核对只创建一次。

验收：一条命令可完成发布并准确报告失败；实验台原有 web/cloudbase/both 流程保持不变，首期从已生成本机墙导出，不扩展实验台 UI。

### 任务 9：限流、监测与恢复操作

文件：`edge/src/limits.ts`、`edge/tests/limits.test.ts`、`docs/cloudflare-edge-deployment.md`。

- [ ] 配置设计中的查询/登录/写入/发布起始速率；限制发生在昂贵操作前。测试 429、Retry-After、用户和机器键隔离，不把近似位置计数描述为全局硬限额。
- [ ] 测试维护模式禁写；D1 故障返回可理解错误。前端有上限退避，不对每次失败写 D1 日志。
- [ ] 通过云端定时检查与官方通知记录免费用量，起始 80% 预警，单库 400 MB 预警；监测秘密不暴露到前端。记录日重置北京时间 08:00，指标延迟及自身用量。
- [ ] 限制会话/审计保留时间并分批清理，采用低频任务，验证不会删除业务数据。不引入 R2、KV 或付费监控作为依赖。
- [ ] 运行 `npm run edge:test -- limits`。模拟阈值与存储错误，不用真实耗尽生产配额验证。

验收：PC 关闭仍能预警，免费额度耗尽时有清晰降级，不产生无限重试。

### 任务 10：生产切换与回滚演练

文件：`docs/cloudflare-edge-deployment.md`、`docs/testing.md`、`README.md`。

- [ ] 执行一次完整验证：`npm test`、`npm run build`、`npm run web:build`、`npm run edge:typecheck`、`npm run edge:test`、`npm run edge:build`，server 测试与实验台相关发布测试；按现有要求执行小程序 `npm run verify:phase1`。记录版本、命令结果与预发布人工验收。
- [ ] 明确切换窗口：冻结当前线上 Web 写入 → 一致快照 → 首次导入 → 部署图片/前端 → 核对记录与图 → 开放云端写入。CloudBase 不切换，私有草稿仍留本地。
- [ ] 验证登录、查看旧线路、创建/编辑/删除本人线路、查看第二页、管理员删墙保护、重试发布和 PC 离线；真实用户网络测试通过后使用稳定入口。
- [ ] 备份 D1 到受控本地目录并做恢复演练。回滚代码须保留当前所有图片与兼容 schema，不直接切回缺新图的旧部署。
- [ ] 演练退回 FastAPI：冻结 D1 写入 → 导出最新 users/walls/holds/problems/编号 → 转换回 documents 格式 → 在副本 SQLite 验证 → 确认图片与身份兼容 → 才切入口。外部认证若无法在本地兼容，回退保持只读，不伪造旧密码登录。
- [ ] README 链接新入口与部署文档，说明本机创作/线上浏览和数据权威边界；记录未实现项，不能把只读预览标记为完整迁移。

验收：线上运行符合新架构，回滚不会丢失新线路，无 R2 订阅或绑定被本次实施创建。

## 4. 文档自审映射

| 架构要求 | 覆盖任务 |
| --- | --- |
| 图片本机维护、静态公开、无 R2 | 2、3、8 |
| 保留 ID/编号、D1 唯一写入权威 | 1、4、7、8、10 |
| 分页与云端能力限制 | 3、5 |
| 认证安全与免费预算 | 6、9 |
| 发布顺序、幂等、旧图保留 | 8 |
| 限流与异常降级 | 9 |
| PC 离线、回滚、小程序不受影响 | 5、10 |

本计划未执行；没有承诺现有 Argon2 可在免费 Worker 工作。需要账户实际配置的步骤在实施时完成，涉及改变用户登录方式时以具体认证决策为准。
