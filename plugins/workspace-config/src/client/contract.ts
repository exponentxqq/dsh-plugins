/**
 * 统一「工作区配置」弹窗的**座位契约唯一权威**。
 *
 * 本模块只声明「分节挂在哪里、拿到什么、按什么顺序排」，不含任何 React 组件、样式或
 * 运行时依赖：零 React、零上游运行时 import（唯一的 `import type {}` 只是为了把
 * `@deepseek-ai/dsh-client-ui-slots` 的模块增强目标解析进本程序）。三个贡献方
 * （multi-root-workspace / session-tool-toggle / web-ux）**只以 `import type`** 消费这里
 * 的类型，因此不会把 holder 的组件、CSS 注入器或 `createElement` 打进自己的 bundle。
 *
 * 贡献方的持有方式（三包一致）：
 *
 * ```ts
 * import type {} from 'dsh-plugin-workspace-config/client'                            // 取得 SlotMap 增补
 * import type { WorkspaceConfigSectionSeat } from 'dsh-plugin-workspace-config/client' // 取得字面量类型
 * const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'          // 本地值
 * ```
 *
 * 三条纪律（均有断言守护）：
 *
 * 1. 只允许 `import type`（`verbatimModuleSyntax` 下零产物；贡献方 bundle 断言「不含
 *    `dsh-plugin-workspace-config`」）；`WORKSPACE_CONFIG_SECTION` 这类运行时常量是
 *    **holder 内部**用的，贡献方不 import 它，各自持有一份字面量并由上述类型断言守护。
 * 2. **不把** `dsh-plugin-workspace-config` 写进贡献方的 `dsh.client.inject`：那会变成对
 *    holder 的运行时加载依赖，与「贡献方对 holder 的依赖仅限编译期类型」的结论冲突；
 *    而 `slots.inject` 的软注册本来就不需要任何加载顺序保证。
 * 3. 座位字面量在每个包里各自持有一份，靠类型断言而不是共享运行时常量保证一致。
 *
 * 座位形状与官方 `settings.section` 同构：`kind: 'list'`、`scope: 'root'`，owner 份额只有
 * `close()`（弹窗开合由 holder 拥有）。holder 在注册 `shell.overlay` 时用 `children` 声明
 * 本座位（Declaring is claiming），渲染时以 `renderSlot(WORKSPACE_CONFIG_SECTION,
 * { close }, { only: activeId })` 过滤出当前选中分节。
 *
 * @module dsh-plugin-workspace-config/client/contract
 */

// 类型专用 import：`declare module` 是模块增强（augmentation），目标模块必须先作为本文件的
// 依赖被解析一次，否则 tsc 报 TS2664「module cannot be found」。`import type {}` 在编译期
// 被完全擦除，不进 bundle，也不给贡献方带来运行时耦合。
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/**
 * 分节座位的座位名（holder 内部使用的运行时常量）。
 *
 * 贡献方不 import 这个常量——见模块头「三条纪律」的第 1 条；它只服务 holder 自己的注册与
 * 渲染调用点，避免同一字面量在本包内出现多份。
 */
export const WORKSPACE_CONFIG_SECTION = 'workspace-config.section' as const

/**
 * 贡献方本地常量必须赋给这个类型：写错字面量即 typecheck 失败。
 *
 * 这是「各包各持一份字面量」纪律的类型守护——字面量类型比运行时常量更严格，因为它同时
 * 钉住值与位置。
 */
export type WorkspaceConfigSectionSeat = 'workspace-config.section'

/**
 * 分节座位的 owner 份额：与官方 `settings.section` 同构（只有 `close`）。
 *
 * owner 份额由弹窗在 `renderSlot` 时传入；分节自身不拥有弹窗开合状态。
 */
export interface WorkspaceConfigSectionOwnerProps {
  /** 关闭统一弹窗（弹窗开合由 holder 拥有）。 */
  close: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * 统一「工作区配置」弹窗的分节座位（list、scope root）。
     *
     * 由 workspace-config 的 `shell.overlay` 注册以 `children` 声明；贡献方按
     * `id`（分节键）、`order`（导航位）与 `label`（本地化文案，thunk 可随 locale 切换）
     * 注册，内容列一次只渲染一个选中分节。
     */
    'workspace-config.section': {
      kind: 'list'
      scope: 'root'
      owner: WorkspaceConfigSectionOwnerProps
    }
  }
}

/**
 * footer 入口 entry 的显示顺序（holder 内部常量）。
 *
 * 取 `50`：`sidebar.footer.action` 是 list 座位、按 order 升序排列；官方底部控件用缺省
 * `0`，multi-root 旧入口用 `50`、session-tool-toggle 旧入口用 `60`、web-ux 旧入口用 `100`。
 * 统一入口取代它们后取 `50`，既与官方控件留出间隔，又让后装插件可插在中间而不必重排
 * （D11）。
 */
export const WORKSPACE_CONFIG_TRIGGER_ORDER = 50

/**
 * 统一弹窗在 `shell.overlay` 上的显示顺序（holder 内部常量）。
 *
 * 取 `530`：web-ux 的删除确认弹窗是 `500`、旧会话管理浮层是 `520`，两者互斥不叠放；
 * 统一弹窗排在它们之后，保证「删除确认」始终盖在统一弹窗之上（D11）。
 */
export const WORKSPACE_CONFIG_DIALOG_ORDER = 530
