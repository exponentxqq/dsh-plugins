# 差异收敛留痕（diff-matrix）— project-mcp-name-resource-isolation

- 变更名：`project-mcp-name-resource-isolation`
- 编排：并行（team 驱动，两条 fresh 具名成员线；lineA/lineB 模型路由在 team 编排下不应用）
- 输入：`line-a.md`（271 行）+ `line-b.md`（315 行）+ 上游源码/本仓源码只读核验
- 规划键：lineA/lineB 未应用（team 成员无模型参数）；panel/design 为 subagent 派发，按映射文件应用
- 收敛时间：2026-11-02

---

## 一、三分类矩阵（逐字段）

### 1) 目标与非目标

**共识**
- 根因：project-mcp 在**插件全局 ctx** 加载 mcp-client → 资源 provider 落在 `mcpResources` 全局层；名字段（`## MCP resource servers`）与每服务器的 `mcp:<server>` 指令段都对所有会话可见；三个资源工具在调用方 agent 作用域解析 server → 可越权读。
- 名字面按工作区归属隔离；资源面按「已加载项目服务器 ∩ 该 agent 归属集合」gate；profile 级 MCP **不纳入**（全局能力）。
- 资源面必须是硬边界（拒绝越权调用、不依赖文本解析）；名字面是显示层过滤。
- 保持不变：`mcp__<serverName>__*` 命名契约、serverName 冲突仲裁、热重载/`/mcp-reload`、工具面既有 `restrict + guard`。
- 不新增运行时依赖；默认不改其他插件、不改 profile 配置、不改上游源码。
- 归属判定复用既有 attributor（会话 cwd → 最近登记根 + 附加根，fail-closed）。
- 验证必须含独立实例端到端冒烟（独立 DSH_HOME + 端口 + probe 服务器）。

**分歧**
- D2 架构路线：A 把「零上游修改」写成硬非目标（P4 上游 API 仅记 follow-up）；B 把「是否允许提升基线/推动上游 patch」留作用户决策（Q5），并给出 S1/S2/S3 三路线。→ 已裁定：用户选 **S2**（见第五节答问记录）。
- 「完全隔离」的层级定义：A 明确名字面=显示层、资源面=硬边界；B 在 G1/G2 里把面板/命令/日志也列为「名字面已观测表面」（Q2 选项化）。→ 已裁定：本变更只做模型可见面（名字段+指令段）+ 资源面；人类 UI 不纳入（见 Q2）。

**单边遗漏**
- A 有：`mcp:<server>` 服务器指令段过滤（标题 `### MCP server: <name>` + 正文为服务器 instructions）；active/loaded 与 claimed 集合口径区分；G4 动态性/G6 可观测；PTC 双模式与「server 侧零请求」断言；P2（provider 重挂）否决理由（per-agent 自作用域工具无法被 restrict 掩）。
- B 有：S1 作用域化加载的可行性证据（browser-use 先例）；资源拒绝文案/错误语义与 `info`；反例回归清单（V4）与未知项 U1–U9；跨工作区同名复用问题（Q3）；面板 U6 未知项。
- 核验结论：A 的指令段项**成立**（见二.1）→ 纳入；A 的集合口径**成立**（见二.2）→ 采纳；B 的 S1 证据成立但用户未选；B 的 U4/U5/U9 保留为 spike 验证项。

### 2) 范围与边界

**共识**
- 触达：`plugins/project-mcp/src/host/`（新增名字面过滤与资源闸门模块、`isolation.ts` 扩展、`mcp-manager.ts` 读数端口、`index.ts` 接线）、`plugins/project-mcp/test/`、`plugins/project-mcp/README.md`、`openspec/specs/dsh-project-mcp/spec.md`、本变更目录（四件套 + 两材料 + 冒烟证据）。
- 不动：其他插件源码（除非面板纳入＝不纳入）、dotfiles profile、上游 `@deepseek-ai/dsh*`、扫描格式/env 展开/watch 阶梯/命令文法。
- 边界语义：连接失败/断线沿用上游语义（条目激活期 provider 仍在、调用报连接错误）；无 `systemPrompt`/`mcpResources` 的部署软降级；多 profile（web/acp/headless 均 dsh-base）。
- 子代理按各自 `agent.session.header.cwd` 归属（复用既有 attach 语义）。

**分歧**
- 跨工作区同名 serverName 复用：A 明确非目标（N6）；B 提为 Q3 备选。→ 两线实际建议一致：**本期不纳入**（A N6 + B Q3 推荐 i）。
- 面板/命令名字面：A 明确 N2 不做；B 列为 Q2 选项。→ 用户裁定不纳入（Q2 选「名字段+指令段」）。

**单边遗漏**
- A 有：`mcp-manager` 需新增 active 读数（区别于 `managedServerNames()` 声称集合）；名字面解析失败 fail-open + warn（后被用户改判 fail-closed）。
- B 有：跨插件软依赖契约成本（若面板纳入）、S1 的 spec 改写范围。

### 3) 方案与取舍

**共识（推荐一致）**
- v1 用**单连接 + 面级拦截**（A=P1，B=S2）：`system-prompt/assemble` 瀑布过滤名字段/移除隐藏服务器指令段；资源三工具调用按 `arguments.server` + 调用方归属硬拒。
- 「每 agent 挂载 mcp-client」（A=P3，B=S1）成本过高，不作 v1；上游钩子（A=P4，B=S3）是长期正解但需上游发版/基线提升。
- 整体 deny 三个资源工具（A=P6）、只做资源面不做名字面（A=P5）、改名/前缀命名空间（B=S5）、自持第二条资源连接（B=S4）均否决。

**分歧**
- D4 资源闸门实现点：A 扩展**既有 per-agent `tools.guard`**；B 用**全局 `tools/pre-execute` 瀑布**。→ 裁定见二.4：采用 A（guard），B 方案列为备选。
- D2 上游：A 硬非目标；B 用户决策。→ 用户 Q1 选 S2，不立上游提案任务；S3 仅作为 design 决策记录里的被否/迁移路径。

### 4) 任务拆分草案

- 两线均为「spike → 纯函数/抽取 → 闸门实现 → 接线与刷新 → 测试/冒烟 → spec/文档 → 发布」的组间串行结构；B 额外给出 S1/S3 分支任务（用户选 S2 后不采用）。
- 差异点：A 的组 1 spike 更具体（上游段名/文案、assemble 可改写、guard 参数形态）；B 的组 1 覆盖（含 agent 作用域注册可行性、子代理 scope）。→ 合并取 A 的 spike 项 + B 的 U 清单中与 S2 相关项（U3/U4/U6/U7）。
- 组内并行约束、验证句可核对、单组 ≤ parallelism（8）：落档阶段按 planning.md 契约成稿。

### 5) 验证思路

**共识**：单测（纯函数 + 假 assembly/假 guard）+ 独立实例端到端冒烟 + 回归（工具面/热重载/`session-tool-toggle` 交互）+ 文档一致性。
**互补采纳**：
- A：资源越权调用**目标服务器侧无新请求**（probe 日志）、PTC 与原生双模式、fail-closed 无归属会话、profile 不受影响、过滤诊断日志口径。
- B：负向断言（解析失败不改错段、异常不得放行、profile 名不得误删、子代理不得绕过、参数缺省/非字符串放行给上游校验）、`/tools` 面若纳入的对照（不纳入则记为残余）。

### 6) 风险与未知项

**共识风险**：上游段名/文案漂移（文本耦合）；`system-prompt/assemble` 语义变化；`guard` 看到 `arguments` 的形态；全局 provider 仍在（其他消费者可见）；升级前历史残留；动态刷新时序窗口；同 profile 一致性；文档过期。
**A 独有**：R8 与 profile 同名冲突时用 active 集合避免误伤（采纳）；R13/R14 未跟踪 agent 与非会话装配、provider 重注册时序（保留为 spike/边界）。
**B 独有**：S1 连接爆炸/子代理回归/首步竞态/二维 diff（不采用 S1 后不构成风险）；R10 跨插件成本（不纳入面板后不构成）；R12 诊断噪音（采纳限流建议）；U3/U4/U6/U7/U9 保留。
**B 的事实错误**：N1/R1 断言「8 个名字全部来自 profile/其他 bundle、不是 project-mcp 受管」→ 已证伪（见二.1），B 的 Q2 选项 (iii) 前提随之修正。

### 7) 假设清单

**一致**：需求只针对项目级；归属语义不变；零上游修改（S2 下成立）；单连接；不改名；面板默认不纳入；`session-tool-toggle` 可改但不改（N2/Q2）。
**A 特有并采纳**：A7 集合口径用 active；A8 安全模型（名字面显示层/资源面硬边界）；A9 无开关；A12 段名契约（`mcp-resource-servers`、`mcp:<server>`）。
**B 特有并保留**：A5 成本假设（S1 不采用后不构成）；A6 隔离实例冒烟法（采纳）；A8 上游契约短期稳定（rc 阶段用能力探测 + 告警兜底）。

---

## 二、单边项与分歧的核验裁定（证据锚）

1. **8 个名字的归属（裁定：A 正确，B 的 N1/R1 有误）**
   - 6 个项目级：`opc/.dsh/mcp/{dbx,figma,yunxiao}.yaml`、`family/.dsh/mcp/{dbx-family,figma-family}.yaml`、`brains/.dsh/mcp/dbx-brains.yaml`；
   - 2 个 profile 级：`dotfiles/dsh/profiles/web/cordis.patch.yml:64-72`（`mcp-codebase-memory`）、`:73-90`（browser-use chrome-devtools-mcp）；
   - profile 注释明写 dbx/figma 已迁项目级（`:50-61`、`:103+`）；
   - 运行证据：`figma-developer-mcp --image-dir .../company/{opc,family}`、`yunxiao-bridge.cjs`、`dbx-mcp` 子进程树；隔离日志 `visible=[dbx-family,figma-family]`。
   - 影响：本变更后本会话（dsh-plugins）名字段应只剩 2 个 profile 名——Q3 已确认符合预期。

2. **集合口径 active vs claimed（裁定：采用 A 的 A7 active/loaded）**
   - `mcp-manager.ts:118-138`：`managedServerNames()` = `scanned` 声称集合（含加载失败）；`serverNamesForRoots()` 同为声称口径；`:140-175` `reconcile` 中只有成功 `loader.load` 的才进 `active`。
   - 加载失败的项目 claim 不会注册 provider/工具（mcp-client 启动失败即无注册），因此不出现在名字段；若按 claimed 隐藏，会误藏 profile 同名服务器（claim 与 profile 撞名时项目加载失败、profile 仍 active）。
   - 结论：名字过滤与资源拒绝集合 = **已加载（active）项目服务器**；需在 `mcp-manager` 新增只读端口；spec 需写明与工具面 claimed 口径的差异。

3. **指令段（裁定：A 成立，纳入范围）**
   - `dsh-mcp-client/lib/index.js:641-672`：`instructions = serverText ? \`### MCP server: ${config.serverName}\n\n${serverText}\` : ""`；
   - `:721-742` `registerServerContext` 在其挂载作用域（本项目=全局）注册 `systemPrompt.section({ name: \`mcp:${server}\`, text: connection.instructions() })`；
   - `dsh-system-prompt/lib/index.js:117-119` `renderPrompt` 仅拼接段文本、不自动加标题 → 标题来自 mcp-client 文本本身；空 instructions 的段文本为空、渲染时被过滤。
   - 结论：隐藏项目服务器的该段需在组装期**按段名移除**（名称面过滤之外的第二条硬需求）。

4. **资源闸门实现点（裁定：采用 A 的 per-agent `tools.guard` 扩展）**
   - `dsh-tools`：`tools/pre-execute` 为可重排 waterfall（`lib/index.js:3321`），`tools.guard` 为**单调**守卫（`:3017-3030`）；`guardReason(exec)` 先全局层再 `chainLayers(exec.agent)`（`:3023-3030`）→ 用 `agent.ctx.tools.guard` 注册即只作用于该 agent 的调用，且与工具注册在哪个 scope 无关；
   - `ToolExecution.arguments` 为 lossless JSON（types `:229` 附近；README:233 明确 pre-execute 不得改写 arguments），guard 可读 `arguments.server`；`PreToolDecision` 支持 `deny + reason + info`（types `:445-458`）；
   - 本仓 `isolation.ts:241-266` 已用 `tools.guard` 装 per-agent 工具守卫、`index.ts:159-171` 在 `agent/created` serial-await attach（首步前完成）→ 扩展同一 guard 闭包即可，生命周期/刷新形态不变；
   - 备选（B）：全局 `tools/pre-execute` 监听亦可，但需自建 agent→归属映射、且顺序可重排；与既有 restrict+guard 双层架构不同构，故不采用（记入 design 决策记录）。

5. **组装钩子与作用域键（裁定：两线说法均成立，实现用 `context.agent` / `context.scope` 二者皆可）**
   - `dsh-system-prompt/lib/index.js:356-410`：`assemble()` 收集 sections → `ctx.waterfall(scopeTarget(this, scope), 'system-prompt/assemble', assembly, context, …)`，返回值为准（同一 `complete` 段例外）；
   - `dsh-agent/lib/index.js:291-297`：`assembleContextFor(agent, signal) = { agent, scope: agent, signal? }`；
   - `dsh-working-directory/lib/index.js:48-60` 为官方监听器范式（`ctx.on('system-prompt/assemble', …)`，读 `context.agent`，改写/新增 context 后返回 assembly）；
   - `ScopeKey = object`（`dsh-scope` types:11），与既有隔离表以 agent 对象为键一致。

6. **面板 shadowed 数据源（裁定：不纳入本变更）**
   - `session-tool-toggle/src/host/panel.ts:214-224`：`hiddenByOthers = catalog \ (scoped ∪ carried)`；`control.ts:610-616`：`catalog = deps.catalog()` = 全局 `ctx.tools.schemas()`；面板是管理员视图，S2 无法让其消失 → 记为残余边界（Q2 已确认不纳入）。

7. **「复用连接 + 注册层干净」不可行（裁定：只有 S3 上游钩子可行）**
   - `mcp-client` 公开 Config 无共享 transport/注册作用域选项；一实例一连接、effect 作用域生命周期；`connection.resources` 不导出（`lib/index.js:721-742`；types 导出仅 `createMcpToolDefinition` 等）。
   - `mcpResources.register(server, provider)` 公开且作用域感知（Cordis traceable proxy：`cordis/lib/index.js:123-166`，`this.ctx` 解析为访问方 scope），但 provider 对象由 mcp-client 内部持有 → 第三方无法复用连接再按 agent 重注册。
   - agent 作用域父链 = preset generation（`dsh-agent-preset-registry/lib/index.js:455-505`：`createScope(this.owner, key)` + `join` 里 `bindScopeParent(key, generation.key)`；generation 按 preset 定义共享）→ 无法为「同工作区的一批 agent」插入共享祖先作用域。
   - 结论：S1 的彻底性依赖每 agent 独立连接；「复用连接 + 注册层干净」= S3（上游扩展）；本期选 S2。

8. **`mcpResources.layers` 为 private（裁定：文本解析是 S2 唯一途径）**
   - `dsh-mcp-resources/lib/types/index.d.ts`：`private readonly layers; private readonly selfCtx; private request;` → 无法从服务公开面做结构化名字集合读取；S2 的名字面必须解析上游段落文本（故 Q5 的降级语义是真实决策）。

---

## 三、分歧复算判定（阶段 1.5 第 3 步）

**不派第三条复算线。** 理由：
- 两线在**技术推荐**上一致（v1 = 单连接 + 面级闸门），不存在「结论互异且不可查证」的技术分歧；
- 下列差异均已用源码/运行事实裁定：D1（名字归属）、D3（指令段）、D4（闸门实现点）、D5（集合口径）、D6（面板数据源）、D7（组装上下文）、D8（复用连接不可行）；
- 唯一不可由环境裁定的是**上游改动政策/验收层级**——属用户决策（第五节问询），不是事实分歧，复算线无法回答政策问题。

---

## 四、探索审视（阶段 1.5 第 4 步，补双边盲区）

| 编号 | 新发现 / 降级裁定 | 处置 |
| --- | --- | --- |
| E1 | 指令段标题 `### MCP server: <name>` 由 mcp-client 自己拼接（`:655`），B 线遗漏 | 纳入范围（Q2 已选「名字段+指令段」） |
| E2 | 组装上下文同时有 `agent` 与 `scope`（同对象），A/B 各说其一 | 事实统一，实现用 `context.agent` 为主、`context.scope` 等价兜底 |
| E3 | `renderPrompt` 不加段标题 → 名字段只能改文本、指令段只能删段（不能靠改注册名） | 设计约束 |
| E4 | `mcpResources.layers` private → 名字面只能文本解析 | Q5 fail-closed 决策成立 |
| E5 | 过滤后名字数组为空时的正确形态 = 删除该段（对齐上游「注册表为空不贡献段落」） | 写入设计 |
| E6 | 资源 deny 的 reason **不得回显目标服务器内容/资源信息**；验证用 probe 服务器侧请求日志证明「不触达」 | 写入设计与验证 |
| E7 | native 与 PTC 走同一工具流水线（README:109/141），PTC 内层仍列 U4 待 spike 实证 | spike 项 |
| E8 | 未跟踪 agent / 非会话装配 → fail-closed（项目名全隐），不制造反向泄漏 | 设计约束 |
| E9 | 插件 HMR/重载后既有 agent 可能短暂未跟踪 → fail-closed 方向安全；spec 可加场景 | spec/风险 |
| E10 | 名字段解析需覆盖「固定前缀句 + 句末 JSON 数组」，策略：定位 `## MCP resource servers` 段 → 提取句末 `[...]`；多策略失败才判定 unparsable | 设计细节 |
| E11 | web/acp/headless 三 profile 均含 `dsh-base`（system-prompt + mcp-resources + tools） | 设计假设/验证 |
| E12 | 升级前已进入会话历史的名字不可清除 | README/spec 边界 |
| E13 | profile 级服务器在无归属会话仍可见（预期行为，Q3 确认） | spec 场景 |
| E14 | 冒烟需独立 `DSH_HOME` + 独立端口 + probe 服务器（ping 工具 + 一条 resource + 非空 instructions + 请求日志） | 验证方案 |
| E15 | 指令段过滤与 `session-tool-toggle` 的「同名空段遮蔽」不冲突（后者在 agent 作用域注册空段，本变更在组装期删段） | 设计/冒烟 |
| E16 | `mcp-manager` 需区分「claimed」与「active」读数；资源闸门与名字过滤共用 active 端口 | 设计约束 |

---

## 五、设计树与前沿分轮问答（grill-me）

### 设计树（节点=决策，边=依赖）

```
Q1 架构路线/验收层级
 ├─ Q2 名字面范围（依赖 Q1 的"完全"定义）
 ├─ Q3 profile 级是否纳入（独立）
 ├─ Q4 回滚开关（独立）
 └─ Q5 名字面解析失败语义（依赖 Q1=S2 才存在）
     └─（若 Q5=fail-closed）设计中的多策略解析与告警口径
```

### 第 1 轮（前沿：Q1/Q2/Q3/Q4）

- **Q1**：架构路线选哪条（S2/S3/S1）？
  - 用户先要求「详细说明区别，举实例」→ 已给出三层（模型面/人类 UI/注册层）对照表与本机实例；
  - 用户追问「你确定现在的连接/进程成本是 1 条/服务器？」→ 已修正：project 侧连接数=1/配置条目，但进程树非 1（dbx 4 层、figma 1 进程 ~74MB、codebase-memory 带 daemon）；profile 的 browser-use **已按 agent 每会话连接**（实测 12 个 chrome-devtools-mcp/628MB + chromium 树 1.3GB）；
  - 用户追问「S2 能做到完全隔离吗？」→ 已给三层定义与残余清单；
  - 用户追问「S1 基础上能否复用服务器？」→ 已证：公开面互斥，只有 S3 能两者兼得（见二.7）。
  - **最终答复：只选 S2**（不追加 S3 提案任务、不改 S1）。
- **Q2**：名字面验收范围？→ **答：名字段 + 服务器指令段**（不含人类 UI）。
- **Q3**：profile 级 MCP 是否纳入隔离？→ **答：不纳入**（保持全局可见）。
- **Q4**：是否新增 `resourceIsolation` 配置开关？→ 用户先问与 `session-tool-toggle` 开关的区别（已说明：会话级热开关 vs profile 级静态回滚开关；前者管不了资源面）→ **答：不加开关，默认生效**。

### 第 2 轮（前沿：Q5，依赖 Q1=S2）

- **Q5**：名字段文本解析失败时（上游升级改文案的罕见情况）怎么处理？
  - A 线原推荐 fail-open（保留原文+warn）；B 线指出 fail-open 即泄漏。
  - **答：fail-closed（解析失败就整段删除）**，优先多策略解析降低误判；warn/error 日志 + 单测钉当前格式。

### 未答/待决项

- 无产品级未决项。以下为设计级细节，交由阶段 1.7 design 与落档记录（不静默假设）：deny reason 精确文案（不泄露内容前提下）、诊断日志字段与限流、名字段多策略解析的判定顺序、任务分组粒度、版本号。

---

## 六、收敛结论（落档输入）

- **v1 方案 = S2（面级闸门）**，单连接/单进程成本不变：
  1. **名字面**：`system-prompt/assemble` 瀑布内（a）按 agent 归属过滤 `## MCP resource servers` 段的名字数组，空则删段；（b）按段名移除隐藏项目服务器的 `mcp:<server>` 指令段；**解析失败 = fail-closed 删段** + 告警。
  2. **资源面**：扩展既有 per-agent `tools.guard`：三个资源工具（`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`）的 `arguments.server` ∈ active 项目服务器 且 ∉ 该 agent 归属可见集 → 拒绝（fail-closed）；参数异常交回上游校验；不触达目标服务器。
  3. **工具面**：既有 `restrict + guard` 不动。
  4. **归属/刷新**：完全复用现有 attributor、`agent/created` serial-await attach、`tools/change`/rescan 刷新路径；无新开关、无新依赖、无上游修改。
  5. **profile 级 MCP、人类 UI、跨工作区同名复用**：明确不纳入（写为边界）。
- **验收**：模型可见面零泄漏（含 PTC）、越权资源调用被拒且 server 侧无请求、profile 不受影响、无归属会话 fail-closed、动态刷新、既有工具面/热重载/`session-tool-toggle` 交互回归、文档与 spec 同步。
- **残余边界（必须写入 spec/README）**：人类 UI（面板 shadowed / `/tools`）仍可见项目名（管理员视图）；名字仍存在于全局注册表与未来新消费者可见（S2 非注册层隔离，S3 为长期正解）；升级前历史会话中的名字无法清除；profile 级名字全局可见。
- **材料**：本文件 + `code-design.md`（阶段 1.7 产出）落档时复制入变更目录；`line-a.md`/`line-b.md` 不入库。

---

## 七、落档分歧点决议（阶段 2 第 3 步；权威）

设计线（阶段 1.7）上浮 5 项，用户于落档分歧点问答逐项拍板；详细覆盖条款见 `code-design.md` 的「落档决议 R-1…R-5」：

- **Q1 = A**：HMR/重载后存量会话不做 boot 追平 attach；只加 boot 观测日志 + README 边界。条件任务 3.3 取消。
- **Q2 = B（范围扩张）**：本变更**顺带修工具面口径**。最终口径定为 **`blocked = claimed \ failedClaims`，工具面/名字面/资源面三面统一**（不是纯 active：provider 在 `connection.ready` 前已注册、`active` 在 load resolve 后才写入，纯 active 会打开 fail-open 窗口；也不是纯 claimed：那正是本项缺陷）。`mcp-manager` 新增 `failedClaims` 维护与 `blockedServerNames()`/`failedServerNames()`；`visible` 仍来自 claimed 的 `serverNamesForRoots()`。**「工具面不动」非目标被用户反转**，proposal/spec/tasks 相应扩一项并在 spec 中写明同名 profile 不被误伤。
- **Q3 = B**：资源 deny 文案**保留服务器名**，但与上游 `MCP resource server "x" is unavailable in this agent's scope` **逐字同形**——模型无法区分「被隔离」与「不存在」，无存在性 oracle；取消「文案不含名字」断言，改为「与上游同形」断言。
- **Q4 = A**：名字面诊断日志保持「前 5 次全量 + 形状变化」，`unparsable` warn 前 3 次。
- **Q5 = A**：spec 增 Scenario「升级前已进入会话历史的名字不追溯」。
- 残余未决：无产品级未决；设计级细节（deny 文案常量、日志形状键、任务编号）按 `code-design.md` 落档决议执行。
