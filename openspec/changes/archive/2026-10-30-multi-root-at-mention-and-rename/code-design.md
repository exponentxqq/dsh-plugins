# code-design — multi-root-at-mention-and-rename

> 阶段 1.7 产物：代码级蓝图（触达哪些文件、怎么改、接口与数据形状、为什么这么定）。
> 输入是 `explore.md`（阶段 1）与 `decisions.md`（阶段 1.5，权威行为边界）。本文件不复述上游结论，只把已定行为落成可执行的代码形状；与 `decisions.md` 的已定结论无冲突。
> writer skill：**未触 writer 约束（用户豁免，栈无对应 skill）**——本仓为 TypeScript / pnpm workspace 插件仓，`spring-writer` 与 `nuxt-writer` 均未命中（见 ④ D0）。
> 全部触达面只在本仓根仓 `dsh-plugins`；上游 DSH 包只读核实，不修改（ADR-0002 红线）。

## 行为矩阵（实现前的唯一速查表）

| `@` query 形态 | 是否干预 | 本行追加的候选 | 是否触达 `WorkspaceFileSearch` |
| --- | --- | --- | --- |
| 无附加根（`scopeOf(primary)` 为空） | 否 | 无 | 否 |
| 空 query `''` | 是 | 每个 available 附加根一条绝对目录候选（不带尾斜杠、`kind:'directory'`） | 否 |
| 裸模糊（非空、无 `/`，如 `@test`） | 否 | 无（上游只搜主根，Q1 已定） | 否 |
| 相对钻入（含 `/` 但不绝对，如 `@src/`） | 否 | 无（主根语义原样） | 否 |
| 绝对 query，落在某附加根内（`R/` 或以 `R/` 开头） | 是 | 该根内匹配条目，绝对路径形式 | 是（`root=R` 的实例） |
| 绝对 query，是某些附加根的前缀（如 `/home/xu`、`/`） | 是 | 每个匹配根一条绝对目录候选 | 否 |
| 绝对 query，既不落在根内也不是任何根的前缀 | 否 | 无 | 否 |
| 根在 I/O 期间被撤销 | 是 | 丢弃该根的候选（主根结果保留） | 是（结果丢弃） |
| 行卸载 | — | `list` 描述符恢复；检索实例全部 `dispose()` | — |

## ① 触达面清单

> 「仓」列：**根仓** = `/home/xuqinqin/develop/person/dsh-plugins`（dsh-plugins）；**插件** = 根仓内 `plugins/multi-root-workspace`（改名前 `plugins/dsh-plugin-multi-root-workspace`，包名不变 `dsh-plugin-multi-root-workspace`）。全部文件都在根仓，没有跨仓改动。

### A. 改名批次（零行为变化，先行）

| # | 文件（仓 / 插件） | 动作 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| A1 | 根仓 `plugins/dsh-plugin-multi-root-workspace/` → `plugins/multi-root-workspace/` | `git mv` 整个目录 | 取消 `dsh-plugin-` 前缀 | 用 `git mv` 保历史；`node_modules/`、`lib/`、`.dsh-smoke/` 随之物理移动（相对 symlink 深度不变，移动后仍可解析）；包名、`dsh.bundle.patch`、`cordis.patch.yml` 行名**都不动** |
| A2 | 根仓 `pnpm-lock.yaml` | 重新生成 | importer key 随目录名变化 | `pnpm install` 后只应看到 `importers:` 的 key 从 `plugins/dsh-plugin-multi-root-workspace` 变为 `plugins/multi-root-workspace`，依赖解析结果不变 |
| A3 | 根仓 `pnpm-workspace.yaml:3` | 文本 | 注释里旧路径 | 只改注释中的目录名 |
| A4 | 根仓 `README.md:32,43,51,75` | 文本 | 路径引用 | L32 开发工作流链接、L43 `&path:plugins/...` 安装命令、L51 排障链接、L75 插件表链接；`pnpm --filter dsh-plugin-multi-root-workspace` 等**包名引用不改** |
| A5 | 根仓 `plugins/project-mcp/README.md:73`、`plugins/user-commands/README.md:99` | 文本 | 指向 multi-root 的相对链接 | `../dsh-plugin-multi-root-workspace/README.md` → `../multi-root-workspace/README.md`（只改 href，链接文字仍是包名） |
| A6 | 插件 `AGENTS.md:90` | 文本 | vendored 路径叙事 | `plugins/dsh-plugin-multi-root-workspace` → `plugins/multi-root-workspace`；同文件其它包名引用不改 |
| A7 | 插件 `README.md:25,55,94,99,107`、`README.en.md:25,53,92,99,107` | 文本 | 安装命令 / 本地源码路径 / 表格 | 只改 `&path:` 与 vendored 目录路径；`@dsh-electron/dsh-plugin-multi-root-workspace`（上游 npm 包）、`./dsh-plugin-multi-root-workspace-<version>.tgz`（包 tarball 名）、`git clone .../dsh-plugin-multi-root-workspace.git`（上游仓库名）**不改** |
| A8 | 插件 `docs/development/plugin-development-workflow.md:133` | 文本 | `&path:` 示例 | 同步新目录名；同文件 L134/L159 的「十行 insert」是批次 B 的改动，留到 B |
| A9 | 插件 `docs/troubleshooting/unsupported-dsh-release.md:87` | 文本 | 命令里的脚本路径 | `node plugins/multi-root-workspace/scripts/upgrade-dsh.mjs ...` |
| A10 | 插件 `docs/architecture/multi-root-workspace.md:48` | 文本 | §3 目录树里的包根标签 | 代码块第一行 `dsh-plugin-multi-root-workspace/` → `multi-root-workspace/`；同段加一句「目录名不带前缀，包名仍为 `dsh-plugin-multi-root-workspace`」避免读者误以为包改名 |
| A11 | 插件 `lib/*` 及 `lib/types/*` | 构建产物（随仓库提交） | 路径随目录移动 | 不手改；`pnpm build` 重建（release 流程本就会递归重建） |

> **不改的一处（重要核实）**：根仓 `AGENTS.md:27` 的「包名一律 `dsh-plugin-<目录名>`」**保持原样**。改名后 `dsh-plugin-` + 目录名 `multi-root-workspace` = 包名 `dsh-plugin-multi-root-workspace`，该约定第一次对四个插件全部成立；旧布局（目录名自带前缀）反而使这条约定不成立。因此改名修好了这处文档矛盾，不需要改这条约定文本。

**明确不改**：`openspec/changes/archive/2026-10-11-add-web-ux-plugin/*`（历史归档，2 处包名引用）；`plugins/project-mcp/src/host/types.ts:49`、`plugins/user-commands/src/host/types.ts:59`、`scripts/upgrade-dsh.mjs:22,318,320`（包名引用，按包名解析，与目录名无关）；插件 `src/**` 的 `@module dsh-plugin-multi-root-workspace/...` 注释（包名，不是目录）；`.dsh-smoke/`（gitignored）。

### B. 兼容契约三处同步 + 行数叙事

| # | 文件（仓 / 插件） | 动作 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| B1 | 插件 `src/compat/dsh-version.ts:58-72` | 修改 | 让混装检查覆盖两个新 optional peer | `OPTIONAL_CORE_PACKAGES` 末尾追加 `'@deepseek-ai/dsh-file-reference'`、`'@deepseek-ai/dsh-file-reference-local'`（顺序=报告顺序，追加在末尾，零重排） |
| B2 | 插件 `package.json:90-111` | 修改 | exact peer 承诺 | 两个新 peer 的 range 必须**逐字节等于** `SUPPORTED_DSH_RELEASES` 以双竖线拼接出的那一条（10 个精确版本，从 `0.1.5-rc.2` 到 `0.2.1-rc.2`，完整串见 ③3.3）；不写 `^`/`~`/范围 |
| B3 | 插件 `package.json:112-152` | 修改 | optional peer 标记 | `peerDependenciesMeta` 加两项 `{ "optional": true }`（与 llm/lsp 等一致；缺了会被 pnpm 当必装 peer） |
| B4 | 插件 `package.json:153-201` | 修改 | CI/测试真实可解析 | `devDependencies` 加 `"@deepseek-ai/dsh-file-reference": "0.2.1-rc.2"`、`"@deepseek-ai/dsh-file-reference-local": "0.2.1-rc.2"`；`compat:check` 规则 3 要求所有 dsh devDep 只指向一个 allowlist 版本，故必须同为 `0.2.1-rc.2` |
| B5 | 根仓 `pnpm-lock.yaml` | 重新生成 | lockfile 记录 devDeps | `pnpm install`；两个包已经是传递依赖、且已在 `pnpm-workspace.yaml` 的 release-age 豁免清单（`dsh-file-reference@0.2.1-rc.2` / `-local@0.2.1-rc.2` 两条已存在），因此**不需要**新增豁免项 |
| B6 | 插件 `docs/troubleshooting/unsupported-dsh-release.md:34-44`、`.agent/note/dsh-compat-contract.md:33-41`、`.agent/note/dsh-compat-contract.en.md:33-41` | 修改 | 门禁行清单 + 「六行」计数 | 清单加 `multi-root-file-references`；「这六行根本不启动」→「这七行」（en 同步） |
| B7 | 插件 `docs/architecture/multi-root-workspace.md:81-85` | 修改 | §3 行清单与门禁说明 | insert 示例加新行；「安全相关的行（…… `multi-root-workspace-files`）」列表加 `multi-root-file-references` |
| B8 | 插件 `docs/development/plugin-development-workflow.md:134,159` | 修改 | `--dump-config` 期望与 git tag 安装表格 | 「十行 insert」→「十一行 insert」（两处） |
| B9 | 插件 `AGENTS.md:99,107` | 修改 | 不变量 7 的行清单与计数 | 行清单加 `multi-root-file-references`；「Ten invariants」→「Eleven invariants」（新增不变量见 D6） |

### C. 新行实现（G1）

| # | 文件（仓 / 插件） | 动作 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| C1 | 插件 `src/file-references.ts` | **新建** | `multi-root-file-references` 行：包装 `ctx.fileReferences.list`，把附加根并入 `@` 候选 | `inject = ['multiRootCompat', 'multiRootScope']`；`ctx.inject(['fileReferences'], …)` 软依赖；`wrapMethod(service, 'list', …)`；空 query 追加根候选；绝对 query 钻入/前缀匹配；I/O 后复验 scope；卸载恢复 |
| C2 | 插件 `src/compat/file-reference-search.ts` | **新建** | 按需加载 + 适配 `@deepseek-ai/dsh-file-reference-local` 的 `WorkspaceFileSearch`，并缓存每个根的实例 | 动态 `import()`；结构探针（导出名/常量类型）；构造 `FileSearchConfig`（上游默认常量）；Map 缓存 + `retain` 剪枝 + `disposeAll`；加载失败**降级 + 一次性 warn**，绝不静态导入 |
| C3 | 插件 `cordis.patch.yml:81-83` | 修改 | 挂载新行 | 在 `multi-root-workspace-files` 之后、`multi-root-command` 之前插入 `id: multi-root-file-references` / `name: 'dsh-plugin-multi-root-workspace/file-references'`；无 config |
| C4 | 插件 `package.json:50-53` | 修改 | 子路径导出 | 加 `"./file-references": { "types": "./lib/types/file-references.d.ts", "default": "./lib/file-references.js" }` |
| C5 | 插件 `tsdown.config.ts:59-71` | 修改 | 产出 `lib/file-references.js` | host `entry` 数组加 `'src/file-references.ts'`（位置紧跟 `'src/workspace-files.ts'`）；不需要 client entry |

### D. 测试

| # | 文件（仓 / 插件） | 动作 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| D1 | 插件 `tests/file-references.spec.ts` | **新建** | 行行为 | 真 `MultiRootScopeService` + `mountCompat` + 桩 `fileReferences` provider；断言字节级透传、空 query 根候选、绝对钻入、前缀匹配、撤销丢弃、卸载恢复、裸模糊/相对不干预 |
| D2 | 插件 `tests/file-reference-search.spec.ts` | **新建** | 适配层 | `adaptFileReferenceLocal` 的结构探针（缺导出、常量类型错、构造抛错）；`AdditionalRootSearchCache` 的复用/剪枝/dispose/降级 + 只 warn 一次 |
| D3 | 插件 `tests/optional-peers.spec.ts:12-35` | 修改 | 加载时刻不变量（不变量 8） | `vi.mock('@deepseek-ai/dsh-file-reference-local', …)` 置 `loaded=true`；import `../src/index.ts` 与 `../src/file-references.ts` 后断言 `loaded === false` |
| D4 | 插件 `tests/patch.spec.ts:117-138` | 修改 | 组合不变量 | `inserted.map(id)` 期望列表在 `multi-root-workspace-files` 与 `multi-root-command` 之间加 `multi-root-file-references`；`gated` 数组加同名 id；用例标题同步「the user surface」→ 加上文件提及行（可选，但保持可读） |
| D5 | 插件 `scripts/smoke-compose.mjs:31-46` | 修改 | 真实组合 dump 的行顺序 | `INSERTED` 数组同 D4 同位置加 `multi-root-file-references` |
| D6 | 插件 `scripts/smoke-journey.mjs:397` 之后 | 修改 | 真实 web 组合里的 `@` seam 断言 | 复用已创建的 `journey-web` agent 与 `/workspace-folders add` 结果，直接调 `ctx.fileReferences.list(agent, …)`；断言空 query 出现附加根目录候选、`${additionalRepo}/` 钻入返回绝对候选、裸模糊仍不含附加根、`remove` 后候选消失 |

### E. 文档（与代码同批）

| # | 文件（仓 / 插件） | 动作 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| E1 | 插件 `docs/decisions/ADR-0012-additional-root-file-references.md` | **新建** | Q5 已定：新开 ADR | 单主题；Status Accepted / Date 2026-10-19；Context、Decision（行形态/主根来源/检索载体/空 query/绝对钻入/裸模糊不合并/optional peer 与门禁）、Alternatives、Consequences、Related Documents；绝对路径示例一律放进代码围栏（`docs:check` CHECK 6 会跳过围栏） |
| E2 | 插件 `docs/decisions/README.md:30`、`docs/decisions/README.en.md:30` | 修改 | ADR 索引 | 追加 ADR-0012 一行（中英） |
| E3 | 插件 `docs/architecture/multi-root-workspace.md`（§6 之后、§7 之前） | 修改 | 新增消费方小节 | 加 `### 6.2 @ 文件提及补全（multi-root-file-references）`：seam、包装方式、空 query/绝对钻入/前缀匹配、主根来源、动态导入、已知限制；§1 消费路径图加一行 `@ 提及 → ctx.fileReferences` |
| E4 | 插件 `README.md`（使用方法 / 项目结构 / 已知限制）、`README.en.md`（Usage / Project Structure / Known Limitations） | 修改 | 用户可见行为 | 使用方法加「`@` 文件提及」段；项目结构加 `file-references.ts` 与 `compat/file-reference-search.ts`；已知限制把「六行」改「七行」，并加三条：裸模糊不跨根、根绝对路径含排除目录名时不钻入、绝对路径钻入后的面包屑是上游相对语义；README L128/en L128 的 smoke 计数按 D6 实跑结果更新 |
| E5 | 插件 `AGENTS.md` | 修改 | 不变量 | 不变量 7 行清单（见 B9）；新增不变量 11：「`@` 补全是 additive 发现增强：裸模糊不跨根、空 query 每根一条、绝对候选、optional peer 按需加载、主根=不可变 session cwd；不得改成第二份根数据源」 |
| E6 | 插件 `README.en.md:47,204`、`README.md:204`、`docs/architecture`、`docs/troubleshooting` 的「六行」 | 修改 | 计数一致 | 与 B6/B7 同批完成，避免同一事实多处漂移 |

### F. 只读核实、不改的文件（证明触达面完整）

- 上游 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-file-reference-local/lib/index.js`（`WorkspaceFileSearch` 语义、`resolveDisplayDirectory` 逃逸检查、`listDirectory` 候选拼接）；
- 上游 `dsh-file-reference`、`dsh-session`、`dsh-sandbox-policy`、`dsh-api-session-controller`、`dsh-client-ui-reference`、`dsh-web-app/cordis.patch.yml`（见 ②）；
- 本仓 `plugins/project-mcp/src/**`、`plugins/user-commands/src/**`、`scripts/upgrade-dsh.mjs`、`scripts/release.mjs`、`scripts/check-dsh-baseline.mjs`（按包名/目录枚举，改名零改动）；
- `openspec/changes/archive/**`（历史归档，刻意不改）。

## ② 证据锚

> 全部为本轮亲自读到的行；路径按**改名前**的当前状态书写。两处与 `explore.md` 的出入以本表为准：
> 1. **R1 的落点**：explore 写「`listDirectory` 产出相对 path，需要插件侧前缀化」；实际实现不是给相对候选补前缀，而是把 `R/` 作为 `displayDirectory` 传给 `listDirectory`——上游按 `${displayDirectory}${entry.name}` 直接产出绝对候选（`dsh-file-reference-local/lib/index.js:182-202`），插件侧不需要二次加工。
> 2. **R4 的面包屑部分**：explore 称「上游 `withLocation` 逻辑已处理绝对 parent」，展示层（label/description）确是如此；但钻入后的**面包屑**（`crumbsFor`，`client.js:383-414`）按相对段拼接，绝对路径钻入后点中间层会得到相对 query（见待决 Q1）。
>
> 改名批次的行号锚已写在 ① 表格每行的 `file:line` 上（代码模块之外的文档改动不在此表重复）；`pnpm-lock.yaml` 的当前 importer key 在 `pnpm-lock.yaml:11`。
> 两个新文件（`src/file-references.ts`、`src/compat/file-reference-search.ts`）尚无代码事实可锚，它们的每个结构选择都能对应到本表的一条先例（`lsp.ts` / `workspace-files.ts` / `llm-message.ts`）或上游行为（`listDirectory` / `resolveDisplayDirectory` / `fileCandidate`）。

### 本仓代码

| 模块 | 锚 | 事实 | 用途 |
| --- | --- | --- | --- |
| `src/lsp.ts` | `src/lsp.ts:8`、`:13-20` | additive 行的 `inject=['multiRootCompat','multiRootScope']`，`ctx.inject(['lsp','fs'])` 内 `wrapMethod(service,'query',…)`，`scopeOf(...).length===0` 直接 `original.call` | 新行的结构先例 |
| `src/workspace-files.ts` | `src/workspace-files.ts:17-24`、`:46-50` | 包装 `list`；异步后再查 `scopeOf(primary).includes(workspaceRoot)`，不满足即丢弃/报错；卸载先 abort 再 restore | I/O 后复验 scope；卸载顺序 |
| `src/method-wrapper.ts` | `src/method-wrapper.ts:2-17` | 读原型描述符、安装实例属性、卸载时只有在描述符仍指向本包装时才恢复 | 卸载恢复语义 |
| `src/command.ts` | `src/command.ts:363-371` | `resolvePanelPrimaryRoot`：`sessions.get(sessionId).header.cwd` → `canonicalPath`；无 `sandboxPolicy` 回退 | 主根来源先例（invariant 9） |
| `src/scope.ts` | `src/scope.ts:213-218`、`:97-118` | `scopeOf(primaryRoot)` 内部 `canonicalPath`；返回 `sanitizeAdditionalRoots` 的 canonical、去重、存在且是目录、`recordedPath` 未变的根 | 唯一根数据源；空列表=透传 |
| `src/compat/dsh-version.ts` | `src/compat/dsh-version.ts:58-72` | `OPTIONAL_CORE_PACKAGES` 是纯数组字面量，供运行时门禁与静态检查共用 | 三处同步的单一真源 |
| `src/compat/llm-message.ts` | `src/compat/llm-message.ts:120-134` | optional peer 在调用点 `await import(...)`，加载失败抛错（因为「有文本必须投递」） | 动态导入先例；本行不照抄它的抛错策略（见 ④ D8） |
| `src/instructions.ts` | `src/instructions.ts:262` | 行级 `inject` 可含 `multiRootCompat`/`multiRootScope` 之外的 `sandboxPolicy` | 新行不需要 `sandboxPolicy`（只做发现） |
| `scripts/check-dsh-compat.mjs` | `scripts/check-dsh-compat.mjs:77-83`、`:88-106`、`:111-130` | 每个 `@deepseek-ai/dsh-*` peer 的 range 必须逐字等于 allowlist 以双竖线拼接出的那条串；required 必须在 peers 中；devDeps 只能有一个 allowlist 版本；安装树版本必须一致 | B1–B5 的验收依据 |
| `package.json` | `package.json:8-57`、`:90-111`、`:112-152`、`:153-201` | exports 子路径、exact peers、optional meta、devDeps 的实际形状 | 照现有形状追加 |
| `cordis.patch.yml` | `cordis.patch.yml:34`、`:81-85` | insert 块里 `multi-root-workspace-files` 之后直接是 `multi-root-command`；最后是 bare-name 的 `multi-root-client` | 新行插入位置 |
| `tsdown.config.ts` | `tsdown.config.ts:59-71`、`:81` | host `entry` 是显式清单；`neverBundle` 以 peer/dep 包名为准，因此新 peer 的动态 import 不会被内联 | C5 与「动态导入保持 external」 |
| `tests/optional-peers.spec.ts` | `tests/optional-peers.spec.ts:12-35` | 用 `vi.mock` + 标志位断言 barrel 与行模块加载时不解析 optional peer | D3 的模板 |
| `tests/patch.spec.ts` | `tests/patch.spec.ts:117-138` | 精确断言 insert 行 id 顺序、exports 子路径存在、门禁行在 gate 之后 | D4 必须同步 |
| `scripts/smoke-compose.mjs` | `scripts/smoke-compose.mjs:31-46` | `INSERTED` 是精确数组；compose 断言行顺序与名字 | D5 必须同步 |
| `scripts/smoke-journey.mjs` | `scripts/smoke-journey.mjs:340-397` | web leg 已 `bootProfile('web')`、`ctx.agents.create({sessionId:'journey-web', meta:{cwd:primaryRepo}})`、`/workspace-folders add` 后取 `scopeOf` | D6 可直接在真实组合里断言 `@` seam |
| `docs/architecture/multi-root-workspace.md` | `:81-85`、`:220-222` | 行清单/门禁说明；§10 已改名为「多根消费方扩展（B1–B3）」 | E3 的插入点 |
| `plugins/dsh-plugin-multi-root-workspace/AGENTS.md` | `:90`、`:99`、`:107` | vendored 路径；「Ten invariants」；不变量 7 的六行清单 | A7 / B9 / E5 |
| 根仓 `AGENTS.md` | `:27` | 「包名一律 `dsh-plugin-<目录名>`」——改名后 `dsh-plugin-` + `multi-root-workspace` 正好成立，**该行不需要改** | 证明改名批次不触这根文件（修正 ① 的直觉） |
| 根仓 `pnpm-workspace.yaml` | `:3`、`:175-176` | 注释里的旧目录；两个 file-reference 包的 release-age 豁免已存在 | A3 / B5（无需新增豁免） |
| `.agent/note/dsh-compat-contract.md` | `:33-41` | 门禁行清单（六个）在 agent note 里也有一份 | B6 |

### 上游代码（只读）

| 模块 | 锚 | 事实 | 用途 |
| --- | --- | --- | --- |
| `dsh-file-reference-local/lib/index.js` | `:54`、`:406` | `WorkspaceFileSearch` 是包根导出（`export { …, WorkspaceFileSearch, … }`） | Q3 的载体可达性 |
| 同上 | `:182-202` | `listDirectory(displayDirectory, fragment)` 的候选 `path = \`${displayDirectory}${entry.name}\``；`displayDirectory` 为空时产出相对名，为绝对前缀时产出绝对名 | 空 query 必须显式传 `R/` 才能得到绝对候选（R1 的落点） |
| 同上 | `:204-223` | `resolveDisplayDirectory`：`absolute = resolve(resolvedRoot, displayDirectory)`；`relative(resolvedRoot, absolute)` 为 `..`/跨卷则 `undefined`；逐段 `lstat` 拒 symlink/非目录。以附加根为 `root` 时 `relative(root, R/...)=相对段`，逃逸检查通过 | 绝对钻入为何能过逃逸检查（亲自核实，非照搬） |
| 同上 | `:183` | `listDirectory` 先做 `displayDirectory.split("/").some(seg => excludedDirectories.has(seg))` | 已知限制：根的绝对路径里含 `build/out/node_modules` 等段时钻入为空（见 ⑥ A7） |
| 同上 | `:386-393` | `LocalFileReferenceService.list` 以 `ctx.workingDirectory.ensure(agent, signal)` 为搜索根并按 agent 缓存 | 说明上游主根是「有效工作目录」，与本行的 scope 主根不是同一概念（④ D5） |
| `dsh-file-reference/lib/types/index.d.ts` | `:20`、`:29` | `FileReferenceService.list(agent, query, signal): Promise<FileReferenceCandidate[]>`；`Context.fileReferences` 声明 | 包装签名 |
| `dsh-file-reference/lib/index.js` | `:39-40` | `formatFileMention` 对 `kind:'directory'` 自动补尾斜杠 | 候选 `path` 不能自带尾斜杠（否则 `//`） |
| `dsh-session/lib/types/types.d.ts` | `:59-70` | `SessionHeader.cwd?: string`，语义是「创建会话时的绝对工作目录（不可变）」 | 主根来源可用且不受 `cd` 影响 |
| `dsh-sandbox-policy/lib/index.js` | `:145` | `workspaceRoot: resolveWorkspaceRoot(session?.header.cwd ?? this.workspaceRoot)` | 证明 scope 的键就是 header.cwd canonical（与 D5 一致） |
| `dsh-api-session-controller/lib/index.js` | `:1844` | `SessionFileReferences.list` 直接 `return this.ctx.fileReferences.list(agent, query, signal)`，无过滤/无上限 | 行返回值直达 web |
| `dsh-client-ui-reference/lib/client.js` | `:306` | `ctx.remote.fileReferences.list(...).then(result => result.ok ? result.value : [])`：远端整体失败 → 空列表 | 抛错会连带吞掉主根候选（④ D8 的反例） |
| 同上 | `:383-414` | `crumbsFor` 用 `query.slice(0, slash).split("/").filter(seg => seg !== "")` 造相对面包屑；`drilled` 才有 | 绝对路径钻入后面包屑是相对语义（待决 Q1） |
| 同上 | `:415-438` | `fileCandidate` 用 `candidate.path.lastIndexOf("/")` 切 label/parent | 候选 `path` 必须是 `/` 分隔（Windows 也要用显示形式，④ D11） |
| `dsh-web-app/cordis.patch.yml` | `:97-98` | 只有 web-app 组合挂 `file-reference-local` | headless 无 `ctx.fileReferences`，新行为 no-op（⑥ A1） |

## ③ 接口与数据形状

### 3.1 新行模块 `src/file-references.ts`

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { FileReferenceCandidate, FileReferenceService } from '@deepseek-ai/dsh-file-reference'
import type {} from './compat.ts'   // 声明 ctx.multiRootCompat
import type {} from './scope.ts'    // 声明 ctx.multiRootScope
import { canonicalPath } from '@deepseek-ai/dsh-sandbox'
import { AdditionalRootSearchCache } from './compat/file-reference-search.ts'
import { wrapMethod } from './method-wrapper.ts'

/** 与 lsp/workspace-files 一致：门禁前置 + 唯一根数据源。 */
export const inject = ['multiRootCompat', 'multiRootScope']

export function apply(ctx: Context): void

/** 一个被授予的附加根，canonical 用于检索/复验，display 用于候选路径。 */
export interface GrantedRoot {
  /** scope 返回的 canonical 原生路径（检索实例的 root，也是复验键）。 */
  readonly canonical: string
  /** 对用户展示/插入的路径：`/` 分隔、无尾斜杠（Windows 也转 `/`）。 */
  readonly display: string
}

/** 一次查询要追加的内容；`undefined` 表示完全不干预（字节级透传）。 */
export interface AdditionalCandidatesPlan {
  /** 追加为绝对目录候选的根，按 scope 顺序。 */
  readonly roots: readonly GrantedRoot[]
  /** 需要以该根为范围列目录时的钻入目标。 */
  readonly drill?: { readonly root: GrantedRoot; readonly query: string }
}

/** 原生路径 → 候选显示路径（win32 把 `\` 换成 `/`；POSIX 原样）。 */
export function toDisplayPath(canonical: string): string

/**
 * 纯函数：按 query 形态决定追加什么。
 * - 空 query → { roots: 全部 }
 * - 绝对 query → drill = 最长匹配的包含根（要求 `R/` 前缀，即 `normalized === R + '/'` 或以 `R + '/'` 开头）；
 *   roots = 其余「以 query 为前缀」的根（`pathStartsWith(R, normalized)`；win32 大小写不敏感）
 * - 裸模糊 / 相对 query → undefined
 * query 先按上游同样的规则归一化（`replaceAll('\\','/')`）再判形态。
 */
export function planAdditionalCandidates(
  query: string,
  roots: readonly GrantedRoot[],
): AdditionalCandidatesPlan | undefined
```

行内私有函数：

```ts
/** 主根：agent 的不可变 session cwd → canonical；缺失/非绝对 → undefined。 */
function primaryRootOf(agent: Agent): string | undefined

/** 把 plan 落成候选，并在 I/O 后复验 scope。 */
async function materialize(
  scope: Context,                 // 注入后的 scoped Context
  cache: AdditionalRootSearchCache,
  primaryRoot: string,
  plan: AdditionalCandidatesPlan,
  signal: AbortSignal,
): Promise<FileReferenceCandidate[]>
```

`apply` 的骨架（顺序即语义）：

```ts
export function apply(ctx: Context): void {
  ctx.inject(['fileReferences'], scope => {
    const service = scope.get('fileReferences') as FileReferenceService
    scope.effect(() => {
      const cache = new AdditionalRootSearchCache({
        warn: message => scope.logger.warn(message),
      })
      const restore = wrapMethod(service, 'list', original =>
        async function (this: FileReferenceService, agent, query, signal) {
          const primaryRoot = primaryRootOf(agent)
          const roots = primaryRoot === undefined ? [] : scope.multiRootScope.scopeOf(primaryRoot)
          cache.retain(roots)                                   // 每次调用顺带剪枝
          if (primaryRoot === undefined || roots.length === 0) {
            return original.call(this, agent, query, signal)    // 字节级透传
          }
          const plan = planAdditionalCandidates(query, roots.map(root => ({
            canonical: root,
            display: toDisplayPath(root),
          })))
          if (plan === undefined) return original.call(this, agent, query, signal)
          const base = await original.call(this, agent, query, signal)
          const extra = await materialize(scope, cache, primaryRoot, plan, signal)
          if (extra.length === 0) return base
          const seen = new Set(base.map(candidate => candidate.path))
          return [...base, ...extra.filter(candidate => !seen.has(candidate.path))]
        })
      return () => {
        restore()
        cache.disposeAll()
      }
    }, 'multi-root:file-references discovery')
  })
}
```

`materialize` 的规则：

1. `plan.roots`：重新取 `scopeOf(primaryRoot)`，按 `canonical` 过滤（仍被授予才保留；`plan` 是调用开始时的快照，I/O 期间新增的根等下一次按键再出现），映射为 `{ path: display, kind: 'directory' }`。
2. `plan.drill`：`const search = await cache.acquire(drill.root.canonical)`；`undefined` 直接跳过（降级）。否则 `const items = await search.list(drill.query, signal)`；再查一次 `scopeOf(primaryRoot).includes(drill.root.canonical)`，不在则丢弃。
3. 结果去重（根候选之间、与 base 之间）后返回；顺序：钻入结果在前、前缀根候选在后（单次查询最多一个 drill）。
4. 不吞 `signal` 的 abort：`WorkspaceFileSearch.list` 会抛，原样上抛。

### 3.2 适配层 `src/compat/file-reference-search.ts`

```ts
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference'

/** 本插件用到的检索实例面（结构子集，不 import 上游值）。 */
export interface AdditionalRootSearch {
  list(rawQuery: string, signal: AbortSignal): Promise<readonly FileReferenceCandidate[]>
  dispose(): void
}

/** 适配后的上游包面；`createSearch` 已绑定合法的 FileSearchConfig。 */
export interface FileReferenceLocalApi {
  createSearch(root: string): AdditionalRootSearch
}

export type FileReferenceSearchLoader = () => Promise<FileReferenceLocalApi | undefined>

export interface AdditionalRootSearchCacheOptions {
  /** 测试注入点；默认 {@link loadFileReferenceLocal}。 */
  readonly load?: FileReferenceSearchLoader
  /** 一次性告警出口；默认静默（测试可断言）。 */
  readonly warn?: (message: string) => void
}

/**
 * 结构探针：接受 upstream 模块命名空间，返回适配面或 undefined。
 * 要求 `WorkspaceFileSearch` 是函数，且三个默认常量类型合法；缺一即 undefined。
 */
export function adaptFileReferenceLocal(module: unknown): FileReferenceLocalApi | undefined

/** 记忆化的动态导入 + 结构探针；缺席/形状不符 → undefined，不抛。 */
export function loadFileReferenceLocal(): Promise<FileReferenceLocalApi | undefined>

/** 每个附加根一个检索实例；实例缓存与生命周期。 */
export class AdditionalRootSearchCache {
  constructor(options?: AdditionalRootSearchCacheOptions)
  /** 取（或创建）一个根的实例；不可用（peer 缺席/形状不符/构造失败）→ undefined。 */
  acquire(root: string): Promise<AdditionalRootSearch | undefined>
  /** 保留这些根，dispose 其余实例（根撤销/切换主根时调用）。 */
  retain(roots: readonly string[]): void
  /** 行卸载：dispose 全部并拒绝后续 acquire。 */
  disposeAll(): void
}
```

内部数据形状：

```ts
/** 由 upstream 常量构造；不复制排除表内容。 */
interface ResolvedSearchConfig {
  readonly maxResults: number          // DEFAULT_FILE_SEARCH_MAX_RESULTS（0.2.1-rc.2 = 20）
  readonly maxEntries: number          // DEFAULT_FILE_SEARCH_MAX_ENTRIES（= 50000）
  readonly excludedDirectories: readonly string[]  // DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES 的拷贝
}
```

加载/缓存语义（必须按这个顺序实现）：

1. `loadFileReferenceLocal` 用一个模块级 `Promise` 记忆化；`import()` 抛 `ERR_MODULE_NOT_FOUND`/`MODULE_NOT_FOUND` → `undefined`，其余错误 → `warn` 一次并 `undefined`（**不抛**，见 ④ D8）。
2. `adaptFileReferenceLocal` 用 `typeof module.WorkspaceFileSearch === 'function'` + 三个常量的类型检查；构造 `ResolvedSearchConfig` 时拷贝排除目录数组。
3. `acquire(root)`：Map 命中直接返回；否则把 `createPromise` 先放进 Map（并发去重），成功后缓存实例，失败/不可用则删除 Map 项以便下次重试（peer 缺席时由记忆化的 `load` 直接短路）。
4. `retain(next)`：遍历 Map，key 不在 `next` 的 → `dispose()` + delete；`disposeAll` 置 `disposed=true`，之后的 `acquire` 返回 `undefined`，在飞创建完成后立即 `dispose()`。
5. `createSearch` 抛错（例如 root 不可读导致构造函数校验失败）→ `warn` 一次 + `undefined`。

### 3.3 组合与清单契约定型

```yaml
# cordis.patch.yml（只加这一段，位置在 multi-root-workspace-files 之后）
    - id: multi-root-file-references
      name: 'dsh-plugin-multi-root-workspace/file-references'
```

```jsonc
// package.json（三处）
"exports": { "./file-references": { "types": "./lib/types/file-references.d.ts", "default": "./lib/file-references.js" } },
"peerDependencies": {
  "@deepseek-ai/dsh-file-reference": "0.1.5-rc.2 || 0.1.6-alpha.1 || 0.1.6-alpha.2 || 0.1.7-alpha.1 || 0.1.7-alpha.2 || 0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2 || 0.2.1-rc.2",
  "@deepseek-ai/dsh-file-reference-local": "0.1.5-rc.2 || 0.1.6-alpha.1 || 0.1.6-alpha.2 || 0.1.7-alpha.1 || 0.1.7-alpha.2 || 0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2 || 0.2.1-rc.2"
},
"peerDependenciesMeta": {
  "@deepseek-ai/dsh-file-reference": { "optional": true },
  "@deepseek-ai/dsh-file-reference-local": { "optional": true }
},
"devDependencies": {
  "@deepseek-ai/dsh-file-reference": "0.2.1-rc.2",
  "@deepseek-ai/dsh-file-reference-local": "0.2.1-rc.2"
}
```

- **行配置键：无**。新行不新增 `Config`，也不读插件配置；检索参数固定取上游默认常量（④ D7）。
- **候选形状**：沿用上游 `FileReferenceCandidate = { path: string; kind: 'file' | 'directory' }`；`path` 为绝对时使用 `/` 分隔、目录不带尾斜杠（`formatFileMention` 负责补 `/`）。
- **根候选**：`{ path: toDisplayPath(canonicalRoot), kind: 'directory' }`。
- **钻入候选**：直接使用 `WorkspaceFileSearch.list` 返回值（它已按 `displayDirectory` 前缀拼接为绝对路径）。
- **不新增 wire 协议**：完全走既有 `ctx.fileReferences` → `sessionFileReferences` Remote（`dsh-api-session-controller` 直通），web 端零改动。

## ④ 决策记录

> 每条含结论、被否方案与理由、≥1 条反例。`decisions.md` 已拍板的 Q1–Q5 只做代码落点说明，不重开。

### D0 栈识别结论（必须记录）

- **结论**：本仓是 **TypeScript / pnpm workspace 单仓多包插件仓**。判据（实物）：根 `package.json` `"packageManager": "pnpm@11.25.0"`、`pnpm-workspace.yaml` `packages: ["plugins/*"]`；插件 `package.json` `"type": "module"`、构建 `tsc -p tsconfig.host.json && tsdown`、测试 `vitest run`、lint `oxlint`；无 `build.gradle`/`pom.xml`、无 `nuxt.config.*`/`app/`。
- **未命中**：`spring-writer`（Java/Spring 方向）与 `nuxt-writer`（Vue/Nuxt 方向）在本仓没有任何对应栈。那两个 skill 的强制加载约定来自其他工作区（opc 的 Java/Nuxt 子仓）的 AGENTS.md，其适用范围不覆盖本仓。
- **豁免**：用户已明确豁免本次 writer skill 加载（仅本次有效）→ 本设计**未触 writer 约束（用户豁免，栈无对应 skill）**。
- 被否：硬套任一份 writer 规范——会引入与本仓既有 ADR/约定（ADR-0001/0002/0009）冲突的分层与命名规则，且没有可执行收益。反例：若按 `spring-writer` 的 Java 分层把 `src/compat/` 改造成 adapter 层命名，会与 `tests/optional-peers.spec.ts`、`scripts/check-dsh-compat.mjs` 已经钉死的模块边界不符。

### D1 行形态：additive 包装 `ctx.fileReferences.list`

- **结论**：新增 `multi-root-file-references` 行，`wrapMethod` 公开方法；不 disable/替换任何上游行。
- **被否**：① disable `file-reference-local` 再 insert 自有 provider——会重写主根搜索（排除表/排名/索引生命周期），并与未来其他 additive 包装冲突；② 包装 remote 层（`SessionFileReferences`）——不在插件可达面，且要复制 wire 协议；③ 在客户端做候选合并——web 半部拿不到 scope，且客户端不可信。
- **反例**：若替换 provider，`ctx.fileReferences` 的服务身份被本包独占；任何别家插件（或未来上游）再想 additive 包装都会与本行叠成 provider 竞争，而 `multi-root-workspace-files`/`multi-root-lsp` 已经证明「包装公开方法」不需要承担这个代价。

### D2 检索载体：动态导入上游 `WorkspaceFileSearch`（Q3 已定）

- **结论**：`src/compat/file-reference-search.ts` 用 `await import('@deepseek-ai/dsh-file-reference-local')`，只取 `WorkspaceFileSearch` 与三个默认常量。
- **被否**：静态值导入（会让 carrier 行在缺 peer 的组合里装不上）；自写 `readdir`（要复制排除目录表、rank 算法、逐段 lstat 拒 symlink）。
- **反例**：headless 组合根本不挂 `file-reference-local`（`dsh-web-app/cordis.patch.yml:97` 是唯一挂载点），`ctx.fileReferences` 缺席；静态值导入会让 `multi-root-file-references` 行在**所有** headless profile 装载失败（而不是安静地不做贡献），若该模块将来被 barrel 引用，连 carrier 行也会一起失败。

### D3 裸模糊不跨根合并（Q1 已定，落点记录）

- **结论**：`planAdditionalCandidates` 对「非空、无 `/`」返回 `undefined`，一行代码都不碰上游结果。
- **被否**：给每个根建索引并合并排名（性能与语义都不可比）。
- **反例**：`commonRoots` 常见配置是 `~/.cache`；合并后在 `@test` 首查要扫整个 cache 树（`maxEntries` 5 万也拦不住首查延迟），且主根结果会被跨根同名文件挤掉。

### D4 空 query 每根一条（Q2 已定，落点记录）

- **结论**：只追加一条绝对目录候选；不铺开根内条目。
- **被否**：铺开每根顶层条目（信息量大但淹没主根）。
- **反例**：上游空 query 已经用满 `maxResults=20` 的主根顶层结果；再铺 N 个根的顶层条目，web 端一屏内主根候选会被挤到列表后半，用户反而更难选。

### D5 主根取 `agent.session.header.cwd`（canonical），不取 `workingDirectory.ensure`

- **结论**：`primaryRootOf(agent) = isAbsolute(header.cwd) ? canonicalPath(header.cwd) : undefined`。
- **被否**：`ctx.workingDirectory.ensure(agent)`——它是**有效工作目录**（可被 `working-directory/change` 改），不是 registry/scope 索引的主根；`cd` 之后用它查 scope 会查空。次要理由：若按本仓惯例把它写进行 `inject`/兼容契约，会新增第三个 optional peer，与已收敛的「只加两包」不符（即使改用 `ctx.get('workingDirectory')` 兄弟查找绕开契约，语义问题依然存在）。
- **反例**：用户在会话里 `cd /tmp` 后，`ensure()` 返回 `/tmp`，`scopeOf('/tmp')` 为空 → 附加根候选凭空消失，而 workspace 的根集合并没有变；反过来用 header.cwd 时，`cd` 后附加根仍以绝对路径出现，候选无歧义。
- **代价（记录）**：`cd` 后上游主根候选来自新目录、本行根候选仍按项目根给出；两者都是绝对/相对可区分的候选，不会误读。

### D6 绝对 query 的两种命中：钻入 + 前缀匹配

- **结论**：`normalized === R + '/'` 或以 `R + '/'` 开头 → 以 `R` 为 root 钻入（最长匹配）；否则若 `R` 以 query 为前缀（`@/home/xu`）→ 追加 `R` 的目录候选。**不把 `R` 本身（无尾斜杠）当钻入**——上游 `listDirectory` 会把它切成父目录片段并因逃逸返回空。
- **被否**：用 `ctx.fs.resolve` + `contains` 判断归属——需要额外 I/O 与服务注入，且 `resolve` 会归一化 `..`，候选回显会与上游「回显 display 前缀」行为分叉。
- **反例**：不做前缀匹配时，用户必须把 `@/home/xuqinqin/develop/docker/` 完整敲对才看得到候选；路径越长越难记，而这正是 `@` 要解决的问题。

### D7 检索参数取上游默认常量，不开放行配置

- **结论**：`FileSearchConfig` 从动态导入的模块常量构造，逐次复用；新行无 `Config`。
- **被否**：行上暴露 `maxResults/maxEntries/excludedDirectories`——读不到 provider 的私有配置，两份配置必然漂移，用户会误以为改了「与主根一致」；反射读 `LocalFileReferenceService.config` 是 TS-private，跨包不可达（ADR-0002）。
- **反例**：provider 配置了 `excludedDirectories: ['lib']` 时本行仍列出 `lib` —— 已知不一致；若开放插件配置，用户需要同时维护两处才能对齐，比「接受默认值」更容易出错。

### D8 optional peer 的失败策略：缺席与「装坏」都降级，后者 warn 一次（不抛）

- **结论**：`loadFileReferenceLocal` 对 `MODULE_NOT_FOUND` 静默 `undefined`；对其他加载/求值错误 `warn` 一次并 `undefined`；行在 `undefined` 时只返回主根结果。
- **被否**：照抄 `agent-instructions.ts` / `llm-message.ts` 的「装坏就抛」——那两处的语义是「有指令文本必须投递」；本行是**可加可减的发现增强**，抛错会连主根结果一起丢掉。
- **反例**：`dsh-client-ui-reference/lib/client.js:306` 把远端整体失败映射成 `[]`；若本行在 `original` 返回后抛错，用户会看到「`@` 一个候选都没有」，而主根能力其实完好。warn + 透传既保住主根，又让装坏在日志里可见。

### D9 检索实例缓存：按 canonical 根 + 每次调用 `retain` 剪枝，不订阅 scope

- **结论**：`AdditionalRootSearchCache` 以 canonical root 为键；每次 `list` 先 `retain(roots)`；卸载 `disposeAll()`。
- **被否**：`scope.subscribe` 里即时 dispose。理由：① 本行只发目录 query，`WorkspaceFileSearch.list` 只在无斜杠的裸模糊 query 上走 `indexFor`（上游 `lib/index.js:77-88`），本行从不触发，因此实例没有需要提前释放的索引；② 一次 publication 会对其余主根的缓存实例也做无意义 churn；③ `dispose()` 只 abort 惰性索引，并不会中止在飞的 `listDirectory`（`lib/index.js:100-106`），订阅换不来「立刻停止」。
- **反例**：给 `scope.subscribe` 挂上即时 dispose 后，同一进程里另一个主根（另一个会话）登记根时，本会话的缓存实例被销毁、下次查询重新 import/构造；而这次 publication 与本会话的 scope 毫无关系。

### D10 主根与 scope 复用 `ctx.multiRootScope`，不建第二数据源；不导出进 barrel

- **结论**：只用 `scopeOf(primaryRoot)`；新模块不进 `src/index.ts` 的导出面。
- **被否**：把 `file-references.ts` 的符号 re-export 进 barrel。barrel 是 carrier 行装载的模块，任何新增的值导出都会扩大它的加载期依赖图（不变量 8 的同一理由）；`lsp.ts` / `workspace-files.ts` 也没有进 barrel。
- **反例**：若 barrel re-export 了 compat 模块，未来有人在该模块加一个值导入（哪怕只是常量），headless 的 carrier 行会立即装载失败——而 barrel 本可以完全不认识这个可选功能。

### D11 候选路径使用显示形式：`/` 分隔、目录不带尾斜杠

- **结论**：根候选 `path = toDisplayPath(canonical)`（win32 把 `\` 换 `/`），无尾斜杠；钻入结果沿用上游回显。
- **被否**：直接使用原生 `C:\...`；或让候选自带尾斜杠。
- **反例**：上游 `fileCandidate`（client.js:418）用 `lastIndexOf("/")` 切 label/parent、`crumbsFor`（client.js:386）用 `/` 切层级；`C:\Users\me\docker` 会让 label 变成整条路径、parent 为空，钻入层级错乱。尾斜杠则会被 `formatFileMention` 再补一次（dsh-file-reference/lib/index.js:40）变成 `//`。

### D12 版本与决策记录（Q4/Q5 已定，落点记录）

- **结论**：两批并入下一次 release，`v1.3.0`；新开 ADR-0012；改名不占 ADR。
- **被否**：`v2.0.0`（把 `&path:` 变化视为破坏性）；ADR-0011 增补（一 ADR 一主题，0011 已封存）。
- **反例**：旧 tag 仍可按旧路径安装，破坏面只是「新 tag 的 path 变了」；且本仓是单用户私有仓，major 号不会给任何自动化消费者带来收益，反而打乱「仓库级统一版本」的既有节奏。

### D13 测试分层：行行为与适配层分开两个 spec

- **结论**：`tests/file-references.spec.ts` 用真 scope + 桩 provider 测行；`tests/file-reference-search.spec.ts` 测纯适配/缓存；加载时刻单独扩 `optional-peers.spec.ts`。
- **被否**：一个 spec 里用 `vi.mock` 同时覆盖加载时刻与行为（模块 mock 是文件级、会污染真检索用例）。
- **反例**：在行为 spec 里 mock 掉 `file-reference-local` 后，绝对钻入用例只能断言桩返回值，真实 `resolveDisplayDirectory` 逃逸检查就没被验证——而这正是 R1 的核心。

## ⑤ 逐任务组实现要点

> 与 `explore.md` 第 4 节的任务批次一一对齐（A1–A3 / B4 / C5–C7 / D8–D9 的编号沿用）。**批内可并行，批间串行**；每批结束跑该批验证，绿了再进下一批。

### 批次 A（G2 改名，先行，零行为变化）——对应 explore A1–A3

**顺序依赖**：必须是第一步。先改目录，后续 B/C/D 的所有编辑才只触碰新路径一次；若放到最后，同一批文件要改两遍。

1. `git mv plugins/dsh-plugin-multi-root-workspace plugins/multi-root-workspace`（**先确认目标不存在**；同一命令完成，不做 copy+delete）。
2. 立即 `pnpm install` 刷新 `pnpm-lock.yaml` 的 importer key；确认依赖版本零变化（`git diff --stat pnpm-lock.yaml` 只应体现 key/路径）。
3. 按 ①A3–A10 逐文件改路径引用（**包名引用一律不动**）；`docs/architecture` 的 §3 目录树标签与一句说明一起改；A11 的 `lib/` 由下一步构建重建。
4. 复验：全仓 grep 旧路径应为 0 命中（归档除外），并跑全量门禁。

**验证映射**

```bash
test ! -e plugins/dsh-plugin-multi-root-workspace
# 口径 R1（执行期实测修正）：除归档外还需排除两类合法历史引用源——
# ① 本变更工件自指（proposal Why/tasks 验证句/code-design 触达面必然写出旧路径）；
# ② `.dsh-smoke/`（git-ignored 冒烟产物，design 触达面明确「不改」）。
grep -rn 'plugins/dsh-plugin-multi-root-workspace' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=lib --exclude-dir=.dsh-smoke . \
  | grep -v 'openspec/changes/archive/' | grep -v 'openspec/changes/multi-root-at-mention-and-rename/'   # 预期 0
pnpm install --frozen-lockfile                   # 预期 exit 0（lockfile 已含新 importer key）
pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm docs:check
```

> 断言写法：`grep` 命中数必须为 `0`，不是「看起来没了」；`--frozen-lockfile` 通过才证明 lockfile 与目录一致。

**组 1 实测终形态（2026-10-19，全绿）**：`install --frozen-lockfile` Already up to date（lockfile 仅 importer key 互换，200 文件全 R rename）；build 四插件过（multi-root `lib/` 21 文件重建）；typecheck 四过；test 386 passed + 5 skipped（既有条件跳过：parity-matrix 3 / windows 1 / compat 1）+ project-mcp 61 + user-commands 96 + web-ux 136；lint 全部 0 errors（project-mcp / user-commands 各 19、web-ux 3 个既有 `lib/` 产物警告，非本次引入）；docs:check 10 项 PASS。清零口径修正见 **R1**（tasks.md 留痕）。两处偏差裁决：① `AGENTS.md:90` 与 `architecture:48` 各自然融入「目录名不带前缀、包名不变」说明句（design 原文只点名后者，前者同款措辞防后续混淆，保留）；② README 双语「本地路径（开发调试）」占位 `/path/to/dsh-plugin-multi-root-workspace` → `/path/to/multi-root-workspace`（主会话裁决：该行语义为本地 checkout 目录路径，非包名形态——同表格 npm 行/tarball 行为真包名，未动）。

### 批次 B（G1 兼容契约三处同步）——对应 explore B4

**顺序依赖**：必须早于 C。已实测：当前从 `plugins/dsh-plugin-multi-root-workspace` 执行 `require.resolve('@deepseek-ai/dsh-file-reference-local/package.json')` 报 `MODULE_NOT_FOUND`——在 B4 的 devDep + `pnpm install` 之前，D1/D2 的测试根本无法 `import` 真包。

1. B1 `OPTIONAL_CORE_PACKAGES` 末尾追加两包（保持 `export const [...]` 字面量，静态检查按文本读）。
2. B2–B4 `package.json` 三处一次改完（peers 逐字等于 allowlist 拼接串；meta optional；devDeps 同 pin）→ `pnpm install`。
3. 同步 B6–B9 的行数/行清单叙事（本批可留到 D，但 B 结束前至少改掉会与 `compat:check` 同屏矛盾的「六行」）。
4. 不需要动 `pnpm-workspace.yaml` 的 release-age 豁免（两包已在清单）。

**组 2 实测终形态（2026-10-19，全绿）**：`compat:check` 输出 `allowlist, peerDependencies, development pin and installed tree agree`（exit 0）；`dsh:check` 输出 `baseline, pins, soft ranges, allowlist, lockfile and installed tree agree`（45 包全 0.2.1-rc.2、豁免 308=308、无 declared-but-not-installed）。peers range 由 `SUPPORTED_DSH_RELEASES` 现读 `join(' || ')` 生成后 node 比对逐字一致。两处裁决：① en 版 compat note L32 引导句历史漂移（"these four" 实列六行）→ 改为无计数的 "the following rows"（对齐中文 canonical，防再次漂移）；② `AGENTS.md` 标题「Ten invariants」**未**提前改「Eleven」——标题计数与不变量 11 正文强绑定，归组 4 E5 一并改（避免标题 11 vs 正文 10 自相矛盾）；本任务只改不变量 7 行清单。lockfile 累积 diff（+7/-1）= 组 1 importer key + 组 2 devDeps 两包新增，归因见各批次。

**验证映射**

```bash
pnpm --filter dsh-plugin-multi-root-workspace compat:check
# 断言输出包含："allowlist, peerDependencies, development pin and installed tree agree"
pnpm dsh:check
# 断言输出包含：baseline / installed DSH packages / release-age allowlist 三段 note，exit 0
# 注意：B2–B4 改完但还没 pnpm install 时，dsh:check 规则 5 会报
#   "@deepseek-ai/dsh-file-reference(-local) is declared but not installed (run pnpm install)"——这不是配置错，是顺序未完成
node -e "const m=require('./plugins/multi-root-workspace/package.json');console.log(m.peerDependencies['@deepseek-ai/dsh-file-reference-local'])"
# 断言等于 SUPPORTED_DSH_RELEASES.join(' || ')
```

### 批次 C（G1 行实现）——对应 explore C5–C7

**顺序依赖**：C2（适配层）→ C1（行）→ C3/C4/C5（接线）→ D1/D2/D3/D4（测试）。先适配层是因为它可独立单测；先接线后测试是因为 `patch.spec` 与 `optional-peers.spec` 依赖真实导出/打包形状。

1. **C2** `src/compat/file-reference-search.ts`：
   - 模块注释写清「为什么动态导入」（optional peer + carrier barrel，先例 llm-message）与「为什么失败只 warn」（D8）；
   - `adaptFileReferenceLocal` 只做结构探针，不校验版本号（不变量 7）；
   - 缓存的两层 Map（root → Promise）与 `disposed` 标志按 ③3.2 的顺序实现。
2. **C1** `src/file-references.ts`：
   - `inject`、`ctx.inject(['fileReferences'], …)`、`scope.effect`、`wrapMethod` 全套；`original.call(this, …)` 保留调用上下文；
   - `planAdditionalCandidates` / `toDisplayPath` 为纯函数并导出（单测直接覆盖边界）；
   - 字节级透传路径：无根、裸模糊、相对 query 三种情况都在 `await original` **之前**返回（不额外 await，不改变时序）。
3. **C3–C5** 接线：`cordis.patch.yml` 加行（位置在 `multi-root-workspace-files` 与 `multi-root-command` 之间）→ `package.json` exports → `tsdown.config.ts` entry。三者任意缺一都会在 D4 或 `pnpm build` 立刻红。
4. 构建并确认动态导入被保留为 external：

```bash
pnpm --filter dsh-plugin-multi-root-workspace build
# 口径 R2（执行期实测修正）：源码为 `memoizedOutcome ??= import(...).then(...)` 记忆化形态，
# 无 `await` 前缀（语义等价且更优：缺席/装坏不重试），字面断言去掉 `await ` 前缀。
grep -n 'import("@deepseek-ai/dsh-file-reference-local")' \
  plugins/multi-root-workspace/lib/file-references.js   # 预期命中 1 行
grep -c 'WorkspaceFileSearch = class' plugins/multi-root-workspace/lib/file-references.js  # 预期 0（未被内联）
```

**测试（C7）**——具体断言：

> **组 3 实测终形态（2026-10-19，全绿）**：3.1 两新文件 typecheck 0（oxlint 亦 0）；3.2 三处接线 build 0，产物 `lib/file-references.js` L45 恰 1 处动态导入、零内联零静态化（口径 R2）；3.3 新 spec 18 用例（file-references 8 + file-reference-search 10）全绿——**绝对钻入走真上游 WorkspaceFileSearch 不 mock**（真实验证 `resolveDisplayDirectory` 逃逸检查）；3.4 后 patch.spec 10 + optional-peers 3 全绿，smoke-compose 真实 dsh CLI 链路 46/46（含 11 行全序插入断言）。两处实现口径记录：① 桩 provider 以 `new Stub(ctx)` 直接挂载而非 `ctx.get`——cordis traceable 代理会 shadow 方法属性，`Object.is` 级断言必须落原始实例（wrap/restore 经代理描述符转发行为等价）；② C7-3 的「含 pkg/a.txt 绝对形式」用深钻 `repoB/pkg/` 断言（真包目录查询只列 displayDirectory 直接子项），根钻 `repoB/` 断言目录候选，两条均带全前缀断言。一轮修复：3.3 首轮 oxlint 1 error（未用类型导入）+1 warning（不安全可选链），修复子代理一轮清零（非空断言替代可选链，未用 eslint-disable）。optional-peers 断言形态为 vi.mock 工厂置位 + 动态 import 后断言未触发（llm-message 模板同款，标志 `fileReferenceLocalLoaded`），非任务书设想的源码导出标志——加载期零依赖意图完整保留。

`tests/file-references.spec.ts`
1. `expect(stub.calls[0]).toEqual({ agent, query, signal })` + `expect(result).toBe(stub.result)`：无附加根时字节级透传（同一数组引用、同参调用）。
2. 空 query：`result.slice(0, base.length)` 全等于 base，随后每根一条 `{ kind:'directory', path: toDisplayPath(root) }`，顺序=scope 顺序，`path` 不以 `/` 结尾。
3. 绝对钻入：在 `repo-b` 下建 `pkg/a.txt`，`list(agent, repoB + '/', signal)` 返回的候选全部 `startsWith(repoB + '/')`，包含 `pkg/a.txt` 的绝对形式。
4. 前缀匹配：用 `repoB` 的**唯一**前缀（如 `repoB.slice(0, -1)`，不要用父目录 + 首字母，否则会同时前缀命中同级的 `repo-c`）：返回根 `repoB` 的目录候选（`kind:'directory'`，`path === toDisplayPath(repoB)`），且只返回它一条。
5. 裸模糊 `list(agent, 'pkg', signal)` 与相对 `list(agent, 'pkg/', signal)`：`result` 与 base 同一引用，且 `acquire` 未被调用（`vi.spyOn(AdditionalRootSearchCache.prototype, 'acquire')`）。
6. 撤销：stub 的 `list` 在 resolve 前执行 `scope.setAdditionalRoots(primary, [])`；空 query 与钻入都只返回 base。
7. 卸载：`await fiber.dispose()` 后 `Object.hasOwn(stub, 'list') === false` 且 `stub.list === StubFileReferences.prototype.list`。
8. `acquire` 被 spy 成 `undefined`：绝对钻入返回 base（降级不抛）。

`tests/file-reference-search.spec.ts`
1. `adaptFileReferenceLocal({})` / 缺常量 / `WorkspaceFileSearch` 非函数 → `undefined`；合法模块 → 返回 `{ createSearch }`。
2. `createSearch` 收到的 config 三字段等于注入模块的三个常量（`excludedDirectories` 是拷贝，不是同一数组）。
3. 同一 root 调两次 `acquire` → `createSearch` 只调一次；不同 root → 两次。
4. `retain(['a'])` → `b` 的实例 `dispose` 被调用、`a` 保留；`disposeAll` → 全部 dispose 且之后 `acquire` 返回 `undefined`。
5. `load` 抛非 `MODULE_NOT_FOUND` 错误 → `acquire` 返回 `undefined` 且 `warn` 恰好一次（第二次不再 warn）。
6. `createSearch` 抛错 → `undefined` + warn 一次。

`tests/optional-peers.spec.ts`（扩展现有文件）
7. `vi.mock('@deepseek-ai/dsh-file-reference-local', () => { fileReferenceLoaded = true; return {} })` 后 import `../src/index.ts` 与 `../src/file-references.ts`，断言 `fileReferenceLoaded === false`。

`tests/patch.spec.ts` + `scripts/smoke-compose.mjs`
8. 精确 id 列表与 gate 之后的清单（见 D4/D5）；两者同批改，避免两套期望漂移。

```bash
pnpm --filter dsh-plugin-multi-root-workspace exec vitest run \
  tests/file-references.spec.ts tests/file-reference-search.spec.ts \
  tests/optional-peers.spec.ts tests/patch.spec.ts
pnpm --filter dsh-plugin-multi-root-workspace typecheck
```

### 批次 D（文档 + 冒烟）——对应 explore D8–D9

**顺序依赖**：必须在 C 之后（文档描述的是已实现形状）；冒烟必须在 `pnpm build` 之后（smoke-compose 读 `lib/`）。

> **组 4 实测终形态（2026-10-19，文档半部全绿；D9 冒烟归组 5）**：三文档任务（4.1 ADR / 4.2 架构 / 4.3 README+AGENTS）并行（写范围不相交）后统一 docs:check 10 项 PASS 0 errors。ADR-0012 七章节 113 行（Alternatives 12 行被否方案表；初稿围栏缩进被 check-docs 剥离正则拒绝，顶格后过）。architecture §6.2 六行行为矩阵（「绝对 query」按 spec 拆钻入/根前缀/无关三行，全覆盖 9 需求场景）+ §1 图行 + §3 注释补链。双语 README 六处对称（含组 2 残留的「插入 10 行→11 行」同步）；AGENTS「Eleven invariants」+ 不变量 11 正文。**主会话收尾补链**：并行期按稳妥约定写成反引号纯文本的 ADR-0012/architecture 引用（architecture:216、双语 README 各 :166/:213），目标文件确认落盘后由主会话升级为 markdown 相对链接，docs:check 复验过。README smoke 计数为推算预期值（compose 42 / journey 60）带「待组 5 冒烟实跑回填」占位标记。

1. **D8 文档**：E1 ADR-0012 → E2 索引 → E3 架构 §6.2/§1/§3 → E4 双语 README → E5 AGENTS 不变量 → E6 计数一致性。ADR 里的绝对路径示例放代码围栏（`docs:check` CHECK 6）。
2. **D9 冒烟**：在 `scripts/smoke-journey.mjs` 的 web leg 里加两段，**顺序要紧**：非破坏性的候选断言放在 `observed.granted = ctx.multiRootScope.scopeOf(primaryRepo)`（L397）之后；撤销断言必须放在既有面板 HTTP 断言（`observed.channelView` 赋值）**之后**，否则现有断言「channel view lists the registered additional root」（judge 脚本 L~520）会因为根已被移除而失败。

> **组 5 实测终形态（2026-10-19/20，全绿）**：5.1 journey +42 行两段断言（候选段 @ granted 后、撤销段 @ channelView 后，顺序红线遵守）+ check 段 5 条（fileRootCandidate / fileDrilledAbsolute / fileFuzzyExcludes / fileRevoked / fileCandidateGone，消息用本设计 D9 五条文案原样；`removed?.result?.kind` 形态按脚本实际返回对齐，非模板的 `removed?.kind`）。实测 **compose 46/46、journey 60/60**（5 新 + 55 既有无一变红）——组 4 README 预填 compose 推算值 42 与实测不符，5.2 已回填 46。5.2 回填 + 迁移说明（根 README 升级句 + 插件 README「从 v1.2.x 升级」段含完整新 path 命令，旧 tag 旧 path 可装旧版本）。5.3 仓根 `pnpm verify` exit 0（26s；四插件 405+61+96+136 tests；干净窗口两步过；verify:all 实际构成为 lint→typecheck→build→kernel:probe→test→smoke，**不含 docs:check**——后者为独立脚本已单独绿，任务原文表述与脚本构成的出入在此更正）。人工核对（真实 profile 验收）经用户拍板以**脚本级等效验收**替代（journey 全链路断言与人工清单一一对应），决策记录见 `verification.md`。环境留痕 R3（node v22.18.0 engine warning，非本变更引入）。
   第一段（L397 之后，同一个 `agent` 与 `additionalRepo`；比较用 `canonical(additionalRepo)`，scope 返回的是 canonical 路径）：
   ```js
   const refsSignal = new AbortController().signal
   const extra = canonical(additionalRepo)
   const top = await ctx.fileReferences.list(agent, '', refsSignal)
   observed.fileRootCandidate = top.some(c => c.kind === 'directory' && c.path === extra)
   const drilled = await ctx.fileReferences.list(agent, `${extra}/`, refsSignal)
   observed.fileDrilledAbsolute = drilled.length > 0 && drilled.every(c => c.path.startsWith(`${extra}/`))
   const fuzzy = await ctx.fileReferences.list(agent, 'README', refsSignal)
   observed.fileFuzzyStaysPrimary = fuzzy.length > 0 && fuzzy.every(c => !c.path.includes(extra))
   ```
   第二段（`observed.channelView = ...` 之后、`finally { await handle.dispose() }` 之前）：
   ```js
   const removed = await ctx.commands.execute(agent, '/workspace-folders remove 1', [], refsSignal)
   observed.fileRemovalSucceeded = removed?.kind === 'success'
   observed.fileRootGoneAfterRemove = !(await ctx.fileReferences.list(agent, '', refsSignal))
     .some(c => c.path === extra)
   ```
   并在 `check` 段加五条断言（沿用 `check.ok` / `check.equal` 风格）：`web: the empty @ query offers the additional root as a directory candidate`、`web: drilling into the additional root returns absolute candidates`、`web: a bare fuzzy @ query still returns only primary-root candidates`、`web: the workspace-folders remove succeeded`、`web: removing the root removes it from @ completion`。remove 的成功断言不能省：否则 remove 静默失败时最后一条会变成假绿。这一段验证的是 composer 直接消费的 host seam；**浏览器里的弹窗渲染不另写自动化**（上游组件行为，无插件代码），人工核对步骤写进变更的验证记录：`docker exec dsh dsh --profile web` → 新会话（cwd=主根）→ `/workspace-folders add <附加根>` → 输入 `@` 看到根候选、点选钻入、移除后候选消失。
3. 更新 `README.md:128` / `README.en.md:128` 的 smoke 计数（journey 新增断言会改变期望值，按实跑结果写）。

**验证映射**

```bash
pnpm --filter dsh-plugin-multi-root-workspace docs:check   # 预期 0 errors, 0 warnings
pnpm --filter dsh-plugin-multi-root-workspace build
pnpm --filter dsh-plugin-multi-root-workspace smoke:compose   # 预期全绿（含新行 id）
pnpm --filter dsh-plugin-multi-root-workspace smoke:journey   # 预期全绿（含 5 条 @ 断言）
```

最后（发布动作，不在本次代码提交内，Q4 已定）：

```bash
pnpm dsh:check && pnpm verify && pnpm release 1.3.0
```

## ⑥ 设计假设与未决项

### 假设（实现与评审时按此判断，不成立就要改设计）

- **A1 组合可达性**：`ctx.fileReferences` 只在 web-app 组合存在（`dsh-web-app/cordis.patch.yml:97`），因此本行在 headless/ACP 组合是 no-op；这与「新行 inject `multiRootCompat`」不冲突（compat/scope 在 headless 也存在）。
- **A2 web 端零改动**：客户端把 host 返回的候选原样渲染（`client.js:415-438`），不对 `path` 做 cwd 过滤或二次校验；因此绝对路径候选能直接展示与插入。
- **A3 主根一致性**：`session.header.cwd` canonical == `sandboxPolicy.resolve()` 的 `workspaceRoot` == 注册表键（`dsh-sandbox-policy/lib/index.js:145`、`src/command.ts:363-371`）。
- **A4 根集合互斥**：注册表拒绝根之间互相包含（`nested`），最长前缀匹配只是防御性写法；`commonRoots` 走同一 sanitizer 但理论上可嵌套，故仍保留去重。
- **A5 跨版本 API**：`WorkspaceFileSearch` + 三个默认常量在 0.2.1-rc.2 已核实；其余 9 个 allowlist 版本未逐一实测（R2）。结构探针 + 降级保证「形状不同不崩」，但也意味着老版本可能拿不到附加根候选。
- **A6 Windows 形式**：候选 `path` 用 `/` 分隔是照上游 `listDirectory` 的回显语义（它直接拼接 `displayDirectory`），但 Windows 真机未在本环境验证；`pathStartsWith` 在 win32 做大小写不敏感比较（对齐 `containment.ts` 的 `caseSensitive` 约定）。
- **A7 排除目录限制（已知）**：`listDirectory` 会拒绝任何段名等于排除目录的 `displayDirectory`（`lib/index.js:183`）。因此附加根的绝对路径若含 `build`/`out`/`target`/`node_modules` 等段，钻入返回空；根候选本身仍会出现。不绕过（绕过就要自写列目录，D2 已否）。
- **A8 `cd` 后的语义**：上游主根候选跟随有效工作目录，本行根候选跟随不可变 session cwd（D5 的代价）；不额外补偿。
- **A9 不展开 `~`**：`@~/x` 按上游语义处理（当作相对片段），本行不引入 home 展开（上游 `@` 自己也不展开）。
- **A10 无配置面**：本行不新增 `Config`；检索参数=上游默认常量（D7）。
- **A11 每次按键的成本**：`scopeOf` 是同步 `realpath` + `statSync`（`src/scope.ts:213-218`、`:97-118`），每次 `list` 调 1–2 次；N 个附加根下是可接受的常数开销（与 fs/lsp/workspace-files 每次操作的同类解析同量级），不做额外缓存（缓存会引入失效问题）。
- **A12 未决项**：见下节 Q1–Q3；⑥ 不再重复。

### 未决项（上浮待决，不重开已收敛结论）

见「待决问题」Q1–Q3；其中 Q1 是上游 UX 限制、Q2 是配置一致性、Q3 是改名迁移说明的厚度，三者都不阻塞 A/B/C 批次。

## 待决问题

### Q1 绝对路径钻入后的面包屑（上游 UX 限制）

- **问题**：用户选中附加根（`@/home/x/develop/docker/`）钻入后，输入框上方由 `crumbsFor` 生成的面包屑用**相对段**拼成（`client.js:383-414`）：根面包屑是 `@`（正确回到顶层），但中间段会变成 `@home`、`@home/x` 这类相对 query，点击后查不到东西（相对路径只在主根下解析）。
- **选项**：a) 接受并写入 ADR-0012 / README「已知限制」；b) 在 web 半部自绘面包屑或 patch 上游（属于替换上游 UI 组件，超出本变更面且与 ADR-0005/0006 的边界冲突）；c) 不提供中间层面包屑（无法只从 host 侧控制）。
- **推荐**：**a**。钻入、选择、输入框里的绝对 mention 都正常；只有「点中间面包屑回跳」这一处退化，且根面包屑 `@` 与继续输入都不受影响。
- **影响面**：仅 UX；不改代码路径；写进 ADR 的 Consequences 与 README 已知限制即可。若未来上游修复 `crumbsFor` 的绝对路径处理，本限制自动消失（我们的候选形式无需改）。

### Q2 附加根检索参数与 provider 配置的一致性

- **问题**：`LocalFileReferenceService` 的 `maxResults/maxEntries/excludedDirectories` 是私有配置，本行读不到；若部署覆盖了它们，附加根仍用上游默认值（20 / 50000 / 默认排除表），两者行为不完全一致。
- **选项**：a) 保持不开放（本设计）；b) 新行加 `Config` 三键，由部署自行填成与 provider 相同；c) 反射读 provider 私有字段（不可行，TS-private + ADR-0002）。
- **推荐**：**a**。默认配置就是绝大多数部署的配置；b 会制造「两处配置要同步」的长期负担，且没有机制保证一致（用户改一处忘另一处更糟）。
- **影响面**：只在部署覆盖了 provider 检索参数时出现候选数量/排除目录的差异；写进 ADR 的 Consequences。若未来上游把这些参数暴露为可读服务，再改为自动对齐。

### Q3 改名后的 profile 侧迁移说明写到哪一层

- **问题**：已按 `&path:plugins/dsh-plugin-multi-root-workspace` 安装的 profile，无法用新 tag 的新路径自动切换（pnpm 的 git 依赖锚点是旧的 `path:`）。
- **选项**：a) 只在根 README 的安装命令与插件 README 的「升级/迁移」段写清「按新 path 重新 `add`」（本设计）；b) 另写一篇 `docs/troubleshooting/renamed-plugin-directory.md`（更醒目，但多一份易过期的文档）；c) 不写（危险）。
- **推荐**：**a**，并在插件 README 的安装表格里保留一行「旧路径 tag 仍可安装旧版本」的说明；b 的排障文档如果用户实际踩到再补。
- **影响面**：仅用户操作说明；不影响代码。若选 b，需要中英双语对（`docs:check` 的 README 配对规则只约束 README，troubleshooting 默认中文，但仓库惯例是全量中文）。
