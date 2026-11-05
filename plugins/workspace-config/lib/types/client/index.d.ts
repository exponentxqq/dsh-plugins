/**
 * 统一「工作区配置」入口的浏览器半装配。
 *
 * 本包是**纯壳 holder**：不承载任何分节业务，只做四件事，按依赖顺序：
 *
 * 1. **注册双语文案**：`ctx.effect(() => ctx.locale.register(NS, { zh, en }))`。座位 entry
 *    声明 `locale: NS`，渲染时由框架合成 `t` 座；字典缺席会 fail loud，所以先于注册，
 *    并挂在 `ctx.effect` 上（插件卸载即摘）。
 * 2. **建打开桥**：`createOpenStore()`（布尔快照，D15）。入口只写 `open()`，弹窗订阅它
 *    并在关闭动作里写回 `close()`。
 * 3. **建 nav 行投影源**：`createSectionsSource(ctx)`（双版本记忆：分节账本版本 + locale
 *    版本；`getSnapshot()` 返回 identity 稳定的数组）。
 * 4. **两处软注册**（各自独立 `try/catch`）：
 *    - `sidebar.footer.action`（list / root，order 50）→ footer 唯一入口；
 *    - `shell.overlay`（list / root，order 530）→ 统一弹窗，并在同一个 `register` 里用
 *      `children` 声明分节座位 `workspace-config.section`（Declaring is claiming）。
 *
 * **为什么每处各自 try/catch**：座位缺席或拒绝注册时，最坏结果是「该入口不出现」，而
 * 不是整个客户端半装配失败——同一个壳里还有别的插件、别的座位。两处互相独立，一处
 * 失败不连累另一处；`ctx.logger?.warn` 留诊断线索，`apply` 始终正常返回。
 *
 * **为什么不需要把贡献方写进依赖**：分节座位由本包用 `children` 声明，贡献方用
 * `slots.inject` 软注册；loader 对「图里没有该包」是静默跳过，所以四包之间不建立任何
 * 运行时加载依赖（四包同装是**约定**而不是硬依赖，见仓库 README）。未装 holder 时贡献方
 * 的 inject 回调永不触发，也不报错、不残留入口。
 *
 * **类型权威（组 2 交接项）**：本文件同时从 `./contract` re-export 座位契约的**类型**
 * （`WorkspaceConfigSectionSeat` / `WorkspaceConfigSectionOwnerProps`）与**运行时常量**
 * （座位名与两个 order）。贡献方按 `import type … from 'dsh-plugin-workspace-config/client'`
 * 取类型——`exports['./client'].types` 指向编译出的 `lib/types/client/index.d.ts`，其中
 * 含本文件的 re-export；缺了这一段，D3/D4 的类型权威就落空。
 *
 * @module dsh-plugin-workspace-config/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/**
 * 座位契约的类型与运行时常量 re-export（类型权威的唯一入口）。
 *
 * 贡献方只以 `import type` 消费类型；运行时常量是 holder 内部与文档用的，贡献方
 * 各自持有本地字面量（D3 三条纪律）。
 */
export type { WorkspaceConfigSectionOwnerProps, WorkspaceConfigSectionSeat } from './contract.ts';
export { WORKSPACE_CONFIG_DIALOG_ORDER, WORKSPACE_CONFIG_SECTION, WORKSPACE_CONFIG_TRIGGER_ORDER, } from './contract.ts';
/** footer 入口 entry 的 id（list 座位的 cell 身份；同 cell 同优先级重复注册会 fail loud）。 */
export declare const TRIGGER_ID = "workspace-config-trigger";
/** 统一弹窗 entry 的 id（`shell.overlay` 的 list cell；530 与 web-ux 删除弹窗 500 互斥）。 */
export declare const DIALOG_ID = "workspace-config-dialog";
/**
 * 依赖服务名单：只有座位注册表与字典服务。
 *
 * 不声明任何贡献方包——四包之间只有编译期类型依赖，没有运行时加载边（D3）。
 */
export declare const inject: readonly string[];
/**
 * 浏览器半的装配入口。
 * @param ctx - 浏览器侧根上下文。
 */
export declare function apply(ctx: ClientContext): void;
