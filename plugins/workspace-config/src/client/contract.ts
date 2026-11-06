/**
 * 座位契约的**文档指针**（D-15：类型权威已整体迁至 `@dsh-plugins/contracts`）。
 *
 * 曾经的唯一权威在本文件（`WorkspaceConfigSectionSeat` / owner 份额 / `SlotMap` 增补 /
 * 三条纪律 docblock）；D-15 拍板后它们全部搬到
 * `tooling/contracts/src/index.ts`，本文件只剩三件事：
 *
 * 1. **过渡 re-export**：holder 内部（`sections.ts` / `WorkspaceConfigDialog.tsx` /
 *    `index.ts`）与既有测试仍从 `./contract.ts` 取类型，避免本次变更扩散到与类型权威
 *    无关的调用点；贡献方**不再**经过本文件——它们 `import type` 直连
 *    `@dsh-plugins/contracts`（单一权威，无 holder 中转）。
 * 2. **本地运行时常量**：座位名与两个 order 是 holder 内部的值；权威值以 contracts 的
 *    字面量类型钉住（写错即 typecheck 失败），但运行期值留在本包，`import type` 纪律
 *    不受影响。贡献方各自持有本地字面量，不 import 这些常量。
 * 3. **本地 `SlotMap` 增补**：`declare module` 要求目标模块能从本包解析（本包是 holder，
 *    本来就依赖 `@deepseek-ai/dsh-client-ui-slots`）；条目形状引用 contracts 的
 *    `WorkspaceConfigSectionSlot`，形状权威仍在 contracts。
 *
 * 决策记录：`docs/decisions/ADR-0001-shared-build-and-source-kits.md`（架构变更收尾时
 * 落盘）；契约包本体见 `tooling/contracts/src/index.ts` 的模块头。三条纪律（仅
 * `import type`、不写进 `dsh.client.inject`、字面量各持一份）的完整表述已随类型面迁入
 * `@dsh-plugins/contracts` 的模块头。
 *
 * @module dsh-plugin-workspace-config/client/contract
 */

// 类型专用 import：`declare module` 是模块增强（augmentation），目标模块必须先作为本文件的
// 依赖被解析一次，否则 tsc 报 TS2664「module cannot be found」。`import type {}` 在编译期
// 被完全擦除，不进 bundle，也不给贡献方带来运行时耦合。
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  WorkspaceConfigDialogOrder,
  WorkspaceConfigSectionSlot,
  WorkspaceConfigTriggerOrder,
} from '@dsh-plugins/contracts'

export type {
  WorkspaceConfigSectionOwnerProps,
  WorkspaceConfigSectionSeat,
} from '@dsh-plugins/contracts'

/**
 * 分节座位的座位名（holder 内部使用的运行时常量）。
 *
 * 贡献方不 import 这个常量——它只服务 holder 自己的注册与渲染调用点，避免同一字面量在
 * 本包内出现多份；权威类型见 `@dsh-plugins/contracts` 的 `WorkspaceConfigSectionSeat`。
 */
export const WORKSPACE_CONFIG_SECTION = 'workspace-config.section' as const

/**
 * footer 入口 entry 的显示顺序（holder 内部常量，权威值 `50`，D11）。
 *
 * 类型由 `@dsh-plugins/contracts` 的 `WorkspaceConfigTriggerOrder` 钉住；运行期值留在
 * 本包，因此本包对 contracts 只有编译期依赖。
 */
export const WORKSPACE_CONFIG_TRIGGER_ORDER: WorkspaceConfigTriggerOrder = 50

/**
 * 统一弹窗在 `shell.overlay` 上的显示顺序（holder 内部常量，权威值 `530`，D11）。
 *
 * 取 `530`：web-ux 的删除确认弹窗是 `500`、旧会话管理浮层是 `520`，统一弹窗排在它们之后，
 * 保证「删除确认」始终盖在统一弹窗之上。
 */
export const WORKSPACE_CONFIG_DIALOG_ORDER: WorkspaceConfigDialogOrder = 530

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * 统一「工作区配置」弹窗的分节座位（list、scope root）。
     *
     * 条目形状取自 `@dsh-plugins/contracts` 的 `WorkspaceConfigSectionSlot`（唯一权威）；
     * 贡献方在自己的 client 程序里各自增补同一形状（本包不导出运行时类型）。
     */
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}
