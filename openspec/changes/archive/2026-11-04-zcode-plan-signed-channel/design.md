# Design

## Context

zcode-plan-bridge 变更（未归档）已交付凭证链（login → scene=1 Key → PAT → 路由注册 → 回退），路由出站 = 纯 HTTP Bearer 直连 coding 端点。RE-8 实验链（`/home/docker/.cache/zcode-rate-test/`）已证明：

1. 折扣判定键 = 每请求客户端签名体系（非凭证/端点/表层 header）：`get_sign_key` 握手 → 账户绑定 Ed25519 私钥（AES-GCM 密文下发）→ 每请求 Ed25519 签名 + 8-bit PoW。
2. 体系零 runtime 内嵌秘密——密钥材料 = 用户自己的凭证（HKDF salt/info 为公开常量），私钥由服务端按账户下发、按账户绑定（AAD=apiKeyId）。
3. 纯 Node 复刻（`replicate-sign.mjs`，不依赖官方 runtime 进程）实测命中折扣：刻度 0.95/1.07 vs 无签名 1.55/1.43，比值 0.615。
4. 服务端 fail-open：无签名/签名失败请求仍 200（只是无折扣），官方 runtime 自身也采用「握手失败→无签名发出」降级。

现有代码面：`src/host/bigmodel/client.ts`（PAT 签发）、`endpoints.ts`（端点常量）、`envelope.ts`（业务码包装）；路由注册在 `route-config.ts`（llm-pi-ai providers 注入）；PAT 续期在 `pat-owner.ts`。

**接入点事实（0.2.1-rc.2 源码核实，11-04）**：dsh-llm-pi-ai 的 adapter（`streamWithSnapshot`）以静态 `profile.headers` 调 pi-ai `streamSimple`，fetch 固定 globalThis.fetch——pi-ai 底层虽支持 `options.fetch`/`onPayload` 每请求钩子，但 adapter 未透传，provider 条目 schema 亦无钩子通道。改 adapter = 改 DSH 基线包，超出插件边界。故 fetch 包装的**唯一可行路径 = 插件内包一层 globalThis.fetch + 严格 URL 匹配**。签名材料全部客户端自持（apiKeyId/ts/nonce/sessionId 均自造），不需要读改请求体，同步注头即可、不碰流。

## Goals / Non-Goals

**Goals**

- zcode-plan 路由的 coding 端点请求自动携带官方签名体系，主会话透明命中折扣。
- 私钥持久化于 dsh-credentials record 体系（与 PAT 同层保护）；握手/签名/PoW 全异步且可取消。
- 验收与支持承诺**唯一覆盖 PAT 形态**（`grill 11-04` 裁决：PAT 是插件主凭证与推理路由唯一凭证源）；裸 Key 两段式解析代码保留作逃生门，标注「支持但非承诺」，不背验收责任。
- 产品底线（`grill 11-04` 用户裁决）：**没有 1.5x 折扣本变更即无存在意义**——无签名直连恒按 ~1.5 刻度扣池（比理论多扣 50%），签名命中后 ~0.76–0.95 刻度，插件成败差 ≈2 倍额度。

**Non-Goals**

- 不驱动官方 ZCode runtime（派活形态已按用户裁决搁置）。
- 不伪装 UA/TLS 指纹/请求体——签名体系之外零客户端模仿。
- 不做握手路径版本 hash（`c1f3a7e2`）的自动发现与升级热切换——常量集中 + 明确报错。
- 不支持 anthropic 端点签名（路由未用；协议模块留端点无关设计，便于日后扩展）。

## Decisions

### D1 协议模块独立成 `src/host/bigmodel/signing.ts`，路由层以 fetch 包装接入

签名协议（握手/派生/解密/签名/PoW）收敛为纯函数模块 + 一个 `Signer` 状态对象；接入方式为 globalThis.fetch 包装（唯一可行路径，见 Context 事实），以 Symbol 标记守卫防插件热重载/宿主重启叠层；只对 `open.bigmodel.cn` 域且 path 以 coding 前缀结尾的 POST 请求签名，其余透传；包装层内部握手走原始 fetch（防递归拦截）。**理由**：协议自成一体便于单测（全部用固定向量/伪造服务端）；接入点唯一（全局包装一处），不动 login/Key/PAT 管理面。
**被否**：① 在 llm-pi-ai provider 注册层做（层次错位，凭证与传输耦合）；② 复刻官方 `ClientRequestSigningV4Manager` 的全部抽象（scope/dispose/observer——单凭证单 origin 场景过设计）。

### D2 凭证解析双形态，PAT 为一等公民

`parseCredential(cred)`：两段式 `id.secret` → `{apiKeyId: id, ikm: secret, field: "apiKey"}`；三段式 JWT（PAT）→ 解 payload 取 `api_key` 字段为 apiKeyId，`ikm = 完整 token`，`field: "accessToken"`（对齐官方 `nPr` 解析）。PAT 续期（token 更换）MUST 使签名缓存失效。
**注意**：官方实现中 PAT 分支 payload 解析失败时静默不签名——本设计改为明确报「凭证形态不可签名」并降级，避免静默丢折扣。

### D3 私钥持久化（dsh-credentials record 体系）与失效：单槽 + epoch 计数

私钥**落盘**（`grill 11-04` 裁决，推翻早期「仅驻内存」）：存 dsh-credentials record（scope=`zcode-plan`、id=`bigmodel-signing-key`，与 PAT/login grant 同一存储层机密段）——保护面现成，重启 profile 免重握手。安全分析：私钥单独泄露无害（Authorization 是 PAT，私钥离 PAT 无法发起任何请求），落盘风险≈0；logout/凭证指纹更换时随 grant 联动清理。运行态仍配内存单槽 `{privateKey, epoch}` 快路径；失效源 = 签名被拒类响应（`VERIFY_SIGNATURE_INVALID`/`VERIFY_APIKEY_EXPIRED`/3007）、凭证更换、手动 invalidate。重握手一次内联于失败请求的重试路径（对齐官方「失效→重握手→重签重发一次」）。
**理由**：官方 keyCache 是多 provider 多 key 的通用结构，单凭证场景单槽足够；epoch 防并发握手竞态（旧握手完成后发现 epoch 已变则丢弃）。

### D4 PoW：同步循环 + 每 1024 次让位检查取消信号

8-bit 难度平均 256 次 SHA-256（<5ms），同步求解 + 分批检查 `signal.aborted`；counter 穷尽（2^32）抛协议错误（视同签名失败降级）。
**被否**：Web Worker/子进程（复杂度不成比例——官方实现同样是主线程求解）。

### D5 两级降级：请求级 fail-open + 状态级 degraded 拒绝（`grill 11-04` 裁决）

**请求级 fail-open**（瞬时故障）：握手失败/签名被拒 → 失效重握手一次 → 仍失败该请求无签名发出（200 仍可得），60s 冷却窗内直接降级不重试，冷却结束自动重试握手（全程无感自愈）。
**状态级 degraded**（持续故障止损）：**连续 3 次**握手失败 → 进入 degraded：status 红色警示 + **停止自动重试 + 路由拒绝新请求**（显式报错，不用 1.5 刻度白扣额度）。恢复动作 = `/zcode-plan refresh` 或 PAT 轮换（重置计数并重新握手）。
**理由**：可用性优先于折扣只适用于偶发故障；持续故障下继续 fail-open 等于每个请求白多扣 ~50% 额度（比直连更贵的状态），与产品底线（Goals 第 4 条）冲突，故止损优先。事件计数（handshake_failed / resign_failed / degraded_unsigned / signed_ok）进 `status.ts` 状态面。

### D8 PAT 轮换预握手（`grill 11-04` 裁决）

`pat-owner.ts` 续期产出新 token → 签名缓存失效 + **立即后台预握手**（fire-and-forget，不阻塞续期主流程）：成功则缓存预热、下次请求直接有折扣；失败静默、计入手动恢复计数、下次请求懒重握手兜底。**被否**：纯懒失效（续期路径零网络，但轮换后首请求必多一次握手 RTT 且当次无折扣）。

### D10 实施修正（2026-11-04 真机验证发现，随组 1–3 收口）

1. **宿主 record kind 白名单**：dsh-credentials-local 的 `parseRecord` 只认 `api-key` / `grant` 两种 kind，**自定义 kind（如 `signing-key`）令整个 credentials 服务拒绝激活**（真机复现：调试实例启动即瘫、全部插件 waiting for services）。故签名私钥落盘形态修正为 `kind: 'grant'` + payload 前置 `signing: 1` 标记自辨（宿主对 grant payload 只做 JSON 合法性校验，内容不感知）；`parseSigningRecord` 同步收紧为「kind=grant + signing=1 + 四字段」。D3 的「落盘 dsh-credentials」裁决不变，仅 record 封装适配宿主契约。
2. **record-updated 身份比对**：owner 发布路径末尾的 `patchGrant` 补写 `patExpiresAt` 以 `LOGIN_RECORD_KEY` 触发 `credentials/record-updated`——装配层监听若无条件重建 owner，每轮发布都自触发重建：新 owner 停在 `none`（status「PAT ：无」）、旧实例续期定时器随 dispose 失效（**自动续期停摆**，真机复现）。修正为身份比对：`PatOwner.identity()`（jwt/org/project 三要素快照）与记录一致 → 跳过重建；不一致（重新登录/换号）→ 重建且新 owner **立即 `ensure()`**（login 后免手动 refresh，PAT 自动拉起）。

### D9 验收否决线（`grill 11-04` 裁决）

PAT 刻度验收（tasks 4.2，比值 0.5–0.67 判过）**不通过 → 本变更否决**：代码不合入主线，工件留档。产品底线推导（Goals 第 4 条）：验收失败 = 插件无折扣价值 = 无存在意义；不做「合入但默认关」的中间态（协议升级风险由工件留档承载，服务端策略变化时以新变更重启）。

### D6 配置面 `signing.enabled`（默认 true）

`cordis.patch.yml` 的插件 config 增加 `signing: { enabled: true }`；关闭 = 路由退化为 bridge 基线行为（零签名头）。不做按端点/按模型粒度——单一路由单端点。

### D7 合规边界成文

README「原理一句话」改写为：签名体系是**官方客户端的公开请求认证协议**（密钥 = 用户自己账户下发，非官方机密；服务端 fail-open 表明签名非强制准入），插件实现协议级客户端认证以命中官方 ZCode 通道折扣；不改客户端、不提指纹、不绕限制。风险声明：协议常量（握手路径版本 hash、KDF 常量、PoW 难度）可能随官方升级变更，变更时插件明确报错而非伪装旧版。

## Risks / Trade-offs

- **协议升级变更**：`c1f3a7e2` 版本 hash 或算法参数变更 → 握手 404/4011 → fail-open 降级无折扣（可用性不损），状态面亮降级原因；任务含常量集中 + 诊断报错。
- **PAT 形态未实测**：实验全部用裸 Key；PAT 三段式分支（`api_key` 字段、IKM=完整 token）源自官方代码逆向，未真机验证——tasks 4.1 为首个真机验证项。按 D9 裁决，PAT 刻度验收不通过 = 变更否决（原「回退裸 Key 形态签名」预案作废——推理路由凭证恒为 PAT，裸 Key 形态在插件架构内无出站路径）。
- **账户风控**：服务端可随时收紧（如绑定设备指纹）——fail-open 保可用性；折扣消失是上游市场行为（与 bridge 变更 RE-7/RE-8 口径一致）。
- **并发首请求握手风暴**：dsh 启动即并发多请求 → 单飞（in-flight handshake promise 共享），对齐官方 handshakePromise 模式。
