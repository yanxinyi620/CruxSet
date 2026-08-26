# CruxSet

CruxSet 是用于数字化真实攀岩墙的微信原生小程序。当前已建立小程序骨架、领域规则、几何变换与测试基础；完整需求见 [实施方案](docs/CruxSet-微信小程序完整开发实施方案-v1.0.md)。

```bash
npm install
npm test
npm run build
```

使用微信开发者工具打开仓库根目录即可读取 `project.config.json`。首次接入真实环境时，把 `project.config.json` 的测试 AppID 替换为项目 AppID，并配置 CloudBase 环境。

默认脚点规则为 `feet_follow`；线路可按墙面、Layout、角度和难度筛选，按编号/名称搜索，并使用 `RandomSession` 进行当前结果集内的不重复随机训练。后续接入微信小程序时，页面通过 repository 使用这些 API；CloudBase 适配器可替换当前内存 repository。
