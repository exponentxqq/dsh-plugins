# Proposal

## Why

智谱于 2026-11-23 把 **GLM-5.4** 上线 GLM Coding Plan（1M 上下文、新增视觉能力、额度 1.5 倍），同日实测 `glm-5.3` 在 coding 端点稳定返回 `1305 该模型当前访问量过大`（一次 60s 无响应），`glm-5.3-flash` 仍正常。插件把路由模型目录写死在单一真源 `ZCODE_PLAN_ROUTE` 里，只声明 `glm-5.3` / `glm-5.3-flash`，于是：

- 用户无法通过 `zcode-plan` 路由选到当前唯一可用的旗舰模型 `glm-5.4`；
- `route install` 每次都会把 profile 里已手工加的 `glm-5.4` 覆盖回旧列表（单一真源即事实源，不能只改一处）。

## What Changes

- 单一真源 `ZCODE_PLAN_ROUTE.models` **新增 `glm-5.4` 并置首**（1M 上下文 / 131072 输出 / `input: text+image` / thinking 四档 / `compat` 与原两条一致）；`glm-5.3`、`glm-5.3-flash` 保留，作为回退。
- 由单一真源派生的 `/zcode-plan status`、`/zcode-plan route status` 模型清单随之变为三条；`README` 的 status 样例与「手工路由 YAML」降级路径同步。
- 折扣对拍脚本 `scripts/gen.mjs` / `scripts/replicate-sign-pat.mjs` 的默认模型改 `glm-5.4`（旧默认 `glm-5.3` 已被 1305 挡死，对拍无法复现）。
- 新增证据档 `artifacts/glm-5-4-availability-2026-11-23.md`，把 2026-11-23 的直连探测（在册/推理/视觉/thinking/`max_tokens` 边界）落盘。
- 明确不含：profile 层用户配置（`zai-coding-cn` 目录、`spec-workflow.yaml` 阶段路由）与发布动作——那是本变更落地后的用户侧配置与发版步骤，不在插件仓库内。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-zcode-plan`: 「zcode-plan 路由的 profile 层注册」这一 Requirement 的模型目录约定由两条（glm-5.3 / glm-5.3-flash）扩为三条（glm-5.4 / glm-5.3 / glm-5.3-flash），并声明 `glm-5.4` 带图片输入。

## Impact

- 代码：`plugins/zcode-plan/src/host/route-config.ts`（单一真源）、三个单测文件、`scripts/compose-check.mjs` 的 models 数量断言、两个折扣脚本。
- 文档：`plugins/zcode-plan/README.md`、`docs/migration-from-zai-coding-zcode.md`、新增 artifacts 证据档。
- 产物：`plugins/zcode-plan/lib/index.js` 重建（随仓库提交）。
- 对外可见性：`/zcode-plan status` 与 `route status` 的模型清单文本变化；`route install` 写入的 `providers['zcode-plan'].models` 变成三条；不改 `agent-default-model`，不新增依赖，不动凭证与签名协议。
- 兼容性：非破坏性增量；旧 profile 的 `route install` 幂等短路因模型增多而失效一次，会重写该键（只覆盖本键，保留其它路由与注释）。
