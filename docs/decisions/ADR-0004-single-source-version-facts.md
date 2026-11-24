# ADR-0004: 版本事实单源化（发布版本单点、基线常量唯一、活文档零版本号、模型清单 profile 优先）

## Status

Accepted（2026-11-24）。

## Date

2026-11-24

## Context

仓库此前有四类「版本事实」散落多处的漂移风险：

1. **发布版本**：根 `package.json` 与七个插件的 `package.json#version` 在每次发布时由 `scripts/release.mjs` 同步为同一值。发版要改八个清单；DSH 侧的 `package@version` 豁免键随每次发版换值；插件实际按 tag 安装，manifest 版本从未被独立消费。
2. **DSH 基线**：`scripts/dsh-baseline.mjs` 声明基线常量，multi-root 运行时门（`src/compat/dsh-version.ts`）持有一份「同值字面量副本」，由升级脚本按首个文本出现位置重写——文档里还有约 20 处过期的具体版本号（如曾写 `0.2.2-rc.1`，实际基线已到 `0.2.2-rc.5`），活文档与单源事实漂移。
3. **活文档版本号**：README / AGENTS / spec / 排障文档里写死具体版本号（基线值、派生范围、依赖 pin、历史 tag），版本一抬就整体过期，且无门禁拦截。
4. **zcode-plan 模型清单**：插件把 `ZCODE_PLAN_ROUTE`（含 `models`）整体写入 profile 层 `llm-pi-ai.providers['zcode-plan']`，且 `route install` 每次**全量归一**（profile 手改的 `models` / `baseURL` 会被冲回插件内置值）——用户在 profile 层自定义模型清单会被安装动作覆盖。

另有一项边界确认：子代理显式路由的模型白名单（`subagent-model-selection-settings.allowedModels`）是 **DSH 会话级授权机制**，只有两态——启用时只允许精确路由列表，关闭或未挂载时只允许父会话当前路由；没有 allow-all 形态（核查至上游 `0.2.3-alpha.2`）。spec-\* 工作流文档曾把它误述为工作流自设的约束，已更正出处（dotfiles 仓）。

## Decision

- **发布版本单点**：版本号只写在根 `package.json#version`（tag 风格 `v<版本>`）；全部插件包的 `version` 恒为 `0.0.0`，发布流程 MUST NOT 改写任何插件清单。`dsh plugin list` 显示 `0.0.0`、版本豁免键恒为 `<包名>@0.0.0`、`dsh plugin update <包> <版本>` 不再适用（升级 = 改 spec 里的 tag 重装）——三个代价全部接受。门禁：`pnpm dsh:check` 第 11 项。
- **基线常量唯一**：multi-root 运行时门改为直接 `import { DSH_BASELINE } from 'scripts/dsh-baseline.mjs'`（构建期内联进 `lib/`，运行时仍自包含）；`repointRuntimeBaselines` 退役。仓内代码文件 MUST NOT 存在第二个 `DSH_BASELINE` 赋值字面量，且每个 `src/compat/dsh-version.ts` 必须从单源 import。门禁：`pnpm dsh:check` 第 10 项。
- **活文档零版本字面量**：文档门禁新增第 15 项 `version-literals`——活文档（README / AGENTS / docs 活分区 / openspec specs / tooling / templates）出现完整 semver 字面量即失败，正则排除占位 `0.0.0` 与 IP 地址；记录域（ADR 取证正文、`docs/assessments/`、`.agent/note/`、研究参考、根 `CHANGELOG.md`）按路径子串豁免。历史边界改为引用仓根 `CHANGELOG.md`（新建，只登记活文档仍引用的断点，头注声明版本以 git tag 为准）。
- **模型清单 profile 优先**：`route install` 的合并语义改为「只补缺失键、绝不覆盖 profile 已声明键」——合并顺序 `插件默认 < bundle(inherited) < profile(override)`，逐键后者胜；profile 手改的 `models` / `baseURL` 原样保留，幂等判据改为「合并结果与 profile 当前值深等即跳过」。`status` / `route status` 显示的模型清单按「profile 声明优先、未声明回落插件默认目录」实读。插件内置目录降级为**默认兜底**，不再自称「单一真源」的强制目标。

## Alternatives Considered

- **删除插件 manifest 的 `version` 字段**：DSH 的 `evaluatePluginCompatibility` 在版本要求不满足时读 manifest `version` 组装豁免键与错误信息，缺失即硬抛；不采用。
- **插件各自独立版本**：与「按 tag 单仓子目录安装」的发布模型冲突，且与 tooling 五包 `0.0.0` 约定分叉；不采用。
- **维持发版同步八清单**：每次发布八个文件 diff、豁免键随发版换值、`update` 子命令语义与 tag 锚点重复；收益仅是列表好看，不采用。
- **活文档全量清零（含 ADR 取证正文）**：ADR / 评估档案 / 证据记录里的版本号是**当时事实**，改写即篡改记录；采用记录域豁免而非全量清零。
- **把模型清单搬进 bundle patch**：DSH patch 组合对同 id 条目的 `config` 是整键替换——profile 行的 `config` 会把 bundle 行的 `config` 整个顶掉，bundle 层 `config` 无法与 profile 层共存；且「profile 自定义」本就该写在 profile。不采用。
- **写「放行插件」绕开子代理模型白名单**：机制上只有精确名单与「仅父路由」两态，allow-all 插件只能靠拼装运行时注册表实现且绑定 `subagent/model-selection-policy` 事件契约（上游无承诺）；用户裁定维持现状，白名单手工维护，只在 dotfiles 文档写明出处。

## Consequences

- 发版 diff 从八个清单收敛为一个；`pnpm dsh:check`（11 项）与 `pnpm docs:check`（15 项）分别守住版本契约与文档零字面量。
- 基线提升 = 只改 `scripts/dsh-baseline.mjs` + 跑 `pnpm dsh:upgrade` + 重建受影响插件 `lib/`；运行时副本重写这一步从升级车道消失。
- 活文档不再出现会过期的版本号：当前值一律「看 `pnpm dsh:check` 首行 / 根清单」，历史时点一律「看 git tag / 根 `CHANGELOG.md`」。
- zcode-plan 的 profile 自定义模型成为受支持主路径（README「手工路由 YAML」节已标注）；插件升级不再破坏用户自定义清单。
- 子代理白名单保持手工维护；把新模型加进 profile 路由后，要被子代理显式选中仍需同步加进 `allowedModels`（dotfiles 文档已写明）。

## Related Documents

- [ADR-0001](./ADR-0001-shared-build-and-source-kits.md) — tooling 五包 `0.0.0` 约定的由来（本 ADR 扩展为全仓契约）。
- [ADR-0003](./ADR-0003-doc-system-layers-and-gates.md) — 文档门禁体系（`version-literals` 为其第 15 项）。
- `plugins/multi-root-workspace/docs/decisions/ADR-0009-dsh-compat-contract.md` — 基线派生软范围与运行时门（本 ADR 改其消费方式为单源 import）。
- `openspec/changes/2026-11-24-single-source-version-facts/` — 本次变更的规范 delta（dsh-baseline / dsh-plugin-toolchain / dsh-zcode-plan）。
- dotfiles `dsh/README.md` — 子代理模型白名单的出处与两态语义（DSH 会话级授权）。
