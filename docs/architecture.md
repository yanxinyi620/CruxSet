# CruxSet Phase 1 架构

```text
微信原生小程序
  ├─ pages / components
  ├─ services / repository（数据访问适配与回退）
  └─ src/domain（框架无关业务规则）
          ↓
Repository / API abstraction
          ↓
CloudBase Database / Storage / Cloud Functions（真实验收适配器）
```

`src/domain` 不依赖微信 API，负责坐标、命中、手势、线路校验、筛选、随机和编辑状态，因此可以在 Vitest 中测试。页面与组件不得直接依赖 CloudBase，`miniprogram/services` 是当前 Repository/API 适配边界；未来可替换为 FastAPI。开发默认使用本地 Mock；准备真实验收时才切换至 CloudBase。

Cloud Functions 必须从当前登录身份重新查询 User、Admin、Wall 和 Layout。客户端传入的 `userId`、权限、编号和 Hold 数据都不能直接信任。线路编号通过 `counters/problem_number` 事务生成，业务外键只使用 `users.id`。

## 运行边界

- Phase 1：微信原生小程序、默认本地 Mock / CloudBase 验收适配器、Circle Hold。
- Phase 2：管理员 PC 本地 MobileSAM 标注器、Polygon Geometry。
- AI 不运行在小程序，也不参与 Phase 1 线路业务校验。
