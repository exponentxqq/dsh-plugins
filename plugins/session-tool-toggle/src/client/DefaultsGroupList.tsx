/**
 * 默认档的分组开关清单（`code-design.md` ③ 3.19 / W5；D10 / D-20）。
 *
 * 两个编辑器（用户级 `DefaultsEditor` / 工作区级 `WorkspaceDefaultsEditor`）共用本组件：
 * 它们只在「这份关闭集写到哪里」上不同（`updateDefaults` / `updateWorkspace`），清单形状与
 * 开关语义完全同构。
 *
 * 与面板第二段（`ToolPanelGroups`）的关系是**复用模式，不共用组件**（D-20）：同样的三段式
 * 分组、同样的 `.groups/.group/.groupHeader/...` 样式类、同样的 `groupTitle` /
 * `defaultExpanded` 两个纯函数，但行数据是 `DefaultsEntry`（没有 `disabled` / `shadowed`，
 * 状态由目标档关闭集求交），并多出「整组在档 → 组内行禁用」与「残留地址只能移除」两条默认档
 * 独有的语义。
 *
 * 开关口径（与 `defaults-view.ts` 的三计数严格一致）：
 *
 * - `checked = !disabled.has(address)`——目标档关闭集是「关」的唯一事实，不做乐观更新；
 * - 组开关打组地址（`mcp:<server>` / `tool:skill`），行开关打行地址（`mcp:<s>::<t>` /
 *   `skill:<name>` / `tool:<name>`）；内置工具组没有组开关（`address === null`，宿主口径）；
 * - 锁态两态（`protected` / `reserved`）与整组在档（`blocked`）都让**行**禁用：前者是宿主写
 *   路径的硬拒绝，后者是「整组默认关时逐项开关不生效」的语义；组开关本身只受 `busy` 影响
 *   ——它正是把整组从档里拿掉的入口；
 * - `busy`（写在途）同时禁用组开关、行开关与残留 chip 的移除按钮；
 * - 残留地址 = 目标档里不在宇宙中的地址（{@link residualOf}），**只能移除、没有添加入口**：
 *   跨清单的新关走命令（`copy.cliHint`）。
 *
 * 宇宙不可用（`null` / `layerReady:false`）时只渲染降级说明 + 残留区 + 命令提示，**不渲染
 * 组清单**：层未就绪说明宿主读不到会话清单，远端残影 `groups` 不可信（与 `defaults-view.ts`
 * 的 `listed = 0` 同一口径）。
 *
 * @module dsh-plugin-session-tool-toggle/client/DefaultsGroupList
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  Button,
  Input,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DefaultsEntry, DefaultsGroup, DefaultsUniverse } from '../contract.ts'
import { residualOf } from './defaults-view.ts'
import { defaultExpanded, groupTitle } from './ToolPanelGroups.tsx'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/** 残留区/CLI 提示的文案束：两个编辑器各传自己的键（用户级 / 工作区级措辞不同）。 */
export interface DefaultsGroupCopy {
  /** 残留区标题（`defaults.residualTitle`；两个编辑器共用同一句「只能移除」）。 */
  readonly residualTitle: string
  /** chip 上的移除按钮文案（`defaults.remove` / `workspace.remove`）。 */
  readonly removeLabel: string
  /**
   * chip 移除按钮的可访问名。
   * @param address - 该 chip 的地址。
   * @returns 已插值的可访问名（用户级拼 `defaults.remove` + 地址，工作区级用 `workspace.removeAria`）。
   */
  readonly removeAria: (address: string) => string
  /** 命令兜底说明（`defaults.cliHint` / `workspace.cliHint`）：本页只列本会话可见工具。 */
  readonly cliHint: string
}

/** 默认档分组开关清单的 props。 */
export interface DefaultsGroupListProps {
  /** 目标无关的工具宇宙；`null` / `layerReady:false` 时只渲染残留区。 */
  readonly universe: DefaultsUniverse | null
  /** 目标档的关闭集（工作区档 `workspace.disabled` / 用户级 `defaults.disabled`）。 */
  readonly disabled: readonly string[]
  /** 写在途：整份清单的开关与移除按钮一起禁用。 */
  readonly busy: boolean
  /**
   * 开关意图：`on === true` 表示把该地址**移出**目标档（开启），`false` 表示加入（关闭）。
   * 用户级容器接 `updateDefaults`，工作区容器接 `updateWorkspace`。
   * @param address - 规范形地址（组地址或行地址）。
   * @param on - 期望的新状态。
   */
  readonly onToggle: (address: string, on: boolean) => void
  /** 残留区 / CLI 提示的文案束（两个编辑器各传自己的键）。 */
  readonly copy: DefaultsGroupCopy
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/** 一行被锁定的理由：行内短标签 + 悬停/读屏同一句解释。 */
interface LockNotice {
  /** 行内短标签文案（`entry.protected` / `entry.reserved`）。 */
  readonly tag: string
  /** `title` 与读屏共用的理由（`badge.*`）。 */
  readonly reason: string
}

/**
 * 判定一条默认档条目的两态锁：保护名单优先于保留名。
 *
 * 两个标记都来自宿主（`DefaultsEntry.protected` / `reserved`），命中即写路径拒绝；同一行命中
 * 多个时讲保护名单那条（与 `ToolPanelGroups.lockOf` 同序）。
 * @param entry - 默认档条目。
 * @param t - 翻译函数。
 * @returns 锁信息；可切换时是 `undefined`。
 */
function lockOf(entry: DefaultsEntry, t: Translate): LockNotice | undefined {
  if (entry.protected) return { tag: t('entry.protected'), reason: t('badge.protected') }
  if (entry.reserved) return { tag: t('entry.reserved'), reason: t('badge.reserved') }
  return undefined
}

/** 单行默认档条目的 props。 */
interface DefaultsRowProps {
  /** 行数据（地址 + 短名 + 两态锁标记）。 */
  readonly entry: DefaultsEntry
  /** 目标档关闭集（`checked = !disabledSet.has(entry.address)`）。 */
  readonly disabledSet: ReadonlySet<string>
  /** 整组地址在目标档里：本行整体禁用并标 `defaults.groupOff`。 */
  readonly blocked: boolean
  /** 写在途（整份清单禁用）。 */
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}

/**
 * 一个默认档条目行：等宽短名 + 锁态/整组在档标签 + 受控开关。
 *
 * 描述不占版面（设计 §3.3 的同一口径：`description` 作为 `title`），长描述不会把开关挤出可视区。
 * 禁用优先级：`busy` ∨ 锁态 ∨ 整组在档——锁态是宿主硬约束，整组在档是「逐项开关不生效」的语义。
 * @param props - 行数据与交互。
 * @returns 一行 `<li>`。
 */
function DefaultsRow({ entry, disabledSet, blocked, busy, onToggle, t }: DefaultsRowProps): ReactNode {
  const lock = lockOf(entry, t)
  const groupOff = blocked ? t('defaults.groupOff') : undefined
  // 锁态优先讲硬约束；整组在档另起一个标签（两者可同时成立，设计 ③3.19 的 blocked 行要求带
  // `defaults.groupOff`，锁态行要求带 `entry.*`，所以两个标签并列而不是互相顶掉）。
  const reason = lock?.reason ?? groupOff
  const disabled = busy || lock !== undefined || blocked
  return (
    <li className={css.row}>
      <span className={css.rowName}>
        <code className={css.name} title={entry.description ?? entry.shortName}>{entry.shortName}</code>
        {lock !== undefined && <span className={css.tag} title={lock.reason}>{lock.tag}</span>}
        {groupOff !== undefined && <span className={css.tag} title={groupOff}>{groupOff}</span>}
      </span>
      <Switch
        checked={!disabledSet.has(entry.address)}
        disabled={disabled}
        title={reason}
        label={t('defaults.switchLabel', { name: entry.shortName })}
        onChange={(next) => {
          // 原生 `disabled` 只挡真实用户手势；程序化 dispatch 仍会进来，这里守一道。
          if (disabled) return
          onToggle(entry.address, next)
        }}
      />
    </li>
  )
}

/** 单个分区的 props。 */
interface DefaultsGroupRowProps {
  readonly group: DefaultsGroup
  /** 目标档关闭集（组地址与行地址都在里面求交）。 */
  readonly disabledSet: ReadonlySet<string>
  /** 技能服务是否可用（`false` 时技能组整区不出行，只留组开关 + `skill.unavailable`）。 */
  readonly skillsAvailable: boolean
  /** 写在途（组开关禁用）。 */
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}

/**
 * 一个默认档分区：可折叠标题行（计数 + 整组开关）+ 展开后的条目行；内置工具分区额外带过滤输入。
 *
 * 折叠态与过滤词都是**组件本地状态**（按分组实例存活）：换一次目标档快照不该把用户展开到一半
 * 的清单收回去——所以 key 用 `group.kind:group.key`，状态跟着同一个分区走。
 * @param props - 分区数据与交互。
 * @returns 一个 `<li>`。
 */
function DefaultsGroupRow({
  group,
  disabledSet,
  skillsAvailable,
  busy,
  onToggle,
  t,
}: DefaultsGroupRowProps): ReactNode {
  const [expanded, setExpanded] = useState<boolean>(() => defaultExpanded(group.kind))
  const [filter, setFilter] = useState('')

  // 过滤只作用于内置工具分区（MCP 组的折叠已经承担了「收起噪音」的职责）。
  const tools = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (group.kind !== 'builtin' || needle === '') return group.tools
    return group.tools.filter((entry) => entry.shortName.toLowerCase().includes(needle))
  }, [filter, group.kind, group.tools])

  // 组地址先落到 const：闭包里再读 `group.address` 会丢掉 `!== null` 的收窄。
  const address = group.address
  // 整组地址在档里 → 组内所有行禁用（组开关本身仍可点：它是把整组拿出来的入口）。
  const blocked = address !== null && disabledSet.has(address)
  const count = group.tools.length
  const inDefaults = group.tools.reduce(
    (sum, entry) => (disabledSet.has(entry.address) ? sum + 1 : sum),
    0,
  )
  const title = groupTitle(group.kind, t)
  // 技能服务不可用：技能组只留整档开关 + 一行降级提示，行区整区不渲染。
  const degraded = group.kind === 'skill' && !skillsAvailable

  return (
    <li className={css.group}>
      <div className={css.groupHeader}>
        <button
          type="button"
          className={css.groupToggle}
          aria-expanded={expanded}
          title={t('defaults.groupSummary', { count, inDefaults })}
          onClick={() => {
            setExpanded((value) => !value)
          }}
        >
          {expanded ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
          <span className={css.groupTitle}>{title}</span>
          {group.kind === 'mcp' && <span className={css.groupName}>{group.key}</span>}
          <span className={css.groupCounts}>
            {t('defaults.groupCount', { count })}
            {inDefaults > 0 && ` · ${t('defaults.groupInDefaults', { count: inDefaults })}`}
          </span>
        </button>
        {address !== null && (
          <Switch
            checked={!disabledSet.has(address)}
            disabled={busy}
            label={t('defaults.groupSwitchLabel', {
              name: group.kind === 'mcp' ? group.key : title,
            })}
            onChange={(next) => {
              if (busy) return
              onToggle(address, next)
            }}
          />
        )}
      </div>

      {expanded && group.kind === 'builtin' && (
        <div className={css.filterRow}>
          <Input
            className={css.filter}
            value={filter}
            placeholder={t('group.filter')}
            aria-label={t('group.filter')}
            onChange={(event) => {
              setFilter(event.target.value)
            }}
          />
        </div>
      )}

      {expanded && degraded && <p className={css.muted}>{t('skill.unavailable')}</p>}

      {expanded && !degraded && (
        <ul className={css.rows} aria-label={title}>
          {tools.length === 0
            ? <li className={css.empty}>{t('panel.empty')}</li>
            : tools.map((entry) => (
              <DefaultsRow
                key={entry.address}
                entry={entry}
                disabledSet={disabledSet}
                blocked={blocked}
                busy={busy}
                onToggle={onToggle}
                t={t}
              />
            ))}
        </ul>
      )}
    </li>
  )
}

/** 残留地址区的 props。 */
interface ResidualChipsProps {
  /** 残留地址（升序去重；为空时什么都不渲染）。 */
  readonly addresses: readonly string[]
  /** 写在途：移除按钮禁用。 */
  readonly busy: boolean
  readonly copy: DefaultsGroupCopy
  readonly onToggle: (address: string, on: boolean) => void
}

/**
 * 残留地址区：目标档里不在宇宙中的地址，**只有移除**（`onToggle(address, true)`）。
 *
 * 没有任何添加入口：新关必须来自清单里的开关，跨清单的地址走命令（`copy.cliHint`）。
 * @param props - 残留地址与交互。
 * @returns 标题 + chips；残留为空时无输出。
 */
function ResidualChips({ addresses, busy, copy, onToggle }: ResidualChipsProps): ReactNode {
  if (addresses.length === 0) return null
  return (
    <>
      <p className={css.residual}>{copy.residualTitle}</p>
      <ul className={css.chips}>
        {addresses.map((address) => (
          <li key={address} className={css.chip}>
            <code className={css.address} title={address}>{address}</code>
            <Button
              variant="ghost"
              size="sm"
              aria-label={copy.removeAria(address)}
              disabled={busy}
              onClick={() => {
                onToggle(address, true)
              }}
            >
              {copy.removeLabel}
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * 默认档的分组开关清单（两个编辑器共用的唯一清单实现）。
 * @param props - 见 {@link DefaultsGroupListProps}。
 * @returns 组清单 + 残留区 + 命令提示；宇宙不可用时退化为降级说明 + 残留区。
 */
export function DefaultsGroupList({
  universe,
  disabled,
  busy,
  onToggle,
  copy,
  t,
}: DefaultsGroupListProps): ReactNode {
  const disabledSet = useMemo(() => new Set(disabled), [disabled])
  const residual = useMemo(() => residualOf(universe, disabled), [universe, disabled])

  // 层未就绪（或根本没有宇宙）：组清单不可信，只保留「能看能移除」的残留区与命令兜底。
  if (universe === null || !universe.layerReady) {
    return (
      <>
        <p className={css.warning}>{t('defaults.universeUnavailable')}</p>
        <ResidualChips addresses={residual} busy={busy} copy={copy} onToggle={onToggle} />
        <p className={css.muted}>{copy.cliHint}</p>
      </>
    )
  }

  return (
    <>
      {universe.groups.length > 0 && (
        <ul className={css.groups}>
          {universe.groups.map((group) => (
            <DefaultsGroupRow
              key={`${group.kind}:${group.key}`}
              group={group}
              disabledSet={disabledSet}
              skillsAvailable={universe.skillsAvailable}
              busy={busy}
              onToggle={onToggle}
              t={t}
            />
          ))}
        </ul>
      )}
      <ResidualChips addresses={residual} busy={busy} copy={copy} onToggle={onToggle} />
      <p className={css.muted}>{copy.cliHint}</p>
    </>
  )
}
