# code-design.md — 工作区配置：弹窗改为独立页面（阶段 1.7 代码设计线）

> 输入：`explore.md`（事实基线 + 宿主配方）+ `decisions.md`（Q1–Q10 收敛留痕，**不推翻**）。
> 变更名：`2026-11-08-workspace-config-page`；spec id 保留 `dsh-workspace-config-entry`。
> 约束：本仓单仓多包（`plugins/*` + `tooling/*`）；skill `dsh-plugin-writer` 的包结构 / 构建 / 门禁 / 任务粒度是硬约束。
> 事实基线：DSH `0.2.2-rc.1` 发布包（路径 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/…`）+ 本仓 `node_modules/.pnpm` 内的同版本包；行号均为当前 checkout。

## 0. 设计主线（一句话）

把 holder 从「`sidebar.footer.action` 入口 + `shell.overlay` 弹窗 + 插件内打开桥」改成「`main`（keyed）页面 + `sidebar.panellist` 行」的一对注册；页面自持**页面级工作区选择**，并把选择值作为 `workspace-config.section` 的 **owner 份额纯数据**下传给三个贡献分节；「页面入口存活」与「侧栏行存活」用配对协调器保证同生共死（行在而页面不在时宿主点击会 `throw`）。

三个贡献方的分节业务逻辑一行不改语义，只改**份额形状 + 选择来源**：stt 的节内 `<select>`、web-ux 的节内 `Menu` 删除；`close` 份额删除（Q7）。

---

## ① 触达面清单

> 全部在本仓。`动作`：改 / 新建 / 删。行内 `——` 表示无独立逻辑改动（仅注释、文案或断言）。

### 1.1 `dsh-plugin-workspace-config`（holder，双端）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/workspace-config/src/client/index.ts` | 改 | 装配面整体替换：弹窗 → 页面 | 删 `createOpenStore` / footer / overlay 两处注册；改为 `main` + `sidebar.panellist` 两处注册，交给 `createPanelPair` 协调；`createSectionsSource(ctx)` 保留并注入页面；新增 `createWorkspaceListSource(ctx)`；`inject` 注入面改端口函数（现取服务） |
| `plugins/workspace-config/src/client/WorkspaceConfigPage.tsx` | 新建 | 页面壳（唯一页面消费者） | `page > pageBody > pageBar(pageHead[h1+intro]+toolbar) + pageTabs` + `role=tabpanel`；`SegmentedTabs` 的 tab 行来自 `sections` 投影；本地 `activeId` + 本地 `chosen`；无分节走空态；无工作区上下文时按 `{kind:'none'}` 下传 |
| `plugins/workspace-config/src/client/WorkspacePicker.tsx` | 新建 | 统一工作区选择框（页面级唯一入口） | `Menu`（`portal` 必开）+ 自绘锚点按钮；items = 真实工作区（Host 顺序）+ 末项「未分配」；受控 `value/onSelect`；禁用态（列表未就绪） |
| `plugins/workspace-config/src/client/workspace-choice.ts` | 新建 | 纯投影层（可 node 直测） | 选择值三态编解码、`Menu` 行 id 编解码、`defaultSelection`（Q10 三档 + 未分配兜底）、`pickerItems`（未分配排最后）、标题兜底 |
| `plugins/workspace-config/src/client/workspace-source.ts` | 新建 | holder 自持的工作区清单源（uSES 可用） | `ctx.inject(['workspaces'], …)` 绑定 `list.getSnapshot/subscribe`；`pending → ready` 双版本记忆；服务退场回落 `pending` 并通知 |
| `plugins/workspace-config/src/client/session-context.ts` | 新建（自 stt 迁入） | 「当前会话」事实 + 会话 `updatedAt` 读数 | `currentSessionIdOf(ctx)`（两步结构探测，零类型依赖）+ `sessionUsageOf(ctx)`（`{updatedAtById}` 投影）；每次现取、不缓存 |
| `plugins/workspace-config/src/client/panel-pair.ts` | 新建 | 双注册协调器（同生共死） | 两座位到场顺序无关；页面未装成 → 行不注册；页面退场 → 行一并退场；失败只 `warn` 不抛 |
| `plugins/workspace-config/src/client/WorkspaceConfigPanelIcon.tsx` | 新建 | `sidebar.panellist` 的图标组件 | 收 `SidebarPanelIconOwnerProps`（`{size,active}`），渲染 `IconWorkspaceTreeOutlineRegular`；`active` 不消费（行选中态由宿主 `aria-current` 表达） |
| `plugins/workspace-config/src/client/contract.ts` | 改 | holder 内部常量 + 座位增补收口 | 新增 `PANEL_ID='workspace-config'` / `PANEL_ORDER=20`；删 `WORKSPACE_CONFIG_TRIGGER_ORDER` / `WORKSPACE_CONFIG_DIALOG_ORDER`；保留 `WORKSPACE_CONFIG_SECTION` 与 `declare module` 增补；re-export 新 owner 份额类型 |
| `plugins/workspace-config/src/client/sections.ts` | —— | nav 行投影逻辑原样复用（弹窗→tabs 只换消费方） | 仅改模块注释里的「弹窗」话术；`projectRows` / 双版本记忆 / 稳定排序一行不动 |
| `plugins/workspace-config/src/client/locales.ts` | 改 | 文案键面重写（dialog.* → page.*） | 保留 `entry.label`；新增 `page.title` / `page.intro` / `page.tabs.label` / `page.empty.*` / `page.workspace.*`；删 `dialog.close` / `dialog.loading`；zh/en 同步 + `LocaleNamespaceMap` |
| `plugins/workspace-config/src/client/page.module.css` | 新建 | 页面骨架样式（替代弹窗样式） | 类名：`page/pageBody/pageBar/pageHead/pageHeading/pageTitle/pageIntro/toolbar/toolbarLabel/pageTabs/pageTabList/tabPanel/empty/emptyTitle/emptyHint/picker/pickerName/pickerUnavailable`；颜色只走 `var(--dsw-alias-*, 兜底)`；**单文件**保「一个样式注入器」断言 |
| `plugins/workspace-config/src/client/WorkspaceConfigDialog.tsx` | 删 | 弹窗壳下线（Q1） | `Modal` / 自绘 header / nav / `renderSlot(...,{close})` 全部移除 |
| `plugins/workspace-config/src/client/WorkspaceConfigTrigger.tsx` | 删 | footer 入口下线（Q1） | 宽/折叠两形态与 `aria-haspopup="dialog"` 语义一并移除 |
| `plugins/workspace-config/src/client/open-store.ts` | 删 | 打开桥无消费者（Q1） | 入口与弹窗不再是两个 entry，不再需要跨 entry 通信 |
| `plugins/workspace-config/src/client/dialog.module.css` | 删 | 由 `page.module.css` 取代 | 构建期 `cssClassPrefix` 仍为 `wsc` |
| `plugins/workspace-config/package.json` | 改 | 描述与类型依赖 | `description` 改页面话术；devDeps 增 `@deepseek-ai/dsh-api-workspace-controller` / `@deepseek-ai/dsh-api-session-controller`（`catalog:dsh`，**只吃类型**）；`dsh.client.inject` **不加**这两项（见 D11） |
| `plugins/workspace-config/cordis.patch.yml` | —— | 注册行不变（裸包名是 client scan 的唯一锚点） | 仅更新注释里的入口描述（footer/overlay → panellist/main） |
| `plugins/workspace-config/build.mjs` | —— | 薄入口与旋钮不变 | 仅更新模块注释（弹窗 → 页面） |
| `plugins/workspace-config/test/apply.test.ts` | 改 | 装配事实重钉 | 两处 `slots.inject` 的座位名/顺序；`main` 的 `{name,key,locale,children,inject}`；`panellist` 的 `{name,id,order,locale,label thunk}`；`PANEL_ID` 同时是 main key 与 panellist id；配对协调的三个断言（页面失败→无行、行座位先到→页面到后补行、页面退场→行退场） |
| `plugins/workspace-config/test/page.test.tsx` | 新建 | 页面壳行为 | 标题/简介；tab 行数与顺序；tab↔tabpanel id 互指；切 tab 只换 `only`；选择框 items 顺序与「未分配排最后」；选择变化下传 owner 份额；无分节空态；来源 pending 的降级 |
| `plugins/workspace-config/test/workspace-choice.test.ts` | 新建 | 纯策略 | Q10 三档逐条 + 并列/空表/未分配兜底；`selectionKeyOf`/`selectionFromKey` 往返 |
| `plugins/workspace-config/test/workspace-source.test.ts` | 新建 | 清单源生命周期 | 服务未就绪 → `pending`；到达 → `ready` + 通知一次；快照 identity 稳定；退场 → 回落 |
| `plugins/workspace-config/test/panel-pair.test.ts` | 新建 | 协调器状态机 | 三种到场顺序 + 两种失败路径 + 幂等 dispose |
| `plugins/workspace-config/test/section-seat.poc.test.tsx` | 改 | 真 renderer 哨兵改挂 `main` | 场景 root 声明 `main`(keyed) → 页面注册并 `children` 声明 section → 贡献方软注册；断言 `only` 过滤、`{workspace}` 份额到达、切 tab 卸载、后装补跑、崩溃隔离 |
| `plugins/workspace-config/test/dialog.test.tsx` / `trigger.test.tsx` | 删 | 弹窗/入口已不存在 | 覆盖点迁入 `page.test.tsx` 与 PoC |
| `plugins/workspace-config/test/bundle.test.ts` | 改 | 产物锚点换面 | 断言 `"main"`、`"sidebar.panellist"`、`"workspace-config"`、section 字面量 ≥2；**断言不存在** `sidebar.footer.action` / `shell.overlay` / `workspace-config-trigger` / `workspace-config-dialog`；样式注入器仍恰 1；`client.inject` 仍不含 primitives |
| `plugins/workspace-config/artifacts/workspace-config-page-smoke.md` | 新建 | 页面化真机冒烟证据 | 侧栏行 / 进入 / 三 tab / 切换卸载 / 选择框联动 / 未分配空态 / 重进重置 / 无 dialog 残留；含可复算的浏览器断言 |
| `plugins/workspace-config/README.md` | 改 | 入口形态与文件清单 | 「footer 单入口 + 弹窗」整段改写为「侧栏面板 + 独立页面」；常量表删两个 order、加 `PANEL_ID/PANEL_ORDER`；测试计数与文件清单更新 |

### 1.2 `@dsh-plugins/contracts`（tooling，纯类型）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `tooling/contracts/src/index.ts` | 改 | 座位契约随页面化收敛（Q2/Q7） | `WorkspaceConfigSectionOwnerProps` 改为 `{ readonly workspace: WorkspaceConfigWorkspaceContext }`；新增三态上下文联合类型；删 `WorkspaceConfigTriggerOrder` / `WorkspaceConfigDialogOrder`；保留 `WorkspaceConfigSectionSeat` / `…Slot` / `…SectionOrder`；模块头「弹窗」话术改写 |
| `tooling/contracts/README.md` | 改 | 类型面清单 | owner 份额新形状 + 三态语义表 |
| `tooling/contracts/package.json` | —— | 治理面不变 | 仍 `private:true` / `0.0.0` / `dependencies:{}`（AR2 的 `runtime: []` 与 `scripts` 白名单不动） |

### 1.3 `dsh-plugin-session-tool-toggle`（贡献方 1）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` | 改 | 份额与寻址改由页面驱动 | props：去 `close`/`currentSessionId`，加 `workspace: WorkspaceConfigWorkspaceContext`；`kind!=='workspace'` → 渲染 `workspace.noTarget` 空态且**不发请求**；`kind==='workspace'` → 以 `{workspacePath: path}` 寻址，且 `<WorkspaceDefaultsTarget key={path}>` 让「换工作区 = 重挂重读」；`useWorkspaceDefaults` 删 `select`/`targetRef` |
| `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` | 改 | 删除节内工作区下拉（需求 3） | 删 `<select>` 行（`workspace.select`）与 `choices`/`onSelect` props；`missingChoice` 补偿逻辑删除；`dialog`/`section` 两形态保留，`dialog` 形态只余 `<h3>` + 正文 |
| `plugins/session-tool-toggle/src/client/index.ts` | 改 | 注入面瘦身 | 分节 `inject` 去掉 `currentSessionId`；`import { currentSessionIdOf }` 删除；其余（`resolveClient` 现取、双 try/catch、头部入口）不动 |
| `plugins/session-tool-toggle/src/client/seats.ts` | —— | 常量不变（`SECTION_ID`/`SECTION_ORDER=20`） | 注释改：owner 份额由 `{close}` 变 `{workspace}` |
| `plugins/session-tool-toggle/src/client/locales.ts` | 改 | 文案面 | 删 `workspace.select`；加 `workspace.noTarget`；zh/en 同步 |
| `plugins/session-tool-toggle/src/client/current-session.ts` | 删 | 事实迁往 holder（D12） | 本包不再有「当前会话」消费者 |
| `plugins/session-tool-toggle/test/client-index.test.ts` | 改 | 注入面契约 | 删 `currentSessionId` 相关用例；保留分节/头部注册面断言 |
| `plugins/session-tool-toggle/test/workspace-editor.test.tsx` | 改 | 无下拉 + 新份额 | 删 `combobox` 三处断言；新增「无有效目标空态」；`useWorkspaceDefaults` 用例去 `select`；份额夹具改 `{kind:'workspace',…}` |
| `plugins/session-tool-toggle/test/locale-parity.test.ts` | 改 | 键面同步 | `workspace.select` 出列、`workspace.noTarget` 入列 |
| `plugins/session-tool-toggle/README.md` | 改 | 分节形态 | 去掉「保留下拉」的落档说明，改「选择框由 holder 页面提供」 |

### 1.4 `dsh-plugin-web-ux`（贡献方 2）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/web-ux/src/client/SessionManagerDialog.tsx` | 改 | 份额 + 删除节内 Menu + `close` 语义流程内化（Q7/Q8） | props：去 `close`，加 `workspace`；`kind==='none'` → `manager.unavailable` 空态；`kind==='workspace'` → `choice = workspace.id`、`kind==='unassigned'` → `UNASSIGNED_CHOICE`（一行映射，行集函数零改）；删 `Menu`/`WORKSPACE_MENU_PORTAL`/`menuOpen`/`choices`/`choiceLabel`/`changeChoice`/默认档 effect；`key={choiceKey}` 让换工作区=重挂（phase 回 `select`）；footer 各阶段重写（见 3.10） |
| `plugins/web-ux/src/client/session-manager-model.ts` | 改 | 裁剪页面级投影职责 | 删 `workspaceChoices` / `defaultWorkspaceChoice` / `ManagerWorkspaceChoice`（迁入 holder 的 `workspace-choice.ts`）；`UNASSIGNED_CHOICE` / `WorkspaceChoiceId` / 行集函数原样保留 |
| `plugins/web-ux/src/client/index.ts` | —— | 分节注册面不变（`workspace` 由页面渲染时传入） | 仅注释：owner 份额 `{close}` → `{workspace}` |
| `plugins/web-ux/src/client/locales.ts` | 改 | 文案面 | `manager.close` → `manager.finish`（完成/Done）；删 `manager.workspace.label` / `manager.workspace.unassigned`（已无消费者）；zh/en 同步 |
| `plugins/web-ux/test/session-manager-dialog.test.tsx` | 改 | 交互面重钉 | 删「打开工作区 Menu / 切换工作区」用例；新增「select 阶段无取消按钮」「done/failed 的完成 → 回 select」「workspace 份额三态渲染」 |
| `plugins/web-ux/test/session-manager-model.test.ts` | 改 | 纯函数面 | 删两个已迁走函数的用例 |
| `plugins/web-ux/test/locale-parity.test.ts` | 改 | 键面同步 | 三条出列 / `manager.finish` 入列 |
| `plugins/web-ux/README.md` | 改 | 会话管理面 | 「节内下拉 / 关闭」话术改为「页面选择框 / 完成」 |

### 1.5 `dsh-plugin-multi-root-workspace`（贡献方 3）

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` | 改 | 份额对齐 + Q8 空态 | props：`close` → `workspace?: WorkspaceConfigWorkspaceContext`（可选，供 Files tab launcher 复用）；页内份额 `kind!=='workspace'` → 渲染 `panel.noWorkspace` 空态；launcher（无份额）保持原正文；数据仍按当前会话寻址（非目标：不改业务） |
| `plugins/multi-root-workspace/src/client/index.ts` | —— | 分节注册面不动 | 仅注释更新（owner 份额） |
| `plugins/multi-root-workspace/src/client/locales.ts` | 改 | 新空态文案 | 加 `panel.noWorkspace`；zh/en 同步 |
| `plugins/multi-root-workspace/test/client-panel.spec.tsx` | 改 | 两形态 | 页内份额为空/未分配 → 空态；launcher 形态（无份额）仍渲染正文 |
| `plugins/multi-root-workspace/test/locale-parity.spec.ts` | 改 | 键面同步 | 新键入列 |
| `plugins/multi-root-workspace/docs/decisions/ADR-0013-*.md` | 改 | 历史记录注记（不重写正文） | 末尾追加一行：「2026-11-08-workspace-config-page：holder 的弹窗壳已改为独立页面，本节仍为分节贡献方」 |

### 1.6 规范与仓级文档

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `openspec/specs/dsh-workspace-config-entry/spec.md` | 改 | 四条 requirement 改写（见 ⑤ G8） | 「footer 单入口可见性」「统一弹窗与分节导航」整条重写；「分节贡献机制」按 owner 份额改；「降级与安装矩阵」调整话术；**新增**「统一工作区选择框」一条；spec id 不变 |
| `openspec/changes/2026-11-08-workspace-config-page/{proposal,tasks,design}.md` | 新建 | 阶段 2/3 产物（本设计不写） | tasks 按 ⑤ 的 G1–G8 分组 |
| `README.md`（仓根 `:68`、`:98`） | 改 | 入口形态与安装矩阵话术 | 「footer 单入口 + 统一弹窗」→「侧栏面板 + 独立页面」；四包同装语义不变 |
| `AGENTS.md`（仓级 `:30`） | 改 | 插件一览一句话 | 同步入口描述（`main` + `sidebar.panellist`） |

---

## ② 证据锚

> 每条都是可复算的代码事实（行号对应当前 checkout）。DSH 侧证据标注为「上游」。

### 2.1 holder 现状（要拆的东西）

| 模块 | 证据 | 事实 |
|---|---|---|
| 装配 | `plugins/workspace-config/src/client/index.ts:77` | `inject = ['slots','locale']`（唯一依赖面） |
| 装配 | `plugins/workspace-config/src/client/index.ts:94-111` | footer 入口注册：`name:'sidebar.footer.action'` + `id: TRIGGER_ID` + `order: 50` + `locale` + `inject→{open}` |
| 装配 | `plugins/workspace-config/src/client/index.ts:116-139` | overlay 注册：`name:'shell.overlay'` + `id: DIALOG_ID` + `order: 530` + `children:{'workspace-config.section':{kind:'list',scope:'root'}}` + `inject→{open,sections}` |
| 装配 | `plugins/workspace-config/src/client/index.ts:56-61` | 对外 re-export（类型 + 三个运行时常量）——契约消费方唯一入口 |
| 契约 | `plugins/workspace-config/src/client/contract.ts:48` | 座位名字面量 `'workspace-config.section'` |
| 契约 | `plugins/workspace-config/src/client/contract.ts:56` / `:64` | 两个已废弃 order 运行时值（50 / 530） |
| 契约 | `plugins/workspace-config/src/client/contract.ts:66-75` | `declare module` 的 `SlotMap` 增补（holder 侧） |
| 投影 | `plugins/workspace-config/src/client/sections.ts:35-42` | nav 行形状 `{id,order,label}`（页面 tab 行直接复用） |
| 投影 | `plugins/workspace-config/src/client/sections.ts:139-147` | 双版本记忆（slot 版本 + locale 版本）→ identity 稳定 |
| 弹窗 | `plugins/workspace-config/src/client/WorkspaceConfigDialog.tsx:151` | 现 owner 份额实参 `renderSlot('workspace-config.section', { close: open.close }, { only: activeId })` |
| 弹窗 | `plugins/workspace-config/src/client/WorkspaceConfigDialog.tsx:94` | 关闭态 `return null`（overlay 语义的遗留约束） |
| 入口 | `plugins/workspace-config/src/client/WorkspaceConfigTrigger.tsx:54-77` | footer 按钮（宽/折叠两形态 + `aria-haspopup="dialog"`） |
| 桥 | `plugins/workspace-config/src/client/open-store.ts:49` | `createOpenStore()`（入口写 / 弹窗订阅） |
| 文案 | `plugins/workspace-config/src/client/locales.ts:26` / `:29-44` / `:63-68` | NS=`workspaceConfig`、zh 键面、`LocaleNamespaceMap` 增补 |
| 样式 | `plugins/workspace-config/src/client/dialog.module.css:17-24` | 类名契约清单（弹窗与入口） |
| 构建 | `plugins/workspace-config/build.mjs:25` | `buildPlugin({ root, cssClassPrefix: 'wsc' })` |
| 产物断言 | `plugins/workspace-config/test/bundle.test.ts:46-53` | section 字面量 ≥2（声明 + 渲染） |
| 产物断言 | `plugins/workspace-config/test/bundle.test.ts:55-62` | 断言内联 `sidebar.footer.action` / `shell.overlay` 与两个旧 entry id（**本次必须反转为不存在**） |
| 产物断言 | `plugins/workspace-config/test/bundle.test.ts:78-83` | 样式注入器恰 1 个（`data-dsh-css`） |
| 座位 PoC | `plugins/workspace-config/test/section-seat.poc.test.tsx:204-208` / `:276` | 真 renderer 场景：`shell.overlay` 持有者 + `renderSlot(...,{close},{only})` |

### 2.2 契约包（要改的东西）

| 模块 | 证据 | 事实 |
|---|---|---|
| 契约 | `tooling/contracts/src/index.ts:47` | `WorkspaceConfigSectionSeat = 'workspace-config.section'`（跨包字面量权威） |
| 契约 | `tooling/contracts/src/index.ts:54-57` | owner 份额当前**只有** `close` |
| 契约 | `tooling/contracts/src/index.ts:75-82` | 条目形状 `{kind:'list',scope:'root',owner}` |
| 契约 | `tooling/contracts/src/index.ts:94` / `:102` | `TriggerOrder=50` / `DialogOrder=530`（两个待删字面量） |
| 契约 | `tooling/contracts/src/index.ts:111` | `SectionOrder = 10 | 20 | 30`（保留） |
| 治理 | `tooling/contracts/package.json:17` | `dependencies: {}`（AR2 `runtime: []` 的载体） |
| 门禁 | `scripts/check-architecture.mjs:150-168` | `TOOLING_CONTRACT.contracts = { runtime: [], scripts: ['lint','typecheck'] }`（**加 test 脚本会失败**） |
| 门禁 | `scripts/check-architecture.mjs:644` | `REQUIRED_PACKAGES` 恰五条（AR7；新增第五个 tooling 包需改这里） |
| 门禁 | `scripts/check-architecture.mjs:114` | AR1：内部包不得进 `dependencies`（类型包只进 devDeps） |

### 2.3 stt（贡献方 1）

| 模块 | 证据 | 事实 |
|---|---|---|
| 分节注册 | `plugins/session-tool-toggle/src/client/index.ts:203-229` | `SECTION_SEAT` + `id: SECTION_ID` + `order: SECTION_ORDER(20)` + `label: () => t('section.label')` + `inject: {resolveClient, currentSessionId}` |
| 座位常量 | `plugins/session-tool-toggle/src/client/seats.ts:71-74` | `SECTION_SEAT` 字面量 + `SECTION_ID` |
| 分节正文 | `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx:322-336` | props：`resolveClient` / `currentSessionId` / `t` / `close` |
| 分节正文 | `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx:351-389` | 挂载即 `read()`；`initialTarget` 由 `currentSessionId()` 造 `{sessionId}` |
| 状态机 | `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx:304-309` | `select(key)` 写 `{workspacePath}` 并重读（下拉的唯一职责） |
| 编辑器 | `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx:254-292` | `dialog` 形态的 `<h3>` + `<select>`（`workspace.select`）+ 刷新按钮 |
| 契约 | `plugins/session-tool-toggle/src/contract.ts:232-241` | `WorkspaceRequest` 两种寻址：`{sessionId}` / `{workspacePath}` |
| 契约 | `plugins/session-tool-toggle/src/contract.ts:318-323` | `WorkspaceChoice.key` = 规范路径（写入键） |
| 契约 | `plugins/session-tool-toggle/src/contract.ts:472-484` | `WorkspaceValue`（`workspace` / `choices` / `universe`） |
| 当前会话 | `plugins/session-tool-toggle/src/client/current-session.ts:55` | 两步探测（`snapshot.current` → `byId[*].retainedBy.mainView>0`）；`:10` 自述「移植 multi-root」——同类移植在仓内有先例 |
| 宿主选择集 | `plugins/session-tool-toggle/src/host/index.ts:547-552` | 宿主 `workspaceChoices()` = registry `path`（realpath）；与客户端 `workspace.path` 同键空间（见 2.6） |

### 2.4 web-ux（贡献方 2）

| 模块 | 证据 | 事实 |
|---|---|---|
| 份额 | `plugins/web-ux/src/client/SessionManagerDialog.tsx:243-245` | `SessionManagerSectionProps = WorkspaceConfigSectionOwnerProps & PropsLocale & Injected`（即含 `close`） |
| 份额 | `plugins/web-ux/src/client/SessionManagerDialog.tsx:398` | 内部 `close` 字段声明（5 处消费之一） |
| 选择框 | `plugins/web-ux/src/client/SessionManagerDialog.tsx:446-452` | `workspaceChoices` → `useState(defaultWorkspaceChoice(...))`（节内自持选择） |
| 选择框 | `plugins/web-ux/src/client/SessionManagerDialog.tsx:860-892` | 节内 `Menu`（锚点按钮 + `items` + `selectedId` + `portal`） |
| 关闭语义 | `plugins/web-ux/src/client/SessionManagerDialog.tsx:815` / `:839` / `:842` / `:847` | footer 四处 `onClick={close}`（select 取消 / running 禁用 / done 关闭 / failed 关闭） |
| 模型 | `plugins/web-ux/src/client/session-manager-model.ts:324-333` | `workspaceChoices`（真实工作区 + 末项 unassigned） |
| 模型 | `plugins/web-ux/src/client/session-manager-model.ts:345-363` | `defaultWorkspaceChoice`（成员会话 max updatedAt，无则 unassigned） |
| 哨兵 | `plugins/web-ux/src/client/session-manager-model.ts:65` | `UNASSIGNED_CHOICE = 'unassigned'`（插件内部哨兵，**不进契约**） |

### 2.5 multi-root（贡献方 3）

| 模块 | 证据 | 事实 |
|---|---|---|
| 份额 | `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx:55-79` | props 里 `close` 必填；`WorkspaceFoldersSectionInjected = Omit<…, 'close'|'t'>`；`WorkspaceFoldersLauncherProps = Omit<…,'close'>` |
| launcher | `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx:189` | Files tab 里把同一节正文就地展开（`close` 由本地 `setExpanded` 填）→ 本设计改成「无份额」形态 |
| 空态 | `plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx:200-203` | `SectionState.noSession` 已有「无目标」状态可复用 |
| 端点 | `plugins/multi-root-workspace/src/contract.ts:130-137` | 每个端点都要求 `sessionId`（→ 无法按 workspaceId 寻址，见 D13 前提） |
| 文案 | `plugins/multi-root-workspace/src/client/locales.ts:32` | `panel.noSession`（与新增 `panel.noWorkspace` 并列） |

### 2.6 DSH 上游（只读参照，证明配方可行）

| 事实 | 证据 |
|---|---|
| `main` 座位是 `keyed` / `root`、无 owner 份额 | `dsh-client-ui-layout/lib/types/client/index.d.ts:54-57` |
| 页面经 `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })` 渲染（一次性渲染选中键） | `dsh-client-ui-layout/lib/client.js:127` |
| `selectPanel(id)` 对未注册的 main key **直接 throw**（配对协调器存在的直接原因） | `dsh-client-ui-layout/lib/client.js:522-523` |
| `main` 注册可带 `store`，但 renderer 对无 store 的 entry 返回 `undefined`（→ 本页不需要 store） | `dsh-client-ui-renderer/lib/client.js:1664` + `standardKit` 仅在 `store !== undefined` 时给 `useStore/actions` |
| 官方两页的 main 注册形状（`name/key/locale/store/inject/children`） | `dsh-client-ui-plugin-manager/lib/client.js:7744-7760`、`dsh-client-ui-schedule/lib/client.js:19360-19385` |
| `sidebar.panellist` 形状与 owner 份额 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:47-51`、`:101-106`（`{size, active}`） |
| 侧栏行把 `options.id` 当 main key：`usePanelInfo` 判活 + `selectPanel(id)` | `dsh-client-ui-sidebar/lib/client.js:206-236`、`:689-703`、`:719-721` |
| 插件页页面骨架（`page/pageBody/pageBar/pageHead/pageHeading/pageTitle/pageIntro/toolbar/pageTabs/pageTabList/tabPanel`）与 tab↔panel id 互指 | `dsh-client-ui-plugin-manager/lib/client.js:7104-7215`、`:7207-7215` |
| 插件页正文滚动容器 `overflow:hidden auto`（锚定菜单必须 portal，否则被裁） | `dsh-client-ui-plugin-manager/lib/client.js:4219`（`.X_2TxG_pageBody{…overflow:hidden auto}`） |
| `Menu` 的 `portal` 默认 `false`，文档明写「祖先 overflow 裁切时用 portal」 | `@deepseek-ai/dsh-client-ui-primitives/lib/types/Menu.d.ts:102-105` |
| `SegmentedTabs` 要求非空 items 元组、`id`/`panelId` 由调用方给 | `@deepseek-ai/dsh-client-ui-primitives/lib/types/SegmentedTabs.d.ts:6-24` |
| `slots.inject` 语义：座位已声明则同步执行；否则在声明提交后补跑；声明塌陷则 dispose、再声明再跑 | `dsh-client-ui-renderer/lib/types/client/registry.d.ts:97-112` |
| entry 的 `inject` 工厂**每 entry 只跑一次**（缓存） | `dsh-client-ui-renderer/lib/client.js:431`、`:500-505` |
| `register` 的 disposer 塌陷该 entry 声明的所有子座位（生命周期单轴） | `@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts:781-783` |
| loader 对 `dsh.client.inject` 里**不在图里的包是跳过**的（`if (dependency !== void 0)`） | `dsh-client-modules/lib/client.js:791` |
| `WorkspaceView.path` 是 **canonical host directory path**（与 stt 的 `workspacePath` 同键空间） | `@deepseek-ai/dsh-api-workspace-controller/lib/types/types.d.ts:13-25` |
| `SessionSummary` 有 `cwd` / `updatedAt` / `retainedBy` | `@deepseek-ai/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:17-48` |
| CSS module 每文件一个注入器、按「包+模块」双维度防重 | `tooling/build-kit/src/css.mjs:8-11`、`:80-95` |
| 测试替身并集已含 `SegmentedTabs` / `Menu` / `Menu` portal 分支 / `IconWorkspaceTreeOutlineRegular` | `tooling/test-kit/src/ui-primitives.tsx:285-330`、`:384-440`、`:82` |

---

## ③ 接口与数据形状

### 3.1 契约包（`tooling/contracts/src/index.ts`）

```ts
/** 座位名权威（不变）。 */
export type WorkspaceConfigSectionSeat = 'workspace-config.section'

/**
 * 页面级工作区上下文（owner 份额的载荷，纯数据、无回调）。
 * - `workspace`：选中一个已登记工作区；三个寻址键都给，分节各取所需。
 * - `unassigned`：选择框的「未分配」特殊项（Q8；恒排在最后）。
 * - `none`：页面拿不到工作区上下文（工作区服务未就绪 / 列表为空前的降级）。
 */
export type WorkspaceConfigWorkspaceContext =
  | {
      readonly kind: 'workspace'
      /** Host WorkspaceId（web-ux 的行集寻址键）。 */
      readonly id: string
      /** 显示标题；空串由消费方用 path 兜底。 */
      readonly title: string
      /** 规范绝对路径（stt 的 `{ workspacePath }` 寻址键，与 `WorkspaceView.path` 同源）。 */
      readonly path: string
    }
  | { readonly kind: 'unassigned' }
  | { readonly kind: 'none' }

/** 分节座位的 owner 份额：只剩一份纯数据（`close` 已删，Q7）。 */
export interface WorkspaceConfigSectionOwnerProps {
  readonly workspace: WorkspaceConfigWorkspaceContext
}

/** 条目形状（不变，只是 owner 换成上面）。 */
export interface WorkspaceConfigSectionSlot {
  kind: 'list'
  scope: 'root'
  owner: WorkspaceConfigSectionOwnerProps
}

/** 三节 order 权威集合（不变）。 */
export type WorkspaceConfigSectionOrder = 10 | 20 | 30
```

**删除**：`WorkspaceConfigTriggerOrder`（原 50）、`WorkspaceConfigDialogOrder`（原 530）。

### 3.2 holder 内部常量（`src/client/contract.ts`）

```ts
import type { WorkspaceConfigSectionSlot } from '@dsh-plugins/contracts'

export type {
  WorkspaceConfigSectionOwnerProps,
  WorkspaceConfigSectionSeat,
  WorkspaceConfigWorkspaceContext,
} from '@dsh-plugins/contracts'

/** 分节座位名（holder 内部运行时常量；权威类型见契约包）。 */
export const WORKSPACE_CONFIG_SECTION = 'workspace-config.section' as const

/** 面板 id：**同时**是 main 的 key 与 sidebar.panellist 的 id（Q6）。 */
export const PANEL_ID = 'workspace-config' as const

/** 侧栏面板位次：官方面板 plugins=0 / schedules=10 之后（Q5）。 */
export const PANEL_ORDER = 20 as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workspace-config.section': WorkspaceConfigSectionSlot
  }
}
```

### 3.3 `main` / `sidebar.panellist` 双注册的 options 形状（`src/client/index.ts`）

```ts
const pair = createPanelPair((message, error) => {
  ctx.logger?.warn(`workspace-config: ${message}`)
  if (error !== undefined) ctx.logger?.warn(error)
})

/** ① 页面：main（keyed、root，无 owner 份额、无 store）。 */
ctx.slots.inject('main', () =>
  pair.page(() =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,                    // 'workspace-config'（= panellist 的 id）
        locale: NS,
        // 声明即认领：贡献方的软注册回调在此之后才有机会执行。
        children: { 'workspace-config.section': { kind: 'list', scope: 'root' } },
        // 端口函数（非服务值）：inject 工厂每 entry 只跑一次，服务要现取。
        inject: (): WorkspaceConfigPageInjected => ({
          sections,                                  // apply 期构造的 nav 行投影源
          workspaces,                                // apply 期构造的工作区清单源
          currentSessionId: () => currentSessionIdOf(ctx),
          sessionUsage: () => sessionUsageOf(ctx),
        }),
      },
      WorkspaceConfigPage,
    ),
  ),
)

/** ② 侧栏行：sidebar.panellist（list、root，owner `{size, active}`）。 */
ctx.slots.inject('sidebar.panellist', () =>
  pair.row(() =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,                     // 必须等于 main 的 key：宿主 selectPanel(id) 直接用它
        order: PANEL_ORDER,               // 20
        locale: NS,
        label: () => t('entry.label'),    // thunk：locale 切换无需重注册
      },
      WorkspaceConfigPanelIcon,
    ),
  ),
)
```

两处都不各自 `try/catch`，而是经 `createPanelPair`（3.4）配对：任一侧失败只 `logger.warn`，最终观感是「没有这一行」，不是「行在但点了抛错」。

### 3.4 双注册协调器（`src/client/panel-pair.ts`）

```ts
export interface PanelPair {
  /**
   * 在 main 座位回调里装页面；成功后若行座位已到场则补装行。
   * @param install 装页面并返回 disposer；抛错即视为失败。
   * @returns 该座位效应的 disposer（幂等）。
   */
  page(install: () => () => void): () => void
  /**
   * 在 sidebar.panellist 座位回调里登记行座位已到场。
   * @param install 装行并返回 disposer。
   * @returns 该座位效应的 disposer（幂等）。
   */
  row(install: () => () => void): () => void
}

export function createPanelPair(warn: (message: string, error?: unknown) => void): PanelPair
```

状态机（四个变量即可）：`pageDispose?: () => void`、`rowInstall?: () => () => void`、`rowDispose?: () => void`、`rowSeatLive: boolean`。
不变式：
1. `rowDispose` 存在的充要条件是「页面已装 **且** 行座位在」；
2. `page()` 的 disposer 先摘行、再摘页面（页面塌陷会连坐 `workspace-config.section` 子座位，顺序不能反）；
3. 任一步抛错只 `warn`，另一侧不受影响（与旧两处 try/catch 的「最坏是入口不出现」同一条纪律）；
4. 两种到场顺序都收敛到同一终态（`main` 先 / `panellist` 先）。

### 3.5 页面组件 props（`src/client/WorkspaceConfigPage.tsx`）

```ts
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** apply 期单例/端口的注入面。 */
export interface WorkspaceConfigPageInjected {
  /** nav 行投影源（分节账本 + locale 双版本记忆）。 */
  readonly sections: WorkspaceConfigSectionsSource
  /** 工作区清单源（`pending | ready`，服务晚到自动转 ready）。 */
  readonly workspaces: WorkspaceListSource
  /** 当前会话 id（每次现取，服务缺席返回 undefined）。 */
  readonly currentSessionId: () => string | undefined
  /** 会话 `updatedAt` 读数（每次现取，服务缺席返回 undefined）。 */
  readonly sessionUsage: () => SessionUsageSnapshot | undefined
}

/**
 * 完整 props：main 的运行时份额（`{}` + 全局标准座，含 layout 合并进来的 `usePanelInfo`）
 * + 已声明子座位的 renderSlot 能力 + 本命名空间 `t` + 注入面。
 */
export type WorkspaceConfigPageProps = PropsRuntime<'main'>
  & PropsRenderSlots<'workspace-config.section'>
  & PropsLocale<typeof NS>
  & WorkspaceConfigPageInjected

/** 页面壳。 */
export function WorkspaceConfigPage(props: WorkspaceConfigPageProps): ReactNode
```

渲染树（与插件页同构，**去掉**吸顶/紧凑测量）：

```text
div.page(data-wc-page)
├─ div.pageBody
│  ├─ div.pageBar
│  │  └─ header.pageHead
│  │     ├─ div.pageHeading > h1.pageTitle + p.pageIntro
│  │     ├─ div.toolbar > (span.toolbarLabel + WorkspacePicker) | span.pickerUnavailable
│  │     └─ div.pageTabs > SegmentedTabs(size='sm', className=pageTabList)
│  └─ div[role=tabpanel, id=`${tabsId}-${activeId}-panel`, aria-labelledby=`${tabsId}-${activeId}`].tabPanel
│     └─ renderSlot('workspace-config.section', { workspace }, { only: activeId })
└─ （无分节时 pageBody 内只有 .empty[role=status]）
```

状态与派生（全部本地，Q3/Q9）：

```ts
const rows = useSyncExternalStore(sections.subscribe, sections.getSnapshot)      // 稳定数组
const list = useSyncExternalStore(workspaces.subscribe, workspaces.getSnapshot)  // { phase, items }
const [selected, setSelected] = useState<string | undefined>(undefined)          // tab
const [chosen, setChosen] = useState<WorkspaceConfigWorkspaceContext | undefined>(undefined) // 选择框

const activeId = rows.some((r) => r.id === selected) ? selected : rows[0]?.id

// 选择值：手选优先；手选值失效（工作区被删）或未手选时按 Q10 重解析。
const chosenValid = chosen !== undefined
  && (chosen.kind === 'unassigned' || list.items.some((item) => item.id === chosen.id))
const workspace: WorkspaceConfigWorkspaceContext = chosenValid
  ? chosen
  : list.phase === 'ready'
    ? defaultSelection(list.items, sessionUsage()?.updatedAtById, currentSessionId())
    : NO_CONTEXT
```

`chosen` 只由选择框写入；工作区被删/列表变化时 `chosen` 不再命中 → 按默认策略重解析（与 web-ux 既有 `choices.some(...)` 回退同一条口径）。

### 3.6 工作区清单投影（`src/client/workspace-source.ts`）

```ts
/** 选择框/默认策略用的一行（纯数据；`sessionIds` 只用于「最近使用」）。 */
export interface WorkspaceChoiceItem {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

/** 清单快照：`pending` = workspaces 服务未就绪（页面仍可渲染，份额给 `{kind:'none'}`）。 */
export interface WorkspaceListSnapshot {
  readonly phase: 'pending' | 'ready'
  readonly items: readonly WorkspaceChoiceItem[]
}

/** uSES 可用的只读源（getSnapshot 保证 identity 稳定）。 */
export interface WorkspaceListSource {
  getSnapshot(): WorkspaceListSnapshot
  subscribe(listener: () => void): () => void
}

/**
 * 建一个工作区清单源：`ctx.inject(['workspaces'], …)` 绑定 `list.getSnapshot/subscribe`；
 * 服务退场回落 `pending` 并通知；同一快照内容不重建（identity 稳定）。
 */
export function createWorkspaceListSource(ctx: ClientContext): WorkspaceListSource
```

投影规则：`items = snapshot.items.map((w) => ({ id: w.workspaceId, title: w.title, path: w.path, sessionIds: w.sessionIds }))`，**保持 Host 顺序**（不按标题排序，与侧栏一致）。

### 3.7 选择值策略（`src/client/workspace-choice.ts`，纯函数）

```ts
export const UNASSIGNED: WorkspaceConfigWorkspaceContext = { kind: 'unassigned' }
export const NO_CONTEXT: WorkspaceConfigWorkspaceContext = { kind: 'none' }

/** 选择框的候选：真实工作区（Host 顺序）+ 末项「未分配」（Q8）。 */
export function pickerItems(items: readonly WorkspaceChoiceItem[]): readonly WorkspaceConfigWorkspaceContext[]

/** 把一条清单行变成选择值。 */
export function selectionOfItem(item: WorkspaceChoiceItem): WorkspaceConfigWorkspaceContext

/** Menu 行 id：`workspace:<id>` / `unassigned` / `none`（唯一编解码点）。 */
export function selectionKeyOf(selection: WorkspaceConfigWorkspaceContext): string
export function selectionFromKey(
  key: string,
  items: readonly WorkspaceConfigWorkspaceContext[],
): WorkspaceConfigWorkspaceContext | undefined

/**
 * 默认选择（Q10：最近使用 > 当前会话 > 第一项；无工作区 → 未分配）。
 * 1) 每个工作区取成员会话的最大 `updatedAt`，取最大者（并列取 Host 顺序在前）；
 * 2) 无任何 `updatedAt > 0` 时，取「当前会话所属工作区」（`sessionIds` 命中）；
 * 3) 否则取 `items[0]`；`items` 为空取 `UNASSIGNED`。
 */
export function defaultSelection(
  items: readonly WorkspaceChoiceItem[],
  usage: Readonly<Record<string, { readonly updatedAt: number }>> | undefined,
  currentSessionId: string | undefined,
): WorkspaceConfigWorkspaceContext

/** 显示文案：`title` 非空用它，否则用 `path`，二者皆空用调用方兜底（未分配/未就绪文案）。 */
export function selectionLabelOf(
  selection: WorkspaceConfigWorkspaceContext,
  fallback: string,
): string
```

会话读数（`src/client/session-context.ts`）：

```ts
/** 当前会话 id（两步探测：`snapshot.current` → `byId[*].retainedBy.mainView > 0`）。 */
export function currentSessionIdOf(ctx: ClientContext): string | undefined

/** 会话 `updatedAt` 投影（只取默认策略要的两栏；服务缺席返回 undefined）。 */
export interface SessionUsageSnapshot {
  readonly updatedAtById: Readonly<Record<string, { readonly updatedAt: number }>>
}
export function sessionUsageOf(ctx: ClientContext): SessionUsageSnapshot | undefined
```

两者都是**结构软读 + 每次现取**（照搬 `plugins/session-tool-toggle/src/client/current-session.ts` 的既有实现与其 `getSnapshot` 必须按方法调用的教训）。

### 3.8 选择框组件（`src/client/WorkspacePicker.tsx`）

```ts
export interface WorkspacePickerProps {
  /** 候选（末项恒为 `{kind:'unassigned'}`；空清单时只有它）。 */
  readonly items: readonly WorkspaceConfigWorkspaceContext[]
  /** 当前值。 */
  readonly value: WorkspaceConfigWorkspaceContext
  /** 未就绪/禁用。 */
  readonly disabled?: boolean
  /** 本命名空间翻译。 */
  readonly t: TranslateNS<typeof NS>
  /** 选择变化（值而非 key；key 编解码留在组件内）。 */
  readonly onSelect: (next: WorkspaceConfigWorkspaceContext) => void
}
```

`Menu` 必用 `portal`：页面正文是滚动容器（插件页同款 `overflow:hidden auto`，证据见 2.6），in-place 列表会被裁切。
锚点按钮：`aria-label={t('page.workspace.label')}`、`aria-haspopup="menu"`、`aria-expanded={open}`、`disabled`。
`value` 为 `{kind:'none'}` 时按钮文案取 `t('page.workspace.unavailable')` 并禁用（候选里没有 `none`，`selectedId` 自然不命中）。
行：`{ id: selectionKeyOf(item), label: selectionLabelOf(item, t('page.workspace.unassigned')) }`，`selectedId = selectionKeyOf(value)`。

### 3.9 三个贡献方的分节 props（份额消费矩阵）

| 份额值 | stt（`WorkspaceDefaultsSectionProps`） | web-ux（`SessionManagerSectionProps`） | multi-root（`WorkspaceFoldersSectionProps`） |
|---|---|---|---|
| `{kind:'workspace', …}` | `{ workspacePath: path }` 读/写；`<Target key={path}>` 换工作区即重挂重读 | `choice = id`（真实工作区行集） | gate 通过；正文仍按当前会话（非目标：不改业务） |
| `{kind:'unassigned'}` | 空态 `workspace.noTarget`，**不发请求** | `choice = UNASSIGNED_CHOICE`（孤儿归档/已迁移行集） | 空态 `panel.noWorkspace` |
| `{kind:'none'}` | 空态 `workspace.noTarget` | 空态 `manager.unavailable` | 空态 `panel.noWorkspace` |
| 份额缺席（仅 multi-root 的 Files tab launcher） | 不存在 | 不存在 | 正常正文（沿用旧行为） |

```ts
// stt
export interface WorkspaceDefaultsSectionProps {
  readonly workspace: WorkspaceConfigWorkspaceContext
  readonly resolveClient: () => PanelClient | undefined
  readonly t: Translate
}
export interface UseWorkspaceDefaultsOptions {
  readonly resolveClient: () => PanelClient | undefined
  /** 每次读取现取的目标（本变更后固定为 `{ workspacePath }`）。 */
  readonly initialTarget: () => WorkspaceRequest
}
export interface WorkspaceDefaults extends WorkspaceDefaultsState {
  readonly read: () => Promise<void>
  readonly update: (action: WorkspaceAction, addresses?: readonly string[]) => Promise<void>
}

// web-ux（owner 份额由契约包给）
export type SessionManagerSectionProps = WorkspaceConfigSectionOwnerProps
  & PropsLocale<typeof NS>
  & SessionManagerSectionInjected        // { client?, workspaces?, sessions? }（不变）

// multi-root（可选，兼容 launcher）
export interface WorkspaceFoldersSectionProps {
  readonly workspace?: WorkspaceConfigWorkspaceContext
  readonly t: Translate
  readonly panel: PanelClient | undefined
  readonly pickDirectory: (() => Promise<string | null>) | undefined
  readonly sessionId?: () => string | undefined
}
```

`WorkspaceDefaultsEditor` 同步瘦身：props 删 `choices` / `onSelect`（`variant` 保留，`dialog` 形态不再渲染 `<select>` 行）。

### 3.10 web-ux footer 各阶段（Q7 落地）

| 阶段 | 变更前 | 变更后 |
|---|---|---|
| `select` | `[取消]`（`close`）+ 动作按钮 | **删掉取消按钮**，只剩动作按钮（页面无关闭义务） |
| `confirm` | `[返回]` + 执行 | 不变 |
| `running` | `[取消]`（`close`，`disabled`） | 保持禁用态；**去掉 `onClick`**（禁用按钮本就不会回调） |
| `done` | `[关闭]`（`close`） | `[完成]`（`manager.finish`）→ `resetToSelect()` |
| `failed` | `[返回]` + `[关闭]`（`close`） | `[返回]` + `[完成]` → `resetToSelect()`（终点态统一出口） |

### 3.11 文案键面

**holder（NS `workspaceConfig`）**

| 键 | zh | en |
|---|---|---|
| `entry.label` | 工作区配置 | Workspace settings |
| `page.title` | 工作区配置 | Workspace settings |
| `page.intro` | 按类别管理工作区设置；上方选择框决定本页作用的工作区。 | Manage workspace settings by category; the picker above chooses the workspace this page applies to. |
| `page.tabs.label` | 配置分类 | Settings categories |
| `page.empty.title` | 暂无可配置的分节 | No settings sections |
| `page.empty.hint` | 安装提供配置分节的插件后，对应分节会出现在这里。 | Install a plugin that provides a settings section, and it will appear here. |
| `page.workspace.label` | 工作区 | Workspace |
| `page.workspace.unassigned` | 未分配 | Unassigned |
| `page.workspace.unavailable` | 工作区列表尚未就绪 | Workspace list is not ready yet |

**stt**：删 `workspace.select`；增 `workspace.noTarget`（zh「请先在上方选择一个工作区」/ en「Choose a workspace above first」）。
**web-ux**：`manager.close` → `manager.finish`（完成 / Done）；删 `manager.workspace.label`、`manager.workspace.unassigned`。
**multi-root**：增 `panel.noWorkspace`（zh「尚未选择工作区」/ en「No workspace selected」）。

### 3.12 CSS 类名契约（`page.module.css`，前缀 `wsc`）

`page` / `pageBody` / `pageBar` / `pageHead` / `pageHeading` / `pageTitle` / `pageIntro` / `toolbar` / `toolbarLabel` / `pageTabs` / `pageTabList` / `tabPanel` / `empty` / `emptyTitle` / `emptyHint` / `picker` / `pickerName` / `pickerUnavailable`。

几何纪律：`.page{height:100%;display:flex;flex-direction:column;align-items:center;padding:0 var(--wc-page-inset, clamp(24px,4vw,48px))}`；`.pageBody{flex:1;min-height:0;overflow-y:auto;width:100%}`；`.pageBody>*{max-width:960px;width:100%}`。颜色只写 `var(--dsw-alias-*, currentColor|color-mix(...))`——**不复制**插件页的吸顶/紧凑测量变量（D8）。

---

## ④ 决策记录

> 只记代码级取舍。Q1–Q10 是既定结论，此处只写「怎么落」的被否方案与反例。

### D1 页面注册用 `main`（keyed）且**不带 store** — 被否：照抄插件页 navigation store

- **被否方案**：`createNavigationStore()` + `store` + `PropsStore`，把 tab/选择值放进 store。
- **理由**：本页没有跨插件导航需求，Q9 已接受「切走即重置」，store 只会把状态寿命拉长到与承诺相反；且多一层 `EngineStoreHandle` 样板与 `useStore/actions` 依赖。
- **反例**：renderer 对无 store 的 entry `storeOf` 返回 `undefined`（`dsh-client-ui-renderer/lib/client.js:1664`），`standardKit` 只在 `store !== undefined` 时注入 `useStore`——不声明 store 是**受支持**路径，不是省略。
- **代价**：tab 与选择值都在组件本地 state，重进页面即重置（与 Q9 一致）。

### D2 双注册用配对协调器 — 被否：沿用「两处各自独立 try/catch」

- **被否方案**：`main` 与 `sidebar.panellist` 各自 `inject + try/catch`，与旧 footer/overlay 同构。
- **理由**：旧两处是**两个独立能力**（入口 + 弹窗），现在是一对**必须同生共死**的注册。行在而页面不在时，宿主自己的点击处理器会炸。
- **反例**：`LayoutController.selectPanel` 对未注册 key 直接 `throw new Error('layout.selectPanel: main panel "…" is not registered')`（`dsh-client-ui-layout/lib/client.js:522-523`）——从插件里无法拦截。
- **代价**：多一个 30 行状态机 + 一个测试文件。

### D3 份额用 `kind` 判别，不共享 magic string — 被否：契约里放 `'unassigned'` 常量

- **被否方案**：`export const UNASSIGNED_CHOICE = 'unassigned'` 进契约包，holder 与 web-ux 共用。
- **理由**：web-ux 内部已有同名哨兵（`session-manager-model.ts:65`），共用字符串会让「偶合」看起来像契约；用 `kind` 后 web-ux 只需一行映射，行集函数与它们的既有测试零改动（只删两个迁往 holder 的投影函数）。
- **反例**：若契约给字符串，web-ux 的 `UNASSIGNED_CHOICE` 与契约常量必须永远相等却没有类型级约束（两个 `string` 常量互不约束），改一个会静默错位。

### D4 清单源由 holder 自持（`ctx.inject(['workspaces'])`）— 被否：在 `inject()` 里 `ctx.get`

- **被否方案**：`inject: () => ({ workspaces: ctx.get('workspaces') })`。
- **理由**：entry 的 `inject` 工厂**每 entry 只跑一次**（`dsh-client-ui-renderer/lib/client.js:431`、`:500-505`），服务晚到就永久捕获 `undefined`。
- **反例**：本仓 web-ux 踩过同款坑（`plugins/web-ux/src/client/index.ts:200-203` 的注释：apply 期读取会把入口永久弄丢），只能靠「渲染期现取」规避；holder 需要一个**可订阅**的快照，所以必须用 `ctx.inject` 把服务到达变成事件。

### D5 选择值三态含 `kind:'none'` — 被否：两态（真实工作区 / 未分配）

- **被否方案**：把「服务未就绪」折叠进 `unassigned`。
- **理由**：`unassigned` 在 web-ux 有真实内容（孤儿归档/已迁移行集），拿它表示「服务挂了」会让用户看到一批不该出现的行。
- **反例**：`web-ux` 的 `archivedRows('unassigned', …)` 会枚举「不属于任何工作区的已归档会话」（`session-manager-model.ts:437-447`）——服务缺席时这等于错误地展示全局孤儿。

### D6 tab 用 `SegmentedTabs` + 真 `role=tabpanel` — 被否：沿用弹窗的 `nav` + `aria-current`

- **被否方案**：保留旧 a11y 形态（原生 button + `aria-current`，刻意不用 tablist）。
- **理由**：旧 D7 拒绝 tablist 的理由是「分节组件是第三方注册的，holder 无法强制其根节点带 `role=tabpanel`」；页面化后 **tabpanel 由 holder 渲染**（插件页同款），该理由消失，tablist 才是与视觉一致的语义。
- **反例**：插件页正是 `SegmentedTabs(items 带 id/panelId)` + `div[role=tabpanel][aria-labelledby]`（`dsh-client-ui-plugin-manager/lib/client.js:7207-7232`），需求要求「直接参照插件页面」。
- **注意**：web-ux 分节内部还有一个自己的 `role=tabpanel`（`SessionManagerDialog.tsx:906`），嵌套 tabpanel 合法。

### D7 选择框 `Menu` 必开 `portal` — 被否：默认 in-place

- **被否方案**：`portal={false}`（少一次 portal 渲染）。
- **理由**：页面正文是滚动容器（插件页 `.pageBody{overflow:hidden auto}`，`dsh-client-ui-plugin-manager/lib/client.js:4219`），in-place 列表会被裁切。
- **反例**：primitives 的 `Menu` 文档明写 portal 用于「祖先 overflow 裁切」场景（`Menu.d.ts:102-105`），默认 `false`。

### D8 不复刻插件页的吸顶/紧凑测量头 — 被否：逐字复刻 `pageBar` 机制

- **被否方案**：把 `--plugin-header-*`、`data-natural`、`data-compact`、容器查询那一整套搬过来。
- **理由**：那是插件页**私有 CSS + 滚动测量**（`ResizeObserver/scroll` 驱动 `data-natural`），需求只要求「样式和布局参照」，不是行为等价；复制会引入一段无法被本仓测试覆盖的浏览器布局代码。
- **反例**：`dsh-client-ui-plugin-manager/lib/client.js:4219` 的 CSS 串里 `pageBar[data-natural][data-compact]` 分支完全依赖运行时测量写回的内联变量——脱离那套 JS 单独复制 CSS 会渲染成错位布局。

### D9 契约删两个 order 字面量类型 — 被否：保留标 `@deprecated`

- **被否方案**：留 `TriggerOrder` / `DialogOrder` 并标废弃。
- **理由**：它们只服务已删除的座位；留着会让「唯一权威」里出现两套与不存在座位绑定的值，贡献方可能误用。
- **反例**：`tooling/contracts/src/index.ts:84-102` 的 docblock 把 50/530 的取值理由写得很具体（footer 位次、与 web-ux 500 弹窗不叠放），保留就需要维护一段已失效的论证。

### D10 不新建 tooling 公共组件包（Q4 的落地）— 被否：`tooling/ui-kit` 装 PageShell/TabPills/WorkspacePicker

- **被否方案**：抽 `PageShell`/`TabPills`/`WorkspacePicker` 到第五个 tooling 包。
- **理由**：① 页面壳的可复用部分只是几个 `div` + CSS 类；② `WorkspacePicker` 是工作区域组件（唯一消费者是 holder）；③ 抽包要同步改 AR7 的恰五条清单（`scripts/check-architecture.mjs:644`）+ `pnpm-workspace.yaml`，并让包内零 `@deepseek-ai/*`（AR2，`:208-214`）——页面壳要用的 `PropsRenderSlots`/`PropsLocale` 类型只能由消费方注入，抽出来的 API 是一层纯转发；④ 当前**唯一**页面消费者是 workspace-config。
- **反例**：tooling 包的 CSS modules 无先例（host-kit 零 CSS），要让 `ui-kit` 的 `.module.css` 被消费方 esbuild 内联并保持「一个样式注入器」断言，需要额外 PoC——为不存在的第二个消费者付这份成本。
- **演进注记**：第二个页面插件出现时，按以下切口抽取：`PageChrome`（纯 `children` 外壳 + 类名契约）、`SegmentedTabs` 已是 primitives 无需再抽；`WorkspacePicker` 不进公共包（域组件）。

### D11 两个 api-controller 包只进 devDeps，**不进** `dsh.client.inject` — 被否：照抄 web-ux 的 inject 列表

- **被否方案**：把 `@deepseek-ai/dsh-api-workspace-controller` / `dsh-api-session-controller` 加进本包 `dsh.client.inject`（web-ux 就是这么写的）。
- **理由**：`dsh.client.inject` 是 **loader 加载前置**（`dsh-client-modules/lib/client.js:791` 逐个 `arriveDependency`），依赖模块加载失败会连坐整个客户端半 → 侧栏行与页面一起消失；而本包对这两个服务是 `ctx.inject` 的**运行期软依赖**，缺席时应降级为「选择框未就绪」而不是「入口不存在」。
- **反例**：loader 对不在图里的 inject 项是跳过（`if (dependency !== void 0)`），所以写进去**平时**无害——坏处只在依赖真的加载失败时把两个能力绑在一起；本页不需要这种绑定。
- **代价**：两条 devDeps（类型用）；bundle 断言里 `client.inject` 仍只有原四项。

### D12 stt 的 `current-session.ts` **迁入** holder — 被否：两边各留一份

- **被否方案**：holder 复制一份探测，stt 保留原地。
- **理由**：本变更后 stt 分节的唯一消费者消失（目标来自页面份额），留着即死代码；该模块本身就是从 multi-root 移植来的（`current-session.ts:10` 自述），「事实跟着消费者走」比「复制一份」更诚实。
- **反例**：复制两份后，`retainedBy.mainView` 的探测口径会漂移，而它没有类型兜底（`SessionListState` 里没有 `current` 字段，全靠结构软读）。

### D13 multi-root 的 `workspace` 份额设为**可选** — 被否：必填 + launcher 传假值

- **被否方案**：`workspace: WorkspaceConfigWorkspaceContext` 必填，launcher 传 `{kind:'workspace', id:'', title:'', path:''}`。
- **理由**：Files tab launcher 不在统一页面里，**没有页面上下文是合法状态**；传假值会让 gate 误判「有有效目标」，把空态逻辑变成死分支。
- **反例**：`WorkspaceFoldersLauncher` 现在把同一节正文就地展开并传本地 `close`（`WorkspaceFoldersAction.tsx:189`），它的存在证明「同一组件有第二种挂载形态」。

### D14 「换工作区 = 分节重挂」用 `key`，不用 effect 同步 — 被否：`useEffect` 里对齐 props 再 `resetToSelect`

- **被否方案**：web-ux 用 effect 监听 `workspace` 变化 → `resetToSelect()`；stt 用 effect 依赖 `path` 重读。
- **理由**：`key` 把「工作区身份」并入组件挂载身份，一次表达三件事：phase 回 `select`、选择集合清空、stt 重读；不需要处理「running 中被切换」的竞态分支。运行中的请求在宿主侧继续完成（D16 已证：`artifacts/workspace-config-smoke.md:29` 的「Run 后立即 Escape，请求后台完成」）。这与 Q9「接受重置」同一条语义线。
- **反例**：effect 方案要额外维护「上次份额」ref 才能避免循环，且 `running` 中切换会出现「新行集 + 旧结果」并存的错位界面。
- **代价**：`running` 中切换工作区会丢掉结果回执（与关掉页面同代价，已接受）。

### D15 web-ux footer 删掉 `select` 阶段的「取消」而不是换成「完成」 — 被否：统一都改成「完成」

- **被否方案**：select 阶段也放一枚「完成」。
- **理由**：select 是**过程态**（还没确认任何东西），给它一个「完成」等于把「什么都不做」伪装成完成动作；取消按钮存在的唯一理由是「关弹窗」，弹窗没了它就没有语义。
- **反例**：`confirm` 阶段已有 `[返回]`（`SessionManagerDialog.tsx:825`），再给 select 加「完成」会出现两个语义重叠的退出按钮。

---

## ⑤ 逐任务组实现要点

> 分组与阶段 2 的 `tasks.md` 一一对齐（G1–G8，顺序即依赖顺序）。每组末尾的验证句是**可执行命令或可复算断言**。

### G1 契约先行（`tooling/contracts`）

**实现要点**
1. 改 `WorkspaceConfigSectionOwnerProps` 为 `{ workspace }`；新增 `WorkspaceConfigWorkspaceContext` 三态联合（③ 3.1）。
2. 删 `WorkspaceConfigTriggerOrder` / `WorkspaceConfigDialogOrder`；保留 seat / slot / section order。
3. 模块头重写：去掉「弹窗开合由 holder 拥有」「close」的全部论证，换成「页面级工作区上下文由 holder 产出」+ 三态语义表。
4. **不加**任何运行时依赖、**不加** `test` 脚本（AR2 白名单）。

**验证**
```bash
pnpm --filter @dsh-plugins/contracts typecheck
pnpm --filter @dsh-plugins/contracts lint
node scripts/check-architecture.mjs   # AR2：contracts private/0.0.0/零 @deepseek-ai 依赖/脚本白名单
grep -c "WorkspaceConfigTriggerOrder\|WorkspaceConfigDialogOrder" tooling/contracts/src/index.ts   # 期望 0
grep -c "kind: 'workspace'\|kind: 'unassigned'\|kind: 'none'" tooling/contracts/src/index.ts       # 期望 3
```

### G2 holder 页面骨架（页面 + 选择框 + 纯策略 + 清单源）

**实现要点**
1. `page.module.css`（③ 3.12）+ `WorkspaceConfigPage.tsx`（③ 3.5 渲染树）。
2. `WorkspacePicker.tsx`（③ 3.8，`Menu portal`）。
3. `workspace-choice.ts`（③ 3.7）+ `workspace-source.ts`（③ 3.6）+ `session-context.ts`（③ 3.7 下半）。
4. `locales.ts` 键面（③ 3.11）；`sections.ts` 只改注释。
5. 空态 / 降级：`rows.length===0` → `.empty[role=status]`；`list.phase==='pending'` → 选择框禁用 + `{kind:'none'}` 下传。

**验证**
```bash
pnpm --filter dsh-plugin-workspace-config exec vitest run test/workspace-choice.test.ts test/workspace-source.test.ts test/page.test.tsx
pnpm --filter dsh-plugin-workspace-config typecheck
```
断言（`page.test.tsx`）：
- `screen.getByRole('heading', { level: 1 }).textContent === zh['page.title']`
- `screen.getAllByRole('tab').map(t => t.textContent)` 等于按 order 排序的分节 label
- 每个 tab 的 `id` 与 tabpanel 的 `aria-labelledby` 互指（`getAttribute` 相等）
- 点第二个 tab 后，`renderSlot` 替身最后一次调用参数为 `('workspace-config.section', { workspace: <当前选择> }, { only: 'b' })`
- 选择框菜单项顺序 = 工作区 Host 顺序 + 末尾「未分配」；选中后 `renderSlot` 的 `owner.workspace` 同步变化
- `rows=[]` 时无 tablist、有 `role="status"` 空态

### G3 holder 双注册 + 协调器 + 删除三件套

**实现要点**
1. `contract.ts`：`PANEL_ID` / `PANEL_ORDER` / 常量收口（③ 3.2）。
2. `panel-pair.ts`（③ 3.4）+ `WorkspaceConfigPanelIcon.tsx`。
3. `index.ts`：`locale.register` → `createSectionsSource` → `createWorkspaceListSource` → `pair.page(...)` → `pair.row(...)`（③ 3.3）。
4. 删 `WorkspaceConfigDialog.tsx` / `WorkspaceConfigTrigger.tsx` / `open-store.ts` / `dialog.module.css`。
5. `package.json`：devDeps +2（`catalog:dsh`）、`description` 改写；`dsh.client.inject` 保持四项。

**验证**
```bash
pnpm --filter dsh-plugin-workspace-config exec vitest run test/apply.test.ts test/panel-pair.test.ts test/section-seat.poc.test.tsx
pnpm --filter dsh-plugin-workspace-config build
node -e "const s=require('fs').readFileSync('plugins/workspace-config/lib/client.js','utf8'); \
  if(!s.includes('\"sidebar.panellist\"')) throw new Error('panellist 注册缺失'); \
  if(!s.includes('\"main\"')) throw new Error('main 注册缺失'); \
  if(s.includes('sidebar.footer.action')||s.includes('shell.overlay')) throw new Error('旧座位残留'); \
  if(!s.includes('\"workspace-config\"')) throw new Error('panel id 缺失'); \
  console.log('ok')"
```
断言（`apply.test.ts`）：
- 两处 `slots.inject` 的座位名恰为 `['main','sidebar.panellist']`
- `main` 注册面：`key === PANEL_ID`、`locale === NS`、`children['workspace-config.section'].kind === 'list'`
- `panellist` 注册面：`id === PANEL_ID`、`order === 20`、`typeof label === 'function'` 且 `label() === zh['entry.label']`
- 页面注册失败 → 行不注册；行座位先到 → 页面到后行补上；页面 disposer 连坐行 disposer

### G4 stt 分节适配（含 `current-session.ts` 迁出）

**实现要点**
1. `WorkspaceEntry.tsx`：份额三态（③ 3.9）+ `<Target key={path}>`；`useWorkspaceDefaults` 删 `select`/`targetRef`。
2. `WorkspaceDefaultsEditor.tsx`：删 `<select>` 行与 `choices`/`onSelect`。
3. `index.ts`：注入面去 `currentSessionId`；`current-session.ts` 删除。
4. `locales.ts`：删 `workspace.select`、加 `workspace.noTarget`。

**验证**
```bash
pnpm --filter dsh-plugin-session-tool-toggle verify:all
test -z "$(grep -rl 'currentSessionIdOf' plugins/session-tool-toggle/src)"            # 期望空
test "$(grep -c 'workspace.select' plugins/session-tool-toggle/src/client/locales.ts)" = 0
```
断言（`workspace-editor.test.tsx`）：
- `queryByRole('combobox')` 为 `null`
- `workspace={{kind:'unassigned'}}` → 渲染 `zh['workspace.noTarget']`，且 `PanelClient.workspace` 替身**零调用**
- `workspace={{kind:'workspace',path:P}}` → 首次 `read` 的请求体 `{workspacePath:P, action:'read'}`
- 换 `path` → 旧目标组件卸载、新目标重新 `read`（用两个不同 `workspacePath` 的请求计数断言）

### G5 web-ux 分节适配（删 Menu + `close` 语义 + 模型裁剪）

**实现要点**
1. `SessionManagerDialog.tsx`：份额三态、`choice` 派生、`key={choiceKey}`、footer 各阶段（③ 3.10）、删 Menu/portal 常量/相关 state。
2. `session-manager-model.ts`：删 `workspaceChoices` / `defaultWorkspaceChoice` / `ManagerWorkspaceChoice`。
3. `locales.ts`：`manager.close` → `manager.finish`，删两条已无消费者的键。

**验证**
```bash
pnpm --filter dsh-plugin-web-ux verify:all
test -z "$(grep -rl 'workspaceChoices\|defaultWorkspaceChoice' plugins/web-ux/src)"      # 期望空
```
断言（`session-manager-dialog.test.tsx`）：
- `workspace={{kind:'none'}}` → `zh['manager.unavailable']`
- `workspace={{kind:'workspace',id}}` → 行集来自该 id；`workspace={{kind:'unassigned'}}` → 孤儿行
- select 阶段 `queryByRole('button',{name: zh['dialog.cancel']})` 为 `null`
- done 阶段点「完成」→ 回到 select（`getByRole('tabpanel')` 内动作按钮重新出现、结果块消失）
- 换 `workspace` → 组件重挂（选择集合清空、phase 回 select）

### G6 multi-root 分节适配

**实现要点**
1. `WorkspaceFoldersAction.tsx`：`close` → `workspace?`；页内 `kind!=='workspace'` → `panel.noWorkspace` 空态；launcher 形态不变。
2. `locales.ts` 加 `panel.noWorkspace`；ADR-0013 追加一行注记。

**验证**
```bash
pnpm --filter dsh-plugin-multi-root-workspace verify:all
test -z "$(grep -n 'readonly close: () => void' plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx)"   # 期望空
```
断言（`client-panel.spec.tsx`）：页内 `{kind:'unassigned'}`/`{kind:'none'}` → 空态；份额缺席（launcher）→ 正文照常（`list` 端点被调用一次）。

### G7 测试迁移与产物断言

**实现要点**
1. 删 `trigger.test.tsx` / `dialog.test.tsx`；新增 `page.test.tsx` / `workspace-choice.test.ts` / `workspace-source.test.ts` / `panel-pair.test.ts`；PoC 改挂 `main`。
2. `bundle.test.ts` 换锚点（① 1.1 表末）。

**验证**
```bash
pnpm --filter dsh-plugin-workspace-config verify:all
pnpm --filter dsh-plugin-web-ux verify:all
pnpm --filter dsh-plugin-session-tool-toggle verify:all
pnpm --filter dsh-plugin-multi-root-workspace verify:all
pnpm test && pnpm build && pnpm dsh:check
```
断言（`bundle.test.ts`）：
- `source` 含 `"sidebar.panellist"`、`"workspace-config"`；`name:\s*"main"` 与 `key:\s*"workspace-config"` 各命中 1 次（用正则，避免被压缩空白影响）；`workspace-config.section` 出现 ≥2 次
- `source` **不含** `sidebar.footer.action` / `shell.overlay` / `workspace-config-trigger` / `workspace-config-dialog`
- 样式注入器恰 1（`style.setAttribute('data-dsh-css'` 出现 1 次）
- `lib/index.js` 仍零 import；`lib/client.js` 仍只 require primitives/react/react-dom 三词
- 贡献方产物仍不含 holder 包名（四包间零运行时反向依赖）

### G8 文档、spec 与真机冒烟

**实现要点（spec 改写范围，供阶段 2 落 task，不在本设计写 spec 正文）**
- 「footer 单入口可见性」→ 整条改写为**侧栏面板入口**：`sidebar.panellist` 行存在且唯一、`id` 与 `main` key 一致、order 20、点击进入页面、无任何 `[role=dialog]` 残留。
- 「统一弹窗与分节导航」→ 整条改写为**独立页面与分节 tab**：`page/pageBar/pageTabs/tabpanel` 结构、tab 按 order 排序、一次只挂载选中分节（切换即卸载）、默认选中 order 最小、**删除「关闭后重开记忆」条款**（Q9 → 重进重置）、a11y 用 tablist/tabpanel。
- 「分节贡献机制」→ owner 份额改 `{ workspace }`（三态语义）+ 删除 `close`；保留软注册、后装补跑、崩溃隔离。
- 「降级与安装矩阵」→ 未装 holder 时三贡献方 GUI 不可达的约定沿用；新增「旧贡献方混装新 holder」条款（`close` 缺失时 web-ux 旧版按钮会抛错——同 tag 安装是唯一受支持组合）。
- **新增**「统一工作区选择框」：页面级唯一入口（各 tab 内不得另有选择框）；候选 = 真实工作区（Host 顺序）+ 末项未分配；默认 = 最近使用 > 当前会话 > 第一项；服务未就绪降级为 `none`（三节各自的空态/不可用态）；选择值跨 tab 保留、切走页面后重置。

**验证**
```bash
pnpm docs:check
pnpm spec:check            # openspec validate --all --strict
pnpm gen:plugin --check
docker exec dsh dsh --profile web --dump-config          # exit 0
docker exec dsh dsh --profile web --dump-config-schema | grep -c workspace-config   # 与变更前同值（变更前读数 5；该命令存在既有豁免的非 0 退出码）
```
真机冒烟（headless Chromium + page evaluate，写成 `artifacts/workspace-config-page-smoke.md` 的逐项断言）：
```js
// ① 侧栏行存在且唯一（locale=en）
document.querySelectorAll('button[aria-label="Workspace settings"]').length === 1
// ② 点击后进入页面：无 dialog、有页面 heading 与 3 个分节 tab
document.querySelectorAll('[role=dialog]').length === 0
[...document.querySelectorAll('[role=tab]')].map(t => t.textContent)
  // === ['Workspace folders','Workspace defaults','Session manager']
// ③ tab 切换即卸载：页面 tabpanel 内的「嵌套 tablist」数
//    默认（Workspace folders）tab 下 === 0；切到 Session manager 后 === 1（那是 web-ux 自己的域 tablist）
//    且切走后 Workspace defaults 分节的 <h3> 与 <code> 均不在 DOM（证明上一节被卸载，而不是 display:none）
document.querySelectorAll('[role=tabpanel] [role=tablist]').length
// ④ 统一选择框：菜单项 = 工作区数 + 1，末项文本为 'Unassigned'
// ⑤ 未分配：defaults 分节显示「Choose a workspace above first」；folders 分节显示「No workspace selected」
// ⑥ 重进重置：切回会话再点侧栏行，第一个 tab 的 aria-selected === 'true'
// ⑦ footer 无旧入口：document.querySelectorAll('[aria-haspopup=dialog][aria-label="Workspace settings"]').length === 0
```
产物验证句：
```bash
test -f plugins/workspace-config/artifacts/workspace-config-page-smoke.md \
  && test "$(grep -c 'PASS' plugins/workspace-config/artifacts/workspace-config-page-smoke.md)" -ge 10
```

---

## ⑥ 设计假设与未决项

### 6.1 已由代码事实证伪/证实的执行期验证点

| 项 | 结论 | 证据 |
|---|---|---|
| keyed `main` 注册是否强制带 `store` | **不强制**（explore 的验证点关闭） | `dsh-client-ui-renderer/lib/client.js:1664` + `standardKit` 条件注入（`:748-752`） |
| 宿主 keyed 渲染是否保活 | **不保活**（Q9 前提成立） | `dsh-client-ui-layout/lib/client.js:127` 单键 `renderSlot`，renderer 无 keepMounted |
| `ctx.inject` 在客户端半可用 | **可用** | 上游 `dsh-client-ui-sidebar-browser/lib/client.js:1812`（`ctx.inject(['workspaces'], …)`） |
| `dsh.client.inject` 缺包是否致命 | 不致命（跳过），但仍按 D11 不写 | `dsh-client-modules/lib/client.js:791` |
| 空 tab 的 `SegmentedTabs` | 类型不允许空 items（元组），必须走空态分支 | `SegmentedTabs.d.ts:6-24` |

### 6.2 设计假设（实现时必须成立，否则回退见括号）

1. **A1 服务可用性**：`ctx.inject(['workspaces'])` 在页面挂载前后能拿到服务；若某组合永不提供（无工作区的极简壳），页面显示「工作区列表尚未就绪」且三节各自空态（降级路径已设计，不需要回退）。
2. **A2 键空间一致**：`WorkspaceView.path`（客户端快照）与 stt 宿主的 `workspaceRegistry.path` 是同一个规范路径值——上游注释明写 `Canonical host directory path`（`types.d.ts:15`），且 stt 宿主选择集也用 registry `path`（`host/index.ts:547-552`）。若不成立，stt 的 `{workspacePath}` 请求会被宿主判 `bad-address`（由 e2e 冒烟 ⑤ 覆盖）。
3. **A3 双座位同壳**：`main` 与 `sidebar.panellist` 由同一个 web 组合提供（layout + sidebar）；协调器已覆盖乱序/缺一侧，但「只有 `panellist` 没有 `main`」的壳里页面不可达（与未装 holder 同观感，可接受）。
4. **A4 页面挂载时机**：页面只在用户点击后挂载，晚于 boot；因此 `workspaces`/`sessions` 服务通常已就绪，`pending` 分支是兜底而非常态。
5. **A5 默认选择的「一次性读数」**：`sessionUsage()` 与 `currentSessionId()` 在渲染期现取一次用于默认值；页面不订阅会话快照（避免整页随会话高频重渲染）。列表变化导致的默认漂移只在用户尚未手选时发生（可接受）。
6. **A6 multi-root 的会话作用域不跟随选择框**：其端点全部要求 `sessionId`（`contract.ts:130-137`），本期只做 Q8 的 gate，不做按工作区寻址（属业务改造，超出非目标边界）。
7. **A7 未登记工作区的工作区档不再可达**：页面选择框只列已登记工作区（`ctx.workspaces.list`），旧 stt 的「cwd 未登记也能读工作区档（`registered:false`）」路径在新页面下不出现（详见待决 P1）。
8. **A8 换工作区 = 重挂**：`running` 中切换工作区会丢掉结果回执（与关页面同代价，D14）；宿主请求继续完成。
9. **A9 样式不复刻吸顶**：页面不随滚动收起标题/切紧凑布局（D8）；窄屏行为不在验收面（沿用旧 spec 边界）。
10. **A10 产物目录**：`lib/**` 仍随仓库提交；`lib/types/client/WorkspaceConfigPage.d.ts` 等新增 d.ts 由 `build:types` 产出，`files` 白名单已覆盖 `lib/**/*.d.ts`，不需要改 `package.json` 的 `files`。

### 6.3 风险（有缓解，不阻塞）

| 风险 | 缓解 |
|---|---|
| owner 份额不匹配的混装（旧 web-ux + 新 holder） | 仓内统一版本发布；spec 降级条款写明「同 tag 安装是唯一受支持组合」；holder 侧不做兼容垫片（Q7 已裁定删除 `close`，不重开） |
| `ctx.inject` 回调与 `slots.inject` 回调的时序耦合 | `workspace-source` 的快照是 `pending` 起步，任何时序下页面都能渲染；有 `workspace-source.test.ts` 覆盖到达/退场 |
| 三包 locale 键增删遗漏 | 三个包各有 `locale-parity` 测试；zh 为 canonical、en `satisfies Record<Key,string>` 编译期兜底 |
| 页面与分节双 tablist 的 a11y 混淆 | 两处 tablist 各自有 `aria-label`（页面 `page.tabs.label` / web-ux `manager.tabs.label`）；tabpanel 通过 `aria-labelledby` 互指 |

---

## 待决问题

> 均不推翻 Q1–Q10，只是新出现的取舍。每条含 问题 / 选项 / 推荐 / 影响面。

### P1 未登记工作区（cwd 不属任何已登记工作区）的工作区默认档在新页面下不可达

- **问题**：旧 stt 分节以 `{sessionId}` 寻址，cwd 未登记时仍能读写该路径的工作区档（`registered:false`）。页面化后选择框只列已登记工作区，这条路径消失。
- **选项**：
  - a) 接受：工作区配置以「已登记工作区」为唯一作用域，未登记 cwd 不再有工作区档入口；
  - b) 在候选末尾追加动态项「当前会话所在目录（未登记）」，仍以 `{workspacePath}` 寻址（stt 宿主 `resolveWorkspaceTarget` 会拒绝未登记路径——`host/control.ts:882`，需要宿主侧放宽）；
  - c) 保留 `{sessionId}` 作为 `kind:'none'` 时的兜底寻址（语义回退，与「统一选择框」冲突）。
- **推荐**：**a**。理由：b 需要改 stt 宿主的写路径白名单（超出「不改业务」边界），c 会让「没有有效目标」变成「有隐藏目标」，两者都与需求 3 的「统一入口」相悖。
- **影响面**：spec「分节贡献机制 / 统一工作区选择框」两条的场景；stt README 与 `workspace.unresolved` 文案的去留；用户路径（未登记目录的默认档需经 `/tools workspace` 命令面）。

### P2 页面是否提供「新建工作区」入口

- **问题**：页面顶部已有工作区选择框，但没有「注册新工作区」的入口（需求未提）。
- **选项**：a) 本期不做；b) 在 toolbar 加「新建工作区」按钮（调 `ctx.workspaces.create({path})` + 目录选择器）。
- **推荐**：**a**。需求只要求「统一选择框入口」，加创建会把 holder 从零业务壳变成业务方，并引入目录选择器依赖。
- **影响面**：页面 toolbar 组成；holder 的「零业务逻辑」定位（README 承诺）；测试面。

### P3 `currentSessionIdOf` 仍有两份实现（multi-root 的 `compat/client-session.ts` 与 holder 的新模块）

- **问题**：同一探测逻辑在仓内将存在两份（multi-root 的 `compat/client-session.ts` + holder 的 `session-context.ts`）。
- **选项**：a) 各持一份（现状做法，`current-session.ts:10` 自述移植）；b) 提到 tooling 包（需新包，Q4 已否；或塞进 host-kit——那是宿主侧运行期内核，性质不符）；c) 让 multi-root 改用 holder 的类型——不成立（multi-root 对 holder 只有编译期类型依赖，不能要运行时函数）。
- **推荐**：**a**，并在两处 docblock 互相指路。理由：探测是 ~60 行纯函数，形态随上游快照形状漂移；跨包共享会把一个易变结构探测固化成内部 API。
- **影响面**：维护面（一处上游快照变更要改两处）；演进注记（第三个消费者出现时再抽）。

### P4 web-ux 分节内部 tab（Active/Archived/Migrated）与页面级 tab 的层级

- **问题**：页面化后出现两级 tab（页面 = 三个分节；web-ux = 三个会话域），用户可能误读为同一层级。
- **选项**：a) 保持两级 tab（web-ux 内部形态不动）；b) 把 web-ux 的三个域提升为页面级 tab（holder 变成会话管理页的容器，架构反转）；c) 把 web-ux 内部 tab 改成 `SegmentedControl`/下拉（视觉上与 tab 区分）。
- **推荐**：**a**。需求明确「三种类别仍按 tab 拆分」，域内三 tab 是分节内容的一部分；b 会让 holder 依赖贡献方语义，c 是无收益的视觉重排。
- **影响面**：a11y 叙述（spec 场景里写清两级 tablist 的标签名不同）；GUI 冒烟断言 ③ 里对 tablist 数量的期望值。

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：C2 不成立——用户明确「页面样式和布局直接参照『插件』页面」，存在既有页面可照抄（插件页 DOM 骨架已实证：page > pageBody > pageBar(pageHead+toolbar+pageTabs) > tabpanel，见 ② 证据锚）；C3 亦不成立——沿用既有设计体系，无自定视觉决策（新工作区选择框落插件页既有 toolbar 区形态）。

## 附：落档分歧点裁定修正（P3 = 提取共享 → 新建 client 半共享包）

> 用户裁定（2026-11-08 落档分歧点提问 + 落点确认）：P3 不走「各持一份」，新建 `tooling/client-kit`（对偶 host-kit 模式）。Q4 的「不提取」仍适用于页面 UI 组件（React/CSS），仅纯函数并包。以下增量修正并入触达面与任务组，与正文冲突处以本附录为准。

### 触达面增量

| 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|
| `tooling/client-kit/package.json` | 新建 | client 半共享运行时函数包（第五个 tooling 包） | `@dsh-plugins/client-kit`，private/0.0.0，`dependencies: {}`，exports `./client-session` 指向 `./src/client-session.ts`（TS 源消费 + 构建期内联，双轨解析同 host-kit）；devDeps 仅工具链白名单（AR2） |
| `tooling/client-kit/src/client-session.ts` | 新建 | 「当前会话」探测 + 会话用量投影的唯一实现 | 自 stt `current-session.ts` 迁入并收编 `sessionUsageOf`（原 holder `session-context.ts` 计划内容）；零 `@deepseek-ai/*` import（结构端口探测，上游快照形状以接口描述）；docblock 记录上游锚 |
| `tooling/client-kit/test/client-session.test.ts` | 新建 | 探测纯函数测试 | 两步结构探测 / 空 session / usage 投影 |
| `tooling/client-kit/tsconfig.json` / `vitest.config.ts` / `README.md` | 新建 | 治理面 | 对偶 host-kit 形态；scripts 白名单 `lint/typecheck/test` |
| `pnpm-workspace.yaml` | 改 | AR7 四包 → 五包 | `packages` 增 `tooling/client-kit` 显式条目 |
| `scripts/check-architecture.mjs` | 改 | AR2 登记新包 | `TOOLING_CONTRACT` 增 `client-kit: { runtime: [], scripts: ['lint','typecheck','test'] }` |
| `plugins/workspace-config/src/client/session-context.ts`（原计划新建） | 改计划 | 不再自持实现 | 改为薄 re-export/组合：`import { currentSessionIdOf, sessionUsageOf } from '@dsh-plugins/client-kit/client-session'`（devDeps + AR1 构建期内联）；文件保留 holder 内的装配语义或直接在 index.ts 消费 |
| `plugins/multi-root-workspace/src/compat/client-session.ts` | 改 | 消除第二份实现 | 删除本地实现（消费点 `src/client/index.ts:50` 的 `import { currentSessionIdOf } from '../compat/client-session.ts'`），改消费 `@dsh-plugins/client-kit/client-session`（devDeps 增内部包，符合 AR1：内部包只进 devDependencies） |
| `plugins/workspace-config/package.json` / `plugins/multi-root-workspace/package.json` | 改 | devDeps 增 `@dsh-plugins/client-kit` | AR1 断言自动覆盖（运行时 dependencies 不出现内部包） |

### 任务组增量

- **G1（契约先行）扩容**：除 contracts 契约外，先落 `tooling/client-kit` 骨架（包 + 探测函数迁入 + 测试 + AR2/AR7 登记），它是 G2 holder 与 G6 multi-root 的公共前置。
- **G2**：holder 的 `session-context.ts` 计划改为消费 client-kit（不再写第二份实现）。
- **G6**：multi-root 增「compat 探测改消费 client-kit + 删本地实现」任务（原触达面仅注释/文案/测试）。
- 验证增量：`pnpm dsh:check` 覆盖 AR1（两包 dependencies 无内部包）/AR2（client-kit 白名单）/AR7（五包清单）；`pnpm --filter @dsh-plugins/client-kit test` 退出码 0。
