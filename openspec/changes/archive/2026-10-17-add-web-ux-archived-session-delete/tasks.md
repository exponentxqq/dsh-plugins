# Tasks

## 1. 契约与宿主删除流程

- [x] 1.1 新增 `plugins/web-ux/src/contract.ts`:定义 channel `/web-ux`、端点 `preview-delete` / `delete-session`、请求/响应/错误码(`not-found` / `not-archived` / `session-live` / `bad-request`)词汇表,及两端共用的 wire 形状边界 parser。验证:单测覆盖合法/非法 payload 解析。
- [x] 1.2 新增 `plugins/web-ux/src/delete-session.ts`:依赖注入式纯流程函数——删除集合闭包收集(`origin === 'subagent'` 沿 `parentSession` 链,fork 排除)、前置校验、registry 清理(unarchive/unpin/detach,全幂等)、文件删除(日志目录扫描定位 + projcache unlink,失败记 warnings)、逐 id emit `api-session/removed`,以及预览分支(同校验 + 体积统计)。对 dsh/cordis 仅 type-only import。验证:mock registry/sessions/fs/emit 的单测覆盖级联与 fork 排除、三种拒绝码、部分失败 warnings、emit 逐 id、幂等重跑。
- [x] 1.3 改写 `plugins/web-ux/src/index.ts` 为实载体:`inject = ['workspaceRegistry', 'dshHomePath']`,`apply` 内按 multi-root 模式 `ctx.inject(['connection', 'webServer'])` 从 root 读 connection 挂 channel,dispatch 到 1.2;服务缺失时软降级仅告警。验证:单测断言 channel 注册调用路径与非 web 环境不抛错;`pnpm --filter dsh-plugin-web-ux build` 产物 self-contained。

## 2. 浏览器半边

- [x] 2.1 新增 `plugins/web-ux/src/client/locales.ts`(NS `webUx`,zh canonical + en `satisfies` 钉形):菜单文案、对话框标题/描述(含级联与不可逆警示)/确认/取消/进行中/错误映射/体积格式化。验证:parity 单测 zh/en 键一致。
- [x] 2.2 新增 `plugins/web-ux/src/client/delete-client.ts`:Connection RPC 封装 + 边界 parser(复用 contract),传输失败归一为可渲染错误。验证:mock connection 单测覆盖两端点成功/失败路径。
- [x] 2.3 新增 `plugins/web-ux/src/client/DeleteSessionMenuItem.tsx`:`MenuItemButton` + `IconTrashOutlineRegular`,订阅 `workspaces` 快照,仅归档行渲染;点击关菜单并触发删除请求状态。验证:testing-library 用例覆盖归档行渲染、未归档行 null、点击回调。
- [x] 2.4 新增 `plugins/web-ux/src/client/DeleteSessionDialog.tsx`:`shell.overlay` entry,Modal 预览→确认→执行三态(预览失败只读展示、执行中禁用、warnings 展示)。验证:组件用例覆盖三态流转与确认触发 channel 调用。
- [x] 2.5 修改 `plugins/web-ux/src/client/index.ts`:保留徽章注册;新增 menu.item entry(order 500)与 shell.overlay entry,均 try/catch 软注册;client `inject` 增补 `locale`、`connection`、`workspaces`。验证:既有 badge 测试不回归。

## 3. 包声明与构建

- [x] 3.1 更新 `plugins/web-ux/package.json`:`dsh.client.inject` 增补 `@deepseek-ai/dsh-client-ui-workspace` / `@deepseek-ai/dsh-client-connection` / `@deepseek-ai/dsh-client-locale`;peer/devDependencies 同步(host 类型:`@deepseek-ai/dsh-workspace`);description 改为双端描述。验证:`pnpm install` 无 peer 警告、`pnpm typecheck` 通过。
- [x] 3.2 更新 `plugins/web-ux/build.mjs` 头注释与构建日志(host 产物不再是 no-op 载体)。验证:`pnpm build` 成功且 `lib/index.js` 含 channel 注册逻辑。

## 4. 文档

- [x] 4.1 更新 `plugins/web-ux/README.md`:宿主半双端化说明、「删除会话」章节(入口规则、删除范围含级联与附件不清理、错误码、上游依赖清单含 `api-session/removed` 借用及其降级表现、手动清理残留指引)。验证:`pnpm --filter dsh-plugin-web-ux docs:check` 或根 `pnpm docs:check` 通过。
- [x] 4.2 更新仓库根 `README.md` 插件清单的 web-ux 行(双端描述)。验证:同 4.1 的 docs:check。

## 5. 验证与发布

- [x] 5.1 递归自检:`pnpm --filter dsh-plugin-web-ux verify:all`(lint + typecheck + build + test)与 `openspec validate add-web-ux-archived-session-delete` 全绿。验证:命令退出码 0。
- [x] 5.2 link 安装实测:`docker exec dsh dsh plugin --profile web add <repo>/plugins/web-ux` 重启 profile,在 GUI 验收——归档行菜单入口出现/未归档行无入口、预览数字正确、确认后行即时消失且刷新不复活、`~/.dsh/sessions/**/<id>` 与 projcache 消失、`workspace.json` 引用干净、live 会话被拒;subagent 会话删除后其 fork 存活。验证:逐项人工核对通过后还原 tag 安装(最终以 v1.2.1 tag 安装复核,见 5.3)。
- [x] 5.3 版本与发布:根与插件版本 bump 1.2.0,`pnpm release 1.2.0 --dry-run` 核对后正式执行(提交与 tag);宿主 `git push origin main --tags`;profile 按 `#v1.2.0` 重装验证。验证:安装后 GUI 功能完整。**实际按 v1.2.1 补丁版执行**:v1.2.0 tag 已推远程且含「删除入口不出现」缺陷,不移动已推 tag。实际执行:`pnpm release 1.2.1` 产出提交 `1b56db6` + annotated tag `v1.2.1`;宿主 `git push origin main --tags` 后远程 tag(`40f79b9`)与本地一致;profile 四个插件按 `#v1.2.1` 重装(全部 1.2.1,`--dump-config` EXIT=0);GUI 复验与最终重启后的启动验收均通过;dotfiles 提交 `0ff8c4f` 记录 profile tag 升级。

## Workflow follow-up

- 全部任务完成后由用户决定是否运行 `/openspec-apply-change` 的归档阶段(或 `openspec archive`)将 delta 并入 `openspec/specs/dsh-web-ux-session-delete/`。

## 实施记录(apply 阶段)

- 1.1–4.2、5.1 已完成并验证:`pnpm --filter dsh-plugin-web-ux verify:all` 全绿(lint 0 error、`tsc -b` 双工程 0 error、build 成功、vitest 9 文件 119 用例全过),`openspec validate add-web-ux-archived-session-delete --strict` 通过,`pnpm peers check` 无 peer 问题。新增 `test/bundle.test.ts`(产物纯度:宿主半只依赖 `node:*`;浏览器 bundle 只 require `react`/`react/jsx-runtime`/ui-primitives)与 `test/contract.test.ts`(契约 parser 合法/非法形状 39 例)。
- 与任务文字不同的实现选择(理由见 design.md「实施期修正」):宿主 `inject = ['workspaceRegistry', 'sessionPersistence', 'dshHomePath']`(会话头与存在性改用公开的 `sessionPersistence.list()`,上游 `listStoredHeaders()`/`sessionKnown()` 是 private);客户端 `connection`/`workspaces` 用 `ctx.get` 软读而非写进 cordis `inject`;`dsh.client.inject` 另含 `@deepseek-ai/dsh-client-ui-layout`(`shell.overlay` 座位的声明方)与 ui-renderer;两个 entry 均声明 `locale: 'webUx'`,字典注册先于 entry 注册。
- 5.2 的 profile 重启会终止当前正在运行的 web 会话,须由用户在宿主侧执行;5.3 的提交/打 tag/推送同样等用户审核确认后执行。
- 5.2 首轮 GUI 实测发现并修复 v1.2.0 缺陷:真实 web 组合的 `workspaces` 服务晚于插件 `apply` 就绪,原实现在 `apply` 里 `ctx.get` 得到 `undefined` 后直接返回,导致「删除会话」入口与对话框从未注册(provider 徽章正常)。修复:两个 entry 照常注册,`connection` / `workspaces` 改为在各自注入面(渲染期)读取;服务缺席时静默渲染 `null`。浏览器热验证已通过(归档行入口出现/未归档行无入口/live 会话被拒/非 live 预览数字正确),136 例单测与 lint/typecheck/build 全绿;发布时会次改为 v1.2.1(v1.2.0 已推 tag 且含该缺陷)。
- 5.2 最终验收(宿主重启后,对自造测试会话 `session-6d04b0f8-…` 做真实删除,内容仅一句「ok」):
  - 归档视图 → 归档行「…」菜单末位出现 `Delete session`(danger 样式,order 500,排在 Copy Session ID 之后);未归档行菜单无此项。
  - live 拒绝(重启前):对话框仅展示 `session-live` 错误、不提供确认按钮。
  - 重启后预览:`Sessions: 1` / `Subagent sessions included: 0` / `Space to be freed: 73 KB` / 不可逆警示 + `Cancel` / `Delete permanently`。
  - 确认后对话框显示 `Deleted 1 sessions.`,该行即时消失;刷新页面后归档视图不再出现该 workspace(不复活)。
  - 磁盘核对:`~/.dsh/sessions/--home-xuqinqin-develop-person-dsh-plugins--/<id>` 与 `storages/session_projcache/sessions/<id>.json` 均已消失;`storages/workspace.json` 中该 id 引用数为 0;宿主日志无相关报错。
  - subagent 级联删除与 fork 存活语义由 1.2 单测(mock registry/sessionPersistence/fs/emit)覆盖,GUI 级未单独复测(需再造 live 会话并二次重启);5.2 其余条目均人工核对通过。
- 升级到 DSH 0.2.1-rc.2 后的加载验收(重启后):boot entries 78 条,第三方 client 插件 8 个(task-board/web-ux/pocket/notes/better-input/context/dshmarket/multi-root);`@deepseek-ai/dsh-browser-use` 与 `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` 均 0.2.1-rc.2 且已加载(chrome-devtools MCP 可驱动容器内 headless Chromium);`pnpm dsh:check` 基线、pin、软范围、allowlist、lockfile、安装树一致;multi-root `/workspace-folders` 面板正常、git-graph 0 残留、task-board 无报错。
- 最终发布与重装验收(2026-10-18):`pnpm release 1.2.1` → 提交 `1b56db6`(5 个 package.json 版本号)+ annotated tag `v1.2.1`;宿主 push 后远程 `refs/tags/v1.2.1` = `40f79b9` 与本地一致;profile 四插件 spec 由 `#v1.2.0` 改为 `#v1.2.1` 并重装(全部 1.2.1,安装产物 hash `c6336717…` 与已验证版本一致);`dsh --profile web --dump-config` EXIT=0;页面重载后归档行菜单仍有 `Delete session`;最终重启后验收:DSH 0.2.1-rc.2、四插件 1.2.1、boot entries 78(第三方 8 个)、启动日志无 error/warn、GUI 归档行删除入口仍在(仅打开菜单核对,未删除用户数据)。
