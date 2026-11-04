# dsh-project-mcp Specification

## Purpose
项目目录级 MCP 服务器配置：让 MCP 配置随项目目录走（`.dsh/mcp/` 每文件一台服务器），自动发现、加载、按工作区隔离工具可见性，并支持热重载——多项目并行时各会话只看得到自己项目的 MCP 工具。

本 capability 自 `dsh-web-ux-project-mcp` 迁移而来（split-project-mcp-plugin 变更）：需求语义逐字保留，仅交付主体由 `dsh-plugin-web-ux` 改为独立插件 `dsh-plugin-project-mcp`，使任何 profile（web / acp / headless）均可单独安装。

## Requirements

### Requirement: 扫描范围

插件 SHALL 扫描每个登记工作区主根下的 `.dsh/mcp/` 目录；经 multi-root 登记授予该主根的附加根目录下的 `.dsh/mcp/` SHALL 同样生效。附加根枚举服务缺席（对应插件未安装或未激活）时 MUST 静默降级为仅扫描主根并保持其余行为不变。

#### Scenario: 主根配置被加载

- **WHEN** 某工作区主根的 `.dsh/mcp/figma.yaml` 存在且有效
- **THEN** 该 MCP 服务器被加载

#### Scenario: 附加根配置同样生效

- **WHEN** 该工作区某附加根的 `.dsh/mcp/` 下存在有效配置
- **THEN** 该 MCP 服务器同样被加载

#### Scenario: 附加根枚举服务缺席

- **WHEN** multi-root 插件未安装或其 registry 服务不可用
- **THEN** 仅扫描各登记主根，不产生错误

### Requirement: 配置文件格式与 serverName

`.dsh/mcp/` 下后缀为 `.yaml`、`.yml`、`.json` 的每个文件 SHALL 定义一台 MCP 服务器，内容为单服务器的 MCP 客户端配置（stdio 或 streamable-http 传输）。`serverName` 默认取文件名去后缀，文件内可显式覆盖；serverName MUST 匹配 `[A-Za-z0-9_-]{1,32}`，不合法者记录错误并跳过。子目录与其他后缀的文件 MUST 被忽略。

#### Scenario: 默认 serverName

- **WHEN** `figma.yaml` 未显式声明 serverName
- **THEN** serverName 为 `figma`

#### Scenario: 显式覆盖 serverName

- **WHEN** 文件内声明 `serverName: figma2`
- **THEN** 使用 `figma2` 作为服务器名

#### Scenario: 非法 serverName

- **WHEN** serverName 含非法字符（如空格、点、中文）或超长
- **THEN** 记录错误日志并跳过该文件，其余文件不受影响

#### Scenario: 子目录被忽略

- **WHEN** `.dsh/mcp/` 下存在子目录或 `.md`、`.txt` 等其他后缀文件
- **THEN** 均被忽略

### Requirement: 环境变量展开

配置文件中所有字符串叶子值 SHALL 展开 `${VAR}` 与 `${VAR:-default}` 两种语法，展开作用域为 dsh 进程环境变量。变量未设置且无默认值时 SHALL 展开为空字符串并记录警告日志。

#### Scenario: 展开已设置的变量

- **WHEN** 配置的 `url` 含 `${MCP_URL}` 且进程环境中 MCP_URL 已设置
- **THEN** 加载时使用展开后的值

#### Scenario: 使用默认值

- **WHEN** 配置含 `${TOKEN:-anonymous}` 且 TOKEN 未设置
- **THEN** 展开为 `anonymous`

#### Scenario: 变量缺失

- **WHEN** 配置含 `${TOKEN}` 且 TOKEN 未设置、无默认值
- **THEN** 展开为空字符串并记录警告

### Requirement: serverName 冲突仲裁

同一 serverName 发生冲突时 MUST 按优先级先到者得：同一工作区内主根优先于附加根（附加根之间按授予顺序）；跨工作区的主根之间按工作区登记顺序。冲突的后来者记录错误日志（指明冲突双方的来源：工作区、根目录、文件名）并跳过加载。插件 MUST NOT 对 serverName 做任何自动改名。

#### Scenario: 主根压制附加根

- **WHEN** 某工作区主根与其附加根各有一台同名服务器
- **THEN** 主根的服务器加载，附加根的跳过并记录错误

#### Scenario: 跨工作区按登记顺序

- **WHEN** 两个工作区的主根各有一台同名服务器
- **THEN** 工作区登记顺序靠前者加载，另一者跳过并记录错误

#### Scenario: 错误日志指明来源

- **WHEN** 任何 serverName 冲突发生
- **THEN** 错误日志同时指明胜出方与被跳过方的工作区、根目录与文件名

### Requirement: 动态加载与失败隔离

每台服务器 SHALL 通过官方 MCP 客户端在 host 进程内加载，工具以 `mcp__<serverName>__*` 命名注册。单个配置文件的解析或加载失败 MUST NOT 影响其他配置文件；服务器连接失败遵循 MCP 客户端既有语义（默认不阻断 dsh 启动，工具不出现并记录错误）。

#### Scenario: 工具按前缀注册

- **WHEN** 一台服务器连接并完成工具同步
- **THEN** 其工具以 `mcp__<serverName>__` 前缀出现在进程工具注册表

#### Scenario: 单文件失败不影响其他

- **WHEN** 某配置文件存在语法错误
- **THEN** 记录该文件的错误，其余配置文件正常加载

### Requirement: 工作区可见性隔离

每个会话（agent）MUST 只能看到其归属工作区根集合（主根 + 该工作区的附加根）内定义的项目 MCP 服务器：其工具、提示词中的服务器名与服务器指令段、以及资源读取。归属判定：以会话创建时的 cwd 逐级向上找最近的已登记根（canonical 路径比较）；找不到任何归属时 MUST 对该会话拒绝全部项目 MCP 能力（fail-closed）。隔离的应拒集合 MUST 由「本插件已声称且加载未失败」的项目服务器派生；加载失败的 claim MUST NOT 使同名的非项目（profile 级）服务器被隐藏或拒绝。非项目 MCP（profile 级配置、内置工具）MUST NOT 受影响。

#### Scenario: 仅见归属工作区工具

- **WHEN** 会话 cwd 位于工作区 A 的根下，工作区 B 也定义了项目 MCP
- **THEN** 该会话只看得到工作区 A 根集合的项目 MCP 工具、服务器名与资源，看不到工作区 B 的任一项

#### Scenario: cwd 为工作区子目录

- **WHEN** 会话 cwd 是某登记根的子目录
- **THEN** 归属该登记根所在的工作区，规则同上

#### Scenario: 无归属 fail-closed

- **WHEN** 会话 cwd 向上找不到任何已登记根
- **THEN** 该会话看不到任何项目 MCP 工具与项目服务器名，且全部项目服务器资源读取被拒绝

#### Scenario: 非 project MCP 不受影响

- **WHEN** 隔离生效于某会话
- **THEN** 内置工具与 profile 级 MCP 工具、服务器名与资源保持可见可用

#### Scenario: 被隔离工具调用失败

- **WHEN** 模型调用一个对其不可见的项目 MCP 工具
- **THEN** 调用按未知工具语义失败

#### Scenario: 加载失败的 claim 不误伤同名 profile 服务器

- **WHEN** 某工作区的项目配置声称了 serverName `figma` 但加载失败，且 profile 级另有一台 `figma`
- **THEN** 其他工作区会话仍可见 profile 的 `figma` 工具与名字，其资源读取不被拒绝；本工作区会话也不因此被阻断

#### Scenario: 加载中的 claim 仍受隔离保护

- **WHEN** 某项目服务器已被扫描声称、尚在连接与工具注册过程中
- **THEN** 其它工作区会话在重算前不得看到或调用其工具、名字与资源（fail-closed 方向，不出现反向泄漏）

### Requirement: 隔离的动态刷新

项目 MCP 服务器集合与其工具集发生变化（服务器连接、断开、重连、工具同步、配置增删、加载失败与恢复）时，所有存活会话的工具可见性、提示词名字段与资源访问判定 SHALL 按最新状态重算；新会话创建时 SHALL 立即应用当前状态。重算 MUST 幂等：无实际变化时不重复注册限制。

#### Scenario: 新会话立即隔离

- **WHEN** agent 创建时项目 MCP 服务器与工具已注册
- **THEN** 该 agent 立即按归属应用工具、名字与资源三面隔离

#### Scenario: 工具集变化后重算

- **WHEN** 某服务器的工具同步完成或断开
- **THEN** 存活 agent 的隔离限制按最新工具集更新

#### Scenario: 配置增删后三面同步

- **WHEN** 某工作区的 `.dsh/mcp/` 新增或删除配置文件
- **THEN** 下一步提示词中的服务器名与指令段、以及资源调用判定都反映最新配置，无需重启

#### Scenario: 幂等重算

- **WHEN** 连续多次触发重算而工具集无实际变化
- **THEN** 不产生重复的限制注册

### Requirement: 热重载与手动重载

`.dsh/mcp/` 目录内的文件增删改 SHALL 触发重扫：新增与变更的配置按冲突规则加载，已删除的卸载对应服务器。工作区登记变化与附加根授予变化 SHALL 触发全量重扫。人类命令 `/mcp-reload` SHALL 触发全量重扫作为兜底，并向用户反馈重扫结果。

#### Scenario: 新增配置自动加载

- **WHEN** 向某根的 `.dsh/mcp/` 添加配置文件
- **THEN** 该服务器自动加载，无需重启或手动命令

#### Scenario: 删除配置自动卸载

- **WHEN** 删除某配置文件
- **THEN** 对应服务器卸载，其工具从注册表移除

#### Scenario: 工作区变化全量重扫

- **WHEN** 工作区登记增删或某主根的附加根授予变化
- **THEN** 触发全量重扫并按冲突规则重建加载集

#### Scenario: 手动兜底命令

- **WHEN** 用户执行 `/mcp-reload`
- **THEN** 全量重扫执行并向用户反馈加载/跳过结果

### Requirement: 资源服务器名与资源面的隔离

插件 MUST 使每个会话的模型可见文本不出现其无权访问的项目服务器名与指令：提示词中资源服务器名列表 MUST 只含该会话归属集合内的项目服务器与全部 profile 级服务器；被隐藏项目服务器的服务器指令段 MUST 被移除。三个资源工具（`list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`）的调用 MUST 按 `server` 参数与调用方会话归属判定：对无权访问的项目服务器 MUST 在派发前拒绝且不触达该服务器，拒绝信息 MUST 与上游「服务器在本 agent 作用域不可用」同形。上游文本形态无法识别时 MUST 移除该名字段（fail-closed）并记录告警。

#### Scenario: 隐去无权服务器的名字

- **WHEN** 会话归属工作区 A，工作区 B 与 profile 级都定义了项目/非项目服务器
- **THEN** 该会话提示词的资源服务器名列表只含 A 的项目服务器名与全部 profile 级服务器名，不含 B 的任一项目服务器名

#### Scenario: 移除无权服务器的指令段

- **WHEN** 某项目服务器的指令文本（含以服务器名命名的指令段标题与正文）本应对某会话隐藏
- **THEN** 该指令段整体不出现在该会话的提示词中

#### Scenario: 名列表为空时移除整段

- **WHEN** 过滤后资源服务器名列表为空
- **THEN** 整个资源服务器名段不出现（与上游「无已配置服务器不贡献该段」同形）

#### Scenario: 上游文本形态无法识别时整段删除

- **WHEN** 上游资源服务器名段文本不再符合可解析形态（版本升级导致文案漂移）
- **THEN** 该段被整体移除（fail-closed）并记录告警，且资源读取的硬拒绝不受影响

#### Scenario: 无权资源调用被拒且不触达

- **WHEN** 会话对无权访问的项目服务器调用三个资源工具中的任意一个
- **THEN** 调用在派发前失败，目标服务器收不到该请求，返回信息不包含该服务器的资源、URI 或内容

#### Scenario: 被拒文案与上游不可用同形

- **WHEN** 对无权访问的项目服务器与对不存在的服务器分别发起资源调用
- **THEN** 两种情况下模型看到的错误信息同形，模型无法据此判断该服务器是否存在

#### Scenario: 参数不合法交回工具自身校验

- **WHEN** 资源调用的 `server` 参数缺失或不是字符串
- **THEN** 隔离不额外拒绝，由工具自身参数校验产生错误（既有语义不变）

#### Scenario: profile 级服务器资源保持可用

- **WHEN** 会话读取 profile 级 MCP 服务器的资源
- **THEN** 调用行为与变更前一致，任一工作区会话均可读

#### Scenario: 原生与 PTC 调用一致

- **WHEN** 模型通过 PTC（`run_code`）内层调用资源工具越权访问某项目服务器
- **THEN** 与原生调用一样被拒绝且不触达该服务器

#### Scenario: 升级前历史不追溯

- **WHEN** 升级前某会话的历史中已经出现过某项目服务器名
- **THEN** 该历史内容不被改写或清除；本要求只保证升级后的提示词段与调用面隔离

#### Scenario: 人类 UI 与全局注册表不在本要求范围

- **WHEN** 人类通过 `session-tool-toggle` 面板或 `/tools` 输出查看工具面
- **THEN** 项目服务器分组名仍可见（管理员视图）；本要求只约束模型可见文本与资源调用，不承诺注册层与人类 UI 隐藏
