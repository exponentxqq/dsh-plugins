/**
 * 插件内置命令。v1 只有一个：`/init`。
 *
 * 内置命令与用户级/项目级命令同层（全局层），但排在用户级之后：用户写了 `init.md` 就遮蔽内置，
 * 这是跨层遮蔽而非冲突，不记错误（见 `globalCommands`）。
 *
 * `/init` 的存在理由：`AGENTS.md` 是 DSH 原生逐会话加载的项目指引，而新仓库每次都要口头描述
 * 该怎么写。它把这件事变成一条命令——分析仓库、写主根 `AGENTS.md`。
 *
 * prompt 里的产出约束是逐条规定的（简体中文、≤80 行、只写查证过的事实、已有文件合并更新、
 * 不追加 TODO 建议）：LLM 生成项目文档最容易失守的正是「编造命令」与「推倒重写」，
 * 而这两点恰好会让下游会话照着错的指引进错门。
 * @module dsh-plugin-user-commands/host/builtins
 */

import type { RegisteredCommand } from './types.ts'

/** `/init` 的 prompt 模板：`$ARGUMENTS` 用来传达用户补充的关注点。 */
export const INIT_PROMPT = `请为当前工作区的主根仓库撰写或更新 AGENTS.md 项目指引，供后续会话直接读取。

第一步：查证事实（不要凭猜测）
- 目录结构：列出顶层目录，每个目录一句职责。
- 工具链：读 package.json / pyproject.toml / Cargo.toml / go.mod / pom.xml 等清单与锁文件，确认实际使用的包管理器与版本约束。
- 常用命令：从清单的 scripts、Makefile、justfile、CI 配置里逐条提取安装、构建、测试、lint、运行命令，保证每条都能直接复制执行。
- 代码约定：浏览现有代码与测试，归纳命名风格、模块划分、错误处理与测试写法。

第二步：写入主根 AGENTS.md
- 目标是主根（工作区根目录）下的 AGENTS.md：没有就创建；已存在则**合并更新**——保留仍然正确的内容，只修订过时或错误的条目，不要推倒重写。
- 全文使用简体中文，总行数不超过 80 行。
- 只写查证过的事实：命令必须来自实际清单，目录必须真实存在，不写 TODO 与后续建议。
- 没有值得写的内容时，宁可不写，也不要编造。

补充关注点（为空则忽略）：$ARGUMENTS`

/** 插件内置的命令，按优先级排列（前面的先被考虑）。 */
export const BUILTIN_COMMANDS: readonly RegisteredCommand[] = [
  {
    name: 'init',
    description: '分析当前仓库并在主根创建或合并更新 AGENTS.md 项目指引',
    hint: '[补充关注点]',
    origin: { kind: 'builtin', prompt: INIT_PROMPT },
  },
]

/**
 * 全局层（用户级 + 内置）此刻应该有哪些命令。
 *
 * 用户级在前，因此同名内置命令直接落选——跨层是遮蔽不是冲突，不记错误。
 * @param user - 用户级命令（已仲裁）。
 * @param builtins - 内置命令，默认 {@link BUILTIN_COMMANDS}。
 * @returns 全局层期望的命令清单。
 */
export function globalCommands(
  user: readonly RegisteredCommand[],
  builtins: readonly RegisteredCommand[] = BUILTIN_COMMANDS,
): readonly RegisteredCommand[] {
  const taken = new Set(user.map((command) => command.name))
  return [...user, ...builtins.filter((command) => !taken.has(command.name))]
}
