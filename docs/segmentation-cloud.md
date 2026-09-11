# 云端分割实验台

云端实验台位于 Cloudflare 主站的 `/segmentation-lab/`，与本地实验台共享页面和分割核心。浏览器经 Worker 上传图片、提交任务和保存校准；模型在 GitHub Actions 执行，Worker 不运行模型推理。

```text
浏览器 /segmentation-lab/ → Worker 会话与授权检查 → D1 + 私有 R2 实验文件
                                         ↓
                                 GitHub Actions 单任务 runner
                                         ↓
                              上传候选、预览图和 mask 到 Worker
```

本地实验台经 FastAPI 使用独立本机计算进程和实验目录。两端账户、授权、图片、任务与校准均不自动同步；本地不应用下述云端额度。

## 账户与授权

实验台共享当前 Cloudflare Web 的 HttpOnly 会话，没有独立注册或登录。管理员默认可用；普通账户在“我的 → 管理中心 → 用户”被管理员开通后显示为“创作者”，底层角色仍为 `user`。

授权包含自己的图片上传、计算、校准、SVG 导出和显式公开发布，不包含用户管理或通用管理员墙面创作权限。刷新“我的”后可见实验台入口，点击在新标签页打开，保留主站页面。旧 `api` 子域的会话不能替代主域会话，需要在实际使用的主域登录。

每次 API 请求重新检查权限：未登录返回 401，未授权返回 403。撤销后同一会话的下一次实验请求也被拒绝，但历史数据和已发布墙面保留；重新授权后恢复访问。已排队或运行的任务可以结束，不会自动公开发布。所有用户，包括管理员，只能访问自己的实验，不能通过其他用户的图片、任务或校准 ID 绕过检查。

## 创作者额度

| 项目 | 非管理员账户上限 | 释放规则 |
| --- | --- | --- |
| 保留的实验图片 | 10 张 | 删除图片及其关联实验资源后释放 |
| 保留的分割任务 | 20 个 | 删除任务或所属图片后释放；排队、运行、成功、失败及超时均计入未删除任务 |
| 每日新建分割任务 | 20 次 | 北京时间零点进入新一天；删除图片或任务不退回次数 |
| 当前公开墙面 | 10 面 | 在“我的墙面”删除旧墙面后释放 |
| 同时排队或运行任务 | 2 个 | 任务结束、超时或删除后释放 |

管理员不受前四项数量额度限制，但仍受每人最多 2 个排队或运行任务的规则约束。额度按用户统计，由数据库写入事务内的触发器检查，并发提交也不能突破上限。

任务成功创建即记入每日用量，包括之后触发 Actions 失败、模型失败或超时的任务；参数无效、并发或额度已满而被拒绝的创建不计数。重试是新任务，占用新的保留额度和当天次数。每日计数保存在 `lab_daily_usage`，不依赖任务记录是否删除。

实验台显示“已用 / 上限”和超限说明。超额后仍可查看、下载和清理已有数据。迁移前已经超额的内容保留，只限制新增；每日用量从现存任务（含软删除记录）回填。

## 模型与任务边界

当前云端支持 `sam2`、`sam2_tiled`，使用 Ubuntu 24.04、Python 3.11、CPU PyTorch 和 4 个 CPU 线程。工作流超时为 90 分钟；Worker 中排队任务期限为 30 分钟，认领后的任务期限为 120 分钟。这些是不同层的超时保护。

上传仅接受 JPEG、PNG，单图最多 20 MiB、任一边最多 4096 像素、总像素最多 16,777,216。参数白名单：点密度 8–64、批量 1–8、预测质量和稳定度阈值 0–1，内部裁剪层固定为 0。SAM3 仅保留在本地配置中。

## 配置 Worker 与 Actions

需要 D1 `DB`、R2 `MEDIA`，以及目标仓库默认分支上的 [segmentation-lab.yml](../.github/workflows/segmentation-lab.yml)。工作流先在默认分支注册后，`LAB_GITHUB_REF` 才用于选择实际运行的分支或 ref；该 ref 上必须包含相同的输入定义。

| Worker 配置 | 用途 |
| --- | --- |
| `LAB_GITHUB_TOKEN` | 仅对目标仓库授予 Actions 写权限的细粒度 token，用于触发工作流 |
| `LAB_GITHUB_REPOSITORY` | `owner/repository` |
| `LAB_GITHUB_REF` | 实际执行的分支或 ref，当前仓库配置为 `main` |
| `LAB_GITHUB_WORKFLOW` | 默认 `segmentation-lab.yml` |
| `LAB_RUNNER_KEY` | Worker 与仓库 Actions 共享的随机内部密钥 |

在仓库根目录交互设置密钥，避免把值写进命令、文档或前端：

```bash
npx wrangler secret put LAB_GITHUB_TOKEN --config edge/wrangler.jsonc
npx wrangler secret put LAB_RUNNER_KEY --config edge/wrangler.jsonc
gh secret set LAB_API_URL
gh secret set LAB_RUNNER_KEY
```

仓库 Secret `LAB_API_URL` 为线上 API 前缀，以 `/api/v1/segmentation-lab` 结尾；`LAB_RUNNER_KEY` 与 Worker 相同。工作流通过输入传递 task/attempt ID，并从 GitHub 运行信息派生 run ID。runner 不持有整桶 R2 访问凭据。

`SEGMENTATION_PUBLISH_KEY` 属于本地实验台向 Cloudflare 发布的独立机器接口，不是云端用户发布校准的登录凭据。云端用户通过现有会话和归属检查直接发布到当前站点。

部署前应用全部 D1 迁移，包含 `0010_lab_access.sql` 和 `0011_lab_quotas.sql`，再部署 Worker 与页面。命令及迁移注意事项见[Cloudflare 部署](cloudflare-edge-deployment.md)。

## Runner 与状态

工作流安装云端依赖，单个 job 处理一个已认领任务：

```bash
cd tools/segmentation-lab
uv sync --locked --extra sam2
uv run --no-sync python -m segmentation_lab.cloud_runner
```

运行时读取 `LAB_API_URL`、`LAB_RUNNER_KEY`、`LAB_TASK_ID`、`LAB_ATTEMPT_ID`、`LAB_RUN_ID`。认领成功后下载并校验输入，调用 `BenchmarkService`，上传 `candidates.json`、`display.webp`、`masks.zip` 后报告结果。被拒绝的认领不会把其他 runner 的任务标为失败。

状态包括 `queued`、`running`、`succeeded`、`failed` 和 `timed_out`。迟到的上传或回调不能恢复已终止任务。触发失败记录可重试错误，不将 GitHub 响应正文暴露给用户。应通过页面创建重试任务，不手动复用旧 task/attempt ID。

模型版本在工作流中固定。缓存只包含模型文件，不包含实验图片、任务凭据或分割结果；首次下载可能较慢。本地仍使用自己的模型依赖与配置。

## 发布、墙面管理与删除

推理不会自动发布。用户保存校准并确认发布后，创建归当前用户所有的公开 Wall；重复提交同一已发布校准返回原发布回执，不创建重复墙面。删除墙面后，旧回执不会恢复它；需保存新的校准再发布。

实验台 **04 人工校准**中，“选择分割结果并开始校准”的右侧是“管理我的墙面”，新标签页打开 `/me?panel=my-walls`。墙面管理统一在主站，不另设 05 管理页或取消公开控件。创作者可删除自己的公开墙面及其全部关联线路、岩点和发布图片；不能删除他人的墙面，撤销实验台授权后仍可清理自己的墙面。

| 操作 | 实验资源和公开内容的影响 |
| --- | --- |
| 删除任务 | 删除任务产物；已保存校准有独立候选和展示图副本，继续保留 |
| 删除实验图片 | 删除该实验、任务和校准；已经公开的墙面不受影响 |
| 删除公开墙面 | 删除关联线路、岩点与发布图片；来源实验和校准仍保留 |

输入和任务产物使用私有 `lab/` R2 前缀，由鉴权 API 返回；校准和公开发布分别复制所需文件，生命周期独立。删除中的存储清理失败会保留持久清理记录，由每 5 分钟的定时任务重试。公开发布意味着相关墙面内容可供他人浏览，不授予原实验访问权限。

任务异常时可以删除或等待超时，检查配置后重新提交。调整云端 Actions 配置不改变本地服务；本地运行和已发布墙面独立于云端任务队列。具体历史运行、内存测量及发布验证见[云端验证记录](benchmarks/2026-09-11-segmentation-cloud-verification.md)，不将历史结果当作当前所有输入的性能保证。
