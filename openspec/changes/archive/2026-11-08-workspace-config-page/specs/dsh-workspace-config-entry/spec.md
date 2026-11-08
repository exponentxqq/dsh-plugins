# Spec Delta

## REMOVED Requirements

### Requirement: footer 单入口可见性

**Reason**: 入口形态整体迁移：侧栏 footer 单入口 + 统一分节弹窗由宿主标准面板配方（侧栏面板行 + `main` 独立页面）取代，与插件 / 自动化任务 / 任务看板三个既有面板的交互一致；footer 座位上的入口与宽窄双形态要求随之作废。

**Migration**: 由本 delta 的「侧栏面板行与独立页面入口」requirement 承接：面板行在侧栏 Global panels 列表注册（宿主自动处理宽栏/折叠轨形态），点击经宿主 `selectPanel` 进入独立页面；旧 footer 入口硬移除，不提供共存开关。

### Requirement: 统一弹窗与分节导航

**Reason**: 弹窗壳（`shell.overlay` + headless Modal + 打开桥）随入口页面化整体下线；分节导航从弹窗左栏 nav 迁移为页面级 tab；「同一界面会话内关闭后重开记忆上次选中分节」的前提（弹窗组件关闭不卸载）在宿主 keyed 渲染切走即卸载的事实下不再成立。

**Migration**: 由本 delta 的「独立页面与分节 tab」与「统一工作区选择框」两条 requirement 承接：tab 切换即卸载的非活跃分节语义保留；重进页面回到默认分节（order 最小者）；分节内关闭诉求随 `close` 份额删除而消失（会话管理分节的取消/关闭按钮改为流程内语义）。

## ADDED Requirements

### Requirement: 侧栏面板行与独立页面入口

入口持有者 SHALL 以宿主标准面板双注册提供「工作区配置」入口：在 `sidebar.panellist`（list / root）注册面板行（entry id `workspace-config`、`order: 20`、label 为本地化文案），并在 `main`（keyed / root）座位以 key `workspace-config` 注册页面组件。两处注册 SHALL 同生共死：页面注册未成功时面板行 SHALL NOT 出现（避免宿主 `selectPanel` 对未注册面板抛错），页面退场时面板行一并退场。点击面板行 SHALL 经宿主面板切换进入独立页面，页面渲染于主区域、不绑定任何会话。无任何已注册分节时面板行与页面 SHALL 仍可用（页面呈现空态说明）。未安装持有者时三个贡献方 SHALL NOT 在任何入口出现。窄屏/移动布局不在本能力验收面。

#### Scenario: 面板行可见且可进入页面

- **WHEN** 已安装入口持有者的界面渲染侧栏
- **THEN** Global panels 面板列表出现「工作区配置」行（位于插件与自动化任务面板之后），点击后主区域切换为工作区配置独立页面，URL 视图态与宿主面板切换一致

#### Scenario: 无分节时空态

- **WHEN** 已安装入口持有者但没有任何分节贡献方
- **THEN** 面板行仍出现；进入页面呈现空态标题与提示文案，GUI 无报错

#### Scenario: 双注册同生共死

- **WHEN** `main` 座位注册失败或退场（如持有者被禁用）
- **THEN** 面板行从侧栏消失或一并退场，点击任何残留入口都不会触发宿主对未注册面板的切换错误

### Requirement: 独立页面与分节 tab

页面 SHALL 提供分节 tab 导航：tab 行 SHALL 为真 tablist（`tablist` / `tab` / `tabpanel` 角色、tab 与 tabpanel 以 id 互指），按分节注册 `order` 稳定排序，tab 文案来自各贡献方注册时的本地化标签；同一时刻 SHALL 仅渲染当前选中分节（切换即卸载其他分节，其副作用如拉取请求不持续）。进入或重进页面 SHALL 选中默认分节（`order` 最小者），不跨进入记忆上次选中分节。无已注册分节时 SHALL 呈现空态说明。页面样式与布局 SHALL 与宿主插件页同构（页标题 + 简介行 + 工具栏 + 页级 tab + 内容区）。分节组件崩溃 SHALL NOT 导致页面壳或面板行失效。

#### Scenario: 进入页面落到默认分节

- **WHEN** 三个分节贡献方均已安装且用户首次点击面板行
- **THEN** 页面打开，tablist 列出三节（按 order 排序），内容区渲染 order 最小的分节，其余分节未挂载

#### Scenario: 切换分节卸载上一节

- **WHEN** 用户在 tab 中从分节 A 切换到分节 B
- **THEN** 内容区仅渲染分节 B；分节 A 被卸载（其拉取请求等副作用不持续）

#### Scenario: 重进页面回到默认分节

- **WHEN** 用户离开工作区配置页面（切换到会话或其他面板）后再次进入
- **THEN** 页面回到默认分节（order 最小者），不恢复上次选中的分节

### Requirement: 统一工作区选择框

页面 SHALL 提供唯一的工作区选择框，置于页面工具栏区域；三个分节 SHALL NOT 各自携带工作区选择控件。选择框选项 SHALL 为：全部已登记工作区（按宿主清单顺序）+ 末项「未分配」特殊项。选择值 SHALL 经分节座位 owner 份额以纯数据上下文下传：`{ workspace: { kind: 'workspace', id, title, path } | { kind: 'unassigned' } | { kind: 'none' } }`（`none` = 工作区清单服务未就绪）。默认选择 SHALL 按「最近使用的工作区 > 当前会话所属工作区 > 清单第一项」确定。切换选择值时当前选中分节 SHALL 重新挂载（以新上下文寻址）；未分配项对非会话管理分节 SHALL 按无有效目标空态处理。选择框在清单未就绪时 SHALL 呈现禁用/占位态而非空列表。

#### Scenario: 默认选择策略

- **WHEN** 用户进入页面且从未手动选择过工作区
- **THEN** 选择框选中最近使用的工作区；无使用记录时选中当前会话所属工作区；再无则选中清单第一项

#### Scenario: 切换工作区重挂分节

- **WHEN** 用户在选择框从工作区 A 切换到工作区 B
- **THEN** 当前选中分节以工作区 B 上下文重新挂载并重新读取数据；选择值跨 tab 切换保留

#### Scenario: 未分配项的分节语义

- **WHEN** 用户选择「未分配」项
- **THEN** 会话管理分节列出未归属任何工作区的会话；工作区默认档与工作区文件夹分节呈现无有效目标空态且不发请求

#### Scenario: 清单未就绪降级

- **WHEN** 工作区清单服务未就绪（页面挂载早于服务到场）
- **THEN** 选择框呈现禁用/占位态，分节收到 `{ kind: 'none' }` 上下文并各自呈现空态；服务到场后选择框恢复可用且不发残留请求

## MODIFIED Requirements

### Requirement: 分节贡献机制

分节 SHALL 经座位 `workspace-config.section`（list、scope root）软注册贡献：贡献方注册 options SHALL 携带 `id`（分节键）、`order`（tab 位）与 `label`（贡献方本地化文案，locale 切换无需重注册）。owner 份额 SHALL 为纯数据上下文 `{ workspace }`（三态联合：workspace / unassigned / none），SHALL NOT 向贡献方提供任何回调能力（弹窗时代的 `close` 随弹窗壳一并删除；导航与页面离开统一归壳/宿主）。未安装或被禁用的贡献方对应分节 SHALL 自动缺席且不报错。贡献方先装、座位声明后到时，其注册 SHALL 在座位声明后补跑（双向时序安全）。贡献方对持有者的依赖 SHALL 仅限编译期类型。

#### Scenario: 未装贡献方对应节隐藏

- **WHEN** 三个贡献方中某个被禁用后重启界面
- **THEN** 页面 tablist 仅列出其余分节，无空位残留、无控制台报错

#### Scenario: 后装持有者补跑注册

- **WHEN** 贡献方先于入口持有者加载（分节座位尚未声明）
- **THEN** 贡献方的注册静默挂起；持有者声明座位后对应分节出现，无需刷新

#### Scenario: 分节崩溃壳存活

- **WHEN** 某分节组件在渲染期抛出未捕获错误
- **THEN** 页面壳与面板行不失效（崩溃分节按框架错误监督面退场），其余分节可正常切换

#### Scenario: owner 份额为纯数据

- **WHEN** 检查分节座位契约类型
- **THEN** owner 份额仅含 `workspace` 只读字段（三态联合类型），不含任何函数成员；贡献方产物不含对入口持有者包的运行时引用

### Requirement: 降级与安装矩阵

未安装入口持有者时：三个贡献方 SHALL NOT 注册任何入口（侧栏面板行不存在）；multi-root-workspace 的 Files tab 紧凑入口与 `/workspace-folders` 命令 SHALL 保留；session-tool-toggle 的会话头部面板与 `/tools` 命令面 SHALL 保留且与面板共用同一状态；web-ux 会话管理在 GUI 上不可达（SHALL 在文档中明示「推荐四包同装」）。四包跨版本混装 SHALL NOT 作为受支持组合（本仓统一版本、同 tag 安装是唯一受支持形态；旧贡献方 + 新持有者的 owner 份额不匹配不做兼容垫片）。入口持有者 SHALL NOT 向贡献方提供任何运行时服务：贡献方对持有者的依赖 SHALL 仅限类型（编译期）。

#### Scenario: 只装贡献方不装持有者

- **WHEN** profile 仅安装三个贡献插件而无入口持有者
- **THEN** 侧栏无「工作区配置」面板行且控制台无未捕获异常；mrfw 与 stt 的既有替代路径全部可用

#### Scenario: 贡献方仅类型依赖

- **WHEN** 检查三个贡献插件的浏览器端产物
- **THEN** 产物不含对入口持有者包的运行时引用（仅开发期类型导入）

#### Scenario: 混装不受支持

- **WHEN** 旧版本贡献方与新版本持有者混装
- **THEN** 该组合不在受支持矩阵内，行为不做保证（文档明示同 tag 安装约定），不因此引入兼容垫片代码
