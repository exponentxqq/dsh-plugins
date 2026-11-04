# spike：org/project 程序化发现

- 日期：2026-11-03（Asia/Shanghai）
- 任务：tasks.md 1.1（T0 组 1 探路 spike）
- 目的：验证登录 JWT 能否程序化发现默认 `organization`/`project`（design.md D-9：管理面统一 `Authorization: Bearer <JWT>`）；证不出则判定 Config 必填（Q4 已接受）。
- 凭据：JWT 取自 `/home/docker/.cache/zcode-rate-test/.token`（0600，三段式），仅经 shell 变量使用，本文档与其余任何文件均不含 JWT 值。顺带钉死：该 JWT payload **无 `exp`/`iat` 等时间声明**，仅含身份字段 `user_type` / `user_channel` / `user_id` / `user_key` / `customer_id` / `username`（值一律不落档）。
- 请求纪律执行情况：每端点各试 2 种请求形态（apex 域 + www 域，均为只读 GET，无 body）后按纪律停止；全程未出现 405[3012] 风控码，未出现 401/403。

## 端点 1：GET /api/biz/v1/customerInfo

命令形状（形态 1 = apex 域；形态 2 = 同请求换 `https://www.bigmodel.cn` 域）：

```bash
JWT=$(cat /home/docker/.cache/zcode-rate-test/.token)
curl -sS --compressed -o /tmp/spike-customerInfo.json -w '%{http_code}' \
  -X GET -H "Authorization: Bearer $JWT" -H 'Accept: application/json' \
  'https://bigmodel.cn/api/biz/v1/customerInfo'
```

输出片段（响应全文 82 字节，无敏感字段，两形态逐字节一致）：

```json
{"code":404,"msg":"接口不存在: /v1/customerInfo","data":null,"success":false}
```

- HTTP 状态码：200（apex 与 www 均为 200，业务层报错）
- 响应顶层结构：`{ code, msg, data, success }`；`code=404`、`success=false`、`data=null`
- org/project 相关键位置：无——`data` 为 null，整包不含任何 org/project 键

## 端点 2：GET /api/biz/v1/organizations

命令形状（形态 1 = apex 域；形态 2 = 同请求换 `https://www.bigmodel.cn` 域）：

```bash
JWT=$(cat /home/docker/.cache/zcode-rate-test/.token)
curl -sS --compressed -o /tmp/spike-organizations.json -w '%{http_code}' \
  -X GET -H "Authorization: Bearer $JWT" -H 'Accept: application/json' \
  'https://bigmodel.cn/api/biz/v1/organizations'
```

输出片段（响应全文 83 字节，无敏感字段，两形态逐字节一致）：

```json
{"code":404,"msg":"接口不存在: /v1/organizations","data":null,"success":false}
```

- HTTP 状态码：200（apex 与 www 均为 200，业务层报错）
- 响应顶层结构：`{ code, msg, data, success }`；`code=404`、`success=false`、`data=null`
- org/project 相关键位置：无——`data` 为 null，整包不含任何 org/project 键

## 观察

- `msg` 回显的是去掉 `/api/biz` 前缀后的路径（`/v1/customerInfo`、`/v1/organizations`），说明请求已被网关正常路由进 biz 后端，是后端对「无此路由」的权威回答，**不是鉴权失败**（全程无 401/403，亦无风控码）；换 www 域结果逐字节一致，可排除域名分流的干扰。
- biz 服务本身在 `/api/biz/v1` 下存在已知可用路由：`GET /api/biz/v1/organization/{org}/projects/{proj}/api_keys`（先期 `test-b.sh:25` 实测，见 code-design §3.4）——该入口的路径本身就要求调用方已持有 org/proj，无法反向枚举出默认值。
- 登录 JWT payload 无 `exp`：登录态效期不在 JWT 内表达，只能靠 PAT 换发响应的三级兜底（code-design §3.4「PAT 效期解析」），与本结论无冲突。
- 对 design.md D-9 来源优先级（Config > 登录后自动发现 > 报错并在 status 点名）的影响：**「登录后自动发现」分支证伪**，`organization`/`project` 为 Config 必填（Q4 已接受），缺省时报错并在 status 点名（§3.2 已备代码路径）；用户可从控制台/用量页 URL 拿到这两个 id（code-design U3 预案一致）。

结论：降级：Config 必填（Q4 已接受）
