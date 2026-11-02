# Spec Delta

## MODIFIED Requirements

### Requirement: 开关对象粒度与地址文法

开关对象 SHALL 支持四类地址：`mcp:<server>`（整组：该服务器全部工具 schema 与其指令段一并移除）、`mcp:<server>::<tool 或尾部 * 通配>`（单工具：仅移除匹配的 schema，指令段保留）、`tool:<name>`（内置工具；`skill` SHALL 归一为 `tool:skill`，关闭后 skill 目录消息一并停发）、`skill:<name>`（单个 skill 的模型可见性开关，见「技能级开关（仅模型可见性）」要求；`skill:*` SHALL 归一为整档 `tool:skill`）。掩码名单 SHALL 只从活注册表推导（服务器未加载/已断线时保持意图、跳过执行、不抛错）；`skill:<name>` SHALL NOT 进入工具掩码名单。

#### Scenario: 单工具通配关闭

- **WHEN** 用户执行 `/tools off "mcp:yunxiao::list_*"` 且该前缀匹配当前注册表中 yunxiao 的 3 个工具
- **THEN** 恰好这 3 个工具的 schema 被移除，yunxiao 其余工具与指令段保持可见

#### Scenario: 指向未加载服务器的开关被容忍

- **WHEN** 关闭集中含有 `mcp:<server>`，且该服务器此刻不在注册表（未连接或已断线）
- **THEN** 不抛错；服务器后续上线时其工具面按关闭集被掩蔽（意图保持）

#### Scenario: skill 整档关闭

- **WHEN** 用户执行 `/tools off skill`
- **THEN** `skill` 工具不可见且 skill 目录消息停发（按 dsh-tool-skill 既有语义追加空目录停用旧名称）；执行 `/tools on skill` 后目录恢复发布

#### Scenario: 技能地址独立于工具掩码

- **WHEN** 用户执行 `/tools off skill:openspec-propose`
- **THEN** 工具注册表中无任何工具名被掩蔽（工具计数不变），该 skill 从模型可见面移除（见「技能级开关」）

### Requirement: 用户级默认档

插件 SHALL 提供用户级默认档文件（`$DSH_HOME/session-tool-toggle/defaults.json`，内容为组地址数组），`/tools default` 子命令 SHALL 支持查看与增删（写入原子替换，损坏文件降级为空档并告警）；Web 配置界面 SHALL 提供同一默认档的查看与增删，SHALL 走同一校验与原子写路径；面板对默认档的任何修改 SHALL NOT 追溯已存在会话。新会话（含子代理与队友会话）创建时 SHALL 按「用户级默认档 ∪ 该会话所属工作区的工作区级默认档」拍快照作为初始关闭集（见「工作区级默认档」要求）；默认档后续变更 SHALL NOT 追溯已存在会话。主会话的会话级开关 SHALL NOT 传播给其派生的子代理/队友（各会话独立快照）。

#### Scenario: 新会话按默认档初始化

- **WHEN** 默认档含 `["mcp:yunxiao", "mcp:figma"]`，且用户创建新会话
- **THEN** 新会话首步装配前 yunxiao 与 figma 已被掩蔽（无中途 KV 缓存重建），`/tools status` 显示快照来源为默认档

#### Scenario: 默认档变更不追溯

- **WHEN** 会话 A 已按旧默认档创建，用户随后通过 `/tools default off` 修改默认档
- **THEN** 会话 A 的关闭集不变；仅之后创建的会话采用新默认档

#### Scenario: 子代理拍默认档快照但不继承会话开关

- **WHEN** 主会话已额外关闭 `mcp:dbx`（会话级），且派生一个子代理
- **THEN** 子代理按默认档拍快照（不含 dbx 的会话级关闭），dbx 对子代理可见

### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：会话面板入口 SHALL 注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（list、scope session、无专属 owner props），侧栏入口 SHALL 注册在 `sidebar.footer.action`（list、scope root，见「工作区配置入口」要求）；面板 SHALL 提供工具清单（MCP 服务器整组/单工具、skill 整档开关与逐 skill 行、内置工具分组）、会话级开关切换、用户级默认档编辑、工作区默认档分区与关闭集展示。面板与侧栏入口的读与写 SHALL 走 Connection RPC 通道（`/session-tool-toggle`），SHALL NOT 在浏览器半另建状态存储：面板与 `/tools` 命令面 SHALL 共用同一 per-session 状态、同一掩码/遮蔽层与同一持久化记录。面板 SHALL NOT 提供插件配置键（如 `storage`、`protectedTools`）的编辑面。全部 UI 文案 SHALL 来自插件自有 locale 命名空间；宿主响应 SHALL 只携带稳定失败码与结构化事实，SHALL NOT 作为唯一文案来源。

#### Scenario: 入口在会话头部渲染

- **WHEN** Web 组合加载了本插件的浏览器半，且会话主视图头部已挂载
- **THEN** 头部工具区出现本插件的图标按钮（`order` 位于官方三项之后），带可读的 `aria-label` 与 `aria-expanded`；点击后打开面板，面板标题与分区文案来自本插件 locale

#### Scenario: 面板切换等效命令面

- **WHEN** 用户在面板里关闭 MCP 服务器 `yunxiao` 的整组开关
- **THEN** 宿主按 `mcp:yunxiao` 地址写入关闭集（与 `/tools off mcp:yunxiao` 同一状态与同一记录），响应带回变更后的快照与新可见计数；下一次模型步骤该服务器工具不可见且指令段消失；随后在命令面执行 `/tools status` 显示同一关闭集

#### Scenario: 保护名单在面板上不可切换

- **WHEN** 面板渲染内置工具清单，其中含 `bash`
- **THEN** `bash` 行的开关为禁用态并给出保护理由的 `title`，点击不发出任何 RPC 请求；即便伪造请求，宿主也以 `protected` 拒绝且不改变状态

#### Scenario: 默认档编辑不追溯当前会话

- **WHEN** 会话 A 已创建，用户在面板的默认档区添加 `mcp:figma` 并保存
- **THEN** 宿主写入默认档文件、返回新的默认档视图，会话 A 的关闭集与可见工具面**不变**；面板显示「只影响之后新建的会话」，且新会话按新默认档初始化

#### Scenario: RPC 不可用时的降级表现

- **WHEN** 浏览器半加载但通道不可达（宿主半未挂载 / 非 Web 组合 / 传输失败）
- **THEN** 入口按钮仍渲染；打开后显示「无法连接到 dsh 主进程」的降级状态且不展示任何开关；命令面能力不受影响；会话与界面均不崩溃

#### Scenario: 会话不在宿主中运行

- **WHEN** 用户打开一个已归档（或已结束）会话的头部按钮
- **THEN** 面板以 `session-not-live` 的解释性状态呈现（不提供开关），不发修改类请求，界面不报错

#### Scenario: 面板逐 skill 开关只影响模型可见性

- **WHEN** 用户在面板「技能」组关闭 `openspec-propose`，且该技能当前模型可见
- **THEN** 面板该行变为关闭态并显示真实名称与描述；宿主写入 `skill:openspec-propose`；下一模型步骤的技能目录不再包含它，而 `/` 菜单仍列出并标注为仅限用户调用

## ADDED Requirements

### Requirement: 技能级开关（仅模型可见性）

`skill:<name>` 地址 SHALL 只改变该 skill 在本会话的模型可见性：关闭后模型技能目录 SHALL 不再包含该 skill、`skill` 工具加载该名称 SHALL 返回可读拒绝；用户显式 `/name` 调用 SHALL 保持可用（该 skill 仍出现在 `/` 菜单并标注为仅限用户调用）。开关 SHALL 只作用于本会话（agent 作用域），SHALL NOT 修改磁盘上的 SKILL.md、SHALL NOT 影响其他会话；一条命令多地址仍 SHALL 全有或全无；指向不存在 skill 的地址 SHALL 容忍（保持意图、跳过执行、不抛错）；`skills` 服务缺席时 SHALL 降级为只记录意图并在面板与日志中可观测。

#### Scenario: 关闭后模型目录与工具同步失效

- **WHEN** 用户执行 `/tools off skill:openspec-propose`，且下一步模型步骤发生
- **THEN** 该步骤的技能目录（持久目录消息的替换）不含 `openspec-propose`，其余技能不变；模型调用 `skill` 工具加载该名称得到可读拒绝；同 profile 其他会话的技能目录不变

#### Scenario: 用户手动调用保留

- **WHEN** `skill:openspec-propose` 已在关闭集中，用户输入 `/openspec-propose` 并发送
- **THEN** 该 skill 的正文按既有用户显式注入语义生效，模型收到完整指令（用户路径不受模型可见性开关影响）

#### Scenario: 未安装技能与降级

- **WHEN** 关闭集包含一个当前未安装的 `skill:<name>`，或宿主未挂载 `skills` 服务
- **THEN** 不抛错；面板将其显示为意图项并提示「当前无效果」；`/tools status` 如实反映未命中计数

### Requirement: 工作区级默认档

插件 SHALL 提供工作区级默认档文件（`$DSH_HOME/session-tool-toggle/workspaces.json`，`config` 可覆盖为绝对路径），以工作区规范路径为键（会话 cwd 的 realpath；`workspaceRegistry` 可用时以其 `path` 为准）保存该工作区新会话的初始关闭集；未登记为工作区的目录 SHALL 以 canonical cwd 为键（不要求先登记）。文件 SHALL 原子写入，损坏或半写时降级为空档并告警。会话创建时初始关闭集 SHALL 为「用户级默认档 ∪ 本工作区档」（并集：工作区只能追加关闭，不能反开用户级关闭项）；工作区档变更 SHALL NOT 追溯已存在会话；`/tools reset` SHALL 回到这份合并快照；工作区无法归属（cwd 缺失或 realpath 失败）时 SHALL 只用用户级默认档且不报错。

#### Scenario: 新会话按工作区档合并生效

- **WHEN** 工作区 W 的档含 `mcp:a` 与 `skill:x`，用户在工作区 W 中新建会话
- **THEN** 该会话首步装配前两者均已生效（无中途 KV 缓存重建），`/tools status` 显示快照为用户档 ∪ 工作区档；其他工作区的新会话不受 W 档影响

#### Scenario: 工作区档变更不追溯既有会话

- **WHEN** 会话 A 已在工作区 W 中创建，用户随后修改 W 的工作区档
- **THEN** 会话 A 的关闭集与可见工具面不变；仅之后在 W 中创建的会话采用新档

#### Scenario: 损坏文件降级

- **WHEN** `workspaces.json` 不可解析、字段类型错误或不可读
- **THEN** 该文件降级为空档并记录一条告警，会话照常创建、只用用户级默认档

#### Scenario: 工作区无法归属时退化

- **WHEN** 会话 cwd 缺失，或其 realpath 失败（例如目录已被删除）
- **THEN** 只用用户级默认档播种，不抛错、不阻塞会话创建，面板标注未归属

#### Scenario: 未登记目录按 canonical cwd 承载配置

- **WHEN** 会话 cwd 是一个尚未「添加为工作区」的现存目录，且该目录的 canonical cwd 在 `workspaces.json` 中有条目
- **THEN** 该目录的新会话按该条目合并播种，面板与入口把它显示为未登记工作区（键为规范路径）

### Requirement: 工作区配置入口

Web 组合下插件 SHALL 在侧栏底部动作区（`sidebar.footer.action`）提供工作区默认档入口：点击 SHALL 打开工作区默认档编辑对话框，默认选中当前会话所属工作区，并 SHALL 允许切换到其他已登记工作区后编辑；面板「工作区默认档」分区 SHALL 提供同一编辑能力（作用于当前会话所属工作区）。全部入口 SHALL 只读写本插件的配置文件，SHALL NOT 接受任意路径写入。上游工作区行 `...` 菜单入口不在本变更范围：当前 DSH 版本（0.2.1-rc.2，直至 0.2.2-alpha.2）未提供该座位，由后续变更在上游提供座位后实现。

#### Scenario: 侧栏底部入口可用

- **WHEN** Web 组合加载了本插件浏览器半，用户点击侧栏底部入口
- **THEN** 打开工作区默认档编辑对话框并默认选中当前会话所属工作区；切换到其他已登记工作区后保存，写入的是该工作区对应的键

#### Scenario: 面板工作区分区可用

- **WHEN** 用户打开会话头部工具面板，面板渲染「工作区默认档」分区
- **THEN** 分区显示当前会话所属工作区的键、文件路径、已关闭项与预期管理文案；保存后写入该工作区对应的键，且当前会话的关闭集**不变**
