/**
 * Connection RPC 通道的宿主半 dispatcher：端点派发 → 契约 parser → 控制内核 → 信封映射。
 *
 * 本模块是**纯逻辑**：不认识 Cordis、不注册通道、不写任何宿主状态；所有宿主面（状态端口、
 * 层句柄、默认档 IO、全局层读数、agent 表、诊断出口、工作区档端口与会话归属）都由
 * {@link RpcDeps} 注入，因此九条失败码与五条成功路径都能用假端口在单测里驱动
 * （`test/rpc.test.ts`）。通道挂载属任务 9.5
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
 * 4. **地址预检**（R17 的 9.5 前置裁定）：`toggle` / `defaults` / `workspace` 的地址先用
 *    `address.ts` 的 `parseAddress` 逐条解析——`protected-tool` → `protected`（`{names}`）、
 *    `reserved-tool` → `reserved`（`{names}`）、其余 → `bad-address`（`{address, parseCode}`）；
 *    **全部通过后才调内核**（内核内部会再校验一次，幂等、不必改 `control.ts`）；
 * 5. **调内核**（`control.ts` 的用例；`updateDefaults` 的写盘失败 → `defaults-unwritable`，
 *    `updateWorkspaceDefaults` 的写盘失败 → `workspace-unwritable`，`details = {path, reason}`
 *    由本文件组装）；工作区目标无法归属 / 未登记 → `workspace-unresolved`（`{subject}`）；
 * 6. **技能收敛**（H10 / D-4）：`toggle` 在组装成功值**之前** `await layer.skillsSettled()`，
 *    否则回执里的 `hiddenSkills` 与快照里的技能行会读到「影子 stub 还没注册」的中间态；
 * 7. **响应自检**：成功值先过对应的响应 parser，不合契约说明**本端产出**与契约漂移 → `internal`
 *    并 warn（这不是客户端错误，交给 client 只会被归成 `bad-response`，排障价值更低）；
 * 8. **信封**：`{ok:true, value}` 或 `{ok:false, error:{code, message, details}}`。
 *
 * 失败码只用 `HOST_FAILURE_CODES` 的 9 个：`unavailable` / `bad-response` 是 client 合成的
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
  parseWorkspaceValue,
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
  type WorkspaceChoice,
  type WorkspaceRequest,
  type WorkspaceUnresolvedDetails,
  type WorkspaceValue,
  type WorkspaceView,
} from '../contract.ts'
import { parseAddress } from './address.ts'
import {
  readPanel,
  resetSession,
  toggleSession,
  updateDefaults,
  updateWorkspaceDefaults,
} from './control.ts'
import type {
  DefaultsWriteReport,
  PanelReading,
  ResetReport,
  ToggleReport,
  WorkspaceDefaultsReport,
  WorkspaceTarget,
} from './control.ts'
import { EMPTY_DEFAULTS } from './defaults.ts'
import { buildPanelSnapshot } from './panel.ts'
import { EMPTY_WORKSPACES, disabledOf, readWorkspaces } from './workspaces.ts'
import type { WorkspaceDefaultsFile } from './workspaces.ts'
import type {
  AgentLike,
  ControlDeps,
  DefaultsFile,
  DefaultsIo,
  NoticeCode,
  PanelInputs,
  SessionLike,
  SkillLayerSnapshot,
  WorkspaceAttribution,
  WorkspacePanelInputs,
} from './types.ts'

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
 * 用例的注入面（缺省 = `control.ts` 的真实内核）。
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
  /** `workspace` 端点的写入用例（唯一写入路径，任务 H7）。 */
  readonly updateWorkspaceDefaults: typeof updateWorkspaceDefaults
}

/**
 * 解析关闭集里的技能地址用的空保护名单。
 *
 * 技能地址没有保护基线（D15），传空集只问文法与形状；工具地址的保护 / 保留名判定已经由
 * 内核与预检完成，这里不需要重复。
 */
const NO_PROTECTED_NAMES: ReadonlySet<string> = new Set()

/** 真实内核（冻结：注入面缺省值时不让调用方改到别的模块）。 */
const DEFAULT_KERNEL: RpcKernel = Object.freeze({
  toggleSession,
  resetSession,
  readPanel,
  updateDefaults,
  updateWorkspaceDefaults,
})

/**
 * dispatcher 的依赖注入面。
 *
 * `ControlDeps` 的全部字段（状态端口、层句柄、默认档路径与 IO、保护名单、全局层读数、日志、
 * 工作区档四件套）与命令面**共用同一份对象**——这正是 D14「不存在两份状态」在类型上的表达；
 * 这里只补三件命令面不需要的东西：agent 表（判 `session-not-live`）、可选的描述读数与可选的
 * 单测内核。
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
  | WorkspaceUnresolvedDetails
  /** `internal` 的细节：契约为空对象（不携带结构化信息）。 */
  | Record<string, never>

/** 一条失败：码只取宿主 9 个，`details` 是附录 §2.3 表里的六种形状之一或空对象。 */
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
    case 'workspace':
      return await handleWorkspace(deps, parsed.value as WorkspaceRequest)
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

  // ⑥ 技能收敛（H10）：影子 stub 的注册是异步的（D-4），必须先等它结算再取快照/回执，
  // 否则 `hiddenSkills` 与技能行都会读到「还没生效」的中间态。
  await settledSkills(deps, live.session)

  const value = await valueOf(
    deps,
    live.session,
    mutationOfToggle(outcome.report, request.on, settledShadowedOf(deps, live.session)),
  )
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
  // ⑥ 技能收敛（H10 / D-4）：reset 同样可能增删技能关闭项，回执数字取收敛后的「已生效」口径。
  await settledSkills(deps, live.session)
  const value = await valueOf(
    deps,
    live.session,
    mutationOfReset(report, before, settledShadowedOf(deps, live.session)),
  )
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
// workspace 端点（第 5 端点，H10）
// ---------------------------------------------------------------------------

/** 工作区目标解析的结论：工作区键 + 展示元数据 + 交给内核的寻址形态。 */
interface ResolvedWorkspace {
  /** 工作区键（规范绝对路径）。 */
  readonly key: string
  /** 是否由 workspaceRegistry 登记。 */
  readonly registered: boolean
  /** 已登记工作区的显示标题（未登记时缺省）。 */
  readonly title?: string
  /** 交给 `updateWorkspaceDefaults` 的寻址形态（写入动作才用得上）。 */
  readonly target: WorkspaceTarget
}

/** 目标解析的结果：解析成功，或一条可直接出网的失败信封。 */
type WorkspaceResolution =
  | { readonly ok: true; readonly resolved: ResolvedWorkspace }
  | { readonly ok: false; readonly failure: RpcEnvelope<never> }

/**
 * `workspace`：工作区级默认档的读 / 写（两种寻址形态，动作缺省 `read`）。
 *
 * 顺序：**目标解析 → 地址预检 → 读路径直接读档 / 写路径调内核 → 组装 → 响应自检**。
 * 读与写共享同一份目标解析，「面板显示哪个工作区」和「写到哪个键」因此不会分叉。
 *
 * 关键语义（R6 / D-11）：
 *
 * - `{sessionId}` 的归属来自 `deps.workspaceOf`——cwd 缺失或 realpath 全程失败 → `undefined`
 *   → `workspace-unresolved{subject: sessionId}`；目录**未登记**但存在仍是合法归属
 *   （`registered:false`），不返回失败；
 * - `{workspacePath}` 只接受已登记工作区的规范路径（`deps.workspaceChoices` 精确匹配），
 *   未登记 → `workspace-unresolved{subject: 路径原文}`；
 * - 写盘失败（`writeWorkspaces` 抛错）→ `workspace-unwritable`，`details = {path, reason}`。
 *
 * @param deps - 依赖注入面。
 * @param request - 已过请求 parser 的 `workspace` 请求。
 * @returns 成功值（`parseWorkspaceValue` 自检后）或失败信封。
 */
async function handleWorkspace(deps: RpcDeps, request: WorkspaceRequest): Promise<RpcEnvelope<unknown>> {
  const resolution = await resolveWorkspace(deps, request)
  if (!resolution.ok) return resolution.failure
  const resolved = resolution.resolved
  const action = request.action ?? 'read'

  // 地址预检与 toggle/defaults 同一套：保护 > 保留名 > 文法（read/reset 没有地址）。
  if (request.addresses !== undefined) {
    const precheck = precheckAddresses(request.addresses, deps.protectedNames)
    if (!precheck.ok) return precheck.failure
  }

  const choices = choicesOf(deps)
  if (action === 'read') {
    const reading = await workspaceFileOf(deps)
    const value: WorkspaceValue = {
      workspace: workspaceViewOf(deps, resolved, disabledOf(reading.file, resolved.key), reading),
      choices,
      // read 不写任何东西（契约字段语义）。
      changed: [],
    }
    return checked(parseWorkspaceValue(value), deps, 'workspace 响应')
  }

  const attempt = await writeWorkspaceOf(deps, resolved, action, request.addresses ?? [], workspaceSubjectOf(request))
  if (!attempt.ok) return attempt.failure

  const report = attempt.report
  // 写成功即文件内容：原子替换写入的就是 `report.after`，不再读回（读回可能看到别的进程的
  // 并发改动，把「我刚写成功」说成损坏）。`changed` 与 defaults 端点同构：写后的整份集合。
  const disabled = disabledOf(report.after, report.key)
  const value: WorkspaceValue = {
    workspace: workspaceViewOf(deps, resolved, disabled, {
      file: report.after,
      readable: true,
      corrupt: false,
    }),
    choices,
    changed: [...disabled],
  }
  return checked(parseWorkspaceValue(value), deps, 'workspace 响应')
}

/**
 * 解析请求里的工作区目标。
 *
 * `{sessionId}` 先过会话三步校验（会话不在 → `session-not-live`，不猜归属）；`{workspacePath}`
 * 只看 `workspaceChoices`（登记集合的 key 已是 realpath，R6 把「未登记」定为这一形态的唯一
 * 失败条件）。
 *
 * @param deps - 依赖注入面。
 * @param request - 请求体（parser 保证两种形态恰好出现一种）。
 * @returns 目标，或失败信封。
 */
async function resolveWorkspace(
  deps: RpcDeps,
  request: WorkspaceRequest,
): Promise<WorkspaceResolution> {
  if (request.sessionId !== undefined) {
    const live = liveSessionOf(deps, request.sessionId)
    if (!live.ok) return { ok: false, failure: live.failure }
    const attribution = await attributionOf(deps, live.session)
    if (attribution === undefined) {
      return {
        ok: false,
        failure: failure(
          'workspace-unresolved',
          `会话「${request.sessionId}」的 cwd 无法归属工作区（cwd 缺失或目录已被删除）`,
          { subject: request.sessionId },
        ),
      }
    }
    return {
      ok: true,
      resolved: {
        key: attribution.key,
        registered: attribution.registered,
        ...(attribution.title === undefined ? {} : { title: attribution.title }),
        target: { kind: 'session', session: live.session },
      },
    }
  }

  // parser 已保证 `workspacePath` 存在且以 `/` 开头；这里只问「登记了吗」。
  const path = request.workspacePath ?? ''
  const choice = choicesOf(deps).find((item) => item.key === path)
  if (choice === undefined) {
    return {
      ok: false,
      failure: failure('workspace-unresolved', `路径「${path}」不是已登记的工作区（只接受工作区路径下拉里的规范路径）`, {
        subject: path,
      }),
    }
  }
  return {
    ok: true,
    resolved: {
      key: choice.key,
      registered: true,
      title: choice.title,
      target: { kind: 'path', path: choice.key },
    },
  }
}

/**
 * 读一次会话归属；读数抛错时降级为 `undefined`（面板/端点按「无法归属」处理，不让整个端点
 * 变成 internal——归属失败本身就是 `workspace-unresolved` 的语义）。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 归属结果或 undefined。
 */
async function attributionOf(
  deps: RpcDeps,
  session: SessionLike,
): Promise<WorkspaceAttribution | undefined> {
  try {
    return await deps.workspaceOf(session)
  } catch (error) {
    deps.log.warn(`读取会话 ${session.id} 的工作区归属失败：${messageOf(error)}`)
    return undefined
  }
}

/**
 * 读工作区下拉可选项；registry 读数抛错时降级为空数组（R6：缺席只降级）。
 * @param deps - 依赖注入面。
 * @returns 可选项（可能为空）。
 */
function choicesOf(deps: RpcDeps): readonly WorkspaceChoice[] {
  try {
    return deps.workspaceChoices()
  } catch (error) {
    deps.log.warn(`读取已登记工作区失败（工作区下拉将为空）：${messageOf(error)}`)
    return []
  }
}

/** 工作区档的一份读数（含「不存在 / 损坏」两态）。 */
interface WorkspaceFileReading {
  /** 读到的档内容（降级时是 `EMPTY_WORKSPACES`）。 */
  readonly file: WorkspaceDefaultsFile
  /** 文件可读（false = 不存在，按空档处理）。 */
  readonly readable: boolean
  /** 文件存在但损坏 / 半写（已降级空档）。 */
  readonly corrupt: boolean
}

/**
 * 读工作区档并区分两态。
 *
 * `readWorkspaces` 把「不存在 / 损坏 / schema 不符」都折成同一份 `EMPTY_WORKSPACES`，线上
 * 视图却要两态区分。只有落到降级常量时才补一次只读探测：读得到 = 文件存在但不可用
 * （`corrupt`），读不到 = 不存在（按空档处理，不算损坏）；文件正常时不多读一遍。
 * @param deps - 依赖注入面。
 * @returns 档内容 + 两态标记。
 */
async function workspaceFileOf(deps: RpcDeps): Promise<WorkspaceFileReading> {
  const file = await readWorkspaces(deps.workspacesPath, deps.workspacesIo, deps.log)
  if (file !== EMPTY_WORKSPACES) return { file, readable: true, corrupt: false }
  const readable = await canReadFile(deps.workspacesIo, deps.workspacesPath)
  return { file, readable, corrupt: readable }
}

/**
 * 把工作区档读数投影成契约形状的视图。
 * @param deps - 依赖注入面（工作区档路径）。
 * @param resolved - 已解析的目标（键 / 登记态 / 标题）。
 * @param disabled - 该键当前的关闭集。
 * @param reading - 档读数（两态）。
 * @returns 契约形状的工作区视图。
 */
function workspaceViewOf(
  deps: RpcDeps,
  resolved: ResolvedWorkspace,
  disabled: readonly string[],
  reading: WorkspaceFileReading,
): WorkspaceView {
  return {
    key: resolved.key,
    ...(resolved.title === undefined ? {} : { title: resolved.title }),
    registered: resolved.registered,
    disabled: [...disabled],
    path: deps.workspacesPath,
    readable: reading.readable,
    corrupt: reading.corrupt,
  }
}

/** 工作区档写入的一次尝试：成功给内核回执，失败给一条可直接出网的信封。 */
type WorkspaceWriteAttempt =
  | { readonly ok: true; readonly report: WorkspaceDefaultsReport }
  | { readonly ok: false; readonly failure: RpcEnvelope<never> }

/**
 * 调内核写工作区档，并映射两条失败码。
 *
 * - `updateWorkspaceDefaults` 的**业务拒绝**（目标二次解析失败 / 地址校验失败）→
 *   `workspace-unresolved`：地址已由本文件预检过，能走到这里的业务拒绝只剩「目标没法解析」
 *   这一种；`subject` 取请求里的原值，与解析阶段的码同一形状；
 * - **抛错** = `writeWorkspaces` 的原始错误（与 `updateDefaults` 同一纪律）→
 *   `workspace-unwritable`，`{path, reason}` 由本文件组装。
 *
 * @param deps - 依赖注入面。
 * @param resolved - 已解析的目标。
 * @param action - `set` / `off` / `on` / `reset`（read 不会到这里）。
 * @param texts - 地址原文（`reset` 为空）。
 * @param subject - 失败时 `workspace-unresolved` 的细节主体（会话 id 或路径原文）。
 * @returns 写入回执或失败信封。
 */
async function writeWorkspaceOf(
  deps: RpcDeps,
  resolved: ResolvedWorkspace,
  action: NonNullable<WorkspaceRequest['action']>,
  texts: readonly string[],
  subject: string,
): Promise<WorkspaceWriteAttempt> {
  try {
    const outcome = await kernelOf(deps).updateWorkspaceDefaults(deps, resolved.target, action, texts)
    if (!outcome.ok) {
      return {
        ok: false,
        failure: failure('workspace-unresolved', outcome.text, { subject }),
      }
    }
    return { ok: true, report: outcome.report }
  } catch (error) {
    const reason = messageOf(error)
    deps.log.warn(`工作区档写入失败（${deps.workspacesPath}）：${reason}`)
    return {
      ok: false,
      failure: failure('workspace-unwritable', `工作区档写入失败（${deps.workspacesPath}）：${reason}`, {
        path: deps.workspacesPath,
        reason,
      }),
    }
  }
}

/**
 * 取请求的失败主体（会话 id 优先，其次路径原文）。
 * @param request - `workspace` 请求（parser 保证两种形态恰好出现一种）。
 * @returns 用于 `workspace-unresolved.details.subject` 的文本。
 */
function workspaceSubjectOf(request: WorkspaceRequest): string {
  return request.sessionId ?? request.workspacePath ?? ''
}

/**
 * 等本会话的技能收敛结算（`toggle` 回执前，H10 / D-4）。
 *
 * 层未就绪（会话活着但层还没挂上）时没有可等的东西；读数抛错只 warn——技能是软分面，
 * 它的收敛失败不该让一次开关变成失败。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 */
async function settledSkills(deps: RpcDeps, session: SessionLike): Promise<void> {
  const layer = deps.layerFor(session.id)
  if (layer === undefined) return
  try {
    await layer.skillsSettled()
  } catch (error) {
    deps.log.warn(`等待会话 ${session.id} 的技能收敛失败：${messageOf(error)}`)
  }
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
 * 读数复用控制内核的 `readPanel`（三读并集、默认档、工作区视图、保护名单都在里面），因此
 * 面板与 `/tools status` 看到的永远是同一组事实（D14）；这里只补 `readPanel` 不产出的三样：
 * 默认档的 `readable` / `corrupt` 两态、技能原始读数（`layer.skills()`，投影在 `panel.ts`）
 * 与提示码。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 契约形状的面板快照（与 `panel.ts` 的宿主侧形状由交叉可赋值锁住一致）。
 */
async function snapshotOf(deps: RpcDeps, session: SessionLike): Promise<PanelSnapshot> {
  const reading = await kernelOf(deps).readPanel(deps, session)
  const defaultsState = await defaultsStateOf(deps, reading.defaults)
  const descriptions = descriptionsOf(deps)
  const skills = skillsOf(deps, session)
  const workspace = workspacePanelInputsOf(reading)

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
    // 提示码的分工（H6）：构建器只排序去重，技能两条由组装层从技能分面与关闭集推导。
    notices: noticesOf(session, reading, skills),
    // 技能行与工作区视图的**投影**在 `panel.ts` 构建器里（H6）：这里只交原始读数，
    // 面板、`/tools status` 与命令面因此共享同一份事实（D14）。
    ...(skills === undefined ? {} : { skills }),
    ...(workspace === undefined ? {} : { workspace }),
    ...(descriptions === undefined ? {} : { descriptions }),
  }
  return buildPanelSnapshot(inputs)
}

/**
 * 读本会话的技能分面（`layer.skills()`）。
 *
 * 层未就绪或缺席时返回 `undefined`：构建器按「技能不可用」处理，面板其余部分照常可用
 * （R6：软注入缺席只降级）。读数抛错同样降级——技能是软分面，不该让整个快照失败。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 技能分面读数或 undefined。
 */
function skillsOf(deps: RpcDeps, session: SessionLike): SkillLayerSnapshot | undefined {
  const layer = deps.layerFor(session.id)
  if (layer === undefined) return undefined
  try {
    return layer.skills()
  } catch (error) {
    deps.log.warn(`读取会话 ${session.id} 的技能分面失败（面板将按不可用处理）：${messageOf(error)}`)
    return undefined
  }
}

/**
 * 把控制读数的 `workspace` 视图转成面板构建器的入参（归属 + 该键的关闭集 + 路径与两态）。
 *
 * 复用 `readPanel` 已算好的 `WorkspaceView`（`control.ts` 的 `workspaceViewOf`），不再重复
 * 调 `workspaceOf` / 读工作区档：一次面板请求因此只有一份归属读数与一次文件读（D14 的
 * 「不存在两份状态」同样适用于只读面）。`null` = 归属失败，面板只展示用户级默认档
 * （R6：fail-closed 只作用于工作区档，不阻塞面板）。
 * @param reading - 控制内核的只读读数。
 * @returns 面板的工作区输入或 undefined。
 */
function workspacePanelInputsOf(reading: PanelReading): WorkspacePanelInputs | undefined {
  const view = reading.workspace
  if (view === null) return undefined
  return {
    attribution: {
      key: view.key,
      registered: view.registered,
      ...(view.title === undefined ? {} : { title: view.title }),
    },
    disabled: view.disabled,
    path: view.path,
    readable: view.readable,
    corrupt: view.corrupt,
  }
}

/**
 * 组装提示码：会话身份一条 + 技能分面两条。
 *
 * `persistence-degraded` / `defaults-corrupt` 由构建器从 `storeKind` / `defaultsCorrupt` 自行
 * 补出（面板不轻信单个字段）；`session-subagent` 属会话身份，`skills-unavailable` /
 * `skill-shadow-failed` 属技能分面——后两者必须在**有技能读数的地方**（本函数）推导，
 * 构建器只负责排序去重（见 `panel.ts` 的 `noticesOf` 分工说明）。
 *
 * @param session - 目标会话。
 * @param reading - 控制内核的只读读数（关闭集来自这里，与技能行同一份状态）。
 * @param skills - 技能分面读数（层未就绪 / 读数失败时 undefined）。
 * @returns 提示码（可能为空）。
 */
function noticesOf(
  session: SessionLike,
  reading: PanelReading,
  skills: SkillLayerSnapshot | undefined,
): readonly NoticeCode[] {
  const notices: NoticeCode[] = originOf(session) === 'subagent' ? ['session-subagent'] : []
  notices.push(...skillNoticesOf(reading, skills))
  return notices
}

/**
 * 技能分面的两条提示码。
 *
 * - `skills-unavailable`：层缺席或 `skills` 服务不可用（开关只记意图，影子 stub 不生效）；
 * - `skill-shadow-failed`：同层同名先到先得导致 stub 未胜出。判据按组 3 的终形态
 *   `disabled ∧ visible ∧ ¬shadowed`——技能在关闭集里（意图）、模型仍能调用（没有 stub 压住）、
 *   且本层没有登记影子 stub。`tool:skill` 整档关闭时 shadowNames 刻意为空（D16），逐项意图
 *   保留但不应报「影子失败」，因此整档关闭时直接跳过。
 *
 * @param reading - 控制内核的只读读数。
 * @param skills - 技能分面读数。
 * @returns 至多一条提示码。
 */
function skillNoticesOf(
  reading: PanelReading,
  skills: SkillLayerSnapshot | undefined,
): readonly NoticeCode[] {
  if (skills === undefined || !skills.available) return ['skills-unavailable']
  if (wholeSkillClosed(reading.state.disabled)) return []
  const visible = new Set(skills.visible.map((row) => row.name))
  const shadowed = new Set(skills.shadowed)
  const failed = disabledSkillNames(reading.state.disabled).some(
    (name) => visible.has(name) && !shadowed.has(name),
  )
  return failed ? ['skill-shadow-failed'] : []
}

/**
 * 关闭集里是否包含整档 `tool:skill`（`skill` / `skill:*` 已由 parser 归一）。
 * @param disabled - 关闭集原文。
 * @returns 命中整档时为 true。
 */
function wholeSkillClosed(disabled: readonly string[]): boolean {
  return disabled.some((text) => {
    const parsed = parseAddress(text, NO_PROTECTED_NAMES)
    return parsed.ok && parsed.address.kind === 'tool' && parsed.address.name === 'skill'
  })
}

/**
 * 关闭集里的逐项技能名（整档地址不算）。
 * @param disabled - 关闭集原文。
 * @returns 技能名（去重）。
 */
function disabledSkillNames(disabled: readonly string[]): readonly string[] {
  const names = new Set<string>()
  for (const text of disabled) {
    const parsed = parseAddress(text, NO_PROTECTED_NAMES)
    if (parsed.ok && parsed.address.kind === 'skill') names.add(parsed.address.name)
  }
  return Array.from(names)
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
  const readable = await canReadFile(deps.defaultsIo, deps.defaultsPath)
  return { readable, corrupt: readable }
}

/**
 * 问「读得到吗」（一次只读探测，默认档与工作区档共用）。
 *
 * 只问可读性，不解码内容：内容的好坏由各自 `readX` 的降级常量判定，两处不重复实现校验规则。
 * @param io - 文件读写端口。
 * @param path - 绝对路径。
 * @returns 端口 resolve 为 true。
 */
async function canReadFile(io: DefaultsIo, path: string): Promise<boolean> {
  try {
    await io.readFile(path)
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
 * 收敛后该 agent 视角的影子 stub 数：`hiddenSkills` 重算的「已生效」侧（D-4）。
 * 内核的 `report.hiddenSkills` 是 `setState` 后的同步初值，真实层的 stub 注册异步，
 * 收敛前读到旧集合会让回执谎报 0；以 `report.shadowedBefore` 为基准、本函数为
 * 收敛后读数重算。层未就绪 / 读数抛错返回 undefined——调用方回退内核同步初值。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 收敛后的影子 stub 数；不可得时 undefined。
 */
function settledShadowedOf(deps: RpcDeps, session: SessionLike): number | undefined {
  const layer = deps.layerFor(session.id)
  if (layer === undefined) return undefined
  try {
    return layer.skills().shadowed.length
  } catch (error) {
    deps.log.warn(`读取会话 ${session.id} 的技能分面失败：${messageOf(error)}`)
    return undefined
  }
}

/**
 * `toggle` 的回执：`applied` 逐地址给命中数，`kvRebuild` = 已生效 deny 集合是否变化。
 * @param report - 内核回执。
 * @param on - 请求里的开关方向（`applied[].on` 与它同源）。
 * @param settledShadowed - 收敛后的影子 stub 数（undefined = 层未就绪/读数失败，回退内核初值）。
 * @returns 契约形状的变更回执。
 */
function mutationOfToggle(report: ToggleReport, on: boolean, settledShadowed?: number): Mutation {
  // 技能部分取「已生效」口径（D-4）：收敛后的影子数 − 内核记录的收敛前基准；不可得时
  // 回退内核同步初值（假层 / 层未就绪）。`kvRebuild` 的技能项同步补齐，deny 项内核已算好。
  const hiddenSkills =
    settledShadowed !== undefined
      ? settledShadowed - report.shadowedBefore
      : report.hiddenSkills
  const skillsChanged =
    settledShadowed !== undefined && settledShadowed !== report.shadowedBefore
  return {
    applied: report.entries.map((entry) => ({ address: entry.text, on, matched: entry.matched })),
    // deny 的变化量 = 可见数的反向变化（层未就绪时两侧都是 0，于是为 0）。
    hiddenTools: report.visibleBefore - report.visibleAfter,
    // 影子 stub 集合的变化量（内核按技能分面初算，本层按收敛后读数重算，H7 / D-4）。
    hiddenSkills,
    visibleBefore: report.visibleBefore,
    visibleAfter: report.visibleAfter,
    kvRebuild: report.schemaChanged || skillsChanged,
    notices: mutationNotices(report.persistFailed),
  }
}

/**
 * `reset` 的回执：`applied` = 被移除的关闭项（`on` 恒为 true，D20 写死的字段语义）。
 * @param report - 内核回执。
 * @param before - 变更前读数（被移除项与它们的命中数）。
 * @param settledShadowed - 收敛后的影子 stub 数（undefined = 层未就绪/读数失败，回退内核初值）。
 * @returns 契约形状的变更回执。
 */
function mutationOfReset(
  report: ResetReport,
  before: PanelReading,
  settledShadowed?: number,
): Mutation {
  const remaining = new Set(report.snapshot)
  const applied: MutationApplied[] = before.closed
    .filter((entry) => !remaining.has(entry.text))
    .map((entry) => ({ address: entry.text, on: true, matched: entry.matched }))
  // 技能部分取「已生效」口径（同 mutationOfToggle，D-4）。
  const hiddenSkills =
    settledShadowed !== undefined
      ? settledShadowed - report.shadowedBefore
      : report.hiddenSkills
  const skillsChanged =
    settledShadowed !== undefined && settledShadowed !== report.shadowedBefore
  return {
    applied,
    hiddenTools: report.visibleBefore - report.visibleAfter,
    hiddenSkills,
    visibleBefore: report.visibleBefore,
    visibleAfter: report.visibleAfter,
    kvRebuild: report.schemaChanged || skillsChanged,
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
