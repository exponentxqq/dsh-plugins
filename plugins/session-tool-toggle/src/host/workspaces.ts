/**
 * 工作区级默认档：路径定位、读取校验（两级降级）、稳定原子写入与纯函数编辑。
 *
 * 工作区档是「某个工作区里新会话的初始关闭集」这份偏好的唯一存放处：
 * `$DSH_HOME/session-tool-toggle/workspaces.json`（`config.workspacesFile` 可覆盖成绝对路径）。
 * 键是工作区的规范绝对路径（会话 cwd 的 realpath；`workspaceRegistry` 可用时以其 `path`
 * 为准），值是该工作区新会话的初始关闭集。
 *
 * 四组职责与 `defaults.ts` 逐一同构，只是维度从「一个用户一份清单」变成「一个工作区一份清单」：
 *
 * - **定位**（{@link workspacesPath}）：只拼路径，不碰文件系统。`dshHomePath` 每次调用现读
 *   `$DSH_HOME`，隔离冒烟（`DSH_HOME=/tmp/...`）不需要任何额外开关。
 * - **读取**（{@link readWorkspaces}）：读 → 解析 → 校验 → 归一，**永不抛错**。整份不可用
 *   （缺失 / 读失败 / 坏 JSON / schema 不符）降级为 {@link EMPTY_WORKSPACES}；条目级问题只丢
 *   受影响的那一条（或那一条里的坏地址），其余保留。
 * - **写入**（{@link writeWorkspaces}）：排序去重 + 字典序稳定序列化，失败**原样抛**，由调用方
 *   （`updateWorkspaceDefaults`）转成 `workspace-unwritable`。
 * - **编辑与派生**（{@link withEntry} / {@link disabledOf} / {@link mergeSeed}）：纯函数，
 *   不改入参、不碰 IO；播种路径用 {@link mergeSeed} 把用户档与工作区档合成一份并集快照。
 *
 * **两级降级**（与 `defaults.ts:106-162` 同一纪律，逐级独立）：
 *
 * - **整份不可用**（读失败、非法 JSON、顶层非对象、`version !== 1`、`workspaces` 非对象）→
 *   {@link EMPTY_WORKSPACES} + 一条 warn；唯一的例外是 `ENOENT`——首次使用是常态，不告警。
 * - **条目级非法**（键不是绝对路径 / 超长、条目值非对象、`disabled` 非数组、某条地址不是
 *   字符串或文法不合法、条目数超上限）→ 只丢受影响的键或地址；可解析但非规范形的地址
 *   （`skill` / `mcp:a::*`）归一后保留（归一不改变语义，因此不为归一单独告警）。全部条目级
 *   问题汇总成**一条** warn，避免一份手编坏文件刷满日志。
 *
 * **IO 端口复用**：{@link WorkspaceIo} 就是 `defaults.ts` 的 `DefaultsIo`（`WorkspaceIo = DefaultsIo`），
 * 生产实现是同一份 `createNodeDefaultsIo`（原子写 + `mode 0o600` / `dirMode 0o700`），本模块
 * 不新造端口、也不重复声明权限位。逻辑函数只依赖端口，单测注入假实现即可。
 *
 * **并发语义**：无锁，后写者胜。读-改-写由 `updateWorkspaceDefaults` 在一次调用内完成，
 * 竞争窗口因此最小化；本模块不引入锁，也不做跨进程协调（与 `defaults.ts` 同一取舍）。
 *
 * @module dsh-plugin-session-tool-toggle/host/workspaces
 */

import { isAbsolute } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { parseAddress } from './address.ts'
import { DEFAULTS_DIR_NAME } from './defaults.ts'
import type { DefaultsIo, SpecLog } from './types.ts'

/**
 * 复用默认档的文件 IO 端口（同一原子写实现）。
 *
 * 端口形状（`readFile` / `writeFile`）对两份档文件完全一致，命名不改以免牵动
 * `defaults.ts` 的导出面；装配层把**同一个** `createNodeDefaultsIo` 实例分别注入
 * `defaultsIo` 与 `workspacesIo`，权限位（0o600 / 0o700）因此只有一处定义。
 */
export type WorkspaceIo = DefaultsIo

/** 工作区档文件名：`<$DSH_HOME>/session-tool-toggle/workspaces.json`。 */
export const WORKSPACES_FILE_NAME = 'workspaces.json'

/** 工作区档的 schema 版本；与 `DefaultsFile` 的版本策略一致，未来迁移再抬。 */
export const WORKSPACES_VERSION = 1

/**
 * 工作区条目数上限。
 *
 * 256 个已登记工作区已远超单机日常用量，继续增长只会让手编文件与整份读-改-写变慢；
 * 超出的条目在读取时按键字典序丢弃末尾项（写路径不静默裁剪，见 {@link withEntry}）。
 */
export const MAX_WORKSPACE_ENTRIES = 256

/**
 * 工作区键的最大长度（字符数）。
 *
 * 键是规范绝对路径；4096 是常见 PATH_MAX 的量级，超长键几乎只能是坏数据或恶意输入，
 * 读取时直接丢弃，避免它进入状态快照与面板文案。
 */
export const MAX_WORKSPACE_KEY_LENGTH = 4096

/** 冻结的空文本数组：任意「没有该工作区」的读数共用同一份。 */
const NO_TEXTS: readonly string[] = Object.freeze([])

/**
 * 地址归一用的空保护名单。
 *
 * 工作区档与技能地址同一口径（D15：技能开关没有保护基线）；工具保护名单由掩码引擎在
 * 会话状态上施加，本模块只守文法——手编 `tool:bash` 不会被静默抹掉，真正生效与否由
 * `mask.ts` 的 `PROTECTED_NAMES` 决定。
 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

/** 冻结的空工作区映射：整份降级结果与空读数共用。 */
const NO_WORKSPACES: Readonly<Record<string, WorkspaceDefaultsEntry>> = Object.freeze({})

/**
 * 一个工作区的默认关闭集条目。
 *
 * 只存规范形文本（`formatAddress` 的输出）：读路径逐条归一，写路径只排序去重，因此文件
 * 内容可读、可比较、可重放。
 */
export interface WorkspaceDefaultsEntry {
  /** 该工作区新会话的初始关闭集（规范形文本，排序去重）。 */
  readonly disabled: readonly string[]
}

/**
 * 工作区档的完整形状（`$DSH_HOME/session-tool-toggle/workspaces.json`）。
 *
 * `workspaces` 是普通对象而不是 `Map`：落盘就是 JSON 对象，读入即得，不需要额外编解码。
 */
export interface WorkspaceDefaultsFile {
  /** 文件版本；只接受 {@link WORKSPACES_VERSION}，其余按整份不合法降级。 */
  readonly version: 1
  /** 键 = 工作区规范绝对路径（realpath）；值 = 该工作区的默认关闭集。 */
  readonly workspaces: Readonly<Record<string, WorkspaceDefaultsEntry>>
}

/**
 * 空工作区档：文件缺失 / 读失败 / 损坏 / schema 不符时的唯一降级结果。
 *
 * 冻结并导出，单测可以用 `toBe` 钉住「降级 == 这一份」；**合法**的空文件读取返回的是新
 * 对象（`toEqual` 相等但引用不同），从而把「没有任何工作区偏好」与「读不出来」在诊断上
 * 分开（与 `EMPTY_DEFAULTS` 同一纪律）。
 */
export const EMPTY_WORKSPACES: WorkspaceDefaultsFile = Object.freeze({
  version: WORKSPACES_VERSION,
  workspaces: NO_WORKSPACES,
})

/**
 * 工作区档的绝对路径。
 *
 * `config.workspacesFile` 非空时**原样**返回（装配层已保证是绝对路径）：用户显式指定的
 * 覆盖值不做任何拼接或归一，排障时看到的就是实际读写的路径。空白覆盖值按未设处理——与
 * `defaultsPath` 对空覆盖值的处理一致，空白路径绝不会把工作区档落到当前工作目录。
 *
 * @param configured - `config.workspacesFile` 的覆盖值；省略 / 空串 / 纯空白时走默认位置。
 * @returns 工作区档的绝对路径（不创建任何目录）。
 */
export function workspacesPath(configured?: string): string {
  const override = configured?.trim()
  if (override !== undefined && override !== '') return override
  // 与用户级默认档同目录（`$DSH_HOME/session-tool-toggle/`）：一份偏好两个维度，便于一起备份。
  return dshHomePath(DEFAULTS_DIR_NAME, WORKSPACES_FILE_NAME)
}

/** 读取阶段暂存的合法条目（排序截断后再组装成对象）。 */
interface ParsedEntry {
  /** 工作区规范绝对路径。 */
  readonly key: string
  /** 已排序去重的关闭集。 */
  readonly disabled: readonly string[]
}

/**
 * 读取并校验工作区档；任何坏情况都降级，**不抛错**。
 *
 * 判定顺序即降级顺序：读文件 → JSON 解析 → 整份 schema 校验 → 逐条目校验 → 排序去重。
 * 「删除文件」「首次使用」「手编语法错误」在用户眼里是同一件事：没有可用的工作区默认关闭集，
 * 会话照常创建并按用户档播种，只是多一条可排查的 warn（`ENOENT` 连 warn 都不发）。
 *
 * 条目级容忍的边界：键必须是绝对路径且不超 {@link MAX_WORKSPACE_KEY_LENGTH}；值必须是
 * 对象且 `disabled` 是数组；数组里只保留能通过 `parseAddress`（空保护名单）的字符串，并按
 * `parsed.text` 归一。任何一档不满足只丢受影响的键/地址，不牵连同文件的其它条目。
 *
 * @param path - 工作区档绝对路径（`workspacesPath()` 的结果，或装配层的覆盖值）。
 * @param io - 读写端口（生产实现是 `createNodeDefaultsIo` 的同一实例）。
 * @param log - 诊断出口；整份降级 1 条 warn，条目级问题汇总 1 条 warn，`ENOENT` 不告警。
 * @returns 校验并规范化后的工作区档；整份不可用时是 {@link EMPTY_WORKSPACES}。
 */
export async function readWorkspaces(
  path: string,
  io: WorkspaceIo,
  log: SpecLog,
): Promise<WorkspaceDefaultsFile> {
  let text: string
  try {
    text = await io.readFile(path)
  } catch (error) {
    // ENOENT 是首次使用（文件还没建），属于常态；其余读失败（权限 / 网络盘掉线 …）才值得 warn。
    if (errorCodeOf(error) !== 'ENOENT') {
      log.warn(`工作区档不可读（${path}，${describeError(error)}），已按空档处理`)
    }
    return EMPTY_WORKSPACES
  }

  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (error) {
    log.warn(`工作区档不是合法 JSON（${path}，${messageOf(error)}），已按空档处理`)
    return EMPTY_WORKSPACES
  }

  if (!isRecord(raw)) {
    return degraded(log, path, `顶层不是对象（收到 ${describeRaw(raw)}）`)
  }
  if (raw.version !== WORKSPACES_VERSION) {
    return degraded(
      log,
      path,
      `version 不是 ${WORKSPACES_VERSION}（收到 ${describeRaw(raw.version)}）`,
    )
  }
  if (!isRecord(raw.workspaces)) {
    return degraded(log, path, `workspaces 不是对象（收到 ${describeRaw(raw.workspaces)}）`)
  }

  const problems: string[] = []
  const entries: ParsedEntry[] = []
  for (const [key, value] of Object.entries(raw.workspaces)) {
    const keyProblem = keyProblemOf(key)
    if (keyProblem !== undefined) {
      problems.push(`键${quote(key)}${keyProblem}`)
      continue
    }
    if (!isRecord(value)) {
      problems.push(`条目${quote(key)}的值不是对象`)
      continue
    }
    if (!Array.isArray(value.disabled)) {
      problems.push(`条目${quote(key)}的 disabled 不是数组`)
      continue
    }

    const kept: string[] = []
    const rejected: unknown[] = []
    for (const item of value.disabled) {
      // 面对的是任意 JSON：非字符串条目与文法错误同罪，只丢这一条地址。
      if (typeof item !== 'string') {
        rejected.push(item)
        continue
      }
      const parsed = parseAddress(item, NO_PROTECTED_NAMES)
      if (!parsed.ok) {
        rejected.push(item)
        continue
      }
      // 可解析即保留 `text`：归一（`skill` → `tool:skill`、`mcp:a::*` → `mcp:a`）发生在解析
      // 出口，语义不变，因此不为归一单独告警。
      kept.push(parsed.text)
    }
    if (rejected.length > 0) {
      problems.push(`条目${quote(key)}有 ${rejected.length} 条地址不合法（${sampleOf(rejected)}）`)
    }
    // 坏地址丢光也保留条目本身：工作区的键是用户显式写下的，空关闭集合法且语义明确。
    entries.push({ key, disabled: sortUnique(kept) })
  }

  entries.sort((left, right) => compareText(left.key, right.key))
  if (entries.length > MAX_WORKSPACE_ENTRIES) {
    const overflow = entries.length - MAX_WORKSPACE_ENTRIES
    problems.push(
      `条目数 ${entries.length} 超过上限 ${MAX_WORKSPACE_ENTRIES}，已丢弃键字典序靠后的 ${overflow} 个`,
    )
    entries.length = MAX_WORKSPACE_ENTRIES
  }

  if (problems.length > 0) {
    log.warn(`工作区档有不可用条目，已丢弃或归一（${path}）：${problems.join('；')}`)
  }

  return {
    version: WORKSPACES_VERSION,
    workspaces: Object.fromEntries(
      entries.map((entry) => [entry.key, { disabled: entry.disabled }] as const),
    ),
  }
}

/**
 * 把一份工作区档写成完整文件内容（键与关闭集都排序去重后交给端口）。
 *
 * **只排序去重、不改写条目**（与 `writeDefaults` 同一取舍）：写入路径的调用方
 * （`updateWorkspaceDefaults`）传来的是 `parseAddress` 的规范形，读入侧还会再校验一次；
 * 在这里静默丢弃/归一用户的输入会让「我明明写进去了」变成不可解释的行为，所以非法内容留给
 * 读路径按同一套两级纪律处理。
 *
 * 序列化是**稳定**的：键按 UTF-16 码元序（不用 `localeCompare`，结果与 locale 无关）、
 * 2 空格缩进、末尾换行，因此「同内容同字节」，重复写同一份内容不会产生 diff。
 *
 * 原子性由端口负责（生产实现用 `writeFileAtomic`：随机后缀同级临时文件 + rename），本函数
 * 只保证内容完整。端口抛错时**原样抛出**：调用方据此回 `workspace-unwritable`（权限 / 磁盘 /
 * 目录不可建），不允许静默吞掉。
 *
 * @param path - 工作区档绝对路径。
 * @param file - 要写入的工作区档（`workspaces` 的键与每个 `disabled` 都会被排序去重）。
 * @param io - 读写端口。
 * @returns 写入完成（端口 resolve）后 resolve。
 * @throws 端口写入失败时抛出原错误。
 */
export async function writeWorkspaces(
  path: string,
  file: WorkspaceDefaultsFile,
  io: WorkspaceIo,
): Promise<void> {
  await io.writeFile(path, serialize(file))
}

/**
 * 读某个工作区的默认关闭集；没有该键时返回冻结的空数组。
 *
 * 纯函数、零 IO：文件已在调用方读好（`readWorkspaces` 保证条目已归一），这里只做查找。
 * 无该键与「该工作区关了 0 项」都返回空集，两者语义等价，无需区分。
 *
 * @param file - 已读入的工作区档。
 * @param key - 工作区规范绝对路径。
 * @returns 该工作区的关闭集（只读，可能是共享的空数组）。
 */
export function disabledOf(file: WorkspaceDefaultsFile, key: string): readonly string[] {
  if (!Object.hasOwn(file.workspaces, key)) return NO_TEXTS
  return file.workspaces[key].disabled
}

/**
 * 新建会话的初始关闭集 = 用户档 ∪ 工作区档（排序去重）。
 *
 * 纯函数：不改入参、不碰 IO，播种路径（`index.ts` 的 `readOrSeed`）与单测共用同一实现，
 * 「并集」因此不是装配层里一段只能靠集成测试覆盖的表达式。并集语义写死（spec）：工作区
 * 只能**追加**关闭，不能反开用户级关闭项。
 *
 * @param user - 用户级默认档的 `disabled`。
 * @param workspace - 该会话所属工作区档的 `disabled`（无归属时传空数组）。
 * @returns 新的排序去重数组；两个入参保持不变。
 */
export function mergeSeed(
  user: readonly string[],
  workspace: readonly string[],
): readonly string[] {
  return sortUnique([...user, ...workspace])
}

/**
 * 返回替换了某个工作区条目的新工作区档（纯函数）。
 *
 * 语义写死：
 *
 * - `disabled` 排序去重后整份替换该键的值（`off` / `on` / `set` / `reset` 的合并由调用方
 *   完成，本函数只负责「把这一项写进去」）；
 * - 其它工作区条目原样保留（只排序去重，不改写），键按字典序稳定排序；
 * - 键必须绝对路径且不超 {@link MAX_WORKSPACE_KEY_LENGTH}，否则**不写入**并 warn 一条
 *   （返回入参本身）：坏键若写进去，下次读取会整条丢弃，反而让调用方以为写成功了；
 * - 条目数已达 {@link MAX_WORKSPACE_ENTRIES} 时，**新增**键不写入并 warn 一条（返回入参
 *   本身）；替换既有键不受上限影响。
 *
 * 空 `disabled` 合法：条目保留、值为空数组（`/tools workspace reset` 的表达方式；删键属于
 * 静默改写结构，不做）。
 *
 * @param file - 当前工作区档（通常来自 `readWorkspaces`）。
 * @param key - 工作区规范绝对路径。
 * @param disabled - 该工作区新的默认关闭集（会排序去重）。
 * @param log - 诊断出口；拒绝写入时 warn 一条。
 * @returns 新的工作区档；拒绝写入时返回入参本身。
 */
export function withEntry(
  file: WorkspaceDefaultsFile,
  key: string,
  disabled: readonly string[],
  log: SpecLog,
): WorkspaceDefaultsFile {
  const keyProblem = keyProblemOf(key)
  if (keyProblem !== undefined) {
    log.warn(`工作区键不可用（${quote(key)}${keyProblem}），未写入工作区档`)
    return file
  }

  const existing = Object.keys(file.workspaces)
  if (!Object.hasOwn(file.workspaces, key) && existing.length >= MAX_WORKSPACE_ENTRIES) {
    log.warn(
      `工作区档条目数已达上限 ${MAX_WORKSPACE_ENTRIES}，未新增 ${quote(key)}；`
        + `请先清理不再使用的工作区条目`,
    )
    return file
  }

  const entries: ParsedEntry[] = []
  for (const [entryKey, entry] of Object.entries(file.workspaces)) {
    if (entryKey === key) continue
    entries.push({ key: entryKey, disabled: sortUnique(entry.disabled) })
  }
  entries.push({ key, disabled: sortUnique(disabled) })
  entries.sort((left, right) => compareText(left.key, right.key))

  return {
    version: WORKSPACES_VERSION,
    workspaces: Object.fromEntries(
      entries.map((entry) => [entry.key, { disabled: entry.disabled }] as const),
    ),
  }
}

/**
 * 整份不可用的唯一出口：一条 warn + 空档。
 *
 * @param log - 诊断出口。
 * @param path - 工作区档路径（进文案，便于用户直接去改）。
 * @param reason - 哪个字段、收到了什么。
 * @returns {@link EMPTY_WORKSPACES} 本身（身份可断言）。
 */
function degraded(log: SpecLog, path: string, reason: string): WorkspaceDefaultsFile {
  log.warn(`工作区档 schema 不符（${path}，${reason}），已按空档处理`)
  return EMPTY_WORKSPACES
}

/**
 * 稳定序列化：键按字典序、条目内 `disabled` 排序去重、2 空格缩进、末尾换行。
 *
 * 与 `defaults.ts` 的 `serialize` 同一取舍：给人手编的文件不用压缩形，一行一个条目，diff
 * 与手改都友好；末尾换行让 `cat` 与编辑器都把它当完整文本文件。
 *
 * @param file - 要序列化的工作区档。
 * @returns 完整文件文本（同内容恒同字节）。
 */
function serialize(file: WorkspaceDefaultsFile): string {
  const workspaces = Object.fromEntries(
    Object.entries(file.workspaces)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, { disabled: sortUnique(entry.disabled) }] as const),
  )
  return `${JSON.stringify({ version: WORKSPACES_VERSION, workspaces }, null, 2)}\n`
}

/**
 * 键的合法性检查（读取与 `withEntry` 共用同一口径）。
 *
 * 只守两件可判定的事：绝对路径、长度上限；不 trim、不归一（工作区键的规范化由
 * `attribution.ts` 的 realpath 负责），否则 `withEntry` 会把用户给的两个不同键静默合并。
 *
 * @param key - 工作区键原文。
 * @returns 不可用的理由；合法时 undefined。
 */
function keyProblemOf(key: string): string | undefined {
  if (!isAbsolute(key)) return '不是绝对路径'
  if (key.length > MAX_WORKSPACE_KEY_LENGTH) return `超过 ${MAX_WORKSPACE_KEY_LENGTH} 字符`
  return undefined
}

/**
 * 排序 + 去重：与 `state.ts` / `defaults.ts` 同一条不变量（默认的 UTF-16 码元序，不用
 * `localeCompare`，因此结果与运行环境的 locale 无关）。
 *
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortUnique(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts)).sort()
}

/**
 * 文本比较（UTF-16 码元序）。
 *
 * @param left - 一个文本。
 * @param right - 另一个文本。
 * @returns 负数 / 0 / 正数。
 */
function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * 判断一个 JSON 值是不是「普通对象」（排除 null 与数组）。
 *
 * @param value - 任意值。
 * @returns 是对象时 true（可安全按键取值）。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 读失败的可读理由：`ENOENT` 说人话，其余保留错误码（`EACCES` / `EISDIR` / `EIO` …）。
 *
 * @param error - 端口抛出的错误。
 * @returns 文案片段（不含路径：调用方的 warn 已经带了路径）。
 */
function describeError(error: unknown): string {
  const code = errorCodeOf(error)
  if (code === 'ENOENT') return '文件不存在（ENOENT）'
  return code === undefined ? messageOf(error) : `${code}: ${messageOf(error)}`
}

/**
 * 取 Node 风格错误码。
 *
 * @param error - 任意值。
 * @returns 字符串错误码；不是 errno 异常时 undefined。
 */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { readonly code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/**
 * 取错误文案（非 `Error` 也不会抛）。
 *
 * @param error - 任意值。
 * @returns 文案。
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : describeRaw(error)
}

/**
 * 把一个 `unknown` 写成诊断里可读的短片段。
 *
 * @param value - 任意值。
 * @returns `「mcp:a」` / `数字 42` / `null` / `对象` 这类片段。
 */
function describeRaw(value: unknown): string {
  if (typeof value === 'string') return quote(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return '数组'
  if (typeof value === 'object') return '对象'
  if (typeof value === 'number') return `数字 ${String(value)}`
  return `${typeof value} ${String(value)}`
}

/**
 * 给文本加中文引号，并在超长时截断（避免一条坏键把整行日志撑爆）。
 *
 * @param text - 原文。
 * @returns `「…」` 形式的片段。
 */
function quote(text: string): string {
  const LIMIT = 120
  return text.length <= LIMIT ? `「${text}」` : `「${text.slice(0, LIMIT)}…（共 ${text.length} 字符）」`
}

/**
 * 诊断清单：最多列 `limit` 条，超出部分折成计数（避免告警里贴整份损坏内容）。
 *
 * @param values - 待展示的原文。
 * @param limit - 最多展示几条，默认 3。
 * @returns 顿号分隔的片段（空清单返回空串）。
 */
function sampleOf(values: readonly unknown[], limit = 3): string {
  const shown = values.slice(0, limit).map(describeRaw).join('、')
  return values.length > limit ? `${shown} 等 ${values.length} 条` : shown
}
