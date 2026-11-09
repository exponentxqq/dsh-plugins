/**
 * 「工作区文件夹」分节的应用内单栏目录拾取对话框（client 半）。
 *
 * D-03：模态自绘（遮罩 / 卡片 / Escape / Tab 焦点环 / 焦点归还），不用
 * ui-primitives 的 `Modal`——测试替身不承载其焦点语义，且分节内的拾取浮层
 * 与 holder 的对话框壳不重叠（ADR-0013 删掉的是分节壳，不是任何浮层）；视觉
 * 逐值复刻宿主 Modal.module.css 配方，token 全部来自 `styles.ts` 的
 * `.mrfw-picker*` 族（ADR-0006：无字面色）。D-10：portal 到 `document.body`，
 * 避开宿主侧栏抽屉的 transform 动画对 fixed 定位的退化。
 *
 * 行为契约（code-design §3.3）：
 *
 * 1. `open` 翻 true：重置全部瞬态；有 `initialListing` 直接 ready，否则零参
 *    `list()`（Host home）；记录 opener 并把焦点移到卡片根。`browser` /
 *    `initialListing` 在打开瞬间快照，打开后属性变化不重扫、不换端口。
 * 2. 导航（点行 / 点面包屑）：`scanEpoch` 递增并 abort 上一次请求；过期响应
 *    与 abort 响应都丢弃。
 * 3. 隐藏项默认过滤（`entry.hidden`），开关（`aria-pressed`）只改渲染。
 * 4. `truncated` 时显示 `picker.truncated`。
 * 5. 新建对当前层 `listing.path` 发起；成功收起新建行并导航进入创建出的目录
 *    （D-04：导航进入是防误采纳父目录的最小代价）；失败原地显示码对应文案。
 * 6. 采纳：`await onConfirm(listing.path)`；返回字符串 = 本地化失败句，原地
 *    显示、保持打开；返回 `undefined` = 成功，关闭。
 * 7. 关闭路径（Esc / 取消 / 遮罩）一律不采纳，且归还 opener 焦点后再通知父
 *    组件（焦点归还发生在父组件可能触发的卸载之前）。
 * 8. Tab / Shift+Tab 在卡片内可聚焦元素间环绕；`role="dialog"` +
 *    `aria-modal="true"` + `aria-labelledby` 指向标题。
 * 9. 父组件卸载即 abort 当前扫描。
 *
 * 对话框不负责：`add` 请求、错误码 → 文案（浏览错误除外）、能力判定、记住
 * 上次目录（每次打开都从 Host home 开始）。
 *
 * @module dsh-plugin-multi-root-workspace/client/DirectoryPickerDialog
 */
import { type ReactNode } from 'react';
import { type DirectoryBrowser, type DirectoryListing } from './directory-picker.ts';
import type { Translate } from './locales.ts';
/** 对话框 props（§3.3 契约形状）。 */
export interface DirectoryPickerDialogProps {
    /** 是否显示（父组件只在需要时挂载，但仍保留该开关便于动画/清理语义）。 */
    readonly open: boolean;
    readonly t: Translate;
    /** 浏览端口；理论上打开时必有，防御性允许缺席（退化为失败提示）。 */
    readonly browser: DirectoryBrowser | undefined;
    /** 能力探测已取得的 home 层，复用为对话框首帧，避免重复请求。 */
    readonly initialListing?: DirectoryListing;
    /**
     * 采纳一个绝对路径。
     * @returns undefined = 已成功（对话框自行关闭）；字符串 = 已本地化的失败句（原地显示并保持打开）。
     */
    readonly onConfirm: (path: string) => Promise<string | undefined>;
    /** 取消（取消按钮 / Esc / 遮罩点击）。 */
    readonly onClose: () => void;
}
/**
 * 目录拾取对话框。挂载与否由父组件决定；本组件只按 `open` 决定渲染浮层，
 * 全部 hooks 无条件调用以满足 hooks 规则。
 */
export declare function DirectoryPickerDialog(props: DirectoryPickerDialogProps): ReactNode;
