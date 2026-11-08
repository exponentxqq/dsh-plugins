# Tasks

> 执行批次契约：`## N.` 组间严格串行；组内任务互不依赖、可并行（单组 ≤ 8）。每任务引用 `code-design.md` 触达面条目（§1.1–§1.6 / P3 附录）；验证句均为第三方可核对。

## 1. 契约与 client-kit 先行

- [ ] 1.1 改 `tooling/contracts` 的 owner 份额契约（§1.2：`src/index.ts` + `README.md`）：`WorkspaceConfigSectionOwnerProps` 改为 `{ workspace: WorkspaceConfigWorkspaceContext }`、新增三态联合类型、删 `WorkspaceConfigTriggerOrder`/`WorkspaceConfigDialogOrder`；验证：`grep -c "WorkspaceConfigTriggerOrder\|WorkspaceConfigDialogOrder" tooling/contracts/src/index.ts` 输出 0 且 `grep -n "kind: 'unassigned'" tooling/contracts/src/index.ts` 命中，`pnpm --filter @dsh-plugins/contracts typecheck` 退出码 0
- [ ] 1.2 新建 `tooling/client-kit` 包（P3 附录：package.json/tsconfig/vitest.config/README + `src/client-session.ts` 探测迁入收编 `sessionUsageOf` + `test/client-session.test.ts`）；验证：`test -f tooling/client-kit/src/client-session.ts && test -f tooling/client-kit/test/client-session.test.ts` 退出码 0 且 `pnpm --filter @dsh-plugins/client-kit test` 退出码 0
- [ ] 1.3 登记第五包治理面（P3 附录：`pnpm-workspace.yaml` packages 增条目 + `scripts/check-architecture.mjs` TOOLING_CONTRACT 增 `client-kit: { runtime: [], scripts: ['lint','typecheck','test'] }`）；验证：`node scripts/check-architecture.mjs` 退出码 0 且 `grep -n "client-kit" pnpm-workspace.yaml scripts/check-architecture.mjs` 两文件均命中

## 2. holder 页面骨架

- [ ] 2.1 新建页面壳（§1.1：`src/client/WorkspaceConfigPage.tsx` + `src/client/page.module.css`）——page/pageBar/pageTabs/tabpanel 骨架、真 tablist、本地 activeId、空态；验证：`grep -c "role=\|tablist" plugins/workspace-config/src/client/WorkspaceConfigPage.tsx` ≥ 3 且 `test -f plugins/workspace-config/src/client/page.module.css` 退出码 0
- [ ] 2.2 新建统一选择框（§1.1：`src/client/WorkspacePicker.tsx` + `src/client/workspace-choice.ts`）——Menu portal 必开、未分配排最后、Q10 三档默认、受控 value/onSelect；验证：`pnpm --filter dsh-plugin-workspace-config exec vitest run test/workspace-choice.test.ts` 退出码 0（纯策略测试先行落在 2.2 内）或 `test -f plugins/workspace-config/src/client/workspace-choice.ts` 退出码 0
- [ ] 2.3 新建工作区清单源与 session 薄层（§1.1 + P3 附录：`src/client/workspace-source.ts` 新建 + `src/client/session-context.ts` 改为消费 `@dsh-plugins/client-kit/client-session` 薄组合）；验证：`grep -c "@deepseek-ai/" plugins/workspace-config/src/client/workspace-source.ts` 为 0（结构端口）且 `grep -n "client-kit" plugins/workspace-config/src/client/session-context.ts` 命中
- [ ] 2.4 改文案键面（§1.1：`src/client/locales.ts`）——保留 `entry.label`、新增 `page.*` 全套、删 `dialog.*`；验证：`grep -c "dialog\." plugins/workspace-config/src/client/locales.ts` 为 0 且 `grep -n "page.workspace\|page.tabs" plugins/workspace-config/src/client/locales.ts` 命中

## 3. 双注册与旧形态删除

- [ ] 3.1 新建配对协调器与面板图标并重写装配面（§1.1：`src/client/panel-pair.ts` + `src/client/WorkspaceConfigPanelIcon.tsx` 新建、`src/client/index.ts` 整体替换——main/panellist 双注册经 createPanelPair、注入面改新端口函数）；验证：`grep -n "'main'" plugins/workspace-config/src/client/index.ts` 与 `grep -n "sidebar.panellist" plugins/workspace-config/src/client/index.ts` 均命中且 `grep -c "shell.overlay\|sidebar.footer.action" plugins/workspace-config/src/client/index.ts` 为 0
- [ ] 3.2 删除旧形态三件套（§1.1：`src/client/WorkspaceConfigDialog.tsx`、`src/client/WorkspaceConfigTrigger.tsx`、`src/client/open-store.ts`、`src/client/dialog.module.css`）；验证：`ls plugins/workspace-config/src/client/ | grep -c "Dialog\|Trigger\|open-store\|dialog.module"` 输出 0
- [ ] 3.3 常量与包事实收口（§1.1 + P3 附录：`src/client/contract.ts` 增 PANEL_ID/PANEL_ORDER 删两 order、`package.json` devDeps 增两个 DSH api 包与 `@dsh-plugins/client-kit`（不进 `dsh.client.inject`）、`cordis.patch.yml`/`build.mjs` 注释更新）；验证：`grep -n "PANEL_ID = 'workspace-config'" plugins/workspace-config/src/client/contract.ts` 命中且 `node -e "const p=require('./plugins/workspace-config/package.json');assert(!p.dsh.client.inject.includes('@deepseek-ai/dsh-api-workspace-controller') && p.devDependencies['@dsh-plugins/client-kit'])"` 退出码 0

## 4. session-tool-toggle 适配

- [ ] 4.1 改分节份额与寻址（§1.3：`src/client/WorkspaceEntry.tsx`——去 `close`/`currentSessionId` 加 `workspace`、`kind!=='workspace'` 空态不发请求、`key={path}` 重挂、`useWorkspaceDefaults` 删 select/targetRef）；验证：`grep -c "close" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 为 0 且 `grep -n "workspace.noTarget" plugins/session-tool-toggle/src/client/WorkspaceEntry.tsx` 命中
- [ ] 4.2 删节内下拉与探测文件（§1.3：`src/client/WorkspaceDefaultsEditor.tsx` 删 `<select>` 行与 choices/onSelect props、`src/client/index.ts` 去 currentSessionId、`src/client/current-session.ts` 删除、`src/client/seats.ts` 注释）；验证：`grep -c "workspace.select\|<select" plugins/session-tool-toggle/src/client/WorkspaceDefaultsEditor.tsx` 为 0 且 `test ! -f plugins/session-tool-toggle/src/client/current-session.ts` 退出码 0
- [ ] 4.3 文案与测试同步（§1.3：`src/client/locales.ts` 删 `workspace.select` 加 `workspace.noTarget`、`test/client-index.test.ts`/`test/workspace-editor.test.tsx`/`test/locale-parity.test.ts` 适配）；验证：`pnpm --filter dsh-plugin-session-tool-toggle test` 退出码 0 且 `grep -c "workspace.select" plugins/session-tool-toggle/src/client/locales.ts` 为 0

## 5. web-ux 适配

- [ ] 5.1 改会话管理分节（§1.4：`src/client/SessionManagerDialog.tsx`——去 `close` 加 `workspace` 三态渲染、删节内 Menu/WORKSPACE_MENU_PORTAL/menuOpen/choices/changeChoice/默认档 effect、`key={choiceKey}` 重挂、footer 五阶段重写 select 删取消/running 去 onClick/done/failed 改「完成」resetToSelect）；验证：`grep -c "WORKSPACE_MENU_PORTAL\|menuOpen" plugins/web-ux/src/client/SessionManagerDialog.tsx` 为 0 且 `grep -n "manager.finish" plugins/web-ux/src/client/SessionManagerDialog.tsx` 命中
- [ ] 5.2 裁剪 model 与注释（§1.4：`src/client/session-manager-model.ts` 删 workspaceChoices/defaultWorkspaceChoice/ManagerWorkspaceChoice（保留 UNASSIGNED_CHOICE/行集函数）、`src/client/index.ts` 注释）；验证：`grep -c "defaultWorkspaceChoice\|workspaceChoices" plugins/web-ux/src/client/session-manager-model.ts` 为 0 且 `grep -n "UNASSIGNED_CHOICE" plugins/web-ux/src/client/session-manager-model.ts` 命中
- [ ] 5.3 文案与测试同步（§1.4：`src/client/locales.ts` manager.close→manager.finish 删 manager.workspace.*、`test/session-manager-dialog.test.tsx`/`test/session-manager-model.test.ts`/`test/locale-parity.test.ts` 适配）；验证：`pnpm --filter dsh-plugin-web-ux test` 退出码 0 且 `grep -c "manager.close" plugins/web-ux/src/client/locales.ts` 为 0

## 6. multi-root-workspace 适配

- [ ] 6.1 改分节份额与空态（§1.5：`src/client/WorkspaceFoldersAction.tsx`——`close` → `workspace?` 可选份额、页内 `kind!=='workspace'` 渲染 `panel.noWorkspace` 空态、launcher 形态保持、`src/client/index.ts` 注释）；验证：`grep -c "close" plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` 为 0 且 `grep -n "panel.noWorkspace" plugins/multi-root-workspace/src/client/WorkspaceFoldersAction.tsx` 命中
- [ ] 6.2 compat 探测改消费 client-kit（P3 附录：`src/compat/client-session.ts` 删本地实现改 re-export/消费 `@dsh-plugins/client-kit/client-session`、`src/client/index.ts:50` import 路径核对、`package.json` devDeps 增 `@dsh-plugins/client-kit`）；验证：`grep -n "client-kit" plugins/multi-root-workspace/src/compat/client-session.ts plugins/multi-root-workspace/package.json` 均命中且 `grep -c "function currentSessionIdOf" plugins/multi-root-workspace/src/compat/client-session.ts` 为 0（无本地实现）
- [ ] 6.3 文案、测试与 ADR 注记（§1.5：`src/client/locales.ts` 加 `panel.noWorkspace`、`test/client-panel.spec.tsx`/`test/locale-parity.spec.ts` 适配、ADR-0013 末尾追加一行迁移注记）；验证：`pnpm --filter dsh-plugin-multi-root-workspace test` 退出码 0 且 `grep -c "workspace-config-page" plugins/multi-root-workspace/docs/decisions/ADR-0013*.md` ≥ 1

## 7. holder 测试迁移与产物断言

- [ ] 7.1 holder 新测试面（§1.1：新建 `test/page.test.tsx`/`test/workspace-choice.test.ts`/`test/workspace-source.test.ts`/`test/panel-pair.test.ts`，改 `test/apply.test.ts` 双注册与配对协调断言、`test/section-seat.poc.test.tsx` 哨兵改挂 main）；验证：`pnpm --filter dsh-plugin-workspace-config test` 退出码 0
- [ ] 7.2 删旧测试并重钉产物断言（§1.1：删 `test/dialog.test.tsx`/`test/trigger.test.tsx`、`test/bundle.test.ts` 断言 main/panellist/panel-id 存在 + footer/overlay/trigger/dialog id 不存在 + 样式注入器恰 1）；验证：`ls plugins/workspace-config/test/ | grep -c "dialog\|trigger"` 输出 0 且 `pnpm --filter dsh-plugin-workspace-config exec vitest run test/bundle.test.ts` 退出码 0
- [ ] 7.3 holder 全链验证（§1.1：`pnpm --filter dsh-plugin-workspace-config verify:all`——lint/typecheck/build/test，`lib/` 产物重建提交）；验证：`pnpm --filter dsh-plugin-workspace-config verify:all` 退出码 0 且 `node -e "const s=require('fs').readFileSync('plugins/workspace-config/lib/client.js','utf8');assert(!s.includes('shell.overlay') && !s.includes('sidebar.footer.action') && s.includes('sidebar.panellist'))"` 退出码 0

## 8. 文档、规范与真机冒烟

- [ ] 8.1 仓级文档同步（§1.6：根 `README.md`（:68/:98 段）与 `AGENTS.md`（:30 段）入口话术 + tooling 目录说明增 client-kit + 各插件 README 五份按 §1.1–§1.5 改写）；验证：`grep -c "footer 单入口\|统一弹窗" README.md AGENTS.md plugins/workspace-config/README.md` 每文件输出 0 且 `grep -n "client-kit" README.md AGENTS.md` 均命中
- [ ] 8.2 聚合门禁全量（§1.6 + P3 附录：`pnpm install` 后 `pnpm dsh:check` + `pnpm typecheck` + `pnpm test` + `pnpm build` 全仓四连）；验证：`pnpm dsh:check && pnpm typecheck && pnpm test && pnpm build` 退出码 0
- [ ] 8.3 真机冒烟与证据落档（§1.1：`artifacts/workspace-config-page-smoke.md`——link: 安装四包 + 重启 profile + GUI 断言：面板行在位、进入默认分节、切 tab 卸载、选择框联动两节读数、未分配空态、重进重置、无弹窗残留）；验证：`test -s plugins/workspace-config/artifacts/workspace-config-page-smoke.md` 退出码 0 且文档内含浏览器断言结果（evaluate 表达式或截图路径），`docker exec dsh dsh --profile web --dump-config` 退出码 0
