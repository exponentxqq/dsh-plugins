/**
 * 宿主半的装配入口：把已就位的模块接成一个可运行的插件。
 *
 * 本模块是**唯一副作用集中处**（code-design §1.1 第 26 行）。它自己不含任何业务规则——掩码、
 * 状态折叠、持久化、默认档、命令文案都在各自模块里——只负责三件事：**生命周期**、**服务
 * 注入**、**依赖装配**。
 *
 * 生命周期（顺序即语义）：
 *
 * 1. `agent/created`（串行广播，返回的 Promise 被宿主在会话首步之前 await）：读该会话状态 →
 *    `seeded === false` 时按「用户级默认档 ∪ 工作区档」拍快照并**立即写一条记录**（空也写，D9）→
 *    `new SessionLayer(...)` → `await layer.attach(agent, state)`，首轮掩码因此先于该会话的
 *    首次装配生效。子代理 / 队友会话走**同一条路径**，不区分 agent 来源：它们的会话级开关
 *    与父会话互不继承（C6），但装配方式完全一致。
 * 2. `agent/disposed` 与 agent 自己的 scope effect：双保险清账（`detach` + 从注册表删除）。
 * 3. `tools/change`：对注册表里**全部**层做一次 `refresh()`（幂等；`restrict` 自己也会触发
 *    该事件，层内的 diff 守卫保证不自激）。
 * 4. 软注入（见下）：`sessionProjections` 投影、`commands` 命令、`connection` + `webServer`
 *    的 RPC 通道，以及工作区归属用的 `workingDirectory` / `workspaceRegistry`。技能分面
 *    （`skills`）由每 agent 层在 `agent.ctx` 上另行软注入，**不在**本文件注入。
 * 5. `ctx.effect` 统一拆卸：所有层 detach（含技能影子 stub 与 `skills/change` 监听）、
 *    工作区软注入的清理、投影 / 命令 / 通道反注册。
 * 6. 启动补挂：`ctx.agents.list()` 里已存在的会话走同一路径（插件晚于 agent 加载、热重载、
 *    或 profile 中途装入时）。
 *
 * 服务注入（全部软注入，任一缺席都不让插件本身加载失败）：
 *
 * - `ctx.inject(['commands'])` → 注册 `/tools`；
 * - `ctx.inject(['sessionProjections'])` → 注册 host-only 投影 `sessionToolToggle`（无 wire，
 *   D10 的读路径首选；投影单元只给 fold，`stateSchema` 按 R13 由本文件用 zod 合成）；
 * - `ctx.inject(['connection', 'webServer'])` → 挂载 Connection RPC 通道 `/session-tool-toggle`
 *   （Web 面板的数据面，D20 的五个端点）。**两条注入要求都不是风格问题**：`webServer` 必须在
 *   注入名单里（否则回调在路由表就绪前运行，注册出来的 route 没有宿主），`connection` 必须从
 *   `scope.root` 读——`connection.rpc.handle` 把 `webServer` 当成「读它的那个上下文」的属性来
 *   解析，而插件 fiber 只看得见自己 inject 的服务，直接读兄弟行的 `webServer` 会抛
 *   `cannot get property "webServer" without inject`，route 注册失败后每个请求都落到静态 SPA
 *   兜底（HTTP 405）。完整坑位说明见 `plugins/web-ux/src/index.ts:74-99`。`connection` 解析为
 *   空只 warn 不抛（headless / 非 web profile 照常加载，`/tools` 命令面不受影响）。
 * - `ctx.inject(['workingDirectory'])` / `ctx.inject(['workspaceRegistry'])` → 工作区归属的两个
 *   软依赖（**分开注入**：`workingDirectory` 在 base 层、`workspaceRegistry` 只在 web-app 层，
 *   合在一个注入里会让 registry 缺席连带丢掉 cwd 的有效目录）。缺席只降级对应能力：
 *   registry 缺席时归属键退化为 cwd 的 canonical（`registered: false`，工作区档照常可用——
 *   spec 不要求先登记）；`workingDirectory` 缺席时 cwd 回退 `session.header.cwd`。两者都
 *   **不进**模块级 `inject` 名单（C10：任何 profile 仍可安装），缺席降级在首个会话播种时
 *   汇总成一条 warn（`apply` 同步返回时分不清「尚未就绪」与「永远缺席」）。
 * - `skills` **不**在本文件注入：技能分面由每 agent 层在自己的 `agent.ctx` 上软注入（组 3），
 *   影子 stub 与 `skills/change` 监听都随层的 `detach` 回收。本文件只在首个会话挂载完成后
 *   读层的 `skills().available`，缺席时补一条一次性的降级 warn（技能开关只记意图）。
 *
 * 播种（D8 / D10）：新会话的初始关闭集 = **用户级默认档 ∪ 工作区档**（`mergeSeed`，排序去重；
 * 工作区档只能追加关闭项，不能反开用户级关闭项）。工作区由会话 cwd 逐级 realpath 上溯、与
 * `workspaceRegistry` 精确匹配得到（`resolveWorkspaceAttribution`）；归属失败（cwd 缺失 /
 * 目录已删导致 realpath 全程失败）时 fail-closed，只按用户级默认档播种。
 *
 * 依赖装配：`ControlDeps`（层注册表 + `StateStore` + 默认档 / 工作区档 IO + 工作区归属闭包
 * 与下拉投影 + 保护名单 + 日志）只构造**一份**，直接交给命令面与 RPC 通道（`RpcDeps` 在
 * 同一份之上只补 agent 查找面）；两者因此不存在两份状态（D14）。`ToolsCommandDeps` 只是
 * `ControlDeps` 的别名，没有第二份对象。**装配层不持有工具读数**：本文件既没有根 ctx 上的
 * 全局工具名闭包，也没有装配期的描述表——工具清单与描述都经**本会话的层**读（`layerFor` →
 * `visibleNames()` / `visibleSchemas()`），层尚未就绪时命令面与 RPC 各自诚实降级，而不是
 * 回落到根 ctx 的全局读数。工作区四件读数（`workspacesPath` / `workspacesIo` /
 * `workspaceOf` / `workspaceChoices`）同在这一份对象上：`snapshotOf` 的工作区视图与
 * `handleWorkspace` 的路径白名单都读它，装配层不再另造第二条读路径。
 *
 * 两处刻意的设计选择：
 *
 * - **`StateStore` 懒解析**：宿主写入面必须对「宿主那一份 `dsh-session`」做身份断言
 *   （`mod.Session === session.constructor`，见 `host-runtime.ts` 与决策 D1），而断言的右值
 *   只能来自一个**活的 session**——`apply()` 执行时还没有任何会话。因此解析推迟到首个
 *   `agent/created`（或启动补挂）做一次并单飞缓存；解析完成前 `deps.store` 是内存降级
 *   （`MemoryStateStore`），解析成功后原地换成记录通道。由于 `agent/created` 的返回 Promise
 *   先于会话首步结算，任何命令 / 工具调用都不可能赶在解析之前。
 * - **`Config` 用原生 Schemastery 声明**（而不是 zod / 标准 schema）：dsh 的
 *   `--dump-config-schema` 只认原生 Schemastery 图（`dsh-app-boot` 的 `isNativeConfigSchema`），
 *   其 `stateSchema` / `wire` 才是 zod。非原生 `Config` 会被记成 error 诊断
 *   （`complete: false` → 退出码 1），把任何装入了本插件的 profile 的 schema dump 拖红。
 *   因此 `Config` 用 `@deepseek-ai/schemastery`，由构建打进产物（本包运行时不需要它）；
 *   {@link readSettings} 再做一层语义归一（绝对路径、条目去重），schema 负责类型与默认值。
 *
 * @module dsh-plugin-session-tool-toggle/host/index
 */

import { realpath } from 'node:fs/promises'

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// 类型面：`ConnectionRpcHandler` 是通道 handler 的官方形状（挂载点的编译期断言），
// 同时这条 type-only import 加载 `Context.connection` 的声明合并（`root.get('connection')` 靠它取到类型）。
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-commands'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { z } from 'zod'

import { CHANNEL, ENDPOINTS } from '../contract.ts'
import type { WorkspaceChoice } from '../contract.ts'
import { PROTECTED_BASELINE } from './address.ts'
import { resolveWorkspaceAttribution } from './attribution.ts'
import { toolsCommand, type ToolsCommandDeps } from './commands.ts'
import { createNodeDefaultsIo, defaultsPath, readDefaults, withSnapshot } from './defaults.ts'
import { loadHostSessionApi } from './host-runtime.ts'
import {
  MemoryStateStore,
  createSessionToolToggleUnit,
  createStateStore,
  type SessionProjectionsLike,
} from './record-store.ts'
import { createRpcDispatcher, type AgentLookup, type RpcDeps } from './rpc.ts'
import { SessionLayer } from './session-layer.ts'
import { disabledOf, mergeSeed, readWorkspaces, workspacesPath } from './workspaces.ts'
import type {
  AgentLike,
  Config as SessionToolToggleConfig,
  ControlDeps,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
  WorkspaceAttribution,
} from './types.ts'

/** Cordis 插件名：bundle 行的 id 与 loader 诊断都用它。 */
export const name = 'session-tool-toggle'

/**
 * 依赖服务名单：agent 注册表（生命周期 + 启动补挂）与工具注册表（每 agent 掩码的服务面）。
 *
 * `tools` 是**装配顺序契约**而不是本文件的读数面：装配层已不再从根 ctx 读工具清单（工具与
 * 描述都经每会话的层读），保留它才能把「没有 `tools` 服务的 profile」挡在 `apply` 之前——
 * 否则 `agent/created` 会卡在每层 `attach` 的 `ctx.inject(['tools', …])` 上永不结算，把整个
 * profile 的会话创建挂死（D-6 的反例）。
 *
 * `commands` / `sessionProjections` / `workingDirectory` / `workspaceRegistry` 刻意**不**在这里：
 * 它们是可选能力面，走 `ctx.inject([...])` 软注入，缺席时插件照常加载（只是没有 `/tools`、
 * 没有投影读面，或工作区归属按可用能力降级）。
 */
export const inject: readonly string[] = ['agents', 'tools']

/**
 * 插件配置的**原生 Schemastery** schema（profile 里给本插件行的 `config:` 段由它校验）。
 *
 * 五个键全部可选，`cordis.patch.yml` 因此不带 `config:` 段——零配置可跑：
 * `storage` 默认 `auto`（宿主模块可用则写会话日志，否则内存降级）、`protectedTools` 默认空数组
 * （基线永远在，只增不减）、三个路径覆盖项缺省时走各自的默认位置（用户档 / 工作区档 / 宿主模块锚点）。
 *
 * 类型与 `types.ts` 的 `Config` 形状一致；`readSettings` 在其上再做语义归一（绝对路径、
 * 条目去重），因此 schema 管「类型与默认值」，`readSettings` 管「值是否可用」。
 */
export const Config = Schema.object({
  storage: Schema.union(['auto', 'memory'])
    .default('auto')
    .description('持久化通道：auto = 宿主模块可用则写会话日志，否则内存态；memory = 只用内存（不解析宿主模块）'),
  protectedTools: Schema.array(Schema.string())
    .default([])
    .description(`在硬保护基线（${PROTECTED_BASELINE.join('/')}）之上追加的保护名；只增不减`),
  defaultsFile: Schema.string()
    .description('覆盖默认档路径（绝对路径）；省略时为 $DSH_HOME/session-tool-toggle/defaults.json'),
  workspacesFile: Schema.string()
    .description('覆盖工作区档路径（绝对路径）；省略时为 $DSH_HOME/session-tool-toggle/workspaces.json'),
  hostModuleBase: Schema.string()
    .description('覆盖宿主 @deepseek-ai/dsh-session 的解析锚点（绝对路径，排障 / 单测用）'),
}).description('会话级工具面开关：/tools 命令面与 Web 面板共用的插件配置')

/** 诊断前缀：进程日志里能一眼分辨是本插件（与 `project-mcp` 的 `line()` 同形）。 */
const LOG_PREFIX = 'dsh-plugin-session-tool-toggle：'

/** 装配层标签（`ctx.effect` / `agent.ctx.effect` 的诊断名）。 */
const TEARDOWN_LABEL = 'dsh-plugin-session-tool-toggle: 统一拆卸'
const AGENT_LAYER_LABEL = 'dsh-plugin-session-tool-toggle: 每 agent 层'

/** `tools/change` 前几次回执打日志（与 `project-mcp` 同一观察口径：静默的监听与没装上无法区分）。 */
const REPORTED_TOOL_CHANGES = 3

/**
 * 冻结的空文本数组：无法归属工作区时的「工作区档贡献为空」。
 *
 * 与 `defaults.ts` / `workspaces.ts` 的 `NO_TEXTS` 同一纪律：共享的只读空集，误改会在严格
 * 模式下抛错；`mergeSeed` 只读入参，不会把它写回任何状态。
 */
const NO_WORKSPACE_TEXTS: readonly string[] = Object.freeze([])

/**
 * 投影状态的 zod schema（R13：`createSessionToolToggleUnit` 只给 fold，schema 由装配层提供）。
 *
 * 宿主用它校验**持久化缓存行**（`stateSchema.parse(row.val)`，按 `stateVersion` 失效旧行），
 * 因此这里描述的是「一整份 `SessionToolState`」的精确形状：任何字段缺失/类型漂移的缓存行都该
 * 被丢弃并从头折叠，而不是带着半份状态继续走。
 */
const PROJECTION_STATE_SCHEMA = z.object({
  version: z.literal(1),
  disabled: z.array(z.string()),
  snapshot: z.array(z.string()),
  seeded: z.boolean(),
  updatedAt: z.number(),
})

/** 默认档读取结果里装配层真正关心的那一项（快照来源）。 */
type DefaultsSnapshot = readonly string[]

/** 装配期解析出的配置（`Config` schema 校验之后的语义归一）。 */
interface Settings {
  /** 持久化通道：`auto` = 宿主模块可用则写会话日志，否则内存态。 */
  readonly storage: 'auto' | 'memory'
  /** 在 {@link PROTECTED_BASELINE} 之上追加的保护名（已去重，永不减项）。 */
  readonly protectedTools: readonly string[]
  /** 默认档路径覆盖值；`undefined` = `$DSH_HOME/session-tool-toggle/defaults.json`。 */
  readonly defaultsFile: string | undefined
  /** 工作区档路径覆盖值；`undefined` = `$DSH_HOME/session-tool-toggle/workspaces.json`。 */
  readonly workspacesFile: string | undefined
  /** 宿主模块解析锚点覆盖值（排障 / 单测用）。 */
  readonly hostModuleBase: string | undefined
}

/**
 * 本插件用到的 `workingDirectory` 服务面（软注入；只声明同步的 `get`）。
 *
 * 上游类型声明在 `@deepseek-ai/dsh-working-directory`，本包不依赖它（C10：不进 `inject`，
 * 也不把它拖进类型图），因此按调用点收窄成本地窄面。
 */
interface WorkingDirectoryLike {
  /**
   * 读会话当前有效工作目录（同步、无文件系统 I/O）。
   * @param session - 目标会话（真实类型是宿主 `Session`）。
   * @returns 绝对路径。
   */
  get(session: SessionLike): string
}

/**
 * 本插件用到的 `workspaceRegistry` 服务面（软注入；只声明同步的 `list`）。
 *
 * `list()` 按登记顺序返回已登记工作区，`path` 已是 realpath（A3）；`title` 只用于归属结果的
 * 显示标题。其余方法（create / delete / 归档 …）本插件不调用，不写进窄面。
 */
interface WorkspaceRegistryLike {
  /**
   * 读已登记工作区（同步、无持久化读取）。
   * @returns 按登记顺序的工作区数组。
   */
  list(): readonly { readonly path: string; readonly title: string }[]
}

/**
 * 装配入口。
 *
 * @param ctx - 宿主上下文（必须已提供 `agents` 与 `tools`）。
 * @param config - 插件配置；全部键可选，省略即零配置运行。
 */
export function apply(ctx: Context, config?: SessionToolToggleConfig): void {
  const log = createLog(ctx)
  const settings = readSettings(config, log)
  /** 生效保护名单：基线 ∪ config 追加项（只增不减，D5）。 */
  const protectedNames: ReadonlySet<string> = new Set([
    ...PROTECTED_BASELINE,
    ...settings.protectedTools,
  ])
  const defaultsFile = defaultsPath(settings.defaultsFile)
  const defaultsIo = createNodeDefaultsIo()
  // 工作区档与用户档同目录、共用同一份 IO 端口：原子写与权限位（0o600 / 0o700）只有一处定义。
  const workspacesFile = workspacesPath(settings.workspacesFile)
  const workspacesIo = defaultsIo

  /**
   * 层注册表：**单点持有**（`sessionId → 层`）。命令面、`tools/change`、启动补挂、拆卸都只
   * 通过它找层，因此「同一会话只有一条写入路径」是结构事实（D14）。
   *
   * 键是宿主的 `SessionId`（运行时就是字符串），值是该会话唯一的 {@link SessionLayer}。
   */
  const layers = new Map<string, SessionLayer>()

  // -------------------------------------------------------------------------
  // 会话状态存储：懒解析 + 单飞 + 内存降级
  // -------------------------------------------------------------------------

  /** 投影服务（`ctx.inject(['sessionProjections'])` 成功后才可用；缺席时读路径走日志重放）。 */
  let projections: SessionProjectionsLike | undefined

  /**
   * 交给 `RecordStateStore` 的投影端口：**活代理**，每次读都看当前是否已拿到服务。
   *
   * 用代理而不是在构造时拍快照，是因为 `StateStore` 的构造（首个会话）与投影服务的就绪
   * 顺序不确定：服务晚到时端口自然开始返回状态，服务缺席时返回 `undefined`，读路径按 D10
   * 自然回落到日志重放。
   */
  const projectionsPort: SessionProjectionsLike = {
    stateOf: (session, key) => projections?.stateOf(session as never, key),
  }

  /**
   * 生效中的存储实现：解析完成前是内存降级（`kind === 'memory'`）。
   *
   * 对外只暴露这个**稳定引用**（`ControlDeps.store` 是 readonly）；解析成功后换的是它委托的
   * 内部实现，命令面与 RPC 因此不需要重建依赖。
   */
  let activeStore: StateStore = new MemoryStateStore()
  const store: StateStore = {
    get kind() {
      return activeStore.kind
    },
    read: (session) => activeStore.read(session),
    write: (session, state) => activeStore.write(session, state),
  }

  /** 单飞：解析只做一次（宿主那一份模块不会在运行期换）。 */
  let storeReady: Promise<StateStore> | undefined

  /**
   * 确保存储已解析。
   *
   * `storage: 'memory'` 直接用内存通道，不解析宿主模块；`auto` 则在首个会话上解析一次，
   * 失败（`loadHostSessionApi` 返回 `undefined`）自动降级为内存态——降级细节由
   * `host-runtime.ts` 汇总成一条 warn，本函数不重复告警。
   *
   * @param session - 用于身份断言的活会话（首个 `agent/created` 或启动补挂提供）。
   * @returns 生效中的存储端口（解析失败时仍是内存降级，永不 reject）。
   */
  async function ensureStore(session: SessionLike): Promise<StateStore> {
    if (settings.storage === 'memory') return activeStore
    storeReady ??= resolveStore(session)
    return await storeReady
  }

  /**
   * 解析宿主写入面并构造记录通道（只跑一次）。
   *
   * @param session - 身份断言的活会话。
   * @returns 生效中的存储端口。
   */
  async function resolveStore(session: SessionLike): Promise<StateStore> {
    try {
      const host = await loadHostSessionApi(session, {
        modulePath: settings.hostModuleBase,
        log,
      })
      activeStore = createStateStore({ host, projections: projectionsPort, log })
    } catch (error) {
      // `loadHostSessionApi` 自身不抛；这里是最后一道防线（例如宿主模块在导入期炸掉），
      // 保持内存降级并把原因写进进程日志。
      activeStore = new MemoryStateStore()
      log.error(`解析会话持久化通道失败（${describeError(error)}），已降级为内存态`)
    }
    log.info(`持久化通道：${activeStore.kind}`)
    return activeStore
  }

  // -------------------------------------------------------------------------
  // 工作区归属：两个软注入 + fail-closed 的 cwd → 工作区键解析
  // -------------------------------------------------------------------------

  /**
   * `workingDirectory` 服务（软注入）。
   *
   * 提供「会话当前有效工作目录」：会话内 `cd` 之后 `header.cwd` 仍是创建目录，归属应跟随
   * 有效目录；服务缺席（headless / 极简组合）时回退 `session.header.cwd`（A4）。
   */
  let workingDirectory: WorkingDirectoryLike | undefined

  /**
   * `workspaceRegistry` 服务（软注入）。
   *
   * 提供已登记工作区（`path` 已是 realpath，A3）；缺席时归属退化为「未登记键 = cwd 的
   * canonical」，工作区档照常可用（spec：不要求先登记工作区）。
   */
  let workspaceRegistry: WorkspaceRegistryLike | undefined

  /** 两个软服务的缺席降级只提示一次（首个会话播种时），不按会话刷日志。 */
  let workspaceServicesReported = false

  /** 技能分面降级只提示一次（首个会话挂载后读层读数），不按会话刷日志。 */
  let skillsDegradationReported = false

  /**
   * 工作区软注入的清理函数：注入回调的返回值（同一 fiber 上生效）。
   *
   * 注入 fiber 会随插件 fiber 一起回收，但父子的释放顺序不是本文件的语义；把清理函数
   * 纳入统一拆卸清单，保证拆卸回调执行期间 `workspaceOf` / `workspaceChoices` 不再摸到
   * 已失效的服务引用。
   */
  const workspaceInjectionDisposers = new Set<() => void>()

  /**
   * 把一个注入清理动作纳入统一拆卸清单。
   *
   * 注入作用域回收与统一拆卸都会触发同一个清理，因此这里用幂等包装：第二次调用是 no-op
   * （并把自己从清单摘掉），不会重复清引用，也不会把清理列入失败日志。
   *
   * @param dispose - 真正清引用的动作。
   * @returns 交给 `ctx.inject` 回调的同款清理函数。
   */
  function trackWorkspaceInjection(dispose: () => void): () => void {
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      workspaceInjectionDisposers.delete(release)
      try {
        dispose()
      } catch (error) {
        log.error(`清理工作区软注入失败（${describeError(error)}）`)
      }
    }
    workspaceInjectionDisposers.add(release)
    return release
  }

  // 分开注入（提供层不同：`workingDirectory` 在 base、`workspaceRegistry` 只在 web-app）：
  // 合在一个注入里会让 registry 缺席连带丢掉 cwd 的有效目录。返回的 disposer 在插件卸载 /
  // 注入作用域回收时清掉引用，避免拆卸期继续用已失效的服务。
  ctx.inject(['workingDirectory'], (scope) => {
    workingDirectory = scope.get('workingDirectory') as WorkingDirectoryLike | undefined
    return trackWorkspaceInjection(() => {
      workingDirectory = undefined
    })
  })

  ctx.inject(['workspaceRegistry'], (scope) => {
    workspaceRegistry = scope.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
    return trackWorkspaceInjection(() => {
      workspaceRegistry = undefined
    })
  })

  /**
   * 首次播种时提示软注入的缺席降级（每项事实只一条 warn）。
   *
   * 为什么不在 `apply` 末尾提示：`ctx.inject` 的回调在微任务里执行，`apply` 同步返回时
   * 「尚未就绪」与「永远缺席」无法区分；放到首个会话播种时，读数已经是最终态。
   */
  function reportWorkspaceServicesOnce(): void {
    if (workspaceServicesReported) return
    workspaceServicesReported = true
    const missing: string[] = []
    const fallbacks: string[] = []
    if (workspaceRegistry === undefined) {
      missing.push('workspaceRegistry')
      fallbacks.push('归属键退化为 cwd 的 canonical（未登记）')
    }
    if (workingDirectory === undefined) {
      missing.push('workingDirectory')
      fallbacks.push('cwd 回退到会话头')
    }
    if (missing.length === 0) return
    log.warn(
      `软注入服务缺席（${missing.join(' / ')}）：${fallbacks.join('，')}；工作区档功能按可用能力降级`,
    )
  }

  /**
   * 首个会话挂载完成后报告技能分面降级（每进程一条）。
   *
   * 为什么不在 `apply` 末尾报告：`skills` 由每 agent 层软注入，`apply` 同步返回时还没有任何
   * 层；`attach` 内的同步取才是首轮确定性事实（晚到的软 fiber 仍会补挂）。这里只按**首个
   * 会话的首轮读数**提示，不按会话刷同一行——技能缺席与工作区档一样属于「降级而非失败」：
   * 技能开关退化为只记意图（面板给 `skills-unavailable`），工具掩码、`/tools` 与工作区档
   * 都不受影响（R6 / C9）。
   *
   * @param layer - 刚挂载完成的层（`skills().available` = `skills` 服务是否已交付）。
   */
  function reportSkillsDegradationOnce(layer: SessionLayer): void {
    if (skillsDegradationReported) return
    // 先置位再看读数：本函数只回答「首个挂载的会话当时看到了什么」，后续会话不再重复读。
    skillsDegradationReported = true
    if (layer.skills().available) return
    log.warn(
      '技能分面降级：首个会话挂载时 skills 服务未就绪（宿主未提供或晚到），技能开关暂只记意图（面板给 skills-unavailable；晚到会自动补挂）；工具掩码、/tools 与工作区档不受影响',
    )
  }

  /**
   * 会话 cwd：优先有效工作目录，回退不可变的会话头。
   *
   * 两次读取各自容错：`workingDirectory.get` 对「不是宿主 `Session` 实例」的结构收窄会抛
   * （A4），`header.cwd` 也可能缺失。两者都失败时返回 `undefined`，由归属解析按 fail-closed
   * 处理（只在用户档播种）。
   *
   * @param session - 目标会话。
   * @returns 绝对路径或 undefined。
   */
  function readCwd(session: SessionLike): string | undefined {
    if (workingDirectory !== undefined) {
      try {
        return workingDirectory.get(session)
      } catch (error) {
        log.warn(
          `会话 ${session.id}：读取当前工作目录失败（${describeError(error)}），回退到会话头 cwd`,
        )
      }
    }
    try {
      return session.header.cwd
    } catch (error) {
      log.warn(
        `会话 ${session.id}：读取会话头 cwd 失败（${describeError(error)}），本次只按用户级默认档播种`,
      )
      return undefined
    }
  }

  /**
   * 把会话归到工作区键（D8：规范绝对路径）。
   *
   * 软注入的缺席只降级、不报错：registry 缺席时以 cwd 的 canonical 为键（`registered: false`，
   * 未登记不是失败）；`workingDirectory` 缺席时用会话头 cwd。只有 cwd 缺失或 realpath 全程
   * 失败（目录已删）才返回 `undefined`——那是 fail-closed 的唯一出口，调用方据此只在用户档播种。
   *
   * @param session - 目标会话。
   * @returns 归属结果；无法归属时 `undefined`。
   */
  async function workspaceOf(session: SessionLike): Promise<WorkspaceAttribution | undefined> {
    reportWorkspaceServicesOnce()
    const cwd = readCwd(session)
    return await resolveWorkspaceAttribution(cwd, {
      roots: {
        registered: () =>
          (workspaceRegistry?.list() ?? []).map((workspace) => ({
            path: workspace.path,
            title: workspace.title,
          })),
      },
      // 端口形状见 `attribution.ts` 的 `RealpathPort`：方法对象而不是裸函数。
      realpath: { realpath: (path) => realpath(path) },
      log,
    })
  }

  /**
   * footer 下拉的可选项（面板分区与 `handleWorkspace` 的路径白名单共用同一读数，D-11）。
   *
   * `workspaceRegistry` 缺席时返回空数组（R6：软注入缺席只降级，不阻止插件加载，也不影响
   * 按会话寻址的工作区档读写）。每次调用都**现读** registry，不缓存：工作区登记 / 重命名 /
   * 删除之后，下拉与写目标白名单必须立刻跟上，缓存会给出过期集合。
   *
   * 排序按 title + path（UTF-16 码元序，不用 `localeCompare`）：同一份 registry 在任何运行
   * 环境都给同一顺序，下拉不会因 locale 抖动。标题重复时用路径兜底，顺序仍是确定的。
   *
   * @returns 已登记工作区的 `{key,title}` 投影（按标题、路径排序）。
   */
  function workspaceChoices(): readonly WorkspaceChoice[] {
    const registered = workspaceRegistry?.list() ?? []
    return registered
      .map((workspace) => ({ key: workspace.path, title: workspace.title }))
      .sort((left, right) => compareText(left.title, right.title) || compareText(left.key, right.key))
  }

  /**
   * 读本会话状态，并在 `seeded === false` 时按「用户档 ∪ 工作区档」播种（D8 / D9 / D10 / Q5-a）。
   *
   * 播种**一律写一条记录**（合并快照为空也写）：这条「空快照」记录是「本会话已建立过状态」的
   * 标记，`/tools reset` 因此能准确回到「我建这个会话时的样子」，也不会在每次 attach 时
   * 重新读默认档（那会让「改默认档不影响已存在会话」失效）。
   *
   * 并集语义（D10）：工作区档只能**追加**关闭项，不能反开用户级关闭项；合并交给 `mergeSeed`
   * （纯函数，排序去重）。归属失败（cwd 缺失 / realpath 全程失败）时 fail-closed——不读工作区
   * 档，只按用户级默认档播种，不阻塞会话创建。
   *
   * @param session - 刚落地的会话。
   * @returns 该会话当前生效的整值状态（已播种或原本就有记录）。
   */
  async function readOrSeed(session: SessionLike): Promise<SessionToolState> {
    const current = store.read(session)
    if (current.seeded) return current

    const defaults = await readDefaults(defaultsFile, defaultsIo, log)
    const attribution = await workspaceOf(session)
    let workspaceTexts: readonly string[] = NO_WORKSPACE_TEXTS
    if (attribution === undefined) {
      // fail-closed 的唯一出口：不读工作区档，避免把别的目录的偏好拍到本会话上。
      log.info(`会话 ${session.id}：无法归属工作区，本次只按用户级默认档播种`)
    } else {
      const workspaceFile = await readWorkspaces(workspacesFile, workspacesIo, log)
      workspaceTexts = disabledOf(workspaceFile, attribution.key)
    }

    return seed(session, current, mergeSeed(defaults.disabled, workspaceTexts))
  }

  /**
   * 把默认档拍成快照并立即写记录（快照同时是本会话的**初始关闭集**）。
   *
   * 两件事必须一起做：
   *
   * - `snapshot` 由 {@link withSnapshot} 拍下（`/tools reset` 回到这里）；
   * - `disabled` **同时**置成同一份集合——规格「用户级默认档」的 Scenario「新会话按默认档初始化」
   *   要求「新会话首步装配前 yunxiao 与 figma 已被掩蔽」。只写 `snapshot` 会让默认档在新会话上
   *   完全失效（首轮掩码只能由 `disabled` 推出），因此这里把两者在创建时对齐；此后只有
   *   `/tools off|on` 会让它们分叉。
   *
   * `withSnapshot` 不置 `seeded`（R14）：它标记「本会话已有整值记录」，属于写入点的事实。
   *
   * @param session - 目标会话。
   * @param state - 当前状态（通常是空态或日志里没有记录的旧会话）。
   * @param snapshot - 默认档的 `disabled`（读路径已规范化）。
   * @returns 写入后的状态（`seeded: true`）。
   */
  function seed(
    session: SessionLike,
    state: SessionToolState,
    snapshot: DefaultsSnapshot,
  ): SessionToolState {
    const withDefaults = withSnapshot(state, snapshot)
    const seeded: SessionToolState = {
      ...withDefaults,
      disabled: withDefaults.snapshot,
      seeded: true,
      updatedAt: Date.now(),
    }
    store.write(session, seeded)
    log.info(`会话 ${session.id}：已按默认档播种（快照 ${seeded.snapshot.length} 项，已生效）`)
    return seeded
  }

  // -------------------------------------------------------------------------
  // 每 agent 层：挂载 / 清账
  // -------------------------------------------------------------------------

  /**
   * 给一个 agent 挂载每 agent 层（幂等：注册表里已有该会话就直接返回）。
   *
   * 顺序写死：**先播种状态，再 attach**——首轮掩码必须包含默认档关闭的工具，否则会话的第一次
   * 装配会看见本该关闭的 schema（D7 的「先于首次装配」）。
   *
   * 失败不冒泡：`agent/created` 是串行广播，一个会话的层装配失败不该让会话创建失败；代价是
   * 那个会话的开关退化为无效果，由 error 日志暴露。
   *
   * @param agent - 目标 agent（会话 + 自己的 ctx）。
   */
  async function mount(agent: Agent): Promise<void> {
    const session = agent.session as unknown as SessionLike
    const id = session.id
    if (layers.has(id)) {
      log.warn(`会话 ${id}：已有层在注册表里，忽略重复挂载`)
      return
    }

    await ensureStore(session)
    const state = await readOrSeed(session)

    const layer = new SessionLayer({ log })
    // 先登记再挂载：`attach` 内部的失败已被层吞掉，登记保证 `layerFor` / `detach` 一定能找到它。
    layers.set(id, layer)
    await layer.attach(agent as unknown as AgentLike, state)
    // 技能分面的首轮事实只能在 attach 之后读（层在 attach 内同步取过一次 `skills`）。
    reportSkillsDegradationOnce(layer)
  }

  /**
   * 卸载一个会话的层（幂等；`detach` 本身也幂等且逐项容错）。
   *
   * @param sessionId - 目标会话 id。
   */
  function unmount(sessionId: string): void {
    const layer = layers.get(sessionId)
    if (layer === undefined) return
    layers.delete(sessionId)
    try {
      layer.detach()
    } catch (error) {
      // 层的 `detach` 已逐项 try/catch；这里只是防御（例如宿主在拆卸期换了服务实例）。
      log.error(`会话 ${sessionId}：拆卸每 agent 层失败（${describeError(error)}）`)
    }
  }

  // -------------------------------------------------------------------------
  // 生命周期接线
  // -------------------------------------------------------------------------

  // 1. 会话诞生：装配每 agent 层。返回 Promise 是刻意的——宿主的串行广播会 await 它，因此
  //    掩码在会话首步之前就已就位；子代理 / 队友会话走同一条路径（不区分 agent 来源）。
  ctx.on('agent/created', ({ agent }) => {
    const sessionId = agent.session.id
    // agent 自己的作用域承载拆卸：agent 退场时先于其完全消失卸载层，不依赖全局注册表。
    agent.ctx.effect(() => () => {
      unmount(sessionId)
    }, AGENT_LAYER_LABEL)

    return mount(agent).then(
      () => undefined,
      (error: unknown) => {
        unmount(sessionId)
        log.error(`会话 ${sessionId}：装配每 agent 层失败（${describeError(error)}），本会话的开关暂不生效`)
        return undefined
      },
    )
  })

  // 2. agent 退场：与上面的 scope effect 互为双保险（两者都幂等）。
  ctx.on('agent/disposed', ({ agent }) => {
    unmount(agent.session.id)
  })

  // 3. 工具注册表变化（MCP 服务器连上/断开、别的插件增删工具、本插件自己的 restrict 生效）：
  //    全量重算每一层。幂等是硬要求——一次不幂等的重算会喂自己。
  let toolChanges = 0
  ctx.on('tools/change', () => {
    toolChanges += 1
    if (toolChanges <= REPORTED_TOOL_CHANGES) {
      log.info(`收到 tools/change（第 ${toolChanges} 次），开始全量幂等重算 ${layers.size} 层`)
    }
    for (const [sessionId, layer] of layers) {
      try {
        layer.refresh()
      } catch (error) {
        log.error(`会话 ${sessionId}：tools/change 重算失败（${describeError(error)}）`)
      }
    }
  })

  // -------------------------------------------------------------------------
  // 软注入：投影注册 / 命令注册
  // -------------------------------------------------------------------------

  /** 需要在统一拆卸时反注册的回调（投影与命令各自一份）。 */
  const projectionDisposers = new Set<() => void>()
  const commandDisposers = new Set<() => void>()

  // 4. host-only 投影 `sessionToolToggle`（无 wire）：读路径的首选面（D10）。
  ctx.inject(['sessionProjections'], (scope) => {
    const service = scope.sessionProjections
    projections = {
      stateOf: (session, key) => service.stateOf(session as never, key),
    }

    const unit = createSessionToolToggleUnit(log)
    try {
      // R13：单元只给 fold，`stateSchema`（zod）由装配层合成完整 ProjectionDefinition。
      // 显式标注定义形状（而不是让 register 从参数字面量反推 S）：`createSessionToolToggleUnit`
      // 返回的是 `SessionToolState`（readonly 数组），而 zod 推断出的是可变数组——两者靠
      // 单态标注锚定到同一份 `SessionProjectionStateMap['sessionToolToggle']`。
      const definition: Omit<ProjectionDefinition<'sessionToolToggle'>, 'wire'> = {
        key: unit.key,
        stateVersion: unit.stateVersion,
        stateSchema: PROJECTION_STATE_SCHEMA,
        init: () => unit.init(),
        apply: (state, event) => unit.apply(state, event),
      }
      const dispose = service.register(definition)
      projectionDisposers.add(dispose)
      log.info('已注册 host-only 投影 sessionToolToggle（stateVersion 1，无 wire）')
    } catch (error) {
      // 注册失败只影响「投影优先」这条读路径：`RecordStateStore` 会回落到日志重放。
      log.error(`注册投影 sessionToolToggle 失败（${describeError(error)}），读路径退化为日志重放`)
    }
  })

  // 5. `/tools` 命令面：与 RPC 通道（第 6 步）共用同一份依赖（D14：不存在两份状态）。
  const controlDeps: ControlDeps = {
    store,
    layerFor: (sessionId) => layers.get(sessionId),
    defaultsPath: defaultsFile,
    defaultsIo,
    // 任务 6.5：工作区档的路径 / IO / 归属闭包 / 下拉投影（契约见 code-design §3.7）。
    // 路径与 IO 都复用播种段（4.3）的变量：工作区档与用户档同目录、同一套原子写与权限位。
    workspacesPath: workspacesFile,
    workspacesIo,
    workspaceOf,
    workspaceChoices,
    protectedNames,
    log,
  }
  // 任务 9.1 之后 `ToolsCommandDeps = ControlDeps`：这里只是保留既有变量名，不复制对象。
  const commandDeps: ToolsCommandDeps = controlDeps

  ctx.inject(['commands'], (scope) => {
    try {
      commandDisposers.add(scope.commands.register(toolsCommand(commandDeps)))
      log.info('已注册 /tools 命令（本会话开关 + 默认档 + 工作区档）')
    } catch (error) {
      log.error(`注册 /tools 命令失败（${describeError(error)}）`)
    }
  })

  // -------------------------------------------------------------------------
  // Connection RPC 通道（Web 面板的数据面）
  // -------------------------------------------------------------------------

  /** 通道 disposer（`connection.rpc.handle` 的返回值的同步包装），统一拆卸时释放。 */
  const channelDisposers = new Set<() => void>()

  /**
   * 会话寻址端口：请求里的 `string` 在这里换成宿主的 `SessionId`（品牌只在类型层，运行期同值）。
   *
   * `agents.get` 返回的 `Agent` 用 `as unknown as` 收窄成 {@link AgentLike}：宿主的
   * `SessionHeader.isSeeded` 是**可选**字段，而本插件的端口要求必填（`mount()` 里的会话是同一种
   * 收窄）。判 `session-not-live` 只用 `session.id`，不受这条收窄影响。
   */
  const agentsPort: AgentLookup = {
    get: (sessionId) => ctx.agents.get(sessionId as SessionId) as unknown as AgentLike | undefined,
  }

  /**
   * RPC 通道的依赖面：**与命令面共用同一份** `ControlDeps`（展开只复制引用，不复制状态）。
   *
   * 四件工作区读数（`workspacesPath` / `workspacesIo` / `workspaceOf` / `workspaceChoices`）
   * 已经随 `...controlDeps` 一并带过来：`snapshotOf` 组装工作区视图、`handleWorkspace` 的
   * 两种寻址形态与路径白名单都读这一份，装配层不另造读数逻辑（D14）。
   *
   * `RpcDeps` 相对 `ControlDeps` 的增量只有 `agents`：判 `session-not-live` 与取活会话（附录
   * §2.4 三步校验的第二、三步）。**描述读数不在装配层**：`rpc.ts` 内部的 `descriptionsOf`
   * 经 `layerFor(session.id)` 从本会话层取（D-4），这里不传任何全局读数。
   */
  const rpcDeps: RpcDeps = {
    ...controlDeps,
    agents: agentsPort,
  }

  // 6. Web 面板的 RPC 通道 `/session-tool-toggle`（D20 的五个端点）。两条注入要求与
  //    `connection` 从 `scope.root` 读的理由见文件头「服务注入」段（与
  //    `plugins/web-ux/src/index.ts:74-99` 同一份坑位说明）：`webServer` 缺席时回调不运行；
  //    `connection` 解析为空（宿主没有 Connection）只 warn，不抛——命令面照常可用。
  ctx.inject(['connection', 'webServer'], (scope) => {
    const connection = scope.root.get('connection')
    if (connection === undefined) {
      log.warn('connection 服务解析为空（宿主未提供 Connection），RPC 通道未挂载；/tools 命令面不受影响')
      return
    }

    // 形状对应在这里再钉一次（`RpcDispatcher` 参数少两个、信封逐字段兼容）：
    // `test/rpc.test.ts` 有同款赋值断言，挂载点不能是唯一没有护栏的地方。
    const handler: ConnectionRpcHandler = createRpcDispatcher(rpcDeps)
    const handle = connection.rpc.handle(CHANNEL, handler)

    // `handle` 的 disposer 是 async，且两条路径都可能释放它（注入作用域的拆卸 + 统一拆卸）：
    // 用一个幂等包装，保证只真正释放一次。
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      channelDisposers.delete(release)
      try {
        // 拆卸期的失败只记日志：不该变成未处理拒绝，也不该让其余资源的回收中断。
        void handle().catch((error: unknown) => {
          log.error(`反注册 RPC 通道 ${CHANNEL} 失败（${describeError(error)}）`)
        })
      } catch (error) {
        log.error(`反注册 RPC 通道 ${CHANNEL} 失败（${describeError(error)}）`)
      }
    }
    channelDisposers.add(release)
    log.info(`已挂载 RPC 通道 ${CHANNEL}（端点 ${ENDPOINTS.join(' / ')}）`)
    // 注入作用域卸载时也走同一个幂等函数。
    return release
  })

  // -------------------------------------------------------------------------
  // 统一拆卸 + 启动补挂
  // -------------------------------------------------------------------------

  // 7. 卸载：本插件装上的东西全部收回。各步独立容错——某一步失败不该让其余资源悬着。
  //    技能分面（影子 stub、`skills/change` 监听）由每层自己的 `detach` 收回，这里只需要
  //    把所有层 unmount 掉；工作区软注入的清理函数单独收在清单里（见 trackWorkspaceInjection）。
  ctx.effect(() => () => {
    for (const sessionId of Array.from(layers.keys())) unmount(sessionId)
    for (const dispose of Array.from(workspaceInjectionDisposers)) {
      // release 自己会把它从集合里删掉，这里再删一次是无害的防御（集合可能在释放期被并发改动）。
      workspaceInjectionDisposers.delete(dispose)
      dispose()
    }
    for (const dispose of Array.from(projectionDisposers)) {
      projectionDisposers.delete(dispose)
      try {
        dispose()
      } catch (error) {
        log.error(`反注册投影失败（${describeError(error)}）`)
      }
    }
    for (const dispose of Array.from(commandDisposers)) {
      commandDisposers.delete(dispose)
      try {
        dispose()
      } catch (error) {
        log.error(`反注册 /tools 命令失败（${describeError(error)}）`)
      }
    }
    for (const dispose of Array.from(channelDisposers)) {
      // release 自己会把它从集合里删掉，这里再删一次是无害的防御（集合可能在释放期被并发改动）。
      channelDisposers.delete(dispose)
      try {
        dispose()
      } catch (error) {
        log.error(`反注册 RPC 通道失败（${describeError(error)}）`)
      }
    }
    log.info('已统一拆卸：会话层（含技能分面）、工作区软注入、投影注册、命令注册、RPC 通道')
  }, TEARDOWN_LABEL)

  // 8. 启动补挂：插件可能晚于会话加载（profile 中途装入、热重载）。这些 agent 不会再发
  //    `agent/created` 给我们，因此按同一路径补挂一次。
  let existing: Agent[] = []
  try {
    existing = ctx.agents.list()
  } catch (error) {
    log.error(`读取已存在会话失败（${describeError(error)}），跳过启动补挂`)
  }
  if (existing.length > 0) {
    log.info(`启动补挂 ${existing.length} 个已存在会话`)
    for (const agent of existing) {
      void mount(agent).catch((error: unknown) => {
        log.error(`启动补挂会话 ${agent.session.id} 失败（${describeError(error)}）`)
      })
    }
  }

  log.info(
    `已装配：inject=[${inject.join(', ')}]，默认档 ${defaultsFile}，工作区档 ${workspacesFile}，`
      + `保护名单 ${protectedNames.size} 项，`
      + `持久化 ${settings.storage === 'memory' ? 'memory（配置指定）' : 'auto（待首个会话解析）'}`,
  )
}

// ---------------------------------------------------------------------------
// 宿主面适配：日志、配置读取
// ---------------------------------------------------------------------------

/**
 * 把宿主日志适配成诊断端口。
 *
 * 每一行都同时写 `ctx.logger` 与 console（照抄 `project-mcp/src/host/host-io.ts` 的
 * `scanLog`）：web profile 在 boot 之后不注册 logger exporter，单写 `ctx.logger` 在
 * `docker logs dsh` 里是看不见的——而「某个工具的 schema 为什么消失了」正是要在那里排查的
 * 问题。console 那份是进程日志面，logger 那份留在应用内缓冲里。
 *
 * @param ctx - 宿主上下文（提供 `logger`）。
 * @returns 只做三件事的 {@link SpecLog}。
 */
function createLog(ctx: Context): SpecLog {
  const line = (message: string): string => `${LOG_PREFIX}${message}`
  return {
    info: (message) => {
      ctx.logger.info(line(message))
      console.info(line(message))
    },
    warn: (message) => {
      ctx.logger.warn(line(message))
      console.warn(line(message))
    },
    error: (message) => {
      ctx.logger.error(line(message))
      console.error(line(message))
    },
  }
}

/**
 * 读取并归一插件配置。
 *
 * `Config`（Schemastery）已经在 fiber 加载前校验过类型并填好默认值，这里只做**语义归一**：
 *
 * - 三个路径覆盖项必须是**绝对路径**（默认档、工作区档与宿主模块锚点的语义都是绝对路径，
 *   静默按当前工作目录解析会让「我明明配了」变成不可解释的行为），相对路径视为未设 + warn；
 * - `protectedTools` 逐条 trim、丢空条目、按 `Set` 去重（基线本身在 `apply` 里并进去）；
 * - 防御性重判类型（`storage` / `protectedTools` / 三个路径）：`apply` 也可能被直接以裸配置
 *   调用（单测、极简组合、未来的 RPC 装配），此时没有 schema 兜底，坏值只降级、绝不抛错。
 *
 * @param raw - cordis 交进来的配置（已过 schema，或直接调用时的裸对象；都可能为 `undefined`）。
 * @param log - 诊断出口。
 * @returns 归一后的装配期配置。
 */
function readSettings(raw: SessionToolToggleConfig | undefined, log: SpecLog): Settings {
  if (raw === undefined || raw === null) {
    return {
      storage: 'auto',
      protectedTools: [],
      defaultsFile: undefined,
      workspacesFile: undefined,
      hostModuleBase: undefined,
    }
  }

  const record = raw as unknown as Record<string, unknown>
  const storage = record.storage
  if (storage !== undefined && storage !== null && storage !== 'auto' && storage !== 'memory') {
    log.warn(`配置 storage 非法（收到 ${describeRaw(storage)}），按 auto 处理`)
  }

  const protectedTools: string[] = []
  const rawProtected = record.protectedTools
  if (rawProtected !== undefined && rawProtected !== null) {
    if (!Array.isArray(rawProtected)) {
      log.warn(`配置 protectedTools 不是数组（收到 ${describeRaw(rawProtected)}），忽略`)
    } else {
      for (const entry of rawProtected) {
        if (typeof entry === 'string' && entry.trim() !== '') protectedTools.push(entry.trim())
        else log.warn(`配置 protectedTools 里有非字符串/空条目（${describeRaw(entry)}），已丢弃`)
      }
    }
  }

  return {
    storage: storage === 'memory' ? 'memory' : 'auto',
    protectedTools: Array.from(new Set(protectedTools)),
    defaultsFile: readPathOption(record.defaultsFile, 'defaultsFile', log),
    workspacesFile: readPathOption(record.workspacesFile, 'workspacesFile', log),
    hostModuleBase: readPathOption(record.hostModuleBase, 'hostModuleBase', log),
  }
}

/**
 * 读一个「绝对路径覆盖」配置项。
 *
 * 相对路径**不**接受（默认档 / 工作区档 / 宿主模块锚点的语义都是绝对路径，静默按当前工作
 * 目录解析会让「我明明配了」变成不可解释的行为）：非字符串 / 空白 / 相对路径一律视为未设 + warn。
 *
 * @param value - 原始值。
 * @param key - 配置键名（只用于文案）。
 * @param log - 诊断出口。
 * @returns 覆盖值或 `undefined`。
 */
function readPathOption(value: unknown, key: string, log: SpecLog): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    log.warn(`配置 ${key} 不是非空字符串（收到 ${describeRaw(value)}），按未设处理`)
    return undefined
  }
  const trimmed = value.trim()
  if (!isAbsolutePath(trimmed)) {
    log.warn(`配置 ${key} 不是绝对路径（${trimmed}），按未设处理`)
    return undefined
  }
  return trimmed
}

/**
 * 是否绝对路径（POSIX `/` 或 Windows 盘符）。
 *
 * 刻意不 import `node:path`：这里只需要「是不是绝对路径」这一个判断，而 Windows 盘符形式在
 * POSIX 上也要能被识别（配置可能随用户 profile 跨平台携带）。
 *
 * @param value - 已 trim 的路径文本。
 * @returns 是绝对路径时为 true。
 */
function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value)
}

/**
 * 文本比较（UTF-16 码元序）。
 *
 * 与各模块的 `compareText` 同一纪律：不用 `localeCompare`，排序结果必须与运行环境的
 * locale 无关（工作区下拉的选项顺序因此稳定、可复现）。
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
 * 把一个 `unknown` 抛出物写成诊断里可读的一行。
 *
 * @param error - 任意抛出物。
 * @returns 错误消息或字符串化后的值。
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

