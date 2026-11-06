# Proposal

## Why

`optimize-architecture`（cee8150）之后，multi-root-workspace 是仓内唯一保留「精确版本 allowlist + 精确 peer 枚举 + 升级脚本豁免」的依赖管理例外，用户裁定不再保留；同时 gen-plugin 的模板素材住在 `tooling/template/`（与「日后多模板」的演进方向不匹配），仓内还有一批已弃用的磁盘残留与委托 shim。

## What Changes

- **multi-root 并入统一依赖管理（BREAKING）**：`catalogs.dsh` 扩容 22 条（31→53）；multi-root 36 条 `@deepseek-ai/*` devDeps 全改 `catalog:dsh`；21 条 DSH peers 改基线派生软范围 `>=0.2.2-rc.1 <0.3.0` 并**新增** `@deepseek-ai/dsh` peer（共 22 条 + cordis）；补 `dsh.engines.dsh`；根 `upgrade-dsh`/`check-dsh-baseline` 删全部 multi-root 特判。
- **运行时门彻底范围化（BREAKING，用户裁定）**：删 `SUPPORTED_DSH_RELEASES` 精确台账与 `DSH_MULTI_ROOT_COMPAT=warn` enforcement；`classifyInstallation` 改「release 满足派生软范围即放行」；公开导出面删 `SUPPORTED_DSH_RELEASES` / `SupportedDshRelease` / `CompatEnforcement`，新增 `DSH_BASELINE` / `SUPPORTED_DSH_RANGE` / `isSupportedDshRelease`；ADR-0009「先探测后放行」契约被推翻并 append-only 留痕，探测车道降级为回归验证。**代价（已知情裁定）**：未探测的 0.2.x 预发布将自动获得放行；0.2.1-rc.2 / 0.2.1-rc.5 失去 peer 声明（再裁剪两条）。
- **模板外迁**：`tooling/template/` → 顶层 `templates/default/`（git mv），新增 `templates/README.md`（多模板约定）与每模板自述清单 `template.json`（gen-plugin 的 FILE_TABLE 外移），gen-plugin 增 `--template` 参数（默认 `default`）；AR7 禁止条目改 `templates`/`templates/*`；dotfiles dsh-plugin-writer skill 6 处路径同步（执行期单独 commit）。
- **冗余清理**：删 9 个 `*.tsbuildinfo` 本地残留（全部 ignored）；删 multi-root 已弃用 `scripts/upgrade-dsh.mjs` 委托 shim（ADR-0009 追加 fork 注）。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `dsh-baseline`：删「multi-root 精确支持矩阵」requirement，新增「multi-root 软范围放行」；「peer 枚举与 allowlist 一致」更名并改写为「multi-root peer 与软范围一致」；「基线常量唯一来源与软范围派生」的适用面从「六个软插件」扩到「全部插件」；「升级脚本候选树推导」删「MUST NOT 改动 multi-root」子句、改为同批重指运行时基线副本。
