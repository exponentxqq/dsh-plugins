# improve-workspace-defaults-page · 阶段 1.7 代码级蓝图（code-design.md）

> 输入：`explore.md`（现状事实 + 方案空间）与 `decisions.md`（Q1–Q8 收敛留痕，**不推翻**）。
> 硬约束：Q1=A2（宿主按工作区算宇宙）、Q2=B1（单列分块卡片）、Q3=C1+C3+C4+C6（全局过滤 / 刷新 / 可复制命令 / 空档可视化）、Q4=删 h3 + 条目详情、Q7=行下次行+标签、Q8=/inventory 同款口径；**面板形态零回归**是红线。
> 已加载 skill：`dsh-plugin-writer`（栈识别：本仓无 Spring/Nuxt 标记，为 DSH 插件 pnpm workspace：TypeScript + React + esbuild + CSS Modules）。其「分层方向 / 复用优先 / 任务拆分粒度 / 产物 lib 随仓库提交」是本次设计约束。
> 行号均为当前 checkout（2026-11-08）。本文件之外不写任何项目文件、不改 `openspec/`。

## 0. 设计主线（一句话）

把页面分节的宇宙来源从「恒 `null`」改成「宿主按 `{workspacePath}` 现算的**工作区宇宙**」（插件上下文可见的全局工具注册表 + 该 cwd 的技能快照），页面正文按 B1 重排为「概要卡 → 清单卡 → 命令卡 → 脚注」，清单在既有共用组件上以两个**可选、缺省即旧行为**的展示参数（`query` / `showDetails`）升级为页面形态；面板形态靠「参数缺省 + 既有套件」钉住零回归。

与需求四问的映射（最终方案可直接引用本文件对应节）：

| 需求要求说明的点 | 本文件落点 |
|---|---|
| 当前页面问题 | ① 的「为什么动这些文件」+ ④ D1/D2（恒 null 降级、8 行平铺 meta、无过滤/刷新/空态/详情） |
| 参考「会话工具面」的设计思路 | ③ 3.6（三段式分组、组/行两级开关、计数摘要、残差区、保护行禁用、stale-while-revalidate） |
| 具体优化点（交互与视觉） | ③ 3.6 / ③ 3.7 / ⑤ G4–G6（全局过滤、概要卡刷新、可复制命令、空档卡、行详情与技能标签、卡片层级） |
| 改造后的页面结构 | ③ 3.6（组件树 + DOM 骨架） |

---

## ① 触达面清单

> 全部在根仓 `dsh-plugins`。动作：**改** / **新建**。共触达 18 个文件（新建 3 / 修改 15）；`tooling/contracts`、`plugins/workspace-config`、`package.json` **不触达**（理由见 1.4）。

### 1.1 `plugins/session-tool-toggle` 宿主半（仓：dsh-plugins）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/session-tool-toggle/src/host/workspace-universe.ts` | **新建** | 工作区宇宙的唯一构造点 + 读数编排 | `/inventory` 同款 `MCP_SERVER_PATTERN`；`buildWorkspaceUniverse(facts)` 纯函数（MCP 组 → 技能组 → 内置组；未归组只计数不成行；技能行带 `modelInvocable/userInvocable/source`）；`createWorkspaceUniverseReader(access)` 从 `ctx.get('tools')/ctx.get('skills')` 现取并降级（永不抛错）；冻结空宇宙常量 |
| `plugins/session-tool-toggle/src/host/panel.ts` | 改 | 只做「叶子复用」的导出，不改行为 | `defaultsEntryOf` 由 `function` 改 `export function`（地址 / 描述截断 / 保护名 / 保留名判据的唯一实现）；`buildDefaultsUniverse`、`mcpPartsOf`、会话口径一行不动 |
| `plugins/session-tool-toggle/src/host/rpc.ts` | 改 | `{workspacePath}` 形态返回真实宇宙 | `RpcDeps` 增必需端口 `readWorkspaceUniverse: (path) => Promise<DefaultsUniverse>`；`handleWorkspace` 的 universe 表达式按寻址形态分派；新增 `readWorkspaceUniverseOf` 包装（端口抛错 → warn + 空宇宙，不把整次读失败）；注释里的 D-24 / U1 口径改写 |
| `plugins/session-tool-toggle/src/host/index.ts` | 改 | 装配端口 | `rpcDeps` 增加 `readWorkspaceUniverse: createWorkspaceUniverseReader({ get: (name) => ctx.get(name), protectedNames, log })`；其余 ControlDeps 与命令面不复制状态 |

### 1.2 `plugins/session-tool-toggle` 浏览器半（仓：dsh-plugins）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` | **新建** | 页面形态正文（B1 卡片布局） | 概要卡（工作区名 + 登记徽章 + 刷新 + key/文件 + 三计数 + corrupt）、清单卡（全局过滤 + 空档块 + `DefaultsGroupList` + 全局并集/未归组/技能观测注记）、命令卡（目标键注释 + `/tools workspace off <地址>` 代码块 + 复制 + 其他工作区手改说明）、脚注（scope/union）、页脚（两段式清空 + saved）、失败 alert；本地状态仅 `query` 与复制反馈 |
| `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` | 改 | `dialog` 形态委托新页面；删重复 h3 | `dialog` 分支 → `<WorkspaceDefaultsPage/>`；`section` 分支逐字保留（折叠壳 + 原 body）；删 `<h3>{workspace.title}</h3>`（Q4）；`universe` 的 JSDoc 从「恒 null」改为「工作区宇宙」 |
| `plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx` | 改 | 页面增强（过滤 + 行详情），面板零回归 | props 增 `query?: string`、`showDetails?: boolean`；`copy.cliHint?`、`copy.universeUnavailable?` 变可选；过滤经 `filterDefaultsView` 走**未过滤宇宙**求残差；过滤时组头改非交互并强制展开、隐藏内置组本地过滤（全局过滤取代）；行在 `showDetails` 时加描述次行 + 技能标签；参数缺省时 DOM 与现行逐字一致 |
| `plugins/session-tool-toggle/src/client/defaults-view.ts` | 改 | 纯函数：全局过滤 + 残差 | 新增 `DefaultsFilterResult` 与 `filterDefaultsView(universe, disabled, query)`；空过滤返回入参 identity；组键命中整组保留，行按 `shortName/address/description` 匹配；残差始终相对**未过滤**宇宙的 `residualOf` 再筛；技能来源标签映射表放页面组件（本模块保持 locale 无关） |
| `plugins/session-tool-toggle/src/client/locales.ts` | 改 | 页面新文案 | 新增 29 个键（见 ③ 3.5）；zh/en 同步；`Key` 类型由对象 `satisfies` 自动扩展；不动面板既有键 |
| `plugins/session-tool-toggle/src/client/panel.module.css` | 改 | 页面卡片与行详情样式 | 新增 `.workspacePage/.card/.cardHeader/.cardTitle/.badge/.facts/.counts/.listHeader/.pageFilter/.emptyBlock/.commandRow/.command/.footnotes/.rowMain/.rowDescription/.rowTags/.metaTag/.note` 等；颜色只走 `var(--dsw-alias-*, 兜底)`；既有 `.sectionTitle/.workspaceBody/.actions` 等不动 |
| `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` | 改（仅注释） | 术语同步 | `WorkspaceDefaultsState.value` 与 `useWorkspaceDefaults` 注释里的「会话视角宇宙」改为「页面形态 = 工作区宇宙；面板形态 = 会话视角宇宙」；逻辑与 props 零改动 |

### 1.3 测试、文档与规范（仓：dsh-plugins）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/session-tool-toggle/test/workspace-universe.test.ts` | **新建** | 宇宙构造 + 读数编排的出口断言 | 归组顺序、正则边界、未归组计数、技能双调用标记与来源、技能服务缺席/抛错降级、工具服务缺席、纯函数（不改入参、同入参深相等） |
| `plugins/session-tool-toggle/test/rpc.test.ts` | 改 | path 形态宇宙 | ① 路径读/写都带非 null 宇宙且 reader 收到规范化 key；② reader 抛错 → 成功值 + `layerReady:false` + warn；③ session 形态不调 reader（面板零回归）；④ 既有 `universe:null` 用例改写 |
| `plugins/session-tool-toggle/test/wire-contract.test.ts` | 改 | 新字段自检 | `DefaultsEntry` 的技能三字段（成对 + 仅 skill 地址）、`DefaultsUniverse` 的 `ungroupedMcp/skillsComplete`（可选/类型/拒绝非法）；`universe:null` 仍合法（混合版本兜底） |
| `plugins/session-tool-toggle/test/defaults-view.test.ts` | 改 | 过滤纯函数 | 空查询 identity；组键命中、行命中、残差命中、无命中、大小写/空白归一；`residual` 不被过滤宇宙污染 |
| `plugins/session-tool-toggle/test/workspace-editor.test.tsx` | 改 | 页面形态重钉 + 面板回归 | 删 3 处 h3 断言；新增概要卡/清单卡/命令卡/过滤/空档/复制/刷新用例；`section` 形态既有用例全部保留不改断言语义（仅必要的 props 默认值适配） |
| `plugins/session-tool-toggle/README.md` | 改 | 行为与边界文档 | 删「路径形态 `universe:null`」两段（`:81`、`:128`）；新增「页面宇宙 = 全局注册表并集 + 该工作区技能」「跨工作区只写意图」「未归组计数」「过滤/刷新/复制/空态」；命令边界保持「只作用本会话所属工作区」 |
| `openspec/specs/dsh-session-tool-toggle/spec.md` | 改 | 规范与实现对齐 | 改写「默认档编辑面的分组开关形态」的宇宙口径与「分节保留下拉」旧话术；新增「工作区默认档页面的工作区宇宙」Requirement（5 个 Scenario）；替换「切换工作区后分组清单仍可用」旧 Scenario |

### 1.4 明确不触达（避免误伤与越界）

| 面 | 理由 |
|---|---|
| `tooling/contracts/src/index.ts` | A2 不需要页面向分节传 `sessionId`；owner 份额仍只有 `{workspace}`，三贡献方编译面零变化。若走 A1 才需要动它——已否（见 ④ D1）。 |
| `plugins/workspace-config/src/client/*` | 页面壳 / 唯一选择框 / tab / `renderSlot` 是 holder 契约（`WorkspaceConfigPage.tsx:218`），本次只消费 `workspace.path`；C3 的刷新放在 stt 的概要卡，不改 holder。 |
| `ToolPanelAction.tsx` / `ToolPanelGroups.tsx` / `DefaultsEditor.tsx` / `DefaultsSectionFrame.tsx` / `panel-controller.ts` | 面板自身与用户级默认档编辑器不在施工面；硬约束「面板形态零回归」。 |
| `src/host/control.ts` / `mask.ts` / `workspaces.ts` / `state.ts` | 只读既有控制内核与工作区档 IO，掩码 / 持久化 / 地址文法不改。 |
| `plugins/session-tool-toggle/package.json` | 零新增依赖（不引剪贴板库、不引图标包）；`@deepseek-ai/dsh-tools` 已在 devDeps，`skills` 走本地窄面类型。 |
| 根 `README.md` / 根 `AGENTS.md` | 根文档未出现「页面宇宙恒 null」的降级描述；插件级 README 覆盖即可。 |

---

## ② 证据锚

> 每个触达模块至少一条 `file:line` 代码事实；新建文件标「新建」并给出所复用的最近先例。行号对应当前 checkout。

### 2.1 宿主半

| 模块 | 证据 | 事实（与本次设计的关系） |
|---|---|---|
| `host/workspace-universe.ts` | **新建**（口径锚 `plugins/user-commands/src/host/inventory.ts:40`；叶子锚 `src/host/panel.ts:505`） | 工作区宇宙的唯一构建点；新文件无既有行号，按「/inventory 正则 + `defaultsEntryOf` 复用」落码。 |
| `host/rpc.ts` | `src/host/rpc.ts:417-418` | `universe = resolved.target.kind === 'session' ? universeOf(...) : null`——**契约点**：路径形态恒 null（D-24），本次改为按工作区分派到新端口。 |
| `host/rpc.ts` | `src/host/rpc.ts:175` | `RpcDeps extends ControlDeps`，增量只有 `agents` 与可选 `kernel`；本次在此加 `readWorkspaceUniverse` 必需端口。 |
| `host/rpc.ts` | `src/host/rpc.ts:854` / `:866-879` | `EMPTY_UNIVERSE` 冻结常量与 `universeOf`（会话两读 → 宇宙）；新端口的抛错兜底复用同一空宇宙。 |
| `host/panel.ts` | `src/host/panel.ts:405` | `buildDefaultsUniverse` 的**会话口径**（两读并集、`mcpPartsOf` 首个 `__`、carried 保底）——本次**不**复用其分组循环，只复用叶子。 |
| `host/panel.ts` | `src/host/panel.ts:505` | `defaultsEntryOf`（描述截断 / `protected` / `reserved` 的唯一实现）——改为导出给工作区宇宙复用。 |
| `host/panel.ts` | `src/host/panel.ts:791` | `mcpPartsOf` 对 server 字符集比 `/inventory` 正则更宽；页面宇宙若复用它，`mcp__a.b__x` 会被归组而非「未归组」——因此分组循环另写（见 ④ D3）。 |
| `host/types.ts` | `src/host/types.ts:171-177` | `SkillSummaryLike.invocation = {modelInvocable, userInvocable}` 现成承载 Q4/Q7 的技能详情。 |
| `host/types.ts` | `src/host/types.ts:237-241` | `SkillServiceLike.snapshot({cwd, scope?})` 已有窄面——按 cwd 读技能清单的类型基础。 |
| `host/index.ts` | `src/host/index.ts:817-820` | `rpcDeps = {...controlDeps, agents}` 是唯一装配点；本次加一行端口。 |
| `host/index.ts` | `src/host/index.ts:547-553` | `workspaceChoices()` 现读 registry、按 title+path 排序——路径形态的已登记白名单（未改）。 |
| `user-commands/inventory.ts` | `plugins/user-commands/src/host/inventory.ts:40` | `MCP_SERVER_PATTERN = /^mcp__([A-Za-z0-9_-]+?)__(.+)$/`——页面宇宙照搬的唯一归组口径。 |
| `user-commands/inventory.ts` | `plugins/user-commands/src/host/inventory.ts:137-161` | `groupMcpTools`：第一个 `__` 边界、未归组容忍、绝不猜服务器名。 |
| `user-commands/inventory.ts` | `plugins/user-commands/src/host/inventory.ts:169-179` | `skillRows`：`modelInvocable \|\| userInvocable` 并集、带 `modelInvocable/userInvocable/source`。 |
| `project-mcp/index.ts` | `plugins/project-mcp/src/host/index.ts:108` | `catalog: () => ctx.tools.schemas()`——插件上下文读**未受限全局注册表**的既有先例。 |
| `user-commands/index.ts` | `plugins/user-commands/src/host/index.ts:212-221` | `ctx.get('tools') / ctx.get('skills')` 软读取 + 窄面 cast 的既有写法（不在 `inject` 里硬依赖）。 |

### 2.2 契约与浏览器半

| 模块 | 证据 | 事实 |
|---|---|---|
| `src/client/WorkspaceDefaultsPage.tsx` | **新建**（参照 `WorkspaceDefaultsEditor.tsx:241-247` 的 dialog 分支与 `WorkspaceEntry.tsx:380-395` 的 props 传递） | 三卡 + 脚注的页面正文；新文件无既有行号，按 ③ 3.6 的组件树落码。 |
| `src/contract.ts` | `src/contract.ts:436-447` | `DefaultsEntry` 五键（address/shortName/description/protected/reserved）——本次加三个可选技能字段。 |
| `src/contract.ts` | `src/contract.ts:462-470` | `DefaultsUniverse` 三键；本次加两个可选宇宙级字段。 |
| `src/contract.ts` | `src/contract.ts:472-484` | `WorkspaceValue.universe: DefaultsUniverse \| null`，注释明写「`{workspacePath}` 寻址时为 null」——本次改写语义、保留可空类型。 |
| `src/contract.ts` | `src/contract.ts:1049` / `:1055` | `DEFAULTS_ENTRY_KEYS` / `DEFAULTS_UNIVERSE_KEYS` 的 strict 字段集——必须同步，否则新响应自检失败。 |
| `src/contract.ts` | `src/contract.ts:1622-1645` | `parseWorkspaceValue` 的四字段自检入口。 |
| `src/client/WorkspaceEntry.tsx` | `src/client/WorkspaceEntry.tsx:380-395` | `dialog` 形态把 `value.universe` 原样交给编辑器；本次不改 props，只改宿主给的值。 |
| `src/client/WorkspaceDefaultsEditor.tsx` | `src/client/WorkspaceDefaultsEditor.tsx:132` | `const dialog = variant === 'dialog'` 是两形态的唯一分支点——页面改造全部挂在它下面。 |
| `src/client/WorkspaceDefaultsEditor.tsx` | `src/client/WorkspaceDefaultsEditor.tsx:244` | 与 tab 同名的 `<h3>`（Q4 删除对象）。 |
| `src/client/WorkspaceDefaultsEditor.tsx` | `src/client/WorkspaceDefaultsEditor.tsx:181-198` | 唯一 `DefaultsGroupList` 调用点（页面与面板共用；本次加可选参数）。 |
| `src/client/DefaultsGroupList.tsx` | `src/client/DefaultsGroupList.tsx:68-87` | 现有 props 面（宇宙/关闭集/busy/onToggle/copy/t）——本次只加两个可选展示参数。 |
| `src/client/DefaultsGroupList.tsx` | `src/client/DefaultsGroupList.tsx:197` | 内置组的本地过滤（`group.kind !== 'builtin'`）——页面形态的全局过滤取代它。 |
| `src/client/DefaultsGroupList.tsx` | `src/client/DefaultsGroupList.tsx:347-352` | 宇宙不可用分支（warning + 残留 + CLI）——页面需要换文案并保留残差。 |
| `src/client/defaults-view.ts` | `src/client/defaults-view.ts:90-116` | `defaultsCountsOf` 三计数（页面概要卡复用，不因过滤变化）。 |
| `src/client/defaults-view.ts` | `src/client/defaults-view.ts:119-136` | `residualOf` 的差分口径（过滤时必须以**未过滤**宇宙求差集）。 |
| `src/client/locales.ts` | `src/client/locales.ts:118` / `:121` / `:138` / `:152` | 现有计数 / 降级 / 标题 / CLI 文案键——新页面文案的加入点与改写参照。 |
| `src/client/panel.module.css` | `src/client/panel.module.css:359-363` | `.workspaceBody` 只做纵向排布（页面卡片样式另起类，不动它）。 |
| `src/client/panel.module.css` | `src/client/panel.module.css:240-288` | `.row/.rowName/.name/.tag` 面板行样式——页面行详情在其基础上加 `rowMain/rowDescription/rowTags`，不改旧类。 |
| `src/client/seats.ts` | `src/client/seats.ts:72` | `SECTION_SEAT = 'workspace-config.section'`（座位不变）。 |
| `src/client/index.ts` | `src/client/index.ts:203-216` | 分节软注册的 `inject` 面（本次零改动；新能力在宿主半，不新增客户端注入）。 |
| `workspace-config` | `plugins/workspace-config/src/client/WorkspaceConfigPage.tsx:218` | `renderSlot('workspace-config.section', { workspace }, { only: activeId })`——页面份额只传 `{workspace}`，不含回调（不触达）。 |
| `workspace-config` | `plugins/workspace-config/src/client/page.module.css:65` | 页面每行 `max-width: 960px`——卡片宽度继承，页面不自带固定宽。 |
| `contracts` | `tooling/contracts/src/index.ts:66-87` | owner 份额三态与 `{workspace}` 纯数据（不触达的证据面）。 |

### 2.3 规范、文档与测试

| 模块 | 证据 | 事实 |
|---|---|---|
| `test/workspace-universe.test.ts` | **新建**（参照 `test/panel.test.ts:976-1250` 的构建器测试形制） | 宇宙构造 + 读数编排的出口断言；新文件无既有行号。 |
| `openspec/specs/dsh-session-tool-toggle/spec.md` | `:155` | 现行 Requirement 写「分节保留下拉」与「为非当前工作区编辑时沿用当前会话视角」——与现行页面实现和 A2 双重不一致。 |
| 同上 | `:174-177` | 「切换工作区后分组清单仍可用」Scenario 明写「该响应不携带新宇宙」——本次替换。 |
| `plugins/session-tool-toggle/README.md` | `:81` | 「以 `{workspacePath}` 寻址时宿主契约对路径形态返回 `universe: null`……这是页面新入口的已知降级」。 |
| 同上 | `:127-128` | 「两个默认档界面只列本会话可见工具」「页面形态下退化为清单不可用」——本次改写为面板/页面两套宇宙口径。 |
| `test/workspace-editor.test.tsx` | `:543` / `:785` / `:836` | 三处 `<h3>` 断言（Q4 删除后必须改）。 |
| `test/workspace-editor.test.tsx` | `:260-391` | `section` 形态既有回归面（面板零回归的测试基线）。 |
| `test/rpc.test.ts` | `:592-609` | 假 `RpcDeps` 的唯一构造点（新增必需端口必须补这里）。 |
| `test/rpc.test.ts` | `:1438-1441` | 现行断言「`{workspacePath}` read 的 universe 为 null」——本次反转。 |
| `test/wire-contract.test.ts` | `:205` / `:1092` | 现有 `WORKSPACE_UNIVERSE` 夹具与「universe 为 null 合法」用例——新增字段与正例的落点。 |
| `test/defaults-view.test.ts` | `:252-269` | 三计数 / 残差既有断言——过滤函数必须不破坏同一口径。 |

---

## ③ 接口与数据形状

### 3.1 宿主：工作区宇宙（新建 `src/host/workspace-universe.ts`）

```ts
// ---- 纯构造（零 IO / 零 Cordis，单测直接驱动） ----

/** 工作区宇宙的构造事实：全部由装配层读到，本函数只做纯推导。 */
export interface WorkspaceUniverseFacts {
  /** 插件上下文可见的**未受限全局**工具注册表（`ctx.tools.schemas()`，不传 scope）。 */
  readonly schemas: readonly VisibleToolSchema[]
  /** `ctx.skills.snapshot({ cwd: workspacePath })` 的清单；缺席 = 技能服务不可用 / 读取失败。 */
  readonly skills?: readonly SkillSummaryLike[]
  /** 技能目录观测是否完整（`snapshot().complete`）；仅在 `skills` 存在时有意义。 */
  readonly skillsComplete?: boolean
  /** 生效保护名单（与面板 / 命令面同源）。 */
  readonly protectedNames: ReadonlySet<string>
}

/**
 * 按工作区构造工具宇宙（目标 = 一个工作区规范路径）。
 *
 * 归组口径**照搬 /inventory**（与面板的 `mcpPartsOf` 刻意分开，见 ④ D3）：
 * - MCP：`/^mcp__([A-Za-z0-9_-]+?)__(.+)$/`，第一个 `__` 为边界；
 * - `mcp__` 前缀但正则不命中 → **未归组计数**，不生成开关行（`tool:mcp__…` 是非法地址）；
 * - `skill` 单列技能组（组地址 `tool:skill`），行来自技能快照而非候选工具名；
 * - 其余 → 内置工具组（无组地址）。
 */
export function buildWorkspaceUniverse(facts: WorkspaceUniverseFacts): DefaultsUniverse

/** 冻结空宇宙（工具服务缺席 / 读失败时的唯一返回值，`layerReady:false`）。 */
export const EMPTY_WORKSPACE_UNIVERSE: DefaultsUniverse

// ---- 读数编排（宿主服务现取 + 降级 + 日志） ----

/** 装配层交给 reader 的最小宿主面：`ctx.get` 现取，reader 内部收窄。 */
export interface WorkspaceUniverseHostAccess {
  readonly get: (name: string) => unknown
  readonly protectedNames: ReadonlySet<string>
  readonly log: SpecLog
}

/**
 * 造一个「按工作区路径读宇宙」的端口；**永不抛错**。
 * 工具服务缺席 / 抛错 → 空宇宙 + 一次 warn；技能服务缺席 → `skillsAvailable:false`；
 * 技能快照抛错 → 同一降级 + 每次 warn。
 */
export function createWorkspaceUniverseReader(
  access: WorkspaceUniverseHostAccess,
): (workspacePath: string) => Promise<DefaultsUniverse>

// 内部窄面（不导出；只声明本模块调用的能力）
interface GlobalToolsLike { schemas(): readonly VisibleToolSchema[] }
interface SkillCatalogLike {
  snapshot(options: { readonly cwd: string }): Promise<{
    readonly skills: readonly SkillSummaryLike[]
    readonly complete: boolean
  }>
}
```

`buildWorkspaceUniverse` 的输出规则（逐条可断言）：

1. `layerReady: true`（工具事实已由调用方读到；缺席由调用方返回空宇宙）。
2. `groups` 顺序写死：MCP 组按 server 升序 → 技能组 → 内置组（非空时）；空组不出现；技能组在「候选里有 `skill` 工具」**或**「技能快照非空」时出现（见 6.1 A6）。
3. MCP 组：`address = formatAddress({kind:'mcp-group', server})`，行 `address = formatAddress({kind:'mcp-tool', server, pattern: suffix})`、`shortName = suffix`、描述取 schema 描述并截断 160。
4. 未归组：`mcp__` 前缀且正则不命中（含 `mcp__x`、`mcp__x__`、`mcp__a.b__x`）只计入 `ungroupedMcp`，**不**进内置组、**不**生成行。
5. 技能组：组地址 `tool:skill`；行来自 `skills` 快照中 `modelInvocable || userInvocable` 的条目（`/inventory` 并集口径），按名称升序；行带 `modelInvocable/userInvocable/source`；`skills` 缺席时 `skillsAvailable:false`、技能组只有组开关 + 降级提示（与面板同形）。
6. `skillsComplete` 仅在技能快照存在时透传；`ungroupedMcp` 仅在 `> 0` 时出现。
7. 纯函数：不读时钟、不做 IO、不改入参；同一入参两次调用深相等。

`createWorkspaceUniverseReader` 的失败矩阵：

| 情形 | 返回 | 日志 |
|---|---|---|
| `ctx.get('tools')` 为 `undefined` | `EMPTY_WORKSPACE_UNIVERSE` | warn 一次（闭包内去重，避免每次读刷屏） |
| `tools.schemas()` 抛错 | 同上 | warn 带原文 |
| `ctx.get('skills')` 为 `undefined` | `buildWorkspaceUniverse({schemas})`（`skillsAvailable:false`） | 不 warn（受支持的降级） |
| `skills.snapshot({cwd})` 抛错 | 同上 | warn（每次；技能是软分面） |
| 正常 | 完整宇宙 | 无 |

> 装配点（`host/index.ts`）只做一行映射，不再有业务分支：
> `readWorkspaceUniverse: createWorkspaceUniverseReader({ get: (name) => ctx.get(name), protectedNames, log })`。

### 3.2 宿主：`RpcDeps` 与 `handleWorkspace`

```ts
export interface RpcDeps extends ControlDeps {
  readonly agents: AgentLookup
  /**
   * 按工作区规范路径读该工作区的宇宙（`{workspacePath}` 寻址）。
   * 实现必须永不抛错（抛错也由 rpc.ts 兜底为空宇宙，见 `readWorkspaceUniverseOf`）。
   */
  readonly readWorkspaceUniverse: (workspacePath: string) => Promise<DefaultsUniverse>
  readonly kernel?: RpcKernel
}
```

```ts
// handleWorkspace（读 / 写两条路径共用；**档动作完成后再算宇宙**，写盘不被技能快照拖慢）
const universeOfTarget = async (): Promise<DefaultsUniverse> =>
  resolved.target.kind === 'session'
    ? universeOf(deps, resolved.target.session)          // 会话形态：原样（面板零回归）
    : readWorkspaceUniverseOf(deps, resolved.key)        // 新：路径形态 = 该工作区的宇宙

// 读路径：先读档，再算宇宙
const reading = await workspaceFileOf(deps)
const value: WorkspaceValue = { /* ... */, universe: await universeOfTarget() }

// 写路径：先写盘，成功后再算宇宙
const attempt = await writeWorkspaceOf(/* ... */)
const value: WorkspaceValue = { /* ... */, universe: await universeOfTarget() }

/**
 * 读工作区宇宙：端口抛错不让整次 workspace 读失败——档本身仍可读，
 * 只是清单退化为「layerReady:false」（页面只留残留区）。
 */
async function readWorkspaceUniverseOf(deps: RpcDeps, key: string): Promise<DefaultsUniverse> {
  try {
    return await deps.readWorkspaceUniverse(key)
  } catch (error) {
    deps.log.warn(`读取工作区「${key}」的宇宙失败（页面将只显示残留区）：${messageOf(error)}`)
    return EMPTY_UNIVERSE
  }
}
```

写响应同样带宇宙（G7：客户端写后用响应整份替换，缺了清单会消失）——两条路径都算 universe，写路径不特殊处理。宇宙放在档动作之后现算，是为了不让「技能目录发现」阻塞一次开关写入。

### 3.3 wire 契约（`src/contract.ts`）

```ts
export interface DefaultsEntry {
  readonly address: string
  readonly shortName: string
  /** 描述首 160 字符；缺省 = 无描述。 */
  readonly description?: string
  readonly protected: boolean
  readonly reserved: boolean
  /**
   * 技能行：模型可经 `skill` 工具加载（默认档里「占对话 token」）。
   * 与 `userInvocable` **成对出现**；只在 `skill:<name>` 地址上合法。
   */
  readonly modelInvocable?: boolean
  /** 技能行：用户可经 `/<name>` 手动调用。 */
  readonly userInvocable?: boolean
  /** 技能行：来源（`dsh-skill` 的 `source` 原值；短标签由 client 映射）。 */
  readonly source?: string
}

export interface DefaultsUniverse {
  readonly layerReady: boolean
  readonly skillsAvailable: boolean
  /** 分组（MCP 组按 server 升序 → 技能组 → 内置工具组；空组不出现）。 */
  readonly groups: readonly DefaultsGroup[]
  /** 工作区宇宙：`mcp__` 前缀但无法还原服务器名的工具数（未归组；缺省 = 0）。 */
  readonly ungroupedMcp?: number
  /** 工作区宇宙：技能目录观测是否完整（缺省 = 未观测 / 旧响应）。 */
  readonly skillsComplete?: boolean
}
```

`WorkspaceValue.universe` 类型**保持** `DefaultsUniverse | null`，但语义改写：

```ts
/**
 * 目标工具宇宙。
 * - `{sessionId}`：本会话宇宙（`scoped ∪ carried`），面板/命令同源；
 * - `{workspacePath}`：该工作区的宇宙（全局工具注册表 ∪ 该 cwd 技能），本版本**不再返回 null**；
 * - `null` 只为混合版本兼容保留（旧宿主）；新宿主不产生。
 */
readonly universe: DefaultsUniverse | null
```

parser 规则（`DEFAULTS_ENTRY_KEYS` / `DEFAULTS_UNIVERSE_KEYS` 同步扩展，`parseWorkspaceValue` 自动覆盖）：

- `modelInvocable` / `userInvocable`：可选布尔；**必须成对**（只给一个 → 拒绝）。
- 任一技能字段出现时 `address` 必须以 `skill:` 开头（MCP / 内置行带技能字段 → 拒绝）。
- `source`：可选、非空字符串；与技能字段同生（出现 `source` 必须有 invocation 对）。
- `ungroupedMcp`：可选非负安全整数。
- `skillsComplete`：可选布尔。
- 未知键仍按 strict 拒绝（旧字段集不放宽）。

### 3.4 client：组件 props 变化

**不变（重要）**：`WorkspaceDefaultsEditorProps`（`WorkspaceDefaultsEditor.tsx:73`）与 `WorkspaceDefaultsSectionProps`（`WorkspaceEntry.tsx:310`）**零变化**——座位份额、注入面、父级 hook 全部不动；新能力只来自宿主返回值。

```ts
// DefaultsGroupCopy：两个字段改为可选（缺省 = 旧行为）
export interface DefaultsGroupCopy {
  readonly residualTitle: string
  readonly removeLabel: string
  readonly removeAria: (address: string) => string
  /** 命令兜底说明；缺省 = 不渲染（页面形态把命令放进命令卡）。 */
  readonly cliHint?: string
  /** 宇宙不可用的主文案；缺省 = `t('defaults.universeUnavailable')`（面板/用户级原样）。 */
  readonly universeUnavailable?: string
}

// DefaultsGroupListProps：新增两个可选、缺省即面板旧渲染
export interface DefaultsGroupListProps {
  readonly universe: DefaultsUniverse | null
  readonly disabled: readonly string[]
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly copy: DefaultsGroupCopy
  readonly t: Translate
  /**
   * 全局过滤词（页面形态）。
   * `undefined` = 不启用（面板/用户级编辑器不传，DOM 与现行一致）；
   * `''` = 启用页面形态（显示全局过滤框、隐藏内置组的本地过滤框）。
   */
  readonly query?: string
  /** 行详情：描述次行 + 技能标签；缺省 false = 面板旧行。 */
  readonly showDetails?: boolean
}

// 新页面组件（仅 dialog 形态使用）
export interface WorkspaceDefaultsPageProps {
  readonly workspace: WorkspaceView | null
  readonly universe: DefaultsUniverse | null
  /** 由父级算好的三计数（与清单同一份 (universe, disabled) 读数）。 */
  readonly counts: DefaultsCounts
  readonly saving: boolean
  readonly saved: boolean
  readonly failure?: PanelFailure
  /** 清空的两段式确认态（状态机在 WorkspaceDefaultsEditor，页面只展示）。 */
  readonly armed: boolean
  /** 开关（父级负责撤掉清空确认态）。 */
  readonly onToggle: (address: string, on: boolean) => void
  readonly onClear: () => void
  readonly onRefresh: () => void
  readonly t: Translate
}
```

`defaults-view.ts` 新纯函数：

```ts
export interface DefaultsFilterResult {
  /** 过滤后的宇宙；未过滤 / 宇宙为 null 时**原样返回入参**（identity 稳定）。 */
  readonly universe: DefaultsUniverse | null
  /** 过滤后仍展示的残留地址（差集始终相对**未过滤**宇宙计算，再筛查询词）。 */
  readonly residual: readonly string[]
  /** 查询词是否生效（trim 后非空）。 */
  readonly filtering: boolean
}

export function filterDefaultsView(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
  query: string | undefined,
): DefaultsFilterResult
```

匹配规则：查询词 trim + `toLowerCase()`；组级命中 = `group.key` 命中（MCP server 名 / `builtin`）或该组任一行命中，组级命中保留整组；行级命中 = `shortName` / `address` / `description` 包含；残留 chip = `address` 包含。未过滤时 `residual` 与现行 `residualOf(universe, disabled)` 完全一致。

### 3.5 文案键集合（新增 29 键，zh/en 同步）

| 键 | zh | en | 使用面 |
|---|---|---|---|
| `workspace.listTitle` | 默认关闭项 | Off-by-default entries | 清单卡标题 |
| `workspace.listHint` | 开关只写本工作区默认档：关闭 = 之后在此工作区新建的会话初始不可用。 | Switches write this workspace's defaults: off means sessions created here later start with the tool unavailable. | 清单卡副标题 |
| `workspace.filter` | 过滤工具、技能或地址… | Filter tools, skills, or addresses… | 全局过滤的可访问名 / placeholder |
| `defaults.filterEmpty` | 没有匹配「{query}」的条目。 | No entry matches “{query}”. | 过滤无结果 |
| `workspace.emptyDefaults` | 本工作区还没有默认关闭项。 | No off-by-default entries in this workspace yet. | C6 空档标题 |
| `workspace.emptyDefaultsHint` | 在下方清单里关闭任意条目即写入；只影响之后在此工作区新建的会话。 | Turn any entry off below to write it to this workspace's defaults; only sessions created here afterwards are affected. | C6 空档引导 |
| `workspace.emptyUniverse` | 宿主没有提供可列出的工具清单，暂时只能查看与移除档内已有条目。 | The host exposes no tool catalog right now, so only existing entries can be viewed or removed. | `listed=residual=0` 空态 |
| `workspace.universeUnavailable` | 宿主全局工具注册表暂不可用：只能查看与移除档内已有条目。 | The host's global tool registry is unavailable: only existing entries can be viewed or removed. | 页面形态宇宙降级（覆盖 `defaults.universeUnavailable`） |
| `workspace.ungrouped` | 另有 {count} 个 MCP 工具名无法归组（公开名归一化/截断后无法还原服务器名），本页不提供开关。 | {count} more MCP tool names cannot be grouped (their public names lost the server boundary after normalization/truncation); they are not switchable here. | 未归组计数 |
| `workspace.skillsIncomplete` | 技能目录观测不完整，清单可能缺项。 | The skill catalog observation is incomplete; the list may miss entries. | `skillsComplete=false` |
| `workspace.globalUnion` | 工具清单来自宿主进程的全局注册表（所有已加载工作区的并集）：可能列出本工作区看不到的 MCP 工具；写入只保留意图，新会话不存在该工具时不生效。技能清单按本工作区目录读取。 | The tool list comes from the host process's global registry (the union of all loaded workspaces): it may include MCP tools this workspace cannot see; a write only records intent and has no effect where the tool does not exist. The skill list is read for this workspace's directory. | 全局并集近似说明 |
| `workspace.commandTitle` | 跨清单地址 | Addresses outside the list | 命令卡标题 |
| `workspace.commandNote` | 该命令只写「本会话所属工作区」的档；要给其他工作区补条目，请直接编辑上面的工作区档文件。 | The command writes only the workspace this session belongs to; to add entries for another workspace, edit the defaults file shown above. | 命令卡边界说明 |
| `workspace.commandComment` | 目标工作区：{key} | Target workspace: {key} | 复制文本首行注释 |
| `workspace.copyCommand` | 复制命令 | Copy command | 复制按钮 |
| `workspace.copied` | 已复制 | Copied | 复制成功反馈 |
| `workspace.copyFailed` | 复制失败，请手动选择文本。 | Copy failed; select the text manually. | 复制失败反馈 |
| `entry.skillTokens` | 占对话 token | Uses dialog tokens | 技能行标签（modelInvocable=true） |
| `entry.skillNoTokens` | 不占对话 token | No dialog tokens | 技能行标签（modelInvocable=false） |
| `entry.skillUserInvocable` | `/{name}` 可用 | `/{name}` available | 技能行标签（userInvocable=true） |
| `entry.skillUserBlocked` | 不可手动调用 | No manual invocation | 技能行标签（userInvocable=false） |
| `entry.skillHidden` | 新会话默认隐藏 | Off in new sessions | 技能行标签（地址在本工作区关闭集） |
| `skill.source.project-dsh` | 项目 | Project | 技能来源短标签 |
| `skill.source.project-agents` | 项目(agents) | Project (agents) | 同上 |
| `skill.source.custom` | 自定义 | Custom | 同上 |
| `skill.source.user-dsh` | 用户 | User | 同上 |
| `skill.source.user-agents` | 用户(agents) | User (agents) | 同上 |
| `skill.source.bundled` | 内置 | Bundled | 同上 |
| `skill.source.runtime` | 运行时 | Runtime | 同上 |

复用不改的既有键：`workspace.title`（`section` 形态标题 / 可访问名）、`workspace.key`、`workspace.path`、`workspace.registered`、`workspace.unregistered`、`workspace.unresolved`、`workspace.corrupt`、`workspace.scope`、`workspace.union`、`workspace.refresh`、`workspace.clear`、`workspace.clearConfirm`、`workspace.saved`、`workspace.loading`、`workspace.unavailable`、`workspace.noTarget`、`workspace.remove`、`workspace.removeAria`、`defaults.counts`、`defaults.summary`、`defaults.residualTitle`、`defaults.universeUnavailable`、`defaults.group*`、`defaults.switchLabel`、`defaults.groupSwitchLabel`、`defaults.groupOff`、`defaults.remove`、`defaults.clear*`、`panel.empty`、`group.filter`、`skill.unavailable`、`entry.protected`、`entry.reserved`。

> 未知 `source` 原样显示；来源标签映射表放在 `WorkspaceDefaultsPage.tsx`（`locales.ts` 只放字典，`defaults-view.ts` 保持 locale 无关）。

### 3.6 改造后页面结构（组件树 + DOM 骨架）

```
WorkspaceDefaultsSection（份额三态；kind!=='workspace' 时空态零请求）
└─ WorkspaceDefaultsTarget（key={path}；挂载即 read；{workspacePath} 寻址）
   └─ WorkspaceDefaultsEditor variant="dialog"（状态机在父级；本组件只管展示与动作）
      └─ WorkspaceDefaultsPage（新建）
         ├─ div.workspacePage
         │  ├─ div.card（概要卡）
         │  │  ├─ div.cardHeader：<p.cardTitle>{workspace.title ?? key}</p>
         │  │  │                 + span.badge（已登记/未登记）
         │  │  │                 + span.push + Button（刷新，saving 时禁用）
         │  │  ├─ dl.facts：Workspace key / Workspace file（等宽、可换行）
         │  │  ├─ p.counts：清单 N · 默认关 M · 残留 K（defaults.counts）
         │  │  └─ p.warning（corrupt 时）
         │  ├─ div.card（清单卡）
         │  │  ├─ div.cardHeader：<p.cardTitle>默认关闭项</p> + Input.pageFilter（全局过滤；宇宙不可用或无候选时不渲染）
         │  │  ├─ p.note（workspace.listHint：开关语义）
         │  │  ├─ div.emptyBlock（universe ready 且 disabled 为空：C6）
         │  │  ├─ DefaultsGroupList（query / showDetails）
         │  │  ├─ div.emptyBlock（listed=0 且 residual=0：无候选）
         │  │  └─ p.note × 3（globalUnion / ungroupedMcp / skillsIncomplete，按条件出现）
         │  ├─ div.card（命令卡）
         │  │  ├─ p.cardTitle + p.note（commandNote）
         │  │  ├─ div.commandRow：pre.command > code（两行：# 目标工作区：<key> / /tools workspace off <地址>）
         │  │  │                    + Button（复制命令 / 已复制 / 复制失败）
         │  │  └─ p.note（其他工作区手改挡文件）
         │  ├─ div.footnotes：p.footnote（scope） + p.footnote（union）
         │  ├─ div.actions：Button（清空/再点一次确认清空） + span.saved
         │  └─ div[role=alert]（failure）
```

相对「会话工具面」的取舍（参考但不照搬）：

- **保留**：MCP 组 + 组/行两级开关、技能整档、内置工具行、组头计数摘要、保护/保留行禁用 + 短标签、残留 chip 只移除、`stale-while-revalidate`（父级 `useWorkspaceDefaults` 已有）。
- **页面化改造**：六段纵排 → 三卡 + 脚注（空间换层次）；全局过滤（面板只有内置组过滤）；行下次行描述 + 技能调用方式标签（面板无）；概要卡刷新（面板 footer 有）；空档/空宇宙/无匹配三种空态（面板只有 `panel.empty`）；命令卡 + 复制（面板只有一句灰字）。
- **不做**：C2 锚点/吸顶、C5 计数徽章联动、窄屏布局、自由文本地址添加（D8 红线）。

### 3.7 样式类与设计令牌（`panel.module.css` 新增，旧类零改动）

| 类 | 用途 | 关键样式（令牌 + 静态兜底） |
|---|---|---|
| `.workspacePage` | 页面正文 | `display:flex; flex-direction:column; gap:16px` |
| `.card` | 三张卡 | `background:var(--dsw-alias-bg-layer-2,#f7f7f8); border:1px solid var(--dsw-alias-border-l1,rgb(0 0 0 / 6%)); border-radius:12px; padding:14px 16px; display:flex; flex-direction:column; gap:10px` |
| `.cardHeader` | 卡头 | `display:flex; align-items:center; gap:8px; flex-wrap:wrap` |
| `.cardTitle` | 卡标题（<p>，非 heading） | `margin:0; color:var(--dsw-alias-label-primary,#000); font-size:13px; font-weight:600; line-height:20px` |
| `.badge` | 登记态 | `padding:0 6px; border:1px solid var(--dsw-alias-border-l2,rgb(0 0 0 / 12%)); border-radius:999px; color:var(--dsw-alias-label-tertiary,#7f8287); font-size:11px; line-height:16px` |
| `.push` | 右推 | `margin-left:auto` |
| `.facts` | key/文件 | `display:grid; gap:4px; margin:0` |
| `.fact` / `.factTerm` / `.factValue` | 事实行 | 12px、`label-tertiary` / `label-secondary`、`font-family:var(--ds-font-family-code,monospace)`、`word-break:break-all` |
| `.counts` | 三计数 | `margin:0; color:var(--dsw-alias-label-secondary,#545557); font-size:12px; line-height:18px; font-variant-numeric:tabular-nums` |
| `.listHeader` | 清单卡头 | `display:flex; align-items:center; gap:8px; flex-wrap:wrap` |
| `.pageFilter` | 全局过滤 | `margin-left:auto; width:min(280px,100%)` |
| `.emptyBlock` | 空档/空宇宙 | `padding:12px; border:1px dashed var(--dsw-alias-border-l2,rgb(0 0 0 / 12%)); border-radius:8px; background:var(--dsw-alias-bg-layer-1,#fff)` |
| `.emptyTitle` / `.emptyHint` | 空态两级 | 13px/600 label-primary；12px label-tertiary |
| `.commandRow` | 命令行 | `display:flex; align-items:flex-start; gap:8px` |
| `.command` | 代码块 | `flex:1; margin:0; padding:8px 10px; background:var(--dsw-alias-bg-layer-1,#fff); border:1px solid var(--dsw-alias-border-l1,…); border-radius:8px; font-family:var(--ds-font-family-code,monospace); font-size:12px; line-height:18px; white-space:pre-wrap; word-break:break-all` |
| `.footnotes` | 脚注 | `display:flex; flex-direction:column; gap:2px` |
| `.note` | 次级注记 | `margin:0; color:var(--dsw-alias-label-tertiary,#7f8287); font-size:12px; line-height:18px` |
| `.rowMain` | 行主列（`showDetails`） | `display:flex; flex-direction:column; gap:2px; min-width:0` |
| `.rowDescription` | 描述次行 | 12px/16、tertiary、单行省略（`title` 保留全文） |
| `.rowTags` | 技能标签行 | `display:flex; flex-wrap:wrap; gap:4px` |
| `.metaTag` | 技能标签 | 11px/16、`border:1px solid var(--dsw-alias-border-l1,…)`、`border-radius:999px`、`padding:0 6px`、`white-space:nowrap` |

颜色纪律：每处 `var(--dsw-alias-*, <兜底>)`，兜底只用关键字/派生色（仓内既有纪律）；`panel.module.css` 仍是本包唯一 CSS module（产物注入器计数不变）。

---

## ④ 决策记录

> 每条含「决策 / 被否方案与理由」。Q1–Q8 是上游已裁定输入，这里记录**落码层的取舍**，不重开收敛。

**D1 页面宇宙的读数面 = 插件上下文全局注册表 + `skills.snapshot({cwd})`（A2 的落码形态）**
- 决策：宿主新增工作区宇宙端口；工具用 `ctx.get('tools').schemas()`（不传 scope，未受限全局），技能用 `ctx.get('skills').snapshot({ cwd: workspacePath })`（全局层 + 该 cwd 项目技能）。
- 被否：**A1 会话视角投影**——需要在 `WorkspaceConfigSectionOwnerProps` 增加 `currentSessionId`（`tooling/contracts/src/index.ts:85-96`），波及三贡献方 + holder，且把「页面不绑定会话」语义改成「借用某个会话」；会话不在场仍降级。**A3 维持降级**——核心编辑能力缺失，与本次用户诉求相反。**按工作区调 project-mcp 的发现协议**——project-mcp 没有导出「按 root 列服务器」的公共 API，`IsolationLayer`/`McpManager` 是插件私有（`plugins/project-mcp/src/host/index.ts:108` 只暴露 catalog 闭包），跨插件耦合会把两个插件版本绑死。
- 反例（为什么不是「全局注册表就够了、不用技能快照」）：全局注册表是**进程级并集**，MCP 服务器来自所有已加载工作区；若技能也用全局层而不带 cwd，就会把其他工作区的项目技能列进本工作区档。因此技能必须带 cwd（`SkillServiceLike.snapshot` 的 `cwd` 作用域，`host/types.ts:237-241`）。

**D2 会话形态的宇宙保持原样（面板零回归）**
- 决策：`handleWorkspace` 只在 `kind === 'path'` 分支走新端口；`{sessionId}` 继续 `universeOf`（`rpc.ts:866-879`）。
- 被否：**两种形态统一到全局宇宙**——会让面板的「工作区默认档」分区开始列出其他工作区的 MCP 服务器，直接违反「面板形态零回归」；也会改变 `/tools status` 的语义链。
- 反例：`test/rpc.test.ts:1388-1415`（会话宇宙 = `visibleSchemas ∪ snapshot().deny`）与 `test/panel.test.ts:976-...`（组桶）都钉着会话口径；统一到全局会让这些套件大面积失效。

**D3 页面宇宙的归组循环另写，只复用 `defaultsEntryOf` 叶子（不复用 `buildDefaultsUniverse`）**
- 决策：新模块按 `/inventory` 的 `MCP_SERVER_PATTERN` 独立分组；`panel.ts` 只把 `defaultsEntryOf` 改为导出（地址 / 描述截断 / 保护名 / 保留名判据仍然单点）。
- 被否：**直接复用 `buildDefaultsUniverse`**——它的 `mcpPartsOf`（`panel.ts:791-805`）比 `/inventory` 正则宽（server 名可含 `.` 等），且不产出未归组计数、不给技能行 invocation/source、还要求 `carried`（会话语义）。**改 `buildDefaultsUniverse` 加开关**——为页面改共用构建器会把面板拖进回归风险，且 `carried` 语义在页面没有对应物（页面没有「上一轮掩码」）。
- 反例：`mcp__a.b__x` 在 `mcpPartsOf` 下归 server `a.b`，在 `/inventory` 正则下是未归组；若复用前者，Q8 的「归组纪律照搬」即被破坏。

**D4 未归组 MCP 名只计数、不成行**
- 决策：`DefaultsUniverse.ungroupedMcp?: number`；页面在清单卡下给一句「另有 N 个 MCP 工具名无法归组」；这些名字不进任何组、不生成开关。
- 被否：**塞进 builtin 组**——行地址会变成 `tool:mcp__x`，而地址文法明确拒绝该前缀（`test/address.test.ts:194-206` 的 `mcp-tool-uses-tool-prefix`），点开关必然 `bad-address`；**静默丢弃**——Q8 明确要未归组计数，用户会以为清单完整；**新建「未归组」组**——组会被 `switchAddressesOf` 计成可切换项（`defaults-view.ts:62-78`），三计数虚高，且组开关没有合法地址。

**D5 技能详情挂在 `DefaultsEntry` 的可选字段上**
- 决策：`modelInvocable?` / `userInvocable?` / `source?` 三个可选字段；parser 强制「成对 + 仅 skill 地址」。
- 被否：**新 `SkillDefaultsEntry` 联合类型**——`DefaultsGroup.tools` 要变成联合数组，清单渲染/三计数/残差全要分支，改动面远大于三个可选字段；**单独 `skills` 数组**——技能组已经承载行，两份数据源会漂移（面板已有 `SkillView` 与 `ToolGroup` 互补的先例，但那是因为面板要区分「组」与「技能行」；页面的技能行就在技能组里）。

**D6 共用清单的升级方式：两个可选展示参数，不做「形态开关」**
- 决策：`DefaultsGroupList` 加 `query?` / `showDetails?`；缺省 `undefined` 时 DOM 与现行逐字一致，面板/用户级编辑器不传。
- 被否：**页面侧组合层复制一份清单**——300+ 行重复（分组/锁态/残差/整组在档语义），必然漂移；**`variant: 'panel' | 'page'` 大开关**——把布局分支塞进共用组件，改变面板分支的任何一行都要重新证明零回归；**页面自己过滤 `universe` 后再传给清单**——清单会用过滤后的宇宙算残差（`residualOf` 的差集基准被污染），把「被过滤掉的在档地址」误标成残留。
- 反例：过滤后的宇宙若只剩 `mcp:a::x`，`residualOf(filtered, disabled)` 会把 `mcp:a`（真实存在的组地址）判成残差并渲染成 chip——这正是 D6 拒绝「页面先过滤」的原因。

**D7 过滤放在清单组件内部，但纯算法放在 `defaults-view.ts`**
- 决策：`DefaultsGroupList` 读 `query`，内部 `useMemo(filterDefaultsView(universe, disabled, query))`；残差先按**未过滤**宇宙求差集再筛查询词；过滤时组头强制展开且不可折叠（避免「搜到但收起」），隐藏内置组本地过滤框。
- 被否：**过滤放在页面、清单只渲染**——页面拿不到「残差基准」，且过滤无结果的消息要在清单内；**过滤放共用组件但写死行为**——面板会多出全局过滤框（无 `query` 时已用 `undefined` 区分）；**过滤时保留本地折叠**——结果可能藏在收起组里。
- 反例：见 D6 的残差错判；另：面板 `DefaultsGroupRow` 的本地过滤只看 `shortName`（`DefaultsGroupList.tsx:195-199`），页面需要覆盖 address/description/组键，复用同一份过滤会改变面板行为。

**D8 C4 的命令模板 + 目标键注释 + 边界说明**
- 决策：复制文本 = 首行 `# 目标工作区：<key>` + 次行 `/tools workspace off <地址>`；代码块同文本；按钮复制；命令卡常驻「只写本会话所属工作区；其他工作区请手改上方档文件」；页面不知道目标工作区是否等于会话所属（份额里没有 sessionId，`WorkspaceDefaultsSectionProps` 只有 `workspace/resolveClient/t`），所以说明恒定显示。
- 被否：**给 `/tools workspace` 加 `--path`**——改 CLI 语法与宿主写路径白名单，是 `/tools` 契约扩张，超出本次页面优化；**只复制 `/tools workspace off ` 前缀**——空地址不可执行；**复制 `workspaces.json` 的 JSON 片段**——与 C4 明确点名的 `/tools workspace off <地址>` 不一致（可作为待决增强，见待决 Q-A）。
- 反例：若把「目标工作区」写进命令（如 `/tools workspace --path <key> off …`），就是发明一条不存在的命令；复制出去必然失败。

**D9 `universe` 保持可空**
- 决策：类型/parser 继续接受 `null`；新宿主两种形态都返回对象。
- 被否：**收紧为 `DefaultsUniverse`**——混合版本（新 client + 旧 host）会在 parser 处把合法响应判成 `bad-response`，页面直接进失败态；且现有降级分支（`DefaultsGroupList.tsx:347`）是安全网。
- 反例：`test/wire-contract.test.ts:1092` 已把「null 合法」写成契约；收紧要推翻既有契约测试，收益只是少一个空判断。

**D10 分节正文去 `h3`，且页面不新增 heading**
- 决策：删除 `WorkspaceDefaultsEditor.tsx:244` 的 `<h3>`；页面用 `<p.cardTitle>` 做视觉标题，不引入 `h2/h3`。可访问名由 holder 的 `tabpanel` `aria-labelledby`（`WorkspaceConfigPage.tsx:208-211`）提供。
- 被否：**改成信息性 `h3`（工作区名）**——Q4 已裁定「删除」；页面标题与 tab 重复的问题换成另一个 heading 只是把重复藏起来，且会让读屏出现「工作区默认档 → 工作区名」两级无意义层级。
- 反例：`test/workspace-editor.test.tsx:543/785/836` 的 heading 断言正是要删的对象；若保留/新增 heading，就必须重写这些断言并解释为什么与 Q4 不一致。

**D11 页面正文拆成新组件 `WorkspaceDefaultsPage`**
- 决策：`WorkspaceDefaultsEditor` 保留两形态壳、`armed`/`clear`/`toggle` 行为与 section 正文；`dialog` 分支委托新页面组件（纯展示 + 本地过滤/复制态）。
- 被否：**继续在编辑器内堆 JSX**——文件将过 400 行，页面/面板两套布局交错，违反「单文件单一职责」；**让页面自己持有 `armed` 与清空动作**——会把两段式确认状态复制到两个组件，且 section 形态仍需要同一份状态。
- 反例：`armed` 在开关后必须复位（现有 `setArmed(false)`，`WorkspaceDefaultsEditor.tsx:185-190`）；若页面独立持有，section 形态的复位逻辑要再写一遍。

**D12 刷新放概要卡（C3），不碰 holder**
- 决策：`WorkspaceDefaultsPage` 概要卡右侧放 `workspace.refresh` 按钮，调父级 `onRefresh`；`section` 形态继续用现有 actions 行刷新。
- 被否：**在 holder 页面工具栏加刷新**——页面壳是四包共用契约，刷新语义只属于 stt 分节；**只保留 section 形态刷新**——页面形态当前没有刷新入口（`WorkspaceDefaultsEditor.tsx:204-216` 的刷新按钮在 `!dialog` 分支），不满足 C3。
- 反例：页面读是 stale-while-revalidate（`WorkspaceEntry.tsx:63-70`），没有刷新按钮时外部写入（手改 JSON）只能靠切 tab 重挂才发现。

**D13 不触达 `tooling/contracts` / `workspace-config`**
- 决策：owner 份额仍 `{workspace}`，页面壳不动。
- 被否：**A1 式在份额里加 `currentSessionId`**——见 D1；**把命令卡/刷新挂到 holder**——holder 是四包共用，单插件能力不应进入壳。
- 反例：`tooling/contracts/src/index.ts:85-96` 的 owner 份额明确「纯数据、无回调」；加回调/会话 id 会让三贡献方重新编译并重新论证「页面不绑定会话」。

**D14 技能来源用 locale 短标签表，而不是宿主中文表**
- 决策：`source` 原值上网；`WorkspaceDefaultsPage` 用 7 个 `skill.source.*` 键映射，未知值原样显示。
- 被否：**复用 `/inventory` 的 `SOURCE_LABELS`**——那是 host 侧纯中文表（`user-commands/src/host/inventory.ts:118-127`），跨插件 import 破坏 bundle 自包含，且页面是双语 UI；**不显示来源**——Q8 要求展示字段照搬 /inventory，来源对「这个技能为什么属于本工作区」有价值。
- 反例：把 `project-dsh` 直接渲染给用户看是内部枚举泄漏；把中文标签塞进 en 词典会破 locale 一致性。

---

## ⑤ 逐任务组实现要点

> 组间按 G1 → G8 串行可执行；G2 与 G1 的契约形状在本文件已冻结，可并行；G7 在 G2 后可与 G4–G6 并行；G4 必须先于 G5（G5 消费 `query/showDetails`）。组内标「并行」的条目可同时做。每组都带可执行的验证映射。

### G1 宿主宇宙构建（新模块 + 叶子导出 + 单测）

| 任务 | 文件 | 要点 |
|---|---|---|
| G1.1 | `src/host/workspace-universe.ts`（新建） | 常量 `MCP_SERVER_PATTERN`（逐字照搬 `/inventory`，注释写明「跨包只能双份，不能 import」）、`SKILL_NAME='skill'`、`BUILTIN_GROUP_KEY='builtin'`；`WorkspaceUniverseFacts` / `buildWorkspaceUniverse`；`EMPTY_WORKSPACE_UNIVERSE`；`WorkspaceUniverseHostAccess` / `createWorkspaceUniverseReader` |
| G1.2（并行） | `src/host/panel.ts` | 只把 `function defaultsEntryOf` 改成 `export function defaultsEntryOf`；注释补一句「工作区宇宙复用同一叶子」 |
| G1.3 | `test/workspace-universe.test.ts`（新建） | 表驱动：`mcp__a__x`→组 a、`mcp__a__b__c`→组 a（suffix `b__c`）、`mcp__a.b__x`/`mcp__x`/`mcp__x__`→未归组；技能行 union 过滤 + 三个字段；`skills` 缺席 → `skillsAvailable:false` 且技能组只有组开关；`skillsComplete` 透传；工具服务缺席/抛错 → 空宇宙 + warn；同入参深相等、入参不被修改 |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-universe.test.ts`；断言 `Object.keys(universe)` 只在 `ungroupedMcp>0`/`skillsComplete!==undefined` 时包含新键；断言 `mcp__a.b__x` 不出现在任何 `groups[].tools[].shortName`。

> **G1 终形态实测（2026-11-08 执行）**：三任务全绿。①组验证 24/24 passed（333ms，干净窗口），主会话统一重跑；②`MCP_SERVER_PATTERN` 与 `inventory.ts:40` 逐字一致（grep 比对）；③模块 373 行，导出面 = `EMPTY_WORKSPACE_UNIVERSE`（冻结）/`WorkspaceUniverseFacts`/`buildWorkspaceUniverse`/`WorkspaceUniverseHostAccess`/`createWorkspaceUniverseReader`；④reader 失败矩阵实测口径：tools 缺席/抛错 → `EMPTY_WORKSPACE_UNIVERSE` + warn；skills 缺席/抛错 → `skillsAvailable:false` + `layerReady:true`（非空宇宙，受支持降级），测试如实断言；⑤运行规则：内置工具夹具的 `VisibleToolSchema.name` 用注册名（`bash`），`tool:` 只是地址前缀——写宇宙/测试夹具时不得混用；⑥panel.ts 改动面 = 2 insertions/1 deletion（签名行 + 注释），typecheck 两段绿、整包 1085 用例零破坏。

### G2 wire 契约与响应自检

| 任务 | 文件 | 要点 |
|---|---|---|
| G2.1 | `src/contract.ts` | `DefaultsEntry` 三可选字段（JSDoc 写「成对 + 仅 skill」）；`DefaultsUniverse` 两可选字段；`WorkspaceValue.universe` 语义注释改写 |
| G2.2 | `src/contract.ts` | `DEFAULTS_ENTRY_KEYS` / `DEFAULTS_UNIVERSE_KEYS` 扩键；新增 `readOptionalBooleanField` / `readOptionalCountField`；`readDefaultsEntry` 成对校验 + skill 地址校验；`readNullableDefaultsUniverse` 条件展开 |
| G2.3（并行） | `test/wire-contract.test.ts` | 正例：带完整技能字段的 entry、带两个宇宙字段的 universe；反例：只给 `modelInvocable`、`tool:bash` 带技能字段、`ungroupedMcp:-1`、未知键；`universe:null` 仍合法 |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts`；`pnpm --filter dsh-plugin-session-tool-toggle typecheck`（两段 tsc 都过）。

> **G2 终形态实测（2026-11-08 执行）**：三任务全绿，组验证 305/305 passed（既有 291 + 新增 14）+ typecheck 两段 rc 0（主会话干净窗口重跑）。①分派口径修正：G2.1（类型层）与 G2.2（parser 层）同改 `contract.ts`，按「同文件串行」分两波派发（G2.1 单发 → G2.2 与 G2.3 并发），避免 read-modify-write 竞态；②2.1 一处自主偏差（纯注释）：`DefaultsUniverse`/`WorkspaceValue` 头注释旧文案与新语义矛盾，一并对齐为「目标无关形状」口径；③parser 六条拒绝规则与失败消息（可 grep 锚点）：成对（`必须成对出现`）、skill 前缀（`只有 skill: 地址允许携带技能字段`）、source 同生（`同时在场`）、非空串（`为空`）、非负安全整数（`不是非负安全整数`）、字段集不互通（`未知字段：ungroupedMcp`）；④新增 14 用例（4 正 + 10 反）全部溯源 code-design 3.3 六规则，未弱化断言；⑤`universe:null` 分支逐字保留。

### G3 宿主接线与 RPC 行为

| 任务 | 文件 | 要点 |
|---|---|---|
| G3.1 | `src/host/rpc.ts` | `RpcDeps.readWorkspaceUniverse` 必需端口；`handleWorkspace` 分派；`readWorkspaceUniverseOf` 兜底；更新文件头与 415-416 注释（删「路径形态按契约给 null / D-24」） |
| G3.2 | `src/host/index.ts` | `rpcDeps` 增加端口（`createWorkspaceUniverseReader`，`get: (name) => ctx.get(name)`）；`import` 新模块；不新增 `inject`（`ctx.get` 软读） |
| G3.3 | `test/rpc.test.ts` | harness 增 `readWorkspaceUniverse` 假端口（默认返回固定宇宙 + 记录 calls）；翻转 `:1438` 用例为「path read 返回该工作区宇宙」；新增「写响应也带同一宇宙」「reader 抛错 → 成功 + 空宇宙 + warn」「session 形态零调用」 |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/rpc.test.ts`；断言 `reader.calls === ['/w2']`（规范化 key，不是请求原文的变体）；断言 `parseWorkspaceValue` 对 path 响应的 `.universe` 非 null。

> **G3 终形态实测（2026-11-08 执行）**：三任务全绿，组验证 57/57 passed + typecheck 两段 rc 0 + lint 0/0（主会话干净窗口重跑）。①「宇宙在档动作完成后现算」与 ③3.2 设计明文（第 243/271 行）一致：读路径读完档再算、写路径写盘成功后再算，技能目录发现不阻塞开关写入；②分派实现为 `universeOfTarget` 闭包：`'session'` → 原 `universeOf` 一字未动（session 形态两条宇宙用例零回归实证）；`'path'` → `readWorkspaceUniverseOf(deps, resolved.key)` 传登记表规范键；③兜底 `readWorkspaceUniverseOf`：抛错 → warn（含错误原文）+ `EMPTY_UNIVERSE`，与 `attributionOf`/`choicesOf` 同一软降级纪律；④3.2 装配一行逐字 `readWorkspaceUniverse: createWorkspaceUniverseReader({ get: (name) => ctx.get(name), protectedNames, log })`，`inject` 未新增；⑤3.3 夹具增 `readWorkspaceUniverse` 假端口（calls 记录 + `universeReaderError` 注入），翻转 1 例 + 新增 3 例（写响应带宇宙 / 抛错降级 / session 零调用），既有用例断言语义零改动；⑥并行时序：三任务并发一次咬合，无返工。

### G4 清单组件升级（页面能力 + 面板零回归）

| 任务 | 文件 | 要点 |
|---|---|---|
| G4.1 | `src/client/defaults-view.ts` | `DefaultsFilterResult` + `filterDefaultsView`；未过滤走 `residualOf`；过滤时先 `residualOf(universe, disabled)` 再按 `address` 筛；组级命中保留整组；空组丢弃；输出保留 `skillsAvailable/ungroupedMcp/skillsComplete` |
| G4.2 | `src/client/DefaultsGroupList.tsx` | props `query?/showDetails?`；`copy.cliHint?/universeUnavailable?`；`useMemo` 过滤视图；`filtering` 时组头非 button + 强制展开 + 隐藏内置过滤；`DefaultsRow` 的 `showDetails` 分支（`.rowMain/.rowDescription/.rowTags`）；技能标签（invocation/source/hidden）；过滤无结果用 `defaults.filterEmpty`；降级文案用 `copy.universeUnavailable ?? t('defaults.universeUnavailable')`；`cliHint` 缺省不渲染 |
| G4.3 | `test/defaults-view.test.ts` | 纯函数表：空查询 identity、组键命中、行命中、描述命中、残留命中、无命中、大小写/空白；残差基准不被污染 |

> **G4 终形态实测（2026-11-08 执行）**：组验证 65/65 passed（defaults-view 29 + workspace-editor 36）+ 面板回归 143/143（tool-panel/panel/panel-controller/skill-panel 四套件加跑）+ 面板五文件 `git diff` 零改动（主会话干净窗口重跑）。①**一次规范偏差修复（R12 留痕）**：4.1 初版把「行命中」实现为只留命中行，与 ③3.4 第 399 行「组级命中 = 组键命中**或任一行命中**，命中即保留整组」不符——4.3 用例 3 红暴露，主会话读权威源裁决为实现偏差（非设计变更），修复子代理改 `filteredGroupOf` 为 `some` 判命中返回原组，29/29 转绿；②typecheck 13 处 TS2322/TS2345 为 G6.2 locales 键时序（`defaults.filterEmpty`、`entry.skill*` 5 字段、`skill.source.*` 7 键），G6.2 落地后应精确归零（G5/G6 核对时验证）；③落位裁量：`SOURCE_TAG_KEYS` + `sourceTagKeyOf` 就近放 `DefaultsGroupList.tsx`（渲染地在 `DefaultsRow`，页面行全部经它输出），G5.1 不重复一份——设计稿原记 `WorkspaceDefaultsPage.tsx` 作废；④缺省 DOM 逐字一致已由「非 filtering 组头 button / 内置过滤框 / rows 条件与现行等价」实现 + workspace-editor 36 例 section 断言不改语义全绿钉住。
| G4.4（并行） | `test/workspace-editor.test.tsx`（section 部分） | 现有 section 用例全部保持；补一条「section 形态没有全局过滤框、没有描述次行」（`queryByPlaceholderText(zh['workspace.filter'])` 为 null） |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/defaults-view.test.ts test/workspace-editor.test.tsx`；面板回归 `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx test/panel.test.ts test/panel-controller.test.ts` 全绿；`git diff --name-only -- plugins/session-tool-toggle/src/client | grep -E 'ToolPanelAction|ToolPanelGroups|DefaultsEditor\.tsx|DefaultsSectionFrame|panel-controller'` **无输出**（退出码 1）。

### G5 client 正文重组（新页面 + 编辑器分支）

| 任务 | 文件 | 要点 |
|---|---|---|
| G5.1 | `src/client/WorkspaceDefaultsPage.tsx`（新建） | 三卡 + 脚注 + actions + alert；`query` 本地 state；过滤框仅在 `universeReady && counts.listed > 0` 时渲染；复制（`navigator.clipboard.writeText` 软降级 + `copyState` + 2s 复位 + `aria-live`）；空档块（`universeReady && disabled.length===0`）；空宇宙块按 `layerReady` 选文案（`false` → `workspace.universeUnavailable`，`true` 且无候选 → `workspace.emptyUniverse`），条件 `counts.listed===0 && counts.residual===0`；注记三连（globalUnion/ungrouped/skillsIncomplete）；命令卡（`workspace` 为 null 时不渲染） |
| G5.2 | `src/client/WorkspaceDefaultsEditor.tsx` | `dialog` → `<WorkspaceDefaultsPage .../>`；删 h3；`section` 分支 JSX 一行不动；`universe` JSDoc 改写；`onToggle` 包装撤 `armed`；注释里的 D-24/null 删除 |
| G5.3（并行） | `src/client/WorkspaceEntry.tsx` | 仅注释同步（`value`/state 的「会话视角宇宙」表述） |
| G5.4 | `test/workspace-editor.test.tsx` | 删三处 heading 断言；新增：概要卡（工作区名/key/文件/计数/登记徽章）、清单卡（过滤、无匹配文案）、空档块、命令卡（代码文本含目标 key、复制调用、copied 反馈）、概要卡刷新回调、页面无 `combobox`/无 `role=dialog`/无 heading；`section` 形态刷新按钮仍在 |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx`；`grep -n '<h3' plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` **无输出**；`grep -n "universe.*null" plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 只剩「响应可能为 null 的降级」注释（无 `D-24` 旧口径）。

> **G5+G6 终形态实测（2026-11-09 执行，G5/G6 联合核对）**：联合验证 workspace-editor 46/46 + 单包全量 1145/1145 + typecheck 两段 rc 0 + build rc 0 + locale-parity 10/10（干净窗口）。①G5.1 组件 379 行按 ③3.6 骨架；G5.2 委托 + 删 h3 + D-24 注释清除（`workspace.title` 剩 section 1 处）；G5.3 仅一行注释；G5.4 删 3 处 heading 断言 + G4.4 补 1 条（随本组合并落地，tasks.md 未单列）+ 页面 9 条 = 46 例；②G6.1 CSS 追加 211 行既有类零改动；`.badge` 与面板 intent 徽标重名 → 作用域规则 `.cardHeader .badge`（特异性覆盖，面板零影响）；③G6.2 locales 29 键 zh/en 同步、对账无差额、33 处 LocaleKeysOf 红点精确归零；④**两处实现 bug 修复（验收锚点 = 测试）**：4.2 内置组本地过滤框页面形态 `query=''` 时漏隐藏 → 条件改 `query === undefined && open && kind==='builtin'`（配 query 透传链，面板路径真值面不变）；5.1 复制反馈按钮与 aria-live 双渲染「已复制」→ 按钮恒 `copyCommand` 文案 + copied 态 `disabled`，aria-live 唯一播报；⑤**`<address>` 占位符裁决**：③3.6 树的 `<地址>` 采纳为 ASCII 中性常量 `COMMAND_PLACEHOLDER`（占位符是命令文法示意非文案；既有 `workspace.cliHint` 证明其 locale 属性，但扩键会突破 29 键冻结范围；测试未钉死写法）；⑥1.3 遗留 AR8（新测试未接 tsconfig include）由主会话补 `tsconfig.host.json` 一行修复（R13 留痕）。

### G6 样式与文案

| 任务 | 文件 | 要点 |
|---|---|---|
| G6.1 | `panel.module.css` | 按 3.7 表加类；旧类零改动；颜色只用 `var(--dsw-alias-*, 兜底)`；不引入 `!important` |
| G6.2 | `locales.ts` | 29 个新键 zh/en 同步；`satisfies` 由类型自动校验；不改面板既有键的文案 |
| G6.3（并行） | `test/locale-parity.test.ts` | 若 `REQUIRED_KEYS` 需要补页面必读键（`workspace.listTitle`/`workspace.filter`/`workspace.commandTitle`/`workspace.copyCommand`），追加；zh/en 键集与占位符必须一致 |

**验证**：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/locale-parity.test.ts`；`pnpm --filter dsh-plugin-session-tool-toggle build` 后 `grep -c 'data-dsh-plugin="dsh-plugin-session-tool-toggle"' lib/client.js` 与既有注入器计数一致（`test/bundle.test.ts` 再跑一遍）。

### G7 spec 与 README 同步（可在 G2 后并行）

| 任务 | 文件 | 要点 |
|---|---|---|
| G7.1 | `openspec/specs/dsh-session-tool-toggle/spec.md` | 改写 `:155` Requirement：「分节保留下拉」→「分节不带工作区下拉（选择框归 holder）」（这是把上一变更 `2026-11-08-workspace-config-page` 已落地的「无下拉」补进 spec，不是新决策）；宇宙口径拆成「面板/用户级 = 会话 scoped ∪ carried」与「页面分节 = 该工作区宇宙」；新增 Requirement「工作区默认档页面的工作区宇宙」（全局注册表并集、技能 cwd 快照、/inventory 正则 + 未归组计数、跨工作区只写意图、两种服务缺席降级）；替换 `:174-177` 旧 Scenario 为「切换工作区后清单按新工作区宇宙刷新」并新增「跨工作区 MCP 近似」「未归组 MCP 名」「技能服务缺席」三个 Scenario；「工作区默认档分节与分区的分组开关」Scenario 按两种宇宙拆写 |
| G7.2 | `plugins/session-tool-toggle/README.md` | `:81` 删「universe:null / 已知降级」，改写为「路径形态返回工作区宇宙」+ 三卡结构 + 全局并集近似；`:127-128` 改写「两个默认档界面只列本会话可见工具」为「面板/用户级 = 会话视角；页面 = 工作区全局并集」；保留「无自由文本添加」「命令只作用本会话所属工作区」「其他工作区手改 JSON」 |

**验证**：`pnpm spec:check`（即 `openspec validate --all --strict`）退出 0；`pnpm docs:check` 退出 0；`grep -n "universe: null\|universe：null\|已知降级" plugins/session-tool-toggle/README.md` **无输出**；`grep -n "沿用当前会话视角的清单\|分节保留下拉\|该响应不携带新宇宙" openspec/specs/dsh-session-tool-toggle/spec.md` **无输出**。

> **G7 终形态实测（2026-11-09 执行）**：7.1/7.2 全绿（主会话复核 spec:check rc 0 / docs:check rc 0 / 全部 grep 锚点无输出）。①7.1 主 spec：MODIFIED 块整体替换「默认档编辑面的分组开关形态」（宇宙口径两分：面板/用户级 = 会话 scoped ∪ carried；页面分节 = 工作区宇宙；分节不带下拉落 spec），ADDED「工作区默认档页面的工作区宇宙」6 Scenario；程序化交叉核对 delta 全部内容行逐字存在且唯一；②7.2 README：universe:null 两段删除、新口径段落与三卡结构、跨工作区只写意图、边界三义务保留；一处超出行号的最小一致性修正（原 :129「两个默认档界面」→「面板两个默认档分区」并补页面分节不受影响句——不改则与改写后口径自相矛盾）；③G6.3 随组清偿：locale-parity `REQUIRED_KEYS` 补页面必读 4 键（listTitle/filter/commandTitle/copyCommand），parity 10/10；④R14：docs:check 的 2 处基线断链（他变更归档工件的示例链接）按最小清偿修复归绿（0 errors / 0 warnings）。

### G8 全量测试与门禁

| 任务 | 命令 / 断言 |
|---|---|
| G8.1 包级 | `pnpm --filter dsh-plugin-session-tool-toggle verify:all`（lint → typecheck → build → test）退出 0 |
| G8.2 契约 | `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts test/rpc.test.ts test/workspace-universe.test.ts test/defaults-view.test.ts` 全绿 |
| G8.3 面板回归 | `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx test/panel.test.ts test/panel-controller.test.ts test/workspace-editor.test.tsx` 全绿；`git diff --name-only -- plugins/session-tool-toggle/src/client` 只含 1.2 列出的文件（见 G4.4 的 grep 断言） |
| G8.4 仓级 | `pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm docs:check`、`pnpm spec:check`、`pnpm dsh:check` 全部退出 0；`git status --short` 包含重建后的 `plugins/session-tool-toggle/lib/*` |
| G8.5 真机验收 | 重启 web profile 后打开 `http://127.0.0.1:3080` → 工作区配置 → 工作区默认档：① 空档（0 关闭项）出现空档卡 + 清单仍可见；② 有档（含 `mcp:a` 与残留 `mcp:zzz`）出现组清单 + 残留 chip；③ 过滤 `mcp`/技能名/残留地址各命中一次，无匹配出现 `defaults.filterEmpty`；④ 复制命令后剪贴板文本含目标 key 与 `/tools workspace off`；⑤ 打开会话头部工具面板，六段结构与两个默认档分区行为与改造前一致（面板零回归的人工证据） |

---

## ⑥ 设计假设与未决项

> **G8 终形态实测（2026-11-09 执行，全部 22 任务完成）**：8.1 verify:all rc 0（24 文件 / 1145 用例，干净窗口）；8.2 仓级六连（test / typecheck / lint / docs:check / spec:check / dsh:check）全 rc 0；面板零回归终检**精确 basename 匹配**通过——注意 tasks.md 8.2 的 `DefaultsEditor\.tsx` grep 模式会子串误报本变更触达文件 `WorkspaceDefaultsEditor.tsx`，以 `git diff --name-only` 的 basename 精确匹配（`grep -xE`）为准，五个面板文件零改动成立。改动面 21 tracked + 3 untracked（workspace-universe.ts / WorkspaceDefaultsPage.tsx / workspace-universe.test.ts）+ lib 产物（client.js / index.js），全部落在触达面清单内；另有 R14 跨变更工件最小清偿（folders-picker code-design.md 两处断链）。执行期留痕 R12–R14 见 tasks.md 附录。

### 6.1 设计假设

| # | 假设 | 依据 / 影响 |
|---|---|---|
| A1 | 「工作区默认档页面」= workspace-config 独立页面中 stt 贡献的分节，不是面板里的同名分区 | 目标与 `explore.md` §7 假设一致；面板改造是非目标 |
| A2 | `ctx.get('tools').schemas()`（不传 scope）返回**未受限全局注册表**，包含所有已加载工作区的 MCP 工具 | `plugins/project-mcp/src/host/index.ts:108` 的同一表达式与注释；若某插件在全局层也做限制，本假设失效（见待决 Q-B） |
| A3 | 全局注册表是「当前进程已加载」的并集，不是「所有配置里存在」的并集；未连接/未加载的服务器不出现 | project-mcp 的管理器按需加载；页面文案写明「所有已加载工作区」，不承诺完整性 |
| A4 | `ctx.get('skills').snapshot({cwd})` 读全局技能层 + 该 cwd 的项目技能；agent preset 作用域的技能不在结果里 | DSH `dsh-skill` 的 `SkillViewOptions`（`scope` 缺省读全局层）；这是「工作区技能」的合理近似 |
| A5 | 技能快照的 `complete:false` 仍可展示（只提示可能缺项），不当作不可用 | 与 `/inventory` 的 `complete` 处理同口径；`skillsAvailable` 只表示服务是否可用 |
| A6 | `skill` 工具缺席但技能快照非空时，仍展示技能组与逐技能开关 | 技能开关的生效机制是每 agent 层影子 stub，不依赖 `skill` 工具；组开关 `tool:skill` 仍是合法地址 |
| A7 | 页面份额不含 sessionId，无法判断「目标工作区是否 = 本会话所属工作区」 | `WorkspaceConfigSectionOwnerProps` 只有 `{workspace}`；命令卡说明恒定显示（见 D8） |
| A8 | 浏览器安全上下文提供 `navigator.clipboard`；不可用时显示复制失败文案 | jsdom 需 mock；真机非 https 的降级是「手动选择文本」 |
| A9 | 宿主与 client 同版本发布；`universe:null` 只为混合版本兼容保留 | 四包统一版本、同 tag 安装（根 `AGENTS.md`）；parser 仍接受 null |
| A10 | 本次不动 `lib/` 以外的构建配置；`lib/` 必须随提交重建 | 仓规「产物 lib 随仓库提交」；G8.1 的 build 覆盖 |
| A11 | 页面不做窄屏布局；960px 内容列由 holder 保证 | `WorkspaceConfigPage` 页面 spec 明示；卡片宽度 100% 继承 |
| A12 | 过滤是纯展示层行为，不改变三计数/写入语义；过滤时组头不可折叠是本页取舍 | 三计数用未过滤宇宙（`defaultsCountsOf` 在父级算）；见 D7 |

### 6.2 未决项索引

待决问题共 5 条，见下节：Q-A 命令卡能力边界、Q-B 全局并集警示强度、Q-C 两个新 wire 字段的取舍、Q-D 技能来源是否进首版、Q-E `universe` 是否收紧为非空。均不阻塞 G1–G6 落码；Q-A/Q-B 影响 G7 文案，Q-C 影响 G2/G7，Q-D 影响 G6，Q-E 影响 G2。

---

## 待决问题

### Q-A C4 命令卡在「目标工作区 ≠ 会话所属工作区」时的呈现

- **问题**：`/tools workspace off` 只写本会话所属工作区的档；页面可切到任意已登记工作区，份额里没有 sessionId，无法判断两者是否一致。当前设计是「命令模板 + 目标键注释 + 恒定边界说明」。
- **选项**：(a) 恒定说明 + 命令模板（本设计推荐）；(b) 额外提供一段「按目标工作区键的 `workspaces.json` JSON 片段」复制（更贴近真实写路径，但引入 JSON 语法与格式漂移风险）；(c) 给 `/tools workspace` 加 `--path`（越界，改 CLI 契约）。
- **推荐**：(a) 作为首版；(b) 作为后续增强；(c) 不做。
- **影响面**：命令卡文案与复制内容、spec G7 的「跨工作区只写意图」措辞；不影响宿主写路径。

### Q-B 全局并集近似在页面上的警示强度

- **问题**：页面宇宙可能列出其他工作区已加载的 MCP 服务器，用户可能误以为本工作区可用。
- **选项**：(a) 清单卡下方一条灰字 `workspace.globalUnion`（本设计推荐）；(b) 清单卡顶部醒目 banner（更强的诚实性，但页面视觉变重）；(c) 只写 README / 不写界面。
- **推荐**：(a)。理由是页面已经有一句 scope/union 脚注，再加一条并列灰字即可；banner 会与「参考会话工具面但更轻」的定位冲突。
- **影响面**：G5.1 的注记区、G6 文案、G7 spec 的「已知近似」措辞。

### Q-C `ungroupedMcp` 与 `skillsComplete` 两个新 wire 字段是否进首版

- **问题**：Q8 明确要求「未归组计数」，`skillsComplete` 是 `/inventory` 同款观测完整性字段，但两个都扩了 strict wire。
- **选项**：(a) 两个都进（本设计推荐）；(b) 只进 `ungroupedMcp`（严格按 Q8 字面）；(c) 都不进（未归组只写日志）。
- **推荐**：(a)。`ungroupedMcp` 是 Q8 硬要求；`skillsComplete` 成本一个可选布尔 + 一行提示，避免「技能列表缺项却无提示」。
- **影响面**：G2（契约/parser/测试）、G4/G5（提示渲染）、G7（spec 是否写观测完整性）。

### Q-D 技能来源（`source`）是否进首版 UI

- **问题**：Q8 说「展示字段照搬 /inventory」，`/inventory` 的技能行显示来源；但页面行已经有描述 + 两个调用方式标签，再加来源可能拥挤。
- **选项**：(a) 作为标签进（本设计推荐，7 个 locale 键）；(b) 只放 `title` 悬停（不占版面，但触屏不可见）；(c) 不进 UI，只留在 wire。
- **推荐**：(a)。工作区页面里「项目 / 用户 / 内置」来源直接解释技能为何属于本工作区；标签行只在 `showDetails`（页面）出现，面板不受影响。
- **影响面**：G2（wire 字段）、G4（行渲染）、G6（文案键）、G7（spec 的展示字段清单）。

### Q-E `WorkspaceValue.universe` 是否收紧为非空

- **问题**：新宿主两种形态都返回对象，`null` 只剩混合版本兼容。
- **选项**：(a) 保留可空（本设计推荐）；(b) 收紧为 `DefaultsUniverse`。
- **推荐**：(a)。混合版本容错 + 现有 `DefaultsGroupList` 降级分支是安全网；收紧只省一个空判断，却要改 `parseWorkspaceValue` 的 null 合法用例（`test/wire-contract.test.ts:1092`）与 README/类型文档。
- **影响面**：G2（类型/parser/测试）、G3（响应自检）、G7（文档）。

---

## 附：阶段 1.75 界面演示

- **判定**：触发（C1 界面产出 ∧ C2 无设计依据 ∧ C3 须自定视觉与布局；不命中排除表——无设计稿、非纯逻辑、用户未豁免、需求非原型）。
- **分档**：L2（多状态 + 关键交互流；视觉有 DSH 令牌体系与 B1 卡片方向依托，非 L3 开放方向）。
- **产物**：`demos/workspace-defaults-page-l2.html`（方案速览四卡 + 前后对照 + 五状态：① 有档态三卡完整形态 ② 空档态 ③ 过滤中含无匹配 ④ 降级态 ⑤ 失败态）。
- **自检**：29,800 字节（≤100,000）；零外链（grep 计数 0）；chrome-shared 新标签页渲染，console 无 error、无 Failed to load resource（仅 1 条非错误的表单字段 a11y 建议）；a11y 快照核对约束条/五状态/三卡/标签语义齐备；390×844 视口 `scrollWidth === clientWidth`（无横向溢出）。证据形态声明：本会话模型不声明图片输入，截图已留档但结构核对以 a11y 快照为据。
- **用户确认**：2026-11-08 演示确认通过（①确认，转入下一步）；同轮裁定 Q-A=a / Q-B=a / Q-C=两个都进 / Q-D=进标签行 / Q-E=保留可空。

---

## R15 追加组段（真机验证期增量，2026-11-09，用户三点裁定）

**触发**：宿主真机复核发现页面列出 dbx/figma 等**非本工作区**的 MCP；用户追加两点呈现要求（组级来源/token 标注、标签着色）。诊断结论：页面宇宙读的是未受限全局注册表（进程级并集），而 dbx/figma 已是 opc 工作区的项目级配置（project-mcp 按会话根集隔离，本工作区会话根本不可见）——原始设计「跨工作区条目列出且意图容忍」被用户推翻。

### G9 项目级过滤与组级标注（已完成）

1. **跨插件归属服务（project-mcp）**：`src/host/attribution-service.ts` 新增 cordis `Service` 子类，以 `projectMcp` 名注册（构造即注册、随 fiber 卸载消失，照搬 `dsh-workspace` 的 `WorkspaceRegistry` 发布形态）。公开面两条：`managedServerNames()`（全量 claim）与 `serverNamesForWorkspace(path)`（归属器根集 → manager claim；路径不被认领返回 `null` **不是空集**）。装配点一行实例化；claim 语义与 `McpManager.serverNamesForRoots` 同源（加载中也算本工作区配置的）。
2. **宿主过滤与标注（session-tool-toggle）**：`WorkspaceUniverseFacts` 增 `projectServers`（全量声明；缺席 = 插件未装配 → 全部组标 `user`）与 `projectServersHere`（归属命中集；`null` = 归属读数失败 → **fail-closed** 项目级组整组剔除 + `foreignProjectMcp` 计数）。`buildWorkspaceUniverse` 在升序组循环里分派：项目级且不在归属集 → 丢组计数；保留组打 `source: 'user' | 'project'` 与 `countsTokens: true`（mcp 组恒真——每个可见工具 schema 与服务器指令计入每次请求）。reader 经现有 `ctx.get` 缝软读 `projectMcp`：managed 读失败 → 整层 EMPTY（来源分野不可信，同 `schemas()` 抛错纪律）；归属失败 → `projectServersHere: null` + warn 一次。`{sessionId}` 寻址（面板路径）零改动。
3. **契约**：`DefaultsGroup` 增可选 `source`（枚举 `user`/`project`）与 `countsTokens`（布尔），**只允许 mcp 组携带**（技能/内置组携带即拒，与「技能字段只在 `skill:` 行」同款 fail-closed）；`DefaultsUniverse` 增可选 `foreignProjectMcp`（非负安全整数，>0 才出键）。strict 字段集与 parser 同步；旧形状依旧合法（wire 兼容）。
4. **客户端**：组头 MCP 分组渲染两枚徽章——来源（用户级蓝/项目级绿，title 讲可见范围）+「计入对话上下文」（橙，title 讲 schema/指令入请求）；只标 MCP 本身，组下工具行不重复（用户裁定）。行级标签着色：`skillTagsOf` 改产 `{text, title?, tone}`，`tagToneClass` 映射 `.toneInfo/.toneSuccess/.toneWarn/.toneDanger`（CSS 变量带字面量回退，暗色安全）——技能来源七类蓝、技能占 token 橙/不占中性、保护红、保留橙、整组在档橙、档内隐藏中性。页面清单注记第四连：`foreignProjectMcp > 0` 显「另有 N 个其他工作区的项目级 MCP 服务器未列入」。locales +9 键（zh/en），REQUIRED_KEYS 同步。
5. **门禁**：两包 verify:all 绿（project-mcp 151、session-tool-toggle 1166）+ 仓级 `dsh:check` 三组全绿；`openspec validate` 两 spec strict 绿。构建产物已重建（link worktree 直连，重启 profile 即生效）。
