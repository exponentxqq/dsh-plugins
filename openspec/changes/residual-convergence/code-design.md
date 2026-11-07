# residual-convergence · 代码设计线（阶段 1.7）——代码级蓝图

> 定位：本文件只回答四件事——**触达哪些文件、怎么改、接口与数据形状、为什么这么定**。需求级价值与风险见 `line-a.md` / `line-b.md`，已定结论见 `diff-matrix.md`；本文不推翻其中任何一条，只补代码级事实与实现形态。
> 事实基线：HEAD `e48b476`，工作区干净。全部 `file:line` 为 2026-11-07 该 HEAD 的只读实测锚点。
> 硬约束来源：`dsh-plugin-writer` skill（已加载：分层方向 build-kit / host-kit / test-kit / contracts、复用优先、任务粒度）、`docs/decisions/ADR-0001`、AR1–AR7 门禁、`openspec/specs/`。

## 0. 事实基线（实测，供下文引用）

| # | 事实 | 证据 |
|---|---|---|
| F1 | `openspec validate --all --strict` **exit 1**，恰 2 条 WARNING | `spec/dsh-project-mcp` requirements[5]（`工作区可见性隔离`）、`spec/dsh-session-tool-toggle` requirements[5]（`Web 配置界面`）；Totals 11 passed / 2 failed |
| F2 | smoke 失真口径 **4 处**（不是 3 处） | `README.md:48`、`README.md:80`、`AGENTS.md:67`、`.github/workflows/ci.yml:3-4` |
| F3 | 测试文件磁盘数 / tsconfig 覆盖数 | stt 23（20 ts + 3 tsx）/ 23；web-ux 19（14+5）/ 19；wsc 6（3+3）/ **0** |
| F4 | manifest 形态四类 | multi-root 14 键；stt / web-ux / wsc 4 键（`.`、`./client`、`./src/*`、`./package.json`）；project-mcp 3 键（`.`、`./src/*`、`./package.json`）；user-commands / zcode-plan 仅 `.` |
| F5 | `icon` 字段 + 文件仅在 4 包 | project-mcp / stt / user-commands / web-ux；wsc / zcode-plan / multi-root 无 |
| F6 | `./package.json` **有外部消费者**（DSH 插件元数据） | `@deepseek-ai/dsh-app-boot/lib/index.js:3008` 用 Node 解析器解析 `` `${specifier}/package.json` `` |
| F7 | `./src/*` 仓内零消费者、DSH 侧零解析路径 | `git log -S'./src/*'` 首现提交 `0c68025`（「迁入 dotfiles/dsh/plugins 三个插件」），无理由记录 |
| F8 | attribution 5 份 608 行；host-kit 371 行内核套件 | project-mcp 179+145、user-commands 111+91+82 |
| F9 | 三份 vitest.config 28/32/30 行同形；模板 12 行且**无 alias、无 stub 文件**；multi-root 18 行（`pool:'forks'` + 30s + `tests/`） | `plugins/*/vitest.config.ts` |
| F10 | 模板 tsconfig 与真实包第二处形态分叉 | 模板 host `include:["src/index.ts","test/**/*.ts"]`、client `include:["src/client"]`（`templates/default/tsconfig.*.json:3`）vs 真实 dual 三包 client 均 include 测试 |
| F11 | `assertSelfContained` 是 build-kit 死导出 | 全仓仅 `guards.mjs` / `index.mjs:223` / `guards.test.mjs` / README 自引用；README 声称的「bundle.test / check-artifacts 调用」不存在 |
| F12 | 七个插件 importer 全在 lockfile；根 importer 为空对象 | `pnpm-lock.yaml:205`（`.: {}`）与 `:207` 起 7 个 `plugins/*` |

### 0.1 对上游事实的两处补强（不构成重开收敛）

1. **口径副本是 4 处**（F2）。收敛留痕 C2 只列了 `README.md:80`；同文件 `:48` 还有一处同义句。修法不变：同批同句、四处同改。
2. **`./package.json` 判为正当差异，不是死导出**（F6）。U6 的「疑似死导出」在审计后只对 `./src/*` 成立；删 `./package.json` 会让 DSH 读不到插件 manifest，插件标题 / 描述 / 图标**静默丢失**。结论走向不变（先审计后收敛），只是审计结果反过来要求**给缺它的三包补上**（真实包向模板收敛的反向：模板也补）。

### 0.2 清单未覆盖的优化点（增量，判定依据均为实测）

| # | 优化点 | 判定依据 | 落点 |
|---|---|---|---|
| N8 | **模板的测试类型检查形态与真实包分叉，且模板 dual 的 client 工程不 include 任何测试** → 每个新生成的 dual 包写第一个组件测试时，该测试永不被 tsc 检查（N3 的同病，但发生在每个新包上） | F10；对照 `plugins/session-tool-toggle/tsconfig.client.json:6-13`（`test/**/*.test.tsx` 在 include 内） | 组 3（模板按 kind 分化时同批修）+ 组 6（盘点收口） |
| N9 | **AR2 的 `pending` 分支是死代码**：四个 tooling 包已全部建包，`pending` 恒空，「尚未建包」提示永不打印 | `scripts/check-architecture.mjs:144-162`（四键）vs `:784-790`（pending 只可能为空） | 组 6 收尾（可选清理，零语义变化） |
| N10 | **`openspec` CLI 是隐式全局依赖**：不在任何 manifest，contributor 与 CI 都必须另装（N1 的真实成本） | `which openspec` → `/usr/local/bin/openspec`（全局 `@fission-ai/openspec@1.16.0`）；根 `package.json` 无该依赖 | 组 1（根 devDep + `spec:check` 脚本） |
| N11 | **`icon` / `files` 一致性无门禁**：`icon` 存在但文件不在 `files` 时，DSH 元数据读取会**抛错**（不只是丢图标） | `plugins/project-mcp/package.json:5` + `:26-31`；DSH `iconOf` 要求 manifest icon 指向包内真实文件（`dsh-app-boot/lib/index.js:2871-2896`） | 组 5（并入 `gen-plugin --check` 断言） |

判定口径：N8 / N9 / N11 是「已发生的复制-漂移或机器可判的死代码」，属于本清单「消灭最后复制-漂移区」的同轴延伸；N10 是 N1 的实施前提，不是新方向。

---

## ① 触达面清单

> 「所属仓」：**根仓** / **插件子包 `<名>`** / **tooling 包 `<kit>`** / **模板** / **scripts** / **CI** / **openspec** / **docs（根仓文档）**。

### 1.1 根仓与 CI

| 文件 | 所属仓 | 组 | 动作 | 关键改动点 |
|---|---|---|---|---|
| `package.json` | 根仓 | 1 | 改 | 新增 `devDependencies['@fission-ai/openspec']`（当前安装版本固定）；新增脚本 `"spec:check": "openspec validate --all --strict"` |
| `pnpm-lock.yaml` | 根仓 | 1 | 重生成 | 根 importer 从 `.: {}` 变为含 devDep；7 个插件 importer 不变 |
| `.github/workflows/ci.yml` | CI | 1 / 5 | 改 | ① 头注释改口径（smoke 不入 CI 的真实理由）+ 描述两个作业；② `verify` 作业加一步 `pnpm spec:check`；③ 新增 `scaffold` 作业（gen 双 kind → install → 四链 → dsh:check） |
| `README.md` | 根仓 | 1 / 3 / 5 / 6 | 改 | `:48`、`:80` smoke 句同改；`:21` 检查脚本描述 AR1–AR7→AR1–AR8；`:39` dsh:check 同改；目录结构补 `docs/assessments/`；新增 `pnpm spec:check`、`pnpm gen:plugin --check` |
| `AGENTS.md` | 根仓 | 1 / 3 / 5 / 6 | 改 | `:67` smoke 句；`:18` / `:65` AR 范围；`:41`「测试」条补薄入口/AR8 约定；`:43` 补 `--check`；`docs/decisions` 段补评估档案指针 |
| `docs/decisions/ADR-0001-shared-build-and-source-kits.md` | docs | 3 | 改 | `:61` test-kit 行扩为「夹具 + 测试接线原语、vitest 仅 devDep」；`:110` 起「修订记录」新增一节（含被否方案） |
| `docs/decisions/README.md` | docs | 3 / 6 | 改 | ADR-0001 行标注「含 2026-11-07 测试接线底座修订」；新增「评估档案（非 ADR）」小节指向 `docs/assessments/` |
| `docs/assessments/README.md` | docs | 6 | **新建** | 评估档案索引（与 ADR 区分：只陈述评估，不做决策） |
| `docs/assessments/multi-root-build-unification.md` | docs | 6 | **新建** | B1 专项评估：差异清单 / 通过标准 / 工作量 / 结论（不迁移）；链 B6 基线目录 |
| `docs/assessments/multi-root-baseline/*.json` | docs | 0 / 6 | **新建** | 7 份 B6 快照（`check-artifacts.mjs --write-baseline` 产出，随仓库提交） |

### 1.2 tooling 包

| 文件 | 所属仓 | 组 | 动作 | 关键改动点 |
|---|---|---|---|---|
| `tooling/test-kit/package.json` | tooling/test-kit | 3 / 6 | 改 | `exports` 新增 `"./vitest": "./src/vitest.ts"`；`scripts` 新增 `"test": "vitest run"`；`devDependencies` 新增 `vitest`（AR2 白名单已含） |
| `tooling/test-kit/src/vitest.ts` | tooling/test-kit | 3 | **新建** | `defineWebTestConfig({ root })` 纯对象工厂 + `WEB_TEST_INCLUDE` 常量；**不 import vitest、不 import scripts/** |
| `tooling/test-kit/test/locale-parity.test.ts` | tooling/test-kit | 6 | **新建** | N4 最小自测：键集/空文案/必读键/占位符四类 issue |
| `tooling/test-kit/test/ui-primitives.test.tsx` | tooling/test-kit | 6 | **新建** | 导出面 + `renderToStaticMarkup` 形状（只用 react / react-dom，不引 testing-library） |
| `tooling/test-kit/vitest.config.ts` | tooling/test-kit | 6 | **新建** | 纯对象：`esbuild.jsx:'automatic'` + `include:['test/**/*.test.ts','test/**/*.test.tsx']` + node 环境（不能用自家工厂：工厂的 alias 指向消费包的 stub 目录） |
| `tooling/test-kit/tsconfig.json` | tooling/test-kit | 6 | 改 | include 补 `test/**/*.ts(x)`，让自测进类型检查 |
| `tooling/test-kit/README.md` | tooling/test-kit | 3 / 6 | 改 | 章程修订（接线原语、`./vitest` 用法、vitest 仅 devDep）；「自测」段改实跑命令 |
| `tooling/build-kit/package.json` | tooling/build-kit | 4 | 改 | `exports` 新增 `"./artifact-contract": { types: "./src/artifact-contract.d.mts", default: "./src/artifact-contract.mjs" }` |
| `tooling/build-kit/src/artifact-contract.mjs` | tooling/build-kit | 4 | **新建** | 产物契约的无分支原语：`loaderShellIssues` / `requireSurfaceIssues` / `selfContainmentIssues` / `hostSelfContainmentIssues`（全部返回 issue 列表） |
| `tooling/build-kit/src/artifact-contract.d.mts` | tooling/build-kit | 4 | **新建** | 手写声明（仿 `scripts/lib/artifacts.d.mts` 先例） |
| `tooling/build-kit/src/guards.mjs` | tooling/build-kit | 4 | 改 | 删除 `assertSelfContained` 及其 `isBuiltin` 依赖链；文件头 `@link` 改写；判据迁入 artifact-contract |
| `tooling/build-kit/src/index.mjs` | tooling/build-kit | 4 | 改 | `:223` 的 re-export 去掉 `assertSelfContained`（不留第三种说法） |
| `tooling/build-kit/test/guards.test.mjs` | tooling/build-kit | 4 | 改 | 删除「`assertSelfContained`：自包含判据」整段（6 用例迁往新文件） |
| `tooling/build-kit/test/artifact-contract.test.mjs` | tooling/build-kit | 4 | **新建** | 正面 + 负面：壳缺 factory / id 错 / 词集多一少一 / `node:` 泄漏 / 未 external 包 / 文案片段不误判 |
| `tooling/build-kit/README.md` | tooling/build-kit | 4 / 6 | 改 | 守卫表与 `:107-111` 消费者段改为「artifact-contract 由三份 bundle.test 消费」；「什么不该进 kit」的 multi-root 行链评估档案 |

### 1.3 插件子包

| 文件 | 所属仓 | 组 | 动作 | 关键改动点 |
|---|---|---|---|---|
| `plugins/session-tool-toggle/vitest.config.ts` | 插件子包 stt | 3 | 改（28→4 行） | 单 import 工厂 + `export default defineWebTestConfig({ root: import.meta.dirname })`；注释知识迁 test-kit |
| `plugins/session-tool-toggle/test/bundle.test.ts` | 插件子包 stt | 4 | 改（160→约 95 行） | 壳 / 词表 / 宿主自包含三组改用契约函数；保留 INLINED/ABSENT 标记与 `cssModuleCount()` |
| `plugins/session-tool-toggle/package.json` | 插件子包 stt | 5 | 改 | 删 `exports["./src/*"]`（`:18`） |
| `plugins/web-ux/vitest.config.ts` | 插件子包 web-ux | 3 | 改（32→4 行） | 同上 |
| `plugins/web-ux/test/bundle.test.ts` | 插件子包 web-ux | 4 | 改（151→约 105 行） | 同上；保留 4 个注入器断言、包声明段（inject / 无 sidebar / contracts devDep） |
| `plugins/web-ux/package.json` | 插件子包 web-ux | 5 | 改 | 删 `exports["./src/*"]`（`:18`） |
| `plugins/workspace-config/vitest.config.ts` | 插件子包 wsc | 3 | 改（30→4 行） | 同上 |
| `plugins/workspace-config/test/bundle.test.ts` | 插件子包 wsc | 4 | 改（162→约 120 行） | 同上；保留座位字面量 ≥2、注入器恰 1、`exports['./client'].types`、`SOFT_DSH_RANGE` |
| `plugins/workspace-config/tsconfig.host.json` | 插件子包 wsc | 1 | 改 | include 补 `test/**/*.test.ts`、`test/**/*.test.tsx`、`test/stubs/**/*.tsx`（**不加进 client 工程**，见 D7） |
| `plugins/workspace-config/package.json` | 插件子包 wsc | 5 | 改 | 删 `exports["./src/*"]`（`:18`）；`files` 删 `"README.md"`（`:43`，npm 自动包含） |
| `plugins/project-mcp/test/attribution.test.ts` | 插件子包 project-mcp | 2 | **删除**（179 行 / 12 用例） | 全部映射到 host-kit 表行（见组 2 对照清单） |
| `plugins/project-mcp/test/attribution-anomaly.test.ts` | 插件子包 project-mcp | 2 | 改 | 文件头「pinned by test/attribution.test.ts」改为指 host-kit 表 + 本文件 |
| `plugins/project-mcp/package.json` | 插件子包 project-mcp | 5 | 改 | 删 `exports["./src/*"]`（`:15`） |
| `plugins/user-commands/test/attribution.test.ts` | 插件子包 user-commands | 2 | **删除**（111 行 / 9 用例） | 全部映射到 host-kit 表行 |
| `plugins/user-commands/test/attribution-concurrency.test.ts` | 插件子包 user-commands | 2 | **删除**（82 行 / 2 用例） | host-kit `并发原子性` 两条已复现（G6 红→绿证据） |
| `plugins/user-commands/test/attribution-anomaly.test.ts` | 插件子包 user-commands | 2 | 改 | 文件头「oracle，零改动」改为指 host-kit 表 |
| `plugins/user-commands/src/host/attribution.ts` | 插件子包 user-commands | 2 | 改 | 头注释里 `test/attribution-concurrency.test.ts` 引用改指 `tooling/host-kit/test/attribution.test.ts` 的并发段 |
| `plugins/user-commands/package.json` | 插件子包 user-commands | 5 | 改 | 新增 `exports["./package.json"]`（`exports` 块 `:11-15`） |
| `plugins/zcode-plan/package.json` | 插件子包 zcode-plan | 5 | 改 | 新增 `exports["./package.json"]`（`:10-12`） |
| `plugins/multi-root-workspace/**` | 插件子包 multi-root | — | **不动** | 构建体系、vitest.config、14 exports、tests/ 全部排除（C3/C6/F9） |

### 1.4 模板与 scripts

| 文件 | 所属仓 | 组 | 动作 | 关键改动点 |
|---|---|---|---|---|
| `templates/default/template.json` | 模板 | 3 / 5 | 改 | `vitest.config.ts` 条目加 `"only": "dual"`；新增 `test/stubs/ui-primitives.tsx` 条目（`only: dual`） |
| `templates/default/vitest.config.ts` | 模板 | 3 | 改（12→4 行） | 改工厂薄声明（补上模板一直缺的 alias 接缝） |
| `templates/default/test/stubs/ui-primitives.tsx` | 模板 | 3 | **新建** | 一行 re-export（`export * from '@dsh-plugins/test-kit/ui-primitives'`） |
| `templates/default/package.json.tmpl` | 模板 | 5 | 改 | `exports` 加 `"./package.json": "./package.json"`；`files` 加 `"lib/**/*.d.ts"` |
| `templates/default/tsconfig.client.json` | 模板 | 3 | 改 | include 补 `test/**/*.tsx`、`test/stubs/**/*.tsx`（N8） |
| `templates/default/test/smoke.test.ts` | 模板 | 5 | 改 | dual 分支的壳断言改用 `loaderShellIssues` + `hostSelfContainmentIssues`（第 4 份复制消失） |
| `templates/default/README.md` | 模板 | 3 / 5 | 改 | 件套表（条目数、only:dual 的 config/stub、dtsOwned 手工项）；硬约束②补「演练已由 CI scaffold 作业机械执行」 |
| `templates/README.md` | 模板 | 5 / 6 | 改 | 件套清单条目数；新增「manifest 形态对账（`gen-plugin --check`）」小节：不可推导键、conditional 规则、`--check` 契约 |
| `scripts/gen-plugin.mjs` | scripts | 3 / 5 | 改 | `structureTree` 按 kind 输出 config/stub；新增 `--check` 模式（复用 `buildTokens`/`buildFiles`/`finalizeManifest` 渲染期望 manifest）；`USAGE`；`printNextSteps` 补清理步骤 |
| `scripts/check-architecture.mjs` | scripts | 3 / 6 | 改 | 新增 AR8（薄入口 + include 覆盖 + stub 存在）；`:46` USAGE、`:830` 通过语、`:5-22` 头注释改 AR1–AR8；可选删 `:784-790` 死分支（N9） |
| `scripts/dsh-check.mjs` | scripts | 3 | 改 | `:8` 注释 AR1–AR7→AR1–AR8 |
| `scripts/lib/artifacts.mjs` | scripts | — | **不动** | 词法器单源维持（R9）；契约模块以「词数组入参」消费它，不反向 import（见 D3） |

### 1.5 openspec 与变更内工件

| 文件 | 所属仓 | 组 | 动作 | 关键改动点 |
|---|---|---|---|---|
| `openspec/specs/dsh-project-mcp/spec.md` | openspec | 1 | 改（结构拆分） | 1 条 → 4 条 requirement，16 个 scenario 各归其位，语义零变化（见 3.5） |
| `openspec/specs/dsh-session-tool-toggle/spec.md` | openspec | 1 | 改（结构拆分） | 1 条 → 5 条，13 个 scenario 各归其位 |
| `openspec/changes/<change>/artifacts/a3-attribution-coverage-map.md` | openspec | 2 | **新建** | 23 条「删除用例 → host-kit 表行」映射（删除凭证） |
| `openspec/changes/<change>/artifacts/n2-tsconfig-inventory.md` | openspec | 6 | **新建** | 三包磁盘数 / include 覆盖 / 未覆盖 = 0 的盘点记录 |

**明确不触达**：`plugins/multi-root-workspace/src|scripts|tests`（B1 只立档案）、`scripts/lib/artifacts.mjs`、`tooling/host-kit/**`（A3 只删消费侧）、`tooling/contracts/**`（X-d 已证伪）、`openspec/specs` 的其余 11 份 spec、`plugins/*/lib/**`（产物字节零变化，C9）。

---

## ② 证据锚

> 每行一条代码事实（`file:line`）；新建文件标「新建」，其依据锚写在同行。

| 模块 | 代码事实 |
|---|---|
| `package.json:14-24` | 根 scripts 只有 8 条，无 `spec:check`；无 `devDependencies` 键（`grep -n devDependencies package.json` 零命中） |
| `pnpm-lock.yaml:203-207` | `importers:` → `.: {}` → `plugins/multi-root-workspace:`；7 个插件 importer 全在，任何新包都需重装 |
| `.github/workflows/ci.yml:1-8` | 头注释写明「刻意不跑 verify … multi-root 的 smoke 需要运行中的 dsh 实例，在 CI 里必然失败」 |
| `.github/workflows/ci.yml:34-53` | 七步链：install/frozen → lint → typecheck → build → test → docs:check → dsh:check；无 openspec、无 gen 演练 |
| `README.md:48` | 「…（含 lint / typecheck / build / 内核探测 / 单测 / 冒烟，需运行中的 dsh 环境）」 |
| `README.md:80` / `AGENTS.md:67` | 「multi-root 的 smoke 需运行中的 dsh」 |
| `README.md:21` / `:39` / `AGENTS.md:18` / `:65` / `scripts/dsh-check.mjs:8` | 五处写死「AR1–AR7」 |
| `plugins/multi-root-workspace/scripts/lib/dsh-runtime.mjs:32-38` | `resolveDshCliPath()`：`DSH_CLI` → PATH → `require.resolve('@deepseek-ai/dsh/lib/bin.js')`（pinned devDependency） |
| `plugins/multi-root-workspace/scripts/lib/dsh-runtime.mjs:97-105` | `assertIsolatedHome`：scratch `$DSH_HOME` 隔离 |
| `plugins/multi-root-workspace/scripts/smoke-journey.mjs:275-279` / `:330` | 本地 `127.0.0.1` 假 OpenAI 兼容端点 + 假 `DEEPSEEK_API_KEY` |
| `openspec/specs/dsh-project-mcp/spec.md:105` | `### Requirement: 工作区可见性隔离`（requirements[5]，>500 字符）；16 个 scenario 在 `:111-190` |
| `openspec/specs/dsh-session-tool-toggle/spec.md:103` | `### Requirement: Web 配置界面`（requirements[5]，>500 字符）；13 个 scenario 在 `:107-167` |
| `docs/decisions/ADR-0001-shared-build-and-source-kits.md:61` | test-kit 行：「只放无分支的夹具，包行为断言留在包内，且不装 vitest」 |
| `docs/decisions/ADR-0001-shared-build-and-source-kits.md:110-132` | 「修订记录」节先例（D-15 的旧结论/新结论表 + 落地证据） |
| `tooling/test-kit/package.json:7-10` | `exports` 仅 `./ui-primitives` 与 `./locale-parity`，无 `./vitest` |
| `tooling/test-kit/package.json:11-14` | `scripts` 仅 `lint` / `typecheck`（AR2 白名单同值，见 `check-architecture.mjs:154-157`） |
| `tsconfig.plugin.base.json:19-23` | `paths` 已有 `@dsh-plugins/test-kit/*` → `./tooling/test-kit/src/*.ts`，新子路径类型解析自动成立 |
| `tooling/test-kit/README.md:44-65` | `localeParityIssues` 契约与「不 import vitest、不读文件」纪律；`:67-74` 自测命令 |
| `tooling/build-kit/src/guards.mjs:78-87` | `assertSelfContained(words, externals)` 实现（后续成为死导出） |
| `tooling/build-kit/src/guards.mjs:11` | 文件头 `@link assertSelfContained` 声明它是三类守卫之一 |
| `tooling/build-kit/src/index.mjs:223` | `export { assertNoDynamicRequire, assertNoInternalWord, assertSelfContained } from './guards.mjs'` |
| `tooling/build-kit/test/guards.test.mjs:49-79` | `describe('assertSelfContained：自包含判据')` 6 个用例 |
| `tooling/build-kit/README.md:86` / `:107-111` | 守卫表行 + 「由包内 bundle.test / 仓级 check-artifacts 调用」——与全仓零调用矛盾 |
| `tooling/build-kit/package.json:7-9` | `exports` 只有 `"."`，测试无法以子路径消费 |
| `scripts/lib/artifacts.mjs:30-41` | `readArtifact` / `requiredWords`（词法器单源；`requiredWords` 按 `require("…")` 抓词并去重排序） |
| `scripts/lib/artifacts.mjs:51-58` | `importedWords`（`from "…"` / `require("…")` / `import("…")`） |
| `scripts/lib/artifacts.d.mts:1-13` | 手写 `.d.mts` 先例（新契约模块照此办理） |
| `plugins/session-tool-toggle/test/bundle.test.ts:100-104` | 壳断言：`window.__ModuleLoader__.load({` / `id: "…"` / `factory: (require) => {` |
| `plugins/session-tool-toggle/test/bundle.test.ts:107-114` | 词集精确相等 + `node:` 排除 + 自包名排除 |
| `plugins/session-tool-toggle/test/bundle.test.ts:146-152` | 宿主半自包含（非 `node:` 词为空 + `@deepseek-ai/` 为空） |
| `plugins/session-tool-toggle/test/bundle.test.ts:94-97` | `cssModuleCount()` 动态计数（v1.4.0 事故护栏，留包内） |
| `plugins/web-ux/test/bundle.test.ts:31` / `:81-90` | `CLIENT_EXTERNALS` 词集 + 固定 4 注入器（与 stt 不同口径，留包内） |
| `plugins/workspace-config/test/bundle.test.ts:75-82` | 座位字面量 ≥2 次断言（包事实，留包内） |
| `plugins/workspace-config/test/bundle.test.ts:134-142` | `exports['./client'].types` + 两个 d.ts 文件存在（dtsOwned 的包事实） |
| `plugins/workspace-config/tsconfig.host.json:3-5` | include 仅 `["src/index.ts"]`（F3 的 N3 洞） |
| `plugins/workspace-config/tsconfig.client.json:4-12` | `declaration` + `rootDir: "src"` + `outDir: "lib/types"`（**不能**把 test/ 塞进这个工程，见 D7） |
| `plugins/session-tool-toggle/tsconfig.host.json:3-21` | 15 个测试文件逐条枚举（N2 的维护税） |
| `plugins/project-mcp/tsconfig.host.json:3-8` / `plugins/user-commands/tsconfig.host.json:6` | 用 `test/**/*.ts` glob（A3 删文件无需改 tsconfig） |
| `plugins/project-mcp/test/attribution.test.ts:32-177` | 12 个规则级用例（逐条可映射） |
| `plugins/project-mcp/test/attribution-anomaly.test.ts:1-7` | 文件头自述「covers the PACKAGE adapter」「walk-up rules pinned by test/attribution.test.ts (the oracle)」 |
| `plugins/user-commands/test/attribution.test.ts:28-113` | 9 个规则级用例 |
| `plugins/user-commands/test/attribution-concurrency.test.ts:1-11` | 文件头自述「本包的薄导出免费获得这个修复 … 回归用例」 |
| `plugins/user-commands/src/host/attribution.ts:14-15` | 引用 `test/attribution-concurrency.test.ts`（删文件后成为悬空引用） |
| `tooling/host-kit/test/attribution.test.ts:65-176` | `CASES` 表 13 行（两包规则并集） |
| `tooling/host-kit/test/attribution.test.ts:177-227` | 表外内核用例：空索引 / update 整表替换 / canonical 失败两条 |
| `tooling/host-kit/test/attribution.test.ts:229-287` | `#3` 裁定 + 重复主根（与两包 anomaly 重叠的**内核部分**） |
| `tooling/host-kit/test/attribution.test.ts:288-370` | 并发原子性 2 用例（与 user-commands concurrency 重叠） |
| `plugins/project-mcp/src/host/attribution.ts:9-10` / `plugins/user-commands/src/host/attribution.ts:14-15` | 薄 re-export（`Attributor` = `RootAttributor`）——wiring 用例的存在理由 |
| `plugins/session-tool-toggle/vitest.config.ts:14-27` | `esbuild.jsx:'automatic'` + alias 到 `test/stubs/ui-primitives.tsx` + include 两种后缀 + node 环境 |
| `templates/default/vitest.config.ts:7-11` | 模板只有 include + environment（缺 jsx 与 alias） |
| `templates/default/test/smoke.test.ts:45-51` | 第 4 份 loader 壳断言（按 `dsh.client` 分支） |
| `templates/default/package.json.tmpl:10-14` | exports 仅 `"."`（无 `./package.json`） |
| `templates/default/package.json.tmpl:23-27` | files 仅 3 条（无 `lib/**/*.d.ts`、无 icon） |
| `templates/default/tsconfig.host.json:3` / `tsconfig.client.json:3` | host `["src/index.ts","test/**/*.ts"]`；client `["src/client"]`（N8） |
| `plugins/*/package.json:5` / `:26-45` | 4 包 `icon` + files 含 `icon.svg`；wsc / zcode-plan 无（F5） |
| `plugins/web-ux/package.json:18` / `plugins/project-mcp/package.json:15` | `./src/*` 死导出的所在行；`./package.json` 同在（`:19` / `:16`） |
| `@deepseek-ai/dsh-app-boot/lib/index.js:3008`（仓外） | `readPluginMeta` 解析 `` `${specifier}/package.json` ``（`resolvePluginResource` 走 Node 解析器）→ `./package.json` 是正当导出 |
| `@deepseek-ai/dsh-app-boot/lib/index.js:2871-2896`（仓外） | `iconOf`：manifest `icon` 必须是包内真实相对路径文件，否则抛错 |
| `scripts/check-architecture.mjs:144-162` | `TOOLING_CONTRACT`：test-kit `scripts: ['lint','typecheck']`（N4 需加 `test`） |
| `scripts/check-architecture.mjs:280-293` | AR3 的 `expectedCoreScripts`（`typecheck` 值写死两段式——N3 不改脚本，见 D7） |
| `scripts/check-architecture.mjs:316-320` / `:413-461` | AR4 薄入口判据（≤12 行、单 import、无 esbuild）——AR8 复用其 `stripComments` |
| `scripts/check-architecture.mjs:770-772` | `softPlugins` 判定（无 `src/compat/dsh-version.ts`）——AR8 / `--check` 共用 |
| `scripts/gen-plugin.mjs:364-376` | `finalizeManifest`：dual 补 `exports['./client']` / `dsh.client` / test-kit devDep / 双 tsc |
| `scripts/gen-plugin.mjs:295-314` | `structureTree(dual)`：无条件输出 `vitest.config.ts`（T10 需按 kind） |
| `scripts/gen-plugin.mjs:401-417` | `buildFiles`：清单驱动渲染（`--check` 复用的唯一渲染路径） |
| `scripts/gen-plugin.mjs:435-444` | `printNextSteps` 5 步（需补清理） |
| `scripts/check-artifacts.mjs:6-10` | 三模式：门禁 / `--write-baseline DIR` / `--baseline DIR`（B6 迁移等价锚） |
| `scripts/check-artifacts.mjs:316-340` | B6 `compareWords`：模块词逐字相等，sha256 只提示 |
| `scripts/dsh-check.mjs:28-32` | 三脚本顺序聚合（不新增脚本时无需改） |

---

## ③ 接口与数据形状

### 3.1 `@dsh-plugins/test-kit/vitest`（组 3 新建）

```ts
// tooling/test-kit/src/vitest.ts
export const WEB_TEST_INCLUDE = ['test/**/*.test.ts', 'test/**/*.test.tsx'] as const

export interface WebTestConfigOptions {
  /** 调用方包目录；vitest.config.ts 里传 import.meta.dirname。空串/非字符串 → 抛错（fail fast）。 */
  readonly root: string
}

export interface WebTestConfig {
  readonly esbuild: { readonly jsx: 'automatic' }
  readonly resolve: { readonly alias: { readonly '@deepseek-ai/dsh-client-ui-primitives': string } }
  readonly test: { readonly include: readonly string[]; readonly environment: 'node' }
}

/** 返回裸配置对象（vitest 接受对象默认导出；本模块不 import vitest）。 */
export function defineWebTestConfig(options: WebTestConfigOptions): WebTestConfig
```

- 实现只用 `node:path` 的 `join`（内建，不增依赖）：alias 值 = `join(root, 'test', 'stubs', 'ui-primitives.tsx')`。
- 消费方形态（三包 + 模板 dual，逐字 4 行）：
  ```ts
  import { defineWebTestConfig } from '@dsh-plugins/test-kit/vitest'

  export default defineWebTestConfig({ root: import.meta.dirname })
  ```
- 不提供 `environment` / `include` / `alias` 覆盖旋钮（多分支即违反 test-kit 纪律）。

### 3.2 门禁 AR8 的数据形状（组 3 扩展 `scripts/check-architecture.mjs`）

对每个 `softPlugins`（`:770-772`）判定，全部失败一次列出：

| 规则 | 断言 |
|---|---|
| AR8-1 | `dsh.client?.platform === 'web'` ⇒ `vitest.config.ts` 存在 |
| AR8-2 | 存在 `vitest.config.ts` ⇒ `stripComments` 后有效行 ≤ 6；`import` 恰 1 条且源为 `@dsh-plugins/test-kit/vitest`；恰 1 条 `export default defineWebTestConfig({`；代码不含 `alias` / `esbuild` / `include` / `environment` / `jsdom` / `@deepseek-ai/dsh-client-ui-primitives` |
| AR8-3 | 从 `tooling/test-kit/src/vitest.ts` 提取 `WEB_TEST_INCLUDE` 数组字面量（**解析失败即 fail，不静默跳过**），必须恰为 `['test/**/*.test.ts','test/**/*.test.tsx']`；磁盘 `test/` 下每个文件名匹配 `/\.test\./` 且不以 `.test.ts` / `.test.tsx` 结尾 ⇒ fail（防组件套件静默消失） |
| AR8-4 | 存在 `vitest.config.ts` ⇒ `test/stubs/ui-primitives.tsx` 存在且含 `from '@dsh-plugins/test-kit/ui-primitives'` |

输出形状：`fail('AR8 <包名>/vitest.config.ts: …')`；通过语并入 `:830` 的 `[architecture] AR1–AR8 通过`。

### 3.3 `@dsh-plugins/build-kit/artifact-contract`（组 4 新建）

```js
// tooling/build-kit/src/artifact-contract.mjs —— 纯 .mjs，零依赖（只用 node:module 的 isBuiltin）
/** @returns {string[]} issue 列表；空数组 = 通过。每条 issue 自带包名 + 产物名 + 期望/实际。 */
export function loaderShellIssues({ packageName, source }): string[]
export function requireSurfaceIssues({ packageName, expected, required, imported }): string[]
export function hostSelfContainmentIssues({ packageName, words, externals = ['node:*'] }): string[]
export function selfContainmentIssues({ words, externals }): string[]   // guards 判据迁入的低层原语
```

| 函数 | 语义（逐字保留现有断言强度） | issue 文案要点 |
|---|---|---|
| `loaderShellIssues` | `source` 必须含 `window.__ModuleLoader__.load({`、`id: "<packageName>"`、`factory: (require) => {` | 点名缺哪一条标记 |
| `requireSurfaceIssues` | `required` 与 `expected` **精确集合相等**；`imported` 中无 `node:*`；`imported` 中无 `packageName` 子串 | 分别报「多余/缺失」「node: 泄漏」「自引用」 |
| `hostSelfContainmentIssues` | 等价于 `selfContainmentIssues({ words, externals: ['node:*'] })`：非内建、非相对、非外部的词即 issue | 列出未覆盖词（去重） |
| `selfContainmentIssues` | 词法判定：相对块恒合法；`node:*` 需命中 externals；裸内建名仅当 externals 含 `node:*`；通配与包名子路径匹配 | 保留原 `assertSelfContained` 的三种失败文案 |

- 所有函数是**无状态纯函数**，不读盘、不 import vitest、不 import `scripts/lib`（词数组由调用方用词法器产出）。
- 三份 `bundle.test.ts` 的消费形态（每组一行）：
  ```ts
  expect(loaderShellIssues({ packageName: PACKAGE_NAME, source })).toEqual([])
  expect(requireSurfaceIssues({ packageName: PACKAGE_NAME, expected: CLIENT_REQUIRES,
    required: requiredWords(source), imported: importedWords(source) })).toEqual([])
  expect(hostSelfContainmentIssues({ packageName: PACKAGE_NAME,
    words: importedWords(readArtifact(ROOT, 'index.js')) })).toEqual([])
  ```

### 3.4 `pnpm gen:plugin --check`（组 5）

- CLI 契约：`pnpm gen:plugin --check`（无 `<name>`、无 `--kind`；与 `--dry-run` 互斥，同给 → exit 2）。
- 算法（复用 `buildTokens` / `buildFiles` / `finalizeManifest`，不新造渲染路径）：
  1. `softPlugins` 同 AR3 判定；`kind` ← `dsh.client?.platform === 'web'`；包名去 `dsh-plugin-` 前缀后渲染模板 manifest（version/description 由 token 填入但不参与比较）。
  2. **规范键集合**（其余键不比较）：

     | 键 | 期望 |
     |---|---|
     | `type` / `main` / `license` | `module` / `lib/index.js` / `Apache-2.0` |
     | `exports["."]` | `{ default: "./lib/index.js" }` |
     | `exports["./package.json"]` | `"./package.json"` |
     | `exports["./client"]`（dual only） | `{ default: "./lib/client.js" }` |
     | `exports["./client"].types`（`dtsOwned` only） | `./lib/types/client/index.d.ts` |
     | `dsh.bundle.patch` / `dsh.engines.dsh` / `dsh.client.platform` | `./cordis.patch.yml` / `SOFT_DSH_RANGE`（从 `dsh-baseline.mjs` 现取）/ `web`（dual） |
     | `peerDependencies["@deepseek-ai/dsh"]` | `SOFT_DSH_RANGE` |
     | `files` | 集合 = `lib/**/*.js`、`lib/**/*.d.ts`、`src`、`cordis.patch.yml`（+ `icon.svg` iff `icon` 字段存在） |

  3. **conditional 断言**（N11）：`icon` 存在 ⇒ 文件存在 ⇒ `files` 含 `icon.svg`；`dtsOwned` ⇒ `files` 含 `lib/**/*.d.ts`；dual ⇒ `exports["./client"]` 存在。
  4. 输出：逐条 `console.error('<包名>: <键路径> 期望 X，实际 Y')`；存在任一 → exit 1；全过 → 打印 `[gen-plugin] 6 个软插件的 manifest 与模板形态一致`（exit 0）。
- 不设白名单文件：任何差异即失败（D10）。

### 3.5 openspec 拆分后的 requirement 骨架（组 1）

**`dsh-project-mcp`（1 → 4 条，16 scenario）**

| 新 requirement | 承接正文 | scenario |
|---|---|---|
| 归属判定与可见性隔离 | 原第一段（上溯规则 / 主根优先 / 最近层 / 登记顺序 / 应拒集合派生 / 非项目不受影响） | 仅见归属工作区工具、cwd 为子目录、主根压倒附加根、仅附加根命中、近层附加根、双授予、无归属 fail-closed、非 project MCP 不受影响、被隔离工具调用失败（9） |
| 隔离不误伤 profile 服务器 | 原「加载失败的 claim MUST NOT 使同名非项目服务器被隐藏」 | 加载失败的 claim、加载中的 claim（2） |
| 隔离闸口与 agent 生命周期解耦 | 原第二段（全局闸口 / 无发起者 / 拒绝同形 / 不影响非项目工具） | 未跟踪 agent、无发起者、全局闸口不影响非项目（3） |
| 根集合契约与索引原子重建 | 原第三、四段（`roots[0]` / 重复 primary / update 原子） | 根集合首项不是主根、重扫期间创建会话（2） |

**`dsh-session-tool-toggle`（1 → 5 条，13 scenario）**

| 新 requirement | 承接正文 | scenario |
|---|---|---|
| Web 配置界面（入口与构成） | 入口座位 / 面板构成 / locale 来源 | 入口在会话头部渲染、保护名单在面板上不可切换、持有者缺席时旧路径保留（3） |
| 面板读写通道与会话状态同源 | Connection RPC / 不另建浏览器状态 / 与 `/tools` 同源 / 不提供配置键编辑 | 面板切换等效命令面、RPC 降级、会话不在宿主、逐 skill 只影响模型可见性（4） |
| 面板清单宇宙（scoped ∪ carried） | 「工具清单宇宙 SHALL 只含本会话有效工具…」整段 | 面板清单只含本会话有效工具（1） |
| 默认档编辑面的分组开关形态 | 分组开关界面 / 同一读数 / 开 = 在档 / 无自由文本添加 | 用户级默认档编辑区、工作区默认档分节与分区、默认档不追溯、切换工作区（4） |
| 禁用与残留的呈现规则 | 保护名单与保留名禁用 / 整组默认关 / 技能服务缺席降级 / 档外地址只以残留移除 | 整组默认关时组内行不可切换（1） |

- 语句逐字搬运，只允许移动与加标题；不得改写 SHALL/MUST 语义。
- 长度自检（openspec 的 500 字符阈值按去空白后的正文计）：
  ```bash
  node -e 'const fs=require("fs");for(const f of process.argv.slice(1)){const t=fs.readFileSync(f,"utf8");for(const p of t.split(/^### Requirement: /m).slice(1)){const [title,...rest]=p.split("\n");const body=rest.join("\n").split(/^#### Scenario:/m)[0];console.log(body.replace(/\s+/g," ").trim().length,title)}}' openspec/specs/dsh-project-mcp/spec.md openspec/specs/dsh-session-tool-toggle/spec.md
  ```
  判据：每条 < 500；随后 `openspec validate --all --strict` exit 0。

### 3.6 配置键 / 脚本键变更清单

| 位置 | 键 | 旧 → 新 |
|---|---|---|
| 根 `package.json` | `scripts["spec:check"]` | 无 → `openspec validate --all --strict` |
| 根 `package.json` | `devDependencies["@fission-ai/openspec"]` | 无 → 当前安装版本（`1.16.0`） |
| `tooling/test-kit/package.json` | `exports["./vitest"]` | 无 → `./src/vitest.ts` |
| `tooling/test-kit/package.json` | `scripts.test` | 无 → `vitest run`（AR2 白名单同步加 `test`） |
| `tooling/build-kit/package.json` | `exports["./artifact-contract"]` | 无 → `{ types, default }` |
| 四个软插件 `package.json`（stt / web-ux / wsc / project-mcp） | `exports["./src/*"]` | 存在 → 删除（4 包） |
| user-commands / zcode-plan / workspace-config | `exports["./package.json"]` | 无 → `"./package.json"` |
| 模板 `package.json.tmpl` | `exports["./package.json"]`、`files` | 补两键（见 1.4） |
| `.github/workflows/ci.yml` | `jobs.scaffold` | 无 → 新作业（4 步 + dsh:check） |

---

## ④ 决策记录

> 每条含**被否方案与理由**；D1–D5 是落点类（承重），D6–D16 是实现形态类。

**D1 工厂落 `@dsh-plugins/test-kit/vitest`，返回裸对象、单 import、不包 `defineConfig`**
- 理由：三线一致（T1/复算）；vitest 接受对象默认导出；单 import 让 T11 的「唯一 import 源」可被 AR8 逐字断言。
- 被否 a：都进 test-kit（断言壳也进）——撞 ADR-0001 `:61`「包行为断言留在包内」，且断言壳需要词法器，会把 `scripts/lib` 反向拉进 test-kit。
- 被否 b：保留 `defineConfig(defineWebTestConfig({…}))` 包裹——多一条 `vitest/config` import，AR8 必须为它开例外；`vitest.config.ts` 不在任何 tsconfig include 内，类型提示收益 ≈ 0。
- 反例：若把 `defineConfig` 留着并让 AR8 写「允许 vitest/config」，「唯一 import 源」就从机器事实退化为**注释约定**——下一个包照抄第三行 import（比如 stub 直连）不会被发现。

**D2 工厂选项键用 `root` 而非需求原文的 `dir`**
- 理由：与 `buildPlugin({ root })`（`tooling/build-kit/src/index.mjs:184-197`）同名同义；一个仓里两个入口参数用两个名字，是下一次「复制的开始」。
- 被否：`dir`——语义等价但和 build-kit 分叉。
- 反例：新人写 `defineWebTestConfig({ dir: import.meta.dirname })` 会拿到 `undefined` 根目录（若我们不校验）→ 工厂必须对非字符串/空串抛错，不能静默降级成 process.cwd()。

**D3 断言壳落 `@dsh-plugins/build-kit/artifact-contract`，词数组入参、issue 列表返回**
- 理由：T2 落定；`assertSelfContained` 本就住 build-kit（F11），落点是「补线」不是「新造第三处」；词法仍归 `scripts/lib`（R9），build-kit 不反向 import（归档 R6：build-kit 自包含是模板独立可用的前提）。
- 被否：落 `scripts/lib`（B 线 b 的一半）——断言壳没有第二个 gate 消费者，R9 的「gate + 测试双消费」前提不成立。
- 被否：issue 函数放 test-kit——test-kit 章程「夹具与无包语义原语」（T2 分类原则：产物契约跟 owner 走）。
- 反例：若把 `requiredWords` 的实现搬进 build-kit，`scripts/lib/artifacts.mjs` 与 build-kit 就出现两份词法器；改一处漏一处，正是本轮要消灭的形态。

**D4 `assertSelfContained` 删除而非保留：判据迁入 artifact-contract**
- 理由：它是死导出（F11）；留一个「同名同义但没人用」的抛出函数就是第三种说法；`guards.test.mjs` 的 6 个用例迁新文件，覆盖不减。
- 被否：保留并「接线」到 build 期守卫——归档 R6 已裁定「词集合级不进 build 期」（build 期没有词法器，重复无增量）。
- 反例：README 继续声称「由 bundle.test 调用」而代码无人调用——文档与机器事实背离，正是 U2 类债的形态。

**D5 三份 bundle.test 的保留边界：壳/词集/宿主自包含下沉；标记、注入器计数、包声明、词集常量留包内**
- 理由：T2 的四组语义逐字相同；stt 的 `cssModuleCount()` 是 v1.4.0 事故护栏（动态计数），web-ux 固定 4 是同一规则的另一种口径——统一会丢事故语义，留包内并保留注释。
- 被否：连注入器计数一起参数化——两种口径需要 `mode` 分支，违反「无分支原语」。
- 反例：把三份 `CLIENT_REQUIRES` 合并成一个共享常量后，某包把 `react` 从 external 移除但共享常量没同步 → 产物多出内联 react，测试仍绿（因为断言和声明同源）。三份词集是**独立证据**，不能合成一份。

**D6 A3 删除口径：删 3 份 372 行，留 2 份 wiring 236 行；先对照后删，映射不闭合时「补表再删」**
- 理由：T4 落定；23 条用例逐条可映射（见组 2 对照清单）；host-kit 内核套件已是并集超集。
- 被否：只迁移不删（B 线 b）——插件侧仍有规则副本，内核改动仍要同步 3 处。
- 被否：连 anomaly 一起删——anomaly 测的是 `{ onAnomaly: log.warn }` 接线与薄导出身份，属包级 wiring，删了内核修好但包没接上的信号消失。
- 反例：user-commands 的并发用例若直接删而 host-kit 没对应行，`update()` 的原子性回归就只剩内核套件一条防线，且包侧无接线级回归。

**D7 N3 用 `tsconfig.host.json` include 测试，不新建 test 工程、不塞 client 工程**
- 理由：wsc 的 client 工程带 `declaration` + `rootDir: "src"`（`tsconfig.client.json:4-12`），塞 `test/` 会触发 TS6059（文件不在 rootDir 下）；host 工程 `noEmit`（根基准 `noEmit: true`），且两工程的编译选项除 declaration 外完全同源，把 test 放进 host 工程不改变检查强度。
- 代价：`typecheck` 脚本不变 → AR3 零改动，AR5 的键白名单不变（只 extends/include）。
- 被否：新增 `tsconfig.test.json` + 改 `typecheck` 脚本——直接撞 AR3 `expectedCoreScripts`（`:280-293`），为一条 P1 债动门禁契约不划算。
- 被否：把测试塞 client 工程——TS6059 硬失败。
- 反例：给 wsc 新增第三个 tsconfig 而忘了改 AR3，`pnpm typecheck` 绿、`pnpm dsh:check` 红 —— 绿的是假绿灯。

**D8 A4：`./package.json` 判正当（保留 + 给缺的三包补上）；`./src/*` 删**
- 理由：F6 证明 `./package.json` 有真实外部消费者；F7 证明 `./src/*` 无任何消费者且来源是迁入提交。
- 被否：把两者一起删（U6 的初判）——会让插件元数据静默丢失，且删的是「看不见的功能」。
- 被否：给 `./src/*` 补消费者（比如让测试走子路径）——把死导出救活只为让它「正当」，方向反了。
- 反例：删 `./package.json` 后 `dsh --dump-config` 仍绿（它不读元数据），问题只在插件列表页丢标题/图标——没有门禁能发现，这正是必须在 `--check` 里钉住的原因。

**D9 A4 的 `files` 收口：模板加 `lib/**/*.d.ts`；wsc 删 `README.md`；`src` 保留**
- 理由：`lib/**/*.d.ts` 只在 dtsOwned 包存在，写进模板对其它包是无害空集，反而消掉 wsc 的差异；`README.md` 由 npm/pnpm 自动包含（pack 白名单恒含 README），显式声明是冗余且只有 wsc 有；`src` 是「随包分发源码」的发布面决策，删它会改变安装内容，超出本轮「声明形态」边界。
- 被否：同批删 `files: src`——收益只是体积，风险是发布面变更；且它需要一次独立的 pack 演练证据（列入待决 Q3）。
- 反例：先删 `./src/*` 再忘删 `files: src` 又不审计，就出现「发布了不能 import 的源码」——审计表必须逐键给理由。

**D10 `--check` 无白名单、fail-closed、按需跑**
- 理由：T8 方向 = 删不正当差异后让真实包与模板形态一致；此时任何差异都应是缺陷。带白名单等于「把遗留固化为规范」（B 线反例 1）。
- 被否：`--check` 读 `templates/README.md` 差异表做白名单——文档与门禁双源，且解析 Markdown 表格比零白名单更脆。
- 被否：升 AR 常跑（B 线 Q4 b）——新增包是低频事件，且 AR8 已占本轮门禁预算。
- 反例：`icon` 可选是**条件事实**不是白名单例外：写成白名单就会退化成「wsc 允许没有 icon」，而实际规则是「有 icon 就必须可被 DSH 读到」。

**D11 B4 落 CI 作业（`scaffold`），与 `verify` 作业并列**
- 理由：T6 落定；B4 的承诺「开箱即绿」需要每次模板改动都被机械验证，而不是人工演练。
- 被否：塞进 `dsh:check`（B 线 Q5 的宿主之一）——本地 dsh:check 会从秒级变成分钟级，T6 明确「本地不加重」。
- 被否：只在 PR 手动触发——承诺依旧没有常驻证据。
- 安装形态的机制冲突见**待决 Q1**（`--frozen-lockfile` 与新 importer 不可共存）。

**D12 B1 立「评估档案」而非 ADR**（落 `docs/assessments/`）
- 理由：`docs/decisions/README.md:32` 明写「只有做出真实决策时才新建 ADR；未决讨论与提案留在 `openspec/changes/`」；本轮结论是「不迁移 + 立评估框架」，没有新决策。
- 被否：新建 ADR-0003——会用「Accepted」给一个「暂不施工」的评估盖决策章，误导后续引用。
- 被否：只写进 README 一段——B6 基线快照需要落点，README 不适合放 7 份 JSON。
- 反例：写成 ADR 后，未来真要做迁移时，必须再写一篇 ADR 来推翻它——凭空多一次修订链。

**D13 test-kit 自测用 devDep `vitest` + 自持 vitest.config，并在 ADR/AR2 里把「不装 vitest」精确化为「不作为运行时依赖」**
- 理由：复算指出「不装 vitest」只是 prose（AR2 的 devDep 白名单本就含 vitest，`:170-178`）；N4 需要真跑。
- 被否：用 node:test 自测——同仓两套测试运行器，收益只是绕开一句 prose。
- 反例：自测里用 jsdom/testing-library 渲染 stub —— 需要给 test-kit 加 `@testing-library/react`（AR2 devDep 白名单外），为一条最小自测扩治理面；改用 `renderToStaticMarkup`（react-dom 已是运行时依赖）零新增。

**D14 `openspec` 进根 devDependency + 根 `spec:check` 脚本**
- 理由：现在是隐式全局依赖（N10），本地与 CI 两个来源；进 devDep 后 lockfile 固定、`pnpm spec:check` 单一命令。
- 被否：CI 里 `npm i -g @fission-ai/openspec@1.16.0`——版本字面量进 CI，且本地仍是隐藏前提。
- 反例：CI 装 `@latest` → 某次 CLI 升级改了 warning 阈值，门禁行为在无提交的情况下变化。

**D15 N2 只盘点、不 glob 化；AR8 只守 vitest include**
- 理由：三包当前零漏登（F3）；glob 化会把 client 的 `.ts` 测试塞进 host 程序（语义混乱）或反向丢检查；AR8 已守住「测试被收集」，剩下「测试被 tsc 检查」在 N3 补齐后只剩登记习惯。
- 被否：AR8 顺带守 tsconfig 覆盖——见**待决 Q2**（成本 25 行，但超出 T11 已定范围）。
- 反例：把 stt 的 host include 改成 `test/**/*.ts` 后，`test/panel-client.test.ts` 会被 host 与 client 两个程序各查一遍——重复但不出错，于是没人发现分区语义已失效；等哪天两工程选项分叉，错误才以「类型检查结果不一致」的形式爆出来。

**D16 模板 smoke 接产物契约推迟到组 5（与 CI drill 同批）**
- 理由：模板改动只有 scaffold 作业能机械验证；组 4 先落三份真实包的改造，组 5 一次改模板并用 drill 证明。
- 被否：组 4 同批改模板——组 4 验收时模板无任何自动化证据，等于把「开箱通过」的承诺又押后一次。
- 反例：模板 smoke 改错一个参数名（如把 `packageName` 写成 `pkg`），三份真实包全绿、模板无人跑，直到下一个人 `gen:plugin` 才炸——「模板 = 真实形态样本」当场破产。

---

## ⑤ 逐任务组实现要点

> 组间串行，组内可并行。每组收口判据 = 该组全部门禁命令 exit 0，且不引入下一组的返工。

### 组 0（批次前置，1 条命令）：冻结 B6 迁移等价基线

- 命令（在组 1 任何编辑之前执行，读已提交的 `lib/`，不重建）：
  ```bash
  node scripts/check-artifacts.mjs --write-baseline docs/assessments/multi-root-baseline
  ```
- 产出：7 份 `<包名>.json`（含 multi-root），随仓库提交。
- 判据：命令 exit 0；`git status --porcelain docs/assessments/multi-root-baseline` 恰 7 个新文件。
- 说明：组 1–5 不触 multi-root 产物（C9 边界）；若中途发现必须触达，冻结动作回退到该组之前重做。

### 组 1：止血与债（4 条可并行）

**1A（N1+N10）openspec 进根 devDep + CI 步骤**
- `package.json`：加 `"spec:check": "openspec validate --all --strict"` 与 devDep；`pnpm install`（重写 lockfile 根 importer）。
- `ci.yml`：`verify` 作业在 `docs:check` 之后加一步 `pnpm spec:check`；头注释改「八步链 + scaffold 作业」。
- 验证：
  ```bash
  node -e 'const fs=require("fs"),YAML=require("./plugins/project-mcp/node_modules/yaml");
    const d=YAML.parse(fs.readFileSync(".github/workflows/ci.yml","utf8"));
    console.log(Object.keys(d.jobs), d.jobs.verify.steps.length)'
  ```
  期望 `[ 'verify' ]`（组 5 后为 `['verify','scaffold']`）；`pnpm spec:check; echo $?` → 组 1 收口时为 0。

**1B（B3）拆两条过载 requirement**
- 按 3.5 的骨架改两个 spec 文件；只搬不改写。
- 验证：
  - 长度命令（3.5）全部 < 500；
  - `openspec validate --all --strict; echo $?` → `0`（改前实测 `1`，F1）；
  - 语义零变化的可审查证据：`git diff -U0 openspec/specs` 只出现 `### Requirement:` 新增行与 scenario 位置移动，无 `SHALL`/`MUST` 句改写。

**1C（B2）smoke 口径四处同修 + 实跑定稿**
- 前置实跑（一次，记录耗时与 CLI 解析证据）：
  ```bash
  time pnpm --filter dsh-plugin-multi-root-workspace smoke
  ```
  期望末行 `[smoke:*] N/N checks passed`；若失败按 `plugins/multi-root-workspace/docs/troubleshooting/` 排障，**不改脚本**。
- 四处同改（`README.md:48`、`README.md:80`、`AGENTS.md:67`、`ci.yml:3-4`），统一口径：
  「需要 `pnpm install` 后的 devDependency dsh CLI（零容器、零真实凭证；journey 用本机 OpenAI 兼容假端点 + 隔离 scratch `$DSH_HOME`）」。
- `ci.yml` 注释的「为什么不跑 verify」改为实测理由（该作业耗时 X 分钟 + 与 `dsh:check`/scaffold 的职责分工），删除「在 CI 里必然失败」。
- 验证：
  ```bash
  grep -rn "运行中的 dsh" README.md AGENTS.md .github/workflows/ci.yml   # 期望零命中
  grep -c "devDependency dsh CLI" README.md AGENTS.md .github/workflows/ci.yml  # 期望 2/1/1
  ```

**1D（N3）wsc 测试补类型检查**
- `plugins/workspace-config/tsconfig.host.json` include：
  ```json
  ["src/index.ts", "test/**/*.test.ts", "test/**/*.test.tsx", "test/stubs/**/*.tsx"]
  ```
- 验证（program 事实上包含测试，不是「命令绿」）：
  ```bash
  pnpm --filter dsh-plugin-workspace-config typecheck
  pnpm --filter dsh-plugin-workspace-config exec tsc -p tsconfig.host.json --listFiles --pretty false \
    | grep -c "/plugins/workspace-config/test/"
  ```
  期望 ≥ 7（6 个测试 + 1 个 stub）；`grep -c "dialog.test.tsx"` ≥ 1。
- 预期暴露的类型错误必须修源码或修测试，不得用 `@ts-expect-error` 压（如确需，注释写明原因与失效条件）。
- 组 1 收口：`pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全 0。

### 组 2：A3 attribution 去重

**对照清单（删除凭证，23 行；落 `openspec/changes/<change>/artifacts/a3-attribution-coverage-map.md`）**

| # | 被删用例（插件侧原名） | host-kit 对应（`test/attribution.test.ts`） | 处置 |
|---|---|---|---|
| 1 | pm `attributes a session created exactly at a workspace root` | `CASES` #1「cwd 正是登记根时命中该工作区」`:65` | 删 |
| 2 | pm `attributes a session created in a subdirectory…` | #2「cwd 是工作区子目录…」`:73` | 删 |
| 3 | pm `attributes a session inside an additional root…` | #3「cwd 在附加根下…完整根集合」`:83` | 删 |
| 4 | pm `fails closed when no registered root claims the directory` | #4「没有任何登记根认领时未命中」`:91` | 删（**策略级事实**由 pm anomaly `:134` 从包别名再断言一次） |
| 5 | pm `canonicalizes through a symlink…` | #5「经过符号链接…」`:98` | 删 |
| 6 | pm `picks the nearest root when roots are nested` | #6「根嵌套时最近层优先」`:110` | 删 |
| 7 | pm `attributes nothing before the root sets are known` | 表外「根集合未知之前不归属任何目录（空索引）」`:187` | 删 |
| 8 | pm `prefers a primary root over an earlier workspace…` | #7「主根压倒更早登记的授予」`:122` | 删 |
| 9 | pm `keeps the primary-root preference in a subdirectory…` | #8「主根优先在被争目录的子目录里同样成立」`:133` | 删 |
| 10 | pm `attributes a nearer granted root over a farther primary root` | #9「近层附加根命中优先于远层主根命中」`:146` | 删 |
| 11 | pm `arbitrates a doubly granted root by registry order` | #10「同一目录被双授予…」`:157` | 删 |
| 12 | pm `keeps a granted restatement of the primary root harmless` | #11「附加根重复陈述主根无害」`:164` | 删 |
| 13 | uc `cwd 正是登记根时命中该工作区` | #1 | 删 |
| 14 | uc `cwd 是工作区子目录时…` | #2 | 删 |
| 15 | uc `经过符号链接的路径…` | #5 | 删 |
| 16 | uc `命中附加根时返回该工作区完整的根集合` | #3 | 删 |
| 17 | uc `cwd 不在任何登记根下时返回 null（fail-closed）` | #4 | 删（策略级事实由 uc anomaly `:84` 从包别名再断言） |
| 18 | uc `空 cwd、空登记表与不可 canonical 化的根…` | #12「空 cwd 不授予任何东西」+ #13「无法 canonical 化的根不进表」 | 删（一条对应两行） |
| 19 | uc `同一物理根被多个工作区当附加根认领…` | #10 | 删 |
| 20 | uc `该根同时是另一个工作区的主根…` | #7 | 删 |
| 21 | uc `update 会清掉上一轮的根…` | 表外「update 是整表替换」`:193` | 删 |
| 22 | uc-concurrency `update 尚未兑现时 attribute 仍返回旧索引…` | `并发原子性` #1 `:288` | 删 |
| 23 | uc-concurrency `重扫窗口内旧的附加根归属仍然完整…` | `并发原子性` #2 `:336` | 删 |

保留（不删）：`attribution-anomaly.test.ts` ×2（pm 145 行 / uc 91 行）= 包级 wiring：薄导出身份、`{ onAnomaly: log.warn }` 收到 #3 与重复主根、fail-closed 经包别名、不丢根。合计 608 → 236 行（-61%）。

1. 先落对照清单；**任何一条找不到 host-kit 对应行，先给 host-kit `CASES` 补行并跑绿，再回头删**（映射不闭合的降级路径：补表后删，不保留插件侧副本）。
2. 删 3 文件、改 4 处引用（1.3 表）。
3. 验证：
   ```bash
   pnpm --filter @dsh-plugins/host-kit test        # 内核套件独立绿
   pnpm --filter dsh-plugin-project-mcp test
   pnpm --filter dsh-plugin-user-commands test
   pnpm -r test
   grep -rn "attribution-concurrency\|test/attribution.test.ts" plugins/user-commands/src plugins/*/test | grep -v host-kit
   ```
   期望 grep 零命中（悬空引用清零）；`git diff --stat` 中三删除文件共 -372 行，两个 anomaly 文件只增改注释行。
4. 保留证据：`grep -n "onAnomaly\|Attributor" plugins/*/test/attribution-anomaly.test.ts` 非空（wiring 仍在）。
5. 收口：`pnpm typecheck`（两包 glob include，删文件不需改 tsconfig）+ 组 1 的整链。

### 组 3：A1 vitest 工厂 + 模板分化 + ADR + AR8

1. `tooling/test-kit/src/vitest.ts`（3.1）+ `package.json` exports + README 章程段 + ADR-0001 修订（`:61` 行与修订记录）。
2. 三包 `vitest.config.ts` 换成 4 行薄声明（模板同形态，`only: dual`）。
3. 模板分化：`template.json`（config `only:dual` + 新增 stub 条目）、stub 新文件、`tsconfig.client.json` 补 `test/**/*.tsx`（N8）、`gen-plugin.mjs` 的 `structureTree` 按 kind 输出、`templates*/README.md` 件套表。
4. AR8（3.2）+ 文档里的 AR1–AR8（五处）。
5. 验证：
   - 正向：`pnpm -r test` 三包全绿（jsdom 组件套件真实跑通 = alias + jsx 接缝正确）；`pnpm dsh:check` 绿。
   - **负向 A（接缝不是侥幸）**：临时删掉工厂里的 `esbuild: { jsx: 'automatic' }` → `pnpm --filter dsh-plugin-workspace-config test` 必须红（`React is not defined`）；恢复后绿。
   - **负向 B（AR8 有效）**：临时给某 config 加 `resolve: { alias: {} }` → `node scripts/check-architecture.mjs; echo $?` 为 1 且报 `AR8`；恢复。
   - include 覆盖（逐包计数）：`for p in session-tool-toggle web-ux workspace-config; do printf '%s ' "$p"; find plugins/$p/test -name '*.test.ts' -o -name '*.test.tsx' | wc -l; done` 与 AR8 的读取日志一致（stt 23 / web-ux 19 / wsc 6）。
   - 模板演练（双 kind 各一次；在临时 worktree 或演练后还原）：
     ```bash
     pnpm gen:plugin demo-host --kind host-only
     pnpm gen:plugin demo-dual --kind dual
     pnpm install
     pnpm --filter dsh-plugin-demo-host verify:all
     pnpm --filter dsh-plugin-demo-dual verify:all
     pnpm dsh:check
     rm -rf plugins/demo-host plugins/demo-dual && git checkout -- pnpm-lock.yaml && pnpm install --frozen-lockfile
     ```
     期望：demo-host 无 `vitest.config.ts`、有 `test/smoke.test.ts`；demo-dual 有 config（4 行）与 `test/stubs/ui-primitives.tsx`。

### 组 4：A2 产物契约下沉 build-kit

1. 新建 `artifact-contract.mjs` + `.d.mts`；`package.json` 加子路径 export。
2. `guards.mjs` 删 `assertSelfContained` 与 `isBuiltin` 链；`index.mjs:223` 同步；`guards.test.mjs` 删 6 用例；新测试文件搬到 artifact-contract（正面 + 负面）。
3. 三份 `bundle.test.ts` 改造（1.3 表；保留边界见 D5）；build-kit README 消费者段重写。
4. 验证：
   - 字节不变（A2 不动产物）：
     ```bash
     node scripts/check-artifacts.mjs --write-baseline /tmp/rc-b6-before   # 组 4 开始前
     # …改造…
     node scripts/check-artifacts.mjs --baseline /tmp/rc-b6-before; echo $?
     ```
     期望 0，且输出「模块词逐字相等」，sha256 提示为空。
   - `pnpm --filter @dsh-plugins/build-kit test`；`pnpm -r test`；`pnpm dsh:check`。
   - 负面探针（证明共享壳会红、且报错带包名）：
     ```bash
     node --input-type=module -e '
       import { loaderShellIssues, requireSurfaceIssues } from "./tooling/build-kit/src/artifact-contract.mjs"
       const a = loaderShellIssues({ packageName: "p", source: "window.__ModuleLoader__.load({" })
       const b = requireSurfaceIssues({ packageName: "p", expected: ["react"], required: ["react","node:fs"], imported: ["react","p"] })
       if (a.length === 0 || b.length !== 2) process.exit(1); console.log(a.join("\n"), b.join("\n"))'
     ```
     期望 exit 0，issue 文案含 `p` 与 `lib/client.js`。
   - 三份测试的断言集合对照：旧文件逐条 `expect(` 与改造后「契约调用 + 包内保留断言」一一对应（评审项，diff 留痕）。

### 组 5：A4 manifest 审计与对账 + B4 CI 冒烟

1. 审计（先产出结论再改）：逐包列出 `exports` / `files` / `icon` 三项的理由；判定结果 = D8/D9（删 `./src/*`、补 `./package.json`、删 wsc `README.md`、模板补 `./package.json` 与 `lib/**/*.d.ts`）。
2. 改 6 个插件 manifest + 模板 `.tmpl`；`gen-plugin --check`（3.4）落地；`templates/README.md` 增「manifest 形态对账」小节。
3. 模板 smoke 改用契约函数（D16）。
4. `ci.yml` 新增 `scaffold` 作业（D11；install flag 见待决 Q1）：
   ```yaml
   scaffold:
     name: 脚手架冒烟（gen 双 kind）
     steps: 检出 → pnpm/node → install --frozen-lockfile
            → pnpm gen:plugin ci-smoke-host --kind host-only
            → pnpm gen:plugin ci-smoke-dual --kind dual
            → pnpm install --no-frozen-lockfile
            → pnpm --filter dsh-plugin-ci-smoke-host verify:all
            → pnpm --filter dsh-plugin-ci-smoke-dual verify:all
            → pnpm dsh:check
   ```
5. 验证：
   - `pnpm gen:plugin --check; echo $?` → 0（6 包）；**负向**：临时给 web-ux 加回 `"./src/*"` → exit 1 且点名 `dsh-plugin-web-ux: exports["./src/*"]`。
   - 打包面（`files` 的真实效果）：
     ```bash
     for p in project-mcp workspace-config zcode-plan user-commands session-tool-toggle web-ux; do
       ( cd plugins/$p && npm pack --dry-run --json --ignore-scripts ) | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(process.argv[1], JSON.parse(s)[0].files.map(f=>f.path).join(",")))' "$p"
     done
     ```
     期望：`README.md` 自动出现；`icon.svg` 仅 4 个有 icon 的包出现；不含 `exports` 里已删的 `./src/*` 目标以外的意外文件。
   - CI：`node -e` YAML 解析出 `['verify','scaffold']`（1A 命令）；push 后两个作业均绿，scaffold 日志含 `built dsh-plugin-ci-smoke-dual` 与 `[dsh:check] 3 组门禁全部通过`（这是 B4 首次机械证据）。

### 组 6：B1 评估档案 + 收尾

1. B1：`docs/assessments/multi-root-build-unification.md`（现状差异清单 / 不迁移理由 / 迁移通过标准 / 工作量与风险 / 结论）+ `docs/assessments/README.md` 索引 + `docs/decisions/README.md` 指针 + `tooling/build-kit/README.md` 的 multi-root 行链过去。
2. 基线比对：
   ```bash
   node scripts/check-artifacts.mjs --baseline docs/assessments/multi-root-baseline; echo $?
   ```
   期望 0 且无 module-word diff（sha256 漂移允许，因组 1–5 不重建 multi-root）。
3. N4：test-kit 自测（`vitest` devDep + `test` 脚本 + AR2 白名单加 `test` + tsconfig include）。
   ```bash
   pnpm --filter @dsh-plugins/test-kit test && pnpm --filter @dsh-plugins/test-kit typecheck
   ```
   期望 ≥ 6 用例（locale-parity 4 类 + ui-primitives 导出面/形状 2 条）。
4. N2 盘点（只盘点，不改形态）：写 `n2-tsconfig-inventory.md`，命令与期望：
   ```bash
   node -e '…列出 plugins/{stt,web-ux,wsc}/test 下 *.test.ts(x) 与两段 tsconfig include 的交集…'
   ```
   结论固定为：stt 23 / web-ux 19 / wsc 7（含 stub）全部覆盖、未覆盖 0；形态保持枚举（D15）；异常时升格为待决。
5. 文档同步（X-f）：AGENTS/README 的测试段、AR 范围、命令表、目录树；可选清 N9 死分支。
6. 终检（唯一一次全链）：
   ```bash
   pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check
   git status --porcelain | grep -E 'plugins/[^/]+/lib/' | wc -l   # 期望 0（产物字节不变）
   ```
7. 组间串行说明：组 1 的 1A/1B 有顺序（先加门禁后拆条，或同批提交但以 exit 0 收口）；1C/1D 无依赖可并行。组 2/3/4/5/6 严格串行（3 依赖 2 的测试面稳定；4 依赖 3 的 config 稳定；5 依赖 4 的契约模块；6 依赖全链绿）。

---

## ⑥ 设计假设与未决项

### 6.1 设计假设（每条带验证方式）

| # | 假设 | 验证方式 |
|---|---|---|
| S1 | vitest 接受纯对象默认导出，且能加载 `@dsh-plugins/test-kit/vitest` 的 `.ts` | 组 3 首轮 `pnpm -r test`；不成立则退化为「工厂返回对象 + 消费方 defineConfig 包裹」（AR8 放行第二 import） |
| S2 | `templates/default/test/smoke.test.ts` 的产物断言在 scaffold 作业中可跑通（先生成后 build） | 组 5 CI 首跑；日志可见 |
| S3 | npm/pnpm 打包自动包含 README（与 `files` 无关） | 组 5 的 `npm pack --dry-run --json` 实测 |
| S4 | DSH `readPluginMeta` 走 Node 解析器（`./package.json` 必须显式导出） | 仓外源码 `dsh-app-boot/lib/index.js:3008`；`--dump-config` 不覆盖，故不纳入门禁 |
| S5 | host-kit `CASES` 表确实是两包规则并集（23 条映射闭合） | 组 2 对照清单；不闭合则先补表 |
| S6 | 三包 `.tsx` 组件套件在 jsdom 下真实执行（不是被 include 但跳过） | 组 3 负向 A（删 jsx 行必红） |
| S7 | `tsc -p tsconfig.host.json` 逐文件 include 能把 `test/**/*.test.tsx` 纳入且不触发 TS6059 | 组 1 的 `--listFiles` 断言 |
| S8 | CI 里两条 `pnpm install` 的总时长可接受（第二次仅解析两个新 importer） | 组 5 首跑记录；若超预算，改为只演练 host-only（需回改 T6，属待决） |

### 6.2 未决项（不阻塞落档，实施期定）

1. **project-mcp 的 `./src/*` 动机**已查明为迁入遗留（F7），无未决。
2. **smoke 实跑耗时 / 网络**：组 1 1C 实测定稿，写进 ci.yml 注释。
3. **`@fission-ai/openspec@1.16.0` 是否被 release-age 门禁拒绝**：若拒绝，按既有形态加 `minimumReleaseAgeExclude`（与 DSH 条目同形），并在实施记录里注明。
4. **`--check` 的渲染 token**：`buildTokens` 需要 `name`，真实包名去前缀后传给 `buildTokens`；若某包名不是 `dsh-plugin-<kebab>` 形态则 `--check` 直接 fail（当前 7 包均满足）。

---

## 待决问题

> 每条含 问题 / 选项 / 推荐 / 影响面。TOP 待决在最终回复中复述。

**Q1（最高优先，机制冲突）B4 冒烟作业的 install 形态与「frozen-lockfile」冲突**
- 问题：`gen` 会新增两个 workspace importer，而 `pnpm install --frozen-lockfile` 在 lockfile 缺少 importer 时**必然失败**（`pnpm-lock.yaml:203-207` 只有 7 个插件 importer）。T6 写的「gen 双 kind → 临时目录 → frozen-lockfile install」在机制上无法同时成立。
- 选项：a) **基线安装保持 frozen，gen 之后用 `--no-frozen-lockfile`（仅 CI 作业内、lockfile 写盘即弃）**；b) 给 `gen-plugin` 加 `--out` 把骨架写到 workspace 之外（`workspace:*`/`catalog:` 在仓库外无法解析，需另造临时 workspace 与注册表访问，成本高）；c) 放弃 frozen，整个作业用普通 install。
- 推荐：**a**——它保留「lockfile 完整性由 frozen 证明」的原意，把「锁文件写盘风险」限制在一次性 CI 作业里；对决策目标（实证 + 机制化）零影响，只是把一处 install flag 说清楚。
- 影响面：`.github/workflows/ci.yml` scaffold 作业；`templates/README.md` 演练步骤；若选 b 则 `scripts/gen-plugin.mjs` 要加输出目录契约（会连带 `pnpm-workspace.yaml`/AR7 的「谁是包」断言，不建议）。

**Q2 AR8 是否连带守 tsconfig include 覆盖（N2 的机器兜底）**
- 问题：N2 的漏登风险（新增测试文件不进任何 tsconfig）目前只靠盘点；AR8 已有磁盘测试文件清单，加 25 行即可同时断言「每个测试文件至少在一个 tsconfig 的 include 内」。
- 选项：a) 只按 T11 守 vitest include，N2 保持人工盘点；b) 同批给 AR8 加 tsconfig 覆盖断言。
- 推荐：**b**（若接受超出 T11 字面范围）——它把 N2 从「习惯」变成「机器事实」，且复用同一文件枚举，边际成本最低；若坚持 T11 口径则选 a，并在盘点记录里写明「下一轮再 AR 化」。
- 影响面：`scripts/check-architecture.mjs`（+25 行）；wsc 的 host include 改造（组 1D）必须先落地，否则该断言首跑即红。

**Q3 `files: src` 的发布面收敛强度**
- 问题：删掉 `exports["./src/*"]` 后，`src` 仍随包发布（`files` 6 包 + 模板都有），但已无法被 import；删它只省体积、不动运行时。
- 选项：a) 保留（本轮边界 = 声明形态，发布内容变更另立）；b) 同批删 `files: src`（6 包 + 模板），用一次 `npm pack` 实测兜底。
- 推荐：**a**——删除改变安装内容，超出「manifest 审计」范围；保留并在差异清单里写明「随包分发源码」是发布形态事实，未来若要瘦身单独立项。
- 影响面：6 个插件 `package.json#files` + 模板；`npm pack` 面；若选 b 需要额外的 tag 安装演练证据。

**Q4 B1 评估档案的落点**
- 问题：`docs/decisions/README.md:32` 规定未决讨论不建 ADR；评估档案放哪？
- 选项：a) `docs/assessments/`（新建目录 + 索引）；b) `openspec/changes/<change>/artifacts/`（随变更归档，但评估的寿命长于变更）；c) `plugins/multi-root-workspace/docs/`（插件级，但迁移目标是仓级 build-kit）。
- 推荐：**a**——评估属仓级结构面、寿命长于单次变更，且与 ADR 目录显式区分；索引里注明「非 ADR、不做决策」。
- 影响面：`docs/` 新目录与两个 README 指针；`tooling/build-kit/README.md` 的 multi-root 行。

---

## 附：与收敛留痕的对齐核对（自检）

| 留痕结论 | 本文落点 |
|---|---|
| T1 test-kit 扩为测试接线底座、vitest-free、ADR 修订 | D1 / 3.1 / 1.2 / 1.1 ADR 行 |
| T2 断言壳进 build-kit 产物契约模块、assertSelfContained 收口 | D3 / D4 / 3.3 / 组 4 |
| T4 A3 删规则级留策略+wiring+接线用例 | D6 / 组 2 对照清单 / 组 2 |
| T6 B4 CI 冒烟作业（install flag 见 Q1） | D11 / 组 5 |
| T8 A4 审计→删减→文档+`--check` | D8 / D9 / D10 / 3.4 / 组 5 |
| T9 单变更分批（组间串行） | ⑤ 开头的组间串行声明 |
| T10 模板按 kind 分化（dual 工厂 + stub，host-only 无 config） | 1.4 / D16 / 组 3 |
| T11 AR 化薄入口门禁 | 3.2 / 组 3 |
| T5 批次序（债 → A3 → A1 → A2 → 审计） | ⑤ 的组 1→6 |
| multi-root 显式排除、css 计数留包内、三份词集保留 | 1.3 / D5 / 组 2-4 |

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：C1 不成立——本变更全部为工程收敛（测试接线层 / CI / manifest 审计 / 门禁脚本 / 文档口径），无任何界面产出，命中排除表「纯后端 / CLI / 配置 / 脚本」行。
