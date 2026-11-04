# Design

> 本设计逐条承接阶段 1.5 收敛留痕（`diff-matrix.md`，含用户放行/决策记录）与阶段 1.7 代码级蓝图（`code-design.md`，落档副本同目录；二者为执行期权威）。本文件只给「怎么做」；动机见 `proposal.md`，行为契约见 `specs/dsh-session-tool-toggle/spec.md`。

## Context

- 目标插件 `plugins/session-tool-toggle/` 当前 1.5.0（勘误 2026-11-04：落档时为 1.4.0，其间 v1.5.0 已发布、tag 未推送），双端 bundle（宿主半 + Web client 半），已有：会话级 `disabled` 集合（`mcp:`/`tool:` 地址）、用户级默认档 `$DSH_HOME/session-tool-toggle/defaults.json`、会话创建时拍快照且不追溯、`/tools` 命令面 + `conversation.session.header.utilities` 面板（Connection RPC 通道 `/session-tool-toggle`，4 端点）。
- 运行基线 DSH `0.2.1-rc.5`（勘误 2026-11-04 随仓库基线升级同步，落档时为 0.2.1-rc.2）；live profile 挂载全局 `dsh-skill`/`skill-filesystem`（`customSkillDirs=/home/docker/.agents/skills`，24 个 skill）与 `dsh-tool-skill`，三个 agent preset 内**各另挂一份** `skill-filesystem`；因此技能的权威可见集必须按**会话视角**（`scope: agent`）读，全局层读会漏 preset 层 provider。
- 技能子系统事实（0.2.1-rc.2 实读；勘误复验 2026-11-04：`dsh-skill`/`dsh-tool-skill`/`dsh-client-ui-skill` 三包 rc.2→rc.5 lib 逐字节一致，以下事实原样成立）：`dsh-skill` 注册表按 scope 分层、最近层同名直接胜出；`register()` 落**调用方 ctx** 的层（Cordis service tracker 按调用方 ctx 解析 `this.ctx`）；`dsh-tool-skill` 目录在 `agent/pre-step` 读 `snapshot({cwd, scope: agent})` 并过滤 `modelInvocable`，`skill` 工具对 `modelInvocable:false` 报可读拒绝，用户 `/name` 注入走 `skills.get` + `isUserInvocable`（正文必须保留）；`skills/list` Remote 用 live agent scope 过滤 `userInvocable`。
- Web 侧入口事实：工作区行 `...` 菜单在 `dsh-client-ui-workspace` 内部硬编码 `[rename, delete]`，**没有插件座位**；`sidebar.workspaces` 是 `single` 座位；0.2.1-rc.2 / 0.2.1-rc.5（当前基线）/ 0.2.2-alpha.2 均如此（`npm pack` 实测，勘误复验 rc.5 同）；0.2.2-rc.1 起上游引入 `@deepseek-ai/dsh-client-ui-context-menu` 贡献面并登记 `ContextMenuTargetMap.workspace` 目标（硬编码数组移除、内建动作改走 `ctx.contextMenus`），基线 rc.5 无此包，本变更仍走 footer 过渡入口，后续变更在基线升至 0.2.2 后接入；可用的 additive 座位是 `sidebar.footer.action`（list/root）与 `conversation.session.header.utilities`。
- 约束：上游 `@deepseek-ai/dsh*` 零修改、零 import（ADR-0002，宿主产物只允许 `node:*` external）；`src/contract.ts` 零 import、两端各内联 strict parser；状态形状保持 version 1；新服务一律软注入；`skills` 缺席/文件损坏时功能降级可观测。
- 流程事实：旧变更 `session-tool-toggle` 已归档（`openspec/specs/dsh-session-tool-toggle/spec.md` 为本变更 MODIFIED 基准）；用户已拍板「不保证回滚到不含本功能的旧版」（勘误泛化：1.4.0/1.5.0 均如此）。

## Goals / Non-Goals

**Goals（设计级）**

- F1：新增 `skill:<name>` 地址与「只停模型可见性」的每 agent 遮蔽分面，且不破坏既有工具掩码、状态与回执语义。
- F2：新增工作区级默认档（中央文件、canonical path 键、并集播种、不追溯）与两个 Web 入口（面板分区 + 侧栏 footer），命令面提供 `/tools workspace`。
- 保持单一控制内核、单一状态、单一持久化记录；所有新增面可降级、可观测、可测试。

**Non-Goals**

- 不做「追溯运行中会话」（用户已改判：只对新会话生效）。
- 不做上游工作区行 `...` 菜单入口（DQ1=C：座位未定，后续变更实现）；不写任何上游座位软注册。
- 不做「反开」（工作区只能追加关闭）、不做工作区根 `.dsh/` 文件、不做 `WorkspaceId` 键、不做全局层 stub、不改 SKILL.md、不替换 `dsh-tool-skill`/`dsh-skill` 行。
- 不做任意路径写入/探测：`{workspacePath}` 仅限已登记工作区（DQ4=A）；`{sessionId}` 由宿主自推 cwd 键。
- 不做面板配置键编辑、不做多窗口实时广播、不适配 DSH `>=0.3.0`。

## 决策记录

### D0 栈识别与 writer 豁免（必须留档，供执行侧与接续恢复）

- **结论**：本次**未触 writer 约束**（用户拍板豁免加载；栈 = TypeScript + React + Cordis 的 DSH 插件仓，非 Spring 非 Nuxt）。
- **证据**：`find` 无 `pom.xml` / `build.gradle*` / `nuxt.config.*` 命中；`pnpm-workspace.yaml:6-7`（`packages: plugins/*`）；`src/host/index.ts:98/106/118/177`（Cordis `name`/`inject`/`Schema`/`apply`）；`src/client/ToolPanelAction.tsx` 的 React 组件与 `package.json` devDeps `react ^18.3.1`；`build.mjs:35-42/:113`（client externals / host 只 `node:*`）。
- **影响**：任务拆分粒度按本仓既有插件惯例（`## N.` 组、组内并行），不引用 writer skill 规定。

### D1 技能遮蔽走「agent 作用域同名 runtime stub」

- 决策：在 `agent.ctx.inject(['skills'], …)` 的子 fiber 内 `skills.register(克隆定义 + invocation{modelInvocable:false, userInvocable:true})`。
- 被否：全局层注册（rank 250 压不过 project/preset 层 provider，且会关掉所有会话）；改 SKILL.md 的 `disable-model-invocation`（非会话级、要恢复逻辑）；替换 `dsh-tool-skill` 行（复刻目录消息格式，耦合最重）；替换 `dsh-skill` 注册表子类（爆炸半径最大）。
- 反例：全局层注册后，用户关掉 `openspec-propose`，**别的会话**同名技能一起消失且无法用本会话 `/tools on` 恢复（stub 在全局层，唯一恢复手段是 dispose）。

### D2 stub 复制真实定义全量字段，只改 `invocation`

- 决策：`{...realDefinition, invocation:{modelInvocable:false, userInvocable:true}}`（含 `content`/`description`/`path`/`whenToUse`/`resourceBase`/`metadata`/`source`/`provider`）。
- 被否：空占位 description + `content: ''`（A 线初版）。
- 反例：空正文时用户打 `/openspec-propose`，注入的 `<skill_content>` 只有标题没有指令，模型据此执行必然偏离且无任何报错。

### D3 每次从 agent 子 fiber 的 scope 句柄现取 `scope.skills.xxx(...)`

- 决策：`mountSkills` 保存 `inject` 回调给的 `scope` 句柄，此后每次 register/get/snapshot 都经该句柄；不缓存插件根 ctx 上的 `ctx.get('skills')`。
- 被否：构造期取一次存字段（落全局层）。
- 反例：根 ctx 调用 → `scopeOf(this.ctx) === undefined` → 落 global 层（见 D1 反例）。

### D4 `setState` 保持同步；技能收敛异步但**有界**，回执前 `await skillsSettled()`

- 决策：`LayerHandle.setState` 签名不变；新增 `skillsSettled(): Promise<void>`；`handleToggle` 与 `runToolsCommand` 在组装回执前 await（内部 `AbortSignal.timeout(2000)` 兜底）。
- 被否：把 `toggleSession` 改 async（波及全部调用点与 12 个既有测试）；fire-and-forget（回执撒谎）。
- 反例：fire-and-forget 时 `hiddenSkills` 只能统计到 0，回执说「无变化」而第二步就少 3 条；改 async 则 `/tools` 同步回执时序与 `control.ts:269-287` 的顺序论证整段失效。

### D5 `attach` 先同步取一次 `skills`，fiber 只做晚到补挂

- 决策：`attach` 内 `agent.ctx.get('skills')`；存在则直接完成首轮收敛（await），同时仍装 `inject(['skills'])` 刷新句柄再收敛一轮。
- 被否：只靠 fiber（服务缺席时 pending 不结算，首步前不保证生效）；无条件 await fiber（headless 组合 `agent/created` 永不结算）。
- 反例：没装 `dsh-skill` 的组合里只 await fiber → 宿主串行广播被堵死，表现为「插件装上后新会话开不出来」。

### D6 技能清单三读：会话视图为主 + 影子前缓存 + 关闭集

- 决策：`visible` = `snapshot({cwd, scope: agent})` 过滤 `modelInvocable` 且未被本层遮蔽；被遮蔽条目的 description 取影子前缓存 `skillBodies`；关闭集里的 `skill:<name>` 即使不在活清单也进关闭集 chips 与 `intentOnly`。
- 被否：单一全局读（A 线口径）。
- 反例：全局读会漏掉只在 preset 挂载的 provider，面板显示「全开」而模型目录里仍有该技能。

### D7 技能行不进 `ToolGroup`，新增顶层 `skills`

- 决策：`PanelSnapshot.skills: SkillView[]`；`groups` 原样保留（整档 `skill` 行仍在 `groups`）。
- 被否：把逐技能行塞进 `ToolGroup(kind:'skill').tools`（`ToolEntry.disabled` 由 `planMask.deny` 推出，技能名不在工具注册表 → 恒「未关闭」或迫使技能名进 deny）。
- 反例：把 `skill:foo` 当工具 deny 提交 → `tools.restrict` 对未知名字抛错（`mask.ts:91-93`），每次关技能触发一次 I3 重推 + error 日志。

### D8 工作区键 = 规范绝对路径（ancestor walk，registry.path 优先）

- 决策：`resolveWorkspaceAttribution` 逐级 realpath 上溯，命中 `Workspace.path` 则取该 path；未命中用 canonical cwd（registered:false）；realpath 全程失败返回 undefined。
- 被否：`WorkspaceId`（uuid，删后重建即丢）、工作区标题（可重名）、cwd 原文（符号链接产生两个键）。
- 反例：`~/proj` 与 `/home/docker/proj` 两个键 → 用户在一处配了默认档，从另一处进入的会话读到空档。

### D9 `workspaces.json` 条目只存 `disabled`，不存 `updatedAt`

- 决策：`workspaces[<key>] = {disabled: string[]}`。
- 被否：`{disabled, updatedAt}`（line-a 提案）。
- 反例：加 `updatedAt` 后同一内容两次保存产生不同字节，「保存两次文件字节不变」断言写不出来，且需要引入时钟破坏纯序列化。

### D10 合并 = 并集（用户档 ∪ 工作区档）

- 决策：`snapshot = sortUnique(用户档 ∪ 工作区档)`；`/tools reset` 回合并快照；不引入反开。
- 被否：工作区整份覆盖 / 双列（`disabled` + `enabled`）。
- 反例（实现边界）：若引入反开，`planSkills`/`planMask` 都要先做差集，签名失效，属破坏性改动。

### D11 `{workspacePath}` 形态必须已登记；`{sessionId}` 形态允许未登记

- 决策：`{workspacePath}` 要求绝对 + realpath 成功 + 在 `workspaceChoices()` 内；`{sessionId}` 由宿主从 cwd 推键（未登记目录以 canonical cwd 为键）。
- 被否：两种形态都接受任意存在的绝对路径。
- 反例：接受任意路径 → 任何能发 RPC 的页面可用 `workspacePath: '/etc'` 探测目录存在性（失败码不同即信息泄露），并能在文件里堆任意键。

### D12 上游工作区行菜单座位本期不实现（DQ1=C）

- 决策：不写 `sidebar.workspaces.workspace.menu.item` 软注册；`seats.ts` 只保留 header/footer 常量；后续变更（上游定名后）再加。
- 被否：按假设名实现 + 软注册（本次未选）；同时注册 2–3 个候选名（可能重复渲染）。
- 反例：按假设名硬写，上游最终用别的名字/owner 时 `declare module` 与上游冲突（TS2345/TS2717），且错误指向一个从未工作的注册点。

### D13 面板/对话框复用 ui-primitives + `panel.module.css`

- 决策：`WorkspaceDefaultsEditor`/`WorkspaceEntry`/`SkillPanel` 用与面板相同的 primitives 与 CSS module 类名。
- 被否：照抄 multi-root 的「注入 `<style>` + 内联样式」。
- 反例：两套样式管线会让宿主 token 与深色模式行为在两块 UI 分叉（`build.mjs` 只编译 `*.module.css`）。

### D14 技能名文法复制常量，不 import `@deepseek-ai/dsh-skill`

- 决策：`address.ts` 写死 `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` 并在单测钉住。
- 被否：`import { isSkillName } from '@deepseek-ai/dsh-skill'`。
- 反例：一旦 import，`lib/index.js` 出现未内联的 `@deepseek-ai/*` 运行时依赖 → `bundle.test.ts` 红，真装到 profile 时整行加载失败。

### D15 技能开关维持「没有保护基线」

- 决策：`skill:` 地址不查 `protectedNames`；`tool:skill` 整档仍可关。
- 被否：给核心技能加保护。
- 反例：同一分组内「逐项点不动、整档能关」两种拒绝语义并存，无法用一句文案解释。

### D16 整档 `tool:skill` 关闭时跳过 stub 注册（DQ3=A 的配套）

- 决策：`planSkills.shadowNames = toolSkillClosed ? [] : sortedUnique(closedSkillNames)`；面板逐技能行保留勾选状态但整块置灰 + 行内提示，重新打开整档后按状态恢复。
- 被否：整档关闭仍注册 stub（白触发缓存失效与目录消息）；清空逐项地址（破坏意图保留）。
- 反例：整档关闭时注册 stub 会让 `skills/change` 触发一轮无效目录重算，而 `skill` 工具 schema 已不可见、目录本就停发。

## 代码级契约（承接 `code-design.md` 六字段）

### ① 触达面清单（仓归属：全部本仓 `dsh-plugins`，插件目录 `plugins/session-tool-toggle/`）

**宿主半**

| # | 文件 | 改动 |
|---|---|---|
| H1 | `src/host/address.ts` | `SwitchAddress` 加 `{kind:'skill';name}`；`parseAddress` 处理 `skill:` 前缀（`skill:*`/裸 `skill` → `tool:skill`）；新增失败码 `bad-skill-name`；`SKILL_NAME` 常量（复制文法）；`formatAddress` 分支；`matchesToolName` 对 skill 恒 false；`ADDRESS_GRAMMAR` 与三条文案补 `skill:` |
| H2 | `src/host/skills-plan.ts`（新建） | `planSkills({disabled,installed,toolSkillClosed}) → {shadowNames, closedTexts, matched, intentOnly}`；整档关闭 → `shadowNames` 空；纯函数、不抛错 |
| H3 | `src/host/mask.ts` | `resolveAddresses`/`guardReason` 跳过 `kind==='skill'`（技能名不进 tool deny） |
| H4 | `src/host/session-layer.ts` | `SkillServiceLike`/`SkillScopeHandle` 窄面；`mountSkills`（同步先取 + 软 fiber）；`reconcileSkills`（代数守卫 + 先撤后补）；`captureSkill`（`AbortSignal.timeout(2000)`）；`shadowSkill`（回读校验 + failed 集合）；`skills()`/`skillsSettled()`；`detach` 逐个 dispose |
| H5 | `src/host/types.ts` | `LayerHandle` 加 `skills()`/`skillsSettled()`；`SkillLayerSnapshot`/`SkillSummaryLike`/`WorkspaceAttribution`；`NoticeCode` 加 `skills-unavailable`/`skill-shadow-failed`；`Config.workspacesFile`；`PanelInputs` 加 skills/workspace |
| H6 | `src/host/panel.ts` | 顶层 `skills`/`workspace`；关闭集文本改用全地址归一（不再只取 `planMask.matched` 键）；`intentOnly` = 工具地址 0 命中 ∪ 技能地址无安装；`NOTICE_ORDER` 增两码 |
| H7 | `src/host/control.ts` | `hiddenSkills` 与 `schemaChanged` 扩义；`PanelReading` 加 `skills`/`skillsAvailable`/`workspace`；新增 `updateWorkspaceDefaults` + `resolveWorkspaceTarget`（异步、写失败抛错） |
| H8 | `src/host/workspaces.ts`（新建） | `workspacesPath`/`readWorkspaces`（两级降级）/`writeWorkspaces`（原子、稳定序列化）/`disabledOf`/`withEntry`/`mergeSeed(user,workspace)`（并集纯函数，播种复用、单测直接钉）/`EMPTY_WORKSPACES`/上限常量；`WorkspaceIo = DefaultsIo` |
| H9 | `src/host/attribution.ts`（新建） | `resolveWorkspaceAttribution(cwd,{roots,realpath,log})`：realpath + 逐级向上 + 最近命中 + fail-closed |
| H10 | `src/host/rpc.ts` | 第 5 端点 `handleWorkspace`；`dispatch` 分支；`snapshotOf` 组装 skills/workspace；两失败码映射；`toggle` 回执前 `await skillsSettled()` |
| H11 | `src/host/commands.ts` | `/tools workspace [status|off|on|set|reset]`（只作用本会话所属工作区）；`/tools status` 增技能段与工作区段；`closedStateText` 加 skill 分支；文法行扩展 |
| H12 | `src/host/index.ts` | `Config.workspacesFile`；软注入 `workingDirectory`/`workspaceRegistry`；`readOrSeed` 并集播种；`workspaceOf` 闭包；`controlDeps` 扩展；启动日志补降级信息 |
| H13 | `src/contract.ts` | 第 5 端点；`WorkspaceRequest`/`WorkspaceValue`/`WorkspaceView`/`WorkspaceChoice`/`SkillView`；`PanelSnapshot` 两字段；`Mutation.hiddenSkills`；失败码 7→9；提示码 3→5；白名单与 parser 同步 |

**浏览器半**

| # | 文件 | 改动 |
|---|---|---|
| C1 | `src/client/SkillPanel.tsx`（新建） | 逐 skill 行开关；`unavailable` 降级；`blocked`（整档关闭）置灰 + 提示 |
| C2 | `src/client/WorkspaceDefaultsEditor.tsx`（新建） | 两形态（section/dialog）、工作区下拉、保存/清空/失败、预期管理文案与「并集」一句说明（DQ2=A） |
| C3 | `src/client/WorkspaceEntry.tsx`（新建） | footer 触发按钮 + 自绘对话框 + `useWorkspaceDefaults`（DQ1=C：无菜单项形态） |
| C4 | `src/client/current-session.ts`（新建） | 当前会话探测（两步：`current` → `byId[id].retainedBy.mainView`） |
| C5 | `src/client/seats.ts`（新建） | `HEADER_SEAT`/`FOOTER_SEAT`/`PANEL_ID`/`ORDER` 常量集中 |
| C6 | `src/client/panel-controller.ts` | 状态加 workspace/choices/saving/saved/error；`refreshWorkspace`/`updateWorkspace`；`toggle` 复用 |
| C7 | `src/client/panel-client.ts` | `workspace()` + 内联 `parseWorkspaceValue`；`ENDPOINTS` 加 `'workspace'` |
| C8 | `src/client/ToolPanelAction.tsx` | 挂载 `SkillPanel` 与 `WorkspaceDefaultsEditor(variant='section')`；接新码文案 |
| C9 | `src/client/index.ts` | header 座位保持；新增 footer 实注册（`register` try/catch，失败只 warn） |
| C10 | `src/client/locales.ts` | 新键（section.skills / skill.* / workspace.* / notice 两码 / error 两码），zh canonical + en parity |
| C11 | `src/client/panel.module.css` | 技能行、工作区档分区、对话框、footer 按钮样式 |

**包/构建/测试/文档**：`package.json` 补 devDep `@deepseek-ai/dsh-client-ui-sidebar@0.2.1-rc.5` 与 `dsh.client.inject` 项；`build.mjs`/`cordis.patch.yml` 不改；测试新增 `test/skills-plan.test.ts`、`test/workspaces.test.ts`、`test/workspace-attribution.test.ts`、`test/skill-panel.test.tsx`、`test/workspace-editor.test.tsx`，改 address/mask/session-layer/panel/control/commands/rpc/wire-contract/panel-controller/panel-client/client-index/locale-parity/bundle/tool-panel 共 15 套；文档改插件 `README.md`（能力/预期管理/降级矩阵/非目标/回滚代价/配置表）与根 `README.md`、`AGENTS.md`。

### ② 证据锚（每个触达模块 ≥1 条）

| 模块 | 证据 |
|---|---|
| H1 | `src/host/address.ts:146`（裸 `skill` 归一）、`:43-57`（7 码枚举）、`:87-88`（文法行）、`:171-177`（formatAddress）、`:209-219`（matchesToolName） |
| H2 | 形状参照 `src/host/mask.ts:98-121`（planMask 风格）；上游 `dsh-skill/lib/index.js:17`（`SKILL_NAME`） |
| H3 | `src/host/mask.ts:176-186`（resolveAddresses kind 分派）、`:140-146`（guardReason）、`:88-89`（地址类别决定下游语义先例） |
| H4 | `src/host/session-layer.ts:155-175`（agentSurface inject 模式）、`:99-110`（结构类型）、`:289-312`（attach 顺序）、`:341-369`（detach）、`:440-471`（reconcile diff 守卫 + I6 闸） |
| H5 | `src/host/types.ts:229-239`（LayerHandle）、`:276-282`（NoticeCode）、`:204-213`（Config）、`:290-319`（PanelInputs） |
| H6 | `src/host/panel.ts:206-272`（快照映射）、`:233-234`（closedTexts 来源 ← 必须改）、`:253`（buildGroups）、`:297-341`（skill 分支） |
| H7 | `src/host/control.ts:235-315`（toggleSession 顺序）、`:306`（schemaChanged ← 扩义点）、`:397-464`（readPanel 三读）、`:483-524`（updateDefaults 写失败抛错范式） |
| H8 | `src/host/defaults.ts:88-92`（路径）、`:106-162`（两级降级）、`:181-188`（写）、`:241-253`（原子写 600/700） |
| H9 | `plugins/project-mcp/src/host/attribution.ts:77-95`（归属算法）；`dsh-workspace/lib/types/index.d.ts:265`（`resolveByPath` async 且缺路径 reject）、`types/types.d.ts:63-71`（`Workspace.path` 已 realpath） |
| H10 | `src/host/rpc.ts:205-232`（dispatch）、`:243-258`（handleToggle）、`:318-329`（liveSessionOf）、`:424-455`（snapshotOf） |
| H11 | `src/host/commands.ts:139-171`（子命令分派）、`:243-280`（异步入口）、`:441-479`（statusText）、`:480-490`（closedStateText）、`:93-101`（SKILL_FLIP_HINT） |
| H12 | `src/host/index.ts:118-129`（Config schema）、`:289-295`（readOrSeed）、`:315-330`（seed）、`:347-362`（mount）、`:523-555`（双软注入范式） |
| H13 | `src/contract.ts:43`（ENDPOINTS）、`:58-73`（HOST_FAILURE_CODES）、`:123-130`（NOTICE_CODES）、`:306-319`（Mutation）、`:780-785`（REQUEST_PARSERS）、`:814-825`（PANEL_SNAPSHOT_KEYS）、`:831`（MUTATION_KEYS） |
| C1 | 形态参照 `src/client/ToolPanelGroups.tsx:116-158`（ToolRow 三态） |
| C2 | 字段面参照 `src/client/DefaultsEditor.tsx:46-72`、`:94-101`（splitAddresses） |
| C3 | 先例 `plugins/multi-root-workspace/src/client/index.ts:87-107`（footer 座位 + 自绘面板） |
| C4 | 移植 `plugins/multi-root-workspace/src/compat/client-session.ts:41-56` |
| C5 | 现状 `src/client/index.ts:74/:86/:145-163`（座位名、order、软注册范式） |
| C6 | `src/client/panel-controller.ts:47-76`（PanelState）、`:265-302`（toggle）、`:303-330`（reset 全局禁用先例） |
| C7 | `src/client/panel-client.ts:89-105`（接口）、`:193-215`（call + 自检） |
| C8 | `src/client/ToolPanelAction.tsx:428-441`（面板主体挂载点）、`:144-148`（notice 映射） |
| C9 | `src/client/index.ts:71`（inject）、`:111-113`（字典先于座位）、`:128-142`（端口）、`:145-163`（软注册） |
| C10 | `src/client/locales.ts:31`（NS）、`:50-53`（section.*）、`:123-125`（notice.*） |
| 上游技能注册表 | `dsh-skill/lib/types/index.d.ts:246-256`（register doc：落调用方 scope、同层 first-wins、重复 warn + no-op）；`lib/index.js:194-214`（实现）、`:465-469`（validateRuntimeSkill 不校验 content） |
| 上游技能消费方 | `dsh-tool-skill/lib/index.js:931-945`（pre-step 目录）、`:875/:878`（model 拒绝文案）、`:909-911`（`/name` 注入） |
| 上游工作区/目录 | `dsh-working-directory/lib/types/index.d.ts:64`（`get(session)` 无 IO）；`dsh-workspace` 同上 |
| 上游座位面 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:57-58`（single）、`:76-77`（footer list）、`:128-131`（owner 只有 `wide`） |
| 上游全局钩子 | `dsh-client-ui-workspace/lib/types/client/index.d.ts:10-12`（`useWorkspaces`）；`dsh-client-ui-slots/lib/types/index.d.ts:221-226`（PropsRuntime） |

### ③ 接口与数据形状（执行侧契约）

- 地址文法：`SwitchAddress` 增第四类 `{kind:'skill';name}`；`ParseErrorCode` 增 `bad-skill-name`；文法行 `mcp:<server> | mcp:<server>::<工具名或尾部 *> | tool:<工具名> | skill:<技能名>`；`skill` 与 `skill:*` 归一 `tool:skill`；`skill:` 后必须 kebab 名（`^[a-z0-9]+(?:-[a-z0-9]+)*$`），否则整单拒绝。
- `planSkills`：`{shadowNames: string[], closedTexts: string[], matched: Map<string,0|1>, intentOnly: string[]}`；`toolSkillClosed → shadowNames=[]`；matched 0 也保留键。
- 每 agent 分面：`SkillServiceLike`（`register`/`get`/`snapshot` 三方法窄面）、`SkillScopeHandle`、`SkillDefinitionLike`/`SkillSummaryLike`；`LayerHandle.skills(): {available, shadowed, visible[{name,description}]}`、`skillsSettled(): Promise<void>`；内部 `skillBodies`/`shadows`/`skillGeneration`/`skillTask`；`SKILL_CAPTURE_TIMEOUT_MS=2000`。
- `workspaces.json`：`{version:1, workspaces: Record<absPath, {disabled: string[]}>}`；`WORKSPACES_FILE_NAME='workspaces.json'`、`MAX_WORKSPACE_ENTRIES=256`、`MAX_WORKSPACE_KEY_LENGTH=4096`；2 空格缩进 + 结尾换行 + 字典序稳定。
- 归属：`WorkspaceAttribution {key, registered, title?}`；`resolveWorkspaceAttribution(cwd,{roots,realpath,log})`；algorithm 见 D8。
- 契约端点：`ENDPOINTS = ['panel','toggle','reset','defaults','workspace']`；`WORKSPACE_ACTIONS=['read','set','off','on','reset']`；`WorkspaceRequest {sessionId?, workspacePath?, action?, addresses?}`（规则：恰好一个寻址字段；set/off/on 需 1–64 地址；read/reset 禁地址；路径 ≤4096 且以 `/` 开头）。
- 视图：`WorkspaceView {key,title?,registered,disabled,path,readable,corrupt}`；`WorkspaceValue {workspace: WorkspaceView|null, choices: WorkspaceChoice[], changed: string[]}`；`SkillView {name,description,disabled,shadowed}`；`PanelSnapshot` 加 `skills`/`workspace`；`Mutation` 加 `hiddenSkills`。
- 码表：失败码 7→9 增 `workspace-unresolved`（details `{subject}`）/`workspace-unwritable`（details 复用 `{path,reason}`）；提示码 3→5 增 `skills-unavailable`/`skill-shadow-failed`；`MUTATION_KEYS` 与 `PANEL_SNAPSHOT_KEYS` 同步。
- 内核：`ControlDeps` 增 `workspacesPath`/`workspacesIo`/`workspaceOf(session)`/`workspaceChoices()`；`WorkspaceTarget = {kind:'session',session} | {kind:'path',path}`；`updateWorkspaceDefaults(deps,target,mode,texts)`；`PanelReading` 加三字段；`ToggleReport`/`ResetReport` 加 `hiddenSkills`，`schemaChanged` = deny 变 或 影子集合变。
- 命令面：`/tools workspace [status]`、`/tools workspace off|on|set|reset <地址…>`（只作用本会话所属工作区）；`/tools status` 增「技能：可见 X / 已关 Y（生效 A，意图 B）」与「工作区默认档（key，是否登记）：N 项 · 文件路径」两段。
- 播种：`readOrSeed` = `seed(session,current,mergeSeed(用户档, 工作区档))`（`mergeSeed` 在 `workspaces.ts`，纯函数可单测），工作区归属 undefined 时只用用户档。
- 客户端：`PanelClient.workspace(request)`；`SkillPanelProps{skills,unavailable,blocked,pending,busy,onToggle,t}`；`WorkspaceDefaultsEditorProps{workspace,choices,variant,saving,saved,failure?,onSelect,onUpdate,onRefresh,t}`；`WorkspaceFooterActionProps{wide?,resolveClient,currentSessionId,t}`；`useWorkspaceDefaults`（phase/value/error/saving/saved/read/update/select）。
- 配置键：新增 `workspacesFile?`（绝对路径覆盖；相对路径按未设处理并 warn）；写盘 `0o600`/目录 `0o700`。

### ⑤ 逐任务组实现要点（与 `tasks.md` 的 `## N.` 组一一对应）

| 组 | 内容 | 出口（可执行） |
|---|---|---|
| 1 | 关键 spike（隔离实例 + fixture skills） | `openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md` 五条全绿 |
| 2 | 地址文法 + 计划 + 掩码 + 状态测试（4 项并行：H1/H2/H3、state 只补测试） | `vitest run test/address.test.ts test/skills-plan.test.ts test/mask.test.ts test/state.test.ts` |
| 3 | 每 agent 技能分面（2 项并行：H4、H5 类型先冻结） | `vitest run test/session-layer.test.ts`（含无 skills 时工具掩码仍生效） |
| 4 | 工作区数据面（3 项并行：H8、H9、H12 播种段） | `vitest run test/workspaces.test.ts test/workspace-attribution.test.ts` + 播种并集断言 |
| 5 | 契约先行（1 项，串行闸：2–4 完成 → 5 → 6） | `vitest run test/wire-contract.test.ts`；`! grep -qE '^\s*import ' src/contract.ts` |
| 6 | 内核与装配接线（5 项并行：H6/H7/H10/H11/H12 接线段） | `vitest run test/panel.test.ts test/control.test.ts test/rpc.test.ts test/commands.test.ts` |
| 7 | Web 半（7 项并行：C1/C2/C3、C4+C5、C9、C6+C7、C8+C10+C11） | `vitest run test/skill-panel.test.tsx test/workspace-editor.test.tsx test/panel-controller.test.ts test/panel-client.test.ts test/client-index.test.ts test/locale-parity.test.ts test/tool-panel.test.tsx` |
| 8 | 静态门禁 + 隔离实例冒烟 + 浏览器证据（2 项并行） | `pnpm --filter dsh-plugin-session-tool-toggle verify:all` + `pnpm dsh:check` + 冒烟 6 条 + 截图 |
| 9 | 文档与发布（3 项并行：插件 README、根 README/AGENTS、release 1.5.0） | `pnpm release --dry-run` 清单符合预期 + `pnpm verify`/`dsh:check` 全绿 |

### ⑥ 设计假设与未决项

**假设**（证伪即回到对应决策）：A1 agent 子 fiber 的 scope 句柄任意时刻取用都绑 agent 层（否则 D3 需改绑定函数）；A2 `skills.get` 在注册 stub 前取到真实定义（否则内容复制不可行）；A3 `workspaceRegistry.list()` 同步且 path 已 realpath；A4 `workingDirectory.get(session)` 对结构类型可用（try/catch 回退 `header.cwd`）；A5 footer owner props 只有 `{wide}`；A6 `dsh.client.inject` 只是加载元数据；A7 命令面只需本会话所属工作区；A8 播种期技能捕获不会明显拖慢 `agent/created`（24 skill 量级、并发上限 4）；A9 `hiddenSkills` 取影子集合长度差足以表达代价；A10 面板技能行只需 `modelInvocable` 技能。

**未决**（不阻塞，实施期消解）：U1 上游工作区行菜单座位（DQ1=C，后续变更）；U2 `skills/change` 与 `agent/pre-step` 时序由 spike 第 2 条覆盖；U3 `skillBodies` 缓存上限（实施加 `MAX_CACHED_BODIES=64` + FIFO）；U4 footer 对话框折叠态定位（G8 截图确认）；U5 `workspaces.json` 绝对路径键不可跨机移植（README 写明）。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 依赖上游未文档化的「层优先级」语义（stub 遮蔽可能随上游发布失效） | 先跑 spike（组 1）实证；机制收口在每 agent 分面；README 记录依赖点；上游若提供正式 API 可整体替换 |
| 同层同名 runtime 先到先得导致「关不掉」 | 注册后回读校验 + `skill-shadow-failed` 提示码 + 面板行禁用理由 |
| 每次真实翻转追加一条完整目录替换消息并触发 KV 前缀重建 | 回执带 `kvRebuild` 与 `hiddenSkills`；批量一单一条；README/面板预期管理写明成本形态（省目录行 token，不省 `skill` 工具 schema） |
| `/` 菜单对被关技能显示「仅限用户调用」前缀，用户可能困惑 | 面板行标注「模型不可见，`/name` 可用」；README 说明这是设计语义 |
| 契约 strict 双端不同步 → `bad-response` | 沿用「升级后重启 web profile」纪律；client 侧已有降级文案；不改 strict |
| 工作区档损坏 / 不可写 / 无 registry | 两级降级 + warn + 面板 `corrupt`/`readable` 视图 + 失败码 `workspace-unwritable`；`skills`/`workspaceRegistry` 缺席只降级对应功能 |
| 回滚到 1.4.0 丢 `skill:` 条目与工作区档 | 用户已拍板不保证；README/发布说明写明 |
| 面板体积膨胀（技能行 + 工作区视图） | 描述截 160；只输出必要字段；沿用 200 KB 阈值口径 |
| footer 对话框在折叠态的宽度/定位 | 复用 primitives + 本轮 G8 截图确认；必要时自带浮层定位 |
| 目录发布侧 `complete === false` 时目录不更新 | 回执提示「下一步收敛」；不重复注册；如实记录 |

## Migration Plan

1. 落档 → 执行（组 1–9）→ `pnpm --filter dsh-plugin-session-tool-toggle verify:all` + 根 `pnpm verify` + `pnpm dsh:check` 全绿。
2. 版本 1.4.0 → 1.5.0（`pnpm release` 统一抬；`lib/` 重建随提交）。
3. live profile 为 `link:` 安装：重建 `lib/` 后**重启 dsh 进程**加载新宿主半（浏览器半随页面刷新）；重启会中断当前会话，部署前先在隔离实例完成冒烟。
4. 回滚：不保证兼容（旧版丢弃 `skill:` 与工作区档）；若要回滚，需同时回退状态记录与 `workspaces.json`（README 写明）。

## Open Questions

- 无阻塞性未决项：阶段 2 的 4 个设计线待决项已由用户拍板（`diff-matrix.md` §4.6：DQ1=C 上游座位本期不做、DQ2=A 不标注来源、DQ3=A 整档关闭保留逐项状态 + 置灰、DQ4=A 仅限已登记工作区）。
- 可延后：上游新增工作区行菜单座位后的入口补全（后续变更）；`skillBodies` 缓存上限与 footer 折叠态定位（实施期按测试/截图确认）。
