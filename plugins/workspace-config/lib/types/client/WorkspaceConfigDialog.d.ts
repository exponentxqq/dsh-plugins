/**
 * 统一「工作区配置」弹窗壳：`Modal` 的 headless 形态 + 自绘 header / 左 nav / 右内容列。
 *
 * ## 壳级约束（实施时最容易误解的三条）
 *
 * 1. **关闭态整颗返回 `null`**：本 entry 挂在 `shell.overlay` 上，而宿主对
 *    `.overlayLayer > *` 直接设 `pointer-events: auto`（层本身 click-through，占用者
 *    自行 opt-in）。关闭时若渲染一个隐形空 div，它会吃掉整页点击——所以关闭态必须
 *    不渲染任何 DOM，而不是给 `Modal` 传 `open={false}` 后再由它返回 null。
 * 2. **不自行 `try/catch` 包裹 `renderSlot`**：React 渲染期抛错发生在调用之后，包在
 *    这里的 try/catch 拦不住；分节崩溃由框架的 entry 错误监督面（`onEntryError`，
 *    带「是否已退场」信息）接管，holder 不重复实现。
 * 3. **不 keep-mounted**：内容列一次只经 `renderSlot(key, owner, { only: activeId })`
 *    渲染选中节，切换即卸载上一节（D8）。于是三节的 RPC 拉取只在用户真正点开该节时
 *    发生，开一个弹窗不会同时打三次请求；上一节的未保存草稿随之丢弃（设计接受项 A8）。
 *
 * ## 选中节的状态位置（D8 的落地细节）
 *
 * `selected` 是**本组件**的本地 state，而本组件是 `shell.overlay` 的 entry 组件——弹窗
 * 关闭只是它返回 null，组件本身不卸载，所以「关掉再打开，仍停在原节」。只有当选中节
 * 在账本里消失（贡献方被禁用/退场）时才回落到 `rows[0]`（order 最小者）。
 *
 * ## 打开桥双订阅
 *
 * 开合来自 `open` store（布尔快照），nav 行来自 `sections` 投影源（稳定数组快照），
 * 两者都用 `useSyncExternalStore`。`Modal` 的关闭动作（Escape / 遮罩点击 / 自绘关闭
 * 按钮）统一写回 `open.close()`，入口的 `aria-expanded` 因此同步复位。
 *
 * ## a11y（D7）
 *
 * nav 用 `nav[aria-label]` + 原生 `button` + `aria-current="true"` + `data-modal-autofocus`
 * （官方设置弹窗的黄金先例），**不用 tablist/tab**：面板组件是第三方注册的，holder
 * 无法强制其根节点带 `role="tabpanel"`，用 tablist 会制造「tab 无对应 tabpanel」的
 * 假 a11y 缺陷。
 *
 * @module dsh-plugin-workspace-config/client/WorkspaceConfigDialog
 */
import { type ReactNode } from 'react';
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorkspaceConfigOpenStore } from './open-store.ts';
import type { WorkspaceConfigSectionsSource } from './sections.ts';
import { NS } from './locales.ts';
/** 本 entry 的注入面：打开桥 + nav 行投影源（弹窗订阅两者）。 */
export interface WorkspaceConfigDialogInjected {
    /** 跨 entry 的打开桥（入口写入、弹窗读取并在关闭动作里写回）。 */
    readonly open: WorkspaceConfigOpenStore;
    /** nav 行投影源（分节注册账本 + locale 版本的双版本记忆）。 */
    readonly sections: WorkspaceConfigSectionsSource;
}
/**
 * 完整 props：`shell.overlay` 的运行时份额（无 owner，即 `{}`）+ 已声明子座位的
 * `renderSlot` 能力（`children` 声明的渲染授权）+ 本命名空间翻译 + 注入面。
 */
export type WorkspaceConfigDialogProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'workspace-config.section'> & PropsLocale<typeof NS> & WorkspaceConfigDialogInjected;
/**
 * 统一弹窗壳。
 *
 * hooks 全部无条件调用（`selected` 必须活在「弹窗关闭也不卸载」的这一层，才能跨开合
 * 记忆选中节），关闭态在 hooks 之后整颗 `return null`。
 * @param props - 打开桥、nav 投影源、`renderSlot` 与 `t`。
 * @returns 关闭时 `null`；打开时为 headless `Modal` + 自绘 chrome。
 */
export declare function WorkspaceConfigDialog(props: WorkspaceConfigDialogProps): ReactNode;
