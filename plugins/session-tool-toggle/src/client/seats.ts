/**
 * 浏览器半的座位常量（设计 `C5`；`code-design.md` ③ §3.1/§3.2 与 ① 触达面 #38）。
 *
 * 本插件在 Web 壳里挂两个入口，座位名、entry id 与 order 只在**这一处**定义，避免
 * `src/client/index.ts` 的注册点与其它文件各持一份字面量：
 *
 * | 入口 | 座位 | entry id | order |
 * |---|---|---|---|
 * | 会话头部工具区（工具面面板） | `conversation.session.header.utilities` | `session-tool-toggle-panel` | 20 |
 * | 统一「工作区配置」弹窗 → 工作区默认档分节 | `workspace-config.section` | `session-tool-toggle-workspace-defaults` | 20 |
 *
 * **footer 入口已移除**：旧 `sidebar.footer.*` 座位上的工作区默认档对话框由统一弹窗的
 * 分节取代（本次变更的已定结论 2「旧入口硬移除」）。`SECTION_ID` 沿用被删除的旧 footer
 * entry id——id 只在座位内唯一，跨座位无冲突；沿用旧 id 让日志、断言与排障话术保持连续
 * （code-design §3.2 的注）。
 *
 * **DQ1=C（设计 D12）**：上游工作区行菜单座位本期不实现——该座位真名与 owner 形状上游
 * 未声明，软注册永远可能不触发。等上游定名后由后续变更在本文件加常量 + `declare module`
 * 增补 + `ctx.slots.inject` 软注册；**本文件因此没有任何 `declare module` 增补**。
 *
 * **类型权威（D-15）**：`workspace-config.section` 的座位契约由 `@dsh-plugins/contracts`
 * 提供。本文件只以 `import type` 消费——`verbatimModuleSyntax` 下零产物；座位字面量
 * 由本文件各持一份，靠 `WorkspaceConfigSectionSeat` 字面量类型断言而不是共享运行时常量
 * 保证一致（写错字面量即 typecheck 失败）。
 *
 * 两条类型 import 把两个座位的 `SlotMap` 声明并进 client 程序：常量本身是字面量字符串，
 * 但消费点（`src/client/index.ts` 的 `slots.inject` / `slots.register`）要对真实座位契约
 * 做类型检查。`verbatimModuleSyntax` 下它们是零产物 import，不改变运行时行为。
 *
 * @module dsh-plugin-session-tool-toggle/client/seats
 */

import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// ① 取得座位名的字面量类型与 SlotMap 条目形状（D-15：权威在 @dsh-plugins/contracts）。
import type { WorkspaceConfigSectionSeat, WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts'

// 本座位的 SlotMap 增补：形状取自契约包（唯一权威），增补动作留在消费方自己的
// client 程序——纯类型包没有 DSH 依赖，无法从它的位置解析 `@deepseek-ai/dsh-client-ui-slots`。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}

/**
 * 会话头部工具区座位：`list` / scope `session`，右对齐、按 order 升序。
 * 上游声明见 `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:237-241`。
 */
export const HEADER_SEAT = 'conversation.session.header.utilities'

/** 头部入口 entry 的 id（list 座位的 cell 身份；同 cell 同优先级重复注册会 fail loud）。 */
export const PANEL_ID = 'session-tool-toggle-panel'

/**
 * 头部入口的显示顺序。
 *
 * 官方三项是 `-10`（open-in-app）/ `-5`（schedule）/ 缺省 `0`（session-log-export），
 * 见设计 §3.1 的取值论证。取 `20`：保持「越靠右越大」的单调关系、与最大官方值留出间隔，
 * 又不与缺省的 `0` 并列（并列时的先后取决于注册时序，不稳定）。
 */
export const PANEL_ORDER = 20

/**
 * 统一「工作区配置」弹窗的分节座位：`list` / scope `root`，owner 只有 `{ close }`。
 *
 * 座位名与形状的唯一权威在 `@dsh-plugins/contracts`（`WorkspaceConfigSectionSeat` /
 * `WorkspaceConfigSectionSlot`）。holder 以 `children` 声明本座位（Declaring is claiming），
 * 本插件用 `ctx.slots.inject` 软注册：
 * holder 缺席时回调永不触发，也不报错、不残留 UI（组合矩阵「只贡献方」格）。
 */
export const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'

/** 工作区默认档分节 entry 的 id（沿用被删除的旧 footer entry id，排障话术保持连续）。 */
export const SECTION_ID = 'session-tool-toggle-workspace-defaults'

/**
 * 分节在统一弹窗左侧导航里的顺序。
 *
 * 三贡献方按 `10 / 20 / 30` 排：multi-root-workspace（工作区文件夹）→
 * session-tool-toggle（工作区默认档）→ web-ux（会话管理）。取 `20` 与头部入口的 order
 * 同值纯属巧合，两处座位互不相干（D11 的分节 order 常量）。
 */
export const SECTION_ORDER = 20
