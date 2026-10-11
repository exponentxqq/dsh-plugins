# dsh-plugin-web-ux

DSH Web GUI 插件（**client 半，`exports "./client"`**）：在输入框下方状态行（`conversation.composer.dock`）追加一枚静态胶囊，显示当前会话所用模型的 provider；与官方轮次/缓存/上下文胶囊同行并排，悬停显示 `providerId · modelId`。

本包自 `split-project-mcp-plugin` 变更起**只做 Web 界面体验**——原先同包的「项目级 MCP」宿主能力已拆为独立插件 [`dsh-plugin-project-mcp`](../project-mcp/README.md)（纯宿主面，任何 profile 可单独安装）。后续其他 Web 界面体验优化仍落在本包。

## Provider 徽章

- 数据来自会话共享的模型目录快照（`ctx.modelDirectories.directoryFor(sessionId).store`），切换模型（官方选择器或 `/model` 弹层）后徽章**无需刷新**即跟随；组件只读该快照，不改动任何官方座位。
- 显示名取模型目录中与当前 provider 标识符匹配的分组名；匹配不到时回退显示标识符原文；会话没有持久模型选择时**不渲染**。
- 样式对齐官方胶囊（同一套 `--dsh-content-font-*` / `--dsw-alias-*` 变量、`999px` 圆角、`1px 8px` 内边距）；标签有 `max-width` 上限并截断为省略号，不会把状态行撑出横向滚动。
- 空白会话期上游本就不渲染状态行，徽章随之缺席，不产生错误。

## 宿主半为何还在

`src/index.ts` 保留为一个**空载（no-op）载体行**（`name='web-ux'`、`inject: []`、空 `apply`），不是遗留物：web 客户端模块扫描只从 **bare 包名行**读取 `dsh.client` 声明，所以 bundle patch 必须继续按包名插入本包，徽章才会被浏览器加载。宿主侧它不做任何事。

## 构建

client-only 自包含产物：`src/client/index.ts` 打成单个 CJS bundle 并包进 `window.__ModuleLoader__.load({ id, factory })` 外壳（`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供），CSS modules 编译为运行时 `<style>` 注入，因此**没有独立样式文件**，也不依赖本包 `dependencies`。`lib/index.js` 是上面那个空载载体的宿主产物。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：client 单工程
pnpm test          # vitest：徽章行为用例
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js（空载载体）、lib/client.js（徽章）
pnpm verify:all    # lint + typecheck + build + test
```

`lib/` 与 `node_modules/` 不入库（见 `.gitignore`）。依赖由 workspace 统一安装：仓库根 `pnpm install` 一次装齐。

## 安装到 profile

```bash
# 发布后按 tag 装（推荐）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#v1.0.0&path:plugins/web-ux"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux

docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: web-ux` 的 bare 包名行）。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态的构建授权与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 非目标（本版本）

- 徽章不做点击交互（跨插件触发模型菜单无公开 API）。
- 不接管或重排官方 composer 工具行、模型选择器。
- 不含任何宿主能力（项目级 MCP 属 [`dsh-plugin-project-mcp`](../project-mcp/README.md)）。

## 许可

Apache-2.0。
