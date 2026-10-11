# Proposal

## Why

dsh 的斜杠命令全部由插件硬编码注册（plan / goal / compact / feedback / export / permission* / mcp-reload / workspace-folders），用户没有一处能放自己的命令：想固化「按我们的流程 review」「生成周报」这类常用 prompt，只能每次手打或存在别处。同时新仓库的 `AGENTS.md` 项目指引（DSH 原生逐会话加载）每次都要口头描述怎么写——opencode / Claude Code 的 `/init` 是公认解法，DSH 缺等价物（已核实宿主无 `init` 命令撞名）。

## What Changes

新增独立插件 `dsh-plugin-user-commands`（目录 `plugins/user-commands/`，host 单面、无客户端），提供用户自定义斜杠命令：

- **三层来源与遮蔽**：用户级 `$DSH_HOME/commands/`（缺省 `~/.dsh/commands`，全局可用）；项目级 `<工作区根>/.dsh/commands/`（主根 + 附加根，按会话归属生效）；插件内置（首个即 `/init`）。项目级遮蔽用户级、用户级遮蔽内置。
- **纯 prompt 型**：`.md` 文件正文即 prompt 模板，`$ARGUMENTS` 占位符替换后作为用户消息提交给当前会话（`/plan` 同款 `agent.steer(createUserMessage(...))` 通道，空闲会话也开启轮次）。
- **会话级隔离**：项目命令在 agent 创建时挂到该会话自己的上下文注册（官方 agent 级遮蔽机制），多工作区同名命令互不串扰；归属判定失败 fail-closed 只剩全局层。
- **热刷新**：命令目录阶梯监听 + 防抖 + 声明式全量重同步；`/commands-reload` 兜底（反馈计数）。
- **内置 `/init`**：分析当前仓库并在主根创建或合并更新 `AGENTS.md`——简体中文、≤80 行、只写查证过的事实、不推倒重写。

## Capabilities

### New Capabilities

- `dsh-user-commands`: 用户自定义斜杠命令——三层来源与发现范围、文件格式与命名文法、`$ARGUMENTS` 展开、三层优先级与会话遮蔽、调用语义、同层冲突仲裁、热刷新与手动重载、内置 `/init`、无命令服务降级。

### Modified Capabilities

（无——不改动现有任何能力。）

## Impact

- **新增代码**：`plugins/user-commands/`（host 单面：discovery / builtins / invocation / agent-layer / attribution / watcher + 约 22 例单测）。
- **运行时依赖**：`yaml` 打包进 bundle（frontmatter 解析）；`@deepseek-ai/dsh-llm` 的 `createUserMessage` 构建期外部化（与宿主版本一致）。
- **软依赖**：`commands` 服务缺席的部署（acp / headless 无命令适配器）中插件零注册、零报错、无副作用。
- **安装目标**：本轮 profile `web`；版本随仓库统一 tag 发布。
