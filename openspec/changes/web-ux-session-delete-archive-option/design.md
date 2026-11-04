# Design

> 本文承载阶段 1.7 代码级蓝图（`code-design.md`，随本变更目录入库）的深度契约：
> 触达面 / 证据锚 / 接口与数据形状 / 决策记录（含栈识别结论）/ 逐任务组要点 / 假设与
> 未决项。行号引用以蓝图写作时点为准。

## Context

「删除已归档会话」现有链路：client 菜单项（已归档行可见，`DeleteSessionMenuItem.tsx`）
→ 跨 entry 请求 store（`delete-store.ts`）→ 确认对话框（`DeleteSessionDialog.tsx`，
五档阶段机 previewing→ready→deleting→done/failed）→ `/web-ux` Connection RPC 通道两
端点（`contract.ts`：`preview-delete` / `delete-session`，请求体仅 `sessionId`）→ 宿主
纯流程（`delete-session.ts`：`planDelete` 校验 → `previewDelete` 统计 / `deleteSession`
逐条 `cleanupRegistry → removeFiles → emitRemoved`）→ 实实体接线（`src/index.ts`：
`nodeFileSystem` 适配 `FileSystemOps` 四原语，`createPorts` 装配上游服务）。

仓库分层惯例（本设计的硬约束）：纯流程层不 import cordis 与 `@deepseek-ai/*`（可用
fake 端口在纯 node 驱动）；实实体层唯一持有 `node:fs/promises` 并绑端口；浏览器层
组件 / 调用面 / store / 文案 / 样式分离。宿主半对 `@deepseek-ai/*` type-only 的惯例有
一个已存在例外（session-tool-toggle 的 Schemastery `Config`，构建内联、运行时不解析），
本次沿用。

**栈识别结论**：栈未命中聚合层 writer（TypeScript/esbuild/React 双端插件仓，无
spring-boot/nuxt 特征），用户豁免本次加载（仅本次有效）。

## Goals / Non-Goals

**Goals:**

- 单入口不动，确认框内提供两种处置模式单选（默认迁移归档），两模式前置校验与集合计算完全一致；
- 迁移归档：日志目录移动到可配置归档根（保留项目层级）、投影缓存删除、引用清理与事件广播与删除同构；
- 失败语义同构：逐条 warning 不回滚不中止；归档根不可用前置拒绝（新失败码）。

**Non-Goals:**

- 不提供从归档目录恢复会话的 GUI（目录归用户手工管理）；
- 不动共享附件存储 `~/.dsh/attachments/v1`（任何模式）；
- 不改菜单入口可见性规则、slot 声明与 order、`delete-store` 身份语义；
- 不引入灰度兼容期（双端同 bundle；旧标签页由 mode 必填在预览阶段显式暴露，见 D1）。

## 触达面清单（①）

全部在根仓 `dsh-plugins` 的 `plugins/web-ux/` 单包内：

**生产代码**

| # | 文件 | 动作 | 关键改动点 |
|---|---|---|---|
| 1 | `src/contract.ts` | 改 | `DISPOSAL_MODES`/`DisposalMode`/`isDisposalMode()`；`DeleteRequest.mode` 必填；`readRequest()` 白名单加 `mode` 并校验取值；`DeletePreview.archiveRoot` + `parsePreview()` 校验；`FAILURE_CODES` 追加 `archive-unavailable` |
| 2 | `src/config.ts` | **新建** | `WebUxConfig`、`Config`（原生 Schemastery，`archiveRoot` 键）、`ArchiveRootContext`、`resolveArchiveRoot()` |
| 3 | `src/delete-session.ts` | 改 | `FileSystemOps` 扩 `mkdir`/`rename`/`copyFile`；`DeletePorts` 扩 `prepareArchive`/`archiveFiles`；`createSessionFiles()` 增 `prepareArchive`/`archive`；`previewDelete()` 增 `archiveRoot` 入参；新增 `archiveSession()`；抽出 `disposeAll()` |
| 4 | `src/index.ts` | 改 | `node:fs/promises` 增 `copyFile,mkdir,rename`、`node:os` 增 `homedir`；`nodeFileSystem` 补 3 原语；`createPorts(ctx, config)` 返回 `HostPorts extends DeletePorts { archiveRoot }`；`createDispatcher(ctx, config)` 按 mode 分派；`apply(ctx, config?)`；`export { Config }` |
| 5 | `src/client/delete-client.ts` | 改 | `preview(sessionId, mode)` / `remove(sessionId, mode)`；`call(endpoint, body: DeleteRequest)` |
| 6 | `src/client/DeleteSessionDialog.tsx` | 改 | `DEFAULT_DISPOSAL_MODE='archive'`（导出）；`mode` state；`fieldset`+原生 radio；预览只发一次（初始档）；文案/按钮/警示按 mode 分支 |
| 7 | `src/client/locales.ts` | 改 | 13 个新键（见接口形状节） |
| 8 | `src/client/delete.module.css` | 改 | `.modes`/`.modeRow`/`.modeText`/`.archiveTarget` |
| 9 | `package.json` | 改 | devDeps 加 `@deepseek-ai/schemastery@3.18.5`；description 更新 |
| 10 | `tsconfig.host.json` | 改 | include 加 `src/config.ts`、`test/config.test.ts` |
| 11 | `README.md` | 改 | 处置模式/归档布局与手工找回/config 键/失败语义/回滚说明/宿主 import 例外 |
| 12 | `cordis.patch.yml` | 改 | 注释同步（`archiveRoot` 可选；裸包名行形态不变） |
| 13 | `build.mjs` | 改（仅注释） | Schemastery 构建内联说明；构建逻辑零改动 |
| 14 | `lib/index.js`、`lib/client.js` | 改（产物） | `pnpm build` 重建入库 |

**测试代码**

| # | 文件 | 动作 | 关键改动点 |
|---|---|---|---|
| 15 | `test/contract.test.ts` | 改 | mode 必填/取值、`archiveRoot` 校验、失败码集合 |
| 16 | `test/config.test.ts` | **新建** | `resolveArchiveRoot()` 解析矩阵 + `Config` schema |
| 17 | `test/delete-session.test.ts` | 改 | fake fs 扩 3 原语；迁移用例矩阵（EXDEV/同名/部分失败/级联/顺序） |
| 18 | `test/index.test.ts` | 改 | 真实临时目录 archive 用例、自定义 `archiveRoot`、`archive-unavailable`、payload 补 mode |
| 19 | `test/delete-client.test.ts` | 改 | 两端点发 `{sessionId, mode}` |
| 20 | `test/delete-dialog.test.tsx` | 改 | 默认迁移、模式切换、`remove` 带 mode、归档路径展示、deleting 禁用 |
| 21 | `test/locale-parity.test.ts` | 改 | required 列表补新键 |

**有意不触达**：`DeleteSessionMenuItem.tsx`（单入口不动，菜单项不能预知框内选择）、
`delete-store.ts`（mode 是对话框内部状态）、`client/index.ts`（注入面与座位不变）、
`test/bundle.test.ts`（其自包含断言正是「Schemastery 必须内联」的守护）、
`client-apply`/`delete-menu-item`/`delete-store` 三个测试（接线/可见性/身份未变）。

## 证据锚（②）

| 模块 | 现状证据 | 对设计的约束 |
|---|---|---|
| `src/contract.ts` | `:38 FAILURE_CODES`、`:49 DeleteRequest`、`:55 DeletePreview`、`:90 readRequest`、`:95 字段白名单过滤`、`:133 parsePreview` | 请求字段是白名单：加 `mode` 必须同步改 `:95`，否则新字段被当未知字段拒绝 |
| `src/delete-session.ts` | `:208 FileSystemOps`（4 原语）、`:274 createSessionFiles`、`:289 locate`、`:342 remove`、`:365 measure`、`:41 DeletePorts`、`:136 previewDelete`、`:168 deleteSession`、`:106 planDelete`、`:81 collectDeleteSet` | 迁移复用 `locate()` 与注入式端口；`remove()` 的「不抛错、返回 `<路径>: <原因>`」是迁移警告模板 |
| `src/index.ts` | `:69 inject`、`:90 apply`、`:115 createDispatcher`、`:124/:128 两端点 if`、`:146 nodeFileSystem`、`:168 createPorts` | 分派点是两个 `if`；`apply` 目前不收 config；缺 `dshHomePath` 时返回 `undefined` → `internal` |
| `src/client/delete-client.ts` | `:41 DeleteClient`、`:81 call`、`:97/:102 preview/remove` | 请求体构造只此一处（`:84`） |
| `src/client/DeleteSessionDialog.tsx` | `:31 DeletePhase`、`:109 phase state`、`:115 挂载即预览`、`:135 confirm`、`:159 footer`、`:190 摘要块`、`:197 不可逆警示` | 五档阶段机不动；预览调用点只 `:117` 一处 |
| `src/client/locales.ts` | `:14 NS`、`:17 zh`、`:64 Key`、`:67 en` | zh 为 canonical；新键必须两语言同补否则 `satisfies` 编译失败 |
| `src/client/delete.module.css` | `:11 .danger`、`:38 .warning`、`:29 .summary` | 复用既有视觉层级；危险色只在 delete 模式挂 |
| `package.json` | `:3 description`、`:64 devDependencies`、`:94 verify:all` | schemastery 走 devDeps（构建内联）；验证入口 `verify:all` |
| `tsconfig.host.json` | `:4-12 include` 逐条列名 | 新文件必须显式加入否则 composite 工程报 TS6307 |
| `build.mjs` | `:109 buildHostCarrier`、`:118 external: ['node:*']` | Schemastery 必须被 esbuild 内联（先例 `session-tool-toggle/src/host/index.ts:51-56`） |
| `src/config.ts`（新建） | 范式：`session-tool-toggle/src/host/index.ts:118-129`（原生 Schemastery `Config`）与 `:51-56`（非原生会让 `--dump-config-schema` 出 error）；依赖先例 `session-tool-toggle/package.json:70` | 必须导原生 Schemastery 图；不得被纯流程层 import |
| `test/config.test.ts`（新建） | 范式：`test/locale-parity.test.ts:1-10` 纯 node 轻量单测 | 依赖全注入，不需要 jsdom |
| `test/delete-session.test.ts` | `:306 FakeFs`、`:326 createFakeFs`、`:346 ops`（fake 仅 4 原语） | fake fs 必须同步扩；EXDEV/同名/中途失败只能在这层覆盖 |
| `test/index.test.ts` | `:210`–`:321` 共 10 处 `{ sessionId: TARGET }` | mode 必填后全部补 `mode`（预期改点） |
| `test/delete-dialog.test.tsx` | `:40 fakeClient`、`:86/:101/:103` 断言单参调用 | 预览形状与签名变更后同步 |
| `test/contract.test.ts` | `:34 FAILURE_CODES 断言`、`:42 合法请求体` | 失败码与请求形状断言必须更新 |
| `README.md` | `:143` type-only 惯例、`:154` tsconfig 清单、`:187` dump 命令、`:33-35/:41-43/:88/:101-105` 能力章节 | 文档同步点已列入触达面 |

## 接口与数据形状（③）

**线上契约**（`src/contract.ts`）：

```ts
export const DISPOSAL_MODES = ['delete', 'archive'] as const
export type DisposalMode = (typeof DISPOSAL_MODES)[number]
export function isDisposalMode(value: unknown): value is DisposalMode

export interface DeleteRequest {
  readonly sessionId: string
  readonly mode: DisposalMode        // 两端点必填（D1）
}

export interface DeletePreview {
  readonly sessionCount: number
  readonly descendantCount: number
  readonly logBytes: number
  readonly archiveRoot: string       // 宿主解析后的归档根绝对路径；与 mode 无关恒返回
}

export const FAILURE_CODES = ['bad-request', 'not-found', 'not-archived',
  'session-live', 'archive-unavailable', 'internal'] as const
```

`readRequest()` 校验：对象 → 白名单 `{sessionId, mode}` → sessionId 三条沿用 →
`isDisposalMode(mode)` 否则「mode 缺失或不是 delete / archive」。`parsePreview()` 追加
`archiveRoot` 非空字符串校验。`DeleteOutcome`（`{removed, warnings}`）、`parseOutcome`、
`parseFailure`、`CHANNEL`、端点名均不变。

**文件端口与流程**（`src/delete-session.ts`）：

```ts
export interface FileSystemOps {
  readdir/lstat/rm/unlink                        // 现有 4 原语不变
  mkdir(path: string, options: { recursive: boolean }): Promise<void>
  rename(from: string, to: string): Promise<void>          // 跨设备抛 code==='EXDEV'
  copyFile(from: string, to: string): Promise<void>
}

export interface DeletePorts {
  /* 现有 7 方法不变 */
  prepareArchive(archiveRoot: string): Promise<void>       // 失败抛错 → archive-unavailable
  archiveFiles(sessionId: string, archiveRoot: string): Promise<readonly string[]>
}

export function createSessionFiles(layout): {
  measure/remove                                  // 不变
  prepareArchive(archiveRoot): Promise<void>
  archive(sessionId, archiveRoot): Promise<readonly string[]>
}

export function previewDelete(ports, sessionId, archiveRoot: string): Promise<PreviewResult>
export function deleteSession(ports, sessionId): Promise<DeleteResult>   // 不变
export function archiveSession(ports, sessionId, archiveRoot: string): Promise<DeleteResult>
// 内部抽出 disposeAll(ports, ids, disposeFiles) —— 删除/迁移共用逐条循环
```

`archive()` 单条动作：`isSafeSessionId` 防御 → `locate()` 扫描 → 对每个源
`<home>/sessions/<项目目录>/<会话id>`：`lstat(dest)` 存在即失败（绝不覆盖，D5）→
`mkdir(dirname(dest), recursive)` → `rename`；非 EXDEV 失败记警告保留源；EXDEV 回退
`copyTree`（符号链接不复制、失败保留源与半成品并双路径点名；全成后 `rm(源)`，rm 失败
记「已移动但源未删」警告）→ `unlink` 投影缓存（同 remove）。警告串格式表见蓝图 ③.2。

**插件配置**（`src/config.ts`，新建）：

```ts
export interface WebUxConfig { readonly archiveRoot?: string }
export const Config = Schema.object({
  archiveRoot: Schema.string().description('会话日志的归档根目录（绝对路径或 ~/ 开头）；缺省为 $DSH_HOME/archive/sessions'),
}).description('web-ux 的删除/归档配置：归档根目录可配')

export interface ArchiveRootContext {
  readonly homePath: (...segments: string[]) => string
  readonly homedir: string
  readonly warn: (message: string) => void
}
export function resolveArchiveRoot(configured: string | undefined, context: ArchiveRootContext): string
```

解析规则：`undefined`/空白 → `homePath('archive','sessions')`；`~/…` →
`resolve(homedir, rest)`；绝对路径 → `resolve(...)`；相对/其它 → 告警一条并回落缺省。

**宿主实实体**（`src/index.ts`）：`apply(ctx, config?)`；`HostPorts extends DeletePorts
{ archiveRoot }`；`createPorts(ctx, config)` 内 `resolveArchiveRoot`；dispatcher 按
`parsed.value.mode` 分派 `archiveSession` / `deleteSession`；`export { Config }`。

**浏览器侧**（`delete-client.ts` / `DeleteSessionDialog.tsx`）：
`preview(sessionId, mode)` / `remove(sessionId, mode)`；`DEFAULT_DISPOSAL_MODE='archive'`
导出；radio `fieldset`（deleting 时 disabled）；归档模式显示
`t('dialog.archive.target', { path: preview.archiveRoot })`。

**locales 13 新键**（zh canonical，en 钉 `satisfies`）：
`dialog.description.archive`、`dialog.mode.legend`（处置方式）、`dialog.mode.archive`
（移动到归档目录）、`dialog.mode.delete`（永久删除）、`dialog.archive.target`（归档目录：
{path}）、`dialog.warning.archive`（可手工找回警示）、`dialog.summary.moveSize`（移动体
积：{size}）、`dialog.confirm.archive`、`dialog.archiving`（正在移动…）、
`dialog.done.archive`、`dialog.warnings.archive`、`dialog.failed.archive`、
`error.archive-unavailable`。既有 `dialog.title`/`menu.delete` 不动（待决 3 推荐值）。

## 决策记录（④）

**栈识别结论**：栈未命中聚合层 writer（TypeScript/esbuild/React 双端插件仓，无
spring-boot/nuxt 特征），用户豁免本次加载（仅本次有效）。设计遵循仓库分层惯例（纯流程
不碰 cordis、实实体唯一绑 fs、client 五件分离）。

| ID | 决策 | 被否方案 | 理由 | 反例 / 失效边界 |
|---|---|---|---|---|
| D1 | `mode` 两端点**必填**，缺失即 `bad-request`，无隐式默认 | 缺省 delete；缺省 archive；端点间不对称 | 已打开的 v1.4.0 旧标签页不带 mode：缺省 delete 会在新宿主上静默物理删除；必填让失败发生在预览阶段（最早失败点），逼用户刷新 | 不对称方案也能防误删，但失败点推迟到确认之后，parser 按端点分叉 |
| D2 | 预览只返回一个 `archiveRoot` 根路径 | `archiveTargets[]` 列表；单会话可选叶子 | 级联集合有 N 个目的地，单叶子必然误导；叶子依赖 locate 的 I/O，源缺失时不可知；用户要核对的是配置解析结果 | 用户想确认「这个会话落在哪」时根不足——已列待决 1 上浮 |
| D3 | 只扩一个失败码 `archive-unavailable`（归档根不可用，任何写动作之前）；逐项失败只进 warnings | 不扩码归 internal；扩 `move-failed`/`archive-conflict` 逐项码 | 根不可用时若逐条 warning+清 registry，会话从界面消失而日志留在原地——用户误以为已归档；前置失败码区分「什么都没发生」与「部分发生」 | 逐项码会把「失败不回滚不中止」拆成两套错误通道 |
| D4 | `FileSystemOps` 扩 `mkdir`/`rename`/`copyFile` 三原语，递归 copy 写在纯流程（`copyTree`） | 端口给 `cpTree`；适配器用 `fs.cp` | 算法在纯流程里，fake fs 才能覆盖 EXDEV/同名/中途失败三分支；fake 实现 `cp` 等于把被测算法复制进测试 | `fs.cp` 处理符号链接/权限位更全——自写 copyTree 对符号链接选择失败保留源；文件系统特性将来需要再扩原语 |
| D5 | 目标已存在 → 该项失败绝不覆盖；显式 `lstat(dest)` 先行再 `rename` | 先 mkdir 再 rename 进去；先删 dest 再 rename | POSIX rename 会静默顶替空目录，不显式检查会静默覆盖归档里的同名空目录 | `lstat`→`rename` 间有 TOCTOU 窗口（窗口内 dest 为空目录仍会被顶替）；归档目录本插件独占，残余风险记录，Node 无 `renameat2(RENAME_NOREPLACE)` 接口 |
| D6 | 删除与迁移共用 `disposeAll()`：逐条 cleanup→文件动作→emit，失败不回滚不中止 | 迁移失败保留 registry 供重试；整体回滚 | 同构由同一段循环保证（非两段复制代码）；迁移失败时数据仍在 sessions/ 未丢，warning 点名源与目标 | 全项失败时用户看到「移动 0 个但会话消失」——D3 只覆盖根不可用；重跑会得 `not-archived`（registry 已清），与删除一致的已知代价，不做特例 |
| D7 | config 键名 `archiveRoot`，缺省 `homePath('archive','sessions')`（跟随 `$DSH_HOME`），支持绝对/`~/`，相对路径告警回落 | 键名 `archiveDir` 等；相对路径按 cwd 解析 | `$DSH_HOME` 可迁移，写死 `~/.dsh` 会在改址后搬错位置；daemon 进程 cwd 不可预测 | `DSH_HOME`≠`~/.dsh` 时用户按文档猜错位置——由预览回显解析后绝对路径暴露真相 |
| D8 | 原生 `input[type=radio]`+`fieldset/legend` 做模式单选 | primitives `SegmentedControl`；自定义按钮组 | radio 语义即「多选一设置项」，键盘/读屏开箱即用；SegmentedControl 语义是 tablist（切换面板） | 原生 radio 视觉与设计系统不完全一致——用 `--dsw-alias-*` 令牌对齐（同现有 css 做法） |
| D9 | 预览只发一次（带初始默认档），切模式不重发；执行带最终模式 | 每次切换重发；预览不带 mode | 预览四个数字与 mode 无关，重发只增加漂移窗口；执行端本就重校验；preview 带 mode 为将来模式相关预览留口子 | 将来预览若需逐项目的地列表则本决策需重开 |
| D10 | `DeleteOutcome` 形状不变：不回声 mode、不回声目的地 | 增 `mode` 回声；增 `archiveTargets`；改 `removed` 为 `disposed` | 界面自己知道请求的模式，回声制造两个真相；目的地已从预览拿到并展示；改字段名牵动契约/parser/测试零收益 | 将来「同一请求混合模式」时局部 state 不够——那时再加回声 |
| D11 | `delete-store`/`DeleteSessionMenuItem` 不改，mode 是对话框局部状态 | mode 写进请求 store（点菜单时定死） | 菜单点击时用户还没看见预览与说明，此时定模式是盲选；store 身份是「处理哪一行」 | 将来菜单若提供「直接永久删除」快捷项需 store 携带预设——与单入口冲突，属另一次变更 |
| D12 | `archiveRoot` 作为 `previewDelete()` 入参原样回声进 `DeletePreview`，不拆 `PreviewStats` 再在接线层合成 | 拆内部类型；预览不归档根另设端点 | 两套同形四字段类型会漂移；预览结果本来就是「给界面看的形状」；接线层保持一端点一形状的简单映射 | 流程层因此多知道一个宿主概念（字符串），纯度略降——不解析不 I/O，仍可纯 node 驱动 |

- 执行环境：直用主工作区。创建于 2026-11-04

## 逐任务组实现要点（⑤）

与 `tasks.md` 分组一一对齐（组间串行、组内可并行）：

- **G1 契约+配置+文案地基**：contract 演进（mode 必填/archiveRoot/失败码）；`config.ts` 新建（Schemastery+解析）；三个测试文件同步。验证：vitest 三个文件全绿 + host tsc。
  - **终形态（2026-11-04 执行实测）**：contract 49 用例 / config 12 用例 / locale-parity 4 用例，干净窗口 65/65 绿；`@deepseek-ai/schemastery@3.18.5` 安装链接成功（lockfile 仅 3 行 importer，install 1m2s）；`config.ts` 按代码设计 ③.3 定稿（trim、`~\` 支持、单条 warn、永不抛错、原生 Schemastery 图）。host tsc 过渡缺口见 tasks.md 附录 R1（1.1 勾选推迟至 2.1 复核）；Schemastery 原生图必要性实测依据：`--dump-config-schema` 只认原生图（`dsh-app-boot` 的 `isNativeConfigSchema`），非原生记 error 诊断。
- **G2 宿主纯流程与文件工厂**：`FileSystemOps` 三原语、`DeletePorts` 两方法、`archiveSession`+`disposeAll`、`createSessionFiles.archive`（locate 复用、`copyTree`、警告串）；fake fs 扩原语与 11 条用例矩阵（迁移成功/EXDEV/同名/中途失败/级联/顺序/根不可用/非法 id/源缺失/缓存失败/预览回声）。验证：`delete-session.test.ts` 全绿且既有 8 用例不改断言通过。
  - **终形态（2026-11-04 执行实测）**：61/61 绿（改造前 36、新增 25）；**既有 deleteSession 用例实测 7 条**（非 8，规划期笔误）断言零改动通过（仅一处既有自定义 FileSystemOps 字面量补 3 个空实现适配接口扩展）；矩阵 6（真实 registry 顺序断言）按设计归 G3 的 `fakeRegistry.calls` 断言；③.2 表未枚举的失败（lstat 非 ENOENT、copyTree 内 mkdir/readdir 失败）复用表内「rename/mkdir 失败」行格式 `<src> -> <dest>: <原因>`；`disposeAll` logger 文案沿用原删除文案保证删除告警序列逐字节不变。host tsc 过渡缺口已收敛至 `src/index.ts` 3 条（R1 复核①，归 3.1）。
- **G3 宿主实实体接线**：`index.ts` 全部接线 + `export { Config }`；`package.json` devDeps；`test/index.test.ts` 真实临时目录用例（预览回声/自定义根/归档执行断言 `existsSync`/`archive-unavailable` 零副作用/delete 回归不建归档目录/缺 mode 拒）；`build.mjs`+`cordis.patch.yml` 注释。验证：vitest（含 bundle 自包含）+ build + `node -e` 断言 `Config` 可从产物 import 且产物模块词只有 `node:*`。
  - **终形态（2026-11-04 执行实测）**：index+bundle 25/25 绿、**host tsc 全绿（0 诊断，R1 收口）**；真实临时目录用例覆盖矩阵 6（`fakeRegistry.calls` 顺序 `unarchive→unpin→detach`）与 `archive-unavailable` 零副作用；子代理以 out-of-tree esbuild 预演 A10 链（模块词仅 `node:*`、`Config({archiveRoot:'/tmp/x'})` 输出符合），正式重建仍归 6.2。实现差异：createPorts 保留既有 try 包裹（伪码为 try 外，解析抛错映射 `internal`，裁定接受，见 tasks.md R2）。
- **G4 浏览器半**：client 调用面带 mode；对话框单选与分支文案；css；两个测试文件（默认档/切换/`remove` 断言/deleting 禁用/预览失败无单选）。验证：vitest 两文件 + client tsc。
  - **终形态（2026-11-04 执行实测）**：delete-dialog 10/10 绿、client tsc 全绿（R1 client 侧收口）；相邻 4 个 client 测试文件 30 用例回归绿；css 四类名 + legend/radio/disabled 三条支撑规则（6 处 `--dsw-alias-*` 令牌带静态兜底）；esbuild 干跑确认类名 scoped 导出正常。裁定留档见 tasks.md R3（radio 双重 disabled、danger 不断言、预览失败 mode 分支文案、done 收单选）。
- **G5 文档、产物与发布面**：README 全面更新；package/patch/build 注释定稿；`pnpm build` 重建 `lib/` 入库；`verify:all` 全绿；（条件项）link 安装后 `--dump-config-schema` 校验。
  - **终形态（2026-11-04 执行实测）**：README +132/−32（新增处置模式/迁移范围/归档目录与手工找回/版本迁移四节，版本口径按 R4 裁定为「v1.5.0 及更早」）；lib 两产物重建入库，A10 守护在新字节上 9/9；`verify:all` 退出码 0（lint 0 errors、tsc 强制全量 0 诊断、**15 文件 233 用例全过**），产物自包含仅 `node:fs/promises`/`node:os`/`node:path`，规范入口构建 sha256 确定性成立（R5）。条件项（link 安装 + `--dump-config-schema`）留待用户部署时实测。

## 假设（⑥，实现时按此执行，违反需回到设计）

- A1 双端同版本部署；唯一跨版本场景（旧标签页+新宿主）由 mode 必填在预览暴露。
- A2 归档根配在 sessions 树内时由「目标已存在」兜底（D5），不加额外拒绝逻辑。
- A3 会话目录内出现符号链接 → 该项迁移失败保留源（不静默丢数据）。
- A4 投影缓存是纯缓存，迁移模式直接删除（宿主可重建）。
- A5 共享附件任何模式不动。
- A6 归档目录生命周期归用户；插件只创建与搬入；升级/卸载后为无主数据，README 写明。
- A7 `lstat(dest)`→`rename` 的 TOCTOU 残余窗口可接受（归档目录插件独占）。
- A8 会话 id 校验沿用 `isSafeSessionId`；项目目录名来自真实 `readdir` 不二次校验。
- A9 不预检磁盘空间：`copyFile` 失败即该项失败、源保留。
- A10 `Config` 是宿主运行时唯一 import 例外：Schemastery 由 esbuild 内联，运行时不解析任何 `@deepseek-ai/*`（bundle.test 断言守护）。

## Risks / Trade-offs

- [跨设备迁移是常态而非边缘] → EXDEV 回退 `copyTree` 必须真实现并测试（G2 矩阵 2）。
- [copy 中途失败留下双份状态] → 警告双路径点名源与目标，README 给手工处理指引。
- [D6 全项失败时会话从界面消失但数据未搬] → 警告点名源路径；与删除语义一致的已知代价（设计接受，见 D6 反例）。
- [「归档」与工作区 archive 撞词] → 文案统一用「移动到归档目录」，警示区说明目录语义。
- [旧标签页跨版本] → mode 必填使预览即失败，README 版本迁移节写明「刷新即可」。
- [Schemastery 内联] → bundle.test 的自包含断言守护；产物出现 esbuild 依赖路径注释属正常（不是 import）。

## Migration Plan

实现按 G1→G5 顺序部署（组间串行）；`pnpm build` 重建 `lib/` 随提交；profile 侧按既有
tag 流程升级安装。回滚到 v1.4.0：旧宿主对新标签页（带 mode 请求）预览即 `bad-request`，
刷新回旧客户端即恢复原行为；已迁移数据留在归档目录不受影响；归档目录删除不影响任何
dsh 功能。

## Open Questions

以下 3 条来自设计线上浮，推荐值已用于本设计与 tasks；若分歧点提问改变答案，同步修订
本文与 tasks 后再校验落档：

1. **预览目标路径粒度**（推荐：只给归档根 `archiveRoot`；备选：目标会话叶子路径 / 根+可选叶子）——影响契约字段数与 `previewDelete` 是否做 I/O。
2. **失败码命名与粒度**（推荐：仅 `archive-unavailable` 前置码；备选：复用 `internal` / 扩逐项码）。
3. **迁移模式对话框标题**（推荐：不随模式变，保留「删除已归档会话」；备选：改「归档已归档会话」/中性化「处理已归档会话」）。
