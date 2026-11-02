# Design

## Context

- 动机见 `proposal.md` 的 Why；行为契约见本变更 `specs/dsh-project-mcp/spec.md` 的三条需求（`工作区可见性隔离` MODIFIED、`资源服务器名与资源面的隔离` ADDED、`隔离的动态刷新` MODIFIED）。
- 现状机制：`plugins/project-mcp` 在**插件全局 ctx** 逐配置加载 mcp-client（`plugin-loader.ts:126`），因此每台项目服务器的资源 provider 与 `mcp:<server>` 指令段都落在 `mcpResources` / `systemPrompt` 的**全局层**；工具面靠「agent 作用域 `restrict` 掩可见 + per-agent `tools.guard` 拦调用」隔离（`isolation.ts:1-25`），名字面与资源面没有对应机制——这正是 README 非目标条目（`:152`）记录的未交付边界。
- 已收敛方案（`diff-matrix.md` §6）：**S2 面级闸门**——单连接不变，名字面走 `system-prompt/assemble` 瀑布过滤、资源面扩展现有 per-agent guard；并按用户决策（`diff-matrix.md` §7、`code-design.md` 落档决议 R-1…R-5）顺带修正工具面应拒集合口径。
- 强约束：DSH 基线 `0.2.1-rc.2`（`scripts/dsh-baseline.mjs:13`）；零上游修改；构建只允许 `node:*` external（`build.mjs:40`）；`verbatimModuleSyntax: true`（类型必须 `import type`）；不新增运行时依赖、devDep 与配置键；不改其它插件源码。

## Goals / Non-Goals

**Goals：**

- 名字面：每次提示词装配按调用会话归属过滤 `## MCP resource servers` 名字数组，并移除被隐藏项目服务器的 `### MCP server: <name>` 指令段；归属未知 fail-closed；解析失败 fa​il-closed 删段 + 告警。
- 资源面：三个资源工具按 `arguments.server` 与调用方归属在派发前拒绝越权调用（不触达目标服务器），拒绝文案与上游「不可用」同形；参数异常交回工具自身校验。
- 工具面口径修正：应拒集合由 `claimed` 改为 `blocked = claimed \ failedClaims`（= 已加载 ∪ 加载中），修复「加载失败的 claim 误伤同名 profile 服务器」。
- 三面同源：共用同一 `visible`（既有 `IsolationLayer` 产出）与同一刷新路径；无新开关、无新依赖、无上游修改、无额外连接。
- 设计可施工：接口/数据形状、逐任务组要点、证据锚与验证映射齐备；spike 先行消除上游契约未知。

**Non-Goals：**

- 不做注册层隔离（名字仍存在于全局工具/资源注册表）；不改人类 UI（`session-tool-toggle` 面板 `shadowed`、`/tools` 输出）。
- 不做每 agent 独立连接（S1）、不改 serverName 仲裁与命名契约、不做跨工作区同名复用。
- 不新增上游 devDep（事件用本地 `declare module` 窄声明）；不做 agent 级资源 provider 重注册。
- 不覆盖 `exec.agent === undefined` 的进程内直接调用（模型调用总在 agent 内；属已知边界）。
- 不做「插件重载后存量会话」的 boot 追平（用户 Q1=A：只加观测日志 + README 边界）。

## Decisions

**D0 栈识别与 writer 豁免（留档，供执行侧与接续恢复）**

- 结论：**TypeScript / Node（Cordis）DSH 插件**——非 Spring 非 Nuxt，`spring-writer` / `nuxt-writer` 均未命中；**本次未触 writer 约束**（用户授权豁免加载，仅本次有效）。
- 证据：仓库根 `find` 无 `pom.xml`/`build.gradle*`/`nuxt.config.*`；`pnpm-workspace.yaml:5-6`（`packages: plugins/*`）；`src/index.ts:14` 导出 `name/inject/apply`；`src/host/index.ts:84` 的 Cordis `apply`；`build.mjs:40` 只 `node:*` external；`vitest.config.ts` + `package.json` scripts（vitest/oxlint/tsc）。
- 影响：任务拆分按本仓既有插件惯例（`## N.` 组、组内不写同一文件、单组 ≤ 8），不引用 writer skill 规定；源码 JSDoc 英文、用户文案/README/spec 中文。

**D-1 名字面 = 组装瀑布内改写/删段，不改注册层**

- 采用：全局 `ctx.on('system-prompt/assemble', …)` 监听器，`await next()` 后按 `context.agent`（缺失时 `context.scope`）过滤 `sections`。
- 被否：改 `mcpResources` 注册层（`layers` 为 private，公开面无过滤 API）；只做资源面（名字照旧泄漏）。
- 反例：若只做资源面，模型仍能在提示词里看到 6 个无关项目名并能用它们做无效尝试/猜名。

**D-2 资源闸门 = 扩展现有 per-agent `tools.guard`，不用全局 `tools/pre-execute`**

- 采用：`agent.ctx.tools.guard` 的单调守卫里追加「资源工具 + `arguments.server`」判定。
- 被否：全局 `pre-execute` 监听（须自建 agent→归属映射、可重排、PTC 需额外处理 `parent`）。
- 反例：把安全边界放进可重排瀑布，别的插件可在 `next()` 前短路，deny 是否生效取决于监听器顺序。

**D-3 集合口径（按用户 Q2=B 修订）：三面统一 `blocked = claimed \ failedClaims`；`visible` 仍来自 claimed**

- 采用：`failedClaims` 由 manager 在每次收敛时维护（成功/unchanged/移出扫描 → 剔除；加载抛错 → 加入）；应拒/隐藏集合 = `blocked \ visible`。
- 被否：① 纯 `claimed`（现状）→ 加载失败的 claim 误伤同名 profile 服务器；② 纯 `active` → provider 在 `connection.ready` 前已注册而 `active` 在 load resolve 后才写入，窗口内 fail-open。
- 反例：`figma` 项目 claim 撞 profile 行而加载失败时，纯 claimed 会让别的工作区会话的 profile `figma` 工具被 deny、资源被拒。

**D-4 名字面解析失败 = fail-closed（删段）+ 多策略解析 + 告警**（用户 Q5 / 扩展为整段删除）

- 采用：先「句末数组」、再「全文最后一个数组」，`JSON.parse` 校验字符串数组；全失败 → 删段 + warn（前 3 次）；空文本不算 unparsable。
- 被否：fail-open（保留原文 + warn）——上游改文案即永久泄漏。
- 反例：若保留原文，`probe-b` 会继续出现在每个会话提示词里，直到有人注意到告警。

**D-5 指令段按段名移除；名字段空数组删整段；改写用 spread 保留 `interpolate`**

- 采用：`name.startsWith('mcp:')` 且隐藏名 → 丢段；名字段改写 `{...section, text}`。
- 被否：改标题保正文（标题本身带名字）；置空文本（残留同名段）；挑字段重建（丢 `interpolate:false`）。
- 反例：重建丢 `interpolate` 后 `renderPrompt` 会把服务器 instructions 当模板插值，`{{x}}` 直接让整次装配抛错。

**D-6 诊断与限流：三条行、前 5 次全量 + 形状变化、`unparsable` warn 前 3 次**（用户 Q4）

- 采用：`prompt: resource names …` / `prompt: … tracked=no` / `prompt: … unparsable`，形状键不含 session；无相关段零日志零分配。
- 被否：每步打（高频路径淹没日志）；不打（「没跑」与「无需过滤」不可区分）；扩 `ScanLog` debug 档（波及所有假件）。
- 反例：6 个会话并行时每轮 6 行以上，冒烟时无法判断某会话是否被过滤。

**D-7 与 `session-tool-toggle` 的交互边界：不同层处理同一段名，不冲突**

- 采用：它在 agent 作用域注册同名空段，本变更在组装期删最终段；`layers.merge` 保证同名段至多一条，二者作用于同一最终对象。
- 被否：跨插件契约让面板过滤（人类 UI 不纳入）；接管它的段遮蔽（冲突面更大）。
- 反例：它关整组 = 无段可删 → no-op；若将来它改成「改写段文本」，需列入回归清单（README 记）。

**D-8 不新增配置开关**（用户 Q4）

- 采用：行为默认生效；回滚靠版本降级（README 写明代价）。
- 被否：`resourceIsolation` 布尔开关——必须定义「关掉时资源闸门是否也关」，两种都产生难解释的状态。

**D-9 用本地窄类型声明 `system-prompt/assemble` 事件，不新增 devDep**

- 采用：`declare module '@deepseek-ai/cordis'` 只建模 `sections`/`agent`/`scope`/`next`，沿用 `domain/changed`、`PluginLoaderService` 既有先例。
- 被否：加 `dsh-system-prompt` devDep 取精确类型——会引入同名事件声明合并风险（签名必须逐字兼容）与 lockfile/基线矩阵变动。

**D-10 监听器先 `next()` 再过滤**（官方范式；避免后续监听器覆盖我们的结果）

**D-11 异常路径 fail-closed（over-hide）**：端口读失败/过滤抛错 → 删除所有 `mcp-resource-servers` 与 `mcp:` 段（只按名字，不再走可能抛错的路径）。

**D-12 每次调用/装配读实时集合，不缓存快照**：`blocked` 变化必须即时生效；`visible` 沿用既有实时读。反例：快照 `active` 会让窗口内别工作区服务器被放行。

**D-13 工具判定与资源判定分成两个函数**：`guardReason(name, blocked, visible)`（既有函数改口径）与 `resourceGuardReason(toolName, args, blocked, visible)` 分开；合并易把口径传错，导致工具面 fail-open。

**D-14 资源拒绝文案与上游同形（用户 Q3=B）**：`resourceDenyReason(server)` 返回 `MCP resource server "<server>" is unavailable in this agent's scope`，与 `dsh-mcp-resources:174-177` 逐字同形——模型无法区分「被隔离」与「不存在」，无存在性探测；日志照记。

**D-15 不新增 `*ForRoots` 读数；`visible` 保持 claimed**：`visible` 表达「本工作区配置定义了哪些服务器」（授权面），改成 active/blocked 会在配置刚写入/重载窗口把本工作区服务器判越权，产生 restrict 抖动。

**R-1（用户 Q1=A）HMR/重载后存量会话不做 boot 追平**：只加 boot 观测行（`agents.list().length > 0` → 一行 info）+ README 边界（名字面自下一次装配 fail-closed，资源面在下一个 `agent/created` 前无守卫）。

## 触达面清单（①）

| # | 文件（仓：本仓 `dsh-plugins`） | 改动意图 | 关键改动点 |
|---|---|---|---|
| **H1** | `plugins/project-mcp/src/host/prompt-isolation.ts` | **新建**：名字面纯函数 + 组装监听器 | 段名常量、窄类型、`rewriteResourceNames`/`planNameFilter`/`hiddenServers(blocked, visible)`、`createAssembleListener`（先 next、over-hide、节流、`declare module`） |
| **H2** | `plugins/project-mcp/src/host/isolation.ts` | 三面闸门与口径修正 | `RESOURCE_TOOLS`、`resourceDenyReason`、`GuardedExecution`、`ScopedTools.guard` 放宽、端口 `managedServerNames()`→`blockedServerNames()`、`deriveDeny`/`guardReason`/`carried`/retry 统一 blocked、`resourceGuardReason`、`visibleFor` |
| **H3** | `plugins/project-mcp/src/host/mcp-manager.ts` | 失败/可拒集合读数 | `private failedClaims` 维护、`failedServerNames()`、`blockedServerNames()`；claimed 两个既有方法行为不变（doc 补口径） |
| **H4** | `plugins/project-mcp/src/host/index.ts` | 接线 | `IsolationLayer` 传 `blockedServerNames`；注册 `system-prompt/assemble` 监听；boot 观测行；模块头步骤清单补第 6 步 |
| **H5** | `plugins/project-mcp/src/host/types.ts` | **明确不改** | 新类型归属在使用模块；`ScanLog` 不扩档；`ScannedServer` 无字段变化 |
| **T1** | `plugins/project-mcp/test/prompt-isolation.test.ts` | **新建** | 纯函数表驱动 + 监听器假 assembly/假 ports（含节流、over-hide、`interpolate` 保留） |
| **T2** | `plugins/project-mcp/test/isolation.test.ts` | 改 | `GuardedExecution` 放宽、端口加 `blockedServerNames`、资源面矩阵、blocked 口径、profile 同名不误伤、`visibleFor` |
| **T3** | `plugins/project-mcp/test/mcp-manager.test.ts` | 改 | `failedServerNames()`/`blockedServerNames()` 口径（成功/失败/卸载/移出） |
| **D1** | `openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md` | 已生成 | 一次需求 ADDED + 两条 MODIFIED |
| **D2** | `plugins/project-mcp/README.md` | 文档 | 非目标 `:152` 改写、三面行为、`blocked`/`visible` 口径、降级矩阵、残余边界、回滚代价、冒烟表两列 |
| **D3** | 根 `README.md:77` + 根 `AGENTS.md:21` | 文档 | 一行描述加「名字与资源面隔离」 |
| **D4** | `openspec/changes/project-mcp-name-resource-isolation/artifacts/` | **新建** | spike 与冒烟证据（非源码） |

明确不改：`scan.ts`/`env-expand.ts`/`watcher.ts`/`triggers.ts`/`roots.ts`/`attribution.ts`/`host-io.ts`/`plugin-loader.ts`、`build.mjs`/`cordis.patch.yml`/`package.json`、其它插件源码、dotfiles profile、上游包。

## 证据锚（②，节选；完整表见落档材料 `code-design.md`）

- H1：`dsh-mcp-resources/lib/index.js:119-130`（段名/`interpolate:false`/名字数组形态）；`dsh-mcp-client/lib/index.js:655`、`:731-743`（`mcp:<server>` 段与 `### MCP server:` 标题）；`dsh-system-prompt/lib/index.js:117-119`（只拼文本不补标题、丢空段）、`:398`（瀑布返回值权威）；`dsh-scope/lib/index.js:327-338`（未打标签监听器收所有 scope）；`dsh-agent/lib/index.js:291-297`（`{agent, scope: agent, signal?}`）。
- H2：`isolation.ts:45`（现窄守卫类型）、`:127-156`（`deriveDeny`/`guardReason`）、`:260-268`（guard 装配）、`:339-384`（`reconcile`/carried/retry）；`dsh-tools/lib/index.js:3017-3032`（guard 单调、按 `exec.agent` 解析）、`:3321`/`:3337`（pre-execute 之后无条件求值）、`:3259-3263`（`arguments` 冻结快照）；`dsh-tools/lib/types/index.d.ts:226-229`、`:522`（`ToolGuard`）；`dsh-mcp-resources/lib/index.js:56-91`（三工具名与 `server` 参数）、`:174-177`（上游 unavailable 文案）。
- H3：`mcp-manager.ts:70`（`active` 映射）、`:118-138`（claimed 两读数）、`:140-197`（`reconcile`/`unload`）、`:160-173`（成功才写 active）。
- H4：`index.ts:72-78`（`scopedTools`）、`:89-97`（端口装配）、`:152-171`（`agent/created` serial-await attach）、`:178-185`（`tools/change` → refresh）、`:233`（boot 段）。
- T1/T2/T3：`test/isolation.test.ts:37-88`（`fakeTools`/`ports()`）、`test/mcp-manager.test.ts:14-56`（fixture/fakeLoader）。
- 交叉插件边界：`session-tool-toggle/src/host/session-layer.ts:588-598`（同名空段遮蔽）、`control.ts:611-617`（全局 catalog）。

## 接口与数据形状（③）

**名字面 `src/host/prompt-isolation.ts`（新建）**

```ts
export const RESOURCE_NAMES_SECTION = 'mcp-resource-servers'
export const SERVER_SECTION_PREFIX = 'mcp:'
export interface SectionLike { readonly name: string; readonly text: string; readonly interpolate?: boolean }
export interface PromptAssemblyLike { readonly sections: readonly SectionLike[] }
export interface AssembleAgentLike { readonly session: { readonly header: { readonly id: string; readonly cwd?: string } } }
export interface AssembleContextLike { readonly agent?: AssembleAgentLike; readonly scope?: object }

export type NamesRewrite =
  | { readonly kind: 'kept' }
  | { readonly kind: 'rewritten'; readonly text: string; readonly kept: readonly string[]; readonly removed: readonly string[] }
  | { readonly kind: 'empty'; readonly removed: readonly string[] }
  | { readonly kind: 'unparsable' }
export function rewriteResourceNames(text: string, hidden: ReadonlySet<string>): NamesRewrite

export interface NameFilterPlan {
  readonly sections: readonly SectionLike[]
  readonly changed: boolean
  readonly keptNames: readonly string[]
  readonly removedNames: readonly string[]
  readonly removedSections: readonly string[]
  readonly unparsable: boolean
}
export function planNameFilter(sections: readonly SectionLike[], hidden: ReadonlySet<string>): NameFilterPlan
export function hiddenServers(blocked: ReadonlySet<string>, visible: ReadonlySet<string> | undefined): ReadonlySet<string>

export interface PromptIsolationPorts {
  visibleFor(agent: object): ReadonlySet<string> | undefined
  blockedServerNames(): ReadonlySet<string>
  readonly log: ScanLog
}
export type AssembleListener = (
  assembly: PromptAssemblyLike,
  context: AssembleContextLike,
  next: () => Promise<PromptAssemblyLike>,
) => Promise<PromptAssemblyLike>
export function createAssembleListener(ports: PromptIsolationPorts): AssembleListener
```

规则：`hiddenServers` = `blocked \ visible`（`visible === undefined` → 全隐）；解析顺序「空文本→kept / 句末数组 / 全文最后数组；`JSON.parse` 后必须字符串数组」；`kept` 返回同引用、`changed=false` 返回入参 sections；改文本用 spread 保留 `interpolate`；`mcp:<server>`（隐藏名）整段删；异常/端口失败 → over-hide 所有名字面段。监听器先 `await next()`，无相关段不读端口。

**资源面 + 工具面 `src/host/isolation.ts`（改）**

```ts
export const RESOURCE_TOOLS: ReadonlySet<string>
export function resourceDenyReason(server: string): string   // 与上游 unavailable 逐字同形（D-14/Q3=B）
export interface GuardedExecution { readonly name: string; readonly arguments?: unknown }
export interface ScopedTools {
  restrict(filter: { readonly deny: readonly string[] }): () => void
  guard(guard: (execution: GuardedExecution) => string | undefined): () => void
  visibleNames(): readonly string[]
}
export interface IsolationPorts {
  catalog(): readonly string[]
  attribute(cwd: string): Promise<readonly string[] | null>
  serverNamesForRoots(roots: ReadonlySet<string>): ReadonlySet<string>   // claimed → visible（不变）
  blockedServerNames(): ReadonlySet<string>                              // 新增：claimed \ failedClaims
  readonly log: ScanLog
}
export function deriveDeny(registered: readonly string[], blocked: ReadonlySet<string>, visible: ReadonlySet<string>): readonly string[]
export function guardReason(toolName: string, blocked: ReadonlySet<string>, visible: ReadonlySet<string>): string | undefined
export function resourceGuardReason(toolName: string, args: unknown, blocked: ReadonlySet<string>, visible: ReadonlySet<string>): string | undefined
// IsolationLayer 新增：visibleFor(key: object): ReadonlySet<string> | undefined
```

`resourceGuardReason` 判定链（顺序即契约）：非资源工具 → 放行；`server` 参数非非空字符串/`args` 非对象 → 放行（交回工具校验）；`!blocked.has(server)` → 放行（profile/未知/加载失败）；`visible.has(server)` → 放行；否则 `resourceDenyReason(server)`。`attach()` 的 guard 闭包 = 先 `guardReason(name, blocked, visible)`（工具面），未拒且是资源工具再 `resourceGuardReason(...)`；每次读实时集合（D-12）。

**`src/host/mcp-manager.ts`（改）**

```ts
export function failedServerNames(): ReadonlySet<string>   // 最近一次收敛中加载抛错者
export function blockedServerNames(): ReadonlySet<string>  // 声称集 − failedServerNames()（= 已加载 ∪ 加载中）
// managedServerNames() / serverNamesForRoots()：行为不变，只补 doc（claimed 口径）
```

维护点：`reconcile()` 成功/`unchanged`/移出扫描/unload → 从 `failedClaims` 删除；`catch` 分支 → 加入；`dispose()` → 清空；`sync()` 串行化保证读写一致。

**`src/host/index.ts`（改）**

```ts
const isolation = new IsolationLayer({
  catalog: () => ctx.tools.schemas().map((s) => s.name),
  attribute: async (cwd) => (await attributor.attribute(cwd))?.roots ?? null,
  serverNamesForRoots: (roots) => manager.serverNamesForRoots(roots),
  blockedServerNames: () => manager.blockedServerNames(),
  log,
})
ctx.on('system-prompt/assemble', createAssembleListener({
  visibleFor: (agent) => isolation.visibleFor(agent),
  blockedServerNames: () => manager.blockedServerNames(),
  log,
}))
const live = ctx.get('agents')?.list().length ?? 0
if (live > 0) log.info(`boot: ${live} session(s) predate this load; name isolation applies from their next assembly, resource isolation from the next agent/created`)
```

不 `inject` `systemPrompt`（事件订阅，服务缺席即不触发 = 软降级）；监听器随插件 fiber 卸载。

**诊断行（D-6）**：`prompt: resource names session=<id> cwd=<cwd> tracked=yes kept=[…] removed=[…] sections=[…] unparsable=N`；未跟踪 → `tracked=no hidden=<n>`；解析失败 warn 前 3 次；无相关段零日志。

## 逐任务组实现要点（⑤）

分组即执行审核批次：**组间严格串行、组内任务互不依赖且不写同一文件/目录、单组 ≤ 8 项、组末 `typecheck` 必须绿**（因依赖或写冲突无法并行的任务单独成组；详见 `tasks.md`）。

- **G1 spike（2 项，可并行：各自独立 `DSH_HOME`/端口，不改源码）**：1.1 名字面段契约与组装行为实证（段名/文本形态/`interpolate`/跨 scope 投递/下一步生效）；1.2 守卫参数形态实证（原生/PTC/缺参/非字符串/profile 服务器；deny 后目标服务器零请求）。任一条红 → 停止上报。
- **G2 纯函数、闸门与读数（3 项，可并行）**：2.1 `prompt-isolation.ts` 纯函数 + T1 纯函数部分；2.2 `isolation.ts` 三面闸门与 blocked 口径 + `index.ts` 最小接线（端口改名与接线必须同批完成）+ T2；2.3 `mcp-manager.ts` failedClaims/blocked/failed 读数 + T3。
- **G3 名字面监听器与接线（1 项，因依赖单独成组）**：3.1 `createAssembleListener`（含事件声明/节流/over-hide）+ T1 监听器部分 + `index.ts` 注册监听与 boot 观测行（依赖 2.1 的纯函数与 2.2 的端口改名）。
- **G4 静态门禁（1 项）**：`verify:all`/`dsh:check`/三 profile `--dump-config-schema`/产物纯度断言。
- **G5 隔离实例端到端冒烟（1 项；依赖组 4 的构建产物）**：9 条（名字面/资源允许/资源拒绝且不触达/profile 不受影响/fail-closed/动态刷新/工具面回归/PTC/同名 claim 不误伤），证据归档 `artifacts/`。
- **G6 规范与文档（3 项，可并行）**：6.1 spec delta 校验；6.2 插件 README；6.3 根 README + AGENTS。
- **G7 发布（1 项，串行末位）**：`pnpm release --dry-run` → 发布 → `lib/` 重建随提交 → profile 重装重启 → 复跑冒烟①②③⑨。

## 设计假设与未决项（⑥）

**假设**（被证伪则回到对应决策）：A1 会话装配总有 `context.agent`（缺失按未跟踪全隐；`scope` 兜底）；A2 未打标签的全局监听器收到所有 scope 装配；A3 `mcp-resource-servers`/`mcp:<server>` 段各至多一条；A4 段文本 = 固定前缀 + 句末 JSON 字符串数组（失败即删段告警）；A5 guard 可见 `execution.arguments` 深冻结 JSON；A6 PTC 内层走同一 `prepareExecution`（过 guard）；A7 `failedClaims` 的维护时点足以表达「加载失败」；A8 项目 claim 与 profile 行同名时 mcp-client 拒绝第二次预约（项目侧加载失败）；A9 无可相关段/服务缺失时本模块零端口读；A10 无其它消费者依赖「该段一定存在」。

**spike/未决（均在 G1 验证，失败时按 `code-design.md` §6.2 降级，不静默）**：PTC 同管线；非会话装配的 `context` 形态；HMR 后存量会话表现（已知边界，Q1=A 记录）；provider 重连的 blocked 时序；子代理归属（按自身 cwd）；agentless 调用不覆盖；`interpolate` 丢失防回归；三 profile 一致性。

**落档阶段已解决的设计线上浮项**：Q1=A、Q2=B（范围扩张并口径改定为 `blocked = claimed \ failedClaims`）、Q3=B（deny 文案与上游同形）、Q4=A（限流保持）、Q5=A（spec 加历史不追溯场景）。无遗留产品级未决项。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 上游段名/文本形态漂移（rc 阶段） | 段名作契约 + 多策略解析 + 解析失败 fail-closed 删段 + warn；DSH 升级时把冒烟第①条加入回归清单 |
| `system-prompt/assemble` 语义变化（`complete` 段会覆盖 sections） | 监听器先 `next()`；G1-1.1 实测 `complete` 行为；若被覆盖则上报（不静默） |
| guard 看不到 `arguments`（版本行为差异） | G1-1.2 先验证；失败即上报并改走「整体 deny 资源工具」的需拍板兜底（会连带杀 profile 资源能力） |
| 名字仍在全局注册表/人类 UI 可见 | 记入 README/spec 边界；面板属管理员视图不改；未来新增「全局读名字」消费者需重新评估 |
| 升级前历史会话中的名字不可清除 | spec 新增「不追溯」Scenario + README |
| HMR/重载后存量会话资源面无守卫 | Q1=A：boot 观测行 + README 边界（常态安装=重启，会话全新建） |
| `blocked` 口径改变工具面既有行为 | 属缺陷修复：既有单测矩阵同步更新；G4 冒烟含工具面回归与同名 claim 不误伤两条 |
| 重算窗口（`sync` → `refresh` 之间） | 实时读集合 + fail-closed 方向（宁可短暂多隐/多拒）；D-12 论证 |
| 多 profile（web/acp/headless）一致性 | 均基于 `dsh-base`；G4 三 profile 装载校验 + web 全量冒烟 |
| 文档与行为漂移（README `:152` 旧结论） | G5 断言「旧结论字符串不再存在」+ 行为/降级矩阵同步 |

## Migration Plan

1. 实施完成后按仓库统一版本流程发布（`pnpm release <version>`），`lib/` 重建随提交；profile 以 `link:` 重装并重启 dsh。
2. 无数据迁移：无新配置键、无状态文件、无 schema 变更；升级只影响运行期行为。
3. 回滚：降级到上一版本即可恢复旧行为（会同时恢复「名字/资源面不隔离」与旧工具面 claim 口径；README 写明该代价）。回滚不需要清理任何持久化数据。
4. 灰度与观测：升级后 `docker logs dsh | grep -E "prompt: resource names|isolation:"` 应看到三面诊断行；`boot: … predate this load` 仅在热重载场景出现。

## Open Questions

无阻塞性问题：设计线 5 项上浮已在落档分歧点问答解决（见 Decisions 的 R-1 与 `diff-matrix.md` §7）；剩余为 G1 spike 验证项（已列入任务与假设，失败路径与降级已定义，不改变 specs/方案/任务分解）。
