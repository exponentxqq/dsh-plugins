# Proposal

## Why

侧栏 footer 的 `sidebar.footer.action` 座位是 shell 拥有的单行 nowrap flex（宽栏 256px / 折叠轨 56px），当前三个插件（multi-root-workspace Folders 整行、session-tool-toggle 残条、web-ux Session manager 被裁切不可见）各自注册入口，组合级冲突导致座位饱和（R5 裁定：按现状接受，统一入口时一并解决）。本变更把三个入口收敛为一枚「工作区配置」入口 + 统一分节弹窗，终结座位竞争并给后续分节（如工具管理）提供可扩展落点。

## What Changes

- **新增轻量插件 `dsh-plugin-workspace-config`**（holder，零业务逻辑）：footer 单入口（宽栏图标+文案、折叠轨 28px 图标，行内收缩份额、禁 `flex:none` 整行独占）+ 统一模态弹窗（`shell.overlay` order 530）+ 分节座位声明（`workspace-config.section`，单 list 座位 + `id/order/label` 注册 options + `only` 过滤渲染——官方 `settings.section` 同构）+ 打开桥与空态。
- **三插件迁移为分节贡献方**（`slots.inject` 软注册，零运行时依赖 holder）：Folders（mrfw，order 10）、工作区默认档（stt，order 20，`WorkspaceDefaultsEditor` dialog 形态保留工作区下拉）、会话管理（web-ux，order 30，五阶段机整体内联、节内不开第二层 Modal）。
- **BREAKING（安装矩阵语义）**：三个旧 footer 入口**硬移除**；未装 holder 时 mrfw 走 Files tab 入口与 `/workspace-folders`、stt 走会话头部入口与 `/tools`，web-ux 会话管理 GUI 不可达——**推荐四包同一 tag 同装**，不做动态切换/共存探测/配置开关。
- **类型共享**：三插件 devDependency（`workspace:*`，仅类型用途）引 holder 导出的座位契约（`import type`，不入 `dsh.client.inject`）；stt/web-ux 顺带收敛不再使用的 `@deepseek-ai/dsh-client-ui-sidebar` 依赖。
- **验收面**：仅桌面布局（宽栏 256px / 折叠轨 56px）；窄屏/移动布局下 `dsh-pocket` 的 footer 注册记为已知事实，不在本变更范围。
- **发布**：先合入不打 tag（用户继续 link: 使用），版本号与 tag 留待下一批变更统一发布。

## Capabilities

### New Capabilities

- `dsh-workspace-config-entry`: 统一工作区配置入口能力——footer 单入口可见性（双形态）、分节弹窗（导航 + 懒渲染）、分节贡献机制（座位契约与软注册）、降级行为（未装贡献方节隐藏 / 未装 holder 旧功能路径保留）。

### Modified Capabilities

- `dsh-session-tool-toggle`: 「Web 配置面板」与「工作区级默认档入口」两条需求中的侧栏入口表述变化——`sidebar.footer.action` 注册迁至 `workspace-config.section` 分节，会话头部入口与 `/tools` 命令面共用状态不变。
- `dsh-web-ux-session-manager`: 「全局会话管理入口」需求变化——入口从侧栏底部动作区迁至统一工作区配置弹窗的会话管理分节，五阶段机与三 tab 交互不变。

## Impact

- **触达代码**：新建 `plugins/workspace-config/`（21 个文件）；`plugins/multi-root-workspace/`（客户端注册迁移 + 剥壳 + fork 文档/ADR/docs:check 硬门）；`plugins/session-tool-toggle/`（注册迁移 + 编辑器分节接线 + 依赖收敛）；`plugins/web-ux/`（五阶段机剥壳内联 + 删 trigger/store + 依赖收敛）；根 `pnpm-lock.yaml` 与 `README.md`。逐文件清单见 `code-design.md` ① 触达面（58 项）。
- **不触达**：三插件宿主半与 RPC 通道端点（`/web-ux` 七端点、`/session-tool-toggle` 四端点、`/multi-root-workspace`）、落盘格式（`workspaces.json`/`defaults.json`）、上游任何包、`scripts/*` 与 `pnpm-workspace.yaml`（动态枚举已覆盖）。
- **依赖面**：三插件 devDependencies `+ dsh-plugin-workspace-config: workspace:*`（git 安装探针已证不进 profile）；stt/web-ux `− @deepseek-ai/dsh-client-ui-sidebar`。
- **验收与风险**：真机 GUI 双形态 + a11y 树走查（token 链接取自 `docker logs dsh`）；slots `children`/`only` 运行时行为以 jsdom PoC 为前置风险门（类型面已实证）；分节切换卸载上一节（stt 草稿丢弃为接受项）；`Menu` portal 在新壳内需复验（保留 `WORKSPACE_MENU_PORTAL` 单点开关兜底）。
