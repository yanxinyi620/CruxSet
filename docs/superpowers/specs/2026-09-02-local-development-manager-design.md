# 本地开发服务管理脚本设计

## 目标

提供一个一键脚本，在后台启动、停止、重启和查询 CruxSet API、Vite Web 与分割实验台。它替代 README 中需要三个终端的本地开发流程。

## 命令接口

脚本为 scripts/cruxset-dev，支持：

    ./scripts/cruxset-dev start
    ./scripts/cruxset-dev stop
    ./scripts/cruxset-dev restart
    ./scripts/cruxset-dev status

## 后台管理

脚本将每个子进程的 PID 和标准输出/错误日志写入项目内未跟踪的 .runtime/cruxset-dev 目录。stop 和 restart 只根据这些 PID 文件停止脚本曾启动的进程，绝不按端口批量查杀。启动前会检查 8000、5173、8765 是否已被无关进程占用，并给出错误提示。

关闭启动脚本的终端不会影响已脱离终端的服务。PID 文件过期时，脚本会识别并清理它，不将失效 PID 误报为运行状态。

## 服务与环境

启动顺序为 API、Web、分割实验台。脚本将下列值固定在其子进程环境中：

    CRUXSET_SEGMENTATION_PUBLISH_KEY=local-only-long-random-secret
    CRUXSET_SEGMENTATION_PUBLISH_OWNER_ID=usr_web_lgjUPpx-3eu-s1_r

API 使用 SESSION_COOKIE_SECURE=false，监听 127.0.0.1:8000。Web 使用 npm run web -- --host 0.0.0.0，监听 5173。实验台使用 CRUXSET_BASE_URL=http://127.0.0.1:8000、CRUXSET_WEB_URL=http://127.0.0.1:5173、SEG_LAB_DATA_DIR=./data，监听 127.0.0.1:8765。

start 会等待各服务的端口或 HTTP 响应出现，若失败则停止本次已启动的服务并指出对应日志文件。status 显示每项服务的运行状态、PID、端口和日志文件位置，但不提供 logs 子命令。

## 文档与测试

README 将把该脚本作为本地开发的推荐入口，保留手动三终端命令作为故障排查参考。脚本测试覆盖参数解析、PID 过期处理、仅停止受管理 PID、端口冲突检测和默认环境变量传递。
