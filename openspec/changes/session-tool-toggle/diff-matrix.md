# session-tool-toggle 收敛矩阵（阶段 1.5 留痕）

> 输入：line-a.md（A 线：需求与价值、范围与边界）+ line-b.md（B 线：实现与约束、反例与风险），均 team 成员 fresh 产出。
> 本文为落档输入之一，随 code-design.md 复制入变更目录后以落档副本为权威。

## 一、三分类矩阵

### 1. 共识（两线一致，直接采信）

| # | 结论 |
| --- | --- |
| C1 | 机制底座：`ctx.tools.restrict({deny})` 掩码 + dispatch guard 双层强制；deny 名单只从活注册表推导（restrict 遇未注册名抛错）；`tools/change` 触发幂等重算 + diff 守卫防自激——照抄 project-mcp isolation.ts 工程先例 |
| C2 | MCP 指令段遮蔽：`mcp:<server>` 段用 agent 作用域同名空 section 遮蔽（restrict 摘不掉指令段） |
| C3 | skill v1 整档开关：restrict `skill` 工具即连带目录消息停发（tool-skill 既有语义：追加空目录停用旧名） |
| C4 | v1 交互 = 斜杠命令（commands 服务，零 token 通道）；Web UI 面板二期（web-ux RPC 先例） |
| C5 | 交付 = 本仓新独立插件 `session-tool-toggle`（bundle，纯宿主面无 dsh.client，web/headless/acp 皆可装） |
| C6 | 子代理/teammate v1 不继承不传播，README 明示；`agent/created` 每 agent 独立挂载 |
| C7 | 不做全局/进程级服务器管理（plugin_manager 已有），接受「省 token 不省进程」 |
| C8 | 与 project-mcp 正交组合（restrict 掩码取交集），不开回被工作区隔离的工具 |
| C9 | 工程惯例：vitest/oxlint/build.mjs、engines 派生基线 `>=0.2.1-rc.2 <0.3.0`、`pnpm dsh:check`/release 流程 |
| C10 | 验证含 tokenMeter 前后对照量化；未知名容忍（服务器不在注册表时记日志跳过不抛错） |

### 2. 分歧（两线都有但结论不同）

| # | 分歧 | 裁定 |
| --- | --- | --- |
| D1 | 持久化路线：A 首选「会话日志 + 投影」（R4 自认未验证）vs B 断言日志越权、推荐 sidecar 文件 | **自行查证裁定（第 2 步）**：主路线采 A「`appendPluginRecord` 写 `plugin:*` 记录 + 自有投影 fold」。依据：① `PluginRecordMap` 官方文档「Packages augment this map to type writes」——模块扩充即入通道，不动 released persistence schemas（B 的「要动格式目录、越权」不成立）；② record「never enters the model-visible surface, fork and resume carry it with the rest of the log」——零模型成本、fork/resume 免费携带；③ `pluginRecordOf(event: SessionEvent)` 证明 record 以事件流经投影 `apply`（drive 订阅 `session/event`）；④ capability seam 设计明说「Domain host plugins contribute pure folds」。fork 语义随之解决：继承前缀 fold = 一次性拷贝语义（B 的 A7 假设与 A 的 H3 同时满足）。**B 的次要顾虑保留为约束**：`appendPluginRecord` 文档限定「Only production source under `packages/experimental/`」为 DSH 仓内 gate（约束不了外部仓但表明官方保留态度）→ T-spike 运行时实测兜底；record 持久性 best-effort → 开关状态可丢不失血（丢 = 回默认态），符合「owner can lose」契约。**sidecar 降为降级备选**（spike 失败时启用，届时需要 `/tools-gc` 等配套） |
| D2 | v1 MCP 单工具粒度：A 列入 v1（G2 名/前缀通配）vs B 排除（组地址稳定论） | **产品取舍，不派复算**（双向论证已充分：A 覆盖面论 vs B 复杂度论，非事实争议）→ **用户拍板：v1 即支持单工具/通配**（第一轮 Q2 答 b）。B 的工程约束带进设计：单工具名单随服务器热更新漂移 → deny 推导必须每 `tools/change` 重算；整组关时指令段一并遮蔽、仅关单工具时指令段保留（语义自然） |
| D3 | 内置工具开关：A 排除出 v1（自锁风险 N5）vs B 纳入 v1（G2） | **产品取舍 → 用户拍板：v1 允许关内置工具 + 硬保护名单拒关自救基础**（第一轮 Q3 答 b）。B 的例证有误已纠正（`lighthouse_audit` 实为 MCP 工具）；真实痛点 = DSH 内置 `task_board_*`/`notes_*`/`schedule_*`/`team_task_*`/`workflow` 系列大 schema（审视发现 3）。保护名单初版：bash/read/edit/write/glob/grep（具体集合 design 定，硬编码拒关） |

**不派第三线复算的理由**（第 3 步留痕）：D1 为可查证事实分歧（已第 2 步查证消解）；D2/D3 为纯产品取舍类分歧、两线论证已双向充分、用户一句话可定，复算边际价值低于成本——直接归入 grill-me 决策项。本流程复算数 = 0（未超 3 上限）。

### 3. 单边遗漏（只在一条线出现，逐项核验）

| # | 项 | 来源 | 核验结论 |
| --- | --- | --- | --- |
| S1 | 与 project-mcp 交集语义验证用例（关/开不越界，被隔离工具开不回） | A | **成立**，纳入落档验证思路 |
| S2 | per-workspace 默认档（`.dsh/` 声明，方案 γ） | A | **成立但降级**：Q1 用户拍板选用户级默认档；工作区级列 v2 候选 |
| S3 | 条目级 per-skill 遮蔽（同名 shadow + `modelInvocable:false`） | A | **采 B 结论**：B 已从源码确认机制存在（最近层同名胜出）但 v1 不做（skill 整档已覆盖）；A 的 T2.3 spike 取消，v2 启动时再验 |
| S4 | 上游化路线（给 DSH 提 feature）README 记一笔 | A | 成立，落档提案长期路线段记一笔 |
| S5 | KV 缓存一次性失效提示写进命令回执（B R4） | B | **成立**，纳入落档（F1 README 语义为证）；补对称性：「重新开启」同样触发重建（审视发现 2） |
| S6 | sidecar 垃圾回收 `/tools-gc` | B | **条件成立**：仅 D1 降级路线（sidecar）需要；主路线（plugin record + 投影）无此问题——record 随会话日志生命周期 |
| S7 | 多 profile 隔离语义（状态随 $DSH_HOME，跨 profile 不同步可接受） | B | 成立，写入假设清单 |
| S8 | 重算风暴压测（≥5 agent × ≥5 服务器） | B | 成立，纳入落档验证思路 |
| S9 | inspect/读方两态区分（「全局层有、该会话看不见」vs「真没注册」）进 `/tools` 输出 | B | 成立，纳入落档命令面设计要点 |
| S10 | 冒烟用隔离实例（独立 DSH_HOME + 独立端口 + 探针 MCP 服务器，project-mcp 先例） | B | 成立，纳入落档验证思路 |
| S11 | 竞态窗口对策：命令在轮边界应用（`agent.whenIdle()`，已核验存在于 runtime-types.d.ts:164） | B | 成立，纳入设计要点 |
| S12 | 历史含不可调工具 = 产品语义明示不做历史改写（B R5） | B | 成立，README 预期管理段 |
| S13 | skill 翻转的目录替换固定成本提示（B U3） | B | 成立，文档提示 |
| S14 | restrict 不过滤自有层（保护 subagent 结构化输出通道，设计而非 bug） | B | 成立，写入设计记录（影响子代理语义说明） |
| S15 | 估时参考：T0–T6 合计约 6.5 人日（B） | B | 成立，落档 tasks 参考（Q1/Q2/Q3 拍板后有增量） |

## 二、探索审视（第 4 步，openspec-explore 姿态）

**降级为事实裁定的待决项**：
- `ctx.tokenMeter` 服务存在（dsh-token-meter/lib/types/index.d.ts:16）→ A 线度量验收成立。
- `agent.whenIdle()` 存在（dsh-agent/lib/types/runtime-types.d.ts:164）→ B 线轮边界应用对策成立。

**新发现（双边盲区）**：
1. **默认全开的隐性 KV 代价**：默认全开 ⇒ 首个开关动作必在会话中途 ⇒ 每个新会话付一次 KV 前缀缓存重建。默认档是「免中途 KV 重建 + 免每会话手动关」的机制——并入 Q1 决策项说明（用户据此选了 b 用户级默认档）。
2. **开/关 KV 代价对称**：重新开启同样触发缓存重建；命令回执提示须对称覆盖（落档补充，B 线只写了关侧）。
3. **B 线内置工具例证纠错**：`lighthouse_audit` 是 MCP 工具（chrome-devtools）非内置；但 DSH 内置 task_board/notes/schedule/team_task/workflow 系列确为大 schema 真实痛点——「内置可关」诉求成立，自锁风险由硬保护名单解决（并入 Q3，用户拍板 b）。

## 三、设计树与前沿分轮问答（第 5 步，grill-me）

### 设计树终态

```
[根] session-tool-toggle v1
├── 定·共识 C1–C10（机制/交付/交互/边界）
├── 定·裁定 D1（持久化 = plugin record + 投影 fold；sidecar 降级备选 + spike 兜底）
├── 定·用户 Q1+Q4+Q5：v1 即带用户级默认档（$DSH_HOME 文件、命令可写、会话创建时快照、不追溯老会话）
├── 定·用户 Q2：v1 即支持 MCP 单工具/前缀通配（整组关才遮指令段；单工具关保留指令段）
├── 定·用户 Q3：v1 允许关内置工具 + 硬保护名单（bash/read/edit/write/glob/grep 拒关，集合 design 定）
└── 定·共识衍生：子代理不传播（含 S14 自有层豁免说明）/ skill 整档 / UI 二期 / 不停进程
```

### 第一轮（前沿 3 问，2026-10-30）

| 问 | 选项 | 用户答复 |
| --- | --- | --- |
| Q1 新会话默认态 | a 全开 / **b 用户级默认档** / c 工作区级 | **b**（附注：免中途 KV 重建 + 一次配置全局受益；工作量 +约 1 人日） |
| Q2 MCP 单工具粒度 | a 不做 / **b v1 支持（名/前缀通配）** | **b**（未采推荐 a；B 线工程约束带进设计：`tools/change` 重算、指令段保留语义） |
| Q3 内置工具开关 | a v1 不含 / **b 可关 + 硬保护名单** | **b** |

### 第二轮（前沿 2 问，Q1-b 解锁的下游）

| 问 | 选项 | 用户答复 |
| --- | --- | --- |
| Q4 默认档读写方式 | a 纯手编 / **b 命令可写（文件仍为持久真相可手编）** | **b** |
| Q5 默认档生效语义 | **a 创建时快照（改默认档只影响新会话，不追溯 resume）** / b 活引用 | **a** |

### 收敛结束判定

前沿为空：设计树每条分支走到（共识 10 项 + 裁定 1 项 + 用户拍板 5 项 + 单边核验 15 项），无静默假设项。

## 四、收敛结论（阶段 2 落档输入）

1. **插件**：`dsh-plugin-session-tool-toggle`，纯宿主 bundle，v1 斜杠命令交互（Web UI 二期）。
2. **开关对象**（组地址）：`mcp:<server>`（整组：工具 schema + 指令段一并）、`mcp:<server>::<tool>` 单工具/前缀通配（仅 schema，指令段保留）、`tool:<name>` 内置工具（硬保护名单拒关）、`skill`（整档）。
3. **持久化**：`appendPluginRecord`（`plugin:session-tool-toggle` 记录，每次变更写全量状态——whole-value event rule）+ host-only 投影 fold 恢复；fork/resume 免费语义；spike 兜底，失败降级 sidecar。
4. **默认档**：`$DSH_HOME` 下用户级文件，命令可写（`/tools-default` 类），会话创建时快照生效，不追溯。
5. **命令面**：`/tools`（查当前 + 默认 + 两态区分）、会话级开关、默认档读写；回执含 KV 缓存重建提示（对称）。
6. **v2 候选池**：per-skill 开关、子代理继承、Web 面板、工作区级默认档、上游化。

---

## 扩展轮收敛记录（2026-10-30 · Web 配置面板）

- **需求输入**：用户「我还想要一个配置界面，入口就放到会话的...的菜单项中」。
- **Lead 侦察事实**（落档前已核实）：两处现成注入口——侧栏会话行 `sidebar.workspaces.session.menu.item`（list，官方 pin/rename/fork/archive 占 order 100–400，web-ux 先例 order 500）与会话主视图头部 `conversation.session.header.utilities`（list、scope session、owner 无专属值，官方 schedule/open-in-app 在此注入）；web-ux 双端工程先例全套（exports 双入口 / ModuleLoader 壳 / css modules 内联 / bare-name 锚行）；Connection RPC 通道形态（宿主 `connection.rpc.handle` + client `connection.rpc.call`，`ctx.root` 读取坑位）。
- **用户拍板（四问四答）**：① 入口 = 会话主视图头部工具区（utilities 插槽，非侧栏菜单）；② 归属 = 扩入现有变更（修订四件套，不新开变更）；③ 面板能力 = 完整管理面板（工具清单分组 + 会话级开关 + 默认档编辑 + 关闭集展示）；④ 配置键编辑 = 不包含。
- **编排拍板**：轻量增量（Lead 定增量要点 + 单设计线 subagent 深化 + Lead 落档修订），不重走并行双线 team——理由：需求已由四项拍板收敛、底座已有 685 行 code-design、增量集中在三块（Web 组件 / RPC 通道 / 双端工程）。
- **设计线**：fresh subagent（deepseek-official/deepseek-flash 路由，同阶段 1.7 既定 design 路由），产物 `/tmp/spec-flow/session-tool-toggle/web-panel-design.md`（736 行，7 章 + 附录 A 修订索引；所有 DSH 断言带 file:line，未核实项标注「待实现期实测」）→ 全文并入 `code-design.md` 附录。
- **关键新结论**：架构支点 `src/host/control.ts` 单一控制内核（commands.ts 降为文本前端，面板 RPC 与命令共用同一 StateStore/SessionLayer，无第二份状态）；通道 `/session-tool-toggle` 4 端点；入口 order 20；面板组件内自渲染 Modal（不借 shell.overlay）；host-only 投影不加 wire（拉取 + 四类刷新触发）；线上契约手写 parser（zod 草案仅形状权威）；批量开关全有或全无；决策 D12–D20、风险 R1–R8、未决 U1–U8。
- **Lead 裁定（对设计线建议的一处裁剪）**：spec 增量落档**不设** `## MODIFIED Requirements` 段——`dsh-session-tool-toggle` 是本 change 新增 capability（delta 全为 ADDED、尚未部署），直接修改 ADDED 段内对应 Requirement 文本即可；MODIFIED 段语法适用于已部署 capability 的修订。其余设计线建议全部采纳。
- **落档动作**：proposal（What/Impact/Capabilities 双端化）、spec（Purpose 补句 + 3 个既有 Requirement 补句 + 新增「Web 配置界面」Requirement 含 6 Scenario）、design（D12–D20 + 触达面更新 + R1–R8 + Migration 重启说明 + U1–U8）、tasks（新组 9「共享控制内核与 Web RPC 通道」5 任务 + 新组 10「client 半」5 任务，原 9/10 顺延为 11/12 含 11.3 截图证据，1.1/8.1/follow-up 修订）、code-design 附录并入、本记录。
- **分歧复算**：0 条（设计线与既有规划无冲突；唯一裁量点即上述 MODIFIED 段处理）。
