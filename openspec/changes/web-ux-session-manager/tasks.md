# Tasks

> 执行批次契约：`## N.` 组间严格串行，组内任务互不依赖、不写同一文件、可并行；每任务引用 `code-design.md` ①触达面条目编号；验证句第三方可核对。

## 1. 契约层

- [x] 1.1 扩容线上契约（触达 #1 `src/contract.ts`）：5 个新端点常量、`ENDPOINTS` 扩到 7、`FAILURE_CODES` 增 `not-migrated`/`target-exists`、3 个上限常量（500/2000/255）、10 个新类型、4 个新 parser、`WebUxRequest` 判别联合与 `parseRequest`，`readPathSegment` 抽取、`parseDeleteRequest` 原样保留；验证：`pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0 且 `grep -n "PREVIEW_BATCH_ENDPOINT\|LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT\|'not-migrated'\|'target-exists'" plugins/web-ux/src/contract.ts | wc -l` ≥ 5
- [x] 1.2 新建 `projectKey` 镜像（触达 #2 `src/project-key.ts`）：逐行镜像上游转义（分隔符折叠、`~XXXX` 转义、251 截断、首尾 `--`、空串抛错）+ `workspaceForProjectDir()`，零 import；验证：`grep -cn "node:\|@deepseek-ai" plugins/web-ux/src/project-key.ts` 输出 0 且 `pnpm --filter dsh-plugin-web-ux test -- project-key` 通过
- [x] 1.3 契约边界校验测试（触达 #15 `test/contract.test.ts`）：新端点请求/响应 parser 穷举（未知字段、空数组、501 超限、控制字符、`.`/`..`、路径分隔符、坏形状响应）；验证：`pnpm --filter dsh-plugin-web-ux test -- contract` 退出码 0
- [x] 1.4 projectKey 金表测试（触达 #16 `test/project-key.test.ts`）：code-design ⑤G1 的 12 条实测金表用例全数落档（含 `/a//b` 折叠、`~007E` 转义、300 字符截断、`''` 抛错）；验证：`pnpm --filter dsh-plugin-web-ux test -- project-key` 退出码 0 且用例数 ≥ 12（`grep -c "it(\|test(" plugins/web-ux/test/project-key.test.ts` ≥ 12）
- 执行记录（2026-11-04）：组1 ✅ 全绿 —— 4 任务全勾；干净窗口 `typecheck` EXIT=0、`test` 16 文件/431 用例全过且 SKIPPED 0；grep 断言 1.1=17（≥5）、1.2 纯度=0、1.4=24（≥12）；金表第 7 行按 R1 勘误（`/a/b/` → `--a-b---`，用户裁定严格镜像上游）；待决中转 1 轮（1.2 上浮金表冲突）。

## 2. 宿主纯流程

- [x] 2.1 批量删除分支（触达 #3 `src/delete-session.ts`）：`collectDeleteSetMany`/`planDeleteBatch`/`previewDeleteBatch`/`deleteSessionBatch`/`archiveSessionBatch`（共用私有 `disposeBatch`；单次 `listStoredHeaders`；rejected 非空执行整单拒绝；`FileSystemOps.lstat` 增可选 `mtimeMs`；`isSafeSessionId` 以 `isSafePathSegment` 导出）；验证：`grep -n "export async function previewDeleteBatch\|export async function deleteSessionBatch\|export async function archiveSessionBatch\|export function collectDeleteSetMany" plugins/web-ux/src/delete-session.ts | wc -l` = 4 且 `pnpm --filter dsh-plugin-web-ux test -- delete-session` 通过
- [x] 2.2 新建已迁移域（触达 #4 `src/migrated.ts`）：`MigratedPorts`/`MigratedFileOps`/`createArchiveFiles`（list 一层体积求和/remove/restore rename 优先 EXDEV 回退 copyTree）+ `listMigrated`/`deleteMigrated`/`restoreMigrated` 两阶段语义 + `SESSION_ADDED_EVENT`；验证：`grep -n "export async function listMigrated\|export async function deleteMigrated\|export async function restoreMigrated" plugins/web-ux/src/migrated.ts | wc -l` = 3 且 `grep -c "@deepseek-ai" plugins/web-ux/src/migrated.ts` = 0
- [x] 2.3 批量流程测试（触达 #17 `test/delete-session.test.ts`）：并集去重、软失败预览、整单拒绝、archive 档 `archive-unavailable` 前置、文件失败不中止；验证：`pnpm --filter dsh-plugin-web-ux test -- delete-session` 退出码 0
- [x] 2.4 已迁移域测试（触达 #18 `test/migrated.test.ts`）：两层枚举、`session-` 前缀目录原样、非目录/符号链接跳过、2000 截断、target-exists、EXDEV 回退、恢复后 ports 调用序；验证：`pnpm --filter dsh-plugin-web-ux test -- migrated` 退出码 0
- 执行记录（2026-11-04）：组2 ✅ 全绿 —— 4 任务全勾；干净窗口 `typecheck` EXIT=0、`test` 17 文件/501 用例全过且 SKIPPED 0；grep 断言 2.1=4、2.2=3、2.2 纯度=0（零 node:/@deepseek-ai import 实证）；delete-session.test.ts 61→86（+25）、migrated.test.ts 新建 45 用例；`isSafePathSegment`/`mtimeMs` 宽度子类型零回归；2.2 待决三项按既有设计裁定（工厂形状→2.4 提示、`announceRestored` updatedAt→D6 真实 header 优先归 3.1、空 restored 仍调一次→按蓝图落测）；**裁定**：8.1 按触达 #29 全四文件 include（含 `test/migrated.test.ts`、`test/project-key.test.ts`，防 composite TS6307）。

## 3. 宿主接线

- [x] 3.1 dispatcher 与端口装配（触达 #5 `src/index.ts`）：`parseRequest`+switch 七分支、`HostPorts` 合并两域、端口 +5（含 `announceRestored` 真实 header 优先、`api-session/added` 广播、`nodeFileSystem.lstat` 补 `mtimeMs`）；验证：`grep -n "LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT" plugins/web-ux/src/index.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux build` 退出码 0 且 `grep -c "list-migrated\|restore-migrated\|api-session/added" plugins/web-ux/lib/index.js` ≥ 3
- [x] 3.2 接线集成测试（触达 #19 `test/index.test.ts`）：真实临时 `$DSH_HOME` 上跑列表（含前缀目录/非目录/truncated）、删除、恢复（目标冲突 → `target-exists`、attach 拒绝 → warning 且 `workspaceId:null`、`emitted` 含 `['api-session/added', …]`）；验证：`pnpm --filter dsh-plugin-web-ux test -- index` 退出码 0
- 执行记录（2026-11-04）：组3 ✅ 全绿 —— 3.1/3.2 全勾；干净窗口 `typecheck` EXIT=0、`test` 17 文件/510 用例全过且 SKIPPED 0；grep 断言 3.1 源=4（≥2）、产物=3（≥3）、8.1=true；index.test.ts 16→25（真实临时 `$DSH_HOME`：前缀目录/truncated 2001 目录/target-exists 零写/attach 拒绝降级/`api-session/added` 载荷逐字段）；3.1 附 28 条已构建产物运行时冒烟全过；偏差留档：`attachToWorkspace` 缺失显式抛（按降级列）、`lstat` 显式三元组投影、日志文案泛化 `session-management`。**编排裁定：8.1 提前执行**（3.1 上浮 TS6307 时序问题——4.1/5.1/8.2 验证句均要求 typecheck 退出码 0；触达 #29 四文件此时已全部存在且无在飞任务触碰 tsconfig，主会话按触达 #29 落 include 并复验 `true` + EXIT=0）。

## 4. 客户端 RPC

- [x] 4.1 通道客户端扩容（触达 #7 `src/client/delete-client.ts`）：`callEndpoint` 抽取、`SessionManagerClient` 增 `previewBatch`/`disposeBatch`/`listMigrated`/`deleteMigrated`/`restoreMigrated`（`listMigrated()` 发 `{}`）、各响应过 parser；验证：`grep -n "createSessionManagerClient\|callEndpoint" plugins/web-ux/src/client/delete-client.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [x] 4.2 RPC 测试（触达 #20 `test/delete-client.test.ts`）：每端点 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, body)`、宿主码透传（含新码）、4 种坏形状 → `bad-response`；验证：`pnpm --filter dsh-plugin-web-ux test -- delete-client` 退出码 0
- 执行记录（2026-11-04）：组4 ✅ 全绿 —— 4.1/4.2 全勾（本组经一次会话中断恢复：4.1 首派未落盘，按恢复协议重派一次成功）；干净窗口 `typecheck` EXIT=0、`test` 17 文件/525 用例全过且 SKIPPED 0（510→525）；grep 断言 4.1=9（≥2）；delete-client.ts 112→225 行（`callEndpoint` 模块级私有抽取 + `SessionManagerClient` 五方法 + parser 接线，`errorKeyOf` 未动）；delete-client.test.ts 8→23（7 端点 `toHaveBeenCalledWith` 全覆盖、新码透传 4 例、坏形状 4 例、`unavailable` 1 例）。

## 5. 文案

- [x] 5.1 双语文案（触达 #13 `src/client/locales.ts`）：按 code-design ③.7 清单 + 落档增补（取消归档动作与结果、伪选项 tab 2 空态等，约 58 键）加 `zh` 并补 `en` 同键镜像；验证：`grep -c "^  'manager\." plugins/web-ux/src/client/locales.ts` = 2 × manager 键数 且 `grep -n "'error.not-migrated'\|'error.target-exists'" plugins/web-ux/src/client/locales.ts | wc -l` ≥ 2 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [x] 5.2 文案对齐测试（触达 #25 `test/locale-parity.test.ts`）：required 列表追加 `manager.*` 关键键与两个新错误码；验证：`pnpm --filter dsh-plugin-web-ux test -- locale-parity` 退出码 0
- 执行记录（2026-11-04）：组5 ✅ 全绿 —— 5.1/5.2 全勾；干净窗口 `typecheck` EXIT=0、`test` 17 文件/525 用例全过且 SKIPPED 0；grep 断言 5.1=110（=2×55）、error 新码=4；locales.ts +150 行（58 新键 = 55 manager + 3 error，zh canonical + en `satisfies` 镜像）；locale-parity required 39→77（+38 = 35 manager + 3 error）。**口径知会**：§3.7 表实列 3 个 error 键（第 3 个 `error.workspace/session-active` 为上游码映射键），contract 增量仍为 2 码——5.1/5.2 均按表落盘，两处口径同时满足。

## 6. 入口与模型

- [x] 6.1 打开请求 store（触达 #8 `src/client/session-manager-store.ts`）：照 `delete-store.ts` 的 seq/identity 契约实现 `ManagerRequestStore`；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager` 通过（含 store 用例）
- [x] 6.2 纯派生模型（触达 #9 `src/client/session-manager-model.ts`）：`ManagerTab`/`ManagerAction`/三域行派生（子代理过滤、归档交集、伪选项聚合含 P1 孤儿已归档、500 截断、running 置灰标记）/选择操作/`entryKeyOf`/`unarchiveSelected` 派生；验证：`grep -n "workspaceChoices\|archivedRows\|migratedRows" plugins/web-ux/src/client/session-manager-model.ts | wc -l` ≥ 3
- [x] 6.3 全局入口组件（触达 #10 `src/client/SessionManagerTrigger.tsx`）：`sidebar.footer.action` 宽窄两形态、`aria-label` 恒在、服务未就绪返回 null；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-trigger` 退出码 0
- [x] 6.4 测试替身扩容（触达 #27 `test/stubs/ui-primitives.tsx`）：补 `Checkbox`（label 包 input）/`SegmentedTabs`（role=tablist/tab）/5 个图标；验证：`grep -n "Checkbox\|SegmentedTabs" plugins/web-ux/test/stubs/ui-primitives.tsx | wc -l` ≥ 2
- [x] 6.5 模型测试（触达 #21 `test/session-manager-model.test.ts`）：纯 node 覆盖三域行集、伪选项（含孤儿已归档）、500 截断、running 置灰、选择操作、双动作分派；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-model` 退出码 0
- [x] 6.6 入口测试（触达 #22 `test/session-manager-trigger.test.tsx`）：宽/窄渲染、aria、点击登记请求、服务缺席静默；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-trigger` 退出码 0
- 执行记录（2026-11-05）：组6 ✅ 全绿 —— 6 任务全勾（三波次：6.1+6.2+6.4 → 6.3+6.5 → 6.6）；干净窗口 `typecheck` EXIT=0、`test` 19 文件/563 用例全过且 SKIPPED 0（525→563）；grep 断言 6.2=3、6.4=5、6.3 声明面无输出、7.2=37；store 契约用例在 6.5 落档（兑现 6.1 验证句「含 store 用例」）。**编排裁定×2**：①8.2 提前（6.2 上浮 TS6307——`tsconfig.client.json` 目录级 include 已收 `src/client`，model import `project-key.ts` 触发 6307；按触达 #30 落两行 include，验证句 true + typecheck 0）；②7.2 提前至组6 波 C（6.3 trigger import CSS，6.6 jsdom 真实加载需它先行）。**裁定留档**：`ManagerAction` 取 ③.6 命名（archive/dispose/unarchive/purge/restore，模块头已写映射）；`defaultWorkspaceChoice` 等追加派生保留（「判据全收敛 model」要点）；`entryKeyOf` migrated 键为斜杠形态 `migrated:<projectDir>/<dirName>`（实测钉住）；`PropsRuntime<'sidebar.footer.action'>` 需 8.3 devDeps 先行，暂以 `SidebarFooterActionOwnerProps={wide}` 结构式镜像内联——**8.3 落地后换装跟进**（组件体零改动）。

## 7. 管理浮层与注册

- [x] 7.1 管理浮层组件（触达 #11 `src/client/SessionManagerDialog.tsx`）：五阶段机（select/confirm/running/done/failed）、工作区选择器（`Menu` portal，A13 冲突则退化 `portal:false`）、三 tab（`SegmentedTabs`）、四动作分派（批量删除预览+模式+整单拒绝；归档/取消归档逐项报告；已迁移删除/恢复）、恢复后停原 tab（P3=A）、双动作在途互斥；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-dialog` 退出码 0
- [x] 7.2 浮层样式（触达 #12 `src/client/session-manager.module.css`）：触发按钮/工具栏/列表行/徽标/选择条/结果区，颜色全走 `var(--dsw-alias-*, 兜底)`；验证：`grep -c "dsw-alias" plugins/web-ux/src/client/session-manager.module.css` ≥ 3
- [x] 7.3 客户端注册（触达 #14 `src/client/index.ts`）：`MANAGER_TRIGGER_ORDER=100`/`MANAGER_OVERLAY_ORDER=520` 两 entry、渲染期软读 `connection`/`workspaces`/`sessions`、软注册 try/catch；验证：`grep -n "sidebar.footer.action\|MANAGER_OVERLAY_ID" plugins/web-ux/src/client/index.ts | wc -l` ≥ 2
- [x] 7.4 浮层组件测试（触达 #23 `test/session-manager-dialog.test.tsx`）：阶段机推进、被拒项呈现、模式切换不重发预览、超限截断提示、恢复结果与 warnings、伪选项 tab 2、取消归档逐项结果；验证：`pnpm --filter dsh-plugin-web-ux test -- session-manager-dialog` 退出码 0
- [x] 7.5 注册面测试（触达 #24 `test/client-apply.test.ts`）：两新 entry 的注册与降级（座位缺失静默、服务缺席不渲染）；验证：`pnpm --filter dsh-plugin-web-ux test -- client-apply` 退出码 0
- 执行记录（2026-11-05）：组7 ✅ 全绿 —— 5 任务全勾（波 A 7.1 → 波 B 7.3+7.4 并行 → 波 C 7.5；7.2 已提前至组6）；干净窗口 `typecheck` EXIT=0、`test` 20 文件/585 用例全过且 SKIPPED 0（563→585，client-apply 3 红清零）；grep 断言 7.3=9。7.1 dialog 1294 行（五阶段机/四动作/`WORKSPACE_MENU_PORTAL` A13 单点开关，探针 28+75 全过）；7.4 dialog 测试 19 用例 + stub 追加 `Menu`（授权放宽写范围）；7.5 client-apply 7→10（注册序/id/order/软降级/座位缺失静默）。**裁定留档**：①在途互斥按 ③.6 阶段表形态（running 接管）；②confirm 同文案按 role 查询断言；③`aria-haspopup` 不补（非蓝图断言面）；④`FooterActionSlots` 结构式桥与 trigger props 镜像保留至 8.3，随后统一换装；⑤`dialog.warning.archive` 旧文案「不提供恢复入口」与恢复能力矛盾——随 9.1 放宽范围收口 locales 两行；⑥A13 真机首验留 9.3 冒烟。

## 8. 收口与产物

- [x] 8.1 宿主 tsconfig 增补（触达 #29 `plugins/web-ux/tsconfig.host.json`）：显式加入 `src/migrated.ts`、`src/project-key.ts`；验证：`node -e "const t=require('./plugins/web-ux/tsconfig.host.json');console.log(JSON.stringify(t).includes('migrated')&&JSON.stringify(t).includes('project-key'))"` 输出 true
- [x] 8.2 客户端 tsconfig 增补（触达 #30 `plugins/web-ux/tsconfig.client.json`）：显式加入 5 个新客户端文件；验证：`node -e "const t=require('./plugins/web-ux/tsconfig.client.json').include||require('./plugins/web-ux/tsconfig.client.json');console.log(JSON.stringify(t).includes('session-manager'))"` 输出 true 且 `pnpm --filter dsh-plugin-web-ux typecheck` 退出码 0
- [x] 8.3 包清单与锁file（触达 #28 `plugins/web-ux/package.json` + #34 根 `pnpm-lock.yaml`）：`dsh.client.inject` +3、devDeps +2（`0.2.1-rc.5`）、`description` 改述，根 `pnpm install` 更新 lockfile；验证（R4 勘误：inject 为 `@deepseek-ai/` 全限定包名，原句无前缀精确匹配在正确实现下恒 false）：`node -e "const p=require('./plugins/web-ux/package.json');console.log(p.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar')&&p.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'))"` 输出 true 且 `pnpm install --frozen-lockfile` 退出码 0
- [x] 8.4 bundle 断言与产物重建（触达 #26 `test/bundle.test.ts` + #33 `lib/`）：CSS 注入器断言 3→4、双产物标记（footer slot/端点名/`api-session/added`）、`pnpm --filter dsh-plugin-web-ux build` 重建；验证：`grep -n "toHaveLength(4)" plugins/web-ux/test/bundle.test.ts` 命中且 `pnpm --filter dsh-plugin-web-ux verify:all` 退出码 0
- [x] 8.5 全仓回归（触达 #33/#34 波及面）：`pnpm dsh:check`（基线/pin/allowlist）+ `pnpm -r test` + `pnpm -r typecheck`；验证：三条命令依次退出码 0
- 执行记录（2026-11-05）：组8 ✅ 全绿 —— 8.3/8.4/8.5 全勾（8.1/8.2 已提前；**换装微任务**：trigger 内联镜像与 `FooterActionSlots` 桥已删、改声明包直写 `SidebarFooterActionOwnerProps`（`@deepseek-ai/dsh-client-ui-sidebar/client`）与 `ctx.slots.inject` 直写，20 文件/585 用例全绿）。干净窗口：8.3 验证句（R4 勘误后）true + `--frozen-lockfile` 0 + `dsh:check` 0；8.4 `toHaveLength(4)` 命中 + `verify:all` 0（lint+typecheck+build+test，无 smoke 步）+ 产物标记 host=3/client=5；8.5 三命令依次 0（`dsh:check` 51 包全 rc.5；`-r test` 6 插件 103 文件/2182 passed/5 平台 skip；`-r typecheck` 全 Done），零文件改动。**记法口径留档**：蓝图 `PropsRuntime<'sidebar.footer.action'>` 实为 `@deepseek-ai/dsh-client-ui-slots` 导出且组合 8 个必需 `GlobalStandardProps` 钩子——占用方 props 终态用座位声明方直出的 owner 份额类型（`SidebarFooterActionOwnerProps`），不强用 `PropsRuntime` 记法（避免逼测试 cast）；上游类型面漂移时以声明包为准。

## 9. 文档与冒烟

- [x] 9.1 README 会话管理章节（触达 #31 `plugins/web-ux/README.md`）：新增 `## 会话管理`（入口与降级、三 tab、伪选项、批量语义、500 上限与分批序列、恢复语义、失败码表 +2）；改写三处旧论断（`:45` 警示表补恢复说明、`:115`/`:128` 恢复入口表述、`:194-199` 非目标删「批量处置」「不做恢复 GUI」）；双端结构树/tsconfig 清单/版本迁移段同步；验证：`grep -n "^## 会话管理" plugins/web-ux/README.md` 命中且 `grep -n "不提供恢复入口\|不做恢复 GUI" plugins/web-ux/README.md` 无输出且 `grep -n "restore-migrated" plugins/web-ux/README.md` 命中
- [x] 9.2 注册清单注释同步（触达 #32 `plugins/web-ux/cordis.patch.yml`）：端点清单注释 2→7，注册行不变；验证：`grep -n "restore-migrated\|list-migrated" plugins/web-ux/cordis.patch.yml` 命中且 `git diff --stat plugins/web-ux/cordis.patch.yml` 显示无注册行变更（仅注释）
- 执行记录（2026-11-05）：组9 波 A ✅ —— 9.1/9.2 全勾；9.1 验证句三条全过 + 放宽项 locales `dialog.warning.archive` zh/en 收口（「不提供恢复入口」双清）；README 311→436 行（会话管理章节/旧论断改写/结构树/版本迁移）；9.2 端点注释 2→7、非注释行与 HEAD 逐字节一致、`dsh:check` 0。**主会话收口**：`lib/client.js` 重建（旧警示文案计数 0、bundle test EXIT=0）。9.3 冒烟方式已由用户裁定为**完整真机冒烟**（link: 安装 + 用户浏览器走查 + 主会话记录）。
- [x] 9.3 手工冒烟与记录（新建 `plugins/web-ux/artifacts/session-manager-smoke.md`）：按 code-design ⑤ 手工冒烟 5 步执行（link: 安装、三 tab 与伪选项、跨窗口状态漂移整单拒绝、恢复即时可见性验证 `api-session/added`、无主恢复落未分组）并逐项记录结果；验证：`test -f plugins/web-ux/artifacts/session-manager-smoke.md` 且文件含 5 步各自结论行
- 执行记录（2026-11-05 终局）：9.3 ✅（范围按用户裁决收窄）—— 冒烟文件终稿含 5 步各自结论行：步骤1 PASS（link: 安装 + 用户已重启，容器 Up 3min、`dsh --version`=0.2.1-rc.5 实证）；步骤2 功能面 PASS（主代理经浏览器自动化在真机走查：浮层打开/三 tab 真实数据/D15 运行中置灰不可选/A13 工作区 Menu 在 Modal 门户正常含 12 工作区与「未匹配工作区」伪选项/处置模式单选默认值/零选禁用/默认工作区=最近使用派生正确），**视觉入口 FAIL 已知接受**：footer 行被 multi-root 的 Folders 行（`width:calc(100%+4px)`+`flex:none`）整行独占，本插件入口（order 100 行尾 148px）被侧栏 `overflow:hidden` 裁掉，stt 入口亦已成 ~12px 残条（既有问题）——三插件各自实现均正确，冲突为组合级；**用户裁决：不改，接受现状，未来统一「工作区配置」入口一并解决（仅备忘不启动）**；步骤3–5 未执行（豁免：双窗口/真实数据变更类操作 + 真机无已迁移素材，单测覆盖面已留档于冒烟文件）。33/33 任务完成，变更按现状验收通过（用户裁决 2026-11-05）。

## 附录：执行期留痕

- 执行侧（spec-apply）在每组完成时于本文件对应组下方追加一行执行记录（组号、结论、关键证据）；R<n> 留痕格式沿用仓内既有变更惯例。
- 接续恢复时以本目录 `code-design.md` / `decisions.md` 落档副本为权威输入。

### 执行期运行规则留痕

- **R1（金表勘误｜2026-11-04，用户裁定）**：上游 `projectKey` 只去**前导** `-`（rc.5 实测 `@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js:880`，`/a/b/` → `--a-b---`）；规划期金表第 7 行 `--a-b--` 系预测错误。裁定：严格逐字镜像上游（否决尾分隔符特判——稀释 D5 镜像语义；尾斜杠工作区路径按「未匹配工作区」伪选项出口，符合 D4 安全边界）。连锁面：code-design ⑤G1 金表（已改）｜`src/project-key.ts`（严格镜像定稿，82 输入差分 0 不一致）｜`test/project-key.test.ts`（勘误语义落档：尾斜杠注册路径 → `null`）｜组9 README 匹配语义表述。
- **R2（vitest 过滤口径）**：`pnpm --filter dsh-plugin-web-ux test -- <词>` 的位置过滤不生效（实际全量跑 16 个测试文件）；验证句一律按「退出码 0 + grep 断言」口径读，文件级精确定位用 `pnpm --filter dsh-plugin-web-ux exec vitest run <path>`。连锁面：后续各组 test 验证句阅读口径；组8 `verify:all` 不受影响。
- **R3（engines WARN 良性）**：本容器 node v22.18.0 低于部分包 engines（wanted `^22.19.0 || >=24`）→ pnpm 输出 `[WARN] Unsupported engine`，不失败；验证以退出码为准。连锁面：全部组验证句阅读口径。
- **R4（验收句勘误｜2026-11-05，8.3 上浮）**：`dsh.client.inject` 的注入项是 `@deepseek-ai/` 全限定包名（§3.8 明示；multi-root 先例与上游 51 插件包实测一致），原 8.3 验证句用无前缀名做 `Array.includes` 精确匹配，在正确实现下恒 false——属落档验收句缺陷，非实现缺陷。已更正 tasks.md 8.3 行为全限定名精确匹配（意图不变），复跑输出 true。连锁面：tasks.md 8.3 验证句（已改）；后续任何断言 inject 名单的验证句一律用全限定名。
- **R5（footer 座位饱和｜2026-11-05，9.3 真机冒烟上浮，用户裁定）**：`sidebar.footer.action` 是 shell 拥有的单行 nowrap flex（宽栏 256px），multi-root-workspace 的 Folders 行按设计整行独占（`width:calc(100% + 4px)` + `flex:none`，镜像宿主 settings 触发行），后序注册者必然溢出被侧栏 `overflow:hidden` 裁掉——session-tool-toggle 入口（order 60）先已裁成 ~12px 残条（既有问题，早于本变更），本插件入口（order 100，宽栏 148px 图标+文案）整颗不可见；折叠 56px 轨道同样容纳不下三动作横排。三插件各自实现均符合各自设计，冲突是组合级的。备选方案（换行兼容规则/自缩纯图标/修 mrfw）均已呈报，用户裁定：**按现状接受，不做修改**，待未来统一「工作区配置」入口（合并 Folders / 工作区默认档 / 会话管理，弹窗内分节导航，后续可纳工具管理）时一并解决——该方向**仅留备忘，不启动规划**（用户裁决 2026-11-05）。连锁面：`plugins/web-ux/artifacts/session-manager-smoke.md` 步骤 2 与收尾备忘（已落档）；会话管理浮层的实际打开路径在入口可见性解决前依赖 a11y 树内点击。
