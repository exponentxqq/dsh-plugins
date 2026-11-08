/**
 * 工作区清单源（`src/client/workspace-source.ts`）的生命周期契约。
 *
 * 本套件不引任何上游 DSH 包、不碰 React：清单源按「零上游 import」契约只收 `unknown`
 * 的 `ctx`，因此可以直接用结构形状的假 ctx 驱动。四组事实逐条对齐 code-design ③ 3.6
 * 与 §1.1 的「清单源生命周期」：
 *
 * 1. **服务未就绪 → `pending`**：`ctx` 不可注入、注入回调未执行、或服务形状不符时，
 *    清单源停在 `pending` 且不抛错（页面据此把份额降到 `{kind:'none'}`）。
 * 2. **到达 → `ready` + 通知一次**：服务到达时绑定 `list.subscribe` 并**立刻**通知一次
 *    （到达本身就是变化）；上游尚未走到 `ready` 时我方仍是 `pending`（半份清单不喂选择框）。
 * 3. **快照 identity 稳定**：上游快照 identity 未变时 `getSnapshot()` 返回**同一引用**
 *    （uSES 的硬要求）；上游换新对象时重投影（内容可能相等、引用必换）。
 * 4. **退场 → 回落**：清理函数先摘上游订阅、再把记忆复位成 `pending` 并通知；幂等。
 *
 * 另钉两条边界：零工作区是 `ready` + 空 `items`（与「还不知道」的 `pending` 是不同事实）；
 * 无身份的行走不进选择框，`sessionIds` 只收非空字符串。
 *
 * @module dsh-plugin-workspace-config/test/workspace-source
 */

import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceListSource,
  type WorkspaceListSnapshot,
  type WorkspaceListSource,
} from '../src/client/workspace-source.ts'

/** 假 `ctx.inject` 的回调形状（清单源只软读 `scope.workspaces`）。 */
type InjectCallback = (scope: { readonly workspaces?: unknown }) => (() => void) | undefined

/** 一条注入记录：依赖名单与回调（模拟 cordis 在服务到达时才执行回调）。 */
interface Injection {
  readonly deps: readonly string[]
  readonly callback: InjectCallback
}

/** 假 ctx 与「服务到达」的驱动面。 */
interface FakeRuntime {
  readonly ctx: { readonly inject: ReturnType<typeof vi.fn> }
  readonly injections: readonly Injection[]
  /** 模拟服务到达：执行注入回调并留下清理函数。 */
  deliver(service: unknown): { readonly cleanup: (() => void) | undefined }
}

/**
 * 造一个只实现 `inject` 的假 ctx。
 *
 * 真实运行时的 `inject` 在依赖服务到达时才跑回调；这里同样只登记回调、不执行，
 * 由用例显式 `deliver` 推进生命周期。
 * @returns 假 ctx + 注入记录 + 到达驱动。
 */
function createFakeRuntime(): FakeRuntime {
  const injections: Injection[] = []
  const inject = vi.fn((deps: readonly string[], callback: InjectCallback) => {
    injections.push({ deps, callback })
    return () => {}
  })
  return {
    ctx: { inject },
    injections,
    deliver: (service) => {
      const record = injections.at(-1)
      if (record === undefined) throw new Error('清单源没有建立 workspaces 注入')
      return { cleanup: record.callback({ workspaces: service }) }
    },
  }
}

/** 上游 `workspaces` 服务的最小结构面：`list.getSnapshot` + `list.subscribe`。 */
interface FakeUpstream {
  /** `scope.workspaces` 的值（真实服务是 `{ list: { getSnapshot, subscribe } }`）。 */
  readonly service: { readonly list: { getSnapshot(): unknown; subscribe(listener: () => void): () => void } }
  /** 换上游快照并通知（模拟上游自己的到达 / 变化）。 */
  setSnapshot(next: unknown): void
  /** 上游当前挂着的订阅者数量（验证退场是否摘干净）。 */
  listenerCount(): number
}

/**
 * 造一个上游 `workspaces` 服务替身。
 * @param initial - 初始快照（服务刚到达时上游的读数）。
 * @returns 服务值 + 换快照 / 订阅者计数。
 */
function createUpstream(initial: unknown): FakeUpstream {
  let raw = initial
  const listeners = new Set<() => void>()
  const list = {
    getSnapshot: () => raw,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    service: { list },
    setSnapshot: (next) => {
      raw = next
      for (const listener of Array.from(listeners)) listener()
    },
    listenerCount: () => listeners.size,
  }
}

/** 一行上游 `WorkspaceView` 的简写（只给本模块读取的字段）。 */
function view(
  workspaceId: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    workspaceId,
    title: workspaceId,
    path: `/repos/${workspaceId}`,
    sessionIds: [],
    ...overrides,
  }
}

/** 一份上游快照的简写（默认 `ready`）。 */
function upstreamSnapshot(items: readonly unknown[], phase = 'ready'): Record<string, unknown> {
  return { phase, items }
}

/** 断言一个快照是未就绪（`pending` 恒零行）。 */
function expectPending(source: WorkspaceListSource): void {
  const snapshot: WorkspaceListSnapshot = source.getSnapshot()
  expect(snapshot.phase).toBe('pending')
  expect(snapshot.items).toEqual([])
}

describe('服务未就绪：清单源停在 pending', () => {
  it('ctx 不可注入（undefined / null / 非对象 / 无 inject）时恒为 pending，且不抛错', () => {
    for (const ctx of [undefined, null, 42, {}, { inject: 1 }]) {
      const source = createWorkspaceListSource(ctx)
      expectPending(source)
      // 引用稳定：同一份共享 pending 快照，喂 uSES 不会自激重渲染。
      expect(source.getSnapshot()).toBe(source.getSnapshot())
    }
  })

  it('注入已建立但服务未到达：注入依赖恰为 workspaces，读数仍是 pending', () => {
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)

    expect(runtime.ctx.inject).toHaveBeenCalledTimes(1)
    expect(runtime.injections[0]?.deps).toEqual(['workspaces'])
    expectPending(source)
  })

  it('服务形状不符或订阅抛错时停在 pending，不向外抛错', () => {
    const cases: readonly unknown[] = [
      {},
      { list: null },
      // 缺 subscribe（只有 getSnapshot）——形状不符。
      { list: { getSnapshot: () => upstreamSnapshot([view('w1')]) } },
      // subscribe 抛错——按未就绪处理，apply 期不得炸。
      {
        list: {
          getSnapshot: () => upstreamSnapshot([view('w1')]),
          subscribe: () => {
            throw new Error('上游拒绝订阅')
          },
        },
      },
    ]

    for (const service of cases) {
      const runtime = createFakeRuntime()
      const source = createWorkspaceListSource(runtime.ctx)
      expect(() => runtime.deliver(service)).not.toThrow()
      expectPending(source)
    }
  })

  it('上游 getSnapshot 抛错时读数降级为 pending，而不是把异常冒给渲染层', () => {
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver({
      list: {
        getSnapshot: () => {
          throw new Error('上游快照不可读')
        },
        subscribe: () => () => {},
      },
    })

    expect(() => source.getSnapshot()).not.toThrow()
    expectPending(source)
  })
})

describe('服务到达：ready + 通知一次', () => {
  it('到达时绑定上游订阅、立刻通知一次，投影保持 Host 顺序', () => {
    const upstream = createUpstream(
      upstreamSnapshot([
        view('w-b', { title: 'B', path: '/repos/b', sessionIds: ['s2', 's1'] }),
        view('w-a', { title: '', path: '/repos/a' }),
      ]),
    )
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const listener = vi.fn()
    source.subscribe(listener)

    const { cleanup } = runtime.deliver(upstream.service)

    // 到达本身就是一次变化：订阅者恰好收到一次通知（不是零次，也不是两次）。
    expect(listener).toHaveBeenCalledTimes(1)
    expect(upstream.listenerCount()).toBe(1)
    expect(source.getSnapshot()).toEqual({
      phase: 'ready',
      items: [
        { id: 'w-b', title: 'B', path: '/repos/b', sessionIds: ['s2', 's1'] },
        { id: 'w-a', title: '', path: '/repos/a', sessionIds: [] },
      ],
    })
    cleanup?.()
  })

  it('上游仍处于 pending 时我方也 pending（半份清单不喂选择框），到达仍通知一次', () => {
    const upstream = createUpstream(upstreamSnapshot([view('w1')], 'pending'))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const listener = vi.fn()
    source.subscribe(listener)

    const { cleanup } = runtime.deliver(upstream.service)

    expect(listener).toHaveBeenCalledTimes(1)
    expectPending(source)

    // 上游走到 ready 并通知：我方转为 ready。
    upstream.setSnapshot(upstreamSnapshot([view('w1')]))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(source.getSnapshot().phase).toBe('ready')
    expect(source.getSnapshot().items).toHaveLength(1)
    cleanup?.()
  })

  it('零工作区是 ready + 空 items（与 pending 是不同事实）', () => {
    const upstream = createUpstream(upstreamSnapshot([]))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver(upstream.service)

    const snapshot = source.getSnapshot()
    expect(snapshot.phase).toBe('ready')
    expect(snapshot.items).toEqual([])
    // 空清单的 identity 稳定覆盖到「ready 且零行」。
    expect(source.getSnapshot()).toBe(snapshot)
  })

  it('items 不是数组时按未就绪处理：宁可说「还不知道」，也不凭空宣告「没有工作区」', () => {
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver({
      list: {
        getSnapshot: () => ({ phase: 'ready', items: undefined }),
        subscribe: () => () => {},
      },
    })

    expectPending(source)
  })

  it('无身份的行走不进选择框；标题 / 路径缺省为空串，sessionIds 只收非空字符串', () => {
    const upstream = createUpstream(
      upstreamSnapshot([
        view('w-kept', { title: undefined, path: undefined, sessionIds: ['s1', 7, '', 's2'] }),
        { title: '无 workspaceId', path: '/repos/no-id' },
        { workspaceId: '', title: '空 id' },
        null,
        'not-a-row',
      ]),
    )
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver(upstream.service)

    expect(source.getSnapshot()).toEqual({
      phase: 'ready',
      items: [{ id: 'w-kept', title: '', path: '', sessionIds: ['s1', 's2'] }],
    })
  })
})

describe('快照 identity 稳定', () => {
  it('上游快照 identity 未变时返回同一引用（通知也不重建）', () => {
    const raw = upstreamSnapshot([view('w1')])
    const upstream = createUpstream(raw)
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver(upstream.service)

    const first = source.getSnapshot()
    expect(source.getSnapshot()).toBe(first)

    // 上游原样重发同一份快照：identity 未变 → 投影缓存命中，仍是同一引用。
    upstream.setSnapshot(raw)
    expect(source.getSnapshot()).toBe(first)
  })

  it('上游换新对象时重投影：内容可以相等，引用必须换', () => {
    const upstream = createUpstream(upstreamSnapshot([view('w1')]))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    runtime.deliver(upstream.service)

    const first = source.getSnapshot()
    upstream.setSnapshot(upstreamSnapshot([view('w1')]))
    const second = source.getSnapshot()

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    // 重投影后再次读取仍返回同一引用（缓存已更新）。
    expect(source.getSnapshot()).toBe(second)
  })
})

describe('服务退场：回落 pending 并通知', () => {
  it('清理函数先摘上游订阅，再复位 pending 并通知一次；幂等', () => {
    const upstream = createUpstream(upstreamSnapshot([view('w1')]))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const listener = vi.fn()
    source.subscribe(listener)
    const { cleanup } = runtime.deliver(upstream.service)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(upstream.listenerCount()).toBe(1)

    cleanup?.()

    // 退场是一次变化：通知恰一次；上游订阅已摘；读数回落 pending。
    expect(listener).toHaveBeenCalledTimes(2)
    expect(upstream.listenerCount()).toBe(0)
    expectPending(source)

    // 幂等：重复调用不再通知、不再报错。
    cleanup?.()
    expect(listener).toHaveBeenCalledTimes(2)
    expectPending(source)
  })

  it('退场后迟到的上游通知不再走到我们的订阅者', () => {
    const upstream = createUpstream(upstreamSnapshot([view('w1')]))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const listener = vi.fn()
    source.subscribe(listener)
    const { cleanup } = runtime.deliver(upstream.service)
    cleanup?.()

    const calls = listener.mock.calls.length
    upstream.setSnapshot(upstreamSnapshot([view('w2')]))
    expect(listener).toHaveBeenCalledTimes(calls)
    expectPending(source)
  })

  it('服务退场后重新到达：重新绑定并恢复 ready', () => {
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const first = createUpstream(upstreamSnapshot([view('w1')]))
    const firstArrival = runtime.deliver(first.service)
    expect(source.getSnapshot().items.map((item) => item.id)).toEqual(['w1'])

    firstArrival.cleanup?.()
    expectPending(source)

    const second = createUpstream(upstreamSnapshot([view('w2')]))
    const secondArrival = runtime.deliver(second.service)
    expect(second.listenerCount()).toBe(1)
    expect(first.listenerCount()).toBe(0)
    expect(source.getSnapshot().items.map((item) => item.id)).toEqual(['w2'])
    secondArrival.cleanup?.()
  })
})

describe('订阅面', () => {
  it('退订幂等；退订后上游变化不再通知该订阅者', () => {
    const upstream = createUpstream(upstreamSnapshot([view('w1')]))
    const runtime = createFakeRuntime()
    const source = createWorkspaceListSource(runtime.ctx)
    const listener = vi.fn()
    const unsubscribe = source.subscribe(listener)
    const { cleanup } = runtime.deliver(upstream.service)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    unsubscribe()
    upstream.setSnapshot(upstreamSnapshot([view('w2')]))
    expect(listener).toHaveBeenCalledTimes(1)
    cleanup?.()
  })
})
