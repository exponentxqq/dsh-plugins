# Design

## Context

代码结构重构（2026-11-07-optimize-architecture / residual-convergence / unify-deps-and-templates）已完成：六软插件走 build-kit 薄入口、tooling 四包治理（AR1–AR8）、统一版本与 catalog。本变更在此基础上做页面形态对齐——完整蓝图见随档 `code-design.md`（1009 行，六字段 + P3 裁定修正附录，**与本文冲突处以 code-design.md 为准**）。

宿主事实（实证锚见 code-design.md ②）：独立面板配方 = `main`（keyed/root）页面注册 + `sidebar.panellist`（list/root）面板行注册，点击经 `ctx.layout.selectPanel(id)` 切换（未注册面板 throw）；keyed 渲染切走即卸载（renderer 无 keepMounted）；keyed 注册不强制 store；插件页布局骨架为私有 CSS modules（哈希类名，插件须自建同构样式）。

**栈识别结论（阶段 1.7）**：writer skill = **dsh-plugin-writer**（证据：本仓为 DSH 插件仓，AGENTS.md 的插件结构约定即该 skill 领域；Spring/Nuxt 探测皆未命中后经用户指认）。其规范（包结构、薄入口、门禁、任务拆分粒度）为本次设计与执行的硬约束。

## Goals / Non-Goals

**Goals:**

- 入口对齐宿主三面板交互；页面骨架与插件页同构；tab = 分节软注册机制原样保留。
- 工作区选择统一到页面级唯一选择框，选择值经 owner 份额纯数据下传。
- 「当前会话」探测收编为 client 半共享包 client-kit（对偶 host-kit），消除双份实现。

**Non-Goals:**

- 不改三个分节的业务功能（文件夹增删 / 默认档读写 / 会话动作矩阵）。
- 不动宿主代码；不做旧弹窗共存开关；不做混装兼容垫片。
- 页面 UI 组件不提取 tooling 包（Q4 裁定，留演进注记）；不做「新建工作区」入口（P2）；未登记 cwd 的工作区档 GUI 不可达（P1 接受）。

## Decisions

（完整决策链与被否方案见 code-design.md ④；此处列主干，编号沿用。）

| # | 决策 | 被否方案与理由 |
|---|---|---|
| D-入口 | 双注册 = `main`(key, `workspace-config`, 无 store) + `sidebar.panellist`(order 20)，配 `panel-pair.ts` 协调器同生共死 | 两处各自 try/catch：行在而页面不在时宿主 selectPanel 直接 throw（layout client.js:522-523），插件拦不住 |
| D-契约 | owner 份额 = `{ workspace: 三态联合 }` 纯数据（workspace/unassigned/none）；删 `close`（Q2/Q7） | inject 订阅式 store：对切换即卸载的分节无增益；React context：逃逸座位类型契约 |
| D-选择框 | 页面自持 `workspace-source`（apply 期 `ctx.inject(['workspaces'])` 绑定 uSES 源）+ `workspace-choice` 纯投影（Q10 三档默认 + 未分配排最后） | 在 entry `inject()` 里 `ctx.get`：renderer 的 inject 工厂每 entry 只跑一次（client.js:431/500-505），拿不到晚到服务 |
| D-重挂 | 换工作区 = 分节 `key` 重挂（web-ux `key={choiceKey}`、stt `key={path}`）；running 中切换丢回执（接受项，与 D16 同代价） | effect 对齐：时序复杂且分节状态残留 |
| D-a11y | 页面 tab = 真 tablist/tabpanel（插件页同款）；旧 D7 拒绝 tablist 的理由（分节根无 tabpanel）随 holder 自渲染 tabpanel 消失 | 旧 nav+aria-current：页面形态下无 Modal 初始焦点契约可借 |
| D-client-kit | 新建 `tooling/client-kit`（P3 落点确认）：纯函数探测包，TS 源消费 + 构建期内联，AR2 白名单 `runtime: []`、`scripts: [lint,typecheck,test]`；AR7 四包→五包 | 各持一份（用户裁定推翻）；塞 host-kit（纯 host 半内核，性质不符）；塞 contracts（纯类型包定位） |
| D-依赖 | holder devDeps +2 DSH api 包（catalog:dsh，只吃类型），**不进** `dsh.client.inject`（loader 前置失败会连坐客户端半） | 写进 dsh.client.inject：缺包时整个客户端半加载失败 |
| D-产物 | bundle.test 断言反转：`sidebar.footer.action` / `shell.overlay` / trigger / dialog id **不存在**；新增 main/panellist/panel-id 锚点；样式注入器仍恰 1（单 page.module.css） | — |

**收敛依据**：Q1–Q10 见 `decisions.md`；P1/P2/P4 按推荐；P3 经用户两轮确认（提取共享 → 新建 client-kit）。

**阶段 1.75 界面演示**：**补触发（L2）并经用户确认通过**——初判「未触发」经用户质疑后修正：统一选择框与三节整合含插件页未覆盖的视觉决策；产物 `demos/workspace-config-page-l2.html`（12 项 DOM 断言 + 窄屏 + console 自检全过），确认无改稿轮次。判定历程与证据详见 `code-design.md` 附录。

**执行环境**：直用主工作区（衔接点确认：工作树干净、仅 main 分支、无并行 worktree，隔离判据未命中）。布局：单仓 `/home/xuqinqin/develop/person/dsh-plugins`（工件仓与代码仓合一），不建 worktree；装配：沿用主检出现状（`pnpm install` 依赖已装齐）；环境错开：无；创建于 2026-11-08。执行模式 auto、引擎 subagent（映射文件预置）、apply 路由按映射文件。

## 接口与数据形状（摘要）

- `WorkspaceConfigSectionOwnerProps = { readonly workspace: WorkspaceConfigWorkspaceContext }`
- `WorkspaceConfigWorkspaceContext = { kind:'workspace'; id:string; title:string; path:string } | { kind:'unassigned' } | { kind:'none' }`
- `main` 注册 options：`{ name:'main', key:PANEL_ID, locale:NS, children:{ 'workspace-config.section':{kind:'list',scope:'root'} }, inject:()=>({sections, workspaces, currentSessionId, sessionUsage}) }`；`panellist`：`{ name:'sidebar.panellist', id:PANEL_ID, order:20, locale:NS, label:()=>t('entry.label') }`
- client-kit 导出：`./client-session` → `currentSessionIdOf(sessions)` / `sessionUsageOf(sessions)`（结构端口探测，零 DSH import）
- 契约删 `WorkspaceConfigTriggerOrder` / `WorkspaceConfigDialogOrder` 字面量类型；保留 seat/slot/section order
- 完整签名与逐文件改动见 code-design.md ①③

## 逐任务组要点（对齐 tasks.md）

G1 契约与 client-kit 先行（contracts owner 份额 + client-kit 骨架 + AR2/AR7 登记）→ G2 holder 页面骨架（Page/Picker/choice/source/样式）→ G3 双注册 + panel-pair + 删三件套 → G4 stt 适配 → G5 web-ux 适配 → G6 multi-root 适配（compat 探测改消费 client-kit）→ G7 测试迁移与产物断言 → G8 文档 + spec 同步 + 真机冒烟。每组验证句与断言细节见 code-design.md ⑤。

**G1 终形态（2026-11-08 执行完毕，3/3 勾选）**：contracts 三态契约 + client-kit 五包 + 治理双登记全部落地；干净窗口原句验证全绿（1.1 typecheck rc 0、1.2 vitest 22 用例 rc 0、1.3 AR1–AR8 rc 0）。执行期实测事实入 R1–R5（见 tasks.md 附录）：新包登记双写（R1）、无头 install 处置（R2）、四包话术待 G8 清单（R3）、base tsconfig 不加 paths（R4）、sessionUsageOf 三条裁量语义（R5）。

**G2 终形态（2026-11-08 执行完毕，4/4 勾选）**：页面壳 / 选择框+纯策略 / 清单源+session 薄层 / 文案键面全部落地；干净窗口验证全绿（2.1 grep 11≥3 + css 恰 18 类名、2.2 vitest 22 用例 rc 0、2.3 零 `@deepseek-ai/` + client-kit 薄组合、2.4 键面与 §3.11 逐字一致）。执行期裁量留痕：§3.5 伪码 `chosenValid` 在 `kind:'none'` 分支有类型笔误，2.1 以 `chosen.kind === 'unassigned' || (chosen.kind === 'workspace' && …)` 等价修正（更保守，运行时不可达）；pending 时 toolbar 渲染 `span.pickerUnavailable` 占位（严格按 §3.5 树，G7 测试按此期望写）；`pageBody` 在三条硬性几何外补同构所需 flex 细节（类名契约不变）；`createWorkspaceListSource` 收 `unknown`（验证句零上游 import 强制），`pending` 镜像上游 `WorkspaceListPhase`（服务绑定 ≠ 就绪，防默认策略闪选）；holder `nav.label` 键删除（§3.11 权威 9 键不含它，语义由 `page.tabs.label` 承接）。

**G3 终形态（2026-11-08 执行完毕，3/3 勾选）**：panel-pair 状态机（四变量、四不变式，7 组场景自检过）+ 面板图标 + index.ts 整体替换（main/panellist 双注册经配对协调器、inject 端口函数现取服务）+ 旧三件套删除 + contract/包事实收口全部落地；组收尾 `pnpm install` 后 **holder client 面 `tsc -p tsconfig.client.json --noEmit` 全绿**（G2+G3 新面整体编译闭合，强于单任务验证）。执行期裁量留痕：`children` 键用字面量直写不用 `WORKSPACE_CONFIG_SECTION` 计算键（保产物 grep 锚点，§3.3 同形）；`sections.ts` 两处旧「弹窗」论证注释按页面化事实改写（主会话顺手）；`css-modules.d.ts`/`build.mjs` 注释微修（主会话顺手）；index 保留 `PANEL_ID/PANEL_ORDER/WORKSPACE_CONFIG_SECTION` 运行时 re-export（保守公共面）；旧 d.ts 残留裁定并入 7.2 删除面（R6）。

**G4 终形态（2026-11-08 执行完毕，3/3 勾选）**：stt 分节份额三态化（`WorkspaceDefaultsTarget key={path}` 重挂重读、noTarget 空态零请求）+ 节内下拉/`select`/`targetRef`/跨目标宇宙缓存删除 + `current-session.ts` 删除（探测唯一实现归 client-kit）+ 文案测试同步全部落地；组收尾 **typecheck host+client 双段 rc 0、全包 1085 测试全绿**。执行期发现与裁决：§1.3 触达面漏列 `ToolPanelAction.tsx`（编辑器第二消费者，删 props 后主会话补删其 `choices`/`onSelect` 传参）；R7 宇宙清单页面形态降级经**用户裁决接受**（宿主 D-24 契约：路径形态 universe 恒 null；/tools 面板与命令面兜底不受影响）；`remembered` 宇宙缓存随 `select` 删除属连带清理（4.3 已同步删对应用例）；dialog 形态刷新按钮随下拉整行消失（设计原文「只余 h3+正文」）；`panel-controller.workspaceChoices`/`contract.WorkspaceValue.choices`/死样式本期不清理（无类型错误，避免清理面扩大）。

**G5 终形态（2026-11-08 执行完毕，3/3 勾选）**：会话管理分节三态映射（workspace→id / unassigned→UNASSIGNED_CHOICE / none→unavailable 空态零请求）+ `key={choice}` 重挂 + footer 五阶段重写（终点态统一 `resetToSelect`）+ model 裁剪（三导出删除、行集函数保留）+ 文案测试同步全部落地；组收尾 **typecheck host+client 双段 rc 0、全包 578 测试全绿**。执行期裁量留痕：`SessionManagerSectionProps` 按契约组合不重复声明 `workspace`（§3.9 冻结形状）；index.ts 注释口径按意图改写（无 `{close}` 字面量，改 `shell.overlay` 弹窗话术两句）；web-ux README 归 8.1、死类名与旧 smoke 文档留 R8 清单。

**G6 终形态（2026-11-08 执行完毕，3/3 勾选）**：multi-root 分节可选份额三态门（launcher 无份额保持原正文、页内 unassigned/none → `panel.noWorkspace` 空态不挂正文零请求）+ compat `currentSessionIdOf` 唯一实现迁 client-kit（消费点签名本就收 sessions，纯 re-export、import 路径不变）+ 文案/测试/ADR-0013 注记（按仓内「注记」块引惯例）全部落地；组收尾 install 固化 client-kit 链接（lockfile +27）后 **typecheck rc 0、全包 428 测试全绿、docs:check rc 0**。执行期发现与裁决：R9 验证句子串误伤（`close` 命中无关 prop）——恢复 `closeOnPointerLeave` 并收窄验证句为精确口径；6.2 上浮的五处文档口径失真（ADR-0009/note 表行/workflow 排障句/holder session-context/client-kit 来源句）主会话统一修正并过 docs:check；compat docblock 保持英文（multi-root 本地约定优先）；G6 期间 6.3 曾建临时软链解除阻塞，组收尾 install 后为原生链接。

**G8 终形态（2026-11-08 执行完毕，3/3 勾选，全部批次完成）**：仓级与四份插件文档同步（10 文件：根 README/AGENTS 五包话术 + 入口形态、ADR-0001 五包修订、四份插件 README 页面化改写，含 R3/R8 清单清零）+ 8.2 全仓四连 **（install / dsh:check / typecheck / test / build 全 exit 0，全仓测试 107+428+1085+578 等零失败）** + 8.3 真机冒烟（四包 link 安装 + 重启 profile 经用户授权 + dump-config exit 0 + **GUI 七项断言全过**：面板行在位 order 20 / 默认分节 / 切 tab 卸载与 id 互指 / 选择框 14 项候选未分配排最后 / stt 读数联动 / 未分配空态 / 重进重置 / 无弹窗残留；证据落档 `plugins/workspace-config/artifacts/workspace-config-page-smoke.md`）。执行期裁决与顺手项：check-docs 7 既有 error 判定既有豁免（R10，pristine 对照 0 新增）；stt README 平台范围漂移与 holder client/index.ts 模块头 D-15 口径主会话顺手修正；web-ux 历史迁移小节不回改；重启 profile 命中硬停条件③经**用户授权**执行（会话中断后恢复协议接续）。

**G7 终形态（2026-11-08 执行完毕，3/3 勾选）**：holder 新测试面 63 用例（page 13 / source 15 / panel-pair 13 / apply 17 / PoC 哨兵改挂 main 5）+ workspace-choice 22 核对无缺口 + bundle 断言换面（新锚 4 + 旧锚不存在 4 + 注入器恰 1，另顺带换面两条陈旧锚：文案键与宿主半组件名）+ 旧 dialog/trigger 测试删除（-857 行）+ R6 三旧 d.ts 删除；7.3 组收尾 **verify:all 全绿（lint 0 / typecheck 双段 / build 重建 lib/ / test 107/107）**、产物断言 rc 0（无 footer/overlay、有 panellist）、bundle 验证句复跑 13/13（7.2 勾选确认）。主会话顺手：四处陈旧注释话术修正（holder host 半模块头 + 三贡献方测试指向 dialog.test.tsx → section-seat.poc）。两个子代理均以 /tmp 隔离预构建交叉证明「红因 = 产物未重建」，7.3 重建后如期转绿。

## Risks / Trade-offs

- [owner 份额不匹配的混装] → 统一版本同 tag 发布是唯一受支持组合；spec 降级条款写明；不做兼容垫片
- [`ctx.inject` 与 `slots.inject` 时序耦合] → workspace-source 以 pending 起步任何时序可渲染；专项测试覆盖到达/退场
- [running 中切换工作区丢回执] → 记录为接受项（与关页面后台完成同代价，D14/D16 同族）
- [三包 locale 键增删遗漏] → 各包 locale-parity 测试 + en `satisfies` 编译期兜底
- [五包清单门禁漂移] → AR7 断言恰五包；client-kit 先登记后建包（G1）

## Migration Plan

四包同 tag 重建发布：安装侧 `docker exec dsh dsh plugin --profile web add "github:...#v<version>&path:plugins/<name>"` 逐包更新后重启 profile；回滚 = 退回前一 tag 重装四包。spec 归档时 `dsh-workspace-config-entry` 主 spec 由 delta 合并（两条 REMOVED 由三条 ADDED 承接）、`dsh-plugin-toolchain` 内部包清单扩五。

## Open Questions

无（阶段 1.5 十项 + 落档分歧点六项全部收敛；执行期验证点已在 code-design.md ⑥ 6.1 表关闭或转化为回归断言）。
