# Design

> 本设计逐断言承载阶段 1.7 代码设计线产物（同目录 `code-design.md`，落档副本为权威）的深度契约六字段：①触达面 ②证据锚 ③接口与数据形状 ④决策记录 ⑤逐任务组实现要点 ⑥设计假设与未决项。收敛留痕见同目录 `decisions.md`（阶段 1.5 用户拍板项）。

## Context

上游 `@` 补全链路（0.2.1-rc.2 实读核实）：Web composer → `ctx.remote.fileReferences.list(sessionId, query)`（`dsh-client-ui-reference/lib/client.js:306`，远端失败整体映射 `[]`）→ session controller 直通 `ctx.fileReferences.list(agent, query, signal)`（`dsh-api-session-controller/lib/index.js:1844`）→ `LocalFileReferenceService` 以 `workingDirectory.ensure(agent)`＝会话 cwd＝主根为唯一索引根（`dsh-file-reference-local/lib/index.js:386-393`）；钻入查询被 `resolveDisplayDirectory` 的 `relative(root, absolute)` 根逃逸检查拦截（`:204-223`，逐段 `lstat` 拒 symlink）。约束：不改上游（ADR-0002）；新行必须以 `multiRootCompat` 为门禁前置（不变量 7）；optional peer 不得成为 barrel/行的加载期依赖（不变量 8）；公共方法包装保留调用上下文、卸载恢复描述符（ADR-0011 模式）。

## Goals / Non-Goals

**Goals:**

- 附加根以最小噪音进入 `@` 候选：空 query 每根一条、绝对钻入、前缀匹配；主根语义与裸模糊零改动。
- 失败模式全部向后退：peer 缺席/装坏/根撤销→只出主根候选，绝不连主根一起丢。
- 目录改名对齐其余三插件布局（目录无前缀、包名 `dsh-plugin-<目录名>`），git 历史保留，仓内路径引用清零。

**Non-Goals:**

- 不跨根合并裸模糊查询（阶段 1.5 Q1 已定：附加根大目录全量索引首查卡顿、跨根排名无语义）。
- 不改 Web 端任何代码（候选展示由上游 `fileCandidate`/`crumbsFor` 完成）。
- 不开放本行 `Config`（阶段 1.5 分歧 2 已定：检索参数取上游默认常量）。
- 不为改名另开 ADR（Q5 已定：改名记录于本 proposal/design）。

## Decisions

> 每条含被否方案与反例；完整论证见 `code-design.md` ④（D0–D13）。

- **D0 栈识别结论**：本仓为 **TypeScript / pnpm workspace 单仓多包插件仓**（判据：根 `package.json` `packageManager: pnpm@11.25.0`、`pnpm-workspace.yaml` `packages: ["plugins/*"]`、tsc + tsdown 构建、vitest/oxlint；无 `pom.xml`/`build.gradle`、无 `nuxt.config.*`）。`spring-writer` / `nuxt-writer` 均未命中；**用户已明确豁免 writer skill 加载（仅本次有效）→ 未触 writer 约束**。被否：硬套任一 writer 分层——与本仓既有 ADR/模块边界冲突。
- **D1 行形态：additive 包装 `ctx.fileReferences.list`**（`wrapMethod`，先例 `src/lsp.ts:8,13-20`）。被否：disable+insert 替换 provider（重写主根搜索、与未来包装冲突）；包装 remote 层（不在插件可达面）；客户端合并（web 半部无 scope 且不可信）。
- **D2 检索载体：动态 `import()` 复用 `WorkspaceFileSearch` + 三个默认常量**（包根公开导出，`dsh-file-reference-local/lib/index.js:54,406`；先例 `src/compat/llm-message.ts:120-134`）。反例：静态值导入会让 headless（唯一挂载点 `dsh-web-app/cordis.patch.yml:97-98`）所有行装载失败。自写 readdir 被否：需复制排除表/排名/lstat 语义，漂移风险大。
- **D5 主根取 `agent.session.header.cwd` 的 canonical**（不可变创建时 cwd，`dsh-session/lib/types/types.d.ts:59-70`；与 scope 键一致——`dsh-sandbox-policy/lib/index.js:145` 以 `session?.header.cwd` resolve workspaceRoot；先例 `src/command.ts:363-371`）。被否：`workingDirectory.ensure(agent)`——是**可变有效工作目录**，`cd` 后 `scopeOf('/tmp')` 查空，附加根候选凭空消失。
- **D6 绝对 query 两级命中：钻入（最长匹配根，要求 `R/` 前缀）+ 前缀匹配（`R` 以 query 为前缀）**。钻入把 `R/` 作 displayDirectory 传入，上游 `listDirectory` 直接产出绝对候选（`lib/index.js:182-202`，path＝display 前缀拼接）——不需要插件侧二次前缀化。被否：`ctx.fs.resolve`+`contains` 判归属（额外 I/O，回显分叉）。
- **D7 检索参数取上游默认常量，无行 Config**。被否：暴露三键（两处配置人工同步，更易错）；反射读 provider 私有配置（TS-private，违反 ADR-0002）。
- **D8 peer 失败策略：缺席静默 `undefined`、装坏 warn 一次并 `undefined`，行降级只出主根候选**。反例：照抄 llm-message「装坏就抛」——远端把整体失败映射 `[]`（`client.js:306`），抛错会让用户「`@` 一个候选都没有」，主根能力其实完好。
- **D9 实例缓存按 canonical 根 + 每次 `list` 调用 `retain(roots)` 剪枝，不订阅 scope**。本行只发目录 query，永不触发 `indexFor` 惰性索引，订阅即时 dispose 换不来收益，反引入跨主根 churn。
- **D10 不进 barrel 导出面**（先例：`lsp.ts`/`workspace-files.ts` 同样不进）。任何 barrel 值导出扩大 carrier 加载期依赖图。
- **D11 候选 path 用显示形式**：`/` 分隔、目录不带尾斜杠（`formatFileMention` 自动补 `/`，自带则 `//`；`fileCandidate` 按 `lastIndexOf("/")` 切 label/parent）。win32 把 `\` 换 `/`。
- **D12 发布 `v1.3.0`，新开 ADR-0012**（Q4/Q5 已定；被否：v2.0.0——单用户私有仓 major 号无消费者收益；ADR-0011 增补——一 ADR 一主题）。
- **D13 测试分层**：行行为（真 scope + 桩 provider）/ 适配层（结构探针 + 缓存）/ 加载时刻（`optional-peers.spec.ts` 扩展）/ 组合不变量（`patch.spec.ts` + `smoke-compose.mjs`）四个文件，不混 mock。

## 触达面清单（①，全部在根仓 dsh-plugins）

- **批次 A 改名**：`git mv plugins/dsh-plugin-multi-root-workspace → plugins/multi-root-workspace`；`pnpm-lock.yaml`（importer key）；`pnpm-workspace.yaml:3`（注释）；根 `README.md:32,43,51,75`；`plugins/project-mcp/README.md:73`、`plugins/user-commands/README.md:99`（相对链接）；插件 `AGENTS.md:90`、`README.md`/`README.en.md`（安装命令 `&path:` 与 vendored 路径；上游 npm 包名/tarball 名/上游仓库名**不改**）、`docs/development/plugin-development-workflow.md:133`、`docs/troubleshooting/unsupported-dsh-release.md:87`、`docs/architecture/multi-root-workspace.md:48`；`lib/` 随构建重建。根 `AGENTS.md:27`「包名一律 `dsh-plugin-<目录名>`」**保持原样**（改名后该约定第一次对四插件全部成立）。明确不改：`openspec/changes/archive/**`、全部包名引用（`pnpm --filter`、`@module` 注释、`tsdown.config.ts`/smoke 脚本 `PLUGIN_NAME`、`require.resolve('<pkg>/…')`）、`.dsh-smoke/`。
- **批次 B 契约**：`src/compat/dsh-version.ts:58-72`（OPTIONAL_CORE_PACKAGES 末尾追加两包）；`package.json` peers（逐字等于 allowlist 拼接）+ meta optional + devDeps `0.2.1-rc.2`×2 → `pnpm install`；行数叙事「六行→七行」（`docs/troubleshooting/unsupported-dsh-release.md:34-44`、`.agent/note/dsh-compat-contract.md(.en.md):33-41`、`docs/architecture:81-85`、`docs/development:134,159`、插件 `AGENTS.md:99,107`）。release-age 豁免已存在，无需新增。
- **批次 C 实现**：新建 `src/file-references.ts`（行）与 `src/compat/file-reference-search.ts`（适配层）；`cordis.patch.yml:81-83` 之间插行 `multi-root-file-references`；`package.json` exports 加 `./file-references`；`tsdown.config.ts:59-71` host entry 加项。
- **批次 D 测试/文档/冒烟**：新建 `tests/file-references.spec.ts`、`tests/file-reference-search.spec.ts`；扩展 `tests/optional-peers.spec.ts:12-35`、`tests/patch.spec.ts:117-138`、`scripts/smoke-compose.mjs:31-46`、`scripts/smoke-journey.mjs`（web leg `@` seam 断言）；新建 ADR-0012 + `docs/decisions/README(.en).md` 索引 + `docs/architecture` §6.2/§1/§3 + 双语 README（用法/结构/已知限制/smoke 计数）+ 插件 AGENTS 不变量 11。

## 接口与数据形状（③，签名级；完整骨架见 code-design.md ③）

```ts
// src/file-references.ts
export const inject = ['multiRootCompat', 'multiRootScope']
export interface GrantedRoot { readonly canonical: string; readonly display: string }
export interface AdditionalCandidatesPlan { readonly roots: readonly GrantedRoot[]; readonly drill?: { root: GrantedRoot; query: string } }
export function planAdditionalCandidates(query: string, roots: readonly GrantedRoot[]): AdditionalCandidatesPlan | undefined  // 纯函数；裸模糊/相对 → undefined
export function toDisplayPath(canonical: string): string
// apply：ctx.inject(['fileReferences']) → scope.effect(wrapMethod(service,'list',…))；透传三分支在 await original 之前 return；extra 与 base 按 path 去重拼接

// src/compat/file-reference-search.ts
export interface AdditionalRootSearch { list(rawQuery, signal): Promise<readonly FileReferenceCandidate[]>; dispose(): void }
export function adaptFileReferenceLocal(module: unknown): FileReferenceLocalApi | undefined  // 结构探针：WorkspaceFileSearch 是函数 + 三常量类型合法
export class AdditionalRootSearchCache { acquire(root): Promise<AdditionalRootSearch|undefined>; retain(roots): void; disposeAll(): void }
```

组合契约：patch 行 `id: multi-root-file-references` / `name: 'dsh-plugin-multi-root-workspace/file-references'`（无 config）；候选沿用 `FileReferenceCandidate = { path, kind }`；零 wire 协议变更。

## 逐任务组实现要点（⑤，与 tasks.md 分组一一对齐）

- **组 1 改名（先行，零行为）**：`git mv` → `pnpm install`（lockfile 只动 importer key）→ 路径引用逐文件改 → grep 清零 + 全量门禁。必须第一步：后续批次只触碰新路径一次。
- **组 2 契约同步**：三处 + install + `compat:check`/`dsh:check` 绿。**必须先于组 3**（实测：不装 devDep 则 `require.resolve('@deepseek-ai/dsh-file-reference-local')` MODULE_NOT_FOUND，测试无法 import 真包；peers 改完未 install 时 `dsh:check` 规则 5 报 declared but not installed 属顺序现象）。
- **组 3 行实现**（批内有序：适配层 → 行 → 接线 → 测试）：C2 适配层可独立单测先行；C3/C4/C5 接线任缺一在 patch.spec/build 立红；构建后断言 `lib/file-references.js` 含 `await import("@deepseek-ai/dsh-file-reference-local")` 且无内联 `WorkspaceFileSearch = class`。
- **组 4 文档+冒烟**：文档描述已实现形状；smoke journey 的撤销断言必须在既有 `observed.channelView` 赋值**之后**（否则打红现有断言），且 remove 成功本身要断言（防假绿）。

## 证据锚（②，关键项；完整表见 code-design.md ②）

- 本仓：`src/lsp.ts:8,13-20`（additive 行结构）；`src/workspace-files.ts:17-24,46-50`（I/O 后复验 scope + 卸载顺序）；`src/method-wrapper.ts:2-17`（描述符恢复语义）；`src/scope.ts:97-118,213-218`（scopeOf canonical 去重）；`scripts/check-dsh-compat.mjs:77-83,88-106,111-130`（peer range 逐字相等/dev 单版本/安装树一致）；`tests/optional-peers.spec.ts:12-35`（加载时刻模板）；`smoke-journey.mjs:340-397`（web leg 已有 agent 与 add 流程）。
- 上游（只读）：`dsh-file-reference-local/lib/index.js:54,406`（导出）、`:77-88`（list 分支）、`:182-202`（display 拼接）、`:204-223`（逃逸检查）；`dsh-file-reference/lib/index.js:39-40`（目录 mention 补斜杠）；`dsh-client-ui-reference/lib/client.js:306,383-438`（远端失败映射/面包屑/候选渲染）；`dsh-web-app/cordis.patch.yml:97-98`（唯一挂载点）。

## Risks / Trade-offs

- [面包屑中间层回跳无效（上游 `crumbsFor` 相对语义）] → 接受并写入 ADR-0012 Consequences 与 README 已知限制（分歧 1 已定）；上游修复后自动消失。
- [附加根绝对路径含排除目录段名（`build`/`node_modules` 等）时钻入为空] → 已知限制文档化；不绕过（绕过＝自写列目录，D2 已否）。
- [部署覆盖 provider 检索参数时附加根用默认值] → ADR Consequences 记录（分歧 2 已定）；上游未来暴露可读服务再自动对齐。
- [其余 9 个 allowlist 版本的 WorkspaceFileSearch 形状未逐一实测] → 结构探针 + 降级保证「形状不同不崩」；老版本可能拿不到附加根候选（可接受的降级面）。
- [改名 diff 噪声大（含 lib/ 路径）] → release 递归重建本就如此；git mv 保留历史。
- [`cd` 后主根候选（跟随有效目录）与根候选（跟随 session cwd）来源不同] → 候选均为绝对/相对可区分，不补偿（D5 代价记录）。

## Migration Plan

1. 实施→验证全绿→`pnpm release 1.3.0`（新 tag 的 `&path:plugins/multi-root-workspace`）。
2. profile 侧：`docker exec dsh dsh plugin --profile web remove …` 旧安装后按新 path 重新 `add`（或直接 add 新 path 覆盖）；`koffi` allowBuilds 表态按包名不受影响。旧 tag 旧 path 仍可安装旧版本。迁移说明写根 README 安装段 + 插件 README 升级段（分歧 3 已定）。
3. 回滚：恢复旧 tag 安装即可（目录改名在仓库侧，profile 侧无残留状态）。

## Open Questions

（无——阶段 1.5 五项 + 落档分歧三项均已由用户拍板；实现期可安全 deferred 的未知已列入 code-design.md ⑥ 假设 A1–A11。）
