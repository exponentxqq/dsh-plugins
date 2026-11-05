// @vitest-environment jsdom
/**
 * 工作区默认档编辑器的组件测试（任务 7.2 / T13，设计附录 §3.4、代码设计 §3.10、G7-b）
 * 与分节组件 `WorkspaceDefaultsSection` 的迁移用例（#37/#43，含「与 /tools 共用状态」回归）。
 *
 * 组件是**纯展示层**：状态、读、写都在父级（`useWorkspaceDefaults` / `PanelController`）。
 * 所以本套件只渲染真实组件、用 vi.fn 记录回调，逐条钉住 G7 出口断言：
 *
 * 1. **`dialog` 形态渲染下拉且切换触发 `onSelect('/w2')`**（section 形态没有下拉——分区的作用域
 *    恒为当前会话所属工作区，code-design §3.10）；**分节组件固定用 `dialog` 形态**，所以它
 *    保留工作区下拉（用户落档裁决 Q2=a）；
 * 2. **保存失败渲染 `error.workspace-unwritable` 文案**（失败文案由父级按 `error.<code>` 插值
 *    成 `PanelFailure`，本组件只渲染字符串；这里同时钉住词典键存在与 `{path}` 插值）；
 * 3. **section 形态无对话框壳、dialog 形态交付正文壳**（`<section>` vs 类名壳）；分节组件
 *    也不自带 `role="dialog"`——对话根由 holder 统一弹窗 `workspace-config` 提供；
 * 4. **清空 / 保存回调接控制器动作**：添加 = `onUpdate('off', addresses)`、逐项移除 =
 *    `onUpdate('on', [address])`、清空（二次确认）= `onUpdate('reset')`，与 `workspace` 端点
 *    的 action 语义一一对应。
 *
 * 另覆盖：并集说明与「只影响之后新建的会话」、工作区键/路径/登记态、损坏告警、空清单、
 * 工作区无法归属（`null`）的只读降级、在途（`saving`）禁用、已保存（`saved`）确认、刷新。
 *
 * `WorkspaceDefaultsSection` 的用例（文件末尾）：无对话框根、挂载即读一次、client 缺席渲染
 * `workspace.unavailable`、注入面每次都现取、以及**与 `/tools` 共用同一份宿主状态**的双向
 * 回归（节内写入 → `/tools` 面读到；命令面写入 → 节内刷新读到）。
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PanelSnapshot,
  WorkspaceAction,
  WorkspaceChoice,
  WorkspaceRequest,
  WorkspaceValue,
  WorkspaceView,
} from '../src/contract.ts'
import {
  WorkspaceDefaultsEditor,
  type WorkspaceDefaultsEditorProps,
} from '../src/client/WorkspaceDefaultsEditor.tsx'
import { WorkspaceDefaultsSection, type WorkspaceDefaultsSectionProps } from '../src/client/WorkspaceEntry.tsx'
import type { PanelClient } from '../src/client/panel-client.ts'
import { NS, zh } from '../src/client/locales.ts'

/** 本组件消费的转发函数（与组件内部同一类型，含共享 common 词汇）。 */
type Translate = TranslateNS<typeof NS>

afterEach(cleanup)

/** 工作区档文件的假绝对路径（只用于渲染与失败文案断言，不指向真实文件）。 */
const WS_PATH = '/fake/dsh-home/session-tool-toggle/workspaces.json'

/** 下拉可选项（宿主 `WorkspaceValue.choices` 的形状）。 */
const CHOICES: readonly WorkspaceChoice[] = [
  { key: '/w1', title: 'w1' },
  { key: '/w2', title: 'w2' },
]

/** 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值，与 locale 服务同一实现）。 */
function translate(key: Parameters<Translate>[0], params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** 一条工作区视图：默认是已登记的 `/w1`，带两条关闭项。 */
function workspaceView(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    key: '/w1',
    title: 'w1',
    registered: true,
    disabled: ['mcp:a', 'skill:x'],
    path: WS_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/** 本组件消费的三个回调。 */
interface Handlers {
  readonly onSelect: (key: string) => void
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  readonly onRefresh: () => void
}

/**
 * 渲染编辑器并返回记录回调的替身。
 * @param overrides - 需要覆盖的 props（形态、在途、失败等）。
 * @returns render 结果 + 三个 mock。
 */
function renderEditor(overrides: Partial<WorkspaceDefaultsEditorProps> = {}) {
  const handlers = {
    onSelect: vi.fn<Handlers['onSelect']>(),
    onUpdate: vi.fn<Handlers['onUpdate']>(),
    onRefresh: vi.fn<Handlers['onRefresh']>(),
  }
  const props: WorkspaceDefaultsEditorProps = {
    workspace: workspaceView(),
    choices: CHOICES,
    variant: 'section',
    saving: false,
    saved: false,
    t: translate,
    ...handlers,
    ...overrides,
  }
  return { ...render(<WorkspaceDefaultsEditor {...props} />), ...handlers }
}

describe('WorkspaceDefaultsEditor（section 形态）', () => {
  it('渲染分区根而**没有**对话框壳，也没有工作区下拉', () => {
    const { container } = renderEditor()

    expect(container.firstElementChild?.tagName).toBe('SECTION')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText(zh['workspace.title'])).toBeTruthy()
  })

  it('渲染工作区键、文件路径、登记态与关闭项清单', () => {
    renderEditor()

    expect(screen.getByText('/w1')).toBeTruthy()
    expect(screen.getByText(WS_PATH)).toBeTruthy()
    expect(screen.getByText(zh['workspace.registered'])).toBeTruthy()
    expect(screen.getByText('mcp:a')).toBeTruthy()
    expect(screen.getByText('skill:x')).toBeTruthy()
  })

  it('渲染「只影响之后新建」与并集一句说明（DQ2=A 不标注来源）', () => {
    renderEditor()

    expect(screen.getByText(zh['workspace.scope'])).toBeTruthy()
    expect(screen.getByText(zh['workspace.union'])).toBeTruthy()
    // 并集语义的三个事实都在句子里：新会话、用户级默认档、本工作区默认档。
    expect(zh['workspace.union']).toContain('新会话')
    expect(zh['workspace.union']).toContain('用户级默认档')
    expect(zh['workspace.union']).toContain('本工作区默认档')
    expect(zh['workspace.union']).toContain('∪')
  })

  it('未登记工作区显示「未登记」而不是出错', () => {
    renderEditor({ workspace: workspaceView({ registered: false }) })

    expect(screen.getByText(zh['workspace.unregistered'])).toBeTruthy()
    expect(screen.getByText('mcp:a')).toBeTruthy()
  })

  it('损坏文件显示降级告警', () => {
    renderEditor({ workspace: workspaceView({ corrupt: true }) })

    expect(screen.getByText(zh['workspace.corrupt'])).toBeTruthy()
  })

  it('空清单显示空态，清空按钮禁用', () => {
    renderEditor({ workspace: workspaceView({ disabled: [] }) })

    expect(screen.getByText(zh['workspace.empty'])).toBeTruthy()
    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('工作区无法归属（null）：只读降级，不渲染添加框与清单，但仍给并集说明', () => {
    renderEditor({ workspace: null })

    expect(screen.getByText(zh['workspace.unresolved'])).toBeTruthy()
    expect(screen.queryByLabelText(zh['workspace.addPlaceholder'])).toBeNull()
    expect(screen.queryByText('mcp:a')).toBeNull()
    expect(screen.getByText(zh['workspace.union'])).toBeTruthy()
    // 清空按钮仍在（布局稳定），但因为没有写入目标而禁用。
    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('WorkspaceDefaultsEditor（dialog 形态）', () => {
  it('渲染正文壳与工作区下拉，选中 /w2 触发 onSelect(\'/w2\')', () => {
    const { container, onSelect } = renderEditor({ variant: 'dialog' })

    expect(container.firstElementChild?.tagName).toBe('DIV')
    // 对话根的 role="dialog" 由 footer 入口的 Modal（7.3）提供；本组件只交付正文壳。
    expect(container.firstElementChild?.getAttribute('role')).toBeNull()
    expect(container.querySelector('section')).toBeNull()

    const select = screen.getByRole('combobox', { name: zh['workspace.select'] }) as HTMLSelectElement
    expect(select.value).toBe('/w1')
    expect([...select.options].map((option) => option.value)).toEqual(['/w1', '/w2'])

    fireEvent.change(select, { target: { value: '/w2' } })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('/w2')
  })

  it('未登记目标不在 choices 里时补一项选中值，不显示空白', () => {
    renderEditor({
      variant: 'dialog',
      workspace: workspaceView({ key: '/w9', title: 'w9', registered: false }),
      choices: CHOICES,
    })

    const select = screen.getByRole('combobox', { name: zh['workspace.select'] }) as HTMLSelectElement
    expect(select.value).toBe('/w9')
    expect([...select.options].map((option) => option.value)).toEqual(['/w1', '/w2', '/w9'])
  })

  it('工作区无法归属时仍可下拉切换到已登记工作区', () => {
    const { onSelect } = renderEditor({ variant: 'dialog', workspace: null })

    const select = screen.getByRole('combobox', { name: zh['workspace.select'] }) as HTMLSelectElement
    expect(select.value).toBe('')
    fireEvent.change(select, { target: { value: '/w2' } })
    expect(onSelect).toHaveBeenCalledWith('/w2')
  })
})

describe('WorkspaceDefaultsEditor 的写入动作', () => {
  it('添加框按空白/逗号切地址并提交 off（保存动作接控制器）', () => {
    const { onUpdate } = renderEditor()
    const input = screen.getByLabelText(zh['workspace.addPlaceholder']) as HTMLInputElement

    fireEvent.change(input, { target: { value: 'mcp:b, tool:c  skill' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workspace.add'] }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('off', ['mcp:b', 'tool:c', 'skill'])
    expect(input.value).toBe('')
  })

  it('回车提交添加；空输入是空操作', () => {
    const { onUpdate } = renderEditor()
    const input = screen.getByLabelText(zh['workspace.addPlaceholder'])

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'mcp:a' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('off', ['mcp:a'])
  })

  it('逐项移除提交 on（从本工作区档移出）', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', {
      name: translate('workspace.removeAria', { address: 'mcp:a' }),
    }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('on', ['mcp:a'])
  })

  it('清空是两段式：第一次只改文案，第二次才提交 reset', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.clear'] }))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: zh['workspace.clearConfirm'] })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.clearConfirm'] }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('reset')
  })

  it('刷新回调接父级 read', () => {
    const { onRefresh } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.refresh'] }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('在途（saving）时整区禁用：不渲染可点的添加/移除/清空/刷新', () => {
    renderEditor({ saving: true })

    const add = screen.getByRole('button', { name: zh['workspace.add'] }) as HTMLButtonElement
    const remove = screen.getByRole('button', {
      name: translate('workspace.removeAria', { address: 'mcp:a' }),
    }) as HTMLButtonElement
    const clear = screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement
    const refresh = screen.getByRole('button', { name: zh['workspace.refresh'] }) as HTMLButtonElement

    expect(add.disabled).toBe(true)
    expect(remove.disabled).toBe(true)
    expect(clear.disabled).toBe(true)
    expect(refresh.disabled).toBe(true)
    expect((screen.getByLabelText(zh['workspace.addPlaceholder']) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('WorkspaceDefaultsEditor 的失败与成功展示', () => {
  it('保存失败渲染 error.workspace-unwritable 文案（主文案 + 宿主原文灰字）', () => {
    const text = translate('error.workspace-unwritable', { path: WS_PATH })
    // 词典键存在且带 `{path}` 占位符：文案是规范事实，不是测试里现编的字符串。
    expect(zh['error.workspace-unwritable']).toContain('{path}')
    expect(text).toBe(`工作区默认档写入失败：${WS_PATH}。`)

    renderEditor({ failure: { text, detail: 'EACCES: permission denied' } })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).toContain('EACCES: permission denied')
  })

  it('没有失败时不渲染 alert', () => {
    renderEditor()

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('写成功渲染「已保存（本会话不变）」', () => {
    renderEditor({ saved: true })

    expect(screen.getByText(zh['workspace.saved'])).toBeTruthy()
  })

  it('工作区无法归属的失败码也有词典键（error.workspace-unresolved）', () => {
    const text = translate('error.workspace-unresolved', { subject: 'session-1' })
    expect(text).toBe('工作区无法归属：session-1。')

    renderEditor({ failure: { text } })
    expect(screen.getByRole('alert').textContent).toContain(text)
  })
})

/** 用例里那个活着的会话 id（分节默认按当前会话寻址）。 */
const SESSION_ID = 'session-1'

/** 默认档文件的假绝对路径（只在快照字段里出现，本套件不渲染它）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 分节按当前会话解析到的第一个工作区键。 */
const FIRST_KEY = '/w1'

/** 分节下拉可切换到的第二个工作区键。 */
const SECOND_KEY = '/w2'

/** 分节下拉的两项（宿主 `WorkspaceValue.choices` 的形状）。 */
const SHARED_CHOICES: readonly WorkspaceChoice[] = [
  { key: FIRST_KEY, title: 'w1' },
  { key: SECOND_KEY, title: 'w2' },
]

/**
 * 按工作区键造一份视图（关闭集按字典序，与宿主归一后的顺序一致）。
 * @param key - 工作区规范路径。
 * @param disabled - 该工作区的关闭集。
 * @returns 工作区视图。
 */
function sharedWorkspaceView(key: string, disabled: Iterable<string>): WorkspaceView {
  return {
    key,
    title: key === FIRST_KEY ? 'w1' : 'w2',
    registered: true,
    disabled: [...disabled].sort(),
    path: WS_PATH,
    readable: true,
    corrupt: false,
  }
}

/**
 * 从同一份关闭集造一个面板快照——`/tools` 面的可视快照与 `workspace` 端点读的是同一个状态。
 * @param sessionId - 目标会话。
 * @param disabled - 当前会话所属工作区的关闭集。
 * @returns 面板快照（本套件只断言 `workspace.disabled`，其余字段取最小合法值）。
 */
function sharedSnapshot(sessionId: string, disabled: readonly string[]): PanelSnapshot {
  return {
    sessionId,
    createdAt: 0,
    state: { disabled: [], snapshot: [], seeded: true, updatedAt: 0, storeKind: 'record' },
    groups: [],
    protectedNames: [],
    defaults: { version: 1, disabled: [], path: DEFAULTS_PATH, readable: true, corrupt: false },
    hiddenByOthers: [],
    intentOnly: [],
    stats: { visible: 0, catalog: 0, denied: 0, shadowed: 0 },
    notices: [],
    skills: [],
    workspace: sharedWorkspaceView(FIRST_KEY, disabled),
  }
}

/**
 * 「同一份宿主状态」的假客户端：`workspace` 端点与 `panel` 端点读写同一个
 * `disabledByWorkspace`，模拟宿主侧 `/session-tool-toggle` 通道后的同一个控制内核与同一份
 * `workspaces.json`——分节与 `/tools` 面各自只是这份状态的入口，不是第二份状态。
 */
class SharedStateClient implements PanelClient {
  /** 每次 `workspace` 的请求体（地址数组已复制）。 */
  readonly workspaceCalls: WorkspaceRequest[] = []
  /** 每次 `panel` 的 sessionId。 */
  readonly panelCalls: string[] = []
  /** 工作区键 → 关闭集（分节与 `/tools` 面写的是同一份）。 */
  readonly disabledByWorkspace = new Map<string, Set<string>>()

  /**
   * 取某个工作区的关闭集（缺失即建空集）。
   * @param key - 工作区规范路径。
   * @returns 可变的关闭集。
   */
  private disabledOf(key: string): Set<string> {
    let set = this.disabledByWorkspace.get(key)
    if (set === undefined) {
      set = new Set()
      this.disabledByWorkspace.set(key, set)
    }
    return set
  }

  async panel(sessionId: string): Promise<PanelSnapshot> {
    this.panelCalls.push(sessionId)
    return sharedSnapshot(sessionId, [...this.disabledOf(FIRST_KEY)])
  }

  async workspace(request: WorkspaceRequest): Promise<WorkspaceValue> {
    this.workspaceCalls.push({
      ...request,
      ...(request.addresses === undefined ? {} : { addresses: [...request.addresses] }),
    })
    const key = request.workspacePath ?? FIRST_KEY
    const target = this.disabledOf(key)
    const changed: string[] = []
    const action = request.action ?? 'read'
    if (action === 'off') {
      for (const address of request.addresses ?? []) {
        target.add(address)
        changed.push(address)
      }
    } else if (action === 'on') {
      for (const address of request.addresses ?? []) {
        target.delete(address)
        changed.push(address)
      }
    } else if (action === 'reset') {
      changed.push(...target)
      target.clear()
    }
    return { workspace: sharedWorkspaceView(key, target), choices: SHARED_CHOICES, changed }
  }

  // 本节只调用 `workspace`；其余端点一旦被误调用就让用例立刻失败（防止回归成第二份状态）。
  async toggle(): Promise<never> {
    throw new Error('工作区默认档分节不应调用 toggle')
  }

  async reset(): Promise<never> {
    throw new Error('工作区默认档分节不应调用 reset')
  }

  async updateDefaults(): Promise<never> {
    throw new Error('工作区默认档分节不应调用 updateDefaults')
  }
}

/**
 * 渲染分节组件。
 * @param overrides - 需要覆盖的 props（`resolveClient` / `currentSessionId` / `t`）。
 * @returns testing-library 的 render 结果。
 */
function renderSection(overrides: Partial<WorkspaceDefaultsSectionProps> = {}) {
  const props: WorkspaceDefaultsSectionProps = {
    resolveClient: () => undefined,
    currentSessionId: () => SESSION_ID,
    // 座位 owner 份额（holder 弹窗在 renderSlot 时注入；本节不消费）。
    close: () => undefined,
    t: translate,
    ...overrides,
  }
  return render(<WorkspaceDefaultsSection {...props} />)
}

describe('WorkspaceDefaultsSection（holder 统一弹窗的分节，dialog 形态）', () => {
  it('渲染正文壳而**没有**对话框根，且保留工作区下拉（Q2=a 的落档裁决）', async () => {
    const client = new SharedStateClient()
    const { container } = renderSection({ resolveClient: () => client })

    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })

    // 对话根由 holder 弹窗提供：分节不自带 role="dialog"，也不自带 <section> 分区根。
    expect(container.firstElementChild?.tagName).toBe('DIV')
    expect(container.firstElementChild?.getAttribute('role')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('section')).toBeNull()
    expect(screen.getByText(zh['workspace.title'])).toBeTruthy()
    // dialog 形态：工作区下拉仍在（去掉下拉等于删能力）。
    expect(screen.getByRole('combobox', { name: zh['workspace.select'] })).toBeTruthy()
  })

  it('挂载即读一次，请求体是当前会话的 { sessionId, action: read }', async () => {
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })

    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })
    expect(client.workspaceCalls[0]).toEqual({ sessionId: SESSION_ID, action: 'read' })
  })

  it('client 缺席（connection 未就绪）时渲染 workspace.unavailable，不发任何请求', async () => {
    renderSection({ resolveClient: () => undefined })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(zh['workspace.unavailable'])
    // 降级态没有编辑器，也就没有下拉/输入框。
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('connection 晚就绪：重开统一弹窗（分节重新挂载）后同一组件读取恢复', async () => {
    const first = renderSection({ resolveClient: () => undefined })
    await screen.findByRole('alert')
    first.unmount()

    // D8：切走 / 关闭即卸载，重开重新挂载并重读——不在失败态里留第二份缓存。
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })
    expect(screen.getByRole('combobox', { name: zh['workspace.select'] })).toBeTruthy()
  })

  it('工作区下拉切换后按 workspacePath 重读（保留 footer 时期的下拉能力）', async () => {
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })

    const select = await screen.findByRole('combobox', { name: zh['workspace.select'] })
    fireEvent.change(select, { target: { value: SECOND_KEY } })

    await waitFor(() => {
      expect(client.workspaceCalls.at(-1)).toEqual({ workspacePath: SECOND_KEY, action: 'read' })
    })
  })
})

describe('与 /tools 共用状态（零回归红线）', () => {
  it('分节内写入工作区档后，/tools 面（panel 快照）读到同一条记录', async () => {
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })

    const input = await screen.findByLabelText(zh['workspace.addPlaceholder'])
    fireEvent.change(input, { target: { value: 'mcp:new' } })
    fireEvent.click(screen.getByRole('button', { name: zh['workspace.add'] }))

    // 写走的是 `/session-tool-toggle` 的 workspace 端点，落到同一份宿主状态。
    await waitFor(() => { expect(client.disabledByWorkspace.get(FIRST_KEY)?.has('mcp:new')).toBe(true) })
    expect(client.workspaceCalls.at(-1)).toEqual({
      sessionId: SESSION_ID,
      action: 'off',
      addresses: ['mcp:new'],
    })

    // `/tools` 面（panel 快照）读的是同一份状态：同一条记录、同一个工作区键。
    const tools = await client.panel(SESSION_ID)
    expect(tools.workspace?.key).toBe(FIRST_KEY)
    expect(tools.workspace?.disabled).toContain('mcp:new')
    // 节内也显示同一条（不维护第二份关闭集）。
    expect(await screen.findByText('mcp:new')).toBeTruthy()
  })

  it('命令面写入后，分节下一次刷新读到同一状态（反之亦然）', async () => {
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })

    // 模拟 `/tools workspace off tool:cmd`：命令面写的是同一个控制内核、同一份 workspaces.json。
    await client.workspace({ sessionId: SESSION_ID, action: 'off', addresses: ['tool:cmd'] })
    // 分节不轮询、不做第二份缓存：命令面改完，节内要等一次刷新才看到。
    expect(screen.queryByText('tool:cmd')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.refresh'] }))
    expect(await screen.findByText('tool:cmd')).toBeTruthy()
    expect(client.workspaceCalls.at(-1)).toEqual({ sessionId: SESSION_ID, action: 'read' })
  })
})
