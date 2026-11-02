# session-tool-toggle 11.2 实测省量表（token 前后对照）

- 任务：`tasks.md` 11.2 的 ⑦「tokenMeter 前后对照省量表」
- 执行时间：
  - 首轮：2026-10-31 00:38–00:57（Asia/Shanghai；容器日志为 UTC 16:38–16:57）
  - **复测轮：2026-10-31 01:00–01:08**（Asia/Shanghai；UTC 17:00–17:08）——D1 修复后，70 项由「等价计算」升级为**真实 provider usage 实测**
- 环境：隔离实例 `DSH_HOME=/tmp/stt-112-home`、端口 `3210`、web profile；基线 `visible=173`、`catalog=143`（语义与主部署 214 的差异见 `smoke-record.md` §1.3/§1.4）；MCP 5 台实测共 139 个工具（yunxiao 70 / chrome-devtools-mcp 32 / dbx 18 / codebase-memory 17 / figma 2）
- 方法：**三种口径并行**，数值均来自真实请求/日志，不混用：
  1. **A/B 首请求（主口径，真实 provider usage）**：两个全新会话、同一句提示词、同一 system/message，唯一差异是 70 个 yunxiao 工具 → `prompt tokens = inputTokens + cacheReadTokens` 直接相减；
  2. **同一会话连续两轮（真实请求头 + 真实 usage）**：S1 第 1 轮（173 工具）→ 关 yunxiao → 第 2 轮（103 工具）；
  3. **tokenMeter 服务读数 + 其对真实 header 的固定启发式**（辅助口径，便于与首轮等价计算对照）。
- 结论一句话：关闭 `mcp:yunxiao`（70 个工具）**真实 provider 口径每请求省 19,497 prompt tokens（−39.0%）**；tokenMeter 启发式口径为 **−16,432（−41.5% 的工具 token）**；系统提示词省量为 **0**（yunxiao 无 instructions）。

---

## 1. 数据来源与公式

| 输入 | 来源（本轮实测） | 实测值 |
|---|---|---|
| 基线请求头（173 工具） | S_A `session-b1c081fa…` 首请求 `request/header`（真实模型调用） | 173 个工具，`JSON.stringify(header.tools).length = 158,210` |
| 关闭 yunxiao 后请求头（103 工具） | S_B `session-07891a6f…` 首请求（该会话首个请求前已关 yunxiao） | 103 个工具，`chars = 92,482` |
| 关闭后下一轮请求头（同会话） | S1 第 2 轮 `request/header`（`reason:"change"`） | 103 个工具，`chars = 92,482`（与 S_B 逐字节相同的 schema） |
| `system/message` | S_A / S_B 首请求 | 均为 6,217 字符；段标题 `codebase-memory`(305 字) + `dbx`(89 字)，无 yunxiao |
| provider usage | `assistant/message.data.usage` | 见 §2 |
| tokenMeter 读数 | `/stt-meter baseline` / `/stt-meter after-yunxiao` | 见 §3 |

公式（与 `@deepseek-ai/dsh-token-meter/lib/index.js` 逐字一致）：

```text
CHARS_PER_TOKEN = 4
BLOCK_OVERHEAD  = 4
estimateToolsTokens(header) = ceil(JSON.stringify(header.tools).length / 4) + 4
estimateSystemMessage(msg)   = ceil(systemChars / 4) + 4
provider prompt tokens       = usage.inputTokens + usage.cacheReadTokens
usage.totalTokens            = inputTokens + cacheReadTokens + outputTokens
```

> 选择该公式而不是 `chars/4` 的粗略估算：它就是 `ctx.tokenMeter` 的 `toolsTokens` / `systemTokens`（`contextBreakdown` 投影）所用的固定启发式，输入又是真实请求头/系统提示词，因此**与 tokenMeter 的口径同源**。

---

## 2. 省量表
### 2.1 主表：关闭 `mcp:yunxiao`（70 个工具），真实 provider A/B

| 项 | 关闭前（173 工具，S_A） | 关闭后（103 工具，S_B） | 差值 | 比例 |
|---|---:|---:|---:|---:|
| 工具数 | 173 | 103 | **−70** | −40.5% |
| 工具 schema 字符数 | 158,210 | 92,482 | −65,728 | −41.5% |
| `toolsTokens`（tokenMeter 公式） | 39,557 | 23,125 | **−16,432** | −41.5% |
| **provider prompt tokens（input+cacheRead）** | **49,943**（279 + 49,664） | **30,446**（238 + 30,208） | **−19,497** | **−39.0%** |
| provider output tokens | 2 | 2 | 0 | — |
| provider totalTokens | 49,945 | 30,448 | −19,497 | −39.0% |
| `systemTokens`（yunxiao 段） | 1,559（全系统提示） | 1,559 | 0 | 0% |

- **A/B 的干净性**：S_A、S_B 都是各自会话的**第一次**模型请求，`system/message` 同为 6,217 字符、用户提示词同为「只回复 OK。」、均无历史；唯一变量是 yunxiao 的 70 个工具 schema。因此 19,497 就是这 70 个工具在 provider 词表下的真实 token 数。
- yunxiao 的 `initialize` 返回 **无 instructions**（`instructionsLength=0`，`serverInfo: alibabacloud-devops-mcp-server 0.3.68`），因此关闭整组 **不产生系统提示词省量**（`### MCP server: yunxiao` 本来就不存在）。这正是 ① 第二条子句在本实例「空真」、需改用 codebase-memory 验证的原因。
- 每请求真实省 ≈ 1.95 万 token；这是**提示词工具面**的省量，不含 KV 缓存一次性重建成本。命令回执已如实提示「前缀缓存将从第一个变化的 schema token 起重建一次」。

### 2.2 同一会话连续两轮（S1，真实请求 + 真实 usage）

| 轮次 | 触发 | 工具数 | schema 字符 | `toolsTokens` | provider prompt | provider total |
|---|---|---:|---:|---:|---:|---:|
| 第 1 轮 | 首次提示（`reason:"initial"`） | 173 | 158,210 | 39,557 | 49,943（4,119 + 45,824） | 49,945 |
| 第 2 轮 | 关闭 yunxiao 后提示（`reason:"change"`） | 103 | 92,482 | 23,125 | 30,457（8,825 + 21,632） | 30,460 |
| **差值** | — | **−70** | −65,728 | **−16,432** | **−19,486** | −19,485 |

- 与 A/B 的 19,497 相差 **11 token**：第 2 轮比第 1 轮多出 user「只回复 OK2。」与 assistant「OK2」两条历史，正好约 11 token；说明**真实省量与首请求 A/B 一致**。
- 关闭后首轮会额外产生一条 `developer/message`（`source.kind="tool-registry"`，内容为 70 条 `tool-removal` 清单，1,561 个启发式 token）。该消息**未计入 provider 账单**（由差值 19,486 vs 19,497 反推：若计入，差值应少 1,561），但被 `tokenMeter.surfaceTokens` 计入 → 见 §3 的「不能直接相减」说明。

### 2.3 逐服务器工具面明细（同一份真实 173 工具 header 内切片，启发式口径）

| serverName | 工具数 | schema 字符数 | `toolsTokens`（整份 − 移除后） | 系统提示段字符 | 备注 |
|---|---:|---:|---:|---:|---|
| `yunxiao` | 70 | 65,728 | **16,432** | 0 | 无 instructions |
| `chrome-devtools-mcp` | 32 | 28,541 | 7,135 | 0 | 无 instructions |
| `dbx` | 18 | 15,713 | 3,928 | 89 | 有 instructions（短） |
| `codebase-memory` | 17 | 15,892 | 3,973 | 305 | 有 instructions |
| `figma` | 2 | 3,731 | 933 | 0 | 无 instructions |
| **MCP 合计** | **139** | 129,605 | —（切片不可严格相加） | **394** | — |
| 非 MCP（builtin 33 + skill 1） | 34 | 28,605 | — | — | — |
| **全部** | **173** | **158,210** | **39,557** | **6,217**（1,559 token） | — |

> 逐服务器 `toolsTokens` 是「整份 JSON 的 token 数 − 移除该服务器工具后的 token 数」，切片的边际效应会带来 ±几 token 的差异，不能简单相加得到 39,557。
> 由表可见：**yunxiao 是工具面最大头（70/173 个工具、41.5% 的 tools token）**；系统提示段只有 codebase-memory（305 字）与 dbx（89 字）两段，合计 394 字。

### 2.4 系统提示段（**更正首轮的一处测量错误**）

| 状态 | `system/message` 字符 | tokenMeter `systemTokens` | 段标题集合 |
|---|---:|---:|---|
| 基线（5 台 MCP 全开） | 6,217 | 1,559 | `["codebase-memory","dbx"]` |
| 关闭 `mcp:codebase-memory` | 5,912 | 1,482 | `["dbx"]` |
| 关闭全部 5 台 MCP | 5,823 | 1,460 | `[]` |

- 精确切分：全部关闭时移除 **394 字符 = codebase-memory 305 + dbx 89**；yunxiao / chrome-devtools / figma **各 0 字符**。
- **更正**：首轮 §2.2 把 `dbx` 系统段记为 **2,724 字符（≈681 token）**——那是从 `### MCP server: dbx` 一直切到字符串末尾，把其后的通用 Harness 指令（2,635 字符）也算了进去。本轮用「全关时被移除的整块」对齐，真实 dbx 段只有 **89 字符**（≈22 token）。首轮的 2,724 作废，以本表为准。
- 因此：**关闭 `mcp:yunxiao` 的系统提示词省量为 0**；关闭全部 MCP 的系统段省量也只有 394 字符（≈99 token），远小于工具面的省量。

### 2.5 全关对照（补充数据点）

S9a（5 台 MCP + `tool:working_directory` 全关）首请求：**33 工具**、28,244 字符、`toolsTokens=7,065`、`system/message` 5,823 字符、provider prompt **12,517**（input 12,005 + cacheRead 512）。

| 对照 | 173 工具（S_A） | 33 工具（S9a） | 差值 | 比例 |
|---|---:|---:|---:|---:|
| 工具数 | 173 | 33 | −140 | −80.9% |
| schema 字符 | 158,210 | 28,244 | −129,966 | −82.1% |
| provider prompt | 49,943 | 12,517 | **−37,426** | **−74.9%** |

> S9a 的提示词是「只回复 OK4。」（比基线多 1 个字符「4」），误差 ≤1 token，仅作方向参考；其首请求前已完成 6 次关闭，属「关闭后首请求」而非严格 A/B。

---

## 3. tokenMeter 原始读数（真实服务调用）

探针：`/stt-meter baseline`、`/stt-meter after-yunxiao`（命令走宿主命令通道，不产生模型轮次）。`measure()` 的 `totalTokens` = provider `usage.totalTokens`（`input + cacheRead + output`），`surfaceTokens` = 会话日志按启发式折算的表层 token。

| 读数 | `baseline.kind` | `totalTokens` | `surfaceTokens` | nodes | `usage` |
|---|---|---:|---:|---:|---|
| 关闭前（S1，173 工具，seq 25） | `usage`（供应商实数） | **49,945** | 4,629 | 7 | input 4,119 / output 2 / cacheRead 45,824 / cacheWrite 0 |
| 关闭 yunxiao 后（S1，103 工具，seq 43） | `usage` | **30,460** | 6,213 | 10 | input 8,825 / output 3 / cacheRead 21,632 / cacheWrite 0 |

**为什么两个总数不能直接相减当省量**：

- `surfaceTokens` 从 4,629 涨到 6,213（**+1,584**），构成为：`developer/message` 的 tool-removal 清单 **1,561** + user「只回复 OK2。」10 + assistant「OK2」13。其中 1,561 是宿主侧注册表增量消息，**未进入 provider 账单**（§2.2 已由差值反推验证）。
- 因此 `totalTokens` 的差值 19,485 只是「账单差额」，不能拆出「工具省了多少」；**工具省量必须以同长度首请求的 A/B 或真实 header 切片计算**。本表主口径取 A/B 的 19,497，并用同一会话连续两轮交叉验证（19,486 + 11 token 历史 = 19,497）。

### 3.1 与供应商实数的偏差（诚实标注）

- 启发式（每 4 字符 1 token）对 70 个工具 schema 估 **16,432**，provider 实际 **19,497**：provider 高 **18.7%**。与 `dsh-token-meter/README.zh.md` 的已知限制一致：「CJK 文本与 JSON schema 在每 token 四字符下严重低估」。
- 因此本表所有「token」若标注为启发式，仅适合与首轮等价计算做同口径对照；**决策请采用 provider 实数行（19,497 / 39.0%）**。

---

## 4. 两种口径对照（首轮 vs 复测轮）

| 口径 | 关闭 yunxiao 省量 | 比例 | 说明 |
|---|---:|---:|---|
| 首轮等价计算（真实 header 切片 + tokenMeter 公式） | 16,432 | −40.0%（工具+系统启发式） | 首轮 D1 阻塞，无法得到关闭后的真实请求 |
| **复测轮 A/B 首请求（真实 provider）** | **19,497** | **−39.0%（prompt）** | 主口径；同 system、同提示词、无历史 |
| 复测轮同一会话两轮（真实 provider） | 19,486 | −39.0% | 与 A/B 差 11 token（多两条历史） |
| 复测轮真实 header（tokenMeter 公式） | 16,432 | −41.5%（工具 token） | 与首轮等价计算**逐 token 一致**（同一 schema 字节） |

> 亮点：首轮「等价计算」的 16,432 在本轮被真实请求头**逐字节复现**（92,482 字符 / 23,125 toolsTokens），说明首轮的方法本身没错；本轮补上了它缺的那块——**真实 provider 账单口径**。

---

## 5. 结论

1. **真实省量**：关闭 `mcp:yunxiao`（70 个工具）后，同一提示词的首请求 prompt 从 **49,943 → 30,446**，**每请求省 19,497 token（−39.0%）**；同一会话连续两轮给出 19,486（差 11 token 为新增历史），两路互证。
2. **系统提示省量为 0**：yunxiao 无 instructions；只有 codebase-memory（305 字）与 dbx（89 字）两段，全部关闭也只省 394 字符（≈99 token）。
3. **工具面是主战场**：yunxiao 占 70/173 个工具、41.5% 的 tools token；全部 MCP+working_directory 关闭时，prompt 从 49,943 → 12,517（−74.9%，补充数据点）。
4. **口径提醒**：tokenMeter 的 `totalTokens` 是账单总数，跨轮会受历史与「tool-removal 增量消息」污染；省量表请以同长度首请求 A/B（provider）或真实 header 切片（公式）为准，本表两者都已给出。

---

## 6. 复现命令（可逐项重算）

```bash
# 1) 取真实 header / system / usage（会话日志 v4 分帧 zstd）
docker exec dsh node /tmp/stt-read-session.cjs \
  "/tmp/stt-112-home/sessions/--home-xuqinqin-develop-person-dsh-plugins--/<sid>/session.v4.jsonl.zstd" \
  > /tmp/events.jsonl
docker exec dsh node /tmp/stt-112r-analyze.cjs /tmp/events.jsonl

# 2) A/B 首请求：S_A 直接提示；S_B 先关 yunxiao 再提示（同一句「只回复 OK。」）
docker exec dsh node /tmp/stt-112r-api2.cjs create /home/xuqinqin/develop/person/dsh-plugins
docker exec dsh node /tmp/stt-112r-api2.cjs prompt <S_A> "只回复 OK。"
docker exec dsh node /tmp/stt-112r-api2.cjs cmd <S_B> "/tools off mcp:yunxiao"
docker exec dsh node /tmp/stt-112r-api2.cjs prompt <S_B> "只回复 OK。"
# 然后从两个会话日志的 assistant/message.data.usage 读 input/cacheRead/output

# 3) tokenMeter 真实读数（需要探针插件与活会话）
docker exec dsh node /tmp/stt-112r-api2.cjs cmd <sid> "/stt-meter baseline"
docker exec dsh node /tmp/stt-112r-api2.cjs cmd <sid> "/tools off mcp:yunxiao"
docker exec dsh node /tmp/stt-112r-api2.cjs cmd <sid> "/stt-meter after-yunxiao"

# 4) 公式重算（对真实 header 切片）
docker exec dsh node -e '
const fs=require("fs");
const lines=fs.readFileSync("/tmp/events.jsonl","utf8").trim().split("\n").map(JSON.parse);
const header=lines.filter(e=>e.type==="request/header").at(-1).data.header;
const tokens=(tools)=>Math.ceil(JSON.stringify(tools).length/4)+4;
const all=header.tools, noYun=all.filter(t=>!t.name.startsWith("mcp__yunxiao__"));
console.log({count:all.length,chars:JSON.stringify(all).length,toolsTokens:tokens(all)});
console.log({count:noYun.length,chars:JSON.stringify(noYun).length,toolsTokens:tokens(noYun)});
'
```

原始数据文件（复测轮遗留于容器 `/tmp`）：`/tmp/stt-112r-sA-events.jsonl`、`/tmp/stt-112r-sB-events.jsonl`、`/tmp/stt-112r-s1-events-2.jsonl`、`/tmp/stt-112r-s1-events-3.jsonl`、`/tmp/stt-112r-s9a-events.jsonl`、`/tmp/stt-meter-s1-baseline.json`、`/tmp/stt-meter-s1-after-yunxiao.json`、`/tmp/stt-112r-token-analysis.json`；首轮遗留：`/tmp/stt-112-events-baseline.jsonl`、`/tmp/stt-token-analysis.json` 等。

---

## 7. 数据文件清单（本轮）

| 文件 | 内容 |
|---|---|
| `/tmp/stt-112r-sA-events.jsonl` | S_A（173 工具首请求）header/system/usage |
| `/tmp/stt-112r-sB-events.jsonl` | S_B（103 工具首请求）header/system/usage |
| `/tmp/stt-112r-s1-events-2.jsonl` | S1 两轮（173→103）header/usage/state |
| `/tmp/stt-112r-s1-events-3.jsonl` | S1 第三轮（86 工具，codebase-memory 关） |
| `/tmp/stt-112r-s9a-events.jsonl` | 全关（33 工具）首请求 |
| `/tmp/stt-meter-s1-baseline.json` | tokenMeter 关闭前读数 |
| `/tmp/stt-meter-s1-after-yunxiao.json` | tokenMeter 关闭后读数 |
| `/tmp/stt-112r-token-analysis.json` | 逐服务器/系统段精确计算汇总 |
