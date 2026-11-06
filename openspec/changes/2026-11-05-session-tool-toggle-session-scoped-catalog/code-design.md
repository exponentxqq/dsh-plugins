# 代码级蓝图（阶段 1.7）— 会话工具面改会话作用域口径（scoped ∪ carried）+ 默认档分组开关界面（两形态）

> **本文件是代码级蓝图（v2 合并版，覆盖写）**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由 `explore.md`（v2）与 `decisions.md`（D1–D13 + P1–P3）收敛，**本文不复读**；本文只把已定结论翻译成可施工的代码形状。
> **范围 = A（会话工具面改会话作用域口径）+ B（统一工作区配置弹窗的「工作区默认档」分节与用户级默认档编辑器改成与会话工具面同构的分组开关界面）**。用户已裁定 B 并入本变更、重开本变更工件（`2026-11-05-session-tool-toggle-session-scoped-catalog`）。
> **输入已逐字读全**：`explore.md`（v2，124 行）、`decisions.md`（v2，84 行，D1–D13 + P1–P3 权威，本蓝图不推翻）、既有 `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/code-design.md`（A 部分 813 行，本文件在其基础上合并扩展并覆盖写）。
> **事实基线（2026-11-05 晚，只读核实）**：
> - 仓 `dsh-plugins` @ `20a934d`；目标子包 `plugins/session-tool-toggle` 版本仍 `1.5.0`（`package.json` 与 HEAD 同值）。
> - **工作区含 unify-workspace-config-entry 的未提交改动**（`git status` 显示 `plugins/session-tool-toggle/{README.md,lib/client.js,package.json,src/client/{WorkspaceEntry.tsx,index.ts,locales.ts,panel.module.css,seats.ts},test/{bundle,client-index,workspace-editor}.*}` 等已改，unify tasks 12/14：9.1 真机冒烟与 10.1 收口未勾）。本蓝图的行号以**该工作区现状**为准；A 部分旧行号只在内容未漂的宿主文件上沿用，客户端文件按现状校订。
> - 锚点漂移实测：`src/client/locales.ts` 四键 zh `83/89/152/154 → 87/93/156/158`（+4，`section.label` 插入）、en `238/244/306/308 → 245/251/313/315`（+7）；`README.md` L24/L77/L120、`panel.module.css` L264 注释、`ToolPanelGroups.tsx`/`ToolPanelAction.tsx`、宿主半全部文件与 `src/contract.ts` **未漂**（与 explore §2.3 一致；executed 时仍以「函数名 + 关键片段」定位）。
> - 测试基线实测（当前工作区）：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run` → **22 文件 / 1002 用例全绿**（A 原基线为 989；当前工作区实测 1002，unify 对 workspace-editor / bundle / client-index 三个套件的改动是已知差异来源）。
> - `plugins/workspace-config/`（holder）已在仓内并已按 link: 装入 profile（unify 8.1）；本变更**不改 holder**。
> **writer 豁免留痕**：见 ④ **D-0**（沿用，不重开）。
> **执行顺序依赖（D12）**：unify-workspace-config-entry 先提交、执行完成并归档（其归档后主规格文本是本次 spec delta 的基线；其客户端迁移形态是 B 的代码基线），本变更（A+B）后执行/归档。

---

## ① 触达面清单

**仓归属**：A 与 B 的源码、测试、产物全部落在**子包 `dsh-plugin-session-tool-toggle`**（仓内路径 `plugins/session-tool-toggle/`；下表路径除特别注明外均相对该目录）；规范落档工件落在**根仓 `dsh-plugins`** 的 `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/`。holder `plugins/workspace-config/` 只读、零修改（B 只消费其座位契约的既有类型）。上游 `@deepseek-ai/dsh*`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/`）只读、零修改（ADR-0002）。

### 1.1 A 部分：宿主半（`src/host/`，子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| H1 | `src/host/types.ts` | 端口瘦身 + 新增会话读数面 | 删 `ControlDeps.catalog`（L409–418 整段 JSDoc + 字段）、删 `PanelInputs.catalog`（L470）；新增 `VisibleToolSchema`（name + description 轻量投影，**B 的宇宙构建也复用它**）；`ScopedSurface` 加 `visibleSchemas()`（L128–156）；`LayerHandle` 加 `visibleSchemas()`（L338–361）；`PanelInputs` 类文档「三读并集」改「两读」 |
| H2 | `src/host/mask.ts` | 掩码候选改两读 | 删 `MaskInputs.catalog`（L57–66）；`unionNames` 由三读变两读（L169–171）；`planMask` 文档的「三读」段改「scoped ∪ carried」并写清代价（关会话外工具 = matched 0 / deny 空 / 意图保留）；`shadowServers` 语义**不变**（仍只由 `mcp-group` 地址产生，与命中无关） |
| H3 | `src/host/session-layer.ts` | 删层内全局层端口 + 加 `visibleSchemas` | 删 `SessionLayerPorts.catalog`（L128–140）、字段（L282）、构造赋值（L380）、`plan()` 里的 catalog 读取分支（L1052–1059）；`plan()` 只剩 `surface.visibleNames()` 一次读数；新增 `visibleSchemas()` 读数（与 `visibleNames()` 同纪律：未挂载/退场/读失败 → 空数组 + `absorbFailure`）；`surfaceOf` 的 `visibleSchemas` 投影（L254–262）；`AgentServiceScope.tools.schemas` 返回类型补 `description?: string`（L184 接口处） |
| H4 | `src/host/control.ts` | 内核两读 + 读数瘦身 | 删 `catalogOf()`（L819–826）与 `toggleSession` 的 `catalog` 取数（L338）、`planMask` 入参去掉 catalog（L345–350）；`readPanel` 去掉 catalog 取数（L509）、`candidates = unionNames(scoped, carried)`（L538）、删 `hiddenByOthers` 计算与返回（L549–553、L570）；`PanelReading` 删 `catalog`（L219–220）与 `hiddenByOthers`（L235–241）；`unionNames` 改两参（L1065–1071） |
| H5 | `src/host/panel.ts` | 面板构建器两读 + 删整条「被隐藏」链 | `buildPanelSnapshot`（L280）删 `catalogNames` 与 `hiddenByOthers`（L283–304、L355）；`planMask` 入参两读（L288–293）；`EntryContext` 删 `hidden`（L475–484、L331）；`ToolEntry` 删 `shadowed`（L130–136）与 `toolEntryOf` 的赋值（L596）；`Stats` 改 `{visible, denied}`（L217–227、L357–362）；`PanelSnapshot` 删 `hiddenByOthers`（L252–253）；模块头推导链与 R18 段改会话口径 + 写清「与 /inventory 两处刻意差异」（L1–45） |
| H6 | `src/host/rpc.ts` | 描述改经层读数 | 删 `RpcDeps.descriptions`（L171–183 的 L174–180 字段）；`snapshotOf` 的 `descriptionsOf(deps)` 改 `descriptionsOf(deps, session)`（L796 起）、`PanelInputs` 组装删 `catalog: reading.catalog`、`descriptions` 恒传（不再条件展开）；`descriptionsOf` 改经 `deps.layerFor(session.id)?.visibleSchemas()` 取，层缺席 / 读失败 → 空 `Map` + 一次 warn（L1002–1011） |
| H7 | `src/host/index.ts` | 装配层瘦身 | 删模块级 `catalog` 闭包（L267–273）与 `controlDeps.catalog`（L763–764）；`mount()` 里 `new SessionLayer({ log, catalog })` 改 `{ log }`（L642）；`rpcDeps` 删 `descriptions`（L806–813，含 L812 的装配期读数）；`inject` 名单**保留** `['agents','tools']`（L133，理由与反例见 ④ D-6）；模块头「全局层 catalog + 描述读数」两段改写（L55–61） |
| H8 | `src/host/commands.ts` | 命令面文案与降级 | 删 `hiddenText()`（L906–917）与 `statusText` 里那一行（L688–690）；段 6 只剩保护名单（注释 L688 改）；`switchableText` 加「会话层未就绪」显式降级分支（L890–904）；`closedStateText` 的 matched=0 文案改会话口径（L781–783）；段 1 注释里「全局层有、本会话关 vs 从未注册」改「本会话命中 vs 本会话暂无匹配」（L653–655） |

### 1.2 A 部分：契约与浏览器半（子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| C1 | `src/contract.ts` | wire 契约删字段（strict 同步收紧） | `ToolEntry` 删 `shadowed`（L259–260）；`StatsView` 改 `{visible, denied}`（L311–321）；`PanelSnapshot` 删 `hiddenByOthers`（L375–376）；`TOOL_ENTRY_KEYS` 去 `'shadowed'`（L985–994）、`STATS_VIEW_KEYS` → `['visible','denied']`（L1006）、`PANEL_SNAPSHOT_KEYS` 去 `'hiddenByOthers'`（L1018–1031）；`readToolEntry`（L1053–1082）、`readStatsView`（L1201–1222）、`readPanelSnapshot`（L1348–1369）同步删读取与返回键 |
| C2 | `src/client/locales.ts` | 删四键（zh/en 各四） | 删 `entry.shadowed`（zh **L87** / en **L245**）、`badge.shadowed`（zh **L93** / en **L251**）、`state.catalog`（zh **L156** / en **L313**）、`state.shadowed`（zh **L158** / en **L315**）（锚点已按漂移校订）；`state.visible` / `state.denied` 文案不动（现文案「本会话可见 {visible}」「已关 {denied}」已符合新叙事）。**B 在同一文件续改（见 W11）** |
| C3 | `src/client/ToolPanelGroups.tsx` | 三态锁改两态 | `lockOf` 删 `tool.shadowed` 分支（L108–113，L111）；`LockNotice` 注释里的 `entry.shadowed`（L93）与「三态禁用」段（L23、L100–103）改两态（protected → reserved）。**B 从该文件只额外导出两个纯函数（见 W5），不改行为** |
| C4 | `src/client/ToolPanelAction.tsx` | 状态摘要两计数 | 删 `state.catalog` / `state.shadowed` 两个 `<li>`（L203、L205）；`StateSection` 的「四计数」注释改「两计数」（L192–196）；`kvDelta` 仍取 `stats.denied` 正增量（L359，零改动）。**B 在同文件接线两个默认档编辑器（见 W10）** |
| C5 | `src/client/panel.module.css` | 注释同步 | L264 注释里的 `entry.shadowed` 删除（纯注释，无选择器变化）。**B 在同文件续加样式（见 W12）** |

### 1.3 A 部分：构建产物与文档（子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| B1 | `lib/index.js`、`lib/client.js` | 重建产物（**随仓库提交**，`git ls-files` 已跟踪） | `pnpm --filter dsh-plugin-session-tool-toggle build` 重生成；两者均含 `hiddenByOthers` / `stats.catalog` / `entry.shadowed` 字面量（实测 `shadowed` 计数 index 52 / client 23，其中技能分面部分保留），重建后需按 附 A 的 grep 断言验收。**B 完成后同一构建再跑一次（见 W13），产物里 `hiddenByOthers`/`state.catalog` 必须仍为 0，新增 `defaults.cliHint` 类文案可 grep 到** |
| B2 | `README.md`（插件根） | 能力口径与「已知限制」改写（A 段 + B 段） | A：L77「受保护 / 保留名 / 被其他作用域隐藏的行禁用」→「受保护 / 保留名的行禁用（其余行都可切换）」；L120「读数取全局层（仅工具）」整条重写为「读数取本会话作用域」+ 与 `/inventory` 的两处刻意差异 + 已关条目无 `title` 描述的代价；L24 `/tools` 行的「可关对象分组计数」补「本会话」限定。B：见 W14 |

### 1.4 A 部分：测试（`test/`，子包 session-tool-toggle；编号 `TS*` = 测试套件，与阶段 2 `tasks.md` 的 `T1–T6` 不同域；括号内是 A 规划时的基线用例数，执行时以实测 1002 为基线）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| TS1 | `test/mask.test.ts`（41） | 两读 | `inputs()` 删 `catalog` 默认值（L27 附近）；「catalog 单独就能让名字进入 deny」改为其**反面**；「同一个名字在三个读面重复」「服务器断线（三读都不含）」「不改动入参（三份读数）」等措辞与入参机械改两读 |
| TS2 | `test/panel.test.ts`（45） | 删「被隐藏」断言 + 新增三条会话口径断言 | `inputs()` 删 `catalog`（L63）；删 3 条（L318 hiddenByOther、L337/L357 两条 R18）；改写 L209（三读并集→两读 + carried 保底）、L376 stats、L403 去重、L838 形状测试（顶层键 / stats 键 / 工具条目键）；新增见 ⑤ G4。**B 在同文件追加 `buildDefaultsUniverse` 用例（见 TS17）** |
| TS3 | `test/control.test.ts`（47） | 两读 + 删 catalog 降级 | harness：删 `catalog` 选项与 `catalogError` 注入（L334、L354、L396–397、L411、L440–442），`scope` 变唯一读数来源；`FakeLayer` 的 `reconcile()` 改两读（L272）；删「全局层读数抛错」一条（L733）；删两条 R18 断言里的 `hiddenByOthers`（L829、L846、L854）；L803/L849 改写；新增「关闭本会话无效组」一条 |
| TS4 | `test/session-layer.test.ts`（39） | 删层 catalog 端口 | 删 9 处 `new SessionLayer({ …, catalog: () => … })` 的 catalog 项（L233、L246、L399、L427、L444、L513、L588、L683、L691）；删「catalog 读抛 inactive context」（L583–602）；L604「读视图失败」期望**翻转**（无 catalog 兜底 → 首轮不掩码，见 ③ 3.4）；新增 `visibleSchemas` 投影与降级两条 |
| TS5 | `test/rpc.test.ts`（48） | 描述改经层 | harness 删 `catalog`、`descriptions`、`descriptionsError`（L431、L499–500、L510、L537、L557、L571–578）；`FakeLayer` 加 `visibleSchemas()` 与可注入抛错；L826 stats 断言改 `{visible:1,denied:2}`；L870 描述测试改「描述来自本会话层」；新增「层未就绪 → 空描述 Map、面板成功」。**B 在同文件追加 workspace 宇宙用例（见 TS16）** |
| TS6 | `test/commands.test.ts`（71） | status 文案与计数 | harness：`catalog` → `scope`（L353–356、L406、L421、L459）；删「被其他作用域隐藏」三段断言（L725、L733、L748）；L698 两态测试文案改会话口径；L714 改写为「可关对象只由 scoped ∪ carried 推出」；L742 层未就绪断言改为新的降级行；新增「关闭会话外工具 → 0 个工具定义 / 已记录（会话口径）」 |
| TS7 | `test/wire-contract.test.ts`（263） | 夹具与 strict 边界 | `SNAPSHOT` 去掉 `hiddenByOthers`、`stats.catalog`、`stats.shadowed`、各 `tool.shadowed`（L97/107/126/145/158/160/782）；键集合断言（L754）去 `hiddenByOthers`；`dropAt`/`setAt` 用例改（L850、L852 附近）；新增「旧形状出现即拒绝」三条（`stats.catalog` / `tool.shadowed` / `hiddenByOthers`）；交叉可赋值段（L1113–1143）保持。**B 在同文件追加 `WorkspaceValue.universe` 的夹具与 strict 边界（见 TS15）** |
| TS8 | `test/tool-panel.test.tsx`（30） | 面板 UI 两计数 / 两态锁 | 夹具去 `shadowed` / `hiddenByOthers` / `stats.catalog\|shadowed`（L100、L141、L183–185、L561–562、L598）；删「被其它作用域隐藏的行 disabled」（L461–472）；新增「状态摘要只渲染两计数」。**B 在同文件重写默认档两分区用例（见 TS13）** |
| TS9 | `test/panel-client.test.ts`（42）、`test/panel-controller.test.ts`（42） | 夹具瘦身 | 两文件的 `snapshot()` 夹具：删 `hiddenByOthers`、`stats.catalog`、`stats.shadowed`（L55–57、L74；L68–70、L452、L938）。**B 续改 `WorkspaceValue` 夹具（见 TS18）** |
| TS10 | `test/locale-parity.test.ts`（10） | 必读键表 | `REQUIRED_KEYS` 删 `entry.shadowed`（L97）、`state.catalog`（L148）、`state.shadowed`（L150）；其余断言（zh/en 双向相等、无重复键）自动覆盖删除。**B 续改同一张表（删 8 键 / 加 12 键）** |
| TS11 | `test/skill-panel.test.tsx`（10）、其余技能面套件（`test/skills-plan.test.ts` 29） | **不改行为** | `SkillView.shadowed` 与技能行两态全部保留；`test/bundle.test.ts`（5→实测 6）字面量表（L57–68）与本变更无交集，零改动 |

### 1.5 A 部分：规范落档（根仓 dsh-plugins，**阶段 2 起草，本阶段不写 `openspec/`**；B 已把 S1 重基线，见 ③ 3.21 与 G10）

| # | 路径 | 改动意图 | 关键改动点 |
|---|---|---|---|
| S1 | `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/specs/dsh-session-tool-toggle/spec.md`（**新建**） | 落 D4（**B 后按 ③ 3.21 重写**） | `## MODIFIED Requirements` → `### Requirement: Web 配置界面` 全文（含既有场景）+ 新场景「面板清单 SHALL 只含本会话有效工具（scoped ∪ carried）」（建议正文见 ③ 3.13；B 的增量见 ③ 3.21） |
| S2 | 同上变更目录的 `diff-matrix.md`（**新建**） | 推翻留痕 | 逐条记录推翻 `2026-11-02-session-tool-toggle` 的 **R15①**、**R18①**、**R20①**；B 增补「unify 的草稿丢弃接受项失效」一条（见 附 B） |
| S3 | 同上变更目录的 `proposal.md` / `tasks.md`（**新建**） | 预期管理与排期 | `tasks.md` 的 T1–T10 与本蓝图 G1–G10 **一一对应**（组名、文件、出口命令逐条照搬）；`proposal.md` 写清与 `/inventory` 的两处刻意差异、执行顺序依赖（unify 先提交/执行完成/归档）与 B 的界面改造范围 |

### 1.6 B 部分：新触达面（`W*` 编号续 A 体系：W = workspace/defaults 面；**全部在子包 session-tool-toggle**）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| W1 | `src/contract.ts` | 新增「默认档宇宙」wire 形状 + 扩展 `WorkspaceValue`（strict 同步收紧） | 新增 `DefaultsEntry` / `DefaultsGroup` / `DefaultsUniverse`（形状见 ③ 3.15）；`WorkspaceValue` 加 `universe: DefaultsUniverse \| null`（L442–448）；新增三张 strict 键表 `DEFAULTS_ENTRY_KEYS` / `DEFAULTS_GROUP_KEYS` / `DEFAULTS_UNIVERSE_KEYS`（放在 L1009–1016 的 `WORKSPACE_*_KEYS` 区旁）与三个 reader `readDefaultsEntry` / `readDefaultsGroup` / `readNullableDefaultsUniverse`（放在 L1262–1330 的 `readWorkspaceChoice`/`readWorkspaceView`/`readNullableWorkspaceView` 旁）；`parseWorkspaceValue`（L1505）的 strict 键表加 `'universe'` 并读取（`null` 合法） |
| W2 | `src/host/panel.ts` | 新增纯函数 `buildDefaultsUniverse`（宿主侧唯一宇宙构建器） | 复用同文件既有私有件：`mcpPartsOf`（L613）、`isReservedName`（L634，**同文件私有函数，不是 address.ts 的导入**）、`SKILL_NAME`（L72）、`BUILTIN_GROUP_KEY`（L75）、`descriptionOf`（L650）、`sortedTexts`（L698）/`compareText`（L711）；导出 `DefaultsUniverseInputs` 与 `buildDefaultsUniverse`（签名见 ③ 3.16）；**不改** `buildPanelSnapshot`/`buildGroups`/`toolEntryOf` 的现有行为（A 的 G4 先落地，B 只加新导出） |
| W3 | `src/host/rpc.ts` | `workspace` 端点响应承载宇宙（读与写两份响应） | 新增 `EMPTY_UNIVERSE` 常量与 `universeOf(deps, session)`（见 ③ 3.17，落在 `skillsOf`（L836）旁）；`handleWorkspace`（L405）在 `action==='read'` 与写成功两个 `WorkspaceValue` 字面量里都补 `universe`，取值 `resolved.target.kind === 'session' ? universeOf(deps, resolved.target.session) : null`；`WorkspaceValue` 组装后仍过 `checked(parseWorkspaceValue(...))` 自检 |
| W4 | `src/client/defaults-view.ts`（**新建**，纯函数，无 React） | 目标无关宇宙 → 目标档视图的派生 | `switchAddressesOf(universe)`（组开关 + 行开关地址集合，去重）、`defaultsCountsOf(universe, disabled)` → `{listed, inDefaults, residual}`、`residualOf(universe, disabled)`（排序）、`universeOfSnapshot(snapshot)`（D10 的用户级宇宙：`groups` 投影 + `skills` 重组技能行；见 ③ 3.18）；**不 import 任何宿主模块**，只 `import type` `contract.ts` |
| W5 | `src/client/DefaultsGroupList.tsx`（**新建**） | 分组开关清单（两编辑器共用） | 复用 `ToolPanelGroups` 的**模式与样式类**，不共用组件：MCP 组默认折叠、技能组默认展开、内置工具组带过滤输入、组开关打组地址、行开关打行地址、`checked = !disabled.has(address)`、锁态两态（`protected`/`reserved`，复用 `entry.protected`/`entry.reserved`/`badge.*`）、整组地址在档里时行整体禁用并给 `defaults.groupOff` 标签、`layerReady:false` 时给 `defaults.universeUnavailable` + 只渲染残留区、`skillsAvailable:false` 时技能组只留组开关 + `skill.unavailable`、残留区 chips（只可移除）；props 见 ③ 3.19 |
| W6 | `src/client/DefaultsSectionFrame.tsx`（**新建**） | 面板两分区的可折叠壳（D13） | `<section>` + 折叠标题行（复用 `.groupHeader/.groupToggle/.groupTitle/.groupCounts` 与 chevron 图标），**默认收起**，`aria-expanded`；标题行显示 `defaults.summary`；只在面板形态使用（统一弹窗分节不折叠） |
| W7 | `src/client/DefaultsEditor.tsx`（**重写**） | 用户级默认档改分组开关界面（D10） | 删自由文本添加（`splitAddresses`、`draft`、`canAdd`、`add()`、`Input`/`Button` 的 add 行）；改为 `DefaultsSectionFrame`（折叠）+ 路径/损坏告警 + `defaults.counts` 三计数 + `<DefaultsGroupList>`（宇宙由新 prop `universe` 传入）+ 残留区 + `defaults.cliHint` + 不追溯三句（`defaults.scope`/`defaults.snapshot`）+ 清空（两段式 `reset`，保留）+ `saved`/`failure`；`PanelFailure` 类型仍从这里导出（`WorkspaceEntry.tsx`/`ToolPanelAction.tsx` 已依赖该导出路径） |
| W8 | `src/client/WorkspaceDefaultsEditor.tsx`（**重写**） | 工作区默认档改分组开关界面（两形态） | 删自由文本添加；`variant='dialog'` 保留标题 + 工作区下拉（`workspace.select`）+ 刷新；`variant='section'` 用 `DefaultsSectionFrame`（D13，默认收起、标题 `workspace.title`、摘要 `defaults.summary`）；共有：键/路径/登记态/损坏告警、`defaults.counts`、`<DefaultsGroupList universe={universe} disabled={workspace.disabled}>`、残留区、`workspace.cliHint`、`workspace.scope` + `workspace.union`、清空两段式、`saved`/`failure`；`workspace===null` 仍只读降级（`workspace.unresolved`） |
| W9 | `src/client/WorkspaceEntry.tsx`（改造） | 统一弹窗分节接宇宙（含跨目标缓存） | `WorkspaceDefaultsSection` 增加「记住上一份宇宙」：`const remembered = useRef<DefaultsUniverse \| null>(null)`，渲染用 `value?.universe ?? remembered.current`，`select` 包装成 `selectAndRemember`（切换前把当前非空宇宙存 ref）；`WorkspaceDefaultsEditor` 多传 `universe`；**`useWorkspaceDefaults` 状态机一行不改**（unify 裁定「迁移只剥壳、不动状态机」，B 沿用） |
| W10 | `src/client/ToolPanelAction.tsx`（改造） | 面板接线：快照投影宇宙 + 两编辑器 | `const universe = useMemo(() => universeOfSnapshot(snapshot), [snapshot])`（`snapshot` 定义后才建）；`WorkspaceDefaultsEditor` 增 `universe`；`DefaultsEditor` 增 `universe`；两编辑器现在各自渲染 `<section>`（含折叠壳），容器**不再**包额外 `<section>`；「六段」注释与 `section.defaults` 段落说明更新（折叠态） |
| W11 | `src/client/locales.ts` | 新增 12 键 / 删除 8 键（zh + en） | 键表见 ③ 3.20；删除 `defaults.add` / `defaults.addPlaceholder` / `defaults.placeholder` / `defaults.empty` / `workspace.add` / `workspace.addPlaceholder` / `workspace.placeholder` / `workspace.empty`；`defaults.note` 是既有死键（无人读），不在本次删除范围（避免无关 churn） |
| W12 | `src/client/panel.module.css` | 新样式 + 旧样式清理 | 复用既有 `.groups/.group/.groupHeader/.groupToggle/.groupTitle/.groupName/.groupCounts/.rows/.row/.rowName/.name/.tag/.pending/.filter/.filterRow/.empty/.chips/.chip/.address/.muted/.meta`；新增 `.sectionFrame`（折叠分区外壳的间距）、`.residual`（残留区标题行）；删除 `.addInput`（唯一使用者是已删的自由文本输入；`.addRow` 仍被 dialog 下拉行使用，保留）；`.tag` 注释（L264）随 A 已改，B 不加第三态 |
| W13 | `lib/index.js`、`lib/client.js` | 重建产物（随仓库提交） | 同 A 的 B1；B 结束后 `pnpm build` 一次，验收 grep 见 附 A |
| W14 | `README.md`（插件根） | B 的界面口径与已知限制 | 「Web 面板」段：六段布局改写为「两个默认档分区默认折叠、点开是分组开关清单」；「已知限制」新增三条：① 两个默认档界面只列本会话可见工具（跨清单地址走 `/tools default off` / `/tools workspace off`；后者只作用本会话所属工作区，其他工作区需手改 `workspaces.json`）；② 统一弹窗切到其他工作区时清单仍是「当前会话视角」的近似（U1），该工作区私有 project-mcp 工具行不出现；③ 已关（carried）条目无 `description`（A 的 P2 代价在默认档界面同样成立） |
| W15 | `plugins/workspace-config/**` | **零修改（核实后判定）** | holder 的分节座位契约、nav 投影、内容列滚动（`dialog.module.css:199–205` 的 `.panel{overflow-y:auto}`）足以承载变长的分组清单；本变更不读 holder 的运行时代码，只 `import type` 既有座位类型 |

### 1.7 B 部分：测试（续 A 的 TS 编号）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| TS12 | `test/workspace-editor.test.tsx`（重写，现 570 行 / 27 用例） | 工作区编辑器两形态的新断言面 | 删除 5 条「添加框 / 回车 / 空输入」用例（现 L216–240 区段）、`workspace.add*` 文案断言；保留并迁移：下拉切换（L177–214）、失败/成功展示（L289–320）、section/dialog 壳、`WorkspaceDefaultsSection` 的读取与共用状态（L472–570）；新增：折叠默认收起与展开、三计数行、组开关/行开关提交 `off`/`on`、锁态两行禁用、整组关闭时行禁用 + 标签、残留区只读可移除、`universe=null` 的降级、切换工作区后**分组清单仍在**（缓存回归）、无任何添加入口（`queryByPlaceholderText` 对已删键不可用 → 改断言「不存在 `zh['workspace.cliHint']` 以外的输入」与 CLI 提示在场） |
| TS13 | `test/tool-panel.test.tsx`（续改，现 30 用例） | 面板两分区折叠 + 两编辑器接线 | 现 L600–880 的默认档/工作区档用例重写：两分区默认收起（断言 `<ul>`/开关不在文档里、`aria-expanded=false`）、点击标题展开、标题摘要计数、用户级行开关 → `client.updateDefaults('off', [addr])`、工作区行开关 → `client.workspace({sessionId, action:'off', addresses})`、`workspace===null` 仍只读、无添加输入 |
| TS14 | `test/defaults-view.test.ts`（**新建**，node 环境） | 纯派生函数的单测 | `switchAddressesOf` 去重与组/行地址齐全；`defaultsCountsOf` 三数（含整组关闭只计组开关）；`residualOf` 排序与差集；`universeOfSnapshot` 的 mcp/builtin 投影、技能重组（`tool:skill` 组地址 + `skill:<name>` 行）、`skills-unavailable` → `skillsAvailable:false`、空 groups |
| TS15 | `test/wire-contract.test.ts`（续改） | `WorkspaceValue.universe` 的 strict 边界 | 夹具 `WORKSPACE_VALUE`（L206–221）加 `universe`（一份含 mcp/skill/builtin 三组、一份 `null`）；新增拒绝用例：缺 `universe`、`universe` 非对象/非 null、`groups[].kind` 非枚举、组内 `tools[].address` 空串、entry 多键；断言 `parseWorkspaceValue(plain(WORKSPACE_VALUE)).value.universe?.groups[0].tools[0].address` |
| TS16 | `test/rpc.test.ts`（续改） | `workspace` 端点宇宙 | 新增 4 条：`{sessionId}` read → `universe.layerReady=true` 且组序 `mcp → skill → builtin`、carried 名成行；`{sessionId}` 写响应同样带宇宙；`{workspacePath}` read → `universe === null`；`withLayer:false` → `{layerReady:false, skillsAvailable:false, groups:[]}`；`skills:{available:false}` → `skillsAvailable:false` 且技能组仍在 |
| TS17 | `test/panel.test.ts`（续改） | `buildDefaultsUniverse` | 分组桶（mcp/skill/builtin）、carried-only 行（无 description）、`protected`/`reserved` 标记（`bash`/`run_code`）、描述截断 160、`layerReady:false` → 三键空宇宙、`skills.visible ∪ shadowed` 行、`skill` 不在候选时无技能组 |
| TS18 | `test/panel-client.test.ts`、`test/panel-controller.test.ts`（续改） | 夹具补 `universe` | 两文件的 `workspaceValue()`（panel-client L112、panel-controller L101）默认加 `universe: null`；panel-client 增一条「缺 `universe` 即 `bad-response`」；controller 行为断言零改动（控制器不消费宇宙——宇宙由面板快照派生） |
| TS10 | `test/locale-parity.test.ts`（续改） | 键表 | `REQUIRED_KEYS` 删 8 个已删键、加 12 个新键（`defaults.counts/summary/residualTitle/groupCount/groupInDefaults/groupSummary/groupOff/switchLabel/groupSwitchLabel/cliHint/universeUnavailable` + `workspace.cliHint`）；zh/en 双向相等与「无重复键」断言自动覆盖 |

**测试文件数**：22 → **23**（新增 `test/defaults-view.test.ts`）。文件数**不作硬门禁**（沿 A 的 6.3 精神：全绿零 skip 为硬门，逐条断言见 ⑤ 与 附 A）。

### 1.8 明确不改（核实后判定，避免误伤）

| 文件/位置 | 判定依据 |
|---|---|
| `plugins/project-mcp/**` | 本次的**动因提供方**而非修改对象；它的三读并集（`plugins/project-mcp/src/host/isolation.ts`、README.md:59）服务「工作区隔离掩码」，与本插件的「用户开关掩码」是两个问题 |
| `plugins/user-commands/src/host/{index,inventory}.ts`（`/inventory`） | 参考实现，只读；本变更让面板向它靠齐，不改它 |
| `plugins/workspace-config/**`（holder） | 分节座位契约、nav 投影、内容列滚动均够用；B 只 `import type` 既有座位类型（W15） |
| `src/host/{address,state,defaults,workspaces,attribution,record-store,host-runtime,skills-plan}.ts` | 与「工具清单宇宙」无关：地址文法、整值状态、两份默认档文件语义、归属、记录通道、技能遮蔽计划都不读 catalog；B 的写路径零改动（`off/on/reset` 与保护/保留预检不变） |
| `src/host/skills-plan.ts`、`src/client/SkillPanel.tsx`、`src/contract.ts` 的 `SkillView` | 技能分面本就会话作用域；`SkillView.shadowed`（影子 stub 生效标记）**同名不同义，保留** |
| `src/client/panel-client.ts` | 它 import `contract.ts` 的 `parseWorkspaceValue` 并内联进 client bundle，B 的契约变化自动生效；请求体构造（`workspacePayload`）零改动 |
| `src/client/panel-controller.ts` | 面板控制器不消费宇宙（宇宙由 `PanelSnapshot` 客户端投影，见 D-19）；`refreshWorkspace`/`updateWorkspace` 只存 `WorkspaceView`，行为零改动 |
| `src/client/current-session.ts`、`src/client/seats.ts`、`src/client/index.ts` | 座位注册与当前会话探测零改动（B 没新增座位） |
| `ControlDeps` 的其余字段、`Config` 五个键、`cordis.patch.yml`、`package.json` 版本 | 配置面零变化；版本维持 `1.5.0`（D-12，v2 注记见 ④ D-12 与待决 PB2） |
| 根 `README.md`、根 `AGENTS.md` | 功能级一句话已覆盖本插件，无「被其他作用域/全局层」表述 |
| `.gitignore`、`openspec/changes/web-ux-session-manager/*`、`openspec/changes/unify-workspace-config-entry/*`、`plugins/project-mcp/lib/index.js` | 并行会话/他人产物；本变更提交只逐路径 add 自己目录 |

---

## ② 证据锚

> 每条都是当前工作区（含 unify 未提交改动）的**代码事实**（file:line + 片段），不是转述。行号漂移时按片段检索。

### 2.1 A 部分：宿主 / 契约 / 客户端证据锚

| 模块 | 证据（file:line） | 代码事实 |
|---|---|---|
| 全局层读数（根 ctx 闭包） | `src/host/index.ts:273` | `const catalog = (): readonly string[] => ctx.tools.schemas().map((schema) => schema.name)`——无 scope 参数 = 全局层，**会话无关** |
| 全局层读数接入内核 | `src/host/index.ts:764` | `catalog,`（`controlDeps` 字面量最后一项，注释在 L763「R15（任务 9.1）」） |
| 全局层读数接入层 | `src/host/index.ts:642` | `const layer = new SessionLayer({ log, catalog })`——`mount(agent)` 内，agent 已在手却仍注入全局闭包 |
| 描述装配时机 | `src/host/index.ts:812` | `descriptions: () => new Map(ctx.tools.schemas().map((schema) => [schema.name, schema.description ?? '']))`——`apply()` 期一次装配，读的是**根 ctx** |
| 宿主 schema 带 description | `src/host/index.ts:812`（同上） | `schema.description ?? ''` 证明 `tools.schemas()` 的元素含 `description`（H1 的投影字段有真实来源；**B 的 W2 也靠它给默认档行 title**） |
| 模块级 inject | `src/host/index.ts:133` | `export const inject: readonly string[] = ['agents', 'tools']` |
| 会话作用域读数 | `src/host/session-layer.ts:259` | `visibleNames: () => scope.tools.schemas(agent).map((schema) => schema.name)`——显式传 `agent` 当 scope key |
| 参考实现同一表达式 | `plugins/user-commands/src/host/index.ts:213` | `return tools.schemas(agent).map((schema) => schema.name)`——`/inventory` 的会话作用域读数，与本插件 `visibleNames()` 逐字同源 |
| 层 catalog 端口 | `src/host/session-layer.ts:137` | `readonly catalog: () => readonly string[]`（`SessionLayerPorts`），JSDoc 明写「必须是**未掩码**的注册集」 |
| 层 plan 三读 | `src/host/session-layer.ts:1052-1073` | `catalog = this.catalog()` → 失败即 `return undefined`；随后 `scoped = surface.visibleNames()`；`planMask({ catalog, scoped, carried, disabled })` |
| 层读视图降级 | `src/host/session-layer.ts:1062-1070` | `visibleNames()` 抛错 → `absorbFailure(...)` + `scoped = []` 继续算（不是中止） |
| 三态锁 | `src/client/ToolPanelGroups.tsx:108-113` | `if (tool.protected) …; if (tool.reserved) …; if (tool.shadowed) return { tag: t('entry.shadowed'), reason: t('badge.shadowed') }` |
| 面板三读并集 | `src/host/panel.ts:283-284` | `const candidates = sortedTexts([...inputs.catalog, ...inputs.scoped, ...inputs.carried])`；`const catalogNames = uniqueTexts(inputs.catalog)` |
| hiddenByOthers 推导 | `src/host/panel.ts:302-304` | `sortedTexts(catalogNames.filter((name) => !scopedSet.has(name) && !carriedSet.has(name)))` |
| shadowed 条目标记 | `src/host/panel.ts:596` | `shadowed: context.hidden.has(name)` |
| Stats 四计数 | `src/host/panel.ts:357-362` | `{ visible: scopedNames.length, catalog: catalogNames.length, denied: plan.deny.length, shadowed: hiddenByOthers.length }` |
| 内核 catalog 读数 | `src/host/control.ts:819-826` | `function catalogOf(deps) { try { return deps.catalog() } catch { warn; return [] } }` |
| 内核三读并集 | `src/host/control.ts:538` + `L1065-1071` | `const candidates = unionNames(catalog, scoped, applied.deny)`；`Array.from(new Set([...catalog, ...scoped, ...carried]))` |
| 内核 hiddenByOthers | `src/host/control.ts:549-553` | 层未就绪 → `[]`；否则 `catalog.filter(name => !scoped.has(name) && !carried.has(name))` |
| toggle 的 matched 口径 | `src/host/control.ts:338` + `L345-350` | `const catalog = catalogOf(deps)` 后原样传给 `planMask({ catalog, scoped: before.visible, carried: before.deny, … })` |
| PanelReading 字段 | `src/host/control.ts:219-220` + `L235-241` | `readonly catalog: readonly string[]`、`readonly hiddenByOthers: readonly string[]` |
| 面板入参三读 | `src/host/types.ts:470-474` | `catalog` / `scoped` / `carried` 三字段及其 JSDoc |
| ControlDeps.catalog | `src/host/types.ts:409-418` | JSDoc 明写「宿主**全局层**的工具注册名（未掩码，不受任何 agent 限制）」+「两态区分…必须读未掩码的全局层（R15 ①）」 |
| ScopedSurface 现有读数 | `src/host/types.ts:153` | `visibleNames(): readonly string[]`（本变更在同一接口旁加 `visibleSchemas()`） |
| 掩码候选三读 | `src/host/mask.ts:169-171` | `Array.from(new Set([...inputs.catalog, ...inputs.scoped, ...inputs.carried]))` |
| 掩码地址解析 | `src/host/mask.ts:102-125` | `planMask` 的推导顺序（candidates → 逐地址 matched → hitNames → deny/shadowServers） |
| 契约 ToolEntry.shadowed | `src/contract.ts:259-260` | `/** 全局层有、本会话看不见（被别的作用域隐藏）。 */ readonly shadowed: boolean` |
| 契约 StatsView 四计数 | `src/contract.ts:311-321` | `visible / catalog / denied / shadowed` 四字段 + `catalog` 的 JSDoc「全局层（不受任何 agent 限制）名字数」 |
| 契约 PanelSnapshot.hiddenByOthers | `src/contract.ts:375-376` | `/** 全局层有、本会话看不到的名字（两态区分的第二态）。 */ readonly hiddenByOthers: readonly string[]` |
| 契约 strict 键表 | `src/contract.ts:985-994`、`1006`、`1018-1031` | `TOOL_ENTRY_KEYS` 含 `'shadowed'`；`STATS_VIEW_KEYS = ['visible','catalog','denied','shadowed']`；`PANEL_SNAPSHOT_KEYS` 含 `'hiddenByOthers'` |
| 契约 parser | `src/contract.ts:1053-1082`、`1201-1222`、`1348-1369` | 逐字段 `readBooleanField(record,'shadowed')` / `readCountField(record,'catalog'\|'shadowed')` / `readStringArrayField(record,'hiddenByOthers')` |
| RPC descriptions 依赖 | `src/host/rpc.ts:174-180` | `readonly descriptions?: () => ReadonlyMap<string, string>` + 「9.5 的装配层用 `ctx.tools.schemas()` 一次填好」 |
| RPC 组装入参 | `src/host/rpc.ts:808` | `catalog: reading.catalog,`（`PanelInputs` 字面量） |
| RPC 描述读数 | `src/host/rpc.ts:1002-1011` | `descriptionsOf(deps)`：`deps.descriptions === undefined` → undefined；抛错 → warn + undefined |
| 命令面隐藏计数行 | `src/host/commands.ts:914-917` | `return \`被其他作用域隐藏 ${reading.hiddenByOthers.length} 个工具定义（全局层有、本会话不可见）\`` |
| 命令面两态文案 | `src/host/commands.ts:781-783` | `entry.matched > 0 ? '已关闭…' : '已记录：当前无注册工具匹配；服务器上线后自动生效'` |
| 命令面可关对象段 | `src/host/commands.ts:890-904` | serverGroups / builtinNames 计数来自 `reading.serverGroups` / `reading.builtinNames` |
| 浏览器四计数渲染 | `src/client/ToolPanelAction.tsx:201-206` | 四个 `<li>`：`state.visible` / `state.catalog` / `state.denied` / `state.shadowed` |
| 四条文案（zh/en 各四） | `src/client/locales.ts:87,93,156,158,245,251,313,315` | `entry.shadowed` / `badge.shadowed` / `state.catalog` / `state.shadowed`（zh L87/93/156/158，en L245/251/313/315；**A 的原始行号 83/89/152/154、238/244/306/308 因 `section.label` 插入已 +4/+7**） |
| 组件文档串 | `src/client/ToolPanelGroups.tsx:23,93,100-103` + `panel.module.css:264` | 两处注释仍写 `entry.shadowed` / 三态禁用 |
| 插件文档旧口径 | `README.md:77` + `README.md:120` | L77「受保护 / 保留名 / 被其他作用域隐藏的行**禁用**」；L120「**读数取全局层（仅工具）**：面板的工具 `catalog` 与工具描述来自插件自身 ctx 的 `ctx.tools.schemas()`（全局层）」 |
| 产物已跟踪 | `git ls-files plugins/session-tool-toggle/lib` | `lib/client.js`、`lib/index.js` 均被跟踪（`shadowed` 字面量计数 52 / 23，其中技能分面部分保留） |

### 2.2 A 部分：测试与落档证据锚

| 模块 | 证据（file:line） | 代码事实 |
|---|---|---|
| `test/mask.test.ts` | `:27` | `return { catalog: [], scoped: [], carried: [], disabled: [], ...partial }`——替身入参仍是三读，须改两读 |
| `test/panel.test.ts` | `:63` | `catalog: [],`（`inputs()` 的基线入参） |
| `test/control.test.ts` | `:440-442` | `catalog: () => { if (options.catalogError !== undefined) throw options.catalogError; return catalog }`——「全局层读数」是内核算例的注入面 |
| `test/session-layer.test.ts` | `:231-237` | `const ports: SessionLayerPorts = { log, catalog: () => fake.registry(), openSurface: … }` |
| `test/rpc.test.ts` | `:571-578` | `descriptions: () => { if (options.descriptionsError !== undefined) throw options.descriptionsError; return described }` |
| `test/commands.test.ts` | `:459` | `catalog: () => catalog,`（`deps` 字面量里唯一读全局层的一项） |
| `test/wire-contract.test.ts` | `:160` | `stats: { visible: 12, catalog: 214, denied: 2, shadowed: 1 },`（夹具即契约形状） |
| `test/tool-panel.test.tsx` | `:183-185` | `hiddenByOthers: ['web_search'],` + `stats: { visible: 7, catalog: 8, denied: 1, shadowed: 1 }` |
| `test/panel-client.test.ts` / `test/panel-controller.test.ts` | `:55-57` / `:68-70` | 两份 `snapshot()` 夹具同形状（`hiddenByOthers: []` + 四计数） |
| `test/locale-parity.test.ts` | `:97`、`:148`、`:150` | `REQUIRED_KEYS` 里的 `entry.shadowed` / `state.catalog` / `state.shadowed` |
| `test/bundle.test.ts` | `:57-68` | `INLINED_MARKERS` 只含通道/端点/座位名——**明确不改**的判据 |
| 规范落档 S1–S3（**新建**） | `openspec/changes/archive/2026-11-02-session-tool-toggle/diff-matrix.md:140`、`:143`、`:145` | R15 / R18 / R20 三条旧裁定原文位置——S2 的推翻留痕逐条对照它 |

### 2.3 B 部分：新触达模块的证据锚

| 模块 | 证据（file:line） | 代码事实 |
|---|---|---|
| `workspace` 端点（会话形态读） | `src/host/rpc.ts:405-427` | `handleWorkspace`：`resolveWorkspace` → 地址预检 → `choicesOf` → `workspaceFileOf` → 组装 `{workspace, choices, changed}` → `checked(parseWorkspaceValue(...))`；**B 在此补 `universe`** |
| 会话形态的目标解析 | `src/host/rpc.ts:459-488` | `{sessionId}` 走 `liveSessionOf` + `attributionOf`，`resolved.target = { kind:'session', session: live.session }`——**B 直接从这里取会话，不二次寻址** |
| 路径形态没有会话 | `src/host/rpc.ts:489-516` | `{workspacePath}` 只查 `workspaceChoices()` 的 key，`target = { kind:'path', path }`——宇宙只能为 `null` |
| 写响应同样组装 | `src/host/rpc.ts:429-445` | 写成功用 `report.after` 重建 `WorkspaceValue`，不重读文件；**B 的宇宙要在这份字面量里也出现**（否则一次行开关后分组清单消失） |
| 技能分面读取器 | `src/host/rpc.ts:836-850` | `skillsOf(deps, session)`：`layerFor` 缺席 / 抛错 → `undefined`（B 的 `skillsAvailable` 判据） |
| 描述读取器（A 后） | `src/host/rpc.ts:1002-1011` → A 改签名 | `descriptionsOf(deps, session)` 经 `layerFor(session.id)?.visibleSchemas()`——B 的 `universeOf` 另读一次 `visibleSchemas()`（含名字），不复用该函数 |
| 契约 `WorkspaceValue` | `src/contract.ts:442-448` | `{ workspace, choices, changed }`——B 加 `universe` |
| 契约 `WorkspaceView` | `src/contract.ts:332-347` | `{key, title?, registered, disabled, path, readable, corrupt}`——B 的行状态取 `disabled` |
| 契约 `WorkspaceChoice` | `src/contract.ts:324-330` | `{key, title}`——下拉项 |
| 契约 strict 键表区 | `src/contract.ts:1009-1016` | `WORKSPACE_CHOICE_KEYS` / `WORKSPACE_VIEW_KEYS`——B 的三张新键表放在同一区 |
| 契约 reader 区 | `src/contract.ts:1262-1330` | `readWorkspaceChoice` / `readWorkspaceView` / `readNullableWorkspaceView`——B 的三个新 reader 放同一区（`readNullableStringField`（L650）可用于 `group.address: string\|null`） |
| 契约 `parseWorkspaceValue` | `src/contract.ts:1505-1515` | `readStrictObject(raw, subject, ['workspace','choices','changed'])`——**B 加 `'universe'` 后旧形状被拒**（刻意的版本漂移报警，沿 D-14） |
| 面板分组形状（B 的投影源） | `src/host/panel.ts:117-140`（`ToolEntry`）+ `:142-152`（`ToolGroup`） | `ToolGroup{kind,key,address,toolCount,disabledCount,disabled,tools}`、`ToolEntry{name,shortName,address,disabled,protected,reserved,shadowed,description?}`——A 删 `shadowed` 后仍保留 B 需要的 `address/shortName/description/protected/reserved` |
| 技能行形状（B 的投影源） | `src/host/panel.ts:160-170`（`SkillView`） | `SkillView{name,description,disabled,shadowed}`——B 只用 `name/description` 重组成 `skill:<name>` 行 |
| 面板快照的技能/默认档投影 | `src/host/panel.ts:239-268`（`PanelSnapshot` 定义）+ `:340-366`（`buildPanelSnapshot` 的 skills/workspace 组装） | `snapshot.skills` 与 `snapshot.groups` 是客户端 `universeOfSnapshot` 的唯一输入（D-19） |
| 统一弹窗分节（dialog 形态） | `src/client/WorkspaceEntry.tsx:351-413` | `WorkspaceDefaultsSection`：`initialTarget()` 取 `currentSessionId()` → `{sessionId}`；`useWorkspaceDefaults` 的 `select(key)` 把目标切成 `{workspacePath: key}`（L304-309）；**B 在 select 前后加宇宙缓存** |
| 状态机（禁止改动） | `src/client/WorkspaceEntry.tsx:176-312` | `useWorkspaceDefaults` 的 `read`/`update`/`select` 与 `targetRef`/`seqRef`/`saved` 语义——**B 一行不改**（unify 裁定「迁移只剥壳、不动状态机」） |
| 工作区编辑器（现状） | `src/client/WorkspaceDefaultsEditor.tsx:87-288` | chips + 自由文本：`draft`（L99）、`add()`（L117-123）、清单 `<ul className={css.chips}>`（L201-222）、添加行（L224-239）、清空两段式（L134-142）、dialog 下拉（L150-182）——**B 全部重写** |
| 用户级编辑器（现状） | `src/client/DefaultsEditor.tsx:103-221` | `splitAddresses`（L94-96）、`draft`（L113）、`add()`（L117-123）、chips（L157-178）、添加行（L180-195）、清空（L135-142）——**B 全部重写**；`PanelFailure` 导出（L38-43）保留 |
| 面板容器接线（现状） | `src/client/ToolPanelAction.tsx:469-498` | `<WorkspaceDefaultsEditor variant='section' …/>` + `<DefaultsEditor …/>`——**B 在这里注入 `universe`** |
| 面板工作区活视图 | `src/client/panel-controller.ts:89-97` + `:412-478` | `state.workspace`（`WorkspaceView`）/`workspaceChoices`/`savingWorkspace`/`workspaceSaved`/`workspaceError` 与 `refreshWorkspace`/`updateWorkspace`——B 不改控制器，只用其既有状态 |
| 面板默认档活视图 | `src/client/panel-controller.ts:73-80` + `:384-400` | `state.defaults`/`savingDefaults`/`defaultsError` 与 `updateDefaults`——B 不改 |
| 面板快照派生宇宙的输入 | `src/client/panel-controller.ts:283-292` | `refresh()` 里 `snapshot`/`defaults`/`workspace` 三路落状态——B 的 `universeOfSnapshot(snapshot)` 就在渲染层做，不进控制器 |
| 会话面板分组组件的可复用件 | `src/client/ToolPanelGroups.tsx:70-89` + `:218-240` | `groupTitle(kind)` / `defaultExpanded(kind)` 两个纯函数；过滤器只在 builtin 组（`.filterRow`）——B 从该文件**只导出这两个函数**复用 |
| 面板样式类清单 | `src/client/panel.module.css:140-289`（分组与行）、`:291-317`（chips）、`:337-352`（addRow/addInput） | `.groups/.group/.groupHeader/.groupToggle/.groupTitle/.groupName/.groupCounts/.rows/.row/.rowName/.name/.tag/.pending/.empty`、`.chips/.chip/.address`、`.addRow/.addInput`——B 复用前两组、删 `.addInput` |
| 折叠箭头与开关的现成图标/原语 | `src/client/ToolPanelGroups.tsx:31-36` | `IconChevronDownOutlineRegular` / `IconChevronRightOutlineRegular` / `Input` / `Switch` 均来自 `@deepseek-ai/dsh-client-ui-primitives`——B 的新组件同源 |
| 技能降级文案 | `src/client/SkillPanel.tsx:141-148` | `unavailable` → 整块只渲染 `t('skill.unavailable')`——B 的技能组行区沿同一纪律（组开关仍保留，见 D-23） |
| 新建客户端文件（无既有行号） | `src/client/defaults-view.ts` / `src/client/DefaultsGroupList.tsx` / `src/client/DefaultsSectionFrame.tsx` / `test/defaults-view.test.ts` | **新建**（本表无既有 file:line 可引）：其模式来源见下方「会话面板分组组件的可复用件」「面板样式类清单」「折叠箭头与开关的现成图标/原语」三行；接口与数据形状见 ③ 3.18 / ③ 3.19 |
| 定位「组开关 + 行开关」的现有先例 | `src/client/ToolPanelGroups.tsx:193-257` | 组标题行右侧组开关打 `group.address`、行开关打 `tool.address`——B 的 `DefaultsGroupList` 用同一交互相位 |
| 统一弹窗内容列可滚动 | `plugins/workspace-config/src/client/dialog.module.css:199-205` | `.panel { flex: 1 1 auto; min-height: 0; overflow-y: auto; }`——变长分组清单由 holder 内容列滚动承载（B 不触 holder） |
| 分节挂载/卸载时机 | `plugins/workspace-config/src/client/WorkspaceConfigDialog.tsx:139-152` | 内容列 `renderSlot('workspace-config.section', { close }, { only: activeId })`：切走即卸载、切回重新挂载——B 的「记住宇宙」只在同一挂载期内有效（切回后重新 `{sessionId}` 读，宇宙自然回来） |
| 座位常量与注册 | `src/client/seats.ts:64-89` + `src/client/index.ts:204-230` | `SECTION_SEAT='workspace-config.section'`、`SECTION_ORDER=20`、`inject` 面 `resolveClient`/`currentSessionId`——B 零改动 |
| 当前会话探测 | `src/client/current-session.ts:55-96` | `currentSessionIdOf(ctx)` 两步探测——B 的 dialog 形态宇宙锚点就是它 |
| `/tools default` 子命令（D8 兜底） | `src/host/commands.ts:189-190` + `:217-237` | `case 'default': return defaultsParse(rest)`；`default off\|on\|set\|reset <地址…>` 的解析与拒绝文案 |
| `/tools workspace` 子命令（D8 兜底） | `src/host/commands.ts:191-192` + `:248-275` | `case 'workspace': return workspaceParse(rest)`；**只作用本会话所属工作区**（L243-245 注释：不提供 `--path` 形态）——B 的已知限制来源 |
| 写路径预检（零改动凭据） | `src/host/rpc.ts:704-760` + `src/host/control.ts:641-730` | `precheckAddresses`（保护 > 保留名 > 文法）与 `updateWorkspaceDefaults`——B 不改写路径 |
| 版本 | `plugins/session-tool-toggle/package.json`（当前与 HEAD 均 `1.5.0`） | D-12 维持 1.5.0；unify 收口任务 `10.1` 用 `node scripts/release.mjs 1.6.0 --dry-run` **只演练不打 tag**（见待决 PB2） |

---

## ③ 接口与数据形状

### 3.1 A 部分：推导链总览（before → after）

```
【旧】candidates = catalog ∪ scoped ∪ carried        【新】candidates = scoped ∪ carried
      deny       = candidates 命中关闭地址                  deny       = candidates 命中关闭地址（不变式）
      matched    = 每地址在 candidates 的命中数              matched    = 同（0 保留键）
      hiddenByOthers = catalog \ (scoped ∪ carried)         hiddenByOthers = 删除（恒空集合无意义）
      stats      = {visible, catalog, denied, shadowed}      stats      = {visible, denied}
      descriptions = 根 ctx 全局读数                         descriptions = 本会话层 visibleSchemas()
```

三条不变式（施工时必须逐条成立，⑤ G2/G3 有对应断言）：

1. **deny ⊆ 读数名**：`restrict` 对未知名抛错，`deny` 只能来自 `scoped ∪ carried`；
2. **carried 保底**：`plan.deny` 在 `disabled` 不变时 ⊇/≡ 上一轮 deny（瞬时读数失败不会抬掩码）；
3. **intentOnly 仍在**：`matched === 0` 的工具地址照旧进 `intentOnly`，`shadowServers` 照旧由 `mcp-group` 地址产生（与命中无关）。

### 3.2 A 部分：`src/host/types.ts`（端口与形状）

```ts
/** 工具 schema 的轻量投影（面板描述来源；刻意不带 parameters）。 */
export interface VisibleToolSchema {
  readonly name: string
  readonly description?: string
}

export interface ScopedSurface {
  // …既有 restrict / guard / section / sectionOrder 不变
  /** 该 agent 视角名字（上一轮掩码已生效，因此可能缺名字）。 */
  visibleNames(): readonly string[]
  /** 该 agent 视角下**当前可见**工具的名字 + 描述投影（与 visibleNames 同一读数面）。 */
  visibleSchemas(): readonly VisibleToolSchema[]
}

export interface LayerHandle {
  // …既有 setState / snapshot / visibleNames / skills / skillsSettled 不变
  /** 本会话当前可见工具的名字 + 描述（面板描述来源；未挂载/退场/读失败 → 空数组）。 */
  visibleSchemas(): readonly VisibleToolSchema[]
}

export interface ControlDeps {
  // …其余字段不变
  // ❌ 删除：readonly catalog: () => readonly string[]
}

export interface PanelInputs {
  // ❌ 删除：readonly catalog: readonly string[]
  readonly scoped: readonly string[]
  readonly carried: readonly string[]
  // …其余不变
}
```

**A 删除清单（类型层强制，编译器就是验收器）**：`ControlDeps.catalog`、`PanelInputs.catalog`、`MaskInputs.catalog`、`SessionLayerPorts.catalog`、`RpcDeps.descriptions`、`PanelReading.catalog`、`PanelReading.hiddenByOthers`、`ToolEntry.shadowed`、`Stats.catalog`、`Stats.shadowed`、`PanelSnapshot.hiddenByOthers`。
**A 同名保留**：`ClosedAddressReading.shadowed`（mcp 整组「指令段已遮蔽」）、`SkillView.shadowed` / `SkillLayerSnapshot.shadowed`（技能影子 stub 生效）。
**B 复用**：`VisibleToolSchema` 是 `buildDefaultsUniverse` 的 scoped 入参类型（③ 3.16）。

### 3.3 A 部分：`src/host/mask.ts`

```ts
export interface MaskInputs {
  /** 该 agent 视角名字（`tools.schemas(agent)`；上一轮掩码已生效 → 会缺名字）。 */
  readonly scoped: readonly string[]
  /** 上一轮 deny 里仍受管的名字（否则第二读会缩小 → 掩码被抬掉，振荡）。 */
  readonly carried: readonly string[]
  /** 本会话关闭集（规范形文本）。 */
  readonly disabled: readonly string[]
}

function unionNames(inputs: MaskInputs): readonly string[] {
  return Array.from(new Set([...inputs.scoped, ...inputs.carried]))
}
```

`planMask` 的返回形状 `{ deny, shadowServers, matched }` **一字不改**（契约面零影响）；改变的只是候选集。
语义副作用（写进文件头，施工期勿“优化”掉）：

| 用户操作 | 旧行为 | 新行为 |
|---|---|---|
| `off mcp:dbx`（dbx 本会话不可见） | deny 立刻含全局层 `mcp__dbx__*`（restrict 幂等接受）→ 实际加了一层掩码 | `matched: 0`、`deny: []`、`shadowServers: ['dbx']`、状态记 `mcp:dbx` → **纯意图**；dbx 出现后由 `tools/change → refresh()` 补上 |
| `off tool:web_search`（本会话本来就看不见） | 同上，进全局层名字 | 同上，纯意图 |
| `off mcp:a`（a 本会话可见） | 行为不变 | 行为不变（候选集里就有） |

### 3.4 A 部分：`src/host/session-layer.ts`

```ts
export interface SessionLayerPorts {
  readonly log: SpecLog
  // ❌ 删除 readonly catalog: () => readonly string[]
  readonly openSurface?: SurfaceOpener
}

private plan(surface: ScopedSurface, carried: readonly string[]): MaskPlan | undefined {
  let scoped: readonly string[]
  try {
    scoped = surface.visibleNames()
  } catch (error) {
    // agent 作用域可能先于插件退场；它自己的 disposer 会 detach 本层 → 降级空读数继续算
    this.absorbFailure(error, `${this.label()}：读本会话的工具视图失败`)
    scoped = []
  }
  if (this.retreat) return undefined
  return planMask({ scoped, carried, disabled: this.state.disabled })
}

visibleSchemas(): readonly VisibleToolSchema[] {
  const surface = this.surface
  if (surface === undefined || this.retreat) return []
  try {
    return surface.visibleSchemas()
  } catch (error) {
    this.absorbFailure(error, `${this.label()}：读本会话的工具描述失败`)
    return []
  }
}

// surfaceOf()：
visibleNames: () => scope.tools.schemas(agent).map((schema) => schema.name),
visibleSchemas: () => scope.tools.schemas(agent).map(({ name, description }) => ({ name, description })),
// AgentServiceScope.tools.schemas 的返回类型：readonly { readonly name: string; readonly description?: string }[]
```

**行为差异（必须写进测试，不许当实现细节）**：删掉 catalog 读之后，「读视图失败」不再有全局层兜底。

- 非退场错误且 `carried` 非空（常规重算）：`plan.deny = carried ∩ disabled` ≡ 上一轮 → **掩码不被抬**；
- 非退场错误且 `carried` 为空（首次挂载即读失败）：`deny = []` → 本轮不装掩码，**guard 仍在拦**（`installGuard` 先于 `applyDeny`），下一次 `tools/change` 收敛；
- `inactive context`：`absorbFailure` 置 `retreat` → `plan()` 返回 `undefined` → 整轮跳过（与旧行为一致）。

### 3.5 A 部分：`src/host/control.ts`

```ts
export interface PanelReading {
  // ❌ 删除 readonly catalog: readonly string[]
  // ❌ 删除 readonly hiddenByOthers: readonly string[]
  readonly scoped: readonly string[]      // 保留（= 会话可见名）
  readonly visible: number                // 保留（= scoped.length）
  readonly appliedDeny: readonly string[] // 保留（= carried）
  // …其余不变
}

// toggleSession：删 catalogOf 调用
const plan = planMask({
  scoped: before.visible,
  carried: before.deny,
  disabled: parsed.entries.map((entry) => entry.text),
})

// readPanel：删 catalogOf 调用与 hiddenByOthers
const plan = planMask({ scoped, carried: applied.deny, disabled: state.disabled })
const candidates = unionNames(scoped, applied.deny)

function unionNames(scoped: readonly string[], carried: readonly string[]): readonly string[] {
  return Array.from(new Set([...scoped, ...carried]))
}
```

`catalogOf()` **整函数删除**（它是唯一读全局层的内核路径；保留会让「只有一个宇宙」在类型层留缺口）。

### 3.6 A 部分：`src/host/panel.ts`

```ts
export interface ToolEntry {
  readonly name: string
  readonly shortName: string
  readonly address: string
  readonly disabled: boolean
  readonly protected: boolean
  readonly reserved: boolean
  // ❌ 删除 readonly shadowed: boolean
  readonly description?: string
}

export interface Stats {
  /** 本会话当前可见工具数（掩码后）。 */
  readonly visible: number
  /** 当前 deny 名字数（= 掩码实际生效量）。 */
  readonly denied: number
}

export interface PanelSnapshot {
  // ❌ 删除 readonly hiddenByOthers: readonly string[]
  readonly intentOnly: readonly string[]
  readonly stats: Stats
  // …其余不变
}

interface EntryContext {          // ❌ 删 hidden 字段
  readonly deny: ReadonlySet<string>
  readonly protectedNames: ReadonlySet<string>
  readonly descriptions: ReadonlyMap<string, string> | undefined
}
```

`buildPanelSnapshot` 的候选集与统计：

```ts
const candidates = sortedTexts([...inputs.scoped, ...inputs.carried])
const scopedNames = uniqueTexts(inputs.scoped)
const plan = planMask({ scoped: inputs.scoped, carried: inputs.carried, disabled: inputs.state.disabled })
// intentOnly 推导一字不改（plan.matched 0 命中 ∪ 技能地址无安装）
stats: { visible: scopedNames.length, denied: plan.deny.length }
```

### 3.7 A 部分：`src/host/rpc.ts`

```ts
export interface RpcDeps extends ControlDeps {
  readonly agents: AgentLookup
  // ❌ 删除 readonly descriptions?: () => ReadonlyMap<string, string>
  readonly kernel?: RpcKernel
}

/** 读本会话工具描述；层缺席 / 读数抛错 → 空 Map（D6 降级），面板照常可用。 */
function descriptionsOf(deps: RpcDeps, session: SessionLike): ReadonlyMap<string, string> {
  const layer = deps.layerFor(session.id)
  if (layer === undefined) return EMPTY_DESCRIPTIONS
  try {
    return new Map(layer.visibleSchemas().map((row) => [row.name, row.description ?? '']))
  } catch (error) {
    deps.log.warn(`无法读取本会话工具描述（面板将不展示 description）：${messageOf(error)}`)
    return EMPTY_DESCRIPTIONS
  }
}

// snapshotOf 里：
const descriptions = descriptionsOf(deps, session)
const inputs: PanelInputs = {
  // …删掉 catalog: reading.catalog,
  descriptions,             // 恒传（空 Map 与「缺席」对构建器等价的输出）
  // …
}
```

### 3.8 A 部分：`src/host/index.ts`

```ts
// ❌ 删除整个 catalog 闭包（原 L267-273）
const layer = new SessionLayer({ log })                 // mount()：不再注入 catalog
const controlDeps: ControlDeps = { /* …删 catalog, */ }
const rpcDeps: RpcDeps = { ...controlDeps, agents: agentsPort }  // 不再有 descriptions
export const inject: readonly string[] = ['agents', 'tools']      // 保留（D-6）
```

### 3.9 A 部分：`src/host/commands.ts`（文案形状，逐字）

| 位置 | 现状 | 新形态 |
|---|---|---|
| 段 6（L688–690） | `【保护名单】N 项：…` + `  · 被其他作用域隐藏 N 个工具定义（全局层有、本会话不可见）` | **只剩** `【保护名单】N 项：…`（`hiddenText` 整函数删除） |
| `switchableText`（L890–904） | 恒报 `MCP 服务器 N 台（…）；内置工具 N 个；单工具关闭 N 项` | 首行加降级分支：`if (!reading.layerReady) return '【可关对象】会话层未就绪：无法读取本会话的工具清单（本会话开关与默认档不受影响）'`；其余逐字不变 |
| `closedStateText` matched=0（L783） | `'已记录：当前无注册工具匹配；服务器上线后自动生效'` | `'已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效'` |
| `closedStateText` `skill` 分支（L769–779） | 三态 | **不变**（技能分面口径未变） |
| 段 1 注释（L653–655） | 「全局层有、本会话关」vs「从未注册」 | 「本会话命中」vs「本会话暂无匹配」 |

### 3.10 A 部分：`src/contract.ts`（wire 形状）

```ts
export interface ToolEntry { /* 删 shadowed */ }
export interface StatsView { readonly visible: number; readonly denied: number }
export interface PanelSnapshot { /* 删 hiddenByOthers */ }

const TOOL_ENTRY_KEYS = ['name','shortName','address','disabled','protected','reserved','description'] as const
const STATS_VIEW_KEYS = ['visible','denied'] as const
const PANEL_SNAPSHOT_KEYS = ['sessionId','createdAt','state','groups','protectedNames','defaults',
  'intentOnly','stats','notices','skills','workspace'] as const
```

**wire 快照 diff 样例**（旧 → 新，同一会话）：

```jsonc
// 旧
{ "groups": [{ "kind": "mcp", "key": "a", "address": "mcp:a", "toolCount": 1, "disabledCount": 1, "disabled": true,
    "tools": [{ "name": "mcp__a__x", "shortName": "x", "address": "mcp:a::x",
                "disabled": true, "protected": false, "reserved": false, "shadowed": false }] }],
  "hiddenByOthers": ["mcp__dbx__query"],
  "stats": { "visible": 12, "catalog": 214, "denied": 2, "shadowed": 1 } }

// 新
{ "groups": [{ "kind": "mcp", "key": "a", "address": "mcp:a", "toolCount": 1, "disabledCount": 1, "disabled": true,
    "tools": [{ "name": "mcp__a__x", "shortName": "x", "address": "mcp:a::x",
                "disabled": true, "protected": false, "reserved": false }] }],
  "stats": { "visible": 12, "denied": 2 } }
```

strict parser 因此把旧形状当「未知字段」拒绝：这是**刻意的版本漂移报警**（双端同仓同 bundle，无独立部署窗口）。

### 3.11 A 部分：浏览器半

```ts
// ToolPanelGroups.tsx —— 两态锁
function lockOf(tool: ToolEntry, t: Translate): LockNotice | undefined {
  if (tool.protected) return { tag: t('entry.protected'), reason: t('badge.protected') }
  if (tool.reserved) return { tag: t('entry.reserved'), reason: t('badge.reserved') }
  return undefined
}

// ToolPanelAction.tsx —— 状态摘要两计数
<ul className={css.counters}>
  <li>{t('state.visible', { visible: stats.visible })}</li>
  <li>{t('state.denied', { denied: stats.denied })}</li>
</ul>

// locales.ts —— 删除的四个键（zh / en 各四）
// entry.shadowed / badge.shadowed / state.catalog / state.shadowed
```

`mutation.kv`（`stats.denied` 正增量）与关闭集 chip 全部不变。

### 3.12 A 部分：配置键与文件位置（**零变化**）

`Config` 五键（`storage` / `protectedTools` / `defaultsFile` / `workspacesFile` / `hostModuleBase`）、`cordis.patch.yml`、两份档文件形状与权限位、会话记录类型与投影 `stateVersion` 全部不动；`package.json` 版本维持 `1.5.0`（B 同）。

### 3.13 A 部分：D4 的 spec delta 建议正文（阶段 2 落 S1；**B 后按 ③ 3.21 重写**）

```markdown
## MODIFIED Requirements

### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：…（既有正文逐字保留）…

#### Scenario: 面板清单只含本会话有效工具（scoped ∪ carried）

- **WHEN** 另一机制（如 project-mcp 的工作区隔离）在宿主全局层注册了本会话不可见的 MCP 服务器，用户打开本插件的面板或执行 `/tools status`
- **THEN** 这些服务器 SHALL NOT 出现在面板的工具分组与 `/tools status` 的可关对象计数里；清单宇宙 = 本会话可见工具（`tools.schemas(agent)`）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在面板里，否则关闭即消失、无法再打开）；宿主 SHALL NOT 返回「被其他作用域隐藏」的计数或徽标字段
```

---

**以下 3.14–3.22 为 B 部分（默认档分组开关界面）。**

### 3.14 数据面总览（一张图）

```
【宿主】session layer（A 改造后）
  layer.visibleSchemas() ──┐
  layer.snapshot().deny ───┼→ buildDefaultsUniverse() → DefaultsUniverse {layerReady, skillsAvailable, groups[]}
  layer.skills() ──────────┘                                       │
                                                                   ├─ workspace 端点 {sessionId} 响应：{workspace, choices, changed, universe}
                                                                   │        （{workspacePath} 响应：universe = null）
【浏览器】
  统一弹窗分节（WorkspaceDefaultsSection）：
      value.universe ?? remembered.current ──┐
      目标档 workspace.disabled ─────────────┼→ 行开关 checked = !inDefaults
      用户级编辑器（面板）：                  │   defaultsCountsOf(universe, disabled) → {listed, inDefaults, residual}
        universeOfSnapshot(snapshot) ────────┤   residualOf(...) → 残留 chips
        state.defaults.disabled ─────────────┘
      工作区分区（面板）：
        universeOfSnapshot(snapshot) + state.workspace.disabled
【写路径】行/组开关 → off / on（地址即行/组地址）；清空 → reset（两段式）；跨宇宙地址 → CLI
```

**关键取舍**：宇宙是**目标无关**的（只由会话决定），目标档只决定「哪些开关是关的」；因此宿主只传宇宙、不传 `inDefaults`/`residual`/计数（D-17）。

### 3.15 wire 契约（`src/contract.ts` 新增 + 扩展）

```ts
/** 默认档分组界面的一条可切换条目（目标无关：用户级档与工作区档共用）。 */
export interface DefaultsEntry {
  /** 规范形地址（行地址：`mcp:<server>::<tool>` / `skill:<name>` / `tool:<name>`）。 */
  readonly address: string
  /** 展示用短名（MCP 为 public 后缀；技能与内置工具为名字本身）。 */
  readonly shortName: string
  /** 描述首 160 字符；缺省 = 无描述（已关且本会话读不到 schema 描述）。 */
  readonly description?: string
  /** 在生效保护名单内（写路径会拒绝）。 */
  readonly protected: boolean
  /** 注册表保留名（`run_code`）：`restrict` 拒绝，永远不可关。 */
  readonly reserved: boolean
}

/** 一个默认档分组。`kind:'skill'` 的行是 `skill:<name>`，组地址是 `tool:skill`。 */
export interface DefaultsGroup {
  readonly kind: 'mcp' | 'skill' | 'builtin'
  /** 分组键：MCP = serverName；skill = `skill`；builtin = `builtin`。 */
  readonly key: string
  /** 整组开关的地址；`builtin` 不可整组关 → `null`。 */
  readonly address: string | null
  /** 组内可切换条目（按地址升序）。 */
  readonly tools: readonly DefaultsEntry[]
}

/** 本会话视角的工具宇宙（`{sessionId}` 寻址的 `workspace` 响应携带）。 */
export interface DefaultsUniverse {
  /** 会话层读数是否可用（false = 读不到清单，界面只能展示残留区）。 */
  readonly layerReady: boolean
  /** 技能服务是否可用（false = 技能组只保留 `tool:skill` 组开关 + 降级提示）。 */
  readonly skillsAvailable: boolean
  /** 分组（MCP 组按 server 升序 → 技能组 → 内置工具组；空组不出现）。 */
  readonly groups: readonly DefaultsGroup[]
}

export interface WorkspaceValue {
  readonly workspace: WorkspaceView | null
  readonly choices: readonly WorkspaceChoice[]
  readonly changed: readonly string[]
  /** 会话视角的工具宇宙；`{workspacePath}` 寻址时为 `null`。层读数不可用时**非 null**，而是 `layerReady:false`。 */
  readonly universe: DefaultsUniverse | null
}

const DEFAULTS_ENTRY_KEYS = ['address', 'shortName', 'description', 'protected', 'reserved'] as const
const DEFAULTS_GROUP_KEYS = ['kind', 'key', 'address', 'tools'] as const
const DEFAULTS_UNIVERSE_KEYS = ['layerReady', 'skillsAvailable', 'groups'] as const
```

parser 规则（与 A 的 strict 纪律一致）：

- `parseWorkspaceValue` 的 strict 键集加 `'universe'`，且**必填**（`null` 合法）——旧响应一律拒绝；
- `readDefaultsEntry`：`address` 非空串、`shortName` 非空串、`description` 可选（缺省不补键）、`protected`/`reserved` 布尔；
- `readDefaultsGroup`：`kind` 用 `readEnumField(..., ['mcp','skill','builtin'])`、`address` 用 `readNullableStringField`（L650）、`tools` 用 `readArrayField`；
- `readNullableDefaultsUniverse`：`null` 直接返回 `null`；否则 strict 三键 + 逐组读取；
- 交叉可赋值段（`wire-contract.test.ts:1113-1143`）自动覆盖 host 侧 `panel.ts` 与 contract 的同形关系（B 的宇宙形状不经过 `PanelSnapshot`，因此由 `buildDefaultsUniverse` 的返回类型 + `handleWorkspace` 的类型标注守住）。

### 3.16 宿主构建器（`src/host/panel.ts` 新增导出）

```ts
/** `buildDefaultsUniverse` 的输入：全部是宿主侧已读到的会话事实。 */
export interface DefaultsUniverseInputs {
  /** 会话层是否可用（false = 只有残留区；`schemas`/`carried` 一律忽略）。 */
  readonly layerReady: boolean
  /** 本会话可见工具的名字 + 描述（`layer.visibleSchemas()`）。 */
  readonly schemas: readonly VisibleToolSchema[]
  /** 上一轮仍受管的名字（`layer.snapshot().deny`；已关条目保留在清单里）。 */
  readonly carried: readonly string[]
  /** 技能分面读数（`layer.skills()`；缺席 = 服务不可用）。 */
  readonly skills?: SkillLayerSnapshot
  /** 生效保护名单（排序后的文本）。 */
  readonly protectedNames: ReadonlySet<string>
}

export function buildDefaultsUniverse(inputs: DefaultsUniverseInputs): DefaultsUniverse
```

实现要点（与 A 后的 `buildPanelSnapshot` 同一套判据）：

1. `layerReady === false` → 返回 `{layerReady:false, skillsAvailable:false, groups:[]}`（冻结常量，不读入参）；
2. `candidates = sortedTexts([...inputs.schemas.map(s => s.name), ...inputs.carried])`；描述表 = `new Map(schemas.map(s => [s.name, s.description ?? '']))`；
3. 分桶：`mcpPartsOf(name)` → `mcp` 组（组地址 `mcp:<server>`，行地址 `mcp:<server>::<suffix>`）；名字 `skill` → `skill` 组（组地址 `tool:skill`，组内行**不来自 candidates**，见 4）；其余 → `builtin` 组（组地址 `null`）；
4. `skill` 组存在时，行 = `inputs.skills` 的 `visible` ∪ `shadowed` 按名字升序映射为 `{address:'skill:<name>', shortName:name, description?}`；`skills` 缺席或 `available:false` → 行空数组（UI 出降级提示，组开关仍在）；
5. 条目标记：`protected = inputs.protectedNames.has(name)`、`reserved = isReservedName(name)`（与 `toolEntryOf` 同一判据；MCP public 名恒 false）、`description` 走 `descriptionOf(name, map)` 截断 160；
6. 组顺序：MCP 组按 server 升序 → skill 组（若有）→ builtin 组（若有）；空组不出现；
7. 纯函数：不读时钟、不做 IO、不改入参；同一输入两次调用深相等。

### 3.17 `src/host/rpc.ts` 的宇宙装配

```ts
/** 层不可用时的空宇宙（冻结；`layerReady:false` 让界面只渲染残留区）。 */
const EMPTY_UNIVERSE: DefaultsUniverse = Object.freeze({
  layerReady: false,
  skillsAvailable: false,
  groups: [],
})

/**
 * 读本会话的工具宇宙（目标无关）。层缺席 / 读失败 → 空宇宙 + 一次 warn。
 * @param deps - 依赖注入面。
 * @param session - 目标会话。
 * @returns 宇宙（永不抛错）。
 */
function universeOf(deps: RpcDeps, session: SessionLike): DefaultsUniverse {
  const layer = deps.layerFor(session.id)
  if (layer === undefined) return EMPTY_UNIVERSE
  let schemas: readonly VisibleToolSchema[]
  let carried: readonly string[]
  try {
    schemas = layer.visibleSchemas()
    carried = layer.snapshot().deny
  } catch (error) {
    deps.log.warn(`读取会话 ${session.id} 的工具宇宙失败（默认档界面将只显示残留区）：${messageOf(error)}`)
    return EMPTY_UNIVERSE
  }
  return buildDefaultsUniverse({
    layerReady: true,
    schemas,
    carried,
    skills: skillsOf(deps, session),
    protectedNames: deps.protectedNames,
  })
}
```

`handleWorkspace` 的两处 `WorkspaceValue` 字面量（读 L419–426、写 L437–445）都补：

```ts
const universe =
  resolved.target.kind === 'session' ? universeOf(deps, resolved.target.session) : null
```

**为什么写响应也带宇宙**：`useWorkspaceDefaults.update()` 用写响应整份替换 `value`（③ 3.19 的状态机语义），若写响应不带宇宙，用户第一次点行开关后分组清单就会消失；带上的成本只是一次内存过滤读数（U6 记录）。

### 3.18 浏览器派生（`src/client/defaults-view.ts` 新建，纯函数）

```ts
import type { DefaultsUniverse, PanelSnapshot } from '../contract.ts'

/** 目标档视图的派生结果（UI 只读这一份）。 */
export interface DefaultsCounts {
  /** 可切换条目数（组开关 + 行开关，去重）。 */
  readonly listed: number
  /** 其中地址已在目标档关闭集里的数量。 */
  readonly inDefaults: number
  /** 目标档关闭集里不在宇宙中的地址数（= `residualOf(...).length`）。 */
  readonly residual: number
}

/** 宇宙里所有可切换地址（组开关 + 行开关；Set 语义去重）。 */
export function switchAddressesOf(universe: DefaultsUniverse | null): ReadonlySet<string>

/** 目标档的三计数（D11 形状；用户级 / 工作区级同构）。 */
export function defaultsCountsOf(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
): DefaultsCounts

/** 残留地址（目标档里不在宇宙中的地址，升序）。 */
export function residualOf(universe: DefaultsUniverse | null, disabled: readonly string[]): readonly string[]

/**
 * 用户级默认档的宇宙：从 `PanelSnapshot` 投影（D-19，零新增 wire 字段）。
 *
 * - `groups` 的 `mcp`/`builtin` 组原样投影（`ToolGroup.tools` → `DefaultsEntry`，丢 `disabled`）；
 * - `kind:'skill'` 组：组地址保留 `tool:skill`，行换成 `snapshot.skills` 的 `skill:<name>`；
 * - `skillsAvailable = !snapshot.notices.includes('skills-unavailable')`；
 * - `layerReady = true`（有快照就说明宿主读到了会话；层未就绪时宿主给的是空 groups）。
 */
export function universeOfSnapshot(snapshot: PanelSnapshot): DefaultsUniverse
```

`defaultsCountsOf` 的口径（写进函数注释）：

- `listed` = `switchAddressesOf(universe).size`（**开关数**，不是行数：整组开关也是一个可切换条目；技能组因此是 `tool:skill` + N 个 `skill:<name>`）；
- `inDefaults` = `listed` 里地址在 `disabled` 中的个数；
- `residual` = `disabled` 中不在 `switchAddressesOf` 里的地址数（= `residualOf().length`）；
- 宇宙为 `null` 或 `layerReady:false` 时：`listed = 0`、`inDefaults = 0`、`residual = |disabled|`（界面只显示残留区）。

**面板形态的 `layerReady` 只能保守取 `true`**：`PanelSnapshot` 不带层就绪标记（A 的 wire 形状固定），快照存在即视为「宿主读到了这个会话」；层恰好未就绪时宿主给的是空 `groups`，界面显示「空清单 + 计数（listed 0）」而不是谎报 `defaults.universeUnavailable`。统一弹窗形态没有这个问题——`WorkspaceValue.universe.layerReady` 是宿主明说的。两者在计数与残留上的表现一致（listed 0 / residual = 档内条目数），差异只在提示行。

### 3.19 组件接口（客户端）

**`DefaultsGroupList.tsx`（新建）**

```ts
/** 残留区/CLI 提示的文案束：两个编辑器各传自己的键（用户级 / 工作区级措辞不同）。 */
export interface DefaultsGroupCopy {
  readonly residualTitle: string
  readonly removeLabel: string
  readonly removeAria: (address: string) => string
  readonly cliHint: string
}

export interface DefaultsGroupListProps {
  /** 目标无关的工具宇宙；`null` / `layerReady:false` 时只渲染残留区。 */
  readonly universe: DefaultsUniverse | null
  /** 目标档的关闭集（工作区档 `workspace.disabled` / 用户级 `defaults.disabled`）。 */
  readonly disabled: readonly string[]
  /** 写在途：整份清单的开关与移除按钮一起禁用。 */
  readonly busy: boolean
  /**
   * 开关意图：`on === true` 表示把该地址**移出**目标档（开启），`false` 表示加入（关闭）。
   * 用户级容器接 `updateDefaults`，工作区容器接 `updateWorkspace`。
   */
  readonly onToggle: (address: string, on: boolean) => void
  readonly copy: DefaultsGroupCopy
  readonly t: Translate
}
```

行/组语义（逐条钉死）：

| 位置 | `checked` | 禁用条件 | 备注 |
|---|---|---|---|
| MCP 组开关（`address='mcp:<server>'`） | `!disabled.has(address)` | `busy` | 组默认折叠（同 `ToolPanelGroups.defaultExpanded`） |
| 技能组开关（`address='tool:skill'`） | `!disabled.has('tool:skill')` | `busy` | 技能组默认展开 |
| 技能行（`address='skill:<name>'`） | `!disabled.has(address)` | `busy`（`skillsAvailable:false` 时整区不渲染行） | 行 `title` = 描述或名字 |
| 行（`address='mcp:<server>::<tool>'` / `'tool:<name>'`） | `!disabled.has(address)` | `busy` ∨ 锁态 ∨ 组 `blocked` | 锁态 = `protected`（`entry.protected`/`badge.protected`）或 `reserved`（`entry.reserved`/`badge.reserved`） |
| 整组 `blocked` | —— | 组内所有行 | `disabled.has(group.address)`；行加 `defaults.groupOff` 短标签，`title` 说明「整组默认关时逐项开关不生效」 |
| 内置工具组 | 无组开关（`address === null`） | —— | 组内带过滤输入（复用 `group.filter`） |
| 残留 chips | —— | `busy` | 只有「移除」（`onToggle(address, true)`）；无任何添加入口 |

**`DefaultsSectionFrame.tsx`（新建）**

```ts
export interface DefaultsSectionFrameProps {
  /** 分区标题（`section.defaults` / `workspace.title`）。 */
  readonly title: string
  /** 标题行的计数摘要（`defaults.summary`：默认关 M · 残留 K）。 */
  readonly summary: string
  /** 收起时不渲染。 */
  readonly children: ReactNode
}
```

默认 `open=false`（D13）；`<section className={css.section}>` + `<button aria-expanded>` 复用 `.groupHeader/.groupToggle/.groupTitle/.groupCounts` 与 chevron。

**`DefaultsEditor.tsx`（重写）**

```ts
export interface DefaultsEditorProps {
  readonly defaults: DefaultsView
  /** 面板快照投影的宇宙（`universeOfSnapshot`；D-19）。 */
  readonly universe: DefaultsUniverse
  readonly createdAt: number
  readonly snapshotCount: number
  readonly saving: boolean
  readonly saved: boolean
  readonly failure?: PanelFailure
  readonly onUpdate: (action: DefaultsAction, addresses?: readonly string[]) => void
  readonly t: Translate
}
```

内部结构（自上而下）：`DefaultsSectionFrame`（标题 `section.defaults`，摘要用计数的 `defaults.summary`）→ 路径行 → 损坏告警（`defaults.corrupt` 为真时渲染 `notice.defaults-corrupt`，沿现状）→ 三计数行（`defaults.counts`）→ `DefaultsGroupList` → 残留区（在 `DefaultsGroupList` 内）→ `defaults.cliHint` → `defaults.scope` → `defaults.snapshot` → 清空（两段式 `reset`）+ `saved`/`failure`。

**`WorkspaceDefaultsEditor.tsx`（重写）**

```ts
export type WorkspaceDefaultsVariant = 'section' | 'dialog'

export interface WorkspaceDefaultsEditorProps {
  readonly workspace: WorkspaceView | null
  /** 目标无关的工具宇宙：dialog 形态来自 `WorkspaceValue.universe`（含缓存），section 形态来自面板快照。 */
  readonly universe: DefaultsUniverse | null
  readonly choices: readonly WorkspaceChoice[]
  readonly variant: WorkspaceDefaultsVariant
  readonly saving: boolean
  readonly saved: boolean
  readonly failure?: PanelFailure
  readonly onSelect: (key: string) => void
  readonly onUpdate: (action: WorkspaceAction, addresses?: readonly string[]) => void
  readonly onRefresh: () => void
  readonly t: Translate
}
```

形态差异（沿用 unify 裁定）：`dialog` 渲染 `<h3>{t('workspace.title')}</h3>` + 下拉（`workspace.select`，缺项补一项避免空白）+ 下拉行的刷新；`section` 由 `DefaultsSectionFrame` 提供标题与折叠（无下拉）。

**`WorkspaceEntry.tsx` 的宇宙缓存（状态机零改动）**

```tsx
const remembered = useRef<DefaultsUniverse | null>(null)
const universe = value?.universe ?? remembered.current

/** 下拉切换前记住当前宇宙：切到 {workspacePath} 后响应里 universe 为 null。 */
const selectAndRemember = (key: string): void => {
  if (value?.universe !== undefined && value.universe !== null) remembered.current = value.universe
  select(key)
}
```

不变式：`remembered` 只在「已有非空宇宙」时被写；切目标、写目标、刷新目标都不清空它（U1 的近似语义，见 D-18 与 W14 的已知限制）。

### 3.20 文案键（`src/client/locales.ts`，zh + en 各一份）

**新增 12 键**

| 键 | zh | 用途 |
|---|---|---|
| `defaults.counts` | `清单 {listed} · 默认关 {inDefaults} · 残留 {residual}` | 两个编辑器的三计数行（D11） |
| `defaults.summary` | `默认关 {inDefaults} · 残留 {residual}` | 折叠标题行的摘要（D13） |
| `defaults.residualTitle` | `残留地址（不在本会话清单里，只能移除）` | 残留区标题 |
| `defaults.groupCount` | `{count} 项` | 分组标题行的条目数 |
| `defaults.groupInDefaults` | `默认关 {count} 项` | 分组标题行的档内计数 |
| `defaults.groupSummary` | `{count} 项，默认关 {inDefaults} 项` | 分组标题的 `title`/读屏 |
| `defaults.groupOff` | `整组默认关` | 组开关关闭时组内行的标签 |
| `defaults.switchLabel` | `{name} 的默认档开关` | 行开关可访问名 |
| `defaults.groupSwitchLabel` | `{name} 的整组默认档开关` | 组开关可访问名 |
| `defaults.cliHint` | `本页只列本会话可见的工具；跨清单的新关用命令 \`/tools default off <地址>\`。` | 用户级编辑器的 D8 兜底说明 |
| `workspace.cliHint` | `本页只列本会话可见的工具；跨清单的新关用命令 \`/tools workspace off <地址>\`（只作用本会话所属工作区）。` | 工作区编辑器的 D8 兜底说明 + U1 限制 |
| `defaults.universeUnavailable` | `本会话的工具清单暂不可用：只能查看与移除档内已有条目。` | `layerReady:false` 的降级行 |

复用（不新增）：`group.mcp` / `group.skill` / `group.builtin`（组标题）、`group.filter`（内置工具过滤）、`entry.protected` / `entry.reserved` / `badge.protected` / `badge.reserved`（锁态）、`workspace.title` / `workspace.select` / `workspace.key` / `workspace.path` / `workspace.registered` / `workspace.unregistered` / `workspace.unresolved` / `workspace.corrupt` / `workspace.scope` / `workspace.union` / `workspace.remove` / `workspace.removeAria` / `workspace.saved` / `workspace.clear` / `workspace.clearConfirm` / `workspace.refresh` / `workspace.loading` / `workspace.unavailable`、`defaults.remove` / `defaults.saved` / `defaults.clear` / `defaults.clearConfirm` / `defaults.scope` / `defaults.snapshot` / `defaults.path`、`skill.unavailable`（技能组行区降级）。

**删除 8 键**（自由文本添加链的死亡面）：`defaults.add`、`defaults.addPlaceholder`、`defaults.placeholder`、`defaults.empty`、`workspace.add`、`workspace.addPlaceholder`、`workspace.placeholder`、`workspace.empty`。

### 3.21 B 的 spec delta 重基线（D12；阶段 2 落 S1，**以 unify 归档后的主规格文本为基**）

> **落档定稿（阶段 2 校验裁定）**：delta 采用「Web 配置界面」**单块 MODIFIED** 承载 A+B 全部句子——`openspec validate --strict` 要求 delta 对**当前**主规格可归档，而「工作区默认档分节」在 unify 归档前不存在（实测 `MODIFIED failed for header "工作区默认档分节" - not found`），无法以 MODIFIED 过校验；该需求的 unify 原文（分节座位、工作区切换、面板分区）与 B 不矛盾，保留不动。B 的工作区分节 UI 句（两形态、行状态 = 档交、整组默认关行禁用、技能缺席降级、残留只可移除、无添加入口、CLI 兜底）并入「Web 配置界面」正文；unify 归档后本块整文替换其版本，D12 语义不变。

| delta 位置 | 基线 | B 后必须出现的内容 |
|---|---|---|
| `MODIFIED Requirements — Web 配置界面`（单块） | unify 版正文（分节座位表述）+ A 的宇宙句 | + B 句（两编辑面一并）：用户级默认档编辑区与工作区默认档分节/面板分区 SHALL 以**分组开关**呈现（MCP 服务器组 + 行、技能整档 + `skill:<name>` 行、内置工具行；面板两分区默认折叠、分节保留下拉/分区无下拉），清单宇宙 SHALL = 本会话 `scoped ∪ carried`（与面板同一读数；为非当前工作区编辑时沿用当前会话视角），行状态 SHALL 表达「地址是否在目标默认档中」，保护/保留行 SHALL 禁用，整组在档时组内行 SHALL 不可切换，技能服务缺席时技能行区 SHALL 降级而 `tool:skill` 组开关保留，档内不在清单的地址 SHALL 只以「残留」形式提供移除，界面 SHALL NOT 提供自由文本地址添加（跨清单地址 SHALL 走 `/tools default off` / `/tools workspace off`；其他工作区需编辑 `workspaces.json`） |
| 新增场景（落档定稿 5 条 + 改写 1 条） | —— | ① 面板清单只含本会话有效工具（A 原场景，保留）；② 用户级默认档编辑区按分组开关渲染且无添加入口；③ 工作区默认档分节与分区的分组开关（含残留只可移除 + 锁态）；④ 整组默认关时组内行不可切换；⑤ 切换工作区后分组清单仍可用（U1 行为化）；⑥ 改写「默认档编辑不追溯当前会话」为开关交互形态（原「添加并保存」措辞随 D8 失效）；另保留 unify 的「持有者缺席时旧路径保留」降级场景 |

`proposal.md` / `tasks.md` 必须显式声明：**本变更在 unify-workspace-config-entry 提交、执行完成并归档之后执行/归档**（代码基线与 delta 基线双重依赖）。

### 3.22 配置键与文件位置（B 零变化）

`Config` 五键、两份档文件形状（`defaults.json` / `workspaces.json`）与权限位、`workspace` 端点的请求形状（`sessionId | workspacePath` 二选一、`action`、`addresses`）**全部不动**；唯一 wire 变化是 `workspace` 响应的新增 `universe` 字段（strict 破坏，双端同 bundle，沿 D-14）。`package.json` 版本维持 `1.5.0`。

---

## ④ 决策记录

> 格式：**决策** → 被否方案与理由 → **反例**（一个能让被否方案当场破功的具体场景）。

### D-0 栈识别与 writer 豁免留痕（事实留档，沿用）

- **性质**：事实留档，不是设计决策——**无被否方案、无反例**；只为「为什么本产物没有走 writer skill」留下可核对证据。
- **决策**：栈识别未命中（非 Spring 非 Nuxt），用户豁免 writer 加载（仅本次有效）。
- **证据**：`pnpm-workspace.yaml`（`packages: plugins/*`）+ `plugins/session-tool-toggle/package.json`（`type: module`、esbuild `build.mjs`、`@deepseek-ai/cordis`）+ `src/host/index.ts`（`export const inject` / `Schema.object` / `export function apply`）；`find . -maxdepth 3 \( -name pom.xml -o -name 'build.gradle*' -o -name 'nuxt.config.*' \)` 空输出。
- **约束**：本豁免只对本次产物有效，不推广到后续变更。

### D-1 清单宇宙 = `scoped ∪ carried`（两读），掩码写路径同源（承接 decisions D1）

- **决策**：`mask.planMask`、`control.toggleSession/readPanel`、`panel.buildPanelSnapshot`、`session-layer.plan()` 四处候选集统一为 `layer.visibleNames() ∪ layer.snapshot().deny`；四处消费点收敛到「层读数」一个来源。
- **被否 A：只改展示面、掩码保留三读**。理由：需要在展示侧再写一次差集过滤，等于把「谁被谁掩了」的知识复制一份到面板；且 `toggleSession` 的 `matched` 仍按全局层算，回执与「用户能感知的效果」分叉——`/tools off mcp:dbx` 回执说「命中 7 个工具定义」，而那 7 个本来就被别的机制掩着，本会话模型侧一个都没变。
- **被否 B：候选 = `scoped ∪ carried ∪ catalog` 保留，只把 catalog 从「展示」里过滤**。理由：这正是当前缺陷的形态——被其他作用域隐藏的名字一旦进了 candidates，`plan.matched` 就有命中，`intentOnly` 判不出来，「可关对象」计数仍然包含本会话不存在的服务器。
- **反例**：本会话被 project-mcp 掩掉 dbx（deny=119）。旧口径下面板把 dbx 列进「可关对象」的 server 分组（计数非零），用户关掉 `mcp:dbx` 后回执与 `/tools status` 都说「已关闭、命中 N 个工具定义」——但用户在本会话既看不到也调不到这些工具，开关的收益为零，全部反馈都是噪声；等 project-mcp 解除隔离，dbx 的工具立刻出现且可用，而面板还标着「已关闭」。新口径下：dbx 根本不出现在分组里，误关的同一动作显示 `matched: 0` + `intentOnly`，dbx 一旦出现则由 `tools/change → refresh()` 在下一轮真正补上掩码。

### D-2 `catalog` 字段全删（五个 seam + 一个端口），不保留「改义」形态（承接 decisions D2）

- **决策**：删 `ControlDeps.catalog`、`PanelInputs.catalog`、`MaskInputs.catalog`、`PanelReading.catalog`、`SessionLayerPorts.catalog`、`RpcDeps.descriptions`（描述改经层，见 D-4）。
- **被否 A：保留字段、改传会话读数**。理由：字段名承诺「全局层」，改传 `scoped` 后它与 `PanelInputs.scoped` 完全同源，出现两个恒等字段；任何人日后想「用 catalog 兜一下」都会重演本次缺陷。
- **被否 B：只删 `PanelReading.catalog`，其余保留**。理由：`ControlDeps.catalog` 仍被 `toggleSession` 用来算 matched，缺陷从 panel 转移到命令面回执，且类型层再也无法保证「只有一个宇宙」。
- **反例**：保留改义的实现里，`PanelInputs.catalog` 与 `PanelInputs.scoped` 值相同 → `stats.catalog` 与 `stats.visible` 恒相等；测试里写 `expect(stats.catalog).toBe(stats.visible)` 会成为永真断言，等于没有覆盖。删字段后这类「永真断言」在编译期就不可能被写出来。

### D-3 `hiddenByOthers` 整条删除，而非「保留恒空数组」（承接 decisions D3）

- **决策**：删 `PanelSnapshot.hiddenByOthers`、`PanelReading.hiddenByOthers`、`ToolEntry.shadowed`、`Stats.shadowed`、`EntryContext.hidden`，以及客户端的徽章 / 禁用分支 / 四条文案键。
- **被否 A：保留 `hiddenByOthers: []` 占位，先把 UI 收起**。理由：恒空字段在契约里是一个「未来可能非空」的承诺，下一个读者会照着它写逻辑；且 strict parser 会为它永久保留一个键位。
- **被否 B：把 `hiddenByOthers` 改义为「本会话关闭但当前不可见的地址」（即 `intentOnly` 的超集）**。理由：与 `intentOnly` 语义重叠且更弱（后者已区分「工具地址 0 命中」与「技能未安装」两段），改名不解决歧义、只制造第二套词汇。
- **反例**：保留恒空字段时，`ToolPanelGroups.lockOf` 的 `tool.shadowed` 分支永远走不到，但 TypeScript 仍要求 `ToolEntry.shadowed` 必有值 → 构建器必须为每个条目计算一个永远 false 的布尔并随 wire 传输；一台 MCP 200 工具的面板快照因此多传 200 个无用字段/次刷新。

### D-4 描述改经**本会话层**读数（承接 decisions D6）

- **决策**：`ScopedSurface` / `LayerHandle` 新增 `visibleSchemas()`（name + description 轻量投影）；`rpc.descriptionsOf(deps, session)` 经 `deps.layerFor(session.id)` 取；层缺席或抛错 → 空 `Map` + 一次 warn；删 `RpcDeps.descriptions` 注入面与 `index.ts` 的装配期读数。
- **被否 A：保留装配层 `descriptions` 闭包，只是改成按会话查表**。理由：装配层的闭包拿不到 `sessionId`，要么改成 `(sessionId) => Map` 再造一个与 `layerFor` 平行的寻址面，要么把层注册表暴露给 rpc——两者都比「rpc 直接读层」多一层。
- **被否 B：给层加描述缓存（记住历史上见过的 description），让已关条目也有描述**。理由：缓存要处理淘汰与 detach 清理，且「关掉很久、本次进程内从未见过」的工具仍无描述——收益（一行 `title`）远小于复杂度。**列为待决 P2**。
- **反例（本条决策的已知代价，必须写进 README）**：`tools.schemas(agent)` 是**掩码后**读数，所以已关条目的 `description` 拿不到 → 面板上「已关」的 MCP 行失去 `title` 悬浮描述（旧口径从全局层 `catalog` 取，所以有）。用户侧影响有界：该行仍显示短名与状态标签，且点开后能恢复。若验收要求「已关条目也带描述」，唯一正解是 D-4 被否 B（层内缓存），需另立小变更。

### D-5 `stats` 键集合按「删两个」落地为 `{ visible, denied }`；「三计数」措辞的不一致上浮待决

- **决策**：`Stats`/`StatsView` = `{ visible, denied }`；面板状态摘要两行；`STATS_VIEW_KEYS = ['visible','denied']`。
- **依据**：decisions D3 的裁定核心是「删 catalog + shadowed」与「叙事 = 本会话可见 N / 已关 M」；`Stats` 现有四项删两项的算术结果是两项，且现有文案 `state.visible`（「本会话可见 {visible}」）、`state.denied`（「已关 {denied}」）**逐字已符合新叙事**，无需改文案。
- **被否 A：凑成三项，第三项 = `intentOnly` 计数**。理由：D3 未点名第三项，擅自新增一个 wire 字段 + parser + 文案键，属于把「措辞含糊」当成授权。
- **被否 B：第三项 = `entries`（候选宇宙大小 `|scoped ∪ carried|`）**。理由：这正是 D3 明确否掉的「catalog 改义为候选总数」，与 `visible` 只在 carried 非空时才有差异，展示价值低。
- **反例**：若草率把第三项定为 `catalog`（保留名字、改值）→ `stats.catalog` 与 `stats.visible` 在 carried 为空时相等，面板出现两行同样的数字，用户会认为「面板统计坏了」。→ 见 **待决 P1**（已由 P1 收敛为两计数，本节保留原始论证）。

### D-6 模块级 `inject` 保留 `'tools'`，不缩成 `['agents']`

- **决策**：`src/host/index.ts:133` 的 `export const inject: readonly string[] = ['agents', 'tools']` 不动，只更新其 JSDoc（根 ctx 已不再读数，`tools` 保留为**装配顺序契约**）。
- **理由**：每 agent 层的 `agent.ctx.inject(['tools','systemPrompt'], …)`（`session-layer.ts:234`）是永不结算的等待面；若本插件在没有 `tools` 服务的 profile 里也被装配，`agent/created` 会被 `mount() → attach() → openSurface` 挂死（会话创建卡住）。模块级 `inject` 把这种组合挡在 apply 之前。
- **被否：缩成 `['agents']` 让依赖清单更“诚实”**。理由：零功能收益 + 重新打开一条宿主组合下的挂死路径；且 `inject` 是装配顺序声明，不是「本文件读了哪些服务」的清单。
- **反例**：某极简 headless profile 缺 `tools`。缩成 `['agents']` 后插件照常 apply、`agent/created` 监听器已注册 → 新会话进入 `mount()` → `await layer.attach()` 里 `ctx.inject(['tools',…])` 永久 pending → `agents.create` 的串行广播被卡住，**整个 profile 开不出会话**（而不是「本插件功能不可用」）。

### D-7 `/tools status` 段 6 删行后，段 5 必须自带「层未就绪」降级

- **决策**：`switchableText` 在 `!reading.layerReady` 时返回单独一行说明，不再输出「MCP 服务器 0 台；内置工具 0 个」。
- **被否：让 `hiddenText` 的降级说明随段 6 一起消失，段 5 照常报 0**。理由：层未就绪时候选集为空是**读数缺失**而不是事实为零；报告 0 会让用户以为「这个会话没有可关对象」，进而以为插件坏了。
- **反例**：会话刚创建、层 attach 失败（日志里有 error）。旧输出至少一行「会话层未就绪：无法读取…的计数」；若只删不加，`/tools status` 会变成「【可关对象】MCP 服务器 0 台；内置工具 0 个；单工具关闭 0 项」——与真实原因相反的信息，排障会被带偏。

### D-8 `closedStateText` 的 matched=0 文案改会话口径（decisions「两态文案随口径自然更新」授权实现期落定）

- **决策**：`'已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效'`。
- **被否：保留「服务器上线后自动生效」**。理由：新口径下 0 命中的最常见原因**不是**服务器离线，而是「该服务器的工具被其他作用域（project-mcp）掩掉」——它明明在线却不在本会话。旧文案会把人引向「等服务器上线」，与事实相反。
- **反例**：project-mcp 掩掉 figma 后用户误关 `mcp:figma`，`/tools status` 显示「服务器上线后自动生效」；用户重启 figma 服务器（本来就在线）→ 仍是 0 命中 → 认为插件有 bug。

### D-9 面板与 `/inventory` 的两处刻意差异写进 README 与 proposal，不写进 UI 文案

- **决策**：差异只在文档与提案的「预期管理」段落出现；面板不加「本清单只含本会话有效工具」之类的提示行。
- **理由**：面板的行动面是开关，一行说明不改变任何操作；新增文案要过 `locale-parity` 两语言与 `REQUIRED_KEYS` 表。
- **被否：面板顶部加一行 scope 说明**（见待决 P3）。
- **反例**：若加「与 `/inventory` 同口径」字样，用户会发现面板明明比 `/inventory` 多出已关条目 + `tool:`/`skill:` 行，反而制造「说同口径却不同」的信任问题。

### D-10 测试替身改造：删 `catalog` 选项，**不**保留 `catalog → scope` 的兼容别名

- **决策**：`test/{commands,control,rpc,panel}.test.ts` 的 harness 选项 `catalog` 直接删除，统一用 `scope`（`FakeLayer` 的 `reconcile()` 改两读）。
- **被否：保留 `catalog` 选项作为 `scope` 的别名**，让 200+ 处 `harness({ catalog: [...] })` 零改动。理由：别名会让「全局层」这个词继续活在测试里，下一个改测试的人无法从代码看出它已经不参与任何推导；且 `scope` 与 `catalog` 语义不同（前者是未掩码的 agent 视角，后者是全局层），别名会把两者混为一谈。
- **反例**：保留别名时 `harness({ catalog: ['mcp__a__x'] })` 与 `harness({ scope: ['mcp__a__x'] })` 行为相同，但前者名字暗示「这条用例在测全局层读数」——而全局层读数已经不存在，用例的**意图**被名字掩盖，回归时无人敢删。

### D-11 文档同步是施工项，不是收尾项

- **决策**：`README.md:77`（三态锁）与 `README.md:120`（「已知限制：读数取全局层」）随代码同批改；`tests` 里对文案的断言与 README 的措辞一起核。
- **被否：只改代码，README 留待发布前统一 review**。理由：`README.md:120` 是本插件唯一明写「工具读数取全局层」的位置，它一旦与实现相反，会让后来者按旧口径「修」回去。
- **反例**：本次刚推翻 R20①（「保持全局层，v2 再改」）。如果 README 还写着「读数取全局层…v2 再改」，下一个读到它的人会认为 v2 尚未发生，从而把 `catalog` 端口加回来——文字本身就是这次缺陷的载体之一。

### D-12 版本号维持 `1.5.0`（承接 decisions D5）

- **决策**：`plugins/session-tool-toggle/package.json` 不动；与 `7c38dbe`（技能级开关 + 工作区档）同批发布。
- **v2 校订注记（事实，不推翻）**：unify 收口任务 `10.1` 用 `node scripts/release.mjs 1.6.0 --dry-run` 做发布演练，并明确「本次**不打 tag**，版本与 tag 留待下一批变更统一发布」。A+B 是「下一批」的候选，但版本号归属由发布批次决定，本蓝图**不**单方面 bump；若发布批次裁定 1.6.0，则与本条并存的方式是「代码不 bump、release 脚本统一升版」，见待决 PB2。
- **被否：bump `1.6.0`**。理由：上一变更未发布未推送，`v1.5.0` 在远端还不存在；两批改动共用同一次发布，bump 只会让一个从未发布过的版本号先跳一格，tag 历史与发布说明出现空档。
- **反例**：若先发 1.5.0 再发 1.6.0，中间那版包含本次的 wire breaking（`ToolEntry.shadowed` 删除 + `WorkspaceValue.universe` 新增）——已装 1.5.0 的用户在升级到 1.6.0 时会跨过两个不兼容形状，排障时无法用「上一个版本」对照。

### D-13 旧裁决推翻留痕（R15①/R18①/R20①），落 diff-matrix 而非代码注释

- **决策**：新变更的 `diff-matrix.md` 起一条 R 记录逐条声明推翻；代码注释只写新口径，不写「曾按全局层」的考古。
- **被否：在 `mask.ts` / `types.ts` 注释里保留「R15 ① 全局层」历史说明**。理由：代码注释服务当前读者，历史裁定由 `openspec` 的 diff-matrix 承担（它本来就是这个仓的裁定账本）；两处都写必然漂移。
- **反例**：保留旧注释的后果在本次已可观察——`ControlDeps.catalog` 的 JSDoc（`types.ts:409-418`）用 4 行论证「必须读未掩码的全局层（R15 ①）」，任何人读到它都会认为删字段是错的。

### D-14 wire 契约 breaking 不设兼容窗口

- **决策**：`contract.ts` 的 strict parser 直接拒绝旧形状（含 `shadowed` / `catalog` / `hiddenByOthers`；B 加 `universe` 必填），不写「忽略未知字段」的宽容分支。
- **理由**：双端同仓同 bundle 发布（`lib/index.js` 与 `lib/client.js` 由同一次 build 产出），不存在旧 client + 新 host 的独立部署组合；strict 的拒绝正是版本漂移报警器（R17② 的既有设计）。
- **被否：宽容忽略未知键**。理由：会让「面板少一行统计」这种静默降级在升级不彻底（浏览器缓存了旧 client bundle）时毫无提示。
- **反例**：若宽容，浏览器旧 bundle + 新 host 会拿到没有 `stats.catalog` 的快照 → 旧组件 `t('state.catalog', {catalog: undefined})` 渲染出「全局 undefined」，而没有任何错误可查。

### D-15 `mcp:<server>` 整组关闭仍产生空遮蔽段（即使 0 命中）

- **决策**：`shadowServers` 的推导**不动**（只由 `mcp-group` 地址产生，与 `matched` 无关）。
- **理由**：空段在 system-prompt 渲染期本来就会被丢弃（`mask.ts:214-217` 的既有注释），且它表达的是「意图」——服务器一旦在本会话出现，段必须已经被遮蔽，否则会出现「工具被摘掉但 MCP 指令段还在」的窗口（该段包含服务器级说明与工具清单）。
- **被否：`matched === 0` 时不产生遮蔽段**。理由：服务器可能在被别的机制掩掉期间其指令段仍在渲染（隔离粒度不同），意图则应在恢复的同一轮同时生效。
- **反例**：project-mcp 只摘工具不摘段（或反之）时，「0 命中不遮蔽」会让恢复瞬间出现一次「工具已关但指令段仍描述它」的不一致步骤。

### D-16 默认档分组界面的宇宙 = 会话两读宇宙（承接 decisions D7=U1）

- **决策**：`universe` 由宿主从本会话 `layer.visibleSchemas()` ∪ `layer.snapshot().deny`（+ `layer.skills()`）构建（`buildDefaultsUniverse`），与面板分组同一候选集、同一分桶规则；**不按目标工作区推导**。
- **被否 A：U2 目标工作区推导**（profile 全局 schemas + project-mcp 按工作区发现）。理由：引入与「会话两读」并行的第二口径——A 刚在会话面拒绝全局层口径，B 再开推导口径即口径分叉；且要跨插件读 project-mcp 的发现面，它缺席时还需再降级一层。
- **被否 B：U1'（切到非当前工作区时禁用分组区，只留残留区 + 兜底添加）**。理由：下拉切换是 spec 明确保留的能力（「不改当前会话也能预先设置任一工作区默认档」），禁用分组区等于把它降级成「只能删不能加」；且与 D8（无添加框）叠加后，非当前工作区将完全不可写。
- **反例**：若按目标工作区推导，profile 里 A 工作区的 project-mcp 服务器（`mcp__awaint__*`）会出现在 B 工作区的分组里；用户把 `mcp:awaint` 关进 B 的 `workspaces.json`，但 B 工作区根本没有该服务器 → B 的新会话关闭集里多一条永不命中的地址，`intentOnly` 长期非空。

### D-17 宇宙「目标无关」；行状态 / 残留 / 三计数由客户端求交（D11 的落点）

- **决策**：`WorkspaceValue.universe` 只承载 `{layerReady, skillsAvailable, groups[]}`；`inDefaults` / `residual` / `listed` 由 `defaults-view.ts` 的纯函数按 `(universe, disabled)` 求交，用户级与工作区级共用同一函数。
- **被否 A：宿主在响应里给行 `inDefaults` 标记 + 三计数**。理由：目标在客户端可切换（`{workspacePath}`），宿主计数描述的是「发请求那一刻的目标」，切换后必然陈旧；客户端仍要按缓存宇宙重算，于是两套算法并存、必然漂移。
- **被否 B：把计数放进 `WorkspaceValue` 并在每次切目标时让宿主重算**。理由：切目标时宇宙为 `null`（D-18），宿主算不了；要么补请求字段（被 D-18 否），要么客户端缓存并重算——最终仍是客户端算，宿主那份是冗余。
- **反例**：宿主计数 + 客户端缓存的组合下，用户先读 `/w1`（宿主算 `inDefaults=2`），再切 `/w2`（响应 `universe:null`，只回 `workspace.disabled`）→ 客户端只能继续显示「默认关 2」，而 `/w2` 的档里实际有 5 条 → 计数与清单自相矛盾。

### D-18 `universe` 只在会话寻址时非空；跨目标切换由客户端记住上一份宇宙

- **决策**：`{sessionId}` 的读/写响应都带 `universe`；`{workspacePath}` 响应为 `null`；`WorkspaceDefaultsSection` 在 `select(key)` 前把当前非空宇宙存进 `useRef`，渲染用 `value?.universe ?? remembered.current`。
- **被否 A：放宽 `WorkspaceRequest` 允许 `sessionId` + `workspacePath` 同现**（`sessionId` 只当宇宙锚点，`workspacePath` 当写目标）。理由：`parseWorkspaceRequest` 的「恰好之一」是写进契约与 7 条测试的寻址规则；放宽后「写到哪个键」与「按哪个会话读宇宙」混进同一个 body，`resolveWorkspace` 要重写优先级；更要改 `useWorkspaceDefaults.select()` 的请求构造，违反「状态机原样保留」。
- **被否 B：客户端交叉引用 `panel` 端点拿宇宙**。理由：多一次请求、两份快照各自陈旧；统一弹窗分节不在会话面板上下文，客户端还要内联 panel 的 strict parser 与快照类型——正是 decisions 第 8 条否掉的形态。
- **反例**：放宽寻址后，`{sessionId:'s', workspacePath:'/w2', action:'off'}` 的写入目标必须再裁定一次优先级；命令面只有 session 形态、RPC 有两形态，同一请求在两条路径上给出不同键，`workspaces.json` 会写到用户没在看的那个工作区。

### D-19 用户级编辑器零新增 wire 字段：宇宙取 `PanelSnapshot` 的客户端投影

- **决策**：`DefaultsEditor` 的宇宙由 `universeOfSnapshot(snapshot)` 得到（`groups` 的 mcp/builtin 行投影 + `skills` 重组成技能行），不扩 `defaults` 端点的读路径。
- **被否 A：扩 `DefaultsValue` 带宇宙**。理由：`DefaultsRequest` 只有 `action`/`addresses`，不寻址会话，宿主拿不到层；要扩就得给 defaults 端点加 `sessionId`，把「用户级」语义改成「会话相关」——与 D10 的「用户级档作用于所有新会话」相悖。
- **被否 B：把 `DefaultsUniverse` 复制进 `PanelSnapshot`**。理由：与 `groups` 重复一份同量级 payload（每服务器每工具一行），只为省 20 行投影函数；且两处 future 漂移风险。
- **反例**：若 defaults 端点带宇宙，命令面 `/tools default off skill:x` 的写入没有会话上下文 → 响应只能 `universe:null` → 面板要两套渲染分支（有宇宙/无宇宙），正是 D-17 被否理由的重演。

### D-20 新建共享分组组件，不复用 `ToolPanelGroups`

- **决策**：新建 `DefaultsGroupList`（分组 / 折叠 / 过滤 / 锁态 / 组开关 / 残留）；从 `ToolPanelGroups` **只导出两个纯函数**（`groupTitle`、`defaultExpanded`）复用；样式类复用 `panel.module.css`。
- **被否 A：给 `ToolPanelGroups` 加 `mode='session'|'defaults'` 分支**。理由：行语义 `checked = !disabled`（会话）vs `checked = !inDefaults`（档）不同，动作不同（`toggle` vs `defaults off`），无「恢复创建时快照」，多「整组默认关时行置灰」；一处改动会同时影响 A 的 G5 与 B，回归面翻倍。
- **被否 B：把行语义抽成 `rowOf()` 回调注入同一组件**。理由：表面参数化，实际把两套状态机的差异藏进回调；读代码要跳两跳才能回答「这一行的 `checked` 是什么」，而它恰恰是用户唯一能看见的事实。
- **反例**：复用模式的失败案例就在本仓——`WorkspaceDefaultsEditor` 与 `DefaultsEditor` 当前各自长了一份 chips + 输入框（字段面同款、文案两套），B 正是要把它们收敛成一份分组组件；若再把会话面板塞进来，下一次「会话面板加个锁态」就要同时改三方，而三方的写入端点各不相同。

### D-21 行语义与锁态两态；整组默认关时行禁用（`blocked`）

- **决策**：行 `checked = !disabled.has(address)`；锁态只有 `protected` / `reserved`（A 已删 `shadowed`）；整组地址在目标档关闭集里时，组内行整体禁用并给 `defaults.groupOff` 标签与 `title`；内置工具组无组开关。
- **被否 A：`blocked` 行仍可点**（沿会话面板 MCP 组的既有行为）。理由：会话面板里组关闭后行开关确实点不出效果（deny 来自组地址）——这是既有瑕疵；默认档界面从零设计，不复制它。
- **被否 B：组关闭时把行渲染成「全部已关」但不禁用**。理由：把「组地址在档里」与「每个行地址都在档里」两种不同事实显示成同一画面；用户关掉组开关时行会突然全亮，像是状态被改。
- **反例**：若行不禁用，用户在整组默认关的状态下点 `mcp:a::x`（写进档），再打开整组开关——`mcp:a::x` 仍默认关。用户以为自己那下没生效，会重复点击三次，最后把整组又关回去。

### D-22 残留区只读可移除，不提供任何添加入口（承接 decisions D8）

- **决策**：`residual = disabled \ 宇宙地址集`；chips 列表（等宽地址 + 移除按钮）；无输入框、无添加按钮；跨宇宙地址的新关由 `defaults.cliHint` / `workspace.cliHint` 指向 `/tools default off` 与 `/tools workspace off`。
- **被否 A：保留「高级添加」次级输入行**（explore Q2 的推荐项）。理由：用户已裁定完全移除（D8）；只要留输入框，清单宇宙的边界就重新变成「可写任意地址」，界面与「只列本会话可见工具」自相矛盾。
- **被否 B：残留区只读不可移除（只能 CLI 移除）**。理由：档里已有的历史地址（其他会话/其他工作区时期写入）用户至少要能在界面上清掉，否则界面连「看得见的缺陷」都修不了。
- **反例**：若保留输入框，用户输入 `mcp:never-exists` 后它出现在残留区——它不在宇宙里、也没有任何「本会话可见」证据，却和新关成功的地址长得一模一样；用户会以为开关生效了，直到新会话里什么都没发生。

### D-23 技能区两条降级轴：服务缺席只降级行，不隐藏 `tool:skill` 组开关

- **决策**：`skillsAvailable === false` 时技能组保留标题与 `tool:skill` 组开关，行区显示 `skill.unavailable`；技能行 = `skills.visible` ∪ `skills.shadowed`（与面板同源），地址 `skill:<name>`。
- **被否 A：整组隐藏（连组开关一起）**。理由：`tool:skill` 若在档里会既不是开关也不在分组里，只能落进残留区——语义上「整档关」被误读成「清单外地址」。
- **被否 B：服务缺席时把技能行按「无描述」照常渲染**。理由：没有技能服务时行状态语义未定义、切了也没有真实效果，正是 `SkillPanel` 用 `unavailable` 整块降级的理由。
- **反例**：整组隐藏时，用户看到残留区里躺着一个 `tool:skill` chip——他是上周在会话里关掉整个技能面的；界面告诉他「这是清单外地址」，他会怀疑档文件坏了。

### D-24 面板两分区默认折叠（承接 decisions D13）；折叠态不会藏错误

- **决策**：`DefaultsSectionFrame` 包裹面板形态的两个编辑器，默认收起，标题行显示 `defaults.summary`；失败只可能发生在展开态的写入/刷新里（两个编辑器的失败源都在 body 内），因此不做「错误自动展开」。
- **被否 A：两分区都不折叠，靠面板整体滚动**。理由：D13 已裁默认折叠；一个会话 200 个工具 + 两套默认档清单会让面板滚三屏。
- **被否 B：折叠标题行只显示标题、不显示计数**。理由：D13 要求标题行带计数摘要，否则收起的默认档是纯黑盒（用户不知道有没有默认关的东西）。
- **反例**：不折叠时，用户点开面板想关一个 MCP 工具，要先滚过「用户级默认档」的 200 行开关——默认档是低频操作、会话开关是高频操作，顺序上把低频推到了高频前面。

### D-25 文案键：新增 12、删除 8；三计数用单键三占位

- **决策**：见 ③ 3.20；三计数用 `defaults.counts` 单键带 `{listed}/{inDefaults}/{residual}`（D11 的「三键」按「三个数」落地；标题摘要另用 `defaults.summary` 两占位）。
- **被否 A：三个独立键 `defaults.count.listed` 等拼接**。理由：同一行内三个数字拆成三个键会让语序不可译（英文语序与中文不同）；单键占位是 locale 系统的既有做法（`group.summary` 同型）。
- **被否 B：复用 `group.disabledCount`（「已关 {count} 个」）**。理由：默认档的「默认关」不是「已关」——当前会话并没有关那些条目，只是新会话默认关；借词会让文案与事实相反。
- **反例**：若复用 `group.disabledCount`，用户级默认档区显示「已关 3 个」，紧接着 `defaults.scope` 又说「只影响之后新建的会话」——同一块界面自相矛盾，用户会去开关区找那 3 个已关项。

---

## ⑤ 逐任务组实现要点

> **组间串行、组内可并行**（单组并行度 ≤ 4）。每组出口都是**可执行命令 + 具体断言**，不写「已实现/工作正常」。
> 阶段 2 的 `tasks.md` 按本 G1–G10 落 **T1–T10 一一对应**（组名、文件、出口命令逐条照搬）。
> **执行顺序**：unify 先提交、执行完成并归档 → 本变更 G1–G6（A）→ G7–G10（B，依赖 A 的 `visibleSchemas()` 与两读口径）。
> 注意：`vitest` 走 esbuild 转译**不做类型检查**，因此类型面在中途为红是正常的；`pnpm typecheck` 只在 G6/G10 作为门禁。

### G1 — 契约与端口形状（串行闸；对应 T1）

- **文件**：`src/contract.ts`、`src/host/types.ts`（+ `test/wire-contract.test.ts` 夹具）。
- **要点**：
  1. `contract.ts` 删 `ToolEntry.shadowed` / `StatsView.catalog` / `StatsView.shadowed` / `PanelSnapshot.hiddenByOthers`，同步三张 strict 键表与三个 parser 的读取与返回；
  2. `types.ts` 删 `ControlDeps.catalog`、`PanelInputs.catalog`（含「三读并集」文档），加 `VisibleToolSchema`、`ScopedSurface.visibleSchemas()`、`LayerHandle.visibleSchemas()`；
  3. 交叉可赋值段（`wire-contract.test.ts:1113-1143`）保持原样——它会自动抓住 host 侧漏改。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts
  ```
  必含断言（新增/改写）：
  - `expect(parsePanelSnapshot(plain(SNAPSHOT)).value.stats).toStrictEqual({ visible: 12, denied: 2 })`
  - 旧键出现即拒绝（三条，`fragment` 指向键名）：`setAt(SNAPSHOT,'stats.catalog',9)` → `ok:false`；`setAt(SNAPSHOT,'groups.0.tools.0.shadowed',false)` → `ok:false`；`setAt(SNAPSHOT,'hiddenByOthers',[])` → `ok:false`
  - `dropAt(SNAPSHOT,'stats.denied')` → `ok:false`（新必填键）
  - `expect(Object.keys(result.value.groups[0].tools[0]).sort()).toEqual(['address','description','disabled','name','protected','reserved','shortName'])`
- **禁止**：在本组改 `panel.ts` 之外的宿主逻辑（`types.ts` 只加类型，不加运行时）。

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`vitest run test/wire-contract.test.ts` 268/268 全绿（263→268：+3 形状断言 +3 旧键拒绝 −1 删用例）；1.3 落地前 42 failed 全为夹具旧键 strict 拒（预期红）。
  - 行号漂移：unify 归档后 `contract.ts`/`wire-contract.test.ts` 实际行号与本蓝图快照有偏移，三个子代理均按内容定位完成，无一处需回改。
  - TS7 的「顶层键集合期望数组（L754）」在现行文件中不存在（该处实为空快照用例的 `hiddenByOthers` 链）；执行改为**新增**顶层 11 键精确断言落实设计意图（1.3 回执偏差，已核对接受）。
  - 验证句口径：`grep -c "shadowed"` 实测 5（3 处 SkillView 保留 + 2 处 G1 强制拒绝断言）；「仅剩 SkillView 相关命中」按意图豁免强制拒绝断言自身的命中。
  - 1.2 偏差接受：`visibleSchemas()` 返回 `readonly VisibleToolSchema[]`（与蓝图 ③ 3.2 及文件既有 `readonly string[]` 风格一致）。

### G2 — 会话读数面（层 + RPC + 装配；对应 T2）

- **文件**：`src/host/session-layer.ts`、`src/host/rpc.ts`、`src/host/index.ts`（+ `test/session-layer.test.ts`、`test/rpc.test.ts`）。
- **要点**：
  1. `SessionLayerPorts` 删 `catalog`，字段/构造赋值/`plan()` 的 catalog 分支一并删；`plan()` 只读 `surface.visibleNames()`；
  2. 加 `visibleSchemas()`（层与 `surfaceOf` 两面），`AgentServiceScope.tools.schemas` 返回类型补 `description?: string`；
  3. `RpcDeps` 删 `descriptions`，`descriptionsOf(deps, session)` 经 `deps.layerFor(session.id)` 取，层缺席/抛错 → 空 `Map`；
  4. `index.ts` 删 `catalog` 闭包、`controlDeps.catalog`、`rpcDeps.descriptions`，`new SessionLayer({ log })`；`inject` 名单不动。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/session-layer.test.ts test/rpc.test.ts
  grep -n "catalog" plugins/session-tool-toggle/src/host/session-layer.ts plugins/session-tool-toggle/src/host/index.ts   # 期望：无输出
  grep -n "descriptions:" plugins/session-tool-toggle/src/host/index.ts                                                  # 期望：无输出
  ```
  必含断言：
  - `expect(layer.visibleSchemas()).toEqual([{ name: 'mcp__a__x', description: '读取页面内容' }])`
  - `fake.setVisibleSchemasError(new Error('boom')); expect(layer.visibleSchemas()).toEqual([])` 且日志含「读本会话的工具描述失败」
  - **首轮读视图失败不再掩码**（翻转既有断言）：`fake.setVisibleError(new Error('boom')); await layer.attach(...); expect(fake.restrictCalls).toHaveLength(0)`，且 `expect(fake.guardCalls).toBe(1)`（guard 仍装）
  - **carried 保底不抬掩码**：`attach` 成功 → `fake.setVisibleError(new Error('boom')); layer.refresh()` → `expect(fake.restrictCalls).toHaveLength(1)`（仍是一轮，未先抬后装）且 `expect(layer.snapshot().deny).toEqual(['mcp__a__x'])`
  - RPC：`expect(panel.groups[0].tools[0].description).toBe('读取页面内容')`；`harness({ withLayer:false })` → `expect(panel.groups).toEqual([])` 且请求成功（`degraded.ok === true`）
- **禁止**：在 G2 改 `commands.ts` / `panel.ts` / `control.ts`（它们的 catalog 引用留到 G3、G4，中途 vitest 不会因类型红而失败）。

### G3 — 掩码与内核两读（对应 T3）

- **文件**：`src/host/mask.ts`、`src/host/control.ts`（+ `test/mask.test.ts`、`test/control.test.ts`）。
- **要点**：
  1. `MaskInputs` 删 `catalog`、`unionNames` 两读、文件头三读段重写；
  2. `control.ts` 删 `catalogOf`、`toggleSession`/`readPanel` 的 catalog 取数、`PanelReading.catalog` / `.hiddenByOthers`、`unionNames` 两参；
  3. 文档：`readPanel` 的「三读并集」「被其他作用域隐藏」两段改会话口径。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts test/control.test.ts
  grep -rn "hiddenByOthers\|catalogOf" plugins/session-tool-toggle/src/host/control.ts   # 期望：无输出
  ```
  必含断言：
  - `expect(planMask({ scoped: [], carried: [], disabled: ['mcp:a'] })).toEqual({ deny: [], shadowServers: ['a'], matched: new Map([['mcp:a', 0]]) })`（纯意图 + 段遮蔽保留）
  - `expect(planMask({ scoped: ['mcp__b__y'], carried: ['mcp__a__x'], disabled: ['mcp:a'] }).deny).toEqual(['mcp__a__x'])`（carried 保底）
  - `expect(planMask({ scoped: ['mcp__a__x'], carried: [], disabled: ['mcp:a'] }).deny).toEqual(['mcp__a__x'])`（scoped 单独生效）
  - 内核：`harness({ scope:['mcp__b__y','bash'], disabled:['mcp:a'] })` → `expect(reading.scoped).toEqual(['mcp__b__y','bash'])`、`expect(reading).not.toHaveProperty('catalog')`、`expect(reading).not.toHaveProperty('hiddenByOthers')`
  - 关闭会话外组：`toggleSession(deps, session, ['mcp:dbx'], false)` → `report.entries[0].matched === 0`、`report.schemaChanged === false`、`deps.store.read(session).disabled` 含 `'mcp:dbx'`、`layer.snapshot().deny` 不含 `mcp__dbx__*`
  - `expect(reading.serverGroups).toEqual([{server:'b',address:'mcp:b',count:1}])`（只由 scoped ∪ carried 推出）
- **禁止**：顺手把 `unionNames` 抽到 `mask.ts` 共用（见 ⑥ U3）。

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`vitest run test/mask.test.ts test/control.test.ts` 88/88 全绿（mask 41 + control 47，control 删 2 增 2 用例数不变）。
  - `control.ts` 私有 `unionNames(scoped, carried)` 两参副本保留（未从 mask.ts 抽共用，U3 遵守，JSDoc 记录裁定）；`candidates = unionNames(scoped, applied.deny)`。
  - 跨组接口对齐实证：3.1 落地后 session-layer.ts 的 `Property 'catalog' is missing` 瞬态自动消失；全仓 typecheck 错误 99 → 67 →（3.2 后）client/test 侧余错。

### G4 — 面板构建器与命令面（对应 T4）

- **文件**：`src/host/panel.ts`、`src/host/commands.ts`（+ `test/panel.test.ts`、`test/commands.test.ts`）。
- **要点**：
  1. `panel.ts` 按 ③ 3.6 改（候选两读、删 `catalogNames`/`hiddenByOthers`/`EntryContext.hidden`/`ToolEntry.shadowed`/`Stats` 两计数），模块头推导链重写并写明「与 `/inventory` 两处刻意差异」；
  2. `commands.ts` 按 ③ 3.9 改（删 `hiddenText`、段 6 收口、`switchableText` 降级分支、matched=0 文案、两处注释）。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel.test.ts test/commands.test.ts
  grep -rn "hiddenByOthers\|hiddenText" plugins/session-tool-toggle/src/host/panel.ts plugins/session-tool-toggle/src/host/commands.ts   # 期望：无输出
  ```
  必含断言（新增面，逐条写进测试）：
  - 「整组被其他作用域隐藏的服务器不出现在分组」：`inputs({ scoped: ['mcp__b__y'], carried: [] })` → `expect(snapshot.groups.map(g => g.key)).toEqual(['b'])`
  - 「carried 保底」：`inputs({ scoped: [], carried: ['mcp__a__x'], state: stateWith(['mcp:a']) })` → 组 `a` 存在、该条目 `disabled:true`、`expect(snapshot.stats).toEqual({ visible: 0, denied: 1 })`
  - 「关闭会话外工具 = 无条目 + intentOnly」：`inputs({ scoped: ['bash'], state: stateWith(['mcp:dbx']) })` → `expect(snapshot.groups.map(g => g.key)).toEqual(['builtin'])`、`expect(snapshot.intentOnly).toEqual(['mcp:dbx'])`
  - 「形状」：顶层键不含 `hiddenByOthers`；`expect(Object.keys(snapshot.stats).sort()).toEqual(['denied','visible'])`；工具条目键不含 `shadowed`
  - 命令面：`expect(text).toContain('MCP 服务器 2 台（mcp:a 1、mcp:b 1）')` 且 `expect(text).not.toContain('被其他作用域隐藏')`
  - `expect(lineWith(text,'mcp:zzz 0 个工具定义')).toContain('已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效')`
  - 层未就绪：`expect(text).toContain('【可关对象】会话层未就绪：无法读取本会话的工具清单')`

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`vitest run test/panel.test.ts test/commands.test.ts test/rpc.test.ts` 167/167 全绿（panel 46 + commands 72 + rpc 49）。
  - **stats visible 语义裁决（蓝图矛盾修正）**：③ 3.6 片段的 `visible: scopedNames.length` 与 G4 必含断言（carried 保底 `{visible:0,denied:1}`）及 `test/rpc.test.ts` 期望 `{visible:1,denied:2}` 矛盾——执行按「**visible = 候选（scoped ∪ carried 去重排序）− deny**」实现（4.1），4.3 断言同口径。后续组（7.2 的 buildDefaultsUniverse 等）引用 stats 语义时以本条为准。
  - D-9 两处刻意差异已写进 `panel.ts` 模块头（已关条目 + `tool:`/`tool:skill` 行），未新增 UI 文案。
  - 4.2 的层未就绪判定复用 `PanelReading.layerReady` 既有字段（control.ts L212/533），非新字段；`hiddenText` 整块删除、段 6 只剩保护名单。
  - 4.4 连带修补：`FakeLayer.visibleSchemas()` 补齐（LayerHandle 接口必需）、「层未就绪 off」用例按新语义改写（无层 → matched 0）。
- **禁止**：改 `intentOnly` 的三分逻辑（工具 0 命中 ∪ 技能无安装）——它一字不动。

### G5 — 浏览器半（对应 T5）

- **文件**：`src/client/locales.ts`、`src/client/ToolPanelGroups.tsx`、`src/client/ToolPanelAction.tsx`、`src/client/panel.module.css`（+ 四个客户端测试文件）。
- **要点**：删四键（zh/en 各四，锚点按 ② 2.1 的 87/93/156/158 与 245/251/313/315）；`lockOf` 两态；状态摘要两计数；注释同步。
- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：四文件 vitest 125/125 全绿（tool-panel 31 + locale-parity 10 + panel-client 42 + panel-controller 42）；`grep src/client` 四旧键零残留；src/ 侧 typecheck 0 错（余错全部收敛到 test/** 后被本组清零）。
  - locales zh/en 对称删 4（各 106 键不变对称）；REQUIRED_KEYS 73→70。
  - 行禁用实现语义澄清：`disabled = busy || locked || pending`，**不含 `tool.disabled`**（否则已关工具无法重开）——蓝图 5.2 提示里的 `tool.disabled || locked` 是语义简写，以实现为准。
  - 连带注释清理（主会话）：`SkillPanel.tsx` L9 陈旧交叉引用（工具行 shadowed 已废）、`panel.module.css` L65「四计数」→「两计数」。
  - TS8 的 counters 断言用 `ul[class*="counters"]` + `screen`+`closest('section')`（面板正文 portal 到 body，render container 取不到）——沿用后续组写 UI 断言时注意。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run \
    test/tool-panel.test.tsx test/locale-parity.test.ts test/panel-client.test.ts test/panel-controller.test.ts
  grep -rn "entry.shadowed\|badge.shadowed\|state.catalog\|state.shadowed" plugins/session-tool-toggle/src/client   # 期望：无输出
  ```
  必含断言：
  - `expect(zh).not.toHaveProperty('entry.shadowed')` / `'badge.shadowed'` / `'state.catalog'` / `'state.shadowed'`（en 同）
  - 渲染：`expect(screen.queryByText(/被其它作用域隐藏/)).toBeNull()`；`expect(screen.queryByText(/全局 \d+/)).toBeNull()`；状态摘要的 `<li>` 数为 2
  - 保护 / 保留名两态仍各自禁用并带 `title`（既有断言保留）：`expect(switchOf('bash').disabled).toBe(true)` + `title === zh['badge.protected']`；`switchOf('run_code')` 同理
- **禁止**：动 `SkillPanel.tsx` 与技能文案（`skill.effective` / `skill.intentOnly` 保留）。

### G6 — A 的文档、产物与全量回归（对应 T6；**spec delta 起草移至 G10**）

- **文件**：`README.md`（插件）、`lib/index.js`、`lib/client.js`。
- **要点**：
  1. README 两处改写（① B2 的 A 段，文案口径见 ③ 3.9 / ③ 3.11），并核对「六段面板」描述里不再出现「被隐藏」；
  2. `pnpm build` 重建双产物，确认 `git status` 只含预期文件（不得带上 `.gitignore`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js`）；
  3. **S1–S3 的起草不在本组做**：delta 必须同时覆盖 A 与 B（D12 重基线），在 G10 一次写；本组只保证 A 的代码面闭环（否则会先写出一版马上被 B 覆盖的 delta）；
  4. **前提**：unify-workspace-config-entry 已提交且工作树对该子包干净——本组末尾的 `git status --short plugins/session-tool-toggle` 断言只有在 unify 提交后才成立（否则会把 unify 的未提交改动误判成本变更的产出）。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle verify:all     # lint + typecheck + build + 全量 test
  grep -c "hiddenByOthers" plugins/session-tool-toggle/lib/index.js     # 期望 0
  grep -c "entry.shadowed" plugins/session-tool-toggle/lib/client.js    # 期望 0
  grep -c "被其他作用域隐藏" plugins/session-tool-toggle/README.md      # 期望 0
  ```
  门禁口径：全量测试文件全绿、零 `skip`；`typecheck` 零错误；`lint` 零告警（oxlint 抓删除后残留的未用 import / 变量）。
- **禁止**：`git add -A`（并行会话与本变更未提交文件并存，必须逐路径 add）。

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`verify:all` exit 0，**22 测试文件全绿、1013 用例、零 skip**；产物纯度 `hiddenByOthers`(index)=0、`entry.shadowed`(client)=0、`被其他作用域隐藏`(index)=0；`shadowed`(client)=5（技能分面保留，预期）；`hiddenSkills/hiddenTools` 抽检证明产物吸收新契约。
  - **连带夹具修正（主会话，类型驱动）**：`test/workspace-editor.test.tsx` L374/L376 的旧形状夹具（`hiddenByOthers` + 四计数 stats）在 6.3 typecheck 必红，而其完整重写属 9.5/TS12——最小修正为删 `hiddenByOthers` 行、stats 改 `{visible:0, denied:0}`（数值沿用，断言零改动）。9.5 重写时以本修正后的夹具为基。
  - **并行变更发现（不处置）**：工作区另有 `openspec/changes/project-mcp-isolation-enforcement/{code-design,design,tasks}.md` 的未提交改动，属**另一会话并行执行**该变更（tasks 勾选 1.1/2.1/3.1/4.1/4.2 等）——keep-out 四条目零出现、6.2 门禁不受影响；**最后提交时绝不 add 该三文件**（逐路径 add 纪律）。
  - node 引擎告警（容器 22.18.0 vs engines ^22.19.0 / volta pin 24.21.0）为既有环境偏差，非阻塞。

### G7 — 默认档宇宙的契约与宿主构建（对应 T7）

- **文件**：`src/contract.ts`、`src/host/panel.ts`、`src/host/rpc.ts`（+ `test/wire-contract.test.ts`、`test/panel.test.ts`、`test/rpc.test.ts`、`test/panel-client.test.ts`）。
- **要点**：
  1. W1：`DefaultsEntry` / `DefaultsGroup` / `DefaultsUniverse` + `WorkspaceValue.universe` + 三张 strict 键表 + 三个 reader + `parseWorkspaceValue` 必填 `universe`；
  2. W2：`buildDefaultsUniverse` 与 `DefaultsUniverseInputs`（③ 3.16），复用 `panel.ts` 既有私有件，**不改** A 后的 `buildPanelSnapshot`；
  3. W3：`EMPTY_UNIVERSE` + `universeOf`（③ 3.17），`handleWorkspace` 的读/写两份 `WorkspaceValue` 都带 `universe`（`{workspacePath}` → `null`）；
  4. 测试：TS15 / TS17 / TS16 / TS18 的契约与宿主部分。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts test/panel.test.ts test/rpc.test.ts
  grep -n "universe" plugins/session-tool-toggle/src/host/rpc.ts | head   # 期望：universeOf / EMPTY_UNIVERSE / 两处字面量
  grep -n "buildDefaultsUniverse" plugins/session-tool-toggle/src/host/panel.ts plugins/session-tool-toggle/src/host/rpc.ts
  ```
  必含断言：
  - `const parsed = parseWorkspaceValue(plain(WORKSPACE_VALUE)); expect(parsed.ok).toBe(true);` 且 `parsed.value.universe?.groups.map(g => g.kind)` 为 `['mcp','skill','builtin']`
  - `dropAt(WORKSPACE_VALUE,'universe')` → `ok:false`；`setAt(WORKSPACE_VALUE,'universe.groups.0.kind','server')` → `ok:false`；`setAt(WORKSPACE_VALUE,'universe.groups.0.tools.0.address','')` → `ok:false`
  - rpc：`{sessionId}` read 的 `universe.layerReady === true` 且 `groups` 只由 scope ∪ carried 推出（被掩掉的服务器不出现）；同形态 `off` 写响应也带 `universe`；`{workspacePath}` read 的 `universe === null`；`withLayer:false` → `{layerReady:false, skillsAvailable:false, groups:[]}`
  - `buildDefaultsUniverse({ layerReady:false, ... })` 深等于空宇宙；`skills:{available:false}` → `skillsAvailable:false` 且技能组（含 `tool:skill`）仍在
- **禁止**：给 `WorkspaceRequest` 加字段（D-18）；改 `panel-controller.ts`（D-19）。

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`vitest run test/wire-contract.test.ts test/panel.test.ts test/rpc.test.ts` **401/401 全绿**（291 + 56 + 54；wire-contract +23 拒绝/合法用例、panel +10、rpc +5）；全包 typecheck exit 0（7.2/7.3 互相连通后瞬态清零）。
  - 技能组存在性裁定（7.2 Q1，主会话裁定**维持现实现**）：组的存在由候选分桶决定（候选含 `skill` 名才建组）、行由 skills 分面决定（`available:false` → 行空、`tool:skill` 组开关仍在）——③ 3.16 要点 4 原文「组开关仍在」优先于提示批注的「skills 缺席 ⇒ 组整个不出现」。
  - 7.1 偏差接受：`readDefaultsGroup` 的 kind 复用既有 `TOOL_GROUP_KINDS`（避免枚举双源）。
  - 7.3 fixture 细节：carried-only 内置行用 `workflow` 而非 `bash`（`bash` 在保护基线，`parseAddress` 拒绝，永不进 deny——假层与生产同语义）。
  - 7.4 扩围（主会话裁定）：TS18 原文两文件之外，`tool-panel.test.tsx`/`workspace-editor.test.tsx` 的 WorkspaceValue 夹具并入补 `universe:null`（同性质夹具补键；T7/T8 期间 typecheck 判定面保持干净，9.5/9.6 重写时自然覆盖）。
  - rpc `EMPTY_UNIVERSE` 与 panel 私有冻结空宇宙逐字同形、分属两处（③ 3.16/3.17 本如此），未抽共用。

### G8 — 客户端基础件（对应 T8）

- **文件**：`src/client/defaults-view.ts`（新建）、`src/client/DefaultsGroupList.tsx`（新建）、`src/client/DefaultsSectionFrame.tsx`（新建）、`src/client/ToolPanelGroups.tsx`（只导出两个纯函数）、`src/client/locales.ts`（W11）、`src/client/panel.module.css`（W12）（+ `test/defaults-view.test.ts`、`test/locale-parity.test.ts`）。
- **要点**：
  1. W4 的四个纯函数（③ 3.18）；
  2. W5 的分组清单（③ 3.19 的行/组语义表逐条落地；锁态两态；`blocked`；技能两轴降级；残留 chips 只可移除；无添加入口）；
  3. W6 的折叠壳（默认收起、计数摘要）；
  4. `ToolPanelGroups` 只把 `groupTitle` / `defaultExpanded` 改成 `export`（行为零改动）；
  5. W11 键表增删；W12 样式（复用既有类，删 `.addInput`）。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/defaults-view.test.ts test/locale-parity.test.ts
  grep -rn "defaults.add\|defaults.addPlaceholder\|defaults.placeholder\|workspace.add\|workspace.addPlaceholder\|workspace.placeholder" plugins/session-tool-toggle/src   # 期望：无输出
  grep -c "defaults.cliHint\|workspace.cliHint\|defaults.counts\|defaults.summary" plugins/session-tool-toggle/src/client/locales.ts   # 期望 ≥ 4
  ```
  必含断言：
  - `defaultsCountsOf(universe, ['mcp:a','skill:x'])` → `{listed: N, inDefaults: 2, residual: 0}`；`defaultsCountsOf(universe, ['mcp:zzz'])` → `residual: 1`
  - `residualOf(universe, ['mcp:zzz','mcp:a'])` → `['mcp:zzz']`（升序）
  - `universeOfSnapshot(snapshot)` 的技能组：`address === 'tool:skill'` 且行地址为 `skill:<name>`
  - `zh` 无 8 个已删键；`en` 与 `zh` 键集合相等（locale-parity 自动覆盖）
- **禁止**：在 `DefaultsGroupList` 里读 `t()` 之外的任何全局状态；不让该组件 import 宿主模块。

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：defaults-view 20/20、locale-parity 10/10（zh/en 110/110 对称）；`.addInput` 删除（css L343 区）、`.sectionFrame`/`.residual` 就位；8.2 三文件 typecheck 零错误（`tsc -b --force` 复核），全包红点仅剩两个旧编辑器与 9.x 测试的预期瞬态。
  - **主会话连带修正**：`test/defaults-view.test.ts` 补进 `tsconfig.client.json` include（`.ts` 测试逐文件枚举惯例，`.tsx` 走通配）。
  - **裁定 P1（组头计数口径）**：`defaults.groupCount`/`groupInDefaults` 按**行数**（与 `ToolPanelGroups` 的 `toolCount/disabledCount` 同构，不含组开关本身）；分区摘要三计数（`defaultsCountsOf`）才是组开关计入 listed 的层级——两层级口径不同不矛盾。9.5/9.6 断言按行数写。
  - **裁定 P2（cliHint 渲染归属）**：保留 `DefaultsGroupList` 自渲染 `copy.cliHint`（③ 3.19 接口权威形状即此语义）。**9.1/9.2 handoff**：① 编辑器**不要**再单独渲染 `defaults.cliHint`/`workspace.cliHint`（否则同句出现两次）；② **不要**再包 `<section>`（`DefaultsSectionFrame` 自带壳）；③ copy 建议接法——用户级 `{residualTitle: t('defaults.residualTitle'), removeLabel: t('defaults.remove'), removeAria: (a) => `${t('defaults.remove')} ${a}`, cliHint: t('defaults.cliHint')}`；工作区级 `removeLabel: t('workspace.remove')`、`removeAria: (a) => t('workspace.removeAria', { address: a })`、`cliHint: t('workspace.cliHint')`。
  - 8.3 事实性偏差接受：`REQUIRED_KEYS` 实删 7（`defaults.addPlaceholder` 本不在表中）；`defaults.note` 死键按蓝图保留。
  - blocked 行 title 用 `defaults.groupOff` 兼作理由（locales 无专用键，不为此加键）。
  - 8.3 的「grep src 无输出」全局收口**顺延到 9.1/9.2 落地后**（消费者引用届时清除），8.3 勾选随 T9 组收口统一判定。

### G9 — 两个编辑器、两形态与面板接线（对应 T9）

- **文件**：`src/client/DefaultsEditor.tsx`（重写）、`src/client/WorkspaceDefaultsEditor.tsx`（重写）、`src/client/WorkspaceEntry.tsx`（W9）、`src/client/ToolPanelAction.tsx`（W10）（+ `test/workspace-editor.test.tsx`、`test/tool-panel.test.tsx`）。
- **要点**：
  1. W7：用户级编辑器 = 折叠壳 + 路径/告警 + 三计数 + `DefaultsGroupList` + 残留 + `defaults.cliHint` + 三句不追溯 + 清空两段式；`PanelFailure` 导出保留；
  2. W8：工作区编辑器两形态（dialog 保留下拉与刷新；section 用折叠壳、无下拉）；`workspace===null` 只读降级；
  3. W9：`WorkspaceDefaultsSection` 的宇宙缓存 + `selectAndRemember`；`useWorkspaceDefaults` **一行不改**；
  4. W10：`ToolPanelAction` 用 `useMemo(() => universeOfSnapshot(snapshot), [snapshot])` 给两个编辑器传 `universe`，删掉对两编辑器外层的多余 `<section>`（它们自己渲染）；
  5. 测试：TS12 / TS13 重写。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx test/tool-panel.test.tsx
  grep -rn "splitAddresses\|draft\|addPlaceholder" plugins/session-tool-toggle/src/client   # 期望：无输出
  grep -rn "useWorkspaceDefaults" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx | head   # 仍只有原实现与调用
  ```
  必含断言（新增面，逐条写进测试）：
  - 面板两分区默认收起：`expect(screen.queryByRole('switch', {name: zh['defaults.switchLabel'].replace('{name}', 'bash')})).toBeNull()`；点击 `zh['section.defaults']` 标题后 `getByRole('switch', …)` 出现；标题行文本含 `默认关`
  - 行开关关闭：`fireEvent.click(switchOf('mcp__a__x'))` → `expect(onUpdate).toHaveBeenCalledWith('off', ['mcp:a::x'])`；开启 → `('on', ['mcp:a::x'])`
  - 组开关：`fireEvent.click(switchOf('mcp:a'))` → `('off', ['mcp:a'])`；技能组 → `('off', ['tool:skill'])`
  - 整组默认关：`disabled: ['mcp:a']` → 组内行开关 `disabled === true` 且行内有 `zh['defaults.groupOff']` 标签
  - 锁态：`protected: true` 行禁用且 `title === zh['badge.protected']`；`reserved: true` 行 `title === zh['badge.reserved']`
  - 残留区：档内 `['mcp:zzz','mcp:a']`、宇宙含 `mcp:a` → 只渲染 `mcp:zzz` 的 chip；点「移除」→ `('on', ['mcp:zzz'])`；页面**没有**任何添加输入（`expect(document.querySelectorAll('input[type="text"]')).length` 只等于内置工具过滤框的数量）
  - 三计数行：`expect(screen.getByText(/清单 \d+ · 默认关 \d+ · 残留 \d+/)).toBeTruthy()`
  - dialog 形态下拉：`fireEvent.change(select, {target:{value:'/w2'}})` → `onSelect('/w2')`；section 形态无 `select`
  - `universe={null}`：渲染 `zh['defaults.universeUnavailable']`，仍有残留区、无分组

- **终形态记录（执行期实测，2026-11-05）**：
  - 出口实绩：`vitest run test/workspace-editor.test.tsx test/tool-panel.test.tsx` **71/71 全绿**（36 + 35）；**全包 typecheck exit 0**（T1–T9 期间全部预期瞬态清零，R2 口径兑现）；oxlint 三文件 0 警告。
  - 9.4 必要偏差（接受留痕）：`state.snapshot` 可选（`PanelSnapshot | undefined`）而 `universeOfSnapshot` 要求完整快照——实际写法 `useMemo(() => (snapshot === undefined ? EMPTY_UNIVERSE : universeOfSnapshot(snapshot)), [snapshot])`，模块级 `EMPTY_UNIVERSE` 仅类型面兜底（两编辑器只在快照分支渲染，该值不进界面）。
  - 9.2 主动裁定（接受留痕）：`workspace === null` 时不渲染三计数行（目标档缺席无可数关闭集），折叠摘要降级 `默认关 0 · 残留 0`；9.5/9.6 断言已按此写。
  - 9.5/9.6 的「无添加入口」断言按实现选稳：全部 input 恰好 1 个且为 `group.filter`（内置过滤）+ chip 无 input + 两条 cliHint 在场——蓝图 `textbox===null` 字面会被过滤框误杀。
  - TS12「删 5 条添加框用例」实测为 2 条专用用例 + 若干内嵌断言（蓝图估计值偏差，添加链引用已全部清零）。
  - 夹具双分区计数刻意不同（用户级 1/1、工作区 1/2）——读错目标档立即红。
  - **切换工作区后分组清单仍在**（缓存回归）：`WorkspaceDefaultsSection` 先返回 `{workspace:/w1, universe: 非空}`，`change` 到 `/w2` 后返回 `{workspace:/w2, universe:null}` → `expect(screen.getByRole('switch', {name: /mcp:a/})).toBeTruthy()`（宇宙来自 remembered）
- **禁止**：改 `useWorkspaceDefaults` 的 phase/saving/sequence 语义；改 `panel-controller.ts`；给统一弹窗加第二层 Modal。

### G10 — 文档、delta 重基线、产物与全量回归（对应 T10）

- **文件**：`README.md`（W14）、`lib/index.js`、`lib/client.js`（W13）、`openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/{proposal.md,tasks.md,specs/dsh-session-tool-toggle/spec.md,diff-matrix.md}`。
- **要点**：
  1. README 的 B 段（W14 三条已知限制 + 两分区折叠描述）；A 段已在 G6 改；
  2. S1–S3 一次起草：`specs/…` 以 **unify 归档后的主规格**为基（③ 3.21 的表逐条落句），`proposal.md` / `tasks.md` 声明执行顺序依赖，`diff-matrix.md` 记 R15①/R18①/R20① + 「unify 的草稿丢弃接受项失效」；
  3. `pnpm build` 重建双产物；`git status` 只含预期文件（逐路径 add）；
  4. 全量门禁三连。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle verify:all
  grep -c "hiddenByOthers\|state\.catalog\|entry\.shadowed" plugins/session-tool-toggle/lib/index.js   # 期望 0
  grep -c "hiddenByOthers\|state\.catalog\|entry\.shadowed" plugins/session-tool-toggle/lib/client.js  # 期望 0（技能分面的 shadowed 是另一字面量，按具体键 grep）
  grep -c "defaults.cliHint" plugins/session-tool-toggle/lib/client.js                                 # 期望 ≥ 1
  grep -c "被其他作用域隐藏" plugins/session-tool-toggle/README.md                                     # 期望 0
  openspec validate 2026-11-05-session-tool-toggle-session-scoped-catalog --strict                     # 期望退出码 0（阶段 2 落档后）
  git status --short plugins/session-tool-toggle | grep -v -E "lib/|README.md|src/|test/"               # 期望无输出
  ```
  门禁口径：**23 个测试文件全绿、零 `skip`**；用例总数不作硬门（逐条断言见各组）；`typecheck` 零错误；`lint` 零告警；产物纯度三条 grep 为 0。
- **禁止**：`git add -A`；把 `openspec/changes/unify-workspace-config-entry/*` 的未提交改动带进本变更提交。

- **终形态记录（执行期实测，2026-11-06）**：
  - **10.4 门禁实绩：`verify:all` exit 0——23 测试文件全绿、1085 用例、零 skip；全包 typecheck 零错误；lint 零告警。** 任务 40/40 全勾，全部批次完成。
  - 10.3 门禁措辞修订（主会话裁定）：`entry.shadowed` 探针对 `lib/index.js` 不适用——唯一命中是宿主 `ClosedAddressReading.shadowed`（同名不同义、设计明确保留、HEAD 基线同为 1）；index.js 门禁改为 `hiddenByOthers\|state.catalog` → 0。独立纯度校验（HEAD→now）：index `hiddenByOthers` 11→0；client 旧键全清、`shadowed` 总数 23→5（与蓝图「技能分面保留」逐字吻合）。
  - 10.2 复核结论：**比对通过、零校正**——当前主规格「Web 配置界面」与 unify 归档文本逐字节相同；delta 以该 641 字基线逐字节开头（增补 730 字）；「工作区默认档分节」保留原文不动成立；`openspec validate --strict` exit 0。两点供 spec-done 留意（场景同名两现、U1 近似收窄）——已写入 tasks.md 沉淀回流清单。
  - 10.1 两项裁定：`workspace.cliHint` **维持 ③3.20 键表短版**（落档定稿键表优先；README L121 已完整披露 `workspaces.json` 边界，PB1「接受并写清」意图达成，不动 locales 免生 churn）；README L12 括号顺手补「两个默认档分区——分组开关清单，默认折叠」（主会话一行修正）。
  - 沉淀回流清单与 R4–R6 已追加进 `tasks.md` 附录（并行变更共存纪律、ASCII 探针、验证句粒度意图判定）。

---

## ⑥ 设计假设与未决项

### 6.1 A 部分：设计假设（被证伪须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | `tools.schemas()` 的元素带 `description` | `src/host/index.ts:812` 现用 `schema.description ?? ''` | `visibleSchemas()` 全为空描述 → 面板所有条目失去 `title`（功能不破，需回到 D-4 被否 B） |
| A2 | `visibleNames()` 与 `/inventory` 的 `tools.schemas(agent)` 完全同源 | `session-layer.ts:259` vs `plugins/user-commands/src/host/index.ts:213`（逐字同表达式） | 面板分组与 `/inventory` 对不上 → 须核对 scope key 是否都传了 agent 对象 |
| A3 | `scoped` 是**掩码后**读数，因此已关名字不在其中 | `schemas(agent)` 语义 + `restrict` 生效后名字消失（`test/session-layer.test.ts` 的假 surface 模拟同一行为） | 若 `schemas(agent)` 仍返回被掩名字，`carried` 会与 `scoped` 重复且不构成「保底」→ 需重新论证振荡 |
| A4 | `carried` 能保住瞬时读数失败时的掩码 | `plan.deny = carried ∩ disabled` 的集合运算（见 ③ 3.4） | 若某轮 `disabled` 恰好新增、且读视图失败，本轮掩码不扩（guard 兜底）；这**是**预期降级，不是缺陷 |
| A5 | project-mcp 掩码变化必然触发 `tools/change` | `restrict()` 在 `dsh-scope` 内广播 `tools/change`（`session-layer.ts:316-332` 的 I6 注释即此事实的旁证） | 「纯意图」永不被兑现 → 需在 project-mcp 侧补事件（超出本变更范围，上浮） |
| A6 | 双端同 bundle 发布，无跨版本 wire 兼容需求 | `lib/index.js` 与 `lib/client.js` 由同一次 `build.mjs` 产出、同 tag 安装 | 需在 parser 加兼容分支（与 D-14 冲突，须用户裁决） |
| A7 | 面板不需要 `stats` 之外的会话口径提示 | 用户裁决已把「与 `/inventory` 同口径」定为行为而非文案 | 需新增 locale 键（见待决 P3） |

### 6.2 A 部分：未决项（不阻塞本蓝图，实施期消解）

- **U1 真机冒烟（建议）**：多工作区 + project-mcp 掩码会话（本会话 deny=119 量级）开面板，确认 dbx / dbx-brains / dbx-family / figma / figma-family / yunxiao 六台服务器不出现在分组、`可关对象` 计数同步下降；随后解除某台隔离（切工作区）确认 `tools/change` 后它出现且此前记的关闭地址立刻生效（A5 的实证）。
- **U2 `visibleSchemas()` 的调用成本**：每次面板请求多一次 `schemas(agent)` 读（内存过滤，无 IO）。若某部署的 agent 平面工具数极大且面板高频刷新，可把 `snapshotOf` 里 `skillsOf` 与 `descriptionsOf` 的 `layerFor` 合并为一次查找（微优化，当前不做）。
- **U3 `unionNames` 的两处实现**：`mask.ts`（私有）与 `control.ts`（私有）各有一份两读并集。**不合并**：一处服务掩码匹配（顺序无关），一处服务分组/内置工具清单（顺序无关但需要数组），抽到公共文件只会为一个 3 行函数新增跨模块耦合。
- **U4 `panel.module.css` 的样式类**：`entry.shadowed` 只是注释，没有专属选择器；删除后 `.tag` 仍被 `entry.protected` / `entry.reserved` 使用，无样式重构。

### 6.3 B 部分：设计假设（被证伪须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| B1 | A 的 G2 落地后 `LayerHandle.visibleSchemas()` 可用于任意 live 会话 | A 的 H1/H3 设计；本蓝图 G7 直接调用 | 若只有面板路径加读数，`universeOf` 编译失败或恒空 → D-16 的宿主构建要复用 `readPanel`（更重，需重估） |
| B2 | `{workspacePath}` 响应不带宇宙、客户端缓存足够 | D-18 的推导；`WorkspaceConfigDialog` 切节即卸载（切回重读） | 若验收要求「切到其他工作区的清单必须来自该工作区」，则 U1 本身被否（回到 D-16 被否 A/B） |
| B3 | `layer.skills().available` 能表达「技能服务缺席」 | `SkillLayerSnapshot.available` 的既有语义；`skillsOf` 在层缺席时返回 `undefined` | 技能区降级判据错位（把「无技能」显示成「服务不可用」）→ 需改用 notices 判定 |
| B4 | 统一弹窗分节始终能拿到当前会话 id | `currentSessionIdOf(ctx)` 的两步探测（`current-session.ts`） | 无会话时该分节进 `unavailable`（**现状即如此**，B 不新增更差的降级） |
| B5 | `PanelSnapshot.groups` 的投影是无损的（address/shortName/description/protected/reserved 都在） | A 后的 `ToolGroup`/`ToolEntry` 形状（② 2.3） | 用户级宇宙缺字段（例如 `protected` 消失）→ 编辑器的锁态失效，须改为 `WorkspaceValue` 同款宿主构建（新增 wire 字段） |
| B6 | 双端同 bundle，`WorkspaceValue` 加必填 `universe` 不设兼容窗 | D-14 的既有裁定 | 同 A6：需要兼容分支（与 D-14 冲突，须用户裁决） |
| B7 | D8 的兜底命令 `default off` / `workspace off` 在目标版本可用 | `commands.ts:189-192`、`:217-237`、`:248-275` | 界面文案指向一条不存在的命令（`defaults.cliHint` / `workspace.cliHint` 失真） |
| B8 | 变长分组清单能由 holder 内容列滚动承载 | `workspace-config/src/client/dialog.module.css:199-205` 的 `.panel{overflow-y:auto}` | 长清单溢出/撑破弹窗（B 不改 holder，只能回到「上限截断」式降级，需另行设计） |
| B9 | 两个默认档编辑器不需要 per-address 在途态 | `panel-controller` 只有 `savingDefaults` / `savingWorkspace` 布尔（不按地址） | 需要逐行「正在应用…」→ 要给控制器加 per-address pending（超出 B 范围，且与 D-19「不改控制器」冲突） |
| B10 | 默认档行/组开关的写入成功回执会带回新宇宙（同会话形态） | `handleWorkspace` 的写响应组装（③ 3.17） | 写后分组清单消失 → 必须改状态机或加一次额外 read（违反 D-18「状态机不动」） |

### 6.4 B 部分：未决项（不阻塞本蓝图，实施期消解）

- **U5 归属/写路径的跨工作区体验**：切到其他工作区后，宇宙是当前会话视角（U1），该工作区私有 project-mcp 工具行不出现；若用户要为其预置这类关闭项，只能手改 `workspaces.json`（CLI 的 `workspace` 子命令只作用本会话工作区）。这是 D7 + D8 的合成后果，记入 README（W14）与待决 PB1。
- **U6 宇宙的重复构建成本**：每个 `workspace` 请求（含写）多一次 `visibleSchemas()` + `snapshot()` + `skills()` 读（内存过滤，无 IO），响应多传一份分组清单（与面板 groups 同量级）。当前不做缓存/ETag；若面板高频刷新成为问题，可让 `workspace` 端点也接受「只回 changed」的轻量模式（另立小变更）。
- **U7 两个编辑器的折叠态记忆**：折叠态是组件本地状态，面板关闭再打开会复位为收起（D13 的默认值）。若用户抱怨「每次都要点开」，再考虑把折叠态提到 `PanelController`（会新增一个非业务状态，需要单独立项）。
- **U8 `defaults.note` / `entry.disabled` / `toggle.failed` 三个既有死键**：本次不清（避免无关 churn）；若后续做 locale 键审计，一并删。

---

## 待决问题（六字段之外）

### P1（A，影响契约 + 面板文案 + 3 条测试）`stats` 到底是两计数还是三计数

- **问题**：decisions D3 的裁定是「删 catalog + shadowed」，同时写下「**三计数** `{ visible, denied, … }`」。删两项后现有四项只剩两项；「第三项」未指名。
- **选项**：
  - **A（本蓝图默认，已由 decisions P1 裁定）** 两计数 `{ visible, denied }`：与「删两个」的算术一致，面板两行「本会话可见 N / 已关 M」自洽，wire 与文案改动最小。
  - B 三计数，第三项 = `intentOnly`（「意图 N」）：需新增字段 + `STATS_VIEW_KEYS` + 一条 locale 键 + `ToolPanelAction` 第三行，并同步 `wire-contract` / `tool-panel` / `panel-client` 夹具。
  - C 三计数，第三项 = `entries`（候选宇宙 `|scoped ∪ carried|`）：与 `visible` 差异极小，且这正是 D3 否掉的「catalog 改义」。
- **推荐**：**A**（P1 已落定，本项保留为历史论证与影响面参考）。
- **影响面**：B 影响 `contract.ts`（字段/键/parser）、`panel.ts`（Stats）、`ToolPanelAction.tsx`（多一行）、`locales.ts`（zh/en 各一键）、三个测试文件；A 零额外影响。

### P2（A，影响面板 `title` 体验）已关闭条目是否要有工具描述

- **问题**：描述改经 `tools.schemas(agent)` 后，已关条目（在 `carried` 里、名字已被掩）不再有 `description`（旧口径从全局层 `catalog` 取，所以有）。
- **选项**：
  - **A（本蓝图默认，已由 decisions P2 裁定）** 接受：已关行无悬浮描述，只显示短名 + 「关闭」状态；README 写明该代价。
  - B 层内描述缓存（`Map<name, description>`，在 `visibleSchemas()` 读到时旁路累积，`detach` 清空、容量上限如 256）：已关条目仍带描述；代价是层多一份状态 + 一条缓存淘汰路径 + 2 条测试。
  - C 面板对已关条目显示地址而非描述（无新状态，但展示价值低）。
- **推荐**：**A**（P2 已落定；B 的默认档界面同样继承该代价，见 W14 已知限制）。
- **影响面**：B 影响 `session-layer.ts`（缓存 + 清理）、`session-layer.test.ts`（+2）；A 只影响 README 一句；B 的宇宙构建同样受益（carried 行将有描述）。

### P3（A，影响文案与 locale parity）面板是否加一行「本清单只含本会话有效工具」的预期管理

- **问题**：删掉「被其他作用域隐藏 N」之后，用户看不到「有些工具被别处藏了」这个信息；面板是否需要在分组区顶部加一行说明？
- **选项**：
  - **A（推荐，已由 decisions P3 裁定）** 不加：面板顶部已有 `state.visible`（本会话可见 N）与关闭集；再加说明会与「面板还管 `tool:`/`skill:`」形成解释冲突（D-9 的反例）。
  - B 加一行静态说明（zh/en 各一键，不进 `REQUIRED_KEYS` 也行但进 parity 校验）。
  - C 加一行**仅在有关闭集意图项时**出现的说明（依赖 `intentOnly.length > 0`，动态）。
- **推荐**：**A**（已落定）；若用户要求可见性，C 比 B 更准确（只在真有意图项时出现）。
- **影响面**：B/C 改 `locales.ts` + `ToolPanelAction.tsx`（或 `ToolPanelGroups`）+ `tool-panel.test.tsx` + `locale-parity` 的键表。

### PB1（B，影响能力完整性与 README 口径）跨工作区「新增」默认关闭项没有界面也没有 CLI

- **问题**：D7=U1（宇宙 = 当前会话视角）+ D8（界面完全移除自由文本）合成后，用户切到**其他**已登记工作区时，只能移除该档已有的条目（残留 chips）或翻转清单里出现的开关；该工作区私有 project-mcp 服务器（从未在当前会话出现）**既不在清单里、也无法通过界面对它新增**。CLI 的 `/tools workspace off` 只作用「本会话所属工作区」（`commands.ts:243-245` 明写不提供 `--path`），所以对「另一个工作区」没有等价兜底，只能手改 `workspaces.json`。
- **选项**：
  - **A（推荐，本蓝图默认）** 接受并写清楚：README 的已知限制（W14）+ 统一弹窗的 `workspace.cliHint` 去掉「跨清单」对非当前工作区的能力暗示，改为「本页只列本会话可见的工具；本会话工作区的跨清单新关用 `/tools workspace off`；其他工作区请编辑 `workspaces.json`」。D7/D8 的裁定不重开，只把合成后的能力边界说实。
  - B 给 `/tools workspace` 加 `--path <已登记工作区>` 形态（命令面扩形，规模等同一次小变更，超出本变更范围）。
  - C 在统一弹窗里恢复「残留区 + 高级添加行」（等于回退 D8，需要用户重新裁决）。
- **推荐**：**A**；若用户认为「其他工作区不可写」不可接受，B 是唯一不推翻 D7/D8 的补救，但必须另立变更（proposal/tasks/spec delta 全都要动）。
- **影响面**：A 只改文案与 README（W14 + `workspace.cliHint` 措辞）；B 改 `commands.ts` 的 `workspaceParse`/回执、`control.ts` 的 `updateWorkspaceDefaults` 寻址、`commands.test.ts` + `control.test.ts`；C 改 D8 本身（重开收敛）。

### PB2（B，影响发布与版本号）A+B 的版本号归属：维持 1.5.0 还是随下一批统一升到 1.6.0

- **问题**：A 的 D-12（decisions D5）裁定「维持 1.5.0，与 `7c38dbe` 同批发布」；unify 的收口任务 `10.1` 又用 `node scripts/release.mjs 1.6.0 --dry-run` 演练，并注明「本次不打 tag，版本与 tag 留待下一批变更统一发布」。A+B 很可能就是「下一批」，两处口径在发布动作上会撞车。
- **选项**：
  - **A（推荐）** 本变更的代码/工件**不动 `package.json`**（保持 D-12 的「不 bump」语义），把版本号决定留给 `scripts/release.mjs <version>` 的发布步骤；发布时若选 1.6.0，由 release 脚本统一升版（该脚本的职责正是「同步版本号」）。
  - B 现在就把 `plugins/session-tool-toggle/package.json`（以及同批四包的统一版本）升到 1.6.0。
  - C 先发 1.5.0（把当前目录内容当作 1.5.0）再发 1.6.0。
- **推荐**：**A**。理由：D-12 的实质是「不要在代码变更里单方面跳版本」，而 release 脚本本来就负责统一版本；B 会让「统一版本」的事实提前落在单个包上；C 会制造两个从未发布过的版本号并跨过 wire breaking（见 D-12 反例）。
- **影响面**：A 零代码改动（只在本蓝图与 proposal 注明）；B 触及五个插件的 `package.json` + 根 `package.json` + `dsh:check`；C 影响 tag 历史与发布说明。

### PB3（B，影响面板滚动与折叠体验）面板里两个默认档分区的折叠态是否跨开合记忆

- **问题**：D13 只裁「默认折叠」。当前实现把折叠态放组件本地状态（`DefaultsSectionFrame` 的 `useState(false)`），面板关闭再打开会复位为收起；用户若每次都要展开同一分区，会感到重复劳动。
- **选项**：
  - **A（推荐，本蓝图默认）** 不记忆：默认收起是 D13 的要求，打开面板的默认视图每次都一致；低频操作多点一次可接受。
  - B 把折叠态提到 `PanelController`（新增非业务状态 + 测试），跨开合记忆。
  - C 用 `localStorage` 记忆（浏览器半新增持久化面，与「面板不另建状态存储」的既有纪律冲突）。
- **推荐**：**A**（U7 已记录；若真机反馈「每次都要点」再单独立项 B）。
- **影响面**：A 零额外；B 改 `panel-controller.ts` 的状态形状 + `panel-controller.test.ts` + `tool-panel.test.tsx`；C 改客户端装配面并引入一个与 RPC 状态无关的持久化通道（最重）。

---

## 附 A：验证映射总表（每条对应一个可执行命令或一条可断言事实）

| 需求/验证点 | 验证载体 | 具体命令或断言 |
|---|---|---|
| A：清单宇宙 = scoped ∪ carried（面板） | `test/panel.test.ts` | `inputs({scoped:['mcp__b__y'],carried:[]})` → `groups.map(g=>g.key) === ['b']` |
| A：清单宇宙 = scoped ∪ carried（掩码） | `test/mask.test.ts` | `planMask({scoped:[],carried:[],disabled:['mcp:a']}).deny === []` 且 `.shadowServers === ['a']` 且 `.matched.get('mcp:a') === 0` |
| A：已关条目必须保留（carried 保底） | `test/panel.test.ts` + `test/control.test.ts` | `carried:['mcp__a__x']` 时组内条目存在且 `disabled:true`；`readPanel().appliedDeny` 与 `stats.denied` 一致 |
| A：关闭本会话无效工具 = 纯意图 | `test/control.test.ts` + `test/commands.test.ts` | `matched === 0`、`schemaChanged === false`、`state.disabled` 含该地址；`/tools status` 显示「0 个工具定义」+ 会话口径文案，面板 `intentOnly` 含该地址 |
| A：不再有「被隐藏」展示链 | `test/panel.test.ts` / `test/tool-panel.test.tsx` / `test/locale-parity.test.ts` | 顶层键无 `hiddenByOthers`；`queryByText(/被其它作用域隐藏/) === null`；`zh` 无四键 |
| A：`/tools status` 段 6 只剩保护名单 | `test/commands.test.ts` | `expect(text).not.toContain('被其他作用域隐藏')` 且 `expect(text).toContain('【保护名单】')` |
| A：层未就绪的诚实降级 | `test/commands.test.ts` | `withLayer:false` → `toContain('【可关对象】会话层未就绪：无法读取本会话的工具清单')` |
| A：描述改经会话层 | `test/rpc.test.ts` | `panel.groups[0].tools[0].description === '读取页面内容'`；`withLayer:false` → 无 description 且请求成功 |
| A：层读数降级不失败 | `test/session-layer.test.ts`、`test/rpc.test.ts` | `visibleSchemas` 抛错 → `[]` + 一条 warn；RPC 仍 `ok:true` |
| A：首轮读视图失败不掩码但 guard 在 | `test/session-layer.test.ts` | `restrictCalls.length === 0` 且 `guardCalls === 1` |
| A：wire strict 拒绝旧形状 | `test/wire-contract.test.ts` | `setAt(SNAPSHOT,'stats.catalog',9)` / `…'groups.0.tools.0.shadowed',false` / `…'hiddenByOthers',[])` 三条均 `ok:false` |
| A：双端形状不漂移 | `test/wire-contract.test.ts:1113-1143` | host `PanelSnapshot` 与 `contract.PanelSnapshot` 双向可赋值（编译期） |
| A：产物纯度与新鲜度 | `test/bundle.test.ts` + 命令 | `pnpm build` 后 `grep -c hiddenByOthers lib/index.js` → 0；`grep -c entry.shadowed lib/client.js` → 0 |
| A：文档与实现一致 | 命令 | `grep -c "被其他作用域隐藏" README.md` → 0；`grep -n "读数取全局层" README.md` → 空 |
| **B：宇宙只在会话形态出现** | `test/rpc.test.ts` | `workspace({sessionId:'s',action:'read'})` → `universe.layerReady===true`；`workspace({workspacePath:'/w2',action:'read'})` → `universe===null` |
| **B：宇宙 = 会话两读（不含被别的作用域掩掉的服务器）** | `test/rpc.test.ts` + `test/panel.test.ts` | A 后的 harness 只有 `scope`：`harness({ scope:['mcp__b__y'], disabled:['mcp:a'] })` → `universe.groups.map(g=>g.kind)` 只有 `['mcp']`/`g.key` 为 `b`（`a` 的名字不在 scope，不会被补出来）；`buildDefaultsUniverse({ schemas:[{name:'mcp__b__y'}], carried:[] })` 同理 |
| **B：宇宙分组顺序与技能行** | `test/panel.test.ts` + `test/rpc.test.ts` | `groups.map(g=>g.kind)` 为 `['mcp','skill','builtin']`（有技能工具时）；技能组 `address==='tool:skill'`，行地址 `skill:<name>`；`skills.available:false` → `skillsAvailable:false` 且组仍在 |
| **B：三计数（D11）** | `test/defaults-view.test.ts` + `test/workspace-editor.test.tsx` | `defaultsCountsOf(universe, ['mcp:a','skill:x'])` → `{listed:N, inDefaults:2, residual:0}`；渲染文本匹配 `/清单 \d+ · 默认关 \d+ · 残留 \d+/` |
| **B：残留区只可移除（D8）** | `test/workspace-editor.test.tsx` + `test/tool-panel.test.tsx` | 档内 `['mcp:zzz','mcp:a']` → 只渲染 `mcp:zzz` chip；点移除 → `('on',['mcp:zzz'])`；`queryByRole('button',{name:/加入工作区档/})===null`（键已删，用组件断言代替）；`zh['workspace.cliHint']` 文本在场 |
| **B：行/组开关的写地址** | `test/workspace-editor.test.tsx` | 行关闭 → `onUpdate('off',['mcp:a::x'])`；组关闭 → `('off',['mcp:a'])`；技能组 → `('off',['tool:skill'])`；开启 → `('on',[…])` |
| **B：锁态两态 + 整组默认关** | `test/workspace-editor.test.tsx` | `protected` 行 `disabled===true` 且 `title===zh['badge.protected']`；`reserved` 同理；`disabled:['mcp:a']` → 组内行 `disabled===true` 且含 `zh['defaults.groupOff']` |
| **B：两形态（dialog 保留下拉 / section 无下拉）** | `test/workspace-editor.test.tsx` | dialog：`fireEvent.change(select)` → `onSelect('/w2')`；section：`queryByRole('combobox')===null` |
| **B：切目标后清单仍可用（D-18 缓存）** | `test/workspace-editor.test.tsx` | 先 `{workspace:/w1, universe:非空}` 再 `{workspace:/w2, universe:null}` → `getByRole('switch',{name:/mcp:a/})` 仍存在 |
| **B：面板两分区默认折叠（D13）** | `test/tool-panel.test.tsx` | 打开面板后两分区标题存在、内部 `switch` 不在文档里（`aria-expanded==='false'`）；点击标题后出现；标题文本含 `默认关` |
| **B：用户级编辑器改分组开关（D10）** | `test/tool-panel.test.tsx` | 展开「用户级默认档」后点 `mcp__a__x` 行 → `client.updateDefaults('off',['mcp:a::x'])`；三计数行在场 |
| **B：无组件重复（D-20）** | 命令 | `grep -c "<ToolPanelGroups" plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx` → 0（只 import `groupTitle`/`defaultExpanded` 两个具名导出，不渲染该组件） |
| **B：wire strict（D-14 沿用）** | `test/wire-contract.test.ts` | `dropAt(WORKSPACE_VALUE,'universe')` / `setAt(…,'universe.groups.0.kind','x')` / `setAt(…,'universe.groups.0.tools.0.address','')` 三条均 `ok:false` |
| **B：降级不失败** | `test/rpc.test.ts` + `test/workspace-editor.test.tsx` | `withLayer:false` → 响应 `ok:true` 且 `universe.layerReady===false`；界面渲染 `defaults.universeUnavailable` + 残留区 |
| **B：产物与文档** | 命令 | `grep -c "defaults.cliHint" lib/client.js` ≥ 1；`grep -c "被其他作用域隐藏" README.md` → 0；README 含三条 B 已知限制 |
| 全量回归 | 命令 | `pnpm --filter dsh-plugin-session-tool-toggle verify:all`（lint + typecheck + build + **23 文件全绿**） |

## 附 B：被推翻/被取代的旧裁决对照（落阶段 2 的 `diff-matrix.md`）

| 旧裁决（`openspec/changes/archive/2026-11-02-session-tool-toggle/diff-matrix.md`） | 原文要点 | 本变更处置 |
|---|---|---|
| **R15①** | `catalog` 端口 = 全局层未掩码注册名，9.1 并入 `ControlDeps`（「推不出全局层」） | **推翻读数面定义**：端口整删（D-2）；「推不出全局层」不再成立为需求，因为工具箱只应有会话作用域一个来源 |
| **R18①** | `shadowed = catalog \ (scoped ∪ carried)`（修正 `catalog \ scoped`） | **整条废止**：`hiddenByOthers` 字段不再存在（其值在新候选集下恒空）、`shadowed` 展示链删除（D-3） |
| **R20①** | `catalog`/`descriptions` 保持全局层口径，「v2 再改 per-agent 读数」 | **本变更即该 v2**：`catalog` 删除、`descriptions` 改经层（D-2 / D-4） |
| R17②（strict parser = 版本漂移报警） | 契约 strict 不宽容 | **保留并沿用**（D-14；B 的 `WorkspaceValue.universe` 必填是同一纪律的延伸） |

| 被取代的 unify 结论（`openspec/changes/unify-workspace-config-entry/`，其归档先于本变更） | 原文要点 | 本变更处置 |
|---|---|---|
| unify D8「分节切换卸载上一节 → 草稿丢弃为接受项」 | 统一弹窗一次只渲染选中节，stt 编辑器的未保存草稿随之丢弃 | **该接受项在本变更后失效**：B 移除自由文本输入（D8），默认档编辑器不再有草稿态；本节切换只剩「重新挂载 → 重新 read」，不丢用户输入 |
| unify 的分节迁移裁定「只剥壳、不动编辑器字段面」+ DQ2=A「不标注来源、只给并集说明」 | `WorkspaceDefaultsEditor` 仍是 chips + 自由文本；DQ2=A 只裁「界面不标注每一项来自用户档还是工作区档，只给一句并集说明」 | **编辑器字段面部分被本变更取代**：用户裁定完全移除自由文本（decisions D8），改为分组开关（D-20/D-22）；DQ2=A 的「不标注来源 + 并集说明」**保留**（`workspace.union` / `defaults.scope`） |
| unify D-13/Q2=a「分节保留工作区下拉」 | dialog 形态保留下拉，section 形态无下拉 | **保留**（B 的两形态沿用，③ 3.19） |
| unify「迁移只剥壳不动状态机」 | `useWorkspaceDefaults` 原样保留 | **保留**（B 的 W9 只在组件层加宇宙缓存，状态机一行不改） |

---

*本文件为阶段 1.7 代码级蓝图（v2 合并版）；执行期由 spec-apply 维护各组「终形态」小节与 diff-matrix 的 R 条目，蓝图与实测不符处以终形态/R 条目为准。*
