/**
 * 命令面测试（规范：dsh-session-tool-toggle —— `/tools` 单一命令的子文法与回执）。
 *
 * 全部用例都在**假 `ControlDeps`** 上驱动，不拉起宿主、不读写真实 `$DSH_HOME`：
 * 状态端口（`StateStore`）、层句柄（`LayerHandle`）、默认档 IO（`DefaultsIo`）与全局层
 * 读数（`catalog`）都是内存替身，因此「写了几次状态、掩码怎么变、文件里落了什么」都能
 * 直接计数断言。
 *
 * 覆盖三条主验证句（任务 7.1）：
 *
 * 1. **文法错误文案**：未知子命令、缺地址、多余参数、非法通配、`tool:mcp__…` 用错前缀，
 *    一律 `{kind:'error'}` 且文案带一行文法；
 * 2. **`/tools off tool:bash` 的保护拒绝**：列出保护名单、不写状态、不动掩码；
 * 3. **status 两态**：「全局层有、本会话关」→ `已关闭`；「从未注册」→ `已记录（当前无注册
 *    工具匹配；服务器上线后自动生效）`，两段文案不同。
 *
 * 另按 code-design ③.7 覆盖：`off`/`on` **逐字对称**的 KV 缓存重建提示、整组 off 的
 * `+ 1 段服务器指令`、单工具关闭不产生指令段、`reset` 回创建时快照、`default` 四种写
 * 子命令的读/写/覆盖/清空与「本会话不变」、未知 server 的宽容、多地址一次处理、重复
 * 关闭的无变化路径、层缺席与持久化降级的提示。
 */
import { describe, expect, it } from 'vitest'
import { PROTECTED_BASELINE } from '../src/host/address.ts'
import {
  COMMAND_NAME,
  TOOLS_GRAMMAR,
  parseToolsInput,
  runToolsCommand,
  toolsCommand,
  type ToolsCommandDeps,
} from '../src/host/commands.ts'
import { readPanel, resetSession, toggleSession, updateDefaults } from '../src/host/control.ts'
import { planMask } from '../src/host/mask.ts'
import type {
  DefaultsIo,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
  StoreKind,
} from '../src/host/types.ts'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

/** 假文件系统里的默认档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 假会话的创建时间（固定值，让「创建于 / 快照来源」可断言）。 */
const CREATED_AT = 1_700_000_000_000

/** 命令名在输入行里的长度（`/tools` = 6 字节）。 */
const COMMAND_PREFIX_LENGTH = COMMAND_NAME.length + 1

/**
 * 收集日志的假出口（与仓内其它套件同形）。
 * @returns 日志端口 + 三类消息数组。
 */
function recordingLog(): {
  log: SpecLog
  infos: string[]
  warnings: string[]
  errors: string[]
} {
  const infos: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  return {
    log: {
      info: (message) => infos.push(message),
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message),
    },
    infos,
    warnings,
    errors,
  }
}

/** 构造一个最小会话（内核只读 `id` / `header` / 事件读面）。 */
function fakeSession(id = 's1'): SessionLike {
  return {
    id,
    header: { isSeeded: true, createdAt: CREATED_AT },
    constructor: Object,
    eventAt: () => undefined,
    snapshotEvents: () => [],
  }
}

/**
 * 假状态端口：整值读、记录每次写入（可令写入抛错以驱动降级路径）。
 */
class FakeStore implements StateStore {
  readonly kind: StoreKind

  /** 当前整值状态。 */
  current: SessionToolState

  /** 每一次成功写入的载荷（按顺序）。 */
  readonly writes: SessionToolState[] = []

  /** 注入的写入错误（非空时每次写入都抛，`current` 不变）。 */
  private readonly writeError: Error | undefined

  /**
   * @param initial - 初始整值状态。
   * @param kind - 实际生效通道（默认 `record`）。
   * @param writeError - 注入的写入错误。
   */
  constructor(initial: SessionToolState, kind: StoreKind = 'record', writeError?: Error) {
    this.kind = kind
    this.current = initial
    this.writeError = writeError
  }

  /**
   * 读当前状态。
   * @returns 整值状态。
   */
  read(): SessionToolState {
    return this.current
  }

  /**
   * 写整值状态。
   * @param _session - 目标会话（假实现忽略）。
   * @param state - 新状态。
   */
  write(_session: SessionLike, state: SessionToolState): void {
    if (this.writeError !== undefined) throw this.writeError
    this.writes.push(state)
    this.current = state
  }
}

/**
 * 假层句柄：按 `planMask` 的三读并集重算掩码，并让名字从 `visibleNames()` 消失。
 *
 * 刻意模拟真实的两个行为：掩码生效后名字从 `scoped` 消失（所以 carried 必须存在），以及
 * 遮蔽段只由整组关闭产生。
 */
class FakeLayer implements LayerHandle {
  /** 本会话最新整值状态。 */
  private state: SessionToolState

  /** 已生效的 deny（同时是下一轮的 carried）。 */
  private masked: readonly string[] = []

  /** 已生效的遮蔽段服务器。 */
  private sections: readonly string[] = []

  /** `setState` 被调用的次数（断言「没写状态就不动掩码」）。 */
  setStateCalls = 0

  /**
   * @param catalog - 全局层注册名。
   * @param scope - 该 agent **未**被本插件掩码时的视角名字。
   * @param initial - 初始整值状态（构造即应用一次，模拟 `attach`）。
   */
  constructor(
    private readonly catalog: readonly string[],
    private readonly scope: readonly string[],
    initial: SessionToolState,
  ) {
    this.state = initial
    this.reconcile()
  }

  /**
   * 应用新状态。
   * @param state - 新整值状态。
   */
  setState(state: SessionToolState): void {
    this.setStateCalls += 1
    this.state = state
    this.reconcile()
  }

  /**
   * 读已生效的掩码事实。
   * @returns deny / 遮蔽段 / 可见名。
   */
  snapshot(): LayerSnapshot {
    return { deny: this.masked, shadowServers: this.sections, visible: this.visibleNames() }
  }

  /**
   * 读该 agent 视角名字。
   * @returns 未被掩掉的名字。
   */
  visibleNames(): readonly string[] {
    return this.scope.filter((name) => !this.masked.includes(name))
  }

  /** 一轮重算：scoped 读「上一轮掩码之后」的视角，carried 读上一轮 deny。 */
  private reconcile(): void {
    const plan = planMask({
      catalog: this.catalog,
      scoped: this.visibleNames(),
      carried: this.masked,
      disabled: this.state.disabled,
    })
    this.masked = plan.deny
    this.sections = plan.shadowServers
  }
}

/** 假默认档 IO：内存文件表 + 写入记录（可令写入抛错）。 */
class FakeDefaultsIo implements DefaultsIo {
  /** 路径 → 文件文本。 */
  readonly files = new Map<string, string>()

  /** 每次成功写入的载荷。 */
  readonly writes: { readonly path: string; readonly data: string }[] = []

  /** 注入的写入错误（非空时每次写入都抛，文件不变）。 */
  failWrite: Error | undefined

  /**
   * 读文件（缺失即 ENOENT，走生产同一条降级路径）。
   * @param path - 绝对路径。
   * @returns 文件文本。
   */
  async readFile(path: string): Promise<string> {
    const text = this.files.get(path)
    if (text === undefined) {
      const error = new Error(`ENOENT: 假文件系统里没有 ${path}`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return text
  }

  /**
   * 写文件。
   * @param path - 绝对路径。
   * @param data - 完整文件内容。
   */
  async writeFile(path: string, data: string): Promise<void> {
    if (this.failWrite !== undefined) throw this.failWrite
    this.writes.push({ path, data })
    this.files.set(path, data)
  }
}

/** 假端口的构造参数（只写用例关心的部分）。 */
interface HarnessOptions {
  /** 全局层注册名。 */
  readonly catalog?: readonly string[]
  /** 该 agent 未被掩码时的视角名字（默认与 `catalog` 相同）。 */
  readonly scope?: readonly string[]
  /** 本会话关闭集。 */
  readonly disabled?: readonly string[]
  /** 本会话创建时快照。 */
  readonly snapshot?: readonly string[]
  /** 是否已播种（默认 true）。 */
  readonly seeded?: boolean
  /** 默认档初始条目。 */
  readonly defaults?: readonly string[]
  /** 是否提供会话层（默认 true；false 用于层未就绪的降级用例）。 */
  readonly withLayer?: boolean
  /** 注入状态写入错误。 */
  readonly storeWriteError?: Error
  /** 注入默认档写入错误。 */
  readonly defaultsWriteError?: Error
  /** 实际生效的持久化通道（默认 `record`）。 */
  readonly storeKind?: StoreKind
}

/** 一套假端口 + 可断言的记录。 */
interface Harness {
  readonly deps: ToolsCommandDeps
  readonly session: SessionLike
  readonly store: FakeStore
  readonly layer: FakeLayer | undefined
  readonly defaultsIo: FakeDefaultsIo
  readonly log: { readonly log: SpecLog; readonly warnings: string[]; readonly errors: string[] }
}

/**
 * 构造一套假端口。
 * @param options - 只覆盖用例关心的字段。
 * @returns 端口、会话与可断言的记录。
 */
function harness(options: HarnessOptions = {}): Harness {
  const session = fakeSession()
  const catalog = options.catalog ?? []
  const scope = options.scope ?? catalog
  const initial: SessionToolState = {
    version: 1,
    disabled: options.disabled ?? [],
    snapshot: options.snapshot ?? [],
    seeded: options.seeded ?? true,
    updatedAt: CREATED_AT,
  }

  const store = new FakeStore(initial, options.storeKind ?? 'record', options.storeWriteError)
  const layer =
    options.withLayer === false ? undefined : new FakeLayer(catalog, scope, initial)

  const defaultsIo = new FakeDefaultsIo()
  defaultsIo.files.set(
    DEFAULTS_PATH,
    JSON.stringify({ version: 1, disabled: options.defaults ?? [] }),
  )
  defaultsIo.failWrite = options.defaultsWriteError

  const recorded = recordingLog()
  const deps: ToolsCommandDeps = {
    store,
    layerFor: (sessionId) => (layer !== undefined && sessionId === session.id ? layer : undefined),
    defaultsPath: DEFAULTS_PATH,
    defaultsIo,
    protectedNames: new Set(PROTECTED_BASELINE),
    log: recorded.log,
    catalog: () => catalog,
  }

  return { deps, session, store, layer, defaultsIo, log: recorded }
}

/**
 * 执行一条完整命令行走前端（`/tools` 之后的部分作为 `rawInput`，含分隔空白）。
 * @param line - 完整输入行。
 * @param h - 假端口。
 * @returns 命令结果。
 */
async function run(line: string, h: Harness): Promise<CommandResult> {
  return await runToolsCommand(line.slice(COMMAND_PREFIX_LENGTH), h.deps, h.session)
}

/**
 * 取回执文本（成功结果可能不带 `text`，本插件的命令恒带）。
 * @param result - 命令结果。
 * @returns 文本。
 */
function textOf(result: CommandResult): string {
  return result.text ?? ''
}

/**
 * 断言一条输入得到 error 回执，并返回文案。
 * @param line - 完整输入行。
 * @param h - 假端口。
 * @returns 回执文案。
 */
async function expectError(line: string, h: Harness): Promise<string> {
  const result = await run(line, h)
  expect(result.kind).toBe('error')
  return textOf(result)
}

/**
 * 从多行回执里取第一条包含某片段的行。
 * @param text - 回执全文。
 * @param fragment - 片段。
 * @returns 该行。
 */
function lineWith(text: string, fragment: string): string {
  const line = text.split('\n').find((item) => item.includes(fragment))
  expect(line, `回执里应有一行包含「${fragment}」：\n${text}`).toBeDefined()
  return line ?? ''
}

describe('命令定义与输入切分', () => {
  it('toolsCommand 暴露单一命令 tools、文法一行与中文说明', () => {
    const definition = toolsCommand(harness().deps)
    expect(definition.name).toBe('tools')
    expect(definition.input?.hint).toBe(TOOLS_GRAMMAR)
    expect(definition.description).toContain('会话级工具面')
  })

  it('handler 直接吃 rawInput（含分隔空白），不经过任何解析包装', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const definition = toolsCommand(h.deps)
    const invocation = {
      rawInput: '  status',
      agent: { session: h.session },
    } as unknown as CommandInvocation
    const result = await definition.handler(invocation)
    expect(result.kind).toBe('success')
    expect(textOf(result)).toContain('【本会话开关】')
  })

  it('裸 /tools 等价于 status（安全缺省）', async () => {
    const result = await run('/tools', harness())
    expect(result.kind).toBe('success')
    expect(textOf(result)).toContain('【本会话开关】')
  })

  it('子命令动词大小写不敏感（地址仍大小写敏感）', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const result = await run('/tools OFF mcp:a', h)
    expect(result.kind).toBe('success')
    expect(h.store.current.disabled).toEqual(['mcp:a'])
  })

  it('parseToolsInput 四种写子命令与只读形态都解析到预期形状', () => {
    expect(parseToolsInput('')).toEqual({ ok: true, command: { kind: 'status' } })
    expect(parseToolsInput('status')).toEqual({ ok: true, command: { kind: 'status' } })
    expect(parseToolsInput(' off  mcp:a   tool:workflow ')).toEqual({
      ok: true,
      command: { kind: 'toggle', on: false, texts: ['mcp:a', 'tool:workflow'] },
    })
    expect(parseToolsInput('on mcp:a')).toEqual({
      ok: true,
      command: { kind: 'toggle', on: true, texts: ['mcp:a'] },
    })
    expect(parseToolsInput('reset')).toEqual({ ok: true, command: { kind: 'reset' } })
    expect(parseToolsInput('default')).toEqual({
      ok: true,
      command: { kind: 'defaults', mode: 'read', texts: [] },
    })
    expect(parseToolsInput('default set mcp:a')).toEqual({
      ok: true,
      command: { kind: 'defaults', mode: 'set', texts: ['mcp:a'] },
    })
  })
})

describe('文法错误文案（任务 7.1 验证①）', () => {
  it('未知子命令：error 回执带一行文法，且不写状态', async () => {
    const h = harness()
    const text = await expectError('/tools foo', h)
    expect(text).toContain('无法识别的子命令「foo」')
    expect(text).toContain('文法：/tools status | off <地址…>')
    expect(text).toContain('地址文法：mcp:<server>')
    expect(h.store.writes).toHaveLength(0)
  })

  it('off 缺地址：error 回执带文法与可抄示例', async () => {
    const text = await expectError('/tools off', harness())
    expect(text).toContain('off 后面至少需要一个地址')
    expect(text).toContain('/tools off mcp:yunxiao')
    expect(text).toContain('文法：/tools status | off <地址…>')
  })

  it('on 缺地址：同一条缺失路径的对称文案', async () => {
    const text = await expectError('/tools on', harness())
    expect(text).toContain('on 后面至少需要一个地址')
    expect(text).toContain('文法：/tools status | off <地址…>')
  })

  it('status / reset 不接参数', async () => {
    expect(await expectError('/tools status extra', harness())).toContain('status 不接参数')
    expect(await expectError('/tools reset extra', harness())).toContain('reset 不接参数')
  })

  it('default 的未知子命令与缺地址', async () => {
    expect(await expectError('/tools default bogus', harness())).toContain(
      'default 的子命令只支持 off / on / set / reset',
    )
    expect(await expectError('/tools default off', harness())).toContain(
      'default off 后面至少需要一个地址',
    )
    expect(await expectError('/tools default reset mcp:a', harness())).toContain(
      'default reset 不接地址',
    )
  })

  it('tool:mcp__… 用错前缀：error 回执给出等价的 mcp: 写法', async () => {
    const h = harness()
    const text = await expectError('/tools off tool:mcp__yunxiao__get_current_user', h)
    expect(text).toContain('不能用 tool: 前缀')
    expect(text).toContain('mcp:yunxiao::get_current_user')
    expect(text).toContain('文法：')
    expect(h.store.writes).toHaveLength(0)
  })

  it('通配语法只允许尾部 *：中间 * 报 error', async () => {
    const text = await expectError('/tools off mcp:a::x*y', harness())
    expect(text).toContain('只支持完整名与尾部 * 前缀匹配')
    expect(text).toContain('文法：')
  })

  it('全有或全无：一个地址非法就整单拒绝，合法地址也不落状态、不动掩码', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const text = await expectError('/tools off mcp:a nope:x', h)
    expect(text).toContain('地址不合法，未做任何改动')
    expect(text).toContain('文法：')
    expect(h.store.writes).toHaveLength(0)
    expect(h.store.current.disabled).toEqual([])
    expect(h.layer?.setStateCalls).toBe(0)
  })
})

describe('保护名单拒绝（任务 7.1 验证②）', () => {
  it('/tools off tool:bash：error 回执列出保护名单，且不写状态、不动掩码', async () => {
    const h = harness()
    const text = await expectError('/tools off tool:bash', h)
    expect(text).toContain('「bash」在保护名单内')
    expect(text).toContain('保护名单')
    // 名单里其它名字也要在文案里（用户据此判断边界）。
    expect(text).toContain('read')
    expect(text).toContain('文法：')
    expect(h.store.writes).toHaveLength(0)
    expect(h.layer?.setStateCalls).toBe(0)
  })

  it('混合地址里有一个受保护工具：整单拒绝（不部分生效）', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const text = await expectError('/tools off mcp:a tool:bash', h)
    expect(text).toContain('「bash」在保护名单内')
    expect(h.store.current.disabled).toEqual([])
    expect(h.store.writes).toHaveLength(0)
  })

  it('保留名 run_code：error 回执说明注册表保留', async () => {
    const text = await expectError('/tools off tool:run_code', harness())
    expect(text).toContain('run_code')
    expect(text).toContain('保留名')
    expect(text).toContain('文法：')
  })

  it('默认档写入同样受保护名单约束（整单拒绝、文件不动）', async () => {
    const h = harness()
    const text = await expectError('/tools default off tool:bash', h)
    expect(text).toContain('「bash」在保护名单内')
    expect(h.defaultsIo.writes).toHaveLength(0)
  })
})

describe('status 两态与四段（任务 7.1 验证③）', () => {
  it('status 四段齐全：本会话开关 / 默认档（路径 + 快照来源）/ 可关对象 / 保护名单', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const text = textOf(await run('/tools status', h))
    expect(text).toContain('【本会话开关】')
    expect(text).toContain('【默认档】')
    expect(text).toContain('【可关对象】')
    expect(text).toContain('【保护名单】')
    expect(text).toContain(DEFAULTS_PATH)
    expect(text).toContain('快照来源=创建时默认档快照（0 项关闭）')
  })

  it('两态区分：全局层有且本会话关 → 已关闭；从未注册 → 已记录（无匹配）', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
      disabled: ['mcp:a', 'mcp:zzz'],
    })
    const text = textOf(await run('/tools status', h))

    const closedLine = lineWith(text, 'mcp:a 1 个工具定义')
    const intentLine = lineWith(text, 'mcp:zzz 0 个工具定义')
    expect(closedLine).toContain('已关闭')
    expect(intentLine).toContain('已记录：当前无注册工具匹配；服务器上线后自动生效')
    // 两段文案必须不同（这就是「两态」在输出上的唯一区别）。
    expect(closedLine).not.toBe(intentLine)
  })

  it('可关对象按 server 分组计数，并统计「被其他作用域隐藏」（排除本插件已生效掩码）', async () => {
    // mcp:a 是本插件关掉的：掩码生效后 x 从 scoped 消失，但它同时进了 carried，
    // 因此不再算「被其他作用域隐藏」（R18）——否则面板会禁用该行、用户打不开自己关掉的工具。
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const text = textOf(await run('/tools status', h))
    expect(text).toContain('MCP 服务器 2 台（mcp:a 1、mcp:b 1）')
    expect(text).toContain('内置工具 1 个（其中 1 个受保护）')
    expect(text).toContain('被其他作用域隐藏 0 个工具定义（全局层有、本会话不可见）')

    // 真·被别的作用域掩掉的名字（在全局层注册、本视角看不到，且不在本插件掩码里）仍计数。
    const others = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'mcp__c__z', 'bash'],
      scope: ['mcp__a__x', 'mcp__b__y', 'bash'],
    })
    const othersText = textOf(await run('/tools status', others))
    expect(othersText).toContain('被其他作用域隐藏 1 个工具定义（全局层有、本会话不可见）')
  })

  it('空关闭集：报「已关 0 项（全部可见）」且没有关闭条目', async () => {
    const text = textOf(await run('/tools status', harness({ catalog: ['bash'], scope: ['bash'] })))
    expect(text).toContain('【本会话开关】已关 0 项（全部可见）')
    expect(text).not.toContain('已记录：当前无注册工具匹配')
  })

  it('层未就绪：可见数与隐藏计数都降级为「不可用」，命令仍成功', async () => {
    const h = harness({ catalog: ['mcp__a__x'], withLayer: false })
    const result = await run('/tools status', h)
    expect(result.kind).toBe('success')
    const text = textOf(result)
    expect(text).toContain('本会话可见工具 数不可用（会话层未就绪）')
    expect(text).toContain('会话层未就绪：无法读取「被其他作用域隐藏」的计数')
  })

  it('持久化降级到内存态时 status 明说通道', async () => {
    const h = harness({ storeKind: 'memory' })
    const text = textOf(await run('/tools status', h))
    expect(text).toContain('持久化通道：内存（降级：重启或恢复后会丢失本会话的开关）')
  })
})

describe('off / on 回执：计数、整组指令段与缓存提示', () => {
  it('/tools off mcp:a：隐藏计数 + 1 段服务器指令 + 可见数 + 缓存重建提示', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
      scope: ['mcp__a__x', 'mcp__a__y', 'bash'],
    })
    const text = textOf(await run('/tools off mcp:a', h))
    expect(text).toContain('已关闭：mcp:a（隐藏 2 个工具定义 + 1 段服务器指令）')
    expect(text).toContain('本会话可见工具 3 → 1')
    expect(text).toContain('前缀缓存将从第一个变化的 schema token 起重建一次')
    expect(h.store.current.disabled).toEqual(['mcp:a'])
  })

  it('/tools on mcp:a 对称：恢复计数 + 1 段服务器指令 + 同样的缓存提示', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
      scope: ['mcp__a__x', 'mcp__a__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const text = textOf(await run('/tools on mcp:a', h))
    expect(text).toContain('已开启：mcp:a（恢复 2 个工具定义 + 1 段服务器指令）')
    expect(text).toContain('本会话可见工具 1 → 3')
    expect(text).toContain('前缀缓存将从第一个变化的 schema token 起重建一次')
    expect(h.store.current.disabled).toEqual([])
  })

  it('缓存重建提示开/关逐字相同（S5 的对称性）', async () => {
    const offHarness = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const offText = textOf(await run('/tools off mcp:a', offHarness))
    const onHarness = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:a'] })
    const onText = textOf(await run('/tools on mcp:a', onHarness))
    expect(lineWith(offText, '前缀缓存')).toBe(lineWith(onText, '前缀缓存'))
  })

  it('单工具关闭不产生「服务器指令段」（只有整组才遮蔽）', async () => {
    const h = harness({ catalog: ['mcp__a__x', 'mcp__a__y'], scope: ['mcp__a__x', 'mcp__a__y'] })
    const text = textOf(await run('/tools off mcp:a::x', h))
    expect(text).toContain('已关闭：mcp:a::x（隐藏 1 个工具定义）')
    expect(text).not.toContain('段服务器指令')
    expect(h.store.current.disabled).toEqual(['mcp:a::x'])
  })

  it('未知 server：宽容记录（不报错），并说明服务器上线后自动生效', async () => {
    const h = harness({ catalog: ['bash'], scope: ['bash'] })
    const result = await run('/tools off mcp:zzz', h)
    expect(result.kind).toBe('success')
    const text = textOf(result)
    expect(text).toContain('已记录：mcp:zzz（当前无注册工具匹配；服务器上线后自动生效）')
    expect(text).toContain('本会话可见工具 1（无变化）')
    expect(text).toContain('本次没有工具定义进出模型请求：前缀缓存不重建')
    // 意图仍然进关闭集（服务器上线后同一个地址自动生效，C10）。
    expect(h.store.current.disabled).toEqual(['mcp:zzz'])
  })

  it('多地址一次处理：逐条回执 + 只写一次状态', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'workflow'],
      scope: ['mcp__a__x', 'mcp__b__y', 'workflow'],
    })
    const text = textOf(await run('/tools off mcp:a mcp:b tool:workflow', h))
    expect(text).toContain('已关闭：mcp:a（隐藏 1 个工具定义 + 1 段服务器指令）')
    expect(text).toContain('已关闭：mcp:b（隐藏 1 个工具定义 + 1 段服务器指令）')
    expect(text).toContain('已关闭：tool:workflow（隐藏 1 个工具定义）')
    expect(text).toContain('本会话可见工具 3 → 0')
    expect(h.store.writes).toHaveLength(1)
    expect(h.store.current.disabled).toEqual(['mcp:a', 'mcp:b', 'tool:workflow'])
  })

  it('重复关闭同一地址：无变化、不重复写状态', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'], disabled: ['mcp:a'] })
    const text = textOf(await run('/tools off mcp:a', h))
    expect(text).toContain('已关闭：mcp:a（此前已关闭，无变化）')
    expect(text).toContain('本次没有工具定义进出模型请求：前缀缓存不重建')
    expect(h.store.writes).toHaveLength(0)
  })

  it('开启一个本来就没关的地址：说明此前已是开启状态', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const text = textOf(await run('/tools on mcp:a', h))
    expect(text).toContain('已开启：mcp:a（此前已是开启状态，无变化）')
    expect(h.store.writes).toHaveLength(0)
  })

  it('skill 翻转额外提示技能目录替换成本（S13）', async () => {
    const h = harness({ catalog: ['skill', 'bash'], scope: ['skill', 'bash'] })
    const text = textOf(await run('/tools off skill', h))
    expect(text).toContain('已关闭：tool:skill（隐藏 1 个工具定义）')
    expect(text).toContain('技能目录替换消息')
    expect(h.store.current.disabled).toEqual(['tool:skill'])
  })

  it('状态写入失败：命令仍成功，回执补一句降级提示', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      storeWriteError: new Error('模拟的记录通道故障'),
    })
    const result = await run('/tools off mcp:a', h)
    expect(result.kind).toBe('success')
    expect(textOf(result)).toContain('状态未能写入会话日志（已降级内存态')
    expect(h.log.errors.some((message) => message.includes('模拟的记录通道故障'))).toBe(true)
  })

  it('层未就绪时开关仍记录意图，回执说明可见数不可用', async () => {
    const h = harness({ catalog: ['mcp__a__x'], withLayer: false })
    const text = textOf(await run('/tools off mcp:a', h))
    expect(text).toContain('已关闭：mcp:a（隐藏 1 个工具定义 + 1 段服务器指令）')
    expect(text).toContain('本会话层未就绪：可见工具数不可用')
    expect(h.store.current.disabled).toEqual(['mcp:a'])
  })
})

describe('/tools reset：回到创建时快照', () => {
  it('重置到快照：变化项数、快照关闭数、可见工具恢复', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y'],
      scope: ['mcp__a__x', 'mcp__b__y'],
      disabled: ['mcp:a', 'mcp:b'],
      snapshot: ['mcp:a'],
    })
    const text = textOf(await run('/tools reset', h))
    expect(text).toContain('已重置 1 项 → 创建时快照（1 项关闭）')
    expect(text).toContain('本会话可见工具 0 → 1')
    expect(h.store.current.disabled).toEqual(['mcp:a'])
  })

  it('快照为空 = 全部打开（重置后无关闭项）', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      disabled: ['mcp:a'],
      snapshot: [],
    })
    const text = textOf(await run('/tools reset', h))
    expect(text).toContain('已重置 1 项 → 创建时快照（0 项关闭）')
    expect(h.store.current.disabled).toEqual([])
  })

  it('已与快照一致：无变化、不写状态、缓存不重建', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      disabled: ['mcp:a'],
      snapshot: ['mcp:a'],
    })
    const text = textOf(await run('/tools reset', h))
    expect(text).toContain('已重置 0 项 → 创建时快照（1 项关闭）')
    expect(text).toContain('无变化')
    expect(h.store.writes).toHaveLength(0)
  })
})

describe('/tools default：读写默认档（只影响之后新建的会话）', () => {
  it('裸 default 只看：路径 + 条目 + 快照来源 + 「本会话不变」', async () => {
    const h = harness({ defaults: ['mcp:a'] })
    const text = textOf(await run('/tools default', h))
    expect(text).toContain(`【默认档】${DEFAULTS_PATH}（1 项关闭：mcp:a）`)
    expect(text).toContain('快照来源=创建时默认档快照（0 项关闭）')
    expect(text).toContain('对之后新建的会话生效；本会话不变')
    expect(h.defaultsIo.writes).toHaveLength(0)
  })

  it('default off 增量写文件，并明说「本会话不变」', async () => {
    const h = harness()
    const text = textOf(await run('/tools default off mcp:a', h))
    expect(text).toContain('【默认档】已更新（对之后新建的会话生效；本会话不变）')
    expect(text).toContain('新增 1 项、移除 0 项；当前 1 项关闭')
    expect(h.defaultsIo.writes).toHaveLength(1)
    expect(JSON.parse(h.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:a'],
    })
    // 本会话状态一个字都没动（默认档只影响之后新建的会话，Q5-a）。
    expect(h.store.writes).toHaveLength(0)
  })

  it('default on 从文件里移除条目', async () => {
    const h = harness({ defaults: ['mcp:a', 'mcp:b'] })
    const text = textOf(await run('/tools default on mcp:a', h))
    expect(text).toContain('新增 0 项、移除 1 项；当前 1 项关闭')
    expect(JSON.parse(h.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:b'],
    })
  })

  it('default set 整份覆盖', async () => {
    const h = harness({ defaults: ['mcp:a'] })
    const text = textOf(await run('/tools default set mcp:b mcp:c', h))
    expect(text).toContain('已覆盖')
    expect(JSON.parse(h.defaultsIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      disabled: ['mcp:b', 'mcp:c'],
    })
  })

  it('default reset 清空默认档', async () => {
    const h = harness({ defaults: ['mcp:a', 'mcp:b'] })
    const text = textOf(await run('/tools default reset', h))
    expect(text).toContain('已清空')
    expect(text).toContain('当前 0 项关闭')
    expect(text).toContain('（空档）')
    expect(JSON.parse(h.defaultsIo.writes[0]?.data ?? '{}')).toEqual({ version: 1, disabled: [] })
  })

  it('默认档写入失败：error 回执带路径与「本会话不变」，文件不动', async () => {
    const h = harness({ defaultsWriteError: new Error('EACCES: 模拟的权限错误') })
    const text = await expectError('/tools default off mcp:a', h)
    expect(text).toContain('默认档写入失败')
    expect(text).toContain(DEFAULTS_PATH)
    expect(text).toContain('本会话不变')
    expect(h.defaultsIo.writes).toHaveLength(0)
  })
})

describe('控制内核可直接驱动（任务 9.1 的接缝）', () => {
  it('toggleSession：不经文本前端也能拿到完整回执事实', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const outcome = toggleSession(h.deps, h.session, ['mcp:a'], false)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.changed).toBe(true)
    expect(outcome.report.entries).toEqual([
      { text: 'mcp:a', kind: 'mcp-group', matched: 1, wasDisabled: false, changed: true },
    ])
    expect(outcome.report.visibleBefore).toBe(1)
    expect(outcome.report.visibleAfter).toBe(0)
    expect(outcome.report.visibleKnown).toBe(true)
  })

  it('toggleSession：校验失败返回 ok:false，且状态与掩码都没动', () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const outcome = toggleSession(h.deps, h.session, ['tool:bash'], false)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.text).toContain('保护名单')
    expect(h.store.writes).toHaveLength(0)
    expect(h.layer?.setStateCalls).toBe(0)
  })

  it('resetSession：变化项数按对称差算', () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      disabled: ['mcp:a'],
      snapshot: [],
    })
    const report = resetSession(h.deps, h.session)
    expect(report.changed).toBe(true)
    expect(report.changedCount).toBe(1)
    expect(report.state.disabled).toEqual([])
  })

  it('readPanel：三读并集与命中计数一致（catalog / scoped / carried）', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y', 'bash'],
      scope: ['mcp__b__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const reading = await readPanel(h.deps, h.session)
    expect(reading.layerReady).toBe(true)
    expect(reading.catalog).toEqual(['mcp__a__x', 'mcp__b__y', 'bash'])
    expect(reading.scoped).toEqual(['mcp__b__y', 'bash'])
    expect(reading.matched.get('mcp:a')).toBe(1)
    expect(reading.closed).toEqual([
      { text: 'mcp:a', kind: 'mcp-group', matched: 1, shadowed: true },
    ])
    expect(reading.serverGroups).toEqual([
      { server: 'a', address: 'mcp:a', count: 1 },
      { server: 'b', address: 'mcp:b', count: 1 },
    ])
    expect(reading.builtinNames).toEqual(['bash'])
    // mcp__a__x 是本插件关掉且掩码已生效的名字（carried）→ 不算「被其他作用域隐藏」（R18）。
    expect(reading.hiddenByOthers).toEqual([])
    expect(reading.defaults).toEqual({ version: 1, disabled: [] })
  })

  it('updateDefaults：reset 模式不需要地址，且只写文件', async () => {
    const h = harness({ defaults: ['mcp:a'] })
    const outcome = await updateDefaults(h.deps, 'reset', [])
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.before.disabled).toEqual(['mcp:a'])
    expect(outcome.report.after.disabled).toEqual([])
    expect(outcome.report.removed).toEqual(['mcp:a'])
    expect(h.store.writes).toHaveLength(0)
  })
})
