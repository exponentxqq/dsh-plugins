# session-tool-toggle 11.3 浏览器侧演示证据

- 任务：`tasks.md` 11.3「浏览器侧演示证据（扩展新增）」
- 断言原文：隔离实例里用 chrome-devtools MCP 打开面板、截图、切一个组开关再截图；验证：`artifacts/` 下存在两张截图 + 一段操作记录
- 执行时间：2026-10-31 01:12–01:20（Asia/Shanghai）
- 执行人：DSH 执行子代理（任务 11.3）
- 结论：**PASS**。两张 1440×900 PNG 都是真实 Web UI 截图（不是空白页 / 登录页）：一张面板打开态、一张切掉 `mcp:codebase-memory` 整组后的状态；操作序列、登录方式与前后差异见下文。

> 红线：本记录只写隔离实例（`DSH_HOME=/tmp/stt-113-home`，端口 3212）的实测事实；截图由主实例的 chrome-devtools MCP（容器内 headless Chromium）拍摄，未拼接、未改图。主 profile 未被安装本插件、未被重启。

---

## 1. 隔离实例

| 项 | 值 |
|---|---|
| `DSH_HOME` | `/tmp/stt-113-home`（独立数据目录，与主 `~/.dsh` 无关） |
| 端口 | `3212`（容器内 `127.0.0.1`；浏览器与实例同在 dsh 容器，走 loopback） |
| profile | `profiles/web`：bundles = `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-plugin-session-tool-toggle` |
| 插件安装 | `package.json` 依赖 `"dsh-plugin-session-tool-toggle": "link:/home/xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle"`（profile 骨架从 11.2 的 `/tmp/stt-112-home/profiles/web` 复制，**未重跑** `dsh plugin add`；启动日志已确认插件装配成功） |
| 额外 patch | `llm-deepseek`（`DEEPSEEK_API_KEY`）+ `agent-default-model`（`deepseek-official/deepseek-flash`）+ 两台全局 `mcp-client`（`codebase-memory` 17 工具、`figma` 2 工具） |
| 启动命令 | `docker exec -d -e DSH_HOME=/tmp/stt-113-home dsh sh -c 'cd /tmp && exec dsh web --port 3212 --no-open > /tmp/stt-113-web.log 2>&1'` |
| 启动日志 | `/tmp/stt-113-web.log`（19 行；第 8 行为带 `?token=` 的 URL；无 `error` / `unhandled`） |
| 认证 | 浏览器直接打开日志里的 `http://127.0.0.1:3212/?token=<token>`：服务端 303 写入 `dsh-auth-…` HttpOnly cookie 后跳回 `/`（无需手工注入 cookie）。API 复读用同一 token 经 `curl -c /tmp/stt-113-cookie.txt` 换 cookie |
| 关停 | 按 SID 递归 TERM：`kill -TERM -78404`（实例 PID 78404，SID/PGID 同）；`ps` 无残留，3210/3212 均无监听 |

**装配与启动（可复现）**

```bash
# 1) profile 骨架（从 11.2 隔离 home 复制，只动 /tmp）
mkdir -p /tmp/stt-113-home/profiles
cp -a /tmp/stt-112-home/profiles/web /tmp/stt-113-home/profiles/web
# 重写 /tmp/stt-113-home/profiles/web/cordis.patch.yml：
#   llm-deepseek / agent-default-model / mcp-codebase-memory / mcp-figma
# 2) 启动
docker exec -d -e DSH_HOME=/tmp/stt-113-home dsh sh -c \
  'cd /tmp && exec dsh web --port 3212 --no-open > /tmp/stt-113-web.log 2>&1'
# 3) 登录（浏览器与 curl 各一次）
TOKEN=$(grep -o 'http://127.0.0.1:3212/?token=[^ ]*' /tmp/stt-113-web.log | tail -1 | cut -d= -f2)
curl -sS -o /dev/null -c /tmp/stt-113-cookie.txt "http://127.0.0.1:3212/?token=$TOKEN"
```

隔离实例的可见工具面（面板/`/tools` 的同一状态源）：**53 个可见工具** = MCP 19（codebase-memory 17 + figma 2）+ skill 1 + builtin 33；catalog 23 = 19 个 MCP 全局注册名 + 4 个全局内置（`working_directory` / `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`）。**这是本隔离实例的读数，不是主部署的 214**。

---

## 2. 浏览器路径与登录方式

- **浏览器路径：chrome-devtools MCP（任务要求路径），未走备选 chromium 无头截图。**
  - 工具：主实例的 `mcp__chrome-devtools-mcp__*`（主 profile 的 `browser-use` + `browser-use-devtools` 提供方）。
  - 实测 UA：`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36`；视口 `1440×900`，DPR 1。
  - 浏览器在 **dsh 容器内**，因此可直连隔离实例的 `127.0.0.1:3212`（不经过宿主 `172.19.0.3`）。
- **登录**：`new_page('http://127.0.0.1:3212/?token=<token>')` → token 端点 303 → 浏览器持有 `dsh-auth-…` cookie → 页面进入 DeepSeek Harness。**没有**使用 `evaluate_script` 手工写 cookie 的兜底。
- **截图落盘路径的注意点**：chrome-devtools MCP 未与客户端协商 MCP roots，文件写被限制在 OS 临时目录，直接写仓库路径会被拒绝（`Access denied: … is not within any of the configured workspace roots`）。因此 `take_screenshot` 的 `filePath` 先写 `/tmp/stt-113-*.png`，再由 shell 复制进 `artifacts/` 并用 sha256 核对（见 §4）。

---

## 3. 操作序列（浏览器内逐步）

| # | 动作 | 工具/接口 | 实测结果 |
|---|---|---|---|
| 1 | 建页并导航到 token URL | `new_page` | 页标题 `DeepSeek Harness`，URL 归一到 `http://127.0.0.1:3212/`（token 已被换成 cookie） |
| 2 | 关闭 Preview Notice | `click`「Continue」 | 进入主界面（左侧栏、WorkSpaces、空会话页） |
| 3 | 处理「Unable to create default workspace」 | `click`「Choose workspace」→ 目录选择器 | 新 `DSH_HOME` 无默认工作区；选择 `/home/xuqinqin/develop/person/dsh-plugins/` → 进入 `dsh-plugins` → Open；左侧出现工作区 `dsh-plugins` 与 `New Session` |
| 4 | 发一条消息建立**活会话** | 输入「你好，请只回复 OK。」→ Send | 网络 `POST /api/session/create` 200、`POST /api/session/prompt` 200；会话 `session-371c374a-b5b9-41a7-8ab8-555206e77972`（创建于 01:14:33），模型 `deepseek-official/deepseek-flash` 回复「OK」，页标题变 `Greeting` |
| 5 | 定位并点击本插件入口 | `take_snapshot` → `click` 头部工具区按钮 | 按钮：`aria-label="Tools"`、`aria-description="Open the session tool surface panel"`、`title="Session tool switches: turn groups or single tools off for this session"`、`aria-haspopup="dialog"`、`aria-expanded="true"`、class `… stt_trigger_41d0f6`，28×28 位于 (1364,11)。点击后出现 `role="dialog" aria-modal="true"`、标题 `Session tool surface`、class `… stt_dialog_41d0f6`；客户端发 `POST /session-tool-toggle/panel` 200 |
| 6 | **截图 1** | `take_screenshot(filePath=/tmp/stt-113-panel-open.png)` | 面板打开态（见 §4） |
| 7 | 切一个**组开关** | `click` 组行右侧开关（`switch`，label `Session switch for codebase-memory`） | 客户端发 `POST /session-tool-toggle/toggle` 200（reqid 64）：请求体 `{"type":"client-request","rpcId":"ec3889ec-…","method":"toggle","payload":{"sessionId":"session-371c374a-…","on":false,"addresses":["mcp:codebase-memory"]}}`；响应 `state.disabled=["mcp:codebase-memory"]`、该组 `disabledCount=17 / disabled=true`。面板不做乐观更新，等宿主快照回来才翻转 |
| 8 | 等刷新并**截图 2** | `wait_for(["17 off","36 visible here"])` → `take_screenshot(filePath=/tmp/stt-113-panel-after-toggle.png)` | 切换后态（见 §4） |
| 9 | 只读核对命令面同一状态 | `POST /api/commands/execute` 跑 `/tools status` | 输出「已关 1 项 · mcp:codebase-memory 17 个工具定义（服务器指令段已遮蔽）· 本会话可见工具 36 个」，与面板一致（见 §5） |

对话侧的网络证据（`list_network_requests`）：`POST /api/session/create [200]`、`POST /api/session/prompt [200]`、`POST /session-tool-toggle/panel [200]`（reqid 63）、`POST /session-tool-toggle/toggle [200]`（reqid 64）。

> 说明：隔离 profile 没有配置界面语言，UI 为英文，所以入口的 `aria-label` 是 `Tools`；同一组件的中文文案是「工具面」（`action.label`）、「打开会话工具面面板」（`action.aria`）、「会话工具开关：本会话内的工具可分组或逐个关闭」（`action.tooltip`）。`stt_` 前缀的 CSS module class 与 `aria-description` 可唯一识别本插件入口。截图中面板标题即「Session tool surface」（中文「会话工具面」）。

---

## 4. 两张截图与状态对应

| 文件 | 尺寸 / 字节 | sha256 | 界面态 |
|---|---|---|---|
| `artifacts/panel-open.png` | 1440×900 / 133,906 B | `c2d54776e9b5967b8227bdc00ff419e3fe4ae6077949abdb7459d47d17c5646f` | **切换前（面板打开态）**：Greeting 会话上覆盖模态「Session tool surface」；状态摘要 **53 visible here / 23 in the catalog / 0 off / 0 hidden**；分组：MCP servers `codebase-memory` 17 tools（开关开）、MCP servers `figma` 2 tools（开关开）、Skills 1 tool（展开，`skill`）、Built-in tools 33 tools（展开，`ask_user_question`、`bash`+Protected、`create_goal`、`edit`+Protected、`exit_plan_mode`、`get_goal`、`glob`+Protected、`grep`+Protected…） |
| `artifacts/panel-after-toggle.png` | 1440×900 / 138,606 B | `bb0a895b9cd21d6987c4ffcb1998919a7a10b455c4b3b00fa73708d79f9f658a` | **切换后**：同一模态；状态摘要变为 **36 visible here / 23 in the catalog / 17 off / 0 hidden**；`codebase-memory` 组行变为 **17 tools · 17 off**、右侧开关为关；新增蓝色提示行「Turned off 17 tools; the prefix cache will be rebuilt once from the first changed schema token.」；其余分组（figma / Skills / Built-in）不变 |

两张图都能看到左侧工作区 `dsh-plugins`、会话 `Greeting`、输入「你好，请只回复 OK。」与模型回复「OK」；面板未遮挡关键读数。截图由 `take_screenshot` 直接产生 PNG，无裁剪/拼接；字节数与 sha256 在复制到 `artifacts/` 后复核一致。

---

## 5. 切换前后差异（实测数据）

| 观测点 | 截图 1（打开态） | 截图 2（切换后） |
|---|---|---|
| 面板状态摘要 | 53 visible / 23 catalog / **0 off** / 0 hidden | 36 visible / 23 catalog / **17 off** / 0 hidden |
| `codebase-memory` 组行 | `MCP servers codebase-memory 17 tools` | `MCP servers codebase-memory 17 tools · 17 off` |
| `codebase-memory` 组开关 | 开（checked） | 关（unchecked） |
| Off set（第四段） | `Nothing is turned off.` | chip `mcp:codebase-memory` + 「Turn on mcp:codebase-memory」 |
| 提示行 | 无 | `Turned off 17 tools; the prefix cache will be rebuilt once from the first changed schema token.` |
| 浏览器 RPC | `POST /session-tool-toggle/panel` 200，`state.disabled=[]` | `POST /session-tool-toggle/toggle` 200，`state.disabled=["mcp:codebase-memory"]`；随后 `panel` 200 读到同值 |
| 服务端日志 | — | 第 15 行「已掩掉 17 个工具定义 [mcp__codebase-memory__…, +11]」；第 16 行「已遮蔽 mcp:codebase-memory 指令段」 |

**面板 RPC 读数（`/tmp/stt-113-panel-before.json` / `-after.json`，HTTP 200，服务端 30 ms / 26 ms）**

```jsonc
// 切换前
{ "stats": { "visible": 53, "catalog": 23, "denied": 0, "shadowed": 0 },
  "state": { "disabled": [], "storeKind": "record" },
  "groups": ["mcp|codebase-memory|17|0", "mcp|figma|2|0", "skill|skill|1|0", "builtin|builtin|33|0"] }
// 切换后
{ "stats": { "visible": 36, "catalog": 23, "denied": 17, "shadowed": 0 },
  "state": { "disabled": ["mcp:codebase-memory"], "storeKind": "record" },
  "groups": ["mcp|codebase-memory|17|17", "mcp|figma|2|0", "skill|skill|1|0", "builtin|builtin|33|0"] }
```

**`/tools status` 原文（切换后，`POST /api/commands/execute` 200，63 ms）**

```text
【本会话开关】已关 1 项
  · mcp:codebase-memory 17 个工具定义（已关闭，服务器指令段已遮蔽）
  · 本会话可见工具 36 个（持久化通道：会话日志）
【默认档】/tmp/stt-113-home/session-tool-toggle/defaults.json（0 项关闭）
  · 本会话创建于 2026-10-30T17:14:33.291Z；快照来源=创建时默认档快照（0 项关闭）；/tools reset 回到这里
【可关对象】MCP 服务器 2 台（mcp:codebase-memory 17、mcp:figma 2）；内置工具 34 个（其中 6 个受保护）；单工具关闭 0 项
【保护名单】7 项：bash、edit、glob、grep、pwsh、read、write
  · 被其他作用域隐藏 0 个工具定义（全局层有、本会话不可见）
```

结论：浏览器面板上的「切组开关」与宿主状态、`/tools` 命令面、服务端掩码日志是**同一状态**；切换使可见工具 53 → 36（正好 −17），并同时遮蔽 `mcp:codebase-memory` 的服务器指令段。

> 计数口径说明：`/tools status` 的「内置工具 34 个」把非 MCP 的 `skill` 也计入（`control.ts` 的 `builtinNames` = 非 MCP 候选名）；面板把它拆成 Skills 1 + Built-in 33。所以 34 = 面板 33 + 1，不是切换造成的差异。

---

## 6. 环境清理与主 profile 未改

**清理**

```text
$ kill -TERM -78404                     # 隔离实例 PID 78404（SID/PGID 78404）
$ ps -eo pid,args | grep '[d]sh web --port 3212'
（无输出）
$ ss -ltnp | grep -E ':321[0-9]'
（无输出；3210/3212 均无监听）
$ ps -eo pid,args | grep -E '[f]igma-developer-mcp|[c]odebase-memory-mcp'
（只剩主实例既有的 68/109/225/330，隔离实例的 78431/78460 已消失）
```

**主实例与主 profile**

```text
$ ps -o pid,args -p 1
  1 node /usr/local/bin/dsh web --no-open        # 主实例进程未重启
$ curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/   # 401（鉴权正常）
$ curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3081/   # 200
$ docker exec dsh dsh --profile web --dump-config | grep -c session-tool-toggle
0
$ docker exec dsh dsh plugin --profile web list
…（列表无 dsh-plugin-session-tool-toggle）
```

- 隔离实例的 `DSH_HOME` 显式指定为 `/tmp/stt-113-home`；主 profile（`/home/docker/.dsh/profiles/web`）未被安装本插件、未改 `package.json` / `cordis.patch.yml`。
- 仓库内**只新增** `openspec/changes/session-tool-toggle/artifacts/` 下的文件（两张 PNG + 本记录）；未 `git add` / `git commit`，未改 `tasks.md` 勾选。`git status` 里其它改动均为本次 change 既有工作，不在本任务写范围内。

**过程备注（如实记录）**：侦察阶段曾执行 `docker exec dsh sh -c 'dsh web --help'`，该命令会真正启动 web（而不是只打印帮助）并短暂多起一个进程；发现后立即 `kill`（PID 78261/78267），主实例 PID 1 未受影响（3080=401、3081=200 均正常），主 profile `--dump-config` 中本插件计数仍为 0。此过程未修改任何 profile 文件，也未产生会话。

---

## 7. 证据文件清单

| 路径 | 说明 |
|---|---|
| `artifacts/panel-open.png` | 截图 1（1440×900，133,906 B） |
| `artifacts/panel-after-toggle.png` | 截图 2（1440×900，138,606 B） |
| `artifacts/browser-demo.md` | 本记录 |
| `/tmp/stt-113-web.log` | 隔离实例启动日志（19 行，无 error；含 token 与插件装配/掩码行） |
| `/tmp/stt-113-panel-before.json` | 切换前 `POST /session-tool-toggle/panel` 完整响应 |
| `/tmp/stt-113-panel-after.json` | 切换后 panel 响应 |
| `/tmp/stt-113-status-after.json` | 切换后 `/tools status` 响应 |
| `/tmp/stt-113-api.cjs` | 隔离实例 API 封装（panel/toggle/status；端口 3212） |
| `/tmp/stt-113-home/` | 隔离 `DSH_HOME`（保留供复核；不含任何主 profile 数据） |
| `/tmp/stt-113-panel-open.png`、`/tmp/stt-113-panel-after-toggle.png` | MCP 中间产物（与 artifacts 同名文件 sha256 一致） |

## 8. 边界与说明

- 本演示证明的是**浏览器侧面板 → 宿主 RPC → 会话状态**这条链路；「下一次模型请求的工具定义真的变少」由 11.2 的 `request/header` 实测（173 → 103、system 指令段移除）覆盖，本任务未重复抓 provider 请求。
- 隔离实例只有 2 台 MCP（codebase-memory / figma），可见 53；主部署另有 project-mcp 等插件，数字不可直接对比。
- 面板语言随实例 UI（英文）；中文文案键已在插件的 `locales.ts` 中定义（见 §3 说明）。
- `codebase-memory` 是带 instructions 的服务器，关组时日志明确记录「已遮蔽 mcp:codebase-memory 指令段」，与 11.2 的指令段机制一致。
