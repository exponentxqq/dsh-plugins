# dsh-web-ux-session-manager Specification（delta）

## MODIFIED Requirements

### Requirement: 全局会话管理入口

会话管理入口 SHALL 位于统一工作区配置弹窗的「会话管理」分节（分节座位 `workspace-config.section`，由 workspace-config 插件声明）：用户点击侧栏 footer 的「工作区配置」入口打开统一弹窗后，经分节导航进入会话管理分节；会话管理 SHALL 以分节内联形态呈现（工作区选择、三域 tab 与各批量操作语义保持本能力其余需求所定义的交互），SHALL NOT 在统一弹窗内再开第二层模态。入口 SHALL NOT 出现在其他位置。分节对宿主服务的依赖（连接通道、工作区快照、会话列表）SHALL 全部软处理：任一服务缺席时分节对应功能静默不出现或降级为只读空态，SHALL NOT 导致 Web GUI 报错或崩溃；未安装 workspace-config 插件时本分节不存在，会话管理在 GUI 上不可达（见统一入口能力的安装矩阵要求）。

#### Scenario: 打开管理浮层

- **WHEN** 宿主服务就绪，用户点击侧栏 footer 的「工作区配置」入口并在弹窗导航中选择「会话管理」分节
- **THEN** 分节内联呈现会话管理面，默认选中一个工作区（最近使用优先）并展示其三域会话；弹窗内无第二层模态

#### Scenario: 上游座位缺失软降级

- **WHEN** 连接/工作区/会话服务任一缺席
- **THEN** 分节对应功能静默不渲染或降级为只读空态，GUI 无报错，其余分节与既有能力不受影响

#### Scenario: 持有者缺席时入口不残留

- **WHEN** profile 未安装 workspace-config 插件（分节座位不存在）
- **THEN** 本插件在 footer 无任何入口注册，GUI 无报错；会话管理在此安装形态下 GUI 不可达，侧栏行菜单的单会话删除入口不受影响
