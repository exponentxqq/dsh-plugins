// @vitest-environment jsdom
/**
 * 会话工具面面板的浏览器半组件测试（任务 10.4，设计附录 §3.1–§3.6）。
 *
 * 用例全部跑**真实组件 + 真实 `PanelController`**，只在最外层把 `PanelClient` 换成记录调用的假
 * 实现（`resolveClient` 是注入面，正好是假 client 的接缝）。这样断言到的是「用户点了什么 →
 * 面板发了什么请求 → 宿主回来的快照怎么改界面」，而不是替身之间的互相调用。
 *
 * 四条主验证句逐条对应用例：
 *
 * 1. **入口按钮带 `aria-label`**：`aria-label` / `title` / `aria-expanded` / `aria-haspopup`
 *    齐备，点击后 `aria-expanded` 翻转且面板标题来自本插件 locale；
 * 2. **保护行 `disabled` 且点击后 `client.toggle` 调用数 0**：`protected` / `reserved` /
 *    `shadowed` 三态各一条，`title` 给理由，程序化点击也不发请求；
 * 3. **切组开关发出的地址是 `mcp:<server>`**：点整组开关 → `client.toggle(sessionId, false,
 *    ['mcp:yunxiao'])`，且不会顺带折叠分组；
 * 4. **`unavailable` 时渲染降级文案且无 `Switch`**：入口仍在、正文只有 `error.unavailable`
 *    的主文案，整块没有任何 `role="switch"`，也不发 `panel` 请求。
 *
 * 另按任务清单覆盖：reserved/shadowed 禁用、`intent` 徽标、默认档添加/删除（客户端不做文法
 * 校验）、分组折叠、内置工具过滤、失败码文案（`error.<code>` + 二级灰字）、`pending` 禁用、
 * 关闭集空态与「开启」、刷新按钮、`session-not-live` 降级、默认档写失败。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  DefaultsAction,
  DefaultsValue,
  DefaultsView,
  PanelSnapshot,
  ToggleValue,
  ToolGroup,
} from '../src/contract.ts'
import { PanelError, type PanelClient } from '../src/client/panel-client.ts'
import { ToolPanelAction, type ToolPanelActionProps } from '../src/client/ToolPanelAction.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 固定时钟（epoch ms）：只用于 `createdAt` / `loadedAt`，断言不依赖具体格式。 */
const NOW = 1_700_000_000_000

/** 默认档文件的假绝对路径（只用于渲染与失败文案断言，不指向真实文件）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值，与 locale 服务同一实现）。 */
function translate(key: Key, params?: Record<string, unknown>): string {
  const template = zh[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** 一条工具条目的默认值：只有被点名的标记为真。 */
function tool(overrides: Partial<ToolGroup['tools'][number]> & Pick<ToolGroup['tools'][number], 'name' | 'shortName' | 'address'>) {
  return {
    disabled: false,
    protected: false,
    reserved: false,
    shadowed: false,
    ...overrides,
  }
}

/** MCP 服务器 `yunxiao` 整组（两个工具，整组可关）。 */
const MCP_GROUP: ToolGroup = {
  kind: 'mcp',
  key: 'yunxiao',
  address: 'mcp:yunxiao',
  toolCount: 2,
  disabledCount: 0,
  disabled: false,
  tools: [
    tool({ name: 'mcp__yunxiao__get_current_user', shortName: 'get_current_user', address: 'mcp:yunxiao::get_current_user' }),
    tool({ name: 'mcp__yunxiao__list_projects', shortName: 'list_projects', address: 'mcp:yunxiao::list_projects' }),
  ],
}

/** 技能整档（只有 `skill` 一个工具，组地址 `tool:skill`）。 */
const SKILL_GROUP: ToolGroup = {
  kind: 'skill',
  key: 'skill',
  address: 'tool:skill',
  toolCount: 1,
  disabledCount: 0,
  disabled: false,
  tools: [tool({ name: 'skill', shortName: 'skill', address: 'tool:skill' })],
}

/** 内置工具分区：保护 / 保留 / 被隐藏 / 普通各一条；该分区不可整组关。 */
const BUILTIN_GROUP: ToolGroup = {
  kind: 'builtin',
  key: 'builtin',
  address: null,
  toolCount: 4,
  disabledCount: 0,
  disabled: false,
  tools: [
    tool({ name: 'bash', shortName: 'bash', address: 'tool:bash', protected: true, description: '执行 shell 命令' }),
    tool({ name: 'run_code', shortName: 'run_code', address: 'tool:run_code', reserved: true }),
    tool({ name: 'web_search', shortName: 'web_search', address: 'tool:web_search', shadowed: true }),
    tool({ name: 'read_file', shortName: 'read_file', address: 'tool:read_file' }),
  ],
}

/**
 * 默认档视图。
 * @param disabled - 默认档关闭集。
 * @param overrides - 需要改写的字段。
 * @returns 默认档视图。
 */
function defaultsView(disabled: readonly string[] = [], overrides: Partial<DefaultsView> = {}): DefaultsView {
  return {
    version: 1,
    disabled: [...disabled],
    path: DEFAULTS_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/**
 * 一份最小的合法面板快照；默认带三种分组、一个关闭项（同时是 `intentOnly`）与一条子代理提示。
 * @param overrides - 需要改写的顶层字段。
 * @returns 面板快照。
 */
function snapshot(overrides: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    sessionId: SESSION_ID,
    createdAt: NOW - 60_000,
    state: {
      disabled: ['mcp:figma'],
      snapshot: ['tool:bash'],
      seeded: true,
      updatedAt: NOW,
      storeKind: 'record',
    },
    groups: [MCP_GROUP, SKILL_GROUP, BUILTIN_GROUP],
    protectedNames: ['bash'],
    defaults: defaultsView(['mcp:figma']),
    hiddenByOthers: ['web_search'],
    intentOnly: ['mcp:figma'],
    stats: { visible: 7, catalog: 8, denied: 1, shadowed: 1 },
    notices: [],
    ...overrides,
  }
}

/**
 * `toggle` / `reset` 的成功值（两者共享 `ToggleValue` 形状）。
 * @param value - 响应里的新快照。
 * @returns 端点成功值。
 */
function mutationValue(value: PanelSnapshot): ToggleValue {
  return {
    snapshot: value,
    mutation: {
      applied: [],
      hiddenTools: 0,
      visibleBefore: value.stats.visible,
      visibleAfter: value.stats.visible,
      kvRebuild: false,
      notices: [],
    },
  }
}

/** 假面板客户端：记录每次调用的参数，实现按用例替换（默认拒绝，防止漏配）。 */
class FakePanelClient implements PanelClient {
  /** 每次 `panel` 的 sessionId。 */
  readonly panelCalls: string[] = []
  /** 每次 `toggle` 的参数（地址数组已复制）。 */
  readonly toggleCalls: Array<{ sessionId: string; on: boolean; addresses: readonly string[] }> = []
  /** 每次 `reset` 的 sessionId。 */
  readonly resetCalls: string[] = []
  /** 每次 `updateDefaults` 的参数。 */
  readonly defaultsCalls: Array<{ action: DefaultsAction; addresses?: readonly string[] }> = []

  /** `panel` 的实现（默认成功返回 {@link snapshot}）。 */
  panelImpl: (sessionId: string) => Promise<PanelSnapshot> = async () => snapshot()
  /** `toggle` 的实现（默认成功返回同一份快照）。 */
  toggleImpl: (sessionId: string, on: boolean, addresses: readonly string[]) => Promise<ToggleValue> = async () =>
    mutationValue(snapshot())
  /** `reset` 的实现（默认成功返回同一份快照）。 */
  resetImpl: (sessionId: string) => Promise<ToggleValue> = async () => mutationValue(snapshot())
  /** `updateDefaults` 的实现（默认成功返回入参视图）。 */
  updateDefaultsImpl: (action: DefaultsAction, addresses?: readonly string[]) => Promise<DefaultsValue> = async () => ({
    defaults: defaultsView(),
    changed: [],
  })

  panel(sessionId: string): Promise<PanelSnapshot> {
    this.panelCalls.push(sessionId)
    return this.panelImpl(sessionId)
  }

  toggle(sessionId: string, on: boolean, addresses: readonly string[]): Promise<ToggleValue> {
    this.toggleCalls.push({ sessionId, on, addresses: [...addresses] })
    return this.toggleImpl(sessionId, on, addresses)
  }

  reset(sessionId: string): Promise<ToggleValue> {
    this.resetCalls.push(sessionId)
    return this.resetImpl(sessionId)
  }

  updateDefaults(action: DefaultsAction, addresses?: readonly string[]): Promise<DefaultsValue> {
    this.defaultsCalls.push(addresses === undefined ? { action } : { action, addresses: [...addresses] })
    return this.updateDefaultsImpl(action, addresses)
  }
}

/** 一个可手动落定的 promise（pending 用例用来把请求挂在途）。 */
interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

/**
 * 建一个待决 promise。
 * @returns promise 与结算函数。
 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 面板测试台：假客户端 + 可换的 client 解析结果。 */
interface PanelHarness {
  /** 假客户端（断言调用参数用）。 */
  readonly client: FakePanelClient
  /** 为 `undefined` 时模拟 `connection` 未就绪（`resolveClient` 返回空）。 */
  setClient(next: PanelClient | undefined): void
}

/**
 * 渲染入口组件（座位运行时份额用一个最小替身覆盖：本组件只读 `sessionId`）。
 * @param options - 假客户端与最初的 `resolveClient` 结果。
 * @returns testing-library 的 render 结果 + 测试台。
 */
function renderPanel(options: { client?: FakePanelClient; connected?: boolean } = {}) {
  const client = options.client ?? new FakePanelClient()
  let resolved: PanelClient | undefined = options.connected === false ? undefined : client
  const props = {
    sessionId: SESSION_ID,
    resolveClient: () => resolved,
    t: translate,
  } as unknown as ToolPanelActionProps
  const harness: PanelHarness = {
    client,
    setClient: (next) => {
      resolved = next
    },
  }
  return { ...render(<ToolPanelAction {...props} />), harness }
}

/** 入口按钮的 `aria-label` 文案（多个用例反复用到）。 */
const TRIGGER_LABEL = zh['action.label']

/**
 * 点开面板并让 `open()` 那条异步链跑完。
 *
 * `open()` → `refresh()` → `client.panel()` 至少两跳微任务，异步 `act` 会把它们和随后的
 * 重渲染一起冲干净；再留一轮同步 `act` 兜「补一次提交」的边界。
 */
async function openPanel(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
  })
  await act(async () => {})
}

/**
 * 按可访问名取开关（`Switch` 的 `label` 是 `switch.label` 插值后的名字）。
 * @param name - 工具短名（或 MCP 服务器名）。
 * @returns 开关元素。
 */
function switchOf(name: string): HTMLButtonElement {
  return screen.getByRole('switch', { name: zh['switch.label'].replace('{name}', name) }) as HTMLButtonElement
}

describe('会话工具面入口按钮（设计 §3.1）', () => {
  it('入口是带 aria-label / title / aria-expanded 的图标按钮，点击后展开面板', async () => {
    renderPanel()
    const trigger = screen.getByRole('button', { name: TRIGGER_LABEL })

    expect(trigger.getAttribute('aria-label')).toBe(TRIGGER_LABEL)
    expect(trigger.getAttribute('title')).toBe(zh['action.tooltip'])
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.textContent).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()

    await openPanel()

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(zh['panel.title'])
    expect(screen.getByText(zh['panel.description'])).toBeDefined()
    // 四段分区标题都来自本插件 locale。
    for (const section of ['section.state', 'section.groups', 'section.defaults', 'section.disabled'] as const) {
      expect(screen.getByText(zh[section])).toBeDefined()
    }
  })

  it('打开后按 ESC 式关闭路径（关闭按钮）能收起面板并保留入口', async () => {
    renderPanel()
    await openPanel()

    // 底栏「关闭」是唯一一个带可见「关闭」文字的按钮；标题栏的 × 是 aria-label。
    const closes = screen.getAllByRole('button', { name: zh['panel.close'] })
    await act(async () => {
      fireEvent.click(closes[closes.length - 1] as HTMLElement)
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: TRIGGER_LABEL }).getAttribute('aria-expanded')).toBe('false')
  })
})

describe('不可用降级（spec「RPC 不可用时的降级表现」）', () => {
  it('resolveClient 为空时渲染 error.unavailable 且不渲染任何 Switch、不发请求', async () => {
    const { harness } = renderPanel({ connected: false })
    await openPanel()

    // 入口恒渲染：入口是唯一发现面，隐藏比「点开看到不可用」更糟。
    expect(screen.getByRole('button', { name: TRIGGER_LABEL })).toBeDefined()
    expect(screen.getByText(zh['error.unavailable'])).toBeDefined()
    expect(screen.queryAllByRole('switch')).toEqual([])
    // 降级路径不发任何请求（connection 未就绪）。
    expect(harness.client.panelCalls).toEqual([])
    expect(harness.client.toggleCalls).toEqual([])
  })

  it('宿主回 session-not-live 时同样只给解释性文案，不提供开关', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => {
      throw new PanelError('session-not-live', '会话不在宿主中运行')
    }
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['error.session-not-live'])).toBeDefined()
    expect(screen.getByText('会话不在宿主中运行')).toBeDefined()
    expect(screen.queryAllByRole('switch')).toEqual([])
  })
})

describe('三态禁用（设计 §3.3）', () => {
  it('保护行 disabled 且点击后 client.toggle 调用数 0', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const bash = switchOf('bash')
    expect(bash.disabled).toBe(true)
    expect(bash.getAttribute('title')).toBe(zh['badge.protected'])
    expect(screen.getByText(zh['entry.protected'])).toBeDefined()

    fireEvent.click(bash)
    expect(harness.client.toggleCalls).toHaveLength(0)
  })

  it('保留名行 disabled 且带不可关闭理由', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const runCode = switchOf('run_code')
    expect(runCode.disabled).toBe(true)
    expect(runCode.getAttribute('title')).toBe(zh['badge.reserved'])
    expect(screen.getByText(zh['entry.reserved'])).toBeDefined()

    fireEvent.click(runCode)
    expect(harness.client.toggleCalls).toHaveLength(0)
  })

  it('被其它作用域隐藏的行 disabled（本面板不能把它开回来）', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const shadowed = switchOf('web_search')
    expect(shadowed.disabled).toBe(true)
    expect(shadowed.getAttribute('title')).toBe(zh['badge.shadowed'])
    expect(screen.getByText(zh['entry.shadowed'])).toBeDefined()

    fireEvent.click(shadowed)
    expect(harness.client.toggleCalls).toHaveLength(0)
  })
})

describe('开关与分组（设计 §3.3）', () => {
  it('切组开关发出的地址是 mcp:<server>，且点击开关不折叠分组', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const groupSwitch = switchOf('yunxiao')
    expect(groupSwitch.getAttribute('aria-checked')).toBe('true')

    const header = screen.getByRole('button', { name: /MCP 服务器/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      fireEvent.click(groupSwitch)
    })

    expect(harness.client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['mcp:yunxiao'] },
    ])
    // 开关在标题区之外：点它不该顺带把分组展开。
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('单工具开关打自己的地址，并在 pending 期间禁用该行', async () => {
    const client = new FakePanelClient()
    const pending = deferred<ToggleValue>()
    client.toggleImpl = () => pending.promise
    renderPanel({ client })
    await openPanel()

    await act(async () => {
      fireEvent.click(switchOf('read_file'))
    })

    expect(client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['tool:read_file'] },
    ])
    expect(switchOf('read_file').disabled).toBe(true)
    expect(screen.getByText(zh['toggle.pending'])).toBeDefined()

    await act(async () => {
      pending.resolve(mutationValue(snapshot()))
    })

    // 宿主快照回来后才恢复可点，且开关状态以宿主返回为准（不做乐观更新）。
    expect(switchOf('read_file').disabled).toBe(false)
    expect(switchOf('read_file').getAttribute('aria-checked')).toBe('true')
  })
})

describe('分组折叠与本地过滤（设计 §3.3）', () => {
  it('MCP 组默认折叠，点标题行展开后出现单工具行，再点收回', async () => {
    renderPanel()
    await openPanel()

    expect(screen.queryByRole('switch', { name: zh['switch.label'].replace('{name}', 'get_current_user') })).toBeNull()
    const header = screen.getByRole('button', { name: /MCP 服务器/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(switchOf('get_current_user')).toBeDefined()
    expect(switchOf('list_projects')).toBeDefined()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('switch', { name: zh['switch.label'].replace('{name}', 'get_current_user') })).toBeNull()
  })

  it('内置工具分区的过滤输入只改展示，不发请求', async () => {
    const { harness } = renderPanel()
    await openPanel()

    fireEvent.change(screen.getByPlaceholderText(zh['group.filter']), { target: { value: 'run' } })

    expect(switchOf('run_code')).toBeDefined()
    expect(screen.queryByRole('switch', { name: zh['switch.label'].replace('{name}', 'bash') })).toBeNull()
    expect(harness.client.panelCalls).toHaveLength(1)
    expect(harness.client.toggleCalls).toHaveLength(0)
  })
})

describe('状态摘要与关闭集（设计 §3.2）', () => {
  it('渲染四计数、持久化通道与提示码', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      notices: ['persistence-degraded', 'session-subagent'],
      hiddenByOthers: ['web_search'],
      stats: { visible: 7, catalog: 9, denied: 1, shadowed: 2 },
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText('本会话可见 7')).toBeDefined()
    expect(screen.getByText('全局 9')).toBeDefined()
    expect(screen.getByText('已关 1')).toBeDefined()
    expect(screen.getByText('被其它作用域隐藏 2')).toBeDefined()
    expect(screen.getByText(zh['state.storeKind.record'])).toBeDefined()
    expect(screen.getByText(zh['notice.persistence-degraded'])).toBeDefined()
    expect(screen.getByText(zh['notice.session-subagent'])).toBeDefined()
  })

  it('关闭集给 intent 徽标与「开启」入口', async () => {
    const { harness } = renderPanel()
    await openPanel()

    // `mcp:figma` 既在关闭集里、又在 intentOnly 里 → chip 带 intent 徽标与理由。
    expect(screen.getByText(zh['badge.intent'])).toBeDefined()
    expect(screen.getByText(zh['badge.intent']).getAttribute('title')).toBe(zh['entry.intentOnly'])
    expect(screen.getByText(zh['disabled.intentOnly'])).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['disabled.enableAria'].replace('{address}', 'mcp:figma') }))
    })
    expect(harness.client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: true, addresses: ['mcp:figma'] },
    ])
  })

  it('关闭集为空时给空态文案且不渲染 intent 徽标', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: { disabled: [], snapshot: [], seeded: true, updatedAt: NOW, storeKind: 'memory' },
      intentOnly: [],
      stats: { visible: 7, catalog: 8, denied: 0, shadowed: 1 },
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['disabled.empty'])).toBeDefined()
    expect(screen.queryByText(zh['badge.intent'])).toBeNull()
  })

  it('刷新按钮重拉面板快照', async () => {
    const { harness } = renderPanel()
    await openPanel()
    expect(harness.client.panelCalls).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['panel.refresh'] }))
    })

    expect(harness.client.panelCalls).toHaveLength(2)
  })
})

describe('默认档编辑（设计 §3.4）', () => {
  it('自由文本添加：按空白/逗号切片后整份交给宿主，客户端不做文法校验', async () => {
    const client = new FakePanelClient()
    client.updateDefaultsImpl = async () => ({
      defaults: defaultsView(['mcp:figma', 'tool:read_file', 'foo:bar']),
      changed: ['foo:bar', 'mcp:figma', 'tool:read_file'],
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['defaults.path'])).toBeDefined()
    expect(screen.getByText(DEFAULTS_PATH)).toBeDefined()
    expect(screen.getByText(zh['defaults.scope'])).toBeDefined()

    fireEvent.change(screen.getByPlaceholderText(zh['defaults.addPlaceholder']), {
      target: { value: ' mcp:figma, tool:read_file  foo:bar ' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['defaults.add'] }))
    })

    // `foo:bar` 不是合法文法（宿主才是权威）：客户端原样上送，由宿主回 bad-address。
    expect(client.defaultsCalls).toEqual([
      { action: 'off', addresses: ['mcp:figma', 'tool:read_file', 'foo:bar'] },
    ])
    // 只刷新 defaults 视图（默认档不追溯）：面板快照没有重拉。
    expect(client.panelCalls).toHaveLength(1)
    expect(screen.getByText('foo:bar')).toBeDefined()
    expect(screen.getByText(zh['defaults.saved'])).toBeDefined()
  })

  it('移除一条默认档条目发 on + 该地址', async () => {
    const client = new FakePanelClient()
    client.updateDefaultsImpl = async () => ({ defaults: defaultsView([]), changed: ['mcp:figma'] })
    renderPanel({ client })
    await openPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `${zh['defaults.remove']} mcp:figma` }))
    })

    expect(client.defaultsCalls).toEqual([{ action: 'on', addresses: ['mcp:figma'] }])
    expect(client.panelCalls).toHaveLength(1)
  })

  it('默认档写失败按 error.<code> 渲染主文案（{path} 来自 details）', async () => {
    const client = new FakePanelClient()
    client.updateDefaultsImpl = async () => {
      throw new PanelError('defaults-unwritable', 'EACCES: permission denied', { path: DEFAULTS_PATH, reason: 'EACCES' })
    }
    renderPanel({ client })
    await openPanel()

    fireEvent.change(screen.getByPlaceholderText(zh['defaults.addPlaceholder']), {
      target: { value: 'mcp:figma' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['defaults.add'] }))
    })

    expect(screen.getByText(`默认档写入失败：${DEFAULTS_PATH}。`)).toBeDefined()
    expect(screen.getByText('EACCES: permission denied')).toBeDefined()
    // 失败不算保存成功。
    expect(screen.queryByText(zh['defaults.saved'])).toBeNull()
  })
})

describe('失败码文案（设计 §3.5）', () => {
  it('toggle 被保护名单拒绝时主文案插值 {names}，宿主原文作二级灰字', async () => {
    const client = new FakePanelClient()
    client.toggleImpl = async () => {
      throw new PanelError('protected', '宿主拒绝：bash 仍受保护', { names: ['bash'] })
    }
    renderPanel({ client })
    await openPanel()

    await act(async () => {
      fireEvent.click(switchOf('read_file'))
    })

    expect(screen.getByText('bash 在保护名单内，不能关闭。')).toBeDefined()
    expect(screen.getByText('宿主拒绝：bash 仍受保护')).toBeDefined()
    // 失败不销毁面板：快照还在，开关仍然渲染。
    expect(screen.queryAllByRole('switch').length).toBeGreaterThan(0)
  })

  it('未知失败码回退 error.fallback（不把原始码改写成 internal）', async () => {
    const client = new FakePanelClient()
    client.toggleImpl = async () => {
      throw new PanelError('future-code', '宿主回了本版本不认识的码')
    }
    renderPanel({ client })
    await openPanel()

    await act(async () => {
      fireEvent.click(switchOf('read_file'))
    })

    expect(screen.getByText(zh['error.fallback'])).toBeDefined()
    expect(screen.getByText('宿主回了本版本不认识的码')).toBeDefined()
  })
})
