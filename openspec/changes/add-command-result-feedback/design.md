# Design

## Context

Web GUI 的命令结果只通过事件流渲染成会话 transcript 内的持久 flow node（`dsh-client-ui-commands` 的设计：composer 从不回显命令结果），空会话欢迎视图没有 transcript 容器，结果无处呈现（见 proposal.md - Why）。web-ux 插件浏览器半已有两个能力（徽章、归档删除），全部触点经 `ctx.slots.inject` 软挂载、服务经 `ctx.get` 延迟读取，本设计延续该架构。

上游可依赖的**公开**机制（均已在本机 DSH 0.2.1-rc.2 源码核实）：

- 浏览器侧公共事件 `command/executed`，负载 `(sessionId, commandName, result)`，`result` 为 `{kind: 'success'|'error', text}`；官方包 `dsh-session-log-export` 即用 `ctx.on("command/executed", …)` 消费；
- 会话作用域 slot `conversation.input.overlay`（composer 上方浮层，官方命令补全弹层挂此处，`order: 1`）；
- `ctx.sessions.retainInfo(sessionId)`（`ISessions` 公开面）：会话引用计数的可观察快照，`retainedBy.mainView > 0` 即「该会话的会话视图正在主视图渲染」——框架自身就用它判定主视图会话（`dsh-client-ui-session` 内部同款消费），multi-root-workspace 的 compat 层已有同款防御投影先例。

## Goals / Non-Goals

**Goals:**

- 命令结果在「无处渲染」的视图当场可见：通知卡展示命令名 + 可展开全文，成功/错误样式区分，自动消失且可手动关闭；
- 实现完全落在 web-ux 浏览器半：零宿主半改动、零新 RPC、零命令语义变化；
- 与既有两能力共存：所有新触点软挂载，任一缺席静默降级。

**Non-Goals:**

- 不改变命令结果在 transcript 中的既有 flow node 渲染（那是结果的持久家）；
- 不解决「flow node 折叠态不显眼」的通用可读性问题（通知卡只兜「不可见」场景，高亮/滚动定位属后续独立变更）；
- 不做跨标签页去重协调（多实例各自展示同一通知，幂等无副作用）。

## Decisions

### D1 事件源：`ctx.on("command/executed")`

官方公共事件，浏览器侧已广播（execute 归准后 `notifyExecuted` 派发），`dsh-session-log-export` 有同款消费先例。备选的 mux 流订阅与内部服务状态读取均非公开面，弃。

事实结论（本机 DSH 0.2.1-rc.2 源码查证，作为解构与过滤的依据）：

- `CommandResult` 仅两种 kind：`success`（`text` **可选**，可带 `sourceEventSeq`）与 `error`（`text` 必填）——不存在第三种形状；
- prompt 型命令（展开为消息提交给模型）与宿主求值型命令走**同一条** execute → `notifyExecuted` 通道，负载只有命令名与结果、无类型标记，按类型排除不可行也不必要（见 D4 挂载联动）；
- 准入未命中（unknown command）不广播事件，无需处理；
- 广播的 `result` 恒为宿主返回值，客户端本地合成的错误串不进事件。

过滤规则：`commandName` 非字符串、`result` 缺 `kind`/`text` 字段结构、或 `kind === 'success'` 而 `text` 缺省/空——一律丢弃不产生通知（记 warn 供诊断），错误结果必带文本无需额外判断。

### D2 可见性判定：`sessions.retainInfo` 主视图引用计数

> **实施期修正**：原案「在 `conversation.chat.flow` 挂零渲染探针条目」不可行。该座位 `kind: 'single'`，框架对 single 座位的动态注册按「页面内后到者低优先级、渲染选举取首位」语义**遮蔽官方渲染器**（ui-renderer registry 文档与声明树元数据 `replaceRisk: "shadows-shipped-ui"` 双双明示）——第三方探针组件会把整个 transcript 渲染成 null，直接打挂会话流。改用公开的引用计数信号，零新增 slot 条目。

信号与判定：`ctx.sessions.retainInfo(sessionId)` 返回 `ObservableSnapshot<SessionRetainInfo>`，投影 `retainedBy.mainView > 0` 即「会话视图正在主视图渲染」（transcript 可见）。事件到达时：

- 计数为正 → 结果已作为会话流节点可见，不打扰；
- 计数为零（典型：空会话首屏，主视图未打开该会话）→ 弹通知卡；计数 0→1 的跳变即「会话视图挂载」，卡片随之自动隐藏。

防御式投影纯函数 `mainViewCountOf(info: unknown): number`（非对象、缺 `retainedBy`、`mainView` 非数值一律记 0——信号缺席只影响「挂载即隐藏」这一增强，卡片自身 TTL 与手动关闭路径不受影响）；卡片注入面 `visibilityFor(sessionId)` 在渲染期 `ctx.get('sessions')` 延迟解析并 try/catch 包裹，服务缺席返回 `undefined`，卡片跳过隐藏检查。

备选「读取 ui-conversation 内部活跃会话状态」无公开 API 且耦合实现细节，弃；DOM 观测脆，弃。

### D3 通知挂载点：`conversation.input.overlay`

选它而非备选的理由：composer 上方正是用户视线落点；session/draft 作用域保证卡跟着「该会话的输入区」走（空会话首屏也有 composer，即也有此 slot 实例）；官方命令补全弹层同位（`order: 1`），本条目取 `order: 10` 排其后避免层叠抢占。`shell.overlay` 是对话框语义（删除确认在用），toast 塞进去要么模态遮罩要么语义错位，弃；`conversation.composer.dock` 是 ambient 常驻行（徽章在用），不适合瞬时通知，弃。

组件按自身 sessionId 从 store 读通知；无通知渲染 `null`。

### D4 通知模型：插件内共享 store，每会话至多一张卡

store 持 `Map<sessionId, 通知>`，通知为 `{commandName, kind, text, at, seq}`；同会话新命令到达**替换**旧卡（新替旧，不排队——空会话连续执行多条命令时只关心最新结果，旧结果已在会话流落盘）。store 不持久化，刷新即空（会话流才是持久记录）。

消失路径按结果类型分治：

- **成功卡**：组件内 `setTimeout` 到期（10s）调 store 清除；**展开期间冻结计时，收起后恢复剩余时间**（读长清单不被打断）；
- **错误卡**：不设自动消失，仅手动关闭（错误提示常需照着改输入）；
- **统一隐藏规则**：卡片渲染条件是「该会话主视图引用计数为零」的**动态订阅**（D2 的 `retainInfo` 快照）——会话视图挂载（如 prompt 型命令提交后模型轮次开始）时计数变正，卡片立即隐藏，不分成败、无需用户操作。该规则天然化解 prompt 型命令的「已提交」卡残留问题。

组件同时订阅 store 与可见性快照，任一变化触发重渲染；计数从 0 到正的跳变即隐藏时机。

### D5 卡片形态：摘要行 + 可展开全文

折叠态一行：命令名 + 结果首行（超长截断加 `…`）；点击展开为限高滚动区渲染全文（`pre-wrap`），长清单（如 25 个 skill）不丢失。错误卡以错误色边框/图标区分。展开冻结自动消失计时（D4），用户需要长久留存时可在会话流展开持久节点。

### D6 文案与词典：沿用 `locale: NS` 席位

新增词条（标题「命令已执行」、展开/收起、关闭按钮 aria 等）进 `locales.ts` 的 zh/en 双语；既有 `locale-parity` 测试自动守恒。

### D7 关键假设与验证路径

方案依赖一个未证假设：**空会话首屏执行命令时，`session/create` 产生的会话视图（含 `conversation.input.overlay` 实例）绑定该新 sessionId**（抓包显示 execute 的 agentId 即 create 返回 id，且欢迎视图 composer 属于该会话，推断成立）。实施第一个任务即以真机 GUI 验证；若证伪（draft 实例拿到的是 draft id 而非会话 id），fallback 改挂 `shell.overlay` 非模态卡片（不依赖会话作用域），探针与判定逻辑不变。

### D8 测试策略

- 纯逻辑单测：主视图计数投影（防御解构）、store（新替旧、TTL 清除、关闭、宽松解构丢弃）、摘要截断；
- 组件测试：通知卡渲染/展开/关闭/错误样式（沿用 badge/dialog 的 RTL 模式与 `test/stubs`）;
- 既有 `client-apply.test.ts` 扩展：apply 注册了两个新 slot 条目、注入词典、无事件时行为不变；
- `bundle.test.ts` 扩展：产物包含新组件。

## Risks / Trade-offs

- **R1 D7 假设证伪**：fallback 已定（shell.overlay 非模态），可见性信号/判定/store 全部复用，成本限于挂载点一处；
- **R2 上游事件负载演化**（0.3.x 未知）：宽松解构 + 丢弃策略保证最坏只是「回到现状」，不会崩；
- **R3 与命令补全弹层同位层叠**：order 靠后 + 卡片不拦截焦点；实施时以真机视觉验收，必要时调 order；
- **R4 多标签/多窗口同会话**：每实例各自展示通知（幂等）；探针集合 add/remove 天然平衡；
- **取舍**：每会话只留最新一张卡（D4）意味着连续两条命令只见到后一条——空会话场景下可接受（前一条已在会话流落盘，且通知是兜底不是归档）。
