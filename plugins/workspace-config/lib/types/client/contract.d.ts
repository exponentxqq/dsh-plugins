/**
 * 座位契约的**文档指针**（D-15：类型权威已整体迁至 `@dsh-plugins/contracts`）。
 *
 * 曾经的唯一权威在本文件（`WorkspaceConfigSectionSeat` / owner 份额 / `SlotMap` 增补 /
 * 三条纪律 docblock）；D-15 拍板后它们全部搬到
 * `tooling/contracts/src/index.ts`，本文件只剩三件事：
 *
 * 1. **过渡 re-export**：holder 内部（`sections.ts` / `WorkspaceConfigPage.tsx` /
 *    `index.ts`）与既有测试仍从 `./contract.ts` 取类型，避免本次变更扩散到与类型权威
 *    无关的调用点；贡献方**不再**经过本文件——它们 `import type` 直连
 *    `@dsh-plugins/contracts`（单一权威，无 holder 中转）。
 * 2. **本地运行时常量**：分节座位名与面板 id / 位次是 holder 内部的值；座位名的权威值
 *    以 contracts 的字面量类型钉住（写错即 typecheck 失败），但运行期值留在本包，
 *    `import type` 纪律不受影响。贡献方各自持有本地字面量，不 import 这些常量。
 * 3. **本地 `SlotMap` 增补**：`declare module` 要求目标模块能从本包解析（本包是 holder，
 *    本来就依赖 `@deepseek-ai/dsh-client-ui-slots`）；条目形状引用 contracts 的
 *    `WorkspaceConfigSectionSlot`，形状权威仍在 contracts。
 *
 * 入口形态为「侧栏面板行 + 独立页面」：面板 id 在两边是**同一个值**（`main` 的 `key` 与
 * `sidebar.panellist` 的 `id`，Q6），宿主 `selectPanel(id)` 直接拿它切换页面；位次排在
 * 官方面板 `plugins=0` / `schedules=10` 之后（Q5）。
 *
 * 决策记录：`docs/decisions/ADR-0001-shared-build-and-source-kits.md`（架构变更收尾时
 * 落盘）；契约包本体见 `tooling/contracts/src/index.ts` 的模块头。三条纪律（仅
 * `import type`、不写进 `dsh.client.inject`、字面量各持一份）的完整表述已随类型面迁入
 * `@dsh-plugins/contracts` 的模块头。
 *
 * @module dsh-plugin-workspace-config/client/contract
 */
import type { WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts';
export type { WorkspaceConfigSectionOwnerProps, WorkspaceConfigSectionSeat, WorkspaceConfigWorkspaceContext, } from '@dsh-plugins/contracts';
/**
 * 分节座位的座位名（holder 内部使用的运行时常量）。
 *
 * 贡献方不 import 这个常量——它只服务 holder 自己的注册与渲染调用点，避免同一字面量在
 * 本包内出现多份；权威类型见 `@dsh-plugins/contracts` 的 `WorkspaceConfigSectionSeat`。
 */
export declare const WORKSPACE_CONFIG_SECTION: "workspace-config.section";
/**
 * 面板 id（holder 内部常量）。
 *
 * **同时**是 `main` 座位的 `key` 与 `sidebar.panellist` 座位的 `id`：宿主
 * `selectPanel(id)` 直接用它切换页面，两边写岔即面板点不开（Q6）。
 */
export declare const PANEL_ID: "workspace-config";
/**
 * 侧栏面板行在 `sidebar.panellist` 上的位次（holder 内部常量，`20`）。
 *
 * 排在官方面板之后——`plugins=0`、`schedules=10`（Q5）；本包的面板行是插件自建面板，
 * 因此列在其后。
 */
export declare const PANEL_ORDER: 20;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * 工作区配置页面的分节座位（list、scope root）。
         *
         * 条目形状取自 `@dsh-plugins/contracts` 的 `WorkspaceConfigSectionSlot`（唯一权威）；
         * 贡献方在自己的 client 程序里各自增补同一形状（本包不导出运行时类型）。
         */
        'workspace-config.section': WorkspaceConfigSectionSlot;
    }
}
