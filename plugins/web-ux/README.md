# dsh-plugin-web-ux

DSH Web GUI 插件（**双端**，`exports "."` 宿主 + `exports "./client"` 浏览器）：浏览器半在输入框下方状态行（`conversation.composer.dock`）追加一枚静态胶囊，显示当前会话所用模型的 provider；并在侧栏会话行的 "..." 菜单里为**已归档会话**提供「删除会话」入口与两步确认框。宿主半不再是空壳——它承载删除能力的 Connection RPC 通道 `/web-ux`（预览与执行两个端点），同时继续充当 web 客户端模块扫描读取 `dsh.client` 声明的锚点。

本包自 `split-project-mcp-plugin` 变更起**只做 Web 界面体验**——原先同包的「项目级 MCP」宿主能力已拆为独立插件 [`dsh-plugin-project-mcp`](../project-mcp/README.md)（纯宿主面，任何 profile 可单独安装）。自 `add-web-ux-archived-session-delete`（v1.2.0）起宿主半因「删除已归档会话」重新变成实载体：文件系统与工作区注册表只有宿主碰得到，这与拆出去的 MCP 能力互不相干；后续其他 Web 界面体验优化仍落在本包。

## Provider 徽章

- 数据来自会话共享的模型目录快照（`ctx.modelDirectories.directoryFor(sessionId).store`），切换模型（官方选择器或 `/model` 弹层）后徽章**无需刷新**即跟随；组件只读该快照，不改动任何官方座位。
- 显示名取模型目录中与当前 provider 标识符匹配的分组名；匹配不到时回退显示标识符原文；会话没有持久模型选择时**不渲染**。
- 样式对齐官方胶囊（同一套 `--dsh-content-font-*` / `--dsw-alias-*` 变量、`999px` 圆角、`1px 8px` 内边距）；标签有 `max-width` 上限并截断为省略号，不会把状态行撑出横向滚动。
- 空白会话期上游本就不渲染状态行，徽章随之缺席，不产生错误。

## 删除已归档会话

DSH 上游只有「归档」没有删除：持久化层不提供删除接口，归档像一只软删除抽屉，抽屉里的会话日志却在 `~/.dsh/sessions/` 无限累积，用户只能停 Host 后手工删目录、自己清理 `workspace.json` 引用。本能力给已归档会话补上「碎纸机」——磁盘日志目录、投影缓存与工作区引用三处一起清掉，无需停机手工操作。

### 入口规则

- 入口只出现在**已归档**会话行的 "..." 菜单中：菜单项 order **500**（官方 pin 100 / rename 200 / fork 300 / archive 400 之后，即排在「取消归档」后面），图标 `IconTrashOutlineRegular`。未归档行**不渲染任何 DOM**，想删先归档。
- 归档判定取自 client 侧 `workspaces` 服务快照的归档集合：在「全部对话（显示已归档）」/「仅显示已归档」筛选间切换，或被其它窗口归档/取消归档时，入口**即时出现或消失**，无需刷新页面。
- **刻意不做**键盘快捷键，也**不做**行内悬停按钮：不可逆操作只保留菜单里这一条路径，用摩擦换安全。
- 菜单可见性只是展示层：宿主两个端点各自独立校验归档状态（见「拒绝码」），另一窗口改了状态也删不掉。

### 两步确认

点击「删除会话」先向宿主请求**预览**（`preview-delete`），确认框展示：会话标题（取用户所点那一行的显示名——宿主侧归档会话没有 `Session` 实例，`SessionHeader` 也没有 title 字段）、本次删除的会话总数与级联子代理会话数、待释放磁盘体积，并明确警示**不可恢复**。预览被拒绝时对话框只读展示原因，**不提供确认操作**。

只有用户显式确认才发起删除（`delete-session`）；执行端点**重做一遍完整校验**，预览结果不携带任何授权语义——预览与执行之间被取消归档、会话转为 live 等状态漂移都由执行端兜住，不会产生部分删除。

### 删除范围

一次确认后，对目标会话及其全部 subagent 后代执行：

1. **工作区引用**：从所属工作区成员（`detachSession`）、归档集合（`unarchiveSession`）与置顶集合（`unpinSession`）中移除，三步全幂等，并触发官方工作区推送让分组行消失；
2. **磁盘**：删除会话日志目录 `~/.dsh/sessions/*/<会话id>/`（含 `session.v4.jsonl.zstd` 与 `session.lock`）与投影缓存 `~/.dsh/storages/session_projcache/sessions/<会话id>.json`；
3. **运行中 GUI**：逐 id 广播会话移除事件，侧栏对应行即时消失（含未分组行）。

级联与边界：

- **subagent 后代级联**：仅当会话头 `origin === 'subagent'` 且 `parentSession` 已在删除集合内时才递归（迭代到不动点）；子代理日志随父会话一起清理。
- **fork 不级联**：fork 的 `parentSession` 同样命中，但来源不是 subagent——fork 有自己独立的日志与生命周期，删除父会话永不牵连它。
- **共享附件永不清理**：`~/.dsh/attachments/v1` 是内容寻址去重存储，对象跨会话共享（含 fork 继承的历史引用），上游立场是「永远不会自动删除」且没有反向索引；本能力对附件**不做任何 GC**（设计上定为 SHALL NOT）。

### 拒绝码

预览与执行各自校验，拒绝时返回稳定错误码 + 可读原因（界面按码给本地化文案）：

| 错误码 | 触发条件 | 界面表现 |
| --- | --- | --- |
| `not-found` | 持久化层已无该会话头（例如已在别处删除） | 提示会话不存在；刷新后该行消失 |
| `not-archived` | 目标不在归档集合（含预览后被其它窗口取消归档） | 提示先归档再删除 |
| `session-live` | 删除集合中任一成员仍存活于宿主内存（消息点名具体 id） | 提示会话仍在运行，稍后重试 |
| `bad-request` | 线上形状不合契约 | 内部错误文案 |

宿主未预期故障归一为 `internal`，传输异常与坏响应在浏览器半归一为 `unavailable` / `bad-response`，未知码统一走兜底文案。

### 上游依赖与降级

全部接触点均**软注册**：任一缺失只让对应入口或功能静默消失，不会让 Web GUI 报错或崩溃。out-of-tree 插件不能挂 Typert Remote namespace（契约生成属官方组合），因此跨端只走官方公开的 Connection RPC。

| 依赖 | 用途 | 失效表现 |
| --- | --- | --- |
| Connection RPC（host `connection.rpc.handle` / client `connection.rpc.call`，通道 `/web-ux`） | 浏览器↔宿主唯一通道（`preview-delete` / `delete-session`） | 端点不可达，删除失败并提示传输错误 |
| slot `sidebar.workspaces.session.menu.item`（`dsh-client-ui-workspace`） | 会话行 "..." 菜单入口 | 入口不渲染 |
| slot `shell.overlay`（`dsh-client-ui-layout`） | 预览确认对话框 | 对话框不出现（点入口无反应，删除不会发生） |
| client 服务 `workspaces`（归档集合快照） | 入口可见性判定 | 入口不出现（宿主端 `not-archived` 防御独立成立） |
| client 服务 `connection` / `workspaces`（**渲染期软读**，不在 cordis `inject` 名单里） | RPC 调用 / 归档集合快照 | 入口与对话框渲染为 `null`（静默不出现），**既有徽章不受影响**；服务晚于插件 `apply` 就绪时也能正常生效 |
| client 服务 `slots` / `locale` / `modelDirectories`（cordis `inject` 名单） | 座位注册、文案字典、徽章数据 | 客户端半整体不激活（含徽章）；`locale` 缺失时带 `locale: 'webUx'` 的 entry 本就不该渲染，故不注册是正确降级 |
| host 服务 `workspaceRegistry` / `sessionPersistence` / `dshHomePath`（cordis `inject` 名单） | 引用清理、会话头清单、磁盘定位 | 宿主行不激活、通道不挂载 → 浏览器侧调用得到 `unavailable` |
| host 服务 `sessions`（软读，未列入 `inject`） | live 判定 | 无该服务时一切会话都按「非 live」处理（archived 且非 live 才可删，归档语义本身已排除运行中的会话） |
| host 事件 `api-session/removed`（**借用**） | 让运行中 GUI 的会话列表删行 | **删除成功但需手动刷新页面**（见下） |

**注意 `dsh.client.inject` 是模块图顺序依赖，不是运行时 import**：`package.json` 里列的上游客户端包（ui-workspace / ui-layout / ui-renderer / client-connection / client-locale）只用于保证浏览器 boot 图里这些客户端模块先到位（`external` 才表达 bundle 的 `require` 词）。这份声明同时也是**激活面**：web 组合若裁剪掉其中任一个，本插件的客户端半整体不加载，徽章会与删除入口一起消失（而不是 GUI 报错）。已核实 web 组合恒含这几个包，故该分支实际不可达；cordis `inject` 侧同理——`slots` / `locale` / `modelDirectories` 缺失时整半不激活。

**`connection` / `workspaces` 必须在 entry 的注入面（渲染期）读取，不能在 `apply` 里读**：真实 web 组合中 `workspaces` 由 `api-workspace-controller` 在 remote 网关就绪后才 `provide`，晚于本插件 `apply`；若在 `apply` 里 `ctx.get('workspaces')`，拿到的是 `undefined`，删除入口会永久丢失（v1.2.0 即此缺陷，v1.2.1 修复）。改为渲染期读取后，服务缺席时两个 entry 各自渲染 `null`，既有徽章完全不受影响。

**关于借用的 `api-session/removed`**：它是官方 Remote Event Selection 里声明可转发（`mode: "emit"`）的事件，client 会话列表模型正是靠它删行——但事件语义归属官方 session controller，我们只是**借用上游内部行为**，本包的类型声明里也没有它。若上游更名或不再转发，降级表现是：**删除本身照常成功，工作区记录与磁盘也已清理，只是当前页面上的行需要手动刷新才消失**（重新打开页面不会复活）。工作区引用清理引发的官方推送不依赖本事件，分组行的消失不受影响。

### 半失败（warnings）与手工清理

删除顺序刻意是「registry 引用清理 → 文件删除 → 事件广播」：JSON 域写入几乎不失败，文件删除可能因权限/挂载失败；先做可靠步骤、把不可靠步骤降级为**结果里的 warnings**（逐条形如 `<绝对路径>: <原因>`，机器可读，界面原样列出）。文件删除失败**不中止、不回滚**：会话仍从界面与工作区记录中消失，只是磁盘上留下了垃圾。清理顺序保证任何半失败状态都可重试收敛（detach 幂等、文件可再删），反向顺序则会留下不可重试的死状态。

warnings 里的路径可手工清除（工作区记录已收敛，**不要**再手改 `workspace.json`）：

```bash
rm -rf ~/.dsh/sessions/*/<会话id>
rm -f  ~/.dsh/storages/session_projcache/sessions/<会话id>.json
```

- 投影缓存是纯缓存：残留或缺失都由会话日志重建，不构成正确性风险。
- 日志目录扫描不到只记 warning 而非失败（registry 已清理，重启后自愈过滤）；扫描按会话 id 在 `sessions/*/` 下逐项目目录定位，成本与项目目录数线性。
- 附件目录 `~/.dsh/attachments/v1` **不在**手工清理范围内：没有反向索引、对象跨会话共享，除非确认所有会话都不再需要这些对象，否则不要整目录清理。

### 非目标（本能力）

- **批量删除**：V1 一次一个会话，只能从行菜单逐个来。
- **「停止并删除」**：live/运行中会话一律拒绝，本能力不负责停会话。
- **未归档会话直接删除**：想删先归档——两步防误删的第一道就是归档。
- **附件/图片 GC**：上游没有安全回收路径，见上。
- **多 DSH 版本精确兼容门**：接触点全部软降级，不引入版本 allowlist（与 multi-root 插件的 fail-closed 策略差异源于风险属性——本功能失效的代价只是入口消失）。

## 双端结构

```text
src/index.ts           宿主半：挂 Connection RPC 通道 /web-ux（session-delete 载体）
src/contract.ts        双端共享契约：通道/端点/失败码 + 手写边界校验（不引入 zod）
src/delete-session.ts  宿主删除流程：DI 纯流程 + 文件操作工厂（可 mock 单测）
src/client/            浏览器半：provider 徽章 + 删除入口/确认框 + locale + CSS module
test/                  单测：宿主 *.test.ts（node 环境）与浏览器 *.test.tsx（jsdom）
```

宿主半对 `@deepseek-ai/*` 一律 **type-only import**，运行时只靠 `inject` 字符串拿服务，产物 `lib/index.js` self-contained（仅 `node:*` 外置）。它在宿主侧除删除职责外仍是**客户端模块扫描的锚点**：web 客户端模块扫描只从 **bare 包名行**读取 `dsh.client` 声明，所以 bundle patch 必须继续按包名插入本包，徽章与删除入口才会被浏览器加载——宿主半因此不能删。

## 构建

双端自包含产物，`build.mjs`（esbuild）一次产出两个文件，external 列表里只有 `node:*` 与浏览器壳提供的运行时模块：

- `lib/client.js` — `src/client/index.ts` 打成单个 CJS bundle 并包进 `window.__ModuleLoader__.load({ id, factory })` 外壳（`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 由浏览器壳经 loader `require` 提供），CSS modules 编译为运行时 `<style>` 注入，因此**没有独立样式文件**，也不依赖本包 `dependencies`。
- `lib/index.js` — 宿主半的单个 self-contained ESM 产物，承载 `/web-ux` Connection RPC 通道，同时是客户端模块扫描的 bare 包名锚点。

类型工程是一个 solution（`tsconfig.json` 只汇总 references）+ 两个 composite 子工程，共享 `tsconfig.base.json` 的编译选项；两个子工程都是 `noEmit` 纯检查（不产 d.ts，只留 `.tsbuildinfo`，已被 `.gitignore` 忽略）：

- `tsconfig.host.json` — 宿主面（node 环境）：`src/index.ts`、`src/contract.ts`、`src/delete-session.ts` 与宿主测试 `test/{bundle,contract,delete-session,index}.test.ts`。
- `tsconfig.client.json` — 浏览器面（jsdom 环境的用例自带 `// @vitest-environment jsdom`）：`src/client/**`、`src/contract.ts`（两端共享的边界 parser）、`test/**/*.test.tsx` 与 `test/{client-apply,delete-client,delete-store,locale-parity}.test.ts`、`test/stubs/ui-primitives.tsx`（vitest alias 的 primitives 替身）。

两个工程都显式列出被 import 的测试文件：composite 工程要求程序里的每个文件都在自己的 `include` 内（`test/**/*.test.ts` 会把客户端 `.ts` 用例拉进宿主工程而报 TS6307），所以按宿主/浏览器归属逐条列名，而不是用宽通配。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：host + client 双工程
pnpm test          # vitest：徽章 + 删除流程/删除界面用例
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js（宿主 RPC 载体）、lib/client.js（徽章 + 删除入口）
pnpm verify:all    # lint + typecheck + build + test

# 只查单侧类型（等价于 tsc -b 的对应子工程）
pnpm exec tsc -p tsconfig.host.json --noEmit
pnpm exec tsc -p tsconfig.client.json --noEmit
```

`lib/` 随仓库提交（release 时递归重建保证新鲜），`node_modules/` 不入库（见 `.gitignore`）。依赖由 workspace 统一安装：仓库根 `pnpm install` 一次装齐。

## 安装到 profile

```bash
# 发布后按 tag 装（推荐）
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/web-ux"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/web-ux

docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: web-ux'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: web-ux` 的 bare 包名行）。

### 版本迁移（v1.2.0）

- **升级**：v1.2.0 起本包双端化——新增删除入口与宿主 RPC 通道，provider 徽章行为零变化；`dsh.client.inject` 增补 workspace / connection / locale 依赖，peer 范围统一为 `>=0.2.1-rc.2 <0.3.0`。按 tag 重装即可：`dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v1.2.0&path:plugins/web-ux"`，重启 web profile 生效。
- **回滚**：同一条命令改指 `#v1.1.1` 重装并重启，**只撤掉删除入口与宿主通道**（徽章照旧）；删除是真实写操作，已被删除的会话日志、投影缓存与工作区引用**不可恢复**，回滚不会让它们回来。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 非目标（本版本）

- 徽章不做点击交互（跨插件触发模型菜单无公开 API）。
- 不接管或重排官方 composer 工具行、模型选择器。
- 除「删除已归档会话」所需的 Connection RPC 通道外不提供其他宿主能力（项目级 MCP 属 [`dsh-plugin-project-mcp`](../project-mcp/README.md)）；删除能力自身的边界见「[删除已归档会话 → 非目标](#非目标本能力)」。

## 许可

Apache-2.0。
