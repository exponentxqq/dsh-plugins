# 仓库文档索引

本页是仓级文档索引：只给链接与一句话定位，正文一律留在被链文档内。

## 仓库入口

- [`README.md`](../README.md) —— 仓库说明：安装、构建授权、常用命令与七个插件一览。
- [`AGENTS.md`](../AGENTS.md) —— 仓库约定：目录结构、插件结构约定、DSH 基线、开发与验证命令、发布流程。

## 文档区（`docs/`）

- [`docs/assessments/README.md`](./assessments/README.md) —— 评估档案（非 ADR）索引：现状差异与「暂不施工」依据。
- [`docs/decisions/README.md`](./decisions/README.md) —— 仓级 ADR 索引，含两套编号的引用纪律。

## 规范工作区（`openspec/`）

- [`openspec/specs/`](../openspec/specs/) —— 插件业务规格：能力规格的唯一真源。
- [`openspec/changes/`](../openspec/changes/) —— 变更工件：进行中的提案 / 设计 / 任务，以及已归档变更。

## 插件（`plugins/`）

- [`dsh-plugin-multi-root-workspace`](../plugins/multi-root-workspace/README.md) —— 双端：主根 + N 个附加根的沙箱作用域扩展。
- [`dsh-plugin-workspace-config`](../plugins/workspace-config/README.md) —— 双端：工作区配置的统一入口（分节弹窗 holder）。
- [`dsh-plugin-web-ux`](../plugins/web-ux/README.md) —— 双端：Web 界面体验（提供商徽章 / 会话管理 / 通知卡）。
- [`dsh-plugin-session-tool-toggle`](../plugins/session-tool-toggle/README.md) —— 双端：会话级工具面开关（命令面与 Web 面板）。
- [`dsh-plugin-project-mcp`](../plugins/project-mcp/README.md) —— host-only：项目级 MCP 服务器的发现与按工作区隔离。
- [`dsh-plugin-user-commands`](../plugins/user-commands/README.md) —— host-only：markdown 定义的用户斜杠命令。
- [`dsh-plugin-zcode-plan`](../plugins/zcode-plan/README.md) —— host-only：bigmodel GLM Coding Plan 的 ZCode 折扣凭证桥接。

## 证据与产物（`artifacts/`）

- [`plugins/web-ux/artifacts/`](../plugins/web-ux/artifacts/) —— 冒烟证据归档：命令反馈与会话管理。
- [`plugins/workspace-config/artifacts/`](../plugins/workspace-config/artifacts/) —— 冒烟证据归档：工作区配置。
- [`plugins/project-mcp/artifacts/`](../plugins/project-mcp/artifacts/) —— 冒烟证据归档：名字与资源面隔离三面冒烟。
- [`plugins/user-commands/artifacts/`](../plugins/user-commands/artifacts/) —— 真机验证证据归档：两轮探针与线上宿主复核。
- [`plugins/zcode-plan/artifacts/`](../plugins/zcode-plan/artifacts/) —— 证据归档：验收记录、折扣验证与路由真机重放。
