# Spec Delta

## MODIFIED Requirements

### Requirement: 三层优先级与会话遮蔽

项目级命令 SHALL 在会话（agent）自己的上下文中注册，遮蔽同名用户级命令；用户级命令 SHALL 遮蔽同名内置命令。会话归属判定 SHALL 以会话创建时的 cwd 逐级向上找最近的已登记根（canonical 路径比较），归属到工作区后取其根集合（主根 + 附加根）的项目命令；判定失败时 MUST fail-closed：该会话仅剩用户级与内置命令。同一 canonical 根被多个工作区认领时 SHALL 以该根为主根的工作区优先（附加根只是访问权，不改变别人的会话归属），无人以它为主根时按工作区登记顺序先到先得。不同工作区会话各自看到自己根集合的项目命令，MUST NOT 相互串扰。

根集合契约 SHALL 以 `primaryRoot` 为工作区主根的唯一权威，`roots` 是扫描顺序集合（首项约定为主根）。当 `roots[0] !== primaryRoot`（契约被违反）时，实现 MUST 以 `primaryRoot` 进主根层、并将 `roots` 中所有不等于 `primaryRoot` 的项按原顺序进附加根层，并 MUST 记录一条诊断日志；MUST NOT 因位置假设丢弃任何根。同一 `primaryRoot` 被多个工作区登记时，主根层 MUST 先到先得，返回的根集合 MUST 取自胜出工作区。

归属索引的重建 MUST 是原子的：实现 MUST 先完整构造新索引再一次性替换；进行中的归属判定 MUST 使用替换前的完整快照，MUST NOT 观察到「已清空」或「半填充」的索引——重扫期间进行归属判定的会话 MUST 得到与重扫前一致的结果，MUST NOT 因重建窗口而退回 fail-closed。

#### Scenario: 项目级遮蔽用户级

- **WHEN** 用户级与某工作区项目级各有一个 `deploy` 命令
- **THEN** 该工作区会话执行 `/deploy` 使用项目级定义，其他工作区会话仍用用户级

#### Scenario: 用户级遮蔽内置

- **WHEN** 用户级存在 `init.md`
- **THEN** 所有会话的 `/init` 使用该用户级定义

#### Scenario: 归属失败 fail-closed

- **WHEN** 会话 cwd 向上找不到任何已登记根
- **THEN** 该会话仅能使用用户级与内置命令

#### Scenario: 跨工作区不串扰

- **WHEN** 工作区 A 与工作区 B 的项目级各有同名命令且内容不同
- **THEN** A 会话与 B 会话各自执行到各自工作区的定义

#### Scenario: 附加根是他人的主根

- **WHEN** 工作区 A 把目录 `p` 授予为附加根，而 `p` 同时是工作区 B 的主根
- **THEN** cwd 在 `p` 下的会话归属 B 并使用 B 的项目级命令，与 A、B 的登记顺序无关

#### Scenario: 根集合首项不是主根

- **WHEN** 某工作区的 `roots[0]` 不等于它的 `primaryRoot`
- **THEN** 该 `primaryRoot` 仍以主根身份参与认领，`roots` 中其余项按附加根认领，无任何根被丢弃，且记录一条诊断

#### Scenario: 重扫期间归属判定不降级

- **WHEN** 一次根集合重建正在进行，同时某会话创建并做归属判定，其 cwd 属于重建前已登记的某工作区
- **THEN** 该判定使用重建前的完整索引并归属该工作区；MUST NOT 因重建窗口而退回 fail-closed
