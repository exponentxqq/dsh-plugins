# Tasks

> 执行批次契约：`## N. 组名` = 执行审核批次，**组间串行**、**组内可并行**；每组任务附第三方可核对的验证句。逐任务实现要点见 `code-design.md` ⑤（G1–G8 与本分组一一对齐）。

## 1. 宿主宇宙构建（新模块 + 叶子导出）

- [ ] 1.1 新建 `plugins/session-tool-toggle/src/host/workspace-universe.ts`：`MCP_SERVER_PATTERN`（逐字照搬 `/inventory`，注释写明跨包双份锚点）、`buildWorkspaceUniverse(facts)` 纯函数（MCP 组按 server 升序 → 技能组 → 内置组；未归组只计数；技能行带 `modelInvocable/userInvocable/source`）、`EMPTY_WORKSPACE_UNIVERSE` 冻结常量、`createWorkspaceUniverseReader(access)`（`ctx.get('tools')/ctx.get('skills')` 现取，缺席/抛错降级空宇宙 + warn，永不抛错）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-universe.test.ts` 绿。
- [ ] 1.2 `plugins/session-tool-toggle/src/host/panel.ts` 仅把 `defaultsEntryOf` 改为 `export function` 并补注释；其余零改动。验证：`git diff plugins/session-tool-toggle/src/host/panel.ts` 只有该行与注释变化。
- [ ] 1.3 新建 `plugins/session-tool-toggle/test/workspace-universe.test.ts`：表驱动断言 `mcp__a__x`→组 a、`mcp__a__b__c`→组 a（suffix `b__c`）、`mcp__a.b__x`/`mcp__x`/`mcp__x__`→未归组计数；技能行三字段与 union 过滤；`skills` 缺席 → `skillsAvailable:false`；reader 对工具/技能服务缺席与抛错均返回空宇宙且不抛；纯函数性质（同入参深相等、入参不被修改）。验证：同 1.1 命令，且断言 `mcp__a.b__x` 不出现在任何 `groups[].tools[]`。

## 2. wire 契约与响应自检

- [ ] 2.1 `plugins/session-tool-toggle/src/contract.ts`：`DefaultsEntry` 增可选 `modelInvocable/userInvocable/source`（JSDoc「成对 + 仅 skill 地址」）、`DefaultsUniverse` 增可选 `ungroupedMcp/skillsComplete`；`WorkspaceValue.universe` 语义注释改写（工作区宇宙；null 仅混合版本兜底）。验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 双段 rc 0。
- [ ] 2.2 `src/contract.ts` parser：键白名单扩键、`readDefaultsEntry` 成对与 skill 地址校验、可选计数/布尔字段读取、未知键拒绝；`universe:null` 保持合法。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/wire-contract.test.ts` 绿（含新正反例：只给 `modelInvocable`、`tool:bash` 带技能字段、`ungroupedMcp:-1` 均拒绝）。
- [ ] 2.3 `test/wire-contract.test.ts` 补上述正反例用例。验证：同 2.2 命令。

## 3. 宿主接线与 RPC 行为

- [ ] 3.1 `plugins/session-tool-toggle/src/host/rpc.ts`：`RpcDeps` 增必需端口 `readWorkspaceUniverse: (path: string) => Promise<DefaultsUniverse>`；`handleWorkspace` 按 `resolved.target.kind` 分派（`'path'` → 新端口，`'session'` → 原 `universeOf` 不动）；新增 `readWorkspaceUniverseOf` 包装（抛错 → warn + 空宇宙）；改写 D-24/U1 相关注释。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/rpc.test.ts` 绿（path 读/写响应宇宙非 null 且 reader 收到规范键；reader 抛错 → 成功值 + `layerReady:false`；session 形态不调 reader）。
- [ ] 3.2 `plugins/session-tool-toggle/src/host/index.ts`：`rpcDeps` 挂 `createWorkspaceUniverseReader`（`ctx.get` 软读，不新增 `inject`）。验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` rc 0。
- [ ] 3.3 `test/rpc.test.ts`：既有 `universe:null`（path 形态）用例改写为非 null 断言 + 新增降级用例。验证：同 3.1 命令。

## 4. 清单组件升级（页面能力 + 面板零回归）

- [ ] 4.1 `plugins/session-tool-toggle/src/client/defaults-view.ts`：新增 `DefaultsFilterResult` 与 `filterDefaultsView(universe, disabled, query)`（空查询返回入参 identity；组键命中整组保留；行按 `shortName/address/description` 匹配；残差按**未过滤**宇宙的 `residualOf` 再筛查询词）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/defaults-view.test.ts` 绿。
- [ ] 4.2 `plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx`：props 增 `query?: string`、`showDetails?: boolean`，`copy.cliHint`/`copy.universeUnavailable` 变可选；过滤态组头改非交互 span 并强制展开、隐藏内置组本地过滤；`showDetails` 时行改两列（`rowMain`：名称行 + 描述次行 + 技能标签行）。**参数缺省时 DOM 与现行逐字一致**。验证：`git diff` 显示面板消费方（`DefaultsEditor.tsx`）零改动仍编译通过；既有 `workspace-editor.test.tsx` section 形态用例不改断言语义全绿。
- [ ] 4.3 `test/defaults-view.test.ts` 补过滤用例（空查询 identity、组键/行/残差命中、大小写与空白归一、无命中、残差不污染）。验证：同 4.1 命令。

## 5. client 正文重组（新页面 + 编辑器分支）

- [ ] 5.1 新建 `plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx`：B1 三卡（概要卡：工作区名/徽章/刷新/key/档文件/三计数/corrupt；清单卡：全局过滤 + `listHint` + 空档块 + `DefaultsGroupList query showDetails` + 残留 + 三条条件注记；命令卡：目标键注释 + 命令块 + 复制按钮 + 边界说明）+ 脚注 + 页脚动作区 + 失败 alert；本地状态仅 `query` 与复制反馈；技能来源标签用 `skill.source.*` 映射（未知值原样）。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 新页面用例绿。
- [ ] 5.2 `plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx`：`dialog` 分支委托 `<WorkspaceDefaultsPage/>`，删 `<h3>{workspace.title}</h3>`；`section` 分支逐字保留；`universe` JSDoc 更新。验证：`grep -c 'workspace.title' plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 仅剩 section 分支一处标题用法；h3 断言用例同步删除。
- [ ] 5.3 `plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 仅注释同步（「页面形态 = 工作区宇宙；面板形态 = 会话视角宇宙」）。验证：`git diff` 该文件无逻辑行变化。
- [ ] 5.4 `test/workspace-editor.test.tsx`：删 3 处 h3 断言；新增概要卡/清单卡/命令卡/过滤/空档/复制/刷新用例；section 形态既有用例全保留。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/workspace-editor.test.tsx` 绿。

## 6. 样式与文案

- [ ] 6.1 `plugins/session-tool-toggle/src/client/panel.module.css`：新增页面类（`.workspacePage/.card/.cardHeader/.cardTitle/.badge/.facts/.counts/.listHeader/.pageFilter/.emptyBlock/.commandRow/.command/.footnotes/.note/.rowMain/.rowDescription/.rowTags/.metaTag` 等，令牌 + 静态兜底），既有类零改动；仍是本包唯一 CSS module。验证：`git diff` 无既有类删除行；`pnpm --filter dsh-plugin-session-tool-toggle build` 后产物断言注入器计数不变（`pnpm dsh:check`）。
- [ ] 6.2 `plugins/session-tool-toggle/src/client/locales.ts`：新增 29 键（zh/en 同步，含 `workspace.listHint/globalUnion/ungrouped/skillsIncomplete/commandNote/copy/copyOk/copyFail/refresh 既有复用`、`skill.source.*` 7 键、空态与降级键），不动面板既有键。验证：`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run test/` 全绿（locale 键测试覆盖 zh/en 键集合一致）。

## 7. spec 与 README 同步

- [ ] 7.1 `openspec/specs/dsh-session-tool-toggle/spec.md`：按本变更 delta 归档口径更新主 spec（「默认档编辑面的分组开关形态」宇宙口径 + 新 Requirement「工作区默认档页面的工作区宇宙」）。验证：`openspec validate improve-workspace-defaults-page --strict` rc 0（delta 与主 spec 一致性由后续 `openspec-sync-specs` 流程处理，本任务先保证 delta 本身合法）。
- [ ] 7.2 `plugins/session-tool-toggle/README.md`：删「路径形态 `universe:null`」两段，新增「页面宇宙 = 全局注册表并集 + 该工作区技能」「跨工作区只写意图」「未归组计数」「过滤/刷新/复制/空态」；命令边界保持「只作用本会话所属工作区」。验证：`grep -n 'universe:null\|universe: null' plugins/session-tool-toggle/README.md` 无输出；`pnpm docs:check` rc 0。

## 8. 全量测试与门禁

- [ ] 8.1 全量回归：`pnpm --filter dsh-plugin-session-tool-toggle verify:all` rc 0（含 build/typecheck/test/lint）。
- [ ] 8.2 仓级门禁：根目录 `pnpm test && pnpm typecheck && pnpm lint && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全部 rc 0；面板零回归终检：`git diff --stat` 不含 `ToolPanelAction.tsx`/`ToolPanelGroups.tsx`/`DefaultsEditor.tsx`/`DefaultsSectionFrame.tsx`/`panel-controller.ts`。
