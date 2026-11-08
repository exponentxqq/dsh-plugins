/**
 * 统一「工作区配置」的独立页面壳（`main` 座位上唯一的页面消费者）。
 *
 * ## 形态：与官方插件页同构，只保留骨架（D8）
 *
 * `page > pageBody > pageBar(pageHead[h1 + intro] + toolbar + pageTabs) + tabpanel`。
 * toolbar 是页面级唯一的工作区选择框，pageTabs 是分节 tab 行，tabpanel 里只渲染当前
 * 选中的那一节。**不复制**插件页的吸顶 / 紧凑测量（`--plugin-header-*` /
 * `data-natural` / `data-compact` 与容器查询）：那是插件页私有的、由 `ResizeObserver`
 * 与滚动位置写回内联变量驱动的布局机制，需求只要求「样式和布局参照」，复制它会引入
 * 一段本仓测试覆盖不到的浏览器测量代码。
 *
 * ## a11y：真 tablist / tabpanel（D6）
 *
 * tab 行由 primitives 的 `SegmentedTabs` 渲染——它自己产出 `role="tablist"` 与
 * `role="tab"`（含 `aria-selected` / `aria-controls` / 方向键漫游）。holder 负责补齐
 * 另一半配对：`role="tabpanel"` 的 `id` / `aria-labelledby` 与选中 tab 的
 * `id` / `aria-controls` 逐字互指（同一个 `tabsId` 基 + 同一个分节 id）。
 *
 * 旧弹窗刻意避开 tablist（改 `nav` + `aria-current`）的理由是「分节组件由第三方注册，
 * holder 无法强制它的根节点带 `role=tabpanel`」；页面化后 tabpanel 由 holder 自己渲染，
 * 该理由消失（D6）。分节内部若还有自己的 tabpanel（web-ux 会话管理），嵌套是合法的。
 *
 * ## 状态全在本地（Q3 / Q9）
 *
 * `selected`（tab）与 `chosen`（选择框手选值）都是本组件的本地 state，页面切走即卸载、
 * 重进即回到默认——这是 D1「`main` 注册不带 store」的直接代价与承诺，不要改成
 * store 或 useEffect 持久化。
 *
 * `sections` / `workspaces` 两个快照源用 `useSyncExternalStore` 消费；两者都保证
 * 「内容没变时返回同一引用」，所以不会自激重渲染。
 *
 * `activeId` 的失效回退：选中的分节在账本里消失（贡献方退场 / 被禁用）时回落到
 * `rows[0]`（order 最小者）。没有任何分节时 `pageBody` 里只有 `.empty[role=status]`。
 *
 * ## 选择值（Q10）
 *
 * 手选优先；手选值失效（工作区被删）或还没手选过时，按 `defaultSelection`
 * （最近使用 > 当前会话所属 > 第一项 > 未分配）重新解析。清单源未就绪
 * （`phase === 'pending'`）时给分节下传 `{kind:'none'}`，toolbar 换成未就绪文案，
 * 不发任何寻址请求。
 *
 * ## 换工作区 = 分节重挂（D14）
 *
 * holder 每次渲染都按当前选择传 owner 份额 `{ workspace }`；**重挂语义由分节自己用
 * `key` 落地**（stt 用 `workspace.path`、web-ux 用选择键）。holder 不替它们挑 key，
 * 也不用 effect 对齐 props——后者会让分节状态残留。
 *
 * @module dsh-plugin-workspace-config/client/WorkspaceConfigPage
 */
import { type ReactNode } from 'react';
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { NS } from './locales.ts';
import type { WorkspaceConfigSectionsSource } from './sections.ts';
import type { WorkspaceListSource } from './workspace-source.ts';
import type { SessionUsageSnapshot } from './session-context.ts';
/** apply 期单例/端口的注入面。 */
export interface WorkspaceConfigPageInjected {
    /** nav 行投影源（分节账本 + locale 双版本记忆）。 */
    readonly sections: WorkspaceConfigSectionsSource;
    /** 工作区清单源（`pending | ready`，服务晚到自动转 ready）。 */
    readonly workspaces: WorkspaceListSource;
    /** 当前会话 id（每次现取，服务缺席返回 undefined）。 */
    readonly currentSessionId: () => string | undefined;
    /** 会话 `updatedAt` 读数（每次现取，服务缺席返回 undefined）。 */
    readonly sessionUsage: () => SessionUsageSnapshot | undefined;
}
/**
 * 完整 props：`main` 的运行时份额 + 已声明子座位的 `renderSlot` 能力 + 本命名空间
 * 翻译 + 注入面。
 */
export type WorkspaceConfigPageProps = PropsRuntime<'main'> & PropsRenderSlots<'workspace-config.section'> & PropsLocale<typeof NS> & WorkspaceConfigPageInjected;
/**
 * 页面壳。
 *
 * hooks 全部无条件调用（空态分支也必须排在任何 hook 之后），派生值每次渲染重算
 * ——`rows` / `list` 都是 identity 稳定的快照，重算本身不触发额外渲染。
 * @param props - 两个快照源、两个会话读数端口、`renderSlot` 与 `t`。
 * @returns 有分节时是「页头 + tabpanel」；没有分节时是整页空态。
 */
export declare function WorkspaceConfigPage(props: WorkspaceConfigPageProps): ReactNode;
