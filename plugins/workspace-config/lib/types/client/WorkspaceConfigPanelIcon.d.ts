/**
 * `sidebar.panellist` 座位上的侧栏面板行图标（「工作区配置」那一行的字形）。
 *
 * ## 座位形态
 *
 * `sidebar.panellist` 是 list / root 座位：宿主侧栏拥有按钮本身、可见文案与选中态，
 * 插件只交一个**字形**。注册时给 `id`（= `main` 的 `key`，两者同一个面板 id）与
 * `order`，宿主据此把行排进面板列表、点击时切到对应页面。
 *
 * ## 为什么只收 `{ size, active }` 里的 `size`
 *
 * owner 份额是 `SidebarPanelIconOwnerProps`（`{ size, active }`）：
 *
 * - `size`：宿主要求的方形边长（px），原样透传给图标组件，让本行与官方面板行的字形
 *   几何一致；
 * - `active`：本行是否选中。**刻意不消费**——行选中态由宿主用 `aria-current` 表达
 *   （可访问名与视觉状态都由宿主负责），插件再画一遍选中色会与宿主样式的
 *   `:hover` / `:focus-visible` 半态打架，也让「选中」出现两个真相来源。
 *
 * 图标取自 primitives 的 `IconWorkspaceTreeOutlineRegular`：与工作区分组视图同一个字形
 * （「工作区树」的语义），并复用本包 dialog/trigger 时代同源的图标体系（同一外部模块词，
 * 不新增 require 面）。
 *
 * @module dsh-plugin-workspace-config/client/WorkspaceConfigPanelIcon
 */
import type { ReactNode } from 'react';
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
/**
 * 渲染侧栏面板行的字形。
 * @param props - 宿主给行图标的份额：请求的方形边长与是否选中（后者不消费）。
 * @returns 尺寸对齐宿主请求的工作区树图标。
 */
export declare function WorkspaceConfigPanelIcon({ size }: SidebarPanelIconOwnerProps): ReactNode;
