# CruxSet Phase 1 业务规则

- 新建线路默认 `footRule = feet_follow`。
- `feet_follow`：Start、Hand、Assist、Finish 可手抓和脚踩；黄色 Foot 只能脚踩。
- `specified`：脚只能踩线路指定的黄色 Foot，至少需要一个 Foot。
- `all`：当前 Layout 所有允许踩的岩点均可作为脚点，通常不填写 `foot[]`。
- 线路至少需要一个 Start 和一个 Finish；每个 Hold 同时只能拥有一个显式线路角色。
- 难度使用 V0–V12；描述最多 500 字。
- 线路浏览的搜索、顺序和随机都只作用于当前 Wall + Layout + Angle + Grade 过滤结果。
- 同一随机会话一轮内不重复，耗尽后重新洗牌。
