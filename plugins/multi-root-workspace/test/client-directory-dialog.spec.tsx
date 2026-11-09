// @vitest-environment jsdom
/**
 * `DirectoryPickerDialog` 行为契约单测（jsdom）。
 *
 * 用例清单 = `openspec/changes/2026-11-08-workspace-folders-picker/code-design.md`
 * ⑤ TG2 验收；判据 = §3.3 props 与行为契约：首帧 0/1 次 list、过期响应丢弃、
 * 新建参数与 exists 错误、取消路径 0 次 onConfirm、焦点归还、`role="dialog"`
 * a11y、隐藏开关、截断提示、失败句保持打开、重开回到 Host home。
 *
 * 组件只吃 `DirectoryBrowser` 端口。fixture 先造假 `uiWorkspace` browse 服务，
 * 再经真实 `createDirectoryPicker` 适配器取出 browsing——传入组件的失败形状
 * 与生产路径一致；wire 错误按 tasks 附录 R1 的纪律构造（Error 实例 +
 * `rpcError` 载体，禁止对象字面量 throw）。
 */

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDirectoryPicker,
  type DirectoryBrowser,
  type DirectoryListing,
  type DirectoryPickOutcome,
  type DirectoryPickerService,
} from '../src/client/directory-picker.ts'
import { DirectoryPickerDialog, type DirectoryPickerDialogProps } from '../src/client/DirectoryPickerDialog.tsx'
import { zh, type Translate } from '../src/client/locales.ts'

/* ---------- 目录树 fixture ---------- */

/** home 层：两条可见项 + 一条隐藏项。 */
const HOME: DirectoryListing = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [
    { name: '/', path: '/', hidden: false },
    { name: 'me', path: '/home/me', hidden: false },
  ],
  entries: [
    { name: 'docs', path: '/home/me/docs', hidden: false },
    { name: 'repos', path: '/home/me/repos', hidden: false },
    { name: '.ssh', path: '/home/me/.ssh', hidden: true },
  ],
  truncated: false,
}

/** docs 子层（过期响应用例的原定终层，内容带一个可识别的过期标记条目）。 */
const DOCS: DirectoryListing = {
  path: '/home/me/docs',
  home: '/home/me',
  crumbs: [
    { name: '/', path: '/', hidden: false },
    { name: 'me', path: '/home/me', hidden: false },
    { name: 'docs', path: '/home/me/docs', hidden: false },
  ],
  entries: [{ name: 'notes', path: '/home/me/docs/notes', hidden: false }],
  truncated: false,
}

/** repos 子层（导航 / 面包屑用例的终层）。 */
const REPOS: DirectoryListing = {
  path: '/home/me/repos',
  home: '/home/me',
  crumbs: [
    { name: '/', path: '/', hidden: false },
    { name: 'me', path: '/home/me', hidden: false },
    { name: 'repos', path: '/home/me/repos', hidden: false },
  ],
  entries: [{ name: 'app', path: '/home/me/repos/app', hidden: false }],
  truncated: false,
}

/** 新建成功后进入的新目录层（空层）。 */
const CREATED: DirectoryListing = {
  path: '/home/me/新目录',
  home: '/home/me',
  crumbs: [
    { name: '/', path: '/', hidden: false },
    { name: 'me', path: '/home/me', hidden: false },
    { name: '新目录', path: '/home/me/新目录', hidden: false },
  ],
  entries: [],
  truncated: false,
}

/* ---------- 假服务与端口 ---------- */

/** 假 `uiWorkspace` browse 服务：list 可编程、可计数；create 默认不会被打到。 */
function fakeService(
  listingOf: (path: string | undefined) => DirectoryListing | Promise<DirectoryListing>,
  create: DirectoryPickerService['createDirectory'] = async () => '',
): {
  readonly service: DirectoryPickerService
  readonly listCalls: (string | undefined)[]
  readonly signals: (AbortSignal | undefined)[]
} {
  const listCalls: (string | undefined)[] = []
  const signals: (AbortSignal | undefined)[] = []
  const service: DirectoryPickerService = {
    listDirectory: (path, signal) => {
      listCalls.push(path)
      signals.push(signal)
      return Promise.resolve(listingOf(path))
    },
    createDirectory: create,
  }
  return { service, listCalls, signals }
}

/** 经真实适配器把假服务包成浏览端口：组件吃到的失败形状与生产一致。 */
async function browsingOf(service: DirectoryPickerService): Promise<DirectoryBrowser> {
  const outcome = await createDirectoryPicker(() => service)()
  expect(outcome.kind).toBe('browse')
  return (outcome as Extract<DirectoryPickOutcome, { kind: 'browse' }>).browsing
}

/** 直接用真实 zh 词典：断言的可见文案就是用户会看到的文案。 */
const t: Translate = key => zh[key]

/** 渲染对话框并暴露可断言的回调 spy；`open` 翻转经 rerender 模拟父组件。 */
function renderDialog(
  browser: DirectoryBrowser,
  overrides: {
    initialListing?: DirectoryListing
    onConfirm?: (path: string) => Promise<string | undefined>
    onClose?: () => void
  } = {},
): {
  readonly onConfirm: (path: string) => Promise<string | undefined>
  readonly onClose: () => void
  rerender: (open: boolean) => void
} {
  const onConfirm = overrides.onConfirm ?? vi.fn(async () => undefined)
  const onClose = overrides.onClose ?? vi.fn()
  // exactOptionalPropertyTypes：initialListing 只在给出时进 props。
  const props: DirectoryPickerDialogProps = {
    open: true,
    t,
    browser,
    onConfirm,
    onClose,
    ...(overrides.initialListing !== undefined ? { initialListing: overrides.initialListing } : {}),
  }
  const view = render(createElement(DirectoryPickerDialog, props))
  return {
    onConfirm,
    onClose,
    rerender: open => { view.rerender(createElement(DirectoryPickerDialog, { ...props, open })) },
  }
}

/** 等首帧 home 层渲染完成（等任意一条可见条目出现）。 */
async function waitForHome(): Promise<void> {
  await waitFor(() => { expect(screen.getByText('repos')).toBeTruthy() })
}

afterEach(() => {
  // Vitest 不开 globals，自动清理钩子不生效，手动收尾。
  cleanup()
  vi.restoreAllMocks()
})

describe('DirectoryPickerDialog：首帧与导航', () => {
  it('首帧零参调一次 list 并渲染 home 层', async () => {
    const { service, listCalls } = fakeService(path => (path === undefined ? HOME : REPOS))
    renderDialog(await browsingOf(service))
    await waitFor(() => { expect(listCalls).toEqual([undefined]) })
    expect(screen.getByText('docs')).toBeTruthy()
    expect(screen.getByText('repos')).toBeTruthy()
    // 隐藏项默认不渲染（用例 6 单独展开开关行为）。
    expect(screen.queryByText('.ssh')).toBeNull()
  })

  it('给出 initialListing 时零次 list，直接渲染其条目', async () => {
    const { service, listCalls } = fakeService(() => HOME)
    renderDialog(await browsingOf(service), { initialListing: HOME })
    await waitFor(() => { expect(screen.getByText('repos')).toBeTruthy() })
    expect(listCalls).toEqual([])
  })

  it('点子目录行 → list(path) 并渲染新层', async () => {
    const { service, listCalls } = fakeService(path => (path === undefined ? HOME : REPOS))
    renderDialog(await browsingOf(service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: 'repos' }))
    await waitFor(() => { expect(listCalls).toEqual([undefined, '/home/me/repos']) })
    await waitFor(() => { expect(screen.getByText('app')).toBeTruthy() })
  })

  it('点面包屑段 → list(crumb.path) 返回上层', async () => {
    const { service, listCalls } = fakeService(path =>
      path === undefined || path === '/home/me' ? HOME : REPOS)
    renderDialog(await browsingOf(service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: 'repos' }))
    await waitFor(() => { expect(screen.getByText('app')).toBeTruthy() })

    // repos 层面包屑：主目录 / me / repos（当前段）；点 me 段回上层。
    fireEvent.click(screen.getByRole('button', { name: 'me' }))
    await waitFor(() => { expect(listCalls).toEqual([undefined, '/home/me/repos', '/home/me']) })
    await waitFor(() => { expect(screen.getByText('docs')).toBeTruthy() })
  })

  it('快速连点两个目录：过期响应被丢弃，只有最后一次生效', async () => {
    // R1 纪律的姊妹条款：闭包内赋值、主流程后读的变量显式初始化。
    let resolveDocs: ((listing: DirectoryListing) => void) | undefined = undefined
    const { service, listCalls, signals } = fakeService(path => {
      if (path === '/home/me/docs') {
        return new Promise<DirectoryListing>(resolve => { resolveDocs = resolve })
      }
      return path === undefined ? HOME : REPOS
    })
    renderDialog(await browsingOf(service))
    await waitForHome()
    expect(listCalls).toEqual([undefined])

    // 快速连点：两次点击在同一 act 内完成（React 尚未 flush，第一层的 loading
    // 还没把第二行清掉）。第二次点击使第一次扫描 abort + epoch 过期。
    act(() => {
      screen.getByRole('button', { name: 'docs' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
      screen.getByRole('button', { name: 'repos' }).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => { expect(listCalls).toEqual([undefined, '/home/me/docs', '/home/me/repos']) })
    await waitFor(() => { expect(screen.getByText('app')).toBeTruthy() })
    // 发起新扫描时上一次已被 abort。
    expect(signals[1]?.aborted).toBe(true)

    // 慢的 docs 响应此刻才返回：epoch 已过期，内容必须被丢弃。
    resolveDocs?.({
      ...DOCS,
      entries: [{ name: 'stale-only', path: '/home/me/docs/stale-only', hidden: false }],
    })
    expect(screen.queryByText('stale-only')).toBeNull()
    expect(screen.getByText('app')).toBeTruthy()
  })
})

describe('DirectoryPickerDialog：隐藏、截断与重开', () => {
  it('隐藏目录默认不渲染，开关后显示，再点隐藏（aria-pressed 跟随）', async () => {
    const { service } = fakeService(() => HOME)
    renderDialog(await browsingOf(service))
    await waitForHome()
    expect(screen.queryByText('.ssh')).toBeNull()

    const toggle = screen.getByRole('button', { name: zh['picker.showHidden'] })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('.ssh')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['picker.showHidden'] }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: zh['picker.showHidden'] }))
    expect(screen.queryByText('.ssh')).toBeNull()
  })

  it('truncated 时显示截断提示', async () => {
    const big: DirectoryListing = {
      ...HOME,
      path: '/home/me/big',
      entries: [{ name: 'one', path: '/home/me/big/one', hidden: false }],
      truncated: true,
    }
    const { service } = fakeService(path => (path === undefined ? big : HOME))
    renderDialog(await browsingOf(service))
    await waitFor(() => { expect(screen.getByText('one')).toBeTruthy() })
    expect(screen.getByText(zh['picker.truncated'])).toBeTruthy()
  })

  it('关闭后重新打开重置到 Host home', async () => {
    const { service, listCalls } = fakeService(path =>
      path === undefined || path === '/home/me' ? HOME : REPOS)
    const dialog = renderDialog(await browsingOf(service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: 'repos' }))
    await waitFor(() => { expect(screen.getByText('app')).toBeTruthy() })

    // open=false → true：重置状态并重新零参 list（Q3 裁定起点恒为 Host home）。
    dialog.rerender(false)
    dialog.rerender(true)
    await waitFor(() => { expect(listCalls).toEqual([undefined, '/home/me/repos', undefined]) })
    await waitFor(() => { expect(screen.getByText('docs')).toBeTruthy() })
    expect(screen.queryByText('app')).toBeNull()
  })
})

describe('DirectoryPickerDialog：新建文件夹', () => {
  it('创建成功：对当前层发精确参数并导航进入新目录', async () => {
    const create = vi.fn(async (path: string, name: string) => `${path}/${name}`)
    const { service, listCalls } = fakeService(
      path => (path === '/home/me/新目录' ? CREATED : path === undefined ? HOME : REPOS),
      create,
    )
    renderDialog(await browsingOf(service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: zh['picker.create'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['picker.createName']), { target: { value: '新目录' } })
    fireEvent.click(screen.getByRole('button', { name: zh['picker.createConfirm'] }))

    await waitFor(() => { expect(create).toHaveBeenCalledTimes(1) })
    expect(create).toHaveBeenCalledWith('/home/me', '新目录')
    // 创建成功后导航进入新目录（防误采纳父目录，D-04）。
    await waitFor(() => { expect(listCalls).toEqual([undefined, '/home/me/新目录']) })
    await waitFor(() => { expect(screen.getByText(zh['picker.empty'])).toBeTruthy() })
    expect(screen.getByText('/home/me/新目录')).toBeTruthy()
  })

  it('创建撞名（exists）：显示 error.exists，不导航、不关闭、新建行保留', async () => {
    // tasks 附录 R1：wire 错误 = Error 实例 + rpcError 载体（禁止对象字面量 throw）；
    // 经真实适配器归一化后对话框收到 DirectoryBrowseError('picker-exists')。
    const existsFailure = Object.assign(
      new Error('directoryPicker.createDirectory: a folder with that name already exists'),
      { rpcError: { code: 'directory-picker/exists', details: { capability: 'browse' } } },
    )
    const create = vi.fn(async () => { throw existsFailure })
    const { service, listCalls } = fakeService(path => (path === undefined ? HOME : REPOS), create)
    const dialog = renderDialog(await browsingOf(service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: zh['picker.create'] }))
    fireEvent.change(screen.getByPlaceholderText(zh['picker.createName']), { target: { value: '新目录' } })
    fireEvent.click(screen.getByRole('button', { name: zh['picker.createConfirm'] }))

    await waitFor(() => { expect(screen.getByText(zh['picker.error.exists'])).toBeTruthy() })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(dialog.onClose).not.toHaveBeenCalled()
    // 不导航：list 仍只有首帧一次；新建行仍在。
    expect(listCalls).toEqual([undefined])
    expect(screen.getByPlaceholderText(zh['picker.createName'])).toBeTruthy()
  })
})

describe('DirectoryPickerDialog：采纳与取消', () => {
  it('onConfirm 返回失败句：原地显示、保持打开、按钮恢复', async () => {
    const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service), {
      onConfirm: vi.fn(async () => '同名根已存在，请换一个路径。'),
    })
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: zh['picker.confirm'] }))
    await waitFor(() => { expect(screen.getByText('同名根已存在，请换一个路径。')).toBeTruthy() })
    expect(dialog.onConfirm).toHaveBeenCalledTimes(1)
    expect(dialog.onConfirm).toHaveBeenCalledWith('/home/me')
    expect(dialog.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    // confirming 结束：确认按钮恢复可点（防重复提交只在请求期间）。
    expect(screen.getByRole('button', { name: zh['picker.confirm'] })).toHaveProperty('disabled', false)
  })

  it('onConfirm 成功（undefined）：onClose 恰好一次', async () => {
    const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service))
    await waitForHome()

    fireEvent.click(screen.getByRole('button', { name: zh['picker.confirm'] }))
    await waitFor(() => { expect(dialog.onClose).toHaveBeenCalledTimes(1) })
    expect(dialog.onConfirm).toHaveBeenCalledWith('/home/me')
  })

  it('Esc 关闭：onClose 一次、onConfirm 零次', async () => {
    const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service))
    await waitForHome()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(dialog.onClose).toHaveBeenCalledTimes(1)
    expect(dialog.onConfirm).not.toHaveBeenCalled()
  })

  it('取消按钮关闭：onClose 一次、onConfirm 零次', async () => {
    const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service))
    await waitForHome()

    // 未开新建行时「取消」只有 footer 一处。
    fireEvent.click(screen.getByRole('button', { name: zh['picker.cancel'] }))
    expect(dialog.onClose).toHaveBeenCalledTimes(1)
    expect(dialog.onConfirm).not.toHaveBeenCalled()
  })

  it('点遮罩关闭：onClose 一次、onConfirm 零次', async () => {
    const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service))
    await waitForHome()

    const mask = document.querySelector('.mrfw-pickerMask')
    expect(mask).toBeTruthy()
    fireEvent.click(mask!)
    expect(dialog.onClose).toHaveBeenCalledTimes(1)
    expect(dialog.onConfirm).not.toHaveBeenCalled()
  })
})

describe('DirectoryPickerDialog：焦点与 a11y', () => {
  it('打开聚焦卡片，关闭归还打开前元素', async () => {
    const opener = document.createElement('button')
    opener.textContent = '拾取入口'
    document.body.appendChild(opener)
    opener.focus()
    try {
      const dialog = renderDialog(await browsingOf((await fakeService(() => HOME)).service))
      await waitFor(() => { expect(screen.getByRole('dialog')).toBeTruthy() })
      // 打开瞬间焦点移到对话框根（tabIndex=-1 的卡片）。
      expect(document.activeElement).toBe(screen.getByRole('dialog'))

      fireEvent.click(screen.getByRole('button', { name: zh['picker.cancel'] }))
      expect(dialog.onClose).toHaveBeenCalledTimes(1)
      // 关闭（卸载前）归还焦点。
      expect(document.activeElement).toBe(opener)
    } finally {
      opener.remove()
    }
  })

  it('role="dialog" + aria-modal + aria-labelledby 指向标题', async () => {
    renderDialog(await browsingOf((await fakeService(() => HOME)).service))
    const card = screen.getByRole('dialog')
    expect(card.getAttribute('aria-modal')).toBe('true')
    const labelledby = card.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(document.getElementById(labelledby ?? '')?.textContent).toBe(zh['picker.title'])
  })
})
