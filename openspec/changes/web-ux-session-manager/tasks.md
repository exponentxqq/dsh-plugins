# Tasks

> 执行批次契约：`## N.` 组间严格串行，组内任务互不依赖、不写同一文件、可并行；每任务引用 `code-design.md` ①触达面条目编号；验证句第三方可核对。

## 1. 契约层

- [ ] 1.1 扩容线上契约（触达 #1 `src/contract.ts`）：5 个新端点常量、`ENDPOINTS` 扩到 7、`FAILURE_CODES` 增 `not-migrated`/`target-exists`、3 个上限常量（500/2000/255）、10 个新类型、4 个新 parser、`WebUxRequest` 判别联合与 `parseRequest`，`readPathSegment` 抽取、`parseDeleteRequest` 原样保留；验证：`pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0 且 `grep -n "PREVIEW_BATCH_ENDPOINT\|LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT\|'not-migrated'\|'target-exists'" plugins/web-ux/src/contract.ts | wc -l` ≥ 5
- [ ] 1.2 新建 `projectKey` 镜像（触达 #2 `src/project-key.ts`）：逐行镜像上游转义（分隔符折叠、`~XXXX` 转义、251 截断、首尾 `--`、空串抛错）+ `workspaceForProjectDir()`，零 import；验证：`grep -cn "node:\|@deepseek-ai" plugins/web-ux/src/project-key.ts` 输出 0 且 `pnpm --filter dsh-plugin-web-ux test -- project-key` 通过
- [ ] 1.3 契约边界校验测试（触达 #15 `test/contract.test.ts`）：新端点请求/响应 parser 穷举（未知字段、空数组、501 超限、控制字符、`.`/`..`、路径分隔符、坏形状响应）；验证：`pnpm --filter dsh-plugin-web-ux test -- contract` 退出码 0
- [ ] 1.4 projectKey 金表测试（触达 #16 `test/project-key.test.ts`）：code-design ⑤G1 的 12 条实测金表用例全数落档（含 `/a//b` 折叠、`~007E` 转义、300 字符截断、`''` 抛错）；验证：`pnpm --filter dsh-plugin-web-ux test -- project-key` 退出码 0 且用例数 ≥ 12（`grep -c "it(\|test(" plugins/web-ux/test/project-key.test.ts` ≥ 12）

## 2. 宿主纯流程

- [ ] 2.1 批量删除分支（触达 #3 `src/delete-session.ts`）：`collectDeleteSetMany`/`planDeleteBatch`/`previewDeleteBatch`/`deleteSessionBatch`/`archiveSessionBatch`（共用私有 `disposeBatch`；单次 `listStoredHeaders`；rejected 非空执行整单拒绝；`FileSystemOps.lstat` 增可选 `mtimeMs`；`isSafeSessionId` 以 `isSafePathSegment` 导出）；验证：`grep -n "export async function previewDeleteBatch\|export async function deleteSessionBatch\|export async function archiveSessionBatch\|export function collectDeleteSetMany" plugins/web-ux/src/delete-session.ts | wc -l` = 4 且 `pnpm --filter dsh-plugin-web-ux test -- delete-session` 通过
- [ ] 2.2 新建已迁移域（触达 #4 `src/migrated.ts`）：`MigratedPorts`/`MigratedFileOps`/`createArchiveFiles`（list 一层体积求和/remove/restore rename 优先 EXDEV 回退 copyTree）+ `listMigrated`/`deleteMigrated`/`restoreMigrated` 两阶段语义 + `SESSION_ADDED_EVENT`；验证：`grep -n "export async function listMigrated\|export async function deleteMigrated\|export async function restoreMigrated" plugins/web-ux/src/migrated.ts | wc -l` = 3 且 `grep -c "@deepseek-ai" plugins/web-ux/src/migrated.ts` = 0
- [ ] 2.3 批量流程测试（触达 #17 `test/delete-session.test.ts`）：并集去重、软失败预览、整单拒绝、archive 档 `archive-unavailable` 前置、文件失败不中止；验证：`pnpm --filter dsh-plugin-web-ux test -- delete-session` 退出码 0
- [ ] 2.4 已迁移域测试（触达 #18 `test/migrated.test.ts`）：两层枚举、`session-` 前缀目录原样、非目录/符号链接跳过、2000 截断、target-exists、EXDEV 回退、恢复后 ports 调用序；验证：`pnpm --filter dsh-plugin-web-ux test -- migrated` 退出码 0

## 3. 宿主接线

- [ ] 3.1 dispatcher 与端口装配（触达 #5 `src/index.ts`）：`parseRequest`+switch 七分支、`HostPorts` 合并两域、端口 +5（含 `announceRestored` 真实 header 优先、`api-session/added` 广播、`nodeFileSystem.lstat` 补 `mtimeMs`）；验证：`grep -n "LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT" plugins/web-ux/src/index.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux build` 退出码 0 且 `grep -c "list-migrated\|restore-migrated\|api-session/added" plugins/web-ux/lib/index.js` ≥ 3
- [ ] 3.2 接线集成测试（触达 #19 `test/index.test.ts`）：真实临时 `$DSH_HOME` 上跑列表（含前缀目录/非目录/truncated）、删除、恢复（目标冲突 → `target-exists`、attach 拒绝 → warning 且 `workspaceId:null`、`emitted` 含 `['api-session/added', …]`）；验证：`pnpm --filter dsh-plugin-web-ux test -- index` 退出码 0

## 4. 客户端 RPC

- [ ] 4.1 通道客户端扩容（触达 #7 `src/client/delete-client.ts`）：`callEndpoint` 抽取、`SessionManagerClient` 增 `previewBatch`/`disposeBatch`/`listMigrated`/`deleteMigrated`/`restoreMigrated`（`listMigrated()` 发 `{}`）、各响应过 parser；验证：`grep -n "createSessionManagerClient\|callEndpoint" plugins/web-ux/src/client/delete-client.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [ ] 4.2 RPC 测试（触达 #20 `test/delete-client.test.ts`）：每端点 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, body)`、宿主码透传（含新码）、4 种坏形状 → `bad-response`；验证：`pnpm --filter dsh-plugin-web-ux test -- delete-client` 退出码 0

## 5. 文案

- [ ] 5.1 双语文案（触达 #13 `src/client/locales.ts`）：按 code-design ③.7 清单 + 落档增补（取消归档动作与结果、伪选项 tab 2 空态等，约 58 键）加 `zh` 并补 `en` 同键镜像；验证：`grep -c "^  'manager\." plugins/web-ux/src/client/locales.ts` = 2 × manager 键数 且 `grep -n "'error.not-migrated'\|'error.target-exists'" plugins/web-ux/src/client/locales.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [ ] 5.2 文案对齐测试（触达 #25 `test/locale-parity.test.ts`）：required 列表追加 `manager.*` 关键键与两个新错误码；验证：`pnpm --filter dsh-plugin-web-ux test -- locale-parity` 退出码 0

## 6. 入口与模型

- [ ] 6.1 打开请求 store（触达 #8 `src/client/session-manager-store.ts`）：照 `delete-store.ts` 的 seq/identity 契约实现 `ManagerRequestStore`；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager` 通过（含 store 用例）
- [ ] 6.2 纯派生模型（触达 #9 `src/client/session-manager-model.ts`）：`ManagerTab`/`ManagerAction`/三域行派生（子代理过滤、归档交集、伪选项聚合含 P1 孤儿已归档、500 截断、running 置灰标记）/选择操作/`entryKeyOf`/`unarchiveSelected` 派生；验证：`grep -n "workspaceChoices\|archivedRows\|migratedRows" plugins/web-ux/src/client/session-manager-model.ts | wc -l` ≥ 3
- [ ] 6.3 全局入口组件（触达 #10 `src/client/SessionManagerTrigger.tsx`）：`sidebar.footer.action` 宽窄两形态、`aria-label` 恒在、服务未就绪返回 null；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-trigger` 退出码 0
- [ ] 6.4 测试替身扩容（触达 #27 `test/stubs/ui-primitives.tsx`）：补 `Checkbox`（label 包 input）/`SegmentedTabs`（role=tablist/tab）/5 个图标；验证：`grep -n "Checkbox\|SegmentedTabs" plugins/web-ux/test/stubs/ui-primitives.tsx | wc -l` ≥ 2
- [ ] 6.5 模型测试（触达 #21 `test/session-manager-model.test.ts`）：纯 node 覆盖三域行集、伪选项（含孤儿已归档）、500 截断、running 置灰、选择操作、双动作分派；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-model` 退出码 0
- [ ] 6.6 入口测试（触达 #22 `test/session-manager-trigger.test.tsx`）：宽/窄渲染、aria、点击登记请求、服务缺席静默；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-trigger` 退出码 0

## 7. 管理浮层与注册

- [ ] 7.1 管理浮层组件（触达 #11 `src/client/SessionManagerDialog.tsx`）：五阶段机（select/confirm/running/done/failed）、工作区选择器（`Menu` portal，A13 冲突则退化 `portal:false`）、三 tab（`SegmentedTabs`）、四动作分派（批量删除预览+模式+整单拒绝；归档/取消归档逐项报告；已迁移删除/恢复）、恢复后停原 tab（P3=A）、双动作在途互斥；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-dialog` 退出码 0
- [ ] 7.2 浮层样式（触达 #12 `src/client/session-manager.module.css`）：触发按钮/工具栏/列表行/徽标/选择条/结果区，颜色全走 `var(--dsw-alias-*, 兜底)`；验证：`grep -c "dsw-alias" plugins/web-ux/src/client/session-manager.module.css` ≥ 3
- [ ] 7.3 客户端注册（触达 #14 `src/client/index.ts`）：`MANAGER_TRIGGER_ORDER=100`/`MANAGER_OVERLAY_ORDER=520` 两 entry、渲染期软读 `connection`/`workspaces`/`sessions`、软注册 try/catch；验证：`grep -n "sidebar.footer.action\|MANAGER_OVERLAY_ID" plugins/web-ux/src/client/index.ts | wc -l` ≥ 2
- [ ] 7.4 浮层组件测试（触达 #23 `test/session-manager-dialog.test.tsx`）：阶段机推进、被拒项呈现、模式切换不重发预览、超限截断提示、恢复结果与 warnings、伪选项 tab 2、取消归档逐项结果；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-dialog` 退出码 0
- [ ] 7.5 注册面测试（触达 #24 `test/client-apply.test.ts`）：两新 entry 的注册与降级（座位缺失静默、服务缺席不渲染）；验证：`pnpm --filter dsh-plugin-web-ux test -- client-apply` 退出码 0

## 8. 收口与产物

- [ ] 8.1 宿主 tsconfig 增补（触达 #29 `plugins/web-ux/tsconfig.host.json`）：显式加入 `src/migrated.ts`、`src/project-key.ts`；验证：`node -e "const t=require('./plugins/web-ux/tsconfig.host.json');console.log(JSON.stringify(t).includes('migrated')&&JSON.stringify(t).includes('project-key'))"` 输出 true
- [ ] 8.2 客户端 tsconfig 增补（触达 #30 `plugins/web-ux/tsconfig.client.json`）：显式加入 5 个新客户端文件；验证：`node -e "const t=require('./plugins/web-ux/tsconfig.client.json').include||require('./plugins/web-ux/tsconfig.client.json');console.log(JSON.stringify(t).includes('session-manager'))"` 输出 true 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [ ] 8.3 包清单与锁file（触达 #28 `plugins/web-ux/package.json` + #34 根 `pnpm-lock.yaml`）：`dsh.client.inject` +3、devDeps +2（`0.2.1-rc.5`）、`description` 改述，根 `pnpm install` 更新 lockfile；验证：`node -e "const p=require('./plugins/web-ux/package.json');console.log(p.dsh.client.inject.includes('dsh-client-ui-sidebar')&&p.dsh.client.inject.includes('dsh-api-session-controller'))"` 输出 true 且 `pnpm install --frozen-lockfile` 退出码 0
- [ ] 8.4 bundle 断言与产物重建（触达 #26 `test/bundle.test.ts` + #33 `lib/`）：CSS 注入器断言 3→4、双产物标记（footer slot/端点名/`api-session/added`）、`pnpm --filter dsh-plugin-web-ux build` 重建；验证：`grep -n "toHaveLength(4)" plugins/web-ux/test/bundle.test.ts` 命中且 `pnpm --filter dsh-plugin-web-ux verify:all` 退出码 0
- [ ] 8.5 全仓回归（触达 #33/#34 波及面）：`pnpm dsh:check`（基线/pin/allowlist）+ `pnpm -r test` + `pnpm -r typecheck`；验证：三条命令依次退出码 0

## 9. 文档与冒烟

- [ ] 9.1 README 会话管理章节（触达 #31 `plugins/web-ux/README.md`）：新增 `## 会话管理`（入口与降级、三 tab、伪选项、批量语义、500 上限与分批序列、恢复语义、失败码表 +2）；改写三处旧论断（`:45` 警示表补恢复说明、`:115`/`:128` 恢复入口表述、`:194-199` 非目标删「批量处置」「不做恢复 GUI」）；双端结构树/tsconfig 清单/版本迁移段同步；验证：`grep -n "^## 会话管理" plugins/web-ux/README.md` 命中且 `grep -n "不提供恢复入口\|不做恢复 GUI" plugins/web-ux/README.md` 无输出且 `grep -n "restore-migrated" plugins/web-ux/README.md` 命中
- [ ] 9.2 注册清单注释同步（触达 #32 `plugins/web-ux/cordis.patch.yml`）：端点清单注释 2→7，注册行不变；验证：`grep -n "restore-migrated\|list-migrated" plugins/web-ux/cordis.patch.yml` 命中且 `git diff --stat plugins/web-ux/cordis.patch.yml` 显示无注册行变更（仅注释）
- [ ] 9.3 手工冒烟与记录（新建 `plugins/web-ux/artifacts/session-manager-smoke.md`）：按 code-design ⑤ 手工冒烟 5 步执行（link: 安装、三 tab 与伪选项、跨窗口状态漂移整单拒绝、恢复即时可见性验证 `api-session/added`、无主恢复落未分组）并逐项记录结果；验证：`test -f plugins/web-ux/artifacts/session-manager-smoke.md` 且文件含 5 步各自结论行

## 附录：执行期留痕

- 执行侧（spec-apply）在每组完成时于本文件对应组下方追加一行执行记录（组号、结论、关键证据）；R<n> 留痕格式沿用仓内既有变更惯例。
- 接续恢复时以本目录 `code-design.md` / `decisions.md` 落档副本为权威输入。
