# Tasks

> 执行批次契约：`## N.` 组间严格串行；组内任务互不依赖、可并行（单组 ≤ 8）。每任务引用 `code-design.md` 触达面条目（§1.1–§1.6 / P3 附录）；验证句均为第三方可核对。

## 1. 契约与 client-kit 先行

- [x] 1.1 改 `tooling/contracts` 的 owner 份额契约（§1.2：`src/index.ts` + `README.md`）：`WorkspaceConfigSectionOwnerProps` 改为 `{ workspace: WorkspaceConfigWorkspaceContext }`、新增三态联合类型、删 `WorkspaceConfigTriggerOrder`/`WorkspaceConfigDialogOrder`；验证：`grep -c "WorkspaceConfigTriggerOrder\|WorkspaceConfigDialogOrder" tooling/contracts/src/index.ts` 输出 0 且 `grep -n "kind: 'unassigned'" tooling/contracts/src/index.ts` 命中，`pnpm --filter @dsh-plugins/contracts typecheck` 退出码 0
- [x] 1.2 新建 `tooling/client-kit` 包（P3 附录：package.json/tsconfig/vitest.config/README + `src/client-session.ts` 探测迁入收编 `sessionUsageOf` + `test/client-session.test.ts`）；验证：`test -f tooling/client-kit/src/client-session.ts && test -f tooling/client-kit/test/client-session.test.ts` 退出码 0 且 `pnpm --filter @dsh-plugins/client-kit test` 退出码 0
- [x] 1.3 登记第五包治理面（P3 附录：`pnpm-workspace.yaml` packages 增条目 + `scripts/check-architecture.mjs` TOOLING_CONTRACT 增 `client-kit: { runtime: [], scripts: ['lint','typecheck','test'] }`）；验证：`node scripts/check-architecture.mjs` 退出码 0 且 `grep -n "client-kit" pnpm-workspace.yaml scripts/check-architecture.mjs` 两文件均命中

## 2. holder 页面骨架

- [x] 2.1 新建页面壳（§1.1：`src/client/WorkspaceConfigPage.tsx` + `src/client/page.module.css`）——page/pageBar/pageTabs/tabpanel 骨架、真 tablist、本地 activeId、空态；验证：`grep -c "role=\|tablist" plugins/workspace-config/src/client/WorkspaceConfigPage.tsx` ≥ 3 且 `test -f plugins/workspace-config/src/client/page.module.css` 退出码 0
- [x] 2.2 新建统一选择框（§1.1：`src/client/WorkspacePicker.tsx` + `src/client/workspace-choice.ts`）——Menu portal 必开、未分配排最后、Q10 三档默认、受控 value/onSelect；验证：`pnpm --filter dsh-plugin-workspace-config exec vitest run test/workspace-choice.test.ts` 退出码 0（纯策略测试先行落在 2.2 内）或 `test -f plugins/workspace-config/src/client/workspace-choice.ts` 退出码 0
- [x] 2.3 新建工作区清单源与 session 薄层（§1.1 + P3 附录：`src/client/workspace-source.ts` 新建 + `src/client/session-context.ts` 改为消费 `@dsh-plugins/client-kit/client-session` 薄组合）；验证：`grep -c "@deepseek-ai/" plugins/workspace-config/src/client/workspace-source.ts` 为 0（结构端口）且 `grep -n "client-kit" plugins/workspace-config/src/client/session-context.ts` 命中
- [x] 2.4 改文案键面（§1.1：`src/client/locales.ts`）——保留 `entry.label`、新增 `page.*` 全套、删 `dialog.*`；验证：`grep -c "dialog\." plugins/workspace-config/src/client/locales.ts` 为 0 且 `grep -n "page.workspace\|page.tabs" plugins/workspace-config/src/client/locales.ts` 命中

## 3. 双注册与旧形态删除

- [x] 3.1 新建配对协调器与面板图标并重写装配面（§1.1：`src/client/panel-pair.ts` + `src/client/WorkspaceConfigPanelIcon.tsx` 新建、`src/client/index.ts` 整体替换——main/panellist 双注册经 createPanelPair、注入面改新端口函数）；验证：`grep -n "'main'" plugins/workspace-config/src/client/index.ts` 与 `grep -n "sidebar.panellist" plugins/workspace-config/src/client/index.ts` 均命中且 `grep -c "shell.overlay\|sidebar.footer.action" plugins/workspace-config/src/client/index.ts` 为 0
- [x] 3.2 删除旧形态三件套（§1.1：`src/client/WorkspaceConfigDialog.tsx`、`src/client/WorkspaceConfigTrigger.tsx`、`src/client/open-store.ts`、`src/client/dialog.module.css`）；验证：`ls plugins/workspace-config/src/client/ | grep -c "Dialog\|Trigger\|open-store\|dialog.module"` 输出 0
- [x] 3.3 常量与包事实收口（§1.1 + P3 附录：`src/client/contract.ts` 增 PANEL_ID/PANEL_ORDER 删两 order、`package.json` devDeps 增两个 DSH api 包与 `@dsh-plugins/client-kit`（不进 `dsh.client.inject`）、`cordis.patch.yml`/`build.mjs` 注释更新）；验证：`grep -n "PANEL_ID = 'workspace-config'" plugins/workspace-config/src/client/contract.ts` 命中且 `node -e "const p=require('./plugins/workspace-config/package.json');assert(!p.dsh.client.inject.includes('@deepseek-ai/dsh-api-workspace-controller') && p.devDependencies['@dsh-plugins/client-kit'])"` 退出码 0

## 4. session-tool-toggle 适配

- [x] 4.1 改分节份额与寻址（§1.3：`src/client/WorkspaceEntry.tsx`——去 `close`/`currentSessionId` 加 `workspace`、`kind!=='workspace'` 空态不发请求、`key={path}` 重挂、`useWorkspaceDefaults` 删 select/targetRef）；验证：`grep -c "close" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 为 0 且 `grep -n "workspace.noTarget" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 命中
- [x] 4.2 删节内下拉与探测文件（§1.3：`src/client/WorkspaceDefaultsEditor.tsx` 删 `<select>` 行与 choices/onSelect props、`src/client/index.ts` 去 currentSessionId、`src/client/current-session.ts` 删除、`src/client/seats.ts` 注释）；验证：`grep -c "workspace.select\|<select" plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 为 0 且 `test ! -f plugins/session-tool-toggle/src/client/current-session.ts` 退出码 0
- [x] 4.3 文案与测试同步（§1.3：`src/client/locales.ts` 删 `workspace.select` 加 `workspace.noTarget`、`test/client-index.test.ts`/`test/workspace-editor.test.tsx`/`test/locale-parity.test.ts` 适配）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0 且 `grep -c "workspace.select" plugins/session-tool-toggle/src/client/locales.ts` 为 0

## 5. web-ux 适配

- [x] 5.1 改会话管理分节（§1.4：`src/client/SessionManagerDialog.tsx`——去 `close` 加 `workspace` 三态渲染、删节内 Menu/WORKSPACE_MENU_PORTAL/menuOpen/choices/changeChoice/默认档 effect、`key={choiceKey}` 重挂、footer 五阶段重写 select 删取消/running 去 onClick/done/failed 改「完成」resetToSelect）；验证：`grep -c "WORKSPACE_MENU_PORTAL\|menuOpen" plugins/web-ux/src/client/SessionManagerDialog.tsx` 为 0 且 `grep -n "manager.finish" plugins/web-ux/src/client/SessionManagerDialog.tsx` 命中
- [x] 5.2 裁剪 model 与注释（§1.4：`src/client/session-manager-model.ts` 删 workspaceChoices/defaultWorkspaceChoice/ManagerWorkspaceChoice（保留 UNASSIGNED_CHOICE/行集函数）、`src/client/index.ts` 注释）；验证：`grep -c "defaultWorkspaceChoice\|workspaceChoices" plugins/web-ux/src/client/session-manager-model.ts` 为 0 且 `grep -n "UNASSIGNED_CHOICE" plugins/web-ux/src/client/session-manager-model.ts` 命中
- [x] 5.3 文案与测试同步（§1.4：`src/client/locales.ts` manager.close→manager.finish 删 manager.workspace.*、`test/session-manager-dialog.test.tsx`/`test/session-manager-model.test.ts`/`test/locale-parity.test.ts` 适配）；验证：`pnpm --filter dsh-plugin-web-ux test` 退出码 0 且 `grep -c "manager.close" plugins/web-ux/src/client/locales.ts` 为 0

## 6. multi-root-workspace 适配

- [x] 6.1 改分节份额与空态（§1.5：`src/client/WorkspaceFoldersAction.tsx`——`close` → `workspace?` 可选份额、页内 `kind!=='workspace'` 渲染 `panel.noWorkspace` 空态、launcher 形态保持、`src/client/index.ts` 注释）；验证：`grep -c "readonly close: () => void" plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` 为 0 且 `grep -n "panel.noWorkspace" plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` 命中（**R9 修正**：原句 `grep -c "close"` 子串误伤无关 prop `closeOnPointerLeave`，已恢复该 prop 并收窄验证句为 code-design 原文精确口径）
- [x] 6.2 compat 探测改消费 client-kit（P3 附录：`src/compat/client-session.ts` 删本地实现改 re-export/消费 `@dsh-plugins/client-kit/client-session`、`src/client/index.ts:50` import 路径核对、`package.json` devDeps 增 `@dsh-plugins/client-kit`）；验证：`grep -n "client-kit" plugins/multi-root-workspace/src/compat/client-session.ts plugins/multi-root-workspace/package.json` 均命中且 `grep -c "function currentSessionIdOf" plugins/multi-root-workspace/src/compat/client-session.ts` 为 0（无本地实现）
- [x] 6.3 文案、测试与 ADR 注记（§1.5：`src/client/locales.ts` 加 `panel.noWorkspace`、`test/client-panel.spec.tsx`/`test/locale-parity.spec.ts` 适配、ADR-0013 末尾追加一行迁移注记）；验证：`pnpm --filter dsh-plugin-multi-root-workspace test` 退出码 0 且 `grep -c "workspace-config-page" plugins/multi-root-workspace/docs/decisions/ADR-0013*.md` ≥ 1

## 7. holder 测试迁移与产物断言

- [x] 7.1 holder 新测试面（§1.1：新建 `test/page.test.tsx`/`test/workspace-choice.test.ts`/`test/workspace-source.test.ts`/`test/panel-pair.test.ts`，改 `test/apply.test.ts` 双注册与配对协调断言、`test/section-seat.poc.test.tsx` 哨兵改挂 main）；验证：`pnpm --filter dsh-plugin-workspace-config test` 退出码 0
- [x] 7.2 删旧测试并重钉产物断言（§1.1：删 `test/dialog.test.tsx`/`test/trigger.test.tsx`、`test/bundle.test.ts` 断言 main/panellist/panel-id 存在 + footer/overlay/trigger/dialog id 不存在 + 样式注入器恰 1）；验证：`ls plugins/workspace-config/test/ | grep -c "dialog\|trigger"` 输出 0 且 `pnpm --filter dsh-plugin-workspace-config exec vitest run test/bundle.test.ts` 退出码 0
- [x] 7.3 holder 全链验证（§1.1：`pnpm --filter dsh-plugin-workspace-config verify:all`——lint/typecheck/build/test，`lib/` 产物重建提交）；验证：`pnpm --filter dsh-plugin-workspace-config verify:all` 退出码 0 且 `node -e "const s=require('fs').readFileSync('plugins/workspace-config/lib/client.js','utf8');assert(!s.includes('shell.overlay') && !s.includes('sidebar.footer.action') && s.includes('sidebar.panellist'))"` 退出码 0

## 8. 文档、规范与真机冒烟

- [x] 8.1 仓级文档同步（§1.6：根 `README.md`（:68/:98 段）与 `AGENTS.md`（:30 段）入口话术 + tooling 目录说明增 client-kit + 各插件 README 五份按 §1.1–§1.5 改写）；验证：`grep -c "footer 单入口\|统一弹窗" README.md AGENTS.md plugins/workspace-config/README.md` 每文件输出 0 且 `grep -n "client-kit" README.md AGENTS.md` 均命中
- [x] 8.2 聚合门禁全量（§1.6 + P3 附录：`pnpm install` 后 `pnpm dsh:check` + `pnpm typecheck` + `pnpm test` + `pnpm build` 全仓四连）；验证：`pnpm dsh:check && pnpm typecheck && pnpm test && pnpm build` 退出码 0
- [x] 8.3 真机冒烟与证据落档（§1.1：`artifacts/workspace-config-page-smoke.md`——link: 安装四包 + 重启 profile + GUI 断言：面板行在位、进入默认分节、切 tab 卸载、选择框联动两节读数、未分配空态、重进重置、无弹窗残留）；验证：`test -s plugins/workspace-config/artifacts/workspace-config-page-smoke.md` 退出码 0 且文档内含浏览器断言结果（evaluate 表达式或截图路径），`docker exec dsh dsh --profile web --dump-config` 退出码 0

## 附录：执行期运行规则留痕

- **R1 tooling 新包登记必须双写**：`scripts/check-architecture.mjs` 里 AR2 的 `TOOLING_CONTRACT` 与 AR7 的 `REQUIRED_PACKAGES` 是两处独立清单，新 tooling 包两处都要登记（漏 REQUIRED_PACKAGES 会报「多余条目」与计数不符）。依据：G1 任务 1.3 首跑实测。连锁面：AR2/AR7 成功文案的包数计数、G8 文档五包话术同步（R3）。
- **R2 无头会话的 pnpm 安装态重建**：workspace 包形状变化（新包登记）后首跑 pnpm 命令会触发 `verifyDepsBeforeRun` 自动 install，purge `node_modules` 需 TTY；无头处置 = `pnpm --config.confirmModulesPurge=false install`（`CI=true` 不穿透 volta 容器包装，无效）。依据：G1 组级 install 实测（1.1/1.2 子代理与主会话均命中）。连锁面：G8 聚合门禁、后续任何需要 install 的批次。
- **R3 仓级「tooling 四包」话术清单（待 G8 8.1 同步为五包）**：`AGENTS.md:11`、根 `README.md:8`、`docs/decisions/ADR-0001`（标题与正文）、`docs/decisions/README.md:3` 与 `:25`、`templates/README.md:21`、`tooling/contracts/README.md:3` 与 `:79`。`docs/assessments/docs-unification.md:26` 为历史评估档不回改。依据：G1 任务 1.1/1.3 回执盘点。连锁面：G8 8.1 的 grep 断言（`grep -n "client-kit" README.md AGENTS.md`）与「四包」清零。
- **R4 base tsconfig 不为 client-kit 加 paths**：`tsconfig.plugin.base.json` 维持现状（host-kit/test-kit 有 paths、contracts 无；client-kit 按 contracts 同模式：devDep + `exports` types 直指 TS 源即可解析）。依据：G1 裁决——触达面清单未含该文件，P3 附录未要求。连锁面：G2（2.3）与 G6（6.2）消费方 typecheck 若报解析失败，以执行期事实重议并更新本条目。
- **R5 client-kit `sessionUsageOf` 三条裁量语义（已确认接受）**：①行缺有效 `updatedAt`（非有限数）跳过该行，不投影 0；②同 id 多行先到先得；③服务在场但目录为空返回 `{ updatedAtById: {} }`，仅服务缺席/快照不可读返回 `undefined`。依据：与 §3.10「服务缺席返回 undefined」不冲突且更保守，docblock 已留痕并有测试钉住。连锁面：G2 holder 读数消费、G6 compat 消费按同一语义预期。
- **R6 旧形态 d.ts 残留并入 7.2 删除面**：`plugins/workspace-config/lib/types/client/{WorkspaceConfigDialog,WorkspaceConfigTrigger,open-store}.d.ts` 是 tracked 产物，而本包 build-kit 的 `clean` 是 `js-only`（不清 d.ts 面），`build:types` 也不删无源产物——7.3 重建后仍会残留并随 `files: lib/**/*.d.ts` 发布。裁定：三个文件的删除并入 7.2 的删除面（7.3 重建后 `git status` 应无 lib 残留）。依据：G3 任务 3.1 回执发现。连锁面：7.2 删除清单、7.3 产物断言（`lib/` 干净）、8.2 全仓 build。
- **R7 stt 分节宇宙清单页面形态降级（用户裁决：接受）**：页面形态 stt 分节以 `{workspacePath}` 寻址，宿主既有契约（`src/host/rpc.ts:415-418`，D-24/U1）对路径形态恒返回 `universe: null` → 分组清单/组开关不可达，分节呈现「清单不可用说明 + 残留区 + 写入」。影响面仅页面新入口：/tools 面板分区（sessionId 视角）与命令面兜底不受影响；spec delta 无清单可达性场景承诺，实现与 spec 一致。用户裁决接受降级（2026-11-08，G4 组收尾）。依据：G4 任务 4.1/4.3 回执交叉发现。连锁面：G8 8.3 真机冒烟按「清单不可用说明 + 残留区」断言 stt 分节；后续如需页面内清单，另立变更（宿主 path 形态 universe 语义扩展 + spec 场景增补）。
- **R8 web-ux 死样式与旧冒烟文档清单（本期不清理，后续变更处理）**：①`plugins/web-ux/src/client/session-manager.module.css` 的 `workspaceButton`/`workspaceName` 死类名与文件头「工具栏（工作区选择器 + 三个 tab）」过时注释；②`plugins/web-ux/artifacts/session-manager-smoke.md:59` 仍教人配置已删除的 `WORKSPACE_MENU_PORTAL`；③`plugins/web-ux/README.md` 旧话术（:7/:219/:225/:243/:279/:282——「统一弹窗分节」「shell.overlay order 530」「[取消]/[关闭]」「进入分节默认选中最近使用的工作区」）——README 归 G8 8.1「各插件 README 五份改写」范围。依据：G5 任务 5.1/5.3 回执盘点。连锁面：8.1 web-ux README 改写时顺带核对；①②不在任何任务范围，随下次触及 web-ux 的变更清理。
- **R9 验证句子串误伤与收窄（G6/6.1）**：6.1 原验证句 `grep -c "close"` 会命中无关 prop `closeOnPointerLeave`（行为性 prop：指针移出即关菜单），子代理删它属行为变化而非无害清理——已恢复该 prop，验证句收窄为 code-design §1.5 原文的精确口径 `grep -c "readonly close: () => void"`。教训：验证句写正则/子串断言时用足够锚定的精确文本（带类型注解或完整签名），避免裸子串。连锁面：后续组（G7/G8）写断言时同此纪律；R3 的「四包」清零 grep 亦需检查子串误伤（`统一弹窗` 等词在别处出现）。
- **R10 仓级 docs:check 既有豁免（G8/8.1 核实）**：`node scripts/check-docs.mjs` 的 `7 errors, 5 warnings` 与 pristine HEAD 完全一致（8.1 以 git archive 干净副本对照，diff 为空，**0 新增**）。红项均不在本变更写范围：`docs/assessments/docs-unification.md:10/:67` 指向已归档 changes 的 5 条断链、`openspec/specs/dsh-plugin-toolchain/spec.md:207` 裸 ADR-0003、`:245` file:// URL。CI 的 `docs:check` 因此既有红——修复归后续变更（断链修复宜与归档链 spec-done 的 specs 同步同批）。连锁面：spec-done 归档后 `openspec/specs/dsh-workspace-config-entry` 合并时勿引入新断链；`pnpm docs:check` 聚合 exit 1 属既有豁免，非本变更引入。

## 附录：沉淀回流清单（spec-apply 第六节，最后批次组收尾工件化）

执行期对本变更目标仓（dsh-plugins）之外的工作流仓（`~/develop/dotfiles` 等）**零改动**——模型路由映射文件 `spec-workflow.yaml` 仅只读消费（apply/engine/parallelism/verify 各键按执行时点值生效），白名单核对为只读 grep。执行期全部新运行规则已以 **R1–R10** 条目落在上方附录（随最后批次提交入库），无散落在会话记忆中的未工件化规则：

| 条目 | 已提交去向 |
| --- | --- |
| R1 新包登记双写 / R2 无头 install 处置 / R3 四包话术清单（已随 8.1 清零）/ R4 base tsconfig 不加 paths / R5 client-kit 裁量语义 / R6 旧 d.ts 删除并入 7.2（已执行）/ R7 stt 宇宙降级（用户裁决）/ R8 web-ux 死样式与旧冒烟文档清单（本期不清理）/ R9 验证句子串误伤教训 / R10 docs:check 既有豁免 | 本文件附录（本次批次提交入库） |
| 消费方指针 | G8 文档同步（各插件 README 已引用相关口径）；spec-done 六要素汇报从本清单与 R 条目读出 |
