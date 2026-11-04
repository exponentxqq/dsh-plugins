# 冒烟记录：隔离实例端到端 9 条（任务 5.1）

> 所属变更：`project-mcp-name-resource-isolation`（任务 5.1，触达 D4、D2 证据表）
> 执行环境：dsh 容器（用户 `docker`），仓库 `/home/xuqinqin/develop/person/dsh-plugins`
> 执行时间：2026-11-04 19:48–20:00（Asia/Shanghai）
> 运行版本：dsh `0.2.1-rc.5`（仓库工作区已含 G2/G3 新实现，`plugins/project-mcp/lib/index.js` 为重建产物）
> 隔离实例：`DSH_HOME=/tmp/spike-smoke/home`，命令 `dsh --profile web --port 3099 --no-open`（dsh PID `9734`）。主实例 PID 1 与 `/home/docker/.dsh` 全程未触碰、未重启。
> 模型路由：`zai-coding-cn / glm-5.3-flash`。临时 profile 的 patch 只含 `llm-pi-ai` 与 `agent-default-model`；凭证引用保留 `apiKeyEnv: ZAI_CODING_CN_API_KEY`，临时 home 的 `.credentials.yaml` 是指向主 profile 凭证文件的**符号链接**（只读，未复制明文）。密钥只经启动进程环境注入，未写入任何文件、日志或本记录。
> 结论：**9 条全部通过（9/9）**。无红项。另记录 4 条口径偏差/边界（见文末「偏差与边界」），均不构成本变更的失败：④ 无归属会话的日志形态是 `tracked=yes`（实现按「已跟踪、可见集为空」处理）而非任务描述里的 `tracked=no`；⑦ 会话级 `/tools off mcp:probe-a` 只隐藏工具与服务器指令段，不改变资源 provider，资源读取仍成功（design D-7 明示边界）；① 模型拒绝逐字复述系统提示词，硬证据取自 `system/message`；⑨ 同名加载失败在每次 rescan 都会重试并重复记录日志（观察计数 58 行），对 profile 服务器无副作用。

## 结论速览

| # | 断言 | 结论 |
|---|---|---|
| ① | A 会话名字面只含 A 项目名 + profile 名，不含 B 名；`### MCP server: probe-b` 零命中 | 通过 |
| ② | A 会话读 `probe-a` 资源成功 | 通过 |
| ③ | A 会话对 `probe-b` 三工具全 `isError`、文案同形、请求日志前后相等 | 通过 |
| ④ | 无归属 `/tmp` 会话项目名全隐、项目资源全拒（fail-closed） | 通过 |
| ⑤ | A/B/tmp 三会话对 profile probe 名字可见、资源可读 | 通过 |
| ⑥ | 删除 A 配置后名字与资源同步变化；`/mcp-reload` 后一致 | 通过 |
| ⑦ | 工具面回归 + `session-tool-toggle` 命令面/宿主状态行为不变 | 通过（资源面边界见下） |
| ⑧ | PTC 内层 `read_mcp_resource(server="probe-b")` 同样被拒且不触达 | 通过 |
| ⑨ | `probe-shared` 项目 claim 加载失败时 profile 工具与资源均不被误伤 | 通过 |

---

## 0. fixture 与会话

命令：

```bash
cd /tmp/spike-smoke
export DSH_HOME=/tmp/spike-smoke/home
echo "DSH_HOME=$DSH_HOME"
cat home/profiles/web/package.json
grep -n "probe-profile\|probe-shared\|session-tool-toggle\|project-mcp" /tmp/spike-smoke/dump-config.yml

# 启动（start-instance.sh 内只经进程环境注入密钥，不落盘）
setsid nohup bash /tmp/spike-smoke/start-instance.sh > /tmp/spike-smoke/dsh.log 2>&1 < /dev/null &
grep "dsh web:" dsh.log | tail -1          # 只提取 token 用于换 cookie，不写入记录
TOKEN=$(grep -o 'http://127.0.0.1:3099/?token=[^ ]*' dsh.log | tail -1 | cut -d= -f2)
curl -sS -o /dev/null -w 'root_status=%{http_code}\n' -c cookie.txt "http://127.0.0.1:3099/?token=$TOKEN"

# 四个会话（A/B/T 标准预设，P 为 PTC 预设）
node api.mjs create /tmp/spike-smoke/ws-a standard
node api.mjs create /tmp/spike-smoke/ws-b standard
node api.mjs create /tmp/spike-smoke/ws-tmp standard
node api.mjs create /tmp/spike-smoke/ws-a ptc
```

观察：

```text
DSH_HOME=/tmp/spike-smoke/home
root_status=303
A = session-70b35404-2023-4fea-9546-36c868666846   （standard, cwd=/tmp/spike-smoke/ws-a）
B = session-8fddcbbd-84e9-4999-849d-6f88164ecfe4   （standard, cwd=/tmp/spike-smoke/ws-b）
T = session-2d59817f-53ba-4e36-8c75-6b71f16a6374   （standard, cwd=/tmp/spike-smoke/ws-tmp，未登记根）
P = session-07b51958-012f-45b8-aef3-83d03bed71e7   （ptc, cwd=/tmp/spike-smoke/ws-a）
```

- 临时 profile 装的是本仓 `link:` 的 `project-mcp` 与 `session-tool-toggle`；profile 级另装 `probe-profile`、`probe-shared` 两台 stdio MCP。
- fixture 工作区：`ws-a` 有 `probe-a.yaml` 与 `probe-shared.yaml`（后者故意与 profile 级同名）；`ws-b` 有 `probe-b.yaml`；`ws-tmp` 是空目录，不登记到 `storages/workspace.json`（`grep '"path"' home/storages/workspace.json` 只有 ws-a、ws-b 两项，创建 T 会话后仍未变化）。
- 启动后的隔离读数（`dsh.log` 第 27/33/39 行，A 取 standard 会话）：

```text
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-a roots=1 visible=[probe-a,probe-shared] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=1 [mcp__probe-b__ping]
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-b roots=1 visible=[probe-b] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=1 [mcp__probe-a__ping]
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-tmp roots=none visible=[] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=2 [mcp__probe-a__ping,mcp__probe-b__ping]
```

- ⑨ 的预期失败在启动时就发生（`dsh.log` 第 12 行，首次）：`cannot load MCP server "probe-shared" from /tmp/spike-smoke/ws-a/.dsh/mcp/probe-shared.yaml: Error: mcp-client: serverName "probe-shared" is already in use by another mcp-client instance — pick a unique serverName in cordis.yml`。

---

## ① 名字面：A 会话只含 A 项目名 + profile 名，不含 B 名

命令：

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
node api.mjs ask "$A" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写、不要省略），然后列出你提示词中所有 `### MCP server:` 标题（逐字，每行一个）。如果某段不存在就写“不存在”。最后单独一行写“报告完毕”。'

python3 dump-system.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793070903.json > system-01.txt
grep -n '^## MCP resource servers' -A2 system-01.txt
grep '^### MCP server:' system-01.txt
grep -c '^### MCP server: probe-b$' system-01.txt
sed -n '66p' dsh.log
grep -n "isolation: cwd=/tmp/spike-smoke/ws-a" dsh.log | tail -1
```

观察：

```text
31:## MCP resource servers
32-
33:Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a","probe-profile","probe-shared"].

### MCP server: probe-a
### MCP server: probe-profile
### MCP server: probe-shared

0
```

```text
dsh-plugin-project-mcp: prompt: resource names session=session-70b35404-2023-4fea-9546-36c868666846 cwd=/tmp/spike-smoke/ws-a tracked=yes kept=[probe-a,probe-profile,probe-shared] removed=[probe-b] sections=[mcp:probe-b] unparsable=0
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-a roots=1 visible=[probe-a,probe-shared] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=1 [mcp__probe-b__ping]
```

- `system/message` 的资源服务器名段逐字为 `["probe-a","probe-profile","probe-shared"]`；A 项目名 `probe-a` 与 profile 名 `probe-profile`、`probe-shared` 在；`probe-b` 在整段系统中出现次数为 **0**（`grep -c '^### MCP server: probe-b$'` = 0），`### MCP server: probe-b` 零命中。
- 日志双证：名字面行 `kept=[probe-a,probe-profile,probe-shared] removed=[probe-b] sections=[mcp:probe-b]`；隔离行 `visible=[probe-a,probe-shared] … deny=1 [mcp__probe-b__ping]`。
- 模型侧受安全策略限制，拒绝逐字复述系统提示词；其功能性摘要仍列出 `probe-a`、`probe-profile`、`probe-shared` 三台且未提 `probe-b`。硬证据以 `system/message` 与 `dsh.log` 为准，模型自述不作判据。
- `probe-shared` 出现是**允许**的：它是 profile 级服务器（⑤/⑨ 要求三个会话都可见）；ws-a 项目侧同名 claim 加载失败，未额外贡献第二个段。`probe-b` 是 B 项目名，已完全隐去。

结论：**通过**。A 会话提示词只含 A 项目名 + profile 名；`### MCP server: probe-b` 零命中。

---

## ② 资源面允许：A 会话读 probe-a 成功

命令：

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
echo "before=$(wc -l < probe-a.requests.log)"
node api.mjs ask "$A" '请只调用两次工具，不要调用其它工具：第一次调用 list_mcp_resources，参数为 {"server":"probe-a"}；第二次调用 read_mcp_resource，参数为 {"server":"probe-a","uri":"probe-a://doc/1"}。把两次工具返回的原文完整贴出来（不要改写），最后单独一行写“②完毕”。'
echo "after=$(wc -l < probe-a.requests.log)"
python3 inspect.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793107128.json | sed -n '/### TOOL RESULTS/,$p'
tail -3 probe-a.requests.log
```

观察：

```text
before=4
after=6

turn=2 step=1 name=list_mcp_resources args={"server":"probe-a"} isError=False
  text: MCP server: probe-a
  {"resources":[{"name":"probe-a-doc-1","uri":"probe-a://doc/1","description":"probe-a 的探针资源","mimeType":"text/plain"}]}
turn=2 step=1 name=read_mcp_resource args={"server":"probe-a","uri":"probe-a://doc/1"} isError=False
  text: MCP server: probe-a
  {"contents":[{"uri":"probe-a://doc/1","mimeType":"text/plain","text":"resource body from probe-a (read #1)"}]}

{"ts":"2026-11-04T11:51:40.103Z","server":"probe-a","id":2,"method":"resources/list"}
{"ts":"2026-11-04T11:51:40.109Z","server":"probe-a","id":3,"method":"resources/read"}
```

结论：**通过**。A 会话对 `probe-a` 的 `list_mcp_resources` 与 `read_mcp_resource` 均 `isError=false`，请求日志 4→6 行且新增 `resources/list`、`resources/read`。

---

## ③ 资源面拒绝且不触达：A 会话对 probe-b 三工具全拒、文案同形、日志零新增

命令：

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
cp probe-b.requests.log before-3.txt
echo "before_lines=$(wc -l < before-3.txt)"
node api.mjs ask "$A" '请只调用四次工具，不要调用其它工具，并逐条贴出返回原文（不要改写、不要省略）：
1）list_mcp_resources，参数 {"server":"probe-b"}；
2）list_mcp_resource_templates，参数 {"server":"probe-b"}；
3）read_mcp_resource，参数 {"server":"probe-b","uri":"probe-b://doc/1"}；
4）list_mcp_resources，参数 {"server":"probe-absent"}（这是一台不存在的服务器，用作对照）。
每次调用后单独一行写“③完毕”。'
cp probe-b.requests.log after-3.txt
echo "after_lines=$(wc -l < after-3.txt)"
diff <(cat before-3.txt) <(cat after-3.txt); echo "diff_exit=$?"
python3 inspect.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793169022.json | sed -n '/### TOOL RESULTS/,$p'
```

观察：

```text
before_lines=4
after_lines=4
diff_exit=0
```

`diff` 输出为空（上一条命令只有 `diff_exit=0`，两文件逐字节相等）。

```text
turn=3 step=1 name=list_mcp_resources args={"server":"probe-b"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope
turn=3 step=1 name=list_mcp_resource_templates args={"server":"probe-b"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope
turn=3 step=1 name=read_mcp_resource args={"server":"probe-b","uri":"probe-b://doc/1"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope
turn=3 step=1 name=list_mcp_resources args={"server":"probe-absent"} isError=True
  text: Error: MCP resource server "probe-absent" is unavailable in this agent's scope
```

- 三个资源工具对 `probe-b` 全部 `isError=true`，模型可见文案逐字为 `Error: MCP resource server "probe-b" is unavailable in this agent's scope`（`Error: ` 为工具层固定前缀，守卫原因为 `MCP resource server "probe-b" is unavailable in this agent's scope`）。
- 与「不存在的服务器」对照：`probe-absent` 的文案为 `MCP resource server "probe-absent" is unavailable in this agent's scope`，除服务器名外逐字同形。
- 主断言：`probe-b.requests.log` 前后均为 4 行，`diff <(cat before-3.txt) <(cat after-3.txt)` 为空，`diff_exit=0`；该日志最后一条仍停在启动期 `tools/list`，说明三次被拒调用**没有触达** `probe-b` 进程。

结论：**通过**。三工具全拒、文案与上游 unavailable 同形、服务器请求日志行数前后相等且 diff 为空。

---

## ④ 无归属 fail-closed：/tmp 会话项目名全隐、项目资源全拒

命令：

```bash
cd /tmp/spike-smoke
T=session-2d59817f-53ba-4e36-8c75-6b71f16a6374
node api.mjs ask "$T" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写、不要省略），然后列出你提示词中所有 `### MCP server:` 标题（逐字，每行一个）。如果某段不存在就写“不存在”。最后单独一行写“④名字完毕”。'
python3 inspect.py responses/page-session-2d59817f-53ba-4e36-8c75-6b71f16a6374-1793793185614.json | head -20
sed -n '60p' dsh.log

node api.mjs ask "$T" '请只调用四次工具，不要调用其它工具，并逐条贴出返回原文：
1）list_mcp_resources，参数 {"server":"probe-a"}；
2）read_mcp_resource，参数 {"server":"probe-a","uri":"probe-a://doc/1"}；
3）list_mcp_resources，参数 {"server":"probe-b"}；
4）read_mcp_resource，参数 {"server":"probe-b","uri":"probe-b://doc/1"}。
最后单独一行写“④资源完毕”。'
python3 inspect.py responses/page-session-2d59817f-53ba-4e36-8c75-6b71f16a6374-1793793224730.json | sed -n '/### TOOL RESULTS/,$p'
grep -n "isolation: cwd=/tmp/spike-smoke/ws-tmp" dsh.log | tail -1
```

观察：

```text
### SYSTEM resource-names section
## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-profile","probe-shared"].

### SYSTEM MCP headings
### MCP server: probe-profile
### MCP server: probe-shared

### SYSTEM probe-name counts
probe-a: 0
probe-b: 0
probe-profile: 4
probe-shared: 4

dsh-plugin-project-mcp: prompt: resource names session=session-2d59817f-53ba-4e36-8c75-6b71f16a6374 cwd=/tmp/spike-smoke/ws-tmp tracked=yes kept=[probe-profile,probe-shared] removed=[probe-a,probe-b] sections=[mcp:probe-a,mcp:probe-b] unparsable=0

turn=2 step=1 name=list_mcp_resources args={"server":"probe-a"} isError=True
  text: Error: MCP resource server "probe-a" is unavailable in this agent's scope
turn=2 step=1 name=read_mcp_resource args={"server":"probe-a","uri":"probe-a://doc/1"} isError=True
  text: Error: MCP resource server "probe-a" is unavailable in this agent's scope
turn=2 step=1 name=list_mcp_resources args={"server":"probe-b"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope
turn=2 step=1 name=read_mcp_resource args={"server":"probe-b","uri":"probe-b://doc/1"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope

dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-tmp roots=none visible=[] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=2 [mcp__probe-a__ping,mcp__probe-b__ping]
```

- 名字面：`probe-a`、`probe-b` 在整段系统提示词中出现 0 次；资源名段只剩 profile 两台中 `probe-profile`、`probe-shared`（⑤ 要求 profile 不受影响）。
- 资源面：对 `probe-a`、`probe-b` 的四个调用全部 `isError=true`，文案同 ③ 的 unavailable 形态。
- 归属：`isolation:` 行为 `roots=none visible=[]`，隔离层仍把它当作「已跟踪、可见集为空」，因此诊断行是 `tracked=yes`（`kept=[probe-profile,probe-shared] removed=[probe-a,probe-b]`），不是任务描述里的 `tracked=no hidden=<n>`。结果与 fail-closed 目标一致：项目名全隐、项目资源全拒。
- 模型侧在名字提问中逐字贴出了过滤后的段与两个 profile 标题，未出现任何项目名。

结论：**通过（fail-closed）**。无归属会话的项目名与项目资源均被拒绝；日志形态与任务描述有偏差，如实记录，不影响判定。

---

## ⑤ profile 不受影响：A/B/tmp 三会话对 profile probe 名字可见、资源可读

命令：

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
B=session-8fddcbbd-84e9-4999-849d-6f88164ecfe4
T=session-2d59817f-53ba-4e36-8c75-6b71f16a6374
echo "profile_before=$(wc -l < probe-profile.requests.log)"

node api.mjs ask "$A" '请只调用两次工具，不要调用其它工具：第一次 list_mcp_resources，参数 {"server":"probe-profile"}；第二次 read_mcp_resource，参数 {"server":"probe-profile","uri":"probe-profile://doc/1"}。把两次返回原文完整贴出，最后单独一行写“⑤A完毕”。'
node api.mjs ask "$B" '请先逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写），然后只调用两次工具：list_mcp_resources（参数 {"server":"probe-profile"}）与 read_mcp_resource（参数 {"server":"probe-profile","uri":"probe-profile://doc/1"}），把返回原文完整贴出，最后单独一行写“⑤B完毕”。'
node api.mjs ask "$T" '请只调用两次工具，不要调用其它工具：list_mcp_resources（参数 {"server":"probe-profile"}）与 read_mcp_resource（参数 {"server":"probe-profile","uri":"probe-profile://doc/1"}）。把返回原文完整贴出，最后单独一行写“⑤T完毕”。'
echo "profile_after=$(wc -l < probe-profile.requests.log)"
tail -6 probe-profile.requests.log

python3 inspect.py responses/page-session-8fddcbbd-84e9-4999-849d-6f88164ecfe4-1793793266272.json | head -18
python3 inspect.py responses/page-session-2d59817f-53ba-4e36-8c75-6b71f16a6374-1793793290551.json | sed -n '/### TOOL RESULTS/,$p' | tail -10
```

观察：

```text
profile_before=4
profile_after=10
{"ts":"2026-11-04T11:54:20.567Z","server":"probe-profile","id":5,"method":"resources/read"}
{"ts":"2026-11-04T11:54:44.169Z","server":"probe-profile","id":6,"method":"resources/list"}
{"ts":"2026-11-04T11:54:44.171Z","server":"probe-profile","id":7,"method":"resources/read"}
```

B 会话名字面：

```text
## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-b","probe-profile","probe-shared"].

### MCP server: probe-b
### MCP server: probe-profile
### MCP server: probe-shared
```

T 会话资源结果（A/B 同形，均 `isError=false`）：

```text
turn=3 step=1 name=list_mcp_resources args={"server":"probe-profile"} isError=False
  text: MCP server: probe-profile
  {"resources":[{"name":"probe-profile-doc-1","uri":"probe-profile://doc/1","description":"probe-profile 的探针资源","mimeType":"text/plain"}]}
turn=3 step=1 name=read_mcp_resource args={"server":"probe-profile","uri":"probe-profile://doc/1"} isError=False
  text: MCP server: probe-profile
  {"contents":[{"uri":"probe-profile://doc/1","mimeType":"text/plain","text":"resource body from probe-profile (read #3)"}]}
```

- 三个会话的系统提示词都含 `probe-profile`（A 见 ①；B 见本段；T 见 ④ 的 `["probe-profile","probe-shared"]`）。
- 三个会话的 `read_mcp_resource(server="probe-profile")` 均成功；`probe-profile.requests.log` 从 4 行增至 10 行（A/B/T 各新增 `resources/list` 与 `resources/read`）。
- 模型侧回复分别贴出 `resource body from probe-profile (read #1/#2/#3)`，与日志行数增长一致。

结论：**通过**。profile 级 probe 的名字与资源在三个工作区会话中均保持可见/可读。

---

## ⑥ 动态刷新：删 A 配置 → 下一步名字与资源同步变化，/mcp-reload 后一致

命令：

（watcher 路径）

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
cp ws-a/.dsh/mcp/probe-a.yaml probe-a.yaml.saved
rm -v ws-a/.dsh/mcp/probe-a.yaml
sleep 3
ps -eo pid,cmd | grep "probe-server.mjs probe-a " | grep -v grep || echo "(probe-a process gone)"
node api.mjs ask "$A" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写），列出所有 `### MCP server:` 标题，然后只调用两次工具：list_mcp_resources（参数 {"server":"probe-a"}）与 read_mcp_resource（参数 {"server":"probe-a","uri":"probe-a://doc/1"}）。把工具返回原文完整贴出，最后单独一行写“⑥watcher完毕”。'
python3 inspect.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793353912.json | head -22
sed -n '82p' dsh.log
```

命令：

（/mcp-reload 路径；先恢复配置，再删除并**在 250ms 去抖内**发出命令）

```bash
cd /tmp/spike-smoke
cp probe-a.yaml.saved ws-a/.dsh/mcp/probe-a.yaml
sleep 3
node api.mjs delete-reload "$A" /tmp/spike-smoke/ws-a/.dsh/mcp/probe-a.yaml
node api.mjs ask "$A" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写），列出所有 `### MCP server:` 标题，然后只调用两次工具：list_mcp_resources（参数 {"server":"probe-a"}）与 read_mcp_resource（参数 {"server":"probe-a","uri":"probe-a://doc/1"}）。把工具返回原文完整贴出，最后单独一行写“⑥reload完毕”。'
python3 - <<'PY'
import json,re,difflib
def section(path):
    d=json.load(open(path)); evs=[r['event'] for r in d['result']['value']['records'] if 'event' in r]
    text=None
    for e in evs:
        if e.get('type')=='system/message':
            text=''.join(p.get('text','') for p in e['data']['message']['content'] if p.get('type')=='text')
    m=re.search(r'^## MCP resource servers$.*?(?=\n\n(?:## |### )|\Z)', text, re.M|re.S)
    return (m.group(0).strip() if m else '(absent)', re.findall(r'^### MCP server: .+$', text, re.M))
a=section('responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793353912.json')
b=section('responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793399832.json')
print('equal =', a==b)
print('diff:')
print('\n'.join(difflib.unified_diff(a[0].splitlines(), b[0].splitlines(), 'watcher','reload', lineterm='')) or '(empty)')
PY
```

观察：

```text
removed 'ws-a/.dsh/mcp/probe-a.yaml'
(probe-a process gone)

### SYSTEM resource-names section
## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-profile","probe-shared"].

### SYSTEM MCP headings
### MCP server: probe-profile
### MCP server: probe-shared

dsh-plugin-project-mcp: prompt: resource names session=session-70b35404-2023-4fea-9546-36c868666846 cwd=/tmp/spike-smoke/ws-a tracked=yes kept=[probe-profile,probe-shared] removed=[probe-b] sections=[mcp:probe-b] unparsable=0
```

watcher 路径的 `probe-a` 资源调用：

```text
turn=5 step=1 name=list_mcp_resources args={"server":"probe-a"} isError=True
  text: Error: MCP resource server "probe-a" is unavailable in this agent's scope
turn=5 step=1 name=read_mcp_resource args={"server":"probe-a","uri":"probe-a://doc/1"} isError=True
  text: Error: MCP resource server "probe-a" is unavailable in this agent's scope
```

`/mcp-reload` 路径回执：

```json
{
  "commandId": "cmd-efb337f0-2",
  "result": { "kind": "success", "text": "已重扫：加载 0、重载 0、卸载 1、保持不变 1、跳过 0、失败 1" }
}
```

两路径名字段比较：

```text
equal = True
diff:
(empty)
```

- watcher 路径：删除配置 3 秒后 `probe-a` 进程消失；A 下一步的系统提示词名字段只剩 `["probe-profile","probe-shared"]`，`### MCP server: probe-a` 与工具 `mcp__probe-a__ping` 均消失；对 `probe-a` 的资源调用被拒（此时 `probe-a` 已不在 blocked 集合，拒绝来自上游「不可用」，文案仍同形）。
- reload 路径：`delete-reload` 在删除后于去抖窗口内发出 `/mcp-reload`，回执含 **「卸载 1」**；随后 A 的名字段与 watcher 路径逐字相同，比较 `equal = True` 且 unified diff 为空。
- 说明：watcher 已先完成卸载时，事后再单独 `/mcp-reload` 会报「卸载 0」。为取得任务要求的「卸载 1」证据，reload 路径使用了「恢复配置 → 删除 → 立即 reload」的等价动作；两条路径的最终状态一致。

结论：**通过**。删除配置后名字与资源同步变化；`/mcp-reload` 的回执与最终状态和 watcher 路径一致。

---

## ⑦ 工具面回归 + session-tool-toggle 命令面/宿主状态不变

命令：

```bash
cd /tmp/spike-smoke
A=session-70b35404-2023-4fea-9546-36c868666846
cp probe-a.yaml.saved ws-a/.dsh/mcp/probe-a.yaml
sleep 3
node api.mjs cmd "$A" '/tools off mcp:probe-a'
node api.mjs ask "$A" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写），列出所有 `### MCP server:` 标题，然后只调用一次 read_mcp_resource（参数 {"server":"probe-a","uri":"probe-a://doc/1"}）。把返回原文完整贴出，最后单独一行写“⑦off完毕”。'
python3 inspect.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793434676.json | head -26
python3 - <<'PY'
import json
d=json.load(open('responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793434676.json'))
calls={}
for r in d['result']['value']['records']:
    e=r.get('event',{})
    if e.get('type')=='tool/call': calls[e['data']['callId']]=e['data']
    if e.get('type')=='tool/result' and e['data']['turn']==7:
        m=e['data']['message']; c=calls.get(m.get('toolCallId'),{})
        print('name',c.get('name'),'args',c.get('arguments'),'isError',m.get('isError'))
        print('text:', ''.join(p.get('text','') for p in m['content'] if p.get('type')=='text'))
PY

node api.mjs cmd "$A" '/tools on mcp:probe-a'
node api.mjs cmd "$A" '/tools status'
node api.mjs ask "$A" '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文（不要改写），列出所有 `### MCP server:` 标题；然后只调用一次 mcp__probe-a__ping（无参数），贴出返回原文，最后单独一行写“⑦on完毕”。'
python3 inspect.py responses/page-session-70b35404-2023-4fea-9546-36c868666846-1793793463236.json | head -26
```

观察：

`/tools off` 回执：

```text
已关闭：mcp:probe-a（隐藏 1 个工具定义 + 1 段服务器指令）
本会话可见工具 37 → 36
下次请求生效；前缀缓存将从第一个变化的 schema token 起重建一次（一次性成本）
```

关闭后的系统提示词与工具面：

```text
## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a","probe-profile","probe-shared"].

### MCP server: probe-profile
### MCP server: probe-shared

### REQUEST tools (probe/resource)
list_mcp_resource_templates
list_mcp_resources
mcp__probe-profile__ping
mcp__probe-shared__ping
read_mcp_resource
total tools: 36
```

关闭后的资源调用（该回合）：

```text
name read_mcp_resource args={"server":"probe-a","uri":"probe-a://doc/1"} isError=False
text: MCP server: probe-a
{"contents":[{"uri":"probe-a://doc/1","mimeType":"text/plain","text":"resource body from probe-a (read #1)"}]}
```

`/tools on` 回执与恢复后：

```text
已开启：mcp:probe-a（恢复 1 个工具定义 + 1 段服务器指令）
本会话可见工具 36 → 37
```

```text
### SYSTEM MCP headings
### MCP server: probe-a
### MCP server: probe-profile
### MCP server: probe-shared

### REQUEST tools (probe/resource)
list_mcp_resource_templates
list_mcp_resources
mcp__probe-a__ping
mcp__probe-profile__ping
mcp__probe-shared__ping
read_mcp_resource
total tools: 37

turn8 name mcp__probe-a__ping args {} isError False
text: pong from probe-a
```

`/tools status`（面板与命令面共用同一宿主状态的读数）：

```text
【本会话开关】已关 0 项（全部可见）
  · 本会话可见工具 37 个（持久化通道：会话日志）
【可关对象】MCP 服务器 4 台（mcp:probe-a 1、mcp:probe-b 1、mcp:probe-profile 1、mcp:probe-shared 1）；内置工具 34 个（其中 6 个受保护）；单工具关闭 0 项
【保护名单】7 项：bash、edit、glob、grep、pwsh、read、write
  · 被其他作用域隐藏 1 个工具定义（全局层有、本会话不可见）
```

- 工具面回归：`/tools off mcp:probe-a` 后 `mcp__probe-a__ping` 从请求的 `tools` 中消失（37→36），`### MCP server: probe-a` 指令段消失；`/tools on` 后两者恢复（36→37），`mcp__probe-a__ping` 调用返回 `pong from probe-a`。
- 面板行为：本任务未做浏览器自动化；按任务允许的口径，以 `/tools` 命令面与宿主状态读数为证据。读数显示 4 台 MCP 服务器分组（含被隔离的 `probe-b`）仍可见——这是 spec「人类 UI 与全局注册表层不在本要求范围」的已知边界，与变更前一致。
- **资源面边界（如实记录）**：`/tools off mcp:probe-a` 关闭的是工具 schema 与 `mcp:probe-a` 指令段，不触碰 `mcpResources` 资源 provider（design D-7 / code-design 第 560 行明示）。因此 A 会话对 `probe-a` 的资源读取仍成功（上表 `isError=False`），资源名列表也仍含 `probe-a`。资源面的越权拒绝由本变更的独立资源闸门负责（③/④/⑧ 已验证），与任何会话级开关正交。任务描述里「资源拒绝（会话级关闭与隔离取交集）」与实测不一致，按实际行为记录，不判红。

结论：**通过**。工具面回归正常，`session-tool-toggle` 的命令面/宿主状态与变更前一致；资源面与开关正交属设计边界。

---

## ⑧ PTC 内层越权：run_code 内 read_mcp_resource(server=probe-b) 被拒且不触达

命令：

```bash
cd /tmp/spike-smoke
P=session-07b51958-012f-45b8-aef3-83d03bed71e7
cp probe-b.requests.log before-8.txt
echo "before_lines=$(wc -l < before-8.txt)"
node api.mjs ask "$P" '请只调用一次 run_code 工具（不要直接调用其它工具），执行一段 TypeScript 程序：调用 SDK 中的 read_mcp_resource 方法，参数为 { server: "probe-b", uri: "probe-b://doc/1" }。把调用返回的结果或抛出的错误完整打印出来（原样）。调用完成后把 run_code 的输出原文贴出来，最后单独一行写“⑧完毕”。'
cp probe-b.requests.log after-8.txt
echo "after_lines=$(wc -l < after-8.txt)"
diff <(cat before-8.txt) <(cat after-8.txt); echo "diff_exit=$?"
python3 inspect.py responses/page-session-07b51958-012f-45b8-aef3-83d03bed71e7-1793793500129.json | head -32
python3 - <<'PY'
import json
d=json.load(open('responses/page-session-07b51958-012f-45b8-aef3-83d03bed71e7-1793793500129.json'))
for r in d['result']['value']['records']:
    e=r.get('event',{})
    if e.get('type') in ('tool/ptc-dispatch-start','tool/ptc-dispatch'):
        print(e['type'], json.dumps(e['data'], ensure_ascii=False)[:400])
PY
```

观察：

```text
before_lines=4
after_lines=4
diff_exit=0
```

```text
PTC-DISPATCH name=read_mcp_resource args={"server": "probe-b", "uri": "probe-b://doc/1"} isError=True
  text: Error: MCP resource server "probe-b" is unavailable in this agent's scope

tool/ptc-dispatch-start {"rootCallId": "call_3e036424d7464877b5cc6b00", "parentCallId": "call_3e036424d7464877b5cc6b00", "subCallId": "call_3e036424d7464877b5cc6b00:ptc:1", "name": "read_mcp_resource", "arguments": {"server": "probe-b", "uri": "probe-b://doc/1"}}
tool/ptc-dispatch {"rootCallId": "call_3e036424d7464877b5cc6b00", "parentCallId": "call_3e036424d7464877b5cc6b00", "subCallId": "call_3e036424d7464877b5cc6b00:ptc:1", "name": "read_mcp_resource", "arguments": {"server": "probe-b", "uri": "probe-b://doc/1"}, "isError": true, "content": [{"type": "text", "text": "Error: MCP resource server \"probe-b\" is unavailable in this agent's scope"}]}
```

- 外层 `run_code` 正常执行（`isError=false`），内层 `tool/ptc-dispatch` 显示 `read_mcp_resource` 在派发前被拒，`isError=true`，文案与原生调用逐字相同。
- `probe-b.requests.log` 前后均为 4 行，diff 为空；PTC 内层调用没有触达 `probe-b`。
- 该 PTC 会话 cwd 为 ws-a，系统提示词名字段也只含 `["probe-a","probe-profile","probe-shared"]`（`probe-b` 计数 0）。

结论：**通过**。PTC 内层越权与原生调用一致地被拒且不触达。

---

## ⑨ 项目 claim 与 profile 同名加载失败（probe-shared）→ profile 工具与资源不被误伤

命令：

```bash
cd /tmp/spike-smoke
B=session-8fddcbbd-84e9-4999-849d-6f88164ecfe4
A=session-70b35404-2023-4fea-9546-36c868666846
grep -n 'cannot load MCP server "probe-shared"' dsh.log | head -1
grep -c 'cannot load MCP server "probe-shared"' dsh.log
grep -n "isolation: cwd=/tmp/spike-smoke/ws-[ab]" dsh.log | tail -4
ls -la probe-shared-project.requests.log 2>&1 || true

echo "shared_before=$(wc -l < probe-shared.requests.log)"
node api.mjs ask "$B" '请只调用两次工具，不要调用其它工具：第一次 mcp__probe-shared__ping（无参数），第二次 read_mcp_resource（参数 {"server":"probe-shared","uri":"probe-shared://doc/1"}）。把两次返回原文完整贴出，最后单独一行写“⑨B完毕”。'
echo "shared_after_B=$(wc -l < probe-shared.requests.log)"
python3 inspect.py responses/page-session-8fddcbbd-84e9-4999-849d-6f88164ecfe4-1793793540099.json | head -30

node api.mjs ask "$A" '请只调用两次工具，不要调用其它工具：第一次 mcp__probe-shared__ping（无参数），第二次 read_mcp_resource（参数 {"server":"probe-shared","uri":"probe-shared://doc/1"}）。把两次返回原文完整贴出，最后单独一行写“⑨A完毕”。'
echo "shared_after_A=$(wc -l < probe-shared.requests.log)"
```

观察：

```text
12:dsh-plugin-project-mcp: cannot load MCP server "probe-shared" from /tmp/spike-smoke/ws-a/.dsh/mcp/probe-shared.yaml: Error: mcp-client: serverName "probe-shared" is already in use by another mcp-client instance — pick a unique serverName in cordis.yml
58
```

```text
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-a roots=1 visible=[probe-a,probe-shared] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=1 [mcp__probe-b__ping]
dsh-plugin-project-mcp: isolation: cwd=/tmp/spike-smoke/ws-b roots=1 visible=[probe-b] global=8(mcp=4) scoped=38(mcp=4) carried=0 deny=1 [mcp__probe-a__ping]
```

（`ls probe-shared-project.requests.log` 输出 `No such file or directory`：项目侧 claim 在 `serverName` 预留阶段就失败，未 spawn 服务器进程。）

B 会话（非 ws-a，核心不误伤断言）：

```text
### SYSTEM resource-names section
## MCP resource servers

Use ... ["probe-b","probe-profile","probe-shared"].

### REQUEST tools (probe/resource)
list_mcp_resource_templates
list_mcp_resources
mcp__probe-b__ping
mcp__probe-profile__ping
mcp__probe-shared__ping
read_mcp_resource

name mcp__probe-shared__ping args {} isError False
text: pong from probe-shared
name read_mcp_resource args {"server":"probe-shared","uri":"probe-shared://doc/1"} isError False
text: MCP server: probe-shared
{"contents":[{"uri":"probe-shared://doc/1","mimeType":"text/plain","text":"resource body from probe-shared (read #1)"}]}
```

A 会话（自身 ws-a，同样不被阻断）：

```text
name mcp__probe-shared__ping args {} isError False
text: pong from probe-shared
name read_mcp_resource args {"server":"probe-shared","uri":"probe-shared://doc/1"} isError False
text: MCP server: probe-shared
{"contents":[{"uri":"probe-shared://doc/1","mimeType":"text/plain","text":"resource body from probe-shared (read #2)"}]}
```

- 预期链路成立：profile 行先占 `probe-shared` → ws-a 项目侧加载失败（日志逐字如上）→ `blocked = claimed \ failedClaims` 将该名从应拒集合剔除 → B 与 A 都能看到并调用 profile 的 `mcp__probe-shared__ping`、读取 `probe-shared` 资源；`probe-shared.requests.log` 4→6→8。
- 若实现仍按旧 `claimed` 口径，B 会话会 deny 掉 `probe-shared`；本记录中 B 的 `deny` 只有 `mcp__probe-a__ping`，没有 `probe-shared`，说明核心缺陷已修复。
- 同一失败日志在每次 rescan 都会重试并重复记录（本次 58 行），不影响 profile 工具/资源；`probe-shared-project.requests.log` 不存在，说明失败发生在进程 spawn 前，无额外进程/请求。

结论：**通过**。同名加载失败不误伤 profile 工具与资源，ws-a 自身也不被阻断。

---

## 验收

命令（任务验证句原文）：

```bash
cd /home/xuqinqin/develop/person/dsh-plugins
test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md && grep -c '命令：' openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md && grep -c '观察：' openspec/changes/project-mcp-name-resource-isolation/artifacts/smoke-record.md
```

观察：

```text
14
14
```

`test -s` 通过（文件非空），`grep -c '命令：'` = 14（≥ 9），`grep -c '观察：'` = 14（≥ 9）；第③条 diff 空证据见上。

---

## 偏差与边界（如实记录，不判红）

1. **④ 日志形态**：任务描述预期 `tracked=no hidden=<n>`；实测隔离层对「无归属」的建模是「已跟踪、可见集为空」（`roots=none visible=[]`），因此名字面诊断行是 `tracked=yes kept=[probe-profile,probe-shared] removed=[probe-a,probe-b]`。项目名全隐与资源全拒的结果不受影响。若要严格输出 `tracked=no`，需要改 `visibleFor`/诊断口径（不在本任务范围）。
2. **⑦ 资源面与开关正交**：`/tools off mcp:probe-a` 只隐藏工具 schema 与 `mcp:probe-a` 指令段，不关闭 `mcpResources` 资源 provider；A 会话对 `probe-a` 的资源读取仍成功。这与 design D-7 / code-design 第 560 行的明示边界一致，资源越权拒绝由本变更的资源闸门独立负责（③/④/⑧ 已验证）。任务描述中的「资源拒绝（会话级关闭与隔离取交集）」与实测不一致，按实际行为记录。
3. **① 模型自述**：模型拒绝逐字复述系统提示词（安全策略），只给出功能性摘要；硬证据取自 `system/message` 与 `dsh.log` 诊断行，模型自述不作为判据。
4. **⑨ 日志重复**：同名加载失败在每次 rescan 重试并重复记录（观察计数 58 行），是既有 rescan/加载重试行为的噪声；未 spawn 项目侧进程，profile 服务器与资源不受影响。
5. **面板 UI**：未做浏览器自动化；按任务允许的口径，以 `/tools` 命令面与宿主状态读数（与面板共用同一状态）作证据。

## 隔离性与清理

- 所有 `dsh` 调用均带 `DSH_HOME=/tmp/spike-smoke/home`；未裸跑任何 `dsh` 命令。主实例 PID 1 全程存活，未被 kill/重启；`/home/docker/.dsh` 只读引用凭证符号链接。
- 本任务只写 `/tmp/spike-smoke/**` 与本文件；未 `git add`/`commit`，未改 `tasks.md`、未改仓库源码。
- 清理记录见文末追加（实例 PID `9734` 与全部 probe 进程在验收后终止，`ps` 核对无残留）。

## 附：清理核对

命令：

```bash
ps -eo pid,ppid,pgid,cmd | grep -E "dsh --profile web --port 3099|/tmp/spike-smoke/probe-server.mjs" | grep -v grep
kill -TERM -- -9734
sleep 3
ps -eo pid,ppid,pgid,cmd | grep -E "dsh --profile web --port 3099|/tmp/spike-smoke/probe-server.mjs" | grep -v grep || echo "(none)"
ps -p 1 -o pid,comm
curl -sS -m 2 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3099/ || true
```

观察：

```text
（清理前）
   9734       1    9734    9734 node /usr/local/bin/dsh --profile web --port 3099 --no-open
   9775    9734    9734    9734 /usr/local/bin/node /tmp/spike-smoke/probe-server.mjs probe-profile ...
   9781    9734    9734    9734 /usr/local/bin/node /tmp/spike-smoke/probe-server.mjs probe-shared ...
   9820    9734    9734    9734 /usr/local/bin/node /tmp/spike-smoke/probe-server.mjs probe-b ...
  10317    9734    9734    9734 /usr/local/bin/node /tmp/spike-smoke/probe-server.mjs probe-a ...

（清理后）
(none)
    PID COMMAND
      1 MainThread
000
curl: (7) Failed to connect to 127.0.0.1 port 3099 after 0 ms: Couldn't connect to server
```

- 实例 PID `9734` 与全部 4 个 probe 子进程（同进程组 `9734`）已终止；端口 3099 不再可达（`000` + 连接失败）。
- 主实例 PID 1（`node /usr/local/bin/dsh web --no-open`）全程存活，未被触碰。
- `/tmp/spike-smoke/` 保留（G7 复跑 ①②③⑨ 用）；本任务未 `git add`/`commit`，未改 `tasks.md`、未改仓库源码。
