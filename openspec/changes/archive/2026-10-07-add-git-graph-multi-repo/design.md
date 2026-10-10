# Design

## Context

本设计基于现有实现的最小偏离：本机在装的 `@linxin666/dsh-client-ui-git-graph@0.4.5`（Apache-2.0，源码随包发布）已提供一套完整的 `/git/*` 服务面与分支芯片 UI。见 proposal.md 的动机说明，此处只列约束：

- **门控现状**：host 侧 `createWorkspaceGate` 用 realpath 规范化后与注册工作区路径**全等**匹配，随后用 `git rev-parse --show-toplevel` 解析仓库根——因此只能操作工作区根那一个仓库。
- **客户端现状**：所有 git 动词经 `GitGraphInjected` 注入，路径由 `sessionId → sessions.byId[sessionId].cwd` 解析；UI 组件是纯 props，不直接碰网络。
- **bundle 契约**：host 产物为 ESM 入口；client 产物是 `window.__ModuleLoader__.load({ id, factory })` 包裹的 CJS bundle，其中 `react`、`react-dom`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` 通过 `require` 外部化，CSS module 被编译成运行时 `<style>` 注入。
- **dotfiles 侧**：插件以 bundle 形式放 `dsh/plugins/<name>/`，用 `dsh plugin add` 以 `link:` 安装；`lib/` 不入库，按需构建；web profile 为 live profile。
- **目标工作区事实**：opc = 根仓 + service / portal / console 三个独立子仓，根仓 `.gitignore` 排除子仓。

## Goals / Non-Goals

**Goals:**

- 保留原插件的路由形状、SSE 推送、守卫语义与 bundle 加载契约，只在路径语义、仓库枚举与新动词上扩展。
- 单仓工作区零行为变化。
- 构建与安装可在容器内一条链完成：`pnpm install → pnpm build → dsh plugin add`。

**Non-Goals:**

- 不引入任何网络类动词（pull / fetch / push）与远端概念。
- 不做跨仓 merge / rebase、组删除分支、组 worktree。
- 不为 acp / headless profile 安装（原插件同样只装 web）。
- 不复刻上游的匿名遥测与 d.ts 产物。

## Decisions

### D1 就地 fork 自研，而非提 PR 或换社区方案

- **理由**：上游为单仓设计（README 明确 `/git/*` 只接受已注册 workspace 根），多仓语义是产品级分歧；本地 fork 可 `link:` 安装，迭代无需发版。
- **备选**：`dsh-workspace-combiner`（只做多仓上下文注入，没有 git 操作面）；从零新写（复用不了既有 UI、守卫与 SSE，成本高）。

### D2 门控从「全等」放宽为「工作区内 + git 顶层围栏」

- **做法**：gate 仍用 realpath 规范化，判定条件改为 `canonical === root || canonical.startsWith(root + sep)`，并把命中的工作区根随 verdict 返回；`GitService` 的仓库解析改为统一的 `gatedRepoRoot()`——在 `--show-toplevel` 之后要求结果同样落在该工作区内。
- **理由**：路径来自浏览器，必须维持「只能操作已注册工作区内的仓库」这一不变量；围栏挡住「子目录其实属于工作区外某个仓库」的逃逸。
- **备选**：另开 `/git-multi/*` 路由（复制一套守卫与 SSE，重复）；客户端只传相对路径（同一门控问题，且破坏既有契约）；仓库令牌表（引入状态，收益不明确）。

### D3 仓库枚举放在 host，用文件系统扫描而非逐候选跑 git

- **规则**：深度 ≤3；发现 `.git`（目录或文件，兼容 worktree / submodule 指针）即认定仓库并**停止下钻**；跳过 `.` 开头目录、`node_modules`、`target`、`dist`、`build`、`out`；不跟随符号链接；单次最多访问 500 个目录。
- **理由**：枚举要在一次请求内给出全仓快照，`readdir` 远低于对每个候选跑 git 的成本；深度、跳过清单与符号链接规则同时服务安全与性能。
- **备选**：`git submodule status`（只覆盖 submodule，不代表独立子仓）；清单文件（需要维护第二个真理源，已在探索阶段否决）。

### D4 状态一次聚合取回，SSE 复用既有按路径订阅

- `/git/repos` 内部对各仓并发取 status（分支 / HEAD / 脏数 / 进行中）；SSE 仍以 `path` 为订阅键（选中仓或工作区根），轮询沿用上游的 30s 周期、15s 单项超时与 PollGuard 语义。
- **理由**：避免 N 条 SSE 连接与重复实现；既有变更键（分支 / HEAD / worktree 摘要）足以覆盖掉队检测。
- **备选**：每仓一条 SSE（连接与轮询成本随仓库数线性增长）。

### D5 组操作 = 单仓动词的扇出：预检全过才执行、并行、逐仓汇报

- **组切换**复用既有 `switchBranch` 的守卫语义：先对所有参与仓跑守卫，任一失败即整体不动并逐仓给出结果；执行阶段各仓并行，执行期失败按仓记录，**不自动回滚**。
- **组新建**复用 `createBranch`，基准按 D6 解析。
- **理由**：把「可预测的半完成状态」消灭在预检阶段；并行缩短多仓等待；不做自动回滚是因为回滚本身是另一组有失败面的操作，而残留的同名分支无害。
- **备选**：逐仓顺序 best-effort（用户看到中途失败且不知哪些已改）；两阶段提交式回滚（复杂度与新失败面不成比例）。

### D6 组新建基准：默认「各仓默认主线」，可选「各仓当前 HEAD」

- 默认主线解析顺序沿用上游 worktree-add 的既有做法：`origin/HEAD` → `main` → `master` → 兜底 HEAD；无法解析的仓在结果中报错。
- **理由**：多仓错位时（某仓停在未完成特性分支）默认从主线出发，避免静默产出叠层血缘；同时保留刻意堆叠特性的专家用法。
- **备选**：只支持当前 HEAD（默认即带有错位风险）；单一全局 base ref（各仓基线不同，强行统一会大量失败）。

### D7 隐式特性集：分支名即参与仓集合，不引入 manifest

- 组切换不持有任何持久化状态，只读各仓本地分支列表求并集。
- **理由**：分支存在性即真理源，零簿记、零同步问题；将来若需要 manifest 也是在其上加一层视图，不冲突。
- **备选**：根仓 manifest 登记（需维护注册表、处理半创建与磁盘漂移）；DSH_HOME 本地状态（跨机不同步，最差）。

### D8 客户端状态：弹出层双态 + 选中仓按工作区持久化

- 弹出层状态机为 `overview | repo`：总览表（含组操作条）⇄ 单仓详情面板（带返回入口）。
- 选中仓存 localStorage，键包含工作区根路径；打开时校验其仍在枚举结果内，否则回落到 primary 或首个仓库。
- 动词面：`GitGraphInjected` 全部动词增加可选 `repoPath`，`pathOf(sessionId, repoPath) = repoPath ?? cwd`；组件保持纯 props。
- **理由**：推入式保留总览上下文；持久化避免每次重新选择；不改动组件与服务的注入形状。
- **备选**：独立弹窗（丢失总览上下文，已否决）；host 侧会话级状态（多标签页与多工作区下语义复杂）。

### D9 构建：单个 esbuild 脚本复刻加载契约，产物自包含

- **host**：`src/index.ts`、`src/invariant.ts` → lib（ESM，node 内建 external，`@deepseek-ai/schemastery` 打包进产物）。
- **client**：`src/client/index.ts` → CJS bundle，external 为 `react`、`react-dom`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives`；自写 CSS-module 插件（类名加前缀 + 运行时 `<style>` 注入）；外层包 `window.__ModuleLoader__.load({ id, factory })`。
- **理由**：`link:` 安装不会为被链接包安装依赖，产物必须自包含；不产出 d.ts 与 sourcemap 以缩小体积。
- **备选**：照搬上游 `tsc -b && tsdown`（需复刻其共享配置与 dts 管线，收益低）。

### D10 移除遥测

- 删除 `telemetry.ts` 与其调用，客户端不再向任何第三方端点发送心跳。

## Risks / Trade-offs

- [link: 安装零运行时依赖] → 构建后检查 lib 产物确实包含 schemastery；用 `dsh --profile web --dump-config-schema` 做加载校验。
- [手写 ModuleLoader 封装偏离上游] → 以原包 `lib/client.js` 为对照逐项比对（bundle id、external 列表、factory 形状）；加载失败可在浏览器控制台直接定位。
- [插件替换期的重名注册] → 先 `remove` 原插件再 `add` 新插件；两者同时启用会出现重复的 slot 条目与两套 `/git/*`。
- [扫描成本与极端目录树] → 深度、上限与跳过清单约束；只在弹出层打开时拉取，不随轮询全量扫描。
- [多仓轮询成本] → 复用单条 SSE 与既有周期，仅在总览或芯片挂载期间订阅。
- [组操作执行期失败] → 逐仓结果 + 单仓重试；不做自动回滚（残留分支无害）。
- [门控放宽的越界风险] → git 顶层围栏；验收覆盖工作区外路径、工作区内子目录、git 顶层逃逸三类用例。
- [live profile 热替换] → 插件变更即时生效，浏览器刷新加载新 bundle；本会话不依赖该插件。

## Migration Plan

1. 在 `dsh/plugins/git-graph-multi/` 完成构建（`pnpm install && pnpm run typecheck && pnpm run build`）。
2. `dsh plugin --profile web remove @linxin666/dsh-client-ui-git-graph`。
3. `dsh plugin --profile web add /home/xuqinqin/develop/dotfiles/dsh/plugins/git-graph-multi`。
4. `dsh --profile web --dump-config-schema` 校验加载，随后按 tasks.md 的验收清单在 GUI 实测。
5. **回滚**：`dsh plugin --profile web add @linxin666/dsh-client-ui-git-graph@0.4.5` 并移除新插件（原包仍在 npm，profile 配置层可逆）。

## Open Questions

- pull / fetch 等网络动词的失败面设计（凭证、远端未配置、分叉需合并）——留待后续独立 change。
- 「对齐模式」（组切换时顺带补建缺失分支）是否需要——当前明确不做，等实际使用反馈。
- 组操作与 worktree / 自动隔离功能是否打通——当前不打通，不影响本设计。
