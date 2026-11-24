# Spec Delta

## MODIFIED Requirements

### Requirement: zcode-plan 路由的 profile 层注册

`/zcode-plan route install` SHALL 经 dsh 官方配置编辑通道把 `zcode-plan` 路由装配进当前 profile 层的 `llm-pi-ai.providers`（`apiKeyEnv: ZCODE_PLAN_PAT`、`api: openai-completions`、`baseURL: https://open.bigmodel.cn/api/coding/paas/v4`、零指纹 headers、模型目录含 glm-5.4、glm-5.3 与 glm-5.3-flash 且 glm-5.4 置首）。**profile 层的 `cordis.patch.yml` 是路由事实的最终真源**：install SHALL 以「只补缺失键」的合并语义写入——合并顺序为 `插件默认 < bundle(inherited) < profile(override)`、逐键后者胜，profile 已声明的键（含手改 `models` / `baseURL`）MUST NOT 被覆盖；profile 未声明本路由时 SHALL 写入插件默认目录。操作 MUST 幂等（profile 已声明且合并结果与其深等即跳过写盘）且 MUST 保留 profile 配置的既有注释与其他路由条目；`route remove` 只删本插件这一键。路由的 `retryPolicy.retryableCodes` MUST 在适配器默认五码基础上追加 `INVALID_CREDENTIAL`。插件 MUST NOT 修改 `agent-default-model` 或任何用户默认路由选择。`/zcode-plan status` 与 `route status` 的路由行 SHALL 按「profile 声明优先、未声明回落插件默认目录」实读展示生效模型清单。

#### Scenario: route install 只补缺失键不覆盖手改 models

- **WHEN** profile 层 `providers['zcode-plan']` 已声明且 `models` 被用户手改为自定义清单（可缺其他连接键），执行 `/zcode-plan route install`
- **THEN** 手改 `models` 与其余已声明键逐字保留，仅缺失键由默认目录补齐，无键被冲回插件内置值

#### Scenario: route install 幂等且不伤既有路由

- **WHEN** profile 层 `llm-pi-ai.providers` 已有多条路由且 `zcode-plan` 声明装配齐全，执行两次 `/zcode-plan route install`
- **THEN** 合成配置中 `zcode-plan` 路由完整存在（三条模型、retryPolicy 六码）、既有路由条目与注释原样保留，第二次执行不产生写盘

#### Scenario: profile 未声明时写入默认目录

- **WHEN** profile 层无 `providers['zcode-plan']` 键（bundle 层亦未声明），执行 `/zcode-plan route install`
- **THEN** 写入插件默认目录完整路由（含三条模型），`llm.listProviders()` 可见 `zcode-plan`

#### Scenario: route status 展示生效模型清单

- **WHEN** profile 层手改 `models` 为自定义清单后执行 `/zcode-plan route status` 与 `/zcode-plan status`
- **THEN** 路由行显示 profile 声明的清单（如 `已注册（<自定义 id 列表>）`），而非插件内置目录

#### Scenario: 目录含视觉模型

- **WHEN** 用户经 `zcode-plan` 路由选 `glm-5.4` 并发送带图片的请求
- **THEN** 该路由声明 `glm-5.4` 的 `input` 含 image，请求正常受理而非以「不支持图片输入」拒绝

#### Scenario: 续期竞态 401 自愈

- **WHEN** PAT 恰在续期窗口边界过期，一次模型请求以凭据无效失败，而续期循环已发布新 PAT
- **THEN** 重试策略按 `INVALID_CREDENTIAL` 合格码重试该请求并携带新 PAT 成功，无需人工干预
