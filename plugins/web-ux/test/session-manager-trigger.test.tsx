// @vitest-environment jsdom
/**
 * 会话管理入口（`src/client/SessionManagerTrigger.tsx`）的渲染与点击契约。
 *
 * 入口是纯投影 + 一次写入：座位给的 `wide` 决定宽栏的「图标 + 文案」整行按钮，还是
 * 侧栏折叠成 56px 轨道时的方形图标按钮；`aria-label` 两态恒取 `t('manager.action')`
 * ——折叠态没有可见文案，它是这颗按钮唯一的可访问名。点击只向跨 entry 的
 * `ManagerRequestStore` 登记一次「请打开」，不传目标、不做判据、不在这里挂浮层。
 * 宿主通道未就绪（`ready === false`）时整颗入口 `return null`：没有通道就没有管理面，
 * 宁可静默不渲染，也不画一颗点了没反应的死按钮。
 *
 * 用例对齐 code-design 触达面 #22 与 ⑤G5 第 3 条。jsdom 环境与 stub 接线沿用既有
 * trigger 族测试（`test/delete-menu-item.test.tsx`）的写法；图标形状由
 * `test/stubs/ui-primitives.tsx` 提供（`svg[data-icon="checklist"]`），CSS Modules
 * 由 vitest 管线加载，无需在此声明。
 *
 * @module dsh-plugin-web-ux/test/session-manager-trigger
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SessionManagerTrigger,
  type SessionManagerTriggerProps,
} from '../src/client/SessionManagerTrigger.tsx'
import { createManagerRequestStore } from '../src/client/session-manager-store.ts'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 入口按钮在两态下共用的可访问名（canonical 中文文案）。 */
const ACTION_LABEL = zh['manager.action']

/** 渲染参数：默认宽栏、通道就绪、真实请求 store。 */
interface RenderTriggerOptions {
  readonly wide?: boolean
  readonly ready?: boolean
  readonly requests?: SessionManagerTriggerProps['requests']
}

/**
 * 渲染入口。
 * @param options - 座位份额、就绪标记与注入的请求 store。
 * @returns render 结果 + `t` 替身（用于断言取键）。
 */
function renderTrigger({
  wide = true,
  ready = true,
  requests = createManagerRequestStore(),
}: RenderTriggerOptions = {}) {
  // 框架注入的 `t` 键域还含 common 词表；本组件只查本命名空间，按真实字典查表即可。
  const t = vi.fn<SessionManagerTriggerProps['t']>((key) => zh[key as Key])
  const props: SessionManagerTriggerProps = { wide, ready, requests, t }
  return { ...render(<SessionManagerTrigger {...props} />), t }
}

describe('会话管理入口', () => {
  it('宽栏渲染「图标 + 文案」的整行按钮', () => {
    const { getByRole } = renderTrigger({ wide: true })
    const button = getByRole('button')

    expect(button.getAttribute('type')).toBe('button')
    expect(button.querySelector('svg[data-icon="checklist"]')).not.toBeNull()
    expect(button.querySelector('span')?.textContent).toBe(ACTION_LABEL)
    expect(button.textContent).toBe(ACTION_LABEL)
  })

  it('窄栏只留图标按钮：图标与可访问名在、可见文案缺席', () => {
    const { getByRole } = renderTrigger({ wide: false })
    const button = getByRole('button', { name: ACTION_LABEL })

    expect(button.querySelector('svg[data-icon="checklist"]')).not.toBeNull()
    expect(button.querySelector('span')).toBeNull()
    expect(button.textContent).toBe('')
    expect(screen.queryByText(ACTION_LABEL)).toBeNull()
  })

  it('aria-label 在宽窄两态都取 t("manager.action")', () => {
    const wide = renderTrigger({ wide: true })
    expect(wide.getByRole('button').getAttribute('aria-label')).toBe(ACTION_LABEL)
    expect(wide.t).toHaveBeenCalledWith('manager.action')

    cleanup()

    const narrow = renderTrigger({ wide: false })
    expect(narrow.getByRole('button').getAttribute('aria-label')).toBe(ACTION_LABEL)
    expect(narrow.t).toHaveBeenCalledWith('manager.action')
  })

  it.each([true, false])('点击只向 store 登记一次打开请求（wide=%s）', (wide) => {
    const requests = createManagerRequestStore()
    const { getByRole } = renderTrigger({ wide, requests })
    const button = getByRole('button', { name: ACTION_LABEL })

    // 空闲态没有请求；一次点击恰好登记一次，浮层按 seq 决定是否重挂。
    expect(requests.source.getSnapshot()).toBeNull()

    fireEvent.click(button)
    const first = requests.source.getSnapshot()
    expect(first).toEqual({ seq: 1 })

    // 重复点击必须换新快照：同一对象会被 identity 比较或 React 的 key 复用吃掉。
    fireEvent.click(button)
    const second = requests.source.getSnapshot()
    expect(second).toEqual({ seq: 2 })
    expect(second).not.toBe(first)
  })

  it.each([true, false])('ready=false 时（wide=%s）入口整体不渲染', (wide) => {
    const { container } = renderTrigger({ wide, ready: false })

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByLabelText(ACTION_LABEL)).toBeNull()
  })
})
