/**
 * 工作区清单源（holder 自持；`code-design.md` ③ §3.6）。
 *
 * 页面的统一工作区选择框与默认选择策略（Q10 的「最近使用」档）都要一份「已登记
 * 工作区」清单，而清单的唯一来源是上游 `workspaces` 客户端服务的 `list` 快照（Host
 * 权威顺序，与侧栏一致）。本模块把它投影成一份只读快照源，直接喂
 * `useSyncExternalStore`——因此 `getSnapshot()` 的 identity 稳定是硬要求。
 *
 * **三个生命周期事实**：
 *
 * 1. **服务晚到**：`workspaces` 可能晚于 holder 的 `apply` 就绪，所以绑定走
 *    `ctx.inject(['workspaces'], …)`——服务到达才执行回调；在 `apply` 期用 `ctx.get`
 *    硬读会把「未就绪」固化成永久缺失（D-选择框 的裁定）。
 * 2. **双版本记忆**（与 `sections.ts` 同族纪律）：版本一是「服务在不在」（`bound`），
 *    版本二是「上游快照的 identity」。两个版本都没变时 `getSnapshot()` 原样返回上一次
 *    的投影对象，变了才重建。上游 `WorkspaceSource.getSnapshot()` 自己保证 identity
 *    稳定（见下表），所以按快照 identity 记忆等价于按内容记忆，且不必逐字段比较。
 * 3. **服务退场**：注入回调返回的清理函数（服务退场 / holder 卸载时由 cordis 调用）
 *    先摘上游订阅、再把记忆复位成 `pending`，然后通知订阅者——页面回落「未就绪」，
 *    而不是指着一份已经失效的清单。
 *
 * **`pending` 的语义**（页面据此把份额降到 `{ kind: 'none' }`）：服务未绑定、快照读不出、
 * 或上游自己的到达生命周期尚未走到 `ready`，三者都算「未就绪」。**零工作区**与
 * **未就绪**是不同事实：前者是 `ready` 且零行（选择框只剩「未分配」），后者是「还不知道」。
 *
 * **为什么本文件零上游 DSH 包 import（连类型也不引）**：清单源只需按结构软读上游
 * （`ctx.inject` 回调、`list.getSnapshot` / `list.subscribe`），上游形状以上表锚点记录，
 * 不必固化成编译期依赖；代价是 `ctx` 只能收 `unknown`（`ClientContext` 类型来自上游
 * cordis 包），收益是本模块能在不含上游类型的测试环境里用假 ctx 直接驱动
 * （契约见 `code-design.md` ① §1.1 的「零上游 import」断言与 `test/workspace-source.test.ts`）。
 * 消费方照常传 `apply` 拿到的浏览器根上下文即可：结构软读落空时本模块停在 `pending`，
 * 不抛错（降级路径是设计的一部分，见 ⑥ A1）。
 *
 * **上游快照锚点**（dsh 0.2.2-rc.1 安装树，路径相对其 `node_modules/`，供漂移时定位；
 * 本文件不 import 其中任何模块）：
 *
 * | 事实 | 位置 |
 * | --- | --- |
 * | 客户端 `ctx.inject(['workspaces'], …)` 的实际用法 | `dsh-client-ui-sidebar-browser/lib/client.js:1812-1813` |
 * | `IWorkspaces.list`（客户端服务的 `list` 面） | `dsh-api-workspace-controller/lib/types/client/service.d.ts:38-44` |
 * | `WorkspaceSource`（`getSnapshot` identity 稳定 + `subscribe`） | 同文件 `:27-36` |
 * | `WorkspaceListPhase`（`pending` 单调到 `ready`） | `dsh-api-workspace-controller/lib/types/client/model.d.ts:7` |
 * | `WorkspaceSnapshot`（`items` / `phase` / `state`；无工作区时 `items` 为空数组） | 同文件 `:9-18` |
 * | `WorkspaceView`（`workspaceId` / `path` / `title` / `sessionIds` / 时间戳） | `dsh-api-workspace-controller/lib/types/types.d.ts:13-28` |
 *
 * @module dsh-plugin-workspace-config/client/workspace-source
 */
/** 选择框/默认策略用的一行（纯数据；`sessionIds` 只用于「最近使用」）。 */
export interface WorkspaceChoiceItem {
    /** Host 的 `WorkspaceId`（选择值的身份，也是选择框 Menu 行的编解码键）。 */
    readonly id: string;
    /** 用户可见标题（可能为空串：显示时由消费方的 `selectionLabelOf` 用 `path` 兜底）。 */
    readonly title: string;
    /** 规范绝对路径（与 `WorkspaceView.path` 同源，是各分节自己的寻址键）。 */
    readonly path: string;
    /** 账到该工作区的会话 id（Host 手动顺序；「最近使用」档按它取会话 `updatedAt`）。 */
    readonly sessionIds: readonly string[];
}
/** 清单快照：`pending` = workspaces 服务未就绪（页面仍可渲染，份额给 `{kind:'none'}`）。 */
export interface WorkspaceListSnapshot {
    /** 到达阶段：`ready` 时 `items` 才是权威清单（含「零工作区」）。 */
    readonly phase: 'pending' | 'ready';
    /** 已登记工作区（Host 顺序，**不**按标题排序）；`pending` 时恒为空。 */
    readonly items: readonly WorkspaceChoiceItem[];
}
/** uSES 可用的只读源（getSnapshot 保证 identity 稳定）。 */
export interface WorkspaceListSource {
    /**
     * 读取当前清单快照（identity 稳定）。
     * @returns 当前快照；两个记忆版本都没变时返回上一次的**同一引用**。
     */
    getSnapshot(): WorkspaceListSnapshot;
    /**
     * 订阅清单变化（服务到达 / 上游快照变化 / 服务退场）。
     * @param listener - 变化回调（无参数）。
     * @returns 退订函数（幂等）。
     */
    subscribe(listener: () => void): () => void;
}
/**
 * 建一个工作区清单源：`ctx.inject(['workspaces'], …)` 绑定 `list.getSnapshot/subscribe`；
 * 服务退场回落 `pending` 并通知；同一快照内容不重建（identity 稳定）。
 *
 * 绑定在**调用期**建立（`apply` 期构造一次），不按订阅者引用计数：清单只有一份，上游
 * 订阅也只有一个，页面挂载 / 卸载不需要重新协商依赖。注入回调的清理函数由 cordis 在
 * 服务退场或 holder 卸载时调用，因此「回落 `pending`」在两种情况下都成立。
 *
 * @param ctx - 浏览器侧根上下文（`apply` 的入参）。收 `unknown` 是本文件「零上游 import」
 *   契约的直接代价（`ClientContext` 类型来自上游 cordis 包）；结构软读落空时清单源停在
 *   `pending`，不抛错。
 * @returns 清单源；构造后立刻可用（未绑定时读 `pending`）。
 */
export declare function createWorkspaceListSource(ctx: unknown): WorkspaceListSource;
