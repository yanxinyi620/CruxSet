# CruxSet

CruxSet Phase 1 的线路管理核心。当前实现使用 TypeScript + Vitest，领域规则独立于微信页面和 CloudBase。

```bash
npm install
npm test
npm run build
```

默认脚点规则为 `feet_follow`；线路可按墙面、Layout、角度和难度筛选，按编号/名称搜索，并使用 `RandomSession` 进行当前结果集内的不重复随机训练。后续接入微信小程序时，页面通过 repository 使用这些 API；CloudBase 适配器可替换当前内存 repository。
