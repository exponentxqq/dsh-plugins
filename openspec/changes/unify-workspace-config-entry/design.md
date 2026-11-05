# Design

## Context

侧栏 footer 座位 `sidebar.footer.action`（shell 单行 nowrap flex，宽栏 256px / 折叠轨 56px 内容宽约 32px）当前被三插件分别占用并组合级饱和（R5 裁定原文见 `openspec/changes/archive/2026-11-05-web-ux-session-manager/tasks.md` R5 小节与 `plugins/web-ux/artifacts/session-manager-smoke.md` 步骤 2）。官方 cordis badge 也是整行 `calc(100% + 4px)`（但无 `flex:none`、可缩），当前 profile 未装载 `dsh-client-ui-cordis`；第三方 `dsh-pocket` 仅在非桌面布局再注册一颗 footer 入口（验收面已裁定仅桌面）。slots 框架 rc.5 提供 `register({ children })` 子座位声明（Declaring is claiming）与 `RenderOpts.only` list 过滤；官方设置弹窗 `settings.section` 即「统一弹窗 + 分节导航 + 多包贡献」的黄金先例。本仓 pnpm workspace 单仓多包、统一版本 1.5.0、DSH 基线 0.2.1-rc.5（`scripts/dsh-baseline.mjs:13`）、七插件各自独立 bundle。收敛结论（两规划线 + 阶段 1.5）见随档 `diff-matrix.md` 第六节；代码级蓝图的完整展开见随档 `code-design.md`（**58 项触达面、33 条证据锚、接口全文与 G1–G8 任务组要点以其为权威**，本文承载其断言）。

## Goals / Non-Goals

**Goals:**

- footer 只剩一枚「工作区配置」入口（桌面双形态完整可见、恒在、行内收缩份额不挤同列）；点击打开统一弹窗，分节导航 + 懒渲染。
- 三插件以零运行时依赖的方式成为分节贡献方；未装贡献方节自动隐藏；后续新分节（工具管理类）只加一个注册。
- 既有功能路径零回归：mrfw Files tab + `/workspace-folders`、stt 头部面板 + `/tools`（共用状态）、web-ux 行菜单删除 + 删除弹窗（500）全部保留。

**Non-Goals:**

- 不改三插件宿主半与 RPC 端点、不改落盘格式（`workspaces.json`/`defaults.json`）。
- 不做旧入口共存探测、动态切换与配置开关（用户裁决硬移除 + 四包同装约定）。
- 不实现「工具管理」等新分节；不处理窄屏/移动布局的 footer 冲突（已知事实留档）；不改上游任何包。
- 本次合入不发布 tag（用户裁决：link: 持续使用，版本号随下一批变更统一定）。

## Decisions

### 栈识别结论（writer skill 接线留档）

本仓为 **TypeScript + React 18 + esbuild/tsdown + vitest + pnpm workspace + cordis 插件包**：无 `pom.xml`/`build.gradle`/`nuxt.config.*`，Spring 与 Nuxt 皆未命中；**用户已豁免 writer skill 加载（仅本次有效）**，设计约束以仓根 `AGENTS.md`（产物 zh-CN、`lib/` 随仓提交、递归 build/typecheck/test/lint）与各插件既有惯例（软注册、`--dsw-*` token、bundle 断言、mrfw `docs:check` 硬门）为准。

### 关键决策（D1–D16 全文与反例见 code-design.md ④，此处列断言）

| 决策 | 断言 | 被否要点 |
|---|---|---|
| D1 弹窗壳 | `Modal headless:true` + 自绘 header/nav/内容列（内容列 `overflow-y:auto;min-height:0`） | 非 headless 加宽：内容列无法独立滚动（`.dialog{overflow:hidden}` 裁掉底部）；自绘 overlay：回到 mrfw 自管焦点陷阱的老路 |
| D2 nav label | 本地 2 行 thunk 解析，不 import 上游 `resolveSlotLabel` | slots 包无 `./client` 导出、非 loader 模块表词——运行时 require 命中「missed the module table」硬错，整个客户端模块加载失败 |
| D3 类型纪律 | 贡献方仅 `import type` + 各持座位字面量（类型断言守护），**不入** `dsh.client.inject` | 运行时 import 会把 holder 整模块打进贡献方 bundle；inject 边对缺席包静默跳过，纯噪声且构成虚假硬依赖 |
| D4 类型产物 | holder 必须 `tsc --emitDeclarationOnly` 发 `lib/types/**` d.ts（`exports['./client'].types` 指向） | 照 web-ux 纯 esbuild 不产 d.ts——贡献方 `import type` 退化为 any，devDep 决策落空 |
| D5 入口恒在 | 零分节也渲染入口，空态在弹窗内解释 | 按节数隐藏：引入第二条可见性规则，四包未装齐时 footer 又变空 |
| D6 入口几何 | 宽态 `flex:1 1 auto;min-width:0`（ellipsis）、折叠态 **28px** 方形图标；**禁 `flex:none`/整行宽** | 整行独占复刻 R5；36px rail 超过折叠轨内容宽 32px |
| D7 nav a11y | `nav[aria-label]` + 原生 button + `aria-current` + `data-modal-autofocus`，不用 tablist | tablist 要求第三方分节根带 `role="tabpanel"`，holder 无法强制 |
| D8 分节切换 | `only` 重渲染（不 keep-mounted），选中节跨开合记忆 | keep-mounted：三节同时拉取 RPC、与 only 机制相悖 |
| D9 会话管理空态 | `client === undefined` 渲染 `manager.unavailable` 空态（不再 return null） | null 在新壳里 = 右列空白而 nav 高亮着，用户无从理解 |
| D10 无统一 footer | 各分节自带行内动作条 | 统一 footer 要么变插槽第二层、要么把阶段知识泄漏进壳 |
| D11 order 常量 | trigger 50 / dialog 530 / 分节 10/20/30 | 0 或 100：与 cordis 并列不稳定或排到后装插件之后 |
| D12 devDep 写法 | `"dsh-plugin-workspace-config": "workspace:*"` | 精确版本：包不在 registry，未开 linkWorkspacePackages 时整仓装不上；探针 P1 已证 git 安装不装不改 devDeps |
| D13 依赖收敛 | stt/web-ux 删 `@deepseek-ai/dsh-client-ui-sidebar`（inject + devDeps + 类型 import） | 留着是纯 dead coupling，上游改动会虚假连带 |
| D14 空态文案 | 不点名具体插件（泛化措辞） | 点名三个包 = 文案成第二处插件清单，加新分节即过期 |
| D15 打开桥 | 布尔快照 store（非 seq） | seq+key 重挂会把 nav 的 selected 一并重置，与 D8 冲突 |
| D16 running 中关闭 | 「关闭即关闭」（请求已在宿主侧继续完成，重开看列表验证）；写进 README 与冒烟 | 扩 owner `{close,setBusy}` 破坏已定座位形状（跨版本不兼容）；自绘遮罩拦不住 Escape |

## 深度契约承载（自 code-design.md，逐断言；全文以其为权威）

**① 触达面（58 项，逐路径见 code-design.md ①）**：新建 `plugins/workspace-config/` 21 文件（契约 `src/client/contract.ts` 为座位唯一权威、`open-store.ts` 打开桥、`sections.ts` nav 投影、`WorkspaceConfigTrigger.tsx`/`WorkspaceConfigDialog.tsx`、双端 build.mjs + tsc 发 d.ts、测试 5 件含 PoC）；根仓 3 项（lockfile、README 插件一览 + 四包同装句、openspec 四件套）；mrfw 11 项（footer 注册删除 87-107、Dialog 剥壳、styles 族裁剪、AGENTS 不变量 5 措辞、ADR-0013 新建、docs:check）；stt 11 项（footer 注册删除 179-204、`WorkspaceDefaultsSection` 导出、seats 常量替换、依赖收敛）；web-ux 12 项（footer trigger 与 manager overlay 两 entry 删除、`SessionManagerDialog` 剥壳为 `SessionManagerSection`、`SessionManagerTrigger.tsx`/`session-manager-store.ts` 删除、依赖收敛）。**明确不触达**：三插件宿主半、上游包、`scripts/*`、`pnpm-workspace.yaml`、在途变更 `2026-11-05-session-tool-toggle-session-scoped-catalog`。

**② 证据锚**：本仓 20 条 + 上游 13 条 file:line 实测（code-design.md ②，含三插件注册块行号、官方 settings 壳 nav 实装、slots `ChildrenDecl`/`RenderOpts.only`/`SlotLabel` 类型位、`shell.overlay` 容器 pointer-events 语义、loader 模块表词三词白名单）。

**③ 接口与数据形状**（全文见 code-design.md ③）：座位契约 `WorkspaceConfigSectionSeat = 'workspace-config.section'`（字面量类型）+ `WorkspaceConfigSectionOwnerProps { close(): void }` + `declare module` SlotMap 增补 + order 常量（trigger 50/dialog 530/分节 10-20-30）；贡献方注册面统一形状（`slots.inject(SECTION_SEAT, () => register({ id/order/label thunk/locale/inject }, SectionComponent))` + try/catch warn）；holder 内部 `WorkspaceConfigOpenStore`（布尔快照）/`WorkspaceConfigSectionsSource`（稳定数组快照）/弹窗 props；三节迁移 props 对照（mrfw `{panel,pickDirectory,sessionId?}`、stt `{resolveClient,currentSessionId}`（dialog 形态保留工作区下拉）、web-ux `{client,workspaces,sessions}` + `close`）；文案键 7+3；四包声明面变更表（holder inject 含 renderer/locale/sidebar/layout、不含 primitives；stt/web-ux `− dsh-client-ui-sidebar`、`+ holder workspace:*`）。两个 SECTION_ID 沿用旧 entry id（座位内唯一、日志连续）。

**④ 决策**：栈识别 + D1–D16（见上文 Decisions）。

**⑤ 逐任务组实现要点**：G1 提案落档 → G2 holder 骨架 + 类型权威 + 门禁三连 → G3 **真 renderer jsdom PoC（前置风险门：children 声明 / only 过滤 / label 双态 / 后装补跑；失败停批上浮不自行改方案）** → G4 打开桥 + trigger + 弹窗壳 + 装配 + 组件测试 → G5 三插件并行迁移（mrfw 含文档/ADR/docs:check；stt 含 `/tools` 共用状态回归用例；web-ux 含五阶段新挂载形态用例）→ G6 递归门禁 + 四格安装组合矩阵 + 产物断言收口 + link: 安装演练 → G7 真机双形态验收（宽栏/折叠/a11y 树/三节功能面/迁移回归/降级反例/Menu portal 复验/冒烟留档）→ G8 收口（文档、`openspec validate --all`、`pnpm verify`、`release --dry-run`；**本次不打 tag**）。每组验证句为可执行断言（grep 计数/test -f/退出码），全文见 code-design.md ⑤。

**⑥ 假设与未决项**：A1（rc.5 运行时与类型面一致——G3 前置门证伪）、A2（footer 布局不变）、A3（profile link: 四包）、A4（holder 缺席零报错）、A5（`workspace:*` devDep 对 git 安装安全——探针 P1 已证，发布后真机复验）、A7（桌面布局无第四占用者）、A8（分节切换草稿丢弃为接受项）、A9（cordis badge 不在场）；技术未决 U1（only 运行时语义）/U2（后装补跑）/U3（label thunk 求值）由 G3 钉住，U4（Menu portal 新壳复验，`WORKSPACE_MENU_PORTAL=false` 兜底）/U5（running 关闭后结果可见性）由 G7 走查，U6（未来 cordis 共存预案：rail 已 28px）、U7（pnpm 10/11 双跑 install）、U8（空态文案随新分节复查）留实施。

## Risks / Trade-offs

- [slots `children`/`only` 运行时未实证（最大技术单点）] → G3 真 renderer jsdom PoC 为前置门，任一断言失败停批上浮，不自行改方案（不回退两座位/registry）。
- [弹窗 chrome 更换的隐性回归（焦点/Escape/Menu portal）] → G7 逐项走查 + 保留 `WORKSPACE_MENU_PORTAL` 单点开关；与删除弹窗（500）保持互斥（530）。
- [mrfw 是 vendored fork，文档联动是硬门] → AGENTS 不变量 5、双语 README、ADR-0013、docs/architecture 同步列入任务；rc.5 座位表属历史取证只加注记不重写。
- [未装 holder 时 web-ux 会话管理 GUI 不可达] → 用户裁决接受（Q2/落档分歧点已确认），proposal 与 README 明示四包同装约定。
- [stt 分节切换丢弃未保存草稿] → 设计接受项（三节皆「动作即写」），写入冒烟记录与 README。
- [分节崩溃] → 框架 `onEntryError` 错误监督面接管，holder 不重复实现；PoC 与组合矩阵覆盖。

## Migration Plan

1. 组间严格串行执行 G1→G8（见 ⑤ 与 tasks.md）；G3 PoC 不过则停批上浮。
2. 真机前置：`docker exec dsh dsh plugin --profile web add <本仓>/plugins/workspace-config`（link:，与既有 web-ux link: 同法），用户重启 profile 生效。
3. 回滚策略：四包均 link: 安装——git revert 对应提交后重启 profile 即整体回滚；无数据迁移、无配置键变更、落盘格式不动。
4. 发布：本次合入不打 tag；下一批变更统一 `release <version>`（release.mjs 递归含新包共 7 包），tag 成为 profile 侧 `#<tag>&path:plugins/workspace-config` 安装锚点。

## Open Questions

均可安全延后、不影响 specs/方案/任务分解（实施中钉住）：U1–U3 由 G3 PoC 断言钉住；U4/U5 由 G7 真机走查钉住（U4 失败翻既有单点开关）；U6 cordis 在场预案已前置（rail 28px 默认）；U7 仓内 pnpm 11 与容器 pnpm 10 各跑一次 install 确认 `workspace:*` 表现；U8 新增分节时复查空态文案。
