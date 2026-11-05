# decisions — project-mcp-isolation-enforcement（串行 grill-me 收敛留痕）

编排：串行单线（无并行交叉比对/复算/探索审视步骤）。收敛方式：主会话按 grill-me 前沿分轮直问用户。

## 设计树

```
修复「执行层穿透」
├── D1 修复策略组合（最承重）
│   ├── boot sweep（A，必做治本）…………………隐含共识：无争议，未单独提问
│   ├── 全局层守卫兜底（B）…………………………Q1 ✔ 采纳
│   │   └── D2 agentless 调用语义 ……………………Q2 ✔ fail-closed 一律拒
│   └── teardown 行为（C）……………………………Q3 ✔ 保持现状 lift + sweep 秒装
├── 实现细节（agents 服务就绪时机、GuardedExecution 扩展、
│   拒绝文案一致性、sweep 幂等、批次拆分）→ 阶段 1.7 设计线，非用户决策
└── 既定项（prompt 预置，不再问）：变更名、验收标准、不 push 不 tag、上游只读
```

## 第 1 轮（2026-11-05 17:1x）

- **Q1 是否叠加全局层守卫兜底（方案 B）**
  - 推荐：A+B（sweep 治本 + global guard 使「实调必拒」不依赖时序）。
  - 答复：**A+B（推荐）** —— 已采纳。仍待决：无（Q2 为其下游）。
- **Q3 teardown 是否保留主动 lift**
  - 首问用户回「这是什么东西」→ 白话重述（拆干净再秒装 vs 不拆但账本变旧账）。
  - 推荐：保持现状 lift（干净所有权 + sweep 毫秒级补回 + 守卫封窗口）。
  - 答复：**①拆干净再秒装（推荐）** —— 已定。

## 第 2 轮（2026-11-05 17:2x）

- **Q2 全局守卫对无 `exec.agent` 调用（agentless）的判定**
  - 首问用户回「啥意思」→ 白话重述；再问用户追问「为什么会有拒绝/拦截这一步？理论上他应该看不到这个工具」→ 主会话解释两道防线（遮蔽=清单快照有时序窗口且管不了解析层点名调用；守卫=调用瞬间实时判定；agentless 调用不经任何清单、只能靠闸口拦）。
  - 推荐：fail-closed 一律拒（与名字面 untracked 即隐藏的既有语义对齐；全库会话日志未发现 agentless MCP 调用方）。
  - 答复：**①一律拒（推荐）** —— 已定。

## 收敛结论（前沿为空）

1. **D1 = A+B**：boot sweep 补挂（治本，恢复面+调用双遮蔽稳态）+ 全局层守卫（`ctx.tools.guard` 无 scope 注册落 global layer，对 untracked/agentless fail-closed）。
2. **D2 = agentless fail-closed**：无 `exec.agent` 的 `mcp__`/资源三件套调用一律拒，文案与 per-agent 分支一致。
3. **D3 = teardown 维持现状**：`dispose()` 主动 lift + 新实例 sweep 毫秒级补挂 + 全局守卫封窗口；不引入跨 fiber 状态。
4. 上游结论（事实，非决策）：无需改 dsh 上游；两个原始假设（调用路径绕过、scope 错位）均被源码与对照会话证据证伪，真因为 agent/created 单点绑定的生命周期缺口。
5. 未决项：无（全部已答；无静默假设）。

## 落档分歧点裁定（阶段 2 第 3 步，2026-11-05；设计线上浮 P1-P4 并入本节一次问清）

- **P1 = A 重装触发**：G6 实机验收的插件重载用 `docker exec dsh dsh plugin --profile web add link:…` 触发 fiber 替换（07:10 穿透同款路径，不中断 GUI），失败再约时重启进程兜底。
- **P2 = A 维持设计口径**：agentless 的 `mcp__` 全族拒；资源三件套 `server` 非空字符串则拒、不可判定交回工具自身参数校验。未来出现真实 agentless 调用方时以 `isolation: global guard denied … (no calling agent)` warn 日志为信号另立变更收窄。
- **P3 = A 只加注不重跑**：README 历史冒烟表加一行注记，不重跑；只改降级矩阵/三面/诊断/排障四处。
- **P4 = A 不跟进**：不向上游 dsh 提「agent 存活通知」feature request；`agents.list()` 补挂已闭环。

## 裁定依据与证据来源

- 机制链源码锚：dsh-agent-loop L506-617（scheduler prepare）、dsh-tools L3310-3370（prepareExecution/guardReason）、L3024-3032（global 层先行）、L3403（resolveExecution）、dsh-agent-loop L778-779（createScope(loopCtx, this)）、cordis L83-144（traceable this.ctx 重绑）。
- 穿透证据链：会话 `session-8624cadb` 持久化日志（06:46:42 接管 → 07:10:25 插件重载 `boot: 9 session(s) predate this load` → 07:16/08:30 请求头 199 工具全量 → 08:36:11/59 实调穿透返回生产 RDS 真实数据，isError:false）。
- 对照组：子代理 `c7b125c5` 与规划会话 `session-82761bb9`（收到 agent/created）面干净——机制对被接管 agent 正常。
