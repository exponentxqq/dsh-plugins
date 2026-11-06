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
 * 2. **保护行 `disabled` 且点击后 `client.toggle` 调用数 0**：`protected` / `reserved`
 *    两态各一条，`title` 给理由，程序化点击也不发请求；
 * 3. **切组开关发出的地址是 `mcp:<server>`**：点整组开关 → `client.toggle(sessionId, false,
 *    ['mcp:yunxiao'])`，且不会顺带折叠分组；
 * 4. **`unavailable` 时渲染降级文案且无 `Switch`**：入口仍在、正文只有 `error.unavailable`
 *    的主文案，整块没有任何 `role="switch"`，也不发 `panel` 请求。
 *
 * 会话级目录改造后（任务 5.3 / TS8）：工具行锁定只有**保护 / 保留两态**，状态摘要只渲染
 * **两计数**（本会话可见 / 已关）。
 *
 * 另按任务清单覆盖：`intent` 徽标、分组折叠、内置工具过滤、失败码文案（`error.<code>` +
 * 二级灰字）、`pending` 禁用、关闭集空态与「开启」、刷新按钮、`session-not-live` 降级。
 *
 * 任务 7.7 追加的六段布局与技能分区（逐行开关、`unavailable` 降级、`blocked` 置灰）。
 *
 * 任务 9.1 / 9.2 / 9.4 把两个默认档分区改成**默认收起**的 `DefaultsSectionFrame`：标题行
 * 带「默认关 M · 残留 K」摘要，展开后是 `DefaultsGroupList` 的分组开关清单（没有自由文本
 * 添加——跨清单的新关走 `/tools default off` / `/tools workspace off` 命令）。本套件的默认档
 * 用例按这条新形状重写：两分区默认收起 → 点标题展开 → 清单里的行/组开关分别打到
 * `updateDefaults` 与 `workspace` 端点，`workspace === null` 仍只读降级。
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  DefaultsAction,
  DefaultsValue,
  DefaultsView,
  PanelSnapshot,
  SkillView,
  ToggleValue,
  ToolGroup,
  WorkspaceRequest,
  WorkspaceValue,
  WorkspaceView,
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

/** 工作区规范路径（假值：只用于渲染与请求体断言）。 */
const WORKSPACE_KEY = '/fake/workspaces/project'

/** 工作区档文件的假绝对路径。 */
const WORKSPACE_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/**
 * 工作区档关闭集的夹具：一条在宇宙里（`tool:read_file` → 计入「默认关」）+ 两条残留
 * （`skill:ghost*` → 只出现在残留区）。条数刻意与用户级不同（1/2 对 1/1）：两个分区读错
 * 目标档时摘要与三计数会立刻对不上。
 */
const WORKSPACE_DISABLED = ['skill:ghost', 'skill:ghost-2', 'tool:read_file'] as const

/**
 * 工作区档视图（默认带 {@link WORKSPACE_DISABLED}：分区标题的「默认关 M · 残留 K」摘要、
 * 三计数行与残留区都按它算，工作区专项用例再按需覆盖）。
 * @param overrides - 需要改写的字段。
 * @returns 工作区视图。
 */
function workspaceView(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    key: WORKSPACE_KEY,
    title: 'project',
    registered: true,
    disabled: WORKSPACE_DISABLED,
    path: WORKSPACE_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/** 两条技能行：一条模型可见、一条已关且已遮蔽（`disabled && shadowed` 是允许点击的态）。 */
const SKILLS: readonly SkillView[] = [
  { name: 'openspec-propose', description: '提案工作流', disabled: false, shadowed: false },
  { name: 'skill-review', description: '', disabled: true, shadowed: true },
]

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

/** 内置工具分区：保护 / 保留各一条，其余是普通行；该分区不可整组关。 */
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
    tool({ name: 'web_search', shortName: 'web_search', address: 'tool:web_search' }),
    tool({ name: 'read_file', shortName: 'read_file', address: 'tool:read_file' }),
  ],
}

/**
 * 用户级默认档关闭集的夹具：一条在宇宙里（`tool:read_file` → 计入「默认关」）+ 一条残留
 * （`mcp:figma` 不在本会话清单里 → 只出现在残留区）。
 */
const DEFAULTS_DISABLED = ['mcp:figma', 'tool:read_file'] as const

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
 * 一份最小的合法面板快照；默认带三种分组、两条技能行、两个默认档视图（各自带在宇宙里的
 * 关闭项与残留地址）与会话级关闭集里的一个关闭项（同时是 `intentOnly`）。
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
    defaults: defaultsView(DEFAULTS_DISABLED),
    intentOnly: ['mcp:figma'],
    stats: { visible: 7, denied: 1 },
    notices: [],
    skills: SKILLS,
    workspace: workspaceView(),
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
      hiddenSkills: 0,
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
  /** 每次 `workspace` 的请求体（已复制地址数组）。 */
  readonly workspaceCalls: WorkspaceRequest[] = []

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
  /** `workspace` 的实现（默认成功返回面板快照里的工作区视图）。 */
  workspaceImpl: (request: WorkspaceRequest) => Promise<WorkspaceValue> = async () => ({
    workspace: workspaceView(),
    choices: [{ key: WORKSPACE_KEY, title: 'project' }],
    changed: [],
    // 键必填（`null` 合法）：本文件不消费宇宙，夹具给最小值。
    universe: null,
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

  workspace(request: WorkspaceRequest): Promise<WorkspaceValue> {
    this.workspaceCalls.push({
      ...request,
      ...(request.addresses === undefined ? {} : { addresses: [...request.addresses] }),
    })
    return this.workspaceImpl(request)
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

/**
 * 按可访问名取一个技能行的开关（技能行用 `skill.switchLabel`，与工具行分开）。
 * @param name - kebab-case 技能名。
 * @returns 开关元素；不存在时为 `null`。
 */
function switchOfSkill(name: string): HTMLButtonElement | null {
  return screen.queryByRole('switch', {
    name: zh['skill.switchLabel'].replace('{name}', name),
  }) as HTMLButtonElement | null
}

/**
 * 分区标题行的折叠按钮（`section.defaults` / `workspace.title` 的文案作前缀）。
 *
 * 折叠壳（`DefaultsSectionFrame`）的按钮可访问名 = 标题 + 计数摘要（`默认关 M · 残留 K`），
 * 摘要会随快照变化，所以按「标题前缀」取而不是整串比较。
 * @param title - 分区标题（`zh['section.defaults']` / `zh['workspace.title']`）。
 * @returns 折叠按钮。
 */
function frameToggleOf(title: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${title}`) }) as HTMLButtonElement
}

/**
 * 取一个默认档分区的 `<section>`（折叠壳自带的壳；分区里的查询都在它内部做）。
 * @param title - 分区标题。
 * @returns 分区根元素。
 */
function defaultsSectionOf(title: string): HTMLElement {
  const section = frameToggleOf(title).closest('section')
  if (section === null) throw new Error(`没有找到默认档分区：${title}`)
  return section
}

/**
 * 分区标题行的摘要文案（`defaults.summary` 的插值结果）。
 * @param inDefaults - 摘要里的「默认关」数。
 * @param residual - 摘要里的「残留」数。
 * @returns 完整摘要串。
 */
function summaryOf(inDefaults: number, residual: number): string {
  return zh['defaults.summary']
    .replace('{inDefaults}', String(inDefaults))
    .replace('{residual}', String(residual))
}

/**
 * 分区正文的三计数行文案（`defaults.counts` 的插值结果）。
 * @param listed - 可切换条目数（组开关 + 行开关）。
 * @param inDefaults - 「默认关」数。
 * @param residual - 「残留」数。
 * @returns 完整计数行串。
 */
function countsLineOf(listed: number, inDefaults: number, residual: number): string {
  return zh['defaults.counts']
    .replace('{listed}', String(listed))
    .replace('{inDefaults}', String(inDefaults))
    .replace('{residual}', String(residual))
}

/**
 * 按短名取一个默认档清单里的行开关（`DefaultsGroupList` 的行用 `defaults.switchLabel`，
 * 与面板第二段的会话开关分开）。
 * @param section - 该行所属的默认档分区。
 * @param name - 行短名（如 `list_projects`）。
 * @returns 开关元素。
 */
function defaultsSwitchOf(section: HTMLElement, name: string): HTMLButtonElement {
  return within(section).getByRole('switch', {
    name: zh['defaults.switchLabel'].replace('{name}', name),
  }) as HTMLButtonElement
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
    // 六段分区标题都来自本插件 locale（工作区分区的标题是 `workspace.title`）。
    for (const section of [
      'section.state',
      'section.groups',
      'section.skills',
      'section.defaults',
      'section.disabled',
    ] as const) {
      expect(screen.getByText(zh[section])).toBeDefined()
    }
    expect(screen.getByText(zh['workspace.title'])).toBeDefined()
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

describe('两态禁用（设计 §3.3）', () => {
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

  it('不再有「被其它作用域隐藏」的锁定行与计数', async () => {
    renderPanel()
    await openPanel()

    // 旧夹具里 `shadowed` 的 `web_search` 现在只是普通工具行：可点、状态由宿主快照给。
    const webSearch = switchOf('web_search')
    expect(webSearch.disabled).toBe(false)
    expect(webSearch.getAttribute('aria-checked')).toBe('true')
    // 旧摘要里的「被其它作用域隐藏 N」整条消失（口径只剩可见 / 已关）。
    expect(screen.queryByText(/被其它作用域隐藏/)).toBeNull()
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
  it('渲染两计数、持久化通道与提示码', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      notices: ['persistence-degraded', 'session-subagent'],
      stats: { visible: 7, denied: 1 },
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText('本会话可见 7')).toBeDefined()
    expect(screen.getByText('已关 1')).toBeDefined()
    expect(screen.getByText(zh['state.storeKind.record'])).toBeDefined()
    expect(screen.getByText(zh['notice.persistence-degraded'])).toBeDefined()
    expect(screen.getByText(zh['notice.session-subagent'])).toBeDefined()
  })

  it('状态摘要只渲染两计数（<li> 数 2）', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({ stats: { visible: 12, denied: 3 } })
    renderPanel({ client })
    await openPanel()

    // 只数状态摘要那一个 `<ul className=counters>`：其余分区的 `<li>`（工具行等）不算。
    const stateSection = screen.getByText(zh['section.state']).closest('section')
    const counters = stateSection?.querySelector('ul[class*="counters"]') ?? null
    expect(counters).not.toBeNull()

    const items = counters === null ? [] : Array.from(counters.querySelectorAll('li'))
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.textContent)).toEqual(['本会话可见 12', '已关 3'])
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
      stats: { visible: 7, denied: 0 },
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

describe('默认档两分区：默认收起与标题摘要（D13 / D-24）', () => {
  it('两个分区默认收起：标题按钮 aria-expanded=false，清单与开关都不在文档里，摘要按各自目标档计数', async () => {
    renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    const workspace = defaultsSectionOf(zh['workspace.title'])

    for (const section of [user, workspace]) {
      const toggle = within(section).getByRole('button')
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      // 收起态只剩标题行：没有分组清单 `<ul>`，也没有任何开关。
      expect(section.querySelectorAll('ul')).toHaveLength(0)
      expect(section.querySelectorAll('[role="switch"]')).toHaveLength(0)
    }

    // 标题行的计数摘要（D13）：收起时也看得出「有没有默认关的东西」。
    // 用户级按 `defaults.disabled` 算（1 条在宇宙里 + 1 条残留），工作区按 `workspace.disabled`
    // 算（1 条在宇宙里 + 2 条残留）——两个 M/K 不同，读错目标档会立刻对不上。
    expect(user.textContent).toContain(summaryOf(1, 1))
    expect(workspace.textContent).toContain(summaryOf(1, 2))

    // 正文（路径行 / 三计数行 / 分组清单 / 命令提示）整块不在文档里。
    expect(screen.queryByText(DEFAULTS_PATH)).toBeNull()
    expect(screen.queryByText(WORKSPACE_PATH)).toBeNull()
    expect(screen.queryAllByRole('switch', { name: /默认档开关/ })).toEqual([])
  })
})

describe('默认档两分区的展开（D13）', () => {
  it('点用户级默认档标题展开：出现路径行、三计数行、分组清单与残留区，再点收起', async () => {
    renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))
    expect(frameToggleOf(zh['section.defaults']).getAttribute('aria-expanded')).toBe('true')

    expect(within(user).getByText(zh['defaults.path'])).toBeDefined()
    expect(within(user).getByText(DEFAULTS_PATH)).toBeDefined()
    // 三计数行：listed 是**开关数**（MCP 组 1+2、技能组 1+2、内置工具 4 = 10），不是行数。
    expect(within(user).getByText(countsLineOf(10, 1, 1))).toBeDefined()
    // 分组开关清单（`DefaultsGroupList`）：MCP / 技能 / 内置三段；MCP 与技能有组开关，
    // 内置组没有组地址（宿主口径），只有行开关。
    expect(within(user).getByRole('button', { name: /^MCP 服务器/ })).toBeDefined()
    expect(
      within(user).getByRole('switch', {
        name: zh['defaults.groupSwitchLabel'].replace('{name}', 'yunxiao'),
      }),
    ).toBeDefined()
    // MCP 组在默认档清单里同样默认折叠（与面板第二段同一口径）。
    expect(within(user).getByRole('button', { name: /^MCP 服务器/ }).getAttribute('aria-expanded')).toBe('false')
    // 残留区只能移除，命令兜底说明（D8）由清单组件自己渲染。
    expect(within(user).getByText(zh['defaults.residualTitle'])).toBeDefined()
    expect(within(user).getByRole('button', { name: `${zh['defaults.remove']} mcp:figma` })).toBeDefined()
    expect(within(user).getByText(zh['defaults.cliHint'])).toBeDefined()
    // 不追溯的两句事实文案仍在本区（D18）。
    expect(within(user).getByText(zh['defaults.scope'])).toBeDefined()

    fireEvent.click(frameToggleOf(zh['section.defaults']))
    expect(frameToggleOf(zh['section.defaults']).getAttribute('aria-expanded')).toBe('false')
    expect(within(user).queryByText(DEFAULTS_PATH)).toBeNull()
  })

  it('点工作区默认档标题展开：出现工作区键、档文件路径、并集说明与分组清单，且没有下拉', async () => {
    renderPanel()
    await openPanel()

    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['workspace.title']))
    expect(frameToggleOf(zh['workspace.title']).getAttribute('aria-expanded')).toBe('true')

    expect(within(workspace).getByText(WORKSPACE_KEY)).toBeDefined()
    expect(within(workspace).getByText(WORKSPACE_PATH)).toBeDefined()
    expect(within(workspace).getByText(zh['workspace.registered'])).toBeDefined()
    // 三计数行与用户级同一个助手，但读的是 `workspace.disabled`（1 条在档 + 2 条残留）。
    expect(within(workspace).getByText(countsLineOf(10, 1, 2))).toBeDefined()
    // 并集语义（DQ2=A）与「只影响之后新建」的预期管理。
    expect(within(workspace).getByText(zh['workspace.union'])).toBeDefined()
    expect(within(workspace).getByText(zh['workspace.scope'])).toBeDefined()
    expect(within(workspace).getByText(zh['workspace.cliHint'])).toBeDefined()
    expect(within(workspace).getByRole('button', { name: /^MCP 服务器/ })).toBeDefined()
    // 分区形态没有工作区下拉（作用域恒为本会话所属工作区，code-design §3.10）。
    expect(within(workspace).queryByRole('combobox')).toBeNull()
  })
})

describe('用户级默认档的开关（updateDefaults 端点）', () => {
  it('行开关发 updateDefaults("off", [行地址])，不重拉面板快照', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))
    // 行在 MCP 组里：先把该组展开（默认档清单里 MCP 组默认收起）。
    fireEvent.click(within(user).getByRole('button', { name: /^MCP 服务器/ }))

    await act(async () => {
      fireEvent.click(defaultsSwitchOf(user, 'list_projects'))
    })

    expect(harness.client.defaultsCalls).toEqual([
      { action: 'off', addresses: ['mcp:yunxiao::list_projects'] },
    ])
    // 默认档不追溯当前会话：写默认档不重拉面板快照，也不打会话开关端点。
    expect(harness.client.panelCalls).toHaveLength(1)
    expect(harness.client.toggleCalls).toHaveLength(0)
    // 落定后给「已保存（本会话不变）」确认。
    expect(within(user).getByText(zh['defaults.saved'])).toBeDefined()
  })

  it('整组开关发行地址（mcp:<server>）', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))

    await act(async () => {
      fireEvent.click(
        within(user).getByRole('switch', {
          name: zh['defaults.groupSwitchLabel'].replace('{name}', 'yunxiao'),
        }),
      )
    })

    expect(harness.client.defaultsCalls).toEqual([{ action: 'off', addresses: ['mcp:yunxiao'] }])
  })

  it('残留地址只能移除：移除按钮发 updateDefaults("on", [残留地址])', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))

    // `mcp:figma` 不在本会话的宇宙里：只出现在残留区，操作只有一个「移除」。
    expect(within(user).getByText(zh['defaults.residualTitle'])).toBeDefined()
    await act(async () => {
      fireEvent.click(within(user).getByRole('button', { name: `${zh['defaults.remove']} mcp:figma` }))
    })

    expect(harness.client.defaultsCalls).toEqual([{ action: 'on', addresses: ['mcp:figma'] }])
    expect(harness.client.panelCalls).toHaveLength(1)
  })

  it('写失败按 error.<code> 渲染主文案（{path} 来自 details），不算保存成功', async () => {
    const client = new FakePanelClient()
    client.updateDefaultsImpl = async () => {
      throw new PanelError('defaults-unwritable', 'EACCES: permission denied', {
        path: DEFAULTS_PATH,
        reason: 'EACCES',
      })
    }
    renderPanel({ client })
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))

    await act(async () => {
      // 技能组默认展开：直接点一行技能开关，把失败留在默认档分区里。
      fireEvent.click(defaultsSwitchOf(user, 'openspec-propose'))
    })

    expect(within(user).getByText(zh['error.defaults-unwritable'].replace('{path}', DEFAULTS_PATH))).toBeDefined()
    expect(within(user).getByText('EACCES: permission denied')).toBeDefined()
    expect(within(user).queryByText(zh['defaults.saved'])).toBeNull()
  })
})

describe('技能分区（设计 §3.3 技能段 / D-7）', () => {
  it('逐技能行渲染开关，切行发出的地址是 skill:<name>', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const row = switchOfSkill('openspec-propose')
    expect(row).not.toBeNull()
    expect(row?.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      fireEvent.click(row as HTMLButtonElement)
    })

    expect(harness.client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['skill:openspec-propose'] },
    ])
  })

  it('已关且已遮蔽的技能行是可点的开关（不是锁定态），并标注实际生效', async () => {
    renderPanel()
    await openPanel()

    const row = switchOfSkill('skill-review')
    expect(row).not.toBeNull()
    expect(row?.disabled).toBe(false)
    expect(row?.getAttribute('aria-checked')).toBe('false')
    // `disabled && shadowed` = 意图已记且影子 stub 已生效，标签与「仅意图」不同。
    expect(screen.getByText(zh['skill.effective'])).toBeDefined()
    expect(screen.queryByText(zh['skill.intentOnly'])).toBeNull()
  })

  it('宿主无技能服务时整块降级成一条提示，不渲染技能开关', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({ skills: [], notices: ['skills-unavailable'] })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['skill.unavailable'])).toBeDefined()
    expect(switchOfSkill('openspec-propose')).toBeNull()
    // 降级只针对技能分面：工具面开关照常渲染。
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
  })

  it('整档 tool:skill 关闭时技能行置灰并给出提示', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: {
        disabled: ['mcp:figma', 'tool:skill'],
        snapshot: ['tool:bash'],
        seeded: true,
        updatedAt: NOW,
        storeKind: 'record',
      },
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['skill.blocked'])).toBeDefined()
    expect(switchOfSkill('openspec-propose')?.disabled).toBe(true)
  })

  it('技能行在途时禁用该行并显示「正在应用…」', async () => {
    const client = new FakePanelClient()
    const pending = deferred<ToggleValue>()
    client.toggleImpl = () => pending.promise
    renderPanel({ client })
    await openPanel()

    await act(async () => {
      fireEvent.click(switchOfSkill('openspec-propose') as HTMLButtonElement)
    })

    expect(switchOfSkill('openspec-propose')?.disabled).toBe(true)
    expect(screen.getByText(zh['skill.pending'])).toBeDefined()

    await act(async () => {
      pending.resolve(mutationValue(snapshot({
        skills: [{ name: 'openspec-propose', description: '提案工作流', disabled: true, shadowed: true }],
      })))
    })

    // 新快照回来后才恢复可点，且状态以宿主返回为准。
    expect(switchOfSkill('openspec-propose')?.disabled).toBe(false)
    expect(switchOfSkill('openspec-propose')?.getAttribute('aria-checked')).toBe('false')
  })
})

describe('工作区默认档的开关（workspace 端点）', () => {
  it('行开关发 workspace({sessionId, action:"off", addresses})，不重拉面板快照', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['workspace.title']))
    // 行在 MCP 组里：先把该组展开（默认档清单里 MCP 组默认收起）。
    fireEvent.click(within(workspace).getByRole('button', { name: /^MCP 服务器/ }))

    await act(async () => {
      fireEvent.click(defaultsSwitchOf(workspace, 'list_projects'))
    })

    expect(harness.client.workspaceCalls).toEqual([
      { sessionId: SESSION_ID, action: 'off', addresses: ['mcp:yunxiao::list_projects'] },
    ])
    // 工作区档同样不追溯当前会话：写它不重拉面板快照，也不打用户级默认档端点。
    expect(harness.client.panelCalls).toHaveLength(1)
    expect(harness.client.defaultsCalls).toHaveLength(0)
    // 宿主确认后给「已保存（本会话不变）」。
    expect(within(workspace).getByText(zh['workspace.saved'])).toBeDefined()
  })

  it('写入失败按 error.workspace-unwritable 渲染主文案（{path} 来自 details）', async () => {
    const client = new FakePanelClient()
    client.workspaceImpl = async () => {
      throw new PanelError('workspace-unwritable', 'EACCES: permission denied', {
        path: WORKSPACE_PATH,
        reason: 'EACCES',
      })
    }
    renderPanel({ client })
    await openPanel()

    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['workspace.title']))

    await act(async () => {
      fireEvent.click(defaultsSwitchOf(workspace, 'openspec-propose'))
    })

    expect(within(workspace).getByText(zh['error.workspace-unwritable'].replace('{path}', WORKSPACE_PATH))).toBeDefined()
    expect(within(workspace).getByText('EACCES: permission denied')).toBeDefined()
    expect(within(workspace).queryByText(zh['workspace.saved'])).toBeNull()
  })

  it('刷新按钮按 read 重读工作区档，workspace-unresolved 用 {subject} 插值', async () => {
    const client = new FakePanelClient()
    client.workspaceImpl = async () => {
      throw new PanelError('workspace-unresolved', 'cwd 已删除', { subject: SESSION_ID })
    }
    renderPanel({ client })
    await openPanel()

    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['workspace.title']))

    await act(async () => {
      fireEvent.click(within(workspace).getByRole('button', { name: zh['workspace.refresh'] }))
    })

    expect(client.workspaceCalls).toEqual([{ sessionId: SESSION_ID, action: 'read' }])
    expect(within(workspace).getByText(zh['error.workspace-unresolved'].replace('{subject}', SESSION_ID))).toBeDefined()
    expect(within(workspace).getByText('cwd 已删除')).toBeDefined()
    // stale-while-revalidate：旧视图保留，失败只是多一行。
    expect(within(workspace).getByText(WORKSPACE_KEY)).toBeDefined()
  })

  it('工作区无法归属（workspace===null）时只读降级：解释文案、无清单、无三计数行、清空禁用', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({ workspace: null })
    renderPanel({ client })
    await openPanel()

    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['workspace.title']))

    expect(within(workspace).getByText(zh['workspace.unresolved'])).toBeDefined()
    // 只读降级仍讲并集语义，但没有目标档就没有可数的关闭集与可点的开关。
    expect(within(workspace).getByText(zh['workspace.union'])).toBeDefined()
    expect(within(workspace).queryByText(/清单 \d+ · 默认关 \d+ · 残留 \d+/)).toBeNull()
    expect(within(workspace).queryAllByRole('switch')).toEqual([])
    expect(within(workspace).queryByRole('button', { name: /^MCP 服务器/ })).toBeNull()
    expect(within(workspace).queryByText(zh['workspace.cliHint'])).toBeNull()
    // 清空需要写入目标：`workspace === null` 时禁用（只读降级）。
    expect(
      (within(workspace).getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('默认档清单没有添加输入（D8）', () => {
  it('两个分区展开后文本框只剩内置工具过滤框，跨清单的新关走命令提示', async () => {
    renderPanel()
    await openPanel()

    const user = defaultsSectionOf(zh['section.defaults'])
    const workspace = defaultsSectionOf(zh['workspace.title'])
    fireEvent.click(frameToggleOf(zh['section.defaults']))
    fireEvent.click(frameToggleOf(zh['workspace.title']))

    // 三个文本框：面板第二段的内置过滤 + 两个分区清单各自的内置过滤；没有自由文本添加框。
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => box.getAttribute('placeholder'))).toEqual([
      zh['group.filter'],
      zh['group.filter'],
      zh['group.filter'],
    ])
    expect(screen.queryByRole('button', { name: /添加/ })).toBeNull()

    // 新关只能来自清单开关；跨清单地址由清单组件渲染命令兜底说明。
    expect(within(user).getByText(zh['defaults.cliHint'])).toBeDefined()
    expect(within(workspace).getByText(zh['workspace.cliHint'])).toBeDefined()
    expect(screen.getByText(/\/tools default off/)).toBeDefined()
    expect(screen.getByText(/\/tools workspace off/)).toBeDefined()
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
