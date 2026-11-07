# Spec Delta

## MODIFIED Requirements

### Requirement: 工作区可见性隔离

每个会话（agent）MUST 只能看到其归属工作区根集合（主根 + 该工作区的附加根）内定义的项目 MCP 服务器：其工具、提示词中的服务器名与服务器指令段、以及资源读取。归属判定：以会话创建时的 cwd 逐级向上做 canonical 路径比较；每一层 MUST 先匹配全部已登记工作区的主根（primary），该层无主根命中时 MUST 再匹配附加根（granted）——同一 canonical 目录上，主根认领 MUST 压倒附加根认领；层与层之间 MUST 维持最近层优先（近层的附加根命中优先于远层的主根命中）；同一 canonical 目录被多个工作区授予为附加根时 MUST 按工作区登记顺序取首个。找不到任何归属时 MUST 对该会话拒绝全部项目 MCP 能力（fail-closed）。隔离的应拒集合 MUST 由「本插件已声称且加载未失败」的项目服务器派生；加载失败的 claim MUST NOT 使同名的非项目（profile 级）服务器被隐藏或拒绝。非项目 MCP（profile 级配置、内置工具）MUST NOT 受影响。

隔离的执行 MUST NOT 依赖单一 agent 生命周期事件：插件 MUST 另设与 agent 存在与否无关的全局闸口——未被隔离层跟踪的 agent 发起的项目 MCP 工具或资源调用、以及无发起者身份（无归属可查）的此类调用，MUST 在派发前被拒绝且不触达目标服务器；被跟踪 agent 的调用按其归属判定。闸口的拒绝文案 MUST 与被跟踪 agent 的拒绝同形，模型 MUST NOT 能据此区分调用方的跟踪状态。闸口 MUST NOT 影响非项目工具（既非 `mcp__` 项目命名空间、也非资源三件套的调用零额外判定）。

根集合契约 SHALL 以 `primaryRoot` 为工作区主根的唯一权威，`roots` 是扫描顺序集合（首项约定为主根）。当 `roots[0] !== primaryRoot`（契约被违反）时，实现 MUST 以 `primaryRoot` 进主根层、并将 `roots` 中所有不等于 `primaryRoot` 的项按原顺序进附加根层，并 MUST 记录一条诊断日志；MUST NOT 因位置假设丢弃任何根。同一 `primaryRoot` 被多个工作区登记时，主根层 MUST 先到先得，返回的根集合 MUST 取自胜出工作区。

归属索引的重建 MUST 是原子的：实现 MUST 先完整构造新索引再一次性替换；进行中的归属判定 MUST 使用替换前的完整快照，MUST NOT 观察到「已清空」或「半填充」的索引。

#### Scenario: 仅见归属工作区工具

- **WHEN** 会话 cwd 位于工作区 A 的根下，工作区 B 也定义了项目 MCP
- **THEN** 该会话只看得到工作区 A 根集合的项目 MCP 工具、服务器名与资源，看不到工作区 B 的任一项

#### Scenario: cwd 为工作区子目录

- **WHEN** 会话 cwd 是某登记根的子目录
- **THEN** 归属该登记根所在的工作区，规则同上

#### Scenario: 主根压倒附加根

- **WHEN** 会话 cwd 正好是工作区 A 的主根，且同一目录被登记更早的工作区 B 授予为附加根
- **THEN** 该会话归属 A，只看得到 A 根集合的项目 MCP 服务器，不因 B 的授予被抢注

#### Scenario: 仅附加根命中

- **WHEN** 会话 cwd 是工作区 B 的附加根，且该目录不是任何工作区的主根
- **THEN** 该会话归属 B

#### Scenario: 近层附加根优先于远层主根

- **WHEN** 会话 cwd 位于工作区 B 的附加根之下（如 `<extras>/pkg`），而该附加根的某祖先目录是工作区 A 的主根
- **THEN** 该会话归属 B（近层附加根命中胜远层主根命中）

#### Scenario: 双授予按登记顺序

- **WHEN** 同一目录被工作区 B1、B2 都授予为附加根，且该目录不是任何工作区的主根，B1 登记更早
- **THEN** 该会话归属 B1

#### Scenario: 根集合首项不是主根

- **WHEN** 某工作区的 `roots[0]` 不等于它的 `primaryRoot`
- **THEN** 该 `primaryRoot` 仍以主根身份参与认领，`roots` 中其余项按附加根认领，无任何根被丢弃，且记录一条诊断

#### Scenario: 重扫期间创建会话

- **WHEN** 一次根集合重建正在进行，同时某会话创建并做归属判定
- **THEN** 该判定使用重建前的完整索引，结果与重建前一致；MUST NOT 因重建而退回 fail-closed

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

#### Scenario: 未跟踪 agent 的越权调用被全局闸口拒绝

- **WHEN** 一个未被隔离层跟踪的 agent（例如插件重载后已存活、尚未被补挂的会话）调用其归属外的项目 MCP 工具，或以资源工具的 `server` 参数指向其归属外的项目服务器
- **THEN** 调用在派发前被拒绝、目标服务器不被触达，拒绝文案与被跟踪 agent 的拒绝同形

#### Scenario: 无发起者的调用被拒绝

- **WHEN** 无发起者身份（无 agent 归属可查）的调用命名 `mcp__` 项目命名空间的工具，或资源三件套以非空字符串 `server` 参数指向项目服务器
- **THEN** 调用在派发前被拒绝且不触达目标服务器；资源调用 `server` 参数缺失或非字符串时交回工具自身参数校验，不产生服务器触达

#### Scenario: 全局闸口不影响非项目工具

- **WHEN** 闸口处于生效状态，任一会话调用内置工具或非项目 MCP 工具
- **THEN** 调用行为与闸口不存在时一致（非项目命名空间的调用不经闸口判定）
