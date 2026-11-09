# Tasks

> 执行批次契约：`## N. 组名` = 执行审核批次，组间严格串行，组内任务互不依赖可并行。每任务描述引用 `code-design.md` ①触达面清单的条目（小节 + 文件）；验证句均可由第三方机械核对。

## 1. spec 修订

- [x] 1.1 按 `code-design.md` ①1.4（`openspec/changes/<change>/specs/dsh-session-tool-toggle/spec.md` 新建 delta）与 ⑤TG1 的七条要点编写 spec delta：7 条 MODIFIED（标题逐字沿用），`dsh-workspace-config-entry` 零改动；验证：`pnpm spec:check` 退出 0，且 `grep -c '^### Requirement' openspec/changes/2026-11-09-session-tool-panel-rework/specs/dsh-session-tool-toggle/spec.md` 输出 7，且 `grep -rn '面板「工作区默认档」分区\|用户级默认档分区\|面板两分区' openspec/changes/2026-11-09-session-tool-panel-rework/specs/` 无输出

## 2. 契约收缩

- [x] 2.1 按 `code-design.md` ①1.2（`plugins/session-tool-toggle/src/contract.ts`）与 ⑤TG2 步骤 1/2/7：删 `DEFAULTS_ENDPOINT`/`DefaultsAction` 族/`DefaultsRequest`/`DefaultsValue`/`parseDefaults*`；`ENDPOINTS` 收敛四元组；`PanelSnapshot` 删 `defaults`/`workspace`；P-1=b 收缩 `WorkspaceRequest`（删 `sessionId`）/`WorkspaceValue`（删 `choices`）/`WorkspaceChoice`/`readWorkspaceChoice`/`parseWorkspaceValue` 对应段；验证：`grep -c "DEFAULTS_ENDPOINT\|parseDefaultsValue\|WorkspaceChoice\|readWorkspaceChoice" plugins/session-tool-toggle/src/contract.ts` 为 0，且 `grep -n "'panel', 'toggle', 'reset', 'workspace'" plugins/session-tool-toggle/src/contract.ts` 命中

## 3. 宿主与客户端收缩

- [x] 3.1 按 `code-design.md` ①1.2（`src/host/{types,panel,rpc,index}.ts` 四文件）与 ⑤TG2 步骤 3/4/5/6/9：删 `defaults` 端点分派与三函数、快照组装去两字段五 inputs 键、`RpcDeps`/deps 收缩、P-1=b 删 `resolveWorkspace` session 分支与 `attributionOf`、`universeOfTarget` 恒工作区宇宙、响应去 `choices`；验证：`grep -rn "handleDefaults\|defaultsStateOf\|writeDefaultsOf\|WorkspacePanelInputs\|attributionOf" plugins/session-tool-toggle/src/host/` 无输出，且 `pnpm --filter dsh-plugin-session-tool-toggle typecheck` host 段退出 0
- [x] 3.2 按 `code-design.md` ①1.1（`src/client/panel-client.ts`）与 ⑤TG2 步骤 8：删 `updateDefaults` 方法与 `defaultsPayload`、import 面去 defaults 族与 `WorkspaceChoice`、workspace 手写 parser 去 `choices` 解析；验证：`grep -c "defaultsPayload\|updateDefaults\|WorkspaceChoice" plugins/session-tool-toggle/src/client/panel-client.ts` 为 0

## 4. 控制器收缩

- [x] 4.1 按 `code-design.md` ①1.1（`src/client/panel-controller.ts`）与 ⑤TG3 及 ③3.7：删 `updateDefaults`/`refreshWorkspace`/`updateWorkspace`/`workspaceRequest`/`commitWorkspace`/`workspaceSeq` 与 `PanelState` 八字段，`refresh`/`toggle`/`reset` 的 patch 去两行，`close()` 只清 `error`；验证：`grep -rn "updateDefaults\|refreshWorkspace\|updateWorkspace\|savingDefaults\|workspaceChoices\|workspaceSaved" plugins/session-tool-toggle/src/client/panel-controller.ts` 无输出，且 `pnpm --filter dsh-plugin-session-tool-toggle typecheck` client 段退出 0

## 5. 清单吸收会话语义

- [x] 5.1 按 `code-design.md` ①1.1（`src/client/defaults-view.ts`）与 ③3.4：新增 `skillAddressOf`/`shadowedSkillAddressesOf`/`effectiveClosedOf` 三纯函数，`skillEntryOf` 改用 `skillAddressOf`；验证：`grep -c "export function skillAddressOf\|export function shadowedSkillAddressesOf\|export function effectiveClosedOf" plugins/session-tool-toggle/src/client/defaults-view.ts` 为 3
- [x] 5.2 按 `code-design.md` ①1.1（`src/client/group-shape.ts` 新建）与 ③3.3：迁入 `groupTitle`/`defaultExpanded`（自 `ToolPanelGroups.tsx`），实现 `GroupListWording`/`wordingOf`/`copyBundleOf`，纯模块零 React 依赖；验证：`grep -c "^import" plugins/session-tool-toggle/src/client/group-shape.ts` 为 0（纯 `import type` 除外——断言 `grep -c "from 'react'" plugins/session-tool-toggle/src/client/group-shape.ts` 为 0），且 `grep -c "export function groupTitle\|export function defaultExpanded\|export function wordingOf\|export function copyBundleOf" plugins/session-tool-toggle/src/client/group-shape.ts` 为 4
- [x] 5.3 按 `code-design.md` ①1.1（`src/client/DefaultsGroupList.tsx`）与 ③3.3 差异表：加 `session?` 可选槽与 `copy?` 缺省化，`DefaultsRow`/`DefaultsGroupRow`/`ResidualChips` 按会话形态分支（pending 标签、`effectiveDisabled` 口径、`shadowed` 标签、`skill.blocked` 提示行、组头 intentOnly 标签、残留 chip「开启」文案）；验证：`pnpm --filter dsh-plugin-session-tool-toggle typecheck` 退出 0，且 `grep -c "SessionListState" plugins/session-tool-toggle/src/client/DefaultsGroupList.tsx` ≥2

## 6. 面板三卡重构与文案样式

- [x] 6.1 按 `code-design.md` ①1.1（`src/client/panel-failure.tsx` 新建）与 ⑤TG5 步骤 1：迁入 `PanelFailure`/`errorKeyOf`/`failureParams`/`failureOf`/`FailureRow` 五件；验证：`grep -c "export" plugins/session-tool-toggle/src/client/panel-failure.tsx` ≥5，且 `grep -rn "from './DefaultsEditor.tsx'" plugins/session-tool-toggle/src/client/` 无输出
- [x] 6.2 按 `code-design.md` ①1.1（`src/client/CommandCard.tsx` 新建）与 ③3.5：实现共用命令卡（`COMMAND_PLACEHOLDER` 导出、复制三态 + 2s 复位 + `aria-live` + clipboard 软降级，零 `t` 依赖）；验证：`grep -c "export const COMMAND_PLACEHOLDER" plugins/session-tool-toggle/src/client/CommandCard.tsx` 为 1，且 `grep -c "t(" plugins/session-tool-toggle/src/client/CommandCard.tsx` 为 0
- [x] 6.3 按 `code-design.md` ①1.1（`src/client/ToolPanelAction.tsx` 重写）与 ③3.6：三卡 + footer 动作区形态，删 `StateSection`/`DisabledSection`/两分区挂载，派生 `universe`/`counts`/`session`/`commandText`；删除 `ToolPanelGroups.tsx`/`SkillPanel.tsx`/`DefaultsEditor.tsx`/`DefaultsSectionFrame.tsx` 四文件；验证：`grep -rn "ToolPanelGroups\|SkillPanel\|DefaultsSectionFrame\|variant=\"section\"" plugins/session-tool-toggle/src/` 无输出，且 `ls plugins/session-tool-toggle/src/client/ToolPanelGroups.tsx plugins/session-tool-toggle/src/client/SkillPanel.tsx plugins/session-tool-toggle/src/client/DefaultsEditor.tsx plugins/session-tool-toggle/src/client/DefaultsSectionFrame.tsx 2>&1 | grep -c "No such file"` 为 4
- [x] 6.4 按 `code-design.md` ①1.1（`src/client/WorkspaceDefaultsPage.tsx`）与 ⑤TG5 步骤 2：命令卡段替换为 `<CommandCard/>`，删复制状态机约 60 行，`css.workspacePage` → `css.cardStack`，`PanelFailure` 改 import 新模块；验证：`grep -c "CommandCard" plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` ≥1，且 `grep -c "copyState\|scheduleCopyReset\|COPY_RESET_MS" plugins/session-tool-toggle/src/client/WorkspaceDefaultsPage.tsx` 为 0
- [x] 6.5 按 `code-design.md` ①1.1（`src/client/{WorkspaceDefaultsEditor,WorkspaceEntry}.tsx`）与 ⑤TG5 步骤 4：编辑器收敛 dialog-only（删 `variant` 与 section 分支），分节入口删 `variant` 传参、`PanelFailure`/`failureOf` 改 import `panel-failure.tsx`；验证：`grep -c "WorkspaceDefaultsVariant\|variant" plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 为 0，且 `grep -c "panel-failure" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` ≥1
- [x] 6.6 按 `code-design.md` ①1.1（`src/client/{locales.ts,panel.module.css}`）与 ③3.8/3.9：新增 19 键（zh/en 各份）、按判据删约 32 死键、`REQUIRED_KEYS` 同步；`.workspacePage` 更名 `.cardStack`、删 `.section`/`.sectionTitle`/`.section > .rows`/`.sectionFrame` 四类；验证：`pnpm --filter dsh-plugin-session-tool-toggle test -- locale-parity` 退出 0，且 `grep -c "workspacePage" plugins/session-tool-toggle/src/client/panel.module.css` 为 0，且 `grep -c "session.commandComment\|session.listHint\|command.copied" plugins/session-tool-toggle/src/client/locales.ts` ≥3

## 7. 先行契约测试

- [x] 7.1 按 `code-design.md` ①1.3（`test/defaults-group-list.test.tsx` 新建）：默认档形态零回归锚点（`session` 缺省 DOM/文案沿用、整组默认关标签、移除按钮）+ 会话形态四槽各一条 + `skill.blocked` 提示行 + 残留「开启」文案；验证：`pnpm --filter dsh-plugin-session-tool-toggle test -- defaults-group-list` 退出 0，且 `grep -c "session: {" plugins/session-tool-toggle/test/defaults-group-list.test.tsx` ≥1

## 8. 全量测试调整

- [x] 8.1 按 `code-design.md` ①1.3（`test/` 其余全部文件）与 ⑤TG7：重写 `tool-panel.test.tsx`（三卡构成/无默认档分区断言/整组关行禁用/残留开启/两段式恢复）；收缩 `panel-controller`/`panel-client`/`wire-contract`（含「多余字段接受」三向）/`rpc`（`defaults` 未知端点 + workspace `{sessionId}` 拒绝）/`panel`/`defaults-view`（三新函数）/`workspace-editor`/`workspace-attribution`/`workspace-universe`/`locale-parity`/`bundle`（`ENDPOINTS` 长度 4）；删 `skill-panel.test.tsx`；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出 0，且 `grep -rn "updateDefaults\|refreshWorkspace" plugins/session-tool-toggle/test/` 无输出，且 `grep -c "toHaveLength(4)" plugins/session-tool-toggle/test/bundle.test.ts` ≥1，且 `ls plugins/session-tool-toggle/test/skill-panel.test.tsx 2>&1 | grep -c "No such file"` 为 1

## 9. 文档与门禁

- [x] 9.1 按 `code-design.md` ①1.4（`plugins/session-tool-toggle/README.md`）八处：面板描述去默认档分区、目录结构三删三建、六段→三卡、五端点→四端点、两档不追溯段改写、面板能力重列、降级表三行、旧表述清理；验证：`grep -c "两个默认档分区\|五个端点" plugins/session-tool-toggle/README.md` 为 0，且 `grep -c "三卡\|四个端点" plugins/session-tool-toggle/README.md` ≥1
- [x] 9.2 按 `code-design.md` ①1.5（产物 `lib/*.js`）与 ⑤TG8：重建产物并跑全量门禁；验证：`pnpm --filter dsh-plugin-session-tool-toggle build` 退出 0 后 `git status --porcelain plugins/session-tool-toggle/lib` 列出两个产物，且 `pnpm lint && pnpm typecheck && pnpm build && pnpm spec:check && pnpm dsh:check` 全部退出 0

## 附录 · 执行期留痕






- **R7（批次 9.2 实测两事实）**：(a) **环境 pnpm 嵌套对账错配（非本变更引入，呈证报告项）**——仓库 pin `packageManager: pnpm@11.25.0` 与顶层包装链一致（`pnpm -v`=11.25.0），但嵌套 script 内的 `pnpm -r` 经 Corepack 解析到 11.28.5，pnpm ≥11 版本对账拒绝（"does not switch versions when running under corepack"）→ 裸 `pnpm lint`/`pnpm typecheck`/`pnpm build` 三条在本环境 exit 1（未执行任何包逻辑）；**等价展开形态 `pnpm -r run lint/typecheck/build` 全绿**（语义等价：根 script 内容即 `pnpm -r run <script>`）——验收按展开形态达成；环境侧修复（容器 corepack/pnpm 对齐，或 `dsh:upgrade` 升 pin）归用户拍板，CI 环境不受影响。(b) `test/panel-controller.test.ts` 的 P-1=b 遗留 fixture（`OTHER_WORKSPACE_PATH`/`workspaceValue`/`workspaceView`/`WORKSPACES_PATH`/`WORKSPACE_PATH`/`WorkspaceView` import 六项级联未用）主会话已清，清后包级 lint **0 warnings 0 errors**、test 1067 全绿、两段 typecheck 0——「全包 lint 0 warnings」口径恢复。连锁面：收尾复验（spec-done）跑裸 `pnpm lint/typecheck/build` 时按 (a) 展开形态或先修环境。

- **R6（批次 8 实测：8.1 验证句 2 与 ①1.3 内部冲突，按意图口径核）**：验证句「`grep -rn "updateDefaults\|refreshWorkspace" test/` 无输出」与 ①1.3 表 panel-controller 行**明文要求新增**的 `expect('updateDefaults' in controller).toBe(false)` 反向断言（及 client-index 形状断言改革命名残留、host 内核 `updateDefaults`/`updateWorkspaceDefaults` 现行导出名受 ①1.6 零改动面保护）互相矛盾——**设计工件内部冲突，非实现缺陷**。裁决：验证句意图 = 已删客户端方法/端点无正向消费残留，按精确模式 `\.(updateDefaults|refreshWorkspace|updateWorkspace)\(` 零命中核对（实测 0）；反向断言保留（①1.3 明文要求、且是方法已退出类型面的更强证据）；host 内核接缝测试文件（commands/control/rpc/workspaces）按真函数名引用不改。另：`tool-panel.test.tsx` 过滤用例断言写反已修正（行命中保留整组，对齐 `filteredGroupOf` JSDoc 与 defaults-view 纯函数锚点）；`client-index.test.ts` 两处形状断言五方法→四方法（批次 2 收缩的清单外跟随）。连锁面：批次 9 门禁无关本条；终末 verify 若复跑该 grep 判据按本条口径。

- **R5（批次 6.6 实测两事实）**：(a) **30 删实删 28**——`state.storeKind.record`/`state.storeKind.memory` 暂留：locale-parity 的 STORE_KINDS 闭集断言（REQUIRED_KEYS 表之外区域，超出 6.6 授权）把守该两键，删键必红灯；批次 8 需**连同该断言一并清理**两键（REQUIRED_KEYS 表 6.6 已同步删条目）；(b) **`pnpm --filter <pkg> test -- <pattern>` 的 `--` 转发在本工具链失效**（pnpm@11 + vitest(cac) 吞参 → 跑全量），单文件过滤的可用形态 = **`pnpm --filter dsh-plugin-session-tool-toggle exec vitest run <pattern>`**——组 7/8/9 的一切「test -- <pattern>」验证句按此形态执行（R2 延伸）。连锁面：批次 8 提示含 (a) 的 storeKind+STORE_KINDS 断言清理点。

- **R4（批次 6 第二波完成态实测）**：(a) 6.3 验证句 1 的全仓 11 处命中（`panel.module.css` 2、`group-shape.ts` 4、`DefaultsGroupList.tsx` 5）**全部为注释级**迁出来源与口径对照说明（如「自 `ToolPanelGroups.tsx` 迁入」「对齐 `ToolPanelGroups.tsx:212-213` 同口径」），零代码级引用、`variant="section"` 零命中——验证句按意图口径（组件与引用清干净）核对，注释保留（文档价值；css 侧两条由 6.6 改样式时顺手清理）；(b) `WorkspaceEntry.tsx` 的 `hasTarget` 判 `request.sessionId` 是 P-1=b 收缩的机械跟随（①1.1「其余零改动」未列），主会话已清（`workspacePath` 唯一寻址判单字段）——与 R1(b) control.ts 同类清单外机械连带；(c) 代码注释中的 `D-15`/`D-19`/`D-20`/`D-23`/`③3.18`/`3.19`/`W5` 等编号是**历史变更的注释出处引用体系**（`seats.ts`/`panel.ts`/`defaults-view.ts` 等多处同惯例，各自指向所属变更的设计文档编号空间），**非本变更工件**（本变更 design.md 决策编号 D-01…D-14）、非虚构引用——后续批次勿误判，亦不在本变更触达面内清理。

- **R3（批次 6.2 实测：验证句 `grep "t("` 与自然实现不兼容，按意图口径核）**：验证句 2 的特征串 `t(` 设计意图是拦翻译函数 `t(...)`，但 `setTimeout(` / `clearTimeout(` / `writeText(` / `useEffect(` 的调用尾串字面同形（`ct(`/`ut(`/`xt(`/`t(`），而复制复位定时器离不开这些 API——字面零命中与组件自然实现不兼容，属验证句设计疏漏。子代理曾以 `React['useEffect']` 索引形态迁就字面，主会话裁量为**代码自然性优先**：改回点号形态（`React.useEffect`/`window.clearTimeout`/`navigator.clipboard.writeText`），验收按意图执行——精确模式 `\bt\(` 代码区计 0（唯一命中在模块头注释描述特征串本身）+ 核读无翻译调用（文案全经 props）+ oxlint 0 warnings。连锁面：`CommandCard.tsx` 模块头注释已写明纪律与依据；后续批次不得为 grep 字面再引入索引调用形态。

- **R2（批次 5 实测：工具链执行形态）**：本会话 bash 环境内，插件包目录直接 `pnpm exec <bin>` 不可靠（pnpm 包装脚本经 volta default node 26.13.0 的 corepack shim，该镜像 bin 文件缺失 → `No such file or directory`）；**可用形态** = ①仓库根 `pnpm --filter dsh-plugin-session-tool-toggle exec <bin> …`（实测 tsc 5.9.3 正常）②包目录内 `node node_modules/typescript/bin/tsc -p …` 直调（node 走项目 volta pin 24.21.0，与 26.13.0 缺镜像无关，与 ① 等价）。连锁面：组 7/8/9 的验证命令按此形态执行（`pnpm --filter <pkg> test`、`pnpm lint`/`typecheck`/`build` 从仓库根跑）；等价直调兜底时须在回执注明形态。

- **R1（批次 3 实测三事实）**：(a) `tsconfig.host.json` 的 `include` 自既有形态就含 `test/**` 宿主侧测试——批次 8 之前任何批次跑「host 段退出 0」字面不可达，**核对口径 = src 侧零错误**（test 错误归批次 8 收缩时消除）；(b) `src/host/control.ts` 是 ①1.6 零改动面成员，但存在对组 2 已删符号的两处机械引用（`:36` import `WorkspaceChoice`、`:947` docblock 引 `defaultsStateOf`）——主会话已做三处一行级连带清理（+3/−3：import 删名、`:875` 局部变量类型内联为 `{key,title?}` 同形、注释改述），`readPanel` 的 `defaults`/`workspace` 读数产出与全部行为面未动——零改动面**意图**未破坏、字面条目被打破（对账记录即本条，工件不改，收尾呈证时向用户报告）；(c) `RpcDeps` 落地为 `extends Omit<ControlDeps,'defaultsIo'|'defaultsPath'>` + 私有 `kernelDepsOf()`（经 unknown cast，内核签名仍要完整 `ControlDeps`）——批次 8 的 `rpc.test.ts` 夹具去两键后，走默认内核的用例会读 `defaultsPath: undefined`，需注入假内核或自行兜底（细则见 `rpc.ts` 的 `kernelDepsOf` JSDoc）。连锁面：批次 8 提示按 (a)(c) 口径；`panel.ts` 导出 `buildDefaultsUniverse`/`defaultsEntryOf` 是否随批次 8 退役由该批次按测试面裁定。

## 组段执行终形态（批次 9 收尾）

README 八处落实（净 ±11 行；`:3/:5` 现读已合规零改动、`:18` 行概述形态故「三删」以旧描述消失体现、连带 `:131` 一致性修正一处）；产物 `lib/index.js` −344、`lib/client.js` −518（被删组件代码残留 0、新组件痕迹在位、require 词集合不变）；门禁终态：插件级 lint/typecheck/test/build + `pnpm spec:check`（15 specs）+ `pnpm dsh:check`（基线/AR1–AR8/B1–B5）原形态 exit 0，仓级裸 `pnpm lint/typecheck/build` 因环境 pnpm 嵌套对账错配以等价展开 `pnpm -r run` 形态验收（R7a）；`pnpm docs:check` 仓级 passed。**9 组 18 任务全部完成。**

## 附录 · 沉淀回流清单

- **执行期工作流仓（dotfiles）改动：零**——全部执行期改动落在本仓（`plugins/session-tool-toggle/**` + `openspec/changes/<change>/**` 工件），无跨仓外溢、无 R 条目涉及工作流仓文件；spec-done 六要素从本文件 R1–R7 与「组段执行终形态」读取。
