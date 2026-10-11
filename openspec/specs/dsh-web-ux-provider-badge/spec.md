# dsh-web-ux-provider-badge Specification

## Purpose
会话状态行（输入框下方，与缓存命中率、上下文用量指示同一行）的模型 provider 归属展示：让用户在任意时刻直观确认当前会话运行的模型 provider，无需打开模型选择器。

## Requirements

### Requirement: Provider 徽章显示

Web GUI 会话状态行 SHALL 追加一枚静态胶囊徽章，展示当前会话所选模型的 provider 显示名。显示名取自模型目录中与当前选择的 provider 标识符匹配的 provider 分组名称；匹配不到时 SHALL 回退显示 provider 标识符原文。徽章为纯展示元素，不提供点击交互。悬停徽章 SHALL 以提示（tooltip）显示 provider 标识符与模型标识符。

#### Scenario: 会话已选定模型

- **WHEN** 会话存在持久的模型选择（provider + model）
- **THEN** 状态行显示该 provider 的显示名胶囊

#### Scenario: provider 不在已加载目录中

- **WHEN** 当前选择的 provider 标识符不在已加载的 provider 分组里
- **THEN** 徽章显示 provider 标识符原文

#### Scenario: 会话尚无模型选择

- **WHEN** 会话没有持久模型选择
- **THEN** 不渲染徽章，且不产生错误

#### Scenario: 悬停徽章

- **WHEN** 用户悬停徽章
- **THEN** 提示显示 provider 标识符与模型标识符

### Requirement: 徽章实时跟随选择

会话内切换模型后，徽章 SHALL 反映最新选择，无需刷新页面。

#### Scenario: 切换模型

- **WHEN** 用户在会话内切换到另一 provider 的模型
- **THEN** 徽章更新为新 provider 的显示名

### Requirement: 宽度安全

徽章 MUST NOT 使对话区或状态行出现横向滚动：显示宽度 MUST 有上限，超长文本截断为省略号。

#### Scenario: provider 名过长

- **WHEN** provider 显示名超过徽章宽度上限
- **THEN** 徽章截断显示省略号，页面不出现横向滚动

### Requirement: 与官方控件共存

徽章 SHALL 作为状态行的追加条目与既有指示（轮次统计、缓存命中率、上下文用量等）并排显示，视觉语言（字号、配色、胶囊形态）与既有胶囊一致，MUST NOT 遮蔽、替换或重排任何官方界面控件。上游在空白会话期不渲染状态行时，徽章随之缺席，MUST NOT 产生错误。

#### Scenario: 与既有指示并排

- **WHEN** 状态行渲染
- **THEN** 徽章与既有指示同行并排显示，样式与官方胶囊一致

#### Scenario: 空白会话期

- **WHEN** 会话未发出第一条消息、状态行整体未渲染
- **THEN** 徽章不显示，不产生错误
