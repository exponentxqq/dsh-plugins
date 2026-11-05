# Spec Delta

## MODIFIED Requirements

### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：会话面板入口 SHALL 注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（list、scope session、无专属 owner props），工作区默认档分节入口 SHALL 注册在统一工作区配置弹窗的分节座位 `workspace-config.section`（list、scope root，见「工作区默认档分节」要求；该座位由 workspace-config 插件声明，本插件对它零运行时依赖）；面板 SHALL 提供工具清单（MCP 服务器整组/单工具、skill 整档开关与逐 skill 行、内置工具分组）、会话级开关切换、用户级默认档编辑、工作区默认档分区与关闭集展示。面板与分节入口的读与写 SHALL 走 Connection RPC 通道（`/session-tool-toggle`），SHALL NOT 在浏览器半另建状态存储：面板与 `/tools` 命令面 SHALL 共用同一 per-session 状态、同一掩码/遮蔽层与同一持久化记录。面板 SHALL NOT 提供插件配置键（如 `storage`、`protectedTools`）的编辑面。全部 UI 文案 SHALL 来自插件自有 locale 命名空间；宿主响应 SHALL 只携带稳定失败码与结构化事实，SHALL NOT 作为唯一文案来源。面板与 `/tools` 命令面的工具清单宇宙 SHALL 只含本会话有效工具：本会话可见工具（`tools.schemas(agent)`，与 `/inventory` 同一读数语义）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在清单里，否则条目关闭即消失、无法再打开）；被其他作用域（如 project-mcp 的工作区隔离）隐藏在宿主全局层注册的名字 SHALL NOT 出现在清单、分组计数或任何「被隐藏」类计数与徽标中。用户级默认档编辑区与工作区默认档分节/面板分区 SHALL 以分组开关界面呈现（与工具清单同一分组形态：MCP 服务器组 + 行开关、技能整档开关与逐 skill 行、内置工具行；面板两分区默认折叠、标题行带计数摘要；分节保留下拉、面板分区无下拉），其清单宇宙 SHALL 与面板同一读数（本会话 `scoped ∪ carried`；为非当前工作区编辑时沿用当前会话视角的清单）；行/组开关状态 SHALL 表达「该地址是否在目标默认档中」（开 = 新会话默认可用，立即写入）；保护名单与注册表保留名行 SHALL 禁用并给出理由；整组地址在档中时组内行 SHALL 不可切换并给出说明；技能服务缺席时技能行区 SHALL 降级提示而 `tool:skill` 组开关保留；档内不在清单中的地址 SHALL 只以「残留」形式提供移除；两编辑面 SHALL NOT 提供自由文本地址添加——跨清单地址的新关 SHALL 走 `/tools default off` / `/tools workspace off` 命令（后者只作用本会话所属工作区；为其他工作区预置此类关闭项需编辑 `workspaces.json`）。

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

- **WHEN** 会话 A 已创建，用户在面板的「用户级默认档」分区展开后关闭 `mcp:figma` 的组开关
- **THEN** 宿主按 `mcp:figma` 地址写入默认档文件（`off`），返回新的默认档视图与分组清单；会话 A 的关闭集与可见工具面**不变**；面板显示「只影响之后新建的会话」，且新会话按新默认档初始化

#### Scenario: RPC 不可用时的降级表现

- **WHEN** 浏览器半加载但通道不可达（宿主半未挂载 / 非 Web 组合 / 传输失败）
- **THEN** 入口按钮仍渲染；打开后显示「无法连接到 dsh 主进程」的降级状态且不展示任何开关；命令面能力不受影响；会话与界面均不崩溃

#### Scenario: 会话不在宿主中运行

- **WHEN** 用户打开一个已归档（或已结束）会话的头部按钮
- **THEN** 面板以 `session-not-live` 的解释性状态呈现（不提供开关），不发修改类请求，界面不报错

#### Scenario: 面板逐 skill 开关只影响模型可见性

- **WHEN** 用户在面板「技能」组关闭 `openspec-propose`，且该技能当前模型可见
- **THEN** 面板该行变为关闭态并显示真实名称与描述；宿主写入 `skill:openspec-propose`；下一模型步骤的技能目录不再包含它，而 `/` 菜单仍列出并标注为仅限用户调用

#### Scenario: 面板清单只含本会话有效工具（scoped ∪ carried）

- **WHEN** 另一机制（如 project-mcp 的工作区隔离）在宿主全局层注册了本会话不可见的 MCP 服务器，用户打开本插件的面板或执行 `/tools status`
- **THEN** 这些服务器 SHALL NOT 出现在面板的工具分组与 `/tools status` 的可关对象计数里；清单宇宙 = 本会话可见工具（`tools.schemas(agent)`）∪ 本会话已生效的关闭集（已关条目 SHALL 保留在面板里，否则关闭即消失、无法再打开）；宿主 SHALL NOT 返回「被其他作用域隐藏」的计数或徽标字段

#### Scenario: 用户级默认档编辑区按分组开关渲染且无添加入口

- **WHEN** 用户展开面板「用户级默认档」分区（默认折叠，标题行带「默认关 M · 残留 K」摘要），目标档含清单外地址 `mcp:zzz`
- **THEN** 分组清单按本会话工具宇宙渲染，行/组开关提交 `off`/`on`（地址即组/行地址），三计数行与残留区在场；`mcp:zzz` 只出现在残留区且只能移除；界面不存在任何自由文本地址添加入口，CLI 兜底提示（`/tools default off`）在场

#### Scenario: 工作区默认档分节与分区的分组开关

- **WHEN** 目标工作区档含 `mcp:zzz`（不在本会话清单）与 `mcp:a`（在清单），用户在统一弹窗分节或面板分区展开该 MCP 组
- **THEN** 清单内 `mcp:a` 的组开关与行开关可用（状态表达是否在档）；`mcp:zzz` 出现在残留区且只能移除；保护名单与保留名行禁用并给出理由；界面无添加入口，CLI 兜底提示在场

#### Scenario: 整组默认关时组内行不可切换

- **WHEN** 目标工作区档含整组地址 `mcp:a`
- **THEN** 该组组开关呈关闭态，组内所有行开关禁用并带「整组默认关」说明标签；组开关仍可重新开启

#### Scenario: 切换工作区后分组清单仍可用

- **WHEN** 用户在分节下拉从当前工作区切换到其他已登记工作区（该响应不携带新宇宙）
- **THEN** 分组清单继续可用（宇宙沿用当前会话视角），行/组开关写入切换后工作区对应的键；该工作区私有的 project-mcp 工具行不出现（已知近似，文案与 README 说明）

#### Scenario: 持有者缺席时旧路径保留

- **WHEN** profile 未安装 workspace-config 插件（分节座位不存在）
- **THEN** 本插件在 footer 无任何入口注册；会话头部面板（含分组开关形态的默认档分区）与 `/tools` 命令面仍完整可用，GUI 无报错
