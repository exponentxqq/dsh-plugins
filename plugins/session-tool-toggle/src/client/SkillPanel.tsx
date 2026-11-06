/**
 * 面板的技能分区：逐 skill 的模型可见性开关（设计附录 §3.3 的技能段，任务 7.1）。
 *
 * 技能行与工具行**不共用** `ToolPanelGroups` 的 `ToolRow`，因为两者的标记语义不同：
 *
 * - `SkillView.disabled` 是**用户意图**（`skill:<name>` 在关闭集里）；
 * - `SkillView.shadowed` 是**实际生效**（本会话已注册影子 stub）。
 *
 * 技能行的 `shadowed` **不能**锁定开关——它恰恰是「已关且已生效」的状态，锁住用户就再也
 * 打不开了（工具行已无 shadowed 概念：清单只含本会话两读）。因此技能行只用
 * 开关表达意图（`checked = !disabled`，与 `ToolRow` 的「开关打开 = 模型可见」同一口径），
 * `shadowed` 只作行内状态标签；点开关发出 `on=true`（打开）或 `on=false`（关闭），界面上的
 * 新状态永远等宿主响应的快照回来才出现（不做乐观更新，与控制器 `toggle` 同纪律）。
 *
 * 四种整块状态：
 *
 * 1. `unavailable`（宿主无 `skills` 服务；容器从快照的 `skills-unavailable` 提示码得出）：
 *    整块降级成一条提示，**不渲染任何开关**（技能地址只记意图，开关点不出真实效果）；
 * 2. `blocked`（整档 `tool:skill` 已关，DQ3=A）：逐行状态原样保留、所有开关置灰，并给一行
 *    提示——整档关闭时影子 stub 不再注册（`planSkills` 的空计划），逐项开关暂不生效；
 * 3. `busy`（`reset()` 在途，没有地址可禁用）：整块开关一起置灰；
 * 4. 正常：按地址 `pending` 逐行禁用并显示「正在应用…」，其余行可点。
 *
 * 分区标题（`section.skills`）不归本组件：容器（任务 7.7）负责把本组件放进分区并加标题，
 * 本组件只保证块内语义与可访问名（`skill.region`）完整。
 *
 * @module dsh-plugin-session-tool-toggle/client/SkillPanel
 */

import type { ReactNode } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillView } from '../contract.ts'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/** 技能地址前缀（宿主 `address.ts` 的规范形；行地址 = `skill:<name>`）。 */
const SKILL_PREFIX = 'skill:'

/** 技能分区的 props（`code-design.md` §3.10 的草案逐字段）。 */
export interface SkillPanelProps {
  /** 宿主的技能行（`PanelSnapshot.skills`；只含模型可调用技能 ∪ 当前已遮蔽名字）。 */
  readonly skills: readonly SkillView[]
  /**
   * 技能服务不可用（容器按 `PanelSnapshot.notices` 里的 `skills-unavailable` 求出；宿主侧
   * 对应 `skillsAvailable === false`）。
   *
   * 为 `true` 时整块降级：只渲染一条提示，不渲染任何开关（此时技能地址只记意图）。
   */
  readonly unavailable: boolean
  /**
   * 整档 `tool:skill` 已关（DQ3=A；容器按 `state.disabled` 含 `tool:skill` 或技能组的
   * `disabled` 求出）。
   *
   * 为 `true` 时逐行状态原样保留、所有开关置灰，并显示一行「暂不生效」提示；不改任何状态。
   */
  readonly blocked: boolean
  /** 在途的开关地址（`panel-controller` 的 `pending`，按 `skill:<name>` 键控）。 */
  readonly pending: ReadonlySet<string>
  /** 面板级在途（`reset()`）：没有地址可禁用，整块开关一起置灰。 */
  readonly busy: boolean
  /**
   * 开关意图：`on === true` 表示用户要把该技能对模型打开（移出关闭集），`false` 表示关闭。
   * 容器把它接到 `controller.toggle(address, on)`。
   * @param address - 规范形地址 `skill:<name>`。
   * @param on - 期望的新状态。
   */
  readonly onToggle: (address: string, on: boolean) => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/** 单行技能 props。 */
interface SkillRowProps {
  readonly skill: SkillView
  /** 整档 `tool:skill` 已关（整块置灰，见 {@link SkillPanelProps.blocked}）。 */
  readonly blocked: boolean
  /** 面板级在途（`reset()`）。 */
  readonly busy: boolean
  /** 这一行自己的地址是否在途。 */
  readonly pending: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}

/**
 * 一个技能行：等宽技能名 + 意图/生效状态标签 + 受控开关。
 *
 * 描述不占版面（与工具行同一取舍：`description` 作为 `title`），已关且分面读数里没有缓存时
 * 是空串，此时 `title` 退回技能名——不渲染一个空提示。
 * @param props - 行数据与交互。
 * @returns 一行 `<li>`。
 */
function SkillRow({ skill, blocked, busy, pending, onToggle, t }: SkillRowProps): ReactNode {
  const address = `${SKILL_PREFIX}${skill.name}`
  const locked = blocked || busy || pending
  return (
    <li className={css.row}>
      <span className={css.rowName}>
        <code className={css.name} title={skill.description === '' ? skill.name : skill.description}>
          {skill.name}
        </code>
        {skill.disabled && (
          <span className={css.tag}>
            {skill.shadowed ? t('skill.effective') : t('skill.intentOnly')}
          </span>
        )}
        {pending && <span className={css.pending}>{t('skill.pending')}</span>}
      </span>
      <Switch
        checked={!skill.disabled}
        disabled={locked}
        label={t('skill.switchLabel', { name: skill.name })}
        onChange={(next) => {
          // 原生 `disabled` 只挡真实用户手势；程序化 dispatch 仍会进来，这里守一道。
          if (locked) return
          onToggle(address, next)
        }}
      />
    </li>
  )
}

/**
 * 技能分区：逐 skill 行开关、`unavailable` 降级、`blocked` 置灰 + 提示、`pending`/`busy` 三态。
 * @param props - 见 {@link SkillPanelProps}。
 * @returns 一个带可访问名的分区。
 */
export function SkillPanel({
  skills,
  unavailable,
  blocked,
  pending,
  busy,
  onToggle,
  t,
}: SkillPanelProps): ReactNode {
  // 降级优先于置灰：没有技能服务时逐项开关本来就没有真实效果，渲染出来只会误导。
  if (unavailable) {
    return (
      <section className={css.section} aria-label={t('skill.region')}>
        <p className={css.warning}>{t('skill.unavailable')}</p>
      </section>
    )
  }

  return (
    <section className={css.section} aria-label={t('skill.region')}>
      {blocked && <p className={css.warning}>{t('skill.blocked')}</p>}
      {skills.length === 0
        ? <p className={css.empty}>{t('skill.empty')}</p>
        : (
          <ul className={css.rows}>
            {skills.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                blocked={blocked}
                busy={busy}
                pending={pending.has(`${SKILL_PREFIX}${skill.name}`)}
                onToggle={onToggle}
                t={t}
              />
            ))}
          </ul>
        )}
    </section>
  )
}
