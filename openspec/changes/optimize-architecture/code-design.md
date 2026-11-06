# 代码级蓝图：dsh-plugins 架构重构（阶段 1.7 · 设计线）

> **本文件只回答「改哪些文件、怎么改、接口长什么样、为什么这么定」**。需求价值、范围边界、风险清单已在 line-a / line-b / diff-matrix 结案，本文不复读；diff-matrix §6「收敛结论」的 9 项决策是硬前提，本文的职责是把它们翻译成可施工的代码事实。
> 事实全部现场核对（读源码 + 只读命令 + 5 组最小机制探针，探针脚本在 `/tmp/{tsprobe,oxprobe,rprobe,catprobe,*}`、命令与结论见 ②/⑥ 与各决策的「证据」行）。
> 路径一律相对仓库根 `/home/xuqinqin/develop/person/dsh-plugins`；跨仓条目注明所属仓。

阅读顺序建议：先看 §0 的一页纸结论 → ③ 接口形状 → ⑤ 逐任务组。①/② 是施工时的索引。

---

## 0. 一页纸结论（本设计新增的结构性判断）

1. **`tooling/` 下三个包，职责互不重叠**：`build-kit`（构建期·纯 `.mjs`·只依赖 esbuild）、`host-kit`（运行期源码·纯 TS·**零依赖**·被 esbuild 内联进各包产物）、`test-kit`（测试夹具底座·纯 TS）。`tooling/template/` 是模板素材，**不是 package**（清单文件叫 `package.json.tmpl`），因而不进 workspace。
2. **共享源码用「包 exports → `src/*.ts`」+ 根 tsconfig `paths` 双轨解析**：esbuild 走 node_modules 软链直接读 TS 源（探针 G：exit 0），`tsc` 走 `paths` 映射读同一份源（探针 F：exit 0）。**前提是 6 个软插件的 tsconfig 去 `composite`**——composite + 跨包源文件会硬失败 TS6307（探针 C/I 实测），这是本次唯一一处「必须先改类型检查命令形态才能共享源码」的硬约束。
3. **`tooling/build-kit` 的策略全部从包事实推导**，薄入口只剩两个不可推导的旋钮（`hostExternals` / `cjsRequireShim`）与一个保产物字节的旋钮（`cssClassPrefix`）；「要不要清 `lib/types`」由 `exports[*].types` 是否存在推导，正好把 workspace-config 的特例变成推导规则而不是开关。
4. **pnpm catalog 拆两层**：命名 catalog `dsh`（DSH 全家 + cordis + schemastery，由 `upgrade-dsh.mjs` 单点重写）+ 默认 catalog（工具链，人工升）。**multi-root 一个都不迁**（C2 硬前提），因此 catalog 与 multi-root 的字面量版本共存，`dsh:check` 必须先把 `catalog:` 归一化再比对。
5. **`#3`（`roots[0] ≠ primaryRoot`）裁定为「值语义 + 一次诊断」**：主根身份只由 `primaryRoot` 字段决定，`roots[0]` 不参与判定；`roots` 中所有 `≠ primaryRoot` 的项按原顺序进附加根层，一个根都不丢。这条规则在契约成立时与两包今天的实现**逐字等价**，只在两包 spec 都未覆盖的异常场景改变 project-mcp 的行为（写 spec delta）。
6. **归属并发 bug 的修法不是加锁，而是把「建表」和「替换」分开**：`host-kit` 的 `buildRootIndex()` 返回**不可变索引**，`RootAttributor.update()` 只做一次引用赋值——user-commands 的「clear → 逐个 claim」形态在结构上不再可能被写出来。

---

## ① 触达面清单

> 列「逐文件」。同一改动在 6 个软插件上完全同构时，分别列出 6 个路径（不合并成 `glob`），关键改动点列一次并标注「×6 同构」。

### 1.1 根仓 `dsh-plugins`（所属仓：根仓）

| # | 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- |
| R1 | `pnpm-workspace.yaml` | 结构：接纳 tooling 包 + 新建 catalog | `packages`（`:5-7`）→ `plugins/*` + **显式三行** `tooling/build-kit` / `tooling/host-kit` / `tooling/test-kit`（显式而非 `tooling/*`：`tooling/template` 无 package.json，显式列表使「谁是包」可断言）；`allowBuilds`（`:10-19`）与 `minimumReleaseAgeExclude`（`:25` 起）**一字不改**；新增顶层 `catalog:`（工具链）与 `catalogs: { dsh: … }`（DSH 家族 + cordis + schemastery） |
| R2 | `package.json`（根） | 命令面：新增脚手架入口、dsh:check 改聚合、版本同步范围说明 | `:22` `dsh:check` → `node scripts/dsh-check.mjs`；新增 `"gen:plugin": "node scripts/gen-plugin.mjs"`；其余递归脚本（`:15-23`）不动 |
| R3 | `tsconfig.plugin.base.json` | **新建**：6 个软插件的唯一编译基准 | 内容 = 现 4 份同 md5 的 `tsconfig.base.json`（`25ac2ce4…`：ES2023 + DOM/DOM.Iterable + `jsx: react-jsx` + `verbatimModuleSyntax` + `noEmit` + `strict`）；**新增** `paths`：`@dsh-plugins/host-kit`→`./tooling/host-kit/src/index.ts`、`@dsh-plugins/host-kit/*`→`./tooling/host-kit/src/*.ts`、`@dsh-plugins/test-kit/*`→`./tooling/test-kit/src/*.ts`；**不含 `composite`** |
| R4 | `.oxlintrc.json` | **新建**：全仓唯一 lint 基准 | `plugins: []`、`env.builtin: true`、`ignorePatterns: ["**/lib/**","**/node_modules/**","**/*.config.ts"]`（**必须写成路径无关 pattern**，见 ② 探针）；去掉指向 `./node_modules/...` 的 `$schema`（根无 devDeps，写了是死链） |
| R5 | `.github/workflows/ci.yml` | **新建**：最小 CI | `on: [push, pull_request]`；job `verify`：`actions/checkout@v4` → `pnpm/action-setup@v4`（version 取 `packageManager` 的 11.25.0）→ `actions/setup-node@v4`（24.21.0 + pnpm cache）→ `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm build` → `pnpm test` → `pnpm docs:check` → `pnpm dsh:check`；**不跑 `pnpm verify`**（其递归 `verify:all` 含 multi-root 的 smoke，需要运行中的 dsh） |
| R6 | `scripts/dsh-check.mjs` | **新建**：dsh:check 的聚合入口 | 顺序 spawn 三个检查脚本（`check-dsh-baseline` → `check-architecture` → `check-artifacts`），任一非 0 即整体非 0；每个脚本自己「收集全部失败再退出」的输出纪律不变 |
| R7 | `scripts/check-architecture.mjs` | **新建**：结构不变式门禁（G7 核心） | 7 组断言 AR1–AR7，见 ③.4 |
| R8 | `scripts/check-artifacts.mjs` | **新建**：产物契约门禁 + 迁移等价性工具 | 三模式：默认门禁 / `--write-baseline DIR` / `--baseline DIR`（比对模块词集合）；断言 B1–B6 见 ③.4 |
| R9 | `scripts/lib/artifacts.mjs` | **新建**：产物词法器单一实现 | `readArtifact(root, name)`、`requiredWords(source)`、`importedWords(source)`、`moduleWords(source)`、`sha256(text)`；**同时被 `check-artifacts.mjs`（node）与三个 `test/bundle.test.ts`（vitest）导入**——沿用 `workspace-config/test/bundle.test.ts:33` 跨包 import 根脚本的既有先例，避免第四份正则副本 |
| R10 | `scripts/check-dsh-baseline.mjs` | 改：catalog 感知 | 新增 `readCatalog(source)`（解析 `catalog:` 与 `catalogs.dsh:` 两块）与 `normalizeDep(value, catalog)`（`catalog:` / `catalog:dsh` → 实际值）；`:165-178` 的 pin 断言改为「归一化后等于 `DSH_BASELINE`」，`:175-178` 的 cordis 一致性断言同理；新增断言「`catalogs.dsh` 中 `@deepseek-ai/dsh*` = 基线、`cordis`/`schemastery` = 基线派生值」；原有 6 项（安装树、豁免清单、lockfile、已删插件）不动 |
| R11 | `scripts/upgrade-dsh.mjs` | 改：catalog 同批适配 | 新增 `repointCatalog(target, cordisVersion, schemasteryVersion)`（重写 `catalogs.dsh` 块）；`repointPlugin`（`:172-205`）遇到 `catalog:` / `catalog:dsh` 的值**跳过不写**（今天会把它写成字面量：`version === target` 为假 → `devs[name] = target`）；重写结束后新增后置断言：6 个软插件的 devDeps 里**不得残留** DSH/cordis/schemastery 的字面量版本 |
| R12 | `scripts/release.mjs` | 改：发布前置走聚合入口 | `:99-107` 由 `execFileSync(node, [check-dsh-baseline.mjs])` 改为 `execFileSync(node, [dsh-check.mjs])`（否则扩出来的两组门禁在发布路径上被绕过）；`:110-118` 的目标清单**保持只遍历 `plugins/*`**（tooling 包 0.0.0 不在版本契约内，改注释写明）；`:159-163` 的 `pnpm build` + `git add plugins/*/lib` 不动 |
| R13 | `scripts/gen-plugin.mjs` | **新建**：脚手架生成器（G8） | CLI 契约见 ③.3；只写文件不跑 git/pnpm；生成后打印 5 步后续命令 |
| R14 | `README.md` | 改：目录结构 / 常用命令 / 新增插件方式 | `:5-16` 目录结构加 `tooling/{build-kit,host-kit,test-kit,template}/`、`tsconfig.plugin.base.json`、`.github/workflows/ci.yml`，并把 `scripts/check-dsh-baseline.mjs` 一行扩成三个检查脚本；`:18-31` 常用命令加 `pnpm gen:plugin`、`pnpm dsh:check`（聚合后语义）；安装矩阵与「插件一览」不动 |
| R15 | `AGENTS.md` | 改：仓库约定层 | 「目录结构」加 tooling 三包与 template；「插件结构约定」把「构建：…其余六个用 `build.mjs`（esbuild）」改为「六个软插件用 `@dsh-plugins/build-kit` 的薄入口」+ 一句「新增插件用 `pnpm gen:plugin`」；「开发与验证命令」加 `gen:plugin`；补一段「仓级 ADR 在 `docs/decisions/`」 |
| R16 | `docs/decisions/README.md` | **新建**：仓级 ADR 索引 | 说明仓级 ADR 与 `plugins/multi-root-workspace/docs/decisions/` 是**两套独立编号**，引用必须带路径（避免「ADR-0009」歧义） |
| R17 | `docs/decisions/ADR-0001-shared-build-and-source-kits.md` | **新建**：ADR，推翻旧结论 | 论证「构建期内联模式下共享源码不破坏单装」（安装铁律 + 探针结论）、三包边界、被否方案（根级 `scripts/build-kit`、`plugins/_shared`、JSON 体积内联、不发共享包） |
| R18 | `docs/decisions/ADR-0002-attribution-kernel.md` | **新建**：ADR，#3 裁定 + 并发纪律 | 值语义裁定及被否方案、索引原子替换纪律、stt 未命中策略保留的依据、两包 spec delta 指针 |
| R19 | `openspec/specs/dsh-project-mcp/spec.md` | **改（由 openspec 变更落地，本设计只给文本）** | 「工作区可见性隔离」增两段：根集合契约异常行为（#3 裁定）+ 索引原子重建；新增 2 条 Scenario，文本见 §⑤ G6 |
| R20 | `openspec/specs/dsh-user-commands/spec.md` | **改（同上）** | 「三层优先级与会话遮蔽」增同样两段 + 2 条 Scenario（其中「重扫期间归属判定不回退为 fail-closed」是本次新增行为）；spec delta 文本见 §⑤ G6 |

> `plugins/*/lib/` 与 `pnpm-lock.yaml` 会随施工变化，不属于「设计触达面」，不单列。

### 1.2 `tooling/build-kit/`（新建包，所属仓：根仓）

| # | 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- |
| K1 | `tooling/build-kit/package.json` | **新建** | `@dsh-plugins/build-kit`、`private: true`、`version: "0.0.0"`、`type: module`、`exports` 指向 `./src/index.mjs`；`dependencies: { esbuild: "catalog:" }`；`scripts: { lint: "oxlint", test: "vitest run" }`（**只有这两条**，决策 #1）；无 `files`（不发布） |
| K2 | `tooling/build-kit/src/index.mjs` | **新建**：编排器 | `buildPlugin(options)`：读 `<root>/package.json` → 推导 `packageName`/`kind`/`dtsOwned` → 清理 → host 半 → client 半（dual）→ 产物守卫 → 返回 `{ packageName, kind, artifacts }` |
| K3 | `tooling/build-kit/src/host.mjs` | **新建**：宿主半骨架 | 固定 `format:'esm'`、`platform:'node'`、`target:'node22'`、`sourcemap:false`、`external:['node:*', ...hostExternals]`；`cjsRequireShim` 为真时注入 banner（文案逐字沿用现 `plugins/project-mcp/build.mjs:48-50`，保证产物字节可比） |
| K4 | `tooling/build-kit/src/client.mjs` | **新建**：浏览器半骨架 | 固定 `format:'cjs'`、`platform:'browser'`、`target:'es2022'`、`jsx:'automatic'`、`write:false`、默认 `clientExternals`（react / react-dom / react-dom/client / react/jsx-runtime / react/jsx-dev-runtime / ui-primitives）+ `window.__ModuleLoader__.load({ id, factory })` 壳（缩进/换行逐字沿用现 `plugins/web-ux/build.mjs:136-147`） |
| K5 | `tooling/build-kit/src/css.mjs` | **新建**：CSS modules 编译 | 导出 **纯函数** `cssModuleContents({ source, relativePath, packageName, classPrefix })` → `{ contents, classMap }`；护栏**固定按「包 + 模块」双维度**（`data-dsh-plugin` + `data-dsh-css`）；类名前缀由调用方传入 |
| K6 | `tooling/build-kit/src/guards.mjs` | **新建**：产物守卫 | `assertNoDynamicRequire(code, shimEnabled)`（`__require(` 出现但未开 shim → 抛 F3 解释）、`assertNoInternalWord(code)`（产物不得含 `@dsh-plugins/`）、`assertSelfContained(words, externals)` |
| K7 | `tooling/build-kit/test/css.test.mjs` | **新建** | 同包两个 module → 两个不同 `data-dsh-css`、同名类在两个 module 各自独立作用域、`url()` 与 at-rule 前奏不被改写 |
| K8 | `tooling/build-kit/test/shell.test.mjs` | **新建** | 壳形状（`window.__ModuleLoader__.load({`、`id: "…"`、`factory: (require) => {`）、缩进层级、`dtsOwned` 推导（有/无 `exports[*].types`） |
| K9 | `tooling/build-kit/test/guards.test.mjs` | **新建** | shim 开/关 × `__require` 出现/缺席四格；`@dsh-plugins/` 词失败用例 |
| K10 | `tooling/build-kit/README.md` | **新建** | 旋钮语义表 + 「什么不该进 kit」（多入口/多 format/tsdown 路线属 multi-root，不并入） |

### 1.3 `tooling/host-kit/`（新建包，所属仓：根仓）

| # | 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- |
| H1 | `tooling/host-kit/package.json` | **新建** | `@dsh-plugins/host-kit`、`private:true`、`0.0.0`、`type:module`；`exports`: `"."` → `./src/index.ts`，`"./*"` → `./src/*.ts`（**types 与 default 都指向 TS 源**，由消费方双轨解析）；`dependencies: {}`（零运行时依赖）；`devDependencies`: `@types/node` / `typescript` / `oxlint` / `vitest`（catalog）；`scripts`: `lint` / `typecheck: "tsc -p tsconfig.json --pretty false"` / `test` |
| H2 | `tooling/host-kit/tsconfig.json` | **新建** | `extends: "../tsconfig.plugin.base.json"` + `include: ["src/**/*.ts","test/**/*.ts"]`；**无 composite** |
| H3 | `tooling/host-kit/src/attribution.ts` | **新建**：归属内核 | `RealpathPort` / `WorkspaceRoots` / `Attribution` / `RootIndex` / `buildRootIndex` / `lookupIn` / `walkUp` / `RootAttributor`；现 `plugins/project-mcp/src/host/attribution.ts:1-51` 的 9 条规则 docblock 整体迁入并改写「roots[0] 约定」一条为 #3 裁定 |
| H4 | `tooling/host-kit/src/watcher.ts` | **新建**：监听 | `WatchIo` / `DEFAULT_DEBOUNCE_MS` / `deepestExisting` / `ladderTargets` / `DirectoryWatcher`（类体逐字迁自 `plugins/project-mcp/src/host/watcher.ts:76-153`） |
| H5 | `tooling/host-kit/src/triggers.ts` | **新建**：触发器 | `TriggerContext` / `MultiRootGrant` / `installTriggers`（迁自 `plugins/project-mcp/src/host/triggers.ts:48-67`） |
| H6 | `tooling/host-kit/src/roots.ts` | **新建**：根枚举 | `RootRegistryPort` / `RootEnumeratorContext`（结构端口，**不 import 任何 `@deepseek-ai/*`**）/ `workspaceRoots` |
| H7 | `tooling/host-kit/src/log.ts` | **新建**：日志适配 | `LogSink` / `createLog(ctx, prefix)`（双通道纪律注释迁自 `plugins/user-commands/src/host/host-io.ts:80-89`） |
| H8 | `tooling/host-kit/src/host-io.ts` | **新建**：真实 seam | `nodeRealpathIo` / `nodeWatchIo`（两份逐字相同，迁自 `plugins/project-mcp/src/host/host-io.ts:26-48`） |
| H9 | `tooling/host-kit/src/index.ts` | **新建**：桶 | 全量 re-export（消费方多数用子路径，桶供 `paths` 的精确匹配项） |
| H10 | `tooling/host-kit/test/attribution.test.ts` | **新建**：**规范级**用例 | 两包现有用例的并集 + #3 异常场景 + 并发原子性场景；表驱动（`cases: [{ name, workspaces, cwd, expected }]`） |
| H11 | `tooling/host-kit/test/{watcher,triggers,roots,log}.test.ts` | **新建** | 阶梯/防抖/去重；触发器软降级；`workspaceRoots` 的软依赖降级与去重；日志双通道（用假 ctx 收集两条通道） |
| H12 | `tooling/host-kit/README.md` | **新建** | 「内核不决定未命中结果，只报告上溯事实」的设计说明 + 两包适配器指针 |

### 1.4 `tooling/test-kit/`（新建包，所属仓：根仓）

| # | 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- |
| T1 | `tooling/test-kit/package.json` | **新建** | `private:true`、`0.0.0`；`exports`: `"./ui-primitives"` → `./src/ui-primitives.tsx`、`"./locale-parity"` → `./src/locale-parity.ts`；`dependencies: { react, react-dom }`（stub 运行时要用，catalog）；`scripts`: `lint` / `typecheck` |
| T2 | `tooling/test-kit/tsconfig.json` | **新建** | extends 根基准，`include:["src/**/*.ts","src/**/*.tsx"]` |
| T3 | `tooling/test-kit/src/ui-primitives.tsx` | **新建**：stub 公共底座 | 三份现有 stub 的**并集实现**（Button / Input / Switch / Modal / Checkbox / SegmentedTabs / Menu / MenuItemButton / ~15 个图标）；Modal 取 wsc 版（`className`/`contentClassName`）+ web-ux 版的 `data-modal-body`/`data-modal-footer` 标记 |
| T4 | `tooling/test-kit/src/locale-parity.ts` | **新建**：文案一致性纯函数 | `localeParityIssues({ ns, zh, en, required, expectedNs }) => string[]`（**不 import vitest**，断言留在各包测试里，守住「字面量直写」纪律） |
| T5 | `tooling/test-kit/README.md` | **新建** | 「只放无分支的夹具底座；任何包的行为断言不许上移」 |

### 1.5 `tooling/template/`（新建目录，**非** workspace 包，所属仓：根仓）

| # | 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- |
| P1 | `tooling/template/package.json.tmpl` | **新建** | 名字故意不叫 `package.json` → 目录永不被 pnpm 当包；只含可变占位之外的结构（`dsh`/`files`/`peerDependencies` 形态、`devDependencies` 全用 `catalog:`/`workspace:*`） |
| P2 | `tooling/template/{cordis.patch.yml,build.mjs,tsconfig.host.json,tsconfig.client.json,tsconfig.json,vitest.config.ts,src/index.ts,src/client/index.ts,test/smoke.test.ts,README.md}` | **新建** | 5 行薄 `build.mjs`、`include`-only 的 tsconfig、最小 `cordis.patch.yml`（裸包名行 + 头注释模板） |
| P3 | `tooling/template/README.md` | **新建** | 「模板不是包」的说明 + 与 `gen:plugin` 的关系 |

### 1.6 六个软插件（所属仓：根仓，逐包列）

#### `plugins/project-mcp/`（host-only）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 全文替换为 5 行：`buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })`；保留 4 行头注释只讲「为什么 `dsh-mcp-client` 刻意不进产物」这一条本包特有知识（`:10-15`） |
| `package.json` | 依赖与脚本 | devDeps 删 `esbuild`，加 `@dsh-plugins/build-kit: workspace:*`、`@dsh-plugins/host-kit: workspace:*`、`@dsh-plugins/test-kit: workspace:*`；DSH 系与工具链版本改 `catalog:`/`catalog:dsh`；`typecheck`（`:56`）改 `tsc -p tsconfig.host.json --pretty false`；其余 5 条脚本保持模板值 |
| `tsconfig.base.json` | **删除** | 统一到根基准（本包属 4 份同 md5 组，内容与根基准确认一致） |
| `tsconfig.host.json` | 改 | `extends: "../../tsconfig.plugin.base.json"`；删 `compilerOptions.composite`；`include` 去掉 `vitest.config.ts`（该文件删除） |
| `tsconfig.json` | 不动 | 保留 solution 形态（IDE 用）；`tsc -b` 不再被任何脚本调用 |
| `vitest.config.ts` | **删除** | 默认 `environment:'node'` + vitest 默认 include 已覆盖 `test/**/*.test.ts`；删除前记录用例数作为等价断言 |
| `src/host/attribution.ts` | 薄化为再导出 | `export { RootAttributor as Attributor, ... } from '@dsh-plugins/host-kit/attribution'`；保留 3 行指针注释（本包 fail-closed 策略 = 直接取 `hit`） |
| `src/host/roots.ts` | 薄化 | `workspaceRoots` 改 re-export；保留 `import type {} from '@deepseek-ai/dsh-workspace'` 模块增强解析（若 `tsc` 报未使用再删，见 ⑥ A8） |
| `src/host/triggers.ts` | 薄化 | re-export `installTriggers` / `TriggerContext` |
| `src/host/watcher.ts` | 薄化但保留本包阶梯 | `DirectoryWatcher`/`WatchIo`/`DEFAULT_DEBOUNCE_MS` re-export；`watchTargets(io, roots)` 保留签名，内部 `ladderTargets(io, roots.map(r => [join(r,MCP_DIR), join(r,'.dsh'), r]), { fallbackToLast: true })`（**`fallbackToLast` 是 pm 与 uc 的唯一语义差**） |
| `src/host/host-io.ts` | 减半 | `nodeRealpathIo`/`nodeWatchIo` re-export；`nodeScanIo` 留本地（`readDir→string[]` 是本包专属端口）；`scanLog` → `createLog(ctx, 'dsh-plugin-project-mcp')` |
| `src/host/types.ts` | 类型收敛 | `WorkspaceRoots`/`MultiRootGrant`/`ScanLog` 改为从 host-kit 导入再导出（`ScanIo` 留本地） |
| `src/host/index.ts` | 接线 | `new Attributor(nodeRealpathIo)` → `new RootAttributor(nodeRealpathIo, { onAnomaly: log.warn })`；其余 import 路径改到 `@dsh-plugins/host-kit/*` |
| `test/attribution.test.ts` | 不动（oracle） | 导入路径不变（薄再导出），用例一条不改 = 行为等价性的直接证据 |
| `test/bundle.test.ts` | **新建** | 宿主产物自包含：`moduleWords(lib/index.js)` 全部以 `node:` 开头、不含 `@dsh-plugins/`、`__require` 存在时 banner 必在（用 `scripts/lib/artifacts.mjs`） |
| `test/attribution-anomaly.test.ts` | **新建** | #3 异常场景（`roots[0]≠primaryRoot`）+ 并发窗口（update 与 attribute 交错）用例 |

#### `plugins/user-commands/`（host-only）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 5 行：`buildPlugin({ root: import.meta.dirname, hostExternals: ['@deepseek-ai/dsh-llm'], cjsRequireShim: true })`；头注释只保留「dsh-llm 刻意外置以共用宿主的消息身份」一条（`:9-12`） |
| `package.json` | 依赖与脚本 | 同 pm 形态（删 `esbuild`、加三个 workspace 包、catalog、`typecheck` 改 `-p`） |
| `tsconfig.base.json` | **删除** | 旧版（`ac623999…`，无 DOM/jsx）→ 对齐根基准（裁定 3） |
| `tsconfig.host.json` | 改 | 同 pm 形态 |
| `vitest.config.ts` | **删除** | 同 pm |
| `src/host/attribution.ts` | **薄化为策略适配器**（不是纯再导出） | 保留 `resolveWorkspaceAttribution` 风格的出口？**否**——本包对外只暴露 `Attributor`，改为 `export { RootAttributor as Attributor }`；`RealpathIo` 别名指向 `RealpathPort`；**并发修复由内核获得**（不再有 `owners.clear()`） |
| `src/host/roots.ts` | 薄化 | re-export `workspaceRoots` |
| `src/host/triggers.ts` | 薄化 | re-export |
| `src/host/watcher.ts` | 薄化但保留本包阶梯 | `watchTargets(io, userDir, roots)` 签名保留，内部 `ladderTargets(io, [userLadder(userDir), ...roots.map(projectLadder)])`（**无 fallback**，保持「根不存在即不监听」的现有语义）；`projectLadder`/`userLadder` 留本地（导出被 `test/watcher.test.ts:41` 直接断言） |
| `src/host/host-io.ts` | 减半 | `nodeRealpathIo`/`nodeWatchIo` re-export；`nodeCommandIo`（`withFileTypes`）/`harnessHome`/`userCommandsDir` 留本地；`commandLog` → `createLog(ctx, 'dsh-plugin-user-commands')` |
| `src/host/types.ts` | 类型收敛 | `WorkspaceRoots`/`MultiRootGrant`/`CommandLog` 从 host-kit 导入再导出；`CommandIo`/`DirEntry` 留本地 |
| `src/host/index.ts` | 接线 | `new Attributor(...)` → `new RootAttributor(nodeRealpathIo, { onAnomaly: log.warn })` |
| `test/attribution.test.ts` | 不动（oracle） | 一条用例不改 |
| `test/attribution-concurrency.test.ts` | **新建** | 复活「重扫窗口内 attribute 不 fail-closed」用例（先在旧实现上跑红，再在新内核上跑绿 = 修复证据） |
| `test/bundle.test.ts` | **新建** | 同 pm 的三条自包含断言 |

#### `plugins/session-tool-toggle/`（双端）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 5 行：`buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'stt', cjsRequireShim: true })` |
| `package.json` | 依赖与脚本 | 删除 `esbuild`；加三个 workspace 包；catalog；`typecheck` 改双 `-p` 调用 |
| `.oxlintrc.json` | **删除** | 与根基准同 md5（`0e585b85…`）；根配置向上发现（探针实测） |
| `tsconfig.base.json` | **删除** | 属 4 份同 md5 组 |
| `tsconfig.host.json` / `tsconfig.client.json` | 改 | extends 根基准 + 去 composite + include 去 `vitest.config.ts` |
| `src/host/attribution.ts` | **重写为策略适配器（~45 行）** | 保留 `WorkspaceAttribution` 形状与 `resolveWorkspaceAttribution(cwd, ports)` 签名；内部：`const hit = new Map(registry.map(w=>[w.path, …]))` → `walkUp(cwd, lookup, realpath)` → 命中返回 `{key,registered:true,title}`、`canonicalCwd` 存在时返回 `{key:canonicalCwd,registered:false}`、否则 warn + `undefined`。**不 realpath registry 路径**（保持零额外 syscall 与现有语义） |
| `src/host/types.ts` | 类型收敛 | `SpecLog` → `LogSink` 别名（待决 Q1 定夺是否把 `createLog` 也迁走） |
| `test/workspace-attribution.test.ts` | 不动（oracle） | 5 组必测用例一条不改 |
| `test/bundle.test.ts` | 改 | 删本地 `readArtifact/requiredWords/importedWords`，改 import `scripts/lib/artifacts.mjs`；**新增**「每个 css module 一个注入器」断言（`data-dsh-css` 出现次数 = 模块数），把 v1.4.0 修复的知识钉进 stt |
| `test/stubs/ui-primitives.tsx` | 改薄 | `export * from '@dsh-plugins/test-kit/ui-primitives'`（本包无独有组件时一行收口） |

#### `plugins/web-ux/`（双端）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 5 行：`buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'wux' })`（**无 banner**：产物无 `__require`，② 实测 0 次） |
| `package.json` | 依赖与脚本 | 同 stt 形态 |
| `tsconfig.base.json` | **删除** | 属 4 份同 md5 组 |
| `tsconfig.host.json` / `tsconfig.client.json` | 改 | extends 根基准 + 去 composite + include 去 `vitest.config.ts` |
| `test/bundle.test.ts` | 改 | 同 stt：词法器改共享 + 保留本包特有字面量断言（`:100-102` 的注入器计数） |
| `test/stubs/ui-primitives.tsx` | 改薄 | re-export 底座 + 本包独有（`Menu`/`SegmentedTabs` 若底座形状不兼容则本地覆盖，见 ⑥ 验证项） |

#### `plugins/workspace-config/`（双端，唯一发 d.ts）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 5 行：`buildPlugin({ root: import.meta.dirname, cssClassPrefix: 'wsc' })`；**`clean` 模式由 `exports['./client'].types` 推导为 `js-only`**，`lib/types/**` 不再被误删（推导替代现 `:116-120` 的手写 `resetJavaScriptFace`） |
| `package.json` | 依赖与脚本 | devDeps 加三个 workspace 包、删 esbuild、catalog；`build`/`build:types` 保持两段；`typecheck` 改双 `-p` |
| `.oxlintrc.json` | **删除** | 与 stt 同 md5 |
| `tsconfig.base.json` | **删除** | 属同 md5 组 |
| `tsconfig.host.json` / `tsconfig.client.json` | 改 | extends 根基准 + 去 composite；`include` 保留（本包 include 是逐文件清单，不动） |
| `src/client/contract.ts` | **不动** | 契约 holder 导出维持现状（O1 共识）；docblock 里「三条纪律」加一句指向 `docs/decisions/ADR-0001` 的出处 |
| `test/bundle.test.ts` | 改 | 词法器改共享；`:33` 的 `SOFT_DSH_RANGE` 导入保留（仍是基线单点） |
| `test/stubs/ui-primitives.tsx` | 改薄 | 最大的一处：386 行 → re-export + 少数覆盖 |

#### `plugins/zcode-plan/`（host-only）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `build.mjs` | 改薄 | 5 行：`buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })` |
| `package.json` | 依赖与脚本 | 同 pm 形态；**保留** `compose:check`/`discount:snap`/`discount:verify` 三条本包专属脚本（模板断言允许附加脚本） |
| `tsconfig.base.json` | **删除** | 旧版（`ac623999…`）→ 根基准 |
| `tsconfig.host.json` | 改 | 同 pm |
| `vitest.config.ts` | **删除** | 同 pm |
| `test/bundle.test.ts` | **新建** | 宿主自包含 + `@deepseek-ai/schemastery` 已内联（`moduleWords` 不含它） |
| `src/**` | **不动** | 本包不含 attrib/watcher 家族代码，不参与 G4/G5 |

### 1.7 `plugins/multi-root-workspace/`（所属仓：根仓；**只对齐命令层，不动内核**）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `package.json` | 仅补一条命令（可选） | 若 CI/verify 分档需要，加 `verify:ci`（lint→typecheck→build→kernel:probe→test，**不含 smoke**）；其余字段（精确 peer、精确 allowlist、tsdown 脚本）**一字不改** |
| 其余全部 | **不动** | 构建链、`docs/`、ADR 体系、`.oxlintrc.json`（fork 的有意差异）、`tsconfig.*`（NodeNext 变体）全部维持 |

### 1.8 跨仓：dotfiles 仓 `agent/skills/dsh-plugin-writer/`（所属仓：**dotfiles**，单独 commit）

| 文件 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| `agent/skills/dsh-plugin-writer/SKILL.md` | 改版 | §3 模板对照表的「构建入口」列改为「`build-kit` 薄入口（5 行）」；§5 生命周期第 2 步「复制件套」→「`pnpm gen:plugin <name> --kind host-only\|dual`」；§6 真源表加 `tooling/build-kit/README.md`、`tooling/host-kit/README.md`、`docs/decisions/`；§4 必改清单第 2 项版本仍走 `release`（不变） |
| `agent/skills/dsh-plugin-writer/references/build.md` | 改版 | 全篇 **10 处** `plugins/*/build.mjs:<行号>` 引用失效 → 改为「策略在 `tooling/build-kit/src/*.mjs`，薄入口只声明差异」；`:39` 的 banner 三处行号改为 `tooling/build-kit/src/host.mjs` 的 banner 常量；`:54` 的壳模板行号改为 `src/client.mjs` |
| `agent/skills/dsh-plugin-writer/references/dual-client.md` | 改版 | `:88`（esbuild 路线两处行号）、`:91`（CSS 注入说明）改指 build-kit；补一句「CSS 防重护栏按包+模块双维度，已由 kit 统一」 |
| `agent/skills/dsh-plugin-writer/references/structure.md` | 改版 | `:13-15` 模板表（三种形态）、`:17`（不可省三件）、`:85-87`（三处 build.mjs 头注释引用）、`:111`（tsdown 特例）逐条按新结构改写；`tsconfig.base.json` 从「复制清单」中删除，改「继承根基准」 |
| `agent/skills/dsh-plugin-writer/references/verify-install.md` | 改版 | 命令链把 `pnpm dsh:check` 说明为聚合门禁（基线 + 结构 + 产物）；补 `pnpm gen:plugin` 的验证入口；`--dump-config-schema` 的既有豁免基线不变 |

> **执行约束（写入 ⑤ 的 G-doc-sync）**：本任务组改的是**技能文档**，执行时必须加载 `writing-skills` 技能；写完后按 writing-skills 的要求做路径/命令存在性校验（见 ⑤ 的验证列）。

---

## ② 证据锚

> 每条给出 `file:line` 与「它证明了什么可施工事实」。「新建」= 本设计新建文件，无可引用行。

### 2.1 重复/漂移证据（收敛理由的最小集）

| # | 锚 | 代码事实 |
| --- | --- | --- |
| E1 | `plugins/project-mcp/build.mjs:31-53`、`plugins/user-commands/build.mjs:28-51`、`plugins/zcode-plan/build.mjs:24-46` | 三份 host-only 骨架逐字同构（entry/`lib`/esm/node22/`sourcemap:false`/banner 文案完全相同），差异只有 `external` 一行 → build-kit 的 host 半可参数化 |
| E2 | `plugins/session-tool-toggle/build.mjs:63-98` vs `plugins/web-ux/build.mjs:61-100` | 同构 cssModulesPlugin，但 **web-ux 的护栏含 `data-dsh-css` 维度（`:86`）、stt 只按包名查询（`:85`）** → stt 潜伏 v1.4.0 同类 bug；kit 统一按双维度 |
| E3 | `plugins/workspace-config/build.mjs:116-120` | 手写 `resetJavaScriptFace()` 只删两个 JS —— 因为 `lib/types/` 由 `tsc` 先写；该特例可由 `exports['./client'].types`（`plugins/workspace-config/package.json` 的 `exports`）推导 |
| E4 | `plugins/web-ux/build.mjs:136-147`、`plugins/session-tool-toggle/build.mjs:139-150`、`plugins/workspace-config/build.mjs:158-169` | ModuleLoader 壳三份逐字相同 → kit 生成 |
| E5 | `md5sum plugins/*/tsconfig.base.json` = 4×`25ac2ce4…` + 2×`ac623999…`；两者差 `lib`（DOM/DOM.Iterable）与 `jsx` | 6 份 base 两种变体，2 份是旧版 → 根基准 + 删除本地 base |
| E6 | `plugins/project-mcp/package.json:56`（`"typecheck": "tsc -b --pretty false"`；其余 5 个软插件同值） | 6 包 `typecheck` 逐字相同 → 模板化 + 统一改形态 |
| E7 | `plugins/session-tool-toggle/.oxlintrc.json` 与 `plugins/workspace-config/.oxlintrc.json` md5 同为 `0e585b85…` | 可直接删（根配置向上发现，见 2.4 探针） |

### 2.2 运行期语义重复（G4/G5 的靶）

| # | 锚 | 代码事实 |
| --- | --- | --- |
| E8 | `plugins/project-mcp/src/host/attribution.ts:110-125` | 建两张表 → 末尾 `this.index = { primary, granted }` 一次性替换；`attribute()` `:135` 先解构快照 → **原子性已在此实现**，是 user-commands 应对齐的蓝本 |
| E9 | `plugins/user-commands/src/host/attribution.ts:66-84` | `this.owners.clear()`（`:67`）后**逐个 `await this.claim`**（`:78-83`）；`attribute()` `:102` 读 `this.owners.size`、`:106` 读 `this.owners.get` → 重扫窗口内必然可观测到空/半满表 ⇒ 会话被 fail-closed 或错归属。**这就是 Q5 的 bug，根因是「原地清空 + 逐条填充」** |
| E10 | `plugins/project-mcp/src/host/attribution.ts:118-122` vs `plugins/user-commands/src/host/attribution.ts:71-77` | 主根层相同；附加根层 pm 用 `roots.slice(1)`（按位置）、uc 用 `root === primaryRoot` 跳过（按值）→ **#3 异常场景下两包答案不同**（pm 丢 `roots[0]`，uc 认领它） |
| E11 | `plugins/user-commands/src/host/attribution.ts:72,107` | `rootSets.set(primaryRoot, roots)` 后写者覆盖 vs `owners` 先写者胜 → 同 primaryRoot 的双工作区会返回「先者的主根 + 后者的根集合」自相矛盾 |
| E12 | `plugins/project-mcp/src/host/roots.ts:23-37` 与 `plugins/user-commands/src/host/roots.ts:19-32` | 逐字同构（只有注释语言与 `import type {} from '@deepseek-ai/dsh-workspace'` 之差）→ 可直接合并 |
| E13 | `plugins/project-mcp/src/host/triggers.ts:48-67` 与 `plugins/user-commands/src/host/triggers.ts:43-65` | 逐字同构（仅注释与回调写法 `() => rescan()` vs `() => { rescan() }`） |
| E14 | `plugins/project-mcp/src/host/watcher.ts:76-153` 与 `plugins/user-commands/src/host/watcher.ts:90-168` | `DirectoryWatcher` 类体逐字同构（防抖 250ms、`arm` 的物化迭代、`dispose`）；差异只在阶梯构造（`:46` `LADDER` vs `:52-63` 两个 ladder 函数）与 warn 文案 |
| E15 | `plugins/project-mcp/src/host/host-io.ts:26-48` 与 `plugins/user-commands/src/host/host-io.ts:29-50` | `nodeRealpathIo`/`nodeWatchIo` 逐字相同；`readDir` 端口**不同构**（`:21` 返回 `string[]` vs `:24` 返回 `DirEntry[]`）→ 只共享 realpath/watch，不共享 read 端口 |
| E16 | `plugins/user-commands/src/host/host-io.ts:90-105`、`plugins/project-mcp/src/host/host-io.ts:63-79`、`plugins/session-tool-toggle/src/host/index.ts:951-966` | 日志适配器三份同形，stt 的 docblock 自认「照抄 project-mcp 的 scanLog」→ `createLog(ctx, prefix)` 可共享（stt 是否本次接入见待决 Q1） |
| E17 | `plugins/session-tool-toggle/src/host/attribution.ts:61-98` | 函数式归属（无根集合、`registry.path` 精确匹配、失败回退 `canonicalCwd` 键 `registered:false`、`/` 也失败则 warn）→ **未命中策略必须参数化，不能统一成 fail-closed** |

### 2.3 构建期耦合与治理面

| # | 锚 | 代码事实 |
| --- | --- | --- |
| E18 | `scripts/upgrade-dsh.mjs:172-205` | 遍历 `devDependencies` 并「不等于目标就改写」→ 见到 `catalog:` 会写成字面量版本，**必须同批改造** |
| E19 | `scripts/check-dsh-baseline.mjs:165-178` | `pins.add(version)` 直接比较字面量 → catalog 化后必须归一化 |
| E20 | `scripts/check-dsh-baseline.mjs:73-81`、`scripts/release.mjs:110-118` | 两者都**只遍历 `plugins/*`** → `tooling/*` 天然在版本契约之外；release 的 `git add plugins/*/lib` 也不会碰 tooling 产物 |
| E21 | `scripts/check-dsh-baseline.mjs:243-248` | 会扫 `scripts/*.mjs` 做已删插件残留检查 → 新增三个脚本自动纳入（无需改） |
| E22 | `plugins/workspace-config/test/bundle.test.ts:33` | 测试跨包 import 根 `scripts/dsh-baseline.mjs` 的既有先例（`tsc` 通过 → `scripts/lib/artifacts.mjs` 同法可行） |
| E23 | `plugins/workspace-config/test/bundle.test.ts:43-60`、`plugins/web-ux/test/bundle.test.ts`、`plugins/session-tool-toggle/test/bundle.test.ts` | `readArtifact`/`requiredWords`/`importedWords` 三份逐字副本 → `scripts/lib/artifacts.mjs` 单一实现 |
| E24 | `plugins/project-mcp/test/`（无 `bundle.test.ts`）、`plugins/user-commands/test/`（无）、`plugins/zcode-plan/test/`（无） | 三个 host-only 包**没有产物断言**（line-b 指出的真缺口）→ 由 R8 的 B1–B6 覆盖，不新增三份包内测试（决策见 ④ D-7） |
| E25 | `plugins/project-mcp/build.mjs:40`、`plugins/user-commands/build.mjs:38`、`plugins/zcode-plan/build.mjs:33`、`plugins/session-tool-toggle/build.mjs:113`、`plugins/web-ux/build.mjs:116`、`plugins/workspace-config/build.mjs:135` | 六份 host 半的 `external` 与 banner 组合：banner 只有 pm/uc/zcode/stt 有；实测产物 `__require` 只在 pm/uc 出现（各 6 次），wux/wsc/stt/zcode 为 0 → kit 的「有 `__require` 必须有 shim」守卫在现状下全绿，只拦未来回归 |
| E26 | `plugins/session-tool-toggle/test/stubs/ui-primitives.tsx`（170 行）、`plugins/web-ux/test/stubs/ui-primitives.tsx`（334）、`plugins/workspace-config/test/stubs/ui-primitives.tsx`（386） | 导出面是**包含关系而非等同**（stt ⊂ wsc；web-ux 独有 `MenuItemButton`/`SegmentedTabs`），Modal 实现有差异（wsc 有 `className`/`contentClassName`，web-ux 有 `data-modal-body`/`data-modal-footer`）→ 底座取并集实现，包内允许覆盖（裁定 4 的「公共底座 + 插件扩展」） |
| E27 | `plugins/*/package.json` 的 `scripts` | 5 条逐字重复（`build`/`lint`/`test`/`typecheck`/`verify:all`/`prepack`）；npm 协议要求脚本必须落在本包 manifest → 只能「生成 + 断言一致」，不能真共享（④ D-6） |

### 2.4 机制探针（本设计新做的只读/临时实验，全部在 `/tmp`，未触碰仓库）

| # | 探针 | 命令（可复现） | 结论 |
| --- | --- | --- | --- |
| P1 | composite + 跨包 TS 源 | `/tmp/tsprobe`：`tsc -p tsconfig.comp.json`（`composite:true` + 相对 import `../shared/src/index.ts`） | **TS6307 硬失败** → composite 与「共享 TS 源」不可共存 |
| P2 | 非 composite + 跨包 TS 源 | 同目录 `tsc -p tsconfig.rel.json`（无 composite，`allowImportingTsExtensions`） | **exit 0** → 去掉 composite 即可 |
| P3 | `paths` 映射到源 + 非 composite | `tsc -p tsconfig.paths.json`（`paths: {"@dsh-plugins/host-kit": ["../shared/src/index.ts"]}`） | **exit 0** |
| P4 | `paths` 声明在 extends 的基座里 | `pkgA/tsconfig.extends.json` extends `../base/plugin.base.json`（paths 写在 base） | **exit 0**，且 paths 相对 **base 文件所在目录** 解析 → 根基准可自带 `.../tooling/...` 映射 |
| P5 | composite + package exports→`.d.ts` | `tsconfig.compD.json` | exit 0（保留 composite 的旧路线仍可走，但需 host-kit 先产 d.ts，故选 P2/P3） |
| P6 | package exports 指向 `.ts` 源（无 paths） | `tsc -p tsconfig.pkg.json` | **TS2307 失败** → 光靠 exports 不够，`tsc` 必须靠 `paths` |
| P7 | esbuild 解析 package exports→`.ts` | `esbuild --bundle /tmp/tsprobe/pkgA/c.ts`（node_modules 软链指向 `@dsh-plugins/host-kit` → `src/index.ts`） | **exit 0 且内联**（产物出现 `function firstRoot(...)`）→ 构建期可直接消费 TS 源 |
| P8 | oxlint 祖先配置发现 | `cd /tmp/oxprobe/a/b && oxlint .`（配置在 `/tmp/oxprobe/.oxlintrc.json`，pattern 写成 `**/lib/**`） | **只 lint 1 个文件**（`lib/y.js` 被忽略）→ 祖先配置生效；**pattern 必须与路径无关**（首轮写成 `lib/**` 时误判为「未生效」） |
| P9 | `pnpm -r run <script>` 遇缺脚本的包 | `/tmp/rprobe`（pkgA 有 build、pkgB 只有 test） | **exit 0 且只跑 pkgA** → build-kit/host-kit 可以没有 `build` 脚本而不破坏 `pnpm build` |
| P10 | `catalog:` 规格的 devDep 在 git 安装下 | `/tmp/catprobe`：`pnpm add "git+file:///tmp/catprobe/plugin.git#v1.0.0"`（被测包 `devDependencies: { esbuild: "catalog:" }`） | **安装成功**，装出的 manifest 原样保留 `"esbuild": "catalog:"`（不解析、不安装）→ 与归档设计 D12 的 `workspace:*` 探针同结论（版本差异见 ⑥ A1） |
| P11 | 现有类型检查基线 | `plugins/project-mcp → ./node_modules/.bin/tsc -b --pretty false`、`plugins/workspace-config → 同` | 均 exit 0 → 迁移前基线可用作对照 |
| P12 | profile 侧 pnpm 版本 | `docker exec dsh pnpm --version` | **10.34.9**（catalog 自 9.5 起可用；⑥ A9） |
| P13 | composite + `paths` + 把跨包源显式列进 `include` | `tsc -p pkgA/tsconfig.compPaths2.json`（`include: ["../shared/src/index.ts"]`） | **exit 0** → composite 并非绝对不能共享源，但要求在 12 份配置里重复 `../../`（见 D-1 被否 2） |

### 2.5 跨仓证据（dotfiles）

| # | 锚 | 代码事实 |
| --- | --- | --- |
| E28 | `dotfiles/agent/skills/dsh-plugin-writer/SKILL.md:46-52`（§3 模板对照表的「构建入口」列） | skill 把「esbuild `build.mjs`」当成选型事实 → build-kit 后必须改写 |
| E29 | `dotfiles/agent/skills/dsh-plugin-writer/references/{build,dual-client,structure}.md` | `grep -rno 'build\.mjs:[0-9-]*'` 命中 **15 处行号引用**（本次只核到 anchors: `build.md:13/15/39/46/54`、`dual-client.md:88/91`、`structure.md:85/86/87/111`）→ 薄入口后**全部失效**，这是「5 处强耦合」的具体形态 |
| E30 | `dotfiles/agent/skills/dsh-plugin-writer/SKILL.md:76-88`（§5 生命周期 1–8 步） | 第 2 步是「复制件套」→ 改 `pnpm gen:plugin` 后此段是唯一入口，必须同步 |

> **新建模块（无既有代码事实可锚）**：`R5`–`R9`、`R13`、`R16`–`R18`、`K1`–`K10`、`H1`–`H12`、`T1`–`T5`、`P1`–`P3` 均为「新建」，在 ① 的表内已逐条标注；它们的证据不在既有代码里，而在 ③ 的接口契约与 2.4 的探针结论（P1–P13）。

---

## ③ 接口与数据形状

### 3.1 `@dsh-plugins/build-kit`（构建期，`.mjs`）

```js
// tooling/build-kit/src/index.mjs
/**
 * @typedef {object} BuildOptions
 * @property {string} root                          // 调用方包目录（薄入口传 import.meta.dirname）
 * @property {string[]} [hostExternals]             // 追加到 ['node:*'] 之后的宿主外置词
 * @property {boolean} [cjsRequireShim]             // 宿主产物是否需要真实 require banner（默认 false）
 * @property {string[]} [clientExternals]           // 覆盖浏览器半默认 module-table 清单（默认见表下）
 * @property {string} [cssClassPrefix]              // 作用域类名前缀（双端必填；保产物字节）
 * @property {'auto'|'full'|'js-only'} [clean]      // 默认 'auto'：由 dtsOwned 推导
 * @returns {Promise<{ packageName: string, kind: 'host'|'dual', dtsOwned: boolean, artifacts: string[] }>}
 */
export async function buildPlugin(options)

// 纯函数（导出以便单测，不启动 esbuild）
export function cssModuleContents({ source, relativePath, packageName, classPrefix })  // → { contents, classMap }
export function moduleLoaderShell({ packageName, code })                                // → string
export function indentBlock(text, levels)                                               // → string
export function deriveStrategy(manifest)   // → { kind, dtsOwned, clientEntry, hostEntry }
export function assertNoDynamicRequire(code, shimEnabled)   // 抛错或静默
export function assertNoInternalWord(code)                  // 抛错或静默
```

**推导规则（`deriveStrategy`，全部来自包事实，不引入新 manifest 键）**

| 事实来源 | 推导结果 |
| --- | --- |
| `manifest.name` | `packageName`（同时是 ModuleLoader 的 `id` 与 esbuild 的诊断名） |
| `manifest.dsh.client?.platform === 'web'` **且** `existsSync(<root>/src/client/index.ts)` | `kind = 'dual'`，否则 `'host'` |
| `existsSync(<root>/src/index.ts)` | 宿主入口路径（缺则抛错） |
| `Object.values(manifest.exports ?? {}).some(e => e.types)` | `dtsOwned = true` → `clean = 'js-only'`（只删 `lib/index.js`、`lib/client.js`），否则 `'full'`（整目录重建） |
| 常量（可覆盖） | 默认 `clientExternals = ['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@deepseek-ai/dsh-client-ui-primitives']` |

**薄入口最终形态（6 份，逐包一行参数差异）**

```js
// plugins/zcode-plan/build.mjs（最简）
import { buildPlugin } from '@dsh-plugins/build-kit'
await buildPlugin({ root: import.meta.dirname, cjsRequireShim: true })
```

| 包 | 薄入口参数 |
| --- | --- |
| project-mcp | `{ root, cjsRequireShim: true }` |
| user-commands | `{ root, hostExternals: ['@deepseek-ai/dsh-llm'], cjsRequireShim: true }` |
| zcode-plan | `{ root, cjsRequireShim: true }` |
| session-tool-toggle | `{ root, cssClassPrefix: 'stt', cjsRequireShim: true }` |
| web-ux | `{ root, cssClassPrefix: 'wux' }` |
| workspace-config | `{ root, cssClassPrefix: 'wsc' }` |

> `cjsRequireShim` 的三处 false（web-ux / workspace-config）与四处 true 是**实测**结论（E25），不是猜测；守卫 `assertNoDynamicRequire` 保证未来依赖变化时不会静默退化。

### 3.2 `@dsh-plugins/host-kit`（运行期源码，TS）

```ts
// tooling/host-kit/src/attribution.ts
export interface RealpathPort { realpath(candidate: string): Promise<string> }
export interface WorkspaceRoots { readonly primaryRoot: string; readonly roots: readonly string[] }
export interface Attribution { readonly workspaceRoot: string; readonly roots: readonly string[] }
export interface RootIndex {
  readonly primary: ReadonlyMap<string, Attribution>
  readonly granted: ReadonlyMap<string, Attribution>
}
export const EMPTY_INDEX: RootIndex
export type RootLookup = (canonical: string) => Attribution | undefined

export interface WalkResult {
  /** 最近命中的认领项；未命中时缺席。 */
  readonly hit?: Attribution
  /** cwd **自己那一级** canonical 化成功时的值（祖先成功不算）；stt 的退化键只用它。 */
  readonly canonicalCwd?: string
}

export interface RootIndexOptions {
  /** 契约异常诊断出口（roots[0] ≠ primaryRoot、同 primaryRoot 重复登记）。 */
  readonly onAnomaly?: (message: string) => void
}

export function buildRootIndex(
  workspaces: readonly WorkspaceRoots[],
  io: RealpathPort,
  options?: RootIndexOptions,
): Promise<RootIndex>

export function lookupIn(index: RootIndex): RootLookup

export function walkUp(
  cwd: string | undefined,
  lookup: RootLookup,
  io: RealpathPort,
): Promise<WalkResult>

/** 建新索引并一次性替换：attribute() 永远读到一个完整快照。 */
export class RootAttributor {
  constructor(io: RealpathPort, options?: RootIndexOptions)
  update(workspaces: readonly WorkspaceRoots[]): Promise<void>
  attribute(cwd: string | undefined): Promise<Attribution | null>
  index(): RootIndex
}
```

```ts
// tooling/host-kit/src/watcher.ts
export interface WatchIo {
  isDirectory(candidate: string): Promise<boolean>
  watch(dir: string, listener: () => void): { close(): void }
}
export const DEFAULT_DEBOUNCE_MS = 250
export interface LadderOptions { readonly fallbackToLast?: boolean }

/** 阶梯里最深的已存在层级；一棵都没有时按 fallbackToLast 返回最后一层或 undefined。 */
export function deepestExisting(
  io: Pick<WatchIo, 'isDirectory'>,
  ladder: readonly string[],
  options?: LadderOptions,
): Promise<string | undefined>

/** 多条阶梯 → 保序去重的监听目标。 */
export function ladderTargets(
  io: Pick<WatchIo, 'isDirectory'>,
  ladders: readonly (readonly string[])[],
  options?: LadderOptions,
): Promise<readonly string[]>

export class DirectoryWatcher {
  constructor(
    io: WatchIo,
    onChange: () => void,
    log: LogSink,
    debounceMs?: number,
  )
  arm(dirs: readonly string[]): void
  watched(): readonly string[]
  dispose(): void
}
```

```ts
// tooling/host-kit/src/triggers.ts
export interface TriggerContext {
  get(name: string): unknown
  on(event: 'domain/changed', listener: () => void): () => void
}
export interface MultiRootGrant {
  granted(primaryRoot: string): readonly string[]
  onChange(listener: () => void): () => void
}
export function installTriggers(ctx: TriggerContext, rescan: () => void): readonly (() => void)[]
```

```ts
// tooling/host-kit/src/roots.ts
export interface RootRegistryPort { list(): readonly { readonly path: string }[] }
export interface RootEnumeratorContext { get(name: string): unknown }
export function workspaceRoots(ctx: RootEnumeratorContext): readonly WorkspaceRoots[]
```

```ts
// tooling/host-kit/src/log.ts
export interface LogSink {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}
export function createLog(ctx: { logger: LogSink }, prefix: string): LogSink
```

```ts
// tooling/host-kit/src/host-io.ts
export const nodeRealpathIo: RealpathPort
export const nodeWatchIo: WatchIo
```

**包内薄化后的公开面（测试与 index.ts 的导入路径一字不改）**

| 包 | 文件 | 保留的导出 |
| --- | --- | --- |
| project-mcp | `src/host/attribution.ts` | `Attributor` → `RootAttributor` 别名、`RealpathIo` → `RealpathPort` 别名、`Attribution` |
| project-mcp | `src/host/watcher.ts` | `watchTargets(io, roots)`（本包阶梯 + `fallbackToLast:true`）、`DirectoryWatcher`、`WatchIo`、`DEFAULT_DEBOUNCE_MS` |
| project-mcp | `src/host/host-io.ts` | `nodeScanIo`、`nodeRealpathIo`、`nodeWatchIo`、`scanLog(ctx)` |
| user-commands | `src/host/watcher.ts` | `watchTargets(io, userDir, roots)`、`projectLadder`、`userLadder`、`DirectoryWatcher`、`WatchIo`、`DEFAULT_DEBOUNCE_MS` |
| user-commands | `src/host/host-io.ts` | `nodeCommandIo`、`nodeRealpathIo`、`nodeWatchIo`、`harnessHome`、`userCommandsDir`、`commandLog(ctx)` |
| session-tool-toggle | `src/host/attribution.ts` | `resolveWorkspaceAttribution(cwd, ports)`、`RealpathPort`（`RealpathPort` 复用 host-kit 的） |

### 3.3 脚手架 CLI（`scripts/gen-plugin.mjs`）

```
pnpm gen:plugin <name> --kind host-only|dual [--dry-run]

<name>      kebab-case，不以 dsh-plugin- 开头（生成器补前缀）；目标目录必须不存在
--kind      必填，无默认（host-only | dual）
--dry-run   只打印将创建的文件与内容摘要
exit 0/1/2  0=成功；1=校验失败（名字非法/目录已存在/未知 kind）；2=用法错误
```

生成物清单（`dual` 比 `host-only` 多 `src/client/index.ts`、`tsconfig.client.json`、`exports["./client"]`、`dsh.client`）：

```
plugins/<name>/{package.json, cordis.patch.yml, build.mjs, tsconfig.json,
                tsconfig.host.json[, tsconfig.client.json], vitest.config.ts,
                src/index.ts[, src/client/index.ts], test/smoke.test.ts, README.md}
```

`package.json` 的生成规则：`version` 取根 `package.json#version`；`dsh.engines.dsh` 与 DSH peer 取 `softDshRange()`（**现取现派生，不在模板里写字面量**）；DSH 系 devDeps 填 `catalog:dsh`、工具链填 `catalog:`；`@dsh-plugins/{build-kit,host-kit,test-kit}` 填 `workspace:*`（按 kind 决定是否含 test-kit）。

### 3.4 检查脚本的断言契约

`scripts/check-architecture.mjs`（全部失败一次列出，exit 1）：

| id | 断言 | 反例（红队） |
| --- | --- | --- |
| AR1 | 任一 `plugins/*/package.json` 的 `dependencies` **不含** `^@dsh-plugins/` 键 | 把 `@dsh-plugins/host-kit` 加进 dependencies → 拦下（C10） |
| AR2 | `tooling/*` 包：`private === true`、`version === '0.0.0'`、依赖白名单（build-kit ⊆ {esbuild}；host-kit = {}；test-kit ⊆ {react, react-dom}）、脚本白名单（build-kit ⊆ {lint,test}；host-kit ⊆ {lint,typecheck,test}；test-kit ⊆ {lint,typecheck}）、**任何 `@deepseek-ai/*` 依赖都不允许** | 给 build-kit 加 `build` 脚本或引 DSH 包 → 拦下（K2/K3） |
| AR3 | 6 个软插件的 5 条核心脚本等于模板值（`build`/`lint`/`test`/`typecheck`/`verify:all`/`prepack`），允许附加脚本 | 手动把某包 `test` 改成 `vitest` → 拦下 |
| AR4 | 6 个软插件的 `build.mjs`：行数 ≤ 12、含 `from '@dsh-plugins/build-kit'`、不含 `esbuild` 字样 | 抄回一份旧骨架 → 拦下（E1 复发哨兵） |
| AR5 | 6 个软插件的 `tsconfig.{host,client}.json`：`extends` 指向 `../../tsconfig.plugin.base.json`、无 `compilerOptions` 键（`include` 除外）、无 `composite` | 局部改 `lib`/`jsx` → 拦下（E5 复发哨兵） |
| AR6 | 6 个软插件目录下**无** `.oxlintrc.json`；根 `.oxlintrc.json` 的 `ignorePatterns` 含 `**/lib/**` | 抄回本地 lint 配置 → 拦下 |
| AR7 | `pnpm-workspace.yaml` 的 `packages` = `plugins/*` + 显式三个 `tooling/<name>`；每个被列入的目录都有 `package.json`，`tooling/template` **不在**列表里 | 把 packages 改成 `tooling/*` → 拦下（template 会变成包） |

`scripts/check-artifacts.mjs`：

| id | 断言 | 适用 |
| --- | --- | --- |
| B1 | `main` / `exports[*].default` / `exports[*].types` 指向的文件在磁盘存在；`files` 必含 `cordis.patch.yml` 与 `lib/**/*.js` | 全部 7 包 |
| B2 | 宿主产物 `lib/index.js` 的 `moduleWords`：每个词要么以 `node:` 开头，要么出现在本包 `package.json` 的 deps/devDeps/peers 里 | 全部 7 包 |
| B3 | 任一产物**不含** `@dsh-plugins/` 词（内部包必须被内联干净） | 全部 7 包 |
| B4 | 声明 `dsh.client` 的包：`lib/client.js` 以 `window.__ModuleLoader__.load({` 开头、`id` 等于包名、`factory: (require) => {` 在首 5 行内 | 4 个双端包（含 multi-root） |
| B5 | 浏览器半 `requiredWords` ⊆ `{react, react-dom, react/jsx-runtime, @deepseek-ai/dsh-client-ui-primitives}`；不含 `@deepseek-ai/dsh-client-ui-slots`（D2） | 4 个双端包 |
| B6 | `--baseline DIR` 模式下：各包模块词集合与快照**逐字相等**（`--write-baseline` 生成） | 迁移期 |

`--write-baseline DIR` 的快照形状：

```json
{
  "package": "dsh-plugin-project-mcp",
  "host": { "words": ["node:fs", "node:module", "node:path"], "sha256": "…" },
  "client": { "words": [], "sha256": null }
}
```

### 3.5 配置键（新增/变更的形状）

```yaml
# pnpm-workspace.yaml
packages:
  - "plugins/*"
  - "tooling/build-kit"
  - "tooling/host-kit"
  - "tooling/test-kit"

# 工具链：人工升，跨 6 个软插件共享（multi-root 不引用）
catalog:
  '@types/node': '^22.20.0'
  '@types/react': '~18.3.31'
  '@types/react-dom': '^18.3.5'
  '@testing-library/react': '^16.3.3'
  esbuild: '^0.25.0'
  jsdom: '^26.1.0'
  oxlint: '^1.76.0'
  react: '^18.3.1'
  react-dom: '^18.3.1'
  typescript: '^5.9.0'
  vitest: '^3.2.0'

# DSH 基线族：由 pnpm dsh:upgrade 单点重写，dsh:check 逐条比对
catalogs:
  dsh:
    '@deepseek-ai/cordis': '4.1.0'
    '@deepseek-ai/schemastery': '3.19.0'
    '@deepseek-ai/dsh': '0.2.2-rc.1'
    '@deepseek-ai/dsh-agent': '0.2.2-rc.1'
    # … 6 个软插件 devDeps 里出现过的全部 @deepseek-ai/dsh-* 名字（约 40 条）
```

```jsonc
// plugins/<name>/package.json（6 软插件）
"devDependencies": {
  "@dsh-plugins/build-kit": "workspace:*",
  "@dsh-plugins/host-kit": "workspace:*",
  "@dsh-plugins/test-kit": "workspace:*",
  "@deepseek-ai/cordis": "catalog:dsh",
  "@deepseek-ai/dsh": "catalog:dsh",
  // 删除：esbuild 不再直接依赖（改由 build-kit 依赖）
  "typescript": "catalog:",
  "vitest": "catalog:",
  "oxlint": "catalog:",
  "@types/node": "catalog:"
},
"scripts": {
  "build": "node build.mjs",
  "lint": "oxlint",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.host.json --pretty false && tsc -p tsconfig.client.json --pretty false",
  "verify:all": "pnpm lint && pnpm typecheck && pnpm build && pnpm test",
  "prepack": "pnpm run build"
}
```

```jsonc
// tsconfig.plugin.base.json（根，唯一编译基准）
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "types": ["node"],
    "paths": {
      "@dsh-plugins/host-kit": ["./tooling/host-kit/src/index.ts"],
      "@dsh-plugins/host-kit/*": ["./tooling/host-kit/src/*.ts"],
      "@dsh-plugins/test-kit/*": ["./tooling/test-kit/src/*.ts"]
    }
  }
}
```

```jsonc
// plugins/<name>/tsconfig.host.json（示例：project-mcp）
{
  "extends": "../../tsconfig.plugin.base.json",
  "include": ["src/index.ts", "src/host", "test/**/*.test.ts"]
}
```

### 3.6 数据形状（运行期语义，供 spec delta 与测试对齐）

```ts
/** 一个工作区的根集合：主根身份只由 primaryRoot 决定，roots 是扫描顺序（首项约定为主根）。 */
interface WorkspaceRoots { primaryRoot: string; roots: readonly string[] }

/** 归属答案：workspaceRoot 与 roots 都保持**登记拼写**，不做 canonical 化（否则与扫描侧对不上）。 */
interface Attribution { workspaceRoot: string; roots: readonly string[] }

/** 未命中策略（各自包内 3–10 行适配器，不进内核） */
type MissPolicy =
  | { kind: 'fail-closed' }                                      // project-mcp / user-commands
  | { kind: 'canonical-cwd'; registered: false }                 // session-tool-toggle
```

---

## ④ 决策记录

> 每条含「决策 / 理由 / 被否方案 / 反例」。带 ★ 的是本设计**新增**的结构性判断（其余是把 diff-matrix 已定决策翻译成代码形态）。

**D-1 ★ 共享源码的消费形态：包 exports→`src/*.ts` + 根 tsconfig `paths`，且 6 包去 `composite`**
- 理由：要同时满足「esbuild 构建期直接内联」与「tsc 类型解析」，探针给出唯一可行组合（P2/P3/P7）；composite 与跨包源不可共存（P1/P5 的 TS6307），而 composite 在本仓唯一的用途是 `tsc -b` 的增量缓存（`.tsbuildinfo` 全部被 gitignore）。
- 被否 1「host-kit 先 tsc 产 `lib/*.d.ts`，消费方按普通包引入」：需要「host-kit build → 插件 typecheck」的顺序耦合，而 CI 步骤序是 typecheck 在 build 之前（决策 #6），会让 `pnpm typecheck` 在干净树上必红；且新增产物目录与 gitignore 面。
- 被否 2「composite + 每个 tsconfig include 里列出 `../../tooling/host-kit/src/**/*.ts`」：探针 P13 证明可行，但把 `../../` 写进 12 份配置、并把 kit 源码塞进 6 套类型程序（kit 的错会以 6 倍噪音出现），正是复算线 R3 批评的形态。
- 被否 3「project references + 引用项目 emit d.ts」：教科书正解，但引入「typecheck 自己会产出文件」的隐式副作用与新的 outDir 产物面，与本仓「配置即事实」的风格冲突。
- 反例：只靠 `exports` 指向 `.ts`（不写 `paths`）——探针 P6 直接 TS2307，`tsc` 不认 exports 里的 `.ts`。这是本决策唯一的硬失败模式，已由根基准的 `paths` 兜住。

**D-2 ★ `build-kit` 的策略来源：包事实推导 + 两个半旋钮**
- 理由：`kind` 可由 `dsh.client.platform`+`src/client/index.ts` 推导、`dtsOwned` 可由 `exports[*].types` 推导、`clean` 由 `dtsOwned` 推导——这三条覆盖了 6 包的全部差异，且都是**已经写在 manifest 里的事实**（不再新增键）。剩下两个旋钮（`hostExternals` / `cjsRequireShim`）**不可推导**：前者编码「哪个依赖必须与宿主共用实例」的运行时判断（`@deepseek-ai/dsh-llm`），后者编码「产物里是否会出现 CJS `require`」的依赖图属性；把它们写成旋钮并配 `assertNoDynamicRequire` 守卫，比假装能推导更诚实。
- 被否 1「把策略写进 `package.json#dsh.build`」：多一个 manifest 契约面（要写 schema、要进 dsh:check、要写进 writer skill），而这套策略只有 6 个消费方且都在同仓，旋钮放调用点更可见。
- 被否 2「`kind` 用显式参数传」：`dsh.client.platform` 已是双端的唯一权威声明（`cordis.patch.yml` 的裸包名行依赖它），再传一遍就有两个事实源。
- 被否 3「`cjsRequireShim` 默认 true 全家开」：web-ux/workspace-config 的宿主半会被注入 `import { createRequire } from 'node:module'`，而 `plugins/workspace-config/test/bundle.test.ts:130-131` 断言宿主半 `importedWords(...) === []`（零 import）——直接破测。
- 反例：zcode-plan 实测产物 `__require` 出现 0 次却一直带着 banner（E25）。若按「推断」去掉 banner，未来它一旦内联 CJS 依赖就会在 profile 启动时抛 `Dynamic require of … is not supported`（F3）。所以 banner 保留、由守卫在「有 `__require` 无 banner」时**让构建失败**。

**D-3 ★ CSS modules 护栏统一为「包 + 模块」双维度**
- 理由：web-ux/workspace-config 已有该维度并可读注释为什么必须有它（`plugins/web-ux/build.mjs:83-85` 的注释 + `:86` 的查询表达式：只按包名查询会让同包第二个模块的样式永不注入，v1.4.0 的 delete 样式即因此失效）；stt 目前只有 1 个 css module 所以 bug 不可见。
- 被否「保持三份各自的护栏」：等于把「一个包里只能有一个 css module」变成隐式限制，下一个加第二个 module 的包会复现线上 bug。
- 反例：stt 现在的产物（`plugins/session-tool-toggle/build.mjs:85`）若照抄进 kit，kit 的 css 单测会红——这正是用测试把历史修复钉住的收益。

**D-4 ★ 归属内核不决定「未命中怎么办」，只报告上溯事实**
- 理由：三包唯一真正的语义分叉就在未命中策略（stt 有 spec 背书的 `registered:false` 兜底，pm/uc 是 fail-closed），把它塞进内核等于在共享包里写 per-package 分支。内核返回 `{ hit?, canonicalCwd? }` 两个事实，各包 3–10 行适配器自行决定 —— 这才是「参数化」的正确落点。
- 被否 1「内核接 `policy: 'fail-closed' | 'canonical-cwd'` 枚举」：枚举让内核必须知道 stt 的 registry 形状（`{path,title}`）与「不 realpath registry 路径」的性能约定，共享包被迫承载某包的私有约束。
- 被否 2「stt 也用 `buildRootIndex(registry.map(...))`」：会把 registry 路径全部 realpath 一遍（每次会话创建都做），并且在某个已登记工作区目录被删时改变行为（索引里少一项 → 无法命中 → 变成 fail-closed），违反 stt 现有语义。
- 反例：若把未命中统一成 fail-closed，stt 的 spec 场景「目录已被删除」会从「退化到 canonical cwd 键」变成「只用用户级默认档」——是行为变更而非重构。

**D-5 ★ `#3` 裁定：主根身份只由 `primaryRoot` 决定，「值语义 + 一次诊断」**
- 规则：`primaryRoot` 进主根层；`roots` 中所有 `!== primaryRoot` 的项按原顺序进附加根层；同层先写者胜；`roots[0] !== primaryRoot` 时经 `onAnomaly` 报一条诊断，**一个根都不丢**。同 `primaryRoot` 被两个工作区登记时主根层先写者胜（并报一条诊断），返回的 `roots` 取**胜者自己的**根集合。
- 理由：在契约成立（`roots[0] === primaryRoot`，两包 `roots.ts` 的构造法保证）时，本规则与两包今天的实现**逐字等价**（`filter(≠primaryRoot)` ≡ `slice(1)`），因此对任何被 spec 覆盖的场景零行为变更；异常场景下「丢一个根」会让该根下所有会话的项目能力静默全失（最坏失败模式），而「认领它 + 告警」是唯一可观测且不丢功能的选项。
- 被否 1「按位置 `slice(1)`（project-mcp 现状）」：反例即异常场景——真实根被丢弃，会话 fail-closed 且无日志，排查成本极高（用户只看到「命令/MCP 变少了」）。
- 被否 2「以 `roots[0]` 为主根」：把所有权判据从 `primaryRoot` 字段挪到数组位置，与 `roots.ts` 的构造法、`serverName` 仲裁的登记顺序语义全部冲突。
- 被否 3「抛错让整次 `update()` 失败」：把一次根集合异常放大成全局 fail-closed（所有会话失去全部项目能力），违反本仓「软依赖降级而非失败」的既有纪律（triggers/watcher 同款）。
- 被否 4「静默忽略」：与用户-commands 并发 bug 同一类问题——异常必须可观测。

**D-6 ★ npm scripts 的「模板化」= 生成 + 断言一致，不做真共享**
- 理由：npm/pnpm 只从**本包 manifest** 读脚本，没有 include 机制；能做的只有「一处生成 + 机器断言不漂移」。
- 被否 1「根脚本代理：`pnpm --filter <pkg> verify:all` 改成根上的 `pnpm verify --filter`」：会破坏现成命令面（README/AGENTS/writer skill/CI 全部引用 `pnpm --filter <包名> verify:all`），且让单包验证必须先走根。
- 被否 2「新增内部包导出 bin」：脚本仍得在 manifest 里各写一行，没有减少任何一行，只增加一层间接。
- 反例：`typecheck` 若只在模板里改、不落断言，6 个包会各自漂移成 `tsc -b`/`tsc -p ... --noEmit`/`tsc -p` 三种——这正是本次要消灭的形态（E6）。

**D-7 ★ 三个 host-only 包不新增 `bundle.test.ts`，产物断言上移到仓级 `check-artifacts.mjs`**
- 理由：缺的那组不变式（自包含、无内部包词、exports 落盘）是**通用**的，而现有 3 份包内 `bundle.test.ts` 的通用部分与包特有字面量纠缠在一起（座位名、entry id、文案键）。在仓级实现一次、覆盖 7 个包，同时保留包内测试作为「本包字面量」的 oracle，比再造 3 份同构测试更符合「不变式只落一处」。
- 被否 1「三包各写一份 bundle.test.ts」：三份副本立刻成为第四代漂移源（E23 已是三份）。
- 被否 2「把三份现有测试的通用部分也抽走」：会把 D2/D3 防线拆到两个文件两类进程里，测试可读性下降且需重排断言，收益小于风险。
- 反例：`check-artifacts.mjs` 只在 `dsh:check` 跑，而 `pnpm -r test` 单独跑时看不到它——因此 CI 与 release 都必须经过 `dsh:check`（④ D-8 保障）。

**D-8 ★ `dsh:check` 变成三脚本聚合，release 与 CI 都只认这一个入口**
- 理由：决策 O2 是「漂移守护挂 dsh:check」；一旦 dsh:check 内部扩成三个脚本而 release 还只调第一个，发布路径就会绕过新门禁（`scripts/release.mjs:99-107` 现在直接 spawn 单脚本）。
- 被否「新增独立 `arch:check` 顶层命令」：多一个「记得跑」的命令，与 O2 的结论相反。
- 反例：只改 `package.json#dsh:check` 不改 `release.mjs` —— 本地 `pnpm dsh:check` 绿、`pnpm release` 少跑两步，产物契约在发布点失效。

**D-9 ★ `pnpm-workspace.yaml` 的 `packages` 用显式三行而非 `tooling/*`**
- 理由：`tooling/template` 不是包（清单叫 `package.json.tmpl`）；`tooling/*` 会让它成为 workspace 候选，也让「谁是包」不可断言。
- 被否「把模板挪到 `scripts/template/`」：模板要与 `gen:plugin` 一起演进，放 `tooling/`（构建期工具域）在语义上更准；且这样 `scripts/` 只留「仓库机制脚本」一种东西。
- 反例：若用 `tooling/*` 且某天有人在 `tooling/template/` 放了一个真 `package.json`，它会静默成为 workspace 包被 `pnpm -r` 递归到（可能连带 lint/test 失败与版本同步歧义）。

**D-10 ★ catalog 用命名 catalog `dsh` + 默认 catalog 两册，multi-root 不迁**
- 理由：`upgrade-dsh.mjs` 只需要重写一册（DSH 族），人工升级只需改另一册（工具链）；两册互不干扰，`dsh:check` 的比对面也因此只有一册。multi-root 的 typescript/vitest/oxlint 是另一个大版本（`^6.0.3` / `^4.1.8` / `^1.76.0`），若共用默认 catalog 会把它拖回旧版（C2 明确「不纳入统一构建/统一 peer」）。
- 被否 1「单一默认 catalog 全包」：会把 multi-root 的 typescript 从 6.x 降到 5.9，直接破它的构建链。
- 被否 2「catalog 只放 DSH 族，工具链保持字面量」：`esbuild`/`oxlint`/`typescript`/`vitest` 的版本仍是 6 处字面量，工具链升级照样要改 6 遍（G1 的收益被抵消一半）。
- 反例：`@types/react` 现为 `~18.3.1`（stt/web-ux）与 `~18.3.31`（workspace-config）两种；catalog 必须收成一个值（取 `~18.3.31`）。若统一成低值，workspace-config 的 JSX 类型会退化到更旧的声明——统一方向必须取**较新**的那个，并靠 `pnpm -r typecheck` 验证。

**D-11 ★ 三个「无配置」包的 `vitest.config.ts` 直接删除，而不是复制成模板**
- 理由：它们的内容只有 `include: ['test/**/*.test.ts']` 与 `environment: 'node'`（vitest 默认值）；保留 3 份同构副本只会在每次 vitest 大版本升级时要求改 3 遍——正是「升级便宜」的反面。
- 被否「三份都保留并纳入 AR3 的模板断言」：断言能防漂移，但防不住「升级时要改 3 处」这个成本。
- 反例：删除后若 vitest 默认 include 变了（例如把 `lib/**` 纳进来），`pnpm -r test` 会收集到 0 用例却报绿——**验收必须比对用例数**（⑤ G3 的验证映射写了这条）。

**D-12 ★ `@dsh-plugins/*` 内部包一律只进 `devDependencies`，并用 AR1 断言机器化**
- 理由：安装模型铁律（C1）在本次新增了 3 个内部包，误写进 `dependencies` 的后果是「用户 profile 侧 git 安装当场解析失败」，且失败发生在别人的机器上。AR1 把这条纪律从文档变成门禁。
- 被否「只在 README 写一句」：本次新增了 3 个可被误引的包名，纯文档不足以守住。
- 反例：`workspace:*` 出现在 `dependencies` 时，本地 `pnpm install` 完全正常（workspace 协议在仓内可解析），只有 profile 侧才炸——本地永远测不出来。

**D-13 ★ 本次不加载 `dsh-plugin-writer` skill（用户明确豁免，仅本次有效）**
- 内容：按用户指令，本次规划/设计全程**不加载任何 writer skill**，`dsh-plugin-writer`、`writing-skills` 均不加载；理由：本次是对该 skill 所描述架构的**完全重构**，skill 本身（连同其 15 处 `build.mjs:<行号>` 引用）也在重构范围内，旧规范不能约束新设计。
- 边界：豁免只对「本次设计与规划」有效；**G-doc-sync 执行时仍须加载 `writing-skills`**（写技能文档的技能），这一点写进 ⑤ 的对应任务组。
- 被否「先加载旧 skill 再逐条看是否需要破例」：会产生「以旧规范为基准的默认否定」偏差，且旧 skill 的事实基础（构建入口形态）本次直接失效。
- 反例：若在本次设计里引用 skill 的「必改清单 7 项」作为验收依据，G1 完成后那 7 项里第 3/5 项的表述就会与薄入口矛盾——这正是必须豁免的实证。

**D-14 ★ 仓级 ADR 放在 `docs/decisions/`，与 multi-root 的 ADR 编号互不干涉**
- 理由：决策 #2 要求「ADR 推翻不共享代码的旧结论」，而旧结论的载体是两包 attribution 的 docblock（`plugins/user-commands/src/host/attribution.ts:16-18` 明文「不共享代码」）。ADR 必须放在能同时约束两包的位置 = 仓根。
- 被否「写进 `tooling/host-kit/README.md`」：README 不是决策记录，无法承载「推翻旧结论 + 被否方案」。
- 反例：把仓级 ADR 也编成 `ADR-0001` 而不加路径限定，会让「ADR-0009 是精确 peer 策略」这条既有引用产生歧义（multi-root 的 ADR-0009 与本仓级 ADR-0001 不同名但同前缀），因此 `docs/decisions/README.md` 必须写明「两套独立编号、引用带路径」。

---

## ⑤ 逐任务组实现要点

> 任务组 id 即后续 `tasks.md` 必须采用的分组 id（**一一对齐**，不得改名/合并）。每个任务组给出：施工顺序 → 逐文件动作 → 验证映射（具体命令或断言，禁止「已实现/正常」）。
> 通用收口命令（每组结束都跑，下文简称 **`GATE`**）：
> ```
> pnpm install && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test && pnpm dsh:check
> ```

### G0 基线冻结与等价性工具（先于一切改动）

1. 新建 `scripts/lib/artifacts.mjs`（R9）与 `scripts/check-artifacts.mjs` 的 `--write-baseline/--baseline` 两模式（R8 的 B6）。
2. 在当前 HEAD（未改任何东西）上冻结基线：
   ```bash
   node scripts/check-artifacts.mjs --write-baseline /tmp/arch-baseline
   ```
3. 记录 6 个软插件的用例数（`vitest` 输出汇总）与 `pnpm -r typecheck` 基线（P11）。

**验证（可复现断言）**
- `node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` → exit 0（自比对）。
- `node scripts/check-artifacts.mjs`（门禁模式）→ 在**未改动**的树上必须 exit 0；若红，说明基线断言过严，先修断言再开工（不许放宽到「跳过」）。
- 快照目录内容：7 个 `<包名>.json`，每个含 `host.words`（排序后的模块词）与 `sha256`。

### G1 build-kit 收敛（构建期「死的重复」）

顺序：建包 → 三个 host-only 先迁（风险最小）→ 三个双端。
1. K1–K10（`tooling/build-kit/` 全部文件）+ R1 的 `packages` 三行。
2. 三个 host-only 的 `build.mjs` 改 5 行薄入口（project-mcp / user-commands / zcode-plan），`package.json` 加 `@dsh-plugins/build-kit: workspace:*`、删 `esbuild`。
3. 三个双端的 `build.mjs` 改薄（`cssClassPrefix` 三值 `stt`/`wux`/`wsc`），workspace-config 的 `clean` 由 `dtsOwned` 接管。
4. `assertNoDynamicRequire` 守卫在**当前依赖图**下必须全绿（E25：只有 pm/uc 有 `__require`，而它们恰好都有 shim）。

**验证**
- `node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` → **模块词集合逐字相等**（允许 `sha256` 变化：注入顺序与 css 属性变更会改字节，不改模块词）。
- `pnpm --filter @dsh-plugins/build-kit test` → css 双模块、壳形状、四格守卫全绿。
- 红队：把 `plugins/workspace-config/build.mjs` 改成 `cjsRequireShim: true` → `plugins/workspace-config/test/bundle.test.ts:130-131`（宿主半零 import）必红；恢复后绿。**注意**：web-ux/stt 的宿主断言只禁止非 `node:` 词（`web-ux/test/bundle.test.ts:111-113`、`session-tool-toggle/test/bundle.test.ts:158-163`），所以 banner 对它们「无害但多余」——`cjsRequireShim` 的正确性只能由包自己的零 import 断言与 `assertNoDynamicRequire` 双向夹住。
- `git diff --stat plugins/*/lib` 只应出现 6 个包（multi-root 的 `lib/` **必须零 diff**）。

### G2 构建配置与依赖收敛（tsconfig / catalog / scripts / oxlint / vitest）

顺序：根基准 → tsconfig 迁移 → catalog 同批（含 upgrade/check 适配）→ oxlint → vitest 删除。
1. R3 `tsconfig.plugin.base.json`（含 `paths`，此时 host-kit 还不存在 → 映射指向空目录不影响：`tsc` 只在真正 import 时才解析）。
2. 6 包：删 `tsconfig.base.json`；`tsconfig.host.json`/`tsconfig.client.json` 改 extends + 去 composite；`typecheck` 脚本改 `-p`（见 E6）。→ **先跑一次 `pnpm -r typecheck` 确认等于 P11 基线**。
3. R1 两份 catalog + 6 包 devDeps 改 `catalog:`/`catalog:dsh`；同批改 R10（check 归一化）与 R11（upgrade 写 catalog + 后置断言）。
4. R4 根 `.oxlintrc.json`；删 `plugins/session-tool-toggle/.oxlintrc.json`、`plugins/workspace-config/.oxlintrc.json`。
5. 删 `plugins/{project-mcp,user-commands,zcode-plan}/vitest.config.ts`，并从各自 `tsconfig.host.json` 的 `include` 去掉该文件。
6. R12 release 改调聚合入口；R6/R7 建两个新脚本（`check-architecture.mjs` 的 AR1–AR7 此时可先只开 AR2/AR3/AR5/AR7，AR4/AR6 待 G1/G2 收口后开）。

**验证**
- 迁移前后 lockfile 的 `packages:` 键集合相等（复用 `scripts/check-dsh-baseline.mjs:114-127` 的解析器；`/tmp/lock.before` 必须在 **G1 已合入、G2 未开工** 时抓取，否则 G1 引入的工具包会污染基线）：
  ```bash
  cp pnpm-lock.yaml /tmp/lock.before
  pnpm install
  diff <(sed -n '/^packages:/,/^snapshots:/p' /tmp/lock.before | grep -E "^  '?[@a-z]" | sort) \
       <(sed -n '/^packages:/,/^snapshots:/p' pnpm-lock.yaml  | grep -E "^  '?[@a-z]" | sort)
  ```
  断言：上面两条 `diff` 输出为空（`packages:` 段键集合零差异）；只有 `importers:` 段的 specifier 行允许变化。
- `pnpm -r typecheck` 绿，且 `pnpm -r test` 的逐包用例数与 G0 记录值相等（证明删 vitest.config.ts 未改变收集面）。
- `pnpm -r lint`：`plugins/*/lib/**` 未进入 lint 范围（在 `lib/` 里放一个 `var x = 1` 文件，`pnpm -r lint` 必须不报它）。
- `pnpm dsh:upgrade 0.2.2-rc.1` 重跑幂等：`git diff` 为空（`--probe` 亦可）。
- 红队：把某包 `devDependencies["@deepseek-ai/dsh"]` 从 `catalog:dsh` 改回 `0.2.2-rc.1` → `pnpm dsh:check` 必红（AR3 与 pin 归一化断言）。

### G3 测试资产收敛（stubs 底座 / 词法器 / 文案）

1. T1–T5（`tooling/test-kit/`）。
2. 三个双端包的 `test/stubs/ui-primitives.tsx` 改薄（re-export 底座 + 允许本地覆盖）；`@deepseek-ai/dsh-client-ui-primitives` 的 vitest alias 与 `tsconfig` include **不动**（alias 仍指向本包 stub 文件 → 测试文件零改动）。
3. 三份 `test/bundle.test.ts` 删本地 `readArtifact/requiredWords/importedWords`，改 import `scripts/lib/artifacts.mjs`；**字面量断言原样保留**（`CLIENT_EXTERNALS`、座位名、entry id）。
4. `locale-parity` 两处改调 `localeParityIssues`，`expect(NS).toBe('<字面量>')` 留在本包。

**验证**
- `pnpm -r test` 逐包用例数 ≥ G0 记录值（只许相等或增加）；三个双端包的组件套件（jsdom）全绿 = stub 并集实现的行为等价证据。
- 审计断言：`grep -c "expect(" plugins/*/test/bundle.test.ts` 与 G0 记录值**逐个相等**（共享化后字面量断言数不减少，O9）。
- `pnpm --filter dsh-plugin-session-tool-toggle test` 必须仍包含「每个 css module 一个注入器」断言（新增，见 ⑤ G1 的 stt bundle 测试改动）。

### G4 host-kit 骨架 + attribution 内核三包接管

1. H1–H9、H12。
2. pm/uc：`src/host/attribution.ts` 改薄再导出；`src/host/index.ts` 换 `RootAttributor`；`src/host/types.ts` 类型收敛。
3. stt：`src/host/attribution.ts` 重写成策略适配器（D-4），`src/host/types.ts` 的 `SpecLog` 走别名（Q1 未决时保留本地定义）。
4. H10/H11：内核规范级用例（含 #3 异常、并发窗口）。
5. 包内 `test/attribution.test.ts`（pm/uc）**一条用例都不改**，作为等价 oracle。

**验证**
- `pnpm --filter @dsh-plugins/host-kit test` 全绿（含 `roots[0]≠primaryRoot` 与「重扫中不 fail-closed」两例，后者在 G6 复现为回归）。
- `pnpm --filter dsh-plugin-project-mcp test`、`--filter dsh-plugin-user-commands test`、`--filter dsh-plugin-session-tool-toggle test` 全绿且用例数不减少。
- `node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` → 模块词集合相等（host-kit 只引入 `node:path`，与现状同集）。
- 三条产物断言（B3）：`grep -c "@dsh-plugins/" plugins/*/lib/index.js` 全部为 0。

### G5 host-kit 其余语义合并（triggers / watcher / host-io / roots ×2）

1. pm/uc 的 `roots.ts` / `triggers.ts` 改薄再导出；`watcher.ts` 按 3.2 的「保留签名 + 内部走 kit」改造；`host-io.ts` 减半（read 端口各留本地）。
2. 日志适配器：pm/uc 的 `scanLog`/`commandLog` 改 `createLog(ctx, prefix)`（**前缀字符串逐字不变**）；stt 视 Q1 决定。
3. `watchTargets` 的两处语义差由 `fallbackToLast` 参数承载（pm=true，uc=false）。

**验证**
- `pnpm --filter dsh-plugin-project-mcp test` + `--filter dsh-plugin-user-commands test` 全绿；`test/watch-reload.test.ts:129/132/135`（pm 三档阶梯）与 `test/watcher.test.ts:23/31/39/47`（uc 三档 + 共享根去重）**用例不改即通过**。
- 日志文本断言：`grep -rn "dsh-plugin-project-mcp: " plugins/project-mcp/lib/index.js` 至少 1 处、`dsh-plugin-user-commands: ` 同理（前缀未变）。
- `node scripts/check-artifacts.mjs --baseline /tmp/arch-baseline` 模块词集合相等。

### G6 规范增量与回归证据（Q5 修复 + #3 裁定 + spec delta）

1. `test/attribution-concurrency.test.ts`（uc）与 `test/attribution-anomaly.test.ts`（pm/uc 各一）落盘；**先在旧实现上复现红**（用 `git stash` 或临时 import 旧实现的方式取证一次，把「红→绿」写进变更记录）。
2. R19/R20 的 spec delta（走 `openspec-propose` 的新变更，`openspec validate --all` 必须绿）：
   - `dsh-project-mcp/spec.md`「工作区可见性隔离」追加：
     > 根集合契约 SHALL 以 `primaryRoot` 为工作区主根的唯一权威，`roots` 是扫描顺序集合（首项约定为主根）。当 `roots[0] !== primaryRoot`（契约被违反）时，实现 MUST 以 `primaryRoot` 进主根层、并将 `roots` 中所有不等于 `primaryRoot` 的项按原顺序进附加根层，并 MUST 记录一条诊断日志；MUST NOT 因位置假设丢弃任何根。同一 `primaryRoot` 被多个工作区登记时，主根层 MUST 先到先得，返回的根集合 MUST 取自胜出工作区。
     >
     > 归属索引的重建 MUST 是原子的：实现 MUST 先完整构造新索引再一次性替换；进行中的归属判定 MUST 使用替换前的完整快照，MUST NOT 观察到「已清空」或「半填充」的索引。
     >
     > #### Scenario: 根集合首项不是主根
     > - **WHEN** 某工作区的 `roots[0]` 不等于它的 `primaryRoot`
     > - **THEN** 该 `primaryRoot` 仍以主根身份参与认领，`roots` 中其余项按附加根认领，无任何根被丢弃，且记录一条诊断
     >
     > #### Scenario: 重扫期间创建会话
     > - **WHEN** 一次根集合重建正在进行，同时某会话创建并做归属判定
     > - **THEN** 该判定使用重建前的完整索引，结果与重建前一致；MUST NOT 因重建而退回 fail-closed
   - `dsh-user-commands/spec.md`「三层优先级与会话遮蔽」追加同样两段（措辞同上，`roots`/`primaryRoot` 口径一致）。
   - `dsh-session-tool-toggle/spec.md`：**无 delta**（行为不变；在变更说明里明写「未改 spec」以免被误读为漏改）。
3. R17/R18 两份 ADR 落盘（含被否方案与否决理由，与 ④ D-4/D-5 一一对应）。

**验证**
- `pnpm --filter dsh-plugin-user-commands test` 新增用例：断言顺序为「先 update 到 A 集合 → 触发一次 update 到 B 集合（不 await，交错调用 attribute）→ attribute 在窗口内返回 A 的结果而非 null」。断言写法示例：
  ```ts
  const pending = attributor.update([workspaceB])      // 不 await
  await expect(attributor.attribute('/work/a/src')).resolves.toEqual({ workspaceRoot: '/work/a', roots: ['/work/a'] })
  await pending
  ```
- `openspec validate --all` → exit 0；`git diff --stat openspec/specs` 只含两个文件。
- 红队：把 `RootAttributor.update()` 改回「先 clear 再逐条填」的形态 → 上述用例必红。

### G7 守护与 CI（dsh:check 聚合 + 产物契约 + GitHub Actions）

1. R6/R7/R8 三脚本 + R5 workflow；AR1–AR7、B1–B6 全开。
2. R12 release 已改（G2 完成）；`AGENTS.md`/`README.md` 的 dsh:check 描述同步（G8 收口）。

**验证**
- 红队三连（每次篡改后 `pnpm dsh:check` 必须 exit 1，恢复后 exit 0）：
  1. 把 `@dsh-plugins/host-kit` 从某包 `devDependencies` 挪到 `dependencies` → AR1 红。
  2. 把某包 `build.mjs` 换回旧骨架（含 `esbuild` import）→ AR4 红。
  3. 手改 `plugins/web-ux/lib/index.js` 加一行 `require('lodash')` → B2 红（未声明外部词）。
- 本地跑 CI 等价链，逐步 exit 0：`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm dsh:check`。
- workflow 语法：`node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`（仓库已有 `yaml` 依赖，可用任一包的 `node_modules` 解析）→ 无异常。

### G8 脚手架生成 + 文档/ADR

1. R13 `scripts/gen-plugin.mjs` + P1–P3 模板。
2. R14/R15 文档；R16 索引（ADR 正文属 G6，索引属本组）。
3. `pnpm-workspace.yaml`/`package.json` 的脚本注释同步。

**验证**
- 在 `/tmp` 演练（不污染仓库）：`cd /tmp/gen-demo && ln -s <repo> repo` 不适用 → 实际做法：仓库内生成后立即删除并 `git status --porcelain` 断言干净：
  ```bash
  pnpm gen:plugin demo-host --kind host-only && pnpm install --lockfile-only=false   # 装链接
  pnpm --filter dsh-plugin-demo-host lint && pnpm --filter dsh-plugin-demo-host typecheck \
    && pnpm --filter dsh-plugin-demo-host build && pnpm --filter dsh-plugin-demo-host test
  pnpm dsh:check            # AR3/AR4/AR5 必须把新包判为合规
  rm -rf plugins/demo-host && pnpm install && git status --porcelain   # 输出为空
  ```
- 同法跑 `--kind dual`（多验 `lib/client.js` 壳与 B4/B5）。
- 模板不含字面量版本：`grep -nE '"(@deepseek-ai/[a-z-]+|typescript|vitest|oxlint|esbuild)": *"[0-9^~]' tooling/template/` → 0 命中。

### G-doc-sync（跨仓：dotfiles 仓 `agent/skills/dsh-plugin-writer/`，单独 commit）

> **执行时须加载 `writing-skills` 技能**（写技能文档的规范），并按该技能的检查清单（frontmatter 只留 `name`/`description`、路径可解析、命令可执行、无失效行号）自检。本次设计阶段按用户豁免不加载任何 writer skill（④ D-13），豁免**不延伸到本任务组**。

1. `SKILL.md`：§2 决策树补一句「三种形态都由 `pnpm gen:plugin` 生成，模板差异只剩 `--kind`」；§3 模板对照表「构建入口」列改「`build-kit` 薄入口」；§4 必改清单（7 项）重排为「生成器已代劳 vs 仍需手工」两栏；§5 生命周期第 2 步改 `pnpm gen:plugin <name> --kind …`；§6 真源表加 `tooling/build-kit/README.md`、`tooling/host-kit/README.md`、`docs/decisions/`。
2. `references/build.md`：把 `plugins/*/build.mjs:<行号>` 的 **10 处**引用改为「策略在 `tooling/build-kit/src/{host,client,css,guards}.mjs`，薄入口只声明 `hostExternals`/`cjsRequireShim`/`cssClassPrefix`」；banner/`external` 判定表保留但改指向。
3. `references/dual-client.md`：`build.mjs:121-152`/`:121-148`/`:11-15` 三处改指 `src/client.mjs` 与 `src/css.mjs`；补「CSS 防重按包+模块双维度」。
4. `references/structure.md`：三种形态的「件套清单」重写（`tsconfig.base.json` 退出清单，`build.mjs` 变 5 行）；`:85-87` 的「头注释范文」改为「薄入口范文」；新增「`catalog:`/`catalog:dsh` 不写版本字面量」一条反例。
5. `references/verify-install.md`：`pnpm dsh:check` 段改成聚合三脚本的描述；补 `pnpm gen:plugin` 的验证入口与「生成后先 `pnpm dsh:check`」。

**验证（可执行断言）**
- 失效行号清零：`cd ~/develop/dotfiles && grep -rn "build\.mjs:[0-9]" agent/skills/dsh-plugin-writer/ | wc -l` → **0**。
- 引用路径存在性：把 skill 里出现的每个 `仓库相对路径`（`plugins/…`、`tooling/…`、`scripts/…`、`docs/…`）抽出来逐个 `test -e`：
  ```bash
  cd ~/develop/dotfiles && grep -rhoE '(plugins|tooling|scripts|docs|openspec)/[A-Za-z0-9._/-]+' agent/skills/dsh-plugin-writer/ \
    | sort -u | while read -r p; do test -e "/home/xuqinqin/develop/person/dsh-plugins/$p" || echo "MISSING $p"; done
  ```
  → 输出为空。
- 命令可执行性：SKILL.md 中出现的 `pnpm <script>` 逐个 `node -e "const s=require('/home/…/dsh-plugins/package.json').scripts; if(!(name in s)) process.exit(1)"`；`gen:plugin` 必须能 `pnpm gen:plugin --help` 打印用法（G8 的 CLI 契约要求提供 `--help`，见 ③.3）。
- 单独 commit：`cd ~/develop/dotfiles && git log -1 --stat` 只含 `agent/skills/dsh-plugin-writer/` 下的文件。

---

## ⑥ 设计假设与未决项

### 6.1 假设（附验证口径）

| # | 假设 | 证据/验证 |
| --- | --- | --- |
| A1 | `catalog:` / `catalog:dsh` 规格出现在 **devDependencies** 时，profile 侧 git tag 安装不解析、不安装、不报错 | 探针 P10（pnpm 12.18.0，`git+file:` 安装 exit 0 且 manifest 原样保留）。**但 profile 侧解析器实测是 pnpm 10.34.9（P12）**，因此 G2 必须补一次真机演练：`docker exec dsh dsh plugin --profile web add "github:exponentxqq/dsh-plugins#<新 tag>&path:plugins/zcode-plan"` + `--dump-config` exit 0。若失败，回退方案 = 只保留 `catalogs.dsh` 而把 devDeps 写回字面量（catalog 的收益让位安装安全） |
| A2 | 根 `.oxlintrc.json` 会被子目录的 `oxlint` 自动发现 | 探针 P8（祖先配置生效，`lib/**` 被忽略）。**pattern 必须路径无关**（`**/lib/**`），写成 `lib/**` 会得到相反结论 |
| A3 | 非 composite + `paths`→源 能被 `tsc` 接受；composite 下会 TS6307 | 探针 P2/P3/P4（exit 0）与 P1/P5（TS6307），tsc 5.9.3 |
| A4 | esbuild 能解析 `exports` 指向 `.ts` 的包并内联 | 探针 P7（exit 0，产物出现被内联函数） |
| A5 | `pnpm -r run <script>` 对缺该脚本的包跳过且 exit 0 | 探针 P9 |
| A6 | tooling 包不参与仓库级版本同步 | `scripts/release.mjs:110-118`（只遍历 `plugins/*`）与 `scripts/check-dsh-baseline.mjs:73-81`；`version: 0.0.0` 因此恒不被改写 |
| A7 | `pnpm -r typecheck` 的拓扑顺序不构成依赖（host-kit 无 build 产物） | D-1 的选择使然：类型检查消费 TS 源，无产物顺序 |
| A8 | project-mcp `src/host/roots.ts` 的 `import type {} from '@deepseek-ai/dsh-workspace'` 在薄化后可留可删 | 薄化后该包的 `ctx.get('workspaceRegistry')` 调用点消失（进 host-kit 的结构端口），该 import 可能变为未使用；`tsc` 无 `noUnusedLocals` 故不报错。G5 收口时用 `pnpm --filter dsh-plugin-project-mcp typecheck` 判定；若删，必须在 PR 说明里写明「模块增强不再需要」 |
| A9 | profile 侧 pnpm 10.34.9 支持 catalog 语法（即便不解析 devDeps） | catalog 自 pnpm 9.5 提供；A1 的真机演练同时覆盖此点 |
| A10 | stt 的 `workspaceRegistry.list()[].path` 已是 realpath（沿用其现有 docblock 假设） | `plugins/session-tool-toggle/src/host/attribution.ts:5-9`；D-4 明确内核**不对 registry 路径二次 realpath**，故该假设不被本次改动改变 |
| A11 | 三份 stub 的 Modal 实现差异可被「并集实现」吸收，且不触发任何既有断言失败 | E26 + G3 的「用例数不减 + 组件套件全绿」；若某个包锁了精确 DOM，则该包保留本地覆盖（设计已允许） |
| A12 | DSH 0.3.0 前完成本次重构（0.3 会同时改 peer 范围与 `SUPPORTED_DSH_RELEASES`） | line-b R9；本次不处理 0.3 窗口，仅要求每步可发版 |

### 6.2 未决项（→ 同步列在「待决问题」节）

1. **stt 的第三份日志适配器**（`session-tool-toggle/src/host/index.ts:951-966`）是否并入 G5。决策 #2 的措辞是「triggers/watcher/host-io/roots 两包」，未点名 stt；技术上零风险（同一函数、前缀不同）。→ 待决 Q1。
2. **CI 是否加 `pnpm docs:check`**（决策 #6 枚举的 6 步里没有它）。它不依赖运行中的 dsh，加入可防 multi-root 的双语文档门失守；但确实超出决策枚举。→ 待决 Q2。
3. **薄再导出文件是否在 G6 收尾时物理删除**（当前设计保留以让测试零改动）。→ 待决 Q3。
4. **`tooling/host-kit` 是否也提供 `verify:all`**（现为 lint/typecheck/test 三条；根 `pnpm verify` 递归 `verify:all`，缺该脚本的包自动跳过）。→ 低影响，默认不加（待决 Q4 仅记录）。
5. **`@types/react` 统一到 `~18.3.31` 是否会让 workspace-config 之外的两包类型面变化**（探针未做，靠 `pnpm -r typecheck` 验证）。→ 若红，改为两册 catalog 或允许该键保留字面量（待决 Q5）。

---

## 待决问题（六字段之外）

| # | 问题 | 选项 | 推荐 | 影响面 |
| --- | --- | --- | --- | --- |
| **Q1** | session-tool-toggle 的第三份日志适配器（`createLog`，docblock 自认「照抄 project-mcp 的 scanLog」）是否纳入本次 G5？ | a) 纳入，改调 `host-kit` 的 `createLog`（删 ~16 行）b) 不纳入，留到下次 | **a**：同一函数、同一双通道纪律、前缀只是参数；不纳入等于明知有第三份副本还留着（与「一次性做到最优」的用户口径相悖）。但决策 #2 的文字只点名两包，故上浮确认而非自行扩大 | `plugins/session-tool-toggle/src/host/index.ts:951-966`、`src/host/types.ts` 的 `SpecLog`；产物的模块词集合不变（仍 `node:path` 等） |
| **Q2** | CI 是否在决策 #6 的 6 步之外增加 `pnpm docs:check`？ | a) 加（第 6 步，dsh:check 之前）b) 不加，严格按 6 步 | **a**：该脚本只跑 multi-root 的双语文档一致性检查，不需要运行中的 dsh，且 CI 是唯一能守住它的自动化位置；不加则「docs:check 只在人工记得时跑」 | `.github/workflows/ci.yml`；失败面 = multi-root 的双语 README/ADR 文档 |
| **Q3** | G4/G5 留下的「薄再导出文件」（pm/uc 的 attribution/roots/triggers/watcher/host-io 共 ~8 个）在 G6 收尾时是否物理删除？ | a) 保留（测试与 index.ts 的导入路径零改动 = 等价性证据）b) 删除，全仓改 import 到 `@dsh-plugins/host-kit/*` | **a**：薄文件本身承载本包的**真实差异**（pm 的 `nodeScanIo`、uc 的 `harnessHome`/`nodeCommandIo`、两边不同的 `watchTargets` 签名与阶梯），不是纯间接；删除会让「哪些是本包语义、哪些是共享内核」重新混在一起 | 两包 `src/host/*`、两份 `test/attribution.test.ts`（b 选项需改导入，等价性证据变弱） |
| **Q4** | `tooling/host-kit` / `test-kit` 是否补 `verify:all` 以便根 `pnpm verify` 覆盖它们？ | a) 不补（lint/typecheck/test 已各自进 `pnpm -r` 对应命令）b) 补，让 `pnpm verify` 也递归到 | **a**：`pnpm verify` 的语义是「递归 verify:all」，kit 的验证面就是那三条，补 `verify:all` 只是让同一批命令跑两遍 | 根 `package.json#verify`；无行为影响 |
| **Q5** | 工具链 catalog 把 `@types/react` 统一到 `~18.3.31`、`@testing-library/react` 统一到 `^16.3.3` 后，若有包类型检查变红怎么办？ | a) 统一到较新值并修类型（本次默认）b) 允许该键保留字面量（catalog 覆盖不到的例外） | **a**：catalog 的价值就在于「一个键一个值」；破例会让 catalog 变成「多数值来源」而失去断言面 | 6 包 devDeps、`pnpm -r typecheck`；若红则在 G2 内修，不扩到其他任务组 |

---

**附：与 diff-matrix §6 的对应关系（施工时用，避免漏项或越界）**

| 收敛结论条目 | 本文任务组 |
| --- | --- |
| 1 资产收敛（build-kit / tsconfig 根模板 / stubs 底座 / oxlint / scripts 模板 / 三 host-only 包产物断言） | G1、G2、G3、G7（产物断言上移，见 D-7） |
| 2 运行时语义收敛（host-kit：attribution 内核 + 策略参数化 + triggers/watcher/host-io/roots；uc 并发修复；行为对照夹具；ADR 推翻旧结论） | G4、G5、G6 |
| 3 monorepo（plugins/* 平铺 + tooling/ 顶层；devDeps 迁 catalog 与 upgrade 同批） | R1/R3、G2 |
| 4 扩展与守护（gen:plugin 模板生成；漂移守护挂 dsh:check；内部包禁入 dependencies；kit 治理断言；最小 CI） | G7、G8（守护断言 AR1/AR2/AR4/AR6 与 CI 在 G7） |
| 5 跨仓 writer skill 同步（dotfiles 单独 commit） | G-doc-sync |
| 6 维持不变（multi-root 边界、契约 holder 导出、字面量直写、git tag + 统一版本、豁免清单生成化留尾部） | §1.7 全「不动」；G3 的断言数不减；R12 保持版本同步范围；豁免清单生成化**本次不做**（属收敛结论「纳入任务尾部」，本设计不含该任务组，避免与 O8 的低收益扩张冲突） |

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：C1 不成立——本次变更为纯架构/工具链重构（构建收敛/配置模板/源码合并/CI/脚手架/skill 文档），不涉及任何页面、组件、弹窗、布局或视觉改版；三个 web 侧插件的 client 产物按设计逐字等价（ModuleLoader 壳与 banner 逐字沿用，见 ③.1），命中排除表「纯后端 / CLI / 数据迁移 / 配置 / 脚本」行。
