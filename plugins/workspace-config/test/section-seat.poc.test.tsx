// @vitest-environment jsdom
/**
 * 分节座位运行时 PoC（触达面 #18 / 组 4 前置风险门）。
 *
 * 目的：用**真** `@deepseek-ai/dsh-client-ui-renderer` 的浏览器产物 + 真 cordis
 * `Context`，在 jsdom 里钉住四条只有类型级证据、没有运行时自证的语义：
 *
 * 1. children 声明：holder 的 `register({ children })` 把子座位写进声明账本，
 *    声明提交后贡献方的 `slots.inject(childKey, …)` 回调同步补跑、entry 立刻进账本。
 * 2. only 过滤：`renderSlot(childKey, owner, { only })` 只渲染 `options.id` 匹配的
 *    分节，未选中的 entry 仍留在注册账本（只过滤渲染，不删注册）。
 * 3. label 双态：字符串与 thunk 两种 `SlotLabel` 都能在 nav 行投影里求值；thunk
 *    每次读取重新求值（locale 切换无需重注册）。
 * 4. 后装补跑：贡献方先 `slots.inject`（子座位尚未声明 → 回调延迟），holder 后到
 *    并声明子座位时，待命回调在声明提交后同步补跑，先到的贡献不丢。
 *
 * 为什么不是普通 `import`：上游包把浏览器半发成 `lib/client.js` 的
 * `window.__ModuleLoader__.load({ id, factory })` 壳，外部依赖（react / react-dom /
 * slots / cordis）由 dsh 的 loader 模块表注入，没有可直接 `import` 的 ESM 入口。
 * 本文件在测试侧最小复刻 loader：读入**真产物源码**，给出与宿主一致的模块表，
 * 捕获 factory 后调用。被测对象仍是真 renderer 实现，不 stub 任何
 * `SlotRegistry` / `register` / `inject` / `renderSlot` / `only` 语义。
 *
 * 常驻且不 skip：本文件是「children / only / label / inject 语义漂移」的长期哨兵。
 * 测试内注释与断言话术均为 zh-CN；上游标识符保留原名。
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { ReactNode } from 'react'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Cordis from '@deepseek-ai/cordis'
import * as Slots from '@deepseek-ai/dsh-client-ui-slots'
// 类型专用：加载两个模块增强声明——renderer 的 'root' / ctx.slots，layout 的 'shell.overlay'。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// holder 的座位契约唯一权威（运行时只用座位名常量）。
import { WORKSPACE_CONFIG_SECTION } from '../src/client/contract.ts'

/** 座位名（与 contract.ts 的常量逐字一致；用例里显式断言这一点）。 */
const SECTION = WORKSPACE_CONFIG_SECTION

/** 真 renderer 浏览器产物被 loader 捕获后的 apply 面。 */
interface RealRendererClient {
  apply(ctx: Cordis.Context): void
}

/** loader 壳的登记记录（id 只用于诊断，PoC 不依赖）。 */
interface ModuleLoaderRecord {
  id: string
  factory: (requireModule: (name: string) => unknown) => RealRendererClient
}

/** 宿主 loader 注入给 renderer 外部依赖的模块表（与 dsh loader 同名同包）。 */
const EXTERNAL_MODULES: Readonly<Record<string, unknown>> = {
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': ReactJsxRuntime,
  '@deepseek-ai/dsh-client-ui-slots': Slots,
  '@deepseek-ai/cordis': Cordis,
}

/** 按宿主的模块表词解析外部依赖；表外模块立刻失败（不静默降级）。 */
function requireExternal(name: string): unknown {
  if (!Object.hasOwn(EXTERNAL_MODULES, name)) {
    throw new Error(`PoC 的 loader 模块表缺少外部模块：${name}`)
  }
  return EXTERNAL_MODULES[name]
}

let cachedRenderer: RealRendererClient | undefined

/**
 * 加载真 `@deepseek-ai/dsh-client-ui-renderer/client` 产物。
 *
 * 复刻 dsh loader 的两步：① 在 `window.__ModuleLoader__` 上承接
 * `{ id, factory }` 登记；② 用宿主模块表调用 factory，得到 `apply`。加载完成后
 * 还原 `__ModuleLoader__`，不污染其它用例。
 */
function loadRealRendererClient(): RealRendererClient {
  if (cachedRenderer !== undefined) return cachedRenderer

  const packageDir = dirname(
    createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-renderer/package.json'),
  )
  const bundlePath = resolve(packageDir, 'lib/client.js')
  const source = readFileSync(bundlePath, 'utf8')

  // 真产物第 1 行的要求就是 window.__ModuleLoader__.load(...)；这里给它一个宿主同形面。
  const loaderWindow = globalThis.window as Window & {
    __ModuleLoader__?: { load(record: ModuleLoaderRecord): void }
  }
  const previousLoader = loaderWindow.__ModuleLoader__

  let loaded: RealRendererClient | undefined
  loaderWindow.__ModuleLoader__ = {
    load(record) {
      // factory 内会按 requires 取 react / slots / cordis；模块表由本测试提供。
      loaded = record.factory(requireExternal)
    },
  }

  try {
    // 用 Function 构造器执行 loader 壳（不是 import：该文件没有 ESM 导出）。
    // window 以宿主真实 jsdom window 传入，renderer 内部的 uSES shim 探测依赖 document。
    new Function('window', source)(loaderWindow)
  } finally {
    if (previousLoader === undefined) delete loaderWindow.__ModuleLoader__
    else loaderWindow.__ModuleLoader__ = previousLoader
  }

  if (loaded === undefined) {
    throw new Error('真 renderer 产物没有通过 window.__ModuleLoader__.load 完成登记')
  }
  cachedRenderer = loaded
  return loaded
}

/**
 * 安装一个「无会话」的 session 作用域适配器。
 *
 * 真 renderer 的 root 出口固定包一层 `ScopeProvider scope="session-maybe"`，它把
 * session-maybe 解析到已安装的 `session` 适配器；生产里由 dsh-client-ui-session 安装。
 * PoC 只关心 root 作用域的 children/only/label 语义，不需要会话数据，因此装一个
 * 空绑定（稳定快照、无订阅）即可——这不是 stub renderer，而是补上 renderer 正常
 * 装配所需的、与被测语义无关的会话作用域依赖。
 */
function installEmptySessionScope(ctx: Cordis.Context): void {
  const binding: Slots.StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }
  const current: Slots.HostObservable<Slots.StandardSourceBinding> = {
    getSnapshot: () => binding,
    subscribe: () => () => {},
  }
  ctx.slots.installScope('session', {
    current,
    bindingSource: () => current,
  })
}

/** 每个用例独立的真 cordis 根 Context + 已安装的真 renderer。 */
const liveContexts: Cordis.Context[] = []

function createRuntime(): Cordis.Context {
  const ctx = new Cordis.Context()
  loadRealRendererClient().apply(ctx)
  installEmptySessionScope(ctx)
  liveContexts.push(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// PoC 组件：模拟真实装配里的三层 —— root（AppFrame 位）/ holder（弹窗）/ 分节贡献方。
// ---------------------------------------------------------------------------

interface RootFrameProps {
  renderSlot: (key: 'shell.overlay', owner: object) => ReactNode
}

/** root 位：声明并渲染 `shell.overlay`（对应生产里的 ui-layout AppFrame）。 */
function RootFrame({ renderSlot }: RootFrameProps): ReactNode {
  return <div data-testid="poc-root">{renderSlot('shell.overlay', {})}</div>
}

interface OverlayHolderInjected {
  close: () => void
  active?: string
}

interface OverlayHolderProps extends OverlayHolderInjected {
  renderSlot: (
    key: 'workspace-config.section',
    owner: { close: () => void },
    opts: { only?: string },
  ) => ReactNode
}

/**
 * holder 位：按生产同形调用 `renderSlot(SECTION, { close }, { only })`。
 *
 * 这里故意写座位字面量（而不是常量）：它是 `renderSlot('workspace-config.section'…)`
 * 的直接调用点，同时让 G3 的 grep 验证句可以在源码里锚定真实调用。
 */
function OverlayHolder({ renderSlot, close, active }: OverlayHolderProps): ReactNode {
  return (
    <div data-testid="poc-overlay-holder">
      {renderSlot('workspace-config.section', { close }, { only: active })}
    </div>
  )
}

/** 分节 A：字符串 label 的贡献方。 */
function SectionA({ close }: { close: () => void }): ReactNode {
  return (
    <div data-testid="poc-section-a">
      <p>分节 A（字符串 label）</p>
      <button type="button" data-testid="poc-close-a" onClick={close}>
        关闭 A
      </button>
    </div>
  )
}

/** 分节 B：thunk label 的贡献方。 */
function SectionB({ close }: { close: () => void }): ReactNode {
  return (
    <div data-testid="poc-section-b">
      <p>分节 B（thunk label）</p>
      <button type="button" data-testid="poc-close-b" onClick={close}>
        关闭 B
      </button>
    </div>
  )
}

/** holder 本地 nav 投影（D2 的 2 行等价解析：不 import 上游 resolveSlotLabel）。 */
interface NavRow {
  id: string
  order: number
  label: string
}

function projectNavRows(entries: readonly Slots.StoredEntry[]): NavRow[] {
  return entries
    .map((entry) => ({
      id: entry.options.id ?? '',
      order: entry.options.order ?? 0,
      label:
        typeof entry.options.label === 'function'
          ? entry.options.label()
          : (entry.options.label ?? ''),
    }))
    .sort((left, right) => left.order - right.order)
}

// ---------------------------------------------------------------------------
// 场景装配
// ---------------------------------------------------------------------------

interface SceneOptions {
  /** 传给 holder 的选中分节 id；缺省 = 不过滤（全渲染）。 */
  active?: string
  /** 分节 B 的 label thunk；缺省给固定文案，用例可注入可变版本。 */
  bLabel?: () => string
}

interface Scene {
  ctx: Cordis.Context
  close: ReturnType<typeof vi.fn>
}

/**
 * 主场景：root 先声明 shell.overlay → holder 用 `slots.inject` 注册并在 children 表
 * 声明分节座位 → 两个贡献方随后 `slots.inject` 到分节座位。
 */
function createScene(options: SceneOptions = {}): Scene {
  const ctx = createRuntime()
  const close = vi.fn()

  // ① root 位：声明 shell.overlay（等价于 ui-layout 的 AppFrame 注册）。
  ctx.slots.register(
    {
      name: 'root',
      children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
    },
    RootFrame,
  )

  // ② holder 位：与生产装配同形——`slots.inject('shell.overlay', () => register({ children }, Comp))`。
  //    此时 shell.overlay 已声明，回调同步执行；children 表把分节座位写进声明账本。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'workspace-config.dialog',
        order: 530,
        children: { [SECTION]: { kind: 'list', scope: 'root' } },
        inject: () => ({ close, active: options.active }),
      },
      OverlayHolder,
    ),
  )

  // ③ 贡献方 A：字符串 label，order 20（列表序第二）。
  ctx.slots.inject(SECTION, () =>
    ctx.slots.register(
      {
        name: SECTION,
        id: 'a',
        order: 20,
        label: '分节 A（字符串 label）',
      },
      SectionA,
    ),
  )

  // ④ 贡献方 B：thunk label，order 10（列表序第一）。
  ctx.slots.inject(SECTION, () =>
    ctx.slots.register(
      {
        name: SECTION,
        id: 'b',
        order: 10,
        label: options.bLabel ?? (() => '分节 B（thunk label）'),
      },
      SectionB,
    ),
  )

  return { ctx, close }
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  // 真 cordis 根 Context 卸载：renderer / slots 的服务与 effect 一并释放，避免跨用例串扰。
  await Promise.all(liveContexts.splice(0).map((ctx) => ctx.fiber.dispose()))
})

describe('分节座位运行时 PoC（组 4 / 触达面 #18）', () => {
  it('① children 声明：holder 的 children 表声明子座位，贡献方后续 inject 同步补跑', () => {
    const { ctx } = createScene()

    // holder 已通过 slots.inject 注册进 shell.overlay（root 先声明 → 回调同步执行）。
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    const holderEntry = ctx.slots.entries('shell.overlay')[0]!
    expect(holderEntry.children?.[SECTION]).toEqual({ kind: 'list', scope: 'root' })

    // children 表被登记为真实声明：spec 可读、kind/scope 与契约一致。
    expect(ctx.slots.spec(SECTION)).toMatchObject({ kind: 'list', scope: 'root' })

    // 贡献方在声明之后 inject：回调立即执行，entry 已在子座位账本里（deferred-then-backfill 的
    // 「已声明 → 同步补跑」分支）。
    expect(ctx.slots.entries(SECTION).map((entry) => entry.options.id)).toEqual(['b', 'a'])

    // 真渲染：holder 的 renderSlot 把两个分节都挂出来（active 缺省 = 不过滤）。
    render(ctx.slots.renderSlot('root', {}))
    expect(screen.getByTestId('poc-root')).toBeTruthy()
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
    expect(screen.getByTestId('poc-section-b')).toBeTruthy()
  })

  it('② only 过滤：renderSlot 只渲染选中 id 的分节，未选中 entry 仍留在账本', () => {
    // 选中 order 20 的 A（列表序第二）：若只渲染首项会错误地渲染 B，能区分「按 id 过滤」与「截断」。
    const { ctx, close } = createScene({ active: 'a' })

    render(ctx.slots.renderSlot('root', {}))

    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
    expect(screen.queryByTestId('poc-section-b')).toBeNull()
    // only 只影响渲染投影，注册账本里仍是两条。
    expect(ctx.slots.entries(SECTION)).toHaveLength(2)

    // owner 份额 close 从 holder 的 renderSlot 调用点到达选中分节并被回调。
    fireEvent.click(screen.getByTestId('poc-close-a'))
    expect(close).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('poc-overlay-holder')).toBeTruthy()
  })

  it('③ label 双态：字符串与 thunk 在 nav 行投影中求值，thunk 每次读取重新求值', () => {
    let revision = 1
    const { ctx } = createScene({ bLabel: () => `分节 B（thunk v${revision}）` })
    const entries = ctx.slots.entries(SECTION)
    const a = entries.find((entry) => entry.options.id === 'a')!
    const b = entries.find((entry) => entry.options.id === 'b')!

    // 注册面原样存储 label：字符串仍是字符串、thunk 仍是函数（注册期不提前求值）。
    expect(typeof a.options.label).toBe('string')
    expect(typeof b.options.label).toBe('function')

    // 上游真 resolveSlotLabel（仅测试侧 import；holder 产物按 D2 不 import 它）。
    expect(Slots.resolveSlotLabel(a.options.label)).toBe('分节 A（字符串 label）')
    expect(Slots.resolveSlotLabel(b.options.label)).toBe('分节 B（thunk v1）')

    // thunk 每次读取重新求值：改 revision 后同一注册条目直接读出 v2，无需重注册。
    revision = 2
    expect(Slots.resolveSlotLabel(b.options.label)).toBe('分节 B（thunk v2）')

    // holder 本地 2 行等价投影（D2）与上游解析结论、order 排序一致。
    expect(projectNavRows(entries)).toEqual([
      { id: 'b', order: 10, label: '分节 B（thunk v2）' },
      { id: 'a', order: 20, label: '分节 A（字符串 label）' },
    ])
    // 与 contract.ts 的座位常量逐字一致（PoC 按契约构造注册面）。
    expect(SECTION).toBe('workspace-config.section')
  })

  it('④ 后装补跑：贡献方先 inject，holder 晚到声明后待命回调同步补跑', () => {
    const ctx = createRuntime()
    const close = vi.fn()

    // root 先到位，声明 shell.overlay；holder 尚未注册。
    ctx.slots.register(
      {
        name: 'root',
        children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
      },
      RootFrame,
    )
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)

    // 贡献方先到：子座位尚未声明 → inject 只挂待命订阅，不执行回调、不写 entry。
    ctx.slots.inject(SECTION, () =>
      ctx.slots.register(
        {
          name: SECTION,
          id: 'a',
          order: 20,
          label: '分节 A（字符串 label）',
        },
        SectionA,
      ),
    )
    expect(ctx.slots.spec(SECTION)).toBeUndefined()
    expect(ctx.slots.entries(SECTION)).toHaveLength(0)

    // holder 晚到：注册 shell.overlay 并以 children 表声明分节座位 →
    // 声明提交后，待命回调同步补跑，先到的贡献注册不丢。
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register(
        {
          name: 'shell.overlay',
          id: 'workspace-config.dialog',
          order: 530,
          children: { [SECTION]: { kind: 'list', scope: 'root' } },
          inject: () => ({ close, active: undefined }),
        },
        OverlayHolder,
      ),
    )
    expect(ctx.slots.entries(SECTION)).toHaveLength(1)
    expect(ctx.slots.entries(SECTION)[0]!.options.id).toBe('a')

    // 补跑后的注册能正常渲染（holder 到位后装配完整）。
    render(ctx.slots.renderSlot('root', {}))
    expect(screen.getByTestId('poc-section-a')).toBeTruthy()
  })
})
