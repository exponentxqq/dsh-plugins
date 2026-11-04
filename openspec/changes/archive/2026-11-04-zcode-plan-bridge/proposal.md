# Proposal

## Why

dsh 当前经 `zai-coding-zcode` 路由（普通 API Key）使用 bigmodel.cn GLM Coding Plan，按 100% 计费；前序实测（zcode-rate-test 五臂 + PAT 对照）已锁定折扣开关 =「`usageScene:1` 的 API Key + `clientType:"zcode"` 换发的 Project Access Token（PAT）」组合——同款 42k 请求扣 3-4 credits（基线 14-15，约 28%，等效 ~3.5x 额度），且与客户端指纹/UA/端点无关（已证伪）。本变更把这条官方登录凭证链桥接进 dsh，使既有订阅的有效额度显著扩大（以 1.5x 为可期待底线、实测 3.5x 为现状口径，折扣为服务端行为不写入任何逻辑）。

## What Changes

- 新增 host-only 软插件 `dsh-plugin-zcode-plan`（`plugins/zcode-plan/`，bundle 结构对齐既有五插件）：
  - **登录引导**：注册 dsh-authorization flow（`/zcode-plan login` 命令驱动 `begin()`），完成 bigmodel.cn OAuth（appId=zcode、127.0.0.1 一次性回调 + 粘贴回退赛跑）→ `tokenByAuthCode` 换登录 JWT → 存 credentials record（kind grant，含 org/project/keyId）；JWT 只用于管理面，绝不直接发模型请求。
  - **凭证管理**：find-or-create 专用 Key `zcode-plan-bridge`（name + `usageScene===1` 双条件，绝不触碰存量 `zcode-api-key`——本账号该 Key 为 scene=3 无折扣）；PAT owner 按官方契约续期（提前 120s+jitter、错误分类容错、并发合并、15s 超时、代次隔离），到期把当前 PAT 写入凭据引用 `ZCODE_PLAN_PAT`（唯一写路径，热轮换无需重启；Key Secret 不落盘只存 keyId）。
  - **路由注册**：`/zcode-plan route install` 经 `ctx.configEditor.edit()` 写入当前 profile 层的 `llm-pi-ai.providers['zcode-plan']`（幂等、保注释；bundle patch 对同 id 是整份替换、会被用户层静默吃掉——设计线隔离实测证伪了 bundle 层方案，故落点换层）；路由 `api: openai-completions`、`baseURL: https://open.bigmodel.cn/api/coding/paas/v4`、零指纹 headers、`retryPolicy.retryableCodes` 在默认五码基础上追加 `INVALID_CREDENTIAL`（续期竞态 401 重试时自愈）。
  - **状态与安全**：`/zcode-plan status` 五段状态（登录/Key/PAT/路由/用量，用量读数带时间戳）；机密全脱敏（JWT/PAT/Key 不进日志/错误/配置输出）；405[3012] 风控信号终止性处理不重试。
- **迁移**：提供 `zai-coding-zcode` → `zcode-plan` 迁移指南（先核对 `agent-default-model` 指向再决定切换；删除已证无效的 `zai-coding-zcode` 路由块；回退路径 = `zai-coding-cn`）。
- **非目标**：不做客户端指纹伪装（已证伪）；不读官方 ZCode CLI 凭据（`~/.zcode/`）；不做完整 LLM 适配器/反代；MVP 不做多账号/团队 Key/Web 端 UI（phase 2）；不自动切换用户默认路由；headless profile（禁用凭据存储）不适用。

## Capabilities

### New Capabilities
- `dsh-zcode-plan`: zcode-plan 凭证桥插件能力——bigmodel OAuth 登录引导、usageScene:1 专用 Key 的 find-or-create、PAT 生命周期管理与引用发布、`zcode-plan` 路由的 profile 层注册/摘除、状态可观测与机密脱敏。

### Modified Capabilities
<!-- 无：既有五插件能力（dsh-user-commands 等）的 spec 级行为不变；仅仓库 README/AGENTS.md 清单行更新（非 spec 级变更）。 -->

## Impact

- **代码**：新目录 `plugins/zcode-plan/`（15 个宿主源文件 + 7 个包构建文件 + 10 个测试文件，全部新建）；仓库根 `README.md` 与 `AGENTS.md` 插件清单各加一行/处表述修正（根仓）。
- **运行时（仓外，非本仓 diff）**：`~/.dsh/.credentials.yaml` 新增 `refs.ZCODE_PLAN_PAT` 与 `records['zcode-plan/bigmodel-login']`；`~/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai` 条目经 `route install` 增删 `providers['zcode-plan']` 一键（保注释保 `!!js`，不碰 `agent-default-model`）。
- **依赖**：devDeps 精确 pin 基线（esbuild/typescript/vitest/oxlint/@types/node）+ `@deepseek-ai/cordis` + `@deepseek-ai/schemastery`；`engines.dsh >=0.2.1-rc.2 <0.3.0`（`softDshRange` 派生）；运行时零 `@deepseek-ai/*` import（全 `import type`，产物单文件）。
- **上游（只读）**：依赖 dsh-authorization / dsh-credentials(-local) / dsh-llm-pi-ai / dsh-config-editor / dsh-commands 五个 seam 的 0.2.1-rc.2 已交付行为；`scripts/dsh-baseline.mjs` 等仓库脚本无需改动（按目录自动发现）。
- **账号侧**：bigmodel.cn 账号下 find-or-create 一把 `zcode-plan-bridge` Key（usageScene:1）；不删除/改写任何存量 Key。
