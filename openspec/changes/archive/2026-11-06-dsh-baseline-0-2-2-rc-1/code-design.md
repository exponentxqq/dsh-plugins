# code-design.md — DSH 基线 0.2.1-rc.5 → 0.2.2-rc.1 代码级蓝图

> 阶段：1.7（代码设计线）。输入：`explore.md`（需求级草案）、`decisions.md`（四项已定 + 支持矩阵裁剪到 0.2.1+ 三项）。
> 本文件只回答「改哪些文件、改成什么形状、为什么这么定、怎么证明」；不重述上游需求调研结论，不发版（decisions Q1 已定）。

**范围一句话**：走仓库既有升级车道，把整个 workspace 重指到 DSH `0.2.2-rc.1`（cordis `4.1.0`、schemastery `3.19.0`，zod 保持 `4.4.3`），把 multi-root 的精确支持矩阵**裁剪并提升**为 `0.2.1-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1` 三项，同步文档，并在 web profile 里把两个官方包一并升到 `0.2.2-rc.1`，使 profile 整体零 incompatible。

---

## ① 触达面清单

除「官方包升级」外，全部落在**根仓 `/home/xuqinqin/develop/person/dsh-plugins`**（下表「仓」列统一标「本仓」；profile 条目标「profile 数据目录，非仓库文件」）。

### A. 代码与配置（脚本自动 + 少量人工）

| # | 文件路径 | 仓 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| A1 | `scripts/dsh-baseline.mjs` | 本仓 | 唯一基线常量改目标版本 | L13 `0.2.1-rc.5` → `0.2.2-rc.1`（由 `pnpm dsh:upgrade` 正则重写）；头注释「四个插件 / 三个软插件」是历史计数（实况 7 / 6），可顺带改正（纯注释，无门禁影响） |
| A2 | `pnpm-workspace.yaml` | 本仓 | 豁免清单与目标树精确对齐；probe overrides 生命周期 | 脚本重写全部 `@deepseek-ai/dsh*@<ver>` 行与 `@deepseek-ai/cordis@4.0.5` 行；**人工**：`@deepseek-ai/schemastery@3.18.5` → `@3.19.0`、补 `@deepseek-ai/dsh-client-ui-context-menu@0.2.2-rc.1`、删候选树里已消失的包；`--probe` 期间临时追加 overrides 块，组 4 重跑不带 `--probe` 即移除 |
| A3 | `pnpm-lock.yaml` | 本仓 | 全量重装生成 | 预期 6000+ 行级 diff（上轮 6677 行）；**不手工编辑** |
| A4 | `plugins/project-mcp/package.json`、`plugins/user-commands/package.json`、`plugins/web-ux/package.json`、`plugins/session-tool-toggle/package.json`、`plugins/zcode-plan/package.json`、`plugins/workspace-config/package.json` | 本仓 | 六个软插件的开发 pin 与安装契约 | 全部 `@deepseek-ai/dsh*` devDeps → `0.2.2-rc.1`、`@deepseek-ai/cordis` → `4.1.0`（脚本）；`dsh.engines.dsh` 与**全部** DSH peer → `>=0.2.2-rc.1 <0.3.0`（脚本；web-ux 有 3 个 DSH peer，均被重写）；**人工**：web-ux / session-tool-toggle / zcode-plan 的 `@deepseek-ai/schemastery` `3.18.5` → `3.19.0` |
| A5 | `plugins/multi-root-workspace/package.json` | 本仓 | 精确契约插件：开发 pin 跟随、支持矩阵人工收敛 | 35 项 DSH devDeps → `0.2.2-rc.1`、cordis → `4.1.0`（脚本）；**人工**：21 项 DSH peer 枚举 → `"0.2.1-rc.2 || 0.2.1-rc.5 || 0.2.2-rc.1"`；cordis peer `>=4.0.1 <5.0.0` 不动；`dependencies.zod` **保持 `4.4.3`**；`peerDependenciesMeta` 不动 |
| A6 | `plugins/multi-root-workspace/src/compat/dsh-version.ts` | 本仓 | 支持矩阵唯一真源：裁剪 + 提升一次完成 | L34 数组由 11 项改为 3 项；类型 `SupportedDshRelease` 随之收敛；其余（`REQUIRED_CORE_PACKAGES` / `OPTIONAL_CORE_PACKAGES` / `classifyInstallation` / `compatEnforcement`）**零改动** |
| A7 | `plugins/multi-root-workspace/lib/compat-<newhash>.js`（新增，旧 hash 删除）、`lib/compat.js`、`lib/index.js`、`lib/types/compat/dsh-version.d.ts` | 本仓 | 提交物重建 | 由 `pnpm build` 生成；`clean-lib.mjs` 会删旧内容哈希 chunk；`index.js` 因 import 的 chunk 名变化而变（上轮同样 2 行） |
| A8 | `plugins/web-ux/lib/index.js`、`plugins/session-tool-toggle/lib/index.js`、`plugins/zcode-plan/lib/index.js` | 本仓 | schemastery 升级后的内联产物重建 | 这三个包的 `build.mjs` 仅 `node:*` external，schemastery 被内联（lib 中可 grep 到 12 处 `schemastery`）；3.19.0 重建后**预期有 diff**，属构建产物而非源码改动 |
| A9 | `plugins/multi-root-workspace/scripts/check-dsh-compat.mjs`、`plugins/multi-root-workspace/tests/compat.spec.ts` | 本仓 | **核对，不修改** | 两者的期望值都从 `SUPPORTED_DSH_RELEASES` 派生（`supported.join(' || ')`），裁剪/提升后自动跟随；列为触达面是为了显式声明「不得手写第二份清单」 |
| A10 | `scripts/upgrade-dsh.mjs`、`scripts/check-dsh-baseline.mjs` | 本仓 | upgrade-dsh **新增 schemastery 推导重写**（D5）；check-dsh-baseline 行为不改 | `upgrade-dsh.mjs`：新增 `schemasteryRequiredBy(target)` + `repointPlugin`/`repointWorkspace` 的 schemastery 重写分支（与 cordis 同构）；`check-dsh-baseline.mjs`：零改动（第 6 条继续兜底）；可选：两脚本头注释的「四个 / 三个」计数与实况同步（纯注释） |

### B. 文档（multi-root 子包 + 根文档）

| # | 文件路径 | 仓 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| B1 | `plugins/multi-root-workspace/AGENTS.md` | 本仓 | H3 段落描述当前契约 | L96：支持列表改为三项 + `0.2.2-rc.1` 形状结论（cordis `~4.1.0`、schemastery `3.19.0`、zod 仍 `4.4.3`、session format 仍 4、新增 context-menu 包只记录未接入）；0.1.x 形状叙述保留并标注为历史 |
| B2 | `plugins/multi-root-workspace/README.md` / `README.en.md` | 本仓 | 环境要求段 | 中文 L41/L43、英文 L39/L41：支持列表三项、dev pin `0.2.2-rc.1`；并补一句「运行 DSH 0.2.2+ 需要 Node `>=24.9.0`（dsh 自身 `engines`，仓库工具链 `engines` 不变）」——0.2.2-rc.1 首次声明该 engines（rc.5 无此字段，实测）（双语必须同步，`docs:check` 校验成对） |
| B3 | `plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` | 本仓 | 记录裁剪决策 + 提升证据 | 在 L238（实测段）之后、L240 `## Related Documents` 之前追加「支持矩阵裁剪与提升（2026-11-06）」；写明 11→3 的**裁剪**理由（宿主已全量 0.2.2-rc.1，0.1.x 项是未再使用的回滚声明负担）与实测计数；不删历史节 |
| B4 | `plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` | 本仓 | 工作流里的版本样例 | L10 基线 `0.2.2-rc.1`；L173/L177 命令样例改 `0.2.2-rc.1`；L181「20 项 DSH peer」→「三项 DSH peer」 |
| B5 | `plugins/multi-root-workspace/.agent/note/dsh-compat-contract.md` / `.en.md` | 本仓 | Agent 知识库 | 中文 L16/L23/L24/L127/L134/L182/L186-L188 与英文对应行：数组、peer 串、dev pin、升级命令样例、0.2.2-rc.1 形状结论；L140 的「zod 必须与 storage-domain 的 4.4.3 对齐」**保留不动**（本次仍然成立且是本次决策依据） |
| B6 | 根 `README.md` / `AGENTS.md` | 本仓 | 修历史漂移（decisions Q2） | `README.md:32`、`AGENTS.md:38-39`：`0.2.1-rc.2` → `0.2.2-rc.1`；顺带把 README 的「五个软插件」改为「六个」 |
| B7 | `plugins/multi-root-workspace/docs/troubleshooting/unsupported-dsh-release.md` | 本仓 | **不改** | 全文无版本字面量，按 allowlist 动态描述；列为触达面是为了声明「确认无需改」 |
| B8 | `openspec/**`、ADR-0002/0003/0010/0012 历史段 | 本仓 | **不改** | 与本变更无文件交集；ADR-0009 之外的 ADR 历史叙述保留 |

### C. 仓外操作对象（profile 数据目录，`docker exec dsh` 内）

| # | 路径/对象 | 仓 | 改动意图 | 关键改动点 |
| --- | --- | --- | --- | --- |
| C1 | `~/.dsh/profiles/web/package.json:31-32` | profile（非仓库文件） | 两个官方包升版 | `@deepseek-ai/dsh-browser-use`、`@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` → `0.2.2-rc.1`，**精确版本**（`--save-exact`） |
| C2 | `~/.dsh/profiles/web/pnpm-lock.yaml` 与 `node_modules` | profile（非仓库文件） | 由 `dsh plugin add` 驱动 pnpm 重装 | 传递包 `@deepseek-ai/dsh-experimental-browser-use-runtime` 随之 → `0.2.2-rc.1` |
| C3 | profile `cordis.patch.yml`、`dsh.profile.bundles`、`pnpm.overrides.chrome-devtools-mcp`、`pnpm-workspace.yaml` | profile（非仓库文件） | **不改** | browser-use 行的 `name` 不变；两包不声明 `dsh.bundle`，add 不会追加 bundles；`chrome-devtools-mcp: 1.12.0` 覆盖保留 |

---

## ② 证据锚

以下全部为本次只读实测（2026-11-06，main @ `148bf19`，脏文件仅 `openspec/changes/project-mcp-isolation-enforcement/*` 3 个）。

| 模块 | 锚点 | 代码/事实 |
| --- | --- | --- |
| 基线常量 | `scripts/dsh-baseline.mjs:13`、`:23-28`、`:32` | `DSH_BASELINE = '0.2.1-rc.5'`；`softDshRange` 用 `/(\d+)\.(\d+)\./` 取主次版本拼 `<major>.<minor+1>.0`；`SOFT_DSH_RANGE` 由基线派生 |
| 升级引擎 | `scripts/upgrade-dsh.mjs:145-175` | `repointPlugin` 只重写 DSH devDeps + cordis；`hasExactContract()`（`:159`）命中 `src/compat/dsh-version.ts` 时**跳过** engines/peer 重写 |
| 升级引擎（豁免/探测） | `scripts/upgrade-dsh.mjs:197-235` | 正则批量重写 `- '@deepseek-ai/dsh*@<ver>'` 行与 cordis 行；`--probe` 追加 workspace-only `overrides:`，重跑不带 `--probe` 移除 |
| 升级引擎（收尾提示） | `scripts/upgrade-dsh.mjs:294-320` | `softDshRange(target)` + `cordisRequiredBy(target)`；stdout 打印基线/范围/cordis/重写条数；尾部提示「人工追加 allowlist 与 peer，然后 compat:check」 |
| 基线检查器 | `scripts/check-dsh-baseline.mjs:181-193` | 软插件每个 DSH peer 必须等于 `SOFT_RANGE`（web-ux 的 3 个 peer 都受此约束） |
| 基线检查器（精确契约） | `scripts/check-dsh-baseline.mjs:195-210` | 从 TS 源码正则读 `SUPPORTED_DSH_RELEASES`，要求包含基线，并调用插件内 `compat:check` |
| 基线检查器（豁免对账） | `scripts/check-dsh-baseline.mjs:228-238` | 豁免集合与 lockfile 中 `isAllowlisted()` 解析集合必须精确相等（缺项与陈旧项都报错） |
| 兼容静态检查 | `plugins/multi-root-workspace/scripts/check-dsh-compat.mjs:77-82` | `expectedRange = supported.join(' || ')`，逐项比对每个 DSH peer —— 裁剪后 peer 串顺序必须等于数组顺序 |
| 兼容契约测试 | `plugins/multi-root-workspace/tests/compat.spec.ts:114-121` | 断言 `peerDependencies` 严格等于 `SUPPORTED_DSH_RELEASES.join(' || ')`（派生，无需手改） |
| 支持矩阵 | `plugins/multi-root-workspace/src/compat/dsh-version.ts:34` | 现为 11 项精确数组，止于 `0.2.1-rc.5` |
| 精确 peer 枚举 | `plugins/multi-root-workspace/package.json:94-117` | 22 项 peer：cordis `>=4.0.1 <5.0.0`（L95）+ 21 项 DSH 精确或（L96-116） |
| 开发 pin 规模 | `plugins/multi-root-workspace/package.json:165-216` | 35 项 `@deepseek-ai/dsh*` devDeps + cordis `4.0.5`（L166） |
| zod 生产依赖 | `plugins/multi-root-workspace/package.json:231` | `"zod": "4.4.3"`；`tsdown.config.ts:34-38`、`:82` 把 `dependencies` 全部 external，故运行时用它自己的 4.4.3 |
| zod 跨包契约 | `plugins/multi-root-workspace/src/registry.ts:57-58`、`:199` | `defineDomain` 来自 `@deepseek-ai/dsh-storage-domain`，持久化校验用本包 zod；契约伙伴的 zod 版本决定本包 pin |
| zod 跨包契约（笔记） | `plugins/multi-root-workspace/.agent/note/dsh-compat-contract.md:140` | 明文记载：multi-root 的 zod 生产依赖必须与 storage-domain 的精确 zod 对齐，否则 `defineDomain` 类型与运行时都会分叉 |
| schemastery 声明 | `plugins/web-ux/package.json:85`、`plugins/session-tool-toggle/package.json:70`、`plugins/zcode-plan/package.json:37` | 三处 devDep 均 `3.18.5` |
| schemastery 使用/内联 | `plugins/web-ux/src/config.ts:21`、`plugins/session-tool-toggle/src/host/index.ts:95`、`plugins/zcode-plan/src/host/index.ts:35`；`web-ux/build.mjs:116`、`session-tool-toggle/build.mjs:113`、`zcode-plan/build.mjs:33` | 三者 `import Schema from '@deepseek-ai/schemastery'`，而 esbuild external 仅 `node:*` → 当前产物内联 3.18.5 |
| zod schema 交宿主 | `plugins/session-tool-toggle/src/host/index.ts:728-735` | `stateSchema: PROJECTION_STATE_SCHEMA` 交给 `sessionProjections.register`；宿主侧 `dsh-session-projection` 对 `def.stateSchema.parse` 调用（host 包内实测 379/424 行） |
| 软插件范围现值 | 六个软插件 `package.json`（project-mcp / user-commands / web-ux / session-tool-toggle / zcode-plan / workspace-config） | `dsh.engines.dsh` 与 DSH peer 均为 `>=0.2.1-rc.5 <0.3.0`；web-ux 另有 `dsh-session-persistence`、`dsh-workspace` 两个 DSH peer 同范围 |
| 豁免清单现状 | `pnpm-workspace.yaml:25-339` | cordis 行 L26、schemastery 行 L70；DSH 家族约 300 行；libreoffice-kit 仍 `0.1.5`（L333-338） |
| 提交物形态 | `plugins/multi-root-workspace/lib/types/compat/dsh-version.d.ts:31` | 生成的字面量联合数组；源码改后必须重建才会变 |
| 文档锚 | `plugins/multi-root-workspace/AGENTS.md:96`；`README.md:41,43`；`README.en.md:39,41`；`docs/decisions/ADR-0009-dsh-compat-contract.md:232-240`；`docs/development/plugin-development-workflow.md:10,13,167,173,177,181`；`.agent/note/dsh-compat-contract.md:16,23,24,127,134,182,186,188`；根 `README.md:32`、`AGENTS.md:38-39` | 基线/支持列表/dev pin/命令样例的现存字面量 |
| profile 现状 | `~/.dsh/profiles/web/package.json:31-32` | 两官方包精确 `0.2.1-rc.5`；同文件 `dsh.profile.bundles` 20 项、`pnpm.overrides.chrome-devtools-mcp: 1.12.0` |
| 上游形状（npm 实测） | `npm view`（容器内执行） | `dsh@0.2.2-rc.1` → cordis `~4.1.0`、node `>=24.9.0`；宿主全局树 cordis `4.1.0`、zod `4.6.7`、schemastery `3.19.0`、新增 `dsh-client-ui-context-menu@0.2.2-rc.1`、libreoffice-kit 仍 `0.1.5` |
| 官方包形状（npm 实测） | `npm view` | `dsh-browser-use@0.2.2-rc.1` peer：cordis `~4.1.0` + `dsh-brand 0.2.2-rc.1`；`chrome-devtools-mcp@0.2.2-rc.1` peer：cordis `~4.1.0` + 5 项 `0.2.2-rc.1`，依赖 `chrome-devtools-mcp 1.9.0`（profile override 仍压到 1.12.0） |
| profile 实测基线 | 容器内 `dsh plugin --profile web list` / `--dump-config` / `--dump-config-schema` | 3 个包 incompatible（4 条 warning 行，multi-root 重复两次）；`dump-config-schema` stderr 24 行、其中 3 行含 multi-root；`dump-config` 里 `multi-root-` 行数 = 0（bundle 被跳过） |

---

## ③ 接口与数据形状

本变更**不新增任何公开 API、不新增配置键、不改 session format**；形状全部是「既有声明被重写成的确切值」。

### 3.1 基线派生函数与常量（`scripts/dsh-baseline.mjs`）

```ts
export const DSH_BASELINE: string            // 改后：'0.2.2-rc.1'
export function softDshRange(baseline = DSH_BASELINE): string
// softDshRange('0.2.2-rc.1') === '>=0.2.2-rc.1 <0.3.0'
// 推导：match[1]='0' → major 0；match[2]='2' → minor 2；`<${0}.${3}.0`
export const SOFT_DSH_RANGE: string          // '>=0.2.2-rc.1 <0.3.0'
```

约束：版本必须精确（正则 `/^\d+\.\d+\.\d+(?:-[\w.]+)?$/`），否则 `softDshRange` 抛错。

### 3.2 支持矩阵（`src/compat/dsh-version.ts:34`）

```ts
export const SUPPORTED_DSH_RELEASES = ['0.2.1-rc.2', '0.2.1-rc.5', '0.2.2-rc.1'] as const
export type SupportedDshRelease = '0.2.1-rc.2' | '0.2.1-rc.5' | '0.2.2-rc.1'
```

- **顺序即语义**：`check-dsh-compat.mjs:77` 与 `compat.spec.ts:114` 都用 `supported.join(' || ')` 生成 peer 期望串，所以数组顺序必须与 peer 串顺序逐字一致。
- 生成物：`lib/types/compat/dsh-version.d.ts` 变为 `readonly ["0.2.1-rc.2", "0.2.1-rc.5", "0.2.2-rc.1"]`。
- `REQUIRED_CORE_PACKAGES`（6 项）、`OPTIONAL_CORE_PACKAGES`（15 项）、`CORE_PACKAGES`、`CompatVerdict`（`supported | incomplete | mixed | unsupported`）、`CompatReport`、`classifyInstallation(readVersion?)`、`compatEnforcement(env?)` 全部**签名与语义不变**。
- 对宿主 0.2.2-rc.1 的期望返回值：`verdict: 'supported'`、`release: '0.2.2-rc.1'`、`packages` 按 `CORE_PACKAGES` 顺序。

### 3.3 multi-root peer 枚举（21 项 DSH 同一串）

```json
"@deepseek-ai/dsh-agent": "0.2.1-rc.2 || 0.2.1-rc.5 || 0.2.2-rc.1",
// … 共 21 个 @deepseek-ai/dsh-* 键，值完全相同
"@deepseek-ai/cordis": ">=4.0.1 <5.0.0"   // 不变
```

`peerDependenciesMeta` 的 15 个 `optional: true` 条目不变（键集不变，只是值变短）。

### 3.4 软插件安装契约（六个包）

```json
"dsh": { "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0" } },
"peerDependencies": { "@deepseek-ai/dsh": ">=0.2.2-rc.1 <0.3.0" }
```

- web-ux 额外两个 DSH peer 同值：`@deepseek-ai/dsh-session-persistence`、`@deepseek-ai/dsh-workspace` → `>=0.2.2-rc.1 <0.3.0`。
- `react` peer（web-ux / session-tool-toggle / workspace-config 的 `^18.2.0`）不动。

### 3.5 依赖 pin（确切值）

| 包 | 字段 | 改后 |
| --- | --- | --- |
| 七个插件 | 全部 `@deepseek-ai/dsh*` devDeps | `0.2.2-rc.1` |
| 七个插件 | `@deepseek-ai/cordis` devDep | `4.1.0` |
| web-ux / session-tool-toggle / zcode-plan | `@deepseek-ai/schemastery` devDep | `3.19.0`（人工） |
| multi-root / session-tool-toggle | `dependencies.zod` | `4.4.3`（**保持**，人工确认不升） |
| multi-root | `@deepseek-ai/node-addon-system` / `koffi` | 不动 |

### 3.6 豁免清单条目形态（`pnpm-workspace.yaml`）

行形态固定：两个空格缩进 + 单引号 + `name@version`。

```yaml
  - '@deepseek-ai/cordis@4.1.0'
  # ……约 300 行 DSH 家族全部 @0.2.2-rc.1
  - '@deepseek-ai/dsh-client-ui-context-menu@0.2.2-rc.1'   # 新增（0.2.2 树新包）
  - '@deepseek-ai/schemastery@3.19.0'                       # 3.18.5 → 3.19.0（人工）
  - '@deepseek-ai/libreoffice-kit@0.1.5'                    # 不变
```

新增/删除条目**不由** `upgrade-dsh.mjs` 生成，由 `pnpm dsh:check` 第 6 条的 missing/stale 清单驱动人工增删。

### 3.7 probe overrides（仅探测期）

```yaml
# BEGIN DSH probe overrides
overrides:
  '@deepseek-ai/cordis': '4.1.0'
  '@deepseek-ai/dsh': '0.2.2-rc.1'
  # ……各插件直接声明的 DSH 包，排序后逐条
# END DSH probe overrides
```

块由 `--probe` 写入、不带 `--probe` 重跑时整体移除；存在自定义 `overrides:` 时脚本拒绝覆盖。

### 3.8 profile 依赖形状（仓外）

```json
"@deepseek-ai/dsh-browser-use": "0.2.2-rc.1",
"@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp": "0.2.2-rc.1"
```

精确版本（非 `^`）：宿主按**精确版本**做 peer 门禁，`^0.2.2-rc.1` 将来可能解析到 `0.2.2` 正式版而被 0.2.2-rc.1 宿主拒绝。

---

## ④ 决策记录

### D1 栈识别结论：本任务归属 `dsh-plugin-writer`（skill 已加载）

- **结论**：栈是「DSH 自定义插件单仓（pnpm workspace，7 个 bundle 包）+ 仓库级版本升级车道」，适用 skill 名为 **`dsh-plugin-writer`**（本次已加载，base dir `/home/docker/.agents/skills/dsh-plugin-writer`，仅 SKILL.md + 4 篇 references，无版本字面量需要跟随）。
- **证据**：① skill §1 适用判定覆盖「形态 / 入口 / 构建 / 声明 / **安装链**」的结构性修改，本次改的正是声明（peer/engines/devDeps）与安装链；② §6 真源指路把基线真源指向 `scripts/dsh-baseline.mjs`，与 A1 一致；③ §5 生命周期第 6/7/8 步（`pnpm dsh:check` → profile `add` → `--dump-config-schema`）正是组 4/7 的验收动作；④ §7 反例 F12/F13（`--dump-config` 只证明注册行，`--dump-config-schema` 才真实 import；双端包 scan 证据在重启后）直接约束组 7 的证据强度；⑤ skill 维护条款「`pnpm dsh:upgrade` 后复验 skill 引用的路径与命令」——已复验：references 内无基线版本字面量，无需同步。
- **三条硬约束的落点（skill 规范即设计约束）**：
  - **分层方向**（§2 决策树 / §4 模板对照表）：本变更**不改任何包的形态选型**——multi-root 仍是「特例（精确 allowlist 三处落点：枚举常量 / peer 枚举 / compat gate）」，六个软插件仍是「软范围由基线派生」，新增包为零。这也解释了为什么这次是**裁剪**矩阵而不是给软插件加枚举：后者会推翻 §2 的选型结论。
  - **复用优先**：不新建脚本、不新建清单、不新建文档形态——复用 `upgrade-dsh` / `check-dsh-baseline` / `compat:check` 三件既有门禁，复用 ADR-0009 与 `.agent/note` 既有结构（D8 是这条的落地）。
  - **任务拆分粒度**（§5 生命周期）：组 1 ≈ 步骤 4+5（安装 + 探测型 verify:all，warn）；组 2 ≈ 步骤 3 的形状核对；组 3 = 人工提升（skill 明确「提升是之后人工做的事」）；组 4 ≈ 步骤 6（dsh:check 契约面）；组 5 ≈ 步骤 5+6 全量；组 6 = 文档；组 7 = 步骤 7+8（profile `add` + `--dump-config-schema`）。skill §5「止于安装验证、发布不属本 skill」与 decisions「不发版」一致。
- **被否方案**：走 `openspec-propose`（本变更不是行为规格变更，且仓内已有在途 change；升级车道是 ADR-0009 既有流程）；走 `cordis-plugin-development`（那是 profile 内一次性 bundle，不落本仓）。
- **反例**：若按「profile 内一次性功能」处理，不会改仓库基线与 allowlist；当前实测就是反面教材——`dsh plugin --profile web list` 中 `dsh-plugin-multi-root-workspace@1.5.0` 已被 0.2.2-rc.1 宿主拒绝，`--dump-config` 里 `multi-root-` 行数 = 0（整个 bundle 被跳过），不落仓库改不动。

### D2 走既有升级车道，不手工逐文件改 pin

- **决策**：`pnpm dsh:upgrade 0.2.2-rc.1 --probe` → install → warn 模式 verify:all → 人工提升 → 去 probe → enforce 全绿。
- **理由**：脚本的 21 项 peer / 35 项 devDep / ~300 行豁免一次性重写是可重复的；手工改必然漏项，而漏项由 `dsh:check` 在第 2/3/6 条报出，但代价是反复往返。
- **被否方案**：手工 sed/逐文件改。
- **反例**：上轮 `ee32d39`（rc.2→rc.5）单提交触达 26 个文件、`pnpm-lock.yaml` 6677 行；手工模式下「devDeps 改了、豁免没改」会先撞 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`，再撞 `dsh:check` 第 6 条，两次红都在装完之前。

### D3 裁剪与提升在一次编辑里落定（不做「先追加、后裁剪」）

- **决策**：`SUPPORTED_DSH_RELEASES` 一步从 11 项改成 `['0.2.1-rc.2','0.2.1-rc.5','0.2.2-rc.1']`，21 项 peer 同步改成同一串。
- **理由**：数组与 peer 串由 `join(' || ')` 强绑定；分两步会产生一个「数组 12 项、peer 3 项」的中间态，`compat:check` 与 `compat.spec.ts` 都必红。
- **被否方案**：先追加 0.2.2-rc.1（12 项）提交一次、再裁剪提交一次。
- **反例**：`check-dsh-compat.mjs:77-82` 逐项比对 peer 与 `expectedRange`；中间态任何一次 `pnpm dsh:check`（第 4 条会调 `compat:check`）都会失败，等于把一个可绿的提交拆成两个必红的提交。

### D4 zod 保持 `4.4.3`，不跟随宿主树的 `4.6.7`

- **决策**：multi-root `dependencies.zod` 与 session-tool-toggle `dependencies.zod` 均保持 `4.4.3`。
- **理由**：插件消费的 zod 契约伙伴仍是 4.4.3——`@deepseek-ai/dsh-storage-domain@0.2.2-rc.1` 声明 `zod: 4.4.3`（multi-root 的 `defineDomain` 跨包边界），`@deepseek-ai/dsh-session-projection@0.2.2-rc.1` 也仍是 `4.4.3`（session-tool-toggle 的 `stateSchema` 交给宿主 `register`，宿主只调用 `def.stateSchema.parse`）。宿主树顶层出现的 4.6.7 来自声明 `^4.4.3` 的子包（如 `dsh-typert-protocol`、`dsh-working-directory`），与本插件无关。
- **被否方案**：跟随「树内出现 4.6.7」把两个插件的 zod 升到 4.6.7。
- **反例**：`.agent/note/dsh-compat-contract.md:140` 明文记录过这条：multi-root 的 zod 必须与 storage-domain 的精确 `4.4.3` 对齐，否则 `defineDomain` 的类型与运行时都会分叉（当时用 `^4.6.2` 装出了第二份 zod）。升 4.6.7 就是重演该事故。

### D5 schemastery `3.18.5` → `3.19.0`，**纳入 `upgrade-dsh.mjs`（从候选树推导）**（落档分歧点 Q-C 已决）

- **决策**：`upgrade-dsh.mjs` 新增 `schemasteryRequiredBy(target)`——用既有 `npmOutput` 机制执行 `npm view @deepseek-ai/dsh-tools@<target> dependencies.@deepseek-ai/schemastery`，解析 `~`/`^` 范围取精确版本（与 `cordisRequiredBy` 同构、同一拒绝策略：非单一 tilde/caret 即抛错）；`repointPlugin` 对 devDeps 中的 `@deepseek-ai/schemastery` 重写为该精确版，`repointWorkspace` 重写豁免行的版本号。web-ux / session-tool-toggle / zcode-plan 三处 devDep 与豁免条目随脚本自动 `3.18.5 → 3.19.0`。
- **理由**：`@deepseek-ai/dsh-tools@0.2.2-rc.1` 与 `dsh-web-app@0.2.2-rc.1` 均声明 `~3.19.0`（rc.5 上是 `~3.18.5`），树会被强制拉到 3.19.0；三个插件把 schemastery 内联进产物、`Config` 交给宿主读取，保留 3.18.5 会让树里同时存在两份且跨版本实例识别有风险。候选树声明是单一真源，推导全自动，无需人工传版本；`dsh:check` 第 6 条继续兜底对账。
- **被否方案**：维持人工（每次升级重复同一人工步骤，用户已否）；通用 `--extra-pin <name>@<version>` 参数（仍需人工知道目标版，半自动）。
- **反例**：只改 devDep 不改豁免 → `dsh:check` 报 `release-age allowlist has stale @deepseek-ai/schemastery@3.18.5` + `is missing @deepseek-ai/schemastery@3.19.0`；推导解析到非单一 tilde/caret 声明（如 `>=3.x`）时必须抛错拒绝而非猜测（沿用 `cordisRequiredBy` 的拒绝策略），否则脚本会在下一次上游改用宽范围时静默写出错误 pin。
- **执行期实测（组 1 完成，2026-11-06）**：`schemasteryRequiredBy` 与 `cordisRequiredBy` 同构落地（`npmOutput(['view', '@deepseek-ai/dsh-tools@<target>', 'dependencies.@deepseek-ai/schemastery', '--json'])` + 正则 `/^[\^~]?(\d+\.\d+\.\d+)$/u`，非单一声明抛错含 `JSON.stringify` 原文）；`repointPlugin` devDep 分支与 `repointWorkspace` 豁免行分支（行缺失即抛错、allowances 计数）同步落地；主流程推导先于 repoint/probe，新增日志行 `[upgrade] schemastery pin: <版本>`；头注释计数同步（四个→七个插件、三个→六个软插件）。实测：当前基线 0.2.1-rc.5 下 `dsh-tools` 声明 `~3.18.5` → 解析 3.18.5 正确；三条验证句全过（require exit 0 幂等、`--print-installed` exit 0、grep 计数 2）。加载语义留痕见 tasks.md 附录 R1。

### D6 官方包用 `dsh plugin add --save-exact`，不手改 profile `package.json`

- **决策**：`docker exec dsh dsh plugin --profile web add --save-exact @deepseek-ai/dsh-browser-use@0.2.2-rc.1 @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.2.2-rc.1`。
- **理由**：`dsh plugin` 的帮助原文是「manage a profile's plugins by forwarding the remaining arguments to pnpm」——`add` 是官方车道，一次完成写 manifest + 解析 + 安装；`--save-exact` 是因为 pnpm 默认 save-prefix 为 `^`（profile 无 `.npmrc` 覆盖），而宿主按精确版本做 peer 门禁。两包不声明 `dsh.bundle`（只读实测），因此 `add` 不会污染 `dsh.profile.bundles`。
- **被否方案**：手改 profile `package.json` 后跑 `dsh plugin --profile web install`。
- **反例**：手改 manifest 后漏跑 install，重启加载的仍是旧 `node_modules`，`plugin list` 继续报同两条 incompatible，而 manifest 看起来「已升级」；或手改成 `^0.2.2-rc.1`，下一次 profile install 漂到 `0.2.2` 正式版，被 0.2.2-rc.1 宿主整包拒绝。

### D7 ADR-0009 追加新节、保留 0.1.x 历史叙述

- **决策**：只在 `ADR-0009` 末尾（`## Related Documents` 前）追加「支持矩阵裁剪与提升（2026-11-06）」；旧的提升记录原样保留。
- **理由**：ADR 是审计记录，历史节解释了适配器为什么有那些分支（`confine` 同步/异步、renderer 改名、session format 4 等）；decisions 说「按需精简」，选择「加现状结论 + 保留历史」，删历史会丢失证据。
- **被否方案**：重写 ADR 的支持矩阵章节、删除 0.1.x 叙述。
- **反例**：删掉 `0.1.6-alpha.2` 的 session catalog 事故记录后，`src/compat/client-session.ts` 的 `retainedBy.mainView` 分支就变成无出处的「魔法代码」，后人会当死代码删掉。

### D8 检查器与测试零改动：不手写第二份清单

- **决策**：`check-dsh-compat.mjs`、`check-dsh-baseline.mjs`、`compat.spec.ts` 不改；期望值全部从 `SUPPORTED_DSH_RELEASES` 派生。
- **理由**：这正是 ADR-0009 的契约形式；任何硬编码 11/3 的断言都会在下次升级时制造第三个漂移点。
- **被否方案**：在测试里显式写 `expect(SUPPORTED_DSH_RELEASES).toHaveLength(3)`。
- **反例**：`tests/compat.spec.ts` 只断言 `length > 0` 与去重；曾有人加过精确长度的断言会在每次提升时红，而它证明不了任何契约（长度不是契约，`peerDependencies` 与数组相等才是）。

---

## ⑤ 逐任务组实现要点

与 `decisions.md` 的收尾范围一一对齐（**不发版**；发版、打 tag、acp/headless 重装显式排除）。

### 组 1 — probe 升级与探测

**动作**

```bash
# 0. 前置：只允许 3 个 openspec 脏文件存在
git status --porcelain
# 0.5 执行面约定（Q-F 处置）：pnpm 验证命令统一在 dsh 容器内执行（容器 node 24.21.0 满足
#     dsh 0.2.2-rc.1 的 engines >=24.9.0；宿主包装链 volta 22.18 仅记录，失败时容器复跑兜底）。
# 1. 重指基线 / devDeps / cordis / schemastery / 软范围 / 豁免 + 临时 probe overrides
docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && pnpm dsh:upgrade 0.2.2-rc.1 --probe'
# 2. 候选树整棵树都是刚发布的，必须放开年龄门禁
docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0'
# 3. warn 模式跑完整矩阵（候选此时按设计不在 allowlist 上）。
#    环境变量必须写进容器内层命令（实测宿主 export 不穿透包装脚本）。
docker exec dsh sh -lc 'cd /home/xuqinqin/develop/person/dsh-plugins && DSH_MULTI_ROOT_COMPAT=warn pnpm --filter dsh-plugin-multi-root-workspace verify:all'
```

**产物**：A1/A2（含临时 overrides 块）/A3/A4/A5 的脚本部分已落盘；未提交。

**验证断言**

- 脚本 stdout 含三行：`[upgrade] baseline: 0.2.1-rc.5 → 0.2.2-rc.1`、`[upgrade] soft plugin range: >=0.2.2-rc.1 <0.3.0`、`[upgrade] cordis pin: 4.1.0`，且 `[upgrade] probe overrides written: N entries`。
- `grep -c "BEGIN DSH probe overrides" pnpm-workspace.yaml` = 1；`grep -c "0\.2\.1-rc\.5" pnpm-workspace.yaml` = 0。
- `pnpm install` 退出码 0；在 `plugins/multi-root-workspace` 目录下 `node -p "require('@deepseek-ai/dsh/package.json').version"` → `0.2.2-rc.1`、`node -p "require('@deepseek-ai/cordis/package.json').version"` → `4.1.0`。
- 环境前提核对（**新增变量**）：`node -v` 与 `pnpm exec node -v` 分别记录（容器内实测 PATH 上的 node 为 `v24.21.0`，而 pnpm 进程自身为 `v22.18.0`）；dsh 0.2.2-rc.1 首次声明 `engines.node >=24.9.0`（rc.5 无该字段），若 smoke 出现 node API 相关失败，先用 dsh 容器的 node 24.21 复跑同一命令，再怀疑插件适配。
- `verify:all` 退出码 0；计数对照上轮基线（405 passed / 5 skipped、compose 46/46、behavior 99/99、journey 60/60），**数字变化必须能解释**。

**失败分支**：typecheck/smoke 红 → 进组 2 找形状；**不得**在红的探测上做组 3 提升。

> **执行期实测（tasks 组 2 完成，2026-11-06，口径修正见 tasks.md 附录 R4）**：升级链三行断言全中（baseline 0.2.1-rc.5 → 0.2.2-rc.1、cordis pin 4.1.0、schemastery pin 3.19.0）；probe 块=1、`0.2.1-rc.5` 串=0；版本三元组拆核通过（multi-root：dsh 0.2.2-rc.1 + cordis 4.1.0；web-ux：schemastery 3.19.0）。代码面全绿：lint/typecheck/build 过，vitest **411 passed/5 skipped 零失败**（+6 为测试定义数上行，见 R4），kernel:probe 三沙箱不可用属容器环境事实、skip 附因。compose 16/46 失败 = 宿主已 0.2.2-rc.1 × peer 枚举未提升的**结构性预期红**（dsh-runtime PATH 优先解析全局 CLI），根因唯一、零形状回归；46/46 验收后移组 6 enforce。

### 组 2 — 形状核对与必要适配

**动作与断言（逐项）**

1. **cordis 4.0.5 → 4.1.0（次版本，最大风险）**：组 1 的 typecheck / kernel:probe / test / smoke 就是证据面；额外跑 `pnpm --filter dsh-plugin-multi-root-workspace lint && pnpm --filter dsh-plugin-multi-root-workspace typecheck`，以及四个双端包的 client 面编译（`pnpm -r run typecheck`）。任一红才在 `src/compat/` 加最小适配（禁止版本号分支，只做结构探测）。
2. **zod**：`pnpm why -r zod` → 断言插件侧解析到 `4.4.3`（4.6.7 若出现，只能挂在 `^4.4.3` 声明者的子树下）；`node -p "require('zod/package.json').version"` 在 `plugins/multi-root-workspace` 与 `plugins/session-tool-toggle` 目录下均输出 `4.4.3`。
3. **schemastery**：人工改 A4 的三处 devDep + A2 的 `@deepseek-ai/schemastery@3.19.0` 后 `pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0`；断言 `pnpm why -r @deepseek-ai/schemastery` 只出现 `3.19.0`。
4. **session format 仍为 4**：在 `plugins/multi-root-workspace` 目录下跑 `node --input-type=module -e "const m = await import('@deepseek-ai/dsh-session'); console.log(m.SESSION_FORMAT_VERSION)"` → `4`（multi-root 的 `llm-message` 探针据此选 source kind）。
5. **新包 `@deepseek-ai/dsh-client-ui-context-menu` 只记录不接入**：`grep -rn "dsh-client-ui-context-menu" plugins/*/src | wc -l` → `0`；它进 lockfile 与豁免仅因 `dsh-web-app` 依赖它。
6. **零适配结论**：若以上全绿，把「0.2.2-rc.1 未引入适配分支」写进组 3 的 ADR 追加节。

> **执行期实测（tasks 组 3 完成，2026-11-06，5/5 全绿零适配）**：①cordis：lint/typecheck（host+client 双 tsconfig）/`pnpm -r run typecheck`（7/7 Done）三条退出码 0，4.0.5→4.1.0 静态面零 API 差异，`src/compat/` 零改动零版本号分支。②zod：树上 `Found 1 version of zod`（4.4.3），无 4.6.7 混入；两插件运行时解析均 4.4.3，声明与解析一致——D4 达成（宿主安装树 4.6.7 在 DSH 全局目录、不属本仓 workspace，非偏差）。③schemastery：`Found 1 version of @deepseek-ai/schemastery`（3.19.0），三内联插件运行时解析一致——D5 达成（实测方式为脚本自动重写而非本组段原文的人工改法，D5 落档已改道，见 D5 执行期实测）。④session format：`SESSION_FORMAT_VERSION = 4`，未变。⑤context-menu：源码 grep = 0，lockfile 3 处（快照/peer 解析/importer 引用）；**一处如实偏差**——`pnpm-workspace.yaml` 豁免清单该包 **0 出现**（同批 0.2.2-rc.1 包有豁免、它没有），子代理推断其发布年龄已超 minimumReleaseAge 阈值故无需豁免；本组不动豁免（禁止改 workspace），**归组 5 的 `pnpm dsh:check` 对账裁决**：check 报 missing 才人工补行，报 0 冲突则维持现状。⑥零适配结论成立，已具备写入 ADR-0009 追加节的全部形状结论（cordis 4.1.0 / schemastery 3.19.0 / zod 4.4.3 / format 4 / context-menu 只记录）。

### 组 3 — 支持矩阵裁剪提升

**动作**

```bash
# 1) 改 src/compat/dsh-version.ts:34 → ['0.2.1-rc.2','0.2.1-rc.5','0.2.2-rc.1']
# 2) 同步 package.json 的 21 项 DSH peer（值必须是同一串，顺序与数组一致）
node -e '
const fs = require("node:fs")
const path = "plugins/multi-root-workspace/package.json"
const manifest = JSON.parse(fs.readFileSync(path, "utf8"))
const range = "0.2.1-rc.2 || 0.2.1-rc.5 || 0.2.2-rc.1"
for (const name of Object.keys(manifest.peerDependencies ?? {})) {
  if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-")) manifest.peerDependencies[name] = range
}
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n")
'
# 3) 静态契约校验
pnpm --filter dsh-plugin-multi-root-workspace compat:check
```

**产物**：A5（peer 部分）+ A6 + B3 的 ADR 追加节（提升记录：warn 探测计数、cordis/zod/schemastery 形状结论、裁剪理由）。

**验证断言**

- `pnpm --filter dsh-plugin-multi-root-workspace compat:check` 退出 0，输出含 `[compat] allowlist: 0.2.1-rc.2, 0.2.1-rc.5, 0.2.2-rc.1`。
- `node -e "const m=require('./plugins/multi-root-workspace/package.json'); const p=Object.entries(m.peerDependencies).filter(([n])=>n.startsWith('@deepseek-ai/dsh')); console.log(p.length, new Set(p.map(([,v])=>v)))"` → `21 Set(1) { '0.2.1-rc.2 || 0.2.1-rc.5 || 0.2.2-rc.1' }`。
- 此时**仍带 probe overrides**，不得提交；组 4 清掉后再全量。

> **执行期实测（tasks 组 4 完成，2026-11-06，三任务并行 + 组级校验全绿）**：4.1 落定 `SUPPORTED_DSH_RELEASES = ['0.2.1-rc.2', '0.2.1-rc.5', '0.2.2-rc.1'] as const`（1 行改动，验证句双 grep 过；**L16 模块头的历史例句注释 `An npm range like '>=0.1.2-alpha.4 <0.2.0' …` 裁定保留**——它解释 allowlist 取代 npm range 的历史决策，属叙述非枚举副本，D7 精神下历史叙述归 ADR 文档面）。4.2 权威脚本逐字执行：21 项 peer 同一串、cordis peer `>=4.0.1 <5.0.0` 未动、diff 逐行分类零意外改动。4.3 ADR-0009 新节 L240-257 纯追加（五段：落点/裁剪理由/warn 探测计数含 R4 口径/形状结论/零适配），`docs:check` 10 项全 PASS。**组级 compat:check（主会话统一跑，避开并行中间态）**：退出 0，输出 `[compat] allowlist: 0.2.1-rc.2, 0.2.1-rc.5, 0.2.2-rc.1` + `allowlist, peerDependencies, development pin and installed tree agree`——D3 强绑定一次落定达成。检查器实现事实：`check-dsh-compat.mjs` 静态解析源码、刻意不 import 构建产物（须先于 build 运行），改数组无需重建 lib 即可校验。

### 组 4 — 收口对账

**动作**

```bash
pnpm dsh:upgrade 0.2.2-rc.1          # 不带 --probe：移除 overrides 块
pnpm install --frozen-lockfile
pnpm dsh:check                       # 第一次会列出豁免缺项/陈旧项
# 按输出人工增删 pnpm-workspace.yaml，再跑
pnpm dsh:check
```

**验证断言**

- `grep -c "BEGIN DSH probe overrides" pnpm-workspace.yaml` = 0，且脚本 stdout 含 `[upgrade] probe overrides: absent`。
- `pnpm dsh:check` 最终退出 0，输出含 `[dsh:check] baseline: 0.2.2-rc.1 (soft range >=0.2.2-rc.1 <0.3.0)`、`[dsh:check] release-age allowlist: N entries, lockfile M relevant packages`、末行 `[dsh:check] baseline, pins, soft ranges, allowlist, lockfile and installed tree agree`。
- 预期新增/修改条目：`dsh-client-ui-context-menu@0.2.2-rc.1`（新增）、`schemastery@3.19.0`（替换 3.18.5）；候选树移除的包按 missing/stale 输出删。
- `pnpm install --frozen-lockfile` 退出 0（证明 lockfile 与 manifest 自洽）。若因移除 probe overrides 触发 `ERR_PNPM_OUTDATED_LOCKFILE`，退一步跑 `pnpm install --no-frozen-lockfile`，然后确认 `git diff pnpm-lock.yaml` 无变化（overrides 与已解析版本等值时本就应无变化）。

> **执行期实测（tasks 组 5 完成，2026-11-06）**：de-probe 后 `frozen-lockfile` 一次通过（无 OUTDATED 分支）；豁免人工对账实际新增 **25 条**（不止预期的 context-menu 一条——0.2.2-rc.1 上游新增 25 个传递性 DSH 包：action-cards / client-ui-action-cards / client-ui-context-menu / forge 系 / recommendations 系 / tool-executor 系 / liveshare 系 / message-quotes / official-bundles / fs-patch / deliverable-file-references 等），按 transitive 批字典序插入；`dsh:check` 333=333 全绿（末行 agree）、`compat:check` 全绿。执行过程含两次环境中断与一次主会话↔子代理并发写入冲突，处置与规则见 tasks.md 附录 R5。schemastery 3.18.5→3.19.0 由组 2 脚本完成，本组仅确认。

### 组 5 — 全量验证

**动作**

```bash
# multi-root 全矩阵（enforce，不设 DSH_MULTI_ROOT_COMPAT）
pnpm --filter dsh-plugin-multi-root-workspace verify:all
# 仓库级
pnpm lint && pnpm typecheck && pnpm test
pnpm build
pnpm docs:check
pnpm dsh:check
```

**验证断言**

- `verify:all` 退出 0（lint→typecheck→build→kernel:probe→test→smoke×3 顺序执行）；kernel:probe 若打印 skip 必须附原因。
- `git diff --stat -- 'plugins/*/lib'` 只含 4 个插件：multi-root（`compat.js`、`compat-<newhash>.js`、`index.js`、`types/compat/dsh-version.d.ts`）与 web-ux / session-tool-toggle / zcode-plan（schemastery 内联）；project-mcp / user-commands / workspace-config 的 `lib` **零 diff**（证明源码零改动）。
- `git status --porcelain` 里 `openspec/` 仍只有原来的 3 个脏文件（本变更未碰）。
- `pnpm docs:check` 退出 0（双语配对 + 链接 + 绝对路径规则）。

### 组 6 — 文档同步

**动作**：按 B1-B6 逐处替换，顺序建议「真源 → 派生文档」：先改 `src/compat/dsh-version.ts`（已在组 3）、再 ADR（B3）、再 AGENTS/README（B1/B2）、再 note（B5）、最后根文档（B6）。

**验证断言**

- `grep -n "0\.2\.1-rc\.2\|0\.2\.1-rc\.5" README.md AGENTS.md` → 无输出（根文档只写当前基线）。
- `grep -c "0\.1\.5-rc\.2" plugins/multi-root-workspace/README.md plugins/multi-root-workspace/README.en.md` → 各 0（「当前支持」列表里不再有 0.1.x；上游 fork 的 `v0.1.5` 历史提及不受影响）。
- `grep -c "0\.2\.1-rc\.2 || 0\.2\.1-rc\.5 || 0\.2\.2-rc\.1" plugins/multi-root-workspace/.agent/note/dsh-compat-contract.md plugins/multi-root-workspace/.agent/note/dsh-compat-contract.en.md` → 各 1（peer 串样例同步）。
- `grep -c "0\.2\.2-rc\.1" plugins/multi-root-workspace/README.md plugins/multi-root-workspace/README.en.md plugins/multi-root-workspace/AGENTS.md` → 各 ≥1。
- `grep -n "2026-11-06" plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` → 命中新节标题。
- `grep -c "24\.9\.0" plugins/multi-root-workspace/README.md plugins/multi-root-workspace/README.en.md` → 各 ≥1（dsh 0.2.2+ 的 Node 下限写进环境要求）。
- `grep -c "20 项 DSH peer" plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` → 0。

> **执行期实测（tasks 组 7 完成，2026-11-06，5/5 全过 + docs:check 全绿）**：7.1 AGENTS.md H3 段单行替换（三项列表 + dev pin `0.2.2-rc.1` + 形状结论摘要句含 callerConnectionOf/projection 类型面/上下文菜单只记录/Node ≥24.9.0，指路 ADR 追加节；0.1.x 历史句全保留）。7.2 README 双语「环境要求」两处（三项列表 + dev pin + Node ≥24.9.0 句，en 自然跟随）。7.3 工作流文档 3 处版本样例 + peer 计数表述（旧基线零残留）。7.4 契约笔记双语对称同步（数组/peer 串/dev pin/命令样例/§9 终版段 + §4 适配器表补 `caller-connection.ts` 行；L141 zod 对齐记载原文在位）。7.5 根 README/AGENTS 基线行 3 行 4 事实点（0.2.2-rc.1 + 六软插件 + 派生范围，Q2 漂移修正落定）。各任务独立跑 docs:check 全绿；组 8.1 终态复验再总跑一次。
- `pnpm docs:check` 退出 0（重复确认，因本组只改 md）。

### 组 7 — web profile 实测（含官方包升级）

**前置**：组 1-6 全绿、`pnpm build` 已完成（link: 生效依赖 lib 新鲜）。

**第一步：记录基线（改动前，一次跑完）**

```bash
docker exec dsh dsh plugin --profile web list 2>&1 | grep -c "incompatible with dsh"      # 现 4（3 个包，multi-root 重复一次）
docker exec dsh dsh --profile web --dump-config-schema 2>&1 >/dev/null | wc -l            # 现 24
docker exec dsh dsh --profile web --dump-config-schema 2>&1 >/dev/null | grep -ci multi-root  # 现 3
docker exec dsh dsh --profile web --dump-config 2>/dev/null | grep -c "multi-root-"        # 现 0（bundle 被跳过）
docker exec dsh sh -lc 'grep -c "@deepseek-ai/dsh" ~/.dsh/profiles/web/package.json'        # 现 5（bundles 3 行 + dependencies 2 行）
docker exec dsh dsh plugin --profile web list 2>&1 | grep -v incompatible                  # 存档全量版本，供升级后逐行对照（A6）
```

**第二步：升级两个官方包**

```bash
docker exec dsh dsh plugin --profile web add --save-exact \
  @deepseek-ai/dsh-browser-use@0.2.2-rc.1 \
  @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.2.2-rc.1
```

**第三步：非中断验收（重启前）**

- `docker exec dsh sh -lc 'sed -n 31,32p ~/.dsh/profiles/web/package.json'` → 两行均为 `"0.2.2-rc.1"`（若被写成 `^0.2.2-rc.1`，重跑上面的 add 并确认 `--save-exact` 生效）。
- `docker exec dsh dsh plugin --profile web list 2>&1 | grep -c "incompatible with dsh"` → **0**。
- `docker exec dsh dsh --profile web --dump-config-schema 2>&1 >/dev/null | wc -l` → ≤ `21`（24 − 3 条 multi-root 拒绝行；multi-root 行加载后自身不得新增 error 行）；且 `| grep -ci multi-root` → 0。
- `docker exec dsh dsh --profile web --dump-config 2>/dev/null | grep -o "multi-root-[a-z-]*" | sort -u | wc -l` → `11`（10 个 INSERTED 行 + `multi-root-client` 锚行）。
- `docker exec dsh sh -lc 'cd ~/.dsh/profiles/web && grep -h "\"version\"" node_modules/@deepseek-ai/dsh-browser-use/package.json node_modules/@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp/package.json node_modules/@deepseek-ai/dsh-experimental-browser-use-runtime/package.json node_modules/chrome-devtools-mcp/package.json'` → 前三行 `0.2.2-rc.1`，第四行 `1.12.0`（override 仍生效）。
- `docker exec dsh sh -lc 'node -e "const m=require(process.env.HOME+\"/.dsh/profiles/web/package.json\"); console.log(m.dsh.profile.bundles.length)"'` → `20`（bundles 未被污染）。
- 在仓库 `plugins/multi-root-workspace` 目录下：`node --input-type=module -e "const m=await import('./lib/compat.js'); console.log(m.classifyInstallation().verdict, m.classifyInstallation().release)"` → `supported 0.2.2-rc.1`（容器内同路径，可用 `docker exec -w "$PWD/plugins/multi-root-workspace" dsh node …`）。

**第四步：重启后验收（会中断当前 GUI 会话，由操作者在会话外执行）**

```bash
docker restart dsh
# 重启后：
docker exec dsh dsh --version                 # 0.2.2-rc.1
docker exec dsh dsh plugin --profile web list 2>&1 | grep -c incompatible   # 0
docker exec dsh sh -lc 'ls -t ~/.dsh/logs/startup-*.log | head -1 | xargs grep -c "not a supported release"'  # 0
```

人工冒烟（UI）：设置 → 插件列表无 incompatible 警示；侧栏「工作区配置」弹窗四个分节齐（Folders / 工作区默认档 / 会话管理 / session-tool-toggle 默认档）；`/workspace-folders` 可用；browser-use 工具在会话内可用。

**失败分支**：若 `list` 仍报某包 incompatible，先看是否 `add` 后未落盘（`package.json` 与 `node_modules` 不一致）——重跑 add；第三方包若出现新的 incompatible，记录并上浮，不把第三方包纳入本次改造。

---

## ⑥ 设计假设与未决项

### 假设

| # | 假设 | 支撑/验证方式 |
| --- | --- | --- |
| A1 | 宿主、容器、会话侧 dsh 均为 `0.2.2-rc.1` 且升级期间不再变 | 已实测 `dsh --version` = `0.2.2-rc.1`；开工前再跑一次 |
| A2 | web profile 七插件为 `link:` 安装，仓库改 + lib 重建 + 重启即生效，无需重装 | `dsh plugin --profile web list` 实测 7 条 `link:` |
| A3 | volta/项目 pin 的 node `24.21.0` 满足 dsh 0.2.2-rc.1 的 `engines.node >=24.9.0` | 根 `package.json#volta.node`；但注意 pnpm 进程自身可能跑在 node 22.18（见 A11） |
| A4 | 探测期 `--config.minimumReleaseAge=0` 足以放行新发布包；事后由豁免清单精确兜住 | 组 1/组 4 的命令链；`dsh:check` 第 6 条 |
| A5 | 两官方包 `0.2.2-rc.1` 已发布 | `npm view … versions` 实测含 `0.2.2-rc.1` |
| A6 | `dsh plugin add` 不会主动升级 profile 里其他 `^` 范围依赖 | 组 7 用「升级前后 `plugin list` 全量版本对照」验证；若发生漂移，记录并回报 |
| A7 | zod `4.6.7` 只出现在声明 `^4.4.3` 的子包子树，不改变插件对 `4.4.3` 的契约 | 组 2 的 `pnpm why -r zod` 断言 |
| A8 | `upgrade-dsh.mjs` 的正则重写覆盖全部现存 DSH 豁免行；新增/消失条目由 `dsh:check` 对账 | 组 1/组 4 的断言 |
| A9 | 重启容器会中断当前会话，组 7 最后一公里必须由操作者在会话外执行 | 运行环境事实（本会话即 web profile） |
| A10 | 3 个 `openspec/changes/project-mcp-isolation-enforcement/*` 脏文件与本变更无文件交集，提交时按路径隔离 | `git status --porcelain` 实测；提交时只 `git add` 本变更路径，禁止 `git add -A` |
| A11 | node 版本事实（落档分歧点 Q-F 核实修正）：dsh 容器自带 node `v24.21.0`，容器内本仓 `pnpm exec node -v` = `v24.21.0`，**满足** dsh 0.2.2-rc.1 的 `engines.node >=24.9.0`；偏差仅存在于**宿主侧包装脚本链**（volta 容器 node `v22.18.0`，低于仓库 `engines` 的 `^22.19`） | dsh CLI 自身不做 node 版本断言；处置 = 组 1/组 5 的 pnpm 验证命令**统一在 dsh 容器内执行**（`docker exec dsh sh -lc 'cd <repo> && …'`），宿主链偏差只记录，宿主跑失败时用容器 node 复跑兜底；README 环境要求按 B2 补 `>=24.9.0` |

### 未决项

见文末《待决问题》：Q-A（重启执行者）、Q-B（第三方插件是否在验收口径内）、Q-C（schemastery 是否长期纳入脚本）、Q-D（chrome-devtools-mcp override 去留）、Q-E（与在途变更的提交顺序）、Q-F（Node 工具链与 dsh 新 engines 的偏差）。

---

## 待决问题

| # | 问题 | 选项 | 推荐 | 影响面 |
| --- | --- | --- | --- | --- |
| Q-A | web profile 的「重启实测」由谁在何时执行？重启会中断当前 GUI 会话（本会话即该 profile） | a) 操作者在会话外 `docker restart dsh`，agent 只给命令与判据 b) agent 自行重启（会杀掉自己，证据丢失） | a | 组 7 最后一公里；不重启则只能拿到「非中断验收」证据，拿不到启动期真实装载与双端包 scan 证据 | **→ 已决 a**（落档分歧点，2026-11-06） |
| Q-B | 用户口径「插件是否都可用」是否覆盖 profile 内 10 个第三方插件（dsh-pocket / dsh-context / dshmarket / notes / task-board / better-input / archify / rewind / prompt-history / dsh-remote）？ | a) 只承诺本仓七插件 + 两个官方包零 incompatible，第三方只记录不升级 b) 把第三方也逐个升级/冒烟 | a | 验收口径与工时；第三方升级不受本仓控制，且会扩大回滚面 | **→ 已决 a**（落档分歧点） |
| Q-C | schemastery 的版本提升长期是否纳入 `upgrade-dsh.mjs`？ | a) 维持人工（每次升级由 `dsh:check` 兜底） b) 给脚本加通用「额外 pin」参数 c) 从候选 dsh 的 `dsh-tools` 依赖推导 | a（本次不扩脚本） | 下次升级会再遇到同一人工步骤；b/c 需要新契约与测试，超出本次范围 | **→ 已决：纳入脚本，机制 = c 从候选树推导**（用户否决 a；机制追问后选 c，见 D5） |
| Q-D | profile 的 `chrome-devtools-mcp: 1.12.0` 覆盖是否保留？包自身声明 `1.9.0` | a) 保留（既有 profile 决策，非本变更） b) 随包声明降到 1.9.0 | a | 浏览器工具行为；改动会引入与本升级无关的变量 | **→ 已决 a**（落档分歧点） |
| Q-E | 工作树已有 3 个 `openspec/changes/project-mcp-isolation-enforcement/*` 脏文件，本变更何时提交？ | a) 本次完成的改动单独 `git add <本变更路径>` 提交，不等在途变更 b) 等在途变更收尾后合并提交 | a（按路径隔离，禁止 `git add -A`） | 提交清洁度与两变更的先后依赖；不发版，所以无 tag 顺序约束 | **→ 已决 a**（落档分歧点） |
| Q-F | dsh 0.2.2-rc.1 新增 `engines.node >=24.9.0`，工具链是否对齐？ | a) 记录 + 兜底 b) 顺带修工具链 | a | 环境偏差 | **→ 已决（事实修正）**：dsh 容器内 node `v24.21.0` 满足新 engines（用户指出、实测确认），偏差仅宿主包装链 volta `v22.18.0`；处置 = pnpm 验证命令统一在 dsh 容器内执行，宿主链偏差记录 + 失败兜底，不做独立治理项 |

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：C1 不成立——本变更为依赖重指/支持矩阵裁剪/文档同步/profile 官方包升级，命中排除表「纯后端 / CLI / 数据迁移 / 配置 / 脚本」行，无任何页面/组件/布局/视觉产出。
