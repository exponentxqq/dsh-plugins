# Spec Delta

## MODIFIED Requirements

### Requirement: 工作区可见性隔离

每个会话（agent）MUST 只能看到其归属工作区根集合（主根 + 该工作区的附加根）内定义的项目 MCP 服务器：其工具、提示词中的服务器名与服务器指令段、以及资源读取。归属判定：以会话创建时的 cwd 逐级向上做 canonical 路径比较；每一层 MUST 先匹配全部已登记工作区的主根（primary），该层无主根命中时 MUST 再匹配附加根（granted）——同一 canonical 目录上，主根认领 MUST 压倒附加根认领；层与层之间 MUST 维持最近层优先（近层的附加根命中优先于远层的主根命中）；同一 canonical 目录被多个工作区授予为附加根时 MUST 按工作区登记顺序取首个。找不到任何归属时 MUST 对该会话拒绝全部项目 MCP 能力（fail-closed）。隔离的应拒集合 MUST 由「本插件已声称且加载未失败」的项目服务器派生；加载失败的 claim MUST NOT 使同名的非项目（profile 级）服务器被隐藏或拒绝。非项目 MCP（profile 级配置、内置工具）MUST NOT 受影响。

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
