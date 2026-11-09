# Tasks

> 执行批次契约：`## N. 组名` = 执行审核批次，组间严格串行，组内任务互不依赖可并行。每任务描述引用 `code-design.md` ①触达面清单的条目（小节 + 文件）；验证句均可由第三方机械核对。

## 1. spec 修订

- [ ] 1.1 按 `code-design.md` ①1.4（`openspec/changes/<change>/specs/dsh-session-tool-toggle/spec.md` 新建 delta）与 ⑤TG1 的七条要点编写 spec delta：7 条 MODIFIED（标题逐字沿用），`dsh-workspace-config-entry` 零改动；验证：`pnpm spec:check` 退出 0，且 `grep -c '^### Requirement' openspec/changes/2026-11-09-session-tool-panel-rework/specs/dsh-session-tool-toggle/spec.md` 输出 7，且 `grep -rn '面板「工作区默认档」分区\|用户级默认档分区\|面板两分区' openspec/changes/2026-11-09-session-tool-panel-rework/specs/` 无输出

## 2. 契约收缩

- [ ] 2.1 按 `code-design.md` ①1.2（`plugins/session-tool-toggle/src/contract.ts`）与 ⑤TG2 步骤 1/2/7：删 `DEFAULTS_ENDPOINT`/`DefaultsAction` 族/`DefaultsRequest`/`DefaultsValue`/`parseDefaults*`；`ENDPOINTS` 收敛四元组；`PanelSnapshot` 删 `defaults`/`workspace`；P-1=b 收缩 `WorkspaceRequest`（删 `sessionId`）/`WorkspaceValue`（删 `choices`）/`WorkspaceChoice`/`readWorkspaceChoice`/`parseWorkspaceValue` 对应段；验证：`grep -c "DEFAULTS_ENDPOINT\|parseDefaultsValue\|WorkspaceChoice\|readWorkspaceChoice" plugins/session-tool-toggle/src/contract.ts` 为 0，且 `grep -n "'panel', 'toggle', 'reset', 'workspace'" plugins/session-tool-toggle/src/contract.ts` 命中

## 3. 宿主与客户端收缩

- [ ] 3.1 按 `code-design.md` ①1.2（`src/host/{types,panel,rpc,index}.ts` 四文件）与 ⑤TG2 步骤 3/4/5/6/9：删 `defaults` 端点分派与三函数、快照组装去两字段五 inputs 键、`RpcDeps`/deps 收缩、P-1=b 删 `resolveWorkspace` session 分支与 `attributionOf`、`universeOfTarget` 恒工作区宇宙、响应去 `choices`；验证：`grep -rn "handleDefaults\|defaultsStateOf\|writeDefaultsOf\|WorkspacePanelInputs\|attributionOf" plugins/session-tool-toggle/src/host/` 无输出，且 `pnpm --filter dsh-plugin-session-tool-toggle typecheck` host 段退出 0
- [ ] 3.2 按 `code-design.md` ①1.1（`src/client/panel-client.ts`）与 ⑤TG2 步骤 8：删 `updateDefaults` 方法与 `defaultsPayload`、import 面去 defaults 族与 `WorkspaceChoice`、workspace 手写 parser 去 `choices` 解析；验证：`grep -c "defaultsPayload\|updateDefaults\|WorkspaceChoice" plugins/session-tool-toggle/src/client/panel-client.ts` 为 0

## 4. 控制器收缩

- [ ] 4.1 按 `code-design.md` ①1.1（`src/client/panel-controller.ts`）与 ⑤TG3 及 ③3.7：删 `updateDefaults`/`refreshWorkspace`/`updateWorkspace`/`workspaceRequest`/`commitWorkspace`/`workspaceSeq` 与 `PanelState` 八字段，`refresh`/`toggle`/`reset` 的 patch 去两行，`close()` 只清 `error`；验证：`grep -rn "updateDefaults\|refreshWorkspace\|updateWorkspace\|savingDefaults\|workspaceChoices\|workspaceSaved" plugins/session-tool-toggle/src/client/panel-controller.ts` 无输出，且 `pnpm --filter dsh-plugin-session-tool-toggle typecheck` client 段退出 0

## 5. 清单吸收会话语义

- [ ] 5.1 按 `code-design.md` ①1.1（`src/client/defaults-view.ts`）与 ③3.4：新增 `skillAddressOf`/`shadowedSkillAddressesOf`/`effectiveClosedOf` 三纯函数，`skillEntryOf` 改用 `skillAddressOf`；验证：`grep -c "export function skillAddressOf\|export function shadowedSkillAddressesOf\|export function effectiveClosedOf" plugins/session-tool-toggle/src/client/defaults-view.ts` 为 3
- [ ] 5.2 按 `code-design.md` ①1.1（`src/client/group-shape.ts` 新建）与 ③3.3：迁入 `groupTitle`/`defaultExpanded`（自 `ToolPanelGroups.tsx`），实现 `GroupListWording`/`wordingOf`/`copyBundleOf`，纯模块零 React 依赖；验证：`grep -c "^import" plugins/session-tool-toggle/src/client/group-shape.ts` 为 0（纯 `import type` 除外——断言 `grep -c "from 'react'" plugins/session-tool-toggle/src/client/group-shape.ts` 为 0），且 `grep -c "export function groupTitle\|export function defaultExpanded\|export function wordingOf\|export function copyBundleOf" plugins/session-tool-toggle/src/client/group-shape.ts` 为 4
- [ ] 5.3 按 `code-design.md` ①1.1（`src/client/DefaultsGroupList.tsx`）与 ③3.3 差异表：加 `session?` 可选槽与 `copy?` 缺省化，`DefaultsRow`/`DefaultsGroupRow`/`ResidualChips` 按会话形态分支（pending 标签、`effectiveDisabled` 口径、`shadowed` 标签、`skill.blocked` 提示行、组头 intentOnly 标签、残留 chip「开启」文案）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0，且 `grep -c "SessionListState" plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx` ≥2

## 6. 面板三卡重构与文案样式

- [ ] 6.1 按 `code-design.md` ①1.1（`src/client/panel-failure.tsx` 新建）与 ⑤TG5 步骤 1：迁入 `PanelFailure`/`errorKeyOf`/`failureParams`/`failureOf`/`FailureRow` 五件；验证：`grep -c "export" plugins/session-tool-toggle/src/client/panel-failure.tsx` ≥5，且 `grep -rn "from './DefaultsEditor.tsx'" plugins/session-tool-toggle/src/client/` 无输出
- [ ] 6.2 按 `code-design.md` ①1.1（`src/client/CommandCard.tsx` 新建）与 ③3.5：实现共用命令卡（`COMMAND_PLACEHOLDER` 导出、复制三态 + 2s 复位 + `aria-live` + clipboard 软降级，零 `t` 依赖）；验证：`grep -c "export const COMMAND_PLACEHOLDER" plugins/session-tool-toggle/src/client/CommandCard.tsx` 为 1，且 `grep -c "t(" plugins/session-tool-toggle/src/client/CommandCard.tsx` 为 0
- [ ] 6.3 按 `code-design.md` ①1.1（`src/client/ToolPanelAction.tsx` 重写）与 ③3.6：三卡 + footer 动作区形态，删 `StateSection`/`DisabledSection`/两分区挂载，派生 `universe`/`counts`/`session`/`commandText`；删除 `ToolPanelGroups.tsx`/`SkillPanel.tsx`/`DefaultsEditor.tsx`/`DefaultsSectionFrame.tsx` 四文件；验证：`grep -rn "ToolPanelGroups\|SkillPanel\|DefaultsSectionFrame\|variant=\"section\"" plugins/session-tool-toggle/src/` 无输出，且 `ls plugins/session-tool-toggle/src/client/ToolPanelGroups.tsx plugins/session-tool-toggle/src/client/SkillPanel.tsx plugins/session-tool-toggle/src/client/DefaultsEditor.tsx plugins/session-tool-toggle/src/client/DefaultsSectionFrame.tsx 2>&1 | grep -c "No such file"` 为 4
- [ ] 6.4 按 `code-design.md` ①1.1（`src/client/WorkspaceDefaultsPage.tsx`）与 ⑤TG5 步骤 2：命令卡段替换为 `<CommandCard/>`，删复制状态机约 60 行，`css.workspacePage` → `css.cardStack`，`PanelFailure` 改 import 新模块；验证：`grep -c "CommandCard" plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` ≥1，且 `grep -c "copyState\|scheduleCopyReset\|COPY_RESET_MS" plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` 为 0
- [ ] 6.5 按 `code-design.md` ①1.1（`src/client/{WorkspaceDefaultsEditor,WorkspaceEntry}.tsx`）与 ⑤TG5 步骤 4：编辑器收敛 dialog-only（删 `variant` 与 section 分支），分节入口删 `variant` 传参、`PanelFailure`/`failureOf` 改 import `panel-failure.tsx`；验证：`grep -c "WorkspaceDefaultsVariant\|variant" plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 为 0，且 `grep -c "panel-failure" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` ≥1
- [ ] 6.6 按 `code-design.md` ①1.1（`src/client/{locales.ts,panel.module.css}`）与 ③3.8/3.9：新增 19 键（zh/en 各份）、按判据删约 32 死键、`REQUIRED_KEYS` 同步；`.workspacePage` 更名 `.cardStack`、删 `.section`/`.sectionTitle`/`.section > .rows`/`.sectionFrame` 四类；验证：`pnpm --filter dsh-plugin-session-tool-toggle test -- locale-parity` 退出 0，且 `grep -c "workspacePage" plugins/session-tool-toggle/src/client/panel.module.css` 为 0，且 `grep -c "session.commandComment\|session.listHint\|command.copied" plugins/session-tool-toggle/src/client/locales.ts` ≥3

## 7. 先行契约测试

- [ ] 7.1 按 `code-design.md` ①1.3（`test/defaults-group-list.test.tsx` 新建）：默认档形态零回归锚点（`session` 缺省 DOM/文案沿用、整组默认关标签、移除按钮）+ 会话形态四槽各一条 + `skill.blocked` 提示行 + 残留「开启」文案；验证：`pnpm --filter dsh-plugin-session-tool-toggle test -- defaults-group-list` 退出 0，且 `grep -c "session: {" plugins/session-tool-toggle/test/defaults-group-list.test.tsx` ≥1

## 8. 全量测试调整

- [ ] 8.1 按 `code-design.md` ①1.3（`test/` 其余全部文件）与 ⑤TG7：重写 `tool-panel.test.tsx`（三卡构成/无默认档分区断言/整组关行禁用/残留开启/两段式恢复）；收缩 `panel-controller`/`panel-client`/`wire-contract`（含「多余字段接受」三向）/`rpc`（`defaults` 未知端点 + workspace `{sessionId}` 拒绝）/`panel`/`defaults-view`（三新函数）/`workspace-editor`/`workspace-attribution`/`workspace-universe`/`locale-parity`/`bundle`（`ENDPOINTS` 长度 4）；删 `skill-panel.test.tsx`；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出 0，且 `grep -rn "updateDefaults\|refreshWorkspace" plugins/session-tool-toggle/test/` 无输出，且 `grep -c "toHaveLength(4)" plugins/session-tool-toggle/test/bundle.test.ts` ≥1，且 `ls plugins/session-tool-toggle/test/skill-panel.test.tsx 2>&1 | grep -c "No such file"` 为 1

## 9. 文档与门禁

- [ ] 9.1 按 `code-design.md` ①1.4（`plugins/session-tool-toggle/README.md`）八处：面板描述去默认档分区、目录结构三删三建、六段→三卡、五端点→四端点、两档不追溯段改写、面板能力重列、降级表三行、旧表述清理；验证：`grep -c "两个默认档分区\|五个端点" plugins/session-tool-toggle/README.md` 为 0，且 `grep -c "三卡\|四个端点" plugins/session-tool-toggle/README.md` ≥1
- [ ] 9.2 按 `code-design.md` ①1.5（产物 `lib/*.js`）与 ⑤TG8：重建产物并跑全量门禁；验证：`pnpm --filter dsh-plugin-session-tool-toggle build` 退出 0 后 `git status --porcelain plugins/session-tool-toggle/lib` 列出两个产物，且 `pnpm lint && pnpm typecheck && pnpm build && pnpm spec:check && pnpm dsh:check` 全部退出 0
