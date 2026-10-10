# Tasks

## 1. 插件脚手架与源码迁入

- [x] 1.1 建立 `dsh/plugins/git-graph-multi/` 并写入 `package.json`（name `dsh-plugin-git-graph-multi`、`main`/`exports` 镜像原包、`dsh.bundle.patch`、`dsh.client`（同原包 inject 列表、platform web）、零 `dependencies`、devDependencies 含 esbuild / typescript / vitest / react 类型与 SDK 类型包）；验证 `pnpm install` 在该目录成功
- [x] 1.2 写入 `cordis.patch.yml`（`- insert:` 一行 `ui-git-graph-multi`）与 `.gitignore`（`node_modules/`、`lib/`）；验证 `git check-ignore -v dsh/plugins/git-graph-multi/lib` 命中该规则
- [x] 1.3 迁入 `src/`（host / core / client 全量文件）、`LICENSE`、`icon.svg`；验证 `diff -rq` 与来源目录无差异，并删除 `/home/xuqinqin/develop/company/fyzs/opc/dsh-git-graph-multi/` 后 `git -C /home/xuqinqin/develop/company/fyzs/opc status --short` 无残留
- [x] 1.4 写入 `tsconfig.json`（strict、moduleResolution bundler、react-jsx、allowImportingTsExtensions、noEmit）与插件 `README.md`（fork 来源与 Apache-2.0 署名、构建与安装步骤）；验证 `pnpm run typecheck` 通过
- [x] 1.5 品牌替换：`mountOnce` id、日志前缀、模块注释中的 `@linxin666/dsh-client-ui-git-graph` 全部改为新包名；验证 `grep -rn "@linxin666" src/` 无命中

## 2. 构建管线

- [x] 2.1 编写 `build.mjs`：host 双入口 ESM（node 内建 external、schemastery 打入产物）+ client CJS bundle（external `react`/`react-dom`/`react/jsx-runtime`/`@deepseek-ai/dsh-client-ui-primitives`）+ CSS-module 插件（类名前缀 + 运行时 `<style>` 注入）+ `window.__ModuleLoader__.load({ id, factory })` 封装；验证 `pnpm run build` 产出 `lib/index.js`、`lib/invariant.js`、`lib/client.js`
- [x] 2.2 产物契约比对：以原包 `lib/client.js` 为基准核对 bundle id、external require 列表与 factory 形状，并确认 host 产物内含 schemastery 代码（link: 安装不装依赖）；验证比对清单全部符合且 `node -e "import('./lib/index.js')"` 能加载
- [x] 2.3 删除遥测：移除 `src/client/telemetry.ts` 与 `reportDailyHeartbeat` 调用；验证 `grep -rn "dsh-market\|reportDailyHeartbeat" src/` 无命中

## 3. host 门控与仓库枚举

- [x] 3.1 接入 vitest（devDependency + `pnpm test` 脚本）并为首个门控用例建立 fixture 工具；验证 `pnpm test` 可运行（0 失败）
- [x] 3.2 门控放宽与围栏：gate 接受「工作区根或其子目录」并把命中的工作区根随 verdict 返回，`GitService` 统一走 `gatedRepoRoot()` 要求 git 顶层仍在该工作区内；验证单测覆盖工作区外路径拒绝、根路径通过、子目录通过、git 顶层逃逸拒绝
- [x] 3.3 新增 `repo-scan`：深度 ≤3、发现仓库不下钻、跳过 `.` 开头与 `node_modules`/`target`/`dist`/`build`/`out`、不跟随符号链接、目录预算 500；验证单测覆盖嵌套仓库、预算耗尽、符号链接、无仓库四类场景
- [x] 3.4 新增类型与守卫：`RepoRef`、`ReposView`、组操作结果类型及其运行时守卫；验证单测覆盖守卫对非法载荷的拒绝，且 `pnpm run typecheck` 通过
- [x] 3.5 新增 `/git/repos` 路由：扫描 + 各仓状态并发聚合；验证单测覆盖「单次请求取回全部仓状态」与「单个条目不可用不使整体请求失败」

## 4. host 组操作

- [x] 4.1 组切换：以分支名隐含参与仓、缺分支严格跳过、全体预检（冲突/进行中/被其他 worktree 占用）通过后才并行执行、逐仓结果；验证单测覆盖「部分仓缺分支→跳过且不建分支」「单仓被挡→全体不动」「全部通过→各仓切换」
- [x] 4.2 组新建：按勾选仓集合创建同名分支，基准默认按 `origin/HEAD → main → master → HEAD` 逐仓解析、可切换为各仓当前 HEAD，单仓失败不影响其他仓且不回滚；验证单测覆盖两种基准解析与单仓失败场景
- [x] 4.3 路由接线 `/git/group-switch`、`/git/group-create` 并接入类型守卫；验证单测覆盖畸形载荷返回 `malformed request`，`pnpm run typecheck` 通过

## 5. client 总览与单仓钻取

- [x] 5.1 `api.ts` 增 `repos`/`groupSwitch`/`groupCreate`，`GitGraphInjected` 全动词增可选 `repoPath` 并新增 `repos` 动词（`pathOf(sessionId, repoPath) = repoPath ?? cwd`）；验证 `pnpm run typecheck` 与 `pnpm run build` 通过
- [x] 5.2 `BranchChip`：拉取仓库枚举、选中仓按工作区持久化（localStorage 键含工作区根，失效时回落 primary/首个仓）、多仓时标签前缀仓库名、SSE 按选中仓订阅；验证 GUI 中 opc 工作区芯片显示「仓库名 · 分支」，切换选中仓后标签与订阅随之变化
- [x] 5.3 弹出层双态：`overview | repo`，总览表（根仓优先、仓库名/分支/脏数）+ 推入式单仓面板 + 返回入口；验证 GUI 中点行进入详情、返回回到总览，且总览以下拉式组操作条为入口
- [x] 5.4 单仓工作区回归：仅一个可用仓库时不渲染仓库切换与组操作控件；验证在单仓工作区打开芯片，其标签、分支列表、建支与图谱行为与替换前的原插件一致

## 6. client 组操作与文档

- [x] 6.1 组操作条：分支名并集下拉（标注覆盖仓数）+「组切换」入口；验证 GUI 中对 opc 执行组切换，缺该分支的仓在结果中显示为未包含且分支未被创建
- [x] 6.2 `GroupCreateDialog`：仓库勾选（默认三个子仓、根仓不勾）+ 分支名 + 基准下拉（默认主线 / 各仓当前 HEAD）；验证 GUI 中用两个基准各创建一次分支，并用 `git log --oneline -1` 核对血缘分别来自主线与各自 HEAD
- [x] 6.3 组操作结果面板：逐仓区分成功 / 跳过 / 失败并展示稳定错误原因，失败仓可单仓重试；验证 GUI 中预置一个「分支已存在」的仓，结果面板正确分列三类并可重试
- [x] 6.4 文档：插件 `README.md` 补多仓行为、组操作语义与构建安装步骤，`dsh/README.md` 增插件小节（fork 来源与许可、`pnpm install && pnpm run build` 后 `dsh plugin add` 的启用流程、`lib/` 不入库约定、新增 OpenSpec 根说明）；验证文档中每条命令可逐条执行成功

## 7. 安装与替换 profile

- [x] 7.1 `dsh plugin --profile web remove @linxin666/dsh-client-ui-git-graph`（若 CLI 不认该来源则改 `dsh/profiles/web/package.json` 的 bundles 与 deps 后在 profile 目录 `pnpm install`）；验证 `dsh/profiles/web/package.json` 中该包与对应 bundle 条目均已消失
- [x] 7.2 `dsh plugin --profile web add /home/xuqinqin/develop/dotfiles/dsh/plugins/git-graph-multi`；验证 package.json 出现 `link:` 依赖且 bundle 列表含 `dsh-plugin-git-graph-multi`
- [x] 7.3 `dsh --profile web --dump-config-schema`；验证命令通过（证明 host 半可被 Loader 加载）

## 8. 集成验收

- [x] 8.1 安全边界抽查：以工作区外路径、工作区内子目录、以及 git 顶层落在工作区外的路径分别请求 `/git/status`；验证前两者中越界者返回 `workspace-unknown`、子目录按所属仓库返回，围栏用例被拒绝
- [ ] 8.2 opc 全流程走查：总览四仓快照 → 单仓钻取切支（与 `git -C <repo> branch --show-current` 对照）→ 组切换（含严格跳过与预检拦截）→ 组新建（两种基准）→ 单仓图谱 → worktree 管理；验证每步结果与终端 git 状态一致
- [x] 8.3 回归：单仓工作区功能完整，三个子仓的独立提交工作流不受影响（`git -C` 检查各仓状态与提交互不干扰）

## Workflow follow-up

- 提交 dotfiles 变更（插件源码、OpenSpec 工件、README 与 .gitignore 调整）；注意工作区中已有的 `dsh/profiles/web/cordis.patch.yml` 模型切换改动与本变更无关，提交时单独处理。
- 评审通过后归档本 change（`openspec archive add-git-graph-multi-repo`），并复核归档后的主规格。

## 执行状态（2026-10-06）

实现、构建、安装与验收已完成，改动**尚未提交**（按用户要求）。

- **代码与产物**：`dsh/plugins/git-graph-multi/`（`pnpm run typecheck` / `pnpm test` 59 例 / `pnpm run build` 全绿；client 产物 externals 与 ModuleLoader 契约逐项比对通过；host 产物自带 schemastery）。
- **profile 替换**：`@linxin666/dsh-client-ui-git-graph` 已 remove，`dsh-plugin-git-graph-multi` 已以 `link:` add 进 `dsh/profiles/web`（bundles + deps），`--dump-config-schema` 可见行 `ui-git-graph-multi`。
- **验收方式说明**：本会话无浏览器自动化，5.x / 6.x 的「GUI 可观察行为」验收改用等价手段完成 —— 组件 SSR 与纯规则用例（client-ui 交付时自测 34 + 35 例）、host 路由 curl 实测（安全边界三类、组切换/组新建两种基准与混合结果、单仓钻取隔离）、以及一次「真 git + 真 GitService + 真 group-ops」的离线段到端。**浏览器内的点击走查（8.2）仍需人工确认。**
- **验收中修复的缺陷**：组切换预检把「已在该分支」的仓误判为 `branch-in-other-worktree`（`parseWorktreeBranches` 含主检出）。已在 `preflight` 补上与 `switchBranch` 同源的短路，并加 6 个单测；opc 真实数据离线复现由失败转为 `portal=ok service=ok console/opc=skipped`。
- **运行中 host 的注意点**：dsh 的 loader 用普通 `import()` 加载 host 半，进程内 ESM 缓存不会因 `dsh plugin remove/add` 而失效 —— 修复后的 host 产物需**重启 dsh 容器**才生效；浏览器半按 HTTP 提供，刷新页面即可取到新 bundle。
