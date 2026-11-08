# 评估档案（Assessments）

本目录存放**评估档案（非 ADR）**：记录某个仓级结构面的现状、差异与「暂不施工」的依据，**不做决策、不约束实现**。

- 决策与约束只看 [`docs/decisions/`](../decisions/README.md)（ADR）与 `openspec/specs/`（规范）；评估结论若将来升级为决策，应新建 ADR，并从本目录回链。
- 评估属仓级结构面、寿命长于单次变更，因此不放进 `openspec/changes/<change>/` 随变更归档。
- 每份档案的固定骨架：现状差异清单 / 不迁移理由 / 迁移通过标准 / 结论。本目录不裁定「采纳某个方案」。

## 索引

| 档案 | 主题 | 结论 | 状态 |
| --- | --- | --- | --- |
| [multi-root 构建统一化评估](./multi-root-build-unification.md) | `multi-root-workspace` 的 `tsc + tsdown` 自有构建链是否并入 `@dsh-plugins/build-kit` | 暂不施工（可接受约束）；迁移窗口 = 该插件下一次功能性重构 | 现行（2026-11-07） |
| [文档统一与最优架构收尾评估](./docs-unification.md) | 仓内文档相对统一规范与最优架构收尾的现状差异清单、不施工项与 D-12 豁免盘点 | 三项不施工（详见档案）；其余差异由 `docs-arch-refinement` 施工 | 现行（2026-11-07） |

## 附属数据

- [`multi-root-baseline/`](./multi-root-baseline/) —— B6 迁移等价基线：7 份插件产物模块词快照，由 `node scripts/check-artifacts.mjs --write-baseline docs/assessments/multi-root-baseline` 冻结、`--baseline` 比对。它是 `multi-root-build-unification.md`「迁移通过标准」的锚点，不单独构成结论。
