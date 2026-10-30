/**
 * RPC dispatcher 测试（规范：dsh-session-tool-toggle —— 通道的四条成功路径与七条失败码）。
 *
 * 全部用例都在**假 `RpcDeps`** 上驱动，不拉起宿主、不注册通道、不读写真实 `$DSH_HOME`：
 * 状态端口、层句柄、默认档 IO、全局层读数、agent 表与内核都是内存替身，因此「内核有没有被
 * 调用、写了几次状态、文件里落了什么、日志收到了什么」都能直接断言。
 *
 * 任务 9.4 的四条主验证句逐条落地：
 *
 * 1. **未知端点 → `bad-request`**：不猜、不落兜底分支，且内核零调用；
 * 2. **parser 拒绝超长地址（>200）→ `bad-request`**：长度/数量护栏在契约层，`details.issues`
 *    带解析说明；
 * 3. **control 抛 → `internal`**：`store.read` 抛错穿透内核，dispatcher 先 `log.warn` 留原文；
 * 4. **不存在 sessionId → `session-not-live`**：`agents.get` 与 `agent.session.id` 两步对账都
 *    走这条码，且内核零调用。
 *
 * 另按 R17（9.5 前置裁定）与 D19/D20 覆盖：地址预检的三种映射（`protected` 带 `names`、
 * `reserved` 带 `names`、其余 `bad-address` 带 `{address, parseCode}`）与固定优先级、预检失败
 * 时内核零调用、`panel` 快照过 `parsePanelSnapshot`、默认档写失败 → `defaults-unwritable`
 * （`{path, reason}`）、响应自检失败（假内核返回坏形状）→ `internal`、`reset` 的 `applied`
 * 语义（被移除的关闭项）、`defaults` 不返回会话快照、dispatcher 可直接交给
 * `connection.rpc.handle`（一次赋值即编译期断言）。
 */
import { describe, expect, it } from 'vitest'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { parseDefaultsValue, parsePanelSnapshot, parseToggleValue, type PanelSnapshot } from '../src/contract.ts'
import { PROTECTED_BASELINE } from '../src/host/address.ts'
import { readPanel, resetSession, toggleSession, updateDefaults } from '../src/host/control.ts'
import type { ToggleReport } from '../src/host/control.ts'
import { planMask } from '../src/host/mask.ts'
import { createRpcDispatcher } from '../src/host/rpc.ts'
import type { AgentLookup, RpcDeps, RpcKernel } from '../src/host/rpc.ts'
import { EMPTY_STATE } from '../src/host/state.ts'
import type {
  AgentLike,
  DefaultsIo,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
  StoreKind,
} from '../src/host/types.ts'

/** 假文件系统里的默认档绝对路径（形状与生产一致，但不指向任何真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 假会话的创建时间（固定值，让 `panel.createdAt` 可断言）。 */
const CREATED_AT = 1_700_000_000_000

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 真实内核（注入面的缺省值；测试只按需替换其中一个用例）。 */
const REAL_KERNEL: RpcKernel = { toggleSession, resetSession, readPanel, updateDefaults }

/**
 * 收集日志的假出口（与仓内其它套件同形）。
 * @returns 日志端口 + 三类消息数组。
 */
function recordingLog(): { log: SpecLog; infos: string[]; warnings: string[]; errors: string[] } {
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

/**
 * 构造一个最小会话。
 * @param id - 会话 id。
 * @param origin - DSH `SessionHeader.origin` 的来源标记（子代理用例；缺省 = 顶级会话）。
 * @returns 会话（`header.origin` 已由 `types.ts` 的 `SessionLike` 声明，R19 ②）。
 */
function fakeSession(id = SESSION_ID, origin?: 'subagent'): SessionLike {
  const header = origin === undefined
    ? { isSeeded: true, createdAt: CREATED_AT }
    : { isSeeded: true, createdAt: CREATED_AT, origin }
  return {
    id,
    header,
    constructor: Object,
    eventAt: () => undefined,
    snapshotEvents: () => [],
  }
}

/** 假状态端口：整值读写，记录写入尝试（可令读 / 写抛错）。 */
class FakeStore implements StateStore {
  /** 当前整值状态。 */
  current: SessionToolState

  /** 每一次写入**尝试**的次数（含失败）。 */
  writeCalls = 0

  /** 每一次成功写入的载荷（按顺序）。 */
  readonly writes: SessionToolState[] = []

  /**
   * @param initial - 初始整值状态。
   * @param kind - 实际生效通道（默认 `record`）。
   * @param readError - 注入的读取错误（驱动 `internal` 用例）。
   * @param writeError - 注入的写入错误（驱动「降级内存态」用例）。
   */
  constructor(
    initial: SessionToolState,
    readonly kind: StoreKind = 'record',
    private readonly readError: Error | undefined = undefined,
    private readonly writeError: Error | undefined = undefined,
  ) {
    this.current = initial
  }

  /**
   * 读当前状态。
   * @returns 整值状态（同一引用）。
   */
  read(): SessionToolState {
    if (this.readError !== undefined) throw this.readError
    return this.current
  }

  /**
   * 写整值状态。
   * @param _session - 目标会话（假实现忽略）。
   * @param state - 新状态。
   */
  write(_session: SessionLike, state: SessionToolState): void {
    this.writeCalls += 1
    if (this.writeError !== undefined) throw this.writeError
    this.writes.push(state)
    this.current = state
  }
}

/**
 * 假层句柄：按 `planMask` 的三读并集重算掩码（与生产层同构：掩码生效后名字从 `scoped`
 * 消失，因此 `carried` 必须参与并集，否则第二读会缩水）。
 */
class FakeLayer implements LayerHandle {
  /** 已生效的 deny（同时是下一轮的 carried）。 */
  private masked: readonly string[] = []

  /** 已生效的遮蔽段服务器。 */
  private sections: readonly string[] = []

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
    this.reconcile(initial)
  }

  /**
   * 应用新状态。
   * @param state - 新整值状态。
   */
  setState(state: SessionToolState): void {
    this.reconcile(state)
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
   * 一轮重算。
   * @param state - 当前整值状态。
   */
  private reconcile(state: SessionToolState): void {
    const plan = planMask({
      catalog: this.catalog,
      scoped: this.visibleNames(),
      carried: this.masked,
      disabled: state.disabled,
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

/**
 * 带调用计数的内核：预检 / 寻址失败时「内核未被调用」只能这样断言。
 * @returns 计数内核 + 读取计数的函数。
 */
function countingKernel(): { readonly kernel: RpcKernel; readonly calls: () => number } {
  let calls = 0
  return {
    kernel: {
      toggleSession: (...args) => {
        calls += 1
        return toggleSession(...args)
      },
      resetSession: (...args) => {
        calls += 1
        return resetSession(...args)
      },
      readPanel: (...args) => {
        calls += 1
        return readPanel(...args)
      },
      updateDefaults: (...args) => {
        calls += 1
        return updateDefaults(...args)
      },
    },
    calls: () => calls,
  }
}

/**
 * 故意不合契约的 toggle 回执：`applied[].address` 必须是字符串，这里塞数字。
 *
 * 响应自检的负路径在真实内核上不可构造，只能由假内核产出坏形状（生产代码不会这么做）。
 */
const BAD_TOGGLE_REPORT = {
  entries: [{ text: 42, kind: 'mcp-group', matched: 0, wasDisabled: false, changed: true }],
  changed: true,
  schemaChanged: true,
  visibleBefore: 0,
  visibleAfter: 0,
  visibleKnown: true,
  state: EMPTY_STATE,
  persistFailed: false,
  layerFailed: false,
} as unknown as ToggleReport

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
  /** 默认档条目；`null` = 文件不存在（走 `readDefaults` 的空档降级）。 */
  readonly defaults?: readonly string[] | null
  /** 默认档原始文本（损坏 / 半写用例；给了就不看 `defaults`）。 */
  readonly defaultsText?: string
  /** 实际生效的持久化通道（默认 `record`）。 */
  readonly storeKind?: StoreKind
  /** 是否提供会话层（默认 true；false 用于层未就绪的降级用例）。 */
  readonly withLayer?: boolean
  /** 注入状态读取错误（驱动「control 抛 → internal」）。 */
  readonly storeReadError?: Error
  /** 注入状态写入错误（驱动「已降级内存态」提示码）。 */
  readonly storeWriteError?: Error
  /** 注入默认档写入错误（驱动 `defaults-unwritable`）。 */
  readonly defaultsWriteError?: Error
  /** agent 表行为：`live`（缺省，命中 SESSION_ID）/ `absent` / `mismatched`（拿到别的会话）。 */
  readonly agent?: 'live' | 'absent' | 'mismatched'
  /** 注入 `agents.get` 抛错。 */
  readonly agentsError?: Error
  /** 会话 header 的来源标记（子代理用例）。 */
  readonly origin?: 'subagent'
  /** 假内核（缺省真实内核）。 */
  readonly kernel?: RpcKernel
  /** 工具描述读数。 */
  readonly descriptions?: ReadonlyMap<string, string>
  /** 注入描述读数抛错（描述只是展示增强，读不到应降级而非失败）。 */
  readonly descriptionsError?: Error
}

/** 一套假端口 + 可断言的记录。 */
interface Harness {
  readonly deps: RpcDeps
  readonly session: SessionLike
  readonly store: FakeStore
  readonly layer: FakeLayer | undefined
  readonly defaultsIo: FakeDefaultsIo
  readonly log: { readonly log: SpecLog; readonly warnings: string[]; readonly errors: string[] }
  readonly dispatch: ReturnType<typeof createRpcDispatcher>
}

/**
 * 构造一套假端口。
 * @param options - 只覆盖用例关心的字段。
 * @returns 端口、会话与可断言的记录（`dispatch` 已按 deps 构造好）。
 */
function harness(options: HarnessOptions = {}): Harness {
  const session = fakeSession(SESSION_ID, options.origin)
  const catalog = options.catalog ?? []
  const scope = options.scope ?? catalog
  const initial: SessionToolState = {
    version: 1,
    disabled: options.disabled ?? [],
    snapshot: options.snapshot ?? [],
    seeded: true,
    updatedAt: CREATED_AT,
  }

  const store = new FakeStore(initial, options.storeKind ?? 'record', options.storeReadError, options.storeWriteError)
  const layer = options.withLayer === false ? undefined : new FakeLayer(catalog, scope, initial)

  const defaultsIo = new FakeDefaultsIo()
  if (options.defaultsText !== undefined) defaultsIo.files.set(DEFAULTS_PATH, options.defaultsText)
  else if (options.defaults !== null) {
    defaultsIo.files.set(DEFAULTS_PATH, JSON.stringify({ version: 1, disabled: options.defaults ?? [] }))
  }
  defaultsIo.failWrite = options.defaultsWriteError

  const described = options.descriptions
  const agents: AgentLookup = {
    get: (sessionId) => {
      if (options.agentsError !== undefined) throw options.agentsError
      if (options.agent === 'absent') return undefined
      // `mismatched`：键能找到，但拿到的 agent 属于别的会话（身份对账的负路径）。
      const held = options.agent === 'mismatched' ? fakeSession('other-session') : session
      if (held.id !== sessionId) return undefined
      const agent: AgentLike = { session: held, ctx: undefined }
      return agent
    },
  }

  const recorded = recordingLog()
  const deps: RpcDeps = {
    store,
    layerFor: (sessionId) => (layer !== undefined && sessionId === session.id ? layer : undefined),
    defaultsPath: DEFAULTS_PATH,
    defaultsIo,
    protectedNames: new Set(PROTECTED_BASELINE),
    catalog: () => catalog,
    log: recorded.log,
    agents,
    ...(options.kernel === undefined ? {} : { kernel: options.kernel }),
    ...(described === undefined
      ? {}
      : {
          descriptions: () => {
            if (options.descriptionsError !== undefined) throw options.descriptionsError
            return described
          },
        }),
  }

  return {
    deps,
    session,
    store,
    layer,
    defaultsIo,
    log: recorded,
    dispatch: createRpcDispatcher(deps),
  }
}

/**
 * 取失败信封（成功即断言失败，让后续断言不必逐处收窄）。
 * @param result - dispatcher 的结果。
 * @returns 失败信封。
 */
function failureOf(result: Awaited<ReturnType<Harness['dispatch']>>): {
  readonly code: string
  readonly message: string
  readonly details: unknown
} {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('期望失败信封，实际拿到 ok:true')
  return result.error
}

/**
 * 取 `panel` 的成功值并过一遍响应 parser。
 *
 * dispatcher 的返回信封是 `RpcEnvelope<unknown>`（端点形状由调用方按端点解析），因此单测
 * 这一侧也必须先解析——顺手等于把「panel 快照过 parser」多验几次。
 * @param result - dispatcher 的结果。
 * @returns 面板快照。
 */
function panelOf(result: Awaited<ReturnType<Harness['dispatch']>>): PanelSnapshot {
  if (!result.ok) throw new Error(result.error.message)
  const parsed = parsePanelSnapshot(result.value)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.value
}

describe('端点判定与请求 parser', () => {
  it('未知端点 → bad-request（details 为空、内核零调用）', async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel })
    const error = failureOf(await h.dispatch('nope', { sessionId: SESSION_ID }))

    expect(error.code).toBe('bad-request')
    expect(error.details).toEqual({})
    expect(error.message).toContain('未知端点')
    expect(counted.calls()).toBe(0)
  })

  it('请求 parser 拒绝超长地址（>200 字符）→ bad-request，details.issues 带说明', async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel })
    const longAddress = `mcp:${'x'.repeat(220)}`
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: [longAddress] }),
    )

    expect(error.code).toBe('bad-request')
    expect(error.details).toMatchObject({ issues: expect.any(String) })
    expect((error.details as { issues: string }).issues.length).toBeGreaterThan(0)
    expect(counted.calls()).toBe(0)
    expect(h.store.writeCalls).toBe(0)
  })

  it('请求 parser 拒绝空地址数组与超量地址（>64）→ bad-request', async () => {
    const h = harness()
    for (const addresses of [[], Array.from({ length: 65 }, (_unused, index) => `mcp:s${String(index)}`)]) {
      const error = failureOf(
        await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses }),
      )
      expect(error.code).toBe('bad-request')
    }
  })

  it('strict：多一个字段 / 缺字段 / 类型不对都是 bad-request', async () => {
    const h = harness()
    const payloads: unknown[] = [
      { sessionId: SESSION_ID, extra: true },
      { sessionId: '' },
      { sessionId: 42 },
      { sessionId: SESSION_ID, on: 'no', addresses: ['mcp:a'] },
    ]
    for (const payload of payloads) {
      expect(failureOf(await h.dispatch('toggle', payload)).code).toBe('bad-request')
    }
    // defaults 的 superRefine：未知 action、reset 带 addresses、非 reset 缺 addresses。
    for (const payload of [
      { action: 'bogus' },
      { action: 'reset', addresses: ['mcp:a'] },
      { action: 'off' },
      { action: 'off', addresses: [] },
    ]) {
      expect(failureOf(await h.dispatch('defaults', payload)).code).toBe('bad-request')
    }
  })
})

describe('sessionId 三步校验（agents.get + session.id 对账）', () => {
  it('不存在的 sessionId → session-not-live，details 带 sessionId，内核零调用', async () => {
    const counted = countingKernel()
    const h = harness({ catalog: ['mcp__a__x'], kernel: counted.kernel, agent: 'absent' })
    const error = failureOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(error.code).toBe('session-not-live')
    expect(error.details).toEqual({ sessionId: SESSION_ID })
    expect(counted.calls()).toBe(0)
  })

  it('agent.session.id 与请求不一致 → 同样判 session-not-live', async () => {
    const counted = countingKernel()
    const h = harness({ catalog: ['mcp__a__x'], kernel: counted.kernel, agent: 'mismatched' })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] }),
    )

    expect(error.code).toBe('session-not-live')
    expect(error.details).toEqual({ sessionId: SESSION_ID })
    expect(counted.calls()).toBe(0)
    expect(h.store.writeCalls).toBe(0)
  })

  it('reset 端点同样先过会话校验（不存在的会话不写状态）', async () => {
    const h = harness({ agent: 'absent' })
    expect(failureOf(await h.dispatch('reset', { sessionId: SESSION_ID })).code).toBe('session-not-live')
    expect(h.store.writeCalls).toBe(0)
  })

  it('agents.get 抛错 → internal（先 warn 留原文）', async () => {
    const h = harness({ catalog: ['mcp__a__x'], agentsError: new Error('agent 表炸了') })
    const error = failureOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(error.code).toBe('internal')
    expect(h.log.warnings.join('\n')).toContain('agent 表炸了')
  })
})

describe('地址预检（R17：结构化失败码由 dispatcher 产出）', () => {
  it('tool:bash → protected，details.names=[bash]，内核零调用', async () => {
    const counted = countingKernel()
    const h = harness({ catalog: ['bash'], kernel: counted.kernel })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['tool:bash'] }),
    )

    expect(error.code).toBe('protected')
    expect(error.details).toEqual({ names: ['bash'] })
    expect(counted.calls()).toBe(0)
    expect(h.store.writeCalls).toBe(0)
  })

  it('tool:run_code → reserved，details.names=[run_code]', async () => {
    const counted = countingKernel()
    const h = harness({ catalog: ['run_code'], kernel: counted.kernel })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['tool:run_code'] }),
    )

    expect(error.code).toBe('reserved')
    expect(error.details).toEqual({ names: ['run_code'] })
    expect(counted.calls()).toBe(0)
  })

  it('nope:x → bad-address，details 带原文与 parseCode', async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['nope:x'] }),
    )

    expect(error.code).toBe('bad-address')
    expect(error.details).toEqual({ address: 'nope:x', parseCode: 'unknown-prefix' })
    expect(counted.calls()).toBe(0)
  })

  it('全有或全无：一条不合法就整单拒绝，合法地址也不生效', async () => {
    const h = harness({ catalog: ['mcp__a__x'] })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a', 'tool:bash'] }),
    )

    expect(error.code).toBe('protected')
    expect(h.store.writeCalls).toBe(0)
    expect(h.layer?.snapshot().deny).toEqual([])
  })

  it('码的优先级固定为 保护 > 保留名 > 文法（与书写顺序无关）', async () => {
    const h = harness()
    // 同一批地址倒过来写，码不变：先命中保护名。
    expect(
      failureOf(await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['nope:x', 'tool:bash'] }))
        .code,
    ).toBe('protected')
    // 没有保护名时保留名优先于文法错。
    expect(
      failureOf(
        await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['nope:x', 'tool:run_code'] }),
      ).code,
    ).toBe('reserved')
  })

  it('defaults 端点的地址同样预检：tool:bash → protected，且默认档文件不动', async () => {
    const h = harness()
    const before = h.defaultsIo.files.get(DEFAULTS_PATH)
    const error = failureOf(await h.dispatch('defaults', { action: 'off', addresses: ['tool:bash'] }))

    expect(error.code).toBe('protected')
    expect(h.defaultsIo.writes).toHaveLength(0)
    expect(h.defaultsIo.files.get(DEFAULTS_PATH)).toBe(before)
  })
})

describe('panel：只读快照', () => {
  it('成功值过 parsePanelSnapshot，读数与假层一致', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__a__y', 'bash'],
      scope: ['mcp__a__x', 'mcp__a__y', 'bash'],
      disabled: ['mcp:a'],
    })
    const result = await h.dispatch('panel', { sessionId: SESSION_ID })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = parsePanelSnapshot(result.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.sessionId).toBe(SESSION_ID)
    expect(parsed.value.createdAt).toBe(CREATED_AT)
    expect(parsed.value.state.disabled).toEqual(['mcp:a'])
    // R18 口径：x / y 是本插件关掉且掩码已生效的名字（carried）→ 不算「被其他作用域隐藏」，
    // 所以 shadowed = 0（此前按 `catalog \ scoped` 会算成 2）。
    expect(parsed.value.stats).toEqual({ visible: 1, catalog: 3, denied: 2, shadowed: 0 })
    expect(parsed.value.groups.map((group) => group.key)).toEqual(['a', 'builtin'])
    expect(parsed.value.defaults).toEqual({
      version: 1,
      disabled: [],
      path: DEFAULTS_PATH,
      readable: true,
      corrupt: false,
    })
    // 关闭集里命中 0 的地址才进 intentOnly；`mcp:a` 命中 2，因此为空。
    expect(parsed.value.intentOnly).toEqual([])
  })

  it('默认档文件不存在：readable=false / corrupt=false（按空档处理，不是损坏）', async () => {
    const h = harness({ catalog: ['bash'], defaults: null })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(snapshot.defaults).toMatchObject({ readable: false, corrupt: false })
    expect(snapshot.notices).toEqual([])
    // 读路径照旧 warn 一次（R14 ②：默认档缺失也要 warn）。
    expect(h.log.warnings.join('\n')).toContain('默认档不可读')
  })

  it('默认档损坏：readable=true / corrupt=true，提示码里带 defaults-corrupt', async () => {
    const h = harness({ catalog: ['bash'], defaultsText: '{ "version": 1, "disabled": [' })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(snapshot.defaults).toMatchObject({ readable: true, corrupt: true })
    expect(snapshot.notices).toEqual(['defaults-corrupt'])
  })

  it('持久化降级（storeKind=memory）→ 提示码由构建器自动补 persistence-degraded', async () => {
    const h = harness({ catalog: ['bash'], storeKind: 'memory' })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))
    expect(snapshot.state.storeKind).toBe('memory')
    expect(snapshot.notices).toEqual(['persistence-degraded'])
  })

  it('子代理会话 → 提示码里带 session-subagent', async () => {
    const h = harness({ catalog: ['bash'], origin: 'subagent' })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))
    expect(snapshot.notices).toEqual(['session-subagent'])
  })

  it('描述读数接上时条目带 description；读数抛错只降级、不失败', async () => {
    const withDescription = harness({
      catalog: ['mcp__a__x'],
      descriptions: new Map([['mcp__a__x', '读取页面内容']]),
    })
    const described = panelOf(await withDescription.dispatch('panel', { sessionId: SESSION_ID }))
    expect(described.groups[0]?.tools[0]?.description).toBe('读取页面内容')

    const broken = harness({
      catalog: ['mcp__a__x'],
      descriptions: new Map(),
      descriptionsError: new Error('描述读数炸了'),
    })
    const degraded = await broken.dispatch('panel', { sessionId: SESSION_ID })
    expect(degraded.ok).toBe(true)
    expect(broken.log.warnings.join('\n')).toContain('描述读数炸了')
  })
})

describe('toggle：批量开关', () => {
  it('成功：mutation 逐地址回执 + kvRebuild，快照反映新关闭集', async () => {
    const h = harness({ catalog: ['mcp__a__x', 'mcp__a__y'], scope: ['mcp__a__x', 'mcp__a__y'] })
    const result = await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.mutation).toEqual({
      applied: [{ address: 'mcp:a', on: false, matched: 2 }],
      hiddenTools: 2,
      visibleBefore: 2,
      visibleAfter: 0,
      kvRebuild: true,
      notices: [],
    })
    expect(parsed.value.snapshot.state.disabled).toEqual(['mcp:a'])
    expect(parsed.value.snapshot.stats.visible).toBe(0)
    expect(h.store.writeCalls).toBe(1)
  })

  it('0 匹配地址：仍进关闭集、matched:0，但 kvRebuild 为 false（宽容语义）', async () => {
    const h = harness({ catalog: ['mcp__a__x'], scope: ['mcp__a__x'] })
    const result = await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:zzz'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.mutation.applied).toEqual([{ address: 'mcp:zzz', on: false, matched: 0 }])
    expect(parsed.value.mutation.kvRebuild).toBe(false)
    expect(parsed.value.mutation.hiddenTools).toBe(0)
    expect(parsed.value.snapshot.state.disabled).toEqual(['mcp:zzz'])
    expect(parsed.value.snapshot.intentOnly).toEqual(['mcp:zzz'])
  })

  it('开启方向：applied[].on 跟请求走，关闭集移出该地址', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      disabled: ['mcp:a'],
      snapshot: ['mcp:a'],
    })
    const result = await h.dispatch('toggle', { sessionId: SESSION_ID, on: true, addresses: ['mcp:a'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.mutation.applied[0]).toEqual({ address: 'mcp:a', on: true, matched: 1 })
    expect(parsed.value.mutation.hiddenTools).toBe(-1)
    expect(parsed.value.snapshot.state.disabled).toEqual([])
  })

  it('状态写日志失败：仍算成功，但回执带 persistence-degraded', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      scope: ['mcp__a__x'],
      storeWriteError: new Error('日志写入失败'),
    })
    const result = await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.mutation.notices).toEqual(['persistence-degraded'])
    expect(h.log.errors.join('\n')).toContain('日志写入失败')
  })
})

describe('reset：回创建时快照', () => {
  it('applied = 被移除的关闭项（on 恒为 true，matched 来自变更前读数）', async () => {
    const h = harness({
      catalog: ['mcp__a__x', 'mcp__b__y'],
      disabled: ['mcp:a'],
      snapshot: [],
    })
    const result = await h.dispatch('reset', { sessionId: SESSION_ID })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.mutation).toEqual({
      applied: [{ address: 'mcp:a', on: true, matched: 1 }],
      hiddenTools: -1,
      visibleBefore: 1,
      visibleAfter: 2,
      kvRebuild: true,
      notices: [],
    })
    expect(parsed.value.snapshot.state.disabled).toEqual([])
    expect(h.store.writeCalls).toBe(1)
  })

  it('无变化：applied 为空、kvRebuild=false、不写状态', async () => {
    const h = harness({ catalog: ['mcp__a__x'], disabled: ['mcp:a'], snapshot: ['mcp:a'] })
    const result = await h.dispatch('reset', { sessionId: SESSION_ID })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.mutation.applied).toEqual([])
    expect(parsed.value.mutation.kvRebuild).toBe(false)
    expect(parsed.value.mutation.hiddenTools).toBe(0)
    expect(h.store.writeCalls).toBe(0)
  })
})

describe('defaults：默认档写（不返回会话快照）', () => {
  it('成功：默认档视图 + changed，文件落盘，且响应里没有 snapshot', async () => {
    const h = harness({ defaults: ['mcp:b'] })
    const result = await h.dispatch('defaults', { action: 'off', addresses: ['mcp:a'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseDefaultsValue(result.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.defaults).toEqual({
      version: 1,
      disabled: ['mcp:a', 'mcp:b'],
      path: DEFAULTS_PATH,
      readable: true,
      corrupt: false,
    })
    expect(parsed.value.changed).toEqual(['mcp:a', 'mcp:b'])
    // §2.2 表末行：defaults 不回会话快照（默认档不追溯，返回反而误导）。
    expect(Object.keys(result.value as Record<string, unknown>)).not.toContain('snapshot')
    expect(h.defaultsIo.writes).toHaveLength(1)
  })

  it('reset：整份清空（不带 addresses），文件变成空关闭集', async () => {
    const h = harness({ defaults: ['mcp:a'] })
    const result = await h.dispatch('defaults', { action: 'reset' })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseDefaultsValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.defaults.disabled).toEqual([])
    expect(parsed.value.changed).toEqual([])
  })

  it('不寻址会话：agent 不存在也照常写入（请求体里没有 sessionId）', async () => {
    const h = harness({ agent: 'absent' })
    const result = await h.dispatch('defaults', { action: 'off', addresses: ['mcp:a'] })
    expect(result.ok).toBe(true)
  })

  it('写盘失败 → defaults-unwritable，details 带 {path, reason}', async () => {
    const h = harness({ defaultsWriteError: new Error('EACCES: 目录不可写') })
    const before = h.defaultsIo.files.get(DEFAULTS_PATH)
    const error = failureOf(await h.dispatch('defaults', { action: 'off', addresses: ['mcp:a'] }))

    expect(error.code).toBe('defaults-unwritable')
    expect(error.details).toEqual({ path: DEFAULTS_PATH, reason: 'EACCES: 目录不可写' })
    expect(error.message).toContain(DEFAULTS_PATH)
    // 写失败时文件一个字节都不动。
    expect(h.defaultsIo.files.get(DEFAULTS_PATH)).toBe(before)
  })
})

describe('抛错与响应自检都归 internal', () => {
  it('control 抛错 → internal，details 为空，日志收到错误原文', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      storeReadError: new Error('状态端口炸了'),
    })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] }),
    )

    expect(error.code).toBe('internal')
    expect(error.details).toEqual({})
    expect(h.log.warnings.join('\n')).toContain('状态端口炸了')
    expect(h.store.writeCalls).toBe(0)
  })

  it('响应自检失败（假内核返回坏形状）→ internal，日志标明是宿主产出问题', async () => {
    const h = harness({
      catalog: ['mcp__a__x'],
      kernel: { ...REAL_KERNEL, toggleSession: () => ({ ok: true, report: BAD_TOGGLE_REPORT }) },
    })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] }),
    )

    expect(error.code).toBe('internal')
    expect(error.message).toContain('响应自检失败')
    expect(h.log.warnings.some((line) => line.includes('响应自检失败'))).toBe(true)
  })

  it('内核业务拒绝（预检未覆盖的路径）按 bad-request 出网并带原文', async () => {
    const h = harness({
      kernel: {
        ...REAL_KERNEL,
        toggleSession: () => ({ ok: false, text: '地址不合法，未做任何改动（1 条不合法）' }),
      },
    })
    const error = failureOf(
      await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] }),
    )

    expect(error.code).toBe('bad-request')
    expect(error.details).toEqual({ issues: '地址不合法，未做任何改动（1 条不合法）' })
  })
})

describe('与 connection.rpc.handle 的形状对应', () => {
  it('dispatcher 可直接赋给 ConnectionRpcHandler（编译期断言 + 运行时是函数）', () => {
    const h = harness()
    // 赋值即断言：参数少两个（signal / peer 由传输层给）与信封形状都必须兼容。
    const handler: ConnectionRpcHandler = h.dispatch
    expect(typeof handler).toBe('function')
  })
})
