// @vitest-environment jsdom
/**
 * 会话工具面面板的浏览器半组件测试（三卡的唯一主验收套件，变更
 * 2026-11-09-session-tool-panel-rework，`code-design.md` ③3.6 / ⑤TG7 / 验证矩阵）。
 *
 * 用例全部跑**真实组件 + 真实 `PanelController`**，只在最外层把 `PanelClient` 换成记录调用的假
 * 实现（`resolveClient` 是注入面，正好是假 client 的接缝）。这样断言到的是「用户点了什么 →
 * 面板发了什么请求 → 宿主回来的快照怎么改界面」，而不是替身之间的互相调用。
 *
 * 三卡形状（cardStack 自上而下：概要卡 → 清单卡 → 命令卡，Modal footer 是动作区）：
 *
 * 1. **三卡构成**：`本会话` / `本会话开关` / `跨清单地址` 三处卡标题各 1；「恢复创建时快照」
 *    在 dialog 内的 footer；「用户级默认档」「工作区默认档」「默认档文件」三处文案都不在
 *    面板里（默认档编辑面已退出面板的最强证据）；
 * 2. **概要卡**：facts 四行（会话 / 创建时间 / 创建时快照 / 持久化通道）+ 三计数
 *    （本会话可见 / 已关 / 关闭项）+ 降级提示行；
 * 3. **清单卡**：共用 `DefaultsGroupList` 的会话形态——组开关打 `mcp:<server>`、行开关打行
 *    地址、整组关传导（组内行呈关且禁用）、技能标签两态、pending 逐行禁用、残留地址可开启、
 *    全局过滤；
 * 4. **命令卡**：共用 `CommandCard` 的复制状态机（剪贴板写入 + `aria-live` 反馈 + 2s 复位）；
 * 5. **footer 两段式恢复**：第一次点只武装确认，第二次才 `client.reset`；关闭集为空时禁用。
 *
 * 另按既有语义保留：两态禁用（保护 / 保留）、失败码文案（`error.<code>` + 二级灰字）、
 * `unavailable` / `session-not-live` 两级降级、技能服务不可用的整组降级。
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PanelSnapshot,
  SkillView,
  ToggleValue,
  ToolGroup,
  WorkspaceRequest,
  WorkspaceValue,
} from '../src/contract.ts'
import { COMMAND_PLACEHOLDER } from '../src/client/CommandCard.tsx'
import { PanelError, type PanelClient } from '../src/client/panel-client.ts'
import { ToolPanelAction, type ToolPanelActionProps } from '../src/client/ToolPanelAction.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 用例里那个活着的会话 id。 */
const SESSION_ID = 'session-1'

/** 固定时钟（epoch ms）：只用于 `createdAt` / `loadedAt`，断言不依赖具体格式。 */
const NOW = 1_700_000_000_000

/** 两条技能行：一条模型可见、一条已关且已遮蔽（`disabled && shadowed` 的标签是「实际生效」）。 */
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
    tool({ name: 'mcp__yunxiao__list_datasets', shortName: 'list_datasets', address: 'mcp:yunxiao::list_datasets' }),
  ],
}

/** 技能整档（`tool:skill` 组地址；投影后行由 `snapshot.skills` 接管）。 */
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
 * 一份最小的合法面板快照（**无** `defaults` / `workspace` 两键——wire 收缩后的九字段形状）。
 *
 * 默认带三种分组、两条技能行、会话级关闭集里的一条残留（`mcp:figma` 不在本会话清单 →
 * 只出现在残留区且同时是 `intentOnly`）。
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
    intentOnly: ['mcp:figma'],
    stats: { visible: 7, denied: 1 },
    notices: [],
    skills: SKILLS,
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
  /** 每次 `workspace` 的请求体（已复制地址数组；面板本体不再调用，断言恒空数组）。 */
  readonly workspaceCalls: WorkspaceRequest[] = []

  /** `panel` 的实现（默认成功返回 {@link snapshot}）。 */
  panelImpl: (sessionId: string) => Promise<PanelSnapshot> = async () => snapshot()
  /** `toggle` 的实现（默认成功返回同一份快照）。 */
  toggleImpl: (sessionId: string, on: boolean, addresses: readonly string[]) => Promise<ToggleValue> = async () =>
    mutationValue(snapshot())
  /** `reset` 的实现（默认成功返回同一份快照）。 */
  resetImpl: (sessionId: string) => Promise<ToggleValue> = async () => mutationValue(snapshot())
  /** `workspace` 的实现（默认拒绝：面板不提供工作区档编辑面，不该被调到）。 */
  workspaceImpl: (request: WorkspaceRequest) => Promise<WorkspaceValue> = async () => {
    throw new Error('面板不应调用 workspace 端点')
  }

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
 * 按可访问名取开关（会话形态的组开关与行开关共用 `switch.label`）。
 * @param name - 工具短名、MCP 服务器名或技能名。
 * @returns 开关元素。
 */
function switchOf(name: string): HTMLButtonElement {
  return screen.getByRole('switch', { name: zh['switch.label'].replace('{name}', name) }) as HTMLButtonElement
}

/**
 * 按 `aria-live` 载体取复制反馈行（命令卡的 `p[aria-live=polite]`）。
 * @returns 播报载体元素。
 */
function copyFeedback(): HTMLElement {
  return document.querySelector('[aria-live="polite"]') as HTMLElement
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

describe('面板三卡构成（code-design ③3.6 / 验证矩阵）', () => {
  it('三处卡标题各 1，动作区在 Modal footer 内', async () => {
    renderPanel()
    await openPanel()

    const dialog = screen.getByRole('dialog')
    // 概要卡 / 清单卡 / 命令卡的标题各出现一次。
    expect(screen.getAllByText(zh['session.title'])).toHaveLength(1)
    expect(screen.getAllByText(zh['section.groups'])).toHaveLength(1)
    expect(screen.getAllByText(zh['session.commandTitle'])).toHaveLength(1)
    // 「恢复创建时快照」在 dialog 内（footer 动作区）。
    expect(within(dialog).getByRole('button', { name: zh['disabled.reset'] })).toBeDefined()
  })

  it('面板不再渲染默认档编辑面：用户级 / 工作区级 / 默认档文件三处文案都为 null', async () => {
    renderPanel()
    await openPanel()

    // 最强「默认档编辑面已退出面板」证据：三处旧分区文案（含工作区档文件路径）都不在文档里。
    expect(screen.queryByText('用户级默认档')).toBeNull()
    expect(screen.queryByText('工作区默认档')).toBeNull()
    expect(screen.queryByText('默认档文件')).toBeNull()
  })
})

describe('概要卡：facts 四行与三计数', () => {
  it('四行事实按 dt 文案命中，dd 值来自快照', async () => {
    renderPanel()
    await openPanel()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(zh['session.id'])).toBeDefined()
    expect(within(dialog).getByText(SESSION_ID)).toBeDefined()
    expect(within(dialog).getByText(zh['session.createdAt'])).toBeDefined()
    expect(within(dialog).getByText(zh['session.snapshotCount'])).toBeDefined()
    // 创建时快照的计数（`session.count` 插值：快照夹具带一条 `tool:bash`）。
    expect(within(dialog).getByText(zh['session.count'].replace('{count}', '1'))).toBeDefined()
    expect(within(dialog).getByText(zh['session.store'])).toBeDefined()
    expect(within(dialog).getByText(zh['session.store.record'])).toBeDefined()
  })

  it('三计数按夹具数字命中（本会话可见 / 已关 / 关闭项）', async () => {
    renderPanel()
    await openPanel()

    expect(screen.getByText(zh['state.visible'].replace('{visible}', '7'))).toBeDefined()
    expect(screen.getByText(zh['state.denied'].replace('{denied}', '1'))).toBeDefined()
    expect(screen.getByText(zh['state.closedCount'].replace('{count}', '1'))).toBeDefined()
  })

  it('持久化通道与提示码按快照渲染', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      notices: ['persistence-degraded', 'session-subagent'],
      state: { disabled: ['mcp:figma'], snapshot: [], seeded: true, updatedAt: NOW, storeKind: 'memory' },
    })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['session.store.memory'])).toBeDefined()
    expect(screen.getByText(zh['notice.persistence-degraded'])).toBeDefined()
    expect(screen.getByText(zh['notice.session-subagent'])).toBeDefined()
  })

  it('刷新按钮移在概要卡头：点击后重拉面板快照', async () => {
    const { harness } = renderPanel()
    await openPanel()
    expect(harness.client.panelCalls).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['panel.refresh'] }))
    })

    expect(harness.client.panelCalls).toHaveLength(2)
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
})

describe('清单卡：组开关与行开关（验证矩阵「清单行开关 = 命令面状态」）', () => {
  it('点组开关发出的地址是 mcp:<server>，且点击开关不折叠分组', async () => {
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

  it('点行开关打行地址，并在 pending 期间禁用该行、显示「正在应用…」', async () => {
    const client = new FakePanelClient()
    const pending = deferred<ToggleValue>()
    client.toggleImpl = () => pending.promise
    renderPanel({ client })
    await openPanel()

    // 行在 MCP 组里：先展开该组（MCP 组默认折叠）。
    fireEvent.click(screen.getByRole('button', { name: /MCP 服务器/ }))

    await act(async () => {
      fireEvent.click(switchOf('list_datasets'))
    })

    expect(client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['mcp:yunxiao::list_datasets'] },
    ])
    expect(switchOf('list_datasets').disabled).toBe(true)
    expect(screen.getByText(zh['toggle.pending'])).toBeDefined()
    // 在途只禁用本行：其他行仍可点。
    expect(switchOf('web_search').disabled).toBe(false)

    await act(async () => {
      pending.resolve(mutationValue(snapshot()))
    })

    // 宿主快照回来后才恢复可点，且开关状态以宿主返回为准（不做乐观更新）。
    expect(switchOf('list_datasets').disabled).toBe(false)
    expect(switchOf('list_datasets').getAttribute('aria-checked')).toBe('true')
  })

  it('切技能行的地址是 skill:<name>（技能并入清单卡，D3=a）', async () => {
    const { harness } = renderPanel()
    await openPanel()

    // 技能组默认展开：行开关直接可点。
    await act(async () => {
      fireEvent.click(switchOf('openspec-propose'))
    })

    expect(harness.client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: false, addresses: ['skill:openspec-propose'] },
    ])
  })
})

describe('清单卡：整组关传导（验证矩阵 / D-04）', () => {
  it('整组关时组开关呈关、组内行呈关且禁用，并带「整组已关」标签', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: {
        disabled: ['mcp:yunxiao', 'mcp:figma'],
        snapshot: ['tool:bash'],
        seeded: true,
        updatedAt: NOW,
        storeKind: 'record',
      },
    })
    renderPanel({ client })
    await openPanel()

    // 组开关呈关。
    expect(switchOf('yunxiao').getAttribute('aria-checked')).toBe('false')
    // 组内行呈关且禁用（MCP 组折叠中，先展开再取行）。
    fireEvent.click(screen.getByRole('button', { name: /MCP 服务器/ }))
    const row = switchOf('get_current_user')
    expect(row.disabled).toBe(true)
    expect(row.getAttribute('aria-checked')).toBe('false')
    expect(row.getAttribute('title')).toBe(zh['session.groupOff'])
    // 每行带「整组已关」标签（开关 title 与行内标签同句，两行各一枚）。
    expect(screen.getAllByText(zh['session.groupOff']).length).toBeGreaterThanOrEqual(1)
    // 组开关本身仍可点：它是把整组拿出来的入口。
    expect(switchOf('yunxiao').disabled).toBe(false)
  })

  it('整档 tool:skill 关闭时技能行置灰并给出提示（D-08）', async () => {
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
    expect(switchOf('openspec-propose')?.disabled).toBe(true)
  })

  it('宿主无技能服务时技能组只留整档开关与降级提示，不渲染技能行', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({ skills: [], notices: ['skills-unavailable'] })
    renderPanel({ client })
    await openPanel()

    expect(screen.getByText(zh['skill.unavailable'])).toBeDefined()
    expect(screen.queryByRole('switch', { name: zh['switch.label'].replace('{name}', 'openspec-propose') })).toBeNull()
    // 降级只针对技能分面：工具面开关照常渲染。
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0)
  })
})

describe('清单卡：技能标签两态（验证矩阵 / D-08）', () => {
  it('已关且已遮蔽 → 「模型不可见（/name 仍可用）」；已关未遮蔽 → 「已记录，暂未生效」', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: {
        disabled: ['mcp:figma', 'skill:skill-review', 'skill:draft'],
        snapshot: ['tool:bash'],
        seeded: true,
        updatedAt: NOW,
        storeKind: 'record',
      },
      skills: [
        { name: 'skill-review', description: '', disabled: true, shadowed: true },
        { name: 'draft', description: '草稿技能', disabled: true, shadowed: false },
      ],
    })
    renderPanel({ client })
    await openPanel()

    // `disabled ∧ shadowed`：stub 已实际生效。
    expect(screen.getByText(zh['skill.effective'])).toBeDefined()
    // `disabled ∧ ¬shadowed`：意图已记、影子没挂上。
    expect(screen.getByText(zh['skill.intentOnly'])).toBeDefined()
    // 两行都是可点的开关（不是锁定态）。
    expect(switchOf('skill-review').disabled).toBe(false)
    expect(switchOf('draft').disabled).toBe(false)
  })
})

describe('清单卡：残留区与暂无匹配（D-04 / 验证矩阵「残留地址可开启」）', () => {
  it('残留地址出现在残留区，点「开启」发出 toggle(true, [地址])', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: {
        disabled: ['mcp:figma', 'skill:ghost'],
        snapshot: ['tool:bash'],
        seeded: true,
        updatedAt: NOW,
        storeKind: 'record',
      },
      intentOnly: ['mcp:figma'],
    })
    const { harness } = renderPanel({ client })
    await openPanel()

    // 残留区标题与会话形态的动作文案（「开启」，不是默认档形态的「移除」）。
    expect(screen.getByText(zh['session.residualTitle'])).toBeDefined()
    expect(screen.getByText('skill:ghost')).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: zh['disabled.enableAria'].replace('{address}', 'skill:ghost') }))
    })

    expect(harness.client.toggleCalls).toEqual([
      { sessionId: SESSION_ID, on: true, addresses: ['skill:ghost'] },
    ])
  })

  it('命中 0 个注册名的清单行带「暂无匹配」标签与读屏理由', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: {
        disabled: ['mcp:figma', 'tool:web_search'],
        snapshot: ['tool:bash'],
        seeded: true,
        updatedAt: NOW,
        storeKind: 'record',
      },
      intentOnly: ['tool:web_search'],
    })
    renderPanel({ client })
    await openPanel()

    // 内置组默认展开：`tool:web_search` 行带「暂无匹配」标签，`title` 是读屏理由。
    const tag = screen.getByText(zh['entry.intentOnly'])
    expect(tag.getAttribute('title')).toBe(zh['disabled.intentOnly'])
  })
})

describe('清单卡：全局过滤（③3.4 页面能力进面板）', () => {
  it('过滤框按行命中保留整组，不发任何请求', async () => {
    const { harness } = renderPanel()
    await openPanel()

    fireEvent.change(screen.getByPlaceholderText(zh['session.filter']), { target: { value: 'run' } })

    // 'run' 命中 run_code 行：行命中保留整组（不筛行，未命中的 bash 行仍在展示面）。
    expect(switchOf('run_code')).toBeDefined()
    expect(screen.queryByRole('switch', { name: zh['switch.label'].replace('{name}', 'bash') })).toBeDefined()
    // 过滤只改展示：面板只在打开时拉过一次快照，未发任何 toggle。
    expect(harness.client.panelCalls).toHaveLength(1)
    expect(harness.client.toggleCalls).toHaveLength(0)
  })

  it('过滤把全部组清空时给「没有匹配」空态，残留区仍按地址参与筛选', async () => {
    renderPanel()
    await openPanel()

    fireEvent.change(screen.getByPlaceholderText(zh['session.filter']), { target: { value: '不存在的词' } })

    expect(screen.getByText(zh['defaults.filterEmpty'].replace('{query}', '不存在的词'))).toBeDefined()
    // 残留 chip 按地址再筛：'mcp:figma' 不含查询词而隐藏。
    expect(screen.queryByText('mcp:figma')).toBeNull()
  })
})

describe('命令卡：复制（D-05 / 验证矩阵「命令卡复制」）', () => {
  it('点复制按钮写入剪贴板，aria-live 播报「已复制」，2s 后复位', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.useFakeTimers()
    try {
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
      })
      await act(async () => {})

      const dialog = screen.getByRole('dialog')
      const code = dialog.querySelector('pre > code')
      expect(code).not.toBeNull()
      // 命令模板 = 注释行 + `/tools off <address>` 占位。
      expect(code?.textContent).toBe(`# ${zh['session.commandComment']}\n/tools off ${COMMAND_PLACEHOLDER}`)

      const copyButton = within(dialog).getByRole('button', { name: zh['command.copy'] })
      await act(async () => {
        fireEvent.click(copyButton)
      })

      // 写入参数 === 代码块文本；反馈只由 aria-live 载体播报，按钮文案恒定。
      expect(writeText).toHaveBeenCalledWith(code?.textContent)
      expect(copyFeedback().textContent).toBe(zh['command.copied'])
      expect(copyButton.textContent).toBe(zh['command.copy'])
      // 成功态按钮 disabled（挡复位前的重复点击）。
      expect((copyButton as HTMLButtonElement).disabled).toBe(true)

      // 2s 后自动回到空闲：播报清空、按钮恢复可点。
      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      expect(copyFeedback().textContent).toBe('')
      expect((within(dialog).getByRole('button', { name: zh['command.copy'] }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })

  it('剪贴板缺席或拒绝时播报「复制失败」，按钮保持可点', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.useFakeTimers()
    try {
      renderPanel()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: TRIGGER_LABEL }))
      })
      await act(async () => {})

      const dialog = screen.getByRole('dialog')
      const copyButton = within(dialog).getByRole('button', { name: zh['command.copy'] })
      await act(async () => {
        fireEvent.click(copyButton)
      })

      expect(copyFeedback().textContent).toBe(zh['command.copyFailed'])
      // 失败态保持可点，便于立即重试。
      expect((copyButton as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })
})

describe('footer：两段式恢复（D-07 / 验证矩阵）', () => {
  it('第一次点只武装确认（reset 未调用），第二次才发出 client.reset(SESSION_ID)', async () => {
    const { harness } = renderPanel()
    await openPanel()

    const dialog = screen.getByRole('dialog')
    const resetButton = within(dialog).getByRole('button', { name: zh['disabled.reset'] }) as HTMLButtonElement

    // 第一次点：文案变「再点一次确认恢复」，不发请求。
    await act(async () => {
      fireEvent.click(resetButton)
    })
    expect(within(dialog).getByRole('button', { name: zh['disabled.resetConfirm'] })).toBeDefined()
    expect(harness.client.resetCalls).toEqual([])

    // 第二次点：发出 reset，文案回到初始态。
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: zh['disabled.resetConfirm'] }))
    })

    expect(harness.client.resetCalls).toEqual([SESSION_ID])
    expect(within(dialog).getByRole('button', { name: zh['disabled.reset'] })).toBeDefined()
  })

  it('关闭集为空时恢复按钮 disabled（没有可恢复的东西）', async () => {
    const client = new FakePanelClient()
    client.panelImpl = async () => snapshot({
      state: { disabled: [], snapshot: [], seeded: true, updatedAt: NOW, storeKind: 'record' },
      intentOnly: [],
      stats: { visible: 8, denied: 0 },
    })
    renderPanel({ client })
    await openPanel()

    const dialog = screen.getByRole('dialog')
    const resetButton = within(dialog).getByRole('button', { name: zh['disabled.reset'] }) as HTMLButtonElement
    expect(resetButton.disabled).toBe(true)
  })
})

describe('失败码文案（设计 §3.5 / D-09 迁出后同一渲染规则）', () => {
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
    // 失败不销毁面板：快照还在，开关仍然渲染（stale-while-revalidate）。
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
