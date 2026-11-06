# Design

> 深度契约六字段（①触达面 ②证据锚 ③接口与数据形状 ④决策 ⑤逐组要点 ⑥假设与未决项）由阶段 1.7 设计线产出，全文见本目录 `code-design.md`（落档副本为权威）；本文逐断言承载浓缩版。收敛留痕见本目录 `decisions.md`（D1-D3 权威：D1=A+B 补挂+全局闸口、D2=agentless fail-closed、D3=teardown 维持现状）。

## Context

穿透根因（证据链见 explore/decisions，持久化会话日志逐帧核实）：隔离安装与 `agent/created` 单点绑定——插件 fiber 替换（重装/HMR）时旧层 `isolation.dispose()` 主动拆除全部现存 agent 的 restriction/guard，新层只打 `boot: N session(s) predate this load` 放任日志；已存活 agent 永不再收到该事件。实例：长寿会话 `session-8624cadb`（cwd=dsh-plugins）07:10 重载被孤儿化 → 07:16 起请求头携带全量 136 台 MCP 工具 → 08:36 实调 `mcp__dbx-brains__dbx_list_connections` 返回生产 RDS 真实数据（isError:false）。对照：收到 `agent/created` 的 agent（子代理、新会话）三面全部正常——机制本身无缺口，缺的是生命周期覆盖。调用路径未绕过 ToolRuntime（agent-loop:582 → prepareExecution → guardReason:3337）、scope 无错位（createScope(loopCtx,this) + cordis traceable 重绑）——两条原始假设证伪。

约束（需求原文 + 收敛裁定）：上游 dsh 源码只读（rc.5 实测插件侧 API 足以闭环）；`deriveDeny`/`guardReason`/`resourceGuardReason`/`reconcile` 判定语义零改动（闸口复用同一批函数）；名字面 `prompt-isolation.ts` 不动；不发版（Q3 批次）、只本地 commit；web profile 为 `link:` 安装指向本仓（不重建 `lib/` 则实机无变化）。

## Goals / Non-Goals

**Goals**：
- 启动补挂：apply 时对 `agents.list()` 全部存活 agent（含子代理）幂等补挂，走与 `agent/created` 完全相同的 attach 路径；boot 顺序 = 归属表发布 → 补挂 → 首扫
- 全局闸口（第四面）：插件无 scope ctx 上 `ctx.tools.guard`（落 global layer），untracked 与无发起者调用 fail-closed，拒绝文案与 per-agent 分支同形（模型不可探测）
- attach 幂等（in-flight join）：`agent/created` 与补挂竞态下同 key 至多一份 guard+restriction
- 实机验收必含「插件重载后旧会话」复现路径与实调用例

**Non-Goals**：
- 不改归属判定/名字面/三面判定函数语义；不改 `performRescan` 步骤序与 `agent/created` 返回值契约
- 不动 `package.json` 版本、`cordis.patch.yml`、`build.mjs`、兄弟插件、上游 dsh
- 不清理旧 per-agent guard 闭包残留（U3，独立加固项）；不新增配置键

## Decisions

（完整版含被否方案与反例见 `code-design.md` ④ CD-0..CD-12；此处逐条浓缩）

- **CD-0 栈识别结论**：探测未命中 Spring/Nuxt（无 `pom.xml`/`nuxt.config.*`，纯 TS+cordis+esbuild 软插件）。**writer skill = 豁免**（用户 2026-11-05 确认：本次为既有插件行为逻辑修改，落在 `dsh-plugin-writer` 声明适用面「新建/骨架/结构性修改」之外）；自守约束不放松：`lib/index.js` 入库产物必须重建一致、最小改动面、不 push 不打 tag。执行侧与接续恢复从本节读取该结论。
- **CD-1 修复合集**：sweep 与全局闸口同批落地。被否「只做 sweep」（重装瞬间旧层已拆、新层未挂，穿透形态复现）；被否「只做闸口」（工具面永远全量，验收 2 不成立）。
- **CD-2 守卫载体**：插件 ctx `ctx.tools.guard`（scopeOf=undefined → global layer；`guardReason` 先查 global dsh-tools:3024；`notify:false` 不自激 tools/change）。被否：per-agent only（即 bug 本身）、`tools/pre-execute` 瀑布（需重论证不可反转 + 全调用 async 化）、包裹 executor/改 mcp-client（动上游）。
- **CD-3 agentless 边界**（D2 落点）：`mcp__*` 全族一律拒（**不读 blocked**——`manager.dispose()` 先清 claim，fail-closed 不得依赖正在被拆的集合）；资源三件套按 `arguments.server` 判定——非空字符串一律拒、不可判定交回工具自身 required 校验（该调用抵达不了任何服务器）。被否「只拒 blocked」（拆卸窗口放行在线服务器）；被否「资源无条件拒」（畸形参数伪装成隔离拒绝，违背「畸形参数从不由隔离面裁决」既有约定）。
- **CD-4 untracked 判定**：`visibleFor(agent)===undefined` → 以 `NO_SERVERS` 代入 `guardReason`/`resourceGuardReason`（与名字面「隐全部 blocked 名」同语义）。被否「全族拒」（误拒 profile 级 codebase-memory——永不在 blocked 集，且文案对它是假的）。
- **CD-5 拒绝文案**：抽 `toolDenyReason` 共用；文案唯一来源 `toolDenyReason`/`resourceDenyReason`。被否「新写闸口文案」（模型可做存在性探测）。
- **CD-6 补挂模块化**：新建 `boot-sweep.ts` 窄端口（key/id/attach()/isTracked/log），可单测。被否「写进 apply()」（需造假 cordis Context，测试签名漂移变红而非 bug 变红——本次修的恰是未被测过的生命周期环）；被否「塞进 IsolationLayer」（层不认识 Agent，破坏无 cordis 可单测前提）。
- **CD-7 补挂时机**：`boot()` = `await attributor.update()` → sweep → `await rescan()`。被否「先首扫」（MCP 连接秒级，把恢复绑回时序依赖）；被否「不等归属」（补挂诊断行打成 `roots=none` 假值，误导排障）。
- **CD-8 补挂串行**：逐条 await（并发让重算 O(N)→O(N²)，日志交错）；attribution 毫秒级，串行代价可忽略。
- **CD-9 attach 幂等**：`attaching: Map<object, Promise<void>>` in-flight join（层内唯一所有者）。被否「已 tracked 早退」（破坏 agent/created 返回 promise = 首步前限制生效的既有契约）；被否「index.ts 去重」（两份表达必漂移）。
- **CD-10 生命周期**：`!isTracked` 时 `agent.ctx.effect(detach)`（仓内先例 user-commands/session-tool-toggle）。被否「听 agent/disposed」（emit 在 unwind 后、插件先卸则监听器已亡，一份所有权拆两源）。
- **CD-11 `agents` 硬注入**：`inject = ['workspaceRegistry','tools','agents']`（base 层服务，不缩窄安装面；兄弟插件同款）。被否「ctx.get 判 undefined 跳过」（现状写法，静默把没补挂写成不需要）；被否「软注入」（子 fiber 重跑致两处生命周期不同步，半瘫无报错）。
- **CD-12 文档与产物必改**：README L94-95 降级矩阵现把本 bug 写成「已知 fail-open 窗口」，不改则文档主动掩盖验收失败；`lib/` 不重建则实机断言全部看到旧行为。
- **执行环境**：隔离。布局：dsh-plugins → `/home/xuqinqin/develop/person/dsh-plugins/.worktrees/project-mcp-isolation-enforcement` @ `feature/project-mcp-isolation-enforcement`（基点 main `287a970`）；装配：`pnpm install`（容器 volta 包装，store 共享）；环境错开：省略（纯 TS 插件仓，无端口/数据库/本地配置项）；创建于 2026-11-05。执行期代码改动落 worktree，工件（tasks/design）落根仓主工作区。
- **基线升级影响裁定（2026-11-06，DSH 0.2.2-rc.1 + cordis 4.1.0）**：上游六项锚点复核全部存活（详见 code-design ⑦ R1），修复设计与 G1-G4 实现零改动沿用；worktree 基点过时须 rebase（两侧文件交集为空，零冲突预期）+ 重装配；G5 验证证据随依赖树换代失效，5.1/5.2 勾选回退重验（非重做实现）；G6 增 profile link 切换前置（web profile 现指向主工作区旧产物）与收尾恢复原指向（归 spec-done），并补 cordis 4.1.0 traceable shadow 的实测观察点（守卫全局层落点与 fiber 卸载释放——静态不可判定，G6.1/6.3 实测兜底，变红即回用户）。

## 触达面清单（① 浓缩，全文见 code-design.md ①）

| 条目 | 文件（仓） | 改动 |
| --- | --- | --- |
| H1 | `根仓·plugins/project-mcp/src/host/isolation.ts` | `GuardedExecution` 增 `agent?: object`；抽 `toolDenyReason`；新增 `GlobalGuardReading`/`GlobalGuardDecision`/`NO_SERVERS`/`globalGuardDecision()`（8 行判定表，前 4 行零端口读）；`IsolationLayer` 增 `attaching` + `isTracked`，attach 拆 claim→start 两段做 in-flight join；模块注释增「global face」段 |
| H2 | `根仓·plugins/project-mcp/src/host/boot-sweep.ts`（**新建**） | `SweepCandidate`/`SweepPorts`/`SweepSummary`/`sweepLiveSessions()`：串行、逐条 catch、live>0 打汇总、live=0 静默、永不 reject；不引任何上游包 |
| H3 | `根仓·plugins/project-mcp/src/host/index.ts` | `inject` 增 `agents`；apply 首帧（任何 await 前）装全局守卫（含节流 warn：前 3 次 + 每 100 次）；`attachAgent()` 单一 attach 路径；`agent/created` 改调它（返回 promise 契约不变）；删 predate 块改 `boot()`（归属→补挂→首扫）；teardown 加 `globalGuard?.()`；文件头注释 7→8 条 |
| H4 | `根仓·plugins/project-mcp/lib/index.js` | esbuild 重建入库（含 `boot: swept`、不含 `predate this load`） |
| T1 | `根仓·plugins/project-mcp/test/isolation.test.ts` | 追加 8 用例（全局判定 6 + attach 幂等/isTracked 2），现有 34 条一字不改 |
| T2 | `根仓·plugins/project-mcp/test/boot-sweep.test.ts`（**新建**） | 5 用例：全量/跳过/失败不中断/静默/串行序 |
| D1 | `根仓·plugins/project-mcp/README.md` | 四处：三面→四面（L59/L69）、诊断行（L74）、降级矩阵 L94-95 必改、L62/L99 补句；历史冒烟表只加注不重跑 |
| S1 | `根仓·openspec/changes/project-mcp-isolation-enforcement/…` | 落档产物（本变更，不进执行批次） |

明确不改（证据见 code-design ①1.6）：`prompt-isolation.ts`（untracked 已 fail-closed）、`mcp-manager.ts`（sync 首帧写 scanned）、`attribution/roots/scan/watcher/triggers/plugin-loader`、判定函数、`package.json`/`cordis.patch.yml`/`build.mjs`、兄弟插件、上游 dsh、dotfiles 仓。

## 接口与数据形状（③ 浓缩）

```ts
// isolation.ts
export function toolDenyReason(toolName: string, server: string): string   // 抽取，文案逐字不变
export interface GuardedExecution { readonly name: string; readonly arguments?: unknown; readonly agent?: object }
export type GlobalGuardReading = 'agentless' | 'untracked' | 'tracked'     // 只进日志，绝不进文案
export type GlobalGuardDecision = { kind: 'allow' } | { kind: 'deny'; reason: string; reading: GlobalGuardReading }
export function globalGuardDecision(
  execution: GuardedExecution,
  blocked: () => ReadonlySet<string>,                                      // 懒读：仅 MCP 名族才调
  visibleFor: (key: object) => ReadonlySet<string> | undefined,
): GlobalGuardDecision
export class IsolationLayer { /* + */ private readonly attaching: Map<object, Promise<void>>; isTracked(key: object): boolean }

// boot-sweep.ts（新建）
export interface SweepCandidate { readonly key: object; readonly id: string; attach(): Promise<void> }
export interface SweepPorts { isTracked(key: object): boolean; readonly log: ScanLog }
export interface SweepSummary { readonly live: number; readonly attached: number; readonly skipped: number; readonly failed: number }
export async function sweepLiveSessions(candidates: readonly SweepCandidate[], ports: SweepPorts): Promise<SweepSummary>
```

判定表行序（实现顺序）：①非 MCP 名族→allow（零端口读）②agentless+`mcp__`→deny（不读 blocked）③agentless+资源+server 非空串→deny ④agentless+资源+server 不可判定→allow（交回校验）⑤⑥tracked→`guardReason`/`resourceGuardReason` ⑦⑧untracked→同函数代 `NO_SERVERS`。日志形状：`boot: swept <live> live session(s): attached <a>, already tracked <s>, failed <f>`（取代 predate 行）；`isolation: global guard denied <tool> (no calling agent|untracked session); <n> such denial(s)`（节流）。无新配置键。八条不变式（code-design ③3.8）：单一判定源/单一 attach 路径/守卫随 fiber/幂等/fail-closed 不依赖 claim 集/零端口读放行非 MCP/文案唯一/不阻塞装配。

## 逐任务组要点（⑤ 浓缩，组间串行 G1→G7）

- **G1 隔离层（H1）**：按判定表实现 `globalGuardDecision`（先判名族→再判 agent→懒读 blocked）；attach 拆 claim→start；出口 = typecheck/lint 0 + 4 条 grep 锚。禁改判定函数与 `IsolationPorts`。
- **G2 补挂模块（H2）**：汇总行文案逐字；出口 = typecheck + `boot: swept` 1 行 + 不引上游包（grep 0）。
- **G3 装配（H3）**：顺序敏感（inject→全局守卫→attachAgent→agent/created→boot→teardown）；出口 = 7 条 grep 锚（含 `predate this load` 计 0）。禁改 `performRescan` 序与返回值契约。
- **G4 测试（T1/T2）**：8+5 用例断言逐字（见 code-design ⑤ G4），红基线 = G1/G2 未实施时 import 即败。
- **G5 产物重建+全量回归（H4）**：build→grep 产物 3 锚→`import()` 导出 `apply,inject,name`→根仓 `pnpm typecheck && lint && test`（TMPDIR=/tmp、engines WARN 忽略、multi-root 5 skip）。
- **G6 实机验收**：冷启动基线（`boot: swept` 行 + dsh-plugins `roots=2 visible=[]`）→ 实调必拒（字面文案 + 无 `rm-uf` 地址）→ deny 集外正常 → 工具面断言（`/tmp/stt-read-session.cjs` 解帧最新 `request/header` 无 deny 名）→ **重载复现**（`dsh plugin --profile web add link:` 触发 fiber 替换，不刷新页面，实调仍拒）→ C/D 形态抽查 → `/mcp-reload` 回执。禁带副作用工具复现、yunxiao 403 不作判据。
- **G7 文档与落档（D1）**：README 四处 + 历史表注记；出口 = 4 条 grep（`工具面两层强制` 0、`已知 fail-open 窗口` 0、全局闸口 ≥2、`boot: swept` ≥1）。

## 假设与未决项（⑥ 浓缩，全文 A1-A12/U1-U4 见 code-design ⑥）

关键假设：A1 `exec.agent` 与 attach key 同一身份（证伪则改 id 映射）；A3 插件 ctx guard 落 global 且先行（证伪则修复失效）；A5 `agents.list()` 含存量+子代理且注册序稳定（同款用法 session-tool-toggle 先例）；A8 restriction 对下一次装配生效（已装配请求保持旧面）。未决（不阻塞）：U1 tracked 双判微秒级开销留观；U2 补挂 attribution 窗口内该会话自有工具短暂被拒（fail-closed 方向，毫秒级）；U3 旧 guard 闭包内存残留（无害）；U4 manager 拆卸瞬间与 D3 同源窗口。**落档期待决 P1-P4 见分歧点提问**（验证触发方式 / agentless 长期口径 / README 历史表 / 上游不跟进）。
