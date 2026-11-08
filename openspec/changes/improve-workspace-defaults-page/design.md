# Design

## Context

- 现行实现：统一「工作区配置」页面的「工作区默认档」分节经 `{workspacePath}` 寻址读档，宿主契约（D-24）令该形态响应的 `universe` 恒为 `null`——分组开关清单从不渲染，页面退化为「降级文案 + 残留管理 + CLI 提示」的平铺正文（上一变更 `2026-11-08-workspace-config-page` 的 G4 记录了该降级经用户裁决接受，即 R7；本次由用户重新裁定推翻，改为按工作区现算宇宙）。
- 会话工具面板（Modal 六段）的「工作区默认档」分区用会话快照投影宇宙（`universeOfSnapshot`）拥有完整清单——同一编辑器两形态能力不对称是本次的直接动因。
- 现行 spec「默认档编辑面的分组开关形态」的场景文本（「宇宙沿用当前会话视角」）与页面实现（降级）存在偏差，本变更一并对齐。
- 详细代码级蓝图（触达面 18 文件、接口签名、逐任务组实现要点）见随档 `code-design.md`（规划期产物，与本 design 同为落档权威）。

## Goals / Non-Goals

**Goals:**

- 页面分节成为工作区默认档的完整编辑面：清单可见、可开关（A2 工作区宇宙）。
- 单列三卡布局（概要/清单/命令）+ 全局过滤 + 刷新 + 可复制命令 + 空档引导 + 行下描述与技能标签。
- 面板形态零回归（DOM 逐字一致为硬约束）。
- wire 契约只增可选字段，混合版本（新 client + 旧 host）安全降级。

**Non-Goals:**

- 不改造会话工具面板自身（六段布局的易用性问题仅作参考基准）。
- 不动 `/tools` 命令语法（不加 `--path`）、掩码/持久化内核、地址文法与保护名单。
- 不动 `tooling/contracts` 与 `plugins/workspace-config`（owner 份额仍纯数据 `{workspace}`，页面壳不承载单插件能力）。
- 不做 C2 组锚点、C5 计数点击联动、窄屏布局、自由文本地址添加（D8 红线）。

## Decisions

> 完整决策链（D1–D14，每条含被否方案与反例）见 `code-design.md` ④；此处记录骨架与两条规划期元决策。

- **D-元1（栈识别）**：writer skill = **`dsh-plugin-writer`**。证据：仓内无 `pom.xml`/`build.gradle`/`nuxt.config.*`（不命中 Spring/Nuxt 判据）；本仓为 DSH 插件 pnpm workspace（TypeScript + React + esbuild + CSS Modules），聚合层存在本仓专用 skill `dsh-plugin-writer`，经用户指认加载为设计硬约束。
- **D-元2（界面演示 gate）**：阶段 1.75 **触发**（C1 界面产出 ∧ C2 无设计依据 ∧ C3 须自定视觉布局，不命中排除表），分档 **L2**（多状态 + 交互流；视觉有 DSH 令牌体系与 B1 卡片方向依托，非 L3 开放方向）。演示页 `demos/workspace-defaults-page-l2.html`（方案速览 + 五状态：有档/空档/过滤中/降级/失败），自检通过（29.8KB 单文件零外链、console 无 error、390px 无横向溢出；本会话模型无图片输入，结构核对以 a11y 快照为证据），**用户已确认（2026-11-08）**。
- **D1 工作区宇宙读数面**：MCP+内置取插件上下文全局注册表 `ctx.tools.schemas()`（project-mcp catalog 同源先例），技能取 `skills.snapshot({cwd: workspacePath})`。被否：A1 会话视角投影（需扩座位份额 `currentSessionId`，波及三贡献方，且「页面不绑定会话」被弱化）；project-mcp 归属 API（插件私有，跨插件耦合绑版本）。
- **D2 会话形态不动**：`handleWorkspace` 仅 path 分支走新端口，`{sessionId}` 继续 `universeOf`——面板零回归。
- **D3 归组循环另写、叶子复用**：新模块按 `/inventory` 的 `MCP_SERVER_PATTERN` 分组；`panel.ts` 仅导出 `defaultsEntryOf` 叶子。被否：复用 `buildDefaultsUniverse`（其 `mcpPartsOf` 比 /inventory 正则宽、要求会话 `carried`，违背 Q8 归组纪律裁定）。
- **D4 未归组只计数**：`ungroupedMcp?: number`；不塞 builtin 组（`tool:mcp__x` 地址文法非法）。
- **D5 技能详情挂可选字段**：`DefaultsEntry` 增 `modelInvocable?/userInvocable?/source?`（parser 强制成对、仅 skill 地址）。
- **D6/D7 共用清单升级**：`DefaultsGroupList` 加 `query?/showDetails?` 两个可选参数；缺省时 DOM 与现行逐字一致；过滤算法在 `defaults-view.ts` 纯函数 `filterDefaultsView`，残差按未过滤宇宙求差集再筛（防「过滤污染残差」反例）。
- **D8 命令卡**：目标键注释 + `/tools workspace off <地址>` 模板 + 恒定边界说明（Q-A=a 裁定）；不发明 `--path` 命令。
- **D9 universe 保持可空**（Q-E 裁定）：null 仅作混合版本兜底，现有降级分支是安全网。
- **D10 删 h3**（Q4）：页面用 `<p class="cardTitle">`，可访问名由 holder tabpanel `aria-labelledby` 提供。
- **D11 页面正文拆新组件 `WorkspaceDefaultsPage`**；两段式清空状态留在编辑器（两形态共用）。
- **D12 刷新放概要卡**（Q3/C3 裁定），不碰 holder。
- **D13 不触达 contracts/workspace-config**（A2 无需会话身份）。
- **D14 技能来源标签用 locale 短标签表**（Q-D 裁定：进标签行；7 个 `skill.source.*` 键，未知值原样）。
- **全局并集近似警示 = 清单卡灰字注记**（Q-B=a 裁定）；**`ungroupedMcp` 与 `skillsComplete` 都进首版**（Q-C 裁定）。

## Risks / Trade-offs

- [全局并集近似：其他工作区的项目级服务器会出现在页面清单] → 灰字注记「写入仅保留意图」+ spec/README 明示；关闭不可见工具是 no-op，无破坏性。
- [`/inventory` 归组正则跨包双份（user-commands 与本插件）] → 注释互指锚点；正则是稳定文法契约，双份漂移风险低。
- [共用清单组件改动可能波及面板] → 参数缺省 = 旧渲染 + 既有面板断言全保留 + `git diff` 面板文件零改动断言。
- [wire 契约扩字段遇旧 host] → 全部可选字段 + `universe: null` 保持合法，页面走降级分支。
- [技能快照 `complete: false`（观测不完整）] → `skillsComplete` 字段 + 页面一句提示，不阻塞编辑。

## Migration Plan

无部署迁移（纯插件仓内变更，随 tag 发布）。执行顺序 G1→G8（见 `code-design.md` ⑤与 tasks.md 分组）；回滚 = revert 整个变更提交。

## Open Questions

无（规划期待决 Q-A~Q-E 已全部经用户裁定；设计假设 A1–A12 见 `code-design.md` ⑥，均为可在执行期核验的假设而非方向未决）。
