> 证据类型：隔离冒烟记录｜采集时点：2026-11-05（正文记录）｜结论：隔离冒烟 9 条全部通过（9/9），无红项；真实宿主复验与 fail-closed 边界同样成立。

## 隔离冒烟记录（验证证据）

在一份**独立 `DSH_HOME`、独立端口的同构 web profile 实例**上完成（`dsh --profile web --port 3099 --no-open`，数据目录与端口都与正在运行的宿主隔离，不打扰线上会话）。探针用 `/tmp/probe-mcp.mjs`：每台服务器暴露一个 `ping` 工具，回显自己的实例名；`serverName` 取文件名，另在 `opc/.dsh/mcp/` 放一台与 `dsh-plugins/.dsh/mcp/` 同名的 `probe-shared` 验证仲裁，`broken.yaml`（非法 YAML）验证单文件失败隔离。

| 会话归属（cwd） | 归属根数 | 可见 serverName | deny | 模型自述可见的 `mcp__` 工具 |
| --- | --- | --- | --- | --- |
| `…/person/dsh-plugins` | 3 | figma, probe-opc, probe-plugins, probe-shared | 1 | 5 个（figma×2 + probe 系 3；**没有** probe-cs） |
| `…/company/web/cloud-the-sky` | 2 | probe-cs | 5 | 2 个（probe-cs + profile 级 probe-profile） |
| `/tmp`（无归属） | none | —（fail-closed） | 6 | 全部项目 MCP 工具不可见 |

> 注记：本表早于 isolation-enforcement 变更（2026-11-05 记录），重载行为以「降级矩阵」新语义为准（重载补挂 + 全局闸口），本表不重跑。

同一轮冒烟同时确认：

- **双向互不可见**：A（dsh-plugins）看不到 B（cloud-the-sky）的 `probe-cs`，B 也看不到 A 的 figma/probe-opc/probe-plugins/probe-shared。
- **profile 级 MCP 不受影响**：profile 行 `probe-profile` 在任何会话都可见——不在受管 `serverName` 集合里的工具永不进 deny。
- **同名冲突**：只加载 `dsh-plugins` 那台 `probe-shared`，`opc` 那台按规则跳过并记 error（含双方来源）。
- **单文件失败隔离**：`broken.yaml` 每次重扫只报一条解析错误，其余配置照常加载。
- **共享根只扫一遍**：某物理根同时是「A 的主根」与「B 的附加根」时不再产生自冲突噪声。
- **`/mcp-reload`**（走 GUI 输入框同一条 `commands/execute` RPC）实测反馈：`已重扫：加载 0、重载 0、卸载 0、保持不变 5、跳过 2、失败 0`；「跳过 2」正好对应 `broken.yaml` 与那台真正撞名的 `probe-shared`。
- **诊断可见**：进程 stdout / `docker logs` 逐次打印 `isolation: cwd=… roots=N visible=[…] global=N(mcp=N) scoped=N(mcp=N) carried=N deny=N […]` 与 `isolation: masked N tool(s) […]`，并印证「内置工具在 agent 平面（global 只有 9 个，agent 视角 35 个）」。

复现要点：准备临时 `DSH_HOME`（含 `storages/workspace.json` 工作区登记与 `multi_root_workspace.json` 授予关系）→ `dsh plugin --profile web add <本包绝对路径>`（可选加 multi-root 包）→ `dsh --profile web --port <备用端口> --no-open` → `POST /api/session/create`（`cwd` 指定工作区）→ `POST /api/session/prompt` 提问 → `POST /api/session/page` 读回答。

**真实宿主复验**（探针已清空、只留交付配置 `opc/.dsh/mcp/figma.yaml`；宿主重启加载新构建后）：

| 会话 cwd | 日志 `visible` / `deny` | 结论 |
| --- | --- | --- |
| `…/person/dsh-plugins`（opc 是其附加根） | `visible=[figma]` / `deny=0` | 归属内的 figma 可见 ✓ |
| `…/company/opc` | `visible=[figma]` / `deny=0` | 交付配置对本地会话可见 ✓ |
| `…/company/web/cloud-the-sky` | `visible=[]` / `deny=2` → `masked 2` | 越权工作区**看不到** `mcp__figma__*`：模型自述前缀统计 `mcp__figma__` = 0，profile 级 69 个（dbx/codebase-memory/chrome-devtools-mcp）不受影响 ✓ |
| `/tmp`（无归属） | `roots=none` / fail-closed | 项目 MCP 工具全不可见 ✓（旧构建基线下同样成立） |

同一宿主上 `/mcp-reload` 反馈：`已重扫：加载 0、重载 0、卸载 0、保持不变 1、跳过 0、失败 0`（仅剩 figma 一台；「跳过 0」= 无坏配置、无同名冲突、共享根不再自冲突）。

### 三面冒烟（G5，9 条）

在**独立 `DSH_HOME`（`/tmp/spike-smoke/home`）、独立端口（3099）的同构 web profile 实例**上完成（dsh `0.2.1-rc.5`，工作区含本变更实现；主实例与 `~/.dsh` 全程未触碰）。逐条命令与逐字观察见 [`openspec/changes/archive/2026-11-04-project-mcp-name-resource-isolation/artifacts/smoke-record.md`](../../../openspec/changes/archive/2026-11-04-project-mcp-name-resource-isolation/artifacts/smoke-record.md)。

| # | 断言 | 名字面 | 资源面 |
| --- | --- | --- | --- |
| ① | A 会话名字面只含 A 项目名 + profile 名 | ✓ `kept=[probe-a,probe-profile,probe-shared] removed=[probe-b]`；`### MCP server: probe-b` 零命中 | — |
| ② | A 读 `probe-a` 资源成功 | — | ✓ `isError=false`，请求日志新增 `resources/list`、`resources/read` |
| ③ | A 对 `probe-b` 三个资源工具全拒且不触达 | — | ✓ 文案与上游 unavailable 同形；`probe-b` 请求日志 4 行前后相等、diff 为空 |
| ④ | 无归属 `/tmp` 会话 fail-closed | ✓ 项目名计数 0 | ✓ 四个项目资源调用全 `isError=true` |
| ⑤ | profile 服务器在 A / B / tmp 三会话可见可读 | ✓ 三会话名字段均含 `probe-profile` | ✓ 读取成功，`probe-profile` 请求日志 4→10 |
| ⑥ | 删配置后名字与资源同步变化 | ✓ 名字段变为 `["probe-profile","probe-shared"]`；watcher 与 `/mcp-reload` 两路径逐字相等 | ✓ `probe-a` 调用被拒；`/mcp-reload` 回执含「卸载 1」 |
| ⑦ | 工具面回归 + `session-tool-toggle` 行为不变 | ✓ `mcp:probe-a` 指令段随开关隐藏 / 恢复 | 边界：`/tools off` 不关资源 provider，资源读取仍成功（见「残余边界」） |
| ⑧ | PTC 内层越权同样被拒 | — | ✓ `tool/ptc-dispatch` `isError=true`；`probe-b` 请求日志 4 行前后相等 |
| ⑨ | 同名 claim 加载失败不误伤 profile | ✓ `probe-shared` 名字保持 | ✓ profile 工具与资源在 A / B 均可用，`deny` 里无 `probe-shared` |

结论：**9 条全部通过（9/9）**，无红项。⑨ 直接验证 `blocked = claimed \ failedClaims`：`probe-shared` 由 profile 行先占、ws-a 项目侧加载失败时，该名未进入应拒集合，B 与 A 会话都能调用 profile 的 `mcp__probe-shared__ping` 并读取其资源——「加载失败的 claim 误伤同名 profile 服务器」已修复。
