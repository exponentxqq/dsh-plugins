# Design

## Context

见 `proposal.md` Why。当前约束：multi-root 是 fork 包（其 AGENTS.md 要求改动前先读 docs、决策记其插件级 ADR 体系）；`docs:check` 现挂点 `pnpm -r run docs:check` 仅触达 multi-root；multi-root `scripts/check-docs.mjs`（318 行、10 检查）是唯一在跑的文档门禁；本轮为文档/脚本/模板面变更，零插件运行时行为变化（回归锚点：`pnpm dsh:check` B 面零变化）。

**栈识别结论**：writer skill = **dsh-plugin-writer**（用户指认）。证据：本仓无 Spring/Nuxt 自动命中（无 pom.xml / nuxt.config）；变更触插件仓工程面（门禁脚本 / 模板 / 包结构 / gen-plugin 生成器）；聚合层 `~/.agents/skills/dsh-plugin-writer` 存在且已在阶段 1.7 由设计线加载，其规范（清单不撒谎、fail-closed、单一事实源）是本次实现硬约束。执行侧（spec-apply）沿用本结论。

**上游收敛修订（轮 5，用户裁定，优先级高于规划线与设计线原推荐）**：① README 骨架**七包全部统一**，无任何插件豁免（multi-root 同样按软骨架对齐节名、补端性声明行、修同文档锚点；其 docs/ 五目录与插件级 ADR 体系作为内容组织保留）；② multi-root **所有上游相关描述完全移除、一句不留**（ADR-0014 只写处置：单语化 / 终止同步 / 薄化；来历考古靠 git 历史）；③ zcode-plan 迁移指南内容级复核按**真机重放**执行（真实凭证登录 → 路由 → 扣费复测，新读数另立 `artifacts/`；前置 = bigmodel 凭证可用 + profile 运行）。

## Goals / Non-Goals

**Goals:**

- 文档面三支柱补齐：权威规范（ADR-0003 + 索引页）、仓级门禁（共享内核 + 双薄入口）、清偿实证债（13 断链 + 证据归位 + 版本声明矛盾）。
- multi-root 去特殊化：单语化、废弃上游同步、上游描述清零、README 骨架与其他六包统一、check-docs 薄化为共享内核消费方。
- 全部决策可机械验证：每任务组验证句为第三方可核对命令（退出码 / 计数断言 / git diff 断言）。

**Non-Goals:**

- 不改任何 `src/`、`lib/`、构建配置、AR/B 门禁断言语义；不重写 README 中文文案（只动结构与归属，去重仅删重复正文）。
- 不动 `openspec/changes/archive/`（归档断链降 warning）；不动 `openspec/specs/` 既有行为语义（toolchain 增一条除外）。
- 不做豁免清单生成化施工（盘点落 `docs/assessments/docs-unification.md`，另案）；不动 tooling 三包自洽 README（contracts 补位除外）。
- 不把文档门禁并入 `pnpm dsh:check`（发布门禁保持产物面语义）。

## Decisions

逐条决策含被否方案；全量细节（含 file:line 证据锚与被否方案原文）见随档 `code-design.md` ④ 决策记录（D-B1~D-B14），此处列结构性决策：

- **D-载体（混合）**：决策本体进 ADR-0003 + `docs/README.md` 索引（只链接不复制）；门禁机器行为进 toolchain spec requirement。被否：全进 spec（写作习惯污染行为规范、无先例）；独立文档（无校验无门禁）。
- **D-内核（单实现参数化）**：`scripts/lib/doc-checks.mjs` 持有全部检查逻辑与打印层，`DocCheckConfig`（扫描根 / 目录配置 / 检查开关 / 豁免清单）为唯一旋钮；双薄入口只构造配置 + 转 exit code。被否：仓级独立实现（build.mjs 六份漂移的同构复发）；上移 multi-root 脚本（其目录约定绑死会误伤）。**组序硬依赖：内核抽取（10 项全开、输出逐项一致）必须先于单语化**——删 `.en.md` 瞬间双语检查即红。
- **D-骨架（七包统一 + 声明驱动）**：固定 4 节存在性 + 如适用 5 类声明驱动（存在即查非空；端性声明闭环双端结构节）+ 不查节序。被否：六包豁免 multi-root（用户裁定无特殊）；per-package 期望表（第二真源，新插件需同步登记）。
- **D-证据（两级制 + 豁免）**：长寿命证据归各包 `artifacts/`（含元信息行：证据类型 / 采集时点 / 结论），README 一行链接 + 结论；证据域豁免绝对路径检查（读数原文保真）。被否：证据改写占位路径（证据变叙述）；README 内嵌（实证撑爆入口文档）。
- **D-归档（窄域 warning）**：归档只在链接检查出 warning、其余检查不扫归档。被否：全检查降 warning（实测约 110 条噪音淹没 4 条真信号）；完全豁免（丢失迁移漂移信号）；修复归档（违反冻结约束）。
- **D-裸 ADR 检查（分 scope）**：全仓约 325 处裸编号 → 排除 archive 与 multi-root 子树后 13 处 → 规则自述文件（AGENTS.md / docs/decisions/README.md）豁免后真实修复 6 处。被否：全仓一刀切（不可用）。
- **D-web-ux（不拆 + 去重 + 硬触发）**：复算 2:1 实证两大章 67% 是行为语义非查表参考；三处重复去重 −30~40 行且不改任何 H2 标题文本（保同文档锚点）。被否：拆 92 行到 docs/（443→351 仍最大，目标落空）。
- **D-multi-root 叙述（完全移除）**：README/AGENTS/SKILL.md/工作流文档的上游描述清零（保留 DSH 上游语义——那指 deepseek-harness 宿主，不是 fork 上游）；`package.json` files 同批删 `README.en.md` 行（漏改 = 清单撒谎）；ADR-0014 只写处置。被否：留一句上游事实（用户明确否决）。
- **D-模板（骨架全集 + 无条件 token）**：模板扩为 4 实节 + 5 如适用 HTML 注释 + `{{DUAL_SECTION}}` 占位；`gen-plugin.mjs` buildTokens 无条件注入 DUAL_SECTION（render() 是原样残留语义、无 fail-closed）。被否：件套加新文件（件套数不变，template.json 清单零改动）。
- **D-ADR 骨架（子集校验）**：七节子集 + 不查顺序——ADR-0001 有 8 个 H2（多「修订记录」）且 Related Documents 在后，等集/顺序断言会让存量先红。
- **D-复核（真机重放）**：zcode-plan 迁移指南按用户裁定真机复测（登录→路由→扣费），新读数另立 artifacts；版本声明改来源常量表述 + 落档日期。被否：静态对账（用户升级为真机）；仅改版本行（同文档自相矛盾 :3/:62 留雷）。
- **阶段 1.75 界面演示 gate：未触发**——本次变更触达面为纯文档/规范/门禁脚本/模板面（C1 不成立，命中排除表「纯后端 / CLI / 数据迁移 / 配置 / 脚本」行）；判定留痕见随档 `code-design.md` 末尾附录。

## 触达面与逐任务组（与 tasks.md 分组一一对应）

全量逐文件清单（A 根仓脚本 / B 根仓文档 / C 模板生成器 / D multi-root / E 六软插件 / F 显式不触达边界）与每模块 file:line 证据锚见 `code-design.md` ①②。任务组（组间串行、组内并行）：

| 组 | 内容 | 关键验收 |
| --- | --- | --- |
| G1 评估档案 | `docs/assessments/docs-unification.md`（差异清单 + 不施工项 + 豁免盘点 D-12）+ 索引 | assessments README 索引收录 |
| G2 规范落位 | ADR-0003 + `docs/README.md` + toolchain spec requirement + AGENTS.md 链接（≤4 行 diff） | ADR-0003 自身先过 adr-skeleton；AGENTS diff 行数断言 |
| G3 内核抽取 | `scripts/lib/doc-checks.mjs` + `.d.mts` + selftest + multi-root check-docs 薄化（10 项全开） | multi-root 输出与抽取前逐项一致（基线输出已实测存档）；selftest 红绿 |
| G4 单语化 | 删 10 份 .en.md + 双语 3 项退役 + 上游描述完全移除 + ADR-0014 + package.json files 行 | 仓内 `find -name '*.en.md'` 计数 0；双语检查退役后 multi-root docs:check 绿 |
| G5 骨架对齐 | 七包 README 骨架统一（含 multi-root 改名/端性声明/锚点）+ web-ux 去重 + 模板 + gen-plugin | readme-skeleton（七包）绿；web-ux 行数 −30~40 且 H2 文本零变化 |
| G6 证据归位 | project-mcp/user-commands 证据迁出 + zcode-plan 两篇迁入 + 迁移指南真机重放复核 | evidence-location 检查绿；README 内嵌节标题 grep 仅剩链接行；迁移指南矛盾清零 |
| G7 门禁落位 | 根入口 + 4 新检查启用 + scaffold 补步 | `node scripts/check-docs.mjs` 三值语义；scaffold 作业含 docs:check 步 |
| G8 首轮清偿 | 断链 9 + 裸 ADR 6 + 绝对路径 2 修 + 2 豁免登记 | 非归档区 0 error、归档 4 条 warning 可见 |
| G9 收尾 | contracts README + 根 README 文档地图 + 口径同步 | 全链 CI 绿（八步 + scaffold） |

## 接口与数据形状（摘要，全量见 code-design.md ③）

- `runDocChecks(config: DocCheckConfig): DocCheckReport`——内核唯一入口；`DocCheckConfig`：`{ scanRoot, dirs: { agentNote?, plansActive?, plansCompleted?, decisions? }, checks: Record<CheckId, boolean>, exemptions: { absolutePathSubstrings, bareAdrFiles, evidenceDirs } , pluginPackages: { include, exclude } }`（七包统一后 `exclude` 为空集）。
- 薄入口约定：multi-root `scripts/check-docs.mjs`（构造 PKG_CONFIG + 自检 + exit code）与根 `scripts/check-docs.mjs`（构造 REPO_CONFIG + exit code 0/1/2，与 `dsh-check.mjs` 同约定）均不打印、不持逻辑。
- 证据行文法：`验证证据：[标题](artifacts/<file>.md)——结论：<一句话>`；证据文件首行元信息：`证据类型 / 采集时点 / 结论`。

## 假设与未决项

- 假设：真机重放凭证在执行期可用（G6 前置，不可用时该任务组挂起并上报，不静默降级为静态对账）；zcode-plan 扣费读数复测不影响账号配额的可用额度足够一次复测。
- 未决：无（设计线上浮 Q1–Q5 已全部在轮 5 裁定闭环）。

## Risks / Trade-offs

- **单语化删除面广**（781 行英文 + 双语规则多处）：以 `find -name '*.en.md'` 计数断言 + 门禁退役同批收口，防半删状态。
- **multi-root 骨架对齐动其 README 多处**：改名后同文档锚点（`README.md:29` `[安装](#安装)` 类）门禁查不到，须人工核对清单（G5 验收含锚点巡检）。
- **真机重放引入环境依赖**：凭证 / profile 不可用即阻塞 G6——显式前置声明，不静默改深度。
- **大规模文档移动污染 blame**：迁移用纯移动 + 改链分批提交，commit message 注明来源路径。
- **门禁误报复阻塞**：豁免清单机制（子串匹配 + 文件级）随内核落地；如适用语义以声明位实现，防硬断言逼空节。
