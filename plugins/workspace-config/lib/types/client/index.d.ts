/**
 * 统一「工作区配置」入口的浏览器半装配（侧栏面板行 + 主区域独立页面）。
 *
 * 本包是**纯壳 holder**：不承载任何分节业务，只做五件事，按依赖顺序：
 *
 * 1. **注册双语文案**：`ctx.effect(() => ctx.locale.register(NS, { zh, en }))`。座位 entry
 *    声明 `locale: NS`，渲染时由框架合成 `t` 座；字典缺席会 fail loud，所以先于注册，
 *    并挂在 `ctx.effect` 上（插件卸载即摘）。
 * 2. **建 nav 行投影源**：`createSectionsSource(ctx)`（双版本记忆：分节账本版本 + locale
 *    版本；`getSnapshot()` 返回 identity 稳定的数组），作为页面注入面的一部分。
 * 3. **建工作区清单源**：`createWorkspaceListSource(ctx)`（`pending | ready`，workspaces
 *    服务晚到自动转 ready），驱动页面级唯一选择框与默认选择策略。
 * 4. **绑行文案 thunk**：`ctx.locale.bind(NS)`。行 entry 的 `label` 是 thunk，locale 切换
 *    时重新求值即可，无需重注册。
 * 5. **双注册（经 `createPanelPair` 配对）**：
 *    - `main`（keyed / root，key = `PANEL_ID`）→ 独立页面；同一个 `register` 里用
 *      `children` 声明分节座位 `workspace-config.section`（Declaring is claiming）。
 *    - `sidebar.panellist`（list / root，id = 同一个 `PANEL_ID`，order = `PANEL_ORDER`）→
 *      侧栏那一行图标。
 *
 * **为什么两处必须配对**：宿主点击面板行时直接 `ctx.layout.selectPanel(id)`，而它对
 * **未注册**的 main key 会 throw——两处各自 `try/catch` 会留下「行在、点了抛错」的坏形态。
 * `createPanelPair` 让页面装成之后行才注册、页面退场时行一并退场，任一侧失败只
 * `ctx.logger.warn`，最终观感是「没有这一行」。
 *
 * **为什么页面没有 store**：keyed 的 `main` 渲染切走即卸载（renderer 不 keepMounted），
 * 页面的选中 tab 与选择框手选值都是组件本地 state（`WorkspaceConfigPage` 的模块头），
 * 重进自然回到默认——这正是「`main` 注册不带 store」的承诺，不要改成 store 持久化。
 *
 * **注入面是端口函数，不是服务值**：renderer 的 `inject` 工厂每个 entry 只跑一次，而
 * `sessions` 服务可能晚于 `apply` 就绪、客户端对象也可能被宿主替换；因此 `currentSessionId`
 * / `sessionUsage` 传的是「每次现取」的函数（见 `session-context.ts`），与清单源内部的
 * `ctx.inject(['workspaces'], …)` 同一纪律。
 *
 * **为什么不需要把贡献方写进依赖**：分节座位由本包用 `children` 声明，贡献方用
 * `ctx.slots.inject` 软注册；loader 对「图里没有该包」是静默跳过，所以四包之间不建立任何
 * 运行时加载依赖（四包同装是**约定**而不是硬依赖，见仓库 README）。未装 holder 时贡献方
 * 的 inject 回调永不触发，也不报错、不残留入口。`inject` 服务面因此仍只有 `slots` 与
 * `locale` 两项。
 *
 * **类型权威**：座位契约的类型权威在 `@dsh-plugins/contracts`（D-15），贡献方**直连**该包
 * `import type`；本文件从 `./contract` re-export 的类型与运行时常量（座位名与面板 id / 位次）
 * 只服务本包装配与过渡兼容（`exports['./client'].types` → `lib/types/client/index.d.ts`），
 * 不是贡献方的取类型路径。
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
export { PANEL_ID, PANEL_ORDER, WORKSPACE_CONFIG_SECTION } from './contract.ts';
/**
 * 依赖服务名单：只有座位注册表与字典服务。
 *
 * 不声明任何贡献方包——四包之间只有编译期类型依赖，没有运行时加载边（D3）；`sessions`
 * 也不进名单（页面注入面按端口函数现取，服务缺席是受支持状态）。
 */
export declare const inject: readonly string[];
/**
 * 浏览器半的装配入口。
 * @param ctx - 浏览器侧根上下文。
 */
export declare function apply(ctx: ClientContext): void;
