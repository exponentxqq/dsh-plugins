# dsh-session-tool-toggle Specification

## Purpose
会话级工具面开关能力：让每个 DSH 会话能独立关闭不需要的模型可见工具（MCP 服务器整组/单工具、内置工具、skill 整档），即时降低每步请求的工具 schema 与指令段 token 成本，且开关状态随会话日志持久并在 fork/resume 时保持。交互面包含零 token 的命令通道与 Web 组合下的图形化配置面板，两者共享同一状态与同一持久化记录。

## Requirements

### Requirement: 会话级开关语义

插件 SHALL 在每个会话（agent）上独立维护一组关闭集（组地址列表），关闭的对象在该会话后续每次模型步骤中不可见（schema 被掩蔽）且被调用时拒绝（守卫返回可读理由）；开关变更 SHALL 在下一次模型步骤生效。开关 SHALL 只影响本会话的作用域，不影响同 profile 的其他会话。与其他掩码机制（如 project-mcp 的工作区隔离）SHALL 取交集组合：被其他机制隔离掉的工具，本能力 SHALL NOT 使其重新可见。Web 配置界面与 `/tools` 命令面 SHALL 共用同一 per-session 关闭集、同一掩码层与同一持久化记录；两个入口的一次变更 SHALL 在下一次模型步骤同时生效。

#### Scenario: 会话内关闭 MCP 服务器组

- **WHEN** 用户在会话 A 中执行 `/tools off mcp:yunxiao`，且下一步模型步骤发生
- **THEN** 该会话可见工具计数减少 yunxiao 全部工具数（实测基线 70），渲染后的系统提示词不含 `### MCP server: yunxiao` 指令段；同 profile 的会话 B 可见工具面不变

#### Scenario: 被关闭工具的迟到调用被拒绝

- **WHEN** 会话历史中含有对某已关工具的调用记录，且模型在关闭后再次调用该工具名
- **THEN** 调用被守卫拒绝并返回包含工具名与关闭原因的可读错误，会话不崩溃

#### Scenario: 开关不越界工作区隔离

- **WHEN** 某工具已被 project-mcp 按工作区归属隔离（对当前会话不可见），且用户执行 `/tools on` 尝试恢复其所属服务器
- **THEN** 该工具对当前会话仍不可见（交集语义），命令回执如实反映

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

### Requirement: 内置工具开关与保护名单

`tool:<name>` 地址 SHALL 适用于内置工具，但存在硬保护名单（自救与文件操作基础工具，基线：bash/pwsh/read/write/edit/glob/grep，只可追加不可移除），名单内工具 SHALL 拒绝关闭并返回保护理由；该拒绝 SHALL 由宿主在解析期统一执行，命令面与 Web 配置界面 SHALL 得到同一结果；Web 配置界面 SHALL 将名单内工具呈现为不可切换。名单外内置工具（如任务板、便签、日程、团队任务等大 schema 系列）SHALL 可关闭。

#### Scenario: 保护名单拒关

- **WHEN** 用户执行 `/tools off tool:bash`
- **THEN** 命令返回保护名单拒绝理由，bash 保持可见可调用

#### Scenario: 关闭大 schema 内置工具系列

- **WHEN** 用户执行 `/tools off tool:task_board_create ...`（名单外内置工具）
- **THEN** 对应工具 schema 从本会话移除，守卫拒绝后续调用

### Requirement: 用户级默认档

插件 SHALL 提供用户级默认档文件（`$DSH_HOME/session-tool-toggle/defaults.json`，内容为组地址数组），`/tools default` 子命令 SHALL 支持查看与增删（写入原子替换，损坏文件降级为空档并告警）；用户级默认档 SHALL 只由 `/tools default` 子命令编辑，Web 界面 SHALL NOT 提供该档的图形编辑面（会话工具面与统一工作区配置页面均不提供）。新会话（含子代理与队友会话）创建时 SHALL 按「用户级默认档 ∪ 该会话所属工作区的工作区级默认档」拍快照作为初始关闭集（见「工作区级默认档」要求）；默认档后续变更 SHALL NOT 追溯已存在会话。主会话的会话级开关 SHALL NOT 传播给其派生的子代理/队友（各会话独立快照）。

#### Scenario: 新会话按默认档初始化

- **WHEN** 默认档含 `["mcp:yunxiao", "mcp:figma"]`，且用户创建新会话
- **THEN** 新会话首步装配前 yunxiao 与 figma 已被掩蔽（无中途 KV 缓存重建），`/tools status` 显示快照来源为默认档

#### Scenario: 默认档变更不追溯

- **WHEN** 会话 A 已按旧默认档创建，用户随后通过 `/tools default off` 修改默认档
- **THEN** 会话 A 的关闭集不变；仅之后创建的会话采用新默认档

#### Scenario: 子代理拍默认档快照但不继承会话开关

- **WHEN** 主会话已额外关闭 `mcp:dbx`（会话级），且派生一个子代理
- **THEN** 子代理按默认档拍快照（不含 dbx 的会话级关闭），dbx 对子代理可见

### Requirement: 状态持久化与 fork/resume

开关状态变更 SHALL 以整值事件持久化（当前完整关闭集，而非增量），会话 resume 后状态 SHALL 保持，fork 的新会话 SHALL 继承 fork 点关闭集（此后各会话独立演化）。持久化通道 SHALL 具备可切换的第二实现（自有存储域）与内存态降级：主通道（会话日志插件记录）不可用时 SHALL 自动降级且功能不缺失（仅丢失 resume 保持），降级事实 SHALL 在命令回执或日志中可观测。

#### Scenario: resume 保持开关状态

- **WHEN** 会话关闭 yunxiao 后退出，随后 resume 该会话
- **THEN** yunxiao 对该会话保持关闭，`/tools status` 显示同一关闭集

#### Scenario: fork 继承 fork 点状态

- **WHEN** 会话 A（关闭集含 yunxiao）fork 出会话 B，随后 A 又关闭 figma
- **THEN** 会话 B 的关闭集保持 fork 点状态（含 yunxiao、不含 figma），两会话各自独立演化

#### Scenario: 持久化降级可观测

- **WHEN** 会话日志插件记录通道写入失败（身份断言失败或写入抛错）
- **THEN** 开关在本会话内继续生效（内存态），命令回执或日志明示「本会话状态不会跨 resume 保持」

### Requirement: Web 配置界面（入口注册）

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面入口：会话面板入口 SHALL 注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（list、scope session、无专属 owner props）；工作区默认档分节入口 SHALL 注册在统一工作区配置弹窗的分节座位 `workspace-config.section`（list、scope root，见「工作区默认档分节」要求；该座位由 workspace-config 插件声明，本插件对它零运行时依赖）。全部 UI 文案 SHALL 来自插件自有 locale 命名空间。

#### Scenario: 入口在会话头部渲染

- **WHEN** Web 组合加载了本插件的浏览器半，且会话主视图头部已挂载
- **THEN** 头部工具区出现本插件的图标按钮（`order` 位于官方三项之后），带可读的 `aria-label` 与 `aria-expanded`；点击后打开面板，面板标题与三卡文案来自本插件 locale

#### Scenario: 持有者缺席时旧路径保留

- **WHEN** profile 未安装 workspace-config 插件（分节座位不存在）
- **THEN** 本插件在 footer 无任何入口注册；会话头部面板与 `/tools` 命令面仍完整可用，GUI 无报错

### Requirement: Web 配置界面（面板构成）

会话面板正文 SHALL 以三卡构成：**概要卡**（会话状态事实行——会话标识 / 创建时间 / 创建时快照条数 / 持久化通道——与计数摘要）、**清单卡**（全局过滤 + 分组开关清单：MCP 服务器组 / 技能组 / 内置工具组，行含描述次行）、**命令卡**（会话级命令模板）；Modal footer SHALL 提供「恢复创建时快照」动作区（两段式确认）。面板 SHALL NOT 提供用户级默认档编辑面，SHALL NOT 提供工作区默认档编辑面；宿主响应 SHALL 只携带稳定失败码与结构化事实，SHALL NOT 作为唯一文案来源。

#### Scenario: 保护名单在面板上不可切换

- **WHEN** 面板渲染内置工具清单，其中含 `bash`
- **THEN** `bash` 行的开关为禁用态并给出保护理由的 `title`，点击不发出任何 RPC 请求；即便伪造请求，宿主也以 `protected` 拒绝且不改变状态

#### Scenario: 面板不提供默认档编辑面

- **WHEN** 用户打开会话工具面面板
- **THEN** 界面不含用户级默认档与工作区默认档的编辑区（无默认档路径行、默认档开关清单或默认档清空入口）；关闭集地址只能通过清单开关、残留区或 `/tools off` 命令改变

### Requirement: 面板读写通道与会话状态同源

面板与分节入口的读与写 SHALL 走 Connection RPC 通道（`/session-tool-toggle`），SHALL NOT 在浏览器半另建状态存储：面板与 `/tools` 命令面 SHALL 共用同一 per-session 状态、同一掩码/遮蔽层与同一持久化记录。面板 SHALL NOT 提供默认档（用户级/工作区级）编辑面，其读写面只有会话级 `panel` / `toggle` / `reset` 三个端点；工作区默认档的读写面归分节（`workspace` 端点，`{workspacePath}` 唯一寻址，响应不含工作区下拉候选列表）。面板 SHALL NOT 提供插件配置键（如 `storage`、`protectedTools`）的编辑面。

#### Scenario: 面板切换等效命令面

- **WHEN** 用户在面板里关闭 MCP 服务器 `yunxiao` 的整组开关
- **THEN** 宿主按 `mcp:yunxiao` 地址写入关闭集（与 `/tools off mcp:yunxiao` 同一状态与同一记录），响应带回变更后的快照与新可见计数；下一次模型步骤该服务器工具不可见且指令段消失；随后在命令面执行 `/tools status` 显示同一关闭集

#### Scenario: RPC 不可用时的降级表现

- **WHEN** 浏览器半加载但通道不可达（宿主半未挂载 / 非 Web 组合 / 传输失败）
- **THEN** 入口按钮仍渲染；打开后显示「无法连接到 dsh 主进程」的降级状态且不展示任何开关；命令面能力不受影响；会话与界面均不崩溃

#### Scenario: 会话不在宿主中运行

- **WHEN** 用户打开一个已归档（或已结束）会话的头部按钮
- **THEN** 面板以 `session-not-live` 的解释性状态呈现（不提供开关），不发修改类请求，界面不报错

#### Scenario: 面板逐 skill 开关只影响模型可见性

- **WHEN** 用户在面板清单卡技能组关闭 `openspec-propose`，且该技能当前模型可见
- **THEN** 该行变为关闭态并显示真实名称与描述；宿主写入 `skill:openspec-propose`；下一模型步骤的技能目录不再包含它，而 `/` 菜单仍列出并标注为仅限用户调用

#### Scenario: workspace 端点只接受工作区路径寻址

- **WHEN** 客户端以 `{sessionId}` 形态请求 `workspace` 端点
- **THEN** 宿主以 `bad-request` 拒绝（该寻址形态已随会话面板的工作区分区移除）；`{workspacePath}` 寻址的读/写正常，响应不含工作区下拉候选列表字段

### Requirement: 面板清单宇宙（scoped ∪ carried）

面板与 `/tools` 命令面的工具清单宇宙 SHALL 只含本会话有效工具：本会话可见工具（`tools.schemas(agent)`，与 `/inventory` 同一读数语义）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在清单里，否则条目关闭即消失、无法再打开）；被其他作用域（如 project-mcp 的工作区隔离）隐藏在宿主全局层注册的名字 SHALL NOT 出现在清单、分组计数或任何「被隐藏」类计数与徽标中。清单卡 SHALL 提供全局过滤（匹配名称 / 地址 / 描述 / 组键；无匹配的分组隐藏、组保持展开）与行详情（名称下方描述次行；技能行另附调用方式与来源标签）。关闭集中不在清单宇宙的地址 SHALL 以残留区呈现且可开启（等价于对该地址执行开启）。整组地址在关闭集时组内行 SHALL 呈关闭且不可切换并标注「整组已关」。

#### Scenario: 面板清单只含本会话有效工具（scoped ∪ carried）

- **WHEN** 另一机制（如 project-mcp 的工作区隔离）在宿主全局层注册了本会话不可见的 MCP 服务器，用户打开本插件的面板或执行 `/tools status`
- **THEN** 这些服务器 SHALL NOT 出现在面板的工具分组与 `/tools status` 的可关对象计数里；清单宇宙 = 本会话可见工具（`tools.schemas(agent)`）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在面板里，否则关闭即消失、无法再打开）；宿主 SHALL NOT 返回「被其他作用域隐藏」的计数或徽标字段

#### Scenario: 残留地址可开启

- **WHEN** 关闭集含服务器已卸载的 `mcp:zzz`（不在清单宇宙），用户在残留区点击其「开启」入口
- **THEN** 宿主按 `mcp:zzz` 地址执行开启，关闭集不再含它；残留区随下次读数更新

#### Scenario: 整组关闭时组内行按实际不可用呈现

- **WHEN** 会话关闭集含整组地址 `mcp:a`，用户展开该 MCP 组
- **THEN** 组开关呈关闭态，组内所有行开关亦呈关闭态且禁用并带「整组已关」说明标签；组开关仍可重新开启

### Requirement: 默认档编辑面的分组开关形态

工作区默认档分节 SHALL 以分组开关界面呈现（MCP 服务器组 + 行开关、技能整档开关与逐 skill 行、内置工具行；标题行带计数摘要），其清单宇宙 SHALL 按编辑面所处入口取读数：工作区默认档分节（统一「工作区配置」页面形态）按**工作区宇宙**取读数（见「工作区默认档页面的工作区宇宙」要求）。分节与分区 SHALL NOT 各自携带工作区选择控件（页面形态的选择框由页面壳唯一提供）。行/组开关状态 SHALL 表达「该地址是否在目标默认档中」（开 = 新会话默认可用，立即写入）；两编辑面 SHALL NOT 提供自由文本地址添加——跨清单地址的新关 SHALL 走 `/tools default off` / `/tools workspace off` 命令（后者只作用本会话所属工作区；为其他工作区预置此类关闭项需编辑 `workspaces.json`）。

#### Scenario: 默认档编辑不追溯当前会话

- **WHEN** 会话 A 已创建，用户执行 `/tools default off mcp:figma`
- **THEN** 宿主按 `mcp:figma` 地址写入默认档文件（`off`），`/tools default status` 显示新档；会话 A 的关闭集与可见工具面**不变**；仅之后新建的会话按新默认档初始化

#### Scenario: 用户级默认档编辑区按分组开关渲染且无添加入口

- **WHEN** 用户在 Web 界面寻找用户级默认档的编辑入口（会话工具面面板与统一「工作区配置」页面）
- **THEN** 两处均不存在用户级默认档编辑区——无分组开关清单、无三计数、无残留区、无任何自由文本地址添加入口；跨清单地址的新关与移除 SHALL 走 `/tools default off <地址>` / `/tools default on <地址>` 命令（命令回执含残留地址提示）

#### Scenario: 工作区默认档分节与分区的分组开关

- **WHEN** 目标工作区档含 `mcp:zzz`（不在清单宇宙）与 `mcp:a`（在清单宇宙），用户在统一配置页面的工作区默认档分节展开该 MCP 组
- **THEN** 清单内 `mcp:a` 的组开关与行开关可用（状态表达是否在档）；`mcp:zzz` 出现在残留区且只能移除；保护名单与保留名行禁用并给出理由；界面无添加入口，CLI 兜底提示在场；分节清单按工作区宇宙渲染

#### Scenario: 切换工作区后分组清单仍可用

- **WHEN** 用户在统一配置页面把工作区选择框从当前会话所属工作区切换到其他已登记工作区
- **THEN** 分节按切换后工作区重新挂载，宿主响应携带该工作区的工作区宇宙，分组清单继续可用且行/组开关写入切换后工作区对应的键

### Requirement: 工作区默认档页面的工作区宇宙

统一「工作区配置」页面的「工作区默认档」分节 SHALL 以**工作区宇宙**渲染分组开关清单：宿主对 `{workspacePath}` 寻址的读/写响应 SHALL 携带按目标工作区现算的宇宙——MCP 与内置工具取全局工具注册表（未受限并集），技能取该工作区路径作用域的技能快照；归组与页面呈现细节见下列场景。宇宙读取失败或响应宇宙缺席时 SHALL 降级为残留管理并可刷新重试，写入不受影响。

#### Scenario: 页面分节按目标工作区渲染分组清单

- **WHEN** 用户在统一「工作区配置」页面选择已登记工作区 W 并进入「工作区默认档」分节
- **THEN** 宿主按 W 的规范路径现算宇宙并随读/写响应返回；分组清单按该宇宙渲染，行/组开关写入 W 对应的键

#### Scenario: MCP 归组沿用 /inventory 纪律且未归组只计数

- **WHEN** 全局注册表含公开名 `mcp__a__x`（可归组）与 `mcp__a.b__x`（server 名含 `.`，不满足 `/inventory` 归组文法）
- **THEN** 前者归入服务器 a 的分组并生成行开关；后者不出现在任何分组、不生成开关，页面在清单注记中显示「另有 N 个 MCP 工具名无法归组」；页面 SHALL NOT 以猜测的服务器名生成可切换地址

#### Scenario: 其他工作区的项目级服务器整组剔除并注记

- **WHEN** 全局注册表含其他工作区 W2 的项目级服务器（如 `mcp:devbox`），用户在 W 的页面分节查看清单
- **THEN** 该服务器整组不出现在 W 的清单中（按目标工作区根集归属过滤，与 project-mcp 的会话级隔离同向）；页面在清单注记中显示「另有 N 个其他工作区的项目级 MCP 服务器未列入」；归属读数瞬时失败时页面 SHALL 采用 fail-closed（项目级组暂不列入）而不是把别家工作区的服务器列为可开关项

#### Scenario: MCP 组级徽章标注来源与 token 计入

- **WHEN** 页面分节渲染 MCP 分组
- **THEN** 每组头以彩色徽章标注配置来源（用户级 = profile 配置、项目级 = 本工作区 `.dsh/mcp/`）与「计入对话上下文」（每个可见工具的参数 schema 与服务器指令计入每次请求）；徽章只出现在 MCP 组级，组下工具行 SHALL NOT 重复标注；徽章不改变开关语义

#### Scenario: 条目行展示详情

- **WHEN** 页面分节渲染工具行与技能行
- **THEN** 每行在名称下方展示描述次行；技能行另以标签展示「模型可调」（计入技能目录 token）或「仅用户调用 /<名称>」（对模型不可见、用户手动调用保留）与来源（项目/用户/内置）；标签不改变开关语义

#### Scenario: 宇宙读取失败降级

- **WHEN** 工作区宇宙读取抛错，或新页面连接旧宿主（响应 `universe` 缺席为 `null`）
- **THEN** 页面显示「工具清单暂时不可用」降级块与残留管理区，可点刷新重试；写入与残留移除不受影响

#### Scenario: 全局过滤与空档引导

- **WHEN** 用户在清单卡过滤框输入关键词，或目标工作区档为空
- **THEN** 过滤匹配名称/地址/描述/组键并覆盖 MCP 组行/技能/内置工具/残留，无匹配的分组隐藏、组保持展开且可折叠性暂停，残留判定仍以未过滤宇宙为基准；空档时呈现引导块（解释如何添加默认关及命令替代）；页面提供概要区刷新入口与命令兜底卡（目标工作区键注释 + `/tools workspace off <地址>` 可复制命令 + 「命令只写本会话所属工作区」边界说明）

### Requirement: 禁用与残留的呈现规则

保护名单与注册表保留名行 SHALL 禁用并给出理由；整组地址在档中时组内行 SHALL 不可切换并给出说明；技能服务缺席时技能行区 SHALL 降级提示而 `tool:skill` 组开关保留；档内不在清单中的地址 SHALL 只以「残留」形式提供移除。

#### Scenario: 整组默认关时组内行不可切换

- **WHEN** 目标工作区档含整组地址 `mcp:a`
- **THEN** 该组组开关呈关闭态，组内所有行开关禁用并带「整组默认关」说明标签；组开关仍可重新开启

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

### Requirement: 工作区默认档分节

Web 组合下插件 SHALL 在统一工作区配置弹窗（分节座位 `workspace-config.section`，由 workspace-config 插件声明）提供「工作区默认档」分节：分节 SHALL 提供工作区选择（默认选中当前会话所属工作区，SHALL 允许切换到其他已登记工作区后编辑，即保留不改当前会话也能预先设置任一工作区默认档的能力）。全部入口 SHALL 只读写本插件的配置文件，SHALL NOT 接受任意路径写入。上游工作区行 `...` 菜单入口不在本变更范围：当前基线 0.2.1-rc.5 未提供该座位（0.2.1-rc.2 至 0.2.2-alpha.2 实测同）；0.2.2-rc.1 已引入 `ctx.contextMenus` 的 workspace 目标贡献面，由后续变更在基线升至 0.2.2 后接入。

#### Scenario: 统一弹窗分节入口可用

- **WHEN** Web 组合加载了本插件浏览器半与 workspace-config 插件，用户点击 footer「工作区配置」入口并在弹窗导航中选择「工作区默认档」分节
- **THEN** 分节渲染工作区默认档编辑能力并默认选中当前会话所属工作区；切换到其他已登记工作区后保存，写入的是该工作区对应的键

#### Scenario: 面板工作区分区可用

- **WHEN** 用户要编辑某工作区的默认档（原会话工具面「工作区默认档」分区已移除）
- **THEN** 编辑入口为统一「工作区配置」页面的「工作区默认档」分节（会话工具面面板不含任何工作区默认档编辑区）；在分节保存后写入目标工作区对应的键，且任何已有会话的关闭集**不变**

#### Scenario: 持有者缺席时旧路径保留

- **WHEN** profile 未安装 workspace-config 插件（分节座位不存在）
- **THEN** 本插件在 footer 无任何入口注册；会话头部面板与 `/tools` 命令面仍完整可用，GUI 无报错
