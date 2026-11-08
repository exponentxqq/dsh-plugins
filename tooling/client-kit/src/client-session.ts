/**
 * 当前会话探测与会话用量投影（`code-design.md` ③ §3.10 与 ① 触达面；本变更 P3 落点）。
 *
 * 浏览器半的「统一工作区配置」入口要在动作发生前说出两件事：用户当前看的是哪个会话
 * （`sessionId` 由宿主从会话 cwd 推工作区键，设计 D11），以及每个会话的 `updatedAt`
 * （默认选择策略 Q10 的「最近使用」档）。两件事实都来自同一个列表快照，因此同处一模块、
 * 共用同一个读取入口。**每次动作现取**，不缓存、不订阅——服务可能晚于 `apply` 就绪，
 * 客户端对象也可能被宿主替换（与各消费方 `resolveClient` 的「每次现取」同一纪律）。
 *
 * **两步探测**（自 multi-root `src/compat/client-session.ts` 与 stt `current-session.ts` 的
 * 既有实现迁入收编；两处消费点现均已改道本包）：
 *
 * ```text
 * 1. sessions.list.getSnapshot().current
 *    显式选择。本基线（dsh >=0.2.2-rc.1 <0.3.0）的 SessionListState 只有
 *    ids / byId / phase / projectionsBySession，不带该字段——结构探测到此自然落空。
 * 2. sessions.list.getSnapshot().byId[id].retainedBy.mainView > 0
 *    主视图实际持有（retain）的会话。同一 `mainView` retention 同时喂工作区浏览器的
 *    `containsCurrent`，见上游快照锚点表。
 * ```
 *
 * 只读 `current` 会在没有该字段的基线上永远报「无会话」；只取目录第一行会指到用户没在
 * 看的会话。所以先取显式选择，缺席时再取主视图持有的第一行（枚举顺序 = 目录插入顺序 =
 * 上游主绑定投影自己的扫描顺序）。
 *
 * **上游快照锚点**（dsh 0.2.2-rc.1 安装树，供漂移时定位；本包不 import 其中任何模块）：
 *
 * | 事实 | 位置 |
 * | --- | --- |
 * | `SessionListState`（`ids` / `byId` / `phase` / `projectionsBySession`，**无 `current`**） | `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:50-59` |
 * | `SessionSummary`（`id`、`updatedAt`、`retainedBy`） | 同文件 `:16-48` |
 * | `SessionRetainInfo.retainedBy`（只记正数的来源计数） | `@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/sessions.d.ts:36-41` |
 * | `SessionReferenceSourceMap` 增补 `mainView` 来源 | `@deepseek-ai/dsh-client-ui-session/lib/types/client/index.d.ts:101-105` |
 * | `mainView` retention 喂 `containsCurrent` | `@deepseek-ai/dsh-client-ui-workspace/lib/types/client/tree.d.ts:146` |
 *
 * **为什么按结构探测而不是按版本**：本包服务唯一基线（`scripts/dsh-baseline.mjs`，
 * 消费方 `dsh.engines` 由它派生），不做多版本兼容层；快照形状用 `unknown` 逐层收窄即可。
 *
 * **为什么签名收 `sessions` 而不是 `ctx`**：tooling 内部包零 `@deepseek-ai/*` import
 * （AR2 自动纳管），连 cordis 的 `Context` 类型也不能进；`ctx.get('sessions')` 这一步由
 * 消费方完成，本模块只做结构软读。服务缺席 / 形状不符是受支持状态（返回 `undefined`），
 * 消费方据此进入 `unavailable` 降级，不发非法请求。
 *
 * @module @dsh-plugins/client-kit/client-session
 */

/** 列表快照里本模块关心的两栏（其余字段与探测无关，不声明）。 */
interface ListSnapshot {
  readonly current?: unknown
  readonly byId?: unknown
}

/**
 * 会话 `updatedAt` 投影（只取默认策略要的两栏；服务缺席返回 `undefined`）。
 *
 * 键是会话 id（行 `id` 优先，缺省用目录键），值是**只有** `updatedAt` 一栏的对象——
 * 列表行上的 `title` / `displayTitle` / `projectionValues` 等一律不投影，避免把易变的
 * 展示面固化成内部 API。
 */
export interface SessionUsageSnapshot {
  readonly updatedAtById: Readonly<Record<string, { readonly updatedAt: number }>>
}

/**
 * 读取当前会话 id。
 *
 * **每次动作现取**：`sessions` 服务可能晚于 `apply` 就绪；在 `apply` 期把服务或快照
 * 闭包缓存下来，服务晚到时这条探测就永远读不到。
 *
 * @param sessions - 客户端 `sessions` 服务（消费方传 `ctx.get('sessions')` 的结果），或
 *   组合里挂在这个名字下的任何值。缺席是受支持状态。
 * @returns 当前会话 id；没有主视图持有的会话时为 `undefined`。
 */
export function currentSessionIdOf(sessions: unknown): string | undefined {
  const snapshot = listSnapshotOf(sessions)
  if (snapshot === undefined) return undefined
  const current = snapshot.current
  if (typeof current === 'string' && current !== '') return current
  return mainViewSessionId(snapshot.byId)
}

/**
 * 读取会话 `updatedAt` 投影。
 *
 * 服务在场时总是返回投影（目录为空就是空表）；只有服务缺席、`getSnapshot` 不可调用 /
 * 抛错、或快照不是对象时才返回 `undefined`——那才是「读数不可用」，与「零会话」是不同
 * 事实。重复 id 先到先得（枚举顺序 = 目录插入顺序），不让后到的行改写已投影的读数。
 *
 * @param sessions - 客户端 `sessions` 服务，或组合里挂在这个名字下的任何值。
 * @returns `{ updatedAtById }` 投影，或缺席 / 不可读时为 `undefined`。
 */
export function sessionUsageOf(sessions: unknown): SessionUsageSnapshot | undefined {
  const snapshot = listSnapshotOf(sessions)
  if (snapshot === undefined) return undefined
  const updatedAtById: Record<string, { updatedAt: number }> = {}
  const byId = snapshot.byId
  if (byId !== null && typeof byId === 'object') {
    for (const [key, row] of Object.entries(byId)) {
      if (row === null || typeof row !== 'object') continue
      const updatedAt = (row as { updatedAt?: unknown }).updatedAt
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) continue
      const id = rowIdOf(row, key)
      if (id === undefined || Object.hasOwn(updatedAtById, id)) continue
      updatedAtById[id] = { updatedAt }
    }
  }
  return { updatedAtById }
}

/**
 * 列表快照，仅当服务确实暴露了一个。
 *
 * `getSnapshot` 以**方法**方式调用：真实 store 要读 `this`。把函数摘出来裸调会丢
 * 绑定，即使会话已选中也返回 `undefined`（stt 原实现的既有教训，回归用例钉住）。
 * @param sessions - 客户端 `sessions` 服务，或组合里挂在这个名字下的任何值。
 * @returns 快照对象，或缺席 / 不可读时为 `undefined`。
 */
function listSnapshotOf(sessions: unknown): ListSnapshot | undefined {
  if (sessions === null || typeof sessions !== 'object') return undefined
  const list = (sessions as { list?: unknown }).list
  if (list === null || typeof list !== 'object') return undefined
  const holder = list as { getSnapshot?: unknown }
  if (typeof holder.getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = holder.getSnapshot()
  } catch {
    // 快照读取失败按「无读数」处理：调用方的降级路径比异常向上冒泡更有用。
    return undefined
  }
  if (snapshot === null || typeof snapshot !== 'object') return undefined
  return snapshot as ListSnapshot
}

/**
 * 目录里第一行被主视图持有的会话。
 *
 * 一行只有在 `retainedBy.mainView` 是正数时才算选中：`0`、缺这个来源、非数值
 * 都不是选择。
 * @param byId - 目录映射，或快照里恰好携带的任何值。
 * @returns 该行的会话 id；没有任何主视图持有的行时为 `undefined`。
 */
function mainViewSessionId(byId: unknown): string | undefined {
  if (byId === null || typeof byId !== 'object') return undefined
  for (const [key, row] of Object.entries(byId)) {
    if (!isMainViewRow(row)) continue
    const id = rowIdOf(row, key)
    if (id !== undefined) return id
  }
  return undefined
}

/**
 * 一行的会话 id：行上非空 `id` 优先，否则回退目录键。
 * @param row - 目录值（调用方已确认是对象）。
 * @param key - 目录里这一行的键。
 * @returns 会话 id；两边都空时 `undefined`。
 */
function rowIdOf(row: object, key: string): string | undefined {
  const id = (row as { id?: unknown }).id
  if (typeof id === 'string' && id !== '') return id
  return key !== '' ? key : undefined
}

/** 某个目录值是不是主视图当前持有的一行。 */
function isMainViewRow(row: unknown): boolean {
  if (row === null || typeof row !== 'object') return false
  const retainedBy = (row as { retainedBy?: unknown }).retainedBy
  if (retainedBy === null || typeof retainedBy !== 'object') return false
  const count = (retainedBy as { mainView?: unknown }).mainView
  return typeof count === 'number' && count > 0
}
