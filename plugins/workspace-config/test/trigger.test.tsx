// @vitest-environment jsdom
/**
 * footer 唯一入口（`src/client/WorkspaceConfigTrigger.tsx`）的渲染与交互契约。
 *
 * 用例逐条对齐 code-design ①#8 / ③3.3 / D6 / D7：
 *
 * - 宽态：图标 + 可见文案的整行按钮；文案节点是唯一的弹性部分（省略号在 CSS 里）。
 * - 折叠态：28px 方形图标，可见文案缺席，但 `aria-label` 与图标仍在。
 * - `aria-label` **两态恒在**且取同一键（`t('entry.label')`）——折叠态没有可见文案，
 *   它是唯一的可访问名；`aria-haspopup="dialog"` 声明打开的是模态弹窗。
 * - `aria-expanded` 绑打开桥的布尔快照：点击 → `true`，从弹窗内关闭（store.close）→
 *   `false`；重复点击不 toggle（入口只请求打开，关闭所有权在弹窗）。
 * - 几何纪律（D6）：两形态由不同类名区分，宽态类带 `flex: 1 1 auto`、折叠态类 28px；
 *   样式源里**不得**出现 `flex: none` / 整行宽 `calc(100% + 4px)`（产物断言的同源守护，
 *   让样式回归在单测阶段就红，而不是等到真机走查）。
 *
 * `t` 用 canonical 中文词典查表；CSS Modules 由 vitest 管线加载（类名是稳定哈希，断言
 * 按导入的映射比，不写死哈希）。
 *
 * @module dsh-plugin-workspace-config/test/trigger
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WorkspaceConfigTrigger,
  type WorkspaceConfigTriggerProps,
} from '../src/client/WorkspaceConfigTrigger.tsx'
import { createOpenStore, type WorkspaceConfigOpenStore } from '../src/client/open-store.ts'
import { zh, type Key } from '../src/client/locales.ts'
import css from '../src/client/dialog.module.css'

afterEach(cleanup)

/** 入口在两态下共用的可访问名（canonical 中文文案）。 */
const ENTRY_LABEL = zh['entry.label']

/** 渲染参数：默认宽栏 + 真实打开桥。 */
interface RenderTriggerOptions {
  readonly wide?: boolean
  readonly open?: WorkspaceConfigOpenStore
}

/**
 * 渲染入口。
 * @param options - 形态与打开桥。
 * @returns render 结果 + 打开桥 + `t` 替身。
 */
function renderTrigger({ wide = true, open = createOpenStore() }: RenderTriggerOptions = {}) {
  const t = vi.fn<WorkspaceConfigTriggerProps['t']>((key) => zh[key as Key])
  const props: WorkspaceConfigTriggerProps = { wide, open, t }
  return { ...render(<WorkspaceConfigTrigger {...props} />), open, t }
}

describe('统一入口（WorkspaceConfigTrigger）', () => {
  it('宽态渲染「图标 + 文案」的行内按钮，类名带可伸缩份额', () => {
    const { getByRole } = renderTrigger({ wide: true })
    const button = getByRole('button')

    expect(button.getAttribute('type')).toBe('button')
    expect(button.querySelector('svg[data-icon="workspace-tree"]')).not.toBeNull()
    expect(button.querySelector('span')?.textContent).toBe(ENTRY_LABEL)
    expect(button.textContent).toBe(ENTRY_LABEL)

    const classes = button.className.split(/\s+/)
    expect(classes).toContain(css.trigger)
    expect(classes).toContain(css.triggerWide)
    expect(classes).not.toContain(css.triggerRail)
  })

  it('折叠态只留 28px 方形图标：图标与可访问名在、可见文案缺席', () => {
    const { getByRole } = renderTrigger({ wide: false })
    const button = getByRole('button', { name: ENTRY_LABEL })

    expect(button.querySelector('svg[data-icon="workspace-tree"]')).not.toBeNull()
    expect(button.querySelector('span')).toBeNull()
    expect(button.textContent).toBe('')
    expect(screen.queryByText(ENTRY_LABEL)).toBeNull()

    const classes = button.className.split(/\s+/)
    expect(classes).toContain(css.trigger)
    expect(classes).toContain(css.triggerRail)
    expect(classes).not.toContain(css.triggerWide)
  })

  it('aria-label 在宽窄两态恒取 t("entry.label")，并声明 aria-haspopup="dialog"', () => {
    const wide = renderTrigger({ wide: true })
    expect(wide.getByRole('button').getAttribute('aria-label')).toBe(ENTRY_LABEL)
    expect(wide.getByRole('button').getAttribute('aria-haspopup')).toBe('dialog')
    expect(wide.t).toHaveBeenCalledWith('entry.label')

    cleanup()

    const narrow = renderTrigger({ wide: false })
    expect(narrow.getByRole('button').getAttribute('aria-label')).toBe(ENTRY_LABEL)
    expect(narrow.getByRole('button').getAttribute('aria-haspopup')).toBe('dialog')
    expect(narrow.t).toHaveBeenCalledWith('entry.label')
  })

  it('aria-expanded 随打开桥翻转：点击打开、重复点击不 toggle、外部 close 复位', () => {
    const view = renderTrigger()
    const button = view.getByRole('button', { name: ENTRY_LABEL })

    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(view.open.getSnapshot()).toBe(false)

    fireEvent.click(button)
    expect(view.open.getSnapshot()).toBe(true)
    expect(button.getAttribute('aria-expanded')).toBe('true')

    // 重复点击仍只是 open()：入口不拥有关闭动作，toggle 会让「点入口关弹窗」成为隐藏行为。
    fireEvent.click(button)
    expect(view.open.getSnapshot()).toBe(true)
    expect(button.getAttribute('aria-expanded')).toBe('true')

    // 弹窗内部关闭（自绘关闭按钮 / Escape / 遮罩点击）写回同一个 store：入口状态同步复位。
    act(() => {
      view.open.close()
    })
    expect(view.open.getSnapshot()).toBe(false)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('点击只登记一次打开请求（两个形态都走同一个 store.open）', () => {
    const open = createOpenStore()
    const spy = vi.spyOn(open, 'open')
    const { getByRole } = renderTrigger({ wide: false, open })

    fireEvent.click(getByRole('button', { name: ENTRY_LABEL }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(open.getSnapshot()).toBe(true)
  })

  it('样式源遵守 D6 几何纪律：无不可缩声明、无越过内边距的整行宽', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/client/dialog.module.css'), 'utf8')

    // 入口禁整行独占（R5 根因）：不可缩的 flex 简写与越界整行宽都不允许出现在样式源里。
    expect(source).not.toContain('flex: none')
    expect(source).not.toContain('calc(100% + 4px)')
    // 宽态只取可伸缩份额（省略号的前提是 min-width: 0），折叠态固定 28px。
    expect(source).toMatch(/\.triggerWide\s*\{[^}]*flex:\s*1 1 auto/s)
    expect(source).toMatch(/\.triggerWide\s*\{[^}]*min-width:\s*0/s)
    expect(source).toMatch(/\.triggerRail\s*\{[^}]*width:\s*28px/s)
    expect(source).toMatch(/\.triggerRail\s*\{[^}]*height:\s*28px/s)
  })
})
