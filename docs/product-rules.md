# CruxSet Phase 1 业务规则

- 新建线路默认 `footRule = feet_follow`。
- `feet_follow`：Start、Hand、Assist、Finish 可手抓和脚踩；黄色 Foot 只能脚踩。
- `specified`：脚只能踩线路指定的黄色 Foot，至少需要一个 Foot。
- `all`：当前 Wall 所有允许踩的岩点均可作为脚点，通常不填写 `foot[]`。
- 线路至少需要一个 Start 和一个 Finish；每个 Hold 同时只能拥有一个显式线路角色。
- 难度使用 V0–V12；描述最多 500 字。
- 线路浏览的搜索、顺序和随机都只作用于当前 Wall + Angle + Grade 过滤结果。
- 同一随机会话一轮内不重复，耗尽后重新洗牌。

## Wall 生命周期

- 新建 Wall 默认私有，仅创建者或管理员可标注。
- Wall 首次发布后公开且永久锁定；需要修改岩点时必须创建新的私有 Wall。
- 公开且至少包含两个岩点的 Wall 可用于浏览和创建线路。
- “我的”用于查看 Wall 状态和删除管理；存在关联线路的 Wall 不可删除。
