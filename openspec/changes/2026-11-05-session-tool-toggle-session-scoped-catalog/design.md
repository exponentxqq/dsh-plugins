# Design

> 本文档承载 `code-design.md`（随本变更入库的规划材料）的深度契约断言；编号（H/C/B/W/TS、D-n、G-n、A-n、U-n、P/PB-n）以该文件为权威展开，此处为可审精炼面。v2（2026-11-05 晚）：并入「默认档分组开关界面」（B）后重开，A 部分原断言全部保留。

## Context

- **A 的代码事实**：全局层读数闭包 `src/host/index.ts:273`（`ctx.tools.schemas()` 无 scope）同时喂三处（`index.ts:642` SessionLayer / `:764` ControlDeps / `:812` RpcDeps.descriptions）；会话作用域读数已在位（`session-layer.ts:259`，与 `/inventory` 的 `tools.schemas(agent)` 逐字同源）；重算链已在位（`tools/change → refresh()` 幂等全量重算，「意图后效」无需新机制）。
- **B 的代码基线**：unify-workspace-config-entry 已执行（12/14，未提交）——`WorkspaceDefaultsEditor` 为统一弹窗分节（dialog 形态带下拉）+ 面板分区（section 形态）两形态的 chips + 自由文本编辑器；数据走 `workspace` 端点（`WorkspaceValue`），不消费 `PanelSnapshot`；`useWorkspaceDefaults` 状态机（最后写入者胜/目标记忆/本地降级）成熟稳定。**本变更以 unify 提交并归档后的形态为代码基线与 delta 基线（proposal 已声明顺序依赖）。**
- **锚点漂移事实**（2026-11-05 晚核验）：A 原触达面与 unify 执行零冲突；仅 `locales.ts` 四键行号 +4/+7（内容未变，tasks 已按校订值书写），README L24/77/120、css L264、宿主半全部文件、11 个 A 测试文件均未漂。
- **栈识别结论（D-0，沿用）**：目标为 TypeScript + esbuild + cordis 插件（非 Spring 非 Nuxt，探测未命中），聚合层无对应 writer skill，**用户已明确豁免本次加载（仅本次有效）**——不留分层/拆分硬约束，深度契约由本变更六字段自持。

## Goals / Non-Goals

**Goals:**

- A：清单宇宙、掩码候选、matched 计数四处同源收敛为 `scoped ∪ carried`（两读）；`catalog` 字段五个 seam + `RpcDeps.descriptions` 整删；`hiddenByOthers`/工具面 shadowed 展示链整删；描述经本会话层读数；`/tools status` 会话作用域计数 + 层未就绪诚实降级。
- B：两个默认档编辑面（用户级 D10 一并改 + 工作区级两形态）改为与「会话工具面」同构的分组开关界面；宇宙 = 当前会话两读（U1，宿主 `buildDefaultsUniverse` 目标无关）；三计数 `{listed, inDefaults, residual}` 客户端派生；残留区只可移除；自由文本添加完全移除（D8，CLI 兜底）；面板两默认档分区默认折叠（D13）；锁态两态 + 整组默认关行禁用。

**Non-Goals:**

- 不改 `/inventory`、project-mcp、技能分面（`SkillView.shadowed` 影子 stub 与 `ClosedAddressReading.shadowed` 指令段遮蔽两处同名不同义标记保留）、上游 DSH、workspace-config holder（W15 核实零修改）。
- 不改 `/tools workspace`/`default` CLI 语义与输出、两份档文件格式与并集播种语义、`useWorkspaceDefaults` 状态机、`panel-controller.ts`、`WorkspaceRequest` 形状。
- 不做层内描述缓存（D-4/P2）；不做 `/tools workspace --path`（PB1 若不接受跨工作区边界则另立变更）；折叠态不跨开合记忆（PB3）。

## Decisions

A 部分决策 D-0–D-15 全部保留（下表节选，全文见 code-design ④）：

| # | 决策 | 被否方案（理由） |
| --- | --- | --- |
| D-0 | 栈识别未命中，writer 豁免留痕（见 Context） | — |
| D-1 | 清单宇宙 = `scoped ∪ carried`，掩码写路径同源改两读（承接 decisions D1） | 只改展示面（deny 仍含全局层名字 → 经 carried 回流面板；toggle 回执 matched 与 deny 分叉） |
| D-2 | `catalog` 五 seam 全删，不留「改义」形态（承接 decisions D2） | 保留改义（双字段是永恒歧义源） |
| D-4 | 描述经本会话层 `visibleSchemas()`；已关条目失 `title` 描述为已知代价（P2） | 层内描述缓存（跨会话状态 + 淘汰路径，收益仅一行 title） |
| D-5 | `stats` = `{ visible, denied }` 两计数（P1） | 第三项 `intentOnly` / `entries`（详见 code-design） |
| D-6 | `inject` 保留 `['agents','tools']` | 缩减（无 `tools` profile 下 `agent/created` 挂死） |
| D-12 | 版本号维持 `1.5.0`（D5；发布升版交 release 脚本，PB2） | 代码变更内单方面 bump |

B 部分新增决策（D-16–D-25，全文与反例见 code-design ④）：

| # | 决策 | 被否方案（理由） |
| --- | --- | --- |
| D-16 | 宇宙 = 当前会话两读（U1），宿主 `buildDefaultsUniverse` 纯函数、目标无关（承接 decisions D7） | 目标工作区推导宇宙（跨插件读 project-mcp + 与会话两读形成第二口径） |
| D-17 | 宿主只传宇宙，不传 `inDefaults`/`residual`/计数——三计数由客户端 `defaults-view.ts` 按 `(universe, disabled)` 求交（承接 D11） | 宿主算计数（切目标后必然陈旧） |
| D-18 | `WorkspaceValue` 加必填 `universe`：`{sessionId}` 读/写响应都带、`{workspacePath}` 为 `null`；跨目标宇宙由分节组件 `useRef` 缓存（`selectAndRemember`） | 放宽 `WorkspaceRequest` 允许 sessionId+workspacePath 同现（破坏「恰好之一」契约）；改 `useWorkspaceDefaults` 状态机（unify 冻结裁定） |
| D-19 | 用户级编辑器零新增 wire：宇宙取 `PanelSnapshot.groups`+`skills` 客户端投影 `universeOfSnapshot`（承接 D10） | 扩 defaults 端点 / 把宇宙复制进快照（wire 面膨胀） |
| D-20 | 新建 `DefaultsGroupList` 复用 `ToolPanelGroups` 的模式与样式类（仅导出 `groupTitle`/`defaultExpanded` 两纯函数），不共用组件（承接 D8/D13 落地面） | 共用组件（行语义 `!inDefaults` ≠ `!disabled`、动作/`blocked`/无恢复快照均不同，双处方互相牵连） |
| D-21 | 锁态两态 protected/reserved；整组地址在档时组内行禁用（`defaults.groupOff` 标签） | 三态（shadowed 链已被 A 删除） |
| D-22 | 自由文本添加完全移除（承接 decisions D8）；残留 chips 只可移除；`defaults.cliHint`/`workspace.cliHint` 兜底文案 | 保留「高级添加」行（用户已否）；残留区可编辑（同形回退） |
| D-23 | 面板两默认档分区默认折叠（新 `DefaultsSectionFrame`，承接 D13）；dialog 分节不折叠；折叠态不记忆（PB3） | 平铺（一屏三套分组清单过长）；折叠态入控制器/localStorage |
| D-24 | `handleWorkspace` 写响应也带宇宙（写后清单不消失，B10） | 只读响应带（`update()` 用写响应整份替换 value → 点一次开关清单消失） |
| D-25 | delta 以 unify 归档后文本为基（承接 decisions D12）；承载形态为「Web 配置界面」**单块 MODIFIED**（正文 = unify 分节座位表述 + A 宇宙句 + B 两编辑面句），「工作区默认档分节」保留 unify 原文（strict 校验要求 delta 对当前主规格可归档——该需求 unify 归档前不存在；其正文与场景不与 B 矛盾）；执行期末 T10 按实际归档文本机械复核 | 维持旧基（归档时替换会冲掉 unify 的入口迁移表述）；双块 MODIFIED（第二块过不了当前主规格的 strict 校验） |

- 执行环境：直用主工作区。创建于 2026-11-05

## 接口与数据形状（摘要，全文见 code-design ③）

- A：`ScopedSurface`/`LayerHandle` 增 `visibleSchemas(): readonly VisibleToolSchema[]`；`MaskInputs` 两读；`descriptionsOf(deps, session)` 经 `layerFor`；wire `Stats = {visible, denied}`、`ToolEntry` 去 `shadowed`、`PanelSnapshot` 去 `hiddenByOthers`（三张 strict 键表同步）。
- B：`DefaultsEntry{address,shortName,description?,protected,reserved}` / `DefaultsGroup{kind,key,address,tools}` / `DefaultsUniverse{layerReady,skillsAvailable,groups}`；`WorkspaceValue` 加必填 `universe: DefaultsUniverse | null`（三张新 strict 键表 + 三个 reader + `parseWorkspaceValue` 收紧）；宿主 `buildDefaultsUniverse(inputs)`（复用 panel.ts 既有私有件，不改 `buildPanelSnapshot`）；rpc `universeOf(deps, session)` + `EMPTY_UNIVERSE`（层缺席/读失败 → `layerReady:false`，永不抛错）；客户端 `switchAddressesOf` / `defaultsCountsOf → {listed,inDefaults,residual}` / `residualOf` / `universeOfSnapshot`；组件 `DefaultsGroupList`（行/组语义表见 code-design ③ 3.19）/ `DefaultsSectionFrame`（默认收起）/ 两编辑器新 props（`universe`）；locales +12/−8 键。
- 配置面零变化（无新配置键/文件位置变化）。

## 逐任务组要点（对齐 tasks.md T1–T10，详细见 code-design ⑤ G1–G10）

- **T1–T6（A，保留）**：契约与端口形状（串行闸）→ 会话读数面（层+RPC+装配）→ 掩码与内核两读 → 面板构建器与命令面 → 浏览器半 → A 文档/产物/全量回归（delta 起草移至 T10）。
- **T7 默认档宇宙的契约与宿主构建**：W1 契约三形状+键表+`parseWorkspaceValue` 必填、W2 `buildDefaultsUniverse`、W3 rpc `universeOf` 与 `handleWorkspace` 两处响应；TS15/TS17/TS16/TS18。
- **T8 客户端基础件**：W4 `defaults-view.ts` 四纯函数、W5 `DefaultsGroupList`、W6 `DefaultsSectionFrame`、`ToolPanelGroups` 导出两纯函数、W11 locales +12/−8、W12 css；TS14/TS10。
- **T9 两个编辑器、两形态与面板接线**：W7 `DefaultsEditor` 重写、W8 `WorkspaceDefaultsEditor` 重写（dialog 下拉/section 折叠）、W9 `WorkspaceEntry` 宇宙缓存（状态机零改动）、W10 `ToolPanelAction` 投影接线；TS12/TS13。
- **T10 文档、delta 重基线、产物与全量回归**：W14 README（B 三条已知限制）、S1–S3 delta 复核（按 unify 实际归档文本）、W13 产物重建、23 文件全绿零 skip + 产物纯度 grep。

## Risks / Trade-offs

- A 原风险保留（首轮读失败行为翻转的测试断言对、`tools/change` 链完备性、用例总数不作硬门）。
- [B5 投影无损假设] `PanelSnapshot.groups` 须含 `protected/reserved/description`（A 后形状保证）；被证伪则用户级锁态失效，须改为宿主构建。
- [B8 holder 滚动承载] 变长分组清单依赖统一弹窗内容列 `overflow-y:auto`（已核实 `dialog.module.css:199–205`）；溢出则需另行设计降级。
- [PB1 合成能力边界] 切其他工作区 + 跨清单新关 = 无 UI 无 CLI（`/tools workspace` 只作用本会话工作区），只能手改 `workspaces.json`——接受并写清（README + `workspace.cliHint` 措辞）。
- [delta 基线时机] unify 未归档前本校 delta 按其 delta 原文拼基；T10 执行期末以实际归档文本机械复核校正。
- [workspace-editor.test.tsx 重写量] 现 570 行 / 27 用例大半针对 chips/自由文本形态；TS12 按新断言面重写（迁移下拉/失败成功/共用状态骨架用例）。

## Open Questions（落档分歧点已全部裁定）

- **PB1 跨工作区新增无 UI/CLI → 接受并写清**：README 已知限制 + `workspace.cliHint` 措辞改实（本会话工作区的跨清单新关用 `/tools workspace off`；其他工作区请编辑 `workspaces.json`）。机制查实留痕：dsh 工具注册表只有全局层（无归属维度、无掩码）与作用域链（`ScopeKey` 为不透明运行时对象，无「按工作区」读数）两个维度；project-mcp 无对外服务面——U2 的跨插件/推导两案维持被否。
- **PB2 版本号 → 不 bump**：代码/工件不动 `package.json`（维持 1.5.0 与 D-12 语义），版本号决定留给 `scripts/release.mjs` 发布步骤统一处理。
- **PB3 面板两分区折叠态 → 不记忆**：折叠态组件本地状态，面板重开复位为收起（默认视图一致）；真机反馈「每次都要点」再单独立项。
