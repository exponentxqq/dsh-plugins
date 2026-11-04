# Spec Delta

## Purpose

dsh-zcode-plan-request-signing 能力：zcode-plan 路由对 bigmodel coding 端点的出站请求自动附加官方客户端请求签名（握手取得的账户 Ed25519 私钥 + 每请求签名 + PoW），使会话流量命中官方 ZCode 通道的折扣计费（实测刻度比值 ≈0.67），并提供密钥生命周期管理、两级降级（请求级 fail-open / 状态级 degraded 止损）与可观测性。

## ADDED Requirements

### Requirement: 签名握手与账户私钥获取

插件 SHALL 以路由凭证发起 `get_sign_key` 握手（`POST https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`），按官方协议以 HKDF-HMAC 认证凭证、解密服务端下发的账户 Ed25519 私钥（AES-256-GCM 密文，密钥与认证均从凭证派生，AAD 绑定 apiKeyId）。凭证解析 MUST 支持 PAT（三段式 JWT——验收与支持承诺的唯一形态）与裸 API Key（两段式——支持但非承诺），形态判定与派生参数遵循官方客户端实现。握手私钥 MUST 持久化于 dsh-credentials record 体系（scope=`zcode-plan`、id=`bigmodel-signing-key`，与 PAT 同层机密保护；logout 与凭证更换 MUST 联动清理），运行态以内存单槽作快路径。协议常量与算法细节见 design.md D1/D2/D3。

#### Scenario: PAT 握手成功

- **WHEN** 路由凭证为 PAT（三段式 JWT），首次签名请求触发握手
- **THEN** 服务端返回 privateCipher，插件解出 Ed25519 私钥写入 credential record 并缓存内存，后续请求直接签名不再握手

#### Scenario: 握手被拒明确报错

- **WHEN** 握手响应业务码非 200（如 `4011 HANDSHAKE_AUTH_FAILED`）
- **THEN** 该请求按 fail-open 降级为无签名发出，状态面记录 `handshake_failed` 与业务码

### Requirement: 每请求签名与工作量证明

对目标为 `open.bigmodel.cn` 域下 coding 端点的模型请求，插件 SHALL 附加官方签名头组（`X-Client-Sig`、`X-Client-Ts`、`X-Client-Version`、`X-Client-Nonce`、`X-App-Id`、`X-Client-Pow`、`X-Session-Id`）：签名为 Ed25519（换行分隔的消息五元组），PoW 为 8-bit 前导零 SHA-256 求解（challenge 由 apiKeyId/appId/sessionId/ts 派生）。每个请求 MUST 使用全新 nonce 与 ts；PoW 求解 MUST 可中断；签名 MUST NOT 读取或改写请求体。签名消息与 PoW 的精确构造见 design.md D1/D4。签名通道命中时同一请求的扣减刻度 MUST 显著低于无签名直连（验收读数比值 ≈0.5–0.67，不通过即按 design D9 否决本变更）。

#### Scenario: 签名请求命中折扣

- **WHEN** 经 zcode-plan 路由发出带完整签名头组的模型请求
- **THEN** 服务端接受请求（http 200），quota 池扣减与官方 runtime 通道同刻度（≈0.76–0.95），显著低于无签名直连（≈1.5）

#### Scenario: PoW 中断

- **WHEN** 请求在 PoW 求解期间被取消
- **THEN** 求解循环立即停止，不抛出额外副作用

### Requirement: 私钥失效、重握手与两级降级

插件 SHALL 缓存私钥（credential record + 内存单槽 + epoch 防竞态），并在以下情形失效缓存并重握手一次：收到签名校验失败类响应（`VERIFY_SIGNATURE_INVALID`、`VERIFY_APIKEY_EXPIRED`、业务码 `3007`）、凭证更换（PAT 续期后新 token）、插件配置变更。降级语义分两级：**请求级 fail-open**——瞬时故障时重握手后仍失败的请求以无签名形态发出，60s 冷却窗内不重试，冷却结束自动重试握手；**状态级 degraded**——连续 3 次握手失败后 SHALL 停止自动重试、status 红色警示、并对新请求显式报错（MUST NOT 以无签名形态继续扣池——无签名请求按 ~1.5 刻度计量，高于理论用量 50%）。`/zcode-plan refresh` 或 PAT 轮换 SHALL 重置计数并恢复签名通道。PAT 续期产出新 token 时 SHALL 失效缓存并立即后台预握手（fire-and-forget 不阻塞续期，失败静默、由下次请求懒重握手兜底）。

#### Scenario: 签名被拒后自动恢复

- **WHEN** 某请求因私钥/服务端状态不一致被拒（3007）
- **THEN** 插件丢弃缓存私钥、重新握手取得新私钥重签重发一次；若恢复成功则后续请求继续签名

#### Scenario: 瞬时故障 fail-open

- **WHEN** 单次握手失败（网络抖动类），且失败未达连续 3 次
- **THEN** 该请求以无签名形态发出（服务端仍返回 200），60s 冷却后自动重试握手，全程无需人工介入

#### Scenario: degraded 止损拒绝

- **WHEN** 握手连续失败达 3 次
- **THEN** 插件进入 degraded：停止自动重试，status 红色警示，后续模型请求显式报错而非无签名直发；用户执行 `/zcode-plan refresh` 或 PAT 轮换后计数重置、通道恢复

#### Scenario: PAT 轮换预握手

- **WHEN** pat-owner 续期产出新 token
- **THEN** 旧私钥缓存立即失效，后台 fire-and-forget 预握手（不阻塞续期回执）；预握手成功则下次请求直接带折扣，失败静默、下次请求懒重握手兜底

### Requirement: 签名状态可观测与开关

`/zcode-plan status` SHALL 展示签名通道状态：是否启用、私钥缓存状态（命中/未握手/降级中）、连续失败计数、上次握手时间、上次签名结果；degraded 状态 MUST 以警示样式呈现并附恢复方法。插件 SHALL 提供 `signing` 配置项（默认启用）；关闭时路由退化为纯直连（无签名头组），凭证链与其他命令面不受影响。

#### Scenario: status 可见签名状态

- **WHEN** 路由已签名完成至少一次请求后执行 `/zcode-plan status`
- **THEN** 状态面含签名通道行（如「签名通道：已启用 · 私钥缓存命中 · 上次签名 200」）

#### Scenario: degraded 警示可见

- **WHEN** 插件处于 degraded 状态时执行 `/zcode-plan status`
- **THEN** 状态面以警示样式显示连续失败计数与恢复方法（`/zcode-plan refresh`）

#### Scenario: 关闭开关退化为直连

- **WHEN** 配置 `signing` 关闭并重载
- **THEN** 后续模型请求不携带任何签名头组，行为与 zcode-plan-bridge 变更定义的基线路由一致
