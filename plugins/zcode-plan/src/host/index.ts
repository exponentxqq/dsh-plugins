/**
 * 插件主体：把 zcode 计划桥接到 dsh 宿主（T4 装配主体）。
 *
 * 本插件采用「零硬依赖」姿态（照 `user-commands`）：`inject` 常量为空数组，宿主侧
 * 全部能力面都经 `ctx.inject([...])` 软接入——凭证与授权（`credentials` /
 * `authorization`）、命令（`commands`）任一缺席都只让对应能力降级，不让插件本身
 * 加载失败。`apply` 的装配顺序（H2）：
 *
 * 1. 装 logger 端口并加装事件翻译层（{@link withEventHooks}）；client / keyManager
 *    与 owner / driver / credentials 槽位都提到 inject callback 之上共享；
 * 2. `ctx.inject(['credentials','authorization'], …)` 内：PAT_REF 冲突检测（R10，
 *    冲突即不注册 flow、不发布）→ 注册登录 flow（disposer 交给 `scope.effect`）→
 *    挂 `credentials/record-updated` 监听（本 key 重建 PAT owner，他 key 忽略）→
 *    启动时已有登录记录则拉起 PAT owner（失败仅日志，不抛）；
 * 3. `ctx.inject(['commands'], …)` 内注册 `/zcode-plan`（H14 五子命令：login /
 *    logout / status / route / refresh；disposer 交 `scope.effect`；owner / driver
 *    / credentials 全部槽位 getter 现取，未装配的能力逐条降级报错）；
 * 4. 全部副作用走 `ctx.effect` / `scope.effect` 拆卸（owner 定时器、flow 注册、
 *    命令注册、事件监听——`ctx.on` 本身即 cordis effect，随 fiber 自动摘除）。
 *
 * 日志事件（H2 部分）：{@link withEventHooks} 给诊断出口加装锚点翻译层，内部模块
 * 的固定文案行补一行 `zcode-plan:<event>`（pat_issued / pat_refresh_failed /
 * key_created / key_reused / login_committed / route_registered / halted）；
 * refresh 命令与启动拉起成功处在装配侧直接打 `pat_issued`。
 *
 * `inject` 常量之外，`apply` 对「连 `ctx.inject` 通道都不存在」的宿主形状也保持
 * 零注册零报错（能力整体缺席时直接返回）。
 *
 * @module dsh-plugin-zcode-plan/host
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationOutcome } from '@deepseek-ai/dsh-authorization'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials/types'
import Schema from '@deepseek-ai/schemastery'
import type { BigmodelClient } from './bigmodel/client.ts'
import { createBigmodelClient } from './bigmodel/client.ts'
import {
  SIGNING_RECORD_KEY,
  createSigner,
  installSigningFetch,
  type SigningKeyRecord,
  type SigningRecordPort,
  type Signer,
} from './bigmodel/signer.ts'
import {
  createZcodePlanCommand,
  logEvent,
  type ZcodePlanCommandsPort,
  type ZcodePlanLogEventName,
} from './commands.ts'
import { LOGIN_RECORD_KEY, PAT_REF, isPatRefConflict, readGrant } from './credential-record.ts'
import { BridgeError } from './errors.ts'
import type { KeyManager } from './key-manager.ts'
import { createKeyManager } from './key-manager.ts'
import { createLoginDriver, createLoginFlow, type AuthorizationFlow, type AuthorizationRequest, type LoginDriver } from './login-flow.ts'
import { createPatOwner, type PatOwner } from './pat-owner.ts'
import { createLogPort, nodeClock, nodeFetch, type CredentialsPort, type LogPort } from './ports.ts'
import type { ConfigEditorPort } from './route-config.ts'
import { readRouteState, readUsage, type StatusLlmPort, type StatusSnapshot } from './status.ts'

/** loader 诊断用的插件名（也是 bundle 行的 id）。 */
export const name = 'zcode-plan'

/**
 * 本插件不硬依赖任何服务。
 *
 * `credentials` / `authorization` / `commands` 全部走 `ctx.inject([...])` 软注入：
 * 无凭证服务的部署里登录流不会注册，无命令服务的部署里 `/zcode-plan` 不会出现，
 * 插件保持零注册零报错。
 */
export const inject: readonly string[] = []

/** 插件配置的运行时形状（schema 校验后的值）。 */
export interface ZcodePlanConfig {
  /** zcode 侧组织名（必填）。 */
  organization: string
  /** zcode 侧项目名（必填）。 */
  project: string
  /** 桥接请求使用的 zcode 客户端版本。 */
  clientVersion: string
  /** 凭证到期前提前刷新的提前量（毫秒）。 */
  refreshLeadMs: number
  /** 刷新时刻叠加的随机抖动上限（毫秒）。 */
  refreshJitterMs: number
  /** 对 zcode 侧 HTTP 请求的超时（毫秒）。 */
  requestTimeoutMs: number
  /** 登录流程是否启动本地回调服务器。 */
  callbackServer: boolean
  /** 登录尝试记录的存活时长（毫秒），超时即作废。 */
  loginAttemptTtlMs: number
  /** 签名通道开关（signed-channel D6；默认启用，关闭 = bridge 基线直连行为）。 */
  signing: boolean
}

/**
 * 插件配置的**原生 Schemastery** schema（profile 里给本插件行的 `config:` 段由它校验）。
 *
 * `organization` / `project` 必填（T0 实测平台不提供可依赖的自动发现，缺失即配置
 * 校验报错）；其余键全部有默认值，零 `config:` 段时只差这两个必填项。`cordis.patch.yml`
 * 因此不带 `config:` 段，由 profile 层填 org / proj。
 *
 * 类型与 {@link ZcodePlanConfig} 一致：schema 管「类型与默认值」。
 */
export const Config = Schema.object({
  organization: Schema.string()
    .required()
    .description('zcode 侧组织名（必填：平台无自动发现）'),
  project: Schema.string()
    .required()
    .description('zcode 侧项目名（必填）'),
  clientVersion: Schema.string()
    .default('0.17.0')
    .description('桥接请求冒充的 zcode 客户端版本'),
  refreshLeadMs: Schema.number()
    .default(120_000)
    .description('凭证到期前提前刷新的提前量（毫秒）'),
  refreshJitterMs: Schema.number()
    .default(60_000)
    .description('刷新时刻叠加的随机抖动上限（毫秒）'),
  requestTimeoutMs: Schema.number()
    .default(15_000)
    .description('对 zcode 侧 HTTP 请求的超时（毫秒）'),
  callbackServer: Schema.boolean()
    .default(true)
    .description('登录流程是否启动本地回调服务器'),
  loginAttemptTtlMs: Schema.number()
    .default(600_000)
    .description('登录尝试记录的存活时长（毫秒），超时即作废'),
  signing: Schema.boolean()
    .default(true)
    .description('签名通道（官方 ZCode 折扣计费；关闭 = 无签名直连基线行为）'),
}).description('zcode 计划桥接：凭证复用、/zcode-plan 命令与 PAT owner 的插件配置')

/**
 * authorization seam 的装配窄面（本插件消费的最小成员面）。
 *
 * `registerFlow` 的入参直接用 dsh-authorization 的 `AuthorizationFlow` 类型面
 * （type-only 导入，零运行时依赖）；`begin` 是 T7 命令侧 driver 的发起通道
 * （`/zcode-plan login` 经 driver → seam → flow），同为零运行时依赖。
 */
export interface AuthorizationSeam {
  /** 注册一个授权 flow；duplicate key 由 seam 报 `DUPLICATE_FLOW`。返回撤销 disposer。 */
  registerFlow(flow: AuthorizationFlow): () => void
  /** 发起一次授权尝试（dsh-authorization `AuthorizationService.begin` 同签名窄面）。 */
  begin(request: AuthorizationRequest): Promise<AuthorizationOutcome>
}

/** 软注入回调里本插件要摸的 scope 形状（服务 + 生命周期面）。 */
interface InjectedScope {
  credentials: CredentialsPort
  authorization: AuthorizationSeam
  effect: Context['effect']
  on: Context['on']
}

/** 失败的日志摘要：桥错误只出码，其他异常只出名——值永远不进日志。 */
function describeFailure(error: unknown): string {
  return error instanceof BridgeError ? `code=${error.code}` : error instanceof Error ? error.name : 'unknown'
}

/**
 * 从存储记录收紧签名私钥 payload（signed-channel D3 的 record 形状校验）：
 * 宿主 credentials-local 的 record kind 白名单**只有 `grant`**（api-key/grant 两种，
 * 见其 parseRecord）——自定义 kind 会让整个 credentials 服务拒绝激活（真机教训：
 * 2026-11-04 调试实例启动即瘫）。故落盘用 `kind: 'grant'` + payload 内 `signing: 1`
 * 标记自辨；本函数只认该组合且 payload 四字段齐全，其余一律 `undefined`。
 */
function parseSigningRecord(record: CredentialRecord | undefined): SigningKeyRecord | undefined {
  if (record === undefined || record.kind !== 'grant') return undefined
  const payload: unknown = (record as { payload?: unknown }).payload
  if (typeof payload !== 'object' || payload === null) return undefined
  const candidate = payload as Partial<SigningKeyRecord> & { signing?: unknown }
  if (candidate.signing !== 1) return undefined
  if (candidate.v !== 1) return undefined
  if (typeof candidate.fingerprint !== 'string' || candidate.fingerprint.length === 0) return undefined
  if (typeof candidate.pkcs8B64 !== 'string' || candidate.pkcs8B64.length === 0) return undefined
  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) return undefined
  return { v: 1, fingerprint: candidate.fingerprint, pkcs8B64: candidate.pkcs8B64, createdAt: candidate.createdAt }
}

/**
 * 内部模块固定文案 → 固定事件名的锚点表（H2；事件词见 commands.ts 的
 * {@link LOG_EVENT_NAMES}）。pat-owner / key-manager / login-flow / route-config
 * 的关键日志行被各自模块的单测锁定为固定文案，这里按行首锚点翻译成事件行——
 * **不改动这些模块的语义**。`detail` 提取函数只取码 / 已脱敏片段（如
 * `code=TIMEOUT`），不带任何值。
 *
 * `pat_refresh_deferred`（owner 内部续期调度成功）与自动续期路径的 `pat_issued`
 * 由 `pat-owner` 内的日志锚点直接输出（任务 8.2 补齐），本翻译层不再重复翻译。
 */
const EVENT_HOOK_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp
  readonly event: ZcodePlanLogEventName
  readonly detail?: (match: RegExpExecArray) => string | undefined
}> = [
  { pattern: /^已新建桥接 Key/, event: 'key_created' },
  { pattern: /^已复用桥接 Key/, event: 'key_reused' },
  { pattern: /^PAT 续期已终止（([^）]+)）/, event: 'halted', detail: (match) => `code=${match[1]}` },
  { pattern: /^PAT 续期失败(?:.*?(code=\S+))?/, event: 'pat_refresh_failed', detail: (match) => match[1] },
  { pattern: /^登录完成/, event: 'login_committed' },
  { pattern: /^zcode-plan 路由已写入 profile patch 并在 llm 目录注册/, event: 'route_registered' },
]

/**
 * 给诊断出口加装事件翻译层（H2 的 index.ts 侧接点）：每行日志先原样透传，再按
 * {@link EVENT_HOOK_PATTERNS} 补一行 `zcode-plan:<event> [code=…]` 结构化事件行
 * （固定事件词 + 码，不含值）。无锚点命中的行不打事件。
 */
export function withEventHooks(inner: LogPort): LogPort {
  const emit = (message: string): void => {
    for (const hook of EVENT_HOOK_PATTERNS) {
      const match = hook.pattern.exec(message)
      if (match === null) continue
      logEvent(inner, hook.event, hook.detail?.(match))
      return
    }
  }
  return {
    info: (message) => {
      inner.info(message)
      emit(message)
    },
    warn: (message) => {
      inner.warn(message)
      emit(message)
    },
    error: (message) => {
      inner.error(message)
      emit(message)
    },
  }
}

/** 从宿主上下文按字符串 id 取服务（cordis 运行时同款用法；缺席/异常一律 undefined）。 */
function readService(ctx: Context, serviceId: string): unknown {
  try {
    const get = (ctx as { get?: unknown }).get
    if (typeof get !== 'function') return undefined
    return (get as (id: string) => unknown).call(ctx, serviceId)
  } catch {
    return undefined
  }
}

/** llm 目录槽位读取器：`ctx.get('llm')` → {@link StatusLlmPort} 窄面（缺失返回 undefined）。 */
function llmPort(ctx: Context): StatusLlmPort | undefined {
  const llm = readService(ctx, 'llm')
  if (llm === null || typeof llm !== 'object') return undefined
  const directory = llm as Partial<StatusLlmPort>
  const listProviders = directory.listProviders
  if (typeof listProviders !== 'function') return undefined
  const listConfigurableProviders = directory.listConfigurableProviders
  return {
    listProviders: () => listProviders.call(directory),
    listConfigurableProviders: () => listConfigurableProviders?.call(directory) ?? [],
  }
}

/** config-editor 槽位读取器：`ctx.get('configEditor')` → {@link ConfigEditorPort} 窄面（缺失返回 undefined）。 */
function configEditorPort(ctx: Context): ConfigEditorPort | undefined {
  // 用 `ctx.get()` 做**可选访问**：本插件刻意不在 inject 里硬依赖 config-editor
  // （route 子命令是可选能力面），而 cordis 的 `ctx.configEditor` 属性访问要求
  // 该服务已在 inject 名单内，否则抛 `cannot get property "configEditor" without inject`
  // （真机 7.3 实锤）。`get()` 是 cordis 为可选访问提供的通道：缺席返回 undefined。
  const editor = readService(ctx, 'configEditor')
  if (editor === null || typeof editor !== 'object') return undefined
  const candidate = editor as Partial<ConfigEditorPort>
  if (typeof candidate.entries !== 'function' || typeof candidate.configuration !== 'function' || typeof candidate.edit !== 'function') {
    return undefined
  }
  return candidate as ConfigEditorPort
}

/**
 * 把 zcode 计划桥接到宿主上下文上（T4 装配主体）。
 *
 * @param ctx - 宿主上下文。
 * @param config - schema 校验后的插件配置。
 */
export function apply(ctx: Context, config: ZcodePlanConfig): void {
  // 1. 装 logger 端口（宿主 logger 与 console 双通道），并加装事件翻译层（H2）：
  //    内部模块的关键日志行经 withEventHooks 补一行 `zcode-plan:<event>` 固定事件名。
  const log: LogPort = withEventHooks(createLogPort(ctx))
  ctx.logger.info('zcode-plan: loaded')

  // inject 通道本身缺席（薄宿主/异常宿主形状）= 能力整体缺席：跳过装配，
  // 保持零注册零报错，与「服务缺席 callback 不跑」同一姿态。
  if (typeof ctx.inject !== 'function') return

  // 无状态客户端与 keyManager：装配一次、放在两个 inject callback 之上共享
  // （fetch/clock 用真实现适配器；keyManager 的日志走事件翻译层）。
  const client: BigmodelClient = createBigmodelClient({
    fetch: nodeFetch,
    clock: nodeClock,
    log,
    clientVersion: config.clientVersion,
  })
  const keyManager: KeyManager = createKeyManager({ log })

  // 跨 inject callback 的槽位变量：PAT owner（record-updated 重建 / logout 清空）、
  // 登录 driver（credentials+authorization 齐备时创建）、credentials 引用（logout 用）、
  // PAT_REF 外部冲突来源（R10 检测；status 备注段展示）。
  let owner: PatOwner | undefined
  let driver: LoginDriver | undefined
  let credentialsRef: CredentialsPort | undefined
  let refConflictSource: string | undefined

  // 1.5 签名通道（signed-channel D1/D3/D6）：config.signing 启用时创建 Signer 并
  // 安装 globalThis.fetch 包装（**先捕获原始 fetch 再安装**——Signer 内部握手走
  // 原始通道，防递归自拦）。record 适配惰性引用 credentialsRef 槽位（credentials
  // 能力面缺席时读写为 no-op，签名通道自动退化）。关闭时不创建不安装：路由退化为
  // bridge 基线直连（零签名头），其他能力不受影响。
  let signer: Signer | undefined
  if (config.signing === true) {
    const boundFetch = globalThis.fetch.bind(globalThis)
    const signingRecord: SigningRecordPort = {
      read: async () => {
        const credentials = credentialsRef
        if (credentials === undefined) return undefined
        const record: CredentialRecord | undefined = await credentials.readRecord(SIGNING_RECORD_KEY).catch(() => undefined)
        return parseSigningRecord(record)
      },
      write: async (record) => {
        const credentials = credentialsRef
        if (credentials === undefined) return
        // 宿主 kind 白名单仅 grant（见 parseSigningRecord 注释）：payload 前置
        // signing:1 标记自辨，四字段原样随载。
        await credentials
          .modifyRecord(SIGNING_RECORD_KEY, () => Promise.resolve({ kind: 'grant', payload: { signing: 1, ...record } }))
          .catch(() => {}) // 持久化失败不阻塞签名（内存快路径仍在）
      },
      clear: async () => {
        const credentials = credentialsRef
        if (credentials === undefined) return
        await credentials.deleteRecord(SIGNING_RECORD_KEY).catch(() => {})
      },
    }
    signer = createSigner({ fetch: (input, init) => boundFetch(input, init), clock: nodeClock, log, record: signingRecord })
    installSigningFetch(signer, log)
  }

  /** 重建 PAT owner（旧实例 dispose：清定时器 + 递增代次，在途结果全部丢弃）。 */
  const rebuildOwner = (credentials: CredentialsPort): PatOwner => {
    owner?.dispose()
    owner = createPatOwner({
      credentials,
      client,
      keyManager,
      log,
      clock: nodeClock,
      leadMs: config.refreshLeadMs,
      jitterMs: config.refreshJitterMs,
      recordKey: LOGIN_RECORD_KEY,
      patRef: PAT_REF,
      // 签名通道联动（signed-channel D8）：发布即 setCredential（指纹变化 → 后台预握手）。
      onPatPublished: (pat) => signer?.setCredential(pat),
    })
    return owner
  }

  /** status 快照采集器（H13 的 `collectStatus` 面）：读 grant → 读用量（只读一次）→ 两读路由。 */
  const collectStatus = async (signal?: AbortSignal): Promise<StatusSnapshot> => {
    const now = nodeClock.now()
    const credentials = credentialsRef
    const grant = credentials === undefined ? undefined : await readGrant(credentials, LOGIN_RECORD_KEY, log)
    const usage =
      grant === undefined ? { kind: 'error' as const, code: 'AUTH_STATE' } : await readUsage(client, grant, nodeClock, signal)
    const haltReason = owner?.haltReason()
    return {
      now,
      ...(grant !== undefined && { grant }),
      key: keyManager.state(),
      pat: owner !== undefined ? owner.state() : { kind: 'none' },
      patRenewalLeadMs: config.refreshLeadMs,
      ...(haltReason !== undefined && { haltReason }),
      ...(refConflictSource !== undefined && { refConflict: { source: refConflictSource } }),
      route: readRouteState(llmPort(ctx)),
      ...(signer !== undefined && { signing: signer.status() }),
      usage,
    }
  }

  // 2. credentials + authorization 能力面：两者齐备才装配（任一缺席 callback 不跑
  //    且不抛——软依赖语义），登录能力整体降级。
  ctx.inject(['credentials', 'authorization'], (scope) => {
    const services = scope as unknown as InjectedScope
    const { credentials, authorization } = services
    credentialsRef = credentials

    // 顶层拆卸：owner 的续期定时器与在途结果（随 scope 生命周期走）。
    services.effect(
      () => () => {
        owner?.dispose()
      },
      'zcode-plan: pat owner',
    )

    /** scope.effect 的竞态防御：异步装配期间 scope 已卸载时立即手动拆卸，防泄漏。 */
    const keepDisposer = (dispose: () => void, label: string): void => {
      try {
        services.effect(() => dispose, label)
      } catch {
        dispose()
      }
    }

    // 注册 flow 与启动拉起依赖一次异步的 PAT_REF 冲突检测（R10：describe 是异步面，
    // inject callback 是同步面）——异步分支里的失败一律只进日志，不抛崩插件。
    void (async (): Promise<void> => {
      // PAT_REF 冲突检测：ZCODE_PLAN_PAT 被环境/项目层供值 → 记 error、不注册
      // flow、不发布（ref 归外部值所有；本插件不得覆盖）。
      let info: { configured: boolean; source?: string; writable: boolean }
      try {
        info = await credentials.describe(PAT_REF)
      } catch (error) {
        log.warn(`PAT_REF describe 失败，按无冲突继续：${describeFailure(error)}`)
        info = { configured: false, writable: false }
      }
      if (isPatRefConflict(info)) {
        refConflictSource = info.source ?? 'unknown'
        log.error(`REF_CONFLICT：ZCODE_PLAN_PAT 已由外部来源（${info.source ?? 'unknown'}）供值，不注册登录 flow 也不发布 PAT`)
        return
      }

      // 登录 driver（T7 命令侧）：beginAttempt 通道接 seam 的 begin；宿主形状缺
      // begin（薄宿主/旧 fake）时 driver 缺席，命令侧 login 降级报错。
      //
      // **必须带接收者调用**（`begin.call(authorization, …)`）：`AuthorizationService.begin`
      // 读 `this.flows`，把方法裸传会丢 this，真机表现为
      // `TypeError: Cannot read properties of undefined (reading 'flows')`（7.3 实锤）。
      const begin = (authorization as Partial<AuthorizationSeam>).begin
      if (typeof begin === 'function') {
        driver = createLoginDriver({
          beginAttempt: (request) => begin.call(authorization, request),
          log,
          clock: nodeClock,
          ttlMs: config.loginAttemptTtlMs,
        })
      }

      // 注册登录 flow（§3.6 的 flow 定义在 login-flow.ts）；disposer 交给 scope.effect。
      const loginFlow = createLoginFlow({ client, config, log, clock: nodeClock })
      const disposeFlow = authorization.registerFlow(loginFlow)
      keepDisposer(() => disposeFlow(), 'zcode-plan: authorization flow')

      // credentials/record-updated 监听：本 key 记录更新 → 身份比对后重建 PAT owner
      // （旧实例 dispose：清定时器 + 递增代次，在途结果全部丢弃）；他 key 忽略。
      // cordis 的 ctx.on 本身把 listener 存为当前 fiber 的 effect，随 scope 自动摘除。
      // 身份比对（R-自触发修复）：owner 发布路径末尾的 patchGrant 补写 patExpiresAt
      // 也以本 key 触发本事件——登录身份三要素未变时必须跳过重建，否则每轮发布都
      // 自触发重建：新 owner 停在 none（status 显示「PAT ：无」）、旧实例的续期定时器
      // 随 dispose 失效（自动续期停摆，PAT 到期后路由 401）。身份真变化（重新登录/
      // 换号）才重建，且新 owner 立即 ensure 拉起 PAT（与启动分支同权，login 后免
      // 手动 refresh）。
      services.on('credentials/record-updated', (key: CredentialKey) => {
        if (key !== LOGIN_RECORD_KEY) return
        void (async () => {
          const grant = await readGrant(credentials, LOGIN_RECORD_KEY, log)
          const current = owner?.identity()
          if (
            grant !== undefined &&
            current !== undefined &&
            grant.jwt === current.jwt &&
            grant.organization === current.organization &&
            grant.project === current.project
          ) {
            return
          }
          rebuildOwner(credentials)
          log.info('登录记录已更新：PAT owner 已重建')
          if (grant === undefined) return
          try {
            await owner?.ensure()
          } catch (error) {
            log.warn(`登录后 PAT 拉起失败（不影响登录，可手动 /zcode-plan refresh）：${describeFailure(error)}`)
          }
        })()
      })

      // 启动拉起：已有登录记录才拉（缺记录是正常态，静默跳过）。失败仅日志，不抛。
      const grant = await readGrant(credentials, LOGIN_RECORD_KEY, log)
      if (grant === undefined) return
      // 签名通道启动接线（D3/D8）：PAT 已存在（重启 profile）时先喂 signer——
      // setCredential 内部走 record 快路径，免重握手；随后 ensure() 发布的新 PAT
      // 经 onPatPublished 再次联动（同指纹 no-op）。
      if (signer !== undefined) {
        try {
          const pat = await credentials.resolve(PAT_REF)
          signer.setCredential(pat?.value)
        } catch (error) {
          log.warn(`签名通道启动解析 PAT 失败（不影响插件加载）：${describeFailure(error)}`)
        }
      }
      const patOwner = rebuildOwner(credentials)
      try {
        await keyManager.ensureKey({ client, grant })
        const lease = await patOwner.ensure()
        logEvent(log, 'pat_issued', `expiresAt=${new Date(lease.expiresAt).toISOString()}`)
      } catch (error) {
        log.warn(`启动拉起 PAT 失败（不影响插件加载）：${describeFailure(error)}`)
      }
    })()
  })

  // 3. commands 能力面（T7 / H14）：注册 /zcode-plan 五子命令（login/logout/status/
  //    route/refresh），disposer 交 scope.effect。命令服务缺席或存在都不影响上述
  //    凭证装配；handler 内对槽位现取，未装配的能力逐条降级报错。
  ctx.inject(['commands'], (scope) => {
    const services = scope as unknown as Partial<{ commands: ZcodePlanCommandsPort; effect: Context['effect'] }>
    const commands = services.commands
    if (commands === undefined || typeof commands.register !== 'function') return
    const dispose = commands.register(
      createZcodePlanCommand({
        driver: () => driver,
        owner: () => owner,
        credentials: () => credentialsRef,
        configEditor: () => configEditorPort(ctx),
        llm: () => llmPort(ctx),
        status: (signal) => collectStatus(signal),
        afterLogout: () => {
          owner = undefined
          // 签名通道联动（D3）：logout 清凭证 + 私钥 record（防悬挂签名凭证）。
          signer?.setCredential(undefined)
        },
        afterRefresh: () => {
          // 签名通道联动（D5）：refresh 重置降级计数（止损态的人工恢复口）；新 PAT
          // 的预握手由 onPatPublished（owner.ensure 内发布）已先行触发。
          signer?.resetFailures()
        },
        log,
      }),
    )
    try {
      services.effect?.(() => dispose, 'zcode-plan: command')
    } catch {
      dispose()
    }
  })
}
