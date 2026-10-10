# dsh-plugin-git-graph-multi

DSH Web GUI 插件：**单工作区多 git 子仓**的分支芯片 —— 仓库枚举与每仓平铺分支芯片、单仓操作、跨仓（组）分支操作，全部经 host 侧真实 git 执行并带守卫。

本包是 [`@linxin666/dsh-client-ui-git-graph@0.4.5`](https://www.npmjs.com/package/@linxin666/dsh-client-ui-git-graph)（Apache-2.0，上游 <https://github.com/zhu1090093659/dsh-web>）的本地 fork，双面插件：

- **host 半**（`exports "."`）：工作区门控的 git 服务 + `/git/*` HTTP 路由（JSON 操作 + SSE 变更流），另含可选的 `git_worktree` 工具。
- **client 半**（`exports "./client"`）：浏览器端分支芯片，经 `window.__ModuleLoader__` 加载。

## 与上游的差异

| 能力 | 上游 0.4.5 | 本 fork |
| --- | --- | --- |
| 路径语义 | 只接受**等于**已注册工作区根 | 接受工作区根**或其后代**；解析出的 git 顶层必须仍落在同一工作区内（围栏） |
| 仓库集合 | 工作区根那一个仓库 | 工作区内扫描枚举（深度 ≤3，跳过隐藏/依赖/产物目录，不跟随符号链接，预算 500 目录） |
| 多仓呈现 | 无 | `/git/repos` 一次取回全部仓状态；输入框上方每仓一个平铺分支芯片，点开即本仓分支面板（无总览面板与两级导航） |
| 跨仓操作 | 无 | `/git/group-switch`、`/git/group-create`：隐式特性集、预检原子性、逐仓结果 |
| 遥测 | 每浏览器每日心跳到 `dsh-market.com` | **已删除**，加载不产生任何第三方请求 |

单仓工作区的行为与上游一致：芯片只显示分支（不带仓库名前缀），分支面板不渲染组操作控件。

## 组操作语义

- **组切换**（`/git/group-switch`）：分支名即参与仓集合 —— 拥有该分支的仓参与，缺该分支的仓记为「未包含」且**不会**被补建分支；全部参与仓先并发预检（未解决冲突 / 进行中的 git 操作 / 分支已被其他 worktree 检出），任一仓被挡则**任何仓都不切换**（其余参与仓记为「未执行」）；预检全过才并行执行，逐仓返回成功/失败。
- **组新建**（`/git/group-create`）：在勾选的仓库集合中创建同名分支。基准默认「各仓各自的主线」（`origin/HEAD` → `main` → `master` → `HEAD` 逐仓解析），可切换为「各仓当前 HEAD」。单仓失败不影响其他仓，**不做回滚**（残留的同名分支无害）。
- 结果逐仓区分 `ok` / `skipped`（未包含）/ `failed` / `not-run`（未执行），失败仓可在界面上单仓重试。

## 界面

客户端渲染层统一使用宿主组件库 `@deepseek-ai/dsh-client-ui-primitives`（`Button` / `Modal` / `Tag` / `Pill` / `StateDot` / `Checkbox` / `Input` / `SegmentedControl` / `Tooltip` / `Toast` / `MenuSurface`），不再自绘等价控件，也不使用原生下拉选择与原生勾选框，因此浅色与深色主题下的观感与宿主一致；该包仍是客户端 bundle 唯一的 UI 外部依赖，未引入新的运行时依赖。

- **平铺分支芯片**：多仓工作区在输入框上方为**每个仓库各渲染一个芯片**（根仓优先、其余按名称排序），标签形如 `仓库名 · 分支`；根仓图标以品牌色标出，脏文件数 > 0 时带数量徽章，不可用仓库虚线降级且不可点开。点开任一芯片即进入**该仓自己的分支面板**，操作只作用于该仓——多仓与单仓同构，不再有「总览 → 推入详情」两级导航。
- **操作与视图分离**：分支面板只承载视图（搜索、分支列表、脏文件行、内联错误）；底部收敛为单一「更多操作」入口，推入独立操作面板后按「分支 / Worktree」分组列出创建分支、Git 图谱、worktree 会话与 worktree 管理，并提供返回分支列表的入口。
- **组操作归属根仓**：只有根仓芯片的操作面板多出一组「组操作」（组切换… / 组新建…），非根仓结构上不可见。组切换以宿主模态承载：平铺候选（形如 `feat/x · 2/4`，后缀为该分支名覆盖的仓库数）、无候选时空态且不可执行、失败原因内联停留。
- **对话框**：创建分支、创建 worktree、Git 图谱、worktree 管理、组切换、组新建、组结果七个对话框均以宿主模态呈现，支持 Escape 与遮罩点击关闭，关闭后焦点回到打开它的控件；进行中的操作会阻止遮罩/Escape 关闭。
- **反馈与忙碌态**：切换成功以宿主 Toast 提示（面板已关闭仍可见），失败原因内联停留在触发它的面板或对话框中；请求进行中相关按钮与候选禁用，不接受重复提交。
- **长名提示**：超出可显示宽度的分支名在悬停或聚焦时由宿主 Tooltip 给出完整名称。
- **实时性**：客户端以**一条** SSE 流订阅工作区内全部被枚举的仓库（`/git/events` 支持重复 `path` 参数；浏览器同源连接池上限为 6，逐仓各开一条流不可接受），任一仓库发生外部变化即重新枚举并刷新整行芯片；窗口聚焦与打开面板同样触发刷新。
- **Git 图谱**：泳道仍以等宽字形（`● ◆ │`）渲染，refs 改用标签呈现；全彩 SVG 泳道不在本版本内。

## 安全边界

`/git/*` 只接受位于某个**已注册工作区之内**（或等于该工作区根）的路径，且 `git rev-parse --show-toplevel` 解析出的顶层目录 realpath 后必须仍在该工作区内；否则返回 `workspace-unknown`。这条围栏挡住了「工作区内的子目录其实属于工作区外某个仓库」的逃逸。

## 构建

产物自包含（`link:` 安装不会为被链接包安装依赖，所以 `@deepseek-ai/schemastery` 被打进 host 产物；client 产物自带 CSS 注入）：

```bash
cd /home/xuqinqin/develop/dotfiles/dsh/plugins/git-graph-multi
pnpm install
pnpm run typecheck     # tsc -b：host / client 双工程
pnpm test              # vitest（host 单测）
pnpm run build         # esbuild → lib/index.js、lib/invariant.js、lib/client.js
```

`lib/` 与 `node_modules/` 不入库（见 `.gitignore`），按需构建。

## 安装到 profile

```bash
cd ~/develop/docker
docker exec dsh dsh plugin --profile web add /home/xuqinqin/develop/dotfiles/dsh/plugins/git-graph-multi
docker exec dsh dsh --profile web --dump-config-schema   # 校验 host 半可被 Loader 加载
```

> **重要**：本插件与 `@linxin666/dsh-client-ui-git-graph` 使用同一个 slot 条目 id（`git-graph`）和同一段 `/git/*` 路由前缀，**不可同时启用**。替换顺序：先 `remove` 原插件，再 `add` 本插件。

## 非目标（本版本）

pull / fetch / push 等网络动词、跨仓 merge / rebase、组删除分支、组 worktree、组切换时自动补建缺失分支（「对齐模式」）均不在本版本内，留待后续独立变更。

## 许可

Apache-2.0，见 [LICENSE](./LICENSE)。fork 自 `@linxin666/dsh-client-ui-git-graph`（版权归上游作者），本仓库内的修改同样以 Apache-2.0 发布。
