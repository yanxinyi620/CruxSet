# 本地分割实验台内存优化验证

本次只改共享分割核心，不涉及 GitHub Actions 或部署。

## 对比方法

旧代码基线：`610b70f1f27538280182b46d84f40a5e982afad0`。使用独立进程对比新旧实现，模型权重从相同本机缓存离线读取。输入为仓库中的 `tests/fixtures/ritan-spraywall-0822.jpg`，同时测试原始 4096×3072 和缩小的 1536×1152；这是同一张图的两个尺寸，不能代表所有墙图。

真实推理采用 `facebook/sam2.1-hiera-large`、`sam2_tiled`，点密度 48、批量 8、预测 IoU 阈值 .85、稳定度 .9、内部裁剪层 0、4 个 CPU 线程。报告记录图像哈希、实际输入哈希、参数与依赖版本。进程峰值 RSS 使用 Linux `getrusage(RUSAGE_SELF).ru_maxrss`；包含模型加载、推理和结果写出。多个进程共享主机，耗时仅供观察，不能视为受控加速比。

保留的 mask 字节数指 adapter 完成去重后候选二值数据的合计，不包含 polygon、Python 对象和模型本身。最终候选比较包含 bbox、面积、分数、polygon、来源元数据；候选 ID 中的随机任务 ID 会标准化。另比较每张完整尺寸 PNG 的 SHA-256。

## 真实 SAM2 结果

| 图片尺寸 | 指标 | 旧实现 | 新实现 |
|---|---|---:|---:|
| 1536×1152 | 完整运行峰值 RSS | 2575.85 MiB（2.52 GiB） | 1893.30 MiB（1.85 GiB） |
| 1536×1152 | 候选二值数据 | 822,804,480 B（784.69 MiB） | 402,626 B（393.19 KiB） |
| 1536×1152 | 最终 polygon 数 | 465 | 465 |
| 1536×1152 | 耗时 | 1343.55 s | 1257.67 s |
| 4096×3072 | 峰值 RSS | 停止前已达 10790.10 MiB（10.54 GiB），非完整运行峰值 | 2525.63 MiB（2.47 GiB） |
| 4096×3072 | 候选二值数据 | 未完成 | 3,189,412 B（3.04 MiB） |
| 4096×3072 | 最终 polygon 数 | 未完成 | 474 |
| 4096×3072 | 耗时 | 进程运行约 2004.92 s 后主动停止 | 1383.19 s |

1536×1152 前后输入、参数和依赖版本一致；465 个候选的 JSON（含几何、面积、分数、来源）以及全部 PNG 文件哈希完全一致。完整进程峰值 RSS 下降约 26.5%，候选二值数据下降超过 99.9%。耗时来自共享主机上的观察，不作为精确加速比。

**4096×3072 旧版基准按用户要求主动停止，不是 OOM，也没有完整的旧版输出比对。** 停止前峰值是该次运行已经达到的数值，只能视为完整运行峰值的下界。新版在相同点密度 48、批量 8 参数下正常完成；这些数据验证了新版大图运行的内存表现，但不能据此声称两版 4K 几何已逐项比对一致。测试期间另有资源保护，用户停止前未触发。

机器可读汇总见 [基准结果 JSON](2026-09-11-segmentation-memory-results.json)。包含全部候选与 PNG 哈希的原始报告保留在本机 `tools/segmentation-lab/data/benchmarks/2026-09-11/`（该数据目录不入版本库）。

## 固定候选压力测试（不含模型）

1536×1152、361 个候选，模拟四块重叠 tile 的模型输出：

| 指标 | 旧实现 | 新实现 |
|---|---:|---:|
| 峰值 RSS | 1070.32 MiB | 178.98 MiB |
| 候选二值数据 | 638,779,392 B | 27,436 B |
| 后处理及写出时间 | 100.77 s | 3.65 s |
| 最终 polygon 数 | 361 | 361 |

候选 JSON 和全部 PNG 文件哈希完全一致。这个结果证明候选存储结构的变化，不能代替真实 SAM2 的端到端内存测量。

## 复现旧版本

在仓库根目录执行，用临时目录保留旧 Python 源码，不修改当前工作目录：

```bash
SEG_BASELINE=$(mktemp -d)
git archive 610b70f1f27538280182b46d84f40a5e982afad0 tools/segmentation-lab/src | tar -x -C "$SEG_BASELINE"
PYTHONPATH="$SEG_BASELINE/tools/segmentation-lab/src" HF_HUB_OFFLINE=1 \
  tools/segmentation-lab/.venv/bin/python \
  tools/segmentation-lab/scripts/benchmark_memory.py \
  tests/fixtures/ritan-spraywall-0822.jpg \
  --max-side 1536 --output /tmp/segmentation-before.json
PYTHONPATH=tools/segmentation-lab/src HF_HUB_OFFLINE=1 \
  tools/segmentation-lab/.venv/bin/python \
  tools/segmentation-lab/scripts/benchmark_memory.py \
  tests/fixtures/ritan-spraywall-0822.jpg \
  --max-side 1536 --output /tmp/segmentation-after.json
python3 tools/segmentation-lab/scripts/compare_memory.py \
  /tmp/segmentation-before.json /tmp/segmentation-after.json
```

去掉两条运行命令的 `--max-side 1536` 测试原图；同时添加 `--synthetic` 测试固定候选。为了严格比较耗时，应单独、顺序运行，固定其他主机负载，并进行重复采样。

## 回归和剩余边界

- 原始测试基线：77 通过、1 失败。失败为 `test_publisher_sends_image_and_metadata_with_bearer_key`。随后核对接收端确认这是真实协议不匹配：本机 FastAPI 要求 Bearer，Cloudflare 要求 HMAC，而客户端曾统一使用 HMAC。
- 内存优化后：94 通过，1 项既有发布失败。按用户后续要求修复发布协议选择后，完整实验台测试 97 项通过。
- 新增测试覆盖局部像素解码、跨 tile 偏移、孔洞、断开区域、阈值边界、稳定排序、全图面积过滤、跨 tile 数组释放、画布增长不增加小岩点存储、旧代码固定输出、随机稠密参考算法及基准工具；另覆盖 PNG 写出失败时任务转为失败状态。
- `tests/fixtures/compact-candidates-baseline.json` 是从上述旧提交的服务生成的固定候选输出。
- 当前 tile 内部的模型批量输出仍可能较大；覆盖整图的候选也会有较大的 bbox，按位压缩不能使任意输入都成为固定内存成本。
- 逐候选 PNG 为保持兼容仍临时分配一张完整尺寸图片，写出后立即释放。
- SAM3 仍接受原有 AdapterMask 协议，本次没有改写其模型推理。

## 发布鉴权修复

发布客户端默认使用本机 FastAPI 要求的 Bearer 密钥，Cloudflare 调用显式选择 HMAC；不按 URL 猜测协议。回归测试验证原有本机请求、对实际发送的 UTF-8 metadata 字节计算 HMAC，以及实验台 web/cloudflare 两条发布路径分别选择正确协议。此前将失败归为旧测试问题的判断已纠正。
