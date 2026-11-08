> 证据类型：路由真机重放｜采集时点：2026-11-08 11:53（status）/ 11:53（route）/ 11:53（refresh），GUI 会话内 `/zcode-plan` 实测｜结论：登录态、双模型路由注册（glm-5.3 / glm-5.3-flash）、签名通道（handshake_ok）与 PAT 续期链路在 dsh 0.2.2-rc.1 下全部复测通过；用量刻度与 `discount-verify.md` 的折扣结论同向。

# 路由真机重放（`docs-arch-refinement` G6.4，迁移指南复核读数）

复测口径：在运行中的 DSH profile 会话内依次执行 `/zcode-plan status` → `/zcode-plan route` → `/zcode-plan refresh`，读数照录；凭证与 PAT 字段按凭据纪律脱敏。复核动因与处置登记见插件级 `docs/decisions/ADR-0014-fork-divergence-and-single-language.md` 同批的迁移指南复核（版本声明改指 `scripts/dsh-baseline.mjs` 来源常量）。

## `/zcode-plan status`（读数 2026-11-08 11:53）

```text
登录：已登录
Key ：zcode-plan-bridge · scene=1 · id 949c4713…
PAT ：有效 · 到期 13:46（剩 1h52m） · 下次续期 ≤ 13:44
路由：已注册（glm-5.3, glm-5.3-flash）
签名：已启用 · 私钥缓存命中 · 上次 handshake_ok
用量：5h 窗口 67 / 5（1%，重置 16:37） · 周 63215 / 1（45%，重置 周一 18:15）（读数 刚刚，服务端聚合延迟 1–2 分钟）
备注：无
```

## `/zcode-plan route`

```text
zcode-plan 路由：已注册（glm-5.3, glm-5.3-flash）
```

## `/zcode-plan refresh`

```text
zcode-plan 已换发 PAT（与上一张不同：否）；有效期至 2026-11-08 13:46
```

换发读数说明：本次 refresh 返回的 PAT 与上一张相同（「不同：否」），处于续期窗口内的幂等换发形态；有效期不变（至当日 13:46），续期调度（下次续期 ≤ 13:44）不受影响。照实记录，不构成异常。

## 与既有证据的对照

| 事实点 | 本次读数 | 既有证据（`acceptance.md` / `discount-verify.md`） | 判定 |
| --- | --- | --- | --- |
| 路由注册 | glm-5.3 / glm-5.3-flash 双模型 | 同 | 一致 |
| 签名通道 | 已启用 · handshake_ok | 双臂比值 0.617 / 0.679 落 0.67 邻域 | 同向（通道生效） |
| 用量刻度 | 5h 67（1%）；周 63215（45%，总额度 ≈ 14.05 万） | 验收结论「等效约 1.62x 额度」 | 同向（折扣额度生效中） |
| PAT 续期 | 到期 13:46 · 下次续期 ≤ 13:44 · refresh 幂等换发 | README 续期纪律段 | 一致 |

## 环境事实（复核时点）

- dsh 基线：`0.2.2-rc.1`（读自 `scripts/dsh-baseline.mjs`，2026-11-08）。
- profile：web（`docker exec dsh dsh --profile web --dump-config` exit 0，zcode-plan provider 与双模型路由注册在案）。
- 执行形态：GUI 会话内斜杠命令（`/zcode-plan` 命令面由插件 `commands` 服务注册）。
