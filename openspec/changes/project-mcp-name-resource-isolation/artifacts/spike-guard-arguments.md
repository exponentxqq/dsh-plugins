# spike 1.2：守卫参数形态实证（端口 3098）

> 触达面：D4；**无源码改动**。独立实例 + 临时探针插件（源码在 `artifacts/spike-guard-plugin/`，link: 安装，不进产物）。
> 结论：**6/6 通过**——per-agent `tools.guard` 能拿到 `execution.arguments`；原生调用、`run_code` 内层 PTC dispatch（`parent` 为真）、缺参、非字符串、profile 级服务器五种形态均按预期观测；被 deny 的三次调用**没有触达**目标服务器（`probe-b` 请求日志行数前后相等，且最后一条仍停在启动期）。

## 1. 环境与 fixture

| 项 | 值 |
| --- | --- |
| `DSH_HOME` | `/tmp/spike-guard/home`（临时目录；主 `DSH_HOME` 只读参考凭证 refs 与 `workspace.json` 形状，未写入） |
| 实例 | `dsh --profile web --port 3098 --no-open`（容器内 `127.0.0.1`） |
| 工作区 A | `/tmp/spike-guard/ws-a`（`.dsh/mcp/probe-a.yaml` → `probe-a`） |
| 工作区 B | `/tmp/spike-guard/ws-b`（`.dsh/mcp/probe-b.yaml` → `probe-b`） |
| profile 级服务器 | `mcp-probe-profile` 行：`serverName: probe-profile` |
| 模型路由 | `zai-coding-cn / glm-5.3 / max`（从主 profile 摘出，保留 `apiKeyEnv: ZAI_CODING_CN_API_KEY` 引用；密钥仅经启动进程环境注入，未写入任何文件或日志） |
| 探针服务器 | `/tmp/spike-guard/probe-server.mjs`（纯 Node、无依赖 stdio JSON-RPC）：`initialize`（非空 instructions）/`tools/list`（`ping`）/`tools/call`/`resources/list`（`<名>://doc/1`）/`resources/read`；每个收到的请求 `appendFileSync` 一行到 `/tmp/spike-guard/probe-X.requests.log` |
| 探针插件 | `artifacts/spike-guard-plugin/`（`dsh-plugin-spike-guard`，无 `dsh.bundle`；profile 用户层 insert 挂载） |
| 认证 | 启动日志里的 `?token=` 换 `dsh-auth` cookie（`/tmp/spike-guard/cookie.txt`） |

profile 用户层（`/tmp/spike-guard/home/profiles/web/cordis.patch.yml`）关键行：

```yaml
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config: { provider: zai-coding-cn, model: glm-5.3, reasoningEffort: max }
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      zai-coding-cn: { apiKeyEnv: ZAI_CODING_CN_API_KEY, reasoning: max }
- insert:
    - id: mcp-probe-profile
      name: "@deepseek-ai/dsh-mcp-client"
      config: { serverName: probe-profile, transport: stdio, command: /usr/local/bin/node,
                args: [/tmp/spike-guard/probe-server.mjs, probe-profile, /tmp/spike-guard/probe-profile.requests.log] }
    - id: spike-guard
      name: "dsh-plugin-spike-guard"
```

探针插件核心（`artifacts/spike-guard-plugin/index.js`）：

```js
agent.ctx.tools.guard((exec) => {
  console.log('[spike-guard] ' + JSON.stringify({
    at: new Date().toISOString(),
    name: exec.name, arguments: exec.arguments,
    agent: exec.agent !== undefined, parent: exec.parent !== undefined,
  }))
  if (RESOURCE_TOOLS.has(exec.name) && typeof exec.arguments?.server === 'string'
      && exec.arguments.server === 'probe-b') {
    return 'spike deny: probe-b is not in this workspace'
  }
  return undefined
})
```

安装（两个包都用 `link:`，不改 profile 外的任何文件）：

```console
$ DSH_HOME=/tmp/spike-guard/home dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp
dsh: initialized profile web at /tmp/spike-guard/home/profiles/web
+ dsh-plugin-project-mcp link:/home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp
Done in 262ms using pnpm v10.29.3

$ DSH_HOME=/tmp/spike-guard/home dsh plugin --profile web add \
    /home/xuqinqin/develop/person/dsh-plugins/openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-guard-plugin
+ dsh-plugin-spike-guard link:…/artifacts/spike-guard-plugin
dsh: warning: dsh-plugin-spike-guard declares no dsh.bundle — installed as a plain dependency, not a profile layer
Done in 279ms using pnpm v10.29.3
```

启动命令（`/tmp/spike-guard/start-instance.sh` 内的密钥读取只走进程环境，不落盘）：

```console
$ DSH_HOME=/tmp/spike-guard/home dsh --profile web --port 3098 --no-open > /tmp/spike-guard/dsh.log 2>&1
$ grep -E "isolation:|dsh web:" /tmp/spike-guard/dsh.log | tail -3
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-guard/ws-a roots=1 visible=[probe-a] global=7(mcp=3) scoped=37(mcp=3) carried=0 deny=1 [mcp__probe-b__ping]
dsh-plugin-project-mcp: isolation: masked 1 tool(s) in one session: [mcp__probe-b__ping]
dsh web: http://127.0.0.1:3098/?token=…
```

`probe-b` 属于 ws-b 的项目级配置、在本实例中**确实已加载并可调用**（因此「deny 后零请求」不是空真）：启动期 `probe-b.requests.log` 有 `server/discover` + `initialize` + `tools/list` 六行；上面的 `deny=1 [mcp__probe-b__ping]` 也证明它的工具已注册、只是被既有工具面隔离掩蔽。

会话（下面为响应体 `result` 摘录，完整响应还带 `type/rpcId` 封装）：

```console
$ node /tmp/spike-guard/api.mjs create /tmp/spike-guard/ws-a
{"result":{"ok":true,"value":{"sessionId":"session-67f204f5-62ba-4d00-a106-00e547242050","agentPreset":"standard"}}}
$ node /tmp/spike-guard/api.mjs create /tmp/spike-guard/ws-a ptc
{"result":{"ok":true,"value":{"sessionId":"session-51299e1a-6df3-4338-a3c4-c027fef7eb1f","agentPreset":"ptc"}}}
```

`standard` preset 会话 `session-67f204f5-62ba-4d00-a106-00e547242050`（cwd=ws-a）承担①②④⑤（原生侧）⑥；`ptc` preset 会话 `session-51299e1a-6df3-4338-a3c4-c027fef7eb1f`（cwd=ws-a）承担③与⑤（PTC 侧）。两个会话的 guard 都由 `agent/created` 装入（记录里 `"agent":true`）。

## 2. 六条场景

### ① 原生 `list_mcp_resources(server="probe-b")`

**命令：**

```console
$ wc -l /tmp/spike-guard/probe-b.requests.log > /tmp/spike-guard/before-1.txt
$ node /tmp/spike-guard/api.mjs prompt session-67f204f5-62ba-4d00-a106-00e547242050 \
  '请只做一件事：调用 list_mcp_resources 工具，参数 server 传字符串 "probe-b"。调用一次即可，然后把工具返回的完整错误文本（原文）贴出来。不要调用其它工具，不要改写参数。'
$ node /tmp/spike-guard/api.mjs page session-67f204f5-62ba-4d00-a106-00e547242050
$ node /tmp/spike-guard/summarize.mjs /tmp/spike-guard/responses/page-session-67f204f5-62ba-4d00-a106-00e547242050.json
```

**观察（守卫日志逐字）：**

```json
[spike-guard] {"at":"2026-11-04T09:03:01.421Z","name":"list_mcp_resources","arguments":{"server":"probe-b"},"agent":true,"parent":false}
```

**观察（会话事件与模型回答）：**

```text
[tool/call seq=18] list_mcp_resources "{\"server\":\"probe-b\"}"
[tool/result seq=19] isError=true Error: spike deny: probe-b is not in this workspace
[assistant seq=22] 工具返回的完整错误文本（原文）如下：
                  Error: spike deny: probe-b is not in this workspace
```

结论：守卫看到 `arguments.server === "probe-b"`（字符串）、在派发前弹出固定拒绝理由；模型侧报告 `isError`，错误文案与守卫返回值同形。`diff before-1/after` 为空（见 §3）。

结果：通过

### ② 原生 `read_mcp_resource(server="probe-b", uri="probe-b://doc/1")`

**命令：**

```console
$ wc -l /tmp/spike-guard/probe-b.requests.log > /tmp/spike-guard/before-2.txt
$ node /tmp/spike-guard/api.mjs prompt session-67f204f5-62ba-4d00-a106-00e547242050 \
  '请只做一件事：调用 read_mcp_resource 工具，参数 server 传字符串 "probe-b"，uri 传字符串 "probe-b://doc/1"。调用一次即可，然后把工具返回的完整错误文本（原文）贴出来。不要调用其它工具，不要改写参数。'
```

**观察（守卫日志逐字）：**

```json
[spike-guard] {"at":"2026-11-04T09:06:11.613Z","name":"read_mcp_resource","arguments":{"server":"probe-b","uri":"probe-b://doc/1"},"agent":true,"parent":false}
```

**观察（会话事件与模型回答）：**

```text
[tool/call seq=31] read_mcp_resource "{\"server\":\"probe-b\",\"uri\":\"probe-b://doc/1\"}"
[tool/result seq=32] isError=true Error: spike deny: probe-b is not in this workspace
[assistant seq=35] 工具返回的完整错误文本（原文）如下：
                  Error: spike deny: probe-b is not in this workspace
```

结论：带 `uri` 的第二类资源工具同样在派发前被拒；`probe-b` 请求日志无新增。

结果：通过

### ③ PTC 内层：`run_code` 代码里调用同一资源工具

**命令：**

```console
$ wc -l /tmp/spike-guard/probe-b.requests.log > /tmp/spike-guard/before-3.txt
$ node /tmp/spike-guard/api.mjs prompt session-51299e1a-6df3-4338-a3c4-c027fef7eb1f \
  '请只调用一次 run_code 工具（不要直接调用其它工具），执行一段 TypeScript 程序：调用 SDK 中的 read_mcp_resource 方法，参数为 { server: "probe-b", uri: "probe-b://doc/1" }。把调用返回的结果或抛出的错误完整打印出来（原样）。调用完成后把 run_code 的输出原文贴出来。'
```

**观察（守卫日志逐字，含 `parent` 的内层记录）：**

```json
[spike-guard] {"at":"2026-11-04T09:15:32.780Z","name":"run_code","arguments":{"code":"try {\n  const result = await tools.read_mcp_resource({ server: \"probe-b\", uri: \"probe-b://doc/1\" }); …","description":"Call read_mcp_resource on probe-b server"},"agent":true,"parent":false}
[spike-guard] {"at":"2026-11-04T09:15:32.860Z","name":"read_mcp_resource","arguments":{"server":"probe-b","uri":"probe-b://doc/1"},"agent":true,"parent":true}
```

**观察（`run_code` 输出原文摘录，`isError=false`——错误被程序 catch 后打印）：**

```text
=== read_mcp_resource 抛出错误 ===
BindingCallError [ToolCallError]: spike deny: probe-b is not in this workspace
    at bindingFailure (file:///usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/process.js:902:22)
    …
```

结论：`run_code` 外层记录的 `parent` 为 false（模型直呼），其内部 `read_mcp_resource` 记录 `"parent":true`，证明 PTC 内层 sub-dispatch 走**同一条** pre-execute/guard 管线；拒绝理由同样以 `ToolCallError` 回到程序里，`probe-b` 零请求。

结果：通过

### ④ 缺 `server` 参数：`list_mcp_resources {}`

**命令：**

```console
$ node /tmp/spike-guard/api.mjs prompt session-67f204f5-62ba-4d00-a106-00e547242050 \
  '请只做一件事：调用 list_mcp_resources 工具，但这次不传任何参数（也就是不要传 server）。即便工具定义要求 server 也照做，只调用一次，然后把工具返回的完整错误原文贴出来。不要改用其他工具，不要补上 server。'
```

**观察（守卫日志逐字）：**

```json
[spike-guard] {"at":"2026-11-04T09:09:57.039Z","name":"list_mcp_resources","arguments":{},"agent":true,"parent":false}
```

**观察（会话事件与模型回答）：**

```text
[tool/call seq=59] list_mcp_resources "{}"
[tool/result seq=60] isError=true Error: invalid arguments: missing required property "server"
[assistant seq=63] 工具返回的完整错误原文如下：
                  Error: invalid arguments: missing required property "server"
```

结论：守卫**放行**（没有 deny 文案），参数交回上游工具校验并报缺参；同时得到一个重要事实——`execution.arguments` 在「模型没给参数」时是**空对象 `{}`**，不是 `undefined`，守卫实现必须按对象处理。

结果：通过

### ⑤ `server` 非字符串

原生路径先做了两次尝试：模型被要求传数字 `123` / 对象 `{}`，但模型实际发出的 tool-call 参数分别是字符串 `"123"` 与 `"{}"`（守卫日志逐字如下，均因不是 `probe-b` 而放行）：

```json
[spike-guard] {"at":"2026-11-04T09:11:18.840Z","name":"list_mcp_resources","arguments":{"server":"123"},"agent":true,"parent":false}
[spike-guard] {"at":"2026-11-04T09:12:53.537Z","name":"list_mcp_resources","arguments":{"server":"{}"},"agent":true,"parent":false}
```

上游据此报 `Error: MCP resource server "123" is unavailable in this agent's scope` / `… "{}" …`。为拿到**真正的非字符串**，改在 PTC 内层由代码直传 `number`：

**命令：**

```console
$ node /tmp/spike-guard/api.mjs prompt session-51299e1a-6df3-4338-a3c4-c027fef7eb1f \
  '再只调用一次 run_code（不要直接调用其它工具），执行一段 TypeScript 程序：调用 SDK 中的 list_mcp_resources 方法，参数对象为 { server: 123 }——server 必须是 JSON 数字 123，不能加引号，不能转成字符串。把调用返回的结果或抛出的错误完整打印出来（原样）。调用完成后把 run_code 的输出原文贴出来。'
```

**观察（守卫日志逐字）：**

```json
[spike-guard] {"at":"2026-11-04T09:16:29.335Z","name":"run_code","arguments":{"code":"try {\n  const result = await tools.list_mcp_resources({ server: 123 }); …","description":"Call list_mcp_resources with numeric server"},"agent":true,"parent":false}
[spike-guard] {"at":"2026-11-04T09:16:29.377Z","name":"list_mcp_resources","arguments":{"server":123},"agent":true,"parent":true}
```

**观察（`run_code` 输出原文摘录）：**

```text
=== list_mcp_resources 抛出错误 ===
BindingCallError [ToolCallError]: invalid arguments: "server" must be a string
    at bindingFailure (…/dsh-ptc-runtime-node/lib/process.js:902:22)
    …
```

结论：守卫看到 `arguments.server` 为 JSON 数字 `123`（非字符串），**放行**；上游参数校验报 `invalid arguments: "server" must be a string`，未派发到 MCP 层（`probe-b` 与 `probe-a` 日志均无新增）。原生路径的「模型把非字符串改写成字符串」是实测偏差，见 §5。

结果：通过

### ⑥ profile 级服务器 `probe-profile`

**命令：**

```console
$ node /tmp/spike-guard/api.mjs prompt session-67f204f5-62ba-4d00-a106-00e547242050 \
  '请做两件事，都只调用一次工具，不要改写参数：①调用 list_mcp_resources，参数 server 传字符串 "probe-profile"；②调用 read_mcp_resource，参数 server 传字符串 "probe-profile"，uri 传字符串 "probe-profile://doc/1"。然后把两次工具返回的原文分别贴出来。不要调用其它工具。'
```

**观察（守卫日志逐字，均放行）：**

```json
[spike-guard] {"at":"2026-11-04T09:07:02.692Z","name":"list_mcp_resources","arguments":{"server":"probe-profile"},"agent":true,"parent":false}
[spike-guard] {"at":"2026-11-04T09:07:02.698Z","name":"read_mcp_resource","arguments":{"server":"probe-profile","uri":"probe-profile://doc/1"},"agent":true,"parent":false}
```

**观察（会话事件原文）：**

```text
[tool/call seq=44] list_mcp_resources "{\"server\":\"probe-profile\"}"
[tool/result seq=45] isError=false MCP server: probe-profile
                    {"resources":[{"name":"probe-profile-doc","uri":"probe-profile://doc/1","mimeType":"text/plain"}]}
[tool/call seq=46] read_mcp_resource "{\"server\":\"probe-profile\",\"uri\":\"probe-profile://doc/1\"}"
[tool/result seq=47] isError=false MCP server: probe-profile
                    {"contents":[{"uri":"probe-profile://doc/1","mimeType":"text/plain","text":"resource body from probe-profile"}]}
```

`probe-profile` 服务器侧请求日志同时从 6 行增至 8 行（`resources/list`、`resources/read` 各一条），证明调用真实到达了 profile 级服务器：

```text
2026-11-04T09:07:02.696Z resources/list 2
2026-11-04T09:07:02.700Z resources/read 3
```

结论：profile 级服务器名不在本会话的 `probe-b` 拒绝判定内，守卫放行并成功取回资源；探针按参数原样记录 `arguments.server === "probe-profile"`。

结果：通过

## 3. deny 后目标服务器零请求（主断言）

`probe-b` 请求日志只增不减；三条 deny 调用（①②③）发送前各记一次行数，三条全部结束后复核：

```console
$ cd /tmp/spike-guard
$ wc -l probe-b.requests.log > before-1.txt   # 场景①发送前
$ wc -l probe-b.requests.log > before-2.txt   # 场景②发送前
$ wc -l probe-b.requests.log > before-3.txt   # 场景③发送前
$ wc -l probe-b.requests.log > after-all.txt  # ①②③全部结束后
$ cat before-1.txt before-2.txt before-3.txt after-all.txt
6 probe-b.requests.log
6 probe-b.requests.log
6 probe-b.requests.log
6 probe-b.requests.log
$ diff <(cat before-1.txt) <(cat after-all.txt) && echo "DIFF-EMPTY"
DIFF-EMPTY
$ diff <(cat before-2.txt) <(cat after-all.txt) && echo "DIFF-EMPTY"
DIFF-EMPTY
$ diff <(cat before-3.txt) <(cat after-all.txt) && echo "DIFF-EMPTY"
DIFF-EMPTY
```

加强证据：日志最后一行仍是实例启动期的 `tools/list`，时间早于三次 deny 调用：

```console
$ tail -1 probe-b.requests.log
{"time":"2026-11-04T08:58:07.755Z","instance":"probe-b","id":1,"method":"tools/list","params":null}
```

三次 deny 调用的守卫时间分别是 `09:03:01Z`、`09:06:11Z`、`09:15:32Z`（见 §2），说明 deny 在 `tools/pre-execute` 之后的 guard 阶段就返回了，**没有走到 dispatch**。

## 4. 验收

```console
$ [ "$(grep -c '^结果：通过' openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-guard-arguments.md)" -eq 6 ] && echo "PASS: 6/6"
PASS: 6/6
```

（PTC `parent` 记录见 §2③；`diff` 为空的证据见 §3。）

## 5. 偏差、边界与清理

- **⑤ 原生路径拿不到非字符串**：两次原生尝试中，模型按工具 schema 把 `123` / `{}` 实际发成了字符串 `"123"` / `"{}"`（守卫日志如实记录）。真正的非字符串形态改由 PTC 内层代码直传 `number 123` 获得（守卫放行 + 上游 `invalid arguments: "server" must be a string`），已如实记录，不静默。
- **缺参形态是 `{}` 而非 `undefined`**：`execution.arguments` 是冻结 JSON 对象；后续 `resourceGuardReason` 的形参类型与单测应按「总是对象」建模（`typeof args.server === 'string'` 判定足够，无需判 `arguments === undefined`）。
- **PTC 拒绝的错误表面**：内层拒绝在 `run_code` 里表现为 `BindingCallError [ToolCallError]: spike deny: …`；`run_code` 自身 `isError=false`（程序 catch 了错误）。若程序不 catch，则应按普通工具错误冒泡——本 spike 只验证了 guard 参数与「是否触达」，不改变上游此行为。
- **⑥ 不是 deny 场景**，因此不纳入 §3 的零请求断言；它的正向证据是服务器侧 `resources/list`/`resources/read` 真实到达。
- **不触达主环境**：主 dsh（PID 1）与 `/home/docker/.dsh` 全程只读；未改 `plugins/` 任何源码、未 `git add`/`commit`、未改 `tasks.md`。本 spike 的实例与 3 个 probe 进程已终止并核对无残留：

```console
$ ps -eo pid,args | grep '[p]robe-server.mjs' || echo "NO probe-server process"
NO probe-server process
$ ps -eo pid,args | grep '[d]sh --profile web --port 3098' || echo "NO dsh 3098 process"
NO dsh 3098 process
$ ps -p 1 -o pid,args --no-headers
1 node /usr/local/bin/dsh web --no-open
```

- `/tmp/spike-guard/` fixture（DSH_HOME、两工作区、probe 服务器、探针插件安装、日志与响应）保留，供复核。
