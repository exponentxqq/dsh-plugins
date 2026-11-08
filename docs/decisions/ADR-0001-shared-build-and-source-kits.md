# ADR-0001: 共享构建与源码包的落地边界（`tooling/` 四包）

## Status

Accepted（2026-11-06）。

本文同时承载两项与旧结论的关系：

1. **推翻**归档决策「归属判定逻辑不跨插件共享」（`openspec/changes/archive/2026-10-11-split-project-mcp-plugin/design.md` 的 D4）——归属逻辑现由 `tooling/host-kit` 单点承载，替代决策的完整论证见 [ADR-0002](./ADR-0002-attribution-kernel.md)。
2. **修订**归档决策 D4「类型产物 / holder 是类型权威」（`openspec/changes/archive/2026-11-05-unify-workspace-config-entry/design.md`）——座位契约的类型权威已按 D-15 转移至 `tooling/contracts`；修订记录见本文末尾「修订记录」段。

## Date

2026-11-06

## Context

### 安装铁律：运行期解析不到任何共享包

本仓的分发模型是「profile 按 git tag 安装单个插件目录」，不是发布 npm 包：

- 安装命令形如 `dsh plugin add "github:exponentxqq/dsh-plugins#<tag>&path:plugins/<name>"`：只取该 tag 下的**一个子目录**，不会把整个 workspace 装进 profile。
- 该子目录的 `devDependencies` 不会被安装，也不会被解析；`workspace:*`、`catalog:` 这类仓内规格只存在于被安装包的 manifest 文本里。归档 D12 的 `workspace:*` 探针与本次 P10 的 `catalog:` 探针给出同一结论（P10：`git+file:` 标签安装 exit 0，装出的 manifest 原样保留 `"esbuild": "catalog:"`，不解析、不安装）。
- `link:` 安装同样不装依赖。`@dsh-plugins/*` 不发布到 registry，因此**任何共享包都不能出现在 `dependencies` 里**：那会在别人的 profile 侧以「解析不到包」当场失败，而本地 workspace 内永远测不出来（AR1 因此把这条纪律机器化）。

由此得到一条硬约束：**共享只能发生在构建期与类型期**。运行期产物必须自包含，profile 只加载 `lib/*.js`。

### 旧结论与它带来的漂移

旧架构的结论是「插件互不依赖、各自持有实现」：

- `plugins/project-mcp` 与 `plugins/user-commands` 各有一份 `src/host/attribution.ts`（同一套上溯规则、各自约百行实现），归档 D4 明文记录「归属判定逻辑不跨插件共享」；
- 六个软插件的 `build.mjs` 是六份同构的 esbuild 骨架，tsconfig / oxlint / catalog / 测试夹具也各持一份；
- `multi-root-workspace` 是独立 fork，tsc + tsdown、精确 peer/allowlist，**不纳入**本次统一构建（C2 硬边界）。

这份「独立」并没有换来等价的可靠性：归属规则的实现分叉最终以两个真实缺陷暴露——user-commands 的 `update()` 在重建窗口内先 `clear()` 再逐条填，in-flight 的 `attribute()` 会看到空表/半表（详见 [ADR-0002](./ADR-0002-attribution-kernel.md)）；project-mcp 的 `roots.slice(1)` 假设 `roots[0]` 就是主根，契约被违反时静默丢掉一个真实根。同构实现越多的位置，修复越难同步。

### 机制探针：唯一可行的共享形态

要同时满足「esbuild 构建期直接内联 TS 源」与「tsc 类型解析」，探针给出唯一可行组合：

| 探针 | 形态 | 结果 |
| --- | --- | --- |
| P1 | `composite` 工程 import 跨包 `.ts` 源 | **TS6307 硬失败**：`composite` 与「直接消费 `.ts` 源」不可共存 |
| P5 | `composite` + 共享包先产 `.d.ts` 再按普通包引入 | exit 0；旧路线仍可走，但要求「先 build 共享包、后 typecheck 插件」的顺序耦合 |
| P6 | package `exports` 指向 `.ts`，但不写 `paths` | **TS2307**：tsc 不认 exports 里的 `.ts` |
| P2 / P3 | 非 composite + 根 tsconfig `paths` 映射到 `.ts` 源 | exit 0 |
| P7 | esbuild 解析 package `exports` → `.ts` 并打包 | exit 0，产物中出现被内联的函数体 |
| P10 | `catalog:` / `workspace:*` 规格的 devDep 在 git 安装下的行为 | 安装成功，规格原样保留，不解析不安装 |

结论：**包 `exports` → `src/*.ts` + 根 tsconfig `paths` 双轨解析**可行，前提是六个软插件去掉 `composite`。这正是本决策的施工形态。

## Decision

### 1. `tooling/` 四个包的职责边界

| 包 | 形态 | 依赖面 | 边界 |
| --- | --- | --- | --- |
| `@dsh-plugins/build-kit` | 构建期纯 `.mjs` | 只有 `esbuild` | 六份 `build.mjs` 的骨架：宿主半、浏览器半、CSS modules、产物守卫；策略从包事实推导，薄入口只留不可推导的旋钮 |
| `@dsh-plugins/host-kit` | 运行期 TS 源 | **零运行时依赖**，零 `@deepseek-ai/*` import | 归属内核、目录监听、触发器、根枚举、日志适配、真实 `node:fs` seam；以结构性端口（`RealpathPort` / `WatchIo` / `TriggerContext` / `RootEnumeratorContext` / `LogSink`）隔离宿主 |
| `@dsh-plugins/test-kit` | 测试夹具 + 测试接线纯 TS | `react` / `react-dom`（stub 运行时）；`vitest` 仅 devDep（自测用），不是运行时依赖 | `ui-primitives` 并集底座 + `locale-parity` 纯函数 + `./vitest` 测试接线原语（`defineWebTestConfig({ root })` 返回裸对象、单 import、不包 `defineConfig`）；只放无分支的夹具与接线原语，包行为断言留在包内 |
| `@dsh-plugins/contracts` | 纯类型包 | `dependencies: {}`，仅工具链 devDeps | 座位契约的类型权威（D-15）：Seat 字面量、owner 份额、`SlotMap` 条目形状、order 字面量类型；零运行时、零 DSH 依赖 |

四包一律 `private: true`、`version: 0.0.0`、无 `files`、不发布、不进发布版本同步范围（`release.mjs` 只遍历 `plugins/*`）。`tooling/template` 是模板素材、不是包（清单文件叫 `package.json.tmpl`），因而不进 workspace；`pnpm-workspace.yaml` 用显式四行而不是 `tooling/*`，让「谁是包」可断言（AR7）。

### 2. 消费形态：双轨解析 + 去 composite

- 共享包的 `exports` 同时把 `types` 与 `default` 指向自身 `src/*.ts`；
- 消费方 `tsc` 走根 `tsconfig.plugin.base.json` 的 `paths`（`host-kit`、`host-kit/*`、`test-kit/*`）与包 `exports` 的类型面；esbuild 走 package `exports`，在构建期把 TS 源内联进本包 `lib/`；
- 六个软插件删除 `composite`，`typecheck` 统一为 `tsc -p tsconfig.host.json --pretty false`（根基准的 `noEmit: true` 负责不落盘），双端包再跑一遍 client 半。`composite` 在本仓的唯一用途是 `tsc -b` 的增量缓存，而 `.tsbuildinfo` 本来就被 gitignore；
- 共享包的修改不要求「先 build 共享包、后 typecheck 插件」：`tsc` 与 esbuild 都直接读源，CI 的 typecheck 仍可排在 build 之前。

### 3. 单装安全（MUST）

- `@dsh-plugins/*` **MUST** 只出现在 `devDependencies`，值 `workspace:*`；MUST NOT 出现在 `dependencies`。结构门禁 AR1（G7 全开）对此断言。
- 构建产物 **MUST NOT** 含 `@dsh-plugins/` 模块词：共享源码必须被 esbuild 完全内联。`build-kit` 的 `assertNoInternalWord` 在落盘前拦截，仓级产物门禁 B3 对 7 个包复核。
- 产物 **MUST** 自包含：模块词集合必须被「内建 / 相对块 / 外部词」覆盖（B1/B2、包内 `bundle.test.ts`）。宿主外置词只有 `node:*` 与显式声明的 `hostExternals`（如 `@deepseek-ai/dsh-llm`），内部包永远不是合法外置词。
- 依赖版本用 catalog（默认册 = 工具链，命名册 `dsh` = DSH 族），但 catalog 只影响**构建期**安装；profile 侧不解析 catalog，也不装 devDeps。

### 4. 版本与发布面

四个 tooling 包是「仓内构建/类型资产」，不是产品单元：版本恒为 `0.0.0`、不进统一 tag 的同步范围、不生成 `lib/` 产物。仓库的统一版本契约仍然只覆盖 `plugins/*` 的七个包（含 multi-root-workspace 的既有发布形态）。

### 5. D-15：座位契约类型权威转移至 `contracts`

见文末「修订记录」段。要点：holder 与三贡献方全部 `import type` 直连 `@dsh-plugins/contracts`，holder 的 `src/client/contract.ts` 退化为文档指针 + 过渡 re-export；各消费方仍各持一行本地 `declare module`（TS2664 约束，见 R15①）；holder 继续产出 `lib/types/**`（其自身 `exports['./client'].types` 的产物义务不变），但它不再拥有座位契约的类型定义。

## Alternatives Considered

| 方案 | 否决理由 |
| --- | --- |
| 根级 `scripts/build-kit`（把构建策略放成仓库脚本，插件用相对路径 import） | `scripts/` 是仓库机制脚本，不是 workspace 包：没有包身份、`exports` 与类型面，消费方要写 `../../scripts/...` 的相对路径；`gen:plugin` 生成的模板会被绑死到仓内深度；AR1/AR2 的「内部包治理」无法覆盖；单测也只能靠相对导入。F1 的 B 线立场在复算后落败 |
| `plugins/_shared`（在插件目录里放一个共享目录/伪包） | `plugins/*` 是发布与版本契约的域：它会被 `plugins/*` glob 先当成插件候选，需要额外的排除规则；会进入 `release.mjs` 的版本同步遍历与 AR3/AR7 的插件断言；语义上还暗示它是一个可安装的 bundle。共享资产属于 `tooling/` 而不是产品域 |
| JSON 体积内联（把共享源码/共享面序列化成 JSON 或生成副本，再随构建内联） | 被重复的是**行为逻辑**，不是数据；JSON 无法承载类型、无法被 tsc 检查、IDE 不能跳转，且引入「源 → 生成物 → 产物」的第三处事实源与一次生成步骤。体积不是本决策的优化目标，可维护性才是 |
| 不发共享包，维持每包自持（现状） | 漂移已经发生：uc 的并发缺陷与 pm 的 `roots[0]` 假设都是同一规则的多份实现各自演化；修一次要改 N 处，且「改了 A 忘了 B」没有任何机器能发现。归档 D4「不跨插件共享」因此被推翻（multi-root 仍按 C2 排除在外） |
| 共享包先 `tsc` 产 `.d.ts`，消费方按普通包引入（P5 路线） | 需要「先 build 共享包 → 再 typecheck 插件」的顺序耦合，而 CI 的步骤序是 typecheck 在 build 之前，干净树上必红；还多一个产物目录与 gitignore 面 |
| 用 project references 让引用项目 emit `.d.ts` | 教科书正解，但让「typecheck 自己会产出文件」成为隐式副作用，引入新的 outDir 产物面，与本仓「配置即事实」的风格冲突 |
| 把 `multi-root-workspace` 也纳入统一构建 | C2 硬边界：它是独立 fork，tsc + tsdown、精确 peer/allowlist、自有 ADR 体系；统一构建会把它拖回工具链旧版本并破坏它的构建链 |
| 把内部包写进 `dependencies`（让 profile 正常装依赖） | `@dsh-plugins/*` 不在 registry；`workspace:*` 在 profile 侧无法解析。本地 workspace 内可解析只是假象，失败发生在别人的机器上（D-12 / AR1 的反例） |

## Consequences

- **正面**：六个软插件的构建、类型、lint、测试与契约类型各有单一事实源；新增插件 = 模板 + 少量旋钮；修复共享规则一次生效；产物的模块词集合仍可与迁移前基线逐字比对（G0 基线 + B6），因此「收敛」没有被「静默重写产物」污染。
- **正面**：单装模型不变——profile 仍只拿到自包含的 `lib/*.js`；共享源码只存在于构建期与仓库内。
- **代价（爆炸半径）**：`build-kit` / `host-kit` 的一个 bug 会同时打击六个或三个包。缓解：kit 自带单测进入 `pnpm -r test`，仓级产物基线（`check-artifacts.mjs --baseline`）在每组收口比对；共享包里**禁止**出现 per-package 分支（判据见 `tooling/build-kit/README.md`「什么不该进 kit」）。
- **代价（环境前提）**：构建与类型检查依赖 workspace 软链，干净检出必须先 `pnpm install`；直接调用 `buildPlugin` 与 `pnpm --filter <包> build` 行为一致（`absWorkingDir` 钉在包目录）。
- **代价（版本差异）**：探针 pnpm 版本与 profile 侧实际版本不一定相同；G2 的真机 tag 安装演练与 `--dump-config` 是这条结论的现场证据，版本升级时需重跑。
- **边界**：本决策不改变 `multi-root-workspace` 的任何构建/发布形态，也不改变七个插件的安装矩阵与统一 tag。

## 修订记录

### D-15 对归档 D4 的修订（2026-11-06）

**被修订的旧结论**：`openspec/changes/archive/2026-11-05-unify-workspace-config-entry/design.md` 的 D4「类型产物」——「holder 必须 `tsc --emitDeclarationOnly` 发 `lib/types/**` d.ts（`exports['./client'].types` 指向）；被否：照 web-ux 纯 esbuild 不产 d.ts——贡献方 `import type` 退化为 any，devDep 决策落空」。该结论把 **holder（workspace-config）** 同时当作「类型定义的权威」与「d.ts 产物的提供者」。

**修订后的结论（D-15）**：

| 面向 | 旧结论 | 新结论 |
| --- | --- | --- |
| 座位契约类型权威 | holder 的 `src/client/contract.ts` | `tooling/contracts/src/index.ts`（`@dsh-plugins/contracts`）：Seat 字面量、owner 份额、`SlotMap` 条目形状、order 字面量类型 |
| 贡献方类型来源 | 从 holder `import type` + devDep holder | 从 `@dsh-plugins/contracts` `import type` + devDep contracts；不再依赖 holder 的类型面 |
| holder 的 `contract.ts` | 权威定义 + 运行时值 | 文档指针 + 内部过渡 re-export + 本地运行时常量；不再是权威 |
| holder 的 d.ts 产物 | 因「类型权威」而必须 | 仍必须产出 `lib/types/**`（自身 `exports['./client'].types` 与 `dtsOwned` 推导的产物义务），但**产物不再是座位契约的权威来源** |
| 贡献方 `SlotMap` 增补 | 各包本地 `declare module` | 不变：各包本地一行 `declare module`，条目形状引用 contracts 的 `WorkspaceConfigSectionSlot` |
| 运行时加载边 | 无 | 无（`import type` 编译期擦除；贡献方 bundle 不含 holder / contracts 词） |
| `dsh.client.inject` | 不含 holder | 不含 holder，也不含 contracts（类型依赖不是加载依赖） |

**为什么 `declare module` 仍留在消费方（R15①）**：模块增补要求目标模块能从**声明文件所在包**解析（否则 TS2664）；而 contracts 按 AR2 是零 `@deepseek-ai/*` 依赖的纯类型包，不能自己安装 UI slots 包。于是落地形态是「contracts 定条目形状权威 + holder 与三贡献方各一行本地 `declare module` 引用该形状」——权威单点在形状/座位名/owner 份额/order 层面达成，AR2 与「缺 holder 自动降级」的安装矩阵语义都不动。

**未被修订的部分**：D2（贡献方仅 `import type`）、D3（座位字面量各包自持、不进 `dsh.client.inject`）、`plugins/multi-root-workspace/docs/decisions/ADR-0013-workspace-config-section-mount.md` 决策 3（holder 仍是编译期类型依赖）、以及归档 D4 中「纯 esbuild 不产 d.ts」仍被否决的判断——holder 的 d.ts 产物义务保留，只是其**权威地位**被转移。spec 层无需 delta：`dsh-workspace-config` 的「降级与安装矩阵」requirement 中「贡献方对持有者的依赖仅限类型」在转移后更成立。

**落地证据**：`tooling/contracts/src/index.ts` 模块头、holder `plugins/workspace-config/src/client/contract.ts` 的文档指针、四包 `import type` 直连（`grep -rn "from '@dsh-plugins/contracts'" plugins/*/src` 命中 holder + 三贡献方）、`pnpm -r typecheck` 与 `pnpm -r test` 全绿、贡献方产物模块词集合与迁移前逐字相等。

### 修订记录：测试接线底座（2026-11-07，residual-convergence）

**被修订的旧结论**：本文决策 1 的 test-kit 行——「只放无分支的夹具，包行为断言留在包内，且不装 vitest」。两处需要修订：其一，职责被限定为「夹具」，而三个双端插件各自持有的 `vitest.config.ts`（jsdom 环境 + `resolve.alias` 指向 stub + `esbuild.jsx` 接缝 + include 覆盖）是逐字同构的第二处复制-漂移区——形态与六份 `build.mjs` 完全一致，只是发生在测试期；其二，「不装 vitest」是 prose 层面的禁令：AR2 的 devDep 白名单本就含 `vitest`（`scripts/check-architecture.mjs:167-173`），机器从未区分「vitest 作为运行时依赖」与「vitest 作为自测工具链」，这条禁令因此从未被任何门禁守过。

**修订后的结论（D1 / D13）**：

| 面向 | 旧结论 | 新结论 |
| --- | --- | --- |
| test-kit 职责 | 只放无分支的夹具（`ui-primitives` 并集 + `locale-parity` 纯函数） | 夹具底座 **+ 测试接线原语**：`/vitest` 子路径导出工厂 `defineWebTestConfig({ root })` 与 `WEB_TEST_INCLUDE` 常量 |
| 接线形态（D1） | 各包自持完整 `vitest.config.ts`（jsdom / alias / jsx 接缝三份同构） | 消费方收敛为 4 行薄声明：单 import 工厂，`export default defineWebTestConfig({ root: import.meta.dirname })`；工厂返回**裸对象**，内部不包 `defineConfig`（vitest 接受对象默认导出） |
| vitest 依赖口径（D13） | 「不装 vitest」（无例外） | vitest **不作为 test-kit 的运行时依赖**，仅允许进 `devDependencies`（自测用）；test-kit 自测形态（devDep vitest + 自持 config）另批落地（本变更组 9），本节只记录口径修正 |
| 断言边界 | 包行为断言留在包内 | **不变**：工厂与夹具都不上移任何包的行为断言；产物 / 结构契约断言落 `@dsh-plugins/build-kit` 的断言壳（另线），同样不进 test-kit |

**被否方案**：

- **保留 `defineConfig` 包裹**（`defineConfig(defineWebTestConfig({ … }))`）：多一条 `vitest/config` import，AR8 的「唯一 import 源」必须为它开例外；而 `vitest.config.ts` 不在任何 tsconfig 的 include 内，类型提示收益约等于 0。真正的代价在机制层面：一旦开了这个例外，「唯一 import 源」就从可逐字断言的机器事实退化为注释约定——下一个包照抄第三行 import（例如直连 stub）不会撞任何门禁。
- **断言壳一并进 test-kit**（把包内 `bundle.test` 的结构层断言也上移）：撞「包行为断言留在包内」这条既有边界，且断言壳需要词法器，会把 `scripts/lib` 反向拉进 test-kit——与控制缺口的方向相反。
- **test-kit 自测改用 `node:test`**：同一个仓里维护两套测试运行器，收益只是绕开一句 prose，代价是自测写法的第二套模板。

**为什么边界没有松**：工厂只承载「三份 config 逐字相同的那几行」——环境、alias 目标、jsx 接缝、include 覆盖判据与 stub 位置；凡是依赖某个包契约字面量、某个包产物形态或「这条断言该在哪」的判断，仍留在该包自己的测试里。`/vitest` 是**接线**而不是**断言**，与 test-kit 既有章程（只放无分支夹具）是同一判据的延伸。D13 的口径修正也不放宽运行时面：`react` / `react-dom` 仍是它唯一的运行时依赖，vitest 只在自测时存在。

**落地证据（本变更组落点）**：`tooling/test-kit/src/vitest.ts`（`defineWebTestConfig` / `WEB_TEST_INCLUDE`）与 `tooling/test-kit/package.json` 的 `exports['./vitest']`；三个双端包的 `vitest.config.ts` 收敛为 3 物理行薄声明（单 import，≤6 行断言通过），`pnpm -r test` 实测全绿（wsc 55 / web-ux 579 / stt 1086，jsdom 组件套件经 alias 接缝真实跑通）；AR8 四条规则（存在性 / 薄入口 ≤6 行单 import / stub 存在 / include 覆盖双面）把「唯一 import 源」钉成机器事实（六软插件判定通过，负向探针可红可恢复）；alias 接缝承重已由负向探针独立证明（指向换掉即 `Cannot find module`）；实测附注：当前 vitest/vite 组合下 automatic JSX 不依赖工厂的 `esbuild.jsx` 行（保留该行作接口契约与兜底，详见本变更 diff-matrix §7 R8）；`vitest` 只落 test-kit 的 `devDependencies`，运行时依赖仍为 `react` / `react-dom`（AR2 复核）。验收命令：`pnpm -r test`、`pnpm dsh:check`。

## Related Documents

- [ADR-0002：归属内核（`#3` 裁定与原子索引纪律）](./ADR-0002-attribution-kernel.md)
- [仓级 ADR 索引](./README.md)（两套编号与引用路径纪律）
- [optimize-architecture 代码蓝图](../../openspec/changes/archive/2026-11-07-optimize-architecture/code-design.md)：D-1（消费形态）、D-2/D-3（build-kit）、D-9（workspace 显式四行）、D-12（内部包只进 devDeps）、D-15（contracts）
- [build-kit README](../../tooling/build-kit/README.md)、[host-kit README](../../tooling/host-kit/README.md)、[test-kit README](../../tooling/test-kit/README.md)、[contracts 模块头](../../tooling/contracts/src/index.ts)
- 归档变更：`openspec/changes/archive/2026-10-11-split-project-mcp-plugin/design.md`（D4，已推翻）、`openspec/changes/archive/2026-11-05-unify-workspace-config-entry/design.md`（D4，已被本 ADR 修订）
- multi-root-workspace 的同类旧结论：`plugins/multi-root-workspace/docs/decisions/ADR-0002-upstream-coupling-policy.md`（只约束 multi-root 自身，本 ADR 不改其结论）
