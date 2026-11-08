// @vitest-environment jsdom
/**
 * 工作区默认档编辑器的组件测试（任务 9.5 / TS12，code-design ③ 3.19、D10 / D11 / D13、G7-b / G8；
 * 页面化适配见 code-design §1.3 / §3.9，变更 `2026-11-08-workspace-config-page` 任务 4.3）。
 *
 * 组件仍是**纯展示层**：状态、读、写都在父级（`useWorkspaceDefaults` / `PanelController`）。
 * 本套件只渲染真实组件、用 `vi.fn` 记录回调，逐条钉住 TS12 的出口断言面：
 *
 * 1. **两形态**：`section` 形态走 `DefaultsSectionFrame`——默认收起、标题行带计数摘要、点开
 *    才有正文（键/路径/三计数/分组清单）；`dialog` 形态是 holder 页面的分节正文——自带
 *    `<h3>`，但没有 `role="dialog"`（页面骨架由 holder 提供）。**两形态都不再有工作区下拉**：
 *    选择动作归 holder 页面的唯一选择框，节内只消费选中结果（`queryByRole('combobox')` 恒为
 *    `null`，code-design §1.3「删除节内工作区下拉」/ §3.9「props 删 `choices` / `onSelect`」）。
 * 2. **分组清单**（与用户级默认档共用 `DefaultsGroupList`）：组开关打组地址
 *    （`mcp:a` / `tool:skill`）、行开关打行地址（`mcp:a::x`）；锁态两行（保护名单 / 保留名）
 *    与「整组在档」的行禁用并带 `整组默认关` 标签；残留地址只能移除，界面上**没有任何自由
 *    文本添加入口**（跨清单的新关走 `workspace.cliHint` 里的命令）。旧的自由文本添加链用例
 *    （添加框切分 / 回车 / 空输入）与对应语言键断言已整段删除。
 * 3. **三计数与摘要**读同一份 `(universe, disabled)`：正文是整串
 *    `清单 N · 默认关 M · 残留 K`，标题行摘要 `默认关 M · 残留 K` 是它的子串。
 * 4. **降级**：`workspace === null` 只留 `workspace.unresolved`（不渲染三计数与清单）；
 *    `universe === null` 只留 `defaults.universeUnavailable` + 残留区 + 命令提示。
 * 5. **`WorkspaceDefaultsSection`**（文件末尾）：份额三态——`{kind:'workspace',…}` 按
 *    `{workspacePath}` 寻址读一次、`{kind:'unassigned'}` / `{kind:'none'}` 渲染
 *    `workspace.noTarget` 空态且**不发请求**；`key={path}` 让「换工作区 = 重挂重读」；client
 *    缺席 / 晚就绪的降级，以及「与 `/tools` 共用同一份宿主状态」的双向回归。
 *
 * 每个开关都是一次立即写入（宿主 `workspaces.json`）：`off` = 加入本工作区档、`on` = 移出、
 * `reset` = 清空本工作区条目；失败/成功展示沿用面板容器的唯一失败形状 {@link PanelFailure}。
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DefaultsEntry,
  DefaultsUniverse,
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

/** 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值，与 locale 服务同一实现）。 */
function translate(key: Parameters<Translate>[0], params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/**
 * 造一条默认档条目（三组夹具共用）。
 * @param address - 规范形地址（行地址）。
 * @param shortName - 展示用短名。
 * @param overrides - 需要改写的字段。
 * @returns 默认档条目。
 */
function defaultsEntry(address: string, shortName: string, overrides: Partial<DefaultsEntry> = {}): DefaultsEntry {
  return { address, shortName, protected: false, reserved: false, ...overrides }
}

/**
 * 三组齐全的最小宇宙（mcp 组两行 + 技能组两行 + 内置工具组两行）。
 *
 * 可切换地址共 8 个：`mcp:a` 组开关 + `mcp:a::x` / `mcp:a::y` 两行 + `tool:skill` 组开关 +
 * `skill:alpha` / `skill:beta` 两行 + `tool:bash` / `tool:run_code` 两行（`builtin` 组没有组
 * 地址，只有行开关）。内置工具组的两行分别命中保护名单与保留名，供锁态断言使用。
 */
const UNIVERSE: DefaultsUniverse = {
  layerReady: true,
  skillsAvailable: true,
  groups: [
    {
      kind: 'mcp',
      key: 'a',
      address: 'mcp:a',
      tools: [defaultsEntry('mcp:a::x', 'x'), defaultsEntry('mcp:a::y', 'y', { description: 'Y 工具' })],
    },
    {
      kind: 'skill',
      key: 'skill',
      address: 'tool:skill',
      tools: [defaultsEntry('skill:alpha', 'alpha'), defaultsEntry('skill:beta', 'beta')],
    },
    {
      kind: 'builtin',
      key: 'builtin',
      address: null,
      tools: [
        defaultsEntry('tool:bash', 'bash', { protected: true }),
        defaultsEntry('tool:run_code', 'run_code', { reserved: true }),
      ],
    },
  ],
}

/**
 * 默认的关闭集：**组地址 + 行地址 + 残留地址**各一条，覆盖三计数与「整组在档」两种语义。
 *
 * 三计数：listed = 8（上面的 8 个开关地址）；`mcp:a` 与 `mcp:a::y` 在宇宙里 → 默认关 2；
 * `legacy:retired` 不在宇宙里 → 残留 1。因此正文整串是「清单 8 · 默认关 2 · 残留 1」。
 */
const DEFAULT_DISABLED: readonly string[] = ['legacy:retired', 'mcp:a', 'mcp:a::y']

/**
 * 一条工作区视图：默认是已登记的 `/w1`，关闭集见 {@link DEFAULT_DISABLED}。
 * @param overrides - 需要改写的字段。
 * @returns 工作区视图。
 */
function workspaceView(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    key: '/w1',
    title: 'w1',
    registered: true,
    disabled: [...DEFAULT_DISABLED],
    path: WS_PATH,
    readable: true,
    corrupt: false,
    ...overrides,
  }
}

/** 本组件消费的两个回调（下拉的 `onSelect` 随节内选择框一起删除，code-design §3.9）。 */
interface Handlers {
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  readonly onRefresh: () => void
}

/**
 * 渲染编辑器并返回记录回调的替身。
 *
 * `rerenderEditor` 复用同一组 mock 重新渲染（受控组件的「再点一次」用例需要父级把新状态
 * 写回 props，例如组开关从 `off` 变成 `on`）。
 * @param overrides - 需要覆盖的 props（形态、宇宙、在途、失败等）。
 * @returns render 结果 + 两个 mock + 重新渲染助手。
 */
function renderEditor(overrides: Partial<WorkspaceDefaultsEditorProps> = {}) {
  const handlers: Handlers = {
    onUpdate: vi.fn<Handlers['onUpdate']>(),
    onRefresh: vi.fn<Handlers['onRefresh']>(),
  }
  const base: WorkspaceDefaultsEditorProps = {
    workspace: workspaceView(),
    universe: UNIVERSE,
    variant: 'section',
    saving: false,
    saved: false,
    t: translate,
    ...handlers,
    ...overrides,
  }
  const view = render(<WorkspaceDefaultsEditor {...base} />)
  return {
    ...view,
    ...handlers,
    rerenderEditor(next: Partial<WorkspaceDefaultsEditorProps>): void {
      view.rerender(<WorkspaceDefaultsEditor {...base} {...next} />)
    },
  }
}

/**
 * 分区标题行的折叠按钮。
 *
 * 折叠壳（`DefaultsSectionFrame`）的按钮可访问名 = 标题 + 计数摘要（`默认关 M · 残留 K`），
 * 摘要随档读数变化，所以按「标题前缀」取而不是整串比较。
 * @returns 折叠按钮。
 */
function frameToggle(): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${zh['workspace.title']}`) }) as HTMLButtonElement
}

/** 展开分区（已展开时不再点，保证用例幂等）。 */
function expandFrame(): void {
  if (frameToggle().getAttribute('aria-expanded') !== 'true') fireEvent.click(frameToggle())
}

/**
 * 分组标题行的展开按钮（`MCP 服务器` / `技能` / `内置工具` 前缀）。
 * @param title - 分组标题（`groupTitle` 的产物）。
 * @returns 展开按钮。
 */
function groupToggleOf(title: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${title}`) }) as HTMLButtonElement
}

/**
 * 展开一个分组（已展开时不再点）。
 * @param title - 分组标题。
 */
function expandGroup(title: string): void {
  const toggle = groupToggleOf(title)
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

/**
 * 按组名取整组开关的可访问名（`defaults.groupSwitchLabel`）。
 * @param name - MCP 组用 serverName，技能组用组标题。
 * @returns 整组开关。
 */
function groupSwitchOf(name: string): HTMLButtonElement {
  return screen.getByRole('switch', {
    name: translate('defaults.groupSwitchLabel', { name }),
  }) as HTMLButtonElement
}

/**
 * 按短名取清单行开关的可访问名（`defaults.switchLabel`）。
 * @param name - 行短名。
 * @returns 行开关。
 */
function rowSwitchOf(name: string): HTMLButtonElement {
  return screen.getByRole('switch', {
    name: translate('defaults.switchLabel', { name }),
  }) as HTMLButtonElement
}

/**
 * 分区标题行的摘要文案（`defaults.summary` 的插值结果）。
 * @param inDefaults - 「默认关」数。
 * @param residual - 「残留」数。
 * @returns 完整摘要串。
 */
function summaryOf(inDefaults: number, residual: number): string {
  return zh['defaults.summary']
    .replace('{inDefaults}', String(inDefaults))
    .replace('{residual}', String(residual))
}

/**
 * 正文的三计数行文案（`defaults.counts` 的插值结果）。
 * @param listed - 可切换条目数（组开关 + 行开关，不是行数）。
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

describe('WorkspaceDefaultsEditor（section 形态）', () => {
  it('分区默认收起：aria-expanded=false，正文（键/三计数/组清单/开关）都不在文档里', () => {
    renderEditor()

    const toggle = frameToggle()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // 收起态标题行仍给摘要（收起的默认档不是黑盒）。
    expect(toggle.textContent).toContain(summaryOf(2, 1))

    expect(screen.queryByText(WS_PATH)).toBeNull()
    expect(screen.queryByText(countsLineOf(8, 2, 1))).toBeNull()
    expect(screen.queryByText('MCP 服务器')).toBeNull()
    expect(screen.queryAllByRole('switch')).toEqual([])
  })

  it('点击标题行展开（再点收起）：正文出现', () => {
    renderEditor()

    fireEvent.click(frameToggle())
    expect(frameToggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(WS_PATH)).toBeTruthy()
    expect(screen.getByText(countsLineOf(8, 2, 1))).toBeTruthy()
    expect(groupToggleOf('MCP 服务器')).toBeTruthy()

    fireEvent.click(frameToggle())
    expect(frameToggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(WS_PATH)).toBeNull()
  })

  it('展开后渲染工作区键、档文件路径与登记态', () => {
    renderEditor()
    expandFrame()

    expect(screen.getByText('/w1')).toBeTruthy()
    expect(screen.getByText(WS_PATH)).toBeTruthy()
    expect(screen.getByText(zh['workspace.registered'])).toBeTruthy()
  })

  it('三计数行按整串渲染（清单 8 · 默认关 2 · 残留 1）', () => {
    renderEditor()
    expandFrame()

    // 整串匹配：摘要行 `默认关 2 · 残留 1` 是它的子串，按整串取才不会双命中。
    expect(screen.getByText(countsLineOf(8, 2, 1))).toBeTruthy()
    expect(screen.getByText(summaryOf(2, 1))).toBeTruthy()
  })

  it('展开后仍有作用域与并集说明（DQ2=A）', () => {
    renderEditor()
    expandFrame()

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
    expandFrame()

    expect(screen.getByText(zh['workspace.unregistered'])).toBeTruthy()
    // 未登记不影响清单：组开关仍可写。
    expect(groupSwitchOf('a')).toBeTruthy()
  })

  it('损坏文件显示降级告警', () => {
    renderEditor({ workspace: workspaceView({ corrupt: true }) })
    expandFrame()

    expect(screen.getByText(zh['workspace.corrupt'])).toBeTruthy()
  })

  it('空清单：清空按钮禁用，且没有残留区', () => {
    renderEditor({ workspace: workspaceView({ disabled: [] }) })
    expandFrame()

    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(zh['defaults.residualTitle'])).toBeNull()
    expect(screen.getByText(countsLineOf(8, 0, 0))).toBeTruthy()
  })

  it('工作区无法归属（null）：只读降级，不渲染三计数与清单', () => {
    renderEditor({ workspace: null })
    expandFrame()

    expect(screen.getByText(zh['workspace.unresolved'])).toBeTruthy()
    expect(screen.queryByText(/^清单/)).toBeNull()
    expect(screen.queryAllByRole('switch')).toEqual([])
    expect(screen.getByText(zh['workspace.union'])).toBeTruthy()
    // 清空按钮仍在（布局稳定），但因为没有写入目标而禁用；摘要按空档求值。
    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(frameToggle().textContent).toContain(summaryOf(0, 0))
  })

  it('universe=null：只留降级说明 + 残留区 + 命令提示，不渲染组清单', () => {
    renderEditor({ universe: null })
    expandFrame()

    expect(screen.getByText(zh['defaults.universeUnavailable'])).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toEqual([])
    expect(screen.getByText(zh['defaults.residualTitle'])).toBeTruthy()
    expect(screen.getByText('legacy:retired')).toBeTruthy()
    // 宇宙不可用：listed=0、inDefaults=0、residual=|disabled|=3。
    expect(screen.getByText(countsLineOf(0, 0, 3))).toBeTruthy()
    expect(screen.getByText(zh['workspace.cliHint'])).toBeTruthy()
  })

  it('没有自由文本添加入口：唯一输入框是内置工具过滤，命令兜底提示在场', () => {
    const { container } = renderEditor()
    expandFrame()
    // 内置工具组默认展开；显式再展开一次让「唯一输入框」不依赖默认展开口径。
    expandGroup(zh['group.builtin'])

    const inputs = [...container.querySelectorAll('input')]
    expect(inputs).toHaveLength(1)
    expect(inputs[0].getAttribute('placeholder')).toBe(zh['group.filter'])
    expect(inputs[0].getAttribute('aria-label')).toBe(zh['group.filter'])
    // 跨清单的新关只走命令，说明文案在清单组件内部（G8 handoff，本组件不重复渲染）。
    expect(screen.getByText(zh['workspace.cliHint'])).toBeTruthy()
  })

  it('分区形态没有工作区下拉（作用域恒为本页面选中的工作区）', () => {
    renderEditor()
    expandFrame()

    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('WorkspaceDefaultsEditor 的开关写入动作', () => {
  it('整组开关提交 off：MCP 组 → addresses ["mcp:a"]', () => {
    const { onUpdate } = renderEditor({ workspace: workspaceView({ disabled: [] }) })
    expandFrame()

    fireEvent.click(groupSwitchOf('a'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('off', ['mcp:a'])
  })

  it('整组已在档时再点一次提交 on（受控回写后）', () => {
    const { onUpdate, rerenderEditor } = renderEditor({ workspace: workspaceView({ disabled: [] }) })
    expandFrame()

    fireEvent.click(groupSwitchOf('a'))
    expect(onUpdate).toHaveBeenLastCalledWith('off', ['mcp:a'])

    // 父级把写入结果写回 props：组开关由开变关（与真实受控链一致）。
    rerenderEditor({ workspace: workspaceView({ disabled: ['mcp:a'] }) })
    expect(groupSwitchOf('a').getAttribute('aria-checked')).toBe('false')

    fireEvent.click(groupSwitchOf('a'))
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenLastCalledWith('on', ['mcp:a'])
  })

  it('行开关提交 off：mcp:a::x（行在 MCP 组里，先展开组）', () => {
    const { onUpdate } = renderEditor({ workspace: workspaceView({ disabled: [] }) })
    expandFrame()
    expandGroup('MCP 服务器')

    fireEvent.click(rowSwitchOf('x'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('off', ['mcp:a::x'])
  })

  it('技能组的整组开关提交 off：tool:skill', () => {
    const { onUpdate } = renderEditor({ workspace: workspaceView({ disabled: [] }) })
    expandFrame()

    fireEvent.click(groupSwitchOf('技能'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('off', ['tool:skill'])
  })

  it('锁态行禁用：保护名单与保留名各一行（带短标签与理由）', () => {
    renderEditor()
    expandFrame()

    const protectedSwitch = rowSwitchOf('bash')
    expect(protectedSwitch.disabled).toBe(true)
    expect(protectedSwitch.title).toBe(zh['badge.protected'])
    expect(protectedSwitch.getAttribute('aria-checked')).toBe('true')

    const reservedSwitch = rowSwitchOf('run_code')
    expect(reservedSwitch.disabled).toBe(true)
    expect(reservedSwitch.title).toBe(zh['badge.reserved'])

    expect(screen.getByText(zh['entry.protected'])).toBeTruthy()
    expect(screen.getByText(zh['entry.reserved'])).toBeTruthy()
  })

  it('整组关闭（disabled 含 mcp:a）：组内行禁用 + 「整组默认关」标签，组开关本身仍可点', () => {
    renderEditor()
    expandFrame()
    expandGroup('MCP 服务器')

    // 组头计数按**行数**（G8 裁定 P1）：2 行、其中 1 行在档（mcp:a::y）。
    expect(groupToggleOf('MCP 服务器').textContent).toContain(
      `${zh['defaults.groupCount'].replace('{count}', '2')} · ${zh['defaults.groupInDefaults'].replace('{count}', '1')}`,
    )

    for (const name of ['x', 'y']) {
      const row = rowSwitchOf(name)
      expect(row.disabled).toBe(true)
      expect(row.title).toBe(zh['defaults.groupOff'])
    }
    expect(screen.getAllByText(zh['defaults.groupOff'])).toHaveLength(2)

    // 组开关是把整组从档里拿掉的入口：它自己不因整组在档而禁用。
    const group = groupSwitchOf('a')
    expect(group.disabled).toBe(false)
    expect(group.getAttribute('aria-checked')).toBe('false')
  })

  it('残留区只读可移除：chip 只有移除按钮，移除提交 on', () => {
    const { onUpdate } = renderEditor()
    expandFrame()

    expect(screen.getByText(zh['defaults.residualTitle'])).toBeTruthy()
    const chip = screen.getByText('legacy:retired').closest('li')
    expect(chip).not.toBeNull()
    // 残留 chip 内部没有任何输入框：只能移除，不能就地改写地址。
    expect(chip?.querySelector('input')).toBeNull()
    expect(chip?.querySelectorAll('button')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', {
      name: translate('workspace.removeAria', { address: 'legacy:retired' }),
    }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('on', ['legacy:retired'])
  })

  it('清空是两段式：第一次只改文案，第二次才提交 reset', () => {
    const { onUpdate } = renderEditor()
    expandFrame()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.clear'] }))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: zh['workspace.clearConfirm'] })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.clearConfirm'] }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('reset')
  })

  it('刷新回调接父级 read', () => {
    const { onRefresh } = renderEditor()
    expandFrame()

    fireEvent.click(screen.getByRole('button', { name: zh['workspace.refresh'] }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('在途（saving）整区禁用：组开关/行开关/残留移除/清空/刷新', () => {
    renderEditor({ saving: true })
    expandFrame()

    expect(groupSwitchOf('a').disabled).toBe(true)
    expect(rowSwitchOf('alpha').disabled).toBe(true)
    expect((screen.getByRole('button', {
      name: translate('workspace.removeAria', { address: 'legacy:retired' }),
    }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: zh['workspace.refresh'] }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('WorkspaceDefaultsEditor（dialog 形态）', () => {
  it('渲染正文壳：<h3> 标题 + 正文，没有对话框根，也没有节内工作区下拉', () => {
    const { container } = renderEditor({ variant: 'dialog' })

    expect(container.firstElementChild?.tagName).toBe('DIV')
    // 对话根由 holder 的页面骨架提供；本组件只交付正文壳。
    expect(container.firstElementChild?.getAttribute('role')).toBeNull()
    expect(container.querySelector('section')).toBeNull()
    expect(screen.getByRole('heading', { name: zh['workspace.title'], level: 3 })).toBeTruthy()
    // 工作区选择框已上移到 holder 页面：节内不再有 combobox（code-design §1.3 / §3.9）。
    expect(screen.queryByRole('combobox')).toBeNull()
    // 正文仍在：键、档文件路径、作用域与并集说明。
    expect(screen.getByText('/w1')).toBeTruthy()
    expect(screen.getByText(WS_PATH)).toBeTruthy()
    expect(screen.getByText(zh['workspace.scope'])).toBeTruthy()
    expect(screen.getByText(zh['workspace.union'])).toBeTruthy()
  })

  it('工作区无法归属（null）时只读降级，仍然没有下拉', () => {
    renderEditor({ variant: 'dialog', workspace: null })

    expect(screen.getByText(zh['workspace.unresolved'])).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    // 没有写入目标：清空按钮禁用（布局稳定）。
    expect((screen.getByRole('button', { name: zh['workspace.clear'] }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('WorkspaceDefaultsEditor 的失败与成功展示', () => {
  it('保存失败渲染 error.workspace-unwritable 文案（主文案 + 宿主原文灰字）', () => {
    const text = translate('error.workspace-unwritable', { path: WS_PATH })
    // 词典键存在且带 `{path}` 占位符：文案是规范事实，不是测试里现编的字符串。
    expect(zh['error.workspace-unwritable']).toContain('{path}')
    expect(text).toBe(`工作区默认档写入失败：${WS_PATH}。`)

    renderEditor({ variant: 'dialog', failure: { text, detail: 'EACCES: permission denied' } })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).toContain('EACCES: permission denied')
  })

  it('没有失败时不渲染 alert', () => {
    renderEditor({ variant: 'dialog' })

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('写成功渲染「已保存（本会话不变）」', () => {
    renderEditor({ variant: 'dialog', saved: true })

    expect(screen.getByText(zh['workspace.saved'])).toBeTruthy()
  })

  it('工作区无法归属的失败码也有词典键（error.workspace-unresolved）', () => {
    const text = translate('error.workspace-unresolved', { subject: 'session-1' })
    expect(text).toBe('工作区无法归属：session-1。')

    renderEditor({ variant: 'dialog', failure: { text } })
    expect(screen.getByRole('alert').textContent).toContain(text)
  })
})

/** 用例里那个会话 id（只给 `/tools` 面的 panel 快照用；分节不再有「当前会话」寻址）。 */
const SESSION_ID = 'session-1'

/** 默认档文件的假绝对路径（只在快照字段里出现，本套件不渲染它）。 */
const DEFAULTS_PATH = '/fake/dsh-home/session-tool-toggle/defaults.json'

/** 分节的目标工作区路径（`{workspacePath}` 寻址键，与 `WorkspaceView.path` 同源）。 */
const FIRST_KEY = '/w1'

/** 换工作区用例里的第二个目标路径（`key={path}` 重挂重读）。 */
const SECOND_KEY = '/w2'

/** 页面下传的工作区上下文（`{kind:'workspace'}` 三键齐全，code-design §3.9）。 */
const WORKSPACE_CONTEXT: WorkspaceDefaultsSectionProps['workspace'] = {
  kind: 'workspace',
  id: 'ws-w1',
  title: 'w1',
  path: FIRST_KEY,
}

/** `workspace` 响应的 `choices`（契约字段仍在；本节已不渲染下拉，这里只为响应形状完整）。 */
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
 * @param disabled - 该工作区的关闭集。
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
    intentOnly: [],
    stats: { visible: 0, denied: 0 },
    notices: [],
    skills: [],
    workspace: sharedWorkspaceView(FIRST_KEY, disabled),
  }
}

/**
 * 「同一份宿主状态」的假客户端：`workspace` 端点与 `panel` 端点读写同一个
 * `disabledByWorkspace`，模拟宿主侧 `/session-tool-toggle` 通道后的同一个控制内核与同一份
 * `workspaces.json`——分节与 `/tools` 面各自只是这份状态的入口，不是第二份状态。
 *
 * 宇宙按寻址形态区分（契约事实）：`{sessionId}` 形态带会话视角的宇宙；`{workspacePath}`
 * 形态的 `universe` 恒为 `null`（宿主 U1 / D-24）。页面化后本节只发 `{workspacePath}`，
 * 因此分节渲染的是「不可用说明 + 残留区 + 命令兜底」形态——本套件不在这一层重测宇宙口径。
 */
class SharedStateClient implements PanelClient {
  /** 每次 `workspace` 的请求体（地址数组已复制）。 */
  readonly workspaceCalls: WorkspaceRequest[] = []
  /** 每次 `panel` 的 sessionId。 */
  readonly panelCalls: string[] = []
  /** 每次 `workspace` 响应里的宇宙（路径形态恒为 `null`：本项目前只发这一种寻址）。 */
  readonly universes: (DefaultsUniverse | null)[] = []
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
    // 契约事实：`{workspacePath}` 寻址没有会话视角的宇宙（显式 null）；`{sessionId}` 给完整宇宙。
    const universe: DefaultsUniverse | null = request.workspacePath === undefined ? UNIVERSE : null
    this.universes.push(universe)
    return {
      workspace: sharedWorkspaceView(key, target),
      choices: SHARED_CHOICES,
      changed,
      universe,
    }
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
 * @param overrides - 需要覆盖的 props（`workspace` 份额三态 / `resolveClient` / `t`）。
 * @returns testing-library 的 render 结果 + 换份额重新渲染的助手。
 */
function renderSection(overrides: Partial<WorkspaceDefaultsSectionProps> = {}) {
  const base: WorkspaceDefaultsSectionProps = {
    // 份额三态：`{kind:'workspace',…}` 才有读写目标（§3.9 的消费矩阵）。
    workspace: WORKSPACE_CONTEXT,
    resolveClient: () => undefined,
    t: translate,
    ...overrides,
  }
  const view = render(<WorkspaceDefaultsSection {...base} />)
  return {
    ...view,
    /** 用新的 owner 份额重新渲染（`key={path}` 重挂语义的真实触发路径）。 */
    rerenderSection(next: Partial<WorkspaceDefaultsSectionProps>): void {
      view.rerender(<WorkspaceDefaultsSection {...base} {...next} />)
    },
  }
}

describe('WorkspaceDefaultsSection（页面的分节，dialog 形态）', () => {
  it('渲染正文壳而**没有**对话框根，节内也没有工作区下拉（选择框由页面提供）', async () => {
    const client = new SharedStateClient()
    const { container } = renderSection({ resolveClient: () => client })

    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })

    // 页面骨架由 holder 提供：分节不自带 role="dialog"，也不自带 <section> 分区根。
    expect(container.firstElementChild?.tagName).toBe('DIV')
    expect(container.firstElementChild?.getAttribute('role')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('section')).toBeNull()
    expect(screen.getByRole('heading', { name: zh['workspace.title'], level: 3 })).toBeTruthy()
    // 下拉已上移到页面：节内不再有 combobox（code-design §1.3「删除节内工作区下拉」）。
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('挂载即读一次，请求体是选中工作区的 { workspacePath, action: read }', async () => {
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })

    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })
    expect(client.workspaceCalls[0]).toEqual({ workspacePath: FIRST_KEY, action: 'read' })
    // 分节从不按会话寻址：`{sessionId}` 形态会带会话视角，页面化后已无消费者。
    expect(client.panelCalls).toEqual([])
  })

  it('无有效目标（unassigned / none）：渲染 workspace.noTarget 空态，且零请求', async () => {
    for (const workspace of [{ kind: 'unassigned' }, { kind: 'none' }] as const) {
      const client = new SharedStateClient()
      const { unmount } = renderSection({ workspace, resolveClient: () => client })

      expect(await screen.findByText(zh['workspace.noTarget'])).toBeTruthy()
      // 空态不是错误态：没有 alert，也没有编辑器。
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('combobox')).toBeNull()
      // 关键契约：不发任何寻址请求（缺寻址字段的请求只会被宿主判 bad-request）。
      expect(client.workspaceCalls).toEqual([])
      expect(client.panelCalls).toEqual([])
      unmount()
    }
  })

  it('client 缺席（connection 未就绪）时渲染 workspace.unavailable，不发任何请求', async () => {
    renderSection({ resolveClient: () => undefined })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(zh['workspace.unavailable'])
    // 降级态没有编辑器，也就没有输入框。
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryAllByRole('switch')).toEqual([])
  })

  it('connection 晚就绪：分节重新挂载后同一组件读取恢复', async () => {
    const first = renderSection({ resolveClient: () => undefined })
    await screen.findByRole('alert')
    first.unmount()

    // D8：切走 / 关闭即卸载，重开重新挂载并重读——不在失败态里留第二份缓存。
    const client = new SharedStateClient()
    renderSection({ resolveClient: () => client })
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('heading', { name: zh['workspace.title'], level: 3 })).toBeTruthy()
  })

  it('换工作区 = 换 key 重挂重读：旧目标卸载，新目标按新路径重读一次', async () => {
    const client = new SharedStateClient()
    const { rerenderSection } = renderSection({ resolveClient: () => client })

    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })
    expect(client.workspaceCalls[0]).toEqual({ workspacePath: FIRST_KEY, action: 'read' })

    rerenderSection({
      workspace: { kind: 'workspace', id: 'ws-w2', title: 'w2', path: SECOND_KEY },
    })

    // `key={path}` 让目标组件整体重挂：不是「同一份状态换个读数」，而是旧目标卸载 + 新目标重读。
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(2) })
    expect(client.workspaceCalls[1]).toEqual({ workspacePath: SECOND_KEY, action: 'read' })
  })
})

describe('与 /tools 共用状态（零回归红线）', () => {
  it('分节内移除残留地址后，/tools 面（panel 快照）读到同一条记录', async () => {
    const client = new SharedStateClient()
    // 宿主侧这个工作区已有一条关闭项（本套件的假客户端只保存写入结果，这里预置一份）。
    client.disabledByWorkspace.set(FIRST_KEY, new Set(['legacy:retired']))
    renderSection({ resolveClient: () => client })
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })

    // 残留地址不在宇宙里，只能从残留区移除（移除 = 从工作区档里拿掉）。
    fireEvent.click(await screen.findByRole('button', {
      name: translate('workspace.removeAria', { address: 'legacy:retired' }),
    }))

    // 写走的是 `/session-tool-toggle` 的 workspace 端点，落到同一份宿主状态。
    await waitFor(() => { expect(client.disabledByWorkspace.get(FIRST_KEY)?.has('legacy:retired')).toBe(false) })
    expect(client.workspaceCalls.at(-1)).toEqual({
      workspacePath: FIRST_KEY,
      action: 'on',
      addresses: ['legacy:retired'],
    })

    // `/tools` 面（panel 快照）读的是同一份状态：同一条记录、同一个工作区键。
    const tools = await client.panel(SESSION_ID)
    expect(tools.workspace?.key).toBe(FIRST_KEY)
    expect(tools.workspace?.disabled).not.toContain('legacy:retired')
  })

  it('命令面写入后，分节重挂（切走再切回）读到同一状态', async () => {
    const client = new SharedStateClient()
    const first = renderSection({ resolveClient: () => client })
    await waitFor(() => { expect(client.workspaceCalls).toHaveLength(1) })

    // 模拟 `/tools workspace off tool:cmd`：命令面写的是同一个控制内核、同一份 workspaces.json。
    await client.workspace({ workspacePath: FIRST_KEY, action: 'off', addresses: ['tool:cmd'] })
    // 分节不轮询、不做第二份缓存：命令面改完，当前挂载要等一次重挂（切走再切回）才看到。
    expect(screen.queryByText('tool:cmd')).toBeNull()

    first.unmount()
    renderSection({ resolveClient: () => client })
    expect(await screen.findByText('tool:cmd')).toBeTruthy()
    expect(client.workspaceCalls.at(-1)).toEqual({ workspacePath: FIRST_KEY, action: 'read' })
  })
})
