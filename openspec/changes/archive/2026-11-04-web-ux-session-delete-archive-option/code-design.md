# code-design.md — web-ux 删除会话：物理删除 / 迁移归档二选一（代码级蓝图）

> 阶段 1.7 产物。上游 `decisions.md` 的 7 条结论是硬约束，本文不复述其论证，只回答
> 「改哪些文件、怎么改、接口与数据长什么样、为什么这么定」。所有路径均相对根仓
> `/home/xuqinqin/develop/person/dsh-plugins`（本次变更全部落在该单仓的
> `plugins/web-ux/` 一个包内，无跨包改动）。

---

## ① 触达面清单

### 1.1 生产代码

| # | 文件（仓：`dsh-plugins` 根仓） | 动作 | 改动意图 | 关键改动点 |
|---|---|---|---|---|
| 1 | `plugins/web-ux/src/contract.ts` | 改 | 线上契约演进：请求带处置模式，预览带宿主解析后的归档根 | `DISPOSAL_MODES` / `DisposalMode` / `isDisposalMode()`；`DeleteRequest.mode` **必填**；`readRequest()` 允许字段白名单加 `mode` 并校验取值；`DeletePreview.archiveRoot` + `parsePreview()` 校验；`FAILURE_CODES` 追加 `archive-unavailable` |
| 2 | `plugins/web-ux/src/config.ts` | **新建** | 宿主层配置：Schemastery schema + 归档根解析纯函数 | `WebUxConfig`、`Config`（原生 Schemastery，`archiveRoot` 键）、`ArchiveRootContext`、`resolveArchiveRoot()` |
| 3 | `plugins/web-ux/src/delete-session.ts` | 改 | 纯流程新增迁移执行路径；文件工厂新增 move 能力 | `FileSystemOps` 扩 `mkdir` / `rename` / `copyFile`；`DeletePorts` 扩 `prepareArchive` / `archiveFiles`；`createSessionFiles()` 增 `prepareArchive` / `archive`；`previewDelete()` 增 `archiveRoot` 入参；新增 `archiveSession()`；抽出内部 `disposeAll()` 让删除/迁移逐条语义同构 |
| 4 | `plugins/web-ux/src/index.ts` | 改 | 宿主实载体接线：实测文件系统原语、按 mode 分派、读取插件配置、导出 `Config` | `node:fs/promises` 增 `copyFile,mkdir,rename`、`node:os` 增 `homedir`；`nodeFileSystem` 补 3 个原语；`createPorts(ctx, config)` 解析归档根并返回 `HostPorts extends DeletePorts { archiveRoot }`；`createDispatcher(ctx, config)` 按 `mode` 分派；`apply(ctx, config?)`；`export { Config }`（包入口必须转发 `Config`） |
| 5 | `plugins/web-ux/src/client/delete-client.ts` | 改 | 调用面携带模式 | `DeleteClient.preview(sessionId, mode)` / `remove(sessionId, mode)`；内部 `call(endpoint, body: DeleteRequest)` 发送 `{sessionId, mode}` |
| 6 | `plugins/web-ux/src/client/DeleteSessionDialog.tsx` | 改 | 确认框内模式单选 + 模式相关文案/确认语义 | `DEFAULT_DISPOSAL_MODE = 'archive'`（导出供测试）；`mode` 局部 state；`fieldset` + 原生 radio；预览只发一次（初始模式）；模式切换只改本地文案；确认按钮文案/危险色、摘要体积行、警示区、完成文案、失败文案全部按 mode 分支 |
| 7 | `plugins/web-ux/src/client/locales.ts` | 改 | 双语文案 | 新增 13 个键（清单见 ③.7），`en` 用 `satisfies Record<Key, string>` 钉住 |
| 8 | `plugins/web-ux/src/client/delete.module.css` | 改 | 模式选择区块样式 | `.modes` / `.modeRow` / `.modeText` / `.archiveTarget`（复用 `.warning`、`.summary`、`.danger`） |
| 9 | `plugins/web-ux/package.json` | 改 | 依赖与描述 | devDependencies 加 `"@deepseek-ai/schemastery": "3.18.5"`（与 session-tool-toggle 同版本、已在根 `minimumReleaseAgeExclude` 中）；`description` 从「irreversible deletion」改为「delete-or-archive」 |
| 10 | `plugins/web-ux/tsconfig.host.json` | 改 | 类型工程 include（composite 工程要求逐条列名） | 增 `src/config.ts`、`test/config.test.ts` |
| 11 | `plugins/web-ux/README.md` | 改 | 用户文档 | 「删除已归档会话」章节补模式二选一、归档布局与手工找回、config 键、失败语义；更新「双端结构」「构建」（tsconfig 清单）、「安装到 profile」（`--dump-config-schema` 的 Config）、「版本迁移」回滚说明；宿主半 import 例外（Schemastery 由构建内联） |
| 12 | `plugins/web-ux/cordis.patch.yml` | 改 | 注释同步 | 说明 `archiveRoot` 为可选配置键、无 `config:` 段即可运行（裸包名行形态**不变**） |
| 13 | `plugins/web-ux/build.mjs` | 改（仅注释） | 构建契约说明 | 头注释补一句：宿主半现在内联 Schemastery（Config 用），external 仍只有 `node:*`；**构建逻辑零改动** |
| 14 | `plugins/web-ux/lib/index.js`、`lib/client.js` | 改（产物） | 产物随仓库提交 | 实现完成后 `pnpm build` 重新生成并入库 |

### 1.2 测试代码

| # | 文件 | 动作 | 改动意图 |
|---|---|---|---|
| 15 | `plugins/web-ux/test/contract.test.ts` | 改 | mode 必填/取值、`archiveRoot` 校验、失败码集合 |
| 16 | `plugins/web-ux/test/config.test.ts` | **新建** | `resolveArchiveRoot()` 解析矩阵 + `Config` schema 接受/缺省 |
| 17 | `plugins/web-ux/test/delete-session.test.ts` | 改 | fake fs 扩 3 原语；迁移成功、EXDEV 回退、同名冲突、部分失败、级联迁移、registry 顺序 |
| 18 | `plugins/web-ux/test/index.test.ts` | 改 | 真实临时目录上的 archive 执行、自定义 `archiveRoot`、`archive-unavailable`、delete 回归、payload 补 `mode` |
| 19 | `plugins/web-ux/test/delete-client.test.ts` | 改 | 两个端点发送 `{sessionId, mode}`、坏形状仍归一 |
| 20 | `plugins/web-ux/test/delete-dialog.test.tsx` | 改 | 默认迁移、模式切换文案/确认语义、`remove` 带 mode、完成文案、归档路径展示、deleting 时单选禁用 |
| 21 | `plugins/web-ux/test/locale-parity.test.ts` | 改 | required 列表补新键（zh/en 键集一致性测试自动覆盖其余） |

### 1.3 有意不触达（附理由，防过度设计）

| 文件 | 不改的理由 |
|---|---|
| `src/client/DeleteSessionMenuItem.tsx` | Q1 已定单入口不动；菜单项**不能**预知用户在框内的选择，模式状态放在对话框（见 ④ D11） |
| `src/client/delete-store.ts` | 跨 entry store 只承载「要删哪一行」的身份；mode 是对话框内部状态，写进 store 等于在点菜单时定死模式 |
| `src/client/index.ts`（含 `DELETE_DIALOG_ID` / `DELETE_DIALOG_ORDER` 与 slot 声明） | 对话框入口的注入面（`requests` / `client`）不变，座位与顺序也不变；模式不来自接线层 |
| `test/bundle.test.ts` | 它的「宿主半只允许 `node:*` import」正是本次「Schemastery 必须被构建内联（不得外置）」的守护；预期零改动即通过（若失败说明把 schemastery 放进了 external） |
| `test/client-apply.test.ts`、`test/delete-menu-item.test.tsx`、`test/delete-store.test.ts` | 接线、菜单可见性、store 身份均未变 |
| `openspec/changes/web-ux-session-delete-archive-option/**` | 属 spec 流程产物（proposal/specs/design/tasks），由落档步骤生成，不是实现任务；受影响的既有 requirement 见 ⑤ G5 |

---

## ② 证据锚

（现状代码事实：每个触达模块 ≥1 条 `file:line` + 符号名；新建文件标「新建」并给出范式证据。）

| 模块 | 现状证据（file:line + 符号） | 对设计的约束 |
|---|---|---|
| `src/contract.ts` | `contract.ts:38 export const FAILURE_CODES = [...]`；`:49 export interface DeleteRequest`；`:55 export interface DeletePreview`；`:90 function readRequest`；`:95 const extra = Object.keys(record).filter((key) => key !== 'sessionId')`；`:133 export function parsePreview` | 请求字段是**白名单**：加 `mode` 必须同步改 `:95` 的过滤，否则新字段会被当「未知字段」拒绝（有意的版本漂移防护） |
| `src/delete-session.ts` | `delete-session.ts:208 export interface FileSystemOps`（仅 4 原语）；`:274 export function createSessionFiles`；`:289 async function locate`；`:342 async remove`；`:365 async measure`；`:41 export interface DeletePorts`；`:136 export function previewDelete`；`:168 export function deleteSession`；`:106 export function planDelete`；`:81 export function collectDeleteSet` | 迁移必须复用 `locate()`（跨项目目录扫描）与 `DeletePorts` 注入式结构；`remove()` 的「不抛错、返回 `<路径>: <原因>`」形状是迁移警告的模板 |
| `src/index.ts` | `index.ts:69 export const inject`；`:90 export function apply(ctx: Context): void`；`:115 export function createDispatcher`；`:124 if (endpoint === PREVIEW_ENDPOINT)`；`:128 if (endpoint === DELETE_ENDPOINT)`；`:146 const nodeFileSystem: FileSystemOps`；`:168 function createPorts(ctx: Context)` | 分派点是两个 `if`；`apply` 目前**不收 config**；`nodeFileSystem` 是唯一 `node:fs/promises` 适配层；`createPorts` 在缺 `dshHomePath` 时返回 `undefined` → `internal` |
| `src/client/delete-client.ts` | `delete-client.ts:41 export interface DeleteClient`；`:81 const call = async (endpoint, sessionId)`；`:97 async preview`；`:102 async remove` | 请求体只有 `sessionId` 一处构造（`:84`），携带 mode 只改这一个函数 |
| `src/client/DeleteSessionDialog.tsx` | `DeleteSessionDialog.tsx:31 export type DeletePhase`；`:108 function DeleteSessionBody`；`:109 const [phase, setPhase]`；`:115 useEffect` 挂载即预览；`:135 const confirm`；`:159 const footer`；`:190 preview !== null && phase !== 'failed'` 摘要块；`:197 dialog.warning.irreversible` | 阶段机五档不动，只在 `ready`/`deleting` 插入模式单选与按 mode 分支的文案；预览调用点只有 `:117` 一处 |
| `src/client/locales.ts` | `locales.ts:14 export const NS`；`:17 export const zh`；`:64 export type Key`；`:67 export const en` | zh 是 canonical 形状，新增键必须两语言同补，否则 `satisfies Record<Key, string>` 编译失败 |
| `src/client/delete.module.css` | `delete.module.css:11 .danger`；`:38 .warning`；`:29 .summary`；`:69 .warnings` | 复用既有视觉层级，只补模式区块；危险色只在 delete 模式挂 |
| `package.json`（web-ux） | `package.json:3 description`；`:64 devDependencies`；`:94 scripts`（`verify:all` = lint→typecheck→build→test） | 加 schemastery 走 devDependencies（构建内联）；验证入口是 `verify:all`（build 在 test 前，`test/bundle.test.ts` 依赖产物） |
| `tsconfig.host.json` / `tsconfig.client.json` | `tsconfig.host.json:4-12 include`（逐条列名：`src/contract.ts`、`src/delete-session.ts`、`src/index.ts` + 4 个宿主测试）；`tsconfig.client.json:4-16 include` | 新文件必须显式加入 include，否则 composite 工程报 TS6307 |
| `build.mjs` | `build.mjs:109 async function buildHostCarrier()`；`:118 external: ['node:*']` | 宿主产物唯一 external 是 `node:*`：Schemastery **必须**被 esbuild 内联（与 session-tool-toggle 同款；其注释见 `session-tool-toggle/src/host/index.ts:51-56`） |
| `src/config.ts`（**新建**） | 无现状行号；范式证据：`plugins/session-tool-toggle/src/host/index.ts:118-129`（`export const Config = Schema.object({...})` 的原生 Schemastery 写法）与 `:51-56`（非原生 `Config` 会让 `--dump-config-schema` 出 error 诊断）；依赖先例 `plugins/session-tool-toggle/package.json:70`（`"@deepseek-ai/schemastery": "3.18.5"`） | 新模块必须导**原生 Schemastery** 图、由 esbuild 内联；不得被 `delete-session.ts`（纯流程）import |
| `test/config.test.ts`（**新建**） | 无现状行号；范式证据：`test/locale-parity.test.ts:1-10`（纯 node 环境、直接 import 源码模块的轻量单测形态） | 纯 node 单测即可（`resolveArchiveRoot` 的依赖全部注入），不需要 jsdom |
| `test/delete-session.test.ts` | `:306 interface FakeFs`、`:326 function createFakeFs()`、`:346 const ops: FileSystemOps`（fake 只有 4 原语） | 扩原语后 fake fs 必须同步扩，否则类型报错；EXDEV/同名冲突/部分失败只能在这一层覆盖 |
| `test/index.test.ts` | `:210/:229/:236/:250/:257/:265/:279/:293/:306/:321` 全部以 `{ sessionId: TARGET }` 调 dispatcher | mode 必填后这些 payload 全部要补 `mode`，否则测试会按 `bad-request` 失败（这是**预期**的同步改点） |
| `test/delete-dialog.test.tsx` | `:40 fakeClient().preview` 返回三字段；`:86/:101/:103` 断言「永久删除」与 `remove('session-1')` 单参 | 预览形状与调用签名改变后必须同步，否则默认迁移模式会把用例全部变成 delete 语义 |
| `test/contract.test.ts` | `:34 expect(FAILURE_CODES).toEqual([...])`；`:42` 合法请求体只有 `sessionId` | 失败码与请求形状的断言必须更新，否则新契约没有测试覆盖 |
| `README.md` | `:143`「宿主半对 `@deepseek-ai/*` 一律 type-only import」；`:154` host tsconfig 文件清单；`:187 --dump-config-schema`；`:33-35` 预览与确认；`:41-43` 删除范围；`:88` 顺序；`:101-105` 非目标 | 文档要写明 Schemastery 是唯一例外（构建内联，不产生运行时依赖）；tsconfig 清单与 dump 校验命令要跟进 |

---

## ③ 接口与数据形状

### 3.1 线上契约（`src/contract.ts`）

```ts
/** 处置模式：delete = 物理删除；archive = 迁移到归档根目录。 */
export const DISPOSAL_MODES = ['delete', 'archive'] as const
export type DisposalMode = (typeof DISPOSAL_MODES)[number]

/** 判断一个值是否为已知处置模式。 */
export function isDisposalMode(value: unknown): value is DisposalMode

/** 两个端点共用的请求体：目标会话 id + 处置模式（必填）。 */
export interface DeleteRequest {
  readonly sessionId: string
  /** 处置模式；两个端点都必填（见 ④ D1）。 */
  readonly mode: DisposalMode
}

/** 预览结果。 */
export interface DeletePreview {
  readonly sessionCount: number
  readonly descendantCount: number
  readonly logBytes: number
  /** 宿主解析后的归档根绝对路径；与 mode 无关，两种模式下都返回。 */
  readonly archiveRoot: string
}

/** 失败码：追加 archive-unavailable（见 ④ D3）。 */
export const FAILURE_CODES = [
  'bad-request', 'not-found', 'not-archived', 'session-live', 'archive-unavailable', 'internal',
] as const
```

`readRequest()` 的校验顺序（保持现有风格，逐条给一句可读原因）：

| 检查 | 不通过时的 message |
|---|---|
| 请求体是对象且非数组 | `请求体不是对象` |
| 字段白名单 = `sessionId` + `mode` | `请求体含未知字段：<keys>` |
| `sessionId` 非空字符串、≤255、无控制字符 | 沿用现有三条 |
| `isDisposalMode(record['mode'])` | `mode 缺失或不是 delete / archive` |

`parsePreview()` 追加：`archiveRoot` 必须是非空字符串，否则 `预览响应的 archiveRoot 缺失或不是非空字符串`。

线上样例：

```jsonc
// 请求（两个端点同形）
{ "sessionId": "0b6f…", "mode": "archive" }

// preview-delete 响应
{ "sessionCount": 3, "descendantCount": 2, "logBytes": 2048,
  "archiveRoot": "/home/u/.dsh/archive/sessions" }

// delete-session 响应（形状不变，无 mode 回声，见 ④ D10）
{ "removed": ["0b6f…", "1a2b…"], "warnings": [] }

// 拒绝
{ "code": "archive-unavailable", "message": "archive root \"/x/sessions\" is not usable: EACCES…" }
```

### 3.2 宿主纯流程与文件工厂（`src/delete-session.ts`）

```ts
/** 文件操作端口：工厂用这七个原语，测试可注入内存实现。 */
export interface FileSystemOps {
  readdir(path: string): Promise<readonly DirectoryEntry[]>
  lstat(path: string): Promise<{ readonly size: number; isDirectory(): boolean }>
  rm(path: string, options: { readonly recursive: boolean; readonly force: boolean }): Promise<void>
  unlink(path: string): Promise<void>
  /** 新建目录；`recursive` 允许缺父级、允许已存在。 */
  mkdir(path: string, options: { readonly recursive: boolean }): Promise<void>
  /** 同设备原子重命名；跨设备抛 `code === 'EXDEV'`。 */
  rename(from: string, to: string): Promise<void>
  /** 复制单个文件（不含目录）。 */
  copyFile(from: string, to: string): Promise<void>
}

export interface DeletePorts {
  listStoredHeaders(): Promise<readonly StoredSessionHeader[]>
  isLive(sessionId: string): boolean
  isArchived(sessionId: string): boolean
  cleanupRegistry(sessionId: string): Promise<void>
  measureFiles(sessionId: string): Promise<number>
  removeFiles(sessionId: string): Promise<readonly string[]>
  /** 建出归档根（递归）；失败抛错，由流程映射为 archive-unavailable。 */
  prepareArchive(archiveRoot: string): Promise<void>
  /** 把该会话的日志目录移动到归档根下并删除投影缓存；返回失败项，不抛错。 */
  archiveFiles(sessionId: string, archiveRoot: string): Promise<readonly string[]>
  emitRemoved(sessionId: string): void
  warn(message: string, error?: unknown): void
}

/** 文件工厂的返回面（在现有 measure/remove 上扩两个动作）。 */
export function createSessionFiles(layout: SessionFileLayout): {
  measure(sessionId: string): Promise<number>
  remove(sessionId: string): Promise<readonly string[]>
  prepareArchive(archiveRoot: string): Promise<void>       // mkdir(archiveRoot, {recursive:true})
  archive(sessionId: string, archiveRoot: string): Promise<readonly string[]>
}

export async function previewDelete(
  ports: DeletePorts,
  sessionId: string,
  archiveRoot: string,          // 宿主解析后的路径，仅回声进 DeletePreview
): Promise<PreviewResult>

export async function deleteSession(ports: DeletePorts, sessionId: string): Promise<DeleteResult>

export async function archiveSession(
  ports: DeletePorts,
  sessionId: string,
  archiveRoot: string,
): Promise<DeleteResult>
```

流程伪码（与删除**同构**由结构保证）：

```ts
// 两个入口共享：planDelete（同一套 not-found / not-archived / session-live）
//   → 各自的前置动作 → disposeAll（逐条 cleanup → 文件动作 → emit，失败只记 warning）
async function disposeAll(
  ports: Pick<DeletePorts, 'cleanupRegistry' | 'emitRemoved' | 'warn'>,
  ids: readonly string[],
  disposeFiles: (id: string) => Promise<readonly string[]>,
): Promise<DeleteOutcome>

export async function archiveSession(ports, sessionId, archiveRoot) {
  const plan = await planDelete(sessionId, ports)
  if (!plan.ok) return plan
  if (!isAbsolute(archiveRoot)) {
    return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not an absolute path` }
  }
  try {
    await ports.prepareArchive(archiveRoot)          // 任何写动作之前
  } catch (error) {
    return { ok: false, code: 'archive-unavailable', message: `archive root "${archiveRoot}" is not usable: ${reasonOf(error)}` }
  }
  return { ok: true, outcome: await disposeAll(ports, plan.ids, (id) => ports.archiveFiles(id, archiveRoot)) }
}
```

迁移集合与删除集合**同源**：两侧都走 `planDelete()` → `collectDeleteSet()`，因此
「目标 + `origin === 'subagent'` 后代闭包、fork 不牵连、not-found / not-archived /
session-live 三种前置拒绝」逐字一致；差异只在「文件动作」与「前置的归档根准备」。
每个 id 的文件迁移互相独立（一个失败不影响其余）；共享附件存储任何模式都不动。

`archive(sessionId, archiveRoot)` 的单条会话动作（每个 `locate()` 命中项独立执行）：
```
1. isSafeSessionId 不通过 → 返回一条警告，不触碰文件系统（同 remove）
2. locate(sessionId) → { paths, warnings }（复用 delete-session.ts:289 的扫描）
3. 对每个 src = <home>/sessions/<项目目录>/<会话id>：
   dest = join(archiveRoot, basename(dirname(src)), sessionId)   // 保留项目层级
   a. lstat(dest) 成功                → 该项失败：already exists（绝不覆盖）；保留 src
      lstat 非 ENOENT                  → 该项失败（记录原因）
   b. mkdir(dirname(dest), {recursive:true}) 失败 → 该项失败
   c. rename(src, dest) 成功          → 继续下一项
   d. rename 抛非 EXDEV               → 该项失败（记录原因），保留 src
   e. rename 抛 EXDEV                 → copyTree(src, dest)
        copyTree 任一失败 → 保留 src、保留 dst 半成品，记双路径警告
        copyTree 全部成功 → rm(src, {recursive:true, force:false})
              rm 失败 → 记「已移动但源未删掉」警告（数据在 dest，不丢）
4. unlink(<home>/storages/session_projcache/sessions/<id>.json)：
   非 ENOENT 失败记警告（与 remove 相同）
5. 返回全部警告（顺序：定位警告 → 逐项移动警告 → 缓存警告）
```

`copyTree(from, to)` 的边界（纯流程内实现，不交给 `fs.cp`）：

```ts
// 只在 EXDEV 回退里使用；返回失败项，不抛错
1. mkdir(to, { recursive: false })        // 目的地必须不存在，EEXIST 即失败
2. readdir(from) → 逐 entry：
   - entry.isSymbolicLink?.() === true → 失败（不跟随、不复制；源保留）
   - entry.isDirectory()             → 递归 copyTree(join(from,n), join(to,n))
   - 其它                            → copyFile(join(from,n), join(to,n))
3. 任一失败即标记该源「不可 rm」（绝不在不完整复制后删源）
```

警告串格式（机器可读、界面原样列出，与删除的 `<路径>: <原因>` 同一风格）：

| 场景 | 警告串 |
|---|---|
| rename/mkdir 失败 | `<src> -> <dest>: <原因>` |
| 目标已存在 | `<dest> already exists; the session directory was not moved (source kept at <src>)` |
| copy 失败 | `copy <src> -> <dest>: <原因> (the source was kept; the partial copy at the destination needs manual cleanup)` |
| copy 后 rm 源失败 | `moved to <dest> but the source could not be removed: <src>: <原因>` |
| 源内含符号链接 | `<path>: symbolic link was not copied (the source directory was kept)` |
| 投影缓存失败 | `<cachePath>: <原因>`（同删除） |
| id 不安全 | `session id <json> is not a safe path segment; nothing was moved` |
| 文件动作意外抛错 | `files: <id>: <原因>`（`disposeAll` 兜底，与删除同款） |

### 3.3 插件配置（`src/config.ts`，新建）

```ts
import Schema from '@deepseek-ai/schemastery'

/** 插件配置（与 Config schema 形状一致）。 */
export interface WebUxConfig {
  /** 会话日志的归档根目录：绝对路径或 `~/` 开头；省略 = `$DSH_HOME/archive/sessions`。 */
  readonly archiveRoot?: string
}

/** 原生 Schemastery schema：`--dump-config-schema` 只认原生图（同 session-tool-toggle）。 */
export const Config = Schema.object({
  archiveRoot: Schema.string()
    .description('会话日志的归档根目录（绝对路径或 ~/ 开头）；缺省为 $DSH_HOME/archive/sessions'),
}).description('web-ux 的删除/归档配置：归档根目录可配')

/** 解析归档根所需的宿主事实（全部注入，便于纯 node 单测）。 */
export interface ArchiveRootContext {
  readonly homePath: (...segments: string[]) => string
  readonly homedir: string
  readonly warn: (message: string) => void
}

/** 把配置值归一成绝对路径；不可用时告警并回落缺省（永不抛错）。 */
export function resolveArchiveRoot(configured: string | undefined, context: ArchiveRootContext): string
```

解析规则：

| 输入 | 结果 |
|---|---|
| `undefined` / 空串 / 纯空白 | `join(homePath(), 'archive', 'sessions')`（即 `~/.dsh/archive/sessions`；跟随 `DSH_HOME` 迁移） |
| `~/…` 或 `~\…` | `resolve(homedir, rest)`（`..` 归一） |
| 绝对路径 | `resolve(configured)`（去掉尾部分隔符与 `..`） |
| 相对路径 / `~` 单独 / 其它 | 告警一条 `web-ux: archiveRoot "<值>" is not an absolute path or ~/ path; falling back to <缺省>`，回落缺省 |

配置样例（profile 的 `cordis.patch.yml`，按 id 覆盖，**整段替换**而非深合并；非必需）：

```yaml
- id: web-ux
  name: dsh-plugin-web-ux
  config:
    archiveRoot: /data/dsh-archive/sessions
```

（该写法与 `plugins/session-tool-toggle/README.md:122-129` 的 profile 覆盖示例同形；app-boot
文档明确「按 id 定位的 patch 不做深度合并，必须重述要保留的字段」。）

### 3.4 宿主实载体（`src/index.ts`）

```ts
import { copyFile, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { Config, resolveArchiveRoot, type WebUxConfig } from './config.ts'

export { Config }                             // loader 只从包入口读 plugin.Config

export function apply(ctx: Context, config?: WebUxConfig): void

interface HostPorts extends DeletePorts {
  /** 本次请求解析后的归档根（与 ports 同一次装配，避免二次读 homePath）。 */
  readonly archiveRoot: string
}
function createPorts(ctx: Context, config: WebUxConfig | undefined): HostPorts | undefined

const nodeFileSystem: FileSystemOps = {
  /* 现有 4 个 */
  mkdir: async (path, options) => { await mkdir(path, { recursive: options.recursive }) },
  rename: async (from, to) => { await rename(from, to) },
  copyFile: async (from, to) => { await copyFile(from, to) },
}

export function createDispatcher(
  ctx: Context,
  config?: WebUxConfig,
): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<ConnectionRpcResult<unknown>>
```

分派（`src/index.ts` 现有两个 `if` 的最小改动）：

```ts
const parsed = parseDeleteRequest(endpoint, payload)         // 已含 mode
if (!parsed.ok) return failure('bad-request', parsed.message)
const ports = createPorts(ctx, config)                       // 内含 resolveArchiveRoot
if (ports === undefined) return failure('internal', NO_HOME_MESSAGE)

if (endpoint === PREVIEW_ENDPOINT) {
  const result = await previewDelete(ports, parsed.value.sessionId, ports.archiveRoot)
  return result.ok ? { ok: true, value: result.preview } : failure(result.code, result.message)
}
if (endpoint === DELETE_ENDPOINT) {
  const result = parsed.value.mode === 'archive'
    ? await archiveSession(ports, parsed.value.sessionId, ports.archiveRoot)
    : await deleteSession(ports, parsed.value.sessionId)
  return result.ok ? { ok: true, value: result.outcome } : failure(result.code, result.message)
}
```

`createPorts` 内部：

```ts
const homePath = ctx.dshHomePath
if (homePath === undefined) return undefined                        // 现有 internal 路径不变
const archiveRoot = resolveArchiveRoot(config?.archiveRoot, {
  homePath,
  homedir: homedir(),
  warn: (message) => { ctx.logger.warn(message) },
})
const files = createSessionFiles({ homePath, fs: nodeFileSystem })
return { …, archiveRoot,
  prepareArchive: async (root) => { await files.prepareArchive(root) },
  archiveFiles: async (sessionId, root) => await files.archive(sessionId, root),
}
```

### 3.5 浏览器侧调用面（`src/client/delete-client.ts`）

```ts
export interface DeleteClient {
  /** 请求预览；mode 只表达意图，预览数字与 mode 无关（见 ④ D9）。 */
  preview(sessionId: string, mode: DisposalMode): Promise<DeletePreview>
  /** 执行；mode 决定宿主走删除还是迁移。 */
  remove(sessionId: string, mode: DisposalMode): Promise<DeleteOutcome>
}

// 内部唯一请求体构造点
const call = async (endpoint: string, body: DeleteRequest): Promise<unknown> => {
  let result: ConnectionRpcResult<unknown>
  try {
    result = await connection.rpc.call(CHANNEL, endpoint, body)
  } catch (error) { throw new DeleteError('unavailable', …) }
  if (!result.ok) { /* 现有信封拆解逻辑不变 */ }
  return result.value
}
```

### 3.6 对话框状态与标记（`src/client/DeleteSessionDialog.tsx`）

```ts
export const DEFAULT_DISPOSAL_MODE: DisposalMode = 'archive'   // Q5：不可逆操作必须主动选

const [mode, setMode] = useState<DisposalMode>(DEFAULT_DISPOSAL_MODE)
// 预览只发一次：effect 用常量默认档，不依赖 mode state（切模式不重发，见 ④ D9）
client.preview(target.sessionId, DEFAULT_DISPOSAL_MODE)

const confirm = (): void => { … client.remove(target.sessionId, mode) … }
```

UI 结构（摘要块沿用 `preview !== null && phase !== 'failed'`；单选只在 `ready`/`deleting` 出现，`done` 后消失）：

```tsx
{(phase === 'ready' || phase === 'deleting') && (
  <fieldset className={css.modes} disabled={phase === 'deleting'}>
    <legend>{t('dialog.mode.legend')}</legend>
    <label className={css.modeRow}>
      <input type="radio" name="web-ux-disposal" value="archive"
             checked={mode === 'archive'} onChange={() => { setMode('archive') }} />
      <span className={css.modeText}>{t('dialog.mode.archive')}</span>
    </label>
    <label className={css.modeRow}>
      <input type="radio" name="web-ux-disposal" value="delete"
             checked={mode === 'delete'} onChange={() => { setMode('delete') }} />
      <span className={css.modeText}>{t('dialog.mode.delete')}</span>
    </label>
  </fieldset>
)}

// 摘要体积行：mode === 'archive' ? t('dialog.summary.moveSize', …) : t('dialog.summary.size', …)
// 归档模式追加：<p className={css.archiveTarget}>{t('dialog.archive.target', { path: preview.archiveRoot })}</p>
// 警示区：mode === 'archive' ? t('dialog.warning.archive') : t('dialog.warning.irreversible')
// 标题与 description：title 不变；description 按 mode 取 dialog.description[.archive]
// 底部按钮：标签 mode === 'archive' ? t('dialog.confirm.archive') : t('dialog.confirm')
//          进行中 mode === 'archive' ? t('dialog.archiving') : t('dialog.deleting')
//          危险色 class 只在 mode === 'delete' 时挂
// done：mode === 'archive' ? t('dialog.done.archive', {count}) : t('dialog.done', {count})
//       warnings 标题同理（dialog.warnings[.archive]）
// failed：mode === 'archive' ? t('dialog.failed.archive', {reason}) : t('dialog.failed', {reason})
```

### 3.7 locales 新键清单（13 个，zh 为 canonical）

| 键 | zh | en |
|---|---|---|
| `dialog.description.archive` | `「{title}」的会话日志将被移动到归档目录。` | `The stored logs of "{title}" will be moved to the archive directory.` |
| `dialog.mode.legend` | `处置方式` | `Disposition` |
| `dialog.mode.archive` | `移动到归档目录` | `Move to archive directory` |
| `dialog.mode.delete` | `永久删除` | `Delete permanently` |
| `dialog.archive.target` | `归档目录：{path}` | `Archive directory: {path}` |
| `dialog.warning.archive` | `日志会移动到上述目录（保留项目目录层级），投影缓存与工作区记录同步清除，界面不再显示该会话。需要时可按会话 id 从该目录手动找回；插件不提供恢复入口。` | `The logs move to that directory (project layout preserved); the projection cache and workspace records are cleared and the session disappears from every view. You can recover it by hand from that directory by session id; this plugin offers no restore entry.` |
| `dialog.summary.moveSize` | `移动体积：{size}` | `Size to move: {size}` |
| `dialog.confirm.archive` | `移动到归档目录` | `Move to archive directory` |
| `dialog.archiving` | `正在移动…` | `Moving…` |
| `dialog.done.archive` | `已移动 {count} 个会话到归档目录。` | `Moved {count} sessions to the archive directory.` |
| `dialog.warnings.archive` | `以下项未能完成，需要手动清理：` | `These items did not complete and need manual cleanup:` |
| `dialog.failed.archive` | `归档未能完成：{reason}` | `Archiving did not complete: {reason}` |
| `error.archive-unavailable` | `归档目录不可用（无法创建或没有写权限），未做任何改动。` | `The archive directory is unusable (it cannot be created or is not writable); nothing was changed.` |

保留不动的既有键：`menu.delete`（Q1 单入口文案）、`dialog.title`（入口名不变，见待决 3）、`dialog.confirm`（= delete 模式标签）、`dialog.warning.irreversible`、`dialog.deleting`、`dialog.done`、`dialog.warnings`、`dialog.failed`、`format.*`、`error.*` 其余项。

### 3.8 形状不变的接口（明确不做）

- `DeleteOutcome`：仍是 `{ removed, warnings }`，**不回声 mode、不回声目的地**（理由见 ④ D10）。
- `parseOutcome` / `parseFailure` / `CHANNEL` / `ENDPOINTS` / 端点名：不变。
- `DeleteTarget` / `DeleteRequestStore`：不变（mode 是对话框局部状态）。
- `DeleteSessionMenuItem` props、slot id/order：不变。

---

## ④ 决策记录

（每个决策附被否方案、理由与 ≥1 条反例/失效边界；含栈识别结论与分层惯例。）

### 4.1 栈识别结论（必须留档）

> **栈未命中聚合层 writer（TypeScript/esbuild/React 双端插件仓，无 spring-boot/nuxt 特征），用户豁免本次加载（仅本次有效）**

设计遵循仓库 `AGENTS.md` 与 `plugins/web-ux/README.md` 的既有分层惯例：

- **纯流程层** `src/delete-session.ts` 继续不 import cordis、不 import `@deepseek-ai/*`（只用 `node:path` 与 `./contract.ts` 的类型），因此迁移算法可用 fake 端口在纯 node 下完整驱动；**Schemastery 不进这一层**，落在新建的 `src/config.ts`（宿主接线层）。
- **实载体** `src/index.ts` 继续是唯一把 `node:fs/promises` 绑到端口、把上游服务绑到 `DeletePorts` 的地方；`apply` / `Config` 是它的包入口职责。
- **浏览器层**组件（`DeleteSessionDialog.tsx`）/ 调用面（`delete-client.ts`）/ 跨 entry store（`delete-store.ts`）/ 文案（`locales.ts`）/ 样式（`delete.module.css`）保持分离；跨 entry 通信不改用框架 hook（slot 的 `inject.hooks` 只能由声明方提供，见 `delete-store.ts:4-7` 的既有注释）。
- 仓库的「宿主半对 `@deepseek-ai/*` type-only」惯例有一个**已存在的例外先例**（`session-tool-toggle/src/host/index.ts:51-56`：Config 用 Schemastery，由构建内联、运行时不解析），本次沿用并在 README 更新该例外说明。

### 4.2 决策表

> 反例 = 该决策的失效边界或对「被否方案」的反证；至少一条/决策。

| ID | 决策 | 被否方案 | 理由 | 反例 / 失效边界 |
|---|---|---|---|---|
| **D1** | `mode` 在两个端点**必填**，同形请求体；缺省或未知取值一律 `bad-request`，无隐式默认 | (a) 可选、缺省 `delete`（explore 草案倾向）；(b) 可选、缺省 `archive`；(c) preview 可选 / execute 必填的端点上不对称 | decisions.md 未对 mode 字段裁定（原提示授权代码级裁定，本行即裁定）。宿主半与浏览器半虽同 bundle（无灰度期），但**已打开的旧标签页**会继续跑 v1.4.0 的客户端：旧客户端不带 mode。若缺省 `delete`，旧标签页会在新宿主上**物理删除**且没有模式选择；若缺省 `archive`，旧标签页会静默改变既有行为。必填让旧标签页在**预览阶段**就拿到 `bad-request`（最早的失败点），界面显示失败并逼用户刷新，绝不发生「没选模式就被删」 | 端点上不对称方案（c）也能防误删，但失败点推迟到确认之后（用户先看到旧预览、再被拒），且 parser 要按端点分叉；反例：旧标签页点确认才报错，用户会以为宿主坏了 |
| **D2** | 预览返回**一个** `archiveRoot`（解析后的根），不返回每会话叶子路径 | (a) `archiveTargets: string[]`（整集合目的地列表）；(b) 目标会话的 `archiveTarget?: string` 可选叶子 | 级联删除集合可能有 N 个会话、N 个项目目录，单条叶子路径必然误导；叶子依赖 `locate()` 的 I/O（预览阶段源目录可能恰好缺失，叶子不可知，字段被迫可选）；用户真正要核对的是「配置被解析成哪儿」= 根。UI 文案用「归档目录：{path}」+ 警示区说明保留项目层级 | 反例：若用户想确认「我这个会话会落在哪个目录」，只给根不足——已作为待决 1 上浮（推荐维持根）；叶子方案的反证：源目录缺失时 `archiveTarget` 无法给出，只能可选或报错 |
| **D3** | 失败码只扩一个 `archive-unavailable`，且只在**归档根不可用**（非绝对路径 / mkdir 失败）时返回，发生在任何 registry/文件写入之前；逐条迁移失败不进失败码，只进 warnings | (a) 不扩码，归档根不可用也逐条 warning；(b) 扩 `move-failed` / `archive-conflict` 等逐项码 | 根不可用时「逐条 warning + registry 清理」会让会话从界面消失而日志原封不动留在 `sessions/`——用户以为归档成功，实际没有归档副本，且界面无法重试。前置失败码把「什么都没发生」与「部分发生」分开，界面文案可直接说「未做任何改动」。逐项失败保留 warnings 是删除的既有语义（失败不回滚不中止） | 反例：单条 rename 因权限失败时仍会清 registry（与删除同构，见 D6），用户同样失去界面重试入口——这是**有意继承**删除语义的代价，用 warning 双路径点名缓解；若改为「失败保留 registry」就会与删除语义分叉（见 D6） |
| **D4** | `FileSystemOps` 扩三个**原语** `mkdir` / `rename` / `copyFile`；递归 copy 算法写在纯流程层（`copyTree`），不把 `cp`/`cpTree` 塞进端口 | (a) 端口直接给 `cpTree`；(b) 宿主适配器用 `node:fs.cp(src,dest,{recursive:true})` 一次完成 | 递归算法留在纯流程里，fake fs 才能覆盖 EXDEV 回退、同名冲突、**中途部分失败**三种分支（决策 Q4 的测试面要求）；`fs.cp` 会吞掉「复制到一半失败」的中间态语义，且 fake 实现 `cp` 等于把被测算法复制进测试。原语与现有四个同粒度，宿主适配器各一行 | 反例：`fs.cp` 能正确处理符号链接、权限位、稀疏文件，自写 `copyTree` 不能——因此对符号链接选择**失败并保留源**（不静默丢数据），权限位不保证（会话日志目录无特殊权限需求）；文件系统特性若将来需要，另开变更扩原语 |
| **D5** | 目标目录已存在 → **该项失败、绝不覆盖**；因 POSIX `rename` 会静默顶替空目录，必须先 `lstat(dest)` 显式判定，再做 rename | (a) 先 `mkdir(dest)` 再 rename 进目录（会先创建空目录，随后 rename 顶替它）；(b) 先删 dest 再 rename | POSIX `rename(2)` 在同设备上是「原子替换」：目标若是空目录会成功且不报错——不显式检查就会静默覆盖用户归档目录里的同名空目录；显式 `lstat` 把「同名冲突」变成可报告的失败项（Q4 已定）。任何「先删后搬」都违反「绝不覆盖」 | 反例：`lstat(dest)` 与 `rename` 之间存在 TOCTOU 窗口（另一进程刚好创建了 dest）——此时 POSIX rename 会覆盖那个空目录；窗口内 dest 非空则失败。归档目录由本插件独占（用户手工管理），该窗口按可接受残余风险记录，不引入 `renameat2(RENAME_NOREPLACE)`（Node 无接口） |
| **D6** | 删除与迁移共用 `disposeAll()`：逐条 `cleanupRegistry → 文件动作 → emitRemoved`，文件失败**不回滚、不中止**，`removed` 仍含该 id | (a) 迁移失败时保留 registry 引用（界面可重试）；(b) 迁移失败整体回滚（先搬后清，失败还原） | decisions Q4 要求「与删除完全同构」；同构由**同一段循环**保证（不是两段复制代码）。迁移失败时数据仍在 `sessions/`（没丢），只是界面不可见、warning 点名源与目标，用户可手工搬或重来；回滚会引入「部分会话已清 registry、部分没清」的混合状态，比双份状态更难解释 | 反例：权限问题导致所有项都失败时，用户看到「已移动 0 个但会话消失了」——这正是 D3 前置失败码只能覆盖「根不可用」、覆盖不到「逐项不可写」的缺口；缓解是 warning 明确点名源路径（可手工搬走后重跑预览；重跑会得到 `not-archived`，因为 registry 已清）——这是已知的不可重试代价，与删除完全一致，不做特例 |
| **D7** | config 键名 `archiveRoot`，缺省 `$DSH_HOME/archive/sessions`（由 `homePath('archive','sessions')` 拼出，不写死 `~/.dsh`）；支持绝对路径与 `~/`，相对/非法值**告警并回落缺省** | (a) 固定路径不可配；(b) 键名 `archiveDir` / `archiveSessionsDir`；(c) 相对路径按进程 cwd 解析 | Q2 已定可配 + 缺省 `~/.dsh/archive/sessions`；`$DSH_HOME` 是可迁移的，写死 `~/.dsh` 在 `DSH_HOME` 改址后会搬错位置。相对路径按 cwd 解析在 daemon 进程里不可预测（cwd 不是用户目录），故拒绝并回落 | 反例：`DSH_HOME` 与 `~/.dsh` 不同时，用户按文档以为归档在 `~/.dsh/archive`，实际在 `$DSH_HOME/archive`——由预览返回**解析后的绝对路径**（Q2）在界面上暴露真相；README 写明缺省跟随 `$DSH_HOME` |
| **D8** | 对话框内用**原生 `input[type=radio]` + fieldset/legend** 做模式单选，不用 primitives 的 `SegmentedControl` | (a) `SegmentedControl`（primitives 提供）；(b) 两个独立菜单项（explore A2 已否）；(c) 自定义按钮组 `aria-pressed` | 原生 radio 的语义就是「多选一设置项」，键盘方向键切换、读屏播报开箱即用；`SegmentedControl` 的语义是 tablist（切换面板），用于设置项会被读屏念成标签页；原生控件不引入新依赖、不需要扩 primitives 测试替身。Q1 已定单入口 | 反例：原生 radio 的视觉与官方设计系统不完全一致（需 CSS 对齐）；`SegmentedControl` 在视觉上更「官方」——但语义错误比视觉差异代价更高，且样式可用 `--dsw-alias-*` 令牌对齐（同 `delete.module.css` 现有做法） |
| **D9** | 预览只发一次，携带**初始默认档** `archive`；模式切换**不重发预览**；执行携带**最终模式** | (a) 每次切换模式都重发预览；(b) 预览不带 mode（只执行带） | 预览的四个数字（会话数/后代数/体积/归档根）与 mode 无关，重发只增加一次网络往返与一个状态漂移窗口（预览→确认之间状态可能已变，但执行端本来就会重校验）；契约要求两端口径一致（D1），故 preview 仍带 mode 表达意图 | 反例：若将来预览要做「迁移模式下逐项目的地列表」，预览就变成模式相关，本决策需要重开——当前把 mode 放进请求体（而不是省略）正是为那次演进留的口子 |
| **D10** | `DeleteOutcome` 形状不变：不回声 mode、不回声目的地 | (a) 增 `mode` 回声；(b) 增 `archiveTargets` 列表；(c) 把 `removed` 改名 `disposed` | 界面自己知道它请求了哪个模式（局部 state），回声是冗余的、且会让「宿主说的模式」与「我点的模式」出现两个真相；目的地已从预览拿到（`archiveRoot`）并在 done 前一直显示在摘要块里；改 `removed` 字段名会牵动契约、客户端 parser、测试与文档，零语义收益 | 反例：若将来出现「同一请求混合模式」（批量处置），局部 state 就不够了——那时再加回声才合理；`removed` 在归档模式下语义是「已从工作区记录移除且日志已搬走」，字段名略窄，靠契约注释澄清（不改名） |
| **D11** | `delete-store.ts` 与 `DeleteSessionMenuItem.tsx` 不改，mode 状态放对话框 | 把 mode 放进请求 store（菜单项点击时写入默认模式） | 菜单项点击时用户还没看见预览与模式说明，此时定死模式等于「盲选」；mode 的选择时机必须与预览信息同时呈现（Q1/Q5 的交互设计）。store 的身份是「要处理哪一行」，不是「怎么处理」 | 反例：若将来要在菜单里提供「删除会话 → 直接永久删除」的快捷项，就需要 store 携带预设模式——与 Q1「单入口」冲突，属另一次变更 |
| **D12** | `archiveRoot` 作为 `previewDelete()` 的入参（由流程原样回声进 `DeletePreview`），不新建 `PreviewStats` 类型再在 `index.ts` 合成 | (a) 拆出流程内部类型 `PreviewStats` + 接线层拼 `DeletePreview`；(b) 预览不返回归档根，由客户端另调一个端点 | 两套同形类型（`PreviewStats` 与 `DeletePreview` 四字段）会随契约演进而漂移，而预览结果本来就是「给界面看的形状」，流程输出它就是契约形状；接线层保持「一个端点一种响应形状」的简单映射（现状 `index.ts:126` 即 `value: result.preview`） | 反例：流程层因此知道了 `archiveRoot` 这个宿主概念（一个字符串），纯度略降——但它不解析、不做 I/O、不依赖 node:os，仍可用纯 node 驱动；若将来预览需要更多宿主事实，再考虑拆类型 |

---

## ⑤ 逐任务组实现要点

（组间串行、组内可并行，单组 ≤8 任务；后续 `tasks.md` 分组与本节 G1–G5 对齐。依赖写在组内，
带 ★ 的任务可并行；每组末尾的「验证」是硬门槛，命令在 `plugins/web-ux` 目录下执行或加
`--filter` 前缀。）

### G1 — 契约 + 配置 + 文案地基（5 任务）

| 任务 | 内容 | 依赖 |
|---|---|---|
| G1.1 | `contract.ts`：`DISPOSAL_MODES`/`DisposalMode`/`isDisposalMode`；`DeleteRequest.mode` 必填；`readRequest()` 白名单与取值校验；`DeletePreview.archiveRoot` + `parsePreview()`；`FAILURE_CODES` 加 `archive-unavailable`；同步更新文件头注释（本模块仍零依赖） | — |
| G1.2 ★ | `config.ts`（新建）：`WebUxConfig`、`Config`（Schemastery）、`ArchiveRootContext`、`resolveArchiveRoot()`（规则见 ③.3）；`tsconfig.host.json` 加 `src/config.ts`、`test/config.test.ts` | 与 G1.1 并行 |
| G1.3 | `test/contract.test.ts`：合法请求 `{sessionId,mode:'archive'}`；缺 mode / `mode:'purge'` / `mode:42` → 拒；`parsePreview` 缺/空/非字符串 `archiveRoot` → 拒；`FAILURE_CODES` 断言新数组 | G1.1 |
| G1.4 ★ | `test/config.test.ts`（新建）：默认根、`~/x` 展开、绝对路径归一、相对路径回落 + warn 一次、`Config({})`/`Config({archiveRoot:'/x'})` 通过、`Config({archiveRoot:2})` 抛错 | G1.2 |
| G1.5 ★ | `locales.ts` 13 个新键（③.7）；`test/locale-parity.test.ts:25` 的 required 列表补新键与 `error.archive-unavailable` | 与 G1.3/G1.4 并行 |

**验证**

```bash
pnpm --filter dsh-plugin-web-ux exec vitest run test/contract.test.ts test/config.test.ts test/locale-parity.test.ts
pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.host.json --noEmit
```
断言：上条 vitest 全绿（含「缺 mode 拒」「`archiveRoot` 缺失拒」「默认根 = join(home,'archive','sessions')」「相对路径回落且 warn 恰一次」「zh/en 键集一致」）。

### G2 — 宿主纯流程与文件工厂（5 任务）

| 任务 | 内容 | 依赖 |
|---|---|---|
| G2.1 | `delete-session.ts`：`FileSystemOps` 扩 `mkdir`/`rename`/`copyFile`；`DeletePorts` 扩 `prepareArchive`/`archiveFiles`；`previewDelete()` 增 `archiveRoot` 参数 | — |
| G2.2 | `createSessionFiles()`：`prepareArchive()` + `archive()`（复用 `locate()`；`basename(dirname(src))` 取项目段）；内部 `copyTree()`；`isCrossDevice()`（`error.code === 'EXDEV'`）；警告串按 ③.2 表；`remove()` 行为零变化 | G2.1 |
| G2.3 | `archiveSession()` + 抽出 `disposeAll()`（`deleteSession()` 改为调用它，输出与现状逐字节一致）；`isAbsolute` 防御 + `prepareArchive` 失败映射 `archive-unavailable` | G2.1、G2.2 |
| G2.4 | `test/delete-session.test.ts`：fake 端口补 `prepareArchive`/`archiveFiles`（记录调用序列，`prepareArchive` 可注入抛错）；fake fs 扩 3 原语（`mkdir` 递归建父级、`rename` 移动子树并支持注入 EXDEV、`copyFile` 可注入中途失败）；既有 `previewDelete(ports,id)` 调用补 `archiveRoot` 并断言其回声；新增用例矩阵 | G2.1–G2.3（可与实现并行写，最后跑） |
| G2.5 | 模块头注释与 `FileSystemOps` / `DeletePorts` 的 JSDoc 同步（纯流程仍不 import cordis、不 import `@deepseek-ai/*`；迁移语义与投影缓存删除写清楚），保持 `verbatimModuleSyntax` 下的 `import type` 形态 | G2.3 |

**G2.4 用例矩阵（必含）**

1. 迁移成功：`rename` 恰一次/源目录消失/`dest` 下日志文件存在/投影缓存被删；
2. EXDEV 回退：注入 `code:'EXDEV'` → 断言 `mkdir`+`copyFile`+`rm(源)` 调用序列、源消失、dest 内容一致；
3. 目标同名冲突：`dest` 已存在 → 返回一条含 `already exists` 的警告、源完整保留、**未调用 rename**；
4. copy 中途失败：某 `copyFile` 抛错 → 源保留、警告同时含 `src` 与 `dest`、**未调用 rm(源)**；
5. 级联迁移：`CASCADE` 三个 id 全部迁移，`calls` 序列 = 每个 id 的 `cleanup→archive→emit`；
6. registry 顺序与删除一致（逐 id `unarchive→unpin→detach`，由 G3 的真实 registry 断言）；
7. 归档根 mkdir 抛错 → `{ok:false,code:'archive-unavailable'}` 且 `calls` 为空；
8. 非法 id（`''`/`..`/`a/b`/控制字符/256 字符）→ 单条警告且文件系统零调用；
9. 源目录缺失 → 无警告、缓存照删（与删除的宽容一致）；
10. 缓存 `unlink` 非 ENOENT → 警告（同删除）；
11. `previewDelete(ports,'session-target','/archive/root')` 的 `preview` 含 `archiveRoot:'/archive/root'`，其余三个数字与改造前逐字段相同。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-session.test.ts
pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.host.json --noEmit
```
断言：矩阵 1–11 全绿；`deleteSession` 既有 8 个用例不改断言即通过（同构回归）。

### G3 — 宿主实载体接线（4 任务）

| 任务 | 内容 | 依赖 |
|---|---|---|
| G3.1 | `index.ts`：补 `node:fs/promises`/`node:os` import；`nodeFileSystem` 3 原语；`HostPorts` + `createPorts(ctx, config)`（内部 `resolveArchiveRoot`）；`createDispatcher(ctx, config)` 分派；`apply(ctx, config?)`；`export { Config }` | G1、G2 |
| G3.2 ★ | `package.json`：devDeps 加 `@deepseek-ai/schemastery@3.18.5`、`description` 更新；根 `pnpm install` | 与 G3.1 并行 |
| G3.3 | `test/index.test.ts`：所有 payload 补 `mode`；新增 archive 用例（见下） | G3.1、G3.2 |
| G3.4 ★ | `build.mjs` 头注释补「Schemastery 被内联、external 仍只有 node:*」；`cordis.patch.yml` 注释同步（无 `config:` 段） | 与 G3.3 并行 |

**G3.3 用例（真实临时目录，不 mock fs）**

- 预览（`mode:'archive'`）→ `parsePreview` 通过且 `archiveRoot === join(home,'archive','sessions')`；
- 自定义配置：`createDispatcher(host.ctx, { archiveRoot: join(home,'custom-archive') })` → 预览回声该路径；
- 归档执行 → `existsSync(join(home,'custom-archive','--home-docker--',TARGET,'session.v4.jsonl.zstd')) === true`；`existsSync(源目录) === false`；投影缓存 `false`；`fakeRegistry.calls === ['unarchive:…','unpin:…','detach:ws-1:…']`；`host.emitted === [[SESSION_REMOVED_EVENT,TARGET]]`；
- `archive-unavailable`：把 `join(home,'blocked')` 建成**普通文件**，配置 `archiveRoot: join(home,'blocked','sessions')` → 执行返回 `{ok:false,error:{code:'archive-unavailable',…}}`，`fakeRegistry.calls === []`，源目录仍存在；
- delete 回归：`mode:'delete'` → 源目录与缓存消失，且 `existsSync(join(home,'archive')) === false`（删除模式绝不创建归档目录）；
- `bad-request`：缺 `mode` 的 payload（含 `{sessionId:TARGET}`）。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux exec vitest run test/index.test.ts test/bundle.test.ts
pnpm --filter dsh-plugin-web-ux build
node -e "import('./plugins/web-ux/lib/index.js').then((m)=>{if(typeof m.Config!=='function')process.exit(1);console.log(JSON.stringify(m.Config({archiveRoot:'/tmp/x'})))})"
# 产物只允许 node: 内建模块词（bundle.test.ts 的同一断言，这里给一条可复现的手工版本）
node -e "const s=require('node:fs').readFileSync('plugins/web-ux/lib/index.js','utf8');const w=[...new Set([...s.matchAll(/(?:from\\s+\"|require\\(\")([^\"]+)\"/g)].map(m=>m[1]))];console.log(JSON.stringify(w))"
```
断言：`test/bundle.test.ts`「宿主半完全自包含：除 node 内建外没有任何模块依赖」通过；`node -e` 打印 `{"archiveRoot":"/tmp/x"}`；最后一条只打印 `["node:..."]`（Schemastery 已被内联，运行时不解析）。注意产物里会出现 esbuild 的依赖路径注释（含 `@deepseek-ai+schemastery@3.18.5`，与 session-tool-toggle 产物同款），那是注释不是 import，不能拿 `grep schemastery` 当外置判据。

### G4 — 浏览器半（5 任务）

| 任务 | 内容 | 依赖 |
|---|---|---|
| G4.1 | `delete-client.ts`：`preview(sessionId, mode)` / `remove(sessionId, mode)`；`call(endpoint, body)` | G1 |
| G4.2 | `DeleteSessionDialog.tsx`：`DEFAULT_DISPOSAL_MODE`、`mode` state、radio 区块、按 mode 分支的摘要/警示/按钮/完成/失败文案、危险色仅 delete、预览用常量默认档、`remove(…, mode)` | G4.1 |
| G4.3 ★ | `delete.module.css`：`.modes`/`.modeRow`/`.modeText`/`.archiveTarget`（令牌带静态兜底） | 与 G4.2 并行 |
| G4.4 ★ | `test/delete-client.test.ts`：两处 `toHaveBeenCalledWith(CHANNEL, ENDPOINT, {sessionId:'session-1', mode:'archive'})`；`remove(...,'delete')` 另一条；坏形状仍 `bad-response` | G4.1 |
| G4.5 | `test/delete-dialog.test.tsx`：fakeClient 的 preview 补 `archiveRoot`、remove 接受 mode；新增断言（见下） | G4.2、G4.4 |

**G4.5 新增断言**

- 默认态：`screen.getByRole('radio', { name: '移动到归档目录' }).checked === true`，确认按钮文案为「移动到归档目录」，显示「归档目录：/home/u/.dsh/archive/sessions」，**不出现**「删除不可撤销」原文，体积行为「移动体积：2 KB」；
- 切换到「永久删除」：确认按钮变「永久删除」、出现不可逆警示、体积行变「预计释放：2 KB」；
- 两模式确认分别调用 `remove('session-1','archive')` / `remove('session-1','delete')`（只调用一次）；
- `remove` 的断言改为带 mode；`deleting` 阶段 radio 的 `disabled === true`；
- 归档完成：`已移动 2 个会话到归档目录。` + `以下项未能完成，需要手动清理：`；
- 归档失败：`归档未能完成：归档目录不可用（无法创建或没有写权限），未做任何改动。`；
- 预览失败态仍不显示 radio（只读）。

**验证**

```bash
pnpm --filter dsh-plugin-web-ux exec vitest run test/delete-client.test.ts test/delete-dialog.test.tsx
pnpm --filter dsh-plugin-web-ux exec tsc -p tsconfig.client.json --noEmit
```
断言：默认档为 archive、切换后文案/确认语义跟随、`remove` 收到的 mode 与用户选择一致。

### G5 — 文档、产物与发布面（5 任务）

| 任务 | 内容 |
|---|---|
| G5.1 | `README.md`：`## 删除已归档会话` 增「处置模式」小节（单选默认迁移、两模式文案差异）；`### 删除范围` 增迁移范围（只搬日志目录、保留项目层级、投影缓存删除、附件不动）；新增「归档目录与手工找回」小节（缺省 `$DSH_HOME/archive/sessions`、`archiveRoot` 配置样例、`mv` 找回命令、插件不提供恢复入口）；`### 半失败` 增迁移的 `<src> -> <dest>` 警告与手工处理；`### 拒绝码` 加 `archive-unavailable`；`### 非目标` 增「不做恢复 GUI」；`:143` 宿主 import 例外（Schemastery 内联）；`:154` tsconfig 清单；`:187` dump-config-schema 说明；`### 版本迁移` 增「回滚到 v1.4.0 时旧客户端预览会 `bad-request`，刷新页面即可」 |
| G5.2 | `package.json` description、`cordis.patch.yml` 注释、`build.mjs` 头注释定稿 |
| G5.3 | `pnpm --filter dsh-plugin-web-ux build` 重建 `lib/index.js` + `lib/client.js` 并随提交（本仓 `lib/` 入库，见 `git ls-files lib`） |
| G5.4 | 受影响的 spec requirement 留给落档步骤：`openspec/specs/dsh-web-ux-session-delete/spec.md` 的「删除前必须经过预览与二次确认」（预览含归档根、模式单选默认迁移）、「删除移除会话的全部持久化痕迹」（增迁移范围与投影缓存删除）、「不可删除状态必须被拒绝」（`archive-unavailable`），并新增「处置模式选择」「归档目录可配置」「迁移失败语义」三条 requirement |
| G5.5 | （可选，条件具备时）把本包 link 安装到 web profile 并跑配置 schema 校验 |

**验证**

```bash
pnpm --filter dsh-plugin-web-ux verify:all        # lint → typecheck → build → test 全绿
git -C /home/xuqinqin/develop/person/dsh-plugins status --porcelain plugins/web-ux/lib
grep -n 'archiveRoot\|archive/sessions\|移动到归档目录' plugins/web-ux/README.md
# 条件项：本包已 link 进 web profile 时
docker exec dsh dsh --profile web --dump-config-schema | jq -r '.x-cordis.complete'
docker exec dsh dsh --profile web --dump-config-schema | jq -r '.x-cordis.entries[] | select(.id=="web-ux") | .status'
```
断言：`verify:all` 退出码 0；`lib/index.js`、`lib/client.js` 出现在改动列表；README 三处关键词命中；dump 的 `complete === true` 且 web-ux 条目 `status === "schema"`（条件项，未安装则跳过并记录）。

### 手工验收（用户侧，发布前）

对两个已归档会话分别跑两种模式，逐条断言：

```bash
# 迁移模式后（<项目目录> = 该会话原所在 sessions 子目录名，如 --home-xuqinqin-...--）
test -d ~/.dsh/archive/sessions/<项目目录>/<会话id> && ! test -e ~/.dsh/sessions/<项目目录>/<会话id>
test -e ~/.dsh/archive/sessions/<项目目录>/<会话id>/session.v4.jsonl.zstd
test ! -e ~/.dsh/storages/session_projcache/sessions/<会话id>.json
# 删除模式后
test ! -e ~/.dsh/sessions/<项目目录>/<会话id> && test ! -d ~/.dsh/archive
```
两种模式后侧栏对应行均应消失，重启 profile 后不复活（工作区记录已清，无需手改任何
`~/.dsh` 下的工作区文件）；`DSH_HOME` 非 `~/.dsh` 时把上面路径换成 `$DSH_HOME`。

---

## ⑥ 设计假设与未决项

### 假设（实现时按此执行，违反需回到设计）

- **A1 双端同版本**：宿主与浏览器半来自同一 bundle；唯一跨版本场景是「旧标签页 + 新宿主」，由 `mode` 必填在预览阶段暴露（D1）。
- **A2 归档根在 `sessions` 树之外**：配置成会话树内部时，`dest` 与源同路径会命中「目标已存在」而失败（D5 兜底），本设计**不加**额外拒绝逻辑。
- **A3 会话目录内无符号链接**：出现符号链接时该项迁移失败并保留源（不静默丢数据），不做链接复制。
- **A4 投影缓存纯缓存**：迁移模式直接 `unlink`，失败只记警告（与删除一致，可由宿主重建）。
- **A5 共享附件不动**：任何模式都不触碰 `~/.dsh/attachments/v1`（非目标，沿用 decisions Q6 边界）。
- **A6 归档目录的生命周期归用户**：插件只负责创建与搬入；升级/卸载后目录成为无主数据，README 写明；不提供恢复入口。
- **A7 目标存在性检查 vs rename 的 TOCTOU 窗口可接受**：归档目录由插件独占写入，残余风险见 D5 反例。
- **A8 会话 id 安全校验沿用现有 `isSafeSessionId` 与 contract 的单段上限**；项目目录名来自 `readdir` 的真实条目，不再二次校验。
- **A9 不预检磁盘空间**：`copyFile` 失败即该项失败、源保留（ENOSPC 不会造成数据丢失）。
- **A10 `Config` 的唯一宿主运行时 import 例外**：Schemastery 由 esbuild 内联进 `lib/index.js`，运行时不解析任何 `@deepseek-ai/*`（`test/bundle.test.ts` 的「完全自包含」断言守护）；README 同步该例外。

### 未决项

见下节「待决问题」；六字段内不再重复。已上浮 3 条，均不阻塞实现（本文按推荐值继续）。

---

## 待决问题（六字段之外，供主会话代问）

### 待决 1（TOP）— 预览里「目标路径」的粒度

- **问题**：decisions Q2 写「预览响应携带宿主解析后的实际目标路径」。是只给**归档根**（`archiveRoot`），还是给**目标会话的完整叶子路径**（`<root>/<项目目录>/<会话id>`）？
- **选项**：A 只给根（本文推荐，D2）；B 给目标会话的叶子（新增字段 `archiveTarget`，需在预览里 `locate()`，源目录缺失时不可知 → 必须可选）；C 根 + 叶子可选字段并存。
- **推荐**：A。级联集合有 N 个目的地，单条叶子必然误导；叶子依赖 I/O 与「源目录恰好存在」；用户真正要核对的是配置解析结果。C 可作为后续增强（不破坏兼容）。
- **影响面**：契约字段数（1 vs 2）、`previewDelete` 是否要做 I/O、UI 文案与 `test/contract.test.ts`/`test/index.test.ts`/`test/delete-dialog.test.tsx` 断言；若选 B/C 需在 G1 前追加一次契约设计。

### 待决 2 — 归档根不可用时的失败码命名与语义

- **问题**：新增失败码 `archive-unavailable`（仅覆盖「归档根不可用」，发生在任何写动作之前），命名与粒度是否接受？
- **选项**：A `archive-unavailable`（本文推荐，D3）；B 复用 `internal`（少一个码，但界面无法区分「未做任何改动」与「宿主内部错误」）；C 扩逐项码（`move-failed` / `archive-conflict`），把 warnings 里可枚举的失败也变成码。
- **推荐**：A。C 会把「失败不回滚不中止、逐条报告」的既有语义拆成两套错误通道。
- **影响面**：`FAILURE_CODES`、`locales.ts` 的 `error.archive-unavailable`、`test/contract.test.ts`/`test/index.test.ts`、README 拒绝码表。

### 待决 3 — 归档模式下的对话框标题

- **问题**：入口与标题目前都是「删除会话」/「删除已归档会话」。默认档改为迁移后，标题在迁移模式下是否仍称「删除」？
- **选项**：A 标题不随模式变（本文推荐，改动最小、入口语义一致）；B 迁移模式标题改「归档已归档会话」；C 标题中性化为「处理已归档会话」。
- **推荐**：A。菜单入口名是用户心智锚（Q1 单入口），标题随模式跳变会让同一入口像两个功能；模式差异已由单选与警示区承担。若采纳 B/C，需改 `dialog.title` 并同步 `test/delete-dialog.test.tsx:87` 的 aria-label 断言。
- **影响面**：`locales.ts`、对话框标题与 description、对话框测试、README 文案。
