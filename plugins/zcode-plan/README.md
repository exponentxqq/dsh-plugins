# dsh-plugin-zcode-plan

DSH 插件（**host-only，`exports "."`**）：把 bigmodel.cn GLM Coding Plan 的 ZCode 折扣凭证桥接进 dsh 路由——浏览器登录 BigModel 后，插件在服务端 find-or-create 一把 `usageScene:1` 的桥接 Key，用 `clientType:"zcode"` 换发短期 PAT（Project Access Token）作为路由凭证并自动续期，`/zcode-plan` 五子命令（login / logout / status / route / refresh）管理全流程。

**原理一句话：插件维护官方客户端等价的凭证链，并把官方客户端的请求签名体系原样带进路由**——凭证链 = 「`usageScene:1` 的 Key + `clientType:"zcode"` 换发的那张 PAT」；签名体系 = **官方公开的请求认证协议**：login 完成后即时握手 `get_sign_key`（服务端按账户下发 Ed25519 私钥密文，解密密钥由你自己的凭证派生），此后每个发往 coding 端点的模型请求自动附加 Ed25519 签名 + 8-bit PoW 头组。**零官方机密**：密钥材料要么是你自己的凭证（PAT / Key）、要么是服务端按账户下发的私钥——插件不内嵌任何官方秘密，也不做 TLS / 指纹层伪装（签名通道启用时随请求发送的 UA 与 `X-Zcode-*` 观察头均为官方客户端公开常量，为复刻实验验证生效配置的逐字保留；关闭签名或 fail-open 降级时按基线直连、无这些头）。实测刻度（2026-11-04，5h 窗 / 周额度双池一致）：**签名 0.952 vs 同 PAT 无签名 1.543，比值 0.617 ≈ 官方 0.67 折算字面值，等效 ~1.62x 额度**——折扣判定键就是这个每请求签名体系（全部读数见 [docs/acceptance.md](docs/acceptance.md) §四，复测方法见[折扣复测口径](#折扣复测口径)）。签名通道两级降级（无签名直发按 ~1.5 刻度扣池、比直连更贵，止损优先）：瞬时故障**请求级 fail-open**（该请求无签名直发 + 60s 冷却窗自动自愈）；连续 3 次握手失败进入**状态级止损**——拒绝新请求，`/zcode-plan refresh` 或重登录恢复。

路由注册写在 profile 层 `llm-pi-ai.providers['zcode-plan']` 键上，**不改 `agent-default-model`**——是否切默认路由是你的决策，本插件不代劳。

## 前置条件

- **dsh ≥ 0.2.1-rc.2**（本包 `engines.dsh` 为 `>=0.2.1-rc.2 <0.3.0`）。
- **已订阅 GLM Coding Plan** 并能用浏览器登录 bigmodel.cn。
- **拿到 `organization` / `project` 两个 id**：平台没有可依赖的程序化发现接口（实测管理面无此路由，见变更 artifacts 的 spike-org-project），这两个值是**必填配置**。从控制台或用量页（`https://www.bigmodel.cn/coding-plan/personal/usage`）的 URL 里取。
- **headless profile 不适用**：headless 部署禁用凭据存储，登录态与 PAT 无处落盘，本插件的登录/续期能力整体不装配（软注入零注册、零报错，但功能不可用）。装在 web / acp 等带凭据存储的 profile 上。
- 宿主服务依赖（全部软依赖，任一缺席只降级对应能力、插件本身不报错）：`credentials` + `authorization`（登录与 PAT 续期）、`commands`（`/zcode-plan` 命令面）。

## 安装到 profile

```bash
# 发布后按 tag 装（host-only 包，任何带凭据存储的 profile 均可单独安装）
TAG=$(git describe --tags --abbrev=0)
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/zcode-plan"

# 本地开发调试（link: 安装，改源码重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/zcode-plan
```

安装后**必须**在 profile 的 `cordis.patch.yml` 里给 `zcode-plan` 插件行补必填的 org / project（bundle patch 只插入裸插件行，不带 `config:` 段）：

```yaml
# profile cordis.patch.yml：给 zcode-plan 行补必填配置（其余键都有默认值）
- id: zcode-plan
  config:
    organization: <your-org-id>      # 控制台/用量页 URL 里的组织 id
    project: <your-project-id>       # 同一 URL 里的项目 id
```

其余配置键全部有默认值，不补也能跑：`clientVersion`（`'0.17.0'`）、`refreshLeadMs`（`120000`，到期前提前量）、`refreshJitterMs`（`60000`，续期随机抖动上限）、`requestTimeoutMs`（`15000`）、`callbackServer`（`true`，是否起本地回调服务器）、`loginAttemptTtlMs`（`600000`，登录尝试有效期）、`signing`（`true`，[签名通道](#签名通道折扣计费)开关——官方 ZCode 折扣计费；`false` = 无签名直连基线行为，路由仍可用只是无折扣）。

校验安装：

```bash
docker exec dsh dsh --profile web --dump-config-schema   # 校验配置可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config | grep -B2 -A8 'id: zcode-plan'
```

## 三步上线

```text
1. /zcode-plan route install    把 zcode-plan 路由写进 profile 层 providers
2. /zcode-plan login            浏览器授权 → 换发登录态并自动签发第一张 PAT
3. /zcode-plan status           核对登录 / Key / PAT / 路由 / 用量六行
```

**第 2 步的两种形态**：

- **同机部署**（浏览器与 dsh 同机）：回执给出授权链接（`https://bigmodel.cn/login?appId=zcode&redirect=http://127.0.0.1:<port>/oauth/callback/bigmodel&state=<32hex>`），浏览器完成授权后本地回调服务器自动接住。
- **容器部署**（浏览器在宿主机，dsh 在容器里）：服务端虽然放行 loopback redirect，但浏览器跳到 `127.0.0.1:<port>` 时连的是宿主机回环，容器里的回调服务器**收不到**——这是本部署形态的**主用路径**：授权完成后把浏览器地址栏的**整条 URL** 复制下来，粘贴提交：

  ```text
  /zcode-plan login http://127.0.0.1:<port>/oauth/callback/bigmodel?authCode=<一次性授权码>&state=<32hex>
  ```

**核对**：`/zcode-plan status` 输出七行——登录（已登录）、Key（`zcode-plan-bridge` · scene=1 · id 前 8 位）、PAT（有效 · 到期时刻 · 下次续期 ≤）、路由（已注册（glm-5.3, glm-5.3-flash））、签名（已启用 · 私钥缓存命中）、用量（5h 窗口 + 周 两档）、备注（无）。任何一行为「未…」按[排障](#排障)处理。

**切换默认模型需你自行决定**：本插件只注册 `zcode-plan` 路由，不动 `agent-default-model`。要让会话默认走折扣路由，请自行把 profile 里 `agent-default-model` 条目的 `provider` 改为 `zcode-plan`（想回退时同理，见[回退](#回退)）。

登录成功后插件自动维持登录态：桥接 Key find-or-create（名为 `zcode-plan-bridge`、`usageScene:1`，命中存量即复用，**永不删改你已有的任何 Key**），PAT 按 `expiresAt` 提前 120 秒 + 0–60 秒随机抖动续期（PAT 满效期 18000 秒 = 5 小时）。登录 JWT 实测无 `exp` 声明，效期只能由服务端 401 感知——失效即 `JWT_EXPIRED`，重登即可。

## 命令参考

总文法（未知子命令返回的就是这段）：

```text
用法：/zcode-plan [login [回调URL] | logout | status | route [install|remove|status] | refresh]
  login                发起 BigModel 授权（浏览器完成后粘贴回调 URL）
  login <回调URL>      提交粘贴的回调 URL，换发登录凭证
  logout               退出登录并清除 ZCODE_PLAN_PAT（服务端 Key 保留）
  status               查看登录 / Key / PAT / 路由 / 用量状态（缺省子命令）
  route install        把 zcode-plan 路由写入 profile 层 providers
  route remove         从 profile 层移除 zcode-plan 路由
  route status         查看路由注册状态
  refresh              立即换发一张 PAT
```

容错：子命令允许带前缀斜杠（`/zcode-plan /status` 等价 `status`）；`/zcode-plan` 不带参数等价 `status`；`route` 不带参数等价 `route status`。

| 子命令 | 行为与回执 |
| --- | --- |
| `login` | 发起授权，回执含授权链接与粘贴指引；已有在途尝试时回显同一条指引。 |
| `login <回调URL>` | 提交粘贴的回调 URL（URL 原样透传，`state` 在流程内校验）；回执「已收到回调，正在换发登录凭证…」。没有在途尝试时报错提示先发起 `login`。 |
| `logout` | 按序：中止在途授权 → 删登录记录 → 清 `ZCODE_PLAN_PAT` 引用 → 停续期循环。回执「已退出登录并清除 ZCODE_PLAN_PAT；**服务端 Key 未被删除**」。 |
| `status`（缺省） | 渲染六行状态（见上）；其中用量只读一次 quota/limit，失败降级为一行说明、其余段照常。 |
| `route install` | 幂等写入 profile 层 `llm-pi-ai.providers['zcode-plan']`（内容一致时跳过写盘）；只覆盖本键，**不碰其它 providers 键、不碰 `agent-default-model`**。回执区分「当前路由已注册」与「待宿主重载配置后生效」。profile 没有 `llm-pi-ai` 行时报错（无从落键，用[手工路由 YAML](#手工路由-yaml不用-route-install-时的降级路径)）。 |
| `route remove` | 幂等摘除 `providers['zcode-plan']` 键（本无此键时跳过写盘）；**只删本键**，不动其它 providers 键。 |
| `refresh` | 立即换发一张 PAT。回执只报「与上一张不同：是/否」的**布尔比对**与到期时刻，**不回显任何值**（同 Key 幂等签发时是「否」；首张是「是」）。 |

机密纪律适用于全部回执与日志：JWT / PAT / Key Secret 的值永不出现，Key 只出 keyId 前 8 位（keyId 非 secret），错误只出码与脱敏文案。

## 签名通道（折扣计费）

`signing` 配置（默认 `true`）开启官方 ZCode 折扣计费通道：login 完成 → PAT 发布即**预握手**（fire-and-forget 不阻塞续期，失败由下次请求懒重握手兜底）→ 私钥缓存（内存单槽 + credential record 落盘，指纹绑定凭证——更换凭证即失效，重启 profile 免重握手）→ 此后所有发往 coding 端点的模型请求自动附加签名头组（`X-Client-Sig` / `X-Client-Ts` / `X-Client-Version` / `X-Client-Nonce` / `X-Client-Pow` / `X-App-Id` / `X-Session-Id` + 官方客户端 UA）。签名消息与 PoW 构造、协议常量出处见 [docs/acceptance.md](docs/acceptance.md) §四与 `src/host/bigmodel/signing.ts`。实测刻度 0.952 vs 无签名 1.543（比值 0.617，2026-11-04 双池一致）。

**两级降级**（无签名直发按 ~1.5 刻度扣池，比直连更贵——止损优先于可用性）：

| 级别 | 触发 | 行为 | 恢复 |
|------|------|------|------|
| 请求级 fail-open | 握手失败 / 签名被拒重握手一次仍失败 | 该请求无签名直发（请求仍正常受理），60s 冷却窗内不再握手，冷却结束自动重试 | 自动自愈 |
| 状态级止损（degraded） | 连续 3 次握手失败 | 停止自动重试 + status 红色警示 + **新请求显式报错**（绝不静默按 ~1.5 刻度白扣） | `/zcode-plan refresh` 或重新 `/zcode-plan login`（重置计数并重握手） |

签名被拒（`VERIFY_SIGNATURE_INVALID` / `VERIFY_APIKEY_EXPIRED` / 业务码 `3007`）、凭证更换（PAT 轮换后新 token）、插件配置变更都会失效私钥缓存并重握手。`signing: false` = 回到无签名直连基线（路由可用，无折扣）。

**合规边界与协议升级风险声明**：本通道复刻的是**官方公开的请求认证协议**——签名材料全部账户自有（你的 PAT / Key）或服务端按账户下发（Ed25519 私钥密文），零官方内嵌机密；不实现任何 TLS / 指纹层伪装。协议常量（握手路径版本 hash `c1f3a7e2`、clientVersion `3.17.2`、KDF salt、PoW 难度）集中收口在 `src/host/bigmodel/signing.ts`，为官方当前值——**官方协议升级时签名可能被拒或握手失败**，此时按两级降级处理（不会静默多扣），需以新变更跟进常量更新。

## 安全模型与差异声明

### PAT 落盘：对官方「短期 token 仅内存」红线的偏离

dsh 官方对短期 token 的立场是**仅内存**（short-lived token 不落盘，重启即弃、重新获取）。本插件**有意偏离这条红线**：PAT 会写入凭据存储的 `ZCODE_PLAN_PAT` 引用（`<harness home>/.credentials.yaml` 的 `refs` 段）。原因：

- **跨进程 / 跨 profile 共享**：PAT 是幂等签发的（同 Key 并发换发返回同一张现行 token），落盘引用让多个 profile / 多个实例共享同一登录态，无需协调；
- **启动首请求可用**：重启 profile 后第一个请求就能拿到现行 PAT，不存在「等一轮在线换发」的 MISSING_CREDENTIAL 窗口。

对应缓解措施：

- 存储文件由 dsh-credentials-local 以 **0600** 创建并在加载时拒绝更宽的权限；
- 落盘的是 **≤5 小时短效** token（满效期 18000 秒，到期自动失效），不是长效密钥；
- 写路径**唯一**（PAT owner 的发布动作），并发写不会产生多份不一致的值；
- `/zcode-plan logout` **立即清除**引用与登录记录。

登录 JWT 存在同文件的 `records.zcode-plan/bigmodel-login` 记录里（grant payload）；桥接 Key 的 Secret 创建后即丢弃、**不落盘**，记录里只留非 secret 的 keyId。

### 卸载不清引用

**卸载或禁用本插件不会清除** `ZCODE_PLAN_PAT` 引用与登录记录——这是刻意的：清掉引用会让重启后的第一个请求撞上 MISSING_CREDENTIAL 窗口。残留影响有界：PAT 至多 **5 小时**后自然过期失效，期间受 0600 文件权限保护。

手动清理（二选一）：

```text
1. 卸载前先执行 /zcode-plan logout —— 最干净，一并停掉续期循环
2. 直接编辑 <harness home>/.credentials.yaml（存储自动重载）：
   - 删 refs 段的 ZCODE_PLAN_PAT 条目
   - 删 records 段的 zcode-plan/bigmodel-login 条目
```

注意：`logout` 与手动清理都**不删除服务端**的 `zcode-plan-bridge` 桥接 Key（它是 find-or-create 的幂等资源，留着无害；要删请自行到 BigModel 控制台操作）。

### headless 不适用 / 单 owner 多 profile

- **headless**：禁用凭据存储的部署上登录与续期能力整体不装配，本插件不适用（其余部署零注册零报错，不影响安装）。
- **单 owner 多 profile**：同一账号下的多个 profile / 多个实例可以**共享同一张现行 PAT**——服务端对同 Key 的签发是幂等的（find-or-return 现行有效 token），各实例各自续期拿到的都是同一张，无需实例间协调。但**登录记录是各 profile 独立的**：每个 profile 都要各自执行一次 `/zcode-plan login`。

## 回退

三步回到 `zai-coding-cn` 基线路由：

```text
1. 把默认模型切回：profile cordis.patch.yml 里 agent-default-model 条目的
   provider 改回 zai-coding-cn（model / reasoningEffort 填回你原先的值）
2. /zcode-plan route remove    从 profile 层摘除 zcode-plan 路由（只删本键，
                               不动其它 providers 键，zai-coding-cn 不受影响）
3. /zcode-plan logout          清登录记录与 ZCODE_PLAN_PAT（服务端 Key 保留）
```

`route remove` 只摘除 `providers['zcode-plan']` 这一个键，对文件里其它路由与注释零扰动；本无此键时幂等跳过、不写盘。彻底移除插件再执行 `dsh plugin --profile web remove`（先 `logout`，原因见[卸载不清引用](#卸载不清引用)）。

## 手工路由 YAML（不用 route install 时的降级路径）

如果你的部署没有 `commands` 或 `config-editor` 服务（或 profile 没有 `llm-pi-ai` 行导致自动注册报错），可以**手工**把下面整段粘进 profile `cordis.patch.yml`，效果与 `/zcode-plan route install` 写入的内容一致（逐字转写自实现的单一真源 `ZCODE_PLAN_ROUTE`）：

- profile patch **已有** `- id: llm-pi-ai` 条目时：把 `zcode-plan:` 一段粘进它**现有的** `config.providers` 下；
- 没有该条目时：追加完整条目。

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      zcode-plan:
        displayName: GLM Coding Plan (ZCode PAT)
        apiKeyEnv: ZCODE_PLAN_PAT
        api: openai-completions
        baseURL: https://open.bigmodel.cn/api/coding/paas/v4
        reasoning: max
        retryPolicy:
          mode: normal
          retryableCodes:
            - EMPTY_RESPONSE
            - RATE_LIMIT
            - SERVER
            - TIMEOUT
            - TRANSPORT
            - INVALID_CREDENTIAL
        models:
          - id: glm-5.3
            name: GLM-5.3
            contextWindow: 1000000
            maxTokens: 131072
            input:
              - text
            reasoningEfforts:
              off: null
              low: low
              medium: high
              high: high
              max: max
            compat:
              thinkingFormat: zai
              supportsReasoningEffort: true
              supportsStore: false
              supportsDeveloperRole: false
              supportsStrictMode: true
              maxTokensField: max_tokens
          - id: glm-5.3-flash
            name: GLM-5.3 Flash
            contextWindow: 1000000
            maxTokens: 131072
            input:
              - text
              - image
            reasoningEfforts:
              off: null
              low: low
              medium: high
              high: high
              max: max
            compat:
              thinkingFormat: zai
              supportsReasoningEffort: true
              supportsStore: false
              supportsDeveloperRole: false
              supportsStrictMode: true
              maxTokensField: max_tokens
```

要点：

- **同 id 条目的 `config` 是整份替换语义**（不是深合并）——若在已有 `- id: llm-pi-ai` 条目的文件里再追加第二个同 id 条目，后者的 `config` 会整份顶掉前者，你已有的其它 providers 键会**全部丢失**。务必粘进现有条目里。
- `retryableCodes` 是**整集覆盖**（dsh-llm 对该字段取整集替换、不做增量合并），所以六码里包含了五个默认码 + 追加的 `INVALID_CREDENTIAL`，一个都不能少抄。
- 手工路径只解决**路由注册**；PAT 的签发与续期仍由插件负责——没有 `credentials` 服务的部署连登录都做不了，这条路走不通。
- 改完 YAML 后宿主重载配置即生效（`route status` / `status` 的路由行会变为「已注册」）。

## 折扣复测口径

折扣是否生效用**同款请求对拍**验证：两臂同用一张 PAT、各发一份互异全新体，唯一变量 = 是否带插件线签名头组；**比值 A/B（签名/无签名刻度）落 0.50–0.75（官方 0.67 折算系数邻域）→ 折扣命中**。脚本正本与完整手册在本包内：`scripts/` 五件套（refresh-snap / gen / replicate-sign-pat / read-pools / verify-discount）+ [docs/discount-verify.md](docs/discount-verify.md)（原理、流程、判读表、方法论与纪律）。

```bash
pnpm discount:snap     # 从凭据存储刷新快照（JWT/org/proj/PAT → 仓外缓存目录，0600）
pnpm discount:verify   # 交错双对 + 平台期轮询 + 本底窗对拍（~16 分钟，实测 ~60–90 分）
```

判定要点（详见手册）：比值落 0.50–0.75 = 生效（2026-11-04 实测 0.679 ≈ 0.67，等效 1.47x；晨间闲时 0.617 / 1.62x）；两臂同价（比值 ≈ 1.0）= 签名未生效（先查 `/zcode-plan status` 签名行，再核对官方协议常量是否升级）。**绝对刻度会随时段计量系数漂移（同日实测 ×2，两臂同比），比值判定免疫**。KV 缓存是最大误判源——缓存命中的输入按低价计费，历史「scene=1 → 3–4 分」折扣观察即同体重发的缓存假阳性：请求体必须互异全新（gen.mjs 时间种子），归一勿用 分/ktoken（输出系数是输入的 10 倍），用理论积分 = (in×2.3 + cached×1.7 + out×24)/10000。

两个提醒：

- **运行期间主会话零并发推理**——dsh 主会话与实验共享 quota 池，对拍必须单命令内完成（历史「PAT 多扣 20%」即并发自污染假象）；
- **5h 窗口尾部不跑**（余量不足读数不可信）；聚合延迟 1–2 分钟已由脚本内平台期等待吸收。

## 排障

| 症状 | 码 / 现象 | 处置 |
| --- | --- | --- |
| status 签名行「⚠ 止损中（连续失败 3）」，coding 端点新请求报错 | 握手连续失败进入止损态（拒绝新请求，避免按 ~1.5 刻度白扣） | `/zcode-plan refresh` 或重新 `/zcode-plan login`（重置计数并重握手）；持续失败则核对官方协议是否升级（常量在 `src/host/bigmodel/signing.ts`） |
| status 备注行报 `REF_CONFLICT`，登录被拒 | `ZCODE_PLAN_PAT` 被外部来源（启动环境 / 项目 `.env` / 主目录 `.env`）供值，本插件拒绝覆盖 | 删掉环境里的 `ZCODE_PLAN_PAT` 变量（或 `.credentials.yaml` `refs` 段的手工条目），重启 profile |
| status / refresh 报 `JWT_EXPIRED` | 登录态服务端已失效（JWT 无 exp，只能靠 401 感知） | 重新 `/zcode-plan login` |
| 续期报 `KEY_LOST` | 桥接 Key 在服务端已不存在（被手动删除） | 重新 `/zcode-plan login`，find-or-create 会再建同名 Key |
| 续期报 `RISK_3012` | 触发智谱风控惩罚 | **停止自动续期**（halt），别反复重试；等窗口重置后再手动 `/zcode-plan refresh`，仍失败则隔天再试 |
| status 用量行「读取失败（…）」 | quota/limit 读取失败，降级为一行说明，其余段照常 | 核对 Config 的 org / project 是否正确；确认已登录 |
| 容器部署 `/zcode-plan login` 后浏览器跳转「连接被拒」 | 回调服务器在容器回环，宿主机浏览器连不进来（预期行为） | 用**粘贴分支**：复制地址栏整条 URL 提交 `/zcode-plan login <url>`（见[三步上线](#三步上线)） |
| `route install` 报「当前 profile 没有 llm-pi-ai 行」 | providers 段没有宿主条目，无处落键 | 先让 profile 里存在 `llm-pi-ai` 条目，或用[手工路由 YAML](#手工路由-yaml不用-route-install-时的降级路径) |

## 软依赖与降级

- **`credentials` / `authorization` 缺一**：登录 flow 与 PAT owner 不装配（启动拉起、续期、login 全降级），`route` / `status` 仍可用；`status` 的登录 / Key / PAT 段按未登录渲染。
- **`commands` 缺席**：`/zcode-plan` 不出现，路由可用[手工 YAML](#手工路由-yaml不用-route-install-时的降级路径)注册。
- **`config-editor` / `llm` 缺席**：`route install` / `remove` 报服务不可用，`route status` 按「未安装」渲染。
- 各能力缺席时插件**零注册零报错**，不影响 profile 加载。

## 构建

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/zcode-plan   # dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：host 单工程
pnpm test          # vitest
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js
pnpm verify:all    # lint + typecheck + build + test
```

`lib/` 随仓库提交（release 时递归重建保证新鲜）。上游 API 只 type-only 引用（`dsh-authorization` / `dsh-credentials`），零运行时依赖打进产物。

## 许可

Apache-2.0。
