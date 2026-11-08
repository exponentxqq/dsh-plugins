# 文档统一与最优架构收尾评估

| 项 | 值 |
| --- | --- |
| 档案类型 | **评估档案（非 ADR）**：只陈述现状、不施工依据与通过标准，不做决策、不约束实现 |
| 状态 | 现行（2026-11-07）；三项不施工见 §不施工项，其余差异由 `docs-arch-refinement` 施工 |
| 落档 | 2026-11-07（`docs-arch-refinement` 变更 1.1） |
| 事实时点 | 2026-11-07；行数、计数与豁免条数均为当日现读实测（复现命令见附录 A） |
| 事实基线 | 工作树（`HEAD 162e48f`） |
| 相关文档 | [multi-root 构建统一化评估](./multi-root-build-unification.md)（同目录先例）、[仓级 ADR 索引](../decisions/README.md)、变更蓝图 [`code-design.md`](../../openspec/changes/docs-arch-refinement/code-design.md)、[`diff-matrix.md`](../../openspec/changes/docs-arch-refinement/diff-matrix.md)、[`tasks.md`](../../openspec/changes/docs-arch-refinement/tasks.md) |

本档案回答三件事：文档面现在差在哪（§现状差异清单）、哪些方向本轮明确不做或已废（§不施工项）、做到什么程度算收口（§通过标准）。它不复制 proposal 的需求论证，也不重复 diff-matrix 的取舍过程；每条只记「事实 → 处置」。P1–P6 为规划期问题编号，本档案按编号对账、只记落点。

范围：仓内文档体系（根 README / `AGENTS.md`、`docs/`、七个插件 README 与各包 `docs/`、`templates/`）与文档门禁。不覆盖插件运行时、构建产物与 `openspec/changes/archive/` 内容（只读）。

## 现状差异清单

三种体制并存是根因；13 处断链与证据三形态是它的两个可计数后果。以下事实均为 2026-11-07 现读，不沿用规划文档里的约数。

### 三种体制并存

| 文档域 | 现状（实测） | 机械门禁 | 本轮处置 |
| --- | --- | --- | --- |
| `plugins/multi-root-workspace/`（fork） | 双语：10 份 `.en.md`（781 行）+ `docs/` 五分类（含 6 份 README）+ 13 篇插件级 ADR + `.agent/` 知识库；README 239 行 11 个 H2，节名自持（项目简介 / 安装 / 许可证） | 自带 `plugins/multi-root-workspace/scripts/check-docs.mjs`（318 行、10 项；2026-11-07 实跑 0 errors 0 warnings），经其 `docs:check` 挂入 CI | 单语化（删 10 份 `.en.md`、3 项双语检查退役）+ README 骨架对齐 + check-docs 薄化为共享内核消费方（D-2 / D-6 / D-13） |
| 六个软插件 | 各一份中文 README，155–443 行、9–15 个 H2，节集合与命名不统一（仅 workspace-config 有 `## 定位`，仅 session-tool-toggle 有 `## 构建与测试`）；zcode-plan 另有 `docs/` 3 篇；web-ux / workspace-config 有 `artifacts/` | 无——六包均无 `docs:check` 脚本 | 七包统一软骨架（4 必备 + 5 如适用）+ 证据归位 + 仓级门禁覆盖（D-3 / D-4 / D-5 / D-6） |
| 仓级文档面 | 无 `docs/README.md` 索引页、无文档体系 ADR（[ADR-0003](../decisions/ADR-0003-doc-system-layers-and-gates.md) 缺位）；`docs/` 只有 assessments / decisions 两个子目录；`tooling/` 四包中 contracts 无 README | 无仓级门禁——根 `docs:check` = `pnpm -r run docs:check`，只触达 multi-root（CI 第 6 步同） | [ADR-0003](../decisions/ADR-0003-doc-system-layers-and-gates.md) + `docs/README.md` 索引 + toolchain spec requirement + 根 `scripts/check-docs.mjs`（D-3 / D-6） |

三种体制的共性不是「文风不同」，而是**同一事实存在多处副本且无单一出处**：版本声明、验证证据、门禁口径、ADR 引用各按所在域的旧习惯书写，跨域迁移（归档 / 重命名 / 收归根）时没有任何机械信号。

### P1–P6：事实 → 处置

| 编号 | 实测事实 | 处置（D 编号 → 本轮落点） |
| --- | --- | --- |
| P1 | 同类证据三种存放形态并存：README 内嵌 2 处、`artifacts/` 2 包、插件 `docs/` 2 篇（明细见 §证据三形态） | D-5 两级制 → G6 证据归位 + G7 `evidence-location` |
| P2 | 七包 README 9–15 个 H2、155–443 行，节名各写各的；web-ux 443 行把能力全量参考塞进入口文档 | D-4 软骨架 + D-8 不拆去重（硬触发入规范）→ G5 + G2 |
| P3 | `templates/default/plugin-README.md.tmpl` 仅 3 个 H2（外加 H1 标题），与存量脱节，`gen:plugin` 的「开箱合规」承诺在文档面不成立 | D-10 模板骨架全集 → G5（5.6）+ G7（scaffold 补 `docs:check` 步） |
| P4 | 文档面无机械门禁：根 `docs:check` 只递归 multi-root，六软插件零校验；multi-root 独自维护 318 行 / 10 项实现 | D-6 共享内核 + 双薄入口 + 5 类负测试 → G3 + G7；不并入 `dsh:check`（D-14） |
| P5 | 双语边界不清：multi-root 10 份 `.en.md`（781 行）+ 3 项双语检查；其余全单语，新文档该不该出英文版无规范可循 | D-2 全仓中文唯一 → G4（删 10 份 / 三项退役 / [ADR-0014](../../plugins/multi-root-workspace/docs/decisions/ADR-0014-fork-divergence-and-single-language.md)） |
| P6 | 口径多副本先例：smoke 口径曾有 4 处副本（`residual-convergence` 1.4 已同批修正）；`docs:check` 口径现有 3 处副本（`AGENTS.md:66`、`README.md:40`、`ci.yml:15-17` 注释） | D-3 索引只链接不复制（N2）+ D-6 机械查 → G2 / G5 / G9 |

### 13 处断链

规划期全仓只读链接扫描记 13 处；2026-11-07 按同一口径复核，13 处与台账逐条吻合（仓级 docs 8 / 插件区 1 / 归档 4），multi-root 子树 0 处——其门禁生效的直接对照。

| 分类 | 数量 | 命中（现读） | 处置 |
| --- | --- | --- | --- |
| 仓级 docs（现门禁盲区） | 8 | [`ADR-0001`](../decisions/ADR-0001-shared-build-and-source-kits.md)`:161`（1）；[`ADR-0002`](../decisions/ADR-0002-attribution-kernel.md)`:83`、`:84`、`:123`×2、`:124`×2、`:125`（7）；前 7 处指向 `openspec/changes/optimize-architecture/…`（已归档），`:125` 指向已改名的测试文件 | G8 改指 `archive/2026-11-07-optimize-architecture/…`；`:125` 同时改现存测试文件名 `attribution-anomaly.test.ts`（D-9） |
| 插件区 | 1 | `plugins/project-mcp/README.md` 现读 `:145`（规划台账记 `:132`）→ `openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md` | G8 改指归档路径（D-9） |
| 归档区 | 4 | `archive/2026-11-07-unify-deps-and-templates/`：`code-design.md:81`×2、`:128`、`tasks.md:52` | 不修；D-7 降为 warning，exit 0 |
| 合计 | 13 | 其中 8 处落在现门禁完全不扫的仓级 docs 面 | 9 修 + 4 warning |

断链成因两类：变更归档后旧路径失效（仓级 7 + 归档 4）与源码文件重命名（[`ADR-0002`](../decisions/ADR-0002-attribution-kernel.md)`:125`）。两者都指向同一条纪律：移动文档或重命名源码的批次必须同批跑全仓链接检查——这正是 G7 仓级门禁要补的盲区。

### 证据三形态

插件侧同类验证证据有三种存放形态；另加 `openspec` 归档的变更时点证据（第四处，属只读域）。规划台账记 project-mcp 52 行 / user-commands 57 行，现读为 53 行 / 39 行（含 H3 子节）——计数本身也会漂移，这是需要位置门禁而非人工盘点的直接证据。

| 形态 | 现存实例（现读） | 问题 | 处置（D-5） |
| --- | --- | --- | --- |
| README 内嵌 | project-mcp `:108`「隔离冒烟记录（验证证据）」（53 行）；user-commands `:149`「真机验证（验证证据）」（39 行，含 H3 线上宿主确认） | 入口文档被证据撑爆；证据随 README 编辑漂移 | 迁各包 `artifacts/`；README 各留 1 行证据行 + 结论 |
| `artifacts/` | `plugins/web-ux/artifacts/`、`plugins/workspace-config/artifacts/` | 已有正位，但只覆盖 2/7 包 | 扩到 project-mcp / user-commands / zcode-plan 三包 |
| 插件 `docs/` | `plugins/zcode-plan/docs/acceptance.md`、`discount-verify.md` | 验收读数与参考层混放 | 迁 `artifacts/`；`migration-from-zai-coding-zcode.md` 留 `docs/` 并内容级复核（D-11） |
| `openspec` 归档 `artifacts/` | `openspec/changes/archive/*/artifacts/` | 变更时点冻结证据 | 不动（D-7 / D-13） |

### D-1~D-14 落点索引

逐条落点（取舍过程见 [`diff-matrix.md`](../../openspec/changes/docs-arch-refinement/diff-matrix.md) §5，实现细节见 [`code-design.md`](../../openspec/changes/docs-arch-refinement/code-design.md) ④）。

| 决策 | 本轮落点 |
| --- | --- |
| D-1 编排 / 变更 | 单变更全量、组间串行：`tasks.md` 9 组 + `design.md` 触达面表 |
| D-2 语言 | 全仓中文唯一 + multi-root 单语化 → G4；本档案 §不施工项「双语推广已废」 |
| D-3 载体 | [ADR-0003](../decisions/ADR-0003-doc-system-layers-and-gates.md) + `docs/README.md` 索引 + toolchain spec requirement → G2 + G7 |
| D-4 骨架 | 软骨架 4 必备 + 5 如适用、不查节序 → G2（规范）/ G5（存量 + 模板）/ G7（`readme-skeleton`） |
| D-5 证据 | 两级制 + 一行证据行文法 → G6 + G7（`evidence-location`） |
| D-6 门禁实现 | 共享内核 + 双薄入口 + 5 类负测试；挂点 `node scripts/check-docs.mjs && pnpm -r run docs:check` → G3 + G7 + `ci.yml` |
| D-7 归档 | 只读；仅链接检查在归档域降 warning → G3 内核 `linkWarningPaths` + G8 验收 |
| D-8 web-ux | 不拆、三处去重、硬触发条件入规范 → G5（5.3） |
| D-9 断链清偿 | 13 处（8 + 1 + 4）：非归档修复、归档 warning → G8；本档案 §13 处断链 |
| D-10 模板 | 模板骨架全集 + scaffold CI 补 `docs:check` 步 → G5（5.6）+ G7（7.2） |
| D-11 zcode-plan | 迁移指南真机重放 + 证据归位 → G6（6.3 / 6.4） |
| D-12 豁免清单 | 不施工；现状盘点落本档案 → §附录 A |
| D-13 边界 | multi-root 其余面不动 / openspec 工件面归规划流程 / tooling 三包自洽不改造 → 本档案 §不施工项 + `design.md` Non-Goals |
| D-14 回归底线 | 零插件运行时行为与产物字节变化 → G9 全链 + 本档案 §通过标准 第 4 条 |

## 不施工项

以下三项在规划阶段被提为候选，本轮结论分别是「已废」「不施工」「另案」；各带一句依据，均不代表对其它方案的整体否决。

| 项 | 结论 | 一句依据 | 归属 |
| --- | --- | --- | --- |
| 双语推广（给六软插件与根 README 补 `.en.md` 的路线） | **已废，不再作为候选** | 用户轮 2/3 裁定「彻底单语化 + 废弃 fork 上游同步」：全仓中文唯一，multi-root 现有 10 份 `.en.md`（781 行）本轮删除、3 项双语检查退役（D-2） | 不落另案；处置记 multi-root 插件级 [ADR-0014](../../plugins/multi-root-workspace/docs/decisions/ADR-0014-fork-divergence-and-single-language.md) |
| multi-root 文档体系收敛（把其 `docs/` 五分类、`.agent/`、13 篇插件级 ADR 并入仓级体系） | **不施工** | 其插件级 ADR 是独立编号体系（现有 13 篇 [ADR-0001](../../plugins/multi-root-workspace/docs/decisions/ADR-0001-provider-replacement-scope.md)~0013，G4 新增 [ADR-0014](../../plugins/multi-root-workspace/docs/decisions/ADR-0014-fork-divergence-and-single-language.md)），并入仓级会制造两套编号互撞与归属迁移成本；本轮只抽「引用接口 + 共享检查内核」，其余面按 D-13 / C5 保留 | 维持现状；无另案 |
| 豁免清单生成化（`minimumReleaseAgeExclude` 与 `--dump-config-schema` 4 条等豁免的机械生成 / 校验） | **不施工，另案** | 现有 `pnpm dsh:upgrade` 已做文本级重指、`pnpm dsh:check` 已对 lockfile 做 fail-closed 对账；生成化只剩「从 lockfile 派生完整清单」一步，却要改两脚本行为 + 生成器 + 负测试，且与文档主线零依赖（D-12 / O8） | 另案；盘点见附录 A |

「不施工」不是永久结论：任一项若重启，应按仓级 ADR 纪律另立变更或 ADR，并回链本档案；本档案只保留现状与当轮依据，不随重开改写。

## 通过标准

本节是 `docs-arch-refinement` 收口（G7–G9）的验收面，**不是现状快照**：落档时 G3–G9 尚未施工，下列门槛多数未满足。全部满足才算文档面收口；任一失败按未完成处理，不以「部分达标」收口。

### 1. 门禁：非归档区 0 error

- `node scripts/check-docs.mjs` exit 0，输出 `0 errors, 4 warnings.`——4 条 warning 全部是 D-7 允许的归档域断链，非归档区 error 必须为 0。
- `pnpm docs:check` exit 0（根入口 + 递归双入口，CI 步骤名不变）。
- `node plugins/multi-root-workspace/scripts/check-docs.mjs` exit 0，输出 7 项 `[PASS]`（10 项减 3 项双语退役）与 `0 errors, 0 warnings.`。
- 负测试：`node scripts/lib/doc-checks.selftest.mjs` exit 0，5 类缺陷样本逐项 FAIL；人为删一条规则后自检必须转红（规则回退验证），恢复后 exit 0。

### 2. 骨架：七包 + 模板门禁绿

- `readme-skeleton` 对七个插件 README 全 PASS：4 必备节（定位含端性声明 / 安装到 profile / 构建与测试 / 许可）+ 已声明的如适用节非空。
- `pnpm gen:plugin` 临时生成 host-only 与 dual 两个包，生成物直接过 `node scripts/check-docs.mjs`（开箱合规）；删除生成物后工作树干净。
- multi-root README 节名归一后，`grep -n "](#安装)\|](#项目简介)\|](#许可证)" plugins/multi-root-workspace/README.md` 无命中（同文档锚点跟随）。

### 3. 证据与引用

- `evidence-location` PASS：`grep -rn '^## .*（验证证据）' plugins/*/README.md | wc -l` = 0；project-mcp / user-commands / zcode-plan 三个 `artifacts/` 就位，各 README 留 1 行证据行 + 结论。
- 13 处断链：仓级 8 + 插件区 1 修复，归档 4 保留 warning；`node scripts/check-docs.mjs | grep -c "Broken link"` = 4。
- 裸 ADR 编号 6 处真实修复生效；叙述型绝对路径 2 处改 `<本仓>`；2 处只读 spec 示例进豁免清单。
- 单语化：`find plugins/multi-root-workspace -name '*.en.md' | wc -l` = 0；错误英文后缀 0；双语 3 项检查退役后不再出现在输出。

### 4. 零回归与全链

- `git diff --stat -- 'plugins/*/src' 'plugins/*/lib'` 输出为空（D-14）。
- `pnpm dsh:check` exit 0（AR1–AR8 与 B1–B5 面零变化）。
- `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm docs:check && pnpm spec:check && pnpm dsh:check` 全 0（G9 全链终检）。

## 结论

- **本档案不裁定方案**：它只记录现状、不施工依据与验收面；文档体系的决策本体落 [ADR-0003](../decisions/ADR-0003-doc-system-layers-and-gates.md)（G2）与 toolchain spec requirement（G7），施工落 `tasks.md` 组 2–9。本档案与 ADR / spec 冲突时，以 ADR / spec 为准。
- **差异定性**：文档面是「复制-漂移」收敛主线的最后一个未收敛区；三种体制并存使同一事实多副本，13 处断链与证据三形态是可计数后果，不是风格问题。
- **不施工三项**：双语推广已废（D-2）；multi-root 文档体系收敛不施工（D-13 / C5）；豁免清单生成化另案（D-12）。三项均不阻塞本轮其余差异的施工。
- **与既有档案的关系**：multi-root 构建统一化已由 [multi-root 构建统一化评估](./multi-root-build-unification.md) 裁定「暂不施工」；本档案只处理文档面，不推翻其结论。
- **收口判据**：§通过标准 全绿才算文档面收口；任何一项失败不按「部分达标」收口。
- **档案维护**：文档结构、门禁、豁免清单或基线变化时同批更新本档案；计数一律以命令实测重取，不抄约数（本次已把「300+」核为 333 条、把规划台账的证据节行数 52 / 57 核为 53 / 39）。豁免盘点的全部实测数据与复现命令见附录 A。

### 附录 A：豁免清单盘点（D-12）

本附录只收录豁免与既有放行的现状与性质，不提出生成方案，也不构成本档案的结论。计数均为 2026-11-07 现读实测。

#### A.1 `minimumReleaseAgeExclude`：333 条（为何另案）

- **现状**：`pnpm-workspace.yaml:103` 起共 **333 条**（复现：`awk '/^minimumReleaseAgeExclude:/{f=1;next} f&&/^[^[:space:]#]/{f=0} f&&/^[[:space:]]*-/{c++} END{print c}' pnpm-workspace.yaml`）。全部为 `@deepseek-ai/*`，版本分布：`0.2.2-rc.1` 325 条（DSH 基线族）+ `libreoffice-kit*@0.1.5` 6 条 + `@deepseek-ai/cordis@4.1.0` 1 条 + `@deepseek-ai/schemastery@3.19.0` 1 条。该块与 `allowBuilds` 原样上移自 multi-root（`pnpm-workspace.yaml:2-4` 注释）。
- **现有机械保障**：`scripts/upgrade-dsh.mjs:328` 的 `repointWorkspace()` 在升级时文本级重指 DSH 族条目与 cordis / schemastery；`scripts/check-dsh-baseline.mjs:383-394` 以锁文件为准做双向对账——missing、stale、重复条目三者都 fail。也就是说「条数与内容正确」已有 fail-closed 门禁，缺的只是「从锁文件派生整份清单」的生成动作。
- **为何另案**：生成化要把 `upgrade-dsh` / `release` 两脚本的行为、生成器与负测试一并改造；且升级链路本就以 `--config.minimumReleaseAge=0` 安装候选版本、再用 `dsh:check` 事后对账（`scripts/upgrade-dsh.mjs:311` 注释），生成器无法省掉这一步。它与文档面零依赖，收益只是省一次人工维护，面大而收益低（`optimize-architecture` 归档 diff-matrix O8 原话：upgrade-dsh 内部优化、低风险低收益）。
- **旁注（口径漂移实例）**：块头注释引用的 `docs/decisions/ADR-0002-upstream-coupling-policy.md` 按仓根解析不存在——该 ADR 实际在 `plugins/multi-root-workspace/docs/decisions/`，是整块上移时未改址的遗留。它不是 Markdown 链接，本轮文档门禁查不到；本档案只记录，不施工。

#### A.2 `--dump-config-schema` 的 4 条 unrecognized：口径豁免，只收录

- **现状**：dsh 0.2.2-rc.1 下 `--dump-config-schema` 全局 exit 1；官方 `dsh-agent-preset` 的自定义载体（`EntryGroup.key` 标记类）触发 4 条 `unrecognized Loader tree carrier`，全新空 `DSH_HOME` 同样红（`AGENTS.md:88-90`）。
- **口径**：装载门禁只认 `--dump-config` exit 0；schema dump 只用于核对本插件条目，不追全局 exit 0。
- **收录理由**：它是上游行为 + 官方预设的既有豁免，本仓不可控；本轮只把口径收进评估档案，不做生成化、不在文档门禁里断言这 4 条。另记：同一口径已在 6 处成文（`AGENTS.md`、根 `README.md`、project-mcp / session-tool-toggle / user-commands / workspace-config 的 README），是 P6「口径多副本」的现存样本；后续若收敛，应改为单一出处 + 链接。

#### A.3 `ABSOLUTE_PATH_ALLOWLIST`：当前为空

- **现状（实测）**：`scripts/lib/doc-checks.mjs` 尚未落地（G3）；清单本体在 `plugins/multi-root-workspace/scripts/check-docs.mjs:35`，值为 `[]`；`:181` 以「相对路径子串匹配」消费它。**当前为零放行**。
- **G3 后**：迁移为内核配置 `exemptions.absolutePaths`，multi-root 与仓级两个薄入口各自传值。

```
- **G8 待登记**：`openspec/specs/dsh-multi-root-file-references/spec.md:30`、`:44` 两处只读 Scenario 的示例绝对路径（`/home/x/dev/docker`、`/home/xuqinqin/develop/docker`）按「不改 spec、只登记豁免」处理（D-13）。
```

- **性质**：豁免是 fail-closed 的显式白名单（子串命中才跳过），不是关闭检查；空清单意味着当前没有放行项，而不是检查失效。

#### A.4 `AR5` 的 workspace-config 六键放行

- **现状**：`scripts/check-architecture.mjs:485-493` 定义 `WSC_CLIENT_COMPILER_OPTIONS`，仅对 `workspace-config/tsconfig.client.json` 放行 `compilerOptions` 六键：`declaration` / `emitDeclarationOnly` / `noEmit` / `rootDir` / `outDir` / `rewriteRelativeImportExtensions`；其余软插件 tsconfig 仍只允许 `extends` + `include`（`:470-484`）。
- **依据**：该文件是本批唯一放行 `compilerOptions` 的 tsconfig（`build:types` 需要 declaration emit；执行期 R10 裁定①；`:1056` 的 note 逐次打印该放行）。
- **性质**：与 A.1–A.3 同属「单点白名单 + 机械断言」的既有做法；本档案只盘点，不改 AR5。

#### A.5 盘点结论

四项豁免都不是「检查失灵」：A.1 / A.2 / A.3 各有明确 owner 与触发条件（版本升级 / 上游预设 / 只读 spec），A.4 是编译面唯一的既有白名单，绝对路径清单当前为空且机制已就绪；本轮不动它们，只把现状与依据留在本档案。
