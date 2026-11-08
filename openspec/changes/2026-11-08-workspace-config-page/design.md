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

**阶段 1.75 界面演示**：未触发——C2 不成立（用户明确「直接参照『插件』页面」，存在既有页面可照抄，插件页 DOM 骨架已实证）；C3 亦不成立（沿用既有设计体系，新选择框落既有 toolbar 区形态）。判定与事实依据详见 `code-design.md` 附录。

## 接口与数据形状（摘要）

- `WorkspaceConfigSectionOwnerProps = { readonly workspace: WorkspaceConfigWorkspaceContext }`
- `WorkspaceConfigWorkspaceContext = { kind:'workspace'; id:string; title:string; path:string } | { kind:'unassigned' } | { kind:'none' }`
- `main` 注册 options：`{ name:'main', key:PANEL_ID, locale:NS, children:{ 'workspace-config.section':{kind:'list',scope:'root'} }, inject:()=>({sections, workspaces, currentSessionId, sessionUsage}) }`；`panellist`：`{ name:'sidebar.panellist', id:PANEL_ID, order:20, locale:NS, label:()=>t('entry.label') }`
- client-kit 导出：`./client-session` → `currentSessionIdOf(sessions)` / `sessionUsageOf(sessions)`（结构端口探测，零 DSH import）
- 契约删 `WorkspaceConfigTriggerOrder` / `WorkspaceConfigDialogOrder` 字面量类型；保留 seat/slot/section order
- 完整签名与逐文件改动见 code-design.md ①③

## 逐任务组要点（对齐 tasks.md）

G1 契约与 client-kit 先行（contracts owner 份额 + client-kit 骨架 + AR2/AR7 登记）→ G2 holder 页面骨架（Page/Picker/choice/source/样式）→ G3 双注册 + panel-pair + 删三件套 → G4 stt 适配 → G5 web-ux 适配 → G6 multi-root 适配（compat 探测改消费 client-kit）→ G7 测试迁移与产物断言 → G8 文档 + spec 同步 + 真机冒烟。每组验证句与断言细节见 code-design.md ⑤。

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
