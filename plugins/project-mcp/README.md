# dsh-plugin-project-mcp

DSH 插件（**纯宿主面，`exports "."`**）：让 MCP 配置随项目目录走——每个工作区根（及其附加根）的 `.dsh/mcp/` 目录下每个配置文件定义一台服务器，自动发现、加载、热重载，并**按工作区隔离工具可见性**，多项目并行时各会话只看得见自己项目的 MCP 工具。

本包不声明 `dsh.client`，不含任何 Web UI 组件，因此 **web / acp / headless 等任何 profile 都可单独安装**。

## 与 dsh-plugin-web-ux 的关系

本包由 [`dsh-plugin-web-ux`](../web-ux/README.md) 拆分而来（变更 `split-project-mcp-plugin`，行为零变化）：项目级 MCP 本是纯宿主能力，与 Web UI 无耦合，此前被 web 化的包名与安装面锁死在 web 场景。拆分后：

- `dsh-plugin-project-mcp`（本包）：项目级 MCP 全部宿主实现——扫描、冲突仲裁、加载管理、工作区隔离、监听、`/mcp-reload`；
- `dsh-plugin-web-ux`：只留 provider 徽章（client 半）+ 一个 no-op 载体行，后续 Web 界面体验优化仍落在它。

两者**互不依赖**，可分别安装；web profile 同时装两个即为拆分前的完整形态。

## 配置文件

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

- **归属判定**：取会话创建目录（cwd），逐级向上做 `realpath` 规范化后与全部已登记根比对，**最近命中**的那个根所属工作区即该会话的归属；到根目录仍无命中则无归属。
- **可见集合**：归属工作区的**整个根集合**（主根 + 授予它的附加根）下定义的服务器对该会话可见，其余项目 MCP 工具不可见。
- **fail-closed**：无归属的会话看不到**任何**项目 MCP 工具。
- **两层强制**：`tools.restrict({ deny })` 把关掉的名字从模型可见的工具表里移除；每个 agent 另挂一个 dispatch guard，拒绝对越权受管名的调用（覆盖「工具注册」与「限制重算」之间的窗口，以及名单漂移的边角；限制万一挂不上，guard 仍是唯一拦截面）。
- deny 名单**只从实际注册名推导**（`restrict` 遇未注册名会抛错，所以绝不手工拼名）。候选集取三个读数的并集：宿主全局层（`tools.schemas()`）、**该会话自己 scope 的视角**（`tools.schemas(agent)`）、以及**当前已被屏蔽且服务器仍在受管集合内**的名字。三者缺一不可：本部署的模型可见**内置**工具在 agent 平面（实测同构实例 `global=9` / `scoped=35`），把项目 MCP 行排布到该平面的部署同样成立；而第三项防止「限制生效后视角读数缩水 → 下一遍算出更小的 deny → 摘下限制」的振荡。内置工具与非本插件管理的 profile 级 MCP 工具（如 `mcp__dbx__*`）永远不会进名单，也不受影响。
- **健壮性**：归属判定、全局读数、视角读数各自兜底并降级（归属失败即 fail-closed 全屏蔽），每次重算整体再兜底一次——单个会话的运行期异常不会中断其他会话的刷新，且诊断行会点出失败阶段。
- **动态刷新**：`tools/change`（服务器连接、断开、工具同步）对全部存活 agent 重算；`agent/created` 是 serial 派发且框架会 `await` 监听器返回值，插件**返回**挂载 Promise，因此新会话**首步装配前**限制必定已生效。重算幂等——deny 集不变就**不重复注册**（`restrict` 本身会触发 `tools/change`，没有这条 diff 守卫会自激）。
- **排障**：本 profile 运行期没有 logger 出口，插件的诊断同时写 `ctx.logger` 与 `console`，因此 `docker logs dsh | grep dsh-plugin-project-mcp` 能看到 `isolation: cwd=… roots=N visible=[…] global=N(mcp=N) scoped=N(mcp=N) carried=N deny=N […]`、`isolation: masked N tool(s) …` 与冲突/跳过行——「隔离算空」和「隔离生效」一眼可辨。

## 热重载与 `/mcp-reload`

- 对每个根按阶梯监听**最深的存在层级**：`<根>/.dsh/mcp` → `<根>/.dsh` → `<根>`，因此「全新项目里第一次创建 `.dsh/mcp/`」也会自动加载，无需重启；文件事件去抖 250 ms。
- 重扫是**声明式 diff**：新增 → 加载，消失 → 卸载，内容变更 → 卸载后重载，改名 = 删旧增新；未变化的不动。
- 工作区登记变化与附加根授予变化（`multiRootRegistry.onChange`、`domain/changed`）触发全量重扫；事件只当触发器用，**不读载荷**，重扫一律以 `workspaceRegistry.list()` 的最新结果为准。
- **兜底命令 `/mcp-reload`**：全量重扫并向你反馈「加载 / 重载 / 卸载 / 保持不变 / 跳过 / 失败」计数。watch 在 NFS 等特殊挂载上不可靠时用它；本版本不做自动轮询。

## 软依赖与降级

[`dsh-plugin-multi-root-workspace`](../dsh-plugin-multi-root-workspace/README.md) 是**软依赖**：它的 registry 服务在就扫描「主根 + 附加根」，缺席（未安装或未激活）则**静默降级为只扫各主根**，其余行为不变，不报错。

## 隔离冒烟记录（验证证据）

在一份**独立 `DSH_HOME`、独立端口的同构 web profile 实例**上完成（`dsh --profile web --port 3099 --no-open`，数据目录与端口都与正在运行的宿主隔离，不打扰线上会话）。探针用 `/tmp/probe-mcp.mjs`：每台服务器暴露一个 `ping` 工具，回显自己的实例名；`serverName` 取文件名，另在 `opc/.dsh/mcp/` 放一台与 `dsh-plugins/.dsh/mcp/` 同名的 `probe-shared` 验证仲裁，`broken.yaml`（非法 YAML）验证单文件失败隔离。

| 会话归属（cwd） | 归属根数 | 可见 serverName | deny | 模型自述可见的 `mcp__` 工具 |
| --- | --- | --- | --- | --- |
| `…/person/dsh-plugins` | 3 | figma, probe-opc, probe-plugins, probe-shared | 1 | 5 个（figma×2 + probe 系 3；**没有** probe-cs） |
| `…/company/web/cloud-the-sky` | 2 | probe-cs | 5 | 2 个（probe-cs + profile 级 probe-profile） |
| `/tmp`（无归属） | none | —（fail-closed） | 6 | 全部项目 MCP 工具不可见 |

同一轮冒烟同时确认：

- **双向互不可见**：A（dsh-plugins）看不到 B（cloud-the-sky）的 `probe-cs`，B 也看不到 A 的 figma/probe-opc/probe-plugins/probe-shared。
- **profile 级 MCP 不受影响**：profile 行 `probe-profile` 在任何会话都可见——不在受管 `serverName` 集合里的工具永不进 deny。
- **同名冲突**：只加载 `dsh-plugins` 那台 `probe-shared`，`opc` 那台按规则跳过并记 error（含双方来源）。
- **单文件失败隔离**：`broken.yaml` 每次重扫只报一条解析错误，其余配置照常加载。
- **共享根只扫一遍**：某物理根同时是「A 的主根」与「B 的附加根」时不再产生自冲突噪声。
- **`/mcp-reload`**（走 GUI 输入框同一条 `commands/execute` RPC）实测反馈：`已重扫：加载 0、重载 0、卸载 0、保持不变 5、跳过 2、失败 0`；「跳过 2」正好对应 `broken.yaml` 与那台真正撞名的 `probe-shared`。
- **诊断可见**：进程 stdout / `docker logs` 逐次打印 `isolation: cwd=… roots=N visible=[…] global=N(mcp=N) scoped=N(mcp=N) carried=N deny=N […]` 与 `isolation: masked N tool(s) […]`，并印证「内置工具在 agent 平面（global 只有 9 个，agent 视角 35 个）」。

复现要点：准备临时 `DSH_HOME`（含 `storages/workspace.json` 工作区登记与 `multi_root_workspace.json` 授予关系）→ `dsh plugin --profile web add <本包绝对路径>`（可选加 multi-root 包）→ `dsh --profile web --port <备用端口> --no-open` → `POST /api/session/create`（`cwd` 指定工作区）→ `POST /api/session/prompt` 提问 → `POST /api/session/page` 读回答。

**真实宿主复验**（探针已清空、只留交付配置 `opc/.dsh/mcp/figma.yaml`；宿主重启加载新构建后）：

| 会话 cwd | 日志 `visible` / `deny` | 结论 |
| --- | --- | --- |
| `…/person/dsh-plugins`（opc 是其附加根） | `visible=[figma]` / `deny=0` | 归属内的 figma 可见 ✓ |
| `…/company/opc` | `visible=[figma]` / `deny=0` | 交付配置对本地会话可见 ✓ |
| `…/company/web/cloud-the-sky` | `visible=[]` / `deny=2` → `masked 2` | 越权工作区**看不到** `mcp__figma__*`：模型自述前缀统计 `mcp__figma__` = 0，profile 级 69 个（dbx/codebase-memory/chrome-devtools-mcp）不受影响 ✓ |
| `/tmp`（无归属） | `roots=none` / fail-closed | 项目 MCP 工具全不可见 ✓（旧构建基线下同样成立） |

同一宿主上 `/mcp-reload` 反馈：`已重扫：加载 0、重载 0、卸载 0、保持不变 1、跳过 0、失败 0`（仅剩 figma 一台；「跳过 0」= 无坏配置、无同名冲突、共享根不再自冲突）。

## 构建

自包含宿主产物：`link:` 与 git 两种安装形态都不依赖本包 `dependencies`（`yaml` 打进产物）；**`@deepseek-ai/dsh-mcp-client` 刻意不打进产物**——它经 `ctx.loader.import` 运行时加载，按 profile 目录为基准解析，因此与 profile 自己那些 MCP 行共用**同一个模块实例**（这正是项目级与 profile 级撞名能被 mcp-client 拒绝、而不是各自为政的前提）。

```bash
cd /home/xuqinqin/develop/person/dsh-plugins/plugins/project-mcp   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm typecheck     # tsc -b：host 单工程
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

docker exec dsh dsh --profile web --dump-config-schema   # 校验组合可加载（会 import 插件）
docker exec dsh dsh --profile web --dump-config | grep -A2 'id: project-mcp'
```

`dsh plugin add` 会把包追加进 profile `package.json` 的 `dsh.profile.bundles`，从而激活本包的 `cordis.patch.yml`（插入 `id: project-mcp` 的 bare 包名行）。web profile 想要徽章时另装 [`dsh-plugin-web-ux`](../web-ux/README.md)。

两点运维须知：

- **源码改动要重启 profile**：`link:` 安装的插件不在 profile 目录内，dsh-hmr 默认的模块监听根不含它，重建产物不会自动热替换（插件自己的 `.dsh/mcp/` 重扫是热重载的，别混淆）。要免重启，可在 profile patch 里给 hmr 行加模块监听根（`- id: hmr` / `config.root` 指向本包目录）——属开发便利，非必需。
- git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

## 非目标（本版本）

- 不含任何 Web UI 组件（provider 徽章等属 `dsh-plugin-web-ux`）。
- 不递归扫描 `.dsh/mcp/` 子目录。
- 隔离粒度到工作区为止，不细化到会话/目录；不做 agent 级 serverName 复用。
- 不隔离 MCP **资源**面（`list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`）：本插件隔离的是 `mcp__<serverName>__*` 工具命名空间，资源提供者按 agent scope 注册的语义属上游 `dsh-mcp-resources`——冒烟中已观察到越权工作区的 `probe-cs` 仍能被资源类工具列到（其工具则已被屏蔽）。若需资源面隔离应另开提案。
- 不做 watch 失效时的自动轮询（用 `/mcp-reload` 兜底）。

## 许可

Apache-2.0。
