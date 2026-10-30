/**
 * Connection RPC 通道的宿主半 dispatcher：端点派发 → 契约 parser → 控制内核 → 信封映射。
 *
 * 本模块是**纯逻辑**：不认识 Cordis、不注册通道、不写任何宿主状态；所有宿主面（状态端口、
 * 层句柄、默认档 IO、全局层读数、agent 表、诊断出口）都由 {@link RpcDeps} 注入，因此七条
 * 失败码与四条成功路径都能用假端口在单测里驱动（`test/rpc.test.ts`）。通道挂载属任务 9.5
 * （`src/host/index.ts` 的 `connection.rpc.handle(CHANNEL, dispatcher)`），不在本文件里。
 *
 * 处理顺序写死（顺序就是语义）：
 *
 * 1. **端点判定**：不在 `ENDPOINTS` 里 → `bad-request`（不猜、不落到兜底分支）；
 * 2. **请求 parser**（`REQUEST_PARSERS` 表，任务 9.2）：形状 / 长度护栏失败 → `bad-request`，
 *    `details = {issues}`（parser 的 `message`，字段名在 R17 ⑤ 已定）；
 * 3. **sessionId 三步校验**（附录 §2.4）：形状已由 parser 保证；`agents.get(sessionId)` 为
 *    undefined，或 `agent.session.id !== sessionId` → `session-not-live`，`details = {sessionId}`。
 *    状态永远按 sessionId 现读，不缓存、不跨会话复用；
 * 4. **地址预检**（R17 的 9.5 前置裁定）：`toggle` / `defaults` 的地址先用 `address.ts` 的
 *    `parseAddress` 逐条解析——`protected-tool` → `protected`（`{names}`）、`reserved-tool` →
 *    `reserved`（`{names}`）、其余 → `bad-address`（`{address, parseCode}`）；**全部通过后才调
 *    内核**（内核内部会再校验一次，幂等、不必改 `control.ts`）；
 * 5. **调内核**（`control.ts` 的四用例；`updateDefaults` 的写盘失败 → `defaults-unwritable`，
 *    `details = {path, reason}` 由本文件组装）；
 * 6. **响应自检**：成功值先过对应的响应 parser，不合契约说明**本端产出**与契约漂移 → `internal`
 *    并 warn（这不是客户端错误，交给 client 只会被归成 `bad-response`，排障价值更低）；
 * 7. **信封**：`{ok:true, value}` 或 `{ok:false, error:{code, message, details}}`。
 *
 * 失败码只用 `HOST_FAILURE_CODES` 的 7 个：`unavailable` / `bad-response` 是 client 合成的
 * 传输码（附录 §2.3），宿主**永不**产生。未预期抛错统一 `internal`，先 `log.warn` 留下原文。
 *
 * 与 `connection.rpc.handle` 的形状对应：DSH 期望
 * `ConnectionRpcHandler = (endpoint, payload, signal, peer) => Promise<ConnectionRpcHandlerResult>`
 * （`@deepseek-ai/dsh-client-connection` 的 `types/rpc.d.ts`）。{@link RpcDispatcher} 只有前两个
 * 参数——参数少的函数可赋值给参数多的类型——返回的 {@link RpcEnvelope} 与之逐字段兼容
 * （`details` 落在它的 `object` 里）。`test/rpc.test.ts` 用一次赋值把这条对应关系钉住。
 *
 * @module dsh-plugin-session-tool-toggle/host/rpc
 */

import {
  ENDPOINTS,
  REQUEST_PARSERS,
  parseDefaultsValue,
  parsePanelSnapshot,
  parseResetValue,
  parseToggleValue,
  type BadAddressDetails,
  type BadRequestDetails,
  type DefaultsAction,
  type DefaultsRequest,
  type DefaultsUnwritableDetails,
  type DefaultsValue,
  type HostFailureCode,
  type Mutation,
  type MutationApplied,
  type NameListDetails,
  type PanelRequest,
  type PanelSnapshot,
  type Parsed,
  type ResetRequest,
  type SessionNotLiveDetails,
  type SessionToolToggleEndpoint,
  type ToggleRequest,
  type ToggleValue,
} from '../contract.ts'
import { parseAddress } from './address.ts'
import { readPanel, resetSession, toggleSession, updateDefaults } from './control.ts'
import type { DefaultsWriteReport, PanelReading, ResetReport, ToggleReport } from './control.ts'
import { EMPTY_DEFAULTS } from './defaults.ts'
import { buildPanelSnapshot } from './panel.ts'
import type { AgentLike, ControlDeps, DefaultsFile, NoticeCode, PanelInputs, SessionLike } from './types.ts'

// ---------------------------------------------------------------------------
// 依赖注入面
// ---------------------------------------------------------------------------

/**
 * 会话寻址端口：宿主 `ctx.agents` 的最小面。
 *
 * 真实实现是 `ctx.agents.get(id: SessionId)`（返回 `Agent | undefined`）；9.5 的装配层只需
 * 把带品牌的 id 转成请求里的 string，不必把整个 `agents` 服务搬进纯逻辑。
 */
export interface AgentLookup {
  /**
   * 按 sessionId 取活着的 agent。
   * @param sessionId - 请求里的会话 id（形状已由请求 parser 校验）。
   * @returns agent；会话不存在 / 已归档 / 已结束（不在宿主中运行）时 undefined。
   */
  get(sessionId: string): AgentLike | undefined
}

/**
 * 四个用例的注入面（缺省 = `control.ts` 的真实内核）。
 *
 * 存在的唯一理由是**单测能注入坏形状 / 抛错**：响应自检与「抛错 → `internal`」这两条路径
 * 在真实内核上不可构造，而它们正是本任务的两条验证句。
 */
export interface RpcKernel {
  /** `toggle` 端点用的内核用例。 */
  readonly toggleSession: typeof toggleSession
  /** `reset` 端点用的内核用例。 */
  readonly resetSession: typeof resetSession
  /** `panel` / `toggle` / `reset` 的成功值都要一份现读快照。 */
  readonly readPanel: typeof readPanel
  /** `defaults` 端点用的内核用例。 */
  readonly updateDefaults: typeof updateDefaults
}

/** 真实内核（冻结：注入面缺省值时不让调用方改到别的模块）。 */
const DEFAULT_KERNEL: RpcKernel = Object.freeze({
  toggleSession,
  resetSession,
  readPanel,
  updateDefaults,
})

/**
 * dispatcher 的依赖注入面。
 *
 * `ControlDeps` 的全部字段（状态端口、层句柄、默认档路径与 IO、保护名单、全局层读数、日志）
 * 与命令面**共用同一份对象**——这正是 D14「不存在两份状态」在类型上的表达；这里只补三件
 * 命令面不需要的东西：agent 表（判 `session-not-live`）、可选的描述读数与可选的单测内核。
 */
export interface RpcDeps extends ControlDeps {
  /** 会话寻址端口（`session-not-live` 判定与拿 `SessionLike` 都靠它）。 */
  readonly agents: AgentLookup
  /**
   * 工具描述来源（public name → 描述原文）。
   *
   * 可选：`PanelInputs.descriptions` 缺省即「快照不携带 description」，面板照常可用；9.5 的
   * 装配层用 `ctx.tools.schemas()` 一次填好（与 `catalog` 同一读数面）。
   */
  readonly descriptions?: () => ReadonlyMap<string, string>
  /** 内核注入面（缺省 {@link DEFAULT_KERNEL}；单测用来注入坏形状 / 抛错）。 */
  readonly kernel?: RpcKernel
}

// ---------------------------------------------------------------------------
// 信封（严格照 `ConnectionRpcResult` 的两个分支）
// ---------------------------------------------------------------------------

/** `bad-request` 的细节（`issues` 是 parser 的 `message`）。 */
export type RpcFailureDetails =
  | BadRequestDetails
  | BadAddressDetails
  | NameListDetails
  | SessionNotLiveDetails
  | DefaultsUnwritableDetails
  /** `internal` 的细节：契约为空对象（不携带结构化信息）。 */
  | Record<string, never>

/** 一条失败：码只取宿主 7 个，`details` 是附录 §2.3 表里的五种形状之一或空对象。 */
export interface RpcFailure {
  /** 稳定失败码（client 按码给本地化文案）。 */
  readonly code: HostFailureCode
  /** 二级说明（不参与本地化，排障用）。 */
  readonly message: string
  /** 结构化细节（client 只作文案占位符，见 §2.3）。 */
  readonly details: RpcFailureDetails
}

/** 通道的结果信封：成功带值，失败带 `{code, message, details}`。 */
export type RpcEnvelope<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RpcFailure }

/**
 * 通道 handler 的形状：`connection.rpc.handle(channel, dispatcher)` 的 handler 参数少两个
 * （`signal` / `peer` 由传输层提供，本插件用不到），赋值兼容，见文件头的形状说明。
 */
export type RpcDispatcher = (endpoint: string, payload: unknown) => Promise<RpcEnvelope<unknown>>

// ---------------------------------------------------------------------------
// dispatcher 工厂
// ---------------------------------------------------------------------------

/**
 * 构造通道 handler。
 *
 * 工厂本身不触达任何宿主资源（只捕获 `deps`），因此可以在测试里直接构造并逐端点驱动；
 * 每次请求都按 sessionId 现读状态，不存在「工厂里缓存了某个会话」的路径。
 *
 * @param deps - 控制端口 + agent 表 + 可选的描述读数与内核。
 * @returns `(endpoint, payload) => Promise<RpcEnvelope>`。
 */
export function createRpcDispatcher(deps: RpcDeps): RpcDispatcher {
  return async (endpoint, payload) => {
    try {
      return await dispatch(deps, endpoint, payload)
    } catch (error) {
      // 未预期抛错：先留原文（`logger.warn` 等价物）再回 internal。client 只按码给文案，
      // 原文进宿主日志——「哪个端点、什么错」只能在那一侧排。
      deps.log.warn(`RPC 通道处理「${endpoint}」失败：${messageOf(error)}`)
      return failure('internal', `不预期的内部错误：${messageOf(error)}`)
    }
  }
}

/**
 * 端点派发主干：判定端点 → 请求 parser → 交给端点用例。
 * @param deps - 依赖注入面。
 * @param endpoint - 通道内的端点段。
 * @param payload - 原始请求体。
 * @returns 结果信封。
 */
async function dispatch(deps: RpcDeps, endpoint: string, payload: unknown): Promise<RpcEnvelope<unknown>> {
  // ① 端点判定：未知端点既不猜、也不落到任何兜底分支（§2.3 的 bad-request 第一触发条件）。
  if (!isEndpoint(endpoint)) {
    return failure('bad-request', `未知端点「${endpoint}」；只支持 ${ENDPOINTS.join(' / ')}`)
  }

  // ② 请求 parser：形状（strict）与长度/数量护栏的唯一权威。
  const parsed = REQUEST_PARSERS[endpoint](payload)
  if (!parsed.ok) {
    return failure('bad-request', `请求体不合契约：${parsed.message}`, { issues: parsed.message })
  }

  // 表按端点索引，紧邻的 switch 与请求形状一一对应：形状已由上面的 parser 校验过，这里只把
  // 「三个请求的并集」还原成该端点的那一种（不做字段级再校验，避免两处规则漂移）。
  switch (endpoint) {
    case 'panel':
      return await handlePanel(deps, parsed.value as PanelRequest)
    case 'toggle':
      return await handleToggle(deps, parsed.value as ToggleRequest)
    case 'reset':
      return await handleReset(deps, parsed.value as ResetRequest)
    case 'defaults':
      return await handleDefaults(deps, parsed.value as DefaultsRequest)
    default:
      // 上面的端点判定已把取值收窄到 ENDPOINTS；走到这里说明契约表与本 switch 漂移。
      return failure('bad-request', `未知端点「${String(endpoint)}」`)
  }
}

/** `panel`：只读快照（清单 + 关闭集 + 保护名单 + 默认档 + 统计 + 提示）。 */
async function handlePanel(deps: RpcDeps, request: PanelRequest): Promise<RpcEnvelope<unknown>> {
  const live = liveSessionOf(deps, request.sessionId)
  if (!live.ok) return live.failure
  const snapshot = await snapshotOf(deps, live.session)
  return checked(parsePanelSnapshot(snapshot), deps, 'panel 快照')
}

/** `toggle`：批量开/关，成功值 = 变更后的新快照 + 变更回执（一次往返拿全）。 */
async function handleToggle(deps: RpcDeps, request: ToggleRequest): Promise<RpcEnvelope<unknown>> {
  const live = liveSessionOf(deps, request.sessionId)
  if (!live.ok) return live.failure

  // ④ 地址预检：内核的拒绝文案是给命令面拼段落的，wire 上必须先有结构化失败码（R17）。
  const precheck = precheckAddresses(request.addresses, deps.protectedNames)
  if (!precheck.ok) return precheck.failure

  const outcome = kernelOf(deps).toggleSession(deps, live.session, request.addresses, request.on)
  // 预检与内核用的是同一套 `parseAddress`，因此这条分支理论上不可达；真走到这里说明内核
  // 自己新增了拒绝理由——按 `bad-request` 出网（带原文），不猜成别的码。
  if (!outcome.ok) return failure('bad-request', outcome.text, { issues: outcome.text })

  const value = await valueOf(deps, live.session, mutationOfToggle(outcome.report, request.on))
  return checked(parseToggleValue(value), deps, 'toggle 响应')
}

/** `reset`：回到创建时快照；`applied` 的语义是「被移除的关闭项」（D20，`on` 恒为 true）。 */
async function handleReset(deps: RpcDeps, request: ResetRequest): Promise<RpcEnvelope<unknown>> {
  const live = liveSessionOf(deps, request.sessionId)
  if (!live.ok) return live.failure

  const kernel = kernelOf(deps)
  // 变更前读数：`ResetReport` 只带「变更后的快照」，被移除项与它们的命中数只能从变更前读一次。
  const before = await kernel.readPanel(deps, live.session)
  const report = kernel.resetSession(deps, live.session)
  const value = await valueOf(deps, live.session, mutationOfReset(report, before))
  return checked(parseResetValue(value), deps, 'reset 响应')
}

/** `defaults`：用户级默认档写（不寻址会话、不返回会话快照，见 §2.2 表末行）。 */
async function handleDefaults(deps: RpcDeps, request: DefaultsRequest): Promise<RpcEnvelope<unknown>> {
  // `reset` 不接受地址（parser 已拦）；其余三种动作的地址同样要先过文法 / 保护 / 保留名预检。
  if (request.addresses !== undefined) {
    const precheck = precheckAddresses(request.addresses, deps.protectedNames)
    if (!precheck.ok) return precheck.failure
  }

  const attempt = await writeDefaultsOf(deps, request.action, request.addresses ?? [])
  if (!attempt.ok) return attempt.failure

  const report = attempt.report
  // 写成功即文件内容：`writeDefaults` 用原子替换写入的就是这份载荷，因此不再读回一遍
  // （读回反而可能读到别的进程的并发改动，把「我刚写成功」说成 `corrupt`）。
  const value: DefaultsValue = {
    defaults: {
      version: 1,
      disabled: [...report.after.disabled],
      path: report.path,
      readable: true,
      corrupt: false,
    },
    changed: [...report.after.disabled],
  }
  return checked(parseDefaultsValue(value), deps, 'defaults 响应')
}

// ---------------------------------------------------------------------------
// sessionId 三步校验（附录 §2.4）
// ---------------------------------------------------------------------------

/** 会话寻址的结论：活会话，或一条 `session-not-live` 信封。 */
type LiveSession =
  | { readonly ok: true; readonly session: SessionLike }
  | { readonly ok: false; readonly failure: RpcEnvelope<never> }

/**
 * 三步校验的后两步：`agents.get` + 身份对账。
 *
 * 形状（第一步）已由请求 parser 保证。层句柄是否就绪**不**参与判定：会话活着但层还没挂上
 * 时内核会按「层未就绪」降级（可见数不可信），那是降级而不是会话不存在。
 * @param deps - 依赖注入面。
 * @param sessionId - 请求里的会话 id。
 * @returns 活会话，或 `session-not-live`。
 */
function liveSessionOf(deps: RpcDeps, sessionId: string): LiveSession {
  const agent = deps.agents.get(sessionId)
  if (agent === undefined) return notLive(sessionId)
  // 身份对账：`Session.id` 由会话头派生；agent 键与它不一致说明拿到的是别的 agent。
  if (agent.session.id !== sessionId) return notLive(sessionId)
  return { ok: true, session: agent.session }
}

/**
 * `session-not-live` 的固定信封。
 * @param sessionId - 请求里的会话 id。
 * @returns 失败信封。
 */
function notLive(sessionId: string): LiveSession {
  return {
    ok: false,
    failure: failure(
      'session-not-live',
      `会话「${sessionId}」不在宿主中运行（可能已归档、已结束或 id 不存在）`,
      { sessionId },
    ),
  }
}

// ---------------------------------------------------------------------------
// 地址预检（R17：结构化失败码由本文件产出，内核保持原样）
// ---------------------------------------------------------------------------

/** 地址预检的结论：全部合法，或一条可直接出网的失败信封。 */
type AddressCheck = { readonly ok: true } | { readonly ok: false; readonly failure: RpcEnvelope<never> }

/**
 * 逐条预检地址，**全有或全无**（D19）。
 *
 * 码的优先级固定为 **保护 > 保留名 > 文法**：同一批地址无论书写顺序都给同一个码（同一份
 * 输入两次得到同一个响应），而全部失败原文都进 `message`（client 只把它当二级灰字）。
 * @param texts - 请求里的地址原文。
 * @param protectedNames - 生效保护名单（基线 ∪ `config.protectedTools`）。
 * @returns 全部合法，或一条失败信封。
 */
function precheckAddresses(texts: readonly string[], protectedNames: ReadonlySet<string>): AddressCheck {
  const protectedHits: string[] = []
  const reservedHits: string[] = []
  const grammar: { readonly address: string; readonly parseCode: string }[] = []
  const messages: string[] = []

  for (const text of texts) {
    const parsed = parseAddress(text, protectedNames)
    if (parsed.ok) continue
    messages.push(parsed.message)
    if (parsed.code === 'protected-tool') {
      protectedHits.push(toolNameOf(text))
      continue
    }
    if (parsed.code === 'reserved-tool') {
      reservedHits.push(toolNameOf(text))
      continue
    }
    grammar.push({ address: text, parseCode: parsed.code })
  }

  if (protectedHits.length > 0) {
    const names = uniqueTexts(protectedHits)
    return rejected(failure('protected', `保护名单内的工具不能关闭：${names.join('、')}`, { names }))
  }
  if (reservedHits.length > 0) {
    const names = uniqueTexts(reservedHits)
    return rejected(
      failure('reserved', `保留工具不能关闭（注册表与 restrict 都会拒绝）：${names.join('、')}`, { names }),
    )
  }
  if (grammar.length > 0) {
    const first = grammar[0]
    return rejected(
      failure('bad-address', messages.join('\n'), { address: first.address, parseCode: first.parseCode }),
    )
  }
  return { ok: true }
}

/**
 * 从 `tool:<name>` 取名字。
 *
 * `protected-tool` / `reserved-tool` 只可能由 `tool:` 地址产生（保护名单与保留名都是内置
 * 工具名），因此截掉前缀即可；其余形态原样返回。
 * @param text - 地址原文。
 * @returns 工具名。
 */
function toolNameOf(text: string): string {
  return text.startsWith('tool:') ? text.slice('tool:'.length) : text
}

// ---------------------------------------------------------------------------
// 面板快照与变更回执的组装
// ---------------------------------------------------------------------------

/**
 * 读一份面板快照：`readPanel` 的读数 → `PanelInputs` → 纯函数构建器。
 *
 * 读数复用控制内核的 `readPanel`（三读并集、默认档、保护名单都在里面），因此面板与
 * `/tools status` 看到的永远是同一组事实（D14）；这里只补 `readPanel` 不产出的三样：
 * 默认档的 `readable` / `corrupt` 两态与子代理提示码。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 契约形状的面板快照（与 `panel.ts` 的宿主侧形状由交叉可赋值锁住一致）。
 */
async function snapshotOf(deps: RpcDeps, session: SessionLike): Promise<PanelSnapshot> {
  const reading = await kernelOf(deps).readPanel(deps, session)
  const defaultsState = await defaultsStateOf(deps, reading.defaults)
  const descriptions = descriptionsOf(deps)

  const inputs: PanelInputs = {
    sessionId: session.id,
    createdAt: reading.createdAt,
    state: reading.state,
    storeKind: reading.storeKind,
    catalog: reading.catalog,
    scoped: reading.scoped,
    carried: reading.appliedDeny,
    protectedNames: reading.protectedNames,
    defaults: reading.defaults,
    defaultsPath: reading.defaultsPath,
    defaultsReadable: defaultsState.readable,
    defaultsCorrupt: defaultsState.corrupt,
    notices: noticesOf(session),
    ...(descriptions === undefined ? {} : { descriptions }),
  }
  return buildPanelSnapshot(inputs)
}

/**
 * 由会话身份推出的提示码。
 *
 * `persistence-degraded` / `defaults-corrupt` 由构建器从 `storeKind` / `defaultsCorrupt` 自行
 * 补出（面板不轻信单个字段），这里只补「本会话是子代理」这一条。
 * @param session - 目标会话。
 * @returns 提示码（可能为空）。
 */
function noticesOf(session: SessionLike): readonly NoticeCode[] {
  return originOf(session) === 'subagent' ? ['session-subagent'] : []
}

/**
 * 读会话来源标记。
 *
 * `types.ts` 的 `SessionLike.header` 已声明 `origin?: 'subagent'`（与 DSH 的
 * `SessionHeader.origin` 同一字面量，R19 ②），这里直接读字段、不做结构断言；缺省即顶级会话。
 * @param session - 目标会话。
 * @returns 来源标记；顶级会话为 undefined。
 */
function originOf(session: SessionLike): SessionLike['header']['origin'] {
  return session.header.origin
}

/**
 * 默认档的两态（`readable` / `corrupt`）。
 *
 * `readDefaults` 把「不存在 / 损坏 / schema 不符」都折成同一份 `EMPTY_DEFAULTS`，线上视图却
 * 要两态区分。只有落到降级常量时才补一次只读探测：读得到 = 文件存在但不可用（`corrupt`），
 * 读不到 = 不存在（按空档处理，不算损坏）；文件正常时不多读一遍。
 * @param deps - 依赖注入面（默认档 IO 与路径）。
 * @param defaults - 内核读到的默认档（与 {@link EMPTY_DEFAULTS} 同引用即降级）。
 * @returns 两态标记。
 */
async function defaultsStateOf(
  deps: RpcDeps,
  defaults: DefaultsFile,
): Promise<{ readonly readable: boolean; readonly corrupt: boolean }> {
  if (defaults !== EMPTY_DEFAULTS) return { readable: true, corrupt: false }
  const readable = await canReadDefaultsFile(deps)
  return { readable, corrupt: readable }
}

/**
 * 默认档文件是否可读（一次只读探测）。
 *
 * 只问「读得到吗」，不解码内容：内容的好坏由 `readDefaults` 的降级常量判定，两处不重复实现
 * 校验规则。
 * @param deps - 依赖注入面。
 * @returns 端口 resolve 为 true。
 */
async function canReadDefaultsFile(deps: RpcDeps): Promise<boolean> {
  try {
    await deps.defaultsIo.readFile(deps.defaultsPath)
    return true
  } catch {
    return false
  }
}

/**
 * 读工具描述；缺席或读数抛错时返回 undefined（快照不携带 description）。
 * @param deps - 依赖注入面。
 * @returns 描述表或 undefined。
 */
function descriptionsOf(deps: RpcDeps): ReadonlyMap<string, string> | undefined {
  if (deps.descriptions === undefined) return undefined
  try {
    return deps.descriptions()
  } catch (error) {
    // 描述只是展示增强：读不到就不带，面板其余部分照常可用（一次 warn 够定位）。
    deps.log.warn(`无法读取工具描述（面板将不展示 description）：${messageOf(error)}`)
    return undefined
  }
}

/**
 * 组装成功值：现读快照 + 变更回执。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @param mutation - 变更回执。
 * @returns `ToggleValue`（`toggle` 与 `reset` 共享）。
 */
async function valueOf(deps: RpcDeps, session: SessionLike, mutation: Mutation): Promise<ToggleValue> {
  return { snapshot: await snapshotOf(deps, session), mutation }
}

/**
 * `toggle` 的回执：`applied` 逐地址给命中数，`kvRebuild` = 已生效 deny 集合是否变化。
 * @param report - 内核回执。
 * @param on - 请求里的开关方向（`applied[].on` 与它同源）。
 * @returns 契约形状的变更回执。
 */
function mutationOfToggle(report: ToggleReport, on: boolean): Mutation {
  return {
    applied: report.entries.map((entry) => ({ address: entry.text, on, matched: entry.matched })),
    // deny 的变化量 = 可见数的反向变化（层未就绪时两侧都是 0，于是为 0）。
    hiddenTools: report.visibleBefore - report.visibleAfter,
    visibleBefore: report.visibleBefore,
    visibleAfter: report.visibleAfter,
    kvRebuild: report.schemaChanged,
    notices: mutationNotices(report.persistFailed),
  }
}

/**
 * `reset` 的回执：`applied` = 被移除的关闭项（`on` 恒为 true，D20 写死的字段语义）。
 * @param report - 内核回执。
 * @param before - 变更前读数（被移除项与它们的命中数）。
 * @returns 契约形状的变更回执。
 */
function mutationOfReset(report: ResetReport, before: PanelReading): Mutation {
  const remaining = new Set(report.snapshot)
  const applied: MutationApplied[] = before.closed
    .filter((entry) => !remaining.has(entry.text))
    .map((entry) => ({ address: entry.text, on: true, matched: entry.matched }))
  return {
    applied,
    hiddenTools: report.visibleBefore - report.visibleAfter,
    visibleBefore: report.visibleBefore,
    visibleAfter: report.visibleAfter,
    kvRebuild: report.schemaChanged,
    notices: mutationNotices(report.persistFailed),
  }
}

/**
 * 变更回执的提示码。
 *
 * 只可能是「状态没写进会话日志、已降级内存态」（`persistence-degraded`）：`defaults-corrupt`
 * 属默认档读面、`session-subagent` 属会话身份，都不随一次变更变化；`layerFailed`（掩码没更新）
 * 在契约里没有对应码，按 §2.3 只进宿主日志。
 * @param persistFailed - 内核的写日志失败标记。
 * @returns 提示码（可能为空）。
 */
function mutationNotices(persistFailed: boolean): readonly NoticeCode[] {
  return persistFailed ? ['persistence-degraded'] : []
}

// ---------------------------------------------------------------------------
// 默认档写入
// ---------------------------------------------------------------------------

/** 默认档写入的一次尝试：成功给内核回执，失败给一条可直接出网的信封。 */
type DefaultsAttempt =
  | { readonly ok: true; readonly report: DefaultsWriteReport }
  | { readonly ok: false; readonly failure: RpcEnvelope<never> }

/**
 * 调内核写默认档，并把**写盘失败**折成 `defaults-unwritable`。
 *
 * `updateDefaults` 的文档契约是「唯一抛错来源是 `writeDefaults`」（R14），因此这里把它的
 * 任何抛错都映射成 `defaults-unwritable`，`{path, reason}` 由本文件组装（R17）；业务拒绝
 * （地址校验失败）仍是值，映射成 `bad-request`。
 * @param deps - 依赖注入面。
 * @param action - 四种写动作。
 * @param addresses - 地址原文（`reset` 为空）。
 * @returns 写入回执或失败信封。
 */
async function writeDefaultsOf(
  deps: RpcDeps,
  action: DefaultsAction,
  addresses: readonly string[],
): Promise<DefaultsAttempt> {
  try {
    // `DefaultsAction` 与 `DefaultsMode` 是同一组四个字面量（契约 §2.2 / 内核 §3.7），直传。
    return settled(await kernelOf(deps).updateDefaults(deps, action, addresses))
  } catch (error) {
    const reason = messageOf(error)
    deps.log.warn(`默认档写入失败（${deps.defaultsPath}）：${reason}`)
    return {
      ok: false,
      failure: failure('defaults-unwritable', `默认档写入失败（${deps.defaultsPath}）：${reason}`, {
        path: deps.defaultsPath,
        reason,
      }),
    }
  }
}

/**
 * 把内核的成功/业务拒绝折成 {@link DefaultsAttempt}。
 * @param outcome - 内核结果。
 * @returns 写入回执或 `bad-request` 信封。
 */
function settled(outcome: Awaited<ReturnType<typeof updateDefaults>>): DefaultsAttempt {
  if (outcome.ok) return { ok: true, report: outcome.report }
  return { ok: false, failure: failure('bad-request', outcome.text, { issues: outcome.text }) }
}

// ---------------------------------------------------------------------------
// 信封与小工具
// ---------------------------------------------------------------------------

/**
 * 响应自检：宿主**自己产出**的成功值必须先过契约 parser 才能出网。
 *
 * 不合契约说明本端产出与 `contract.ts` 漂移（是 bug，不是客户端错误），因此映射 `internal`
 * 并 warn——让 client 拿到 `bad-response`「响应不可识别」只会丢掉排障线索。
 * @param parsed - 响应 parser 的结果。
 * @param deps - 依赖注入面（warn 出口）。
 * @param subject - 被校验的值叫什么（进文案与日志）。
 * @returns 成功信封，或 `internal`。
 */
function checked<T>(parsed: Parsed<T>, deps: RpcDeps, subject: string): RpcEnvelope<T> {
  if (parsed.ok) return { ok: true, value: parsed.value }
  const message = `响应自检失败：宿主产出的「${subject}」不合契约：${parsed.message}`
  deps.log.warn(message)
  return failure('internal', message)
}

/**
 * 构造一条失败信封。
 * @param code - 宿主失败码（只取 `HOST_FAILURE_CODES` 里的 7 个）。
 * @param message - 二级说明。
 * @param details - 结构化细节（缺省 `{}`，`internal` 用得上）。
 * @returns 失败信封。
 */
function failure(
  code: HostFailureCode,
  message: string,
  details: RpcFailureDetails = {},
): RpcEnvelope<never> {
  return { ok: false, error: { code, message, details } }
}

/**
 * 预检失败的结论。
 * @param failure_ - 失败信封。
 * @returns `{ok:false}` 结论。
 */
function rejected(failure_: RpcEnvelope<never>): AddressCheck {
  return { ok: false, failure: failure_ }
}

/**
 * 端点段是否属于本通道的端点集。
 * @param value - 通道给的端点段。
 * @returns 是已知端点时为 true（同时收窄类型，供 `REQUEST_PARSERS` 索引）。
 */
function isEndpoint(value: string): value is SessionToolToggleEndpoint {
  return (ENDPOINTS as readonly string[]).includes(value)
}

/**
 * 取注入的内核（缺省真实内核）。
 * @param deps - 依赖注入面。
 * @returns 内核用例组。
 */
function kernelOf(deps: RpcDeps): RpcKernel {
  return deps.kernel ?? DEFAULT_KERNEL
}

/**
 * 去重（保持首次出现序）。
 * @param texts - 文本列表。
 * @returns 去重后的新数组。
 */
function uniqueTexts(texts: readonly string[]): readonly string[] {
  return Array.from(new Set(texts))
}

/**
 * 取错误文案（非 `Error` 也不会抛）。
 * @param error - 任意值。
 * @returns 文案。
 */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return String(error)
  } catch {
    return '不可渲染的错误'
  }
}
