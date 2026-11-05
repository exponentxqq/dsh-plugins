# Tasks

> 执行批次契约：`## N.` 组间**严格串行**、组内可并行；每任务引用 `code-design.md` 触达面条目编号（H/C/B/W/TS）。落档工件（proposal/specs/design/两材料）已随本变更生成，不在执行清单内。
>
> **执行顺序前提（全批）**：本变更在 `unify-workspace-config-entry` **提交、执行完成并归档之后**执行（代码基线——分节形态客户端文件；delta 基线——specs 以其归档后主规格为基）。开工前 `openspec list` 确认其不在进行中清单、`git status` 无其未提交改动。
>
> T1–T6 为 A 原批次保留（5.1 的 locales 行号已按 unify 执行后的漂移校订：zh 87/93/156/158、en 245/251/313/315）；T7–T10 为并入的 B 批次（依赖 T2 落地的层读数）。spec delta 起草已随本次落档完成，执行期末在 10.2 复核。

## 1. 契约与端口形状（串行闸）

- [ ] 1.1 按 C1 改 `src/contract.ts`：删 `ToolEntry.shadowed`、`StatsView.catalog/shadowed`、`PanelSnapshot.hiddenByOthers`，同步 `TOOL_ENTRY_KEYS`/`STATS_VIEW_KEYS`（→`['visible','denied']`）/`PANEL_SNAPSHOT_KEYS` 三张 strict 键表与 `readToolEntry`/`readStatsView`/`readPanelSnapshot` 三个 parser；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 退出码 0，且夹具含 `setAt(SNAPSHOT,'stats.catalog',9)`→`ok:false`、`setAt(SNAPSHOT,'groups.0.tools.0.shadowed',false)`→`ok:false`、`setAt(SNAPSHOT,'hiddenByOthers',[])`→`ok:false`、`dropAt(SNAPSHOT,'stats.denied')`→`ok:false` 四条新拒绝断言
- [ ] 1.2 按 H1 改 `src/host/types.ts`：删 `ControlDeps.catalog` 与 `PanelInputs.catalog`，加 `VisibleToolSchema`、`ScopedSurface.visibleSchemas()`、`LayerHandle.visibleSchemas()`，`PanelInputs` 类文档改「两读」；验证：typecheck 对 types.ts 零新增错误，且 `grep -n "catalog" src/host/types.ts` 仅剩与 ControlDeps/PanelInputs 字段无关的命中
- [ ] 1.3 按 TS7 改 `test/wire-contract.test.ts`：夹具去 `hiddenByOthers`/`stats.catalog`/`stats.shadowed`/各 `tool.shadowed`，键集合断言与 `dropAt/setAt` 用例同步，交叉可赋值段保持；验证：`grep -c "shadowed" test/wire-contract.test.ts` 输出仅剩 `SkillView` 相关命中，且 1.1 的 vitest 全绿

## 2. 会话读数面（层 + RPC + 装配）

- [ ] 2.1 按 H3 改 `src/host/session-layer.ts`：删 `SessionLayerPorts.catalog` 与字段/构造赋值/`plan()` 的 catalog 分支，新增 `visibleSchemas()`（层与 `surfaceOf` 两面，读失败降级空数组 + `absorbFailure`），`AgentServiceScope.tools.schemas` 返回类型补 `description?: string`；验证：`grep -n "catalog" src/host/session-layer.ts` 无输出，`test/session-layer.test.ts` 含 `visibleSchemas()` 投影与抛错降级（`toEqual([])` + 日志含「读本会话的工具描述失败」）两条新断言
- [ ] 2.2 按 H6 改 `src/host/rpc.ts`：删 `RpcDeps.descriptions`，`descriptionsOf(deps, session)` 改经 `deps.layerFor(session.id)?.visibleSchemas()` 取（层缺席/抛错 → 空 `Map`），`PanelInputs` 组装删 `catalog: reading.catalog`、`descriptions` 恒传；验证：`grep -n "descriptionsOf\|reading.catalog" src/host/rpc.ts` 显示签名带 session 且无 catalog 透传，`test/rpc.test.ts` 含「描述来自本会话层」与「层未就绪 → 空描述、请求成功」两条
- [ ] 2.3 按 H7 改 `src/host/index.ts`：删模块级 catalog 闭包、`controlDeps.catalog`、`rpcDeps.descriptions`，`new SessionLayer({ log })`，`inject` 名单保留 `['agents','tools']`（D-6）；验证：`grep -n "catalog" src/host/index.ts` 无输出且 `grep -n "descriptions:" src/host/index.ts` 无输出
- [ ] 2.4 按 TS4 改 `test/session-layer.test.ts`：删 9 处 `catalog:` 注入与「catalog 读抛 inactive context」用例，断言**翻转**为「首轮读视图失败不掩码但 guard 仍装」（`restrictCalls` 空 + `guardCalls` 为 1），新增 carried 保底不抬掩码断言；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/session-layer.test.ts test/rpc.test.ts` 退出码 0
- [ ] 2.5 按 TS5 改 `test/rpc.test.ts`：harness 删 `catalog`/`descriptions`/`descriptionsError`，`FakeLayer` 加 `visibleSchemas()` 与可注入抛错，stats 断言改 `{visible:1,denied:2}`、描述断言改会话层来源；验证：与 2.4 同一 vitest 命令全绿

## 3. 掩码与内核两读

- [ ] 3.1 按 H2 改 `src/host/mask.ts`：删 `MaskInputs.catalog`，`unionNames` 两读，文件头「三读」段重写为「scoped ∪ carried」并写清纯意图代价；`shadowServers` 语义不动；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts` 退出码 0，含 `planMask({scoped:[],carried:[],disabled:['mcp:a']})` → `{deny:[],shadowServers:['a'],matched:new Map([['mcp:a',0]])}` 断言
- [ ] 3.2 按 H4 改 `src/host/control.ts`：删 `catalogOf()`、`toggleSession`/`readPanel` 的 catalog 取数、`PanelReading.catalog/.hiddenByOthers`，`candidates = unionNames(scoped, applied.deny)`、`unionNames` 两参，「三读并集/被其他作用域隐藏」文档段改会话口径；验证：`grep -rn "hiddenByOthers\|catalogOf" src/host/control.ts` 无输出，`test/control.test.ts` 含「关闭会话外组 → matched 0 / schemaChanged false / deny 不含该组名字」与 `serverGroups` 只由两读推出两条断言
- [ ] 3.3 按 TS1 改 `test/mask.test.ts`：`inputs()` 删 catalog 默认值，「catalog 单独让名字进 deny」改其反面，三读措辞与入参机械改两读；验证：3.1 的 vitest 全绿
- [ ] 3.4 按 TS3 改 `test/control.test.ts`：harness 删 `catalog` 选项与 `catalogError` 注入，`FakeLayer.reconcile()` 两读，删「全局层读数抛错」与 R18 两条，对应行改写；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts test/control.test.ts` 退出码 0

## 4. 面板构建器与命令面

- [ ] 4.1 按 H5 改 `src/host/panel.ts`：候选两读、删 `catalogNames`/`hiddenByOthers`/`EntryContext.hidden`/`ToolEntry.shadowed`/`PanelSnapshot.hiddenByOthers`，`Stats` → `{visible,denied}`，模块头推导链重写并写明与 `/inventory` 两处刻意差异；`intentOnly` 三分逻辑一字不动；验证：`grep -rn "hiddenByOthers" src/host/panel.ts` 无输出，`test/panel.test.ts` 含「被隐藏组不进分组」「carried 保底」「关闭会话外工具 → intentOnly」「stats 两键」四条断言
- [ ] 4.2 按 H8 改 `src/host/commands.ts`：删 `hiddenText()` 与 `statusText` 对应行，`switchableText` 加「会话层未就绪：无法读取本会话的工具清单」降级分支，`closedStateText` matched=0 文案改「已记录：本会话当前没有匹配的工具定义；它出现在本会话后自动生效」，段 1 注释改「本会话命中 vs 本会话暂无匹配」；验证：`grep -rn "hiddenText\|全局层" src/host/commands.ts` 无输出，`test/commands.test.ts` 含层未就绪降级行与会话口径 matched=0 文案断言
- [ ] 4.3 按 TS2 改 `test/panel.test.ts`：`inputs()` 删 catalog，删三条 hiddenByOthers 断言，改写两读 + carried 保底 + stats/顶层键/条目键形状用例；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel.test.ts` 退出码 0
- [ ] 4.4 按 TS6 改 `test/commands.test.ts`：harness `catalog` → `scope`，删「被其他作用域隐藏」三段，两态文案/可关对象/层未就绪改写，新增「关闭会话外工具」断言；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/commands.test.ts` 退出码 0

## 5. 浏览器半

- [ ] 5.1 按 C2 改 `src/client/locales.ts`：删 `entry.shadowed`/`badge.shadowed`/`state.catalog`/`state.shadowed` 四键（zh L87/93/156/158，en L245/251/313/315——已按 unify 执行后漂移校订），`state.visible`/`state.denied` 文案不动；验证：`grep -rn "entry.shadowed\|badge.shadowed\|state.catalog\|state.shadowed" src/client` 无输出
- [ ] 5.2 按 C3+C4+C5 改 `ToolPanelGroups.tsx`（`lockOf` 删 shadowed 分支、注释两态化）、`ToolPanelAction.tsx`（删 `state.catalog`/`state.shadowed` 两个 `<li>`、注释两计数）、`panel.module.css`（L264 注释）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx` 含「状态摘要只渲染两计数（`<li>` 数 2）」与 `queryByText(/被其它作用域隐藏/) === null` 断言，且保护/保留名两态禁用断言保留
- [ ] 5.3 按 TS8/TS9/TS10 改四个客户端测试：`tool-panel.test.tsx`（夹具去 shadowed/hiddenByOthers/stats 旧键）、`panel-client.test.ts` 与 `panel-controller.test.ts`（夹具瘦身）、`locale-parity.test.ts`（`REQUIRED_KEYS` 删三键）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx test/locale-parity.test.ts test/panel-client.test.ts test/panel-controller.test.ts` 退出码 0

## 6. A 的文档、产物与全量回归（spec delta 起草与复核移至 10.2）

- [ ] 6.1 按 B2 改插件 `README.md`：L77 禁用行口径改两态、L120「读数取全局层」整条重写为「读数取本会话作用域」+ 与 `/inventory` 两处刻意差异 + 已关条目无 `title` 描述代价、L24 可关对象补「本会话」限定；验证：`grep -c "被其他作用域隐藏" README.md` 输出 0，且 `grep -n "本会话作用域" README.md` 至少 1 行命中
- [ ] 6.2 按 B1 重建产物并核对工作区：`pnpm --filter dsh-plugin-session-tool-toggle build` 重生成 `lib/index.js`/`lib/client.js`，`git status --short` 只含 `plugins/session-tool-toggle/` 下预期条目（不得出现 `.gitignore`、`openspec/changes/unify-workspace-config-entry/*`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js`——unify 已归档的前提即其改动已入库）；验证：`grep -c "hiddenByOthers" lib/index.js` 输出 0 且 `grep -c "entry.shadowed" lib/client.js` 输出 0
- [ ] 6.3 A 段全量回归：`pnpm --filter dsh-plugin-session-tool-toggle verify:all`（lint + typecheck + build + 全量 test）退出码 0，**此时点 22 个测试文件**全绿、零 skip（B 的 T8 将新增第 23 个）；验证：命令退出码 0，且 `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run 2>&1 | tail -3` 显示 22 个测试文件通过（用例总数不作硬门禁，以各任务必含断言逐条落地为准）

## 7. 默认档宇宙的契约与宿主构建

- [ ] 7.1 按 W1+TS15 改 `src/contract.ts`：新增 `DefaultsEntry`/`DefaultsGroup`/`DefaultsUniverse` 三形状、三张 strict 键表（`DEFAULTS_ENTRY_KEYS`/`DEFAULTS_GROUP_KEYS`/`DEFAULTS_UNIVERSE_KEYS`）与三个 reader，`WorkspaceValue` 加必填 `universe: DefaultsUniverse | null` 并入 `parseWorkspaceValue`（`null` 合法、缺键拒绝）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 退出码 0，含 `dropAt(WORKSPACE_VALUE,'universe')`→`ok:false`、`setAt(WORKSPACE_VALUE,'universe.groups.0.kind','server')`→`ok:false`、`setAt(WORKSPACE_VALUE,'universe.groups.0.tools.0.address','')`→`ok:false` 三条新拒绝断言
- [ ] 7.2 按 W2+TS17 改 `src/host/panel.ts`：新增导出 `DefaultsUniverseInputs` 与 `buildDefaultsUniverse`（复用同文件既有私有件分桶/锁态/描述截断；`layerReady:false` → 三键空宇宙；技能行来自 `skills.visible ∪ shadowed`；不改 `buildPanelSnapshot` 现有行为），`test/panel.test.ts` 追加分组桶/carried-only 行/`bash`+`run_code` 标记/截断 160/空宇宙/技能行用例；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel.test.ts` 退出码 0，且 `grep -n "buildDefaultsUniverse" src/host/panel.ts` 命中新导出
- [ ] 7.3 按 W3+TS16 改 `src/host/rpc.ts`：新增 `EMPTY_UNIVERSE` 与 `universeOf(deps, session)`（层缺席/读失败 → `layerReady:false` 空宇宙 + 一次 warn，永不抛错），`handleWorkspace` 的 `action==='read'` 与写成功两份 `WorkspaceValue` 都补 `universe`（`{sessionId}` → `universeOf(...)`；`{workspacePath}` → `null`），`test/rpc.test.ts` 追加「会话形态读/写带宇宙、路径形态 null、withLayer:false 空宇宙、skills 缺席组仍在」用例；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/rpc.test.ts` 退出码 0，且 `grep -n "universeOf\|EMPTY_UNIVERSE" src/host/rpc.ts` 两处命中
- [ ] 7.4 按 TS18 改 `test/panel-client.test.ts` 与 `test/panel-controller.test.ts`：两文件 `workspaceValue()` 夹具默认加 `universe: null`，panel-client 增「缺 `universe` 即 `bad-response`」一条（控制器行为断言零改动）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel-client.test.ts test/panel-controller.test.ts` 退出码 0

## 8. 客户端基础件

- [ ] 8.1 按 W4+TS14 新建 `src/client/defaults-view.ts`（纯函数，只 `import type` contract）：`switchAddressesOf`/`defaultsCountsOf → {listed,inDefaults,residual}`/`residualOf`/`universeOfSnapshot`，并新建 `test/defaults-view.test.ts`（三计数含整组关闭只计组开关、残留排序差集、快照投影的技能组 `tool:skill`+`skill:<name>` 行、`skills-unavailable` → `skillsAvailable:false`、空 groups）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/defaults-view.test.ts` 退出码 0
- [ ] 8.2 按 W5+W6 新建 `src/client/DefaultsGroupList.tsx`（行/组语义按 code-design ③ 3.19 表逐条落地：`checked = !disabled.has(address)`、锁态两态、整组在档行禁用 + `defaults.groupOff`、技能两轴降级、残留 chips 只可移除、`layerReady:false` 只渲染残留区）与 `src/client/DefaultsSectionFrame.tsx`（默认收起、`aria-expanded`、摘要行），并把 `ToolPanelGroups.tsx` 的 `groupTitle`/`defaultExpanded` 改为具名导出（行为零改动）；验证：`grep -c "<ToolPanelGroups" src/client/DefaultsGroupList.tsx` 输出 0，typecheck 零错误
- [ ] 8.3 按 W11+TS10 改 `src/client/locales.ts` 与 `test/locale-parity.test.ts`：新增 12 键（`defaults.counts/summary/residualTitle/groupCount/groupInDefaults/groupSummary/groupOff/switchLabel/groupSwitchLabel/cliHint/universeUnavailable` + `workspace.cliHint`，zh/en 各一份），删除 8 键（`defaults.add`/`defaults.addPlaceholder`/`defaults.placeholder`/`defaults.empty`/`workspace.add`/`workspace.addPlaceholder`/`workspace.placeholder`/`workspace.empty`），`REQUIRED_KEYS` 同步；验证：`grep -rn "defaults.add\|defaults.addPlaceholder\|defaults.placeholder\|workspace.add\|workspace.addPlaceholder\|workspace.placeholder" src` 无输出，且 `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/locale-parity.test.ts` 退出码 0
- [ ] 8.4 按 W12 改 `src/client/panel.module.css`：新增 `.sectionFrame`/`.residual`，删除 `.addInput`（唯一使用者已删；`.addRow` 保留——dialog 下拉行仍用）；验证：`grep -n "addInput" src/client/panel.module.css` 无输出，且 8.1–8.3 的 vitest 命令全部退出码 0

## 9. 两个编辑器、两形态与面板接线

- [ ] 9.1 按 W7 重写 `src/client/DefaultsEditor.tsx`：删自由文本添加（`splitAddresses`/`draft`/`add()`），改 `DefaultsSectionFrame`（默认收起）+ 路径/损坏告警 + 三计数行 + `<DefaultsGroupList>` + 残留区 + `defaults.cliHint` + 不追溯两句 + 清空两段式；`PanelFailure` 导出路径保留；验证：`grep -n "splitAddresses" src/client/DefaultsEditor.tsx` 仅剩 `export function`（供迁移期引用核对后可整体删除，最终无输出）
- [ ] 9.2 按 W8 重写 `src/client/WorkspaceDefaultsEditor.tsx`：删自由文本添加；`dialog` 形态保留标题 + 工作区下拉 + 刷新，`section` 形态用 `DefaultsSectionFrame`（无下拉）；共有键/路径/登记态/损坏告警 + 三计数 + `<DefaultsGroupList universe disabled>` + 残留区 + `workspace.cliHint` + `workspace.scope`/`workspace.union` + 清空两段式；`workspace===null` 只读降级保留；验证：`grep -rn "splitAddresses\|addPlaceholder" src/client/WorkspaceDefaultsEditor.tsx` 无输出
- [ ] 9.3 按 W9 改 `src/client/WorkspaceEntry.tsx`：`WorkspaceDefaultsSection` 加 `useRef` 宇宙缓存（`value?.universe ?? remembered.current`）与 `selectAndRemember` 包装，向编辑器传 `universe`；`useWorkspaceDefaults` 状态机一行不改；验证：`git diff src/client/WorkspaceEntry.tsx` 中 `useWorkspaceDefaults` 函数体零改动（diff 只落在 `WorkspaceDefaultsSection`），且 `grep -n "selectAndRemember" src/client/WorkspaceEntry.tsx` 命中
- [ ] 9.4 按 W10 改 `src/client/ToolPanelAction.tsx`：`useMemo(() => universeOfSnapshot(snapshot), [snapshot])` 给两个编辑器传 `universe`，删除两编辑器外层的多余 `<section>`（它们自带折叠壳），「六段」注释更新；验证：typecheck 零错误，且 `grep -n "universeOfSnapshot" src/client/ToolPanelAction.tsx` 命中
- [ ] 9.5 按 TS12 重写 `test/workspace-editor.test.tsx`：删 5 条添加框用例与 `workspace.add*` 断言，迁移下拉切换/失败成功/共用状态骨架用例，新增折叠默认收起与展开、三计数行、组/行开关提交 `off`/`on`（`mcp:a::x`/`mcp:a`/`tool:skill`）、锁态行禁用、整组关闭行禁用 + 标签、残留区只读可移除、`universe={null}` 降级、切换工作区后分组清单仍在（缓存回归）用例；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 退出码 0
- [ ] 9.6 按 TS13 改 `test/tool-panel.test.tsx`：默认档/工作区档用例重写——两分区默认收起（`aria-expanded=false`、开关不在文档）、点击展开、标题摘要计数、用户级行开关 → `client.updateDefaults('off',[addr])`、工作区行开关 → `client.workspace({sessionId,action:'off',addresses})`、`workspace===null` 只读、无添加输入；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx` 退出码 0

## 10. 文档、delta 重基线、产物与全量回归

- [ ] 10.1 按 W14 改插件 `README.md`：B 段三条已知限制（清单只列本会话可见工具 + CLI 兜底与 `workspaces.json` 边界、切其他工作区的近似、已关条目无描述）+ 面板布局改写（两默认档分区默认折叠、点开是分组开关清单）；验证：`grep -c "workspaces.json" README.md` ≥ 1 且 `grep -n "默认折叠" README.md` 命中
- [ ] 10.2 按 S1–S3 复核 spec delta 与顺序声明：以 unify **实际归档后**的主规格文本逐句比对 `openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/specs/dsh-session-tool-toggle/spec.md` 的「Web 配置界面」MODIFIED 基线正文（unify 分节座位表述是否与归档文本一致，失配处以归档文本为准校正），核对 proposal/tasks 的执行顺序依赖表述与「工作区默认档分节」保留原文不动的事实；验证：`openspec validate 2026-11-05-session-tool-toggle-session-scoped-catalog --strict` 退出码 0
- [ ] 10.3 按 W13 重建产物：`pnpm --filter dsh-plugin-session-tool-toggle build` 重生成 `lib/index.js`/`lib/client.js`；验证：`grep -c "hiddenByOthers\|state\.catalog\|entry\.shadowed" lib/index.js` 输出 0、`grep -c "hiddenByOthers\|state\.catalog\|entry\.shadowed" lib/client.js` 输出 0、`grep -c "defaults.cliHint" lib/client.js` ≥ 1
- [ ] 10.4 全量回归（B 后基线）：`pnpm --filter dsh-plugin-session-tool-toggle verify:all` 退出码 0，**23 个测试文件**全绿、零 skip；验证：命令退出码 0，且 `pnpm --filter dsh-plugin-session-tool-toggle exec vitest run 2>&1 | tail -3` 显示 23 个测试文件通过，`git status --short` 除本变更预期文件与 `openspec/changes/…/tasks.md` 勾选外无其他新增（用例总数不作硬门禁，以各任务必含断言逐条落地为准）
