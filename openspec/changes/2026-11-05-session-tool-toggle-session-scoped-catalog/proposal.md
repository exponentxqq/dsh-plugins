# Proposal

## Why

**A（原动机）**：project-mcp 把其他工作区根（opc/brains/family 的 `.dsh/mcp/`）发现的服务器（dbx/dbx-brains/dbx-family/figma/figma-family/yunxiao）注册在宿主全局层、按会话掩码隔离；模型侧隔离已生效（本会话 deny=119、prompt 资源段已剥），但会话工具面（Web 面板 + `/tools` 命令面）因读全局层 catalog，把这些本会话不可用的服务器列成 shadowed 条目——面板在「管理」用户根本用不到的工具。用户裁决（2026-11-05）：会话工具面不再读宿主全局层，只管理当前会话有效的工具，面板 MCP 分组与 `/inventory` 同口径。

**B（并入动机，2026-11-05 晚）**：unify-workspace-config-entry 把侧栏三入口收敛为统一「工作区配置」弹窗后，「工作区默认档」分节仍是旧形态——chips 清单 + 手打地址输入框，与分组开关形态的「会话工具面」形成同一插件内的体验断层，且手打地址易错、无可视化分组计数。用户裁决：工作区默认档界面（统一弹窗分节 + 面板分区，同一组件两形态）改成跟「会话工具面」类似的分组开关界面；**用户级默认档编辑器（面板第三段，同形态）一并改**（D10）；自由文本添加入口**完全移除**（D8），表达力兜底走 CLI。

## What Changes

### A 部分（原范围，全部保留）

- **清单宇宙改会话作用域**：面板与 `/tools` 的清单宇宙、掩码引擎的候选集统一改为 `scoped ∪ carried`（`scoped = layer.visibleNames()` 本会话有效工具，与 `/inventory` 读 `ctx.tools.schemas(agent)` 同一表达式；`carried = layer.snapshot().deny` 本面板已生效关闭集——保底已关条目不消失）。三读并集（全局层 catalog ∪ scoped ∪ carried）废止。
- **BREAKING（wire 契约）**：`catalog` 读数面从五个 seam（`ControlDeps`/`PanelInputs`/`MaskInputs`/`PanelReading`/`SessionLayerPorts`）与 `RpcDeps.descriptions` 整体删除；`PanelSnapshot.hiddenByOthers`、`ToolEntry.shadowed`、`Stats.catalog`/`Stats.shadowed` 字段与对应 strict parser 同步删除。
- **「被隐藏」展示链整条删除**：徽章、禁用理由、统计行、zh/en 文案、`/tools status` 的「被其他作用域隐藏」行全部移除；`stats` 收敛两计数 `{visible, denied}`（P1）。
- **`/tools status` 改会话作用域计数**：「可关对象」分组不再含全局层独有名字；层未就绪时诚实降级；`matched=0` 文案改会话口径（「它出现在本会话后自动生效」）。`intentOnly` 保留（`tools/change → refresh()` 幂等链兑现「意图后效」）。
- **已知代价（P2 已裁定接受）**：工具描述改经本会话层读数后，已关条目失去悬浮描述；README 写明。
- 推翻归档变更 `2026-11-02-session-tool-toggle` 的 **R15①**（catalog 端口全局层读数）、**R18①**（shadowed 口径）、**R20①**（catalog/descriptions 保持全局层口径、「v2 再改」——本变更即该 v2）。

### B 部分（默认档分组开关界面）

- **分组开关界面（D10 两编辑器一并改）**：统一弹窗「工作区默认档」分节（dialog 形态，保留下拉切换已登记工作区）与会话面板的「用户级默认档」「工作区默认档」两分区（section 形态，无下拉）改为与「会话工具面」同构的分组清单：MCP 服务器组（组开关 `mcp:<server>` + 行开关 `mcp:<server>::<tool>`，默认折叠）、技能区（`tool:skill` 整档组开关 + `skill:<name>` 行开关，D9 纳入）、内置工具区（无组开关、带过滤）；行开关语义 = 「该地址是否在目标默认档中」（开 = 新会话默认可用），立即写 `off`/`on`，清空 = 两段式 `reset`；锁态两态（保护名单 / 注册表保留名 `run_code`）+ 整组地址在档时组内行禁用。
- **宇宙 U1（D7）**：清单宇宙 = 当前会话两读（复用 A 改造后的 `layer.visibleSchemas()` ∪ `layer.snapshot().deny`，宿主新纯函数 `buildDefaultsUniverse`，目标无关）；行状态 = 目标档 `disabled` 与行地址的交。默认目标（当前工作区）精确；统一弹窗切到其他工作区时清单为「当前会话视角」的近似（该工作区私有 project-mcp 工具行不出现），宇宙经组件层缓存延续可用（`useWorkspaceDefaults` 状态机一行不改）。
- **残留区 + D8 完全移除自由文本**：档内不在清单中的地址进「残留区」chips，只可移除、不可添加；界面无任何自由文本地址输入，跨清单地址的新关走 `/tools default off` / `/tools workspace off`（后者只作用本会话所属工作区，其他工作区需编辑 `workspaces.json`——已知能力边界，README 写明，PB1）。
- **三计数（D11）与默认折叠（D13）**：两编辑器计数摘要 `{listed, inDefaults, residual}`（新纯模块 `defaults-view.ts` 客户端派生，用户级/工作区级共用）；面板两默认档分区默认折叠，标题行带计数摘要。
- **BREAKING（wire 契约）**：`WorkspaceValue` 新增**必填** `universe: DefaultsUniverse | null`（`{sessionId}` 读/写响应都带；`{workspacePath}` 为 `null`；层不可用时非 null 而是 `layerReady:false`）；新增 `DefaultsEntry`/`DefaultsGroup`/`DefaultsUniverse` 三形状与 strict 键表。用户级编辑器零新增 wire（宇宙取 `PanelSnapshot.groups`+`skills` 客户端投影）。
- **文案面**：新增 12 键（三计数/摘要/残留标题/组计数/整组标签/开关可访问名/CLI 兜底提示/降级行），删除 8 键（自由文本添加链：`defaults.add*`/`defaults.placeholder`/`defaults.empty`/`workspace.add*`/`workspace.placeholder`/`workspace.empty`，zh/en 各一份）。
- **被取代的 unify 结论**（其归档先于本变更）：「分节切换丢草稿为接受项」失效（无草稿输入）；`WorkspaceDefaultsEditor` 的「只剥壳、不动字段面」被分组开关重写取代；DQ2=A「不标注来源 + 并集说明」与「dialog 保留下拉 / 状态机不动」**保留**。

### 通用

- **delta 重基线（D12）与执行顺序依赖**：本变更的 spec delta 以 **unify-workspace-config-entry 归档后的主规格文本**为基（其 delta 已 REMOVED「工作区配置入口」、ADDED「工作区默认档分节」、改写「Web 配置界面」正文）；本变更必须在 unify **提交、执行完成并归档之后**执行/归档（代码基线——分节形态客户端文件，与 delta 基线双重依赖）。
- **版本（D5/PB2）**：维持 `1.5.0` 不 bump——版本号决定留给 `scripts/release.mjs` 发布步骤统一处理。

## Capabilities

### New Capabilities

（无——本变更是既有能力的口径修正与既有编辑面的形态重写，不引入新能力）

### Modified Capabilities

- `dsh-session-tool-toggle`: 「Web 配置界面」——面板与 `/tools` 清单宇宙 SHALL 只含本会话有效工具（A）；用户级默认档编辑区与工作区默认档分节/面板分区 SHALL 以同一分组开关形态呈现（B：行状态 = 目标档与行地址的交、残留只可移除、无自由文本添加、CLI 兜底）。「工作区默认档分节」（unify 新增）的正文与场景不与 B 矛盾，保留其归档原文不动（strict 校验要求本 delta 对当前主规格可归档——该需求在 unify 归档前不存在，故 B 句并入「Web 配置界面」单块 MODIFIED 承载）。

## Impact

- **代码**（全部在子包 `plugins/session-tool-toggle`；holder `plugins/workspace-config/` 只读零修改）：
  - A：宿主半 `src/host/` 八文件、契约 `src/contract.ts`、浏览器半 `src/client/`（locales/ToolPanelGroups/ToolPanelAction/CSS）、`lib/` 双产物重建、README。
  - B：`src/contract.ts`（新形状+键表）、`src/host/panel.ts`（`buildDefaultsUniverse`）、`src/host/rpc.ts`（`universeOf` + `handleWorkspace` 两处响应）；客户端新建 `defaults-view.ts`/`DefaultsGroupList.tsx`/`DefaultsSectionFrame.tsx`，重写 `DefaultsEditor.tsx`/`WorkspaceDefaultsEditor.tsx`，改造 `WorkspaceEntry.tsx`（宇宙缓存）/`ToolPanelAction.tsx`（接线）/`ToolPanelGroups.tsx`（仅导出两个纯函数）/`locales.ts`/`panel.module.css`；README、`lib/` 再重建。
- **测试**：A 的 11 个文件断言改写；B 新增 `test/defaults-view.test.ts`（22 → **23 个测试文件**），重写 `workspace-editor.test.tsx`、续改 `tool-panel/wire-contract/rpc/panel/panel-client/panel-controller/locale-parity`；基线 1002 用例全绿（A 前基线 989）。全绿零 skip 为硬门，文件数/用例数不作硬门。
- **不动**：`/inventory`（user-commands）、project-mcp、技能分面逻辑（`SkillView.shadowed` 与 `ClosedAddressReading.shadowed` 同名不同义，保留）、上游 DSH、workspace-config holder、`/tools workspace`/`default` CLI 语义与输出、两份档文件格式与并集播种语义、`useWorkspaceDefaults` 状态机、`panel-controller.ts`、`package.json` 版本。
- **已知代价/能力边界**：① 已关条目无 `title` 描述（A 的 P2，B 的界面同样继承）；② 统一弹窗切其他工作区时清单是当前会话视角的近似，该工作区私有 project-mcp 工具不可见（U1）；③ 跨清单地址对其他工作区无 UI/CLI 新关途径，需手改 `workspaces.json`（D7+D8 合成后果，PB1 裁定接受并写清）；④ 面板两默认档分区折叠态不跨开合记忆（PB3）。
- **版本**：维持 `1.5.0`（与 7c38dbe 同批发布的口径不变；发布时由 release 脚本统一升版）。
