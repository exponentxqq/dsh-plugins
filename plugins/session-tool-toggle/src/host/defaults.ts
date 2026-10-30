/**
 * 用户级默认档：路径定位、读取校验、损坏降级与原子写入。
 *
 * 默认档是「新会话的初始关闭集」这份用户偏好的唯一存放处：
 * `$DSH_HOME/session-tool-toggle/defaults.json`（`config.defaultsFile` 可覆盖成绝对路径）。
 * 四组职责刻意分开，每一组都能用假端口在单测里钉住，不需要拉起宿主：
 *
 * - **定位**（{@link defaultsPath}）：只拼路径，不碰文件系统。`dshHomePath` 每次调用现读
 *   `$DSH_HOME`，因此隔离冒烟（`DSH_HOME=/tmp/...`）不需要任何额外开关。
 * - **读取**（{@link readDefaults}）：读 → 解析 → 校验 → 规范化，**永不抛错**。缺失、损坏、
 *   半写、schema 不符一律降级为空档并 warn 一条：空档不是错误，只是「没有默认关闭」。
 * - **写入**（{@link writeDefaults}）：先排序去重，再把完整内容交给端口，失败**抛错**
 *   （调用方据此回 `defaults-unwritable`；写路径不允许静默吞掉权限 / 磁盘问题）。
 * - **快照**（{@link withSnapshot}）：会话创建时把默认档拍成 `snapshot`（Q5-a：改动只影响
 *   之后新建的会话，不追溯已有会话；`/tools reset` 回到这份快照）。
 *
 * 降级纪律与 `state.ts` 同一套**两级**语义，互不重叠：
 *
 * - **字段级不可用**（顶层不是对象、`version !== 1`、`disabled` 不是数组）→ 整份降级为
 *   {@link EMPTY_DEFAULTS} + 一条 warn。默认档本该是全量的，猜出来的内容比空档更难排查。
 * - **条目级非法**（不是字符串、文法不合法、命中保护名单）→ 只丢那一条，并按字段汇总成
 *   一条 warn；可解析但非规范形的条目（`skill`、`mcp:a::*`）归一为规范形后保留——它们与
 *   规范形**语义完全相同**，归一不改变行为，因此不告警。
 *
 * 逻辑函数只依赖 {@link DefaultsIo} 端口；{@link createNodeDefaultsIo} 是生产实现
 * （`node:fs` + `writeFileAtomic`），由装配层注入，自身也留了低层接缝供单测断言权限位。
 *
 * @module dsh-plugin-session-tool-toggle/host/defaults
 */

import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { PROTECTED_BASELINE, parseAddress } from './address.ts'
import type { DefaultsFile, DefaultsIo, SessionToolState, SpecLog } from './types.ts'

/** 默认档目录名（相对 `$DSH_HOME`）：`$DSH_HOME/session-tool-toggle/`。 */
export const DEFAULTS_DIR_NAME = 'session-tool-toggle'

/** 默认档文件名：`<$DSH_HOME>/session-tool-toggle/defaults.json`。 */
export const DEFAULTS_FILE_NAME = 'defaults.json'

/**
 * 默认档文件权限位（`writeFileAtomic` 的 `mode`）。
 *
 * 只属主可读写：默认档会暴露「这个用户关掉了哪些工具」，属于用户私有偏好，不该跟随 umask
 * 落成 0o644。位值受进程 umask 影响（新建 inode 的既有语义），不会比 0o600 更宽。
 */
export const DEFAULTS_FILE_MODE = 0o600

/**
 * 默认档目录权限位（`writeFileAtomic` 的 `dirMode`）。
 *
 * 只在目录**由本次写入创建**时生效（已存在的目录保留自己的 mode）；同样受 umask 影响。
 */
export const DEFAULTS_DIR_MODE = 0o700

/**
 * 默认档的校验名单：硬编码保护基线。
 *
 * 这里只有基线，不含 `config.protectedTools` 的追加项：默认档是**用户级**文件，读它的地方
 * （会话创建、`/tools default`）在装配层才算得出生效名单；而基线本身永不可减（D5），用它
 * 在读入时就丢弃「想关 bash/read/...」的条目，与用户边界 `parseAddress` 同一条口径。
 */
const PROTECTED_DEFAULTS: ReadonlySet<string> = new Set(PROTECTED_BASELINE)

/** 冻结的空文本数组：空档与降级结果共用同一份，误改会在严格模式下抛错。 */
const NO_TEXTS: readonly string[] = Object.freeze([])

/**
 * 空档：文件缺失 / 损坏 / 半写 / schema 不符时的唯一降级结果。
 *
 * 冻结并导出，单测可以用 `toBe` 钉住「降级 == 这一份」；**合法**的空文件读取返回的是新
 * 对象（`toEqual` 相等但引用不同），从而把「没有默认关闭」与「读不出来」在诊断上分开。
 */
export const EMPTY_DEFAULTS: DefaultsFile = Object.freeze({ version: 1, disabled: NO_TEXTS })

/**
 * 默认档的绝对路径。
 *
 * `config.defaultsFile` 非空时**原样**返回（装配层已保证是绝对路径）：用户显式指定的覆盖值
 * 不做任何拼接或归一，排障时看到的就是实际读写的路径。空白覆盖值按未设处理——与
 * `dsh-home-paths` 对空 `$DSH_HOME` 的处理一致，空白路径绝不会把默认档落到当前工作目录。
 *
 * @param configured - `config.defaultsFile` 的覆盖值；省略 / 空串 / 纯空白时走默认位置。
 * @returns 默认档的绝对路径（不创建任何目录）。
 */
export function defaultsPath(configured?: string): string {
  const override = configured?.trim()
  if (override !== undefined && override !== '') return override
  return dshHomePath(DEFAULTS_DIR_NAME, DEFAULTS_FILE_NAME)
}

/**
 * 读取并校验默认档；任何坏情况都降级为空档并 warn，**不抛错**。
 *
 * 判定顺序即降级顺序：读文件 → JSON 解析 → schema 校验 → 条目校验 → 排序去重。
 * 「删除文件」「网络盘掉线」「手编语法错误」在用户眼里是同一件事：没有可用的默认关闭集，
 * 会话照常创建（D9 的「空也写」保证新会话仍有一条快照记录），只是多一条可排查的 warn。
 *
 * @param path - 默认档绝对路径（`defaultsPath()` 的结果，或装配层的覆盖值）。
 * @param io - 读写端口（生产实现见 {@link createNodeDefaultsIo}）。
 * @param log - 诊断出口；每次降级最多一条 warn。
 * @returns 校验并规范化后的默认档；不可用时是 {@link EMPTY_DEFAULTS}。
 */
export async function readDefaults(
  path: string,
  io: DefaultsIo,
  log: SpecLog,
): Promise<DefaultsFile> {
  let text: string
  try {
    text = await io.readFile(path)
  } catch (error) {
    log.warn(`默认档不可读（${path}，${describeError(error)}），已按空档处理`)
    return EMPTY_DEFAULTS
  }

  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (error) {
    log.warn(`默认档不是合法 JSON（${path}，${messageOf(error)}），已按空档处理`)
    return EMPTY_DEFAULTS
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return degraded(log, path, `顶层不是对象（收到 ${describeRaw(raw)}）`)
  }

  const record = raw as Record<string, unknown>
  if (record.version !== 1) {
    return degraded(log, path, `version 不是 1（收到 ${describeRaw(record.version)}）`)
  }
  if (!Array.isArray(record.disabled)) {
    return degraded(log, path, `disabled 不是数组（收到 ${describeRaw(record.disabled)}）`)
  }

  const kept: string[] = []
  const dropped: unknown[] = []
  for (const entry of record.disabled) {
    // 类型收窄：面对的是任意 JSON，非字符串条目与文法错误同罪。
    if (typeof entry !== 'string') {
      dropped.push(entry)
      continue
    }
    const parsed = parseAddress(entry, PROTECTED_DEFAULTS)
    if (!parsed.ok) {
      dropped.push(entry)
      continue
    }
    // 可解析即保留 `text`：归一（`skill` → `tool:skill`、`mcp:a::*` → `mcp:a`）发生在解析
    // 出口，语义不变，因此不为归一单独告警。
    kept.push(parsed.text)
  }

  if (dropped.length > 0) {
    log.warn(`默认档里有 ${dropped.length} 条条目不合法，已丢弃：${sampleOf(dropped)}（${path}）`)
  }

  return { version: 1, disabled: sortUnique(kept) }
}

/**
 * 把一份默认档写成完整文件内容（排序去重后交给端口）。
 *
 * **只排序去重、不改写条目**：写入路径的调用方（`/tools default off|on|set`）传进来的是
 * `parseAddress` 的规范形，读入侧还会再校验一次；在这里静默丢弃/归一用户的输入会让「我明明
 * 写进去了」变成不可解释的行为，所以非法内容留给读路径按同一套两级纪律处理。
 *
 * 原子性由端口负责（生产实现用 `writeFileAtomic`：随机后缀同级临时文件 + rename），本函数
 * 只保证内容完整。端口抛错时**原样抛出**：`ControlDeps` 的调用方据此回
 * `defaults-unwritable`（权限 / 磁盘 / 目录不可建），不允许静默吞掉。
 *
 * @param path - 默认档绝对路径。
 * @param file - 要写入的默认档（`disabled` 会被排序去重）。
 * @param io - 读写端口。
 * @returns 写入完成（端口 resolve）后 resolve。
 * @throws 端口写入失败时抛出原错误。
 */
export async function writeDefaults(
  path: string,
  file: DefaultsFile,
  io: DefaultsIo,
): Promise<void> {
  const disabled = sortUnique(file.disabled)
  await io.writeFile(path, serialize(disabled))
}

/**
 * 新建会话的播种：把默认档拍成本会话的 `snapshot`。
 *
 * 语义写死（Q5-a）：快照只在会话创建时拍一次，之后改默认档**不追溯**；`/tools reset` 回到
 * 这份快照而不是「全开」。空快照合法——没有默认关闭时快照就是空数组，`/tools reset` 因此
 * 等价于全开，这正是「回到我建这个会话时的样子」的准确表达（D9 的「空也写」）。
 *
 * 纯函数：`disabled` / `seeded` / `updatedAt` 原样带过去，只换 `snapshot` 且排序去重。
 * `seeded` **不在这里置位**——它标记「本会话已有整值记录」，属于写入点（装配层播种分支）
 * 的事实，由那里写成 `{ ...withSnapshot(state, defaults.disabled), seeded: true }`。
 *
 * @param state - 当前状态（通常是 {@link EMPTY_STATE}）。
 * @param snapshot - 默认档的 `disabled`（读路径保证已是规范形；这里仍排序去重）。
 * @returns 带快照的新状态；不修改入参对象，也不与入参数组共享引用。
 */
export function withSnapshot(
  state: SessionToolState,
  snapshot: readonly string[],
): SessionToolState {
  return { ...state, snapshot: sortUnique(snapshot) }
}

/**
 * 生产 {@link DefaultsIo} 的低层依赖（只用于单测注入假实现；省略即真实实现）。
 *
 * 两个接缝都是「一次调用」粒度，因此断言权限位不需要拉起真实文件系统。
 */
export interface NodeDefaultsIoDeps {
  /** 读文件（默认 `node:fs/promises` 的 `readFile(path, 'utf8')`）。 */
  readonly readFile?: (path: string) => Promise<string>
  /** 原子写（默认 `@deepseek-ai/dsh-atomic-write` 的 `writeFileAtomic`）。 */
  readonly writeAtomic?: (
    path: string,
    data: string,
    options: { readonly mode: number; readonly dirMode?: number },
  ) => Promise<void>
}

/**
 * 生产端口实现：`node:fs` 读 + `writeFileAtomic` 原子写（权限位写死在本模块）。
 *
 * 由装配层（8.1）构造一次注入 `ControlDeps.defaultsIo`；逻辑函数只认端口，所以这里换实现
 * （测试替身、未来换成带锁的读写循环）不会牵动任何调用方。
 *
 * 权限位选择见 {@link DEFAULTS_FILE_MODE} / {@link DEFAULTS_DIR_MODE}：`writeFileAtomic` 的
 * `mode` 打在全新 inode 上并随 rename 生效（收窄既有的宽权限文件没有 chmod 竞态），
 * `dirMode` 只在本调用首次创建父目录时生效——首次写默认档的目录因此是 0o700。
 *
 * @param deps - 低层接缝（单测用）；省略即真实文件系统与真实原子写。
 * @returns 只做两个动作的 {@link DefaultsIo}。
 */
export function createNodeDefaultsIo(deps: NodeDefaultsIoDeps = {}): DefaultsIo {
  const readText = deps.readFile ?? (async (path: string) => await readFile(path, 'utf8'))
  const writeAtomic = deps.writeAtomic ?? writeFileAtomic
  return {
    readFile: async (path) => await readText(path),
    writeFile: async (path, data) => {
      await writeAtomic(path, data, {
        mode: DEFAULTS_FILE_MODE,
        dirMode: DEFAULTS_DIR_MODE,
      })
    },
  }
}

/**
 * 字段级不可用的唯一出口：一条 warn + 空档。
 *
 * @param log - 诊断出口。
 * @param path - 默认档路径（进文案，便于用户直接去改）。
 * @param reason - 哪个字段、收到了什么。
 * @returns {@link EMPTY_DEFAULTS} 本身（身份可断言）。
 */
function degraded(log: SpecLog, path: string, reason: string): DefaultsFile {
  log.warn(`默认档 schema 不符（${path}，${reason}），已按空档处理`)
  return EMPTY_DEFAULTS
}

/**
 * 序列化默认档：2 空格缩进 + 末尾换行。
 *
 * 默认档是给人手编的（面板会展示路径），所以不用 `JSON.stringify` 的压缩形：一行一个条目，
 * diff 与手改都友好；末尾换行让 `cat` 与编辑器都把它当完整文本文件。
 *
 * @param disabled - 已排序去重的关闭集。
 * @returns 完整文件文本。
 */
function serialize(disabled: readonly string[]): string {
  return `${JSON.stringify({ version: 1, disabled }, null, 2)}\n`
}

/**
 * 排序 + 去重：与 `state.ts` 同一条不变量（默认的 UTF-16 码元序，不用 `localeCompare`，
 * 因此结果与运行环境的 locale 无关）。
 *
 * @param texts - 文本列表。
 * @returns 新的排序去重数组。
 */
function sortUnique(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts)).sort()
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
  if (typeof value === 'string') return `「${value}」`
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return '数组'
  if (typeof value === 'object') return '对象'
  if (typeof value === 'number') return `数字 ${String(value)}`
  return `${typeof value} ${String(value)}`
}

/**
 * 诊断清单：最多列 `limit` 条，超出部分折成计数（避免告警里贴整份损坏内容）。
 *
 * @param values - 待展示的原文。
 * @param limit - 最多展示几条，默认 3。
 * @returns 顿号分隔的片段。
 */
function sampleOf(values: readonly unknown[], limit = 3): string {
  const shown = values.slice(0, limit).map(describeRaw).join('、')
  return values.length > limit ? `${shown} 等 ${values.length} 条` : shown
}
