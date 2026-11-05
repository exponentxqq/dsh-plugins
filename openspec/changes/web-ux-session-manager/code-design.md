# code-design.md — web-ux「会话管理」（批量处置 + 归档目录管理）代码级蓝图

> 阶段 1.7 产物。`decisions.md` 的 Q1–Q4 / R1–R4 / T1–T2 是硬约束，本文**不复述其论证**，只回答
> 「改哪些文件、怎么改、接口与数据长什么样、为什么这么定」。
>
> 路径约定：`plugins/web-ux/...` 相对根仓 `/home/xuqinqin/develop/person/dsh-plugins`；上游路径一律以
> `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<pkg>/...` 起头并标注**只读依赖**。
>
> 事实基线：上游 `0.2.1-rc.5`（`scripts/dsh-baseline.mjs` 的 `DSH_BASELINE`，实测 `pnpm dsh:check` 全绿）；
> 插件版本 1.5.0。本文所有 `file:line` 均为**当前工作区实测行号**，实施时若上游文件行号漂移，以符号名为准。

---

## ① 触达面清单

### 1.1 共享/宿主生产代码（仓根 `dsh-plugins`，子包 `plugins/web-ux`）

| # | 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|---|
| 1 | `plugins/web-ux/src/contract.ts` | 改 | 线上契约扩容：端点 2→7，请求/响应形状按域拆分，边界校验补齐 | `ENDPOINTS` 7 项；新增 `PREVIEW_BATCH_ENDPOINT` / `DELETE_BATCH_ENDPOINT` / `LIST_MIGRATED_ENDPOINT` / `DELETE_MIGRATED_ENDPOINT` / `RESTORE_MIGRATED_ENDPOINT`；`FAILURE_CODES` 追加 `not-migrated` / `target-exists`；新增 `MAX_BATCH_TARGETS` / `MAX_LISTED_MIGRATED` / `MAX_PATH_SEGMENT`；新增类型 `DeleteBatchRequest` / `RejectedTarget` / `DeleteBatchPreview` / `MigratedTarget` / `MigratedRequest` / `MigratedEntry` / `MigratedListing` / `RestoredEntry` / `RestoreOutcome` / `WebUxRequest`；新增 `parseRequest` / `parseBatchPreview` / `parseMigratedListing` / `parseRestoreOutcome`；`readRequest` 改名 `readDeleteRequest` 并把「路径片段合法性」抽成 `readPathSegment`（供 batch 与 migrated 复用）；`parseDeleteRequest` 语义与签名**保持不变** |
| 2 | `plugins/web-ux/src/project-key.ts` | **新建** | 双端共享的纯函数：`projectKey(cwd)` 的本地镜像（上游同规则） | `export function projectKey(cwd: string): string`；`export interface ProjectWorkspace { workspaceId: string; path: string }`；`export function workspaceForProjectDir(projectDir: string, workspaces: readonly ProjectWorkspace[]): string \| null`。**零 import**（不 import `node:*`，不 import `@deepseek-ai/*`），因此可被浏览器 bundle 内联 |
| 3 | `plugins/web-ux/src/delete-session.ts` | 改 | 宿主纯流程新增批量分支（沿用同一套级联/校验/执行循环） | `collectDeleteSetMany()`；`planDeleteBatch()`（逐目标校验 → accepted / union / rejected）；`previewDeleteBatch()`；`deleteSessionBatch()` / `archiveSessionBatch()`（两者共用私有 `disposeBatch`，后者先 `prepareArchive`）；`DeleteBatchPlan` 类型；`FileSystemOps.lstat` 返回类型**增可选 `mtimeMs`**（宽度子类型，现有 fake 与调用点零改动）；`isSafeSessionId` 导出为 `isSafePathSegment` 供 `migrated.ts` 复用（保留内部旧名别名，避免改 922 行既有测试） |
| 4 | `plugins/web-ux/src/migrated.ts` | **新建** | 「已迁移」域的宿主纯流程与文件工厂：枚举归档根、物理删除条目、恢复条目 | `MigratedWorkspace` / `MigratedPorts` / `MigratedFileOps`（=`Pick<FileSystemOps,'readdir'\|'lstat'\|'rm'\|'mkdir'\|'rename'\|'copyFile'>`）；`createArchiveFiles(layout)` → `{ list, remove, restore }`；`listMigrated()` / `deleteMigrated()` / `restoreMigrated()`；`ownerOfProjectDir()` 委托 `project-key.ts`；`sessionIdOfEntry()`（**目录名即 id，不做前缀归一**，理由见 ④ D12） |
| 5 | `plugins/web-ux/src/index.ts` | 改 | 宿主实载体接线：7 端点分派 + 迁移域端口装配 + `api-session/added` 广播 | `createDispatcher` 改为 `parseRequest` + `switch`；`HostPorts extends DeletePorts, MigratedPorts`；`createPorts` 增 `listWorkspaces` / `attachToWorkspace` / `readdToArchiveSet` / `announceRestored` / `fs` / `homePath`；复用既有 `emitter`（`:211`）广播 `api-session/added`；`nodeFileSystem.lstat` 增 `mtimeMs`；`inject` 常量不变（`workspaceRegistry`/`sessionPersistence`/`dshHomePath` 已足够） |
| 6 | `plugins/web-ux/src/config.ts` | **不改** | 无新增配置键：归档根已由 `archiveRoot` 承载 | —（列在此处仅为声明「配置面零增量」，防实施期被要求加 `sessionManager` 开关） |

### 1.2 浏览器生产代码（同子包 `plugins/web-ux/src/client/`）

| # | 文件 | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|---|
| 7 | `plugins/web-ux/src/client/delete-client.ts` | 改 | 通道客户端扩容 5 个端点；抽出可复用的 `callEndpoint` | `callEndpoint(connection, endpoint, body)`（模块级，取代闭包内 `call`）；`SessionManagerClient extends DeleteClient` 增 `previewBatch` / `disposeBatch` / `listMigrated` / `deleteMigrated` / `restoreMigrated`；`createSessionManagerClient(connection)`；`errorKeyOf` 不变（新码自动走 `error.<code>` 查表） |
| 8 | `plugins/web-ux/src/client/session-manager-store.ts` | **新建** | 跨 entry 的「打开管理浮层」请求 store（同 `delete-store.ts` 模式） | `ManagerRequest { seq: number }`、`ManagerRequestStore { source, request(), settle() }`、`createManagerRequestStore()` |
| 9 | `plugins/web-ux/src/client/session-manager-model.ts` | **新建** | 纯派生逻辑（无 React、无 cordis），让选择/分组/上限可在纯 node 下单测 | `ManagerTab` / `ManagerAction` / `SessionRowView` / `MigratedRowView`；`workspaceChoices()`（含 `'unassigned'` 伪选项）；`activeRows()` / `archivedRows()` / `migratedRows()`；`toggleSelection()` / `selectAllSelection()` / `selectionLimitReached()`；`entryKeyOf()` |
| 10 | `plugins/web-ux/src/client/SessionManagerTrigger.tsx` | **新建** | 全局入口：`sidebar.footer.action`（Q1 唯一入口） | `SessionManagerTriggerInjected`；`SessionManagerTriggerProps`；宽栏整行按钮（图标 + 文案）/ 窄栏 28px 图标按钮；`aria-label` 恒为 `t('manager.action')` |
| 11 | `plugins/web-ux/src/client/SessionManagerDialog.tsx` | **新建** | 管理浮层：工作区选择 + 三 tab + 选择/确认/执行/结果四阶段 | `ManagerPhase`（`select｜confirm｜running｜done｜failed`）；`SessionManagerDialogInjected` / `SessionManagerDialogProps`；`SessionManagerBody`；工作区选择用 `Menu`（portal）+ 触发按钮；tab 用 `SegmentedTabs`；行用 `Checkbox`（标题即 label）；tab 2 复用 `dialog.mode.*` 单选；执行分支见 ③.6 |
| 12 | `plugins/web-ux/src/client/session-manager.module.css` | **新建** | 浮层样式（复用 `--dsw-alias-*` 令牌 + 静态兜底） | `.trigger` / `.triggerLabel` / `.toolbar` / `.workspaceButton` / `.modeRow` / `.list` / `.row` / `.rowMeta` / `.badge` / `.selectionBar` / `.rejected` / `.result` / `.warnings` 等；**不复用** `delete.module.css`（两处视觉语义不同，且 bundle 的 CSS 注入器计数要跟着改） |
| 13 | `plugins/web-ux/src/client/locales.ts` | 改 | 双语文案：新增 52 个键（49 个 `manager.*` + 3 个错误码文案，清单见 ③.7） | `zh` 追加键、`en` 同键镜像（`satisfies Record<Key, string>` 编译期钉死）；`NS` 与模块增强保持不变 |
| 14 | `plugins/web-ux/src/client/index.ts` | 改 | 注册两个新 entry + 常量 + 渲染期软读注入面 | `MANAGER_TRIGGER_ID` / `MANAGER_TRIGGER_ORDER` / `MANAGER_OVERLAY_ID` / `MANAGER_OVERLAY_ORDER`；`ctx.slots.inject('sidebar.footer.action', …)` 与 `ctx.slots.register({ name:'shell.overlay', id: MANAGER_OVERLAY_ID, … })`；注入面在渲染期 `ctx.get('connection')` / `ctx.get('workspaces')` / `ctx.get('sessions')`（沿用 `:176-225` 的既有理由） |

### 1.3 测试代码

| # | 文件 | 动作 | 改动意图 |
|---|---|---|---|
| 15 | `plugins/web-ux/test/contract.test.ts` | 改 | 7 端点集合、`FAILURE_CODES` 新集合、`parseRequest` 分派、batch/migrated/restore 四个 parser 的合法与非法矩阵、上限边界（500/501） |
| 16 | `plugins/web-ux/test/project-key.test.ts` | **新建** | 金表（5 条实测真实路径 + 7 条有损/边界用例，见 ⑤ G1）+ 有损用例（`//`、`:`、`~`、`\`、`/`、251 截断、超长）+ 全字符类属性断言 |
| 17 | `plugins/web-ux/test/delete-session.test.ts` | 改 | 批量：并集去重、逐目标软失败、整单拒绝、执行顺序与 warnings、archive 批量的 `prepareArchive` 前置 |
| 18 | `plugins/web-ux/test/migrated.test.ts` | **新建** | 归档根枚举（两层、符号链接、非目录、`_no-cwd`、截断）、物理删除、恢复（目标位冲突、EXDEV、attach 失败降级、readd 失败降级、`announceRestored` 一次性调用） |
| 19 | `plugins/web-ux/test/index.test.ts` | 改 | 7 端点分派、真实临时目录上的 list/delete/restore、`api-session/added` 广播载荷、`internal`（缺 `dshHomePath`）覆盖 |
| 20 | `plugins/web-ux/test/delete-client.test.ts` | 改 | 5 个新端点的请求体、响应校验失败归一为 `bad-response`、新失败码透传 |
| 21 | `plugins/web-ux/test/session-manager-model.test.ts` | **新建** | 三 tab 行派生、伪选项聚合、全选上限截断、选择增删、子代理/运行中过滤 |
| 22 | `plugins/web-ux/test/session-manager-trigger.test.tsx` | **新建** | `wide` 两态渲染、`aria-label`、点击写入 store、`ready=false` 时不渲染 |
| 23 | `plugins/web-ux/test/session-manager-dialog.test.tsx` | **新建** | 工作区选择、tab 切换、复选/全选、预览→确认→执行→结果、整单拒绝呈现、软失败剔除、tab 1 逐项报告、tab 3 双动作 |
| 24 | `plugins/web-ux/test/client-apply.test.ts` | 改 | `DECLARED_SLOTS` 加 `sidebar.footer.action`；注册顺序与 id/order/locale 断言；注入面软降级断言 |
| 25 | `plugins/web-ux/test/locale-parity.test.ts` | 改 | `required` 列表补新键；zh/en 键集一致性自动覆盖其余 |
| 26 | `plugins/web-ux/test/bundle.test.ts` | 改 | CSS 注入器 3→4；浏览器产物新增 `sidebar.footer.action` / `web-ux-session-manager` 标记；宿主产物新增 5 个端点名 + `api-session/added` |
| 27 | `plugins/web-ux/test/stubs/ui-primitives.tsx` | 改 | 新增 `Checkbox`、`SegmentedTabs`、`IconChecklistOutlineRegular`、`IconChevronDownOutlineRegular`、`IconArchiveOutlineRegular`、`IconRefreshOutlineRegular`、`IconClockOutlineRegular`（**缺一个即运行时 `undefined` 渲染崩溃**） |

### 1.4 元数据 / 文档 / 产物

| # | 文件 | 动作 | 改动意图 |
|---|---|---|---|
| 28 | `plugins/web-ux/package.json` | 改 | `dsh.client.inject` +3（见 ③.8）；devDependencies +2（`@deepseek-ai/dsh-client-ui-sidebar`、`@deepseek-ai/dsh-api-session-controller`，均 `0.2.1-rc.5`）；`description` 改述为「批量会话管理 + 归档目录管理」 |
| 29 | `plugins/web-ux/tsconfig.host.json` | 改 | include 增 `src/migrated.ts`、`src/project-key.ts`、`test/migrated.test.ts`、`test/project-key.test.ts`（composite 工程必须逐条列名，否则 TS6307） |
| 30 | `plugins/web-ux/tsconfig.client.json` | 改 | include 增 `src/project-key.ts`、`test/session-manager-model.test.ts`（`.tsx` 由既有 `test/**/*.test.tsx` glob 覆盖） |
| 31 | `plugins/web-ux/README.md` | 改 | 新增「会话管理」章节（入口、三 tab、批量语义、整单拒绝 vs 逐项报告、上限、恢复语义与降级）；**重写**既有「非目标」中的「批量处置」「不做恢复 GUI」两条（`:194-199`）；更新「双端结构」「构建」「版本迁移」 |
| 32 | `plugins/web-ux/cordis.patch.yml` | 改（仅注释） | 能力描述与端点名清单同步；注册行形态不变 |
| 33 | `plugins/web-ux/lib/index.js`、`lib/client.js` | 改（产物） | `pnpm --filter dsh-plugin-web-ux build` 重新生成并入库（`files` 含 `lib/**/*.js`，产物随仓库提交） |
| 34 | `pnpm-lock.yaml`（根仓） | 改（自动） | 两个新 devDeps 落锁；两者已在 `minimumReleaseAgeExclude`（`pnpm-workspace.yaml:37`、`:89`）与既有 lockfile 中（multi-root 已装 ui-sidebar），`dsh:check` 的 pin 断言仍指向 `0.2.1-rc.5` |

### 1.5 上游只读依赖（**只读不改**，设计依赖其事实）

| 上游接触点 | 用途 | 只读证据 |
|---|---|---|
| `dsh-client-ui-sidebar` `sidebar.footer.action` | 唯一全局入口的座位（`kind:'list'`, `scope:'root'`, owner `{ wide: boolean }`） | 见 ② 对应行；声明方包 `package.json` 的 `dsh.client.inject` 已含 `@deepseek-ai/dsh-api-workspace-controller` |
| `dsh-client-ui-workspace` | 只读确认「视图选项 / 工作区 ⋯ 菜单无注入口」（Q1 换道依据），本次**不注册任何** ui-workspace 座位 | ② 中 :2878 / :3898 / :1956 / :2002 |
| `dsh-api-workspace-controller/client` | `ctx.workspaces.list`（`items[].path/sessionIds`、`archivedSessionIds`）、`archiveSession(id)`（T1 客户端循环） | ② |
| `dsh-api-session-controller/client` | `ctx.sessions.list`（`ids`/`byId` 的 `displayTitle`/`running`/`updatedAt`/`blank`/`origin`）；恢复后广播 `api-session/added` | ② |
| `dsh-api-session-controller`（宿主） | `ctx.sessionPersistence.list()` 取恢复后真实 header（供 `added` 摘要的 `cwd`/`id`） | ② |
| `dsh-client-ui-primitives` | `Modal` / `Button` / `Checkbox` / `SegmentedTabs` / `Menu` / 图标 | ② |
| `dsh-session-persistence-jsonl` | `projectKey` 规则（镜像来源）、`encodeSegment` 恒等性（目录名 = id 的依据） | ② |
| `dsh-workspace`（宿主） | `list()` / `Workspace.path` / `attachSession` / `archiveSession` / `archivedSessionIds` | ② |
| `dsh-session` | `SessionHeader.cwd`（`added` 摘要字段来源） | ② |

### 1.6 有意不触达（附理由，防过度设计）

| 文件/面 | 不改的理由 |
|---|---|
| `src/client/DeleteSessionMenuItem.tsx`、`DeleteSessionDialog.tsx`、`delete-store.ts` | 单会话入口与批量是叠加关系（explore 非目标明示）；两者不共享状态，强行合并会让「一次一个」的确认语义被批量状态污染 |
| `src/config.ts`、`cordis.patch.yml` 的 `config:` 段 | 无新增配置键；归档根已由 `archiveRoot` 承载 |
| `src/client/CommandNoticeCard.tsx` / `notice-*` | 与本变更正交 |
| 上游任何包 | 本仓是插件仓；两条需求指定入口（视图选项 / 工作区 ⋯ 菜单）无注入口，Q1 已改道，不在上游打补丁 |
| `openspec/**` | 属 spec 流程产物（proposal/spec/design/tasks），由落档步骤生成；本能力的 spec 增量为 `dsh-web-ux-session-delete` 的新 Requirement（batch / restore），见 ⑤ G8 第 1、3 条 |
| `pnpm-workspace.yaml` | 两个新 devDeps 的版本豁免已存在，无需改 |

---

## ② 证据锚

> 每条为 `file:line` + 符号名。**新建** 文件无现状行号，给出「范式证据」（仓内同类写法）。

### 2.1 插件现状（本仓，实测行号）

| 模块 | 现状证据（file:line + 符号） | 对设计的约束 |
|---|---|---|
| `src/contract.ts` | `:24 CHANNEL`；`:27 PREVIEW_ENDPOINT`；`:30 DELETE_ENDPOINT`；`:33 ENDPOINTS`；`:43 FAILURE_CODES`；`:61 DISPOSAL_MODES`；`:77 DeleteRequest`；`:85 DeletePreview`；`:97 DeleteOutcome`；`:113 Parsed<T>`；`:119 SESSION_ID_MAX`；`:122 readRequest`（`:127` 未知字段白名单）；`:146 parseDeleteRequest`；`:167 parsePreview`；`:196 readStringList`；`:212 parseOutcome`（`:219` 拒绝空 `removed`）；`:230 parseFailure` | 端点集合是**穷举常量**（`:33`），加端点必须同步改它 + 测试的 `toEqual`（`test/contract.test.ts:32`）；请求校验是白名单（`:127`），新形状必须新增 `read*` 而不是放宽既有白名单；`FAILURE_CODES` 被 `test/contract.test.ts:45` 逐项断言 |
| `src/delete-session.ts` | `:24 import { basename, dirname, isAbsolute, join } from 'node:path'`；`:28 SESSION_REMOVED_EVENT`；`:31 StoredSessionHeader`；`:43 DeletePorts`；`:67 DeletePlan`；`:87 collectDeleteSet`；`:112 planDelete`；`:144 previewDelete`；`:172 deleteSession`；`:192 archiveSession`；`:221 disposeAll`（私有）；`:250 DirectoryEntry`；`:263 FileSystemOps`；`:267 lstat` 返回 `{size; isDirectory()}`；`:301 isSafeSessionId`；`:351 createSessionFiles`；`:368 locate`；`:498 archive`；`:553 measure` | 纯流程可用 `node:path`（`:24` 先例），但**不得** import `@deepseek-ai/*`（层契约）；批量必须复用 `collectDeleteSet`（`:87`）与 `disposeAll`（`:221`）以保证「删除/迁移逐字同构」；`isSafeSessionId`（`:301`）是路径逃逸的唯一防线，迁移域必须复用同一套判定 |
| `src/index.ts` | `:30 node:fs/promises` 导入清单；`:39 Config`；`:63 export { Config }`；`:80 inject`；`:99 apply`；`:100 ctx.inject(['connection','webServer'])`；`:126 createDispatcher`；`:131 parseDeleteRequest`；`:136 if (endpoint === PREVIEW_ENDPOINT)`；`:141 if (endpoint === DELETE_ENDPOINT)`；`:160 nodeFileSystem`；`:176 HostPorts`；`:197 createPorts`；`:203 resolveArchiveRoot`；`:211 emitter`；`:214 listStoredHeaders`；`:216 isArchived`；`:217 cleanupRegistry`；`:233 emitRemoved`；`:245 failure` | 分派点是两个 `if`（`:136`/`:141`）→ 扩为 `switch`；`createPorts` 每次请求重建（`:134`），新增端口只能加在这里；`emitter`（`:211`）是「广播上游事件」的既有软通道，`api-session/added` 复用同一处；`failure()` 保留稳定码，不得在接线层改码 |
| `src/client/index.ts` | `:63 inject`；`:72-77` 三个 id/order 常量；`:87 readService`；`:102 apply`；`:105 locale.register`；`:185 sidebar.workspaces.session.menu.item`；`:206 shell.overlay`；`:193/:214` 注入面渲染期 `ctx.get` | 所有 entry 走 `ctx.slots.inject` + `try/catch` 软注册；服务在**渲染期**解析（`:176-182` 的注释即理由），新 entry 必须同款 |
| `src/client/delete-client.ts` | `:31 DeleteError`；`:43 DeleteClient`；`:67 errorKeyOf`；`:77 createDeleteClient`；`:85 const call`；`:92 if (!result.ok)` | `call` 是唯一构造请求体与拆信封的地方（`:85`），扩容必须把 `call` 提到模块级复用，否则 5 个端点各写一份 |
| `src/client/delete-store.ts` | `:61 createDeleteRequestStore`；`:83 request()` 换新对象 + 自增 `seq` | 管理浮层的 store 照抄这个「identity 稳定 + seq 换新」契约（`useSyncExternalStore` 要求） |
| `src/client/DeleteSessionMenuItem.tsx` | `:36 ArchivedSessionsSource`（结构式声明，不 import 上游服务类型）；`:54 injected`；`:106 if (!archivedSessionIds.includes(sessionId)) return null` | 新组件同样用**结构式**接口描述上游服务切片，避免把 `@deepseek-ai/*` 的完整类型带进组件 props |
| `src/client/DeleteSessionDialog.tsx` | `:35 DeletePhase`；`:44 DEFAULT_DISPOSAL_MODE = 'archive'`；`:58 PropsRuntime<...> & PropsLocale<...> & Injected` 三段式 props；`:68 formatSize`；`:121 DeleteSessionBody`；`:131-148` 挂载即预览（effect 依赖刻意不含 mode） | 阶段机与三段式 props 组合方式沿用；`formatSize` 直接复用（不复制字节格式化逻辑） |
| `src/client/locales.ts` | `:14 NS = 'webUx'`；`:17 zh`；`:79 Key`；`:83 en satisfies Record<Key,string>`；`:139 declare module LocaleNamespaceMap` | 新键必须 zh 先加、en 同键镜像，否则编译失败；`Key` 自动扩张 |
| `test/contract.test.ts` | `:32 expect(ENDPOINTS).toEqual([...])`；`:45 expect(FAILURE_CODES).toEqual([...])`；`:59 describe('parseDeleteRequest')` | 端点/失败码集合断言必须同步更新（否则新契约无测试守卫） |
| `test/delete-session.test.ts` | `:117/:141/:184/:230/:326/:641/:751` 七个 describe；`:492 const ops: FileSystemOps`（内存 fs，`lstat` 返回 `{size, isDirectory}`）；`:734` 符号链接专用 fake | `lstat` 增可选 `mtimeMs` 后 fake 仍编译（宽化返回类型）；批量用例并入现有 describe 风格 |
| `test/index.test.ts` | `:182/:194/:238` 三个 describe；`:238 createDispatcher` 起的用例全部在真实临时目录上驱动（`createHome(TARGET)`） | 迁移域用例同样跑真实目录（可覆盖 `node:fs` 适配层的 `mtimeMs`） |
| `test/client-apply.test.ts` | `:44 DECLARED_SLOTS`；`:157/:221 注册顺序 toEqual`；`:133 READY_SERVICES` | 新 entry 必须更新这两处顺序断言与 slots 清单 |
| `test/bundle.test.ts` | `:27 CLIENT_EXTERNALS`；`:87 expect(injectors).toHaveLength(3)`；`:102` 宿主标记清单 | 新增 css 模块 → 4；浏览器/宿主产物标记清单要补新端点名与座位名 |
| `test/stubs/ui-primitives.tsx` | `:26 IconTrashOutlineRegular`；`:41 MenuItemButton`；`:76 Button`；`:113 Modal` | 替身是**白名单**：新组件用到的每个 primitives 导出都必须在此出现，否则 jsdom 下 `undefined is not a component` |
| `package.json` | `:29 dsh.client.inject`（9 项，`:33` 含 ui-workspace）；`:66 @deepseek-ai/dsh-api-workspace-controller` devDep | `@deepseek-ai/dsh-client-ui-sidebar` 与 `@deepseek-ai/dsh-api-session-controller` **均未声明**（前者仅在 multi-root 有）→ 必须补，否则 `sidebar.footer.action` 的 SlotMap 合并与 `ctx.sessions` 类型都解析不到 |
| `tsconfig.host.json` | `:4-13 include`（逐条列名） | 新宿主源文件/测试必须显式加入，否则 composite 报 TS6307 |
| `tsconfig.client.json` | `:4-16 include`（`src/client` 目录通配 + 逐条 `.ts` 测试） | `src/project-key.ts` 不在 `src/client` 下，必须单列；`.tsx` 新测试由 `test/**/*.test.tsx` 自动覆盖 |
| `build.mjs` | `:107 buildHostCarrier`；`:116 external: ['node:*']`；`:122 buildClient` | 宿主产物 external 只有 `node:*` → 迁移域的 zlib/zstd **不许**进纯流程，纯流程只经 `FileSystemOps` 端口 |
| `README.md` | `:45`（警示表「插件不提供恢复入口」）；`:115`（手工找回）；`:128`（搬回 ≠ 恢复原样）；`:194-199`（非目标：批量处置 / 不做恢复 GUI）；`:227` 双端结构树；`:288-303` 版本迁移与非目标 | 四处**与新能力直接冲突**，必须改写而不是追加 |

### 2.2 上游现状（**只读依赖**，本设计依赖的事实）

| 上游事实 | 证据（绝对路径下的 file:line + 符号） | 对设计的约束 |
|---|---|---|
| `sidebar.footer.action` 是 list/root 座位，owner props 只有 `{ wide }` | `…/dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:83`（`'sidebar.footer.action': { kind:'list'; scope:'root'; owner: SidebarFooterActionOwnerProps }`）；`:164 export interface SidebarFooterActionOwnerProps { wide: boolean }` | 组件必须自己画按钮；`wide=false`（56px rail）必须给图标形态 |
| 该座位渲染在 `footArea > footerActions`（flex 行、宽 100%，折叠态居中） | `…/dsh-client-ui-sidebar/lib/client.js:515 renderSlot("sidebar.footer.action", { wide })`；样式在同文件 `:115` 的单行 CSS 字符串里：`.hHd-Xa_footerActions{flex:none;width:100%;min-width:0}`、`.hHd-Xa_collapsed .hHd-Xa_footerActions{justify-content:center;width:auto}` | 宽栏按钮应 `width:100%`，窄栏只放图标；不得假设自己在 Settings **左侧还是右侧**（DOM 顺序为 footerActions → settingsArea，视觉顺序由 CSS 决定，Q1 只说「底部动作区」） |
| 视图选项菜单不可注入、且仅宽侧栏渲染 | `…/dsh-client-ui-workspace/lib/client.js:2878 function ViewOptionsMenu({...硬编码 props})`；`:3898 children:[wide && jsx(ViewOptionsMenu, …)]` | 需求 2 的指定位置不可达（Q1 换道依据） |
| 工作区「⋯」菜单项硬编码两项 | `…/dsh-client-ui-workspace/lib/client.js:1956 const workspaceMenuItems = [{id:'rename'}, {id:'delete'}]`；`:2002 items: workspaceMenuItems` | 需求 3 的指定位置不可达 |
| `ctx.workspaces`：`list`（`getSnapshot`/`subscribe`）+ `archiveSession(sessionId, {stopActivity})`，后者拒绝时抛 `WorkspaceArchiveError`（`rpcError.code = 'workspace/session-active'`） | `…/dsh-api-workspace-controller/lib/types/client/service.d.ts:80 archiveSession`、`:20 class WorkspaceArchiveError`；`…/lib/types/client/model.d.ts:9 WorkspaceSnapshot { items, archivedSessionIds, pinnedSessionIds, state, phase, error }`；`…/lib/types/types.d.ts:13 WorkspaceView { workspaceId, path, title, sessionIds, … }` | tab 1 的批量归档走 T1 的客户端循环；失败码取自 `WorkspaceArchiveError.rpcError.code`（结构式读取，不 import 类） |
| `ctx.sessions.list` 是 `ObservableSnapshot<SessionListState>`（`ids` / `byId` / `phase` / `projectionsBySession`） | `…/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:46 SessionListState`；`:17 SessionSummary { id, title?, displayTitle, running, blank, updatedAt, origin?, … }` | 行标题取 `displayTitle`，运行态取 `running`，tab 1 用 `ids`（Host 列表成员）而不是 `byId`（含 subagent 兜底） |
| 归档集合与成员位的关系 | `…/dsh-workspace/lib/types/index.d.ts:196 get archivedSessionIds()`（JSDoc：「Archiving never touches workspace accounting — an archived session keeps its `sessionIds` slot」）；`:214 archiveSession`；`:225 unarchiveSession` | tab 2 的行集 = `archivedSessionIds ∩ workspace.sessionIds` |
| `api-session/added(summary)` 是已登记的 Remote 事件，客户端 `handleSessionAdded` 直接 upsert 摘要 | `…/dsh-api-session-controller/lib/types/remote-events.d.ts:2`（selection 含 `'api-session/added'`）；`…/lib/types/types.d.ts:577`（事件声明）；`…/lib/client.js:4266`（`$on('api-session/added', …)`）；`:3475 handleSessionAdded` | 恢复后可以广播 `added` 让侧栏即时可见（既有插件已用同机制广播 `removed`） |
| `api-session/added` 载荷字段（宿主侧投影） | `…/dsh-api-session-controller/lib/types/types.d.ts:160 SessionSummary { agentAvailable, formatStatus?, sessionId, updatedAt, running, blank, parentSessionId?, origin?, cwd?, projections? }` | 广播对象必须满足这个形状；`cwd`/`origin`/`parentSessionId` 从恢复后的 `sessionPersistence.list().header` 取（`…/dsh-session/lib/types/types.d.ts:59 SessionHeader { id, createdAt, cwd?, parentSession?, origin?, … }`） |
| 上游 `attachSession` 用 header cwd 校验，不匹配即拒绝 | `…/dsh-workspace/lib/types/types.d.ts:107 attachSession`（注释：「A new id's live or persisted header cwd must resolve to an existing directory equal to path」）；`:129 detachSession`；`…/lib/types/index.d.ts:214 archiveSession`（`:225 unarchiveSession`、`:196 archivedSessionIds`） | 恢复时的 attach 由上游二次校验：**即使我们按 projectKey 匹配错了工作区，也只会被拒绝（→ warning），不会写到错误的工作区**。这是本项目最关键的一条安全边界 |
| `projectKey(cwd)` 规则：`/`、`\`、`:` 折叠成单个 `-`；`~` 与不安全码元转 `~XXXX`；首尾 `--`；主体截断 251 | `…/dsh-session-persistence-jsonl/lib/index.js`（`function projectKey`，紧邻 `function encodeSegment`） | 本地镜像的逐行依据；`encodeSegment(id)` 对 `[A-Za-z0-9._-]` 恒等 → **归档目录名 == session id**（实测见下） |
| 归档根目录名实况：`--home-xuqinqin-develop-company-opc--` 下同时存在裸 UUID 与 `session-<uuid>` 两代命名 | 实测 `/home/docker/.dsh/archive/sessions/--home-xuqinqin-develop-company-opc--/`（111 条：107 裸 UUID + 4 `session-` 前缀）；`/home/docker/.dsh/sessions/` 下 1366 裸 + 270 前缀 | **目录名即 id，两代命名都要原样保留**（不可做「去 `session-` 前缀」归一，见 ④ D12） |
| 日志头 `id` 与目录名一致、`cwd` 可用 | `zlib.zstdDecompressSync` 解 `/home/docker/.dsh/sessions/--home-docker--/05307715-…/session.v4.jsonl.zstd` 首行得 `{"type":"session","id":"05307715-…","cwd":"/home/docker","parentSession":"session-53fe971b-…","origin":"subagent"}` | 目录名 ↔ id 的实证；`cwd` 可从 header 取（但我们**不**在列表里解 zstd，见 ④ D10） |
| 真实工作区 ↔ 项目目录一一对应 | 实测 `workspace.json` 的 12 个 `workspaces.*.path` 全部经本地 `projectKey` 镜像算出真实存在的 `sessions/` 子目录（12/12 命中）；另有 6 个项目目录无对应工作区（`--tmp--`、`--home-xuqinqin--` 等） | `project-key.test.ts` 的金表来源；R3「未匹配工作区的归档」在真实数据里确有其物 |
| primitives 可用原语 | `…/dsh-client-ui-primitives/lib/types/index.d.ts:11 Button`、`:14 SegmentedTabs`、`:22 Checkbox`、`:25 Menu/MenuItemButton`、`:40 Modal`、`:97 export * from './icons/index.tsx'`（该 icons 桶共 282 个导出，含 `IconChecklistOutlineRegular` / `IconChevronDownOutlineRegular` / `IconArchiveOutlineRegular` / `IconRefreshOutlineRegular` / `IconClockOutlineRegular`） | 选择器用 `Menu`（`portal` 支持）、tab 用 `SegmentedTabs`（原生键盘语义）、行用 `Checkbox`（`label` 即可访问名）——全部不自造 |
| `Modal` 的 `headless` / `closeLabel` 二选一、嵌套模态的键盘优先级需 `onKeyDownCapture` | `…/dsh-client-ui-primitives/lib/types/Modal.d.ts`（`headless:true` 时 `closeLabel?: never`；文档明示嵌套对话框需自管按键） | 管理面在**同一个 Modal 内**切阶段，不嵌套第二个 Modal（见 ④ D8） |

### 2.3 新建文件的范式证据（本仓同类写法）

| 新建文件 | 范式证据 |
|---|---|
| `src/project-key.ts` | 纯函数模块范式：`src/contract.ts:1-21`（零 `node:*`、零 `@deepseek-ai/*`、手写实现、只导出常量与函数） |
| `src/migrated.ts` | 「文件工厂 + 纯流程」同文件范式：`src/delete-session.ts:351 createSessionFiles` + `:144 previewDelete`；错误逐条收集而非抛出的范式：`:467 async remove` |
| `src/client/session-manager-store.ts` | `src/client/delete-store.ts:61 createDeleteRequestStore`（seq + identity 稳定 + 订阅集） |
| `src/client/session-manager-model.ts` | 纯派生范式：`src/client/notice-visibility.ts:1-51`（无 React、无 cordis，导出纯函数，独立单测） |
| `src/client/SessionManagerTrigger.tsx` | 「单一座位 + props 三段式 + 软降级 return」范式：`src/client/DeleteSessionMenuItem.tsx:62-121` |
| `src/client/SessionManagerDialog.tsx` | 「overlay entry + 阶段机 + 复用 Modal/Button」范式：`src/client/DeleteSessionDialog.tsx:100-303` |
| `src/client/session-manager.module.css` | 令牌 + 静态兜底范式：`src/client/delete.module.css:12-19` |
| `test/project-key.test.ts` / `test/migrated.test.ts` | 纯 node 单测 + 内存 fs 范式：`test/delete-session.test.ts:492` 的 `FileSystemOps` 内存实现 |

---

## ③ 接口与数据形状

### 3.1 线上契约：7 个端点（`src/contract.ts`）

```ts
/** 既有（一字不动）：单会话预览 / 单会话处置。 */
export const PREVIEW_ENDPOINT = 'preview-delete'
export const DELETE_ENDPOINT = 'delete-session'

/** 新增：已归档会话的批量（mode 仍是 delete | archive）。 */
export const PREVIEW_BATCH_ENDPOINT = 'preview-delete-batch'
export const DELETE_BATCH_ENDPOINT = 'delete-session-batch'

/** 新增：已迁移（归档根下的目录条目）域。 */
export const LIST_MIGRATED_ENDPOINT = 'list-migrated'
export const DELETE_MIGRATED_ENDPOINT = 'delete-migrated'
export const RESTORE_MIGRATED_ENDPOINT = 'restore-migrated'

export const ENDPOINTS = [
  PREVIEW_ENDPOINT, DELETE_ENDPOINT,
  PREVIEW_BATCH_ENDPOINT, DELETE_BATCH_ENDPOINT,
  LIST_MIGRATED_ENDPOINT, DELETE_MIGRATED_ENDPOINT, RESTORE_MIGRATED_ENDPOINT,
] as const
```

命名理由（D1）：`delete-session-batch` 与既有 `delete-session` 同前缀同语义（`mode` 决定删除还是迁移），调用方一眼看出「同一条处置的两个粒度」；迁移域用 `migrated` 而不是 `archive`，因为 `archive` 在本仓已专指「registry 归档集合」（`archivedSessionIds`）与 `mode:'archive'`（文件迁移），三义混用会让日志与失败文案出现歧义。

```ts
/** 失败码：既有 6 个 + 迁移域 2 个。顺序被测试逐项断言。 */
export const FAILURE_CODES = [
  'bad-request', 'not-found', 'not-archived',
  'not-migrated', 'target-exists',
  'session-live', 'archive-unavailable', 'internal',
] as const

/** 单批目标上限：执行是串行 fs 循环，500 已接近「一次可接受的操作时长」上限（D13 / 待决 P2）。 */
export const MAX_BATCH_TARGETS = 500
/** 一次列出的归档条目上限；超出置 truncated=true，界面提示先清理。 */
export const MAX_LISTED_MIGRATED = 2000
/** 路径片段（sessionId / projectDir / dirName）长度上限；模块私有，取代现有 `SESSION_ID_MAX`（值不变）。 */
const MAX_PATH_SEGMENT = 255
```

请求/响应类型（全部 `readonly`，与既有风格一致）：

```ts
export interface DeleteBatchRequest {
  /** 目标已归档会话 id；允许重复，宿主按首见顺序去重。 */
  readonly sessionIds: readonly string[]
  readonly mode: DisposalMode
}

export interface RejectedTarget {
  readonly sessionId: string
  /** 稳定码；可能来自更新版本的宿主，界面按 errorKeyOf 兜底。 */
  readonly code: string
  readonly message: string
}

export interface DeleteBatchPreview {
  /** 去重后的勾选目标数（用户视角的"N 个会话"）。 */
  readonly targetCount: number
  /** 并集处置集合的会话数（勾选目标 + 级联子代理后代，去重）。 */
  readonly sessionCount: number
  /** 其中后代数（= sessionCount - 通过校验的目标数）。 */
  readonly descendantCount: number
  readonly logBytes: number
  readonly archiveRoot: string
  /** 软失败清单：预览不因个别目标失效而整单失败（Q3）。 */
  readonly rejected: readonly RejectedTarget[]
}

export interface MigratedTarget {
  /** 归档根下的一级目录名（= projectKey(workspace.path)，或 `_no-cwd`）。 */
  readonly projectDir: string
  /** 会话目录名（= session id；两代命名见 ② 实测）。 */
  readonly dirName: string
}

/** delete-migrated / restore-migrated 共用请求体。 */
export interface MigratedRequest {
  readonly entries: readonly MigratedTarget[]
}

/**
 * `sessionId` 与 `dirName` 在当前实现里恒等（D12），但**故意都保留**：
 * `dirName` 是回写请求的文件系统键，`sessionId` 是给用户看/给 registry 用的身份；
 * 若上游哪天改目录编码规则（encodeSegment），两者会分叉而界面仍然正确。
 */
export interface MigratedEntry {
  readonly sessionId: string
  readonly dirName: string
  readonly projectDir: string
  /** 目录内一层文件体积之和（不递归，理由见 ④ D11）。 */
  readonly bytes: number
  /** 目录 mtime（epoch ms）。 */
  readonly updatedAt: number
}

export interface MigratedListing {
  readonly archiveRoot: string
  readonly entries: readonly MigratedEntry[]
  /** 条目数超过 MAX_LISTED_MIGRATED 时为 true。 */
  readonly truncated: boolean
}

export interface RestoredEntry {
  readonly sessionId: string
  /** 挂回的工作区；匹配不到为 null（未分组）。 */
  readonly workspaceId: string | null
}

export interface RestoreOutcome {
  readonly restored: readonly RestoredEntry[]
  readonly warnings: readonly string[]
}
```

`parseRequest` 的判别联合（宿主 dispatcher 唯一入口）：

```ts
export type WebUxRequest =
  | { readonly endpoint: typeof PREVIEW_ENDPOINT; readonly body: DeleteRequest }
  | { readonly endpoint: typeof DELETE_ENDPOINT; readonly body: DeleteRequest }
  | { readonly endpoint: typeof PREVIEW_BATCH_ENDPOINT; readonly body: DeleteBatchRequest }
  | { readonly endpoint: typeof DELETE_BATCH_ENDPOINT; readonly body: DeleteBatchRequest }
  | { readonly endpoint: typeof LIST_MIGRATED_ENDPOINT; readonly body: Readonly<Record<string, never>> }
  | { readonly endpoint: typeof DELETE_MIGRATED_ENDPOINT; readonly body: MigratedRequest }
  | { readonly endpoint: typeof RESTORE_MIGRATED_ENDPOINT; readonly body: MigratedRequest }

export function parseRequest(endpoint: string, payload: unknown): Parsed<WebUxRequest>
export function parseBatchPreview(value: unknown): Parsed<DeleteBatchPreview>
export function parseMigratedListing(value: unknown): Parsed<MigratedListing>
export function parseRestoreOutcome(value: unknown): Parsed<RestoreOutcome>
```

### 3.2 边界校验规则（逐条，可逐条写测试）

| 对象 | 规则 | 失败结果 |
|---|---|---|
| 任一请求体 | 必须是普通对象（非 `null`、非数组、非标量） | `bad-request` |
| 未知字段 | 按端点白名单拒绝：`{sessionId,mode}` / `{sessionIds,mode}` / `{}` / `{entries}`；多一个键即拒绝（不静默忽略，防版本漂移） | `bad-request` |
| `sessionId` / `projectDir` / `dirName` | 非空字符串；长度 ≤ 255；不含控制字符（含 NUL、`\u007f`）；不含 `/`、`\`；不等于 `.` / `..`（复用 `readPathSegment`） | `bad-request` |
| `sessionIds` | 数组；长度 1..=500；每项过上一行规则；**允许重复** | `bad-request` |
| `entries` | 数组；长度 1..=500；每项恰为 `{projectDir, dirName}` 两键；两字段各过路径片段规则 | `bad-request` |
| `mode` | `delete` / `archive` 白名单，**必填无默认** | `bad-request` |
| `list-migrated` 请求体 | 必须是 `{}`（不得带任何字段） | `bad-request` |
| 响应：计数 | 非负安全整数（`Number.isSafeInteger`） | `bad-request`（宿主侧）/`bad-response`（客户端侧） |
| 响应：`archiveRoot` | 非空字符串 | 同上 |
| 响应：`entries[]` | `sessionId`/`dirName`/`projectDir` 非空字符串；`bytes` 非负有限数；`updatedAt` 非负有限数 | 同上 |
| 响应：`entries[].truncated` | 严格 boolean | 同上 |
| 响应：`rejected[]` | 每项 `sessionId` 非空字符串、`code` 非空字符串（**不**做白名单，未知码由界面兜底）、`message` 字符串 | 同上 |
| 响应：`restored[]` | `sessionId` 非空字符串；`workspaceId` 为字符串或 `null`；`restored` 可为空数组（全部逐项失败时） | 同上 |
| 响应：`removed[]`（复用 `DeleteOutcome`） | 沿用既有规则：非空数组、每项字符串 | 同上 |

边界校验的**分工**：`contract.ts` 只做形状与长度（不含「该目录是否真的存在」）；「存在性/冲突/可写」在宿主纯流程里判定，映射到业务码（`not-migrated` / `target-exists` / `archive-unavailable`）。

### 3.3 宿主纯流程签名

`src/delete-session.ts`（追加，不改既有导出）：

```ts
/** 多目标级联并集：按输入顺序逐目标展开，首见去重。 */
export function collectDeleteSetMany(
  targets: readonly string[],
  headers: readonly StoredSessionHeader[],
): string[]

export interface DeleteBatchPlan {
  /** 通过校验的目标（输入顺序、去重后）。 */
  readonly accepted: readonly string[]
  /** 并集处置集合（目标 + 级联后代，首见顺序）。 */
  readonly union: readonly string[]
  /** 软失败清单（预览用；执行端据此整单拒绝）。 */
  readonly rejected: readonly RejectedTarget[]
}

/**
 * 逐目标独立校验（not-found / not-archived / session-live 三码），
 * 一次 listStoredHeaders，不对失败目标做级联展开。
 */
export async function planDeleteBatch(
  targets: readonly string[],
  ports: Pick<DeletePorts, 'listStoredHeaders' | 'isLive' | 'isArchived'>,
): Promise<DeleteBatchPlan>

/** 预览：永不因单项被拒而失败（Q3 软失败）。 */
export async function previewDeleteBatch(
  ports: DeletePorts,
  targets: readonly string[],
  archiveRoot: string,
): Promise<DeleteBatchPreview>

/** 执行（mode=delete）：任一目标校验失败 → 整单拒绝、零副作用；文件失败只进 warnings。 */
export async function deleteSessionBatch(ports: DeletePorts, targets: readonly string[]): Promise<DeleteResult>

/** 执行（mode=archive）：与上同，但在任何写动作之前先 prepareArchive（失败 → archive-unavailable）。 */
export async function archiveSessionBatch(
  ports: DeletePorts,
  targets: readonly string[],
  archiveRoot: string,
): Promise<DeleteResult>
```

执行语义（逐条，与既有单会话流程同构）：

1. `planDeleteBatch` → `rejected.length > 0` ⇒ `{ ok:false, code: rejected[0].code, message }`，**不写任何东西**；
2. 否则 `disposeAll(union, removeFiles | archiveFiles)`（既有 `:221` 私有循环：逐 id「cleanupRegistry → 文件动作 → emitRemoved」，失败只进 warnings、不回滚不中止）；
3. `archive` 档：`isAbsolute(archiveRoot)` + `prepareArchive` 在任何写动作之前（沿用 `:195-203`）；
4. `DeleteOutcome.removed = union`（并集全量，不是 accepted）。

`src/migrated.ts`（新建）：

```ts
export interface MigratedWorkspace { readonly workspaceId: string; readonly path: string }

/** 迁移域只用这 6 个文件原语；`nodeFileSystem` 与内存 fake 都同时满足它。 */
export type MigratedFileOps = Pick<
  FileSystemOps,
  'readdir' | 'lstat' | 'rm' | 'mkdir' | 'rename' | 'copyFile'
>

export interface MigratedPorts {
  /** 宿主解析后的归档根（绝对路径）。 */
  readonly archiveRoot: string
  /** `<home>/sessions` 等路径拼接（宿主提供 `ctx.dshHomePath`）。 */
  readonly homePath: (...segments: string[]) => string
  /** 文件原语；`lstat` 需带 `mtimeMs`。 */
  readonly fs: MigratedFileOps
  /** 当前工作区（`workspaceRegistry.list()` 的投影）。 */
  listWorkspaces(): readonly MigratedWorkspace[]
  /** 把恢复的会话挂回工作区（上游会按 header cwd 二次校验）。 */
  attachToWorkspace(workspaceId: string, sessionId: string): Promise<void>
  /** 把恢复的会话放回 registry 归档集合。 */
  readdToArchiveSet(sessionId: string): Promise<void>
  /** 广播「这些会话已可见」（宿主读一次持久化列表拿真实 header）。 */
  announceRestored(entries: readonly { readonly sessionId: string; readonly updatedAt: number }[]): Promise<void>
  warn(message: string, error?: unknown): void
}

export type MigratedListingResult =
  | { readonly ok: true; readonly listing: MigratedListing }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }
export type MigratedDeleteResult =
  | { readonly ok: true; readonly outcome: DeleteOutcome }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }
export type RestoreResult =
  | { readonly ok: true; readonly outcome: RestoreOutcome }
  | { readonly ok: false; readonly code: FailureCode; readonly message: string }

export async function listMigrated(ports: Pick<MigratedPorts, 'archiveRoot' | 'fs' | 'warn'>): Promise<MigratedListingResult>
export async function deleteMigrated(ports: MigratedPorts, targets: readonly MigratedTarget[]): Promise<MigratedDeleteResult>
export async function restoreMigrated(ports: MigratedPorts, targets: readonly MigratedTarget[]): Promise<RestoreResult>
```

`restoreMigrated` 的两阶段（**整单拒绝** 落在阶段 1）：

1. **校验阶段（零写）**：逐条目 `lstat(<archiveRoot>/<projectDir>/<dirName>)` 必须是目录（否则 `not-migrated`）；`lstat(<home>/sessions/<projectDir>/<dirName>)` 必须不存在（否则 `target-exists`）。任一条目失败 ⇒ `{ ok:false, code, message }`，**一条都不搬**。
2. **执行阶段（逐条、不中止）**：`mkdir(<home>/sessions/<projectDir>)` → `rename` → 失败且 `EXDEV` 才回退 `copyFile` 树 + 删源（复用 `delete-session.ts` 的 `copyTree` 思路，`migrated.ts` 内自带一份 12 行实现，不导出）；随后 `attachToWorkspace`（匹配不到工作区或上游拒绝 ⇒ warning，仍计为已恢复）→ `readdToArchiveSet`（失败 ⇒ warning）→ 结果记入 `restored[]`，`workspaceId` 为匹配结果或 `null`。循环结束后**调一次** `announceRestored(restored.map(...))`，其异常只告警。

`listMigrated` 的实现边界：`readdir(archiveRoot)` 的 `ENOENT` ⇒ 空列表（未建归档根不是错误）；其它错误 ⇒ `archive-unavailable`。一级目录里的非目录/符号链接跳过并 `warn`；二级条目同理；`bytes` = 该会话目录内一层文件 `lstat().size` 之和（子目录跳过）；`updatedAt` = 目录 `lstat().mtimeMs`（缺失按 0）。总数超过 `MAX_LISTED_MIGRATED` 即停止枚举并置 `truncated: true`。

### 3.4 宿主实载体（`src/index.ts`）

```ts
/** 单对象同时满足两个域，端点各自取切片。 */
interface HostPorts extends DeletePorts, MigratedPorts {
  readonly archiveRoot: string
}

export function createDispatcher(
  ctx: Context,
  config?: WebUxConfig,
): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>>
```

`createDispatcher` 结构（改动点集中在 `switch`）：

```ts
return async (endpoint, payload) => {
  const parsed = parseRequest(endpoint, payload)
  if (!parsed.ok) return failure('bad-request', parsed.message)
  try {
    const ports = createPorts(ctx, config)
    if (ports === undefined) return failure('internal', NO_HOME_MESSAGE)
    switch (parsed.value.endpoint) {
      case PREVIEW_ENDPOINT: /* 既有：previewDelete */
      case DELETE_ENDPOINT:  /* 既有：archiveSession | deleteSession */
      case PREVIEW_BATCH_ENDPOINT: /* previewDeleteBatch(ports, ids, ports.archiveRoot) */
      case DELETE_BATCH_ENDPOINT:  /* mode==='archive' ? archiveSessionBatch : deleteSessionBatch */
      case LIST_MIGRATED_ENDPOINT: /* listMigrated(ports) */
      case DELETE_MIGRATED_ENDPOINT: /* deleteMigrated(ports, entries) */
      case RESTORE_MIGRATED_ENDPOINT: /* restoreMigrated(ports, entries) */
    }
  } catch (error: unknown) { return failure('internal', …) }
}
```

`createPorts` 新增端口实现（每项都是对上游的一次调用，全部软读/软失败）：

| 端口 | 实现 | 降级 |
|---|---|---|
| `fs` / `homePath` | 复用既有 `nodeFileSystem`（`lstat` 增 `mtimeMs`）与 `ctx.dshHomePath` | 缺 `dshHomePath` ⇒ `createPorts` 返回 `undefined`（既有行为） |
| `listWorkspaces` | `ctx.workspaceRegistry.list().map(w => ({ workspaceId: w.id, path: w.path }))` | 抛错由 flow 捕获 ⇒ 恢复时全部按「未分组」处理 |
| `attachToWorkspace` | `ctx.workspaceRegistry.get(id as WorkspaceId)?.attachSession(sid)`；缺失/拒绝直接抛 | flow 记 warning（`attach: <id>: <原因>`），会话仍已搬回 |
| `readdToArchiveSet` | `ctx.workspaceRegistry.archiveSession(sid)` | flow 记 warning（`archive-set: <id>: <原因>`） |
| `announceRestored` | `const list = await ctx.sessionPersistence.list()`；按 id 建 `Map<id, header>`；命中的 id 广播 `api-session/added`（`{ sessionId, updatedAt, running:false, blank:false, agentAvailable:false, cwd: header.cwd, parentSessionId: header.parentSession, origin: header.origin }`）；**未命中的 id 只 warn 不广播**（避免伪造出不存在的 id） | 异常由 flow 捕获 ⇒ warning；代价只是浏览器要手动刷新 |

`api-session/added` 的广播复用既有 `emitter`（`:211`）与 `try/catch`（`:233-239` 同款），事件名常量放在 `migrated.ts`：`export const SESSION_ADDED_EVENT = 'api-session/added'`（与 `SESSION_REMOVED_EVENT` 同址风格）。

### 3.5 浏览器调用面（`src/client/delete-client.ts`）

```ts
export interface SessionManagerClient extends DeleteClient {
  previewBatch(sessionIds: readonly string[], mode: DisposalMode): Promise<DeleteBatchPreview>
  disposeBatch(sessionIds: readonly string[], mode: DisposalMode): Promise<DeleteOutcome>
  listMigrated(): Promise<MigratedListing>
  deleteMigrated(entries: readonly MigratedTarget[]): Promise<DeleteOutcome>
  restoreMigrated(entries: readonly MigratedTarget[]): Promise<RestoreOutcome>
}

export function createSessionManagerClient(connection: ConnectionHandle): SessionManagerClient
```

- 失败仍一律是 `DeleteError`（`unavailable` 传输 / `bad-response` 形状 / 宿主码透传）；
- `previewBatch` 与 `disposeBatch` 发 `{ sessionIds, mode }`；`listMigrated` 发 `{}`；`delete/restoreMigrated` 发 `{ entries }`；
- `errorKeyOf(code)` 自动覆盖新码：`error.not-migrated` / `error.target-exists` / `error.workspace/session-active`（后者由 tab 1 的客户端归档循环用）。

### 3.6 管理浮层：组件树、props / inject 面、阶段机

```text
src/client/index.ts#apply
├─ ctx.slots.inject('sidebar.footer.action')                       ← 新增
│   └─ register({ name:'sidebar.footer.action', id: MANAGER_TRIGGER_ID,
│                 order: MANAGER_TRIGGER_ORDER, locale: NS,
│                 inject: () => ({ requests, ready: ctx.get('connection') !== undefined }) },
│               SessionManagerTrigger)
└─ ctx.slots.inject('shell.overlay')                                ← 新增（与既有 delete 对话框并列）
    └─ register({ name:'shell.overlay', id: MANAGER_OVERLAY_ID,
                  order: MANAGER_OVERLAY_ORDER, locale: NS,
                  inject: () => ({
                    requests,
                    client:    connection === undefined ? undefined : createSessionManagerClient(connection),
                    workspaces: 软读 ctx.get('workspaces'),
                    sessions:   软读 ctx.get('sessions'),
                  }) },
                SessionManagerDialog)

<SessionManagerTrigger>                          // sidebar.footer.action
├─ <button type="button" className={css.trigger} aria-label={t('manager.action')}
│          onClick={() => requests.request()}>
│  ├─ <IconChecklistOutlineRegular />
│  └─ {wide && <span className={css.triggerLabel}>{t('manager.action')}</span>}
└─ (wide=false 时即 28×28 图标按钮，由 .trigger 的 CSS 与折叠态居中规则共同决定)

<SessionManagerDialog>                           // shell.overlay；无请求 → null
├─ requests.source 无值 → null
├─ client === undefined → null（与既有 DeleteSessionDialog 同策略）
├─ workspaces / sessions 任一为 undefined → Modal 内渲染 t('manager.unavailable') 空态
│  （通道可用但本地快照缺席：不 return null，否则用户看不到任何解释）
└─ <SessionManagerBody key={seq}>
   └─ <Modal open onClose title={t('manager.title')} description={t('manager.description')}
              closeLabel={t('manager.close')} footer={footerByPhase}>
      ├─ <div className={css.toolbar}>
      │   ├─ <Menu open anchor={<button className={css.workspaceButton}>
      │   │        <IconChevronDownOutlineRegular/>{choiceLabel}</button>}
      │   │        items={workspaceChoices} selectedId={choice} portal
      │   │        onSelect={setChoice} onClose={closeMenu} />
      │   └─ <SegmentedTabs items={tabItems} value={tab} onChange={setTab} label={t('manager.tabs.label')} />
      ├─ <div role="tabpanel" id={activePanelId} aria-labelledby={activeTabId}>
      │   ├─ tab === 'archived' && mode fieldset（复用 dialog.mode.legend / dialog.mode.archive / dialog.mode.delete）
      │   ├─ tab === 'migrated' && <Button variant="ghost" icon={<IconRefreshOutlineRegular/>} onClick={reloadMigrated}>{t('manager.refresh')}</Button>
      │   ├─ <div className={css.selectionBar}>
      │   │   <Checkbox label={t('manager.selectAll')} checked={allSelected} onChange={selectAllOrClear} />
      │   │   <span>{t('manager.selected', { count })}</span>
      │   │   <Button variant="ghost" onClick={clear}>{t('manager.clear')}</Button>
      │   ├─ phase === 'select'  && <ul className={css.list}>…行…</ul> | 空态
      │   ├─ phase === 'confirm' && <ConfirmPanel preview/selection/rejected/unassignedRestores />
      │   ├─ phase === 'running' && <p className={css.muted}>{t('manager.running')}</p>
      │   └─ phase === 'done' | 'failed' && <ResultPanel ... />
```

`SessionManagerTrigger` 的 props：

```ts
export interface SessionManagerTriggerInjected {
  readonly requests: Pick<ManagerRequestStore, 'request'>
  /** connection 是否可用；false 时整颗入口不渲染（没有通道就没有管理面）。 */
  readonly ready: boolean
}
export type SessionManagerTriggerProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & SessionManagerTriggerInjected
```

`SessionManagerDialog` 的 props / 注入面（全部**结构式**声明，不 import 上游服务完整类型）：

```ts
export interface WorkspaceRowView {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}
export interface WorkspacesSnapshotView {
  readonly items: readonly WorkspaceRowView[]
  readonly archivedSessionIds: readonly string[]
}
export interface WorkspacesSource {
  readonly list: {
    getSnapshot(): WorkspacesSnapshotView
    subscribe(listener: () => void): () => void
  }
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
}

export interface SessionRowViewInput {
  readonly displayTitle: string
  readonly running: boolean
  readonly updatedAt: number
  readonly blank: boolean
  readonly origin?: 'subagent'
}
export interface SessionsSnapshotView {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionRowViewInput>>
}
export interface SessionsSource {
  readonly list: {
    getSnapshot(): SessionsSnapshotView
    subscribe(listener: () => void): () => void
  }
}

export interface SessionManagerDialogInjected {
  readonly requests: Pick<ManagerRequestStore, 'source' | 'settle'>
  readonly client: SessionManagerClient | undefined
  readonly workspaces: WorkspacesSource | undefined
  readonly sessions: SessionsSource | undefined
}
export type SessionManagerDialogProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS> & SessionManagerDialogInjected
```

阶段机（一个 Modal，不嵌套第二个 Modal）：

| phase | 进入条件 | 主体 | footer |
|---|---|---|---|
| `select` | 打开 / 从 confirm 返回 / 执行完成后「继续管理」 | 三 tab 列表 + 选择条 | `[取消]` + 动作按钮（tab1：归档所选；tab2：处置所选（mode 取本地单选）；tab3：`[恢复所选]` + `[永久删除所选]` 危险色） |
| `confirm` | 点动作按钮 | 摘要（目标数 / 并集会话数 / 后代数 / 体积 / 归档根）、被拒清单、恢复提示 | `[返回]` + `[确认执行]` |
| `running` | 确认后 | 进行中文案 | `[取消]` 禁用 |
| `done` | 成功 | 结果计数 + 逐项失败清单 + warnings | `[关闭]`（并刷新 tab 3 列表） |
| `failed` | 整单拒绝 / 传输失败 | 失败码文案 + 宿主兜底 message | `[关闭]` / `[返回]` |

动作分派（`ManagerAction` → 调用面）：

| tab | action | 调用 | 失败语义 |
|---|---|---|---|
| active | `{ kind:'archive' }` | **客户端循环**：`workspaces.archiveSession(id)`（T1），逐项收集成败 | 逐项报告（不整单失败）；运行中行已置灰，竞态失败按上游 `rpcError.code` 显示 |
| archived | `{ kind:'dispose', mode }` | `client.previewBatch(ids, mode)` → 确认 → `client.disposeBatch(ids, mode)` | 预览软失败；执行整单拒绝 |
| migrated | `{ kind:'purge' }` | `client.deleteMigrated(entries)`（本地即可算体积/条数，无需预览请求） | 整单拒绝（校验阶段）+ 文件失败逐条 warnings |
| migrated | `{ kind:'restore' }` | `client.restoreMigrated(entries)` | 整单拒绝（校验阶段）+ 逐条降级（attach/readd/announce 只 warning） |

打开即取数：`dialog` 挂载后，tab 3 的 `listMigrated()` 在**首次切到该 tab 时**才发（其余 tab 纯客户端快照派生）；`purge/restore` 成功与点「刷新」后重发。tab 1/2 不请求宿主，全部由 `workspaces` + `sessions` 快照派生。

状态作用域（实现细节，测试要覆盖）：
- `selection` 以 tab 为键（`Record<ManagerTab, ReadonlySet<string>>`）：切 tab 保留各自选择，**执行成功后清空当前 tab 的选择**；
- tab 2 的 `mode` 与批量的 `preview` 结果同属「当前选择 + 当前 mode」：选择或 mode 变化即丢弃上次预览，下次点「处置所选」重新 `previewBatch`；
- `confirm` 阶段的摘要一律来自当次预览结果（不是本地估算），因此从 `select` 返回再改选择不会让确认页显示旧数字。

### 3.7 locales 新增键清单（52 键 = 49 个 `manager.*` + 3 个 `error.*`；zh 为 canonical，en 同键镜像）

| 键 | zh | 用途 |
|---|---|---|
| `manager.action` | 会话管理 | 底部入口按钮（可见文案 + aria-label） |
| `manager.title` | 会话管理 | Modal 标题 |
| `manager.description` | 按工作区批量管理会话：归档活跃会话、处置已归档会话、清理或恢复已迁移到归档目录的日志。 | Modal 说明 |
| `manager.close` | 关闭 | closeLabel |
| `manager.unavailable` | 会话管理依赖的工作区或会话服务尚未就绪；请稍后重试。 | 服务缺席态 |
| `manager.workspace.label` | 工作区 | 选择器无障碍名 |
| `manager.workspace.unassigned` | 未匹配工作区的归档 | 伪选项（R3） |
| `manager.workspace.empty` | 还没有任何工作区。 | 空工作区态 |
| `manager.tab.active` / `.archived` / `.migrated` | 活跃 / 已归档 / 已迁移 | 三个 tab 标签 |
| `manager.tabs.label` | 会话分区 | tablist 无障碍名 |
| `manager.selectAll` | 全选 | 表头 Checkbox |
| `manager.clear` | 清空 | 选择条 |
| `manager.selected` | 已选 {count} 个 | 选择条 |
| `manager.empty.active` | 该工作区没有活跃会话。 | tab1 空态 |
| `manager.empty.archived` | 该工作区没有已归档会话。 | tab2 空态 |
| `manager.empty.migrated` | 归档目录里没有可管理的条目。 | tab3 空态 |
| `manager.empty.unassigned` | 该选项只包含无法匹配工作区的已迁移归档；当前没有这类条目。 | 伪选项 + tab1/2 的空态解释 |
| `manager.badge.running` | 运行中 | 行徽标（且复选框禁用） |
| `manager.badge.blank` | 空白 | 行徽标 |
| `manager.untitled` | （无标题） | `displayTitle` 为空时兜底 |
| `manager.meta.size` | {size} | 行体积 |
| `manager.meta.time` | {time} | 行时间；用本地 `toLocaleString()` 格式化（**不用** primitives 的 `relativeTime`，避免再给测试替身加一个导出） |
| `manager.refresh` | 刷新归档列表 | tab3 按钮 |
| `manager.truncated` | 条目过多，只列出前 {count} 个；请先清理再刷新。 | 列表截断提示 |
| `manager.action.archive` | 归档所选 | tab1 主按钮 |
| `manager.action.dispose` | 处置所选 | tab2 主按钮 |
| `manager.action.purge` | 永久删除所选 | tab3 危险按钮 |
| `manager.action.restore` | 恢复所选 | tab3 主按钮 |
| `manager.confirm.title` | 确认执行 | 确认阶段标题 |
| `manager.confirm.targets` | 目标会话 {count} 个 | 摘要 |
| `manager.confirm.cascade` | 其中级联子代理会话 {count} 个 | 摘要 |
| `manager.confirm.rejected` | 以下 {count} 项无法处理，已从本批剔除： | 软失败清单标题 |
| `manager.confirm.restore` | 恢复会把日志搬回 sessions/ 并按项目路径重新挂回工作区；匹配不到工作区的条目会落到「未分组」。 | 恢复说明 |
| `manager.confirm.restoreUnassigned` | 这些条目无法匹配到工作区，恢复后将出现在「未分组」。 | 伪选项下恢复提示 |
| `manager.confirm.archiveRoot` | 归档目录：{path} | 归档根回声 |
| `manager.confirm.back` | 返回 | 确认阶段 |
| `manager.confirm.run` | 确认执行 | 确认阶段 |
| `manager.running` | 正在执行… | 进行中 |
| `manager.done.dispose` | 已处置 {count} 个会话。 | 结果 |
| `manager.done.archive` | 已归档 {count} 个会话。 | 结果 |
| `manager.done.purge` | 已永久删除 {count} 个归档条目。 | 结果 |
| `manager.done.restore` | 已恢复 {count} 个归档条目。 | 结果 |
| `manager.done.restoreSplit` | 其中 {attached} 个挂回工作区，{unassigned} 个进入未分组。 | 恢复结果 |
| `manager.partial` | 成功 {ok} 项，失败 {failed} 项： | tab1 逐项报告标题 |
| `manager.warnings` | 以下文件操作未完成，需要手动清理： | warnings 清单 |
| `manager.failed` | 操作未能完成：{reason} | 整单拒绝 |
| `manager.itemFailure` | {id}：{reason} | 逐项失败行 |
| `error.not-migrated` | 归档目录里没有该条目（可能已被手工移动或删除）。 | 新失败码 |
| `error.target-exists` | 目标位置已存在同名目录，未做任何改动。 | 新失败码 |
| `error.workspace/session-active` | 该会话仍有运行中的工作（本轮对话 / 子代理 / 后台任务），已跳过；请先停止。 | tab1 归档循环的上游码 |

复用既有键（不新增）：`dialog.mode.legend` / `dialog.mode.archive` / `dialog.mode.delete` / `dialog.summary.size` / `dialog.summary.moveSize` / `dialog.warnings` / `format.bytes|kb|mb` / 既有 `error.*`。

### 3.8 声明面变更清单

**`package.json` → `dsh.client.inject`（现 9 项，追加 3 项共 12）**：

| 追加项 | 理由 |
|---|---|
| `@deepseek-ai/dsh-client-ui-sidebar` | `sidebar.footer.action` 的 SlotMap 声明方；不在本包的模块图依赖里，其座位类型与加载顺序都解析不到（仓内先例：`plugins/multi-root-workspace/package.json:227`） |
| `@deepseek-ai/dsh-api-workspace-controller` | 读 `ctx.workspaces.list` 与 `archiveSession`（tab1）；虽经 ui-workspace 传递可达，但本包直接读该服务，显式声明更诚实 |
| `@deepseek-ai/dsh-api-session-controller` | 读 `ctx.sessions.list`（行标题/运行态）；同上 |

**`package.json` → `devDependencies`（追加 2 项，版本 `0.2.1-rc.5`，与 `DSH_BASELINE` 一致）**：`@deepseek-ai/dsh-client-ui-sidebar`、`@deepseek-ai/dsh-api-session-controller`。两者均已在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 在列（`dsh-client-ui-sidebar` 见 `:37`、`dsh-api-session-controller` 见 `:89`）；`pnpm-lock.yaml` 由 `pnpm install` 更新；`pnpm dsh:check` 的「devDeps 精确等于基线」断言因此仍绿。

**配置键：无新增**（`archiveRoot` 沿用既有 schema；`Config` 一字不改）。

**tsconfig 增量**：见 ① 第 29/30 项。

### 3.9 明确保持不变

- 单会话两端点（`preview-delete` / `delete-session`）的请求体、响应体、失败码与解析器行为；
- `DeleteSessionMenuItem` / `DeleteSessionDialog` / `delete-store` 的座位、order、注入面；
- `Config` schema 与 `resolveArchiveRoot`；
- `SESSION_REMOVED_EVENT` 的广播时机与载荷；
- 客户端 `inject`（cordis 侧必需服务 `['slots','locale','modelDirectories']`）——新能力全靠渲染期软读，不加硬依赖；
- 宿主 `inject`（`['workspaceRegistry','sessionPersistence','dshHomePath']`）。

---

## ④ 决策记录

### 4.1 栈识别结论（必须留档）

| 项 | 结论 |
|---|---|
| 技术栈 | TypeScript + React 18 + esbuild + vitest + cordis 插件包（双端：宿主 ESM 半 / 浏览器 CJS 半） |
| 证据 | 无 `pom.xml` / `build.gradle` / `nuxt.config.*`；`package.json` 依赖 `react` / `esbuild` / `vitest`；`build.mjs:107/122` 两个 esbuild 入口；`vitest.config.ts` 的 `include: ['test/**/*.test.ts', 'test/**/*.test.tsx']` |
| **writer** | **豁免（未触 writer 约束）**——本次改动不涉及 Spring / Nuxt 代码生成面 |

### 4.2 决策表

> 每条含「被否方案 + 理由 + 反例」。反例指「如果按被否方案做，会具体坏在哪」。

| ID | 决策 | 被否方案与理由 | 反例 |
|---|---|---|---|
| D1 | 新增 **5 个端点**，按域命名（`*-batch` 与 `*-migrated`） | ①「一个万能端点 + `op` 字段」：响应形状要在同一端点里按 `op` 分叉，客户端 `parse` 只能先看 `op` 再猜形状，正是现有契约「一个端点一种响应形状」要杜绝的；②「把 batch 折进既有 `delete-session`（`sessionIds` 与 `sessionId` 二选一）」：老请求体从此有两种合法形状，向后兼容靠 `undefined` 判定，且 `parseDeleteRequest` 的穷举测试会退化成条件分支 | 万能端点下，宿主返回 `{sessionCount}` 而客户端按 restore 形状解析 → 得到一个「0 个被恢复」的假成功，用户以为恢复跑完了 |
| D2 | 批量预览在**宿主一次算清**（并集 + 合并统计） | 「客户端逐条调单会话 `preview-delete` 再求和」：级联闭包需要 `sessionPersistence.list()` 的 headers，客户端拿不到；N 次请求还会让「统计口径」散落在客户端（同一会话被两个目标级联命中时被重复计费两次） | 目标 A 级联到 C、目标 B 也级联到 C，客户端逐条求和得 3 个会话、宿主并集是 2 个 → 预览数字与真实删除量不一致 |
| D3 | 迁移域请求体用 `{ projectDir, dirName }` 而不是 `sessionId` | 「只传 sessionId，宿主自己扫归档根定位」：①同一个 id 可能在**两个项目目录**下各有一份（现有 `archive()` 逐项目目录迁移，实测归档根下确有同名条目分布在多项目目录的情况可达）；②legacy/前缀两代目录名让「id → 目录」不唯一 | 只传 id 时，用户勾选 `--home-a--/x` 删除，宿主扫到 `--home-b--/x` 先命中，删掉了用户没勾的那份 |
| D4 | 恢复的**目标路径**取自归档树（`sessions/<projectDir>/<dirName>`），`projectKey` 只用于「条目 ↔ 工作区」匹配 | 「用 `projectKey(workspace.path)` 正推目标路径」：`projectKey` 有意有损（`/`、`\`、`:` 折叠为 `-`，超长截断），反推不可能；一旦规则漂移或路径带损，日志会被搬进错误的项目目录 | 若按工作区 path 正推目标目录，`projectKey` 的截断会让 `/a/<250 字符>` 与另一条超长路径落到同一个 `--a-…--`，恢复把两条会话混进同一项目目录 |
| D5 | `projectKey` 用**本地镜像**（`src/project-key.ts`，零 import）而非 import 上游 | 「从 `@deepseek-ai/dsh-session-persistence-jsonl` import」：①该包**未导出** `projectKey`（`package.json#exports` 只有 `.` / `./src/*` / `./package.json` / `./locale/*.json`，且 `files` 不含 `src/`，实测 `require.resolve` 直接 `MODULE_NOT_FOUND`）；②纯流程层禁止 import `@deepseek-ai/*`；③宿主产物必须自包含（`test/bundle.test.ts:94-97` 的「除 node 内建外没有任何模块依赖」断言） | 一旦 import 上游包，宿主产物会多出一个非 `node:*` 依赖，`bundle.test.ts` 直接红，`link:` 安装的 profile 加载即失败 |
| D6 | 恢复后广播 **`api-session/added`**（真实 header 优先，未命中只告警不广播） | 「不广播，文档写『刷新后可见』」：`workspaceRegistry.archiveSession` 会把 id 加进归档集合，客户端侧栏的已归档列表立刻引用该 id，但 `sessions.list` 没有这一行 → 列表渲染不出、用户以为恢复失败 | 不广播时，恢复 1 条 → 侧栏已归档区仍是空，用户重复恢复同一条 → 第二次 `not-migrated`，体验变成「功能坏了」 |
| D7 | 入口 = footer 触发 + `shell.overlay` 浮层，用 store 桥接 | 「在 `sidebar.footer.action` 里直接渲染 `Modal`」：侧栏子树有自己的滚动/折叠裁剪与 pointer 生命周期，浮层应挂在 shell 层；且既有删除对话框已经确立了「store 桥接 + overlay」的跨 entry 通信模式（`delete-store.ts:1-11` 解释了为什么不能用 `inject.hooks`） | footer 内直接渲染 Modal 时，侧栏折叠动画（`COLLAPSE_SETTLE_MS = 150`，宽栏内容会 unmount）会把正在打开的浮层一起卸掉 |
| D8 | 管理面是**一个 Modal + 阶段切换**，不嵌套第二个 Modal | 「确认用第二个 Modal 叠在上面」：`Modal` 文档明确嵌套对话框需要 `onKeyDownCapture` 自管 Escape/焦点优先级，两层遮罩还会叠加 blur；测试也要为两层 portal 写两套查询 | 嵌套时按 Escape 会先关掉外层而留下确认框（或反之），焦点回到菜单触发器而不是上一阶段按钮 |
| D9 | 行标题由 `Checkbox` 的 `label` 承载（唯一可访问名），不再放第二个 title span | 「独立 title span + 隐藏 label / `aria-label`」：同一行会有两份文本，读屏重复朗读；测试需在两处断言同一内容 | 双份文本下，用户屏幕阅读器读「会话 A 会话 A」，且行内文案改动要同步两处（漏一处即不一致） |
| D10 | 归档列表**不解 zstd、不读日志头**，id 取目录名 | 「用 `zlib.zstdDecompress` 读归档头拿真实 id/cwd」：①zstd 在 Node 22.x 仍标 experimental（本包 engines 允许 `^22.19.0`）；②要复现上游「只解第一个 frame」的读法，否则大日志要整文件解压；③收益仅剩「id 更权威」，而 `encodeSegment` 对两代 id 都恒等（②实测），且恢复后宿主可用 `sessionPersistence.list()` 拿到真实 header | 用 `zstdDecompressSync` 解 100KB 日志可行，但一个 30MB 的归档会让列表卡住数秒，且 Node 22 的 API 在实验期可能改签名 |
| D11 | 归档条目体积 = 目录内**一层文件**求和，不做递归 measure | 「复用 `createSessionFiles.measure()` 递归求和」：归档目录的结构是「一个会话目录 + 1~2 个文件」，递归对每个条目多付 `readdir` 与树遍历；列表只需要量级提示 | 2000 条 × 每条 3 次 syscall 的递归实现，在冷缓存下会让「已迁移」tab 打开要几秒；一层求和是常量 2~3 次 |
| D12 | 归档目录名**原样**当 id，不做 `session-` 前缀归一 | 「去掉 `^session-` 前缀得到裸 id」：实测真实部署里 `session-<uuid>` **本身就是**当前 id 形态（`workspace.json` 的 257 个 sessionIds 全部带前缀，`sessions/` 下 270 个前缀目录与之对应），剥掉就是错 id | 剥前缀后恢复 `session-0a7083fd-…`，`attachSession('0a7083fd-…')` 在上游查不到该会话 → warning，会话搬回但挂不回工作区，且 `added` 摘要 id 也不匹配 |
| D13 | 单批上限 500（选择器全选按上限截断并提示） | 「不设上限」：预览要对并集逐 id 串行 `measureFiles`，500 已是数秒级；请求体与执行时长都无界 | 某工作区 2000 条已归档，用户点全选 → 预览要跑十几秒（`locate()` 每次还要扫全部项目目录），期间界面只有「预览中」 |
| D14 | 「已归档」tab 的行集 = `archivedSessionIds ∩ workspace.sessionIds`，且滤掉 `origin === 'subagent'` | 「用全局 `archivedSessionIds`（跨工作区）」：与 Q1「选定工作区后管理该工作区的会话」冲突；「不过滤 subagent」：侧栏本来不显示子代理行，管理面出现它们会和「删除父会话级联」的既有语义打架 | 不过滤 subagent 时，用户删掉一个子代理子会话、父会话仍在归档里，之后删父会话的级联集合里已没有它 —— 预览数字与用户认知不符 |
| D15 | 运行中的会话**置灰不可选**，同时保留服务端拒绝作为竞态兜底 | 「可选，靠执行失败报告」（R2 的字面意思更接近「预览剔除」） | 若只在执行时失败，用户会先把 20 条全选、确认，再在结果里看到 1 条失败——多一次整单往返；置灰把信息提前到选择阶段，而 T1 的「逐项报告」仍然保留给竞态（勾选后又被别处启动） |
| D16 | 失败码新增 `not-migrated` / `target-exists`，不复用 `not-found` | 「复用 `not-found`（会话不存在）」：迁移域的「不存在」指归档目录里没有这个条目，和「宿主持久化里没有该会话」是两件事，文案指向不同排查方向 | 用户看到「该会话已不存在，可能已在别处删除」→ 去侧栏找会话，实际只是归档目录被手工清过，白找一圈 |
| D17 | 保留单会话入口与对话框（批量是叠加） | 「用管理面替换行菜单入口」：explore 的非目标已明确「不动现有单会话删除入口」，且单删是最短路径（2 次点击 vs 打开浮层） | 替换后删一条会话要开浮层、选工作区、切 tab、勾选、确认——把高频短路径做成低频长路径 |
| D18 | 新 entry 全部**软注册 + 渲染期软读服务**，不加客户端硬依赖 | 「把 `workspaces`/`sessions` 加进客户端 `inject`」：web 壳在这两个服务就绪晚于本插件 `apply`，硬依赖会让整行插件（含徽章）在服务缺席时被 cordis 挂起/报错 | 若硬依赖，无工作区服务的壳会让 provider 徽章也一起消失——用一个新能力的失败换掉一个既有能力 |

---

## ⑤ 逐任务组实现要点

> 与后续 `tasks.md` 的分组一一对应（G1→G8）。每组末尾给出**可执行验证**（命令或断言），不接受「已实现/正常」这类结论。

### G1 — 契约层（`contract.ts` + `project-key.ts` + 两个测试）

**实现要点**

1. `contract.ts`：加 5 个端点常量、`ENDPOINTS` 扩到 7、`FAILURE_CODES` 扩到 8、3 个上限常量、10 个新类型、4 个新 parser、`WebUxRequest` 判别联合 + `parseRequest`。
2. `readPathSegment(value, subject): Parsed<string>`：把现有 `readRequest` 里的「非空 / ≤255 / 无控制字符 / 非 `.`/`..` / 无分隔符」抽出来，`sessionId`、`projectDir`、`dirName` 三处共用；`readDeleteRequest` 改为调用它。
3. **保留** `parseDeleteRequest(endpoint, payload)` 的既有行为（只认两个单端点），仅供既有测试与既有分派路径；新代码走 `parseRequest`。
4. `project-key.ts`：逐行镜像上游 `projectKey`（`--` + 去前导 `-` 的 251 截断 + `--`；分隔符连续折叠；`~` 也转义；空串抛错）。`workspaceForProjectDir()` = `workspaces.find(w => projectKey(w.path) === projectDir)?.workspaceId ?? null`。
5. `test/project-key.test.ts` 金表（**实测**，可直接抄）：

| cwd | 期望 | 来源 |
|---|---|---|
| `/home/docker` | `--home-docker--` | 真实 `sessions/` 目录名 |
| `/home/xuqinqin/develop/company/opc` | `--home-xuqinqin-develop-company-opc--` | 真实 `archive/sessions/` 目录名 |
| `/home/xuqinqin/develop/person/dsh-plugins` | `--home-xuqinqin-develop-person-dsh-plugins--` | 真实 `sessions/` 目录名 |
| `/home/xuqinqin/develop/company/web/cloud-the-sky` | `--home-xuqinqin-develop-company-web-cloud-the-sky--` | 真实 `sessions/` 目录名 |
| `/tmp` | `--tmp--` | 真实 `sessions/` 目录名 |
| `/a//b` | `--a-b--` | 连续分隔符折叠 |
| `/a/b/` | `--a-b---` | 尾分隔符（R1 勘误：上游 rc.5 只去前导 `-`，尾部 `-` 保留；原 `--a-b--` 系规划期预测错误，执行期实测 + 用户裁定） |
| `/home/u/with~tilde` | `--home-u-with~007Etilde--` | `~` 转义 |
| `C:\a\b` | `--C-a-b--` | 反斜杠与盘符冒号都折叠 |
| `/` | `--root--` | 空主体兜底 |
| 300 字符路径 | 主体恰 251 字符 + 前后 `--`（总长 255） | 截断边界 |
| `''` | 抛错 | 与上游一致 |

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- contract project-key
pnpm --filter dsh-plugin-web-ux typecheck
# 端点/失败码常量确实落到源码（不是只在测试里）
grep -n "PREVIEW_BATCH_ENDPOINT\|LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT" plugins/web-ux/src/contract.ts
grep -n "'not-migrated'\|'target-exists'" plugins/web-ux/src/contract.ts
# 纯度：契约与 project-key 不得出现 node:/@deepseek-ai
grep -n "node:\|@deepseek-ai" plugins/web-ux/src/contract.ts plugins/web-ux/src/project-key.ts   # 期望：无输出
```

> **G1 组段终形态（执行期实测，2026-11-04）**：上游 `projectKey` rc.5 实测只去前导 `-`（`/a/b/` → `--a-b---`），金表第 7 行按用户裁定勘误（R1）；本地镜像与上游 82 输入差分 0 处不一致，12 个真实工作区路径 12/12 命中。验收：`typecheck` EXIT=0（engines WARN 良性，R3）；`test` 16 文件/431 用例全过、SKIPPED 0（R2：位置过滤不生效，实际全量跑）；contract.test.ts 204 用例（原 49 保留、仅两处旧集合断言更新）、project-key.test.ts 43 用例（金表 12 it + 有损 19 + 属性 4 + workspaceForProjectDir 5+）；grep 断言 1.1=17、1.2 纯度=0、1.4=24。被否方案：projectKey 尾分隔符特判（用户否决，见 R1）。

### G2 — 宿主纯流程（`delete-session.ts` 批量 + `migrated.ts` + 两个测试）

**实现要点**

1. `collectDeleteSetMany`：对每个目标调既有 `collectDeleteSet`（`:87`），按首见顺序合并。
2. `planDeleteBatch`：**一次** `listStoredHeaders()`；对每个目标依次判 `not-found`（不在 headers）/ `not-archived`（`isArchived` 假）/ `session-live`（闭包内任一 `isLive`）；通过者加入 `accepted` 且闭包并入 `union`；失败者写 `rejected`（首错即止，每目标至多一条）。
3. `previewDeleteBatch`：`logBytes` 对 `union` 串行 `measureFiles`（异常按 0 + warn，沿用 `:150-153` 策略）；`descendantCount = union.length - accepted.length`；`targetCount = targets 去重数`；返回 `archiveRoot` 回声。
4. `deleteSessionBatch` / `archiveSessionBatch`：`planDeleteBatch` → `rejected.length > 0` 即整单拒绝（`rejected[0]` 的码与 message）；否则 `disposeAll(union, …)`；archive 档先 `isAbsolute` + `prepareArchive`。
5. `migrated.ts`：`createArchiveFiles({ homePath, fs })` → `{ list, remove, restore }`；`listMigrated` / `deleteMigrated` / `restoreMigrated` 按 3.3 的两阶段语义实现；`copyTree` 回退只在本文件内私有；所有失败项形如 `<路径>: <原因>`（与既有 warnings 同款，便于用同一段 UI 渲染）。
6. `FileSystemOps.lstat` 返回类型加 `readonly mtimeMs?: number`；`index.ts` 的 `nodeFileSystem.lstat` 补 `mtimeMs`（宽化赋值合法，既有 fake 零改动）。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- delete-session migrated
# 批量函数确实导出（tasks.md 的实现点与代码一一对应）
grep -n "export async function previewDeleteBatch\|export async function deleteSessionBatch\|export async function archiveSessionBatch\|export function collectDeleteSetMany" plugins/web-ux/src/delete-session.ts
grep -n "export async function listMigrated\|export async function deleteMigrated\|export async function restoreMigrated" plugins/web-ux/src/migrated.ts
# 纯流程仍不得 import 上游（只允许 node:path / 本包相对模块）
grep -n "@deepseek-ai" plugins/web-ux/src/delete-session.ts plugins/web-ux/src/migrated.ts   # 期望：无输出
```

> **G2 组段终形态（执行期实测，2026-11-04）**：批量五函数落位 `delete-session.ts` 219-388 行（`planDeleteBatch` 单次 headers/三码首错即止/失败不级联；`disposeBatch` rejected 非空整单拒绝零副作用、archive 档 prepare 先于写动作、`removed`=union 全量）；`migrated.ts` 733 行新建（两阶段恢复 + EXDEV 回退 copyTree 内置 12 行实现不导出；工厂方法级形状 `list→{entries,truncated}`/`remove→warnings[]`/`restore→{moved,warnings}`，已写入 JSDoc）；`announceRestored` 空 restored 也调一次（蓝图措辞），updatedAt 由 flow 提供归档 mtime、3.1 接线按 D6 真实 header 优先；类型守卫：`RejectedTarget.code:string` 经既有 `isFailureCode` 守卫入 `DeleteResult`（未知码兜底 internal，运行时不触发）。验收：`typecheck` EXIT=0；`test` 17 文件/501 用例全过、SKIPPED 0（delete-session.test.ts 61→86、migrated.test.ts 新建 45）；grep 断言 2.1=4、2.2=3、纯度=0。8.1 裁定：按触达 #29 全四文件 include（含两个新测试文件）。

### G3 — 宿主接线（`index.ts` + `test/index.test.ts`）

**实现要点**

1. `createDispatcher` 换 `parseRequest` + `switch`；7 个分支；`failure()` 语义不变（业务码原样）。
2. `HostPorts` 合并两个域；`createPorts` 增 5 个端口（3.4 表），每项都保持「活对象、每次访问重读服务」（与既有注释一致）。
3. `nodeFileSystem.lstat` 加 `mtimeMs`；`SESSION_ADDED_EVENT` 常量放 `migrated.ts`。
4. `announceRestored`：一次 `sessionPersistence.list()`，按 id 命中才广播（未命中只 warn）；广播字段见 3.4；任何异常只 warn。
5. `index.test.ts`：在真实临时 `$DSH_HOME` 上跑 `list-migrated`（含两层目录、`session-` 前缀目录、非目录条目、`truncated`）、`delete-migrated`、`restore-migrated`（含目标位冲突 → `target-exists`、attach 拒绝 → warning 且 `workspaceId:null`）；用 fake registry 记录 `attachSession` / `archiveSession` 调用；断言 `emitted` 里出现 `['api-session/added', {...cwd...}]`。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- index
grep -n "LIST_MIGRATED_ENDPOINT\|RESTORE_MIGRATED_ENDPOINT" plugins/web-ux/src/index.ts
pnpm --filter dsh-plugin-web-ux build
grep -c "list-migrated\|restore-migrated\|api-session/added" plugins/web-ux/lib/index.js   # 期望 ≥ 3
```

> **G3 组段终形态（执行期实测，2026-11-04）**：dispatcher 七分支 + `HostPorts extends DeletePorts, MigratedPorts` + 端口 5 组落位（`announceRestored` 按 D6：一次 `sessionPersistence.list()` 建 Map，命中才广播、未命中只 warn；`attachToWorkspace` 缺失/拒绝显式抛——按降级列，非骨架的静默 no-op；`lstat` 显式投影 `{size,mtimeMs,isDirectory}`）。验收：`typecheck` EXIT=0（8.1 已提前——TS6307 清零）；`test` 17 文件/510 用例全过（index.test.ts 16→25，真实临时 `$DSH_HOME`：2001 目录 truncated、target-exists 零写、attach 拒绝 `workspaceId:null`、`api-session/added` 载荷逐字段、缺 dshHomePath 七端点 internal）；grep 断言源=4、产物=3；已构建产物 28 条运行时冒烟全过。编排裁定：8.1 提前执行（TS6307 会让组4/5 的 typecheck 验证句假红）。

### G4 — 客户端 RPC（`delete-client.ts` + `test/delete-client.test.ts`）

**实现要点**

1. 把 `call` 提成模块级 `callEndpoint(connection, endpoint, body)`；`createDeleteClient` 与 `createSessionManagerClient` 都只调它。
2. 5 个新方法各自过对应 parser；形状不符 → `DeleteError('bad-response', …)`；传输抛错 → `'unavailable'`。
3. `listMigrated()` 发 `{}`（不是 `undefined`，保证线上形状稳定可断言）。
4. 测试：每个端点的 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, body)`；宿主码透传（含新码）；4 种坏形状。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- delete-client
grep -n "createSessionManagerClient\|callEndpoint" plugins/web-ux/src/client/delete-client.ts
```

> **G4 组段终形态（执行期实测，2026-11-04）**：`callEndpoint` 为模块级**私有**抽取（设计仅要求模块级；测试经公开方法断言，无需导出）；`createSessionManagerClient` 以对象展开复用 `createDeleteClient` 两方法；失败三态：传输抛错/不可读信封→`unavailable`、可读信封 code 透传不白名单、坏形状归一 `bad-response`。验收：`typecheck` EXIT=0；`test` 17 文件/525 用例全过、SKIPPED 0（delete-client.test.ts 8→23：7 端点 `toHaveBeenCalledWith` 全覆盖、新码 `not-migrated`/`target-exists` 透传、坏形状 4 种、传输抛错 `unavailable`）；grep 断言=9。本组经一次会话中断恢复（4.1 首派未落盘，按恢复协议重派）。

### G5 — 入口与浮层 UI（trigger / dialog / model / store / css + `client/index.ts`）

**实现要点**

1. `session-manager-store.ts`：照抄 `delete-store.ts:61` 的 seq/identity 契约（`request()` 每次换新对象）。
2. `session-manager-model.ts`：纯派生，`ManagerTab` / `ManagerAction` / 行派生（3.6 表）/ 选择操作 / `entryKeyOf`。**所有**过滤规则集中在此（子代理过滤、归档集合交集、伪选项聚合、上限截断），组件里不再写判据。
3. `SessionManagerTrigger.tsx`：`ready === false` → `return null`；`wide` 决定是否渲染文案；`aria-label` 恒在。
4. `SessionManagerDialog.tsx`：五阶段机 + 三 tab + 工作区选择器（`Menu` portal）+ 选择条 + 四个动作分派（3.6 表）。
5. `session-manager.module.css`：只补 primitives 给不了的东西（触发按钮、工具栏、列表行、徽标、选择条、结果区）；颜色全部 `var(--dsw-alias-*, 兜底值)`。
6. `client/index.ts`：两个新 entry + 4 个常量 + 渲染期软读注入面；`MANAGER_TRIGGER_ORDER = 100`、`MANAGER_OVERLAY_ORDER = 520`（在既有删除对话框 500 之后，两者不会同时出现）。
7. `test/stubs/ui-primitives.tsx`：补 `Checkbox` / `SegmentedTabs` / 5 个图标（形状同真组件：`Checkbox` 渲染 `<label><input type="checkbox">label</label>`；`SegmentedTabs` 渲染 `role="tablist"` 与 `role="tab"` 按钮）。
8. `test/session-manager-model.test.ts`（纯 node）、`test/session-manager-trigger.test.tsx`、`test/session-manager-dialog.test.tsx`（jsdom）、`test/client-apply.test.ts` 更新。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- session-manager client-apply
pnpm --filter dsh-plugin-web-ux typecheck          # slot props（wide）与 PropsRuntime 组合的类型门
grep -n "sidebar.footer.action\|web-ux-session-manager" plugins/web-ux/src/client/index.ts
grep -n "declare module\|SlotMap" plugins/web-ux/src/client/SessionManagerTrigger.tsx   # 期望：无输出（座位类型来自上游声明）
```

> **G5 组段终形态（执行期实测，2026-11-04/05）**：store（88 行，`delete-store.ts:61` seq/identity 契约照抄，载荷仅 `{seq}`，`ManagerRequestSource` 增量导出）；model（707 行纯派生，判据全收敛：三域行集/伪选项聚合 P1/500 截断 P2/running 置灰 D15/`unarchiveSelected`；`ManagerAction` 取 ③.6 命名 `archive`/`dispose`/`unarchive`/`purge`/`restore`（design 概览简写弃用，映射写模块头）；`defaultWorkspaceChoice`（最近使用优先）等追加派生按「判据集中」保留；`entryKeyOf` migrated 键实测为 `migrated:<projectDir>/<dirName>` 斜杠形态）；trigger（79 行，`!ready→null`/wide 两形态/`aria-label` 恒在；**`PropsRuntime<'sidebar.footer.action'>` 需 8.3 devDeps，暂以 `SidebarFooterActionOwnerProps={wide}` 结构式镜像内联，8.3 后换装跟进**）；CSS（424 行 28 类名契约：`trigger triggerLabel toolbar workspaceButton workspaceName tabsRow modes modeRow modeText selectionBar list row rowSelected rowDisabled rowMeta badge badgeRunning badgeBlank empty truncated muted summary rejected result warnings failure detail danger`；41 处 `var(--dsw-*)` 全带兜底、零裸色值；dsw-alias 计数 37）；stubs（+7 导出，图标 `data-icon`：checklist/chevron-down/archive/refresh/clock）。验收：`typecheck` EXIT=0；`test` 19 文件/563 用例全过、SKIPPED 0（model 测试 31 it 含 store 契约、trigger 测试 7 it）；编排裁定：8.2 提前（TS6307）、7.2 提前（6.6 CSS 前置）。

> **G5 组段终形态·组7 补遗（2026-11-05）**：dialog 1294 行（五阶段机 + `WORKSPACE_MENU_PORTAL` A13 单点开关 + 四动作分派 + P3 停原 tab + running 接管互斥；复用 `DeleteSessionDialog` 的 `formatSize`/`DEFAULT_DISPOSAL_MODE`）；注册 4 常量（trigger 100@`sidebar.footer.action`、overlay 520@`shell.overlay`、store 单实例桥接；`FooterActionSlots` 结构式桥待 8.3 后换装）；stub 追加 `Menu`；client-apply 7→10（注册序/id/order/软降级/座位缺失静默/双重注册）。验收：20 文件/585 用例全过。裁定：在途互斥=③.6 阶段表形态；confirm 同文案按 role 断言；`aria-haspopup` 不补；`dialog.warning.archive` 旧文案矛盾随 9.1 收口；A13 真机首验留 9.3。

### G6 — 文案（`locales.ts` + `test/locale-parity.test.ts`）

**实现要点**

1. 52 个键（3.7 表）先加 `zh`，再补 `en` 同键镜像；`Key` 自动扩张，漏键即编译失败。
2. `locale-parity.test.ts` 的 `required` 列表追加 `manager.*` 的关键键（至少：入口、三 tab、四动作、确认/结果/失败、三个新错误码），其余由「zh/en 键集一致」自动覆盖。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux test -- locale-parity
# zh 与 en 各一份：期望输出 = 2 × manager.* 键数
grep -c "^  'manager\." plugins/web-ux/src/client/locales.ts
grep -n "'error.not-migrated'\|'error.target-exists'\|'error.workspace/session-active'" plugins/web-ux/src/client/locales.ts
```

> **G6 组段终形态（执行期实测，2026-11-04）**：locales.ts +150 行 = 58 新键（55 `manager.*` + 3 `error.*`，zh canonical + en `satisfies` 镜像，各 102 键无单边）；落档增补 6 键 = `manager.action.unarchive`/`manager.unarchive.{confirm,run,done,partial}`/`manager.empty.unassigned.archived`（逐项失败/整单失败/运行态复用既有 `itemFailure`/`failed`/`running`）；locale-parity required 39→77（+38）。**口径**：§3.7 表 3 个 error 键（第 3 个 `error.workspace/session-active` 为上游码 `workspace/session-active` 经 errorKeyOf 的映射键），contract 增量 2 码，两处口径同时满足。增补 6 键命名自此冻结（5.2 required 已钉），组7 组件按此消费。

### G7 — 测试收口与产物（`bundle.test.ts` / stubs / tsconfig / build）

**实现要点**

1. `bundle.test.ts`：CSS 注入器断言 3 → 4；浏览器产物标记加 `sidebar.footer.action`、`web-ux-session-manager`、5 个端点名；宿主产物标记加 `restore-migrated`、`api-session/added`。
2. `tsconfig.host.json` / `tsconfig.client.json` 增补（① 第 29/30 项）。
3. `package.json`：inject +3、devDeps +2、`description` 改述；根 `pnpm install` 更新 lockfile。
4. `pnpm --filter dsh-plugin-web-ux build` 重建 `lib/`；根级 `pnpm dsh:check` 确认基线/pin/allowlist 未被破坏。
5. 全仓回归：`pnpm -r test`、`pnpm -r typecheck`（确认没碰坏其他包）。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux verify:all          # lint → typecheck → build → test（顺序不可换）
grep -n "toHaveLength(4)" plugins/web-ux/test/bundle.test.ts
cd /home/xuqinqin/develop/person/dsh-plugins && pnpm dsh:check && pnpm -r test
```

> **G7 组段终形态（执行期实测，2026-11-05）**：8.3 inject 9→12（§3.8 全限定名：`@deepseek-ai/dsh-client-ui-sidebar`、`@deepseek-ai/dsh-api-workspace-controller`、`@deepseek-ai/dsh-api-session-controller`；devDeps +2 @ rc.5 落锁 +6 行；验收句勘误 R4——inject 名必须全限定）；换装微任务：trigger props 改 `SidebarFooterActionOwnerProps`（声明包直出）+ `client/index.ts` 删 `FooterActionSlots` 桥改 `ctx.slots.inject` 直写（`PropsRuntime` 记法弃用口径：实为 `ui-slots` 导出且组合 8 必需钩子，占用方用 owner 份额类型为终态）；8.4 bundle.test 断言并入既有 it（注入器 4、浏览器标记 footer slot/浮层 id/5 端点、宿主 7 端点+两事件名），verify:all=lint+typecheck+build+test 全绿，产物标记 host=3/client=5；8.5 全仓回归三命令依次 0（`dsh:check` 51 包全 rc.5；`-r test` 6 插件 2182 passed/5 平台 skip；`-r typecheck` 全 Done），零文件改动。

### G8 — README / 文档

**实现要点**

1. 新增 `## 会话管理`（放在「删除已归档会话」之后）：入口位置与降级、三 tab 与工作区选择器、伪选项、批量语义（预览软失败 / 执行整单拒绝 / 归档逐项报告）、上限与截断、恢复语义（搬回 `sessions/<projectDir>/<id>`、按 projectKey 匹配挂回、匹配不到 → 未分组、attach 由上游二次校验）、失败码表追加两码。
2. **改写**冲突段：`:45` 的警示表补「已迁移可由『会话管理』恢复」；`:115`/`:128` 的「插件不提供恢复入口 / 搬回 ≠ 恢复原样」改为「有 GUI 恢复，但仅限本插件归档树且只回到已归档态」；`:194-199` 的非目标删除「批量处置」「不做恢复 GUI」两条，保留「停止并删除」「未归档直接删除」「附件 GC」「多版本 allowlist」四条。
3. 「双端结构」树补 7 个新文件（`project-key.ts`、`migrated.ts`、`session-manager-store.ts`、`session-manager-model.ts`、`SessionManagerTrigger.tsx`、`SessionManagerDialog.tsx`、`session-manager.module.css`）；「构建」的 tsconfig 清单同步；「版本迁移」加一段：新客户端 + 旧宿主 = 新端点 `bad-request`（`error.bad-request` 文案），旧客户端 + 新宿主 = 单会话能力照旧；`dsh.client.inject` 变化需按 tag 重装并重启 profile。
4. `cordis.patch.yml` 注释同步端点清单（注册行不变）。

**验证**

```bash
grep -n "^## 会话管理" plugins/web-ux/README.md
grep -n "不提供恢复入口" plugins/web-ux/README.md            # 期望：无输出（两条旧论断已改写）
grep -n "^\- \*\*批量处置\*\*：" plugins/web-ux/README.md   # 期望：无输出（旧非目标条目已删）
grep -n "不做恢复 GUI" plugins/web-ux/README.md               # 期望：无输出
grep -n "restore-migrated" plugins/web-ux/README.md plugins/web-ux/cordis.patch.yml
```

### 手工冒烟（实施完成后、发布前，非 CI）

> **执行结果（2026-11-05 终局，详见 `plugins/web-ux/artifacts/session-manager-smoke.md`）**：步骤 1 PASS；步骤 2 功能面 PASS（真机自动化走查，含 A13/D15/伪选项/默认工作区派生），但侧栏 footer 入口存在**组合级视觉裁切**（R5：`sidebar.footer.action` 行被 multi-root 的 Folders 整行独占，本插件与 stt 入口均被裁）——用户裁定接受现状，待统一「工作区配置」入口一并解决（仅备忘不启动）；步骤 3–5 未执行（豁免：真实数据变更类操作无素材/双窗口成本，单测覆盖面已在冒烟文件留档）。

1. `pnpm --filter dsh-plugin-web-ux build` 后以 `link:` 方式装到 profile（`docker exec dsh dsh plugin --profile web add <本仓>/plugins/web-ux`），重启后刷新 GUI。
2. 点底部「会话管理」→ 切三个 tab → 工作区选择器切换（含「未匹配工作区的归档」）→ 勾选/全选/清空。
3. 另一窗口先把某条会话取消归档 → 回到管理面确认执行 → 期望 `error.not-archived` 整单拒绝、磁盘零改动（用 `ls` 对 `sessions/` 与 `archive/sessions/` 前后对比）。
4. 恢复一条真实归档条目 → 期望侧栏「已归档」即时出现该会话（验证 `api-session/added`）；若未出现，记录「需手动刷新」结论并把 `announceRestored` 降级为文档说明（不改其他行为）。
5. 恢复一个 `projectDir` 无对应工作区的条目 → 期望出现在「未分组」，`restored[].workspaceId === null`。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（实现按此执行；若被推翻需回到设计）

| ID | 假设 | 依据 / 若被推翻的后果 |
|---|---|---|
| A1 | 上游接触面即 `0.2.1-rc.5`：`sidebar.footer.action` owner props 只有 `{ wide }`，无额外布局契约 | ② 的 slots.d.ts 证据。若上游改 props，组件 props 类型立刻编译失败（显式，不是静默错渲染） |
| A2 | `projectKey` 规则冻结于 rc.5；它**只**用于「条目 ↔ 工作区」匹配，**从不**用于目标路径 | 规则漂移的最坏后果是「全部落到未分组」，不动任何字节位置（D4 的安全边界） |
| A3 | 归档目录名 == session id（两代命名都成立：`encodeSegment` 对 `[A-Za-z0-9._-]` 恒等） | ② 的实测（header `id` 与目录名一致 + 257 个注册表 id 对应实际目录）。若不成立，attach/readd 会被上游拒绝 → warning，文件已回位，用户刷新可见 |
| A4 | `api-session/added` 在 rc.5 不做载荷校验，客户端 `handleSessionAdded` 直接 upsert | ② 的 `$on` 接线与 `handleSessionAdded`。若载荷被拒：恢复仍成功，只是要手动刷新（能力不回退） |
| A5 | 归档会话保留 `sessionIds` 槽位（tab 2 行集成立的前提） | 上游 `archivedSessionIds` 注释明示。若被推翻，tab 2 会漏掉「已归档但无成员位置」的会话（见 待决 P1） |
| A6 | `sessionPersistence.list()` 每次调用重扫磁盘（无缓存）→ 恢复后立刻可被 `attachSession`/`archiveSession` 看见；且 registry 变更经上游 follow 流推给客户端（既有删除/归档已依赖同一路径） | 上游 `list()` 实现（每次 `listArtifacts` 扫盘）+ workspace follow 增量。若有缓存，恢复后的 attach/readd 会 `not-found` → warning，用户需重启 |
| A7 | `attachSession` 会用 header cwd 二次校验 → 匹配错工作区只会被拒，不会写错 | ② 的 `types.d.ts:107`。这是「projectKey 只做匹配」仍然安全的最后一层保险 |
| A8 | 归档根可含任意外来目录/文件（用户手工管理） | 实现上：非目录/符号链接跳过 + warn；`ENOENT` 当作空列表 |
| A9 | 会话量级「数百」：不做虚拟滚动；列表一次渲染，超过 2000 条截断 | explore §6 的量级假设；超出场景写进 README 已知限制 |
| A10 | 单批 500、单次列出 2000 是「用户可接受的操作时长」边界 | 串行 `measureFiles` 与串行 fs 循环实测成本；见 待决 P2 |
| A11 | 既有单会话两端点「一字不动」包含其 parser 函数名与行为 | Q4；`parseDeleteRequest` 保留即可 |
| A12 | `sidebar.footer.action` 的 registrant 自己负责按钮的全部外观与 28px 折叠尺寸 | 上游只给 `wide`；CSS 需对齐 Settings 行的字级与 hover 底（实现期以真机截图核对，不写死像素断言） |
| A13 | `Menu`（`portal:true`）在 `Modal` 内可用（焦点/层级不冲突） | primitives 的 `Menu` 文档支持 portal；**实施第一步就要验证**：jsdom 测试能选到菜单项，真机打开不闪退。若冲突，退化为 `portal:false` 的原地菜单（仅这一处改动） |
| A14 | 管理面不出现子代理会话（与侧栏一致），其处置依赖父会话的级联 | 侧栏行为 + 既有级联语义。代价：孤立的归档子代理（父已删）在管理面不可见（记入 待决 P1 的同一类问题） |
| A15 | 恢复不清理归档根下的空项目目录 | 无害且幂等（下次归档会复用同名目录），少一次删目录的写操作 |

### 6.2 未决项（设计层，不影响本轮拍板，实施时按推荐执行）

| ID | 未决项 | 推荐 |
|---|---|---|
| U1 | 跨设备（EXDEV）恢复大目录时的进度反馈 | 不做：串行复制、UI 只显示「正在执行…」；预览/确认阶段已给出体积，用户有预期 |
| U2 | 「已迁移」tab 是否需要轮询自动刷新 | 不做：提供手动「刷新归档列表」按钮（`manager.refresh`），避免无谓的全盘扫描 |
| U3 | 恢复/删除后是否给 undo 入口 | 不做：恢复本身已可再归档，删除不可逆（danger 色 + 确认阶段已明示），加 undo 会引入「保留副本」的存储设计 |
| U4 | 归档条目排序（mtime 倒序 vs 名字） | 按 `updatedAt` 倒序（最近归档在前），同值按 `dirName` 字典序稳定排序 |

---

## 待决问题（六字段之外，供主会话代问）

### 待决 P1（TOP）— 已归档但**无工作区归属**的会话，是否纳入「已归档」tab？

- **问题**：`archivedSessionIds` 是 registry 全局集合，归档不要求有工作区归属（上游明示「workspace accounting 无关」）。用户删掉某个工作区后，其已归档会话就成为「已归档 + 不属于任何工作区」的孤儿：侧栏不显示（已归档、又不在任何工作区组里），当前设计下管理面 tab 2 也不显示（行集 = 归档集合 ∩ 所选工作区的 `sessionIds`）。这类会话将完全无入口处置。
- **选项**：
  - A（推荐）：tab 2 的行集改为「归档集合 ∩ 所选工作区的成员」**∪**「归档集合中不属于任何工作区的会话」，且后者只在选中伪选项「未匹配工作区的归档」时显示（把 R3 的伪选项语义从「已迁移」扩展到「已归档」）。
  - B：保持现状（tab 2 严格按工作区），孤儿会话不提供入口，写进 README 已知限制。
  - C：给管理器加第四个 tab「孤儿归档」——入口更清楚，但与「三 tab」的拍板冲突，且与伪选项功能重叠。
- **推荐**：A。改动面极小（`archivedRows()` 加一个「或不属于任何工作区」的谓词 + 伪选项在多一个 tab 下生效 + 2 条测试），且不新增 tab、不推翻 Q2 的三 tab 结构。
- **影响面**：`session-manager-model.ts` 的 `archivedRows()` 谓词与 `workspaceChoices()` 可见性；`manager.empty.unassigned` 文案；`test/session-manager-model.test.ts` 与 `test/session-manager-dialog.test.tsx` 各 1~2 条用例。宿主管线零改动。

### 待决 P2 — 单批上限取 500 还是 1000，超限的交互形态？

- **问题**：上限直接决定「全选」在大会话量 profile 下的行为。当前设计取 500，全选超过 500 时只选前 500 并提示 `manager.truncated` 风格文案。
- **选项**：
  - A（推荐）：500；全选截断到 500 + 一行提示。超限时界面无法一次性覆盖全量，需分批：先处置这批 500，列表缩短后再全选剩余（README 写明该操作序列）。
  - B：1000；覆盖更多场景，但预览（串行 `measureFiles`）与执行时长翻倍。
  - C：无上限，靠「预览中」文案吸收等待——会回到 D13 否决的形态。
- **推荐**：A（500），并在 README 写明「超过 500 条请分批处置（按工作区/伪选项分开，或分批勾选）」。若用户的真实归档量已接近或超过 500，改 B 只需改 `MAX_BATCH_TARGETS` 一个常量与对应测试边界。
- **影响面**：`contract.ts` 的一个常量、`session-manager-model.ts` 的截断提示、`contract.test.ts` 的 500/501 边界用例、README 一段话。

### 待决 P3 — 恢复成功后，管理面停在哪个 tab？

- **问题**：恢复/删除完成后当前设计「停在原 tab 并显示结果面板」，用户关闭浮层时 side bar 已更新。另一种做法是自动切到「已归档」tab（让用户立刻看到刚恢复的会话），代价是结果面板与列表同时变化、用户可能以为条目「丢了」。
- **选项**：
  - A（推荐）：停在本 tab 显示结果，「关闭」退出；需要确认结果时切 tab 自己看。
  - B：完成后自动切到「已归档」并高亮/滚动到恢复的条目——需要跨 tab 定位与滚动实现，且与「结果面板」抢视线。
- **推荐**：A（实现面小、行为可预测）；B 留给后续独立打磨。
- **影响面**：仅 `SessionManagerDialog.tsx` 的 `done` 分支与 1 条组件测试；A 也是当前 ③.6 阶段机已写的形态。

---

## 落档期增补（第四轮分歧点提问后，用户裁定）

### 增补 1：tab 2「取消归档」批量操作（用户增补需求）

- **承载**：T1 同款例外——客户端循环上游 `ctx.workspaces.unarchiveSession(sessionId)`（registry 可逆操作、无文件动作），**逐项报告结果**；宿主端点与管线**零增量**（上游 unarchive 调用面已存在于 `dsh-api-workspace-controller` 的 `ClientWorkspaceModel`）。
- **UI**：tab 2 操作区并存两动作——「删除」（原设计：预览 + 模式单选 + 确认，Q3 整单拒绝）与「取消归档」（轻确认 + 逐项结果视图：成功 N / 失败 M + 原因，失败码走 `error.<code>` 查表）；两动作共享同一选择集合与 500 上限；任一动作在途时禁用另一动作与选择交互。
- **落点**：并入 G5（`session-manager-model.ts` 增 `unarchiveSelected` 派生与结果归集；`SessionManagerDialog.tsx` tab 2 操作区分支）、G6（locales 增 `manager.action.unarchive` / `manager.unarchive.*` 结果文案，键数 52 → 约 58，以实现期清单为准）、G5/G7 测试（model 层动作分派 + 组件层双动作互斥）。
- **spec 对应**：tab 2 的 Requirement 增「批量取消归档」Scenario（逐项结果、与删除共享选择集合）。

### 增补 2：P1/P2/P3 裁定入设计

- **P1=A**：`workspaceChoices()` 的 `'unassigned'` 伪选项语义扩展到 tab 2——该伪选项下 tab 2 列出不属于任何工作区的已归档会话（`archivedSessionIds - 各工作区 sessionIds 并集`），同样可删、可取消归档；tab 1 在伪选项下为空态（孤儿定义即无归属，未归档孤儿不存在——未归档会话必在 persistence，但可不在任何工作区成员位，此时它出现在侧栏「未分组」，不属于本伪选项管辖区，维持空态并文案说明）。
- **P2=A**：`MAX_BATCH_TARGETS = 500` 定案；全选超限截断到 500 + 提示文案；README 写「分批」操作序列。
- **P3=A**：恢复成功停在 tab 3 显示结果，不自动切换。
