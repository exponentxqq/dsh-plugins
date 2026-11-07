# docs-arch-refinement · 差异收敛矩阵（阶段 1.5 留痕）

> 编排：并行 · team 驱动（两线均 glm-5.3 具名成员；`lineA`/`lineB` 路由在 team 编排下不应用）。
> 产物：`line-a.md`（182 行）/ `line-b.md`（173 行）；复算线 = fresh subagent（`panel` 路由 deepseek-official/deepseek-flash）。
> 需求原文：1. 当前各插件的文档有点混乱，需要统一文档格式和规范；2. 查漏补缺，在“最优架构”的方向上是否要有需要调整的。

## 1. 交叉比对三分类

### 1.1 共识（两线一致，直接采信）

| # | 结论 | A 线出处 | B 线出处 |
| --- | --- | --- | --- |
| C1 | 需求 1 与需求 2 汇合：11-07 三变更后构建/类型/测试/依赖/脚手架五面已单点化+门禁化，**文档工程面是「复制-漂移」收敛主线最后一个未收敛区** | §1 定性结论 | §0 对齐缺口 |
| C2 | 分层模型：入口（README）/ 参考（docs/）/ 证据（artifacts/）/ 规格（openspec/specs）/ 决策（docs/decisions + multi-root 插件级）/ 评估（docs/assessments） | §3 分层表 | §3.1 T1 |
| C3 | 弱统一/软骨架：必备节（如适用）+ 自由节；不强同构、不查节序（防空节） | §3 取舍 | §3.2 C |
| C4 | 插件级验证证据统一 `artifacts/`；变更时点证据留 openspec 归档（两级制） | Q2a | T3 |
| C5 | multi-root 文档体系排除（仅「引用接口」与「共享检查内核抽取」例外） | §2 边界表 | §2 边界外 |
| C6 | openspec 归档只读（变更时点冻结） | §2 范围外 | 非目标 |
| C7 | 门禁只查可机械判定项（规则在文档、脚本只机械执行 + 豁免清单） | §3 配套 | §3.1 T4 |
| C8 | 回归底线：不改任何插件运行时行为与产物字节（src/ 面 diff 为空；multi-root 门禁薄化除外，验收=输出逐项一致） | §5 | §5 |
| C9 | 模板同步：plugin-README.md.tmpl 随件套定义重写，gen:plugin 生成即合规 | T4 | T2c |
| C10 | 任务主线：评估/盘点 → 规范落位 → 骨架对齐 → 证据归位 → 门禁 → 收尾 | T0–T6 | T0–T5 |

### 1.2 分歧（裁定记录）

| # | 分歧 | A 线 | B 线 | 裁定 | 依据 |
| --- | --- | --- | --- | --- | --- |
| D1 | 门禁实现方式 | 新写仓级脚本 + multi-root 双跑并存（U2/A5：重叠度实施线测定） | 抽参数化共享内核 `scripts/lib/doc-checks.mjs` + 双薄入口（R-6 双实现漂移） | **采纳 B（共享内核）** | 主会话查证 check-docs.mjs（318 行）：10 项检查中 6 项与目录约定零耦合、4 项耦合的目录常量（.agent/note、docs/plans、docs/decisions）本身即天然参数；ABSOLUTE_PATH_ALLOWLIST 豁免雏形已存在（:35）；multi-root AGENTS.md 明文「Prefer extending existing conventions over introducing parallel structures」。A 的「上移误伤」担忧被参数化方案消解 |
| D2 | 规范载体 | 纯 spec requirement（Q5a：与 AR 门禁同源、享 spec:check） | 混合：决策本体进 ADR-0003 + docs/README.md 索引；门禁机器行为进 spec | **混合（用户确认）** | 仓级 AGENTS.md 成文分工「结构性决策进 docs/decisions/、ADR 只约束仓级结构与工程约定」；AR1–AR8 先例（不变式进 spec + 脚本机械执行）。轮 2 用户选 a |
| D3 | web-ux 443 行 README 处置 | 本轮拆出 docs/ 参考分册（Q4a：最大病灶绕不开） | 不拆/谨慎拆（按能力分章有信息价值、软骨架不动自由节） | **不拆 + 去重 + 硬触发条件（用户确认）** | panel 复算 2:1（见 §2） |
| D4 | zcode-plan 迁移指南过期版本声明 | 未提（U3 只问归类） | 仅改声明为来源常量表述（待决6a） | **内容级复核（用户裁定，超出两线推荐）** | 用户轮 3 选「内容级复核」：迁移指南内容按 0.2.2-rc.1 逐段复核更新，入任务清单实质任务 |
| D5 | 豁免清单生成化 | 只盘点落 assessments（Q6a） | 未提 | **盘点后酌情施工（用户裁量规则）→ 盘点事实=不施工落档案** | 用户轮 3 选「盘点后酌情」；规划期查证另案原始定义（optimize-architecture diff-matrix O8）：minimumReleaseAgeExclude 300+ 条清单生成化 = upgrade-dsh 内部优化、涉及两脚本行为改造、与文档面零依赖——「面小」条件不成立，按用户裁量规则推出不施工（落 docs/assessments，见 §4 轮 3 后查证） |

### 1.3 单边遗漏（逐项核验，绝不因单边而丢弃）

| # | 来源 | 单边项 | 核验结论 |
| --- | --- | --- | --- |
| O1 | A | 豁免清单生成化盘点（Q6/U1） | **成立**：纳入 T0 盘点任务；终局裁定见 D5（不施工、落档案 + 区分 --dump-config-schema 4 条 unrecognized 口径豁免仅收录不施工） |
| O2 | A | 受众排序（AI 代理第一受众） | **成立**：入 ADR-0003 背景叙述（agent 检索成本与误读率是门禁收益面） |
| O3 | A | 双语同步成本风险 R5 | **被裁定消解**：Q1 全仓单语化后不存在双语同步成本；风险转化为「单语化清理任务」本身 |
| O4 | A | 门禁禁项：裸 ADR 编号引用、错拼双语后缀 | **成立**：错拼后缀检查保留（防 .en.md 残留错拼）；裸 ADR 编号禁项并入（AGENTS.md 已有成文纪律，门禁机械化） |
| O5 | B | 13 处断链清偿（8 处门禁盲区） | **成立**：入门禁任务的首轮修复（T4c）；归档 4 条按 D-归档 warning 处理 |
| O6 | B | tooling/contracts README 补位（四包唯一缺位） | **成立**：入收尾任务 |
| O7 | B | docs/README.md 仓级文档索引页 | **成立**：入规范落位任务（D2 混合载体组成部分） |
| O8 | B | 归档目录链接检查策略 | **成立**：用户裁定降级 warning（轮 2） |
| O9 | B | scaffold CI 作业补 docs:check 步 | **成立**：用户裁定补（轮 2）；落点已查证（ci.yml scaffold 作业存在，:68 起） |
| O10 | B | 门禁自身负测试（5 类缺陷样本红绿验证） | **成立**：入门禁任务硬验收（防「门禁坏了但一直绿灯」静默失效） |
| O11 | B | zcode-plan 迁移指南版本声明过期（R-5） | **成立**：升级为内容级复核（D4） |
| O12 | B | AGENTS.md 只加链接、正文不膨胀（diff 可断言） | **成立**：入规范落位约束 |
| O13 | B | 评估档案先行（docs/assessments/docs-unification.md，镜像 multi-root-build-unification 惯例） | **成立**：为 T0 首任务 |
| O14 | B | 门禁不并入 dsh:check（保持发布门禁产物面语义） | **成立**：挂点 = 根 docs:check（`node scripts/check-docs.mjs && pnpm -r run docs:check`），CI 步骤名不变 |

## 2. 分歧复算（D3 web-ux，panel 路由 fresh subagent）

**裁定：本轮不拆，维持单文件；工作 = 去重 + 节序对齐 + 拆分硬触发条件。**

- 结构事实：443 行 / 9 H2 / 25 H3；`删除已归档会话` 187 行（42%）+ `会话管理` 111 行（25%）= 67%，其余七章共 142 行；六插件对照 155–297 行、10–15 H2、最大单章 76 行。
- A 线事实基础不成立：全文仅 1 个配置键 `archiveRoot`（:97–115 约 19 行）；187 行主体是行为语义（入口规则/两步确认/处置模式/删除范围/迁移范围），正是「每章自含背景·用法·边界」的价值面。
- 拆分性价比差：最干净切法只能抽 92 行（手工找回 49 + 半失败清理 26 + 拒绝码 17），443→351 仍全仓最大（次 297）。
- 替代施工：三处重复可无损减 30–40 行（:80↔:292、:175↔:266、:199–206↔:308–317↔:435–439）。
- 硬触发条件（入规范）：README 破 500 行、两大章占比 >70%、出现第二处手工操作命令清单、docs:check 落地行数上限规则——任一命中即拆。
- 内链面：7 处同文档锚点、跨文件引用仅根 README:99 与 project-mcp:9/195 纯路径链接（零锚点）——本轮不拆则内链面零风险。
- 三线对照：A 拆 / B 不拆 / panel 不拆 = **2:1 不拆**，置信中高（结构实测完整）。用户轮 2 确认。

## 3. 探索审视（第 4 步，加载 openspec-explore）

| # | 发现 | 处置 |
| --- | --- | --- |
| N1 | openspec 工件套形态前后不一（早期 4 件 vs 后期 +code-design/decisions/diff-matrix/artifacts/verification）——归档不动，未来工件面由 spec-plan/spec-workflow 流程（dotfiles 侧）管辖 | **降级为边界声明**：ADR-0003 加一句「openspec 工件面遵循规划流程产物，本仓不做二次规范」；不施工、不问 |
| N2 | docs/README.md 索引页自身的维护纪律（防成为新口径副本源） | **降级为设计细节**：索引只链接不复制摘要，入 ADR-0003 |
| N3 | 「中文为准、冲突中文胜」是否升仓级 | **被 Q1 消解**：全仓中文唯一后无冲突裁决问题，规则简化为「中文唯一」 |
| N4 | 门禁挂点事实 | 查证：根 package.json `docs:check: "pnpm -r run docs:check"`（仅触达 multi-root）→ B 方案挂点机械可行 |
| N5 | 归档 warning 机械可行性 | 查证：check-docs.mjs 仅 errors>0 置退出码（:311）→ warning 方案 exit 0 可行 |
| N6 | scaffold 补步落点 | 查证：ci.yml scaffold 作业存在（:68 起，gen 双 kind → frozen 安装 → verify:all → dsh:check）→ 补步落点明确 |
| N7 | 双语面规模 | 查证：multi-root 10 份 .en.md 共 781 行（README、docs 六目录索引、.agent/note×2、.agent×1），对应中文侧同量级 → 单语化清理规模实证可控 |
| N8 | 双边盲区核查 | 需求 2 覆盖经自由审视无共同遗漏：文档面三支柱（权威规范/索引/门禁）+ 豁免清单生成化（D5）+ multi-root 构建迁移维持「暂不施工」裁定 + 基线升版属节奏问题非架构缺口 |

## 4. 设计树与前沿分轮问答（第 5 步，grill-me 方法）

**轮 1**（5 问）：
1. 双语策略 → **用户 custom：「改为只用中文，另外完全废弃 multi-root 的 fork 上游同步的能力」**（推翻两线共识推荐 a，规划外 scope 扩展，轮 2 澄清）
2. 证据位置 → 两级制 artifacts/（推荐，✅）
3. 骨架门禁强度 → 节存在性+内链+禁项（推荐，✅）
4. 规范载体 → 用户要求举例说明区别（轮 2 重问）
5. 变更拆分 → 单变更全量（推荐，✅）

**轮 2**（5 问）：
1. 双语清理范围 → **用户 custom：「彻底单语化+废弃 multi-root fork 上游同步（清理所有上游相关描述）」**；执行口径：叙述面（README/AGENTS）清除上游框架描述，决策记录（其插件级 ADR）留一句最简上游事实供自解释；git 历史与 fork 事实不抹除
2. 规范载体 → a 混合（推荐，✅）
3. web-ux → 不拆+去重+硬触发（复算 2:1 推荐，✅）
4. 归档链接 → 降级 warning（推荐，✅）
5. scaffold 补步 → 补（推荐，✅）

**轮 3**（3 问）：
1. zcode-plan 版本声明 → **内容级复核（用户裁定，非推荐项）**
2. 豁免清单生成化 → **盘点后酌情施工（用户裁量规则）**
3. 单语化+废弃同步归属 → 归本轮单变更（推荐，✅）

**轮 3 后查证（Q10 阈值事实）**：另案原始定义 = minimumReleaseAgeExclude 300+ 条生成化（optimize-architecture O8：「upgrade-dsh 内部优化、低风险低收益」）；面大（两脚本行为改造 + 生成器 + 负测试）且与文档主线零依赖 → 按用户「面小才施工」裁量规则推出 **不施工，现状与依据落 docs/assessments**；--dump-config-schema 4 条 unrecognized 属口径豁免（AGENTS.md 注记），盘点收录不施工。

**轮 4（规范草案定稿）**：用户两轮追问后（「当前文档格式和规范是什么样的」→「当前规划的文档格式和规范是什么样的」），主会话将软骨架落到具体节清单展示，用户确认「按此草案定稿」。定稿内容：
- **固定必备 4 节**（全部插件必查，节名归一）：`## 定位`（是什么/为谁/端性声明 host-only|双端）、`## 安装到 profile`、`## 构建与测试`（build/test/typecheck 入口；「构建」「构建与类型」三名归一）、`## 许可`（「许可证」归一）。
- **如适用 5 类**（声明即查，防逼空节）：`## 配置`（包有配置键：project-mcp/session-tool-toggle/zcode-plan/web-ux）、`## 双端结构`（端性=双端：web-ux/session-tool-toggle/workspace-config）、`## 已知限制`/`## 排障`（有已知问题面）、`## 非目标`（有边界声明）、`## 与其他插件的关系`（有同装/软依赖约束：workspace-config 四包同装、project-mcp↔web-ux）。
- **自由节**（能力章节）不限、不动、门禁不查；**验证证据一律不内嵌 README**（project-mcp「隔离冒烟记录」、user-commands「真机验证」两节迁 artifacts/）。
- **证据行格式**：`验证证据：[标题](artifacts/xxx.md)——结论：<一句话>`。
- **门禁 6 查项**：①必备节存在性（不查节序）②内链有效性（归档目录降 warning）③证据位置规则 ④禁项（裸 ADR 编号/错拼英文后缀/绝对路径 `/Users|C:\Users|file://`/空文档）⑤docs/decisions ADR 文件名+七节骨架 ⑥multi-root 域 10 项参数化形态（单语化后双语 3 项退役）。
- **模板**：plugin-README.md.tmpl 扩为骨架全集（占位+如适用注释），gen:plugin 生成即过门禁，scaffold CI 补 docs:check 步；**docs/README.md 索引页**只链接不复制摘要。

**阶段 1.5 收敛结束：用户确认共识与规范草案（可落档）。**

**轮 5（落档前分歧点提问，设计线上浮 Q1–Q5 的裁定）**：
- **DQ1 骨架范围 → 用户 custom：「不要有任何插件或骨架搞特殊，全部统一」= 七包全部纳入软骨架**（修订 D-13：multi-root README 骨架不再豁免，需节名对齐 + 补端性声明 + 锚点修复；解读边界：此处「骨架」= README 骨架，multi-root 的 docs/ 五目录与插件级 ADR 体系作为内容组织保留不动）。设计线推荐六软插件被推翻。
- **DQ2 如适用机制 → 声明驱动**（推荐，✅）：存在即查非空 + 端性闭环，零第二真源。
- **DQ3 zcode-plan 复核深度 → 真机重放**（推翻设计线推荐「静态对账」）：真实凭证登录→路由→扣费复测更新读数，新读数另立 artifacts/；执行前置 = bigmodel 凭证可用 + profile 运行；版本声明修正与矛盾清零仍并入。
- **DQ4 证据域路径 → 豁免 + 元信息行**（推荐，✅）。
- **DQ5 ADR 上游事实句 → 用户 custom：「不是说了完全移除上游相关描述吗？」= 完全移除、一句不留**（强化 D-2：ADR-0014 只写处置（单语化/终止同步/薄化），不写 fork 来历；来历考古靠 git 历史）。

## 5. 收敛结论（阶段 1.7 输入）

| # | 决策 | 结论 |
| --- | --- | --- |
| D-1 | 编排/变更 | 单变更全量（评估→规范→骨架→证据→门禁→收尾 + multi-root 单语化组），组间串行、组内并行 |
| D-2 | 语言 | **全仓中文唯一**；multi-root 彻底单语化：删 10 份 .en.md（781 行）、双语检查退役改单语版、SKILL.md 双语规则删、**清理所有上游相关描述**（叙述面清、ADR 留一句事实）、废弃 fork 上游同步（git 历史不动）、决策记 multi-root 插件级 ADR、按其规矩先读 docs |
| D-3 | 载体 | 混合：ADR-0003（分层/骨架/证据归属决策）+ docs/README.md 索引页 + toolchain spec requirement（门禁机器行为）；AGENTS.md 只加链接 |
| D-4 | 骨架 | 软骨架：必备节（如适用语义）+ 自由节；门禁查节存在性+内链+禁项，不查节序 |
| D-5 | 证据 | 两级制：插件级长寿命证据 → 各包 artifacts/；变更时点证据 → openspec 归档 artifacts/（不动）；README 留一行结论+链接 |
| D-6 | 门禁实现 | 抽共享内核 scripts/lib/doc-checks.mjs（参数：扫描根/目录配置/检查开关/豁免清单）+ 双薄入口（multi-root docs:check 语义不变 + 根 scripts/check-docs.mjs 全仓）；负测试（5 类缺陷样本红绿）硬验收；挂点 `node scripts/check-docs.mjs && pnpm -r run docs:check`；不并入 dsh:check |
| D-7 | 归档 | 只读；归档内断链降 warning（exit 0），非归档区 error |
| D-8 | web-ux | 不拆；去重（三处重复 −30~40 行）+ 节序对齐；硬触发条件入规范（破 500 行/两大章 >70%/第二处手工命令清单/行数上限入规） |
| D-9 | 断链清偿 | 13 处（8 非归档 + 4 归档 + 1 插件区）：非归档修复、归档 warning，作为门禁首轮实战 |
| D-10 | 模板 | plugin-README.md.tmpl 按件套重写；scaffold CI 补 docs:check 步；gen:plugin 生成即合规 |
| D-11 | zcode-plan | 迁移指南**内容级复核**（按 0.2.2-rc.1 逐段复核更新）+ 证据归位（acceptance/discount-verify → artifacts/；migration 留 docs/） |
| D-12 | 豁免清单 | 不施工；现状盘点落 docs/assessments（含 O8 另案依据与 unrecognized 口径豁免收录） |
| D-13 | 边界 | multi-root 文档体系其余面不动；openspec 工件面归 spec-plan 流程（ADR-0003 一句声明）；tooling 三包 README 自洽不改造（contracts 补位除外）；不做文案重写 |
| D-14 | 回归底线 | 零插件运行时行为与产物字节变化；multi-root 门禁薄化验收 = 输出逐项一致；AGENTS.md diff 仅链接 |

## 6. 查证依据存档

- `plugins/multi-root-workspace/scripts/check-docs.mjs` 全文（318 行）：10 检查结构、ALLOWLIST :35、warning 不置退出码 :311
- `docs/decisions/ADR-0001` D-15 段；仓级 AGENTS.md「仓级 ADR」分工段
- 根 `package.json:22` docs:check 挂点；`.github/workflows/ci.yml` scaffold 作业 :68
- `plugins/web-ux/README.md` 节结构（grep ^## 实测）；七包 README 行数（155–443）
- `plugins/{web-ux,workspace-config}/artifacts/` 形态；openspec 归档 artifacts 先例
- multi-root .en.md 统计：10 份 781 行（find+wc 实测）
- optimize-architecture 归档 diff-matrix.md O8（豁免清单生成化另案定义）
- 复算线实测：web-ux 443 行节分布、去重点行号、内链锚点 7 处、跨文件引用 3 处
