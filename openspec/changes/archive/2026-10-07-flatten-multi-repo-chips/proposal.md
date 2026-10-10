# Proposal

## Why

多仓工作区当前走「单 chip → 全仓总览面板 → 推入某仓详情」两级导航，组操作条内联在总览底部，分支弹层底部又并排堆着 4 个操作按钮。实际使用中这套结构有三个问题：

1. **多仓比单仓更绕**：单仓点 chip 直接看到分支列表，多仓却要多点一层总览、再点一层仓库，才能看到某个仓库的分支。
2. **看不到全局**：只有打开总览时才能同时看到各仓当前分支与脏文件数；关掉弹层后信息全部隐藏，外部切换分支也不易察觉。
3. **操作与视图混装**：弹层上半是视图（搜索 + 分支列表），下半却是操作按钮区；操作越多，视图被挤得越短。

用户明确要求：多仓与单仓同构——**输入框上方平铺各仓库自己的分支 chip**，点开即该仓的分支面板；**组操作合并到根仓库的分支 chip 下**。

## What Changes

- **多仓平铺分支 chip**：上下文行渲染每个被枚举仓库各一个 chip（根仓优先，其余按名称排序），标签为 `仓库名 · 分支`，脏文件数用徽章给出，不可用仓库降级且不可点开。每个 chip 直接打开**该仓自己的分支面板**，操作只作用于该仓。
- **移除全仓总览面板**：不再有「总览 ⇄ 推入详情」两级导航，也不再有选中仓的 localStorage 持久化。
- **操作与视图分离（推入式操作面板）**：分支面板只保留视图（搜索、分支列表、脏文件行、内联错误）；底部收敛为单一「更多操作」入口，推入操作面板，按「分支 / Worktree」分组列出创建分支、Git 图谱、worktree 会话、worktree 管理，并可返回分支列表。
- **组操作归属根仓**：只有根仓 chip 的操作面板多出一组「组操作」（组切换… / 组新建…）；非根仓 chip 不含任何组操作痕迹。
- **组切换改为对话框**：由内联操作条改为宿主模态——平铺候选分支名 + 覆盖率（`n/总数`）+ 确认；无候选时空态且不可执行；结果仍由既有结果面板逐仓汇报。
- **推送订阅覆盖全部枚举仓库**：`/git/events` 接受重复 `path` 参数，一条 SSE 连接即可覆盖工作区全部仓库；客户端按枚举结果订阅，任一仓库发生外部变化即刷新全部 chip。这是必要的宿主侧改动——浏览器同源连接池上限为 6，逐仓各开一条 EventSource 不可接受。
- 非目标：Git 图谱泳道改 SVG/分色曲线；`/git/*` 其余路由语义；core 类型与既有宿主测试的语义变更；新增任何运行时依赖。

## Capabilities

### New Capabilities

（无：全部改动落在既有多仓 git 能力之内。）

### Modified Capabilities

- `dsh-multi-repo-git-graph`：删除「全仓总览呈现」「单仓钻取与操作隔离」两项要求，新增「多仓平铺分支芯片」「操作与视图分离」「组操作归属根仓」；修改「组切换候选的平铺选择」（移入对话框）、「宿主组件体系一致性」（对话框清单含组切换）、「操作反馈与忙碌态」（按仓库面板表述）、「变更推送」（一条流覆盖全部枚举仓库）、「每仓状态聚合」（场景措辞）。

## Impact

- **修改**：`src/client/` 渲染层——`chips/BranchChip.tsx`（重构为多 chip）、`chips/BranchPopover.tsx`（操作面板）、`repos/selection.ts`（精简）、`repos/GroupCreateDialog.tsx`（措辞/归属不变）、新增 `repos/GroupSwitchDialog.tsx`、两个 CSS module、`locales.ts`；`src/client/api.ts`、`src/client/verbs.ts`、`src/client/index.ts`（订阅签名改为仓库路径数组）。
- **删除**：`src/client/repos/ReposOverview.tsx`；`selection.ts` 中的选中仓持久化与 `planChip`/`chipText`。
- **宿主**：`src/host/routes.ts`（SSE 多路径）+ 新增纯逻辑模块 `src/host/events.ts`；新增测试 `test/host-events.test.ts`。
- **不变**：`src/core/`、`src/index.ts`、`src/invariant.ts`、`build.mjs`、`package.json`（无新依赖、externals 不变）、既有 4 个测试文件。
- **产物契约**：客户端 bundle externals 仍恰为 `react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`；bundle id 与 `window.__ModuleLoader__.load` 形态不变。
- **文档**：`README.md` 的「界面」章节同步更新。
