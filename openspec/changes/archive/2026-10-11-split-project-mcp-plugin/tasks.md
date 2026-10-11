# Tasks

## 1. 骨架与迁移

- [x] 1.1 创建 `plugins/project-mcp/` 三件套：`package.json`（name `dsh-plugin-project-mcp`、version 1.0.0、`dsh.bundle.patch`、依赖 `yaml`、exports 仅 `.`、无 `dsh.client` 与 react 系 devDeps）、`cordis.patch.yml`（insert 单行 `id: project-mcp`）、`.gitignore`、`icon.svg`、host-only `tsconfig.json`（只引 `tsconfig.base.json` + `tsconfig.host.json`）与 node 环境 `vitest.config.ts`。验证：仓库根 `pnpm install` 成功纳入新包且 `pnpm --filter dsh-plugin-project-mcp typecheck` 通过。
- [x] 1.2 迁移 `src/host/` 全部 12 文件与 `src/index.ts`（相对导入不动），执行改名点：`name` 导出 `'web-ux'`→`'project-mcp'`、effect/日志标签 `dsh-plugin-web-ux:`→`dsh-plugin-project-mcp:`、docblock。验证：`grep -rn "web-ux" plugins/project-mcp/src` 零命中。
- [x] 1.3 迁移 6 个 host 测试（isolation / config-scan / mcp-manager / attribution / triggers / watch-reload）并同步断言中的标签字符串。验证：`pnpm --filter dsh-plugin-project-mcp test` 全绿（58 用例）。
- [x] 1.4 `build.mjs` 适配：删 client 面与 CSS-modules 插件、`PACKAGE_NAME` 改名。验证：`pnpm --filter dsh-plugin-project-mcp build` 产出 `lib/index.js`，容器内 `node -e "import('…/lib/index.js')"` 成功（`name=project-mcp`、`inject=["workspaceRegistry","tools"]`）且产物内 `web-ux` 字样零残留。

## 2. web-ux 瘦身

- [x] 2.1 `src/index.ts` 改为 no-op 载体（`name='web-ux'`、`inject: []`、空 `apply` + client-graph 锚点注释）；删除 `src/host/` 与 6 个 host 测试。验证：`pnpm --filter dsh-plugin-web-ux test` 的 badge 用例全绿（6 用例）。
- [x] 2.2 构建收敛 client-only：`build.mjs` 删 host 面（保留 no-op 载体产物）、`tsconfig.json` 只引 client、`package.json` 去 `yaml` 与 host 面 devDeps（保 jsdom / @testing-library/react / @types/react*）。**修正**：`@deepseek-ai/dsh-session` 必须保留——client 半以 `@deepseek-ai/dsh-session/types` 取类型，裁掉会 typecheck 失败。验证：`pnpm --filter dsh-plugin-web-ux lint typecheck test build` 全绿，`lib/client.js` 头部仍含 `__ModuleLoader__` 包裹。
- [x] 2.3 `plugins/web-ux/README.md` 精简为徽章单页并指向 project-mcp。验证：文档内无 MCP 章节残留（MCP 全文迁往 project-mcp README）。
- [x] 2.4 web-ux 标识冻结核对（用户决议：不改名）。验证：`grep -n "name = 'web-ux'" plugins/web-ux/src/index.ts` 命中、`package.json#name` 仍为 `dsh-plugin-web-ux`、`cordis.patch.yml` 行 id 仍为 `web-ux`、`git status --porcelain plugins/web-ux` 只有删除与修改而无重命名（无 `R` 状态）。

## 3. 文档与接线

- [x] 3.1 新写 `plugins/project-mcp/README.md`：迁入原 MCP 章节、隔离冒烟验证证据表与排障说明。验证：内容与现网行为一致（figma 在 opc 可见 / cloud-the-sky 屏蔽 / `/mcp-reload` 输出），排障日志前缀已改为 `dsh-plugin-project-mcp`。
- [x] 3.2 仓库根 `README.md` 插件表：web-ux 行（名称不变）描述改为徽章语义、新增 project-mcp 行。验证：两行链接可达。
- [x] 3.3 dotfiles web profile：`dsh/profiles/web/package.json` 依赖与 `dsh.profile.bundles` 增补 `dsh-plugin-project-mcp`（link:），容器内重装。验证：`docker exec dsh dsh --profile web --dump-config` 合成树含 `- id: project-mcp` / `name: dsh-plugin-project-mcp`，`--dump-config-schema` 正常产出（其 4 条 `unrecognized Loader tree carrier` 经对照实验确认是**基线既有**，与本变更无关）。
- [x] 3.4 根 `pnpm install` 刷 lock；`pnpm build && pnpm test` 全绿（多根 386 用例、git-graph 80、project-mcp 58、web-ux 6）。

## 4. 行为复核

- [x] 4.1 独立同构实例复核（等价于重启后复核，但不打断当前会话）：临时 `DSH_HOME` + 3099 端口、同一份工作区登记与 profile 配置。结果与拆分前基线**逐字一致**：`isolation: cwd=…/person/dsh-plugins roots=3 visible=[figma] deny=0`、`…/company/opc` 同上、`…/cloud-the-sky roots=2 visible=[] deny=2 [figma×2]` + `masked 2 tool(s)`；命令列表含 `mcp-reload`；`/mcp-reload` 反馈 `已重扫：加载 0、重载 0、卸载 0、保持不变 1、跳过 0、失败 0`；徽章客户端仍被注册（首页 `{"id":"dsh-plugin-web-ux",…}`）且产物与实时宿主**字节一致**（sha256 同、5681 B）；project-mcp 未被注册为客户端模块。探针与临时实例已清理（仅余 `opc/.dsh/mcp/figma.yaml`）。
- [x] 4.2 实时宿主重启复核（用户已于 18:05 重启；日志按 UTC 边界 `10:05:24Z` 切分）：重启后插件诊断**只有** `dsh-plugin-project-mcp` 标签（`tools/change received #1–#3`、`isolation: cwd=…/company/opc roots=3 visible=[figma] deny=0`、`isolation: cwd=…/person/dsh-plugins roots=3 visible=[figma] deny=0`），**旧标签 `dsh-plugin-web-ux:` 在边界后 0 条**（边界前的 891 条是旧进程退出瞬间的 teardown 噪声：旧 host 半在服务卸载后刷了 886 条 `inactive context` 报错——该噪声随拆分一并消失）；实时 `/mcp-reload` 反馈 `已重扫：加载 0、重载 0、卸载 0、保持不变 1、跳过 0、失败 0`，与基线一字不差；徽章客户端仍被注册（`rev=cc80d635e74b`）且产物 sha256 与重启前一致（5681 B）；project-mcp 未被注册为客户端模块。**注**：`cloud-the-sky` 的实时行需会话被客户端激活才产生（纯 RPC `session/create` + `prompt` 只入队、不建 agent；`session/follow` 属 stream 载具 `/api/remote.mux`，无法用普通 POST 打开）。用户点开该工作区会话后（`10:29:07.798Z`）日志出现 `dsh-plugin-project-mcp: isolation: masked 2 tool(s) in one session: [mcp__figma__download_figma_images,mcp__figma__get_figma_data]`——`apply()` 只可能由同一次 `reconcile()` 中的 `report()` 之后到达（`isolation.test.ts` 断言 `infos[0]`=报告行、`infos[1]`=masked 行），但该会话的报告行未被 `docker logs` 采集（同一毫秒内与 chrome-devtools-mcp banner 的突发写入交错，日志流出现空行/拆行；隔离实例与拆分前旧基线下同场景两行均完整）。故该工作区的实时证据 = `masked 2` 行 + 语义与基线一致。复核期间创建的 2 个临时会话（`session-89aead89…`、`session-06486910…`）均已用 `workspace/archiveSession` 归档，活跃列表已无。
