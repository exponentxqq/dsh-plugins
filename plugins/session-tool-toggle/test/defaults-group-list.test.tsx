// @vitest-environment jsdom
/**
 * 共用清单 `DefaultsGroupList` 的两形态契约测试（code-design ①1.3；差异表 ③3.3）。
 *
 * 此前该组件只有经两个默认档编辑器与面板容器的**间接覆盖**，本套件直接渲染组件本体，
 * 逐条钉住两形态的分叉点：
 *
 * 1. **默认档形态（`session` 缺省）零回归锚点**：文案与可访问名沿用 `defaults.*`（行/组
 *    开关「…的默认档开关 / …的整组默认档开关」、组头计数「N 项」），残留区标题是
 *    `defaults.residualTitle`、按钮文案「移除」，点击发 `onToggle(address, true)`；
 *    整组地址在档时组内行禁用并带「整组默认关」标签（`checked` 仍按关闭集逐项读、不传导），
 *    组开关本身不受禁——它正是把整组移出档的入口。
 * 2. **会话形态（给出 `session` 四槽）各槽一条**：
 *    - `effectiveDisabled`：整组关经 `effectiveClosedOf` 传导后组内行 `checked=false` 且
 *      禁用（带「整组已关」），组头「已关」计数与行开关同一事实集；
 *    - `pending`：命中行禁用并显示「正在应用…」，程序化点击不发开关意图，未命中行照常；
 *    - `shadowedSkills`（行详情形态）：技能行「在关闭集」标签按影子生效与否分成
 *      `skill.effective`（模型不可见）与 `skill.intentOnly`（已记录暂未生效），默认档
 *      形态同输入仍只有 `entry.skillHidden` 一句；
 *    - `intentOnly`：行与组头带「暂无匹配」标签，`title` 是 `disabled.intentOnly` 的解释句。
 * 3. **`tool:skill` 整组关且会话形态**：组内多一句 `skill.blocked` 提示；默认档形态没有。
 * 4. **会话形态残留区**：标题 `session.residualTitle`、按钮文案「开启」（`disabled.enable`），
 *    点击同样发 `onToggle(address, true)`——动作是同一调用，语义随形态换名。
 *
 * 夹具口径：宇宙 / 条目 / 技能行形状照 `src/contract.ts` 现读；四槽的派生集合用
 * `defaults-view.ts` 的 `effectiveClosedOf` / `shadowedSkillAddressesOf` 就地构造（与面板
 * 容器同一口径）；`t` 用 canonical 中文词典（zh）模拟框架注入，断言文案经 `translate`
 * 插值取真值。每条用例只钉一个语义点，断言文本与语义而不是实现细节。
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DefaultsEntry, DefaultsUniverse, SkillView } from '../src/contract.ts'
import { DefaultsGroupList, type DefaultsGroupListProps, type SessionListState } from '../src/client/DefaultsGroupList.tsx'
import { effectiveClosedOf, shadowedSkillAddressesOf } from '../src/client/defaults-view.ts'
import { NS, zh } from '../src/client/locales.ts'

/** 本组件消费的转发函数（与组件内部同一类型）。 */
type Translate = TranslateNS<typeof NS>

afterEach(cleanup)

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
 * MCP 组默认折叠（行断言前需点组头展开）；技能组与内置组默认展开；`builtin` 组没有组
 * 地址（宿主口径），只有行开关。
 */
const UNIVERSE: DefaultsUniverse = {
  layerReady: true,
  skillsAvailable: true,
  groups: [
    {
      kind: 'mcp',
      key: 'a',
      address: 'mcp:a',
      tools: [defaultsEntry('mcp:a::x', 'x'), defaultsEntry('mcp:a::y', 'y')],
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
      tools: [defaultsEntry('tool:read_file', 'read_file'), defaultsEntry('tool:web_search', 'web_search')],
    },
  ],
}

/** 两条技能行：一条已关且影子已生效、一条已关但只记了意图（`shadowedSkillAddressesOf` 的输入）。 */
const SKILLS: readonly SkillView[] = [
  { name: 'alpha', description: '技能 A', disabled: true, shadowed: true },
  { name: 'beta', description: '', disabled: true, shadowed: false },
]

/** 四槽全空的会话形态缺省（各用例按需覆盖单个槽）。 */
function sessionSlots(overrides: Partial<SessionListState> = {}): SessionListState {
  return {
    pending: new Set<string>(),
    effectiveDisabled: new Set<string>(),
    shadowedSkills: new Set<string>(),
    intentOnly: new Set<string>(),
    ...overrides,
  }
}

/**
 * 渲染清单组件并返回记录调用的 `onToggle` 替身。
 * @param overrides - 需要覆盖的 props（宇宙、关闭集、会话槽、行详情等）。
 * @returns render 结果 + `onToggle` mock。
 */
function renderList(overrides: Partial<DefaultsGroupListProps> = {}) {
  const onToggle = vi.fn<DefaultsGroupListProps['onToggle']>()
  const props: DefaultsGroupListProps = {
    universe: UNIVERSE,
    disabled: [],
    busy: false,
    onToggle,
    t: translate,
    ...overrides,
  }
  return { ...render(<DefaultsGroupList {...props} />), onToggle }
}

/** 按可访问名取一枚开关（`Switch` 的 `label` 是插值后的名字，桩渲染成 `role="switch"` 按钮）。 */
function switchByLabel(label: string): HTMLButtonElement {
  return screen.getByRole('switch', { name: label }) as HTMLButtonElement
}

/** MCP 组头按钮（组头可访问名以分区标题「MCP 服务器」开头）。 */
function mcpHeader(): HTMLButtonElement {
  return screen.getByRole('button', { name: /^MCP 服务器/ }) as HTMLButtonElement
}

/** MCP 组的 `<li>` 根（组内查询都在它内部做，避免跨组歧义）。 */
function mcpGroupRoot(): HTMLElement {
  const li = mcpHeader().closest('li')
  if (li === null) throw new Error('没有找到 MCP 分区')
  return li
}

describe('默认档形态：session 缺省的零回归锚点', () => {
  it('文案与可访问名沿用 defaults.*：默认档开关、组头计数与「移除」按钮', () => {
    const { onToggle } = renderList({ disabled: ['mcp:figma', 'tool:read_file'] })

    // 行/组开关的可访问名是 defaults.* 键；目标档关闭集是 checked 的唯一事实（逐项读）。
    expect(switchByLabel(translate('defaults.switchLabel', { name: 'read_file' })).getAttribute('aria-checked')).toBe('false')
    expect(switchByLabel(translate('defaults.switchLabel', { name: 'web_search' })).getAttribute('aria-checked')).toBe('true')
    switchByLabel(translate('defaults.groupSwitchLabel', { name: 'a' }))

    // 组头计数是默认档口径（「N 项」；行在档才追加「默认关 M 项」半句，本夹具组内无行在档）。
    expect(mcpHeader().textContent).toContain(translate('defaults.groupCount', { count: 2 }))

    // 残留区：标题与按钮都是默认档文案；动作只有一个「移除」（onToggle(address, true)）。
    screen.getByText(zh['defaults.residualTitle'])
    const remove = screen.getByRole('button', { name: `${zh['defaults.remove']} mcp:figma` })
    expect(remove.textContent).toBe(zh['defaults.remove'])

    fireEvent.click(remove)
    expect(onToggle).toHaveBeenCalledWith('mcp:figma', true)
  })

  it('整组默认关：组内行禁用并带「整组默认关」标签，组开关仍是移出整组的入口', () => {
    const { onToggle } = renderList({ disabled: ['mcp:a'] })

    fireEvent.click(mcpHeader()) // MCP 组默认折叠：先展开才能断言行

    // checked 不传导（行地址不在档 → 仍是开的），但整组在档让行禁用并标「整组默认关」。
    const row = switchByLabel(translate('defaults.switchLabel', { name: 'x' }))
    expect(row.getAttribute('aria-checked')).toBe('true')
    expect(row.disabled).toBe(true)
    const tags = screen.getAllByText(zh['defaults.groupOff'])
    expect(tags).toHaveLength(2)
    expect(tags[0]?.getAttribute('title')).toBe(zh['defaults.groupOff'])

    // 行的锁定靠组件守卫：程序化点击也不发开关意图。
    fireEvent.click(row)
    expect(onToggle).not.toHaveBeenCalled()

    // 组开关不受整组在档禁用——它正是把整组拿掉的入口。
    fireEvent.click(switchByLabel(translate('defaults.groupSwitchLabel', { name: 'a' })))
    expect(onToggle).toHaveBeenCalledWith('mcp:a', true)
  })
})

describe('会话形态：四个语义槽各司其职', () => {
  it('effectiveDisabled：整组关传导到组内行（checked=false 且禁用），组头计数按有效关闭算', () => {
    const { onToggle } = renderList({
      disabled: ['mcp:a'],
      session: {
        ...sessionSlots(),
        effectiveDisabled: effectiveClosedOf(UNIVERSE, ['mcp:a']),
      },
    })

    fireEvent.click(mcpHeader())

    // 行开关读「有效关闭」集：组地址在关闭集 → 行也关（默认档形态同输入行是开着的）。
    const row = switchByLabel(translate('switch.label', { name: 'x' }))
    expect(row.getAttribute('aria-checked')).toBe('false')
    expect(row.disabled).toBe(true)
    expect(screen.getAllByText(zh['session.groupOff'])).toHaveLength(2)

    // 组头「已关」计数与行开关同一事实集（传导后两行都算已关）。
    expect(
      within(mcpGroupRoot()).getByText(
        `${translate('group.toolCount', { count: 2 })} · ${translate('group.disabledCount', { count: 2 })}`,
      ),
    ).toBeDefined()

    // 组开关 checked 仍读目标档关闭集，且不受整组在档禁用。
    const groupSwitch = switchByLabel(translate('switch.label', { name: 'a' }))
    expect(groupSwitch.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(groupSwitch)
    expect(onToggle).toHaveBeenCalledWith('mcp:a', true)
  })

  it('pending：命中行禁用并显示「正在应用…」，程序化点击不发开关意图', () => {
    const { onToggle } = renderList({
      session: {
        ...sessionSlots(),
        pending: new Set(['tool:read_file']),
      },
    })

    const row = switchByLabel(translate('switch.label', { name: 'read_file' }))
    expect(row.disabled).toBe(true)
    screen.getByText(zh['toggle.pending'])

    fireEvent.click(row)
    expect(onToggle).not.toHaveBeenCalled()

    // 槽按地址逐行生效：未命中行照常可点。
    expect(switchByLabel(translate('switch.label', { name: 'web_search' })).disabled).toBe(false)
  })

  it('shadowedSkills：技能「在关闭集」按影子生效分两态，默认档形态仍是 skillHidden 一句', () => {
    renderList({
      disabled: ['skill:alpha', 'skill:beta'],
      showDetails: true,
      session: {
        ...sessionSlots(),
        effectiveDisabled: effectiveClosedOf(UNIVERSE, ['skill:alpha', 'skill:beta']),
        shadowedSkills: shadowedSkillAddressesOf(SKILLS),
      },
    })

    // alpha 影子已生效（模型不可见），beta 只记了意图（暂未生效）。
    screen.getByText(zh['skill.effective'])
    screen.getByText(zh['skill.intentOnly'])

    // 对照：默认档形态同输入只有「新会话默认隐藏」一句（两行各一枚，两形态同用中性灰标签）。
    cleanup()
    renderList({ disabled: ['skill:alpha', 'skill:beta'], showDetails: true })
    expect(screen.getAllByText(zh['entry.skillHidden'])).toHaveLength(2)
    expect(screen.queryByText(zh['skill.effective'])).toBeNull()
    expect(screen.queryByText(zh['skill.intentOnly'])).toBeNull()
  })

  it('intentOnly：行与组头带「暂无匹配」标签，title 是 disabled.intentOnly 的解释句', () => {
    renderList({
      disabled: ['mcp:a', 'mcp:a::x'],
      session: {
        ...sessionSlots(),
        effectiveDisabled: effectiveClosedOf(UNIVERSE, ['mcp:a', 'mcp:a::x']),
        intentOnly: new Set(['mcp:a', 'mcp:a::x']),
      },
    })

    // 组头一枚（此时组未展开，行不渲染，全文档只有组头一枚）。
    expect(screen.getByText(zh['entry.intentOnly']).getAttribute('title')).toBe(zh['disabled.intentOnly'])

    // 展开后组内行 x 也有同一枚标签：组头 + 行共两枚，行 y 不命中。
    fireEvent.click(mcpHeader())
    const group = mcpGroupRoot()
    const tags = within(group).getAllByText(zh['entry.intentOnly'])
    expect(tags).toHaveLength(2)
    for (const tag of tags) expect(tag.getAttribute('title')).toBe(zh['disabled.intentOnly'])
  })
})

describe('会话形态：技能整组关提示与残留开启', () => {
  it('tool:skill 整组关且会话形态：组内出现 skill.blocked 提示，默认档形态没有这句', () => {
    renderList({
      disabled: ['tool:skill'],
      session: {
        ...sessionSlots(),
        effectiveDisabled: effectiveClosedOf(UNIVERSE, ['tool:skill']),
      },
    })

    // 技能组默认展开：一句整档关提示 + 组内行被传导禁用。
    screen.getByText(zh['skill.blocked'])
    expect(switchByLabel(translate('switch.label', { name: 'alpha' })).disabled).toBe(true)

    // 对照：默认档形态同输入没有这句（整组关语义仍由行锁 + 标签表达）。
    cleanup()
    renderList({ disabled: ['tool:skill'] })
    expect(screen.queryByText(zh['skill.blocked'])).toBeNull()
  })

  it('残留区按钮文案是「开启」，点击发 onToggle(address, true)', () => {
    const { onToggle } = renderList({ disabled: ['mcp:figma'], session: sessionSlots() })

    screen.getByText(zh['session.residualTitle'])
    const enable = screen.getByRole('button', { name: translate('disabled.enableAria', { address: 'mcp:figma' }) })
    expect(enable.textContent).toBe(zh['disabled.enable'])

    fireEvent.click(enable)
    expect(onToggle).toHaveBeenCalledWith('mcp:figma', true)
  })
})
