# Web 线路详情统一实施计划

目标：按已认可设计统一两个 Web 的详情与返回行为。
架构：共享前端保留 route-browser 完整详情；旧地址仅负责解析与转入；URL 保存来源。
技术：TypeScript、Vite、Vitest。

- [x] 增加旧地址解析与来源返回的行为测试，运行确认失败。
- [x] 在 web/src/route-detail-navigation.ts 实现可测试的目标解析；main.ts 删除简版并接入我的线路按钮与来源恢复。
- [x] 验证缺失线路、刷新、公共筛选与我的线路返回，运行完整测试、类型检查、两种构建。
