/**
 * 分组清单的共享形态与文案（code-design ①1.1 / ③3.3 / TG4）。
 *
 * 面板第二段（`ToolPanelGroups.tsx`）与默认档分组清单（`DefaultsGroupList.tsx`）是**复用
 * 模式，不共用组件**（D-20 / W5）：同样的三段式分组，但行数据与状态口径不同。本模块只承载
 * 两者真正同构的部分——两个纯函数（`groupTitle` / `defaultExpanded`，自 `ToolPanelGroups.tsx`
 * 迁入）与两套词汇表（`wordingOf` / `copyBundleOf`）。批次 6 并入会话清单后，`groupTitle` /
 * `defaultExpanded` 的唯一外部引用点 `DefaultsGroupList.tsx:55` 改指本模块；`DefaultsGroupCopy`
 * 类型本体已移入此处，`DefaultsGroupList.tsx` 的 re-export（任务 5.3）保持外部 import 面不变。
 *
 * **纯模块**：零 React、零 IO，全部依赖只 `import type`——本文件的导出在浏览器半与任何
 * 测试环境都可直接消费，不引入运行时依赖。
 *
 * 两套词汇的插值名不一致（`group.summary` 用 `{disabled}`，`defaults.groupSummary` 用
 * `{inDefaults}`），差异在 `wordingOf` 内部抹平：`GroupListWording` 的函数成员统一收
 * `{ count, disabled, inDefaults }` 三个语义参数中的两个，调用 `t` 时按各键的实际插值名
 * 传参（多传的键不会出现在文案里）。
 *
 * **词汇形态**：`wordingOf` / `copyBundleOf` 按形态取键——默认档形态吃 `defaults.*` /
 * `entry.skillHidden` 一组，会话形态吃 `session.*` 一组（6.6 已补真键）；两形态共用的
 * 「暂无匹配」标签与解释句经 `entryIntentOnly` / `disabledIntentOnly` 两槽进束（散调收敛）。
 * 会话形态的 `filterEmpty` 借用保留清单里的中性空态句 `defaults.filterEmpty`（有 `{query}`
 * 插值、文案不含「默认档」字样；`panel.empty` 是「宇宙本来就没有条目」的另一种空态，不混用）。
 *
 * @module dsh-plugin-session-tool-toggle/client/group-shape
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolGroupKind } from '../contract.ts'
import type { NS } from './locales.ts'

/** 本模块消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 分组标题：宿主只给 `kind`，中文/英文由这里渲染（设计 §2.5）。
 *
 * 两处清单共用（面板第二段与 `DefaultsGroupList`，W5：复用模式不共用组件，只借标题口径）。
 * @param kind - 分区来源。
 * @param t - 翻译函数。
 * @returns 分区标题。
 */
export function groupTitle(kind: ToolGroupKind, t: Translate): string {
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
 *
 * 两处清单共用（W5：复用模式不共用组件，只借默认展开口径）。
 * @param kind - 分区来源。
 * @returns 初始展开态。
 */
export function defaultExpanded(kind: ToolGroupKind): boolean {
  return kind !== 'mcp'
}

/** 残留区/CLI 提示的文案束：两个编辑器各传自己的键（用户级 / 工作区级措辞不同）。 */
export interface DefaultsGroupCopy {
  /** 残留区标题（默认档 `defaults.residualTitle` / 会话 `session.residualTitle`）。 */
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
   * 命令兜底说明（原 `defaults.cliHint` / `workspace.cliHint` 承担的那句灰字）：缺省 = 不渲染。
   * 页面与面板的命令都已进命令卡（D8），两个现行消费方都不传——两键已删，槽保留为缺省扩展点。
   */
  readonly cliHint?: string
  /**
   * 宇宙不可用的主文案（页面形态的 `workspace.universeUnavailable`）。
   * 缺省 = `t('defaults.universeUnavailable')`（面板/用户级原样）。
   */
  readonly universeUnavailable?: string
}

/**
 * 分组清单的两套词汇（③3.3）：默认档形态与会话形态各自的组头计数/摘要、开关可访问名、
 * 状态标签与空态。消费方按形态取一套，不感知键名差异。
 */
export interface GroupListWording {
  /** 组头计数一句：`{count} 个工具` / `{count} 项`；`inDisabled > 0` 时追加「已关/默认关」半句。 */
  readonly groupCount: (count: number, inDisabled: number) => string
  /** 组头 `title`（读屏与悬浮共用的摘要句）：两形态键的插值名差异在此抹平。 */
  readonly groupSummary: (count: number, inDisabled: number) => string
  /** 整组关标签：默认档「整组默认关」/ 会话「整组已关」。 */
  readonly groupOff: string
  /** 行开关的可访问名。 */
  readonly rowSwitchLabel: (name: string) => string
  /** 组开关的可访问名（会话形态与行开关同键）。 */
  readonly groupSwitchLabel: (name: string) => string
  /** 行内「正在应用…」标签（会话形态消费；默认档形态没有该槽）。 */
  readonly pending: string
  /** 技能行：影子 stub 已生效（模型不可见）标签。 */
  readonly skillEffective: string
  /** 技能行：意图已记暂未生效标签。 */
  readonly skillIntentOnly: string
  /** 技能行「在关闭集」标签：默认档 `entry.skillHidden`；会话形态由上两个成员分支吸收（本形态无消费方，两形态同给 `entry.skillHidden`）。 */
  readonly skillHidden: string
  /** `tool:skill` 整组关的组内提示句（会话形态消费）。 */
  readonly skillBlocked: string
  /** 全局过滤无结果的空态（两形态同借 `defaults.filterEmpty`；会话形态 6.3 已接 `query`，会消费）。 */
  readonly filterEmpty: (query: string) => string
  /** 空组行空态（两形态同键 `panel.empty`）。 */
  readonly emptyRow: string
  /** 行级「暂无匹配」短标签（两形态同键 `entry.intentOnly`；行/组头的标签文案经此成员取用，不散调）。 */
  readonly entryIntentOnly: string
  /** 「暂无匹配」标签的 `title` 解释句（两形态同键 `disabled.intentOnly`，读屏理由经此成员取用）。 */
  readonly disabledIntentOnly: string
}

/**
 * 按形态组装分组清单词汇：`session === true` 是会话形态（面板），`false` 是默认档形态
 * （用户级/工作区档清单）。两个 bundle 都只在消费方的本次渲染内使用，不进任何记忆化。
 * @param session - 是否会话形态。
 * @param t - 本插件命名空间的翻译函数。
 * @returns 该形态的一套词汇。
 */
export function wordingOf(session: boolean, t: Translate): GroupListWording {
  if (session) {
    return {
      // 组头计数两句拼接（` · ` 分隔、仅 >0 时追加）与 ToolPanelGroups.tsx:212-213 同口径。
      groupCount: (count, inDisabled) =>
        inDisabled > 0
          ? `${t('group.toolCount', { count })} · ${t('group.disabledCount', { count: inDisabled })}`
          : t('group.toolCount', { count }),
      // 插值名抹平：统一入参 `inDisabled` → 该键的 `{disabled}`。
      groupSummary: (count, inDisabled) => t('group.summary', { count, disabled: inDisabled }),
      groupOff: t('session.groupOff'),
      rowSwitchLabel: (name) => t('switch.label', { name }),
      // 会话形态行/组开关共用同一键（③3.3 差异表；对齐 ToolPanelGroups.tsx:220-222）。
      groupSwitchLabel: (name) => t('switch.label', { name }),
      pending: t('toggle.pending'),
      skillEffective: t('skill.effective'),
      skillIntentOnly: t('skill.intentOnly'),
      // 该槽会话形态无消费方（skillEffective/skillIntentOnly 分支吸收）；给默认档同款
      // `entry.skillHidden` 作中性占位，避免无意义的键面分叉。
      skillHidden: t('entry.skillHidden'),
      skillBlocked: t('skill.blocked'),
      // 过滤空态借用保留清单的中性句 `defaults.filterEmpty`（有 `{query}` 插值，文案不含
      // 「默认档」字样；6.3 已接 `query`，过滤清空全部组时本成员会消费）。
      filterEmpty: (query) => t('defaults.filterEmpty', { query }),
      emptyRow: t('panel.empty'),
      entryIntentOnly: t('entry.intentOnly'),
      disabledIntentOnly: t('disabled.intentOnly'),
    }
  }
  return {
    // 组头计数两句拼接与 DefaultsGroupList.tsx:433-434 同口径。
    groupCount: (count, inDisabled) =>
      inDisabled > 0
        ? `${t('defaults.groupCount', { count })} · ${t('defaults.groupInDefaults', { count: inDisabled })}`
        : t('defaults.groupCount', { count }),
    // 插值名抹平：统一入参 `inDisabled` → 该键的 `{inDefaults}`。
    groupSummary: (count, inDisabled) => t('defaults.groupSummary', { count, inDefaults: inDisabled }),
    groupOff: t('defaults.groupOff'),
    rowSwitchLabel: (name) => t('defaults.switchLabel', { name }),
    groupSwitchLabel: (name) => t('defaults.groupSwitchLabel', { name }),
    // 默认档形态没有行内 pending 槽（③3.3 差异表），成员按类型面给值。
    pending: t('toggle.pending'),
    skillEffective: t('skill.effective'),
    skillIntentOnly: t('skill.intentOnly'),
    skillHidden: t('entry.skillHidden'),
    skillBlocked: t('skill.blocked'),
    filterEmpty: (query) => t('defaults.filterEmpty', { query }),
    emptyRow: t('panel.empty'),
    entryIntentOnly: t('entry.intentOnly'),
    disabledIntentOnly: t('disabled.intentOnly'),
  }
}

/**
 * 按形态组装残留区/降级文案束：`session === true` 是会话形态（chip 动作是「开启」），
 * `false` 是用户级默认档束——页面与工作区档容器显式传 `copy` 的现状不变，不取本函数的
 * 默认档束（该束只剩残留区标题与移除两件，`cliHint` 缺省不渲染）。
 * @param session - 是否会话形态。
 * @param t - 本插件命名空间的翻译函数。
 * @returns 该形态的一套残留区文案。
 */
export function copyBundleOf(session: boolean, t: Translate): DefaultsGroupCopy {
  if (session) {
    return {
      residualTitle: t('session.residualTitle'),
      // 会话形态的 chip 动作是「开启」（③3.3 差异表），键已存在。
      removeLabel: t('disabled.enable'),
      removeAria: (address) => t('disabled.enableAria', { address }),
    }
  }
  return {
    residualTitle: t('defaults.residualTitle'),
    removeLabel: t('defaults.remove'),
    removeAria: (address) => `${t('defaults.remove')} ${address}`,
    // `cliHint` 缺省不渲染（命令已进页面命令卡，两键已随 6.6 删除）。
  }
}
