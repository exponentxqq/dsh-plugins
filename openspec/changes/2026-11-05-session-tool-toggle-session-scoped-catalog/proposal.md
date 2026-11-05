# Proposal

## Why

project-mcp 把其他工作区根（opc/brains/family 的 `.dsh/mcp/`）发现的服务器（dbx/dbx-brains/dbx-family/figma/figma-family/yunxiao）注册在宿主全局层、按会话掩码隔离；模型侧隔离已生效（本会话 deny=119、prompt 资源段已剥），但会话工具面（Web 面板 + `/tools` 命令面）因读全局层 catalog，把这些本会话不可用的服务器列成 shadowed 条目——面板在「管理」用户根本用不到的工具。用户裁决（2026-11-05）：会话工具面不再读宿主全局层，只管理当前会话有效的工具，面板 MCP 分组与 `/inventory` 同口径。

## What Changes

- **清单宇宙改会话作用域**：面板与 `/tools` 的清单宇宙、掩码引擎的候选集统一改为 `scoped ∪ carried`（`scoped = layer.visibleNames()` 本会话有效工具，与 `/inventory` 读 `ctx.tools.schemas(agent)` 同一表达式；`carried = layer.snapshot().deny` 本面板已生效关闭集——保底已关条目不消失）。三读并集（全局层 catalog ∪ scoped ∪ carried）废止。
- **BREAKING（wire 契约）**：`catalog` 读数面从五个 seam（`ControlDeps`/`PanelInputs`/`MaskInputs`/`PanelReading`/`SessionLayerPorts`）与 `RpcDeps.descriptions` 整体删除；`PanelSnapshot.hiddenByOthers`、`ToolEntry.shadowed`、`Stats.catalog`/`Stats.shadowed` 字段与对应 strict parser 同步删除。双端同仓同 bundle 发布，无独立兼容窗口。
- **「被隐藏」展示链整条删除**：`hiddenByOthers` 恒空后，「被隐藏」徽章（`entry.shadowed`）、禁用理由（`badge.shadowed`）、统计行（`state.shadowed`）、zh/en 文案、`/tools status` 的「被其他作用域隐藏 N 个（全局层有、本会话不可见）」行全部移除。
- **`/tools status` 改会话作用域计数**：「可关对象」分组不再含全局层独有名字；层未就绪时诚实降级（不误报「0 台 / 0 个」）；`matched=0` 文案改会话口径（「它出现在本会话后自动生效」）。
- **`intentOnly` 保留**：地址 0 命中 = 纯意图；「一旦该工具出现在会话即生效」由既有 `tools/change → refresh()` 幂等重算链兑现。
- **面板统计叙事重排**：`stats` 收敛为 `{ visible, denied }` 两计数（decisions D3「删 catalog+shadowed」的算术结果，落档分歧点 P1 已裁定两计数），叙事「本会话可见 N / 已关 M」。
- **与 `/inventory` 的两处刻意差异（预期管理）**：① 已关条目面板留、`/inventory` 不显示（它是模型视角）；② 面板还管 `tool:<name>` 内置工具与 `skill:<name>` 技能（技能分面本就会话作用域，不动）。两差异写进 README，不加 UI 说明行（分歧点 P3 已裁定）。
- **已知代价（design 决策 D-4，分歧点 P2 已裁定接受）**：工具描述改经本会话层读数（掩码后）后，已关条目失去悬浮描述（旧口径从全局层取所以有）；README 写明，兜底为层内描述缓存（另立小变更）。
- 推翻归档变更 `2026-11-02-session-tool-toggle` 的 **R15①**（catalog 端口全局层读数）、**R18①**（shadowed = catalog \ (scoped ∪ carried) 口径）、**R20①**（catalog/descriptions 保持全局层口径、「v2 再改 per-agent 读数」——本变更即该 v2）。

## Capabilities

### New Capabilities

（无——本变更是既有能力的口径修正，不引入新能力）

### Modified Capabilities

- `dsh-session-tool-toggle`: 「Web 配置界面」需求下新增场景——面板清单 SHALL 只含本会话有效工具（`scoped ∪ carried`），被其他作用域隐藏的名字不再出现在面板分组（decisions D4）。

## Impact

- **代码**（全部在子包 `plugins/session-tool-toggle`）：宿主半 `src/host/`（types/mask/session-layer/control/panel/rpc/commands/index 八文件）、契约 `src/contract.ts`（三张 strict 键表与三个 parser）、浏览器半 `src/client/`（locales 六键删、ToolPanelGroups/ToolPanelAction/CSS）、构建产物 `lib/index.js`/`lib/client.js` 随仓重建、插件 README（预期管理两差异 + 描述代价）。
- **测试**：`test/` 11 个文件（panel 60 / control 21 / rpc 21 / session-layer 16 / commands 16 / wire-contract 12 / panel-controller 4 / panel-client 3 / mask / locale-parity / tool-panel）的 shadowed/hiddenByOthers/全局层断言全部改写；基线 989 用例 22 文件。
- **不动**：`/inventory`（user-commands）、project-mcp、技能分面（`SkillView.shadowed` 影子 stub 标记与 `ClosedAddressReading.shadowed` 指令段遮蔽语义均保留）、上游 DSH、`.gitignore`、`openspec/changes/web-ux-session-manager/*`、`plugins/project-mcp/lib/index.js`。
- **版本**：维持 `1.5.0`（与上一变更 7c38dbe 同批发布，decisions D5）。
