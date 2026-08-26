# CloudBase 云函数

这些目录是 Phase 1D 的入口骨架，部署前需在微信开发者工具中为每个函数安装依赖并配置 CloudBase 环境。

- `login`：OPENID → `users.id`
- `saveProblem`：服务端校验并生成线路编号
- `deleteProblem`：创建者或管理员删除线路
- `adminLayout`：管理员管理 Wall/Layout

云函数必须从数据库重新读取 Wall、Layout、User 和 Admin，不能信任客户端传入的权限或 Hold 数据。
