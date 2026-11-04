# Spike 1.1 记录：名字面段契约与组装行为实证

> 所属变更：`project-mcp-name-resource-isolation`（任务 1.1，触达 D4；**无源码改动**）
> 执行环境：dsh 容器（用户 `docker`），仓库 `/home/xuqinqin/develop/person/dsh-plugins`
> 执行时间：2026-11-04 16:44–17:05（Asia/Shanghai）
> 运行版本：dsh `0.2.1-rc.2`、Node `v24.21.0`
> 隔离实例：`DSH_HOME=/tmp/spike-name/home`，命令 `dsh --profile web --port 3099 --no-open`，dsh 进程 PID `4342`（启动 shell PID `4338`）。主实例 PID 1 与 `/home/docker/.dsh` 全程未触碰、未重启。
> 模型路由：`zai-coding-cn / glm-5.3-flash`。临时 profile 的 patch 只含 `llm-pi-ai` 与 `agent-default-model`；凭证引用保留 `apiKeyEnv: ZAI_CODING_CN_API_KEY`，临时 home 的 `.credentials.yaml` 是指向主 profile 凭证文件的**符号链接**（只读，不复制明文；本 spike 未在任何文件/日志/输出中写出密钥）。
> 结论：**五条全部通过（5/5）**。无红项，按任务约定停在组 1，不进入组 2。

## 结论速览

| # | 断言 | 结论 |
|---|---|---|
| ① | 资源服务器名段逐字形态（`## MCP resource servers` + 句末 `["a","b"].`） | 通过 |
| ② | `mcp:<server>` 段名与 `### MCP server: <name>` 标题 | 通过 |
| ③ | 段对象带 `interpolate: false` | 通过 |
| ④ | 未打标签的 `ctx.on('system-prompt/assemble')` 收到每个 scope 的装配；改写 `assembly.sections` 后下一步生效 | 通过 |
| ⑤ | `complete` 段存在时 mutations 被丢弃 | 通过 |

---

## 0. 隔离性与 fixture 摘要

- 临时 home：`/tmp/spike-name/home`。`storages/workspace.json` 按 workspace 领域 v2 最小登记两个工作区（`initialized: true`、`workspaceIds` 两项、`tables.workspaces` 含 `path/title/sessionIds/createdAt/updatedAt`）。
- 两个工作区：`/tmp/spike-name/ws-a`、`/tmp/spike-name/ws-b`；各自只放一份项目级 MCP 配置 `.dsh/mcp/probe-a.yaml` / `.dsh/mcp/probe-b.yaml`，`serverName` 取文件名。
- 探针服务器：`/tmp/spike-name/probe-server.mjs`（纯 Node、零依赖、stdio JSON-RPC 最小实现）。每台提供 `ping` 工具、一条资源、非空 `initialize.instructions`，并把每个收到的 JSON-RPC 请求追加一行到自己的请求日志。
- 探针插件：`openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-plugin/`（`link:` 安装进临时 profile，不进产物）。未打标签注册 `ctx.on('system-prompt/assemble', …)`；观察模式只记录，改写模式（标记文件 `/tmp/spike-name/rewrite.on` 存在时）删除 `mcp:probe-b`、重写名字数组并追加哨兵段，全部在 `await next()` 之后进行。
- 启动后两台服务器都完成连接：`probe-a.requests.log` / `probe-b.requests.log` 各含 `server/discover`、`initialize`、`notifications/initialized`、`tools/list` 四行（见附录 C）。
- 临时 profile 只装 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-plugin-project-mcp`（本仓 `link:`）、`dsh-plugin-spike-name-probe`（本 spike 探针）。未装 multi-root 包，project-mcp 按软依赖降级只扫两个主根。
- 主实例证据：全程只在 `/tmp/spike-name/*` 与 `openspec/.../artifacts/` 内写入；未改 `plugins/` 源码，未 `git add`/`git commit`，未改 `tasks.md`。

---

## 1. 断言①：资源服务器名段逐字形态

**命令：**

```bash
cd /tmp/spike-name
python3 - <<'PY'
import json
line = next(l for l in open('logs/web.log', encoding='utf-8') if l.startswith('SPIKE-ASSEMBLE '))
d = json.loads(line[len('SPIKE-ASSEMBLE '):])
sec = next(s for s in d['before'] if s['name'] == 'mcp-resource-servers')
print(json.dumps({'name': sec['name'], 'interpolate': sec['interpolate'], 'text': sec['text']}, ensure_ascii=False, indent=2))
PY
```

**观察：**

```json
{
  "name": "mcp-resource-servers",
  "interpolate": false,
  "text": "## MCP resource servers\n\nUse list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: [\"probe-a\",\"probe-b\"]."
}
```

- 段名 `mcp-resource-servers`；文本以 `## MCP resource servers` 开头、以 `["probe-a","probe-b"].` 的句号结尾；名字按字典序（`probe-a` 在 `probe-b` 前），与两台服务器的注册顺序无关。
- 与上游 `dsh-mcp-resources/lib/index.js:119-128` 的模板逐字一致：`## MCP resource servers\n\nUse … with one of these names as the server argument: ${JSON.stringify(names)}.`；`names` 先排序、空数组返回空字符串。
- 不是「只有监听器能看到」：ws-a 会话第 1 轮真实 `system/message`（seq 7，6030 字符）中该段全文同样出现，句末数组为 `["probe-a","probe-b"]`。

**补充命令（真实渲染面核对）：**

```bash
cd /tmp/spike-name
python3 - <<'PY'
import json
d = json.load(open('page-wsa-1.json'))['body']['result']['value']
msg = next(r['event'] for r in d['records'] if r['event']['type'] == 'system/message')
text = msg['data']['message']['content'][0]['text']
lines = text.split('\n')
start = lines.index('## MCP resource servers')
print('\n'.join(lines[start:start+7]))
print('长度', len(text), '| 含 probe-a 标题', '### MCP server: probe-a' in text, '| 含 probe-b 标题', '### MCP server: probe-b' in text)
PY
```

输出：

```text
## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a","probe-b"].

### MCP server: probe-a

Spike probe server probe-a.
长度 6030 | 含 probe-a 标题 True | 含 probe-b 标题 True
```

结果：通过

---

## 2. 断言②：`mcp:<server>` 段名与 `### MCP server: <name>` 标题

**命令：**

```bash
cd /tmp/spike-name
python3 - <<'PY'
import json
line = next(l for l in open('logs/web.log', encoding='utf-8') if l.startswith('SPIKE-ASSEMBLE '))
d = json.loads(line[len('SPIKE-ASSEMBLE '):])
for s in d['before']:
    if s['name'].startswith('mcp:'):
        print(s['name'], '| interpolate =', s['interpolate'])
        print('  textHead =', json.dumps(s['textHead'], ensure_ascii=False))
PY
```

**观察：**

```text
mcp:probe-a | interpolate = False
  textHead = "### MCP server: probe-a\n\nSpike probe server probe-a.\n本服务器只用于验证名字面段契约；字面量标记 {{not-a-variable}} 必须原样出现。\nPing 工具会回显实例名 probe-a。"
mcp:probe-b | interpolate = False
  textHead = "### MCP server: probe-b\n\nSpike probe server probe-b.\n本服务器只用于验证名字面段契约；字面量标记 {{not-a-variable}} 必须原样出现。\nPing 工具会回显实例名 probe-b。"
```

- 段名严格是 `mcp:<serverName>`（`mcp:probe-a`、`mcp:probe-b`）。
- 文本首行严格是 `### MCP server: <serverName>`，后接一个空行与服务器 `initialize.instructions`（探针的 instructions 非空，含字面量 `{{not-a-variable}}`）。
- 与上游 `dsh-mcp-client/lib/index.js:736-740` 的形态一致：`name: \`mcp:${server}\``、`text: () => connection.instructions()`；文本由连接层拼成 `### MCP server: ${config.serverName}\n\n${serverText}`（`dsh-mcp-client/lib/index.js:655`），`serverText` 来自 `initialize.instructions` 的 `trimEnd()`。
- ws-a 模型回复逐行列出了两个标题，与真实 `system/message` 中的两段一致。

结果：通过

---

## 3. 断言③：段对象带 `interpolate: false`

**命令：**

```bash
cd /tmp/spike-name
python3 - <<'PY'
import json
line = next(l for l in open('logs/web.log', encoding='utf-8') if l.startswith('SPIKE-ASSEMBLE '))
d = json.loads(line[len('SPIKE-ASSEMBLE '):])
for s in d['before']:
    if s['name'] == 'mcp-resource-servers' or s['name'].startswith('mcp:') or s['name'] == 'deployment:persona-prefix':
        print(f"{s['name']}: hasInterpolateKey={s['hasInterpolateKey']} interpolate={s.get('interpolate')}")
d2 = json.load(open('page-wsa-1.json'))['body']['result']['value']
msg = next(r['event'] for r in d2['records'] if r['event']['type'] == 'system/message')
text = msg['data']['message']['content'][0]['text']
print('system/message 中字面量 {{not-a-variable}} 出现次数 =', text.count('{{not-a-variable}}'))
PY
```

**观察：**

```text
deployment:persona-prefix: hasInterpolateKey=False interpolate=None
mcp-resource-servers: hasInterpolateKey=True interpolate=False
mcp:probe-a: hasInterpolateKey=True interpolate=False
mcp:probe-b: hasInterpolateKey=True interpolate=False
system/message 中字面量 {{not-a-variable}} 出现次数 = 2
```

- 三个 MCP 段对象（资源名段 + 两个指令段）都**实际携带** `interpolate` 属性，值为 `false`；对照段 `deployment:persona-prefix` 没有该属性（值为 `undefined`），说明不是所有段都被统一塞值。
- 行为侧证据：两段 instructions 都含 `{{not-a-variable}}`，而 `renderPrompt()` 对 `interpolate === false` 的段保留字面文本、对其余段调用严格插值（未知变量会抛 `unknown prompt variable …`，见 `dsh-system-prompt/lib/index.js:110-118`、`158-180`）。本会话请求成功，且真实 `system/message` 中原样出现两次 `{{not-a-variable}}`——若 `interpolate` 丢失或为 `true`，装配/渲染会失败，不可能出现该结果。
- 结论：后续改写名字段时必须**保留** `interpolate: false` 这一属性，不能只重建 `{name, text}`。

结果：通过

---

## 4. 断言④：未打标签的监听器收到每个 scope 的装配；改写后下一步生效

### 4.1 监听器未打标签

**命令：**

```bash
grep -n "ctx.on('system-prompt/assemble'" \
  openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-plugin/index.js
```

**观察：**

```text
122:  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
```

注册处没有 `ctx.on` 的 scope/agent 标签，探针插件挂在全局 profile 层；实际收到了下列不同 agent scope 的装配。

### 4.2 跨 scope 投递（同一监听器、两个工作区）

**命令：**

```bash
cd /tmp/spike-name
python3 - <<'PY'
import json
for i, line in enumerate(l for l in open('logs/web.log', encoding='utf-8') if l.startswith('SPIKE-ASSEMBLE ')):
    d = json.loads(line[len('SPIKE-ASSEMBLE '):])
    names = [s['name'] for s in d['before'] if s['name'] == 'mcp-resource-servers' or s['name'].startswith('mcp:')]
    after = [s['name'] for s in d['after'] if s['name'] == 'mcp-resource-servers' or s['name'].startswith('mcp:') or s['name'] == 'spike:sentinel']
    print(f"#{i} mode={d['mode']} agent={d['agentId']} cwd={d['cwd']} scopeIsAgent={d['scopeIsAgent']}")
    print(f"   before: {names}")
    print(f"   after : {after}")
    if d.get('removedSections'):
        print(f"   removed={d['removedSections']} nameRewrite={d['nameRewrite']['outcome']} sentinel={d['sentinelAdded']}")
PY
```

**观察：**

```text
#0 mode=observe agent=session-7c53792b-6d81-4eb9-96b4-43e251be38bf cwd=/tmp/spike-name/ws-a scopeIsAgent=True
   before: ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
   after : ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
#1 mode=observe agent=session-987ff65d-092f-4e0c-a34b-3f6578a11d80 cwd=/tmp/spike-name/ws-b scopeIsAgent=True
   before: ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
   after : ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
#2 mode=rewrite agent=session-7c53792b-6d81-4eb9-96b4-43e251be38bf cwd=/tmp/spike-name/ws-a scopeIsAgent=True
   before: ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
   after : ['mcp-resource-servers', 'mcp:probe-a', 'spike:sentinel']
   removed=['mcp:probe-b'] nameRewrite=rewritten sentinel=True
#3 mode=rewrite agent=session-076cea14-f82e-4c84-9cad-733edc1af360 cwd=/tmp/spike-name/ws-a scopeIsAgent=True
   before: ['mcp-resource-servers', 'mcp:probe-a', 'mcp:probe-b']
   after : ['mcp-resource-servers', 'mcp:probe-a', 'spike:sentinel']
   removed=['mcp:probe-b'] nameRewrite=rewritten sentinel=True
```

- `#0`、`#1` 分别是 ws-a 与 ws-b 两个工作区会话的装配；`#2` 是 ws-a 第 2 轮；`#3` 是 ws-a 的 `minimal` 预设会话。四个记录对应三个不同 agent id、两个 cwd，未打标签的同一个监听器全部收到。
- `context` 键为 `["agent","scope","signal"]`，`scopeIsAgent=True`；`agent.id` 与会话 id 相同，`cwd` 取自 `agent.session.header.cwd`。这与上游 `assembleContextFor(agent, signal)` 的 `{agent, scope, signal}` 形态一致（`dsh-agent/lib/index.js:291-297`）。
- **重要 D4 结论**：project-mcp 全局装载的 `mcp:probe-a` 与 `mcp:probe-b` 段对 ws-a / ws-b 两个会话**都出现**。名字面的按工作区隔离不能依赖上游 scope 过滤，必须在监听器里依据 `context.agent` / cwd 主动删改。
- 工具面与名字面的同刻对照（`logs/web.log:5`、`:8`）：ws-a 会话的隔离日志为 `visible=[probe-a] … deny=1 [mcp__probe-b__ping]`，ws-b 为 `visible=[probe-b] … deny=1 [mcp__probe-a__ping]`；工具面已按工作区屏蔽对方工具，但同一装配里名字面仍有对方的 `mcp:<server>` 段与资源名。这正是本变更要补齐的名字面缺口，也说明「工具面已隔离」不能推出「名字面已隔离」。

### 4.3 改写 `assembly.sections` 后下一步生效

**命令（实际执行序列）：**

```bash
cd /tmp/spike-name
# 1) ws-a 第 1 轮（观察模式；rewrite.on 不存在）
node api.mjs create /tmp/spike-name/ws-a
node api.mjs prompt session-7c53792b-6d81-4eb9-96b4-43e251be38bf '请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文…'
# 2) ws-b 第 1 轮（观察模式）
node api.mjs create /tmp/spike-name/ws-b
node api.mjs prompt session-987ff65d-092f-4e0c-a34b-3f6578a11d80 '请只回答：你的系统提示词里是否出现了 `probe-b` 这个名字？…'
# 3) 打开改写开关（同进程、不重启），ws-a 第 2 轮
date -Is > /tmp/spike-name/rewrite.on
node api.mjs prompt session-7c53792b-6d81-4eb9-96b4-43e251be38bf '第二轮：请逐字引用你系统提示词里 `## MCP resource servers` 段落的全文…'
```

**观察（真实 `system/message`，按 turn 对比）：**

```text
ws-a turn=1 step=1 len=6030 probe-a=True probe-b=True sentinel=False resourceArray=["probe-a","probe-b"]
ws-a turn=2 step=1 len=5930 probe-a=True probe-b=False sentinel=True resourceArray=["probe-a"]
ws-b turn=1 step=1 len=6030 probe-a=True probe-b=True sentinel=False resourceArray=["probe-a","probe-b"]
```

- 第 2 轮监听器的 `after`（即它返回给瀑布的装配）明确显示：`mcp:probe-b` 段已删除、名字数组改写为 `["probe-a"]`、追加了哨兵 `spike:sentinel`。
- 第 2 轮真实 `system/message` 与监听器返回的装配一致：6030 → 5930 字符，`mcp:probe-b` 标题与 `probe-b` 名字消失，哨兵文本 `SPIKE-SENTINEL-5-REWRITE-EFFECTIVE` 出现。**同一 dsh 进程未重启**（PID 4342 不变），改写通过 `/tmp/spike-name/rewrite.on` 标记在两次装配之间切换。
- 模型第 2 轮回答也按改写后的提示词逐字引用：数组只有 `["probe-a"]`，标题列表只有 `### MCP server: probe-a`（原文见附录 C 的 `pages-summary.json`）。
- 注：模型在第 2 轮回答开头称上一轮「臆造」，那只是模型在两条历史消息之间的自我修正措辞；第 1 轮真实 `system/message`（seq 7）确实包含 `probe-b`，以事件证据为准。
- 结论：在 `await next()` 之后返回新的装配对象，确实会成为**下一次装配/下一步请求**的提示词；不需要在 `next()` 之前修改、也不需要重启。

结果：通过

---

## 5. 断言⑤：`complete` 段存在时 mutations 被丢弃

### 5.1 实测前的源码预判

**命令：**

```bash
nl -ba /usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js \
  | sed -n '381,405p'
```

**观察（关键行逐字）：**

```text
381  const completeSections = sectionDefinitions.filter((section) => section.complete === true);
382  if (completeSections.length > 1) throw new Error(`multiple complete prompt sections are active: …`);
383  let completeSection;
384  const assembly = {
385      sections: sectionDefinitions.map((section) => {
386          const assembled = {
387              name: section.name,
388              text: typeof section.text === "function" ? section.text(context) : section.text,
389              ...section.interpolate !== void 0 ? { interpolate: section.interpolate } : {}
390          };
391          if (section.complete === true) completeSection = { ...assembled };
392          return assembled;
393      }),
...
398  const transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));
399  if (completeSection === void 0 && !runtimeContextSuppressed) return transformed;
...
401  return {
402      ...transformed,
403      sections: completeSection === void 0 ? transformed.sections : [completeSection],
404      contexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts
405  };
```

- `completeSection` 在**瀑布之前**从段定义捕获（381/383/391）；瀑布返回的 `transformed` 只被用来取 `contexts` 等其余字段，`sections` 一旦存在 complete 段就被替换为 `[completeSection]`（403）。因此监听器在瀑布中删/改/加的任何 section 都会被丢弃。
- 另一个重要形态事实：装配给监听器的 section 对象只构造 `{name, text, interpolate?}`（386-390），**不携带 `complete` 标志**。监听器无法从装配里识别哪一段是 complete；这解释了为什么隔离逻辑必须按「过滤自己的名字段」设计，而不能依赖 complete 标志做分支。
- 本部署的 `minimal` 预设正好提供了 complete 段：`dsh-web-app/presets/minimal.patch.yml:11-16` 的 `@deepseek-ai/dsh-persona` 配置为 `prefix: You are a helpful software engineer assistant.`、`complete: true`、`includeRuntimeContext: false`。用它做实测，无需改源码或新注册 complete 段。

### 5.2 实测

**命令（rewrite 开关仍打开）：**

```bash
cd /tmp/spike-name
node api.mjs create /tmp/spike-name/ws-a minimal
# 返回 {"sessionId":"session-076cea14-f82e-4c84-9cad-733edc1af360","agentPreset":"minimal"}
node api.mjs prompt session-076cea14-f82e-4c84-9cad-733edc1af360 '请只回复“⑤测试完毕”。'

# 读监听器返回值与最终 system/message 对照
python3 - <<'PY'
import json
lines = [l for l in open('logs/web.log', encoding='utf-8') if l.startswith('SPIKE-ASSEMBLE ')]
d = json.loads(lines[3][len('SPIKE-ASSEMBLE '):])
print('监听器返回的 after 段名：', [s['name'] for s in d['after']])
print('nameRewrite =', d['nameRewrite']['outcome'], '| removedSections =', d['removedSections'], '| sentinelAdded =', d['sentinelAdded'])
print('after 中 sentinel 文本 =', next(s['textHead'] for s in d['after'] if s['name'] == 'spike:sentinel'))
page = json.load(open('page-minimal.json'))['body']['result']['value']
msg = next(r['event'] for r in page['records'] if r['event']['type'] == 'system/message')
text = msg['data']['message']['content'][0]['text']
print('最终 system/message =', json.dumps(text, ensure_ascii=False))
print('长度 =', len(text), '| 含 sentinel =', 'SPIKE-SENTINEL' in text, '| 含 probe =', 'probe' in text)
PY
```

**观察（监听器返回值与最终渲染对比）：**

```text
监听器返回的 after 段名： ['harness:identity', 'deployment:persona-prefix', 'context:file-reference', 'mcp-resource-servers', 'mcp:probe-a', 'ui:deliverable-file-references', 'harness:source', 'app:web-surface', 'deployment:persona-suffix', 'spike:sentinel']
nameRewrite = rewritten | removedSections = ['mcp:probe-b'] | sentinelAdded = True
after 中 sentinel 文本 = SPIKE-SENTINEL-5-REWRITE-EFFECTIVE
最终 system/message = "You are a helpful software engineer assistant."
长度 = 46 | 含 sentinel = False | 含 probe = False
```

- 监听器确实返回了改写过的装配（`mcp:probe-b` 已删、`mcp-resource-servers` 已改、哨兵已加），但同一会话的真实 `system/message` **恰好只有** complete persona 一句，46 个字符。
- 这直接证明：存在 complete 段时，瀑布下游的 section mutations 被丢弃；最终 prompt 不是监听器返回的 sections，而是瀑布前捕获的 complete 段。
- 模型对该轮回复 `⑤测试完毕`（`assistant/message` seq 15），与完整 persona 的简短系统提示一致。
- 该实测同时确认了预判的边界：监听器即使删除/改写自己的 `mcp:*` 段、甚至加哨兵，也无法影响 complete 会话的最终提示词。实现侧按“删自己的段”做即可，不需要（也不可能）从装配里检测 complete；complete 分支对名字面隔离是安全的 no-op。

结果：通过

---

## 6. 偏差、限制与未完成项

- **红项：无。** 五条全部通过；未进入组 2。
- 本 spike 只覆盖 **agent 会话装配**（`context.agent` 存在、`context.scope === context.agent`）。agentless/无归属装配未在 1.1 构造（`/tmp` 无归属会话的 fail-closed 属组 5 冒烟范围）；本次观测到的 `context` 形态为 `{agent, scope, signal}`，与上游 `assembleContextFor` 一致。
- `complete` 实测使用部署自带的 `minimal` 预设，而不是在 profile 里新注册 complete 段；理由是预设已经是官方完整路径（`dsh-web-app/presets/minimal.patch.yml:11-16`），无需改源码。实测路径完整，无需「受限说明」。
- 实例运行期间两次会话的 `system/message` 长度变化（6030 → 5930）包含哨兵 34+ 字符与删段的净效应；逐字差异以第 4 节和附录 C 的完整文本为准。
- 未对 `mcp-resource-servers` 的空数组分支做实测（1.1 只需要两台服务器时的逐字形态；空数组行为是组 2 纯函数的单元测试目标）。

---

## 7. 对后续任务（D4）的可执行结论

1. **段名/文本契约稳定**：`mcp-resource-servers` 的文本 = 固定前缀 + `JSON.stringify(sortedNames)` + `.`；`mcp:<server>` 的文本 = `### MCP server: <server>\n\n<instructions>`。组 2 的 `rewriteResourceNames` 可按「`server argument: ` 之后的 `[...]`」解析，并保留原前缀与句号。
2. **`interpolate: false` 是段对象的实有属性**：改写 `mcp-resource-servers` 时必须复制该属性（原段是 `interpolate: false`）。若遗漏，该段会走上严格插值路径；当前资源名段文本没有 `{{}}`，未必立刻报错，但契约上必须保留（若未来对含 `{{not-a-variable}}` 的指令段做同等重建，会直接抛 `unknown prompt variable`）。组 2 的 `planNameFilter` 应断言改写段保留 `interpolate:false`。
3. **全局监听器能覆盖所有 agent scope**：未打标签的 `ctx.on('system-prompt/assemble')` 在 ws-a、ws-b、minimal 三个 scope 都被调用；`context.agent`/`context.scope` 均存在。组 3 的监听器无需 scope 过滤即可收到装配。
4. **project-mcp 的全局装载导致名字对所有工作区可见**：ws-a 与 ws-b 的提示词里都同时出现 `probe-a`、`probe-b` 两段。名字面隔离必须按 cwd/归属在工作区维度过滤（与工具面同一归属判定），不能指望上游 scope 隔离。
5. **`await next()` 后返回新装配在下一步生效**且不需要重启；同一会话 turn 1 与 turn 2 的 `system/message` 差异证明这一点。实现可以安全地采用「先 `next()`、再按端口读数决定是否删改」的模式。
6. **complete 段会静默覆盖 sections**：存在 complete 段时，监听器的删/改/加全部不进入最终 prompt。该退化不会造成名字泄漏（complete 只保留 complete 段本身），但监听器的诊断/统计不应把「我改了 sections」当成「模型一定看到」。组 3 的 boot 观测行与限流日志按「已处理装配」而非「已改变模型提示词」表述更准确。
7. **reference 不变式**：观察模式下 `next()` 返回的对象与传入的 `assembly` 引用已不相等（`resultChanged: true`）；不要用 `result === assembly` 判断是否被别的监听器改写，也不要依赖原地修改。

---

## 附录 A：fixture 布局

```text
/tmp/spike-name/
├── probe-server.mjs                 # 探针 MCP 服务器（纯 Node，stdio JSON-RPC）
├── api.mjs                          # 隔离实例 API helper（create/prompt/page）
├── rewrite.on                       # 改写开关（存在 = rewrite 模式；采集后已删除）
├── ws-a/.dsh/mcp/probe-a.yaml       # serverName=probe-a
├── ws-b/.dsh/mcp/probe-b.yaml       # serverName=probe-b
├── home/
│   ├── .credentials.yaml -> /home/docker/.dsh/.credentials.yaml   # 只读符号链接
│   ├── storages/workspace.json      # v2 最小登记（ws-a / ws-b）
│   └── profiles/web/
│       ├── package.json             # bundles: base + web-app + project-mcp + spike-name-probe
│       ├── cordis.patch.yml         # 仅 llm-pi-ai + agent-default-model
│       └── node_modules/            # 两个 link: 安装
├── logs/web.log                     # 实例 stdout（含 4 条 SPIKE-ASSEMBLE）
├── probe-a.requests.log             # 4 行（server/discover/initialize/initialized/tools/list）
├── probe-b.requests.log             # 4 行
├── page-wsa-1.json / page-wsa-2.json / page-wsb-1.json / page-minimal.json
└── evidence/assemble-summary.json, evidence/pages-summary.json
```

探针服务器关键行为：

```yaml
# /tmp/spike-name/ws-a/.dsh/mcp/probe-a.yaml
transport: stdio
command: /usr/local/bin/node
args:
  - /tmp/spike-name/probe-server.mjs
  - probe-a
  - /tmp/spike-name/probe-a.requests.log
```

探针插件入口（`artifacts/spike-name-plugin/index.js`）关键结构：

```js
export const name = 'spike-name-probe'

export function apply(ctx) {
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const before = summarizeSections(assembly.sections)
    const result = await next()            // 先让下游完成
    if (existsSync('/tmp/spike-name/rewrite.on')) {
      const rewritten = rewriteAssembly(result)  // 删 mcp:probe-b、改名字数组、加哨兵
      console.log('SPIKE-ASSEMBLE ' + JSON.stringify({ ...evidence, after: summarizeSections(rewritten.assembly.sections) }))
      return rewritten.assembly
    }
    console.log('SPIKE-ASSEMBLE ' + JSON.stringify({ ...evidence, after: summarizeSections(result.sections) }))
    return result
  })
}
```

临时 profile 的 `cordis.patch.yml` 只含以下两行（不携带主 patch 的其它插件 insert）：

```yaml
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: zai-coding-cn
    model: glm-5.3-flash
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      zai-coding-cn:
        apiKeyEnv: ZAI_CODING_CN_API_KEY
```

## 附录 B：复现步骤（G5 冒烟可直接复用本 fixture）

```bash
# 1) 目录与 fixture（已保留；如需重建）
mkdir -p /tmp/spike-name/{home/storages,home/profiles/web,logs,ws-a/.dsh/mcp,ws-b/.dsh/mcp}
# 写入 probe-server.mjs、两个 probe-*.yaml、workspace.json（见附录 A）

# 2) 临时 home 的凭证只读符号链接（不复制明文）
ln -sfn /home/docker/.dsh/.credentials.yaml /tmp/spike-name/home/.credentials.yaml

# 3) 初始化 profile 并安装两个插件（首次运行自动按 web 模板初始化）
cd /tmp/spike-name
DSH_HOME=/tmp/spike-name/home dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp
DSH_HOME=/tmp/spike-name/home dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-plugin

# 4) 写 profiles/web/cordis.patch.yml（仅 llm-pi-ai + agent-default-model，见附录 A）
# 5) 启动隔离实例（记录 PID）
cd /tmp/spike-name
nohup env DSH_HOME=/tmp/spike-name/home dsh --profile web --port 3099 --no-open \
  > logs/web.log 2>&1 &
# 注意：$! 是启动 shell，不是 dsh；真正 dsh 是其 node 子进程，按命令行锚定
sleep 1
pgrep -f '^node /usr/local/bin/dsh --profile web --port 3099' | head -1 > web.pid
cat web.pid   # 本次实测为 4342（启动 shell 为 4338）

# 6) token 换 cookie（token 从 logs/web.log 的 dsh web 行提取，不写入文档）
TOKEN=$(grep -o 'http://127.0.0.1:3099/?token=[^ ]*' logs/web.log | tail -1 | cut -d= -f2)
curl -sS -o /dev/null -c /tmp/spike-name/cookie.txt "http://127.0.0.1:3099/?token=$TOKEN"

# 7) 第 1 轮观察（ws-a / ws-b）
node api.mjs create /tmp/spike-name/ws-a
node api.mjs prompt <ws-a-session-id> '<问题>'
node api.mjs create /tmp/spike-name/ws-b
node api.mjs prompt <ws-b-session-id> '<问题>'

# 8) 打开改写开关，ws-a 第 2 轮（下一步生效）
date -Is > /tmp/spike-name/rewrite.on
node api.mjs prompt <ws-a-session-id> '<问题>'

# 9) complete 对照（minimal 预设）
node api.mjs create /tmp/spike-name/ws-a minimal
node api.mjs prompt <minimal-session-id> '请只回复“⑤测试完毕”。'

# 10) 读 page（throughSeq 过大会报 past cursor N，按 N 重试）
node api.mjs page <session-id> 999999
node api.mjs page <session-id> <N>

# 11) 收尾：只杀本实例的 dsh（绝不动 PID 1），probe 子进程随父进程退出
kill -TERM "$(cat web.pid)"
ps -o pid,ppid,cmd -p "$(cat web.pid)"   # 期望无输出
ps -o pid,cmd -p 1                       # 主实例仍在
```

## 附录 C：证据文件与关键行号

| 证据 | 位置 | 摘要 |
|---|---|---|
| 装配观察流水 | `/tmp/spike-name/logs/web.log` | 4 条 `SPIKE-ASSEMBLE`（行号 7、10、11、14） |
| 装配压缩证据 | `/tmp/spike-name/evidence/assemble-summary.json` | 每条记录的 mode/agent/cwd/前后段名/改写读数 |
| 页面证据 | `/tmp/spike-name/page-wsa-1.json`、`page-wsa-2.json`、`page-wsb-1.json`、`page-minimal.json` | 真实 `system/message` 与 `assistant/message` |
| 页面压缩证据 | `/tmp/spike-name/evidence/pages-summary.json` | 四个会话的系统消息/模型回复/turn 边界 |
| 探针请求流水 | `/tmp/spike-name/probe-a.requests.log`、`probe-b.requests.log` | 各 4 行：`server/discover`、`initialize`、`notifications/initialized`、`tools/list` |
| 上游资源段 | `dsh-mcp-resources/lib/index.js:119-128` | 段名、`interpolate:false`、文本模板、names 排序 |
| 上游指令段 | `dsh-mcp-client/lib/index.js:655`、`736-740` | `### MCP server: <name>` 文本与 `mcp:<server>` 段名 |
| 上游装配上下文 | `dsh-agent/lib/index.js:291-297` | `{agent, scope, signal?}` |
| 上游完整段覆盖 | `dsh-system-prompt/lib/index.js:381-405` | complete 捕获、瀑布、`sections: [completeSection]` |
| minimal 预设 | `dsh-web-app/presets/minimal.patch.yml:11-16` | persona `complete: true` |

ws-a 第 2 轮模型回答的关键原文（`pages-summary.json`）：

```text
需要更正：我上一轮的引用不准确，包含了我臆造的内容（probe-b 并不存在）。以下才是系统提示词中该段落的逐字原文：

## MCP resource servers

Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["probe-a"].

### MCP server: probe-a
...
（只有这一个标题。）
```

minimal 会话最终系统消息（`page-minimal.json`）：

```json
"You are a helpful software engineer assistant."
```

## 附录 D：清理与保留

- 采集与落档后已 kill 本 spike 的 dsh 实例（PID 4342）与其两台 probe 子进程；主实例 PID 1 未触碰。清理核对实测：

```text
$ ps -o pid,ppid,cmd -p 4342,4362,4378
    PID    PPID CMD
（无输出：dsh 实例与两台 probe 均已退出）

$ ps -o pid,cmd -p 1
    PID CMD
      1 node /usr/local/bin/dsh web --no-open
（主实例存活，未被触碰）

$ ps -ef | grep -E 'probe-server.mjs.*spike-name|dsh --profile web --port 3099' | grep -v grep
（无输出：无本 spike 的 dsh/probe 残留）
```

- 启动 wrapper 的 shell（PID 4338）在 dsh 退出后留下一个 `<defunct>` 条目（无子进程、不占资源）；它要由父进程 wait 回收，而父进程已是 PID 1（主 dsh），按禁令未对其做任何操作。本 spike 的 dsh 与 probe 运行进程均无残留。

- `/tmp/spike-name/` fixture 按任务要求保留（G5 复用）；`/tmp/spike-name/rewrite.on` 已删除，后续需要改写模式时重新 `date -Is > rewrite.on`。
- 本 spike 未改任何 `plugins/` 源码、未改 `tasks.md`、未 `git add`/`git commit`、未改 `/home/docker/.dsh`。

## 验收

在仓库根 `/home/xuqinqin/develop/person/dsh-plugins` 执行任务规定的验证句：

```bash
test -s openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md && \
  [ "$(grep -c '^结果：通过' openspec/changes/project-mcp-name-resource-isolation/artifacts/spike-name-surface.md)" -eq 5 ]
# 退出码 0；结果行数 5
```
