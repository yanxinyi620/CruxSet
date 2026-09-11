# 跨平台发布申请

保留实验台当前校准列表的发布按钮。创作者选择跨平台目标时确认提交申请，管理员直接发布仍可用。本地支持本地 Web、Cloudflare、小程序；云端支持 Cloudflare、小程序。直接发布当前站点归创作者；审核后的跨平台墙面归目标平台管理员（小程序沿用配置账户）。

在首页底部、实验台说明上方展示申请列表。创作者仅看自己的申请与状态；管理员看当前服务的全部申请，可查看申请时的墙面快照、通过并发布、拒绝。发布失败可重试，不把审核通过当作发布成功。拒绝可填写原因。

本地与云端独立存储申请，不依赖对方在线。保存独立不可变的图片及岩点快照，删除或修改原校准不影响审核。后端校验申请人身份、目标白名单、管理员审核权，阻止同校准同目标重复待处理申请。每份申请使用稳定发布标识保证重试幂等。状态为 pending / publishing / published / rejected / failed。

共享接口：GET /publish-requests 返回 {items,isAdmin}；POST /experiments/:eid/calibrations/:cid/publish-requests 接收 {target,wallName}；GET /publish-requests/:id/preview 返回授权的独立 HTML 预览，图片由 /publish-requests/:id/image 提供；POST /publish-requests/:id/approve 和 /reject（{reason}）仅管理员。列表字段 id, applicantId, wallName,target,status,createdAt,reason,error,result（可含 browseUrl/wallId）。时间为 Unix 秒。

GET /models 增加 isAdmin、publishTargets、requestTargets：本地 targets 为三种，非管理员 requestTargets 为 cloudbase/cloudflare；云端 targets 为 cloudflare/cloudbase，非管理员 requestTargets 为 cloudbase。原 /publish 仍拒绝创作者跨平台直发。
