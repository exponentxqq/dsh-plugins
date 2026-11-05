/**
 * nav 行投影（`src/client/sections.ts`）的单测。
 *
 * 用例逐条对齐 code-design ①#10 / ③3.3 与 D2：
 *
 * - 字符串 label 与 thunk label 两种形态都能投影；thunk 是**每次读取重新求值**（locale
 *   切换无需重注册）；
 * - 双版本记忆：分节账本版本（`slots.getVersion`）或 locale revision 变化才重投影，
 *   否则 `getSnapshot()` 必须返回**同一数组引用**（uSES 的硬要求）；thunk 闭包内容变了
 *   但两个版本都没动时仍读缓存——这与真实渲染一致（没有通知就不会重渲染）；
 * - order 稳定升序，并列 order 保持注册（账本）顺序；
 * - 没有 `id` 的 entry 被丢弃（nav 行无身份就无法参与 `only` 过滤与 React key）；
 * - 订阅是引用计数：首个订阅者建立两个来源的订阅，最后一个退订后摘除。
 *
 * 用假 ctx（只实现 `slots` / `locale` 摸得到的五个面）驱动，不需要真 slots 运行时——
 * children / only 的运行时语义由 `section-seat.poc.test.tsx` 的常驻 PoC 守护，本套件
 * 只钉 holder 自己的投影逻辑。
 *
 * @module dsh-plugin-workspace-config/test/sections
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSectionsSource, type WorkspaceConfigSectionRow } from '../src/client/sections.ts'
import { WORKSPACE_CONFIG_SECTION } from '../src/client/contract.ts'

/** 一条账本 entry 的最小可观测形状（`ctx.slots.entries` 的投影输入）。 */
interface FakeEntry {
  readonly options: {
    readonly id?: string
    readonly order?: number
    readonly label?: string | (() => string)
  }
}

/** 假 ctx 的可变面 + 断言用的调用记录。 */
interface FakeRuntime {
  readonly ctx: ClientContext
  readonly slots: {
    readonly getVersion: ReturnType<typeof vi.fn>
    readonly entries: ReturnType<typeof vi.fn>
    readonly subscribe: ReturnType<typeof vi.fn>
  }
  readonly locale: {
    readonly getSnapshot: ReturnType<typeof vi.fn>
    readonly subscribe: ReturnType<typeof vi.fn>
  }
  /** 替换账本内容并 bump 分节座位版本、通知订阅者。 */
  setEntries(entries: readonly FakeEntry[]): void
  /** 只 bump locale revision 并通知订阅者（模拟切换语言 / 晚到字典）。 */
  bumpLocale(): void
  /** 静默替换账本而不 bump 版本（用来证明缓存按版本比对，而不是每次深比较）。 */
  silentlySetEntries(entries: readonly FakeEntry[]): void
  /** 两个来源当前挂着的订阅者数量（验证引用计数摘除）。 */
  listenerCounts(): { readonly slots: number; readonly locale: number }
}

/**
 * 造一个最小 client context。
 *
 * 只实现投影源直接触达的面：`slots.getVersion` / `slots.entries` / `slots.subscribe`、
 * `locale.getSnapshot` / `locale.subscribe`。其余服务（renderer 的插槽安装等）与本套件
 * 无关，不需要假装。
 * @returns 假 ctx 与可变操作。
 */
function createFakeRuntime(): FakeRuntime {
  let slotVersion = 0
  let localeRevision = 1
  let entries: readonly FakeEntry[] = []
  const slotListeners = new Set<() => void>()
  const localeListeners = new Set<() => void>()

  /** 同步通知一组监听者（先快照，允许回调里退订）。 */
  const notify = (listeners: Set<() => void>): void => {
    for (const listener of Array.from(listeners)) listener()
  }

  const slots = {
    getVersion: vi.fn(() => slotVersion),
    entries: vi.fn(() => entries),
    subscribe: vi.fn((_key: string, listener: () => void) => {
      slotListeners.add(listener)
      return () => {
        slotListeners.delete(listener)
      }
    }),
  }
  const locale = {
    // 投影源只读 `revision`；其余字段按真实快照形状补全（种类是只读快照，不参与断言）。
    getSnapshot: vi.fn(() => ({ active: 'zh', locales: [], revision: localeRevision })),
    subscribe: vi.fn((listener: () => void) => {
      localeListeners.add(listener)
      return () => {
        localeListeners.delete(listener)
      }
    }),
  }

  return {
    ctx: { slots, locale } as unknown as ClientContext,
    slots,
    locale,
    setEntries: (next) => {
      entries = next
      slotVersion += 1
      notify(slotListeners)
    },
    bumpLocale: () => {
      localeRevision += 1
      notify(localeListeners)
    },
    silentlySetEntries: (next) => {
      entries = next
    },
    listenerCounts: () => ({ slots: slotListeners.size, locale: localeListeners.size }),
  }
}

/** 期望的一行（与投影源返回的只读行同形，便于 `toEqual` 对照）。 */
function row(id: string, order: number, label: string): WorkspaceConfigSectionRow {
  return { id, order, label }
}

describe('nav 行投影（sections.ts）', () => {
  it('字符串与 thunk 两种 label 都投影成文案；按 order 升序', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([
      { options: { id: 'folders', order: 10, label: '工作区文件夹' } },
      { options: { id: 'defaults', order: 20, label: () => '工作区默认档' } },
      { options: { id: 'sessions', order: 30, label: () => '会话管理' } },
    ])

    const source = createSectionsSource(runtime.ctx)

    expect(source.getSnapshot()).toEqual([
      row('folders', 10, '工作区文件夹'),
      row('defaults', 20, '工作区默认档'),
      row('sessions', 30, '会话管理'),
    ])
    // 读取面用的就是座位常量（不是字面量再抄一份）。
    expect(runtime.slots.entries).toHaveBeenCalledWith(WORKSPACE_CONFIG_SECTION)
  })

  it('order 稳定升序：并列 order 保持账本（注册）顺序', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([
      { options: { id: 'c', order: 20, label: 'C' } },
      { options: { id: 'a', order: 10, label: 'A' } },
      { options: { id: 'b', order: 10, label: 'B' } },
    ])

    const ids = createSectionsSource(runtime.ctx).getSnapshot().map((item) => item.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('没有 id 的 entry 被丢弃（含空串 id）', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([
      { options: { order: 1, label: '无身份' } },
      { options: { id: '', order: 2, label: '空身份' } },
      { options: { id: 'kept', order: 3, label: '保留' } },
    ])

    expect(createSectionsSource(runtime.ctx).getSnapshot()).toEqual([row('kept', 3, '保留')])
  })

  it('没有 label 的 entry 投影成空文案而不是丢弃（order 仍参与排序）', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([
      { options: { id: 'a', order: 10 } },
      { options: { id: 'b', order: 20, label: '有文案' } },
    ])

    expect(createSectionsSource(runtime.ctx).getSnapshot()).toEqual([
      row('a', 10, ''),
      row('b', 20, '有文案'),
    ])
  })

  it('内容未变时 getSnapshot 返回同一数组引用（uSES 稳定快照）', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([{ options: { id: 'a', order: 10, label: 'A' } }])
    const source = createSectionsSource(runtime.ctx)

    const first = source.getSnapshot()
    const second = source.getSnapshot()
    expect(second).toBe(first)
    // 两个版本都没动时只读缓存，不重复读账本（首次之后只有一次 entries 调用）。
    expect(runtime.slots.entries).toHaveBeenCalledTimes(1)
  })

  it('thunk 每次读取重新求值：locale revision 变化后重投影出新文案', () => {
    const runtime = createFakeRuntime()
    let revision = 1
    runtime.setEntries([{ options: { id: 'a', order: 10, label: () => `文案 v${revision}` } }])
    const source = createSectionsSource(runtime.ctx)

    const first = source.getSnapshot()
    expect(first).toEqual([row('a', 10, '文案 v1')])

    // 闭包内容变了但版本未动：读缓存（与真实渲染一致——没有通知就不会重渲染）。
    revision = 2
    expect(source.getSnapshot()).toEqual([row('a', 10, '文案 v1')])

    // locale revision 变化 = 语言切换 / 迟到字典：重读并重建数组。
    runtime.bumpLocale()
    const reread = source.getSnapshot()
    expect(reread).toEqual([row('a', 10, '文案 v2')])
    // 重投影换了新数组；随后再读仍返回同一引用（缓存已更新）。
    expect(reread).not.toBe(first)
    expect(source.getSnapshot()).toBe(reread)
  })

  it('账本版本变化后重投影（贡献方晚注册 / 退场）', () => {
    const runtime = createFakeRuntime()
    const source = createSectionsSource(runtime.ctx)
    expect(source.getSnapshot()).toEqual([])

    runtime.setEntries([{ options: { id: 'a', order: 10, label: 'A' } }])
    const withA = source.getSnapshot()
    expect(withA).toEqual([row('a', 10, 'A')])

    runtime.setEntries([])
    expect(source.getSnapshot()).toEqual([])
    expect(source.getSnapshot()).not.toBe(withA)
  })

  it('订阅：账本或 locale 任一变化都通知；最后一个退订后摘除两个来源的订阅', () => {
    const runtime = createFakeRuntime()
    runtime.setEntries([{ options: { id: 'a', order: 10, label: 'A' } }])
    const source = createSectionsSource(runtime.ctx)
    const listener = vi.fn()

    // 订阅前不建立来源订阅（引用计数为 0）。
    expect(runtime.slots.subscribe).not.toHaveBeenCalled()
    expect(runtime.locale.subscribe).not.toHaveBeenCalled()

    const unsubscribe = source.subscribe(listener)
    expect(runtime.slots.subscribe).toHaveBeenCalledWith(WORKSPACE_CONFIG_SECTION, expect.any(Function))
    expect(runtime.locale.subscribe).toHaveBeenCalledTimes(1)

    runtime.setEntries([{ options: { id: 'a', order: 10, label: 'A' } }])
    expect(listener).toHaveBeenCalledTimes(1)

    runtime.bumpLocale()
    expect(listener).toHaveBeenCalledTimes(2)

    // 第二个订阅者复用同一组来源订阅（不会重复挂）。
    const second = vi.fn()
    const unsubscribeSecond = source.subscribe(second)
    expect(runtime.slots.subscribe).toHaveBeenCalledTimes(1)
    expect(runtime.locale.subscribe).toHaveBeenCalledTimes(1)

    unsubscribe()
    runtime.bumpLocale()
    expect(listener).toHaveBeenCalledTimes(2)
    // second 在两次通知之后才订阅：只收到退订第一位之后的那一次 bump。
    expect(second).toHaveBeenCalledTimes(1)
    expect(runtime.listenerCounts()).toEqual({ slots: 1, locale: 1 })

    unsubscribeSecond()
    // 两个订阅者都走了：摘除来源订阅（真实 slots/locale 的退订函数被执行）。
    expect(runtime.listenerCounts()).toEqual({ slots: 0, locale: 0 })
  })

  it('订阅建立后，getSnapshot 与通知顺序无关：版本先 bump、通知后到也能读到新值', () => {
    const runtime = createFakeRuntime()
    const source = createSectionsSource(runtime.ctx)
    const listener = vi.fn()
    source.subscribe(listener)
    // 先读一次建立缓存（空账本）。
    expect(source.getSnapshot()).toEqual([])

    // 只换账本、不动版本、不通知：getSnapshot 仍读缓存（空）——证明缓存判据是版本而不是深比较。
    runtime.silentlySetEntries([{ options: { id: 'late', order: 5, label: '晚到' } }])
    expect(source.getSnapshot()).toEqual([])

    // 真实运行时里版本与通知同源；setEntries 同时 bump 版本并通知。
    runtime.setEntries([{ options: { id: 'late', order: 5, label: '晚到' } }])
    expect(source.getSnapshot()).toEqual([row('late', 5, '晚到')])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
