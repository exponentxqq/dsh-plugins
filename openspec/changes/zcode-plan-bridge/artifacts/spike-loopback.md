# spike：authorize 端点对 loopback redirect 的校验

- 变更：zcode-plan-bridge（组 1 / 任务 1.3）
- 日期：2026-11-03
- 执行方式：主会话构造授权 URL + 用户浏览器实点（涉及用户浏览器登录态，无法委托子代理重放）

## 官方权威形态（先钉端点本体）

`POST https://zcode.z.ai/api/v1/oauth/cli/init`（Bearer poll_token，body `{"provider":"bigmodel"}`，HTTP 200，code 0）下发：

```
authorize_url = https://bigmodel.cn/login?appId=zcode
                &redirect=https%3A%2F%2Fzcode.z.ai%2Fapi%2Fv1%2Foauth%2Fcli%2Fcallback%2Fbigmodel
                &state=<32hex>
```

- authorize 端点本体 = **`https://bigmodel.cn/login`**（SPA 路由；`/api/auth/authorize` 已证伪：带 JWT 访问返回 `404 path=/authorize`，不带则被网关以 1001 拦——真实后端无此路由）。
- 参数名钉死：`appId` / `redirect`（urlencoded）/ `state`（32hex）。
- 官方现行主路径为「服务端轮询」（`/oauth/cli/init` + `/oauth/cli/poll/:flow_id`，poll_interval 2s，flow 时效 ≈5min），其 redirect 指向 `zcode.z.ai` 服务端；本地 callback（auth-login.md v2 文档所述）是并存的客户端路径。

## loopback 实测（浏览器实点）

构造同形 URL，仅把 redirect 换成本地 loopback：

```
https://bigmodel.cn/login?appId=zcode
  &redirect=http%3A%2F%2F127.0.0.1%3A29187%2Foauth%2Fcallback%2Fbigmodel
  &state=2f26e941043d5c8a5fa8faba55dbc2da
```

用户在已登录 bigmodel.cn 的浏览器打开并完成授权，浏览器被服务端重定向到：

```
http://127.0.0.1:29187/oauth/callback/bigmodel?authCode=<43ch 一次性感凭证，脱敏>&state=2f26e941043d5c8a5fa8faba55dbc2da
```

观察：

- 服务端**接受 loopback redirect 并 302 签发 authCode**——RFC 8252 豁免已实现，未报 redirect 非法。
- `state` 原样回传，与请求一致（校验通过）。
- 回调 query 字段名为 **`authCode`**（非 `code`；auth-login.md「authCode or code」二者兼容中的实测主形态）。

## 部署形态事实（对 T5 的影响）

- 授权完成瞬间浏览器指向 `127.0.0.1:29187` 时**连接被拒**：loopback 服务器运行于 dsh 容器回环，用户浏览器在宿主，回环隔离 + 端口未映射——**容器部署形态下回调分支收不到宿主浏览器的跳转**。
- 实测路径即 design D-3 的「粘贴」分支：用户从地址栏复制完整回调 URL 交回插件（authCode 从 URL 提取，state 校验通过）。`code-design.md` §3.6 提示文案「容器内请复制回调 URL」与实测一致，粘贴分支是本部署的**主用路径**。
- `callbackServer: true` 默认保留（Q5 不改默认）：同机部署（宿主直跑）回调分支可用，粘贴分支双形态兜底；T5 实现确保粘贴分支健壮（URL 容错解析：带不带 scheme、编码差异）。

## 结论

放行——loopback redirect 被服务端接受并回传 `authCode` + `state`；`callbackServer` 默认维持 `true`，容器部署下粘贴分支为主用路径（不触发 Q5 降级）。

## 复现（2026-11-03 13:35，第二轮授权）

第二轮换成 `127.0.0.1:29188` + 新 state `f34cc354…` 再次授权，服务端同样 302 到 `http://127.0.0.1:29188/oauth/callback/bigmodel?authCode=<43ch>&state=f34cc354…`——**loopback 放行可稳定复现**（两次独立授权、不同端口/state，参数一致：`appId=zcode`，query 字段名 `authCode`，`state` 原样回传）。第二轮 authCode 已成功兑出登录 JWT（见 `spike-token-contract.md` 第五节），闭环证明「authorize→authCode→换证」链路在 loopback redirect 下完整可用。

