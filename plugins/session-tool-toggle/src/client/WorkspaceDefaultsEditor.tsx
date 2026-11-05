/**
 * 工作区默认档编辑器（设计附录 §3.4 / 代码设计 §3.10 的 C2）。
 *
 * 字段面与 `DefaultsEditor` 同款：工作区键/文件路径 + 关闭项清单（逐项移除）+ 自由文本添加框
 * + 清空 + 「只影响之后新建的会话」。三处差异：
 *
 * 1. **两形态**：`variant='section'` 是面板里的一个分区（`<section>`，无对话框根、无下拉），
 *    `variant='dialog'` 是统一工作区配置弹窗的分节正文（`workspace-config.section` 座位）——
 *    `role="dialog"` 根由 holder `dsh-plugin-workspace-config` 的 `Modal` 提供，本组件只交付
 *    正文壳 + 工作区下拉。
 *    下拉只在分节正文形态出现——面板分区的作用域恒为「当前会话所属工作区」（spec「工作区默认档
 *    分节」），在分区里换工作区会与「面板只改本会话工作区」的预期冲突（code-design §3.10）。
 * 2. **并集一句说明**（DQ2=A）：界面**不**标注每一项来自用户档还是工作区档，只给一句
 *    「新会话初始关闭 = 用户级默认档 ∪ 本工作区默认档」，把合并语义先说清、再让用户看到
 *    本工作区的增量。
 * 3. **工作区无法归属**（`workspace === null`）：只读降级——显示 `workspace.unresolved`，
 *    不渲染添加框/清空（写入目标不存在）；分节正文形态仍可下拉切换到已登记工作区。
 *
 * 与 `DefaultsEditor` 同一条纪律：**不在客户端校验文法**。输入按空白/逗号切成地址就交给宿主
 * （`action:'off'`），文法、保护名单与上限的唯一权威在宿主；失败由宿主回稳定码
 * （`workspace-unresolved` / `workspace-unwritable` / …），主文案按 `error.<code>` 由持有
 * 控制器的容器渲染成 {@link PanelFailure} 传进来，本组件只渲染字符串。
 *
 * 每个动作都是一次**立即写入**（宿主 `workspaces.json`），没有独立的「保存」按钮：
 * 添加 = `off`（加入本工作区档）、逐项移除 = `on`（移出）、清空 = `reset`（清空本工作区条目）。
 * 写入成功的确认走 `saved`（「已保存（本会话不变）」）——工作区档与默认档一样不追溯（D18）。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceDefaultsEditor
 */

import { useState, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceAction, WorkspaceChoice, WorkspaceView } from '../contract.ts'
import { splitAddresses, type PanelFailure } from './DefaultsEditor.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/** 渲染形态：面板分区，或统一工作区配置弹窗的分节正文。 */
export type WorkspaceDefaultsVariant = 'section' | 'dialog'

/** 工作区默认档编辑器的 props（code-design §3.10 冻结形状）。 */
export interface WorkspaceDefaultsEditorProps {
  /**
   * 当前编辑目标的工作区视图（宿主返回的活视图）。
   *
   * `null` = 当前会话 cwd 无法归属 / 目标未登记：界面按只读降级，不渲染写入入口。
   */
  readonly workspace: WorkspaceView | null
  /** 下拉可选项（`WorkspaceValue.choices`，已登记工作区，按标题+路径排序）。 */
  readonly choices: readonly WorkspaceChoice[]
  /** 渲染形态（见文件头注释）。 */
  readonly variant: WorkspaceDefaultsVariant
  /** 写在途（父级 hook 的 `saving`）：整区禁用。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存（本会话不变）」）。 */
  readonly saved: boolean
  /** 上一次写入的失败（已本地化，由父级按 `error.<code>` 映射）；无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /**
   * 切换目标工作区（只有 `dialog` 形态渲染下拉）。
   * @param key - 工作区规范路径（`WorkspaceChoice.key`）。
   */
  readonly onSelect: (key: string) => void
  /**
   * 提交一次工作区档写入。
   *
   * 语义与 `workspace` 端点一致：`off` = 加入本工作区档、`on` = 移出、`reset` = 清空本工作区
   * 条目（不带地址）。每个动作都是一次立即写入，没有「暂存后统一保存」的中间态。
   * @param action - 动作。
   * @param addresses - 目标地址（`reset` 时缺省）。
   */
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  /** 重新读取当前目标工作区（父级 hook 的 `read`）。 */
  readonly onRefresh: () => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 工作区默认档编辑器。
 * @param props - 见 {@link WorkspaceDefaultsEditorProps}。
 * @returns 面板分区或分节正文。
 */
export function WorkspaceDefaultsEditor({
  workspace,
  choices,
  variant,
  saving,
  saved,
  failure,
  onSelect,
  onUpdate,
  onRefresh,
  t,
}: WorkspaceDefaultsEditorProps): ReactNode {
  const [draft, setDraft] = useState('')
  /** 清空按钮的两段式确认（不可逆性低，用文案变化代替 `RiskConfirmation`）。 */
  const [armed, setArmed] = useState(false)

  const dialog = variant === 'dialog'
  /** 写入目标存在才允许写（`null` = 工作区无法归属 / 未登记）。 */
  const writable = workspace !== null
  const disabled = workspace?.disabled ?? []
  const selectable = workspace?.key ?? ''

  // 当前工作区可能不在 choices 里（未登记工作区 / 列表过期）：补一项，避免 select 显示空白。
  const missingChoice =
    workspace !== null && !choices.some((choice) => choice.key === workspace.key)
  const options: readonly WorkspaceChoice[] = missingChoice
    ? [...choices, { key: workspace.key, title: workspace.title ?? workspace.key }]
    : choices

  /** 提交添加：空输入是空操作；地址切分与默认档同一实现（不校验文法）。 */
  const add = (): void => {
    const addresses = splitAddresses(draft)
    if (addresses.length === 0) return
    setDraft('')
    setArmed(false)
    onUpdate('off', addresses)
  }

  /**
   * 移除一条工作区档条目（`on` = 从关闭集移出 = 该工作区的新会话不再关它）。
   * @param address - 条目地址。
   */
  const remove = (address: string): void => {
    setArmed(false)
    onUpdate('on', [address])
  }

  /** 清空本工作区条目：第一次点击只改文案，第二次才真的发请求。 */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onUpdate('reset')
  }

  const canAdd = writable && !saving && draft.trim() !== ''

  const body = (
    <>
      <h3 className={css.sectionTitle}>{t('workspace.title')}</h3>

      {dialog && (
        <div className={css.addRow}>
          <span className={css.meta}>{t('workspace.select')}</span>
          <select
            className={css.select}
            value={selectable}
            aria-label={t('workspace.select')}
            disabled={saving}
            onChange={(event) => {
              onSelect(event.target.value)
            }}
          >
            {selectable === '' && (
              <option value="" disabled>
                {t('workspace.select')}
              </option>
            )}
            {options.map((choice) => (
              <option key={choice.key} value={choice.key}>{choice.title}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              onRefresh()
            }}
          >
            {t('workspace.refresh')}
          </Button>
        </div>
      )}

      {workspace === null
        ? <p className={css.muted}>{t('workspace.unresolved')}</p>
        : (
          <>
            <p className={css.meta}>
              <span>{t('workspace.key')}</span>
              <code className={css.path}>{workspace.key}</code>
              <span>{workspace.registered ? t('workspace.registered') : t('workspace.unregistered')}</span>
            </p>

            <p className={css.meta}>
              <span>{t('workspace.path')}</span>
              <code className={css.path}>{workspace.path}</code>
            </p>

            {workspace.corrupt && <p className={css.warning}>{t('workspace.corrupt')}</p>}

            {disabled.length === 0
              ? <p className={css.muted}>{t('workspace.empty')}</p>
              : (
                <ul className={css.chips}>
                  {disabled.map((address) => (
                    <li key={address} className={css.chip}>
                      <code className={css.address} title={address}>{address}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('workspace.removeAria', { address })}
                        disabled={saving}
                        onClick={() => {
                          remove(address)
                        }}
                      >
                        {t('workspace.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

            <div className={css.addRow}>
              <Input
                className={css.addInput}
                value={draft}
                placeholder={t('workspace.addPlaceholder')}
                aria-label={t('workspace.addPlaceholder')}
                disabled={saving}
                onChange={(event) => {
                  setDraft(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') add()
                }}
              />
              <Button variant="primary" size="sm" disabled={!canAdd} onClick={add}>{t('workspace.add')}</Button>
            </div>

            <p className={css.muted}>{t('workspace.placeholder')}</p>
          </>
        )}

      <p className={css.muted}>{t('workspace.scope')}</p>
      <p className={css.muted}>{t('workspace.union')}</p>

      <div className={css.actions}>
        {!dialog && (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              onRefresh()
            }}
          >
            {t('workspace.refresh')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={!writable || saving || disabled.length === 0}
          onClick={clear}
        >
          {armed ? t('workspace.clearConfirm') : t('workspace.clear')}
        </Button>
        {saved && <span className={css.saved}>{t('workspace.saved')}</span>}
      </div>

      {failure !== undefined && (
        <div role="alert">
          <p className={css.error}>{failure.text}</p>
          {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
        </div>
      )}
    </>
  )

  // 分节正文形态只交付正文壳：`role="dialog"` 由 holder（`dsh-plugin-workspace-config`）的
  // 统一弹窗壳 `Modal` 提供，本组件再带一层会构成嵌套 dialog（A11y 双根）。
  // 正文壳**不**复用 `.dialog`（760px 卡片宽度）：右栏内容列的宽度由 holder 约束，
  // 嵌套固定宽度会溢出，宽度约束归持有 `Modal` 的 holder。
  return dialog
    ? <div className={css.workspaceBody}>{body}</div>
    : <section className={css.section}>{body}</section>
}
