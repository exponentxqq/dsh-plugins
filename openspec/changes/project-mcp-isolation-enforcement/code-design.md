# 代码级蓝图（阶段 1.7）— project-mcp 隔离「执行层穿透」的补挂与全局守卫

> **本文件是代码级蓝图**：触达哪些文件、怎么改、接口与数据形状、为什么这么定。
> 需求级结论（目标/非目标、范围边界、风险与验证策略）已由 `explore.md`（7 字段）与 `decisions.md`（D1–D3）收敛，**本文不复读**；本文只把已定结论翻译成可施工的代码形状。
> 输入已逐字读全：`prompt.md`（140 行）、`explore.md`（96 行）、`decisions.md`（48 行）。D1=A+B、D2=agentless fail-closed、D3=teardown 维持现状，**不重开**；本文只在代码层落实它们，遇矛盾上浮到文末「待决问题」。
> 事实基线：根仓 `dsh-plugins` @ `c8fded0`；目标子包 `plugins/project-mcp`（version 1.5.0，`main: lib/index.js`）。上游 dsh **0.2.1-rc.5**（`/usr/local/lib/node_modules/@deepseek-ai/dsh/`，`scripts/dsh-baseline.mjs:13` 同值），源码即运行码，**只读参考、不列入触达面**。
> 行号口径：插件侧以当前工作区 HEAD 为准（同一文件改动后行号会漂移，落档以「函数名 + 关键片段」定位）；上游侧以 rc.5 安装产物为准。
> 工作区另有**非本变更**残留（根 `README.md` 已修改等），任何提交须逐路径 add。
> `dsh-plugin-writer`：**豁免**（用户 2026-11-05 确认：本次是既有插件的行为逻辑修改，落在 writer 声明适用面之外）。依据与影响留痕于 **CD-0**，本文未加载任何 writer skill。

---

## ① 触达面清单

**仓归属**：本设计全部落在**根仓 `dsh-plugins`**，源码/测试/产物/文档都在子包 `plugins/project-mcp/`；上游 dsh 源码只读参考，**不列入**本表；`openspec/` 由主会话落档（本设计不写）。

标注法：`根仓·plugins/project-mcp/<路径>`；新建文件在「文件」列标 **新建**。

### 1.1 宿主源码（子包 project-mcp）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| H1 | `根仓·plugins/project-mcp/src/host/isolation.ts` | 导出**全局守卫判定**（纯函数）+ 扩展 `GuardedExecution` + **attach 幂等** + `isTracked` 读面 | ① `GuardedExecution` 增 `readonly agent?: object`（只取身份，不引 `Agent` 类型，isolation.ts:76-85）；② 抽 `toolDenyReason(toolName, server)`（现 L221 文案内联，改由 `guardReason` 调用）；③ 新增 `GlobalGuardReading` / `GlobalGuardDecision` / `globalGuardDecision(execution, blocked, visibleFor)`（判定表见 ③3.2）；④ `IsolationLayer` 增 `private attaching = new Map<object, Promise<void>>()`、`isTracked(key)`，`attach` 变「in-flight join」（同 key 的第二次调用加入第一次，不装第二份 guard/restriction）；⑤ 模块注释增「全局面」一段（三面 → 四面：工具/名字/资源/**全局闸口**） |
| H2 | `根仓·plugins/project-mcp/src/host/boot-sweep.ts`（**新建**） | 启动补挂的**可单测**编排：枚举存活 agent、按「未跟踪才挂」逐个补挂、记账与诊断 | 新增 `SweepCandidate` / `SweepPorts` / `SweepSummary` / `sweepLiveSessions(candidates, ports)`；串行执行、逐条 catch、`live>0` 时打一条汇总行（形状见 ③3.4/3.6）。**不含**任何 cordis/Agent 类型，只吃 `key`/`id`/`attach()`——沿用本包「窄端口 + 纯逻辑可单测」的既有分层 |
| H3 | `根仓·plugins/project-mcp/src/host/index.ts` | 装配：`inject` 增 `agents`；**apply 即装全局守卫**；`agent/created` 与启动补挂共用 `attachAgent`；boot 顺序改为「归属 → 补挂 → 首扫」；teardown 显式收守卫 | ① `export const inject = ['workspaceRegistry', 'tools', 'agents']`（现 L51）；② 构造 `isolation` 后**立刻**注册 `ctx.tools.guard(...)`（落 global 层，随 fiber 卸载），内注 `manager.blockedServerNames` / `isolation.visibleFor`；③ 抽 `async attachAgent(agent)`：`!isTracked` 才 `agent.ctx.effect(detach)`，随后 `isolation.attach(...)`；④ `agent/created`（L163-176）改调 `attachAgent`（返回 promise 的契约不变）；⑤ 删「predate 放任」块（L248-259），改为 `boot()`：`await attributor.update(workspaceRoots(ctx))` → `sweepLiveSessions(...)` → `await rescan()`；⑥ teardown（L229-234）加 `globalGuard?.()`；⑦ 文件头注释的 7 条排列改为 8 条（补挂 + 全局闸口） |

### 1.2 测试（子包 project-mcp）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| T1 | `根仓·plugins/project-mcp/test/isolation.test.ts`（现 636 行 / 34 用例） | 补**全局守卫判定**与 **attach 幂等**用例 | 沿用 `fakeTools()`（L41-79，记录 restrictions/guards，`visibleNames` 会滤掉已 mask 的名字）与 `ports()`（L82-92）；新增两组 describe（用例名与断言见 ⑤ G1/G4）；现有用例**一字不改** |
| T2 | `根仓·plugins/project-mcp/test/boot-sweep.test.ts`（**新建**） | 启动补挂的补挂/跳过/失败/静默/串行序 | 纯 fake：candidates 数组 + `isTracked` 集合 + `recordingLog()`；断言 `SweepSummary` 与日志行（见 ⑤ G2） |

### 1.3 产物（子包 project-mcp，**入库**）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| H4 | `根仓·plugins/project-mcp/lib/index.js`（`git ls-files` 已跟踪，当前 313905 B） | 重建产物 | `pnpm --filter dsh-plugin-project-mcp build`（esbuild，`build.mjs`）；web profile 是 `link:` → 本仓子包（`/home/docker/.dsh/profiles/web/package.json:38` 实测），**不重建则实机看不到任何变化**。产物需含 `boot: swept` 且不含 `predate this load` |

### 1.4 文档（子包 project-mcp）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| D1 | `根仓·plugins/project-mcp/README.md` | 「三面隔离」「降级矩阵」「排障」同步到新语义 | ① L59「工具面两层强制」→**三层**（restriction / per-agent guard / **全局闸口**）；② L69 同段补全局闸口一句；③ L74 诊断行：`boot:` 文案换成 `boot: swept …`，补全局守卫 warn 行；④ **L94-95 两行降级矩阵必须改**（现文把 bug 写成「已知 fail-open 窗口」）；⑤ L62/L99 各补一句（重载补挂、回滚代价含全局闸口）。历史冒烟记录表（L108 起）**不重跑**，只加注（见 P3） |

### 1.5 落档（主会话执行，本设计不写）

| # | 路径 | 说明 |
|---|---|---|
| S1 | `根仓·openspec/changes/project-mcp-isolation-enforcement/{proposal,design,tasks,diff-matrix,decisions,code-design}.md` + `specs/dsh-project-mcp/spec.md` | 本文件落档副本；spec delta 建议口径见 ⑤ G7 |

### 1.6 明确不改（核实后判定，避免误伤）

| 文件 / 面 | 为什么不改 | 证据 |
|---|---|---|
| `src/host/prompt-isolation.ts` | 名字面已对 untracked fail-closed（`visibleFor` 为 undefined → 隐全部 blocked 名），本次不动 | prompt-isolation.ts:466、:498、:529 |
| `src/host/mcp-manager.ts` | `sync()` 已在**任何 await 之前**写入 `scanned`（隔离层读它），`blockedServerNames()` 纯读；全局守卫直接复用 | mcp-manager.ts:110-111、:202-206 |
| `src/host/attribution.ts` / `roots.ts` / `scan.ts` / `watcher.ts` / `triggers.ts` / `plugin-loader.ts` | 归属、根集合、扫描、监听、触发、加载全不动；补挂只**复用** `attributor.update` 与 `serverNamesForRoots` | attribution.ts:47-96；roots.ts:24-38 |
| `src/host/isolation.ts` 的 `deriveDeny` / `guardReason` / `resourceGuardReason` / `reconcile` | 判定语义零变化：全局守卫**调用同一批函数**，不新增第二套规则 | isolation.ts:193-205、:214-222、:262-272、:478-523 |
| `package.json`（版本）/ `cordis.patch.yml` / `build.mjs` / `vitest.config.ts` | 不发版、不新增配置键、不改构建与测试口径 | package.json:4、:10；cordis.patch.yml:12-14 |
| 上游 dsh 源码 | 只读参考；本次结论是「插件侧可闭环」 | explore.md 第三节；本文件 ②2.2 |
| `plugins/session-tool-toggle/**` | 它的 per-agent 守卫同样随 scope 生效，与本次闸口正交（同一 agent 上两条 monotonic 守卫，任一命中即拒） | session-tool-toggle/src/host/index.ts:133、:676 |
| dotfiles 仓 | 本变更不涉及 profile 侧配置 | — |

---

## ② 证据锚

### 2.1 插件侧现状（逐条 file:line）

| 面 | 事实 | 位置 |
|---|---|---|
| 唯一挂载点 | `agent/created` → `isolation.attach(key, cwd, scopedTools(agent.ctx, key))`，detach 挂 `agent.ctx.effect` | index.ts:163-176（:166-168、:169-175） |
| 失守点 | 插件加载时**已存活**的会话不会收到 `agent/created`，旧代码只打一行日志放任 | index.ts:248-259（:254-259） |
| teardown 主动拆 | `ctx.effect` 里 `isolation.dispose()` → 逐 agent `detach` → `lift` restriction | index.ts:229-234；isolation.ts:441-443、:401-406、:637-646 |
| per-agent guard | `tools.guard(fn)` 装在 **agent 自己的 ctx** 上，闭包读 `tracked.visible` 与 live `blockedServerNames()` | isolation.ts:382-389（:382、:385-388） |
| guard 只取 name/args | `GuardedExecution` 现在**没有** `agent` 字段，全局守卫无法判断调用者 | isolation.ts:76-85 |
| 守卫未被显式拆 | `Tracked.guard` 只赋值、`lift()` 只 lift restriction（守卫随 agent scope 卸载） | isolation.ts:168、:382、:637-646 |
| 拒绝文案 | 工具面：`tool ${toolName} belongs to MCP server ${server}, which is not configured for this session's workspace` | isolation.ts:221 |
| 资源文案 | 与上游逐字同形：`MCP resource server "<server>" is unavailable in this agent's scope` | isolation.ts:68-70；dsh-mcp-resources/lib/index.js:176 |
| 三读数合并 + diff 守卫 | `recompute` 取 global/scoped/carried 并集推导 deny，集合不变即 no-op（防自激） | isolation.ts:478-523（:485-501） |
| mask 日志 | `isolation: masked N tool(s) …`（**这正是被穿透时也照打的那行**） | isolation.ts:588-601（:592） |
| 诊断行 | `isolation: cwd=… roots=N visible=[…] global=… scoped=… carried=… deny=N […]` | isolation.ts:617-631 |
| 端口事实源 | `blockedServerNames()` = claims − failedClaims；`serverNamesForRoots()` 走 claim 读法 | mcp-manager.ts:202-206、:164-168 |
| 名字面 fail-closed | untracked 装配 → 隐全部 blocked 名；无归属会话建模为「已跟踪、visible 空」 | prompt-isolation.ts:466、:498、:529；isolation.ts:481-483 |
| 日志出口 | `scanLog` 同时写 `ctx.logger` 与 console（web profile boot 后无 logger exporter） | host-io.ts:63-79 |
| 装配入口 | `apply(ctx)` 顺序：isolation → agent/created → tools/change → triggers → commands → teardown → assemble → boot 日志 → `background()` | index.ts:88-261 |
| 产物即运行面 | `main: lib/index.js`；web profile `"dsh-plugin-project-mcp": "link:/home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp"` | package.json:10；`/home/docker/.dsh/profiles/web/package.json:38`（本轮实测） |

### 2.2 上游机制锚（dsh 0.2.1-rc.5，只读）

| 事实 | 位置 |
|---|---|
| `tools.guard()` 用**调用方 ctx** 决定层：`layers.effect(this.ctx, …)`，`notify:false`（不触发 `tools/change`） | dsh-tools/lib/index.js:3017-3022 |
| `guardReason` **先读 global 层**，再按 `exec.agent` 的 scope 链；`exec.agent === undefined` 时只判 global | dsh-tools/lib/index.js:3024-3031 |
| `restrict()` 无 scope 直接抛（「a context-global restriction would mask every agent」）——反证 guard 可以全局 | dsh-tools/lib/index.js:2992-2993 |
| 作用域归属判定：`scopeOf(ctx)` 无 tag → 落 `this.global` | dsh-scope/lib/index.js:187-195（:190、:195） |
| 服务方法里的 `this.ctx` 被重绑为**调用方 context**（traceable） | cordis/lib/index.js:117-128（:128 `if (prop === tracker.property) return ctx`） |
| guard 在 dispatch 之前执行，拒绝渲染为 `Error: <reason>`（`isError:true`） | dsh-tools/lib/index.js:3337-3353 |
| `ToolExecution.agent` 由调用方填入；`createExecution` 原样带出 | dsh-tools/lib/types/index.d.ts:216-243（:229）、:282-286；dsh-tools/lib/index.js:3227-3246 |
| 模型直调的每次 exec 都带 `agent = ctx.agents.requireInitiator()` | dsh-agent-loop/lib/index.js:506-518（:507、:514） |
| PTC 内层派发复制外层 `agent` 并带 `parent` | dsh-tools/lib/index.js:1374-1375 |
| agent 对象即 scope key：`createScope(loopCtx, this); this.ctx = this.scope.ctx` | dsh-agent-loop/lib/index.js:778-779 |
| 工具面来源：`systemPrompt.tools((context) => this.wireSchemas(context.scope))`；装配 `scope = agent` | dsh-tools/lib/index.js:2802、:2932；dsh-agent/lib/index.js:291-297 |
| `agents` 服务与 `list()` | dsh-agent/lib/index.js:332；dsh-agent/lib/types/index.d.ts:355-357 |
| `agent/created` 串行且监听器返回值被 await；`agent/disposed` 是 emit 且作用域过滤 | dsh-agent/lib/types/runtime-types.d.ts:227-231、:241-243 |
| Agent 形状：`readonly session` / `readonly ctx` | dsh-agent/lib/types/runtime-types.d.ts:139-149 |
| 插件 apply 返回 promise 会被 fiber 等（`"then" in effect → effect.then(...)`） | cordis/lib/index.js:1142-1145 |
| `ctx.inject(deps, cb)` 是「起一个子插件、等依赖就绪」 | cordis/lib/index.js:1600-1608 |
| 资源三件套：`server` 参数 **required**，且 `request()` 按 server 名解析 provider（无「列全部」模式） | dsh-mcp-resources/lib/index.js:32-40、:173-177 |
| 资源三件套注册层：`registerTools(scope)`，provider 未绑定 scope 时 `toolCtx = selfCtx`（**global 层**） | dsh-mcp-resources/lib/index.js:161-171 |
| `agents` 在 base 层、`workspaceRegistry` 只在 web-app 层 | dsh-base/cordis.patch.yml:83；dsh-web-app/cordis.patch.yml:92 |
| 上游没有别的工具执行入口（`prepare`/`execute` 仅 agent-loop） | 全包 grep `TOOL_RUNTIME_SCHEDULER`/`tools.execute(` 仅 dsh-agent-loop/lib/index.js:570、:582、:586 |

### 2.3 仓内先例（可照抄的形状）

| 事实 | 位置 |
|---|---|
| 兄弟插件已有同款「启动补挂」：`ctx.agents.list()` → 逐个 `mount(agent)`，失败逐条记日志 | session-tool-toggle/src/host/index.ts:897-911 |
| 硬注入 `agents`（agent 注册表是生命周期 + 补挂的前提） | session-tool-toggle/src/host/index.ts:133 |
| 从外部 fiber 给 **agent 自己的 ctx** 注册生命周期 effect（本文 `attachAgent` 同形） | user-commands/src/host/index.ts:164-165；session-tool-toggle/src/host/index.ts:676 |
| `agent.session.header.cwd` 为可选，缺失按无归属处理 | user-commands/src/host/index.ts:327、:207 |

### 2.4 测试 / 产物 / 文档锚

| 面 | 事实 | 位置 |
|---|---|---|
| 测试夹具（隔离层） | `fakeTools()` 记录 restrictions/guards/lifted，`visibleNames()` 会滤掉已 mask 的名字；`ports()` 给端口默认值 | test/isolation.test.ts:41-79、:82-92 |
| 既有 guard 用例形状 | 「每 agent 恰一份 guard，refresh 不重装」——attach 幂等用例的邻接断言 | test/isolation.test.ts:245-257、:531-543 |
| 测试无 cordis 依赖 | 所有测试文件只 import `../src/host/*.ts` 与 `vitest`，没有任何 `apply()` 级假 ctx | test/isolation.test.ts:10-23；`ls test/` 8 个文件同形 |
| 产物现状（待替换） | `lib/index.js` 仍含 `boot: ${live} session(s) predate this load; …` | lib/index.js:8602（313905 B，`git ls-files` 已跟踪） |
| 文档现状（待改） | 「工具面两层强制」/「诊断 boot 行」/ 降级矩阵两行 | README.md:59、:74、:94-95 |

### 2.5 新建文件

- `src/host/boot-sweep.ts` — **新建**（无既有实现；形状参照 2.3 的 session-tool-toggle 补挂 + 本包 `triggers.ts` 的窄端口风格）。
- `test/boot-sweep.test.ts` — **新建**（本包现有测试按模块 1:1，`index.ts` 无 apply 级测试）。

---

## ③ 接口与数据形状

### 3.1 决策链（before → after）

```
before: agent/created ──attach──▶ IsolationLayer(per-agent guard + restriction)
        （已存活 agent 永不进入；插件重载时旧层 dispose 拆 restriction）

after:  apply 首帧 ──ctx.tools.guard──▶ GLOBAL 层闸口（fail-closed 兜底，随 fiber 卸载）
        agent/created ─┐
        boot sweep ────┴─ attachAgent() ─▶ IsolationLayer(per-agent guard + restriction)
        （两条路同一函数；同 key 第二次调用 join 第一次，不装第二份）
```

### 3.2 `isolation.ts`：新增/变化的导出形状

```ts
/** The refusal reason for one out-of-scope MCP tool call. */
export function toolDenyReason(toolName: string, server: string): string {
  return `tool ${toolName} belongs to MCP server ${server}, which is not configured for this session's workspace`
}

/** The slice of a tool call a guard reads (a subset of the upstream `ToolExecution`). */
export interface GuardedExecution {
  readonly name: string
  readonly arguments?: unknown
  /**
   * The calling agent's scope key, when the host attributed the call. The layer
   * only needs the identity: `IsolationLayer` keys its tracked agents by it.
   */
  readonly agent?: object
}

/** Which reading produced a global-guard denial (diagnostics only; never the text). */
export type GlobalGuardReading = 'agentless' | 'untracked' | 'tracked'

/** What the global guard decided. */
export type GlobalGuardDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string; readonly reading: GlobalGuardReading }

/** No project server is visible: the fail-closed reading of an untracked agent. */
const NO_SERVERS: ReadonlySet<string> = new Set()

/**
 * The decision of the global (plugin-context) guard.
 * @param execution - the call, including the calling agent when attributed.
 * @param blocked - live reader; called ONLY for an MCP-namespaced name (a thunk,
 *   because this runs for every tool call in the process).
 * @param visibleFor - live per-agent visible set; `undefined` means untracked.
 */
export function globalGuardDecision(
  execution: GuardedExecution,
  blocked: () => ReadonlySet<string>,
  visibleFor: (key: object) => ReadonlySet<string> | undefined,
): GlobalGuardDecision
```

**判定表（行序即实现顺序；前四行不读任何端口）**

| # | `execution.agent` | 名字形态 | 读 `blocked()` | 判定 | `reason` 来源 / `reading` |
|---|---|---|---|---|---|
| 1 | 任意 | 非 `mcp__…` 且非资源三件套 | 否 | `allow` | — |
| 2 | `undefined` | `mcp__<server>__*` | 否 | `deny` | `toolDenyReason(name, server)` / `agentless` |
| 3 | `undefined` | 资源三件套 + `arguments.server` 非空字符串 | 否 | `deny` | `resourceDenyReason(server)` / `agentless` |
| 4 | `undefined` | 资源三件套 + `arguments.server` 不可判定 | 否 | `allow`（交回工具自身 required 校验） | — |
| 5 | 有（`visibleFor` 有值） | `mcp__<server>__*` | 是 | `guardReason(name, blocked, visible)`；`undefined` → allow | 命中时 `toolDenyReason`；`tracked` |
| 6 | 有（`visibleFor` 有值） | 资源三件套 | 是 | `resourceGuardReason(name, args, blocked, visible)`；`undefined` → allow | 命中时 `resourceDenyReason`；`tracked` |
| 7 | 有（`visibleFor` 返回 `undefined`） | `mcp__<server>__*` | 是 | `guardReason(name, blocked, NO_SERVERS)` | 命中时 `toolDenyReason`；`untracked` |
| 8 | 有（`visibleFor` 返回 `undefined`） | 资源三件套 | 是 | `resourceGuardReason(name, args, blocked, NO_SERVERS)` | 命中时 `resourceDenyReason`；`untracked` |

要点：
- **`reading` 只进日志，绝不进文案**——第 5–8 行共用同一批函数，模型无法区分「被全局闸口拦」还是「被 per-agent guard 拦」。
- agentless 行**不读** `blocked()`：D2 的语义是「无归属即全族关闭」，不依赖本插件的 claim 集（claim 集在 `manager.dispose()` 里会被清空，见 CD-3 反例）。
- `guardReason` / `resourceGuardReason` / `deriveDeny` / `reconcile` **零改动**；`toolDenyReason` 只做抽取，文案逐字不变。

### 3.3 `IsolationLayer`：attach 幂等与读面

```ts
export class IsolationLayer {
  private readonly agents = new Map<object, Tracked>()
  /** Attaches in flight, so a second call joins instead of duplicating effects. */
  private readonly attaching = new Map<object, Promise<void>>()

  /** Whether this layer already tracks one agent (its scope key). */
  isTracked(key: object): boolean

  async attach(key: object, cwd: string | undefined, tools: ScopedTools): Promise<void>
}
```

契约（写进 JSDoc，并被 T1 用例锁定）：

1. 首次调用：**同步**建 `Tracked` 并 `agents.set(key, tracked)`；随即 `this.start(tracked)`（装 per-agent guard + 首次 `recompute`），把它的 promise 记进 `attaching` 后 `await` 它。
2. 同 key 的第二次调用：**不**新建 `Tracked`、**不**再装 guard/restriction，直接 `await` 第一次的 promise（`finally` 里按对象身份清 `attaching` 条目）。
3. `detach(key)` 之后可再次 `attach`（新的一生）。
4. 失败语义不变：guard 安装失败只记 error 并继续 `recompute`；`recompute` 自带总兜底——`attach` 实际不会拒绝（保留调用方 catch 作为防御）。

### 3.4 `boot-sweep.ts`：补挂编排（新建）

```ts
import type { ScanLog } from './types.ts'

/** One live session the sweep may attach, as the wiring presents it. */
export interface SweepCandidate {
  /** The agent's scope key (its identity object). */
  readonly key: object
  /** The session id, for diagnostics only. */
  readonly id: string
  /** Attach this session: the SAME path `agent/created` drives; MUST be idempotent. */
  attach(): Promise<void>
}

/** The facts and effects one sweep reads. */
export interface SweepPorts {
  /** Whether the isolation layer already tracks this candidate. */
  isTracked(key: object): boolean
  readonly log: ScanLog
}

/** What one sweep did. */
export interface SweepSummary {
  readonly live: number
  readonly attached: number
  readonly skipped: number
  readonly failed: number
}

/**
 * Attach every live session that predates this plugin's load.
 * Serial: each attach awaits its own attribution, and serial keeps the
 * `isolation:` diagnostics in registration order.
 */
export async function sweepLiveSessions(
  candidates: readonly SweepCandidate[],
  ports: SweepPorts,
): Promise<SweepSummary>
```

语义：
1. 逐条 `if (ports.isTracked(candidate.key)) { skipped += 1; continue }`；
2. `await candidate.attach()`，成功 `attached += 1`，失败 `failed += 1` 并 `log.error('boot: cannot attach the workspace isolation of session <id>: <error>')`——**一条失败不影响其余**；
3. `live > 0` 时在末尾打一条汇总（`live === 0` 时**静默**，与今日「无存量会话不打日志」一致）；
4. 永不 reject（所有失败被吸收成计数）。

### 3.5 `index.ts`：装配形状

```ts
export const inject = ['workspaceRegistry', 'tools', 'agents']   // +agents（base 层，见 CD-11）

// 0. 全局闸口：apply 的第一件事（早于任何 await），随 fiber 卸载
let failClosedDenials = 0
let globalGuard: (() => void) | undefined
try {
  globalGuard = ctx.tools.guard((execution) => {
    const decision = globalGuardDecision(
      execution,
      () => manager.blockedServerNames(),
      (key) => isolation.visibleFor(key),
    )
    if (decision.kind === 'allow') return undefined
    if (decision.reading !== 'tracked') {
      failClosedDenials += 1
      if (failClosedDenials <= 3 || failClosedDenials % 100 === 0) {
        log.warn(
          `isolation: global guard denied ${execution.name}`
          + ` (${decision.reading === 'agentless' ? 'no calling agent' : 'untracked session'})`
          + `; ${failClosedDenials} such denial(s)`,
        )
      }
    }
    return decision.reason
  })
} catch (error) {
  log.error(`cannot install the workspace isolation global guard: ${String(error)}`)
}

// 1. 唯一 attach 路径（agent/created 与启动补挂共用）
async function attachAgent(agent: Agent): Promise<void> {
  const key: object = agent
  if (!isolation.isTracked(key)) {
    agent.ctx.effect(() => () => {
      isolation.detach(key)
    }, 'dsh-plugin-project-mcp: workspace isolation')
  }
  await isolation.attach(key, agent.session.header.cwd, scopedTools(agent.ctx, key))
}

// 2. agent/created：契约不变（返回 promise，registry 在首步前 await）
ctx.on('agent/created', ({ agent }) => attachAgent(agent).then(
  () => undefined,
  (error: unknown) => {
    log.error(`cannot apply workspace isolation to a session: ${String(error)}`)
    return undefined
  },
))

// 3. boot：归属 → 补挂 → 首扫（顺序即语义，见 CD-7）
async function boot(): Promise<void> {
  await attributor.update(workspaceRoots(ctx))
  let live: Agent[] = []
  try {
    live = ctx.agents.list()
  } catch (error) {
    log.error(`cannot read the live sessions for the boot sweep: ${String(error)}`)
  }
  await sweepLiveSessions(
    live.map((agent) => ({ key: agent, id: agent.session.header.id, attach: () => attachAgent(agent) })),
    { isTracked: (key) => isolation.isTracked(key), log },
  )
  await rescan()
}
void boot().catch(reportFailure)

// 4. teardown：显式收闸口（undo 幂等），其余不变
ctx.effect(() => () => {
  watcher.dispose()
  isolation.dispose()
  globalGuard?.()
  for (const dispose of triggers) dispose()
  void manager.dispose()
}, 'dsh-plugin-project-mcp: teardown')
```

`scopedTools(scope, key)`（index.ts:76-82）、`IsolationPorts`、`IsolationLayer` 构造参数**零变化**；`performRescan` 保留自己的 `attributor.update`（boot 的那次是给补挂用的前置事实，重复一次是幂等且必要的，见 CD-7）。

### 3.6 日志 / 诊断形状（验收 grep 口径）

| 行 | 形状 | 何时 |
|---|---|---|
| 补挂汇总 | `boot: swept <live> live session(s): attached <attached>, already tracked <skipped>, failed <failed>` | 插件加载且 `live>0` |
| 补挂失败 | `boot: cannot attach the workspace isolation of session <id>: <error>` | 单条失败 |
| 全局拒绝（fail-closed） | `isolation: global guard denied <tool> (no calling agent \| untracked session); <n> such denial(s)` | 前 3 次 + 每 100 次 |
| 既有：每 agent 重算 | `isolation: cwd=… roots=… visible=[…] global=…(mcp=…) scoped=…(mcp=…) carried=… deny=… […]` | 不变 |
| 既有：mask 生效 | `isolation: masked N tool(s) in one session: […]` | 不变 |
| 消失 | `boot: N session(s) predate this load; …` | 由补挂汇总取代 |

### 3.7 配置键

**无**。不新增/不修改插件配置键，`cordis.patch.yml` 与 `package.json` 的 `dsh` 段零变化；`inject` 是代码内声明（不是配置）。

### 3.8 不变式（实现时必须守住）

1. **单一判定源**：全局闸口与 per-agent 守卫都调 `guardReason` / `resourceGuardReason`；不得出现第二套字符串或第二套 server 解析。
2. **单一 attach 路径**：`agent/created` 与补挂都走 `attachAgent`；补挂不得绕开 `agent.ctx.effect` 的 detach 所有权。
3. **守卫随 fiber**：全局守卫的 effect 归插件 fiber（`ctx.tools.guard` 内部 `ctx.effect`），不写入任何跨 fiber 状态（D3）。
4. **幂等**：同 key 至多一份 guard + 一份 restriction（T1 用例断言 `guards.length === 1 && restrictions.length === 1`）。
5. **fail-closed 不依赖 claim 集**：agentless 分支不得读 `blocked()`。
6. **只碰自己的名字空间**：非 `mcp__`、非资源三件套的调用，全局闸口**零端口读、零日志、直接放行**。
7. **文案唯一**：任何拒绝文本只能来自 `toolDenyReason` / `resourceDenyReason`。
8. **不阻塞装配**：`apply` 同步返回；`boot()` 是 fire-and-forget（失败经 `reportFailure`）。

---

## ④ 决策记录

> 格式：**决策** → 被否方案与理由 → **反例**（一个能让被否方案当场破功的具体场景）。

### CD-0 writer 豁免与栈约束留痕（事实留档）

- **决策**：**不加载 `dsh-plugin-writer`**，按「既有插件的行为逻辑修改」处理。
- **依据**（用户 2026-11-05 确认）：writer 的适用面是「新建插件 / 插件骨架与产物形状」；本次改的是已有插件的隔离判定与生命周期装配，不新增插件、不改 `dsh.client` 面、不改 bundle 声明、不改构建脚本，落在 writer 声明适用面之外。
- **仍然自守的既有约束**（不因豁免而放松）：`lib/index.js` 是**入库产物**，必须重建并随源码一致（package.json:10、`git ls-files`）；改动最小面（不改 `package.json` 版本、`cordis.patch.yml`、`build.mjs`）；不 push 不打 tag。
- **被否：按 writer 流程重跑模板/骨架检查**。**反例**：本次唯一与「形状」相关的事实是产物重建——writer 检查跑一遍也只能得出「重建 `lib/`」，却会把既有插件的判定逻辑改动误标成「新插件搭建」，误导 review 的注意力（真正风险在 CD-3/4/7/9 的语义与生命周期）。

### CD-1 修复合集：补挂与全局闸口同批落地（D1 已定，此处只定代码形状）

- **决策**：一个变更里同时落 `boot sweep`（治本）与 global guard（兜底），两者共用 `attachAgent` 与同一批判定函数。
- **被否 A：只做补挂**。**反例**：插件重装瞬间（旧 fiber 的 `isolation.dispose()` 已 lift、新 fiber 的 sweep 还在 attribution/realpath 上等），一次 `mcp__dbx-brains__*` 调用无人拦；这正是 explore 记录的穿透形态（旧层拆完、新层未挂）。
- **被否 B：只做全局闸口**。**反例**：验收第 2 条（deny 工具 schema 不出现在模型工具面）永远不成立——闸口管的是 dispatch，`view()`/`restrict` 才是工具面来源（dsh-tools:2802、:2932）。模型每轮仍扛着 136 台 MCP 的 schema。
- **被否 C：先只做 A、B 另开变更**。**反例**：两批之间的版本会把「实调必拒」重新变回时序依赖，等于把 D1 的兜底承诺推迟到未知版本。

### CD-2 守卫载体：插件 ctx 的 `ctx.tools.guard`（落 global 层）

- **决策**：在插件自己的 ctx（无 scope）上注册一次 `ctx.tools.guard`。
- **依据**：`scopeOf(ctx) === undefined → layers.global`（dsh-scope:190、:195）；`guardReason` 第一步就查 global（dsh-tools:3024-3026）；`guard()` 用调用方 ctx（dsh-tools:3017-3021 ← cordis traceable:128）；`notify:false` 不会自激 `tools/change`。
- **被否 A：继续只在每个 agent ctx 上装 guard**（现状）。**反例**：插件重载后无人给存量 agent 装 guard——这就是 bug 本身。
- **被否 B：全局 `tools/pre-execute` 监听器里 deny**。**反例**：pre-execute 是**瀑布**，`guard` 在其后且是 monotonic（任何命中即拒、无 allow 反转，dsh-tools:3024-3031）；换成瀑布就要重新论证「后续监听器不能把 deny 变回 allow」，并给**每一次**工具调用增加一轮 async 瀑布（含非 MCP 的内置工具），而 `guard` 是同步短路。
- **被否 C：包裹 executor / 改 mcp-client**。**反例**：`prepareExecution` 是唯一 dispatch 入口（agent-loop:582 → dsh-tools:3310），包裹它等于重写上游管线；改 mcp-client 则要动上游包（prompt 明令上游只读）。

### CD-3 agentless（`exec.agent === undefined`）：MCP 全族一律拒（D2 已定，此处只定实现边界）

- **决策**：`mcp__<server>__*` 一律拒（不看 server 是否 blocked）；资源三件套**按 `arguments.server` 判定**——server 是非空字符串则一律拒，不可判定则交回工具自身 `required` 校验。
- **依据**：D2 原文即写「按 `arguments.server` 判定」；资源工具的 `server` 是 required（dsh-mcp-resources:32-40），且 `request()` 按 server 名解析 provider、没有「列全部」模式（:173-177），不可判定的调用**抵达不了任何服务器**。
- **被否 A：只拒 blocked 服务器**（把 agentless 当作「visible=∅ 的 untracked」）。**反例**：`manager.dispose()` 先清空 claim 再逐台卸载（mcp-manager.ts:132-135）——拆卸窗口里 `blocked()` 为空，blocked-only 判定会把仍在线的 `mcp__dbx-brains__*` 放行；fail-closed 不能依赖一个正在被拆掉的集合。
- **被否 B：资源三件套无条件拒（含 server 不可判定）**。**反例**：`{server: 1}` 这类畸形调用本来会被工具参数校验拒；在闸口再拒一次只会把「参数错误」伪装成「隔离拒绝」，与既有约定「畸形参数从不由隔离面裁决」（isolation.ts:234-238）相悖，且给不出可命名的 server 文案。
- **边界声明**：本设计把「server 不可判定」排除在拒绝之外，这是 D2「按 `arguments.server` 判定」的字面边界。若主会话要求更严（畸形参数也拒），改动只有 `globalGuardDecision` 第 4 行一处，但拒绝文案需要编一个 server 名（与上游文案格式冲突）——**建议维持现状**。

### CD-4 untracked（有 agent、层未跟踪）：按 `visible = ∅` 判，而不是 MCP 全族拒

- **决策**：`visibleFor(agent) === undefined` 时以 `NO_SERVERS` 代入 `guardReason`/`resourceGuardReason`。
- **依据**：名字面已把 untracked 装配建模为「隐全部 blocked 名」（prompt-isolation:466、:498、:529）；工具面只遮 blocked 名，两面同语义。
- **被否：untracked 也全族拒**。**反例**：一次 5 ms 的未跟踪窗口里，`mcp__codebase-memory__*`（profile 级、**永不在** blocked 集，isolation.ts:16-21）会被误拒；同一调用在 attach 完成后立刻可用——同一个会话在 5 ms 边界两侧行为不同，且拒绝文本「not configured for this session's workspace」对 profile 服务器是假的。

### CD-5 拒绝文案：复用 `toolDenyReason` / `resourceDenyReason`

- **决策**：抽 `toolDenyReason` 供 `guardReason` 与 agentless 分支共用；资源面继续用 `resourceDenyReason`。
- **被否：给全局闸口写一条新文案**（如「blocked by workspace isolation」）。**反例**：文案一旦区分来源，模型就能做**存在性探测**——先发一次越权调用，从措辞判断「这台服务器存在于别的工区但被拦」还是「根本没配」，这正是资源面当初逐字抄上游文案要防的（isolation.ts:56-70 的设计说明）。

### CD-6 补挂模块化：新建 `boot-sweep.ts`

- **决策**：编排放新模块，接窄端口（`key`/`id`/`attach()`/`isTracked`/`log`），index.ts 只做 Agent→候选的映射。
- **依据**：`index.ts` 自己的模块注释就写着「pieces are deliberately separate and each is unit-tested on its own — this module only wires them to the host context and owns the ordering」（index.ts:4-8）；本包测试按模块 1:1 组织，没有 apply 级假 ctx 先例。
- **被否 A：直接写在 `apply()` 里（对照 session-tool-toggle:897-911）**。**反例**：要给它写单测就得造一个 cordis `Context` 假件（`on`/`inject`/`effect`/`tools`/`agents`/`logger` + `workspaceRegistry`），任一签名漂移都让测试变红而非让 bug 变红；而本次修的**恰恰是一段从未被测过的生命周期循环**——不测它，同类回归会再来一次。
- **被否 B：塞进 `IsolationLayer`**。**反例**：层只认 `ScopedTools` 这样的窄效果端口，不认识 Agent/`agent.ctx`；把 Agent 形状塞进层会让「层可在无 cordis 的情况下单测」这个前提失效，并且把「谁拥有 agent 生命周期」从装配层挪进纯逻辑层。

### CD-7 补挂时机：`attribution 先行 → 补挂 → 首扫`

- **决策**：`boot()` 里先 `await attributor.update(workspaceRoots(ctx))`，再 sweep，最后 `await rescan()`。
- **依据**：补挂的 `attach` 立刻 `recompute`，而 `recompute` 读 `ports.attribute(cwd)`（isolation.ts:478-483 → index.ts:97）；此时 `Attributor` 还是空表则每个会话都被算成「无归属」。`attributor.update` 建表后一次赋值提交，幂等。
- **被否 A：先 `background()` 再补挂（等首扫完成）**。**反例**：`performRescan` 里 `await manager.sync(servers)` 要真连 MCP 服务器（stdio 握手，秒级，explore 记录过重载期间的加载行为）；把它排在补挂之前，等于把「存量会话的工具面/闸口恢复」推迟到一个**依赖网络与子进程**的时长上——正是本次要消灭的那类时序依赖。
- **被否 B：不等 attribution 直接补挂**。**反例**：补挂的每条 `isolation:` 诊断会打成 `roots=none visible=[]`，随后被首扫的 refresh 改写成真值。验收要用 `visible=[…]` 与实调结论互证（prompt 验收 4），首帧假日志会把排障者引向「归属又坏了」。
- **被否 C：把补挂塞进 `performRescan`（首扫时顺带）**。**反例**：`rescan()` 同时服务 `tools/change`、watcher、`domain/changed` 与 `/mcp-reload`（index.ts:106-154、:193-195、:199-226）；往里加「仅在首扫补挂一次」的状态位，会让「一次全量重扫」这句话不再成立，而 `/mcp-reload` 的语义正建立在这句话上。

### CD-8 补挂执行：串行

- **决策**：`for … await`，逐条 `attach`。
- **被否：`Promise.all`**。**反例**：每次 `restrict` 自己会发射 `tools/change`（isolation.ts:37-40），而 `tools/change` 会对**全部已跟踪 agent** `refresh()`；并发补挂让已跟踪集合边挂边长，重算次数从 O(N) 变 O(N²)，日志行也会交错到无法按会话归一。attribution 是毫秒级真实 IO，串行的总代价（N×ms）与首扫的秒级加载相比可忽略。

### CD-9 attach 幂等：in-flight join

- **决策**：`attaching: Map<object, Promise<void>>`，同 key 的第二次调用 `await` 第一次的 promise。
- **被否 A：只做「已 tracked 就早退」**。**反例**：`agent/created` 的返回值是「首步装配前限制必定已生效」的**契约载体**（index.ts:156-162 的注释与 dsh-agent:227-231 的串行 await）；若此刻另一次 attach 正在进行，早退会让 registry 提前放行首步，限制还没装上——静默破坏一个既有契约。
- **被否 B：调用方（index.ts）自己用 `Set` 去重**。**反例**：去重表与层内的 `agents` 表是同一条不变式的两份表达，任一处漏改（例如将来新增第三条 attach 路径）就同时装两份 guard；层是 `agents` 表的唯一所有者，幂等必须落在层里。

### CD-10 生命周期所有权：继续用 `agent.ctx.effect`

- **决策**：`attachAgent` 在 `!isTracked` 时注册 `agent.ctx.effect(() => () => isolation.detach(key))`；补挂走同一条。
- **依据**：仓内先例（user-commands:164-165、session-tool-toggle:676）；detach 与 agent 的 scope 同生共死，插件侧不持有第二份生命周期台账（D3：不引入跨 fiber 状态）。
- **被否：改听 `agent/disposed`**。**反例**：该事件是 `emit` 模式、在 scope unwind **之后**才派发（dsh-agent:236-243 注释），而监听器挂在插件 ctx 上——插件 fiber 先卸载时监听器已经没了，层里的 map 就再没人清；要靠它就得再补一条「插件卸载时清空」的路径，等于把一份所有权拆成两个来源。现有 effect 方案在两条路径上都严丝合缝。

### CD-11 `agents` 走硬注入

- **决策**：`inject = ['workspaceRegistry', 'tools', 'agents']`，`apply` 内直接 `ctx.agents.list()`。
- **依据**：`agents` 是 base 层服务（dsh-base/cordis.patch.yml:83），`workspaceRegistry` 只在 web-app 层（dsh-web-app/cordis.patch.yml:92）且**已经是**本插件的硬依赖——加 `agents` 不会缩窄任何可安装面；兄弟插件同款（session-tool-toggle:133）。硬注入让 cordis 在 `agents` 就绪后才调 `apply`，「补挂时服务未就绪」这个时序问题从根上消失。
- **被否 A：`ctx.get('agents')` 读到 undefined 就跳过（现状写法）**。**反例**：这正是 index.ts:252-259 的现状——服务未就绪时静默降级成一行日志，把「没补挂」写成了「不需要补挂」。
- **被否 B：`ctx.inject(['agents'], (scope) => sweep(scope))` 软注入**。**反例**：子 fiber 的 `apply` 会在服务替换时重跑，`agent/created` 监听器却仍挂在父 ctx 上；两处生命周期不同步，且服务永不到达时插件会「有一半行为」（能 attach 新会话、不能补挂存量），没有任何报错——比硬注入的「整个插件不加载」更难排查。

### CD-12 文档与产物必改（不是可选项）

- **决策**：同批改 README 四处、重建 `lib/index.js`。
- **被否：文档后置到发版批次**。**反例**：README:94-95 现在把「插件重载后资源面没有守卫（已知 fail-open 窗口）」写成了**预期行为**；改完代码却不改这两行，下一位排障者会照文档认定穿透仍属设计内——文档会主动掩盖验收失败。
- **被否：只提交源码、产物留给 release**。**反例**：web profile 加载的是 `lib/index.js`（package.json:10 + profile 的 `link:` 实测），不重建则 G5 的全部实机断言都会看到旧行为，验收会误判成「修复无效」。

---

## ⑤ 逐任务组实现要点

> 与 tasks 建议分组 **G1..G7 ↔ T1..T7** 一一对应；组间串行。`vitest` 走 esbuild 转译**不做类型检查**，类型面在 G1/G2 出口各跑一次 `typecheck`。

### G1 — 隔离层：全局判定 + attach 幂等（文件 H1；对应 T1）

**要点**
1. `GuardedExecution` 增 `readonly agent?: object`（JSDoc 说明「只取身份」）。`ScopedTools` / `IsolationPorts` **零变化**。
2. 抽 `toolDenyReason(toolName, server)`，`guardReason` 改为调用它（文案逐字不变，行号会漂移到 ~L220）。
3. 新增 `GlobalGuardReading` / `GlobalGuardDecision` / `NO_SERVERS` / `globalGuardDecision(...)`，实现严格按 ③3.2 判定表（**先判名字族，再判 agent，再懒读 blocked**）。
4. `IsolationLayer`：增 `attaching`、`isTracked(key)`；把 `attach` 拆成「claim → `start()`（装 guard + recompute）」两段，第二轮调用 join 第一轮；`detach` 不动。
5. 模块注释（L1-42）增一段「the **global face**」：为什么插件 ctx 的 guard 是 global 层、为什么它必须对 untracked/agentless fail-closed、为什么它不替代 per-agent 守卫。

**出口**
```bash
pnpm --filter dsh-plugin-project-mcp typecheck          # exit 0
pnpm --filter dsh-plugin-project-mcp lint               # exit 0
grep -n "export function globalGuardDecision" plugins/project-mcp/src/host/isolation.ts   # 1 行
grep -c "export function toolDenyReason" plugins/project-mcp/src/host/isolation.ts        # 1
grep -n "readonly agent?: object" plugins/project-mcp/src/host/isolation.ts               # 1 行
grep -n "private readonly attaching" plugins/project-mcp/src/host/isolation.ts            # 1 行
```

**禁止**：改 `deriveDeny` / `guardReason` 的判定条件 / `resourceGuardReason` / `reconcile` / `report`；改 `IsolationPorts`。

### G2 — 补挂模块（文件 H2；对应 T2）

**要点**
1. 按 ③3.4 建 `src/host/boot-sweep.ts`（只 import `type { ScanLog } from './types.ts'`）。
2. 串行、逐条 catch、`live>0` 打汇总、`live===0` 静默；失败行含 session id。
3. 汇总行文案**逐字**：`boot: swept ${live} live session(s): attached ${attached}, already tracked ${skipped}, failed ${failed}`。

**出口**
```bash
pnpm --filter dsh-plugin-project-mcp typecheck
grep -n "boot: swept" plugins/project-mcp/src/host/boot-sweep.ts       # 1 行
grep -c "from '@deepseek-ai" plugins/project-mcp/src/host/boot-sweep.ts # 0（不引上游包）
```

### G3 — 装配（文件 H3；对应 T3）

**要点**：按 ③3.5 改 `index.ts`（`import type { Agent } from '@deepseek-ai/dsh-agent'`：把现 L31 的空 import 换成具名类型导入，模块增强不变）；**顺序敏感**：`inject` → 全局守卫（`isolation` 构造之后、任何 await 之前）→ `attachAgent` → `agent/created` 改调它 → 删 predate 块 → `boot()` → teardown 加 `globalGuard?.()`。文件头注释的第 2/5/7 条同步改写。

**出口**
```bash
pnpm --filter dsh-plugin-project-mcp typecheck
grep -n "export const inject" plugins/project-mcp/src/host/index.ts            # 含 'agents'
grep -n "ctx.tools.guard" plugins/project-mcp/src/host/index.ts                # 1 行
grep -c "predate this load" plugins/project-mcp/src/host/index.ts              # 0
grep -n "await sweepLiveSessions" plugins/project-mcp/src/host/index.ts        # 1 行
grep -n "globalGuard?.()" plugins/project-mcp/src/host/index.ts                # 1 行
grep -c "isolation.attach(" plugins/project-mcp/src/host/index.ts              # 1（只剩 attachAgent 内那一处）
```

**禁止**：改 `performRescan` 的步骤顺序；改 `agent/created` 的返回值形态；把 `boot()` await 进 `apply`。

### G4 — 测试（文件 T1/T2；对应 T4）

**要点**：`test/isolation.test.ts` 追加两组（断言逐字）——
1. `it('leaves a non-MCP call alone without reading the claim set')`：`{name:'read_file'}` + 计数 thunk → `{kind:'allow'}` 且 thunk 调用 0 次。
2. `it('refuses an agentless MCP tool call in the per-agent wording')`：`{name:'mcp__figma__get_figma_data'}` → `{kind:'deny', reading:'agentless', reason: guardReason('mcp__figma__get_figma_data', new Set(['figma']), new Set())}`（同文锚定）。
3. `it('refuses an agentless resource call for the named server in the upstream wording')`：三个资源工具 `arguments:{server:'dbx-brains'}` → `reason === resourceDenyReason('dbx-brains')`。
4. `it('hands an agentless resource call with an unusable server argument back to the tool')`：`undefined` / `{}` / `{server:1}` / `{server:''}` → allow。
5. `it('fails closed for an untracked agent on a blocked server only')`：`{name:'mcp__figma__x', agent:{}}`，blocked=`{figma}` → `{kind:'deny', reading:'untracked'}`；`mcp__codebase-memory__search` → allow。
6. `it('judges a tracked agent by its own visible set')`：visible=`{figma}` → figma 工具 allow、dbx 工具 deny 且 `reading==='tracked'`；资源面同。
7. `it('installs one guard and one restriction for a joined attach')`：同一 `key` 连调两次 `attach`，`Promise.all` 后 `io.guards.length===1 && io.restrictions.length===1`。
8. `it('tracks and untracks one key')`：`isTracked` false → attach → true → detach → false。

`test/boot-sweep.test.ts` 新建 4 条：全量补挂（3/3/0/0 且 `boot: swept 3` 一行）、跳过已跟踪（1/2/0）、单条失败不中断（failed=1 且 errors 含 session id）、`live===0` 静默（infos 为空）；另加一条断言**串行序**（attach 内部 push id，断言 `['a','b','c']`）。

**出口**
```bash
pnpm --filter dsh-plugin-project-mcp exec vitest run test/isolation.test.ts test/boot-sweep.test.ts
pnpm --filter dsh-plugin-project-mcp test          # 全量
```
红基线：G1/G2 未实施时新用例必红（`globalGuardDecision` / `sweepLiveSessions` 不存在即 import 失败）。

### G5 — 产物重建 + 全量回归（文件 H4；对应 T5）

**出口**
```bash
pnpm --filter dsh-plugin-project-mcp build
grep -c "boot: swept" plugins/project-mcp/lib/index.js         # ≥1
grep -c "predate this load" plugins/project-mcp/lib/index.js   # 0
grep -c "global guard denied" plugins/project-mcp/lib/index.js # ≥1
node --input-type=module -e 'const m = await import("./plugins/project-mcp/lib/index.js"); console.log(Object.keys(m).sort().join(","))'   # apply,inject,name
pnpm typecheck && pnpm lint && pnpm test                        # 根仓递归；engines WARN 忽略、multi-root 5 个既有 skip
```
`TMPDIR=/tmp` 口径（归档变更 R1-R3 的执行环境注意点）。

### G6 — 实机验收（对应 T6；本批必做，**含重载复现**）

**前置**：web profile 是 `link:` 指向本仓（`/home/docker/.dsh/profiles/web/package.json:38`）；G5 已重建产物。

1. **冷启动基线**：重启承载 web profile 的 dsh 进程 → 新开 dsh-plugins 会话 → 日志
   `docker logs dsh --timestamps 2>&1 | grep -E "boot: swept|isolation: cwd="`
   断言：出现 `boot: swept <n> live session(s): …`；dsh-plugins 会话行 `roots=2 visible=[]`。
2. **实调（验收 1）**：该会话调 `mcp__dbx-brains__dbx_list_connections` → 返回
   `Error: tool mcp__dbx-brains__dbx_list_connections belongs to MCP server dbx-brains, which is not configured for this session's workspace`，输出**不含**任何 RDS 地址（`rm-uf` 前缀）。
3. **deny 集外正常**：同会话调 `mcp__codebase-memory__*` → 真实返回；brains 会话调 `mcp__dbx-brains__dbx_list_connections` → 真实返回（**C 形态 = 全自己**）。
4. **工具面（验收 2）**：取该会话最新 `request/header`（`$SID` = 该会话 id），断言无 deny 名：
   ```bash
   node /tmp/stt-read-session.cjs /home/docker/.dsh/sessions/*/"$SID"/session.v4.jsonl.zstd > /tmp/hdr.jsonl
   node -e 'const l=require("node:fs").readFileSync("/tmp/hdr.jsonl","utf8").trim().split("\n").map(JSON.parse).filter(e=>e.type==="request/header").at(-1);console.log(l.data.header.tools.map(t=>t.name).filter(n=>n.startsWith("mcp__")).join("\n"))'
   ```
   断言：无 `mcp__dbx-brains__`、无 `mcp__yunxiao__`、无 `mcp__figma*`；含 `mcp__codebase-memory__*`。
5. **重载复现（本 bug 的原始路径）**：保持一个 dsh-plugins 会话开着 → 触发 fiber 替换
   `docker exec dsh dsh plugin --profile web add link:/home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp`
   → **不刷新页面**、同一会话继续 → 断言：日志出现新的 `boot: swept …`；随后实调仍被拒（第 2 步文案），下一次请求头仍无 deny 名。
6. **D 形态**（无配置）与 **C 形态**（全自己）各一个新会话，日志 `visible=[]` / `visible=[dbx-brains]` 与实调结论一致。
7. **回归**：`/mcp-reload` 回执计数正常；brains 会话不受影响。

**禁止**：用带副作用的 MCP 工具复现（prompt 已明令）；把 yunxiao 的 403 当判据。

### G7 — 文档与落档（文件 D1；对应 T7）

- README 四处（③1.4）逐条改；历史冒烟表只加注不改数（见 P3）。
- 落档（主会话）：spec delta 建议新增/改写以下 Scenario ——「插件重载后存量会话被补挂且实调被拒」「无 agent 的 MCP 调用被拒」「未跟踪会话的越权调用被拒」「deny 集外（含 profile 级）不受影响」；Requirement 正文补一句「判定的执行面 MUST 由 per-agent 守卫与进程级闸口共同保障，任一缺口 MUST fail-closed」。

**出口**
```bash
grep -c "工具面两层强制" plugins/project-mcp/README.md        # 0
grep -n "全局闸口\|全局守卫" plugins/project-mcp/README.md    # ≥2 行
grep -c "已知 fail-open 窗口" plugins/project-mcp/README.md   # 0
grep -c "boot: swept" plugins/project-mcp/README.md           # ≥1
```

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（被证伪须回到对应决策）

| # | 假设 | 依据 | 被证伪的后果 |
|---|---|---|---|
| A1 | 模型直调与 PTC 内层调用的 `exec.agent` **恒为**发起 agent 对象，且与 `attach` 的 key 同一身份 | agent-loop:507、:514；dsh-tools:1374-1375、:3227-3246；isolation.ts:364-374 | 全局闸口的 tracked 判定会错位 → untracked 分支常态化（全拒），须改用 id 映射 |
| A2 | 现行部署不存在 agentless 的工具执行入口 | 全包 grep：`prepare`/`execute` 仅 agent-loop:570/582/586；无其它 `tools.execute(` 调用方 | agentless 全族拒会误伤某个宿主侧功能 → 按 P2 收窄 |
| A3 | 插件 ctx 无 scope → guard 落 global，且 `guardReason` 先读 global | dsh-scope:190、:195；dsh-tools:3024-3026；cordis:128 | 闸口落在别的层 → 对 agentless/untracked 不生效（本次修复失效） |
| A4 | 可从插件 fiber 给 `agent.ctx` 注册 effect（跨 fiber 注册生命周期） | user-commands:164-165；session-tool-toggle:676 | 补挂无法挂 detach → 层内台账泄漏（行为仍 fail-closed） |
| A5 | `agents.list()` 含存量会话与子代理，且在补挂期间注册序稳定 | dsh-agent:332、:355-357；session-tool-toggle:897-911（同款用法） | 补挂漏挂/重挂；重挂由 CD-9 的幂等兜住 |
| A6 | serverName 不含 `__`（`[A-Za-z0-9_-]{1,32}`） | README.md:37（mcp-client 契约） | `toolServerOf` 解析歧义（既有风险，非本次引入） |
| A7 | `manager.blockedServerNames()` 是纯读、不抛、每次重算 | mcp-manager.ts:202-206 | 闸口抛错 → dsh-tools 把异常转成工具错误（仍是拒绝，但文案不可控） |
| A8 | 补挂的 `restrict` 对**下一次装配**生效；已装配的请求保持旧面 | dsh-tools:2802、:2932；explore 第六节 | 若要求「同一请求内即时」→ 超出本变更能力 |
| A9 | 插件重载窗口里旧 fiber 会先卸载 MCP 子 fiber、再摘自己的守卫；空 claim 期间没有可调的目标 | mcp-manager.ts:110-111、:132-135；index.ts:229-234 | 若旧服务器与新空白 claim 并存且旧守卫已摘 → 出现毫秒级可调窗口（记录于 U4） |
| A10 | per-agent guard **不被** `detach` 摘除，随 agent scope 卸载（既有事实） | isolation.ts:168、:382、:637-646（`lift` 只 lift restriction） | 插件每次重载给每个存活 agent 留一条只读闭包（无害、不拒绝）→ U3 |
| A11 | 运行宿主 = rc.5，web profile 为 `link:` 安装 | `scripts/dsh-baseline.mjs:13`；profile `package.json:38`（本轮实测） | 实机断言看到旧行为 → 重装/重启后重跑 G6 |
| A12 | 上游工具执行管线仍只有 `prepareExecution` 一条入口 | dsh-tools:3310；agent-loop:582 | 若新增旁路，闸口覆盖面要重估（本次已无旁路） |

### 6.2 未决项（不阻塞本蓝图，实施/观察期消解）

- **U1** 全局闸口对 **tracked** agent 的重复判定（global + per-agent 各一次）：两次都是 Set/Map 读，量级微秒；若未来工具调用密度成为瓶颈，可让闸口只处理 untracked/agentless——但那会削弱 CD-1 的兜底语义，需另立变更并重跑验证。**本批保持双判。**
- **U2** 补挂 attach 完成前（attribution 的 realpath 期间）该会话被算作 `visible=∅`：其自有项目工具会被短暂拒（毫秒级，fail-closed 方向）。无法在不 fail-open 的前提下消除，记录为已知窗口。
- **U3** 旧 per-agent guard 闭包每次重载每个 agent 留一条（A10）：只占内存、不再拒绝（旧 manager 的 claim 已清空）。是否清理属独立加固项，不在本变更。
- **U4** `manager.dispose()` 先清 claim 再卸子 fiber（A9）：拆卸瞬间闸口无 claim 可判。与 D3 已接受的窗口同源，不新增风险。

---

## 待决问题（六字段之外）

### P1（P1，影响验收执行方式）实机验证的中断面

- **问题**：G6 需要一次 fiber 替换；若不能用 `dsh plugin add` 触发，就要重启承载 web profile 的 dsh 进程，会中断当前 GUI 会话。
- **选项**：**A（推荐）** 先用 `docker exec dsh dsh plugin --profile web add link:<本仓>/plugins/project-mcp` 触发重载（explore 观测到的 07:10 重载路径即此类），失败再约时重启；B 直接在独立 `DSH_HOME`/独立端口复刻（需手工复刻 registry 与 `.dsh/mcp/`，成本高且与线上授予不完全等价）；C 只跑单测（**不满足**验收 5「必须实调」）。
- **推荐**：A，B 作为兜底。
- **影响面**：验证时间窗与用户中断；断言口径不变。

### P2（P2，影响误伤面）agentless 全族拒的长期口径

- **问题**：D2 已定「一律拒」，但若将来出现真实的宿主侧 agentless MCP 调用方，会被静默拒绝（只在前 3 次留 warn）。
- **选项**：**A（推荐）** 保持 D2 不变，用 `isolation: global guard denied … (no calling agent)` 日志当首个信号，出现真实调用方时另立变更收窄；B 现在就先收窄成「只拒 blocked 服务器」（**等于改 D2，本设计不做**）；C 加一个配置开关（新增配置键，超出本次最小面）。
- **推荐**：A。
- **影响面**：只影响未来排查路径；当前零调用方（A2）。

### P3（P3，影响文档范围）README 历史冒烟记录是否重跑

- **问题**：README:108 起的冒烟表早于本次修复，其中「`/tmp`（无归属）」「deny 计数」等行与现状可能不一致；重跑需另起独立实例。
- **选项**：**A（推荐）** 只改降级矩阵/三面/排障三处，历史表加一行注记「本表早于 isolation-enforcement（2026-11-05），重载行为以新矩阵为准」；B 整体重跑并刷新表格（成本最高）；C 什么都不改（**不可**，见 CD-12）。
- **推荐**：A。
- **影响面**：仅 D1；B 额外占用一个验证窗口。

### P4（P3，影响上游跟进）是否向上游提「agent 存活通知」

- **问题**：本次能闭环靠 `agents.list()` 补挂；上游没有 `agent/created` 之外的「存量 agent 就绪」信号。
- **选项**：**A（推荐）** 不跟进，sweep 足够（explore 已定「无需改上游」）；B 提 feature request（`agents` 变更事件），非本变更范围；C 上游改动后作为优化项接入。
- **推荐**：A。
- **影响面**：无代码影响；只影响未来优化空间。

---

## 附 A：验证映射总表（每条对应一份可执行命令或一条可断言事实）

| 验证点 | 载体 | 具体命令或断言 |
|---|---|---|
| 全局闸口存在且落 global 层 | 命令 | `grep -n "ctx.tools.guard" plugins/project-mcp/src/host/index.ts` → 1 行；`grep -n "layers.global.guardReason" /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js` → L3025 |
| agentless 工具一律拒 | 断言 | `globalGuardDecision({name:'mcp__figma__x'}, …)` → `{kind:'deny', reading:'agentless'}` |
| agentless 拒图文案一致 | 断言 | `decision.reason === guardReason('mcp__figma__x', new Set(['figma']), new Set())` |
| agentless 资源按 server 拒 | 断言 | 三个资源工具 `{server:'dbx-brains'}` → `reason === resourceDenyReason('dbx-brains')` |
| agentless 资源畸形参数交回校验 | 断言 | `{}` / `{server:1}` / undefined → `{kind:'allow'}` |
| untracked 只拒 blocked 服务器 | 断言 | `{name:'mcp__figma__x', agent:{}}` blocked={figma} → deny/untracked；`mcp__codebase-memory__search` → allow |
| tracked 按自有 visible 判 | 断言 | visible={figma} → figma allow、dbx deny/tracked |
| 非 MCP 调用零端口读 | 断言 | 计数 thunk 调用 0 次 + `{kind:'allow'}` |
| attach 幂等 | 断言 | 同 key 两次 attach → `guards.length===1 && restrictions.length===1` |
| isTracked 生命周期 | 断言 | false → attach → true → detach → false |
| 补挂全量 | 断言 | 3 候选/0 已跟踪 → `{live:3,attached:3,skipped:0,failed:0}` 且日志含 `boot: swept 3` |
| 补挂跳过已跟踪 | 断言 | 2 已跟踪 → `{attached:1,skipped:2}` |
| 补挂失败不中断 | 断言 | 中间一条 reject → `failed:1`，末条仍 attached，errors 含 session id |
| 补挂串行 | 断言 | attach 内部 push id → `['a','b','c']` |
| 无存量会话静默 | 断言 | `live:0` → infos 为空 |
| 类型 / 风格 | 命令 | `pnpm --filter dsh-plugin-project-mcp typecheck`、`lint` 退出 0 |
| 单测全绿 | 命令 | `pnpm --filter dsh-plugin-project-mcp test`；根仓 `pnpm test`（engines WARN 忽略、multi-root 5 skip） |
| 产物已重建且可加载 | 命令 | `grep -c "boot: swept" lib/index.js` ≥1；`grep -c "predate this load" lib/index.js` = 0；`import()` 输出 `apply,inject,name` |
| 装载性 | 命令 | `docker exec dsh dsh --profile web --dump-config-schema`（schema JSON 正常产出、无 project-mcp 相关 error 节点；口径同归档变更 R3，退出码不作判定） |
| 实调必拒（验收 1） | 实机 | dsh-plugins 会话调 `mcp__dbx-brains__dbx_list_connections` → `Error: tool … belongs to MCP server dbx-brains, which is not configured for this session's workspace`；输出无 `rm-uf` 地址 |
| deny 集外正常 | 实机 | `mcp__codebase-memory__*` 正常；brains 会话调自家 `mcp__dbx-brains__*` 正常 |
| 工具面（验收 2） | 命令 + 断言 | `/tmp/stt-read-session.cjs` 解帧 → 最新 `request/header` 的 `data.header.tools` 无 `mcp__dbx-brains__`，含 `mcp__codebase-memory__` |
| 重载复现 | 实机 | `dsh plugin --profile web add link:…` 后日志有新 `boot: swept …`；同一会话实调仍拒；下一次 header 仍无 deny 名 |
| C / D 形态 | 实机 | brains 新会话 `roots=1 visible=[dbx-brains]`；dsh-plugins 新会话 `roots=2 visible=[]`（验收 4） |
| 文档一致 | 命令 | `grep -c "工具面两层强制" README.md` = 0；`grep -c "已知 fail-open 窗口"` = 0；`grep -c "boot: swept"` ≥1 |
| 规范一致 | 命令（落档阶段） | `openspec validate --all` 退出 0；delta 含「进程级闸口 MUST fail-closed」句与 4 条新 Scenario |

## 附 B：与收敛留痕（decisions.md）的对应关系

| 收敛项 | 本蓝图落点 | 备注 |
|---|---|---|
| D1 = A+B（sweep + 全局守卫） | CD-1、CD-2、CD-7、CD-8、CD-9、③3.3-3.5、⑤G1-G3 | 代码形状；语义不重开 |
| D2 = agentless fail-closed | CD-3、③3.2 判定表第 1–4 行 | 按 `arguments.server` 判定的实现边界 |
| D3 = teardown 维持现状 | CD-10、⑥A9/U3/U4 | 不引入跨 fiber 状态；`dispose()` 的 lift 不改 |
| 「不推翻上游结论、无需改 dsh」 | ②2.2、⑥A2/A12、P4 | 上游只读 |
| writer 豁免 | CD-0 | 依据 + 自守约束 |
| 幂等 / 拒绝文案一致 / agents 就绪 / GuardedExecution 扩展 | CD-9、CD-5、CD-11、G1 | decisions.md「实现细节交给阶段 1.7」的四项 |

---

*本文件为阶段 1.7 代码级蓝图；执行期由 spec-apply 维护各组终形态。蓝图与实测不符处（行号漂移、上游小版本差异）以实测为准，但 CD-2/3/4/7/9 的规则形状不得回退。*
