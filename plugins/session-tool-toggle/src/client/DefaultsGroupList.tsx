/**
 * 默认档的分组开关清单（`code-design.md` ③ 3.19 / W5；D10 / D-20；页面能力见 ③ 3.4 / G4.2）。
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
 * - 残留地址 = 目标档里不在宇宙中的地址（{@link filterDefaultsView} 的 `residual`，差集相对
 *   **未过滤**宇宙计算），**只能移除、没有添加入口**：跨清单的新关走命令（`copy.cliHint`）。
 *
 * 宇宙不可用（`null` / `layerReady:false`）时只渲染降级说明 + 残留区 + 命令提示，**不渲染
 * 组清单**：层未就绪说明宿主读不到会话清单，远端残影 `groups` 不可信（与 `defaults-view.ts`
 * 的 `listed = 0` 同一口径）。
 *
 * **两条页面形态能力（③ 3.4，`query` / `showDetails` 都缺省 = 面板旧渲染，DOM 逐字一致）**：
 *
 * - `query`（全局过滤词）：`undefined` = 不启用（面板/用户级编辑器不传）；`''` = 启用页面
 *   形态。过滤视图由 `filterDefaultsView` 统一计算（组级命中保留整组、空组丢弃、残留按地址
 *   再筛词）；过滤生效时组头退化为非交互 span、全部组强制展开、内置组的本地过滤框隐藏——
 *   收起与行内筛选的手势都让位给全局过滤。过滤把组清空时用 `defaults.filterEmpty` 交代，
 *   不落 `panel.empty`（后者是「宇宙本来就没有条目」的面板空态）。
 * - `showDetails`（行详情）：缺省 false = 面板旧行；true = 行改两列，`.rowMain` 主列在名称
 *   行之下加描述次行（`.rowDescription`，全文走 `title`）与技能标签行（`.rowTags`，invocation
 *   成对字段 + 来源短标签 + 档内隐藏），开关仍在右列。
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
import { filterDefaultsView } from './defaults-view.ts'
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
  /**
   * 命令兜底说明（`defaults.cliHint` / `workspace.cliHint`）：本页只列本会话可见工具。
   * 缺省 = 不渲染（页面形态把命令放进命令卡，不再要这一句灰字）。
   */
  readonly cliHint?: string
  /**
   * 宇宙不可用的主文案（页面形态的 `workspace.universeUnavailable`）。
   * 缺省 = `t('defaults.universeUnavailable')`（面板/用户级原样）。
   */
  readonly universeUnavailable?: string
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
  /**
   * 全局过滤词（页面形态）。
   * `undefined` = 不启用（面板/用户级编辑器不传，DOM 与现行一致）；
   * `''` = 启用页面形态（显示全局过滤框、隐藏内置组的本地过滤框）。
   */
  readonly query?: string
  /** 行详情：描述次行 + 技能标签；缺省 false = 面板旧行。 */
  readonly showDetails?: boolean
}

/** 一行被锁定的理由：行内短标签 + 悬停/读屏同一句解释。 */
interface LockNotice {
  /** 行内短标签文案（`entry.protected` / `entry.reserved`）。 */
  readonly tag: string
  /** `title` 与读屏共用的理由（`badge.*`）。 */
  readonly reason: string
  /** 着色语义（R15）：保护名单红、保留名橙（`tagToneClass` 映射到状态色变体）。 */
  readonly tone: TagTone
}

/**
 * 标签着色语义（R15）：`neutral` 沿用默认灰边样式；其余经 `tagToneClass` 映射到
 * `.tone*` 状态色变体类（CSS 变量带字面量回退，暗色主题安全）。
 */
type TagTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger'

/**
 * 一枚标签的渲染事实：文案 + `title`（读屏理由，缺省 = 文案本身）+ 着色语义。
 * `.tag`（名称行锁态）与 `.metaTag`（技能标签行）两个基础类共用。
 */
interface TagSpec {
  readonly text: string
  readonly title?: string
  readonly tone: TagTone
}

/**
 * 着色语义 → CSS module 变体类。
 * @param tone - 标签着色语义。
 * @returns 变体类名；`neutral` 返回空串（不叠变体，沿用基础类默认灰）。
 */
function tagToneClass(tone: TagTone): string {
  switch (tone) {
    case 'info': return css.toneInfo
    case 'success': return css.toneSuccess
    case 'warn': return css.toneWarn
    case 'danger': return css.toneDanger
    case 'neutral': return ''
  }
}

/**
 * 技能来源 → 文案键的映射表（③ 3.5：未知 `source` 原样显示，不进映射）。
 *
 * 落位说明：设计原文把映射表记在 `WorkspaceDefaultsPage.tsx`，但标签的渲染地在
 * {@link skillTagsOf}（页面形态的全部行都经 `DefaultsRow` 输出），映射表跟着渲染者走、
 * 就近放在本文件——`WorkspaceDefaultsPage` 落地后无需再持有一份。
 */
const SOURCE_TAG_KEYS: Readonly<Record<string, Parameters<Translate>[0]>> = {
  'project-dsh': 'skill.source.project-dsh',
  'project-agents': 'skill.source.project-agents',
  'custom': 'skill.source.custom',
  'user-dsh': 'skill.source.user-dsh',
  'user-agents': 'skill.source.user-agents',
  'bundled': 'skill.source.bundled',
  'runtime': 'skill.source.runtime',
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
  if (entry.protected) return { tag: t('entry.protected'), reason: t('badge.protected'), tone: 'danger' }
  if (entry.reserved) return { tag: t('entry.reserved'), reason: t('badge.reserved'), tone: 'warn' }
  return undefined
}

/**
 * 技能行标签的来源键：已知 `source` 映射短标签键，未知原样显示原值（③ 3.5 的兜底口径）。
 * @param source - 宿主给的来源原值（`dsh-skill` 的 `source`）。
 * @returns 文案键；未知来源时 `undefined`（调用方直接显示原值）。
 */
function sourceTagKeyOf(source: string): Parameters<Translate>[0] | undefined {
  return SOURCE_TAG_KEYS[source]
}

/**
 * 技能行的标签组（`.rowTags` 行的内容，只由 `showDetails` 分支消费）。
 *
 * 顺序即页面行的阅读顺序：调用方式两枚（invocation 成对字段）→ 来源短标签 → 档内隐藏。
 * 非技能行（地址非 `skill:` 且没有 invocation 对）返回空数组——描述次行对全部行开放，
 * 技能标签只属于技能行。invocation 字段按契约成对出现，缺任一即视为缺席（不猜补）。
 * @param entry - 默认档条目。
 * @param disabledSet - 目标档关闭集（「新会话默认隐藏」按地址求交）。
 * @param t - 翻译函数。
 * @returns 已本地化的标签文本（可能为空）。
 */
function skillTagsOf(
  entry: DefaultsEntry,
  disabledSet: ReadonlySet<string>,
  t: Translate,
): readonly TagSpec[] {
  const tags: TagSpec[] = []
  const isSkill = entry.address.startsWith('skill:') ||
    (entry.modelInvocable !== undefined && entry.userInvocable !== undefined)
  if (!isSkill) return tags
  if (entry.modelInvocable !== undefined && entry.userInvocable !== undefined) {
    // 占 / 不占对话 token：橙 / 中性（R15 着色——占是成本提示，不占是默认态不强调）。
    tags.push(entry.modelInvocable
      ? { text: t('entry.skillTokens'), tone: 'warn' }
      : { text: t('entry.skillNoTokens'), tone: 'neutral' })
    tags.push({
      text: entry.userInvocable
        ? t('entry.skillUserInvocable', { name: entry.shortName })
        : t('entry.skillUserBlocked'),
      tone: 'neutral',
    })
  }
  if (entry.source !== undefined) {
    const key = sourceTagKeyOf(entry.source)
    // 技能来源七类（含未知原值）：蓝（info）——与 MCP 用户级同色（都是「配置来源」语义）。
    tags.push({ text: key === undefined ? entry.source : t(key), tone: 'info' })
  }
  if (disabledSet.has(entry.address)) tags.push({ text: t('entry.skillHidden'), tone: 'neutral' })
  return tags
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
  /** 行详情（页面形态）：`.rowMain` 主列加描述次行与技能标签行。 */
  readonly showDetails: boolean
}

/**
 * 一个默认档条目行：等宽短名 + 锁态/整组在档标签 + 受控开关。
 *
 * 描述不占版面（设计 §3.3 的同一口径：`description` 作为 `title`），长描述不会把开关挤出可视区。
 * `showDetails`（页面形态）时行改两列：名称行之下加描述次行（全文走 `title`）与技能标签行，
 * 开关仍在右列。缺省（面板路径）的 DOM 与既有实现逐字一致——面板形态（`DefaultsEditor` /
 * `WorkspaceDefaultsEditor` 消费）的零回归锚点。
 * 禁用优先级：`busy` ∨ 锁态 ∨ 整组在档——锁态是宿主硬约束，整组在档是「逐项开关不生效」的语义。
 * @param props - 行数据与交互。
 * @returns 一行 `<li>`。
 */
function DefaultsRow({ entry, disabledSet, blocked, busy, onToggle, t, showDetails }: DefaultsRowProps): ReactNode {
  const lock = lockOf(entry, t)
  const groupOff = blocked ? t('defaults.groupOff') : undefined
  // 锁态优先讲硬约束；整组在档另起一个标签（两者可同时成立，设计 ③3.19 的 blocked 行要求带
  // `defaults.groupOff`，锁态行要求带 `entry.*`，所以两个标签并列而不是互相顶掉）。
  const reason = lock?.reason ?? groupOff
  const disabled = busy || lock !== undefined || blocked
  const tags = showDetails ? skillTagsOf(entry, disabledSet, t) : []

  /** 名称行（短名 + 锁态/整组在档标签）：两个形态共用同一份内容。标签着色见 R15。 */
  const nameLine = (
    <span className={css.rowName}>
      <code className={css.name} title={entry.description ?? entry.shortName}>{entry.shortName}</code>
      {lock !== undefined && (
        <span className={`${css.tag} ${tagToneClass(lock.tone)}`} title={lock.reason}>{lock.tag}</span>
      )}
      {groupOff !== undefined && (
        <span className={`${css.tag} ${tagToneClass('warn')}`} title={groupOff}>{groupOff}</span>
      )}
    </span>
  )

  /** 受控开关（两个形态同一份属性）：`onChange` 里守一道程序化 dispatch。 */
  const control = (
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
  )

  // 面板路径（不传 showDetails）：既有单行 DOM 逐字不动。
  if (!showDetails) {
    return (
      <li className={css.row}>
        {nameLine}
        {control}
      </li>
    )
  }
  // 页面路径：行改两列——`.rowMain` 主列（名称行 + 描述次行 + 技能标签行）纵排，开关在右列。
  return (
    <li className={css.row}>
      <span className={css.rowMain}>
        {nameLine}
        {entry.description !== undefined && (
          <span className={css.rowDescription} title={entry.description}>{entry.description}</span>
        )}
        {tags.length > 0 && (
          <span className={css.rowTags}>
            {tags.map((tag) => (
              <span
                key={tag.text}
                className={`${css.metaTag} ${tagToneClass(tag.tone)}`}
                title={tag.title ?? tag.text}
              >
                {tag.text}
              </span>
            ))}
          </span>
        )}
      </span>
      {control}
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
  /** 全局过滤生效中：组头退化为非交互 span、强制展开（`trim` 后非空才为真，`''` 不是过滤态）。 */
  readonly filtering: boolean
  /**
   * 全局过滤词（页面形态，原样透传）：只有**未传**才渲染内置组的本地过滤框。
   * `undefined` = 面板/用户级路径，本地过滤框照常；已传（含 `''`）= 页面形态，隐藏——
   * 页面形态无本地过滤框（③ 3.4 / G4.2），收起与行内筛选的手势都让位给全局过滤。
   * 注意不能拿 `filtering` 代替本判断：`''` 时 `filtering` 为假但页面形态已经启用。
   */
  readonly query?: string
  /** 行详情（页面形态），透传给每一行。 */
  readonly showDetails: boolean
}

/**
 * 一个默认档分区：可折叠标题行（计数 + 整组开关）+ 展开后的条目行；内置工具分区额外带过滤输入。
 *
 * 折叠态与过滤词都是**组件本地状态**（按分组实例存活）：换一次目标档快照不该把用户展开到一半
 * 的清单收回去——所以 key 用 `group.kind:group.key`，状态跟着同一个分区走。
 * 全局过滤生效时（`filtering`）本地折叠态被短路：组头退化为非交互 span（折叠手势让位给全局
 * 过滤）、所有组强制展开、内置组的本地过滤框隐藏（本地旧词也不再叠加筛选——行级命中已在
 * `filterDefaultsView` 里算过，二次过滤会把命中的行藏掉）。
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
  filtering,
  query,
  showDetails,
}: DefaultsGroupRowProps): ReactNode {
  const [expanded, setExpanded] = useState<boolean>(() => defaultExpanded(group.kind))
  const [filter, setFilter] = useState('')

  // 过滤只作用于内置工具分区（MCP 组的折叠已经承担了「收起噪音」的职责）；全局过滤生效时
  // 直接放行整组（行级命中在 `filterDefaultsView` 里判定，本地旧词没有入口更新、不得叠加）。
  const tools = useMemo(() => {
    if (filtering) return group.tools
    const needle = filter.trim().toLowerCase()
    if (group.kind !== 'builtin' || needle === '') return group.tools
    return group.tools.filter((entry) => entry.shortName.toLowerCase().includes(needle))
  }, [filter, filtering, group.kind, group.tools])

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
  // 强制展开：过滤态下所有组平铺（`expanded` 本地态被短路，非过滤态与现行一致）。
  const open = filtering || expanded

  /** 组头正文（箭头 + 标题 + 服务器名 + 来源/token 徽章 + 计数摘要）：button 与 span 两个形态共用一份内容。 */
  const headerContent = (
    <>
      {open ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}
      <span className={css.groupTitle}>{title}</span>
      {group.kind === 'mcp' && <span className={css.groupName}>{group.key}</span>}
      {/* R15 MCP 组级徽章：配置来源（用户级蓝 / 项目级绿）+ token 计入（橙）。
          只标 MCP 本身——组下工具行不加（用户裁定）；来源只在宿主给出时渲染（旧响应缺键不虚标）。 */}
      {group.kind === 'mcp' && group.source !== undefined && (
        <span
          className={`${css.tag} ${tagToneClass(group.source === 'project' ? 'success' : 'info')}`}
          title={group.source === 'project' ? t('mcp.sourceProjectHint') : t('mcp.sourceUserHint')}
        >
          {group.source === 'project' ? t('mcp.sourceProject') : t('mcp.sourceUser')}
        </span>
      )}
      {group.kind === 'mcp' && group.countsTokens === true && (
        <span className={`${css.tag} ${tagToneClass('warn')}`} title={t('mcp.tokensHint')}>
          {t('mcp.tokens')}
        </span>
      )}
      <span className={css.groupCounts}>
        {t('defaults.groupCount', { count })}
        {inDefaults > 0 && ` · ${t('defaults.groupInDefaults', { count: inDefaults })}`}
      </span>
    </>
  )

  return (
    <li className={css.group}>
      <div className={css.groupHeader}>
        {filtering
          ? (
            // 过滤态组头：非交互 span——强制展开的清单不再提供折叠手势，`aria-expanded` 与
            // `onClick` 一并撤掉；读数摘要（`title`）保留，span 复用 `.groupToggle` 的排布样式。
            <span className={css.groupToggle} title={t('defaults.groupSummary', { count, inDefaults })}>
              {headerContent}
            </span>
          )
          : (
            <button
              type="button"
              className={css.groupToggle}
              aria-expanded={expanded}
              title={t('defaults.groupSummary', { count, inDefaults })}
              onClick={() => {
                setExpanded((value) => !value)
              }}
            >
              {headerContent}
            </button>
          )}
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

      {/* 内置组本地过滤框只属于「未传 query」的面板/用户级路径；页面形态（已传 query，含
          `''`）一律隐藏（③ 3.4 / G4.2：收起与行内筛选手势让位给全局过滤）。`query ===
          undefined` 已蕴含 `!filtering`（filtering 只在传入非空词时为真），不再单列。 */}
      {query === undefined && open && group.kind === 'builtin' && (
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

      {open && degraded && <p className={css.muted}>{t('skill.unavailable')}</p>}

      {open && !degraded && (
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
                showDetails={showDetails}
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
 *
 * 过滤视图统一从 `filterDefaultsView` 读数（③ 3.4）：`query` 缺省时宇宙与残留原样返回
 * （identity 稳定），渲染分支因此与既有实现逐字一致——面板形态的零回归锚点；过滤生效时
 * 宇宙是剪枝后的投影（组级命中保留整组、空组丢弃），把组清空时用 `defaults.filterEmpty`
 * 交代无匹配，残留区仍按筛过的地址展示。
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
  query,
  showDetails,
}: DefaultsGroupListProps): ReactNode {
  const disabledSet = useMemo(() => new Set(disabled), [disabled])
  // 过滤视图三件套（宇宙 / 残留 / 是否生效）：未过滤时 universe 保持 identity、残留与
  // 既有 `residualOf` 完全一致（③ 3.4 的契约），缺省路径因此不产生任何渲染差异。
  const view = useMemo(
    () => filterDefaultsView(universe, disabled, query),
    [universe, disabled, query],
  )
  const filtering = view.filtering
  // 过滤无结果的提示词：与 `filterDefaultsView` 同一 trim 口径（只展示，不再参与匹配）。
  const needle = query?.trim() ?? ''

  // 层未就绪（或根本没有宇宙）：组清单不可信，只保留「能看能移除」的残留区与命令兜底。
  // 降级文案由页面形态可覆盖（`copy.universeUnavailable`），缺省仍是 `defaults.universeUnavailable`。
  if (universe === null || !universe.layerReady) {
    return (
      <>
        <p className={css.warning}>{copy.universeUnavailable ?? t('defaults.universeUnavailable')}</p>
        <ResidualChips addresses={view.residual} busy={busy} copy={copy} onToggle={onToggle} />
        {copy.cliHint !== undefined && <p className={css.muted}>{copy.cliHint}</p>}
      </>
    )
  }

  // 展示宇宙：未过滤 = 入参本体（identity）；过滤 = 剪枝投影。入参此处已收窄非 null，
  // ③ 3.4 契约保证过滤结果同非 null，`?? universe` 只为类型收窄、契约下不触发。
  const shownUniverse = view.universe ?? universe
  const groups = shownUniverse.groups

  return (
    <>
      {groups.length > 0
        ? (
          <ul className={css.groups}>
            {groups.map((group) => (
              <DefaultsGroupRow
                key={`${group.kind}:${group.key}`}
                group={group}
                disabledSet={disabledSet}
                skillsAvailable={shownUniverse.skillsAvailable}
                busy={busy}
                onToggle={onToggle}
                t={t}
                filtering={filtering}
                query={query}
                showDetails={showDetails === true}
              />
            ))}
          </ul>
        )
        : (filtering && (
          // 过滤把组清空：一句无匹配交代，不落 `panel.empty`（那是「宇宙本来就没有条目」
          // 的面板空态，两者语义不同）；残留 chip 若有命中仍照常展示。
          <p className={css.muted}>{t('defaults.filterEmpty', { query: needle })}</p>
        ))}
      <ResidualChips addresses={view.residual} busy={busy} copy={copy} onToggle={onToggle} />
      {copy.cliHint !== undefined && <p className={css.muted}>{copy.cliHint}</p>}
    </>
  )
}
