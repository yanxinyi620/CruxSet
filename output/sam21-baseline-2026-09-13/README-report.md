# 测试材料说明

Git 仓库仅保留报告、参数、汇总指标、评估方法与报告配图。下文提到的逐组原始结果、参考轮廓、manifest、日志及异常记录属于本地完整材料，已被 `.gitignore` 排除；仅克隆仓库无法直接复算全部评分。复算时需另行取得这些本地材料或完整报告压缩包，并按原目录结构放置。压缩包也不纳入 Git。

先阅读 `SAM21-report.md`。`recommended-baseline.json` 保存推荐模型、参数、指标以及云端任务与GitHub运行链接。

`summary.csv` 是全部实际运行的参数和指标对照；每个实验子目录保存 `candidates.json`（完整预测多边形）、`metrics.json`（匹配指标与索引）、`iou.npy`（逐轮廓IoU矩阵）以及GitHub运行元数据和日志。`reference.json` 为冻结的369个参考轮廓。`manifest.json` 记录图像校验和、模型权重版本、分割实现版本与仅改变启动方式的派生提交。

如需复算几何评分，在独立Python 3.12环境安装 `requirements-evaluation.txt`，然后运行：

```bash
python evaluate.py --self-test
python evaluate.py C03-whole64-balanced
```

将例子中的组别替换为目标子目录名。复算评分只需要预测和参考多边形，不需要下载模型或重新运行GitHub任务。`pairs` 数组每项为 `[参考索引, 预测索引, IoU]`，索引均从0开始，分别对应 `reference.json` 与该组 `candidates.json` 的 `items`。

误差图中，绿色为匹配参考，红色为漏检参考，橙色为未匹配预测；重复预测也算额外结果。图片坐标以原始3837×2737图像为准。

原始PNG未重复放入报告压缩包；它仍保存在原本地实验与云端管理员实验台。输入文件名和SHA-256见主报告。评分材料可以独立复核，推理复现则需使用同一原图、模型权重和依赖版本。

`incidents.json` 记录任务提交接口异常与恢复方式。推送启动分支仅增加GitHub工作流，不修改分割实现、后处理或依赖文件。
