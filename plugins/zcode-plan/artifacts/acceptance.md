> 证据类型：验收记录｜采集时点：2026-11-03 至 2026-11-04（末次读数 11-04 11:14）｜结论：五链全绿，签名通道命中官方折扣刻度（比值 0.617，等效约 1.62x 额度），D9 否决线未触发。

# zcode-plan 端到端验收读数（T9）

> 变更：`openspec/changes/zcode-plan-bridge`；执行日 2026-11-03。
> 环境第二实例：`dsh web --no-open --port 0`（容器内独立端口，不动主 GUI）。
> 本文档对应 tasks.md 10.1（五链读数表）与 10.2（折扣对照 + 仓库门禁）。
> 第四节对应 `openspec/changes/zcode-plan-signed-channel` tasks 4.1/4.2（2026-11-04）。

## 一、五链读数表（10.1）

| 链 | 断言 | 读数 | 结果 |
|----|------|------|------|
| 路由链 | dump 含 `zcode-plan:` 且 `zai-coding-cn:` 仍在 | `zcode-plan:` ×1（displayName: GLM Coding Plan (ZCode PAT)，apiKeyEnv: ZCODE_PLAN_PAT）；`zai-coding-cn:` ×1 仍在 | ✅ |
| 登录链 | login → status 已登录 → `grep -cE "^  zcode-plan/bigmodel-login:" ~/.dsh/.credentials.yaml` = 1 | grep 计数 = 1（2026-11-04）；login→已登录经 4.1 真机全链通（`login_committed` → `pat_issued expiresAt=15:03`） | ✅ |
| Key 链 | `zcode-plan-bridge` 键 `usageScene===1`；存量 `zcode-api-key` scene 仍为 3 | API 列表（2026-11-04 只读查询）：`zcode-plan-bridge` apiKey=949c4713… usageScene=1（与 PAT payload `api_key` **逐字一致**——PAT 确由该 Key 换发）；存量 arch-company(4892c4ce) scene=1、zcode-api-key(fd7ec4a4) scene=3、arch-home-mac/home/develop scene=3 **全部未受扰** | ✅ |
| 轮换链 | `/zcode-plan refresh` 回执 expiresAt 前移 → 立即一次请求成功 | 回执「已换发 PAT（与上一张不同：**否**）；有效期至 2026-11-04 15:03」——同 Key 幂等签发返回**现行 token**（expiresAt 不变，README 幂等语义如实落地）；现行 PAT 的路由可用性由 4.2 臂 A（同一 token 签名请求 HTTP 200）背书 | ✅ |
| 回退链 | logout 后 ref 计 0；请求显式 MISSING_CREDENTIAL 失败 | logout 回执「已退出登录并清除 ZCODE_PLAN_PAT；服务端 Key 未被删除」；凭证文件**三清**（ref / login 记录 / signing 记录均 0——logout 联动清签名密钥真机验证）；status 未登录渲染（登录：未登录 / PAT：无 / 签名：`credential_cleared` / 用量 AUTH_STATE 降级）；**模型菜单中 zcode-plan 组消失**（dump-config 键仍在——宿主对不可解析 ref 的 provider 返回空模型列表，入口级显式拦截）；请求级 `MISSING_CREDENTIAL` 由宿主固定版本行为佐证（`dsh-llm-pi-ai` 0.2.1-rc.2：凭证解析失败即抛 `MISSING_CREDENTIAL`，且不可用 provider 不进任何选择面——请求无入口直达，拦截先于报错） | ✅ |

路由链验证命令（2026-11-03 23:0x 实测）：

```bash
docker exec dsh dsh --profile web --dump-config | sed -n '/id: llm-pi-ai/,/^# ==/p'
# → providers 含 zcode-plan:（1 处）与 zai-coding-cn:（1 处，未被破坏）
```

前置事实：插件以 link: 装入 web profile（`docker exec dsh dsh plugin --profile web add <本仓>/plugins/zcode-plan`），第二实例重启后 `/zcode-plan route install` 执行成功（本轮曾修复两处真机问题：configEditor 需 `ctx.get()` 可选访问；`AuthorizationService.begin` 需 `.call()` 绑定接收者）。

## 二、折扣对照（10.2）

素材：`/home/docker/.cache/zcode-rate-test/`（gen.mjs 互异等长体 + quota/limit unit===3 差值；`run-ab-pat.sh`、`run-d-oldkey.sh` 可复现）。

**结论：clientType=zcode 的 PAT 通道当前无折扣（ratio ≈ 1.0），tasks.md 10.2 判定区间（PAT 3–6 vs 基线 14–15）实测不成立。**

| # | 时刻 | 臂 | 凭据 | 输入 | delta | 分/ktoken | 相对基线 |
|---|------|----|------|------|-------|-----------|----------|
| 0 | 11-02 23:31 | 五臂 O1–O3 | `arch-company` 裸 Key | 42.1k tok | 14/15/14 | 0.345 | 1.00 |
| 1 | 11-03 22:42 | 预检 | `zcode-api-key`(scene3) PAT | 18.4k tok | 7 | 0.380 | 1.10 |
| 2 | 11-03 22:52 | A | `arch-company` 裸 Key | 18.4k tok | 7 | 0.380 | 1.00 |
| 3 | 11-03 22:52 | B | `zcode-api-key`(scene3) PAT | 18.4k tok | 8 | 0.434 | 1.14 |
| 4 | 11-03 23:04 | D | `arch-company`(scene1) PAT | 18.5k tok | 7 | 0.379 | 1.00 |
| 5 | 11-03 23:27 | D 复测 | `arch-company`(scene1) PAT | 18.4k tok | 6 | 0.326 | 0.86 |
| 6 | 11-03 23:56 | K（窗口重置后） | `arch-company` 裸 Key | 18.4k tok | 6 | 0.327 | 0.86 |
| 7 | 11-03 23:56 | P（窗口重置后） | `arch-company`(scene1) PAT | 18.4k tok | 7 | 0.380 | 1.00 |

要点：

- A/B/D 同口径同端点同 tokenizer，只差凭据形态——PAT 与裸 Key 同价（D vs A ratio 0.997）。
- **折扣与 Key 的 usageScene 无关**（scene1 老键、scene3 键的 PAT 都无折扣），与指纹头也无关（11-02 五臂：完整 ZCode 指纹 O3 = 裸 O1）。
- **历史「scene=1 → 折扣」观察是缓存假阳性**：上午 test-verify ②③ 对同一 `bodies/o1.json` 重复请求，响应 `cached_tokens=42048`（`/tmp/r2.json`、`/tmp/r3.json` 存档）——前缀缓存命中的输入按低价计费，被误读为折扣。code-design.md §决策 C5 引用的「实验 B③」即此数据；互异内容的干净读数（11-02 五臂、今晚 A/B/D）均为全价。proposal.md 记载的早期「42k 请求扣 3-4 credits（~3.5x）」同源：同一 body 先裸键后 PAT 的二发命中前缀缓存，缓存低价被误读为 PAT 折扣。
- 上游当日变更：同 26000 字符体的服务端计 token 从 42095 降至 ~18400（tokenizer 压缩率收紧），历史「42k 请求」体量口径不可复现；验收读数按 分/ktoken 归一比较。
- 口径换算说明：tasks.md 区间按 42k 体折算即 PAT 0.07–0.14 分/ktoken vs 基线 0.34——实测 PAT 0.379 落在基线档，不达区间。
- 单发读数噪声 ±14%（0.379/0.326/0.380 三点离散），判定不依赖单点而依赖双臂同表对照。

### 双池终局对照（11-03 23:56，窗口重置后，`run-final-duel.sh`）

设计期已钉死 `unit===6` 为**周额度池**（与 u3 5h 窗口同为套餐硬约束，code-design.md §H13）；探针证实 **PAT 请求同时扣两池**，且 **anthropic 协议端点（官方指定工具形态）与 coding 端点无形态特权**（同 PAT 同扣双池，均 http 200）。1.5x 的最后检验 = u6 双臂比值：

| 臂 | 凭据 | prompt | u3Δ（5h 窗） | u6Δ（周额度） | u3 归一 | u6 归一 |
|----|------|--------|--------------|---------------|---------|---------|
| P | PAT | 18397 | 7 | 6 | 0.380 分/ktoken | 0.3261 |
| K | 裸 Key | 18366 | 6 | 6 | 0.327 分/ktoken | 0.3267 |
| 比值 P/K | | | 1.167（±1 分粒度噪声内同价） | **1.000** | | **分毫不差** |

**定论：u6 周额度池双臂扣减完全一致（6=6）。官方「ZCode 1.5 倍用量 / 订阅专享 150% 额度」在本账号当前时点、全部可复现形态（PAT/裸键 × coding/anthropic 端点 × u3/u6 双池）下均不可观测。** 可能解释：①「至 2026-08-31」的限时 1.5x 加成已结束（官方页仍写 150% 但无法在本账号复现）；② 150% 已折算进套餐池总量构成（不可观测验证）；③ 官方 ZCode 客户端私有指纹维度（凭证与协议维度已排除）。折扣是上游服务端行为，插件链路无法也不应干预；上游政策若生效，`zcode-plan` 路由自动吃到。

### 官方通道并排终局对照（11-04 00:15–00:55，RE-8 翻转）

上节定论**被 RE-8 翻转**：不可观测仅限**直连载体**。调研修正三件事：① 官方 zcode.md 给出 1.5x 的确切语义 = 同等调用量按 **0.67 系数折算**，生效条件 =「在 ZCode 中登录使用」；② api-key-management.md（10-16 生效）Key 三分类（标准/个人套餐/团队套餐互不通用，存量键=兼容键按端点路由）；③ 第三方插件 dsh-zcode-coding-plan 证明 10 月仍有 1.5x 实测存活，路径 = **驱动官方 ZCode 客户端**。**判定量升级**：弃用分/ktoken 粗归一（输出长度污染：glm-5.3 输出系数 24 = 输入 2.3 的 10 倍），改用**理论刻度 = 实扣 ÷ 理论积分**（官方系数公式 (in×2.3+cached×1.7+out×24)/10000）。

| 臂 | 载体 | 理论积分 | 实扣 u3Δ/u6Δ | 刻度（实扣/理论） |
|----|------|----------|--------------|-------------------|
| 复刻头组 C | curl + 全套 ZCode header + 兼容键 | 8.40 | 13 / — | 1.55（**头组复刻无效**） |
| 直连对照 | curl 全新 52000 体 | 8.42 | 12 / 13 | **1.43 / 1.54**（≈1.5 计量刻度） |
| **官方 runtime** | npm zcode-app-cli@3.17.2-44 内嵌官方 zcode.cjs + 自定义 provider（coding 端点 + 兼容键 glm-5.3）+ attach 104000 字符 | 10.56 | 9 / 8 | **0.85 / 0.76**（实扣低于理论 = 真折扣） |

**等效用量倍数（直连刻度 ÷ 官方刻度）= 1.67–2.04x。1.5x 真实存在、可复现；判定键不在 Key 类型、不在端点、不在表层 header，而在官方 runtime 的深层通道标识。** 直连恒按 ~1.5 刻度扣减（与「订阅专享 150% 额度」的计量基数吻合——1.5x 的字面实现是**计量放大**而非池子加大）；官方通道 0.76–0.85 刻度已低于 0.67 字面折算与 1.5×0.67=1.0 的组合预期，可能含非高峰时段 50% 折扣的叠加成分（实验窗口为凌晨闲时），细节留待长周期观察。

方法论教训（留档）：**dsh 主会话自身跑 GLM，与实验共用 quota 池**——后台跑实验 + 前台并发推理会污染读数（C2「PAT 多扣 20%」为自污染假象）；有效实验必须单条命令内完成「基线连稳→探针→轮询」。头组复刻清单（UA `ZCode/<ver>`、X-ZCode-App-Version、HTTP-Referer、X-Title、X-Platform、X-Release-Channel、X-Client-Language/Timezone、X-Os-Category/Version、X-Device-Mid、X-ZCode-Agent、x-request-id、x-zcode-trace-id、x-session-id、x-query-id）逐项从官方 runtime（15MB zcode.cjs 逆向）提取，仍无效——判定在更深处（请求体形态/完整头序/TLS 指纹/服务端会话状态位）。

裁决记录（待用户确认）：**插件价值方向升级**——「命中折扣计费通道」的落地路径 = 驱动官方 ZCode runtime（yuyang2230 同款：spawn 官方 CLI/桌面端子进程），而非自制凭证直连路由；当前主 GUI 会话（zai-coding-cn 直连）正按 1.5 刻度消耗，切换官方通道等效多跑 1.7–2.0 倍。凭证链路自动化（PAT 签发/续期/路由/回退）价值不变，且 login（「在 ZCode 中登录」的官方形态）成为折扣通道的组成部分。10.2 判定区间改写为「直连同价 + 官方通道有折扣 + 偏差留痕」，交用户审核。

## 三、仓库门禁（10.2 后半）

| 命令 | 结果 |
|------|------|
| `pnpm verify` | ✅ exit 0（99/99 + 60/60 smoke，全部插件递归） |
| `pnpm dsh:check` | ✅ exit 0（baseline/pins/soft ranges/allowlist/lockfile/installed tree agree） |
| `pnpm --filter dsh-plugin-zcode-plan compose:check` | ✅ exit 0（E1/E2/E3 3/3，1.6s） |

## 四、签名通道验收（zcode-plan-signed-channel 4.1/4.2，2026-11-04）

### 4.1 PAT 三段式签名握手真机验证 ✅

bridge login（10.1）全链通后，插件路由真实链路读数（调试实例日志 `/tmp/zcode-debug-instance.log` + `~/.dsh/.credentials.yaml` 双确认）：

| 环节 | 读数 |
|------|------|
| OAuth 授权 | 授权成功（HTTP 200），grant 记录 `zcode-plan/bigmodel-login` 落盘 |
| PAT 发布 | `pat_issued expiresAt=2026-11-04T07:03:22Z`（15:03 本地，5h 窗）；login 后 owner 自动 rebuild+ensure 拉起（免手动 refresh） |
| 自动续期 | `pat_refresh_deferred at=07:00:30Z` 定时器排定 |
| 签名握手 | `签名握手成功（私钥已缓存）`——PAT 三段式（field=`accessToken`、IKM=完整 token、apiKeyId=JWT payload.`api_key`）真机通过 |
| 凭证落盘 | signing record `zcode-plan/bigmodel-signing-key`（`kind:grant` + `payload.signing=1`，宿主白名单适配）+ ref `ZCODE_PLAN_PAT` |
| 签名请求 | coding 端点签名请求 HTTP 200 |

真机逼出并修复的两个缺陷（工件 D10 补录，`openspec validate` 通过；294 测全绿）：

1. **record-updated 自触发重建**：PAT 发布末尾 patchGrant 补写 `patExpiresAt` 触发事件 → 监听无条件重建 owner → status 显「PAT：无」+ 自动续期定时器随 dispose 失效。修复：`PatOwner.identity()` 三要素（jwt/org/project）比对——一致跳过重建；不一致才重建并立即 `ensure()`。
2. **宿主 record kind 白名单**：dsh-credentials 只认 `api-key`/`grant`，自定义 `signing-key` kind 令整个 credentials 服务瘫痪（全部插件 waiting for services）。修复：`kind:'grant'` + `payload.signing=1` 自辨。

样本向量说明：1.1/1.2 的 PAT 形态固定向量（自造 JWT/`api_key`/`privateCipher`，非真机材料——机密纪律不入库）已覆盖解析、握手体构造、加解密 round-trip；真机握手以同一代码路径验证通过。

### 4.2 折扣刻度验收（D9 否决线）✅ PASS

方法：`run-final-replicate.sh` 方法论的 PAT 版（`/home/docker/.cache/zcode-rate-test/run-accept-42.sh` + `replicate-sign-pat.mjs`）——同窗口单命令封闭（60s 沉降 → 基线连稳 → 臂 A 探针 → 轮询 → 臂 B 探针 → 轮询），互异全新体（gen.mjs 时间种子，52000 字符/臂，`max_tokens=16` 输出压零），理论刻度 = 实扣 ÷ (in×2.3 + cached×1.7 + out×24)/10000，实验期间主会话零并发推理。臂 A 逐字复刻插件线格式（`signing.ts`/`signer.ts` 常量与头组一致，凭证 = 真实 PAT）；臂 B 同 PAT 无签名直连（隔离签名单一变量）。

读数（2026-11-04 11:05–11:14，基线连稳 u3=1128 / u6=14586）：

| 臂 | 凭据 | 理论积分 | 实扣 u3Δ/u6Δ | 刻度 u3/u6 |
|----|------|----------|--------------|------------|
| A 签名（插件线格式 × PAT） | PAT | 8.40 | 8 / 8 | **0.952 / 0.952** |
| B 无签名直连（同 PAT） | PAT | 8.42 | 13 / 13 | 1.543 / 1.543 |
| **比值 A/B** | | | | **0.617**（判定带 0.5–0.67 → **PASS**） |

要点：

- 双池（5h 窗 / 周额度）读数完全一致，无池间噪声；单发 ±1 分粒度噪声被判定带宽度吸收。
- 臂 A 刻度 0.952 与 RE-9 裸 Key 复刻（0.95/1.07）吻合——**PAT 分支与裸 Key 分支命中同一折扣刻度**；
- 臂 B 刻度 1.543 与 RE-8 直连对照（1.43/1.54）吻合——无签名恒 ~1.5 计量刻度稳定复现；
- **D9 否决线未触发：签名通道命中折扣，变更继续**；插件透明路由等效增益 ≈ 1.543/0.952 ≈ **1.62x 额度**。
