# dsh-multi-root-file-references Specification

## Purpose

让 multi-root 插件的 `@` 文件提及补全（`ctx.fileReferences` seam）看到附属工作目录：附加根以绝对路径目录候选进入空查询结果，绝对路径查询可钻入附加根与前缀匹配根，主根语义与裸模糊行为保持上游原样。

## Requirements

### Requirement: 空查询提供附加根候选

query 为空字符串时，系统 SHALL 在上游原始结果之后为每个当前授予（available）的附加根追加恰好一条目录候选，其 path 为该根的绝对显示路径（`/` 分隔、不以尾斜杠结尾，目录语义由展示层补足）。

#### Scenario: 空查询追加每根一条

- **WHEN** 会话主根有两个可用附加根且用户输入 `@`（空 query）
- **THEN** 候选列表以上游主根结果开头，其后依次每个附加根一条目录候选，顺序与 scope 枚举一致

#### Scenario: 与主根候选去重

- **WHEN** 某附加根的绝对路径已出现在上游结果中（理论重合）

- **THEN** 该根不再重复追加，主根结果条目保持不变

### Requirement: 绝对路径查询钻入附加根

query 为绝对路径且位于某附加根之下（等于 `根/` 或以其为前缀）时，系统 SHALL 以该根为列目录范围返回匹配条目，候选 path 保持绝对形式；匹配多个根时 SHALL 取最长匹配的根。

#### Scenario: 钻入根内目录

- **WHEN** 附加根 `/home/x/dev/docker` 已授予且用户输入 `@/home/x/dev/docker/` 后接条目片段
- **THEN** 返回该根内匹配条目的绝对路径候选（目录与文件按真实类型标记）

#### Scenario: 路径不落在任何根内

- **WHEN** 绝对路径 query 既不位于任何附加根之下也不是任何根的前缀
- **THEN** 返回上游原始结果，系统不追加任何候选

### Requirement: 绝对路径前缀匹配附加根

query 为绝对路径且为某个或多个附加根路径的前缀（query 本身短于根路径）时，系统 SHALL 为每个以 query 为前缀的根追加一条目录候选。

#### Scenario: 根路径的部分输入

- **WHEN** 附加根 `/home/xuqinqin/develop/docker` 已授予且用户输入 `@/home/xu`
- **THEN** 候选列表追加该根的目录候选（绝对路径形式），可继续钻入

### Requirement: 裸模糊与相对查询不干预

query 为裸模糊（非空且不含 `/`）或相对钻入形式（含 `/` 但非绝对路径）时，系统 SHALL 返回上游原始结果，不追加任何附加根候选，也不触发附加根检索。

#### Scenario: 裸模糊只搜主根

- **WHEN** 用户输入 `@test`（无斜杠非空）
- **THEN** 结果仅含主根索引的匹配，与未安装本行时一致

### Requirement: 无附加根时字节级透传

会话主根无任何授予的附加根（scope 为空）或主根不可解析时，系统 SHALL 将调用原样委托上游（参数、返回值与异常均不改动）。

#### Scenario: 无根会话透传

- **WHEN** 会话主根没有附加根且用户输入任意 query
- **THEN** 上游服务收到与未安装本行时完全相同的调用，返回值原样传递

### Requirement: 根撤销后候选立即失效

候选生成所依据的附加根在查询期间或其后被撤销（移除、消失或 redirected）时，系统 SHALL 丢弃该根产生的候选；根撤销后的下一次查询 SHALL 不再出现该根的任何候选。

#### Scenario: I/O 期间撤销

- **WHEN** 钻入查询进行期间该附加根被 `/workspace-folders remove` 撤销
- **THEN** 本次结果不包含该根候选，主根结果保留

#### Scenario: 撤销后的空查询

- **WHEN** 附加根撤销后用户再次输入 `@`（空 query）
- **THEN** 候选列表不再含该根

### Requirement: 检索载体缺席时降级

`@deepseek-ai/dsh-file-reference-local` 缺席或形状不符时，本行 SHALL 静默降级为只返回主根候选（缺席不告警；形状不符告警一次）；任何情况下本行 SHALL NOT 因自身失败导致主根候选丢失。

#### Scenario: peer 缺席的 headless 组合

- **WHEN** 组合未提供 `ctx.fileReferences` 服务或检索载体缺席
- **THEN** 本行不激活或降级，主根 `@` 补全行为与上游一致

### Requirement: 兼容契约纳入 file-reference 包

兼容契约 SHALL 把 `@deepseek-ai/dsh-file-reference` 与 `@deepseek-ai/dsh-file-reference-local` 纳入可选核心包清单与混装检查，其 peer 版本承诺 MUST 精确等于支持版本 allowlist，且两包 MUST NOT 成为任何行的加载期依赖。

#### Scenario: 混装检查覆盖新包

- **WHEN** 安装树中任一 file-reference 包版本与其余 DSH 核心包不一致
- **THEN** 兼容门禁判定 mixed，本行所属门禁组不激活

#### Scenario: 加载期零依赖

- **WHEN** 在未安装 file-reference-local 的环境中装载本插件

- **THEN** carrier 行与宿主行均正常装载，不因该包缺席而失败

### Requirement: 主根取不可变会话工作目录

本行解析主根 SHALL 使用 agent 会话头的 cwd（canonical 化），MUST NOT 使用可变的有效工作目录；会话 `cd` 之后附加根候选 SHALL 仍然出现。

#### Scenario: 会话 cd 后根候选仍在

- **WHEN** 会话在主根内执行 `cd` 到子目录后用户输入 `@`（空 query）
- **THEN** 附加根目录候选仍然按原主根的授予关系出现
