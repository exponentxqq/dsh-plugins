# session-tool-toggle · 代码级蓝图（阶段 1.7 · 设计线）

> **本文只回答四件事**：动哪些文件、每个文件怎么改、接口与数据形状长什么样、为什么这么定。需求级论证见 `line-a.md` / `line-b.md`，已定结论见 `diff-matrix.md`（本文视其为硬约束，**不复读、不推翻**）。
> **事实来源**：本机 DSH `0.2.1-rc.2` 安装包（`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/*`，下称 `dsh/`）、本仓 4 个插件源码、`~/.dsh/profiles/web/` 实配、`/home/xuqinqin/develop/company/opc/.dsh/mcp/`。文中每个判断都挂了 `file:line`；查不到的一律进 ⑥。
> **本轮实测基线**（可复现，见 ⑤ T7）：本会话可见工具 **214** 个，其中 MCP **139**（yunxiao 70、chrome-devtools-mcp 32、dbx 18、codebase-memory 17、figma 2），非 MCP 75。测量面 = Host Inspect Provider `Tool.listTools`（「Tools visible to the requesting Agent」）。
> **2026-10-30 扩展修订**：用户追加 Web 配置面板需求（入口=会话头部 utilities 插槽，四项拍板见文末附录引言），增量设计全文见**附录「Web 配置面板扩展增量设计」**；原文 ①–⑥ + P1–P3 结构不动，凡附录覆盖处（触达面、决策 D12–D20、任务组 T9/T10、假设 A12/A13、未决 U8）以附录为准，逐节对应关系见附录 A 修订索引。

---

## ① 触达面清单

仓归属说明：本仓是**单 git 仓（根仓 `dsh-plugins`）**，`plugins/*` 是同仓 pnpm workspace 包，**无 git 子仓**；下文「根仓」即本仓。`dsh/` 与线上 profile 是**只读参照**，不在改动面内。

### 1.1 新增插件包（根仓 · `plugins/session-tool-toggle/`，全部「新建」）

| 路径 | 改动意图 | 关键改动点 |
|---|---|---|
| `package.json` | 让本包成为可安装的官方组合包 | 名 `dsh-plugin-session-tool-toggle`；`version` 1.4.0（发布时由 `scripts/release.mjs` 统一抬到新 tag，自动发现 `plugins/*`）；`type: module` + `main: lib/index.js` + `exports`；`dsh.engines.dsh` 与 `peerDependencies["@deepseek-ai/dsh"]` 均为 `>=0.2.1-rc.2 <0.3.0`（由基线派生）；`dsh.bundle.patch: ./cordis.patch.yml`；`files: [lib/**/*.js, src, cordis.patch.yml, icon.svg]`；`dependencies: { zod: 4.4.3 }`；devDeps 按基线**精确 pin**（见 ③.8）；scripts `build/lint/test/typecheck/verify:all/prepack` |
| `cordis.patch.yml` | bundle 注册行 | 仅 `- insert: [{ id: session-tool-toggle, name: 'dsh-plugin-session-tool-toggle' }]`；**无 profile `config:` 段**（零配置可跑） |
| `build.mjs` | 产物自包含 | 复制 `plugins/project-mcp/build.mjs` 形状：esbuild ESM、`external: ['node:*']`、`banner` 注入 `createRequire`（`yaml` 那类 CJS 依赖的 `require('process')` 坑同样适用于 `zod`/`schemastery`）、无 d.ts、无 sourcemap；**宿主 DSH 服务包一律不进 bundle 图**（只 `import type`，运行时按 ③.5 动态 `import()` 绝对路径，specifier 是变量 → esbuild 不解析）；`zod`、`schemastery`、`dsh-home-paths`、`dsh-atomic-write` 四个纯库被打进产物 |
| `tsconfig.base.json` / `tsconfig.host.json` / `tsconfig.json` | 类型工程 | 复制 project-mcp 三件套（`noEmit` + composite 引用，`allowImportingTsExtensions`） |
| `vitest.config.ts` | 单测环境 | `environment: 'node'`、`include: ['test/**/*.test.ts']`（纯宿主包，无 jsdom 面） |
| `.gitignore` | 产物随仓库提交、依赖不入库 | `node_modules/`、`*.tsbuildinfo`（与 project-mcp 一致） |
| `icon.svg` | 插件图标 | 可选；沿用 project-mcp 的 `package.json#icon` 约定 |
| `src/index.ts` | bundle 入口 | `export { name, inject, apply } from './host/index.ts'`（只做形状转发） |
| `src/host/index.ts` | 装配层（唯一副作用集中处） | `inject: ['agents', 'tools']`；`agent/created` 挂载并返回 Promise（首步装配前生效）、`agent/disposed`/agent scope effect 清账、`tools/change` 全量幂等重算、`ctx.inject(['commands'])` 注册 `/tools`、`ctx.inject(['sessionProjections'])` 注册投影、启动时对 `ctx.agents.list()` 补挂、`ctx.effect` 统一拆卸 |
| `src/host/types.ts` | 共享 seam 类型 | `ScopedSurface`/`StateStore`/`HostSessionApi`/`SpecLog`（可注入端口，仿 `project-mcp/src/host/types.ts`） |
| `src/host/address.ts` | 地址文法与规范形 | `parseAddress` / `formatAddress` / `addressesEqual` / `matchesToolName`；文法、保护名单、`skill` 别名归一（③.1） |
| `src/host/state.ts` | 状态模型 + 折叠 | `SessionToolState`、`EMPTY_STATE`、`normalizeState`、`withToggled`、`foldStatus`（纯函数，喂投影 `apply` 与日志重放两条读路径） |
| `src/host/mask.ts` | deny 推导 + 守卫理由 | `planMask`（三读并集 → deny + 需遮蔽的 server 名单 + 每地址命中数）、`guardReason`、`PROTECTED_BASELINE` |
| `src/host/session-layer.ts` | 每 agent 的注册生命周期 | `SessionLayer`：`attach/detach/setState/refresh`；在 `agent.ctx.inject(['tools','systemPrompt'], …)` 的子 fiber 内装 `restrict({deny})`、`guard(fn)`、同名空 `section({name:'mcp:<server>'})`；diff 守卫 + 失败重试 + 拆卸容错 |
| `src/host/host-runtime.ts` | 宿主 `dsh-session` 模块解析 + 身份断言 | `loadHostSessionApi()`：`realpath(process.argv[1])` → 找 `@deepseek-ai/dsh` 包根 → `createRequire(pkg).resolve('@deepseek-ai/dsh-session')` → 动态 `import(fileURL)`；**用 `mod.Session === session.constructor` 断言「这就是宿主那一份」**，断言失败一律不写记录（③.5） |
| `src/host/record-store.ts` | 会话日志持久化 | 投影单元注册（host-only key `sessionToolToggle`）、`appendPluginRecord` 写入（整值事件）、`pluginRecordOf` 等价读回、`stateOf` 主读 + `session.snapshotEvents()` 重放兜底、内存降级 |
| `src/host/defaults.ts` | 用户级默认档 | `defaultsPath()`（`dshHomePath`）、`readDefaults`/`writeDefaults`（`writeFileAtomic`）、schema 校验与损坏降级 |
| `src/host/commands.ts` | `/tools` 命令面 | 子命令文法（③.7）、回执文案（zh-CN）、两态区分输出、KV 缓存代价提示（开/关对称）、`CommandResult` 形状 |
| `test/address.test.ts` | 文法单测 | 规范形/`::*` 归一/保护名单拒绝/`tool:mcp__…` 拒绝/未知 serverName 宽容 |
| `test/state.test.ts` | 状态机单测 | `withToggled` 幂等（同 ref）、`foldStatus` 与 `apply` 等价（property）、损坏 payload 降级 |
| `test/mask.test.ts` | 掩码推导单测 | 三读并集、carried 保持、server 断线不抛、通配匹配 public name、组 vs 单工具 section 差异 |
| `test/session-layer.test.ts` | 层单测（假 surface） | 幂等（同 deny 不重复 restrict）、restrict 抛错后重试、guard 拒绝路径、拆卸不炸 inactive context |
| `test/record-store.test.ts` | 持久化单测（假 session/runtime） | 身份断言失败 → 降级、append 抛错 → 内存态、投影缺失 → 重放兜底、fork 前缀折叠 |
| `test/defaults.test.ts` | 默认档单测 | 半写文件/损坏 JSON/空数组、原子写后读回、`$DSH_HOME` 解析时机 |
| `test/commands.test.ts` | 命令面单测 | 文法错误文案、回执字段（关闭数/可见数/缓存提示）、status 两态 |
| `README.md` | 用户预期管理 | 首屏声明：不是安全边界（C8/R8 语义）、子代理不继承（C6）、历史里出现过的已关工具不会被改写（S12）、KV 缓存一次性重建（S5 对称）、`skill` 翻转的目录替换成本（S13）、保护名单与理由、持久化降级行为 |

### 1.2 根仓级文档与配置（修改）

| 路径 | 改动意图 | 关键改动点 |
|---|---|---|
| `README.md` | 插件清单 + 常用命令 | 在「插件清单」表（当前 77–78 行为 project-mcp / user-commands 同类行）追加 `dsh-plugin-session-tool-toggle` 一行：host-only、任何 profile 可装、`/tools` 入口、会话级、默认档在 `$DSH_HOME` |
| `AGENTS.md` | 让仓库规则覆盖新包 | 「插件清单」加一条；「DSH 基线」把「三个软插件」改为「四个软插件（project-mcp / user-commands / web-ux / session-tool-toggle）」——**只改文字，不改派生规则**（`scripts/check-dsh-baseline.mjs` 按「非 multi-root 即软插件」自动分类，无需脚本改动） |
| `pnpm-lock.yaml` | 依赖落锁 | `pnpm install` 自动生成；`zod@4.4.3` 已在锁内（lock `zod@4.4.3`），预计零新增解析节点 |
| `pnpm-workspace.yaml` | **条件改动** | 仅当 `zod` 直接依赖被发布年龄门拦下时，在 `minimumReleaseAgeExclude` 追加 `zod@4.4.3`；`dsh:check` 第 6 条只对 `@deepseek-ai/dsh*`/cordis/schemastery/libreoffice-kit 要求精确豁免项，zod 不属于该集合（脚本 62–67 行），因此**不加也合规**。`allowBuilds` 无需改动（四个新依赖都无 install 脚本） |

### 1.3 openspec 落档面（实施阶段写入；本设计阶段**不动**）

| 路径 | 改动意图 | 关键改动点 |
|---|---|---|
| `openspec/changes/session-tool-toggle/proposal.md` | 变更立项 | why/what/影响面；把 diff-matrix 的 C1–C10、D1–D3、Q1–Q5 拍板结果写死 |
| `openspec/changes/session-tool-toggle/design.md` | 设计落档 | 本文 = 其设计线正文；决策记录整段搬入 |
| `openspec/changes/session-tool-toggle/tasks.md` | 任务对齐 | 按 ⑤ 的 T1–T8 分组，逐条可勾选 + 验证命令 |
| `openspec/changes/session-tool-toggle/specs/dsh-session-tool-toggle/spec.md` | 需求规范 | 5 个 `REQUIREMENT` 块：会话级开关语义 / MCP 组与单工具 / 内置工具与保护名单 / 用户级默认档快照 / 持久化与 fork·resume；标题与 SHALL/MUST 保留英文 |
| `openspec/changes/session-tool-toggle/artifacts/` | 证据归档（gitignore） | `line-a.md`/`line-b.md`/`diff-matrix.md`/`code-design.md` 落档副本 + 冒烟记录表 + 实测省量表 |

### 1.4 只读参照（明确不改）

| 面 | 内容 |
|---|---|
| `dsh/**`（安装包） | `dsh-tools`（restrict/guard/schemas）、`dsh-system-prompt`、`dsh-session`、`dsh-session-projection`、`dsh-agent`、`dsh-commands`、`dsh-mcp-client`、`dsh-tool-skill`、`dsh-home-paths`、`dsh-atomic-write`、`dsh-scope` |
| `plugins/project-mcp/**` | 掩码引擎（`isolation.ts`）、ports 分层、build/vitest/oxlint 先例、`ctx.loader.import` 梯形 |
| `plugins/user-commands/**` | `agent.ctx.inject` 必要性说明、命令注册、HTTP 冒烟脚本方法 |
| `~/.dsh/profiles/web/cordis.patch.yml` | profile 级 MCP 行（`mcp-codebase-memory`、`browser-use`/chrome-devtools）——本插件只掩码、绝不改行 |
| `company/opc/.dsh/mcp/*.yaml` | 项目级 MCP（`dbx`/`figma`/`yunxiao`）——由 project-mcp 加载，本插件与之取交集 |

**规模预估**：新增 11 个 src 文件（≈1400–1700 行含注释）+ 7 个测试文件（≈900 行）+ 7 个工程文件 + 1 个 README；根仓改 2 个文档；无既有源码改动。

---

## ② 证据锚

> 新建文件的「证据锚」= 它所仿写的既有代码事实（新建文件本身无历史行号，按约定标「新建」）。

| 触达模块 | 事实锚（file:line） | 该事实支撑的设计判断 |
|---|---|---|
| `src/host/address.ts`（新建） | `dsh/dsh-mcp-client/lib/index.js:96-102` — `publicToolName()` = `mcp__<serverName>__<rawName>`，含非法字符或超 64 字符时追加 12-hex hash；`dsh/dsh-mcp-client/README.zh.md:58` — `serverName` 文法 `[A-Za-z0-9_-]{1,32}` | 单工具匹配必须打在 **public name** 上，且 serverName 不含 `:`/`.` → `mcp:<server>::<pattern>` 无歧义（决策 D6） |
| `src/host/mask.ts`（新建） | `dsh/dsh-tools/lib/index.js:2991-3005` — `restrict()` 要求 scoped ctx（:2993）、拒绝空 filter（:2996）、拒绝 `run_code`（:3001）、**未知名抛错**（:3003-3004）、返回精确 disposer（:3005）；`:3065-3069` — `restrictableNames` 取自**继承面**（含已被别的作用域掩掉的名字，仍算「已知」）；`:3055-3072` — 只过滤继承面、**永不过滤自有层** | deny 必须从活注册表推导（C1/R1）；「被 project-mcp 掩掉的名字」在本插件里仍可进入 deny 而不抛错（C8 交集语义）；自有层豁免是子代理结构化输出通道（S14） |
| `src/host/mask.ts`（新建） | `dsh/dsh-tools/lib/index.js:3017-3022` — `guard()` 注册带 `notify:false`（不触发 `tools/change`）；`:3024-3031` — guard 链全局先于作用域 | 守卫是零成本兜底，不会自激；它就是竞态窗口（S11）与漂移窗口的唯一截面 |
| `src/host/mask.ts`（新建） | `dsh/dsh-tools/lib/types/index.d.ts:508-513`（`ToolRestriction`）、`:522`（`ToolGuard`）、`:645`/`:656`/`:712`（restrict/guard/schemas）；`:94-102` — `tools/change`「a scoped restriction changed」也会触发 | 类型面签名固定；**restrict 自身会再触发 `tools/change`** → 必须有 diff 守卫（C1/R3） |
| `src/host/session-layer.ts`（新建） | `dsh/dsh-file-reference-local/lib/index.js:342-349` — 官方对 per-agent 贡献的标准写法：`agent.ctx.inject(['systemPrompt','tools'], scope => scope.systemPrompt.section({...}))`，并按 tool 可见性动态返回空串 | 本插件每 agent 一个子 fiber 装 section 遮蔽 + restrict 的**直接可抄先例**（决策 D4） |
| `src/host/session-layer.ts`（新建） | `dsh/dsh-system-prompt/lib/index.js:253-256` — `section()` 走 `layers.effect`；`dsh/dsh-scope/lib/index.js:177-181` — `merge()` 先铺 global 再被链上每层覆盖（最近层最后）→ **同名作用域贡献胜出**；`dsh/dsh-system-prompt/lib/types/index.d.ts:201-209` — `renderPrompt` 丢弃空 section；本地实测：`{sections:[{name:'mcp:yunxiao',text:''},{name:'keep',text:'hello'}]}` → `"hello"` | MCP 组关闭时用 agent 作用域空 section 吞掉全局 `mcp:<server>` 指令段（C2）；空串即消失，无需 off-switch |
| `src/host/session-layer.ts`（新建） | `dsh/dsh-mcp-client/lib/index.js:731-741` — `registerServerContext()` 在 server 插件的（全局）fiber 上注册 `mcp:<server>`，`order = getSectionOrder('MCP_SERVERS')`，`interpolate:false`，`text: () => instructions()`；`:655` — 渲染文本形如 `### MCP server: <serverName>\n\n…`；`:494` — `maxInstructionBytes` 默认 32768 | 遮蔽段只需同名 + 同 order + 空串；断言文本锚点用 `### MCP server: <name>` |
| `src/host/record-store.ts`（新建） | `dsh/dsh-session/lib/types/index.d.ts:117`（`appendPluginRecord`）、`:126`（`pluginRecordOf`）；`dsh/dsh-session/lib/types/types.d.ts:520`（`PluginRecordType = \`plugin:${string}\``）、`:527-535`（`PluginRecordMap` 由各包 module augmentation 扩展、owner 必须自校验 `data`）；`dsh/dsh-session/lib/index.js:1540-1541`（`commitPluginRecord` 是**类静态块安装的模块私有钩子**）、`:1548+`（`#appendRecord` 私有方法）、`:1248`（记录类型文法正则） | ①记录**可以**按官方文档用 module augmentation 声明；②写入函数经 `#私有` 方法 → **只有宿主那一份 `dsh-session` 能写**，bundle 自带副本会 brand 失败（③.5、D1） |
| `src/host/record-store.ts`（新建） | `dsh/dsh-session/README.zh.md:70-76` — 「`packages/experimental/` 之外的包**同样不得调用**它」「名称 `plugin:<owner>/<record>`」「`pluginRecordOf` 把每个事件交给它的投影单元在 resume 时重建插件状态」；`dsh-session/lib/index.js:298-305` — `surfaceOpOf()` 里**只有 `ignorable === true` 的未知类型被放行**，而 `append()`（`:1517-1538`）只合并 `surfaceOp`/`sourceEventSeqs`，写不出 `ignorable` | 官方措辞比 diff-matrix 记的「仓内 gate」更强 → 上浮为待决 P1；同时确认**不能用 `session.append` 假装记录**：它只能写出「没有 `ignorable` 标记」的未知事件，而该标记的契约是「缺失即 required，读者遇未知类型必须拒绝对话重建」——这是把兼容性风险写进用户日志，不是可接受的实现捷径 |
| `src/host/record-store.ts`（新建） | `dsh/dsh-session-projection/lib/types/types.d.ts:23-24` — `SessionProjectionStateMap` 是空的、可合并的表；`dsh/dsh-session-projection/lib/index.js:68-92` — `register()` 只按 key 存表、校验 `stateVersion`；`:254`/`:296` — `stateSchema.parse()` **仅在从 checkpoint 行恢复时调用** | 第三方可注册 host-only 投影（A4）；`stateSchema` 需要真的 zod（我们不依赖「不会被调用」这一点） |
| `src/host/record-store.ts`（新建） | Inspect 契约 `Session.snapshotEvents(fromSeq?, toSeqExclusive?)`（`dsh/dsh-session/lib/types/index.d.ts:224`）、`ownEvents()`（`:231`）、`get seq()`（`:239`） | 投影不可用时可用公开日志读面重放（读路径零 DSH 运行时依赖） |
| `src/host/host-runtime.ts`（新建） | `plugins/project-mcp/src/host/plugin-loader.ts:83-118` — 运行时 import 的**基址梯形**（`ctx.root?.baseUrl` → `ctx.baseUrl` → `import.meta.url`）与「失败不缓存」；本地实测：`createRequire('/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json').resolve('@deepseek-ai/dsh-session')` → `…/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js`；而 `createRequire('<profile>/node_modules/dsh-plugin-*/package.json')` 解析失败、profile 根目录也解析失败 | 宿主实例只能从**运行中的 dsh 安装**解析；profile 侧安装的 devDep 副本必须被身份断言挡掉（D1） |
| `src/host/session-layer.ts`（新建） | `plugins/project-mcp/src/host/isolation.ts:164-166`（`sameDeny` 排序比较）、`:322-384`（三读并集 + 失败重试一次）、`:449-462`（`apply` 容忍 restrict 抛错）、`:498-507`（`lift` 容错）、`:211-213`（`inactive context` 视为退场）；`plugins/project-mcp/src/host/index.ts:159-172`（`agent/created` **返回 Promise** 以先于首步装配）、`:179-185`（`tools/change` 全量重算）、`:195-222`（命令注册） | 掩码引擎与生命周期整体照抄的工程先例（C1/C9）；本插件的差异只有「deny 来源从工作区归属换成会话开关状态」 |
| `src/host/index.ts`（新建） | `dsh/dsh-agent/lib/types/runtime-types.d.ts:227-233`（`agent/created` serial、await 监听器返回值、失败即创建失败）、`:164`（`whenIdle()`）、`:105`（`SessionStartSource`）；`dsh/dsh-agent/lib/types/index.d.ts:357`（`agents.list()`） | 挂载必须在首步前完成；**不**用 `whenIdle`（D8）；启动补挂沿用 file-reference-local 的 `agents.list()` 先例 |
| `src/host/commands.ts`（新建） | `dsh/dsh-commands/lib/types/index.d.ts:19-36`（`CommandInvocation.agent` = 精确会话）、`:38-55`（`CommandDefinition`，handler 不发给模型）、`:94`（`register`）；`dsh/dsh-commands/lib/types/types.d.ts:33-41`（`CommandResult` = `{kind:'success',text?}` \| `{kind:'error',text}`）；`dsh/dsh-commands/lib/index.js:78`（名字文法 `^[a-z][a-z0-9_-]*$`）、`:102-112`（`parseCommand`，rawInput 含分隔空白） | 命令是零 token 通道（回执不进模型）；名字只能是 `tools` / `tools-off` 这类（D2） |
| `src/host/defaults.ts`（新建） | `dsh/dsh-home-paths/lib/types/index.d.ts:78`（`dshHomePath(...segments)`）；`dsh/dsh-home-paths/lib/index.js:132-134` — 每次调用现读 `process.env`（所以隔离 `DSH_HOME` 的冒烟成立）；`dsh/dsh-atomic-write/lib/types/index.d.ts:46`（`writeFileAtomic(filename, content, {mode})`） | 默认档路径 `$DSH_HOME/session-tool-toggle/defaults.json`；写入用官方原子替换，不手搓 tmp+rename |
| `src/host/state.ts`（新建） | `dsh/dsh-tool-skill/lib/index.js:931-946` — `agent/pre-step` 里 `ctx.tools.get('skill', agent) === skillTool ? snapshot() : { skills: [] }`；`dsh/dsh-tool-skill/README.zh.md`（「目录发布后，无论可见性丧失……都会改为追加空目录来停用旧名称」） | C3 的机制证据：`skill` 被掩码后目录由官方自动退役/重发，本插件**零代码**即得（但翻转有目录消息成本 → S13 需在回执/README 提示） |
| `test/*`（新建） | `plugins/project-mcp/test/isolation.test.ts:37-75`（假 surface 记录 restrict/guard、可令 restrict 抛错） | 单测风格：纯函数 + 假端口，不 mock 宿主 |
| `README.md` / `AGENTS.md`（改） | `README.md:77-78`（插件清单表行格式）、`AGENTS.md`「插件清单」「DSH 基线」两节；`scripts/check-dsh-baseline.mjs:48-50`（`isDshPackage` 只认 `dsh`/`dsh-*`）、`:150`（非 multi-root 即软插件）、`:181-192`（软插件范围断言） | 新包自动纳入基线检查，只需文档补行 + 精确 pin，脚本零改动 |
| `pnpm-workspace.yaml`（条件改） | `scripts/check-dsh-baseline.mjs:62-67`（年龄豁免集合只含 `@deepseek-ai/dsh*`/cordis/schemastery/libreoffice-kit）、`:235-247`（锁与豁免必须精确一致） | zod 不进豁免表也合规 → 该改动是「安装被拦」时的兜底，不是常规项 |

---

## ③ 接口与数据形状

> 约定：所有跨文件类型放 `src/host/types.ts` 或各自模块顶部；**纯函数可单测**，副作用集中在 `src/host/index.ts` 与 `session-layer.ts`。注释一律 zh-CN（仓库语言约定）。

**共享最小面**（`src/host/types.ts`，把宿主类型收窄到本插件实际用到的那几项，单测可造假对象）：

```ts
/** 一条已提交事件的最小面（真实类型是宿主的 SessionEvent）。 */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
  readonly ignorable?: true
}

/** 本插件用到的 Session 面（真实对象是宿主 Session 实例）。 */
export interface SessionLike {
  readonly id: string
  readonly header: { readonly cwd?: string; readonly isSeeded: boolean; readonly createdAt: number }
  /** 身份断言用：应与宿主 dsh-session 的 `Session` 类全等。 */
  readonly constructor: unknown
  /** 真实方法名是单数 `eventAt(seq)`。 */
  eventAt(seq: number): SessionEventLike | undefined
  snapshotEvents(fromSeq?: number, toSeqExclusive?: number): readonly SessionEventLike[]
}

/** 本插件用到的 Agent 面（`agent/created` 的载荷）。 */
export interface AgentLike {
  readonly session: SessionLike
  readonly ctx: unknown                              // 真实类型是 Cordis Context；按 `ctx.inject`/`ctx.effect` 的最小面声明
  readonly options?: { readonly provider?: string; readonly model?: string }
}

/** 诊断端口（与 project-mcp 的 ScanLog 同形，便于单测收集日志）。 */
export interface SpecLog { info(message: string): void; warn(message: string): void; error(message: string): void }
```

### 3.1 地址（`src/host/address.ts`）

```ts
/** 一个开关对象。state 里只存规范形（canonical text）。 */
export type SwitchAddress =
  | { readonly kind: 'mcp-group'; readonly server: string }              // mcp:yunxiao
  | { readonly kind: 'mcp-tool'; readonly server: string; readonly pattern: string } // mcp:yunxiao::get_* / ::list_pages
  | { readonly kind: 'tool'; readonly name: string }                    // tool:workflow / tool:skill

export type ParseErrorCode =
  | 'empty' | 'unknown-prefix' | 'bad-server' | 'bad-tool-name'
  | 'mcp-tool-uses-tool-prefix' | 'reserved-tool' | 'protected-tool'

export type ParseResult =
  | { readonly ok: true; readonly address: SwitchAddress; readonly text: string }
  | { readonly ok: false; readonly code: ParseErrorCode; readonly message: string }

/** 解析一条用户输入；`protected` 为当前生效的保护名单（基线 ∪ config 追加）。 */
export function parseAddress(input: string, protectedNames: ReadonlySet<string>): ParseResult

/** 规范形文本（state 与回执都用它）。 */
export function formatAddress(address: SwitchAddress): string

/** 语义相等（serverName 大小写敏感、pattern 原样比较）。 */
export function addressesEqual(left: SwitchAddress, right: SwitchAddress): boolean

/** public name 是否命中该地址；name 必须是注册表里的名字。 */
export function matchesToolName(address: SwitchAddress, toolName: string): boolean
```

文法与归一规则（写死，单测覆盖）：

| 输入 | 结果 | 说明 |
|---|---|---|
| `mcp:<server>` | `{kind:'mcp-group'}` | serverName 取 `dsh/dsh-mcp-client/README.zh.md:58` 的文法 `[A-Za-z0-9_-]{1,32}` |
| `mcp:<server>::*` | 归一到 `mcp:<server>` | 「关全部子工具」与「关整组」是同一个意图，状态里只留一种拼写 |
| `mcp:<server>::<tool>` | `{kind:'mcp-tool', pattern:tool}` | 完整匹配 public name 的后缀 |
| `mcp:<server>::<prefix>*` | `{kind:'mcp-tool', pattern:'prefix*'}` | **只支持尾部 `*`**；`?`/字符类/中间 `*` 直接报 `bad-tool-name` |
| `skill` | 归一 `tool:skill` | 用户口语（C3「skill 整档」）保留为**别名**，状态里只存规范形（D3） |
| `tool:<name>` | `{kind:'tool'}` | 拒 `mcp__*`（报 `mcp-tool-uses-tool-prefix`，提示改用 `mcp:` 形式）、拒 `run_code`（registry 保留名，restrict 会抛）、拒保护名单 |
| 其他前缀 | `unknown-prefix` | 错误文案带完整文法一行 |

### 3.2 状态与持久化记录（`src/host/state.ts` + `src/host/record-store.ts`）

```ts
/** 整值状态：一条记录永远写全量（whole-value event rule）。 */
export interface SessionToolState {
  readonly version: 1
  /** 本会话关闭集，已排序去重的规范形文本。 */
  readonly disabled: readonly string[]
  /** 本会话创建时从默认档拍下的快照（`/tools reset` 回到这里）。 */
  readonly snapshot: readonly string[]
  /** 是否已由一条日志记录建立（false = 空日志/新会话/插件安装前的旧会话）。 */
  readonly seeded: boolean
  /** 最近一次写入的 epoch ms（仅诊断用）。 */
  readonly updatedAt: number
}

export const EMPTY_STATE: SessionToolState            // {version:1, disabled:[], snapshot:[], seeded:false, updatedAt:0}
export function withToggled(state: SessionToolState, address: SwitchAddress, on: boolean): SessionToolState  // 无变化时返回**同一引用**
export function normalizeState(raw: unknown, log: SpecLog): SessionToolState   // owner 自校验：坏条目逐条丢弃 + warn
export function parseDisabledTexts(texts: readonly string[], protectedNames: ReadonlySet<string>): readonly string[]  // 双保险：存储层再校验一次
```

声明式接线（两处 module augmentation，放 `record-store.ts`）：

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** 本插件的整值会话开关状态（type 文法正则见 dsh-session/lib/index.js:1248）。 */
    'plugin:session-tool-toggle/state': SessionToolState
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** host-only 投影：不回传客户端（无 wire）。 */
    sessionToolToggle: SessionToolState
  }
}
```

投影单元（`stateVersion: 1`，无 `wire`）：`init()` 返回 `EMPTY_STATE`；`apply(state, event)` 用本仓自带的 `pluginRecordOf` 等价函数（6 行，见下）判定，不是本插件的记录就**返回同一引用**（零下游工作）。

```ts
/** 与 dsh-session 的 pluginRecordOf 等价的最小子集；不 import 宿主模块（读路径零运行时依赖）。 */
export function recordOf(event: SessionEvent): { type: string; seq: number; time: number; data: unknown } | undefined
// 判定：event.ignorable === true && /^plugin:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(event.type)
```

存储端口与两条实现（同一契约，按可用性择一）：

```ts
export type StoreKind = 'record' | 'memory'

export interface StateStore {
  readonly kind: StoreKind
  /** 读本会话状态：投影优先，`sessionProjections` 缺失时用日志重放兜底。 */
  read(session: SessionLike): SessionToolState
  /** 写整值；失败抛错由调用方降级（内存态 + 告警），不得让命令失败。 */
  write(session: SessionLike, state: SessionToolState): void
}

export class RecordStateStore implements StateStore   // host 模块可用时
export class MemoryStateStore implements StateStore   // 降级：read 返回上次写入值，write 只更内存
```

`RecordStateStore.read` 的判定顺序（写死）：

1. `ctx.sessionProjections.stateOf(session, 'sessionToolToggle')` 有效 → 用它（D1 主路线；投影是整段日志的惰性折叠，权威）。
2. `sessionProjections` 不可用 / 返回 `undefined` → `foldStatus(session.snapshotEvents(), …)` 重放（读面用 `dsh/dsh-session/lib/types/index.d.ts:224` 的公开方法，**不**需要宿主模块）。
3. 两者都没有（无日志读面）→ `EMPTY_STATE` + 一次 warn。

`RecordStateStore.write`：`host.appendPluginRecord(session, 'plugin:session-tool-toggle/state', state)`；**不**在 `session/event` / 投影 `apply` 里调用（官方文档：reenter 另一个 append 的发布会抛错）。

### 3.3 掩码计划（`src/host/mask.ts`）

```ts
export interface MaskInputs {
  /** 宿主全局层名字（插件自身 ctx 读，**不受**任何 agent 限制）。 */
  readonly catalog: readonly string[]
  /** 该 agent 视角名字（`tools.schemas(agent)`；本插件上一轮的掩码已生效 → 会缺名字）。 */
  readonly scoped: readonly string[]
  /** 上一轮 deny 里仍然受管的名字（否则第二读会缩小 → 掩码被抬掉，振荡）。 */
  readonly carried: readonly string[]
  readonly disabled: readonly string[]           // state.disabled
}

export interface MaskPlan {
  readonly deny: readonly string[]               // 排序；稳定顺序是 diff 守卫的前提
  /** 需要遮蔽 `mcp:<server>` 指令段的服务器（只由 mcp-group 产生）。 */
  readonly shadowServers: readonly string[]
  /** 每个地址命中的注册名数（0 = 当前无匹配，回执用它做两态区分）。 */
  readonly matched: ReadonlyMap<string, number>
}

export function planMask(inputs: MaskInputs): MaskPlan
export function guardReason(toolName: string, disabled: readonly string[]): string | undefined

/** 硬编码基线：**只能被 config 追加，永不可减**。 */
export const PROTECTED_BASELINE: readonly string[] = ['bash', 'pwsh', 'read', 'write', 'edit', 'glob', 'grep']
```

推导算法（与 project-mcp 同构，差别只在「可见集」的来源）：

1. `candidates = union(catalog, scoped, carried)`；
2. `deny = candidates.filter(name => disabled.some(addr => matchesToolName(addr, name)))`，排序；
3. `shadowServers = disabled 中 kind==='mcp-group' 的 server`（单工具/内置工具关闭**不**产生遮蔽段 —— D2 语义）；
4. `matched[addr] = 命中数`。

### 3.4 每 agent 层（`src/host/session-layer.ts`）

```ts
/** 一个 agent 作用域的可写面（由 `agent.ctx.inject(['tools','systemPrompt'])` 交付）。 */
export interface ScopedSurface {
  restrict(filter: { readonly deny: readonly string[] }): () => void
  guard(guard: (execution: { readonly name: string }) => string | undefined): () => void
  section(section: { readonly name: string; readonly order: number; readonly text: string; readonly interpolate?: boolean }): () => void
  visibleNames(): readonly string[]
  sectionOrder(name: 'MCP_SERVERS'): number
}

export class SessionLayer {
  /** 挂载：装 guard（一次，读实时状态）→ 应用首轮掩码。返回 Promise 供 `agent/created` await。 */
  attach(agent: AgentLike, state: SessionToolState): Promise<void>
  /** 状态变更：重算并只在 deny/shadow 变化时重装。 */
  setState(state: SessionToolState): void
  /** `tools/change` 全量重算（幂等）。 */
  refresh(): void
  /** 拆卸：抬掩码、撤 section、清账；容忍 inactive context。 */
  detach(): void
  /** 供 `/tools status` 读的一手事实。 */
  snapshot(): { readonly deny: readonly string[]; readonly shadowServers: readonly string[]; readonly visible: readonly string[] }
}
```

不变量（写进单测）：

- **I1** guard 只装一次，闭包读 `this.disabled` 最新值（免重装、免窗口）。
- **I2** 同一 deny 集的二次 `refresh()` **不**产生新的 `restrict()` 调用（记录 `sameDeny`）。
- **I3** `restrict` 抛错（名字在读与写之间消失）→ 抬掉旧掩码、从活读数重推一次、重试一次；仍失败则保持无掩码（guard 仍拦）+ error 日志（照抄 `isolation.ts:339-384`）。
- **I4** section 的 name 恒为 `mcp:<server>`，`order = sectionOrder('MCP_SERVERS')`，`text: ''`，`interpolate: false`。
- **I5** `detach` 里每步各自 try/catch，`inactive context` 静默（沿用 `isolation.ts:211-213`）。

### 3.5 宿主模块解析与身份断言（`src/host/host-runtime.ts`）

```ts
/** 宿主那一份 dsh-session 的写入面（只有 `Session` 类身份匹配时才会被构造）。 */
export interface HostSessionApi {
  appendPluginRecord(session: SessionLike, type: string, data: unknown): number
}

export interface HostRuntimeOptions {
  /** 配置覆盖：绝对路径（排障 / 单测注入）。 */
  readonly modulePath?: string
  /** 诊断出口。 */
  readonly log: SpecLog
}

/**
 * 解析宿主 dsh-session 并**验证身份**；任一环节失败返回 undefined（调用方降级内存态）。
 * 身份断言：mod.Session === session.constructor（session 来自 agent.session）。
 */
export function loadHostSessionApi(session: SessionLike, options: HostRuntimeOptions): Promise<HostSessionApi | undefined>
```

解析梯形（顺序即优先级，**每级都必须过身份断言**）：

1. `options.modulePath`（绝对路径；单测/排障用）；
2. `realpath(process.argv[1])` → 向上找最近的 `package.json` 且 `name === '@deepseek-ai/dsh'` → `createRequire(pkgJson).resolve('@deepseek-ai/dsh-session')` → `import(pathToFileURL(file).href)`；
3. 失败即 `undefined`。

> **为什么不走 `import('@deepseek-ai/dsh-session')` 裸 specifier**：profile 侧安装会把这个包作为 devDep 装成**第二份副本**，副本的 `commitPluginRecord` 绑在副本自己的 `Session` 类上，而 `#appendRecord` 是私有方法 → 对宿主实例调用会抛 brand 错误。实测：`createRequire('<profile>/node_modules/dsh-plugin-project-mcp/package.json').resolve('@deepseek-ai/dsh-session')` = MODULE_NOT_FOUND，而 `<profile>/node_modules/dsh-plugin-project-mcp/node_modules/@deepseek-ai/dsh-mcp-client` 确实存在（devDeps 随 profile 安装）。

### 3.6 默认档（`src/host/defaults.ts`）

```ts
export interface DefaultsFile { readonly version: 1; readonly disabled: readonly string[] }

/** 默认路径：`dshHomePath('session-tool-toggle', 'defaults.json')`；config.defaultsFile 可覆盖。 */
export function defaultsPath(configured?: string): string

export interface DefaultsIo { readFile(path: string): Promise<string>; writeFile(path: string, data: string): Promise<void> }
export async function readDefaults(path: string, io: DefaultsIo, log: SpecLog): Promise<DefaultsFile>   // 缺失/损坏 → {version:1,disabled:[]} + warn
export async function writeDefaults(path: string, file: DefaultsFile, io: DefaultsIo): Promise<void>    // writeFileAtomic(…, {mode:0o600, dirMode:0o700})
```

生效语义（Q5-a 写死）：**会话创建时快照**。`agent/created` 里若 `state.seeded === false` → `withSnapshot(state, defaults.disabled)` 并**立即写一条记录**（哪怕默认档为空）。这条「空也写」是刻意的（D9）。

### 3.7 命令面（`src/host/commands.ts`）

单一命令 `tools`（名字合法：`dsh/dsh-commands/lib/index.js:78`），`input: { hint: 'status | off <地址…> | on <地址…> | reset | default [off|on|set|reset] <地址…>' }`：

| 输入 | 语义 | 回执要点（zh-CN） |
|---|---|---|
| `/tools`、`/tools status` | 只读 | 四段：本会话开关 / 默认档（含路径与快照来源）/ 可关对象（按 server 分组计数 + 单工具命中数）/ 保护名单与被其他作用域隐藏的计数 |
| `/tools off <addr…>` | 本会话关闭 | `已关闭：<addr>（隐藏 N 个工具定义[ + 1 段服务器指令]）`；`本会话可见工具 A → B`；`下次请求生效；前缀缓存将从第一个变化的 schema token 起重建一次` |
| `/tools on <addr…>` | 本会话开启 | 对称文案，**同样**带缓存重建提示（S5 的对称补充） |
| `/tools reset` | 回到创建时快照 | `已重置 N 项 → 创建时快照（M 项关闭）` |
| `/tools default` | 只看默认档 | 文件路径 + 条目 + `本会话创建于 <time>，快照来源=<…>` |
| `/tools default off\|on <addr…>` | 写默认档（只影响后续新会话） | `默认档已更新（对之后新建的会话生效；本会话不变）` |
| `/tools default set <addr…>` / `reset` | 整份覆盖 / 清空 | 同上 |

错误路径一律 `{kind:'error'}` 且文案带一行文法：保护名单命中（列出名单）、`run_code` 保留名、`tool:mcp__…` 用错前缀、通配语法不合法、地址为空。未知 server/工具**不**报错（宽容，C10）：`已记录：<addr>（当前无注册工具匹配；服务器上线后自动生效）`。

### 3.8 插件配置（`Config`，schemastery）

```ts
export interface Config {
  /** 持久化通道：auto = 宿主模块可用则写会话日志，否则内存态。默认 'auto'。 */
  storage?: 'auto' | 'memory'
  /** 在 PROTECTED_BASELINE 之上**追加**保护名（不能减项）。 */
  protectedTools?: string[]
  /** 覆盖默认档路径（绝对路径）。 */
  defaultsFile?: string
  /** 覆盖宿主模块解析锚点（绝对路径，排障/单测用）。 */
  hostModuleBase?: string
}
```

`cordis.patch.yml` 不带 `config:`；上述键全部可选（`--dump-config-schema` 可见）。

### 3.9 关键不变量汇总（实现与评审的检查表）

1. deny 只含当前注册表存在的名字（restrict 未知名抛错）。
2. deny 与 shadowServers 只在变化时才重装（自激守卫）。
3. guard 读实时状态、只装一次；被关工具的迟到调用有可读拒绝理由。
4. `mcp:<server>` 组关闭 ⇒ deny 该组全部工具 **且** 遮蔽 `mcp:<server>` 段；单工具/内置关闭 ⇒ 只 deny。
5. 保护名单在解析期拒绝，且基线不可减。
6. 记录是整值事件、`ignorable: true`、type 合法；写入前经宿主身份断言。
7. 读路径投影优先、日志重放兜底、都没有则空态。
8. 命令回执不进模型请求；不发任何 `session.append` 之外的模型可见内容（本插件**不**写 user/developer 消息）。
9. 会话创建时快照默认档（含空档），此后改默认档不影响已存在会话。
10. 拆卸/卸载不留悬挂 restrict、section、guard；agent 退场只影响它自己。

---

## ④ 决策记录

> 每条格式：**决策 → 依据 → 被否方案与理由 → 反例（≥1）**。

### D0 writer skill 豁免（用户已拍板，此处仅留痕）

- **决策**：本次不加载 writer skill。仓库为 TypeScript/pnpm workspace 的 DSH(Cordis) 插件仓，聚合层仅有 `spring-writer`（Java/Spring）与 `nuxt-writer`（Vue/Nuxt）两条，栈不匹配；用户 2026-10-30 拍板豁免，**如实标注、不静默跳过**。
- **替代硬约束（本设计的实际规范源）**：根 `AGENTS.md` 的「插件结构约定」（`plugins/<name>/`、`dsh.bundle.patch`、`src/`→`lib/` 随仓库提交、vitest/oxlint、web 侧才写 `dsh.client`）、「DSH 基线」（`scripts/dsh-baseline.mjs` 唯一常量、软插件范围派生）、「开发与验证命令」（`pnpm build/typecheck/test/lint/dsh:check/release`）+ `plugins/project-mcp/` 结构先例（`src/host/isolation.ts` 掩码引擎、ports/适配分层、`build.mjs`/`vitest.config.ts`/`tsconfig*`）。
- **证据**：`AGENTS.md:18-24`（插件清单）、`:25-32`（插件结构约定）、`:33-39`（DSH 基线）、`:40-75`（开发与验证命令表）；`scripts/dsh-baseline.mjs:11-24`；`plugins/project-mcp/{package.json,cordis.patch.yml,build.mjs,src/host/isolation.ts}`。
- **反例**：若按 Vue 栈的 `nuxt-writer` 指导，会引入 `<script setup>`/composable 分层与客户端构建链，而本插件是**纯宿主面、无 `dsh.client`**，两套规范直接冲突（`AGENTS.md:31` 明写只有 web 侧插件才声明 `dsh.client`）——所以「没有对应 skill 就不加载」比「硬套一个不匹配的 skill」风险更低。

### D1 持久化：会话日志插件记录为主，内存态为代价最低的降级（并上浮 P1）

- **决策**：按 diff-matrix D1 落 `appendPluginRecord` + host-only 投影 fold；写入前做**宿主模块身份断言**；断言失败或服务缺失时降级为内存态（本会话有效、resume 丢状态），**不**引入 sidecar。
- **依据**：`dsh/dsh-session/lib/types/types.d.ts:527-535`（`PluginRecordMap` 由包自 augmentation，官方文档原话「Packages augment this map to type writes」）；`dsh/dsh-session/lib/types/index.d.ts:106-117`（记录不进模型面、fork/resume 随日志携带、owner 可丢）；`dsh/dsh-session/lib/index.js:1540-1541`+`:1548+`（**写入经由类私有方法** → 只能用宿主那一份模块）；本地 spike：从仓库外的模块调用 `appendPluginRecord(Session.create(...), 'plugin:session-tool-toggle/state', {...})` 成功返回 seq=1，事件形如 `{"type":"plugin:session-tool-toggle/state","seq":1,"ignorable":true,…}`，非法 type 与非 JSON payload 均被拒（脚本 `/tmp/stt-spike/probe2.mjs`，可复跑）。
- **上浮（不重开收敛）**：`dsh/dsh-session/README.zh.md:70` 明确「`packages/experimental/` 之外的包同样不得调用它」——比 diff-matrix 记录的「仓内 gate」更强。该措辞是**政策**而非运行时 gate（spike 已证运行时接受），因此设计保持 D1 目标不变，把「是否接受该政策」列为待决 P1（TOP）。
- **被否方案 1：直接 `import { appendPluginRecord } from '@deepseek-ai/dsh-session'`（或让 esbuild 打进 bundle）**。理由：那会拿到**第二份模块**，其 `commitPluginRecord` 绑在副本自己的 `Session` 类上，`session.#appendRecord` 的私有 brand 校验必然失败；且 profile 安装确实会装出副本（实测 profile 里存在 `dsh-plugin-project-mcp/node_modules/@deepseek-ai/dsh-mcp-client` 这类 devDep 副本）。
- **被否方案 2：`session.append('plugin:…', data)` 绕过 `appendPluginRecord`**。理由：`append()` 只合并 `surfaceOp`/`sourceEventSeqs`（`dsh-session/lib/index.js:1517-1538`），**写不出 `ignorable: true`**；而 `ignorable` 的文档契约是「缺失即 required，读者遇未知类型必须拒绝对话重建」（`dsh-session/lib/types/types.d.ts:498-507`），运行时的唯一豁免口正是 `surfaceOpOf()` 里那句 `event.ignorable === true`（`dsh-session/lib/index.js:301`）→ 会给用户埋一个「升级/换读方后会话打不开」的雷。
- **被否方案 3：sidecar 文件（B 线原始主张）**。理由：要自管原子写 + 跨进程锁 + 会话删除后的垃圾回收 + 无 schema 校验；而这些能力宿主已有公开面（`writeFileAtomic` 仅解决一半；真正的替代见 D1-b）。
- **被否方案 4（D1-b）：借用 `ctx.sessionProjectionCache` 当存储**。理由：缓存是「fold 短接」不是权威（`dsh/dsh-session-projection-cache/lib/types/index.d.ts:9-13`），状态必须能由日志推导，且它**没有公开写入口**（写入在内部 write-behind）。把非日志推导的状态塞进去，一次 `ver`/`seq` 校验就会丢。
- **若 P1 结论是「不得调用」**：同一 `StateStore` 端口的第二实现改为 `ctx.storageDomain.open(defineDomain({…}))`（`dsh/dsh-storage-domain/lib/types/index.d.ts:52-105`，公开面、zod 校验、后端路由），代价是 fork 需拷贝行 + 会话删除后留孤儿行。

### D2 命令面：单一 `/tools` + 子文法，而不是 5 个独立命令

- **决策**：`/tools <verb> …`，verb ∈ `status|off|on|reset|default`。
- **依据**：`dsh/dsh-commands/lib/index.js:78`（名字文法）与 `:102-112`（`parseCommand` 会把名字之后的全部原文交给 handler，**空格与子参数天然可用**）；`dsh/dsh-commands/lib/types/index.d.ts:38-55`（`input.hint` 就是给自由文本准备的）；回执不进模型（同文件 `:53-54`「without sending the command to the model」）。
- **被否方案**：`/tools-off`、`/tools-on`、`/tools-status`、`/tools-default` 四个独立命令。理由：地址文法是本功能唯一的复杂输入，四个命令要复制同一套解析与错误文案；且斜杠菜单是可发现性资源，5 个 `tools-*` 会把菜单挤满（用 `hint` 一行给文法更省）。代价：不点开 hint 的用户不知道子命令——用 README + `/tools` 无参输出里回显文法来补。
- **反例**：若用户要求「不问就能发现」，本决策会落选；这是待决 P2 的由来。

### D3 `skill` 作为 `tool:skill` 的别名在解析期归一

- **决策**：接受 `skill` 拼写，但状态里只存规范形 `tool:skill`。
- **依据**：diff-matrix 收敛结论把 `skill`（整档）列为独立地址形态；而 `skill` 的关闭机制就是「deny 一个工具名」（`dsh/dsh-tool-skill/lib/index.js:935`），与 `tool:<name>` 完全同构。
- **被否方案**：两种拼写都进状态。理由：同一效果两个字符串 → `/tools status` 要合并展示、去重、diff 守卫要比较两套等价集合，纯增复杂度。
- **反例**：若未来 skill 变成「部分工具 + 部分目录」的复合对象，别名会掩盖语义差异——届时加 `skill:` 前缀并做明确迁移，而不是现在预支。

### D4 指令段遮蔽用「agent 作用域同名空 section」

- **决策**：`mcp:<server>` 组关闭时，在 agent 子 fiber 上注册 `section({ name: 'mcp:<server>', order: getSectionOrder('MCP_SERVERS'), text: '', interpolate: false })`。
- **依据**：`dsh/dsh-mcp-client/lib/index.js:737`（全局同名段）；`dsh/dsh-scope/lib/index.js:177-181`（merge 后写胜出）；`dsh/dsh-system-prompt/lib/types/index.d.ts:201-209`（空段被丢弃）+ 本地实测（空段 + 保留段 → 只渲染保留段）；官方先例 `dsh/dsh-file-reference-local/lib/index.js:342-349`。
- **被否方案 1：改 MCP 行的 `disabled: true` / 改 `cordis.patch.yml`**。理由：进程级、影响所有会话（C7 明确不做进程级管理）。
- **被否方案 2：在 plugin 根 ctx 注册同名空段**。理由：那是**全局层**，会把指令段对**所有**会话吞掉（同名重复还会抛错）。
- **反例**：`restrict` 只摘 schema 不摘指令（`dsh/dsh-tools` 与 `dsh/dsh-mcp-client` 是两套注册）——只 restrict 的话一台指令 3 KiB 的服务器只省 schema，用户会觉得「开关没用」（B R2 的反例）。本决策正是为堵这个洞。

### D5 保护名单是硬编码基线 + 只可追加的配置

- **决策**：`PROTECTED_BASELINE = ['bash','pwsh','read','write','edit','glob','grep']`；`config.protectedTools` 只能**并集追加**。
- **依据**：diff-matrix D3 的用户拍板「硬保护名单拒关自救基础（集合 design 定）」。
- **为什么是这七个（而不是更多）**：它们构成「读→改→搜→跑」的自救闭环，且**schema 便宜**；真正的 token 大头是 MCP 工具与 `task_board_*`/`notes_*`/`schedule_*`/`workflow` 这类大 schema（本轮实测非 MCP 75 个）。保护它们是**性价比判断**，不是安全边界。
- **被否方案 1：不设名单，仅二次确认**。理由：命令通道无「二次确认」原语（`CommandResult` 只有 success/error），实现二次确认要么加输入状态机（`/tools off x --yes`），要么上 UI——都超出 v1。
- **被否方案 2：允许配置**删减**基线**。理由：一个 `protectedTools: []` 就能把自救闭环关掉，且出问题时最先被怀疑的是插件本身。
- **反例**：其它部署若没有 `pwsh`/`grep`，名单里多出的名字**不会**产生副作用（解析期只做名字比较，注册与否无关）；反过来若某部署的 shell 叫 `shell_exec`，它会**不被保护**——这是已知缺口，写进 ⑥ U，用 `config.protectedTools` 追加。

### D6 单工具匹配打在 public name 上（不接受 raw MCP 名）

- **决策**：`mcp:<server>::<pattern>` 的 pattern 只与 `mcp__<server>__<suffix>` 的 `<suffix>` 比较；`/tools status` 展示的也是 public 后缀。
- **依据**：`dsh/dsh-mcp-client/lib/index.js:96-102` — public name 是 `(serverName, rawName)` 的确定性函数，含 12-hex hash 的兜底路径会**改变名字**；`:131-133` — 注册与去重都按 public name。
- **被否方案**：接受 raw MCP 工具名（用户从服务器文档抄来的名字）。理由：raw 名到 public 名要做同一套归一（含 hash），一旦归一逻辑漂移就静默不匹配；而且我们**只有** public name 可用（注册表里没有 raw 名）。
- **反例**：某服务器工具名 `report.download`（含 `.`）→ public name 变成 `mcp__s__report_download_<hash12>`；用户若照文档输入 `mcp:s::report.download` 会「无匹配」，回执必须显式说「0 个匹配，本会话可用后缀见 `/tools status`」而不是假装成功。

### D7 回执不做 token 估值，只报**计数**与**代价形状**

- **决策**：回执给「隐藏 N 个工具定义」「可见 A → B」「缓存重建一次」，不给「省 ~X token」。
- **依据**：`dsh/dsh-tools/README.zh.md:170-176`（固定成本与可见定义成正比、前缀缓存失效点）+ `dsh/dsh-token-meter/lib/types/index.d.ts:46`（`measure(session)` 是**回放会话尾部**的测量，不是「假如少 N 个 schema」的预测）。
- **被否方案**：字符数/4 估算。理由：伪精度；且 `dsh/dsh-mcp-client/README.zh.md:167` 明说 schema 成本含服务器限定名，简单比例会给用户错误预期。
- **反例**：用户问「关掉 yunxiao 省多少」——正确回答是指向 ⑤ T7 的实测表（同一 prompt 开关前后 `request/header` 的 tools 段与 usage），而不是命令里拍一个数。

### D8 状态变更即时应用，**不** `await agent.whenIdle()`

- **决策**：命令 handler 内同步重算掩码并返回回执；竞态窗口由 guard 兜（迟到调用被拒、理由可读）。
- **依据**：`dsh/dsh-agent/lib/types/runtime-types.d.ts:164`（`whenIdle()` 存在但会等到整轮结束）；`dsh/dsh-tools/lib/index.js:3017-3022`（guard 零通知、立即生效）。
- **被否方案**：`await agent.whenIdle()` 后再应用（B R6 的原始建议）。理由：长轮次里回执会「卡住不动」，用户会重复点；而 guard 已经保证「命令返回后关掉的东西立刻不可调」，需要的一致性已经拿到。
- **反例**：若出现「装配已开始、掩码在装配中被改」的窗口，模型可能看到半新半旧的 tools 列表——后果是**下一次**请求自动收敛（`tools/change` → 重算），不会持续错误；把它写进 README 的「预期管理」段比阻塞命令更划算。

### D9 新会话**一定**落一条快照记录（即使默认档为空）

- **决策**：`agent/created` 且 `state.seeded === false` 时，用默认档拍快照并立即 append 整值记录。
- **依据**：diff-matrix Q5-a「创建时快照（改默认档只影响新会话，不追溯 resume）」。
- **被否方案：懒写（只在用户第一次改开关时写）**。理由（反例）：会话 S 建于默认档为空时 → 之后用户把默认档改成「关 yunxiao」→ S 被 resume 时无记录 → 懒写策略会**重新拍当前默认档**，把新默认追溯施加到老会话，正是 Q5-a 要禁止的行为。空也写多花的成本只是每会话一条小时级事件（`ignorable`，零模型成本）。
- **被否方案：记录里不存 `snapshot`，`/tools reset` 用「全开」**。理由：`reset` 的直觉是「回到我建这个会话时的样子」，而建会话时可能就是带默认档的；多存一个数组换准确的语义。

### D10 读路径「投影优先 + 日志重放兜底」

- **决策**：`stateOf` 优先；不可用时用 `session.snapshotEvents()` 重放；都不可用则空态 + 一次 warn。
- **依据**：`dsh/dsh-session-projection/lib/types/index.d.ts:117-133,175`（投影是整段日志的惰性折叠，权威）；`dsh/dsh-session/lib/types/index.d.ts:224`（公开日志读面）。
- **被否方案：只走投影**。理由：`sessionProjections` 是可缺席服务（有些极简组合不装），缺了就读不出状态 → 开关在 resume 后「静默失效」，比报错更难查。
- **反例**：一个只装了 `dsh-base` 的最小组合里没有 `sessionProjections`（服务清单可按 profile 变化），只走投影会让「关掉的开关」在重启后全部复活——用户会认为插件坏了。

### D11 宿主模块解析放在插件里（而不是要求用户在 profile 里加依赖）

- **决策**：`host-runtime.ts` 自带解析梯形 + 身份断言 + 配置覆盖。
- **依据**：实测三条解析事实（dsh 安装可解析、profile 根不可解析、插件包可解析到副本）；`dsh/dsh-session/lib/index.js:1540` 的私有钩子决定了「必须同一实例」。
- **被否方案：要求用户在 `cordis.patch.yml` 里传 `hostModuleBase`**。理由：把实现细节变成用户的运维负担；自动解析对本部署（标准全局安装）已实测可行，配置项只作兜底。
- **反例**：若 dsh 由 Electron/自研 launcher 启动，`process.argv[1]` 不是 dsh 的 bin → 解析失败 → 降级内存态并打一条可操作的 warn（含「请设置 `hostModuleBase`」）。这是可接受的降级，不是静默错误。

---

## ⑤ 逐任务组实现要点（与 tasks.md 分组一一对齐）

> tasks.md 落档时以本表为骨架；每组给「落点 / 要点 / 验证（具体命令或断言）/ 估时」。估时含测试与文档，单位人日。

### T1 提案与落档（openspec）

- **落点**：`openspec/changes/session-tool-toggle/{proposal.md,design.md,tasks.md,specs/dsh-session-tool-toggle/spec.md}` + `artifacts/` 四份材料副本。
- **要点**：把 P1/P2 的拍板结果写死；spec 的 5 个 REQUIREMENT 与 ③.9 的 10 条不变量一一对应（标题英文、正文 zh-CN）；design.md 收 ④ 全部决策；tasks.md 按 T2–T8 展开可勾选条目。
- **验证**：`openspec validate --all` 退出码 0；`openspec list` 出现该 change；`grep -c '^## ' design.md` ≥ 6（六字段齐全）。
- **估时** 0.5。

### T2 脚手架与装配最小闭环

- **落点**：1.1 的工程文件 + `src/index.ts` + `src/host/{index,types}.ts`；先只做「记录装配、命令 `/tools status` 返回常量」。
- **要点**：`inject: ['agents','tools']`；`agent/created` 返回 Promise；`ctx.on('tools/change')` 只打日志；`ctx.inject(['commands'])` 注册 `/tools`；`ctx.effect` 拆卸；`agents.list()` 启动补挂。
- **验证**：
  - `pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0；
  - `pnpm --filter dsh-plugin-session-tool-toggle build && node --input-type=module -e "const m=await import('./plugins/session-tool-toggle/lib/index.js'); console.log(typeof m.apply, m.name)"` 输出 `function session-tool-toggle`；
  - `docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle` 后 `docker exec dsh dsh --profile web --dump-config-schema` 退出码 0 且输出含 `session-tool-toggle`；
  - 会话内 `/tools status` 回执含 `本会话开关`。
- **估时** 1.0。

### T3 地址文法 + 状态模型 + 掩码引擎（核心）

- **落点**：`src/host/{address,state,mask}.ts` + `test/{address,state,mask}.test.ts`。
- **要点**：③.1 文法表逐条实现；`planMask` 三读并集 + carried；`withToggled` 无变化同引用；`PROTECTED_BASELINE` 与 `config.protectedTools` 并集；`run_code`/`tool:mcp__*` 解析期拒绝。
- **验证**（断言级）：
  - `parseAddress('mcp:a::*')` → `ok` 且 `formatAddress(...) === 'mcp:a'`；
  - `parseAddress('skill')` → `tool:skill`；`parseAddress('tool:bash')` → `code === 'protected-tool'`；`parseAddress('tool:run_code')` → `code === 'reserved-tool'`；
  - `planMask({catalog:['mcp__a__x','mcp__a__y','bash'], scoped:['bash'], carried:['mcp__a__x'], disabled:['mcp:a']})` → `deny===['mcp__a__x','mcp__a__y']`、`shadowServers===['a']`；
  - `disabled:['mcp:a::x']` → `deny===['mcp__a__x']`、`shadowServers===[]`；
  - server 断线（catalog/scoped 都不含 `mcp__a__*`）→ `deny===[]` 且**不抛错**；
  - `withToggled(state,'mcp:a',false)` 两次 → 第二次 `===` 第一次结果。
- **估时** 1.5。

### T4 每 agent 层（restrict + guard + 指令段遮蔽）

- **落点**：`src/host/session-layer.ts` + `test/session-layer.test.ts`；接进 `src/host/index.ts`。
- **要点**：③.4 的 I1–I5；`agent.ctx.inject(['tools','systemPrompt'], cb)` 子 fiber；diff 守卫；restrict 抛错重试一次；拆卸容错。
- **验证**：
  - 假 surface 上连续 `refresh()` 两次：`restrict` 调用数 === 1（mock 计数断言）；
  - 第二次 `refresh()` 前改 `disabled` → 调用数 === 2 且新 deny 正确；
  - `restrict` 第一次抛 `unknown tool` → 层重推后仅一次成功调用，`deny` 不含消失名；
  - guard 对 `disabled` 内名字返回非空理由、对其它返回 `undefined`；
  - `detach()` 后 `restricted === false`、section 数 === 0；`detach()` 在 surface 抛 `inactive context` 时不抛。
- **估时** 1.5。

### T5 持久化（记录 + 投影 + 身份断言 + 降级）

- **落点**：`src/host/{host-runtime,record-store}.ts` + `test/record-store.test.ts`。
- **要点**：③.2/③.5；投影 `stateVersion:1`、无 wire、`init` 返回 `EMPTY_STATE`；`apply` 非本记录返回同引用；写前身份断言；写失败降级内存态并 warn 一次（不刷屏）。
- **验证**：
  - 单测：注入假 `HostSessionApi`（记录调用与 payload）→ `write` 一次后 payload 为整值、`type === 'plugin:session-tool-toggle/state'`；
  - 身份断言失败（假 mod 的 `Session !== session.constructor`）→ `kind === 'memory'` 且 `append` 调用数 === 0；
  - 假 `sessionProjections` 缺失 + 假日志含两条记录 → `read` 得到折叠结果（重放兜底）；
  - 折叠：`[关 a, 开 a]` → 空集；`[关 a, 关 b]` → `['mcp:a','mcp:b']`（排序稳定）；
  - 真机（本仓 `docker exec dsh`）spike：新建会话后 `POST /api/session/page` 的日志里出现 `"type":"plugin:session-tool-toggle/state"` 且 `"ignorable":true`（复用 `plugins/user-commands/README.md:138` 的 HTTP 流程）。
- **估时** 1.5。

### T6 默认档

- **落点**：`src/host/defaults.ts` + `test/defaults.test.ts`；接入 `agent/created` 的快照分支与 `/tools default*`。
- **要点**：③.6；`dshHomePath` 现读 env（隔离冒烟成立）；`writeFileAtomic` 0o600/0o700；损坏/缺失降级 + warn；快照语义 D9。
- **验证**：
  - 单测：写→读回一致；半截 JSON → `{version:1,disabled:[]}` + 一条 warn；`disabled:['bogus']` → 过滤 + warn；目录不存在时 `writeDefaults` 自动建（mock io 断言 `dirMode` 参数）；
  - 真机：`DSH_HOME=/tmp/stt-home` 下 `/tools default off mcp:yunxiao` → `/tmp/stt-home/session-tool-toggle/defaults.json` 内容含 `"mcp:yunxiao"`；新建会话 `/tools status` 显示该默认项且状态为已关。
- **估时** 1.0。

### T7 命令面与回执

- **落点**：`src/host/commands.ts` + `test/commands.test.ts`；接进 `src/host/index.ts`。
- **要点**：③.7 全表；两态区分（注册但被别的作用域隐藏 / 真没注册）；KV 缓存提示开/关对称；`skill` 翻转的目录替换提示；错误文案带文法一行。
- **验证**：
  - 单测表驱动：`off mcp:a` 回执含 `已关闭：mcp:a`、`隐藏 2 个工具定义`、`前缀缓存`；`on mcp:a` 同样含 `前缀缓存`；`off mcp:zzz`（无匹配）含 `当前无注册工具匹配`；`off tool:bash` 错误含 `bash` 与保护名单；
  - status 夹具：`catalog=['mcp__a__x','mcp__b__y','bash']`、`scoped=['mcp__b__y','bash']`（a 被别的作用域隐藏）→ 输出同时含 `mcp:a 1`（全局有）与 `被其他作用域隐藏`；
  - 真机：`POST /api/commands/execute` 返回 `kind:success` 且文本与单测一致（隔离实例）。
- **估时** 1.0。

### T8 验证矩阵、文档与发布

- **落点**：插件 `README.md`、根 `README.md`/`AGENTS.md`、`openspec/.../artifacts/` 冒烟记录与省量表。
- **要点**：④ 的预期管理段；省量表用「同 prompt、开关前后 `request/header.tools` 数量 + `usage`」而非估算。
- **验证（本组的核心，全部为可执行断言）**：
  1. `pnpm test && pnpm typecheck && pnpm lint && pnpm build` 全绿；
  2. `pnpm dsh:check` 退出码 0（新包被自动识别为软插件）；
  3. **隔离实例冒烟**（`DSH_HOME=/tmp/stt-home`，端口 3099，`profiles/web` 符号链接 + 拷 `storages/`，方法见 `plugins/user-commands/README.md:138`）：
     - 基线读数两种取法（任一即可，推荐前者，因为它就是交付给用户的读面）：① Host Inspect Provider `Tool.listTools`（`cordis_inspect_query(platform='host', provider='Tool', method='listTools')`）→ 统计 `name` 以 `mcp__yunxiao__` 开头的条数；② 一轮对话后 `POST /api/session/page` 读最新 `request/header` 的 `header.tools` 同法统计。**在本部署（web profile + opc 工作区）记录基线值**（本文写稿时为 70；隔离实例若装配不同，以它自己的实测值为准，并在 artifacts 表里写明）；
     - `POST /api/commands/execute {agentId, line:'/tools off mcp:yunxiao'}` → `kind:'success'`，文本含 `隐藏 N 个工具定义`，其中 N = 上一步基线；
     - 再一轮对话 → 同一读数面 `mcp__yunxiao__*` 计数 **= 0**，可见工具总数减少恰好 N（本文基线 214 → 144）；
     - `system/message` 的最新渲染文本**不含** `### MCP server: yunxiao`（指令段遮蔽生效）；
     - 另建一个 `dsh-plugins` 工作区会话：`mcp__yunxiao__*` 计数仍等于基线 N（**邻会话不受影响**，C1 的隔离断言）；
     - 重启隔离实例 → resume 前一会话 → `request/header` 仍无 yunxiao（持久化 + 投影恢复）；
     - fork 该会话 → 新会话 `request/header` 同样无 yunxiao（**一次性拷贝**语义，A7）；
     - 负路径：`/tools off tool:bash` → `kind:'error'` 含 `bash`；关闭后让模型调用 `mcp__yunxiao__get_current_user` → 工具结果 `Error: unknown tool "…"`（掩码后不可达）或 guard 拒绝文案；
     - `skill` 翻转：`/tools off skill` 后一轮出现 `source.kind==='skill-catalog'` 且 `entries` 为空的 `user/message`；`/tools on skill` 后再出现 `entries` 非空、`update:true` 的一条（官方替换语义）；
     - 与 project-mcp 交集（S1）：opc 会话关 `mcp:figma` 后，在 `dsh-plugins` 会话 `/tools status` 把 figma 归入「被其他作用域隐藏」而不是「本会话已关」；
     - 压测（S8）：5 个存活会话 × 5 台 MCP（探针服务器复用 project-mcp 的测试件）触发 10 次 `tools/change` → 每次重算耗时 < 50 ms、无重复 restrict（插件日志计数断言）。
  4. `pnpm release <version>` 前 `git status` 干净、`lib/` 已随发布重建（`scripts/release.mjs:156-166` 自动做）。
- **估时** 1.5。

**合计约 9.5 人日**（B 线 T0–T6 = 6.5 人日 + 用户三个拍板项带来的增量：默认档 +1.0、单工具通配 +0.5、内置工具与保护名单 +0.5，另加持久化身份断言与降级 +0.5，四舍五入取 9.5）。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（实现时按此写，实测推翻则回填）

| # | 假设 | 若被推翻的后果 |
|---|---|---|
| A1 | 宿主对 `@deepseek-ai/dsh-session` 只有一份模块实例；`mod.Session === agent.session.constructor` 是可靠的身份判据 | 记录写不进去 → 降级内存态（开关 resume 失效），不影响会话可用性 |
| A2 | `agent/created` 期间 append 记录合法（不落在别的 append 的发布窗口内） | 该会话降级内存态并 warn；其它会话不受影响（逐会话 try/catch） |
| A3 | `source: 'clear'\|'compact'` 当前无发出方（`dsh/dsh-agent/README.zh.md:186`），所以状态判定**只看 `seeded`**，不按 source 分支 | 若将来 clear 截断日志且不重写记录，自动落到「空日志 → 重新拍快照」，仍与 Q5-a 一致 |
| A4 | 第三方包可在运行时注册 host-only 投影（类型表已 module augmentation，registry 只按 key 存表） | 退到日志重放读路径（D10），功能不减，只是每次 attach 多一次折叠 |
| A5 | PTC 呈现模式下 `schemas()` 仍返回可见工具集合，掩码同样缩小生成的 SDK 块 | 若 PTC 走别的取数面，`ptc` preset 下的会话省不到 token（文档标注，冒烟不覆盖 ptc） |
| A6 | MCP 资源/提示（`mcp-resources`）不在本次开关面内：组关只关工具 schema + 指令段 | 用户若期望连资源一起关，需扩面（v2） |
| A7 | 保护名单的比较在解析期完成，与「该工具当前是否注册」无关 | 无（这是刻意选择，输入更可预测） |
| A8 | 通配只支持尾部 `*`（前缀匹配），其余形式报错 | 用户若需要 `?`/中缀，扩展文法即可，不破坏既有状态 |
| A9 | 默认档是唯一持久真相（命令写入 ≡ 手编）；不监听文件变化 | 改档不影响已运行会话（Q5-a 的要求），也不需要重启 |
| A10 | `zod@4.4.3` 可从既有 lock 直接解析，不需要新增发布年龄豁免 | 若安装被年龄门拦，按 1.2 的条件项在 `pnpm-workspace.yaml` 追加 `zod@4.4.3` |
| A11 | 每 agent 一个 `agent.ctx.inject` 子 fiber 足以承载 restrict + section，且随 agent 退场自动撤销 | 若子 fiber 生命周期与 agent 不同步，`detach` 的显式抬掩码是第二道保险 |

### 6.2 未决项（技术层面，不阻塞设计）

| # | 未决 | 处理 |
|---|---|---|
| U1 | 宿主模块解析在非全局安装（npx / Electron / 自研 launcher）下的 `argv[1]` 形态未逐一验证 | D11 的降级路径 + `hostModuleBase` 覆盖；冒烟只覆盖本部署的全局安装 |
| U2 | `agent/created` 内 append 的窗口未实测 | T5 的真机 spike（`/api/session/page` 断言记录事件） |
| U3 | project-mcp 的 deny 与本插件的 deny 交集语义未实测（机制上是 `restrict` 相交，但「被工作区隔离的工具是否仍在 `restrictableNames`」需实测） | T8 的 S1 用例；源码依据 `dsh-tools/lib/index.js:3065-3069`（继承面名字都算 known） |
| U4 | 多 agent × 多服务器的重算量级未压测 | T8 的 S8 用例（5×5、10 次 `tools/change`） |
| U5 | project-mcp 加载的服务器（其 `mcp:<server>` 段注册在 project-mcp 的 fiber 上）能否被 agent 作用域同名遮蔽——机制上同属全局层，但未实测 | T8 的 figma 用例 + `system/message` 文本断言 |
| U6 | `CommandResult.text` 在 Web UI 的渲染上限（长 status 是否被截断） | T7 真机确认；必要时 status 分两段（概览 + `/tools status full`） |
| U7 | `source: 'clear'` 真正上线时的语义（是否保留前缀日志） | A3 的「只看 seeded」策略天然兼容两种情况；届时补一条冒烟 |

---

## 待决问题

> 需用户拍板。**P1 为 TOP**；不阻塞本文的落档，但阻塞 T5 的实现路线。

### P1（TOP）插件记录通道的官方措辞：继续用 `appendPluginRecord`，还是换 `ctx.storageDomain`？

- **问题**：`dsh/dsh-session/README.zh.md:70` 明写「`appendPluginRecord` 只为 `packages/experimental/` 下的包追加……**本仓库之外的插件同样不得调用它**」。diff-matrix 的 D1 把它判断为「仓内 gate、运行时可用、spike 兜底」；本轮实测确认**运行时确实可用**（spike 成功写入并读回），但这句是**政策**而非机制。继续使用 = 接受一个有官方保留态度的实验性通道。
- **选项**：
  - a) 继续用记录通道（D1 原路线），插件 README 与 design.md 明写「依赖实验性通道，官方删除/收紧时降级内存态」；
  - b) 改用 `ctx.storageDomain.open(defineDomain(...))` 自有持久域（官方公开面、zod 校验、后端路由），代价：fork 需拷贝行、会话删除后留孤儿行（要自带 `/tools-gc`）；
  - c) 先按 a 实现，把 b 作为同一 `StateStore` 端口的第二实现一起做（工作量 +1.0 人日，两条路都可切）。
- **我的推荐**：**c**（端口已在设计里，a 是默认，b 是配置可切）。理由：a 的收益（fork/resume 免费、零 GC）最大，但它建立在官方明确不鼓励的通道上；把 b 做成第二实现后，「政策变了」只改一个配置键，不需要重新设计。
- **影响面**：T5 的实现量与测试面、fork 语义（免费 vs 拷贝）、是否需要 GC 命令、README 的兼容性声明。

### P2 `/tools` 单命令 + 子文法，还是拆成 `/tools-off`、`/tools-on`、`/tools-status`、`/tools-default`？

- **问题**：命令面的可发现性 vs 解析/文案复用（D2）。
- **选项**：
  - a) 单命令 `tools` + 子文法（本文方案，`input.hint` 给文法）；
  - b) 四个独立命令（菜单里逐个可见，但地址解析与错误文案要复制四份）；
  - c) a + b 并存（`tools` 为权威，其余三个是薄壳转发；菜单更友好，代码 +0.2 人日）。
- **我的推荐**：**a**；若你觉得「不问就发现」更重要，选 c。
- **影响面**：斜杠菜单条目数、`commands.ts` 的解析结构、单测表规模、README 的用法段。

### P3 子代理（subagent / teammate）是否套用**用户级默认档**？

- **问题**：C6 已定「主会话的开关集**不**传播给子代理」；但默认档是**用户级全局意图**，子代理会话也是新建会话——它要不要在创建时同样拍快照？
- **选项**：
  - a) 套用（子代理也按默认档关；委派密集时省 token 最明显）；
  - b) 不套用（子代理永远全开，与「不传播」字面一致，但最费 token 的场景恰好是委派）；
  - c) 套用「服务器组」类默认项，不套用「单工具/内置工具」类（保守折中，实现多一层过滤）。
- **我的推荐**：**a**。理由：默认档是用户对「我这个部署默认不要什么」的表达，与「某个会话的选择」无关；不套用会让最重的 token 场景（agent team）完全免税。这不是推翻 C6——C6 约束的是**主会话状态**，默认档是另一条机制。
- **影响面**：`agent/created` 的快照分支是否按 `origin/delegationDepth` 过滤、README 的语义声明、T8 冒烟是否加一条子代理用例。

---

# 附录 · Web 配置面板扩展增量设计（2026-10-30）

> **本轮扩展的输入与编排**：用户追加需求「配置界面，入口放到会话头部的 "..." 工具区」；四项拍板（① 入口=`conversation.session.header.utilities`；② 归属=扩入本变更、插件变双端；③ 能力=完整管理面板；④ 不含配置键编辑）+ 编排拍板（轻量增量：Lead 事实核查与要点 + 单设计线 fresh subagent（deepseek-official/deepseek-flash 路由）深化 + Lead 落档修订）。以下为设计线产物全文（原文未改，其「本文」指本附录；与正文 ①–⑥ 的关系见文末附录 A 修订索引）。

# session-tool-toggle · Web 配置面板扩展设计（增量修订）

> **本文是 `code-design.md`（685 行）的增量修订，不是重写。** 未在本文出现的判断（地址文法、掩码引擎、持久化、默认档语义、命令面、六端口、10 条不变量）一律沿用 `code-design.md`，本文只回答「加一个 Web 面板要动什么」。
>
> **本次扩展的用户拍板（不可更改）**：① 入口 = `conversation.session.header.utilities`；② 归属 = 扩入本变更、插件从纯宿主变双端；③ 能力 = 完整管理面板（工具清单 + 会话级开关 + 用户级默认档编辑 + 关闭集展示）；④ 不含配置键编辑。
>
> **事实来源**：本机 DSH `0.2.1-rc.2` 安装包（`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/*`，下称 `dsh/`）、本仓双端先例 `plugins/web-ux/`、仓内 `node_modules` 里的 client 包（`plugins/web-ux/node_modules/@deepseek-ai/*`，下称 `repo/`）。每条关键断言都带 `file:line`；查不到或未实测的一律标 **「待实现期核实」** 并收进 §6.2。
>
> **规模总览**：新增 12 个 src 文件（共享契约 1 + 宿主 3 + client 8，≈2,260–2,890 行含注释）、10 个测试文件 + 1 个 primitives 替身（≈1,450 行）、7 处既有文件改写（含 `cordis.patch.yml` 仅注释）；端点 4 个、失败码 7 个（宿主侧）+ 2 个（传输侧）；新任务组 2 个（组 9、10），既有任务改动 6 条；新增决策 D12–D20 共 9 条。

---

## 1. 触达面增量

### 1.1 新增文件清单

> 「code-design 锚」列指明该文件在 `code-design.md` §1.1 表中**追加**在哪一行之后；`—` 表示本次扩展新增、原文无对应概念。

#### 共享（两端各内联一份，不共享运行时身份）

| 路径 | 改动意图 | 关键改动点 | 规模估 | code-design 锚 |
|---|---|---|---|---|
| `src/contract.ts` | **网上契约唯一事实来源**：通道名、端点集、失败码、请求/响应形状、边界 parser | 纯数据模块，**零 import**（不 `node:*`、不 `@deepseek-ai/*`、不 `zod`）；4 端点各一对请求/响应 parser；失败码常量表 + `isFailureCode`；地址长度/数量上限；`strict` 语义（未知字段视为越界） | 220–260 | 新增（无对应行；与 web-ux `src/contract.ts` 同构） |

#### 宿主半（新增 3 个）

| 路径 | 改动意图 | 关键改动点 | 规模估 | code-design 锚 |
|---|---|---|---|---|
| `src/host/control.ts` | **命令面与 Web RPC 的唯一用例内核**（本扩展的架构支点） | `toggleSession` / `resetSession` / `readPanel` / `writeDefaults` 四个 typed 用例；依赖注入 `ControlDeps`（StateStore + `layerFor(sessionId)` + defaults io + 保护名单 + log）；**校验-全有或全无**、`withToggled` → `store.write` → `layer.setState` 的固定顺序；回执字段（applied/matched/hiddenTools/visibleBefore/After/kvRebuild/notices） | 260–320 | 在 `src/host/commands.ts` 行**之前**插入；`commands.ts` 由「实现者」降级为「文本前端」 |
| `src/host/panel.ts` | 面板快照的**纯函数**构建器（可单测、无 IO） | `buildPanelSnapshot(inputs): PanelSnapshot`；三读并集 → 名字集合 → 分组（`mcp:<server>` / `skill` / builtin）→ 每条目的 `disabled/protected/reserved/shadowed` 标记；描述截断 160 字符、**不携带 parameters**；`stats` 四计数；`notices` 汇总 | 220–280 | 在 `src/host/mask.ts` 行后插入（复用 `planMask` 的读数面语义） |
| `src/host/rpc.ts` | Connection RPC 通道装配与 dispatcher | `CHANNEL`/端点派发；请求先过 `contract.ts` parser；异常与业务拒绝统一映射为 `ConnectionRpcResult`；`signal`/`peer` 透传但**不信任 payload** | 200–260 | 在 `src/host/host-runtime.ts` 行后插入（宿主侧外部入口） |

#### client 半（新增 8 个）

| 路径 | 改动意图 | 关键改动点 | 规模估 | code-design 锚 |
|---|---|---|---|---|
| `src/client/index.ts` | client 插件 `apply`：文案注册 + 座位注册 + 命令事件桥 | `inject: ['slots','locale']`（`connection` 渲染期软读，不进 `inject`）；`ctx.effect(() => ctx.locale.register(NS, {zh,en}))`；`ctx.slots.inject('conversation.session.header.utilities', …)` + `try/catch` 软注册；`ctx.effect(() => ctx.on('command/executed', …))` 生产跨 entry 的订阅面 | 120–150 | 新增目录 `src/client/`（原文纯宿主，§1.1 无该目录） |
| `src/client/panel-client.ts` | Connection RPC 客户端封装 | `createPanelClient(connection)`；`connection.rpc.call(CHANNEL, endpoint, payload)`；响应过 `contract.ts` parser；失败归一 `PanelError{code}`；`command/executed` 订阅面 | 130–170 | — |
| `src/client/panel-controller.ts` | 面板状态机（**可脱离 React 单测**） | `idle→loading→ready/failed`；`pending: Set<address>`、`savingDefaults`；`open/close/refresh/toggle/reset/writeDefaults`；快照 identity 稳定（喂 `useSyncExternalStore`）；stale-while-revalidate（保留上一份快照渲染新一次加载） | 220–280 | — |
| `src/client/ToolPanelAction.tsx` | 头部**入口按钮 + 面板容器** | 28px 圆形图标按钮（`aria-label`/`title`/`aria-expanded`）；`Modal`（primitives）承载面板；四段布局（状态摘要 / 分组清单 / 默认档 / 关闭集）；不借 `shell.overlay` | 260–340 | — |
| `src/client/ToolPanelGroups.tsx` | 分组清单与开关 | MCP 服务器行（可折叠到单工具）、skill 行、内置工具分区（本地过滤输入）；`Switch` 受控，`pending` 期间禁用；保护/reserved/shadowed 三态禁用 + `title` 理由；行级"意图已记录（0 匹配）"徽标 | 180–240 | — |
| `src/client/DefaultsEditor.tsx` | 用户级默认档编辑区 | 条目列表 + 删除；自由文本输入（文法提示）+ 添加；文件路径与「只影响之后新建的会话」；当前会话快照来源（创建时间 + 快照条目数）；保存后只刷新 defaults 视图 | 140–190 | — |
| `src/client/locales.ts` | 双语文案（NS `sessionToolToggle`） | 扁平 `Record<Key,string>`；`en` 用 `satisfies Record<Key,string>` 钉住；`declare module` 注册 `LocaleNamespaceMap`；失败码 → 文案键映射 | 160–200 | — |
| `src/client/panel.module.css` | 面板样式 | 仅补 Modal 骨架之外的层级（分区标题、行高、徽标、禁用态、折叠箭头）；颜色一律 `--dsw-alias-*` 令牌 + 静态兜底 | 150–200 | — |

**client 半文件数与行数**：8 个文件、≈1,360–1,770 行；宿主半 3 个文件、≈680–860 行；共享契约 1 个、≈220–260 行。

#### 测试（新增 10 个 + 2 处扩展）

| 路径 | 覆盖 | 规模估 |
|---|---|---|
| `test/wire-contract.test.ts` | 4 端点请求/响应的边界表：越界字段、超长地址、`reset` 带 addresses、空数组、未知端点 | 120 |
| `test/control.test.ts` | 共享内核：保护名单整体拒绝（不写盘）、0 匹配仍记意图、无变化返回同引用、写失败降级内存态、`reset` 回快照 | 150 |
| `test/panel.test.ts` | 分组纯函数：`mcp__x__y` 归属、`_` 与 `__` 歧义、skill/内置分区、shadowed 标记、描述截断、stats 四计数 | 180 |
| `test/rpc.test.ts` | dispatcher：端点派发、parser 失败 → `bad-request`、业务码透传、抛错 → `internal`、`session-not-live` | 160 |
| `test/panel-client.test.ts` | 传输失败 → `unavailable`、坏信封/坏响应 → `bad-response`、宿主码原样保留 | 100 |
| `test/panel-controller.test.ts` | 状态机：打开即拉取、并发 toggle 的 pending 集、失败后保留旧快照、`command/executed` 触发刷新（仅本会话 + `tools`） | 160 |
| `test/tool-panel.test.tsx` | jsdom：入口按钮存在且带 `aria-label`；保护名单 Switch `disabled` 且不发请求；切组开关发出 `mcp:<server>`；默认档添加/删除；`unavailable` 降级文案 | 220 |
| `test/client-index.test.ts` | `apply` 只注册一次座位、`locale.register` 被调用、`connection` 缺席时入口仍注册 | 80 |
| `test/locale-parity.test.ts` | zh/en 键集合一致（照抄 web-ux 同名套件） | 60 |
| `test/bundle.test.ts` | 双端产物纯度：client 只 require 平台表词；host 只 import `node:*`；client 内联了通道/端点字面量 | 90 |
| `test/stubs/ui-primitives.tsx`（新文件） | `Modal`/`Switch`/`Button` 的 DOM 形状替身（扩展 web-ux stub 的三个组件） | 90 |
| `test/commands.test.ts`（扩展） | 命令面改走 control 内核后：回执字段与既有断言仍成立（防回归） | +40 |

### 1.2 工程文件改动点

| 文件 | 现状（code-design 规划） | 本次改写 |
|---|---|---|
| `package.json` | 纯宿主：`exports {".": lib/index.js}`、无 `dsh.client`、无 react peer | ① `exports` 增 `"./client": {default: "./lib/client.js"}`（形状照 web-ux `plugins/web-ux/package.json:11-20`）；② 增 `dsh.client: { inject: [...], platform: "web" }`；③ `peerDependencies` 增 `react: ^18.2.0`；④ `devDependencies` 增 client 侧包（下表）；⑤ `files` 不变（`lib/**/*.js` 已覆盖 `client.js`） |
| `cordis.patch.yml` | 仅一行 bare-name insert | **形状不变**（bare-name 是 REQUIRED：web client-module scan 从该行读 `dsh.client`，见 `plugins/web-ux/cordis.patch.yml:6-10`），只改注释说明该行现在同时是浏览器半的锚点 |
| `build.mjs` | 单次 esbuild（ESM、`external:['node:*']`、banner 注入 `createRequire`） | 改为**两次构建**：`buildHostCarrier()`（同现状）+ `buildClient()`（CJS + `window.__ModuleLoader__.load({id,factory})` 壳、`CLIENT_EXTERNALS` 外置、CSS modules 运行时 `<style>` 注入），整段照抄 `plugins/web-ux/build.mjs:100-152`；`PACKAGE_NAME = 'dsh-plugin-session-tool-toggle'` |
| `tsconfig.*` | `tsconfig.base/host.json` + 根 solution 引用 | 增 `tsconfig.client.json`（include `src/client`、`src/contract.ts`、`src/css-modules.d.ts`、client 测试），根 solution 引用 host+client 两个 project；`src/css-modules.d.ts` 新文件（照 web-ux 同名文件） |
| `vitest.config.ts` | `environment:'node'`、`include:['test/**/*.test.ts']` | ① `include` 增 `test/**/*.test.tsx`；② `esbuild.jsx: 'automatic'`；③ `resolve.alias` 指向 `test/stubs/ui-primitives.tsx`（三处均照 `plugins/web-ux/vitest.config.ts:22-31`）；④ jsdom 由各 `.tsx` 套件的 `// @vitest-environment jsdom` 文件头按需开启 |
| `.gitignore` | `node_modules/`、`*.tsbuildinfo` | 不变（`lib/` 随仓库提交，双端产物同目录） |
| `src/host/index.ts` | `inject:['agents','tools']` + agent 生命周期 + 命令注册 + 投影注册 | 增：① `ctx.inject(['connection','webServer'], …)` 挂载 RPC（**`webServer` 必须在 inject 名单、`connection` 必须从 `ctx.root.get` 读**，坑位说明见 `plugins/web-ux/src/index.ts:74-99`）；② 构造 `ControlDeps` 并交给 `commands.ts` 与 `rpc.ts`（同一份层注册表，禁止第二份状态） |
| `src/host/types.ts` | 六端口 + `SessionEventLike`/`AgentLike`/`SpecLog` | 增 `ControlDeps`、`PanelInputs`、`LayerHandle`（`setState`/`snapshot`/`visibleNames`）三个端口型声明；不新增第七个「持久化端口」 |

#### devDeps 增量（版本对齐仓内先例，全部已在 `pnpm-lock.yaml` 内）

| 包 | 版本 | 用途 | 先例 |
|---|---|---|---|
| `@deepseek-ai/dsh-client-connection` | `0.2.1-rc.2` | `connection.rpc.call` / `ConnectionRpcResult` / `ConnectionHandle` 类型 | web-ux devDep 同名同版本 |
| `@deepseek-ai/dsh-client-ui-conversation` | `0.2.1-rc.2` | `SlotMap` 里 `conversation.session.header.utilities` 的声明方 | 同上 |
| `@deepseek-ai/dsh-client-ui-session` | `0.2.1-rc.2` | session 标准 props 合并（`sessionId`、`useSession`） | 同上 |
| `@deepseek-ai/dsh-client-ui-renderer` | `0.2.1-rc.2` | `ctx.slots` 服务合并 | 同上 |
| `@deepseek-ai/dsh-client-ui-primitives` | `0.2.1-rc.2` | `Modal`/`Switch`/`Button`/图标 | 同上 |
| `@deepseek-ai/dsh-client-ui-slots` | `0.2.1-rc.2` | `PropsRuntime`/`PropsLocale`/`InjectFace` | 同上 |
| `@deepseek-ai/dsh-client-locale` | `0.2.1-rc.2` | `ctx.locale.register` | 同上 |
| `@deepseek-ai/dsh-client-ui-commands` | `0.2.1-rc.2` | `command/executed` 事件类型（`Events` 合并） | 锁内已有（`pnpm-lock.yaml:9266` 为某 importer 的依赖），本包新增直接 devDep |
| `react` / `react-dom` | `^18.3.1` | 组件运行时 | web-ux devDeps |
| `@types/react` / `@types/react-dom` | `~18.3.1` / `^18.3.5` | — | 同上 |
| `@testing-library/react` | `^16.3.0` | jsdom 组件套件 | 同上 |
| `jsdom` | `^26.1.0` | 同上 | 同上 |

**`dsh.client.inject` 精确清单**（形状照 `plugins/web-ux/package.json:28-39`）：

```json
"client": {
  "inject": [
    "@deepseek-ai/dsh-client-ui-conversation",
    "@deepseek-ai/dsh-client-ui-renderer",
    "@deepseek-ai/dsh-client-connection",
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-commands"
  ],
  "platform": "web"
}
```

- 前四项与 web-ux 完全一致（它已在本仓验证过「座位 + 文案 + RPC」三条链一起工作）。
- 第五项 `ui-commands` 是本扩展新增：面板要订阅 `command/executed`（`dsh/dsh-client-ui-commands/lib/types/client/service.d.ts:40`），列进 `inject` 以保证 boot 图里该 client 模块先到位。
- **不列** `dsh-client-ui-primitives`（平台静态模块表已含，`react` 同理由走 `external`）、`ui-slots` 与 `ui-session`（类型合并面由 conversation / renderer 间接满足；web-ux 也未列）。
- `inject` 是**模块图顺序依赖 + 激活面**（列了但组合里被裁掉 → 整个浏览器半不加载，见 `plugins/web-ux/README.md:64-70`），因此「能少列就少列」：每多列一项就多一个「入口整半消失」的失败模式。

**零新增解析节点**：以上包全部已在 `pnpm-lock.yaml` 出现（`dsh-client-ui-conversation@0.2.1-rc.2` 等，lock 行 928–1043 / 7011–7109），`pnpm dsh:check` 的「发布年龄豁免 = 锁内实际集合」检查（`scripts/check-dsh-baseline.mjs:228-247`）因此不需要改 `pnpm-workspace.yaml`；`scripts/upgrade-dsh.mjs` 的 devDeps 重指是通用循环（`:148-165`），也不需改脚本。

### 1.3 与 `code-design.md` §1.1/§1.2 的逐行关系

- **§1.1 追加 12 行**（上表 12 个 src 文件），其中 `src/host/control.ts` 插在 `src/host/commands.ts` 之前、`src/host/panel.ts` 插在 `src/host/mask.ts` 之后。
- **§1.1 改写 7 行**：`package.json`（双端字段）、`build.mjs`（两次构建）、`tsconfig.*`（拆三件→四件）、`vitest.config.ts`（jsdom 面）、`src/host/index.ts`（RPC 挂载）、`src/host/commands.ts`（降级为文本前端）、`src/host/types.ts`（端口增补）。
- **§1.1 追加 1 行新文件** `src/css-modules.d.ts`（照 `plugins/web-ux/src/css-modules.d.ts`）。
- **§1.1 追加测试 10 行 + 扩展 2 行**（见上表）。
- **§1.2 不改**：根仓 `README.md`/`AGENTS.md` 的补行方式不变，只是 README 描述从「纯宿主」改为「双端（Web 面板 + 命令面）」。
- **规模重估**：原估「11 src ≈1,400–1,700 行 + 7 测试 ≈900 行」→ **「23 src（含 css / d.ts 各 1）≈3,660–4,590 行 + 17 测试 ≈2,350 行」**；人日从 9.5 抬到 **≈14.5**（面板 client 半 +3.0、宿主 RPC/内核 +1.5、双端工程链 +0.5）。

---

## 2. RPC 通道契约

### 2.1 通道与端点集

**通道名 `/session-tool-toggle`**（论证）：

- 合法：`CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/`（`dsh/dsh-client-connection/lib/index.js:689`），单段、允许连字符；`/api` 是保留通道，注册即抛（同文件 `:970-972`）。
- 不撞车：安装树内**没有任何官方包**调用 `connection.rpc.handle`（`grep -rn "rpc\.handle" dsh/*/lib/` 仅命中 `dsh-tool-cordis` 的 Inspect 目录文本），本仓 web-ux 是唯一占用者，通道 `/web-ux`。两通道互不干扰：各注册一条 **prefix route**（`register()` 走 `webServer.register({kind:'prefix', path: channel})`，同文件 `:855-871`），路径前缀不同即隔离。
- 为什么不用 `/tools`：与命令名 `tools` 同形但语义是「通道」不是「命令」，且后续若加 `/tools-*` 命令面扩展容易混淆；包名即通道名是 web-ux 的既有约定（`/web-ux`）。
- 物理路由：`<channel>/<endpoint>`（`endpointFromPath`，同文件 `:926-931`），即 `POST /session-tool-toggle/panel`；端点段文法 `^[A-Za-z0-9_$.-]+$`（同文件 `:690`）→ **端点必须单段、不能带 `/`**。

**端点集（4 个）**：

| 端点 | 语义 | 等效命令 |
|---|---|---|
| `panel` | 读面板快照（清单 + 关闭集 + 保护名单 + 默认档 + 统计 + 降级提示） | `/tools status` |
| `toggle` | 批量开/关（`on:boolean` + `addresses[]`），返回**变更后的新快照** | `/tools off\|on <addr…>` |
| `reset` | 本会话回到创建时快照 | `/tools reset` |
| `defaults` | 默认档写（`set\|off\|on\|reset`），返回默认档视图 | `/tools default …` |

> 「默认档读」不单开端点：`panel.defaults` 已经带回最新默认档视图（同一次事务内读，避免两段式漂移）。

### 2.2 请求 / 响应形状（zod 草案 = 形状权威）

```ts
import { z } from 'zod'

/** 组地址：文法校验在宿主由 address.ts 负责，线上只做长度/数量护栏。 */
const AddressSchema = z.string().min(1).max(200)
const SessionIdSchema = z.string().min(1).max(255)

/** panel：只读。 */
export const PanelRequestSchema = z.object({
  sessionId: SessionIdSchema,
}).strict()

/** toggle：批量开/关；全有或全无（任一地址非法 → 整单拒绝）。 */
export const ToggleRequestSchema = z.object({
  sessionId: SessionIdSchema,
  on: z.boolean(),
  addresses: z.array(AddressSchema).min(1).max(64),
}).strict()

/** reset：回创建时快照。 */
export const ResetRequestSchema = PanelRequestSchema

/** defaults：默认档写；reset 不带地址，其余三种必须带非空地址。 */
export const DefaultsRequestSchema = z.object({
  action: z.enum(['set', 'off', 'on', 'reset']),
  addresses: z.array(AddressSchema).max(64).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'reset') {
    if (value.addresses !== undefined) ctx.addIssue({ code: 'custom', message: 'reset 不接受 addresses' })
    return
  }
  if (value.addresses === undefined || value.addresses.length === 0) {
    ctx.addIssue({ code: 'custom', message: `${value.action} 需要非空 addresses` })
  }
})
```

```ts
/** 一条工具条目。宿主给**事实**，本地化文案由 client 用 t() 组合。 */
export const ToolEntrySchema = z.object({
  /** 注册名（MCP 是 public name `mcp__<server>__<suffix>`）。 */
  name: z.string().min(1),
  /** 展示用短名（MCP 为 public 后缀；builtin 与 name 相同）。 */
  shortName: z.string().min(1),
  /** 该条目自己的规范形地址（`mcp:<s>::<suffix>` / `tool:<name>`）。 */
  address: z.string().min(1),
  /** 命中当前关闭集。 */
  disabled: z.boolean(),
  /** 在生效保护名单内（拒关）。 */
  protected: z.boolean(),
  /** 保留名（如 `run_code`，restrict 拒绝）。 */
  reserved: z.boolean(),
  /** 全局层有、本会话看不见（被别的作用域隐藏）。 */
  shadowed: z.boolean(),
  /** 描述首 160 字符（已截断），缺省表示无描述。 */
  description: z.string().max(160).optional(),
})

export const ToolGroupSchema = z.object({
  /** 来源：MCP 服务器 / skill 整档 / 内置工具。 */
  kind: z.enum(['mcp', 'skill', 'builtin']),
  /** 分组键：MCP = serverName；skill = 'skill'；builtin = 'builtin'。 */
  key: z.string().min(1),
  /** 整组地址；builtin 分组不可整组关 → null。 */
  address: z.string().nullable(),
  toolCount: z.number().int().nonnegative(),
  disabledCount: z.number().int().nonnegative(),
  /** 整组地道的关闭状态（address !== null 且命中关闭集）。 */
  disabled: z.boolean(),
  tools: z.array(ToolEntrySchema),
})

export const StateViewSchema = z.object({
  /** 已排序去重的规范形关闭集。 */
  disabled: z.array(z.string()),
  /** 创建时快照（默认档拍下的那一份）。 */
  snapshot: z.array(z.string()),
  /** 是否已由一条日志记录建立。 */
  seeded: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
  /** 持久化通道实际形态（降级可观测）。 */
  storeKind: z.enum(['record', 'memory']),
})

export const DefaultsViewSchema = z.object({
  version: z.literal(1),
  disabled: z.array(z.string()),
  /** 绝对路径（面板展示，便于手编）。 */
  path: z.string().min(1),
  /** 文件可读（false = 不存在，按空档处理）。 */
  readable: z.boolean(),
  /** 文件存在但损坏/半写（已降级空档）。 */
  corrupt: z.boolean(),
})

export const NoticeCodeSchema = z.enum([
  'persistence-degraded',   // 记录通道不可用，内存态
  'defaults-corrupt',       // 默认档损坏，已按空档
  'session-subagent',       // 子代理会话：不继承父会话开关
])

export const PanelSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  /** 会话创建时间（epoch ms），面板用它讲「快照来源」。 */
  createdAt: z.number().int().nonnegative(),
  state: StateViewSchema,
  groups: z.array(ToolGroupSchema),
  /** 生效保护名单（基线 ∪ config 追加）。 */
  protectedNames: z.array(z.string()),
  defaults: DefaultsViewSchema,
  /** 全局层有、本会话看不到的名字（两态区分的第二态）。 */
  hiddenByOthers: z.array(z.string()),
  /** 关闭集里当前命中 0 个注册名的地址（"意图已记录、暂无匹配"）。 */
  intentOnly: z.array(z.string()),
  stats: z.object({
    /** 本会话当前可见工具数（掩码后）。 */
    visible: z.number().int().nonnegative(),
    /** 全局层（不受任何 agent 限制）名字数。 */
    catalog: z.number().int().nonnegative(),
    /** 当前 deny 名字数（= 掩码实际生效量）。 */
    denied: z.number().int().nonnegative(),
    /** hiddenByOthers.length 的镜像，省一次客户端计算。 */
    shadowed: z.number().int().nonnegative(),
  }),
  notices: z.array(NoticeCodeSchema),
})

export const MutationSchema = z.object({
  /** 逐地址回执：matched = 当前命中注册名数（0 = 意图已记、暂无匹配）。 */
  applied: z.array(z.object({
    address: z.string().min(1),
    on: z.boolean(),
    matched: z.number().int().nonnegative(),
  })),
  /** deny 集合的变化量（可为负）。 */
  hiddenTools: z.number().int(),
  visibleBefore: z.number().int().nonnegative(),
  visibleAfter: z.number().int().nonnegative(),
  /** 是否提示「前缀缓存将从第一个变化的 schema token 起重建一次」。 */
  kvRebuild: z.boolean(),
  notices: z.array(NoticeCodeSchema),
})

/** toggle / reset 的成功值：变更后的新快照 + 变更回执（一次往返拿全）。 */
export const ToggleValueSchema = z.object({
  snapshot: PanelSnapshotSchema,
  mutation: MutationSchema,
})

/** defaults 的成功值。 */
export const DefaultsValueSchema = z.object({
  defaults: DefaultsViewSchema,
  /** 实际写入的规范形地址（已归一、排序、去重）。 */
  changed: z.array(z.string()),
})
```

**端点 → 请求/响应表**：

| endpoint | request | success value | 备注 |
|---|---|---|---|
| `panel` | `PanelRequestSchema` | `PanelSnapshotSchema` | 每次打开/刷新都全量读（不缓存跨窗口） |
| `toggle` | `ToggleRequestSchema` | `ToggleValueSchema` | 成功值内含新快照 → 一次往返 |
| `reset` | `ResetRequestSchema` | `ToggleValueSchema` | 语义=回到 `state.snapshot` |
| `defaults` | `DefaultsRequestSchema` | `DefaultsValueSchema` | **不返回会话快照**（默认档本来就不追溯，返回反而误导） |

### 2.3 稳定失败码表（宿主侧 7 个）

信封是既有的 `ConnectionRpcResult<T> = {ok:true, value} | {ok:false, error:{code, message, details}}`（`dsh/dsh-client-connection/lib/types/rpc.d.ts:19-25`）。`details` 是 `Record<string, unknown>`（同文件 `:13-17`）。

| code | 触发条件 | `details` | client 文案键 |
|---|---|---|---|
| `bad-request` | 端点未知 / payload 不合 §2.2 形状 / 未知 `action` | `{issues?: string}` | `error.bad-request` |
| `bad-address` | 地址文法解析失败（`code` 取 `address.ts` 的 `ParseErrorCode`） | `{address, parseCode}` | `error.bad-address` |
| `protected` | 命中保护名单（**整单拒绝，不写任何状态**） | `{names: string[]}` | `error.protected` |
| `reserved` | 保留名（`run_code` 等，restrict 会抛） | `{names: string[]}` | `error.reserved` |
| `session-not-live` | `ctx.agents.get(sessionId)` 为 undefined，或 `agent.session.id !== sessionId` | `{sessionId}` | `error.session-not-live` |
| `defaults-unwritable` | `writeDefaults` 抛错（权限/磁盘/目录不可建） | `{path, reason}` | `error.defaults-unwritable` |
| `internal` | 未预期抛错（已 `logger.warn`） | `{}` | `error.internal` |

**传输侧（client 合成，非宿主码）**：`unavailable`（`rpc.call` 抛错 / 通道未挂载）、`bad-response`（信封不可读或响应过不了 parser）。未知码一律走 `error.fallback`（web-ux 同构做法，`plugins/web-ux/src/client/delete-client.ts:63-66`）。

**为什么 `protected`/`reserved` 不做部分成功**：面板的 Switch 已按 `protected`/`reserved` 置灰，这两个码是**防御性路径**；若允许部分成功，界面会出现「一半生效」的不可解释状态，且与 `/tools` 命令面的「一条命令一个结果」不齐。见 D19。

### 2.4 会话寻址与防错会话

- **sessionId 来源**：client 侧 `sessionId` 是 session-scope 座位的**标准 prop**（`repo/dsh-client-ui-session/lib/types/client/index.d.ts:80-89`），注册期 `inject` 也会收到它（`repo/dsh-client-ui-slots/lib/types/index.d.ts:487` 的 `InjectParams`：session scope 的首参恒为 `sessionId`）。**不**从 URL / localStorage / DOM 猜。
- **每个请求都带 `sessionId`**，宿主侧三步校验：
  1. 形状（parser）；
  2. `const agent = ctx.agents.get(sessionId)` —— `get(id: SessionId): Agent | undefined`（`dsh/dsh-agent/lib/types/index.d.ts:343`；启动补挂用的 `list(): Agent[]` 在同文件 `:357`）；
  3. 身份对账 `agent.session.id === sessionId`（`Session.id` 由 header 派生，`dsh/dsh-session/lib/types/index.d.ts:154`）。
- **状态永远按 `sessionId` 现读**：不缓存、不跨会话复用（对照 `code-design` 不变量 1/7）。路由里的 `sessionId` 只用于定位，不承担权限语义。
- **跨窗口/跨标签**：两个窗口对同一会话各有自己的 client 快照，但写入都落到同一 `StateStore` + 同一 `SessionLayer`；后写者覆盖，先写者在下次刷新时收敛。**没有**「会话锁」——见风险 R1。

### 2.5 工具面清单的数据来源（宿主侧推导）

**读数面沿用掩码引擎的三读并集**（`code-design` ③.3 / project-mcp `isolation.ts:322-384`）：

```
catalog  = ctx.tools.schemas()              // 插件根 ctx：全局层、不受任何 agent 限制
scoped   = layer.visibleNames()             // 该 agent 视角（本插件上一轮掩码已生效 → 缺名字）
carried  = layer.snapshot().deny            // 上一轮仍受管的名字（防第二读缩小导致掩码被抬掉）
candidates = sort(unique(catalog ∪ scoped ∪ carried))
```

- `catalog` 的取法直接照抄 project-mcp：`ctx.tools.schemas().map(s => s.name)`（`plugins/project-mcp/src/host/index.ts:92`；`schemas(scope?)` 的签名见 `dsh/dsh-tools/lib/types/index.d.ts:712`）。
- `scoped` 用层已有的 `visibleNames()`（`code-design` ③.4 `ScopedSurface`），**不是**面板新开的读取路径。
- 归属判定复用 `toolServerOf` 的**首个 `__` 切分**规则（`plugins/project-mcp/src/host/isolation.ts:112-117`）：`mcp__<server>__<suffix>` → `server = rest.slice(0, rest.indexOf('__'))`。这条规则的已知歧义（serverName 本身含 `__`）收进 `code-design` §6.1 的假设 A12，并在 `panel.ts` 里对「`planMask.matched[address]` 之和 vs 该组 `tools.length`」做一次自检（不一致只记一条 warn，仅影响展示，不影响开关语义——地址匹配本身不看分组）。

**每个条目的字段形状**（对应 `ToolEntrySchema`）：

| 字段 | mcp-server 组 | mcp 单工具 | skill 组 | builtin 组 |
|---|---|---|---|---|
| `kind` | `'mcp'` | （属于 mcp 组） | `'skill'` | `'builtin'` |
| `key` | serverName | — | `'skill'` | `'builtin'` |
| `address`（组） | `mcp:<server>` | — | `tool:skill` | `null` |
| `tools[].name` | — | `mcp__<server>__<suffix>` | `skill` | 注册名 |
| `tools[].shortName` | — | `<suffix>` | `skill` | 注册名 |
| `tools[].address` | — | `mcp:<server>::<suffix>` | `tool:skill` | `tool:<name>` |
| `protected` | — | false | 由名单定 | `PROTECTED_BASELINE ∪ config` 命中 |
| `reserved` | — | false | false | `run_code` 等（`restrict` 拒绝，`dsh/dsh-tools/lib/index.js:3001`） |
| `shadowed` | — | `catalog 有 ∧ scoped 无` | 同 | 同 |
| `description` | — | schema.description 首 160 字 | 同 | 同 |

**关于 `displayName`**：任务清单里点名的这个字段被拆成两处——① **工具**用 `shortName`（MCP 的 public 后缀 / 内置工具注册名），即模型面真正看到的名字，不另造「友好名」（造名要维护映射表，且必然与 `/tools status` 的输出漂移）；② **服务器**用 `key`（`serverName` 本身），不做美化。**分组标题**（「MCP 服务器」「技能」「内置工具」）由 client 用 `t('group.*')` 渲染——宿主只给数据与 `kind`，不给中文。

**MCP 服务器列表从哪来（重要，别臆造）**：DSH 没有公开的「MCP 服务器注册表」服务——`dsh/dsh-mcp-client` 只逐行注册工具与 `mcp:<server>` 指令段（`code-design` ② 表：`dsh-mcp-client/lib/index.js:731-741`），`apply` 未提供枚举面；Host Service 目录（`Service.listService`）里也没有 mcp 相关服务。因此**服务器分组只能从 public name 前缀推导**，与 project-mcp 的 `toolServerOf` 同规则。这是本扩展最明确的一条「不得再找服务」的结论。

---

## 3. client 半设计

### 3.1 入口组件（`ToolPanelAction` 的按钮部分）

- **座位**：`{ name: 'conversation.session.header.utilities', id: 'session-tool-toggle-panel', order: 20, locale: NS }`。
  - 插槽声明：list、scope `session`、owner props = `ConversationHeaderActionOwnerProps`（**无专属值**，唯一字段是 `children?: never` 标记）——`dsh/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:236-241` + `:440-443`。
  - **order 取值论证**：官方占位是 `-10`（open-in-app，`dsh/dsh-client-ui-open-in-app/lib/client.js:846-852`）、`-5`（schedule，`dsh/dsh-client-ui-schedule/lib/client.js:7509-7513`）、缺省 `0`（session-log-export，`dsh/dsh-session-log-export/lib/client.js:291-295`；`order` 缺省为 0，见 `dsh-cordis-client-runner/lib/client.js:4004-4016` 的 registerOptions 说明）。取 **20** 的意图：① 与官方三项保持「越靠右越大」的单调关系；② 与最大官方值留 20 的间隔，未来官方再加一项也不易插到我们右边；③ 不用 0 是因为 0 会与缺省项并列，顺序依赖注册时序（不稳定）。
- **形态**：28×28 圆形图标按钮（`IconSlidersTwoOutlineRegular` 或 `IconInspectOutlineRegular`，两者都在 `repo/dsh-client-ui-primitives/lib/types/icons/index.d.ts`），视觉参数照官方同座位触发器（`ui-schedule` 的 `.trigger`：28px、`border-radius:28px`、`color: var(--dsw-alias-label-tertiary)`、hover 用 `--dsw-alias-interactive-bg-hover`），保证不破坏头部行高。
- **可观测/可达性**：`aria-label={t('action.label')}`、`title={t('action.tooltip')}`、`aria-expanded={open}`、`aria-haspopup="dialog"`；图标按钮**不做文字胶囊**（头部横向空间是稀缺资源，且官方同座位的三个入口都是纯图标）。
- **渲染条件**：座位本身保证有会话（scope `session`）；按钮**恒渲染**，不因 `connection` 缺席而隐藏——入口是唯一发现面，隐藏比"点开看到不可用"更糟（与 web-ux 菜单项「静默不渲染」不同，理由见 D13）。
- **模态挂在组件内**：`Modal` 是 body portal（`repo/dsh-client-ui-primitives/lib/types/Modal.d.ts`：「Render a centered, body-portaled modal」），因此按钮组件自己渲染 `Modal` 即可，**不需要** `shell.overlay` 座位，也不需要跨 entry 的请求 store（web-ux 需要是因为菜单项会随菜单关闭而卸载）。

### 3.2 面板容器与分区

单个 `Modal`（`title` + `description` + `contentClassName` 滚动区 + `footer` 关闭/刷新），宽 `min(760px, 100vw - 32px)`，四个分区（自上而下）：

1. **状态摘要**：`本会话可见 {visible} / 全局 {catalog} / 已关 {denied} / 被其它作用域隐藏 {shadowed}`；`notices` 逐条渲染为提示行（`persistence-degraded` 用警告色）。
2. **本会话开关**：分组清单（§3.3）。
3. **用户级默认档**：`DefaultsEditor`（§3.4）。
4. **关闭集**：已关闭地址的 chip 列表（`state.disabled` 原样），每枚带「开启」按钮；`intentOnly` 的 chip 额外带 `intent` 徽标；空集给一行「当前没有关闭项」。这一区是「关闭集状态展示」的唯一集中落点（分组清单里不重复标）。

**footer**：左「刷新」（`IconRefreshOutlineRegular` + `t('panel.refresh')`，`aria-label` 同文），右「关闭」。刷新按钮的意义是把「跨窗口/命令面改过但我这窗口旧了」变成一次显式动作（R1 的兜底）。

### 3.3 分组列表交互

```
[MCP 服务器]  yunxiao            70 个工具 · 已关        [Switch]
   ⌄ （展开）
      get_current_user         [Switch]
      list_projects            [Switch]
      ...
[技能]        skill              1 个工具                [Switch]
[内置工具]    （本地过滤输入框）
      task_board_create  [保护]                        [Switch disabled]
      run_code           [不可关闭]                     [Switch disabled]
```

- **组行**：标题（`serverName` / `t('group.skill')` / `t('group.builtin')`）+ 计数（`t('group.summary')`）+ `Switch`（`checked = group.disabled`）。组行点击标题区折叠/展开（`aria-expanded`），点击开关**不**触发折叠。
- **单工具行**：`shortName`（等宽字体）+ `description` 作为 `title`（不占版面）+ `Switch`。
- **三态禁用**：`protected` → `disabled` + `title={t('badge.protected')}`；`reserved` → 同上；`shadowed` → `disabled` + `t('badge.shadowed')`（交集语义：本插件不能把被别的作用域藏起来的工具"开回来"，`code-design` spec「开关不越界工作区隔离」）。
- **pending**：请求在途时该地址的 `Switch` `disabled`（`Switch` 的 `disabled` 契约里明写「owners also set it while a write is in flight」，`repo/dsh-client-ui-primitives/lib/types/Switch.d.ts`）。
- **可访问性**：每个 `Switch` 必传 `label`（`t('switch.label', {name})`，`Switch` 的 `label` 是必填 a11y 名称）；禁用时 `title` 给理由，读屏与悬停都能得到同一句解释。
- **`intent` 徽标**：`panel` 快照的 `intentOnly`（关闭集里 `planMask.matched === 0` 的地址）在「关闭集」区渲染 `t('badge.intent')`。数据由宿主算好（`panel.ts` 从 `MaskPlan.matched` 过滤），client 不做二次推导。
- **不做的**：搜索整个清单、按 token 成本排序、拖拽、批量选择（v1 保持"看得到就点得到"）。

### 3.4 默认档编辑区

- **展示**：文件路径（`defaults.path`，等宽 + 可选中）+ 条目列表（每条一个「移除」）+ 空态文案；底部两行事实：
  - `t('defaults.scope')`：只影响之后新建的会话；
  - `t('defaults.snapshot', {time, count})`：本会话创建于 `<本地时间>`，快照 `<N>` 项 —— 来自 `panel.createdAt` + `state.snapshot.length`。
- **添加**：一个 `Input`（`placeholder = t('defaults.addPlaceholder')`）+「添加」`Button`。提交时把输入按空白/逗号切成多地址交给 `defaults` 端点（`action:'off'`），**不做客户端文法校验**（文法唯一权威在宿主 `address.ts`；客户端猜文法必然与宿主漂移）。
- **删除**：`action:'on'` + 该地址。
- **整份清空**：`action:'reset'`（二次确认用 `Button` 文案变化实现，不上 `RiskConfirmation`——不可逆性低：清空默认档只影响新会话）。
- **与当前会话无关性明示**：保存成功后**不**重拉 panel 快照（默认档不追溯），只更新 `defaults` 与 `changed`；顶部保留一行「已保存（本会话不变）」。

### 3.5 失败码 → 文案键表

| 码 | 文案键（zh 文案） |
|---|---|
| `bad-request` | `error.bad-request`：「请求不合法，宿主拒绝了本次调用。」 |
| `bad-address` | `error.bad-address`：「地址不合法：{address}。语法见 `/tools` 帮助（`mcp:<server>`、`mcp:<server>::<工具>`、`tool:<名字>`、`skill`）。」 |
| `protected` | `error.protected`：「{names} 在保护名单内，不能关闭。」 |
| `reserved` | `error.reserved`：「{names} 是保留工具，不能关闭。」 |
| `session-not-live` | `error.session-not-live`：「该会话未在宿主中运行（可能已归档或已结束），无法调整工具面。」 |
| `defaults-unwritable` | `error.defaults-unwritable`：「默认档写入失败：{path}。」 |
| `internal` | `error.internal`：「宿主内部错误，本次操作未完成。」 |
| `unavailable`（传输） | `error.unavailable`：「无法连接到 dsh 主进程。」 |
| `bad-response`（传输） | `error.bad-response`：「宿主返回了无法识别的响应。」 |
| 未知码 | `error.fallback`：「操作失败。」 |

**渲染规则**：主文案走 `t(errorKeyOf(code))`；宿主的 `error.message` / `details` 只作为二级灰字 detail（不参与本地化），与 web-ux 对话框一致（`plugins/web-ux/src/client/DeleteSessionDialog.tsx:217-222`）。

### 3.6 client 侧数据流

```
ToolPanelAction（React）
  ├─ Button ── onClick: controller.open()
  └─ Modal（open=controller.phase !== 'idle'）
        ├─ 摘要 / 分组 / 默认档 / 关闭集  ← useSyncExternalStore(controller.source)
        └─ 动作 → controller.toggle/reset/writeDefaults → panel-client → connection.rpc.call
```

- **`panel-client.ts`**：`createPanelClient(connection)` → `{ panel(sessionId), toggle(sessionId, on, addresses), reset(sessionId), writeDefaults(action, addresses) }`。每次调用：`connection.rpc.call(CHANNEL, endpoint, payload)` → 拆信封 → `contract.ts` parser → 失败抛 `PanelError(code, message)`。传输/坏响应归一为 `unavailable` / `bad-response`（照 `plugins/web-ux/src/client/delete-client.ts:73-107`）。
- **`panel-controller.ts`**：每会话一个实例（`useMemo` 按 `sessionId` 缓存，避免每次渲染重建）。构造参数是 **`resolveClient: () => PanelClient | undefined`** 而**不是**一个固定的 client：`connection` 可能晚于插件 `apply` 就绪（web-ux v1.2.0 的踩坑，`plugins/web-ux/README.md:76`），所以每次调用都现取；`undefined` 时控制器直接进 `failed('unavailable')` 而不发请求。
  - 状态：`{ phase: 'idle'|'loading'|'ready'|'failed', snapshot, error, pending: ReadonlySet<string>, savingDefaults, defaultsError }`。
  - `open()`：`idle → loading`（保留旧快照用于即时渲染）→ `panel` → `ready`；失败 → `failed` 但**保留旧快照**（stale-while-revalidate）。
  - `toggle(addresses, on)`：地址进 `pending` → `toggle` 成功则用响应里的 `snapshot` 整体替换（一次往返，不额外拉）→ `pending` 清空。失败：`pending` 清空 + 顶部错误行（不销毁面板）。
  - `reset()` / `writeDefaults()` 同构。
  - `refresh()`：显式重拉 `panel`。
- **刷新触发（四类）**：
  1. 面板从关闭 → 打开（`open()` 必拉）；
  2. 每次成功 mutation（吃响应里的新快照）；
  3. client 事件 `command/executed(sessionId, name, result)` 且 `sessionId === 本会话` 且 `name === 'tools'` → `refresh()`。事件声明见 `dsh/dsh-client-ui-commands/lib/types/client/service.d.ts:40`（`@mode emit`，只在本窗口本地提交时触发）；消费先例：`dsh/dsh-session-log-export/lib/client.js:288-290`；
  4. 手动「刷新」按钮 + `window` 的 `focus` 事件（面板打开时挂一次监听，关闭即摘）。
- **与 `/tools` 命令的一致性**：两者**共用宿主同一份状态**（同一 `StateStore`、同一 `SessionLayer`、同一 `control.ts` 内核），因此不存在「面板状态」与「命令状态」两份。面板操作后的提示文案与命令回执取同一组字段（`hiddenTools` / `visibleBefore→After` / `kvRebuild`），即 `code-design` D7 的「只报计数与代价形状」在 Web 侧的等价表达：摘要区显示 `t('mutation.kv', {hidden})`。
- **不做乐观更新**：`Switch` 是受控组件，翻转以宿主返回的快照为准；在途期间该行 `disabled`。理由：工具面的真相在宿主注册表（服务器可能断线、被其它作用域掩码），本地先翻会制造"看起来关了其实没关"的错觉。

---

## 4. spec 增量草案

> 落档到 `specs/dsh-session-tool-toggle/spec.md`；结构标题与 SHALL 保留英文，正文 zh-CN。

### 4.1 新增 Requirement（追加到 `## ADDED Requirements` 末尾）

```markdown
### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：入口 SHALL 注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（list、scope session、无专属 owner props），面板 SHALL 提供工具清单（MCP 服务器整组/单工具、skill、内置工具分组）、会话级开关切换、用户级默认档编辑与关闭集展示。面板的读与写 SHALL 走 Connection RPC 通道（`/session-tool-toggle`），SHALL NOT 在浏览器半另建状态存储：面板与 `/tools` 命令面 SHALL 共用同一 per-session 状态、同一掩码层与同一持久化记录。面板 SHALL NOT 提供插件配置键（如 `persistence`、`protectedTools`）的编辑面。全部 UI 文案 SHALL 来自插件自有 locale 命名空间；宿主响应 SHALL 只携带稳定失败码与结构化事实，SHALL NOT 作为唯一文案来源。

#### Scenario: 入口在会话头部渲染

- **WHEN** Web 组合加载了本插件的浏览器半，且会话主视图头部已挂载
- **THEN** 头部工具区出现本插件的图标按钮（`order` 位于官方三项之后），带可读的 `aria-label` 与 `aria-expanded`；点击后打开面板，面板标题与分区文案来自本插件 locale

#### Scenario: 面板切换等效命令面

- **WHEN** 用户在面板里关闭 MCP 服务器 `yunxiao` 的整组开关
- **THEN** 宿主按 `mcp:yunxiao` 地址写入关闭集（与 `/tools off mcp:yunxiao` 同一状态与同一记录），响应带回变更后的快照与新可见计数；下一次模型步骤该服务器工具不可见且指令段消失；随后在命令面执行 `/tools status` 显示同一关闭集

#### Scenario: 保护名单在面板上不可切换

- **WHEN** 面板渲染内置工具清单，其中含 `bash`
- **THEN** `bash` 行的开关为禁用态并给出保护理由的 `title`，点击不发出任何 RPC 请求；即便伪造请求，宿主也以 `protected` 拒绝且不改变状态

#### Scenario: 默认档编辑不追溯当前会话

- **WHEN** 会话 A 已创建，用户在面板的默认档区添加 `mcp:figma` 并保存
- **THEN** 宿主写入默认档文件、返回新的默认档视图，会话 A 的关闭集与可见工具面**不变**；面板显示「只影响之后新建的会话」，且新会话按新默认档初始化

#### Scenario: RPC 不可用时的降级表现

- **WHEN** 浏览器半加载但通道不可达（宿主半未挂载 / 非 Web 组合 / 传输失败）
- **THEN** 入口按钮仍渲染；打开后显示「无法连接到 dsh 主进程」的降级状态且不展示任何开关；命令面能力不受影响；会话与界面均不崩溃

#### Scenario: 会话不在宿主中运行

- **WHEN** 用户打开一个已归档（或已结束）会话的头部按钮
- **THEN** 面板以 `session-not-live` 的解释性状态呈现（不提供开关），不发修改类请求，界面不报错
```

### 4.2 既有 Requirement 的微调（`## MODIFIED Requirements`，落档时复写整段）

| Requirement | 插入句（原文补句） | 理由 |
|---|---|---|
| **会话级开关语义** | 在该段末追加：「Web 配置界面与 `/tools` 命令面 SHALL 共用同一 per-session 关闭集、同一掩码层与同一持久化记录；两个入口的一次变更 SHALL 在下一次模型步骤同时生效。」 | 让「第二消费者」成为规范事实，防止实现期另起状态（D17） |
| **内置工具开关与保护名单** | 在「名单内工具 SHALL 拒绝关闭并返回保护理由」之后追加：「该拒绝 SHALL 由宿主在解析期统一执行，命令面与 Web 配置界面 SHALL 得到同一结果；Web 配置界面 SHALL 将名单内工具呈现为不可切换。」 | 保护名单只有一个执行点（D19） |
| **用户级默认档** | 在「`/tools default` 子命令 SHALL 支持查看与增删」之后追加：「Web 配置界面 SHALL 提供同一默认档的查看与增删，SHALL 走同一校验与原子写路径；面板对默认档的任何修改 SHALL NOT 追溯已存在会话。」 | 默认档的第二个写入方与不追溯语义 |

### 4.3 Purpose 段补一句

> 在 `## Purpose` 末追加：「交互面包含零 token 的命令通道与 Web 组合下的图形化配置面板，两者共享同一状态与同一持久化记录。」

---

## 5. tasks 增量

### 5.1 插入位置论证

**结论**：新组插在**现组 8（装配整合）之后**，即新组 **9（共享控制内核 + Web RPC 通道，宿主半）** 与 **10（client 半面板）**；原组 9（验证矩阵）→ **11**、原组 10（文档与发布准备）→ **12**。

理由（三条，按权重）：
1. **依赖方向**：组 9 的内核重构必须先有组 7（命令面）与组 8（装配接线：层注册表 + `ControlDeps` 构造）才能落地；放在组 7 与组 8 之间会导致「内核先于装配存在」，组 8 还得回头改一次内核依赖注入。
2. **验证顺序**：组 11 的静态门禁（`pnpm build`）现在包含 client 半产物，组 11.2 的冒烟矩阵要加面板断言；若把面板组排在验证之后，验证就是「验证一个不存在的面」。
3. **文档顺序**：组 12.1 的 README 需要写「Web 面板与降级矩阵」，同样必须在面板实现之后。

代价：两个组重编号（9→11、10→12），任务号引用需同步（本文与 `code-design.md` ⑤ 的 T 号不受影响，因为 T 号是设计分组号）。

### 5.2 新组 9 · 共享控制内核与 Web RPC 通道（宿主半）

- [ ] **9.1** 抽取 `src/host/control.ts` 并把 `src/host/commands.ts` 降级为文本前端（触达面 1.1：`control.ts` 新增、`commands.ts` 改写、`types.ts` 增 `ControlDeps`）。要点：`toggleSession`/`resetSession`/`readPanel`/`writeDefaults` 四用例；全有或全无校验（保护/reserved/文法一次判完再落盘）；固定顺序 `写入 StateStore → layer.setState → 组装回执`；`withToggled` 无变化返回同引用。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，control 套件覆盖「保护命中整单拒绝且 `store.write` 调用数 0」「0 匹配地址仍进关闭集且 `matched:0`」「无变化时返回快照与旧对象同引用」；**结构性断言**：`commands.test.ts` 改为注入假 control 内核（类型上不再持有 `StateStore`），因此「命令面绕过内核直读 store」会编译失败；补充弱断言 `grep -rn "\.write(session" plugins/session-tool-toggle/src/host --include=*.ts | grep -v "control.ts" | wc -l` 输出 `0`
- [ ] **9.2** 写 `src/contract.ts` 与 `test/wire-contract.test.ts`（触达面 1.1：`contract.ts` 新增）。要点：通道 `'/session-tool-toggle'`、端点 `panel|toggle|reset|defaults`、7 个宿主失败码 + 2 个传输码、4 对 parser（strict：未知字段即越界）、地址数量/长度上限。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0；`grep -cE "^(import|export .* from) " plugins/session-tool-toggle/src/contract.ts` 输出 `0`（零外部依赖，可安全内联进 client bundle）
- [ ] **9.3** 写 `src/host/panel.ts` 与 `test/panel.test.ts`（触达面 1.1：`panel.ts` 新增）。要点：三读并集 → 分组（`toolServerOf` 首 `__` 切分）→ 四标记（disabled/protected/reserved/shadowed）→ `stats` 四计数 → `notices`；描述截断 160 字；不携带 `parameters`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，panel 套件覆盖「`mcp__a__x` 归 a 组」「`mcp__a__b__c` 归 a 组（记录歧义）」「被其它作用域隐藏的名字进 `hiddenByOthers` 且对应条目 `shadowed:true`」「`run_code` → `reserved:true`」
- [ ] **9.4** 写 `src/host/rpc.ts` 与 `test/rpc.test.ts`（触达面 1.1：`rpc.ts` 新增）。要点：端点派发 → contract parser → control 内核 → 信封映射；未知端点 `bad-request`；抛错 `internal` 并 `logger.warn`；`session-not-live` 判定（`agents.get` + `session.id` 对账）。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，rpc 套件覆盖「未知端点 → `bad-request`」「parser 拒绝超长地址 → `bad-request`」「control 抛 → `internal`」「不存在 sessionId → `session-not-live`」
- [ ] **9.5** 在 `src/host/index.ts` 挂载通道（触达面 1.1：`src/host/index.ts` 改写行）。要点：`ctx.inject(['connection','webServer'], c => { const connection = c.root.get('connection'); … connection.rpc.handle(CHANNEL, dispatcher) })`——`webServer` 必须在注入名单、`connection` 必须从 `ctx.root` 读（`plugins/web-ux/src/index.ts:74-99` 的完整说明）；`connection` 解析为空只 warn 不抛。验证：`docker exec dsh dsh --profile web --dump-config-schema` 退出码 0 且输出含 `session-tool-toggle`；隔离实例中 `curl` 直调返回 `ok:true`（完整命令见 §5.5）

### 5.3 新组 10 · client 半：入口与面板

- [ ] **10.1** 写 `src/client/locales.ts` 与 `test/locale-parity.test.ts`（触达面 1.1：`locales.ts` 新增）。要点：NS `sessionToolToggle`；zh canonical + `en satisfies Record<Key,string>`；失败码键与 §3.5 表逐条对齐；`declare module` 注册 `LocaleNamespaceMap`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0（parity 套件）；`node -e "const z=require('fs').readFileSync('plugins/session-tool-toggle/src/client/locales.ts','utf8');const k=(z.match(/'[a-z][a-z0-9.-]*':/g)||[]).length;process.exit(k>60?0:1)"` 退出码 0（键数下限护栏，阈值实现期按实际填）
- [ ] **10.2** 写 `src/client/panel-client.ts` 与 `test/panel-client.test.ts`（触达面 1.1：`panel-client.ts` 新增）。要点：`connection.rpc.call(CHANNEL, endpoint, payload)`；信封拆解；parser 失败 → `bad-response`；`PanelError{code,message}`。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，套件覆盖「传输抛 → `unavailable`」「坏信封 → `bad-response`」「宿主码原样保留」
- [ ] **10.3** 写 `src/client/panel-controller.ts` 与 `test/panel-controller.test.ts`（触达面 1.1：`panel-controller.ts` 新增）。要点：`idle→loading→ready/failed`；`pending` 集；mutation 直接吃响应快照；`command/executed` 触发刷新（仅本会话 + `tools`）；`focus` 监听可摘。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，套件覆盖「并发 toggle 两地址 → `pending` 同时含两者」「toggle 失败保留旧快照且 `pending` 清空」「`command/executed` 他会话/他命令不触发」
- [ ] **10.4** 写 `src/client/ToolPanelAction.tsx`、`ToolPanelGroups.tsx`、`DefaultsEditor.tsx`、`panel.module.css` 与 `test/tool-panel.test.tsx` + `test/stubs/ui-primitives.tsx`（触达面 1.1：4 个新文件 + stub）。要点：28px 图标按钮 + `Modal`；组行折叠；三态禁用；`intent` 徽标；默认档增删；失败码文案。验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0，jsdom 套件断言「按钮带 `aria-label`」「保护行 `disabled` 且点击后 `client.toggle` 调用数 0」「切组开关发出的地址是 `mcp:<server>`」「`unavailable` 时渲染降级文案且无 `Switch`」
- [ ] **10.5** 写 `src/client/index.ts` + `test/client-index.test.ts` + `test/bundle.test.ts`（触达面 1.1：`client/index.ts` 新增、`build.mjs` 双构建、`package.json` 双端字段）。要点：`inject:['slots','locale']`；`locale.register` 用 `ctx.effect`；座位 `register` 包 `try/catch`；`ctx.on('command/executed')` 桥接到订阅面；`connection` 在 inject 面渲染期软读。验证：`pnpm --filter dsh-plugin-session-tool-toggle build` 退出码 0 且 `test -f plugins/session-tool-toggle/lib/client.js`；`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0（bundle 纯度套件：client 只 require `['@deepseek-ai/dsh-client-ui-primitives','react','react/jsx-runtime']`，host 只 import `node:*`）

### 5.4 既有任务改动（逐条）

| 任务 | 改动 | 影响 |
|---|---|---|
| **1.1** 工程骨架 | `package.json` 增双端字段（`exports./client`、`dsh.client`、react peer、client devDeps）；`build.mjs` 改双构建；新增 `tsconfig.client.json`、`src/css-modules.d.ts`、`src/client/index.ts`（空 apply）、`src/contract.ts`（常量骨架）；`vitest.config.ts` 加 tsx/jsdom/alias | 验证追加：`test -f lib/client.js` 为真；`grep -c '"platform": "web"' package.json` 为 1 |
| **8.1** 装配整合 | 除原有接线外，构造 `ControlDeps`（层注册表 + StateStore + defaults io + 保护名单 + log）并交给 `commands.ts`；层注册表从 `Map<SessionId, SessionLayer>` 单点持有（面板与命令共用） | 验证不变（`--dump-config-schema`）；追加断言：`grep -c "control" src/host/index.ts` ≥ 1 |
| **9.1 → 11.1** 静态门禁 | 递归脚本不变；新增两项隐式依赖：`build` 必须产出 `lib/client.js`、`typecheck` 必须覆盖 client project | 验证追加：`test -f plugins/session-tool-toggle/lib/client.js`；`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0 |
| **9.2 → 11.2** 冒烟矩阵 | 七条断言不变；追加第八~十条：⑧ 面板端点直调返回 `ok:true` 且 `stats.catalog` ≈ 实测基线；⑨ 面板关闭 `mcp:yunxiao` 后与 `/tools status` 关闭集一致、`request/header.tools` 计数与命令面结果相等；⑩ 面板默认档写入后 `$DSH_HOME/session-tool-toggle/defaults.json` 含新地址且既有会话不变 | 验证：artifacts 下冒烟记录表新增三行实测值 |
| **9.2 → 11.3**（新增） | 浏览器侧演示证据：隔离实例里用 chrome-devtools MCP 打开面板、截图、切一个组开关再截图 | 验证：`artifacts/` 下存在两张截图 + 一段操作记录 |
| **10.1 → 12.1** README | 预期管理段追加「Web 面板」一节：入口座位、与命令面同一状态、默认档不追溯、降级矩阵补 3 行（RPC 通道 / 座位 / client 服务）、「面板不提供配置键编辑」明示 | 验证：`grep -c "不是安全边界\|实验性\|Web 面板" plugins/session-tool-toggle/README.md` ≥ 3 |
| **10.2 → 12.2** 发布自检 | 不变（`pnpm verify` 已递归含新包） | — |
| **Workflow follow-up** | 追加一句：profile 安装/升级后必须**重启 web profile**（浏览器半的 bundle 由宿主在启动图里提供，热装不生效） | 文档项 |

### 5.5 面板冒烟命令（第三者可复现，供 9.5 / 11.1 / 11.2 的 ⑧ 引用）

> 与 `code-design` ⑤ T8 的隔离实例方法同源（临时 `DSH_HOME` + `profiles/web` 符号链接 + 拷 `storages/`，见 `plugins/user-commands/README.md:138`）；解析出 token 后先换 cookie，再直调自定义通道。通道的物理路由是 `<channel>/<endpoint>`，请求体是 Connection 的 client-request 信封（`{type,rpcId,method,payload}`，见 `dsh/dsh-client-connection/lib/types/rpc.d.ts:62-68`），且 `register()` 内部先过 `admit()` 的浏览器信任围栏（cookie + Host/Origin），所以必须带 cookie。

```bash
# 0) 隔离实例（端口自定），日志里会打印一次性 token
DSH_HOME=/tmp/stt-home dsh web --port 3099 --no-open &
# 1) token 换 cookie（token 从启动日志/首页链接里取）
TOKEN=<token-from-log>
COOKIE=$(curl -sS -D - -o /dev/null "http://127.0.0.1:3099/?token=${TOKEN}" \
  | awk 'tolower($1)=="set-cookie:" {print $2}' | tr -d '\r' | paste -sd'; ' -)
# 2) 建会话（agentId 就是 sessionId）
SID=$(curl -sS -X POST "http://127.0.0.1:3099/api/session/create" \
  -H 'content-type: application/json' -b "$COOKIE" \
  -d '{"cwd":"/home/xuqinqin/develop/person/dsh-plugins"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
#    注：create 的响应字段名以实测为准（会话 id 也可能在 sessionId/agentId 名下，取可用的那个）
# 3) 读面板快照（本扩展的主断言面）
curl -sS -X POST "http://127.0.0.1:3099/session-tool-toggle/panel" \
  -H 'content-type: application/json' -b "$COOKIE" \
  -d "{\"type\":\"client-request\",\"rpcId\":\"smoke-1\",\"method\":\"panel\",\"payload\":{\"sessionId\":\"${SID}\"}}"
#    期望：{"type":"server-response",...,"result":{"ok":true,"value":{...,"stats":{"catalog":<实测基线>,...}}}}
# 4) 面板关闭整组 → 期望 ok:true、mutation.applied[0].matched = 该服务器工具数
curl -sS -X POST "http://127.0.0.1:3099/session-tool-toggle/toggle" \
  -H 'content-type: application/json' -b "$COOKIE" \
  -d "{\"type\":\"client-request\",\"rpcId\":\"smoke-2\",\"method\":\"toggle\",\"payload\":{\"sessionId\":\"${SID}\",\"on\":false,\"addresses\":[\"mcp:yunxiao\"]}}"
# 5) 与命令面对账：同一关闭集
curl -sS -X POST "http://127.0.0.1:3099/api/commands/execute" \
  -H 'content-type: application/json' -b "$COOKIE" \
  -d "{\"agentId\":\"${SID}\",\"line\":\"/tools status\",\"submittedAttachments\":[]}"
```

- ⑧ 断言：第 3 步 `ok:true` 且 `stats.catalog` ≈ 本部署实测基线（`code-design` 基线 214 中含 MCP 139）。
- ⑨ 断言：第 4 步 `mutation.applied[0].matched` 等于该服务器工具数（yunxiao 实测 70），第 5 步回执的关闭集含 `mcp:yunxiao`。
- 负路径：`toggle` 发 `{"addresses":["tool:bash"]}` → `ok:false` 且 `code:"protected"`；`panel` 发不存在的 `sessionId` → `code:"session-not-live"`。
- 若第 2/3 步被 401/403 挡住 → 抄 U4 的备用路径（页面内 `fetch` 直调，页面已带 cookie）。

---

## 6. 风险与未决

### 6.1 风险与缓解（8 条）

| # | 风险 | 缓解 |
|---|---|---|
| **R1** | **多窗口并发开关不一致**：两窗口对同一会话各持一份快照，A 关 `yunxiao`、B 仍显示开；B 再点开 → 覆盖 A 的意图 | ① 每次 mutation 返回**新快照**，写者立即收敛；② `command/executed` + `focus` + 手动刷新三触发让旁观窗口收敛；③ 关闭集在面板里集中展示（用户能看到"其实已经关了"）；④ 明确不做乐观更新。**语义上后写者胜**（与命令面一致：命令也是最后一条生效） |
| **R2** | **插槽渲染时机与无会话期**：`conversation.session.header.utilities` 只在 `conversation.session.header` 条目挂载期间存在（`dsh-cordis-client-runner/lib/client.js:3992` 的 declaredBy）；无会话时座位不存在 | scope `session` 已由框架保证有会话；`sessionId` 用标准 prop（`repo/dsh-client-ui-session/lib/types/client/index.d.ts:84`），组件不猜；座位缺席时 `register` 抛错被 `try/catch` 吞掉（web-ux 同做法），最坏是入口不出现 |
| **R3** | **RPC 通道与 web-ux 通道并存**：两个 prefix route，若将来有人用同一前缀会撞 | 通道名取包名（唯一）；`register()` 对同名 route 抛错（`dsh-host-webserver/lib/index.js:326-329`）→ 撞车是**启动期显式失败**而不是静默覆盖；README 记录占用事实 |
| **R4** | **client bundle 体积**：面板引入 Modal/Switch/Button（已是 `external`，不进 bundle）+ CSS modules 内联 + controller 逻辑 | 预计 client.js 增量 ≈25–40 KB（未压缩）；primitive/react 全外置（`CLIENT_EXTERNALS`）；`bundle.test.ts` 卡住"多打一个裸包名"的回归；不引入 zod/i18n 库（见 D16） |
| **R5** | **面板快照与 `tools/change` 的刷新策略**：面板打开期间 MCP 服务器可能重载/断线，清单陈旧 → 用户点一个已消失的工具 → `restrict` 抛「unknown tool」 | ① 掩码层已有「restrict 抛错 → 重推一次重试」的不变量（`code-design` I3），单次开关不会把整层打挂；② 面板每次 mutation 后吃新快照，陈旧条目自动消失；③ 每次 mutation 前**不**强制重拉（一次往返的代价换不到正确性，重试已兜底）；④ 打开即拉 |
| **R6** | **i18n**：宿主 `guardReason`/命令回执是 zh-CN 硬文案，若被面板直接展示，英文界面会混中文 | 面板只展示 `t()` 键；宿主文本仅作为 `error.message` 二级 detail（不参与本地化，与 web-ux 一致）；`notice`/失败码全部是稳定码 |
| **R7** | **双端构建链对 CI 的影响**：`verify:all` 原有顺序是 lint→typecheck→build→test，`bundle.test.ts` 依赖构建产物；`typecheck` 现在有两个 project；`lib/` 产物翻倍 | 沿用 web-ux 的既定顺序（其 `verify:all` 就是 lint→typecheck→build→test，`plugins/web-ux/package.json:96`）；`.gitignore` 已忽略 `*.tsbuildinfo`；`release.mjs` 递归重建产物无需改 |
| **R8** | **大快照体积**：214 个工具 × description，若带 `parameters` 会是数百 KB/次 | 宿主**不**返回 `parameters`；description 截断 160 字符；`panel` 只在打开/刷新/变更后调用（不是首屏）；预计单次响应 < 60 KB |

**已核实、不列为风险的两条事实**（避免实现期重复排查）：
- 自定义 RPC 通道**有**浏览器信任围栏：`connection.rpc.handle` 在 `register()` 内部先 `this.admit(req)`，失败返回 401/403（`dsh/dsh-client-connection/lib/index.js:855-871`、`:744-749`），与 `/api` 同一套 cookie/Host 校验 → 通道不是"本机无认证 API"。
- `zod` **在** 平台模块表里（`dsh-web-frontend/dist/assets/index-*.js` 的 `SZ()` 返回表含 `zod`），官方 `dsh-client-ui-conversation/lib/client.js` 也确实 `require("zod")` → 若将来想让契约复用 zod 是可行的（本次不采用，见 D16）。

### 6.2 「实现期实测回填」未决点

| # | 未决 | 回填方式 |
|---|---|---|
| U1 | `Modal` 内嵌 `Switch` 与 `useModalLayer`/Escape 的交互（面板内是否有第二个 `Modal` 层、焦点返回） | 10.4 的 jsdom 套件 + 隔离实例人工点检；必要时改 `headless` 或换 `SegmentedTabs` |
| U2 | 头部图标按钮的最终视觉（28px 圆形 vs `Pill` 胶囊）与图标选择 | 11.3 截图对照官方三项；不改契约 |
| U3 | `command/executed` 是否真的覆盖「面板打开时用户用斜杠命令改开关」（`@mode emit` 只在本窗口触发；跨窗口不广播） | 11.2 的 ⑨ 断言；若跨窗口不覆盖，靠 `focus` + 手动刷新兜底（R1） |
| U4 | 自定义通道的 curl 冒烟是否被 `admit` 挡住（需要 `GET /?token=…` 换 cookie；Host 头必须是 loopback） | 11.2 的 ⑧ 实跑；失败则改用浏览器内 `fetch` 直调（页面已带 cookie） |
| U5 | 分组歧义（serverName 含 `__`）在真实部署的命中情况 | 11.2 打印一次 `panel.groups` 的 server 集合，与本部署 5 台（yunxiao / chrome-devtools-mcp / dbx / codebase-memory / figma）对照 |
| U6 | 面板打开时切换会话（`sessionId` 变化）的重挂行为 | 10.3 单测 + 人工点检：`useMemo` 按 `sessionId` 键控 controller，切换即重建并重拉 |
| U7 | `defaults` 写入时目录不存在（`$DSH_HOME/session-tool-toggle/` 首次）的 `dirMode` 生效情况 | 既有任务 6.1（用户级默认档）已覆盖 `writeFileAtomic` 的 dirMode；面板侧只断言 `defaults-unwritable` 的错误面 |
| U8 | 快照体积实测（若 > 200 KB 需分页或按组懒加载） | 11.2 记录 `panel` 响应字节数；超阈值时改为「先返回分组摘要、展开时再取单组」 |

---

## 7. 决策记录（D12–D20）

### D12 入口选 `conversation.session.header.utilities`，不用 `header.actions` / `header.corner`

- **决策**：注册到 `conversation.session.header.utilities`，`order: 20`，id `session-tool-toggle-panel`。
- **依据**：插槽语义就是「Right-aligned Session utilities in ascending order」（`dsh/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:236-241`）；官方三例（open-in-app `-10`、schedule `-5`、session-log-export 缺省 `0`）都是"工具性"入口，与本面板同类；`owner props` 无专属值（`:440-443`）说明该座位刻意不传父级语义，正好适合"自己从标准 Session props 取会话"。
- **被否 1：`conversation.session.header.actions`**（同为 list/scope session）。理由：语义是「Title-adjacent Session actions」，官方占位的是会话级动作（fork/rename 类）；把"工具面配置"塞进去会让"动作"与"设置"混在一起，且 order 空间已被官方占满。
- **被否 2：`conversation.session.header.corner`**（single）。理由：single 座位只容一个占用者，占用即**抢走**官方角落控件（`replaceRisk: shadows-shipped-ui`），代价远大于收益。
- **被否 3：侧栏/设置页常驻入口**。理由：工具面是**会话级**开关，脱离会话上下文会诱导"全局生效"的误解；且设置页属于官方 `dsh-client-ui-settings` 的座位体系（需再引入一个 client 依赖）。
- **反例**：若官方将来把 utilities 语义收紧为"只放会话内小动作"，本入口可能显得越界；届时改 `order` 或迁到 `actions`（`corner` 是 single 座位，迁过去会顶掉官方控件，**不是**可行的迁移目标）。

### D13 面板用组件内自渲染的 `Modal`，不借 `shell.overlay`

- **决策**：入口按钮组件内直接渲染 `Modal`（body portal），不注册 `shell.overlay`，不建跨 entry 请求 store。
- **依据**：`Modal` 本身就是 body portal（`repo/dsh-client-ui-primitives/lib/types/Modal.d.ts`：「Render a centered, body-portaled modal over a blurred page mask」）；入口按钮常驻（座位不随交互卸载）。
- **被否：照抄 web-ux 的 `shell.overlay` + 请求 store**。理由：web-ux 需要它是因为**菜单项会随菜单关闭而卸载**（`plugins/web-ux/src/client/index.ts:11-14` 明确写了这个约束）；本场景没有这个约束，抄过来只增加一个 client 依赖（`dsh-client-ui-layout`）与一份跨 entry 状态。
- **第二个被否：`drawer`/侧栏页**。理由：面板要"就地看、就地改"，抽屉会把会话内容挤出视野；且官方右侧栏 tab 体系是 `ctx.sidebarRight.openTab` 的领地（消费先例 `dsh/dsh-client-ui-schedule/lib/client.js:7501`），第三方没有稳定座位。

### D14 单一控制内核 `control.ts`，`commands.ts` 退为文本前端

- **决策**：把「读状态 / 改状态 / 读写默认档」的全部用例收进 `src/host/control.ts`（依赖注入），`commands.ts` 只做「解析 argv + 拼 zh-CN 回执」，`rpc.ts` 只做「校验 wire + 映射失败码」。
- **依据**：用户拍板 ③ 要求面板与命令等效；`code-design` 不变量 1/2/5/9 都是"状态与校验只有一处"。让两个消费者直接调用同一内核，比"两份实现 + 一张对照测试"更可靠。
- **被否 1：面板直接复用 `ctx.commands.execute(agent, '/tools off …')`**。理由：`execute` 的返回是 `CommandExecution`（面向人类回执的文本），面板需要结构化数据（`matched`/`hiddenTools`/`visibleAfter`）与 i18n 键；把中文回执再解析一遍是反向工程（`dsh/dsh-commands/lib/types/index.d.ts:142` 的签名只给 `CommandExecution`）。
- **被否 2：面板与命令各写一份实现，用契约测试对齐**。理由：两份实现必然在两处漂移——保护名单判定顺序、0 匹配的容忍语义、`reset` 的快照来源；这些都是"半年后才会被发现"的差异。
- **反例**：`commands.ts` 重构会让既有 7.1 的单测基线变动（回执拼装与内核分离后，部分断言从 `commands` 移到 `control`）。这是**一次性成本**，换来的是「第二个消费者零复制」；若不接受，代价是永久双写。

### D15 保持 host-only 投影（不加 `wire`），面板用 RPC 拉取 + 四类刷新触发

- **决策**：`sessionToolToggle` 投影单元**不加 `wire` view**（维持 `code-design` D1/③.2 的 host-only 结论）；面板状态一律由 `panel` 端点拉取；刷新靠「打开 / mutation 回执 / `command/executed` / focus+手动」四类触发。
- **依据**：`ProjectionDefinition.wire` 是可选字段，host-only 单元「Omit for host-only units」（`dsh/dsh-session-projection/lib/types/index.d.ts:39-70`）；`useProjection` 只能读 client-visible 键（`repo/dsh-client-ui-session/lib/types/client/index.d.ts:85-86`）。改 wire 会同时动持久化面、视图 schema 与 client 类型表，超出本次扩展必要范围。
- **被否 1：加 `wire` 用 `useProjection` 做实时推送**。好处是跨窗口零延迟一致；代价：① 状态形状变成 client 可见契约（多一份 `viewSchema` 与兼容义务）；② 仍不能解决"清单"（工具注册表事实）的实时性，面板还得拉 RPC；③ 与用户拍板 ④「不含配置键编辑」无冲突但也无收益。**保留为 v2 候选**（若 R1 在实测中成为真实痛点，加 wire 是最小改动路径）。
- **被否 2：面板里轮询 `panel` 端点**。理由：无谓的定时请求 + 电池/CPU 成本，且 `command/executed` + `focus` 已覆盖绝大多数陈旧场景。
- **反例**：面板打开时用另一个窗口改了开关，本窗口不会自动变；靠「关闭集」区与刷新按钮可见性兜底（R1 的接受边界）。

### D16 线上契约用**共享手写 parser**（`src/contract.ts`），zod 草案只作形状权威

- **决策**：`src/contract.ts` 零 import，手写 4 对 parser；§2.2 的 zod 草案作为**本设计的形状权威**（评审与测试的字段清单），不进入代码。
- **依据**：① web-ux 的既定结论与理由——「本模块不得 import `node:*` 或 `@deepseek-ai/*`（会被内联进浏览器 bundle），因此校验为手写实现，不引入 zod」（`plugins/web-ux/src/contract.ts:13-15`）；② 该模块同时被打进宿主（bundled zod）与浏览器（`external` 之外的一切都会进 bundle），手写让两端都零额外依赖；③ 既有 `test/bundle.test.ts` 断言的是**精确 external 词表**，新增 `zod` 会放宽这条护栏。
- **被否 1：共享 zod schema，client 侧 extern `zod`（平台表已验证含 `zod`）**。可行（见 §6.1 事实），但把「面板可用」耦合到"未来 shell 的模块表仍含 zod"这一实现细节上；一旦移除，client bundle 在物化期抛错、整个浏览器半消失（含入口），比手写 parser 的"多几行代码"更贵。
- **被否 2：宿主用 zod、client 用手写，两套并存**。理由：两份校验必然漂移，且 zod 的 `strict`/`superRefine` 语义与手写实现不会自动对齐。
- **反例**：手写 parser 在嵌套结构上更啰嗦，且新增字段时要同时改 TS 类型、parser、zod 草案三处；缓解 = `wire-contract.test.ts` 用表驱动覆盖每个字段的"缺/坏/多"，并把 zod 草案留在本文当 checklist。

### D17 面板**不新增状态存储**：直接读写同一 `StateStore` 与同一 `SessionLayer`

- **决策**：`panel` 的读 = `store.read(session)` + `layer.snapshot()` + `ctx.tools.schemas()`；`toggle` 的写 = `store.write` + `layer.setState`。client 侧只有"快照缓存"，没有第二份业务状态。
- **依据**：用户要求面板「等效 /tools」；`code-design` 的 10 条不变量全部围绕"单一状态源"。
- **被否：面板侧维护一份 `panelState` 作为 UI 真相，异步回写宿主**。理由：两份状态的收敛问题（谁赢？）会把一个简单的开关变成分布式一致性问题；且 resume/fork 后宿主状态可能变化，UI 侧缓存无意义。
- **反例**：每次操作都要一次网络往返才看到结果（约 5–30 ms，本地 loopback）；可接受。若实测有卡顿，只在该行加 spinner，**不**改状态源。

### D18 默认档编辑不追溯，面板也不提供「应用到本会话」

- **决策**：`defaults` 端点只写文件并回视图；不提供"把新默认档套到当前会话"的按钮。
- **依据**：`code-design` D9 / spec「默认档变更不追溯」是用户 Q5-a 拍板；提供"应用到本会话"等价于把默认档变成可变引用，破坏快照语义。
- **被否：加一个「同时应用到本会话」复选框**。理由：一旦存在，用户就无法从界面上判断"我这个会话到底按哪份默认档"；`/tools reset` 已经是"回到创建时快照"的正确入口。
- **反例**：用户想"以后默认这样，现在也这样"时需要两步（保存默认档 + 面板里手动关同样几项）。这是刻意的摩擦；README 写明。

### D19 批量开关「全有或全无」

- **决策**：`toggle` 的多个地址在同一请求内校验（文法 / 保护 / reserved），任一非法 → 整单拒绝，不写任何状态、不动掩码。
- **依据**：命令面是"一条命令一个结果"（`CommandResult` 只有 success/error，`dsh/dsh-commands/lib/types/types.d.ts:33-41`）；面板若允许部分成功，会与命令面的语义分叉。
- **被否：部分成功 + 逐地址回执**。理由：多出的回执结构（每地址 outcome）会让 UI 多一层"哪些成了"的渲染，而这两个失败码本来就是防御性路径（开关已置灰）。
- **反例**：用户一次多选 10 个地址、其中 1 个拼错 → 全部失败、需要重来。缓解：面板的地址来自清单点击（不是自由输入），只有默认档区是自由输入，且那里失败会回显具体地址（`details.address`）。

### D20 端点集 4 个（`panel` / `toggle` / `reset` / `defaults`），不做"一个写端点 + 一个 op 字段"

- **决策**：四个端点、四种成功值形状；`reset` 与 `toggle` 共享 `ToggleValueSchema`（因为语义都是"变更会话状态"），`defaults` 独立（不改会话）。
- **依据**：web-ux 的契约原则——「一个端点一种响应形状（预览返回 `DeletePreview`，执行返回 `DeleteOutcome`），调用方不可能把 A 端点的答案当 B 端点解码」（`plugins/web-ux/src/contract.ts:6-11`）。
- **被否 1：单写端点 `mutate` + `op` 判别字段**。理由：调用方要按 op 分派解码，等于把两种形状塞进一个 `oneOf`，正好是上面那条原则禁止的。
- **被否 2：把 `defaults` 的读拆成第五个端点**。理由：`panel` 已返回默认档视图；多一个读端点就多一处"两个来源不一致"的可能（且默认档写入后本来就不影响会话快照）。
- **反例**：`reset` 与 `toggle` 共用 `ToggleValueSchema` 意味着 `applied` 语义要能表达"回滚到 N 项"；实现上 `reset` 返回 `applied` 为"被移除的关闭项（`on:true`）"，字段语义在 README 与测试里写明。

---

## 附录 A：本文相对 `code-design.md` 的修订索引

| code-design 位置 | 修订 |
|---|---|
| §1.1 表 | 追加 12 个 src 行（本文 §1.1）+ 1 个 `css-modules.d.ts` 行；改写 7 行（package.json/build.mjs/tsconfig×3→×4/vitest/index.ts/commands.ts/types.ts） |
| §1.2 表 | 不变（README 描述改「双端」） |
| ③ 类型面 | 增 `ControlDeps` / `PanelInputs` / `PanelSnapshot` / `Mutation` / `DefaultsView` / `NoticeCode`（本文 §2.2、§1.2） |
| ③.9 不变量 | 增第 11 条「面板与命令面共用同一状态与同一写入路径」、第 12 条「web 契约零外部依赖、两端各内联一份」 |
| ④ 决策 | 续 D12–D20（本文 §7） |
| ⑤ 任务组 | T1–T8 保持；新增 T9（宿主内核 + RPC）、T10（client 半），人日 9.5 → ≈14.5 |
| ⑥.1 假设 | 增 A12（`toolServerOf` 首 `__` 切分在面板分组上的歧义与自检）、A13（自定义通道走 Connection 的 `admit` 围栏） |
| ⑥.2 未决 | 增 U8（面板专用，见本文 §6.2） |
| P1/P2/P3 | 不变（面板不改变持久化/命令面/子代理默认档的结论） |
