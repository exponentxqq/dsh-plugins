// @vitest-environment jsdom
/**
 * 删除确认对话框的阶段流转（spec: dsh-web-ux-session-delete「删除前必须经过预览与二次确认」）。
 *
 * 用例全部通过同一个请求 store 驱动真实组件：空闲不渲染、预览中不泄漏确认操作、可确认时
 * 展示标题/会话数/子代理数/体积/不可逆警示、删除中确认按钮禁用、完成后展示 warnings、失败
 * 只读展示且不再提供确认。确认动作必须真的落到 `client.remove`，预览结论不构成授权。
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeleteOutcome, DeletePreview } from '../src/contract.ts'
import { DeleteError, type DeleteClient } from '../src/client/delete-client.ts'
import { createDeleteRequestStore } from '../src/client/delete-store.ts'
import { DeleteSessionDialog, type DeleteSessionDialogProps } from '../src/client/DeleteSessionDialog.tsx'
import { zh, type Key } from '../src/client/locales.ts'

afterEach(cleanup)

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
    preview: vi.fn(async (): Promise<DeletePreview> => ({ sessionCount: 1, descendantCount: 0, logBytes: 0 })),
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

describe('删除确认对话框', () => {
  it('没有请求时不渲染任何 DOM', () => {
    const { container } = renderDialog(fakeClient())

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('预览中 → 可确认 → 删除中 → 完成，并在完成后展示 warnings', async () => {
    const preview = deferred<DeletePreview>()
    const remove = deferred<DeleteOutcome>()
    const client = fakeClient({
      preview: vi.fn(() => preview.promise),
      remove: vi.fn(() => remove.promise),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)

    // 预览未回：只说明正在统计，没有数字，确认按钮也还不可用。
    expect(screen.getByText('正在统计删除范围…')).toBeDefined()
    expect(screen.queryByText('会话：3 个')).toBeNull()
    expect((screen.getByRole('button', { name: '永久删除' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('删除已归档会话')
    expect(screen.getByText('「归档会话」归档的全部内容将被永久移除。')).toBeDefined()

    await act(async () => {
      preview.resolve({ sessionCount: 3, descendantCount: 2, logBytes: 2048 })
    })

    expect(screen.getByText('会话：3 个')).toBeDefined()
    expect(screen.getByText('其中子代理会话：2 个')).toBeDefined()
    expect(screen.getByText('预计释放：2 KB')).toBeDefined()
    expect(screen.getByText(
      '删除不可撤销：会话日志与投影缓存会被移除，工作区记录同步清除，任何界面都无法恢复。共享附件存储不会被清理。',
    )).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))

    expect(client.remove).toHaveBeenCalledWith('session-1')
    const deleting = screen.getByRole('button', { name: '正在删除…' }) as HTMLButtonElement
    expect(deleting.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()

    await act(async () => {
      remove.resolve({
        removed: ['session-1', 'session-4'],
        warnings: ['/home/x/.dsh/sessions/proj/session-1: EACCES'],
      })
    })

    expect(screen.getByText('已删除 2 个会话。')).toBeDefined()
    expect(screen.getByText('以下文件删除失败，需要手动清理：')).toBeDefined()
    expect(screen.getByText('/home/x/.dsh/sessions/proj/session-1: EACCES')).toBeDefined()
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()

    // 完成后点关闭才清空请求。
    fireEvent.click(screen.getByText('关闭'))
    expect(store.source.getSnapshot()).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('预览被拒绝时只读展示原因，不提供确认操作', async () => {
    const client = fakeClient({
      preview: vi.fn(async () => {
        throw new DeleteError('not-archived', 'session "session-1" is not archived')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)

    expect(screen.getByText('删除未能完成：该会话已不再处于归档状态；请刷新后重试。')).toBeDefined()
    expect(screen.getByText('session "session-1" is not archived')).toBeDefined()
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()
    expect(screen.queryByText('取消')).toBeNull()
    expect(screen.getByText('关闭')).toBeDefined()
    expect(client.remove).not.toHaveBeenCalled()
  })

  it('删除被拒绝时不产生部分删除，界面只读展示原因', async () => {
    const client = fakeClient({
      remove: vi.fn(async () => {
        throw new DeleteError('session-live', 'session "session-1" is still live on the host')
      }),
    })
    const { store } = renderDialog(client)

    await requestDelete(store)
    fireEvent.click(screen.getByRole('button', { name: '永久删除' }))
    await act(async () => {})

    expect(screen.getByText('删除未能完成：该会话仍在宿主机内存中运行；请稍后重试。')).toBeDefined()
    expect(screen.getByText('session "session-1" is still live on the host')).toBeDefined()
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

    expect(screen.getByText('删除未能完成：操作失败。')).toBeDefined()
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

    expect(screen.getByText('「session-1」归档的全部内容将被永久移除。')).toBeDefined()
  })

  it('同一会话的第二次请求会重新预览（key 带请求序号，不复用上一次的阶段）', async () => {
    const client = fakeClient()
    const { store } = renderDialog(client)

    await requestDelete(store)
    expect(client.preview).toHaveBeenCalledTimes(1)

    await act(async () => {
      store.settle()
    })
    await requestDelete(store)

    expect(client.preview).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})
