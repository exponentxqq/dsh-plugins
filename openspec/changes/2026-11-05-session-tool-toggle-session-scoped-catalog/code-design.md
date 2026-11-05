# 代码级蓝图（阶段 1.7）— 会话工具面改会话作用域口径（scoped ∪ carried）

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由 `explore.md` 与 `decisions.md` 收敛，**本文不复读**；本文只把已定结论翻译成可施工的代码形状。
> 输入已逐字读全：`explore.md`（170 行）、`decisions.md`（42 行，D1–D6 权威，本蓝图不推翻）。
> 事实基线（2026-11-05 只读核实）：仓 `dsh-plugins` @ `d5ddd7f`；目标子包 `plugins/session-tool-toggle` 版本 `1.5.0`（`7c38dbe` 内容、未发布未推送）；工作区对插件目录干净（`git status --short plugins/session-tool-toggle` 空输出）。
> 测试基线实测：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run` → **22 文件 / 989 用例全绿**。
> 行号口径：以当前工作区 HEAD 为准（同一文件改动后行号会漂移，落档时以「函数名 + 关键片段」定位）。
> writer 豁免留痕见 ④ **D-0**。

---

## ① 触达面清单

**仓归属**：源码与测试全部落在 **子包 `dsh-plugin-session-tool-toggle`**（仓内路径 `plugins/session-tool-toggle/`，下文表格路径均相对该目录）；规范落档工件落在 **根仓 `dsh-plugins`** 的 `openspec/changes/`。上游 `@deepseek-ai/dsh*`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/`）只读、零修改（ADR-0002）。

### 1.1 宿主半（`src/host/`，子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| H1 | `src/host/types.ts` | 端口瘦身 + 新增会话读数面 | 删 `ControlDeps.catalog`（L409–418 整段 JSDoc + 字段）、删 `PanelInputs.catalog`（L470）；新增 `VisibleToolSchema`（name + description 轻量投影）；`ScopedSurface` 加 `visibleSchemas()`（L128–156）；`LayerHandle` 加 `visibleSchemas()`（L338–361）；`PanelInputs` 类文档「三读并集」改「两读」 |
| H2 | `src/host/mask.ts` | 掩码候选改两读 | 删 `MaskInputs.catalog`（L57–66）；`unionNames` 由三读变两读（L169–171）；`planMask` 文档的「三读」段改「scoped ∪ carried」并写清代价（关会话外工具 = matched 0 / deny 空 / 意图保留）；`shadowServers` 语义**不变**（仍只由 `mcp-group` 地址产生，与命中无关） |
| H3 | `src/host/session-layer.ts` | 删层内全局层端口 + 加 `visibleSchemas` | 删 `SessionLayerPorts.catalog`（L128–140）、字段（L281–282）、构造赋值（L380）、`plan()` 里的 catalog 读取分支（L1052–1059）；`plan()` 只剩 `surface.visibleNames()` 一次读数；新增 `visibleSchemas()` 读数（与 `visibleNames()` 同纪律：未挂载/退场/读失败 → 空数组 + `absorbFailure`）；`surfaceOf` 的 `visibleSchemas` 投影（L254–262）；`AgentServiceScope.tools.schemas` 返回类型补 `description?: string` |
| H4 | `src/host/control.ts` | 内核两读 + 读数瘦身 | 删 `catalogOf()`（L819–826）与 `toggleSession` 的 `catalog` 取数（L338）、`planMask` 入参去掉 catalog（L345–350）；`readPanel` 去掉 catalog 取数（L509）、`candidates = unionNames(scoped, carried)`（L538）、删 `hiddenByOthers` 计算与返回（L543–553、L570）；`PanelReading` 删 `catalog`（L219–220 中的 catalog）与 `hiddenByOthers`（L235–241）；`unionNames` 改两参（L1058–1071） |
| H5 | `src/host/panel.ts` | 面板构建器两读 + 删整条「被隐藏」链 | `buildPanelSnapshot` 删 `catalogNames` 与 `hiddenByOthers`（L283–304、L355）；`planMask` 入参两读（L288–293）；`EntryContext` 删 `hidden`（L475–484、L331）；`ToolEntry` 删 `shadowed`（L130–136）与 `toolEntryOf` 的赋值（L596）；`Stats` 改 `{visible, denied}`（L217–227、L357–362）；`PanelSnapshot` 删 `hiddenByOthers`（L252–253）；模块头推导链与 R18 段改会话口径 + 写清「与 /inventory 两处刻意差异」 |
| H6 | `src/host/rpc.ts` | 描述改经层读数 | 删 `RpcDeps.descriptions`（L171–183 的 L174–180 字段）；`snapshotOf` 的 `descriptionsOf(deps)` 改 `descriptionsOf(deps, session)`（L799）、`PanelInputs` 组装删 `catalog: reading.catalog`（L808）、`descriptions` 恒传（不再条件展开，L822）；`descriptionsOf` 改经 `deps.layerFor(session.id)?.visibleSchemas()` 取，层缺席 / 读失败 → 空 `Map` + 一次 warn（L1002–1011） |
| H7 | `src/host/index.ts` | 装配层瘦身 | 删模块级 `catalog` 闭包（L267–273）与 `controlDeps.catalog`（L763–764）；`mount()` 里 `new SessionLayer({ log, catalog })` 改 `{ log }`（L642）；`rpcDeps` 删 `descriptions`（L806–813）；`inject` 名单**保留** `['agents','tools']`（L133，理由与反例见 ④ D-6）；模块头「全局层 catalog + 描述读数」两段改写（L55–61） |
| H8 | `src/host/commands.ts` | 命令面文案与降级 | 删 `hiddenText()`（L906–917）与 `statusText` 里那一行（L690）；段 6 只剩保护名单（注释 L688 改）；`switchableText` 加「会话层未就绪」显式降级分支（L890–904）；`closedStateText` 的 matched=0 文案改会话口径（L781–783）；段 1 注释里「全局层有、本会话关 vs 从未注册」改「本会话命中 vs 本会话暂无匹配」（L653–655） |

### 1.2 契约与浏览器半（子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| C1 | `src/contract.ts` | wire 契约删字段（strict 同步收紧） | `ToolEntry` 删 `shadowed`（L259–260）；`StatsView` 改 `{visible, denied}`（L311–321）；`PanelSnapshot` 删 `hiddenByOthers`（L375–376）；`TOOL_ENTRY_KEYS` 去 `'shadowed'`（L985–994）、`STATS_VIEW_KEYS` → `['visible','denied']`（L1006）、`PANEL_SNAPSHOT_KEYS` 去 `'hiddenByOthers'`（L1018–1031）；`readToolEntry`（L1069–1082）、`readStatsView`（L1201–1222）、`readPanelSnapshot`（L1348–1369）同步删读取与返回键 |
| C2 | `src/client/locales.ts` | 删六键（zh/en 各三） | 删 `entry.shadowed`（L83 / L238）、`badge.shadowed`（L89 / L244）、`state.catalog`（L152 / L306）、`state.shadowed`（L154 / L308）；`state.visible` / `state.denied` 文案不动（现文案「本会话可见 {visible}」「已关 {denied}」已符合新叙事） |
| C3 | `src/client/ToolPanelGroups.tsx` | 三态锁改两态 | `lockOf` 删 `tool.shadowed` 分支（L111）；`LockNotice` 注释里的 `entry.shadowed`（L93）与「三态禁用」段（L23、L100–103）改两态（protected → reserved） |
| C4 | `src/client/ToolPanelAction.tsx` | 状态摘要两计数 | 删 `state.catalog` / `state.shadowed` 两个 `<li>`（L203、L205）；`StateSection` 的「四计数」注释改「两计数」（L192）；`kvDelta` 仍取 `stats.denied` 正增量（L359，零改动） |
| C5 | `src/client/panel.module.css` | 注释同步 | L264 注释里的 `entry.shadowed` 删除（纯注释，无选择器变化） |

### 1.3 构建产物与文档（子包 session-tool-toggle）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| B1 | `lib/index.js`、`lib/client.js` | 重建产物（**随仓库提交**，`git ls-files` 已跟踪） | `pnpm --filter dsh-plugin-session-tool-toggle build` 重生成；两者均含 `hiddenByOthers` / `stats.catalog` / `entry.shadowed` 字面量（实测 `shadowed` 计数 index 52 / client 23，其中技能分面部分保留），重建后需按 §附 A 的 grep 断言验收 |
| B2 | `README.md`（插件根） | 能力口径与「已知限制」改写 | L77「受保护 / 保留名 / 被其他作用域隐藏的行禁用」→「受保护 / 保留名的行禁用（其余行都可切换）」；L120「读数取全局层（仅工具）」整条重写为「读数取本会话作用域」+ 与 `/inventory` 的两处刻意差异 + 已关条目无 `title` 描述的代价；L24 `/tools` 行的「可关对象分组计数」补「本会话」限定 |

### 1.4 测试（`test/`，子包 session-tool-toggle；编号 `TS*` = 测试套件，与阶段 2 `tasks.md` 的 `T1–T6` 不同域；括号内是当前基线的用例数）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| TS1 | `test/mask.test.ts`（41） | 两读 | `inputs()` 删 `catalog` 默认值（L27 附近）；「catalog 单独就能让名字进入 deny」改为其**反面**；「同一个名字在三个读面重复」「服务器断线（三读都不含）」「不改动入参（三份读数）」等措辞与入参机械改两读 |
| TS2 | `test/panel.test.ts`（45） | 删「被隐藏」断言 + 新增三条会话口径断言 | `inputs()` 删 `catalog`（L63）；删 3 条（L318 hiddenByOther、L337/L357 两条 R18）；改写 L209（三读并集→两读 + carried 保底）、L376 stats、L403 去重、L838 形状测试（顶层键 / stats 键 / 工具条目键）；新增见 ⑤ G4 |
| TS3 | `test/control.test.ts`（47） | 两读 + 删 catalog 降级 | harness：删 `catalog` 选项与 `catalogError` 注入（L334、L354、L396–397、L411、L440–442），`scope` 变唯一读数来源；`FakeLayer` 的 `reconcile()` 改两读（L272）；删「全局层读数抛错」一条（L733）；删两条 R18 断言里的 `hiddenByOthers`（L829、L846、L854）；L803/L849 改写；新增「关闭本会话无效组」一条 |
| TS4 | `test/session-layer.test.ts`（39） | 删层 catalog 端口 | 删 9 处 `new SessionLayer({ …, catalog: () => … })` 的 catalog 项（L233、L246、L399、L427、L444、L513、L588、L683、L691）；删「catalog 读抛 inactive context」（L583–602）；L604「读视图失败」期望**翻转**（无 catalog 兜底 → 首轮不掩码，见 ③ 3.4）；新增 `visibleSchemas` 投影与降级两条 |
| TS5 | `test/rpc.test.ts`（48） | 描述改经层 | harness 删 `catalog`、`descriptions`、`descriptionsError`（L431、L499–500、L510、L537、L557、L571–578）；`FakeLayer` 加 `visibleSchemas()` 与可注入抛错；L826 stats 断言改 `{visible:1,denied:2}`；L870 描述测试改「描述来自本会话层」；新增「层未就绪 → 空描述 Map、面板成功」 |
| TS6 | `test/commands.test.ts`（71） | status 文案与计数 | harness：`catalog` → `scope`（L353–356、L406、L421、L459）；删「被其他作用域隐藏」三段断言（L725、L733、L748）；L698 两态测试文案改会话口径；L714 改写为「可关对象只由 scoped ∪ carried 推出」；L742 层未就绪断言改为新的降级行；新增「关闭会话外工具 → 0 个工具定义 / 已记录（会话口径）」 |
| TS7 | `test/wire-contract.test.ts`（263） | 夹具与 strict 边界 | `SNAPSHOT` 去掉 `hiddenByOthers`、`stats.catalog`、`stats.shadowed`、各 `tool.shadowed`（L97/107/126/145/158/160/782）；键集合断言（L754）去 `hiddenByOthers`；`dropAt`/`setAt` 用例改（L850、L852 附近）；新增「旧形状出现即拒绝」三条（`stats.catalog` / `tool.shadowed` / `hiddenByOthers`）；交叉可赋值段（L1113–1143）保持 |
| TS8 | `test/tool-panel.test.tsx`（30） | 面板 UI 两计数 / 两态锁 | 夹具去 `shadowed` / `hiddenByOthers` / `stats.catalog|shadowed`（L100、L141、L183–185、L561–562、L598）；删「被其它作用域隐藏的行 disabled」一条（L461–472）；新增「状态摘要只渲染两计数」 |
| TS9 | `test/panel-client.test.ts`（42）、`test/panel-controller.test.ts`（42） | 夹具瘦身 | 两文件的 `snapshot()` 夹具：删 `hiddenByOthers`、`stats.catalog`、`stats.shadowed`（L55–57、L74；L68–70、L452、L938） |
| TS10 | `test/locale-parity.test.ts`（10） | 必读键表 | `REQUIRED_KEYS` 删 `entry.shadowed`（L97）、`state.catalog`（L148）、`state.shadowed`（L150）；其余断言（zh/en 双向相等、无重复键）自动覆盖删除 |
| TS11 | `test/skill-panel.test.tsx`（10）、其余技能面套件（`test/skills-plan.test.ts` 29） | **不改行为** | `SkillView.shadowed` 与技能行两态全部保留；`test/bundle.test.ts`（5）字面量表（L57–68）与本变更无交集，零改动 |

### 1.5 规范落档（根仓 dsh-plugins，**阶段 2 起草，本阶段不写 `openspec/`**）

| # | 路径 | 改动意图 | 关键改动点 |
|---|---|---|---|
| S1 | `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/specs/dsh-session-tool-toggle/spec.md`（**新建**） | 落 D4 | `## MODIFIED Requirements` → `### Requirement: Web 配置界面` 全文（含既有场景）+ 新场景「面板清单 SHALL 只含本会话有效工具（scoped ∪ carried）」（建议正文见 ③ 3.13） |
| S2 | 同上变更目录的 `diff-matrix.md`（**新建**） | 推翻留痕 | 逐条记录推翻 `2026-11-02-session-tool-toggle` 的 **R15①**（catalog 全局层端口）、**R18①**（`shadowed = catalog \ (scoped ∪ carried)`）、**R20①**（catalog/descriptions 保持全局层、v2 再改——本变更即该 v2）；对照表见 §附 B |
| S3 | 同上变更目录的 `proposal.md` / `tasks.md`（**新建**） | 预期管理与排期 | `tasks.md` 的 T1–T6 与本蓝图 G1–G6 **一一对应**（组名、文件、出口命令逐条照搬）；`proposal.md` 写清与 `/inventory` 的两处刻意差异（已关条目面板留、面板还管 `tool:`/`skill:`） |

### 1.6 明确不改（核实后判定，避免误伤）

| 文件/位置 | 判定依据 |
|---|---|
| `plugins/project-mcp/**` | 本次的**动因提供方**而非修改对象；它的三读并集（`plugins/project-mcp/src/host/isolation.ts`、README.md:59）服务的是「工作区隔离掩码」，与本插件的「用户开关掩码」是两个不同问题 |
| `plugins/user-commands/src/host/{index,inventory}.ts`（`/inventory`） | 参考实现，只读；本变更让面板向它靠齐，不改它 |
| `src/host/{address,state,defaults,workspaces,attribution,record-store,host-runtime,skills-plan}.ts` | 与「工具清单宇宙」无关：地址文法、整值状态、两份默认档、归属、记录通道、技能遮蔽计划都不读 catalog |
| `src/host/skills-plan.ts`、`src/client/SkillPanel.tsx`、`src/contract.ts` 的 `SkillView` | 技能分面本就会话作用域；`SkillView.shadowed`（影子 stub 生效标记）**同名不同义，保留** |
| `ControlDeps` 的其余字段、`Config` 五个键、`cordis.patch.yml`、`package.json` 版本 | 配置面零变化；版本维持 `1.5.0`（D5，与 `7c38dbe` 同批发布） |
| 根 `README.md`、根 `AGENTS.md` | grep 无「被其他作用域/全局层」相关表述（`AGENTS.md` 对 session-tool-toggle 的描述是功能级一句话），不改 |
| `.gitignore`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js` | 并行会话/他人产物，已在 `67c9411`/`d5ddd7f` 提交，本次不触碰、不提交 |

---

## ② 证据锚

> 每条都是当前工作区 HEAD 的**代码事实**（file:line + 片段），不是转述。行号漂移时按片段检索。

### 2.1 宿主 / 契约 / 客户端证据锚

| 模块 | 证据（file:line） | 代码事实 |
|---|---|---|
| 全局层读数（根 ctx 闭包） | `src/host/index.ts:273` | `const catalog = (): readonly string[] => ctx.tools.schemas().map((schema) => schema.name)`——无 scope 参数 = 全局层，**会话无关** |
| 全局层读数接入内核 | `src/host/index.ts:764` | `catalog,`（`controlDeps` 字面量最后一项，注释在 L763「R15（任务 9.1）」） |
| 全局层读数接入层 | `src/host/index.ts:642` | `const layer = new SessionLayer({ log, catalog })`——`mount(agent)` 内，agent 已在手却仍注入全局闭包 |
| 描述装配时机 | `src/host/index.ts:812` | `descriptions: () => new Map(ctx.tools.schemas().map((schema) => [schema.name, schema.description ?? '']))`——`apply()` 期一次装配，读的是**根 ctx** |
| 宿主 schema 带 description | `src/host/index.ts:812`（同上） | `schema.description ?? ''` 证明 `tools.schemas()` 的元素含 `description`（H3 的投影字段有真实来源） |
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
| 内核 hiddenByOthers | `src/host/control.ts:543-553` | 层未就绪 → `[]`；否则 `catalog.filter(name => !scopedSet.has(name) && !carriedSet.has(name))` |
| toggle 的 matched 口径 | `src/host/control.ts:338` + `L345-350` | `const catalog = catalogOf(deps)` 后原样传给 `planMask({ catalog, scoped: before.visible, carried: before.deny, … })` |
| PanelReading 字段 | `src/host/control.ts:220` + `L241` | `readonly catalog: readonly string[]`、`readonly hiddenByOthers: readonly string[]` |
| 面板入参三读 | `src/host/types.ts:470-474` | `catalog` / `scoped` / `carried` 三字段及其 JSDoc |
| ControlDeps.catalog | `src/host/types.ts:409-418` | JSDoc 明写「宿主**全局层**的工具注册名（未掩码，不受任何 agent 限制）」+「两态区分…必须读未掩码的全局层（R15 ①）」 |
| ScopedSurface 现有读数 | `src/host/types.ts:153` | `visibleNames(): readonly string[]`（本变更在同一接口旁加 `visibleSchemas()`） |
| 掩码候选三读 | `src/host/mask.ts:169-171` | `Array.from(new Set([...inputs.catalog, ...inputs.scoped, ...inputs.carried]))` |
| 掩码地址解析 | `src/host/mask.ts:102-125` | `planMask` 的推导顺序（candidates → 逐地址 matched → hitNames → deny/shadowServers） |
| 契约 ToolEntry.shadowed | `src/contract.ts:259-260` | `/** 全局层有、本会话看不见（被别的作用域隐藏）。 */ readonly shadowed: boolean` |
| 契约 StatsView 四计数 | `src/contract.ts:311-321` | `visible / catalog / denied / shadowed` 四字段 + `catalog` 的 JSDoc「全局层（不受任何 agent 限制）名字数」 |
| 契约 PanelSnapshot.hiddenByOthers | `src/contract.ts:375-376` | `/** 全局层有、本会话看不到的名字（两态区分的第二态）。 */ readonly hiddenByOthers: readonly string[]` |
| 契约 strict 键表 | `src/contract.ts:985-994`、`1006`、`1018-1031` | `TOOL_ENTRY_KEYS` 含 `'shadowed'`；`STATS_VIEW_KEYS = ['visible','catalog','denied','shadowed']`；`PANEL_SNAPSHOT_KEYS` 含 `'hiddenByOthers'` |
| 契约 parser | `src/contract.ts:1069-1082`、`1207-1219`、`1348-1369` | 逐字段 `readBooleanField(record,'shadowed')` / `readCountField(record,'catalog'|'shadowed')` / `readStringArrayField(record,'hiddenByOthers')` |
| RPC descriptions 依赖 | `src/host/rpc.ts:174-180` | `readonly descriptions?: () => ReadonlyMap<string, string>` + 「9.5 的装配层用 `ctx.tools.schemas()` 一次填好」 |
| RPC 组装入参 | `src/host/rpc.ts:808` | `catalog: reading.catalog,`（`PanelInputs` 字面量） |
| RPC 描述读数 | `src/host/rpc.ts:1002-1011` | `descriptionsOf(deps)`：`deps.descriptions === undefined` → undefined；抛错 → warn + undefined |
| 命令面隐藏计数行 | `src/host/commands.ts:914-917` | `return \`被其他作用域隐藏 ${reading.hiddenByOthers.length} 个工具定义（全局层有、本会话不可见）\`` |
| 命令面两态文案 | `src/host/commands.ts:781-783` | `entry.matched > 0 ? '已关闭…' : '已记录：当前无注册工具匹配；服务器上线后自动生效'` |
| 命令面可关对象段 | `src/host/commands.ts:890-904` | serverGroups / builtinNames 计数来自 `reading.serverGroups` / `reading.builtinNames` |
| 浏览器四计数渲染 | `src/client/ToolPanelAction.tsx:201-206` | 四个 `<li>`：`state.visible` / `state.catalog` / `state.denied` / `state.shadowed` |
| 六条文案 | `src/client/locales.ts:83,89,152,154,238,244,306,308` | `entry.shadowed` / `badge.shadowed` / `state.catalog` / `state.shadowed`（zh L83/89/152/154，en L238/244/306/308） |
| 组件文档串 | `src/client/ToolPanelGroups.tsx:23` + `panel.module.css:264` | 两处注释仍写 `entry.shadowed` / 三态禁用 |
| 插件文档旧口径 | `README.md:77` + `README.md:120` | L77「受保护 / 保留名 / 被其他作用域隐藏的行**禁用**」；L120「**读数取全局层（仅工具）**：面板的工具 `catalog` 与工具描述来自插件自身 ctx 的 `ctx.tools.schemas()`（全局层）」 |
| 产物已跟踪 | `git ls-files plugins/session-tool-toggle/lib` | `lib/client.js`、`lib/index.js` 均被跟踪（`shadowed` 字面量计数 52 / 23，其中技能分面部分保留） |

### 2.2 测试与落档证据锚

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


---

## ③ 接口与数据形状

### 3.1 推导链总览（before → after）

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

### 3.2 `src/host/types.ts`（端口与形状）

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

**删除清单（类型层强制，编译器就是验收器）**：`ControlDeps.catalog`、`PanelInputs.catalog`、`MaskInputs.catalog`、`SessionLayerPorts.catalog`、`RpcDeps.descriptions`、`PanelReading.catalog`、`PanelReading.hiddenByOthers`、`ToolEntry.shadowed`、`Stats.catalog`、`Stats.shadowed`、`PanelSnapshot.hiddenByOthers`。
**同名保留**：`ClosedAddressReading.shadowed`（mcp 整组「指令段已遮蔽」）、`SkillView.shadowed` / `SkillLayerSnapshot.shadowed`（技能影子 stub 生效）。

### 3.3 `src/host/mask.ts`

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

### 3.4 `src/host/session-layer.ts`

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

### 3.5 `src/host/control.ts`

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

### 3.6 `src/host/panel.ts`

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

### 3.7 `src/host/rpc.ts`

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

### 3.8 `src/host/index.ts`

```ts
// ❌ 删除整个 catalog 闭包（原 L267-273）
const layer = new SessionLayer({ log })                 // mount()：不再注入 catalog
const controlDeps: ControlDeps = { /* …删 catalog, */ }
const rpcDeps: RpcDeps = { ...controlDeps, agents: agentsPort }  // 不再有 descriptions
export const inject: readonly string[] = ['agents', 'tools']      // 保留（D-6）
```

### 3.9 `src/host/commands.ts`（文案形状，逐字）

| 位置 | 现状 | 新形态 |
|---|---|---|
| 段 6（L688–690） | `【保护名单】N 项：…` + `  · 被其他作用域隐藏 N 个工具定义（全局层有、本会话不可见）` | **只剩** `【保护名单】N 项：…`（`hiddenText` 整函数删除） |
| `switchableText`（L890–904） | 恒报 `MCP 服务器 N 台（…）；内置工具 N 个；单工具关闭 N 项` | 首行加降级分支：`if (!reading.layerReady) return '【可关对象】会话层未就绪：无法读取本会话的工具清单（本会话开关与默认档不受影响）'`；其余逐字不变 |
| `closedStateText` matched=0（L783） | `'已记录：当前无注册工具匹配；服务器上线后自动生效'` | `'已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效'` |
| `closedStateText` `skill` 分支（L769–779） | 三态 | **不变**（技能分面口径未变） |
| 段 1 注释（L653–655） | 「全局层有、本会话关」vs「从未注册」 | 「本会话命中」vs「本会话暂无匹配」 |

### 3.10 `src/contract.ts`（wire 形状）

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

### 3.11 浏览器半

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

// locales.ts —— 删除的六个键（zh / en 各三）
// entry.shadowed / badge.shadowed / state.catalog / state.shadowed
```

`mutation.kv`（`stats.denied` 正增量）与关闭集 chip 全部不变。

### 3.12 配置键与文件位置

**零变化**：`Config` 五键（`storage` / `protectedTools` / `defaultsFile` / `workspacesFile` / `hostModuleBase`）、`cordis.patch.yml`、两份档文件形状与权限位、会话记录类型与投影 `stateVersion` 全部不动；`package.json` 版本维持 `1.5.0`。

### 3.13 D4 的 spec delta 建议正文（阶段 2 落 `openspec/changes/…/specs/dsh-session-tool-toggle/spec.md`）

```markdown
## MODIFIED Requirements

### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：…（既有正文逐字保留）…

#### Scenario: 面板清单只含本会话有效工具（scoped ∪ carried）

- **WHEN** 另一机制（如 project-mcp 的工作区隔离）在宿主全局层注册了本会话不可见的 MCP 服务器，用户打开本插件的面板或执行 `/tools status`
- **THEN** 这些服务器 SHALL NOT 出现在面板的工具分组与 `/tools status` 的可关对象计数里；清单宇宙 = 本会话可见工具（`tools.schemas(agent)`）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在面板里，否则关闭即消失、无法再打开）；宿主 SHALL NOT 返回「被其他作用域隐藏」的计数或徽标字段
```

---

## ④ 决策记录

> 格式：**决策** → 被否方案与理由 → **反例**（一个能让被否方案当场破功的具体场景）。

### D-0 栈识别与 writer 豁免留痕（事实留档）

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

### D-3 `hiddenByOthers` 整条删除，而非「保留恒空数组」（承接 decisions D3 的删除裁定）

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
- **反例**：若草率把第三项定为 `catalog`（保留名字、改值）→ `stats.catalog` 与 `stats.visible` 在 carried 为空时相等，面板出现两行同样的数字，用户会认为「面板统计坏了」。→ 见 **待决 P1**。

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
- **被否：bump `1.6.0`**。理由：上一变更未发布未推送，`v1.5.0` 在远端还不存在；两批改动共用同一次发布，bump 只会让一个从未发布过的版本号先跳一格，tag 历史与发布说明出现空档。
- **反例**：若先发 1.5.0 再发 1.6.0，中间那版包含本次的 wire breaking（`ToolEntry.shadowed` 删除）——已装 1.5.0 的用户在升级到 1.6.0 时会跨过两个不兼容形状，排障时无法用「上一个版本」对照。

### D-13 旧裁决推翻留痕（R15①/R18①/R20①），落 diff-matrix 而非代码注释

- **决策**：新变更的 `diff-matrix.md` 起一条 R 记录逐条声明推翻；代码注释只写新口径，不写「曾按全局层」的考古。
- **被否：在 `mask.ts` / `types.ts` 注释里保留「R15 ① 全局层」历史说明**。理由：代码注释服务当前读者，历史裁定由 `openspec` 的 diff-matrix 承担（它本来就是这个仓的裁定账本）；两处都写必然漂移。
- **反例**：保留旧注释的后果在本次已可观察——`ControlDeps.catalog` 的 JSDoc（`types.ts:409-418`）用 4 行论证「必须读未掩码的全局层（R15 ①）」，任何人读到它都会认为删字段是错的。

### D-14 wire 契约 breaking 不设兼容窗口

- **决策**：`contract.ts` 的 strict parser 直接拒绝旧形状（含 `shadowed` / `catalog` / `hiddenByOthers`），不写「忽略未知字段」的宽容分支。
- **理由**：双端同仓同 bundle 发布（`lib/index.js` 与 `lib/client.js` 由同一次 build 产出），不存在旧 client + 新 host 的独立部署组合；strict 的拒绝正是版本漂移报警器（R17② 的既有设计）。
- **被否：宽容忽略未知键**。理由：会让「面板少一行统计」这种静默降级在升级不彻底（浏览器缓存了旧 client bundle）时毫无提示。
- **反例**：若宽容，浏览器旧 bundle + 新 host 会拿到没有 `stats.catalog` 的快照 → 旧组件 `t('state.catalog', {catalog: undefined})` 渲染出「全局 undefined」，而没有任何错误可查。

### D-15 `mcp:<server>` 整组关闭仍产生空遮蔽段（即使 0 命中）

- **决策**：`shadowServers` 的推导**不动**（只由 `mcp-group` 地址产生，与 `matched` 无关）。
- **理由**：空段在 system-prompt 渲染期本来就会被丢弃（`mask.ts:214-217` 的既有注释），且它表达的是「意图」——服务器一旦在本会话出现，段必须已经被遮蔽，否则会出现「工具被摘掉但 MCP 指令段还在」的窗口（该段包含服务器级说明与工具清单）。
- **被否：`matched === 0` 时不产生遮蔽段**。理由：服务器可能在被别的机制掩掉期间其指令段仍在渲染（隔离粒度不同），意图则应在恢复的同一轮同时生效。
- **反例**：project-mcp 只摘工具不摘段（或反之）时，「0 命中不遮蔽」会让恢复瞬间出现一次「工具已关但指令段仍描述它」的不一致步骤。

---

## ⑤ 逐任务组实现要点

> **组间串行、组内可并行**（单组并行度 ≤ 4）。每组出口都是**可执行命令 + 具体断言**，不写「已实现/工作正常」。
> 阶段 2 的 `tasks.md` 按本 G1–G6 落 **T1–T6 一一对应**（组名、文件、出口命令逐条照搬）。
> 注意：`vitest` 走 esbuild 转译**不做类型检查**，因此类型面在中途为红是正常的；`pnpm typecheck` 只在 G6 作为门禁。

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
  - **两读收敛**：`SessionLayer` 只凭 `surface.visibleNames()` 推导（`expect('catalog' in ports).toBe(false)` 不必写；用类型删除 + 上两条 grep 守住）
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
  - 「整组被其他作用域隐藏的服务器不出现在分组」：`inputs({ scoped: ['mcp__b__y'], carried: [] })` → `expect(snapshot.groups.map(g => g.key)).toEqual(['b'])`（`mcp__a__x` 根本不在候选里）
  - 「carried 保底」：`inputs({ scoped: [], carried: ['mcp__a__x'], state: stateWith(['mcp:a']) })` → 组 `a` 存在、该条目 `disabled:true`、`expect(snapshot.stats).toEqual({ visible: 0, denied: 1 })`
  - 「关闭会话外工具 = 无条目 + intentOnly」：`inputs({ scoped: ['bash'], state: stateWith(['mcp:dbx']) })` → `expect(snapshot.groups.map(g => g.key)).toEqual(['builtin'])`、`expect(snapshot.intentOnly).toEqual(['mcp:dbx'])`
  - 「形状」：顶层键不含 `hiddenByOthers`；`expect(Object.keys(snapshot.stats).sort()).toEqual(['denied','visible'])`；工具条目键不含 `shadowed`
  - 命令面：`expect(text).toContain('MCP 服务器 2 台（mcp:a 1、mcp:b 1）')` 且 `expect(text).not.toContain('被其他作用域隐藏')`
  - `expect(lineWith(text,'mcp:zzz 0 个工具定义')).toContain('已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效')`
  - 层未就绪：`expect(text).toContain('【可关对象】会话层未就绪：无法读取本会话的工具清单')`
- **禁止**：改 `intentOnly` 的三分逻辑（工具 0 命中 ∪ 技能无安装）——它一字不动。

### G5 — 浏览器半（对应 T5）

- **文件**：`src/client/locales.ts`、`src/client/ToolPanelGroups.tsx`、`src/client/ToolPanelAction.tsx`、`src/client/panel.module.css`（+ 四个客户端测试文件）。
- **要点**：删六键；`lockOf` 两态；状态摘要两计数；注释同步。
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

### G6 — 文档、产物与全量回归（对应 T6）

- **文件**：`README.md`（插件）、`lib/index.js`、`lib/client.js`；落档工件 S1–S3（同组但独立提交）。
- **要点**：
  1. README 两处改写（① B2，文案口径见 ③ 3.9 / ③ 3.11），并核对「六段面板」描述里不再出现「被隐藏」；
  2. `pnpm build` 重建双产物，确认 `git status` 只含预期文件（不得带上 `.gitignore`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js`）；
  3. 起草 `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/` 的 `proposal.md` / `tasks.md` / `specs/…` delta / `diff-matrix.md`（R15①/R18①/R20① 推翻留痕）。
- **出口**：
  ```bash
  pnpm --filter dsh-plugin-session-tool-toggle verify:all     # lint + typecheck + build + 全量 test
  grep -c "hiddenByOthers" plugins/session-tool-toggle/lib/index.js     # 期望 0
  grep -c "entry.shadowed" plugins/session-tool-toggle/lib/client.js    # 期望 0
  grep -c "被其他作用域隐藏" plugins/session-tool-toggle/README.md      # 期望 0
  git status --short plugins/session-tool-toggle                        # 期望：仅 README/lib/src/test 的预期条目
  ```
  门禁口径：
  - 22 个测试文件全绿、零 `skip`；用例总数**不作硬门禁**——删/改/增的逐条清单见 ① 1.4 的 `TS*` 表与 ⑤ 各组「必含断言」，净变化预计为个位数，以「新增断言逐条落地」为准（不写死数字，避免用总数掩盖漏改）；
  - `typecheck` 零错误（这是 G1–G5 类型面收敛的唯一终局判据）；
  - `lint` 零告警（oxlint 会抓出删除后残留的未用 import / 变量）。
- **禁止**：`git add -A`（并行会话残留文件在库外，必须逐路径 add）。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（被证伪须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | `tools.schemas()` 的元素带 `description` | `src/host/index.ts:812` 现用 `schema.description ?? ''` | `visibleSchemas()` 全为空描述 → 面板所有条目失去 `title`（功能不破，需回到 D-4 被否 B） |
| A2 | `visibleNames()` 与 `/inventory` 的 `tools.schemas(agent)` 完全同源 | `session-layer.ts:259` vs `plugins/user-commands/src/host/index.ts:213`（逐字同表达式） | 面板分组与 `/inventory` 对不上 → 须核对 scope key 是否都传了 agent 对象 |
| A3 | `scoped` 是**掩码后**读数，因此已关名字不在其中 | `schemas(agent)` 语义 + `restrict` 生效后名字消失（`test/session-layer.test.ts` 的假 surface 模拟同一行为） | 若 `schemas(agent)` 仍返回被掩名字，`carried` 会与 `scoped` 重复且不构成「保底」→ 需重新论证振荡 |
| A4 | `carried` 能保住瞬时读数失败时的掩码 | `plan.deny = carried ∩ disabled` 的集合运算（见 ③ 3.4） | 若某轮 `disabled` 恰好新增、且读视图失败，本轮掩码不扩（guard 兜底）；这**是**预期降级，不是缺陷 |
| A5 | project-mcp 掩码变化必然触发 `tools/change` | `restrict()` 在 `dsh-scope` 内广播 `tools/change`（`session-layer.ts:316-332` 的 I6 注释即此事实的旁证） | 「纯意图」永不被兑现 → 需在 project-mcp 侧补事件（超出本变更范围，上浮） |
| A6 | 双端同 bundle 发布，无跨版本 wire 兼容需求 | `lib/index.js` 与 `lib/client.js` 由同一次 `build.mjs` 产出、同 tag 安装 | 需在 parser 加兼容分支（与 D-14 冲突，须用户裁决） |
| A7 | 面板不需要 `stats` 之外的会话口径提示 | 用户裁决已把「与 `/inventory` 同口径」定为行为而非文案 | 需新增 locale 键（见待决 P3） |

### 6.2 未决项（不阻塞本蓝图，实施期消解）

- **U1 真机冒烟（建议）**：多工作区 + project-mcp 掩码会话（本会话 deny=119 量级）开面板，确认 dbx / dbx-brains / dbx-family / figma / figma-family / yunxiao 六台服务器不出现在分组、`可关对象` 计数同步下降；随后解除某台隔离（切工作区）确认 `tools/change` 后它出现且此前记的关闭地址立刻生效（A5 的实证）。
- **U2 `visibleSchemas()` 的调用成本**：每次面板请求多一次 `schemas(agent)` 读（内存过滤，无 IO）。若某部署的 agent 平面工具数极大且面板高频刷新，可把 `snapshotOf` 里 `skillsOf` 与 `descriptionsOf` 的 `layerFor` 合并为一次查找（微优化，当前不做）。
- **U3 `unionNames` 的两处实现**：`mask.ts`（私有）与 `control.ts`（私有）各有一份两读并集。**不合并**：一处服务掩码匹配（顺序无关），一处服务分组/内置工具清单（顺序无关但需要数组），抽到公共文件只会为一个 3 行函数新增跨模块耦合。
- **U4 `panel.module.css` 的样式类**：`entry.shadowed` 只是注释，没有专属选择器；删除后 `.tag` 仍被 `entry.protected` / `entry.reserved` 使用，无样式重构。

---

## 待决问题（六字段之外）

### P1（P1，影响契约 + 面板文案 + 3 条测试）`stats` 到底是两计数还是三计数

- **问题**：decisions D3 的裁定是「删 catalog + shadowed」，同时写下「**三计数** `{ visible, denied, … }`」。删两项后现有四项只剩两项；「第三项」未指名。
- **选项**：
  - **A（本蓝图默认，推荐）** 两计数 `{ visible, denied }`：与「删两个」的算术一致，面板两行「本会话可见 N / 已关 M」自洽，wire 与文案改动最小。
  - B 三计数，第三项 = `intentOnly`（「意图 N」）：把「记了但当前无匹配」显式化；需新增字段 + `STATS_VIEW_KEYS` + 一条 locale 键 + `ToolPanelAction` 第三行，并同步 `wire-contract` / `tool-panel` / `panel-client` 夹具。
  - C 三计数，第三项 = `entries`（候选宇宙 `|scoped ∪ carried|`）：与 `visible` 差异极小，且这正是 D3 否掉的「catalog 改义」。
- **推荐**：**A**。理由：D3 的**行为**裁定（删两项 + 叙事「可见 N / 已关 M」）在 A 下完整成立；B 是「新增能力」而非「删两项」的算术结果，需要用户明确点头；C 已明确被否。
- **影响面**：B 影响 `contract.ts`（字段/键/parser）、`panel.ts`（Stats）、`ToolPanelAction.tsx`（多一行）、`locales.ts`（zh/en 各一键）、`wire-contract` / `tool-panel` / `panel-client` 三个测试文件；A 零额外影响。

### P2（P2，影响面板 `title` 体验）已关闭条目是否要有工具描述

- **问题**：描述改经 `tools.schemas(agent)` 后，已关条目（在 `carried` 里、名字已被掩）不再有 `description`（旧口径从全局层 `catalog` 取，所以有）。
- **选项**：
  - **A（本蓝图默认，推荐）** 接受：已关行无悬浮描述，只显示短名 + 「关闭」状态；README 写明该代价。
  - B 层内描述缓存（`Map<name, description>`，在 `visibleSchemas()` 读到时旁路累积，`detach` 清空、容量上限如 256）：已关条目仍带描述；代价是层多一份状态 + 一条缓存淘汰路径 + 2 条测试。
  - C 面板对已关条目显示地址而非描述（无新状态，但展示价值低）。
- **推荐**：**A**（B 的收益是一行 `title`，成本是一份跨会话状态；若后续用户抱怨再单独立小变更）。
- **影响面**：B 影响 `session-layer.ts`（缓存 + 清理）、`types.ts`（无变化）、`session-layer.test.ts`（+2）；A 只影响 README 一句。

### P3（P3，影响文案与 locale parity）面板是否加一行「本清单只含本会话有效工具」的预期管理

- **问题**：删掉「被其他作用域隐藏 N」之后，用户看不到「有些工具被别处藏了」这个信息；面板是否需要在分组区顶部加一行说明？
- **选项**：
  - **A（推荐）** 不加：面板顶部已有 `state.visible`（本会话可见 N）与关闭集；再加说明会与「面板还管 `tool:`/`skill:`」形成解释冲突（D-9 的反例）。
  - B 加一行静态说明（zh/en 各一键，不进 `REQUIRED_KEYS` 也行但进 parity 校验）。
  - C 加一行**仅在有关闭集意图项时**出现的说明（依赖 `intentOnly.length > 0`，动态）。
- **推荐**：**A**；若用户要求可见性，C 比 B 更准确（只在真有意图项时出现）。
- **影响面**：B/C 改 `locales.ts` + `ToolPanelAction.tsx`（或 `ToolPanelGroups`）+ `tool-panel.test.tsx` + `locale-parity` 的键表。

---

## 附 A：验证映射总表（每条对应一个可执行命令或一条可断言事实）

| 需求/验证点 | 验证载体 | 具体命令或断言 |
|---|---|---|
| 清单宇宙 = scoped ∪ carried（面板） | `test/panel.test.ts` | `inputs({scoped:['mcp__b__y'],carried:[]})` → `groups.map(g=>g.key) === ['b']` |
| 清单宇宙 = scoped ∪ carried（掩码） | `test/mask.test.ts` | `planMask({scoped:[],carried:[],disabled:['mcp:a']}).deny === []` 且 `.shadowServers === ['a']` 且 `.matched.get('mcp:a') === 0` |
| 已关条目必须保留（carried 保底） | `test/panel.test.ts` + `test/control.test.ts` | `carried:['mcp__a__x']` 时组内条目存在且 `disabled:true`；`readPanel().appliedDeny` 与 `stats.denied` 一致 |
| 关闭本会话无效工具 = 纯意图 | `test/control.test.ts` + `test/commands.test.ts` | `matched === 0`、`schemaChanged === false`、`state.disabled` 含该地址；`/tools status` 显示「0 个工具定义」+ 会话口径文案，面板 `intentOnly` 含该地址 |
| 不再有「被隐藏」展示链 | `test/panel.test.ts` / `test/tool-panel.test.tsx` / `test/locale-parity.test.ts` | 顶层键无 `hiddenByOthers`；`queryByText(/被其它作用域隐藏/) === null`；`zh` 无四键 |
| `/tools status` 段 6 只剩保护名单 | `test/commands.test.ts` | `expect(text).not.toContain('被其他作用域隐藏')` 且 `expect(text).toContain('【保护名单】')` |
| 层未就绪的诚实降级 | `test/commands.test.ts` | `withLayer:false` → `toContain('【可关对象】会话层未就绪：无法读取本会话的工具清单')` |
| 描述改经会话层 | `test/rpc.test.ts` | `panel.groups[0].tools[0].description === '读取页面内容'`；`withLayer:false` → 无 description 且请求成功 |
| 层读数降级不失败 | `test/session-layer.test.ts`、`test/rpc.test.ts` | `visibleSchemas` 抛错 → `[]` + 一条 warn；RPC 仍 `ok:true` |
| 首轮读视图失败不掩码但 guard 在 | `test/session-layer.test.ts` | `restrictCalls.length === 0` 且 `guardCalls === 1` |
| wire strict 拒绝旧形状 | `test/wire-contract.test.ts` | `setAt(SNAPSHOT,'stats.catalog',9)` / `…'groups.0.tools.0.shadowed',false` / `…'hiddenByOthers',[])` 三条均 `ok:false` |
| 双端形状不漂移 | `test/wire-contract.test.ts:1113-1143` | host `PanelSnapshot` 与 `contract.PanelSnapshot` 双向可赋值（编译期） |
| 产物纯度与新鲜度 | `test/bundle.test.ts` + 命令 | `pnpm build` 后 `grep -c hiddenByOthers lib/index.js` → 0；`grep -c entry.shadowed lib/client.js` → 0 |
| 文档与实现一致 | 命令 | `grep -c "被其他作用域隐藏" README.md` → 0；`grep -n "读数取全局层" README.md` → 空 |
| 全量回归 | 命令 | `pnpm --filter dsh-plugin-session-tool-toggle verify:all`（lint + typecheck + build + 22 文件全绿） |

## 附 B：被推翻的旧裁决对照（落阶段 2 的 `diff-matrix.md`）

| 旧裁决（`openspec/changes/archive/2026-11-02-session-tool-toggle/diff-matrix.md`） | 原文要点 | 本变更处置 |
|---|---|---|
| **R15①** | `catalog` 端口 = 全局层未掩码注册名，9.1 并入 `ControlDeps`（「推不出全局层」） | **推翻读数面定义**：端口整删（D-2）；「推不出全局层」不再成立为需求，因为工具箱只应有会话作用域一个来源 |
| **R18①** | `shadowed = catalog \ (scoped ∪ carried)`（修正 `catalog \ scoped`） | **整条废止**：`hiddenByOthers` 字段不再存在（其值在新候选集下恒空）、`shadowed` 展示链删除（D-3） |
| **R20①** | `catalog`/`descriptions` 保持全局层口径，「v2 再改 per-agent 读数」 | **本变更即该 v2**：`catalog` 删除、`descriptions` 改经层（D-2 / D-4） |
| R17②（strict parser = 版本漂移报警） | 契约 strict 不宽容 | **保留并沿用**（D-14） |

---

*本文件为阶段 1.7 代码级蓝图；执行期由 spec-apply 维护各组「终形态」小节与 diff-matrix 的 R 条目，蓝图与实测不符处以终形态/R 条目为准。*
