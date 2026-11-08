# Proposal

## Why

统一「工作区配置」页面中的「工作区默认档」分节因宿主契约（`{workspacePath}` 寻址响应 `universe` 恒 `null`，D-24）从不渲染分组开关清单——页面上只能查看/移除存量条目，**无法添加默认关闭项**，而会话工具面板里的同一编辑器却有完整清单，两个入口能力不对称；同时页面正文是约 8 行纯文本平铺（无卡片无分块、标题与 tab 重复、无刷新、命令不可复制、空档近乎空白），易用性与视觉效果均不足。本次按用户要求参考「会话工具面」的页面形式并在其基础上进一步优化。

## What Changes

- **能力恢复（A2）**：宿主为 `{workspacePath}` 寻址现算**工作区宇宙**——MCP 与内置工具取插件上下文的全局工具注册表（未受限并集），技能取 `skills.snapshot({cwd})` 工作区作用域快照；归组纪律与 `/inventory` 同款（`mcp__<server>__<tool>` 正则、第一个 `__` 边界、未归组只计数不成行、不猜服务器名）。页面分组开关清单恢复，可加默认关。
- **近似诚实**：全局并集可能列出其他工作区的项目级 MCP 服务器，页面以灰字注记「写入仅保留意图」；未归组计数、技能观测完整性（`skillsComplete`）均有界面提示。
- **布局重构（B1）**：分节正文从平铺改为单列三卡——概要卡（工作区名 + 登记徽章 + 刷新 + key/档文件 + 三计数 + 损坏警告）、清单卡（分组开关 + 残留 + 注记）、命令卡（目标键注释 + `/tools workspace off <地址>` 代码块 + 复制按钮 + 边界说明）；脚注收纳 scope/union 两句；删除与 tab 重复的 `<h3>`。
- **交互增强**：C1 全局过滤（覆盖组行/技能/内置/残留，匹配名称/地址/描述/组键，过滤时组强制展开）；C3 概要卡刷新入口；C4 可复制命令；C6 空档可视化块；行下描述次行 + 技能调用方式标签（模型可调 / 仅用户调用 / 来源）。
- **面板零回归**：会话面板与用户级默认档编辑器不改行为；共用清单组件仅以可选参数（`query` / `showDetails`）升级，参数缺省时 DOM 与现行逐字一致。
- **规范对齐**：`dsh-session-tool-toggle` spec 中「默认档编辑面的分组开关形态」的宇宙口径由「沿用当前会话视角」改写为工作区宇宙语义，消除现行 spec 场景与实现（降级）的文本偏差。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `dsh-session-tool-toggle`: 「默认档编辑面的分组开关形态」要求的工作区默认档分节宇宙口径变更——页面（`{workspacePath}` 寻址）由恒降级改为按工作区现算宇宙（全局注册表并集 + 该工作区技能快照，`/inventory` 同款归组纪律与未归组容忍），并新增页面分节的布局、过滤、刷新、命令复制、空态与条目详情展示的行为场景。

## Impact

- **代码**：全部在 `plugins/session-tool-toggle`（宿主半新增 `workspace-universe.ts`、`rpc.ts`/`index.ts`/`panel.ts` 接线；浏览器半新增 `WorkspaceDefaultsPage.tsx`、改 `WorkspaceDefaultsEditor.tsx`/`DefaultsGroupList.tsx`/`defaults-view.ts`/`panel.module.css`/`locales.ts`/`WorkspaceEntry.tsx` 注释）。触达面 18 文件（新建 3 / 修改 15），详见 `code-design.md` ①。
- **不触达**：`tooling/contracts`（owner 份额仍纯数据 `{workspace}`）、`plugins/workspace-config`（页面壳）、面板组件（`ToolPanelAction.tsx`/`ToolPanelGroups.tsx`/`DefaultsEditor.tsx`/`DefaultsSectionFrame.tsx`）、掩码/持久化内核、CLI 语法。
- **文档**：插件 README 的「路径形态 universe:null」两段删除，补工作区宇宙与近似边界说明。
- **测试**：新增 `workspace-universe.test.ts`；改 `rpc.test.ts`/`wire-contract.test.ts`/`defaults-view.test.ts`/`workspace-editor.test.tsx`；面板既有断言语义全部保留。
- **无 breaking**：wire 契约仅新增可选字段（`DefaultsEntry` 技能三字段、`DefaultsUniverse.ungroupedMcp/skillsComplete`），`universe: null` 保持合法（混合版本兼容）。
