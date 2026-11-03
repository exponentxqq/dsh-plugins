# Tasks

> 执行契约：`## N.` 组 = 执行审核批次，组间严格串行、组内可并行；每个任务的验证句都是可复制执行的命令或可核对断言。业务规则按 design D7 分层：`inventory.ts` 纯函数、`inventory-command.ts` 端口 + handler、`index.ts` 只接线。

## 1. 命令来源扩展（宿主型内置）

- [x] 1.1 `src/host/types.ts` 增加第三种命令来源 `{ kind: 'host'; invoke: HostCommandInvoke }` 与窄类型 `HostCommandInvocation`（`agent: object` / `rawInput` / `signal`）与 `HostCommandResult`（与 `dsh-commands` 的 `CommandResult` 同形，保持本文件零 import）；`src/host/registry.ts` 的指纹改为按 `origin.kind` 区分（`'builtin'` / `'host'` 各自成串）；`src/host/invocation.ts` 的模板解析对 host 来源抛防御性错误。验证：`pnpm --filter dsh-plugin-user-commands typecheck` 退出码 0；`grep -n "kind: 'host'" plugins/user-commands/src/host/types.ts` 命中；`grep -n "origin.kind" plugins/user-commands/src/host/registry.ts` 命中；`pnpm --filter dsh-plugin-user-commands exec vitest run test/invocation.test.ts test/global-layer.test.ts` 退出码 0（既有 prompt 语义零回归）。 （2026-11-02 完成：`types.ts` 三态来源 + 窄类型、`registry.ts` 指纹按 `origin.kind`、`invocation.ts` 防御分支；typecheck 与既有 invocation/global-layer 测试全绿）
- [x] 1.2 在 `test/global-layer.test.ts` 补一条宿主型命令的差量断言：同一 host 命令连续两次 `sync` 不产生 `updated`（指纹稳定、不反复重注册），且注册器拿到的是同一对象。验证：`pnpm --filter dsh-plugin-user-commands exec vitest run test/global-layer.test.ts` 退出码 0。 （2026-11-02 完成：`test/global-layer.test.ts` 新增宿主型命令指纹稳定用例，12 tests 全绿）

## 2. 清单纯逻辑（归组与渲染）

- [x] 2.1 新建 `src/host/inventory.ts`：导出 `INVENTORY_COMMAND_NAME` / `INVENTORY_DESCRIPTION` / `USAGE` / `SKILL_DESCRIPTION_MAX_LENGTH`；实现 `groupMcpTools(names)`（只认 `mcp__` 前缀、惰性取第一个 `__` 归组、服务器与组内工具排序、未归组计数、总数）与 `renderInventory(sections)`（固定 MCP → Skill 两段、cwd 首行、skill 描述空白折叠 + 截断、调用方式标记、来源短标签、全部空态/降级文案）。验证：`pnpm --filter dsh-plugin-user-commands exec vitest run test/inventory.test.ts` 退出码 0。 （2026-11-02 完成：`src/host/inventory.ts` 落地，`test/inventory.test.ts` 16 tests 全绿）
- [x] 2.2 新建 `test/inventory.test.ts`：覆盖（a）正常多服务器归组与升序；（b）非 `mcp__` 工具名被忽略；（c）serverName 含单个 `_` 正确归组、公开名被截断/归一的名进「未归组」；（d）空工具面与「未提供/读取失败」降级文案；（e）skill 调用方式三态标记与两者皆不可用被过滤；（f）描述 60 字截断与 `…`、空白折叠；（g）两段顺序与 cwd 行；（h）`complete === false` 与 cwd 缺失的标注。验证：`pnpm --filter dsh-plugin-user-commands exec vitest run test/inventory.test.ts` 退出码 0，且 `grep -c "it(" test/inventory.test.ts` ≥ 8。 （2026-11-02 完成：16 个单测覆盖归组/渲染/降级/截断，`grep -c "it("` = 16）

## 3. 命令实现（端口 + handler）

- [x] 3.1 新建 `src/host/inventory-command.ts`：`InventoryPorts`（`cwd` / `toolNames` / `skillSnapshot` / `log`）与 `createInventoryCommand(ports)`；handler 实现「带参 → 错误 + 用法、不读服务」「取消信号 → 错误」「每段独立 try/catch → 降级 + `log.error`」「成功 → `{ kind: 'success', text }`」，返回的命令 `origin` 为 `{ kind: 'host', invoke }`。验证：`pnpm --filter dsh-plugin-user-commands exec vitest run test/inventory-command.test.ts` 退出码 0。 （2026-11-02 完成：`src/host/inventory-command.ts` 端口 + handler，13 tests 全绿）
- [x] 3.2 新建 `test/inventory-command.test.ts`：用假端口覆盖（a）成功时两段文本正确且 `invoke` 不调用提交通道（无 steer 依赖）；（b）`toolNames` 返回 `undefined` → MCP 段降级；（c）端口抛错 → 段内失败说明 + 错误进假日志、命令仍 success；（d）`skills` 缺席 → Skill 段降级；（e）`complete === false` → 标注；（f）带参 → `kind: 'error'` 且端口未被调用；（g）取消 → `kind: 'error'`；（h）命令名满足 `^[a-z][a-z0-9_-]*$`、不在 `RESERVED_COMMAND_NAMES` 中、用户级同名文件经 `globalCommands` 遮蔽它。验证：`pnpm --filter dsh-plugin-user-commands exec vitest run test/inventory-command.test.ts` 退出码 0。 （2026-11-02 完成：13 个单测覆盖成功/缺席/抛错/不完整/取消/带参/元数据/遮蔽）

## 4. 装配接线

- [x] 4.1 `src/host/index.ts`：构造真实端口（`ctx.get('tools')` → `schemas(agent)`、`ctx.get('skills')` → `snapshot({ cwd, scope: agent, signal })`、`ctx.get('workingDirectory')` → `get(session)` 且回退 `session.header.cwd`；端口内只做类型 cast 与失败穿透，不写业务规则），把 `createInventoryCommand(...)` 加入 `globalCommands(scan.user, [...BUILTIN_COMMANDS, inventory])`。验证：`pnpm --filter dsh-plugin-user-commands typecheck` 与 `pnpm --filter dsh-plugin-user-commands build` 退出码 0；`grep -n "createInventoryCommand" plugins/user-commands/src/host/index.ts` 与 `grep -n "ctx.get('skills')" plugins/user-commands/src/host/index.ts` 命中；`grep -n "BUILTIN_COMMANDS, inventory" plugins/user-commands/src/host/index.ts` 命中。 （2026-11-02 完成：`index.ts` 经 `ctx.get` 接 tools/skills/workingDirectory 并并入全局层；typecheck/build 退出码 0）

## 5. 文档

- [x] 5.1 `plugins/user-commands/README.md`：概述与本插件定位从「只做 prompt」修订为「prompt 型用户命令 + 宿主侧只读内置命令」；三层来源表内置行改为「`/init`、`/inventory`」；新增「## 内置 `/inventory`」小节（两段输出样例、MCP 可见面口径与未归组限制、skill 调用方式标记与来源、软依赖降级矩阵、零模型消息、不接受参数、可被用户级/项目级同名文件遮蔽）；「非目标」条目由「不内置 `/init` 之外的命令」改为「不做有副作用的内置命令（`/inventory` 只读）」。验证：`grep -n "内置 \`/inventory\`" plugins/user-commands/README.md` 与 `grep -n "未归组" plugins/user-commands/README.md` 均命中，且 README 描述的降级文案与 `src/host/inventory.ts` 常量逐条一致（人工核对）。 （2026-11-02 完成：README 新增「内置 `/inventory`」小节、三层来源表/调用语义/安全提示/软依赖/非目标同步修订；文案与 `inventory.ts` 常量逐条核对一致）
- [x] 5.2 `plugins/user-commands/package.json` 的 `description`、仓库根 `README.md` 插件表 user-commands 行、`AGENTS.md` 插件清单条目同步提及 `/inventory`。验证：`grep -n "inventory" plugins/user-commands/package.json README.md AGENTS.md` 三处均命中。 （2026-11-02 完成：`package.json` description、根 `README.md`、`AGENTS.md` 三处均含 `inventory`）

## 6. 集成验证

- [x] 6.1 静态门禁：`pnpm --filter dsh-plugin-user-commands verify:all`（lint + typecheck + build + test）与仓库根 `pnpm dsh:check` 全部退出码 0，`plugins/user-commands/lib/index.js` 已随构建重建（`git status --short plugins/user-commands/lib` 可见改动或确认无差异属预期）。 （2026-11-02 完成：`pnpm --filter dsh-plugin-user-commands verify:all` 退出码 0（127 tests）、`pnpm dsh:check` 基线一致；`lib/index.js` 已重建）
- [x] 6.2 隔离实例冒烟（独立 `DSH_HOME` + 备用端口 3099 的同构 web profile，link 本包构建）：创建会话执行 `/inventory`，逐条记录（a）输出含 cwd 首行、MCP 段与 Skill 段且计数与 `/tools status` 的可见工具面一致；（b）会话日志无新增用户消息、无 `turn/start`（结果只走命令通道）；（c）执行 `/tools off mcp:<server>` 后再次 `/inventory`，该服务器从 MCP 段消失；（d）`/inventory foo` 返回错误与用法。证据写入 `openspec/changes/add-inventory-command/artifacts/inventory-smoke.md`。验证：`test -s openspec/changes/add-inventory-command/artifacts/inventory-smoke.md` 且文件含 4 条「结果：通过」记录；冒烟结束清理临时实例与探针文件。 （2026-11-02 完成：8/8 用例通过，证据见 [`artifacts/inventory-smoke.md`](artifacts/inventory-smoke.md)；临时 `DSH_HOME`、实例进程、探针脚本与导出 ZIP 已清理）

## Workflow follow-up

- 评审通过后 `openspec archive add-inventory-command`，并确认主规范 `openspec/specs/dsh-user-commands/spec.md` 合入新增的四条需求。
- 发布由用户决定：优先与在途变更 `session-tool-toggle-skill-workspace` 的 1.5.0 合并发布；若本变更单独发布则版本顺延。发布后 profile 按新 tag 重装并重启，复跑 `/inventory` 真机确认。
