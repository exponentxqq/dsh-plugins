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

---

## 执行期留痕（R 条目 · 2026-10-30 起）

> 执行中新证实的运行规则与实测事实；后续组与接续恢复以本条为准，推翻前条目时标注「被 R<n'> 推翻」并同步其连锁面。

- **R1（环境事实 · engine WARN）**：本环境 node `v22.18.0` 低于各包 `engines.node` 要求 `^22.19.0`，`pnpm install` 对全部 workspace 项目报 `Unsupported engine` WARN——**仓库既有现象**（既有包同报），非本变更引入，不作为失败判据；静态门禁核对只看退出码与任务真实执行。
- **R2（验收口径 · 骨架期 test 红）**：组 1 完成时 `pnpm --filter dsh-plugin-session-tool-toggle test` 为 exit 1「No test files found」属**预期过渡态**——`test/` 自任务 2.1 起建立；**不加** `--passWithNoTests`（避免掩盖空套件）；组 11.1 要求根递归 `pnpm test` 全绿，届时以真实套件为准。
- **R3（工程惯例 · 图标与发布面）**：`package.json#files` 沿用先例 `["lib/**/*.js","src","cordis.patch.yml","icon.svg"]`；三个先例均有 `icon.svg` + `package.json#icon: "icon.svg"`，本包已按仓库惯例补齐（开关语义图标，主会话补，`npm pack --dry-run` 11 文件含 icon.svg）。**连锁面**：无（纯发布面）。
- **R4（依赖事实 · devDeps 集合）**：devDeps 27 项 = 附录 §1.2「增量 14 项」+ 宿主半基线 7 个 DSH 包（agent / atomic-write / commands / home-paths / session / session-projection / tools，为 3.x–7.x 的类型来源）+ cordis 4.0.5 + 工具链 5 项；全部精确 pin，`pnpm dsh:check` 通过，`pnpm-lock.yaml` 仅新增本包 importer 块（+91 行、无版本漂移）。**连锁面**：后续组新增依赖须保持精确 pin 并复跑 `pnpm dsh:check`。
- **R5（工件不一致 · 配置键名）**：`design.md`「触达面与接口形状」写「配置键 `persistence` / `protectedTools` / `defaultsPath?` / `maxRetries?`」，而 `code-design.md` §3.8 与 `plugins/session-tool-toggle/src/host/types.ts` 的权威形状为 `storage?: 'auto'|'memory'` / `protectedTools?` / `defaultsFile?` / `hostModuleBase?`（**无 maxRetries**）。**裁定：以 code-design §3.8 + types.ts 为准**（实现期唯一权威），`design.md` 该句在组 12 文档收尾时回填修正。**连锁面**：`src/host/types.ts`（已一致）、`design.md`（组 12 回填）。
- **R6（接口展开 · types.ts 扩展端口）**：`src/host/types.ts` 的 `ControlDeps` / `PanelInputs` / `LayerHandle` 字段由设计散文 + 附录 §2.2/§2.5 展开（设计未给字面接口代码）；`LayerHandle.visibleNames()` 是 `PanelInputs.scoped` 的唯一读面、`layer.snapshot().deny` 是 `carried` 来源。**连锁面**：任务 9.1/9.3 可在不改契约语义的前提下继续扩字段。
- **R7（落点裁定 · 保护基线常量）**：`PROTECTED_BASELINE`（7 项含 `pwsh`）**唯一定义在 `src/host/address.ts`**（解析期保护名单检查需要它；该文件零依赖、处最底层），`src/host/mask.ts`（任务 3.1）直接 `import` 使用，**不 re-export、不再定义第二份**。`code-design.md` §3.3 代码块把该常量画在 mask.ts 下、tasks.md 3.1 触达面也提它——以本条为准（仅实现落点，语义不变）。`ADDRESS_GRAMMAR` 常量由 address.ts 导出供命令面/面板错误文案复用（2.1 实测新增导出，纯增量）。**连锁面**：任务 3.1 提示（mask.ts import）、任务 7.1（文案复用 `ADDRESS_GRAMMAR`）、任务 9.2（同一文法串）。
- **R8（接口展开 · state.ts 的实现选择）**：① `STATE_RECORD_TYPE` 常量落 `state.ts`（`record-store.ts` 任务 5.1 复用），`SessionToolState` 类型唯一处是 `types.ts`、`state.ts` 只 re-export；② `withToggled` 保持设计三参数、**不**在函数内更新 `updatedAt`（纯函数不读时钟），时间戳由调用方写入前打（`{...next, updatedAt: Date.now()}`），否则「无变化同引用」与投影 `apply` 短路都失效；③ `normalizeState` 对「可解析但非规范形」条目做归一（`mcp:a::*`→`mcp:a`、`skill`→`tool:skill`）而非丢弃，仅不可解析/非字符串条目丢弃 + 按字段汇总 warn；④ `foldStatus` 只认 `type===STATE_RECORD_TYPE && ignorable===true` 的最后一条记录、**不回退**更早记录（回退会让已关开关在 resume 后复活）、空日志不告警；⑤ `parseDisabledTexts` 静默丢弃（无 log 参数），保护名单只在写入路径生效。**连锁面**：任务 5.1（record-store 复用 `STATE_RECORD_TYPE`）、任务 8.1（写入前打 `updatedAt`）、spec 的 resume Scenario。
- **R9（待办归位 · 2.2 回执四项）**：① `withSnapshot(state, snapshot)`（code-design §3.6 匿名出现）**归任务 6.1** 实现（默认档快照写入），6.1 派发提示须点名；② `recordOf(event)`（`pluginRecordOf` 等价子集）归 **5.1 record-store.ts**（与两处 `module augmentation` 同文件）；③ 保护名在 `normalizeState`/`foldStatus` 阶段放行属设计签名（无名单参数）——用户边界 `parseAddress` + 写入路径 `parseDisabledTexts` 双保险，读路径只面对本插件自己写过的状态，不额外加严；④ `STATE_RECORD_TYPE` 由 5.1 引用本常量而非内联字面量。**连锁面**：任务 5.1 / 6.1 提示与验收。
- **R10（裁定 · 3.1 两项）**：① `planMask`/`guardReason` 保持设计签名（不带生效保护名单），内部只按硬基线 `PROTECTED_BASELINE` 解析——`config.protectedTools` 追加名一旦出现在损坏/移植记录里会退化为普通开关（可接受：追加项非硬边界，且状态层 `parseDisabledTexts` 已用生效名单双保险）；② 两轮 deny 是否相同的比较（`sameDeny`）**由 `session-layer.ts` 内部实现**，不导出到 mask.ts（§3.3 未列该函数）。**连锁面**：任务 4.1（sameDeny 落 layer）。
- **R11（裁定 · 4.1 五项）**：① `snapshot()` 报**已生效**集合而非计划值（restrict 失败时 deny 为空是真相、guard 仍拦），面板/`/tools status` 要展示「意图」时从 `state.disabled` 取，**不改** snapshot 语义；② `visibleNames` 的生产适配器用 `schemas(agent)` 当 scope key（照抄 project-mcp 约定），**8.1/11.2 真机冒烟须确认一次**；③ `attach` 取不到工具面时只记 error+warn、**不 reject**（`agent/created` 是串行广播，一个会话的层装配失败不该让会话创建失败）；④ `ctx.inject` 回调重跑（依赖变化导致 fiber 重载）已做防御（先抬旧 disposer、`attach` 拒绝二次），**8.1/11.2 冒烟观察**；⑤ `tools/change` 风暴：本层保持同步幂等、退场由 `retreat` 短路、**不加 debounce**（8.1 若日志噪声明显再加）。**连锁面**：任务 8.1（装配用 `new SessionLayer({log, catalog})` 走默认 `agentSurface`，不写第二份适配器；冒烟项）、任务 7.1/9.x（意图展示从 `state.disabled` 取）。
- **R12（范围裁定 · storage-domain 通道不实现）**：tasks.md 5.1 原文含「与 `ctx.storageDomain` 自有域——配置键可切」，但 code-design **§3.2** 的 `StoreKind = 'record' | 'memory'`（只有两个实现）、**§3.8** 的 `Config.storage?: 'auto' | 'memory'`、**§5 T5** 的要点均未含第三通道。**裁定：v1 只实现 `RecordStateStore` + `MemoryStateStore`**（`storage: 'auto'` = 宿主模块可用则写记录，否则内存降级），storage-domain 通道降为 v2 候选（design.md D0 的「第二实现」表述在组 12 一并回填）。**连锁面**：任务 5.1 验收（不含 storage-domain）、`Config`（types.ts 已一致）、design.md D0（组 12 回填）。
- **R13（裁定 · 5.1 五项 + 降级形态）**：① 投影单元的 `stateSchema`（zod）**由 8.1 装配时提供**（`record-store.ts` 只导出纯 fold 单元 `createSessionToolToggleUnit(log)`），8.1 需把它与 zod schema 合成完整 `ProjectionDefinition` 再注册；② `Config.hostModuleBase` 直接映射 `HostRuntimeOptions.modulePath`（该实现已同时接受「模块文件」与「解析锚点目录」）；③ 真实 `sessionProjections.stateOf` 的 `Session` 类型由**装配层做一次窄适配器**（`{ stateOf: (s, k) => projections.stateOf(s as never, k) }`），不让 record-store import 宿主类型；④ 写失败降级为**进程级**（内存后备按 sessionId 分槽，`kind` getter 切 `memory`、warn 一次、降级后 `read` 优先内存后备）；⑤ 读判定顺序在设计的「投影→重放→空态+warn」**前增**「内存降级后备优先」（否则降级后读回日志旧值、开关会复活）；⑥ 政策风险（官方 README 明写仓外不得调用 `appendPluginRecord`）维持 design Risks 项：降级路径兜底 + 12.1 README 明示实验性通道 + 11.2 真机 spike 验证。**连锁面**：任务 8.1（投影注册 + `stateSchema` + 适配器）、任务 12.1（README 实验性通道声明）、任务 11.2（真机 spike）。
- **R14（裁定 · 6.1 四项 + 生产端口）**：① `createNodeDefaultsIo()`（`node:fs` 读 + `writeFileAtomic` 写，`mode:0o600` / `dirMode:0o700`）**留在 `defaults.ts`** 并由 8.1 一行注入（`defaultsIo: createNodeDefaultsIo()`），逻辑函数只依赖 `DefaultsIo` 端口；② 默认档**缺失也 warn**（按 §3.6 原文；用户从未建默认档时每次新会话一条 warn，可接受）；③ `seeded` 置位属装配层播种写入点（8.1 写 `{...withSnapshot(...), seeded:true, updatedAt: Date.now()}`），`withSnapshot` 不改 `seeded`；④ 默认档读入只拦硬基线 `PROTECTED_BASELINE`、**不拦** `config.protectedTools` 追加名单（与 R10 同口径：追加项非硬边界）；⑤ `dsh-atomic-write` 实际签名 `writeFileAtomic(filename, content, {mode, dirMode?})`。**连锁面**：任务 8.1（注入 `createNodeDefaultsIo`、播种写入三段式）、任务 9.1（write 失败映射 `defaults-unwritable`）。
- **R15（裁定 · 7.1 端口缺口与四语义）**：① **`catalog` 端口缺口**：`ControlDeps`（types.ts）不含「全局层未掩码注册名」，而 status/面板需要它 → 7.1 定义 `ToolsCommandDeps extends ControlDeps { catalog: () => readonly string[] }`；**8.1 构造时传 `catalog: () => ctx.tools.schemas().map(s=>s.name)`**，**9.1 把 `catalog` 并入 `ControlDeps`**（或让 `readPanel` 收 `PanelInputs`），否则 `control.ts` 抽不走 `readPanel`；② 缓存重建判据拆两字段：`changed`（关闭集变→写状态）与 `schemaChanged`（**已生效 deny 集合**变→报缓存重建），`/tools off mcp:zzz` 记录意图但报「前缀缓存不重建」（比状态一变就报诚实），开/关真实变化的文案逐字对称；③ `reset` 的「已重置 N 项」= 当前关闭集与快照的**对称差**，9.1 面板文案须同源；④ 「被其他作用域隐藏」= `catalog \ scoped`（命令面没有「谁掩的」端口），S1 的 figma 交集语义靠 11.2 真机冒烟确认。**连锁面**：任务 8.1（catalog 传参）、任务 9.1（ControlDeps 并入 catalog、reset 文案同源）、任务 11.2（隐藏语义冒烟）。
- **R16（8.1 裁定 · 两处正确性修正 + 验收口径）**：① **推翻 R14 ③ 的播种表达式**：`withSnapshot` 只写 `snapshot`，若按 R14 字面 `{...withSnapshot(state, defaults.disabled), seeded:true}` 则新会话 `disabled` 为空 → 默认档完全不生效，违反 spec「新会话创建时 SHALL 对默认档拍快照**作为初始关闭集**」；**正确播种为 `{...withSnapshot(state, snapshot), disabled: withDefaults.snapshot, seeded: true, updatedAt: Date.now()}`**（创建时 `disabled === snapshot`，此后仅 `/tools off|on` 分叉，reset 语义不变）。② **`src/index.ts` 必须转发 `Config`**：dsh loader 只从**包入口**读 `plugin.Config`，不转发则 schemastery schema 成死代码（`--dump-config-schema` 显示 `absent`）——该项超出 8.1 原写范围，Lead 确认保留。③ **验收口径调整**：`docker exec dsh dsh --profile web --dump-config-schema` 在本环境**既有 exit 1**（4 条 `/186–/189` `unrecognized Loader tree carrier`；全新空 `DSH_HOME` 同样红，非本插件引入）→ 本变更验收改为「隔离 profile 的 `--dump-config` exit 0 且含 `session-tool-toggle` 注册行」+「本插件 `--dump-config-schema` 条目 `status:"schema"` 且 0 条自身诊断」，**不**追求全局 exit 0，也不在本变更内修 profile 的重复 `cordis-plugin-group`。④ 插件中途装入时，已存在且 `seeded===false` 的会话会在首次 attach 按当时默认档播种一次（符合 design A3「只看 seeded」）——接受，不按 `header.createdAt` 另判。⑤ `Config` 必须保持原生 Schemastery（换成 zod/标准 schema 会让 `--dump-config-schema` 变红）→ 写入 12.1 README 预期管理。⑥ oxlint 对 `lib/index.js`（内联 schemastery）报 117 warnings / 0 errors——接受（构建产物，`verify:all` exit 0；不加 `lib/` ignore）。**连锁面**：任务 9.5/11.1/11.2（验收口径）、任务 12.1（README 三句）。
- **R17（裁定 · 9.1/9.2 待决项 + 9.5 前置）**：**9.1** ① `index.ts` 微调（`ControlDeps` 字面量补必填 `catalog`、`commandDeps = controlDeps`、注释同步）**确认接受**（R15 必填端口的必要代价，零行为变化）；② `updateDefaults` 写盘失败改「记 log.error 后原样抛错」、命令面捕获逐字复现回执——**接受**（对齐 R14 连锁面「write 失败映射 defaults-unwritable」）；③ `TOOLS_GRAMMAR`/`DefaultsMode`/report 类型迁 `control.ts`、命令面 re-export——**接受**（避免 control↔commands 循环）；④ 第四用例名沿用 `updateDefaults`——**接受**（`writeDefaults` 已被 defaults.ts 原子写占用）；⑤ tasks.md 9.1 结构性断言**修正**为 `grep -v -e "control.ts" -e "index.ts"`（原句任何合规实现都输出 2：`index.ts:218` store 转发 + `:311` 播种写入，按 R16① 属装配层）；⑥ `types.ts` 的「命令面拿不到 StateStore」表述不成立——**暂不修**（不影响功能，写范围外）。**9.2** ① 响应 parser **保留 strict**（任务要求「缺字段/多余字段拒绝」，是刻意的版本漂移报警）；② 契约 1224 行 ≫ 设计估算 220–260 行——**接受**（手写逐字段校验 + 中文文案 + JSDoc；可审计性优先于行数预算，规模偏差回填 code-design 附录 §1.1 估算）；③ 不补 `parseFailureDetails` 构造器、不补 `REQUEST_PARSERS` 精确签名（9.4 switch 即可）；④ 类型命名 `StatsView`/`NoticeView` 保持（交叉可赋值测试已锁住与 9.3 `Stats`/`Notice` 的形状一致性）；⑤ **9.4/10.2 注意**：`Parsed<T>` 失败字段是 `message`（不是 `issue`），请求 parser 用 `REQUEST_PARSERS` 表。**9.5 前置裁定**（回应 9.1 待决 2）：失败码结构化输入**由 rpc.ts 自行预检**——调用内核前用 `address.ts` 的 `parseAddress` 逐条解析地址，`ParseErrorCode` 映射 `bad-address`/`protected`/`reserved`，全部通过后再调内核（内核内部再校验一次，幂等）；`defaults-unwritable` 的 `{path, reason}` 由 rpc.ts 从 `deps.defaultsPath` + 捕获的 error 组装。**不改 control.ts 的 ControlOutcome**。
- **R18（裁定 · 9.3 待决项 + shadowed 语义修正）**：① **推翻 R15 ④ 的 `shadowed` 口径**：`catalog \ scoped` 会让「本插件自己关掉且掩码已生效」的工具同时 `disabled`+`shadowed`，而 §3.3 规定 shadowed 行 Switch 禁用 → 用户在分组清单里无法打开自己关掉的工具；**修正为 `catalog \ (scoped ∪ carried)`**（`carried = layer.snapshot().deny` 即本插件已生效掩码），面板与命令面 `readPanel` **统一**此口径（改 `panel.ts` + `control.ts` 的 readPanel + 两侧测试断言）。② 关闭集 chip **不加** per-address `matched` 计数（契约 strict；两态用 `intentOnly` 二值 + `stats.denied` 表达），v2 如需再扩 `StateView`。③ §2.5 的「分组计数自检 warn」**不在本变更落地**（`PanelInputs` 无 log 端口、纯函数不引 IO）。④ `DESCRIPTION_MAX_LENGTH=160` 在 panel.ts 与 contract.ts 各一份——**接受双份**（数值相同，不加断言）。⑤ `defaults.disabled` 原样透传、`stats.visible` 按唯一名计数——**接受**。**连锁面**：`panel.ts`（计算 + 用例）、`control.ts` 的 `readPanel`（口径）、`commands.test.ts`/`panel.test.ts`（数字断言）、组 10 面板 UI（shadowed 行禁用逻辑依赖新口径）。
- **R19（裁定 · 9.4 四项）**：① `DefaultsValue.changed` = **写进文件的整份关闭集**（与 `defaults.disabled` 同源，client 用它覆盖条目列表；增量语义会把列表删空）——**接受**；② `types.ts` 的 `SessionLike.header` **补 `origin?: 'subagent'`**（去掉 rpc.ts 的 `as unknown as`），随 R18 修正一起做；③ 默认档缺失时每次 panel/toggle/reset 的 warn **接受**（R14 ② 口径；11.2 若嫌吵再议）；④ `RpcDeps.kernel?` 测试接缝**保留**（生产不传即真实内核）。另：**9.5 挂载时须接** `descriptions: () => new Map(ctx.tools.schemas().map(s => [s.name, s.description ?? '']))`（面板描述来源；不接则面板无描述）。**连锁面**：9.5（descriptions 接入）、R18 修正（origin）、10.2（changed 语义）。
- **R20（裁定 · 9.5 四项 + 冒烟口径）**：① **`catalog`/`descriptions` 读数面保持「全局层」口径**（R15①）：`ctx.tools.schemas()` 无 scope 只含全局层名字——主 profile（MCP 全局注册，214 工具）正常；若某 profile 把内置/skill 都注册在 agent 作用域，面板的 `stats.catalog`/`shadowed`/描述会偏小（**接受**，11.2 冒烟按主 profile 口径说明；v2 再改 per-agent 读数）；② 组 10 面板**必须在描述缺失时不渲染描述**（不得报错或占位错乱）；③ `connection` 解析为空分支真机不可构造（cordis provide 后非 undefined）——/tmp 装配自检已覆盖，**不**新增 `test/index.test.ts`（v2 再补）；④ 23:54–23:56 对 `test/rpc.test.ts`/`test/panel.test.ts` 的改动是 R18 修正子代理所为（预期，非 9.4/9.5 越界）。另：**9.5 实测修正了设计 §5.5 的 gateway 命令口径**——`/api/session/create` 需 `client-request` 信封且 `method==endpoint`、payload 为 `{args:{request:{cwd}}}`；自定义通道端点 `payload` 直传（不再包 `args`）。11.2/11.3 冒烟按此口径。**连锁面**：组 10（描述缺失降级）、11.2（冒烟口径）。
- **R21（tsconfig 工程划分修复 + 10.1/10.2 前置）**：1.1 建 tsconfig 时留下缺口——`tsconfig.host.json` 用 glob `test/**/*.test.ts` 把 client 侧 `.test.ts` 扫进 host project（composite → **TS6307**），而 `tsconfig.client.json` 只含 `test/**/*.test.tsx`。**Lead 直接修复**（照 `plugins/web-ux/tsconfig.*.json` 先例）：host include 改**显式清单**（当前 11 个 host 测试）、client include 显式加 `test/locale-parity.test.ts` + `test/panel-client.test.ts`；后续组 10 批次各自向 client include 追加新 client 测试（`.tsx` 由 glob 覆盖；10.5 的 `client-index.test.ts` 与 host 侧 `bundle.test.ts` 需各自加清单）。修复后 `typecheck` 0、13 套件 564 tests 全绿。另：10.2 的 `updateDefaults` 签名按契约走 `(action, addresses?)`（**无 sessionId**，`DefaultsRequest` strict 字段集无该字段）——10.4 必须按此调用。**连锁面**：10.3/10.5（tsconfig 追加）、10.4（updateDefaults 调用形状）。
- **R22（裁定 · 10.3 四项 + 10.4 前置）**：① utilities 座位的端口投递方式（`resolveClient` / `subscribeCommandExecuted` / focus 注入）**由 10.5 决策**（registration-level `inject` 面 / 模块级端口 / context wrapper 三选一，以 DSH slots 类型实际能力为准）；② `reset()` 的 UI 入口在 10.4 暴露时**允许在 `locales.ts` 新增键**（如 `reset.label`），locale-parity 自动锁键集合；③ `refresh()` 在 `loading` 中跳过重叠触发——**接受**（四触发收敛，R1）；④ 跨窗口不广播 `command/executed`（`@mode emit` 仅本窗口本地提交）——**接受**（设计 U3/R1）。10.4 必须遵守 10.3 的行为口径：`failed` 可与 `snapshot` 并存（有快照渲染旧内容 + 错误行，无快照才走不可用降级且不渲染 Switch）；`DefaultsEditor` 读 `state.defaults`（不是 `snapshot.defaults`）；`useMemo` 按 `sessionId` 建 controller、`useEffect` 清理 `dispose()`；`getSnapshot`/`subscribe` 是绑定箭头字段可直接喂 `useSyncExternalStore`。**连锁面**：10.4（组件调用面）、10.5（端口投递决策）。
- **R23（裁定 · 10.4 四项）**：① **`Switch` 方向采纳子代理实现**：`checked = !group.disabled`（开=工具可用），点击组开关发出 `on:false`——design §3.3 字面 `checked = group.disabled` 与控制器 `on=true`=开启的语义冲突，只有 `checked = !disabled` 自洽，**以控制器/spec 语义为准**（12.1 README 与 code-design 附录 §3.3 回填一句说明）；② 会话级 reset 按钮落「关闭集区尾」（两段式确认）——**接受**；③ 4 个未消费 locale 键（`entry.disabled` / `toggle.failed` / `defaults.note` / `action.title`）**保留**（v2 可用，不删）；④ 10.5 接线：`ctx.on('command/executed', handler)` 可直接透传给 `subscribeCommandExecuted`（handler 2 参、TS 允许少参）；focus 用 `window.addEventListener`/`removeEventListener` 包成 `attachFocusListener`。**连锁面**：10.5（注入面三件）、12.1（README 回填 Switch 语义）、code-design 附录 §3.3 注记。
- **R24（裁定 · 10.5 三项）**：① **端口投递选定「注册级 inject 面」**（三选一第一方案）：`ctx.slots.inject(...)` 的 `register({ inject: () => ports })` 把 `{resolveClient, subscribeCommandExecuted, attachFocusListener}` 并进组件组合 props——依据 `dsh-client-ui-slots/lib/types/index.d.ts:806-808`（inject 工厂返回值并进 props）、同文件 `:487`（session 作用域 `InjectParams`）、`dsh-client-ui-renderer/lib/types/client/registry.d.ts:111`（座位声明存在才跑回调 = 软注册接缝）、先例 `plugins/web-ux/src/client/index.ts:105-119`；② `subscribeCommandExecuted` 用 **fan-out**（全插件一个 `ctx.on('command/executed')` 监听 + `Set` 分发），避免每次开/关面板往 fiber 叠加 effect（`ctx.on` 内部即 `fiber.effect`）；`attachFocusListener` 在 `typeof window === 'undefined'` 时软降级；③ `src/client/index.ts` 额外导出 `SEAT`/`PANEL_ID`/`PANEL_ORDER`/`attachFocusListener` **保留**（纯常量/纯函数，测试与 web-ux 先例同形）；软注册 catch 里的 `ctx.logger.warn` **不再包 try**（cordis 基础服务，官方 client bundle 同用法）。**连锁面**：11.3（真机验证入口渲染）、12.1（README 入口说明）。
- **R25（11.1 结果 · 静态门禁全绿）**：仓库根按序 `pnpm build` / `pnpm typecheck` / `pnpm test` / `pnpm lint` / `pnpm dsh:check` **全部退出码 0**（干净窗口：无并发构建进程）；`plugins/session-tool-toggle/lib/{index,client}.js` 均存在；`pnpm --filter dsh-plugin-session-tool-toggle typecheck`（覆盖 client project）退出码 0；`pnpm dsh:check` 输出「48 DSH 包全 0.2.1-rc.2、release-age allowlist 308 = lockfile 308、baseline/pins/ranges/allowlist/installed tree 一致」；build 后 `git status` **无意外改动**（其他插件 `lib/` 无 diff；新插件目录 `??` 为预期）。**连锁面**：12.2（`pnpm verify` 复验）。
- **R26（P0 缺陷 D1 · 11.2 冒烟发现，已修复）**：`dsh-scope` 的 `ScopedLayers.effect` 在返回 disposer **之前**同步触发 `tools/change`；`src/host/session-layer.ts` 的 `restrict()` **返回后**才记 `this.deny`，而 `src/host/index.ts` 的 `tools/change` 监听**同步** refresh 全部层 → 重入时同一非空 deny 再次 `restrict` → **无限递归**（实测 CPU 100%、调用栈 1,485 帧、`request` 永不返回）。**影响面**：任何命中**全局层 catalog** 的名字（139 个 MCP 工具、`working_directory`、3 个 mcp-resources 工具）都会卡死宿主；内置 agent 作用域工具（`web_fetch`/`web_search`/`present` 等）不受影响 → 11.2 首轮 ①⑥ 的 FAIL 由此单一根因导致。**修复**：`reconcile()` 入口加重入闸（`reconciling` 标志 + `try/finally`；重入必由本轮 `restrict` 同步回声触发、状态未变，跳过安全；闸在 `reconcile()` 入口而非 `restrict()` 内部，I3 重推重试不受影响），新增 3 个单测（含反向验证：移除闸后 restrict 调用 1,310+ 次爆炸）+ `code-design` 附录 §3.4 补 I6「同步重入幂等」。**连锁面**：11.2 复测（见 R27）、12.2（verify）。
- **R27（11.2 复测结果 + O1 裁定）**：D1 修复后隔离实例复测 **①⑥⑨ 全部 PASS**：① `/tools off mcp:yunxiao` **75ms 返回**、可见 173→103（减少 70）、CPU 归零、`plugin:session-tool-toggle/state` seq 已落盘、下一轮请求无 `mcp__yunxiao__*`（「`system/message` 不含 `### MCP server: yunxiao`」子句因 yunxiao 无 instructions 而**空真**，改用 codebase-memory 验证：关闭后 system 段集合 `["codebase-memory","dbx"] → ["dbx"]`、移除 305 字；全关 5 MCP + working_directory 后段集合 `[]`、移除 394 字）；⑥ 5 agent × 6 地址（**含 `tool:working_directory`**）顺序 30/30、并发 30/30 全部返回、无卡死（CPU 突发约 5s 后归零）；⑨ 面板 `toggle {on:false,addresses:["mcp:yunxiao"]}` → `matched=70`、hiddenTools 70、visible 173→103、与 `/tools status` 一致。⑦ 升级为**真实 provider 实测**：A/B 首请求 prompt 49,943→30,446 = **−19,497 token/请求（−39.04%）**；同会话连续两轮 −19,486（差 11 token = 新增 history）；tokenMeter 的 `surface` +1,584 属本地 tool-removal 消息、不计入 provider 账单；**系统提示省量 0**（yunxiao 无 instructions）；全关数据点 33 工具 12,517（−74.9%）。**首轮 `token-savings.md` 的 dbx 系统段 2,724 字是测量错误，真实 89 字**（已更正；其他文档未引用该数字）。**O1（文案，非功能，接受 v1）**：`commands.ts` 对所有 `mcp:<server>` 回执固定加「+1 段服务器指令」，即使该服务器无 instructions——关闭行为与计数正确，仅文案不精确，v2 再优化。②③④⑤⑩ 未复跑（D1 修复只增 `reconcile` 重入闸，不触及这些路径；artifacts 保留首轮记录并标注）。**连锁面**：12.1 README 的省量数字（R19 的 16,432 等价计算已被真实 19,497 取代）、12.2（verify）。
- **R28（11.3 结果 · 浏览器演示证据）**：隔离实例（`/tmp/stt-113-home` + 端口 **3212**，link 装入本插件）用真实 Web UI 截得两张图（1440×900）：`artifacts/panel-open.png` ——面板四段全展开（状态摘要 **53 visible / 23 catalog / 0 off**、MCP servers **codebase-memory 17** + **figma 2**、Skills 1、Built-in 33 含 filter 输入与 `bash`/`edit`/`glob`/`grep` 的 **Protected 徽标 + 开关置灰**）；`artifacts/panel-after-toggle.png` ——切换 codebase-memory 整组后 **36 visible / 17 off**、组行显示「17 tools · 17 off」、并出现 **「Turned off 17 tools; the prefix cache will be rebuilt once from the first changed schema token.」**（开关开/关的 KV 提示与关闭计数均按规格渲染）；操作记录 `artifacts/browser-demo.md`。**UI 文案为英文**（en locale 生效；zh 由 parity 套件锁）。实例已关停、主 profile 未改（dump-config 计数 0）。**连锁面**：无（演示证据）。
- **R29（11.3 PASS + 12.2 发布自检全绿）**：11.3 用 chrome-devtools MCP（容器内 headless Chromium、视口 1440×900）从启动日志取 `?token=` 登录隔离实例 3212，截得两张真实截图（见 R28）；操作记录 `artifacts/browser-demo.md` 含 RPC before/after（`stats` visible 53→36、denied 0→17、`state.disabled=["mcp:codebase-memory"]`）、`/tools status` 对账、服务端日志「已掩掉 17 个工具定义」「已遮蔽 mcp:codebase-memory 指令段」、浏览器网络 `POST /session-tool-toggle/toggle` 200。实例已关停、主 profile 未改。**12.2 `pnpm verify` 退出码 0**：递归所有插件 `verify:all` 通过；其中 multi-root 的 smoke 需运行中的 dsh（容器内可用）——`[smoke:behavior] 99/99 checks passed`、`[smoke:journey] 60/60 checks passed`。**连锁面**：无（最终门禁）。

