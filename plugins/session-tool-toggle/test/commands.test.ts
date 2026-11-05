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
 *
 * 本变更（H11/T9）新增覆盖：
 *
 * - `/tools workspace` 的只读形态与 `off|on|set|reset` 四种写动作（**只**作用本会话所属
 *   工作区，不提供路径形态；写失败 / 归属失败各自的失败文案）；
 * - `/tools status` 的「技能」段与「工作区默认档」段（含技能服务缺席、工作区无法归属的
 *   两行降级）；
 * - `closedStateText` 的 `skill` 分支（`/name 手动调用保留`）与技能翻转的目录消息成本提示；
 * - 技能收敛的 `await skillsSettled()`（D4：回执在收敛结算之后才返回）；
 * - `TOOLS_GRAMMAR` 的 workspace 子句（H11）。
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
import {
  readPanel,
  resetSession,
  toggleSession,
  updateDefaults,
  updateWorkspaceDefaults,
} from '../src/host/control.ts'
import { planMask } from '../src/host/mask.ts'
import type {
  DefaultsIo,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SkillLayerSnapshot,
  SpecLog,
  StateStore,
  StoreKind,
  WorkspaceAttribution,
} from '../src/host/types.ts'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'

/** 假文件系统里的默认档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 假文件系统里的工作区档绝对路径（与默认档同目录，形状与生产一致）。 */
const WORKSPACES_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/** 假会话所属工作区的规范键（`/tools workspace` 的写入目标）。 */
const WORKSPACE_KEY = '/fake/workspaces/project'

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
 * 刻意模拟真实的三个行为：
 *
 * 1. 掩码生效后名字从 `scoped` 消失（所以 carried 必须存在）；
 * 2. 遮蔽段只由整组关闭产生；
 * 3. **技能影子 stub 的收敛是异步的**（D-4）：`setState` 只把目标影子集记为 pending，
 *    `skillsSettled()` 才让它生效——命令面若没有 `await` 它，回执里的技能事实就是旧的。
 */
class FakeLayer implements LayerHandle {
  /** 本会话最新整值状态。 */
  private state: SessionToolState

  /** 已生效的 deny（同时是下一轮的 carried）。 */
  private masked: readonly string[] = []

  /** 已生效的遮蔽段服务器。 */
  private sections: readonly string[] = []

  /** 已结算的影子 stub 名（`skills()` 的 `shadowed`）。 */
  private settledShadowed: string[] = []

  /** 待结算的影子 stub 名（`undefined` = 无在途收敛）。 */
  private pendingShadowed: string[] | undefined

  /** 可选的收敛闸门（`holdSkills()` 设置）：非空时 `skillsSettled()` 等它释放。 */
  private gate: Promise<void> | undefined

  /** `setState` 被调用的次数（断言「没写状态就不动掩码」）。 */
  setStateCalls = 0

  /** `skillsSettled` 被调用的次数（断言命令面在回执前等待收敛）。 */
  settledCalls = 0

  /**
   * @param catalog - 全局层注册名。
   * @param scope - 该 agent **未**被本插件掩码时的视角名字。
   * @param initial - 初始整值状态（构造即应用一次，模拟 `attach`）。
   * @param skillsAvailable - `skills` 服务是否可用。
   * @param installedSkills - 已安装技能名（模型可调用；影子生效后从 `visible` 消失）。
   */
  constructor(
    private readonly catalog: readonly string[],
    private readonly scope: readonly string[],
    initial: SessionToolState,
    private readonly skillsAvailable: boolean = true,
    private readonly installedSkills: readonly string[] = [],
  ) {
    this.state = initial
    // `attach` 是同步装好初始状态的，构造时就视为已结算。
    this.settledShadowed = this.computeShadowed(initial)
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
    // 技能收敛是异步的：这里只登记目标集合，等 `skillsSettled()` 结算。
    this.pendingShadowed = this.computeShadowed(state)
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

  /**
   * 读本会话的技能分面（已结算的事实）。
   * @returns 影子名 + 模型可调用技能；服务不可用时为空面。
   */
  skills(): SkillLayerSnapshot {
    if (!this.skillsAvailable) return { available: false, shadowed: [], visible: [] }
    return {
      available: true,
      shadowed: [...this.settledShadowed],
      visible: this.installedSkills
        .filter((name) => !this.settledShadowed.includes(name))
        .map((name) => ({ name, description: `技能 ${name}` })),
    }
  }

  /**
   * 等待在途技能收敛结算（无在途时立即 resolve）。
   * @returns 已结算的 Promise。
   */
  async skillsSettled(): Promise<void> {
    this.settledCalls += 1
    const gate = this.gate
    if (gate !== undefined) await gate
    if (this.pendingShadowed !== undefined) {
      this.settledShadowed = this.pendingShadowed
      this.pendingShadowed = undefined
    }
  }

  /**
   * 卡住下一次技能收敛（用例用）。
   * @returns 释放函数（幂等；释放后 `skillsSettled()` 才能结算）。
   */
  holdSkills(): () => void {
    let release = (): void => {}
    this.gate = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    return (): void => {
      this.gate = undefined
      release()
    }
  }

  /**
   * 目标影子集合：服务不可用或整档 `tool:skill` 关闭时为空，否则 = 已关的已安装技能。
   * @param state - 整值状态。
   * @returns 排序后的技能名。
   */
  private computeShadowed(state: SessionToolState): string[] {
    if (!this.skillsAvailable || state.disabled.includes('tool:skill')) return []
    return this.installedSkills
      .filter((name) => state.disabled.includes(`skill:${name}`))
      .sort()
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
  /** 本会话已安装的技能名（模型可调用；默认空）。 */
  readonly skills?: readonly string[]
  /** `skills` 服务是否可用（默认 true；false 用于技能段降级用例）。 */
  readonly skillsAvailable?: boolean
  /** 工作区归属（默认本工作区已登记；`null` = 无法归属 / 未登记目录不可解析）。 */
  readonly workspace?: WorkspaceAttribution | null
  /** 工作区档初始内容（键 → 关闭集；默认本工作区一个空条目）。 */
  readonly workspaces?: Readonly<Record<string, readonly string[]>>
  /** 注入工作区档写入错误。 */
  readonly workspacesWriteError?: Error
}

/** 一套假端口 + 可断言的记录。 */
interface Harness {
  readonly deps: ToolsCommandDeps
  readonly session: SessionLike
  readonly store: FakeStore
  readonly layer: FakeLayer | undefined
  readonly defaultsIo: FakeDefaultsIo
  /** 工作区档端口（与默认档同形，独立实例便于断言写入路径）。 */
  readonly workspacesIo: FakeDefaultsIo
  /** 每次工作区归属查询的会话 id（断言写读链路走的是 session 目标）。 */
  readonly workspaceOfCalls: string[]
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
    options.withLayer === false
      ? undefined
      : new FakeLayer(
          catalog,
          scope,
          initial,
          options.skillsAvailable ?? true,
          options.skills ?? [],
        )

  const defaultsIo = new FakeDefaultsIo()
  defaultsIo.files.set(
    DEFAULTS_PATH,
    JSON.stringify({ version: 1, disabled: options.defaults ?? [] }),
  )
  defaultsIo.failWrite = options.defaultsWriteError

  const workspacesIo = new FakeDefaultsIo()
  const seededWorkspaces: Record<string, { readonly disabled: readonly string[] }> = {}
  for (const [key, disabled] of Object.entries(options.workspaces ?? { [WORKSPACE_KEY]: [] })) {
    seededWorkspaces[key] = { disabled }
  }
  workspacesIo.files.set(
    WORKSPACES_PATH,
    JSON.stringify({ version: 1, workspaces: seededWorkspaces }),
  )
  workspacesIo.failWrite = options.workspacesWriteError
  const attribution: WorkspaceAttribution | undefined =
    options.workspace === null
      ? undefined
      : (options.workspace ?? { key: WORKSPACE_KEY, registered: true })
  const workspaceOfCalls: string[] = []

  const recorded = recordingLog()
  const deps: ToolsCommandDeps = {
    store,
    layerFor: (sessionId) => (layer !== undefined && sessionId === session.id ? layer : undefined),
    defaultsPath: DEFAULTS_PATH,
    defaultsIo,
    protectedNames: new Set(PROTECTED_BASELINE),
    log: recorded.log,
    catalog: () => catalog,
    workspacesPath: WORKSPACES_PATH,
    workspacesIo,
    workspaceOf: async (target): Promise<WorkspaceAttribution | undefined> => {
      workspaceOfCalls.push(target.id)
      return attribution
    },
    workspaceChoices: () => [{ key: WORKSPACE_KEY, title: '假工作区' }],
  }

  return {
    deps,
    session,
    store,
    layer,
    defaultsIo,
    workspacesIo,
    workspaceOfCalls,
    log: recorded,
  }
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

describe('技能翻转：结算等待与目录消息成本（D4 / S13）', () => {
  it('/tools off skill:<name>：等技能收敛后再回执，并提示目录替换成本', async () => {
    const h = harness({
      catalog: ['skill', 'bash'],
      scope: ['skill', 'bash'],
      skills: ['openspec-propose'],
    })
    const text = textOf(await run('/tools off skill:openspec-propose', h))

    expect(text).toContain('已关闭：skill:openspec-propose（模型不可见，/openspec-propose 手动调用保留）')
    expect(text).toContain('技能目录替换消息')
    // 技能翻转的代价由目录消息表达；不要同时声称「缓存不重建」自相矛盾。
    expect(text).not.toContain('前缀缓存不重建')
    expect(text).toContain('本会话可见工具 2（无变化）')
    // D4：回执之前已结算，层读数与状态一致。
    expect(h.layer?.settledCalls).toBe(1)
    expect(h.layer?.skills().shadowed).toEqual(['openspec-propose'])
    expect(h.store.current.disabled).toEqual(['skill:openspec-propose'])
  })

  it('回执被 skillsSettled 挡住：收敛未结算前命令不返回（D4）', async () => {
    const h = harness({ catalog: ['skill'], scope: ['skill'], skills: ['openspec-propose'] })
    const release = h.layer?.holdSkills()
    let returned = false
    const pending = run('/tools off skill:openspec-propose', h).then((result) => {
      returned = true
      return result
    })

    // 已进入等待（收敛被闸门卡住）。
    expect(h.layer?.settledCalls).toBe(1)
    await Promise.resolve()
    expect(returned).toBe(false)

    release?.()
    const result = await pending
    expect(result.kind).toBe('success')
    expect(textOf(result)).toContain('已关闭：skill:openspec-propose')
    expect(h.layer?.skills().shadowed).toEqual(['openspec-propose'])
  })

  it('/tools on skill:<name>：恢复可见并给出同样的目录成本提示', async () => {
    const h = harness({
      catalog: ['skill', 'bash'],
      scope: ['skill', 'bash'],
      disabled: ['skill:openspec-propose'],
      snapshot: ['skill:openspec-propose'],
      skills: ['openspec-propose'],
    })
    const text = textOf(await run('/tools on skill:openspec-propose', h))

    expect(text).toContain('已开启：skill:openspec-propose（已回到模型目录；目录消息重发一次）')
    expect(text).toContain('技能目录替换消息')
    expect(h.layer?.skills().shadowed).toEqual([])
    expect(h.store.current.disabled).toEqual([])
  })

  it('未安装的技能：宽容记录意图，不谎报目录消息成本', async () => {
    const h = harness({ catalog: ['skill'], scope: ['skill'] })
    const text = textOf(await run('/tools off skill:ghost', h))

    expect(text).toContain('已记录：skill:ghost（当前没有这个技能；安装后自动生效）')
    expect(text).not.toContain('技能目录替换消息')
    expect(text).toContain('本次没有工具定义进出模型请求：前缀缓存不重建')
    expect(h.store.current.disabled).toEqual(['skill:ghost'])
  })
})

describe('/tools status：技能段与工作区默认档段（H11）', () => {
  it('两段齐全：技能计数行 + 工作区键/登记态/文件路径', async () => {
    const h = harness({
      catalog: ['skill', 'bash'],
      scope: ['skill', 'bash'],
      // 一个已安装且影子生效 + 一个未安装的意图，覆盖「生效 1，意图 1」两态。
      disabled: ['skill:openspec-propose', 'skill:ghost'],
      skills: ['openspec-propose', 'other'],
      workspaces: { [WORKSPACE_KEY]: ['mcp:a'] },
    })
    const text = textOf(await run('/tools status', h))

    expect(text).toContain('技能：可见 1 / 已关 2（生效 1，意图 1）')
    expect(text).toContain(`工作区默认档（${WORKSPACE_KEY}，已登记）：1 项 · ${WORKSPACES_PATH}`)
    // closedStateText 的 skill 分支（G6 出口断言）：保留 /name 手动调用入口。
    expect(lineWith(text, 'skill:openspec-propose')).toContain(
      '（已关闭，模型不可见；/openspec-propose 手动调用保留）',
    )
    // 未安装的意图不谎报「已关闭」。
    expect(lineWith(text, 'skill:ghost')).toContain(
      '（已记录：当前没有这个技能；安装后自动生效）',
    )
  })

  it('技能服务不可用：技能段降级一行，不谎报数字', async () => {
    const h = harness({ catalog: ['bash'], scope: ['bash'], skillsAvailable: false })
    const text = textOf(await run('/tools status', h))

    expect(text).toContain('技能：不可用（skills 服务未就绪：技能地址只记意图，模型目录不会屏蔽）')
  })

  it('无法归属工作区：工作区段明说降级，不假装空档', async () => {
    const h = harness({ workspace: null })
    const text = textOf(await run('/tools status', h))

    expect(text).toContain(
      '工作区默认档：无法归属本会话所属工作区（cwd 缺失或目录不可解析；本次只用用户级默认档）',
    )
  })

  it('整档 tool:skill 关闭：技能段补一行「目录停发」说明', async () => {
    const h = harness({
      catalog: ['skill'],
      scope: ['skill'],
      disabled: ['tool:skill'],
      skills: ['openspec-propose'],
    })
    const text = textOf(await run('/tools status', h))

    expect(text).toContain(
      '整档 tool:skill 已关闭：技能目录停发，逐技能地址不生效（/<技能名> 手动调用保留）',
    )
  })
})

describe('/tools workspace：文法与只读形态（H11）', () => {
  it('文法分支：裸/status 只读，off/on/set/reset 四种写动作', () => {
    expect(parseToolsInput('workspace')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'read', texts: [] },
    })
    expect(parseToolsInput('workspace status')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'read', texts: [] },
    })
    expect(parseToolsInput('workspace off skill:x')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'off', texts: ['skill:x'] },
    })
    expect(parseToolsInput('workspace on mcp:a mcp:b')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'on', texts: ['mcp:a', 'mcp:b'] },
    })
    expect(parseToolsInput('workspace set mcp:a')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'set', texts: ['mcp:a'] },
    })
    expect(parseToolsInput('workspace reset')).toEqual({
      ok: true,
      command: { kind: 'workspace', mode: 'reset', texts: [] },
    })
    expect(parseToolsInput('workspace status extra').ok).toBe(false)
    expect(parseToolsInput('workspace reset mcp:a').ok).toBe(false)
    expect(parseToolsInput('workspace off').ok).toBe(false)
    expect(parseToolsInput('workspace bogus').ok).toBe(false)
  })

  it('TOOLS_GRAMMAR 含 workspace 子句（G6 出口断言）', () => {
    expect(TOOLS_GRAMMAR).toContain('workspace [status|off|on|set|reset] <地址…>')
  })

  it('文法错误文案带一行文法，且不接受路径形态', async () => {
    const h = harness()
    expect(await expectError('/tools workspace off', h)).toContain(
      'workspace off 后面至少需要一个地址',
    )
    expect(await expectError('/tools workspace reset mcp:a', h)).toContain(
      'workspace reset 不接地址',
    )
    expect(await expectError('/tools workspace status extra', h)).toContain(
      'workspace status 不接参数',
    )
    const unknown = await expectError('/tools workspace bogus', h)
    expect(unknown).toContain('workspace 的子命令只支持 status / off / on / set / reset')
    expect(unknown).toContain('文法：/tools status | off <地址…>')
    // 命令面只作用本会话所属工作区，不提供 --path 形态（设计 §3.8）。
    expect(await expectError('/tools workspace --path /w', h)).toContain('不接受路径参数')
  })

  it('/tools workspace 输出含工作区键与文件路径（G6 出口断言），且只读', async () => {
    const h = harness({ workspaces: { [WORKSPACE_KEY]: ['mcp:a', 'skill:x'] } })
    const text = textOf(await run('/tools workspace', h))

    expect(text).toContain(`【工作区默认档】${WORKSPACE_KEY}（已登记）`)
    expect(text).toContain(`文件：${WORKSPACES_PATH}`)
    expect(text).toContain('当前 2 项关闭（mcp:a、skill:x）')
    expect(text).toContain('只影响之后新建的会话；本会话不变')
    expect(h.workspacesIo.writes).toHaveLength(0)
    expect(h.store.writes).toHaveLength(0)
  })

  it('/tools workspace status 与裸形态同义', async () => {
    const h = harness({ workspaces: { [WORKSPACE_KEY]: ['mcp:a'] } })
    expect(textOf(await run('/tools workspace status', h))).toBe(
      textOf(await run('/tools workspace', h)),
    )
  })

  it('无法归属工作区：只读形态报 workspace-unresolved 同款失败', async () => {
    const h = harness({ workspace: null })
    const text = await expectError('/tools workspace', h)

    expect(text).toContain('workspace-unresolved')
    expect(text).toContain('无法归属本会话（s1）所属工作区')
  })
})

describe('/tools workspace：off/on/set/reset 写读链路（T9）', () => {
  it('off：写本会话所属工作区，回执含「只影响之后新建的会话」，本会话状态零改动', async () => {
    const h = harness()
    const text = textOf(await run('/tools workspace off skill:openspec-propose', h))

    expect(text).toContain('只影响之后新建的会话')
    expect(text).toContain('本会话不变')
    expect(text).toContain(`工作区键：${WORKSPACE_KEY}（skill:openspec-propose）`)
    // 写入参数经假 deps 记录：路径 = 工作区档，内容 = 该键的条目。
    expect(h.workspacesIo.writes).toHaveLength(1)
    expect(h.workspacesIo.writes[0]?.path).toBe(WORKSPACES_PATH)
    expect(JSON.parse(h.workspacesIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      workspaces: { [WORKSPACE_KEY]: { disabled: ['skill:openspec-propose'] } },
    })
    // 目标形态是 session：归属查询被调用一次，且状态/层一个字都没动（不追溯）。
    expect(h.workspaceOfCalls).toEqual(['s1'])
    expect(h.store.writes).toHaveLength(0)
    expect(h.store.current.disabled).toEqual([])
    expect(h.layer?.setStateCalls).toBe(0)
  })

  it('on：从当前工作区条目移除', async () => {
    const h = harness({ workspaces: { [WORKSPACE_KEY]: ['mcp:a', 'skill:x'] } })
    const text = textOf(await run('/tools workspace on mcp:a', h))

    expect(text).toContain('新增 0 项、移除 1 项；当前 1 项关闭')
    expect(JSON.parse(h.workspacesIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      workspaces: { [WORKSPACE_KEY]: { disabled: ['skill:x'] } },
    })
  })

  it('set：整份覆盖该工作区条目', async () => {
    const h = harness({ workspaces: { [WORKSPACE_KEY]: ['mcp:a'] } })
    const text = textOf(await run('/tools workspace set skill:b skill:a', h))

    expect(text).toContain('已覆盖')
    expect(text).toContain('新增 2 项、移除 1 项')
    expect(JSON.parse(h.workspacesIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      workspaces: { [WORKSPACE_KEY]: { disabled: ['skill:a', 'skill:b'] } },
    })
  })

  it('reset：清空该工作区条目（保留键）', async () => {
    const h = harness({ workspaces: { [WORKSPACE_KEY]: ['mcp:a', 'skill:x'] } })
    const text = textOf(await run('/tools workspace reset', h))

    expect(text).toContain('已清空')
    expect(text).toContain('当前 0 项关闭')
    expect(text).toContain('（空档）')
    expect(JSON.parse(h.workspacesIo.writes[0]?.data ?? '{}')).toEqual({
      version: 1,
      workspaces: { [WORKSPACE_KEY]: { disabled: [] } },
    })
  })

  it('写后读：/tools workspace 立即看到新条目（同一文件端口）', async () => {
    const h = harness()
    const receipt = textOf(await run('/tools workspace off skill:x', h))
    expect(receipt).toContain('只影响之后新建的会话')
    const text = textOf(await run('/tools workspace', h))

    expect(text).toContain('当前 1 项关闭（skill:x）')
    expect(text).toContain(`文件：${WORKSPACES_PATH}`)
  })

  it('写失败：error 回执带文件路径与「本会话不变」，文件不动', async () => {
    const h = harness({ workspacesWriteError: new Error('EACCES: 模拟的工作区档权限错误') })
    const text = await expectError('/tools workspace off mcp:a', h)

    expect(text).toContain('工作区默认档写入失败')
    expect(text).toContain(WORKSPACES_PATH)
    expect(text).toContain('本会话不变')
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('无法归属工作区：写形态报 workspace-unresolved 同款失败，不写文件', async () => {
    const h = harness({ workspace: null })
    const text = await expectError('/tools workspace off mcp:a', h)

    expect(text).toContain('workspace-unresolved')
    expect(text).toContain('s1')
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('地址校验与 /tools off 共用内核（保护名单整单拒绝，文件不动）', async () => {
    const h = harness()
    const text = await expectError('/tools workspace off tool:bash', h)

    expect(text).toContain('保护名单')
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('updateWorkspaceDefaults：内核接缝可直接驱动（key / path / added / removed）', async () => {
    const h = harness()
    const outcome = await updateWorkspaceDefaults(
      h.deps,
      { kind: 'session', session: h.session },
      'off',
      ['skill:x'],
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.report.key).toBe(WORKSPACE_KEY)
    expect(outcome.report.path).toBe(WORKSPACES_PATH)
    expect(outcome.report.added).toEqual(['skill:x'])
    expect(outcome.report.removed).toEqual([])
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
