# Proposal

## Why

「本会话到底能用哪些 MCP 服务器、哪些 skill」目前没有一处可查：MCP 服务器来自 profile 配置与各工作区 `.dsh/mcp/`（project-mcp），可见性还会被 `/tools off`（session-tool-toggle）与会话归属的工作区隔离改写；skill 来自项目 / 用户 / 绑定等多来源，且分「模型可调用」与「`/name` 可调用」两种能力。用户只能让模型自述（消耗 token、看不到已关闭项、结果不确定），或逐个翻插件面板。需要一个宿主侧直接求值、零模型消息的会话清单命令。

## What Changes

- `dsh-plugin-user-commands` 新增内置命令 `/inventory`（宿主侧直接求值）：一次输出「MCP 服务器段 + Skill 段」。结果只作为命令 UI 文本返回——不提交用户消息、不产生模型请求、不消耗 token。
- 内置命令模型扩展：命令来源联合新增宿主型内置（`origin.kind: 'host'` + invoke handler）；prompt 型内置 `/init` 与文件型命令的语义不变。
- MCP 段：按本会话作用域可见工具名 `mcp__<server>__<tool>` 归组，输出服务器名、各自工具数与总数，因此天然反映 session-tool-toggle 的关闭项与 project-mcp 的工作区隔离；无法归组的 `mcp__` 工具名单独计数，不丢弃。
- Skill 段：读 skill 注册表在会话 cwd 与该 agent 作用域下的目录，输出名称、截断后的描述、调用方式标记（模型可调用 / 仅 `/name`）与来源；两种调用策略都不可用的 skill 不计入。
- 软依赖降级：`tools` / `skills` / `workingDirectory` 一律经 `ctx.get` 读取，服务缺席或读取失败时只在对应段落给出可读说明，命令本身仍成功结算；`/inventory` 不接受参数，带参调用返回错误与用法且不提交任何内容。
- 插件定位与文档同步修订：user-commands 从「只做 prompt」修订为「prompt 型用户命令 + 宿主侧只读内置命令」；README、包描述与根 README/AGENTS 的插件描述同步。

## Capabilities

### New Capabilities

（无——本变更并入既有 `dsh-user-commands` 能力，不新开 catch-all 能力。）

### Modified Capabilities

- `dsh-user-commands`: 新增「内置 inventory 命令」需求——宿主侧直接求值、MCP 可见面归组、skill 目录读取与软依赖降级、不产生模型消息；既有「用户级/项目级同名文件遮蔽内置命令」规则继续适用于 `/inventory`。

## Impact

- **代码**：仅 `plugins/user-commands/`（`types.ts` 命令来源联合、`builtins.ts`、`registry.ts` 指纹、`invocation.ts` 防御分支、新增 `inventory.ts` 纯逻辑与 `inventory-command.ts` 命令实现、`index.ts` 接线、`test/` 扩充）。
- **依赖**：不新增运行时依赖；`tools` / `skills` / `workingDirectory` 为软依赖（`ctx.get`），不进入 `inject`，任何 profile（web / acp / headless）仍可单独安装。
- **产物**：`lib/index.js` 重建提交；无客户端半面变化，无双端契约变化。
- **兼容性**：纯增量（新增一条命令）；既有命令与文件格式行为不变；`/inventory` 可被用户级 / 项目级同名文件遮蔽，不占用插件保留名。
- **流程**：发布版本由用户决定（优先与在途变更 `session-tool-toggle-skill-workspace` 的 1.5.0 合并发布；若单独发布则版本顺延），本变更只负责实现、测试与文档。
