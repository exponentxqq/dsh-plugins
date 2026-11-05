/**
 * 当前会话探测（设计 `C4`；`code-design.md` ③ §3.10 与 ① 触达面）。
 *
 * 浏览器半的 footer 入口在动作发生时要能说出「用户当前看的是哪个会话」，再把
 * `sessionId` 交给宿主的 `workspace` 端点（`WorkspaceRequest` 的 `{sessionId}` 形态，
 * 设计 D11：由宿主从会话 cwd 推工作区键）。这是客户端唯一需要的会话事实，因此单独
 * 一处：**每次动作现取**，不缓存、不订阅——与 `src/client/index.ts` 里 `connection`
 * 的「每次动作现取」同一纪律（服务可能晚于 `apply` 就绪）。
 *
 * **两步探测**（移植 `plugins/multi-root-workspace/src/compat/client-session.ts:39-45`，
 * 只保留本插件支持的单一基线族）：
 *
 * ```text
 * 1. sessions.list.getSnapshot().current
 *    显式选择。本插件基线（dsh >=0.2.1-rc.5 <0.3.0）的 SessionListState 只有
 *    ids / byId / phase / projectionsBySession，不带该字段——结构探测到此自然落空。
 * 2. sessions.list.getSnapshot().byId[id].retainedBy.mainView > 0
 *    主视图实际持有（retain）的会话。rc.5 的决定性事实；同一 `mainView` retention
 *    同时喂工作区浏览器的 `containsCurrent`（注释见
 *    `dsh-client-ui-workspace/lib/types/client/tree.d.ts:144`），`SessionReferenceSourceMap`
 *    的 `mainView` 项由 `dsh-client-ui-session/lib/types/client/index.d.ts:101-105` 增补。
 * ```
 *
 * 只读 `current` 会在没有该字段的基线上永远报「无会话」（入口永远拿不到 sessionId）；
 * 只取目录第一行会指到用户没在看的会话。所以先取显式选择，缺席时再取主视图持有的
 * 第一行（枚举顺序 = 目录插入顺序 = 上游主绑定投影自己的扫描顺序）。
 *
 * **为什么按结构探测而不是按版本**：本插件只支持一条基线（`package.json` 的
 * `dsh.engines` 与 `peerDependencies`），不做多版本兼容层；快照形状用 `unknown`
 * 逐层收窄即可。把版本比较带进浏览器只会多一条永远测不到的分支。
 *
 * @module dsh-plugin-session-tool-toggle/client/current-session
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** 列表快照里本模块关心的两栏（其余字段与探测无关，不声明）。 */
interface ListSnapshot {
  readonly current?: unknown
  readonly byId?: unknown
}

/**
 * 读取当前会话 id。
 *
 * **每次动作现取**：`sessions` 服务可能晚于 `apply` 就绪，客户端对象也可能被宿主
 * 替换；在 `apply` 期把服务或快照闭包缓存下来，服务晚到时这条探测就永远读不到。
 *
 * @param ctx - 浏览器侧根上下文。`sessions` 不在本插件依赖声明的 `Context` 面里
 *   （`@deepseek-ai/dsh-client-ui-session/client` 只声明 `uiSession`），按结构软读；
 *   服务缺席是受支持状态（返回 `undefined`；footer 入口据此进入 `unavailable` 降级，
 *   不发非法请求）。
 * @returns 当前会话 id；没有主视图持有的会话时为 `undefined`。
 */
export function currentSessionIdOf(ctx: ClientContext): string | undefined {
  const snapshot = listSnapshotOf(ctx.get('sessions'))
  if (snapshot === undefined) return undefined
  const current = snapshot.current
  if (typeof current === 'string' && current !== '') return current
  return mainViewSessionId(snapshot.byId)
}

/**
 * 列表快照，仅当服务确实暴露了一个。
 *
 * `getSnapshot` 以**方法**方式调用：真实 store 要读 `this`。把函数摘出来裸调会丢
 * 绑定，即使会话已选中也返回 `undefined`。
 * @param sessions - 客户端 `sessions` 服务，或组合里挂在这个名字下的任何值。
 * @returns 快照对象，或缺席/不可读时为 `undefined`。
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
    // 快照读取失败按「无会话」处理：入口的降级路径比异常向上冒泡更有用。
    return undefined
  }
  if (snapshot === null || typeof snapshot !== 'object') return undefined
  return snapshot as ListSnapshot
}

/**
 * 目录里第一行被主视图持有的会话。
 *
 * 一行只有在 `retainedBy.mainView` 是正数时才算选中：`0`、缺这个来源、非数值
 * 都不是选择。行上有非空 `id` 时优先用它，否则回退到 `byId` 的键。
 * @param byId - 目录映射，或快照里恰好携带的任何值。
 * @returns 该行的会话 id；没有任何主视图持有的行时为 `undefined`。
 */
function mainViewSessionId(byId: unknown): string | undefined {
  if (byId === null || typeof byId !== 'object') return undefined
  for (const [key, row] of Object.entries(byId)) {
    if (!isMainViewRow(row)) continue
    const id = (row as { id?: unknown }).id
    if (typeof id === 'string' && id !== '') return id
    if (key !== '') return key
  }
  return undefined
}

/** 某个目录值是不是主视图当前持有的一行。 */
function isMainViewRow(row: unknown): boolean {
  if (row === null || typeof row !== 'object') return false
  const retainedBy = (row as { retainedBy?: unknown }).retainedBy
  if (retainedBy === null || typeof retainedBy !== 'object') return false
  const count = (retainedBy as { mainView?: unknown }).mainView
  return typeof count === 'number' && count > 0
}
