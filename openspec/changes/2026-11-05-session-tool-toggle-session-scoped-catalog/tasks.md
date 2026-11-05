# Tasks

> 执行批次契约：`## N.` 组间**严格串行**、组内可并行；每任务引用 `code-design.md` 触达面条目编号（H/C/B/TS）。落档工件（proposal/specs/design/两材料）已随本变更生成，不在执行清单内。

## 1. 契约与端口形状（串行闸）

- [ ] 1.1 按 C1 改 `src/contract.ts`：删 `ToolEntry.shadowed`、`StatsView.catalog/shadowed`、`PanelSnapshot.hiddenByOthers`，同步 `TOOL_ENTRY_KEYS`/`STATS_VIEW_KEYS`（→`['visible','denied']`）/`PANEL_SNAPSHOT_KEYS` 三张 strict 键表与 `readToolEntry`/`readStatsView`/`readPanelSnapshot` 三个 parser；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 退出码 0，且夹具含 `setAt(SNAPSHOT,'stats.catalog',9)`→`ok:false`、`setAt(SNAPSHOT,'groups.0.tools.0.shadowed',false)`→`ok:false`、`setAt(SNAPSHOT,'hiddenByOthers',[])`→`ok:false`、`dropAt(SNAPSHOT,'stats.denied')`→`ok:false` 四条新拒绝断言
- [ ] 1.2 按 H1 改 `src/host/types.ts`：删 `ControlDeps.catalog`（L409–418）与 `PanelInputs.catalog`（L470），加 `VisibleToolSchema`、`ScopedSurface.visibleSchemas()`、`LayerHandle.visibleSchemas()`，`PanelInputs` 类文档改「两读」；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec tsc --noEmit`（或经 verify 的 typecheck）对 types.ts 零新增错误，且 `grep -n "catalog" src/host/types.ts` 仅剩与 catalog 无关的命中（无 ControlDeps/PanelInputs 字段）
- [ ] 1.3 按 TS7 改 `test/wire-contract.test.ts`：夹具去 `hiddenByOthers`/`stats.catalog`/`stats.shadowed`/各 `tool.shadowed`（L97/107/126/145/158/160/782），键集合断言（L754）与 `dropAt/setAt` 用例同步，交叉可赋值段（L1113–1143）保持；验证：`grep -c "shadowed" test/wire-contract.test.ts` 输出仅剩 `SkillView` 相关命中，且 1.1 的 vitest 全绿

## 2. 会话读数面（层 + RPC + 装配）

- [ ] 2.1 按 H3 改 `src/host/session-layer.ts`：删 `SessionLayerPorts.catalog`（L128–140）与字段/构造赋值/`plan()` 的 catalog 分支（L1052–1059），新增 `visibleSchemas()`（层与 `surfaceOf` 两面，读失败降级空数组 + `absorbFailure`），`AgentServiceScope.tools.schemas` 返回类型补 `description?: string`；验证：`grep -n "catalog" src/host/session-layer.ts` 无输出，`test/session-layer.test.ts` 含 `visibleSchemas()` 投影与抛错降级（`toEqual([])` + 日志含「读本会话的工具描述失败」）两条新断言
- [ ] 2.2 按 H6 改 `src/host/rpc.ts`：删 `RpcDeps.descriptions`，`descriptionsOf(deps, session)` 改经 `deps.layerFor(session.id)?.visibleSchemas()` 取（层缺席/抛错 → 空 `Map`），`PanelInputs` 组装删 `catalog: reading.catalog`、`descriptions` 恒传；验证：`grep -n "descriptionsOf\|reading.catalog" src/host/rpc.ts` 显示签名带 session 且无 catalog 透传，`test/rpc.test.ts` 含「描述来自本会话层」与「层未就绪 → 空描述、请求成功」两条
- [ ] 2.3 按 H7 改 `src/host/index.ts`：删模块级 catalog 闭包（L267–273）、`controlDeps.catalog`（L763–764）、`rpcDeps.descriptions`（L806–813），`new SessionLayer({ log })`（L642），`inject` 名单保留 `['agents','tools']`（D-6）；验证：`grep -n "catalog" src/host/index.ts` 无输出且 `grep -n "descriptions:" src/host/index.ts` 无输出
- [ ] 2.4 按 TS4 改 `test/session-layer.test.ts`：删 9 处 `catalog:` 注入（L233/246/399/427/444/513/588/683/691）与「catalog 读抛 inactive context」（L583–602），L604 断言**翻转**为「首轮读视图失败不掩码但 guard 仍装」（`restrictCalls` 空 + `guardCalls` 为 1），新增 carried 保底不抬掩码断言；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/session-layer.test.ts test/rpc.test.ts` 退出码 0
- [ ] 2.5 按 TS5 改 `test/rpc.test.ts`：harness 删 `catalog`/`descriptions`/`descriptionsError`（L431/499–500/510/537/557/571–578），`FakeLayer` 加 `visibleSchemas()` 与可注入抛错，L826 stats 断言改 `{visible:1,denied:2}`、L870 描述断言改会话层来源；验证：与 2.4 同一 vitest 命令全绿

## 3. 掩码与内核两读

- [ ] 3.1 按 H2 改 `src/host/mask.ts`：删 `MaskInputs.catalog`（L57–66），`unionNames` 两读（L169–171），文件头「三读」段重写为「scoped ∪ carried」并写清纯意图代价；`shadowServers` 语义不动；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts` 退出码 0，含 `planMask({scoped:[],carried:[],disabled:['mcp:a']})` → `{deny:[],shadowServers:['a'],matched:new Map([['mcp:a',0]])}` 断言
- [ ] 3.2 按 H4 改 `src/host/control.ts`：删 `catalogOf()`（L819–826）、`toggleSession`/`readPanel` 的 catalog 取数、`PanelReading.catalog/.hiddenByOthers`，`candidates = unionNames(scoped, applied.deny)`（L538），`unionNames` 两参（L1058–1071），「三读并集/被其他作用域隐藏」文档段改会话口径；验证：`grep -rn "hiddenByOthers\|catalogOf" src/host/control.ts` 无输出，`test/control.test.ts` 含「关闭会话外组 → matched 0 / schemaChanged false / deny 不含该组名字」与 `serverGroups` 只由两读推出两条断言
- [ ] 3.3 按 TS1 改 `test/mask.test.ts`：`inputs()` 删 catalog 默认值，「catalog 单独让名字进 deny」改其反面，三读措辞与入参机械改两读；验证：3.1 的 vitest 全绿
- [ ] 3.4 按 TS3 改 `test/control.test.ts`：harness 删 `catalog` 选项与 `catalogError` 注入（L334/354/396–397/411/440–442），`FakeLayer.reconcile()` 两读（L272），删「全局层读数抛错」（L733）与 R18 两条（L829/846/854），L803/L849 改写；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts test/control.test.ts` 退出码 0

## 4. 面板构建器与命令面

- [ ] 4.1 按 H5 改 `src/host/panel.ts`：候选两读（L283）、删 `catalogNames`/`hiddenByOthers`（L283–304、L355）/`EntryContext.hidden`（L331）/`ToolEntry.shadowed`（L130–136、L596）/`PanelSnapshot.hiddenByOthers`（L252–253），`Stats` → `{visible,denied}`（L217–227、L357–362），模块头推导链重写并写明与 `/inventory` 两处刻意差异；`intentOnly` 三分逻辑一字不动；验证：`grep -rn "hiddenByOthers" src/host/panel.ts` 无输出，`test/panel.test.ts` 含「被隐藏组不进分组」「carried 保底」「关闭会话外工具 → intentOnly」「stats 两键」四条断言
- [ ] 4.2 按 H8 改 `src/host/commands.ts`：删 `hiddenText()`（L906–917）与 `statusText` 对应行（L690），`switchableText` 加「会话层未就绪：无法读取本会话的工具清单」降级分支（L890–904），`closedStateText` matched=0 文案改「已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效」（L781–783），段 1 注释改「本会话命中 vs 本会话暂无匹配」（L653–655）；验证：`grep -rn "hiddenText\|全局层" src/host/commands.ts` 无输出，`test/commands.test.ts` 含层未就绪降级行与会话口径 matched=0 文案断言
- [ ] 4.3 按 TS2 改 `test/panel.test.ts`：`inputs()` 删 catalog（L63），删 L318/337/357 三条 hiddenByOthers 断言，改写 L209/376/403/838（两读 + carried 保底 + stats/顶层键/条目键形状）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel.test.ts` 退出码 0
- [ ] 4.4 按 TS6 改 `test/commands.test.ts`：harness `catalog` → `scope`（L353–356/406/421/459），删「被其他作用域隐藏」三段（L725/733/748），L698 两态文案、L714 可关对象、L742 层未就绪改写，新增「关闭会话外工具」断言；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/commands.test.ts` 退出码 0

## 5. 浏览器半

- [ ] 5.1 按 C2 改 `src/client/locales.ts`：删 `entry.shadowed`/`badge.shadowed`/`state.catalog`/`state.shadowed` 四键（zh L83/89/152/154，en L238/244/306/308），`state.visible`/`state.denied` 文案不动；验证：`grep -rn "entry.shadowed\|badge.shadowed\|state.catalog\|state.shadowed" src/client` 无输出
- [ ] 5.2 按 C3+C4+C5 改 `ToolPanelGroups.tsx`（`lockOf` 删 shadowed 分支 L111、注释两态化 L93/L23/L100–103）、`ToolPanelAction.tsx`（删 `state.catalog`/`state.shadowed` 两个 `<li>` L203/205、注释两计数 L192）、`panel.module.css`（L264 注释）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx` 含「状态摘要只渲染两计数（`<li>` 数 2）」与 `queryByText(/被其它作用域隐藏/) === null` 断言，且保护/保留名两态禁用断言保留
- [ ] 5.3 按 TS8/TS9/TS10 改四个客户端测试：`tool-panel.test.tsx`（夹具去 shadowed/hiddenByOthers/stats 旧键、删 L461–472 一条）、`panel-client.test.ts` 与 `panel-controller.test.ts`（夹具瘦身 L55–57/74、L68–70/452/938）、`locale-parity.test.ts`（`REQUIRED_KEYS` 删三键 L97/148/150）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx test/locale-parity.test.ts test/panel-client.test.ts test/panel-controller.test.ts` 退出码 0

## 6. 文档、产物与全量回归

- [ ] 6.1 按 B2 改插件 `README.md`：L77 禁用行口径改两态、L120「读数取全局层」整条重写为「读数取本会话作用域」+ 与 `/inventory` 两处刻意差异 + 已关条目无 `title` 描述代价、L24 可关对象补「本会话」限定；验证：`grep -c "被其他作用域隐藏" README.md` 输出 0，且 `grep -n "本会话作用域" README.md` 至少 1 行命中
- [ ] 6.2 按 B1 重建产物并核对工作区：`pnpm --filter dsh-plugin-session-tool-toggle build` 重生成 `lib/index.js`/`lib/client.js`，`git status --short` 只含 `plugins/session-tool-toggle/` 下预期条目（不得出现 `.gitignore`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js`）；验证：`grep -c "hiddenByOthers" lib/index.js` 输出 0 且 `grep -c "entry.shadowed" lib/client.js` 输出 0
- [ ] 6.3 全量回归：`pnpm --filter dsh-plugin-session-tool-toggle verify:all`（lint + typecheck + build + 全量 test）退出码 0，22 个测试文件全绿、零 skip；验证：命令退出码 0，且 `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run 2>&1 | tail -3` 显示 22 个测试文件通过（用例总数不作硬门禁，以各任务必含断言逐条落地为准）
