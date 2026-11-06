# Proposal

## Why

project-mcp 的归属判定与名字面隔离已达标（deny 集对账精确、`tracked=no` 会话的名字段 fail-closed），但隔离的**执行层存在系统性穿透缺口**：隔离安装与 `agent/created` 事件单点绑定，插件（重）加载时已存活的 agent 不再触发该事件——旧 fiber 的 teardown 主动拆除其 restriction 与 guard，新 fiber 只打 `boot: N session(s) predate this load` 日志放任。本机实证（2026-11-05）：长寿会话 `session-8624cadb`（cwd=dsh-plugins）在 07:10 插件重载后被孤儿化，07:16 起请求头携带全量 136 台 MCP 工具 schema，08:36 实调 `mcp__dbx-brains__dbx_list_connections` 穿透返回含生产 RDS 地址的真实数据（`isError:false`）；名字面全程正常（fail-closed 隐藏 6 台），掩盖了工具面与调用面的双重失效。触发条件高频：每次插件重装/升级/HMR 都会孤儿化当时全部活跃会话，直到用户刷新页面重新 attach。

## What Changes

- **启动补挂（boot sweep）**：插件 apply 时对 `agents.list()` 枚举的全部存活 agent（含子代理）幂等补挂隔离（未跟踪才挂，走与 `agent/created` 完全相同的 attach 路径）；boot 顺序固化为「归属表发布 → 补挂 → 首扫」，替换现有「predate 放任」日志为 `boot: swept N live session(s)` 记账行
- **全局层守卫（全局闸口，第四面）**：插件在无 scope 的插件 ctx 上 `ctx.tools.guard(...)`（落 ToolRuntime global layer，`guardReason` 链第一环）；tracked agent 按现行 `guardReason`/`resourceGuardReason` 同语义判定，untracked agent 与**无发起者**（`exec.agent === undefined`）的调用 fail-closed 一律拒（拒绝文案与 per-agent 分支一致，模型不可区分）；与 per-agent guard 同判不冲突（任一命中即拒）
- **attach 幂等（in-flight join）**：同 key 并发 attach 加入第一次调用，不装第二份 guard/restriction——`agent/created` 与补挂在启动竞态下相遇时保持单一实例
- **`GuardedExecution` 窄接口扩展**：增 `readonly agent?: object`（只取身份，不引上游 Agent 类型）
- **teardown 维持现状**：`isolation.dispose()` 主动 lift 不变（干净所有权），重载窗口由 sweep 毫秒级补挂 + 全局闸口封死
- 测试：`test/isolation.test.ts` 追加全局守卫判定与 attach 幂等用例（现有 34 条一字不改）、新建 `test/boot-sweep.test.ts`（补挂/跳过/失败不中断/串行/静默五形态）
- 实机验收**必须含「插件重载后旧会话」复现路径与实调用例**（本次缺口漏网的直接原因是不做实调）
- 不改：归属判定、名字面（prompt-isolation）、`deriveDeny`/`guardReason`/`resourceGuardReason` 判定语义、上游 dsh 源码（只读参考，插件侧 API 足以闭环）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-project-mcp`：「工作区可见性隔离」Requirement 增补执行层强制语义——未跟踪 agent 与无发起者调用的 fail-closed 闸口、隔离不得依赖单一 agent 生命周期事件；「隔离的动态刷新」Requirement 增补插件（重）加载时对已存活 agent 的补挂义务与幂等语义。既有归属判定句、三面隔离条文与全部既有 Scenario 不变

## Impact

- **代码**（根仓 dsh-plugins 子包 `plugins/project-mcp/`）：`src/host/isolation.ts`（全局守卫判定纯函数 + `GuardedExecution.agent` + attach in-flight join + `isTracked`）、`src/host/boot-sweep.ts`（**新建**，窄端口可单测编排）、`src/host/index.ts`（`inject` 增 `agents`、apply 首帧装全局守卫、`attachAgent` 单一路径、boot 顺序重排、teardown 收守卫）、`test/isolation.test.ts`（追加）、`test/boot-sweep.test.ts`（**新建**）、`lib/index.js`（重建入库——web profile 为 `link:` 安装指向本仓，不重建则实机无变化）、`README.md`（三面→四面、降级矩阵、诊断行、排障四处同步，含**必须改掉的「已知 fail-open 窗口」矩阵行**）
- **不改**：`attribution.ts`/`roots.ts`/`scan.ts`/`watcher.ts`/`triggers.ts`/`plugin-loader.ts`/`prompt-isolation.ts`/`mcp-manager.ts`、`package.json` 版本、`cordis.patch.yml`、`build.mjs`、兄弟插件、上游 dsh
- **部署事实**：上游为 dsh 0.2.1-rc.5（`agents.list()`/`ctx.tools.guard` global 层/`guardReason` 全局先行均已核实）；发版（release/tag/push）后移为既有 Q3 批次动作；验收需重装 web profile 插件（link: 重装触发 fiber 替换）
