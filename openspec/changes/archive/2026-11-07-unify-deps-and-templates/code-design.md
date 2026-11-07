# unify-deps-and-templates 代码级蓝图（阶段 1.7 / 代码设计线）

> **输入**：`explore.md`（需求级调研；§2 的精确清单、§6 风险、§7 假设）与 `decisions.md`（D1/D2/D3 收敛留痕，硬约束）。
> **本文只回答**「触达哪些文件、怎么改、接口与数据形状、为什么这么定」，不复述需求调研。
> **约束**：不推翻 D1（删 warn）/ D2（直接删导出）/ D3（删旧 + 新增 + 改写）；只写本文件；不写项目文件、不改 `openspec/`。
> **上游事实**：HEAD `cee8150`，工作树干净（`git status --short` 空）；`openspec` 1.16.0（已核实支持 `REMOVED` / `RENAMED` / `MODIFIED` 与 scenario-loss 校验）。
> **阅读顺序**：§0 事实校正 → ① 触达面 → ② 证据锚 → ③ 接口与数据形状 → ④ 决策记录 → ⑤ 任务组 → ⑥ 假设 → 待决问题。

---

## 0. 事实校正（动笔前实测，与输入材料的数字差异）

设计以**代码实测**为准；差异全部保留为「可发现的事实」，不重开 D1–D3。

| # | 项 | 材料值 | 代码实测 | 处置（见 ④/待决） |
| --- | --- | --- | --- | --- |
| 0-1 | multi-root DSH peer 条数 | 23 条（`explore.md` §2 / `decisions.md` D3） | **21 条 DSH peer + cordis = 22 条 `@deepseek-ai/*` peer**（`plugins/multi-root-workspace/package.json:94-163`）；主 spec 现有 scenario 也写「21 项 DSH peer」 | 补 1 条 `@deepseek-ai/dsh` peer（与六软插件同构）后 = 22 DSH + cordis = **23 条 `@deepseek-ai/*` peer**，与材料数字吻合 → ④ D-3、待决 Q1 |
| 0-2 | `*.tsbuildinfo` 残留 | 8 个 | **9 个**（六个软插件 + `workspace-config/lib/` 1 个；全部 `git check-ignore` 命中，`git ls-files` 零条） | 按实测清理，验证用「零命中」而非条数 → 待决 Q2 |
| 0-3 | dotfiles skill 引用分布 | SKILL.md ×2 + references ×4 | **SKILL.md ×3（:36/:68/:84）+ references ×3（`verify-install.md:205`、`build.md:23`、`structure.md:87`）**，合计同样 6 处 | 按 6 条精确行号改 → ① 1.6 / ⑤ 组 4 |
| 0-4 | 已删 shim 的文档引用位置 | `docs/development/plugin-development-workflow.md` | 该文件引用的是**根** `scripts/upgrade-dsh.mjs`（`:184`，正确）；指向插件内 shim 的过期命令在 **`docs/troubleshooting/unsupported-dsh-release.md:88`** | 改口归入组 3（该文档整节重写）；组 5 只删文件 + ADR fork 注 |
| 0-5 | 22 条 catalog 差集 | 22 条，全 `0.2.2-rc.1` | 22 条（集合一致、顺序不同）；且**全部已在 `minimumReleaseAgeExclude`** | 按字母序插入，`minimumReleaseAgeExclude` 不动（A-6） |
| 0-6 | 36 条 `@deepseek-ai/*` devDeps | 36 条 | 36 条 = 35 条 DSH + cordis | 全部 → `catalog:dsh`（catalog 里已有 cordis 4.1.0） |

---

## ① 触达面清单

> 仓别：**根仓** = `/home/xuqinqin/develop/person/dsh-plugins`；**dotfiles** = `/home/xuqinqin/develop/dotfiles`。
> 组号对应 ⑤ 的任务组（1 依赖面 / 2 运行时门 / 3 文档与 spec / 4 模板外迁 / 5 清理 / 6 收口）。

### 1.1 根仓 — G-C 依赖面（组 1）

| 路径 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| 根仓 `pnpm-workspace.yaml`（`catalogs.dsh` 块，`:29-63`） | catalog 扩容 | 按字母序插入 22 条 `'@deepseek-ai/*': '0.2.2-rc.1'`（精确清单见 ③ 3.3）；31 → 53 条；`allowBuilds` 与 `minimumReleaseAgeExclude` 一字不动 |
| 根仓 `plugins/multi-root-workspace/package.json`（`:94-163` peers / `:165-216` devDeps / `:217-228` `dsh` 块） | 与六软插件同构 | ① 36 条 `@deepseek-ai/*` devDeps → `"catalog:dsh"`；② 21 条 DSH peer → `">=0.2.2-rc.1 <0.3.0"`；③ **新增** `"@deepseek-ai/dsh": ">=0.2.2-rc.1 <0.3.0"` peer（见 ④ D-3）；④ 新增 `dsh.engines.dsh` 同值；⑤ cordis peer `">=4.0.1 <5.0.0"` 不动；⑥ `scripts.verify:all` 追加 `pnpm compat:check`（见 ④ D-8） |
| 根仓 `scripts/check-dsh-baseline.mjs` | 去例外，multi-root 并入统一断言 | 删 `hardPlugins` / `softPlugins` 分裂与 `hardPlugins.length !== 1` 断言（`:260-265`）；组 4 形态断言（`:344-355`）与组 5 范围断言（`:357-370`）改为遍历 `plugins`；**整段删除**组 6（`:372-387`：allowlist 正则 + `compat:check` 调用）；头注释 1–9 条重排（删第 6 条）；`normalizeDep` 文档（`:186-196`）与组 4 注释（`:344-348`）去「精确契约插件豁免」措辞 |
| 根仓 `scripts/upgrade-dsh.mjs` | 删「不碰 multi-root」分支 + 同批重指运行时基线 | 删 `hasExactContract()`（`:71-80`）与全部调用点（`:245-256` / `:273-285`）；`repointPlugin` 对所有插件写 `dsh.engines.dsh` 与 DSH peer；新增 `repointRuntimeBaselines()` 重写 `plugins/*/src/compat/dsh-version.ts` 的 `DSH_BASELINE` 字面量（④ D-4）；模块 doc（`:9-11`）与末段提示（`:455-458`）删 warn / allowlist 文案 |
| 根仓 `scripts/dsh-baseline.mjs` | 仅注释 | 头注释「四个插件的 devDeps 精确 pin、三个软插件的 engines/peer 范围」→「经 `catalog:dsh` 的七个插件 devDeps、七个插件的 engines/peer 范围、multi-root 运行时基线副本」；常量与 `softDshRange()` 逻辑不动 |
| 根仓 `pnpm-lock.yaml` | 生成物，不手改 | `pnpm install --no-frozen-lockfile` 后**只允许** importer 的 `specifier: catalog:dsh` 行变化（断言见 ⑤ 1.5） |

### 1.2 根仓 — G-C 运行时门（组 2）

| 路径 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| 根仓 `plugins/multi-root-workspace/src/compat/dsh-version.ts` | allowlist → 派生软范围 | 删 `SUPPORTED_DSH_RELEASES`（`:34`）、`SupportedDshRelease`（`:37`）、`CompatEnforcement` / `COMPAT_ENFORCEMENT_ENV` / `compatEnforcement()`（`:80-83`、`:205-217`）；新增 `DSH_BASELINE` 字面量 + 派生 `SUPPORTED_DSH_RANGE` + 手写比较器 + `isSupportedDshRelease()`；`classifyInstallation` 的 unsupported 分支改范围判定（missing / mixed 顺序与逻辑不变）；重写模块 docblock（`:1-21`，删「范围承诺大过验证面」论证并注明新裁定）与 unsupported 文案（`:189-201`） |
| 根仓 `plugins/multi-root-workspace/src/compat.ts` | 简化门禁反应 | 删 warn 分支与三处 import（`:26-34`）；`assertSupportedInstallation(report)` 单参、非 supported 即抛（`:107-123`）；`apply` 去掉 warning / `ctx.logger.warn`（`:130-135`）；`MultiRootCompatService.supported` 文档改「在支持范围内」 |
| 根仓 `plugins/multi-root-workspace/src/index.ts` | 公开导出面 | 值导出删 `SUPPORTED_DSH_RELEASES`，新增 `DSH_BASELINE` / `SUPPORTED_DSH_RANGE` / `isSupportedDshRelease`；类型导出删 `SupportedDshRelease` / `CompatEnforcement`（D2：不留别名） |
| 根仓 `plugins/multi-root-workspace/tests/compat.spec.ts` | 台账断言 → 范围断言 | 删 `upgradeLane` / `runIf` / `skipIf`（`:81`、`:91-99`）与 `enforcement mode` describe（`:282-293`）；删「exact list」两条（`:52-61`）；`expected = SUPPORTED_DSH_RANGE`（`:113-130`）并新增 engines 断言；边界表（域内/域外/边界）；`dev pin` 断言改 `'catalog:dsh'`（`:101-104`，原断言在 catalog 化后必红）；warn 相关用例删除（`:211-236`） |
| 根仓 `plugins/multi-root-workspace/tests/support/compat.ts` | 文档同步（代码不变） | docstring 的「unlisted release / warn lane」改「outside the supported range」；`mountCompat` 实现不动 |
| 根仓 `plugins/multi-root-workspace/scripts/check-dsh-compat.mjs` | 静态断言改范围 | `readStringArray('SUPPORTED_DSH_RELEASES')`（`:64`）→ `readStringLiteral('DSH_BASELINE')`；断言①改「peers == `dsh.engines.dsh` == 派生范围」（`:75-82`，新增 engines）；删开发 pin 断言（`:92-106`，值归根 `dsh:check`、形态归单测）；installed tree 保留「必需包可解析 + 单一 release」（`:108-129`），删 allowlist 成员判断（范围判定由运行时 + 单测负责）；模块 doc 四行表（`:10-18`）改基线/范围 |

### 1.3 根仓 — G-C 文档与 spec delta（组 3）

| 路径 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| 根仓 `plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` | **append-only** 修订留痕 | Status 块在现有两条之后追加一条范围化 `> 本地 fork 注（2026-11-07）`（warn 删除 + 探测车道降级为回归验证；明确「第 1 节『范围是预测』论证在 2026-11-07 被用户裁定推翻」）；`## Related Documents` 之前新增 `## 支持矩阵范围化（2026-11-07）` 节（保留第 2/3/4 条不变，说明代价与保留项）；**不改写** `:43-57` / `:106-112` / `:240-257` 历史正文 |
| 根仓 `plugins/multi-root-workspace/docs/decisions/ADR-0002-upstream-coupling-policy.md` | 注记式追加 | `:28` 与 `:30` 末尾加「（2026-11-07：该『精确版本或』已被基线派生软范围取代，见 ADR-0009 范围化节；本条的『范围声明承诺过大』结论对当时的动机仍成立）」 |
| 根仓 `plugins/multi-root-workspace/docs/decisions/ADR-0011-…consumers.md`、`ADR-0012-…file-references.md` | 注记式追加 | `:49` / `:71` 的「exact allowlist / 逐字等于 allowlist 精确版本或」加同批注记；决策正文不改 |
| 根仓 `plugins/multi-root-workspace/docs/decisions/README.md` + `README.en.md` | 索引描述（双语对） | `:28` 的「精确版本 allowlist…按周升级车道」→「基线派生软范围…探测降级为回归验证」；双语两行同口径（§0 校正：执行期实测 `.en.md` 存在，规划断言「无 `.en.md`」失真——3.2 执行期已纳英文行入写面） |
| 根仓 `plugins/multi-root-workspace/AGENTS.md` | 仓库级规则 | `:96`（H3 段）与 `:107`（不变量 7）去掉 allowlist / warn / 「提升是人工动作」旧语义，改为「运行时副本 + 派生范围」「升级脚本重指范围、绿灯是回归证据」；保留「适配层只做结构探测」 |
| 根仓 `plugins/multi-root-workspace/README.md` + `README.en.md` | 用户可见口径（双语同步） | 中文 `:47`、`:191`、`:215`；英文 `:45`、`:191`、`:215`：exact list → baseline-derived range；unsupported 的定义改「在范围外」；warn 相关删除 |
| 根仓 `plugins/multi-root-workspace/docs/architecture/multi-root-workspace.md` | 架构描述 | `:90`「不在精确 allowlist 上」→「不在派生软范围（`>=<基线> <下一 minor>.0`）内」；判定顺序不变 |
| 根仓 `plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` | 工作流 | `:11-13` 表格三行（支持矩阵 / 实测证据 / 运行时门禁）；`:35` 命令说明；`:51`「verify:all 故意不含 compat:check」随 D-8 反转；`:167` 支持矩阵段；`:173-183` 升级流程（去 warn、去「人工加入 allowlist」四步、加「升级脚本同批重写运行时基线」）；`:224-225` 排障表两行；`:191-195` 为已声明的上游历史，不改 |
| 根仓 `plugins/multi-root-workspace/docs/troubleshooting/unsupported-dsh-release.md` | 用户侧排障整篇改口 | `:29-54` 根因段（含七行门禁）、`:56-71` 判定表与诊断、`:73-105` 解决方案、`:107-111` 删除整个 warn 小节；`:88` 的 shim 路径改根 `pnpm dsh:upgrade`（G-B 的改口实际落点，见 §0-4） |
| 根仓 `plugins/multi-root-workspace/docs/troubleshooting/README.md` + `README.en.md` | 索引行同步（§0 执行期校正：规划清单漏列，3.5 接续补） | `:25` 链接文字「不在支持矩阵上」→「在支持范围外」+ 描述尾「人工提升」→「pnpm dsh:upgrade 同批重指」（双语同口径）；`install-stops-at-build-approval.md:88` 链接文字同步新标题 |
| 根仓 `plugins/multi-root-workspace/.agent/note/dsh-compat-contract.md` + `.en.md` | Agent 耐久知识（双语成对） | §1（唯一真源 → 运行时副本 + 派生范围；四行一致性表改「baseline → range / peers / engines / installed」）、§5（warn 整节删除，改为「没有放宽开关」）、§6（升级流程去 warn、compat:check 语义）、§8（verify:all 现含 compat:check）；历史测量段（0.1.x/0.2.x 各节）保留 |
| 根仓 `plugins/multi-root-workspace/.agent/note/README.md` + `.en.md` | 索引描述 | `:23` 的「allowlist 的唯一真源…升级车道用法」改「基线派生的支持范围…升级回归」 |
| 根仓 `AGENTS.md` | 仓级规则 | `:48`「六个软插件」→「全部插件」；`:49` multi-root 例外条删除并替换为「运行时基线副本由基线派生，升级脚本同批重指」；`:50` `dsh:upgrade` 描述去「软插件范围」歧义（改「全部插件范围」） |
| 根仓 `README.md` | 仓级说明 | `:46` 删「multi-root 保留精确 allowlist 与精确 peers」，改「七个插件统一由基线派生」 |
| 根仓 `openspec/changes/unify-deps-and-templates/specs/dsh-baseline/spec.md` | **新建**（D3 载体） | REMOVED / ADDED / RENAMED(+MODIFIED) / MODIFIED 四类节（骨架见 ③ 3.7）；另 `openspec/changes/unify-deps-and-templates/{proposal.md,design.md,tasks.md}` 由流程另出（**新建**，不在本文件写） |

### 1.4 根仓 — G-A 模板外迁（组 4）

| 路径 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| 根仓 `tooling/template/**` → `templates/default/**` | 目录外迁（`git mv`，保留历史） | 12 个文件逐个/整目录 `git mv`；移后 `tooling/template/` 不再存在 |
| 根仓 `templates/README.md` | **新建**：多模板约定 | 目录定位（不是包）、命名、`template.json` schema、`--template` 契约、新增模板步骤、版本字面量禁令、与 `plugin-README.md.tmpl` 的分工 |
| 根仓 `templates/default/README.md` | 由 `tooling/template/README.md` **拆分改写** | 只留本模板的文件表（加 `template.json` 行）、两条硬约束（显式表 → 改为「清单在 template.json」）、自链接改成 `templates/default/README.md`；约定部分上移 |
| 根仓 `templates/default/template.json` | **新建**：FILE_TABLE 外移 | 顶层 `{name, description, files[]}` + 11 条目（`template` / `output` / `format?` / `only?`），见 ③ 3.2 |
| 根仓 `templates/default/plugin-README.md.tmpl` | 自链接同步 | `:6` `[tooling/template/](../../tooling/template/README.md)` → `[templates/default/](../../templates/default/README.md)` |
| 根仓 `scripts/gen-plugin.mjs` | 多模板 + 清单驱动 | `TEMPLATE_ROOT`（`:33`）→ `templates`；新增 `--template`（`--template=` 两种写法，默认 `default`）；`FILE_TABLE`（`:71-83`）删除，改 `loadTemplate()` 读 `template.json` 并 fail-closed 校验；`buildFiles`（`:265-281`）遍历清单；USAGE（`:47-60`）与 dry-run/成功输出（`:360-373`）加模板名 |
| 根仓 `scripts/check-architecture.mjs` | AR7 文本与禁止条目 | `FORBIDDEN_PACKAGES`（`:641-645`）删 `tooling/template`，加 `templates` / `templates/*`；`:22` / `:70` / `:794` 三处文案；AR2 逻辑零改动（见 ④ D-6） |
| 根仓 `pnpm-workspace.yaml`（`:3-6` 注释） | 注释同步 | 「tooling/template 不是包」→「模板素材在顶层 `templates/`（不进 packages，AR7 禁止 `templates` / `templates/*`；清单叫 `template.json` + `*.tmpl`）」 |
| 根仓 `README.md` | 目录/命令/新增插件段 | `:15`（`templates/` 行 + 指向 `templates/README.md`）、`:19`、`:44`（含 `--template` 与链接） |
| 根仓 `AGENTS.md` | 目录结构/生成器段 | `:15`、`:17`、`:43` 三处路径与 `--template` 说明 |

### 1.5 根仓 — G-B 清理（组 5）

| 路径 | 改动意图 | 关键改动点 |
| --- | --- | --- |
| 根仓 9 个 `*.tsbuildinfo`（`plugins/{project-mcp,session-tool-toggle,user-commands,web-ux,workspace-config,zcode-plan}/…`） | 删本地残留 | 全部 ignored / 零 tracked；删后 `find` 零命中；base tsconfig `noEmit: true` 且无 `incremental` / `composite`（`tsconfig.plugin.base.json:1-24`）→ 不会复现 |
| 根仓 `plugins/multi-root-workspace/scripts/upgrade-dsh.mjs` | 删除已弃用委托 shim | 整文件删除（25 行）；`scripts/` 由 9 文件降到 8 文件 |
| 根仓 `plugins/multi-root-workspace/docs/decisions/ADR-0009-…md` | fork 注（append-only） | Status 块再追加一条 shim `> 本地 fork 注（2026-11-07）：插件内 scripts/upgrade-dsh.mjs 委托 shim 已删除；升级入口唯一为仓库根 pnpm dsh:upgrade。`（追加在 1.3 的范围化注之后，同样只增不删） |
| 根仓 `plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` | **复核结论：无需为 shim 改口** | `:184` 引用的是根 `scripts/upgrade-dsh.mjs`（正确）；指向插件内 shim 的唯一过期命令在 `docs/troubleshooting/unsupported-dsh-release.md:88`，其改口归组 3（见 §0-4）。本组只做 `git grep` 残留校验 |

### 1.6 dotfiles 仓（组 4 末，执行期单独 commit）

| 路径 | 行 | 改动 |
| --- | --- | --- |
| dotfiles `agent/skills/dsh-plugin-writer/SKILL.md` | `:36`、`:68`、`:84` | `tooling/template/` → `templates/default/`；`:68` 顺带补 `[--template <name>]`（默认 `default`）；`:84` 指向 `templates/README.md`（约定）+ `templates/default/README.md`（件套表） |
| dotfiles `agent/skills/dsh-plugin-writer/references/verify-install.md` | `:205` | `tooling/template/README.md` → `templates/default/README.md` |
| dotfiles `agent/skills/dsh-plugin-writer/references/build.md` | `:23` | `tooling/template/build.mjs` → `templates/default/build.mjs` |
| dotfiles `agent/skills/dsh-plugin-writer/references/structure.md` | `:87` | 同 build.md（路径 + 仍为薄入口范文） |

### 1.7 生成物与明确不触达

- **生成物**（不手改，构建/安装产生）：根仓 `plugins/multi-root-workspace/lib/**`（63 个 tracked 文件，删导出后 `lib/compat*.js` 与 `lib/types/compat/dsh-version.d.ts` 等重写）、根仓 `pnpm-lock.yaml`。
- **不触达**：`tooling/{build-kit,host-kit,test-kit,contracts}` 源码；六个软插件源码/清单；multi-root 业务行为代码（`fs.ts` / `sandbox.ts` / `registry*.ts` / `scope.ts` / `instructions.ts` / `lsp.ts` / `workspace-files.ts` / `file-references.ts` / `client/**`）；`minimumReleaseAgeExclude`；`allowBuilds`；`.oxlintrc.json`；`.github/workflows/ci.yml`（见 ④ D-8）；`openspec/specs/**` 主 spec（归档 sync 时才动）；`openspec/changes/optimize-architecture/**` 与 `openspec/changes/archive/**`（历史提案/归档，不回改，其中 `tooling/template` 的历史引用保留）。

---

## ② 证据锚

> 每条为「代码事实 → 它支撑的改动」。同一模块 ≥1 条。新建文件标 **新建**。

### 2.1 模板与生成器

| 模块 | 证据（file:line） | 支撑 |
| --- | --- | --- |
| gen-plugin | `scripts/gen-plugin.mjs:33` `const TEMPLATE_ROOT = join(REPO_ROOT, 'tooling', 'template')` | 外迁后改 `templates` |
| gen-plugin | `scripts/gen-plugin.mjs:47-60` `USAGE` 只有 `<name> --kind [--dry-run]` | 新增 `--template` 契约 |
| gen-plugin | `scripts/gen-plugin.mjs:71-83` `FILE_TABLE` 11 条，含 `format: 'manifest' | 'solution'` 与 `only: 'dual'` 两处 | `template.json` 四键来源 |
| gen-plugin | `scripts/gen-plugin.mjs:93-121` `parseArgs` 只识别 `--kind` / `--dry-run` | `--template` 解析与默认值 |
| gen-plugin | `scripts/gen-plugin.mjs:265-281` `buildFiles` 逐条 `join(TEMPLATE_ROOT, entry.template)` + `existsSync` 抛「模板素材缺失」 | 清单驱动 + fail-closed |
| gen-plugin | `scripts/gen-plugin.mjs:360-373` dry-run / 成功回执只打印相对目录与 `kind` | 输出加模板名 |
| 模板自述 | `tooling/template/README.md:1-6`（标题、AR7/AR2 分工）与 `:17-33`（文件表 + 两条硬约束） | 拆分依据 |
| 插件 README 模板 | `tooling/template/plugin-README.md.tmpl:6` 自链接 `[…](../../tooling/template/README.md)` | 改 `templates/default/README.md` |
| 结构门禁 | `scripts/check-architecture.mjs:641-645` `FORBIDDEN_PACKAGES` 含 `['tooling/template', …]` | 换 `templates` / `templates/*` |
| 结构门禁 | `scripts/check-architecture.mjs:22`、`:70`、`:794` 三处「tooling/template 不是包」文案 | 文案同步 |
| 结构门禁 | `scripts/check-architecture.mjs:744-745` 以 `src/compat/dsh-version.ts` 存在性划分 softPlugins（AR3–AR6 排除 multi-root） | ④ D-7 不重命名标志 |
| workspace | `pnpm-workspace.yaml:7-13` packages 五条 + `:5-6` 「避免 pnpm -r 递归到模板」注释 | 注释改写；packages 不加 templates |
| workspace | `pnpm-workspace.yaml:29-63` `catalogs.dsh` 31 条（并按字母序排列） | 插入 22 条的位置依据 |

### 2.2 G-C 依赖面

| 模块 | 证据 | 支撑 |
| --- | --- | --- |
| multi-root 清单 | `plugins/multi-root-workspace/package.json:94-163` peers 22 条（21 DSH + cordis `>=4.0.1 <5.0.0`） | 21 条改范围 + 新增 dsh peer |
| multi-root 清单 | `plugins/multi-root-workspace/package.json:165-216` devDeps 中 36 条 `@deepseek-ai/*`（35 DSH + cordis），全为 `0.2.2-rc.1` 字面量 | 全部 → `catalog:dsh` |
| multi-root 清单 | `plugins/multi-root-workspace/package.json:217-228` `dsh` 块只有 `bundle` 与 `client` | 补 `engines.dsh` |
| 基线检查 | `scripts/check-dsh-baseline.mjs:260-265` `hardPlugins` / `softPlugins` + `expected exactly one exact-contract plugin` | 删除分裂与「恰一个」断言（explore R-5） |
| 基线检查 | `scripts/check-dsh-baseline.mjs:344-355` 组 4 只对 `softPlugins` 施加 `catalog:dsh` 形态断言 | 改遍历全部插件 |
| 基线检查 | `scripts/check-dsh-baseline.mjs:357-370` 组 5 只对软插件断言 engines/peers，并硬要求 `@deepseek-ai/dsh` peer | 改遍历全部插件 → ④ D-3 |
| 基线检查 | `scripts/check-dsh-baseline.mjs:372-387` 组 6 读 `SUPPORTED_DSH_RELEASES` 并 `execFileSync(compat:check)` | 整段删除 |
| 升级脚本 | `scripts/upgrade-dsh.mjs:71-80` `hasExactContract()`；`:245-256` 精确契约插件跳过 engines/peers；`:273-285` 残留字面量豁免；`:455-458` 打印「append to SUPPORTED_DSH_RELEASES」 | 删例外 + 新重指 + 换提示 |
| 基线常量 | `scripts/dsh-baseline.mjs:4-6` docstring「四个插件…三个软插件」 | 注释校正 |
| 发布年龄 | `pnpm-workspace.yaml:80+` 已含 22 个新 catalog 键的精确条目 | 豁免不动（A-6） |

### 2.3 G-C 运行时门

| 模块 | 证据 | 支撑 |
| --- | --- | --- |
| 运行时契约 | `plugins/multi-root-workspace/src/compat/dsh-version.ts:34` `export const SUPPORTED_DSH_RELEASES = [...] as const` | 删除（D2） |
| 运行时契约 | `…/dsh-version.ts:37` `export type SupportedDshRelease = typeof …[number]` | 删除（D2） |
| 运行时契约 | `…/dsh-version.ts:80-83` `CompatEnforcement` + `COMPAT_ENFORCEMENT_ENV`；`:205-217` `compatEnforcement()` | 删除（D1） |
| 运行时契约 | `…/dsh-version.ts:189-201` `if (!(SUPPORTED_DSH_RELEASES as readonly string[]).includes(release))` + `supported: …join(', ')` | 改范围判定与文案 |
| 运行时契约 | `…/dsh-version.ts:16-18` docblock「An npm range like `>=0.1.2-alpha.4 <0.2.0` therefore promises far more…」 | 论证作废，须改写并在 ADR 留痕 |
| 门禁反应 | `plugins/multi-root-workspace/src/compat.ts:107-123` `assertSupportedInstallation(report, enforcement)` 的 warn 分支与返回字符串 | 单参简化 |
| 门禁反应 | `…/compat.ts:130-135` `apply` 里 `compatEnforcement()` + `ctx.logger.warn` | 删除 |
| 导出面 | `plugins/multi-root-workspace/src/index.ts:26-42` 值/类型导出含两个待删名 | 导出面改写 |
| 单测 | `plugins/multi-root-workspace/tests/compat.spec.ts:81` `const upgradeLane = compatEnforcement() === 'warn'`；`:282-293` enforcement describe；`:211-236` warn 用例 | D1 连锁面 |
| 单测 | `…/compat.spec.ts:101-104` `manifest.devDependencies['@deepseek-ai/dsh-sandbox-local']` 必须等于 `report.release` | catalog 化后必红 → 改 `'catalog:dsh'` |
| 单测 | `…/compat.spec.ts:113-130` `expected = SUPPORTED_DSH_RELEASES.join(' || ')`，peer 逐字比较 | 改 `SUPPORTED_DSH_RANGE` + engines |
| 测试支撑 | `plugins/multi-root-workspace/tests/support/compat.ts:1-35` 挂真实门禁行；docstring 提 warn lane | 文档同步 |
| 静态检查 | `plugins/multi-root-workspace/scripts/check-dsh-compat.mjs:55-66` `readStringArray` + 三个数组；`:77-82` peers == join；`:92-106` dev pin；`:108-129` installed tree 的 allowlist 判断 | 换基线字面量 + 范围断言 |
| CI 覆盖 | `.github/workflows/ci.yml:34-53` 七步链只跑根级 `pnpm test` / `pnpm dsh:check`，无 `compat:check` | ④ D-8 的覆盖论证 |
| lib 布局 | `plugins/multi-root-workspace/lib/` 扁平（`compat.js` + `compat-*.js` chunk，无 `lib/compat/` 目录）；`package.json:63-71` `files` 不含 `src/` 与 `scripts/` | ④ D-1 拒绝「读自身 manifest / import scripts」的硬证据 |

### 2.4 G-C 文档与 spec

| 模块 | 证据 | 支撑 |
| --- | --- | --- |
| ADR-0009 | `docs/decisions/ADR-0009-…md:7`、`:9` 两条历史 fork 注；`:43-57` 第 1 节精确 allowlist；`:106-112` 第 5 节 warn；`:240-257` 最新修订节；`:259` Related Documents | 三条追加（Status 两行 + Related 前新节）的落点与「不改写历史」 |
| ADR 交叉引用 | `ADR-0002:28`（「范围承诺过大，现在只列确切版本」）、`:30`（「矩阵等于 SUPPORTED_DSH_RELEASES」） | 注记追加 |
| ADR 交叉引用 | `ADR-0011:49`、`ADR-0012:71`（「按既有 exact allowlist 声明」） | 注记追加 |
| 索引 | `docs/decisions/README.md:28` + `README.en.md:28`（双语，§0 执行期校正） | 描述更新（两行同口径） |
| 仓库规则 | `plugins/multi-root-workspace/AGENTS.md:96`（H3 段）、`:107`（不变量 7） | 规则改写 |
| 用户文档 | `plugins/multi-root-workspace/README.md:47`、`:191`、`:215`；`README.en.md:45`、`:191`、`:215` | 双语同步 |
| 架构 | `docs/architecture/multi-root-workspace.md:90` | 门禁语义句 |
| 工作流 | `docs/development/plugin-development-workflow.md:11-13`、`:35`、`:51`、`:167`、`:173-183`、`:224-225` | 表/流程/排障同步 |
| 排障 | `docs/troubleshooting/unsupported-dsh-release.md:29-54`、`:56-71`、`:73-105`、`:88`、`:107-111` | 整篇改口（含 shim 路径） |
| Agent Note | `.agent/note/dsh-compat-contract.md:7-28`（§1）、`:109-131`（§5）、`:173-181`（§8） | 双语文档同步 |
| 仓级文档 | 根 `AGENTS.md:48-50`；根 `README.md:46` | 例外描述删除 |
| 主 spec | `openspec/specs/dsh-baseline/spec.md`：Purpose 段与五个 requirement 中被改动的四个、scenario 名（「基线提升收紧软范围」「软范围漂移被拒绝」「新基线宿主受支持」「被裁剪版本拒绝启动」「绿灯不等于授权」「静态契约与单测双重断言」） | delta 的 REMOVED/RENAMED/MODIFIED 与 scenario-loss 约束 |

### 2.5 G-B 清理

| 模块 | 证据 | 支撑 |
| --- | --- | --- |
| tsbuildinfo | `find . -name '*.tsbuildinfo'` → 9 条；`git check-ignore` 全命中、`git ls-files` 零条；`tsconfig.plugin.base.json` 无 `incremental`/`composite` 且 `noEmit: true` | 删除安全且不复现 |
| shim | `plugins/multi-root-workspace/scripts/upgrade-dsh.mjs:1-25` 整文件为 `spawnSync` 委托 + 弃用提示 | 删除 |
| shim 引用 | `docs/troubleshooting/unsupported-dsh-release.md:88` `node plugins/multi-root-workspace/scripts/upgrade-dsh.mjs 0.1.7-alpha.1`（唯一活引用）；`ADR-0009:9` 为历史注记 | 组 3 改口 + ADR 新注 |
| 其余 scripts | `plugins/multi-root-workspace/scripts/` 现有 9 个文件（删后 8 个） | 验证零残留 |

### 2.6 新建 / 生成文件（无既有代码事实可锚，标「新建」并给出所依据的既有证据）

| 新建文件 | 说明 | 依据 |
| --- | --- | --- |
| 根仓 `templates/README.md` | **新建**：多模板约定（命名、template.json schema、`--template` 契约、新增模板步骤） | `tooling/template/README.md:1-33`（现有约定文本）+ `scripts/gen-plugin.mjs:33`、`:71-83`；`pnpm-workspace.yaml:7-13`（packages 不含模板） |
| 根仓 `templates/default/template.json` | **新建**：FILE_TABLE 外移的自述清单 | `scripts/gen-plugin.mjs:71-83`（11 条：2 条 `format`、2 条 `only`） |
| 根仓 `templates/default/README.md` | **改写**（`git mv` 自 `tooling/template/README.md` 后拆分）：本模板自述 | `tooling/template/README.md:1-33` |
| 根仓 `openspec/changes/unify-deps-and-templates/specs/dsh-baseline/spec.md` | **新建**（规划阶段产出）：D3 的 delta 载体 | `openspec/specs/dsh-baseline/spec.md` 的 requirement 名与 scenario 名（`baseline 常量…` / `peer 枚举…` / `multi-root 精确支持矩阵` / `升级脚本候选树推导`） |
| 根仓 `openspec/changes/unify-deps-and-templates/{proposal.md,design.md,tasks.md}` | **新建**（规划阶段产出，不在本文件写） | 本文件的 ①/⑤ 即其输入 |
| 根仓 `plugins/multi-root-workspace/lib/**` | 生成物（构建产生，随仓提交） | `plugins/multi-root-workspace/lib/compat.js`、`lib/types/compat/dsh-version.d.ts` 现状 |

---

## ③ 接口与数据形状

### 3.1 运行时：范围判定函数与版本比较器

文件：`plugins/multi-root-workspace/src/compat/dsh-version.ts`。

```ts
/**
 * 仓库基线的运行时副本（唯一字面量）。与 scripts/dsh-baseline.mjs 的 DSH_BASELINE
 * 同值，由 `pnpm dsh:upgrade` 同批重写，并由「manifest engines/peers == 本文件派生范围」
 * 与「engines == 根基线派生范围」两条断言传递性地钉住相等。
 */
export const DSH_BASELINE = '0.2.2-rc.1'

/** 由基线派生的支持范围：`>=<基线> <<主>.<次+1>.0`（下界含、上界不含）。 */
export const SUPPORTED_DSH_RANGE = softDshRange(DSH_BASELINE)   // 私有 3 行推导；基线格式非法时模块装载即抛（fail-closed）

/** 解析后的精确版本。 */
interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (string | number)[]
}

/** 严格版本文法：`<major>.<minor>.<patch>[-<prerelease>]`。导出仅供 tests/（不进 barrel）。 */
export function parseVersion(value: string): ParsedVersion | undefined

/** semver 优先级比较：<0 / 0 / >0。导出仅供 tests/ 直接钉住比较语义（不进 barrel）。 */
export function compareVersions(left: ParsedVersion, right: ParsedVersion): number

/**
 * 是否在支持范围内。
 * 语义 = 「与基线同 major.minor 且 ≥ 基线」；格式不合法的版本一律 false（fail closed）。
 */
export function isSupportedDshRelease(release: string): boolean
```

比较器规则（逐条测试钉住）：

1. `major` / `minor` / `patch` 数值比较；
2. 无 prerelease 的版本 **大于** 同 triple 的 prerelease 版本（`0.2.2 > 0.2.2-rc.1`）；
3. prerelease 按 `.` 分段逐段比较：两段皆数字→数值比较；仅一方数字→数字段小；两段皆字母→ASCII 比较；
4. 前缀全等时短者小（`0.2.2-rc < 0.2.2-rc.1`）；
5. 范围判定额外要求 `major/minor` 与基线相同——这使 `0.3.0-alpha.1`（数值上 < `0.3.0`）被拒，与「钉住 0.2.x 线」一致；
6. `parseVersion` 失败的输入（`'0.9'`、`''`、`'latest'`）→ `false`，不抛。

边界用例（`isSupportedDshRelease`，基线 `0.2.2-rc.1` 时）：

| 输入 | 结果 | 理由 |
| --- | --- | --- |
| `0.2.2-rc.1` | true | 下界含 |
| `0.2.2-rc.2` / `0.2.2-rc.10` | true | 同 minor、≥ 基线；`rc.10 > rc.2` 由规则 3 保证 |
| `0.2.2` | true | 同 triple 无 prerelease > 有 prerelease |
| `0.2.3-alpha.1` | true | 用户裁定「0.2.x 预发布自动放行」 |
| `0.2.1-rc.5` | false | 同 minor 但 < 基线 |
| `0.1.7-rc.2` / `0.2.0` | false | < 基线 |
| `0.3.0` / `0.3.0-alpha.1` | false | minor 不同（规则 5，上界外） |
| `1.0.0` / `0.9.9` / `''` / `latest` | false | 域外 / 文法外 |

导出面变化（`src/index.ts`）：

- 删：`SUPPORTED_DSH_RELEASES`（值）、`SupportedDshRelease`、`CompatEnforcement`（类型）。
- 增：`DSH_BASELINE`、`SUPPORTED_DSH_RANGE`（值）、`isSupportedDshRelease`（值）。
- 不改：`classifyInstallation`、`readInstalledVersion`、`CORE_PACKAGES`、`REQUIRED_CORE_PACKAGES`、`OPTIONAL_CORE_PACKAGES`、`CompatReport`、`CompatVerdict`、`InspectedPackage`、`VersionReader`、`DshCompatUnsupportedError`、`MultiRootCompatService`。

门禁函数签名（`src/compat.ts`）：

```ts
// before: (report: CompatReport, enforcement: CompatEnforcement) => string | undefined
// after:
export function assertSupportedInstallation(report: CompatReport): void
// verdict !== 'supported' → throw DshCompatUnsupportedError(report)；否则返回。
```

`classifyInstallation` 的判定顺序与 `CompatReport` 形状不变；只有 `unsupported` 的判据与文案变：

```
unsupported 判定：parseVersion(release) 合法 && 同 major.minor && compare(release, baseline) >= 0 ？放行 : 拒绝
unsupported 文案关键行：
  `multi-root workspace: DSH ${release} is outside the supported range.`
  `  supported: ${SUPPORTED_DSH_RANGE}`
  `  installed: ${release}`
```

### 3.2 `template.json` 的 schema

位置：`templates/<name>/template.json`；消费者仅 `scripts/gen-plugin.mjs`。

**数据形状（JSDoc typedef，gen-plugin 内部）**

```js
/**
 * @typedef {object} TemplateFile
 * @property {string} template  相对模板目录的素材路径（POSIX，禁绝对路径 / '..'）
 * @property {string} output    相对插件目录的产物路径（同上）
 * @property {'manifest'|'solution'} [format]  结构化后处理；缺省 = 占位符渲染后原样写出
 * @property {'host-only'|'dual'} [only]       仅该 kind 生成；缺省 = 两个 kind 都生成
 *
 * @typedef {object} TemplateManifest
 * @property {string} name            模板名，必须等于目录名
 * @property {string} [description]   人读说明（仅文档用，生成器不消费）
 * @property {TemplateFile[]} files   非空、顺序即生成顺序
 */
```

**`templates/default/template.json`（新建，全文）**

```json
{
  "name": "default",
  "description": "六个软插件的终态骨架（host-only / dual）",
  "files": [
    { "template": "package.json.tmpl", "output": "package.json", "format": "manifest" },
    { "template": "cordis.patch.yml", "output": "cordis.patch.yml" },
    { "template": "build.mjs", "output": "build.mjs" },
    { "template": "tsconfig.json", "output": "tsconfig.json", "format": "solution" },
    { "template": "tsconfig.host.json", "output": "tsconfig.host.json" },
    { "template": "tsconfig.client.json", "output": "tsconfig.client.json", "only": "dual" },
    { "template": "vitest.config.ts", "output": "vitest.config.ts" },
    { "template": "src/index.ts", "output": "src/index.ts" },
    { "template": "src/client/index.ts", "output": "src/client/index.ts", "only": "dual" },
    { "template": "test/smoke.test.ts", "output": "test/smoke.test.ts" },
    { "template": "plugin-README.md.tmpl", "output": "README.md" }
  ]
}
```

**`loadTemplate(name)` 的校验规则（任一不满足 → exit 1，错误含 `templates/<name>/` 与可用模板列表）**

| 规则 | 失败信息要点 |
| --- | --- |
| `name` 匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` | 非 kebab-case / 含路径段 |
| 目录存在且含 `template.json` | 「模板不存在或缺少 template.json；可用：default」 |
| JSON 可解析且为对象 | 解析错误原文 |
| 顶层键 ⊆ `{name, description, files}` | 点名单个未知键 |
| `name === 目录名` | 两者都报 |
| `files` 为非空数组 | 空清单 |
| 条目键 ⊆ `{template, output, format, only}` | 点名单个未知键（`onlyy` 之类） |
| `template`/`output` 为非空字符串、无首 `/`、无 `..` 段、无反斜杠 | 点名字段与值 |
| `format` ∈ `{manifest, solution}`、`only` ∈ `{host-only, dual}` | 点名允许值 |
| `output` 不重复 | 点名重复路径 |
| 素材文件 `join(templateDir, entry.template)` 存在 | 按 `relative(REPO_ROOT)` 打印缺失路径 |

**gen-plugin 函数签名变化**

```js
const TEMPLATE_ROOT = join(REPO_ROOT, 'templates')
const DEFAULT_TEMPLATE = 'default'

/** @returns {{dir: string, manifest: TemplateManifest}} */
function loadTemplate(name)

/** @returns {string[]} 可用模板名（目录含 template.json），按名排序 */
function listTemplates()

/** @returns {{help: boolean, name?: string, kind?: string, template: string, dryRun: boolean, usageErrors: string[]}} */
function parseArgs(argv)   // --template / --template=<name>；缺值 → usageErrors（exit 2）；未知模板 → 值错误（exit 1）

/** @returns {{output: string, content: string}[]} */
function buildFiles(name, kind, rootManifest, template)
```

退出码契约不变：`0` 成功；`1` 校验失败（名字 / 目录已存在 / 未知 kind / **未知模板 / 模板清单非法 / 素材缺失**）；`2` 用法错误（缺必需参数、未知 flag、`--template` 缺值）。

### 3.3 `catalogs.dsh` 新 22 条键值形态

插入位置：`pnpm-workspace.yaml` 的 `catalogs.dsh` 块内，**按现有字母序**；缩进 4 空格、单引号键值：

```yaml
    '@deepseek-ai/dsh-agent-instructions': '0.2.2-rc.1'
    '@deepseek-ai/dsh-api-workspace-files': '0.2.2-rc.1'
    '@deepseek-ai/dsh-app-boot': '0.2.2-rc.1'
    '@deepseek-ai/dsh-base': '0.2.2-rc.1'
    '@deepseek-ai/dsh-file-reference': '0.2.2-rc.1'
    '@deepseek-ai/dsh-file-reference-local': '0.2.2-rc.1'
    '@deepseek-ai/dsh-fs': '0.2.2-rc.1'
    '@deepseek-ai/dsh-fs-local': '0.2.2-rc.1'
    '@deepseek-ai/dsh-fs-sandbox': '0.2.2-rc.1'
    '@deepseek-ai/dsh-lsp': '0.2.2-rc.1'
    '@deepseek-ai/dsh-lsp-stdio': '0.2.2-rc.1'
    '@deepseek-ai/dsh-sandbox': '0.2.2-rc.1'
    '@deepseek-ai/dsh-sandbox-local': '0.2.2-rc.1'
    '@deepseek-ai/dsh-sandbox-policy': '0.2.2-rc.1'
    '@deepseek-ai/dsh-sandbox-windows-acl': '0.2.2-rc.1'
    '@deepseek-ai/dsh-storage': '0.2.2-rc.1'
    '@deepseek-ai/dsh-storage-domain': '0.2.2-rc.1'
    '@deepseek-ai/dsh-storage-json': '0.2.2-rc.1'
    '@deepseek-ai/dsh-subprocess': '0.2.2-rc.1'
    '@deepseek-ai/dsh-subprocess-local': '0.2.2-rc.1'
    '@deepseek-ai/dsh-system-prompt': '0.2.2-rc.1'
    '@deepseek-ai/dsh-typert-protocol': '0.2.2-rc.1'
```

不变量：31 → 53 条；`multi-root` 的 36 条 `@deepseek-ai/*` devDeps ⊆ catalog 键集；每个 DSH 值 = 基线；cordis = `4.1.0`、schemastery = `3.19.0` 不变。

### 3.4 `dsh.engines.dsh` 字段形状与 manifest 片段

```json
"dsh": {
  "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0" },
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-renderer"] }
}
```

同批的 peer / devDep 形状（局部）：

```json
"peerDependencies": {
  "@deepseek-ai/cordis": ">=4.0.1 <5.0.0",
  "@deepseek-ai/dsh": ">=0.2.2-rc.1 <0.3.0",
  "@deepseek-ai/dsh-agent": ">=0.2.2-rc.1 <0.3.0",
  "…共 22 条 DSH peer（21 现有点 + 新增 dsh）全部同串…"
},
"devDependencies": {
  "@deepseek-ai/cordis": "catalog:dsh",
  "@deepseek-ai/dsh": "catalog:dsh",
  "…共 36 条 @deepseek-ai/* 全部 catalog:dsh…",
  "@dsh-plugins/contracts": "workspace:*",
  "…工具链（@types/*、oxlint、typescript、vitest、tsdown、vite、react、jsdom、clsx、yaml）不动…"
}
```

字段落点：`dsh` 块内 `engines` 放在 `bundle` 之前（与六软插件模板 `package.json.tmpl` 的键序一致）。

### 3.5 `check-dsh-compat.mjs` 新断言伪码

```text
source   = readFileSync(src/compat/dsh-version.ts)
baseline = readStringLiteral(source, 'DSH_BASELINE')     // /export const DSH_BASELINE = '([^']+)'/，缺失/空 → throw
assert baseline =~ /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
expected = softRange(baseline)                            // `>=${baseline} <${major}.${minor+1}.0`，本地 3 行推导
manifest = JSON.parse(package.json)
peers    = manifest.peerDependencies ?? {}
engines  = manifest.dsh?.engines?.dsh

failures = []

// ① peers == dsh.engines.dsh == 派生范围（逐字）
if (engines !== expected) fail(`dsh.engines.dsh is ${engines}, expected ${expected}`)
for (name, range) of peers where isDshPackage(name):
    if (range !== expected) fail(`peerDependencies["${name}"] is ${range}, expected ${expected}`)

// ② required-core-in-peers（保留）
for name of REQUIRED_CORE_PACKAGES:
    if (!(name in peers)) fail(`${name} is required but not declared in peerDependencies`)

// ③ installed tree：可判定的两种失败（mixed / missing）
for name of REQUIRED_CORE_PACKAGES: require(`${name}/package.json`) → 失败即「required but not installed」
计算 releases = 去重的已装版本
if releases.length > 1 → fail(`mixes dsh releases: …`)

// 输出（notes，供人读与 CI 日志断言）：
notes.push(`baseline: ${baseline}`)
notes.push(`range: ${expected}`)
notes.push(`installed tree: ${release}`)      // 仅当 releases.length === 1

// 说明（写进注释，不是断言）：单 release 的「是否在范围内」不在本脚本重算——
// 范围谓词若在此复制一份就会与 src 静默分叉；该事实由运行时门禁 + tests/compat.spec.ts
// 与根 dsh:check（安装树 == 基线）两侧覆盖。

exit(failures.length ? 1 : 0)
```

### 3.6 `upgrade-dsh.mjs` 新增函数签名

```js
/**
 * 把各插件运行时基线副本重指到目标版本（append 到重写批次，幂等）。
 * 扫描 plugins/<name>/src/compat/dsh-version.ts；无该文件即跳过（当前仅 multi-root）。
 * @param {Array<{dir: string, manifest: {name: string}}>} plugins
 * @param {string} target
 * @returns {string[]} 人类可读的变更描述
 */
function repointRuntimeBaselines(plugins, target)

// 重写正则（与 scripts/dsh-baseline.mjs 的 repointBaseline 同形）：
// /(export const DSH_BASELINE = ')([^']+)(')/u
// 找到但值不同 → writeFileSync + changes.push(`${name}: runtime DSH baseline ${old} → ${target}`)
// 找不到字面量 → throw（模板被改坏时 fail loud，而不是静默漏改）
```

### 3.7 `dsh-baseline` spec delta 的数据形状

文件：`openspec/changes/unify-deps-and-templates/specs/dsh-baseline/spec.md`（新建）。

```markdown
## REMOVED Requirements

### Requirement: multi-root 精确支持矩阵

## ADDED Requirements

### Requirement: multi-root 软范围放行
（启动判定 SHALL 由基线派生软范围承载；域内放行完整加载、域外拒绝启动并输出范围）

#### Scenario: 域内版本放行
#### Scenario: 域外版本拒绝启动

## RENAMED Requirements

- FROM: `### Requirement: peer 枚举与 allowlist 一致`
- TO: `### Requirement: multi-root peer 与软范围一致`

## MODIFIED Requirements

### Requirement: 基线常量唯一来源与软范围派生
（"六个软插件" → "全部插件（含 multi-root）"；保留原两个 scenario 名）

#### Scenario: 基线提升收紧软范围        ← 名字必须保留
#### Scenario: 软范围漂移被拒绝          ← 名字必须保留

### Requirement: multi-root peer 与软范围一致
（全部 DSH peer 与 dsh.engines.dsh SHALL 逐字等于派生范围；cordis 不受影响）

#### Scenario: 静态契约与单测双重断言    ← 名字必须保留

### Requirement: 升级脚本候选树推导   ← 待决 Q3 采纳后才加这一节
（删 "MUST NOT 改动 multi-root 的 allowlist 与 peer 枚举"；改为"运行时基线副本 SHALL 同批重指"）
（原三个 scenario 名全部保留）
```

> 以上是**节与名**的骨架；每个 scenario 需补 WHEN/THEN 正文（ADDED 的两条按 D3 语义写，MODIFIED 的三条按现行文改写内容但不改名）。

机制约束（`openspec validate <change> --strict` 会强制）：
1. `MODIFIED` 若引用被 `RENAMED` 的旧名 → `ERROR: MODIFIED references old name from RENAMED`；必须用新名。
2. `MODIFIED` 整块替换原 requirement，**必须复制原 scenario 名**，否则 `ERROR: … omits scenario(s) the current spec still has`。
3. 每个 ADDED / MODIFIED requirement ≥1 个 `#### Scenario:`，且 requirement 文本含 SHALL/MUST。
4. 既有 capability 的 delta **不能**更新 `## Purpose`（apply 会 warn 并忽略），Purpose 的「精确支持矩阵」措辞留待归档 sync 时改。

---

## ④ 决策记录

> 每条：决策 / 被否方案与理由 / 反例。D-0 为流程裁定留痕（用户已确认）。

### D-0 不加载 skill（流程裁定）

- **决策**：延续 `optimize-architecture` D-13 先例，本阶段不加载 skill；设计受仓根 `AGENTS.md` 与 `plugins/multi-root-workspace/AGENTS.md` 约束（后者的「Before Making Changes → Read docs/README.md → docs:check」已纳入 ⑤ 组 3/组 6）。
- **被否**：加载 `spring-writer` / `nuxt-writer`。理由：栈识别均未命中（本仓无 Spring/Nuxt 工程），本次是仓级工程改造而非插件编写。
- **反例**：强行加载会引入第二套插件结构/测试约定，与仓根 AGENTS 的「插件结构约定」「构建基准」冲突；两套权威下，执行期无法判定哪条为准。

### D-1 范围常量载体：src 本地字面量 + 指针注释（不读 manifest）

- **决策**：`src/compat/dsh-version.ts` 持有 `DSH_BASELINE` 字面量（注释指向 `scripts/dsh-baseline.mjs`），`SUPPORTED_DSH_RANGE` 由它派生；仓库唯一管理常量仍是 `scripts/dsh-baseline.mjs`。
- **被否 A：运行时从自身 manifest 的 `dsh.engines.dsh` 读出。**
  - 理由：① 源码态与产物态路径不同——vitest 直接跑 `src/compat/dsh-version.ts` 时 `../package.json` 指向 `src/package.json`（不存在），构建后 `lib/compat.js` 才指向包根，两态必有一态错；② 装载期引入 fs I/O 与 JSON 解析异常面，违背该模块 docblock「deliberately pure」；③ 让被检查的声明成为判据本体（manifest 写错 → 门禁照抄错误）。
  - 反例：profile 侧安装包 `files` 只有 `lib/*.js`、`lib/types/**`、patch、README、LICENSE（`package.json:63-71`），`lib/` 是扁平 chunk（实测无 `lib/compat/` 目录）——任何「相对路径找 package.json」的写法在源码测试里读到的都是 `src/package.json`；加 `existsSync` 双路径回退 = 把 I/O + 分支塞进启动门禁，且测试与生产走不同分支。
- **被否 B：`import pkg from '../../package.json' with { type: 'json' }`。** 理由：esbuild/tsdown 会把整份 manifest 内联进宿主产物（体积 + 构建期快照），产物随构建时的 package.json 漂移；且 `src` 与 `lib` 相对深度不同。
- **被否 C：src 直接 import 根 `scripts/dsh-baseline.mjs`。** 反例：`scripts/` 不在 `files` 白名单内，profile 安装形态下静态 import 在装载期 `ERR_MODULE_NOT_FOUND` → compat 行不启动 → 七个受限行静默不启动，比拒绝启动更难诊断。

### D-2 版本比较器：手写（不引 semver、不做字符串比较）

- **决策**：~45 行手写 semver 优先级比较 + 「同 major.minor 且 ≥ 基线」范围谓词（③ 3.1）。
- **被否 A：引 `semver` 依赖。** 理由：① 新运行时依赖（该门禁在启动期加载）；② 语义不对齐——默认规则下 `0.2.3-alpha.1` **不**满足 `>=0.2.2-rc.1 <0.3.0`（同 tuple 无 prerelease comparator），与用户裁定的「0.2.x 预发布自动放行」相反；`{ includePrerelease: true }` 又会放进 `0.3.0-alpha.1`（数值上 < `0.3.0`），仍需外层 `minor === base.minor` 守卫。依赖只换来比较循环，没换来语义。
- **被否 B：字符串前缀 + 字典序。** 反例：`'0.2.10' < '0.2.2'`、`'0.2.2-rc.10' < '0.2.2-rc.2'` 都判反。
- **被否 C：`localeCompare(..., { numeric: true })`。** 反例：只解决数字段，不处理「无 prerelease > 有 prerelease」与「数字标识 < 字母标识」，且 locale 依赖不可控。
- **反例（测试必须钉住）**：`compare('0.2.2-rc.10','0.2.2-rc.2') > 0`；`compare('0.2.2','0.2.2-rc.1') > 0`；`compare('0.3.0-alpha.1','0.3.0') < 0`；而 `isSupportedDshRelease('0.3.0-alpha.1') === false`（规则 5 的 minor 守卫）——若只用 `<0.3.0` 数值判定，这条会误放行。

### D-3 peer 面补 `@deepseek-ai/dsh`（凑成 23 条 `@deepseek-ai/*` peer）

- **决策**：multi-root 新增 `"@deepseek-ai/dsh": ">=0.2.2-rc.1 <0.3.0"` peer（必选，不加 `optional`），与六软插件 `package.json.tmpl` 的 peer 形态同构；21 条既有 DSH peer 同步改范围；cordis 不动。
- **依据**：① `scripts/check-dsh-baseline.mjs:364` 对每个插件硬断言 `'@deepseek-ai/dsh' in peers`——不补则 multi-root 并入统一断言时立刻红；② 材料与 D3 的「23 条」只有在补 1 条后才与 `@deepseek-ai/*` peer 实数（22 DSH + cordis）吻合（§0-1）；③ 六软插件全部声明该 peer，统一管理即同构。
- **被否 A：不补，放宽根检查的 umbrella 断言。** 理由：该断言是六包既有形态守卫，为整齐而删断言是「用弱化门禁换同构」，方向相反。
- **被否 B：补但标 `peerDependenciesMeta.optional`。** 理由：六包对 `@deepseek-ai/dsh` 均为必选 peer；标 optional 会让「宿主 dsh 版本」这一最关键 peer 可缺省，安装期门禁失去锚点。
- **反例**：若不补且把断言改成「只对已声明该 peer 的包校验」，则该断言对六包之外的任何包永远为真——门禁退化成空断言；而 multi-root 恰是新并入的那个包，等于在并入门槛上开了一个洞。

### D-4 运行时字面量的同步机制：升级脚本同批重写（不只靠人工 + 检查）

- **决策**：`scripts/upgrade-dsh.mjs` 新增 `repointRuntimeBaselines()`（③ 3.6），与基线常量 / catalog / manifest 同批重写；找不到字面量即 throw。
- **被否 A：人工在升级后改 src 一行。** 反例：漏改时根 `dsh:check` 仍绿（engines/peers 已对齐新基线），只有 `compat.spec` / `compat:check` 会红；更糟的是若跑的是「只探测不提交」的流程，人必须先手工改源码才能跑通 `verify:all`——与升级脚本 docstring 第 5 行「把**整个仓库**钉到 X」的既有契约相悖。
- **被否 B：让升级脚本继续「不碰」运行时声明。** 反例：那等于保留一个不受工具管理的手写副本；`catalogs.dsh` 迁移时踩过的「不同批 = 下次升级静默写坏清单」（`openspec/changes/optimize-architecture/diff-matrix.md:40` O7）是同一类问题。
- **反例（验证路径）**：把 src 字面量临时改成 `0.2.1-rc.5`，跑 `pnpm dsh:upgrade 0.2.2-rc.1` → 字面量被自动改回且 stdout 打印该行（这条验证同时覆盖「重写生效」与「幂等」）。

### D-5 `template.json` 键面：四键条目 + 三键顶层，fail-closed

- **决策**：③ 3.2 的 schema；条目键 `template` / `output` / `format?`(manifest|solution) / `only?`(host-only|dual)，顶层 `name` / `description?` / `files`；未知键、重复 output、绝对/`..` 路径、缺失素材一律 exit 1。
- **被否 A：目录扫描发现（不写清单）。** 反例：`--dry-run` 与真实写入会随扫描时点变化（编辑器 swap、`.DS_Store`、临时文件）；且 `format: 'manifest' | 'solution'` 与 `only` 这两类知识仍必须存在——扫描只去掉可见性，不减少需要维护的知识。
- **被否 B：按 kind 目录分叉（`templates/default/host-only/` + `dual/`）。** 反例：11 个文件里只有 2 个按 kind 分叉，目录分叉会让 9 个共享文件各存两份，任何漂移都要双改。
- **被否 C：忽略未知键（前向兼容）。** 反例：`"onlyy": "dual"` 被静默忽略 → host-only 生成物带上 `tsconfig.client.json` 却没有 `dsh.client` / `exports["./client"]`，错误在生成后 `pnpm typecheck` / `dsh:check` 才暴露，离根因很远；fail-closed 在 `--dry-run` 阶段就点名该键。
- **被否 D：顶层加 `schemaVersion` / `$schema`。** 理由：唯一消费者与素材同仓同提交，没有跨版本兼容面；真的需要时再加（当前加只会多一套手写与校验负担）。

### D-6 AR2 对 `templates/` 的断言形态：不新增 AR，只改 AR7 文本 + gen-plugin fail-closed

- **决策**：`scripts/check-architecture.mjs` 只改 AR7（`FORBIDDEN_PACKAGES` 加 `templates` / `templates/*` + 三处文案）；AR2 代码零改动（仅更新 `listPackages` 的「tooling/template 不是包」注释）；不新增 AR8。
- **被否 A：新增 AR8「templates 结构不变式」。** 理由：`templates/` 不在任何 workspace 扫描根内，`pnpm -r` 也不会递归到它；把模板自述校验塞进结构门禁会扩大 AR 编号面，并要同步 AGENTS/README/`dsh-check` 三处 AR 列表。完整性由 gen-plugin 读取时 fail-closed 覆盖，演练命令给正/负例。
- **被否 B：扩展 AR2 去扫 `templates/`。** 理由：AR2 的语义是「tooling 包治理」（private / 0.0.0 / 零 DSH 依赖 / 脚本白名单），模板不是包；混进去会让失败信息指向错误的治理规则。
- **反例**：若有人把 `templates/*` 写进 `pnpm-workspace.yaml`，`pnpm -r` 会尝试把 `templates/default` 当包递归；AR7 新增的两条 FORBIDDEN 会在 `dsh:check` 第一处就点名该条目——这就是这两条存在的理由（而不是去 AR2 里加断言）。

### D-7 复用 `src/compat/dsh-version.ts` 作为「非薄入口插件」标志（不重命名）

- **决策**：`check-architecture.mjs:744-745` 的判定机制保留，只改注释语义（该文件已从「精确 allowlist」变为「运行时基线副本」，但仍是 multi-root 构建路线的标志）。
- **被否：改名（如 `compat/runtime-baseline.ts`）或另立标志文件。** 反例：AR3–AR6 的排除逻辑依赖该文件存在；改名漏同步 → multi-root 被当作软插件套 AR3（核心脚本模板）/ AR4（`build.mjs` 必须是 build-kit 薄入口）→ 立刻红，而修复方式是再加一个标志文件，绕一圈回到原点。真正的排除理由是 multi-root 用 tsc + tsdown，文件名不是。

### D-8 `compat:check` 的调用者：进 `verify:all`，不进根 `dsh:check`、不改 CI

- **决策**：按用户要求删除 `check-dsh-baseline.mjs` 的 `compat:check` 调用；把 `pnpm compat:check` 加入 multi-root 的 `verify:all`（`package.json` scripts）——顺序定为 `lint && compat:check && typecheck && build && kernel:probe && test && smoke`（静态契约最先、smoke 最末）。CI 七步链不动。
- **被否 A：在根检查里改成「声明了 compat:check 即运行」的通用循环。** 理由：用户明确要求删除该检查段；且根门禁会因此依赖子包脚本可用性（子包脚本崩溃 → 根门禁红），它检查的事实（peers/engines 与 src 基线）已在单测里逐字断言。
- **被否 B：CI 加一步 `pnpm --filter … compat:check`。** 理由：七步链每步都是根级递归命令，插 filter 步破坏「根命令即全量」形态；覆盖已由 `pnpm test` 提供（且更强——单测直接 import 模块，不是文本解析）。
- **反例**：若三处都不放（根检查删了、verify:all 不进、CI 不进），`compat:check` 成为无调用者的死命令；而它承载「构建前、干净 checkout、无 `lib/` 也能跑」的独立价值——`verify:all` 是文档指定的完整门禁入口，放这里才有人真跑得到。

### D-9 ADR 与 spec delta 的写法：append-only + RENAMED/MODIFIED

- **决策**：ADR-0009 三处**追加**（Status 两条 fork 注 + Related 之前新增「范围化」一节），历史正文一字不改；ADR-0002/0011/0012 用注记式追加；spec delta 用 `REMOVED` + `ADDED` + `RENAMED`(+`MODIFIED`) + `MODIFIED`。
- **被否 A：直接改写 ADR-0009 第 1/5/6/8 节。** 反例：该 ADR 的 Context 明写「范围是对尚不存在的版本做预测」，改写会让「当初为何选 allowlist」与「现在为何推翻」两段因果同时消失；本仓既有先例是 ADR-0002 用删除线 + 「已被 ADR-0009 取代」注记。
- **被否 B：用 `MODIFIED` 直接改名（不写 `RENAMED`）。** 反例：OpenSpec 1.16 的 validator 对「MODIFIED 引用 RENAMED 的旧名」报 `ERROR: MODIFIED references old name from RENAMED`，`--strict` 直接红。
- **反例（scenario 丢失）**：`MODIFIED` 会整块替换原 requirement；不复制原 scenario 名会被 `findScenarioLossIssues` 判 `ERROR: … omits scenario(s) the current spec still has`。因此 peer requirement 的 `静态契约与单测双重断言`、基线 requirement 的两个 scenario、升级脚本 requirement 的三个 scenario 名必须原样保留（内容可改写）。

---

## ⑤ 逐任务组实现要点

> 组间串行；组内写面不相交（同一文件不在同组出现两次）；单组 ≤8 任务。
> 每组末尾是**组 GATE**（该组所有任务完成后的判定命令）；任务级只给不依赖其他任务的局部断言。

### 组 1 — G-C 依赖面（写面：`pnpm-workspace.yaml` catalogs、`plugins/multi-root-workspace/package.json`、`scripts/{check-dsh-baseline,upgrade-dsh,dsh-baseline}.mjs`、`pnpm-lock.yaml`）

| # | 任务 | 局部验证（命令 / 断言） |
| --- | --- | --- |
| 1.1 | `catalogs.dsh` 插入 22 条（③ 3.3） | `node -e` 断言：catalog 键数 31→53；22 个新键值全 `0.2.2-rc.1`；multi-root 的 36 条 `@deepseek-ai/*` devDeps ⊆ catalog 键集（脚本见下） |
| 1.2 | `check-dsh-baseline.mjs`：删 hard/soft 分裂与组 6；组 4/5 改全插件；头注释与 `normalizeDep` 注释同步 | `node scripts/check-dsh-baseline.mjs` —— **预期在 1.3 完成前红**（multi-root 仍字面量 / 无 engines / 精确 peer）；失败行必须**全部以 `dsh-plugin-multi-root-workspace:` 开头**（组 4 形态 + 组 5 engines/peers 三类），六个软插件零失败 |
| 1.3 | multi-root `package.json`：36 devDeps → `catalog:dsh`；21 + 新增 1 = 22 条 DSH peer → 范围；补 `dsh.engines.dsh`；`verify:all` = `lint && compat:check && typecheck && build && kernel:probe && test && smoke` | `node -e` 断言：`engines.dsh === '>=0.2.2-rc.1 <0.3.0'`；所有 `@deepseek-ai/dsh*` peer 同值；`@deepseek-ai/dsh` peer 存在；cordis peer 仍 `>=4.0.1 <5.0.0`；36 条 devDeps 全 `catalog:dsh`。随后 `node scripts/check-dsh-baseline.mjs` 必须 **exit 0** |
| 1.4 | `upgrade-dsh.mjs`：删 `hasExactContract` 与豁免；新增 `repointRuntimeBaselines()`；换末段提示 | `grep -n "hasExactContract\|SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT" scripts/upgrade-dsh.mjs` → 0 命中；`node scripts/upgrade-dsh.mjs --print-installed` exit 0 |
| 1.5 | `pnpm install --no-frozen-lockfile` 更新 lockfile | `git diff --unified=0 pnpm-lock.yaml \| grep -E '^[+-]' \| grep -vE '^(\+\+\+\|---)' \| grep -v 'specifier: catalog:dsh' \| wc -l` → 0（只允许 specifier 行变化） |
| 1.6 | `scripts/dsh-baseline.mjs` 头注释校正 | `grep -n "四个插件\|三个软插件" scripts/dsh-baseline.mjs` → 0 命中 |

组 1 GATE：

```bash
pnpm install --no-frozen-lockfile
pnpm dsh:check                      # exit 0
git diff --stat pnpm-lock.yaml plugins/multi-root-workspace/package.json pnpm-workspace.yaml
# 红队：临时把 package.json 里 @deepseek-ai/dsh-fs 改回 "0.2.2-rc.1"
pnpm dsh:check                      # 必须 exit 1，信息含 expected "catalog:dsh"；随后恢复
```

1.1 的断言脚本（可复制执行）：

```bash
node --input-type=module -e "
import {readFileSync} from 'node:fs'
const yaml = readFileSync('pnpm-workspace.yaml','utf8')
const entries = [...yaml.matchAll(/^    '([^']+)': '([^']+)'$/gmu)].map(m => [m[1], m[2]])
const manifest = JSON.parse(readFileSync('plugins/multi-root-workspace/package.json','utf8'))
const devs = Object.keys(manifest.devDependencies).filter(n => n.startsWith('@deepseek-ai/'))
const keys = new Set(entries.map(([k]) => k))
const missing = devs.filter(n => !keys.has(n))
const wrong = entries.filter(([k, v]) => k.startsWith('@deepseek-ai/dsh') && v !== '0.2.2-rc.1')
if (entries.length !== 53 || missing.length || wrong.length) { console.error({count: entries.length, missing, wrong}); process.exit(1) }
console.log('ok: 53 entries, all 36 @deepseek-ai devDeps catalogued')
"
```

**组 1 终形态（执行期 2026-11-07 实测，R1/R2 见 tasks.md 附录）**

- 全部 7 任务通过，组 GATE `pnpm dsh:check` exit 0（末行 `3 组门禁全部通过`）。
- 实测事实：①门禁预期红形态 = 59 条失败行全部 `dsh-plugin-multi-root-workspace:` 前缀（36 devDeps + 1 engines missing + 22 peer），六软插件零失败——1.3 落地后转绿（agree 行）。②lockfile diff 的合法变化 = 三类：specifier 改写删除侧（36 行）+ catalogs 段新条目定义三行组（22×3=66 行）+ 新增侧 `specifier: catalog:dsh`；原验证句只白名单第三类（102≠0），已按 R1 修订为等价替代句（实测 0），解析结果零漂移（version 删除 0）。③pnpm 11.25 依赖状态门（R2）：manifest 被改的失败态下朴素 `pnpm dsh:check` 触发 auto-install 中止（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）而**不执行门禁脚本**——红队配方必须 `pnpm --config.verify-deps-before-run=false dsh:check`；GATE 绿态不受影响。④upgrade-dsh `repointPlugin` 保留「engines.dsh 已声明才重指」守卫（缺失字段不自动补写）——1.3 落地后七插件均声明，效果等同；块注释中 `plugins/*/src` 的 `*/` 会提前闭合注释，须写 `plugins/<name>/src`。
- 被否/边界：install 未产生任何依赖版本漂移（downloaded 0、`--frozen-lockfile --lockfile-only --offline` 复核 md5 一致）；`check-architecture.mjs:745` 自有的 softPlugins 分裂（AR3/AR4/AR5 非 multi-root 判定）语义不同、不在触达面，未动。

### 组 2 — G-C 运行时门（写面：`src/compat/dsh-version.ts`、`src/compat.ts`、`src/index.ts`、`tests/compat.spec.ts`、`tests/support/compat.ts`、`scripts/check-dsh-compat.mjs`）

| # | 任务 | 局部验证 |
| --- | --- | --- |
| 2.1 | `dsh-version.ts` 重写（③ 3.1）：删 allowlist/类型/enforcement；加基线 + 范围 + 比较器 + `isSupportedDshRelease`；改 unsupported 判定与文案；重写 docblock | `grep -n "SUPPORTED_DSH_RELEASES\|SupportedDshRelease\|compatEnforcement\|COMPAT_ENFORCEMENT_ENV\|CompatEnforcement" plugins/multi-root-workspace/src/compat/dsh-version.ts` → 0；`pnpm --filter dsh-plugin-multi-root-workspace typecheck` 预期在 2.2/2.3 前红（引用未清）——允许，组 GATE 收口 |
| 2.2 | `compat.ts`：单参 `assertSupportedInstallation`、删 warn 分支与 import、`apply` 去 warn | `grep -n "compatEnforcement\|COMPAT_ENFORCEMENT_ENV\|CompatEnforcement\|DSH_MULTI_ROOT_COMPAT\|logger.warn" plugins/multi-root-workspace/src/compat.ts` → 0 |
| 2.3 | `index.ts` 导出面（删 3 名 / 增 3 名；D2 不留别名） | `grep -n "SUPPORTED_DSH_RELEASES\|SupportedDshRelease\|CompatEnforcement" plugins/multi-root-workspace/src/index.ts` → 0；`grep -n "DSH_BASELINE\|SUPPORTED_DSH_RANGE\|isSupportedDshRelease" …/index.ts` → 3 命中 |
| 2.4 | `tests/compat.spec.ts` 改写（范围三态 + 删 warn/lane + dev pin 改 `catalog:dsh` + engines 断言）；`tests/support/compat.ts` docstring | `pnpm --filter dsh-plugin-multi-root-workspace test`（全绿；边界表覆盖 ③ 3.1 的 8 行） |
| 2.5 | `check-dsh-compat.mjs` 改写（③ 3.5） | `pnpm --filter dsh-plugin-multi-root-workspace compat:check` exit 0，stdout 含 `[compat] baseline: 0.2.2-rc.1`、`[compat] range: >=0.2.2-rc.1 <0.3.0`、`[compat] installed tree: 0.2.2-rc.1` |
| 2.6 | 重建产物（`pnpm --filter dsh-plugin-multi-root-workspace build`）并确认 d.ts 导出面 | `grep -rn "SUPPORTED_DSH_RELEASES\|SupportedDshRelease" plugins/multi-root-workspace/lib` → 0；`grep -n "SUPPORTED_DSH_RANGE\|isSupportedDshRelease" plugins/multi-root-workspace/lib/types/compat/dsh-version.d.ts` → ≥2 命中 |

组 2 GATE：

```bash
pnpm --filter dsh-plugin-multi-root-workspace typecheck
pnpm --filter dsh-plugin-multi-root-workspace build
pnpm --filter dsh-plugin-multi-root-workspace test
pnpm --filter dsh-plugin-multi-root-workspace compat:check
pnpm -r typecheck
pnpm dsh:check
# 红队一（运行时基线漂移）：sed 把 DSH_BASELINE 改为 '0.2.1-rc.5'
#   → compat:check exit 1（peers/engines 与派生范围不等）且 pnpm --filter … test 失败；恢复
# 红队二（warn 残留）：grep -rn "DSH_MULTI_ROOT_COMPAT" plugins/multi-root-workspace/{src,tests,scripts} → 0
```

**组 2 终形态（执行期 2026-11-07 实测，R3 见 tasks.md 附录；含微任务 2.8）**

- 全部 8 任务（2.1–2.7 + 微任务 2.8）通过；GATE 六连 exit 0（包 typecheck/build/test/compat:check + 全仓 typecheck + dsh:check，末行 `3 组门禁全部通过`；包测试 423 passed / 4 既有环境 skip，compat.spec 39 tests 0 skip）。
- 实测事实：①红队一精准红 = compat:check 23 条 expected（engines + 22 peers）+ 包测试 5 用例红（tripwire `is pinned to 0.2.2-rc.1` + boundary 3 条 + manifest 2 条），cp 恢复双绿；②红队二唯一命中是 2.1 写入的 docblock 历史叙述（「删除了 `DSH_MULTI_ROOT_COMPAT=warn`…」），经裁定 A 由 2.8 一行改写收口（「删除了按环境变量放行的警告档」），src/tests/scripts/lib 四处全零——历史叙述归 ADR-0009（组 3），源码注释保留环境变量字符串会干扰未来 grep 排查；③lib 产物 chunk 因内容哈希改名 `compat-lYI8x_n7.js`→`compat-CZl_gQYV.js`→`compat-BoLaK7du.js`（两次重建），clean-lib 删旧名、引用零孤儿；lib 变化面恒 7 项（compat.js/index.js/types 3 项/新 chunk/D 旧 chunk）。④2.1 实现细节：`VERSION_PATTERN`/`NUMERIC_IDENTIFIER` 须前置（`SUPPORTED_DSH_RANGE` 装载期调用 parseVersion，后置触发 TDZ）；docblock 不得复写 `export const DSH_BASELINE = '…'` 完整赋值形状（R3：upgrade 脚本按首个文本出现重写）；`ParsedVersion` 保持非导出；比较器 4 规则与 8 行边界表全部被 tests 钉住。⑤2.4 engines 断言对 `SUPPORTED_DSH_RANGE` 变量（tripwire 钉基线字面量）传递等价于字面量断言；基线换 minor 时边界表人工重导（tripwire 红提示，不静默过期）。
- 被否/边界：无源码降级路径（D1 warn 整体删除，无日志开关中间态）；2.3 顺带删悬空 `compatEnforcement` re-export（2.1 已删其源，保留必红）；tests 的旧名 import 直连 dsh-version.ts 不经 barrel（2.3 不替它们解红，2.4 负责）。

### 组 3 — G-C 文档与 spec delta（写面：ADR-0009/0002/0011/0012、decisions README、multi-root AGENTS/README(.en)/docs、根 README/AGENTS；`openspec/changes/unify-deps-and-templates/` **只读校验**）

| # | 任务 | 局部验证 |
| --- | --- | --- |
| 3.1 | ADR-0009：Related 之前新增范围化修订节 + Status 追加**范围化** fork 注（shim 注在 5.3 再追加一条，两次编辑互不覆盖） | `grep -n "支持矩阵范围化（2026-11-07）" ADR-0009…md` → 1；`git diff --stat ADR-0009…md` 只增不删（`git diff -U0 \| grep '^-' \| grep -v '^---'` → 0 行） |
| 3.2 | ADR-0002 / 0011 / 0012 注记 + `docs/decisions/README.md:28` | `grep -n "2026-11-07" ADR-0002…md ADR-0011…md ADR-0012…md` → 各 ≥1；同上「只增不删」断言 |
| 3.3 | multi-root `AGENTS.md`（`:96`、`:107`） | `grep -n "SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT\|exact-version allowlist" AGENTS.md` → 0 |
| 3.4 | multi-root `README.md` + `README.en.md` + `docs/architecture/…md:90` | `grep -n "exact list, not a range\|精确 allowlist\|version allowlist" README.md README.en.md docs/architecture/multi-root-workspace.md` → 0 |
| 3.5 | `docs/development/plugin-development-workflow.md` + `docs/troubleshooting/unsupported-dsh-release.md` | 两个文件 `grep -n "DSH_MULTI_ROOT_COMPAT\|SUPPORTED_DSH_RELEASES\|allowlist"` → 只剩被显式保留的历史段（workflow `:191-195` 上游历史）或 0；`grep -n "multi-root-workspace/scripts/upgrade-dsh" docs/troubleshooting/…` → 0 |
| 3.6 | `.agent/note/dsh-compat-contract.md` + `.en.md` + 两个 README(.en) 索引 | `cd plugins/multi-root-workspace && pnpm docs:check` exit 0 |
| 3.7 | 根 `README.md:46`、根 `AGENTS.md:48-50` | `grep -n "multi-root 保留精确\|六个软插件" README.md AGENTS.md` → 0 |
| 3.8 | **规划阶段已落档**的 `openspec/changes/unify-deps-and-templates/{proposal.md,design.md,tasks.md,specs/dsh-baseline/spec.md}`：执行期只校验、不改写（delta 形状 = ③ 3.7） | `openspec validate unify-deps-and-templates --strict` → exit 0；`git status --porcelain openspec/` → 空（执行期未改规范件） |

组 3 GATE：

```bash
pnpm docs:check
openspec validate unify-deps-and-templates --strict
grep -rn "SUPPORTED_DSH_RELEASES\|DSH_MULTI_ROOT_COMPAT" \
  README.md AGENTS.md plugins/multi-root-workspace/README.md \
  plugins/multi-root-workspace/README.en.md plugins/multi-root-workspace/AGENTS.md \
  plugins/multi-root-workspace/docs/architecture plugins/multi-root-workspace/docs/development \
  plugins/multi-root-workspace/docs/troubleshooting
# 期望：0 命中（ADR 正文与 .agent/note 历史测量段不在此 grep 面内）
```

**组 3 终形态（执行期 2026-11-07 实测，R4 见 tasks.md 附录；含 3.2/3.5 接续与 3.6 扩面）**

- 全部 8 任务通过（3.2、3.5 各含一次接续重派；3.6 扩面三处）；组收口 validate `--strict` valid、`openspec/specs/` 0 行（R4 例外口径）、`pnpm docs:check` 绿（check-docs.mjs 10 项全 PASS）、工作区 43 文件全部归入既有任务写面、无计划外文件。
- 规划材料清单遗漏共四处，执行期以「连锁残留纳入对应任务写面」收口：①`docs/decisions/README.en.md` 存在（规划断言「无 .en.md」失真）→ 3.2 接续同步英文索引行；②`docs/troubleshooting/README.md`/`README.en.md`:25 索引行与 `install-stops-at-build-approval.md`:88 链接文字（规划未列）→ 3.5 接续同步；③`README.md`:47 / `README.en.md`:45 / ADR-0009:299 旧标题链接文字 → 3.6 扩面。**规律：改标题/改口径的任务，其交叉引用面（链接文字、索引行、双语行）是隐式连锁面，后续任务（含组 4）派发前应先全仓 grep 旧标题/旧口径词。**
- 历史段处理先例（组 4/后续沿用）：旧机制叙述保留时以「**历史（…不再代表现行机制）**：」或「当时的…」限定词开头，段内禁用字符串（`SUPPORTED_DSH_RELEASES`/`DSH_MULTI_ROOT_COMPAT`）改用描述性说法（「精确版本支持矩阵」「『警告档』开关」），段尾指回现行机制章节。
- 语义统一：「组合退化成未安装本插件」旧表述与现门禁（apply 抛错拒绝启动）矛盾——全部文档已统一为「抛错拒绝启动 / 七行不启动 / 无警告档无降级路径」；unsupported 定义统一为「落在派生范围外（低于基线或跨 minor）或混装」。
- docs:check 边界：multi-root `check-docs.mjs`（10 项）只查配对存在/链接可解析等，不校验链接**文字**与目标标题匹配——文字失配须人工 grep 审计（本轮已全量：指向 unsupported-dsh-release.md 的引用 12 行全部新口径）。

### 组 4 — G-A 模板外迁（写面：`templates/**`、`tooling/template/**`(删)、`scripts/gen-plugin.mjs`、`scripts/check-architecture.mjs`、`pnpm-workspace.yaml` 注释、根 README/AGENTS 模板段、dotfiles 6 处）

| # | 任务 | 局部验证 |
| --- | --- | --- |
| 4.1 | `git mv tooling/template templates/default`（12 文件） | `git status --porcelain \| grep -c '^R'` → ≥11（README 改写后可能显示为 R+M）；`test ! -d tooling/template`；`git ls-tree HEAD --name-only tooling/template` 仅用于记录迁移前状态 |
| 4.2 | **新建** `templates/README.md`（约定）+ **新建** `templates/default/template.json` + 把原 README 改写为 `templates/default/README.md`（拆出约定段） | `node -e "JSON.parse(readFileSync('templates/default/template.json'))"` exit 0；`grep -c '"output"' templates/default/template.json` → 11 |
| 4.3 | `scripts/gen-plugin.mjs` 改造（③ 3.2 签名） | `pnpm gen:plugin --help` exit 0 且含 `--template`；`pnpm gen:plugin demo --kind host-only --dry-run` exit 0；`pnpm gen:plugin demo --kind host-only --template nope` exit 1 且 stderr 含 `可用` + `default` |
| 4.4 | `scripts/check-architecture.mjs`：AR7 FORBIDDEN 两条 + 三处文案；AR2 注释 | `node scripts/check-architecture.mjs` exit 0；红队：`pnpm-workspace.yaml` packages 临时加 `templates/default` → exit 1 且信息含 `AR7 packages 里出现 "templates/default"`；恢复 |
| 4.5 | `templates/default/plugin-README.md.tmpl:6` 自链接 | `grep -n "templates/default/README.md" templates/default/plugin-README.md.tmpl` → 1；`grep -n "tooling/template" templates/ -r` → 0 |
| 4.6 | `pnpm-workspace.yaml:3-6` 注释 + 根 `README.md`（`:15`/`:19`/`:44`）+ 根 `AGENTS.md`（`:15`/`:17`/`:43`） | `grep -rn "tooling/template" README.md AGENTS.md pnpm-workspace.yaml` → 0 |
| 4.7 | dotfiles 6 处（**单独 commit**，在本仓 GATE 之外） | `cd /home/xuqinqin/develop/dotfiles && grep -rn "tooling/template" agent/skills/dsh-plugin-writer/` → 0；`git status --porcelain` 仅 4 个 skill 文件（SKILL.md + 3 个 references） |

组 4 GATE：

```bash
node scripts/check-architecture.mjs
pnpm dsh:check
# 默认 / 显式等价（--dry-run 输出逐行相同）
pnpm gen:plugin demo-host --kind host-only --dry-run > /tmp/gen-default.txt
pnpm gen:plugin demo-host --kind host-only --template default --dry-run > /tmp/gen-explicit.txt
diff -u /tmp/gen-default.txt /tmp/gen-explicit.txt        # 空
# 双 kind 全链演练（R18① 快照法）：生成 → 根 install → lint/typecheck/build/test → dsh:check
pnpm gen:plugin demo-host --kind host-only && pnpm install --no-frozen-lockfile \
  && pnpm --filter dsh-plugin-demo-host lint \
  && pnpm --filter dsh-plugin-demo-host typecheck \
  && pnpm --filter dsh-plugin-demo-host build \
  && pnpm --filter dsh-plugin-demo-host test \
  && pnpm dsh:check
# 删除后快照复原：rm -rf plugins/demo-host && pnpm install --no-frozen-lockfile
#   → git status --porcelain 与生成前快照 diff 为空（host-only / dual 各一轮）
```

**组 4 终形态（执行期 2026-11-07 实测）**

- 全部 8 任务通过（4.7 两笔 dotfiles commit：`aca27aa` 6 处路径同步 + `df0630b` SKILL.md 2 行补 `--template` 与多模板约定引用——「文档不可超前于代码」先例：代码任务未落地时只做纯路径替换，完整形态待依赖落地后接续补笔）；组 GATE `pnpm dsh:check` exit 0；双 kind 全链演练回环干净（host-only 9 文件 / dual 11 文件：生成→install→lint/typecheck/build/test→dsh:check→删→install→快照 59 行逐行一致，dual 清理后 lockfile 与 host-only 清理后 **字节级 cmp 一致**，`node_modules` 零残留）。
- 实测事实：①`git mv` 需先 `mkdir templates`（git 2.39.5 不自动建目标父目录）；12 文件全部 100% 相似度 R、零内容改动。②AR7 的 `templates/*` 条目在原 Set 精确匹配实现下是死条目——新增 `findForbiddenPackage()` helper（尾缀 `/*` 前缀匹配、先排除 REQUIRED_PACKAGES 防 `tooling/*` 误伤）使红队信息 `AR7 packages 里出现 "templates/default"` 可达；AR1–AR6/AR2 逻辑零改动（裁定：D-6「只改禁止条目」的意图是 glob 语义生效，helper 是其必要最小实现）。③`--dry-run` 首行回显生成器自身 argv——「显式与默认 diff 为空」的验收口径 = 剥离回显行后清单段 diff 空 + md5 一致（既有行为不改）。④gen-plugin `loadTemplate()` 12 项 fail-closed（含 name==目录名、output 不重复、素材文件存在、路径穿越拒绝），退出码契约 0/1/2 与 templates/README.md 一致；`--template` 缺值在解析期 exit 2、未知值在 loadTemplate exit 1。⑤`templates/default/README.md` 从原 README 拆分改写后，全仓 `tooling/template` 字样零残留（scripts/templates/根文档/workspace 注释全量 grep 过）。⑥规划触达面 1.4 的「AR7 三处文案」实测为四处（`tooling/*` 条目的 reason 原文引用已失真，一并改口）。
- 被否/边界：gen-plugin 命令代码块（README:33/AGENTS:62）未补 `--template`（code-design 1.4 精确落点不含，约定段 :44/:43 已有完整说明，默认用法不受影响）。

### 组 5 — G-B 清理（写面：9 个 `*.tsbuildinfo`、`plugins/multi-root-workspace/scripts/upgrade-dsh.mjs`、ADR-0009 Status 追加的第二条 fork 注）

| # | 任务 | 局部验证 |
| --- | --- | --- |
| 5.1 | 删除 9 个 `*.tsbuildinfo`（按实测清单，不按条数） | `find . -name '*.tsbuildinfo' -not -path './node_modules/*' -print -quit \| wc -l` → 0；`git ls-files '*.tsbuildinfo' \| wc -l` → 0 |
| 5.2 | 删除 `plugins/multi-root-workspace/scripts/upgrade-dsh.mjs` | `test ! -e …/scripts/upgrade-dsh.mjs`；`ls plugins/multi-root-workspace/scripts \| wc -l` → 8 |
| 5.3 | ADR-0009 Status 追加 shim fork 注（append，追加在 3.1 的范围化注之后；`git diff -U0` 只增不删） | `grep -n "委托 shim 已删除" ADR-0009…md` → 1；`git diff -U0 -- ADR-0009…md \| grep '^-' \| grep -v '^---' \| wc -l` → 0 |
| 5.4 | 复跑构建，确认 tsbuildinfo 不复现 | `pnpm -r build && pnpm -r typecheck` 后 `find … -name '*.tsbuildinfo'` 仍 0（base tsconfig `noEmit`、无 incremental/composite） |

组 5 GATE：

```bash
find . -name '*.tsbuildinfo' -not -path './node_modules/*' | wc -l          # 0
git grep -n "multi-root-workspace/scripts/upgrade-dsh" -- . ':!openspec'    # 0
pnpm dsh:check
```

### 组 6 — 收口 GATE + 红队 + 演练（写面：不改源码；只跑命令与必要的 `/tmp` 快照）

| # | 任务 | 判定 |
| --- | --- | --- |
| 6.1 | 全仓七链 | `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test && pnpm docs:check && pnpm dsh:check` 全 exit 0 |
| 6.2 | multi-root 完整门禁（含新增 compat:check；`smoke` 需运行中的 dsh） | `pnpm --filter dsh-plugin-multi-root-workspace verify:all` exit 0；`kernel:probe` 在无方言环境按既有 skip 语义输出原因（不算失败） |
| 6.3 | gen:plugin 双 kind 演练 + 三个负例 | 组 4 GATE 的快照法两轮（host-only / dual）；负例：`--template nope` exit 1、临时移走 `templates/default/template.json` → exit 1（恢复）、临时移走 `templates/default/build.mjs` → exit 1 且打印相对路径（恢复） |
| 6.4 | dsh-baseline 红队 | 把 multi-root 任一 DSH devDep 写成字面量 `0.2.2-rc.1` → `pnpm dsh:check` exit 1（`expected "catalog:dsh"`）；把 `engines.dsh` 改成 `>=0.2.2-rc.1 <0.4.0` → `pnpm dsh:check` exit 1（`expected ">=0.2.2-rc.1 <0.3.0"`）；恢复后 exit 0 |
| 6.5 | 运行时门红队 | `sed` 把 `DSH_BASELINE` 改 `0.2.1-rc.5` → `compat:check` exit 1 + `pnpm --filter … test` 失败；恢复后两者 green |
| 6.6 | 结构门禁红队 | `pnpm-workspace.yaml` 临时加 `templates/*` → `node scripts/check-architecture.mjs` exit 1 且点名 `AR7 packages 里出现`；恢复 |
| 6.7 | 产物与提交面复核 | `pnpm --filter dsh-plugin-multi-root-workspace build`；`git status --porcelain` 逐条归类（src/tests/docs/templates/lib/lockfile，无意外文件）；`node scripts/check-artifacts.mjs` exit 0（B1–B5） |
| 6.8 | 规范收口 | `openspec validate unify-deps-and-templates --strict` exit 0；`openspec doctor` 无 error（若有既有 warning 需记录「与本次无关」） |

**组 6 终形态（执行期 2026-11-07 实测）**

- 全部 8 任务通过；43/43 全勾。七链全绿（frozen install 未触 lockfile、2806 passed / 4 既有 skip、唯一 lint warning 为 web-ux 基线既有非修改集）；verify:all 七环节全绿（smoke 46+99+60 checks）；红队二连/负例三连/双复核全过（R2 配方、cp 字节级恢复、工作区 60 行零漂移）；check-artifacts 7 包 B1–B5 全绿；strict valid + doctor 零 error 零 warning。
- 事实更正（留收口裁定，未改文案）：multi-root **包内 smoke** 不依赖运行中 dsh 容器——`scripts/lib/dsh-runtime.mjs` 从本仓 devDependency 解析 dsh 二进制以子进程驱动 + 隔离 scratch `$DSH_HOME`；根 README/AGENTS「multi-root 的 smoke 需运行中的 dsh」一行是基线既有口径且现已失真（该描述原指安装冒烟 `docker exec dsh plugin add`，两者是不同环节），是否顺带改口由用户裁定。
- B6 词集差异 = 预期（design 执行约束预声明）：multi-root host.words 仅 chunk 名 1 词（`compat-lYI8x_n7` → `compat-BoLaK7du`）；未重冻 `/tmp/arch-baseline`。
- `openspec validate --all --strict` 退出码 1 = 既有基线问题（dsh-project-mcp / dsh-session-tool-toggle 两 requirement 文本 >500 字符，两文件本次零改动），与本变更无关，未纳入清理。
- 提交面终态：47 unstaged 文件（1412+/1096−）+ 12 staged R100 改名 + 3 未跟踪新件（lib 新 chunk 362 行 / templates/README.md 106 行 / template.json 17 行）；密钥/日志/临时文件扫描零命中；specs/ 与 archive/ 0 改动。**提交纪律：根仓单 commit 须精确 add 全部产物（含 3 个 ?? 与 2 个 D），不得 `git add -A`；dotfiles 已单独两笔（aca27aa / df0630b）。**

**组 5 终形态（执行期 2026-11-07 实测，R5 见 tasks.md 附录）**

- 全部 5 任务通过；组收口 grep 0 命中 + `pnpm dsh:check` exit 0；工作区 60 行全归类（3 ?? = lib 新 chunk 与 templates 两新文件的待提交产物、2 D = lib 旧 chunk 与 shim、43 M+10 R+2 RM 前序任务）。
- 实测事实：①tsbuildinfo 9 个全为 gitignore 忽略项，删除后 build/typecheck 复跑不复现（node_modules 内 10 个属第三方 npm 包自带，非本次产物）；②shim 删除无活引用（package.json 未挂入口；插件 docs 的 `upgrade-dsh.mjs` 字样均为叙述性非活引用，5.5 的带前缀 grep 面外）；③5.3「只增不删」验证句因 3.6 扩面对 ADR-0009:299 链接文字的成对改写而字面不可满足——快照法证明本次纯追加，R5 落痕（后触达 append-only 任务须主动检查前序成对改写；3.1 当时侥幸通过因该行尚未被改）。

组 6 收口命令（一次跑完）：

```bash
pnpm install --frozen-lockfile
pnpm -r lint && pnpm -r typecheck && pnpm -r build && pnpm -r test
pnpm docs:check && pnpm dsh:check
pnpm --filter dsh-plugin-multi-root-workspace verify:all       # 需运行中的 dsh
node scripts/check-artifacts.mjs
openspec validate unify-deps-and-templates --strict
```

---

## ⑥ 设计假设与未决项

| # | 假设 / 未决项 | 依据 | 若不成立 |
| --- | --- | --- | --- |
| A-1 | `pnpm-lock.yaml` 的 diff 只有 importer 的 `specifier:` 行（版本集合不变） | 22 个 catalog 键对应的包已在 lockfile `packages:` 中，值与基线一致 | 出现 `version:` 行变化时先查 catalog 值是否写错；写成任务 1.5 的断言 |
| A-2 | `dsh.engines.dsh` 对 multi-root 的 cordis.patch.yml 装载无副作用 | 六软插件同字段既有形态（explore A-2） | `dsh --dump-config`/装载冒烟红 → 回退该字段并上浮 |
| A-3 | 运行时范围谓词比安装期 peer 门禁在上界更严（`0.3.0-alpha.1` 运行时拒绝；`includePrerelease` 的 semver 认为它 < `0.3.0`） | `.agent/note/dsh-compat-contract.md:97`（安装期 `semver.satisfies(..., {includePrerelease:true})`）与 ③ 3.1 规则 5 | 属预期差异（运行期 fail-closed），不修；写进 ADR 修订节 |
| A-4 | `template.json` 四键可完整表达现 11 条 FILE_TABLE（无隐藏行为） | `scripts/gen-plugin.mjs:71-83` 只有 `format`/`only` 两类特判 | 演练（组 6.3）出现文件差异 → 扩 schema 前先上浮 |
| A-5 | 传递等价足以守住「基线唯一来源」，不需在根检查新增「运行时字面量 == 根基线」断言 | 根 `dsh:check` 断言 engines == 根基线派生范围；`compat:check` / `compat.spec` 断言 peers == engines == src 派生范围 | 若未来放宽 engines 断言，本假设失效，必须补一条直接断言（`src` 字面量 == `scripts/dsh-baseline.mjs`） |
| A-6 | 22 个 catalog 新条目全部已在 `minimumReleaseAgeExclude`，豁免无需改 | `pnpm-workspace.yaml:80+` 逐项核对 | 缺项时 `pnpm install` 报 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` → 补该行（不扩范围） |
| A-7 | `templates/` 不参与发布与产物门禁 | `scripts/release.mjs` 只遍历 `plugins/*`；`check-artifacts.mjs` 只扫 `plugins/*` | 若 `dsh:check` 因模板目录报红 → 说明 AR7 文本未同步（组 4.4） |
| A-8 | 双语同步是强制的（README + `.agent/note`） | `plugins/multi-root-workspace/scripts/check-docs.mjs:71-118`（README pairs / Agent note pairs） | `pnpm docs:check` 红 |
| A-9 | 现有 capability 的 spec `## Purpose` 不能经 delta 更新 | OpenSpec 1.16 `specs-apply` 对既有 spec 的 delta Purpose 只 warn 并忽略 | 归档 sync 时人工改 Purpose 的「精确支持矩阵」措辞；本次不阻塞 |
| A-10 | dotfiles 的 6 处仅路径文本，无脚本/配置耦合 | 6 处均为 markdown 行（SKILL.md 3 + references 3） | 若 grep 出第 7 处 → 归入同 commit 并上浮 |
| A-11 | `@deepseek-ai/dsh` peer 在 profile 安装期可满足 | 安装期门禁比较 **runtime 版本**（note:97），不是解析 peer 包 | 若真实安装报 unmet peer → 回退该 peer 并同步放宽根断言（与 D-3 冲突，须用户裁定） |
| A-12 | 删除 tsbuildinfo 后不会被 `pnpm build` 重建 | `tsconfig.plugin.base.json` 无 `incremental`/`composite` 且 `noEmit: true`；9 个文件是早期 `tsc -b` 残留 | 若复现 → 在组 5.4 记录并改为「每次构建后清理」脚本（不属本次范围） |
| A-13 | `check-dsh-compat.mjs` 不再重算范围谓词是安全的 | 运行时 + `compat.spec.ts` 覆盖范围三态；根 `dsh:check` 覆盖安装树 == 基线 | 若要求脚本独立复现 boot 拒绝 → 需在脚本内复制比较器（与 D-8 被否理由冲突，上浮） |

---

## 待决问题（六字段之外）

### Q1 是否补 `@deepseek-ai/dsh` peer（23 条 vs 21 条）

- **问题**：材料写「23 条 DSH peers」，代码实测 21 条 DSH + cordis。为满足 D3 的「23」与根检查既有的 umbrella 断言，设计选择补 1 条 `@deepseek-ai/dsh` peer（④ D-3）。这属于**材料未逐字要求**的 manifest 变更。
- **选项**：A. 补（本设计默认，22 DSH + cordis = 23 条 `@deepseek-ai/*` peer）；B. 不补，放宽 `check-dsh-baseline` 的 umbrella 断言；C. 不补，另写「只对声明了该 peer 的包校验」。
- **推荐**：**A**。理由：与六软插件同构、保住既有形态断言、数字与材料吻合。
- **影响面**：multi-root 安装期多一条必选 peer（安装期门禁按 runtime 版本比较，风险低）；若不补则根门禁出现「为 multi-root 单开豁免」的倒退，与「统一管理」目标相反。

### Q2 `*.tsbuildinfo` 按 8 个还是 9 个删

- **问题**：材料说 8 个，实测 9 个（多出 `plugins/workspace-config/lib/tsconfig.client.tsbuildinfo`）。
- **选项**：A. 按实测 9 个删（`find` 全清）；B. 只删材料列的 8 个。
- **推荐**：**A**，并让验证句写成「零命中」而不是「删了 N 个」。
- **影响面**：无（全部 ignored、零 tracked、删后不复现）。

### Q3 D3 清单遗漏「升级脚本候选树推导」的 `MUST NOT` 子句

- **问题**：主 spec 该 requirement 现含「脚本 MUST NOT 改动 multi-root 的 allowlist 与 peer 枚举」。本变更删掉了「不碰 multi-root」分支（G-C 明文要求），该子句与新行为直接冲突；D3 的四项未覆盖它。
- **选项**：A. 追加一段 MODIFIED（删该子句，改为「运行时基线副本 SHALL 同批重指」），保留原三个 scenario 名；B. 不追加，留给归档 sync 时改主 spec；C. 保留子句但改成「MUST NOT 改动基线之外的声明」。
- **推荐**：**A**（③ 3.7 已按 A 画好骨架）。理由：不改则 delta 落档后主 spec 与新代码矛盾，且 `openspec validate --strict` 不会替我们发现这种语义冲突。
- **影响面**：spec delta 多一节（约 20 行）+ 归档 sync 面 +1；不改则出现「规范说不能、脚本照做」的规范债。

### Q4 `compat:check` 是否要进 CI 七步链

- **问题**：根 `dsh:check` 不再调用它之后，CI 只剩 `pnpm test` 间接覆盖同构断言。
- **选项**：A. 不进 CI，仅进 `verify:all`（本设计默认，④ D-8）；B. CI 加一步 `pnpm --filter dsh-plugin-multi-root-workspace compat:check`；C. 根 `dsh:check` 保留通用循环调用。
- **推荐**：**A**。理由：七步链保持「根命令即全量」形态；`compat.spec.ts` 在 `pnpm test` 里直接 import 模块断言 peers/engines/范围，比文本解析更强。
- **影响面**：选 B 则 `.github/workflows/ci.yml` 与头注释/README 的「七步链」表述同步改；选 C 则与用户「删除该检查段」的裁定冲突。

## 附：阶段 1.75 界面演示（判定与确认）

1.75 未触发：本变更为纯后端/CLI/配置/脚本改动（catalogs 依赖统一、compat 运行时门、模板目录外迁、冗余清理），无任何页面/组件/视觉/交互产出，命中排除表第一行（C1 不成立）。
