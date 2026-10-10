# Proposal

## Why

一个 DSH 工作区可能由多个各自独立的 git 仓库组成：opc 工作区即「根仓 + service / portal / console 三个独立子仓」（根仓 `.gitignore` 排除子仓，各自独立提交）。但当前在装的 Git 图谱插件把「已注册工作区根」当作唯一仓库，子仓的分支、脏文件状态与提交图谱在 GUI 中完全不可见，切分支、建分支只能回到终端。

社区没有现成替代：`dsh-workspace-combiner` 只做多仓上下文注入与沙盒白名单，`@captain1275/dsh-client-ui-git-graph`（与本机在装的 `@linxin666/dsh-client-ui-git-graph` 同源）的 README 明确 `/git/*` 只接受已注册 workspace 根。原插件源码随包发布且为 Apache-2.0，可 fork 自研。

## What Changes

- 新建本地插件 `dsh-plugin-git-graph-multi`（fork 自 `@linxin666/dsh-client-ui-git-graph@0.4.5`），源码纳入 dotfiles 仓库 `dsh/plugins/git-graph-multi/` 统一管理，并移除原插件的匿名遥测上报。
- **多仓枚举**：新增 `/git/repos`，按固定规则扫描工作区内的全部 git 仓库（含工作区根仓），并聚合每仓的分支、HEAD、脏文件数与进行中操作状态。
- **总览与钻取**：分支芯片 popover 先呈现全仓总览表（各仓分支对齐 / 掉队一眼可见），点行推入式进入单仓面板；原插件的切换分支、建分支、Git 图谱、worktree 能力按选中仓作用。单仓工作区行为与原插件一致。
- **组操作**：同一动词跨仓同步执行。组切换对「拥有同名分支」的仓全量切换，缺该分支的仓严格跳过；组新建按勾选的参与仓，各仓从默认主线创建同名分支，可切换为「各仓当前 HEAD」为基准。组操作先全体预检，任何一仓被挡则全体不动，逐仓汇报结果。
- **访问门控放宽并加围栏**：`/git/*` 允许工作区根或其子目录作为操作路径，且 git 顶层目录必须仍落在该工作区内。
- **BREAKING**（对本机 profile 而言）：web profile 的 bundles 列表中，原插件 `@linxin666/dsh-client-ui-git-graph` 被新插件替换并卸载。
- 非目标：pull / fetch 等网络类动词、跨仓 merge / rebase / push、组删除分支、组 worktree、缺分支自动补建（对齐模式）。

## Capabilities

### New Capabilities

- `dsh-multi-repo-git-graph`: DSH Web GUI 中面向「单工作区多 git 子仓」的仓库枚举与总览、单仓与跨仓（组）分支操作、以及 `/git/*` 访问门控行为。

### Modified Capabilities

（无：dotfiles 仓库此前没有 OpenSpec 能力规格。）

## Impact

- **新增**：`dsh/plugins/git-graph-multi/`（TypeScript 插件源码、构建脚本与 cordis bundle patch）；dotfiles 仓库新增 OpenSpec 根。
- **修改**：`dsh/profiles/web/package.json`（bundles 与依赖：移除 `@linxin666/dsh-client-ui-git-graph`，以 `link:` 引入新插件）。
- **运行时接口**：扩展 `/git/*`——新增 `/git/repos`、`/git/group-switch`、`/git/group-create`，并放宽既有路由的 `path` 语义；客户端 bundle 的加载契约（`dsh.client` 声明与 `window.__ModuleLoader__.load` 形态）保持不变。
- **安全面**：`/git/*` 的信任边界从「路径等于注册工作区根」改成「路径位于某注册工作区内，且 git 顶层不逃出该工作区」。
- **使用侧**：opc 工作区（根仓 + service / portal / console）的日常分支操作可在 GUI 完成；其他单仓工作区的行为不变。
