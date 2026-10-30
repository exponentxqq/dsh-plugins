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
 *    `seeded === false` 时按默认档拍快照并**立即写一条记录**（空也写，D9）→
 *    `new SessionLayer(...)` → `await layer.attach(agent, state)`，首轮掩码因此先于该会话的
 *    首次装配生效。子代理 / 队友会话走**同一条路径**，不区分 agent 来源：它们的会话级开关
 *    与父会话互不继承（C6），但装配方式完全一致。
 * 2. `agent/disposed` 与 agent 自己的 scope effect：双保险清账（`detach` + 从注册表删除）。
 * 3. `tools/change`：对注册表里**全部**层做一次 `refresh()`（幂等；`restrict` 自己也会触发
 *    该事件，层内的 diff 守卫保证不自激）。
 * 4. 软注入三条（见下）：`sessionProjections` 投影、`commands` 命令、`connection` + `webServer`
 *    的 RPC 通道。
 * 5. `ctx.effect` 统一拆卸：所有层 detach、投影 / 命令 / 通道反注册。
 * 6. 启动补挂：`ctx.agents.list()` 里已存在的会话走同一路径（插件晚于 agent 加载、热重载、
 *    或 profile 中途装入时）。
 *
 * 服务注入（全部软注入，任一缺席都不让插件本身加载失败）：
 *
 * - `ctx.inject(['commands'])` → 注册 `/tools`；
 * - `ctx.inject(['sessionProjections'])` → 注册 host-only 投影 `sessionToolToggle`（无 wire，
 *   D10 的读路径首选；投影单元只给 fold，`stateSchema` 按 R13 由本文件用 zod 合成）；
 * - `ctx.inject(['connection', 'webServer'])` → 挂载 Connection RPC 通道 `/session-tool-toggle`
 *   （Web 面板的数据面，D20 的四个端点）。**两条注入要求都不是风格问题**：`webServer` 必须在
 *   注入名单里（否则回调在路由表就绪前运行，注册出来的 route 没有宿主），`connection` 必须从
 *   `scope.root` 读——`connection.rpc.handle` 把 `webServer` 当成「读它的那个上下文」的属性来
 *   解析，而插件 fiber 只看得见自己 inject 的服务，直接读兄弟行的 `webServer` 会抛
 *   `cannot get property "webServer" without inject`，route 注册失败后每个请求都落到静态 SPA
 *   兜底（HTTP 405）。完整坑位说明见 `plugins/web-ux/src/index.ts:74-99`。`connection` 解析为
 *   空只 warn 不抛（headless / 非 web profile 照常加载，`/tools` 命令面不受影响）。
 *
 * 依赖装配：`ControlDeps`（层注册表 + `StateStore` + 默认档 IO + 保护名单 + 全局层
 * `catalog` + 日志）只构造**一份**，直接交给命令面与 RPC 通道（`RpcDeps` 在同一份之上只补
 * agent 查找面与描述读数）；两者因此不存在两份状态（D14）。`catalog` 自任务 9.1 起就在
 * `ControlDeps` 里（R15 ①），`ToolsCommandDeps` 只是它的后向兼容别名。
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
import { PROTECTED_BASELINE } from './address.ts'
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
import type {
  AgentLike,
  Config as SessionToolToggleConfig,
  ControlDeps,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
} from './types.ts'

/** Cordis 插件名：bundle 行的 id 与 loader 诊断都用它。 */
export const name = 'session-tool-toggle'

/**
 * 依赖服务名单：agent 注册表（生命周期 + 启动补挂）与工具注册表（全局层读数、每 agent 掩码）。
 *
 * `commands` / `sessionProjections` 刻意**不**在这里：它们是可选能力面，走
 * `ctx.inject([...])` 软注入，缺席时插件照常加载（只是没有 `/tools` 或没有投影读面）。
 */
export const inject: readonly string[] = ['agents', 'tools']

/**
 * 插件配置的**原生 Schemastery** schema（profile 里给本插件行的 `config:` 段由它校验）。
 *
 * 四个键全部可选，`cordis.patch.yml` 因此不带 `config:` 段——零配置可跑：
 * `storage` 默认 `auto`（宿主模块可用则写会话日志，否则内存降级）、`protectedTools` 默认空数组
 * （基线永远在，只增不减）、两个路径覆盖项缺省时走各自的默认位置。
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
  /** 宿主模块解析锚点覆盖值（排障 / 单测用）。 */
  readonly hostModuleBase: string | undefined
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

  /**
   * 层注册表：**单点持有**（`sessionId → 层`）。命令面、`tools/change`、启动补挂、拆卸都只
   * 通过它找层，因此「同一会话只有一条写入路径」是结构事实（D14）。
   *
   * 键是宿主的 `SessionId`（运行时就是字符串），值是该会话唯一的 {@link SessionLayer}。
   */
  const layers = new Map<string, SessionLayer>()

  /**
   * 全局层工具注册名（插件自身 ctx 读，**不受**任何 agent 限制）。
   *
   * 掩码推导与 `/tools status` 的分组计数都必须用这个未掩码集合：从 agent 已被本插件掩过的
   * 视图推导 deny 会算出越来越小的集合（`mask.ts` 的 carried 正是为此存在）。
   */
  const catalog = (): readonly string[] => ctx.tools.schemas().map((schema) => schema.name)

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

  /**
   * 读本会话状态，并在 `seeded === false` 时按默认档播种（D8 / D9 / Q5-a）。
   *
   * 播种**一律写一条记录**（默认档为空也写）：这条「空快照」记录是「本会话已建立过状态」的
   * 标记，`/tools reset` 因此能准确回到「我建这个会话时的样子」，也不会在每次 attach 时
   * 重新读默认档（那会让「改默认档不影响已存在会话」失效）。
   *
   * @param session - 刚落地的会话。
   * @returns 该会话当前生效的整值状态（已播种或原本就有记录）。
   */
  async function readOrSeed(session: SessionLike): Promise<SessionToolState> {
    const current = store.read(session)
    if (current.seeded) return current

    const defaults = await readDefaults(defaultsFile, defaultsIo, log)
    return seed(session, current, defaults.disabled)
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

    const layer = new SessionLayer({ log, catalog })
    // 先登记再挂载：`attach` 内部的失败已被层吞掉，登记保证 `layerFor` / `detach` 一定能找到它。
    layers.set(id, layer)
    await layer.attach(agent as unknown as AgentLike, state)
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
    protectedNames,
    log,
    // R15（任务 9.1）：全局层未掩码注册名并入 `ControlDeps`，命令面与 RPC 共用同一份。
    catalog,
  }
  // 任务 9.1 之后 `ToolsCommandDeps = ControlDeps`：这里只是保留既有变量名，不复制对象。
  const commandDeps: ToolsCommandDeps = controlDeps

  ctx.inject(['commands'], (scope) => {
    try {
      commandDisposers.add(scope.commands.register(toolsCommand(commandDeps)))
      log.info('已注册 /tools 命令（本会话开关 + 默认档）')
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
   * 另补两件命令面不需要的东西（`RpcDeps` 相对 `ControlDeps` 的增量）：
   *
   * - `agents`：判 `session-not-live` 与取活会话（附录 §2.4 三步校验的第二、三步）；
   * - `descriptions`（R19）：面板的工具描述来源，与 `catalog` 同一读数面（`ctx.tools.schemas()`）；
   *   缺了它面板仍可用，只是每条工具不带 description。
   */
  const rpcDeps: RpcDeps = {
    ...controlDeps,
    agents: agentsPort,
    descriptions: () => new Map(ctx.tools.schemas().map((schema) => [schema.name, schema.description ?? ''])),
  }

  // 6. Web 面板的 RPC 通道 `/session-tool-toggle`（D20 的四个端点）。两条注入要求与
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
  ctx.effect(() => () => {
    for (const sessionId of Array.from(layers.keys())) unmount(sessionId)
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
    log.info('已统一拆卸：会话层、投影注册、命令注册、RPC 通道')
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
    `已装配：inject=[${inject.join(', ')}]，默认档 ${defaultsFile}，保护名单 ${protectedNames.size} 项，`
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
 * - 两个路径覆盖项必须是**绝对路径**（默认档与宿主模块锚点的语义都是绝对路径，静默按当前
 *   工作目录解析会让「我明明配了」变成不可解释的行为），相对路径视为未设 + warn；
 * - `protectedTools` 逐条 trim、丢空条目、按 `Set` 去重（基线本身在 `apply` 里并进去）；
 * - 防御性重判类型（`storage` / `protectedTools` / 两个路径）：`apply` 也可能被直接以裸配置
 *   调用（单测、极简组合、未来的 RPC 装配），此时没有 schema 兜底，坏值只降级、绝不抛错。
 *
 * @param raw - cordis 交进来的配置（已过 schema，或直接调用时的裸对象；都可能为 `undefined`）。
 * @param log - 诊断出口。
 * @returns 归一后的装配期配置。
 */
function readSettings(raw: SessionToolToggleConfig | undefined, log: SpecLog): Settings {
  if (raw === undefined || raw === null) {
    return { storage: 'auto', protectedTools: [], defaultsFile: undefined, hostModuleBase: undefined }
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
    hostModuleBase: readPathOption(record.hostModuleBase, 'hostModuleBase', log),
  }
}

/**
 * 读一个「绝对路径覆盖」配置项。
 *
 * 相对路径**不**接受（默认档与宿主模块锚点的语义都是绝对路径，静默按当前工作目录解析会让
 * 「我明明配了」变成不可解释的行为）：非字符串 / 空白 / 相对路径一律视为未设 + warn。
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

