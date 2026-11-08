/**
 * 面板座位配对协调器（`src/client/panel-pair.ts`）的状态机契约。
 *
 * 协调器是纯函数式状态机：不持异步资源、不订阅任何东西、不收 `ctx`，所以可以用裸
 * 假 install / dispose 直接驱动。本套件逐条钉住模块头的四条不变式与 code-design ③ 3.4：
 *
 * 1. **三种到场顺序**：`main` 先到 → 行座位一到就补装；`sidebar.panellist` 先到 → 只
 *    登记装法、等页面到场再装；页面重复到场（宿主重声明）→ 先摘旧一轮再装新一轮。
 * 2. **两种失败路径**：页面装法抛错 → 行**绝不**单独注册（否则宿主点击抛错）；
 *    行装法抛错 → 页面照常、只 `warn` 且可在下一次到场时重试。
 * 3. **幂等 dispose**：页面 / 行各自的 disposer 重复调用只生效一次；页面 disposer
 *    **先摘行、再摘页面**（不变式 2）。
 * 4. **失败只 warn**：`warn` 收到不带前缀的消息与原始异常，`install` 的异常不向外抛。
 *
 * @module dsh-plugin-workspace-config/test/panel-pair
 */

import { describe, expect, it, vi } from 'vitest'
import { createPanelPair } from '../src/client/panel-pair.ts'

/** 一次 `warn` 的记录（消息不带日志前缀；`error` 可能缺席）。 */
interface Warning {
  readonly message: string
  readonly error?: unknown
}

/** 协调器 + 两侧装法 / disposer 的调用记录。 */
interface Harness {
  readonly pair: ReturnType<typeof createPanelPair>
  readonly warnings: readonly Warning[]
  /** 按发生顺序记录 `page-install` / `row-install` / `page-dispose` / `row-dispose`。 */
  events: string[]
  readonly pageInstall: ReturnType<typeof vi.fn>
  readonly rowInstall: ReturnType<typeof vi.fn>
  readonly pageDispose: ReturnType<typeof vi.fn>
  readonly rowDispose: ReturnType<typeof vi.fn>
}

/**
 * 造一个记录调用顺序的协调器夹具。
 * @returns 协调器与两侧装法 / disposer 的替身。
 */
function createHarness(): Harness {
  const warnings: Warning[] = []
  const events: string[] = []
  const pageDispose = vi.fn(() => {
    events.push('page-dispose')
  })
  const rowDispose = vi.fn(() => {
    events.push('row-dispose')
  })
  const pageInstall = vi.fn(() => {
    events.push('page-install')
    return pageDispose
  })
  const rowInstall = vi.fn(() => {
    events.push('row-install')
    return rowDispose
  })
  return {
    pair: createPanelPair((message, error) => {
      warnings.push({ message, error })
    }),
    warnings,
    events,
    pageInstall,
    rowInstall,
    pageDispose,
    rowDispose,
  }
}

describe('三种到场顺序', () => {
  it('main 先到、行座位后到：页面装成后行座位一到就补装', () => {
    const harness = createHarness()

    harness.pair.page(harness.pageInstall)
    expect(harness.events).toEqual(['page-install'])
    expect(harness.rowInstall).not.toHaveBeenCalled()

    const disposeRow = harness.pair.row(harness.rowInstall)
    expect(harness.events).toEqual(['page-install', 'row-install'])

    disposeRow()
    expect(harness.events).toEqual(['page-install', 'row-install', 'row-dispose'])
  })

  it('sidebar.panellist 先到、页面后到：只登记装法，页面装成才注册行', () => {
    const harness = createHarness()

    harness.pair.row(harness.rowInstall)
    // 页面未装成时行绝不单独注册（不变式 1）。
    expect(harness.rowInstall).not.toHaveBeenCalled()
    expect(harness.events).toEqual([])

    harness.pair.page(harness.pageInstall)
    // 页面装成 → 立刻补装行；顺序是「先页面、后行」。
    expect(harness.events).toEqual(['page-install', 'row-install'])
  })

  it('页面重复到场（宿主重声明）：先摘旧一轮，再装新一轮', () => {
    const harness = createHarness()

    harness.pair.page(harness.pageInstall)
    harness.pair.row(harness.rowInstall)
    expect(harness.events).toEqual(['page-install', 'row-install'])

    // 重声明不等上一次 disposer：协调器自己把上一轮摘干净。
    harness.pair.page(harness.pageInstall)
    expect(harness.events).toEqual([
      'page-install',
      'row-install',
      'row-dispose',
      'page-dispose',
      'page-install',
      'row-install',
    ])
    // 行座位仍在场：新一轮页面装成后又补装了一次行。
    expect(harness.rowInstall).toHaveBeenCalledTimes(2)
  })

  it('行座位重复到场：摘旧行再装新行，页面不受影响', () => {
    const harness = createHarness()

    harness.pair.page(harness.pageInstall)
    harness.pair.row(harness.rowInstall)
    harness.pair.row(harness.rowInstall)

    expect(harness.events).toEqual([
      'page-install',
      'row-install',
      'row-dispose',
      'row-install',
    ])
    expect(harness.pageInstall).toHaveBeenCalledTimes(1)
  })

  it('行座位先到又先退场：页面后到时不再装行；行座位再次到场才装', () => {
    const harness = createHarness()

    const disposeRowSeat = harness.pair.row(harness.rowInstall)
    disposeRowSeat()
    expect(harness.rowInstall).not.toHaveBeenCalled()

    harness.pair.page(harness.pageInstall)
    // 行座位已退场：页面装成也不补装（不变式 1 的前半）。
    expect(harness.events).toEqual(['page-install'])

    harness.pair.row(harness.rowInstall)
    expect(harness.events).toEqual(['page-install', 'row-install'])
  })
})

describe('两种失败路径', () => {
  it('页面装法抛错：行绝不注册，只 warn 一次；行座位后到也不装', () => {
    const harness = createHarness()
    const failure = new Error('main 座位拒绝注册')
    const failingInstall = vi.fn((): (() => void) => {
      throw failure
    })

    const dispose = harness.pair.page(failingInstall)
    // 失败不向外抛：apply 必须正常返回，返回空 disposer 让座位效应照常收尾。
    expect(typeof dispose).toBe('function')
    expect(() => dispose()).not.toThrow()
    expect(harness.warnings).toEqual([
      { message: '页面座位注册失败，本页面不显示', error: failure },
    ])
    expect(harness.rowInstall).not.toHaveBeenCalled()

    // 行座位随后到场：页面未装成 → 仍不注册（否则就是「行在、点了抛错」）。
    harness.pair.row(harness.rowInstall)
    expect(harness.rowInstall).not.toHaveBeenCalled()
    expect(harness.events).toEqual([])
  })

  it('页面装法失败后重试成功：行座位补装', () => {
    const harness = createHarness()
    let attempts = 0
    harness.pair.page(() => {
      attempts += 1
      if (attempts === 1) throw new Error('第一次失败')
      return () => {
        harness.events.push('page-dispose')
      }
    })
    harness.pair.row(harness.rowInstall)
    expect(harness.rowInstall).not.toHaveBeenCalled()

    harness.pair.page(harness.pageInstall)
    expect(harness.events).toEqual(['page-install', 'row-install'])
  })

  it('行装法抛错：页面照常，只 warn；行座位重新到场时可重试成功', () => {
    const harness = createHarness()
    const failure = new Error('panellist 座位拒绝注册')
    const failingRow = vi.fn((): (() => void) => {
      throw failure
    })

    harness.pair.page(harness.pageInstall)
    harness.pair.row(failingRow)

    expect(harness.warnings).toEqual([
      { message: '侧栏面板行注册失败，本入口不显示', error: failure },
    ])
    // 页面不受连累。
    expect(harness.events).toEqual(['page-install'])

    // 行座位再次到场（或页面回场补装）时可重试：半装状态没有被固化。
    harness.pair.row(harness.rowInstall)
    expect(harness.events).toEqual(['page-install', 'row-install'])
  })

  it('行装法抛错后不留下半装状态：页面退场只摘页面，不再重复警告', () => {
    const harness = createHarness()
    const disposePage = harness.pair.page(harness.pageInstall)
    harness.pair.row(() => {
      throw new Error('panellist 座位拒绝注册')
    })
    expect(harness.warnings).toHaveLength(1)

    harness.events.length = 0
    disposePage()
    // 行从未装成（装法抛错时没有可回收的句柄）：退场只有页面一步。
    expect(harness.events).toEqual(['page-dispose'])
    expect(harness.warnings).toHaveLength(1)
  })
})

describe('幂等 dispose 与顺序', () => {
  it('页面 disposer 先摘行、再摘页面；重复调用只生效一次', () => {
    const harness = createHarness()
    const disposePage = harness.pair.page(harness.pageInstall)
    harness.pair.row(harness.rowInstall)
    harness.events.length = 0

    disposePage()
    expect(harness.events).toEqual(['row-dispose', 'page-dispose'])

    disposePage()
    expect(harness.events).toEqual(['row-dispose', 'page-dispose'])
    expect(harness.rowDispose).toHaveBeenCalledTimes(1)
    expect(harness.pageDispose).toHaveBeenCalledTimes(1)
  })

  it('行座位 disposer 只摘行、不碰页面，重复调用幂等', () => {
    const harness = createHarness()
    harness.pair.page(harness.pageInstall)
    const disposeRow = harness.pair.row(harness.rowInstall)
    harness.events.length = 0

    disposeRow()
    disposeRow()
    expect(harness.events).toEqual(['row-dispose'])
    expect(harness.pageDispose).not.toHaveBeenCalled()
  })

  it('页面已退场后再调行座位 disposer：没有可摘的行，不重复调用', () => {
    const harness = createHarness()
    const disposePage = harness.pair.page(harness.pageInstall)
    const disposeRow = harness.pair.row(harness.rowInstall)

    disposePage()
    harness.events.length = 0
    disposeRow()
    expect(harness.events).toEqual([])
  })

  it('disposer 抛错也只 warn：状态先摘干净，可重新装配', () => {
    const harness = createHarness()
    const warnings: Warning[] = []
    const pair = createPanelPair((message, error) => {
      warnings.push({ message, error })
    })
    const disposePage = pair.page(() => () => {
      throw new Error('页面注销失败')
    })
    pair.row(() => () => {
      throw new Error('行注销失败')
    })

    expect(() => disposePage()).not.toThrow()
    expect(warnings.map((warning) => warning.message)).toEqual([
      '侧栏面板行注销失败',
      '页面座位注销失败',
    ])

    // 状态已复位：重新装配不受上一轮失败影响（行座位重新到场后页面再装）。
    expect(() => {
      pair.row(harness.rowInstall)
      pair.page(harness.pageInstall)
    }).not.toThrow()
    expect(harness.events).toEqual(['page-install', 'row-install'])
  })
})
