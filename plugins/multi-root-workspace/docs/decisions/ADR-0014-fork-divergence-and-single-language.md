# ADR-0014: 中文单语化、终止对外部上游的同步与文档检查薄化

## Status

Accepted

## Date

2026-11-07

## Context

本包的文档体系把每篇 README 与部分正式文档维护为中英两份：`<name>.md` 是中文主版本，`<name>.en.md` 是对照版本，两者被当作同一个逻辑文档、必须同步更新；现状是 10 份 `.en.md`（共 781 行）与同名中文文档成对存在。这套体制的成本与风险已经超过它的收益：

- **成对维护成本**：任何一次文档改动都要同批改两个文件；英文版滞后时，读者看到的不是旧事实，而是与主版本冲突的第二套事实。
- **双入口漂移风险**：机械检查只能判定成对文件是否存在，无法判定两份文档是否同义；中文改一行而英文未改，检查依旧全绿，漂移只能靠人工发现。
- **读者假定不成立**：本包的读者与维护者以中文工作，英文对照版本没有稳定的真实读者，它主要制造同步义务与翻译质量风险。

同时，本包的演进边界需要一个唯一锚点：代码、文档与发布一律以本仓为准，外部上游不构成演进源；读者与维护者据本仓的现状与决定工作，不据任何本仓之外的清单工作。

文档检查存在同样的结构问题：检查逻辑原本由本包 `scripts/check-docs.mjs` 自持（10 项检查），仓内其它包与仓级入口没有第二条使用路径；规则若要跨包共享，只能复制实现，形成「同一规则两处实现、漂移无人发现」的局面。

## Decision

### 1. 全仓单语化：中文是唯一文档语言

本包的长期文档 SHALL 只维护简体中文一份：`<name>.md` 是唯一版本，不再存在 `<name>.en.md` 对照版本，也不再要求任何文档成对维护；英文导航行与语言说明行 SHALL 一并移除。落点：

- 删除 10 份 `.en.md`：`README.en.md`、`docs/README.en.md`、`docs/{architecture,decisions,development,reference,troubleshooting}/README.en.md`、`.agent/README.en.md`、`.agent/note/README.en.md`、`.agent/note/dsh-compat-contract.en.md`；
- `plugins/multi-root-workspace/.agent/skills/documentation/SKILL.md` 删除双语规则与成对维护条款，语言规则收敛为「中文唯一」；
- 各 README 与索引页（`plugins/multi-root-workspace/docs/README.md` 及其五个目录索引）删除英文导航行；
- `plugins/multi-root-workspace/package.json` 的 `files` 白名单删除 `"README.en.md"` 行，发布清单与实际文件一致。

### 2. 终止对外部上游的同步：演进以本仓为准

本包自此 SHALL NOT 同步任何外部上游（本仓之外的代码与文档来源）；代码、文档与发布的演进一律以本仓为准。文档与流程 SHALL 只描述本仓自身的现状与决定，不保留任何外部维护线的叙述面。落点：

- `plugins/multi-root-workspace/README.md`、`plugins/multi-root-workspace/AGENTS.md`、`plugins/multi-root-workspace/.agent/skills/documentation/SKILL.md`、`plugins/multi-root-workspace/docs/development/plugin-development-workflow.md` 的外部上游叙述清零；
- 本 ADR 只登记处置，不登记历史来源；本包的历史事实以本仓 git 历史为准；
- 本条不改变本插件与 DSH 宿主的关系：`deepseek-harness` 仍是插件所扩展的宿主，「不修改上游包」仍是硬约束（落点：`plugins/multi-root-workspace/README.md` 与 `plugins/multi-root-workspace/AGENTS.md`）。

### 3. `docs:check` 薄化为仓级共享内核的消费方

本包的文档检查 SHALL NOT 再有独立实现。唯一实现是仓根 `scripts/lib/doc-checks.mjs`（`runDocChecks(config)`，自检在 `scripts/lib/doc-checks.selftest.mjs`）；`plugins/multi-root-workspace/scripts/check-docs.mjs` 只做三件事：构造本包配置、调用内核（含内置自检）、把错误计数转成退出码。落点：

- 本包启用 7 项检查：`wrong-english-suffix`、`markdown-links`、`absolute-paths`、`agent-note-filenames`、`plan-conflicts`、`adr-names`、`empty-documents`；
- 双语三项 `readme-pairs`、`agent-note-pairs`、`readme-navigation` 随第 1 条退役：内核保留实现，本包配置置 `false`（不删实现，保留「退役后 7 项输出与退役前逐项一致」的回归能力）；
- `plugins/multi-root-workspace/.agent/skills/documentation/SKILL.md` §12 声明「规则正文在文档、检查逻辑只在内核」的分工；
- `plugins/multi-root-workspace/package.json` 的 `docs:check` 脚本保持 `node scripts/check-docs.mjs`，薄入口对调用方零可见变化。

## Alternatives Considered

| 方案 | 否决理由 |
| --- | --- |
| 保留双语、只删英文导航行 | 导航行不是维护成本的来源；两份文档的同步义务与漂移风险依旧存在 |
| 保留 `.en.md` 但不再要求同步 | 等于让英文版变成不可信的过期副本，比没有英文版更糟 |
| 把三事拆成三篇 ADR | 三事同属一次「本包定位」变更，拆开后每篇都要重述同一背景；本目录的 ADR 不为单一实现细节开设 |
| 保留包内自持的检查实现，仓级入口复制一份 | 同一规则两处实现，规则变更必然漂移；这正是本次要消除的结构 |
| 把双语三项的实现从内核删除 | 删除后无法证明「退役后 7 项输出与退役前逐项一致」；保留实现、配置关闭是更可验证的退役 |
| 本包继续启用全 10 项检查 | 单语化后三项检查没有可判定的对象（不存在成对文件与英文导航），继续启用只会让每次删文档都红灯 |

## Consequences

- 正面：10 份英文副本与 10 份中文文档的同步义务归零；每篇文档只维护一份，语言入口的漂移风险消失。
- 正面：检查实现唯一，规则变更只改 `scripts/lib/doc-checks.mjs` 一处；本包入口从数百行收敛为约 40 行的配置 + 调用 + 退出码。
- 正面：检查项数 10 → 7，本包 `docs:check` 输出更短；双语三项的内核实现仍可被其它包或未来的仓级配置启用。
- 代价：英文读者失去对照版本，阅读与贡献必须以中文文档为准；此前的英文副本只能从本仓 git 历史取回，不再作为发布物。
- 代价：`readme-pairs` / `agent-note-pairs` / `readme-navigation` 退役后，新增 `.en.md` 或英文导航行不再被本包机械拦截，回归靠规则文档与评审。
- 代价：`package.json` 的 `files` 必须与删除同批（本次已删除 `"README.en.md"` 行），否则发布清单声明一个不存在的文件。
- 文档后果：本包文档与仓级文档口径一致（中文唯一）；后续新增文档默认中文，不再出现「是否需要英文版」的判断。

## Related Documents

- [ADR-0002：上游耦合策略](./ADR-0002-upstream-coupling-policy.md)（约束的是 DSH 宿主耦合，本 ADR 不改变）
- [ADR-0009：DSH 兼容性从文档约定变成代码契约](./ADR-0009-dsh-compat-contract.md)（宿主兼容契约，本 ADR 不改变）
- [仓级 ADR-0003：文档体系的分层 ownership 与机械门禁](../../../../docs/decisions/ADR-0003-doc-system-layers-and-gates.md)（文档规范与门禁分层的上位规则）
- [文档规则 Skill](../../.agent/skills/documentation/SKILL.md)（规则正文）
- `plugins/multi-root-workspace/scripts/check-docs.mjs`（本包薄入口）
- `scripts/lib/doc-checks.mjs`（文档检查的唯一实现）
- `plugins/multi-root-workspace/package.json`（`files` 白名单与 `docs:check` 脚本）
