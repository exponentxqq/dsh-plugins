# Tasks

> 执行批次契约：`## N. 组名` = 执行审核批次，**组间串行**、**组内可并行**；每组任务附第三方可核对的验证句。逐任务实现要点见 `code-design.md` ⑤（G1–G8 与本分组一一对齐）。

## 1. 宿主宇宙构建（新模块 + 叶子导出）

- [x] 1.1 新建 `plugins/session-tool-toggle/src/host/workspace-universe.ts`：`MCP_SERVER_PATTERN`（逐字照搬 `/inventory`，注释写明跨包双份锚点）、`buildWorkspaceUniverse(facts)` 纯函数（MCP 组按 server 升序 → 技能组 → 内置组；未归组只计数；技能行带 `modelInvocable/userInvocable/source`）、`EMPTY_WORKSPACE_UNIVERSE` 冻结常量、`createWorkspaceUniverseReader(access)`（`ctx.get('tools')/ctx.get('skills')` 现取，缺席/抛错降级空宇宙 + warn，永不抛错）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-universe.test.ts` 绿。
- [x] 1.2 `plugins/session-tool-toggle/src/host/panel.ts` 仅把 `defaultsEntryOf` 改为 `export function` 并补注释；其余零改动。验证：`git diff plugins/session-tool-toggle/src/host/panel.ts` 只有该行与注释变化。
- [x] 1.3 新建 `plugins/session-tool-toggle/test/workspace-universe.test.ts`：表驱动断言 `mcp__a__x`→组 a、`mcp__a__b__c`→组 a（suffix `b__c`）、`mcp__a.b__x`/`mcp__x`/`mcp__x__`→未归组计数；技能行三字段与 union 过滤；`skills` 缺席 → `skillsAvailable:false`；reader 对工具/技能服务缺席与抛错均返回空宇宙且不抛；纯函数性质（同入参深相等、入参不被修改）。验证：同 1.1 命令，且断言 `mcp__a.b__x` 不出现在任何 `groups[].tools[]`。

## 2. wire 契约与响应自检

- [x] 2.1 `plugins/session-tool-toggle/src/contract.ts`：`DefaultsEntry` 增可选 `modelInvocable/userInvocable/source`（JSDoc「成对 + 仅 skill 地址」）、`DefaultsUniverse` 增可选 `ungroupedMcp/skillsComplete`；`WorkspaceValue.universe` 语义注释改写（工作区宇宙；null 仅混合版本兜底）。验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 双段 rc 0。
- [x] 2.2 `src/contract.ts` parser：键白名单扩键、`readDefaultsEntry` 成对与 skill 地址校验、可选计数/布尔字段读取、未知键拒绝；`universe:null` 保持合法。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 绿（含新正反例：只给 `modelInvocable`、`tool:bash` 带技能字段、`ungroupedMcp:-1` 均拒绝）。
- [x] 2.3 `test/wire-contract.test.ts` 补上述正反例用例。验证：同 2.2 命令。

## 3. 宿主接线与 RPC 行为

- [x] 3.1 `plugins/session-tool-toggle/src/host/rpc.ts`：`RpcDeps` 增必需端口 `readWorkspaceUniverse: (path: string) => Promise<DefaultsUniverse>`；`handleWorkspace` 按 `resolved.target.kind` 分派（`'path'` → 新端口，`'session'` → 原 `universeOf` 不动）；新增 `readWorkspaceUniverseOf` 包装（抛错 → warn + 空宇宙）；改写 D-24/U1 相关注释。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/rpc.test.ts` 绿（path 读/写响应宇宙非 null 且 reader 收到规范键；reader 抛错 → 成功值 + `layerReady:false`；session 形态不调 reader）。
- [x] 3.2 `plugins/session-tool-toggle/src/host/index.ts`：`rpcDeps` 挂 `createWorkspaceUniverseReader`（`ctx.get` 软读，不新增 `inject`）。验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` rc 0。
- [x] 3.3 `test/rpc.test.ts`：既有 `universe:null`（path 形态）用例改写为非 null 断言 + 新增降级用例。验证：同 3.1 命令。

## 4. 清单组件升级（页面能力 + 面板零回归）

- [x] 4.1 `plugins/session-tool-toggle/src/client/defaults-view.ts`：新增 `DefaultsFilterResult` 与 `filterDefaultsView(universe, disabled, query)`（空查询返回入参 identity；组键命中整组保留；行按 `shortName/address/description` 匹配；残差按**未过滤**宇宙的 `residualOf` 再筛查询词）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/defaults-view.test.ts` 绿。
- [x] 4.2 `plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx`：props 增 `query?: string`、`showDetails?: boolean`，`copy.cliHint`/`copy.universeUnavailable` 变可选；过滤态组头改非交互 span 并强制展开、隐藏内置组本地过滤；`showDetails` 时行改两列（`rowMain`：名称行 + 描述次行 + 技能标签行）。**参数缺省时 DOM 与现行逐字一致**。验证：`git diff` 显示面板消费方（`DefaultsEditor.tsx`）零改动仍编译通过；既有 `workspace-editor.test.tsx` section 形态用例不改断言语义全绿。
- [x] 4.3 `test/defaults-view.test.ts` 补过滤用例（空查询 identity、组键/行/残差命中、大小写与空白归一、无命中、残差不污染）。验证：同 4.1 命令。

## 5. client 正文重组（新页面 + 编辑器分支）

- [x] 5.1 新建 `plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx`：B1 三卡（概要卡：工作区名/徽章/刷新/key/档文件/三计数/corrupt；清单卡：全局过滤 + `listHint` + 空档块 + `DefaultsGroupList query showDetails` + 残留 + 三条条件注记；命令卡：目标键注释 + 命令块 + 复制按钮 + 边界说明）+ 脚注 + 页脚动作区 + 失败 alert；本地状态仅 `query` 与复制反馈；技能来源标签用 `skill.source.*` 映射（未知值原样）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 新页面用例绿。
- [x] 5.2 `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx`：`dialog` 分支委托 `<WorkspaceDefaultsPage/>`，删 `<h3>{workspace.title}</h3>`；`section` 分支逐字保留；`universe` JSDoc 更新。验证：`grep -c 'workspace.title' plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 仅剩 section 分支一处标题用法；h3 断言用例同步删除。
- [x] 5.3 `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 仅注释同步（「页面形态 = 工作区宇宙；面板形态 = 会话视角宇宙」）。验证：`git diff` 该文件无逻辑行变化。
- [x] 5.4 `test/workspace-editor.test.tsx`：删 3 处 h3 断言；新增概要卡/清单卡/命令卡/过滤/空档/复制/刷新用例；section 形态既有用例全保留。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 绿。

## 6. 样式与文案

- [x] 6.1 `plugins/session-tool-toggle/src/client/panel.module.css`：新增页面类（`.workspacePage/.card/.cardHeader/.cardTitle/.badge/.facts/.counts/.listHeader/.pageFilter/.emptyBlock/.commandRow/.command/.footnotes/.note/.rowMain/.rowDescription/.rowTags/.metaTag` 等，令牌 + 静态兜底），既有类零改动；仍是本包唯一 CSS module。验证：`git diff` 无既有类删除行；`pnpm --filter dsh-plugin-session-tool-toggle build` 后产物断言注入器计数不变（`pnpm dsh:check`）。
- [x] 6.2 `plugins/session-tool-toggle/src/client/locales.ts`：新增 29 键（zh/en 同步，含 `workspace.listHint/globalUnion/ungrouped/skillsIncomplete/commandNote/copy/copyOk/copyFail/refresh 既有复用`、`skill.source.*` 7 键、空态与降级键），不动面板既有键。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/` 全绿（locale 键测试覆盖 zh/en 键集合一致）。

## 7. spec 与 README 同步

- [x] 7.1 `openspec/specs/dsh-session-tool-toggle/spec.md`：按本变更 delta 归档口径更新主 spec（「默认档编辑面的分组开关形态」宇宙口径 + 新 Requirement「工作区默认档页面的工作区宇宙」）。验证：`openspec validate improve-workspace-defaults-page --strict` rc 0（delta 与主 spec 一致性由后续 `openspec-sync-specs` 流程处理，本任务先保证 delta 本身合法）。
- [x] 7.2 `plugins/session-tool-toggle/README.md`：删「路径形态 `universe:null`」两段，新增「页面宇宙 = 全局注册表并集 + 该工作区技能」「跨工作区只写意图」「未归组计数」「过滤/刷新/复制/空态」；命令边界保持「只作用本会话所属工作区」。验证：`grep -n 'universe:null\|universe: null' plugins/session-tool-toggle/README.md` 无输出；`pnpm docs:check` rc 0。

## 8. 全量测试与门禁

- [x] 8.1 全量回归：`pnpm --filter dsh-plugin-session-tool-toggle verify:all` rc 0（含 build/typecheck/test/lint）。
- [x] 8.2 仓级门禁：根目录 `pnpm test && pnpm typecheck && pnpm lint && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全部 rc 0；面板零回归终检：`git diff --stat` 不含 `ToolPanelAction.tsx`/`ToolPanelGroups.tsx`/`DefaultsEditor.tsx`/`DefaultsSectionFrame.tsx`/`panel-controller.ts`。

## 9. R15 真机验证期增量（用户三点裁定，2026-11-09）

- [x] 9.1 project-mcp 归属查询服务：`src/host/attribution-service.ts`（cordis `Service`，名 `projectMcp`，`managedServerNames` / `serverNamesForWorkspace` 两条 claim 读数，归属失败 `null`）+ `host/index.ts` 装配 + `test/attribution-service.test.ts`（6 用例：注册名/全量透传/根集收窄/附加根/null 语义/空索引）。验证句：`pnpm --filter dsh-plugin-project-mcp verify:all` rc 0（151 用例）。
- [x] 9.2 宿主过滤与标注：`workspace-universe.ts` facts 增 `projectServers`/`projectServersHere`（`null` = fail-closed）、组循环外来剔除 + `foreignProjectMcp` 计数、保留组 `source`/`countsTokens`；reader 软读 `projectMcp`（managed 抛错 → EMPTY；归属抛错 → null + warn 一次）；面板 `{sessionId}` 路径零改动。验证句：`test/workspace-universe.test.ts` R15 两 describe 11 用例绿（35/35）。
- [x] 9.3 契约扩展：`DefaultsGroup.source`（枚举，mcp-only）/`countsTokens`（布尔，mcp-only）+ `DefaultsUniverse.foreignProjectMcp`（可选非负）+ strict 字段集/parser 同步。验证句：`test/wire-contract.test.ts` R15 用例（通过 3 + 拒绝 5）全绿（313/313）。
- [x] 9.4 客户端呈现：组头 MCP 徽章（来源蓝/绿 + token 橙，只标组级）、行级 `TagSpec`/`tagToneClass` 着色（`panel.module.css` 四 `.tone*` 变体）、页面 `foreignProjectMcp` 注记第四连、locales +9 键（zh/en）与 REQUIRED_KEYS 同步。验证句：`test/workspace-editor.test.tsx` R15 两用例（48/48）+ locale-parity 全绿。
- [x] 9.5 spec 同步：主线 `openspec/specs/dsh-session-tool-toggle/spec.md`（「跨工作区条目列出」Scenario 改写为「整组剔除并注记」+ 新增组级徽章 Scenario）；`openspec/specs/dsh-project-mcp/spec.md` ADDED「跨插件归属查询服务」；delta 同步（本变更 specs 两文件）。验证句：`openspec validate dsh-session-tool-toggle dsh-project-mcp --strict` rc 0。
- [x] 9.6 增量门禁：两包 verify:all + 仓级 `pnpm dsh:check` 全部 rc 0；两包 `pnpm build` 产物重建（link worktree 直连，重启 profile 即生效）。

## 附录：执行期留痕

- **R12 全局过滤的组命中语义**：组级命中 = 组键（`group.key`）命中**或该组任一行命中**，命中即保留整组（不筛行）；组键与全部行都不命中时空组丢弃。依据 = `code-design.md` ③3.4 第 399 行权威源；4.1 初版误实现为「行命中只留命中行」，经 4.3 用例 3 红暴露、主会话读权威源裁决为**实现偏差**（非设计变更），修复子代理改 `filteredGroupOf` 后 29/29 转绿。适用范围 = `filterDefaultsView`（`src/client/defaults-view.ts`）及全部消费方（`DefaultsGroupList` 过滤视图、G5 `WorkspaceDefaultsPage` 全局过滤）。连锁面 = `test/defaults-view.test.ts` 行/描述命中用例按「整组保留」口径断言；后续若改语义须同步改 code-design ③3.4、4.3 用例与本条（前条标注被推翻）。
- **R13 新增 host 侧测试文件须同步接入 tsconfig include**：`tsconfig.host.json` 的 include 是显式字母序列表（`tsconfig.client.json` 对 `.test.tsx` 是通配，host 侧 `.ts` 测试不在内），新增 `.ts` 测试文件必须同批加一行 include，否则 AR8（结构不变式）在 `pnpm dsh:check` 红错。依据 = 6.1 执行期暴露：1.3 的 `test/workspace-universe.test.ts` 未接入，AR8 报「未被任何 tsconfig include 覆盖」；主会话补 `tsconfig.host.json` 一行（`test/workspaces.test.ts` 前）后 typecheck rc 0 + dsh:check 三组全过。适用范围 = 本仓全部插件的 host 侧测试新增。连锁面 = G8 全量门禁的 dsh:check；后续新增 host 测试文件的任务须把 include 行写入本任务验证范围。
- **R14 跨变更工件的最小清偿修复**：`openspec/changes/2026-11-08-workspace-folders-picker/code-design.md`（他变更已归档工件，提交 8916abe 引入）的 2 处「规则自述示例链接」被仓级 `docs:check` 链接检查器判断链（`(artifacts/…)` 省略号占位、`(./decisions/ADR-0006-…)` 相对路径在 changes/ 下不可解析），阻塞本变更 G8.2 的 docs:check rc 0。修复（worktree 内，随 feature 分支提交）：857 行示例去链接形态改文字描述；859 行示例改真实可解析相对路径 `../../../plugins/multi-root-workspace/docs/decisions/ADR-0006-…`。反引号包裹不能跳过检查（行内代码内链接仍被解析）——**教训：仓级链接检查器对行内代码中的 `[..](..)` 形态照判，写示例格式说明时须彻底避开方括号+圆括号相邻写法**。适用范围 = openspec 全目录文档；连锁面 = G8.2 docs:check；他变更主检出侧同文件随本 feature 分支合并时同步覆盖。
- **R15 页面宇宙按工作区过滤（原「跨工作区条目列出且意图容忍」被推翻）**：真机复核发现页面列出 dbx/figma 等**非本工作区**的 MCP——页面宇宙读未受限全局注册表（进程级并集），而这些服务器已是 opc 工作区的项目级配置（project-mcp 按会话根集隔离，本工作区会话不可见）。用户裁定①整组剔除并注记计数（`foreignProjectMcp`）；实现 = project-mcp 发布 `projectMcp` 归属查询服务（claim 语义）+ session-tool-toggle 宿主按归属集过滤；归属瞬时失败 fail-closed（宁暂少列不误导）。教训：**「会话可见性隔离」与「按工作区路径的读数」是两个面**——后者没有宿主面时，全局并集读数会把其他工作区的项目级配置误列为可开关项；跨插件读数缝（cordis `Service` 兄弟可读，isolate symbol 统一挂 root）是标准解。适用范围 = `workspace-universe.ts` 构造器与 reader、project-mcp `attribution-service.ts`；连锁面 = spec 两处（session-tool-toggle Scenario 改写 + project-mcp ADDED）、delta 同步、wire 契约三键、组件组头徽章与页面注记。
- **R15 组级来源/token 标注与标签着色**（用户裁定②③）：MCP 组头两枚彩色徽章（用户级蓝/项目级绿 + 「计入对话上下文」橙）——来源讲配置位置（profile vs 本工作区 `.dsh/mcp/`），token 讲每个可见工具 schema 与服务器指令计入每次请求（MCP 恒真，与技能行 `modelInvocable` 的「占/不占」分野不同源）；只标 MCP 本身不标其下工具行。行级标签从纯字符串改 `{text, title?, tone}` 结构，`tagToneClass` 映射四个 `.tone*` CSS 变体（`--dsw-alias-state-*` 变量带字面量回退，暗色安全）。适用范围 = `DefaultsGroupList.tsx`（组头/行渲染）、`panel.module.css`、`locales.ts`；连锁面 = locale-parity REQUIRED_KEYS、`workspace-editor.test.tsx` 渲染断言。
