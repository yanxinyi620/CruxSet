# Spraywall Segmentation Lab

本地运行的攀岩训练墙岩点分割实验台。它面向一面固定 Spraywall：上传并裁剪墙图，使用 SAM 2.1 自动产生岩点候选，再在浏览器中以 SVG polygon 进行人工校准并导出结果。

它是 CruxSet 的独立研究工具：不读取小程序或 CloudBase 数据；但可以通过显式发布，将已校准结果创建为本机 FastAPI 和/或 CloudBase 中的一面新公开 Wall。有关完整手动启动方式，请回到[根 README](../../README.md#手动启动并从实验台发布)。

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

完整的三终端启动命令见[根 README](../../README.md#手动启动并从实验台发布)。CruxSet API 与实验台必须配置同一个本机密钥；密钥不会发送到浏览器，也不要提交到版本库：

```bash
export CRUXSET_SEGMENTATION_PUBLISH_KEY='local-only-long-random-secret'
export CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID='usr_web_lgjUPpx-3eu-s1_r'
export CRUXSET_BASE_URL='http://127.0.0.1:8000'
export CRUXSET_WEB_URL='http://127.0.0.1:5173'
```

CruxSet 和实验台都使用 `CRUXSET_SEGMENTATION_PUBLISH_KEY`。在校准结果列表点击“发布”，选择目标并确认墙面名称。目标默认是 `web`：只创建本机 CruxSet 的公开 Wall；不会因为配置了 CloudBase 就自动同步。选择 `cloudbase` 才只同步到小程序 CloudBase，选择 `both` 才会显式执行两路发布；两路互相独立，任一路失败都会保留另一条结果。`web` 发布结果会保存在校准记录中，并可打开 CruxSet 浏览地址。

如需将同一份校准结果同步到 CloudBase，可在 `/etc/cruxset.env` 配置签名密钥和管理员 OpenID，并在启动实验台前配置以下服务端环境变量（四项必须同时提供；不会暴露给浏览器）：

```bash
export CRUXSET_CLOUDBASE_FUNCTION_URL='https://<cloud-function-endpoint>'
export CRUXSET_CLOUDBASE_STORAGE_URL='https://<storage-upload-endpoint>'
export CRUXSET_CLOUDBASE_SIGNING_KEY='与 segmentationPublish 云函数相同的密钥'
export CRUXSET_CLOUDBASE_OWNER_OPENID='用于解析 CruxSet 用户的 OpenID'
```

只有选择 `cloudbase` 或 `both` 时，实验台才会先使用签名元数据从 `storageUpload` 获取临时上传凭证，将墙图直传私有 CloudBase Storage，再调用 `segmentationPublish`；`web` 目标不会调用 CloudBase。直传避免了 HTTP 网关调用云函数时 6 MB 的请求体上限。`both` 模式下本地 FastAPI 发布与 CloudBase 同步互相独立，CloudBase 失败不会撤销本地发布，校准记录会保留每个目标的状态。密钥只能放在本机服务端环境变量中，切勿提交到版本库。

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

- 它只单向创建新的公开墙面，不会读取、更新或删除小程序中的墙面和线路。
- 人工校准以 polygon 为核心，不支持通过正负点重新调用 SAM。
- 运行同一张图、同一模型、不同参数会创建独立任务，不会覆盖旧结果。
- 任务在本机后台运行；CPU 长任务期间请保持服务进程运行。

## 测试

```bash
uv run --extra test pytest -s -q
```
