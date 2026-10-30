# session-tool-toggle 11.2 隔离实例冒烟记录表

- 任务：`tasks.md` 11.2「隔离实例冒烟与省量表」
- 执行时间：
  - 首轮：2026-10-31 00:33–00:57（Asia/Shanghai；容器日志为 UTC 16:33–16:57）
  - **复测轮：2026-10-31 01:00–01:08**（Asia/Shanghai；容器日志为 UTC 17:00–17:08）
- 执行人：DSH 执行子代理（任务 11.2）
- 结论速览：**10 条全部 PASS**
  - ①⑥⑨ 在 **P0 缺陷 D1 修复后的 `lib/`** 上复测（首轮：①⑥ 未通过、⑨ 条件通过；本轮已逐条实测通过）；
  - ⑦ 由「等价计算」升级为**真实 provider usage 双路实测**（A/B 首请求 + 同一会话连续两轮）；
  - ②③④⑤⑩ 沿用首轮记录（D1 修复只新增 `reconcile` 重入闸，未改这些断言涉及的代码路径，本轮未复跑）；⑧ 本轮随面板调用一并复测。

> **红线声明**：本表所有数值均来自隔离实例的实测响应/日志/进程状态，未把 214/70 等主部署基线伪装成本实例读数。首轮记录保留原文并在复测项中注明本轮取值；无法测到的项标「未实测」并给原因。

---

## 0. 复测轮说明（本轮增量）

### 0.1 D1 已修复（依赖前提）

- 根因：`dsh-scope` 的 `ScopedLayers.effect` 在返回 disposer **之前**同步触发 `tools/change`，而 `src/host/session-layer.ts` 的 `restrict()` 返回后才记账 → `index.ts` 的同步 `refresh()` 重入 → 无限递归（命中全局层 catalog 名字的全部 toggle 卡死）。
- 修复：`src/host/session-layer.ts` 的 `reconcile()` 入口加 `reconciling` 重入闸（`try/finally` 解锁）；3 个新单测（含移除闸后 3 例 FAIL 的反向验证）。
- 验证：`pnpm --filter dsh-plugin-session-tool-toggle test` → **17 套件 637 tests 全绿**；typecheck 0；build 0；`lib/index.js` 于 00:58 重建（`grep -c reconciling lib/index.js` = 4），隔离实例的 `link:` 安装直接生效。
- 本轮复测的 `lib/index.js` 即上述修复后的产物；隔离实例启动日志无 error/unhandled。

### 0.2 复测环境

| 项 | 值 |
|---|---|
| `DSH_HOME` | `/tmp/stt-112-home`（与首轮同一目录，profile 未重建；`sessions/` 复用） |
| 端口 | `3210`（容器内 `127.0.0.1`） |
| 启动 | `docker exec -d -e DSH_HOME=/tmp/stt-112-home dsh sh -c 'cd /tmp && exec dsh web --port 3210 --no-open > /tmp/stt-112r-web.log 2>&1'`（复测中途重启一次做 CPU 复核，日志 `/tmp/stt-112r-web2.log`） |
| 认证 | 从启动日志取 `?token=`，`curl -c /tmp/stt-112r-cookie.txt` 换取 `dsh-auth` cookie；API 全部在容器内用 `/tmp/stt-112r-api2.cjs` 调用 |
| 默认档 | 复测前把 `session-tool-toggle/defaults.json` 重置为 `{"version":1,"disabled":[]}`（首轮遗留 `mcp:figma`，备份 `/tmp/stt-112r-defaults-backup.json`） |
| 探针/脚本 | `/tmp/stt-meter-probe`（首轮探针，未改）；新增 `/tmp/stt-112r-api2.cjs`、`/tmp/stt-112r-storm.cjs`、`/tmp/stt-112r-cpusample.sh`、`/tmp/stt-112r-analyze.cjs` |

### 0.3 复测覆盖范围

- 本轮实测：①、⑥、⑨（D1 阻塞项）＋ ⑦（省量表升级）＋ ⑧（顺带复测面板）。
- 未复跑：②③④⑤⑩（首轮 PASS；本次改动只在 `reconcile()` 入口加同步重入闸，不触及持久化、fork、子代理快照、默认档写入等路径）。表中保留首轮记录与证据文件。

### 0.4 本轮使用的会话

| 代号 | sessionId | 用途 |
|---|---|---|
| S1 | `session-8d336273-ba61-4c0f-9174-baa35a12d7d4` | ①/⑦ 同一会话连续两轮 |
| S_A | `session-b1c081fa-0a58-40b1-9a6d-d6c481aeb64c` | ⑦ A/B 基线（173 工具首请求） |
| S_B | `session-07891a6f-1f4c-4850-8522-c90cc6e997cd` | ⑦ A/B 对照（关闭 yunxiao 后首请求 103 工具） |
| S9a–S9e | `session-6833b11e…` / `b690c0c1…` / `b56a0667…` / `3c3a2a90…` / `d9822bea…` | ⑥ 顺序轮 5 agent |
| S10a–S10e | `session-f92436b1…` / `2cb2e798…` / `ab913b89…` / `bb8e1216…` / `523bea8d…` | ⑥ 并发轮 5 agent |
| S11 | `session-932227f1-964a-4562-9845-dc6fe37caaf8` | ⑨ 面板 toggle |
| S12 | `session-b412bcee-b7f5-4d20-8d38-07f0184fd1cb` | ① CPU 复核（重启后） |

---

## 1. 环境与复现基线

### 1.1 隔离实例

| 项 | 值 |
|---|---|
| `DSH_HOME` | `/tmp/stt-112-home`（独立数据目录） |
| 端口 | `3210`（容器内 `127.0.0.1`，宿主同 `/tmp` 挂载） |
| profile | `profiles/web`：bundles=`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-plugin-session-tool-toggle`（`link:` 装入本仓 `plugins/session-tool-toggle`） |
| 额外 patch | `cordis.patch.yml` 插入：`llm-deepseek`（`DEEPSEEK_API_KEY`）、`agent-default-model`（`deepseek-official/deepseek-flash`）、5 台 `@deepseek-ai/dsh-mcp-client`、探针插件 `stt-meter-probe` |
| 探针插件 | `/tmp/stt-meter-probe`（注册 `/stt-meter`、`/stt-catalog` 两条宿主命令，只写 `/tmp`，不入库、不进主 profile） |
| 启动 | `docker exec -d -e DSH_HOME=/tmp/stt-112-home dsh sh -c 'cd /tmp && exec dsh web --port 3210 --no-open > /tmp/stt-112r-web.log 2>&1'` |
| 关停 | 按 **SID=实例 PID** 递归 kill（`ps -eo pid,sid` 过滤后 TERM→KILL）；`ps -eo args \| grep '[d]sh web --port 3210'` 无存活进程 |

**装配命令（可复现）**

```bash
# 1) 建 profile 骨架（bundles 只需 base + web-app，插件由 dsh plugin add 追加）
mkdir -p /tmp/stt-112-home/profiles/web
cat > /tmp/stt-112-home/profiles/web/package.json <<'EOF'
{ "name": "dsh-profile-web", "private": true,
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }
EOF
docker exec -e DSH_HOME=/tmp/stt-112-home dsh \
  dsh plugin --profile web add /home/xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle
# 2) 写 /tmp/stt-112-home/profiles/web/cordis.patch.yml（内容见 §1.2）
ln -sfn /tmp/stt-meter-probe /tmp/stt-112-home/profiles/web/node_modules/stt-meter-probe
# 3) 启动
docker exec -d -e DSH_HOME=/tmp/stt-112-home dsh sh -c \
  'cd /tmp && exec dsh web --port 3210 --no-open > /tmp/stt-112r-web.log 2>&1'
TOKEN=$(grep -o 'http://127.0.0.1:3210/?token=[^ ]*' /tmp/stt-112r-web.log | tail -1 | cut -d= -f2)
docker exec dsh sh -c "curl -sS -o /dev/null -c /tmp/stt-112r-cookie.txt 'http://127.0.0.1:3210/?token=$TOKEN'"
```

> 所有 `curl`/API 调用都在 **dsh 容器内**执行（实例只绑定容器 loopback）；下文的 `curl` 均省略 `docker exec dsh sh -c '…'` 外壳。

### 1.2 复刻的 MCP 配置（5 台，与主部署对齐）

| serverName | 数量（实测） | 配置来源 | 隔离实例配置 |
|---|---:|---|---|
| `yunxiao` | 70 | 主部署为 `company/opc/.dsh/mcp/yunxiao.yaml`（project-mcp 项目级） | 等价的全局 `mcp-client` 行：`node …/.dsh/mcp/yunxiao-bridge.cjs` |
| `chrome-devtools-mcp` | 32 | 主 profile 的 browser-use/chrome-devtools 行 | `chrome-devtools-mcp --headless --isolated --executablePath ~/.dsh/bin/chromium-launch` |
| `dbx` | 18 | 主部署为 `company/opc/.dsh/mcp/dbx.yaml` | `npx -y @dbx-app/mcp-server` + `DBX_WEB_URL=http://dbx:4224` |
| `codebase-memory` | 17 | 主 profile 的 `mcp-codebase-memory` 行 | `codebase-memory-mcp` |
| `figma` | 2 | 主部署为 `company/opc/.dsh/mcp/figma.yaml` | `figma-developer-mcp --stdio …` + `FIGMA_API_KEY: !!js process.env.FIGMA_API_KEY` |
| **MCP 合计** | **139** | 主部署基线同为 139 | 与主部署逐台一致 |

### 1.3 本实例实测基线（不是主部署的 214）

复测轮 `POST /session-tool-toggle/panel`（会话 S1，关闭前）实测：

```json
{ "ok": true,
  "stats": { "visible": 173, "catalog": 143, "denied": 0, "shadowed": 0 },
  "groups": [ { "key": "yunxiao", "toolCount": 70 }, { "key": "chrome-devtools-mcp", "toolCount": 32 },
              { "key": "dbx", "toolCount": 18 }, { "key": "codebase-memory", "toolCount": 17 },
              { "key": "figma", "toolCount": 2 }, { "key": "skill", "toolCount": 1 },
              { "key": "builtin", "toolCount": 33 } ] }
```

- 响应体 **50,356 B**（< R8/U8 的 200 KB 阈值，无需分页）；首轮为 50,351 B（差异来自 sessionId 长度）。
- 真实首轮请求（S1 / S_A）实测：`request/header.tools` = **173** 个、`JSON.stringify` **158,210** 字符；`system/message` = **6,217** 字符，含 `### MCP server: codebase-memory`（305 字）与 `### MCP server: dbx`（89 字），yunxiao / chrome-devtools / figma 均无 instructions 段。
- **MCP 139 台工具与主部署完全一致**（70/32/18/17/2）；**非 MCP 34**（builtin 33 + skill 1），主部署是 75（214−139）。
- 差异原因：主部署还装了 task-board、notes、archify、project-mcp、user-commands、multi-root 等插件；本次隔离 profile 只装了 base + web-app + 本插件。**这不是本插件差异**。
- `stats.catalog=143` 是**全局层注册名**（`panel.ts:157` 的定义），= MCP 139 + 4 个全局层内置工具（`working_directory`、`list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`，由 `/stt-catalog` 实测导出），**不是**「可见 214」的同一语义；⑧ 按两种语义分别记录。

### 1.4 主部署基线（引用，未在本任务重新量）

主部署可见 214 / MCP 139 来自 `design.md` Context 与 9.5 的实测记录；本任务**未把插件装进主 profile**，因此不重测主实例面板。核对：`docker exec dsh dsh --profile web --dump-config | grep -c session-tool-toggle` → `0`（见 §4）。

---

## 2. 十条断言逐条记录

### ① `/tools off mcp:yunxiao` 后计数减少 70，且 `system/message` 不含 `### MCP server: yunxiao`

**结论：PASS（复测轮实测，D1 修复后不再卡死）**

- 断言原文：`/tools off mcp:yunxiao` 后该会话工具计数减少 70 且 `system/message` 不含 `### MCP server: yunxiao`。
- 实际执行（S1）：
  ```bash
  docker exec dsh node /tmp/stt-112r-api2.cjs cmd \
    session-8d336273-ba61-4c0f-9174-baa35a12d7d4 "/tools off mcp:yunxiao"
  # → POST http://127.0.0.1:3210/api/commands/execute
  #   {"type":"client-request","rpcId":"…","method":"commands/execute",
  #    "payload":{"args":{"agentId":"<sid>","line":"/tools off mcp:yunxiao","submittedAttachments":[]}}}
  ```
- 实测值：
  - **请求正常返回**：HTTP 200，服务端 75 ms、端到端 143 ms（对照：首轮 `curl --max-time 120` 超时、CPU 100%）。回执原文：
    > 已关闭：mcp:yunxiao（隐藏 70 个工具定义 + 1 段服务器指令）／本会话可见工具 **173 → 103**／下次请求生效；前缀缓存将从第一个变化的 schema token 起重建一次（一次性成本）
  - **计数减少 70**：面板 `stats={visible:103,catalog:143,denied:70,shadowed:0}`，`state.disabled=["mcp:yunxiao"]`；`/tools status` 同刻显示「已关 1 项 · mcp:yunxiao 70 个工具定义 · 本会话可见工具 103 个」。
  - **`state.disabled` 落盘**：会话日志 `plugin:session-tool-toggle/state`（seq 27）：
    ```json
    {"version":1,"disabled":["mcp:yunxiao"],"snapshot":[],"seeded":true,"updatedAt":1793379694269}
    ```
  - **下一次真实请求确实变小**：turn 2 的 `request/header`（`reason:"change"`）实测 **103** 个工具、**92,482** 字符、`toolsTokens=23,125`；逐服务器计数为 `non-mcp 34 / chrome 32 / codebase-memory 17 / dbx 18 / figma 2`，**无任何 `mcp__yunxiao__*`**。
  - **CPU 不再 100%**：重启后复核（S12），以 0.2 s 间隔读 `/proc/<pid>/stat` 的 utime+stime 差值（CLK_TCK=100，20 jiffies = 单核 100%）：toggle 前后为 `0 0 0 0 0 3 4 0 0 0 …` → 峰值仅 20%（0.4 s），立即归零；命令 85 ms 返回、wall 162 ms、可见工具 173→103。首轮 D1 时是**持续 100% 且永不返回**。
- **第二条子句（指令段遮蔽）**：
  - yunxiao 的 `initialize` 返回 **无 instructions**（首轮实测 `instructionsLength=0`，`serverInfo: alibabacloud-devops-mcp-server 0.3.68`），基线 `system/message` 本来就不含 `### MCP server: yunxiao` → 该子句对本服务器「空真」，**不作通过证据**。
  - 按任务要求改用**有 instructions 的 `codebase-memory`** 验证同一机制（S1，yunxiao 已关）：
    - `/tools off mcp:codebase-memory` → HTTP 200、103 ms，回执「隐藏 17 个工具定义 + 1 段服务器指令；可见工具 **103 → 86**」；面板 `visible=86, denied=87`。
    - 下一轮真实 `system/message`：**6,217 → 5,912 字符**，段标题集合 `["codebase-memory","dbx"] → ["dbx"]`，即 `### MCP server: codebase-memory` 段（**305 字符**）被真实移除；同轮 `request/header` 86 个工具。
    - 追加全关对照（S9a，关闭 5 台 MCP + `tool:working_directory`）：`system/message` **5,823 字符**、段标题集合 `[]`（移除 394 字符 = codebase-memory 305 + dbx 89），`request/header` 33 个工具。
- 与基线差异原因：D1 修复后重入被闸住，同一路径正常返回并落状态。
- 证据：`/tmp/stt-112r-p-cmd-off-yunxiao.json`、`/tmp/stt-112r-panel-s1-after-off.json`、`/tmp/stt-112r-status-s1-after-off.json`、`/tmp/stt-112r-s1-events-2.jsonl`、`/tmp/stt-112r-s1-events-3.jsonl`、`/tmp/stt-112r-s9a-events.jsonl`、`/tmp/stt-112r-cpu-off-yunxiao.log`、`/tmp/stt-112r-p-cmd-s12-off.json`。
- 备注（非断言失败）：回执文案对所有 `mcp:<server>` 固定追加「+ 1 段服务器指令」（`commands.ts:344`），即使该服务器没有 instructions；属**文案不精确**，不影响掩码与计数（见 §3 O1）。

### ② 邻会话不受影响

**结论：PASS（沿用首轮实测；D1 修复未触及持久化/会话隔离路径，本轮未复跑）**

- 断言原文：邻会话不受影响。
- 实际执行：S1 关闭 `tool:web_fetch` 后，邻会话 `session-043fd13b-d954-45ce-acc4-ad5f061e0524`（S2）先后两轮对话；随后再在 S1 关闭 `tool:web_search`。
- 实测值：
  - S2 两轮请求的 `request/header.tools` 均为 **173**（第二次工具集未变，未产生新 header 事件，仍为 `reason:"initial"` 173）。
  - 同一时刻 S1 已为 `visible=172`（关闭 web_fetch 后）→ 再关 web_search 后 `/tools status` 显示 **171**。
  - S2 面板：`stats.visible=173`、`state.disabled=[]`。
- 与基线差异原因：无（隔离面内部对照）。
- 证据：`/tmp/stt-s2-events-2.jsonl`、`/tmp/stt-panel-s2.json`、`/tmp/stt-status-s1.json`。

### ③ resume 后关闭集保持

**结论：PASS（沿用首轮实测；本轮未复跑）**

- 断言原文：resume 后关闭集保持。
- 实际执行：S1 在关闭 `tool:web_fetch` 后，**杀掉整个隔离实例进程并重启**（同一 `DSH_HOME`）；重启后面板先返回 `session-not-live`；再 `POST /api/session/prompt` 恢复该会话；随后读面板与日志。
- 实测值：
  - 重启前日志已落 `plugin:session-tool-toggle/state {disabled:["tool:web_fetch"], snapshot:[], seeded:true}`。
  - 恢复后新 `request/header`：`reason:"resume"`、`tools:172`（173−1）。
  - 面板：`state.disabled=["tool:web_fetch"]`、`stats.visible=172`、`denied=1`。
- 与基线差异原因：用 1 个内置工具代替 70 个 MCP 工具（首轮 MCP 关闭被 D1 阻塞）；持久化/resume 语义同一条链路。本轮 ① 已证明 MCP 关闭的 `state.disabled=["mcp:yunxiao"]` 同样落盘。
- 证据：`/tmp/stt-112-events-4.jsonl`（seq 37 `reason:"resume"`）、`/tmp/stt-112-panel-resume.json`。

### ④ fork 继承 fork 点

**结论：PASS（沿用首轮实测；本轮未复跑）**

- 断言原文：fork 继承 fork 点。
- 实际执行：对 S1（已关闭 `tool:web_fetch` + `tool:web_search`）调用 `POST /api/session/fork`，对返回的 fork 会话直调面板。
- 实测值：fork = `session-ebd5979e-020f-4a01-adb4-e2f945afbfe4`；面板 `ok:true`、`state.disabled=["tool:web_fetch","tool:web_search"]`、`stats.visible=171`、`denied=2`；父会话状态不变。
- 与基线差异原因：关闭集用 2 个内置工具代替 MCP 组；fork 继承语义未变。
- 证据：`/tmp/stt-fork.json`、`/tmp/stt-panel-fork.json`。

### ⑤ 子代理会话按默认档快照（不含主会话会话级关闭）

**结论：PASS（沿用首轮实测；本轮未复跑）**

- 断言原文：子代理会话按默认档快照（不含主会话会话级关闭）。
- 实际执行：父会话 S1（已关闭 2 项）通过提示词让模型调用 `subagent` 工具；子代理 id 由 `tool/result` 返回（`754f3bc7-3e87-4f6a-9bd2-e1e5a7f50c1f`）；直接解压子会话日志。
- 实测值：
  - 子会话 header：`"parentSession":"session-3bca…"`、`"origin":"subagent"`、`"delegationDepth":1`。
  - 子会话状态记录：`{"version":1,"disabled":[],"snapshot":[],"seeded":true}` —— **不含父会话的 2 项**。
  - 子会话首个 `request/header.tools=173`（默认档空档 → 全量工具面）。
  - 父会话日志：`tool/call {name:"subagent", arguments:"{\"description\":\"stt-child\",\"prompt\":\"只回复 CHILD-OK\"}"}` + `tool/result started subagent 754f…`。
- 与基线差异原因：无（子代理语义本身与工具种类无关）。
- 证据：`/tmp/stt-child-events.jsonl`、`/tmp/stt-s1-events-5.jsonl`。

### ⑥ ≥5 agent × ≥5 服务器重算不抛错

**结论：PASS（复测轮实测，顺序轮与并发轮均返回；含全局层名字 `tool:working_directory`）**

- 断言原文：≥5 agent × ≥5 服务器重算不抛错。
- 地址集（每个 agent 6 个，覆盖 5 台 MCP + 1 个全局层注册名）：
  `mcp:yunxiao`(70)、`mcp:chrome-devtools-mcp`(32)、`mcp:dbx`(18)、`mcp:codebase-memory`(17)、`mcp:figma`(2)、**`tool:working_directory`**(1，全局层 catalog 名字)。
- 实际执行与实测值：

  **顺序轮**：S9a–S9e 共 5 个新会话，每会话按上述 6 个地址依次执行 `/tools off`（30 条命令，脚本 `/tmp/stt-112r-storm.cjs seq`）：

  | 指标 | 实测 |
  |---|---|
  | 返回成功 | **30/30**（HTTP 200、`result.ok=true`） |
  | 总 wall | 3,285 ms（30 条串行） |
  | 单条耗时 | 63–173 ms（最大 173 ms） |
  | `/tools off` 覆盖 5 台服务器 | 全部成功（70/32/18/17/2 逐条回执「隐藏 N 个工具定义」） |
  | `tool:working_directory` | 成功：「隐藏 1 个工具定义；可见工具 34 → 33」 |
  | 结束后面板（5 会话逐个查） | 全部 `visible=33, catalog=143, denied=140`，`disabled` = 6 个地址 |
  | 进程 CPU（累计） | 4.5%（串行完成后） |

  **并发轮**：新建 S10a–S10e 共 5 个会话，**同时发起 30 条** `/tools off`（每 agent 6 地址全部并发；脚本 `conc`）：

  | 指标 | 实测 |
  |---|---|
  | 返回成功 | **30/30**（HTTP 200） |
  | 总 wall | 4,404 ms（30 并发） |
  | 单条耗时 | 3,430–4,369 ms（中位数按地址 3,432–3,433 ms） |
  | 结束后面板（5 会话） | 全部 `visible=33, catalog=143, denied=140`，`disabled` = 6 个地址 |
  | 进程 CPU（0.2 s 采样） | 突发期 20–21 jiffies/0.2 s ≈ 单核 100%，持续约 5 s（覆盖 30 条并发重算），随后回 **0**；无持续 100%、无超时 |

  **重算正确性（模型请求侧）**：顺序轮会话 S9a 关闭 6 个地址后发一轮真实提示词：
  - `request/header`（`reason:"initial"`）：**33** 个工具、28,244 字符；**不含 `working_directory`**，也不含任何 `mcp__*`；
  - `system/message`：5,823 字符、段标题集合 **`[]`**（5 台 MCP 的指令段全部遮蔽）；
  - 首请求 provider usage：input 12,005 + cacheRead 512 = prompt **12,517**。
- 与基线差异原因：首轮并发轮 4/5 条无响应、顺序轮第 5 条 `tool:working_directory` 40 s 超时（均因 D1）；修复后同一地址集全部返回。**与 agent 数/服务器数无关**，触发条件「关闭地址命中全局层注册名」已被覆盖。
- 证据：`/tmp/stt-112r-storm-seq.json`、`/tmp/stt-112r-storm-conc.json`、`/tmp/stt-112r-panel-session-*.json`、`/tmp/stt-112r-s9a-events.jsonl`、`/tmp/stt-112r-cpu-conc.log`。

### ⑦ tokenMeter 前后对照省量表

**结论：PASS（复测轮真实 provider usage 双路实测，取代首轮等价计算）**

- 断言原文：tokenMeter 前后对照省量表。
- 实际执行（两路互相校验）：
  1. **A/B 首请求（最干净）**：两个全新会话、同一句「只回复 OK。」、同一 system/message（6,217 字符）：
     - S_A：不关闭任何地址 → 首请求 **173** 工具；
     - S_B：先 `/tools off mcp:yunxiao`（173→103）→ 首请求 **103** 工具；
     - 两轮都是各自会话的**第一次**模型请求，无历史污染，唯一差异是 70 个 yunxiao 工具 schema。
  2. **同一会话连续两轮**：S1 第 1 轮（173 工具）→ `/tools off mcp:yunxiao` → 第 2 轮（`reason:"change"`，103 工具）；前后各调一次 `/stt-meter` 读 `ctx.tokenMeter.measure(session)`。
- 实测值（真实 provider usage；`prompt = inputTokens + cacheReadTokens`）：

  | 请求 | 工具数 | prompt tokens | totalTokens | 备注 |
  |---|---:|---:|---:|---|
  | S_A 首请求 | 173 | **49,943**（input 279 + cacheRead 49,664） | 49,945 | 基线 |
  | S_B 首请求（yunxiao 关） | 103 | **30,446**（input 238 + cacheRead 30,208） | 30,448 | 对照 |
  | **A/B 差值** | **−70** | **−19,497（−39.04%）** | −19,497 | **真实省量** |
  | S1 第 1 轮 | 173 | 49,943（input 4,119 + cacheRead 45,824） | 49,945 | tokenMeter `total=49,945` |
  | S1 第 2 轮（yunxiao 关） | 103 | 30,457（input 8,825 + cacheRead 21,632） | 30,460 | tokenMeter `total=30,460` |
  | 同会话差值 | −70 | −19,486 | −19,485 | 与 A/B 差 11 token（第 2 轮多出 user+assistant 两条历史） |

  - tokenMeter 读数（服务真实调用）：关闭前 `total=49,945 / surface=4,629 / nodes=7 / baseline.kind="usage"`；关闭后 `total=30,460 / surface=6,213 / nodes=10 / kind="usage"`。**surface 增长 1,584**（其中 1,561 来自本地 `developer/message` 的 tool-removal 清单，该消息是宿主侧注册表增量，未计入 provider 账单）——因此「跨轮 total 直接相减」会失真；省量以 prompt（input+cacheRead）与首请求 A/B 为准。
  - tokenMeter 同一启发式对**真实 header** 的计算（`ceil(JSON.stringify(tools).length/4)+4`）：工具 schema **158,210 → 92,482 字符**、`toolsTokens` **39,557 → 23,125（−16,432，−41.5%）**；`systemTokens` **1,559 → 1,559（0，yunxiao 无 instructions）**。
  - **provider 实数 19,497 vs 启发式 16,432**：provider 高 **18.7%**，与 `dsh-token-meter` README 的「每 token 四字符对 JSON schema 低估」一致；本表同时给出两种口径，不混用。
  - 补充全关数据点（S9a，5 台 MCP + working_directory 全关，33 工具，首请求 prompt 12,517）与 S_A 49,943 相比 **−37,426（−74.9%）**；该对照的用户文本为「只回复 OK4。」（比基线多 1 个字符），误差 ≤1 token，仅作方向参考。
- 与基线差异原因：首轮 70 项「关闭后」只能做等价计算（D1 无法得到关闭后的请求头）；本轮得到**真实的 103 工具请求头与真实 usage**。
- 完整表格、逐服务器明细、公式与复现命令见 `token-savings.md`。
- 证据：`/tmp/stt-112r-sA-events.jsonl`、`/tmp/stt-112r-sB-events.jsonl`、`/tmp/stt-112r-s1-events-2.jsonl`、`/tmp/stt-meter-s1-baseline.json`、`/tmp/stt-meter-s1-after-yunxiao.json`、`/tmp/stt-112r-token-analysis.json`。

### ⑧ 面板端点直调返回 `ok:true` 且 `stats.catalog` ≈ 实测基线

**结论：PASS（复测轮复测面板读数；catalog 与主部署 214 不是同一语义）**

- 断言原文：面板端点直调（附录 §5.5 命令）返回 `ok:true` 且 `stats.catalog` ≈ 实测基线。
- 实际执行（容器内；`method` 必须等于端点名）：
  ```bash
  docker exec dsh node /tmp/stt-112r-api2.cjs panel <sid>
  # → POST http://127.0.0.1:3210/session-tool-toggle/panel
  #   {"type":"client-request","rpcId":"…","method":"panel","payload":{"sessionId":"<sid>"}}
  ```
- 实测值：`ok:true`；`stats={visible:173,catalog:143,denied:0,shadowed:0}`；响应 **50,356 B**（< 200 KB 阈值，R8/U8 无分页需求）。关闭 yunxiao 后同一端点返回 `{visible:103,catalog:143,denied:70,shadowed:0}`（catalog 恒为全局注册名数，符合定义）。
- 与基线差异原因：`stats.catalog` 是**全局层注册名数**（`src/host/panel.ts:157`），本实例 143 = MCP 139 + 4 个全局内置工具；主部署 214 是**可见工具数**，两者不是同一口径。若按可见数比：本实例 173 vs 主部署 214，差 41 = 本实例未装的其它插件的工具；**MCP 部分 139 逐台相等**。若按 catalog 自身口径比：本实例基线就是 143，端到端一致。
- 证据：`/tmp/stt-112r-panel-s1-before.json`、`/tmp/stt-112r-panel-s1-after-off.json`、`/tmp/stt-panel-s8.json`（首轮）。

### ⑨ 面板关闭 `mcp:yunxiao` 后与 `/tools status` 关闭集一致、`mutation.applied[0].matched = 70`

**结论：PASS（复测轮实测，`matched=70` 已直接读到）**

- 断言原文：面板关闭 `mcp:yunxiao` 后与 `/tools status` 关闭集一致、`mutation.applied[0].matched = 70`。
- 实际执行（新会话 S11，关闭前面板 173）：
  ```bash
  docker exec dsh node /tmp/stt-112r-api2.cjs toggle \
    session-932227f1-964a-4562-9845-dc6fe37caaf8 off mcp:yunxiao
  # → POST http://127.0.0.1:3210/session-tool-toggle/toggle
  #   {"type":"client-request","rpcId":"…","method":"toggle",
  #    "payload":{"sessionId":"<sid>","on":false,"addresses":["mcp:yunxiao"]}}
  ```
- 实测值：
  - HTTP 200、192 ms，`result.ok=true`；`snapshot.state={disabled:["mcp:yunxiao"],snapshot:[],seeded:true,storeKind:"record"}`。
  - **`mutation` 原文**：
    ```json
    {"applied":[{"address":"mcp:yunxiao","on":false,"matched":70}],
     "hiddenTools":70,"visibleBefore":173,"visibleAfter":103,"kvRebuild":true,"notices":[]}
    ```
  - toggle 同一响应里的 `stats={visible:103,catalog:143,denied:70,shadowed:0}`；随后再读面板仍是 `visible=103, disabled=["mcp:yunxiao"]`。
  - **与 `/tools status` 一致**：`【本会话开关】已关 1 项 · mcp:yunxiao 70 个工具定义（已关闭，服务器指令段已遮蔽）· 本会话可见工具 103 个`；未关闭项 0。
  - 反方向一致性（①）：命令面关闭后，面板 `state.disabled=["mcp:yunxiao"]`、`visible=103` —— 两个入口共享同一状态。
- 与基线差异原因：首轮因 D1 只能对 `tool:present` 验证（matched=1），`mcp:yunxiao` 的 70 未实测；本轮直接读到 `matched=70`，且 `visibleBefore/After=173/103`。
- 证据：`/tmp/stt-112r-toggle-s11.json`、`/tmp/stt-112r-status-s11-after.json`、`/tmp/stt-112r-panel-s11-before.json`、`/tmp/stt-112r-panel-s11-after.json`。

### ⑩ 面板默认档写入后 defaults.json 含新地址且既有会话不变；负路径

**结论：PASS（沿用首轮实测；本轮未复跑）**

- 断言原文：面板默认档写入后 `$DSH_HOME/session-tool-toggle/defaults.json` 含新地址且既有会话不变（负路径：`toggle` 发 `tool:bash` → `protected`；不存在的 sessionId → `session-not-live`）。
- 实际执行：
  ```bash
  POST /session-tool-toggle/defaults
  {"type":"client-request","rpcId":"defaults-1","method":"defaults","payload":{"action":"set","addresses":["mcp:figma"]}}
  ```
- 实测值：
  - 响应 `ok:true`、`changed:["mcp:figma"]`、`defaults.disabled:["mcp:figma"]`、`readable:true`。
  - 文件 `/tmp/stt-112-home/session-tool-toggle/defaults.json` 实际内容（已备份 `/tmp/stt-112-defaults-mcp-figma.json`）：
    ```json
    { "version": 1, "disabled": ["mcp:figma"] }
    ```
  - 既有会话 S8 面板：`state.disabled=["tool:present"]` **不变**（默认档只影响新会话快照，不追溯）。
  - 负路径 1：面板 toggle `["tool:bash"]` → `{ok:false,error:{code:"protected",message:"保护名单内的工具不能关闭：bash",details:{names:["bash"]}}}`。
  - 负路径 2：面板 toggle 不存在会话 `session-does-not-exist-0000` → `{ok:false,error:{code:"session-not-live",details:{sessionId:"session-does-not-exist-0000"}}}`。
  - 补一条同码负路径：实例重启后、会话尚未 resume 时对真实 S1 调面板 → 同样返回 `session-not-live`（运行态口径一致）。
- 与基线差异原因：无。
- 备注：复测轮开始前把默认档重置为 `{"version":1,"disabled":[]}`（备份 `/tmp/stt-112r-defaults-backup.json`），因此本轮所有新会话基线均为 173；首轮的 `mcp:figma` 默认档数据保留在上面的记录里。
- 证据：`/tmp/stt-defaults-resp.json`、`/tmp/stt-112-defaults-mcp-figma.json`、`/tmp/stt-panel-s8-2.json`、`/tmp/stt-neg-protected.json`、`/tmp/stt-neg-nolive.json`。

---

## 3. 缺陷 D1：已修复并验证

### 3.1 历史（首轮发现，已修复）

**根因（首轮定位到 file:line）**

1. `dsh-scope/lib/index.js:189-218`：`ScopedLayers.effect()` 在**返回 disposer 之前**同步调用 `onChange()`（即 `tools/change`）。
2. `src/host/session-layer.ts`：`this.restriction = surface.restrict({deny}); this.deny = deny` —— 记账发生在 `restrict()` **返回之后**；同步事件重入时 `this.deny` 仍是旧值。
3. `src/host/index.ts`：`tools/change` 监听器**同步**遍历 `layers` 调 `layer.refresh()`；重入的 `reconcile` 再次算出同一组非空 `deny` → 再次 `restrict` → 递归。
4. 触发条件：关闭地址命中 `catalog()` 里的名字（所有 139 个 MCP 工具都在 catalog；另有 4 个全局层内置工具）。agent 作用域独有名字不触发。

**首轮表现**：`/tools off mcp:yunxiao` / `mcp:figma` / `tool:working_directory` 永不返回；实例 CPU ~100%；栈为 1,485 帧重复 `restrict → … → refresh → restrict`；`⑥` 并发轮因此拖死整个宿主（4/5 无响应）。

### 3.2 修复与验证（本轮复测）

- 修复：`src/host/session-layer.ts` 的 `reconcile()` 入口加 `if (this.reconciling) return`，并用 `try/finally` 解锁（`reconciling` 字段；不挡 I3 重试路径）。
- 单测：3 个新增用例（含**反向验证**：移除闸后 3 例 FAIL）；`17 套件 / 637 tests` 全绿；typecheck 0；build 0；`lib/index.js` 重建后隔离实例 `link:` 生效。
- 冒烟验证：①⑥⑨ 全部由「未通过/条件通过」转为 PASS；`mcp:<server>`、`mcp:<server>::<tool>`、`tool:working_directory` 三类全局层地址均可正常关闭；5 agent × 6 地址顺序/并发 30+30 条全部返回；CPU 不再持续 100%。

### 3.3 残余观察（不阻塞，仅报告）

- **O1（文案）**：`commands.ts:344` 对所有 `mcp-group` 回执固定追加「+ 1 段服务器指令」，即使该服务器没有 instructions（yunxiao / chrome-devtools / figma 实测无段）。关闭行为与计数正确，仅回执文案不精确。
- **O2（测量口径）**：`tokenMeter.measure()` 的 `surfaceTokens` 会把本地 `developer/message`（tool-removal 清单）计入表层，而 provider 账单不含该增量 → 跨轮 `totalTokens` 不能直接相减；省量应以**同长度首请求 A/B** 或 `request/header` 切片计算（本任务已按此执行）。
- **拓扑差异（诚实边界）**：本隔离实例的 5 台 MCP 全部是全局 `mcp-client` 行，都进 `catalog`；主部署里 yunxiao / dbx / figma 走 project-mcp（不同挂载 ctx）。**project-mcp 拓扑下的 catalog 归属本任务未实测**；但触发 D1 的「全局层名字」路径已在本实例全部覆盖并通过。

---

## 4. 清理与「未改主 profile」证明

| 检查 | 命令 | 结果 |
|---|---|---|
| 隔离实例已停 | 容器内 `ps -eo pid,stat,args \| grep '[d]sh web --port 3210'` | 无存活进程（两个实例均按 SID 递归 TERM→KILL；首轮 PIDs 71940/…、复核轮 76366/…） |
| 残留进程 | `ps -eo pid,ppid,stat,sid,args` 过滤实例 SID | 仅 `Z [defunct]`（PPID=1，不占 CPU/内存；容器 PID 1 不回收，按纪律不重启主容器）；无 Sl/R 存活进程 |
| 主部署 MCP 未触碰 | 仅 kill 实例 SID 内的进程 | 主部署的 dbx（96/111/119、177/190/198、282/295/303）、chrome-devtools（71603 等）、yunxiao-bridge（9463）等**均未触碰** |
| 主 profile 未装插件 | `docker exec dsh dsh --profile web --dump-config \| grep -c session-tool-toggle` | `0` |
| 主 profile 配置内容未改 | `cat /home/docker/.dsh/profiles/web/cordis.yml` | 仍为 `[]`（223 B，与执行前一致）；`cordis.patch.yml` mtime 仍 2026-10-31 00:05、`package.json` 仍 2026-10-30 17:59 |
| 主 profile `cordis.yml` mtime | — | 因**任务要求执行的 `dsh --dump-config` 本身**会重写该文件而更新（实测：dump-config 前后 mtime 01:06:47→01:06:58，**内容/大小不变**）；非插件安装所致 |
| 主 Web 实例存活 | `curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/` | `401`（未带 token 的预期鉴权响应，实例正常；PID 1 `dsh web --no-open` 未重启） |
| 仓库写面 | `git status --short` | 本任务只改 `artifacts/` 下两个文件；`plugins/session-tool-toggle/**` 源码未由本任务修改（`lib/` mtime 00:58，早于复测轮）；`tasks.md` 未勾选 |
| 临时文件 | 全部在容器 `/tmp/stt-112r-*`、`/tmp/stt-meter-*`、`/tmp/stt-112-home`、`/tmp/stt-meter-probe` | 未写入仓库其它位置 |

---

## 5. 可复现命令速查（全部在容器内执行）

```bash
# 面板（method 必须 = 端点名）
docker exec dsh node /tmp/stt-112r-api2.cjs panel <sid>
# → POST http://127.0.0.1:3210/session-tool-toggle/panel
#   {"type":"client-request","rpcId":"p","method":"panel","payload":{"sessionId":"<sid>"}}

# 命令面（/tools off|status|reset）
docker exec dsh node /tmp/stt-112r-api2.cjs cmd <sid> "/tools off mcp:yunxiao"
docker exec dsh node /tmp/stt-112r-api2.cjs status <sid>

# 面板 toggle（off）
docker exec dsh node /tmp/stt-112r-api2.cjs toggle <sid> off "mcp:yunxiao"

# 建会话 / 提示 / fork
docker exec dsh node /tmp/stt-112r-api2.cjs create /home/xuqinqin/develop/person/dsh-plugins
docker exec dsh node /tmp/stt-112r-api2.cjs prompt <sid> "只回复 OK。"
curl -sS -X POST http://127.0.0.1:3210/api/session/fork \
  -H 'content-type: application/json' -b /tmp/stt-112r-cookie.txt \
  -d '{"type":"client-request","rpcId":"f","method":"session/fork","payload":{"args":{"request":{"sessionId":"<sid>"}}}}'

# ⑥ 顺序/并发重算（5 agent × 6 地址）
docker exec dsh node /tmp/stt-112r-storm.cjs seq  "<sid,sid,...>" "<addr,addr,...>" /tmp/out.json
docker exec dsh node /tmp/stt-112r-storm.cjs conc "<sid,sid,...>" "<addr,addr,...>" /tmp/out.json

# 会话日志解码（v4 分帧 zstd）+ 摘要（header/usage/state/command）
docker exec dsh node /tmp/stt-read-session.cjs \
  "/tmp/stt-112-home/sessions/--home-xuqinqin-develop-person-dsh-plugins--/<sid>/session.v4.jsonl.zstd" > /tmp/events.jsonl
docker exec dsh node /tmp/stt-112r-analyze.cjs /tmp/events.jsonl
```

> `/tmp/stt-read-session.cjs` 按 zstd magic（`28 b5 2f fd`）切帧逐帧解压（DSH 会话日志每批追加一帧，单次 `zstdDecompressSync` 只能读首帧）。

---

## 6. 附：探针与脚本（只落 /tmp，不入库）

```js
// /tmp/stt-meter-probe/index.js（片段）
import { writeFileSync } from 'node:fs'
export const name = 'stt-meter-probe'
export const inject = ['tokenMeter', 'commands', 'tools']
export function apply(ctx) {
  ctx.commands.register({ name: 'stt-meter', description: 'tokenMeter 落盘', input: { hint: '[label]' },
    handler: (invocation) => {
      const { session } = invocation.agent
      const label = (invocation.rawInput || 'meter').trim() || 'meter'
      const measure = ctx.tokenMeter.measure(session)
      const path = `/tmp/stt-meter-${session.id}-${label}.json`
      writeFileSync(path, JSON.stringify({ sessionId: session.id, seq: session.seq, measure }, null, 2))
      return { kind: 'success', text: `total=${measure.totalTokens} surface=${measure.surfaceTokens} -> ${path}` }
    } })
  ctx.commands.register({ name: 'stt-catalog', description: '导出 catalog 名单',
    handler: () => {
      const names = ctx.tools.schemas().map((schema) => schema.name)
      writeFileSync('/tmp/stt-catalog-names.json', JSON.stringify(names, null, 2))
      return { kind: 'success', text: `catalog ${names.length}` }
    } })
}
```

复测轮新增（同样只落 `/tmp`，不入库）：`/tmp/stt-112r-api2.cjs`（create/prompt/cmd/status/panel/toggle 封装）、`/tmp/stt-112r-storm.cjs`（5×N 顺序/并发重算）、`/tmp/stt-112r-cpusample.sh`（/proc utime+stime 采样）、`/tmp/stt-112r-analyze.cjs`（header/usage/state 摘要）。
