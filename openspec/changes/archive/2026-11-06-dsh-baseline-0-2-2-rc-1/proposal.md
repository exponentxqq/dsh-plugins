# Proposal

## Why

宿主 DSH 已全量升级 `0.2.2-rc.1`(宿主 `/usr/local/bin/dsh`、dsh 容器、会话侧 checkout 三处实测一致),而本仓基线仍钉在 `0.2.1-rc.5`(`scripts/dsh-baseline.mjs:13`):multi-root 的精确 peer 枚举不含新版本,已被 web profile **启动拒绝**(实测 `dsh plugin --profile web list` 报 incompatible、`--dump-config` 中 `multi-root-` 行数为 0,整个 bundle 被跳过);profile 内两个官方包(browser-use / chrome-devtools-mcp@0.2.1-rc.5)同样被拒。需要把整个 workspace 重指到 `0.2.2-rc.1`,恢复并验证全部插件可用。

## What Changes

- **仓库基线 `0.2.1-rc.5` → `0.2.2-rc.1`**:基线常量、七插件全部 `@deepseek-ai/dsh*` devDeps、cordis devDep `4.0.5 → 4.1.0`、schemastery devDep `3.18.5 → 3.19.0`(三插件)、六个软插件 `dsh.engines.dsh` 与全部 DSH peer 改为 `>=0.2.2-rc.1 <0.3.0`、`pnpm-workspace.yaml` 豁免清单重指与 lockfile 全量重装。
- **BREAKING**:multi-root 支持矩阵(`SUPPORTED_DSH_RELEASES` 与 21 项 DSH peer 枚举)从 11 项**裁剪**为 3 项(`0.2.1-rc.2 / 0.2.1-rc.5 / 0.2.2-rc.1`)——0.1.x 与 0.2.0 宿主不再受支持(宿主已全量 0.2.2-rc.1,旧项是未再使用的回滚声明负担;收敛决策见 decisions.md Q4/Q5)。
- **升级脚本增强**:`upgrade-dsh.mjs` 新增 schemastery 版本的候选树推导(`schemasteryRequiredBy`,与既有 `cordisRequiredBy` 同构),自动重写三插件 devDep 与豁免行(落档分歧点 Q-C 已决)。
- **zod 保持 `4.4.3` 不升**:契约伙伴 `dsh-storage-domain@0.2.2-rc.1` 与 `dsh-session-projection@0.2.2-rc.1` 仍声明 `4.4.3`(宿主树顶层 4.6.7 来自 `^4.4.3` 声明者,与本仓插件无关)。
- **文档同步**:multi-root AGENTS(H3)/README 双语/ADR-0009(追加裁剪+提升记录节)/开发工作流/.agent/note 双语;根 README.md 与 AGENTS.md 基线行顺带修正历史漂移(仍写 0.2.1-rc.2)。
- **web profile 官方包升级**:`dsh plugin add --save-exact` 把两个官方包升 `0.2.2-rc.1`,目标 profile 整体零 incompatible;**不发版、不打 tag、不重装 acp/headless**(只装 project-mcp@1.1.1 软范围插件,兼容新宿主)、不动 10 个第三方包。

## Capabilities

### New Capabilities

- `dsh-baseline`: DSH 基线管理行为——基线常量的唯一来源与派生规则(软插件安装范围)、multi-root 精确支持矩阵与 peer 枚举的一致性契约、发布年龄豁免与 lockfile 的对账、升级脚本对 cordis/schemastery 的候选树推导规则。支持矩阵裁剪(11→3)是该能力首次落规格的对外可观察变化。

### Modified Capabilities

(无——既有 11 项能力在受支持宿主上的行为要求均不变;本变更不触碰其 requirements。)

## Impact

- **代码与配置**(全部根仓):`scripts/dsh-baseline.mjs`、`scripts/upgrade-dsh.mjs`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`(全量重装)、七个插件 `package.json`、`plugins/multi-root-workspace/src/compat/dsh-version.ts`、四个插件的 `lib/` 产物重建(multi-root compat 面 + 三个 schemastery 内联包);检查器与测试**零改动**(期望值全部从 allowlist 派生)。
- **文档**(根仓):multi-root 子包六处 + 根 README/AGENTS.md。
- **仓外**(profile 数据目录,非仓库文件):web profile 两个官方包依赖行 + pnpm-lock + node_modules。
- **验收口径**(分歧点 Q-B):本仓七插件 + 两官方包零 incompatible;第三方包只记录不升级。
- **执行环境**(分歧点 Q-F):pnpm 验证命令统一在 dsh 容器内执行(容器 node 24.21.0 满足 dsh `engines.node >=24.9.0`;宿主包装链 volta 22.18.0 偏差只记录+兜底)。
