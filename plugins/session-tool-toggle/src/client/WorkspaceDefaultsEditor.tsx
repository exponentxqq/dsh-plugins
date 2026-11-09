/**
 * 工作区默认档编辑器（`code-design.md` ③ 3.19 / W8；D10 / D11 / D-20）。
 *
 * 统一「工作区配置」页里本分节的正文容器（`workspace-config.section` 座位）。TG5 步骤 4 起
 * 本组件收敛为 **dialog-only**：会话工具面板里的分区形态（折叠壳）随面板改版删除，正文壳
 * 统一委托给 `<WorkspaceDefaultsPage/>`——三卡布局、全局过滤、并集/scope 说明、复制反馈、
 * 刷新与命令卡都在页面组件里，本组件只下传状态与动作。holder 的页面壳提供分节容器（不渲染
 * `role="dialog"`，两侧都只交付正文，再包一层会成嵌套 dialog/landmark）。
 *
 * 组件**不带工作区选择控件**（需求 3：三个分节 SHALL NOT 各自携带工作区选择控件）：选择框
 * 由 holder 页面的工具栏统一提供，写入目标经座位 owner 份额以纯数据上下文下传，本组件只
 * 渲染拿到的那份 `workspace` 视图。
 *
 * **工作区无法归属**（`workspace === null`）：只读降级——页面概要卡退化为
 * `workspace.unresolved`，不渲染分组清单与三计数（没有目标档就没有可数的关闭集）；分节的
 * 目标三态（真实工作区 / 未分配 / 清单未就绪）由容器先判、以空态呈现，这里的 `null` 分支是
 * 宿主返回「目标无法归属」时的兜底。
 *
 * 与用户级编辑器的同一条纪律：**没有自由文本添加**（D8）。开关打的是宿主给的规范形地址
 * （`group.address` / `entry.address`），文法、保护名单与上限的唯一权威在宿主；跨清单的新关
 * 一律走命令（`/tools workspace off <地址>`，命令模板由页面命令卡渲染）。
 *
 * 失败文案的唯一形状是 {@link PanelFailure}（从 `panel-failure.tsx` 导入）：宿主回稳定码
 * （`workspace-unresolved` / `workspace-unwritable` / …），主文案按 `error.<code>` 由持有
 * 控制器的容器插值后传进来，本组件只把字符串传给页面。
 *
 * 本组件持有的本地状态只剩**清空的两段式确认**（`armed`，不可逆性低，用文案变化代替
 * `RiskConfirmation`）与**三计数 memo**（D11 口径：与清单共用同一份 `(universe, disabled)`
 * 读数，页面不自算）。每个动作都是一次**立即写入**（宿主 `workspaces.json`），没有独立的
 * 「保存」按钮：`off` = 加入本工作区档、`on` = 移出、`reset` = 清空本工作区条目。写入成功
 * 的确认走 `saved`（「已保存（本会话不变）」）——工作区档与默认档一样不追溯（D18）。
 *
 * @module dsh-plugin-session-tool-toggle/client/WorkspaceDefaultsEditor
 */

import { useMemo, useState, type ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DefaultsUniverse,
  WorkspaceAction,
  WorkspaceView,
} from '../contract.ts'
import type { PanelFailure } from './panel-failure.tsx'
import { defaultsCountsOf } from './defaults-view.ts'
import { WorkspaceDefaultsPage } from './WorkspaceDefaultsPage.tsx'
import { NS } from './locales.ts'

/** 本组件消费的转发函数（命名空间键联合，由 `locales.ts` 的 `declare module` 提供）。 */
type Translate = TranslateNS<typeof NS>

/**
 * 目标档缺席（`workspace === null`）时的空关闭集。
 *
 * 用模块级常量而不是行内 `?? []`：行内字面量每次渲染都是新数组，会让 `useMemo` 的依赖恒变
 * （三计数本来很便宜，但「同一份读数」的语义比省这点计算重要）。
 */
const EMPTY_DISABLED: readonly string[] = []

/** 工作区默认档编辑器的 props（code-design ③ 3.19 冻结形状）。 */
export interface WorkspaceDefaultsEditorProps {
  /**
   * 当前编辑目标的工作区视图（宿主返回的活视图）。
   *
   * `null` = 宿主无法归属本分节的目标（目标未登记 / 读数缺席）：界面按只读降级，页面概要卡
   * 退化为 `workspace.unresolved`，不渲染分组清单与写入入口。
   */
  readonly workspace: WorkspaceView | null
  /**
   * 目标工具宇宙（页面形态以 `{workspacePath}` 寻址：宇宙 = 宿主全局工具注册表 ∪ 该工作区
   * 目录技能，新宿主恒返回对象）。响应可能为 null 的降级：`null` 只是旧宿主混合版本的兼容形
   * （新宿主不产生），此时清单组件只留残留区。
   */
  readonly universe: DefaultsUniverse | null
  /** 写在途（父级 hook 的 `saving`）：整区禁用。 */
  readonly saving: boolean
  /** 上一次写入已被宿主确认（「已保存（本会话不变）」）。 */
  readonly saved: boolean
  /** 上一次写入的失败（已本地化，由父级按 `error.<code>` 映射）；无错时为 `undefined`。 */
  readonly failure?: PanelFailure
  /**
   * 提交一次工作区档写入。
   *
   * 语义与 `workspace` 端点一致：`off` = 加入本工作区档、`on` = 移出、`reset` = 清空本工作区
   * 条目（不带地址）。每个动作都是一次立即写入，没有「暂存后统一保存」的中间态。
   * @param action - 动作。
   * @param addresses - 目标地址（`reset` 时缺省）。
   */
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  /** 重新读取当前目标工作区（父级 hook 的 `read`；页面概要卡的刷新入口，D12）。 */
  readonly onRefresh: () => void
  /** 本插件命名空间的翻译函数。 */
  readonly t: Translate
}

/**
 * 工作区默认档编辑器：armed 状态机 + 三计数 memo + 页面正文委托。
 * @param props - 见 {@link WorkspaceDefaultsEditorProps}。
 * @returns 委托 {@link WorkspaceDefaultsPage} 渲染的分节正文。
 */
export function WorkspaceDefaultsEditor({
  workspace,
  universe,
  saving,
  saved,
  failure,
  onUpdate,
  onRefresh,
  t,
}: WorkspaceDefaultsEditorProps): ReactNode {
  /** 清空按钮的两段式确认（不可逆性低，用文案变化代替 `RiskConfirmation`）。 */
  const [armed, setArmed] = useState(false)

  const disabled = workspace?.disabled ?? EMPTY_DISABLED

  // 三计数与清单共用同一份 (universe, disabled) 读数（D11）：目标档缺席时按空档求值
  // （listed 仍取宇宙、inDefaults 与 residual 都是 0），标题行的摘要仍有一个字符串可显示。
  const counts = useMemo(() => defaultsCountsOf(universe, disabled), [universe, disabled])

  /** 清空本工作区条目：第一次点击只改文案，第二次才真的发请求。 */
  const clear = (): void => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    onUpdate('reset')
  }

  // dialog-only 委托（D11）：三卡布局 / 全局过滤 / 复制反馈 / 命令卡 / 失败 alert 都在
  // `WorkspaceDefaultsPage`；armed 状态机留在本组件，页面只展示。任何一次开关都撤掉「清空」
  // 的待确认态——它描述的上一次意图已经过期。页面壳（标题栏 / 选择框 / 布局）归 holder，
  // 两侧都只交付正文——再包一层会成嵌套 landmark。
  return (
    <WorkspaceDefaultsPage
      workspace={workspace}
      universe={universe}
      counts={counts}
      saving={saving}
      saved={saved}
      failure={failure}
      armed={armed}
      onToggle={(address: string, on: boolean) => {
        setArmed(false)
        onUpdate(on ? 'on' : 'off', [address])
      }}
      onClear={clear}
      onRefresh={onRefresh}
      t={t}
    />
  )
}
