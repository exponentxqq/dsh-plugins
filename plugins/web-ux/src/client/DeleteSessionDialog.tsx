/**
 * 删除确认对话框：`shell.overlay` 上的一个 list entry，空闲时返回 `null`。
 *
 * 它订阅菜单项写入的删除请求 store，一次请求走完五个内部阶段：
 * `previewing`（请求宿主预览）→ `ready`（标题 + 会话数 + 子代理数 + 体积 + 不可逆警示，
 * 确认按钮可用）→ `deleting`（确认按钮禁用并显示进行中）→ `done`（展示警告清单）或
 * `failed`（只读展示原因，**不提供任何确认操作**）。关闭/取消/完成后关闭都调用
 * `settle()` 清空请求，对话框随之消失。
 *
 * 对话框自身不做任何授权判断：预览与执行都由宿主端点独立校验，这里只负责把结果
 * 讲清楚。
 *
 * @module dsh-plugin-web-ux/client/DeleteSessionDialog
 */

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeleteOutcome, DeletePreview } from '../contract.ts'
// Type-only：拉 ui-renderer 的 `ctx.slots` merge（slot 注册面）与 ui-layout 的
// SlotMap merge（`shell.overlay` 这个座位的声明方）。注册本身仍是软注册：壳里没有
// 这个座位时 register 抛错被下面的 try/catch 吃掉，入口静默不出现。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { DeleteError, errorKeyOf, type DeleteClient } from './delete-client.ts'
import type { DeleteRequestStore, DeleteTarget } from './delete-store.ts'
import { NS, type Key } from './locales.ts'
import css from './delete.module.css'

/** 对话框在一次请求内的阶段。 */
export type DeletePhase = 'previewing' | 'ready' | 'deleting' | 'done' | 'failed'

/** 完整 props：覆盖层座位的运行时份额 + 本命名空间的 `t` + 注入面。 */
export type DeleteSessionDialogProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & {
    /** 跨 entry 的删除请求 store（读取面 + 结束面）。 */
    readonly requests: Pick<DeleteRequestStore, 'source' | 'settle'>
    /** 宿主删除端点客户端。 */
    readonly client: DeleteClient
  }

/**
 * 把字节数渲染成本地化的体积文案（B / KB / MB，保留一位小数）。
 * @param bytes - 宿主预览返回的字节数。
 * @param t - 本命名空间的翻译函数。
 * @returns 形如 `1.5 MB` 的文案。
 */
export function formatSize(bytes: number, t: (key: Key, params?: Record<string, unknown>) => string): string {
  const round1 = (value: number): string => String(Math.round(value * 10) / 10)
  if (bytes < 1024) return t('format.bytes', { value: String(bytes) })
  const kb = bytes / 1024
  if (kb < 1024) return t('format.kb', { value: round1(kb) })
  return t('format.mb', { value: round1(kb / 1024) })
}

/**
 * 把任意抛出物归一成可渲染的 {@link DeleteError}。
 * @param error - 预览/执行调用抛出的值。
 * @returns 带稳定失败码的错误；非 DeleteError 一律按未知码处理。
 */
function asDeleteError(error: unknown): DeleteError {
  if (error instanceof DeleteError) return error
  return new DeleteError('fallback', error instanceof Error ? error.message : String(error))
}

/** 内部组件的 props：一个确定的请求目标。 */
interface DeleteSessionBodyProps {
  readonly target: DeleteTarget
  readonly requests: Pick<DeleteRequestStore, 'source' | 'settle'>
  readonly client: DeleteClient
  readonly t: DeleteSessionDialogProps['t']
}

/**
 * 对话框：空闲返回 `null`，一次请求挂载一个内部组件（key 带请求序号：换目标或对同一行
 * 再点一次都会重挂组件、重置阶段与预览）。
 * @param props - 覆盖层运行时份额、请求 store、客户端与 `t`。
 * @returns 模态框，或 `null`（没有删除请求）。
 */
export function DeleteSessionDialog({ requests, client, t }: DeleteSessionDialogProps): ReactNode {
  const target = useSyncExternalStore(requests.source.subscribe, requests.source.getSnapshot)
  if (target === null) return null
  return (
    <DeleteSessionBody
      key={`${target.sessionId}#${String(target.seq)}`}
      target={target}
      requests={requests}
      client={client}
      t={t}
    />
  )
}

/**
 * 一个目标的一次完整交互（预览 → 确认 → 执行 → 结果）。
 * @param props - 目标、请求 store、客户端与 `t`。
 * @returns 模态框。
 */
function DeleteSessionBody({ target, requests, client, t }: DeleteSessionBodyProps): ReactNode {
  const [phase, setPhase] = useState<DeletePhase>('previewing')
  const [preview, setPreview] = useState<DeletePreview | null>(null)
  const [failure, setFailure] = useState<DeleteError | null>(null)
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null)

  // 挂载即预览。组件按 sessionId 做 key，所以这里只需处理「本次请求是否还作数」。
  useEffect(() => {
    let cancelled = false
    void client.preview(target.sessionId).then(
      (value) => {
        if (cancelled) return
        setPreview(value)
        setPhase('ready')
      },
      (error: unknown) => {
        if (cancelled) return
        setFailure(asDeleteError(error))
        setPhase('failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, target.sessionId])

  /** 用户确认：执行端点会当次重新校验，预览数字不携带任何授权语义。 */
  const confirm = (): void => {
    if (phase !== 'ready') return
    setPhase('deleting')
    void client.remove(target.sessionId).then(
      (value) => {
        setOutcome(value)
        setPhase('done')
      },
      (error: unknown) => {
        setFailure(asDeleteError(error))
        setPhase('failed')
      },
    )
  }

  /** 关闭：删除在途时忽略（请求已发出，界面要留在原地报告结果）。 */
  const close = (): void => {
    if (phase === 'deleting') return
    requests.settle()
  }

  // 会话可能没有标题（宿主 SessionHeader 无 title 字段），此时用 id 兜底，绝不给空标题。
  const displayTitle = target.displayTitle === '' ? target.sessionId : target.displayTitle

  const footer = phase === 'done' || phase === 'failed'
    ? (
        <Button variant="outline" onClick={close}>{t('dialog.close')}</Button>
      )
    : (
        <>
          <Button variant="outline" onClick={close} disabled={phase === 'deleting'}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            className={css.danger}
            onClick={confirm}
            disabled={phase !== 'ready'}
          >
            {phase === 'deleting' ? t('dialog.deleting') : t('dialog.confirm')}
          </Button>
        </>
      )

  return (
    <Modal
      open
      onClose={close}
      title={t('dialog.title')}
      closeLabel={t('dialog.close')}
      description={t('dialog.description', { title: displayTitle })}
      footer={footer}
    >
      {phase === 'previewing' && <p className={css.muted}>{t('dialog.previewing')}</p>}

      {preview !== null && phase !== 'failed' && (
        <>
          <ul className={css.summary}>
            <li>{t('dialog.summary.sessions', { count: preview.sessionCount })}</li>
            <li>{t('dialog.summary.descendants', { count: preview.descendantCount })}</li>
            <li>{t('dialog.summary.size', { size: formatSize(preview.logBytes, t) })}</li>
          </ul>
          <p className={css.warning}>{t('dialog.warning.irreversible')}</p>
        </>
      )}

      {phase === 'deleting' && <p className={css.muted}>{t('dialog.deleting')}</p>}

      {phase === 'done' && outcome !== null && (
        <>
          <p className={css.done}>{t('dialog.done', { count: outcome.removed.length })}</p>
          {outcome.warnings.length > 0 && (
            <section className={css.warnings}>
              <p>{t('dialog.warnings')}</p>
              <ul>
                {outcome.warnings.map((warning) => <li key={warning}><code>{warning}</code></li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {phase === 'failed' && failure !== null && (
        <>
          <p className={css.failure}>{t('dialog.failed', { reason: t(errorKeyOf(failure.code)) })}</p>
          {failure.message !== '' && <p className={css.detail}>{failure.message}</p>}
        </>
      )}
    </Modal>
  )
}
