# Spraywall Segmentation Lab

云端管理员工作台、GitHub Actions runner 配置和任务限制见[云端分割实验台](../../docs/segmentation-cloud.md)。云端链路是附加功能；下面的本地命令与数据目录保持不变。

本地运行的攀岩训练墙岩点分割实验台。它面向一面固定 Spraywall：上传并裁剪墙图，使用 SAM 2.1 自动产生岩点候选，再在浏览器中以 SVG polygon 进行人工校准并导出结果。

它是 CruxSet 的独立研究工具：不读取任一运行形态的数据；但可以通过显式发布，将已校准结果创建为本机 FastAPI、CloudBase 或 Cloudflare Web 中的一面新公开 Wall。有关本机启动方式，见[本地 Web 工作台](../../docs/local-web.md)。

当前版本优先支持无 NVIDIA 显卡的 CPU 环境；推理可能需要数分钟。

## 能做什么

1. 导入 JPG 或 PNG，并用多个可拖动角点裁剪出墙面区域。
2. 运行 `sam2` 或 `sam2_tiled`：后者将墙图切成 2×2、20% 重叠的分块，以改善局部候选。
3. 查看原图与候选 polygon 叠加结果，并按任务保留不同参数下的分割记录。
4. 在人工校准台删除误检、在体积上补加岩点、继续编辑已保存校准结果，并导出完整尺寸的 SVG。

## 启动

在本目录执行：

```bash
uv sync --extra models --extra test
SEG_LAB_DATA_DIR=./data uv run uvicorn segmentation_lab.api:app --host 127.0.0.1 --port 8765
```

在浏览器打开 <http://127.0.0.1:8765/>。

## 发布到本机 CruxSet

完整的本机启动方式见[本地 Web 工作台](../../docs/local-web.md)。CruxSet API 与实验台必须配置同一个本机密钥；密钥不会发送到浏览器，也不要提交到版本库：

```bash
export CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret'
export CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID='usr_web_lgjUPpx-3eu-s1_r'
export CRUXSET_BASE_URL='http://127.0.0.1:8000'
export CRUXSET_WEB_URL='http://127.0.0.1:5173'
```

CruxSet 和实验台都使用 `CRUXSET_SEGMENTATION_PUBLISH_KEY`。在校准结果列表点击“发布”，选择一个目标并确认墙面名称。`web`（默认）创建本机 FastAPI/SQLite 的公开 Wall，并保留原图同时生成最长边不超过 3072px、质量 90 的 WebP 展示图；网页优先加载展示图。`cloudbase` 只创建小程序 CloudBase 的公开 Wall。`cloudflare` 只创建 Cloudflare Workers/D1 与 `MEDIA` R2 中的公开 Wall。三个目标必须分别发布；`web` 发布结果会保存在校准记录中，并可打开 CruxSet 浏览地址；不要把 Cloudflare 的响应当作持久保存的实验台回执。

如需将同一份校准结果同步到 CloudBase，在 `/etc/cruxset.env` 配置以下四项（启动脚本会读取并传给实验台；四项必须同时提供，且不会暴露给浏览器）：

```bash
CRUXSET_CLOUDBASE_FUNCTION_URL='https://<cloud-function-endpoint>'
CRUXSET_CLOUDBASE_STORAGE_URL='https://<storage-upload-endpoint>'
CRUXSET_CLOUDBASE_SIGNING_KEY='与 segmentationPublish 云函数相同的密钥'
CRUXSET_CLOUDBASE_OWNER_OPENID='用于解析 CruxSet 用户的 OpenID'
```

选择 `cloudbase` 时，实验台才会先使用签名元数据从 `storageUpload` 获取临时上传凭证，将最长边不超过 3072px、质量 90 的 WebP 墙图和完整签名校准 JSON 直传私有 CloudBase Storage，再由 `segmentationPublish` 下载 JSON 并创建墙面；`web` 与 `cloudflare` 目标不会调用 CloudBase。这样 HTTP 网关只接收很小的 `payloadFileId` 请求，本地校准、Web 与 CloudBase 的岩点几何保持一致。密钥只能放在本机服务端环境变量中，切勿提交到版本库。

如需发布到 Cloudflare Web，在启动实验台前配置服务端环境变量：

```bash
export CRUXSET_EDGE_SEGMENTATION_URL='https://<Cloudflare Workers API 地址>'
export CRUXSET_EDGE_SEGMENTATION_PUBLISH_KEY='与 Cloudflare 发布端相同的随机密钥'
```

`cloudflare` 直接调用该发布端，不经过 CloudBase；它只创建新的公开 Wall。所有目标的发布均不会读取、修改或删除目标中既有的墙面、线路或其他数据，也不会在三套独立数据集之间自动同步。

首次运行 `sam2` / `sam2_tiled` 时，Transformers 会下载 `facebook/sam2.1-hiera-large` 权重；需要联网并预留足够的磁盘空间。模型状态会在页面的“02 选择模型”中显示。`sam3` 需要另行安装其依赖并提供本地 checkpoint；未满足条件时会保持不可用。

## 推荐工作流

1. 在 **01 导入图片** 选择墙图，必要时使用多边形裁剪去除墙外画面。
2. 在 **02 选择模型** 选择 `sam2` 或 `sam2_tiled`，从“基线”预设开始运行。
3. 在 **03 分割结果** 打开结果，确认候选数量与轮廓覆盖范围。
4. 在 **04 人工校准** 加载结果：大体积显示在底层，小岩点显示在上层，新增模式可直接在已有体积的 polygon 上绘制岩点。
5. 保存校准结果，并从首页导出 SVG。

## 参数说明

- **点密度**：采样越密，召回通常越高，运行越慢。
- **批量**：单次批处理数；CPU 上不宜盲目提高。
- **预测质量阈值（IoU）**：模型自评候选质量的最低要求，并不是候选之间的去重阈值。
- **稳定度**：保留边界稳定候选的最低要求。
- **裁剪层**：当前 `sam2` 与 `sam2_tiled` 固定为 `0`。前者避免 CPU 下的内部裁剪不稳定；后者已采用外部 2×2 分块，不能再叠加内部裁剪。

服务还会过滤整墙级候选，并对候选间 IoU ≥ 0.90 的近重复结果保留分数较高者。

## 数据与存储

所有数据位于 `SEG_LAB_DATA_DIR/experiments/<实验 ID>/`：

- `input/original.*`：一份裁剪后的墙图；由 01 创建。
- `experiment.json`：图片信息、分割任务及状态。
- `candidates/*.json`：每个分割候选的 polygon、面积、分数和来源。
- `masks/*.png`：当前版本同时保存的逐候选二值 mask，主要用于像素级复查；查看、校准和 SVG 导出实际使用 polygon。
- `calibrations/<校准 ID>/`：校准记录和最终 polygon 列表，不复制原图或 mask。

一次 300–500 个候选的分割结果，mask 通常约 5–8 MB，候选 JSON 通常约 0.3–0.5 MB。删除分割任务会删除其候选与 mask；已经保存的校准结果只保留 polygon，因此仍然存在，但会失去来源任务的关联。

## 当前限制

- 它只单向创建各目标中的新公开墙面，不会读取、更新或删除目标中的既有墙面、线路或其他数据。
- 人工校准以 polygon 为核心，不支持通过正负点重新调用 SAM。
- 运行同一张图、同一模型、不同参数会创建独立任务，不会覆盖旧结果。
- 任务在本机后台运行；CPU 长任务期间请保持服务进程运行。

## 测试

```bash
uv run --extra test pytest -s -q
```

## 内存结构与复现基准

SAM2 / SAM2 tiled 在每块推理完成后，尽早提取全图坐标的 polygon、bbox 和像素面积；为保持原有像素 IoU 去重与 PNG 精确导出，仅附带按位压缩的 bbox 局部 mask。候选集合不再保存逐候选全图数组。去重只解码 bbox 重叠区域，保留原来的 tiled `IoU > 0.85` 和服务层 `IoU >= 0.90` 规则。

逐候选 PNG 仍与输入尺寸相同，但写出时逐张恢复并释放。Transformers 在当前 tile 内的推理与输出数组仍然占用内存；这次改动消除的是跨 tile 累积的全图 mask，并不保证任意图片和参数都能在固定内存内运行。SAM3 仍可通过原有 AdapterMask 接口接入。

在仓库根目录运行（使用已安装模型依赖的实验台环境）：

```bash
PYTHONPATH=tools/segmentation-lab/src HF_HUB_OFFLINE=1 \
  tools/segmentation-lab/.venv/bin/python \
  tools/segmentation-lab/scripts/benchmark_memory.py \
  tests/fixtures/ritan-spraywall-0822.jpg \
  --max-side 1536 --output /tmp/segmentation-1536.json
```

去掉 `--max-side 1536` 可测试原始 4096×3072 图片。默认使用 `sam2_tiled`、点密度 48、批量 8、4 个 CPU 线程；`--model sam2` 可测整图模式。`HF_HUB_OFFLINE=1` 要求本机已有权重缓存。每次启动新进程，避免上一次任务的峰值 RSS 干扰本次记录。`--synthetic` 使用固定的模拟 tile 输出，仅测后处理，不运行模型。

报告包含输入哈希、实际尺寸、参数、依赖版本、耗时、峰值 RSS（MiB）、adapter 去重后的候选数量与二值数据字节数、最终 polygon 数量、候选 JSON 及逐 PNG 文件哈希。二值数据字节数不含 Python 对象、polygon 或模型本身。Linux 下峰值 RSS 使用 `getrusage`；该脚本的 RSS 单位换算针对 Linux。

前后报告可直接校验；输入、候选几何或 PNG 不一致时命令返回失败：

```bash
python3 tools/segmentation-lab/scripts/compare_memory.py /tmp/before.json /tmp/after.json
```

本次验证结果与旧版本复现方式见 [内存基准记录](../../docs/benchmarks/2026-09-11-segmentation-memory.md)。

### SAM 2.1 自动采样坐标

SAM 2.1 将输入缩放到正方形；自动采样点必须覆盖这个完整的模型输入坐标系。
适配器在每个 pipeline 实例上重建均匀采样网格，避免依赖中的最长边缩放坐标使横图只采样顶部、竖图只采样左侧。
此修正同时作用于 `sam2` 和 `sam2_tiled` 的每个 tile，不改变原图或输出坐标，内部裁剪层继续固定为 0。
旧任务不会自动重算；重启实验台后创建的新任务才使用修正后的采样。此前内存基准比较证明的是旧采样方式下的存储优化；修正后候选数量可能变化，不能直接沿用旧耗时和峰值内存作为新结果。
