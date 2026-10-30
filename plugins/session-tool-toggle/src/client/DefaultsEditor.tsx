/**
 * 面板第三段：用户级默认档编辑区（设计附录 §3.4）。
 *
 * 默认档是**用户级**状态（`$DSH_HOME/session-tool-toggle/defaults.json`），只作为新会话创建
 * 时快照的来源：本区保存成功后**不**重拉会话快照、也**不**提供「应用到本会话」——D18 的
 * 「不追溯」在界面上就是这两句事实文案（`defaults.scope` / `defaults.snapshot`）。
 *
 * 三条刻意不做的事：
 *
 * 1. **不在客户端校验文法**：输入按空白/逗号切成地址就交给宿主（`action:'off'`），文法与保护
 *    名单的唯一权威在宿主 `address.ts`；客户端猜文法必然与宿主漂移，失败由宿主回稳定码
 *    （`bad-address` / `defaults-unwritable` …），主文案按 `error.<code>` 渲染、`error.message`
 *    只作二级灰字。失败文案的键映射由容器（`ToolPanelAction`）负责，本组件只渲染字符串。
 * 2. **不做乐观更新**：条目列表读 `state.defaults`（宿主返回的活视图），保存期间整区禁用。
 * 3. **不上 `RiskConfirmation`**：清空默认档不可逆性低（只影响之后新建的会话），二次确认用
 *    按钮文案变化实现（`defaults.clear` → `defaults.clearConfirm`）。
 *
 * @module dsh-plugin-session-tool-toggle/client/DefaultsEditor
 */

import { useState, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DefaultsAction, DefaultsView } from '../contract.ts'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 一段已本地化的失败展示：主文案（`error.<code>`）+ 宿主兜底说明（不参与本地化）。
 *
 * 键 → 文案的映射放在面板容器里：`bad-address` / `protected` / `defaults-unwritable` 这些键带
 * `{address}` / `{names}` / `{path}` 占位符，占位符的取值来自 `PanelError.details`，属于
 * 「失败码 → 文案」的唯一实现点（设计 §3.5 的渲染规则）。
 */
export interface PanelFailure {
  /** 主文案（已插值）。 */
  readonly text: string
  /** 宿主的 `error.message`（二级灰字；空串或缺省时不渲染）。 */
  readonly detail?: string
}

/** 默认档编辑区的 props。 */
export interface DefaultsEditorProps {
  /** 宿主返回的默认档活视图（`panel-controller` 的 `state.defaults`）。 */
  readonly defaults: DefaultsView
  /** 本会话创建时间（epoch ms）：讲「本会话的快照来源」。 */
  readonly createdAt: number
  /** 本会话创建时快照的条目数（`state.snapshot.length`）。 */
  readonly snapshotCount: number
  /** 写在途（`savingDefaults`）：整区禁用。 */
  readonly saving: boolean
  /**
   * 上一次写入已被宿主确认（「已保存（本会话不变）」）。
   *
   * 由容器在写入的 promise 落定后判定：React 18 的批处理会把「在途 → 落定」合成一次渲染，
   * 组件内观察 `saving` 的翻转会漏掉成功信号，所以这个事实归持有控制器的容器。
   */
  readonly saved: boolean
  /** 上一次保存失败（已本地化）；成功或无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /**
   * 提交一次默认档写入。
   *
   * 语义与 `defaults` 端点一致：`off` = 加入默认档、`on` = 移出默认档、`reset` = 整份清空
   * （`reset` 不带地址）。
   * @param action - 动作。
   * @param addresses - 目标地址（`reset` 时缺省）。
   */
  readonly onUpdate: (action: DefaultsAction, addresses?: readonly string[]) => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 把字节时间渲染成本地时间文案。
 * @param at - epoch ms。
 * @returns 本地化的日期时间串（`0` 也照实显示，不伪造）。
 */
function formatTime(at: number): string {
  return new Date(at).toLocaleString()
}

/**
 * 把自由文本切成地址（空白与中英文逗号都算分隔符）。
 *
 * **不校验文法**：`mcp:` / `tool:` / `skill` 的合法性与保护名单只由宿主判定；这里连
 * `mcp__` 这种内部形都不拒绝——客户端多一条规则就多一处与宿主漂移的地方。
 * @param text - 输入框原文。
 * @returns 去空段后的地址数组（可能为空）。
 */
export function splitAddresses(text: string): string[] {
  return text.split(/[\s,，]+/u).filter((part) => part !== '')
}

/**
 * 默认档编辑区：路径 + 条目列表 + 自由文本添加 + 清空 + 三句事实文案。
 * @param props - 见 {@link DefaultsEditorProps}。
 * @returns 面板第三段。
 */
export function DefaultsEditor({
  defaults,
  createdAt,
  snapshotCount,
  saving,
  saved,
  failure,
  onUpdate,
  t,
}: DefaultsEditorProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [armed, setArmed] = useState(false)

  /** 提交添加：空输入是空操作，非空就把切出来的地址整份交给宿主。 */
  const add = (): void => {
    const addresses = splitAddresses(draft)
    if (addresses.length === 0) return
    setDraft('')
    setArmed(false)
    onUpdate('off', addresses)
  }

  /**
   * 移除一条默认档条目（`on` = 从关闭集移出 = 新会话不再关它）。
   * @param address - 条目地址。
   */
  const remove = (address: string): void => {
    setArmed(false)
    onUpdate('on', [address])
  }

  /** 清空默认档：第一次点击只改文案，第二次才真的发请求。 */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onUpdate('reset')
  }

  const canAdd = !saving && draft.trim() !== ''

  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>{t('section.defaults')}</h3>

      <p className={css.meta}>
        <span>{t('defaults.path')}</span>
        <code className={css.path}>{defaults.path}</code>
      </p>

      {defaults.corrupt && <p className={css.warning}>{t('notice.defaults-corrupt')}</p>}

      {defaults.disabled.length === 0
        ? <p className={css.muted}>{t('defaults.empty')}</p>
        : (
          <ul className={css.chips}>
            {defaults.disabled.map((address) => (
              <li key={address} className={css.chip}>
                <code className={css.address} title={address}>{address}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t('defaults.remove')} ${address}`}
                  disabled={saving}
                  onClick={() => {
                    remove(address)
                  }}
                >
                  {t('defaults.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}

      <div className={css.addRow}>
        <Input
          className={css.addInput}
          value={draft}
          placeholder={t('defaults.addPlaceholder')}
          aria-label={t('defaults.addPlaceholder')}
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <Button variant="primary" size="sm" disabled={!canAdd} onClick={add}>{t('defaults.add')}</Button>
      </div>

      <p className={css.muted}>{t('defaults.placeholder')}</p>
      <p className={css.muted}>{t('defaults.scope')}</p>
      <p className={css.meta}>{t('defaults.snapshot', { time: formatTime(createdAt), count: snapshotCount })}</p>

      <div className={css.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={saving || defaults.disabled.length === 0}
          onClick={clear}
        >
          {armed ? t('defaults.clearConfirm') : t('defaults.clear')}
        </Button>
        {saved && <span className={css.saved}>{t('defaults.saved')}</span>}
      </div>

      {failure !== undefined && (
        <div role="alert">
          <p className={css.error}>{failure.text}</p>
          {failure.detail !== undefined && <p className={css.detail}>{failure.detail}</p>}
        </div>
      )}
    </section>
  )
}
