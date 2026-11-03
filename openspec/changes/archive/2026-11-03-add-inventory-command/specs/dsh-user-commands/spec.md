# Spec Delta

## ADDED Requirements

### Requirement: 内置 inventory 命令

插件 SHALL 内置命令 `/inventory`（与 `/init` 同为内置命令，可被用户级或项目级同名文件遮蔽，不占用插件保留名），列出**本会话实际可用**的 MCP 服务器与 skill。该命令 MUST 在宿主侧直接求值并只返回命令 UI 文本：MUST NOT 提交用户消息、MUST NOT 产生模型请求、MUST NOT 消耗 token。命令 MUST NOT 接受参数；带参调用 MUST 返回错误结果与用法说明，且 MUST NOT 提交任何内容。

#### Scenario: 一次输出两段清单

- **WHEN** 会话可见 3 台 MCP 服务器（共 24 个工具）且有 24 个可用 skill，用户执行 `/inventory`
- **THEN** 返回成功文本：MCP 段列出服务器与工具计数，Skill 段列出 skill 条目；会话未收到任何用户消息，也未开启模型轮次

#### Scenario: 用户级同名命令遮蔽

- **WHEN** 用户级 `$DSH_HOME/commands/inventory.md` 存在
- **THEN** `/inventory` 执行该文件的 prompt 定义，内置清单命令不生效（与 `/init` 同一遮蔽规则）

#### Scenario: 带参数调用

- **WHEN** 用户执行 `/inventory foo`
- **THEN** 返回错误结果与用法说明，且不提交任何用户消息

### Requirement: inventory 的 MCP 可见面

`/inventory` 的 MCP 段 SHALL 从收到命令的那个 agent 作用域的可见工具面取工具名，按 `mcp__<server>__<tool>` 前缀归组，输出服务器名、各自工具数与总数。可见面 MUST 是会话级关闭（session-tool-toggle）与工作区隔离（project-mcp）生效之后的真实结果：对被关闭或被隔离的服务器，MUST NOT 将其计为可用。以 `mcp__` 开头但无法按前缀还原服务器名的工具名 MUST 单独计数并如实标注，MUST NOT 丢弃。服务器 SHALL 按名称升序输出。

#### Scenario: 反映会话级关闭

- **WHEN** 用户已执行 `/tools off mcp:yunxiao`（yunxiao 全部工具对模型不可见）后执行 `/inventory`
- **THEN** MCP 段不出现 yunxiao，其余可见服务器照常列出，总数只计可见工具

#### Scenario: 无法归组的工具名

- **WHEN** 某 MCP 工具公开名因归一化或截断而无法还原服务器名
- **THEN** 该工具计入「未归组」计数并输出提示，不使命令失败、不静默丢弃

### Requirement: inventory 的 skill 目录

`/inventory` 的 Skill 段 SHALL 读取 skill 注册表在该会话工作目录与 agent 作用域下的目录，对每个 `modelInvocable` 或 `userInvocable` 为 true 的 skill 输出：名称、描述（超长可截断）、调用方式标记（模型可调用 / 仅 `/name` / 仅模型）与来源。两者皆为 false 的 skill MUST NOT 计入。skill SHALL 按名称升序输出。

#### Scenario: 调用方式标记

- **WHEN** 会话内有 20 个模型与 `/name` 均可调用的 skill、1 个仅模型可调用、1 个仅 `/name` 可调用、1 个两者皆不可用
- **THEN** Skill 段列出前三个共 22 条并各带正确标记，两者皆不可用的那条不出现

#### Scenario: 无可用 skill

- **WHEN** 会话内没有任何可用 skill
- **THEN** Skill 段输出「无可用 skill」的说明，命令照常成功

### Requirement: inventory 的软依赖降级

`/inventory` MUST 经 `ctx.get` 读取 `tools`、`skills`、`workingDirectory` 三个服务而不是硬注入。任一服务缺席或读取抛错时，该段落 SHALL 输出可读的降级说明，命令本身仍成功结算，MUST NOT 使命令失败。skill 目录观测不完整（`complete === false`）时，Skill 段 SHALL 标注列表可能缺项，已收集到的条目照常输出。会话工作目录无法解析时 SHALL 标注项目级 skill 可能缺失。

#### Scenario: skills 服务缺席

- **WHEN** 部署未提供 `skills` 服务，用户执行 `/inventory`
- **THEN** 返回成功文本：MCP 段照常输出，Skill 段给出「未提供 skills 服务」说明，不抛错

#### Scenario: 读取抛错

- **WHEN** 读取可见工具面抛错
- **THEN** 命令仍成功结算，MCP 段给出读取失败说明，Skill 段照常输出，错误写入插件诊断日志

#### Scenario: 目录观测不完整

- **WHEN** skill 快照的 `complete` 为 false
- **THEN** Skill 段标注「观测不完整，列表可能缺项」，已收集到的 skill 照常列出
