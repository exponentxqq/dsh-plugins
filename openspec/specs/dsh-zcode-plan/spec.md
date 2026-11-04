# dsh-zcode-plan Specification

## Purpose
dsh-zcode-plan 能力：以官方 ZCode 客户端等价的登录凭证链（OAuth 登录 JWT → usageScene:1 专用 Key → `clientType:"zcode"` Project Access Token）桥接 bigmodel.cn GLM Coding Plan，使 dsh 会话经 `zcode-plan` 路由命中折扣计费通道，并提供凭证全生命周期管理与可观测性。

## Requirements

### Requirement: bigmodel OAuth 登录引导

插件 SHALL 注册 dsh-authorization flow 并经 `/zcode-plan login` 命令发起登录尝试：构造 `appId=zcode`、带 `state` 校验的 bigmodel.cn 授权 URL，经 flow notice 出示该 URL；登录完成路径 SHALL 支持「127.0.0.1 一次性回调服务器」与「用户粘贴回调 URL」两种形态赛跑，先到者胜、另一方立即撤销。授权码换取的登录 JWT 与 org/project 身份 MUST 存入 dsh 凭据存储的插件自有 record（kind grant），且登录 JWT MUST NOT 用于直接发起模型请求（仅管理面：列/建 Key、换 PAT、读用量）。

#### Scenario: 粘贴回退登录（容器拓扑主路径）
- **WHEN** dsh 宿主在容器内、浏览器回调不可达，用户在浏览器完成授权后把含授权码与 state 的回调 URL 粘贴给 `/zcode-plan login`
- **THEN** flow 校验 state 通过、以授权码换取登录 JWT、record 落盘，`/zcode-plan status` 显示已登录

#### Scenario: state 不匹配拒绝
- **WHEN** 回调或粘贴的 URL 携带的 `state` 与本次尝试生成的不一致
- **THEN** 该次登录尝试以明确错误结算，不换取 JWT、不落任何 record

### Requirement: 专用 API Key 的 find-or-create

插件 SHALL 在账号 API Key 列表中按「名称 === `zcode-plan-bridge` 且 `usageScene === 1`」双条件查找专用 Key；命中即复用其 keyId，未命中则创建（`{name: 'zcode-plan-bridge', usageScene: 1}`）。插件 MUST NOT 读取、修改或删除任何非本插件创建的 Key（含存量同名 `zcode-api-key`——本账号该 Key 为 usageScene:3、无折扣）。Key Secret MUST NOT 落盘：仅 keyId 持久化于登录 record。

#### Scenario: 存量同名 scene=3 Key 不误用
- **WHEN** 账号内已存在名为 `zcode-api-key`、usageScene=3 的旧 Key，且不存在 `zcode-plan-bridge`
- **THEN** 插件新建 usageScene=1 的 `zcode-plan-bridge` Key，存量 Key 保持原值原 scene 不被改动

#### Scenario: PAT 签发端点对已存 keyId 返回 404
- **WHEN** PAT 换发因 keyId 失效（如 Key 被人在控制台删除）而 404
- **THEN** 插件作废本地 keyId 并重查重试一轮；仍失败则以明确错误终止，不静默复用旧 PAT

### Requirement: PAT 生命周期与引用发布

插件 SHALL 维护 PAT 生命周期：以登录 JWT 换发（`clientType:"zcode"`，效期以服务端返回的绝对到期时间为准，缺省 18000s）；到期前提前刷新（默认 120s + 抖动，Config 可调）；换证失败按官方错误分类容错——网络/超时/429/5xx 在旧 PAT 未过期时复用旧值并退避重试，401/403/404/畸形响应清缓存并以明确错误终止。并发触发 SHALL 合并为单次在途换证；登出后代次隔离 MUST 拒绝迟到的旧结果。当前 PAT 的发布 MUST 只有「写入凭据引用 `ZCODE_PLAN_PAT`」一条写路径，写入后对下一次模型请求即生效、无需重启。

#### Scenario: 换证失败复用未过期旧 PAT
- **WHEN** 提前刷新请求超时（15s 上限），且当前 PAT 距到期仍超过 60s
- **THEN** 凭据引用中的 PAT 保持旧值，退避后重试换证，模型请求全程无感

#### Scenario: 引用热轮换
- **WHEN** PAT owner 发布新 PAT 后立即发起一次模型请求
- **THEN** 该请求携带新 PAT 成功（凭据引用按请求解析，无需重启 dsh）

#### Scenario: 登出后的迟到结果被拒绝
- **WHEN** 用户 `/zcode-plan logout` 后，一次换证请求的响应才返回
- **THEN** 该结果被代次隔离拒绝，不写入凭据引用、不复活任何 PAT

### Requirement: zcode-plan 路由的 profile 层注册

`/zcode-plan route install` SHALL 经 dsh 官方配置编辑通道把 `zcode-plan` 路由写入当前 profile 层的 `llm-pi-ai.providers`（`apiKeyEnv: ZCODE_PLAN_PAT`、`api: openai-completions`、`baseURL: https://open.bigmodel.cn/api/coding/paas/v4`、零指纹 headers、模型目录含 glm-5.3 与 glm-5.3-flash），操作 MUST 幂等（已有同名同值路由即跳过写盘）且 MUST 保留 profile 配置的既有注释与其他路由条目；`route remove` 只删本插件这一键。路由的 `retryPolicy.retryableCodes` MUST 在适配器默认五码基础上追加 `INVALID_CREDENTIAL`（PAT 续期竞态 401 经重试自愈）。插件 MUST NOT 修改 `agent-default-model` 或任何用户默认路由选择。

#### Scenario: route install 幂等且不伤既有路由
- **WHEN** profile 层 `llm-pi-ai.providers` 已有 `zai-coding-cn` 等多条路由，执行两次 `/zcode-plan route install`
- **THEN** 合成配置中 `zcode-plan` 路由完整存在（两条模型、retryPolicy 六码）、既有路由条目与注释原样保留，第二次执行不产生写盘

#### Scenario: 续期竞态 401 自愈
- **WHEN** PAT 恰在续期窗口边界过期，一次模型请求以凭据无效失败，而续期循环已发布新 PAT
- **THEN** 重试策略按 `INVALID_CREDENTIAL` 合格码重试该请求并携带新 PAT 成功，无需人工干预

### Requirement: 状态可观测与机密脱敏

`/zcode-plan status` SHALL 输出五段状态：登录（含 JWT 到期日）、Key（keyId 与 usageScene）、PAT（当前值剩余效期）、路由（注册状态）、用量（5 小时窗口**与周额度**两档余量，标注读数时间戳；读取失败降级为一行说明而非报错）。插件的一切日志、错误消息与状态输出 MUST NOT 包含 JWT、PAT、Key Secret 的任何明文片段（诊断只含错误码、步骤名与脱敏 keyId）；bigmodel 风控信号 405[3012] MUST 按终止性错误处理，不自动重试。

#### Scenario: 状态输出零机密
- **WHEN** 已登录且 PAT 已发布，执行 `/zcode-plan status`
- **THEN** 输出包含五段状态，且全文不含当前 JWT/PAT/Key 的任何子串（以当次真实值做反向断言）

### Requirement: 登出与卸载语义

`/zcode-plan logout` SHALL 删除登录 record 并清除 `ZCODE_PLAN_PAT` 引用，此后经该路由的请求 MUST 以显式凭据缺失失败（MUST NOT 以残留旧值静默成功）。插件卸载/禁用 MUST NOT 主动清除 `ZCODE_PLAN_PAT` 引用（避免重启后首请求凭据缺失窗口）；未过期 PAT 的残留暴露面由凭据存储 0600 权限与 5 小时短效约束。

#### Scenario: logout 后路由显式失败
- **WHEN** `/zcode-plan logout` 完成后经 `zcode-plan` 路由发起请求
- **THEN** 请求以 `MISSING_CREDENTIAL` 类显式错误失败，错误信息不含任何机密片段

#### Scenario: 禁用插件不误删凭据
- **WHEN** 插件被禁用或卸载而用户未执行 logout
- **THEN** `ZCODE_PLAN_PAT` 引用保持原值（下次启动插件可直接复用未过期 PAT）
