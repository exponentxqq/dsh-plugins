# Spec Delta

## MODIFIED Requirements

### Requirement: zcode-plan 路由的 profile 层注册

`/zcode-plan route install` SHALL 经 dsh 官方配置编辑通道把 `zcode-plan` 路由写入当前 profile 层的 `llm-pi-ai.providers`（`apiKeyEnv: ZCODE_PLAN_PAT`、`api: openai-completions`、`baseURL: https://open.bigmodel.cn/api/coding/paas/v4`、零指纹 headers、模型目录含 glm-5.4、glm-5.3 与 glm-5.3-flash 且 glm-5.4 置首），操作 MUST 幂等（已有同名同值路由即跳过写盘）且 MUST 保留 profile 配置的既有注释与其他路由条目；`route remove` 只删本插件这一键。路由的 `retryPolicy.retryableCodes` MUST 在适配器默认五码基础上追加 `INVALID_CREDENTIAL`。插件 MUST NOT 修改 `agent-default-model` 或任何用户默认路由选择。

#### Scenario: route install 幂等且不伤既有路由
- **WHEN** profile 层 `llm-pi-ai.providers` 已有 `zai-coding-cn` 等多条路由，执行两次 `/zcode-plan route install`
- **THEN** 合成配置中 `zcode-plan` 路由完整存在（三条模型、retryPolicy 六码）、既有路由条目与注释原样保留，第二次执行不产生写盘

#### Scenario: 目录含视觉模型
- **WHEN** 用户经 `zcode-plan` 路由选 `glm-5.4` 并发送带图片的请求
- **THEN** 该路由声明 `glm-5.4` 的 `input` 含 image，请求正常受理而非以「不支持图片输入」拒绝

#### Scenario: 续期竞态 401 自愈
- **WHEN** PAT 恰在续期窗口边界过期，一次模型请求以凭据无效失败，而续期循环已发布新 PAT
- **THEN** 重试策略按 `INVALID_CREDENTIAL` 合格码重试该请求并携带新 PAT 成功，无需人工干预
