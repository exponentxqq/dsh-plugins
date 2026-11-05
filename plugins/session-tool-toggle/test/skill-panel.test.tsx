// @vitest-environment jsdom
/**
 * 技能分区的浏览器半组件测试（任务 7.1 / T12；设计附录 §3.3 与 DQ3=A）。
 *
 * 组件是纯受控的展示层：状态（`skills` / `pending` / `busy` / `blocked` / `unavailable`）全部由
 * 容器从 `PanelController` 的 `PanelState` 传进来，动作只有 `onToggle(address, on)` 一条出口。
 * 因此这里**不造假控制器**，直接渲染真实组件、用记录调用的假 `onToggle` 断言「用户点了哪一行 →
 * 发出哪个地址的哪个意图」；重渲染用真实的宿主快照形状模拟（`rerender` 传回新 props）。
 *
 * 四条出口断言逐条对应用例：
 *
 * 1. `skill:openspec-propose` 行渲染出开关（`skill.switchLabel` 作为可访问名）；
 * 2. `disabled && shadowed` 行渲染**可点**的受控开关——`shadowed` 是「已生效」而不是锁定理由
 *    （与 `ToolEntry.shadowed` 相反），点击发出 `on=true`，宿主快照回来后变为勾选；
 * 3. `unavailable` → 渲染 `t('skill.unavailable')` 且整块没有任何 `role="switch"`；
 * 4. 开关回调按地址键控：点击第 N 行触发 `onToggle('skill:<name>', on)`，其余行不发。
 *
 * 另按任务清单覆盖：`blocked`（整档 `tool:skill` 已关，DQ3=A）保留逐项勾选状态、整块置灰、
 * 渲染一行提示且程序化点击也不发请求；`pending` 只禁用命中的地址并显示「正在应用…」；
 * `busy`（`reset()` 在途）整块置灰；空清单渲染空态；`unavailable` 优先于 `blocked`。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillView } from '../src/contract.ts'
import { SkillPanel, type SkillPanelProps } from '../src/client/SkillPanel.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值，与 locale 服务同一实现）。
 *
 * 参数类型放宽成 `string`（而不是 `Key`）：框架的 `TranslateNS` 还会并入共享 `common` 词表，
 * 收窄成 `Key` 的函数在逆变检查下赋不进去；未知键原样返回，便于用例暴露拼错的键。
 * @param key - 文案键。
 * @param params - 插值参数。
 * @returns 渲染后的文案。
 */
function translate(key: string, params?: Record<string, unknown>): string {
  const template = (zh as Record<string, string>)[key as Key]
  if (template === undefined) return key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/**
 * 一条技能行：只有被点名的标记为真。
 * @param overrides - 行字段（`name` 必填）。
 * @returns 技能行。
 */
function skill(overrides: Partial<SkillView> & Pick<SkillView, 'name'>): SkillView {
  return {
    description: '',
    disabled: false,
    shadowed: false,
    ...overrides,
  }
}

/**
 * 渲染技能分区（props 默认取「可用、未整档关闭、无在途、空清单」）。
 * @param overrides - 要覆盖的 props。
 * @returns testing-library 的 render 结果。
 */
function renderPanel(overrides: Partial<SkillPanelProps> = {}) {
  const props: SkillPanelProps = {
    skills: [],
    unavailable: false,
    blocked: false,
    pending: new Set<string>(),
    busy: false,
    onToggle: () => {},
    t: translate,
    ...overrides,
  }
  return render(<SkillPanel {...props} />)
}

/**
 * 按可访问名取开关（`Switch` 的 `label` 是 `skill.switchLabel` 插值后的技能名）。
 * @param name - 技能名。
 * @returns 开关元素。
 */
function switchOf(name: string): HTMLElement {
  const label = zh['skill.switchLabel'].replace('{name}', name)
  return screen.getByRole('switch', { name: label })
}

describe('技能行（正常态）', () => {
  it('逐 skill 行渲染技能名、描述与开关，勾选态 = 模型可见', () => {
    const onToggle = vi.fn()
    renderPanel({
      onToggle,
      skills: [
        skill({ name: 'openspec-propose', description: '提案 OpenSpec 变更' }),
        skill({ name: 'code-review', disabled: true, shadowed: true }),
      ],
    })

    // 名称与描述（描述走 `title`，不占版面）。
    const proposeName = screen.getByText('openspec-propose')
    expect(proposeName.getAttribute('title')).toBe('提案 OpenSpec 变更')
    // 已关且没有描述缓存 → `title` 退回技能名，不渲染空提示。
    expect(screen.getByText('code-review').getAttribute('title')).toBe('code-review')

    // 开关：可见 = 勾选，已关 = 未勾选；两行都可点（技能行没有「保护 / 保留」锁定）。
    expect(switchOf('openspec-propose').getAttribute('aria-checked')).toBe('true')
    expect(switchOf('code-review').getAttribute('aria-checked')).toBe('false')
    expect((switchOf('openspec-propose') as HTMLButtonElement).disabled).toBe(false)

    // 点击打开态的行 → 关闭意图（on=false）；地址是 `skill:<name>`。
    fireEvent.click(switchOf('openspec-propose'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('skill:openspec-propose', false)
  })

  it('toggle 回调按地址键控：点哪一行只发哪一行的 skill:<name>', () => {
    const onToggle = vi.fn()
    renderPanel({
      onToggle,
      skills: [skill({ name: 'alpha' }), skill({ name: 'beta', disabled: true })],
    })

    fireEvent.click(switchOf('beta'))
    expect(onToggle).toHaveBeenLastCalledWith('skill:beta', true)

    fireEvent.click(switchOf('alpha'))
    expect(onToggle).toHaveBeenLastCalledWith('skill:alpha', false)
    expect(onToggle.mock.calls.map(([address]) => address)).toEqual(['skill:beta', 'skill:alpha'])
  })

  it('pending 只禁用命中地址的行并显示「正在应用…」，其余行仍可点', () => {
    const onToggle = vi.fn()
    renderPanel({
      onToggle,
      pending: new Set(['skill:beta']),
      skills: [skill({ name: 'alpha' }), skill({ name: 'beta' })],
    })

    expect((switchOf('alpha') as HTMLButtonElement).disabled).toBe(false)
    expect((switchOf('beta') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(zh['skill.pending'])).toBeDefined()

    // 原生 `disabled` 只挡真实手势；程序化点击进来后组件自己守住（对照组：alpha 会发）。
    fireEvent.click(switchOf('beta'))
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(switchOf('alpha'))
    expect(onToggle).toHaveBeenCalledWith('skill:alpha', false)
  })

  it('busy（reset 在途）时整块开关置灰', () => {
    const onToggle = vi.fn()
    renderPanel({
      onToggle,
      busy: true,
      skills: [skill({ name: 'alpha' }), skill({ name: 'beta', disabled: true })],
    })

    expect((switchOf('alpha') as HTMLButtonElement).disabled).toBe(true)
    expect((switchOf('beta') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(switchOf('alpha'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('空清单渲染空态文案', () => {
    renderPanel()
    expect(screen.getByText(zh['skill.empty'])).toBeDefined()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})

describe('disabled && shadowed（已关且影子 stub 已生效）', () => {
  it('渲染可点的受控开关：点击发出 on=true，宿主快照回来后变为勾选', () => {
    const onToggle = vi.fn()

    // 初始快照：已关（意图）+ 已生效（影子 stub 已注册）。与工具行的 `shadowed` 不同，
    // 技能行的这个标记不是锁定理由——锁住就没有任何入口能把它重新打开。
    const closed = skill({ name: 'openspec-propose', disabled: true, shadowed: true })
    const { rerender } = renderPanel({ onToggle, skills: [closed] })

    const before = switchOf('openspec-propose')
    expect(before.getAttribute('aria-checked')).toBe('false')
    expect((before as HTMLButtonElement).disabled).toBe(false)
    // 行内状态标签讲清「关闭已生效」：模型不可见，但 `/name` 手动调用保留。
    expect(screen.getByText(zh['skill.effective'])).toBeDefined()

    // 可点：点击发出「打开」意图，而不是被 shadowed 锁死。
    fireEvent.click(before)
    expect(onToggle).toHaveBeenCalledWith('skill:openspec-propose', true)

    // 不做乐观更新：宿主快照回来（disabled=false）后开关才勾选。
    rerender(
      <SkillPanel
        skills={[{ ...closed, disabled: false }]}
        unavailable={false}
        blocked={false}
        pending={new Set<string>()}
        busy={false}
        onToggle={onToggle}
        t={translate}
      />,
    )
    const after = switchOf('openspec-propose')
    expect(after.getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByText(zh['skill.effective'])).toBeNull()
  })

  it('只记录意图、尚未生效（disabled && !shadowed）时给出「暂未生效」标签', () => {
    renderPanel({ skills: [skill({ name: 'ghost-skill', disabled: true })] })
    expect(screen.getByText(zh['skill.intentOnly'])).toBeDefined()
    expect(switchOf('ghost-skill').getAttribute('aria-checked')).toBe('false')
  })
})

describe('blocked（整档 tool:skill 已关，DQ3=A）', () => {
  it('保留逐行勾选状态、整块置灰、渲染一行提示，且程序化点击也不发请求', () => {
    const onToggle = vi.fn()
    const visible = skill({ name: 'alpha' })
    const closed = skill({ name: 'beta', disabled: true, shadowed: true })
    const { rerender } = renderPanel({ onToggle, blocked: true, skills: [visible, closed] })

    // 一行提示：讲清「整档关闭 → 逐项暂不生效」。
    expect(screen.getByText(zh['skill.blocked'])).toBeDefined()

    // 状态原样保留（alpha 勾选、beta 未勾选），但所有开关置灰。
    expect(switchOf('alpha').getAttribute('aria-checked')).toBe('true')
    expect(switchOf('beta').getAttribute('aria-checked')).toBe('false')
    expect((switchOf('alpha') as HTMLButtonElement).disabled).toBe(true)
    expect((switchOf('beta') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(switchOf('alpha'))
    expect(onToggle).not.toHaveBeenCalled()

    // 重新打开整档（blocked=false）后按之前的状态恢复可点：不改任何状态机语义。
    rerender(
      <SkillPanel
        skills={[visible, closed]}
        unavailable={false}
        blocked={false}
        pending={new Set<string>()}
        busy={false}
        onToggle={onToggle}
        t={translate}
      />,
    )
    expect(screen.queryByText(zh['skill.blocked'])).toBeNull()
    expect(switchOf('alpha').getAttribute('aria-checked')).toBe('true')
    expect(switchOf('beta').getAttribute('aria-checked')).toBe('false')
    expect((switchOf('beta') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('unavailable（技能服务不可用）', () => {
  it('渲染降级提示且不渲染任何开关', () => {
    renderPanel({
      unavailable: true,
      // 即便调用方手里还留着旧行，整块也只给降级提示：没有技能服务时开关点不出真实效果。
      skills: [skill({ name: 'openspec-propose' })],
    })

    expect(screen.getByText(zh['skill.unavailable'])).toBeDefined()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByText('openspec-propose')).toBeNull()
  })

  it('unavailable 优先于 blocked（只显示服务不可用，不叠加整档关闭提示）', () => {
    renderPanel({ unavailable: true, blocked: true, skills: [skill({ name: 'alpha' })] })
    expect(screen.getByText(zh['skill.unavailable'])).toBeDefined()
    expect(screen.queryByText(zh['skill.blocked'])).toBeNull()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })
})
