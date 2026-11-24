# 变更提案：版本事实单源化（single-source-version-facts）

## Why

四类版本事实散落多处、随版本移动而漂移：发布版本要在发版时同步八个清单；DSH 基线在 multi-root 运行时门持有一份由升级脚本按首个文本位置重写的同值字面量副本；活文档（README / AGENTS / spec / 排障）里约 90 处具体版本号已大面积过期且无门禁；zcode-plan 的 `route install` 全量归一 profile 层路由，会冲掉用户手改的 `models`。决策与取舍记录见仓级 `docs/decisions/ADR-0004-single-source-version-facts.md`。

## What Changes

- **发布版本单点**：全部插件 `version` 恒 `0.0.0`，`pnpm release` 只写根清单 + 重建 `lib/` + 打 tag；`dsh:check` 新增第 11 项守契约。
- **基线常量唯一**：multi-root 运行时门直接 import 仓根单源（构建期内联）；`repointRuntimeBaselines` 退役；`dsh:check` 新增第 10 项拦第二处字面量并断言 import 形态。
- **活文档零版本字面量**：文档门禁新增第 15 项 `version-literals`（双入口启用、记录域豁免），一次性清零全部活文档并把历史边界收口到新建的根 `CHANGELOG.md`；内核自检补四类样本。
- **模型清单 profile 优先**：`route install` 改为只补缺失键、绝不覆盖 profile 已声明键（含手改 `models`），幂等判据改为合并结果深等；`status` / `route status` 按「profile 声明优先」实读展示；模型目录恢复 glm-5.4 / glm-5.3 / glm-5.3-flash 三条（glm-5.3 已恢复可用，撤回 retire-glm-5-3 的目录收窄）。

## Impact

- Affected specs: `dsh-baseline`、`dsh-plugin-toolchain`、`dsh-zcode-plan`
- Affected code: `scripts/dsh-baseline.mjs(.d.mts)`、`scripts/upgrade-dsh.mjs`、`scripts/check-dsh-baseline.mjs`、`scripts/release.mjs`、`scripts/gen-plugin.mjs`、`scripts/lib/doc-checks*.mjs`、`scripts/check-docs.mjs`、`plugins/multi-root-workspace/{src/compat,scripts}`、`plugins/zcode-plan/src/host/{route-config,status,index,commands}.ts`、七插件 `package.json`、根 `CHANGELOG.md`（新建）、`docs/decisions/ADR-0004`（新建）
- 本变更不发布、不打 tag；`openspec-archive-change` 留待复核后执行。
