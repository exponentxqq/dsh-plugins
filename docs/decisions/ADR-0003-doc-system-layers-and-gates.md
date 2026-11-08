# ADR-0003: 文档体系的分层 ownership 与机械门禁

## Status

Accepted（2026-11-07）。

载体为混合：决策本体在本 ADR，索引页只链接不复制，门禁的机器行为进 toolchain spec requirement。

## Date

2026-11-07

## Context

### 收敛前：三种文档体制并存（2026-11-07 实测）

| 文档域 | 实测现状 | 机械门禁 |
| --- | --- | --- |
| `plugins/multi-root-workspace/`（fork 域） | 双语：10 份 `.en.md`（781 行）+ `docs/` 五分类（含 6 份 README）+ 13 篇插件级 ADR + `.agent/` 知识库；README 239 行、11 个 H2，节名自持（`项目简介` / `安装` / `许可证`） | 自带 `scripts/check-docs.mjs`（318 行、10 项） |
| 六个软插件 | 各一份中文 README，155–443 行、9–15 个 H2；节集合与命名不统一（仅 workspace-config 有 `定位` 节、仅 session-tool-toggle 有 `构建与测试` 节） | 无——六包均无 `docs:check` |
| 仓级文档面 | 无 `docs/README.md` 索引页、无文档体系 ADR；`docs/` 只有 `assessments/` 与 `decisions/`；`tooling/contracts` 无 README | 无——根 `docs:check` 只递归 multi-root |

三种体制的共性不是文风，而是**同一事实存在多处副本且没有单一出处**：版本声明、验证证据、门禁口径、ADR 引用各按所在域的旧习惯书写，跨域迁移（归档 / 重命名 / 收归根）时没有任何机械信号。两个可计数的后果：

- **13 处断链**：仓级 `docs/` 8 处、插件区 1 处、归档区 4 处；其中 8 处落在当时门禁完全不扫的仓级文档面。成因两类：变更归档后旧路径失效（12 处）、源码文件重命名（1 处）。
- **证据三形态（连归档共四处）**：README 内嵌 2 处（project-mcp 53 行、user-commands 39 行）、`artifacts/` 2 包（web-ux / workspace-config）、插件 `docs/` 2 篇（zcode-plan 的 acceptance / discount-verify）、`openspec` 归档的变更时点证据。同类证据四种位置，没有位置信号。

### 受众排序：agent 是第一受众

本仓文档的第一读者是 AI 代理：每次任务都要先读入口文档建立上下文，副本越多，检索成本与误读率越高，读到过期副本的代价直接落在实现面上。因此本决策的第一判据是「同一事实只有一个出处，其余位置只留引用」，而不是文风统一或章节齐整。这也正是门禁的收益面——机械信号把「该读哪一份」变成「只有一份可读」。

### 缺口与本 ADR 的落点

收敛前缺三件事：仓级规则（无文档体系 ADR）、仓级索引（无 `docs/README.md`）、仓级门禁（根 `docs:check` 只递归 multi-root）。本 ADR 定义规则本体；索引页与门禁分别是它的引用面与执行面，不另立规则。

## Decision

本决策有四个规则面：分层 ownership（§1）、README 软骨架（§2）、证据两级制（§3）、门禁 6 查项（§4）；外加执行分工（§5）与两处边界（§6）。

### 1. 分层与 ownership（六层）

| 分层 | owner 域（写在哪） | 本层 own | 本层 MUST NOT 承载 |
| --- | --- | --- | --- |
| 入口（README） | 仓根 `README.md`、`AGENTS.md`、`docs/README.md`、`plugins/*/README.md` | 定位、安装、构建与测试入口、指向更深内容的链接 | 长寿命证据正文、规则原文副本、跨域摘要 |
| 参考（docs/） | 各包 `docs/`、`tooling/*/README.md` | 查表型参考：用法、排障、迁移、架构说明 | 验证读数（→ 证据层）、结构性决策（→ 决策层） |
| 证据（artifacts/） | `plugins/*/artifacts/` | 长寿命验证证据、读数原文与元信息行 | 规范条文、规则陈述 |
| 规格（openspec/specs） | `openspec/specs/` | 可验收的行为规格（SHALL + Scenario） | 结构性决策论证（→ 决策层） |
| 决策（docs/decisions + multi-root 插件级） | `docs/decisions/`、`plugins/multi-root-workspace/docs/decisions/` | 结构性决策：结论、被否方案、后果、边界 | 行为规格（→ 规格层）、现状盘点（→ 评估层） |
| 评估（docs/assessments） | `docs/assessments/` | 现状差异、不施工理由、通过标准 | 决策与约束（→ 决策层） |

六层名称与顺序为固定基线：MUST NOT 重命名、合并或新增第七层。每层只有一个 owner；跨层引用 MUST 用链接或路径，MUST NOT 复制正文或摘要——同一事实若必须出现在两处，第二处只能是引用。

### 2. README 软骨架（七包统一：4 必备 + 5 如适用 + 自由节）

软骨架 = 只约束「必备节存在」与「如适用节非空」，不约束节序、节数上限与文案。适用范围：`plugins/*/README.md` 七个包全部纳入，无任何包豁免（multi-root-workspace 同样按本节对齐）。

| 类别 | 节标题（精确文本） | 判定 |
| --- | --- | --- |
| 必备 | `## 定位` | 存在；正文 MUST 含一行 `端性：host-only` 或 `端性：双端` |
| 必备 | `## 安装到 profile` | 存在 |
| 必备 | `## 构建与测试` | 存在；归一「构建」「构建与类型」两个变体 |
| 必备 | `## 许可` | 存在；归一「许可证」 |
| 如适用 | `## 配置` | 存在即须有非空白正文 |
| 如适用 | `## 双端结构` | 端性=双端 时**必备**；host-only 时不得出现（闭环） |
| 如适用 | `## 已知限制` / `## 排障` | 二者任一存在即可；存在即须有非空白正文 |
| 如适用 | `## 非目标` | 存在即须有非空白正文 |
| 如适用 | `## 与其他插件的关系` | 存在即须有非空白正文；归一「与 dsh-plugin-web-ux 的关系」 |
| 自由 | `<自由节…>` | 不限、不查 |

判定细则（全部机械可判）：

1. 必备节按**标题文本精确**匹配（去首尾空白、不含层级前缀），不查顺序与位置。
2. 「如适用」节：存在 → 正文去空白后长度 > 0（防空壳节）；不存在 → 不报。
3. `端性` 声明行缺失或取值不在 `{host-only, 双端}` → error；声明 `双端` 而无 `## 双端结构` → error；声明 `host-only` 却有 `## 双端结构` → error（防复制粘贴残留）。
4. 标题命中 `evidenceSectionPattern` 的 H2 → error「证据不得内嵌 README」。
5. 证据行：格式不符 → error；目标不在 `artifacts/` 下或文件不存在 → error。
6. 门禁范围：`plugins/*/README.md`；七个包全部纳入，`pluginPackages.exclude` 为空集。
7. 模板生成的注释行 `<!-- 如适用：… -->` 不构成 `##` 标题 → 不触发任何判定。

「如适用」采用声明驱动：节在即查非空，节不在不报；MUST NOT 维护 per-package 的期望节表（那是第二真源，新插件需同步登记）。

### 3. 证据两级制与证据行文法

| 级别 | 位置 | 生命周期 | 元信息首行 |
| --- | --- | --- | --- |
| 长寿命证据 | `plugins/*/artifacts/` | 随包维护，可被后续变更更新 | `证据类型 / 采集时点 / 结论` |
| 变更时点证据 | `openspec/changes/archive/<date>-<change>/artifacts/` | 归档冻结、只读 | 同上（由变更工件面承载） |

- README MUST 对长寿命证据只留一行证据行，MUST NOT 内嵌证据正文或证据节（判定见 §2 细则 4/5）。
- 证据行文法 MUST 逐字为下一行（冒号 MUST 为全角「：」、连接符 MUST 为破折号「——」）：

```text
验证证据：[标题](artifacts/<file>.md)——结论：<一句话>
```

- 目标 MUST 位于 `<pkg>/artifacts/` 下且文件存在（页面在子目录时允许 `../artifacts/` 前缀）。
- 证据文件首行 MUST 为元信息行：`证据类型 / 采集时点 / 结论`。
- 证据域 MUST 豁免绝对路径检查（读数原文保真）；MUST NOT 为过检查把真实读数改写成占位路径。
- 变更时点证据 MUST 留在归档域，MUST NOT 回流 README。

### 4. 门禁 6 查项

门禁 MUST 只判可机械判定项；6 查项是文档门禁的完整规则面，脚本只做机械执行（§5）。

| # | 查项 | 机械判据 | 扫描域 / 降级 |
| --- | --- | --- | --- |
| ① | 必备节存在性（不查节序） | 4 必备节标题精确存在；不查顺序与位置 | 七包 README |
| ② | 内链有效性（归档目录降 warning） | 相对链接解析后目标存在（`<>` 包裹、`#` 锚点、scheme、百分号解码按机械规则处理） | 全仓 Markdown；归档域降 warning、exit 0 |
| ③ | 证据位置规则 | 证据节禁入 README + 证据行文法 + 目标在 `artifacts/` 下且存在 | 七包 README |
| ④ | 禁项（裸 ADR 编号 / 错拼英文后缀 / 绝对路径 / 空文档） | 判据见下方常量块 | 全仓；裸 ADR 编号对规则自述文件豁免，绝对路径对证据域与豁免清单豁免 |
| ⑤ | `docs/decisions` ADR 文件名 + 七节骨架 | 文件名 `ADR-<四位编号>-<小写中划线标题>.md`；七节子集存在（多出节允许、不查顺序） | `docs/decisions/`（仓级，七节骨架规则适用于此）；multi-root 插件级 ADR 的编号与目录由包内入口按同一内核的独立配置检查 |
| ⑥ | multi-root 域 10 项参数化形态（单语化后双语 3 项退役） | 原 10 项检查以共享内核参数化形态保留；单语化后 `readme-pairs` / `agent-note-pairs` / `readme-navigation` 三项退役，余 7 项全开 | multi-root 子树（包内薄入口） |

判据常量（脚本 MUST 与本块逐字同源）：

```text
ADR 文件名        ^ADR-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$
裸 ADR 引用       ADR-\d{4}（非路径形式；规则自述文件与自标题豁免）
错拼英文后缀      (_en|\.eng|\.english|-en)\.md$（大小写不敏感）
绝对路径          /(Users|home)/、[A-Za-z]:\\Users\\、file://（后两者大小写不敏感）
空文档            trim 后长度为 0
证据节标题        ^(验证证据|冒烟记录|验收记录|真机验证)$
证据行            ^验证证据：\[[^\]]+\]\((?:\.\./)?artifacts\/[^)]+\.md\)——结论：.+$
ADR 七节          Status / Date / Context / Decision / Alternatives Considered / Consequences / Related Documents
```

### 5. 「规则在文档、脚本只机械执行」分工

- **规则唯一出处**：本 ADR（连同 [`docs/decisions/README.md`](./README.md) 的命名与七节约定）SHALL 是文档规则的唯一出处；脚本内常量 MUST 与本 ADR 逐字一致，MUST NOT 出现同义不同词的第二份表述。
- **单实现 + 双薄入口**：`scripts/lib/doc-checks.mjs` MUST 是唯一的文档检查实现；`scripts/check-docs.mjs`（仓级）与 `plugins/multi-root-workspace/scripts/check-docs.mjs`（包内）MUST 只是薄入口——构造配置 + 转 exit code，MUST NOT 持有检查逻辑或打印层。
- **只机械执行**：脚本 MUST 只判存在性、正则、路径解析与计数；MUST NOT 判节序、文案语义、文风或篇幅。
- **语义变更顺序**：判定语义的任何变更 MUST 先改本 ADR，再改脚本与配置；只改脚本视为漂移。
- **走时自检**：门禁 MUST 自带缺陷样本自检（逐项 FAIL）与合规样本自检（PASS），MUST NOT 依赖人工演练。
- **豁免登记**：豁免 MUST 以配置清单登记（路径子串 / 精确路径），MUST NOT 在检查代码里写 per-file 分支；新增豁免 MUST 在本 ADR 或评估档案留一句依据。
- **挂点**：门禁挂 `docs:check`，MUST NOT 并入 `dsh:check`（发布门禁保持产物面语义）。
- **归档只读**：归档域 MUST 只参与链接检查且降 warning，其余检查不扫。
- **机器行为面**：命令串、exit code 语义、检查开关与启用域以 `openspec/specs/dsh-plugin-toolchain/spec.md` 的「文档件套与文档门禁」requirement 为准；本 ADR 只定义规则本体与本分工。

### 6. 两处边界声明（各一句）

- **N1（`openspec` 工件面）**：`openspec` 的 proposal / design / tasks / specs delta / artifacts / verification 等工件面遵循规划流程的产物约定，本仓不做二次规范。
- **N2（索引页）**：索引页（`docs/README.md` 与各目录索引 README）只链接、不复制摘要。

## Alternatives Considered

| 方案 | 否决理由 |
| --- | --- |
| 强统一 12 节（七包同构、固定节序、逐节检查） | 门禁只能判存在性，判不出内容；无内容的包会为过门禁产出空壳节，把「统一」变成「统一地空」。web-ux 443 行的能力章节会被迫改名或拆分，同文档锚点断裂；multi-root 的 `docs/` 五目录与 13 篇插件级 ADR 是它的内容组织，强同构等于用 README 规范重排其知识体系，越过其 C2 硬边界。软骨架只约束「必备 / 如适用」的存在性与非空，正好落在机械可判的边界内 |
| 纯 spec 载体（全部规则写进 `openspec/specs/` requirement，不建 ADR） | spec 只该承载可验收行为；「为什么这样分层、否决了哪些方案、边界在哪」塞进 requirement 会污染行为规范，且 spec 的 SHALL 面写不出「我们决定不做什么」。仓级约定已成文：结构性决策进 `docs/decisions/`，ADR 只约束仓级结构与工程约定。故取混合载体——决策本体进 ADR，机器行为进 toolchain spec |
| README 内嵌证据（证据留在入口文档，不迁 `artifacts/`） | 入口文档被实证撑爆（project-mcp 53 行、user-commands 39 行）；证据随 README 编辑漂移，且没有任何位置信号可查。两级制 + 一行证据行同时满足「入口可读」与「证据可定位」，证据域豁免绝对路径检查保住读数原文 |
| 直接上移 multi-root 脚本（把 318 行 `check-docs.mjs` 整体搬到仓根，包内删除或改链） | 其 4 个目录常量里 `docs/plans/{active,completed}` 在仓根不存在（该 fork 已移除 `docs/plans/`），整体上移会把死逻辑与活逻辑一起搬；包内 `docs:check` 语义变更越过其 C2 硬边界。正确形态是参数化共享内核 + 双薄入口（多消费者、单实现） |

## Consequences

- **正面（单一出处）**：文档规则只在 ADR 一处；索引页只链接，副本不再产生；agent 读入口文档时不会随机命中过期副本。
- **正面（开箱合规）**：模板骨架全集 + `gen:plugin` 生成即合规，新插件无需人工对齐节名。
- **正面（可机械验收）**：骨架 / 证据 / 链接 / 禁项各有机械信号，断链与证据漂移不再靠人工盘点。
- **代价（存量清偿）**：七包 README 一次性对齐（节名归一、端性声明、证据迁出）；只动结构与归属，不改文案语义。
- **代价（误报阻塞）**：门禁误报会阻塞 CI。缓解：豁免清单 + 归档域降 warning + 走时自检；新增豁免须留依据。
- **代价（双表达同步）**：ADR 与脚本是同一规则的两种表达，改一处必须同批改另一处；以本 ADR 为准，脚本不一致即漂移。
- **multi-root 骨架是否纳入：取值 = 纳入（无豁免）**。改动成本：`项目简介`→`定位`、`安装`→`安装到 profile`、`许可证`→`许可`、补 `构建与测试` 节、补 `端性：双端` 声明行，并按端性闭环补 `双端结构` 节（细则 3）；同文档锚点（`[安装](#安装)` 类）须人工巡检跟随——同文档锚点不在机械检查面内。其 `docs/` 五目录、13 篇插件级 ADR 与 `.agent/` 知识库不动：骨架只约束 README 的入口节，不重排内容组织。
- **边界**：本 ADR 不改变任何插件运行时行为与产物字节；不重写 README 文案（只动结构与归属）；不把文档门禁并入 `dsh:check`。

## Related Documents

- [docs/decisions/ADR-0001-shared-build-and-source-kits.md](./ADR-0001-shared-build-and-source-kits.md) —— 共享构建与源码包的落地边界（`tooling/` 归属与「单一事实源」先例）。
- [docs/decisions/ADR-0002-attribution-kernel.md](./ADR-0002-attribution-kernel.md) —— 归属内核的值语义与原子索引纪律。
- [docs/decisions/README.md](./README.md) —— 仓级 ADR 的命名、七节骨架与两套编号的引用路径纪律。
- [docs/README.md](../README.md) —— 仓级文档索引页（N2 的落地形态）。
- [openspec/specs/dsh-plugin-toolchain/spec.md](../../openspec/specs/dsh-plugin-toolchain/spec.md) —— 文档件套与文档门禁的机器行为 requirement。
- [docs/assessments/docs-unification.md](../assessments/docs-unification.md) —— 收敛前现状差异、13 处断链、证据三形态与不施工项。
- [AGENTS.md](../../AGENTS.md) —— 仓级约定（目录结构、`docs:check` 挂点、仓级 ADR 域）。
