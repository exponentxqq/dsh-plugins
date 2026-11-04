# spike：tokenByAuthCode 契约

- 日期：2026-11-03
- 目的：消解 U1 —— `POST https://bigmodel.cn/api/auth/tokenByAuthCode` 的 body 字段名、JWT 字段名、JWT exp。
- 方法：一次性 authCode 实测 5 发（风控上限内）+ zcode 开源仓库源码佐证（github.com/zai-org/zcode，浅克隆 @ HEAD，下述文件行号以该快照为准）。
- 脱敏：authCode/JWT 值一律 `<authCode 43ch>` / `<Nch>` 占位。

## 一、实测五发（POST https://bigmodel.cn/api/auth/tokenByAuthCode）

| # | Content-Type | body 形状 | HTTP | 业务码 | msg / 响应键名 |
|---|--------------|-----------|------|--------|----------------|
| 1 | application/json | `{"authCode":"<authCode 43ch>","appId":"zcode"}` | 200 | 1500 | `应用密钥不能为空`；键：`msg`,`code` |
| 2 | application/json | `{"code":"<authCode 43ch>","appId":"zcode"}` | 200 | 1500 | 同上 |
| 3 | application/json | `{"authCode":"<authCode 43ch>"}` | 200 | 1500 | 同上 |
| 4 | application/json | `{"authCode":"<authCode 43ch>","appId":"zcode","state":"<32hex>"}` | 200 | 1500 | 同上 |
| 5 | application/x-www-form-urlencoded | form：`authCode`,`code`,`appId`,`state` | 200 | 500 | `<str 76ch>`（未展开，配额已尽）；键：`msg`,`code` |

- 前四发同错「应用密钥不能为空」→ 报错语义是**缺 `appSecret`（应用密钥）字段**，不是字段名错；code 均未被消费（参数校验阶段拒绝）。
- 第 5 发表单编码业务码变为 500，进入另一校验分支，但配额已用尽（≤5 发纪律），未再展开。

## 二、源码钉死契约（apps/zcode-cli/packages/adapters/src/auth/bigmodel-oauth.ts）

`exchangeCode` 实际请求体：

```json
{ "appId": "zcode", "appSecret": "<应用密钥>", "authCode": "<一次性授权码>" }
```

- Content-Type：`application/json`；字段名唯一：授权码 = **`authCode`**（与回调 query 字段一致；`code` 不是该接口的合法字段名）。
- `appSecret` 必填：缺失时客户端在发请求前即抛 `BigModel OAuth appSecret is required.`（测试 `tests/auth.test.ts:658` 佐证）；缺失时服务端稳定返回业务码 1500「应用密钥不能为空」。
- `appSecret` 来源：env `BIGMODEL_OAUTH_APP_SECRET`（`packages/services/src/oauth/providers/bigmodelProviderConfig.ts:43`）；注释明确「历史 fallback secret 已废弃，不能再把内置密钥打进运行时配置」——**官方客户端已不内置该密钥，仅保留旧接口兼容**。
- 响应封套：`{ data: { accessToken, refreshToken? }, msg }` —— 授权成功时 BigModel 业务 access token 在 **`data.accessToken`**。

## 三、现行生产路径已不走该接口（对 bridge 更重要）

`packages/services/src/oauth/providers/bigmodelProviderConfig.ts`：生产 `tokenUrl = https://zcode.z.ai/api/v1/oauth/token`。`bigmodelProviderAdapter.ts` 的 `exchangeZcodeJwtToken`：

- 请求：`POST` JSON `{ "provider": "bigmodel", "code": "<authCode>", "redirect_uri": "<redirectUri>", "state": "<state>" }`，Content-Type `application/json`，**无需 appSecret**。
- 成功判定：业务码 `code === 0`（或缺省）；zcode JWT 在 **`data.token`**；BigModel 业务 access token 在 **`data.bigmodel.access_token`**；refresh token 在 `data.bigmodel.refresh_token`（或 `refreshToken`）。
- 注释明确：BigModel 一次性 authCode「现在只交给 zcode token 路由」消费；直连 tokenByAuthCode 的旧路径已被移除。

## 四、JWT 结构与 exp

- JWT 三段式（`header.payload.signature`），客户端本地 base64url 解 payload 取 **`exp`**（秒级 Unix 时间戳，必有且必须为正数，`packages/shared/src/oauth.ts:167 resolveJwtExpiration`，30s 时钟偏移容忍）。
- `iat` 等其他字段：源码未消费、未断言，无法佐证存在与否。
- exp 相对有效期：**未实测**（五发配额内未换取到真实 token）；服务端签发时长源码不可见，需换取真实 JWT 后本地解码补测。

## 五、第二轮实测（主会话执行：现行端点真实换证，2026-11-03 13:38）

**用户二次授权**（新 state `f34cc354…`，loopback `127.0.0.1:29188`），回调 URL 交回后取 authCode 兑现行端点（一次成功）：

```
POST https://zcode.z.ai/api/v1/oauth/token
content-type: application/json
{"provider":"bigmodel","code":"<authCode 43ch>","redirect_uri":"http://127.0.0.1:29188/oauth/callback/bigmodel","state":"f34cc354…"}

HTTP 200 → {"code":0,"msg":"","data":{...},"logid":"..."}
```

响应结构（脱敏）：

```jsonc
{"code": 0, "msg": "",
 "data": {
   "token": "<204ch>",                      // zcode 侧 JWT
   "user": {"user_id":"38671775194613127","email":"wz****in@gmail.com","name":"DoubleQ"},
   "bigmodel": {"access_token":"<332ch>"}   // ★ 管理面登录 JWT（本插件要的那枚）
 },
 "logid": "..."}
```

两枚 token 本地解码（无网络）：

| 字段 | 长度 | payload 键 | exp |
|---|---|---|---|
| `data.token`（zcode JWT） | 204 | `user_id`,`token_version`,`sub`,`iat` | **无 exp** |
| `data.bigmodel.access_token`（BigModel 登录 JWT） | 332 | `user_type`,`user_channel`,`user_id`,`user_key`,`customer_id`,`username` | **无 exp**（仅身份声明） |

- `data.bigmodel.access_token` 与旧 `.token`（用量页 JWT）payload 同形 —— 两者等价，**这是管理面唯一要用的凭据**；`data.token` 仅供 zcode 自身，不进本插件。
- `data.bigmodel.refresh_token`：本次响应**未出现**（源码称「或 refreshToken」为可选），不依赖它续期（登录态失效即重登，JWT 无 exp 无法预判）。

**管理面可用性验证**（A2 假设，新 JWT + `Authorization: Bearer`）：

```
GET https://bigmodel.cn/api/biz/v1/organization/{org}/projects/{proj}/api_keys
HTTP 200, {"code":200,...,"data":[6 把 Key]}
name=默认项目(613127) usageScene=-1 / arch-company scene=1 / arch-home-mac scene=3
/ zcode-api-key scene=3 / home scene=3 / develop scene=3
```

→ 新端点签发的 JWT **直通管理面**（列 Key 成功），与用量页 JWT 等价；`arch-company`(usageScene=1) 即 find-or-create 会命中的存量桥接 Key。

## 六、旧 authCode 复用尝试（负面证据）

旧 authCode（第一轮，43ch）打现行端点 → `HTTP 500 {"code":2007,"msg":"http error"}`——一次性，已消费/过期，**换证必须新授权**。

结论：钉死：**换证端点 = `POST https://zcode.z.ai/api/v1/oauth/token`**（非 `bigmodel.cn/api/auth/tokenByAuthCode`，后者需官方已不内置的 appSecret，废弃）；body=`{provider:"bigmodel", code:<authCode>, redirect_uri, state}` 四字段 JSON、免 appSecret；成功判定 `code===0`；**管理面 JWT = `data.bigmodel.access_token`**（332ch 同旧 JWT 形状），`data.token` 为 zcode 侧 JWT 不使用；JWT **无 exp**（效期只能靠 401 感知，PAT 续期另按 `expiresAt`）；`refresh_token` 本次未下发、不依赖。

