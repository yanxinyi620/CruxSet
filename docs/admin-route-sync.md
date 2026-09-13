# 管理员线路双向补齐

本地 Web 和云端 Web 仅在「我的 → 管理中心 → 墙面」中，为公开墙面提供右侧「同步线路」按钮；左侧保留原「删除墙面」按钮。「我的墙面」不提供同步入口。目标为小程序。先检查差异，再点击「双向补齐」。每次请求最多向每端新增 5 条，界面连续执行至完成；出现失败停止并保留成功结果，重新检查后可重试。

- 只新增，不覆盖、不传播删除。删除后若另一端仍存在，下次会再次补回。
- 导入线路的 createdBy 为目标平台管理员；不建立原作者映射。
- 相同墙面内，岩点角色、角度、脚点规则、难度一致即跳过；名称、描述、创作者不参与去重，目标已有内容保持原样。
- 缺少起终点、未知岩点等无效线路列为未通过校验，不自动修复。
- 同一校准版本的墙面必须已发布到两端。按实验/校准来源关联，再检查几何指纹；不会凭墙面名称或相似图像猜测。未匹配墙面时，请先发布到另一端。
- D1 迁移可恢复原云端实验台直接发布墙面的来源；历史本地向 Cloudflare 发布、且从未保存来源信息的墙面需要补充经过核对的来源记录后才能同步。不要用相同名称自动补写。

## 部署

1. 部署 `wechat/cloudfunctions/routeSync` 云函数，安装其依赖。给它配置：
   - `CRUXSET_CLOUDBASE_SIGNING_KEY`：与 Web 服务一致的服务器签名密钥。
   - `CRUXSET_CLOUDBASE_OWNER_OPENID`：接收线路的小程序管理员 OpenID；该用户必须已登录且存在 `admins.userId` 记录。
2. 在 CloudBase HTTP 访问服务中将例如 `/api/route-sync` 绑定此云函数，使用 HTTPS。成功返回 JSON，错误返回非 200 的 `{error:{code,message}}`。无需改小程序客户端或重新发布小程序。
3. 本地 FastAPI 环境和 Cloudflare Worker 配置：
   - `CRUXSET_CLOUDBASE_ROUTE_SYNC_URL=https://<环境域名>/api/route-sync`
   - `CRUXSET_CLOUDBASE_SIGNING_KEY=<上述密钥>`
   本地 `scripts/cruxset-dev` 会从现有环境配置文件加载新增地址，修改后重启本地服务。密钥只留在服务端。
4. 在 CloudBase 按集合配置建立墙面来源索引；D1 执行 `0014_route_sync.sql` 迁移，然后部署 Worker 和 Web 资源。本地 SQLite 无额外结构迁移。
5. 管理员在一面已发布到两端的测试墙面点击「同步线路」检查，再执行补齐。分别验证不同岩点编号可对应、重复执行新增为 0、难度不同会新增、名称不同不会新增、导入归管理员。

第一版不提供本地 Web 与云端 Web 的直接同步入口；两端均可分别与小程序双向补齐。

## 指纹与一致性

`hold-v1`：归一化坐标量化到百万分之一；多边形去除闭合重复顶点，统一起点和方向；类型也参与。多边形不使用不同发布器计算的中心或半径；圆形使用圆心和半径。

`wall-geometry-v1`：排序后的全部岩点 SHA-256。此指纹只在来源已经核对的墙面对内使用，不能独立证明两张照片属于同一实体墙。

`route-v1`：墙面几何指纹、角度、难度、脚点规则，以及按 start/foot/hand/assist/finish 分组、组内排序的岩点指纹。不使用数据库 ID 或显示编号。

跨语言 fixture 位于 `tests/fixtures/route-sync.json`。CloudBase 分页返回完整线路快照 hash，Web 遇到分页期间数据变化会拒绝继续，提示重试。两端导入在目标事务内重新校验和去重；D1 通过每墙修订号防止扫描后并发写入造成重复，本地 SQLite 使用写事务，CloudBase 使用墙面 routeRevision 冲突重试。

## 本次验证

已在本地完成单元/接口测试、两种 Web 构建和 Worker dry-run；随后按用户授权完成下面的线上配置。没有执行线路导入。


## 2026-09-13 部署记录

- 已部署 CloudBase `routeSync`，复用现有墙面发布签名密钥和接收管理员；HTTP 路径 `/api/route-sync`，请求仍由云函数验证签名。
- 已建立 CloudBase `walls.route_sync_source` 复合索引，执行 D1 `0014_route_sync.sql`。
- 已设置 Worker `CRUXSET_CLOUDBASE_ROUTE_SYNC_URL` 并发布 Web/Worker，版本 `04e60f42-5117-4b72-8a73-7d23affec1e3`。
- 已更新本机 `/etc/cruxset.env` 同步地址，并只重启本地 API 使其生效。
- 云端历史墙面 `wall_9_PJELYaPR6p` 与本地记录具有相同 ID、全部 369 个岩点的规范化几何指纹一致；据本地已保留的实验与校准来源补齐 D1 来源关联。没有按名称猜测或修改线路。
- 对实际墙面“日坛spray0831”的签名快照及本地管理员 preview 返回 HTTP 200，预览结果为本地缺少 2 条、小程序缺少 12 条、无无效线路。此为部署时快照，后续操作可能改变数量。
- 云端未登录用户调用同步接口返回 403。实际双向补齐由用户点击执行，本次未发送任何 import/sync 动作。

### 发布回执恢复

`routeSync` 的签名只读动作 `publish-status` 接受 `publishRequestId`，核对
`segmentationPublishes`、墙面及删除任务，返回 pending/published/deleted。
云端 Web 在申请列表读取、重试前、发布异常后和每五分钟的定时任务中核对回执。
有成功回执即恢复为已发布；十分钟处理租约到期仍无回执时允许复用原申请重试。
查询服务不可用时保持原状态，不将未知结果当作未发布。目标已删除时不恢复墙面。
部署此版本必须先更新 routeSync 云函数，再更新 Worker。
