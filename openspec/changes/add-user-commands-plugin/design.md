# Design

## Context

dsh-commands 提供命令注册表：`ctx.inject(['commands'], s => s.commands.register({name, description, input?, handler}))`，handler 收 `{agent, rawInput}` 返回 `{kind, text}`；注册表本身不提交任何内容，prompt 型命令由生产者经 `agent.steer(createUserMessage({content, source:{kind:'user'}}))` 提交（`/plan` 即此范式，`steer = send(msg,'next-step',wakeup:true)`，空闲会话也开新轮次）。命令注入型插件挂在 `agent.ctx` 下注册即对该 agent 生效并遮蔽全局同名（README 明文）。宿主是单进程多工作区形态，命令的跨工作区语义必须显式设计。

## Goals / Non-Goals

Goals:

- 用户能用 `.md` 文件定义斜杠命令，三层来源、三层遮蔽、热刷新。
- 内置 `/init` 一步生成/更新主根 `AGENTS.md`。
- 无命令适配器的 profile 中零副作用。

Non-Goals:

- 不做 shell 预执行（`!`cmd``）、`@file` 文件引用、`allowed-tools` 白名单——引入执行面与 tools.restrict 交互，值得独立变更。
- 不做位置参数（`$1`/`$2`）与上下文变量（`${CWD}` 等）。
- 不做子目录命名空间（DSH 命令名文法 `^[a-z][a-z0-9_-]*$` 不含冒号，隐式改名不可取）。
- 不内置 `/init` 之外的命令。
- 不做命令级模型/persona 覆盖。

## Decisions

### D1: 命令模型仅 prompt 型

文件正文 = prompt 模板；执行时展开后 `agent.steer()` 为用户消息。不引入任何本地执行语义：命令文件随仓库走（clone 即得），prompt 型的攻击面仅为"提示词注入进用户自己的会话"，用户自担且文档写明；shell 预执行则是有实际执行力的注入面，必须单独设计沙箱边界。

### D2: 三层来源与优先级

| 层 | 目录 | 注册位置 | 遮蔽关系 |
|---|---|---|---|
| 内置 | 插件代码常量 | 全局 | 被用户级/项目级同名遮蔽 |
| 用户级 | `$DSH_HOME/commands/`（缺省 `~/.dsh/commands`） | 全局 | 遮蔽内置 |
| 项目级 | 各登记根（主根+附加根）的 `.dsh/commands/` | 该会话 agent 上下文 | 遮蔽用户级与内置 |

### D3: agent 级遮蔽的实现

`agent/created` 时对该会话根集合的项目命令执行 `agent.ctx.inject(['commands'], scope => …register)`；`Map<agent, disposers>` 追踪，随 agent dispose 的 effect 清理。归属判定复用 project-mcp 同思路（cwd 逐级向上找最近登记根，canonical 比较），但**独立实现**（~60 行）——两插件互不依赖、可单独安装。归属失败 fail-closed：该会话只剩用户级+内置。

### D4: 文件格式与文法

- 平铺一层：`.dsh/commands/*.md`；子目录忽略 + warn。
- 命令名 = 文件名去 `.md`，MUST 匹配 `^[a-z][a-z0-9_-]*$`（与 dsh-commands 命令行文法一致）。
- frontmatter（`---` YAML）仅两字段：`description` 可选，缺省回退「用户自定义命令 <文件名>」（不读正文首行，避免 prompt 内容泄漏进发现菜单）；`argument-hint` 可选，映射 `input.hint`。
- 未知字段 warn 不跳过（前向兼容）；frontmatter 非法 YAML、文法不合法、正文为空 → error 日志 + 跳过该文件，不影响同目录其余命令。

### D5: 占位符仅 `$ARGUMENTS`

正文里 `$ARGUMENTS` 字面量全部出现处替换为去首尾空白的 rawInput；无参数代入空串。不做其他占位符（位置参数需引号转义语义；上下文变量有泄漏面）。

### D6: 调用语义

执行时**现读文件**（不缓存正文，改文件下次调用即生效；注册表只承载 name/description/hint 供发现菜单）→ 展开 → `agent.steer(createUserMessage({content:[{type:'text',text}], source:{kind:'user'}}))` → 返回 `{kind:'success', text:'已提交 /<name>'}`。文件不可读返回 error 结果且不提交部分内容。v1 不声明 `input.attachments`（适配器自动拒绝带附件调用，错误文案由官方适配器出）。

### D7: 同层冲突仲裁

同层同名先到者得：跨工作区按登记顺序、工作区内主根 > 附加根（授予顺序）；后来者 error 日志（含双方来源路径）并跳过；MUST NOT 自动改名。与 project-mcp 的 serverName 仲裁同风格（心智模型统一）。跨层是遮蔽不是冲突，不记错误。

### D8: watcher + `/commands-reload` 双保险

阶梯监听（目录不存在退一层）+ 250ms 防抖 + 声明式全量重同步（事件只当触发器、重扫读目录现状，覆盖全局层与全部存活会话的项目层）。`fs.watch` 存在**静默失聪**类失效：NFS/SMB/FUSE/osxfs 挂载不投递事件、暂停恢复丢事件、arm 竞态窗口——无异常可 catch、无日志可打，唯一发现者是人，故保留 `/commands-reload` 兜底（返回 加载/更新/移除/跳过 计数），与 `/mcp-reload` 对称。

### D9: 内置 `/init` 语义

分析仓库（结构、包管理器、构建/测试/lint 配置）→ 提炼常用命令（逐条可复制执行）、目录结构（每顶层目录一句职责）、代码约定（从现有代码归纳）、注意事项 → 写**主根** `AGENTS.md`。已存在则合并更新：保留仍正确内容、修订过时条目，MUST NOT 推倒重写。约束：简体中文、≤80 行、只写查证过的事实。`$ARGUMENTS` 传达补充关注点。产出即止，不追加 TODO 建议（Claude Code 的追加建议被裁掉：输出可控性优先）。内置定义可被用户级/项目级同名 `init.md` 遮蔽。

### D10: 降级

无 `commands` 服务的部署（acp / headless 无命令适配器）：`ctx.inject(['commands'], …)` 回调不运行，插件零注册零报错；`agent/created` 侧的 agent 级 inject 同理静默。

## Risks / Trade-offs

- **提示词内容可信度**：项目级命令随仓库分发，等于把 prompt 注入权交给仓库作者——限 prompt 型（无执行权）+ README 明示，接受。
- **per-agent 注册的清理泄漏**：agent 生命周期长、数量多时 Map 必须随 dispose 清理；单测覆盖创建/清理路径。
- **发现与执行的时差**：注册表（发现）与现读（执行）之间文件可能被删——调用时报错，不提交部分内容。
- **内置命令的长期背书**：内置即不可卸载，v1 只 `/init` 一个，最小面。

## Migration Plan

全新插件，无迁移。落地顺序：骨架 → discovery → 全局层注册 → agent 层与归属 → 调用语义 → watcher + `/commands-reload` → 内置 `/init` → 文档接线 → 真机验证。

## Open Questions

（无——命令模型、作用域、格式、`/init` 语义均已确认。）
