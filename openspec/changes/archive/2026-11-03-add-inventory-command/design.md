# Design

## Context

`dsh-plugin-user-commands` 当前是**纯 prompt 型**命令插件：命令执行 = 读文件或内置 prompt 常量 → 展开 `$ARGUMENTS` → `agent.steer(createUserMessage(...))` 提交一条用户消息。内置命令只有 `/init`，形状固定为 `origin.kind: 'builtin'` + prompt 常量。全局层（用户级 + 内置）在 `ctx.inject(['commands'])` 到位时注册，用户级/项目级同名文件遮蔽内置。

本变更要加一条**宿主侧直接求值**的只读清单命令，因此需要在不改变 prompt 型语义的前提下，给「命令来源」增加第三种形态，并把「读会话可见工具面 / 读 skill 目录 / 解析 cwd」做成可单测的窄端口。

DSH 0.2.1-rc.2 的相关事实（已在 `@deepseek-ai/dsh*` 源码核实）：

- `ctx.tools.schemas(scopeKey?)`：返回该 scope 视角下**模型可见**的工具 schema（含 `name`）；`scopeKey` 直接用 agent 对象，`dsh-project-mcp` 的隔离读数即此用法。会话级 `restrict` 掩码与工作区隔离后的可见面就是它。
- `ctx.skills.snapshot({ cwd, scope, signal })` → `{ skills: SkillSummary[], complete: boolean }`；`SkillSummary` 带 `name` / `description` / `invocation: { modelInvocable, userInvocable }` / `source`。`dsh-tool-skill` 的会话目录即用此读法。
- `ctx.workingDirectory.get(session)`：同步、无 I/O 地返回会话当前目录；`session.header.cwd` 是创建目录（可选）。
- `ctx.get(name, strict?)`：**无需 inject 声明**地读取服务，服务未激活时返回 `undefined`——这是本插件既有的软依赖读法（工作区 registry 同款）。
- 命令 handler 的返回值是**仅 UI 文本**：不进入模型请求、不消耗 token（`dsh-commands` 契约）。

## Goals / Non-Goals

**Goals:**

- 一条 `/inventory` 命令，宿主侧确定性输出两段：本会话**实际可见**的 MCP 服务器（名 + 工具数 + 总数）与**可用** skill（名 + 截断描述 + 调用方式 + 来源）。
- 结果只走命令 UI 通道：不提交用户消息、不开启模型轮次、零 token。
- 软依赖（tools / skills / workingDirectory）缺席或单段失败时仍成功结算，段内给出可读降级说明。
- 业务规则（归组、渲染、降级判定）全部落在纯函数/窄端口上，单测不依赖宿主。

**Non-Goals:**

- 不列被关闭、被隔离、连接失败或仅存在于配置中的服务器——本命令口径是「本会话此刻实际可用」，不是配置台账。
- 不列 MCP 资源工具与 resource-only 服务器（`dsh-mcp-resources` 无公开列举 API，且无工具的服务器不属于可用面）。
- 不做子命令、参数过滤、缓存、排序选项；不做 Web UI / RPC / 客户端半面。
- 不改 `tools` / `skills` / `workingDirectory` 服务的对外行为，不 patch 上游。
- 不改 prompt 型命令（文件型与 `/init`）的任何语义。

## Decisions

### D1 用第三种命令来源承载宿主型内置命令

`CommandOrigin` 增加 `{ kind: 'host'; invoke: HostCommandInvoke }`，与 `'file'` / `'builtin'`（prompt 常量）并列：

- `registrarFor` 的 handler 先按 `origin.kind` 分流：`'host'` 直接 `await invoke(invocation)`，其余走既有 `invokeCommand`（prompt 展开 + steer）。
- `invocation.ts` 增加防御分支：host 来源被误放进 prompt 展开路径时抛错（编程错误暴露，而不是静默提交空 prompt）。
- `registry.ts` 的指纹从「file 用路径、其余一律 `'builtin'`」改为「`'builtin'` / `'host'` 各自成串」，避免未来新增宿主命令时误判为变化而反复重注册。
- `types.ts` 保持「只声明类型、零 import」的文件不变量：`HostCommandInvocation` 用窄结构（`agent: object`、`rawInput`、`signal`），`HostCommandResult` 与 `dsh-commands` 的 `CommandResult` 同形。

**替代方案**：(a) 把 `/inventory` 做成 prompt 型内置——需要模型参与、有 token 成本且读不到真实注册表状态，否；(b) 新建独立插件——用户明确选择扩展现有插件，命令面归属本插件，改造最小；(c) 在 `RegisteredCommand` 上加可选 `handler` 字段——同样可行，但把「来源」与「求值方式」拆成两处，指纹与分流都更容易写错，否。

### D2 数据读取一律经 `ctx.get` 软依赖

命令 handler 在**每次执行时**用 `ctx.get('tools')` / `ctx.get('skills')` / `ctx.get('workingDirectory')` 现取服务，不缓存引用：

- 服务未激活 → `undefined`，段内输出「未提供 X 服务」；服务读取抛错 → 段内输出失败说明并写 `ctx.logger`，命令仍成功。
- 与声明 `inject` 相比：本插件对 acp / headless / 最小组合的「零注册、零报错」承诺不能破（skills 服务在最小组合里可能缺席）。
- 与在 handler 内 `ctx.inject` 相比：不产生每次调用的子 fiber，也不存在「服务晚到时注册丢失」的时序问题。

**会话作用域读法**：`tools.schemas(agent)` 与 `skills.snapshot({ scope: agent })` 都把 agent 对象直接当 scope key（与 `dsh-tool-skill`、`dsh-project-mcp` 一致），不需要从 agent 上下文里注入服务。

**cwd 解析**：`workingDirectory.get(session)`（同步、无 I/O）→ 抛错/缺席时回退 `session.header.cwd` → 仍缺失则 `undefined` 并在 Skill 段标注「项目级 skill 可能缺失」。不引入 `ensure()`（它做文件系统检查与提交，命令只读）。

### D3 MCP 归组口径：可见工具名的前缀解析

- 取数：`tools.schemas(agent).map(s => s.name)`，**只**用这一份读数。它已叠加会话级 `restrict`（session-tool-toggle）与工作区隔离（project-mcp），因此天然满足「实际可用」口径。
- 过滤：只认 `mcp__` 前缀；非 MCP 工具（内置工具、`list_mcp_resources` 等资源工具）一律忽略。
- 归组：`^mcp__([A-Za-z0-9_-]+?)__(.+)$`，惰性匹配取**第一个** `__` 作为服务器名边界，可容纳 serverName 里的单个 `_`（如 `my_server`）。
- 不匹配的 `mcp__` 名（`mcp-client` 在公开名归一化或 64 字符截断时会追加哈希、可能吃掉 `__` 边界）进入「未归组」计数，如实输出，不猜测服务器名、不丢弃。
- 输出：服务器名升序 + 各自工具数 + 总数；工具名本身不输出（保持扫描性，且用户要的是「哪些服务器可用」）。

**替代方案**：(a) 读 profile 配置与各工作区 `.dsh/mcp/` 枚举——只能得到「配置了什么」，不是「此刻可用什么」，且要跨插件读配置，否；(b) 只用全局层 `schemas()`——内置工具在 agent 平面（project-mcp 实测 global=9 / scoped=35），会漏掉项目 MCP 与部分内置，否；(c) 从 `mcpResources` 列举——无公开列举 API，否。

**已知限制**：serverName 合法字符包含 `_`，理论上 `a__b` 与 `a`+`__b…` 的归组有歧义；公开名本身已是 `mcp-client` 的有损投影，本命令不试图反推，接受该限制并在模块注释与 README 注明。

### D4 Skill 口径：snapshot + 调用策略过滤

- 取数：`skills.snapshot({ cwd, scope: agent, signal })`（`complete` 用于降级标注）。
- 过滤：保留 `modelInvocable || userInvocable` 为 true 的条目——两种调用方式都能让本会话「用上」该 skill（模型经 `skill` 工具 / 用户经 `/name` 手势）；两者皆 false 的条目不算可用。
- 输出：名称、描述（空白折叠后截断到 `SKILL_DESCRIPTION_MAX_LENGTH = 60` 个字符，超长补 `…`）、调用方式标记（`模型+/name` / `仅模型` / `仅 /name`）、来源短标签（`project-dsh`→项目、`project-agents`→项目(agents)、`custom`→自定义、`user-dsh`→用户、`user-agents`→用户(agents)、`bundled`→内置、`runtime`→运行时、未知值原样）。
- 排序：名称升序（注册表本身有序，这里显式排序保证确定性）。

**替代方案**：只用 `skills.list()` 读目录——缺 `complete` 标记就无法如实标注「观测不完整」，否；只列模型可调用项——会漏掉 `disable-model-invocation` 但仍可用 `/name` 的 skill，否。

### D5 输出格式：简体中文多行纯文本，固定两段

```
会话清单（cwd：/home/xuqinqin/develop/person/dsh-plugins）

MCP 服务器（3 台，共 24 个工具）
- chrome-devtools-mcp：12 个工具
- codebase-memory：8 个工具
- dbx：4 个工具

Skill（24 个）
- analyzing-elastic-logs — 分析 Elastic 日志…（模型+/name，用户(agents)）
```

- 段顺序固定 MCP → Skill；段内升序；行首 `- `、分隔用全角冒号/破折号，纯文本不依赖 Markdown 渲染。
- 空态/降级文案：`本会话当前没有可见的 MCP 工具`、`当前部署未提供 tools 服务，无法读取`、`读取可见工具面失败：<原因>`、`无可用 skill`、`未提供 skills 服务，无法读取`、`观测不完整，列表可能缺项`、`未能解析会话工作目录，项目级 skill 可能缺失`。
- 命令结果不进模型请求，故不设 token 长度预算；仍以只读、确定性、可扫描为限。

### D6 错误边界与取消

- handler 除「取消」外**不抛错**：每段独立 `try/catch`，失败只降级 + `log.error`——诊断命令不该因为一个服务抖动整体失败。
- `invocation.signal.aborted` 时返回 `{ kind: 'error', text: '/inventory 已取消' }`；`signal` 继续传给 `skills.snapshot`。
- 带参（`rawInput.trim() !== ''`）→ `{ kind: 'error', text: '用法：/inventory（不接受参数）' }`，不读任何服务、不提交任何内容。

### D7 可测性与接线分层

- `src/host/inventory.ts`：**纯函数**——`groupMcpTools(names)`（归组 + 排序 + 未归组计数）与 `renderInventory(sections)`（两段渲染 + 降级文案），零 IO、只 import 本文件常量。
- `src/host/inventory-command.ts`：`InventoryPorts` 窄端口（`cwd` / `toolNames` / `skillSnapshot` / `log`）+ `createInventoryCommand(ports)` 返回 `RegisteredCommand`；单测用假端口覆盖成功、缺席、抛错、不完整、取消、带参。
- `src/host/index.ts`：只做**真实端口接线**（`ctx.get` 三个服务 + `workingDirectory.get` 回退链），把 `createInventoryCommand(...)` 的产物并入 `globalCommands(scan.user, [...BUILTIN_COMMANDS, inventory])`；不在装配层写业务规则（沿用本插件既有 seam 风格）。
- 端口签名把 `agent` 当不透明对象（`object`）传递，窄类型只在 `index.ts` 内做一次 cast，避免把宿主类型拖进可测层。

### D8 遮蔽与保留名

`/inventory` 落在全局层的内置位置，按既有 `globalCommands` 规则：用户级/项目级同名 `inventory.md` 优先（与 `/init` 同一语义，顺序不变）。不加入 `RESERVED_COMMAND_NAMES`（该名单只保留给插件的兜底命令 `commands-reload`），命令名满足 `^[a-z][a-z0-9_-]*$`。

## Risks / Trade-offs

- **[公开名归一/截断导致归组丢失]** → 未归组单独计数并如实输出，单测覆盖；不猜测服务器名（猜测出来的名字会误导 `/tools off mcp:<server>`）。
- **[serverName 含 `__` 时归组歧义]** → 模块注释与 README 注明该限制；发生面极低（`mcp-client` 公开名本身有损，无法无损反推）。
- **[ctx.get 读到未激活或重载中的服务]** → `strict` 默认只读已激活实现；每次执行现取不缓存，服务重载后自然跟随；缺席按段降级而非报错。
- **[skills.snapshot 被慢提供方拖住]** → 传 `invocation.signal`，派发方可取消；不做额外超时（宿主命令通道自身无超时契约，加超时反而可能误伤大目录）。
- **[输出过长]** → skill 描述截断、服务器只出计数、顺序固定；UI 可滚动，且结果不进模型请求。
- **[用户级同名文件遮蔽后内置能力静默消失]** → 与 `/init` 同一规则、README 明确写出；不占用保留名是刻意的（用户应能覆盖任何内置命令）。

## Migration Plan

- 纯增量：无持久化状态、无数据迁移、无双端契约变更。
- 发布前 `lib/` 重建提交（本仓产物随仓库提交）；profile 按 tag 重装后重启即生效，link 安装改源码重启即可。
- 版本与 tag 由用户决定：优先与在途变更 `session-tool-toggle-skill-workspace` 的 1.5.0 合并发布；若本变更单独发布则版本顺延。
- 回滚：撤掉本变更的代码/产物即可；旧标签仍可安装。已存在的会话在插件重载后自动获得/失去 `/inventory`，无残留状态。
