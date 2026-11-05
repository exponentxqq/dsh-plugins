# dsh-workspace-config-entry Specification

## Purpose
统一「工作区配置」入口能力：把侧栏 footer 三枚插件各自注册的入口收敛为一枚恒在的「工作区配置」入口（宽栏文案 / 折叠轨图标双形态可见），点击打开统一分节弹窗；multi-root-workspace、session-tool-toggle、web-ux 三方经 `workspace-config.section` 座位软注册贡献分节，缺贡献方节自动隐藏、贡献方崩溃不伤壳，持有者对贡献方零运行时服务（仅编译期类型依赖），未装持有者时三插件按既有独立入口降级。

## Requirements

### Requirement: footer 单入口可见性

桌面布局下，侧栏 footer（`sidebar.footer.action` 座位）SHALL 仅提供一枚「工作区配置」入口：宽栏形态（256px）SHALL 完整展示图标与文案（超长文案截断省略，不横向溢出）；折叠轨形态（56px 轨道）SHALL 完整展示居中图标（不裁切）；两种形态 SHALL 恒有可访问名（`aria-label`）且可点击。入口 SHALL 恒在（无任何已注册分节时仍渲染）；其占位 SHALL 为行内收缩份额，SHALL NOT 整行独占（禁 `flex: none` / `calc(100% + 4px)` 类布局），SHALL NOT 把同列其他占用者挤出可见区。窄屏/移动布局不在本能力验收面。

#### Scenario: 宽栏形态完整可见

- **WHEN** 桌面布局宽栏形态下渲染侧栏 footer
- **THEN** footer 内仅见一枚「工作区配置」入口（图标 + 文案），无横向溢出或裁切，a11y 树中存在可点击的同名按钮

#### Scenario: 折叠轨形态完整可见

- **WHEN** 用户把侧栏折叠为 56px 轨道形态
- **THEN** 入口以图标形态完整居中可见（不裁切），a11y 树中仍存在可点击的同名按钮

#### Scenario: 入口恒在

- **WHEN** 已安装入口持有者但没有任何分节贡献方（或全部贡献方被禁用）
- **THEN** footer 入口仍渲染；点击打开弹窗呈现空态说明，GUI 无报错

### Requirement: 统一弹窗与分节导航

点击入口 SHALL 打开统一模态弹窗：弹窗 SHALL 提供分节导航（按分节注册 `order` 稳定排序，导航文案来自各贡献方注册时的本地化标签）与内容列；同一时刻内容列 SHALL 仅渲染当前选中分节（切换即卸载其他分节）；无已注册分节时 SHALL 呈现空态说明。弹窗打开时 SHALL 选中默认分节（`order` 最小者）；同一界面会话内关闭后重开 SHALL 记忆上次选中分节。分节内的关闭诉求 SHALL 通过座位 owner 份额获得 `close` 能力；分节组件 SHALL NOT 在统一弹窗内再开第二层模态。

#### Scenario: 打开弹窗进入默认分节

- **WHEN** 三个分节贡献方均已安装且用户首次点击入口
- **THEN** 弹窗打开，导航列出三节（按 order 排序），内容列渲染 order 最小的分节，其余分节未挂载

#### Scenario: 切换分节卸载上一节

- **WHEN** 弹窗打开且用户在导航中从分节 A 切换到分节 B
- **THEN** 内容列仅渲染分节 B；分节 A 被卸载（其副作用如拉取请求不持续）

#### Scenario: 空态

- **WHEN** 没有任何分节注册时用户点击入口
- **THEN** 弹窗打开并呈现空态标题与提示文案，无报错

### Requirement: 分节贡献机制

分节 SHALL 经座位 `workspace-config.section`（list、scope root、owner `{ close(): void }`）软注册贡献：贡献方注册 options SHALL 携带 `id`（分节键）、`order`（导航位）与 `label`（贡献方本地化文案，locale 切换无需重注册）；未安装或被禁用的贡献方对应分节 SHALL 自动缺席且不报错。贡献方先装、座位声明后到时，其注册 SHALL 在座位声明后补跑（双向时序安全）；分节组件崩溃 SHALL NOT 导致弹窗壳或入口失效。

#### Scenario: 未装贡献方对应节隐藏

- **WHEN** 三个贡献方中某个被禁用后重启界面
- **THEN** 导航仅列出其余分节，无空位残留、无控制台报错

#### Scenario: 后装持有者补跑注册

- **WHEN** 贡献方先于入口持有者加载（分节座位尚未声明）
- **THEN** 贡献方的注册静默挂起；持有者声明座位后对应分节出现，无需刷新

#### Scenario: 分节崩溃壳存活

- **WHEN** 某分节组件在渲染期抛出未捕获错误
- **THEN** 统一弹窗壳与 footer 入口不失效（崩溃分节按框架错误监督面退场），其余分节可正常切换

### Requirement: 降级与安装矩阵

未安装入口持有者时：三个贡献方 SHALL NOT 在 footer 注册任何入口（旧 footer 入口硬移除，不提供共存探测或配置开关）；multi-root-workspace 的 Files tab 紧凑入口与 `/workspace-folders` 命令 SHALL 保留；session-tool-toggle 的会话头部面板与 `/tools` 命令面 SHALL 保留且与面板共用同一状态；web-ux 会话管理在 GUI 上不可达（ SHALL 在文档中明示「推荐四包同装」）。入口持有者 SHALL NOT 向贡献方提供任何运行时服务：贡献方对持有者的依赖 SHALL 仅限类型（编译期）。

#### Scenario: 只装贡献方不装持有者

- **WHEN** profile 仅安装三个贡献插件而无入口持有者
- **THEN** footer 无「工作区配置」入口且控制台无未捕获异常；mrfw 与 stt 的既有替代路径全部可用

#### Scenario: 贡献方仅类型依赖

- **WHEN** 检查三个贡献插件的浏览器端产物
- **THEN** 产物不含对入口持有者包的运行时引用（仅开发期类型导入）
