# Spec Delta

## Purpose

用户自定义斜杠命令：让用户用 Markdown 文件定义命令（正文即 prompt 模板），三层来源（用户级 / 项目级 / 插件内置）按层遮蔽，多工作区会话互不串扰，支持热刷新；并内置 `/init` 为当前仓库生成或更新 `AGENTS.md` 项目指引。

## ADDED Requirements

### Requirement: 命令来源与发现范围

插件 SHALL 从三层来源发现命令：用户级目录 `$DSH_HOME/commands/`（缺省 `~/.dsh/commands/`）、每个登记工作区根（主根 + 经 multi-root 授予的附加根）的 `.dsh/commands/` 目录、以及插件内置命令。来源目录不存在 SHALL 视为该层无命令，不产生错误。附加根枚举服务缺席时 MUST 静默降级为仅主根并保持其余行为不变。

#### Scenario: 用户级目录不存在

- **WHEN** `~/.dsh/commands/` 不存在
- **THEN** 用户级无命令，插件正常工作且无错误日志

#### Scenario: 项目级命令被发现

- **WHEN** 某工作区主根的 `.dsh/commands/review.md` 存在且有效
- **THEN** `review` 成为该工作区会话可用的项目级命令

#### Scenario: 附加根命令同样生效

- **WHEN** 该工作区某附加根的 `.dsh/commands/` 下存在有效命令文件
- **THEN** 该命令同样作为该工作区的项目级命令

#### Scenario: 附加根枚举服务缺席

- **WHEN** multi-root 插件未安装或其 registry 服务不可用
- **THEN** 仅各主根的 `.dsh/commands/` 参与发现，不产生错误

### Requirement: 命令文件格式与命名文法

命令文件 SHALL 为 `.md` 且仅取目录平铺一层；子目录 MUST 被忽略并记录警告。命令名取文件名去后缀，MUST 匹配 `^[a-z][a-z0-9_-]*$`。文件可携带 `---` 包围的 YAML frontmatter，其中仅 `description`（命令说明）与 `argument-hint`（参数提示，映射到命令的输入提示）两个字段被识别：`description` 缺省时 SHALL 回退为「用户自定义命令 <文件名>」而 MUST NOT 读取正文作为说明；未知字段 SHALL 记录警告但 MUST NOT 导致跳过。frontmatter 为非法 YAML、命令名不符文法、正文去除首尾空白后为空者，MUST 记录错误并跳过该文件，同目录其余命令 MUST NOT 受影响。

#### Scenario: 完整 frontmatter

- **WHEN** `deploy.md` 含 `description: 部署到预发` 与 `argument-hint: [环境]`
- **THEN** 命令 `deploy` 以该说明与参数提示出现在发现界面

#### Scenario: 缺 description 的回退

- **WHEN** `deploy.md` 无 frontmatter
- **THEN** 命令说明为「用户自定义命令 deploy.md」，正文内容不出现在发现界面

#### Scenario: 非法命令名被跳过

- **WHEN** 目录下存在 `Deploy.md` 或 `2fast.md`
- **THEN** 记录错误并跳过，其余命令文件正常发现

#### Scenario: 非法 frontmatter 被跳过

- **WHEN** 某文件 frontmatter 块不是合法 YAML
- **THEN** 记录该文件的错误并跳过，同目录其余命令不受影响

#### Scenario: 空正文被跳过

- **WHEN** 某文件去除 frontmatter 后正文为空白
- **THEN** 记录错误并跳过该文件

#### Scenario: 子目录被忽略

- **WHEN** `.dsh/commands/git/commit.md` 存在
- **THEN** 子目录整体忽略并记录警告，不产生 `git` 或 `git:commit` 命令

#### Scenario: 未知字段仅警告

- **WHEN** frontmatter 含 `allowed-tools: bash` 等未识别字段
- **THEN** 记录警告，命令仍正常注册

### Requirement: 占位符展开

命令正文 SHALL 仅支持 `$ARGUMENTS` 字面量占位符：其全部出现处 SHALL 替换为去除首尾空白的调用参数；无参数时替换为空字符串。插件 MUST NOT 提供其他占位符（位置参数、上下文变量等）。

#### Scenario: 带参数展开

- **WHEN** 正文含 `审查 $ARGUMENTS 分支` 且用户输入 `/review feat/x`
- **THEN** 提交的 prompt 含「审查 feat/x 分支」

#### Scenario: 无参数代入空串

- **WHEN** 正文含 `$ARGUMENTS` 且用户输入 `/review` 无参数
- **THEN** 占位符替换为空字符串

#### Scenario: 多处占位全部替换

- **WHEN** 正文出现两个 `$ARGUMENTS`
- **THEN** 两处均替换为同一参数文本

### Requirement: 三层优先级与会话遮蔽

项目级命令 SHALL 在会话（agent）自己的上下文中注册，遮蔽同名用户级命令；用户级命令 SHALL 遮蔽同名内置命令。会话归属判定 SHALL 以会话创建时的 cwd 逐级向上找最近的已登记根（canonical 路径比较），归属到工作区后取其根集合（主根 + 附加根）的项目命令；判定失败时 MUST fail-closed：该会话仅剩用户级与内置命令。同一 canonical 根被多个工作区认领时 SHALL 以该根为主根的工作区优先（附加根只是访问权，不改变别人的会话归属），无人以它为主根时按工作区登记顺序先到先得。不同工作区会话各自看到自己根集合的项目命令，MUST NOT 相互串扰。

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

### Requirement: 调用语义

命令执行时 SHALL 现场读取命令文件正文（注册信息仅承载名称、说明与参数提示），展开占位符后作为用户消息提交给当前会话并开启模型轮次；正文 MUST NOT 被缓存（文件修改后下一次调用即生效）。文件缺失或读取失败时 SHALL 返回错误结果，且 MUST NOT 提交任何部分内容。插件 MUST NOT 为命令声明附件能力（带附件的调用由官方命令适配器拒绝）。

#### Scenario: 提交展开后的 prompt

- **WHEN** 用户执行 `/deploy prod` 且命令文件有效
- **THEN** 一条正文为展开后模板的用户消息进入当前会话并触发模型轮次

#### Scenario: 现读不缓存

- **WHEN** 两次调用之间命令文件正文被修改
- **THEN** 第二次调用提交的是修改后的正文

#### Scenario: 文件不可读报错

- **WHEN** 命令注册后其文件被删除，用户再次执行
- **THEN** 返回错误结果，会话中不出现任何提交内容

#### Scenario: 附件被拒绝

- **WHEN** 用户携带图片执行某自定义命令
- **THEN** 官方适配器拒绝该调用并给出错误，不进入 handler

### Requirement: 同层冲突仲裁

命令名冲突的仲裁范围 SHALL 限于**单个工作区内部**：同一工作区内主根优先于附加根（附加根之间按授予顺序），先到者得。冲突的后来者 MUST 记录错误日志（指明双方的来源目录与文件名）并跳过。插件 MUST NOT 对命令名做任何自动改名。**跨工作区同名 MUST NOT 视为冲突**：每个工作区各自构成独立的项目级命名空间，各自扫描自己的根集合，同名命令在各自工作区生效，MUST NOT 记录错误、MUST NOT 跳过任何一方。同一物理根被多个工作区共享时，每个工作区 SHALL 各自独立发现它。跨层同名属于遮蔽而非冲突，MUST NOT 记录错误。

#### Scenario: 跨工作区同名各自生效

- **WHEN** 工作区 A 与工作区 B 的项目级各有一个 `deploy.md`（内容不同）
- **THEN** 两边各自发现自己的定义且无冲突错误日志，A 会话与 B 会话各执行到自己工作区的那一份

#### Scenario: 共享物理根被各自发现

- **WHEN** 同一个根同时出现在两个工作区的根集合里（其中一个把它当附加根）
- **THEN** 两个工作区各自发现自己那一份命令，不产生冲突错误

#### Scenario: 主根压制附加根

- **WHEN** 某工作区主根与其附加根的 `.dsh/commands/` 各有同名命令文件
- **THEN** 主根的定义生效，附加根的跳过并记录错误

#### Scenario: 工作区内冲突不影响其他工作区

- **WHEN** 工作区 A 的主根与附加根同名冲突，而工作区 B 也有同名命令
- **THEN** 仅 A 内部记一次冲突错误，B 的同名命令照常生效且不出现在该错误里

#### Scenario: 错误日志指明来源

- **WHEN** 任何同层冲突发生
- **THEN** 错误日志同时指明胜出方与被跳过方的目录与文件名

### Requirement: 热刷新与手动重载

命令目录内的文件增删改 SHALL 触发重同步：重算三层发现并更新全局层注册与全部存活会话的项目层注册；新增命令即可用，删除的命令即不可用。工作区登记与附加根授予变化 SHALL 触发全量重同步。人类命令 `/commands-reload` SHALL 作为兜底触发全量重同步，并向用户反馈重同步结果计数。

#### Scenario: 新增命令文件即注册

- **WHEN** 向某命令目录添加有效的 `.md` 文件
- **THEN** 该命令无需重启即可被发现与执行

#### Scenario: 删除命令文件即注销

- **WHEN** 删除某命令文件
- **THEN** 该命令从发现界面与可执行集合移除

#### Scenario: 手动兜底命令

- **WHEN** 用户执行 `/commands-reload`
- **THEN** 全量重同步执行并反馈加载/更新/移除/跳过计数

### Requirement: 内置 init 命令

插件 SHALL 内置命令 `/init`（可被用户级或项目级同名文件遮蔽）：指示 agent 分析当前仓库并在工作区**主根**创建或更新 `AGENTS.md`。已存在 `AGENTS.md` 时 MUST 合并更新——保留仍然正确的内容、修订过时条目，MUST NOT 推倒重写。产出约束：全文简体中文、不超过 80 行、只包含经查证的事实（常用命令必须逐条可复制执行、目录结构与代码约定从现有代码归纳）。`$ARGUMENTS` 用于传达补充关注点。产出完成后 MUST NOT 追加其他建议动作（如 TODO 建议）。

#### Scenario: 无 AGENTS.md 时创建

- **WHEN** 主根尚无 `AGENTS.md`，用户执行 `/init`
- **THEN** 主根生成一份符合产出约束的 `AGENTS.md`

#### Scenario: 已有时合并更新

- **WHEN** 主根已有 `AGENTS.md`，用户执行 `/init`
- **THEN** 仍正确的内容被保留，过时条目被修订，文件不被整体重写

#### Scenario: 传达补充关注点

- **WHEN** 用户执行 `/init 重点写清发布流程`
- **THEN** 生成的 `AGENTS.md` 额外覆盖发布流程相关内容

#### Scenario: 内置被遮蔽

- **WHEN** 用户级或项目级存在 `init.md`
- **THEN** `/init` 执行该文件的定义而非内置 prompt

### Requirement: 无命令服务降级

`commands` 服务缺席的部署（无命令适配器的 profile）中，插件 MUST 保持零注册、零报错、无副作用；命令目录不扫描或扫描结果不被使用均可接受。

#### Scenario: 无命令适配器

- **WHEN** 插件安装于不含 commands 服务的 profile（如 acp / headless）
- **THEN** 启动无错误日志，无任何命令被注册
