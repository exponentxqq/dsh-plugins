# Proposal

## Why

DSH 已升级到 0.2.1-rc.2。`dsh-plugin-git-graph-multi` 是 `@linxin666/dsh-client-ui-git-graph@0.4.5` 的本地 fork，维护成本高；其宿主实现依赖的 `@deepseek-ai/dsh-invariants` 在 0.2.1 线已停发，且 0.2.1 已移除 invariants 机制。实际使用中该插件提供的是辅助性的多仓分支切换能力，用户确认不再需要，决定整体移除，不寻找替代插件。

## What Changes

- 删除 `plugins/git-graph-multi/` 整个插件（源码、产物、测试、图标、许可证、构建脚本与文档）。
- 删除 OpenSpec 主规格 `openspec/specs/dsh-multi-repo-git-graph/spec.md`（retire 该能力），保留历史归档变更。
- 仓库根 `README.md` / `AGENTS.md` 移除插件条目、许可证说明与规格链接；`project-mcp` / `user-commands` 源码注释中对该插件的引用同步泛化。
- profile 侧从 `dsh.profile.bundles` 与 `dependencies` 移除 `dsh-plugin-git-graph-multi`；不安装替代插件。

## Impact

- **删除**：`plugins/git-graph-multi/**`（含 `lib/`、`icon.svg`、`LICENSE`、`cordis.patch.yml`、测试）。
- **OpenSpec**：本变更以 REMOVED 删除 `dsh-multi-repo-git-graph` 全部 17 条需求并 retire 该能力。
- **构建/依赖**：workspace 少一个包；lockfile 与 `minimumReleaseAgeExclude` 中仅该插件使用的依赖（如 `dsh-invariants`）在后续升级提交中清理。
- **无破坏**：其余四个插件不受影响；git-graph 的 GUI 芯片、Git 图谱、worktree 管理与会话入口随插件消失。
