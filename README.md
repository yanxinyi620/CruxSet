# CruxSet

CruxSet 将真实攀岩墙数字化，提供三种独立运行形态。

```text
微信小程序：wechat/miniprogram → CloudBase 云函数 → CloudBase DB + 私有 Storage
本地 Web：web（Vite）          → FastAPI           → SQLite + 本地媒体
Cloudflare Web：web/dist       → Workers           → D1 + R2（MEDIA 配置）
```

## 当前三种运行形态

| 形态 | 入口与存储 | 可用功能 |
| --- | --- | --- |
| 微信小程序 CloudBase | `wechat/miniprogram` + 云函数；CloudBase DB 与私有 Storage | 浏览公开墙面；创建、编辑、删除自己的线路；管理员管理墙面。 |
| 本地 Web | `web`（Vite）+ FastAPI；SQLite 与本地媒体 | 管理员完整墙面创作、岩点标注、发布、线路管理，以及按用户授权和隔离数据的本机分割实验台。 |
| Cloudflare Web | 相同的 `web/dist` + Workers；D1 与配置为 `MEDIA` 的 R2 | 注册、登录、资料和线路写入；具备 `MEDIA` 的管理员可上传、创作、标注、发布，并删除自己的墙面。浏览器端不运行 AI 任务。 |

三套存储系统各自独立，不会自动同步；只共享 Wall、Hold、Problem 的字段语义。

- [微信小程序 CloudBase](docs/miniprogram-cloudbase.md)：部署、启动与真机验收。
- [本地 Web 工作台](docs/local-web.md)：启动、创作、分割实验台与 Tunnel。
- [Cloudflare Web](docs/cloudflare-edge-deployment.md)：Workers、D1、R2 与线上部署。

通用规则见 [设计参考](docs/reference.md)，完整检查见 [测试与验收](docs/testing.md)。
