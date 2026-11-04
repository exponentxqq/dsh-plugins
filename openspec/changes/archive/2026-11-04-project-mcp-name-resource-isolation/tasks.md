# Tasks

> 执行契约：`## N.` 组 = 执行审核批次，**组间严格串行、组内可并行**；组内任务互不依赖且**不写同一文件/目录**（「可并行」判据）；因依赖或写冲突而无法并行的任务单独成组；单组任务数 ≤ 8；**每组结束必须 `pnpm --filter dsh-plugin-project-mcp typecheck` 通过**。每任务描述末尾引用 `code-design.md` 触达面清单的条目编号（H*/T*/D*），验证句均为第三方可核对命令或断言。
>
> 输入材料：`proposal.md`、`specs/dsh-project-mcp/spec.md`、`design.md`、`code-design.md`（含「落档决议 R-1…R-5」，与本文冲突时以决议为准）、`diff-matrix.md`。

## 1. 关键 spike（2 项，可并行：各自独立 `DSH_HOME`/端口，不改源码）

- [x] 1.1 名字面段契约与组装行为实证：独立 `DSH_HOME` + 独立端口（`dsh --profile web --port 3099 --no-open`）实例上放两台 probe 服务器（各含 `ping` 工具 + 一条 resource + 非空 `instructions`），逐条记录「命令 + 观察」到 `openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md`：① 资源服务器名段逐字形态（`## MCP resource servers` + 句末 `["a","b"].`）；② `mcp:<server>` 段名与 `### MCP server: <name>` 标题；③ 段对象带 `interpolate: false`；④ 未打标签的 `ctx.on('system-prompt/assemble')` 收到每个 scope 的装配、改写 `assembly.sections` 后下一步生效；⑤ `complete` 段存在时 mutations 被丢弃的实测确认（触达：D4；无源码改动）；验证：`test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md` 且 `[ "$(grep -c '^结果：通过' openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md)" -eq 5 ]`；任一条红则停止并上报，不得进入组 2。
- [x] 1.2 守卫参数形态实证（独立实例，端口 3098）：以临时探针插件（放 `artifacts/`，不进产物）装 `agent.ctx.tools.guard` 打印 `execution.arguments`，覆盖原生 `list_mcp_resources(server=…)`、`read_mcp_resource`、`run_code` 内层 dispatch、缺 `server`、`server` 非字符串、profile 级服务器调用；并确认 deny 后目标 probe 服务器日志无新增请求（触达：D4；无源码改动）；验证：`[ "$(grep -c '^结果：通过' .../artifacts/spike-guard-arguments.md)" -eq 6 ]` 且摘录里出现带 `parent` 的 PTC 调用记录、`diff <(…before) <(…after)` 为空。

## 2. 纯函数、闸门与读数（3 项，可并行；组末 typecheck 绿）

- [x] 2.1 新建 `src/host/prompt-isolation.ts` 纯函数层（段名常量、窄类型、`rewriteResourceNames` 多策略解析、`planNameFilter`、`hiddenServers`、`sample`；不含 `ctx`/监听器代码）并新建 `test/prompt-isolation.test.ts` 纯函数部分（触达：H1、T1）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0，且断言 `rewriteResourceNames('… server argument: ["a","b"].', new Set(['b']))` → `{kind:'rewritten', kept:['a'], removed:['b']}`、空文本 → `{kind:'kept'}`、`'garbage'` → `{kind:'unparsable'}`、全移除 → `{kind:'empty'}`、`planNameFilter` 对 `mcp:probe-b` 段返回 `removedSections:['mcp:probe-b']` 且改写段保留 `interpolate:false`。
- [x] 2.2 `src/host/isolation.ts` 落三面闸门与 `blocked` 口径（`RESOURCE_TOOLS`、`resourceDenyReason` 与上游 unavailable 同形、`GuardedExecution`、`ScopedTools.guard` 形参放宽、`IsolationPorts.managedServerNames()` → `blockedServerNames()`、`deriveDeny`/`guardReason`/`carried`/retry 统一 blocked、新增 `resourceGuardReason` 与 `visibleFor`、扩展 `attach()` 的 guard 闭包），**同任务内**改 `src/host/index.ts` 的 `IsolationLayer` 构造传 `blockedServerNames`（端口改名与接线必须同批完成，保证组末 typecheck 绿），并改 `test/isolation.test.ts`（触达：H2、H4、T2）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/isolation.test.ts` 退出码 0，且断言三工具越权均返回 `resourceDenyReason('probe-b')` 且与「不存在 server」的上游文案一致、`arguments` 为 `undefined`/`null`/`'x'`/`[]`/`{}`/`{server:1}` 时返回 `undefined`、`blocked` 不含该名时返回 `undefined`、`visibleFor(unknownKey) === undefined`、项目 claim 与 profile 同名加载失败时 profile 的 `mcp__probe-shared__*` 不被 deny。
- [x] 2.3 `src/host/mcp-manager.ts` 新增 `failedClaims` 维护与 `failedServerNames()`/`blockedServerNames()` 读数（claimed 两个既有方法行为不变，只补口径 doc）；同步改 `test/mcp-manager.test.ts`（触达：H3、T3）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/mcp-manager.test.ts` 退出码 0，且断言「一台加载失败后 `failedServerNames()` 含它、`blockedServerNames()` 不含它、`managedServerNames()` 含它」「加载成功/卸载/移出扫描后三者相应消失」「`blockedServerNames()` 恒等于声称集减失败集」。

## 3. 名字面监听器与接线（1 项，因依赖单独成组）

- [x] 3.1 在 `src/host/prompt-isolation.ts` 增监听器层（`PromptIsolationPorts`、`AssembleListener`、`declare module` 事件声明、`isNameSurface`、`overHide`、`createAssembleListener`：先 `next()`、无相关段不读端口、异常 over-hide、前 5 次 + 形状变化限流、`unparsable` warn 前 3 次），扩 `test/prompt-isolation.test.ts` 监听器部分，并在 `src/host/index.ts` 注册 `ctx.on('system-prompt/assemble', createAssembleListener({...}))`、加 boot 观测行、模块头步骤清单补第 6 步（触达：H1、H4、T1；依赖 2.1 的纯函数与 2.2 的端口改名）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0，且断言「`next` 恰好一次且先于端口读」「未跟踪 agent → 项目名全隐 + profile 名保留」「`context.agent` 与 `context.scope` 其一生效」「端口抛错 → 所有 `mcp:` 段消失」「`changed=false` 返回同一对象引用」「同形状连续 6 次只产生 1 条 info」；`pnpm --filter dsh-plugin-project-mcp typecheck` 与 `lint` 退出码 0，`grep -n "system-prompt/assemble" plugins/project-mcp/src/host/*.ts` 命中两文件各一处、`grep -n "agents.list()" plugins/project-mcp/src/host/index.ts` 命中。

## 4. 静态门禁（1 项）

- [x] 4.1 静态门禁：`pnpm --filter dsh-plugin-project-mcp verify:all`、`pnpm dsh:check`、`docker exec dsh dsh --profile web|acp|headless --dump-config-schema`（触达：H1/H2/H3/T1/T2/T3、D4）；验证：以上命令全部退出码 0，且 `! grep -qE "^import .*@deepseek-ai" plugins/project-mcp/lib/index.js` 与 `grep -q "mcp-resource-servers" plugins/project-mcp/lib/index.js` 均成立。

## 5. 隔离实例端到端冒烟（1 项；依赖组 4 的构建产物）

- [x] 5.1 复用 1.1 fixture（A/B 两工作区 probe + 一台 profile 级 probe），逐条记录「命令 + 观察」到 `artifacts/smoke-record.md`：① 名字面（A 会话提示词只含 A 项目名 + profile 名，不含 B 名；`### MCP server: probe-b` 零命中）；② 资源面允许（A 会话读 probe-a 成功）；③ 资源面拒绝且不触达（A 会话对 probe-b 三工具全 `isError`，拒绝文案与上游 unavailable 同形，且 probe-b 服务器请求日志行数前后相等）；④ 无归属 fail-closed（`/tmp` 会话名字全隐、资源全拒）；⑤ profile 不受影响（三会话对 profile probe 名字可见、资源可读）；⑥ 动态刷新（删 A 配置 → 下一步名字与资源同步变化，`/mcp-reload` 后一致）；⑦ 工具面回归 + `session-tool-toggle` 面板行为不变；⑧ PTC 内层 `read_mcp_resource(server=probe-b)` 同样被拒；⑨ 项目 claim 与 profile 同名加载失败（`probe-shared`）→ profile 工具与资源均不被误伤（触达：D4、D2 证据表）；验证：`test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md` 且 9 条各含「命令：」与「观察：」，第③条附 `diff <(…before) <(…after)` 为空。

## 6. 规范与文档（3 项，可并行）

- [x] 6.1 校验 spec delta 与需求一致性：`openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md` 覆盖名字段/指令段/空数组/解析失败降级/无归属/profile 保留/资源三工具拒绝且不触达/文案同形/参数交回校验/PTC/历史不追溯/人类 UI 边界/加载失败 claim 不误伤/动态刷新（触达：D1）；验证：`openspec validate --all` 退出码 0 且 `[ "$(grep -c '^#### Scenario:' …/specs/dsh-project-mcp/spec.md)" -ge 20 ]`。
- [x] 6.2 改写 `plugins/project-mcp/README.md`：非目标 `:152` 改为已交付、补三面行为与 `blocked`/`visible` 口径、工具面口径修正说明、降级矩阵（无 `systemPrompt`/无 `mcpResources`/段格式漂移/HMR 后存量会话/agentless 调用）、残余边界（人类 UI/全局注册层/升级前历史）、回滚代价、冒烟证据表两列（触达：D2）；验证：`grep -n "资源面" plugins/project-mcp/README.md` 与 `grep -n "blocked" plugins/project-mcp/README.md`、`grep -n "prompt: resource names" plugins/project-mcp/README.md` 均命中，且 `! grep -q "若需资源面隔离应另开提案" plugins/project-mcp/README.md`。
- [x] 6.3 更新根 `README.md:77` 与根 `AGENTS.md:21` 的插件描述，追加「名字（资源服务器名与服务器指令段）与资源面隔离」（触达：D3）；验证：`grep -n "资源面隔离" README.md AGENTS.md` 两处均命中。

- [x] 6.4 修复失败 claim 重试窗口（G6 组内追加，R-12 裁定）：`src/host/mcp-manager.ts` 的 `reconcile()` 在尝试加载一名（进入重试）时先从 `failedClaims` 剔除、失败再补记——使「重试连接中」重新落入 `blocked`（spec Scenario「加载中的 claim 仍受隔离保护」的 fail-closed 要求；当前实现该窗口 fail-open）；同步扩 `test/mcp-manager.test.ts`（重试 pending 时 `blockedServerNames()` 含该名、失败后重新剔除、成功后保持剔除）；复跑 `test/isolation.test.ts` 与全量 vitest、typecheck（触达：H3、T3）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run` 退出码 0 且 typecheck 0，新断言「重试 pending 时 blocked 含该名」在档。

## 7. 发布（1 项，串行末位）

- [ ] 7.1 按仓库统一版本流程发布：`pnpm release --dry-run` 复核版本与文件清单 → `pnpm release <version>` → `lib/` 重建随提交 → profile 以 `link:` 重装并重启 → 复跑冒烟第①②③⑨条（触达：H1/H2/H3/H4 产物 + D2 的版本/回滚段）；验证：`pnpm release --dry-run` 打印的版本高于当前 tag 且文件清单含 `lib/index.js`；`pnpm verify` 与 `pnpm dsh:check` 退出码 0；重启后 `docker exec dsh dsh plugin --profile web list | grep project-mcp` 显示新版本；`docker logs dsh | grep -c "prompt: resource names"` ≥ 1。
  > **2026-11-04 用户裁定（发布收窄）**：不走 tag 发布，改以 link 安装 + 真机重启验证；本次变更以「归档 + 本地提交（不推送、不建 tag）」收口，7.1 保持未勾，待后续以 `pnpm release v1.5.1` 单独补做。真机自证（web profile 重启后 `docker logs`，新 lib 19:22 重建 / 实例 20:40 启动）：名字面 `prompt: resource names … kept=[chrome-devtools-mcp,codebase-memory] removed=[dbx,dbx-brains,dbx-family,figma,figma-family,yunxiao] … unparsable=0`（其中 kept 与会话 runtime 的 MCP 列表逐项一致，另一会话 `kept=[codebase-memory]` 呈现按会话差异过滤）；工具面 `isolation: … deny=119` + `masked 119 tool(s)`；热重载 `tools/change received (#1..#3)`。资源面拒绝（③）与失败降级（⑨）沿用 fixture 冒烟红绿在档，真机未重复触发。

## 附录：执行期运行规则留痕（R-6 起，与落档决议 R-1…R-5 同序列延续）

- **R-6 `execution.arguments` 恒为冻结 JSON 对象，缺参为 `{}`（非 `undefined`）**。依据：G1-1.2 实测（`artifacts/spike-guard-arguments.md` ④）。适用范围：资源面守卫判定。连锁面：2.2 `resourceGuardReason` 按 `typeof args.server === 'string'` 判定即可（`undefined`/`{}` 自然放行交回上游校验）；T2 断言组含 `{}` 放行；G5 冒烟④。
- **R-7 非字符串 `server` 仅 PTC 内层可产出**：原生调用在 schema 约束下被模型自行字符串化（实测两次 `"123"`/`"{}"`）。依据：G1-1.2 ⑤。适用范围：单测与冒烟对「非字符串」场景的覆盖路径。连锁面：T2 的 `{server:1}` 断言走纯函数直测；G5 冒烟⑧用 PTC 路径实测非字符串。
- **R-8 装配段对象不带 `complete` 标志；存在 complete 段时监听器 mutations 全部被丢弃（`sections` 整体替换为 `[completeSection]`）**。依据：G1-1.1 ⑤（源码 `dsh-system-prompt/lib/index.js:381-403` + minimal 预设实测）。适用范围：名字面监听器实现。连锁面：3.1 `createAssembleListener` **不写 complete 特判**（对 complete 会话是安全 no-op）；T1 监听器测试不造 complete 场景；README/G5 无需覆盖 complete 会话的名字面。

- **R-9 rc.5 上游已声明 `system-prompt/assemble` 事件 → `AssembleListener` 泛型化；限流口径以验证句为准**。依据：3.1 实测 TS2345（rc.5 `dsh-agent` 类型树经 `dsh-system-prompt` 在 `Events` 声明该事件，返回 `Promise<PromptAssembly>`；本地窄声明合并为重载后逐字非泛型别名不可赋值；「就地 import type」不可行——该包非本包 devDep）。决策（Lead 裁定）：**不增 devDep**（维持 D-9 零依赖意图），`AssembleListener` 改 `<A extends PromptAssemblyLike>(assembly: A, context: AssembleContextLike, next: () => Promise<A>) => Promise<A>`（实现内 3 处 `as A`，spread 保留全字段只换 sections）；诊断 info 限流取「形状首现即报 + 形状变化才报，同形静默」（design「前 5 次」旧稿与 tasks.md T1 断言「6 次同形 = 1 条」互斥，按第 5 条输入材料约定以验证句为准）。连锁面：G5 冒烟诊断行观察按此口径；README 降级矩阵不受影响；T1 已覆盖；若未来给 project-mcp 增补 `@deepseek-ai/dsh-system-prompt` devDep 可恢复逐字别名（非本期）。

- **R-10 G4 web profile dump-config-schema 红灯 = 既有环境问题，用户裁定例外通过（2026-11-04）**。事实：acp/headless 退出码 0；web 退出码 1，4 条 error（/187-/190）全部指向官方 `@deepseek-ai/dsh-agent-preset` 的 preset-standard/ptc/minimal/cordis 行——该插件用 `static [EntryGroup.key] = true` 自定义承载器，rc.5 schema dumper 只认原生 `cordis:group`/`cordis:include`（`dsh-app-boot` `carrier()`）；仅 web profile 装了承载它的 `@deepseek-ai/dsh-experimental-agent-team-profile`，故独红。本插件（project-mcp 及全部 link 插件）三 profile **零诊断**——门禁意图（本插件配置面干净）达成。裁定：4.1 记例外通过；不处置 live profile（禁用 agent-team bundle 属用户在用功能）。连锁面：G7 发布复跑 `pnpm dsh:check`（与 dump 网关无关）不受影响；若上游后续修复 dumper 可在下一轮升级复跑三条 dump 命令转正；README 已知问题段随 G6 提及一条。

- **R-11 G5 冒烟三项口径裁定（2026-11-04，9/9 通过）**：① **无归属会话的诊断形态 = `tracked=yes roots=none visible=[] kept=[profile名] removed=[项目名]`**（design D-6 原义：`tracked=no hidden=<n>` 专指「未被隔离层跟踪」的会话——HMR 存量/agentless；无归属是「已跟踪、归属为空」）——tasks.md ④ 描述措辞系落档时混写，以行为为准；G6 README 诊断段写清两形态。② **`/tools off mcp:<server>` 与资源面正交**（只关 schema + 指令段，不关 resource provider）= design D-7 既定边界（会话开关是用户偏好，资源守卫是工作区安全边界，取交集不取等同）；README「与 session-tool-toggle 的交互边界」如实记载。③ **失败 claim 每次 rescan 重试并重复记 error（实测 58 行）**为既有噪声，与 scan 冲突日志同类，不修；README 诊断段提示一句。连锁面：G6 两处 README 措辞；G7 复跑①②③⑨（fixture /tmp/spike-smoke/ 保留）。

- **R-12 失败 claim 重试窗口 = 代码修复（6.4，Lead 裁定 2026-11-04）**：6.1 校验发现——曾失败的 claim 在 reconcile 重试期间名字仍留 `failedClaims` → 不在 `blocked` → 重试连接窗口内其它工作区可短暂见/调（fail-open），违背 spec Scenario「加载中的 claim 仍受隔离保护」与 D-12「宁多拒不泄漏」。裁定**修代码而非澄清措辞**（澄清=放宽安全目标）：reconcile 对一名发起加载（含重试）时先剔出 `failedClaims`，失败补记、成功保持剔除；同名冲突重试在 mcp-client 预约处毫秒级即败（spawn 前），该极窗内 blocked 短暂包含同名 → profile 侧毫秒级「多拒」属 fail-closed 方向，可接受。G5⑨ 稳态结论不变（冲突 claim 平态仍在 failedClaims）。连锁面：T3 新增断言；G7 发布复跑全量测试；README 降级矩阵不需新增条目（窗口已闭合）。

## Workflow follow-up

- 实施完成并通过评审后归档变更：`openspec archive project-mcp-name-resource-isolation`，确认 delta 同步进 `openspec/specs/dsh-project-mcp/spec.md`。
- 归档后按仓库流程推送 main 与 tag（`git push origin main --tags`），并在下一轮插件升级时复跑本变更冒烟第①③⑨条作为回归。
