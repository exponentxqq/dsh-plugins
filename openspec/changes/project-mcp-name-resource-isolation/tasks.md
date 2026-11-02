# Tasks

> 执行契约：`## N.` 组 = 执行审核批次，**组间严格串行、组内可并行**；组内任务互不依赖且**不写同一文件/目录**（「可并行」判据）；因依赖或写冲突而无法并行的任务单独成组；单组任务数 ≤ 8；**每组结束必须 `pnpm --filter dsh-plugin-project-mcp typecheck` 通过**。每任务描述末尾引用 `code-design.md` 触达面清单的条目编号（H*/T*/D*），验证句均为第三方可核对命令或断言。
>
> 输入材料：`proposal.md`、`specs/dsh-project-mcp/spec.md`、`design.md`、`code-design.md`（含「落档决议 R-1…R-5」，与本文冲突时以决议为准）、`diff-matrix.md`。

## 1. 关键 spike（2 项，可并行：各自独立 `DSH_HOME`/端口，不改源码）

- [ ] 1.1 名字面段契约与组装行为实证：独立 `DSH_HOME` + 独立端口（`dsh --profile web --port 3099 --no-open`）实例上放两台 probe 服务器（各含 `ping` 工具 + 一条 resource + 非空 `instructions`），逐条记录「命令 + 观察」到 `openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md`：① 资源服务器名段逐字形态（`## MCP resource servers` + 句末 `["a","b"].`）；② `mcp:<server>` 段名与 `### MCP server: <name>` 标题；③ 段对象带 `interpolate: false`；④ 未打标签的 `ctx.on('system-prompt/assemble')` 收到每个 scope 的装配、改写 `assembly.sections` 后下一步生效；⑤ `complete` 段存在时 mutations 被丢弃的实测确认（触达：D4；无源码改动）；验证：`test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md` 且 `[ "$(grep -c '^结果：通过' openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md)" -eq 5 ]`；任一条红则停止并上报，不得进入组 2。
- [ ] 1.2 守卫参数形态实证（独立实例，端口 3098）：以临时探针插件（放 `artifacts/`，不进产物）装 `agent.ctx.tools.guard` 打印 `execution.arguments`，覆盖原生 `list_mcp_resources(server=…)`、`read_mcp_resource`、`run_code` 内层 dispatch、缺 `server`、`server` 非字符串、profile 级服务器调用；并确认 deny 后目标 probe 服务器日志无新增请求（触达：D4；无源码改动）；验证：`[ "$(grep -c '^结果：通过' .../artifacts/spike-guard-arguments.md)" -eq 6 ]` 且摘录里出现带 `parent` 的 PTC 调用记录、`diff <(…before) <(…after)` 为空。

## 2. 纯函数、闸门与读数（3 项，可并行；组末 typecheck 绿）

- [ ] 2.1 新建 `src/host/prompt-isolation.ts` 纯函数层（段名常量、窄类型、`rewriteResourceNames` 多策略解析、`planNameFilter`、`hiddenServers`、`sample`；不含 `ctx`/监听器代码）并新建 `test/prompt-isolation.test.ts` 纯函数部分（触达：H1、T1）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0，且断言 `rewriteResourceNames('… server argument: ["a","b"].', new Set(['b']))` → `{kind:'rewritten', kept:['a'], removed:['b']}`、空文本 → `{kind:'kept'}`、`'garbage'` → `{kind:'unparsable'}`、全移除 → `{kind:'empty'}`、`planNameFilter` 对 `mcp:probe-b` 段返回 `removedSections:['mcp:probe-b']` 且改写段保留 `interpolate:false`。
- [ ] 2.2 `src/host/isolation.ts` 落三面闸门与 `blocked` 口径（`RESOURCE_TOOLS`、`resourceDenyReason` 与上游 unavailable 同形、`GuardedExecution`、`ScopedTools.guard` 形参放宽、`IsolationPorts.managedServerNames()` → `blockedServerNames()`、`deriveDeny`/`guardReason`/`carried`/retry 统一 blocked、新增 `resourceGuardReason` 与 `visibleFor`、扩展 `attach()` 的 guard 闭包），**同任务内**改 `src/host/index.ts` 的 `IsolationLayer` 构造传 `blockedServerNames`（端口改名与接线必须同批完成，保证组末 typecheck 绿），并改 `test/isolation.test.ts`（触达：H2、H4、T2）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/isolation.test.ts` 退出码 0，且断言三工具越权均返回 `resourceDenyReason('probe-b')` 且与「不存在 server」的上游文案一致、`arguments` 为 `undefined`/`null`/`'x'`/`[]`/`{}`/`{server:1}` 时返回 `undefined`、`blocked` 不含该名时返回 `undefined`、`visibleFor(unknownKey) === undefined`、项目 claim 与 profile 同名加载失败时 profile 的 `mcp__probe-shared__*` 不被 deny。
- [ ] 2.3 `src/host/mcp-manager.ts` 新增 `failedClaims` 维护与 `failedServerNames()`/`blockedServerNames()` 读数（claimed 两个既有方法行为不变，只补口径 doc）；同步改 `test/mcp-manager.test.ts`（触达：H3、T3）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/mcp-manager.test.ts` 退出码 0，且断言「一台加载失败后 `failedServerNames()` 含它、`blockedServerNames()` 不含它、`managedServerNames()` 含它」「加载成功/卸载/移出扫描后三者相应消失」「`blockedServerNames()` 恒等于声称集减失败集」。

## 3. 名字面监听器与接线（1 项，因依赖单独成组）

- [ ] 3.1 在 `src/host/prompt-isolation.ts` 增监听器层（`PromptIsolationPorts`、`AssembleListener`、`declare module` 事件声明、`isNameSurface`、`overHide`、`createAssembleListener`：先 `next()`、无相关段不读端口、异常 over-hide、前 5 次 + 形状变化限流、`unparsable` warn 前 3 次），扩 `test/prompt-isolation.test.ts` 监听器部分，并在 `src/host/index.ts` 注册 `ctx.on('system-prompt/assemble', createAssembleListener({...}))`、加 boot 观测行、模块头步骤清单补第 6 步（触达：H1、H4、T1；依赖 2.1 的纯函数与 2.2 的端口改名）；验证：`pnpm --filter dsh-plugin-project-mcp exec vitest run test/prompt-isolation.test.ts` 退出码 0，且断言「`next` 恰好一次且先于端口读」「未跟踪 agent → 项目名全隐 + profile 名保留」「`context.agent` 与 `context.scope` 其一生效」「端口抛错 → 所有 `mcp:` 段消失」「`changed=false` 返回同一对象引用」「同形状连续 6 次只产生 1 条 info」；`pnpm --filter dsh-plugin-project-mcp typecheck` 与 `lint` 退出码 0，`grep -n "system-prompt/assemble" plugins/project-mcp/src/host/*.ts` 命中两文件各一处、`grep -n "agents.list()" plugins/project-mcp/src/host/index.ts` 命中。

## 4. 静态门禁（1 项）

- [ ] 4.1 静态门禁：`pnpm --filter dsh-plugin-project-mcp verify:all`、`pnpm dsh:check`、`docker exec dsh dsh --profile web|acp|headless --dump-config-schema`（触达：H1/H2/H3/T1/T2/T3、D4）；验证：以上命令全部退出码 0，且 `! grep -qE "^import .*@deepseek-ai" plugins/project-mcp/lib/index.js` 与 `grep -q "mcp-resource-servers" plugins/project-mcp/lib/index.js` 均成立。

## 5. 隔离实例端到端冒烟（1 项；依赖组 4 的构建产物）

- [ ] 5.1 复用 1.1 fixture（A/B 两工作区 probe + 一台 profile 级 probe），逐条记录「命令 + 观察」到 `artifacts/smoke-record.md`：① 名字面（A 会话提示词只含 A 项目名 + profile 名，不含 B 名；`### MCP server: probe-b` 零命中）；② 资源面允许（A 会话读 probe-a 成功）；③ 资源面拒绝且不触达（A 会话对 probe-b 三工具全 `isError`，拒绝文案与上游 unavailable 同形，且 probe-b 服务器请求日志行数前后相等）；④ 无归属 fail-closed（`/tmp` 会话名字全隐、资源全拒）；⑤ profile 不受影响（三会话对 profile probe 名字可见、资源可读）；⑥ 动态刷新（删 A 配置 → 下一步名字与资源同步变化，`/mcp-reload` 后一致）；⑦ 工具面回归 + `session-tool-toggle` 面板行为不变；⑧ PTC 内层 `read_mcp_resource(server=probe-b)` 同样被拒；⑨ 项目 claim 与 profile 同名加载失败（`probe-shared`）→ profile 工具与资源均不被误伤（触达：D4、D2 证据表）；验证：`test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md` 且 9 条各含「命令：」与「观察：」，第③条附 `diff <(…before) <(…after)` 为空。

## 6. 规范与文档（3 项，可并行）

- [ ] 6.1 校验 spec delta 与需求一致性：`openspec/changes/project-mcp-name-resource-isolation/specs/dsh-project-mcp/spec.md` 覆盖名字段/指令段/空数组/解析失败降级/无归属/profile 保留/资源三工具拒绝且不触达/文案同形/参数交回校验/PTC/历史不追溯/人类 UI 边界/加载失败 claim 不误伤/动态刷新（触达：D1）；验证：`openspec validate --all` 退出码 0 且 `[ "$(grep -c '^#### Scenario:' …/specs/dsh-project-mcp/spec.md)" -ge 20 ]`。
- [ ] 6.2 改写 `plugins/project-mcp/README.md`：非目标 `:152` 改为已交付、补三面行为与 `blocked`/`visible` 口径、工具面口径修正说明、降级矩阵（无 `systemPrompt`/无 `mcpResources`/段格式漂移/HMR 后存量会话/agentless 调用）、残余边界（人类 UI/全局注册层/升级前历史）、回滚代价、冒烟证据表两列（触达：D2）；验证：`grep -n "资源面" plugins/project-mcp/README.md` 与 `grep -n "blocked" plugins/project-mcp/README.md`、`grep -n "prompt: resource names" plugins/project-mcp/README.md` 均命中，且 `! grep -q "若需资源面隔离应另开提案" plugins/project-mcp/README.md`。
- [ ] 6.3 更新根 `README.md:77` 与根 `AGENTS.md:21` 的插件描述，追加「名字（资源服务器名与服务器指令段）与资源面隔离」（触达：D3）；验证：`grep -n "资源面隔离" README.md AGENTS.md` 两处均命中。

## 7. 发布（1 项，串行末位）

- [ ] 7.1 按仓库统一版本流程发布：`pnpm release --dry-run` 复核版本与文件清单 → `pnpm release <version>` → `lib/` 重建随提交 → profile 以 `link:` 重装并重启 → 复跑冒烟第①②③⑨条（触达：H1/H2/H3/H4 产物 + D2 的版本/回滚段）；验证：`pnpm release --dry-run` 打印的版本高于当前 tag 且文件清单含 `lib/index.js`；`pnpm verify` 与 `pnpm dsh:check` 退出码 0；重启后 `docker exec dsh dsh plugin --profile web list | grep project-mcp` 显示新版本；`docker logs dsh | grep -c "prompt: resource names"` ≥ 1。

## Workflow follow-up

- 实施完成并通过评审后归档变更：`openspec archive project-mcp-name-resource-isolation`，确认 delta 同步进 `openspec/specs/dsh-project-mcp/spec.md`。
- 归档后按仓库流程推送 main 与 tag（`git push origin main --tags`），并在下一轮插件升级时复跑本变更冒烟第①③⑨条作为回归。
