/**
 * 持久化：整值插件记录、host-only 投影单元、读判定与两条 `StateStore` 实现。
 *
 * 设计要点（code-design §3.2 / §4 D1、D9、D10）：
 *
 * - **整值事件**：一条记录永远写全量状态（`SessionToolState`），因此读路径只需最后
 *   一条有效记录；`disabled` / `snapshot` 里只存规范形文本。
 * - **记录通道**：`host.appendPluginRecord(session, STATE_RECORD_TYPE, state)`。写入面
 *   由 `host-runtime.ts` 解析并通过身份断言（D1）；本模块不 import 任何宿主包，读路径
 *   零宿主运行时依赖。
 * - **host-only 投影**：`sessionToolToggle`（`stateVersion: 1`、无 `wire`）。`apply`
 *   对本插件之外的事件**返回同一引用**（宿主据此零下游工作），对本插件记录做
 *   `normalizeState` 自校验。投影是整段日志的惰性折叠，读路径以它为首选（D10）。
 * - **读判定顺序（写死）**：内存降级后备 → `sessionProjections.stateOf(...)` →
 *   `foldStatus(session.snapshotEvents())` 重放 → `EMPTY_STATE` + 一次 warn。
 * - **写失败降级**：`appendPluginRecord` 抛错（reenter / 会话已关闭 / brand 错误）时，
 *   把整值状态记进本会话的内存后备、`kind` 切到 `memory`、warn 一次；后续 `write`
 *   只更内存、`read` 优先读后备——**开关不丢**。降级后不再尝试写日志（同一个写入面
 *   失败一次就够，重试只会刷屏），因此 `kind` 是「实际生效通道」而不是「预期通道」。
 * - **禁止**用 `session.append` 伪造记录（D1）：`append` 写不出 `ignorable: true`，
 *   而缺该标记的未知事件会让旧读者拒绝重建会话日志；本模块唯一的写入调用是
 *   `appendPluginRecord`。
 *
 * 两条刻意的取舍：
 *
 * - **降级是进程级而非会话级**：写入面失败通常意味着整个宿主那一份模块不可用（版本
 *   漂移、会话关闭、reenter），让部分会话继续写、部分不写只会产生更难查的半状态；
 *   内存后备仍按 `session.id` 分槽，所以每个会话的开关互不串。
 * - **两处 module augmentation 就放在本文件**：记录 type 与投影 key 是持久化契约的
 *   两半，放进任何其他模块都会让「只 import 类型」的下游被迫拖进本实现。
 *
 * @module dsh-plugin-session-tool-toggle/host/record-store
 */

// 两处 module augmentation 的**目标模块**必须先进入 program：TypeScript 只对已加载的
// 模块做增强，裸 `declare module '<包名>'` 会被当成 ambient 声明（TS2664）。空类型导入
// 只有类型侧效果，构建产物里不会出现这两条 import。
import type {} from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-projection/types'

import { EMPTY_STATE, STATE_RECORD_TYPE, foldStatus, normalizeState } from './state.ts'
import type {
  HostSessionApi,
  SessionEventLike,
  SessionLike,
  SessionToolState,
  SpecLog,
  StateStore,
  StoreKind,
} from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** 本插件的整值会话开关状态（type 文法见 `dsh-session` 的 `PLUGIN_RECORD_TYPE`）。 */
    'plugin:session-tool-toggle/state': SessionToolState
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** host-only 投影：不回传客户端（无 wire）。 */
    sessionToolToggle: SessionToolState
  }
}

/**
 * 宿主的插件记录 type 文法，与 `dsh-session/lib/index.js` 的 `PLUGIN_RECORD_TYPE`
 * 逐字一致。
 *
 * 本模块自带一份而不是 import 宿主常量：读路径（`apply` 的判定、`read` 的重放兜底）
 * 必须在宿主模块不可用时照常工作，而这份正则就是「零运行时依赖」的全部成本。
 */
const PLUGIN_RECORD_TYPE = /^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/u

/** 不关心诊断的场合（默认导出的投影单元实例、测试）用它。 */
const QUIET_LOG: SpecLog = { info: () => {}, warn: () => {}, error: () => {} }

/** 一条已提交的插件记录（`dsh-session` 的 `PluginRecord` 的最小结构面）。 */
export interface HostPluginRecord {
  /** 记录类型（`plugin:` 前缀的合法文法）。 */
  readonly type: string
  /** 会话内单调递增序号。 */
  readonly seq: number
  /** 提交时间（epoch ms）。 */
  readonly time: number
  /** 记录载荷（owner 自校验前的 `unknown`）。 */
  readonly data: unknown
}

/**
 * 把一条已提交事件读成插件记录（宿主 `pluginRecordOf` 等价的最小子集）。
 *
 * 判定与宿主逐条一致，因为读者必须与写者用同一把尺：
 * `event.ignorable === true` 且 `type` 命中 `PLUGIN_RECORD_TYPE`。缺 `ignorable` 的
 * 未知事件在宿主语义里是「required」——旧读者遇到它会拒绝对话重建，所以这里也绝不
 * 把它当记录。
 *
 * 返回**任何**合法插件记录（不只本插件的）：`apply` 用 `type` 比较来判定归属，
 * 这正是「同一份判定函数、两处使用」的形态。
 *
 * @param event - 任意已提交事件。
 * @returns 记录四元组；不是插件记录时为 `undefined`。
 */
export function recordOf(event: SessionEventLike): HostPluginRecord | undefined {
  if (event.ignorable !== true) return undefined
  if (!PLUGIN_RECORD_TYPE.test(event.type)) return undefined
  return { type: event.type, seq: event.seq, time: event.time, data: event.data }
}

/**
 * 投影单元的形状：`ProjectionDefinition` 的 fold 部分（注册是装配层的事）。
 *
 * 刻意**不含** `stateSchema`：注册时要由装配层提供 zod schema（宿主用它校验持久化
 * 缓存行），而本单元只负责纯折叠。`stateVersion: 1` 表示序列化字段与 fold 语义的
 * 版本，改字段或改语义时必须递增，否则旧缓存行会被前向应用成垃圾。
 */
export interface SessionToolToggleUnit {
  /** 投影 key：`SessionProjectionStateMap` 的增强项，必须与注册处逐字一致。 */
  readonly key: 'sessionToolToggle'
  /** 持久化缓存失效版本。 */
  readonly stateVersion: 1
  /** 空日志（含 fork 继承前缀之外）的初始状态。 */
  init(): SessionToolState
  /**
   * 纯折叠一步：非本插件记录返回同一引用，本插件记录做 owner 自校验。
   * @param state - 覆盖此前全部事件的状态。
   * @param event - 下一条已提交事件。
   * @returns 下一步状态。
   */
  apply(state: SessionToolState, event: SessionEventLike): SessionToolState
}

/**
 * 创建投影单元：同一份 fold 语义，诊断出口由装配层注入。
 *
 * 用工厂而不是全局单例，是因为 `normalizeState` 的损坏载荷告警必须进**插件自己的**
 * 日志（每条坏记录一条 warn，能定位到是哪个会话的日志坏了）；默认实例用静默日志，
 * 生产注册请优先用本工厂。
 *
 * @param log - 诊断出口（`normalizeState` 的 warn 走它）。
 * @returns 可交给 `ctx.sessionProjections.register(...)` 的 fold 单元。
 */
export function createSessionToolToggleUnit(log: SpecLog): SessionToolToggleUnit {
  return {
    key: 'sessionToolToggle',
    stateVersion: 1,
    init: () => EMPTY_STATE,
    apply(state, event) {
      const record = recordOf(event)
      // 不是本插件的记录（或根本不是插件记录）→ 同一引用：宿主按 Object.is 短路。
      if (record === undefined || record.type !== STATE_RECORD_TYPE) return state
      return normalizeState(record.data, log)
    },
  }
}

/**
 * 默认投影单元实例（静默诊断）。
 *
 * 只用于不关心告警的场合（类型演练、单测的「默认实例」断言）；生产注册用
 * {@link createSessionToolToggleUnit} 传自身 `log`，否则损坏的日志载荷会静默降级。
 */
export const sessionToolToggle: SessionToolToggleUnit = createSessionToolToggleUnit(QUIET_LOG)

/**
 * 读路径用到的 `ctx.sessionProjections` 窄面。
 *
 * 只声明本模块真正调用的一次读：真实服务的 `stateOf` 还接受任意注册 key，但本插件
 * 只读自己那一个；窄面让装配层能把「宿主服务 → 端口」的适配集中在一处。
 *
 * 类型上 `session` 是 {@link SessionLike}（宿主 `Session` 的结构子集），真实服务要求
 * 完整 `Session`；装配层做一次适配断言即可，本模块不 import 宿主类型。
 */
export interface SessionProjectionsLike {
  /**
   * 读一个 unit 的当前宿主状态。
   * @param session - 目标会话。
   * @param key - 已注册的投影 key。
   * @returns 当前状态；key 未注册时为 `undefined`。
   */
  stateOf(session: SessionLike, key: 'sessionToolToggle'): SessionToolState | undefined
}

/** `RecordStateStore` 的构造依赖。 */
export interface RecordStateStoreDeps {
  /** 宿主那一份 `dsh-session` 的写入面（必须已过身份断言）。 */
  readonly host: HostSessionApi
  /** 投影服务；极简组合里可缺席（缺席时走日志重放兜底）。 */
  readonly projections?: SessionProjectionsLike
  /** 诊断出口。 */
  readonly log: SpecLog
}

/**
 * 记录通道：投影优先读、`appendPluginRecord` 写，写失败降级内存后备。
 *
 * `kind` 是**实际生效通道**：写失败后变 `memory`，面板与 `/tools status` 据此解释
 * 「本会话开关不持久」。降级后 `read` 优先返回本会话的内存后备——否则读回的是日志
 * 里的旧值，用户刚关掉的开关会「在回执上成功、下一次读又回来了」。
 */
export class RecordStateStore implements StateStore {
  private readonly host: HostSessionApi
  private readonly projections: SessionProjectionsLike | undefined
  private readonly log: SpecLog
  /** 写失败后按 `session.id` 分槽的内存后备（降级期间 read 的唯一真源）。 */
  private readonly degradedStates = new Map<string, SessionToolState>()
  /** 写入面是否已降级（进程级：一个写入面失败，全部会话不再尝试写日志）。 */
  private degraded = false
  /** 写失败告警是否已发过（不刷屏：每次 append 失败只报第一条）。 */
  private warnedWriteFailure = false
  /** 「两种读面都不可用」的告警是否已发过（每个 store 实例一次）。 */
  private warnedNoLogFace = false
  /** 最近一次投影读取失败的原因（拼进最终的一条 warn，不单独发）。 */
  private projectionFailure: string | undefined
  /** 最近一次日志读面失败的原因（拼进最终的一条 warn，不单独发）。 */
  private logFailure: string | undefined

  /**
   * @param deps - 宿主写入面、可选投影服务、诊断出口。
   */
  constructor(deps: RecordStateStoreDeps) {
    this.host = deps.host
    this.projections = deps.projections
    this.log = deps.log
  }

  /** 实际生效通道：`record`（写日志）或 `memory`（写失败后的本进程内存）。 */
  get kind(): StoreKind {
    return this.degraded ? 'memory' : 'record'
  }

  /**
   * 读本会话状态，判定顺序写死（D10）。
   *
   * @param session - 目标会话。
   * @returns 规范化后的整值状态；永不抛错。
   */
  read(session: SessionLike): SessionToolState {
    const fallback = this.degradedStates.get(session.id)
    if (fallback !== undefined) return fallback

    // 每次读都重置失败原因：它们只服务于「本次读两种读面都失败」的那一条 warn。
    this.projectionFailure = undefined
    this.logFailure = undefined

    const projected = this.readProjection(session)
    if (projected !== undefined) return projected

    const replayed = this.readLog(session)
    if (replayed !== undefined) return replayed

    this.warnNoLogFace(session)
    return EMPTY_STATE
  }

  /**
   * 写整值状态；`appendPluginRecord` 抛错时降级内存态并 warn 一次，**不**向上抛。
   *
   * 不抛的理由：命令面与面板的成功语义是「开关已生效」——掩码与守卫都读内存/新状态，
   * 持久化只是「resume 后还在」的附加保证。让命令因持久化失败而失败，会让用户在最
   * 需要关掉某个工具的会话里关不掉它。
   *
   * @param session - 目标会话。
   * @param state - 新的整值状态（时间戳由调用方打）。
   */
  write(session: SessionLike, state: SessionToolState): void {
    if (this.degraded) {
      this.degradedStates.set(session.id, state)
      return
    }

    try {
      this.host.appendPluginRecord(session, STATE_RECORD_TYPE, state)
    } catch (error) {
      this.degraded = true
      this.degradedStates.set(session.id, state)
      if (!this.warnedWriteFailure) {
        this.warnedWriteFailure = true
        this.log.warn(
          `写入会话插件记录失败（${describeError(error)}），本进程已降级为内存态：`
            + '开关在当前会话内仍生效，但 resume 后会丢失',
        )
      }
    }
  }

  /**
   * 投影优先读：服务缺席、key 未注册（返回 `undefined`）或调用抛错都视为不可用。
   *
   * 失败原因只记下、不立即告警：读路径的契约是「投影不可用 → 重放兜底」，兜底成功时
   * 没有任何降级事实需要惊动用户；只有两种读面都失败才汇总成一条 warn。
   *
   * @param session - 目标会话。
   * @returns 投影状态；不可用时为 `undefined`（调用方回落到日志重放）。
   */
  private readProjection(session: SessionLike): SessionToolState | undefined {
    if (this.projections === undefined) return undefined
    try {
      return this.projections.stateOf(session, 'sessionToolToggle')
    } catch (error) {
      this.projectionFailure = describeError(error)
      return undefined
    }
  }

  /**
   * 日志重放兜底：只依赖公开读面 `session.snapshotEvents()`，不需要宿主模块。
   *
   * 空日志返回 `EMPTY_STATE`（`foldStatus` 的契约），这也算「读面可用」，因此不告警。
   *
   * @param session - 目标会话。
   * @returns 折叠状态；读面调用抛错时为 `undefined`（调用方按空态 + warn 处理）。
   */
  private readLog(session: SessionLike): SessionToolState | undefined {
    try {
      return foldStatus(session.snapshotEvents(), this.log)
    } catch (error) {
      this.logFailure = describeError(error)
      return undefined
    }
  }

  /**
   * 「投影缺席 / 不可用 + 日志读面不可用」的唯一警告出口（每个 store 实例一条）。
   *
   * @param session - 目标会话（文案里带 id，便于定位是哪个会话缺读面）。
   */
  private warnNoLogFace(session: SessionLike): void {
    if (this.warnedNoLogFace) return
    this.warnedNoLogFace = true
    const projection = this.projections === undefined
      ? 'sessionProjections 未安装'
      : `投影读取失败（${this.projectionFailure ?? 'stateOf 返回 undefined'}）`
    const logFace = this.logFailure === undefined
      ? 'snapshotEvents 未提供读面'
      : `日志读面调用失败（${this.logFailure}）`
    this.log.warn(
      `会话 ${session.id} 没有可用的读面（${projection}；${logFace}），开关状态按空态处理`,
    )
  }
}

/**
 * 内存降级通道：`read` 返回本会话上次写入值，`write` 只更内存。
 *
 * 按 `session.id` 分槽（而不是一个字段存「上次写入」）：同一个 store 服务多个会话，
 * 串状态的降级比不降级更糟——用户会在 A 会话关掉工具、B 会话跟着被关。
 */
export class MemoryStateStore implements StateStore {
  /** 降级通道恒为 `memory`。 */
  readonly kind: StoreKind = 'memory'
  /** 按会话 id 存放的整值状态。 */
  private readonly states = new Map<string, SessionToolState>()

  /**
   * @param session - 目标会话。
   * @returns 该会话上次写入的状态；没写过时为 {@link EMPTY_STATE}。
   */
  read(session: SessionLike): SessionToolState {
    return this.states.get(session.id) ?? EMPTY_STATE
  }

  /**
   * @param session - 目标会话。
   * @param state - 新的整值状态。
   */
  write(session: SessionLike, state: SessionToolState): void {
    this.states.set(session.id, state)
  }
}

/** `createStateStore` 的依赖：宿主写入面可缺席（缺席即内存降级）。 */
export interface StateStoreDeps {
  /** 宿主写入面；`loadHostSessionApi` 返回 `undefined` 时省略。 */
  readonly host?: HostSessionApi
  /** 投影服务（可缺席）。 */
  readonly projections?: SessionProjectionsLike
  /** 诊断出口。 */
  readonly log: SpecLog
}

/**
 * 按宿主写入面是否可用选择实现（装配层唯一需要知道的判定）。
 *
 * 身份断言失败 / 解析失败 → `undefined` → {@link MemoryStateStore}（`kind === 'memory'`，
 * 从不调用 append）；可用 → {@link RecordStateStore}（写失败仍会自行降级）。
 *
 * @param deps - 写入面、投影服务与诊断出口。
 * @returns 生效的存储端口。
 */
export function createStateStore(deps: StateStoreDeps): StateStore {
  if (deps.host === undefined) return new MemoryStateStore()
  return new RecordStateStore({ host: deps.host, projections: deps.projections, log: deps.log })
}

/**
 * 把一个 `unknown` 抛出物写成诊断里可读的一行。
 *
 * @param error - 任意抛出物。
 * @returns 错误消息（含 errno code，若有）。
 */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === undefined ? error.message : `${error.message}（${code}）`
  }
  return String(error)
}
