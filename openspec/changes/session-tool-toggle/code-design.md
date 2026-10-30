# session-tool-toggle · 代码级蓝图（阶段 1.7 · 设计线）

> **本文只回答四件事**：动哪些文件、每个文件怎么改、接口与数据形状长什么样、为什么这么定。需求级论证见 `line-a.md` / `line-b.md`，已定结论见 `diff-matrix.md`（本文视其为硬约束，**不复读、不推翻**）。
> **事实来源**：本机 DSH `0.2.1-rc.2` 安装包（`/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/*`，下称 `dsh/`）、本仓 4 个插件源码、`~/.dsh/profiles/web/` 实配、`/home/xuqinqin/develop/company/opc/.dsh/mcp/`。文中每个判断都挂了 `file:line`；查不到的一律进 ⑥。
> **本轮实测基线**（可复现，见 ⑤ T7）：本会话可见工具 **214** 个，其中 MCP **139**（yunxiao 70、chrome-devtools-mcp 32、dbx 18、codebase-memory 17、figma 2），非 MCP 75。测量面 = Host Inspect Provider `Tool.listTools`（「Tools visible to the requesting Agent」）。

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
