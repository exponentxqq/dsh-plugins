# Tasks

> 执行批次契约：`## N.` 编号即执行顺序，**组间严格串行**；组内任务互不依赖可并行。每任务描述引用 `code-design.md` 触达面清单条目编号（H1-H4/T1/T2/D1）。深度契约与逐组要点见本目录 `code-design.md` ⑤（G1-G7 与本表 1-7 一一对应）。发版（release/tag/push）后移为既有 Q3 批次动作；验收实调一律只用只读工具、yunxiao 403 不作判据（需求原文红线）。

## 1. 隔离层：全局守卫判定 + attach 幂等（G1，文件 H1）

- [ ] 1.1 改 `plugins/project-mcp/src/host/isolation.ts`（触达 H1）：`GuardedExecution` 增 `readonly agent?: object`；抽 `toolDenyReason(toolName, server)`（`guardReason` 改调它，文案逐字不变）；新增 `GlobalGuardReading`/`GlobalGuardDecision`/`NO_SERVERS`/`globalGuardDecision(execution, blocked, visibleFor)` 按 code-design ③3.2 八行判定表实现（先判名族→再判 agent→懒读 blocked，前四行零端口读）；`IsolationLayer` 增 `private readonly attaching = new Map<object, Promise<void>>()` 与 `isTracked(key)`，`attach` 拆「同步 claim Tracked → start（装 guard + recompute）」两段做 in-flight join（同 key 第二次调用 await 第一次 promise，`finally` 按对象身份清条目；`detach` 后可重新 attach；失败语义不变）；模块头注释（L1-42）增「the global face」段（三面→四面）；验证：`pnpm --filter dsh-plugin-project-mcp typecheck` 与 `pnpm --filter dsh-plugin-project-mcp lint` 均 exit 0，`grep -c "export function globalGuardDecision" plugins/project-mcp/src/host/isolation.ts` 输出 1，`grep -c "export function toolDenyReason" plugins/project-mcp/src/host/isolation.ts` 输出 1，`grep -n "readonly agent?: object" plugins/project-mcp/src/host/isolation.ts` 恰 1 行，`grep -n "private readonly attaching" plugins/project-mcp/src/host/isolation.ts` 恰 1 行

## 2. 补挂模块（G2，文件 H2）

- [ ] 2.1 新建 `plugins/project-mcp/src/host/boot-sweep.ts`（触达 H2，标「新建」）：`SweepCandidate`/`SweepPorts`/`SweepSummary`/`sweepLiveSessions(candidates, ports)` 按 code-design ③3.4——逐条 `isTracked` 跳过、`await attach()` 成功/失败计数、单条失败 `log.error('boot: cannot attach the workspace isolation of session <id>: <error>')` 不中断、`live>0` 末尾打一条汇总（文案逐字 `boot: swept ${live} live session(s): attached ${attached}, already tracked ${skipped}, failed ${failed}`）、`live===0` 静默、永不 reject；只 `import type { ScanLog } from './types.ts'` 不引上游包；验证：`pnpm --filter dsh-plugin-project-mcp typecheck` exit 0，`grep -n "boot: swept" plugins/project-mcp/src/host/boot-sweep.ts` 恰 1 行，`grep -c "from '@deepseek-ai" plugins/project-mcp/src/host/boot-sweep.ts` 输出 0

## 3. 装配（G3，文件 H3）

- [ ] 3.1 改 `plugins/project-mcp/src/host/index.ts`（触达 H3）：`inject` 增 `'agents'`；构造 `isolation` 后任何 await 前注册 `ctx.tools.guard(...)`（闭包调 `globalGuardDecision(execution, () => manager.blockedServerNames(), (key) => isolation.visibleFor(key))`，`reading !== 'tracked'` 时节流 warn：前 3 次 + 每 100 次，安装失败仅 error）；抽 `async attachAgent(agent)`（`!isolation.isTracked(key)` 才 `agent.ctx.effect` 注册 detach，随后 `isolation.attach(key, agent.session.header.cwd, scopedTools(agent.ctx, key))`）；`agent/created` 改调 `attachAgent`（返回 promise 契约不变）；删 L248-259 predate 块，新增 fire-and-forget `boot()`（`await attributor.update(workspaceRoots(ctx))` → `ctx.agents.list()`（读失败仅 error 按 0 处理）→ `sweepLiveSessions(live.map(agent→{key,id,attach}), …)` → `await rescan()`）；teardown 增 `globalGuard?.()`；现 L31 空 import 换 `import type { Agent } from '@deepseek-ai/dsh-agent'`；文件头注释第 2/5/7 条同步改写；验证：`pnpm --filter dsh-plugin-project-mcp typecheck` exit 0，`grep -n "export const inject" plugins/project-mcp/src/host/index.ts` 含 `'agents'`，`grep -n "ctx.tools.guard" plugins/project-mcp/src/host/index.ts` 恰 1 行，`grep -c "predate this load" plugins/project-mcp/src/host/index.ts` 输出 0，`grep -n "await sweepLiveSessions" plugins/project-mcp/src/host/index.ts` 恰 1 行，`grep -n "globalGuard?.()" plugins/project-mcp/src/host/index.ts` 恰 1 行，`grep -c "isolation.attach(" plugins/project-mcp/src/host/index.ts` 输出 1

## 4. 测试（G4，文件 T1/T2）

- [ ] 4.1 `plugins/project-mcp/test/isolation.test.ts`（触达 T1）追加两组共 8 用例（断言逐字照 code-design ⑤ G4 清单 1-8：非 MCP 零端口读 / agentless 工具拒且文案与 `guardReason(…, new Set(['figma']), new Set())` 同文 / agentless 资源按 server 拒且 `reason === resourceDenyReason(server)` / server 不可判定（`undefined`/`{}`/`{server:1}`/`{server:''}`）allow / untracked 只拒 blocked（`mcp__codebase-memory__search` allow）/ tracked 按自有 visible 判 / 同 key 两次 attach 后 `io.guards.length===1 && io.restrictions.length===1` / `isTracked` false→attach→true→detach→false），现有 34 条一字不改；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/isolation.test.ts` 全绿（34+8=42 passed）
- [ ] 4.2 新建 `plugins/project-mcp/test/boot-sweep.test.ts`（触达 T2，标「新建」）5 用例：全量补挂（`{live:3,attached:3,skipped:0,failed:0}` 且日志恰 1 行 `boot: swept 3`）/ 跳过已跟踪（`attached:1,skipped:2`）/ 中间单条 reject 不中断（`failed:1`、末条仍 attached、errors 含 session id）/ `live===0` 静默（infos 为空）/ 串行序（attach 内 push id 断言 `['a','b','c']`）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/boot-sweep.test.ts` 5 passed，且 `pnpm --filter dsh-plugin-project-mcp test` 全量 exit 0（无跨插件回归）

## 5. 产物重建 + 全量回归（G5，文件 H4）

- [ ] 5.1 重建 `plugins/project-mcp/lib/index.js`（触达 H4）：`pnpm --filter dsh-plugin-project-mcp build` exit 0；验证：`grep -c "boot: swept" plugins/project-mcp/lib/index.js` ≥1，`grep -c "predate this load" plugins/project-mcp/lib/index.js` 输出 0，`grep -c "global guard denied" plugins/project-mcp/lib/index.js` ≥1，仓库根 `node --input-type=module -e 'const m = await import("./plugins/project-mcp/lib/index.js"); console.log(Object.keys(m).sort().join(","))'` 输出 `apply,inject,name`
- [ ] 5.2 根仓全量回归（TMPDIR=/tmp 口径；engines WARN 忽略、multi-root 5 个既有 skip 沿用归档 R1-R3 注意点）；验证：仓库根 `pnpm typecheck && pnpm lint && pnpm test` 均 exit 0

## 6. 实机验收（G6，无项目文件写；重载触发方式按落档 P1 裁定执行，缺省 A）

- [ ] 6.1 冷启动基线 + 实调必拒：重启承载 web profile 的 dsh 进程后新开 cwd=dsh-plugins 会话；验证：`docker logs dsh --timestamps 2>&1 | grep -E "boot: swept|isolation: cwd=" | tail -20` 出现 `boot: swept` 行且 dsh-plugins 会话行 `roots=2 visible=[]`、`masked 119`；该会话实调 `mcp__dbx-brains__dbx_list_connections` 返回逐字 `Error: tool mcp__dbx-brains__dbx_list_connections belongs to MCP server dbx-brains, which is not configured for this session's workspace` 且输出不含 `rm-uf` 前缀；同会话调任一 `mcp__codebase-memory__*` 正常返回（deny 集外不受影响）
- [ ] 6.2 工具面断言（验收 2）：以 6.1 会话 id 解帧最新请求头；验证：`node /tmp/stt-read-session.cjs /home/docker/.dsh/sessions/*/"$SID"/session.v4.jsonl.zstd | node -e 'const l=require("node:fs").readFileSync(0,"utf8").trim().split("\n").map(JSON.parse).filter(e=>e.type==="request/header").at(-1);console.log(l.data.header.tools.map(t=>t.name).filter(n=>n.startsWith("mcp__")).join("\n"))'` 输出不含 `mcp__dbx-brains__`/`mcp__yunxiao__`/`mcp__figma` 且含 `mcp__codebase-memory__`
- [ ] 6.3 重载复现（本 bug 原始路径）：保持一个 dsh-plugins 会话开着，触发 fiber 替换（缺省 `docker exec dsh dsh plugin --profile web add link:/home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp`；失败按 P1 兜底约时重启进程）；验证：日志出现新的 `boot: swept` 行，**不刷新页面**同一会话实调 6.1 同款工具仍返回同款拒绝文案，且其下一次请求头（6.2 同法）仍无 deny 名
- [ ] 6.4 多工作区抽查（验收 4，C/D 形态）与回归：新开 cwd=brains 会话与一个无任何 mcp 配置目录的会话；验证：brains 会话日志 `roots=1 visible=[dbx-brains]` 且实调 `mcp__dbx-brains__dbx_list_connections` 正常返回、`mcp__dbx__dbx_list_connections` 被拒；无配置会话 `visible=[]`；`/mcp-reload` 回执计数无新增失败/跳过

## 7. 文档同步（G7，文件 D1）

- [ ] 7.1 改 `plugins/project-mcp/README.md`（触达 D1）四处：L59「工具面两层强制」→三层（restriction/per-agent guard/全局闸口）；L69 同段补全局闸口一句；L74 诊断行换 `boot: swept` 文案并补全局守卫 warn 行；L94-95 降级矩阵两行必改（删「已知 fail-open 窗口」表述，改为重载补挂+闸口语义）；L62/L99 各补一句（重载补挂、回滚代价含全局闸口）；L108 起历史冒烟表只加一行注记「本表早于 isolation-enforcement（2026-11-05），重载行为以新矩阵为准」不重跑（P3 裁定）；验证：`grep -c "工具面两层强制" plugins/project-mcp/README.md` 输出 0，`grep -c "已知 fail-open 窗口" plugins/project-mcp/README.md` 输出 0，`grep -c "全局闸口\|全局守卫" plugins/project-mcp/README.md` ≥2，`grep -c "boot: swept" plugins/project-mcp/README.md` ≥1

## Workflow follow-up

- 发版批次（Q3 既有后移动作）：`pnpm release <版本>` → 容器内 `git push origin main --tags`；acp/headless profile 按 tag 重装（口径同归档变更 follow-up）
- U3 旧 per-agent guard 闭包清理、U1 tracked 双判收敛、上游「agent 存活通知」feature request（P4 裁定不跟进）均为独立后续项，不属本变更
- 归档：任务全部完成并实机复验后按 OpenSpec 流程 archive（delta 合并入权威 spec）
