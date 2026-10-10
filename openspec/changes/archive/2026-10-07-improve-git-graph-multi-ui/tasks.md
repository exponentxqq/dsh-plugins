# Tasks

## 1. 弹层与总览改造

- [x] 1.1 分支弹层与总览面板容器改用宿主 `MenuSurface compact`（表面材质交给宿主，插件 CSS 只保留绝对定位、尺寸与滚动），分支弹层宽度调整为 300px；验证：`pnpm run typecheck` 通过，且构建产物仍含 `data-gitgraph-popover` 与 `data-gitgraph-overview` 钩子
- [x] 1.2 分支弹层搜索框改用宿主 `Input`（前导搜索图标）并保留 `autoFocus`；验证：`pnpm run typecheck` 通过，弹层内不再存在自绘 `.searchBox`/`.searchInput` 结构
- [x] 1.3 长分支名提示改用宿主 `Tooltip`（portal、约 400ms 延迟、仅超长名启用），删除自制 dwell/视口翻转状态与 `data-tip` 伪元素样式；验证：源码与 CSS 中不再出现 `data-tip` 相关逻辑（grep 为 0），`pnpm run typecheck` 通过
- [x] 1.4 分支行细节：当前分支行以品牌色淡背景标示，切换进行中的行以宿主 `IconLoadingOutline` 呈现旋转忙碌态（`prefers-reduced-motion` 下禁用过渡）；验证：CSS 含 reduced-motion 规则，`pnpm run typecheck` 通过
- [x] 1.5 弹层底部四项入口改用语义化图标（创建分支 / Git 图谱 / worktree 会话 / worktree 管理），不再复用同一分支图标；验证：四个入口各自引用不同图标，`pnpm run build` 成功
- [x] 1.6 总览行重排：删除 11px 表头三列布局，每行呈现宿主 `StateDot` 状态点（干净 / 脏 / 不可用）、仓库名（根仓用 `Tag`）、次要色分支名与警示 `Tag` 脏文件数（>0 时，title 复用 `branch.dirty`）；验证：`pnpm run typecheck` 通过，产物仍含 `data-gitgraph-repo-row` 与 `data-gitgraph-repo-path`
- [x] 1.7 组切换候选由原生 `<select>` 改为可点选的 `Pill` 平铺列表（含覆盖率后缀、`aria-pressed`、max-height 滚动、无候选时空态提示且按钮不可用），`data-gitgraph-group-branch` 钩子移到候选容器；验证：总览源码不再出现 `<select>`（grep 为 0），`pnpm run typecheck` 通过
- [x] 1.8 未贴皮浅色主题兜底：在 stock-light fallback 作用域内补 `--dsw-menu-surface-fill` 字面量，保证菜单表面在该主题下仍可见；验证：CSS 中命中该变量定义，`pnpm run build` 成功

## 2. 六个对话框改用宿主 Modal

- [x] 2.1 `CreateBranchDialog` 改宿主 `Modal`（footer 承载动作）+ 宿主 `Input` + `Button`，busy 时 `onClose` 传 guard，初始焦点用 `data-modal-autofocus`；验证：`pnpm run typecheck` 通过，组件内不再引用自绘 `.dialog` 类
- [x] 2.2 `CreateWorktreeDialog` 改宿主 `Modal` + `Input` + `Button`，基线分支选择由原生 `<select>` 改为宿主 `Menu` 下拉（当前分支高亮）；验证：组件内不再出现 `<select>`，`pnpm run typecheck` 通过
- [x] 2.3 `GraphDialog` 改宿主 `Modal`（`className` 覆盖宽度，保持 `min(760px, 100vw - 48px)`），refs 改用 `Tag`（当前分支 `info` 色调）、保留等宽 oid 与字形泳道、加载更多改 `Button`；验证：`pnpm run typecheck` 通过，产物仍含 `data-gitgraph-lanes` 与 `data-gitgraph-glyph`
- [x] 2.4 `WorktreeManager` 改宿主 `Modal`，徽章改 `Tag`、删除/强制删除改 `Button`、"同时删除分支"勾选改宿主 `Checkbox`，行内强制确认流程保留；验证：`pnpm run typecheck` 通过，行内确认相关文案键仍被引用
- [x] 2.5 `GroupCreateDialog` 改宿主 `Modal`，仓库勾选改宿主 `Checkbox` 行（根仓 `Tag`），基准由原生 `<select>` 改为宿主 `SegmentedControl`，分支名输入改宿主 `Input`；验证：组件内不再出现 `<select>`，`pnpm run typecheck` 通过
- [x] 2.6 `GroupResultPanel` 改宿主 `Modal`，逐仓结果徽章改用 `Tag` 的语义色调（成功 / 跳过 / 失败 / 未执行），重试改 `Button`，忙碌态禁用；验证：`pnpm run typecheck` 通过，产物仍含 `data-gitgraph-group-result`、`data-gitgraph-outcome` 与 `data-gitgraph-group-retry`
- [x] 2.7 清理自绘对话框与徽章样式：删除两个 CSS module 中的 `.dialog*`、`.dialogBackdrop`、`.badge*` 等已无引用的规则；验证：`grep` 确认无组件再引用被删类名，`pnpm run build` 成功且产物 CSS 类数量下降

## 3. 反馈、忙碌态、文案与文档

- [x] 3.1 单仓切换成功改宿主 `Toast`（按次序号 key 挂载、`onDone` 卸载），删除内联成功横幅与 900ms 自动关闭定时器，失败原因继续内联停留；验证：`pnpm run typecheck` 通过，源码中不再出现成功横幅相关分支（grep 为 0）
- [x] 3.2 忙碌态与重复提交防护：组操作按钮、组切换候选、重试按钮在请求进行中禁用，对话框在 busy 时遮罩/Escape 不关闭；验证：`pnpm run typecheck` 通过，逐组件核对 busy 传入路径
- [x] 3.3 文案：`locales.ts` 新增组操作分区标题与空态提示等键（zh 为键集来源），`en` 补齐同键；验证：以 node 断言两字典键集完全一致且数量相等
- [x] 3.4 更新 `dsh/plugins/git-graph-multi/README.md` 的界面说明（组切换候选为平铺选择、成功反馈为 Toast、对话框采用宿主模态）；验证：文档描述与实现一致，`grep` 命中更新后的说明段落

## 4. 集成验证与产物契约

- [x] 4.1 质量门禁全绿：在 `dsh/plugins/git-graph-multi/` 依次运行 `pnpm run typecheck`、`pnpm test`、`pnpm run build`；验证：类型检查无错误、既有 4 个测试文件全部通过（数量与改动前一致）、构建产出 `lib/index.js`、`lib/invariant.js`、`lib/client.js`
- [x] 4.2 产物契约校验：客户端 bundle 的 externals 仍恰为 `react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`，primitives 未被内联，bundle id 与 `window.__ModuleLoader__.load` 壳不变，`data-gitgraph-*` 钩子齐全；验证：对 `lib/client.js` 运行 externals 与钩子的脚本化断言
- [ ] 4.3 人工视觉走查（需用户执行）：刷新浏览器后分别在浅色与深色主题下走查总览⇄单仓推入返回、组切换/组新建/失败重试、Toast、六个对话框与 Git 图谱；验证：用户确认观感与交互符合预期，无遮挡、错位或不可读文本

## Workflow follow-up

- 归档顺序（硬依赖）：本变更以 MODIFIED 修改 `dsh-multi-repo-git-graph`，必须先归档 `add-git-graph-multi-repo`（生成 `openspec/specs/dsh-multi-repo-git-graph/spec.md`），再归档本变更；顺序颠倒时 `openspec archive` 会以“target spec does not exist”拒绝。
- 归档本变更后校验 `openspec/specs/dsh-multi-repo-git-graph/spec.md` 中的「全仓总览呈现」已更新，且新增的三条需求（组切换候选的平铺选择、宿主组件体系一致性、操作反馈与忙碌态）已并入主 spec。
- 按既定要求，本次改动不提交 git；提交由用户另行决定。

## 落地记录（apply 阶段）

- 门禁实测：`pnpm run typecheck` 0 错误；`pnpm test` 4 文件 / 59 用例全过（与改动前一致）；`pnpm run build` 产出 `lib/index.js`、`lib/invariant.js`、`lib/client.js`；产物契约脚本全绿——externals 恰为 `@deepseek-ai/dsh-client-ui-primitives` / `react` / `react-dom` / `react/jsx-runtime`，primitives 未被内联，bundle id 与 `window.__ModuleLoader__.load` 壳不变，37 个 `data-gitgraph-*` 钩子齐全，产物 CSS 109 个类名全部作用域化，源码无原生 `<select>` / 原生 checkbox / `data-tip` / 自绘 `.dialog` 引用。
- 实际改动文件：`src/client/chips/{BranchChip,BranchPopover,Chip,CreateBranchDialog,CreateWorktreeDialog}.tsx`、`src/client/chips/context.module.css`（924 → 649 行）、`src/client/graph/GraphDialog.tsx`、`src/client/worktrees/WorktreeManager.tsx`、`src/client/repos/{ReposOverview,GroupCreateDialog,GroupResultPanel}.tsx`、`src/client/repos/repos.module.css`（628 → 398 行）、`src/client/locales.ts`、`README.md`。
- 文案键：新增 `repos.groupSection`、`repos.noUnion`、`repos.status.clean`、`repos.status.dirty`；删除因去表头而失效的 `repos.column.name|branch|dirty` 与 `repos.branchPlaceholder`；zh/en 键集各 99 键且完全一致。
- 定位钩子落点变化（宿主组件不透传 DOM 属性）：`data-gitgraph-dialog` / `-worktree-dialog` / `-worktree-manager` / `-group-dialog` / `-group-result` 现挂在 `Modal` 内部最外层内容元素上（仍可用 `closest('[role="dialog"]')` 定位对话框根，但 footer 动作按钮是其兄弟节点）；`data-gitgraph-group-check` / `-group-base` / `-outcome-badge` 同样移到包裹元素（勾选点击请用 `[data-gitgraph-group-repo="…"] input`）；`data-gitgraph-group-branch` 按计划从 `<select>` 移到候选容器。
- 发现但未修的构建缺陷（不属本变更范围）：`build.mjs` 的 CSS module 重命名正则 `/(^|\})([^{}]*)\{/g` 漏掉 at-rule 内的第一条规则，使其以裸类名发布而永不匹配。本变更以「hook 选择器开场」规避（`@media (prefers-reduced-motion: reduce) { [data-gitgraph-repo-row] … }`）；建议后续单独修 `build.mjs` 并清理历史死规则。
- 宿主控件能力边界（记录以免误判）：`Pill` 无 `:disabled` 视觉态（busy 时仅失效、不置灰）；`Modal` 头部关闭按钮无法 `disabled`（busy 时由 `onClose` guard 拦住）；`Checkbox` / `Tag` / `SegmentedControl` / `StateDot` / `Pill` 不透传 DOM 属性；stock-light 兜底仅补 `--dsw-menu-surface-fill`，未补 `--dsw-menu-backdrop-filter`（只有填充无模糊，不影响可读性）。
- 主动偏离（均有理由）：`GraphDialog` 的 `onClose` 未加 busy guard——`loading` 覆盖首次加载，加 guard 会在请求卡住时把用户困在模态里，改以「加载更多」禁用防重复提交；总览选中行改用品牌色淡背景以区别于 hover；组切换候选对超长分支名补宿主 `Tooltip`（`Pill` 不能作为 Tooltip 锚点，故用 `inline-flex` 槽位 span 包裹）；分支弹层返回入口与弹层内所有按钮统一改宿主 `Button`（不保留任何自绘按钮样式）。
- 生效方式：仅客户端半变更，构建产物经 HTTP 下发，浏览器刷新页面即生效，无需重启 dsh 容器；任务 4.3 的人工走查待用户执行。
