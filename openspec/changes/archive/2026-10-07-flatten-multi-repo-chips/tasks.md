# Tasks

## 1. 宿主：一条流覆盖多仓

- [x] 1.1 新增 `src/host/events.ts`：`MAX_EVENT_PATHS`、`parseEventPaths(params)`（重复 `path` 参数、去空、去重、保序、截断）与摘要比较助手（`pollDigestKey` / `collectChanges`）。
- [x] 1.2 `src/host/routes.ts`：`Subscriber` 改为持有路径数组与逐路径摘要表；`sse` 处理器用 `parseEventPaths` 建订阅；`runPoll` 对每个路径各算状态与 worktree 摘要，仅推送发生变化的路径集合。
- [x] 1.3 新增 `test/host-events.test.ts`：路径解析（单个/多个/重复/空值/编码/超限截断）与摘要变化检测（无变化不推送、变化推送对应路径、首次轮询推送全部、worktree 列表失败保持上一次摘要）——18 个用例。
- [x] 1.3b 新增 `test/host-events-route.test.ts`：路由级集成（伪造 req/res + 假定时器 + 真实 I/O 冲刷）——多路径订阅首轮推送全部、稳态不推送、单仓变化只推送该路径、单路径订阅保持可用、无 `path` 回 400（3 个用例）。
- [x] 1.4 客户端接线：`api.ts` 的 `subscribeChanges(paths, onChange)`（排序去重、0 路径不建流）；`verbs.ts` 签名改为 `repoPaths?: readonly string[]`；`index.ts` 未给路径时回落到会话工作区根。

## 2. 客户端：平铺分支芯片

- [x] 2.1 `repos/selection.ts` 精简：保留 `unionBranches`/`BranchUnionEntry`；删除选中仓持久化、`planChip`、`chipText`、`ChipSurface`；新增 `planChips(view, fallback)` 与 `ChipEntry`/`chipLabel`。
- [x] 2.2 `chips/BranchChip.tsx` 重构：按枚举结果渲染每仓一个 chip（根仓优先、`仓库名 · 分支`、脏文件徽章、不可用降级）；每个 chip 打开本仓分支面板；移除总览面板状态机与选中仓持久化。
- [x] 2.3 回落路径：单仓工作区单 chip（标签只有分支名、动词不带显式路径）；枚举失败回落工作区根单 chip；枚举中不渲染。
- [x] 2.4 订阅改为按枚举仓库集合订阅，任一推送即重新枚举；窗口聚焦与打开面板同样触发刷新（保持 5s 节流）。

## 3. 客户端：操作与视图分离（方案 A）

- [x] 3.1 `chips/BranchPopover.tsx`：视图态只留搜索、脏行、分支列表、内联错误；底部收敛为单一「更多操作」行。
- [x] 3.2 操作面板：返回入口 + 按「分支 / Worktree」分组的操作项（图标、标题、一句说明），点击打开对应宿主对话框。
- [x] 3.3 根仓专属：`groupOps` 传入时操作面板追加「组操作」分组（组切换… / 组新建…）；非根仓不传，结构上不可见。
- [x] 3.4 移除弹层内的仓库返回头（不再有总览可返回），保留仓库名标签供操作面板使用。

## 4. 客户端：组操作对话框化

- [x] 4.1 新增 `repos/GroupSwitchDialog.tsx`：宿主 Modal + 平铺候选（宿主 Pill）+ 覆盖率 + 空态 + 忙碌禁用 + 内联错误。
- [x] 4.2 `BranchChip`：打开对话框时拉取全仓分支并计算并集；提交后走既有 `groupSwitch` 动词，结果交结果面板；失败内联在对话框。
- [x] 4.3 删除 `repos/ReposOverview.tsx`；`repos.module.css` 清理总览与内联组操作条样式，保留对话框所需样式。

## 5. 文案、样式与文档

- [x] 5.1 `locales.ts`：新增 `ops.*`、`group.switch.*`、`chip.aria.branchRepo`；删除总览专属键（`repos.title`/`summary`/`rowAria`/`back`/`groupSection`/`groupBranch`/`groupSwitch`/`groupCreate`/`status.*`）；zh/en 键集保持一致。
- [x] 5.2 两个 CSS module：芯片行（换行、最大宽度截断、脏徽章、降级态）、操作面板（分组标题、操作项、说明行）、组切换对话框；未在 at-rule 内以裸类名开场。
- [x] 5.3 `README.md`「界面」章节同步为平铺 chip + 操作面板 + 组切换对话框 + 单流订阅。
- [x] 5.4 契约脚本更新：36 个钩子、总览钩子退役断言、七个对话框、平铺架构与订阅契约断言。

## 6. 验证

- [x] 6.1 `pnpm run typecheck` 通过（无输出）。
- [x] 6.2 `pnpm test` 通过：6 个文件 / 80 用例（新增宿主事件纯函数 18 个 + 路由级集成 3 个）。
- [x] 6.3 `pnpm run build` 通过；bundle externals 与 bundle id 不变；产物比源码新。
- [x] 6.4 契约脚本通过：ALL CONTRACT CHECKS PASSED。
- [ ] 6.5 人工视觉走查（用户）：浅色/深色下多仓平铺 chip 的换行与截断、每仓面板、根仓操作面板的组操作分组、组切换对话框、非根仓无组操作。

## 落地记录（apply 阶段）

- **钩子变化**：新增 `data-gitgraph-chips` / `-chip-repo` / `-ops` / `-ops-item`（取值为操作 id）/ `-more` / `-group-switch-dialog`；退役 `-overview` / `-repo-row` / `-repo-selected` / `-repo-header` / `-group-bar` / `-group-branch` / `-group-create`（组新建入口改由 `data-gitgraph-ops-item="group-create"` 定位，另有 `data-dsh-part="group-create"`）。`-group-switch` 从总览按钮移到组切换对话框的确认按钮；`-group-notice` 移到对话框的加载/空态行。
- **组操作归属的兜底**：工作区根不是仓库时没有 primary 行，此时由行内第一个 chip 承载组操作，避免组操作不可达（已写入 `BranchChip` 注释与设计 D4）。
- **订阅成本**：宿主轮询间隔保持 30s，但每订阅者现在对每个被订阅路径各做一次 status + worktree 探测；路径数由 `MAX_EVENT_PATHS = 64` 截断。
- **宿主验证口径**：`/git/events` 的多路径分发由纯函数单测（18）与路由级集成测试（3，伪造 req/res + 假定时器驱动 30s 轮询）共同覆盖；测试需在假定时器下额外冲刷真实 I/O（轮询链里有 `realpath`），否则断言会早于 fs 回调。仍未做真实浏览器端到端验证，多 chip 的刷新行为需人工走查（任务 6.5）。
- **保留的既有取舍**：`build.mjs` 的 CSS module 重命名缺陷未修（新 CSS 未受影响，因未在 at-rule 内以裸类名开场）；Git 图谱泳道仍为字形。
- **提交与归档**：实现与三份变更工件已提交为 `ba5e0ec`（`lib/` 按 README 的既定决定不入库，由 `pnpm run build` 生成）；随后按硬依赖顺序归档三个变更。

## Workflow follow-up

归档顺序（硬依赖）：`add-git-graph-multi-repo` → `improve-git-graph-multi-ui` → `flatten-multi-repo-chips`；归档后确认 `openspec/specs/dsh-multi-repo-git-graph/spec.md` 吸收了三份 delta（本变更移除三项、新增四项、修改四项）。归档时 `变更推送` 因订阅模型改变按 REMOVED + ADDED 改名为 `多仓变更推送`，`每仓状态聚合` 保留场景标识并改指芯片行（原因见 design.md D9）。
