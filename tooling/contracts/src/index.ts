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
 * 3. 座位字面量与 order 值由各包自持，本包只给**类型**（见
 *    `WorkspaceConfigSectionOrder`），因此没有任何包需要从本包做值 import——权威与运行时
 *    解耦。
 *
 * 为什么本包不自己写 `declare module '@deepseek-ai/dsh-client-ui-slots'`：模块增补要求
 * 目标模块能从**声明文件所在包**解析，而本包按 AR2 是零 `@deepseek-ai/*` 依赖（纯类型包
 * 不能自己装 UI 包，否则会重演「类型权威耦合某个包」的旧问题）。因此增补动作留在各消费方
 * 的 client 程序里（一行 `declare module`，条目形状直接引用本包的
 * {@link WorkspaceConfigSectionSlot}），**形状、owner 份额与座位名的权威仍在本包**。
 *
 * 座位形状与官方 `settings.section` 同构：`kind: 'list'`、`scope: 'root'`，owner 份额是
 * holder 页面产出的**纯数据**——页面级工作区上下文（{@link WorkspaceConfigWorkspaceContext}），
 * 没有任何回调。入口形态为「侧栏面板行（`sidebar.panellist`）+ 独立页面（`main` 注册）」：
 * holder 注册页面时用 `children` 声明本座位（Declaring is claiming），渲染时以
 * `renderSlot('workspace-config.section', { workspace }, { only: activeId })` 把当前选择
 * 传给选中分节；选择值变化即换 `key` 重挂分节，贡献方无需订阅或自行同步。
 *
 * 三态语义（owner 份额的载荷，纯数据、无回调）：
 *
 * | `kind`       | 语义                                           | 消费方处置                         |
 * | ------------ | ---------------------------------------------- | ---------------------------------- |
 * | `workspace`  | 选中一个已登记工作区（`id` / `title` / `path` 全给） | 各分节按自己的寻址键取用           |
 * | `unassigned` | 选择框的「未分配」特殊项（恒排在最后）         | 非会话管理分节按无有效目标空态处理 |
 * | `none`       | 页面拿不到工作区上下文（服务未就绪 / 清单为空） | 全部分节空态，不发寻址请求         |
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
 * 页面级工作区上下文（owner 份额的载荷，纯数据、无回调）。
 * - `workspace`：选中一个已登记工作区；三个寻址键都给，分节各取所需。
 * - `unassigned`：选择框的「未分配」特殊项（Q8；恒排在最后）。
 * - `none`：页面拿不到工作区上下文（工作区服务未就绪 / 列表为空前的降级）。
 */
export type WorkspaceConfigWorkspaceContext =
  | {
      readonly kind: 'workspace'
      /** Host WorkspaceId（web-ux 的行集寻址键）。 */
      readonly id: string
      /** 显示标题；空串由消费方用 path 兜底。 */
      readonly title: string
      /** 规范绝对路径（stt 的 `{ workspacePath }` 寻址键，与 `WorkspaceView.path` 同源）。 */
      readonly path: string
    }
  | { readonly kind: 'unassigned' }
  | { readonly kind: 'none' }

/**
 * 分节座位的 owner 份额：只剩一份纯数据（`close` 已删，Q7）。
 *
 * owner 份额由 holder 页面在 `renderSlot` 时传入；分节自身不拥有选择状态，也不拿到任何
 * 回调（导航与页面离开统一归壳 / 宿主）。
 */
export interface WorkspaceConfigSectionOwnerProps {
  /** 页面级工作区上下文（三态，见 {@link WorkspaceConfigWorkspaceContext}）。 */
  readonly workspace: WorkspaceConfigWorkspaceContext
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
  /** 分节是 list 座位的 entry（页面 tab）。 */
  kind: 'list'
  /** 分节挂在 root 作用域（分节不属于某个会话）。 */
  scope: 'root'
  /** 页面传给分节的 owner 份额。 */
  owner: WorkspaceConfigSectionOwnerProps
}

/**
 * 三个贡献分节在页面 tab 栏中的 order 权威集合（`10 / 20 / 30`，D11）。
 *
 * multi-root-workspace（工作区文件夹）→ session-tool-toggle（工作区默认档）→
 * web-ux（会话管理）。各贡献方在自己的 `seats.ts` / `index.ts` 里持有字面量；本类型
 * 只负责「允许的取值集合」，不提供运行时常量（纪律 3）。
 */
export type WorkspaceConfigSectionOrder = 10 | 20 | 30
