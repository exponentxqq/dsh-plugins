# Proposal

## Why

`session-tool-toggle` 已能按会话关闭工具面（MCP 整组/单工具、内置工具、skill 整档），但用户仍有两项日常成本无法解决：一是本部署挂了 24 个 skill，skill 目录每条目随每一步请求重复计费，而现有能力只能**整档**关掉 `skill` 工具（一关就同时失去全部技能与 `/` 手动调用），无法只关掉当前任务用不到的单个 skill；二是逐会话手工关重复劳动明显，而配置只有「用户级默认档 + 会话级开关」两层，没有「这个项目/工作区默认关这些」的第三层。这两项恰好是插件 README 明列的两条非目标（「不做 per-skill 粒度」「不做工作区级默认档」），本变更是对它们的定向反转。

## What Changes

- **技能级开关（per-skill）**：新增 `skill:<name>` 地址类别（kebab-case，与 dsh 的 skill 名文法一致；裸 `skill` 与 `skill:*` 仍归一为整档 `tool:skill`）。语义 = **只让模型看不见/不可加载**该 skill：从模型技能目录移除、`skill` 工具调用被可读拒绝；**用户 `/name` 手动调用保留**（关闭项仍出现在 `/` 菜单，标注为仅限用户调用）。实现 = 在 agent 作用域注册同名 runtime skill（复制真实条目的正文/描述/路径，只把 `modelInvocable` 置 false），随会话状态 diff 注册/注销，注册后回读校验。
- **工作区级默认档（第三层配置）**：新增 `$DSH_HOME/session-tool-toggle/workspaces.json`（按工作区规范路径为键、与用户级默认档同款原子写与降级纪律）。会话创建时 `初始关闭集 = 用户档 ∪ 工作区档`（并集，工作区只能追加关闭、不能反开），**不追溯**已存在会话；`/tools reset` 回到这份合并快照。命令面新增 `/tools workspace status|off|on|reset|set`。
- **Web 配置界面扩展**：面板「技能」组从单个整档开关改为「整档开关 + 逐 skill 行」；新增「工作区默认档（本会话所属工作区）」分区与编辑入口；侧栏底部新增过渡入口（`sidebar.footer.action`，默认当前会话工作区、可下拉切换其他工作区）。上游工作区行 `...` 菜单入口**不在本变更范围**（基线 0.2.1-rc.5 无该座位；0.2.2-rc.1 起上游提供 `ctx.contextMenus` 的 workspace 目标贡献面，留待基线升至 0.2.2 后由后续变更接入）。
- **契约与降级**：Connection RPC 通道新增第 5 端点 `workspace`（请求支持 `{sessionId}` 与 `{workspacePath}` 两形态）、面板快照新增工作区视图与技能清单、新增失败码与提示码，两端 strict parser 同步；`skills` / `workspaceRegistry` / `workingDirectory` 一律软注入，缺席时功能降级并在面板与日志中可观测。
- **不保证回滚到不含本功能的旧版（1.4.0/1.5.0 均如此）**：旧版读到 `skill:` 条目与工作区档会按既有自校验丢弃（开关静默消失），README 与发布说明写明该代价。
- **上游零修改**：本仓不改、不 patch、不 vendor `@deepseek-ai/dsh*`；工作区行菜单入口缺失属上游能力边界，本变更只交付面板分区与侧栏底部入口。

## Capabilities

### New Capabilities

（无——两个能力都并入既有 `dsh-session-tool-toggle`，不新开 catch-all 能力）

### Modified Capabilities

- `dsh-session-tool-toggle`: 开关对象地址文法新增 `skill:<name>`；新增「技能级开关（仅模型可见性）」要求；用户级默认档要求扩展为「用户级 + 工作区级」双层默认档与播种合并语义；Web 配置界面要求扩展技能分组、工作区默认档分区与侧栏入口；状态持久化与保护名单要求不变。

## Impact

- **代码**：仅 `plugins/session-tool-toggle/`（宿主半新增技能遮蔽层与工作区档模块，client 半新增技能分组、工作区默认档分区与 footer 入口，`src/contract.ts` 双端契约，`test/` 扩充；预计触达面见 code-design.md）；无其他插件源码改动
- **文档**：插件 `README.md`（能力、预期管理、降级矩阵、非目标更新、回滚代价）、根 `README.md` 与 `AGENTS.md` 插件清单描述
- **依赖**：不新增运行时依赖（`zod` 已在；新服务全部软注入）；构建产物 `lib/` 随仓库重建提交
- **兼容性**：契约 additive 但双端 strict，升级后需重启 web profile（既有约束）；旧状态/默认档文件可读，旧版读新数据降级（回滚不保证）
- **基线**：DSH 基线 `0.2.1-rc.5`（`ee32d39` 已升级，`engines.dsh` 与 peer 派生自 `scripts/dsh-baseline.mjs`；勘误 2026-11-04 同步本文，落档时为 0.2.1-rc.2）；上游工作区行菜单座位在基线 0.2.1-rc.5 仍不存在（rc.2/rc.5/0.2.2-alpha.2 实测同），0.2.2-rc.1 已引入 `ctx.contextMenus` 的 workspace 目标贡献面，属后续变更的接入点
- **流程**：落档前已将旧变更 `session-tool-toggle` 归档并同步 `openspec/specs/dsh-session-tool-toggle/spec.md`（本变更的 MODIFIED 基准）
