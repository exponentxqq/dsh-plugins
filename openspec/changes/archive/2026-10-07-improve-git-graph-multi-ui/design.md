# Design

## Context

- 客户端渲染层现状：`dsh/plugins/git-graph-multi/src/client/` 下 6 个对话框、分支弹层、总览面板、结果面板与芯片全部为手写控件（原生 `<select>`、原生 checkbox、自制 fixed 浮层 + 手工 z-index、自绘徽章配色），配套约 1500 行 CSS module。上游 fork 遗留的观感与宿主 DSH Web GUI 不一致。
- 宿主组件库 `@deepseek-ai/dsh-client-ui-primitives` 已是该插件客户端 bundle 的唯一 UI external（`build.mjs` 的 externals 声明），运行时由 ModuleLoader 提供完整模块；官方客户端插件（如 `dsh-client-ui-agent-preset`、`dsh-client-ui-approval`）在运行时同样从中取用 `Button` / `Modal` / `Tag` / `Tooltip` / `StateDot` / `SegmentedTabs` / `Toast` / `Menu`，因此复用该库不增加依赖与体积成本。
- 构建管线约束：CSS module 由 `build.mjs` 的 esbuild 插件编译为运行时 `<style>` 注入，类名带 `ggm_<name>_<hash>` 前缀；宿主组件的样式由宿主自身加载，插件只需提供布局/组合类。
- 规格约束：本变更修改的能力 `dsh-multi-repo-git-graph` 目前只存在于未归档的变更 `add-git-graph-multi-repo` 中，`openspec/specs/` 尚未有该能力的主 spec（见 Decisions D12）。
- 既定要求：本次不提交 git；`data-gitgraph-*` 定位钩子需保留，供尚未完成的 GUI 走查使用。

## Goals / Non-Goals

**Goals:**

- 把界面控件统一到宿主组件体系，使插件在浅色/深色主题下与宿主观感一致，同时删除自绘控件及其 CSS。
- 重排多仓总览的信息层级：仓库状态、根仓标记、脏文件数一眼可辨；组切换候选一屏可见且带覆盖率。
- 六个对话框获得宿主模态的既有能力：遮罩模糊、Escape/遮罩关闭、焦点归还、统一层级。
- 保持运行时契约不变：externals、bundle id、ModuleLoader 壳、`/git/*` 路由与 SSE 语义、`data-gitgraph-*` 钩子全部不动。

**Non-Goals:**

- Git 图谱泳道的 SVG 化与分色（需重做 `src/core` 的泳道计算以输出跨行连线，另立变更）。
- 任何 host/core/API/SSE 行为变更；任何新运行时依赖；`build.mjs` 与 externals 调整。
- 视觉回归自动化测试（无浏览器测试基础设施），本变更以类型检查、构建校验与人工走查验收。

## Decisions

### D1 采用宿主 primitives 作为唯一 UI 组件体系

界面控件改为 `Button` / `Modal` / `Tag` / `Pill` / `StateDot` / `Checkbox` / `Input` / `SegmentedControl` / `Tooltip` / `Toast` / `MenuSurface`，CSS module 退化为布局与组合职责。
**理由**：宿主组件自带主题 token、浅深色适配与交互状态，观感与宿主一致；官方客户端插件已是同一用法。
**备选**：仅做 CSS 打磨（原生 `<select>` 的观感无法根治，且六个自制模态仍与宿主不一致）；混合方案（保留自制模态只改配色，收益有限且长期维护两套控件）。

### D2 六个对话框统一改走宿主 `Modal`

创建分支、创建 worktree、Git 图谱、worktree 管理、组新建、组操作结果全部换成 `Modal`（title / description / footer / closeLabel），删除自制浮层与 `.dialogBackdrop`。
**理由**：Escape、遮罩点击、焦点归还、层级（宿主 z-index 1000）、遮罩模糊由宿主统一实现，删除约 500 行自绘样式与手工 z-index 协调。
**备选**：保留自制浮层仅重绘样式——仍需自行维护焦点与层级，且与宿主其它对话框观感不同。
**细节**：维持条件挂载（`open` 恒 true）；busy 时给 `onClose` 传 guard，使遮罩/Escape 不中断进行中的操作（与现状语义一致）；初始焦点用 `data-modal-autofocus` 而非 React `autoFocus`，以保留焦点归还；GraphDialog 通过 `className` 覆盖默认宽度，保持 `min(760px, 100vw - 48px)`。

### D3 组切换候选改为 Pill 平铺选择

原生 `<select>` 换成可点选的 `Pill` 列表（`aria-pressed` 标记选中），Pill 内含覆盖率后缀（如 `feat/x ·2/4`），wrap 布局并设 max-height 滚动；无候选时显示空态提示且组切换不可执行。
**理由**：候选通常只有个位数，一屏平铺零点击成本即可比较覆盖率与选中；原生下拉在深色主题下观感最差。
**备选**：宿主 `Menu` 下拉（紧凑但需两次点击、覆盖率藏进二级层）；保留原生 select 仅重绘（无法根治）。

### D4 总览行去表头，每行以状态点 + Tag 自描述

删除 11px 表头三列布局；每行 = 状态点（干净 / 脏 / 不可用，用户确认每行都打点）+ 仓库名（根仓用 `Tag`）+ 分支名（次要色）+ 脏文件数（>0 时用警示 `Tag`，title 复用既有 `branch.dirty` 文案；干净时不显示 0）。
**理由**：自描述行的信息密度与呼吸感优于 11px 表头小表格；状态点提供无需阅读数字的即时判断。
**备选**：保留表头只换控件（“小表格”观感仍在）；仅异常行打点（用户已明确选择每行都打点）。

### D5 成功反馈用宿主 `Toast`，失败保持内联

单仓切换成功后弹层直接关闭并挂载 `Toast`（`tone="success"`，按次序号 key 挂载、`onDone` 卸载）；失败原因继续内联停留在面板/对话框中；组操作结果仍由结果面板逐仓汇报。
**理由**：Toast 在弹层关闭后仍可见，确认信息不会随弹层消失；失败往往带原因与文件路径，需要停留阅读且要与重试按钮共存。
**备选**：全部内联（确认信息随弹层消失）；失败也用 Toast（长文本一闪而过，且无法与重试按钮共存）。

### D6 长名提示改用宿主 `Tooltip`

删除自制 500ms dwell / 视口翻转 / `data-tip` 伪元素逻辑（约 60 行），改用 `Tooltip`（`portal`、`delayMs≈400`、仅名称超阈值时启用）。
**理由**：宿主 Tooltip 自带视口适配与 portal，避免被滚动容器裁剪；净减代码。
**备选**：保留自制实现（可用但重复造轮子，且与宿主提示气泡观感不一致）。

### D7 弹层容器改 `MenuSurface compact`，保留自身定位

分支弹层与总览面板以 `MenuSurface` 承载表面（半透明菜单材质、统一圆角与阴影），自身的绝对定位、尺寸与滚动仍由插件 CSS 负责；分支弹层宽度由 280px 调整为 300px。
**理由**：与宿主菜单同一材质；`MenuSurface` 只画表面与 macOS backing，不接管定位，改动面小。
**细节**：未贴皮浅色壳下 `--dsw-menu-surface-fill` 可能缺省，需在既有 stock-light fallback 块内补字面量兜底（作用域仍限于插件锚点）。

### D8 Git 图谱保留字形泳道，仅精修周边

泳道继续用等宽字形（`● ◆ │`）渲染；本次只把 refs 换成 `Tag`（当前分支用 `info` 色调）、调整行距与元信息排版、外壳换 `Modal`。
**理由**：全彩 SVG 曲线需要 `computeLanes` 输出跨行连线（列→列边），属于 core 逻辑重做 + 新渲染器 + 测试补充，工作量大于本次其余改动之和。
**备选**：同模型简单 SVG 化（观感提升有限、收益不抵改动）。

### D9 图标语义化与芯片细节

分支弹层底部四项入口改用语义化图标（创建 / 图谱 / worktree 会话 / 管理），不再全部复用分支图标；芯片展开时箭头旋转 180°（`prefers-reduced-motion` 下禁用过渡）；进行中的行以宿主 `IconLoadingOutline` 呈现旋转忙碌态。

### D10 运行时契约与构建产物不变

不改 `build.mjs`、`package.json`、externals 与 `lib/` 产物形态；primitives 必须保持 external，不得被内联进客户端 bundle。
**理由**：本次是渲染层替换，不涉及加载契约；产物校验可机器验证。

### D11 `data-gitgraph-*` 钩子全保留

所有定位钩子（`data-gitgraph-overview`、`repo-row`、`group-bar`、`group-branch`、`group-switch`、`group-create`、`group-result`、`group-retry` 等）在改造后保留；`group-branch` 从 `<select>` 移到候选容器上。
**理由**：尚未完成的 GUI 走查与后续排查依赖这些稳定钩子；`locales` 键仅新增少量（组操作分区标题、空态提示），其余复用。

### D12 归档顺序依赖（本变更的规格约束）

本变更以 MODIFIED 修改 `dsh-multi-repo-git-graph`，而该能力的主 spec 尚未由 `add-git-graph-multi-repo` 归档生成；`openspec validate --strict` 已通过，但归档会因目标 spec 不存在而拒绝。
**决定**：保持 MODIFIED 建模，并记录依赖——本变更 MUST 在 `add-git-graph-multi-repo` 归档之后归档。若顺序颠倒，需先归档前一个变更再归档本变更。
**备选**：改为新建能力 `dsh-git-graph-ui`（ADDED-only，可独立归档）——被否，因其与既有能力的「全仓总览呈现」等需求语义重叠，将来需人工合并。

## Risks / Trade-offs

- [宿主 `Modal` 的 z-index（1000）高于插件弹层（100）] → 组操作结果面板/组新建对话框在总览之上打开，与现状语义一致；总览在对话框打开期间由既有逻辑关闭或保持在下层，需在实现后逐一确认六个对话框的打开/关闭路径。
- [未贴皮浅色壳缺少菜单表面 token] → 在 stock-light fallback 块内补 `--dsw-menu-surface-fill` 字面量，作用域限于插件锚点。
- [`Tooltip` 替换自制逻辑带来行为差异（延迟、portal 定位）] → 保留“仅长名才提示”的门槛与相近延迟；若观感不佳可调参数，不涉及规格。
- [Pill 候选在分支很多时撑高面板] → 候选区设 max-height 与滚动；极端情况下仍可滚动浏览。
- [移除原生控件影响键盘可达性] → 全部使用宿主组件的原生语义（button/Pill 的 `aria-pressed`、`Checkbox` 的原生 input、`SegmentedControl` 的 tablist），保持键盘可操作。
- [无自动化视觉回归] → 验收依赖人工走查（浅色/深色、总览⇄单仓、组操作与重试、六个对话框）；类型检查、测试与构建作为机器门禁。
- [归档顺序颠倒导致归档失败] → 见 D12；在 tasks 中显式记录归档前置条件。

## Migration Plan

1. 按 tasks 顺序改造渲染层（弹层/总览 → 对话框 → 反馈与细节 → 文案与文档）。
2. 质量门禁：`pnpm run typecheck`、`pnpm test`（既有 4 个测试文件必须原样通过）、`pnpm run build`；随后校验客户端产物 externals 与 bundle id 不变、primitives 未被内联。
3. 生效方式：本次只改客户端半，构建产物经 HTTP 下发，浏览器刷新页面即生效，无需重启 dsh 容器。
4. 回滚：还原渲染层源码后重新构建即可（`lib/` 为构建产物，不入库）；不涉及数据或服务端迁移。

## Open Questions

- 未贴皮浅色主题下 `MenuSurface` 材质的实际观感（fallback 字面量已兜底，若仍不理想再微调，不影响规格与任务拆分）。
