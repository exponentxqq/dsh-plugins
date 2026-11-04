// @vitest-environment jsdom
/**
 * 删除确认对话框的阶段流转与处置方式单选（spec: dsh-web-ux-session-delete
 * 「删除前必须经过预览与二次确认」「处置模式选择」）。
 *
 * 用例全部通过同一个请求 store 驱动真实组件：空闲不渲染、预览中不泄漏确认操作与单选、
 * 可确认时展示标题/会话数/子代理数/体积/归档目录与对应警示、删除中单选与确认按钮一起
 * 禁用、完成后展示 warnings、失败只读展示且不再提供确认。默认档是「移动到归档目录」，
 * 切到「永久删除」后文案与确认语义跟随；预览只发一次，确认时把用户最终选择的模式交给
 * 执行端点。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeleteOutcome, DeletePreview } from '../src/contract.ts'
import { DeleteError, type DeleteClient } from '../src/client/delete-client.ts'
import { createDeleteRequestStore } from '../src/client/delete-store.ts'
import {
  DEFAULT_DISPOSAL_MODE,
  DeleteSessionDialog,
  type DeleteSessionDialogProps,
} from '../src/client/DeleteSessionDialog.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

/** 假宿主解析出的归档根：预览形状、归档目标行断言共用。 */
const ARCHIVE_ROOT = '/home/u/.dsh/archive/sessions'

/** 两档警示的 canonical 文案：断言「出现哪一条」比整段抄写更抗文案微调。 */
const ARCHIVE_WARNING = zh['dialog.warning.archive']
const IRREVERSIBLE_WARNING = zh['dialog.warning.irreversible']

/** 一个可手动落定的 promise。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 用 canonical 中文词典模拟框架注入的 `t`（含 `{name}` 插值）。 */
function translate(key: Key, params?: Record<string, unknown>): string {
  const template = zh[key]
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** 默认成功的假客户端；每个用例只覆盖自己关心的那条路径。 */
function fakeClient(overrides: Partial<DeleteClient> = {}): DeleteClient {
  return {
    preview: vi.fn(async (): Promise<DeletePreview> => ({
      sessionCount: 1,
      descendantCount: 0,
      logBytes: 2048,
      archiveRoot: ARCHIVE_ROOT,
    })),
    remove: vi.fn(async (): Promise<DeleteOutcome> => ({ removed: ['session-1'], warnings: [] })),
    ...overrides,
  }
}

/**
 * 渲染对话框并给出它的请求 store。
 * @param client - 假删除客户端。
 * @returns render 结果 + 用于发起请求的 store。
 */
function renderDialog(client: DeleteClient) {
  const store = createDeleteRequestStore()
  const props = { requests: store, client, t: translate } as unknown as DeleteSessionDialogProps
  return { ...render(<DeleteSessionDialog {...props} />), store }
}

/** 登记一次来自「已归档会话行」的删除请求。 */
async function requestDelete(store: ReturnType<typeof createDeleteRequestStore>, displayTitle = '归档会话'): Promise<void> {
  await act(async () => {
    store.request({ sessionId: 'session-1', displayTitle })
  })
}

/** 当前渲染面上的全部 radio（预览中、失败后、完成后都应当为空）。 */
function allRadios(): HTMLElement[] {
  return screen.queryAllByRole('radio')
}

describe('删除确认对话框', () => {
  it('没有请求时不渲染任何 DOM', () => {
    const { container } = renderDialog(fakeClient())

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('默认「移动到归档目录」：预览 → 确认 → 移动中 → 完成，并在完成后展示 warnings', async () => {
    const preview = deferred<DeletePreview>()
    const remove = deferred<DeleteOutcome>()
    const client = fakeClient({
      preview: vi.fn(() => preview.promise),
      remove: vi.fn(() => remove.promise),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)

    // 预览未回：只说明正在统计，没有数字、没有单选，确认按钮按默认档命名且不可用。
    expect(screen.getByText('正在统计删除范围…')).toBeDefined()
    expect(allRadios()).toHaveLength(0)
    expect(screen.queryByText('会话：3 个')).toBeNull()
    const confirming = screen.getByRole('button', { name: '移动到归档目录' }) as HTMLButtonElement
    expect(confirming.disabled).toBe(true)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('删除已归档会话')
    // 描述按默认档：本次是把日志搬去归档目录，不是永久移除。
    expect(screen.getByText('「归档会话」的会话日志将被移动到归档目录。')).toBeDefined()
    // 预览请求已经带上默认档（两个端点同形请求体，见契约）。
    expect(client.preview).toHaveBeenCalledWith('session-1', DEFAULT_DISPOSAL_MODE)

    await act(async () => {
      preview.resolve({ sessionCount: 3, descendantCount: 2, logBytes: 2048, archiveRoot: ARCHIVE_ROOT })
    })

    // 默认档：归档 radio 选中；体积行是「移动体积」并附归档目录；警示是归档版。
    expect((screen.getByRole('radio', { name: '移动到归档目录' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '永久删除' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('会话：3 个')).toBeDefined()
    expect(screen.getByText('其中子代理会话：2 个')).toBeDefined()
    expect(screen.getByText('移动体积：2 KB')).toBeDefined()
    expect(screen.queryByText('预计释放：2 KB')).toBeNull()
    expect(screen.getByText(`归档目录：${ARCHIVE_ROOT}`)).toBeDefined()
    expect(screen.getByText(ARCHIVE_WARNING)).toBeDefined()
    expect(screen.queryByText(IRREVERSIBLE_WARNING)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '移动到归档目录' }))

    // 执行带的是最终模式；进行中确认按钮与整组单选都禁用。
    expect(client.remove).toHaveBeenCalledTimes(1)
    expect(client.remove).toHaveBeenCalledWith('session-1', 'archive')
    const moving = screen.getByRole('button', { name: '正在移动…' }) as HTMLButtonElement
    expect(moving.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '移动到归档目录' })).toBeNull()
    expect((screen.getByRole('radio', { name: '移动到归档目录' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: '永久删除' }) as HTMLInputElement).disabled).toBe(true)

    await act(async () => {
      remove.resolve({
        removed: ['session-1', 'session-4'],
        warnings: ['/home/x/.dsh/sessions/proj/session-1 -> /home/u/.dsh/archive/sessions/proj/session-1: EACCES'],
      })
    })

    expect(screen.getByText('已移动 2 个会话到归档目录。')).toBeDefined()
    expect(screen.getByText('以下项未能完成，需要手动清理：')).toBeDefined()
    expect(screen.getByText(
      '/home/x/.dsh/sessions/proj/session-1 -> /home/u/.dsh/archive/sessions/proj/session-1: EACCES',
    )).toBeDefined()
    // 完成后不再提供任何处置操作。
    expect(allRadios()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '移动到归档目录' })).toBeNull()

    // 完成后点关闭才清空请求。
    fireEvent.click(screen.getByText('关闭'))
    expect(store.source.getSnapshot()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('切到「永久删除」后文案与确认语义跟随，且预览不重发', async () => {
    const client = fakeClient()
    const { store } = renderDialog(client)

    await requestDelete(store)

    // 切换前是默认归档档。
    expect((screen.getByRole('radio', { name: '移动到归档目录' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: '移动到归档目录' })).toBeDefined()
    expect(screen.getByText('移动体积：2 KB')).toBeDefined()

    fireEvent.click(screen.getByRole('radio', { name: '永久删除' }))

    // 单选、描述、体积行、警示与归档目标行整组换成 delete 口径。
    expect((screen.getByRole('radio', { name: '永久删除' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '移动到归档目录' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('「归档会话」归档的全部内容将被永久移除。')).toBeDefined()
    expect(screen.getByText('预计释放：2 KB')).toBeDefined()
    expect(screen.queryByText('移动体积：2 KB')).toBeNull()
    expect(screen.getByText(IRREVERSIBLE_WARNING)).toBeDefined()
    expect(screen.queryByText(ARCHIVE_WARNING)).toBeNull()
    expect(screen.queryByText(`归档目录：${ARCHIVE_ROOT}`)).toBeNull()

    // 预览只发一次：数字与归档根都与模式无关，切换只改本地文案。
    expect(client.preview).toHaveBeenCalledTimes(1)
    expect(client.preview).toHaveBeenCalledWith('session-1', DEFAULT_DISPOSAL_MODE)
    expect(client.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))

    // 执行带的是用户最终选择的模式，且只发一次。
    expect(client.remove).toHaveBeenCalledTimes(1)
    expect(client.remove).toHaveBeenCalledWith('session-1', 'delete')
    expect(screen.getByRole('button', { name: '正在删除…' })).toBeDefined()
  })

  it('归档执行被拒绝时只读展示归档失败文案', async () => {
    const client = fakeClient({
      remove: vi.fn(async () => {
        throw new DeleteError('archive-unavailable', 'archive root "/x/sessions" is not usable: EACCES')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)
    fireEvent.click(screen.getByRole('button', { name: '移动到归档目录' }))
    await act(async () => {})

    expect(screen.getByText('归档未能完成：归档目录不可用（无法创建或没有写权限），未做任何改动。')).toBeDefined()
    expect(screen.getByText('archive root "/x/sessions" is not usable: EACCES')).toBeDefined()
    expect(client.remove).toHaveBeenCalledWith('session-1', 'archive')
    expect(allRadios()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '移动到归档目录' })).toBeNull()
    expect(store.source.getSnapshot()).not.toBeNull()
  })

  it('预览被拒绝时只读展示原因，不渲染单选', async () => {
    const client = fakeClient({
      preview: vi.fn(async () => {
        throw new DeleteError('not-archived', 'session "session-1" is not archived')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)

    expect(screen.getByText('归档未能完成：该会话已不再处于归档状态；请刷新后重试。')).toBeDefined()
    expect(screen.getByText('session "session-1" is not archived')).toBeDefined()
    expect(allRadios()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '移动到归档目录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()
    expect(screen.queryByText('取消')).toBeNull()
    expect(screen.getByText('关闭')).toBeDefined()
    expect(client.remove).not.toHaveBeenCalled()
  })

  it('永久删除被拒绝时不产生部分删除，界面只读展示原因', async () => {
    const client = fakeClient({
      remove: vi.fn(async () => {
        throw new DeleteError('session-live', 'session "session-1" is still live on the host')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)
    fireEvent.click(screen.getByRole('radio', { name: '永久删除' }))
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))
    await act(async () => {})

    expect(screen.getByText('删除未能完成：该会话仍在宿主机内存中运行；请稍后重试。')).toBeDefined()
    expect(screen.getByText('session "session-1" is still live on the host')).toBeDefined()
    expect(client.remove).toHaveBeenCalledTimes(1)
    expect(client.remove).toHaveBeenCalledWith('session-1', 'delete')
    expect(allRadios()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()
    expect(store.source.getSnapshot()).not.toBeNull()
  })

  it('未知失败码回退到通用文案', async () => {
    const client = fakeClient({
      preview: vi.fn(async () => {
        throw new DeleteError('brand-new-code', 'the host grew a new refusal')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)

    expect(screen.getByText('归档未能完成：操作失败。')).toBeDefined()
  })

  it('取消关闭请求且不调用删除端点', async () => {
    const client = fakeClient()
    const { store } = renderDialog(client)

    await requestDelete(store)
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.click(screen.getByText('取消'))

    expect(store.source.getSnapshot()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(client.remove).not.toHaveBeenCalled()
  })

  it('无标题会话用会话 id 兜底，不给出空标题', async () => {
    const { store } = renderDialog(fakeClient())

    await requestDelete(store, '')

    expect(screen.getByText('「session-1」的会话日志将被移动到归档目录。')).toBeDefined()
  })

  it('同一会话的第二次请求会重新预览（key 带请求序号，不复用上一次的阶段）', async () => {
    const client = fakeClient()
    const { store } = renderDialog(client)

    await requestDelete(store)
    expect(client.preview).toHaveBeenCalledTimes(1)
    expect(client.preview).toHaveBeenLastCalledWith('session-1', DEFAULT_DISPOSAL_MODE)

    await act(async () => {
      store.settle()
    })
    await requestDelete(store)

    expect(client.preview).toHaveBeenCalledTimes(2)
    expect(client.preview).toHaveBeenLastCalledWith('session-1', DEFAULT_DISPOSAL_MODE)
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})
