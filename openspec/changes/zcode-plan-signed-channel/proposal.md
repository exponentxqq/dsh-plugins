# Proposal

## Why

RE-8 已证明官方「ZCode 1.5 倍用量」真实存在（等效 1.67–2.0x）：折扣判定键是**每请求客户端签名体系**（`get_sign_key` 握手 → 账户绑定 Ed25519 私钥 → 每请求签名 + PoW），与 Key 类型、端点、表层 header 无关；且该体系**零 runtime 内嵌秘密**（密钥材料 = 用户自己的 apiKey，服务端下发账户私钥），纯 Node 协议复刻已实测命中折扣（刻度 0.95 vs 无签名 1.55，比值 0.615 ≈ 0.67 折算）。当前 `zcode-plan` 路由的请求不带签名，按 1.5 计量刻度全价扣减——把签名层做进插件路由，主会话即可透明吃到折扣，无需 spawn 官方 runtime、无需改变任何使用方式。

## What Changes

- 新增**签名协议模块**（host-only）：`get_sign_key` 握手（HKDF-HMAC 认证 → AES-GCM 解密账户 Ed25519 私钥）、私钥缓存与失效重握手、每请求 Ed25519 签名 + 8-bit PoW + nonce/ts 头组；协议常量（握手路径 `/api/paas/c1f3a7e2/v2/client`、KDF salt/info、appId `zcode`）集中管理。
- `zcode-plan` 路由的出站请求包装签名层：目标为 `open.bigmodel.cn` coding 端点的 chat/completions 请求自动签名；凭证支持 PAT（三段式 JWT 解析 apiKeyId）与裸 API Key（两段式 `id.secret`）两种形态。
- 失败路径为**两级降级**（`grill 11-04` 裁决）：请求级 fail-open——握手失败/签名被拒（`VERIFY_SIGNATURE_INVALID`/`3007`/`VERIFY_APIKEY_EXPIRED`）→ 失效缓存重握手一次 → 仍失败该请求以无签名形态发出（请求仍 200），60s 冷却自动重试；状态级 degraded——连续 3 次握手失败 → 停止自动重试 + 路由**拒绝新请求**（无签名直发按 ~1.5 刻度白扣，比直连更贵，止损优先），`/zcode-plan refresh` 或 PAT 轮换恢复。
- 私钥持久化于 dsh-credentials record 体系（与 PAT 同层机密保护；私钥单独泄露无害——Authorization 是 PAT）。
- `status` 命令新增签名通道状态行（私钥缓存命中/连续失败计数/上次握手时间/上次签名结果/degraded 警示）。
- 配置项 `signing`（默认开启，可关闭回退纯直连）。
- README 原理句与折扣复测口径按「签名通道实测折扣」改写；acceptance 增补复刻签名通道刻度读数。
- **验收否决线**：PAT 刻度验收不通过（比值未落 0.5–0.67）= 本变更否决、代码不合入主线——产品底线：没有 1.5x 本变更无存在意义（无签名直连恒 ~1.5 刻度，比理论用量多扣 50%，签名命中后 ~0.76–0.95，插件成败差 ≈2 倍额度）。

## Capabilities

### New Capabilities

- `dsh-zcode-plan-request-signing`: zcode-plan 路由请求的官方客户端签名体系——握手取账户私钥、每请求签名与 PoW、密钥缓存与失效重握手、fail-open 降级、可观测性与开关。

### Modified Capabilities

（无——`zcode-plan-bridge` 变更（未归档）定义的 `dsh-zcode-plan` 能力面（login/Key/PAT/route/status 命令与凭证链）需求不变；签名层是叠加的新能力，归档时两变更 specs 并存。）

## Out of Scope

- 驱动官方 ZCode runtime 派活（`zcode_task` 工具/子进程派发）——用户已选定优先透明路由；若签名通道日后被服务端收紧，此形态作为后续变更再议。
- 修改官方客户端、提取 runtime 内嵌秘密（本协议无可提取物）、伪装 UA/TLS 指纹。
- anthropic 端点（`/api/anthropic`）签名支持——插件路由当前只用 coding 端点；协议层留扩展位，不实现不验证。
- 握手路径版本 hash（`c1f3a7e2`）变更时的自动发现——常量集中管理 + 明确报错，人工跟进升级。
