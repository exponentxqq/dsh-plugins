/**
 * 统一「工作区配置」页面的 nav 行投影（`id` / `order` / `label`）。
 *
 * 分节是贡献方注册进 `workspace-config.section` 的 list entry：holder 不保存任何分节
 * 清单，nav 的每一行都是**当场从注册账本投影出来的**。投影有两个失效来源，必须同时
 * 记住它们的版本：
 *
 * 1. **注册账本变化**（贡献方晚到 / 退场）：`ctx.slots.getVersion(WORKSPACE_CONFIG_SECTION)`；
 * 2. **文案语言切换**（`label` 是 thunk，注册期不求值）：`ctx.locale.getSnapshot().revision`。
 *
 * 这就是「双版本记忆」：`getSnapshot()` 每次先比两个版本号，没变就直接返回缓存的数组
 * （identity 稳定，`useSyncExternalStore` 不会陷入无限重渲染）；变了才重新读账本 +
 * 逐个解析 label。`subscribe()` 同时订阅两个来源，任一变化都通知。
 *
 * **label 解析刻意只有 2 行**（D2）：`typeof label === 'function' ? label() : label`。
 * 不 import 上游的 `resolveSlotLabel`——`@deepseek-ai/dsh-client-ui-slots` 的 `exports`
 * 没有 `./client`，它不是浏览器 loader 模块表里的词；把它加进 `CLIENT_EXTERNALS` 会让
 * 产物出现一条该包的 `require`，运行时命中「missed the module table」硬错，整个客户端
 * 模块加载失败。上游 `resolveSlotLabel` 的实现与这 2 行完全等价，PoC 已证两者一致。
 *
 * 排序按 `order` **稳定**升序：并列 order 时保持注册（账本）顺序，不因重算而抖动。
 *
 * @module dsh-plugin-workspace-config/client/sections
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 类型专用 import：把 renderer 的 `ctx.slots`（SlotRegistry）与 locale 的 `ctx.locale`
// 并进本文件的程序。`verbatimModuleSyntax` 下它们是零产物 import。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { WORKSPACE_CONFIG_SECTION } from './contract.ts'

/** nav 的一行：分节在左栏显示的内容（不携带分节组件本身）。 */
export interface WorkspaceConfigSectionRow {
  /** 分节 entry 的 `id`（选中的身份，也是 `renderSlot(..., { only })` 的过滤键）。 */
  readonly id: string
  /** 排列顺序（升序；并列时保持注册顺序）。 */
  readonly order: number
  /** 已解析的本地化文案（字符串 label 原样、thunk label 当场求值）。 */
  readonly label: string
}

/**
 * nav 行的只读快照源：页面以 `useSyncExternalStore` 消费。
 *
 * `getSnapshot()` 必须返回 identity 稳定的数组——内容没变时同一引用，否则每次渲染都
 * 会被 uSES 判为「变了」而重渲染。
 */
export interface WorkspaceConfigSectionsSource {
  /**
   * 读取当前 nav 行（identity 稳定）。
   * @returns 按 order 稳定升序的行数组；无分节时为空数组。
   */
  getSnapshot(): readonly WorkspaceConfigSectionRow[]
  /**
   * 订阅行投影的变化（注册账本或 locale 版本任一变化）。
   * @param listener - 变化回调（无参数）。
   * @returns 退订函数（幂等）。
   */
  subscribe(listener: () => void): () => void
}

/** 投影过程中的中间行：额外带账本下标，用来给并列 order 做稳定排序的兜底。 */
interface IndexedRow extends WorkspaceConfigSectionRow {
  /** 在注册账本中的原始下标（仅排序用，不进入对外行）。 */
  readonly index: number
}

/**
 * 把账本 entry 投影成 nav 行。
 *
 * 没有 `id` 的 entry 被丢弃（list 座位注册时 `id` 必填，这里只是防御性处理；nav 行
 * 没有身份就无法参与 `only` 过滤，也无法作为 React key）。
 * @param entries - `ctx.slots.entries(WORKSPACE_CONFIG_SECTION)` 的当前快照。
 * @returns 按 order 稳定升序的对外行数组。
 */
function projectRows(entries: readonly StoredEntry[]): readonly WorkspaceConfigSectionRow[] {
  const rows: IndexedRow[] = []
  entries.forEach((entry, index) => {
    const id = entry.options.id
    if (typeof id !== 'string' || id === '') return
    const rawLabel = entry.options.label
    rows.push({
      id,
      order: entry.options.order ?? 0,
      // D2 的本地 2 行解析：thunk 每次读取重新求值，locale 切换无需重注册。
      label: typeof rawLabel === 'function' ? rawLabel() : (rawLabel ?? ''),
      index,
    })
  })
  // 并列 order 用账本下标兜底，显式钉住「稳定」而不依赖引擎实现细节。
  rows.sort((left, right) => left.order - right.order || left.index - right.index)
  return rows.map(({ index: _index, ...row }) => row)
}

/**
 * 建一个 nav 行投影源（双版本记忆）。
 *
 * 订阅按需建立：第一个订阅者到来时同时订阅两个来源，最后一个退订时全部摘除——页面
 * 切走时整棵子树卸载、重进即回默认（页面壳不保留选中节记忆），因此这里用引用计数而
 * 不是在 `apply` 期常驻订阅。
 * @param ctx - 浏览器侧根上下文（只用到 `slots` 与 `locale` 两个服务）。
 * @returns 投影源；首次 `getSnapshot()` 不依赖任何订阅即可读出当前账本。
 */
export function createSectionsSource(ctx: ClientContext): WorkspaceConfigSectionsSource {
  const listeners = new Set<() => void>()
  let cached: readonly WorkspaceConfigSectionRow[] = []
  let cachedSlotVersion = -1
  let cachedLocaleRevision = -1
  let stopSlots: (() => void) | undefined
  let stopLocale: (() => void) | undefined

  /** 通知所有订阅者（先快照再派发：回调里退订不会打乱本轮迭代）。 */
  const notify = (): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  /** 首个订阅者到来时建立两个来源的订阅。 */
  const ensureSubscribed = (): void => {
    if (stopSlots !== undefined) return
    stopSlots = ctx.slots.subscribe(WORKSPACE_CONFIG_SECTION, notify)
    stopLocale = ctx.locale.subscribe(notify)
  }

  /** 最后一个订阅者离开时摘除订阅（幂等）。 */
  const releaseIfIdle = (): void => {
    if (listeners.size > 0) return
    stopSlots?.()
    stopSlots = undefined
    stopLocale?.()
    stopLocale = undefined
  }

  /**
   * 双版本比对 + 惰性重投影。
   * @returns 当前行数组；两个版本都没变时返回上一次的同一引用。
   */
  const read = (): readonly WorkspaceConfigSectionRow[] => {
    const slotVersion = ctx.slots.getVersion(WORKSPACE_CONFIG_SECTION)
    const localeRevision = ctx.locale.getSnapshot().revision
    if (slotVersion === cachedSlotVersion && localeRevision === cachedLocaleRevision) return cached
    cached = projectRows(ctx.slots.entries(WORKSPACE_CONFIG_SECTION))
    cachedSlotVersion = slotVersion
    cachedLocaleRevision = localeRevision
    return cached
  }

  return {
    getSnapshot: read,
    subscribe: (listener) => {
      listeners.add(listener)
      ensureSubscribed()
      return () => {
        listeners.delete(listener)
        releaseIfIdle()
      }
    },
  }
}
