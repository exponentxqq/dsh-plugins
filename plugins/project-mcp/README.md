# dsh-plugin-project-mcp

## 定位

端性：host-only

DSH 插件（**纯宿主面，`exports "."`**）：让 MCP 配置随项目目录走——每个工作区根（及其附加根）的 `.dsh/mcp/` 目录下每个配置文件定义一台服务器，自动发现、加载、热重载，并**按工作区隔离工具、提示词中的服务器名与资源读取（三面）**，多项目并行时各会话只看得见、也只用得上自己项目的 MCP 能力。

本包不声明 `dsh.client`，不含任何 Web UI 组件，因此 **web / acp / headless 等任何 profile 都可单独安装**。

## 与其他插件的关系

本包由 [`dsh-plugin-web-ux`](../web-ux/README.md) 拆分而来（变更 `split-project-mcp-plugin`，行为零变化）：项目级 MCP 本是纯宿主能力，与 Web UI 无耦合，此前被 web 化的包名与安装面锁死在 web 场景。拆分后：

- `dsh-plugin-project-mcp`（本包）：项目级 MCP 全部宿主实现——扫描、冲突仲裁、加载管理、工作区隔离（工具 / 名字 / 资源三面）、监听、`/mcp-reload`；
- `dsh-plugin-web-ux`：Web 界面体验（双端）——provider 徽章 + 侧栏已归档会话的删除入口；其宿主半不只是客户端模块扫描所需的 bare 包名锚点，还承载该能力的 Connection RPC 通道。后续 Web 界面体验优化仍落在它。

两者**互不依赖**，可分别安装；web profile 同时装两个即为拆分前的完整形态。

## 配置

`.dsh/mcp/` 下每个 `.yaml` / `.yml` / `.json` 文件定义**一台**服务器（子目录与其他后缀一律忽略，不递归）：

```yaml
# <某工作区根>/.dsh/mcp/figma.yaml
transport: stdio                       # 必填：stdio | streamable-http
command: /home/docker/.dsh/figma-mcp/node_modules/.bin/figma-developer-mcp
args: [ "--stdio", "--no-telemetry", "--image-dir", "/home/xuqinqin/develop" ]
env:
  FIGMA_API_KEY: ${FIGMA_API_KEY}      # 运行时从 dsh 进程环境展开，密钥不入库
```

```json
{
  "transport": "streamable-http",
  "url": "${MCP_URL:-http://127.0.0.1:8081/mcp}",
  "headers": { "authorization": "Bearer ${MCP_TOKEN}" }
}
```

- **serverName**：默认取文件名去后缀（`figma.yaml` → `figma`），文件内可用 `serverName:` 显式覆盖；必须匹配 `[A-Za-z0-9_-]{1,32}`（mcp-client 的契约），非法者记错误日志并跳过，其余文件不受影响。
- **环境变量展开**：所有字符串叶子递归展开 `${VAR}` 与 `${VAR:-default}`，作用域是 dsh 进程环境；变量未设置（或为空）且无默认值时展开为空串并记警告。`:-` 与 shell 语义一致：未设置**或为空**都取默认值。
- **单文件失败不影响其他**：解析错误、非法 serverName、缺 transport、连接失败都只作用于该文件/该服务器，逐个记日志。

## serverName 冲突仲裁

同一 `serverName` 被多处定义时，**先到者得**，顺序完全由下面这条确定性规则决定，与加载时序无关：

1. 工作区之间按**工作区登记顺序**（`workspaceRegistry.list()` 的顺序，即侧栏顺序）；
2. 同一工作区内，**主根优先于附加根**，附加根之间按授予顺序；
3. 同一目录内按文件名排序。

后来者记 `error`（日志同时指明胜出方与跳过方的**工作区、根目录与文件名**）并跳过。插件**绝不对 serverName 自动改名**——`mcp__<serverName>__*` 已写入会话历史与权限规则，是稳定契约。

项目配置与 profile 级 MCP 行撞名时同样不改名：profile 行先占住名字，项目侧那台按单台失败记日志跳过（行为与上面一致，冲突可见而非静默）。

## 工作区隔离语义

- **归属判定**：取会话创建目录（cwd），逐级向上做 `realpath` 规范化后与全部已登记根比对；**每一层分两轮**——先看该层是否是某工作区的**主根**（primary，是则该工作区赢），不是再看是否是某工作区被授予的**附加根**（granted，是则授予方赢），都不是才上溯一层。因此**同层主根优先**（一个目录本身就是某工作区的主根时，不会因为同时是别的工作区的附加根而被抢注）、**跨层最近层优先**（近层的附加根仍胜过远层的主根）；同一目录被多个工作区授予时按**工作区登记顺序**取首个；到根目录仍无命中则无归属。
- **可见集合**：归属工作区的**整个根集合**（主根 + 授予它的附加根）下定义的服务器对该会话可见，其余项目的工具、名字与资源一律不可见/不可用。归属只决定**谁赢**，不改变赢者可见的范围；返回的根集合保持登记时的拼写（与 scan 仲裁同一份拼写）。
- **与 scan 仲裁的分工**：`roots.ts` 的有序 root set 服务 serverName 的**先到先得**仲裁，归属判定只决定会话归属哪个工作区，两者各司其职。
- **fail-closed**：无归属的会话看不到**任何**项目 MCP 工具、提示词中的项目服务器名，其资源读取也全部被拒。
- **工具面三层强制**：`tools.restrict({ deny })` 把关掉的名字从模型可见的工具表里移除（restriction）；每个 agent 另挂一个 dispatch guard，拒绝对越权受管名的调用（per-agent guard，覆盖「工具注册」与「限制重算」之间的窗口，以及名单漂移的边角）；插件 `apply` 时另在 `ctx.tools.guard` 注册一个**进程级全局闸口**（global gate）——按同一份归属判定与 deny 集合在 dispatch 前兜底拒绝，即使某会话的 restriction / per-agent guard 因重载等时序缺失，越权 `mcp__*` 调用仍被拒，agentless 进程内直接调用也落在这层。限制万一挂不上，guard 与全局闸口仍构成双层拦截面。
- deny 名单**只从实际注册名推导**（`restrict` 遇未注册名会抛错，所以绝不手工拼名）。候选集取三个读数的并集：宿主全局层（`tools.schemas()`）、**该会话自己 scope 的视角**（`tools.schemas(agent)`）、以及**当前已被屏蔽且服务器仍在受管集合内**的名字。三者缺一不可：本部署的模型可见**内置**工具在 agent 平面（实测同构实例 `global=9` / `scoped=35`），把项目 MCP 行排布到该平面的部署同样成立；而第三项防止「限制生效后视角读数缩水 → 下一遍算出更小的 deny → 摘下限制」的振荡。内置工具与非本插件管理的 profile 级 MCP 工具（如 `mcp__dbx__*`）永远不会进名单，也不受影响。
- **健壮性**：归属判定、全局读数、视角读数各自兜底并降级（归属失败即 fail-closed 全屏蔽），每次重算整体再兜底一次——单个会话的运行期异常不会中断其他会话的刷新，且诊断行会点出失败阶段。
- **动态刷新**：`tools/change`（服务器连接、断开、工具同步）对全部存活 agent 重算；`agent/created` 是 serial 派发且框架会 `await` 监听器返回值，插件**返回**挂载 Promise，因此新会话**首步装配前**限制必定已生效。进程启动或插件重载时另有 **boot 补挂**：对补挂时已存活的会话逐个 attach（`boot: swept N live session(s): attached A, already tracked S, failed F`），重载前就存在的会话同样进入三层强制。重算幂等——deny 集不变就**不重复注册**（`restrict` 本身会触发 `tools/change`，没有这条 diff 守卫会自激）。
- **排障**：本 profile 运行期没有 logger 出口，插件的诊断同时写 `ctx.logger` 与 `console`，因此 `docker logs dsh | grep dsh-plugin-project-mcp` 能看到 `isolation: cwd=… roots=N visible=[…] global=N(mcp=N) scoped=N(mcp=N) carried=N deny=N […]`、`isolation: masked N tool(s) …` 与冲突/跳过行——「隔离算空」和「隔离生效」一眼可辨。名字面的 `prompt: resource names …` 行与重载时的 `boot: …` 行见下节。

## 三面隔离（工具 / 名字 / 资源）

同一次归属判定产出同一份 `visible`，三面共用同一刷新路径与同一实时读数；无新开关、无额外连接、无上游修改：

- **工具面**：`tools.restrict({ deny })` 把越权 `mcp__<server>__*` 从模型可见工具表移除；每个 agent 另挂 dispatch guard，拒绝对越权受管名的调用；`apply` 时注册的进程级全局闸口按同一 deny 集合在 dispatch 前兜底（含 agentless 调用，见上节「工具面三层强制」）。
- **名字面**：监听 `system-prompt/assemble` 瀑布，在 `await next()` 之后按**调用会话**的归属改写 `## MCP resource servers` 段里的名字数组（保留 profile 名，移除无权项目名），并整段删除无权项目服务器的 `mcp:<server>` 指令段（标题与正文一并消失）。过滤后名字数组为空 → 整段删除（与上游「无服务器不贡献该段」同形）；上游文本形态无法解析 → **fail-closed 删段**并 warn（前 3 次）。改写用 `{...section, text}` 保留 `interpolate:false`——挑字段重建会让服务器 instructions 被当模板插值。
- **资源面**：`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource` 三个工具在**派发前**按 `arguments.server` 判定：属于 `blocked` 且不在本会话 `visible` → 拒绝，**不触达**目标服务器，模型拿不到该服务器的资源、URI 或内容。拒绝文案与上游「不可用」逐字同形（`MCP resource server "<server>" is unavailable in this agent's scope`），模型无法据此探测服务器是否存在；`server` 缺失或非字符串时交回工具自身校验，不额外拒绝。原生调用与 PTC（`run_code`）内层调用走同一条 guard 管线。
- **口径**：`visible` = 该会话归属工作区根集合下**声称（claimed）**的服务器名（授权面，不变）；`blocked = claimed \ failedClaims`（= 已加载 ∪ 加载中；加载失败的 claim 剔除）。应拒 / 应隐集合 = `blocked \ visible`。每次调用与每次装配都读实时集合，不缓存快照。
- **`blocked` 的动机与窗口语义**：旧口径直接拿 `claimed` 当应拒集合，一个**加载失败**的项目 claim（例如项目侧 `figma` 为 profile 行占名而加载失败）会把同名 profile 服务器一并 deny / 隐掉，误伤与本工作区无关的会话。改为 `blocked` 后，失败的 claim 不再进入应拒集合；**尚未加载完的 claim 仍在集合里**（fail-closed 方向）——若改用纯 `active`（加载成功后才写入），`connection.ready` 之前 provider 已注册而 `active` 尚未落笔，会开一个 fail-open 窗口。只有「确定加载失败」的才剔除。
- **诊断**：`docker logs dsh | grep -E "isolation:|prompt: resource names|boot:"`。既有 `isolation: cwd=… roots=N visible=[…] … deny=N […]` 不变；新增名字面行 `prompt: resource names session=<id> cwd=<cwd> tracked=yes kept=[…] removed=[…] sections=[…] unparsable=N`，未被跟踪的装配为 `prompt: resource names session=<id> cwd=none tracked=no hidden=<n>`。无归属会话仍被建模为「已跟踪、可见集为空」（`roots=none visible=[]`），因此显示 `tracked=yes`、`kept` 只含 profile 名。同一形状只打一条，形状变化才再打；`unparsable` warn 前 3 次（`prompt: resource names section unparsable (deleted), upstream text drifted`）。启动 / 重载补挂打 `boot: swept N live session(s): attached A, already tracked S, failed F`（`live=0` 静默；逐条失败另打 `boot: cannot attach the workspace isolation of session <id>: <error>`，不中断其余会话）；全局闸口拒绝越权调用时打节流 warn（前 3 次后每 100 次，闸口安装失败仅 error），见「降级矩阵」。

## 热重载与 `/mcp-reload`

- 对每个根按阶梯监听**最深的存在层级**：`<根>/.dsh/mcp` → `<根>/.dsh` → `<根>`，因此「全新项目里第一次创建 `.dsh/mcp/`」也会自动加载，无需重启；文件事件去抖 250 ms。
- 重扫是**声明式 diff**：新增 → 加载，消失 → 卸载，内容变更 → 卸载后重载，改名 = 删旧增新；未变化的不动。
- 工作区登记变化与附加根授予变化（`multiRootRegistry.onChange`、`domain/changed`）触发全量重扫；事件只当触发器用，**不读载荷**，重扫一律以 `workspaceRegistry.list()` 的最新结果为准。
- **兜底命令 `/mcp-reload`**：全量重扫并向你反馈「加载 / 重载 / 卸载 / 保持不变 / 跳过 / 失败」计数。watch 在 NFS 等特殊挂载上不可靠时用它；本版本不做自动轮询。

## 软依赖与降级

[`dsh-plugin-multi-root-workspace`](../multi-root-workspace/README.md) 是**软依赖**：它的 registry 服务在就扫描「主根 + 附加根」，缺席（未安装或未激活）则**静默降级为只扫各主根**，其余行为不变，不报错。

## 降级矩阵

| 条件 | 行为 |
| --- | --- |
| 无 `systemPrompt` 服务 | `system-prompt/assemble` 监听不触发，名字面静默缺席；工具面与资源面不受影响（该部署的提示词里本来也没有名字段） |
| 无 `mcpResources`（上游未装） | 三个资源工具不存在，资源面自然缺席；工具面与名字面不受影响 |
| 名字段文本形态漂移（上游改文案） | 该段整体删除（fail-closed）+ warn 前 3 次；资源读取的硬拒绝不受影响 |
| HMR / 插件重载后的存量会话 | 重载即补挂：apply 末尾的 boot 补挂对已存活会话逐个 attach（`boot: swept …`），工具面三层与资源面随即恢复；attach 落地前的极短窗口由进程级全局闸口兜底（越权 `mcp__*` 一律拒，fail-closed）；单条补挂失败不中断其余会话（日志 `boot: cannot attach …`） |
| `exec.agent === undefined` 的进程内直接调用 | per-agent guard 不参与，由进程级全局闸口接管：受管越权名一律拒（fail-closed），profile 级与可见集内名字不受影响 |

已知噪声：加载失败的 claim 每次 rescan 都会重试并重记一条 error（与 scan 冲突日志同类），不影响 profile 服务器与其它配置。

**回滚代价**：降级到上一版本即恢复旧行为——同时退回「名字 / 资源面不隔离」与旧工具面的 `claimed` 口径（加载失败的 claim 会再次误伤同名 profile 服务器），并退回进程级全局闸口与重载补挂（重载窗口回归旧行为：存量会话要等下一次装配才恢复隔离）。无数据迁移、无配置清理：本版本未新增任何配置键。

## 残余边界

- **人类 UI**：`session-tool-toggle` 的 `/tools` 面板与命令输出仍显示项目服务器分组名——管理员视图，按 spec 不在隔离范围；在该面板里开关某分组也不改变资源归属判定。
- **全局注册层**：项目服务器的名字仍在全局工具 / 资源注册表里（隔离发生在模型可见面与派发闸门，不改注册层）。将来若有新的消费者直接读全局注册表，需要重新评估。
- **升级前历史**：升级前会话历史里已出现的项目服务器名与工具调用结果不追溯改写或清除；本版本只约束升级后的提示词装配与调用面。
- **与会话级开关正交**：`/tools off mcp:<server>` 只关工具 schema 与 `mcp:<server>` 指令段（用户偏好），资源守卫按工作区归属独立判定（安全边界）。越权服务器的资源即使开关处于打开也被拒；本工作区服务器的资源即使开关关闭仍可读（冒烟⑦实测，见证据文件 [artifacts/isolation-smoke.md](artifacts/isolation-smoke.md)）。

验证证据：[隔离冒烟记录](artifacts/isolation-smoke.md)——结论：隔离冒烟 9 条全部通过（9/9），无红项；真实宿主复验与 fail-closed 边界同样成立。

## 构建与测试

自包含宿主产物：`link:` 与 git 两种安装形态都不依赖本包 `dependencies`（`yaml` 打进产物）；**`@deepseek-ai/dsh-mcp-client` 刻意不打进产物**——它经 `ctx.loader.import` 运行时加载，按 profile 目录为基准解析，因此与 profile 自己那些 MCP 行共用**同一个模块实例**（这正是项目级与 profile 级撞名能被 mcp-client 拒绝、而不是各自为政的前提）。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -p tsconfig.host.json：host 单工程
pnpm test          # vitest：扫描/仲裁/env 展开/归属/隔离/加载管理/热重载
pnpm lint          # oxlint
pnpm build         # esbuild → lib/index.js
pnpm verify:all    # lint + typecheck + build + test
```

`lib/` 随仓库提交（release 时递归重建保证新鲜），`node_modules/` 不入库（见 `.gitignore`）。依赖由 workspace 统一安装：仓库根 `pnpm install` 一次装齐。

## 安装到 profile

```bash
# 发布后按 tag 装（任何 profile 均可单独安装本包）
TAG=$(git describe --tags --abbrev=0)   # 当前 tag（也可填任意历史 tag）
docker exec dsh dsh plugin --profile web add \
  "github:exponentxqq/dsh-plugins#${TAG}&path:plugins/project-mcp"

# 本地开发调试（改源码后重建 + 重启 profile 生效）
docker exec dsh dsh plugin --profile web add \
  /home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp

docker exec dsh dsh --profile web --dump-config          # 校验组合可加载（安装冒烟探针）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: project-mcp'
```

已知环境问题：dsh 0.2.2-rc.1 的 `--dump-config-schema` 会因官方 `dsh-agent-preset` 的自定义载体（`EntryGroup.key` 标记类，非原生 group/include）报 4 条 `unrecognized Loader tree carrier` error，全新空 `DSH_HOME` 同样红（与本插件无关；本插件在三个 profile 上零诊断）。装载冒烟因此以 `--dump-config` exit 0 为准，schema dump 只按本插件条目核对。

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: project-mcp` 的 bare 包名行）。web profile 想要徽章时另装 [`dsh-plugin-web-ux`](../web-ux/README.md)。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换（插件自己的 `.dsh/mcp/` 重扫是热重载的，别混淆）。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 非目标（本版本）

- 不含任何 Web UI 组件（provider 徽章等属 `dsh-plugin-web-ux`）。
- 不递归扫描 `.dsh/mcp/` 子目录。
- 隔离粒度到工作区为止，不细化到会话/目录；不做 agent 级 serverName 复用。
- 不隔离全局注册层与人类 UI（模型可见文本与资源调用已隔离，见「三面隔离」与「残余边界」）。
- 不做 watch 失效时的自动轮询（用 `/mcp-reload` 兜底）。

## 许可

Apache-2.0。
