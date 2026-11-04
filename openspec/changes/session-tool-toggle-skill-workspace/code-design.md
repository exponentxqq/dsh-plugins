# 代码级蓝图（阶段 1.7）— session-tool-toggle-skill-workspace

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由双线与 `diff-matrix.md` 收敛，**本文不复读**；本文只把已定结论**翻译成可施工的代码形状**。
> 输入已逐字读全：`line-a.md`（248 行）、`line-b.md`（445 行）、`diff-matrix.md`（184 行，第 4–5 节 = 用户已拍板决策，本文不推翻）。
> 事实基线（只读核实，2026-11-02；勘误复验 2026-11-04）：运行中 DSH = `0.2.1-rc.5`、插件 `1.5.0`（落档时为 `0.2.1-rc.2` / `1.4.0`，其间 `ee32d39` 升基线、v1.5.0 已发布；技能/工作区相关上游六包 rc.2→rc.5 lib 零差异，本文机制锚点全部复验成立，版本与发布号就地更新）；`openspec/changes/session-tool-toggle-skill-workspace/` 已存在（`proposal.md` 33 行 + `specs/dsh-session-tool-toggle/spec.md` 149 行），旧变更已归档于 `openspec/changes/archive/2026-11-02-session-tool-toggle`，`openspec/specs/dsh-session-tool-toggle/spec.md`（130 行）已就位 → **diff-matrix §5.1.5 的「先归档旧 change」前置已完成，不再是任务**。

## 0. 栈识别与 writer 豁免留痕

**结论：本次未触 writer 约束**（用户第 3 轮 Q11 拍板 A：豁免加载，如实标注）。

栈识别证据（逐条可复核）：

| 证据 | 位置 | 说明 |
|---|---|---|
| 无 Maven / Gradle / Nuxt 命中 | `find . -maxdepth 3 \( -name pom.xml -o -name 'build.gradle*' -o -name 'settings.gradle*' -o -name 'nuxt.config.*' \) -not -path '*/node_modules/*'` → 空输出 | 非 Spring、非 Nuxt，`spring-writer` / `nuxt-writer` 均不适用 |
| pnpm workspace 单仓多包 | `pnpm-workspace.yaml:6-7`（`packages: - "plugins/*"`）、根 `package.json`（`packageManager: pnpm@11.25.0`） | Node/TS 单仓 |
| 宿主半 = TypeScript + Cordis 插件 | `plugins/session-tool-toggle/src/host/index.ts:98`（`export const name`）、`:106`（`export const inject`）、`:118`（`Schema.object`）、`:177`（`export function apply(ctx, config)`） | Cordis `apply` 装配面 |
| 浏览器半 = React + Cordis client | `plugins/session-tool-toggle/src/client/index.ts:45-61`（`Context`/`slots`/`locale`）、`src/client/ToolPanelAction.tsx:43-44`（React 组件 import）、`package.json` devDeps `react ^18.3.1` / `react-dom ^18.3.1` | React 组件在 client bundle |
| JSX 管线 | `plugins/session-tool-toggle/tsconfig.base.json` 的 `"jsx": "react-jsx"`；`vitest.config.ts:19`（`esbuild: { jsx: 'automatic' }`） | TSX 编译 |
| 构建 = esbuild 自打包 | `plugins/session-tool-toggle/build.mjs:35-42`（`CLIENT_EXTERNALS`）、`:113`（host `external: ['node:*']`）、`:134`（client external） | 双端产物形态 |

产物约束（本文所有设计都受它约束，见 `test/bundle.test.ts:1-40`）：宿主产物只允许 `node:*` external（`@deepseek-ai/*` 只能类型 import）；浏览器产物只允许 `react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 三个模块词；`src/contract.ts` 零 import。


## 0.1 落档分歧点决策（阶段 2，用户已拍板；本蓝图已按此收敛）

| # | 问题 | 决策 | 对本蓝图的影响 |
|---|---|---|---|
| DQ1 | 上游工作区行菜单座位真名未定 | **C：本期不实现上游座位软注册**（等上游定名，后续变更实现） | 移除 C5 的 `WORKSPACE_MENU_*`/`declare module`、C9 的软注册、C3 的 `WorkspaceMenuAction`、D-12、G7 的座位项、T16 的座位断言；数据面/契约/面板不变；spec 已同步（「上游工作区行菜单入口不在本变更范围」） |
| DQ2 | 工作区档来源标注 | **A：不标注**，面板一句文案说明并集 | 契约不加 `inherited`；`WorkspaceDefaultsEditor` 显示一句说明 |
| DQ3 | 整档 `tool:skill` 关闭时逐技能行 | **A：保留状态 + 置灰提示** | `SkillPanel` 增 `blocked` 态与一行提示；不改状态机 |
| DQ4 | `{workspacePath}` 形态范围 | **A：仅限已登记工作区** | 维持 D-11；`resolveWorkspaceTarget` 拒绝未登记路径并返回 `workspace-unresolved` |

---

## ① 触达面清单

**仓归属**：全部落 **本仓 `dsh-plugins`**，插件目录 `plugins/session-tool-toggle/`（下表路径均相对该插件目录，除标注「本仓根」的行）。上游 `@deepseek-ai/dsh*`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/`）**只读核实、零修改**（ADR-0002）；`~/.dsh/profiles/web/*` 只作验证对象，不入 diff。

### 1.1 宿主半（`src/host/`）

| # | 文件 | 意图 | 关键改动点 |
|---|---|---|---|
| H1 | `src/host/address.ts` | 增第四类地址 | `SwitchAddress` 加 `{kind:'skill'; name}`；`parseAddress` 在 `skill:` 前缀分支归一 `skill:*`→`tool:skill`、裸 `skill`→`tool:skill`；新增 `ParseErrorCode = 'bad-skill-name'`；`SKILL_NAME` 常量（复制 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`）；`formatAddress` 加分支；`matchesToolName` 对 `kind==='skill'` 恒 false；`ADDRESS_GRAMMAR` 与三条错误文案补 `skill:` |
| H2 | `src/host/skills-plan.ts` | **新建**：技能遮蔽计划（纯函数） | `planSkills({disabled, installed, toolSkillClosed})` → `{shadowNames, closedTexts, matched, intentOnly}`；与 `planMask` 分离（技能名不是工具名） |
| H3 | `src/host/mask.ts` | 工具掩码**不认识**技能地址 | `resolveAddresses` 跳过 `kind==='skill'`（避免技能名进 `deny`、避免 `matched` 里出现 0 命中的技能键） |
| H4 | `src/host/session-layer.ts` | 每 agent 技能分面 | 新增 `SkillServiceLike`/`SkillScopeHandle` 窄面；`attach` 内先 `agent.ctx.get('skills')`（常态已就绪）+ 再装 `agent.ctx.inject(['skills'])` 软 fiber（晚到补挂）；`shadowed: Map<name, ShadowEntry>`（stub disposer + 影子前定义缓存）；`reconcileSkills()`（异步、有界、代数守卫）；`skills()` 读数；`skillsSettled()`；`detach` 逐个 dispose stub；`tools/change` 路径**不**触发技能收敛，`skills/change` 只刷新清单缓存 |
| H5 | `src/host/types.ts` | 端口与形状扩面 | `LayerHandle` 加 `skills(): SkillLayerSnapshot` 与 `skillsSettled(): Promise<void>`；`LayerSnapshot` 不动；`NoticeCode` 加 `skills-unavailable` / `skill-shadow-failed`；`Config` 加 `workspacesFile?: string`；`PanelInputs` 加 `skills` / `workspace` 两组输入；新增 `SkillLayerSnapshot` / `SkillSummaryLike` / `WorkspaceAttribution` 等类型（只在类型层，零运行时） |
| H6 | `src/host/panel.ts` | 技能行 + 工作区视图 + 关闭集拆分 | `buildGroups` 保持不动（`skill` 整档行留在 `groups`）；新增顶层 `skills: readonly SkillView[]` 与 `workspace: WorkspaceView \| null`；关闭集文本改用**全地址归一**（不再只取 `planMask.matched` 的键），`intentOnly` = 工具地址 0 命中 ∪ 技能地址无安装；`NOTICE_ORDER` 增两码 |
| H7 | `src/host/control.ts` | 用例扩到技能与工作区档 | `toggleSession`/`resetSession` 保持**同步**；`ToggleReport`/`ResetReport` 加 `hiddenSkills: number`，`schemaChanged` 语义扩为「工具 deny 或影子 stub 集合任一变化」；`PanelReading` 加 `skills` / `workspace` / `skillsAvailable`；新增 `updateWorkspaceDefaults(deps, target, mode, texts)`（异步、写失败抛错，与 `updateDefaults` 同款）；`parseAddresses` 自动接受 `skill:`（无需改） |
| H8 | `src/host/workspaces.ts` | **新建**：工作区档文件 | `workspacesPath(configured?)`、`readWorkspaces`（两级降级）、`writeWorkspaces`（原子、排序稳定序列化）、`disabledOf`、`withEntry`、`mergeSeed(user, workspace)`（并集纯函数，播种复用它以便单测）、`EMPTY_WORKSPACES`、上限常量；`WorkspaceIo = DefaultsIo`（复用端口，不新造 IO） |
| H9 | `src/host/attribution.ts` | **新建**：工作区归属 | `resolveWorkspaceAttribution(cwd, {roots, realpath, log})`：realpath + 逐级向上 + 最近命中已登记根胜 + 失败 fail-closed；与 `project-mcp` 归属同构 |
| H10 | `src/host/rpc.ts` | 第 5 端点 | `handleWorkspace`；`dispatch` 的 switch 加分支；`precheckAddresses` 复用；`snapshotOf` 组装 `skills`/`workspace`；两个新失败码映射（`workspace-unresolved`/`workspace-unwritable`）；`toggle` 分支在组装 value 前 `await layer.skillsSettled()` |
| H11 | `src/host/commands.ts` | 命令面 | `/tools workspace [status]` 与 `off\|on\|set\|reset <地址…>`（只作用本会话所属工作区）；`/tools status` 增「技能」段与「工作区默认档」段；`closedStateText` 增 `skill` 分支；`SKILL_FLIP_HINT` 文案接目录消息成本；`TOOLS_GRAMMAR` 补 workspace 子句 |
| H12 | `src/host/index.ts` | 装配接线 | `Config` 加 `workspacesFile`；`Settings.workspacesFile`；软注入 `workingDirectory` / `workspaceRegistry`（`ctx.inject`）+ `skills`（agent ctx，见 H4）；`readOrSeed` 播种改为并集；`controlDeps` 加 4 个新字段；`mount` 顺序不变（seed → `new SessionLayer` → `attach`）；启动日志补技能/工作区档降级信息 |
| H13 | `src/contract.ts` | 双端契约（strict） | 第 5 端点 `workspace`；`WorkspaceRequest`/`WorkspaceValue`/`WorkspaceView`/`WorkspaceChoice`/`SkillView`；`PanelSnapshot` 加两字段；`Mutation` 加 `hiddenSkills`；`HOST_FAILURE_CODES` 7→9；`NOTICE_CODES` 3→5；`REQUEST_PARSERS` 加一项；`PANEL_SNAPSHOT_KEYS`/`MUTATION_KEYS` 加键；新增 `MAX_WORKSPACE_PATH_LENGTH`/`WORKSPACE_ACTIONS` |

**明确不改（核实后判定）**：`src/host/state.ts`（`normalizeState`/`parseDisabledTexts`/`inspectTexts` 都经 `parseAddress`，新地址自动被接受并归一到规范形，见 `state.ts:147`、`:179`）；`src/host/defaults.ts`（用户档复用同一地址文法；路径/权限位常量被 H8 复用）；`src/host/record-store.ts`（投影 schema 与记录类型不变，`version` 仍为 1）。

### 1.2 浏览器半（`src/client/`）

| # | 文件 | 意图 | 关键改动点 |
|---|---|---|---|
| C1 | `src/client/SkillPanel.tsx` | **新建**：技能逐行开关 | 输入 `skills: readonly SkillView[]`；行地址 `skill:<name>`；复用控制器的 `toggle(address,on)` 与 `pending` 集合（按地址键控）；`unavailable` 时整块降级提示；`blocked`（整档 `tool:skill` 已关）时整块置灰并显示一行提示（DQ3） |
| C2 | `src/client/WorkspaceDefaultsEditor.tsx` | **新建**：工作区默认档编辑器 | 与 `DefaultsEditor` 同款字段（清单 + 逐项移除 + 添加框 + 保存/清空 + 「只影响之后新建的会话」）；`variant: 'section' \| 'dialog'`；带工作区下拉（`choices`） |
| C3 | `src/client/WorkspaceEntry.tsx` | **新建**：两个入口的薄壳 + 共享 hook | `WorkspaceFooterAction`（footer 触发按钮 + 自绘对话框）、`useWorkspaceDefaults()`（读/写/刷新/失败态） |
| C4 | `src/client/current-session.ts` | **新建**：当前会话探测 | 移植 `multi-root-workspace/src/compat/client-session.ts:39-45` 的两步探测（`current` → `byId[id].retainedBy.mainView`），只保留本插件支持的单一基线族 |
| C5 | `src/client/seats.ts` | **新建**：座位常量 + 假设座位类型增补 | `HEADER_SEAT`/`FOOTER_SEAT` 与 `ORDER` 常量集中一处（DQ1：本期不做上游工作区行菜单座位，无 `declare module` 增补） |
| C6 | `src/client/panel-controller.ts` | 状态加工作区档 | `PanelState` 加 `workspace?: WorkspaceView`、`workspaceChoices`、`savingWorkspace`、`workspaceSaved`、`workspaceError`；新增 `refreshWorkspace()`、`updateWorkspace(action, addresses?, key?)`；`toggle` 不变（技能行复用） |
| C7 | `src/client/panel-client.ts` | 第 5 端点客户端 | `workspace(request): Promise<WorkspaceValue>` + 内联的 `parseWorkspaceValue`（D16：两端各一份手写 parser）；`ENDPOINTS` 字面量加 `'workspace'` |
| C8 | `src/client/ToolPanelAction.tsx` | 挂载两个新分区 | 在 `ToolPanelGroups` 后挂 `SkillPanel`、在其后挂 `WorkspaceDefaultsEditor`（`variant='section'`）；四段布局变六段；失败/提示行接新码 |
| C9 | `src/client/index.ts` | 座位注册 | `HEADER_SEAT` 保持（改从 `seats.ts` 取）；新增 `ctx.slots.inject(FOOTER_SEAT, …)` 实注册（`register` 包 try/catch，失败只 warn） |
| C10 | `src/client/locales.ts` | 文案 | 新增 `section.skills` / `skill.*` / `workspace.*` / `notice.skills-unavailable` / `notice.skill-shadow-failed` / `error.workspace-unresolved` / `error.workspace-unwritable`（zh 为 canonical，en 同步 parity） |
| C11 | `src/client/panel.module.css` | 样式 | 技能行、工作区档分区、对话框、footer 触发按钮 |

**明确不改**：`src/client/ToolPanelGroups.tsx`（整档 `skill` 行继续由它渲染，见 D-7）、`src/client/DefaultsEditor.tsx`（用户档编辑器不动，工作区档另建组件以免两档语义混进一个 props 面）。

### 1.3 包与构建

| # | 文件 | 意图 | 关键改动点 |
|---|---|---|---|
| P1 | `package.json`（插件目录） | 类型依赖 + client 依赖声明 | devDeps 加 `@deepseek-ai/dsh-client-ui-sidebar: 0.2.1-rc.5`（footer 座位 SlotMap 类型）；`dsh.client.inject` 加 `@deepseek-ai/dsh-client-ui-sidebar`；`version` 由 `pnpm release` 统一抬（1.5.0 → 1.6.0，不手改） |
| P2 | `build.mjs` | **不改**（已核实） | `CLIENT_EXTERNALS`（`build.mjs:35-42`）与 host `external: ['node:*']`（`:113`）恰好覆盖新增代码：新组件只用 react + primitives + 本包资源 |
| P3 | `cordis.patch.yml` | **不改**（已核实） | 裸包名 insert 行是 client 扫描锚点（文件头注释），本变更不新增宿主行 |

### 1.4 测试（`test/`）

| # | 文件 | 意图 |
|---|---|---|
| T1 | `test/address.test.ts` | 改：`skill:` 文法/归一/失败码/`skill:*`/旧别名不回归 |
| T2 | `test/skills-plan.test.ts` | **新建**：`planSkills` 表驱动 |
| T3 | `test/mask.test.ts` | 改：`skill:` 不产生 deny/shadowServers |
| T4 | `test/session-layer.test.ts` | 改：技能分面（注册/注销/幂等/服务缺席/先到先得/整档关闭跳过/有界等待） |
| T5 | `test/panel.test.ts` | 改：`skills` 行、`workspace` 视图、关闭集拆分、新提示码 |
| T6 | `test/workspaces.test.ts` | **新建**：路径/读（四级降级）/写（排序、原子参数、失败抛错）/`withEntry` |
| T7 | `test/workspace-attribution.test.ts` | **新建**：registry 命中优先、子目录、符号链接、目录消失、无 registry |
| T8 | `test/control.test.ts` | 改：`hiddenSkills`、`schemaChanged` 扩义、`updateWorkspaceDefaults` 四动作与写失败 |
| T9 | `test/commands.test.ts` | 改：`/tools workspace` 文法与四种动作、`status` 两新段、技能翻转回执 |
| T10 | `test/rpc.test.ts` | 改：第 5 端点两种请求形态 × 成功/失败、新失败码、`skillsSettled` 等待 |
| T11 | `test/wire-contract.test.ts` | 改：新请求/响应 parser 表驱动、未知键拒绝、码表穷举、新快照键 |
| T12 | `test/skill-panel.test.tsx` | **新建**（jsdom）：技能行渲染/开关/`unavailable` 降级 |
| T13 | `test/workspace-editor.test.tsx` | **新建**（jsdom）：分区与对话框两形态、下拉切换、保存失败文案 |
| T14 | `test/panel-controller.test.ts` | 改：`updateWorkspace` 成功/失败/pending |
| T15 | `test/panel-client.test.ts` | 改：`workspace` 端点 payload 与 parser |
| T16 | `test/client-index.test.ts` | 改：footer 实注册（注册失败只 warn，`apply` 正常返回） |
| T17 | `test/locale-parity.test.ts` | 改：新键 zh/en 全覆盖 |
| T18 | `test/bundle.test.ts` | 改：`INLINED_MARKERS` 加 `'workspace'` 端点与 `'sidebar.footer.action'` |

### 1.5 文档（本仓根 + 插件目录）

| # | 文件 | 意图 |
|---|---|---|
| D1 | `plugins/session-tool-toggle/README.md` | 能力、预期管理（目录消息成本、`/name` 保留）、降级矩阵（`skills`/`workspaceRegistry`/工作区档损坏）、非目标改写（删掉「不做 per-skill」「不做工作区级默认档」，新增「不做追溯」「不做上游 patch」）、**回滚代价**（回任一不含本功能的旧版——1.4.0/1.5.0——丢 `skill:` 条目与工作区档）、配置表加 `workspacesFile` |
| D2 | 本仓根 `README.md` | 插件一览里 `session-tool-toggle` 的一行描述加技能级开关与工作区级默认档 |
| D3 | 本仓根 `AGENTS.md` | 「插件清单」条目同上 |
| D4 | `openspec/changes/session-tool-toggle-skill-workspace/{design.md,tasks.md}` | 落档（阶段 2 产出，不在本文件范围；本文 ⑤ 的任务组即 tasks 的骨架） |

---

## ② 证据锚

每个触达模块 ≥1 条 `file:line` 代码事实（新建文件标「新建」；上游路径相对 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`）。

| 模块 | 证据 |
|---|---|
| H1 `address.ts` | `src/host/address.ts:146`（`if (input === 'skill') return parsed({kind:'tool',name:'skill'})`，裸别名归一在此）；`:43-57`（`ParseErrorCode` 七码，新增码要加在这里）；`:87-88`（`ADDRESS_GRAMMAR` 一行文法）；`:158-163`（前缀分派与「只支持 mcp: 与 tool:」文案）；`:171-177`（`formatAddress`）；`:209-219`（`matchesToolName`） |
| H2 `skills-plan.ts`（新建） | 形状参照 `src/host/mask.ts:98-121`（`planMask` 的「计划 → matched（0 也保留键）→ 排序集合」写法）；技能名文法上游 `dsh-skill/lib/index.js:17`（`const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`） |
| H3 `mask.ts` | `src/host/mask.ts:176-186`（`resolveAddresses` 用 `parseAddress` 过滤，`kind` 分派点在此）；`:88-89`（`shadowServers` 只由 `mcp-group` 产生，说明「地址类别决定下游语义」已有先例）；`:140-146`（`guardReason` 同样只该看工具地址） |
| H4 `session-layer.ts` | `src/host/session-layer.ts:155-175`（`agentSurface` → `ctx.inject(['tools','systemPrompt'], …)`，技能分面照此再装一个 fiber）；`:99-110`（`InjectableAgentContext` 结构类型，不 import 上游）；`:289-312`（`attach` 顺序：取面 → 装 guard → 首轮 reconcile）；`:341-369`（`detach` 逐项容错拆卸）；`:440-471`（`reconcile` 的 diff 守卫 + I6 重入闸，技能收敛必须**另设**闸，不能共用） |
| H5 `types.ts` | `src/host/types.ts:229-239`（`LayerHandle` 三方法）；`:216-223`（`LayerSnapshot`）；`:276-282`（`NoticeCode` 三码）；`:204-213`（`Config` 四键）；`:290-319`（`PanelInputs`） |
| H6 `panel.ts` | `src/host/panel.ts:206-272`（`buildPanelSnapshot` 的输入→输出映射）；`:233-234`（`closedTexts` 来自 `plan.matched` 键 ← **必须改**的地方）；`:253`（`buildGroups(candidates, context, new Set(closedTexts))`）；`:297-341`（`buildGroups` 的 skill 分支）；`:42`（`DESCRIPTION_MAX_LENGTH = 160`） |
| H7 `control.ts` | `src/host/control.ts:235-315`（`toggleSession` 顺序：校验→withToggled→write→setState→回执）；`:260-263`（无变化同引用短路）；`:306`（`schemaChanged: !sameTexts(before.deny, after.deny)` ← 扩义点）；`:397-464`（`readPanel` 的三读并集与 `closed` 装配）；`:483-524`（`updateDefaults` 的读-改-写与「写失败原样抛」← `updateWorkspaceDefaults` 照此写）；`:554-584`（`parseAddresses` 全有或全无） |
| H8 `workspaces.ts`（新建） | 形状与纪律照抄 `src/host/defaults.ts:88-92`（路径定位）、`:106-162`（两级降级）、`:181-188`（写）、`:241-253`（`createNodeDefaultsIo` 的 `mode 0o600`/`dirMode 0o700`）、`:49`/`:56`（权限位常量） |
| H9 `attribution.ts`（新建） | 算法照抄 `plugins/project-mcp/src/host/attribution.ts:83-96`（`attribute`：resolve → 逐级 realpath → 最近命中）；上游 `dsh-workspace/lib/types/index.d.ts:265`（`resolveByPath` 是 **async 且路径不存在会 reject**）、`types/types.d.ts:63-71`（`Workspace.path` 已是 realpath、id 是 uuid） |
| H10 `rpc.ts` | `src/host/rpc.ts:205-232`（`dispatch`：端点判定 → parser → switch）；`:243-258`（`handleToggle` 预检→内核→`valueOf`→`checked`）；`:318-329`（`liveSessionOf` 三步校验）；`:424-455`（`snapshotOf` 组装 → `parsePanelSnapshot`）；`:666-677`（`failure(...)` 构造） |
| H11 `commands.ts` | `src/host/commands.ts:139-171`（`parseToolsInput` 子命令分派）；`:243-280`（`runToolsCommand` 异步入口 ← 可 await `skillsSettled`）；`:441-479`（`statusText` 段落拼装）；`:480-490`（`closedStateText` 按 `kind` 分派 ← 加 skill 分支）；`:93-101`（`SKILL_FLIP_HINT` 已有文案，直接复用） |
| H12 `index.ts` | `src/host/index.ts:118-129`（`Config` schema ← 加 `workspacesFile`）；`:289-295`（`readOrSeed`：`current.seeded` 短路 → `readDefaults` → `seed` ← 并集改在这里）；`:315-330`（`seed`：`snapshot` 与 `disabled` 同时置位）；`:347-362`（`mount`：ensureStore → readOrSeed → new SessionLayer → attach）；`:387-402`（`agent/created` 串行 await）；`:464-473`（`controlDeps`）；`:513-517`（`rpcDeps` + `descriptions`）；`:523-555`（`connection`+`webServer` 双软注入的坑位写法 ← 新软注入照此）；`:562-590`（统一拆卸） |
| H13 `contract.ts` | `src/contract.ts:43`（`ENDPOINTS` 四端点）；`:58-73`（`HOST_FAILURE_CODES` 七码）；`:123-130`（`NOTICE_CODES` 三码）；`:306-319`（`Mutation` 六字段）；`:780-785`（`REQUEST_PARSERS` 表）；`:814-825`（`PANEL_SNAPSHOT_KEYS` 白名单）；`:831`（`MUTATION_KEYS`）；`:424-435`（`readStrictObject`，未知键拒绝的实现点） |
| C1 `SkillPanel.tsx`（新建） | 组件形态照抄 `src/client/ToolPanelGroups.tsx:116-158`（`ToolRow`：`switch` + `pending` + `busy` 三态）；`:46-61`（`ToolPanelGroupsProps` 的 props 面） |
| C2 `WorkspaceDefaultsEditor.tsx`（新建） | 字段面照抄 `src/client/DefaultsEditor.tsx:46-72`（`DefaultsEditorProps`：`saving`/`saved`/`failure`/`onUpdate`）；`:94-101`（`splitAddresses` 可直接复用） |
| C3 `WorkspaceEntry.tsx`（新建） | 对话框宿主形态参照 `plugins/multi-root-workspace/src/client/index.ts:87-107`（footer 座位注册 + 自绘面板的既有先例） |
| C4 `current-session.ts`（新建） | 移植 `plugins/multi-root-workspace/src/compat/client-session.ts:39-45`（`current` → `retainedBy.mainView` 两步探测）；上游字段依据 `dsh-client-ui-session/lib/types/client/index.d.ts:103`（`mainView: unknown`）与 `dsh-client-ui-workspace/lib/types/client/tree.d.ts:144`（「`mainView` retention feeds containsCurrent」） |
| C5 `seats.ts`（新建） | 座位名与 order 现状 `src/client/index.ts:74`（`SEAT`）、`:86`（`PANEL_ORDER = 20`）、`:145-163`（`ctx.slots.inject` + try/catch 软注册）；DQ1 后不再需要座位增补（上游座位留待后续变更） |
| C6 `panel-controller.ts` | `src/client/panel-controller.ts:47-76`（`PanelState` 字段面）；`:265-302`（`toggle`：pending → 调用 → 整份快照替换 ← 技能行直接复用）；`:303-330`（`reset` 的 `resetting` 全局禁用先例 ← `savingWorkspace` 照此） |
| C7 `panel-client.ts` | `src/client/panel-client.ts:89-105`（四方法接口）；`:193-215`（`call`：payload → `connection.rpc.call(CHANNEL, endpoint, payload)` → 自检验证） |
| C8 `ToolPanelAction.tsx` | `src/client/ToolPanelAction.tsx:428-441`（面板主体：`section.groups` → `ToolPanelGroups` → `DefaultsEditor` ← 两个新分区插在这里）；`:189-211`（状态摘要段，工作区档状态可并入）；`:144-148`（`notice.*` 码→文案映射 ← 加两码） |
| C9 `index.ts`（client） | `src/client/index.ts:71`（`inject = ['slots','locale']`）；`:111-113`（字典先于座位注册）；`:128-142`（端口对象：`resolveClient` 每次现取 `ctx.get('connection')`）；`:145-163`（座位软注册与失败只 warn） |
| C10 `locales.ts` | `src/client/locales.ts:31`（`NS = 'sessionToolToggle'`）；`:50-53`（`section.*` 四段）；`:123-125`（`notice.*` 三码） |
| C11 `panel.module.css` | `src/client/panel.module.css`（357 行，`section` / `chips` / `badge` 等类名被 `ToolPanelAction.tsx` 引用，新分区复用同类名即可，无新样式管线） |
| P1 `package.json` | `plugins/session-tool-toggle/package.json` 的 `dsh.client.inject` 五项与 devDeps（`@deepseek-ai/dsh-client-ui-slots: 0.2.1-rc.5` 已装，sidebar 未装 → 本变更补） |
| P2 `build.mjs` | `build.mjs:35-42`（client externals 五项）、`:113`（host 只 external `node:*`） |
| P3 `cordis.patch.yml` | `cordis.patch.yml:15-17`（裸包名 insert 行） |
| T18 `bundle.test.ts` | `test/bundle.test.ts:43-56`（`CLIENT_REQUIRES` 与 `INLINED_MARKERS` 两个白名单） |
| 上游技能注册表 | `dsh-skill/lib/types/index.d.ts:249-257`（`register` 的 doc：落调用方 scope 层、同层同名 first-wins、重复 warn + no-op disposer）；`dsh-skill/lib/index.js:194-214`（实现：`scopeOf(this.ctx)` → `layers.effect`）；`:465-469`（`validateRuntimeSkill`：只校验 name / 非空 description / invocation，**不校验 content**） |
| 上游技能消费方 | `dsh-tool-skill/lib/index.js:931-945`（`agent/pre-step` 读 `snapshot({cwd, scope: agent})` → `.filter(isModelInvocable)`；`:944` 的 `!snapshot.complete` 时不更新目录）；`:875`/`:878`（`isModelInvocable` 失败 → `skill "x" is not available for model invocation`）；`:909-911`（`/name` 注入走 `skills.get` + `isUserInvocable`） |
| 上游工作区/目录 | `dsh-workspace/lib/types/index.d.ts:265`（`resolveByPath` 异步且缺路径 reject）；`dsh-working-directory/lib/types/index.d.ts:64`（`get(session): string`，无 IO） |
| 上游座位面 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:57-58`（`sidebar.workspaces` 是 `single`）、`:76-77`（`sidebar.footer.action` 是 `list`）、`:128-131`（`SidebarFooterActionOwnerProps` 只有 `wide`） |
| 上游全局钩子 | `dsh-client-ui-workspace/lib/types/client/index.d.ts:10-12`（`GlobalStandardProps.useWorkspaces`）、`dsh-client-ui-slots/lib/types/index.d.ts:221-226`（`PropsRuntime` = owner + `ScopeStandardProps`，即 root 作用域组件也能拿到全局 seat） |

---

## ③ 接口与数据形状

### 3.1 地址文法 `skill:<name>`

```ts
// src/host/address.ts
export type SwitchAddress =
  | { readonly kind: 'mcp-group'; readonly server: string }
  | { readonly kind: 'mcp-tool'; readonly server: string; readonly pattern: string }
  | { readonly kind: 'tool'; readonly name: string }
  | { readonly kind: 'skill'; readonly name: string }        // 新增

export type ParseErrorCode =
  | 'empty' | 'unknown-prefix' | 'bad-server' | 'bad-tool-name'
  | 'mcp-tool-uses-tool-prefix' | 'reserved-tool' | 'protected-tool'
  | 'bad-skill-name'                                          // 新增（第 8 码）

/** 与 dsh-skill 的 SKILL_NAME 同一份规则（dsh-skill/lib/index.js:17），本仓复制常量、不 import。 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SKILL_PREFIX = 'skill:'
const SKILL_WILDCARD = '*'

export const ADDRESS_GRAMMAR =
  'mcp:<server> | mcp:<server>::<工具名或尾部 *> | tool:<工具名> | skill:<技能名>'
  + '（skill 等价于 tool:skill；skill:* 等价于整档 tool:skill）'
```

**规范形与归一表**（实现即契约，逐行单测）：

| 用户输入 | 解析结果 | 规范形 `text` | 说明 |
|---|---|---|---|
| `skill` | `{kind:'tool',name:'skill'}` | `tool:skill` | 既有别名（D3），不改 |
| `skill:*` | `{kind:'tool',name:'skill'}` | `tool:skill` | 新增：`*` 只作整档别名，**不引入 wildcard 语义**（S1） |
| `skill:openspec-propose` | `{kind:'skill',name:'openspec-propose'}` | `skill:openspec-propose` | 正常形态 |
| `skill:` / `skill:Foo` / `skill:foo_bar` / `skill:foo bar` / `skill:foo::bar` | — | — | `bad-skill-name`（全单拒绝，状态零写入） |
| `skill:foo-` / `skill:-foo` | — | — | `bad-skill-name`（kebab 文法不允许首尾 `-`） |

失败文案（简体中文、带完整文法一行，与既有六码同风格）：

```
技能名「Foo」不合法：只允许小写字母、数字与连字符（^[a-z0-9]+(?:-[a-z0-9]+)*$，如 skill:openspec-propose）；文法：<ADDRESS_GRAMMAR>
```

`matchesToolName(address, toolName)`：`address.kind === 'skill'` → 恒 `false`（技能名不是工具注册名，永不参与工具掩码）。

### 3.2 技能遮蔽计划（新建 `src/host/skills-plan.ts`）

```ts
/** 整档地址的规范形：技能遮蔽在整档关闭时必须让位（diff-matrix A8）。 */
export const SKILL_TOOL_ADDRESS = 'tool:skill'

export interface SkillsPlanInputs {
  /** 本会话关闭集（状态里的规范形文本，允许脏条目）。 */
  readonly disabled: readonly string[]
  /** 当前活技能名（模型可调用的技能清单；stub 生效后**不含**被遮蔽的名字）。 */
  readonly installed: readonly string[]
  /** 整档 `tool:skill` 是否在关闭集里。 */
  readonly toolSkillClosed: boolean
}

export interface SkillsPlan {
  /** 需要注册影子 stub 的技能名（排序去重；整档关闭时为空 —— 此时目录本就停发）。 */
  readonly shadowNames: readonly string[]
  /** 关闭集里的全部技能地址（规范形，排序）。 */
  readonly closedTexts: readonly string[]
  /** 每条技能地址是否命中活技能（0 或 1；0 也保留键，与 planMask 同纪律）。 */
  readonly matched: ReadonlyMap<string, number>
  /** 命中 0 的地址（意图已记录、当前无该技能）。 */
  readonly intentOnly: readonly string[]
}

export function planSkills(inputs: SkillsPlanInputs): SkillsPlan
```

语义：`shadowNames = toolSkillClosed ? [] : sortedUnique(closedSkillNames)`；`matched` 逐地址 0/1；`intentOnly` 取 0 者。**不抛错**：脏条目静默跳过（与 `mask.ts:171-173` 同一容忍纪律）。

### 3.3 每 agent 技能分面（`src/host/session-layer.ts` + `types.ts`）

```ts
/** 宿主 SkillRegistry 的窄面（只声明本插件调用的三个方法）。 */
export interface SkillServiceLike {
  register(skill: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly source: string
    readonly provider?: string
    readonly path?: string
    readonly whenToUse?: string
    readonly resourceBase?: unknown
    readonly metadata?: Readonly<Record<string, unknown>>
    readonly invocation?: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  }): () => void
  get(
    name: string,
    options?: { readonly cwd?: string; readonly scope?: object; readonly signal?: AbortSignal },
  ): Promise<SkillDefinitionLike | undefined>
  snapshot(options?: {
    readonly cwd?: string
    readonly scope?: object
  }): Promise<{ readonly skills: readonly SkillSummaryLike[]; readonly complete: boolean }>
}

/** agent 子 fiber 交付的服务面（**必须**从子 fiber 的 ctx 访问，见 D-3）。 */
export interface SkillScopeHandle { readonly skills: SkillServiceLike }

export interface SkillDefinitionLike extends SkillSummaryLike { readonly content: string }
export interface SkillSummaryLike {
  readonly name: string
  readonly description: string
  readonly invocation: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  readonly source?: string
  readonly provider?: string
  readonly path?: string
  readonly whenToUse?: string
  readonly resourceBase?: unknown
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** `LayerHandle` 新增的两个方法。 */
export interface SkillLayerSnapshot {
  /** `skills` 服务是否可用（false = 只记意图，面板给 `skills-unavailable`）。 */
  readonly available: boolean
  /** 已注册影子 stub 的技能名（排序）。 */
  readonly shadowed: readonly string[]
  /** 该 agent 视角下**模型可调用**且未被本插件遮蔽的技能（面板技能行来源）。 */
  readonly visible: readonly { readonly name: string; readonly description: string }[]
}

export interface LayerHandle {
  setState(state: SessionToolState): void
  snapshot(): LayerSnapshot
  visibleNames(): readonly string[]
  skills(): SkillLayerSnapshot                       // 新增，必填
  skillsSettled(): Promise<void>                     // 新增，必填（无在途收敛时立即 resolve）
}
```

`SessionLayer` 内部新增字段（不导出）：

```ts
/** 影子前定义缓存：name → 真实定义（dispose 后丢弃；用于 stub 复制与面板描述）。 */
private readonly skillBodies = new Map<string, SkillDefinitionLike>()
/** 已注册 stub：name → disposer。 */
private readonly shadows = new Map<string, () => void>()
/** 影子分面的收敛代数（防旧一轮覆盖新一轮）。 */
private skillGeneration = 0
/** 在途收敛（skillsSettled 等它）。 */
private skillTask: Promise<void> = Promise.resolve()
```

核心私有方法签名与顺序（不可交换）：

```ts
/** 装技能分面：先同步取一次（常态已就绪），再装软 fiber（晚到补挂）。 */
private async mountSkills(agent: AgentLike): Promise<void>

/** 一轮技能收敛：算计划 → 撤多余的 stub（同步）→ 补缺的 stub（异步取正文，有界）。 */
private reconcileSkills(): Promise<void>

/** 取一个技能的真实定义（带 AbortSignal 超时），失败返回 undefined。 */
private captureSkill(name: string): Promise<SkillDefinitionLike | undefined>

/** 注册一个 stub；注册后回读校验（同层先到先得，F8）。 */
private shadowSkill(definition: SkillDefinitionLike): boolean

/** 撤掉一个 stub（幂等、容错）。 */
private liftShadow(name: string): void
```

**stub 的精确形状**（D-2）：

```ts
{
  ...realDefinition,                       // name/description/content/path/whenToUse/resourceBase/metadata/source/provider 全量复制
  invocation: { modelInvocable: false, userInvocable: true },   // 唯一被改的字段
}
```

**收敛代数守卫**：

```ts
private async reconcileSkills(): Promise<void> {
  const generation = ++this.skillGeneration
  const plan = planSkills({
    disabled: this.state.disabled,
    installed: this.skillNames(),           // 最近一次 snapshot 的**原始**名字集（含已遮蔽条目；不读服务，读缓存）
    toolSkillClosed: this.state.disabled.includes(SKILL_TOOL_ADDRESS),
  })
  // ① 撤：同步、立即，且不受 generation 影响（状态已变为「开」，必须马上恢复）
  for (const name of [...this.shadows.keys()]) {
    if (!plan.shadowNames.includes(name)) this.liftShadow(name)
  }
  // ② 补：异步取正文
  for (const name of plan.shadowNames) {
    if (this.shadows.has(name)) continue
    const definition = this.skillBodies.get(name) ?? await this.captureSkill(name)
    if (generation !== this.skillGeneration) return          // 期间状态又变了，本轮作废
    if (definition === undefined) continue                    // 未安装：留作意图
    if (!this.shadowSkill(definition)) { /* 记 skill-shadow-failed */ }
  }
}
```

`captureSkill` 的关键约束：**必须**用 `this.skillHandle`（agent 子 fiber 的 `scope` 句柄）现取 `scope.skills.get(...)`，并把 `scope: this.agent` 与 `signal: AbortSignal.timeout(SKILL_CAPTURE_TIMEOUT_MS=2000)` 一起传（`SKILL_CAPTURE_TIMEOUT_MS` 常量上限，保证 `skillsSettled()` 有界）。

**回读校验**（F8 / `skill-shadow-failed`）：注册后下一次 `skills()` 读数里，该 name 必须满足「在 `shadowed` 集合里」；由于 `shadowed` 是本层自己的账，真正的校验放在 `skills/change` 之后的清单刷新：若 `snapshot({scope:agent})` 里该 name 的 `provider` 与 `description` 与缓存定义**都不相同**且 stub 未记账 → 判定被他人先占。实现落点：`shadowSkill()` 注册后立刻读一次 `this.skills()`（内部缓存）；`skills()` 的 `visible` 由最近一次 `snapshot` 结果过滤 `shadowed` 得到，因此「注册成功」的直接证据是 `shadows.has(name)`；「未胜出」的证据是 `snapshot` 里该 name 的 `provider` 不等于注册时的 provider → 记 `skill-shadow-failed` 并在层里标记 `failed: Set<name>`，供面板禁用该行。

### 3.4 工作区档文件（新建 `src/host/workspaces.ts`）

```ts
import type { DefaultsIo, SessionToolState, SpecLog } from './types.ts'

/** 复用默认档的文件 IO 端口（同一原子写实现），语义命名不改以免牵动 defaults.ts。 */
export type WorkspaceIo = DefaultsIo

export const WORKSPACES_FILE_NAME = 'workspaces.json'
export const WORKSPACES_VERSION = 1
export const MAX_WORKSPACE_ENTRIES = 256
export const MAX_WORKSPACE_KEY_LENGTH = 4096

export interface WorkspaceDefaultsEntry {
  /** 该工作区新会话的初始关闭集（规范形文本，排序去重）。 */
  readonly disabled: readonly string[]
}

export interface WorkspaceDefaultsFile {
  readonly version: 1
  /** 键 = 工作区规范绝对路径（realpath）；值 = 该工作区的默认关闭集。 */
  readonly workspaces: Readonly<Record<string, WorkspaceDefaultsEntry>>
}

export const EMPTY_WORKSPACES: WorkspaceDefaultsFile = Object.freeze({
  version: 1,
  workspaces: Object.freeze({}),
})

export function workspacesPath(configured?: string): string
export async function readWorkspaces(path: string, io: WorkspaceIo, log: SpecLog): Promise<WorkspaceDefaultsFile>
export async function writeWorkspaces(path: string, file: WorkspaceDefaultsFile, io: WorkspaceIo): Promise<void>
export function disabledOf(file: WorkspaceDefaultsFile, key: string): readonly string[]
/** 新会话初始关闭集 = 用户档 ∪ 工作区档（排序去重，纯函数，供 index.ts 播种与单测）。 */
export function mergeSeed(user: readonly string[], workspace: readonly string[]): readonly string[]
export function withEntry(
  file: WorkspaceDefaultsFile,
  key: string,
  disabled: readonly string[],
  log: SpecLog,
): WorkspaceDefaultsFile
```

`workspaces.json` 落盘形状（2 空格缩进 + 结尾换行，键按字典序稳定排序，保证「同内容同字节」）：

```json
{
  "version": 1,
  "workspaces": {
    "/home/docker/develop/person/dsh-plugins": {
      "disabled": ["mcp:yunxiao", "skill:openspec-propose"]
    }
  }
}
```

**降级纪律**（与 `defaults.ts:106-162` 同构，逐级独立）：

| 情况 | 结果 | 诊断 |
|---|---|---|
| 文件不存在（`ENOENT`） | `EMPTY_WORKSPACES` | 无 warn（首次使用是常态） |
| 读失败（非 ENOENT） | `EMPTY_WORKSPACES` | 1 条 warn |
| 非法 JSON / 顶层非对象 / `version !== 1` / `workspaces` 非对象 | `EMPTY_WORKSPACES` | 1 条 warn |
| 某条目值非对象或 `disabled` 非数组 | 丢该条 | 汇总 1 条 warn |
| 键不是绝对路径 / 超长 / 条目数超 `MAX_WORKSPACE_ENTRIES` | 丢该条（超条目数丢多余项） | 汇总 1 条 warn |
| `disabled` 某条不是字符串或文法不合法 | 丢该条（其余保留并归一） | 汇总 1 条 warn |

**写纪律**：`writeWorkspaces` 只做「排序去重 + 稳定序列化」，**不**静默改写条目（与 `defaults.ts:181-188` 同一取舍）；写失败**原样抛**，由 `updateWorkspaceDefaults` 转成 `workspace-unwritable`。并发 = 后写者胜（读-改-写在 `updateWorkspaceDefaults` 内一次完成，窗口最小化；不引入锁）。

### 3.5 工作区归属（新建 `src/host/attribution.ts`）

```ts
export interface RealpathPort {
  /** 规范化一个路径（宿主注入 `node:fs/promises.realpath`）。 */
  realpath(path: string): Promise<string>
}

export interface WorkspaceRootsPort {
  /** 已登记工作区（`Workspace.path` 已是 realpath；registry 缺席时返回空数组）。 */
  registered(): readonly { readonly path: string; readonly title: string }[]
}

export interface WorkspaceAttribution {
  /** 写入 `workspaces.json` 的键：规范绝对路径。 */
  readonly key: string
  /** 该键是否由 `workspaceRegistry` 登记（false = 未登记目录，键来自 cwd 的 realpath）。 */
  readonly registered: boolean
  /** 已登记时的显示标题（面板/footer 下拉用）。 */
  readonly title?: string
}

/**
 * 把会话 cwd 归到一个工作区键。
 * @returns 归属结果；cwd 缺失或 realpath 失败（目录已删）时 undefined（fail-closed）。
 */
export async function resolveWorkspaceAttribution(
  cwd: string | undefined,
  ports: {
    readonly roots: WorkspaceRootsPort
    readonly realpath: RealpathPort
    readonly log: SpecLog
  },
): Promise<WorkspaceAttribution | undefined>
```

算法（顺序即语义，与 `project-mcp/src/host/attribution.ts:83-96` 同构）：

1. `cwd` 为空 → `undefined`；
2. 逐级 `realpath(path.resolve(current))`，失败视为「这一级不存在」继续上溯（**不**把失败当错误抛出）；
3. 每一级与 `roots.registered()` 的 `path` 精确比较（`Workspace.path` 已是 realpath，不再二次 realpath）；
4. 最近命中 → `{key: workspace.path, registered: true, title: workspace.title}`；
5. 上溯到 `/` 仍无命中 → `{key: <canonical cwd>, registered: false}`（既有目录仍可承载工作区档：spec「无法归属时只用用户级默认档」指 realpath 失败，不是「未登记」）；
6. `realpath` 全程失败（目录已删）→ `undefined` + 1 条 warn。

### 3.6 契约（`src/contract.ts`）— 端点、字段、码表

#### 3.6.1 端点表（4 → 5）

```ts
export const WORKSPACE_ENDPOINT = 'workspace'
export const ENDPOINTS = [
  'panel', 'toggle', 'reset', 'defaults', 'workspace',   // 顺序即文档/诊断顺序
] as const
export const WORKSPACE_ACTIONS = ['read', 'set', 'off', 'on', 'reset'] as const
export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number]
/** 工作区路径上限（与 ADDRESS_MAX_LENGTH 同级的线上护栏）。 */
export const MAX_WORKSPACE_PATH_LENGTH = 4096
```

#### 3.6.2 `workspace` 端点请求（两种形态，strict）

```ts
export interface WorkspaceRequest {
  /** 形态 A：按会话寻址（面板分区、footer 默认项）。 */
  readonly sessionId?: string
  /** 形态 B：按工作区规范路径寻址（footer 下拉切换、未来的上游座位）。 */
  readonly workspacePath?: string
  /** 动作；缺省 = `read`。 */
  readonly action?: WorkspaceAction
  /** `set`/`off`/`on` 必需（1–MAX_ADDRESSES 条），`read`/`reset` 禁止出现。 */
  readonly addresses?: readonly string[]
}
```

parser 规则（`parseWorkspaceRequest`，进 `REQUEST_PARSERS`）：

| 规则 | 违反时 |
|---|---|
| 恰好出现 `sessionId` / `workspacePath` 之一 | `bad-request`（`… 必须且只能出现 sessionId 或 workspacePath 之一`） |
| `sessionId` 1–255 字符；`workspacePath` 1–`MAX_WORKSPACE_PATH_LENGTH` 字符且以 `/` 开头 | `bad-request` |
| `action` ∈ `WORKSPACE_ACTIONS`（缺省 `read`） | `bad-request` |
| `action ∈ {set,off,on}` → `addresses` 必现且 1–64 条 | `bad-request` |
| `action ∈ {read,reset}` → `addresses` 不得出现 | `bad-request` |

#### 3.6.3 `workspace` 端点响应

```ts
/** footer 下拉的一项。 */
export interface WorkspaceChoice {
  /** 工作区规范路径（= 写入的键）。 */
  readonly key: string
  /** 显示标题（registry 有则用它，否则用路径最后一段）。 */
  readonly title: string
}

/** 面板快照与 `workspace` 端点共用的工作区档视图。 */
export interface WorkspaceView {
  /** 工作区键（规范绝对路径）。 */
  readonly key: string
  /** 显示标题（未登记时缺省）。 */
  readonly title?: string
  /** 是否由 workspaceRegistry 登记。 */
  readonly registered: boolean
  /** 该工作区当前的默认关闭集（已归一、排序）。 */
  readonly disabled: readonly string[]
  /** 工作区档文件绝对路径（面板展示，便于手编）。 */
  readonly path: string
  /** 文件可读（false = 不存在，按空档处理）。 */
  readonly readable: boolean
  /** 文件存在但损坏 / 半写（已降级空档）。 */
  readonly corrupt: boolean
}

export interface WorkspaceValue {
  /** 目标工作区视图；`null` = cwd 无法归属 / 路径未登记。 */
  readonly workspace: WorkspaceView | null
  /** 下拉可选项（已登记工作区，按标题+路径排序）。 */
  readonly choices: readonly WorkspaceChoice[]
  /** 本次实际写入的规范形地址（`read` 时为空数组）。 */
  readonly changed: readonly string[]
}
```

#### 3.6.4 面板快照新增两字段

```ts
export interface SkillView {
  /** kebab-case 技能名（= `skill:<name>` 的 `<name>`）。 */
  readonly name: string
  /** 描述（≤ 160 字符；已关且无缓存时为空串）。 */
  readonly description: string
  /** 在关闭集里（意图）。 */
  readonly disabled: boolean
  /** 本会话已注册影子 stub（**实际生效**；与 `disabled` 构成两态区分）。 */
  readonly shadowed: boolean
}

export interface PanelSnapshot {
  // …既有 10 字段不动…
  /** 技能行（按名字升序；只含模型可调用技能 ∪ 当前已遮蔽名字）。 */
  readonly skills: readonly SkillView[]
  /** 本会话所属工作区的默认档视图；`null` = cwd 无法归属 / 无 registry。 */
  readonly workspace: WorkspaceView | null
}
```

白名单同步：`PANEL_SNAPSHOT_KEYS` 加 `'skills'`、`'workspace'`（`contract.ts:814-825`）。

#### 3.6.5 `Mutation` 扩一字段

```ts
export interface Mutation {
  readonly applied: readonly MutationApplied[]
  readonly hiddenTools: number
  /** 新增：本次影子 stub 集合的变化量（可为负；0 = 技能可见性没变）。 */
  readonly hiddenSkills: number
  readonly visibleBefore: number
  readonly visibleAfter: number
  /** 语义扩为「工具 schema 或技能目录任一变化 → true」。 */
  readonly kvRebuild: boolean
  readonly notices: readonly NoticeView[]
}
```

`MUTATION_KEYS`（`contract.ts:831`）加 `'hiddenSkills'`。

#### 3.6.6 码表

```ts
export const HOST_FAILURE_CODES = [
  'bad-request', 'bad-address', 'protected', 'reserved', 'session-not-live',
  'defaults-unwritable', 'internal',
  'workspace-unresolved',   // 新增：会话 cwd 无法归属 / 路径未登记或不可 realpath
  'workspace-unwritable',   // 新增：workspaces.json 写入失败（details {path, reason}）
] as const   // 7 → 9

export const NOTICE_CODES = [
  'persistence-degraded', 'defaults-corrupt', 'session-subagent',
  'skills-unavailable',     // 新增：宿主无 skills 服务，技能开关只记意图
  'skill-shadow-failed',    // 新增：同层同名 stub 未胜出，本会话关不掉该技能
] as const   // 3 → 5

/** 新增 details 形状。 */
export interface WorkspaceUnresolvedDetails {
  /** 失败主体：会话 id 或被拒绝的路径原文（面板按此渲染占位符）。 */
  readonly subject: string
}
```

`FailureDetails` 联合加 `WorkspaceUnresolvedDetails`；`parseFailureDetails` 同步（`contract.ts:1192-1224`）。

失败码与场景对照：

| 码 | 触发 | details |
|---|---|---|
| `workspace-unresolved` | `{sessionId}` 请求的会话 cwd 不可 realpath；`{workspacePath}` 请求的路径非绝对 / realpath 失败 / **未登记** | `{subject: <sessionId 或路径原文>}` |
| `workspace-unwritable` | `writeWorkspaces` 抛错（权限 / 磁盘 / 目录不可建） | `{path, reason}`（复用 `DefaultsUnwritableDetails`） |
| `bad-address` | `skill:` 文法错误（`parseCode: 'bad-skill-name'`） | `{address, parseCode}` |
| `session-not-live` | 既有三步校验 | `{sessionId}` |

#### 3.6.7 通道

- 通道名不变：`CHANNEL = '/session-tool-toggle'`（`contract.ts:28`）。
- 端点 5 个，`REQUEST_PARSERS` 与 `parse*Value` 一一对应；两端**必须**同版本（strict），升级后重启 web profile。

### 3.7 宿主内核接口（`control.ts` / `index.ts`）

```ts
// types.ts
export interface Config {
  storage?: 'auto' | 'memory'
  protectedTools?: string[]
  defaultsFile?: string
  hostModuleBase?: string
  /** 覆盖工作区档路径（绝对路径）。 */
  workspacesFile?: string                    // 新增
}

export interface ControlDeps {
  // …既有 8 项…
  /** 工作区档文件绝对路径。 */
  readonly workspacesPath: string
  /** 工作区档读写端口（与 `defaultsIo` 同一实例）。 */
  readonly workspacesIo: DefaultsIo
  /** 会话 → 工作区归属（realpath + registry；fail-closed 返回 undefined）。 */
  readonly workspaceOf: (session: SessionLike) => Promise<WorkspaceAttribution | undefined>
  /** footer 下拉的可选项（registry.list() 的投影；registry 缺席时空数组）。 */
  readonly workspaceChoices: () => readonly WorkspaceChoice[]
}
```

```ts
// control.ts
export type WorkspaceTarget =
  | { readonly kind: 'session'; readonly session: SessionLike }
  | { readonly kind: 'path'; readonly path: string }

export interface WorkspaceDefaultsReport {
  readonly mode: WorkspaceAction
  readonly key: string
  readonly path: string
  readonly before: WorkspaceDefaultsFile
  readonly after: WorkspaceDefaultsFile
  readonly added: readonly string[]
  readonly removed: readonly string[]
}

/**
 * 写工作区档（`/tools workspace …` 与 `workspace` 端点的唯一写入路径）。
 * @throws `writeWorkspaces` 的原始错误（与 `updateDefaults` 同一纪律）。
 */
export async function updateWorkspaceDefaults(
  deps: ControlDeps,
  target: WorkspaceTarget,
  mode: WorkspaceAction,
  texts: readonly string[],
): Promise<ControlOutcome<WorkspaceDefaultsReport>>
```

`WorkspaceTarget` 的解析（`resolveWorkspaceTarget`，control 内私有）：

| 形态 | 解析 | 失败 |
|---|---|---|
| `{sessionId}` | `deps.workspaceOf(session)`；`undefined` → | `workspace-unresolved{subject: sessionId}` |
| `{workspacePath}` | 必须 `path.isAbsolute` 且 `realpath` 成功且 `deps.workspaceChoices()` 里存在该 key | `workspace-unresolved{subject: path}` |

`PanelReading` 扩面（`/tools status` 与面板共用）：

```ts
export interface PanelReading {
  // …既有字段…
  readonly skills: readonly SkillView[]
  readonly skillsAvailable: boolean
  readonly workspace: WorkspaceView | null
}
```

`ToggleReport` / `ResetReport` 扩面：`hiddenSkills: number`（= `afterSkills.length - beforeSkills.length`，可为负）；`schemaChanged` = `!sameTexts(before.deny, after.deny) || beforeSkips.length !== afterSkips.length`（影子集合长度差即「技能目录变了」）。

### 3.8 命令面（`commands.ts`）

```
/tools status                                   # 既有 + 两新段
/tools off|on <地址…>                            # 地址文法扩 skill:<name>
/tools reset                                    # 回到合并快照
/tools default [off|on|set|reset] <地址…>        # 用户级默认档（不变）
/tools workspace [status]                       # 新增：本会话所属工作区的默认档读数
/tools workspace off|on|set|reset <地址…>        # 新增：写本会话所属工作区的默认档
```

`TOOLS_GRAMMAR` 追加 `| workspace [status|off|on|set|reset] <地址…>`。命令面**只**作用「本会话所属工作区」（不提供 `--path` 形态：终端里手打绝对路径没有价值，Web 端有下拉）。

`/tools status` 新增两段（`statusText`，`commands.ts:441-479`）：

```
技能：可见 21 / 已关 3（生效 2，意图 1）
工作区默认档（/home/docker/develop/person/dsh-plugins，已登记）：3 项 · /home/docker/.dsh/session-tool-toggle/workspaces.json
```

`closedStateText`（`commands.ts:480-490`）增 `kind === 'skill'` 分支：`skill:<name>（已关闭，模型不可见；/name 手动调用保留）`。

### 3.9 播种与合并（`index.ts`）

```ts
/** 新会话初始关闭集 = 用户档 ∪ 工作区档（并集，排序去重）。 */
async function readOrSeed(session: SessionLike): Promise<SessionToolState> {
  const current = store.read(session)
  if (current.seeded) return current

  const defaults = await readDefaults(defaultsFile, defaultsIo, log)
  const workspaceFile = await readWorkspaces(workspacesFile, workspacesIo, log)
  const attribution = await workspaceOf(session)
  const workspaceTexts = attribution === undefined
    ? EMPTY_DEFAULTS.disabled                                     // fail-closed：只用用户档
    : disabledOf(workspaceFile, attribution.key)

  return seed(session, current, sortUnique([...defaults.disabled, ...workspaceTexts]))
}
```

`seed`（`index.ts:315-330`）**一字不改**：`snapshot` 与 `disabled` 仍同时置位。`mount`（`:347-362`）顺序不变：`ensureStore` → `readOrSeed` → `new SessionLayer` → `attach`（技能 stub 在 `attach` 内收敛，故首轮目录已生效）。

`workspaceOf` 的装配实现（`index.ts`）：

```ts
let registry: WorkspaceRegistryLike | undefined      // ctx.inject(['workspaceRegistry'])
let workingDirectory: WorkingDirectoryLike | undefined  // ctx.inject(['workingDirectory'])

const workspaceOf = async (session: SessionLike): Promise<WorkspaceAttribution | undefined> => {
  const cwd = readCwd(session)                        // workingDirectory?.get(session as never) ?? session.header.cwd
  return await resolveWorkspaceAttribution(cwd, {
    roots: { registered: () => registry?.list().map((w) => ({ path: w.path, title: w.title })) ?? [] },
    realpath: (path) => realpath(path),
    log,
  })
}
```

`readCwd` 的两次尝试各自 try/catch：`workingDirectory.get` 对「非宿主 Session」会拒绝（结构收窄），失败回退 `session.header.cwd`。

### 3.10 浏览器半接口

```ts
// panel-client.ts
export interface PanelClient {
  panel(sessionId: string): Promise<PanelSnapshot>
  toggle(sessionId: string, on: boolean, addresses: readonly string[]): Promise<ToggleValue>
  reset(sessionId: string): Promise<ResetValue>
  defaults(action: DefaultsAction, addresses?: readonly string[]): Promise<DefaultsValue>
  /** 新增。 */
  workspace(request: WorkspaceRequest): Promise<WorkspaceValue>
}
```

```ts
// SkillPanel.tsx
export interface SkillPanelProps {
  readonly skills: readonly SkillView[]
  readonly unavailable: boolean
  /** 整档 `tool:skill` 已关：整块置灰 + 提示（DQ3）。 */
  readonly blocked: boolean
  readonly pending: ReadonlySet<string>       // 地址键（`skill:<name>`）
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  readonly t: Translate
}
```

```ts
// WorkspaceDefaultsEditor.tsx
export interface WorkspaceDefaultsEditorProps {
  readonly workspace: WorkspaceView | null
  readonly choices: readonly WorkspaceChoice[]
  readonly variant: 'section' | 'dialog'
  readonly saving: boolean
  readonly saved: boolean
  readonly failure?: PanelFailure
  /** 下拉切换目标工作区（footer/dialog 用；section 形态不渲染下拉）。 */
  readonly onSelect: (key: string) => void
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  readonly onRefresh: () => void
  readonly t: Translate
}
```

```ts
// WorkspaceEntry.tsx
export interface WorkspaceFooterActionProps {
  /** footer 座位只给 `wide`（`SidebarFooterActionOwnerProps`）。 */
  readonly wide?: boolean
  /** 每次动作现取（connection 可能晚于 apply 就绪，与头部入口同一纪律）。 */
  readonly resolveClient: () => PanelClient | undefined
  readonly currentSessionId: () => string | undefined
  readonly t: Translate
}

/** 两个入口共用的状态机（读/写/失败/在途）。 */
export function useWorkspaceDefaults(options: {
  readonly resolveClient: () => PanelClient | undefined
  readonly initialTarget: () => WorkspaceRequest
}): {
  readonly phase: 'idle' | 'loading' | 'ready' | 'failed'
  readonly value?: WorkspaceValue
  readonly error?: PanelError
  readonly saving: boolean
  readonly saved: boolean
  readonly read: () => Promise<void>
  readonly update: (action: WorkspaceAction, addresses?: readonly string[]) => Promise<void>
  readonly select: (key: string) => void
}
```

```ts
// seats.ts
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const HEADER_SEAT = 'conversation.session.header.utilities'
export const FOOTER_SEAT = 'sidebar.footer.action'
export const FOOTER_ID = 'session-tool-toggle-workspace-defaults'
export const FOOTER_ORDER = 60
export const PANEL_ID = 'session-tool-toggle-panel'
export const PANEL_ORDER = 20
// DQ1：上游工作区行菜单座位（sidebar.workspaces.workspace.menu.item）本期不实现，
// 等上游声明后由后续变更在本文件加常量 + 增补 + 软注册。
```

### 3.11 配置键与文件位置

| 键 | 默认 | 说明 |
|---|---|---|
| `storage` | `'auto'` | 不变 |
| `protectedTools` | `[]` | 不变（技能**没有**保护基线） |
| `defaultsFile` | `$DSH_HOME/session-tool-toggle/defaults.json` | 不变 |
| `hostModuleBase` | 省略 | 不变 |
| `workspacesFile` | `$DSH_HOME/session-tool-toggle/workspaces.json` | 新增；绝对路径覆盖（相对路径按未设处理并 warn，与 `readPathOption` 同纪律） |

写盘纪律沿用 `defaults.ts`：`mode 0o600`、`dirMode 0o700`、随机后缀临时文件 + rename（`createNodeDefaultsIo`）。

---

## ④ 决策记录

> 每条：决策 / 被否方案 / 理由 / 反例（≥1 条落在具体代码或具体场景上）。

### D-1 技能遮蔽仍走「agent 作用域同名 runtime stub」

- **决策**：在 `agent.ctx` 的 `['skills']` 子 fiber 内 `skills.register(克隆定义 + invocation{false,true})`。
- **被否**：① 全局层注册（`ctx.skills.register` 从插件根 ctx）；② 改 SKILL.md 的 `disable-model-invocation`；③ 替换 `dsh-tool-skill` 行自实现目录；④ 替换 `dsh-skill` 注册表子类过滤。
- **理由**：注册表按 scope 分层、**最近层同名直接胜出**（`dsh-skill/lib/types/index.d.ts:249-257`）；只有 agent 层能既压过 global 层的 filesystem provider，又只影响本会话。
- **反例**：全局层注册时 `dsh-skill` 的 runtime rank 是 250，而 live profile 的三个 preset 里各挂一份 `skill-filesystem`（rank 100/200/300/400/500 体系），全局 stub 压不过 project 层技能；更糟的是它会把**所有会话**的同名技能一起关掉。

### D-2 stub 复制真实定义全量字段，只改 `invocation`

- **决策**：`{...realDefinition, invocation:{modelInvocable:false, userInvocable:true}}`（含 `content`/`description`/`path`/`resourceBase`/`whenToUse`/`metadata`/`source`/`provider`）。
- **被否**：空占位 `description` + `content: ''`（line-a 的初版提案）。
- **理由**：用户已拍板「只停模型可见性、保留 `/name`」（diff-matrix A4/§5.1.1），而 `/name` 注入走 `skills.get` 取正文（`dsh-tool-skill/lib/index.js:909-911`）+ `renderSkillContent` 带 `provider` 属性——空正文会让手动调用拿到空壳，改 `provider` 会让提示词里的 `<skill_content provider="…">` 失真。
- **反例**：若 stub 正文为空，用户在会话里打 `/openspec-propose` 会注入一个只有标题、没有内容的 `<skill_content>`，模型据此执行必然偏离技能真实指令，且没有任何报错暴露。

### D-3 每次都从 **agent 子 fiber 的 scope 句柄**现取 `scope.skills.xxx(...)`

- **决策**：`mountSkills` 把 `scope`（`agent.ctx.inject(['skills'], cb)` 的回调参数）存进 `this.skillScope`，此后每次调用写 `this.skillScope.skills.register(...)` / `.get(...)` / `.snapshot(...)`；**不**缓存 `ctx.get('skills')` 的返回值，也**不**在插件根 ctx 上调用。
- **被否**：构造期 `const skills = ctx.get('skills')` 存成字段后长期调用。
- **理由**：Cordis 的 service tracker 按**调用方 ctx** 解析 `this.ctx`（diff-matrix A2 已从 `cordis/lib/index.js:1742-1790` 取证；本仓 `src/client/index.ts:128-134` 就有「每次动作现取」的同款注释），`dsh-skill` 的 `register` 用 `scopeOf(this.ctx)` 决定落层（`dsh-skill/lib/index.js:194-196`）。句柄属于 agent 子 fiber，因此每次调用都落 agent 层。
- **反例**：若在插件根 ctx 上调用，`scopeOf` 得 `undefined` → 落 `layers.global`：一次 `/tools off skill:x` 会把**所有会话**里这个技能关掉，而且关掉后无法通过本会话的 `/tools on` 恢复别的会话（stub 在全局层，dispose 才是唯一恢复手段，但别的会话并不知道它被遮蔽了）。

### D-4 `setState` 保持同步；技能收敛异步但**有界**，命令面/RPC 在组装回执前 `await skillsSettled()`

- **决策**：`LayerHandle.setState(state)` 签名不变（`void`）；`LayerHandle` 新增 `skillsSettled(): Promise<void>`；`handleToggle`（`rpc.ts:243-258`）与 `runToolsCommand`（`commands.ts:243`）在 `toggleSession` 之后、组装回执之前 await 它（内部已由 `AbortSignal.timeout(2000)` 兜底，不会永久挂起）。
- **被否**：① 把 `toggleSession` 改成 `async`（波及 `commands.ts`、`rpc.ts`、`control.test.ts` 全部调用点与 12 个既有测试）；② 完全 fire-and-forget。
- **理由**：取技能正文必须走 `skills.get`（async，`SkillRegistry.get` 返回 Promise），而写状态/命令回执是同步路径；用「同步改状态 + 有界异步收敛 + 回执前 await」既保住既有同步语义，又让回执说的是**已生效**的事实。
- **反例**：fire-and-forget 时 `hiddenSkills` 只能在注册完成前统计，必然是 0；于是用户关掉 3 个技能，回执说「技能可见性无变化」，而实际上第二次 `agent/pre-step` 就少 3 条——回执撒谎比没有回执更糟。反过来把 `toggleSession` 改 async，会同时改掉 `/tools` 的同步回执时序（`control.ts:269-287` 的顺序论证整段失效）。

### D-5 `attach` 先同步取一次 `skills`，fiber 只做晚到补挂

- **决策**：`attach` 内 `const service = agent.ctx.get('skills')`；若存在 → 直接用以完成首轮收敛（`await`）；同时仍装 `agent.ctx.inject(['skills'], cb)`，`cb` 里刷新句柄并触发一轮收敛。
- **被否**：① 只靠 fiber（`inject` 的 pending effect 在服务缺席时不结算，且「何时就绪」不确定 → 首步前不保证生效）；② 无条件 `await` fiber（skills 缺席的组合里 `agent/created` 永不结算 → 会话创建被挂死）。
- **理由**：`skills` 是 web profile 的常驻服务（`0.2.1-rc.5` 的 `dsh-skill` 行常挂），常态在 agent 创建前已就绪；`ctx.get` 是同步读，能给出「现在就绪」的确定性判断。
- **反例**：若只 await fiber，一个没装 `dsh-skill` 的 headless 组合会在 `agent/created` 里永久 pending——宿主串行广播（`index.ts:387-402`）会把后续所有会话的创建一并堵死，表现为「插件装上后新会话开不出来」。

### D-6 技能清单三读：会话视图为主 + 影子前缓存 + 关闭集

- **决策**：`visible` 取自 `snapshot({cwd, scope: agent})` 过滤出 `modelInvocable` 且**未被本层遮蔽**的条目；被遮蔽条目的 `description` 取影子前缓存 `skillBodies`（注册时捕获）；关闭集里的 `skill:<name>` 即使不在活清单也出现在「关闭集」chips 与 `intentOnly`。
- **被否**：单一全局读 `ctx.skills.list({cwd})`（A 线口径）。
- **理由**：live profile 的三个 agent preset 各挂一份 `skill-filesystem`（`dsh --profile web --dump-config` 的 722/886/1275 行），全局读会漏 preset 层 provider，面板清单比真实可见集小。
- **反例**：用全局读时，某个只在 preset 里挂载的技能永远不会出现在面板里；用户按面板「全开」却发现模型目录里仍有它——面板与真实可见性分叉。

### D-7 技能行**不进** `ToolGroup`，新增顶层 `skills`

- **决策**：`PanelSnapshot.skills: SkillView[]`；`groups` 保持原样（`skill` 整档行仍在 `groups` 的 `kind:'skill'` 组里）。
- **被否**：把逐技能行塞进 `ToolGroup(kind:'skill').tools`。
- **理由**：`ToolEntry.disabled` 由 `planMask` 的 `deny` 推出（`panel.ts:237`、`:382-412`），而技能名永远不会出现在工具注册表里 → 该行会恒显示「未关闭」，或者迫使技能名进入工具 deny（`restrict` 会因未知名字抛错）。
- **反例**：把 `skill:foo` 当工具 deny 提交，`tools.restrict({deny:['foo']})` 对不存在的名字抛错（`mask.ts:91-93` 的注释即为此而写）→ 每次关技能都触发一次 I3 重推 + 一条 error 日志。

### D-8 工作区键 = 规范绝对路径（ancestor walk，registry.path 优先）

- **决策**：`resolveWorkspaceAttribution` 逐级 realpath 上溯，命中 `Workspace.path` 即取该 `path` 为键；未命中则用 canonical cwd。
- **被否**：① `WorkspaceId`（uuid）；② 工作区标题；③ 会话 cwd 原文不 realpath。
- **理由**：`Workspace.path` 本身就是 realpath（`dsh-workspace/lib/types/types.d.ts:63-71`），且删除/重加工作区后 id 会变；路径键可读可手改。
- **反例**：用 cwd 原文时，`~/proj` 与 `/home/docker/proj` 是同一个目录的两个键；用户在一条路径下配了默认档，从另一条符号链接进入的会话读到空档——「配了却没生效」且无从排查。

### D-9 `workspaces.json` 条目只存 `disabled`，不存 `updatedAt`

- **决策**：`workspaces[<key>] = {disabled: string[]}`。
- **被否**：line-a 提案的 `{disabled, updatedAt}`。
- **理由**：没有消费者（面板不展示、命令面不展示、排序不依赖）；写路径每多一个字段就多一次「无变化也改字节」的伪 diff，且 `writeWorkspaces` 会因此需要引入时钟，破坏「纯序列化」的可测性（对照 `withToggled` 刻意不读时钟的既有纪律，`state.ts:76-79`）。
- **反例**：加了 `updatedAt` 后，同一份内容两次保存会产生两份不同字节的文件；单测里「保存两次后文件字节不变」这条断言直接写不出来。

### D-10 合并语义 = 并集（引用已定结论，此处只记实现边界）

- **决策**（用户已拍板，不重开）：`snapshot = sortUnique(用户档 ∪ 工作区档)`；不引入「反开」。
- **被否**：工作区整份覆盖 / 双列（`disabled` + `enabled`）。
- **理由**：并集可交换、可去重、与既有 `sortUnique` 纪律一致；工作区档只表达「额外关闭」。
- **反例（实现边界）**：若将来允许反开，`skill:` 与 `mcp:` 的「已关但被反开」会同时出现在 `disabled` 与 `enabled` 两列，`planMask`/`planSkills` 都要先做差集再算 deny——本蓝图的 `planSkills` 签名会失效，属破坏性改动。

### D-11 `{workspacePath}` 形态必须已登记；`{sessionId}` 形态允许未登记

- **决策**：`{workspacePath}` 请求要求路径绝对 + realpath 成功 + 在 `workspaceChoices()` 里；`{sessionId}` 请求由宿主自己从 cwd 推出键，允许未登记目录（`registered:false`）。
- **被否**：两种形态都接受任意存在的绝对路径。
- **理由**：调用方给的路径必须能被宿主独立核实（registry 是唯一权威）；宿主自己推出来的路径是宿主事实，不需要外部背书。
- **反例**：若接受任意路径，任何能发 RPC 的页面都可以用 `workspacePath: '/etc'` 之类探测「这个目录是否存在 / 是否可 realpath」（失败码不同即信息泄露），并能在 `workspaces.json` 里堆任意键。

### D-12 上游工作区行菜单座位本期不实现（DQ1=C）

- **决策**：本期不写 `sidebar.workspaces.workspace.menu.item` 的软注册；`seats.ts` 只保留 `HEADER_SEAT`/`FOOTER_SEAT` 常量。后续变更（上游定名后）再加常量 + `declare module` + 软注册。
- **被否**：A 按假设名实现 + 软注册（本次不选）；B 同时注册 2–3 个候选名。
- **理由**：座位真名与 owner 形状都未定，按假设名实现的软注册永远不触发、却要为一条不可验证的分支长期维护；用户拍板等上游定名后再实现，避免无效契约面。
- **反例**：若按假设名硬写，上游最终用 `sidebar.workspaces.project.menu.item` 或 owner `{workspaceId}` 时，本仓那份 `declare module` 会与上游声明冲突（TS2345/TS2717），且错误指向一个从未真正工作的注册点。

### D-13 面板/对话框复用 ui-primitives + `panel.module.css`

- **决策**：`WorkspaceDefaultsEditor` / `WorkspaceEntry` 使用与面板相同的 `@deepseek-ai/dsh-client-ui-primitives` 与 CSS module 类名。
- **被否**：照抄 multi-root 的「注入 `<style>` + 内联样式」方案。
- **理由**：同一插件里存在两套样式管线时，宿主 token（`--dsw-*`）与深色模式的行为会在两块 UI 上分叉；本插件已是 CSS module 管线，且 `CLIENT_EXTERNALS` 已含 primitives（`build.mjs:35-42`），零新增依赖。
- **反例**：注入 `<style>` 方案在 `lib/client.js` 里是字符串常量，样式改动不会经过 `build.mjs` 的 CSS module 编译（`build.mjs` 只处理 `*.module.css`），两边类名规则一旦不同名，footer 对话框在折叠态（`wide:false`）下会出现与面板不同的间距与裁切。

### D-14 技能名文法**复制常量**，不 import `@deepseek-ai/dsh-skill`

- **决策**：`address.ts` 内写死 `SKILL_NAME` 正则并在单测里钉住。
- **被否**：`import { isSkillName } from '@deepseek-ai/dsh-skill'`。
- **理由**：`src/contract.ts` 零 import（`bundle.test.ts` 断言）、宿主产物只允许 `node:*` external（`build.mjs:113`）——从上游包 import 会让宿主产物出现 `@deepseek-ai/*` 运行时依赖，profile 侧 bare 安装直接失败。
- **反例**：一旦 import，`lib/index.js` 顶部会出现 `import { isSkillName } from "@deepseek-ai/dsh-skill"`，而该包不会被 inline 进产物；`test/bundle.test.ts` 的「host 只 import node:*」断言立刻红，且真装到 profile 时插件整行加载失败。

### D-15 技能开关维持「没有保护基线」

- **决策**：`skill:` 地址不查 `protectedNames`；`tool:skill` 整档仍可关。
- **被否**：给某些核心技能（如 `openspec-*`）加保护。
- **理由**：用户拍板「关掉只是模型看不见，`/name` 仍在」，破坏性有界；保护名单的既有语义是「自救闭环」（`address.ts:70-84`），技能不属于该类。
- **反例**：若给技能加保护，用户看到的会是「面板上有一行但点不动」，而同一插件里 `tool:skill` 却能关——同一分组内两种拒绝语义并存，无法用一句文案解释。

---

## ⑤ 逐任务组实现要点

> **组间串行、组内可并行**；单组并行度 ≤ 8。每组有可执行的出口（命令或断言），不写「已实现/工作正常」。
> 分组与 `diff-matrix` 的 T2–T10 对应关系在各组标题里注明。

### G1 — 关键 spike（1 项，串行前置；对应 T1「spike」）

- **文件**：无源码改动；临时脚本放 `openspec/changes/session-tool-toggle-skill-workspace/artifacts/`（gitignore）。
- **要点**：在隔离实例（独立 `DSH_HOME` + 独立端口 + `customSkillDirs` 指向临时目录的 2–3 个 fixture skill）上验证 5 件事：
  1. agent 子 fiber 的 `scope.skills.register(stub)` 落 agent 层且胜出（`snapshot({scope:agent})` 里该 name 的 `provider` == 注册时的 `provider`）；
  2. 下一 `agent/pre-step` 追加的目录消息不含该 name（读 `source.kind === 'skill-catalog'` 的 user 消息）；
  3. `skill` 工具直接调用返回 `skill "x" is not available for model invocation`；
  4. `/name` 手动调用仍注入**完整正文**（`<skill_content>` 内的 `content` 与磁盘 SKILL.md 一致，`provider` 属性等于真实 provider）；
  5. dispose 后全部恢复，邻会话全程不受影响。
- **出口**：artifacts 下一份 `spike-skill-shadow.md`，逐条给出「命令 + 观察到的输出片段」；5 条全绿方可进 G2，任一条红则回到 D-1 的兜底（只做整档）并上报。
- **额外断言**：`snapshot.complete === false` 的场景（provider 抖动）下目录不更新（`dsh-tool-skill/lib/index.js:944`），此时回执要提示「下一步收敛」。

### G2 — 地址文法与纯函数层（4 项并行；对应 T2「地址文法与状态」+ T3「技能计划」）

并行项（文件互不相交）：

| 项 | 文件 | 要点 |
|---|---|---|
| G2-a | `src/host/address.ts` | 第四类地址、`bad-skill-name`、`skill:*` 归一、`ADDRESS_GRAMMAR`、三条文案、`matchesToolName` 恒 false |
| G2-b | `src/host/skills-plan.ts`（新建） | `planSkills` 四输出；整档关闭 → `shadowNames` 空 |
| G2-c | `src/host/mask.ts` | `resolveAddresses` 跳过 `skill` 类；`guardReason` 同样跳过 |
| G2-d | `src/host/state.ts`（**不改代码**，只补测试） | 用 `test/state.test.ts` 断言含 `skill:` 的整值记录往返、`skill` → `tool:skill` 归一（靠 `parseAddress` 自动继承） |

- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run \
    test/address.test.ts test/skills-plan.test.ts test/mask.test.ts test/state.test.ts
  ```
  必须新增/成立的断言（示例，逐条写进测试）：
  - `expect(parseAddress('skill:openspec-propose', names)).toEqual({ok:true,address:{kind:'skill',name:'openspec-propose'},text:'skill:openspec-propose'})`
  - `expect(parseAddress('skill:*', names).text).toBe('tool:skill')`；`expect(parseAddress('skill', names).text).toBe('tool:skill')`
  - `['skill:','skill:Foo','skill:foo_bar','skill:foo bar','skill:foo-','skill:-foo'].forEach(i => expect(parseAddress(i,names)).toMatchObject({ok:false,code:'bad-skill-name'}))`
  - `expect(planMask({catalog:['skill'],scoped:['skill'],carried:[],disabled:['skill:foo']})).toEqual({deny:[],shadowServers:[],matched:new Map()})`
  - `expect(planSkills({disabled:['skill:x','skill:y','tool:skill'],installed:['x'],toolSkillClosed:true}).shadowNames).toEqual([])`

### G3 — 每 agent 技能分面（2 项并行；对应 T4「技能遮蔽层」）

| 项 | 文件 | 要点 |
|---|---|---|
| G3-a | `src/host/session-layer.ts` | `mountSkills`（同步先取 + 软 fiber）、`reconcileSkills`（代数守卫 + 先撤后补）、`captureSkill`（`AbortSignal.timeout`）、`shadowSkill`（回读校验 + `failed` 集合）、`skills()` 读数、`skillsSettled()`、`detach` 清 stub |
| G3-b | `src/host/types.ts` | `LayerHandle` 加两方法、`SkillLayerSnapshot`、`SkillServiceLike`、`NoticeCode` 加两码、`Config.workspacesFile` |

> G3-b 的接口必须**先冻结**（G3-a 依赖它）；实现上两人并行：G3-b 只交付类型块，G3-a 按签名填空。

- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/session-layer.test.ts
  ```
  必含断言（用假 `skillScope` 记录调用）：
  - 无 `skills` 服务时工具掩码仍然生效（关键回归）：`expect(layer.snapshot().deny).toEqual([...])` 且 `expect(layer.skills().available).toBe(false)`
  - 每次 `register` 的调用方 ctx 是 agent 子 fiber：假的 `scopeOf` 探针记录到 `agentScope` 身份（`expect(seenCtx).toBe(agentCtxHandle)`）
  - `setState` 同步返回后 `expect(layer.skills().shadowed).not.toContain('x')`；`await layer.skillsSettled()` 后 `expect(layer.skills().shadowed).toContain('x')`
  - 重复 `setState` 同一状态不重复注册：`expect(registerCalls).toBe(1)`
  - 整档 `tool:skill` 关闭时 `expect(registerCalls).toBe(0)` 且原 stub 被 dispose
  - 同层先到先得：假的 `register` 返回 no-op disposer 且不记账 → `expect(layer.skills().shadowed).toEqual([])` 且能从「快照 provider 不符」判出 `failed`

### G4 — 工作区数据面（3 项并行；对应 T5「工作区档模块」）

| 项 | 文件 | 要点 |
|---|---|---|
| G4-a | `src/host/workspaces.ts`（新建） | 路径/读两级降级/写原子参数/`withEntry` 稳定排序/上限常量 |
| G4-b | `src/host/attribution.ts`（新建） | realpath 上溯 + registry 精确匹配 + fail-closed |
| G4-c | `src/host/index.ts`（播种段） | `readOrSeed` 并集、`workspaceOf` 闭包、软注入 `workingDirectory`/`workspaceRegistry`、`Config.workspacesFile` |

- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run \
    test/workspaces.test.ts test/workspace-attribution.test.ts
  ```
  必含断言：
  - `expect(await readWorkspaces('/x/workspaces.json', io, log)).toBe(EMPTY_WORKSPACES)`（ENOENT / 坏 JSON / `version:2` / `workspaces:[]` 四种输入同一身份）
  - `expect(withEntry(f, '/abs/b', ['mcp:z','mcp:a'])).toEqual({version:1,workspaces:{'/abs/b':{disabled:['mcp:a','mcp:z']}}})`
  - 写：`expect(writeCalls[0]).toEqual([path, '{\n  "version": 1,\n …}\n', {mode:0o600, dirMode:0o700}])`
  - 写失败：`await expect(writeWorkspaces(p, f, ioThrows)).rejects.toThrow('EACCES')`
  - 归属：`expect(await resolveWorkspaceAttribution('/w/sub/dir', ports)).toEqual({key:'/w', registered:true, title:'W'})`；`expect(await resolveWorkspaceAttribution('/gone', ports)).toBeUndefined()`
  - 播种：`expect(seeded.snapshot).toEqual(['mcp:u','skill:s'])`（用户档 `['mcp:u']` ∪ 工作区档 `['skill:s']`），且 `expect(seeded.disabled).toEqual(seeded.snapshot)`

### G5 — 契约先行（1 项；串行闸：G2–G4 完成 → G5 → G6）

- **文件**：`src/contract.ts`（单文件，不并行）。
- **要点**：第 5 端点、`WorkspaceRequest`/`WorkspaceValue`/`WorkspaceView`/`WorkspaceChoice`/`SkillView`、`Mutation.hiddenSkills`、两个失败码 + 一个 details 形状、两个提示码、`REQUEST_PARSERS` 加项、三个白名单加键、`MAX_WORKSPACE_PATH_LENGTH`。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts
  ! grep -qE '^\s*import ' plugins/session-tool-toggle/src/contract.ts && echo 'contract: 零 import OK'
  ```
  必含断言：`parseWorkspaceRequest({sessionId:'s',workspacePath:'/w'})` → `ok:false`；`{sessionId:'s',action:'set'}` → `ok:false`（缺 addresses）；`{sessionId:'s',action:'read',addresses:['a']}` → `ok:false`；`{workspacePath:'/w'}` → `ok:true`（缺省 read）；`parsePanelSnapshot` 对未知键 `groupsX` 拒绝。

### G6 — 内核与装配接线（5 项并行；对应 T6/T7 的宿主部分）

| 项 | 文件 | 要点 |
|---|---|---|
| G6-a | `src/host/panel.ts` | 顶层 `skills`、`workspace`、关闭集全地址归一、`intentOnly` 三分、`NOTICE_ORDER` |
| G6-b | `src/host/control.ts` | `hiddenSkills`、`schemaChanged` 扩义、`PanelReading` 三字段、`updateWorkspaceDefaults` + `resolveWorkspaceTarget` |
| G6-c | `src/host/rpc.ts` | `handleWorkspace`、`dispatch` 分支、`snapshotOf` 组装、两失败码、`toggle` 前 `await skillsSettled()` |
| G6-d | `src/host/commands.ts` | `/tools workspace …`、`status` 两段、`closedStateText` skill 分支、文法行 |
| G6-e | `src/host/index.ts`（接线段） | `controlDeps` 四新字段、`rpcDeps`、技能/工作区降级日志、拆卸 |

> 依赖顺序：G6-a/b 的字段名来自 G5 已冻结的契约；G6-c/d 只消费 `ControlDeps`/`PanelReading`，可与 a/b 并行（若 a/b 字段名变动，c/d 只改一处引用）。

- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run \
    test/panel.test.ts test/control.test.ts test/rpc.test.ts test/commands.test.ts
  ```
  必含断言：
  - `panel`：`expect(snapshot.skills).toEqual([{name:'openspec-propose',description:'…',disabled:true,shadowed:true}])`；`expect(snapshot.intentOnly).toEqual(['skill:ghost'])`；`expect(snapshot.state.disabled).toContain('skill:openspec-propose')`（**这条在旧实现里会失败**：旧实现只取 `planMask.matched` 的键）
  - `control`：`expect(report.hiddenSkills).toBe(1)`；`expect(report.schemaChanged).toBe(true)`（deny 未变、影子集合变了）；`updateWorkspaceDefaults(deps, {kind:'session',session}, 'off', ['skill:x'])` 后 `expect(after.workspaces['/w'].disabled).toEqual(['skill:x'])`
  - `rpc`：`workspace` 端点 5 种 action × 两种形态；`{sessionId}` 的会话 cwd 已删 → `code:'workspace-unresolved', details:{subject:'s1'}`；`{workspacePath:'/etc'}` → `workspace-unresolved`（未登记）；写盘抛错 → `code:'workspace-unwritable', details:{path,reason}`
  - `commands`：`/tools workspace` 输出含工作区键与文件路径；`/tools workspace off skill:x` 回执含「只影响之后新建的会话」；`/tools status` 含「技能：」与「工作区默认档」

### G7 — Web 半（7 项并行；对应 T8 + T9「入口」）

| 项 | 文件 | 要点 |
|---|---|---|
| G7-a | `src/client/SkillPanel.tsx`（新建） | 逐行开关、`unavailable` 降级、`pending`/`busy` |
| G7-b | `src/client/WorkspaceDefaultsEditor.tsx`（新建） | 两形态、下拉、保存/清空/失败、预期管理文案 |
| G7-c | `src/client/WorkspaceEntry.tsx`（新建） | footer 触发 + 对话框 + `useWorkspaceDefaults`（DQ1：无菜单项形态） |
| G7-d | `src/client/current-session.ts` + `src/client/seats.ts`（新建） | 当前会话探测；header/footer 座位常量 |
| G7-e | `src/client/index.ts` | footer 实注册（注册失败只 warn）+ 类型 import |
| G7-f | `src/client/panel-client.ts` + `panel-controller.ts` | `workspace()` 方法 + parser；控制器 `WorkspaceView` 状态与动作 |
| G7-g | `src/client/locales.ts` + `panel.module.css` + `ToolPanelAction.tsx` | 文案（zh/en parity）、样式、挂载两分区 |

- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run \
    test/skill-panel.test.tsx test/workspace-editor.test.tsx \
    test/panel-controller.test.ts test/panel-client.test.ts \
    test/client-index.test.ts test/locale-parity.test.ts test/tool-panel.test.tsx
  ```
  必含断言：
  - `SkillPanel`：`skill:openspec-propose` 行渲染出开关；`disabled && shadowed` → 勾选且可点；`unavailable` → 渲染 `t('skill.unavailable')` 且无开关
  - `WorkspaceDefaultsEditor`：`variant='dialog'` 渲染下拉且 `onSelect('/w2')` 被调用；保存失败渲染 `error.workspace-unwritable`
  - `client-index`：`slots.inject` 对 `sidebar.footer.action` 被调用一次、对 `sidebar.workspaces.workspace.menu.item` 被调用一次；**座位未声明时回调不执行且不抛**；`register` 抛错时只 `logger.warn` 且 `apply` 正常返回
  - `panel-client`：`workspace({sessionId:'s',action:'read'})` 的 payload 精确等于 `{sessionId:'s',action:'read'}`（strict 端点不多带键）
  - `locale-parity`：新键 zh/en 键集完全相同

### G8 — 静态门禁 + 隔离实例冒烟 + 浏览器证据（2 项并行；对应 T8/T9 的验证面）

| 项 | 命令/动作 |
|---|---|
| G8-a 静态门禁 | 见下方命令块，全绿 |
| G8-b 冒烟 | 隔离 `DSH_HOME` + 独立端口起 web profile（fixture skills），跑 6 条断言 + chrome-devtools 截图归档 |

- **G8-a 出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle verify:all     # lint → typecheck → build → test
  pnpm dsh:check
  docker exec dsh dsh --profile web --dump-config-schema | grep -A3 'session-tool-toggle'
  ! grep -qE "^import .*@deepseek-ai" plugins/session-tool-toggle/lib/index.js && echo 'host bundle: 只 node:* OK'
  grep -q "sidebar.footer.action" plugins/session-tool-toggle/lib/client.js && echo 'client bundle: footer 座位内联 OK'
  grep -q "'workspace'" plugins/session-tool-toggle/lib/client.js && echo 'client bundle: 端点字面量内联 OK'
  ```
- **G8-b 出口**（逐条命令 + 观察值，归档 `artifacts/`）：
  1. `/tools off skill:<fixture>` → 下一 pre-step 只出现**一条**目录替换消息；`skill` 工具调用报 `not available for model invocation`；`/<fixture>` 仍注入完整正文；
  2. 一次关 3 个技能 → 仅一条替换消息；重复关同一技能 → `workspaces`/状态文件字节不变（`sha256sum` 前后相同）；
  3. `workspaces.json` 写入后面权限 `stat -c '%a %n'` = `600`/`700`；当前会话不变；同目录新建会话首步即生效；`/tools reset` 回合并快照；
  4. 手写坏 `workspaces.json` → `EMPTY_WORKSPACES` + 一条 warn（`docker logs` grep），会话照常创建；
  5. headless/无 `skills` 组合 → 插件正常装配、`/tools` 可用、面板给 `skills-unavailable`；
  6. chrome-devtools MCP：技能行开关、面板工作区分区、footer 入口对话框各一张截图；断言侧栏工作区行 `...` 菜单保持原样（DQ1：无本插件条目）且控制台无异常。

### G9 — 文档与发布（3 项并行；对应 T10/T11）

| 项 | 文件/命令 |
|---|---|
| G9-a | `plugins/session-tool-toggle/README.md`（能力、预期管理、降级矩阵、非目标改写、回滚代价、配置表） |
| G9-b | 本仓根 `README.md` + `AGENTS.md` 的插件描述 |
| G9-c | `pnpm release 1.6.0`（先 `--dry-run` 复核）、`lib/` 重建提交、profile 重装 + 重启 |

- **出口**：`pnpm release --dry-run` 打印的版本/文件清单与预期一致；`pnpm verify` 与 `pnpm dsh:check` 全绿；`docker exec dsh dsh plugin --profile web list` 显示 1.6.0；重启后 UI 冒烟第 1 条复跑通过。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（若被证伪，须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | agent 子 fiber 的 `scope` 句柄在**任意时刻**取用都绑 agent 层 | `dsh-skill/lib/index.js:194-196` + Cordis tracker（diff-matrix A2） | D-3 失效 → stub 落全局层 → 必须改为「在 fiber 回调内落一个绑定函数」的兜底形态 |
| A2 | `skills.get(name, {scope: agent})` 在注册 stub **之前**取到的是真实定义 | 注册表「最近层胜出」合并语义 | 若取到 stub（自遮蔽）→ 必须在 `snapshot` 里先读 summary、正文另寻路径（或直接放弃内容复制，退回已否方案） |
| A3 | `workspaceRegistry.list()` 是同步且 `path` 已是 realpath | `dsh-workspace/lib/types/index.d.ts:120-180`、`types/types.d.ts:63-71` | 归属需要二次 realpath → `resolveWorkspaceAttribution` 增加一次异步调用（签名不变） |
| A4 | `workingDirectory.get(session)` 对结构收窄后的 `SessionLike` 可用（必要时 try/catch 回退 `header.cwd`） | `dsh-working-directory/lib/types/index.d.ts:64` | 归属退化为只用 `header.cwd`（工作区档仍可用，但 fork/resume 的 cwd 变更不跟随） |
| A5 | footer 组件的 props 只含 `{wide}`，其余能力靠自己 `ctx.get` 与 prop 注入 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:128-131` | 若上游 footer 还要求别的 owner props，`register` 类型检查会红，只需在 `seats.ts` 的增补里补字段 |
| A6 | `dsh.client.inject` 只是加载元数据，不约束 apply 顺序 | `dsh-client-ui-workspace/lib/types/client/index.d.ts:28-34` 注释（「dsh.client.inject edges are informational … never apply sequencing」） | 若它变成硬顺序，footer 座位注册要改成 `slots.inject` 的等待式（已是等待式，故影响仅限文档） |
| A7 | 命令面只需「本会话所属工作区」，不需要 `--path` | 用户需求原文只说「工作区的配置」；Web 端有下拉 | 命令面需加 `--path <abs>` 解析与一套路径校验（复用 `resolveWorkspaceTarget`） |
| A8 | 播种期的 `skills` 捕获不会拖慢会话创建（24 个 skill 量级） | 目录条数实测；`captureSkill` 只在**关闭集里有** `skill:` 时才取正文，且并发上限 4 | 若默认档里带几十条 `skill:`，`agent/created` 会明显变慢 → 需要改为「挂载先返回、stub 后台补齐」（牺牲「首步即生效」） |
| A9 | `hiddenSkills` 取「影子集合长度差」足以表达代价 | 与 `hiddenTools` 同构（`control.ts:306`） | 若产品要求区分「新增/移除/未生效」，需要三个计数或一个明细数组（契约扩字段） |
| A10 | 面板技能行只需 `modelInvocable` 技能（user-only 技能不列） | `dsh-tool-skill` 目录只列 `modelInvocable`（`:945`） | 若用户要管 `/name` 手势 → 清单要含 user-only 技能并加 `userInvocable` 字段（契约扩字段 + 文案） |

### 6.2 未决项（不阻塞本蓝图，实施期消解）

- U1（已由 DQ1 关闭）上游工作区行菜单座位本期不实现；真名与 owner 形状留待后续变更确认。
- U2 `skills/change` 与 `agent/pre-step` 的时序：stub 注册后的目录替换消息与 `skills/change` 触发的清单刷新同一轮内是否稳定（G1 spike 第 2 条覆盖）。
- U3 面板技能描述缓存的上限：`skillBodies` 无界增长的风险（关闭集通常 < 10，但连续开关 100 次会留下 100 份正文）→ 实施时加 `MAX_CACHED_BODIES = 64` + 先进先出淘汰。
- U4 footer 对话框在折叠态（`wide:false`）的宽度与定位：`sidebar.footer.action` 只给 `wide` 布尔，折叠态需要自带浮层定位（G8-b 第 6 条截图确认）。
- U5 `workspaces.json` 的键在两台机器间共用一份 `DSH_HOME` 时不可移植（绝对路径）；这是设计使然（README 写明），不做相对路径支持。

---

## 待决问题（六字段之外）

### Q1（P2，可先按假设开工）上游工作区行菜单座位的真名与属性

- **问题**：`sidebar.workspaces.workspace.menu.item` 是假设名（`list`/`root`，owner `{workspacePath?}`），上游未声明；若上游用别的名字（如 `sidebar.workspaces.project.menu.item`）或不同的 owner（如 `{workspaceId}`），软注册永远不会触发。
- **选项**：
  - **A（推荐）** 按假设名实现，类型增补隔离在 `src/client/seats.ts`；上游发版后改一行常量 + 一段增补。
  - B 同时软注册 2–3 个候选名（命中即渲染）→ 上游若有多个同名座位会重复渲染条目。
  - C 等上游定名后再实现（本期不写该软注册）。
- **推荐**：A。
- **用户答复（阶段 2）**：**C——本期不实现上游座位软注册**，等上游定名后由后续变更实现；本蓝图已按此收敛（见 §0.1 DQ1）。
- **影响面**：只影响 `seats.ts` 一个文件与 `client-index.test.ts` 的一条断言；不影响数据面、契约与面板。

### Q2（P1，影响面板文案与契约）工作区档是否需要「来源标注」（哪些项来自用户档）

- **问题**：并集之后，用户在面板里看到工作区档有 3 项，其中 1 项与用户档重复；是否需要显示「来自用户档 / 来自工作区档」的徽标？
- **选项**：
  - **A（推荐）** 不标注：工作区档分区只显示本工作区档内容 + 一句「会话初始关闭集 = 用户级默认档 ∪ 本工作区档」。
  - B 标注：`WorkspaceView` 增 `inherited: readonly string[]`（与用户档的交集），面板给徽标。
  - C 两列对照表。
- **推荐**：**A**（v1 只加一个字段就是一次双端契约变更，收益是「解释性」；一句文案已达意）。
- **影响面**：B 需扩契约 + 面板 + 单测；C 需新的对照组件。

### Q3（P2，影响面板语义与 2 条测试）整档 `tool:skill` 关闭时，逐技能行的状态怎么显示

- **问题**：整档关闭时 `planSkills` 返回空 `shadowNames`，已关的技能行 `disabled=true` 但 `shadowed=false`；面板若不解释，用户会以为「我关了但没生效」。
- **选项**：
  - **A（推荐）** 保留逐项勾选状态、整块置灰、行内提示「技能工具已整档关闭，逐项开关暂不生效」。
  - B 整档关闭时清空/隐藏逐技能行（状态不变，只隐藏 UI）。
  - C 整档关闭时把逐项地址从 `disabled` 里移除（会**改状态**，破坏「意图保留」）。
- **推荐**：**A**（与 diff-matrix A8「整档关闭时跳过注册，面板子项禁用；重新打开后按状态恢复」逐字一致；C 会让「重新打开整档」时丢掉之前的逐项意图）。
- **影响面**：A 只加一条文案 + 一个禁用态；C 会改状态机语义与 `hiddenSkills` 计数。

### Q4（P2，影响 RPC 面）`workspace` 端点是否也支持「未登记但存在的目录」

- **问题**：`{workspacePath}` 形态当前要求已登记（D-11）；若用户想给一个尚未「添加为工作区」的目录预置默认档，只能先开会话再改。
- **选项**：
  - **A（推荐）** 保持「必须已登记」（footer 下拉本来就只列已登记项）。
  - B 允许任意 realpath 成功的目录（放宽到「存在即可」）。
  - C 新增 `action:'probe'` 只读校验但不写入。
- **推荐**：**A**（放宽会扩大 RPC 面到「任意路径探测」，见 D-11 的反例；且当前 UI 没有这个入口）。
- **影响面**：B/C 只影响 `resolveWorkspaceTarget` 与两条失败码断言；A 零改动。

---

## 附：验证映射总表（每条对应一个可执行命令或一条可断言事实）

| 需求/Scenario（`specs/dsh-session-tool-toggle/spec.md`） | 验证载体 | 具体命令或断言 |
|---|---|---|
| MODIFIED 地址文法 · skill 地址独立于工具掩码（:24） | `test/mask.test.ts` | `planMask({disabled:['skill:foo']}).deny` 为空数组 |
| MODIFIED 地址文法 · 四类地址（:7） | `test/address.test.ts` | 四条归一断言（见 G2 出口） |
| ADDED 技能级开关 · 关闭后模型目录与工具同步失效（:93） | G1 spike + `test/session-layer.test.ts` | `await layer.skillsSettled(); expect(layer.skills().shadowed).toContain('x')` |
| ADDED 技能级开关 · 用户手动调用保留（:98） | G1 spike 第 4 条 | `<skill_content>` 内正文与磁盘 SKILL.md 逐字节相同 |
| ADDED 技能级开关 · 未安装技能与降级（:103） | `test/panel.test.ts` + `test/session-layer.test.ts` | `intentOnly` 含 `skill:ghost`；无 skills 服务时 `skills().available === false` |
| ADDED 工作区级默认档 · 新会话按工作区档合并（:112） | `test/index`/`test/control.test.ts` | `expect(seeded.snapshot).toEqual(['mcp:u','skill:s'])` |
| ADDED 工作区级默认档 · 不追溯（:117） | `test/control.test.ts` | `updateWorkspaceDefaults` 后 `expect(deps.store.read(session).disabled).toEqual(before)` |
| ADDED 工作区级默认档 · 损坏文件降级（:122） | `test/workspaces.test.ts` | 四种坏输入都返回 `EMPTY_WORKSPACES`（`toBe` 身份） |
| ADDED 工作区级默认档 · 无法归属退化（:127） | `test/workspace-attribution.test.ts` | realpath 失败 → `undefined` → 播种只用用户档 |
| ADDED 工作区配置入口 · footer 可用（:136） | `test/client-index.test.ts` + G8-b 第 6 条 | `slots.inject('sidebar.footer.action')` 被调用；浏览器截图 |
| ADDED 工作区配置入口 · 面板工作区分区可用（:139） | `test/tool-panel.test.tsx` + `test/workspace-editor.test.tsx` | 分区渲染键/路径/关闭项与预期管理文案；保存后当前会话关闭集不变 |
| （DQ1=C）上游菜单入口不在本变更范围 | 无 | 不写软注册、不写断言；README 记为后续能力 |
| MODIFIED 用户级默认档 · 拍快照不追溯（:31/:38） | `test/control.test.ts` | 既有断言保留 + 播种并集断言 |
| MODIFIED Web 配置界面 · 面板切换等效命令面（:57） | `test/panel.test.ts` + `test/rpc.test.ts` | 面板快照与 `readPanel` 的同名字段逐字段相等 |
| MODIFIED Web 配置界面 · RPC 不可用降级（:72） | `test/panel-controller.test.ts` | `resolveClient()` 返回 undefined → `phase:'failed'`、`error.code:'unavailable'` |
| 契约 strict（新旧不混用） | `test/wire-contract.test.ts` | 未知键 `groupsX` → `ok:false`；`bad-response` 由 `panel-client` 合成 |
| 产物纯度 | `test/bundle.test.ts` | host 只 `import 'node:*'`；client `require` 三项；`INLINED_MARKERS` 含 `'workspace'` |

---

*本文件只写代码级蓝图，未修改仓库任何文件、未 git add/commit、未改 `openspec/`、未读取或等待其他子代理。*
