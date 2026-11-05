# code-design.md — 统一「工作区配置」入口（代码级蓝图）

> 阶段 1.7 产物。输入：`line-a.md` / `line-b.md` / `diff-matrix.md`（其**第六节「最终决策清单」为已定结论**）。
> 本文不复述需求级论证、不重开收敛：只回答「改哪些文件、怎么改、接口与数据长什么样、为什么这么定」。
> 与已定结论冲突之处一律**上浮**（见「待决问题」），不在本文自行推翻。
>
> **路径约定**：`plugins/<name>/...` 相对根仓 `/home/xuqinqin/develop/person/dsh-plugins`；
> 上游路径以 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/<pkg>/...` 起头并标注**只读依赖**。
> 本仓内 `plugins/web-ux/node_modules/@deepseek-ai/...` 是逐包实装的 rc.5 副本（版本已核：`dsh-client-ui-slots` / `dsh-client-ui-renderer` 均 `0.2.1-rc.5`）。
>
> **事实基线**：上游 `0.2.1-rc.5`（`scripts/dsh-baseline.mjs:13`）；仓库统一版本 `1.5.0`；
> 仓内 pnpm `11.25.0`（`package.json:6`），dsh 容器内 pnpm `10.34.9`（profile 安装走容器）。
> 本文所有 `file:line` 为当前工作区实测行号；实施时若上游漂移，以符号名为准。

---

## ① 触达面清单

### 1.1 新建子包 `plugins/workspace-config`（包 `dsh-plugin-workspace-config`，**全新**）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| 1 | `package.json` **新建** | 新 bundle 的身份与双端声明 | `name: dsh-plugin-workspace-config`；`version` 恒等仓库统一版本；`main: lib/index.js`；`exports`：`.`→`lib/index.js`、`./client`→`{types:./lib/types/client/index.d.ts, default:./lib/client.js}`、`./src/*`、`./package.json`；`dsh.bundle.patch: ./cordis.patch.yml`；`dsh.engines.dsh` = 软插件派生范围（`dsh:check` 硬门）；`dsh.client.{platform:'web', inject:[…]}`（见 ③3.6）；`peerDependencies` 含 `@deepseek-ai/dsh`（SOFT_RANGE）+ `react`；`files` 必含 `lib/**/*.js` + `lib/**/*.d.ts` + `src` + `cordis.patch.yml` |
| 2 | `cordis.patch.yml` **新建** | 让 profile 的 bundle 层插入 loader 行 | `insert: - id: workspace-config / name: 'dsh-plugin-workspace-config'`（**裸包名**，client-module scan 只认这一形态，照 mrfw `cordis.patch.yml` 尾行与 web-ux 同名行） |
| 3 | `build.mjs` **新建** | 双产：宿主 no-op ESM + 浏览器 CJS 工厂 | 照 `plugins/web-ux/build.mjs:107-155`：`buildHostCarrier()`（`external:['node:*']`）+ `buildClient()`（`format:'cjs'`、`window.__ModuleLoader__.load({id, factory})` 壳、CSS modules 内联插件）。**新增一步**：`build:types` 走 `tsc`（见 #4），`build` 脚本 = `pnpm run build:types && node build.mjs` |
| 4 | `tsconfig.json` / `tsconfig.base.json` / `tsconfig.client.json` / `tsconfig.host.json` **新建** | 类型权威 + 可发射 d.ts | base 照 `plugins/web-ux/tsconfig.base.json`；`tsconfig.client.json` 必须 `declaration:true` + `emitDeclarationOnly:true` + `rootDir:src` + `outDir:lib/types`（照 `plugins/multi-root-workspace/tsconfig.client.json:1-30`），因为它要**给三个贡献方提供类型**（`noEmit` 的 base 会挡住 `exports.types`） |
| 5 | `src/index.ts` **新建** | 宿主半：bundle 行锚点（no-op） | 照 `plugins/multi-root-workspace/src/index.ts:112`：`export const inject: string[] = []` + `export function apply(): void {}`；文件头写清「本行存在只为让 Web client-module scan 读到 `dsh.client`，无任何宿主职责」 |
| 6 | `src/client/contract.ts` **新建** | **座位契约的唯一权威** | `declare module '@deepseek-ai/dsh-client-ui-slots'` 增补 `workspace-config.section`（`kind:'list'`/`scope:'root'`/`owner: WorkspaceConfigSectionOwnerProps`）；导出 `WorkspaceConfigSectionOwnerProps`、`WorkspaceConfigSectionSeat`（字面量类型）、`WORKSPACE_CONFIG_SECTION` / `WORKSPACE_CONFIG_TRIGGER_ORDER` / `WORKSPACE_CONFIG_DIALOG_ORDER` 常量。**零 React / 零上游运行时 import**（只 `import type`），保证贡献方 `import type` 时类型图极小 |
| 7 | `src/client/open-store.ts` **新建** | 入口 → 弹窗的跨 entry 打开桥 | 照 `plugins/web-ux/src/client/session-manager-store.ts:58-88` 的极简可订阅快照，但载荷是 **boolean**（见 D15）：`{ getSnapshot(): boolean; subscribe(fn); open(); close() }` |
| 8 | `src/client/WorkspaceConfigTrigger.tsx` **新建** | footer 唯一入口 | 读 owner `wide`；宽态 `flex:1 1 auto; min-width:0` + 图标 + 文案（`text-overflow:ellipsis`），折叠态 28px 方形图标；`aria-label` 两态恒在、`aria-haspopup="dialog"`、`aria-expanded` 绑 store；**禁 `flex:none` / 禁 `width:calc(100% + 4px)`**（D6） |
| 9 | `src/client/WorkspaceConfigDialog.tsx` **新建** | 统一弹窗壳 + 分节座位声明 + nav | `Modal headless` + 自绘 header（标题 + 关闭按钮）、左 nav（`entriesOf` 派生）+ 右内容列（`renderSlot(SECTION, { close }, { only: activeId })`）、空态；`useSyncExternalStore` 双订阅（open store + sections source） |
| 10 | `src/client/sections.ts` **新建** | nav 行投影（`id/order/label`） | `ctx.slots.getVersion(SECTION)` + `ctx.locale.getSnapshot().revision` 双版本记忆，`ctx.slots.entries(SECTION)` 投影 + 本地 label thunk 解析 + 按 `order` 稳定排序（D2） |
| 11 | `src/client/dialog.module.css` **新建** | 弹窗与 trigger 样式 | 宽度 `min(760px, 100%)`、`max-height:100%`、内容列 `overflow-y:auto`；颜色全走 `var(--dsw-alias-*, 兜底)`（仓内既有纪律） |
| 12 | `src/client/locales.ts` **新建** | holder 双语文案 | 7 键（见 ③3.5），zh 为 canonical、en 同键镜像 |
| 13 | `src/client/index.ts` **新建** | 客户端装配 | `locale.register` → 建 open store / sections source → `slots.inject('sidebar.footer.action')` 注册 trigger（order 50）→ `slots.inject('shell.overlay')` 注册 dialog（order 530，**带 `children` 声明**）；两处各自 `try/catch` + `ctx.logger?.warn` |
| 14 | `src/css-modules.d.ts` **新建** | CSS modules 类型 | 照 `plugins/web-ux/src/css-modules.d.ts` |
| 15 | `test/trigger.test.tsx` **新建** | 入口两形态与 store | 宽/窄渲染、`aria-label` 恒在、点击 `open()` 各一次、无 `flex:none` 类断言（按类名） |
| 16 | `test/dialog.test.tsx` **新建** | 弹窗壳与 nav | 空态、nav 顺序=order、`only` 只渲染选中、`aria-current`、关闭 → `close()` |
| 17 | `test/sections.test.ts` **新建** | nav 行投影 | label 为字符串 / thunk 两态、locale revision 变化后重读、order 稳定排序、无 `id` 的行被丢弃 |
| 18 | `test/section-seat.poc.test.tsx` **新建** | **运行时 PoC**（G3） | 用**真** `dsh-client-ui-renderer` + `Context` 在 jsdom 里证明 children 声明 / `only` 过滤 / label 投影 / **后装补跑**；见 ⑤G3 |
| 19 | `test/bundle.test.ts` **新建** | 产物形状 | 照 `plugins/web-ux/test/bundle.test.ts`：client 只 require `[primitives, react, react/jsx-runtime]`、含 `workspace-config.section` 与两座位名；宿主产物只含 `node:*` |
| 20 | `test/stubs/ui-primitives.tsx` + `vitest.config.ts` + `.oxlintrc.json` **新建** | 测试基建 | stub 照 `plugins/web-ux/test/stubs/ui-primitives.tsx`（补 `Modal` headless 分支、`Button`、`IconCloseOutlineRegular`、`IconWorkspaceTreeOutlineRegular`）；vitest 配置照 `plugins/web-ux/vitest.config.ts` |
| 21 | `README.md` + `artifacts/workspace-config-smoke.md` **新建** | 文档与验收留档 | README zh 单语（同 web-ux / stt 惯例）；冒烟记录照 `plugins/web-ux/artifacts/session-manager-smoke.md` 格式 |

### 1.2 根仓（`dsh-plugins` 根）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| 22 | `pnpm-lock.yaml` | 接入新包与三条 workspace devDep | `pnpm install` 生成；只新增 workspace link 与已在锁内的 rc.5 解析，不得引入新上游版本（`dsh:check` 第 5/6 项会红） |
| 23 | `README.md:71-82` | 插件一览加一行 | 新行插在 `dsh-plugin-web-ux` 之前，写清「统一工作区配置入口（holder）：footer 单入口 + 分节弹窗，零业务逻辑」；同时在「装入 profile」段补**四包同装**一句 |
| 24 | `openspec/changes/2026-11-05-unify-workspace-config-entry/` **新建** | 四件套落档 | `proposal.md` / `design.md` / `tasks.md` / `specs/dsh-workspace-config-entry/spec.md`（+ 可选 `decisions.md`）；`openspec validate --all` 通过 |

**不动**：`pnpm-workspace.yaml`（`packages: plugins/*` 已覆盖，`allowBuilds` 无原生依赖新增）、`scripts/dsh-baseline.mjs`、`scripts/release.mjs`（`plugins/*` 动态枚举，见 `scripts/release.mjs:110`）、`scripts/check-dsh-baseline.mjs`（逐包动态发现）。

### 1.3 子包 `plugins/multi-root-workspace`（fork：文档改动是硬门）

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| 25 | `src/client/index.ts` | 删 footer 注册、改注册分节 | 删 `87-107`（`ctx.slots.inject('sidebar.footer.action', …)` 整块）；`SLOT_ID`（`:43`）继续服务 Files tab 注册（`:109-111` 保留不动）；新增分节注册（`order: 10`，`label: () => t('section.label')`）；模块头注释（`:4`）与 `declare module` 块（`:32-40`）同步：新增 `import type {} from 'dsh-plugin-workspace-config/client'` |
| 26 | `src/client/WorkspaceFoldersAction.tsx` | Dialog 正文剥壳为分节组件 | 删 `152-176`（`WorkspaceFoldersAction` 触发按钮 + open state）；`WorkspaceFoldersDialog` 改名/导出为 `WorkspaceFoldersSection`，删 `398-424`（`.mrfw-overlay`/`.mrfw-mask`/`role="dialog"`/header/close）与 `231-263`（自管 Escape/Tab 焦点陷阱）、`217,233`（`dialogRef`/focus effect）；保留 body（`425-565`）与行内动作条（`566-591`）；`props.onClose` 随 header/close 按钮一起删除（本组件无整窗跳转流程，座位 owner 的 `close` 不使用，仅由类型提供） |
| 27 | `src/client/styles.ts` | 样式族裁剪 | 删 footer 触发族 `.mrfw-triggerRow`/`.mrfw-railRow`/`.mrfw-trigger`/`.mrfw-triggerRail`/`.mrfw-triggerIcon`/`.mrfw-triggerLabel`（`:20-32,34-57,62-71,72-82`）与自绘弹窗壳 `.mrfw-overlay`/`.mrfw-mask`/`.mrfw-dialog`/`.mrfw-header`/`.mrfw-title`/`.mrfw-close`（`:83-152`）；保留 `.mrfw-body`（`:153`）起的正文样式族与 `.mrfw-btn*`（Files tab compact 复用）；新增 `.mrfw-sectionBody`。注：`mrfw-fileLauncher`（`WorkspaceFoldersAction.tsx:160`）**本来就没有样式规则**（纯语义 wrapper），不受影响 |
| 28 | `src/client/locales.ts` | 新键 | zh/en 各加 `section.label`（「工作区文件夹」/「Workspace folders」）；`panel.title` 仍被分节内标题复用则保留 |
| 29 | `package.json` | 类型依赖 | `devDependencies` 加 `"dsh-plugin-workspace-config": "workspace:*"`（D12）；peer/devDeps 其余不动（`compat:check` 只过滤 `@deepseek-ai/dsh*`，已核 `scripts/check-dsh-compat.mjs:96-104`） |
| 30 | `tests/client-panel.spec.tsx:154,239-242` | 断言迁移 | 「registers into the sidebar footer action」→「registers one `workspace-config.section` entry with a label thunk」；`:154` 的座位白名单改为 `['workspace-config.section','sidebar.right.tab.files.actions']` |
| 31 | `tests/client-bundle.spec.ts` | 产物断言 | 断言 `lib/client.js` 含 `workspace-config.section`、**不含** `sidebar.footer.action`、不含 `dsh-plugin-workspace-config`（无运行时依赖） |
| 32 | `AGENTS.md:105` | 不变量 5 措辞 | 「…and the `sidebar.footer.action` registration silently disappears」→ `workspace-config.section`（这是 fork 的十一条不变量之一，必须同步） |
| 33 | `README.md:223` / `README.en.md:223` + `docs/architecture/multi-root-workspace.md:228` + `docs/development/plugin-development-workflow.md:147,231` + `docs/reference/multi-root-workspace-research.md:308-311` | 文档同步 | 口径统一为「面板挂载点 = `workspace-config.section`（由 workspace-config 弹窗声明）；Files tab compact 入口与 `/workspace-folders` 保留」；research 文档里 rc.5 座位表属**历史取证**，只在表下补一行注记、不重写历史 |
| 34 | `docs/decisions/ADR-0013-workspace-config-section-mount.md` **新建** + `docs/decisions/ADR-0005-*.md:18,24` + `docs/decisions/README.md:24` + `README.en.md:24` + `docs/troubleshooting/client-bundle-not-in-boot-graph.md:5` | ADR 与索引 | 新 ADR 记录「挂载座位从 footer 迁到 workspace-config 分节」的决策与被否方案；ADR-0005 的两处只加一行「挂载座位已由 ADR-0013 取代（传输层结论不变）」 |
| 35 | `lib/` | 产物重建 | `pnpm --filter dsh-plugin-multi-root-workspace build` 后随仓库提交 |

### 1.4 子包 `plugins/session-tool-toggle`

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| 36 | `src/client/index.ts` | 删 footer 注册、改注册分节 | 删 `179-204`（⑤ 段）；模块头 `:20-23` 两座位描述改三处（header / 分节 / 无 footer）；删 `:58` 的 sidebar 类型 import（D13）；**新增** `const t = ctx.locale.bind(NS)`（现有 `apply` 未绑定翻译函数，label thunk 需要它，照 mrfw `index.ts:85`）；新增分节注册（`order: 20`）；`inject`（`:81`）保持 `['slots','locale']` |
| 37 | `src/client/WorkspaceEntry.tsx` | 拆出分节、删 footer 触发与 Modal | 保留 `useWorkspaceDefaults`（`:169-305`）**原样**；删 `WorkspaceFooterAction`（`:333-454`）中的 footer 按钮组（刷新/关闭，`:376-394`）与触发按钮 DOM（`:398-414`）、`Modal`（`:415-451`），新增导出 `WorkspaceDefaultsSection`：挂载即 `read()`（`:349-351` 的 effect 保留）、loading/failure 两态保留（`:424-451` 的正文分支），正文改为 `<WorkspaceDefaultsEditor variant="dialog" …>`（`:434-449` 原样）+ 外层 `<div className={css.workspaceBody}>`。丢弃这两个按钮的依据：编辑器 dialog 形态已自带刷新按钮（`WorkspaceDefaultsEditor.tsx:171-181`），关闭由统一弹窗提供 |
| 38 | `src/client/seats.ts` | 座位常量替换 | 删 `FOOTER_SEAT/FOOTER_ID/FOOTER_ORDER`（`:50-67` 中关于 footer 的三段）；加 `SECTION_SEAT`（字面量 `'workspace-config.section'` + 类型 `WorkspaceConfigSectionSeat` 断言）、`SECTION_ID = 'session-tool-toggle-workspace-defaults'`、`SECTION_ORDER = 20`；`:25` 的 sidebar 类型 import 删除，改 `import type {} from 'dsh-plugin-workspace-config/client'` |
| 39 | `src/client/panel.module.css` | 样式 | 删 `.workspaceEntry*`（`:390-420` 家族）；`.workspaceBody`（`:368-372`）保留 |
| 40 | `src/client/locales.ts` | 新键 | zh/en 各加 `section.label`（「工作区默认档」/「Workspace defaults」） |
| 41 | `package.json` | 依赖面 | `devDependencies` 加 holder（`workspace:*`）；**删** `@deepseek-ai/dsh-client-ui-sidebar`（`:65`）与 `dsh.client.inject` 中同名项（`:32`）（D13） |
| 42 | `test/client-index.test.ts:8-11,31-33,60-61,176-186,225-226` | 断言迁移 | footer 座位断言 → 分节座位断言；「先 header 后 footer」顺序断言 → 「先 header 后 section」；`:225` 的 `FOOTER_SEAT` 字面量断言改 `SECTION_SEAT` |
| 43 | `test/workspace-editor.test.tsx` | 新增用例 | 新增 `describe('WorkspaceDefaultsSection')`：无对话框根（不渲染 `role="dialog"`）、挂载即读一次、client 缺席渲染 `workspace.unavailable`、（复用既有 13 条 editor 用例） |
| 44 | `test/bundle.test.ts:51,66` | 产物断言 | 字面量白名单 `sidebar.footer.action` → `workspace-config.section`；加「不含 `dsh-plugin-workspace-config`」断言 |
| 45 | `test/panel.test.ts` / `test/panel-client.test.ts` | 不变 | 宿主半与 RPC 零改动，测试不动（回归证据） |
| 46 | `README.md` + `lib/` | 文档与产物 | 入口描述改「统一工作区配置弹窗 → 工作区默认档分节；会话头部入口与 `/tools` 不变」 |

### 1.5 子包 `plugins/web-ux`

| # | 文件 | 改动意图 | 关键改动点 |
|---|---|---|---|
| 47 | `src/client/index.ts` | 删两 entry、加一分节 | 删 `266-286`（footer trigger）与 `288-314`（manager overlay）；删常量 `107-115`（`MANAGER_TRIGGER_*` / `MANAGER_OVERLAY_*`）与 `:51` 的 sidebar 类型 import；删 `:264` 的 `const managerRequests = createManagerRequestStore()`；**新增** `const t = ctx.locale.bind(NS)`（label thunk 需要，照 mrfw `index.ts:85`）；新增分节注册（`order: 30`）；**保留** `216-235`（行菜单）与 `237-256`（删除弹窗 order 500）逐字不动；模块头 `:22-26` 的四特性描述改写 |
| 48 | `src/client/SessionManagerDialog.tsx` | 五阶段机剥壳为分节 | 删外壳 `SessionManagerDialog`（`395-441`）与 `requests`/`seq` key（`:404-439`）；`SessionManagerBody` 改名为导出 `SessionManagerSection`，props 由 `{requests, client, workspaces, sessions, t}` 改为 `{ client, workspaces, sessions, t, close }`（`close` 来自座位 owner，`:594-597` 的 `requests.settle()` → `close()`，`running` 阶段仍忽略）；`Modal`（`881` 开标签、`1107` 闭标签）删除，正文改为 `<div className={css.sectionBody}>`；`footer`（`:839-878`）移到正文末尾作行内动作条；`client === undefined` 分支从 `return null`（`:413`）改为渲染 `manager.unavailable` 空态（D9）；三 tab / 五阶段 / model 派生 / 软降级**逐字保留** |
| 49 | `src/client/session-manager-store.ts` | 删除 | 打开桥移交 holder（已定结论 7）；文件删除，`test/session-manager-dialog.test.tsx` 相应删「外壳与软降级」四条用例 |
| 50 | `src/client/SessionManagerTrigger.tsx` | 删除 | 入口由 holder 提供 |
| 51 | `src/client/session-manager.module.css` | 样式 | 删 `.trigger*`（触发按钮族，`session-manager.module.css:29-80`）；新增 `.sectionBody`（纵向 flex + `min-height:0`）与把 `.footer`/actions 行保留为行内动作条 |
| 52 | `src/client/locales.ts` | 新键 | zh/en 各加 `section.label`（「会话管理」/「Session manager」） |
| 53 | `package.json` | 依赖面 | `devDependencies` 加 holder（`workspace:*`）；删 `@deepseek-ai/dsh-client-ui-sidebar`（`:81`）与 `dsh.client.inject` 同名项（`:39`）（D13）；peer `react` 等不动 |
| 54 | `test/client-apply.test.ts:58,190-215,280-330` | 断言迁移 | `DECLARED_SLOTS` 去 `sidebar.footer.action`、加 `workspace-config.section`；`fake.log` 期望序列改为「… `register:shell.overlay`（删除弹窗）→ `register:workspace-config.section`」，entry 数 6→5；删 trigger/manager overlay 相关断言 |
| 55 | `test/session-manager-dialog.test.tsx:36-40,255-256,293-344` | 迁移到 section | 渲染入口改 `SessionManagerSection`（props 加 `close`，去掉 `requests`）；`:293-330` 四条外壳用例改为「section 在 client 缺席时渲染空态」「close() 被调用」 |
| 56 | `test/session-manager-trigger.test.tsx` | 删除 | 组件已不存在 |
| 57 | `test/bundle.test.ts:74` + `:107-112` | 产物断言 | `'sidebar.footer.action'` → `'workspace-config.section'`；加「不含 `dsh-plugin-workspace-config`」；宿主半纯度断言不动 |
| 58 | `README.md:7,213,221` + `lib/` | 文档与产物 | 入口章节改写为「统一工作区配置弹窗 → 会话管理分节」；软降级表删 footer 行、加「holder 缺席 → 会话管理无 GUI 入口（建议四包同装）」 |

### 1.6 有意不触达（附理由，防过度设计）

- **三个插件的宿主半**（`src/index.ts` / `src/host/` / `src/contract.ts` / `src/delete-session.ts` / `src/migrated.ts`）与三条 RPC 通道：迁的是挂载壳，不是业务；`/web-ux` 七端点、`/session-tool-toggle` 四端点、`/multi-root-workspace` 全部零改动（已定结论「三插件宿主半/RPC/落盘零变更」）。
- **上游任何包**：`sidebar.footer.action` 的布局、`shell.overlay` 的 click-through、`Modal` 的样式一律不改、不 fork。
- **`scripts/*` 与 `pnpm-workspace.yaml`**：动态枚举已覆盖新包（见 1.2「不动」）。
- **`openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog/`**：在途变更目录，不碰。
- **profile 安装状态**：验收时由用户重启 profile；本变更不改 profile 文件。
- **`dsh-pocket` 等第三方插件的 footer/shell.overlay 占用**：见 ⑥A7 与「待决问题 Q1」。

---

## ② 证据锚

### 2.1 本仓实测（每模块 ≥1 条）

| 模块 | 证据（file:line + 代码事实） |
|---|---|
| mrfw footer 注册 | `plugins/multi-root-workspace/src/client/index.ts:87-107`：`ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name:'sidebar.footer.action', id: SLOT_ID, order: 50, label: () => t('action.label'), locale: NS }, owner => …wide…))` |
| mrfw SLOT_ID 与 Files tab | `…/index.ts:43` `export const SLOT_ID = 'multi-root-folders'`；`:109-111` 保留的 `sidebar.right.tab.files.actions` 注册（`compact: true`） |
| mrfw 整行独占样式 | `plugins/multi-root-workspace/src/client/styles.ts:20-27`：`.mrfw-triggerRow{flex:none;…;width:calc(100% + 4px);margin:4px -2px}`；`:29-32` `.mrfw-railRow{width:36px}` |
| mrfw 自绘对话框壳 | `…/WorkspaceFoldersAction.tsx:398-424`（`.mrfw-overlay`/`.mrfw-mask`/`role="dialog"`/header/close）；`231-263` 自管 Escape + Tab 循环；`566-591` 行内动作条（剥壳后原样保留） |
| mrfw 风格令牌纪律 | `…/styles.ts:1-10` 注释：类前缀 `mrfw-`、颜色只走 `--dsw-*` token |
| mrfw 文档门禁 | `plugins/multi-root-workspace/package.json:77` `"docs:check": "node scripts/check-docs.mjs"`；`AGENTS.md:105` 不变量 5 明写 `sidebar.footer.action` |
| stt footer 注册 | `plugins/session-tool-toggle/src/client/index.ts:179-204`（⑤ 段，`FOOTER_SEAT/FOOTER_ID/FOOTER_ORDER` + `inject: () => ({resolveClient, currentSessionId})`）；`seats.ts:50-67` 三常量 |
| stt 入口组件与对话框 | `…/WorkspaceEntry.tsx:333-454`：`Modal footer`（刷新/关闭按钮）`:376-394`、触发按钮 DOM `:398-414`、`Modal` `:415-451` |
| stt 编辑器双形态 | `…/WorkspaceDefaultsEditor.tsx:42` `export type WorkspaceDefaultsVariant = 'section' \| 'dialog'`；`:150-182` 仅 dialog 渲染工作区下拉；`:285-288` 返回 `<div className={css.workspaceBody}>` 或 `<section>`（**正文不含 `role="dialog"`**） |
| stt 状态机可脱离壳复用 | `…/WorkspaceEntry.tsx:169-305` `useWorkspaceDefaults`（不碰 DOM）；`:169-172` 注入面骑 ref |
| stt 共用状态纪律 | `plugins/session-tool-toggle/src/client/index.ts:4-9` 模块头：panel 与 `/tools` 共用同一宿主状态；`:143-156` `resolveClient` 每次现取 `connection` |
| web-ux footer + overlay | `plugins/web-ux/src/client/index.ts:266-286`（trigger）与 `288-314`（overlay）；常量 `107-115`（`MANAGER_TRIGGER_ORDER = 100` / `MANAGER_OVERLAY_ORDER = 520`） |
| web-ux 保留面 | `…/index.ts:216-235`（行菜单 order 500）、`:237-256`（删除弹窗 order 500）；`:112` 注释确认 500/520「互斥不叠放」 |
| web-ux 五阶段机 | `…/SessionManagerDialog.tsx:139` `ManagerPhase`；`:395-441` 外壳（`request === null → null`、`client === undefined → null`、`unavailable` Modal）；`:465` `SessionManagerBody`；`:594-597` `close()`（running 忽略）；`:839-878` footer；`:881-1107` Modal |
| web-ux 打开桥 | `…/session-manager-store.ts:20-52` 契约、`:58-88` 实现（seq/identity，uSES 直喂） |
| web-ux 触发按钮 | `…/SessionManagerTrigger.tsx:35-48` inject/props、`:55-79` 渲染（`aria-label` 恒在、`ready=false → null`） |
| web-ux 构建骨架 | `plugins/web-ux/build.mjs:35-44` `CLIENT_EXTERNALS`、`:107-119` 宿主 ESM、`:121-155` 客户端 CJS + loader 壳 |
| web-ux bundle 断言范式 | `plugins/web-ux/test/bundle.test.ts:74`（`sidebar.footer.action` 标记）、`:107-112`（宿主半「除 `node:*` 外零依赖」） |
| 仓级基线门禁 | `scripts/check-dsh-baseline.mjs:170`（每包必须有 DSH devDep pin）、`:184`（`dsh.engines.dsh` 必须 = 软范围）、`:187`（必须声明 `@deepseek-ai/dsh` peer） |
| 发布动态枚举 | `scripts/release.mjs:110` `readdirSync(join(REPO_ROOT,'plugins'))` —— 新目录无需改名单 |
| 根 README 清单 | `README.md:71` 「## 插件一览」 |

### 2.2 上游（**只读依赖**，本设计依赖的事实）

| 事实 | 证据 |
|---|---|
| footer 座位形状 | `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts:83-87`（`'sidebar.footer.action': {kind:'list'; scope:'root'; owner: SidebarFooterActionOwnerProps}`） |
| footer 容器结构 | 宿主 `dsh-client-ui-sidebar/lib/client.js`：`.footArea{flex-direction:column}` 下 `.footerActions`（`renderSlot('sidebar.footer.action',{wide})`）与 `.settingsArea`（settings）**是两个 div**；`.footerActions{display:flex}`、collapsed 时 `justify-content:center;width:auto`；`.hHd-Xa_root{--dsh-sidebar-inline-padding:12px;padding:6px 12px}` → 折叠轨内容宽 = 56−24 = **32px** |
| 官方 `settings.section` 契约 | `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`：`kind:'list'`/`scope:'root'`/owner `{ close(): void }`；注释明写 `id` drives `only` filtering、`label` 由注册方本地化、section 渲染在内容列 |
| 官方壳的 nav 实现（黄金先例） | `dsh-client-ui-settings-general/lib/client.js`：`ctx.slots.register({ name:'sidebar.settings', store, children:{'settings.section':{kind:'list',scope:'root'}, …}, inject: shellInjected }, SettingsRoot)`；nav 行 = `ctx.slots.entries('settings.section')` 映射 `{id, order, label: resolveSlotLabel(e.options.label)}` 并按 order 排序；渲染 `renderSlot('settings.section', { close: onClose }, { only: active })`；nav 单元格用 `aria-current` + `data-modal-autofocus` |
| children/only 类型面 | `plugins/web-ux/node_modules/@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts:162-166`（`ChildrenDecl`，「Declaring is claiming」）、`:229-232`（`RenderOpts.only`）、`:317-326`（`PropsRenderSlots` 收窄）、`:559`（`SlotLabel = string \| (() => string)`，注释明写 thunk 每次读取）、`:793/806`（`register` 两重载收 `children`） |
| 座位读取面 | 同包 `:825` `entries(key)`、`:652` `resolveSlotLabel`；`dsh-client-ui-renderer/lib/types/client/registry.d.ts:97-111`（`inject` 声明已存在即同步执行 / 否则声明提交后补跑 / 折叠时摘除）、`:174` `entriesOfSlot`、`:205/211` `subscribe`/`getVersion` |
| `shell.overlay` 形状 | `dsh-client-ui-layout/lib/types/client/index.d.ts:95-104`（`kind:'list'`/`scope:'root'`/**无 owner**；注释：层本身 click-through，占用者自行 opt-in pointer events） |
| `shell.overlay` 容器 | 宿主 `dsh-client-ui-layout/lib/client.js`：`.pI_x6G_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}` + `>*{pointer-events:auto}`；`renderSlot('shell.overlay', {})` |
| `Modal` 形状 | `plugins/web-ux/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/Modal.d.ts`：`{open,onClose,title,closeLabel,description,children,footer,className,contentClassName,headless}`，**`headless:true` 时 `closeLabel?: never`**；实现里 `headless` 只跳过默认 header/body 外壳，mask/卡片/Escape/`aria-label` 保留（`lib/index.js` 的 `function Modal`） |
| `Modal` 默认几何 | `plugins/web-ux/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Modal.module.css`：`.root{fixed;inset:0;z-index:1000;pointer-events:auto}`、`.dialog{width:min(380px,100%);gap:20px;padding:0 0 24px;overflow:hidden}` → 两列弹窗必须用 `className` 覆盖宽度、`headless` 接管内部 |
| Menu portal 层级 | 同包 `lib/Menu.module.css:42-45`（`.portal{position:fixed;z-index:1100}`）> Modal 1000 → A13 结论在新壳内同构 |
| 图标 | 同包 `lib/types/icons/index.d.ts` 提供 `IconWorkspaceTreeOutlineRegular`（stt 现用）、`IconSettingsOutlineRegular`（官方 gear 用 `…Medium`）、`IconCloseOutlineRegular` |
| 座位名不可运行时依赖 | `dsh-client-ui-slots` 的 `exports` 只有 `.`/`./src/*`/`./package.json`，**没有 `./client`** → 浏览器 bundle `require('@deepseek-ai/dsh-client-ui-slots')` 会命中 loader 的「missed the module table」硬错（`dsh-client-modules/lib/client.js:833-840`）；实测现存三个 client 产物（mrfw / stt / web-ux 的 `lib/client.js`）的 `require()` 词表**完全相同且只有三个词**：`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` —— 这同时钉住新包的 `CLIENT_EXTERNALS` 基线 |

### 2.3 新建文件的范式证据（照哪份现有写法）

| 新建物 | 照抄来源 |
|---|---|
| 双端 `build.mjs` | `plugins/web-ux/build.mjs`（全文骨架） |
| `cordis.patch.yml` 裸包名行 | `plugins/session-tool-toggle/cordis.patch.yml`（最短样例） |
| 宿主 no-op 载体 | `plugins/multi-root-workspace/src/index.ts:112` |
| 打开桥 store | `plugins/web-ux/src/client/session-manager-store.ts` |
| 软注册 + try/catch | `plugins/session-tool-toggle/src/client/index.ts:159-204` |
| 分节 nav 投影 | `dsh-client-ui-settings-general/lib/client.js` 的 `shellInjected().hooks.sections` |
| 测试桩 | `plugins/web-ux/test/stubs/ui-primitives.tsx` + `vitest.config.ts` |
| d.ts 发射 | `plugins/multi-root-workspace/tsconfig.client.json` |

---

## ③ 接口与数据形状

### 3.1 holder 对贡献方暴露的座位契约（`plugins/workspace-config/src/client/contract.ts`）

```ts
// 座位名：唯一权威在这里；贡献方以「类型断言 + 本地字面量」持有（D3），
// 不 import 本模块的运行时常量（避免把 holder 打进贡献方 bundle）。
export const WORKSPACE_CONFIG_SECTION = 'workspace-config.section' as const

/** 贡献方本地常量必须赋给这个类型，写错字面量即 typecheck 失败。 */
export type WorkspaceConfigSectionSeat = 'workspace-config.section'

/** 座位 owner 份额：与官方 settings.section 同构（只有 close）。 */
export interface WorkspaceConfigSectionOwnerProps {
  /** 关闭统一弹窗（弹窗开合由 holder 拥有）。 */
  close: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workspace-config.section': {
      kind: 'list'
      scope: 'root'
      owner: WorkspaceConfigSectionOwnerProps
    }
  }
}

/** 入口/弹窗 entry 的顺序（供贡献方文档与 holder 内部共用）。 */
export const WORKSPACE_CONFIG_TRIGGER_ORDER = 50
export const WORKSPACE_CONFIG_DIALOG_ORDER = 530
```

贡献方拿到类型的**唯一**方式（三个包一致）：

```ts
// <pkg>/src/client/<seats 或 index>.ts
import type {} from 'dsh-plugin-workspace-config/client'            // ① 取得 SlotMap 增补
import type { WorkspaceConfigSectionSeat } from 'dsh-plugin-workspace-config/client' // ② 取得字面量类型
const SECTION_SEAT: WorkspaceConfigSectionSeat = 'workspace-config.section'          // ③ 本地值
```

三条纪律（均有断言守护，见 ⑤G5/G6）：
1. 只允许 `import type`（`verbatimModuleSyntax` 下零产物；贡献方 bundle 断言「不含 `dsh-plugin-workspace-config`」）；
2. **不把** `dsh-plugin-workspace-config` 写进贡献方的 `dsh.client.inject`（那会变成对 holder 的运行时加载依赖 = 硬依赖，与已定结论「避免互相 hard-dep」冲突）；
3. 座位字面量在每个包**各自持有一份**，由类型断言而不是共享常量保证一致（stt D16「两端各持一份」同款纪律）。

### 3.2 贡献方注册面（三个包同一形状）

```ts
ctx.slots.inject(SECTION_SEAT, () => {
  try {
    return ctx.slots.register(
      {
        name: SECTION_SEAT,
        id: SECTION_ID,              // mrfw 'multi-root-folders' / stt 'session-tool-toggle-workspace-defaults' / web-ux 'web-ux-session-manager'
        order: SECTION_ORDER,        // 10 / 20 / 30
        label: () => t('section.label'),   // thunk：locale 切换无需重注册（上游 SlotLabel 语义）
        locale: NS,                  // 各自命名空间
        inject: (): SectionInjected => ({ … }),   // 各自业务份额，见 3.4
      },
      SectionComponent,
    )
  } catch (error) {
    ctx.logger?.warn('<pkg>: 工作区配置分节座位注册失败，本节不显示', error)
    return () => {}
  }
})
```

> 三个 `SECTION_ID` 沿用**被删除的旧 entry id**（mrfw `multi-root-folders`（今日已同时用于 footer 与 Files tab 两个座位，`index.ts:43,88,110`）、stt `session-tool-toggle-workspace-defaults`、web-ux `web-ux-session-manager`）：id 只在座位内唯一，跨座位无冲突；沿用旧 id 让日志、断言与排障话术保持连续。

### 3.3 holder 内部面

```ts
// open-store.ts
export interface WorkspaceConfigOpenStore {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
  open(): void
  close(): void
}

// sections.ts（nav 行投影；getSnapshot 必须返回身份稳定的数组）
export interface WorkspaceConfigSectionRow {
  readonly id: string
  readonly order: number
  readonly label: string
}
export interface WorkspaceConfigSectionsSource {
  getSnapshot(): readonly WorkspaceConfigSectionRow[]
  subscribe(listener: () => void): () => void
}
export function createSectionsSource(ctx: ClientContext): WorkspaceConfigSectionsSource

// WorkspaceConfigTrigger.tsx
export interface WorkspaceConfigTriggerInjected { readonly open: WorkspaceConfigOpenStore }
export type WorkspaceConfigTriggerProps =
  SidebarFooterActionOwnerProps          // { wide: boolean }
  & PropsLocale<typeof NS>
  & WorkspaceConfigTriggerInjected

// WorkspaceConfigDialog.tsx
export interface WorkspaceConfigDialogInjected {
  readonly open: WorkspaceConfigOpenStore
  readonly sections: WorkspaceConfigSectionsSource
}
export type WorkspaceConfigDialogProps =
  PropsRuntime<'shell.overlay'>           // = {}（该座位无 owner）
  & PropsRenderSlots<'workspace-config.section'>
  & PropsLocale<typeof NS>
  & WorkspaceConfigDialogInjected
export function WorkspaceConfigDialog(props: WorkspaceConfigDialogProps): ReactNode
```

装配（`src/client/index.ts`）：

```ts
export const inject = ['slots', 'locale']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-config: dictionaries')
  const open = createOpenStore()
  const sections = createSectionsSource(ctx)

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: TRIGGER_ID, order: 50, locale: NS,
    inject: () => ({ open }),
  }, WorkspaceConfigTrigger))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: DIALOG_ID, order: 530, locale: NS,
    children: { 'workspace-config.section': { kind: 'list', scope: 'root' } },  // 声明 + 渲染授权
    inject: () => ({ open, sections }),
  }, WorkspaceConfigDialog))
}
```

弹窗壳结构（`headless`，自绘 chrome）：

```
<Modal open onClose={open.close} title={t('dialog.title')} headless className={css.card}>
  <div className={css.header}>  <h2>{t('dialog.title')}</h2>  <button aria-label={t('dialog.close')} /> </div>
  <div className={css.layout}>  // flex row, min-height:0
    <nav className={css.nav} aria-label={t('nav.label')}>
      {rows.map(row => <button aria-current={row.id===activeId?'true':undefined}
                               data-modal-autofocus={row.id===activeId?'':undefined}
                               onClick={() => setSelected(row.id)}>{row.label}</button>)}
    </nav>
    <div className={css.panel}>   // overflow-y:auto, min-height:0
      {activeId === undefined
        ? <div className={css.empty} role="status"><p>{t('dialog.empty.title')}</p><p>{t('dialog.empty.hint')}</p></div>
        : renderSlot(WORKSPACE_CONFIG_SECTION, { close: open.close }, { only: activeId })}
    </div>
  </div>
</Modal>
```

两条壳级约束（写进组件注释，防止实施时误解）：

- **关闭态渲染 `null`**：`shell.overlay` 的直系子元素被宿主设为 `pointer-events:auto`（`.pI_x6G_overlayLayer>*{pointer-events:auto}`），所以关闭时必须整颗不渲染，否则一层不可见空 div 会吃掉页面点击。
- **不自行 `try/catch` 包裹 `renderSlot`**：React 渲染期抛错发生在调用之后，包在这里拦不住；分节崩溃由框架的 entry 错误监督面接管（`dsh-client-ui-renderer/lib/types/client/registry.d.ts:181-192` `onEntryError`，带「是否已退场」信息），holder 侧不重复实现。

`activeId` 派生（`selected` 为本地 state，跨开合保留）：

```ts
const activeId = rows.some(r => r.id === selected) ? selected : rows[0]?.id
```

### 3.4 三个分节迁移后的 props 形状

| 分节 | 迁移前（entry props） | 迁移后（section props） | inject face（注册方给） |
|---|---|---|---|
| Folders（mrfw） | `{wide?, compact?, panel, pickDirectory, sessionId?, t}` 的 `WorkspaceFoldersAction` | `close`（owner）+ `t` + `{ panel, pickDirectory, sessionId? }` | `{ panel, pickDirectory, sessionId }`（沿用 `index.ts:73-84` 的现取口径） |
| 工作区默认档（stt） | `WorkspaceFooterActionProps{wide?, resolveClient, currentSessionId, t}` | `close` + `t` + `{ resolveClient, currentSessionId }` | 同 `index.ts:142-156` 的 `ports.resolveClient` + `currentSessionIdOf(ctx)` |
| 会话管理（web-ux） | `SessionManagerDialogProps{requests, client, workspaces, sessions, t}` | `close` + `t` + `{ client, workspaces, sessions }` | 同 `index.ts:296-306`（`client` 渲染期现取；`workspaces`/`sessions` 软读） |

`close` 的实际用途：mrfw 不需要；stt 不需要（关闭统一由弹窗提供）；web-ux 的「关闭」按钮（`SessionManagerDialog.tsx:870-876`）改调它。

### 3.5 文案键清单

holder `NS = 'workspaceConfig'`（7 键，zh canonical / en 镜像）：

| key | zh | en |
|---|---|---|
| `entry.label` | 工作区配置 | Workspace settings |
| `dialog.title` | 工作区配置 | Workspace settings |
| `dialog.close` | 关闭 | Close |
| `nav.label` | 配置分节 | Settings sections |
| `dialog.empty.title` | 暂无可配置的分节 | No settings sections |
| `dialog.empty.hint` | 安装 multi-root-workspace、session-tool-toggle 或 web-ux 后，对应分节会出现在这里。 | Install multi-root-workspace, session-tool-toggle or web-ux and its section will appear here. |
| `dialog.loading`（可选，预留） | 正在载入… | Loading… |

三个贡献方各 +1 键（各自 NS，zh/en）：`section.label` = 「工作区文件夹 / Workspace folders」、「工作区默认档 / Workspace defaults」、「会话管理 / Session manager」。各自的 locale-parity 测试按既有方式扩。

### 3.6 声明面变更清单

| 包 | `dsh.client.inject` | devDependencies | 其它 |
|---|---|---|---|
| workspace-config（新） | `+ @deepseek-ai/dsh-client-ui-renderer`（提供 `slots`）、`+ @deepseek-ai/dsh-client-locale`、`+ @deepseek-ai/dsh-client-ui-sidebar`（footer 座位声明方）、`+ @deepseek-ai/dsh-client-ui-layout`（`shell.overlay` 声明方）——**不含** primitives（loader 模块表词） | 全套软插件同款（`@deepseek-ai/dsh` / cordis `4.0.5` / primitives / renderer / slots / locale / sidebar / layout / react / react-dom / typescript / vitest / jsdom / @testing-library/react / esbuild / oxlint），全部 pin `0.2.1-rc.5`；`dsh:check` 的三条硬要求：≥1 个 `@deepseek-ai/dsh-*` 的 devDep pin = 基线（`scripts/check-dsh-baseline.mjs:170`）、cordis devDep 全仓唯一 `4.0.5`、`@deepseek-ai/dsh` peer = 软范围（`scripts/check-dsh-baseline.mjs:187`） | `dsh.engines.dsh` = `>=0.2.1-rc.5 <0.3.0`；`peerDependencies` 含 `@deepseek-ai/dsh` 与 `react` |
| multi-root-workspace | 不变 | `+ dsh-plugin-workspace-config: workspace:*` | 无 |
| session-tool-toggle | `− @deepseek-ai/dsh-client-ui-sidebar` | `+ holder: workspace:*`、`− @deepseek-ai/dsh-client-ui-sidebar` | 无 |
| web-ux | `− @deepseek-ai/dsh-client-ui-sidebar` | `+ holder: workspace:*`、`− @deepseek-ai/dsh-client-ui-sidebar` | 无 |

### 3.7 明确保持不变

`/web-ux` 七端点与失败码、`/session-tool-toggle` 四端点、`/multi-root-workspace` 端点与 `RootsView` 形状、`workspaces.json` / `defaults.json` 落盘格式与键、**四包的 `Config` schema（holder 不新增任何配置键、`cordis.patch.yml` 不带 `config:` 段——已定结论 2「不做配置开关」）**、`workspace-config.section` 之外的全部已有座位注册（mrfw Files tab order 50、stt header order 20、web-ux 行菜单 500 与删除弹窗 500）、`ModuleLoader` 包身份与 `cordis.patch.yml` 已有行。

---

## ④ 决策记录

### 4.1 栈识别结论（必须留档）

| 项 | 结论 |
|---|---|
| 技术栈 | **TypeScript + React 18 + esbuild（web-ux/stt 的 `build.mjs`）+ tsdown（mrfw）+ vitest + pnpm workspace + cordis 插件包**；本变更新增一个同栈子包 |
| 证据 | 仓根 `pnpm-workspace.yaml:6-7`（`packages: plugins/*`）、`package.json:6`（`pnpm@11.25.0`）、`package.json:20-23`（release / dsh:check / verify 脚本）；`plugins/web-ux/build.mjs:30`（`import { build } from 'esbuild'`）；`plugins/web-ux/vitest.config.ts:29-30`（vitest 的 include 与环境）；`plugins/multi-root-workspace/tsdown.config.ts:1-20`；`plugins/*/package.json` 的 `dsh.bundle.patch` |
| Spring | **未命中**：无 `pom.xml` / `build.gradle` / `mvnw` / `src/main/java` |
| Nuxt | **未命中**：无 `nuxt.config.*` / `app.vue` / `pages/`；前端构建面是 esbuild/tsdown 手写脚本，不是 Nuxt |
| writer skill | **豁免（仅本次有效，用户已批准）**：无 Spring / Nuxt 代码生成面 |
| 设计约束来源 | 仓根 `AGENTS.md`（产物 zh-CN、`lib/` 随仓库提交、递归 build/typecheck/test/lint、OpenSpec 流程）+ 各插件既有惯例（软注册、`--dsw-*` token、bundle 断言、`docs:check`） |

### 4.2 决策表

> 每条含「被否方案 + 理由 + 反例」。反例 = 如果按被否方案做，会具体坏在哪。
> 已定结论（diff-matrix 第六节）不在此重开，只在其下落实现细节。

| ID | 决策 | 被否方案与理由 | 反例 |
|---|---|---|---|
| D1 | 统一弹窗用 `Modal headless:true` + 自绘 header/nav/内容列 | ①**非 headless + `className` 加宽**：`Modal` 的 `.body` 是「子节点自动高度」的 flex 子项（`Modal.module.css` 的 `.dialog{gap:20px;overflow:hidden}` / `.body{margin-top:20px}`），要让内容列内部滚动必须让 `.body{flex:1;min-height:0}`，而它是宿主哈希类名、只能靠 `contentClassName`（作用在 `.content` 包裹层，会把 header 一起滚）；②**连 `Modal` 都不用、自绘 overlay**：回到 mrfw 现状（`WorkspaceFoldersAction.tsx:398-424`），焦点陷阱/Escape 层级/return focus 全部自管，正是本次要消灭的重复 | 三节内容高度差极大（Folders 长列表 / 默认档编辑器 / 会话管理三 tab）；非 headless 下打开「会话管理」，内容列溢出被 `.dialog{overflow:hidden}` 裁掉且无法滚动，用户看不到底部动作条——正是 R5 那类「做了仍不可用」 |
| D2 | nav label 用**本地 2 行解析**（`typeof label === 'function' ? label() : label`），不 import 上游 `resolveSlotLabel` | 「照官方壳 import `resolveSlotLabel` 并把它加进 `CLIENT_EXTERNALS`」：`@deepseek-ai/dsh-client-ui-slots` 的 `exports` **没有 `./client`**，不是 loader 的模块表词；把 mrfw 的 external 名单照抄过来只会让产物里出现一条 `require("@deepseek-ai/dsh-client-ui-slots")` | 该 require 在工厂物化（materialize）时命中 `dsh-client-modules/lib/client.js:833-840` 的 `missed the module table` 硬错 → **整个 workspace-config 客户端模块加载失败**，footer 入口与弹窗一起消失（比「少个 nav 标签」严重一个量级）。已实测现存产物无一条 require 它 |
| D3 | 贡献方只 `import type` + 各自持座位字面量；**不把 holder 写进 `dsh.client.inject`** | ①「贡献方从 holder 运行时 import 常量」：esbuild/tsdown 会把 holder 的整模块（含 React 组件、CSS 注入、`createElement`）打进贡献方 bundle；②「把 holder 加到贡献方 `dsh.client.inject` 换取加载顺序」：那是**模块加载顺序边**，而 loader 对「图里没有该包」是静默跳过（`dsh-client-modules/lib/client.js` 的 `arriveGraphRow`：`const dependency = this.graphRows.get(packageName); if (dependency !== void 0) …`），既拿不到收益，又在清单上声明了一条贡献方并不需要的运行时前置依赖——已定结论「避免互相 hard-dep」要杜绝的正是这种声明 | ①三份重复的弹窗组件 + 三份 CSS 注入器，entry id 冲突排查噩梦；②这条边永远指向一个可能不存在的包：只装贡献方的 profile 排障时会被它误导为「缺 holder」，而 `slots.inject` 的软注册本来就不需要任何顺序保证 |
| D4 | holder 必须**发射 d.ts**（`tsc --emitDeclarationOnly` → `lib/types/**`，`exports['./client'].types` 指向它） | 「照 web-ux 的纯 esbuild（不产 d.ts）」：`build.mjs` 的注释明写「不产 d.ts：插件由 dsh 运行时消费，不供其他 TypeScript 引用」——workspace-config 恰好**是**被引用的类型权威 | 不发射时三个贡献方的 `import type {…} from 'dsh-plugin-workspace-config/client'` 只能解析到 `lib/client.js`（无类型）→ 类型退化为 `any` 或解析失败，devDep 决策（已定结论 3）落空 |
| D5 | trigger **恒在**（零分节也渲染），空态在弹窗内解释 | 「零节时隐藏入口」（line-a 草稿曾提）：需求既定「footer 只留一个入口且两形态均可见」，隐藏会让 footer 在四包未装齐时**又变成空的**，且引入第二条可见性规则（按节数） | web-ux 装好、holder 装好、mrfw/stt 未装时，用户看不到任何入口，会以为「工作区配置」功能没生效——而它本可以告诉他装什么 |
| D6 | 入口宽态 `flex:1 1 auto; min-width:0`（文案 ellipsis），折叠态 **28px** 方形图标；禁 `flex:none`、禁 `calc(100% + 4px)` | ①mrfw 的整行独占（`styles.ts:20-27`）：挤掉同列其它占用者（R5 根因）；②36px rail（照 `mrfw-railRow`）：按宿主 CSS 计算，折叠轨内容宽只有 32px（`.hHd-Xa_root{padding:6px 12px}` + 56px 轨），36px 已越界靠裁切「看起来还行」 | 若再用 `flex:none` + 整行宽：cordis badge（若未来在场）或任何后装插件会被再次挤成残条，等于把 R5 原样复刻到新入口上 |
| D7 | nav = `nav[aria-label]` + 原生 button + `aria-current="true"` + `data-modal-autofocus`（**不用 tablist/tab**） | 「`role="tablist"` + `tabpanel`」：会要求每个分节面板都带 `role="tabpanel"` 与 `aria-controls` 互指，而面板组件是**第三方注册的**，holder 无法强制其根节点角色；官方 settings nav 也未用 tablist | 用 tablist 后，mrfw 分节根是 `<div class="mrfw-body">`，读屏会报「tab 无对应 tabpanel」，a11y 树验收直接 FAIL |
| D8 | 切换分节 = `only` 重渲染（**不 keep-mounted**），选中节在本 holder 生命周期内记忆；`close` 后弹窗子树整体卸载 | 「keep-mounted + `display:none`」：与已定结论 5 的 `renderSlot(key,{only})` 机制相悖，且会让三节同时持有 RPC 状态（会话管理 500 上限拉取、Folders 列表刷新） | keep-mounted 下打开弹窗即同时触发三节的首次拉取（`WorkspaceDefaultsEditor` 的 `useEffect read()`、migrated 列表拉取），开一个弹窗打三次请求；而用户可能只看一节 |
| D9 | 会话管理分节在 `client === undefined` 时渲染 `manager.unavailable` 空态，**不再 `return null`** | 「沿用 `SessionManagerDialog.tsx:413` 的 `return null`」：旧壳里 null 等于「浮层不出现」，用户还有 footer 入口可重试；新壳里 null = 右列一片空白，nav 却高亮着「会话管理」 | 通道晚就绪时用户点到一节空白面板，既无解释也无重试，会判定功能坏了（旧壳至少整颗浮层不出现） |
| D10 | 统一弹窗**没有 footer**；每个分节自带行内动作条 | 「弹窗统一 footer，分节通过 props 注入按钮」：三节动作数量与危险等级完全不同（mrfw 是输入框+添加+重试；stt 是编辑器内动作；web-ux 是「取消/确认/关闭」随阶段变），统一 footer 要么变成插槽第二层（回到两座位方案），要么写死一个不放任何按钮的空 footer | 统一 footer 下会话管理「确认执行」按钮必须在 `confirm` 阶段变成危险主按钮、`running` 阶段消失——这些阶段知识只有分节自己知道，挤进 holder 就是把业务泄漏进壳 |
| D11 | order 常量：trigger `50`、dialog `530`、分节 `10/20/30` | trigger 若取 `100`（web-ux 旧值）或 `0`（cordis 同位）：`0` 与 cordis badge 并列时先后取决于注册时序（不稳定）；`100` 把「统一入口」排到任何后装插件之后 | 并列 order 时侧栏里谁在左谁在右每次启动可能不同，截图验收无法稳定复现 |
| D12 | 贡献方 devDep 写 `"dsh-plugin-workspace-config": "workspace:*"` | 「写精确版本 `1.5.0`」：包不在 registry，仓内解析需要 `linkWorkspacePackages` 打开（全局配置变更）；「tsconfig paths 映射源码」：绕开包依赖，devDep 决策落空 | 精确版本 + 未开 link 时，`pnpm install` 直接去 registry 找不存在的包 → 整个 workspace 装不上 |
| D13 | 迁移同时**收敛依赖面**：stt / web-ux 删 `@deepseek-ai/dsh-client-ui-sidebar`（`dsh.client.inject` + devDeps + 类型 import） | 「留着不动」：迁移后两包对该包的全部使用点（stt `seats.ts:25`/`index.ts:58`、web-ux `index.ts:51`/`SessionManagerTrigger.tsx:26`）都随 footer 面一起删除，留着就是纯 dead coupling，还会让每次加载多排一行模块 | 留着时 `dsh.client.inject` 声明了一个自己不再使用的包；将来上游改该包 client 入口会连带影响两个不相干的插件（虚假耦合） |
| D14 | 空态文案**不点名**具体插件 | 「列出 mrfw/stt/web-ux 三个包名」：holder 就在文案里硬编码了三个兄弟包的身份，未来新增分节（工具管理）时文案成为第二处「插件清单」 | 新增第四个分节后文案仍只提三个包，用户会以为第四个没装上 |
| D15 | 打开桥用**布尔快照**而非 seq（web-ux 的 `ManagerRequestStore` 用 seq 是为了 `key` 强制重挂） | 「照抄 seq + `key={seq}`」：本设计的弹窗关闭时 `Modal` 返回 `null`，子树已整体卸载，重开天然复位；seq 只增加一个字段与一次无意义重挂 | 多一个 seq 后，重开时 `key` 变化会连带把 nav 的 `selected` 也重置（若放在被 key 包裹的子树里），与 D8「记忆选中节」直接冲突 |
| D16 | web-ux 的 `running` 阶段「关闭被忽略」语义**降级**为「关闭即关闭」 | ①「扩座位 owner 为 `{close, setBusy}` 让分节否决关闭」：改动已定结论 5 的座位形状；②「分节内自绘遮罩拦截 Escape」：Escape 由 `useModalLayer` 在 document 上处理，分节拦不住 | ①座位契约一改，三包两个版本间就出现 owner 形状不兼容（旧 holder + 新分节 = 类型红/运行时 undefined）；②自绘拦截看似挡住点击，用户按 Esc 仍然关掉，反而更困惑。**取舍**：请求已发出、宿主侧继续完成，关闭后重开看列表即可验证结果；此行为写进 smoke 清单与 web-ux README |

### 4.3 已定结论 → 本设计落点（只做映射，不复述论证）

| 已定结论（diff-matrix 六） | 本设计落点 |
|---|---|
| 1 新建 `plugins/workspace-config` 双端结构 | ①1.1（21 个新文件）+ ③3.3 |
| 2 旧 footer 入口硬移除、四包同装、不做开关 | ①1.3/1.4/1.5 的删除项；根 README 与 proposal 写同装约定；**无**任何 config 开关 |
| 3 三插件 devDep 引 holder 拿类型；mrfw 依赖面评估 + 文档同步 | D3/D4/D12；①1.3 #29/#32-34 |
| 4 命名 `workspace-config` / 座位 `workspace-config.section` / 双语文案 | ③3.1 / ③3.5 |
| 5 单 list 座位 + `id/order/label` + `only` + owner `{close}` | ③3.1 / ③3.3 / D1（`only` 与渲染授权在同一个 register 的 `children`） |
| 6 统一弹窗在 `shell.overlay` 注册时用 `children` 声明；三插件 `slots.inject` 软注册；PoC 前置 | ③3.3 装配 / ⑤G3（真 renderer PoC） |
| 7 会话管理五阶段整体内联、打开桥移交 holder、530 与 500 互斥 | ①1.5 #48/#49；D9/D10/D16 |
| 8 入口行内收缩份额（禁 `flex:none`） | D6 |
| 9 cordis 条件预案 | ⑥A9（当前 profile 未装载；28px rail 已前置为默认，见 D6） |
| 10 保留项（Files tab / `/tools` / 行菜单 + 删除弹窗 500） | ①1.3 #25/#26、1.4 #36/#45、1.5 #47；③3.7 |

---

## ⑤ 逐任务组实现要点

> 组间严格串行，组内可并行且不写同一文件；每组末尾给出**可执行验证**（退出码 / grep 计数 / 断言），不接受「已实现/正常」。
> `pnpm --filter <pkg>` 的包名：`dsh-plugin-workspace-config` / `dsh-plugin-multi-root-workspace` / `dsh-plugin-session-tool-toggle` / `dsh-plugin-web-ux`。

### G1 — OpenSpec 提案落档（3 任务，串行）

1. **1.1 四件套**：`openspec/changes/2026-11-05-unify-workspace-config-entry/{proposal.md,design.md,tasks.md,specs/dsh-workspace-config-entry/spec.md}`。proposal 的「What Changes」必须写明**四包同装**约定与「旧入口硬移除」，spec 用 SHALL/MUST 描述：单入口可见性（两形态）、分节可扩展、未装插件节隐藏、三节功能不缩水、既有兜底路径保留。
2. **1.2 契约冻结进 design.md**：座位名/owner/order/空态/`only` 语义/降级矩阵（见 ⑥A4 与 ⑤G6 6.2）逐条落档，与本文 ③ 一致。
3. **1.3 校验**：`openspec validate --all` 退出码 0；`git status --porcelain openspec/changes/2026-11-05-session-tool-toggle-session-scoped-catalog` 为空（不碰在途变更）。

**验证**：`openspec validate --all` → 0；`openspec list` 同时列出两个 active change；`grep -c "workspace-config.section" openspec/changes/2026-11-05-unify-workspace-config-entry/design.md` ≥ 1。

### G2 — holder 骨架与 workspace 接入（5 任务，组内 1→2 串行，3/4 可并行）

1. **2.1 包骨架**：`package.json` / `cordis.patch.yml` / `build.mjs` / `tsconfig{,.base,.client,.host}.json` / `src/index.ts`（no-op）/ `src/css-modules.d.ts` / `src/client/locales.ts` / `.oxlintrc.json` / `vitest.config.ts`。`build` 脚本 = `pnpm run build:types && node build.mjs`；`tsconfig.client.json` 发射 d.ts。
2. **2.2 首次构建**：`pnpm install` → `pnpm --filter dsh-plugin-workspace-config build`，检查产物 3 件：`lib/index.js`（ESM，仅 `node:*`）、`lib/client.js`（`window.__ModuleLoader__.load({id:"dsh-plugin-workspace-config"…`）、`lib/types/client/index.d.ts`。
3. **2.3 manifest 断言**：`test/bundle.test.ts`（照 web-ux 的 6 条断言 + 新增「`exports['./client'].types` 指向 `lib/types/client/index.d.ts` 且文件存在」）。
4. **2.4 仓级接入**：`pnpm install` 更新 `pnpm-lock.yaml`；根 README 加行。
5. **2.5 门禁三连**：`pnpm dsh:check` / `pnpm -r typecheck` / `pnpm -r test`。

**验证**：
```bash
node -e "const p=require('./plugins/workspace-config/package.json'); if(p.dsh.client.platform!=='web') process.exit(1); if(!p.exports['./client'].types) process.exit(1)"
test -f plugins/workspace-config/lib/types/client/index.d.ts
test "$(grep -c 'window.__ModuleLoader__.load' plugins/workspace-config/lib/client.js)" -eq 1
test "$(grep -cE 'from "[^"]+"' plugins/workspace-config/lib/index.js)" -eq 0   # 宿主半零 import
pnpm dsh:check
```

> **【执行期终形态 · 2026-11-05 组 2 核对通过后回填】**
> - **实测**：骨架 15 文件落地（较 2.1 清单多建 `test/stubs/ui-primitives.tsx` 与插件 `README.md`，均在 # 清单内）；验证句 1 exit 0；`contract.ts` 座位字面量 4 处；oxlint 0/0；临时 harness（链 web-ux rc.5 依赖）`tsc` host/client/-b 三路 exit 0 并发出 `lib/types/client/{contract,locales}.d.ts`；临时副本 build 冒烟 exit 0——宿主半零 import、client.js 恰 1 个 ModuleLoader 壳、`lib/types` 不被清、缺入口守卫 exit 1。
> - **偏差与裁决**：① `build.mjs` 不整目录清 `lib/`（保 `lib/types` 先发的 d.ts）+ 新增缺 `src/client/index.ts` 诊断守卫（正常双端行为不变）；② `tsconfig.client.json` 只含 `src/client`（`rootDir:src` 与测试目录冲突，同 multi-root 取舍；`tsc -b` 不查 test/ 类型，由 vitest esbuild 转译）；③ 文案 `dialog.empty.hint` 按 **D14 泛化**——本文 ③3.5 表格同名键点名三包与 D14 冲突，**以 D14 为准**（3.5 原文不改，以此裁决为准）。
> - **交接（组 5 必须遵循）**：#13 `src/client/index.ts` 必须从 `./contract` re-export `WorkspaceConfigSectionSeat` / `WorkspaceConfigSectionOwnerProps` 类型并导出契约运行时常量，否则贡献方 `import type … from 'dsh-plugin-workspace-config/client'` 取不到类型，D3/D4 类型权威落空。
> - **P0 顺序依赖（待用户裁决，见 diff-matrix R5）**：2.2/2.3/2.5（= tasks.md 组 3）的产物断言依赖组 5 装配出的 `src/client/index.ts`（#13）——骨架状态下 `lib/client.js` 与 `lib/types/client/index.d.ts` 必然不存在（已实证）。

### G3 — 分节座位运行时 PoC（**前置风险批**，3 任务，串行）

1. **3.1 真 renderer 的 jsdom PoC**：`test/section-seat.poc.test.tsx`
   - 建 cordis `Context` → 调 `@deepseek-ai/dsh-client-ui-renderer/client` 的 `apply(ctx)`（`lib/client.js` 里 `apply` 只做 `new SlotRegistry(ctx).install(...)` + `ctx.reflect.provide('uiRenderer', …)`）→ `ctx.slots` 可用；
   - 注册一个 `root` entry，`children: { 'shell.overlay': { kind:'list', scope:'root' } }`，组件渲染 `props.renderSlot('shell.overlay', {})`；
   - 注册 `shell.overlay` 父 entry，`children: { 'workspace-config.section': { kind:'list', scope:'root' } }`，组件渲染 `props.renderSlot('workspace-config.section', { close }, { only: 'b' })` 并把 `close` 打到 DOM 供断言之；
   - 子 entry 注册 `a`（order 20）与 `b`（order 10），`label` 分别是**字符串**与**thunk**；
   - 断言：只渲染 `b`；`close` 可回调；`ctx.slots.entries('workspace-config.section')` 长度 2 且 `label` thunk 在 `resolveSlotLabel` 等价解析下取到值；
   - **后装补跑**：另一起用例先注册子 entry（此时座位未声明）→ 再注册父 entry → 断言子 entry 在父声明后渲染出来。
2. **3.2 结论回填**：把 PoC 结果写进 `openspec/.../design.md` 的「运行时实证」小节；若任一条不成立 → **停批上浮**（不允许自行改回两座位方案）。
3. **3.3 PoC 常驻**：PoC 不进 `describe.skip`，作为长期回归（它同时是「children/only 语义漂移」的哨兵）。

**验证**：
```bash
pnpm --filter dsh-plugin-workspace-config test -- section-seat.poc   # 退出码 0
grep -c "renderSlot('workspace-config.section'\|renderSlot(\"workspace-config.section\"" plugins/workspace-config/test/section-seat.poc.test.tsx  # ≥1
```

> 若 `Context` + `apply` 在 jsdom 下无法装配（<2h 内解决不了），降级方案：在 holder 的 `test/dialog.test.tsx` 用**假 ctx** 固定 `children` 声明与 `only` 参数，另开一个**真机 PoC**（临时给 holder 加一个 `probe` 分节，link: 安装后走 GUI 看左 nav 是否列出），二者都落档；**不得**因为 PoC 困难就跳过。

> **【执行期终形态 · 2026-11-05 组 4 核对通过后回填】** 降级方案未启用——`Context` + 真 `apply` 在 jsdom 装配成功，四断言全 PASS（`Test Files 1 passed / Tests 4 passed`），PoC 常驻 `test/section-seat.poc.test.tsx`；完整结果与实测 API 语义回填于本文兄弟文件 design.md「### 运行时实证（组 4 PoC）」（**该小节为运行时语义的权威载体**）。后续组必须遵循的四条实测约束：① renderer `exports['./client']` 是 `window.__ModuleLoader__.load` loader 壳而非 ESM 入口，jsdom 测试侧需复刻宿主 loader（模块表六词：react / react-dom / react-dom/client / react/jsx-runtime / slots / cordis）；② 直渲 `root` 出口需先装 session 作用域适配器（空绑定即可，生产由 dsh-client-ui-session 提供）；③ children 运行时语义 = 「声明账本」——子 entry 写入子座位自身账本（`entries(childKey)` 读），非父 entry options 字段；④ slots 包无 `./client` 导出，`resolveSlotLabel` 在 `.` 入口（D2 结论不变，仅测试侧可 import 对照）。U1/U2/U3 全部钉住，A1 在触达面上成立。

### G4 — 统一入口与弹窗壳（6 任务，1→2→3 串行，4/5 可并行）

1. **4.1 打开桥**：`src/client/open-store.ts`（布尔快照 + `open/close`），照 web-ux store 的 uSES 契约。
2. **4.2 trigger**：`WorkspaceConfigTrigger.tsx` + 样式；`aria-label` 两态恒在、`aria-haspopup`、`aria-expanded`、宽态 ellipsis、折叠态 28px。
3. **4.3 弹窗壳**：`WorkspaceConfigDialog.tsx`（`Modal headless` + header + nav + 内容列 + 空态）、`sections.ts`（nav 投影 + 双版本记忆）、`dialog.module.css`。
4. **4.4 装配**：`src/client/index.ts` 两处软注册（trigger 50 / dialog 530 + `children` 声明），两处 `try/catch` + `ctx.logger?.warn`。
5. **4.5 组件测试**：`test/trigger.test.tsx` / `test/dialog.test.tsx` / `test/sections.test.ts`（stub primitives 补 `Modal` 的 headless 分支）。
6. **4.6 绑定回归**：`test/bundle.test.ts` 断言产物含 `workspace-config.section`、两座位名、**不含** `sidebar.footer.action`。

**验证**：
```bash
pnpm --filter dsh-plugin-workspace-config typecheck && pnpm --filter dsh-plugin-workspace-config test
test "$(grep -o 'workspace-config\.section' plugins/workspace-config/lib/client.js | wc -l)" -ge 2   # 座位声明 + 渲染
test "$(grep -r 'flex: none' plugins/workspace-config/src/client | wc -l)" -eq 0                          # 禁整行独占
test "$(grep -c 'aria-label' plugins/workspace-config/src/client/WorkspaceConfigTrigger.tsx)" -ge 1
```

### G5 — 三插件迁移（3 任务，**组内三包并行**；每包内部按 1→2→3 顺序）

> **【执行期终形态 · 2026-11-05 组 5（= 本图 G4）核对通过后回填】**
> - **落地实测**：6 实现文件 + 5 测试文件全新建（open-store / sections / Trigger / Dialog / dialog.module.css / client index.ts；sections 9 + trigger 6 + dialog 9 + apply 11 + bundle 12 = 47 条 + PoC 4 = 51 用例全绿）；`lib/` 三件齐（client.js 23.5KB、7 个 d.ts）；client require 白名单 = primitives / react / react/jsx-runtime（D2 防线）；D3/D4 类型权威端到端实证（临时消费者直连 `dsh-plugin-workspace-config/client` 编译通过）。
> - **取舍留痕**：① 座位名在 children 声明与 renderSlot 两个语义点**字面量直写**（共享常量经 esbuild 内联后产物只余 1 份字面量会使验证句 grep 计数退化；类型面由 `PropsRenderSlots` 逐字校验兜住，契约常量仍是权威）；② `bundle.test.ts` 新建（骨架原无此文件），已覆盖 #19 全部断言并含 platform/inject、engines/peer 额外断言；③ `sections.ts` 按 #10 用 `entries`（未用 `entriesOfSlot` 影子优胜者投影，同 id 同优先级注册上游拒绝、当前无影响）；④ `apply.test.ts` 为 #13 之外的补充装配契约测试。
> - **门禁基线（5.2 实测）**：`dsh:check` / `-r typecheck` / `-r test` 三连 exit 0；全仓 114 文件 2590 passed + 5 skipped（multi-root 既有平台门控，R8 口径）；干净窗口两步法核对通过。


- **5.1 multi-root-workspace**（①1.3 #25-35）：剥壳 → 注册替换 → 测试迁移 → 文档/ADR/`docs:check` → 重建 `lib/`。
  验证：
  ```bash
  test "$(grep -r 'sidebar.footer.action' plugins/multi-root-workspace/src | wc -l)" -eq 0
  test "$(grep -o 'workspace-config\.section' plugins/multi-root-workspace/lib/client.js | wc -l)" -ge 1
  pnpm --filter dsh-plugin-multi-root-workspace typecheck \
    && pnpm --filter dsh-plugin-multi-root-workspace test \
    && pnpm --filter dsh-plugin-multi-root-workspace docs:check
  ```
- **5.2 session-tool-toggle**（①1.4 #36-46）：
  ```bash
  test "$(grep -rE 'sidebar\.footer\.action|FOOTER_SEAT|FOOTER_ID|FOOTER_ORDER' plugins/session-tool-toggle/src | wc -l)" -eq 0
  test "$(grep -c 'dsh-client-ui-sidebar' plugins/session-tool-toggle/package.json)" -eq 0
  pnpm --filter dsh-plugin-session-tool-toggle typecheck && pnpm --filter dsh-plugin-session-tool-toggle test
  ```
- **5.3 web-ux**（①1.5 #47-58）：
  ```bash
  test "$(grep -rE 'sidebar\.footer\.action|MANAGER_TRIGGER|MANAGER_OVERLAY' plugins/web-ux/src | wc -l)" -eq 0
  test "$(grep -cE 'SessionManagerTrigger|createManagerRequestStore' plugins/web-ux/src/client/index.ts)" -eq 0
  test "$(grep -c 'dsh-client-ui-sidebar' plugins/web-ux/package.json)" -eq 0
  pnpm --filter dsh-plugin-web-ux typecheck && pnpm --filter dsh-plugin-web-ux test
  ```
- 三包共同断言（G6 汇总执行）：
  ```bash
  for p in multi-root-workspace session-tool-toggle web-ux; do
    test "$(grep -c 'dsh-plugin-workspace-config' "plugins/$p/lib/client.js")" -eq 0 || echo "FAIL $p";
  done
  ```

### G6 — 集成回归与组合矩阵（4 任务，串行）

> **【执行期终形态 · 2026-11-05 组 6（= 本图 G5）核对通过后回填】**
> - **三包迁移实测**：mrfw 31 文件（含 AGENTS 不变量 5 + 双语 README + ADR-0013 新建 + 14 处文档同步 + `docs:check` 10 项全 PASS；408 tests + 5 既有平台 skip）；stt 11 文件（999 tests，`/tools` 共用状态双向回归 PASS，工作区下拉保留）；web-ux 15 文件（576 tests，五阶段内联 + D9 空态 + D16 用例；旧 Trigger/store/触发测试三文件删除）。三包 `lib/` 全部重建且产物纯度一致：含 `workspace-config.section`、零 `sidebar.footer.action`、零 holder 包名、require 词表仍三词。
> - **主会话裁决 1（D16 分层）**：holder 侧关闭（按钮/Escape/遮罩）无条件直通「关闭即关闭」+ 分节内 running 行内 [取消] 禁用保留——D16 与 #48 原文语义，未扩 owner `setBusy`。
> - **主会话裁决 2（Files tab 入口语义，用户终末呈证可再调）**：mrfw Files tab 紧凑胶囊**就地展开同一分节本体**（`WorkspaceFoldersLauncher`，不自绘弹窗、不引 holder 运行时桥）——design Goals 只要求入口保留未定打开形态；「打开统一弹窗」需跨包运行时桥违反 D3。
> - **主会话裁决 3（D13 延伸 mrfw，详见 diff-matrix R9）**：footer 座位删除后 `@deepseek-ai/dsh-client-ui-sidebar` 在 mrfw 实证零使用点（Files tab 座位实由 `dsh-client-ui-sidebar-files` 声明），按 D13 精神删除（devDeps + inject + 类型 import；回退点 3 处：package.json 两项、index.ts 一行 import、client-bundle.spec inject 期望）。**本文 ③3.6「mrfw inject 不变」/#29「其余不动」就此条被实测修订**，其余 ③3.6 断言不变。
> - **stt 取舍留痕**：`.workspaceDialog` 死样式一并删除（唯一消费者为已移除 Modal）；`WorkspaceDefaultsSectionProps.close` 必填（严格对齐 owner 份额）；分节唯一可写面为工作区默认档，工具开关 ↔ `/tools` 原路径由既有套件覆盖。web-ux 取舍：`SessionManagerSection` 内部以私有 Content 承载 hooks（防缺席↔就绪切换 hooks 数量变化）；`manager.action` 键无使用点暂留（parity 覆盖）。


1. **6.1 递归门禁**：`pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm dsh:check && pnpm docs:check`（`docs:check` 只有 mrfw 有该脚本，`-r` 会自动跳过其余）。
2. **6.2 组合矩阵单测**（容器无关，jsdom/node）：四格 = 全装 / 只 holder（nav 空态）/ 只贡献者×3（`slots.inject` 不触发、不抛错、各包其它 entry 数量不变）/ 后装 holder（贡献方先 apply，座位后声明由 G3 的「补跑」语义覆盖）。落点为各包既有 fake-ctx 测试的扩展（mrfw `tests/client-panel.spec.tsx`、stt `test/client-index.test.ts`、web-ux `test/client-apply.test.ts`），holder 侧落 `test/dialog.test.tsx`。
3. **6.3 产物断言收口**：三插件 `bundle.test.ts` 各加一条「产物含 `workspace-config.section`、不含 `sidebar.footer.action`、不含 holder 包名」；holder 侧对偶断言。
4. **6.4 安装形态演练（真机前置）**：
   ```bash
   docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/workspace-config
   test "$(docker exec dsh dsh plugin --profile web list | grep -c 'dsh-plugin-workspace-config@link:')" -eq 1
   test "$(docker exec dsh dsh --profile web --dump-config-schema | grep -c 'workspace-config')" -ge 1
   ```
   用户重启 profile 后进入 G7。

**验证**：6.1 的 6 条门禁命令逐个退出码 0；6.4 的两条 `test` 断言通过；`git status --porcelain plugins` 只显示四包的预期产物改动（`lib/`、源码、文档）。

### G7 — 真机验收（5 任务，串行；GUI token 链接取自 `docker logs dsh`）

> **【执行期终形态 · 2026-11-05 组 7（= 本图 G6）核对通过后回填】**
> - **四格矩阵落地**：12 用例分布于四包既有 fake-ctx 套件（holder dialog.test 12 / mrfw client-panel 36 / stt client-index 28 / web-ux client-apply 14 中的矩阵 describe）——格 1 全装（注册序刻意打乱 web-ux→mrfw→stt，nav 仍按 order 10/20/30；only 切换、共享打开桥、三贡献方既有 entry 保留）/ 格 2 只 holder（D5 入口恒在 + D14 泛化空态）/ 格 3 只贡献方（待命不注册不报错不 warn）/ 格 4 后装补跑，全部 PASS。
> - **门禁基线（复跑两次一致）**：`build && typecheck && test && lint && dsh:check` 五连 exit 0；全仓 113 文件 2606 passed + 5 skipped（R8 既有口径）；三包产物纯净断言无 FAIL（seat 计数 mrfw 2 / stt 1 / web-ux 1）。
> - **主会话裁决（跨包导入长期形态）**：格 1 在 holder 套件内以**测试侧相对导入**三贡献方 `src/client` 实现（不进产物、零 devDep、不反转 D3 依赖方向）；贡献方 client 入口路径/primitives 具名导入变化会打红 holder 矩阵套件 = **预期哨兵面**，作为长期形态保留（证据日志 `/home/docker/.cache/spec-evidence/unify-workspace-config-entry/group7/`，R1 落点）。
> - **stubs 扩容**：holder `test/stubs/ui-primitives.tsx` 补 13 具名导出（Input/Switch/Checkbox/SegmentedTabs/Menu/MenuItemButton + 10 图标，含 mrfw 加载期按名探针 7 个），仅服务导入期。


> 进 GUI：从 `docker logs dsh` 取带 token 的链接（本机曾为 `http://127.0.0.1:3080`），浏览器打开后按 7.1–7.4 逐项走查。

1. **7.1 宽栏 256px**：footer 只剩一颗「工作区配置」（图标 + 文案完整、无横向溢出/裁切）；a11y 树 `button "工作区配置"`；`aria-expanded` 随开合翻转。证据：截图 + a11y 树文本落 `plugins/workspace-config/artifacts/workspace-config-smoke.md`。
2. **7.2 折叠轨 56px**：点击侧栏折叠控件 → 入口图标完整居中（28px，不裁切）；a11y 树仍可点到同名按钮；折叠态打开弹窗 → 默认节 = order 最小者。
3. **7.3 三节功能面**：Folders（增/删/别名/排序/复制路径/Reveal，Files tab compact 入口仍可用）、工作区默认档（读写/清空/工作区下拉切换，与 `/tools` 命令面状态一致：命令面关掉的工具在节内可见同一状态）、会话管理（三 tab / 批量归档 / 批量删除预览-确认-执行 / 恢复；2000 条上限截断提示仅在本机确有条目时观察）。
4. **7.4 迁移回归 + 降级反例**：mrfw `sidebar.right.tab.files.actions` 仍渲染；`/workspace-folders` 与 `/tools` 命令可用；web-ux 侧栏行菜单删除 + 删除弹窗（order 500）不叠放；临时在 profile 中禁用 `dsh-plugin-session-tool-toggle` 重启 → nav 少一节且无报错；再禁用 holder → footer 无入口且控制台无未捕获异常（web-ux 会话管理此时 GUI 不可达，**符合已定结论 2**）。
5. **7.5 冒烟留档**：`plugins/workspace-config/artifacts/workspace-config-smoke.md` 按「步骤 / 结论 PASS-FAIL / 证据」逐条落档，含 D16（running 中关闭）与 A13 复验（Modal 内 `Menu` portal：菜单不被裁剪、Escape 先关菜单再关弹窗）。

**验证**：冒烟文件存在且 7.1–7.4 每步有结论行；`grep -c "PASS" plugins/workspace-config/artifacts/workspace-config-smoke.md` ≥ 12；三节每条功能面至少 1 条证据。

### G8 — 收口（4 任务，串行）

> **【执行期终形态 · 2026-11-05 组 9（= 本图 G7）核对通过后回填】**
> - **正例 14/14 PASS**（冒烟 `plugins/workspace-config/artifacts/workspace-config-smoke.md`，17 处 PASS；证据 55 截图 + CDP 脚本 + store 前后副本 + d16-timing.json 落 `/home/docker/.cache/spec-evidence/…/group9/`）：宽栏 280 栏 / 256 入口 / a11y 名（GUI locale=en 为 `Workspace settings`，zh 镜像「工作区配置」）；折叠 56 轨 / 28 图标居中；nav 三节 order 10/20/30；Folders 增删别名（ship-v2 往返，store sha256 零净变更）；默认档写读 ↔ `/tools workspace` 回执一致；会话管理三 tab + 批量两段式 UI；行菜单删除 500 弹窗与 530 不叠放；Menu portal Escape 两跳分层（U4 通过，未启用兜底开关）；D16 32ms Running→73ms Escape→86ms 关闭、请求宿主侧继续完成（真删证据 = 2026-10-26 仅 header 零消息空会话 `session-7ff2f8a5`，**已向用户披露**）；D8 跨开合选中记忆。
> - **降级反例（用户裁决完整真机）**：轮 1 卸 stt → nav 三节变两节、零报错；轮 2 卸 holder → footer 入口消失 + 会话管理 GUI 不可达（约定接受项）+ stt/mrfw 独立入口保留；终态四包 @link: 恢复 + nav 三节齐。**3 次重启均由用户手动**（执行流程在 dsh 容器内不可自重启）——反例段由主会话以浏览器工具实测并补全冒烟。
> - **残留清理**：测试会话 `session-6da5fc6b` 以容器身份删除（宿主 shell 无 `/home/docker/.dsh` 写权，先半删后 `docker exec dsh` 补齐）；`workspaces.json` 空档键移除还原为 `{"version":1,"workspaces":{}}`。

1. **8.1 文档收口**：根 README（插件一览 + 四包同装）、四包 README、mrfw AGENTS 不变量 5、ADR-0013。
2. **8.2 openspec 归档准备**：`tasks.md` 全勾选；`openspec validate --all`；变更目录保留在 `changes/`（归档动作按仓内流程在实施结束后做）。
3. **8.3 发布自检**：`pnpm verify`（递归 `verify:all`，mrfw 的 smoke 需运行中的 dsh）；`pnpm release <next> --dry-run` 只打印不写入。
4. **8.4 版本定稿**：按「待决问题 Q3」的答复决定版本号与打 tag 时点；四包同一 tag（tag 是 profile 侧唯一锚点）。

**验证**：
```bash
pnpm verify                                    # 退出码 0
node scripts/release.mjs 1.6.0 --dry-run       # 打印四个 package.json 目标版本，且不产生 git 变更
git status --porcelain | grep -c "openspec/changes/2026-11-05-unify-workspace-config-entry"  # >0（四件套已落）
```

> **【执行期终形态 · 2026-11-05 组 10（= 本图 G8）核对通过后回填】**
> - **收口实测**：`validate --strict` exit 0；`pnpm verify` exit 0（7/7 项目全绿，mrfw smoke compose 46/46 + behavior 99/99 + journey 60/60；verify 递归重建 lib 后 git status 字节不变）；`release 1.6.0 --dry-run` 按任务文本以双证满足（真实仓 exit 1 = 脏工作区门禁前置，结构上不可能写文件；/tmp 干净副本同一命令 **EXIT 0** 打印 8 目标 1.5.0→1.6.0 无写入无 tag；提交后主会话复跑取 0——时序口径见 R12②）。
> - **R4 落实**：根 `AGENTS.md` +4/−3（插件清单 7 包行、「其余六个」、「web 侧四包同装」、「六个软插件」）；验收句全名 ≥2 的口径瑕疵按「实质满足」裁决（清单行全名 + 短名 3 行，R12①）。
> - **沉淀回流清单**已入 tasks.md 附录（AGENTS 落库去向 / 既存 rc.2 漂移待决 / 证据目录 / 编排修订索引），随最后批次提交入库。


---

## ⑥ 设计假设与未决项

### 6.1 假设（附证伪方式）

| ID | 假设 | 证伪方式 |
|---|---|---|
| A1 | rc.5 的 `children` / `only` / `label` 运行时行为与类型面一致（G3 PoC 是前置门） | G3 任一断言失败 → 停批上浮，**不自行改方案** |
| A2 | `sidebar.footer.action` 的 layout 在变更期内不变：`.footerActions{display:flex;width:100%;min-width:0}`，折叠态 `width:auto;justify-content:center`；折叠轨内容宽 32px | 真机 7.1/7.2 走查；若宿主升级改布局，trigger 的 `flex:1 1 auto` 策略需复核 |
| A3 | profile 为 link: 安装（实测 `dsh plugin --profile web list` 显示四包均 `link:` 指向主仓 `plugins/<name>`） | G6 6.4 的 list 输出 |
| A4 | 三个贡献方在「holder 缺席」时不报错、不残留 UI（`slots.inject` 未触发） | G6 6.2 组合矩阵「只贡献者」格 |
| A5 | `workspace:*` devDep 不影响 profile 从 git 安装（devDeps 不被安装、不被 pack 改写） | **已执行探针**（见 6.2 P1）；真机 tag 安装仍要在发布后复验一次 |
| A6 | 官方 settings 壳的 nav 写法可作同构参照（只读，不改上游） | 无（只读依赖） |
| A7 | 当前 profile 的桌面布局下 footer 没有第四个占用者：`dsh-pocket@2.12.0` 的 `mobile-nav-session-log`（order 10）只在 `mobileApply` 非 `desktop` 分支注册（`resolveLayout` 默认 `desktop`），且被 `?dsh-layout=mobile` 或窄视口触发 | 真机 7.1 的实际 footer 子元素计数；窄屏场景见「待决问题 Q1」 |
| A8 | 分节切换会卸载上一节（`only` 语义），stt 的自由文本草稿随之丢弃；三个分节都「动作即写」，没有「暂存后保存」语义 | G4 的 `only` 测试 + stt 节走查（草稿丢失属**接受项**，写进冒烟记录） |
| A9 | cordis badge 当前不在场（profile 未装载 `dsh-client-ui-cordis`，diff-matrix 四.2 已裁定），故折叠轨只有统一入口一颗 | 7.2 走查；若未来在场，按已定预案（rail 图标已默认 28px，见 D6）复核并收口 |

### 6.2 未决项（技术，需在实施中钉住，非用户决策）

| ID | 未决项 | 现状 / 计划 |
|---|---|---|
| U1 | `renderSlot(key, owner, { only })` 在 **list** 座位上是否只挂载匹配 `options.id` 的 entry | 类型注释支持（`RenderOpts.only`「list filtering」），官方壳实装同一写法；**运行时未自证** → G3 断言 |
| U2 | 后装 holder 时，先 `slots.inject` 的贡献方回调是否补跑（不重启、不刷新） | `registry.d.ts:97-111` 注释明确；G3 第二用例钉住 |
| U3 | `StoredEntry.options.label` 的 thunk 由谁、何时求值 | 上游 `resolveSlotLabel` 语义；holder 侧自带 2 行等价解析（D2）+ `sections.test.ts` 双态用例 |
| U4 | `headless` Modal 与新壳内的 `Menu` portal 是否仍满足 A13（Escape 先关菜单、菜单不被裁剪） | 真机 7.5 复验；失败时 `WORKSPACE_MENU_PORTAL=false` 单点退化（`SessionManagerDialog.tsx:147` 既有开关保留） |
| U5 | web-ux 分节 `running` 阶段被用户关闭后的结果可见性（D16 取舍） | 冒烟 7.3 观察 + README 说明；不做否决机制 |
| U6 | 折叠轨 28px 与未来 cordis badge（36px）并排 = 64px > 56px 轨 | 已定预案：验收确认 badge 不在场即收口；若将来在场，需缩到 ≤20px 或与 cordis 侧协调（超出本仓控制面，另议） |
| U7 | `pnpm` 大版本差异（仓内 11.25.0 / 容器 10.34.9）对 `workspace:*` + `link:` 的表现 | 仓内 `pnpm install`（11.x）与容器安装（10.x）各自跑一次；P1 探针用的是 10.29.3 |
| U8 | 空态文案里「安装哪三个插件」是否需要随「工具管理」等未来分节改写 | D14 已选泛化措辞；新增分节时复查一次 |

**已执行探针（P1，2026-11-05，pnpm 10.29.3）**：

```text
/tmp/wsprobe: package.json 的 devDependencies 含 "probe-sibling": "workspace:*"
$ pnpm pack            → ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL（仓外无法解析 workspace 协议）
/tmp/gitprobe → /tmp/consumer:
$ pnpm add "git+file:///tmp/gitprobe#main&path:plugins/x"   （该包 devDeps 含 workspace:*/prepack）
→ Done in 451ms；node_modules/probe-x/package.json 原样保留 workspace:*；未装 devDep、未跑 prepack
```

**结论**：git 来源安装既不安装也不改写 `devDependencies`，`workspace:*` 只在本 workspace 内解析 —— 已定结论 3（devDep）在 profile 安装面安全。发布后仍需在真机按 tag 复装一次（G8 之后）。

---

## 待决问题

### Q1 — 窄屏/移动布局是否纳入「footer 单入口」目标

- **问题**：当前 profile 的第三方插件 `dsh-pocket@2.12.0` 在 `layout !== 'desktop'` 时（URL `?dsh-layout=mobile` 或视口 ≤1023px）会向 `sidebar.footer.action` 再注册一颗 `mobile-nav-session-log`（order 10，两按钮的 drawer 动作条）。本变更的验收面是桌面 256px / 折叠 56px，窄屏下「只留一个入口」不成立。
- **选项**：a) 仅桌面为验收面，窄屏冲突记为已知事实（不改 pocket，不在本变更内解决）；b) 本变更内加一条兜底（如窄屏时 holder 入口隐藏）；c) 去掉该第三方插件的 footer 注册（属外部包，需另提）。
- **推荐**：a。窄屏是 pocket 的移动布局实验面，本变更引入「入口绝对唯一」的反向承诺没有依据；b 会再次引入「按条件隐藏入口」的第二规则（与 D5 冲突）。
- **影响面**：验收清单措辞；是否需要在本变更内触碰第三方包；A7 的证伪结论。

### Q2 — session-tool-toggle 分节的形态

- **问题**：`WorkspaceDefaultsEditor` 有 `variant='section'`（无工作区下拉，作用域=当前会话所属工作区）与 `variant='dialog'`（带工作区下拉，可切到任一已登记工作区）两形态；统一弹窗里用哪一个？
- **选项**：a) `dialog` 形态（保留工作区下拉与 `select` 目标记忆）；b) `section` 形态（少一个下拉，交互更简单）。
- **推荐**：a。footer 入口的核心价值就是「不改当前会话也能预先设默认档」，去掉下拉等于删能力（与「既有功能不缩水」冲突）；且 `useWorkspaceDefaults` 的 `select` 分支本来就有测试覆盖。
- **影响面**：stt 分节的 props（是否需要 `select`）、冒烟步骤 7.3 的工作区切换检查项、文档措辞。

### Q3 — 发布时点与版本号

- **问题**：本次变更是否随下一个统一版本（建议 `1.6.0`）一起发布并打 tag；holder 首次发布必须打 tag，profile 才能按 `#<tag>&path:plugins/workspace-config` 安装。
- **选项**：a) 变更合入后立即 `1.6.0` + 四包同 tag；b) 先合入不合 tag（用户继续 link: 使用），等下一批变更一起发；c) 发 `1.5.1`（若认为只是入口重排）。
- **推荐**：a。新增一个包、删除三条注册、改动四包文档，语义上是 minor 而非 patch；`release.mjs` 递归改 `plugins/*`（含新包，共 7 个）的 `version` 并重建 `lib/`，一次动作即可；一个 tag 覆盖全部包，「四包同装」指 profile 侧按**同一 tag** 安装四个目录。
- **影响面**：tag 与 profile 安装锚点；mrfw 的 `SUPPORTED_DSH_RELEASES` 与本变更无关（不动）；G8 的最后一步。
