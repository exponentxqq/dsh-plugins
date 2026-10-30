/**
 * 地址文法：用户说的「关哪个」→ 状态里唯一的规范形。
 *
 * 三类开关对象（按设计 ③.1 的文法表逐条实现，语义不得改）：
 *
 * - `mcp:<server>`：整组关闭，该服务器的工具 schema 与服务器指令段一并移除；
 * - `mcp:<server>::<tool>` / `mcp:<server>::<prefix>*`：单工具关闭，只摘 schema；
 * - `tool:<name>`：内置工具关闭；`skill` 是 `tool:skill` 的口语别名，在解析期归一（D3）。
 *
 * 三条贯穿全文件的约定：
 *
 * - **规范形唯一**：`mcp:<server>::*` 与 `mcp:<server>` 是同一个意图，状态里只留整组那一种
 *   拼写；`skill` 同理只留 `tool:skill`。解析结果的 `text` 一律由 {@link formatAddress}
 *   生成，因此归一发生在解析出口，调用方不需要再格式化一次。
 * - **解析期拒绝**：保护名单与注册表保留名在解析期就拒绝（A7：只看名字，与该工具此刻
 *   是否已注册无关）；保护基线只能被配置追加、永不可减（D5）。
 * - **未知不报错**：serverName / 工具名是否真有其物由注册表决定，本模块只守文法。未知
 *   名字照样解析成功，匹配时静默为 false——服务器上线后同一个地址自动生效（C10 宽容）。
 *
 * 长度与数量护栏**不在本模块**：它们是线上传输的护栏（`contract.ts` 的
 * `ADDRESS_MAX_LENGTH` / `MAX_ADDRESSES`，由 RPC 请求 parser 施加，任务 9.2），本模块只管
 * 文法，因此不重复定义任何上限常量。
 *
 * 本模块是纯函数、零 IO、不 import 任何模块：解析结果只由输入决定，每条规则都能在单测里
 * 直接断言，也不需要拉起宿主或注册表。
 *
 * @module dsh-plugin-session-tool-toggle/host/address
 */

/**
 * 一个开关对象。状态里只存规范形文本（{@link formatAddress} 的输出）。
 *
 * - `mcp-group`：整组（`mcp:yunxiao`）；
 * - `mcp-tool`：单工具或尾部通配（`mcp:yunxiao::list_pages` / `mcp:yunxiao::get_*`）；
 * - `tool`：内置工具（`tool:workflow` / `tool:skill`）。
 */
export type SwitchAddress =
  | { readonly kind: 'mcp-group'; readonly server: string }
  | { readonly kind: 'mcp-tool'; readonly server: string; readonly pattern: string }
  | { readonly kind: 'tool'; readonly name: string }

/** 地址解析失败码：7 个，语义互不重叠（命令面与 RPC 都按码给本地化文案）。 */
export type ParseErrorCode =
  /** 空输入（含纯空白）。 */
  | 'empty'
  /** 前缀不是 `mcp:` / `tool:`，或裸拼写不是 `skill`。 */
  | 'unknown-prefix'
  /** serverName 不合 `[A-Za-z0-9_-]{1,32}`。 */
  | 'bad-server'
  /** 工具段为空、含 `?` / 字符类 / 中间 `*`，或 `tool:` 之后名字为空。 */
  | 'bad-tool-name'
  /** `tool:` 后面接的是 MCP public name（`mcp__…`），应改用 `mcp:` 形式。 */
  | 'mcp-tool-uses-tool-prefix'
  /** 注册表保留名（`run_code`）：注册与 `restrict` 都会拒绝。 */
  | 'reserved-tool'
  /** 命中保护名单（基线 ∪ 配置追加）。 */
  | 'protected-tool'

/**
 * 解析结果。
 *
 * 成功值是**规范形**（`text === formatAddress(address)`）；失败值带可操作的简体中文文案，
 * 每条都带完整文法一行。
 */
export type ParseResult =
  | { readonly ok: true; readonly address: SwitchAddress; readonly text: string }
  | { readonly ok: false; readonly code: ParseErrorCode; readonly message: string }

/**
 * 硬编码保护基线：自救与文件操作基础工具，**只能被 config 追加，永不可减**（D5）。
 *
 * 七个名字构成「读 → 改 → 搜 → 跑」的自救闭环。名单里多出的名字不会产生副作用（解析期
 * 只做名字比较，与该工具是否注册无关）；某部署若换了 shell 名，用 `config.protectedTools`
 * 追加，而不是改这里。
 */
export const PROTECTED_BASELINE: readonly string[] = [
  'bash',
  'pwsh',
  'read',
  'write',
  'edit',
  'glob',
  'grep',
]

/** 完整文法一行：错误文案与 `/tools` 提示共用（把 ③.1 的表格压成一行）。 */
export const ADDRESS_GRAMMAR =
  'mcp:<server> | mcp:<server>::<工具名或尾部 *> | tool:<工具名>（skill 等价于 tool:skill）'

/** 注册表保留名：`run_code` 被 PTC 呈现传输占用，注册与 `restrict` 都会拒绝。 */
const RESERVED_TOOL = 'run_code'

/** public name 里 serverName / rawName 的分隔符：`mcp__<serverName>__<rawName>`（D6）。 */
const MCP_PUBLIC_SEPARATOR = '__'

/** MCP 工具的 public name 前缀（由上面的分隔符拼出，两处不写两份）。 */
const MCP_PUBLIC_PREFIX = `mcp${MCP_PUBLIC_SEPARATOR}`

/** `mcp:` 地址前缀（整组与单工具共用）。 */
const MCP_PREFIX = 'mcp:'

/** 内置工具地址前缀。 */
const TOOL_PREFIX = 'tool:'

/** 单工具段的分隔符：serverName 文法不含 `:`，所以第一个 `::` 就是分隔符（D6）。 */
const MCP_TOOL_SEPARATOR = '::'

/** 通配符：只允许出现在工具段末尾（A8）。 */
const WILDCARD = '*'

/**
 * serverName 文法（`dsh/dsh-mcp-client/README.zh.md:58`）：1–32 个字母、数字、下划线、
 * 连字符。
 */
const SERVER_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * 工具段文法：完整名，或「名字 + 尾部 `*`」。
 *
 * `?`、字符类、中间 `*` 都不在字母表里，会落到 `bad-tool-name`（A8）。`.` 在字母表里是
 * 刻意的：用户会照 MCP 服务器文档抄 raw 名（如 `report.download`），它能解析成功，但
 * public name 已被归一成 `report_download_<hash12>`，因此匹配为 0——这正是 D6 反例要的
 * 「不假装成功」，而不是解析期报错。
 */
const TOOL_PATTERN = /^[A-Za-z0-9_.-]+\*?$/

/**
 * 解析一条用户输入，得到规范形地址。
 *
 * 文法见 {@link ADDRESS_GRAMMAR}。本函数**不查注册表**：未知的 serverName / 工具名照样
 * 解析成功（C10），匹配由 {@link matchesToolName} 在匹配期静默过滤。
 * @param input - 用户原样输入（`/tools` 的子参数或 Web 面板里的地址）。
 * @param protectedNames - 生效保护名单（基线 ∪ config 追加；基线见 {@link PROTECTED_BASELINE}）。
 * @returns 成功（规范形地址 + 规范形文本）或失败（失败码 + 简体中文可操作文案）。
 */
export function parseAddress(input: string, protectedNames: ReadonlySet<string>): ParseResult {
  // 纯空白按空地址处理；其余输入原样解析（serverName / 工具名内部出现空白本身就是非法）。
  if (input.trim().length === 0) {
    return rejected(
      'empty',
      `地址为空；文法：${ADDRESS_GRAMMAR}（例如 mcp:yunxiao、mcp:yunxiao::get_*、tool:workflow）`,
    )
  }

  // `skill` 是 `tool:skill` 的口语别名（D3）：只在「没有前缀的裸拼写」时成立。
  if (input === 'skill') return parsed({ kind: 'tool', name: 'skill' })

  const separator = input.indexOf(':')
  if (separator < 0) {
    return rejected(
      'unknown-prefix',
      `无法识别的地址「${input}」：缺少 mcp: 或 tool: 前缀；文法：${ADDRESS_GRAMMAR}`,
    )
  }

  const prefix = input.slice(0, separator)
  const rest = input.slice(separator + 1)
  if (prefix === 'mcp') return parseMcpAddress(rest)
  if (prefix === 'tool') return parseToolAddress(rest, protectedNames)
  return rejected(
    'unknown-prefix',
    `无法识别的地址前缀「${prefix}:」：只支持 mcp: 与 tool:（skill 是 tool:skill 的别名）；文法：${ADDRESS_GRAMMAR}`,
  )
}

/**
 * 规范形文本：状态、记录与回执里只用这一种拼写。
 * @param address - 地址。
 * @returns `mcp:<server>` / `mcp:<server>::<pattern>` / `tool:<name>`。
 */
export function formatAddress(address: SwitchAddress): string {
  if (address.kind === 'mcp-group') return `${MCP_PREFIX}${address.server}`
  if (address.kind === 'mcp-tool') {
    return `${MCP_PREFIX}${address.server}${MCP_TOOL_SEPARATOR}${address.pattern}`
  }
  return `${TOOL_PREFIX}${address.name}`
}

/**
 * 语义相等（serverName 大小写敏感、pattern 原样比较）。
 *
 * 规范形已保证同一意图只有一种拼写，所以这里可以直接比字段，不需要再归一一次。
 * @param left - 一个地址。
 * @param right - 另一个地址。
 * @returns 语义相等时为 true。
 */
export function addressesEqual(left: SwitchAddress, right: SwitchAddress): boolean {
  if (left.kind === 'mcp-group') {
    return right.kind === 'mcp-group' && left.server === right.server
  }
  if (left.kind === 'mcp-tool') {
    return right.kind === 'mcp-tool'
      && left.server === right.server
      && left.pattern === right.pattern
  }
  return right.kind === 'tool' && left.name === right.name
}

/**
 * 该地址是否命中一个注册名。
 *
 * 匹配一律打在 **public name** 上（D6，不接受 raw MCP 名）：`mcp:<server>` 命中
 * `mcp__<server>__*`；单工具的 pattern 只与 `mcp__<server>__` 之后的后缀比较（尾部 `*` 是
 * 前缀匹配，否则全等）；`tool:<name>` 与内置工具的注册名全等。
 * @param address - 地址。
 * @param toolName - 注册表里的名字（MCP public name 或内置工具名）。
 * @returns 命中时为 true；未知 serverName 只是 false，不抛错（C10）。
 */
export function matchesToolName(address: SwitchAddress, toolName: string): boolean {
  if (address.kind === 'tool') return toolName === address.name

  const identity = mcpIdentityOf(toolName)
  if (identity === undefined || identity.server !== address.server) return false
  if (address.kind === 'mcp-group') return true

  const wildcard = address.pattern.endsWith(WILDCARD)
  const expected = wildcard ? address.pattern.slice(0, -WILDCARD.length) : address.pattern
  return wildcard ? identity.suffix.startsWith(expected) : identity.suffix === expected
}

/**
 * 构造成功结果：`text` 一律由 {@link formatAddress} 生成，归一因此在解析出口就完成。
 * @param address - 解析出的规范形地址。
 * @returns 成功结果。
 */
function parsed(address: SwitchAddress): ParseResult {
  return { ok: true, address, text: formatAddress(address) }
}

/**
 * 构造失败结果。
 * @param code - 失败码。
 * @param message - 简体中文可操作文案（每条都带文法一行）。
 * @returns 失败结果。
 */
function rejected(code: ParseErrorCode, message: string): ParseResult {
  return { ok: false, code, message }
}

/**
 * 解析 `mcp:` 之后的部分（`<server>` 或 `<server>::<工具段>`）。
 * @param rest - `mcp:` 之后的原文。
 * @returns 解析结果。
 */
function parseMcpAddress(rest: string): ParseResult {
  const separator = rest.indexOf(MCP_TOOL_SEPARATOR)
  if (separator < 0) {
    if (!SERVER_PATTERN.test(rest)) {
      return rejected('bad-server', badServerMessage(rest))
    }
    return parsed({ kind: 'mcp-group', server: rest })
  }

  const server = rest.slice(0, separator)
  if (!SERVER_PATTERN.test(server)) {
    return rejected('bad-server', badServerMessage(server))
  }

  const spec = rest.slice(separator + MCP_TOOL_SEPARATOR.length)
  if (spec.length === 0) {
    return rejected(
      'bad-tool-name',
      `mcp:${server}:: 后面缺少工具名：写完整名（如 mcp:${server}::get_issue）或尾部通配（如 mcp:${server}::get_*）；文法：${ADDRESS_GRAMMAR}`,
    )
  }
  // 「关全部子工具」与「关整组」是同一个意图，状态里只留整组这一种拼写。
  if (spec === WILDCARD) return parsed({ kind: 'mcp-group', server })
  if (!TOOL_PATTERN.test(spec)) {
    return rejected('bad-tool-name', badToolNameMessage(spec))
  }
  return parsed({ kind: 'mcp-tool', server, pattern: spec })
}

/**
 * 解析 `tool:` 之后的部分（内置工具名）。
 *
 * 拒绝顺序写死：空名 → 误用 `mcp__` 前缀 → 注册表保留名 → 保护名单。前三者的文案各自
 * 给出可抄的写法，保护名单则把生效名单整份列出来。
 * @param name - `tool:` 之后的原文。
 * @param protectedNames - 生效保护名单。
 * @returns 解析结果。
 */
function parseToolAddress(name: string, protectedNames: ReadonlySet<string>): ParseResult {
  if (name.length === 0) {
    return rejected(
      'bad-tool-name',
      `tool: 后面缺少工具名（如 tool:workflow）；文法：${ADDRESS_GRAMMAR}`,
    )
  }
  if (name.startsWith(MCP_PUBLIC_PREFIX)) {
    return rejected('mcp-tool-uses-tool-prefix', wrongPrefixMessage(name))
  }
  if (name === RESERVED_TOOL) {
    return rejected(
      'reserved-tool',
      `「${RESERVED_TOOL}」是工具注册表的保留名（PTC 呈现传输占用），关闭会被注册表拒绝；文法：${ADDRESS_GRAMMAR}`,
    )
  }
  if (protectedNames.has(name)) {
    return rejected('protected-tool', protectedMessage(name, protectedNames))
  }
  return parsed({ kind: 'tool', name })
}

/**
 * serverName 非法的文案：给文法与一个可抄的正例。
 * @param server - 用户写的服务器名（可能为空）。
 * @returns 文案。
 */
function badServerMessage(server: string): string {
  return `服务器名「${server}」不合法：只允许 1–32 个字母、数字、下划线或连字符（[A-Za-z0-9_-]{1,32}，如 mcp:yunxiao）；文法：${ADDRESS_GRAMMAR}`
}

/**
 * 工具段非法的文案：说明只支持尾部 `*`，并给正例。
 * @param spec - 用户写的工具段。
 * @returns 文案。
 */
function badToolNameMessage(spec: string): string {
  return `工具名或通配「${spec}」不合法：只支持完整名与尾部 * 前缀匹配（不支持 ?、字符类或中间 *，如 mcp:a::get_*）；文法：${ADDRESS_GRAMMAR}`
}

/**
 * 「用错前缀」的文案：能反推出 server 与后缀时，给出等价的 `mcp:` 写法。
 * @param toolName - `tool:` 之后的原文（`mcp__…`）。
 * @returns 文案。
 */
function wrongPrefixMessage(toolName: string): string {
  const suggestion = suggestMcpAddress(toolName)
  const hint = suggestion === undefined ? '' : `（本条等价于 ${suggestion}）`
  return `「tool:${toolName}」是 MCP 工具的 public name，不能用 tool: 前缀：请改用 mcp:<server>::<工具名> 形式${hint}；文法：${ADDRESS_GRAMMAR}`
}

/**
 * 把 `mcp__<server>__<suffix>` 反推成 `mcp:<server>::<suffix>`。
 *
 * 只为错误文案服务：拆不出来、或拆出来的两段不合文法，就返回 undefined，不做任何猜测。
 * @param publicName - 以 `mcp__` 开头的 public name。
 * @returns 等价的 `mcp:` 地址，或 undefined。
 */
function suggestMcpAddress(publicName: string): string | undefined {
  const rest = publicName.slice(MCP_PUBLIC_PREFIX.length)
  const separator = rest.indexOf(MCP_PUBLIC_SEPARATOR)
  if (separator <= 0) return undefined
  const server = rest.slice(0, separator)
  const suffix = rest.slice(separator + MCP_PUBLIC_SEPARATOR.length)
  if (!SERVER_PATTERN.test(server) || !TOOL_PATTERN.test(suffix)) return undefined
  return `${MCP_PREFIX}${server}${MCP_TOOL_SEPARATOR}${suffix}`
}

/**
 * 命中保护名单的文案：把生效名单整份列出，用户才知道边界在哪。
 * @param name - 用户想关的工具名。
 * @param protectedNames - 生效保护名单（非空：调用方已判定命中）。
 * @returns 文案。
 */
function protectedMessage(name: string, protectedNames: ReadonlySet<string>): string {
  const listed = Array.from(protectedNames).sort().join('、')
  return `「${name}」在保护名单内，不能关闭（当前保护名单：${listed}）：名单里是自救与文件操作的基础工具，只能经配置追加、永远不会被关掉；文法：${ADDRESS_GRAMMAR}`
}

/**
 * 把 MCP public name 拆成 (serverName, 工具后缀)。
 *
 * `mcp__<serverName>__<rawName>` 里 serverName 文法允许单个 `_`，所以只切第一个 `__`：后缀
 * 里再出现 `__` 归工具名（与 `dsh-mcp-client` 的命名契约、project-mcp 的 `toolServerOf`
 * 同一约定）。serverName 自身含 `__` 时这种拆法有歧义，本插件跟随宿主命名契约，不另行
 * 猜测，也绝不因此抛错。
 * @param toolName - 任意注册名。
 * @returns serverName 与非空后缀；不是 MCP public name 时 undefined。
 */
function mcpIdentityOf(
  toolName: string,
): { readonly server: string; readonly suffix: string } | undefined {
  if (!toolName.startsWith(MCP_PUBLIC_PREFIX)) return undefined
  const rest = toolName.slice(MCP_PUBLIC_PREFIX.length)
  const separator = rest.indexOf(MCP_PUBLIC_SEPARATOR)
  if (separator <= 0) return undefined
  const server = rest.slice(0, separator)
  const suffix = rest.slice(separator + MCP_PUBLIC_SEPARATOR.length)
  return suffix.length === 0 ? undefined : { server, suffix }
}
