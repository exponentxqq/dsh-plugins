/**
 * /zcode-plan 命令面（H14；code-design §3.7 五子命令 + H2 的固定日志事件词汇）。
 *
 * 三层结构：
 * - {@link parseZcodePlanInput}：**纯函数文法解析**——`rawInput`（命令名后的原文）
 *   → `{kind:'status'|'login'|'logout'|'route'|'refresh'|'bad'}`。容错：首尾空白、
 *   子命令前缀斜杠（`/status`）、`login <url>` 的 URL 参数原样透传（只在两端 trim，
 *   中间空白交给 flow 的 `parseCallbackUrl` 容错）；无法识别的子命令回
 *   `{kind:'bad'}`，由 handler 转 `{kind:'error', text: USAGE}`（§3.7）；
 * - {@link createZcodePlanCommand}：把文法接到五个 handler 上，产出命令定义
 *   （`name: 'zcode-plan'`）。回执一律 `{kind:'success'|'error', text}`，成功文案
 *   逐字照 §3.7 表；deps 全部走窄端口注入（driver / owner / credentials /
 *   configEditor / llm / status 快照源 / log），handler 内每次现取槽位——装配层的
 *   owner / driver 是会随 record-updated 重建的槽位变量，不能在注册时定型；
 * - {@link logEvent} + {@link LOG_EVENT_NAMES}：固定事件名的日志出口（H2 部分），
 *   以 `zcode-plan:<event> [key=value…]` 结构化行输出（`LogPort` 已带
 *   `zcode-plan：` 前缀，事件词直接作行首）。**只带码 / 时刻 / 布尔，不带值**。
 *
 * 上游 commands API 的消费面（0.2.1-rc.2 实测）：`commands.register({name,
 * description, input?: {hint}, handler}) → disposer`，handler 收
 * `{rawInput, signal}` 并返回 `{kind:'success', text?} | {kind:'error', text}`。
 * 这里照 `route-config.ts` 的端口纪律自持最小结构面
 * （{@link ZcodePlanCommandsPort} / {@link ZcodePlanCommandDefinition}），**零新增
 * 依赖**（不 devDep `@deepseek-ai/dsh-commands`，结构兼容由装配层直传保证）。
 *
 * 机密纪律（D-12）：回执与事件行不含 JWT / PAT / Key 值——refresh 只报布尔比对
 * 与到期时刻（RE-3），logout 不回显任何被清值。
 *
 * @module dsh-plugin-zcode-plan/host/commands
 */

import { LOGIN_RECORD_KEY, PAT_REF } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import type { LoginDriver } from './login-flow.ts'
import type { PatOwner } from './pat-owner.ts'
import { installRoute, removeRoute, ROUTE_ID, type ConfigEditorPort } from './route-config.ts'
import { formatFullTime, readRouteState, renderRouteLine, renderStatus, type StatusLlmPort, type StatusSnapshot } from './status.ts'
import type { CredentialsPort, LogPort } from './ports.ts'

/** 命令名（§3.7；`COMMAND_NAME_PATTERN` 的 `[a-z][a-z0-9_-]*` 合法形态）。 */
export const COMMAND_NAME = 'zcode-plan'

/** 发现界面里的一句话说明。 */
export const COMMAND_DESCRIPTION =
  'zcode 计划桥接：BigModel 登录 / PAT 续期 / 路由注册与用量状态（login | logout | status | route | refresh）'

/** 自由输入的 placeholder（dsh-commands 的 `input.hint`）。 */
export const COMMAND_INPUT_HINT = '[login [回调URL] | logout | status | route [install|remove|status] | refresh]'

/**
 * 用法文案（未知子命令的 error 回执；风格照 `user-commands` 的
 * `INVENTORY_USAGE`——一行总文法 + 缩进子命令清单）。
 */
export const USAGE = [
  `用法：/${COMMAND_NAME} [login [回调URL] | logout | status | route [install|remove|status] | refresh]`,
  '  login                发起 BigModel 授权（浏览器完成后粘贴回调 URL）',
  '  login <回调URL>      提交粘贴的回调 URL，换发登录凭证',
  '  logout               退出登录并清除 ZCODE_PLAN_PAT（服务端 Key 保留）',
  '  status               查看登录 / Key / PAT / 路由 / 用量状态（缺省子命令）',
  '  route install        把 zcode-plan 路由写入 profile 层 providers',
  '  route remove         从 profile 层移除 zcode-plan 路由',
  '  route status         查看路由注册状态',
  '  refresh              立即换发一张 PAT',
].join('\n')

/** 固定日志事件名词汇表（H2 部分；装配层锚点翻译与本文件打点共用同一集合）。 */
export const LOG_EVENT_NAMES = [
  'pat_issued',
  'pat_refresh_deferred',
  'pat_refresh_failed',
  'key_created',
  'key_reused',
  'login_committed',
  'route_registered',
  'halted',
] as const

/** 事件名词汇的成员类型。 */
export type ZcodePlanLogEventName = (typeof LOG_EVENT_NAMES)[number]

/**
 * 打一行固定事件名的结构化日志（形如 `zcode-plan:pat_issued expiresAt=…`）；
 * `detail` 只允许码 / 时刻 / 布尔键值对——调用方不得把任何机密值拼进 detail。
 */
export function logEvent(log: LogPort, event: ZcodePlanLogEventName, detail?: string): void {
  log.info(detail === undefined || detail.length === 0 ? event : `${event} ${detail}`)
}

/** 文法解析产物（§3.7 逐字 kind 集合；`bad` 由 handler 转 `error + USAGE`）。 */
export type ParsedZcodePlanInput =
  | { readonly kind: 'status' }
  | { readonly kind: 'login'; readonly callbackUrl?: string }
  | { readonly kind: 'logout' }
  | { readonly kind: 'route'; readonly action: 'install' | 'remove' | 'status' }
  | { readonly kind: 'refresh' }
  | { readonly kind: 'bad' }

/**
 * 解析 `rawInput`（命令名之后的原文，§3.7 纯函数）。
 *
 * 规则：
 * - 空输入 / 纯空白 → `status`（缺省子命令）；
 * - 首 token 容错前缀斜杠（`/status`、`/login …`）；
 * - `login` 的参数取**首个空白之后到行尾的原文**（两端 trim，中间空白不压缩，
 *   原样交 flow 的 `parseCallbackUrl`）；其余子命令不接受多余 token；
 * - `route` 缺参 = `status`；`route` 的未知动作与其余未知子命令 → `bad`。
 */
export function parseZcodePlanInput(rawInput: string): ParsedZcodePlanInput {
  const trimmed = rawInput.trim()
  if (trimmed.length === 0) return { kind: 'status' }
  const separator = /\s/.exec(trimmed)
  const head = (separator === null ? trimmed : trimmed.slice(0, separator.index)).replace(/^\//, '')
  const rest = separator === null ? '' : trimmed.slice(separator.index).trim()

  switch (head) {
    case 'status':
      return rest.length === 0 ? { kind: 'status' } : { kind: 'bad' }
    case 'login':
      return rest.length === 0 ? { kind: 'login' } : { kind: 'login', callbackUrl: rest }
    case 'logout':
      return rest.length === 0 ? { kind: 'logout' } : { kind: 'bad' }
    case 'refresh':
      return rest.length === 0 ? { kind: 'refresh' } : { kind: 'bad' }
    case 'route': {
      if (rest.length === 0) return { kind: 'route', action: 'status' }
      const restTokens = rest.split(/\s+/)
      const action = restTokens[0]?.replace(/^\//, '') ?? ''
      const isKnown = action === 'install' || action === 'remove' || action === 'status'
      return isKnown && restTokens.length === 1 ? { kind: 'route', action } : { kind: 'bad' }
    }
    default:
      return { kind: 'bad' }
  }
}

/** 命令回执（§3.7 的 `CommandResult` 结构窄面；与上游 `CommandResult` 结构兼容）。 */
export type ZcodePlanCommandResult =
  | { readonly kind: 'success'; readonly text?: string }
  | { readonly kind: 'error'; readonly text: string }

/** handler 收到的调用面（只消费 `rawInput` 与可选取消信号；与上游 invocation 结构兼容）。 */
export interface ZcodePlanCommandInvocation {
  readonly rawInput: string
  readonly signal?: AbortSignal
}

/** 命令定义（结构窄面；装配层直传上游 `commands.register`）。 */
export interface ZcodePlanCommandDefinition {
  readonly name: typeof COMMAND_NAME
  readonly description: string
  readonly input?: { readonly hint: string }
  readonly handler: (invocation: ZcodePlanCommandInvocation) => ZcodePlanCommandResult | Promise<ZcodePlanCommandResult>
}

/** commands 服务的消费窄面（真实现是 dsh-commands 的 `CommandRuntime`）。 */
export interface ZcodePlanCommandsPort {
  /** 注册命令并返回撤销 disposer（装配层把 disposer 交给 scope.effect）。 */
  register(definition: ZcodePlanCommandDefinition): () => void
}

/** logout 消费的 credentials 窄面（只清两处：登录记录 + PAT ref）。 */
export type LogoutCredentialsPort = Pick<CredentialsPort, 'deleteRecord' | 'unset'>

/** {@link createZcodePlanCommand} 的依赖注入面（槽位全部经 getter 现取）。 */
export interface ZcodePlanCommandDeps {
  /** 登录 driver 槽位（credentials+authorization 齐备时才有）。 */
  readonly driver: () => LoginDriver | undefined
  /** PAT owner 槽位（record-updated 重建；logout 后被装配层清空）。 */
  readonly owner: () => PatOwner | undefined
  /** credentials 槽位（logout 清记录与 ref 用；缺席时 logout 降级报错）。 */
  readonly credentials: () => LogoutCredentialsPort | undefined
  /** config-editor 槽位（route install/remove 用；缺席时 route 变更降级报错）。 */
  readonly configEditor: () => ConfigEditorPort | undefined
  /** llm 目录槽位（route install 验证 + route status 两读）。 */
  readonly llm: () => StatusLlmPort | undefined
  /** status 快照源（装配层的采集器；usage 只读一次，signal 透传取消）。 */
  readonly status: (signal?: AbortSignal) => Promise<StatusSnapshot>
  /** logout 完成后的装配侧回调（清 owner 槽位，status 不再读到 stale 租约）。 */
  readonly afterLogout?: () => void
  /** refresh 成功后的装配侧回调（signed-channel：签名计数重置 + 新 PAT 预握手联动）。 */
  readonly afterRefresh?: () => void
  /** 诊断出口（route install/remove 透传 + refresh 成功打 `pat_issued` 事件）。 */
  readonly log: LogPort
}

/** 失败摘要：桥错误出「码（脱敏文案）」，其余异常出名——值永不进回执。 */
function describeFailure(error: unknown): string {
  if (error instanceof BridgeError) return `${error.code}（${error.message}）`
  return error instanceof Error ? error.name : 'unknown'
}

/** 统一入口：文法解析 → 分发。未知文法回 `error + USAGE`。 */
async function handleZcodePlanCommand(
  rawInput: string,
  deps: ZcodePlanCommandDeps,
  signal: AbortSignal | undefined,
): Promise<ZcodePlanCommandResult> {
  const parsed = parseZcodePlanInput(rawInput)
  switch (parsed.kind) {
    case 'status': {
      const snapshot = await deps.status(signal)
      return { kind: 'success', text: renderStatus(snapshot) }
    }
    case 'login':
      return handleLogin(parsed.callbackUrl, deps)
    case 'logout':
      return handleLogout(deps)
    case 'route':
      return handleRoute(parsed.action, deps)
    case 'refresh':
      return handleRefresh(deps)
    case 'bad':
      return { kind: 'error', text: USAGE }
  }
}

/** `/zcode-plan login [url]`：无参 → `driver.begin()` 带授权链接回执；带参 → `driver.paste()`。 */
async function handleLogin(callbackUrl: string | undefined, deps: ZcodePlanCommandDeps): Promise<ZcodePlanCommandResult> {
  const driver = deps.driver()
  if (driver === undefined) {
    return { kind: 'error', text: '登录通道未就绪（宿主缺少 authorization 服务），无法处理登录' }
  }
  // 带回调 URL：喂给等待中的粘贴提问（原样透传，解析与 state 校验都在 flow 内）。
  if (callbackUrl !== undefined) {
    const pasted = driver.paste(callbackUrl)
    if (pasted.ok) return { kind: 'success', text: '已收到回调，正在换发登录凭证…' }
    return pasted.reason === 'no-attempt'
      ? { kind: 'error', text: '当前没有进行中的登录尝试；请先运行 /zcode-plan login 发起授权' }
      : { kind: 'error', text: '登录流程未在等待回调（可能已完成或已超时）；可运行 /zcode-plan status 查看状态' }
  }
  // 无参：发起（或回显在途）尝试；URL 缺（2s 无 notice）时退回 driver 的兜底文本。
  const begun = await driver.begin('/zcode-plan')
  if (begun.url === undefined) return { kind: 'success', text: begun.text }
  return {
    kind: 'success',
    text: `已发起 BigModel 授权。\n授权链接：${begun.url}\n完成浏览器授权后，把地址栏整条 URL 粘贴为：/zcode-plan login ${begun.url}`,
  }
}

/**
 * `/zcode-plan logout`（§3.7 顺序逐字）：abort 在途尝试 → 删登录记录 →
 * unset PAT ref → dispose owner（停续期循环）→ 通知装配层清槽位。
 * 任一步失败即中断并报码（状态保持一致：没清干净就不停续期）。
 */
async function handleLogout(deps: ZcodePlanCommandDeps): Promise<ZcodePlanCommandResult> {
  const credentials = deps.credentials()
  if (credentials === undefined) {
    return { kind: 'error', text: 'credentials 服务不可用，无法清除本机登录态' }
  }
  try {
    await deps.driver()?.abort()
    await credentials.deleteRecord(LOGIN_RECORD_KEY)
    await credentials.unset(PAT_REF)
    deps.owner()?.dispose()
    deps.afterLogout?.()
    return { kind: 'success', text: '已退出登录并清除 ZCODE_PLAN_PAT；服务端 Key 未被删除' }
  } catch (error) {
    return { kind: 'error', text: `退出登录失败：${describeFailure(error)}` }
  }
}

/** `/zcode-plan route [install|remove|status]`（缺参 status）；install/remove 走 H12 的幂等实现。 */
async function handleRoute(
  action: 'install' | 'remove' | 'status',
  deps: ZcodePlanCommandDeps,
): Promise<ZcodePlanCommandResult> {
  if (action === 'status') {
    return { kind: 'success', text: renderRouteLine(readRouteState(deps.llm())) }
  }
  const configEditor = deps.configEditor()
  if (configEditor === undefined) {
    return { kind: 'error', text: 'config-editor 服务不可用，无法读写 profile 层路由' }
  }
  try {
    if (action === 'install') {
      const result = await installRoute({ configEditor, llm: deps.llm(), log: deps.log })
      if (!result.ok && result.reason === 'no-llm-pi-ai-row') {
        return { kind: 'error', text: '当前 profile 没有 llm-pi-ai 行，路由无法自动注册' }
      }
      const registered = result.registered ?? (deps.llm()?.listProviders().some((provider) => provider.id === ROUTE_ID) ?? false)
      return registered
        ? { kind: 'success', text: '已写入 llm-pi-ai.providers.zcode-plan（profile 层）；当前路由已注册' }
        : { kind: 'success', text: '已写入 llm-pi-ai.providers.zcode-plan（profile 层）；llm 目录尚未注册，待宿主重载配置后生效' }
    }
    const result = await removeRoute({ configEditor, log: deps.log })
    if (!result.ok && result.reason === 'no-llm-pi-ai-row') {
      return { kind: 'error', text: '当前 profile 没有 llm-pi-ai 行，无法摘除路由' }
    }
    return { kind: 'success', text: '已从 profile 层移除 zcode-plan 路由；回退路由 zai-coding-cn 不受影响' }
  } catch (error) {
    return { kind: 'error', text: `路由变更失败：${describeFailure(error)}` }
  }
}

/**
 * `/zcode-plan refresh`：强制一次 `owner.ensure()`；回执只报「与上一张不同」的
 * 布尔比对（RE-3：同值显示「否」；首张无上一张记「是」）与到期时刻，**不报值**。
 * 成功打 `pat_issued` 事件（只带到期时刻）。
 */
async function handleRefresh(deps: ZcodePlanCommandDeps): Promise<ZcodePlanCommandResult> {
  const owner = deps.owner()
  if (owner === undefined) {
    return { kind: 'error', text: 'PAT 续期器未就绪（未登录或 credentials 服务不可用）；请先运行 /zcode-plan login' }
  }
  const previous = owner.current()
  try {
    const lease = await owner.ensure()
    const changed = previous === undefined || previous.pat !== lease.pat
    deps.afterRefresh?.()
    logEvent(deps.log, 'pat_issued', `expiresAt=${new Date(lease.expiresAt).toISOString()}`)
    return {
      kind: 'success',
      text: `已换发 PAT（与上一张不同：${changed ? '是' : '否'}）；有效期至 ${formatFullTime(lease.expiresAt)}`,
    }
  } catch (error) {
    return { kind: 'error', text: `PAT 换发失败：${describeFailure(error)}` }
  }
}

/**
 * 造 `/zcode-plan` 命令定义（H14）。返回对象结构兼容上游
 * `dsh-commands` 的 `CommandDefinition`（`handler` 只解构 `rawInput` / `signal`，
 * 参数面是上游 invocation 的超集形状，可直接交给 `commands.register`）。
 *
 * @param deps - 注入面（槽位 getter + 快照源 + log，见 {@link ZcodePlanCommandDeps}）。
 */
export function createZcodePlanCommand(deps: ZcodePlanCommandDeps): ZcodePlanCommandDefinition {
  return {
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    input: { hint: COMMAND_INPUT_HINT },
    handler: ({ rawInput, signal }) => handleZcodePlanCommand(rawInput, deps, signal),
  }
}
