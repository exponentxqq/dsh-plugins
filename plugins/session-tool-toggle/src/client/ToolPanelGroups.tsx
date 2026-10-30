/**
 * 面板第二段：本会话的工具开关清单（设计附录 §3.3）。
 *
 * 三段式清单，顺序由宿主定（`panel.ts`：MCP 组按 serverName 升序 → skill → builtin）：
 *
 * 1. **MCP 服务器**：组行可折叠到单个工具（默认折叠——一台服务器几十个工具，全展开会把
 *    「默认档」与「关闭集」推到屏外）；组行开关打整组地址 `mcp:<server>`，组内每行开关打
 *    单工具地址 `mcp:<server>::<tool>`。
 * 2. **技能**：整档只有 `skill` 一个工具，组地址即 `tool:skill`。
 * 3. **内置工具**：不可整组关（`address === null`，宿主口径），所以没有组开关；该分区带
 *    本地过滤输入（纯展示层：过滤不改状态、不发请求）。
 *
 * 交互口径（与 `panel-controller.ts` 的契约严格对齐）：
 *
 * - **不做乐观更新**（D17 / §3.6）：`Switch` 完全受控，`checked = !entry.disabled`，翻转只把
 *   「用户想要的状态」交给 `onToggle`，界面上的新状态等宿主响应的快照回来才出现。注意设计
 *   §3.3 的括号写作 `checked = group.disabled`，但同一页要求 `onChange` 直接把新勾选值交给
 *   `controller.toggle(address, next)`，而控制器与宿主 `toggleSession(…, on)` 的 `on=true`
 *   明确是「开启（移出关闭集）」；若 `checked = disabled`，点击永远与意图反向。这里取
 *   「开关打开 = 该工具/该组可用」，`onChange(false)` 才是关闭。
 * - **在途禁用**：`pending` 按地址，命中本行/本组的开关 `disabled`；`busy`（`reset()` 在途，
 *   没有地址）让整段禁用。
 * - **三态禁用**：`protected` / `reserved` / `shadowed` 各带行内短标签（`entry.*`）与
 *   `title` 理由（`badge.*`，无插值）。三者都可与「已关」并存，但**禁用优先**：锁定行的开关
 *   根本点不动，组件这里再守一道（原生 `disabled` 只挡真实用户手势，程序化 dispatch 不挡）。
 *
 * @module dsh-plugin-session-tool-toggle/client/ToolPanelGroups
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  Input,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolEntry, ToolGroup } from '../contract.ts'
import { NS } from './locales.ts'
import css from './panel.module.css'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/** 清单的整体 props。 */
export interface ToolPanelGroupsProps {
  /** 宿主给的三个分区分组（顺序即渲染顺序）。 */
  readonly groups: readonly ToolGroup[]
  /** 在途的开关地址（`panel-controller` 的 `pending`；逐行/逐组禁用）。 */
  readonly pending: ReadonlySet<string>
  /** 面板级在途（`reset()`）：没有地址可禁用，整段开关一起置灰。 */
  readonly busy: boolean
  /**
   * 开关意图：`on === true` 表示用户要把该地址开启（移出关闭集），`false` 表示关闭。
   * 面板容器把它接到 `controller.toggle(address, on)`。
   * @param address - 规范形地址（整组 `mcp:<server>` / 单工具 `mcp:<server>::<tool>` / `tool:<name>`）。
   * @param on - 期望的新状态。
   */
  readonly onToggle: (address: string, on: boolean) => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 分组标题：宿主只给 `kind`，中文/英文由这里渲染（设计 §2.5）。
 * @param kind - 分区来源。
 * @param t - 翻译函数。
 * @returns 分区标题。
 */
function groupTitle(kind: ToolGroup['kind'], t: Translate): string {
  switch (kind) {
    case 'mcp':
      return t('group.mcp')
    case 'skill':
      return t('group.skill')
    case 'builtin':
      return t('group.builtin')
  }
}

/**
 * 分组默认展开态：MCP 服务器默认折叠（工具多），技能与内置工具默认展开（这两段就是用户
 * 日常要点的那几行）。
 * @param kind - 分区来源。
 * @returns 初始展开态。
 */
function defaultExpanded(kind: ToolGroup['kind']): boolean {
  return kind !== 'mcp'
}

/** 一行被锁定的理由：行内短标签 + 悬停/读屏同一句解释。 */
interface LockNotice {
  /** 行内短标签文案（`entry.protected` / `entry.reserved` / `entry.shadowed`）。 */
  readonly tag: string
  /** `title` 与读屏共用的理由（`badge.*`）。 */
  readonly reason: string
}

/**
 * 判定一条工具的三态锁：保护名单优先于保留名，保留名优先于「被其它作用域隐藏」。
 *
 * 优先级不是随意排的：`protected` 与 `reserved` 是宿主解析期就拒绝的硬约束，`shadowed` 只是
 * 当前读数（别的座位把它藏了）；同一条目命中多个时，讲最硬的那条理由。
 * @param tool - 分组条目。
 * @param t - 翻译函数。
 * @returns 锁信息；可切换时是 `undefined`。
 */
function lockOf(tool: ToolEntry, t: Translate): LockNotice | undefined {
  if (tool.protected) return { tag: t('entry.protected'), reason: t('badge.protected') }
  if (tool.reserved) return { tag: t('entry.reserved'), reason: t('badge.reserved') }
  if (tool.shadowed) return { tag: t('entry.shadowed'), reason: t('badge.shadowed') }
  return undefined
}

/** 单行工具 props。 */
interface ToolRowProps {
  readonly tool: ToolEntry
  /** 面板级在途（`reset`）。 */
  readonly busy: boolean
  /** 这一行自己的 toggle 是否在途。 */
  readonly pending: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}

/**
 * 一个工具行：等宽短名 + 锁定标签 + 受控开关。
 *
 * 描述不占版面（设计 §3.3：`description` 作为 `title`），长描述不会把开关挤出可视区。
 * @param props - 行数据与交互。
 * @returns 一行 `<li>`。
 */
function ToolRow({ tool, busy, pending, onToggle, t }: ToolRowProps): ReactNode {
  const lock = lockOf(tool, t)
  const locked = lock !== undefined
  const disabled = busy || locked || pending
  return (
    <li className={css.row}>
      <span className={css.rowName}>
        <code className={css.name} title={tool.description ?? tool.name}>{tool.shortName}</code>
        {lock !== undefined && <span className={css.tag} title={lock.reason}>{lock.tag}</span>}
        {pending && <span className={css.pending}>{t('toggle.pending')}</span>}
      </span>
      <Switch
        checked={!tool.disabled}
        disabled={disabled}
        title={lock?.reason}
        label={t('switch.label', { name: tool.shortName })}
        onChange={(next) => {
          // 原生 `disabled` 只挡真实用户手势；程序化 dispatch 仍会进来，这里守一道。
          if (disabled) return
          onToggle(tool.address, next)
        }}
      />
    </li>
  )
}

/** 单个分区的 props。 */
interface GroupRowProps {
  readonly group: ToolGroup
  readonly pending: ReadonlySet<string>
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}

/**
 * 一个分区：可折叠的标题行（计数 + 整组开关）+ 展开后的工具行；内置工具分区额外带过滤输入。
 *
 * 折叠态是**组件本地状态**（按分组实例存活）：换一次快照（每次 mutation 都会换）不该把用户
 * 展开到一半的清单收回去——所以 key 用 `group.key`，状态跟着同一个分区走。
 * @param props - 分区数据与交互。
 * @returns 一个 `<li>`。
 */
function GroupRow({ group, pending, busy, onToggle, t }: GroupRowProps): ReactNode {
  const [expanded, setExpanded] = useState<boolean>(() => defaultExpanded(group.kind))
  const [filter, setFilter] = useState('')

  // 过滤只作用于内置工具（MCP 组自家的折叠已经承担了「收起噪音」的职责）。
  const tools = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (group.kind !== 'builtin' || needle === '') return group.tools
    return group.tools.filter((tool) => tool.shortName.toLowerCase().includes(needle))
  }, [filter, group.kind, group.tools])

  // 组地址先落到 const：闭包里再读 `group.address` 会丢掉 `!== null` 的收窄。
  const address = group.address
  const groupPending = address !== null && pending.has(address)
  const groupDisabled = busy || groupPending
  const title = groupTitle(group.kind, t)

  return (
    <li className={css.group}>
      <div className={css.groupHeader}>
        <button
          type="button"
          className={css.groupToggle}
          aria-expanded={expanded}
          title={t('group.summary', { count: group.toolCount, disabled: group.disabledCount })}
          onClick={() => {
            setExpanded((value) => !value)
          }}
        >
          {expanded ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
          <span className={css.groupTitle}>{title}</span>
          {group.kind === 'mcp' && <span className={css.groupName}>{group.key}</span>}
          <span className={css.groupCounts}>
            {t('group.toolCount', { count: group.toolCount })}
            {group.disabledCount > 0 && ` · ${t('group.disabledCount', { count: group.disabledCount })}`}
          </span>
        </button>
        {address !== null && (
          <Switch
            checked={!group.disabled}
            disabled={groupDisabled}
            label={t('switch.label', {
              name: group.kind === 'mcp' ? group.key : title,
            })}
            onChange={(next) => {
              if (groupDisabled) return
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

      {expanded && (
        <ul className={css.rows} aria-label={title}>
          {tools.length === 0
            ? <li className={css.empty}>{t('panel.empty')}</li>
            : tools.map((tool) => (
              <ToolRow
                key={tool.address}
                tool={tool}
                busy={busy}
                pending={pending.has(tool.address)}
                onToggle={onToggle}
                t={t}
              />
            ))}
        </ul>
      )}
    </li>
  )
}

/**
 * 第二段的容器：空清单给一行空态，否则逐分区渲染。
 * @param props - 分区清单与交互。
 * @returns 分区清单。
 */
export function ToolPanelGroups({ groups, pending, busy, onToggle, t }: ToolPanelGroupsProps): ReactNode {
  if (groups.length === 0) return <p className={css.muted}>{t('panel.empty')}</p>
  return (
    <ul className={css.groups}>
      {groups.map((group) => (
        <GroupRow
          key={`${group.kind}:${group.key}`}
          group={group}
          pending={pending}
          busy={busy}
          onToggle={onToggle}
          t={t}
        />
      ))}
    </ul>
  )
}
