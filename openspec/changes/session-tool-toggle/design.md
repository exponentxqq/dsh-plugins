# Design

> 本文承载阶段 1.7 设计线产物 `code-design.md`（同目录落档副本）的深度契约；该副本为深度细节权威，本文按其六字段逐断言映射。收敛留痕见同目录 `diff-matrix.md`（共识 C1–C10 / 裁定 D1–D3 / 用户拍板 Q1–Q5、P1–P3 / 单边核验 S1–S15）。
>
> **2026-10-30 扩展修订**：用户追加需求「Web 配置面板，入口在会话主视图头部 "..." 工具区」，四项拍板（入口=`conversation.session.header.utilities`、归属=扩入本变更、能力=完整管理面板、不含配置键编辑）+ 编排拍板（轻量增量：Lead 定要点 + 单设计线深化）后，增量设计见 `code-design.md` 附录「Web 配置面板扩展增量设计」（决策 D12–D20、任务组 T9/T10、风险 R1–R8、未决 U1–U8）；本文已同步映射。

## Context

- 单 git 仓 pnpm workspace，`plugins/*` 一插件一 bundle；本变更新增 `plugins/session-tool-toggle/`，**无既有源码改动**。
- 机制底座全部为已核查的 DSH 公开 API：`tools.restrict`（未知名抛错、只过滤继承面、掩码取交集）+ `tools.guard` + agent 作用域同名空 `systemPrompt.section`（渲染丢弃空段）+ `dsh-tool-skill` 对 `skill` 被掩码的空目录退役语义 + `appendPluginRecord`/投影/`session.snapshotEvents()` 日志面。
- 工程先例：`plugins/project-mcp/`（isolation.ts 掩码引擎三读并集、diff 守卫、`agent/created` 返回 Promise、ports/适配分层、build.mjs/vitest/oxlint）——本插件 deny 来源从「工作区归属」换成「会话开关状态」，引擎结构照抄。
- 实测基线（本部署，读数面 = Host Inspect `Tool.listTools`）：可见工具 214，MCP 139（yunxiao 70 / chrome-devtools 32 / dbx 18 / codebase-memory 17 / figma 2）。

## Goals / Non-Goals

**Goals:**

- 会话级开关在下一步模型步骤即时生效：不可见（restrict）+ 拒调用（guard）双层强制
- 开关状态跨 resume/fork 持久（整值事件 + 投影 fold），持久化通道可切换（日志记录 ↔ 自有存储域）+ 内存降级
- 用户级默认档：命令可写、会话创建时快照（含子代理/队友会话）、不追溯
- Web 配置面板：入口在会话头部工具区，与 `/tools` 命令面共用同一控制内核与状态（无第二份状态），完整管理面板（清单分组 + 开关 + 默认档编辑 + 关闭集展示）
- 工程质量对齐仓库惯例：vitest/oxlint、engines 派生基线、`pnpm dsh:check`/release

**Non-Goals:**

- 不做全局/进程级服务器启停（plugin_manager 已有）；不做 per-skill 粒度、子代理继承会话开关、工作区级默认档、投影 wire 化实时推送（v2 候选池；Web UI 面板已扩入范围）
- 不改变权限/沙箱语义（开关面向 token 经济，非安全边界）；不做历史改写（已发生的调用保留）
- 面板不提供配置键编辑、不提供「默认档应用到本会话」、不做乐观更新（切换以宿主返回快照为准）
- 不适配 DSH `>=0.3.0`（走既有基线升级流程）

## Decisions

> 完整被否方案、反例与证据锚（每模块 ≥1 条 file:line）见 `code-design.md` ②④；此处逐条精炼并给关键依据。

**栈识别结论（writer skill）**：本仓为 TypeScript/pnpm workspace 的 DSH(Cordis) 插件仓，聚合层无对应 writer skill（仅 spring-writer/nuxt-writer，分属 Java/Vue 栈）——**用户已于 2026-10-30 拍板豁免本次加载**（仅本次有效，如实标注）。替代硬约束 = 仓库 AGENTS.md「插件结构约定」「DSH 基线」「开发与验证命令」+ project-mcp 先例。

- **D0 持久化双实现**（P1=c 拍板）：默认 `appendPluginRecord`（type `plugin:session-tool-toggle/state`，整值事件）+ host-only 投影 key `sessionToolToggle`（stateVersion 1）；`ctx.storageDomain` 自有域为同一 `StateStore` 端口第二实现（配置键 `persistence: 'record' | 'storage-domain' | 'memory'`）。被否：仅记录通道（官方 README 明写仓外不得调用，无退路）；仅自有域（丢 fork/resume 免费语义、要 GC）。
- **D1 宿主模块身份断言**：`appendPluginRecord` 写入是类静态块私有钩子（`dsh-session/lib/index.js:1540-1548`）——只有宿主那一份 `dsh-session` 能写，bundle 自带副本 brand 失败。设计：`realpath(process.argv[1])` → dsh 包根 → `createRequire` 解析 → 动态 `import()` + `mod.Session === session.constructor` 身份断言（已 spike 实证）。**禁止**用 `session.append` 伪造记录：写不出 `ignorable: true`，而缺失该标记的未知事件会令旧读者拒绝重建会话日志。
- **D2 命令面单命令**（P2=a 拍板）：单一 `/tools` + 子文法 `off/on/status/default`，`input.hint` 给文法；被否：四独立命令（解析与文案四份）。
- **D3 地址文法**：`mcp:<server>` / `mcp:<server>::<tool|尾部*>` / `tool:<name>`（`skill` 解析期归一 `tool:skill`；单工具匹配打在 public name `mcp__<server>__<raw>` 上，serverName 文法不含 `::` 故无歧义）。
- **D4 指令段遮蔽**：agent 作用域同名空 section（`dsh-scope` merge 最近层胜出 + 渲染丢弃空段，本地实测 `{name:'mcp:yunxiao',text:''}` 渲染消失）；先例 `dsh-file-reference-local/lib/index.js:342-349`。
- **D5 保护名单**：硬编码基线 bash/read/edit/write/glob/grep + 只可追加的配置键 `protectedTools`（不可移除基线）。
- **D6 回执只报计数与代价形状**（关闭数/可见数/KV 缓存一次性重建提示，开/关对称），不做 token 估值（`tokenMeter` 留作冒烟验收工具而非运行时依赖）。
- **D7 状态变更即时应用**，不 `await agent.whenIdle()`（命令本就在用户轮外执行；guard 兜竞态窗口）。
- **D8 新会话一定落快照记录**（默认档为空也落）：快照来源可观测、resume 重放无歧义。
- **D9 读路径投影优先 + 日志重放兜底**（`session.snapshotEvents()` 公开读面，投影不可用时零 DSH 运行时依赖）。
- **D10 deny 三读并集**（全局层 + agent 视角 + carried 保持），照抄 isolation.ts：322-384——服务器断线名字消失不抛错、被 project-mcp 掩掉的名字仍算已知（交集不抛错）。
- **D11 bundle 自包含**：宿主 DSH 服务包不进 bundle 图（运行时动态 `import()`，specifier 为变量）；zod/schemastery/dsh-home-paths/dsh-atomic-write 四纯库打进产物；esbuild banner 注入 `createRequire`。
- **D12 Web 入口选 utilities 插槽**（扩展拍板①）：`conversation.session.header.utilities`、order 20、id `session-tool-toggle-panel`；被否：`header.actions`（语义是标题邻接动作）、`header.corner`（single 座位抢官方控件）、侧栏/设置页常驻入口（诱导全局生效误解）。
- **D13 面板用组件内自渲染 Modal**：入口按钮常驻（座位不随交互卸载），body-portal Modal 直接挂组件内；被否：照抄 web-ux 的 `shell.overlay` + 跨 entry store（那是菜单项随菜单卸载的约束）、抽屉/侧栏页（挤出会话视野且无第三方稳定座位）。
- **D14 单一控制内核**：`src/host/control.ts` 收拢全部用例（toggle/reset/readPanel/writeDefaults，依赖注入），`commands.ts` 降级为文本前端、`rpc.ts` 只做 wire 校验与失败码映射；被否：面板复用 `ctx.commands.execute`（返回人类文本回执，反向工程）、两份实现 + 契约测试对齐（必然漂移）。
- **D15 保持 host-only 投影不加 wire**：面板状态由 `panel` 端点拉取，刷新靠打开/mutation 回执/`command/executed`/focus+手动四触发；被否：`useProjection` wire 实时推送（状态形状变 client 契约、仍解决不了清单实时性，留 v2）、轮询（无谓成本）。
- **D16 线上契约共享手写 parser**：`src/contract.ts` 零 import（两端各内联一份），§2.2 zod 草案仅作形状权威不进代码；被否：共享 zod + client external（把面板可用性耦合到 shell 模块表细节）、宿主 zod/client 手写两套并存（漂移）。
- **D17 面板不新增状态存储**：读=`store.read`+`layer.snapshot()`+`tools.schemas()`，写=`store.write`+`layer.setState`；client 侧只有快照缓存；被否：UI 侧维护 panelState 异步回写（分布式一致性问题）。不做乐观更新，翻转以宿主返回快照为准。
- **D18 默认档编辑不追溯且不提供「应用到本会话」**：`defaults` 端点只写文件并回视图；被否：「同时应用到本会话」复选框（破坏快照语义；`/tools reset` 已是正确入口）。
- **D19 批量开关全有或全无**：同一请求内文法/保护/reserved 一次判完，任一非法整单拒绝不写状态；被否：部分成功 + 逐地址回执（与命令面「一条命令一个结果」分叉，UI 多一层渲染）。
- **D20 端点集 4 个**：`panel`/`toggle`/`reset`/`defaults` 四种成功值形状（reset 与 toggle 共享 ToggleValue 形状）；通道 `/session-tool-toggle`（包名即通道名的 web-ux 约定，安装树内无官方占用，同名 route 撞车是启动期显式失败）；被否：单写端点 + op 判别字段、默认档读拆第五端点。

## 触达面与接口形状（映射 code-design ①③）

**新增**（根仓 `plugins/session-tool-toggle/`，全部新建，**双端**）：`package.json`（`exports "."` + `"./client"`、`dsh.client` web 声明）/ `cordis.patch.yml`（仅 insert 一行，零配置可跑）/ `build.mjs`（宿主 + client 两次构建）/ tsconfig×4 / `vitest.config.ts`（jsdom 面）/ `.gitignore` / `src/index.ts`（形状转发）/ `src/host/{index,types,address,state,mask,session-layer,host-runtime,record-store,defaults,commands,control,panel,rpc}.ts`（宿主 13 个）/ `src/contract.ts`（两端共享线上契约，零 import）/ `src/client/`（8 个：index/panel-client/panel-controller/ToolPanelAction.tsx/ToolPanelGroups.tsx/DefaultsEditor.tsx/locales/panel.module.css）+ `src/css-modules.d.ts`——合计 ≈3,660–4,590 行 / `test/*`×17（≈2,350 行，含 jsdom 组件套件、locale parity、bundle 纯度）/ `README.md`。
**修改**（根仓）：`README.md` 插件清单表 + `AGENTS.md` 插件清单与「四个软插件」计数；`pnpm-workspace.yaml` 仅当 zod 被发布年龄门拦截时追加豁免（条件项）。
**核心接口**：`SessionToolState{version,disabled,snapshot,seeded,updatedAt}`（整值）；记录 type `plugin:session-tool-toggle/state`；端口在原六端口（`ScopedSurface/StateStore/HostSessionApi/SpecLog/DefaultsFile/Config`）上增 `ControlDeps`/`PanelInputs`/`LayerHandle`；Web wire 契约：通道 `/session-tool-toggle`、4 端点（panel/toggle/reset/defaults）、宿主失败码 7（bad-request/bad-address/protected/reserved/session-not-live/defaults-unwritable/internal）+ 传输码 2（unavailable/bad-response）；配置键 `persistence` / `protectedTools` / `defaultsPath?` / `maxRetries?`。关键不变量在原 10 条上增 2 条（「面板与命令面共用同一状态与同一写入路径」「web 契约零外部依赖、两端各内联一份」），见 code-design ③.9 与其附录增量设计。

## Risks / Trade-offs

- [官方政策：README 明写仓外插件不得调用 `appendPluginRecord`] → P1=c 双实现，配置键一键切换；README 明示依赖实验性通道
- [KV 前缀缓存一次性失效（开关当轮多付全量 prefill）] → 命令回执对称提示；默认档快照在创建时生效可免中途重建
- [非全局安装形态下 `process.argv[1]` 解析不到 dsh 包根] → 身份断言失败自动降级内存态并如实告知；T8 冒烟覆盖
- [`agent/created` 内 append 的时序窗口 / 重算风暴 O(N×M)] → 事件驱动幂等 + diff 守卫；T8 压测 ≥5 agent × ≥5 服务器
- [skill 翻转产生目录替换消息成本 / 历史含已不可调工具] → README 预期管理段明示，不做历史改写
- [升 0.3.0 API 漂移] → engines 门禁 + `pnpm dsh:upgrade`/`dsh:check` 既有流程兜底
- [R1 多窗口快照陈旧（后写者胜）] → mutation 回执带新快照 + `command/executed`/focus/手动刷新四触发收敛；关闭集集中展示；不做乐观更新（语义与命令面一致：最后一条生效）
- [R2 utilities 座位时机] → scope session 由框架保证有会话；sessionId 用标准 prop 不猜；座位缺席时 register 抛错被 try/catch 吞掉，最坏入口不出现
- [R3 RPC 通道撞车] → 通道名取包名（唯一，安装树内无官方占用）；同名 route 注册是启动期显式失败而非静默覆盖
- [R4 client bundle 体积] → primitives/react 全外置 + CSS modules 内联，预计增量 ≈25–40 KB；bundle 纯度套件卡回归
- [R5 面板清单陈旧 vs `tools/change`/断线] → 掩码层「restrict 抛错重推一次」不变量兜底；mutation 后吃新快照；打开即拉
- [R6 i18n 混杂] → 面板只渲染 t() 键；宿主文本仅作二级灰字 detail；失败码全部稳定
- [R7 双端构建链对 CI] → 沿用 web-ux 既定顺序 lint→typecheck→build→test；产物随仓库提交
- [R8 大快照体积] → 不返回 parameters；description 截 160 字；预计单次响应 < 60 KB，超 200 KB 再分页（U8）

## Migration Plan

新插件独立 bundle：安装/卸载零迁移；不装本插件的 profile 行为零变化。发布走 `pnpm release <version>`（统一抬版本 + tag），profile 侧按 tag 安装；**profile 安装/升级后必须重启 web profile**（浏览器半 bundle 由宿主在启动图里提供，热装不生效）。无 Web 组合的 profile 只装宿主面（命令通道完整可用），浏览器半在非 Web 组合下不加载、RPC 通道不挂载——能力不缺失。

## Open Questions

技术未决 7 条（不阻塞实施路线，实现期实测回填 design 假设）见 `code-design.md` ⑥.2：非全局安装的 argv 形态、`agent/created` 内 append 窗口、被工作区隔离工具的 known 语义、投影 checkpoint 与重放的边界、storageDomain 后端路由细节、`tools/change` 风暴量级、`dsh-home-paths` 在子代理进程内的解析时机。

Web 面板扩展未决 U1–U8（同样实现期实测回填）见 `code-design.md` 附录增量设计 §6.2：Modal 内嵌 Switch 焦点交互、头部按钮最终视觉、`command/executed` 跨窗口覆盖面、curl 冒烟是否被 admit 围栏挡（备用：页面内 fetch 直调）、serverName 含 `__` 的分组歧义实测、面板打开时切换会话的重挂行为、默认档目录首建的 dirMode、panel 快照体积实测（超阈值改分组懒加载）。
