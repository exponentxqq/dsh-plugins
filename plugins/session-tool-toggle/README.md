# dsh-plugin-session-tool-toggle

DSH 插件（**双端**，`exports "."` 宿主 + `exports "./client"` 浏览器）：**会话级工具面开关**——在单个会话内关掉不需要的模型可见工具（`mcp:<server>` 整组、`mcp:<server>::<tool>` 或尾部 `*` 单工具、`tool:<name>` 内置工具，`skill` 归一为 `tool:skill`），**下一次模型步骤生效**，由 `tools.restrict` 掩码与 dispatch guard 双层强制。两个入口共用**同一份状态**：`/tools` 命令面与会话头部工具区的 **Web 面板**（Connection RPC 通道 `/session-tool-toggle`）；用户级默认档在 `$DSH_HOME/session-tool-toggle/defaults.json`，只在会话创建时拍快照。

宿主半不含 Web 组件依赖，**任何 profile 都可单独安装**（命令面完整可用）；浏览器半只在 Web 组合下加载，入口是会话头部工具区的一枚图标按钮。平台范围 DSH `>=0.2.1-rc.2 <0.3.0`。**安装/升级后必须重启 web profile**：浏览器半的 bundle 由宿主在启动图里提供，热装不生效。

## 双端结构

```text
src/index.ts / src/host/   宿主半：/tools 命令面、每 agent 掩码层、状态持久化、默认档、RPC 通道 /session-tool-toggle
src/contract.ts            两端共享的线上契约（零 import，两端各内联一份）
src/client/                浏览器半：会话头部工具区入口 + 组件内 Modal 面板 + locale + CSS module
test/                      单测（宿主 node 环境 / 浏览器 jsdom）
lib/index.js               宿主产物（单文件 ESM，只外置 node:*）
lib/client.js              浏览器产物（CJS bundle，包在 window.__ModuleLoader__.load 壳里）
```

宿主半同时是 **Web 客户端模块扫描的锚点**：web 组合只从 bundle patch 的**裸包名行**读取 `package.json` 的 `dsh.client` 声明，浏览器半才会进启动图。因此 `cordis.patch.yml` 必须以 `name: 'dsh-plugin-session-tool-toggle'`（不带路径、不带 config）插入一行——去掉这行 = 面板入口静默消失，命令面照常。

## 用法：单一 `/tools`

| 输入 | 作用 |
| --- | --- |
| `/tools`、`/tools status` | 看本会话开关、默认档、可关对象分组计数、保护名单 |
| `/tools off <地址…>` | 关闭（一次可给多个地址） |
| `/tools on <地址…>` | 开启 |
| `/tools reset` | 回到**创建时快照**（默认档在那时拍下） |
| `/tools default` | 只看默认档（不写文件、不影响任何会话） |
| `/tools default off\|on\|set\|reset <地址…>` | 写默认档，**只影响之后新建的会话** |

三条地址分支：

| 地址 | 语义 |
| --- | --- |
| `mcp:<server>` | 整组关闭：该服务器全部工具 schema **与 `mcp:<server>` 服务器指令段**一并移除 |
| `mcp:<server>::<tool>`、`mcp:<server>::<prefix>*` | 单工具：只摘匹配的 schema，指令段保留 |
| `tool:<name>` | 内置工具；`skill` 是 `tool:skill` 的口语别名 |

- `mcp:<server>::*` 与 `mcp:<server>` 是**同一个意图**，规范形只留整组。
- 指向未注册 / 已断线服务器的地址**不报错**：意图记录在关闭集，服务器上线后自动生效。
- 一条命令里的多个地址**全有或全无**：任一地址文法错误、命中保护名单或保留名（`run_code`），整单拒绝，状态一个字节都不写。
- 回执只报**计数与代价形状**（隐藏几个工具定义、可见数变化、前缀缓存是否重建），不展开工具清单——清单看 Web 面板。

## 预期管理（先读这一节）

**不是安全边界。** 本插件面向 **token 经济**：关掉工具让它的 schema 与指令段不再进入模型请求，被关工具在迟到调用时会收到可读的拒绝理由。但这不是权限、沙箱或数据边界的语义——它不改变任何权限规则，也挡不住有意的越权；要限制能力请用权限/沙箱机制，别把「关掉 bash」当成安全措施（`bash` 本来就在保护名单里）。

**子代理 / 队友会话不继承父会话的会话级开关，但会按默认档拍自己的快照。** 父子各自独立：父会话额外关掉的 `mcp:dbx` **不会**传给子代理（dbx 对子代理仍可见），而默认档里的关闭项同样作用于子代理。面板对 `origin === 'subagent'` 的会话会多一条提示。

**历史不改写。** 已经发生过的工具调用原样留在会话历史里，本插件不清理也不重写；关掉一个工具只影响**之后**的模型步骤，历史里那条「已不可调的调用」会继续存在（重放或复制历史时也照旧）。

**KV 前缀缓存是一次性重建，开/关对称。** 一次真实改变 schema 的开关会让下一次请求**从第一个变化的 schema token 起**重建一次前缀缓存——这是本功能唯一的隐性代价，命令回执与面板的变更回执都会明说。两种「说了但不重建」的情形同样明说：重复开关（关闭集没变），以及 `/tools off mcp:zzz` 这类「记录意图但当前无匹配」（状态变了、模型请求没变）。

**`skill` 翻转有目录替换成本。** `skill` 被掩码后由官方工具自动退役目录，恢复时重发目录——两侧各产生一条模型可见的目录消息。这是唯一「关/开本身就有 token 成本」的特例，回执会单独点出来。

**保护名单只增不减。** 硬编码基线 `bash` / `pwsh` / `read` / `write` / `edit` / `glob` / `grep` 永远在名单里，配置只能追加（`protectedTools`），不能移除；`run_code` 是注册表保留名，同样拒绝关闭。名单内工具在面板上呈现为不可切换。

**持久化可能降级为内存态。** 主通道是会话日志里的整值插件记录（`plugin:session-tool-toggle/state`）加 host-only 投影 `sessionToolToggle`；读路径「投影优先 → `snapshotEvents()` 重放兜底 → 空态」，降级后先读内存后备。宿主模块解析失败或写入抛错时降级为**进程级内存态**（`kind: 'memory'`）：本会话的开关照常生效，但 **resume 之后会丢**，进程日志里只有一条 warn。这是有意的取舍：功能不缺失，只丢跨 resume 保持。

**依赖实验性通道。** `appendPluginRecord` 是 DSH 官方文档明写「本仓库之外的插件同样不得调用」的**实验性通道**（`dsh-session/README.zh.md` 的插件记录一节）。本插件依赖它换取 fork/resume 的免费语义；官方删除或收紧时，降级路径就是上面的内存态。不愿接受这条依赖的部署可以显式 `storage: 'memory'`（见「配置」）。

**安装/升级后必须重启 web profile。** 浏览器半的 bundle 由宿主在启动图里提供，`dsh plugin add` 不会热替换它；只重启之后才发现新面板或新行为是正常的。宿主半（`/tools`）同样以 profile 装配当刻的构建运行。

## Web 面板

**入口座位**：`conversation.session.header.utilities`（list 座位 / scope `session`），entry id `session-tool-toggle-panel`、order **20**（官方三项 -10 / -5 / 0 之后）。点开是组件内 Modal，四段自上而下：状态摘要 → 本会话开关（MCP 服务器 / 技能 / 内置工具三组，可折叠）→ 用户级默认档 → 关闭集；footer 左「刷新」右「关闭」。开关方向是**开 = 工具可用**：点击一个打开的组开关发出的是「把 `mcp:<server>` 加进关闭集」。分组清单里受保护 / 保留名 / 被其他作用域隐藏的行**禁用**并给出 `title` 理由；关闭集区可逐条「开启」，「恢复创建时快照」是两段式确认。

**与命令面是同一份状态，不是第二份。** 面板的读与写都走 Connection RPC 通道 `/session-tool-toggle`（`panel` / `toggle` / `reset` / `defaults` 四个端点），宿主侧两个入口共用 `src/host/control.ts` 的同一控制内核、同一状态存储、同一掩码层——面板里关掉 `mcp:yunxiao` 与 `/tools off mcp:yunxiao` 写的是同一条记录，随后 `/tools status` 显示同一关闭集，下一次模型步骤同时生效。面板不自行维护关闭集：**不做乐观更新**，开关翻转一律等宿主返回的新快照；打开时必拉一次，之后靠 mutation 回执、本会话的 `/tools` 执行事件（`command/executed`）、窗口 focus 与手动「刷新」收敛。

**默认档不追溯。** 面板里改默认档只写 `$DSH_HOME/session-tool-toggle/defaults.json` 并回新的默认档视图，**不改变当前会话的关闭集**，面板文案写明「只影响之后新建的会话」。也没有「保存并应用到本会话」复选框——那会破坏快照语义；想改本会话就用开关或 `/tools off|on`。

**面板不提供配置键编辑。** 插件配置键（`storage` / `protectedTools` / `defaultsFile` / `hostModuleBase`）只能在 profile 的插件行 `config:` 段里改；面板没有配置页、没有隐藏入口，也不提供 per-session 的配置覆盖。面板能做的只有：清单分组、会话级开关、默认档编辑、关闭集展示与恢复创建时快照。

### 降级矩阵

| 依赖 | 用途 | 失效表现 |
| --- | --- | --- |
| **RPC 通道** `/session-tool-toggle`（宿主 `connection.rpc.handle`） | 浏览器↔宿主唯一数据面 | 面板打开后显示 `unavailable`（「无法连接到 dsh 主进程」）且不渲染任何开关；**命令面仍可用** |
| **座位** `conversation.session.header.utilities` | 会话头部入口 | 入口不出现（软注册整段 `try/catch` 吞掉拒绝）；**命令面仍可用** |
| **client 服务 `connection`**（渲染期软取，不在 `inject` 名单） | 每次动作现取 RPC 客户端 | 首次打开按 `unavailable` 降级；服务晚到后下一次打开/刷新**自动恢复**，无需重载页面 |
| host 服务 `connection` / `webServer`（cordis `inject`） | 通道挂载点 | 通道不挂载（只 warn 一行）；命令面照常 |
| host 服务 `commands` | `/tools` 注册 | 没有 `/tools`；面板不受影响（通道独立挂载） |
| host 服务 `sessionProjections` | 读路径首选面 | 投影缺席 → 读路径回落日志重放，状态与开关照常 |
| host 服务 `agents` / `tools`（cordis `inject`） | 生命周期与掩码 | 宿主半整体不激活：没有命令面，也没有通道（硬依赖，非软降级） |
| 宿主 `dsh-session` 模块（身份断言） | 持久化写通道 | 进程级内存降级；面板出现 `persistence-degraded` 提示 |
| 默认档文件 | 新会话初始关闭集 | 缺失 → 空档 + warn（不算损坏）；损坏 / 半写 → 空档 + 一条 warn，面板出现 `defaults-corrupt` 提示 |

前三行是面板侧的三条主要接触点（RPC 通道 / 座位 / client 服务），其余按 Web 组合的实际接触点补齐：任何一条失效都只削弱对应的一个入口或一条读路径，不会让 GUI 崩溃。

## 配置

四个键全部可选，`cordis.patch.yml` 不带 `config:` 段，零配置可跑：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `storage` | `'auto'` | `auto` = 宿主模块可用则写会话日志，否则内存降级；`memory` = 只用内存（不解析宿主模块） |
| `protectedTools` | `[]` | 在硬保护基线之上**追加**保护名，只增不减 |
| `defaultsFile` | 省略 | 绝对路径覆盖默认档位置（省略即 `$DSH_HOME/session-tool-toggle/defaults.json`）；相对路径按未设处理并 warn |
| `hostModuleBase` | 省略 | 绝对路径覆盖宿主 `@deepseek-ai/dsh-session` 的解析锚点（排障 / 单测用） |

`Config` 用**原生 Schemastery** 声明（不是 zod / 标准 schema）：`--dump-config-schema` 只认原生 Schemastery 图，换成别的实现会把装入了本插件的 profile 的 schema dump 拖红。写错类型会被 schema 直接拒绝，而不是静默按默认值处理。

## 已知限制

- **读数取全局层**：面板的 `catalog` 与工具描述来自插件自身 ctx 的 `ctx.tools.schemas()`（全局层）。若某 profile 把内置 / skill 都注册在 agent 作用域，面板的 `stats.catalog`、`shadowed` 计数与描述会偏小；本部署主 profile 的实测基线（可见 214、MCP 139）属于正常口径，不受此偏差影响。
- **跨窗口不广播**：`command/executed` 只在命令提交的那个窗口发出，另一个窗口要靠 focus 或手动「刷新」才收敛；两处并发修改按「后写者胜」。
- **`--dump-config-schema` 整体可能 exit 1**：本部署的 web profile 自带 4 条 `unrecognized Loader tree carrier` 诊断（`/186`–`/189`，与本插件无关，全新空 `DSH_HOME` 同样红）。核对本插件的口径是 `x-cordis.entries` 中本插件条目的 `status` 为 `"schema"` 且没有指向本插件的诊断，不要追全局 exit 0。
- **非目标**：不做 per-skill 粒度、不做全局 / 进程级服务器启停（`plugin_manager` 已有）、不做子代理继承会话开关、不做工作区级默认档、不做投影 wire 实时推送或轮询、不改写历史、不适配 DSH `>=0.3.0`（走既有基线升级流程）。
- 无 Web 组合时只有命令面；面板入口与通道都不出现，也不报错。

## 排障

插件诊断统一带 `dsh-plugin-session-tool-toggle：` 前缀，并同时写 `ctx.logger` 与 console（web profile 启动后没有 logger exporter，单写 logger 在进程日志里看不见）：

```bash
docker logs dsh 2>&1 | grep dsh-plugin-session-tool-toggle
```

值得先看的几行：`已装配：inject=[agents, tools]，默认档 …，保护名单 N 项，持久化 …`（插件起来了）、`持久化通道：record` 或 `持久化通道：memory`（`auto` 解析后的实际生效通道；`storage: memory` 时改为启动行的「持久化 memory（配置指定）」）、`会话 <id>：已按默认档播种（快照 N 项，已生效）`、`已注册 /tools 命令`、`已注册 host-only 投影 sessionToolToggle`、`已挂载 RPC 通道 /session-tool-toggle`、`connection 服务解析为空（宿主未提供 Connection），RPC 通道未挂载`。

- **降级日志怎么读**：看到 `持久化通道：memory` 就是降级了；往前找紧邻的那条 warn，它会说明原因（身份断言失败 / 宿主模块不可用 / 未导出 `appendPluginRecord` / 写入抛错）。降级后开关仍生效，只是重启或 resume 后丢失；面板顶栏的 `persistence-degraded` 是同一事实的另一面。
- **回退到内存态**：在 profile patch 里按 id 覆盖配置（patch 的 `config` 是整段替换）：

  ```yaml
  - id: session-tool-toggle
    name: dsh-plugin-session-tool-toggle
    config:
      storage: memory
  ```

  重启后即不再解析宿主模块，也就没有实验性通道依赖；代价是每次 resume 都从默认档重新拍快照。
- **默认档写坏 / 想手改**：文件是 `{"version": 1, "disabled": [...]}`（地址用规范形），原子写落盘权限 `0o600`、新建目录 `0o700`；损坏或半写会被读成空档并记 warn，改好后下一个新会话生效。
- **面板入口不出现**：依次确认 bundle patch 里那条**裸包名行**还在、profile 已重启、座位属于当前 Web 组合；用 `docker exec dsh dsh --profile web --dump-config | grep -A2 'id: session-tool-toggle'` 看装配行。座位注册被拒时浏览器控制台会有一条 `session-tool-toggle: 会话头部工具区座位注册失败` 的 warn（client 侧日志不进 `docker logs`）。
- **改了源码或升级了版本**：`cd ~/develop/docker && docker compose restart dsh` 重启 web profile 生效（`link:` 安装的插件不在 hmr 的模块监听根内）。

## 构建与测试

双端自包含产物，`build.mjs`（esbuild）一次产出两个文件：`lib/index.js`（宿主 ESM，只外置 `node:*`，schemastery 打进产物）与 `lib/client.js`（浏览器 CJS bundle 包进 `window.__ModuleLoader__.load` 壳，`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 等由浏览器壳的 loader 提供，CSS modules 编译成运行时 `<style>` 注入）。不产 d.ts、不产 sourcemap。

```bash
cd plugins/session-tool-toggle   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm build        # esbuild → lib/index.js + lib/client.js
pnpm typecheck    # tsc -b：host + client 双工程（solution tsconfig）
pnpm test         # vitest：文法/状态/掩码/层/持久化/默认档/命令/内核/面板/RPC/client 套件
pnpm lint         # oxlint
pnpm verify:all   # lint + typecheck + build + test
```

`lib/` 随仓库提交（release 时递归重建保证新鲜），`node_modules/` 不入库。

## 安装到 profile

```bash
# 发布后按 tag 装（宿主半任何 profile 可装；浏览器半需 Web 组合）
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/session-tool-toggle"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/session-tool-toggle

docker exec dsh dsh --profile web --dump-config | grep -A2 'id: session-tool-toggle'
cd ~/develop/docker && docker compose restart dsh   # 必须：浏览器半随启动图加载
```

`dsh plugin add` 会把包写进 profile `package.json` 并把本包的 `cordis.patch.yml` 追加进 `dsh.profile.bundles`（插入 `id: session-tool-toggle` 的裸包名行）。升级 = 改 tag 重装后重启；回滚 = 指回旧 tag 重装后重启，关闭集记录仍留在会话日志里。git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 许可

Apache-2.0。
