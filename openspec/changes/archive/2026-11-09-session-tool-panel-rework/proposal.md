# Proposal

## Why

会话工具面（会话头部工具区入口打开的 Modal 面板）当前是六段平铺布局：两个默认收起的默认档分区（用户级 / 工作区级）把高频的会话开关推到屏外，且清单行形态陈旧（描述仅悬停可见、无全局过滤），与统一「工作区配置」页面「工作区默认档」分节的三卡形态（概要卡 / 清单卡 / 命令卡）已是两套体验。默认档是低频的全局配置，不该占据会话级高频操作面。

## What Changes

- **面板三卡整编**：会话工具面正文重排为与「工作区默认档」页面同构的三卡——概要卡（会话状态事实与三计数）、清单卡（全局过滤 + 分组开关清单：MCP 服务器 / 技能 / 内置工具同卡，描述次行常驻）、命令卡（会话级 `/tools off` 命令模板）+ Modal footer 动作区（两段式「恢复创建时快照」）。
- **默认档配置退出会话工具面**：移除「用户级默认档」「工作区默认档」两个面板分区。工作区级默认档的 GUI 编辑仅保留在统一「工作区配置」页面分节（现状不动）；**用户级默认档不再提供 GUI 编辑面**，仅保留 `/tools default` 子命令（**BREAKING**：GUI 能力移除）。
- **技能段并入清单卡**：独立 `SkillPanel` 分段取消，技能成为共用分组清单的一个组（组开关 `tool:skill` + 逐 skill 行）；`shadowed`（已生效）、`blocked`（整档关）、技能服务缺席降级等会话语义以共用清单组件的可选能力保留。
- **关闭集段拆并三处**：独立 chip 段取消——关闭集计数进概要卡；不在清单宇宙的地址（含 intentOnly）进清单卡残留区（可开启）；「恢复创建时快照」进 footer 动作区。
- **清单行开关口径修正**（顺手修复既有缺陷）：整组地址在关闭集时，组内行开关按实际不可用呈关闭且禁用并标注「整组已关」（旧面板呈开且可点，是零效果死点击）。
- **wire 契约瘦身**（**BREAKING**，同 tag 安装内安全）：`PanelSnapshot` 删 `defaults` / `workspace` 两字段；RPC 端点 5→4（删 `defaults` 端点全家）；`workspace` 端点删 `{sessionId}` 寻址形态与响应 `choices` 字段（`{workspacePath}` 成为唯一寻址）。失败码集合不变。
- **组件与文案收敛**：`ToolPanelGroups` / `SkillPanel` / `DefaultsEditor` / `DefaultsSectionFrame` 删除；新建 `CommandCard`（两形态共用命令卡）、`group-shape`（分组词汇表）、`panel-failure`（失败文案映射唯一实现点）；`DefaultsGroupList` 吸收会话语义成为两形态共用清单；locales +19 键 / 删约 32 死键；`.workspacePage` 更名 `.cardStack` 两处共用。

## Capabilities

### New Capabilities

（无——本变更不引入新能力域。）

### Modified Capabilities

- `dsh-session-tool-toggle`: 会话工具面面板构成 requirement 重写（三卡构成、默认档编辑面退出、技能并入清单、关闭集拆并、残留地址可开启、整组关行禁用）；「用户级默认档」requirement 的 GUI 编辑条款改为仅命令面；「默认档编辑面的分组开关形态」「工作区默认档页面的工作区宇宙」「工作区默认档分节」三条删去面板分区表述；「面板读写通道与会话状态同源」补端点收敛（会话级三端点 + workspace 端点 `{workspacePath}` 唯一寻址、无 `choices`）。共 7 条 MODIFIED。

## Impact

- **代码**（全部在根仓 `plugins/session-tool-toggle` 包内）：client 侧 11 文件（4 删 3 建 4 改）；契约 `src/contract.ts`；宿主 `src/host/{rpc,panel,types,index}`；测试 10+ 文件（含 P-1=b 追加的 `workspace-attribution`/`workspace-universe` 用例收缩）；`README.md` 八处。产物 `lib/*.js` 随仓库重建提交。
- **接口 / wire**：Connection RPC 通道 `/session-tool-toggle` 端点 5→4；`PanelSnapshot` 与 `WorkspaceValue` 形状收敛（见 What Changes；仓库既定「统一版本、同 tag 安装、混装不受支持」，浏览器半由宿主启动图提供，同批发布内无混装路径）。
- **不受影响**：`/tools` 命令面全部子命令；宿主状态内核（掩码 / 持久化 / 播种 / 并集语义）；统一「工作区配置」页面分节（`variant='dialog'` 路径）；`workspace-config` 插件与座位契约；其余六包。
- **规格**：`openspec/specs/dsh-workspace-config-entry/spec.md` 零改动（已核对仍成立）。
