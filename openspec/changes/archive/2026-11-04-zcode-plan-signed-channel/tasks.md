# Tasks

## 组 1：签名协议模块（纯函数层，全 mock 单测）

- [x] 1.1 `src/host/bigmodel/signing.ts` 协议常量与凭证解析：握手路径 `/api/paas/c1f3a7e2/v2/client`、KDF salt `WD_CLIENT_SIGN_KDF_SALT`、info `getSignKey_hmac`/`ed25519_priv`、appId `zcode`、clientVersion 常量集中；`parseCredential` 两段式（`id.secret` → apiKeyId/IKM 后段/字段 `apiKey`）与三段式 JWT（payload `api_key` 字段 → apiKeyId、IKM=完整 token、字段 `accessToken`）；单测：两种形态解析向量、畸形输入（无点/多点/空段/JWT payload 无 `api_key`）明确报错不静默
- [x] 1.2 密码学原语：HKDF-SHA256 派生、握手 HMAC 消息 `get_sign_key\n<apiKeyId>\n<ts>\n<nonce>`（换行分隔）、AES-256-GCM 解密 privateCipher（IV=cipher[0:12]、AAD=apiKeyId、tag=末 16 字节、明文 base64 再解一层得 PKCS#8）、Ed25519 签名消息 `<apiKeyId>\n<ts>\n<version>\n<sessionId>\n<nonce>`；单测：以 `replicate-sign.mjs` 实测样本为固定向量（已知 secret/ts/nonce → sig 逐字节一致；已知 privateCipher → 私钥可解可签）
- [x] 1.3 PoW 求解器：challenge = SHA-256(`<apiKeyId>\nzcode\n<sessionId>\n<ts>`) hex 前 32 字符；解 = `<12字节随机hex><counter 8hex>`，SHA-256(`<challenge>\n<解>`) 前 8 位为 0；每 1024 次迭代检查取消信号；counter 穷尽抛协议错误；单测：解可验证、取消即停、随机性（同输入两次解不同）

## 组 2：Signer 状态机与 fetch 包装

- [x] 2.1 `Signer` 状态对象：私钥**持久化于 dsh-credentials record**（scope=`zcode-plan`、id=`bigmodel-signing-key`；D3）+ 内存单槽快路径 + epoch 计数；单飞握手（并发共享 in-flight promise，epoch 变更丢弃旧结果）；失效源 = 签名被拒类响应（`VERIFY_SIGNATURE_INVALID`/`VERIFY_APIKEY_EXPIRED`/业务码 3007）、凭证更换、`invalidate()`；单测：并发 5 请求仅 1 次握手、epoch 竞态、失效后重握手、record 读写与清理
- [x] 2.2 签名 fetch 包装（globalThis 包装 + Symbol 重入守卫 + URL 匹配，握手走原始 fetch 防递归）：仅对 `open.bigmodel.cn` 域且 coding 路径的 POST 签名、不读改请求体；注入头组（X-Client-Sig/Ts/Version/Nonce/Pow、X-App-Id、X-Session-Id 复用或生成）；每请求全新 nonce/ts；被拒→失效→重握手→重签重发一次→二次失败无签名发出（请求级 fail-open）+ 60s 冷却窗（窗内直接降级、冷却结束自动重试）；**连续 3 次失败进入 degraded：停自动重试 + 新请求显式报错**（D5）；单测：目标匹配/不匹配、被拒恢复路径、二次失败降级、冷却窗、degraded 拒绝、refresh 重置恢复
- [x] 2.3 事件计数与状态源：signed_ok / handshake_failed / resign_failed / degraded_unsigned / last_handshake_at / last_result，暴露给 status 面；单测：计数正确、降级路径各事件落点

## 组 3：路由与配置接入

- [x] 3.1 接入 PAT 路由出站：`pat-owner.ts` 续期产出新 token 时失效签名缓存并**立即后台预握手**（fire-and-forget 不阻塞续期，失败静默计 degraded 计数，D8）；路由请求经签名包装发出；`signing.enabled` 配置（默认 true，关闭 = 零签名头直连基线行为）；logout 联动清理私钥 record；单测：配置开关两态、token 更换触发失效+预握手、logout 清理
- [x] 3.2 `/zcode-plan status` 签名通道行：启用态、私钥缓存状态（命中/未握手/降级中）、连续失败计数、上次握手时间、上次签名结果；degraded 红色警示 + 恢复方法；单测：各状态渲染（含 degraded 警示）

## 组 4：PAT 形态真机验证（首个真机项，依赖 bridge 10.1 login 完成；实施顺序裁决：组 1–3 立即动工，组 4 挂起等 PAT 就绪——`grill 11-04`）

- [x] 4.1 PAT 三段式签名握手真机验证：以 bridge 变更 10.1 完成后的 PAT 为凭证走 `parseCredential` → 握手 → 签名请求一发；成功则记录样本向量回补 1.2 固定向量。PAT 是推理路由唯一凭证源（D3/D9），本项失败即触发 D9 否决线（无裸 Key 回退预案——已按 `grill 11-04` 裁决作废）✅ 2026-11-04：真机全链通（握手成功 + 私钥缓存 + 签名请求 200，读数见 `plugins/zcode-plan/docs/acceptance.md` 第四节）；真机逼出双缺陷已修复（D10：record-updated 自触发重建 / 宿主 record kind 白名单）；PAT 形态固定向量（自造材料）已在 1.1/1.2 单测覆盖
- [x] 4.2 折扣刻度验收（**D9 否决线**）：复用 `run-final-replicate.sh` 方法论（同窗口单命令封闭、互异全新体、理论刻度归一、实验期间主会话零并发推理）对「插件签名路由 vs 无签名直连」双臂读数，比值落 0.5–0.67 判过；**不通过 = 变更否决：代码不合入主线、工件留档**（无签名直连恒 ~1.5 刻度，比理论多扣 50%——验收失败即插件无价值）；读数留档 `docs/acceptance.md` ✅ 2026-11-04 **PASS**：臂 A 签名（插件线格式×PAT）刻度 0.952 vs 臂 B 同 PAT 无签名直连 1.543，比值 **0.617**（双池一致，D9 否决线未触发）

## 组 5：文档与门禁

- [x] 5.1 README 改写：原理句（签名体系 = 官方公开请求认证协议，密钥为账户下发、零官方机密；实测刻度读数）、`signing` 配置说明、折扣复测口径补「签名通道判定臂」、合规边界与协议升级风险声明 ✅ 2026-11-04：插件 README 七处改写（原理句重写 / 配置键清单补 signing / status 七行 / 新增「签名通道（折扣计费）」小节含两级降级表与合规声明 / 复测口径改签名双臂 / 排障表补止损行）+ 根 README 索引行更新
- [x] 5.2 仓库门禁：`pnpm verify` + `pnpm dsh:check` + `pnpm --filter dsh-plugin-zcode-plan compose:check` 全绿；zcode-plan 单插件全量单测绿 ✅ 2026-11-04：verify exit 0（99/99 + 60/60 smoke 递归全插件）、dsh:check exit 0（baseline/pins/soft ranges/allowlist/lockfile/installed tree agree）、compose:check 3/3（E1/E2/E3）、zcode-plan 294/294
