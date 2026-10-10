# Design

## D1 多仓 = 每仓一个分支芯片

- 芯片行由**枚举结果**驱动：`repos(sessionId)` 一次返回全部仓库及其状态快照，正好够渲染整行 chip（名称、当前分支、脏文件数、可用性），无需逐仓请求。
- 多仓时每个 chip 的动词都带**显式仓库路径**（含根仓），操作边界因此不依赖任何「当前选中仓」状态。
- 单仓工作区保持既有行为：只渲染一个 chip、标签只有分支名、动词不带显式路径（走会话工作区根）。
- 枚举失败（`repos()` 返回 null 或抛错）时回落到工作区根的单 chip 行为，芯片不会因为扫描失败而消失。
- 枚举进行中（`undefined`）不渲染 chip，避免出现半截的行。

## D2 删除总览面板与选中仓持久化

- 删除 `ReposOverview.tsx`、`selection.ts` 中的 `readSelectedRepo` / `storeSelectedRepo` / `resolveSelectedRepo` / `planChip` / `chipText` 与 `SELECTED_REPO_KEY_PREFIX`。
- 保留 `unionBranches`（组切换对话框的候选与覆盖率来源）与 `BranchUnionEntry`。
- 新增纯函数 `planChips(view)`：把枚举结果映射成芯片条目数组（根仓优先、其余按名称排序），并给出每个 chip 的显式路径、标签与可用性——保持「纯规则在 selection.ts、组件只做接线」的既有分层。

## D3 操作与视图分离：推入式操作面板（方案 A）

- `BranchPopover` 内部持有 `panel: 'list' | 'ops'` 状态（弹层关闭即卸载，状态自然复位）。
- 视图态：搜索框、脏文件行、分支列表、内联错误——**没有任何并排操作按钮**。
- 视图态底部只有一行「更多操作」，点击推入操作面板。
- 操作面板：顶部「返回分支列表」，正文按分组列出操作（分支：创建并检出新分支…、Git 图谱；Worktree：在 worktree 中开始新会话…、管理 worktree…；根仓追加组操作组），每项带一句说明文字，点击后打开对应宿主对话框并回到视图态。
- 选择推入面板而非下拉菜单：与「根仓操作面板多一组」的扩展需求一致，且不需要在弹层之上再叠一层浮层。

## D4 组操作归属根仓 + 组切换对话框

- `BranchPopover` 接受可选的 `groupOps` 回调集合；只有根仓 chip 传入，因此非根仓**结构上**不可能渲染组操作。
- 组切换从内联操作条改为宿主模态 `GroupSwitchDialog`：平铺候选（宿主 Pill）+ 覆盖率 `n/总数` + 确认/取消；候选为空时空态提示且确认禁用；请求失败内联停在对话框内。
- 组新建沿用既有 `GroupCreateDialog`（勾选仓库 + 基准 + 分支名），默认勾选非根仓的语义不变。
- 结果面板 `GroupResultPanel` 不变，仍支持失败仓单独重试。

## D5 一条 SSE 流覆盖多仓

- 现状：`/git/events?path=<一个路径>`，主机每 30s 轮询该路径的状态并推送。
- 平铺 chip 后所有仓库的分支都同时可见，只订阅一个路径会让其余 chip 长期停留在旧值。
- 逐仓各开一条 EventSource **不可接受**：浏览器同源 HTTP/1.1 连接池上限为 6，`sse-leader.ts` 的存在正是为此（每个插件流都会吃掉池子，跨标签页共享）。
- 方案：`/git/events` 接受**重复的 `path` 参数**（`?path=a&path=b`），一个订阅者持有路径数组；轮询对每个路径各算一次状态与 worktree 摘要，任一路径摘要变化即推送该次变更涉及的路径集合。
- 客户端 `subscribeChanges(paths, onChange)` 把路径**排序去重**后拼 query——URL 稳定，跨标签页的同工作区订阅才会被 relay 合并成一条连接；路径数为 0 时不建流。
- 上限：路径数超过 `MAX_EVENT_PATHS` 时截断（宿主侧同样校验），避免一个订阅者把轮询成本放大到无界。
- 纯逻辑（路径解析、摘要比较）抽到 `src/host/events.ts`，便于在没有 HTTP 夹具的测试环境里直接单测。

## D6 回落与边界

- 单仓工作区：单 chip、标签只有分支名、无组操作（既有回归要求不变）。
- 枚举失败：单 chip 走工作区根（`repoStatus(sessionId)`），不显示仓库名。
- 不可用仓库：chip 降级（虚线边框、降透明度）、点击无响应，标题给出仓库路径。
- 超长 `仓库名 · 分支`：chip 设最大宽度并以省略号截断，`title` 给出完整文本（chip 是原生按钮，title 足够；面板内的长分支名仍用宿主 Tooltip）。
- hero 座位：整行 chip 与 anchor 一起 portal 进官方 hero 行，机制不变；多仓换行由上下文行自身的 `flex-wrap` 承担。

## D7 契约钩子迁移

- 保留：`data-gitgraph-chip-anchor` / `-chip` / `-popover` / `-worktree-dialog` / `-worktree-manager` / `-group-dialog` / `-group-result` / `-group-notice`（迁移到组切换对话框的错误行）/ `-group-switch` / `-group-create` / `-group-base` / `-group-repo` / `-group-check` / `-group-submit` / `-outcome*` / `-dialog` / `-lanes` / `-glyph` / `-back`（操作面板的返回入口）。
- 新增：`data-gitgraph-chips`（芯片行容器）、`data-gitgraph-chip-repo`（每仓 chip 携带仓库路径）、`data-gitgraph-ops`（操作面板）、`data-gitgraph-ops-item`（操作项）、`data-gitgraph-group-switch-dialog`（组切换对话框）。
- 删除：`data-gitgraph-overview` / `-repo-row` / `-repo-path` / `-repo-selected` / `-group-bar` / `-group-branch`（总览及其内联组操作条随组件删除）。
- `data-dsh-part="worktree-create|worktree-manage"` 随操作项迁移到操作面板的行上，保持端到端可定位。

## D8 非目标与已知取舍

- 不修 `build.mjs` 的 CSS module 重命名缺陷（at-rule 内首条规则漏改写）；新 CSS 继续以 hook 选择器开场规避，另立变更。
- 不做 chip 溢出折叠（`+N`）；先以换行平铺观察真实工作区规模下的表现。
- Git 图谱泳道仍为字形（SVG 化需重做 core 泳道计算）。
- 轮询间隔保持 30s：多路径订阅把每轮的状态探测数从 1 提到 N，间隔过长会让外部变化延迟可见，过短会放大 git 进程开销；保持现状并以窗口聚焦、打开面板与本地操作后的主动刷新覆盖交互路径。

## D9 归档时的规格标识约束

`openspec archive` 对 MODIFIED 块按「场景名集合」比对：块中缺失主规格已有的场景名即判定为丢失并硬拦（ADDED 与 REMOVED 同名同样被拒，RENAMED 只匹配 `### Requirement:` 头）。因此**场景标识一经归档便不可改名**。本变更涉及两处改名，按各自语义分别处理：

- `每仓状态聚合`：需求正文与既有场景语义未变，只有 `总览一次取回全部状态` 的 WHEN 指向已删除的总览入口。保留该场景标识（它描述的是「一次取回全部状态」的聚合特性），把 WHEN 改指新的聚合消费者——芯片行渲染。
- `变更推送`：订阅模型由「单个选中仓」改为「一条共享流覆盖全部被枚举仓库」，需求正文与场景前提同时改变，故整条需求走 REMOVED（附 Reason / Migration），由新增的 `多仓变更推送` 承接，场景标识随之更新为 `枚举结果变化后重订阅`。

其余四个 MODIFIED 块的场景名与主规格逐字一致，未触发该约束。
