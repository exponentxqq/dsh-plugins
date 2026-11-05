# Design

## Context

侧栏 footer 座位 `sidebar.footer.action`（shell 单行 nowrap flex，宽栏 256px / 折叠轨 56px 内容宽约 32px）当前被三插件分别占用并组合级饱和（R5 裁定原文见 `openspec/changes/archive/2026-11-05-web-ux-session-manager/tasks.md` R5 小节与 `plugins/web-ux/artifacts/session-manager-smoke.md` 步骤 2）。官方 cordis badge 也是整行 `calc(100% + 4px)`（但无 `flex:none`、可缩），当前 profile 未装载 `dsh-client-ui-cordis`；第三方 `dsh-pocket` 仅在非桌面布局再注册一颗 footer 入口（验收面已裁定仅桌面）。slots 框架 rc.5 提供 `register({ children })` 子座位声明（Declaring is claiming）与 `RenderOpts.only` list 过滤；官方设置弹窗 `settings.section` 即「统一弹窗 + 分节导航 + 多包贡献」的黄金先例。本仓 pnpm workspace 单仓多包、统一版本 1.5.0、DSH 基线 0.2.1-rc.5（`scripts/dsh-baseline.mjs:13`）、七插件各自独立 bundle。收敛结论（两规划线 + 阶段 1.5）见随档 `diff-matrix.md` 第六节；代码级蓝图的完整展开见随档 `code-design.md`（**58 项触达面、33 条证据锚、接口全文与 G1–G8 任务组要点以其为权威**，本文承载其断言）。

## Goals / Non-Goals

**Goals:**

- footer 只剩一枚「工作区配置」入口（桌面双形态完整可见、恒在、行内收缩份额不挤同列）；点击打开统一弹窗，分节导航 + 懒渲染。
- 三插件以零运行时依赖的方式成为分节贡献方；未装贡献方节自动隐藏；后续新分节（工具管理类）只加一个注册。
- 既有功能路径零回归：mrfw Files tab + `/workspace-folders`、stt 头部面板 + `/tools`（共用状态）、web-ux 行菜单删除 + 删除弹窗（500）全部保留。

**Non-Goals:**

- 不改三插件宿主半与 RPC 端点、不改落盘格式（`workspaces.json`/`defaults.json`）。
- 不做旧入口共存探测、动态切换与配置开关（用户裁决硬移除 + 四包同装约定）。
- 不实现「工具管理」等新分节；不处理窄屏/移动布局的 footer 冲突（已知事实留档）；不改上游任何包。
- 本次合入不发布 tag（用户裁决：link: 持续使用，版本号随下一批变更统一定）。

## Decisions

### 栈识别结论（writer skill 接线留档）

本仓为 **TypeScript + React 18 + esbuild/tsdown + vitest + pnpm workspace + cordis 插件包**：无 `pom.xml`/`build.gradle`/`nuxt.config.*`，Spring 与 Nuxt 皆未命中；**用户已豁免 writer skill 加载（仅本次有效）**，设计约束以仓根 `AGENTS.md`（产物 zh-CN、`lib/` 随仓提交、递归 build/typecheck/test/lint）与各插件既有惯例（软注册、`--dsw-*` token、bundle 断言、mrfw `docs:check` 硬门）为准。

### 关键决策（D1–D16 全文与反例见 code-design.md ④，此处列断言）

| 决策 | 断言 | 被否要点 |
|---|---|---|
| D1 弹窗壳 | `Modal headless:true` + 自绘 header/nav/内容列（内容列 `overflow-y:auto;min-height:0`） | 非 headless 加宽：内容列无法独立滚动（`.dialog{overflow:hidden}` 裁掉底部）；自绘 overlay：回到 mrfw 自管焦点陷阱的老路 |
| D2 nav label | 本地 2 行 thunk 解析，不 import 上游 `resolveSlotLabel` | slots 包无 `./client` 导出、非 loader 模块表词——运行时 require 命中「missed the module table」硬错，整个客户端模块加载失败 |
| D3 类型纪律 | 贡献方仅 `import type` + 各持座位字面量（类型断言守护），**不入** `dsh.client.inject` | 运行时 import 会把 holder 整模块打进贡献方 bundle；inject 边对缺席包静默跳过，纯噪声且构成虚假硬依赖 |
| D4 类型产物 | holder 必须 `tsc --emitDeclarationOnly` 发 `lib/types/**` d.ts（`exports['./client'].types` 指向） | 照 web-ux 纯 esbuild 不产 d.ts——贡献方 `import type` 退化为 any，devDep 决策落空 |
| D5 入口恒在 | 零分节也渲染入口，空态在弹窗内解释 | 按节数隐藏：引入第二条可见性规则，四包未装齐时 footer 又变空 |
| D6 入口几何 | 宽态 `flex:1 1 auto;min-width:0`（ellipsis）、折叠态 **28px** 方形图标；**禁 `flex:none`/整行宽** | 整行独占复刻 R5；36px rail 超过折叠轨内容宽 32px |
| D7 nav a11y | `nav[aria-label]` + 原生 button + `aria-current` + `data-modal-autofocus`，不用 tablist | tablist 要求第三方分节根带 `role="tabpanel"`，holder 无法强制 |
| D8 分节切换 | `only` 重渲染（不 keep-mounted），选中节跨开合记忆 | keep-mounted：三节同时拉取 RPC、与 only 机制相悖 |
| D9 会话管理空态 | `client === undefined` 渲染 `manager.unavailable` 空态（不再 return null） | null 在新壳里 = 右列空白而 nav 高亮着，用户无从理解 |
| D10 无统一 footer | 各分节自带行内动作条 | 统一 footer 要么变插槽第二层、要么把阶段知识泄漏进壳 |
| D11 order 常量 | trigger 50 / dialog 530 / 分节 10/20/30 | 0 或 100：与 cordis 并列不稳定或排到后装插件之后 |
| D12 devDep 写法 | `"dsh-plugin-workspace-config": "workspace:*"` | 精确版本：包不在 registry，未开 linkWorkspacePackages 时整仓装不上；探针 P1 已证 git 安装不装不改 devDeps |
| D13 依赖收敛 | stt/web-ux 删 `@deepseek-ai/dsh-client-ui-sidebar`（inject + devDeps + 类型 import） | 留着是纯 dead coupling，上游改动会虚假连带 |
| D14 空态文案 | 不点名具体插件（泛化措辞） | 点名三个包 = 文案成第二处插件清单，加新分节即过期 |
| D15 打开桥 | 布尔快照 store（非 seq） | seq+key 重挂会把 nav 的 selected 一并重置，与 D8 冲突 |
| D16 running 中关闭 | 「关闭即关闭」（请求已在宿主侧继续完成，重开看列表验证）；写进 README 与冒烟 | 扩 owner `{close,setBusy}` 破坏已定座位形状（跨版本不兼容）；自绘遮罩拦不住 Escape |

### 执行环境（衔接契约；schema 权威源 = spec-workflow refs/worktree.md）

- 执行环境：直用主工作区。创建于 2026-11-05
- 决策依据：隔离判据零命中（主检出 `main` 工作区干净、无无关脏改动、无并行变更 worktree），单仓变更省去 worktree 创建与依赖重装；用户于衔接点选定（模式 auto / 引擎 subagent 由映射文件 engine 键给出）。
- 执行键路由（spec-workflow.yaml `apply`）：opencode-go/deepseek-v4.1-flash，fallback zcode-plan/glm-5.3-flash；`verify` 键由终末 spec-done 复用。

## 深度契约承载（自 code-design.md，逐断言；全文以其为权威）

**① 触达面（58 项，逐路径见 code-design.md ①）**：新建 `plugins/workspace-config/` 21 文件（契约 `src/client/contract.ts` 为座位唯一权威、`open-store.ts` 打开桥、`sections.ts` nav 投影、`WorkspaceConfigTrigger.tsx`/`WorkspaceConfigDialog.tsx`、双端 build.mjs + tsc 发 d.ts、测试 5 件含 PoC）；根仓 3 项（lockfile、README 插件一览 + 四包同装句、openspec 四件套）；mrfw 11 项（footer 注册删除 87-107、Dialog 剥壳、styles 族裁剪、AGENTS 不变量 5 措辞、ADR-0013 新建、docs:check）；stt 11 项（footer 注册删除 179-204、`WorkspaceDefaultsSection` 导出、seats 常量替换、依赖收敛）；web-ux 12 项（footer trigger 与 manager overlay 两 entry 删除、`SessionManagerDialog` 剥壳为 `SessionManagerSection`、`SessionManagerTrigger.tsx`/`session-manager-store.ts` 删除、依赖收敛）。**明确不触达**：三插件宿主半、上游包、`scripts/*`、`pnpm-workspace.yaml`、在途变更 `2026-11-05-session-tool-toggle-session-scoped-catalog`。

**② 证据锚**：本仓 20 条 + 上游 13 条 file:line 实测（code-design.md ②，含三插件注册块行号、官方 settings 壳 nav 实装、slots `ChildrenDecl`/`RenderOpts.only`/`SlotLabel` 类型位、`shell.overlay` 容器 pointer-events 语义、loader 模块表词三词白名单）。

**③ 接口与数据形状**（全文见 code-design.md ③）：座位契约 `WorkspaceConfigSectionSeat = 'workspace-config.section'`（字面量类型）+ `WorkspaceConfigSectionOwnerProps { close(): void }` + `declare module` SlotMap 增补 + order 常量（trigger 50/dialog 530/分节 10-20-30）；贡献方注册面统一形状（`slots.inject(SECTION_SEAT, () => register({ id/order/label thunk/locale/inject }, SectionComponent))` + try/catch warn）；holder 内部 `WorkspaceConfigOpenStore`（布尔快照）/`WorkspaceConfigSectionsSource`（稳定数组快照）/弹窗 props；三节迁移 props 对照（mrfw `{panel,pickDirectory,sessionId?}`、stt `{resolveClient,currentSessionId}`（dialog 形态保留工作区下拉）、web-ux `{client,workspaces,sessions}` + `close`）；文案键 7+3；四包声明面变更表（holder inject 含 renderer/locale/sidebar/layout、不含 primitives；stt/web-ux `− dsh-client-ui-sidebar`、`+ holder workspace:*`）。两个 SECTION_ID 沿用旧 entry id（座位内唯一、日志连续）。

**④ 决策**：栈识别 + D1–D16（见上文 Decisions）。

**⑤ 逐任务组实现要点**：G1 提案落档 → G2 holder 骨架 + 类型权威 + 门禁三连 → G3 **真 renderer jsdom PoC（前置风险门：children 声明 / only 过滤 / label 双态 / 后装补跑；失败停批上浮不自行改方案）** → G4 打开桥 + trigger + 弹窗壳 + 装配 + 组件测试 → G5 三插件并行迁移（mrfw 含文档/ADR/docs:check；stt 含 `/tools` 共用状态回归用例；web-ux 含五阶段新挂载形态用例）→ G6 递归门禁 + 四格安装组合矩阵 + 产物断言收口 + link: 安装演练 → G7 真机双形态验收（宽栏/折叠/a11y 树/三节功能面/迁移回归/降级反例/Menu portal 复验/冒烟留档）→ G8 收口（文档、`openspec validate --all`、`pnpm verify`、`release --dry-run`；**本次不打 tag**）。每组验证句为可执行断言（grep 计数/test -f/退出码），全文见 code-design.md ⑤。

**⑥ 假设与未决项**：A1（rc.5 运行时与类型面一致——G3 前置门证伪）、A2（footer 布局不变）、A3（profile link: 四包）、A4（holder 缺席零报错）、A5（`workspace:*` devDep 对 git 安装安全——探针 P1 已证，发布后真机复验）、A7（桌面布局无第四占用者）、A8（分节切换草稿丢弃为接受项）、A9（cordis badge 不在场）；技术未决 U1（only 运行时语义）/U2（后装补跑）/U3（label thunk 求值）由 G3 钉住，U4（Menu portal 新壳复验，`WORKSPACE_MENU_PORTAL=false` 兜底）/U5（running 关闭后结果可见性）由 G7 走查，U6（未来 cordis 共存预案：rail 已 28px）、U7（pnpm 10/11 双跑 install）、U8（空态文案随新分节复查）留实施。

## Risks / Trade-offs

- [slots `children`/`only` 运行时未实证（最大技术单点）] → G3 真 renderer jsdom PoC 为前置门，任一断言失败停批上浮，不自行改方案（不回退两座位/registry）。
- [弹窗 chrome 更换的隐性回归（焦点/Escape/Menu portal）] → G7 逐项走查 + 保留 `WORKSPACE_MENU_PORTAL` 单点开关；与删除弹窗（500）保持互斥（530）。
- [mrfw 是 vendored fork，文档联动是硬门] → AGENTS 不变量 5、双语 README、ADR-0013、docs/architecture 同步列入任务；rc.5 座位表属历史取证只加注记不重写。
- [未装 holder 时 web-ux 会话管理 GUI 不可达] → 用户裁决接受（Q2/落档分歧点已确认），proposal 与 README 明示四包同装约定。
- [stt 分节切换丢弃未保存草稿] → 设计接受项（三节皆「动作即写」），写入冒烟记录与 README。
- [分节崩溃] → 框架 `onEntryError` 错误监督面接管，holder 不重复实现；PoC 与组合矩阵覆盖。

## Migration Plan

1. 组间严格串行执行 G1→G8（见 ⑤ 与 tasks.md）；G3 PoC 不过则停批上浮。
2. 真机前置：`docker exec dsh dsh plugin --profile web add <本仓>/plugins/workspace-config`（link:，与既有 web-ux link: 同法），用户重启 profile 生效。
3. 回滚策略：四包均 link: 安装——git revert 对应提交后重启 profile 即整体回滚；无数据迁移、无配置键变更、落盘格式不动。
4. 发布：本次合入不打 tag；下一批变更统一 `release <version>`（release.mjs 递归含新包共 7 包），tag 成为 profile 侧 `#<tag>&path:plugins/workspace-config` 安装锚点。

## Open Questions

均可安全延后、不影响 specs/方案/任务分解（实施中钉住）：U1–U3 由 G3 PoC 断言钉住；U4/U5 由 G7 真机走查钉住（U4 失败翻既有单点开关）；U6 cordis 在场预案已前置（rail 28px 默认）；U7 仓内 pnpm 11 与容器 pnpm 10 各跑一次 install 确认 `workspace:*` 表现；U8 新增分节时复查空态文案。

### 运行时实证（组 4 PoC）

> 回填日期：2026-11-05。PoC 常驻文件：`plugins/workspace-config/test/section-seat.poc.test.tsx`（不 skip，作为 slots rc.5 语义漂移的回归哨兵）。验证：`pnpm --filter dsh-plugin-workspace-config test -- section-seat.poc` → 退出码 0，`Test Files 1 passed / Tests 4 passed`。
>
> 被测对象为**真运行时包**：`@deepseek-ai/dsh-client-ui-renderer@0.2.1-rc.5` 的 `lib/client.js` 产物 + `@deepseek-ai/dsh-client-ui-slots@0.2.1-rc.5` + `@deepseek-ai/cordis@4.0.5` 真 `Context`，jsdom 环境。未 stub `SlotRegistry` / `register` / `inject` / `renderSlot` / `only` 中任一实现；仅复刻宿主 loader（`window.__ModuleLoader__.load` + 同形外部模块表）并补装一个空 session 作用域适配器（见下「实测 API 语义摘要」第 5 条）。

**四断言结果（全部 PASS）**

| # | 断言 | 结果 | 运行时证据 |
|---|---|---|---|
| 1 | children 声明 | PASS | holder 以 `slots.inject('shell.overlay', () => slots.register({ children: { 'workspace-config.section': { kind: 'list', scope: 'root' } } }, Holder))` 注册后，`ctx.slots.spec('workspace-config.section')` 为 `{ kind: 'list', scope: 'root' }`，holder entry 的 `children` 表可读；root 先声明 `shell.overlay` 时 inject 回调同步执行。 |
| 2 | only 过滤 | PASS | 两分节 a（order 20）/ b（order 10）注册后，`renderSlot('workspace-config.section', { close }, { only: 'a' })` 只渲染 a（**选中列表序第二项**，排除「只渲染首项」的假阳性）；b 不在 DOM，而 `ctx.slots.entries('workspace-config.section')` 仍有 2 条；a 的 close 回调经 owner 份额到达并被点击触发。 |
| 3 | label 双态 | PASS | 字符串 label 与 `() => string` thunk 均被真 `resolveSlotLabel` 求出；注册条目里 thunk 仍以函数原样存储（未在注册期求值），改闭包变量后同一注册立即读出 v2；holder 本地 2 行解析（D2）的行投影按 order 得 `[b(10), a(20)]`，与上游解析一致。 |
| 4 | 后装补跑 | PASS | 贡献方先 `slots.inject('workspace-config.section', …)`（此时 `spec` 未定义、entries 为 0，回调被延迟）；holder 后注册 `shell.overlay` 并提交 children 声明后，待命回调**同步补跑**，`entries` 立即为 1 且渲染可见，先到的贡献注册不丢。 |

**实测 API 语义摘要（以运行时代码与运行结果为准）**

1. children 表的运行时语义是「声明账本」：`register({ children })` 把子座位的 kind/scope 写入 `spec`；子 entry 不存放在父 entry 的 options 里，而写入子座位自己的 entry 账本，`entries(childKey)` 直接读该账本。声明是渲染授权：子 entry 的组件只能经声明者的 `renderSlot` 进入渲染树。
2. `slots.inject(key, callback)` 两种时序均实测：key 已声明 → callback 在 inject 调用内**同步**执行；key 未声明 → 仅登记等待，待声明提交后（在声明者的 `register()` 内）**同步**补跑。回调返回的 disposer 由调用方 fiber 的 effect 回收。
3. `renderSlot(key, owner, { only })`：list 座位先按 order 升序、再按 `options.id` 过滤；`only` 只裁剪渲染投影，不删除注册；owner 份额（`{ close }`）原样到达子 entry 组件。未传 `only`（undefined）等价不过滤。
4. `SlotLabel` 双态：注册时**原样存储**（`StoredEntry.options.label` 上 thunk 仍是函数），读取时由上游 `resolveSlotLabel`（`typeof label === 'function' ? label() : label`）求值；因此 locale 切换不需要重注册。本仓 holder 按 D2 自带同式 2 行解析，PoC 已证两者结论一致。
5. 渲染 `root` 的运行时前置：真 renderer 的 root 出口固定包 `ScopeProvider scope="session-maybe"`，它把 session-maybe 解析到已安装的 **`session` 作用域适配器**；生产由 `dsh-client-ui-session` 安装。PoC 为隔离被测语义装载了一个空绑定适配器（稳定快照 + 空订阅）。这与 children/only/label/inject 四断言无关，但**后续任何直接渲染 root 的 jsdom 套件都必须先装该适配器**。
6. `apply(ctx)` 的装配面：真 renderer `lib/client.js` 的 `apply` 只做 `new SlotRegistry(ctx).install(createSlotRenderer())` + `ctx.reflect.provide('uiRenderer', …)`；`SlotRegistry` 以服务名 `slots` 提供 `ctx.slots`。root 之外的 key 只能经组件 props 的 `renderSlot` 渲染（ctx 级 `renderSlot` 只接受 `'root'`）。

**与 code-design ②/⑤ 类型级证据的差异与补充**

1. **入口形态（新增实测约束）**：`@deepseek-ai/dsh-client-ui-renderer` 的 `exports['./client']` 指向 `lib/client.js`，它是 `window.__ModuleLoader__.load({ id, factory })` 的 loader 壳，**不是可直接 `import` 的 ESM 模块**；PoC 必须复刻 loader（读源码 + 提供 react / react-dom / react-dom/client / react/jsx-runtime / slots / cordis 六个模块表词）才能拿到真 `apply`。此前的类型级证据只说明 `apply` / `SlotRegistry` 的签名，未体现这一装载约束。
2. **slots 的 `resolveSlotLabel` 位置（与 D2 一致，补充实测）**：`@deepseek-ai/dsh-client-ui-slots` 只有 `.` / `./src/*` / `./package.json` 导出，**没有 `./client`**；`resolveSlotLabel` 在 `.` 入口。PoC 在测试侧 import 它做对照是合法的 Node 解析，但 holder 产物不能据此把它加入 `CLIENT_EXTERNALS`（D2 的「missed the module table」硬错结论不变）。
3. **四断言未发现与类型面证据矛盾**：U1（only 只挂匹配 id 的 list entry）、U2（后装 holder 时先 inject 的贡献方补跑）、U3（label thunk 求值）均有运行时支持；A1「rc.5 运行时与类型面一致」在本次触达的三个语义面上成立。真正新增的事实是上面第 1 条装载约束与第 5 条 root 渲染的 session 适配器前置。
