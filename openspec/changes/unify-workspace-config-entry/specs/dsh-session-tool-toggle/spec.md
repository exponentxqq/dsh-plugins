# dsh-session-tool-toggle Specification（delta）

## MODIFIED Requirements

### Requirement: Web 配置界面

插件 SHALL 在 Web 组合下提供会话级工具面的图形化配置界面：会话面板入口 SHALL 注册在会话主视图头部工具区插槽 `conversation.session.header.utilities`（list、scope session、无专属 owner props），工作区默认档分节入口 SHALL 注册在统一工作区配置弹窗的分节座位 `workspace-config.section`（list、scope root，见「工作区默认档分节」要求；该座位由 workspace-config 插件声明，本插件对它零运行时依赖）；面板 SHALL 提供工具清单（MCP 服务器整组/单工具、skill 整档开关与逐 skill 行、内置工具分组）、会话级开关切换、用户级默认档编辑、工作区默认档分区与关闭集展示。面板与分节入口的读与写 SHALL 走 Connection RPC 通道（`/session-tool-toggle`），SHALL NOT 在浏览器半另建状态存储：面板与 `/tools` 命令面 SHALL 共用同一 per-session 状态、同一掩码/遮蔽层与同一持久化记录。面板 SHALL NOT 提供插件配置键（如 `storage`、`protectedTools`）的编辑面。全部 UI 文案 SHALL 来自插件自有 locale 命名空间；宿主响应 SHALL 只携带稳定失败码与结构化事实，SHALL NOT 作为唯一文案来源。

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

## REMOVED Requirements

### Requirement: 工作区配置入口

**Reason**: 侧栏 footer 座位组合级饱和（R5 裁定），工作区默认档入口从 `sidebar.footer.action` 侧栏底部动作区迁移到统一工作区配置弹窗的分节座位 `workspace-config.section`；原「点击侧栏底部入口打开对话框」的行为面随入口移除而消亡。

**Migration**: 由本变更 ADDED 的「工作区默认档分节」requirement 接替——同等编辑能力（含工作区切换）在统一弹窗分节中提供；未安装 workspace-config 插件时本插件无 footer 入口，会话头部面板「工作区默认档」分区与 `/tools` 命令面继续提供同一编辑能力。

## ADDED Requirements

### Requirement: 工作区默认档分节

Web 组合下插件 SHALL 在统一工作区配置弹窗（分节座位 `workspace-config.section`，由 workspace-config 插件声明）提供「工作区默认档」分节：分节 SHALL 提供工作区选择（默认选中当前会话所属工作区，SHALL 允许切换到其他已登记工作区后编辑，即保留不改当前会话也能预先设置任一工作区默认档的能力）；面板「工作区默认档」分区 SHALL 提供同一编辑能力（作用于当前会话所属工作区）。全部入口 SHALL 只读写本插件的配置文件，SHALL NOT 接受任意路径写入。上游工作区行 `...` 菜单入口不在本变更范围：当前基线 0.2.1-rc.5 未提供该座位（0.2.1-rc.2 至 0.2.2-alpha.2 实测同）；0.2.2-rc.1 已引入 `ctx.contextMenus` 的 workspace 目标贡献面，由后续变更在基线升至 0.2.2 后接入。

#### Scenario: 统一弹窗分节入口可用

- **WHEN** Web 组合加载了本插件浏览器半与 workspace-config 插件，用户点击 footer「工作区配置」入口并在弹窗导航中选择「工作区默认档」分节
- **THEN** 分节渲染工作区默认档编辑能力并默认选中当前会话所属工作区；切换到其他已登记工作区后保存，写入的是该工作区对应的键

#### Scenario: 面板工作区分区可用

- **WHEN** 用户打开会话头部工具面板，面板渲染「工作区默认档」分区
- **THEN** 分区显示当前会话所属工作区的键、文件路径、已关闭项与预期管理文案；保存后写入该工作区对应的键，且当前会话的关闭集**不变**

#### Scenario: 持有者缺席时旧路径保留

- **WHEN** profile 未安装 workspace-config 插件（分节座位不存在）
- **THEN** 本插件在 footer 无任何入口注册；会话头部面板与 `/tools` 命令面仍完整可用，GUI 无报错
