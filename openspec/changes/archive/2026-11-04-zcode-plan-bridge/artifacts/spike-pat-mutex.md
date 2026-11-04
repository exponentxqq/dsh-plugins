# spike：同 Key 并发两 PAT 互斥

- 日期：2026-11-03
- 变更：zcode-plan-bridge（组 1 探路 spike，对应 tasks.md 1.4 / design.md A8）
- 实测对象：存量 Key `arch-company`（`usageScene===1`，keyId 脱敏为 `4892c4…ac3c`），
  列表共 6 把 Key，其中 scene=1 仅此一把 → 未新建探针 Key，未触碰任何存量 Key 配置。
- 凭证纪律：登录 JWT 现读 `/home/docker/.cache/zcode-rate-test/.token`（0600）入 shell 变量；
  两张换出的 PAT 全程 shell 变量、用完即弃、未落盘；本文所有 token 类值以 `<Nch>` 占位。

## API 形状（沿前序实测第二轮已验证形状）

- 换 PAT：`POST https://bigmodel.cn/api/biz/v1/organization/{org}/projects/{proj}/api_keys/{keyId}/access_tokens`
  - 头：`Authorization: Bearer <JWT>` + `content-type: application/json`
  - 体：`{"clientType":"zcode","clientVersion":"0.17.0"}`
- 模型请求：`POST https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`
  - 头：`Authorization: Bearer <PAT>`
- 列 Key：`GET https://bigmodel.cn/api/biz/v1/organization/{org}/projects/{proj}/api_keys`

## 步骤与脱敏响应

### 1. 列 Key，选定 scene=1 Key

```
GET .../api_keys  → http=200, code=200, count=6
[{"name":"默认项目(613127)","apiKey":"f1551b…7f56","usageScene":-1},
 {"name":"arch-company","apiKey":"4892c4…ac3c","usageScene":1},
 {"name":"arch-home-mac","apiKey":"1be609…aa6d","usageScene":3},
 {"name":"zcode-api-key","apiKey":"fd7ec4…7c42","usageScene":3},
 ...（其余 3 把均为 scene=3，略）]
```

### 2. 第一次 POST access_tokens → PAT①

```
POST .../api_keys/{keyId}/access_tokens  → http=200
{"code":200,"msg":"操作成功","data":{"enabled":true,"accessToken":"<459ch>",
 "tokenType":"Bearer","expiresIn":12073,"expiresAt":1793688364}}
```

### 3. 第二次 POST access_tokens（背靠背连发）→ PAT②

```
POST .../api_keys/{keyId}/access_tokens  → http=200
{"code":200,"msg":"操作成功","data":{"enabled":true,"accessToken":"<459ch>",
 "tokenType":"Bearer","expiresIn":12072,"expiresAt":1793688364}}
```

逐字节比较两响应的 accessToken：**完全相同**（同一张 token，非两张）。

### 4. 用 PAT① 发一次模型请求

请求体 78 字节，`{"model":"glm-5.3","messages":[{"role":"user","content":"hi"}],"max_tokens":1}`：

```
POST https://open.bigmodel.cn/api/coding/paas/v4/chat/completions  → http=200
（响应为正常 completions 结构，finish/content 因 max_tokens=1 被截断，无 401、无 error 字段）
```

## 判读

- 第二次签发后，第一次取得的 PAT① 仍通过模型请求（200，非 401）→ **不互斥**。
- 且实测比「不互斥」更强：同 Key 连发两次 `access_tokens` 返回**同一张 token**——
  `expiresIn` 从 12073 → 12072 仅差 1s（同一 token 的剩余期读数），`expiresAt` 完全相同（1793688364）。
  服务端语义是「find-or-return 现行有效 token」的幂等签发，而非每次签发新 token。
- U2 旁证（PAT 效期字段）：字段名 `expiresIn`（单位秒）+ `expiresAt`（epoch 秒）。
  本次 `expiresIn=12073` 远小于文档满值 18000s，倒推签发时点 ≈ 2026-11-03 09:46:04 +08:00
  （= expiresAt − 18000s），恰为前序实测第二轮 B③（09:40）对同 Key 换 PAT 的时点——
  即本任务两次连发拿到的是 B③ 当时签发、至今仍有效的同一张 PAT，实测效期约 3.35h 剩余 / 5h 满值。
- 对 A8 的含义：多实例共存不仅不互斥，而且天然共享同一张现行 PAT（各实例各自调
  access_tokens 会拿到同一 token），无需实例间协调；唯一需处理的是到期续期（提前 120s，
  见前序 README 结论），续期后旧 token 是否立即失效本次未测（不在本任务范围）。
- 探针 Key：未新建（已存在 scene=1 存量 Key），无删除动作，Key 列表 6 把与实验前一致。
- 风控：全程未出现 405[3012]；模型验证请求仅发一次。

结论：不互斥
