# Tasks

> 执行契约：`## N.` 组 = 执行审核批次，**组间严格串行、组内可并行**；每任务描述末尾引用 `code-design.md` 触达面清单的条目编号（H*/C*/P*/T*/D*），验证句均为第三方可核对命令或断言。单组任务数 ≤ 8。

## 1. 关键 spike（串行前置）

- [ ] 1.1 在隔离 DSH 实例（独立 `DSH_HOME` + 独立端口 + `customSkillDirs` 指向临时 fixture 目录的 2–3 个 skill）验证 code-design G1 的 5 条断言：stub 落 agent 层并胜出、下一步目录消息不含该名、`skill` 工具报 `not available for model invocation`、`/name` 注入完整正文（与磁盘 SKILL.md 一致）、dispose 后恢复且邻会话不受影响；逐条把「命令 + 观察输出」写入 `openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md`（触达面：无源码改动）；验证：`test -s openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md` 且 `[ "$(grep -c '^结果：通过' openspec/changes/session-tool-toggle-skill-workspace/artifacts/spike-skill-shadow.md)" -eq 5 ]`；任一条红则停止并上报，不得进入组 2。

## 2. 地址文法与纯函数层（4 项并行）

- [ ] 2.1 `src/host/address.ts` 增加第四类地址 `skill:<name>`、失败码 `bad-skill-name`、`skill`/`skill:*` 归一为 `tool:skill`、`matchesToolName` 恒 false、`ADDRESS_GRAMMAR` 与错误文案（H1）；同批补 `test/address.test.ts` 与 `test/state.test.ts` 的 skill 地址断言（T1；`state.test.ts` 属「明确不改代码、只补测试」）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/address.test.ts test/state.test.ts` 退出码 0，且断言 `parseAddress('skill:openspec-propose',n).text === 'skill:openspec-propose'`、`parseAddress('skill:*',n).text === 'tool:skill'`、`['skill:','skill:Foo','skill:foo_bar','skill:foo bar','skill:foo-','skill:-foo']` 全部 `code === 'bad-skill-name'`。
- [ ] 2.2 新建 `src/host/skills-plan.ts`：`planSkills({disabled,installed,toolSkillClosed}) → {shadowNames, closedTexts, matched, intentOnly}`，整档关闭时 `shadowNames` 为空、matched 0 也保留键（H2）；新建 `test/skills-plan.test.ts`（T2）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/skills-plan.test.ts` 退出码 0，且断言空集/未知名/重复/整档关闭/与 mcp 地址隔离五组表驱动用例全绿。
- [ ] 2.3 `src/host/mask.ts` 的 `resolveAddresses` 与 `guardReason` 跳过 `kind === 'skill'`，确保技能名永不进工具 deny（H3）；改 `test/mask.test.ts`（T3）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/mask.test.ts` 退出码 0，且断言 `planMask({catalog:['skill'],scoped:['skill'],carried:[],disabled:['skill:foo']})` 的 `deny` 与 `shadowServers` 均为空数组。
- [ ] 2.4 `src/host/types.ts` 类型面先行冻结：`LayerHandle` 加 `skills()`/`skillsSettled()`、`SkillLayerSnapshot`/`SkillSummaryLike`/`WorkspaceAttribution`、`NoticeCode` 两码、`Config.workspacesFile`、`PanelInputs` 两组输入（H5）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0，且 `grep -n "skillsSettled" src/host/types.ts` 与 `grep -n "workspacesFile" src/host/types.ts` 均命中。

## 3. 每 agent 技能分面（1 项）

- [ ] 3.1 `src/host/session-layer.ts` 实现技能分面：`mountSkills`（同步先取 + 软 fiber 晚到补挂）、`reconcileSkills`（代数守卫、先撤后补、diff 守卫）、`captureSkill`（`AbortSignal.timeout(2000)`）、`shadowSkill`（注册后回读校验 + failed 集合）、`skills()`/`skillsSettled()`、`detach` 逐个 dispose（H4）；改 `test/session-layer.test.ts`（T4，用假 `skillScope` 记录调用）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/session-layer.test.ts` 退出码 0，且含四类断言：无 `skills` 服务时工具掩码仍生效、`setState` 同步返回后 `shadowed` 不含新名而 `await skillsSettled()` 后含、重复 `setState` 同一状态 `registerCalls === 1`、整档 `tool:skill` 关闭时 `registerCalls === 0`。

## 4. 工作区数据面（3 项并行）

- [ ] 4.1 新建 `src/host/workspaces.ts`：`workspacesPath`/`readWorkspaces`（两级降级）/`writeWorkspaces`（原子写 600/700、字典序稳定序列化）/`disabledOf`/`withEntry`/`mergeSeed(user,workspace)` 并集纯函数/`EMPTY_WORKSPACES`/上限常量（H8）；新建 `test/workspaces.test.ts`（T6）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspaces.test.ts` 退出码 0，且断言 ENOENT/坏 JSON/`version:2`/`workspaces:[]` 四种输入都 `toBe(EMPTY_WORKSPACES)`、`mergeSeed(['mcp:u'],['skill:s'])` 等于 `['mcp:u','skill:s']`、写失败 `rejects.toThrow`。
- [ ] 4.2 新建 `src/host/attribution.ts`：`resolveWorkspaceAttribution(cwd,{roots,realpath,log})`（realpath 逐级上溯 + registry path 精确匹配 + 未命中用 canonical cwd + 全程失败 fail-closed）（H9）；新建 `test/workspace-attribution.test.ts`（T7）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-attribution.test.ts` 退出码 0，且含 registry 命中优先、子目录归属、符号链接、目录消失返回 `undefined`、无 registry 退化五组用例。
- [ ] 4.3 `src/host/index.ts` 播种段：`readOrSeed` 改为 `seed(session,current,mergeSeed(用户档, 工作区档))`，新增 `workspaceOf` 闭包与软注入 `workingDirectory`/`workspaceRegistry`，`Config` 接 `workspacesFile`（H12 的播种段）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0，且 `grep -n "mergeSeed(" src/host/index.ts` 与 `grep -n "workspaceRegistry" src/host/index.ts` 均命中；归属失败分支只在用户档播种（`grep -n "attribution === undefined" src/host/index.ts` 命中）。

## 5. 契约与依赖先行（串行闸：组 2–4 完成 → 组 5 → 组 6）

- [ ] 5.1 `src/contract.ts` 双端契约：第 5 端点 `workspace`、`WorkspaceRequest`/`WorkspaceValue`/`WorkspaceView`/`WorkspaceChoice`/`SkillView`、`PanelSnapshot` 两字段、`Mutation.hiddenSkills`、失败码 7→9、提示码 3→5、`REQUEST_PARSERS`/`PANEL_SNAPSHOT_KEYS`/`MUTATION_KEYS` 同步、`MAX_WORKSPACE_PATH_LENGTH`（H13）；改 `test/wire-contract.test.ts`（T11）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 退出码 0，且 `! grep -qE '^\s*import ' src/contract.ts`（零 import），表驱动用例覆盖「两种寻址字段同时出现」「set 缺 addresses」「read 带 addresses」「未知快照键」四类拒绝。
- [ ] 5.2 `plugins/session-tool-toggle/package.json` 补 devDep `@deepseek-ai/dsh-client-ui-sidebar@0.2.1-rc.5` 与 `dsh.client.inject` 的 `@deepseek-ai/dsh-client-ui-sidebar` 项（P1）；在仓库根执行 `pnpm install` 更新锁文件；验证：`node -e "const p=require('./plugins/session-tool-toggle/package.json'); if(!p.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar')) process.exit(1)"` 退出码 0，且 `grep -q "dsh-client-ui-sidebar" pnpm-lock.yaml` 命中。

## 6. 内核与装配接线（5 项并行）

- [ ] 6.1 `src/host/panel.ts`：顶层 `skills`/`workspace` 视图、关闭集全地址归一、`intentOnly` 三分、`NOTICE_ORDER` 增两码（H6）；改 `test/panel.test.ts`（T5）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel.test.ts` 退出码 0，且断言 `snapshot.state.disabled` 含 `skill:<name>`、`snapshot.intentOnly` 含 `skill:ghost`、`skills` 行含 `disabled` 与 `shadowed` 两字段。
- [ ] 6.2 `src/host/control.ts`：`hiddenSkills`/`schemaChanged` 扩义、`PanelReading` 三字段、`updateWorkspaceDefaults` + `resolveWorkspaceTarget`（H7）；改 `test/control.test.ts`（T8）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/control.test.ts` 退出码 0，且断言 deny 未变但影子集合变化时 `schemaChanged === true`、`updateWorkspaceDefaults(...,'off',['skill:x'])` 后工作区条目含 `skill:x`、写失败时抛错且不改 `workspaces.json`。
- [ ] 6.3 `src/host/rpc.ts`：`handleWorkspace` 与 dispatch 分支、`snapshotOf` 组装、两失败码映射、`toggle` 回执前 `await layer.skillsSettled()`（H10）；改 `test/rpc.test.ts`（T10）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/rpc.test.ts` 退出码 0，且覆盖 `{sessionId}` 与 `{workspacePath}` 两形态 × 5 动作、会话 cwd 已删 → `workspace-unresolved`、写盘抛错 → `workspace-unwritable`。
- [ ] 6.4 `src/host/commands.ts`：`/tools workspace [status|off|on|set|reset]`、`/tools status` 增两段、`closedStateText` 的 skill 分支、文法行（H11）；改 `test/commands.test.ts`（T9）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/commands.test.ts` 退出码 0，且 `/tools workspace` 输出含工作区键与文件路径、`/tools status` 输出含「技能：」与「工作区默认档」、`/tools workspace off skill:x` 回执含「只影响之后新建的会话」。
- [ ] 6.5 `src/host/index.ts` 接线段：`controlDeps` 四新字段、`rpcDeps` 扩展、技能/工作区降级启动日志、统一拆卸（H12 接线段）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0，且 `grep -n "workspaceChoices\|workspacePath" src/host/index.ts` 命中；`docker exec dsh dsh --profile web --dump-config-schema 2>/dev/null | grep -A3 "'session-tool-toggle'"` 中本插件条目 `status` 为 `"schema"`。

## 7. Web 半（7 项并行）

- [ ] 7.1 新建 `src/client/SkillPanel.tsx`：逐 skill 行开关、`unavailable` 降级、`blocked`（整档关闭）置灰 + 行内提示、`pending`/`busy` 三态（C1）；新建 `test/skill-panel.test.tsx`（T12）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/skill-panel.test.tsx` 退出码 0，且 `disabled && shadowed` 行渲染勾选开关、`unavailable` 时不渲染开关。
- [ ] 7.2 新建 `src/client/WorkspaceDefaultsEditor.tsx`：`section`/`dialog` 两形态、工作区下拉、保存/清空/失败、并集一句说明（C2）；新建 `test/workspace-editor.test.tsx`（T13）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 退出码 0，且 `dialog` 形态下拉触发 `onSelect('/w2')`、保存失败渲染 `error.workspace-unwritable` 文案。
- [ ] 7.3 新建 `src/client/WorkspaceEntry.tsx`：footer 触发按钮 + 自绘对话框 + `useWorkspaceDefaults` 状态机（C3，DQ1 后无菜单项形态）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0，且 `grep -n "WorkspaceFooterAction" src/client/WorkspaceEntry.tsx` 与 `grep -n "useWorkspaceDefaults" src/client/WorkspaceEntry.tsx` 均命中、`! grep -n "workspace.menu.item" src/client/WorkspaceEntry.tsx`。
- [ ] 7.4 新建 `src/client/current-session.ts` 与 `src/client/seats.ts`：当前会话两步探测、header/footer 座位常量集中（C4+C5）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出码 0，且 `grep -n "sidebar.footer.action" src/client/seats.ts` 命中、`! grep -rn "workspace.menu.item" src/client/`（DQ1=C：无上游座位软注册）。
- [ ] 7.5 `src/client/panel-controller.ts` 与 `src/client/panel-client.ts`：`WorkspaceView` 状态与 `refreshWorkspace`/`updateWorkspace`、`workspace()` 端点方法 + 内联 parser（C6+C7）；改 `test/panel-controller.test.ts` 与 `test/panel-client.test.ts`（T14/T15）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/panel-controller.test.ts test/panel-client.test.ts` 退出码 0，且 `workspace({sessionId:'s',action:'read'})` 的 payload 精确等于 `{sessionId:'s',action:'read'}`、续界失败渲染 `unavailable` 降级。
- [ ] 7.6 `src/client/index.ts`：header 座位保持、footer 实注册（`register` try/catch，失败只 warn）（C9）；改 `test/client-index.test.ts`（T16）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/client-index.test.ts` 退出码 0，且断言对 `sidebar.footer.action` 的 `slots.inject` 被调用一次、`register` 抛错时只 warn 且 `apply` 正常返回。
- [ ] 7.7 `src/client/ToolPanelAction.tsx` 挂载两分区、`src/client/locales.ts` 新键（zh/en parity）、`src/client/panel.module.css` 样式（C8+C10+C11）；改 `test/tool-panel.test.tsx`、`test/locale-parity.test.ts`、`test/bundle.test.ts`（T17/T18，`INLINED_MARKERS` 加 `'workspace'`）；验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/tool-panel.test.tsx test/locale-parity.test.ts test/bundle.test.ts` 退出码 0，且 `grep -q "'workspace'" src/contract.ts` 与 zh/en 键集完全一致。

## 8. 静态门禁、隔离实例冒烟与浏览器证据（2 项并行）

- [ ] 8.1 跑静态门禁与产物纯度断言（P2/P3 不改的验证）：`pnpm --filter dsh-plugin-session-tool-toggle verify:all`、`pnpm dsh:check`、`docker exec dsh dsh --profile web --dump-config-schema`、`! grep -qE "^import .*@deepseek-ai" plugins/session-tool-toggle/lib/index.js`、`grep -q "sidebar.footer.action" plugins/session-tool-toggle/lib/client.js`；验证：上述命令全部退出码 0 且末尾两条 `echo` 出现「host bundle: 只 node:* OK」「client bundle: footer 座位内联 OK」。
- [ ] 8.2 隔离实例冒烟与浏览器证据（6 条）：技能翻转只出一条目录替换消息、`/name` 仍注入完整正文、批量一次一单、重复关无字节变化、`workspaces.json` 权限 600/700 且当前会话不变/新会话首步生效/reset 回合并快照、坏文件降级、无 skills 组合降级、chrome-devtools 三张截图（技能行/面板工作区/footer 对话框）归档 `artifacts/`；验证：`openspec/changes/session-tool-toggle-skill-workspace/artifacts/smoke-record.md` 逐条含命令与观察，`stat -c '%a' ~/.dsh/session-tool-toggle/workspaces.json` 输出 `600`，且 `[ "$(ls artifacts/*.png | wc -l)" -ge 3 ]`。

## 9. 文档与发布（3 项并行）

- [ ] 9.1 更新 `plugins/session-tool-toggle/README.md`：能力（skill 级开关/工作区默认档）、预期管理（目录消息成本、`/name` 保留、面板与命令同源）、降级矩阵（skills/workspaceRegistry/文件损坏）、非目标改写（删「不做 per-skill」「不做工作区级默认档」，新增「不做追溯」「不做上游 patch」「上游菜单入口后续变更」）、回滚代价（回 1.4.0 丢 `skill:` 与工作区档）、配置表加 `workspacesFile`（D1）；验证：`grep -n "workspacesFile" plugins/session-tool-toggle/README.md` 且 `grep -n "skill:<" plugins/session-tool-toggle/README.md` 均命中。
- [ ] 9.2 更新根 `README.md` 插件一览与 `AGENTS.md` 插件清单条目（D2/D3）；验证：`grep -n "技能级开关\|工作区级默认档" README.md AGENTS.md` 命中两处。
- [ ] 9.3 发布 1.5.0：`pnpm release --dry-run` 复核版本与文件清单、`lib/` 重建提交、`pnpm verify` 与 `pnpm dsh:check` 全绿、profile 重装后重启并复跑冒烟第 1 条（D4）；验证：`pnpm release --dry-run` 打印 `1.5.0` 且文件清单含 `lib/index.js`/`lib/client.js`；发布后 `docker exec dsh dsh plugin --profile web list | grep session-tool-toggle` 显示 `1.5.0`。
