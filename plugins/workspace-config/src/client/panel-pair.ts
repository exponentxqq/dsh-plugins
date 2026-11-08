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
  page(install: () => () => void): () => void
  /**
   * 在 `sidebar.panellist` 座位回调里登记行座位已到场。
   *
   * 页面尚未装成时只记录装法、不注册行；页面装成后由 `page()` 补装。
   * @param install 装行并返回 disposer；抛错即视为失败（只 `warn`，不向外抛）。
   * @returns 该座位效应的 disposer（幂等；只摘行，不碰页面）。
   */
  row(install: () => () => void): () => void
}

/**
 * 造一对面板座位的协调器。
 * @param warn 装配失败的诊断上报：`message` 不带日志标签（由调用方加前缀），
 *   `error` 是原始异常（可能缺席）。
 * @returns `main` / `sidebar.panellist` 两个座位的配对装配面。
 */
export function createPanelPair(warn: (message: string, error?: unknown) => void): PanelPair {
  /** 页面座位的 disposer；`undefined` = 页面未装成（此时行不得注册）。 */
  let pageDispose: (() => void) | undefined
  /** 行座位的装法；行座位退场即清空（页面回场时可据此补装）。 */
  let rowInstall: (() => () => void) | undefined
  /** 行 entry 的 disposer；存在 ⇔ 页面已装 且 行座位在（不变式 1）。 */
  let rowDispose: (() => void) | undefined
  /** 行座位是否在场（与页面是否装成无关）。 */
  let rowSeatLive = false

  /**
   * 装行（幂等）：只在「页面已装 且 行座位在 且 尚未装」时真正调用装法。
   *
   * 装法抛错只 `warn`：行不出现，页面与其他座位不受影响（不变式 3）。
   */
  const installRow = (): void => {
    // 行座位不在场时不装（不变式 1 的前半）；已装则不重复装（幂等）。
    if (!rowSeatLive || rowDispose !== undefined) return
    const install = rowInstall
    if (install === undefined) return
    try {
      rowDispose = install()
    } catch (error) {
      // 装法抛错时它可能已经部分生效，这里没有可回收的句柄；复位成「未装」让下一次
      // 补装（页面回场 / 行座位重新到场）能重试，而不是永远停在半装状态。
      rowDispose = undefined
      warn('侧栏面板行注册失败，本入口不显示', error)
    }
  }

  /**
   * 摘行（幂等）：先清状态再调 disposer，disposer 抛错也不会留下悬空的 `rowDispose`
   * （不变式 1 不被破坏）。
   */
  const disposeRow = (): void => {
    const dispose = rowDispose
    rowDispose = undefined
    if (dispose === undefined) return
    try {
      dispose()
    } catch (error) {
      warn('侧栏面板行注销失败', error)
    }
  }

  /** 摘页面（幂等）：同样先清状态再调 disposer。 */
  const disposePage = (): void => {
    const dispose = pageDispose
    pageDispose = undefined
    if (dispose === undefined) return
    try {
      dispose()
    } catch (error) {
      warn('页面座位注销失败', error)
    }
  }

  return {
    page: (install) => {
      // 座位重复到场（宿主重声明）：按「先摘行、再摘页」把上一轮摘干净，再装新的一轮。
      disposeRow()
      disposePage()
      try {
        pageDispose = install()
      } catch (error) {
        // 页面没装成：行也不装（不变式 1、3）。返回空 disposer 让座位效应照常收尾。
        warn('页面座位注册失败，本页面不显示', error)
        return () => {}
      }
      // 页面装成才补装行：行先到的顺序在这里收敛（不变式 4）。
      installRow()

      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        // 顺序不能反（不变式 2）：先摘行，再摘页面。
        disposeRow()
        disposePage()
      }
    },

    row: (install) => {
      // 座位重复到场：先摘旧行再记新装法，终态与单次到场一致。
      disposeRow()
      rowSeatLive = true
      rowInstall = install
      // 页面已装 → 立刻补装；页面未装 → 只登记，等 page() 到场再装（不变式 1）。
      if (pageDispose !== undefined) installRow()

      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        rowSeatLive = false
        rowInstall = undefined
        disposeRow()
      }
    },
  }
}
