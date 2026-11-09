/**
 * RPC dispatcher 测试（规范：dsh-session-tool-toggle —— 通道的四条成功路径与九条失败码）。
 *
 * 全部用例都在**假 `RpcDeps`** 上驱动，不拉起宿主、不注册通道、不读写真实 `$DSH_HOME`：
 * 状态端口、层句柄（掩码 / 技能 / 工具描述投影）、工作区档 IO、agent 表、工作区归属
 * 与内核都是内存替身，因此「内核有没有被调用、写了几次状态、文件里落了什么、日志收到了什么」
 * 都能直接断言。工具描述没有独立注入面：它只从本会话层（`layer.visibleSchemas()`）读。
 *
 * 任务 9.4 的四条主验证句逐条落地：
 *
 * 1. **未知端点 → `bad-request`**：不猜、不落兜底分支，且内核零调用（`defaults` 端点已随
 *    面板收缩删除，同名派发落进同一条「未知端点」路径）；
 * 2. **parser 拒绝超长地址（>200）→ `bad-request`**：长度/数量护栏在契约层，`details.issues`
 *    带解析说明；
 * 3. **control 抛 → `internal`**：`store.read` 抛错穿透内核，dispatcher 先 `log.warn` 留原文；
 * 4. **不存在 sessionId → `session-not-live`**：`agents.get` 与 `agent.session.id` 两步对账都
 *    走这条码，且内核零调用。
 *
 * 另按 R17（9.5 前置裁定）与 D19/D20 覆盖：地址预检的三种映射（`protected` 带 `names`、
 * `reserved` 带 `names`、其余 `bad-address` 带 `{address, parseCode}`）与固定优先级、预检失败
 * 时内核零调用、`panel` 快照过 `parsePanelSnapshot`、响应自检失败（假内核返回坏形状）→
 * `internal`、`reset` 的 `applied` 语义（被移除的关闭项）、dispatcher 可直接交给
 * `connection.rpc.handle`（一次赋值即编译期断言）。
 *
 * 组 6.3（T10）与 P-1=b 收缩后的验证面：
 *
 * - `workspace` 端点只按 `{workspacePath}` 寻址（5 动作）；`{sessionId}` 形态在请求 parser
 *   就被 strict 规则按未知字段拒绝（`bad-request`），到不了任何内核与归属解析；
 * - `{workspacePath:'/etc'}` 未登记 → `workspace-unresolved`；写盘抛错 → `workspace-unwritable`
 *   （`{path, reason}`，文件不变）；
 * - H10：`toggle` 在组装成功值**之前** `await layer.skillsSettled()`（闸未开时 dispatch 不结算），
 *   回执 `hiddenSkills` 与快照技能行都是收敛后的事实。
 *
 * 组 7.3（T7）与变更 improve-workspace-defaults-page（任务 3.3）追加的验证面：
 *
 * - `{workspacePath}` 的读 / 写响应都带该工作区宇宙（G7 / D-24：客户端写后用响应整份替换）：
 *   假端口 `readWorkspaceUniverse` 默认返回固定宇宙并记录每次收到的规范 key（断言它是工作区
 *   规范路径本身，不是请求原文的变体）；
 * - 端口抛错不让整次 workspace 读失败：档照常返回，宇宙降级为空宇宙（`layerReady:false`）
 *   + warn（带错误原文）。
 *
 * **内核与 `defaultsPath`**（R1(c) / `rpc.ts` 的 `kernelDepsOf` JSDoc）：`RpcDeps` 已把
 * `defaultsIo` / `defaultsPath` 两字段从类型面上收缩（RPC 自身不读默认档），本套件的夹具
 * 因此**不带**两字段；但真实内核（`control.ts`）的 `readPanel` 签名仍要求完整 `ControlDeps`。
 * 套件据此注入一个「补字段内核」：在内核边界把两字段补回依赖视图再转发真实函数——保证
 * `readPanel` 永不触到 `undefined` 路径，`RpcDeps` 类型面与运行时形状同时干净。
 */
import { describe, expect, it } from 'vitest'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import {
  parsePanelSnapshot,
  parseToggleValue,
  parseWorkspaceValue,
  type DefaultsUniverse,
  type PanelSnapshot,
  type WorkspaceValue,
} from '../src/contract.ts'
import { PROTECTED_BASELINE, parseAddress } from '../src/host/address.ts'
import {
  readPanel,
  resetSession,
  toggleSession,
  updateWorkspaceDefaults,
} from '../src/host/control.ts'
import type { ToggleReport } from '../src/host/control.ts'
import { planMask } from '../src/host/mask.ts'
import { createRpcDispatcher } from '../src/host/rpc.ts'
import type { AgentLookup, RpcDeps, RpcKernel } from '../src/host/rpc.ts'
import { EMPTY_STATE } from '../src/host/state.ts'
import type {
  AgentLike,
  ControlDeps,
  DefaultsIo,
  LayerHandle,
  LayerSnapshot,
  SessionLike,
  SessionToolState,
  SkillLayerSnapshot,
  SpecLog,
  StateStore,
  StoreKind,
  VisibleToolSchema,
  WorkspaceAttribution,
} from '../src/host/types.ts'

/** 假文件系统里的默认档绝对路径（只供补字段内核使用；RPC 依赖面自身不再携带它）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 假文件系统里的工作区档绝对路径（与默认档同目录，生产口径）。 */
const WORKSPACES_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/** 会话默认归属到的工作区（`{workspacePath}` 寻址的断言基准）。 */
const PRIMARY_WORKSPACE = '/w1'

/** 另一个已登记工作区（下拉切换的断言基准）。 */
const SECOND_WORKSPACE = '/w2'

/** 默认的已登记工作区列表（与 `workspaceChoices` 的投影同形）。 */
const DEFAULT_CHOICES: readonly { readonly key: string; readonly title?: string }[] = [
  { key: PRIMARY_WORKSPACE, title: '工作区一' },
  { key: SECOND_WORKSPACE, title: '工作区二' },
]

/** 假会话的创建时间（固定值，让 `panel.createdAt` 可断言）。 */
const CREATED_AT = 1_700_000_000_000

/** 用例里那个活着的会话 id（G6 出口断言的字面主体）。 */
const SESSION_ID = 's1'

/**
 * 补字段内核：`RpcDeps` 类型面已收缩掉 `defaultsIo` / `defaultsPath`（RPC 自身不读默认档），
 * 而真实内核（`control.ts`）要求完整 `ControlDeps`。本内核在**内核边界**把两字段补回依赖
 * 视图再转发真实函数——`readPanel` 永不触到 `undefined` 路径（`kernelDepsOf` JSDoc 的纪律），
 * RPC 依赖面自身保持收缩后的形状。两字段只被内核读取，与生产装配（`{...controlDeps}` 展开）
 * 语义等价。
 */
const REAL_KERNEL: RpcKernel = {
  toggleSession: (deps, ...args) => toggleSession(withDefaultsDeps(deps), ...args),
  resetSession: (deps, ...args) => resetSession(withDefaultsDeps(deps), ...args),
  readPanel: (deps, ...args) => readPanel(withDefaultsDeps(deps), ...args),
  updateWorkspaceDefaults: (deps, ...args) => updateWorkspaceDefaults(deps, ...args),
}

/**
 * 给内核依赖视图补回收缩掉的两字段（`defaultsPath` / `defaultsIo`）。
 * @param deps - dispatcher 传给内核的依赖（`RpcDeps` 运行时形状）。
 * @returns 带 `defaultsIo` / `defaultsPath` 的完整 `ControlDeps` 视图。
 */
function withDefaultsDeps(deps: ControlDeps): ControlDeps {
  return { ...deps, defaultsPath: DEFAULTS_PATH, defaultsIo: new FakeDefaultsIo() }
}

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

/** 假层的技能分面配置（缺省 = 技能可用但没有技能行，既有用例零改动）。 */
interface FakeSkillOptions {
  /** `skills` 服务是否可用（默认 true；false 用于降级用例）。 */
  readonly available?: boolean
  /** 初始「模型可调用」技能（带描述）。 */
  readonly visible?: readonly { readonly name: string; readonly description: string }[]
  /** 初始已注册影子 stub 的技能名。 */
  readonly shadowed?: readonly string[]
  /**
   * 模拟「同层先到先得」而未胜出的技能名：`applySkills` 会把它们从 shadowed 里剔掉，
   * 用于驱动 `skill-shadow-failed`（disabled ∧ visible ∧ ¬shadowed）。
   */
  readonly failedShadows?: readonly string[]
  /**
   * 技能收敛闸：给了它，`skillsSettled()` 会等它 resolve（驱动「toggle 回执前必须 await」）。
   * 不给时立即 resolve。
   */
  readonly gate?: Promise<void>
}

/**
 * 假层默认的工具投影：一条 MCP 工具 + 中文描述。
 *
 * 与面板描述断言同一份数据（G2：`groups[0].tools[0].description === '读取页面内容'`）：
 * 描述不能从别处注入（`descriptions` 注入面已随 H6 删除），只能经 `visibleSchemas()` 进来。
 */
const DEFAULT_VISIBLE_SCHEMAS: readonly VisibleToolSchema[] = [
  { name: 'mcp__a__x', description: '读取页面内容' },
]

/**
 * 假层句柄：按 `planMask` 的两读并集重算掩码（与生产层同构：掩码生效后名字从 `scoped`
 * 消失，因此 `carried` 必须参与并集，否则第二读会缩水）。
 *
 * 技能分面按 `state.disabled` **同步**重算 shadowed（生产层注册 stub 是异步的，这里刻意同步，
 * 让「回执里的 hiddenSkills」与「快照里的技能行」都能断言；异步时序由 `skillsSettled` 的
 * 闸单独验证）。工具投影（名字 + 描述）是可替换的 fixtures：缺省一条，`setVisibleSchemas`
 * 换数据、`setVisibleSchemasError` 注入抛错。
 */
class FakeLayer implements LayerHandle {
  /** 已生效的 deny（同时是下一轮的 carried）。 */
  private masked: readonly string[] = []

  /** 已生效的遮蔽段服务器。 */
  private sections: readonly string[] = []

  /** 本会话可见工具的名字 + 描述投影（默认一条；用例可经 {@link setVisibleSchemas} 替换）。 */
  private schemas: readonly VisibleToolSchema[] = DEFAULT_VISIBLE_SCHEMAS

  /** 注入的 `visibleSchemas()` 抛错（驱动「层读数炸了 → 空描述 Map + warn」用例）。 */
  private schemasError: Error | undefined

  /** 该层「模型可调用」的初始技能（不含被遮蔽的行）。 */
  private readonly skillCatalog: readonly { readonly name: string; readonly description: string }[]

  /** 当前已注册影子 stub 的技能名（排序）。 */
  private shadowedSkills: readonly string[]

  /** `skillsSettled()` 被调用的次数（断言「回执前等过一次」）。 */
  settleCalls = 0

  /**
   * @param scope - 该 agent **未**被本插件掩码时的视角名字（唯一的工具读数来源）。
   * @param initial - 初始整值状态（构造即应用一次，模拟 `attach`）。
   * @param skills - 技能分面配置（缺省 = 可用但空）。
   */
  constructor(
    private readonly scope: readonly string[],
    initial: SessionToolState,
    private readonly skillsOptions: FakeSkillOptions = {},
  ) {
    this.skillCatalog = skillsOptions.visible ?? []
    this.shadowedSkills = [...(skillsOptions.shadowed ?? [])].sort()
    this.reconcile(initial)
    this.applySkills(initial)
  }

  /**
   * 应用新状态。
   * @param state - 新整值状态。
   */
  setState(state: SessionToolState): void {
    this.reconcile(state)
    this.applySkills(state)
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
   * 读本会话可见工具的名字 + 描述（面板描述来源）。
   * @returns 注入的工具投影；注入了抛错时抛出。
   */
  visibleSchemas(): readonly VisibleToolSchema[] {
    if (this.schemasError !== undefined) throw this.schemasError
    return this.schemas
  }

  /**
   * 替换工具投影（描述用例的注入口：描述没有独立注入面，只能经层进来）。
   * @param next - 新的工具投影。
   */
  setVisibleSchemas(next: readonly VisibleToolSchema[]): void {
    this.schemas = next
  }

  /**
   * 注入 / 清除 `visibleSchemas()` 抛错（命名与层替身的 `setVisibleError` 同风格）。
   * @param error - 要抛的错误；`undefined` 恢复正常。
   */
  setVisibleSchemasError(error: Error | undefined): void {
    this.schemasError = error
  }

  /**
   * 读本会话的技能分面：shadowed 来自当前关闭集（本假层同步重算），visible 排除已遮蔽行。
   * @returns 技能分面读数。
   */
  skills(): SkillLayerSnapshot {
    const shadowed = new Set(this.shadowedSkills)
    return {
      available: this.skillsOptions.available ?? true,
      shadowed: [...this.shadowedSkills],
      visible: this.skillCatalog
        .filter((row) => !shadowed.has(row.name))
        .map((row) => ({ name: row.name, description: row.description })),
    }
  }

  /**
   * 等待在途技能收敛结算（有闸时等闸，同时记录调用次数）。
   * @returns 已结算的 Promise。
   */
  skillsSettled(): Promise<void> {
    this.settleCalls += 1
    const gate = this.skillsOptions.gate
    return gate === undefined ? Promise.resolve() : gate
  }

  /**
   * 按关闭集重算技能面：`tool:skill` 整档关闭 → shadowed 为空；否则逐条 `skill:<name>`。
   * @param state - 当前整值状态。
   */
  private applySkills(state: SessionToolState): void {
    let wholeClosed = false
    const names: string[] = []
    for (const text of state.disabled) {
      // 技能地址不受保护名单影响（D15）：传空集即可，也只关心 `skill:` 与 `tool:skill` 两类。
      const parsed = parseAddress(text, new Set())
      if (!parsed.ok) continue
      if (parsed.address.kind === 'skill') names.push(parsed.address.name)
      else if (parsed.address.kind === 'tool' && parsed.address.name === 'skill') wholeClosed = true
    }
    this.shadowedSkills = wholeClosed
      ? []
      : [...new Set(names)].filter((name) => !(this.skillsOptions.failedShadows ?? []).includes(name)).sort()
  }

  /**
   * 一轮重算（两读：`scoped ∪ carried`，与生产 `planMask` 同参）。
   * @param state - 当前整值状态。
   */
  private reconcile(state: SessionToolState): void {
    const plan = planMask({
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
 * 转发链与 {@link REAL_KERNEL} 同构：读侧先补回两字段再走真实函数。
 * @returns 计数内核 + 读取计数的函数。
 */
function countingKernel(): { readonly kernel: RpcKernel; readonly calls: () => number } {
  let calls = 0
  return {
    kernel: {
      toggleSession: (...args) => {
        calls += 1
        const [deps, ...rest] = args
        return toggleSession(withDefaultsDeps(deps), ...rest)
      },
      resetSession: (...args) => {
        calls += 1
        const [deps, ...rest] = args
        return resetSession(withDefaultsDeps(deps), ...rest)
      },
      readPanel: (...args) => {
        calls += 1
        const [deps, ...rest] = args
        return readPanel(withDefaultsDeps(deps), ...rest)
      },
      updateWorkspaceDefaults: (...args) => {
        calls += 1
        return updateWorkspaceDefaults(...args)
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
  hiddenSkills: 0,
  visibleBefore: 0,
  visibleAfter: 0,
  visibleKnown: true,
  state: EMPTY_STATE,
  persistFailed: false,
  layerFailed: false,
} as unknown as ToggleReport

/**
 * 工作区宇宙读数假端口返回的固定宇宙（最小合法形状：一个空 builtin 组）。
 *
 * 形状与 `parseWorkspaceValue` 的响应自检兼容（strict：宇宙三键 + 组四键），用例按深相等
 * 断言「端口返回被整份透传进响应」。
 */
const FAKE_WORKSPACE_UNIVERSE: DefaultsUniverse = {
  layerReady: true,
  skillsAvailable: true,
  groups: [{ kind: 'builtin', key: 'builtin', address: null, tools: [] }],
}

/** 假端口的构造参数（只写用例关心的部分）。 */
interface HarnessOptions {
  /** 该 agent 未被掩码时的视角名字（工具读数唯一来源；缺省为空）。 */
  readonly scope?: readonly string[]
  /** 本会话关闭集。 */
  readonly disabled?: readonly string[]
  /** 本会话创建时快照。 */
  readonly snapshot?: readonly string[]
  /** 实际生效的持久化通道（默认 `record`）。 */
  readonly storeKind?: StoreKind
  /** 是否提供会话层（默认 true；false 用于层未就绪的降级用例）。 */
  readonly withLayer?: boolean
  /** 注入状态读取错误（驱动「control 抛 → internal」）。 */
  readonly storeReadError?: Error
  /** 注入状态写入错误（驱动「已降级内存态」提示码）。 */
  readonly storeWriteError?: Error
  /** 注入工作区档写入错误（驱动 `workspace-unwritable`）。 */
  readonly workspacesWriteError?: Error
  /** agent 表行为：`live`（缺省，命中 SESSION_ID）/ `absent` / `mismatched`（拿到别的会话）。 */
  readonly agent?: 'live' | 'absent' | 'mismatched'
  /** 注入 `agents.get` 抛错。 */
  readonly agentsError?: Error
  /** 会话 header 的来源标记（子代理用例）。 */
  readonly origin?: 'subagent'
  /** 假内核（缺省 {@link REAL_KERNEL} 补字段内核）。 */
  readonly kernel?: RpcKernel
  /**
   * 会话归属（供会话层 / 命令面共用读数；`workspace` 端点已不再消费它——`{workspacePath}`
   * 是唯一寻址形态）。`null` = cwd 无法归属（目录已删），缺省 = 归属到 `/w1`。
   */
  readonly attribution?: WorkspaceAttribution | null
  /** 注入归属读数抛错（归属失败按 `workspace-unresolved` 降级）。 */
  readonly workspaceOfError?: Error
  /** 已登记工作区可选项（默认 `/w1`、`/w2` 两项）。 */
  readonly choices?: readonly { readonly key: string; readonly title?: string }[]
  /** 工作区档条目：键 → 该工作区的关闭集；缺省 = 文件不存在。 */
  readonly workspaces?: Readonly<Record<string, readonly string[]>>
  /** 工作区档原始文本（损坏 / 半写用例；给了就不看 `workspaces`）。 */
  readonly workspacesText?: string
  /** 注入工作区宇宙读数抛错（驱动「档照常返回 + 空宇宙降级 + warn」）。 */
  readonly universeReaderError?: Error
  /** 假层的技能分面配置。 */
  readonly skills?: FakeSkillOptions
}

/** 一套假端口 + 可断言的记录。 */
interface Harness {
  readonly deps: RpcDeps
  readonly session: SessionLike
  readonly store: FakeStore
  readonly layer: FakeLayer | undefined
  readonly workspacesIo: FakeDefaultsIo
  readonly log: { readonly log: SpecLog; readonly warnings: string[]; readonly errors: string[] }
  /** 工作区宇宙读数假端口（`calls` 按序记录每次收到的规范 key）。 */
  readonly universeReader: { readonly calls: string[] }
  readonly dispatch: ReturnType<typeof createRpcDispatcher>
}

/**
 * 构造一套假端口。
 * @param options - 只覆盖用例关心的字段。
 * @returns 端口、会话与可断言的记录（`dispatch` 已按 deps 构造好）。
 */
function harness(options: HarnessOptions = {}): Harness {
  const session = fakeSession(SESSION_ID, options.origin)
  const scope = options.scope ?? []
  const initial: SessionToolState = {
    version: 1,
    disabled: options.disabled ?? [],
    snapshot: options.snapshot ?? [],
    seeded: true,
    updatedAt: CREATED_AT,
  }

  const store = new FakeStore(initial, options.storeKind ?? 'record', options.storeReadError, options.storeWriteError)
  const layer = options.withLayer === false ? undefined : new FakeLayer(scope, initial, options.skills)

  // 工作区档的假 IO（`workspace` 端点是它唯一的 RPC 消费方；默认档 IO 已随端点收缩退出本套件，
  // 补字段内核在内核边界自行提供内存替身，见 {@link withDefaultsDeps}）。
  const workspacesIo = new FakeDefaultsIo()
  if (options.workspacesText !== undefined) {
    workspacesIo.files.set(WORKSPACES_PATH, options.workspacesText)
  } else if (options.workspaces !== undefined) {
    const workspaces = Object.fromEntries(
      Object.entries(options.workspaces).map(([key, disabled]) => [key, { disabled }]),
    )
    workspacesIo.files.set(WORKSPACES_PATH, JSON.stringify({ version: 1, workspaces }))
  }
  workspacesIo.failWrite = options.workspacesWriteError

  const attribution: WorkspaceAttribution | undefined =
    options.attribution === null
      ? undefined
      : options.attribution ?? { key: PRIMARY_WORKSPACE, registered: true, title: '工作区一' }
  const choices = options.choices ?? DEFAULT_CHOICES

  // 工作区宇宙读数假端口：默认返回固定宇宙并按序记录每次收到的规范 key。路径形态的读 / 写
  // 都经它取宇宙；`{sessionId}` 形态零调用（会话宇宙仍由本会话两读推出，不走该端口）。
  const universeReaderCalls: string[] = []
  const universeReader = {
    calls: universeReaderCalls,
    readWorkspaceUniverse: async (workspacePath: string): Promise<DefaultsUniverse> => {
      universeReaderCalls.push(workspacePath)
      if (options.universeReaderError !== undefined) throw options.universeReaderError
      return FAKE_WORKSPACE_UNIVERSE
    },
  }

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
    protectedNames: new Set(PROTECTED_BASELINE),
    log: recorded.log,
    agents,
    workspacesPath: WORKSPACES_PATH,
    workspacesIo,
    workspaceOf: async () => {
      if (options.workspaceOfError !== undefined) throw options.workspaceOfError
      return attribution
    },
    workspaceChoices: () => choices,
    readWorkspaceUniverse: universeReader.readWorkspaceUniverse,
    // 缺省内核 = {@link REAL_KERNEL}（补字段内核）：`RpcDeps` 不带 `defaultsIo` / `defaultsPath`，
    // 真实内核的 `readPanel` 需要它们——补字段动作在内核边界完成（kernelDepsOf JSDoc 的纪律）。
    ...(options.kernel === undefined ? { kernel: REAL_KERNEL } : { kernel: options.kernel }),
  }

  return {
    deps,
    session,
    store,
    layer,
    workspacesIo,
    log: recorded,
    universeReader,
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

/**
 * 取 `workspace` 的成功值并过一遍响应 parser（同 `panelOf` 的理由）。
 * @param result - dispatcher 的结果。
 * @returns 工作区端点成功值。
 */
function workspaceValueOf(result: Awaited<ReturnType<Harness['dispatch']>>): WorkspaceValue {
  if (!result.ok) throw new Error(result.error.message)
  const parsed = parseWorkspaceValue(result.value)
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

  it("dispatch('defaults', …) → 未知端点 bad-request（defaults 端点已随面板收缩删除）", async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel })
    const error = failureOf(await h.dispatch('defaults', { action: 'off', addresses: ['mcp:a'] }))

    expect(error.code).toBe('bad-request')
    expect(error.message).toContain('未知端点')
    expect(error.message).toContain('panel / toggle / reset / workspace')
    // 未知端点在 parser 之前就拒绝：默认档文件一个字节都不动。
    expect(counted.calls()).toBe(0)
    expect(h.workspacesIo.writes).toHaveLength(0)
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
    // workspace 的 strict：未知 action、set 缺 addresses、read 带 addresses。
    for (const payload of [
      { workspacePath: '/w1', action: 'bogus' },
      { workspacePath: '/w1', action: 'set' },
      { workspacePath: '/w1', action: 'read', addresses: ['mcp:a'] },
    ]) {
      expect(failureOf(await h.dispatch('workspace', payload)).code).toBe('bad-request')
    }
  })
})

describe('sessionId 三步校验（agents.get + session.id 对账）', () => {
  it('不存在的 sessionId → session-not-live，details 带 sessionId，内核零调用', async () => {
    const counted = countingKernel()
    const h = harness({ scope: ['mcp__a__x'], kernel: counted.kernel, agent: 'absent' })
    const error = failureOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(error.code).toBe('session-not-live')
    expect(error.details).toEqual({ sessionId: SESSION_ID })
    expect(counted.calls()).toBe(0)
  })

  it('agent.session.id 与请求不一致 → 同样判 session-not-live', async () => {
    const counted = countingKernel()
    const h = harness({ scope: ['mcp__a__x'], kernel: counted.kernel, agent: 'mismatched' })
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
    const h = harness({ scope: ['mcp__a__x'], agentsError: new Error('agent 表炸了') })
    const error = failureOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(error.code).toBe('internal')
    expect(h.log.warnings.join('\n')).toContain('agent 表炸了')
  })
})

describe('地址预检（R17：结构化失败码由 dispatcher 产出）', () => {
  it('tool:bash → protected，details.names=[bash]，内核零调用', async () => {
    const counted = countingKernel()
    const h = harness({ scope: ['bash'], kernel: counted.kernel })
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
    const h = harness({ scope: ['run_code'], kernel: counted.kernel })
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
    const h = harness({ scope: ['mcp__a__x'] })
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
})

describe('panel：只读快照', () => {
  it('成功值过 parsePanelSnapshot，读数与假层一致', async () => {
    const h = harness({
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
    // 两计数：visible = 本会话掩码后仍可见的名字数（只剩 bash），denied = 掩码实际生效的名字数
    // （x / y 两条，carried 与 scoped 同一批名字，不会重复计入）。
    expect(parsed.value.stats).toStrictEqual({ visible: 1, denied: 2 })
    expect(parsed.value.groups.map((group) => group.key)).toEqual(['a', 'builtin'])
    // 快照不再携带默认档 / 工作区档读数（wire 收缩：两个字段已删，命令面仍走 control 读数）。
    expect('defaults' in parsed.value).toBe(false)
    expect('workspace' in parsed.value).toBe(false)
    // 关闭集里命中 0 的地址才进 intentOnly；`mcp:a` 命中 2，因此为空。
    expect(parsed.value.intentOnly).toEqual([])
  })

  it('默认档缺失或损坏都不再进快照（D-11：无 defaults 键、无 defaults-corrupt 提示码）', async () => {
    // 补字段内核的默认档 IO 是空表：文件不存在（缺失路径）。快照照样成功，但不带 defaults
    // 读数，也不产 defaults-corrupt 提示码——面板不再展示默认档状态（提示码键保留给命令面）。
    const h = harness({ scope: ['bash'] })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect('defaults' in snapshot).toBe(false)
    expect(snapshot.notices).not.toContain('defaults-corrupt')
  })

  it('持久化降级（storeKind=memory）→ 提示码由构建器自动补 persistence-degraded', async () => {
    const h = harness({ scope: ['bash'], storeKind: 'memory' })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))
    expect(snapshot.state.storeKind).toBe('memory')
    expect(snapshot.notices).toEqual(['persistence-degraded'])
  })

  it('子代理会话 → 提示码里带 session-subagent', async () => {
    const h = harness({ scope: ['bash'], origin: 'subagent' })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))
    expect(snapshot.notices).toEqual(['session-subagent'])
  })

  it('描述来自本会话层：条目带 layer.visibleSchemas() 的描述，层读数抛错只降级、不失败', async () => {
    // 描述没有独立注入面（H6）：它只能经本会话层的投影进来，因此这条断言同时锁住来源。
    const h = harness({ scope: ['mcp__a__x'] })
    const layer = h.layer
    if (layer === undefined) throw new Error('期望本用例挂上会话层')
    layer.setVisibleSchemas([{ name: 'mcp__a__x', description: '读取页面内容' }])
    const described = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))
    expect(described.groups[0]?.tools[0]?.description).toBe('读取页面内容')

    // 层在却读不出来：空描述 Map + 一条 warn，面板其余部分照常返回（R6：软读数缺席只降级）。
    const broken = harness({ scope: ['mcp__a__x'] })
    const brokenLayer = broken.layer
    if (brokenLayer === undefined) throw new Error('期望本用例挂上会话层')
    brokenLayer.setVisibleSchemasError(new Error('描述读数炸了'))
    const degraded = await broken.dispatch('panel', { sessionId: SESSION_ID })
    expect(degraded.ok).toBe(true)
    const degradedPanel = panelOf(degraded)
    expect(degradedPanel.groups[0]?.tools[0]?.description).toBeUndefined()
    expect(broken.log.warnings.join('\n')).toContain('描述读数炸了')
  })

  it('层未就绪 → 空描述 Map、面板照常成功（groups 为空）', async () => {
    // 层缺席不是失败（R6）：没有工具读面 → 分组清单为空、描述 Map 为空，信封仍是 ok。
    const h = harness({ withLayer: false })
    const degraded = await h.dispatch('panel', { sessionId: SESSION_ID })
    expect(degraded.ok).toBe(true)
    if (!degraded.ok) return

    const parsed = parsePanelSnapshot(degraded.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.groups).toEqual([])
    // 层缺席不告警（「层在却读不出来」才留 warn），因此描述那条 warn 不该出现。
    expect(h.log.warnings.filter((line) => line.includes('工具描述'))).toEqual([])
  })

  it('层未就绪 → skills-unavailable（R6：只降级、不失败）', async () => {
    const h = harness({ withLayer: false })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(snapshot.skills).toEqual([])
    expect(snapshot.notices).toEqual(['skills-unavailable'])
  })

  it('技能 stub 未胜出（disabled ∧ visible ∧ ¬shadowed）→ skill-shadow-failed', async () => {
    const h = harness({
      disabled: ['skill:openspec-propose'],
      skills: {
        visible: [{ name: 'openspec-propose', description: '提案工作流' }],
        failedShadows: ['openspec-propose'],
      },
    })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(snapshot.notices).toEqual(['skill-shadow-failed'])
    // 意图在、影子没挂上：技能行两态分开（disabled true / shadowed false）。
    expect(snapshot.skills).toEqual([
      { name: 'openspec-propose', description: '提案工作流', disabled: true, shadowed: false },
    ])
  })

  it('整档 tool:skill 关闭时不报 skill-shadow-failed（D16：stub 刻意不注册）', async () => {
    const h = harness({
      disabled: ['tool:skill', 'skill:openspec-propose'],
      skills: {
        visible: [{ name: 'openspec-propose', description: '提案工作流' }],
        failedShadows: ['openspec-propose'],
      },
    })
    const snapshot = panelOf(await h.dispatch('panel', { sessionId: SESSION_ID }))

    expect(snapshot.notices).toEqual([])
  })
})

describe('toggle：批量开关', () => {
  it('成功：mutation 逐地址回执 + kvRebuild，快照反映新关闭集', async () => {
    const h = harness({ scope: ['mcp__a__x', 'mcp__a__y'] })
    const result = await h.dispatch('toggle', { sessionId: SESSION_ID, on: false, addresses: ['mcp:a'] })
    if (!result.ok) throw new Error(result.error.message)

    const parsed = parseToggleValue(result.value)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.mutation).toEqual({
      applied: [{ address: 'mcp:a', on: false, matched: 2 }],
      hiddenTools: 2,
      hiddenSkills: 0,
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
    const h = harness({ scope: ['mcp__a__x'] })
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

  it('技能收敛（H10）：回执前 await skillsSettled，hiddenSkills 正确、快照含新影子行', async () => {
    // 闸不 resolve 时 dispatch 必须停在 settledSkills 上：这是「回执前等待」的直接证据。
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const h = harness({
      scope: ['skill'],
      skills: {
        available: true,
        visible: [{ name: 'openspec-propose', description: '提案工作流' }],
        gate,
      },
    })

    let done = false
    const pending = h.dispatch('toggle', {
      sessionId: SESSION_ID,
      on: false,
      addresses: ['skill:openspec-propose'],
    })
    void pending.then(() => {
      done = true
    })
    // 让出微任务：预检、内核、settledSkills 应已执行到等待点。
    for (let index = 0; index < 50 && (h.layer?.settleCalls ?? 0) === 0; index += 1) {
      await Promise.resolve()
    }
    expect(h.layer?.settleCalls).toBe(1)
    expect(done).toBe(false)

    release()
    const result = await pending
    if (!result.ok) throw new Error(result.error.message)
    const parsed = parseToggleValue(result.value)
    if (!parsed.ok) throw new Error(parsed.message)

    // 影子 stub 集合从 0 → 1（关闭技能即遮蔽），缓存因技能目录变化而重建。
    expect(parsed.value.mutation.hiddenSkills).toBe(1)
    expect(parsed.value.mutation.kvRebuild).toBe(true)
    expect(parsed.value.snapshot.skills).toEqual([
      { name: 'openspec-propose', description: '', disabled: true, shadowed: true },
    ])
    // 技能地址不进工具 deny（D15 / `mask.ts` 跳过 skill），因此工具面计数不变。
    expect(parsed.value.snapshot.stats.denied).toBe(0)
  })
})

describe('reset：回创建时快照', () => {
  it('applied = 被移除的关闭项（on 恒为 true，matched 来自变更前读数）', async () => {
    const h = harness({
      scope: ['mcp__a__x', 'mcp__b__y'],
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
      hiddenSkills: 0,
      visibleBefore: 1,
      visibleAfter: 2,
      kvRebuild: true,
      notices: [],
    })
    expect(parsed.value.snapshot.state.disabled).toEqual([])
    expect(h.store.writeCalls).toBe(1)
  })

  it('无变化：applied 为空、kvRebuild=false、不写状态', async () => {
    const h = harness({ scope: ['mcp__a__x'], disabled: ['mcp:a'], snapshot: ['mcp:a'] })
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

describe('workspace：工作区级默认档（{workspacePath} 唯一寻址 × 5 动作）', () => {
  it('session 寻址形态 → 请求 parser 直接拒绝（P-1=b：{workspacePath} 是唯一寻址）', async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel, workspaces: { [PRIMARY_WORKSPACE]: ['mcp:a'] } })
    const error = failureOf(await h.dispatch('workspace', { sessionId: SESSION_ID, action: 'read' }))

    expect(error.code).toBe('bad-request')
    expect(error.message).toContain('未知字段')
    // parser 拒绝发生在内核与归属解析之前：不写盘、不读归属、不调内核。
    expect(counted.calls()).toBe(0)
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('session 寻址形态的写动作同样被拒（set / off / on / reset 全动作无入口）', async () => {
    const h = harness()
    for (const action of ['set', 'off', 'on', 'reset'] as const) {
      const payload =
        action === 'set' || action === 'off' || action === 'on'
          ? { sessionId: SESSION_ID, action, addresses: ['mcp:a'] }
          : { sessionId: SESSION_ID, action }
      expect(failureOf(await h.dispatch('workspace', payload)).code).toBe('bad-request')
    }
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('{workspacePath}：read + set/off/on/reset 全动作写盘并回读一致', async () => {
    const h = harness({ workspaces: { [SECOND_WORKSPACE]: ['mcp:z'] } })

    const read = workspaceValueOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'read' }),
    )
    expect(read.workspace).toEqual({
      key: SECOND_WORKSPACE,
      title: '工作区二',
      registered: true,
      disabled: ['mcp:z'],
      path: WORKSPACES_PATH,
      readable: true,
      corrupt: false,
    })
    // 响应不带 choices（下拉字段已随 P-1=b 删除；登记查询转为宿主私有用途）。
    expect('choices' in read).toBe(false)
    expect(read.changed).toEqual([])

    const set = workspaceValueOf(
      await h.dispatch('workspace', {
        workspacePath: SECOND_WORKSPACE,
        action: 'set',
        addresses: ['skill:q'],
      }),
    )
    expect(set.changed).toEqual(['skill:q'])

    const off = workspaceValueOf(
      await h.dispatch('workspace', {
        workspacePath: SECOND_WORKSPACE,
        action: 'off',
        addresses: ['mcp:y'],
      }),
    )
    expect(off.changed).toEqual(['mcp:y', 'skill:q'])

    const on = workspaceValueOf(
      await h.dispatch('workspace', {
        workspacePath: SECOND_WORKSPACE,
        action: 'on',
        addresses: ['mcp:y'],
      }),
    )
    expect(on.changed).toEqual(['skill:q'])

    const reset = workspaceValueOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'reset' }),
    )
    expect(reset.changed).toEqual([])
    expect(reset.workspace?.disabled).toEqual([])
  })

  it('工作区档损坏：readable=true / corrupt=true（按空档处理），读路径照常返回', async () => {
    const h = harness({ workspacesText: '{ "version": 1, "workspaces": [' })
    const value = workspaceValueOf(
      await h.dispatch('workspace', { workspacePath: PRIMARY_WORKSPACE, action: 'read' }),
    )

    expect(value.workspace).toMatchObject({ readable: true, corrupt: true, disabled: [] })
    expect(h.log.warnings.join('\n')).toContain('工作区档')
  })

  it('{workspacePath:"/etc"} 未登记 → workspace-unresolved{subject: 路径原文}', async () => {
    const h = harness()
    const error = failureOf(await h.dispatch('workspace', { workspacePath: '/etc', action: 'read' }))

    expect(error.code).toBe('workspace-unresolved')
    expect(error.details).toEqual({ subject: '/etc' })
    expect(error.message).toContain('不是已登记的工作区')
  })

  it('写盘抛错 → workspace-unwritable{path, reason}，文件一个字节都不动', async () => {
    const h = harness({
      workspaces: { [SECOND_WORKSPACE]: ['mcp:z'] },
      workspacesWriteError: new Error('EACCES: 目录不可写'),
    })
    const before = h.workspacesIo.files.get(WORKSPACES_PATH)
    const error = failureOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'off', addresses: ['skill:x'] }),
    )

    expect(error.code).toBe('workspace-unwritable')
    expect(error.details).toEqual({ path: WORKSPACES_PATH, reason: 'EACCES: 目录不可写' })
    expect(h.workspacesIo.files.get(WORKSPACES_PATH)).toBe(before)
    expect(h.log.warnings.join('\n')).toContain('工作区档写入失败')
  })

  it('地址预检复用（R17）：tool:bash → protected，内核零调用、文件不动', async () => {
    const counted = countingKernel()
    const h = harness({ kernel: counted.kernel, workspaces: { [SECOND_WORKSPACE]: [] } })
    const error = failureOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'off', addresses: ['tool:bash'] }),
    )

    expect(error.code).toBe('protected')
    expect(error.details).toEqual({ names: ['bash'] })
    expect(counted.calls()).toBe(0)
    expect(h.workspacesIo.writes).toHaveLength(0)
  })

  it('坏请求 → bad-request（未知寻址字段 / 动作与地址约束）', async () => {
    const h = harness()
    const payloads: unknown[] = [
      {},
      { sessionId: SESSION_ID },
      { workspacePath: '/w2', action: 'set' },
      { workspacePath: '/w2', action: 'read', addresses: ['mcp:a'] },
      { workspacePath: '/w2', action: 'reset', addresses: ['mcp:a'] },
      { workspacePath: '/w2', action: 'bogus' },
      { workspacePath: '/w2', extra: true },
      { workspacePath: 'relative/path' },
    ]
    for (const payload of payloads) {
      expect(failureOf(await h.dispatch('workspace', payload)).code).toBe('bad-request')
    }
    expect(h.workspacesIo.writes).toHaveLength(0)
  })
})

describe('workspace 端点：工作区宇宙（D-24 / G7）', () => {
  it('{workspacePath} read 返回该工作区宇宙（端口收到的是规范化 key）', async () => {
    const h = harness()
    const value = workspaceValueOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'read' }),
    )

    // 旧语义（已翻转）：路径形态曾返回 `universe:null`；现在端口返回的宇宙被整份透传。
    expect(value.universe).not.toBeNull()
    expect(value.universe).toEqual(FAKE_WORKSPACE_UNIVERSE)
    // 端口收到的就是工作区规范路径本身（resolved.key），不是请求原文的变体。
    expect(h.universeReader.calls).toEqual([SECOND_WORKSPACE])
  })

  it('{workspacePath} off 写响应同样带该工作区宇宙（G7：写后整份替换不丢清单）', async () => {
    const h = harness({ workspaces: { [SECOND_WORKSPACE]: ['mcp:b'] } })
    const value = workspaceValueOf(
      await h.dispatch('workspace', {
        workspacePath: SECOND_WORKSPACE,
        action: 'off',
        addresses: ['mcp:c'],
      }),
    )

    expect(value.changed).toEqual(['mcp:b', 'mcp:c'])
    expect(value.universe).toEqual(FAKE_WORKSPACE_UNIVERSE)
    // 写路径同样走端口：宇宙在档动作完成后再算，写响应不特殊处理。
    expect(h.universeReader.calls).toEqual([SECOND_WORKSPACE])
  })

  it('{workspacePath} 宇宙读数抛错 → 档照常返回 + 空宇宙降级 + warn', async () => {
    const h = harness({ universeReaderError: new Error('宇宙端口炸了') })
    const value = workspaceValueOf(
      await h.dispatch('workspace', { workspacePath: SECOND_WORKSPACE, action: 'read' }),
    )

    // 档本身不受端口抛错影响；清单退化为「layerReady:false」（页面只显示残留区）。
    expect(value.workspace).not.toBeNull()
    expect(value.universe).toEqual({ layerReady: false, skillsAvailable: false, groups: [] })
    // warn 带错误原文（排障用），且不让整次 workspace 读失败。
    expect(h.log.warnings.join('\n')).toContain('宇宙端口炸了')
  })
})

describe('抛错与响应自检都归 internal', () => {
  it('control 抛错 → internal，details 为空，日志收到错误原文', async () => {
    const h = harness({
      scope: ['mcp__a__x'],
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
      scope: ['mcp__a__x'],
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
