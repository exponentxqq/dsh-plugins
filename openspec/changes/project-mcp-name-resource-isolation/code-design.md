# 代码级蓝图（阶段 1.7）— project-mcp-name-resource-isolation

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由双线与 `diff-matrix.md` 收敛，**本文不复读**；本文只把已定结论翻译成**可施工的代码形状**。
> 输入已逐字读全：`line-a.md`（271 行）、`line-b.md`（315 行）、`diff-matrix.md`（213 行；§5 = 用户已拍板 Q1–Q5，§6 = 收敛结论，**本文不推翻**）。
> 事实基线（只读核实，2026-11-02）：运行中 DSH `0.2.1-rc.2`；`plugins/project-mcp` 版本 `1.4.0`；仓库 tag `v1.4.0`；`openspec/changes/project-mcp-name-resource-isolation/` **尚不存在**（落档时创建）。
> 上游路径本文一律相对 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`；本仓路径相对仓库根 `/home/xuqinqin/develop/person/dsh-plugins`。
> **本文只写设计，未修改仓库任何文件、未 git add/commit、未改 `openspec/`、未读取其他子代理产物。**

---

## 0. 栈识别与 writer 豁免留痕

**栈识别结论：TypeScript / Node（Cordis）DSH 插件 —— 非 Spring、非 Nuxt，`spring-writer` / `nuxt-writer` 均未命中。**

| 证据 | 位置 | 说明 |
|---|---|---|
| 无 Maven / Gradle / Nuxt 命中 | 仓库根 `find . -maxdepth 3 \( -name pom.xml -o -name 'build.gradle*' -o -name 'settings.gradle*' -o -name 'nuxt.config.*' \) -not -path '*/node_modules/*'` → 空输出 | 三个 writer 候选的前提均不成立 |
| 单仓 pnpm workspace | `pnpm-workspace.yaml:5-6`（`packages: - "plugins/*"`）、根 `package.json:6`（`packageManager: pnpm@11.25.0`）、`plugins/project-mcp/package.json`（`"type": "module"`、`main: lib/index.js`） | Node ESM 单包 |
| 源码 TypeScript + Cordis 插件形态 | `plugins/project-mcp/src/index.ts:14`（`export { name, inject, apply } from './host/index.ts'`）、`src/host/index.ts:44`（`export const name = 'project-mcp'`）、`:47`（`inject = ['workspaceRegistry','tools']`）、`:84`（`export function apply(ctx: Context)`） | 宿主半插件入口 |
| 构建 = esbuild 单产物 | `plugins/project-mcp/build.mjs:33`（`entryPoints: [src/index.ts]`）、`:40`（`external: ['node:*']`，其余全部 inline） | **产物只允许 `node:*` external**，任何 `@deepseek-ai/*` 只能是 `import type`（否则 profile bare 安装加载失败） |
| 测试 = vitest | `plugins/project-mcp/vitest.config.ts`（`include: ['test/**/*.test.ts']`、`environment: 'node'`）、`package.json` scripts `test: vitest run` | 测试在插件目录 `test/` 下 |
| 类型检查 = tsc -b，严格 + `verbatimModuleSyntax` | `plugins/project-mcp/tsconfig.base.json:8`（`"verbatimModuleSyntax": true`）、`tsconfig.host.json`（`include: src/index.ts, src/host, test/**/*.test.ts`） | **类型导入必须写 `import type`**，否则运行时 import 泄漏进产物 |
| lint = oxlint；门禁脚本 `verify:all` | `plugins/project-mcp/package.json` scripts（`lint`/`typecheck`/`build`/`test`/`verify:all`） | 单插件门禁 = `pnpm --filter dsh-plugin-project-mcp verify:all` |
| DSH 基线单点 | `scripts/dsh-baseline.mjs:13`（`DSH_BASELINE = '0.2.1-rc.2'`）、`scripts/check-dsh-baseline.mjs:163-174`（所有 DSH devDep 必须精确等于基线） | 升级/新 devDep 受 `pnpm dsh:check` 约束 |

**仓库既有代码约定（硬约束，且修正任务书的一处措辞）**：任务书写「中文注释与文档」，实际仓库约定是 **源码 JSDoc/注释 = 英文**、**面向用户的文案（命令描述、错误回执）、README、spec/design = 简体中文**。证据：`src/host/isolation.ts:1-25`、`src/host/types.ts:1-8`、`src/host/mcp-manager.ts:1-19` 全英文 JSDoc；中文只出现在用户可见字符串，如 `src/host/index.ts:198`（`description: '重新扫描各工作区 .dsh/mcp 目录…'`）、`:213`（`已重扫：加载 …`）。本蓝图全部新增代码按此执行（新增 JSDoc 用英文、诊断行与文档用中文）。

**writer 加载回执：豁免（用户授权，仅本次有效）。** 因此本文的写法约束不来自 writer skill，而来自上表 + 现有同类模块（`isolation.ts` / `mcp-manager.ts` / `plugin-loader.ts`）的既有风格：ESM、窄本地端口类型（不 import 上游实现）、同目录 `.test.ts`、`{@link}` 交叉引用、每处决策附「被否方案 + 反例」。

---

## ① 触达面清单

**仓归属**：全部落**本仓 `dsh-plugins`**，插件目录 `plugins/project-mcp/`（下表路径除标注外均相对该目录）。上游 `@deepseek-ai/dsh*`（`/usr/local/lib/node_modules/@deepseek-ai/dsh/`）**只读核实、零修改**；`~/.dsh/profiles/*`、`~/develop/company/*/.dsh/mcp/` 只作验证对象，不入 diff。**不触达** `plugins/session-tool-toggle/`、`plugins/web-ux/` 等其他插件（Q2 已定不纳入人类 UI）。

### 1.1 宿主半（`src/host/`）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| **H1** | `src/host/prompt-isolation.ts` | **新建**：名字面（模型可见名字）过滤，纯函数 + 薄监听器工厂 | 常量 `RESOURCE_NAMES_SECTION = 'mcp-resource-servers'`、`SERVER_SECTION_PREFIX = 'mcp:'`；窄类型 `SectionLike` / `PromptAssemblyLike` / `AssembleAgentLike` / `AssembleContextLike`；`rewriteResourceNames(text, hidden)`（多策略解析 + `unparsable`）；`planNameFilter(sections, hidden)`（名字段改写 + `mcp:<server>` 段按名删除 + `changed` 判定）；`hiddenServers(active, visible)`；`createAssembleListener(ports)`（先 `next()` 再过滤、异常兜底 over-hide、诊断节流、`declare module` 补 `system-prompt/assemble` 事件）；**不 import 任何上游模块**（只 `import type { ScanLog } from './types.ts'`） |
| **H2** | `src/host/isolation.ts` | 资源面闸门：把「三个资源工具的 server 参数」并入既有 per-agent guard | 常量 `RESOURCE_TOOLS`、`RESOURCE_DENY_REASON`；类型 `GuardedExecution`（`name` + 可选 `arguments`）；`ScopedTools.guard` 形参由 `{readonly name:string}` 放宽为 `GuardedExecution`；`IsolationPorts` 增 `activeServerNames()`（必填）；新增纯函数 `resourceGuardReason(toolName, args, active, visible)`；`attach()` 的 guard 闭包改为「工具面理由是 undefined 后，若是资源工具再判资源面」；新增 `visibleFor(key)` 读数；模块头注释补「三面（工具/名字/资源）同源」说明 |
| **H3** | `src/host/mcp-manager.ts` | 新增「已加载（active）」只读端口，与「claimed」口径显式区分 | `activeServerNames(): ReadonlySet<string>`（`new Set(this.active.keys())`）；`managedServerNames()` / `serverNamesForRoots()` 的 doc 补一句「这是 claimed 口径，active 见新方法」（**行为不变**）；模块头补「两份口径的用途分工」 |
| **H4** | `src/host/index.ts` | 接线：注册组装瀑布监听、给隔离层供 `activeServerNames` 端口、boot 期可观测行 | `IsolationLayer` 构造参数加 `activeServerNames: () => manager.activeServerNames()`；新增 `ctx.on('system-prompt/assemble', createAssembleListener({...}))`（**不做 `inject`**，缺 `systemPrompt` 的部署静默降级）；boot 段（`:233` 之前）加一行 `agents.list().length` 观测日志；模块头步骤清单补第 6 步（名字面） |
| **H5** | `src/host/types.ts` | **明确不改** | 新类型的归属地是「用它的模块」：`GuardedExecution` 进 H2（守卫自己的输入切片），`SectionLike`/`PromptAssemblyLike` 进 H1（装配面自己的切片）。`ScanLog` 三档（`:29-45`）已够用，**不扩 debug 档**（见 D-6 的限流设计）。`ScannedServer`/`ServerSource` 无字段变化 |

### 1.2 测试（`test/`）

| # | 文件 | 改动意图 |
|---|---|---|
| **T1** | `test/prompt-isolation.test.ts` | **新建**：`rewriteResourceNames` 表驱动（保留 profile 名 / 移除隐藏项目名 / 保序 / 多行数组 / 空文本 no-op / 非法 JSON → `unparsable` / 空数组 → `empty`）；`planNameFilter`（名字段改写 / 全空删段 / `mcp:<server>` 删段 / 非目标段原样 / `interpolate` 保留 / `changed=false` 时同引用）；`createAssembleListener`（假 assembly + 假 ports：跟踪/未跟踪、`context.agent` 缺失、`next()` 先调、异常兜底 over-hide、节流、无段 no-op 不读端口） |
| **T2** | `test/isolation.test.ts` | 改：`fakeTools` 的 guard 形参放宽到 `GuardedExecution`（现有 `:42`、`:68-73` 两处）；`ports()` 帮助函数加 `activeServerNames`；新增「资源面闸门」矩阵（三工具 × 可见允许 / 隐藏拒绝 / profile 级放行 / 加载失败 claim 放行 / 参数缺失 / 非字符串 / `arguments` 非对象 / 未跟踪 agent 无 guard）+ `visibleFor` 读数 + guard 与既有工具面守卫互不干扰 |
| **T3** | `test/mcp-manager.test.ts` | 改：`activeServerNames()` 口径（加载成功后进入 / 加载失败不进入 / 卸载后消失 / 与 `managedServerNames()` 的差集正好是失败集） |

### 1.3 文档与规范

| # | 文件 | 改动意图 |
|---|---|---|
| **D1** | `openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md` | **新建**（change 目录尚不存在）：ADDED `资源服务器名与资源面的隔离`（名字段 / 指令段 / 资源三工具 / fail-closed / active 口径 / profile 不受影响 / 降级场景）；MODIFIED `工作区可见性隔离`（`:105-132`，把「工具」扩为「工具、名字、资源三面两套机制」）与 `隔离的动态刷新`（`:134-151`，补名字/资源面重算与幂等）；`openspec validate --all` 通过 |
| **D2** | `plugins/project-mcp/README.md` | 改写非目标 `:152`（资源面已交付）；补「三面隔离」行为说明、`active` vs `claimed` 口径、降级矩阵（无 `systemPrompt`/无 `mcpResources`/段格式漂移/HMR 未跟踪）、残余边界（人类 UI、全局注册层、升级前历史、agentless 调用）、回滚代价；隔离冒烟记录表（`:75-96`）更新为含名字面/资源面两列 |
| **D3** | 根 `README.md:77` + 根 `AGENTS.md:21` | 一行描述加「名字（资源服务器名/服务器指令段）与资源面隔离」 |
| **D4** | `openspec/changes/project-mcp-name-resource-isolation/artifacts/` | **新建**（证据，非源码）：`spike-name-surface.md`、`spike-guard-arguments.md`、`smoke-record.md` |

### 1.4 明确不改（核实后判定）

| 文件/面 | 判定理由 |
|---|---|
| `src/host/scan.ts`、`env-expand.ts`、`watcher.ts`、`triggers.ts`、`roots.ts`、`attribution.ts`、`host-io.ts` | 扫描格式、env 展开、watch 阶梯、归属判定、诊断通道全部复用，无字段/签名变化（`attribution.ts:83-96`、`host-io.ts:63-78`） |
| `src/host/plugin-loader.ts` | 连接仍是「一配置一条 mcp-client、挂插件全局 ctx」（`plugin-loader.ts:126`），S2 不改加载形态 |
| `plugins/project-mcp/build.mjs`、`cordis.patch.yml`、`package.json` | 无新运行时依赖、无新 devDep（**刻意不引 `@deepseek-ai/dsh-system-prompt`**，见 D-9）、无新配置键、无新 cordis 行 |
| `plugins/session-tool-toggle/**` | Q2 已定人类 UI 不纳入（其 `shadowed` 面板按 N2 保持管理员视图）；交互边界见 D-7 |
| dotfiles `~/develop/dotfiles/dsh/profiles/**` | profile 级 MCP 行不动（Q3） |
| 上游 `@deepseek-ai/dsh*` | 零修改；`system-prompt/assemble` 与 `tools.guard` 只用公开面 |

---

## ② 证据锚

每个触达模块 ≥1 条 `file:line`；本行文中的上游锚点已逐条 `read`/`grep` 复核（不是转抄 diff-matrix）。

| 模块 | 证据（代码事实） |
|---|---|
| **H1** `prompt-isolation.ts`（新建） | 段名与文本形态：上游 `dsh-mcp-resources/lib/index.js:120`（`name: "mcp-resource-servers"`）、`:122`（`interpolate: false`）、`:124-128`（`names = [...layers.merge(scope,...).keys()].sort()`；空则 `''`；否则 `` `## MCP resource servers\n\nUse list_mcp_resources, … with one of these names as the server argument: ${JSON.stringify(names)}.` ``）；指令段：`dsh-mcp-client/lib/index.js:655`（`### MCP server: ${config.serverName}\n\n${serverText}`）、`:731-743`（`name: \`mcp:${server}\`` 在 `:737`，`interpolate: false` 在 `:739`）、`:823`（每台客户端 apply 时注册）；`renderPrompt` 只拼文本、不补标题且丢弃空段：`dsh-system-prompt/lib/index.js:117-119`；装配瀑布：`dsh-system-prompt/lib/index.js:356`（`assemble()`）、`:398`（`ctx.waterfall(scopeTarget(this, scope), 'system-prompt/assemble', assembly, context, …)`，**返回值即权威**）；未打标签监听器收全部 scope：`dsh-scope/lib/index.js:327-338`（`scopeTarget`：`tag === undefined` 时 `return true`）；`complete` 段会在瀑布后覆盖 sections：`dsh-system-prompt/lib/index.js:398-407`；官方监听器范式：`dsh-working-directory/lib/index.js:48-60`（读 `context.agent`、`await next()` 后改写 `assembly.contexts`）；装配上下文同时有 `agent` 与 `scope`（同对象）：`dsh-agent/lib/index.js:291-297`（`{ agent, scope: agent }`）；会话 cwd/id：`dsh-session/lib/types/types.d.ts:59-70`（`SessionHeader.id` 在 `:66`、`cwd?` 在 `:70`） |
| **H2** `isolation.ts` | 现有窄守卫类型：`:45`（`guard(guard: (execution: { readonly name: string }) => string | undefined): () => void`）；端口面：`:59-91`；`Tracked`：`:93-105`；工具面纯函数：`:112-117`（`toolServerOf`）、`:127-139`（`deriveDeny`）、`:148-156`（`guardReason`）；guard 装配点：`:260-268`（`tools.guard((execution) => guardReason(execution.name, this.ports.managedServerNames(), tracked.visible))`）；`visible` 落点：`:339-344`；刷新与幂等：`:292-296`、`:355-362`；诊断样式：`:478-492`（`isolation: cwd=… roots=N visible=[…] …`）、`:168-195`（`REPORTED_NAMES`/`sample`）；inactive context 判别：`:211-213`。上游契约：`dsh-tools/lib/types/index.d.ts:216-242`（`ToolExecutionInput`，`:226-227` `arguments: unknown` 为 lossless JSON、`:228-229` `agent?: Agent`）、`:282-287`（`ToolExecution`）、`:522`（`type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined`）、`:647-656`（`guard()` 返回精确 disposer）；guard 求值：`dsh-tools/lib/index.js:3321`（先 `tools/pre-execute` waterfall）、`:3337`（`decision.kind === 'allow'` 时才 `guardReason(exec)`）、`:3024-3032`（先全局层，再 `chainLayers(exec.agent)`；`exec.agent === undefined` 直接返回，见 `:3027`）、`:3017-3022`（`guard` 注册为 `layers.effect(..., { notify: false })`）；参数形态：`:3259-3263`（`snapshotJsonValue` + `deepFreeze`，非 JSON 可序列化即抛错，**不会进 dispatch**）；deny 呈现：`:3339-3351`（`Error: ${reason}` + `isError: true`）；PTC 同管线：`:1364-1376`（子调用 input 带 `arguments: normalized.dispatched`、`agent: exec.agent`、`parent: exec.token`）、`:2767-2768`（`[TOOL_RUNTIME_SCHEDULER].prepare = (exec) => this.prepareScheduledExecution(exec)`）；资源工具名与参数：`dsh-mcp-resources/lib/index.js:56`/`:66`/`:76`（三个工具名）、`:32-42`（`listParameters`，`server` 为 `{type:'string', required:true}`，由工具自身校验）；上游兜底错误：`:174-177`（`MCP resource server "x" is unavailable in this agent's scope`） |
| **H3** `mcp-manager.ts` | `active` 是「加载成功才写入」的映射：`:70`（`private readonly active = new Map<string, ActiveServer>()`）、`:160-173`（`await this.loader.load(server)` 成功后才 `this.active.set(...)`，失败进 `failed`）；卸载先删后 dispose：`:182-193`（`:186-189` 注释「Delete first: the name is free the moment teardown starts」）；claimed 口径：`:117-127`（`managedServerNames()` doc 明写「loaded or not」）、`:129-138`（`serverNamesForRoots`）；declarative sync：`:94-105` |
| **H4** `index.ts` | 端口装配点：`:89-97`；`scopedTools`：`:72-78`；串行 attach：`:159-172`（`:160` `const key: object = agent`、`:161` `agent.session.header.cwd`、`:162-164` `agent.ctx.effect` 卸载 detach、`:165-171` **返回** attach Promise）；`tools/change` 刷新：`:178-185`；boot 段：`:233`；teardown：`:225-230`；本地事件声明先例：`:49-59`（`domain/changed`）；`Context.agents`（`AgentRegistry`，`list(): Agent[]`）：`dsh-agent/lib/types/index.d.ts:19-21`、`:357` |
| **T1/T2/T3** | 现有假件形态：`test/isolation.test.ts:37-75`（`fakeTools`，`:42`/`:68-73` 的 guard 形参就是被放宽的那处）、`:77-88`（`ports()` 帮助函数，加字段的唯一入口）；`test/mcp-manager.test.ts:34-56`（`fakeLoader` 可拒绝指定服务器）、`:14-21`（`server()` fixture）；`vitest.config.ts`（`test/**/*.test.ts`，node 环境） |
| **D1** | 现有需求标题与行号：`openspec/specs/dsh-project-mcp/spec.md:105`（`### Requirement: 工作区可见性隔离`）、`:134`（`### Requirement: 隔离的动态刷新`）、`:153`（热重载）；spec 产物 zh-CN、`MUST`/`SHALL` 保留英文（仓 `AGENTS.md`「OpenSpec 工作流」） |
| **D2** | 非目标原文：`plugins/project-mcp/README.md:147`（`## 非目标（本版本）`）、`:152`（「不隔离 MCP **资源**面…冒烟中已观察到越权工作区的 `probe-cs` 仍能被资源类工具列到」）；冒烟方法与证据表：`:75-96`（`dsh --profile web --port 3099 --no-open` + `/tmp/probe-mcp.mjs`、`POST /api/session/{create,prompt,page}` 复现要点）；机制说明段：`:58`（两层强制）、`:61`（动态刷新） |
| **D3** | 根 `README.md:77`（`dsh-plugin-project-mcp` 一览行）、根 `AGENTS.md:21`（插件清单条目） |
| 交叉插件边界（D-7 用） | `plugins/session-tool-toggle/src/host/session-layer.ts:588-598`（在 agent 作用域注册**同名空段** `mcp:<server>`、`text:''`、`interpolate:false` 做遮蔽，注释「name 必须与官方全局段同名，否则遮蔽不成立」）；`plugins/session-tool-toggle/src/host/control.ts:611-617`（`catalogOf` = 全局层注册名） |
| 名称字符集（解析安全性，D-4 用） | `src/host/scan.ts:34`（`SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`）、`:97-100`（serverName 非法即跳过并记 error）；`dsh-mcp-client/lib/index.js:812-818`（`owner = scopeOf(ctx) ?? ctx.root` 的 serverName 预约，重复即抛） |

---

## ③ 接口与数据形状

> 全部新增 JSDoc 用英文（见 §0），本节为中文说明。所有新类型都是**本地窄切片**：不 import 上游包（`verbatimModuleSyntax` + `build.mjs:40` 只允许 `node:*` external）。

### 3.1 名字面纯函数（H1，新建 `src/host/prompt-isolation.ts`）

```ts
import type { ScanLog } from './types.ts'

/** 上游资源名字段的段名（`dsh-mcp-resources/lib/index.js:120`）。 */
export const RESOURCE_NAMES_SECTION = 'mcp-resource-servers'
/** 每台 mcp-client 注册的服务器指令段名前缀（`dsh-mcp-client/lib/index.js:737`）。 */
export const SERVER_SECTION_PREFIX = 'mcp:'

/** One assembled prompt section, as this module reads and rewrites it. */
export interface SectionLike {
  readonly name: string
  /** Resolved-but-not-interpolated text. */
  readonly text: string
  /**
   * MUST be carried through verbatim: both `mcp-resource-servers`
   * (`dsh-mcp-resources/lib/index.js:122`) and `mcp:<server>`
   * (`dsh-mcp-client/lib/index.js:739`) register with `interpolate: false`,
   * and `renderPrompt` interpolates any section that omits it.
   */
  readonly interpolate?: boolean
}

/** One assembly, as far as this module is concerned. */
export interface PromptAssemblyLike {
  readonly sections: readonly SectionLike[]
}

/** The session-facing slice of an agent (diagnostics only; upstream `Agent` satisfies it). */
export interface AssembleAgentLike {
  readonly session: { readonly header: { readonly id: string; readonly cwd?: string } }
}

/** The assembly context: `agent` and `scope` are the same object when both exist. */
export interface AssembleContextLike {
  readonly agent?: AssembleAgentLike
  readonly scope?: object
}
```

**名字段改写（含 `unparsable` 分支）**：

```ts
/** How one resource-name section was rewritten. Callers MUST exhaust this union. */
export type NamesRewrite =
  /** 文本为空（上游注册表为空 = 段文本 `''`）或无可移除项：**保留原段**，零分配。 */
  | { readonly kind: 'kept' }
  /** 改写过：`text` 已就位，`kept`/`removed` 为诊断用的名字列表（均保序）。 */
  | { readonly kind: 'rewritten'; readonly text: string; readonly kept: readonly string[]; readonly removed: readonly string[] }
  /** 数组里的名字被全数移除 → 调用方**删除整段**（与上游「注册表为空不贡献段」同形）。 */
  | { readonly kind: 'empty'; readonly removed: readonly string[] }
  /** 找不到/解析不了句末 JSON 数组 → 调用方**删除整段**（fail-closed，Q5）。 */
  | { readonly kind: 'unparsable' }

/**
 * Drop hidden server names from one resource-name section's text.
 * @param text - the assembled section text (never re-rendered by upstream).
 * @param hidden - project server names this agent must not see.
 * @returns how the text changed; `unparsable` means "delete the section".
 */
export function rewriteResourceNames(text: string, hidden: ReadonlySet<string>): NamesRewrite
```

解析策略（有序，E10「多策略降低误判」；判定顺序即契约，单测逐条钉住）：

1. `text.trim() === ''` → `{kind:'kept'}`（**空段不是解析失败**；否则每步每会话一条 warn，日志必淹）。
2. **策略 A「句末数组」**：`/(\[[^[\]]*\])(?=\s*\.?\s*$)/u` —— 允许数组与句点之间存在空白/换行（上游若改成 pretty-print 仍命中）。
3. **策略 B「全文最后一个数组」**：`/\[[^[\]]*\]/gu` 取最后一处。
4. 对候选串 `JSON.parse`；要求 `Array.isArray` 且**每个元素都是 string**，否则降级。
5. A、B 都失败 → `{kind:'unparsable'}`。

> **为什么正则足够**（不写 JSON tokenizer）：段内出现的名字只可能来自 mcp-client 的 `serverName` 契约 —— 项目侧由 `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/` 强制（`scan.ts:34`），因此不可能出现 `]`/`"`/`{{`；`interpolate:false` 也保证不会被变量插值改写。**已知边角**：若上游将来在段里塞入含 `]` 的名字（本项目侧不可能），策略 A/B 会一起失败 → `unparsable` → fail-closed 删段（方向安全）。
> 重写形式：`text.slice(0, start) + JSON.stringify(kept) + text.slice(end)`，与上游 `JSON.stringify(names)` 逐字同形（`:127`），因此「完全保留项」的段文本**逐字节不变**（幂等断言可写 `text === original`）。

**整段过滤计划**：

```ts
/** What one assembly's name-face pass decided. */
export interface NameFilterPlan {
  /** Filtered sections; the INPUT reference when `changed === false`. */
  readonly sections: readonly SectionLike[]
  /** Whether anything was removed or rewritten. */
  readonly changed: boolean
  /** Names left inside the resource-name array (input order). */
  readonly keptNames: readonly string[]
  /** Names removed from the resource-name array (input order). */
  readonly removedNames: readonly string[]
  /** Dropped `mcp:<server>` section names (input order). */
  readonly removedSections: readonly string[]
  /** The resource-name section was dropped because its text did not parse. */
  readonly unparsable: boolean
}

/**
 * Plan one assembly's name-face filtering.
 * @param sections - the sections the waterfall produced.
 * @param hidden - project server names this agent must not see.
 * @returns the plan; `changed === false` means "return the assembly untouched".
 */
export function planNameFilter(sections: readonly SectionLike[], hidden: ReadonlySet<string>): NameFilterPlan
```

规则（逐条单测）：
- 段名 `=== RESOURCE_NAMES_SECTION`：走 `rewriteResourceNames`；`kept` → 原段；`rewritten` → `{...section, text}`（**spread，绝不挑字段重建**，见 D-5）；`empty`/`unparsable` → 丢弃该段并置 `changed`。
- 段名以 `mcp:` 开头且 `hidden.has(name.slice(4))` → 丢弃该段（**按段名移除**，D-5）。
- 其余段原样透传（含 `contexts`/`tools`/`variables`：本模块根本不读它们）。
- 同名段多于一个（防御）：逐个处理，`removedNames` 拼接，`unparsable` 取或。
- `changed === false` 时返回**入参同一引用**，不分配新数组、不改任何段对象。

**名字集合推导（三面共用的唯一口径）**：

```ts
/**
 * The project servers that must stay out of this assembly.
 *
 * Rule (one place, both faces): `hidden = active \ visible`, where `visible`
 * is undefined for an untracked agent (fail-closed -> everything hidden).
 * @param active - loaded project servers.
 * @param visible - the agent's workspace servers, or undefined when untracked.
 * @returns the hidden names (empty when there is nothing to hide).
 */
export function hiddenServers(
  active: ReadonlySet<string>,
  visible: ReadonlySet<string> | undefined,
): ReadonlySet<string>  // visible === undefined → active 的拷贝；否则 active 中不在 visible 的那些
```

### 3.2 装配监听器（H1，同一文件）

```ts
/** What the listener reads. */
export interface PromptIsolationPorts {
  /** 该 agent 的可见项目服务器名；`undefined` = 未跟踪 → fail-closed。 */
  visibleFor(agent: object): ReadonlySet<string> | undefined
  /** 本插件**已加载**的服务器名（H3 端口；**不是** claimed 集合）。 */
  activeServerNames(): ReadonlySet<string>
  readonly log: ScanLog
}

/** The `system-prompt/assemble` listener this plugin installs. */
export type AssembleListener = (
  assembly: PromptAssemblyLike,
  context: AssembleContextLike,
  next: () => Promise<PromptAssemblyLike>,
) => Promise<PromptAssemblyLike>

/** 装配期名字面过滤（含诊断节流；节流状态按监听器实例隔离）。 */
export function createAssembleListener(ports: PromptIsolationPorts): AssembleListener
```

监听器实现顺序（**不可交换**）：

```ts
async (assembly, context, next) => {
  const resolved = await next()                       // ① 先让后续监听器跑完（D-11）
  if (!resolved.sections.some(isNameSurface)) return resolved   // ② 无相关段 → 不碰端口（无 MCP 部署零成本）
  let active: ReadonlySet<string>
  let hidden: ReadonlySet<string>
  try {
    const key = context.agent ?? context.scope        // ③ 二者皆可（E2）；都缺 → 未跟踪
    const visible = key === undefined ? undefined : ports.visibleFor(key)
    active = ports.activeServerNames()
    hidden = hiddenServers(active, visible)
  } catch (error) {
    ports.log.error(`prompt: cannot read the project server sets of one assembly: ${String(error)}`)
    return { ...resolved, sections: overHide(resolved.sections) }   // ④ 端口读失败 = 盲删 MCP 名字面（fail-closed）
  }
  if (hidden.size === 0) { noteNoop(...); return resolved }        // ⑤ 无可隐藏：零日志噪音（节流后）、同引用返回
  try {
    const plan = planNameFilter(resolved.sections, hidden)
    if (!plan.changed) return resolved
    report(context, plan)                                          // ⑥ 节流诊断（§3.6）
    return { ...resolved, sections: plan.sections }
  } catch (error) {
    ports.log.error(`prompt: cannot filter the resource server names of one assembly: ${String(error)}`)
    return { ...resolved, sections: overHide(resolved.sections) }  // ⑦ 异常兜底 = over-hide（D-11）
  }
}
```

- `isNameSurface(section)` = `name === RESOURCE_NAMES_SECTION || name.startsWith(SERVER_SECTION_PREFIX)`。
- 第一形参（waterfall 传入的原始 assembly）**不读**：一切以上一次 `next()` 的结果 `resolved` 为准；实现里命名为 `_assembly` 并在注释说明，避免 lint 的未用形参告警。
- `await next()` **位于 try 之外**：后续监听器抛错是它自己的失败，本插件不改变其传播语义（**不吞错**）；只有本插件自己的读集合/过滤逻辑才走 over-hide 兜底。
- `overHide(sections)` = 丢弃**每一个** `mcp-resource-servers` 段与**每一个** `mcp:` 段（不看可见集；只用名字，不再依赖可能抛错的路径）。
- 返回值：**不改入参对象、不原地改数组**；`changed` 为 false 时返回 `resolved` 本身（零分配）。返回的 `sections` 是**新的可变数组**（类型上是 `readonly`，运行时是普通数组，避免后续监听器 `push` 失败）。
- 不触碰 `contexts` / `tools` / `variables`：`{...resolved, sections}` 保留其余字段的引用。

**本地补的事件声明**（不新增 devDep，D-9）：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Expert waterfall over the assembled prompt. Declared locally because this
     * package does not depend on the package that owns the declaration
     * (`@deepseek-ai/dsh-system-prompt`) — the running host emits it either way.
     * Only the fields this plugin reads are modelled.
     */
    'system-prompt/assemble'(
      assembly: PromptAssemblyLike,
      context: AssembleContextLike,
      next: () => Promise<PromptAssemblyLike>,
    ): Promise<PromptAssemblyLike>
  }
}
```

### 3.3 资源面闸门（H2，`src/host/isolation.ts`）

```ts
/** 三个资源工具的注册名（`dsh-mcp-resources/lib/index.js:56,66,76`）。 */
export const RESOURCE_TOOLS: ReadonlySet<string> = new Set([
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
])

/**
 * 资源面拒绝文案：**不含**服务器名、资源名、URI 或任何目标服务器内容（E6），
 * 也不暗示该服务器是否存在（与上游 `unavailable in this agent's scope` 同样模糊）。
 */
export const RESOURCE_DENY_REASON = "MCP resource server is not configured for this session's workspace"

/** The slice of a tool call a guard reads (a subset of upstream `ToolExecution`). */
export interface GuardedExecution {
  readonly name: string
  /**
   * Parsed, deeply frozen JSON snapshot of the call arguments
   * (`dsh-tools/lib/index.js:3259-3263`); absent when upstream omits them.
   * NEVER assumed to be an object with a `server` field.
   */
  readonly arguments?: unknown
}
```

**守卫闭包的类型扩展（现有窄类型如何安全加 `arguments`）**：

```ts
export interface ScopedTools {
  restrict(filter: { readonly deny: readonly string[] }): () => void
  /** 形参由 `{readonly name:string}` 放宽为 {@link GuardedExecution}。 */
  guard(guard: (execution: GuardedExecution) => string | undefined): () => void
  visibleNames(): readonly string[]
}
```

安全性论证（写进代码注释，供 review 复核）：
- 上游 `ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined`（`dsh-tools/lib/types/index.d.ts:522`）。
- `strict: true` 下函数形参是**逆变**位置：把 `(e: GuardedExecution) => string|undefined` 传给 `guard()` 需要 `Readonly<ToolExecution>` 可赋值给 `GuardedExecution`。上游 `ToolExecution` 有 `name: string`（`:223`）、`arguments: unknown`（`:227`，深冻结快照，`:3263`），**两者都满足**；新增字段全是可选或 `unknown`，所以放宽后仍然合法（`index.ts:75` 的 `guard: (guard) => scope.tools.guard(guard)` 一行不用改）。
- **绝不**声明 `arguments` 为某个具体对象形态（例如 `{server?: string}`）：PTC 与原生调用的参数是「工具自身校验前」的任意 JSON，声明成对象会把「不是对象」的分支变成类型谎话（见 ⑥ A5）。

**端口与守卫闭包**：

```ts
export interface IsolationPorts {
  // …既有四端口不变…
  /**
   * The server names this plugin has **loaded** (active).
   *
   * Deliberately different from {@link managedServerNames} (the claim set):
   * a claim that failed to load never registered a provider, so treating it as
   * hidden would hide/deny a *profile-level* server of the same name.
   */
  activeServerNames(): ReadonlySet<string>
}

/**
 * The refusal reason for one MCP resource call, or undefined to allow it.
 * @param toolName - the called tool's name.
 * @param args - the execution's argument snapshot (untrusted shape).
 * @param active - loaded project servers (H3).
 * @param visible - the calling agent's workspace servers.
 * @returns the denial reason, or undefined (hand malformed arguments back to the tool).
 */
export function resourceGuardReason(
  toolName: string,
  args: unknown,
  active: ReadonlySet<string>,
  visible: ReadonlySet<string>,
): string | undefined
```

`resourceGuardReason` 判定链（顺序即契约）：
1. `!RESOURCE_TOOLS.has(toolName)` → `undefined`（不是资源工具，不归本模块管）。
2. `server = resourceServerOf(args)`：`args` 非对象 / 为 `null` / 是数组 / 无 `server` / `server` 不是非空 string → `undefined`（**交回上游校验**，绝不因参数形态误拒）。
3. `!active.has(server)` → `undefined`（profile 级服务器、未知服务器、加载失败的同名 claim —— 不归本插件管）。
4. `visible.has(server)` → `undefined`（本工作区自己的服务器）。
5. 否则 → `RESOURCE_DENY_REASON`（**不含 server**）。

`attach()` 里的闭包（替换现有 `:264-265`）：

```ts
tracked.guard = tools.guard((execution) => {
  const denied = guardReason(execution.name, this.ports.managedServerNames(), tracked.visible)
  if (denied !== undefined) return denied
  if (!RESOURCE_TOOLS.has(execution.name)) return undefined
  return resourceGuardReason(execution.name, execution.arguments, this.ports.activeServerNames(), tracked.visible)
})
```

- 先工具面（claimed 口径，**行为不变**）后资源面（active 口径）：非资源工具只多一次 `Set.has`，不额外构造集合。
- **每次调用读实时集合**，不缓存快照（D-12）。
- `resourceGuardReason` 内部再判一次 `RESOURCE_TOOLS`（防御：测试与将来直接调用方都不必先判）。

**可见集读数**：

```ts
/**
 * The server names one tracked agent may see.
 * @param key - the agent's identity object (its own scope).
 * @returns 该 agent 当前的可见集合；未跟踪（未知 agent）返回 undefined。
 */
visibleFor(key: object): ReadonlySet<string> | undefined
// return this.agents.get(key)?.visible
```

### 3.4 active 读数端口（H3，`src/host/mcp-manager.ts`）

```ts
/**
 * The server names this plugin has **loaded**.
 *
 * `active` is written only after `loader.load()` settled (`:160-173`) and the
 * name is deleted *before* teardown starts (`:186-189`), so this set never
 * contains a claim that failed to connect and never keeps a server that is
 * going away. It answers "which project servers actually exist in the
 * mcpResources layer right now" — the question the name face and the resource
 * gate must ask, as opposed to {@link managedServerNames}'s "what did the scan
 * claim".
 * @returns a snapshot of the loaded server names.
 */
activeServerNames(): ReadonlySet<string> // new Set(this.active.keys())
```

**不新增** `activeServerNamesForRoots()`：`visible` 继续用 claimed 口径 `serverNamesForRoots()`（理由见 D-3「两个口径为什么必须并存」）。

### 3.5 `index.ts` 接线（H4）

```ts
const isolation = new IsolationLayer({
  catalog: () => ctx.tools.schemas().map((schema) => schema.name),
  attribute: async (cwd) => (await attributor.attribute(cwd))?.roots ?? null,
  serverNamesForRoots: (roots) => manager.serverNamesForRoots(roots),
  managedServerNames: () => manager.managedServerNames(),
  activeServerNames: () => manager.activeServerNames(),          // 新增一行
  log,
})

// 名字面：装配瀑布内按归属过滤资源服务器名与服务器指令段。
// 未打标签的监听器收到**所有** scope 的装配（dsh-scope/lib/index.js:327-338），
// 归属查询走隔离层自己的 agent 表；缺 systemPrompt 的部署该事件永不触发 = 软降级。
ctx.on('system-prompt/assemble', createAssembleListener({
  visibleFor: (agent) => isolation.visibleFor(agent),
  activeServerNames: () => manager.activeServerNames(),
  log,
}))

// boot 期可观测行（只观测、不改行为）：本插件加载前已存在的会话不会收到
// agent/created，因此名字面从下一次装配起 fail-closed、资源面暂无守卫（README 边界）。
const live = ctx.get('agents')?.list().length ?? 0
if (live > 0) log.info(`boot: ${live} session(s) predate this load; name isolation applies from their next assembly, resource isolation from the next agent/created`)
```

- **不 `inject` `systemPrompt`**：`ctx.on` 是事件订阅，服务缺席时事件不发，插件其余行为不变（软降级，N「无 `systemPrompt` 部署」）。
- 位置：紧跟 `isolation` 构造之后、`agent/created`（`:159`）之前；监听器随插件 fiber 卸载（与现有 `ctx.on` 同纪律，无需额外 `ctx.effect`）。
- `ctx.get('agents')` 的类型来自 `import type {} from '@deepseek-ai/dsh-agent'`（`:28`）已声明的 `Context.agents`（上游 `dsh-agent/lib/types/index.d.ts:19-21`）。

### 3.6 诊断行与限流口径

三条行（同一前缀 `prompt:`，与既有 `isolation:` 分开 grep）：

```
prompt: resource names session=<id> cwd=<cwd> tracked=yes kept=[figma-family] removed=[probe-b] sections=[mcp:probe-b] unparsable=0
prompt: resource names session=<id> cwd=none tracked=no hidden=<active 数>            # 未跟踪 → 全隐
prompt: resource names section unparsable (deleted), upstream text drifted: session=<id> cwd=<cwd>  # warn，前 3 次
```

限流（R12，既有先例 `index.ts:181` 的 `toolChanges <= 3`）：

| 状态 | 行为 |
|---|---|
| 无相关段（无 `mcp-resource-servers`/`mcp:`） | **不读端口、不打日志**（无 MCP 部署零成本） |
| 有相关段但 `hidden.size === 0` | 前 5 次相关装配各打一条 `hidden=0`（形状键 `noop`），之后只在形状变化时打 |
| 实际过滤（`changed === true`） | 前 5 次全量；之后仅当**形状**变化才打一条。形状 = `tracked|kept=N|removed=N|sections=N|unparsable=N`（不含 session，故同形重复静默、异形必现） |
| 解析失败 | `warn` 前 3 次；累计计数进后续过滤行的 `unparsable=N` |

- 计数器与 `lastShape` 是**监听器实例内的闭包变量**（`createAssembleListener` 每次调用一份），不污染模块全局，单测可独立验证。
- 名字列表用本地 `sample()`（≤6 个后接 `+N`），与 `isolation.ts:168-195` 同风格（**不 export、不共享**，两模块各自独立）。
- 会话身份取 `context.agent.session.header.id`/`cwd`（`dsh-session/lib/types/types.d.ts:59-70`）；`agent` 缺失时写 `session=(none)`。

### 3.7 数据形状速查（谁读哪个集合）

| 面 | 判定集合 | 用于「隐藏/拒绝」的集合 | 用于「放行」的集合 | 出处 |
|---|---|---|---|---|
| 工具面（既有，不改） | claimed `managedServerNames()` | `claimed \ visible` 的 `mcp__<server>__*` 名字 | `visible.has(server)` | `isolation.ts:127-156`、`:264-265` |
| 名字面（本变更） | active `activeServerNames()` | `active \ visible` 的名字 + 同名 `mcp:<server>` 段 | `visible.has(name)` | H1 `hiddenServers` |
| 资源面（本变更） | active `activeServerNames()` | `active \ visible` 且 `arguments.server` 命中的调用 | `visible.has(server)` 或 server ∉ active | H2 `resourceGuardReason` |

> 三面共用**同一个** `visible`（`IsolationLayer.attach/recompute` 产出的 `tracked.visible`，`isolation.ts:339-344`），因此三面必然同源、同刷新节奏（G4 动态性）。

---

## ④ 决策记录

> 每条：决策 / 被否方案 / 理由 / 反例（落在具体代码或具体场景上）。**D-1 为栈识别与 writer 豁免；D-2…D-15 为代码设计决策。**

### D-1 栈识别结论 + writer 豁免（如实留痕）

- **决策**：按 **TypeScript / Node（Cordis）DSH 插件**施工：ESM、窄本地端口类型、`test/*.test.ts` + vitest、esbuild 单产物、oxlint、源码 JSDoc 英文 + 用户文案/文档中文。**writer skill 本次豁免加载（用户授权，仅本次有效），不得声称已加载**。
- **被否**：按 `spring-writer` 或 `nuxt-writer` 的约定写（Java 包结构 / Vue SFC / Nuxt 目录约定）。
- **理由**：仓库根无 `pom.xml`/`build.gradle*`/`nuxt.config.*`；`package.json` 为 ESM + esbuild + vitest + oxlint；入口是 Cordis `apply`（`src/host/index.ts:84`）。
- **反例**：若照 Spring 约定去建 `src/main/java` 分层或给 `apply` 加注解式配置类，`pnpm typecheck` 会立刻失败在 `src/index.ts:14` 的入口导出上；若照 Nuxt 约定新建 `plugins/` 目录，会与本仓 workspace 的 `plugins/*` 命名冲突（`pnpm-workspace.yaml:5-6`），`pnpm install` 直接把插件当成新 workspace 成员。

### D-2 资源闸门用 per-agent `tools.guard`，不用全局 `tools/pre-execute`

- **决策**：扩展 `attach()` 里已装的那条 guard 闭包（`isolation.ts:264-268`）为「工具面理由 → 资源面理由」的两段判定；资源面判定读 `execution.arguments`。
- **被否**：① 插件全局 ctx 上装 `tools/pre-execute` waterfall 监听（line-b 的 S2 原文）；② 干脆 deny 三个资源工具名（line-a P6）；③ 只在名字面下手（P5）。
- **理由**：guard 与既有 `restrict + guard` 双层架构同构；`tools.guard` 是**单调守卫**且按作用域分派 —— 用 `agent.ctx.tools.guard` 注册就只作用于该 agent（`dsh-tools/lib/index.js:3024-3032` 先全局层、再 `chainLayers(exec.agent)`），与工具注册在哪个 scope 无关；生命周期随 `agent.ctx.effect` 卸载（`index.ts:162-164`），无需第二套 agent 表；guard 在 `pre-execute` **之后**无条件求值（`:3337`），是最靠后的一道。
- **反例**：如果改用全局 `pre-execute`，(a) 它必须自己维护 agent→归属映射（本插件已有一份，重复且会漂移）；(b) 它是**可重排** waterfall（`:3321`），别的插件（审批/策略）可以在 `next()` 前短路，deny 是否被看到取决于顺序 —— 把安全边界放进一个可重排的链里；(c) PTC 子调用在 `:1364-1376` 里带着 `agent` 与 `parent` 走同一 `prepare` 路径，guard 天然覆盖，而 `pre-execute` 监听器要额外处理 `parent` 语义。**② 的反例**：整体 deny 三个资源工具会连带杀掉 profile 级服务器的资源能力（`codebase-memory` 等），违反「非 project MCP 不受影响」；**③ 的反例**：只做名字面时模型仍可直接 `read_mcp_resource(server="probe-b")` 读到别的工作区资源（README `:152` 已实测 `probe-cs` 可被列到）。

### D-3 集合口径：**资源面/名字面用 active（已加载）**，工具面继续用 claimed

- **决策**：名字面过滤与资源面拒绝都用 `activeServerNames()`（H3）；`visible` 继续由 claimed 口径的 `serverNamesForRoots()` 产出；工具面 `managedServerNames()` 一字不改。
- **被否**：① 三面统一用 claimed（最简单）；② 三面统一用 active（看似更一致）。
- **理由**：claimed 含「加载失败的 claim」。项目 claim 与 profile 行同名时 mcp-client 会拒绝第二次预约（`dsh-mcp-client/lib/index.js:812-818`：`owner = scopeOf(ctx) ?? ctx.root`，全局行共用同一个名字集合），此时**项目侧没有 provider、没有段、没有工具**，但 profile 侧的 provider/工具/段都活着（且属于别的会话能力）。若用 claimed：
  - 资源面会在**凡自己工作区没有定义该名的会话**里拒绝对 profile 同名服务器（如 `figma`）的资源调用 → 直接违反 Q3「profile 级不纳入」；
  - 名字面会把段里 profile 的同名条目删掉 → 同样误伤。
  active 恰好回答「现在 mcpResources 全局层里真的有谁」这个正确问题（`active` 只在 `loader.load` 成功后写入，`:160-173`；且 `:186-189` 先删后 dispose）。
  **claim 口径仍必须给 `visible` 用**：`visible` 只用于「**不**隐藏」，多算一个加载失败的 claim 不产生任何隐藏/拒绝（它不在 active 里，第 3 步就放行了），但它保证了「本工作区定义的服务器名永远不被当成越权」。
- **反例**：本机拓扑已经踩在边界上 —— dotfiles profile 里 dbx/figma 曾以 profile 行存在、后迁到项目级（diff-matrix §二.1 记录 opc/family/brains 各有 `figma*`/`dbx*`）。若 B 工作区（如 `dsh-plugins`）不存在 figma 而 A 工作区的 figma claim 因故加载失败，claimed 口径会让 B 会话里 profile 的 figma 名字消失、资源调用被拒 —— 用户看到的是「没装 figma 的工作区把图工具弄没了」，且日志上只有一条「加载失败」看不出因果。

### D-4 名字面解析失败 = **fail-closed（删段）** + 多策略解析 + 告警

- **决策**：`rewriteResourceNames` 返回 `unparsable` 时删除整个 `mcp-resource-servers` 段；解析按「句末数组 → 全文最后数组 → 失败」两策略；失败 warn（前 3 次）。
- **被否**：line-a 原推荐的 fail-open（保留原文 + warn）。用户已在 diff-matrix §5 第 2 轮改判。
- **理由**：fail-open 等于「上游改文案 = 永久泄漏，且只有一条 warn」；fail-closed 的最坏后果是部署里**所有** MCP 资源名段消失（含 profile 名），代价可见、可回滚，且不产生越权。多策略 + 精确的字符合法性前提（`SERVER_NAME_PATTERN`）把误判压到接近零。
- **反例**：假设上游把 `server argument:` 改成 `server param:` 并把数组改成空格分隔的裸名字列表 —— fail-open 下，`probe-b` 会继续出现在**每个**会话的提示词里，直到有人注意到 warn；fail-closed 下同一时刻所有会话都看不到资源名段，`docker logs` 里 `prompt: resource names section unparsable (deleted), upstream text drifted` 直接把原因指出来。前者是静默越权，后者是显式降级 —— 安全修复类变更应选后者。
- 补充：空文本（上游注册表为空时返回 `''`，`dsh-mcp-resources/lib/index.js:125`）**不算** unparsable，否则每一步都有一条 warn。

### D-5 指令段**按段名移除**；名字段空数组 → 删整段；改文本时 **spread 保留 `interpolate`**

- **决策**：`mcp:<server>` 段（`hidden.has(suffix)`）整段删除；名字段若 removals 覆盖全部名字则删整段；只改名字段文本时用 `{...section, text}`。
- **被否**：① 把指令段标题改写成中性标题（如 `### MCP server`）保留正文；② 把名字段设为空文本 `''` 而不删段；③ 重建段对象 `{name, text}`。
- **理由**：标题由 mcp-client 自己拼（`dsh-mcp-client/lib/index.js:655`），名字就在标题里，正文是服务器自述 —— 保留任何一部分都可能泄漏名字或其它项目指令，而 `renderPrompt` 不补标题（`dsh-system-prompt/lib/index.js:117-119`），改文本救不了标题；删段与上游「注册表为空不贡献段」同形（E5）。
- **反例（③）**：两个段都以 `interpolate: false` 注册（`dsh-mcp-resources`:122、`dsh-mcp-client`:739）。若用 `{name, text}` 重建，`interpolate` 丢失 → `renderPrompt` 会把正文当模板插值（`:118`）→ 服务器 instructions 里任何 `{{foo}}`（很常见，例如文档模板片段）都会触发「Malformed, unknown, or undefined references … throw」（`dsh-system-prompt/lib/types/index.d.ts:203`）→ **一次名字过滤把整个会话的提示词装配打挂**，而这个崩溃点离过滤器很远、极难归因。
- **反例（②）**：`text: ''` 能让 `renderPrompt` 丢掉内容，但装配数组里仍留着一个以 `mcp-resource-servers` 为名的空段；任何按段名读装配的消费者（排障工具、将来的段枚举、`complete` 段处理路径上的日志）仍能看到这个「不该存在」的段，且无法与「上游注册表为空」区分。

### D-6 诊断与限流口径

- **决策**：三条行（§3.6）；前 5 次相关装配全量、之后仅形状变化时输出；`unparsable` warn 前 3 次；无相关段零日志零分配；按监听器实例闭包计数。
- **被否**：① 每次过滤都打一条（可观测性最好）；② 完全不打日志（用 `isolation:` 行推断）；③ 给 `ScanLog` 加 `debug` 档再分级。
- **理由**：`assemble` 是**每步每会话**都会跑的高频路径（R12）。① 的后果是 8 个会话并行时 `docker logs` 里全是本插件的名字行，真正的加载错误被淹没（现有 `isolation:` 行已经只在「首次/变化」时打，见 `isolation.ts:355-365`，本设计与之同纪律）；② 会让「监听器没跑」与「跑了但无需过滤」不可区分，正是 `isolation.ts` 报告逻辑刻意要避免的（`:464-471` 注释）；③ 扩 `ScanLog` 会波及 `host-io.ts`、所有 `ScanLog` 假件（`test/isolation.test.ts:22-26`、`test/mcp-manager.test.ts:24-32`）与 `index.ts` 的 `/mcp-reload` counting log（`:201-208`），收益只是一个日志级别。
- **反例**：若每步都打，一台跑着 6 个会话的宿主每轮对话产生 6 行以上 `prompt:` 行；冒烟时你无法从 `docker logs | grep prompt:` 里判断「B 会话到底有没有被过滤」——**行太多与没有行在信息量上是等价的**。形状去重后，A 会话（`removed=[probe-b]`）与 B 会话（`removed=[probe-a]`）形状不同 → 两条都在，且第三条重复静默。

### D-7 与 `session-tool-toggle` 的交互边界（不冲突论证）

- **决策**：不改 `session-tool-toggle`；两者在**不同层面**处理同一个段名：它在 agent 作用域注册**同名空段**做遮蔽（`plugins/session-tool-toggle/src/host/session-layer.ts:588-598`），本变更在**组装期按段名删除**装配结果里的段。
- **被否**：① 让本插件产出一个只读服务供 `session-tool-toggle` 过滤 `shadowed` 面板（跨插件契约，Q2 已否）；② 由本插件接管它的段遮蔽（同一段名两处注册，冲突面更大）。
- **理由**：assembler 先用 `layers.merge(scope, …)` 合并段（`dsh-system-prompt/lib/index.js:363`；作用域段覆盖同名全局段），所以装配数组里 `mcp:<server>` **最多一条**：我们的删除与它的空段注册作用于**同一个最终对象**，不存在重名冲突；它关掉整组时干脆不注册（或注册空文本），我们无段可删 = no-op。反过来，我们删掉的段是「本 agent 不该看到的项目服务器」，与它的「用户主动关掉」语义正交，两者叠加只是「都不可见」。
- **反例**：如果将来 `session-tool-toggle` 改成「改写段文本」而非「注册空段」，两个插件就会在同一个段上叠加两段逻辑：它先写回正文，我们再决定删段 —— 结果是「用户关了组，但我们的可见集允许 → 段还在？」需要回归；本设计把边界写进 README（D2），升级 `session-tool-toggle` 时把这条列入回归清单。**另一条明确的不覆盖**：它关闭 `mcp:<server>` 组**不动资源 provider**（它只关工具与指令段），所以资源面闸门与它的开关正交 —— 这也解释了 Q4（不加回滚开关）后「用户仍可用 `/tools` 关资源工具名，但关不掉越权读取」：越权读取由本变更的资源闸门负责，不依赖任何开关。
- 面板（`shadowed` 行 / `/tools` 输出）继续显示项目名：`control.ts:611-617` 读的是全局 `ctx.tools.schemas()`，S2 不在注册层动手 → 记为残余边界（N2/Q2 已确认）。

### D-8 不新增配置开关（Q4 已定）

- **决策**：无 `resourceIsolation` 之类的键；行为默认生效。
- **被否**：加 profile 级布尔开关（可局部回滚）。
- **理由**：与工具面隔离一致（它也从不问配置）；安全修复宜默认开；配置契约、文档与测试组合都是纯增量成本。
- **反例**：开关一旦存在，就必须定义「关掉时资源闸门是否也关」——关 = 回到越权读；不关 = 名字面泄漏但调用面仍拒，用户会遇到「提示词里没有但调不动」的诡异态，比没有开关更难解释。回滚用版本降级（README 写明代价）。

### D-9 用**本地窄类型**声明 `system-prompt/assemble` 事件，不新增 devDep

- **决策**：H1 内 `declare module '@deepseek-ai/cordis' { interface Events { 'system-prompt/assemble'(…) } }`，只建模 `sections`/`agent`/`scope`/`next`。
- **被否**：给 `package.json` 加 `@deepseek-ai/dsh-system-prompt: 0.2.1-rc.2` 取精确类型。
- **理由**：与既有三处先例同一纪律 —— `domain/changed` 本地声明（`index.ts:49-59`）、`PluginLoaderService` 本地声明（`plugin-loader.ts:23-49`）、`ScopedTools` 本地窄面（`isolation.ts:32-57`）。不新增依赖 = 不动 lockfile、不触发 `dsh:check` 的 devDep 矩阵、不给 `link:` 安装增加解析面。
- **反例**：加 devDep 会引入**同名事件声明合并**风险：上游 `Events['system-prompt/assemble']` 的签名是 `(this: Scoped<SystemPrompt>, assembly: PromptAssembly, context: AssembleContext, next: () => Promise<PromptAssembly>) => Promise<PromptAssembly>`（`dsh-system-prompt/lib/types/index.d.ts:27`）。一旦该包进入类型图，两份声明必须**逐字兼容**，否则 tsc 报「Subsequent property declarations must have the same type」——为了用 3 个字段而把整个 `Scoped`/`Service` 泛型面拉进本包，收益远小于耦合成本。**兜底**：若将来某 devDep 间接引入它，`pnpm typecheck` 立即红（不会静默错），就地改成 `import type` 即可。

### D-10 监听器**先 `next()` 再过滤**

- **决策**：`const resolved = await next()` 之后才读端口、改 sections。
- **被否**：先进自己的过滤再 `await next()`。
- **理由**：`next()` 是 waterfall 的后续监听器链，官方范式（`dsh-working-directory/lib/index.js:48-60`）就是 `await next()` 后改 `assembly`；返回值为权威（`dsh-system-prompt/lib/index.js:398`）。
- **反例**：若先过滤再 next，后续监听器（例如 working-directory 会 `assembly.contexts.unshift(...)`，将来也可能有插件重排/重建 `sections`）会基于**被我们改过的**或**原始的**结果覆盖我们的工作 —— 过滤结果被静默丢弃，且没有任何日志能发现（因为我们的 `changed=true` 已经打过了）。

### D-11 异常路径 fail-closed（over-hide），端口读失败也 over-hide

- **决策**：catch 里返回 `{...resolved, sections: overHide(resolved.sections)}`（丢所有 `mcp-resource-servers` 与 `mcp:` 段）。
- **被否**：catch 里返回 `resolved` 原样（line-b 的「异常不得破坏装配」的宽松读法）。
- **理由**：名字面是显示层，缺一段的代价是「这一轮没有资源指引」；泄漏的代价是「越权名/别项目指令进入模型上下文」。异常是罕见路径，宁多隐一步。
- **反例**：若返回原样，上游或我们的正则抛错（例如未来把 `[` 处理改成 `JSON.parse` 整段）会让 `probe-b` 继续出现在提示词里，而日志只有一行 `cannot filter …`，与「过滤成功但无可隐藏」无法区分 —— 安全事件伪装成正常。

### D-12 每次调用/每次装配读**实时**集合，不缓存快照

- **决策**：guard 每次 `managedServerNames()`/`activeServerNames()`；监听器每次 `visibleFor()`/`activeServerNames()`。
- **被否**：在 `refresh()` 时把 `active`/`visible` 快照进 `Tracked`，减少热路径分配。
- **理由**：`performRescan` 是 `manager.sync()` → `isolation.refresh()` 两步（`index.ts:129-130`），中间存在窗口；`active` 由 manager 维护、`visible` 由 isolation 维护，两者刷新时点不同。实时读的窗口效应是「短暂多隐/多拒」（fail-closed 方向，R7）。
- **反例**：若 guard 用 `visible` 快照、manager 用实时 active：新服务器在窗口内既不在快照 visible 里、也已在 active 里 → **本该可见的自己工作区服务器被拒**（体验问题，可接受）；反过来若把 active 也快照，则窗口内新加载的**别工作区**服务器既不在快照 active、又不在 visible → 资源调用被放行 = **fail-open**（不可接受）。所以 active 必须实时；visible 跟随既有实现（本来就实时）。分配成本实测可忽略：每次调用 O(服务器数) 构造一个 ≤ 数十项的 Set，与 `deriveDeny` 现有开销同级。

### D-13 资源判定与工具判定**分成两个函数**，不合并

- **决策**：`guardReason(name, claimed, visible)`（既有，不改）与 `resourceGuardReason(toolName, args, active, visible)`（新增）分开。
- **被否**：合并成 `guardReason(name, args, managed, active, visible)` 一个函数。
- **理由**：两者的集合口径不同（D-3），合并后形参变五个、调用点必须同时给两个集合，极易把 active 传给工具面（那会让工具面从 claimed 退化为 active，等于**改了既有工具面语义**）。分开后各自有独立单测矩阵，口径错误会在测试里暴露而不是在线上。
- **反例**：合并版一旦被误传，工具面在「claim 加载失败但仍残留注册名」的窗口里不再 deny（`deriveDeny` 的候选集来自三个读数并集，含 carried 名字），等于给工具面开了一个 fail-open 口子 —— 而这正是 `isolation.ts:8-14` 注释里 guard 存在的理由。

### D-14 deny reason 不回显服务器名（模型面），日志里保留

- **决策**：`RESOURCE_DENY_REASON` 是不含任何名字/URI 的固定句；`prompt:`/`isolation:` 日志与 `execution.name` 可含名字（人看）。
- **被否**：沿用工具面风格（`tool … belongs to MCP server <server> …`），把 server 名带进 deny 文案。
- **理由**：E6 —— deny 文案会**回到模型上下文**；把隐藏服务器的名字写进去，等于用错误信息把名字泄漏补回去（工具面的既有文案泄漏名字是因为工具名里本来就带着服务器名，模型早已可见；资源面没有这个前提）。
- **反例**：若写 `MCP resource server "probe-b" is not configured…`，模型在 A 会话被拒一次就能确定 `probe-b` 存在，并可继续枚举 —— 名字面过滤的意义被错误信息抵消。日志侧则相反：排障需要知道被拒的是谁，所以**只有**日志带名字（`isolation:` 已有先例 `deny=[…]`）。

### D-15 不新增 `activeServerNamesForRoots`；`visible` 保持 claimed

- **决策**：manager 只加一个无参端口。
- **被否**：提供「按根过滤的 active 集合」，让 `visible` 也用 active。
- **理由**：`visible` 的语义是「本工作区**定义**了哪些服务器」（授权面），不是「哪些已加载」（现状面）。改成 active 会让「配置刚写入、加载中」的窗口里，本工作区服务器被判越权（名字被隐、资源被拒）——恰好是 R7 想避免的反向误伤；而 claimed 多算的那些名字在第 3 步（`!active.has(server)`）就被放行，没有副作用。少一个端口 = 少一处口径可漂移。
- **反例**：`reconcile` 的配置变更路径是「先 `await unload(serverName)` 再 `await loader.load(server)`」（`mcp-manager.ts:150-173`），其间 `active` **必然**短暂缺项。若 `visible` 也由 active 派生，那么在这个窗口里本工作区的服务器同时「不在 active」且「不在 visible」——对资源面它因 `!active.has(server)` 被放行（无害），但对**工具面**（它的 `visible` 同样来自这个读数）名字会被算出 deny、随后又被撤销，表现为一次无谓的 `restrict` 抖动；更糟的是若在窗口内该服务器恰好重新注册（reload 后），工具名会短暂进 deny → 用户侧表现为「改个配置后工具偶尔消失一下」。claimed 口径不会出现这种抖动（配置文件的声称与 active 无关）。

---

## ⑤ 逐任务组实现要点

> **分组约定**：下节 `### N. 组名` = 一个执行审核批次（tasks.md 落档时提升为 `## N. 组名`，本文以 `G<N>` 作为组别名引用）；**组间严格串行、组内可并行**；单组任务数 ≤ 8。组内「可并行」的判据 = **不写同一个文件**（`src/host/` 与 `test/` 目录可共享，沿用本仓既有 tasks.md 先例：`address.ts`/`skills-plan.ts`/`mask.ts` 曾同组并行；严格要求「不同目录」会与既有先例矛盾且不可施工）。每组出口都是**可执行命令或可断言事实**；每任务末尾引用 ① 的触达面条目编号，`tasks.md` 落档时逐条对齐。
> 组边界纪律：**每组结束必须 `pnpm --filter dsh-plugin-project-mcp typecheck` 通过**（组内并行期的中间态允许红，但组末必须绿）。

### 1. 关键 spike（G1，2 项，串行前置；不改源码）

> **G1 实测终形态（2026-11-04 执行期落定，5/5 + 6/6 全绿）**——产物 `artifacts/spike-name-surface.md`（569 行）与 `artifacts/spike-guard-arguments.md`（333 行）；可复用 fixture：`/tmp/spike-name/`（两工作区 probe + 临时 DSH_HOME + api.mjs）与 `/tmp/spike-guard/`（含 profile 级 probe）。后续组以此为契约输入：
>
> - **段文本契约（T1 输入）**：`mcp-resource-servers` 文本 = 固定前缀 + `JSON.stringify(sortedNames)` + `.`（实测逐字同形）；`mcp:<server>` 段名 + 文本首行 `### MCP server: <name>`；三个 MCP 段对象均带 `interpolate:false` 键——改写时必须 spread 保留。
> - **监听器形态（3.1 输入）**：`ctx.on('system-prompt/assemble', (assembly, context, next) => …)` 无标签收到全部 agent scope 装配（A2 ✓）；`context = {agent, scope, signal}`，`agent.session.header.cwd` 可取归属；**先 `await next()` 再返回新装配对象**，同进程下一步生效；不可依赖 `result === assembly`（实测 `resultChanged=true`）。
> - **complete 事实（A3 相关）**：装配给监听器的段对象**不带 `complete` 标志**；存在 complete 段时瀑布返回的 `sections` 被整体替换为 `[completeSection]`——监听器 mutations 全部丢弃 → 名字面隔离对 complete 会话是**安全 no-op**，实现**不写 complete 特判**（R-8）。
> - **guard 形态（2.2 输入）**：`execution.arguments` 恒为冻结 JSON 对象，缺参为 `{}` 而非 `undefined`（R-6）；非字符串 `server` 仅 PTC 内层代码直传可产出（原生调用被模型自行字符串化，R-7）——`typeof args.server === 'string'` 判定即可覆盖；guard 返回字符串在 **dispatch 前**拒绝、目标服务器零请求（三条 `diff` 全空）；PTC 内层 `parent:true` 走同一 guard 管线（A5/A6 ✓）；`agent/created` 里 `agent.ctx.tools.guard` 可直接装（探针即此用法）。
> - **关键 D4 发现**：同一时刻工具面日志已 `deny=[…]` 而两个会话提示词仍含全部项目名段——**工具面已隔离 ≠ 名字面隔离**，名字面必须按 `context.agent` 在监听器侧做。
>
> **口径更正锚**：本节以下（§2-§6 逐任务组）为**重排前旧稿**——分组/任务号/集合口径以 `tasks.md`（7 组 12 项）与 `design.md`（D-3 修订：三面统一 `blocked = claimed \ failedClaims`；触达面 H1-H4；接口形状 §③）为准。尤其：端口名 `blockedServerNames()`（非 `activeServerNames`）、mcp-manager 需 `failedClaims` + `failedServerNames()` + `blockedServerNames()` 两读数、G2 为 3 项（原 2.4 接线并入 2.2）、G3 仅 1 项（3.1，条件项 3.3 已按 Q1=A 取消）。

- **1.1 名字面段契约实证**（触达：无源码改动；产物 D4 `artifacts/spike-name-surface.md`）
  在独立 `DSH_HOME` + 独立端口（`dsh --profile web --port 3099 --no-open`，换 `DSH_HOME`）实例上，放两台 probe 服务器（`.dsh/mcp/*.yaml`，各自：`ping` 工具 + 一条 resource + 非空 `instructions` + HTTP 请求日志），逐条记录「命令 + 观察输出」：① 提示词段落文本逐字形态（`## MCP resource servers` + 句末 `["a","b"].`）；② `mcp:<server>` 段的段名与 `### MCP server: <name>` 标题；③ 段对象带 `interpolate: false`；④ 未打标签的 `ctx.on('system-prompt/assemble')` 能收到**每个** scope 的装配，且能用一个 listener 改 `assembly.sections` 后**下一步**生效；⑤ `complete` 段存在时 mutations 被丢弃（读 `dsh-system-prompt/lib/index.js:398-407` 即可预判，实测确认）。
  **验证**：`test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md` 且 `[ "$(grep -c '^结果：通过' …spike-name-surface.md)" -eq 5 ]`；任一条红 → 停止并上报（不得进 G2）。
- **1.2 守卫参数形态实证**（触达：无源码改动；产物 D4 `artifacts/spike-guard-arguments.md`）
  在同一实例上用一个临时探针插件（放 `artifacts/`，不进产物）装 `agent.ctx.tools.guard` 打印 `execution.arguments`，覆盖：原生调用 `list_mcp_resources(server="probe-b")`、`read_mcp_resource(server="probe-b", uri=…)`、`run_code` 内层 dispatch 调同一工具、缺 `server`、`server` 为非字符串、profile 级服务器调用；并确认 deny 后目标 probe 服务器日志**无新请求**。
  **验证**：产物含 6 条「结果：通过」；`grep -c '^结果：通过'` 等于 6；断言摘录里出现 `parent` 存在的 PTC 调用记录（证明内层走同一管线，`dsh-tools/lib/index.js:1364-1376` 的静态结论被实证）。

### 2. 纯函数与端口（G2，4 项，可并行；组末 typecheck 绿）

- **2.1** H1 的**纯函数层**：新建 `src/host/prompt-isolation.ts`（常量 + 窄类型 + `rewriteResourceNames` + `planNameFilter` + `hiddenServers` + `sample`；**不含** `createAssembleListener`、不含 `ctx` 相关代码）+ 新建 `test/prompt-isolation.test.ts`（T1 的纯函数部分）。
  **验证**：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0；断言含 `rewriteResourceNames('… server argument: ["a","b"].', new Set(['b']))` → `{kind:'rewritten', text:'…["a"].', kept:['a'], removed:['b']}`、`rewriteResourceNames('', …)` → `{kind:'kept'}`、`rewriteResourceNames('garbage', …)` → `{kind:'unparsable'}`、`planNameFilter` 对 `mcp:probe-b` 段返回 `removedSections:['mcp:probe-b']`、对 `{name:'mcp:probe-a',text:'x',interpolate:false}` 全等保 `interpolate`。
- **2.2** H2：`src/host/isolation.ts` 加 `RESOURCE_TOOLS`/`RESOURCE_DENY_REASON`/`GuardedExecution`，`ScopedTools.guard` 放宽形参，`IsolationPorts` 加 `activeServerNames`，加 `resourceGuardReason` + `visibleFor`，改造 `attach()` 的 guard 闭包；改 `test/isolation.test.ts`（T2）。
  **验证**：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/isolation.test.ts` 退出码 0；断言含三工具越权均返回 `RESOURCE_DENY_REASON` 且 `!reason.includes('probe-b')`、`arguments` 为 `null`/`'x'`/`{}`/`{server:1}` 时返回 `undefined`、`active` 不含该名时返回 `undefined`、`visibleFor(unknownKey) === undefined`。
- **2.3** H3：`src/host/mcp-manager.ts` 加 `activeServerNames()` + doc 补口径区分；改 `test/mcp-manager.test.ts`（T3）。
  **验证**：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/mcp-manager.test.ts` 退出码 0；断言含「一台加载失败后 `activeServerNames()` 不含它、`managedServerNames()` 含它」与「卸载后两者都不含」。
- **2.4** H4 的**最小接线**（只为组末 typecheck 绿）：`src/host/index.ts:89-97` 的 `IsolationLayer` 构造加 `activeServerNames: () => manager.activeServerNames()`。
  **验证**：`pnpm --filter dsh-plugin-project-mcp typecheck` 退出码 0；`grep -n "activeServerNames" plugins/project-mcp/src/host/index.ts` 命中。

### 3. 名字面接线与诊断（G3，2 项 + 1 条件项；组末必须绿）

- **3.1** H1 的**监听器层**：`createAssembleListener`（含 `PromptIsolationPorts`/`AssembleListener`/`declare module` 事件声明/`isNameSurface`/`overHide`/节流与三条诊断行）+ 扩 `test/prompt-isolation.test.ts`（T1 的监听器部分：假 assembly + 假 ports）。
  **验证**：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0；断言含「`next` 被调用恰好一次且先于端口读」「未跟踪 agent → 项目名全隐 + profile 名保留」「`context.agent` 与 `context.scope` 二者其一生效」「端口抛错 → 所有 `mcp:` 段消失（over-hide）」「`changed=false` 时返回同一对象引用」「同一形状连续 6 次只产生 1 条 info」。
- **3.2** H4 的**监听注册**：`src/host/index.ts` 加 `ctx.on('system-prompt/assemble', createAssembleListener({...}))` 与 boot 观测行；模块头步骤清单补第 6 步。
  **验证**：`pnpm --filter dsh-plugin-project-mcp typecheck` 与 `lint` 退出码 0；`grep -n "system-prompt/assemble" plugins/project-mcp/src/host/*.ts` 命中 index.ts 与 prompt-isolation.ts 各一处；`grep -n "agents.list()" plugins/project-mcp/src/host/index.ts` 命中。
- **3.3（条件任务，取决于待决 Q1）** H2/H4：boot 追平 attach（`agents.list()` 逐个 `attach`，并给 `attach` 加「已跟踪即跳过」幂等守卫）。
  **验证**：`vitest run test/isolation.test.ts` 退出码 0 且新增「重复 attach 同一 key 只装一条 guard」断言；默认**不做**（Q1 未决时跳过本任务，README 记残余边界）。

### 4. 静态门禁与隔离实例冒烟（G4，2 项）

- **4.1** 静态门禁（触达：无源码改动；校验 H1/H2/H3 的产物与 T1/T2/T3 全绿、D4 证据目录就位）
  `pnpm --filter dsh-plugin-project-mcp verify:all`、`pnpm dsh:check`、`docker exec dsh dsh --profile web --dump-config-schema`（以及 `acp`/`headless` 各一次）。
  **验证**：全部退出码 0；且 `! grep -qE "^import .*@deepseek-ai" plugins/project-mcp/lib/index.js`（产物无上游运行时 import）、`grep -q "mcp-resource-servers" plugins/project-mcp/lib/index.js`（新代码确实进了产物）、`grep -n "mcp-resource-servers" plugins/project-mcp/src/host/*.ts` 命中。
- **4.2** 隔离实例端到端冒烟 8 条（触达：D4 `artifacts/smoke-record.md`）
  复用 G1 fixture（A/B 两工作区 probe + 一台 profile 级 probe），逐条记录「命令 + 观察」：
  ① **名字面**：A 会话的自述名字列表 = A 的项目名 + profile 名，**不含** B 名；且 A 会话里 `grep "### MCP server: probe-b"` 在提示词中为 0 命中（用模型自述 + 插件诊断行双证）；
  ② **资源面允许**：A 会话 `list_mcp_resources(server=probe-a)` 与 `read_mcp_resource(server=probe-a, uri=…)` 成功；
  ③ **资源面拒绝且不触达**：A 会话对 `probe-b` 的 `list_mcp_resources`/`list_mcp_resource_templates`/`read_mcp_resource` 全部 `isError`，且 **probe-b 服务器侧请求日志行数在调用前后相等**（第三方可核对的主断言）；
  ④ **fail-closed**：`/tmp` 下新建会话，名字段无任何项目名，三个资源工具对 `probe-a`/`probe-b` 全被拒；
  ⑤ **profile 不受影响**：A/B/无归属三会话对 profile 级 probe 的名字可见、资源可读；
  ⑥ **动态刷新**：删 A 的配置 → A 下一轮名字更新、资源调用报不可用；`/mcp-reload` 后一致；
  ⑦ **回归**：既有工具面隔离冒烟表全绿；`session-tool-toggle` 面板与 `/tools off mcp:probe-a` 行为不变（面板仍显示项目名 = 已知边界）；
  ⑧ **PTC 双模式**：`run_code` 内层 `read_mcp_resource(server=probe-b)` 与原生调用同样被拒。
  **验证**：`test -s …/artifacts/smoke-record.md` 且 8 条各含一条「观察：」与「命令：」；第③条附 `diff <(…before) <(…after)` 为空。

### 5. 规范与文档（G5，3 项，可并行）

- **5.1** D1 spec delta：新建 `openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md`（ADDED `资源服务器名与资源面的隔离` + MODIFIED `工作区可见性隔离` `:105-132`、`隔离的动态刷新` `:134-151`）；场景必须覆盖：名字段隐藏越权项目名 / `mcp:<server>` 段被移除 / 无归属全隐 / profile 名保留 / 空数组删段 / 解析失败删段（降级）/ 资源三工具拒绝且不触达 / 参数异常交回上游 / active 与 claimed 口径差异 / 动态刷新 / 人类 UI 与全局注册层为残余边界。
  **验证**：`openspec validate --all` 退出码 0；`grep -c "^#### Scenario:" openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md` ≥ 10。
- **5.2** D2 插件 README：改写 `:152`（资源面已交付）、补三面行为 + `active`/`claimed` 口径 + 降级矩阵（无 `systemPrompt` / 无 `mcpResources` / 段格式漂移 / HMR 未跟踪会话 / agentless 调用）+ 残余边界（人类 UI、全局注册层、升级前历史）+ 回滚代价 + 冒烟证据表两列。
  **验证**：`grep -n "资源面" plugins/project-mcp/README.md` 命中且 `! grep -q "若需资源面隔离应另开提案" plugins/project-mcp/README.md`；`grep -n "active" plugins/project-mcp/README.md` 与 `grep -n "prompt: resource names" plugins/project-mcp/README.md` 均命中。
- **5.3** D3 根 `README.md:77` + `AGENTS.md:21` 一行描述追加「名字（资源服务器名与服务器指令段）与资源面隔离」。
  **验证**：`grep -n "资源面" README.md AGENTS.md` 两处命中。

### 6. 发布（G6，1 项，串行末位）

- **6.1** 版本按仓库统一流程（`pnpm release --dry-run` 复核 → `pnpm release <version>` → `lib/` 重建随提交）→ profile 以 link 重装并重启 → 复跑 G4-4.2 的第①②③条（触达：H1/H2/H3/H4 的产物 + D2 的版本/回滚段）。
  **验证**：`pnpm release --dry-run` 打印的版本与文件清单含 `lib/index.js`；`pnpm verify` 与 `pnpm dsh:check` 退出码 0；重启后 `docker exec dsh dsh plugin --profile web list | grep project-mcp` 显示新版本；`docker logs dsh | grep -c "prompt: resource names"` ≥ 1。

> 组数：**6 组**；每组任务数：G1=2、G2=4、G3=2(+1 条件)、G4=2、G5=3、G6=1 → 共 **14 项（+1 条件）**，全部满足「单组 ≤ 8」。
> **tasks.md 对齐**：落档时本组编号按 `## 1.` … `## 6.` 顺序对应（`## 1.` = G1 … `## 6.` = G6），任务号 `N.M` 原样保留；每任务描述末尾引用 ① 的 `H*/T*/D*` 条目编号，验证句照抄本节的「验证」。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（被证伪则回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 / 降级 |
|---|---|---|---|
| A1 | `context.agent` 在会话装配里总存在，且 `agent` 与 `scope` 是同一对象 | `dsh-agent/lib/index.js:291-297`、官方监听器读 `context.agent`（`dsh-working-directory/lib/index.js:48-52`） | 两者都缺 → 按未跟踪处理（`hidden = active`，全隐，安全方向）；若 `agent` 缺失但 `scope` 存在 → 我们**已**用 `scope` 兜底，无需改代码 |
| A2 | 未打标签的插件全局监听器收到**所有** scope 的装配 | `dsh-scope/lib/index.js:327-338`（`tag === undefined` → `return true`） | 若某版本只投递给已打标签的监听器 → 我们收不到事件 = 名字面静默失效。**验证**：G1-1.1 第④条 + 冒烟第①条；**降级**：立即上报（不能降级掩盖），必要时改为 `scopeTarget` 方式在 `agent.ctx` 侧注册（每个 agent 一份监听器，成本 × 会话数） |
| A3 | 一次装配里 `mcp-resource-servers` 与 `mcp:<server>` 段各最多一条 | `layers.merge` 按名字合并（`dsh-system-prompt/lib/index.js:363`） | 多段也只是逐个处理（防御已写进 `planNameFilter`），无功能影响 |
| A4 | 段文本形态 = 固定前缀句 + 句末 `JSON.stringify(字符串数组) + '.'` | `dsh-mcp-resources/lib/index.js:124-128` | 规则：解析失败 → 删段 + warn（D-4）；**升级 DSH 基线时把「G4-4.2 第①条仍通过」加入回归清单** |
| A5 | `execution.arguments` 在 guard 里可见且是已深冻结的 JSON 值 | `dsh-tools/lib/index.js:3259-3263`、`:3337`、types `:226-227` | 若 guard 看不到 arguments（某版本改成 dispatch 里才解析）→ 资源面**无法**按 `server` 判定。**验证**：G1-1.2；**降级**：不静默——立即上报，改走「deny 三个资源工具」这一不得以方案（会连带杀死 profile 资源能力，必须用户拍板） |
| A6 | PTC 内层 dispatch 经过同一 `prepareExecution`（因此过 guard） | `dsh-tools/lib/index.js:1364-1376`（子调用带 `agent`/`parent`/`arguments`）+ `:2767-2768`（`prepare` 入口） | 若绕过 → PTC 下资源面 fail-open。**验证**：G1-1.2 第 3 项 + 冒烟第⑧条；**降级**：上报并考虑追加一个**只**处理 `exec.parent !== undefined` 的 `tools/pre-execute` 兜底（会与 D-2 冲突，须用户拍板） |
| A7 | `mcp-manager.active` 的写入时点足够表达「已加载」 | `:160-173`（load 成功才 set）、`:186-189`（先删后 dispose） | 配置变更时 `reconcile` 先 `unload` 再 `load`（`:150-173`），所以 `active` 会有毫秒级缺项。此时 `!active.has(server)` 会让该服务器的**资源面判定直接放行**——但同一窗口里它的 provider/工具/`mcp:<server>` 段已随 fiber 一起被 dispose，调用只会得到上游 `unavailable in this agent's scope`，名字面也没有段可漏（见 6.2 第 4 条）。因此 A7 的失效形态是「短暂少拦一个**当期不存在**的服务器」，不是越权 |
| A8 | 项目 claim 与 profile 行同名时由 mcp-client 拒绝第二次预约（项目侧不进 active） | `dsh-mcp-client/lib/index.js:812-818` | 若某版本改成允许共存 → active 会含同名项目服务器，profile 同名资源在非本工作区会话被拒（误伤）。**验证**：冒烟第⑤条（profile 级 probe 在 A/B 均可读）；**降级**：README 记为已知误伤 + 上浮 |
| A9 | 无相关段的部署（无 `systemPrompt`/无 `mcpResources`）不会触发本模块任何端口读 | H1 的第 ② 步前置筛选 | 若该筛选失效 → 只是多一次空集构造与一次 `hidden.size === 0` 早返回，无功能影响 |
| A10 | `renderPrompt` 之外没有别的消费者依赖「MCP 名字段一定存在」 | `dsh-system-prompt/lib/index.js:117-119` + 全仓 `grep "mcp-resource-servers"` 只命中插件与上游 | 若某消费者（如会话归档/导出）要求段存在 → 影响是其展示少一段，不阻断装配；实施时用 `grep -rn "mcp-resource-servers"` 复核一次并记入 PR 说明 |

### 6.2 未决项与 spike 项（逐条：怎么验证 / 失败怎么降级）

1. **PTC 内层是否同管线**（G1-1.2 第 3 项；A6）。验证：`run_code` 内层调 `read_mcp_resource(server=probe-b)` 且 probe-b 日志零新增。失败降级：见 A6（上报 + 需用户拍板的兜底，不静默）。
2. **`system-prompt/assemble` 在非会话装配（无 `context.agent`）下的行为**（G1-1.1 第④条；A1）。验证：用一个无 agent 的装配请求（例如标题生成/摘要类装配若存在）观察监听器收到的 `context` 字段；或直接单测 `createAssembleListener` 传 `{}`。失败降级：按未跟踪处理（全隐），并在 `prompt:` 行写 `session=(none)`，便于事后确认「是谁被全隐了」。
3. **HMR / 插件重载后未跟踪 agent 的 fail-closed 表现**（对应 diff-matrix E9）。现状事实：`agent/created` 只对未来 announce 的 agent 触发（`dsh-agent/lib/types/index.d.ts:328-337` 的 `announce` 语义 + `index.ts:159`），因此「本插件加载前已存在的会话」不会被 attach：名字面因 `visibleFor → undefined` 而从下一次装配起**全隐**（fail-closed ✓），资源面**没有 guard**（该会话的资源调用不被拦截 = fail-open ✗）。验证：`hmr` 行替换本插件模块（或 `dsh plugin add` 后不重启直接继续旧会话）→ 发一次 `list_mcp_resources(server=<别工作区>)`，观察是否被拒 + `docker logs | grep "boot:"`。失败降级：**boot 观测行 + README 边界**（本蓝图默认实现），把「boot 追平 attach」列为条件任务 3.3 由待决 Q1 拍板；若最终采纳，需给 `attach` 加幂等守卫（同一 key 不重复装 guard/restrict）。
4. **provider 注册失败/重连后的 active 时序**（对应 line-a R14）。验证：改坏一台 probe 的配置触发 reload（或 kill 子进程走重连退避），期间在会话里调它的资源、看名字段与 `isolation:`/`prompt:` 行。预期：调用得到上游 `unavailable in this agent's scope`（fiber 已 dispose），窗口过后资源恢复、越权判定照旧。失败降级：若观察到窗口内**别工作区**服务器仍可被读到（即 provider 在、active 却缺项）→ 立即上报（那是 mcp-client 的重注册时序与 `loader.load` 语义不一致，A7 需重写）；README 记录窗口行为。
5. **子代理会话的归属与 `agent/created`**。验证：父会话派生子代理（subagent），在子代理里问名字段 + 调资源；确认按其 `header.cwd` 归属。失败降级：若子代理的 `header.cwd` 与父不同（例如在 `/tmp`），它会按无归属全隐（安全方向），README 记为行为差异。
6. **agentless 资源调用**（`exec.agent === undefined`）：per-agent guard 不参与（`dsh-tools/lib/index.js:3027`）。这是**已知边界**（非模型可触发；模型调用总在 agent 内）。验证：静态读代码 + 单测里传 `agent` 缺失的对象。降级：README 边界段明确「本隔离不覆盖进程内其它插件对资源工具的直接调用」。
7. **`interpolate` 丢失的回归风险**。验证：单测断言改写后的段仍 `interpolate === false`（T1）；冒烟里让 probe 的 instructions 含一段 `{{not-a-variable}}`，确认过滤后不抛错。降级：无（D-5 已消除该风险，测试是防回归）。
8. **三 profile 一致性**：`web`/`acp`/`headless` 均含 `dsh-base`（E11）。验证：三个 `--dump-config-schema` + web 全量冒烟；acp/headless 至少验证装载与一次名字面。降级：若某 profile 无 `systemPrompt`，本插件静默跳过（A9）。

---

## 待决问题（六字段之外）

### Q1（P1，影响 G3 是否含第 3 项与 spec 场景）HMR/重载后「已存在会话」的资源面缺口怎么处置

- **问题**：`agent/created` 只对未来 announce 的 agent 触发，本插件加载前已存在的会话不会被 attach。名字面自动 fail-closed（`visibleFor → undefined`），但资源面**没有 guard = fail-open**。这与 diff-matrix E9「HMR 后未跟踪 agent → fail-closed 方向安全」的表述只对名字面成立。
- **选项**：
  - **A（推荐）** v1 只加 boot 观测行 + README 边界：`boot: N session(s) predate this load; …`，让运维一眼看到缺口；不改 attach 行为。
  - B 追加 boot 追平（`ctx.get('agents')?.list()` 逐个 `attach`，`attach` 加幂等守卫）→ 条件任务 3.3；顺带把工具面也补挂到这些会话（**会改变既有工具面行为**，超出本变更既定范围）。
  - C 追加全局 `tools/pre-execute` 兜底（**推翻 D-2**，两套闸门维护同一策略）。
- **推荐**：**A**（缺口窗口只在「不重启的 HMR」场景；profile 常态安装是重启 → 会话全新建；B 会把纯安全修复拖成行为变更，C 自相矛盾）。若主会话认为 HMR 是实际运维路径，则选 B 并单独说明工具面连带变化。
- **影响面**：G3 任务数 2→3；spec 是否加「插件重载后既有会话」场景；README 边界条目。

### Q2（P2，纯事实上浮，不阻塞实施）工具面既有 claimed 口径在「profile 同名 + 项目 claim 加载失败」时会误伤 profile 服务器

- **问题**：`deriveDeny` 用 claimed `managedServerNames()`（`isolation.ts:127-139`、`:340`）。若 A 工作区定义的 `figma` 因与 profile 的 `figma` 撞名而加载失败（`dsh-mcp-client/lib/index.js:812-818`），其名字仍在 claimed 集合里 → **B 会话**（不存在 figma）会把 profile 的 `mcp__figma__*` 判为越权并 deny。这是**既有行为**，本变更不改工具面（既定非目标），但资源面刻意用 active 正是为了不复制这个缺口（D-3）。
- **选项**：**A（推荐）** 记为独立 follow-up（单独 change 把工具面 deny 候选集改成 active 或「active ∪ 仍在注册表中的 carried 名字」）；B 本变更顺带修（违反「工具面不动」的既定边界，需重跑工具面冒烟）。
- **推荐**：**A**（本变更范围已冻结；且修它需要新的工具面回归矩阵）。
- **影响面**：A 零改动（只在 README/后续 change 记录）；B 会改 `deriveDeny` 语义与 6 条既有单测。

### Q3（P2，影响 2 条断言文本）资源 deny 文案是否接受「不含服务器名」

- **问题**：`RESOURCE_DENY_REASON = "MCP resource server is not configured for this session's workspace"` 不含被拒服务器名（D-14/E6），比工具面文案更模糊。
- **选项**：**A（推荐）** 采用该文案（安全优先；模型重试只会得到同一拒因）；B 保留服务器名（便于模型自我纠正，但把名字泄漏回去）；C 名字放进 `error.info` 而非 message（`dsh-tools/lib/index.js:3348-3350` 支持 `info`，只进日志/结构面）。
- **推荐**：**A**（`info` 对模型是否可见取决于呈现层，不值得为此增加不确定性；且验收断言要能写「deny 文本不含 probe-b」）。
- **影响面**：A/B/C 只影响一条常量与两条断言；B 会破坏「名字面隔离」的验收口径。

### Q4（P3，影响日志信噪比）「前 5 次全量 + 形状变化」的限流是否够用

- **问题**：多会话并行时第 6 个会话起的同形过滤不再留行（D-6）。
- **选项**：**A（推荐）** 保持现口径；B 每次会话首次过滤都打一条（按 session 去重，内存上限 N）；C 改为每次打 `debug`（需扩 `ScanLog`）。
- **推荐**：**A**（冒烟/验收都在前 5 条内，且形状不同的会话必定各留一条）；若实施中发现排障困难，再按 B 增一个「按 session 首见」的小 Map（上限 32）。
- **影响面**：只影响日志，不影响行为与 spec。

### Q5（P3，影响 spec 场景）是否把「升级前已进入会话历史的名字不可清除」写进 spec 场景

- **问题**：diff-matrix §6 残余边界已含此项（E12），但 spec 是否要一条显式 Scenario 未定。
- **选项**：**A（推荐）** 写一条 Scenario（「升级前历史会话中已出现的名字不追溯」）；B 只写 README。
- **推荐**：**A**（验收方最常问的就是「为什么旧会话里还能看到」）。
- **影响面**：spec 多一条 Scenario；无代码影响。

---

## 附：验证映射总表（每条 = 一条可执行命令或一条可断言事实）

| 需求/验收点 | 验证载体 | 具体命令或断言 |
|---|---|---|
| 名字段隐藏越权项目名（G1） | `test/prompt-isolation.test.ts`（T1）+ 冒烟① | `planNameFilter([...], hidden).sections` 中名字数组不含 hidden；A 会话自述名字不含 `probe-b` |
| 名字段解析失败 fail-closed（Q5） | T1 | `rewriteResourceNames('garbage', …)` → `{kind:'unparsable'}`；`planNameFilter` 输出 `unparsable:true` 且该段被删 |
| 空数组 → 删整段（E5） | T1 | `rewriteResourceNames('… ["a"].', new Set(['a']))` → `{kind:'empty'}`；plan 不含该段 |
| profile 名保留（Q3） | T1 + T2 + 冒烟⑤ | `hidden` 不含 profile 名时数组逐字节不变；`resourceGuardReason('list_mcp_resources', {server:'codebase-memory'}, new Set(['probe-a']), new Set())` === `undefined` |
| `mcp:<server>` 指令段被移除（E1） | T1 + 冒烟①（`grep -c "### MCP server: probe-b"` = 0） | plan 的 `removedSections` 含 `mcp:probe-b`；非目标段名字不变 |
| `interpolate` 保留（D-5） | T1 | `expect(rewritten.interpolate).toBe(false)` |
| 未跟踪 agent / 无 `context.agent` 全隐（E8） | T1 + 冒烟④ | 假 ports 的 `visibleFor → undefined` → 所有项目名被移；`/tmp` 会话名字段无项目名 |
| 端口异常 / 解析异常 over-hide（D-11） | T1 | 假 ports 抛错时返回的 sections 不含任何 `mcp:` 段 |
| 零改动零日志（R12） | T1 | 连续 6 次同形状 → `infos.length === 1`；无相关段 → 端口读次数 0 |
| 资源三工具拒绝越权且不触达（G2/E6） | T2 + 冒烟③ | 三工具均返回 `RESOURCE_DENY_REASON`；`reason` 不含服务器名；probe-b 请求日志行数不变 |
| 参数异常交回上游（R3/R8） | T2 | `arguments` 为 `undefined`/`null`/`'s'`/`[]`/`{}`/`{server:1}` → `undefined` |
| 参数形态在原生与 PTC 下都可见（U4） | G1-1.2 + 冒烟⑧ | PTC 调用记录里 `arguments.server === 'probe-b'`；`run_code` 内层同被拒 |
| active vs claimed 口径（二.2/E16） | T2 + T3 | `resourceGuardReason` 对「claimed 有、active 无」的服务器返回 `undefined`；manager 断言「失败集 = claimed \ active」 |
| 可见集读数（G4） | T2 | `visibleFor(unknown) === undefined`；`refresh()` 后同名 key 的集合按新扫描更新 |
| 三面同源同刷新（G4） | 冒烟⑥ | 删配置 → 下一步名字消失 + 资源调用不可用；`/mcp-reload` 后一致 |
| 缺 `systemPrompt` 软降级 | G2-2.4/3.2 的 typecheck + 代码审阅 | `index.ts` 的 `inject` 仍只有 `['workspaceRegistry','tools']`；`! grep -rn "@deepseek-ai/dsh-system-prompt" plugins/project-mcp/src plugins/project-mcp/package.json`（零引用 = 无硬依赖） |
| 产物纯度（不引上游运行时依赖） | G4-4.1 | `! grep -qE "^import .*@deepseek-ai" plugins/project-mcp/lib/index.js` |
| 单测/类型/构建/文档门禁 | G4-4.1、G5 | `pnpm --filter dsh-plugin-project-mcp verify:all`、`pnpm dsh:check`、`openspec validate --all` 全部退出码 0 |
| 人类 UI 仍可见项目名（残余边界 N2/Q2） | 冒烟⑦ | `session-tool-toggle` 面板 `shadowed` 行仍含项目名（**预期**，断言为「行为不变」） |

---

*本文件只写代码级蓝图：未修改仓库任何文件、未改 `openspec/`、未 git add/commit、未读取或等待其他子代理产物；与 `diff-matrix.md` 的冲突已全部改为「上浮待决」（Q1/Q2）而非重开收敛。*

---

# 落档决议（权威覆盖，2026-11-02 用户拍板）

> 本节覆盖上文「待决问题 Q1–Q5」及与之相关的设计细节（§3.4/§3.7、D-3/D-14/D-15、附录验证表两行）；与上文冲突时**以本节为准**，上文保留为设计过程留痕。

## R-1 Q1 = A：HMR/重载后存量会话不做 boot 追平

- 不新增 boot 追平 attach；条件任务 **G3-3.3 取消**（G3 固定 2 项，总任务 14 项固定）。
- 保留 §3.5 的 boot 观测行（`agents.list().length > 0` → 一行 info）与 README 边界：名字面从下一次装配起 fail-closed；资源面在下一个 `agent/created` 前无守卫（仅「不重启的 HMR」场景）。
- spec 不承诺 boot 追平；README「已知限制」列明。

## R-2 Q2 = B：本变更顺带修工具面口径 → **三面统一 `blocked = claimed \ failedClaims`**

- **取消纯 active 口径**（原 H3 `activeServerNames()` 不再存在）。理由：`mcp-client` 的 provider 在 `connection.ready` 之前就注册（`registerServerContext` 紧随 `startConnection`，`lib/index.js:721-743`），而 `mcp-manager.active` 在 `loader.load()` resolve 后才写入（`:160-173`）→ 纯 active 在「工具已注册、active 未写」窗口内会 **fail-open**（别的会话可短暂看到/调用该服务器工具）。`claimed \ failedClaims` = active ∪ 加载中，既保留既有窗口保护，又剔除「加载失败的 claim」。
- **`mcp-manager.ts`（H3 修订）**：
  - 新增 `private readonly failedClaims = new Set<string>()`；
  - `reconcile()` 维护：加载成功或 `unchanged` 的 name 从集合删除；`catch` 分支（`failed`）的 name 加入；扫描集中已消失的 name 删除；`dispose()` 清空；
  - 新增 `blockedServerNames(): ReadonlySet<string>` = 声称集 − `failedClaims`；新增 `failedServerNames(): ReadonlySet<string>` 供诊断/单测；
  - `managedServerNames()`（claimed）与 `serverNamesForRoots()`（visible）**语义不变**（前者供诊断与「配置声称」口径，后者仍是 `visible` 来源）。
- **`isolation.ts`（H2 修订）**：`IsolationPorts.managedServerNames()` → 改为 `blockedServerNames()`；`deriveDeny(registered, blocked, visible)`、`guardReason(name, blocked, visible)`、`carried` 过滤、retry 分支、`resourceGuardReason(toolName, args, blocked, visible)` 全部统一 blocked；`visibleFor` 不变。三面共用同一 `blocked` 与同一 `visible`。
- **`prompt-isolation.ts`（H1 修订）**：`hiddenServers(blocked, visible)`；`PromptIsolationPorts.blockedServerNames()`。
- **`index.ts`（H4 修订）**：`IsolationLayer` 与监听器 ports 均传 `(): manager.blockedServerNames()`；`ctx.get('agents')` 观测行不变。
- **验证断言修订**（覆盖附录表「active vs claimed 口径」行）：
  - `deriveDeny` / `guardReason` / `resourceGuardReason` 对「claimed 有、加载失败（failed）」的服务器返回 `undefined` → profile 同名不被误伤；
  - 对「claimed 且加载中（未 failed）」仍拒绝/隐藏（保留窗口保护）；
  - T3：`failedServerNames()` 恰为本次失败集；`blockedServerNames()` = 声称集 − 失败集；加载成功/卸载/移出扫描后相应消失；
  - T2 新增：项目 claim `probe-shared` 与 profile `probe-shared` 撞名 → 项目加载失败 → profile 的 `mcp__probe-shared__*` 工具不被 deny、资源调用不被拒。
- **spec 影响**：MODIFIED `工作区可见性隔离` 增口径条款与同名场景（见 R-5）。**纯 claimed（现状）被否** = 即 Q2 缺陷；**纯 active 被否** = 上述窗口 fail-open。

## R-3 Q3 = B：资源 deny 文案保留服务器名，但与上游 unavailable **逐字同形**

- 改为 `resourceDenyReason(server)` 返回 `MCP resource server "<server>" is unavailable in this agent's scope`（与 `dsh-mcp-resources/lib/index.js:174-177` 同形）。
- 取消 D-14 的「不回显名字」，改为「**与上游同形**」原则：模型无法用文案区分「被隔离」与「不存在」→ 无存在性 oracle；日志照记。
- 断言修订（覆盖附录表「资源三工具拒绝越权…`reason` 不含服务器名」行）：断言 `reason` 与「对不存在 server 调用得到的上游错误文本」**逐字相等**。

## R-4 Q4 = A / Q5 = A

- 日志限流保持「前 5 次全量 + 形状变化」；`unparsable` warn 前 3 次（不变）。
- spec ADDED 需求内增 Scenario：「升级前已进入会话历史的名字不追溯」。

## R-5 任务与工件影响汇总（相对上文）

- 任务数与分组（按执行批次契约重排后）：**7 组 / 12 项** —— G1=2、G2=3、G3=1、G4=1、G5=1、G6=3、G7=1。重排原因：`index.ts` 接线与 `isolation.ts` 端口改名互为前置、监听注册依赖监听器层、冒烟依赖构建产物——这些任务各自单独成组（或与同批文件合并进同一任务），保证「组内任务互不依赖且不写同一文件 / 组末 `typecheck` 绿」。
- G2-2.2 扩大：`deriveDeny`/`guardReason`/`carried`/retry/`resourceGuardReason` 全部 blocked 口径 + `resourceDenyReason` 同形文案；同任务内完成 `index.ts` 构建接线；T2 增加 blocked 与同名场景。
- G2-2.3 扩大：`failedClaims` 维护 + `blockedServerNames()` + `failedServerNames()`；T3 增加「失败集 = 声称 − blocked」断言。
- G5-5.1 冒烟：第③条改为「reason 与上游 unavailable 同形」；新增第⑨条「项目 claim 与 profile 同名加载失败 → profile 工具与资源均不被误伤」（fixture 用 `probe-shared`）。
- D1 spec：ADDED 增历史不追溯 Scenario；MODIFIED `工作区可见性隔离` 增「仅隔离已声称且未加载失败的项目服务器 / 加载失败 claim MUST NOT 影响同名非项目服务器」条款与场景；MODIFIED `隔离的动态刷新` 扩三面（工具面含 blocked 口径）。
- D2 README：增加「工具面口径修正（claimed → claimed\failed）」一条与 HMR/agentless 已知限制。
