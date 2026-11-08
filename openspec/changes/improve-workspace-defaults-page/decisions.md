# improve-workspace-defaults-page · decisions.md（阶段 1.5 收敛留痕）

## 设计树（节点即决策、边即依赖）

```
Q1 分组清单能力（A1 会话视角投影 / A2 宿主按工作区宇宙 / A3 维持降级做精）★根
├─→ Q3 交互增强取舍（C1 全局过滤、C2 锚点仅在「有清单」时有意义；C4/C6 恒可选）
├─→ Q5 spec 对齐措辞（跟随 Q1 所选方案）
├─→ Q6 共用组件策略（仅 Q1=A1/A2 涉及 DefaultsGroupList 页面适配）
Q2 布局形态（B1 单列分块卡片 / B2 双栏）——独立（概要卡内容随 Q1 微调）
Q4 分节正文 h3 冗余处理（删除 / 改为信息性标题）——独立
```

前沿计算：
- 第 1 轮前沿 = {Q1, Q2, Q4}（Q3/Q5/Q6 均以 Q1 为前置）
- 第 2 轮前沿 = 视 Q1 结果展开 {Q3, Q5?, Q6?}

## 轮次记录

### 第 1 轮（问题：Q1 能力 / Q2 布局 / Q4 标题）

- **Q1 = A2 宿主按工作区算宇宙**（用户裁定，非推荐项 A1）：`{workspacePath}` 寻址的响应 universe 从恒 null 改为该工作区的真实宇宙。settled。
- **Q2 = B1 单列分块卡片**：概要卡 → 清单卡 → 次级说明。settled。
- **Q4 = 删除 h3** + **新增需求**：清单条目要展示更详细信息——skill 是否占对话 token（modelInvocable）、能否 `/{skill}` 手动调（userInvocable）等。settled（标题部分）。
- 第 1 轮后的自行查证（事实，非提问）：
  - 宿主 `ctx.tools.schemas()`（插件上下文）读未受限全局注册表（project-mcp/index.ts:106-108 先例）→ MCP+内置分组可行，复用 `buildDefaultsUniverse`。
  - 宿主技能服务 `snapshot({cwd})` 支持按工作区作用域；`SkillSummaryLike.invocation = {modelInvocable, userInvocable}` 现成承载 Q4 新需求。
  - 全局注册表不带工作区归属（project-mcp 私有），MCP 组口径成为新决策点 → Q8。
  - Q6（共用组件策略）降级为设计决策（约束=面板零回归），留阶段 1.7，不问用户。

### 第 2 轮（问题：Q8 MCP 口径 / Q7 详情展示 / Q3 交互增强）

- **Q8 = 「和 /inventory 一样的口径」**（用户自定义答复）。查证（事实）：`/inventory` 纯逻辑层（user-commands/host/inventory.ts D3）= 会话可见工具按 `MCP_SERVER_PATTERN = /^mcp__([A-Za-z0-9_-]+?)__(.+)$/` 归组（第一个 `__` 边界、未归组容忍、绝不猜服务器名）+ 技能行带 `modelInvocable/userInvocable/source`。落地裁定：
  - 归组纪律与展示字段照搬 /inventory（含未归组计数）；
  - 读数面 = 插件上下文 `ctx.tools.schemas()` 未受限全局注册表（页面无会话绑定；project-mcp index.ts:108 catalog 同源先例）——实质为全局并集近似，跨工作区条目写入仅保留意图，文案/README 说明；
  - 技能 = `skills.snapshot({cwd})` 工作区作用域 + invocation 字段透出（支撑 Q7）。settled。
- **Q7 = 行下次行 + 标签**：每行名字下加灰字小号描述；skill 行另加状态标签（占 token / 已隐藏 · /name 仍可用 语义按默认档措辞精化）。settled。
- **Q3 = C1 + C3 + C4 + C6**（全局过滤、刷新入口、可复制命令、空档可视化；C2/C5 不进本次）。settled。

### 推导关闭（非用户决策，由前两轮推导）

- **Q5 spec 措辞**：由 Q1=A2 推导——stt spec「默认档编辑面的分组开关形态」中「沿用当前会话视角」措辞改为工作区宇宙语义（新增场景：页面分节按 `{workspacePath}` 获得工作区宇宙；归组口径 /inventory 同款；跨工作区条目意图容忍）。
- **Q6 共用组件策略**：降级为阶段 1.7 设计决策，硬约束 = 面板形态零回归（共用 DefaultsGroupList 改动须以面板测试全绿为准）。

### 前沿状态

第 1+2 轮后前沿为空（Q1–Q4、Q7、Q8 全部 settled；Q5/Q6 推导关闭）。待用户确认「已达成共识 / 可以落档」。
