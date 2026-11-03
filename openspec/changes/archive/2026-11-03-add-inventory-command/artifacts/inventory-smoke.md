# `/inventory` 隔离实例冒烟记录

## 环境与方法

- 独立 `DSH_HOME=/tmp/inv-smoke`、备用端口 `3099` 的同构 web profile 实例：profile 为线上 `web` profile 的副本（`node_modules` 完整拷贝），`dsh-plugin-user-commands` 替换为**本仓库当前构建**（`lib/index.js` 由 `pnpm --filter dsh-plugin-user-commands verify:all` 重建；版本 1.4.0 + 本变更）。
- 会话：`session-e5df803f-8fc9-4b6b-acc5-9d2019d42f0d`，cwd = `/home/xuqinqin/develop/person/dsh-plugins`。
- 访问方式：`GET /?token=…` 换持久 cookie → `POST /api/<endpoint>` 调 Typert Connection RPC（信封 `{type:"client-request",rpcId,method,payload:{args}}`）。
- 日志证据：无 turn 时命令生命周期事件只在内存中（磁盘持久化文件只有会话头），因此执行 `/export` 后取 `GET /api/session.export` 的会话日志 ZIP（Host 端点在读取前会 flush 活动根会话），解压其中的 `session.vN.jsonl` 后断言。
- 环境说明：本部署 chrome-devtools MCP 工具注册在 agent 平面，`session-tool-toggle` 的 `tools.restrict` 只能掩全局层工具，因此「关闭后消失」用例选用全局层服务器 `mcp:codebase-memory`（该插件在 agent 平面工具上的既有边界，与本变更无关）。

## a1. /inventory 出现在 commands/list 且描述正确 — 结果：通过

```text
commands = commands-reload, compact, export, feedback, goal, init, inventory, mcp-reload, permission, plan, remote, remote-forget-key, remote-ignore, rewind, rewind-plugin, snapshot-auto-cleanup, tools, undo, workspace-folders
inventory 描述符 = {"name":"inventory","description":"列出本会话实际可见的 MCP 服务器与可用 skill（宿主侧直接求值，不产生模型请求）"}
```

## a2. /inventory 输出两段清单（cwd 首行 + MCP 段 + Skill 段） — 结果：通过

```text
commandId = cmd-64233592-7
kind = success
MCP 行 = ["- chrome-devtools-mcp：32 个工具","- codebase-memory：17 个工具"]

会话清单（cwd：/home/xuqinqin/develop/person/dsh-plugins）

MCP 服务器（2 台，共 49 个工具）
- chrome-devtools-mcp：32 个工具
- codebase-memory：17 个工具

Skill（25 个）
- analyzing-elastic-logs — Use when 排查线上问题需要查询服务日志或 APM traces——按候选人/用户查请求、按 trace.id …（模型+/name，用户(agents)）
- archify — Create polished, validated architecture, workflow, sequence…（模型+/name，内置）
- architecture-diagram — Create polished dark-themed architecture diagrams as self-c…（模型+/name，用户(agents)）
- codebase-memory — Use when exploring, searching, or understanding a codebase …（模型+/name，用户(agents)）
- dispatching-parallel-agents — Use when facing 2+ independent tasks that can be worked on …（模型+/name，用户(agents)）
- grill-me — Grill the user relentlessly about a plan, decision, or idea…（模型+/name，用户(agents)）
- nuxt-writer — Use when planning, writing, modifying, or reviewing any Vue…（模型+/name，用户(agents)）
- openspec-apply-change — Implement tasks from an OpenSpec change. Use when the user …（模型+/name，项目）
- openspec-archive-change — Archive a completed OpenSpec change in the experimental wor…（模型+/name，项目）
- openspec-explore — Enter OpenSpec explore mode - a thinking partner for explor…（模型+/name，项目）
- openspec-propose — Propose a new OpenSpec change with all artifacts generated …（模型+/name，项目）
- openspec-sync-specs — Sync delta specs from an OpenSpec change to main specs. Use…（模型+/name，项目）
- openspec-update-change — Update an OpenSpec change by revising its existing planning…（模型+/name，项目）
- openspec-verify-change — Verify implementation matches OpenSpec change artifacts. Us…（模型+/name，用户(agents)）
- receiving-code-review — Use when receiving code review feedback, before implementin…（模型+/name，用户(agents)）
- reviewing-deliverables — Use when 完成交付物(图片/截图、Office/PDF 文档、数据报表、代码工程包)准备提交给客户或领导前需要…（模型+/name，用户(agents)）
- smoke-testing-local-env — Use when 需要在本机 docker 化开发环境里对任意项目做端到端冒烟/验收验证——从 dsh 容器驱动浏览器…（模型+/name，用户(agents)）
- spec-apply — spec 驱动工作流的执行半程——落档后批次执行：双引擎（subagent/team）、三模式（auto/step-t…（模型+/name，用户(agents)）
- spec-done — spec 驱动工作流的终末半程——验证归档（项目验证门→verify-change→archive 同步主规格→归档提…（模型+/name，用户(agents)）
- spec-plan — spec 驱动工作流的规划半程——并行双线（team 驱动）或串行单线（openspec-explore + gril…（模型+/name，用户(agents)）
- spec-workflow — 固定 spec 驱动开发工作流的统一编排入口——四段委托：规划（spec-plan）、衔接与执行环境决策（本 skil…（模型+/name，用户(agents)）
- spring-writer — Use when writing, modifying, or reviewing any Java/Spring B…（模型+/name，用户(agents)）
- systematic-debugging — Use when encountering any bug, test failure, or unexpected …（模型+/name，用户(agents)）
- verification-before-completion — Use when about to claim work is complete, fixed, or passing…（模型+/name，用户(agents)）
- writing-skills — Use when creating new skills, editing existing skills, or v…（模型+/name，用户(agents)）
```

## c1. /tools off mcp:codebase-memory 成功结算 — 结果：通过

```text
kind = success
已关闭：mcp:codebase-memory（隐藏 17 个工具定义 + 1 段服务器指令）
本会话可见工具 127 → 110
下次请求生效；前缀缓存将从第一个变化的 schema token 起重建一次（一次性成本）
```

## c2. /tools off mcp:codebase-memory 后 /inventory 不再列出该服务器 — 结果：通过

```text
关闭后 MCP 行 = ["- chrome-devtools-mcp：32 个工具"]
仍列出 = false
```

## d2. /tools status 输出留存（与清单 MCP 段对照） — 结果：通过

```text
【本会话开关】已关 1 项
  · mcp:codebase-memory 17 个工具定义（已关闭，服务器指令段已遮蔽）
  · 本会话可见工具 110 个（持久化通道：会话日志）
【默认档】/tmp/inv-smoke/session-tool-toggle/defaults.json（0 项关闭）
  · 本会话创建于 2026-11-02T10:25:28.428Z；快照来源=创建时默认档快照（0 项关闭）；/tools reset 回到这里
【可关对象】MCP 服务器 2 台（mcp:chrome-devtools-mcp 32、mcp:codebase-memory 17）；内置工具 78 个（其中 6 个受保护）；单工具关闭 0 项
【保护名单】7 项：bash、edit、glob、grep、pwsh、read、write
  · 被其他作用域隐藏 0 个工具定义（全局层有、本会话不可见）
```

## d1. /inventory foo 返回错误与用法 — 结果：通过

```text
kind = error
/inventory 不接受参数；用法：/inventory（不接受参数）
```

## a3. MCP 计数与 /tools status 可见工具面一致 — 结果：通过

```text
关闭前 /inventory = {"servers":2,"tools":49}；/tools status 分组 = {"chrome-devtools-mcp":32,"codebase-memory":17}（和 49）
关闭后 /inventory = {"servers":1,"tools":32}；/tools status 可见工具 = 110（关闭前应为 127）
```

## b1. 命令结果只走命令通道：日志有 command/run + command/done，无 user/message、无 turn/start — 结果：通过

```text
导出 ZIP = 3083 字节（HTTP 200），日志条目 = session.v4.jsonl（8873 字节）
事件类型计数 = {"session":1,"permission/preset":1,"sandbox/mode":1,"approval/policy":1,"subagent/model-selection-policy":1,"plugin:session-tool-toggle/state":2,"command/run":6,"command/done":6}
command/run 名称 = ["inventory","tools","inventory","tools","inventory","export"]
command/run 参数 = [""," off mcp:codebase-memory","",""," foo",""]
command/done kinds = ["success","success","success","success","error","success"]
user/message = false，turn/start = false，assistant/message = false
```

## 汇总

- 用例总数：8
- 通过：8
- 失败：0
- 结论：全部通过
