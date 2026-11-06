/**
 * 跨包契约的**类型权威**（D-15，修订归档决策 D4；ADR 预留路径
 * `docs/decisions/ADR-0001-shared-build-and-source-kits.md`）。
 *
 * 本包只承载多包共享的座位契约：`workspace-config.section` 的字面量类型、owner 份额、
 * 槽位条目形状与 order 权威值。**纯类型、零运行时、零依赖**（`dependencies: {}`，
 * 仅 `typescript` / `oxlint` 两个工具链 devDeps），`exports` 的 `types` 与 `default`
 * 都指向本 TS 源，由消费方双轨解析（tsc 走 `paths` / 包 exports，esbuild 走 package
 * exports 内联）。
 *
 * 权威转移（D-15）：holder（`dsh-plugin-workspace-config`）与三个贡献方
 * （multi-root-workspace / session-tool-toggle / web-ux）**都只以 `import type`** 消费本包；
 * holder 的 `src/client/contract.ts` 退化为文档指针 + 过渡 re-export。`import type`
 * 编译期擦除，因此运行时零影响、贡献方产物词集不变（bundle 断言继续全绿）。
 *
 * 三条纪律（均有断言守护）：
 *
 * 1. 只允许 `import type`：`verbatimModuleSyntax` 下零产物；贡献方 bundle 断言「不含
 *    holder 包名」。座位字面量在**每个包里各自持有一份**，靠 `WorkspaceConfigSectionSeat`
 *    字面量类型断言而不是共享运行时常量保证一致（写错字面量即 typecheck 失败）。
 * 2. **不把** holder 写进贡献方的 `dsh.client.inject`：那会变成运行时加载依赖，与「贡献方
 *    对 holder 的依赖仅限编译期类型」的结论冲突；`slots.inject` 的软注册本来就不需要加载
 *    顺序保证。
 * 3. 座位字面量与 order 值由各包自持，本包只给**类型**（见下面 `WorkspaceConfig*Order`），
 *    因此没有任何包需要从本包做值 import——权威与运行时解耦。
 *
 * 为什么本包不自己写 `declare module '@deepseek-ai/dsh-client-ui-slots'`：模块增补要求
 * 目标模块能从**声明文件所在包**解析，而本包按 AR2 是零 `@deepseek-ai/*` 依赖（纯类型包
 * 不能自己装 UI 包，否则会重演「类型权威耦合某个包」的旧问题）。因此增补动作留在各消费方
 * 的 client 程序里（一行 `declare module`，条目形状直接引用本包的
 * {@link WorkspaceConfigSectionSlot}），**形状、owner 份额与座位名的权威仍在本包**。
 *
 * 座位形状与官方 `settings.section` 同构：`kind: 'list'`、`scope: 'root'`，owner 份额只有
 * `close()`（弹窗开合由 holder 拥有）。holder 在注册 `shell.overlay` 时用 `children` 声明
 * 本座位（Declaring is claiming），渲染时以 `renderSlot('workspace-config.section',
 * { close }, { only: activeId })` 过滤出当前选中分节。
 *
 * @module @dsh-plugins/contracts
 */

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

/**
 * `workspace-config.section` 在 `SlotMap` 里的条目形状（唯一权威）。
 *
 * 消费方在自己的 client 程序里把座位名映射到这个形状：
 *
 * ```ts
 * import type { WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts'
 * declare module '@deepseek-ai/dsh-client-ui-slots' {
 *   interface SlotMap {
 *     'workspace-config.section': WorkspaceConfigSectionSlot
 *   }
 * }
 * ```
 *
 * 形状一旦在这里变化，所有消费方的增补会同时失配——这正是「单一权威」要的效果。
 */
export interface WorkspaceConfigSectionSlot {
  /** 分节是 list 座位的 entry（导航行）。 */
  kind: 'list'
  /** 分节挂在 root 作用域（弹窗不属于某个会话）。 */
  scope: 'root'
  /** 弹窗传给分节的 owner 份额。 */
  owner: WorkspaceConfigSectionOwnerProps
}

/**
 * footer 入口 entry 的显示顺序（权威值 `50`，D11）。
 *
 * `sidebar.footer.action` 是 list 座位、按 order 升序排列；官方底部控件用缺省 `0`，
 * multi-root 旧入口用 `50`、session-tool-toggle 旧入口用 `60`、web-ux 旧入口用 `100`。
 * 统一入口取代它们后取 `50`，既与官方控件留出间隔，又让后装插件可插在中间而不必重排。
 *
 * 以**字面量类型**而非运行时常量给出：holder 在自己的 `contract.ts` 里用
 * `const X: WorkspaceConfigTriggerOrder = 50` 持有运行期值，本包不产生任何运行时 import。
 */
export type WorkspaceConfigTriggerOrder = 50

/**
 * 统一弹窗在 `shell.overlay` 上的显示顺序（权威值 `530`，D11）。
 *
 * web-ux 的删除确认弹窗是 `500`、旧会话管理浮层是 `520`，两者互斥不叠放；统一弹窗排在
 * 它们之后，保证「删除确认」始终盖在统一弹窗之上。同样只给字面量类型。
 */
export type WorkspaceConfigDialogOrder = 530

/**
 * 三个贡献分节在弹窗 nav 中的 order 权威集合（`10 / 20 / 30`，D11）。
 *
 * multi-root-workspace（工作区文件夹）→ session-tool-toggle（工作区默认档）→
 * web-ux（会话管理）。各贡献方在自己的 `seats.ts` / `index.ts` 里持有字面量；本类型
 * 只负责「允许的取值集合」，不提供运行时常量（纪律 3）。
 */
export type WorkspaceConfigSectionOrder = 10 | 20 | 30
