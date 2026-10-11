# Design

## Context

仓库现状：pnpm workspace，每个插件是独立的官方组合包（bundle），已有两个先例——`dsh-plugin-git-graph-multi`（host + web client 双面，esbuild 构建）与 `dsh-plugin-multi-root-workspace`（服务替换型，本插件将软依赖其 registry）。

目标 DSH 版本（0.2.0-rc.2）的公共扩展点已逐一核验：

- **Client**：`conversation.composer.dock` 是输入框下方状态行的 list slot（官方 StatsPills 以 `id: 'stats', order: 0` 占用，官方插件开发模板以此为教学示例）；slot 组件经 `PropsRuntime` 收到 `props.sessionId`；`ctx.modelDirectories.directoryFor(sessionId)` 返回每会话共享的 `ModelDirectory`，其 `store`（uSES-safe SnapshotStore）快照含 `current: ModelSelection | null`（`provider` = provider 标识符）与 `groups: readonly ModelProviderGroup[]`（含 provider 显示名）。
- **Host**：`ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 以运行时为解析基准，`loader.unwrapExports` 后逐服务器 `ctx.plugin(mod, config)`（与 cordis.yml 加载序列一致）；mcp-client 的 `Config` 为 stdio | streamable-http 二选一（`serverName` 必须匹配 `[A-Za-z0-9_-]{1,32}`，同注册作用域重名在加载时抛错）；`WorkspaceRegistry.list()` 返回登记顺序的工作区（`path` 为 canonical 根路径），`resolveByPath` 仅精确 canonical 匹配；`agent/created` 事件负载 `{agent}`（`agent.ctx` 可用，会话创建元数据含校验过的绝对 `cwd`）；`tools.restrict({deny})` 掩该 scope **继承**的工具面（global 层 + 祖先 scope 的贡献，本 scope 自身注册的除外）、**未知名即抛错**、返回 disposer、多条 restriction 相交，且**未注册在 scope 上（无 scope 标签的 ctx）即抛错**；`tools/change` 在工具注册/注销**及 scoped restriction 变化**时触发；`tools.schemas(scope?)` 以 `scope` 为该 scope 视角、省略则 global 视角；`agent/created` 为 **serial 派发且框架 await 监听器返回值**；`ctx.commands.register` 注册人类斜杠命令。
- **本仓库**：`dsh-plugin-multi-root-workspace` 的 registry 服务提供 `granted(primaryRoot): readonly string[]` 与 `onChange(listener)`；该插件受版本 allowlist 门控，可能整体缺席。
- **先例**：host 面直接使用 `node:fs/promises` 是 git-graph-multi 的既有做法（host 进程为受信代码，不受 agent 沙箱约束）。

约束：不修改任何上游包与既有插件；对 multiRootRegistry 只能软依赖；工具名（`mcp__<serverName>__*`）是会话历史与权限规则引用的稳定契约，绝不改写。

## Goals / Non-Goals

**Goals:**

- 一个 bundle 同时交付 provider 徽章（client 面）与项目级 MCP（host 面），全部经公共扩展点实现，零上游侵入。
- 工具可见性按工作区隔离，归属判定 fail-closed；隔离覆盖模型可见列表与实际调用。
- serverName 冲突仲裁确定性强：结果只由「主根 > 附加根、登记顺序」与文件内容决定，与加载时序无关。

**Non-Goals:**

- 不接管或重排官方 composer 工具行、模型选择器（Q10 已定为状态行追加条目）。
- 不做徽章点击交互（跨插件触发模型菜单无公开 API，脆弱）。
- 不递归扫描 `.dsh/mcp/` 子目录（明确忽略）。
- 不做隔离粒度细化到会话/目录级（工作区粒度为止，v1 语义）。
- 不做 agent 级 serverName 复用（agent-scoped mcp-client 会导致每 agent 一条连接，资源翻倍且与进程级仲裁冲突）。
- 不做 MCP **资源**面（`dsh-mcp-resources` 的 `list_mcp_resources` / `read_mcp_resource`）的工作区隔离：本插件隔离的是 `mcp__<serverName>__*` 工具命名空间；资源提供者按 agent scope 注册的语义属上游，若需隔离应另开提案（README「边界」记录）。
- 不做 watch 失效时的自动轮询（`/mcp-reload` 兜底，README 说明）。

## Decisions

### D1 插件形态：双面 bundle，bare package name 行挂载

结构照 git-graph-multi：`package.json` 声明 `dsh.bundle.patch`（cordis.patch.yml 插入一行 bare 包名行）与 `dsh.client`（`platform: web`、`inject: [model-selection 与 slots 相关客户端包]`）；`exports "."` 为 host 面（自包含 ESM bundle），`exports "./client"` 为浏览器面（ModuleLoader 工厂模块）。web 客户端模块扫描只从 bare 包名行读 `dsh.client` 声明（multi-root 插件文档确认的机制），故 client 锚点行与 host 主行同 id。

*替代方案*：单面插件无法承载徽章；两个独立 bundle 则把「同一 bundle id、同一安装单元」的交付诉求拆散，均否决。

### D2 徽章：conversation.composer.dock 追加条目

在 dock slot 注册 `id: 'web-ux-provider'`、`order` 大于官方 stats（排在其后）的条目。组件订阅 `directoryFor(props.sessionId).store`：`current.provider` 在 `groups` 中按 provider 标识符匹配取显示名，匹配不到回退显示 provider 标识符原文；`current` 为 null 时返回 null（不渲染）。渲染为静态胶囊 span + 原生 title tooltip（`providerId · modelId`），`max-width` 上限 + `text-overflow: ellipsis`，样式对齐官方胶囊的字号/配色/圆角变量。

*替代方案*：工具行 `conversation.input.right`（与紧凑模式测量耦合）与接管模型座位（遮蔽官方 ModelSelect、升级跟随成本高）均已评估并否决（Q10）。

### D3 MCP 客户端获取与加载：运行时 loader.import + 每服务器一个子插件

host 面启动时 `ctx.loader.import('@deepseek-ai/dsh-mcp-client')` 一次、缓存模块；每台服务器一次 `ctx.plugin(mod, expandedConfig)`，子 fiber 即生命周期单元——dispose 即断开连接并注销工具（mcp-client 自身保证）。不把 mcp-client 打进 bundle：它随宿主安装与升级，静态打包会被 peer 版本漂移卡死。`ctx.plugin` 调用包 try/catch：单台失败（含与 profile 级配置撞名被 mcp-client 拒绝）记 error 日志，不影响其他服务器。

### D4 扫描：登记顺序遍历 + 软依赖附加根 + node:fs 直读

按 `workspaceRegistry.list()` 的登记顺序遍历工作区，每个主根先读自身 `.dsh/mcp/`，再按 `ctx.get('multiRootRegistry')?.granted(主根)` 顺序读各附加根的 `.dsh/mcp/`（服务缺席则跳过附加根）。目录读取用 `node:fs/promises`（git-graph-multi host 面先例）。解析：`.yaml/.yml` 用 `yaml` 包、`.json` 用 JSON.parse → 字符串叶子递归展开 `${VAR}` / `${VAR:-default}`（作用域 `process.env`，缺省无默认 → 空串 + warn）→ `serverName` 取显式覆盖或文件名去后缀 → 正则校验，非法记 error 跳过。遍历顺序天然实现冲突优先级（登记靠前的工作区先处理、同一工作区主根先于附加根），扫描器维护 `activeServerName → 来源` 映射做先到者得裁定。

### D5 冲突仲裁前置到扫描器，不让 mcp-client 抛错

mcp-client 对同作用域重名在 `apply` 时抛错——若放任发生，错误形态由插件加载器决定且时机不可控。扫描器在调用 `ctx.plugin` 前自行裁定：后来的同名配置记 error（指明双方工作区/根/文件）并跳过，胜者正常加载。绝不自动改名（Q9：名字是工具名契约的一部分）。

### D6 工作区隔离：agent/created 挂 restrict + tools/change 重算 + guard 兜底

- **归属判定**：取会话创建元数据的绝对 `cwd`，逐级向上对每级路径做 `realpath` 后与「全部登记根集合」（各工作区 `path` + 其 granted 附加根）比对，最近命中者所属工作区即归属；到根目录仍无命中 → 无归属（fail-closed，deny 全部项目 MCP 工具名）。`resolveByPath` 只做精确匹配不认子目录，故自实现向上遍历。
- **deny 推导（三源合并）**：项目 MCP 工具名只从**实际注册名**推导，绝不手工拼名（restrict 遇未知名抛错）。候选集是三个读数的并集：
  1. 宿主全局层 `tools.schemas()`（本插件自身行注册之处——实测项目 MCP 名位于此层：同构 web 实例上 `global=9(mcp=6)`）；
  2. **该 agent 自己 scope 的视角** `tools.schemas(agent)`——实测模型可见的内置工具在 agent 平面（preset 等祖先 scope）而不在全局层（同实例 `scoped=35`），把项目 MCP 行排布到该平面的部署同样成立，故两种排布都读；
  3. 该 agent 当前限制已屏蔽的名字（其 server 仍在受管集合内）——否则第 2 项在限制生效后会缩水，下一遍重算得出更小的 deny 并摘下限制，形成振荡（diff 守卫只防「相同集合重复注册」，防不住集合缩水）。
  名字的 server 一旦离开受管集合即从第 3 项剔除；`restrict` 仍失败时用「实时读数（不含携带项）」再重试一次，覆盖「服务器重载后旧工具名残留」并顺带修掉「先 lift 后 restrict 失败 → 旧实现因 diff 守卫永久不再重挂」的漏洞。
- **挂接与刷新**：`ctx.on('agent/created', …)` 在 `agent.ctx` 上 `tools.restrict({deny})`，disposer 存入 agent 键控表（随 agent scope 自动清理）；`tools/change` 时对全部存活 agent 重算。**`agent/created` 是 serial 派发且框架 `await` 监听器返回值**，故监听器**返回** attach 的 Promise：会话首步装配 prompt 之前限制必定已生效（旧实现 `void attach()` 与首步装配竞态，实测新建子代理仍能列出越权工具）；失败只记 error，不让创建失败。**每次重算全程兜底**：归属、全局层读数、视角读数各自 try/catch 并降级（归属失败即 fail-closed），单个 agent 的运行期异常不再中断整批 `refresh()`（旧实现只在 restrict 处兜底，一个 agent 抛错会跳过后面的 agent）。**diff 守卫**：新 deny 集与该 agent 当前已注册的限制集相同时跳过（restrict 本身也触发 tools/change，无守卫会自激循环）。
- **纵深防御**：每 agent 再挂一个 dispatch guard，调用受管前缀且不属于归属集合的工具名时返回拒绝理由——覆盖「工具注册与 tools/change 重算之间」的理论窗口及 restrict 名单漂移的边角；限制未挂上时它仍是唯一拦截面，故必须保留。
- **可观测性**：本 profile 只在 boot 阶段注册 logger exporter，运行期 `ctx.logger` 无出口 → 诊断同时写 `ctx.logger` 与 `console`（`docker logs dsh` 里唯一可见的通道）。每次重算一行（cwd、归属根数、可见 serverName、`global(mcp=N)`、`scoped(mcp=N)`、携带数、deny 名单样本），每次限制生效再一行 `masked N tool(s)`，`tools/change` 前三次到达也打点——「隔离算空」与「隔离生效」因此可区分。
- **失败语义**：MCP 尚未连上时受管 serverName 集合已知（扫描结果）而工具未注册，deny 名单为空是正确状态（无可见工具可掩）；工具注册事件到来即补挂。

*替代方案*：进程级可见（Q1-A）被否决；agent-scoped 加载（每 agent 独立连接与命名空间）资源开销与仲裁复杂度均劣，否决。

### D7 热重载：目录 watch + 两个登记信号 + /mcp-reload 兜底

对每个已发现的 `.dsh/mcp` 目录 `fs.watch`（debounce）；`multiRootRegistry.onChange` 与工作区登记变化（`domain/changed` 事件仅作触发器，不依赖载荷形状；以 `workspaceRegistry.list()` 全量 diff 为准）触发全量重扫。重扫为声明式 diff：新增 → 加载，消失 → dispose，内容变更 → dispose + 重载，serverName 变化视为删除旧 + 新增新。`/mcp-reload` 经 `ctx.commands.register` 注册为人类命令，执行全量重扫并把加载/跳过/失败计数反馈给用户。

### D8 构建与依赖

照 git-graph-multi 的 esbuild + 双 tsconfig 模式（host bundle 自包含；client 产物为 ModuleLoader 工厂）。`yaml` 作为运行时依赖打进 host bundle（multi-root-workspace 同款）。测试用 vitest（host 逻辑单测：env 展开、冲突仲裁、归属判定、deny 推导；client 徽章用 @testing-library/react 快照行为测试）。

## Risks / Trade-offs

- [restrict 遇未注册名抛错] → deny 名单只从实际注册名（三源读数）推导；单次 restrict 包 try/catch，失败后立即用实时读数重试一次，仍失败留给下一次 tools/change / 重扫 / `/mcp-reload` 补挂。
- [可见性排布差异 → 单一读数覆盖不全（实测同构 web 实例：`global=9(mcp=6)`、`scoped=35(mcp=6)`——内置工具在 agent 平面）] → 候选集并入该 agent scope 的视角读数；诊断行同时打印两边的 MCP 计数，回归单测覆盖「只有 agent 视角可见的名字也必须进 deny」。
- [单个 agent 的运行期异常中断整批 refresh（旧实现只在 restrict 处兜底）] → 归属/全局读数/视角读数各自兜底 + 每次重算全程兜底；诊断行给出阶段化错误文本。
- [会话创建与限制挂载的竞态（实测：新建子代理先看到越权工具，其调用只能靠 guard 拦）] → serial attach：监听器返回挂载 Promise，框架 await 后才释放会话首步；headless 两步会话（先 sleep 再列工具）与单测验证。
- [限制生效后视角读数缩水 → 反复挂/摘] → 候选集并入「当前已屏蔽且 server 仍受管」的名字；单测覆盖「视角不再报告仍保持屏蔽、不重复注册」。
- [tools/change 自激循环] → diff 守卫：deny 集无变化时不重注册。
- [工具注册与重算之间的理论可见性窗口] → per-agent dispatch guard 兜底调用面；会话创建窗口已由 serial attach 关闭。
- [multi-root 版本 allowlist 不匹配导致 registry 缺席] → 软依赖降级只扫主根，README 记录该限制。
- [项目级与 profile 级 MCP 撞名] → mcp-client 同作用域拒绝后加载者；宿主先载 profile 级时项目级该台 `ctx.plugin` 抛错，被 try/catch 记 error 跳过（行为与 Q9 语义一致：名字不改写，冲突可见）。
- [watch 在特殊文件系统（NFS/容器挂载）上不可靠] → `/mcp-reload` 兜底，不做自动轮询。
- [徽章在空白会话期随状态行缺席] → 上游既有行为，Q10-A 已接受的代价。
- [mcp-client API 演进（rc 阶段）] → peer 依赖声明最低版本；`engines.dsh` 与 git-graph-multi 一致，破坏性变更由仓库 `pnpm verify` 的兼容检查拦截。

## Migration Plan

纯新增插件，无存量迁移。发布：`pnpm release <version>` 打统一 tag；安装到 profile：`docker exec dsh dsh plugin --profile web add "github:exponentxqq/dsh-plugins#v<version>&path:plugins/web-ux"`。回滚：profile 移除该插件行并重启 profile；项目侧 `.dsh/mcp/` 目录留存不产生任何影响（无插件即无扫描者）。

## Open Questions

- 官方胶囊的具体 CSS 变量/类名（实现时对齐 StatsPills 产物，不影响行为契约）。
- `domain/changed` 载荷中工作区域的精确标识（设计已声明不依赖载荷形状、以 registry 全量 diff 为准，实现时仅作触发器接线的确认）。
