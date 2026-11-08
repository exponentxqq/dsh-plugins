# 仓级决策记录（Architecture Decision Records）

本目录存放**仓级** ADR：约束整个 pnpm workspace 的结构性决定（`tooling/` 五包的边界、构建与类型消费形态、归属内核、守护门禁等），而不是某个插件的业务规格。插件业务规格仍以 `openspec/specs/` 为准。

## 两套独立编号：引用 MUST 带路径

本仓存在两套互不干涉的 ADR 编号，二者都各自从 `ADR-0001` 起：

| 编号体系 | 路径 | 约束范围 |
| --- | --- | --- |
| 仓级 ADR | `docs/decisions/`（本目录） | 整个 workspace：`plugins/*`、`tooling/*`、`scripts/*`、CI 与发布面 |
| 插件级 ADR | `plugins/multi-root-workspace/docs/decisions/` | multi-root-workspace 插件内核、DSH 兼容契约及它的下游消费者 |

因此裸写「ADR-0009」是有歧义的：仓级目录没有 ADR-0009；multi-root 的 `ADR-0009` 是 DSH 兼容性代码契约（精确 peer/allowlist）。引用 MUST 写成带路径的形式，例如：

- `docs/decisions/ADR-0001-shared-build-and-source-kits.md`
- `plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md`

两套编号各自递增、互不预留、互不重编号：新增仓级 ADR 不改动 multi-root 的编号，反之亦然。跨体系引用（例如某条仓级决策修订了 multi-root 的某条结论）同样 MUST 带路径，并在新 ADR 内写明修订关系。

## 索引

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| [ADR-0001](./ADR-0001-shared-build-and-source-kits.md) | 共享构建与源码包（`tooling/` 五包）的落地边界：构建期内联与单装安全、五包职责、被否方案；含 **D-15 contracts 权威转移对归档 D4 的修订记录**、**2026-11-07 测试接线底座修订（`/vitest` 工厂、vitest 仅 devDep）**、**2026-11-08 client-kit 入列修订** | Accepted（2026-11-06） |
| [ADR-0002](./ADR-0002-attribution-kernel.md) | 归属内核：`#3`（`roots[0] ≠ primaryRoot`）值语义裁定、索引原子替换纪律、未命中策略保留在调用方 | Accepted（2026-11-06） |
| [ADR-0003](./ADR-0003-doc-system-layers-and-gates.md) | 文档体系分层 ownership（入口/参考/证据/规格/决策/评估）、README 软骨架 4+5 节（七包统一）、证据两级制与行文法、门禁 6 查项与「规则在文档、脚本只机械执行」分工 | Accepted（2026-11-07） |

## 评估档案（非 ADR）

`docs/assessments/` 存放**评估档案**：记录某个仓级结构面的现状差异、不施工理由与未来通过标准，**不做决策、不约束实现**——决策与约束仍只看本目录的 ADR 与 `openspec/specs/`。评估结论若将来升级为决策，应新建 ADR 并从评估档案回链；当前索引见 [`docs/assessments/README.md`](../assessments/README.md)。

## 命名与维护

- 文件名：`ADR-<四位编号>-<小写中划线标题>.md`；编号在本目录内单调递增，不复用。
- 每篇 MUST 含：Status / Date / Context / Decision / Alternatives Considered / Consequences / Related Documents。
- 只有做出真实决策时才新建文件；未决讨论与提案留在 `openspec/changes/`，不预先创建空 ADR。
- 新决策推翻或修订旧结论时，新 ADR MUST 写明「修订/取代了哪一篇（带路径）的哪条结论」；被修订的结论若位于已归档的 OpenSpec 变更（不在 ADR 编号体系内），则在新 ADR 内保留修订记录段，并指向归档路径与日期。
- 本目录的 ADR 为简体中文；`SHALL` / `MUST` 等规范关键字保留英文，与 `openspec/` 的写法一致。
