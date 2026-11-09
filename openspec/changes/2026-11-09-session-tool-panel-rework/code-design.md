# code-design.md — 会话工具面参照「工作区默认档」页面改版 · 阶段 1.7 代码级蓝图

> 角色：代码设计线（阶段 1.7）。输入：`explore.md`、`decisions.md`（已逐字读完）。
> 硬约束：`dsh-plugin-writer` 已由本会话经 skill 工具加载成功（锚点 `/home/xuqinqin/develop/person/dsh-plugins`），
> 其「分层方向 / 复用优先 / 任务拆分粒度 / 构建与验证纪律」是本设计的约束；`decisions.md` 的四项已定结论
> （三卡整编 / 用户级 GUI 全移除仅留命令 / 技能并入清单卡 / 关闭集拆并三处）**不重开**，与代码事实的冲突
> 只在文末「待决问题」上浮。本文只回答「改哪些文件、怎么改、接口与数据长什么样、为什么这么定、怎么验」，
> 不复述探索结论。
>
> 路径约定：仓库路径相对本仓根 `/home/xuqinqin/develop/person/dsh-plugins`；本文所有行号对应当前工作树。
> 「仓」只有两个：根仓 `dsh-plugins`（唯一仓库，无子仓），包只有 `plugins/session-tool-toggle` 与仓级
> `openspec/`。`plugins/workspace-config`（holder）与其余四包**零改动**。

---

## 0. 设计摘要

一句话：**把会话工具面从「六段平铺」整编为「概要卡 + 清单卡 + 命令卡 + 页脚动作区」的纯会话级面板；
清单本体换用页面同一个 `DefaultsGroupList`（新增一个可选的「会话语义槽」），两个默认档分区与其宿主面
（两个快照字段 + `defaults` 端点）一并退出。**

| 收敛留痕 | 代码落点 | 本文决策 |
| --- | --- | --- |
| D1=a 三卡整编 | `ToolPanelAction.tsx` 重写为三卡容器；`.card` / `.cardHeader` / `.facts` / `.counts` / `.pageFilter` / `.commandRow` 复用页面样式类 | D-01 / D-06 / D-07 |
| D2=b 用户级 GUI 全移除，仅留 `/tools default` | 删 `DefaultsEditor.tsx`；删 `PanelSnapshot.defaults`；删 `defaults` RPC 端点与 `PanelClient.updateDefaults` | D-02 |
| D3=a 技能并入清单卡 | 删 `SkillPanel.tsx`；`universeOfSnapshot` 已有的技能组投影 + 新增 `shadowedSkills` / `effectiveDisabled` 槽 | D-03 / D-04 / D-08 |
| D4=a 关闭集拆并三处 | ①计数进概要卡（`state.closedCount`）②残留 chip 进清单卡（可开启）③恢复快照进 Modal footer（两段式） | D-04 / D-06 / D-07 |
| 移交项「wire 契约瘦身」 | `contract.ts` 端点 5→4、`PanelSnapshot` 两字段删除；`host/{types,panel,rpc,index}.ts` 联动 | D-02 / D-11 |
| 移交项「命令卡内容」 | 新建 `CommandCard.tsx`（页面与面板共用复制反馈状态机）；面板命令 = `/tools off <address>` + 用户级命令灰字 | D-05 / D-12 |
| 移交项「概要卡事实映射」 | 概要卡 = 卡头(标题+刷新) + `dl.facts`(会话/创建时间/创建时快照/持久化通道) + 三计数 + notices | D-06 |
| 移交项「`DefaultsGroupList` props 形状」 | 单个可选 `session?: SessionListState` 槽（四个集合），缺省 = 默认档形态（页面零改动） | D-03 / D-04 |
| 移交项「Modal 样式适配」 | `.workspacePage` 更名 `.cardStack` 并两处共用；Modal 宽度/滚动约束保持 `.dialog` + `.content` 现状 | D-07 |
| 移交项「变更名」 | 沿用 `2026-11-09-session-tool-panel-rework`（与探索/收敛留痕一致） | D-13 |

改动规模（估算）：**新建 3 个 client 源文件**（`CommandCard.tsx` ~85 行、`group-shape.ts` ~95 行、
`panel-failure.tsx` ~75 行）、**删除 4 个 client 源文件 + 1 个测试文件**（`ToolPanelGroups.tsx` 286、`SkillPanel.tsx` 172、
`DefaultsEditor.tsx` 203、`DefaultsSectionFrame.tsx` 65 行；`test/skill-panel.test.tsx`）、
**改 15 个源文件**（`ToolPanelAction.tsx` 重写 537→~330、`DefaultsGroupList.tsx` +130、`defaults-view.ts` +70、
`panel-controller.ts` −180、`panel-client.ts` −45、`WorkspaceDefaultsEditor.tsx` 273→~85、
`WorkspaceDefaultsPage.tsx` −55、`WorkspaceEntry.tsx` ±6、`locales.ts` ±50、`panel.module.css` ±20、
`contract.ts` −150、`host/types.ts` −18、`host/panel.ts` −45、`host/rpc.ts` −120、`host/index.ts` ±3）、**改 1 个测试文件为主 + 9 个测试文件按触达调整 + 1 个测试文件删除 +
1 个测试文件新建**、1 个 spec delta（7 条 MODIFIED）、`README.md` 8 处、两个 `lib/*.js` 重建。
**零新增依赖、零新增配置键、零新增座位、`dsh.client.inject` 不变。**

---

## ① 触达面清单

### 1.1 源码 · client 半（根仓 · 包 `plugins/session-tool-toggle`）

| 仓 / 包 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/ToolPanelAction.tsx` | 改（重写，537→约 330 行） | 六段平铺 → 三卡 + 页脚动作区；删两分区挂载与关闭集段 | 删 `StateSection`（改概要卡内联）、`DisabledSection`（拆三处）、`DefaultsEditor`/`WorkspaceDefaultsEditor` 两处挂载、`writeDefaults`/`defaultsSaved`/`workspaceFailure`；新增 `query` 本地态、三份 `useMemo`（`universe` / `counts` / `sessionList`）、命令卡与 footer 动作区；`errorKeyOf`/`failureParams`/`failureOf`/`FailureRow` 迁出到 `panel-failure.tsx`（本文件只 `import` 使用，不再定义也不再对外导出） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/CommandCard.tsx` | **新建**（约 85 行） | 命令卡唯一实现：代码块 + 复制按钮 + `aria-live` 反馈 + 软降级 | `export const COMMAND_PLACEHOLDER = '<address>'`；`CommandCardProps{title, note, commandText, copyLabel, copiedLabel, copyFailedLabel}`；内部 `copyState` 三态 + `COPY_RESET_MS = 2000` + `copyTimer` 清理；`navigator.clipboard` 缺席/拒绝走 `copyFailed`（不抛）；按钮文案恒定、成功态只置 `disabled`（沿用页面现状语义） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` | 改（−55 行） | 命令卡改用共用组件；卡片容器类更名 | 删 `copyState`/`copyTimer`/`scheduleCopyReset`/`copyCommand`/`copyFeedback`/`COMMAND_PLACEHOLDER`/`COPY_RESET_MS`（约 −60 行），命令卡段换成 `<CommandCard …/>`；`css.workspacePage` → `css.cardStack`；`PanelFailure` 改从 `./panel-failure.tsx` 导入；其余三卡与脚注**逐字不动** |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx` | 改（+约 130 行） | 吸收会话语义成为两形态共用的唯一清单 | 新增 `session?: SessionListState` 一个可选槽（`pending`/`effectiveDisabled`/`shadowedSkills`/`intentOnly`）；`copy?: DefaultsGroupCopy` 变可选（缺省按形态生成）；`DefaultsRow` 增 pending 标签、`checked` 走 `effectiveDisabled ?? disabledSet`、技能标签按形态分支；`DefaultsGroupRow` 增「整组已关 / 整组默认关」分支、会话形态的 `skill.blocked` 提示行、组头 intentOnly 标签；`ResidualChips` 文案走 `copy`（会话形态 = 「开启」） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/group-shape.ts` | **新建**（约 95 行） | 分组清单的共享形态与文案（从 `ToolPanelGroups.tsx` 迁出 + 新增会话词汇表） | `groupTitle(kind, t)`、`defaultExpanded(kind)` 原样迁入；`GroupListWording` 接口 + `wordingOf(session, t)` 返回两套词汇；`copyBundleOf(session, t)` 返回两套 `DefaultsGroupCopy`；纯模块（零 React、零 IO、只 `import type`） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/defaults-view.ts` | 改（+约 70 行） | 新增三个会话派生纯函数 | `skillAddressOf(name)`（`skill:${name}` 的唯一拼接点，替换 `skillEntryOf` 里的字面量）；`shadowedSkillAddressesOf(skills): ReadonlySet<string>`；`effectiveClosedOf(universe, disabled): ReadonlySet<string>`（整组地址在关闭集时把组内行地址一并算作关闭） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/panel-failure.tsx` | **新建**（约 75 行） | 失败文案形状与映射的唯一实现点（`DefaultsEditor.tsx` 删除后的落点） | `interface PanelFailure{text, detail?}`、`errorKeyOf(code): Key`、`failureParams(error): Record<string,string>|undefined`、`failureOf(error, t): PanelFailure|undefined`、`FailureRow({failure, className?})` 组件；`WorkspaceEntry.tsx` 不再从面板容器反向 import |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` | 改（273→约 85 行） | 收敛为 dialog-only 容器 | 删 `WorkspaceDefaultsVariant` 类型与 `variant` prop、删 `section` 分支（key/path/计数/scope/union/清空的平铺 JSX 与 `DefaultsSectionFrame` 用法）、删 `onRefresh` 的 `!dialog` 条件；保留 `armed` 状态机、`counts` memo（D11 口径不变）与 `WorkspaceDefaultsPage` 委托；`PanelFailure` 改 import 源 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/panel-controller.ts` | 改（−约 180 行） | 动作面收敛为会话级 | 删 `updateDefaults`/`refreshWorkspace`/`updateWorkspace`/`workspaceRequest`/`commitWorkspace`/`workspaceSeq`；`PanelState` 删 `defaults`/`defaultsError`/`workspace`/`workspaceChoices`/`savingDefaults`/`savingWorkspace`/`workspaceSaved`/`workspaceError` 八字段；`refresh`/`toggle`/`reset` 的 patch 去掉 `defaults:`/`workspace:` 两行；`close()` 只清 `error` |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/panel-client.ts` | 改（−约 45 行） | 四方法客户端 | 删 `updateDefaults` 成员与 `defaultsPayload` 助手；import 面去 `DEFAULTS_ENDPOINT`/`parseDefaultsValue`/`DefaultsAction`/`DefaultsRequest`/`DefaultsValue`；`workspace` 注释删「footer 下拉」表述（该下拉在 #36 已删） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` | 改（±6 行） | 跟随容器收缩 | 删 `variant="dialog"` 一处传参；`PanelFailure`/`failureOf` 的 import 改到 `./panel-failure.tsx`；其余（hook、三态寻址、`key` 重挂）**零改动** |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/locales.ts` | 改（+19 键 / −32 候选键，zh+en 各一份） | 会话面板词汇 + 死键清理 | 新增见 3.11；删除清单按「`grep -rn "'键'" src/ client/` 零引用」逐条执行，`locale-parity` 的 `REQUIRED_KEYS` 同步（§3.11） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/panel.module.css` | 改（±60 行） | 卡片容器共用 + 面板专属类清理 | `.workspacePage` 更名 `.cardStack`（同规则 `flex column / gap 16px`）；删 `.section`、`.sectionTitle`、`.section > .rows`、`.sectionFrame`（仅被删除的三处使用）；`.badge` 保留（页面登记徽章仍用），删 `.cardHeader .badge` 注释里「面板 intent 徽标」的旧说明；新增 0 个类 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/ToolPanelGroups.tsx` | **删除** | 清单并入共用组件 | 删除前把 `groupTitle`/`defaultExpanded` 迁到 `group-shape.ts`（`DefaultsGroupList.tsx:55` 是唯一外部引用点） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/SkillPanel.tsx` | **删除** | 技能并入清单卡 | `shadowed`/`blocked`/`unavailable` 三语义由 `SessionListState.shadowedSkills` + `DefaultsGroupList` 既有的整组关/技能降级分支承接 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/DefaultsEditor.tsx` | **删除** | 用户级默认档 GUI 退出面板 | `PanelFailure` 迁到 `panel-failure.tsx`（4 个 import 点：`WorkspaceEntry`/`WorkspaceDefaultsPage`/`WorkspaceDefaultsEditor`/`ToolPanelAction`） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/DefaultsSectionFrame.tsx` | **删除** | 面板折叠壳只服务两个已删分区 | 无其他调用点 |

### 1.2 源码 · 契约与宿主（根仓 · 包 `plugins/session-tool-toggle`）

| 仓 / 包 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/contract.ts` | 改（−约 190 行） | 端点 5→4、面板快照瘦两字段、workspace 端点 P-1=b 收缩 | 删 `DEFAULTS_ENDPOINT`、`DEFAULTS_ACTIONS`/`DefaultsAction`、`DefaultsRequest`、`DefaultsValue`、`parseDefaultsRequest`、`parseDefaultsValue`、`REQUEST_PARSERS.defaults`；`ENDPOINTS` 收敛为 `['panel','toggle','reset','workspace']`；`PanelSnapshot` 删 `defaults`/`workspace`；`readPanelSnapshot` 删两段校验；**P-1=b**：`WorkspaceRequest` 删 `sessionId` 字段、`parseWorkspaceRequest` 只接受 `{workspacePath}`、`WorkspaceValue` 删 `choices`、删 `WorkspaceChoice`/`readWorkspaceChoice`、`parseWorkspaceValue` 去 `choices` 段。**保留**：`DefaultsView`（`PanelReading.defaults` 仍用）、`WorkspaceView`/`WorkspaceValue`（`workspace` 端点）、`defaults-unwritable` 失败码 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/host/types.ts` | 改（−约 18 行） | 输入面同步收缩 | `PanelInputs` 删 `defaults`/`defaultsPath`/`defaultsReadable`/`defaultsCorrupt`/`workspace?` 五字段；`WorkspacePanelInputs` 接口整段删除（唯一消费方是 `panel.ts` 的私有 `workspaceViewOf`） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/host/panel.ts` | 改（−约 45 行） | 快照构建器不再产出两个默认档视图 | `PanelSnapshot` 删 `defaults`/`workspace`；`buildPanelSnapshot` 删 `defaults:{…}` 与 `workspace: workspaceViewOf(...)` 两处组装；`noticesOf` 删 `if (inputs.defaultsCorrupt) …`；删私有 `workspaceViewOf`（`:640`）；`intentOnly` 计算**保留**（见 3.1） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/host/rpc.ts` | 改（−约 150 行） | 删 `defaults` 端点 + 快照读取少一次默认档探测 + workspace 端点 P-1=b 收缩 | 删 `handleDefaults`、`writeDefaultsOf`、`defaultsStateOf`；`dispatch` 删 `case 'defaults'`；`snapshotOf` 删 `const defaultsState = await defaultsStateOf(...)` 与 `defaults*`/`workspace` 五个 inputs 键；`RpcDeps` 删 `defaultsIo`/`defaultsPath`；`canReadFile` 保留（`workspaceFileOf` 仍用）；**P-1=b**：删 `resolveWorkspace` 的 `{sessionId}` 分支与 `attributionOf`、`universeOfTarget` 收敛为恒工作区宇宙、两处 `WorkspaceValue` 组装去 `choices`（`choicesOf` 转私有登记查询、`liveSessionOf` 保留） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/host/index.ts` | 改（约 3 行） | 装配面跟随 `RpcDeps` 收缩 | `rpc.handle` 的 deps 对象去掉 `defaultsIo`/`defaultsPath` 两项；端点日志走 `ENDPOINTS.join(' / ')` 自动变四段（`:874` 无需改值，只核注释） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/src/client/index.ts` | **零改动** | 两个座位软注册、注入面、`connection` 现取纪律全部不变 | — |

### 1.3 测试（根仓 · 包 `plugins/session-tool-toggle`）

| 仓 / 包 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/tool-panel.test.tsx` | 改（重写为主，35 用例 → 约 30） | 面板三卡的唯一主验收套件 | 删「默认档两分区默认收起/展开/开关（`updateDefaults`）/工作区档开关（`workspace`）/默认档无添加输入」共 11 用例；新增三卡构成、概要卡事实与三计数、清单卡过滤/整组关/技能标签/pending/残留开启、命令卡复制、footer 两段式恢复；夹具 `PanelSnapshot` 去掉 `defaults`/`workspace` 两键 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/defaults-group-list.test.tsx` | **新建**（约 200 行） | 共用清单的两形态契约（此前只有间接覆盖） | 默认档形态：`session` 缺省时 DOM 与文案沿用 `defaults.*`（零回归锚点，断言「整组默认关」标签与「移除」按钮）；会话形态：pending/effectiveDisabled/shadowedSkills/intentOnly 四槽各一条、`skill.blocked` 提示行、残留在会话形态下按钮文案为「开启」 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/panel-controller.test.ts` | 改（−约 15 用例） | 动作面收敛 | 删 `updateDefaults`/`refreshWorkspace`/`updateWorkspace` 三组（含 `saving*`/`workspaceChoices`/`*Saved`/`*Error` 断言）；新增 `expect('updateDefaults' in controller).toBe(false)` 与「`refresh` 后状态无 `defaults`/`workspace` 键」 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/panel-client.test.ts` | 改（−5 用例） | 四方法客户端 | 删 `updateDefaults` 五例（payload 精确性、reset 不带地址、失败码）；保留 `workspace` 两例；`PanelClient` 类型面不再有该方法（编译期兜底） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/wire-contract.test.ts` | 改（−约 8 用例） | 契约形状 | 删 `DEFAULTS_*` 常量与 `parseDefaults*` 用例、`ENDPOINTS` 长度断言改 4；`parsePanelSnapshot` 三向：新形状接受、**多余字段（旧宿主的 `defaults`/`workspace`）接受**、缺 `groups` 拒绝 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/rpc.test.ts` | 改（−约 6 用例） | 宿主端点面 | 删 `handleDefaults` 组；`dispatch('defaults', …)` 改为「未知端点 → `bad-request` 且 message 含『未知端点』」；快照断言删 `defaults`/`workspace`；`RpcDeps` 夹具去 `defaultsIo`/`defaultsPath` |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/panel.test.ts` | 改（−约 8 断言） | 快照构建器 | 删 `defaults`/`workspace` 相关断言；`intentOnly` 断言**保留**（字段仍在线上，见 D-10） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/defaults-view.test.ts` | 改（+约 70 行） | 新纯函数 | `skillAddressOf` 单点、`shadowedSkillAddressesOf`（空/有）、`effectiveClosedOf`（整组关 → 组内行入集；内置组 `address:null` 不受影响；`disabled` 原条目全部保留） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/workspace-editor.test.tsx` | 改（−约 10 用例，+2） | 分节侧回归 | 删 `variant='section'` 与 `DefaultsSectionFrame` 用例；命令卡断言改按 `CommandCard` 文案与复制行为；`WorkspaceDefaultsEditor` 不再接受 `variant`（编译期） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/skill-panel.test.tsx` | **删除** | 组件已删 | 10 个用例的语义迁入 `defaults-group-list.test.tsx`（会话形态）与 `tool-panel.test.tsx`（清单卡内的技能组） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/workspace-attribution.test.ts` | 改（P-1=b，删 RPC 侧 attribution 断言） | attribution 收缩 | 删「workspace 端点按 `{sessionId}` 归属」组用例；`{workspacePath}` 归属与未登记失败用例保留 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/workspace-universe.test.ts` | 改（P-1=b，删 session 宇宙分支用例） | 宇宙收敛 | 删 `universeOf(deps, session)` 分支用例；`readWorkspaceUniverseOf` 的工作区宇宙用例全部保留 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/locale-parity.test.ts` | 改（±约 35 行） | `REQUIRED_KEYS` 跟随面板真读面 | 删已死键条目、加新键；`SECTION_3_5` 表**零改动**（失败码集合不变） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/bundle.test.ts` | 改（约 6 行） | 产物面 | `expect(ENDPOINTS).toHaveLength(4)`；`INLINED_MARKERS` 去 `DEFAULTS_ENDPOINT`；`WORKSPACE_ENDPOINT` 字面量仍钉住 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/client-index.test.ts` | **零改动**（复核） | 两个座位注册与注入面不变 | 若某断言按「五端点」写则同步（本会话核对：该文件只断座位/注入面/桥接，无端点计数） |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/test/commands.test.ts` | **零改动**（复核） | `/tools` 命令面全部保留 | 该文件的 `defaults` 引用是 `/tools default` 命令语义，不在本次触达面 |
| 根仓 · session-tool-toggle | `tsconfig.host.json` / `tsconfig.client.json` | **零改动** | `include` 覆盖方式已足够 | client 段含目录 `src/client` 与 `test/**/*.test.tsx`（新文件自动纳入）；host 段无新增文件；删除的测试文件仍被 glob 覆盖 |

### 1.4 规范与文档

| 仓 | 文件 | 类型 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| 根仓 | `openspec/changes/2026-11-09-session-tool-panel-rework/specs/dsh-session-tool-toggle/spec.md` | **新建**（delta） | 7 条 requirement 的 MODIFIED delta | 见 TG1；`# Spec Delta` + `## MODIFIED Requirements` 单段（沿用 `2026-11-09-session-manager-info-display` 的 delta 形状），**requirement 标题逐字沿用**（改名会让 strict 校验把 MODIFIED 视作新增） |
| 根仓 | `openspec/changes/2026-11-09-session-tool-panel-rework/{proposal.md,design.md,tasks.md,.openspec.yaml}` | 其他阶段产物 | 本设计**不写** | `pnpm spec:check` 要求四件套齐备才能通过（TG1 前提） |
| 根仓 | `openspec/specs/dsh-session-tool-toggle/spec.md` | **本次不改** | 能力真源；归档时由 OpenSpec 把 delta 合入 | 实施期手改会与 delta 双写 |
| 根仓 | `openspec/specs/dsh-workspace-config-entry/spec.md` | **零改动** | 结论已核对仍成立 | `:34`「session-tool-toggle 的会话头部面板与 `/tools` 命令面 SHALL 保留且与面板共用同一状态」仍真；`:104-110` 的「工作区默认档分节」指页面分节，不在面板侧 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/README.md` | 改 8 处 | 用户可见构成与运维事实 | ①`:3`/`:5` 面板描述去「默认档分区」；②`:18` 目录结构（删三文件、加三文件、去「两个默认档分区」）；③`:79-81` 「Web 面板」段的六段布局 → 三卡；④`:87` 五端点 → 四端点 + 面板不提供默认档编辑面；⑤`:89` 「两档都不追溯」段改写为「用户级只有命令、工作区级只在统一页分节」；⑥`:91` 「面板能做的只有…」重列（去两项默认档）；⑦`:95-108` 降级表三行改写：`:102` 技能服务行改「技能组只保留整档开关 + 降级提示」、`:107` 默认档损坏行改「启动 warn + `/tools default status`」（面板不再提示）、`:108` 工作区档损坏行改「统一页分节显示」；⑧`:128-131` 三处「面板两个默认档分区」表述删除 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/package.json` | **零改动** | 无依赖/端点声明 | `dsh.client.inject` 仍 `['slots','locale']` |

### 1.5 产物（根仓 · 包 `plugins/session-tool-toggle`，随仓库提交）

| 仓 / 包 | 文件 | 类型 | 说明 |
| --- | --- | --- | --- |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/lib/index.js` | 重建 | 宿主半：四个端点的分发表、无 `handleDefaults`、快照无两字段 |
| 根仓 · session-tool-toggle | `plugins/session-tool-toggle/lib/client.js` | 重建 | 浏览器半：三卡容器 + 共用清单 + `CommandCard` + 删除文件的痕迹为零；`require` 词集合不变（仍 `react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`） |

### 1.6 明确零改动面（写出来是为了让实施期不接受「顺手也改一下」）

- **宿主状态内核**：`src/host/{control.ts,state.ts,workspaces.ts,defaults.ts,mask.ts,session-layer.ts,skills-plan.ts,address.ts,attribution.ts,record-store.ts,commands.ts}` 全部零改动。`readPanel`（`control.ts:494`）仍产出 `defaults`/`workspace` 两个读数——`/tools status`、`/tools default status`、`/tools workspace status` 与 `workspace` 端点继续消费它们。
- **`workspace` 端点（P-1=b 收缩）**：`{sessionId}` 寻址形态与响应 `choices` 字段**本次一并删除**（唯一客户端消费方已随面板分区消失，用户拍板）；`{workspacePath}` 寻址、`universe` 字段、内部登记查询（`choicesOf` 改私有用途）保留（见 D-02 第 4 项修订）。
- **`skills-plan.ts` 的 `intentOnly`**（`:57`/`:84`/`:98`）与 `PanelSnapshot.intentOnly`（`panel.ts:257`）同名不同物：前者是技能遮蔽计划读数，不在触达面；后者保留在线上并被新面板消费（D-10）。
- **座位与装配**：`src/client/index.ts`、`src/client/seats.ts`、`cordis.patch.yml`、`build.mjs`、`tsconfig.*.json`、`plugins/workspace-config/**`（holder）、其余六个包、仓级 `scripts/**` 与 `tooling/**`。
- **命令面**：`/tools` 全部子命令（含 `default` / `workspace` 的查看与增删）语义与文案零改动。
- **失败码集合**：`HOST_FAILURE_CODES` 11 项（含 `defaults-unwritable`）与 `TRANSPORT_FAILURE_CODES` 2 项零改动（D-02 的被否方案 B）。

---

## ② 证据锚

> 每条都是**代码事实**（本会话逐行读出），不是探索散文。

### 2.1 client 半（`plugins/session-tool-toggle/src/client`）

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 六段布局 | `ToolPanelAction.tsx:17-25`（模块注释逐段列出六段）、`:458`（`StateSection` 挂载）、`:459-470`（本会话开关 `<section>`）、`:471-488`（技能 `<section>`）、`:489-503`（`WorkspaceDefaultsEditor variant='section'`）、`:504-514`（`DefaultsEditor`）、`:515-531`（`DisabledSection`） | 段序与删除点的一一对应 |
| 概要素材 | `ToolPanelAction.tsx:212-237`（`StateSection`：两计数 `ul`、`meta` 三句、`kvDelta`、notices） | 概要卡的事实行映射来源（D-06） |
| 关闭集段 | `ToolPanelAction.tsx:252-320`（chip + `badge.intent` + 「开启」+ 「恢复创建时快照」的 `armed` 两段式） | 三处拆并（Q4）的原始信息面：计数 `:219`、chip `:278-303`、reset `:305-317` |
| footer | `ToolPanelAction.tsx:396-420`（左刷新右关闭） | 刷新移位与动作区落点的对照 |
| 失败映射 | `ToolPanelAction.tsx:112-146`（`errorKeyOf` / `failureParams` / `failureOf`）、`:190-197`（`FailureRow`） | 迁到 `panel-failure.tsx` 的三件套 + 组件 |
| 宇宙投影 | `ToolPanelAction.tsx:361-364`（`universeOfSnapshot` 的唯一调用点）、`:69`（`EMPTY_UNIVERSE`） | 面板清单卡复用同一投影（D-03）；`:69` 的常量在无快照分支继续用 |
| 三卡参照物 | `WorkspaceDefaultsPage.tsx:184`（`.workspacePage` 根）、`:186-241`（概要卡）、`:244-329`（清单卡）、`:332-357`（命令卡）、`:360-363`（脚注）、`:366-376`（页脚动作区） | 面板三卡的卡内结构逐节对照 |
| 复制状态机 | `WorkspaceDefaultsPage.tsx:52-56`（`CopyState`/`COPY_RESET_MS`）、`:128-133`（本地态 + 定时器清理）、`:159-181`（复位与软降级）、`:342-356`（按钮+`aria-live`） | 抽 `CommandCard` 的搬移清单（D-05） |
| 命令文本 | `WorkspaceDefaultsPage.tsx:144-146`（`# {key}` + `/tools workspace off <address>`）、`:59`（`COMMAND_PLACEHOLDER`） | 面板命令文本的同构蓝本 |
| 共用清单 | `DefaultsGroupList.tsx:87-113`（props 九字段）、`:105-112`（`query`/`showDetails` 的页面能力注释）、`:265-336`（`DefaultsRow`：锁态/整组关/受控 `Switch`）、`:399`（`blocked = disabledSet.has(group.address)`）、`:481-493`（内置组本地过滤框）、`:536-561`（`ResidualChips` 只可移除）、`:596-604`（层未就绪降级） | 会话槽的插入点与不变量（D-03/D-04） |
| 分组形态纯函数 | `ToolPanelGroups.tsx:72-81`（`groupTitle`）、`:91-93`（`defaultExpanded`）；唯一外部引用 `DefaultsGroupList.tsx:55` | 删除前必须迁移的两个函数 |
| 会话语义来源 | `SkillPanel.tsx:6-13`（`disabled`=意图 / `shadowed`=实际生效）、`:106-110`（两态标签）、`:142-148`（`unavailable` 整块降级）、`:152`（`blocked` 提示） | `shadowedSkills` 槽与「已记录未生效」标签的语义来源 |
| pending 语义 | `ToolPanelGroups.tsx:145`（行 `toggle.pending`）、`:192-193`（组 pending）、`:139`（`busy` 全局禁用） | `pending` 槽的三处落点 |
| `PanelFailure` 归属 | `DefaultsEditor.tsx:56-61`（接口定义）、`WorkspaceEntry.tsx:52,55`（type + `failureOf` 的 import）、`WorkspaceDefaultsPage.tsx:43`、`WorkspaceDefaultsEditor.tsx:53` | 四处 import 决定迁移而非就地删 |
| 两分区折叠壳 | `DefaultsSectionFrame.tsx:41-63`（`useState(false)` 默认收起） | 删除范围 |
| variant 双形态 | `WorkspaceDefaultsEditor.tsx:65,135,243-272`（`variant` / `dialog` 判定 / section 分支） | 收敛为 dialog-only 的分支点 |
| 控制器动作面 | `panel-controller.ts:72-97`（八个默认档/工作区状态字段）、`:384-400`（`updateDefaults`）、`:412-431`（`refreshWorkspace`）、`:448-478`（`updateWorkspace`）、`:581-591`（`workspaceRequest`）、`:566-569`（`commitWorkspace`） | 收缩清单 |
| 客户端方法面 | `panel-client.ts:89-131`（五方法接口）、`:120`（`updateDefaults`）、`:196-199`（`defaultsPayload`） | 收缩清单 |
| 座位注册 | `client/index.ts:180-198`（头部）、`:203-227`（分节）、`:164-177`（`ports`） | 零改动面 |

### 2.2 契约与宿主（`plugins/session-tool-toggle/src`）

| 模块 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| 端点表 | `contract.ts:28-60`（`CHANNEL` + 五端点 + `ENDPOINTS`）、`:40`（`DEFAULTS_ENDPOINT`）、`:51-60`（`ENDPOINTS` 数组 + 端点类型） | 5→4 的唯一权威 |
| 默认档端点族 | `contract.ts:63-66`（`DEFAULTS_ACTIONS`/`DefaultsAction`）、`:225-236`（`DefaultsRequest`）、`:432-437`（`DefaultsValue`）、`:987-1020`（`parseDefaultsRequest`）、`:1759-1777`（`parseDefaultsValue`）、`:1097-1103`（`REQUEST_PARSERS`） | 删除清单 |
| 面板快照契约 | `contract.ts:362-385`（`PanelSnapshot` 含 `defaults`/`workspace`）、`:1730-1734`（`parsePanelSnapshot`） | 两字段删除点 |
| 解析严格度 | `contract.ts` 的 `readObject`（只判对象，**不拒绝未知键**） | 「新 client + 旧宿主」可行的证据（D-02 降级面） |
| 快照构建 | `host/panel.ts:250`（`defaults`）、`:257`（`intentOnly`）、`:290-311`（`intentOnly` 三分计算）、`:326-345`（返回体：两字段组装）、`:640`（私有 `workspaceViewOf`）、`:856-861`（`noticesOf` 的 `defaultsCorrupt` 分支）、`:93`（`NOTICE_ORDER` 含 `defaults-corrupt`） | 宿主侧删除点；`intentOnly` 保留点 |
| 输入面 | `host/types.ts:449-460`（`WorkspacePanelInputs`）、`:468-507`（`PanelInputs` 的五个默认档/工作区字段） | 收缩点 |
| 端点实现 | `host/rpc.ts:273-286`（`dispatch` 的 switch）、`:344-369`（`handleDefaults`）、`:825-860`（`snapshotOf`：`:837` 默认档探测、`:850-851` 两字段）、`:1047-1062`（`defaultsStateOf`）、`:1064`（`canReadFile`，`:585` 仍被工作区路径用）、`:1221-1240`（`writeDefaultsOf`） | 删除清单与「保留 `canReadFile`」的依据 |
| 命令面读数 | `host/control.ts:205-250`（`PanelReading` 含 `defaults`/`defaultsPath`）、`:494-560`（`readPanel` 仍算 `defaults` 与 `workspace`） | 「快照瘦身不动命令面」的边界证据 |
| 装配 | `host/index.ts:874`（`已挂载 RPC 通道 … 端点 ${ENDPOINTS.join(' / ')}`） | 日志自动收敛，无需改值 |
| 测试锚 | `test/bundle.test.ts:74`（`ENDPOINTS` 长 5）、`:33-45`（`INLINED_MARKERS` 含 `DEFAULTS_ENDPOINT`）、`test/locale-parity.test.ts:70-160`（`REQUIRED_KEYS`） | 门禁侧必须同步的两处硬断言 |

### 2.3 上游与夹具（只读依赖，零改动）

| 对象 | 证据 | 在设计里的作用 |
| --- | --- | --- |
| `Modal` 原语 | `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal`（`title`/`description`/`footer`/`className`/`contentClassName`/`closeLabel`），本包已在 `ToolPanelAction.tsx:439-450` 用全 | 三卡 + 页脚动作区的容器能力已具备，**无需新原语** |
| `Input` 原语 | 本包已在 `WorkspaceDefaultsPage.tsx:249-257` 与 `DefaultsGroupList.tsx:483-491` 使用 | 清单卡全局过滤框复用，零新增 |
| 测试替身 | `test/stubs/ui-primitives.tsx`（薄 re-export `@dsh-plugins/test-kit/ui-primitives`）、`test/tool-panel.test.tsx:100-120`（`translate` + `tool()` 夹具） | 新用例沿用同一夹具底座，零替身改动 |
| 页面用例挂载点 | `test/workspace-editor.test.tsx`（渲染 `WorkspaceDefaultsEditor`；`WorkspaceDefaultsPage` 无直接单测文件） | 命令卡抽取的回归面就落在这里 |
| holder 契约 | `openspec/specs/dsh-workspace-config-entry/spec.md:34,104-110` | 证明 holder 侧零改动 |

---

## ③ 接口与数据形状

### 3.1 面板快照瘦身（`src/contract.ts` + `src/host/{types,panel,rpc}.ts`）

删除（**线上契约变更**，破坏性，理由见 D-02）：

```ts
// 旧（删）—— contract.ts:362-385
export interface PanelSnapshot {
  // …保留 sessionId / createdAt / state / groups / protectedNames / intentOnly / stats / notices / skills
  readonly defaults: DefaultsView          // ← 删
  readonly workspace: WorkspaceView | null // ← 删
}
```

删除后 `PanelSnapshot` 的字段集合（**无新增字段**）：

```ts
export interface PanelSnapshot {
  readonly sessionId: string
  readonly createdAt: number
  readonly state: StateView            // disabled / snapshot / seeded / updatedAt / storeKind
  readonly groups: readonly ToolGroup[]
  readonly protectedNames: readonly string[]
  readonly intentOnly: readonly string[]   // 保留：面板清单行的「暂无匹配」标签要用（D-10）
  readonly stats: StatsView                // visible / denied
  readonly notices: readonly NoticeView[]
  readonly skills: readonly SkillView[]
}
```

`intentOnly` 的消费方式变了但字段不动：旧面板把它当 chip 徽标（`ToolPanelAction.tsx:284-286`），新面板把它当**清单行/组头标签**（3.3 的 `SessionListState.intentOnly`）。这条选择让「关闭地址当前命中 0 个注册名」这条事实在界面上不丢失（Q4 的「信息零丢失」要求）。

宿主侧删除点：`host/types.ts` 的 `PanelInputs` 去 5 字段、删 `WorkspacePanelInputs`；`host/panel.ts` 返回体去两项、删私有 `workspaceViewOf`（`:640`）、`noticesOf` 去 `defaultsCorrupt` 分支；`host/rpc.ts` 的 `snapshotOf` 去 `defaultsStateOf` 探测与六个 inputs 键。**`PanelReading` 不动**（命令面与 `workspace` 端点继续用它）。

### 3.2 端点收敛 5 → 4（`src/contract.ts` + `src/host/rpc.ts` + `src/client/panel-client.ts`）

```ts
// contract.ts:51-60（改后）
export const ENDPOINTS = ['panel', 'toggle', 'reset', 'workspace'] as const
export type SessionToolToggleEndpoint = (typeof ENDPOINTS)[number]
```

删除项（逐条）：`DEFAULTS_ENDPOINT`、`DEFAULTS_ACTIONS`、`DefaultsAction`、`DefaultsRequest`、`DefaultsValue`、`parseDefaultsRequest`、`parseDefaultsValue`、`REQUEST_PARSERS['defaults']`、`dispatch` 的 `case 'defaults'`、`handleDefaults`、`writeDefaultsOf`、`defaultsStateOf`、`RpcDeps.defaultsIo`、`RpcDeps.defaultsPath`、`PanelClient.updateDefaults`、`defaultsPayload`。

保留项：`DefaultsView`（`PanelReading.defaults` 与 `/tools default status` 用）、`HOST_FAILURE_CODES` 不变（含 `defaults-unwritable`，D-02 被否方案 B）、`canReadFile`（`workspaceFileOf` 仍用，`rpc.ts:585`）。

```ts
// panel-client.ts（改后）——四方法
export interface PanelClient {
  panel(sessionId: string): Promise<PanelSnapshot>
  toggle(sessionId: string, on: boolean, addresses: readonly string[]): Promise<ToggleValue>
  reset(sessionId: string): Promise<ResetValue>
  workspace(request: WorkspaceRequest): Promise<WorkspaceValue>
}
```

### 3.3 `DefaultsGroupList` 的会话槽（`src/client/DefaultsGroupList.tsx`）

```ts
/** 会话形态的四个语义槽（面板独有；给了 `session` 就切会话文案与语义，缺省 = 默认档形态）。 */
export interface SessionListState {
  /** 在途开关地址（逐行/逐组禁用 + 「正在应用…」标签）。 */
  readonly pending: ReadonlySet<string>
  /** 行开关的「有效关闭」集合：整组关时组内行也在此集（`checked` 用它，而不是 `disabled`）。 */
  readonly effectiveDisabled: ReadonlySet<string>
  /** 影子 stub 已生效的技能地址（区分「模型不可见」与「已记录未生效」）。 */
  readonly shadowedSkills: ReadonlySet<string>
  /** 命中 0 个注册名的关闭地址（行/组头的「暂无匹配」标签）。 */
  readonly intentOnly: ReadonlySet<string>
}

export interface DefaultsGroupListProps {
  readonly universe: DefaultsUniverse | null
  readonly disabled: readonly string[]
  readonly busy: boolean
  readonly onToggle: (address: string, on: boolean) => void
  /** 残留区 / 降级文案束；缺省 = 按形态生成（`wordingOf`/`copyBundleOf`）。 */
  readonly copy?: DefaultsGroupCopy
  readonly t: Translate
  readonly query?: string
  readonly showDetails?: boolean
  /** 会话形态（面板）：语义槽 + 文案形态一起切（缺省 = 默认档，页面与工作区档容器零改动）。 */
  readonly session?: SessionListState
}
```

形态差异表（同一组件内，一处分支）：

| 事实 | 默认档形态（缺省） | 会话形态（`session` 给出） |
| --- | --- | --- |
| 行开关 `checked` | `!disabledSet.has(entry.address)` | `!effectiveDisabled.has(entry.address)` |
| 行禁用 | `busy ∨ 锁态 ∨ blocked` | 同上 `∨ pending.has(address)` |
| 行内 pending 标签 | 无 | `toggle.pending`（「正在应用…」） |
| 整组关标签 | `defaults.groupOff`（「整组默认关」） | `session.groupOff`（「整组已关」） |
| 组头计数 | `defaults.groupCount` + `defaults.groupInDefaults` | `group.toolCount` + `group.disabledCount` |
| 组头 `title` | `defaults.groupSummary` | `group.summary` |
| 行/组开关可访问名 | `defaults.switchLabel` / `defaults.groupSwitchLabel` | `switch.label` |
| 技能行「在关闭集」标签 | `entry.skillHidden`（「新会话默认隐藏」） | `shadowedSkills` 命中 → `skill.effective`；否则 `skill.intentOnly` |
| `tool:skill` 整组关 | 行禁用 + 整组关标签 | 同上 + 组内一句 `skill.blocked` 提示 |
| 「暂无匹配」标签 | 不适用（默认档形态没有该槽） | `session.intentOnly` 命中 → `entry.intentOnly`（「暂无匹配」），`title` = `disabled.intentOnly`（一句解释） |
| 残留区标题/按钮 | `defaults.residualTitle` / `defaults.remove`（「移除」） | `session.residualTitle` / `disabled.enable`（「开启」） |
| 残留 chip 动作 | `onToggle(address, true)` = 移出档 | `onToggle(address, true)` = 移出关闭集（**同一调用，语义同名**） |
| 空组行空态 | `panel.empty` | `panel.empty`（不变） |

**不变量（默认档形态零回归）**：`session` 缺省时 `checked`/禁用判定/标签/类名与当前 `DOM` 逐字一致（`DefaultsGroupList.tsx:302-310` 的单行分支与 `:311-335` 的两列分支都不动结构）。

```ts
// group-shape.ts（新建，纯模块）
export function groupTitle(kind: ToolGroupKind, t: Translate): string      // 从 ToolPanelGroups.tsx:72-81 迁入
export function defaultExpanded(kind: ToolGroupKind): boolean             // 从 ToolPanelGroups.tsx:91-93 迁入
export interface GroupListWording {
  readonly groupCount: (count: number, inDisabled: number) => string
  readonly groupSummary: (count: number, inDisabled: number) => string
  readonly groupOff: string
  readonly rowSwitchLabel: (name: string) => string
  readonly groupSwitchLabel: (name: string) => string
  readonly pending: string
  readonly skillEffective: string
  readonly skillIntentOnly: string
  readonly skillHidden: string
  readonly skillBlocked: string
  readonly filterEmpty: (query: string) => string
  readonly emptyRow: string
}
export function wordingOf(session: boolean, t: Translate): GroupListWording
export function copyBundleOf(session: boolean, t: Translate): DefaultsGroupCopy
```

> 两套键的插值名不一致，差异在 `wordingOf` 内部抹平：统一按 `{ count, disabled, inDefaults }` 三个参数调用 `t`（多传的键不会出现在文案里）。事实依据：`group.summary` 用 `{disabled}`（`ToolPanelGroups.tsx:203`），`defaults.groupSummary` 用 `{inDefaults}`（`DefaultsGroupList.tsx:446`），函数签名因此可以共用。

`copy` 缺省策略：`copy ?? copyBundleOf(session !== undefined, t)`。页面与（收缩后的）工作区档容器显式传 `copy` 的现状**不变**，故默认档形态的文案锚点不受影响。

### 3.4 会话派生纯函数（`src/client/defaults-view.ts`）

```ts
/** 技能地址的唯一拼接点（`skill:<name>`；替换 skillEntryOf 里的模板字面量）。 */
export function skillAddressOf(name: string): string

/** 影子 stub 已生效的技能地址集合（`SkillView.shadowed` → `skill:<name>`）。 */
export function shadowedSkillAddressesOf(skills: readonly SkillView[]): ReadonlySet<string>

/**
 * 有效关闭集：`disabled` 原样 ∪ 「整组地址在 `disabled` 里时该组全部行地址」。
 * 内置组（`address === null`）不受整组影响；宇宙为 null / 未就绪时退化为 `new Set(disabled)`。
 */
export function effectiveClosedOf(
  universe: DefaultsUniverse | null,
  disabled: readonly string[],
): ReadonlySet<string>
```

三条都是纯函数（不读时钟、不做 IO、同输入两次调用深相等），与既有 `switchAddressesOf`/`defaultsCountsOf`/`residualOf`/`filterDefaultsView` 同一纪律。

### 3.5 `CommandCard`（`src/client/CommandCard.tsx`，新建）

```ts
/** 命令模板里留给用户替换的地址占位符（命令语法是 ASCII）。 */
export const COMMAND_PLACEHOLDER = '<address>'

export interface CommandCardProps {
  /** 卡标题（页面 `workspace.commandTitle` / 面板 `session.commandTitle`）。 */
  readonly title: string
  /** 语义与边界说明（恒定显示）。 */
  readonly note: string
  /** 代码块文本 = 复制文本（可多行，含 `#` 注释行）。 */
  readonly commandText: string
  /** 复制按钮的恒定文案。 */
  readonly copyLabel: string
  /** `aria-live` 播报的「已复制」。 */
  readonly copiedLabel: string
  /** `aria-live` 播报的「复制失败」。 */
  readonly copyFailedLabel: string
}

export function CommandCard(props: CommandCardProps): ReactNode
```

行为契约（逐字搬自页面，页面因此 −60 行）：`copyState: 'idle'|'copied'|'failed'`、`COPY_RESET_MS = 2000`、连续点击只锚最后一次、`navigator.clipboard` 缺席或拒绝 → `failed`（不抛）、按钮文案恒定（成功态只 `disabled`）、反馈只由 `.note[aria-live=polite]` 播报。零 `t` 依赖（文案全由 props 进）。

### 3.6 面板容器（`src/client/ToolPanelAction.tsx`）的三卡形状

```
Modal(title=panel.title, description=panel.description, footer=<动作区>, className=dialog, contentClassName=content)
└─ div.cardStack
   ├─ [可选] FailureRow(panelFailure)                     ← 旧快照 + 错误行（stale-while-revalidate 保留）
   ├─ 卡1 概要 div.card
   │  ├─ div.cardHeader: p.cardTitle(session.title) + span.push + Button(ghost, refresh)
   │  ├─ dl.facts ×4: session.id / session.createdAt / session.snapshotCount / session.store
   │  ├─ ul.counters ×3: state.visible / state.denied / state.closedCount
   │  ├─ [可选] p.notice(mutation.kv, kvDelta>0)
   │  └─ notices.map → p.warning | p.notice          （persistence-degraded 走 warning）
   ├─ 卡2 清单 div.card
   │  ├─ div.cardHeader: p.cardTitle(section.groups) + [listed>0] Input.pageFilter(query)
   │  ├─ p.note(session.listHint)
   │  ├─ DefaultsGroupList(universe, disabled=state.disabled, busy=state.resetting,
   │  │                    session={pending,effectiveDisabled,shadowedSkills,intentOnly},
   │  │                    query, showDetails, onToggle=controller.toggle, t)
   │  └─ [listed===0 ∧ residual===0] div.emptyBlock: p.emptyTitle(panel.empty)
   └─ 卡3 命令 CommandCard(session.commandTitle, session.commandNote, commandText, command.*)
```

`footer`（Modal 的 `footer` 槽，`ToolPanelAction.tsx:396-420` 的替换）：

```
[恢复创建时快照 | 再点一次确认恢复]   ← disabled = resetting ∨ closed===0；两段式确认在本容器
[关闭]                                ← controller.close()
```

派生（容器内，全部 `useMemo`，无 controller 扩展）：

```ts
const universe = useMemo(() => (snapshot === undefined ? EMPTY_UNIVERSE : universeOfSnapshot(snapshot)), [snapshot])
const disabled = snapshot?.state.disabled ?? EMPTY_DISABLED
const counts = useMemo(() => defaultsCountsOf(universe, disabled), [universe, disabled])
const session = useMemo<SessionListState | undefined>(() => snapshot === undefined ? undefined : ({
  pending: state.pending,
  effectiveDisabled: effectiveClosedOf(universe, disabled),
  shadowedSkills: shadowedSkillAddressesOf(snapshot.skills),
  intentOnly: new Set(snapshot.intentOnly),
}), [snapshot, universe, disabled, state.pending])
const commandText = `# ${t('session.commandComment')}\n/tools off ${COMMAND_PLACEHOLDER}`
```

`panel.description`（`locales.ts:47`「本会话内可用的工具与开关；改动只影响本会话之后的模型步骤。」）**兼任脚注**：面板不设独立脚注块（页面脚注的两句里，`workspace.union` 在会话面不适用），见 D-06。

### 3.7 `PanelState` 收缩（`src/client/panel-controller.ts`）

```ts
export interface PanelState {
  readonly phase: PanelPhase                    // idle | loading | ready | failed
  readonly snapshot?: PanelSnapshot
  readonly error?: PanelError
  readonly pending: ReadonlySet<string>
  readonly resetting: boolean
  readonly loadedAt: number
}
```

删除字段：`defaults` / `defaultsError` / `workspace` / `workspaceChoices` / `savingDefaults` / `savingWorkspace` / `workspaceSaved` / `workspaceError`。删除方法：`updateDefaults` / `refreshWorkspace` / `updateWorkspace` / `workspaceRequest` / `commitWorkspace`。删除私有字段：`workspaceSeq`。保留：`open`/`close`/`refresh`/`toggle`/`reset`/`subscribe`/`getSnapshot`/`dispose` 与四类刷新触发（`open`/mutation 回执/`command/executed`/`focus`）——`focus` 与 `command/executed` 仍只驱动 `refresh()`。

### 3.8 文案键（`src/client/locales.ts`）

新增 19 键（zh 为 canonical，en 同键）：

| 键 | zh | 落点 |
| --- | --- | --- |
| `session.title` | 本会话 | 概要卡卡标题 |
| `session.id` | 会话 | facts 标签 |
| `session.createdAt` | 创建时间 | facts 标签 |
| `session.snapshotCount` | 创建时快照 | facts 标签 |
| `session.count` | {count} 项 | facts 值（快照条数） |
| `session.store` | 持久化通道 | facts 标签 |
| `session.store.record` | 会话记录 | facts 值 |
| `session.store.memory` | 内存（重启后丢失） | facts 值（`persistence-degraded` 时同时有 warning 行） |
| `state.closedCount` | 关闭项 {count} | 概要卡第三计数（= `state.disabled.length`） |
| `session.listHint` | 开关只作用于本会话之后的模型步骤；不影响其他会话，也不改默认档。 | 清单卡语义句 |
| `session.filter` | 过滤工具、技能或地址… | 清单卡过滤框 placeholder/aria-label |
| `session.residualTitle` | 不在本会话清单里的关闭项（可开启） | 残留区标题 |
| `session.groupOff` | 整组已关 | 行内标签（整组关时） |
| `session.commandTitle` | 跨清单地址 | 命令卡标题 |
| `session.commandNote` | 跨清单的新关用 `/tools off <地址>`；用户级默认档没有图形面，改用 `/tools default off <地址>`（只影响之后新建的会话）。 | 命令卡说明 |
| `session.commandComment` | 本会话（立即生效） | 命令卡首行注释 |
| `command.copy` | 复制命令 | CommandCard 按钮（替换 `workspace.copyCommand`） |
| `command.copied` | 已复制 | 复制成功播报（替换 `workspace.copied`） |
| `command.copyFailed` | 复制失败，请手动选择文本。 | 复制失败播报（替换 `workspace.copyFailed`） |

删除候选 30 键（**判据唯一**：`grep -rn "'<key>'" plugins/session-tool-toggle/src/` 只剩 `locales.ts` 两行；由于 `t()` 的键是 `Key` 联合，漏删只是冗余键、多删必被 `pnpm typecheck` 抓）：

`section.state`、`section.skills`、`section.defaults`、`section.disabled`、`skill.region`、`skill.empty`、`skill.pending`、`skill.switchLabel`、`disabled.listTitle`、`disabled.empty`、`badge.intent`、`entry.disabled`、`defaults.path`、`defaults.note`、`defaults.scope`、`defaults.snapshot`、`defaults.summary`、`defaults.saved`、`defaults.clear`、`defaults.clearConfirm`、`defaults.cliHint`、`workspace.title`、`workspace.cliHint`、`state.createdAt`、`state.snapshot`、`state.storeKind.record`、`state.storeKind.memory`、`workspace.copyCommand`、`workspace.copied`、`workspace.copyFailed`。

> **明确保留**（虽失去旧落点，但新形态要吃）：`entry.intentOnly`（「暂无匹配」）成为会话清单行/组头的标签文案（3.3 的 `intentOnly` 槽），`disabled.intentOnly`（一句解释）成为该标签的 `title`（读屏理由）。**删除**的是 `badge.intent`（「意图」两字短徽标）——chip 段消失后它没有落点。

**保留不动**：所有 `error.<code>`（含 `error.defaults-unwritable`）、`notice.<code>`（含 `notice.defaults-corrupt`，面板不再产出该码但映射表必须对闭集穷尽）、`defaults.counts`/`defaults.residualTitle`/`defaults.universeUnavailable`/`defaults.filterEmpty`/`defaults.groupCount`/`defaults.groupInDefaults`/`defaults.groupSummary`/`defaults.groupOff`/`defaults.switchLabel`/`defaults.groupSwitchLabel`/`defaults.remove`（默认档形态的词汇表，页面仍在用）、`workspace.*`（页面与分节仍在用）、`group.*`/`entry.skill*`/`skill.unavailable`/`skill.blocked`/`skill.effective`/`skill.intentOnly`/`mcp.*`/`switch.label`/`toggle.*`/`action.*`。

### 3.9 样式类（`src/client/panel.module.css`）

| 动作 | 类 | 说明 |
| --- | --- | --- |
| 更名 | `.workspacePage` → `.cardStack` | 规则不变（`flex column / gap 16px`）；页面根与面板卡栈两处共用同一类，`WorkspaceDefaultsPage.tsx:184` 与 `ToolPanelAction.tsx` 各一处 |
| 删除 | `.section`、`.sectionTitle`、`.section > .rows`、`.sectionFrame` | 仅被三个已删/收缩的组件使用（`ToolPanelAction` 旧分区、`SkillPanel`、`DefaultsSectionFrame`）；`DefaultsSectionFrame` 的 `sectionFrame` 注释一并删 |
| 复用（零改动） | `.card`/`.cardHeader`/`.cardTitle`/`.push`/`.facts`/`.fact`/`.factTerm`/`.factValue`/`.counts`/`.pageFilter`/`.emptyBlock`/`.emptyTitle`/`.emptyHint`/`.commandRow`/`.command`/`.note`/`.counters`/`.meta`/`.chips`/`.chip`/`.address`/`.pending`/`.tag`/`.rowMain`/`.rowDescription`/`.rowTags`/`.metaTag`/`.tone*`/`.warning`/`.notice`/`.muted`/`.error`/`.detail`/`.failureBlock`/`.loading`/`.groups`/`.group*`/`.rows`/`.row`/`.name`/`.filterRow`/`.filter`/`.empty`/`.residual`/`.badge`/`.saved` | Modal 适配的结论：`.dialog`（`width:min(760px, 100vw-32px)`、`max-height:calc(100vh-96px)`）与 `.content`（`overflow-y:auto`）已满足窄容器滚动需求，**不新增面板变体类** |

`cssModuleCount()`（`test/bundle.test.ts:52-58`）按 `*.module.css` 计数，本次不增删 css 文件 ⇒ 注入器断言不变。

### 3.10 配置键

**无新增、无删除、无改名**。`storage` / `protectedTools` / `defaultsFile` / `workspacesFile` / `hostModuleBase` 五个键与面板的关系不变（面板仍不提供配置编辑面）。

---

## ④ 决策记录

> 每条含「裁决 / 理由 / 被否方案 + 理由 / 反例」。凡与 `decisions.md` 已定结论重叠的，只写**代码落点选择**，不重开结论本身。

### D-01 三卡整编落到「卡片结构与清单组件双重复用」（照录 D1=a，不重开）

- **裁决**：面板正文 = `.cardStack` 容器内三张 `.card`；清单本体用**同一个** `DefaultsGroupList`，不新建面板专属清单组件。
- **理由**：两张表面共用一套 DOM/类名/文案键，页面下一次改清单（例如再加一个标签位）面板自动获得；测试面从「两套清单各测一遍」降到「一套清单测两形态」。
- **被否 A（只删两分区，保留 `ToolPanelGroups`+`SkillPanel` 分段）**：`explore.md` 的方向 B。理由：与 D1=a 冲突，且会留下 `ToolPanelGroups` 与 `DefaultsGroupList` 两套几乎同构的清单（286+641 行），第 3 次改清单要改 3 处。
- **被否 B（新建 `SessionGroupList` 承载会话语义）**：可保 `DefaultsGroupList` 零改动。理由：过滤视图、残留区、组折叠、标签着色、`showDetails` 两列行要复制约 400 行，两套 DOM 的分歧在「参照页面」这条需求上是反向的。
- **反例**：若不合并，本次为面板加「描述次行 + 全局过滤」必须在 `ToolPanelGroups` 里再实现一遍 `filterDefaultsView`/`rowDescription`；下次页面改技能标签口径，面板会静默落后一版——这正是 `explore.md` 记的「两形态仍两套」代价。

### D-02 wire 瘦身范围：删 `PanelSnapshot.defaults`/`workspace`、`defaults` 端点，以及 `workspace` 端点的 `{sessionId}` 寻址与 `choices` 字段

- **裁决**（裁定 decisions.md 移交的 D5）：
  1. 删 `PanelSnapshot.defaults`（唯一消费方 `ToolPanelAction.tsx:504-514` 的 `DefaultsEditor`）；
  2. 删 `PanelSnapshot.workspace`（唯一消费方 `:489-503`）；
  3. 删 `defaults` 端点全家（`contract.ts` 五件 + `rpc.ts` 三函数 + `panel-client.ts` 一方法）；
  4. **删** `workspace` 端点的 `{sessionId}` 寻址形态与响应里的 `choices` 字段（P-1=b，用户于落档分歧点拍板，推翻设计线推荐 a）：`WorkspaceRequest` 删 `sessionId` 字段、`parseWorkspaceRequest` 收敛为只接受 `{workspacePath}`；`WorkspaceValue` 删 `choices` 字段与 `WorkspaceChoice` 线上类型（`readWorkspaceChoice`/`parseWorkspaceValue` 对应段）；宿主删 `resolveWorkspace` 的 session 归属分支（`liveSessionOf` 为 panel/toggle/reset 共用**保留**；`attributionOf` 失去唯一端点消费方随之删）、`universeOfTarget` 的 `target.kind === 'session'` 分支（session 宇宙读数 `universeOf(deps, session)` 随删）；`choicesOf`/`deps.workspaceChoices` **内部保留**（`{workspacePath}` 分支的「是否已登记」查询仍用，仅不再出现在响应里）；client 侧 `panel-client.ts` 的 workspace value 手写 parser 同步去 `choices`；
  5. **不删**任何失败码（含 `defaults-unwritable`）。
- **理由**：浏览器半由宿主启动图提供（README「安装/升级后必须重启 web profile」），**同一次安装内不可能跨版本混装**；仓库既定裁定「统一版本、同 tag 安装、混装不受支持」使破坏性收缩免兼容垫片。第 4 项修订依据：用户拍板「死面一次清干净」优先于「改动面最小」——`{sessionId}` 形态失去唯一客户端消费方后留着，会让「统一页分节 vs 会话面板」两套寻址心智长期并存，且 `choices` 字段持续吃 `deps.workspaceChoices()` 的每次读盘；拖进的 `workspace-attribution`/`workspace-universe` 测试改动是**删除断言**为主（`{workspacePath}` 路径的用例全部保留）。
- **被否 A（保留两字段与端点，仅停用）**：`defaults` 端点在失去唯一 GUI 消费方后仍要维护请求/响应 parser、`dispatch` 分支与 11 个用例；半年后面板语义再变时没人敢删，死面成本复利。同理两个快照字段会继续吃 `snapshotOf` 的默认档文件探测（`rpc.ts:837` 的 `canReadFile`）。
- **被否 B（连失败码 `defaults-unwritable` 一起删）**：要同步 `HOST_FAILURE_CODES`、`locale-parity` 的 `SECTION_3_5` 逐字表与 `REQUIRED_KEYS`、`error.*` 键集合，收益只是「少一枚枚举」；且 `/tools default` 的写盘失败语义仍在，码留着将来可复用。
- **被否 C（同时删 `{sessionId}` 寻址与 `choices`）**：设计线曾以「风险面与需求无关」推荐保留（P-1 推荐项）——**用户于落档分歧点拍板 b，推翻该推荐**，理由见上；此条留痕为决策史，最终裁决以第 4 项修订为准。
- **反例**：旧浏览器半（六段布局）+ 新宿主的组合会拿到缺两字段的快照 → `parsePanelSnapshot` 拒收 → 面板渲染 `error.bad-response`，且 `defaults` 端点回 `bad-request`。这个组合**只可能出现在手工替换 `lib/client.js` 的场景**；若不做收缩，则旧浏览器半会一直读到一个「宿主还在维护但无人使用」的默认档视图，掩盖真正的契约漂移。

### D-03 会话槽的形状：**单个可选 `session` 对象**（四集合），不散成四个 props、不给 `DefaultsEntry` 加字段

- **裁决**：`DefaultsGroupList` 新增唯一可选 prop `session?: SessionListState`；有了它就切会话文案与语义，缺省即默认档形态（页面 DOM 逐字不变）。
- **理由**：文案形态与数据槽必须同时存在才自洽（只给 `pending` 不给会话文案会渲染出「默认档开关」的可访问名）；一个可选对象让「不可能出现半套形态」成为类型事实，也让页面两处调用点零改动。
- **被否 A（`variant: 'defaults'|'session'` + 4 个独立可选 props）**：五个 prop 可被组合出 `variant='session'` 而 `pending` 缺席的非法态，得靠运行时兜底。
- **被否 B（给 `DefaultsEntry` 加 `shadowed?: boolean` 等字段）**：`DefaultsEntry` 是**线上契约**类型（`contract.ts:442`），工作区宇宙里没有「影子已生效」这种概念，宿主必须为「工作区宇宙缺该键」开特例，`parseWorkspaceValue` 也要改。
- **被否 C（每个调用点传显式 bundle）**：页面 + 分节容器 + 面板三处各写 9 个闭包，`t` 被捕获进闭包后 identity 每次渲染都变，`useMemo` 依赖恒变。
- **反例**：若按被否 B 走，`/tools workspace` 写入的工作区宇宙会带来一个永远为 `undefined` 的 `shadowed` 字段；下一个读 `DefaultsEntry` 的人会以为它可信——这是契约层最贵的一类错误。

### D-04 行开关口径：会话形态用 `effectiveDisabled`（整组关 → 组内行呈关闭且禁用），**不**照抄页面的「地址在档」口径

- **裁决**：`checked = !(session?.effectiveDisabled ?? disabledSet).has(address)`；`blocked`（组地址在关闭集 → 组内行禁用 + 标签）继续用 `disabledSet`。
- **理由**：会话面板的真值是「这个工具现在能不能用」。`mcp:a` 关闭时掩码按组地址命中，`mcp:a::x` 实际不可用；若按页面口径渲染，该行会显示「开」，与 `stats.denied` 计数、`/tools status` 和真实调用结果三处矛盾。
- **被否 A（照抄页面口径 + 仅靠「整组已关」标签交代）**：标签能解释但开关位置撒谎；spec「面板切换等效命令面」要求面板与命令面读到同一状态，视觉必须一致。
- **被否 B（不阻塞、仍允许点行开关）**：`mcp:a` 关闭时点行「开启」写入 `mcp:a::x` 的 `on`，组地址仍覆盖它 → 零效果的死点击（这是**当前**面板的既有缺陷，本次顺手修掉）。
- **反例**：保留现状（可点）时用户点三次都「没反应」，只能去命令面确认——这正是探索记的「无效动作」类体验缺陷。

### D-05 命令卡抽成共用组件 `CommandCard`（复制反馈状态机只有一份）

- **裁决**：新建 `CommandCard.tsx`，页面与面板共用；`COMMAND_PLACEHOLDER` 移入该模块，页面 import。
- **理由**：复制反馈的 4 件事（三态、2s 复位、`aria-live` 单点播报、`clipboard` 软降级）在面板里重写必然漂移；抽出后面板命令卡是 8 行组合。
- **被否 A（面板内复制一份）**：约 60 行重复，且页面「按钮文案恒定、反馈走 `aria-live`」这条已修过的缺陷（`WorkspaceDefaultsPage.tsx:338-341` 注释记了 G6.2 冗余修复）会在第二份里复活。
- **被否 B（把命令卡留在页面、面板不设命令卡）**：`decisions.md` 已裁定命令卡是三卡之一（可发现性补偿），且 spec 场景要求面板给出跨清单地址的命令兜底。
- **反例**：不抽则本次变更同时存在两份「复制失败」文案来源，第二次改文案（例如改成「请手动复制」）会漏一处。

### D-06 概要卡：**无徽章、无独立脚注块**；事实行进 `dl.facts`，`panel.description` 兼任脚注

- **裁决**：卡头 = 标题（`session.title`）+ 右推刷新；`dl.facts` 四行（会话 / 创建时间 / 创建时快照 / 持久化通道）；三计数；`kvDelta` 与 notices 在卡内。不设徽章、不设脚注块、不出现工作区特有的 key/path 行。
- **理由**：页面的徽章位讲「工作区是否登记」，会话面没有对应事实——伪造一个「已登记会话」徽章是假信息；页面的脚注两句里 `workspace.union`（用户档 ∪ 工作区档）在纯会话面不适用，`workspace.scope` 的信息与 Modal 的 `description` 完全重叠（`locales.ts:47`），重复渲染只是噪音。
- **被否 A（照抄徽章位，用「持久化通道」当徽章）**：`state.storeKind.memory` 是长句（「持久化：内存（重启后丢失）」），塞进 11px 圆角徽章会挤爆卡头；且降级事实已由 `persistence-degraded` warning 行表达。
- **被否 B（照抄两句脚注）**：与 Modal `description` 重复。
- **反例**：若既留 `description` 又加脚注，窄容器里同一句话出现两次，用户会怀疑两处语义不同（页面里两句脚注是**不同**事实，正因为不同才值得占位）。

### D-07 刷新移入概要卡头；「恢复创建时快照」进 Modal `footer`；`.workspacePage` 更名 `.cardStack`

- **裁决**：Modal `footer` = `[恢复创建时快照][关闭]`；刷新按钮在概要卡头右侧（与页面 D12 同位）；卡片纵向容器类两处共用 `.cardStack`。
- **理由**：与页面同构（页面刷新在概要卡头、动作区在页脚）；Modal 的 footer 是固定底栏，两段式恢复放那里既可达又不被长清单推走。
- **被否 A（footer 仍放刷新）**：footer 只有一行，塞三个按钮后「关闭」会被推到视觉边缘；且页面同构的刷新位不在 footer。
- **被否 B（恢复按钮放在清单卡底部）**：与「动作区」语义重复；滚动长清单后按钮不可见，两段式确认中途滚走会让用户以为没生效。
- **被否 C（面板另建 `.panelCard` 变体类）**：`.card` 的规则（bg-layer-2 + 12px 圆角 + 细边）在 760px Modal 里视觉成立，另建变体等于维护两份几乎相同的卡片样式。
- **反例**：不更名 `.cardStack` 而让面板复用 `.workspacePage`，后来者会在面板代码里看到 `workspacePage` 并以为面板与工作区有关——类名是这一层唯一的文档。

### D-08 技能并入清单卡后保留 `skill.blocked` 组内提示行

- **裁决**：`tool:skill` 整组关时，除行禁用 + 「整组已关」标签外，技能组内再渲染一句 `skill.blocked`（「技能工具已整档关闭，逐项开关暂不生效。」）。
- **理由**：`blocked` 的后果是「影子 stub 不注册、逐项开关点了不生效」（DQ3=A 的既有语义，`SkillPanel.tsx:19-21`），仅靠标签无法解释「为什么点了没反应」。
- **被否 A（只保留标签）**：行禁用已经让开关点不动，用户会把「点不动」读成 bug 而不是设计。
- **被否 B（把该句提升到概要卡 notices）**：它不是降级事实而是整组关的后果，挂在概要让每次打开面板都读一遍，噪音高于收益。
- **反例**：技能组与 MCP 组若在此处行为完全一致（都不解释），则「技能能被整档关、内置工具不能」这条差异在界面上只剩行内标签，新用户无法建立模型。

### D-09 失败文案映射迁出到 `panel-failure.tsx`（`DefaultsEditor.tsx` 删除后的唯一落点）

- **裁决**：`PanelFailure` + `errorKeyOf` + `failureParams` + `failureOf` + `FailureRow` 五件迁到新模块；`ToolPanelAction` 与 `WorkspaceEntry` 都从新模块 import（原 `WorkspaceEntry.tsx:55` 的「从面板容器反向 import」消失）。
- **理由**：`DefaultsEditor.tsx:56-61` 是 `PanelFailure` 的定义处，删文件必须安置它；放进 `panel-client.ts` 会让 wire 层 import locale 的 `Key` 类型（分层反向），放进 `defaults-view.ts` 会把纯派生模块变成 UI 模块。
- **被否 A（就地留在 `ToolPanelAction.tsx`，`WorkspaceEntry` 继续反向 import）**：分节组件依赖面板容器的模块，`ToolPanelAction` 一旦重写（本变更正是重写）就会牵连一个与面板无关的入口。
- **被否 B（复制一份到 `WorkspaceDefaultsPage`）**：失败码→文案的唯一实现点变两处，新增失败码时漏改一处。
- **反例**：若照被否 A，本次重写 `ToolPanelAction` 的 diff 会同时是「分节组件的依赖变更」，review 时两件事纠缠。

### D-10 保留 `PanelSnapshot.intentOnly` 并在清单行/组头消费（不删该字段）

- **裁决**：`intentOnly` 字段留在线上；面板把 `new Set(snapshot.intentOnly)` 放进 `SessionListState.intentOnly`，命中的行/组头显示「暂无匹配」标签，`title` 用 `disabled.intentOnly` 的解释句。
- **理由**：`disabled` 段消失后，这条「已记录但当前命中 0 个注册名」的事实本来会整体消失。它在 `panel.ts:290-311` 是两段并集（工具 0 命中 ∪ 技能无安装），与「残留区」不等价：一个关闭的 `mcp:a` 在服务器断线但 `carried` 仍带名字时**在宇宙里**（不是残留），却命中 0 个注册名。Q4 的裁定依据是「信息零丢失」，删字段会打自己的脸。
- **被否 A（删字段，理由「chip 段没了」）**：`disabled.intentOnly` 那句解释与 `badge.intent` 徽标的**语义**确实来自它，删了就无法在新形态下保留该事实；`/tools status` 的 `matched` 也不能被面板借用（客户端拿不到 per-address matched）。
- **被否 B（新增一个 per-address `matched` 字段替代）**：多一个线上字段只为了让一个标签可渲染，收益为负。
- **反例**：关掉 `mcp:a` 后服务器被卸载，面板会显示该组「关着、有行、行也关着」，用户以为还能在此组操作；实际上这些地址一个都命不中，恢复它需要先让服务器上线——没有「暂无匹配」标签，这条因果就断在界面里。

### D-11 `defaults-corrupt` 提示码保留、面板不再产出

- **裁决**：`PanelInputs.defaultsCorrupt` 删除 ⇒ `noticesOf` 不再产出 `defaults-corrupt`；`NOTICE_CODES`/`NOTICE_ORDER`/`noticeText` 的闭集与 `notice.defaults-corrupt` 文案保留不动。损坏事实的去处：启动 warn（`defaults.ts` 的读路径）+ `/tools default status`。
- **理由**：面板不再显示用户默认档，健康状态不该在会话面报；同时删码要同步 contract parser、`NOTICE_ORDER`、`locale-parity` 的码覆盖断言，收益仅「少一枚枚举」。
- **被否 A（删码）**：见上，改动面大、语义收益为零。
- **被否 B（保留 `defaultsCorrupt` 输入只为发这条 notice）**：面板为一条与自身无编辑关系的告警付一次默认档文件探测（`defaultsStateOf` 的 `canReadFile`），且会让「快照瘦身」只瘦一半。
- **反例**：若面板继续报 `defaults-corrupt`，用户点开「会话工具面」看到的是用户级默认档的健康告警，而面板里没有任何能修它的入口——指路方向错误。

### D-12 分组词汇表内建在 `group-shape.ts`（不逐点传 bundle）

- **裁决**：`wordingOf(session, t)` 返回两套 `GroupListWording`，`DefaultsGroupList` 内部取一套；调用点只传 `session?`。
- **理由**：词汇表是「形态」的一部分；集中一处后，新增一个组级标签只需改一个文件。
- **被否（把 `GroupListWording` 做成必填 prop）**：页面与（收缩后的）工作区档容器各自要构造 12 个闭包，且闭包捕获 `t` 后 identity 每次渲染变，`useMemo`/`memo` 优化全部失效。
- **反例**：若逐点传 bundle，本次新增「整组已关」这一条要改三处调用点；下次改「默认关」的措辞又改三处——词汇表应该比调用点少。

### D-13 变更名沿用 `2026-11-09-session-tool-panel-rework`

- **裁决**：变更目录 `openspec/changes/2026-11-09-session-tool-panel-rework/`。
- **理由**：与 `explore.md`/`decisions.md` 的既有命名一致，日期前缀符合仓库惯例；改名会让三份上游留痕与落档目录不一致。
- **被否（改为 `session-tool-panel-three-cards`）**：名字描述了方案而非需求（「参照页面更新」），且方案名在实施期可能漂移。
- **反例**：仓内已有的 `2026-11-09-session-manager-info-display` 也是「域-主题」而非「方案」命名。

### D-14 delta 只用 MODIFIED、requirement 标题逐字沿用

- **裁决**：spec delta 只写 `## MODIFIED Requirements`，7 条 requirement 用**现有标题原文**；内容重写。
- **理由**：`openspec validate --strict` 对 MODIFIED 按标题匹配既有 requirement；改名会被视作「新增」而旧条目仍在，产生双写。仓库既有先例（`2026-11-09-session-manager-info-display/specs/...`）就是 MODIFIED-only。
- **被否（REMOVED + ADDED 组合表达「用户级默认档 requirement 消失」）**：跨两段容易与归档时的合并顺序冲突，且本次不是「能力消失」而是「GUI 面消失」——requirement 本体（默认档文件与命令面）仍在。
- **反例**：若把「默认档编辑面的分组开关形态」改成「工作区默认档分节的分组开关形态」，strict 校验会把旧标题视作未修改、新标题视作新增，主规格里同时留下两条近义 requirement。

---

## ⑤ 逐任务组实现要点

任务分组按代码依赖排序；每组自带「完成判据」。提交切分建议：TG1 单独一个提交（规范），TG2+TG3 一个提交（契约与控制器收缩，可独立绿灯），TG4+TG5+TG6 一个提交（面板重构），TG7+TG8 一个提交（测试与门禁/文档）。

### TG1 spec 修订（根仓 · `openspec/`）

**落点**：`openspec/changes/2026-11-09-session-tool-panel-rework/specs/dsh-session-tool-toggle/spec.md`（新建 delta）。

**七条 MODIFIED，逐条要点**（标题逐字沿用 D-14）：

1. **「Web 配置界面（入口与构成）」**（主规格 `:103-120`）：
   - 构成句改写为「面板 SHALL 由**概要卡**（会话状态事实与三计数）、**清单卡**（全局过滤 + 分组开关清单：MCP 服务器组 / 技能组 / 内置工具组）、**命令卡**（会话级命令模板）与**页脚动作区**（恢复创建时快照，两段式确认）构成；SHALL NOT 提供用户级默认档编辑面、SHALL NOT 提供工作区默认档编辑面」。
   - 删「用户级默认档编辑、工作区默认档分区、关闭集展示」三处列举；保留「工具清单 / 会话级开关 / 保护名单不可切换」。
   - 场景 1（`:107-110`）：把「分区文案」改「卡标题与清单文案」。
   - 场景 3（`:117-120`）：删括号里的「（含分组开关形态的默认档分区）」。
   - 新增场景「面板不提供默认档编辑面」：打开面板后界面不含用户级/工作区级默认档编辑区，关闭集地址只能通过清单开关、残留区或 `/tools off` 命令改变。
2. **「用户级默认档」**（`:65-82`）：删「Web 配置界面 SHALL 提供同一默认档的查看与增删，SHALL 走同一校验与原子写路径」整句；改写为「用户级默认档 SHALL 只由 `/tools default` 子命令编辑；Web 界面 SHALL NOT 提供该档的图形编辑面」。其余（文件、原子写、播种、不追溯、子代理）**逐字不动**。
3. **「面板清单宇宙（scoped ∪ carried）」**（`:146-153`）：补「清单卡 SHALL 提供全局过滤（匹配名称/地址/描述/组键，无匹配组隐藏、组保持展开）与行详情（描述次行 + 技能标签）；整组地址在关闭集时组内行 SHALL 不可切换并标注」；补「关闭集中不在清单宇宙的地址 SHALL 以残留区呈现且可开启（`onToggle(address,true)` 语义）」；保留「已关条目保留在清单里」与「不返回被其他作用域隐藏的计数」。
   - 新增场景「残留地址可开启」：关闭集含服务器已卸载的 `mcp:zzz` → 残留区给出「开启」入口，点击写 `on`，关闭集不再含它。
   - 新增场景「整组关闭时组内行按实际不可用呈现」：`mcp:a` 关闭 → 组开关呈关、组内行开关亦呈关且禁用并标「整组已关」。
4. **「默认档编辑面的分组开关形态」**（`:155-177`）：删除「用户级默认档编辑区」「面板两分区」全部表述；保留分节形态的宇宙口径（工作区宇宙）、无自由文本添加、CLI 兜底；场景 1（`:159-162` 用户级编辑不追溯）删除；场景 2（`:164-167` 用户级分区渲染）删除；场景 3（`:169-172`）改写为只讲分节；场景 4（`:174-177`）删「面板分区与用户级编辑区的会话视角读数不受影响」一句。
5. **「工作区默认档页面的工作区宇宙」**（`:179-216`）：删「面板形态行为 SHALL NOT 因此改变」「面板分区的会话视角宇宙不受影响」「面板形态不受影响」「面板行不受影响」四处面板句；其余（归组纪律、来源徽章、行详情、过滤与空档引导、失败降级）**逐字不动**。
6. **「工作区默认档分节」**（`:275-292`）：删「面板「工作区默认档」分区 SHALL 提供同一编辑能力（作用于当前会话所属工作区）」与场景「面板工作区分区可用」（`:284-287`）；其余（选择框切换、只读写本插件文件、上游菜单座位基线说明）不变。
7. **「面板读写通道与会话状态同源」**（`:122-144`）：补「面板 SHALL NOT 提供默认档（用户级/工作区级）编辑面，其读写面只有会话级 `panel` / `toggle` / `reset` 三个端点；工作区默认档的读写面归分节（`workspace` 端点，`{workspacePath}` 唯一寻址、响应不含 `choices`——P-1=b 收缩）」；「面板 SHALL NOT 提供插件配置键的编辑面」保留。

**完成判据**：`pnpm spec:check`（=`openspec validate --all --strict`）退出 0，且 `grep -c '^### Requirement'` 在 delta 里为 7；`grep -n '面板「工作区默认档」分区\|用户级默认档分区\|面板两分区' openspec/changes/2026-11-09-session-tool-panel-rework/specs/dsh-session-tool-toggle/spec.md` 无输出。

### TG2 契约与宿主收缩（根仓 · `src/contract.ts`、`src/host/*`）

**步骤**（顺序即依赖，每步后 `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 会指出残留引用）：

1. `contract.ts`：`PanelSnapshot` 删 `defaults`/`workspace`；`readPanelSnapshot` 删两段；保留 `intentOnly`。
2. `contract.ts`：删 `DEFAULTS_ENDPOINT`/`DEFAULTS_ACTIONS`/`DefaultsAction`/`DefaultsRequest`/`DefaultsValue`/`parseDefaultsRequest`/`parseDefaultsValue`；`ENDPOINTS` 四元组；`REQUEST_PARSERS` 去 `defaults`。
3. `host/types.ts`：`PanelInputs` 删 5 字段；删 `WorkspacePanelInputs`。
4. `host/panel.ts`：返回体删两项；删私有 `workspaceViewOf`；`noticesOf` 去 `defaultsCorrupt` 分支；收拾 import（`DefaultsFile`/`WorkspaceView`/`WorkspacePanelInputs` 若无他用则删）。
5. `host/rpc.ts`：`dispatch` 去 `defaults` 分支；删 `handleDefaults`/`writeDefaultsOf`/`defaultsStateOf`；`snapshotOf` 去探测与 5 个 inputs 键；`RpcDeps` 去两字段。
6. `host/rpc.ts`（P-1=b）：删 `resolveWorkspace` 的 `{sessionId}` 分支与 `attributionOf`；`universeOfTarget` 收敛为恒 `readWorkspaceUniverseOf(deps, resolved.key)`；两处 `WorkspaceValue` 组装去 `choices`；`choicesOf` 保留为**私有**登记查询（`{workspacePath}` 分支仍用）；`liveSessionOf` 保留（panel/toggle/reset 共用）。
7. `contract.ts`（P-1=b）：`WorkspaceRequest` 删 `sessionId` 字段；`parseWorkspaceRequest` 收敛为只接受 `{workspacePath}`（session 形态 → `bad-request`）；`WorkspaceValue` 删 `choices`；删 `WorkspaceChoice` 线上类型与 `readWorkspaceChoice`；`parseWorkspaceValue` 去 `choices` 段。
8. `src/client/panel-client.ts`（P-1=b）：workspace value 手写 parser 去 `choices` 解析（`WorkspaceChoice` import 一并去）。
9. `host/index.ts`：deps 对象去 `defaultsIo`/`defaultsPath` 两键；核对 `:874` 日志注释；`workspaceOf` 注入若因 `attributionOf` 删除而失去消费方，随删（`typecheck` 兜底）。

**完成判据**：
- `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0（host 段覆盖 `src/host`、`src/contract.ts`）。
- `grep -rn "DEFAULTS_ENDPOINT\|parseDefaultsValue\|handleDefaults\|defaultsStateOf\|writeDefaultsOf\|WorkspacePanelInputs" plugins/session-tool-toggle/src/` 无输出。
- `grep -n "intentOnly" plugins/session-tool-toggle/src/host/panel.ts` 仍 ≥3 处（字段、计算、返回体）。
- `grep -rn "attributionOf" plugins/session-tool-toggle/src/host/rpc.ts` 无输出；`grep -n "choicesOf" plugins/session-tool-toggle/src/host/rpc.ts` ≥1（私有登记查询仍在）。
- `grep -n "sessionId" plugins/session-tool-toggle/src/contract.ts` 仅剩 `PanelSnapshot.sessionId` 等 panel 族字段（`WorkspaceRequest` 无 session 寻址）。

### TG3 控制器与客户端收缩（根仓 · `src/client/{panel-controller,panel-client}.ts`）

**步骤**：按 3.2/3.7 删状态字段、动作方法、私有字段、客户端方法与 import；`close()` 的 patch 只留 `error`；`defaultsPayload` 删除。

**完成判据**：
- `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0（client 段）。
- `grep -rn "updateDefaults\|refreshWorkspace\|updateWorkspace\|savingDefaults\|workspaceChoices\|workspaceSaved" plugins/session-tool-toggle/src/client/` 无输出。
- `grep -c "defaultsPayload" plugins/session-tool-toggle/src/client/panel-client.ts` 为 0。

### TG4 共用清单吸收会话语义（根仓 · `src/client/{defaults-view,group-shape,DefaultsGroupList}.ts(x)` + 三个删除）

**步骤**：
1. 新建 `group-shape.ts`：迁 `groupTitle`/`defaultExpanded`，写 `GroupListWording`/`wordingOf`/`copyBundleOf`/`DefaultsGroupCopy`（类型从 `DefaultsGroupList.tsx` 移入并 re-export，保持外部 import 面）。
2. `defaults-view.ts`：加 `skillAddressOf`/`shadowedSkillAddressesOf`/`effectiveClosedOf`；`skillEntryOf` 改用 `skillAddressOf`。
3. `DefaultsGroupList.tsx`：加 `session?` 与 `copy?` 可选；`DefaultsRow`/`DefaultsGroupRow`/`ResidualChips` 按 3.3 的差异表分支；`DefaultsGroupList` 里 `const wording = wordingOf(session !== undefined, t)`、`const copyBundle = copy ?? copyBundleOf(session !== undefined, t)`（两个 bundle 都只在本次渲染内使用、不进任何 `useMemo` 依赖，故就地构造即可，不引入记忆化）。
4. 删 `ToolPanelGroups.tsx`/`SkillPanel.tsx`（其 import 只剩被删的容器，TG5 完成后自然成立）。

**完成判据**：
- `pnpm --filter dsh-plugin-session-tool-toggle test -- defaults-group-list defaults-view workspace-editor`（TG7 的新用例先行或后补均可，见依赖说明）退出 0。
- `grep -rn "ToolPanelGroups\|SkillPanel" plugins/session-tool-toggle/src/` 无输出。
- 默认档形态零回归锚点：`test/workspace-editor.test.tsx` 里既有「整组默认关」标签、「移除」按钮、「默认关 M · 残留 K」摘要三处断言**不改也通过**（若因 `copy` 缺省化而不通过，说明默认值写错了）。

### TG5 面板三卡重构（根仓 · `src/client/{ToolPanelAction,CommandCard,WorkspaceDefaultsPage,WorkspaceDefaultsEditor,WorkspaceEntry,panel-failure}.tsx`）

**步骤**：
1. 新建 `panel-failure.tsx`，从 `ToolPanelAction.tsx:112-197` 搬五件；`ToolPanelAction`/`WorkspaceEntry`/`WorkspaceDefaultsPage`/`WorkspaceDefaultsEditor` 改 import。
2. 新建 `CommandCard.tsx`，从 `WorkspaceDefaultsPage` 搬复制状态机；页面命令卡段替换；`COMMAND_PLACEHOLDER` 改从 `CommandCard` import。
3. 重写 `ToolPanelAction.tsx` 为 3.6 的形状（删 `StateSection`/`DisabledSection`/两分区挂载/`writeDefaults`/`defaultsSaved`/`workspaceFailure`；加 `query`/`counts`/`session`/命令卡/footer 动作区）。
4. `WorkspaceDefaultsEditor.tsx` 收缩为 dialog-only（3.7/1.1）；`WorkspaceEntry.tsx` 删 `variant` 传参。

**完成判据**：
- `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0。
- `grep -rn "DefaultsEditor\|DefaultsSectionFrame\|variant=\"section\"\|WorkspaceDefaultsVariant" plugins/session-tool-toggle/src/` 无输出。
- `grep -c "workspaceOf\|universeOfSnapshot" plugins/session-tool-toggle/src/client/ToolPanelAction.tsx` ≥1（清单卡仍走同一投影）。

### TG6 文案与样式（根仓 · `src/client/{locales,panel.module.css}`）

**步骤**：按 3.8 加 19 键、删 32 候选键（逐条 `grep` 判据）；按 3.9 更名 `.cardStack`、删四个类；`WorkspaceDefaultsPage.tsx` 的类名同步；删 `DefaultsSectionFrame` 的 `.sectionFrame` 注释段。

**完成判据**：
- `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0（`Key` 联合是死键清理的安全网：漏删只是冗余键，多删必编译失败）。
- `pnpm --filter dsh-plugin-session-tool-toggle test -- locale-parity` 退出 0。
- `grep -rn "section.state\|section.defaults\|section.disabled\|skill.pending\|workspace.copyCommand" plugins/session-tool-toggle/src/` 无输出。
- `grep -c "\.workspacePage" plugins/session-tool-toggle/src/client/panel.module.css` 为 0 且 `grep -rn "css.workspacePage" src/client/` 无输出。

### TG7 测试调整（根仓 · `test/`）

**步骤**（按 1.3 逐文件）：先建 `defaults-group-list.test.tsx`（新契约的先行测试），再重写 `tool-panel.test.tsx`，再收缩其余；P-1=b 追加——`rpc.test.ts` 工作区组删 `{sessionId}` 寻址用例（改断言「session 形态 → `bad-request`」）与响应 `choices` 断言、`workspace-attribution.test.ts` 删 attributionOf 的 RPC 侧断言（`{workspacePath}` 归属用例保留）、`workspace-universe.test.ts` 删 `universeOf(deps, session)` 分支用例（工作区宇宙用例保留）、`workspace-editor.test.tsx` 夹具去 `choices`；最后删 `skill-panel.test.tsx`。

**完成判据**：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出 0，且：
- `grep -rn "updateDefaults\|refreshWorkspace\|updateWorkspace\|WorkspaceDefaultsEditor.*variant" plugins/session-tool-toggle/test/` 无输出；
- `grep -c "toHaveLength(4)" plugins/session-tool-toggle/test/bundle.test.ts` ≥1；
- 面板断言含 `queryByText('用户级默认档')` 为 `null` 与 `queryByText('工作区默认档')` 为 `null` 各一处（最强「默认档编辑面已退出面板」证据）；
- `grep -rn "WorkspaceChoice\|choices" plugins/session-tool-toggle/test/wire-contract.test.ts` 无 `choices` 响应断言残留（P-1=b）。

### TG8 文档与门禁（根仓 · `README.md` + 产物 + 门禁）

**步骤**：README 八处（1.4）；`pnpm --filter dsh-plugin-session-tool-toggle build` 重建两个 `lib/*.js`；按下面的验证矩阵跑全量门禁。

**完成判据**（逐条命令，缺一不可）：

```bash
pnpm --filter dsh-plugin-session-tool-toggle lint
pnpm --filter dsh-plugin-session-tool-toggle typecheck     # host + client 两段
pnpm --filter dsh-plugin-session-tool-toggle test
pnpm --filter dsh-plugin-session-tool-toggle build
git status --porcelain plugins/session-tool-toggle/lib     # 必须列出两个重建产物
pnpm lint
pnpm typecheck
pnpm build
pnpm spec:check
pnpm dsh:check
```

**依赖与并行**：TG1 独立；TG2 → TG3 → TG4 → TG5 串行（类型面逐步收窄）；TG6 与 TG4/TG5 同批（键与类随组件一起改才不留中间态）；TG7 的 `defaults-group-list` 用例可在 TG4 前写（红→绿）；TG8 最后。

### 验证矩阵（需求 / 场景 → 断言 → 命令）

| 需求 / 场景 | 具体断言（测试或 grep） | 命令 |
| --- | --- | --- |
| 面板 = 三卡 + 动作区 | `getByText('本会话')`、`getByText('本会话开关')`、`getByText('跨清单地址')` 三处卡标题各 1；`getByRole('button', {name: '恢复创建时快照'})` 在 dialog 内 | `pnpm --filter dsh-plugin-session-tool-toggle test -- tool-panel` |
| 面板无用户级/工作区级配置 | `queryByText('用户级默认档') === null`、`queryByText('工作区默认档') === null`、`queryByText('默认档文件') === null` | 同上 |
| 概要卡事实与计数 | 四行 `dt` 文案 + `本会话可见 N` / `已关 M` / `关闭项 K` 三段文本按夹具数字命中 | 同上 |
| 清单行开关 = 命令面状态 | 点组开关 → `client.toggle(SESSION_ID,false,['mcp:yunxiao'])`；点行 → `['mcp:yunxiao::list_datasets']` | 同上 |
| 整组关 → 组内行呈关且禁用 | 夹具 `state.disabled=['mcp:yunxiao']`：组开关 `aria-checked=false`；行 `Switch` `disabled` 且 `checked=false`；存在「整组已关」文本 | 同上 + `defaults-group-list` |
| 残留地址可开启 | 夹具关闭集含 `skill:ghost`（不在 `skills` 行）→ 残留区出现该 chip，点「开启」→ `client.toggle(SESSION_ID,true,['skill:ghost'])` | `pnpm ... test -- tool-panel` |
| 技能标签两态 | `skill-review`（`disabled∧shadowed`）→「模型不可见（`/name` 仍可用）」；`skill:draft`（`disabled∧¬shadowed`）→「已记录，暂未生效」 | `pnpm ... test -- defaults-group-list tool-panel` |
| pending 逐行禁用 | toggle 在途：该行 `disabled` 且出现「正在应用…」；其他行可点 | `pnpm ... test -- tool-panel` |
| 命令卡复制 | 点「复制命令」→ `navigator.clipboard.writeText` 调用参数 `=== ` 代码块 `textContent`；`aria-live` 载体出现「已复制」；2s 后复位（`vi.useFakeTimers`） | `pnpm ... test -- tool-panel workspace-editor` |
| 恢复创建时快照两段式 | 第一次点 → 文案变「再点一次确认恢复」且 `client.reset` 未调用；第二次 → `client.reset(SESSION_ID)`；`state.disabled` 空时按钮 `disabled` | `pnpm ... test -- tool-panel` |
| RPC 不可用降级 | `resolveClient` 返回 `undefined`：正文只有 `error.unavailable`，`queryAllByRole('switch')` 长度 0，`client.panel` 未被调用 | 同上 |
| 会话不在宿主中 | 宿主回 `session-not-live`：同一降级形态 | 同上 |
| 端点收敛 5→4 | `expect(ENDPOINTS).toHaveLength(4)`；`expect(ENDPOINTS).not.toContain('defaults')` | `pnpm ... test -- bundle wire-contract` |
| workspace 端点 `{workspacePath}` 唯一寻址（P-1=b） | `parseWorkspaceRequest({sessionId:'s',action:'read'})` → `bad-request`；`parseWorkspaceValue` 不读 `choices`；`dispatch('workspace', {workspacePath:'/w',action:'read'})` 响应无 `choices` 键 | `pnpm ... test -- wire-contract rpc` |
| `defaults` 端点已不存在 | `dispatch('defaults', {action:'reset'})` → `{ok:false, error:{code:'bad-request'}}` 且 message 含「未知端点」 | `pnpm ... test -- rpc` |
| 快照无两字段 | `expect('defaults' in snapshot).toBe(false)`、`expect('workspace' in snapshot).toBe(false)` | `pnpm ... test -- panel rpc wire-contract` |
| 新 client + 旧宿主（多余字段） | `parsePanelSnapshot({...新形状, defaults: {}, workspace: null})` → `ok:true` | `pnpm ... test -- wire-contract` |
| 控制器动作面 | `expect('updateDefaults' in controller).toBe(false)`；`refresh()` 后 `Object.keys(state)` 不含 `defaults`/`workspace` | `pnpm ... test -- panel-controller` |
| 文案双语齐平 | `locale-parity` 的 keys/empty/required/placeholders 四类 issue 均为空 | `pnpm ... test -- locale-parity` |
| 死键清理无残留引用 | 上述 `grep` 判据全部无输出 | 手动 grep 串（TG6 判据） |
| 分节侧零回归 | `workspace-editor.test.tsx` 的 dialog 用例全绿；`.cardStack` 类存在 | `pnpm ... test -- workspace-editor` |
| 产物重建 | `git status --porcelain` 列出 `lib/index.js` 与 `lib/client.js` | 见 TG8 命令串 |
| 聚合门禁 | 全部退出 0 | `pnpm lint && pnpm typecheck && pnpm build && pnpm spec:check && pnpm dsh:check` |

---

## ⑥ 设计假设与未决项

### 6.1 设计假设

1. **浏览器半与宿主半同批发布**：`lib/client.js` 由宿主启动图提供（README「安装/升级后必须重启 web profile」），因此「旧浏览器半 + 新宿主」只可能出现于手工替换产物，不构成受支持组合（D-02）。若该假设不成立，wire 收缩需要退回兼容垫片。
2. **面板仍以 Modal 承载**（不做页面化/侧栏化）：`ToolPanelAction.tsx:439-450` 的 `Modal` 用法不变，`.dialog` 的 `min(760px, 100vw-32px)` 与 `.content` 的自身滚动足以容纳三卡；本次不引入窄屏断点。
3. **`useWorkspaceDefaults`（`WorkspaceEntry.tsx:175`）保持现状**：分节侧零改动，`workspace` 端点的 `{workspacePath}` 形态与 `universe` 字段不动。
4. **`PanelReading` 不收缩**（`control.ts:205-250`）：命令面继续消费 `defaults`/`workspace`；本变更只让 RPC 快照不再携带它们。
5. **spec delta 只用 MODIFIED**（D-14），requirement 标题逐字沿用；「用户级默认档 GUI 消失」由 requirement 内容改写表达，不新增/删除 requirement。
6. **`dsh-workspace-config-entry` 规格零改动**：`:34` 的降级矩阵与 `:104-110` 的分节语义在收缩后仍然为真（面板仍存在、仍与命令面共用状态；「工作区默认档分节」始终指页面分节）。
7. **文案键删除以 `grep` 为唯一判据**：实施期若发现某键仍有引用（例如被文档或测试字面量引用），保留该键并在任务记录里注明，不为了「删干净」改动引用方。
8. **界面演示（阶段 1.75）**：本次命中 C1（界面变更）∧ C2（形态可由 spec 场景描述）∧ C3（无真实数据可演示：三卡在空快照/固定夹具下即可展示）。演示稿在实施前由 `ui-demo` 流程确认；本文的三卡结构直接作为演示稿的蓝本，**演示若改布局，以演示确认为准回改本文 3.6**。
9. **`intentOnly` 的技能分支**（「技能地址无安装」）在会话面板不再单独区分：残留区一句 `session.residualTitle` 已覆盖「不在清单里」，标签只保留「暂无匹配」四个字。

### 6.2 未决项（非用户决策，实施期自行裁定）

- **`ToolPanelAction.tsx` 是否需要再拆一个「清单卡」子组件**：当前约 330 行（含三卡 + 派生 + footer），仍在单文件可读范围内；若实施后超过 400 行，再按「概要卡 / 清单卡」拆两个文件（不预设）。
- **面板清单卡的分组默认展开态**：沿用 `defaultExpanded`（MCP 折叠、技能与内置展开）。若演示确认「三卡 + 全折叠」更好读，改 `group-shape.ts` 一处即可。
- **`defaults.*` 词汇表在 `copy` 缺省化后的归宿**：`defaults.cliHint` 删除后，`DefaultsGroupCopy.cliHint` 字段保留（缺省不渲染），未来若再有「命令兜底」需求可直接复用。
- **`workspace` 端点死面已随 P-1=b 清除**：`{sessionId}` 寻址与响应 `choices` 已删（D-02 第 4 项修订）；`{workspacePath}` 形态与 `universe` 字段保留且为唯一寻址。README「Web 面板」段相应只描述 `{workspacePath}` 形态。
- **残留区 `<ul>` 的可访问名**：`ResidualChips` 的 chips 列表当前无 `aria-label`（`disabled.listTitle` 原本只服务已删的关闭集段）。若要补，用 `copy.residualTitle` 作 `aria-label`；本次不补（超出需求，且会动页面同一处的 DOM）。
- **`lib/*.js` 体积变化**：删除 4 个组件、新增 3 个纯模块，预计 client 产物净减 8–12 KB；`pnpm build` 后由 `test/bundle.test.ts` 的内联标记断言守住「删除无残留」（`grep 'DefaultsSectionFrame' lib/client.js` 应为空）。

---

## 待决问题

### P-1 `workspace` 端点的两处死面（`{sessionId}` 寻址 + `choices` 字段）是否在本次一并删除

> **已拍板（落档分歧点提问，2026-11-09）：选 b——本次一并删**（推翻设计线推荐 a）。裁定已回写 D-02 第 4 项、触达面 1.2/1.3、TG2/TG7 与验证矩阵；本节留痕为决策史。

- **问题**：本变更删掉面板的工作区分区后，`workspace` 端点的 `{sessionId}` 寻址形态与响应里的 `choices` 数组**唯一客户端消费方消失**（`WorkspaceEntry` 恒用 `{workspacePath}`，且从不读 `choices`）。
- **选项**：
  - **a（推荐）** 保留，另立清理变更：本次只删「因本变更而失去唯一消费方」的三项（两个快照字段 + `defaults` 端点）。
  - **b** 本次一并删：`parseWorkspaceRequest` 收敛为只接受 `workspacePath`、`WorkspaceValue` 去 `choices`，同步 `handleWorkspace`/`resolveWorkspace`/`choicesOf` 与三套测试。
- **推荐**：a。理由：选项 b 会把改动拖进 `control.workspaceViewOf`、`workspace-attribution.test.ts`（228 行）、`workspace-universe.test.ts`（679 行）与 `rpc.test.ts` 的工作区组，风险面与本需求无关；`{sessionId}` 形态在宿主侧仍是一条自洽的合法寻址，不是错误路径。
- **影响面**：选 b ⇒ ①契约（`WorkspaceRequest`/`WorkspaceValue`/`parseWorkspaceRequest`/`parseWorkspaceValue`）②宿主（`resolveWorkspace` 的 session 归属分支、`universeOf(deps, session)` 分支、`choicesOf`）③测试（上述三个文件 + `workspace-editor.test.tsx` 夹具）④spec「面板读写通道」与「工作区默认档」两条的措辞。选 a ⇒ 无需额外工作，只在本文 6.2 与 README 的「已知死面」里记一句。

### P-2 面板是否保留「关闭集为空」的空态文案

> **已拍板（落档分歧点提问，2026-11-09）：选 a——不设空态文案**（与设计稿一致，按 a 编写无需回改）；`disabled.empty` 键按 3.8 删除清单执行。

- **问题**：旧面板在关闭集为空时显示 `disabled.empty`（「当前没有关闭项。」）。三卡形态里，关闭集已拆成「行开关状态 + 残留区 + 概要计数」，空关闭集是**常态**（新会话刚创建时就是空的）。
- **选项**：
  - **a（推荐）** 不设空态文案（删除 `disabled.empty` 键）：清单卡本身已显示全部「开」的行 + 概要计数「关闭项 0」，再说一句「当前没有关闭项」是噪音。
  - **b** 保留一句灰字作为「一切正常」的确认。
- **推荐**：a（本文按 a 设计）。
- **影响面**：选 b ⇒ `session.emptyClosed` 新键 + 清单卡内一处条件渲染 + 一条用例；选 a ⇒ 零额外工作。

---

## 附：与 `decisions.md` 的一致性核对

| 收敛留痕 | 本文落点 | 是否重开 |
| --- | --- | --- |
| D1=a 三卡整编（概要 / 清单 / 命令 + 脚注/动作区） | 3.6 三卡形状、D-01、D-06（脚注并入 Modal description）、D-07（动作区进 footer） | 否（D-06/D-07 是「页脚/脚注」两个槽的落点细化，不改变三卡本身） |
| D2=b 用户级 GUI 全移除，仅留 `/tools default` | 删 `DefaultsEditor.tsx` + `PanelSnapshot.defaults` + `defaults` 端点（D-02）、spec 第 2 条 MODIFIED | 否 |
| D3=a 技能并入清单卡（保留 shadowed/blocked/unavailable） | `SessionListState.shadowedSkills`（D-03）、`skill.blocked` 提示行（D-08）、`universe.skillsAvailable` 既有的降级分支 | 否 |
| D4=a 关闭集拆并三处 | ①`state.closedCount` 进概要卡 ②残留区可开启（D-04 的 `effectiveDisabled` 与 3.3 的 `copy`）③footer 两段式恢复（D-07） | 否 |
| 移交项：wire 契约瘦身 | D-02（含降级面；`{sessionId}`/`choices` 经 P-1=b 拍板一并删，用户推翻设计线推荐 a 并回写全文） | 不适用（本文裁定 + 用户拍板） |
| 移交项：命令卡内容 | 3.5 + D-05（会话级命令为主 + 用户级命令作灰字补偿） | 不适用（本文裁定） |
| 移交项：概要卡映射 | 3.6 facts 四行 + 三计数 + notices（`state.*` 复用/更名见 3.8） | 不适用（本文裁定） |
| 移交项：`DefaultsGroupList` props 形状 | 3.3（单可选 `session` 槽 + `copy` 缺省化） | 不适用（本文裁定） |
| 移交项：Modal 样式适配 | 3.9（`.cardStack` 更名复用，零新增面板变体类） | 不适用（本文裁定） |
| 移交项：变更名 | D-13 | 不适用（本文裁定） |

## 附：阶段 1.75 界面演示（判定与确认）

- **判定**：C1 ✓（会话工具面 Modal 布局/视觉整体改版——三卡整编）；C2 ✓（用户未提供设计稿/截图/原型，「工作区默认档」页面只提供设计语言与共用组件，面板内容映射（概要卡承载会话事实/残留区可开启/动作区两段式恢复）无可照抄的完整既有页面）；C3 ✓（非纯逻辑/配置改动；三卡组合、段落映射、Modal 窄容器适配均为新视觉与布局决策）。排除表逐行不命中（无豁免指令；用户主动要求演示）。
- **分档**：L2——含关键交互流（开关切换/全局过滤/组折叠/两段式确认/复制反馈）与多状态（就绪/空态/在途与确认/降级与失败），视觉方向已定（沿用页面卡片设计语言），不触发 L3。
- **产物路径**：`/tmp/spec-flow/2026-11-09-session-tool-panel-rework/demos/session-panel-three-cards-l2.html`（宿主预览 `file:///data/tmp/spec-flow/2026-11-09-session-tool-panel-rework/demos/session-panel-three-cards-l2.html`）。
- **自检**：chrome-shared 渲染自检通过——程序断言（约束条在顶 / 零外链 / 桌面 1440 与窄屏 390 溢出均 0px / console 无 error）+ vision 子代理读图核对（布局层次/标签/对比度/窄屏适配通过）。首轮视觉核对发现 3 处问题（「保留/重排」角标因 `.keep` 缺 `position:relative` 定位逃逸、figma 整组关示例折叠致「整组已关」标签不可见、③④屏概要卡缺事实行），已修复并程序断言复验（4 绿角标渲染 / figma 展开含标签 / ①–④屏 facts 均 4 行 / 双视口溢出 0）。演示稿内开关嵌套 summary 的 2 条 a11y 提示为演示简化写法，真实实现沿用 `DefaultsGroupList` 的 `.groupHeader` 分列结构（button + Switch 并列，不嵌套）。
- **确认结论**：**已确认**——用户于 2026-11-09 选「① 确认，转入落档」（一次问清，无改稿轮，无豁免）。
