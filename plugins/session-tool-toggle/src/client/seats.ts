/**
 * 浏览器半的座位常量（设计 `C5`；`code-design.md` ③ §3.10）。
 *
 * 本插件在 Web 壳里挂两个入口，座位名、entry id 与 order 只在**这一处**定义，避免
 * `src/client/index.ts` 的注册点与其它文件各持一份字面量：
 *
 * | 入口 | 座位 | entry id | order |
 * |---|---|---|---|
 * | 会话头部工具区（工具面面板） | `conversation.session.header.utilities` | `session-tool-toggle-panel` | 20 |
 * | 侧栏底部（工作区默认档） | `sidebar.footer.action` | `session-tool-toggle-workspace-defaults` | 60 |
 *
 * **DQ1=C（设计 D12）**：上游工作区行菜单座位本期不实现——该座位真名与 owner 形状上游
 * 未声明，软注册永远可能不触发。等上游定名后由后续变更在本文件加常量 + `declare module`
 * 增补 + `ctx.slots.inject` 软注册；**本文件因此没有任何 `declare module` 增补**，
 * header/footer 两个座位在 rc.5 都是已声明的真名。
 *
 * 两条类型 import 把两个座位的 `SlotMap` 声明并进 client 程序：常量本身是字面量字符串，
 * 但消费点（`src/client/index.ts` 的 `slots.inject` / `slots.register`）要对真实座位契约
 * 做类型检查。`verbatimModuleSyntax` 下它们是零产物 import，不改变运行时行为。
 *
 * @module dsh-plugin-session-tool-toggle/client/seats
 */

import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

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
 * 侧栏底部动作座位：`list` / scope `root`，owner 只给 `{ wide }`。
 * rc.5 已声明（勘误复验过），见 `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:83-87`
 * 与 owner props `:164-167`。
 */
export const FOOTER_SEAT = 'sidebar.footer.action'

/**
 * footer 入口 entry 的 id。
 *
 * 必须与头部入口的 `PANEL_ID` 区分：两个座位各注册一次，同一次 `apply` 里两个
 * entry 的 id 分属不同的 cell 空间，但同名会让日志与单测里的身份难以分辨。
 */
export const FOOTER_ID = 'session-tool-toggle-workspace-defaults'

/**
 * footer 入口的显示顺序。
 *
 * `sidebar.footer.action` 是 list 座位、按 order 升序排；官方 `cordis-panel` 用缺省
 * `0`，`multi-root-workspace` 的工作区入口用 `50`。取 `60`（设计 §3.10 冻结）：排在
 * 工作区入口之后、与官方底部控件留出间隔，后续插件可在中间插入而不必重排。
 */
export const FOOTER_ORDER = 60
