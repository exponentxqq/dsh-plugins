# Spec Delta

## Purpose

会话级工具面开关能力：让每个 DSH 会话能独立关闭不需要的模型可见工具（MCP 服务器整组/单工具、内置工具、skill 整档），即时降低每步请求的工具 schema 与指令段 token 成本，且开关状态随会话日志持久并在 fork/resume 时保持。

## ADDED Requirements

### Requirement: 会话级开关语义

插件 SHALL 在每个会话（agent）上独立维护一组关闭集（组地址列表），关闭的对象在该会话后续每次模型步骤中不可见（schema 被掩蔽）且被调用时拒绝（守卫返回可读理由）；开关变更 SHALL 在下一次模型步骤生效。开关 SHALL 只影响本会话的作用域，不影响同 profile 的其他会话。与其他掩码机制（如 project-mcp 的工作区隔离）SHALL 取交集组合：被其他机制隔离掉的工具，本能力 SHALL NOT 使其重新可见。

#### Scenario: 会话内关闭 MCP 服务器组

- **WHEN** 用户在会话 A 中执行 `/tools off mcp:yunxiao`，且下一步模型步骤发生
- **THEN** 该会话可见工具计数减少 yunxiao 全部工具数（实测基线 70），渲染后的系统提示词不含 `### MCP server: yunxiao` 指令段；同 profile 的会话 B 可见工具面不变

#### Scenario: 被关闭工具的迟到调用被拒绝

- **WHEN** 会话历史中含有对某已关工具的调用记录，且模型在关闭后再次调用该工具名
- **THEN** 调用被守卫拒绝并返回包含工具名与关闭原因的可读错误，会话不崩溃

#### Scenario: 开关不越界工作区隔离

- **WHEN** 某工具已被 project-mcp 按工作区归属隔离（对当前会话不可见），且用户执行 `/tools on` 尝试恢复其所属服务器
- **THEN** 该工具对当前会话仍不可见（交集语义），命令回执如实反映

### Requirement: 开关对象粒度与地址文法

开关对象 SHALL 支持三类组地址：`mcp:<server>`（整组：该服务器全部工具 schema 与其指令段一并移除）、`mcp:<server>::<tool 或尾部 * 通配>`（单工具：仅移除匹配的 schema，指令段保留）、`tool:<name>`（内置工具；`skill` SHALL 归一为 `tool:skill`，关闭后 skill 目录消息一并停发）。掩码名单 SHALL 只从活注册表推导（服务器未加载/已断线时保持意图、跳过执行、不抛错）。

#### Scenario: 单工具通配关闭

- **WHEN** 用户执行 `/tools off "mcp:yunxiao::list_*"` 且该前缀匹配当前注册表中 yunxiao 的 3 个工具
- **THEN** 恰好这 3 个工具的 schema 被移除，yunxiao 其余工具与指令段保持可见

#### Scenario: 指向未加载服务器的开关被容忍

- **WHEN** 关闭集中含有 `mcp:<server>`，且该服务器此刻不在注册表（未连接或已断线）
- **THEN** 不抛错；服务器后续上线时其工具面按关闭集被掩蔽（意图保持）

#### Scenario: skill 整档关闭

- **WHEN** 用户执行 `/tools off skill`
- **THEN** `skill` 工具不可见且 skill 目录消息停发（按 dsh-tool-skill 既有语义追加空目录停用旧名称）；执行 `/tools on skill` 后目录恢复发布

### Requirement: 内置工具开关与保护名单

`tool:<name>` 地址 SHALL 适用于内置工具，但存在硬保护名单（自救与文件操作基础工具，基线：bash/read/edit/write/glob/grep，只可追加不可移除），名单内工具 SHALL 拒绝关闭并返回保护理由；名单外内置工具（如任务板、便签、日程、团队任务等大 schema 系列）SHALL 可关闭。

#### Scenario: 保护名单拒关

- **WHEN** 用户执行 `/tools off tool:bash`
- **THEN** 命令返回保护名单拒绝理由，bash 保持可见可调用

#### Scenario: 关闭大 schema 内置工具系列

- **WHEN** 用户执行 `/tools off tool:task_board_create ...`（名单外内置工具）
- **THEN** 对应工具 schema 从本会话移除，守卫拒绝后续调用

### Requirement: 用户级默认档

插件 SHALL 提供用户级默认档文件（`$DSH_HOME/session-tool-toggle/defaults.json`，内容为组地址数组），`/tools default` 子命令 SHALL 支持查看与增删（写入原子替换，损坏文件降级为空档并告警）。新会话（含子代理与队友会话）创建时 SHALL 对默认档拍快照作为初始关闭集；默认档后续变更 SHALL NOT 追溯已存在会话。主会话的会话级开关 SHALL NOT 传播给其派生的子代理/队友（各会话独立快照）。

#### Scenario: 新会话按默认档初始化

- **WHEN** 默认档含 `["mcp:yunxiao", "mcp:figma"]`，且用户创建新会话
- **THEN** 新会话首步装配前 yunxiao 与 figma 已被掩蔽（无中途 KV 缓存重建），`/tools status` 显示快照来源为默认档

#### Scenario: 默认档变更不追溯

- **WHEN** 会话 A 已按旧默认档创建，用户随后通过 `/tools default off` 修改默认档
- **THEN** 会话 A 的关闭集不变；仅之后创建的会话采用新默认档

#### Scenario: 子代理拍默认档快照但不继承会话开关

- **WHEN** 主会话已额外关闭 `mcp:dbx`（会话级），且派生一个子代理
- **THEN** 子代理按默认档拍快照（不含 dbx 的会话级关闭），dbx 对子代理可见

### Requirement: 状态持久化与 fork/resume

开关状态变更 SHALL 以整值事件持久化（当前完整关闭集，而非增量），会话 resume 后状态 SHALL 保持，fork 的新会话 SHALL 继承 fork 点关闭集（此后各会话独立演化）。持久化通道 SHALL 具备可切换的第二实现（自有存储域）与内存态降级：主通道（会话日志插件记录）不可用时 SHALL 自动降级且功能不缺失（仅丢失 resume 保持），降级事实 SHALL 在命令回执或日志中可观测。

#### Scenario: resume 保持开关状态

- **WHEN** 会话关闭 yunxiao 后退出，随后 resume 该会话
- **THEN** yunxiao 对该会话保持关闭，`/tools status` 显示同一关闭集

#### Scenario: fork 继承 fork 点状态

- **WHEN** 会话 A（关闭集含 yunxiao）fork 出会话 B，随后 A 又关闭 figma
- **THEN** 会话 B 的关闭集保持 fork 点状态（含 yunxiao、不含 figma），两会话各自独立演化

#### Scenario: 持久化降级可观测

- **WHEN** 会话日志插件记录通道写入失败（身份断言失败或写入抛错）
- **THEN** 开关在本会话内继续生效（内存态），命令回执或日志明示「本会话状态不会跨 resume 保持」
