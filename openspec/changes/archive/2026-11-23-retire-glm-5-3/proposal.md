# Proposal

## Why

GLM-5.4 于 2026-11-23 上线 GLM Coding Plan 后，`glm-5.3` 在 coding 端点持续返回 `1305 该模型当前访问量过大`，已不可作为回退；`glm-5.3-flash` 仍正常。上一变更（`add-zcode-plan-glm-5-4`）把单一真源扩为三条 models（glm-5.4 / glm-5.3 / glm-5.3-flash）并保留 5.3 作回退，现该回退位已失效，继续保留会：

- 让 `/zcode-plan status` 与 `route install` 写出的目录里带一个必然 1305 的条目；
- 与 profile 侧已清理后的两模型目录不一致，`route install` 会把它写回。

## What Changes

- 单一真源 `ZCODE_PLAN_ROUTE.models` 移除 `glm-5.3`，保留 `glm-5.4`（置首）与 `glm-5.3-flash` 两条。
- 由单一真源派生的 status 文本、README/docs 样例、`compose-check.mjs` 的 models 数量断言同步为两条。
- 模块 JSDoc 与文档叙述去型号化（角色化描述），不再逐处钉模型版本。
- 折扣对拍脚本默认模型保持当前旗舰，注释去型号。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-zcode-plan`: 「zcode-plan 路由的 profile 层注册」的模型目录约定由三条（glm-5.4 / glm-5.3 / glm-5.3-flash）收窄为两条（glm-5.4 / glm-5.3-flash），`glm-5.4` 仍置首并带图片输入。

## Impact

- 代码：`plugins/zcode-plan/src/host/route-config.ts`（单一真源）。
- 测试：`test/route-config.test.ts`、`test/status.test.ts`、`test/commands.test.ts`、`scripts/compose-check.mjs`。
- 文档：`plugins/zcode-plan/README.md`、`docs/migration-from-zai-coding-zcode.md`。
- 产物：`plugins/zcode-plan/lib/index.js` 重建。
- 对外可见性：`/zcode-plan status` 与 `route status` 的模型清单显示两条；`route install` 写入的 `providers['zcode-plan'].models` 两条；不改 `agent-default-model`，不改凭证与签名协议。
- 兼容性：非破坏性收窄；既有 profile 若仍是三条，`route install` 会按新常量重写该键一次（只覆盖本键）。
