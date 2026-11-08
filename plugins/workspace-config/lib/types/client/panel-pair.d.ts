/**
 * `main` 页面座位与 `sidebar.panellist` 行座位的**配对协调器**（同生共死）。
 *
 * 宿主的独立面板由两处注册共同构成：`main`（keyed、root）是页面本体，
 * `sidebar.panellist`（list、root）是侧栏那一行图标按钮，两者的键是**同一个**面板 id——
 * 宿主点击行时直接 `ctx.layout.selectPanel(id)`，而 `selectPanel` 对**未注册**的 main key
 * 会直接 throw（layout 的 `ILayout.selectPanel` 契约）。因此这两处不能各自 `try/catch`：
 * 行注册成功、页面注册失败时，观感不是「少了页面」，而是「行在、点一下就抛错」。
 *
 * 本模块把两侧的装/摘收进一个状态机，对外只暴露 `page()` / `row()` 两个入口：
 * 任一侧失败只 `warn`（诊断留痕），另一侧不受影响，最终观感退回「没有这一行」——
 * 与旧版两处座位各自 `try/catch` 的「最坏是入口不出现」同一条纪律。
 *
 * ## 状态机（四个变量）
 *
 * - `pageDispose`：页面座位的 disposer；`undefined` = 页面未装成；
 * - `rowInstall`：行座位的装法（行座位到场时登记，退场即清空）；
 * - `rowDispose`：行 entry 的 disposer；
 * - `rowSeatLive`：行座位是否在场（与页面是否装成无关）。
 *
 * ## 不变式
 *
 * 1. `rowDispose` 存在的充要条件是「页面已装 **且** 行座位在」——页面没装成时行绝不
 *    单独注册（否则就是上面那个「点了抛错」的坏形态）；
 * 2. `page()` 的 disposer **先摘行、再摘页面**：页面塌陷会连坐它用 `children` 声明的
 *    `workspace-config.section` 子座位，顺序反了会让行短暂指着一个已经不在的页面；
 * 3. 任一步抛错只 `warn`，另一侧照常（`install` 抛错 = 该侧未装成；`dispose` 抛错 =
 *    状态已经先摘干净，不留悬空引用）；
 * 4. 两种到场顺序收敛到同一终态：`main` 先到 → 页面装成后行座位一到就补装；
 *    `sidebar.panellist` 先到 → 只登记装法，等页面到场再装。
 *
 * ## 为什么同步、无订阅
 *
 * 座位的到场/退场由 cordis 的 `ctx.slots.inject(seat, cb)` 驱动：座位被声明时执行 `cb`，
 * 它的返回值在座位消失或插件卸载时被调用。本模块只是把这两个回调配成一对，不持有任何
 * 异步资源、不订阅任何东西，因此不需要 effect 作用域，也不需要额外的 `ctx`——纯函数式
 * 状态机，可以用假 install 直接驱动单测。
 *
 * @module dsh-plugin-workspace-config/client/panel-pair
 */
/**
 * 一对面板座位的装配句柄。
 *
 * 两个方法都在各自的座位回调里调用，返回值直接作为该座位效应的 disposer 交给 cordis。
 */
export interface PanelPair {
    /**
     * 在 `main` 座位回调里装页面；成功后若行座位已到场则补装行。
     * @param install 装页面并返回 disposer；抛错即视为失败（只 `warn`，不向外抛）。
     * @returns 该座位效应的 disposer（幂等；先摘行、再摘页面）。
     */
    page(install: () => () => void): () => void;
    /**
     * 在 `sidebar.panellist` 座位回调里登记行座位已到场。
     *
     * 页面尚未装成时只记录装法、不注册行；页面装成后由 `page()` 补装。
     * @param install 装行并返回 disposer；抛错即视为失败（只 `warn`，不向外抛）。
     * @returns 该座位效应的 disposer（幂等；只摘行，不碰页面）。
     */
    row(install: () => () => void): () => void;
}
/**
 * 造一对面板座位的协调器。
 * @param warn 装配失败的诊断上报：`message` 不带日志标签（由调用方加前缀），
 *   `error` 是原始异常（可能缺席）。
 * @returns `main` / `sidebar.panellist` 两个座位的配对装配面。
 */
export declare function createPanelPair(warn: (message: string, error?: unknown) => void): PanelPair;
