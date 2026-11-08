# Proposal

## Why

11-07 三变更（optimize-architecture / residual-convergence / unify-deps-and-templates）后，构建、类型、测试、依赖、脚手架五面均已「单一事实源 + 薄引用 + 机械化门禁」，唯独**文档工程面是「复制-漂移」收敛主线的最后一个未收敛区**：三种文档体制并存（multi-root 双语 fork 体系 / 六软插件单语无门禁 / 仓级无索引无规范）、全仓 243 份 Markdown 实测 13 处断链（8 处在现有门禁盲区）、验证证据三种存放位置并存、`docs:check` 实际只触达 multi-root。本轮把文档面补进既有收敛体系，同时按用户裁定完成 multi-root 去特殊化（单语化 + 废弃 fork 上游同步 + 完全移除上游相关描述）。

## What Changes

- **文档规范落位（混合载体）**：新建 `docs/decisions/ADR-0003-doc-system-layers-and-gates.md`（分层 ownership / README 软骨架 4+5 节 / 证据两级制 / 引用纪律）+ `docs/README.md` 仓级索引页（只链接不复制）；门禁机器行为进 `dsh-plugin-toolchain` spec 新 requirement；`AGENTS.md` 只加链接（≤4 行 diff）。
- **全仓中文唯一 + multi-root 去特殊化（BREAKING：multi-root 双语体系废弃）**：删 10 份 `.en.md`（781 行）、multi-root 三项双语检查退役、其 documentation SKILL.md 双语规则删除、**所有上游相关描述完全移除（一句不留，来历考古靠 git 历史）**、废弃 fork 上游同步（决策记其插件级 ADR-0014，只写处置不写来历）、**README 骨架七包全部统一**（无任何插件搞特殊：multi-root 同样按软骨架对齐节名与端性声明）。
- **README 软骨架统一（七个插件）**：固定必备 4 节（定位含端性声明 / 安装到 profile / 构建与测试 / 许可，节名归一）+ 如适用 5 类（配置 / 双端结构 / 已知限制·排障 / 非目标 / 与其他插件的关系，声明驱动、存在即查非空、端性闭环）；自由节不限不查；web-ux 443 行**不拆分**，做三处去重（−30~40 行）+ 节序对齐，拆分硬触发条件入规范（破 500 行 / 两大章占比 >70% / 第二处手工命令清单 / 行数上限入规）。
- **证据两级制**：插件级长寿命证据统一各包 `artifacts/`（project-mcp 隔离冒烟 52 行、user-commands 真机验证 57 行迁出 README，zcode-plan acceptance/discount-verify 迁入）；变更时点证据留 openspec 归档不动；README 只留一行「验证证据：标题（链接）——结论」。
- **门禁共享内核 + 仓级化**：从 multi-root `check-docs.mjs` 抽参数化内核 `scripts/lib/doc-checks.mjs`（扫描根 / 目录配置 / 检查开关 / 豁免清单），双薄入口（multi-root 包内语义不变 + 根 `scripts/check-docs.mjs` 全仓扫描）；新增 4 检查（readme-skeleton / adr-skeleton / evidence-location / bare-adr-ref）；负测试（5 类缺陷样本运行时 mkdtemp 红绿断言）为硬验收；根 `docs:check` 挂点改 `node scripts/check-docs.mjs && pnpm -r run docs:check`；归档目录只在链接检查产生 warning（其余检查不扫，防 ~110 条噪音淹没真信号）。
- **断链与漂移清偿**：非归档 9 处断链修复（ADR-0001:161、ADR-0002 六处、project-mcp README:132）、裸 ADR 编号 6 处真实修复（分 scope 检查，规则自述文件豁免）、绝对路径残余 2 处修复 + 2 处进豁免。
- **模板与 CI 背书**：`plugin-README.md.tmpl` 从 4 节扩为骨架全集（含 `{{DUAL_SECTION}}` 占位，gen-plugin 无条件注入 buildTokens）；scaffold CI 作业补 `pnpm docs:check` 步——「开箱通过」承诺扩展到文档面。
- **zcode-plan 迁移指南内容级复核（真机重放）**：真实凭证登录 → 路由 → 扣费复测，新读数另立 `artifacts/`，版本声明改指向 `scripts/dsh-baseline.mjs` 来源常量表述 + 落档日期，同文档自相矛盾（:3 写 0.2.1-rc.2 而 :62 已引 0.2.2-rc.1 行为）清零。
- **查漏补缺盘点落档**：豁免清单生成化（`minimumReleaseAgeExclude` 300+ 条）经盘点确认不施工，现状与依据落 `docs/assessments/docs-unification.md`；`tooling/contracts` README 补位（四包唯一缺位）。

## Capabilities

### New Capabilities

（无——文档规范的决策本体进仓级 ADR-0003 与 `docs/README.md` 索引，不新开 spec capability；这是 ADR-0001/D-15「决策进 ADR、行为进 spec」先例与本仓 AGENTS.md「结构性决策进 docs/decisions/」分工的应用。）

### Modified Capabilities

- `dsh-plugin-toolchain`：新增 1 条 requirement「文档件套与文档门禁」——README 软骨架机械检查、证据位置规则、链接完整性（归档 warning）、裸 ADR 编号与绝对路径禁项、ADR 骨架子集校验、共享内核单实现与双薄入口形态、scaffold CI 文档面背书。既有 14 条 requirement 不动。

## What Doesn't Change

- 任何插件运行时行为与产物字节（`src/`、`lib/`、构建配置零改动；`git diff --stat` 断言 src 面为空）。
- `openspec/changes/archive/` 归档内容（只读；归档内断链降 warning 不修复）。
- `openspec/specs/` 既有规格行为语义（除 toolchain 增一条 requirement 外不动）。
- multi-root 的 docs/ 五目录内容组织与 13 篇插件级 ADR 体系（作为内容组织保留；本轮只动其 README 骨架、双语面、上游描述与 check-docs 薄化）。
- tooling 三包 README（自洽不改造；contracts 补位除外）。
- 豁免清单生成化施工（另案，本轮只盘点落档案）。
- `dsh:check` 聚合门禁语义（文档门禁挂 `docs:check` 独立步，不并入发布门禁）。

## Impact

- **触达面**：根仓（scripts 4 新建 + package.json + ci.yml + 根 README/AGENTS + docs 五文件 + toolchain spec）、multi-root（check-docs 薄化 + 10 份 .en.md 删除 + 8 份文档单语化改造 + ADR-0014 新建 + README 骨架对齐）、六软插件（六份 README 骨架对齐 + 三包 artifacts 目录 + zcode-plan 迁移指南复核）、templates（模板 + gen-plugin 注入）。精确清单见 `code-design.md` ① 触达面（A–F 六区）。
- **执行依赖**：zcode-plan 真机重放需 bigmodel 凭证可用与运行中 profile（G6 前置）；内核抽取必须前置于单语化（删 .en.md 瞬间双语检查即红）。
- **回归锚点**：全部门禁绿 + `pnpm dsh:check` B 面零变化 + multi-root 薄化输出与抽取前逐项一致。
