# multi-root 构建统一化评估

| 项 | 值 |
| --- | --- |
| 档案类型 | **评估档案（非 ADR）**：只陈述现状、不施工理由与未来通过标准，不做决策、不约束实现 |
| 状态 | 暂不施工（可接受约束） |
| 落档 | 2026-11-07（`residual-convergence` 变更 9.1） |
| 基线锚点 | [`multi-root-baseline/`](./multi-root-baseline/) —— 7 份 B6 模块词快照 |
| 相关文档 | [`ADR-0001`](../decisions/ADR-0001-shared-build-and-source-kits.md)（C2 硬边界）、[`tooling/build-kit/README.md`](../../tooling/build-kit/README.md)、[multi-root 开发工作流](../../plugins/multi-root-workspace/docs/development/plugin-development-workflow.md) |

## 现状差异清单

下表逐项对照两种构建形态：六个软插件走 `@dsh-plugins/build-kit` 薄入口，`multi-root-workspace` 走自有 `tsc + tsdown` 双面构建链。事实取当前仓库状态（2026-11-07），不含推测。

> **2026-11-07 更新注记**：下表「测试接线 / 测试执行语义」两行的 `tests/` 目录名为落档时点记录——当日随后续审核意见已统一为 `test/`（见 `openspec/changes/residual-convergence` diff-matrix §7 R9），其余事实（32 个 spec、18 行自有配置、`pool: 'forks'`、`.e2e.ts`）不变，A1「暂不并入 test-kit 工厂」的结论亦不受影响。

| 面 | 六软插件（统一构建） | multi-root-workspace（自有链） |
| --- | --- | --- |
| 构建入口 | `build.mjs` 3–5 行，`buildPlugin({ root, ... })`，只声明不可推导旋钮（`hostExternals` / `cjsRequireShim` / `cssClassPrefix`） | `build` = `pnpm run build:types && pnpm run bundle`；`build:types` 跑 `tsc -p tsconfig.host.json && tsc -p tsconfig.client.json`，`bundle` 跑 `node scripts/clean-lib.mjs && tsdown`；**无** `build.mjs` |
| 构建器与产物形态 | esbuild；宿主半 ESM + 可选浏览器半 CJS，浏览器半由 kit 的 `moduleLoaderShell` 统一包壳 | tsdown（rolldown）双配置：宿主面 12 个入口、ESM 输出 `lib/*.js`；浏览器面单入口、CJS 输出 `lib/client.js`（banner / footer 自持 `window.__ModuleLoader__.load` 壳）；共享 chunk 带内容哈希 |
| 入口数 | 宿主半 1 个（`src/index.ts`）+ 可选浏览器半 1 个 | 宿主半 12 个（index / compat / fs / sandbox / scope / registry / instructions / command / lsp / workspace-files / file-references / windows-runner）+ 浏览器半 1 个 |
| 对外导出面 | 2–3 条（`.`、可选 `./client`、`./package.json`） | 14 条（`.` + 11 个宿主子路径 + `./client` + `./package.json`） |
| 类型产物 | 仅 `workspace-config` 自持 d.ts（`build:types` + `files: lib/**/*.d.ts`）；其余包只 `tsc --noEmit` 检查、不产 d.ts | 两段 d.ts 全量：`tsconfig.host.json` 与 `tsconfig.client.json` 均 `emitDeclarationOnly` → `lib/types/**`（当前 38 个 `.d.ts`），随 `files` 发布 |
| 编译基准 | 六包一律 `extends` 根 `tsconfig.plugin.base.json`（ES2023 / `moduleResolution: bundler` / `allowImportingTsExtensions` / `noEmit` / `paths` 指向 host-kit、test-kit），包内 tsconfig 只写 `extends` + `include` | 自持三份 tsconfig（solution + host + client）：ES2024 / `NodeNext` / `rewriteRelativeImportExtensions` / `exactOptionalPropertyTypes` / `noUncheckedIndexedAccess` / `noImplicitOverride` / `rootDir` + `outDir` |
| 运行时依赖面 | `project-mcp`、`user-commands` 依赖 `yaml`，`session-tool-toggle` 依赖 `zod`，其余包零运行时依赖 | `dependencies`：`zod`、`@deepseek-ai/node-addon-system`、`koffi`（原生依赖，安装需一次 `allowBuilds` 表态）；23 条精确 peer（`>=0.2.2-rc.1 <0.3.0`）+ `peerDependenciesMeta` |
| 外部词策略 | kit 推导：`node:*` 外置 + 手声明 `hostExternals`；浏览器半固定 module-table 白名单 | 宿主面 `dependencies` / `peerDependencies` / `optionalDependencies` 全 external；浏览器面 8 个 module-table 词 external、其余全部内联 |
| 测试接线 | `test/`；三个双端软插件用 test-kit 的 `defineWebTestConfig`（3 行配置），host-only 包无配置 | `tests/`（32 个 `.spec.ts` / `.spec.tsx` / `.e2e.ts`）+ 18 行自有 `vitest.config.ts`（alias 到 `tests/stubs`、`pool: 'forks'`、30 s 超时、include 含 `.e2e.ts`） |
| 验证链 | `verify:all` = lint → typecheck → build → test | `verify:all` = lint → compat:check → typecheck → build → kernel:probe → test → smoke（compose / behavior / journey）；`docs:check` 为独立脚本（CI 与根递归脚本调用） |
| 运行时基线副本 | 无运行时副本；`engines` / peer 范围由 `scripts/dsh-baseline.mjs` 派生 | `src/compat/dsh-version.ts` 持有 `DSH_BASELINE` 单引号常量并派生 `SUPPORTED_DSH_RANGE`，运行时门 + `compat:check` 静态门双守 |
| 产物清理 | kit `clean: 'auto'`（按 `dtsOwned` 推导 `full` / `js-only`） | tsdown `clean: false` + `scripts/clean-lib.mjs`（只删上一轮 `lib/*.js` 与 `.map`，保住 `lib/types/`） |
| 门禁现状 | B1–B5 通过 | B1–B5 通过；B6 比对：7 个包与基线逐字相等（2026-11-07 实测 exit 0） |

这些不是风格差异：多入口对应文件引用 / LSP / workspace-files 等子路径消费者，双段 d.ts 对应多入口的类型消费，原生依赖对应 Windows runner 与注册表租约，精确 peer allowlist 对应运行时兼容门，三段冒烟对应安装 / 行为 / journey 验证面。[`ADR-0001`](../decisions/ADR-0001-shared-build-and-source-kits.md) 因此把 multi-root 列为 **C2 硬边界**（独立 fork），而不是「待迁移的历史遗留」；根 `AGENTS.md` 与 `README.md` 也同口径——`tsconfig.plugin.base.json` 只覆盖除 multi-root 外的六个插件。

## 不迁移理由

**收益**：维护面归一——六软插件已共用一份构建骨架，若 multi-root 也并入，构建策略理论上只剩一处，旋钮集中、产物守卫同源。

**代价与风险**（逐项对应上表）：

| 风险面 | 说明 |
| --- | --- |
| 推导假设不匹配 | build-kit 的策略推导以「单宿主入口 `src/index.ts` + 可选浏览器入口」为前提（`deriveStrategy`）；multi-root 有 12 个宿主入口、双段 d.ts。扩 kit 等于在共享包里写 per-package 分支，违反 kit 自己「per-package 语义分叉回到调用点」的判据 |
| 外部词面不可推导 | multi-root 的 external 面是 3 个运行时依赖 + 23 条精确 peer；`koffi` 与 `@deepseek-ai/node-addon-system` 是原生模块，必须保持 external，不能套用 esbuild 的内联策略。kit 目前只推导 `node:*` 与手声明 `hostExternals` |
| 产物形态与字节 | 浏览器面的 banner / footer / `define` 替换由 tsdown 自持，与 kit 的 `moduleLoaderShell` 输出形状不同；迁移必然重算产物字节，B6 基线整体失效，需要重新冻结并全链对账 |
| 测试执行语义 | multi-root 的 `tests/` 与 18 行配置（`pool: 'forks'`、30 s 超时、`.e2e.ts`）在测试接线底座（A1）里被**显式排除**：并入 test-kit 工厂会改变其测试执行语义 |
| 验证面溢出 | 三段 smoke、`kernel:probe`、`compat:check` 都不在 build-kit 职责内；迁移后这些面需要重新接线与回归 |
| 工具链回退 | 统一构建会把 multi-root 拖回 kit 的 esbuild 工具链，[`ADR-0001`](../decisions/ADR-0001-shared-build-and-source-kits.md) 已把该风险写成 C2 硬边界 |

### 工作量与风险小结

- **工作量**：一个独立变更批次的规模——kit 扩多入口 / 多段 d.ts 能力（或开特例）+ 迁移 multi-root + 逐字节对账 + 全链终检 + B6 重冻。主要成本不在代码量，而在产物字节与装配面的等价证明。
- **风险**：原生依赖的 external 语义、ModuleLoader 壳的字节形状、三段 smoke 的重接；任一处偏差都会以「运行时可用但安装面 / 装配面坏」的形式出现，现有门禁不一定能全部提前发现。
- **判断**：收益偏「维护面归一」的美学收益，缺少功能需求驱动；无功能诉求时施工属高风险、低收益。

## 迁移通过标准

未来任何一次 multi-root 构建迁移 MUST 以下列各面为验收门槛（缺一不可）；等价性锚点是 [`multi-root-baseline/`](./multi-root-baseline/)。

1. **B6 产物等价（硬门）**

   ```bash
   node scripts/check-artifacts.mjs --baseline docs/assessments/multi-root-baseline
   ```

   要求 exit 0，且 7 个包（含 multi-root）的**模块词集合逐字相等**、无 module-word diff。B6 的判据是模块词，`sha256` 只作漂移提示。
   本变更（不重建产物）额外要求 `sha256` 与快照一致，证据是 `git status --porcelain | grep -E 'plugins/[^/]+/lib/' | wc -l` 输出 `0`；未来迁移若重建产物，`sha256` 允许漂移，但必须在验收记录里写明漂移原因。
   现状实测（2026-11-07）：exit 0，7 个包全部「模块词与基线逐字相等」。

2. **产物契约 B1–B3**

   门禁模式 `node scripts/check-artifacts.mjs` exit 0：B1 声明入口在磁盘且 `files` 覆盖 `cordis.patch.yml` 与全部 `lib` JS 产物、B2 宿主模块词均为内建 / 相对块 / 已声明依赖、B3 产物不含 `@dsh-plugins/` 内部作用域词。迁移后 multi-root 的 14 条 `exports` 与 `lib/*.js` + `lib/types/**` 的 `files` 白名单 MUST 继续满足 B1。

3. **类型面（消费方 typecheck）**

   ```bash
   pnpm --filter dsh-plugin-multi-root-workspace typecheck   # host + client 两段 tsc --noEmit
   pnpm typecheck                                            # 全仓消费方
   ```

   两条均 exit 0。

4. **装配冒烟（真容器）**

   ```bash
   docker exec dsh dsh --profile web --dump-config
   ```

   要求 exit 0：插件注册行进合成配置树。现状实测（2026-11-07）：exit 0。
   注：`--dump-config` 只证明注册行；要覆盖真实 import 面需 `--dump-config-schema`（DSH 0.2.2-rc.1 下其全局 exit 1 是既有豁免，装载门禁只认 `--dump-config` exit 0，见 `AGENTS.md`）。

5. **C9 边界（回归）**

   ```bash
   git status --porcelain | grep -E 'plugins/[^/]+/lib/' | wc -l   # 期望 0
   ```

   迁移不得顺带改动其它插件的 `lib/`；B6 快照的 `host.sha256` 与本插件重建前后的关系按第 1 条口径记录。

6. **全链终检**

   ```bash
   pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check
   ```

   全 0。

以上全绿才算迁移通过；任一失败即回退到迁移前状态，不保留「部分迁移」的中间态。

## 结论

- **暂不施工**：multi-root 保留自有 `tsc + tsdown` 双面构建链；本变更只冻结 B6 基线、落这份档案，不动其任何代码与产物（C9 边界）。
- **定性**：这是**可接受的约束**，不是待还的债——[`ADR-0001`](../decisions/ADR-0001-shared-build-and-source-kits.md) C2 已把「不纳入统一构建」写成硬边界，本档案把理由与未来门槛落成可引用的形式。
- **不建 ADR**：结论是「暂不施工 + 立评估框架」，没有新决策；按 [`docs/decisions/README.md`](../decisions/README.md) 的维护纪律（未决讨论与提案不建 ADR），不为评估盖决策章。
- **迁移窗口**：multi-root 下一次功能性重构（构建面 / 发布形态 / 入口形态变化）时再评估统一化；届时以本档案「迁移通过标准」为验收面，并为真实决策新建 ADR，而不是修订本档案。
- **档案维护**：multi-root 构建链、依赖面或基线变化时同批更新本档案；基线重冻用 `node scripts/check-artifacts.mjs --write-baseline docs/assessments/multi-root-baseline`，并在「现状差异清单」记录重冻原因。
