# dsh-plugin-session-tool-toggle

DSH 插件（**双端**，`exports "."` 宿主 + `exports "./client"` 浏览器）：**会话级工具面开关**——在单个会话内关掉不需要的模型可见工具（`mcp:<server>` 整组、`mcp:<server>::<tool>` 或尾部 `*` 单工具、`tool:<name>` 内置工具，以及 `skill:<name>` 技能级开关），**下一次模型步骤生效**：工具侧由 `tools.restrict` 掩码与 dispatch guard 双层强制；技能侧由每 agent 层的影子注册让该技能对**模型**隐身（目录行消失、`skill` 工具拒调），`/<技能名>` 手动调用完整保留。全部入口共用**同一份状态**：`/tools` 命令面、会话头部工具区的 **Web 面板**（Connection RPC 通道 `/session-tool-toggle`）与统一「工作区配置」弹窗里的**工作区默认档分节**（弹窗壳由 holder `dsh-plugin-workspace-config` 提供）。用户级默认档在 `$DSH_HOME/session-tool-toggle/defaults.json`，工作区级默认档在 `$DSH_HOME/session-tool-toggle/workspaces.json`（键 = 工作区规范绝对路径）：新会话初始关闭集 = **用户档 ∪ 工作区档**，会话创建时拍快照，之后改档不追溯。

宿主半不含 Web 组件依赖，**任何 profile 都可单独安装**（命令面完整可用）；浏览器半只在 Web 组合下加载，入口是会话头部工具区的一枚图标按钮与统一「工作区配置」弹窗里的工作区默认档分节；弹窗壳由 holder 提供，**四包同装**（holder + multi-root-workspace / session-tool-toggle / web-ux 三个贡献方）才有完整入口。平台范围 DSH `>=0.2.1-rc.5 <0.3.0`。**安装/升级后必须重启 web profile**：浏览器半的 bundle 由宿主在启动图里提供，热装不生效。

## 双端结构

```text
src/index.ts / src/host/   宿主半：/tools 命令面、每 agent 掩码层与技能阴影分面、状态持久化、用户档与工作区档、RPC 通道 /session-tool-toggle
src/contract.ts            两端共享的线上契约（零 import，两端各内联一份）
src/client/                浏览器半：会话头部工具区入口 + 组件内 Modal 面板（技能开关、两个默认档分区——分组开关清单，默认折叠）+ 统一「工作区配置」弹窗的工作区默认档分节（WorkspaceDefaultsSection）+ locale + CSS module
test/                      单测（宿主 node 环境 / 浏览器 jsdom）
lib/index.js               宿主产物（单文件 ESM，只外置 node:*）
lib/client.js              浏览器产物（CJS bundle，包在 window.__ModuleLoader__.load 壳里）
```

宿主半同时是 **Web 客户端模块扫描的锚点**：web 组合只从 bundle patch 的**裸包名行**读取 `package.json` 的 `dsh.client` 声明，浏览器半才会进启动图。因此 `cordis.patch.yml` 必须以 `name: 'dsh-plugin-session-tool-toggle'`（不带路径、不带 config）插入一行——去掉这行 = 面板入口静默消失，命令面照常。

## 用法：单一 `/tools`

| 输入 | 作用 |
| --- | --- |
| `/tools`、`/tools status` | 看本会话开关、技能关闭情况、默认档、工作区默认档、本会话可关对象分组计数、保护名单 |
| `/tools off <地址…>` | 关闭（一次可给多个地址） |
| `/tools on <地址…>` | 开启 |
| `/tools reset` | 回到**创建时快照**（用户档 ∪ 工作区档在那时拍下） |
| `/tools default` | 只看用户级默认档（不写文件、不影响任何会话） |
| `/tools default off\|on\|set\|reset <地址…>` | 写用户级默认档，**只影响之后新建的会话** |
| `/tools workspace`、`/tools workspace status` | 看本会话所属工作区的默认档（键、是否已登记、文件路径、条目） |
| `/tools workspace off\|on\|set\|reset <地址…>` | 写本会话所属工作区的默认档，**只影响之后在该工作区新建的会话**（`reset` 清空本工作区条目） |

四条地址分支：

| 地址 | 语义 |
| --- | --- |
| `mcp:<server>` | 整组关闭：该服务器全部工具 schema **与 `mcp:<server>` 服务器指令段**一并移除 |
| `mcp:<server>::<tool>`、`mcp:<server>::<prefix>*` | 单工具：只摘匹配的 schema，指令段保留 |
| `tool:<name>` | 内置工具；`skill` / `skill:*` 是整档 `tool:skill` 的口语别名 |
| `skill:<name>` | 技能级开关：只让该技能对**模型**隐身（目录行消失、`skill` 工具拒调），`/<技能名>` 手动调用照常（该技能仍出现在 `/` 菜单里，标为仅限用户调用） |

- `mcp:<server>::*` 与 `mcp:<server>` 是**同一个意图**，规范形只留整组。
- `skill:<name>` 的技能名沿用 dsh-skill 的 kebab 文法（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）；`skill` / `skill:*` 是整档别名（目录停发、`skill` 工具 schema 也消失），不是通配。
- `/tools workspace` 只作用**本会话所属工作区**（没有 `--path` 形态）；地址文法与 `/tools off` 完全相同。
- 指向未注册 / 已断线服务器的地址**不报错**：意图记录在关闭集，服务器上线后自动生效；不存在的 `skill:<name>` 同理，技能装上后自动遮蔽。
- 一条命令里的多个地址**全有或全无**：任一地址文法错误、命中保护名单或保留名（`run_code`），整单拒绝，状态一个字节都不写。
- 回执只报**计数与代价形状**（隐藏几个工具定义、可见数变化、前缀缓存是否重建），不展开工具清单——清单看 Web 面板。

## 预期管理（先读这一节）

**不是安全边界。** 本插件面向 **token 经济**：关掉工具让它的 schema 与指令段不再进入模型请求，被关工具在迟到调用时会收到可读的拒绝理由。但这不是权限、沙箱或数据边界的语义——它不改变任何权限规则，也挡不住有意的越权；要限制能力请用权限/沙箱机制，别把「关掉 bash」当成安全措施（`bash` 本来就在保护名单里）。技能开关同理：它只让技能对模型隐身，`/<技能名>` 手动调用、正文与磁盘 SKILL.md 原样保留，同样不是权限边界。

**子代理 / 队友会话不继承父会话的会话级开关，但会按默认档拍自己的快照。** 父子各自独立：父会话额外关掉的 `mcp:dbx` **不会**传给子代理（dbx 对子代理仍可见），而默认档里的关闭项同样作用于子代理。面板对 `origin === 'subagent'` 的会话会多一条提示。

**历史不改写。** 已经发生过的工具调用原样留在会话历史里，本插件不清理也不重写；关掉一个工具只影响**之后**的模型步骤，历史里那条「已不可调的调用」会继续存在（重放或复制历史时也照旧）。

**KV 前缀缓存是一次性重建，开/关对称。** 一次真实改变模型请求的开关（工具 schema 或技能目录）会让下一次请求**从第一个变化的 token 起**重建一次前缀缓存——这是本功能唯一的隐性代价，命令回执与面板的变更回执都会明说。三种「说了但不重建」的情形同样明说：重复开关（关闭集没变）、`/tools off mcp:zzz` 这类「记录意图但当前无匹配」（状态变了、模型请求没变），以及技能服务缺席时只记意图。

**技能翻转有目录替换成本，批量只出一条。** 每次真实的 `skill:<name>` 翻转（关或开）都会让官方技能目录在**下一次模型步骤**发一条**全量替换**消息（`update: true`，列出当时仍可见的全部技能行），并让下一次请求重建一次 KV 前缀缓存；一条命令里关多个技能只产生**一条**替换消息，所以「开工前一次关齐」最划算。省下的是目录行 token；`skill` 工具本身的 schema 不在其中（那要整档关 `tool:skill`，与工具 schema 同价）。被关技能只是对模型隐身，`/<技能名>` 手动调用注入的是与磁盘 SKILL.md 逐字节一致的完整正文——它是给人用的入口，不是绕过 token 经济的入口。

**工作区默认档只对新会话生效，且与用户档取并集。** 新会话初始关闭集 = 用户档 ∪ 本工作区档（工作区档只能追加关闭项，不能反开用户档里的条目）；写档不改变任何已存在会话。工作区键是会话 cwd 的**规范绝对路径**（realpath；命中 `workspaceRegistry` 时用登记路径），同一工作区的不同进入方式（子目录、符号链接）因此归到同一个键，但这串路径**不可跨机移植**——换机器或换挂载点后要重写键。

**面板不是第二份状态。** 面板开关、统一弹窗里的工作区默认档分节与 `/tools`、`/tools workspace` 共用同一控制内核、同一状态存储、同一掩码层与同一技能分面：任一处写入，另一处在下一次读取 / 刷新时看到同一条记录（详见「Web 面板」）。

**保护名单只增不减。** 硬编码基线 `bash` / `pwsh` / `read` / `write` / `edit` / `glob` / `grep` 永远在名单里，配置只能追加（`protectedTools`），不能移除；`run_code` 是注册表保留名，同样拒绝关闭。名单内工具在面板上呈现为不可切换。

**持久化可能降级为内存态。** 主通道是会话日志里的整值插件记录（`plugin:session-tool-toggle/state`）加 host-only 投影 `sessionToolToggle`；读路径「投影优先 → `snapshotEvents()` 重放兜底 → 空态」，降级后先读内存后备。宿主模块解析失败或写入抛错时降级为**进程级内存态**（`kind: 'memory'`）：本会话的开关照常生效，但 **resume 之后会丢**，进程日志里只有一条 warn。这是有意的取舍：功能不缺失，只丢跨 resume 保持。

**依赖实验性通道。** `appendPluginRecord` 是 DSH 官方文档明写「本仓库之外的插件同样不得调用」的**实验性通道**（`dsh-session/README.zh.md` 的插件记录一节）。本插件依赖它换取 fork/resume 的免费语义；官方删除或收紧时，降级路径就是上面的内存态。不愿接受这条依赖的部署可以显式 `storage: 'memory'`（见「配置」）。

**安装/升级后必须重启 web profile。** 浏览器半的 bundle 由宿主在启动图里提供，`dsh plugin add` 不会热替换它；只重启之后才发现新面板或新行为是正常的。宿主半（`/tools`）同样以 profile 装配当刻的构建运行。

## Web 面板

**两个挂载面**：会话头部 `conversation.session.header.utilities`（list / scope `session`，entry id `session-tool-toggle-panel`、order **20**，官方三项 -10 / -5 / 0 之后）打开工具面板；统一「工作区配置」弹窗的分节 `workspace-config.section`（list / scope `root`，entry id `session-tool-toggle-workspace-defaults`、order **20**，座位由 holder `dsh-plugin-workspace-config` 用 `children` 声明）承载工作区默认档编辑器。旧 `sidebar.footer.*` 入口已移除：侧栏 footer 只剩 holder 的统一入口，四包同装约定见仓库根 README。面板是组件内 Modal，六段自上而下：状态摘要 → 本会话开关（MCP 服务器 / 技能整档 / 内置工具三组，可折叠）→ 技能逐行开关 → 工作区默认档 → 用户级默认档 → 关闭集；面板底部左「刷新」右「关闭」。**两个默认档分区默认折叠**：标题行给「默认关 M · 残留 K」摘要（收起时也看得出有没有默认关的东西），点开是**分组开关清单**——MCP 服务器组（整组开关 + 组内工具行）、技能整档（`tool:skill` 组开关 + 逐技能行）、内置工具行（带过滤输入，无组开关），每个分区自带折叠标题行与计数；整组地址在档里时组内行禁用并标「整组默认关」，档里不在本会话清单里的地址落进「残留地址」区**只可移除**，**没有自由文本添加**——跨清单的新关走 `/tools default off` / `/tools workspace off`。统一弹窗的分节（旧对话框的替代）自带工作区下拉（只列 `workspaceRegistry` 里的已登记工作区），作用域恒为「所选工作区之后新建的会话」，且**不折叠**（折叠只属于面板里的两个分区）；弹窗的关闭 / 分节导航由 holder 提供。

技能行开关的是**模型可见性**（关闭后行内标注「对模型隐藏，`/技能名` 手动调用保留」）；整档 `tool:skill` 关闭时逐行开关置灰并给一行提示。开关方向是**开 = 工具可用**：点击一个打开的组开关发出的是「把 `mcp:<server>` 加进关闭集」。分组清单里受保护 / 保留名的行**禁用**并给出 `title` 理由（其余行都可切换）；关闭集区可逐条「开启」，「恢复创建时快照」是两段式确认。

**与命令面是同一份状态，不是第二份。** 面板与对话框的读与写都走 Connection RPC 通道 `/session-tool-toggle`（`panel` / `toggle` / `reset` / `defaults` / `workspace` 五个端点），宿主侧所有入口共用 `src/host/control.ts` 的同一控制内核、同一状态存储、同一掩码层与同一技能分面——面板里关掉 `mcp:yunxiao` 与 `/tools off mcp:yunxiao` 写的是同一条记录，面板里改工作区档与 `/tools workspace off …` 走的是同一个 `updateWorkspaceDefaults`，随后 `/tools status` 显示同一关闭集与同一工作区档，下一次模型步骤同时生效。面板不自行维护关闭集：**不做乐观更新**，开关翻转一律等宿主返回的新快照；打开时必拉一次，之后靠 mutation 回执、本会话的 `/tools` 执行事件（`command/executed`）、窗口 focus 与手动「刷新」收敛。

**两档都不追溯。** 面板里改用户级默认档只写 `defaults.json`，改工作区默认档只写 `workspaces.json` 并回新视图，**都不改变当前会话的关闭集**；文案分别写明「只影响之后新建的会话」「只影响在这个工作区之后新建的会话」。也没有「保存并应用到本会话」复选框——那会破坏快照语义；想改本会话就用开关或 `/tools off|on`。目标无法归属 / 未登记回 `workspace-unresolved`，写盘失败回 `workspace-unwritable`（附文件路径），两种情形都不会留下半写文件。

**面板不提供配置键编辑。** 插件配置键（`storage` / `protectedTools` / `defaultsFile` / `workspacesFile` / `hostModuleBase`）只能在 profile 的插件行 `config:` 段里改；面板没有配置页、没有隐藏入口，也不提供 per-session 的配置覆盖。面板能做的只有：清单分组、会话级工具与技能开关、用户级默认档、工作区默认档、关闭集展示与恢复创建时快照。

### 降级矩阵

| 依赖 | 用途 | 失效表现 |
| --- | --- | --- |
| **RPC 通道** `/session-tool-toggle`（宿主 `connection.rpc.handle`） | 浏览器↔宿主唯一数据面 | 面板打开后显示 `unavailable`（「无法连接到 dsh 主进程」）且不渲染任何开关；**命令面仍可用** |
| **座位** `conversation.session.header.utilities` / `workspace-config.section` | 会话头部工具面板入口 / 工作区默认档分节 | 对应入口不出现（软注册整段 `try/catch` 吞掉拒绝，只 warn）；**另一个入口与命令面仍可用**；holder 缺席时分节座位未声明，`slots.inject` 回调不触发（不报错） |
| **client 服务 `connection`**（渲染期软取，不在 `inject` 名单） | 每次动作现取 RPC 客户端 | 首次打开按 `unavailable` 降级；服务晚到后下一次打开/刷新**自动恢复**，无需重载页面 |
| host 服务 `connection` / `webServer`（cordis `inject`） | 通道挂载点 | 通道不挂载（只 warn 一行）；命令面照常 |
| host 服务 `commands` | `/tools` 注册 | 没有 `/tools`；面板不受影响（通道独立挂载） |
| 每 agent 层 `skills` 服务（`agent.ctx` 软注入） | 逐技能影子 stub | 技能分面降级：技能地址只记意图、模型目录不屏蔽；`/tools` 与工具掩码照常，面板给 `skills-unavailable` 且技能区不渲染开关；服务晚到会自动补挂 |
| host 服务 `workspaceRegistry`（`ctx.inject` 软注入） | 工作区登记与显示标题 | 不阻塞：`cwd` 的 realpath 仍作为工作区键参与并集（`registered:false`），对话框的工作区下拉为空；`/tools workspace` 与工作区档照常 |
| host 服务 `sessionProjections` | 读路径首选面 | 投影缺席 → 读路径回落日志重放，状态与开关照常 |
| host 服务 `agents` / `tools`（cordis `inject`） | 生命周期与掩码 | 宿主半整体不激活：没有命令面，也没有通道（硬依赖，非软降级） |
| 宿主 `dsh-session` 模块（身份断言） | 持久化写通道 | 进程级内存降级；面板出现 `persistence-degraded` 提示 |
| 默认档文件 | 新会话初始关闭集 | 缺失 → 空档 + warn（不算损坏）；损坏 / 半写 → 空档 + 一条 warn，面板出现 `defaults-corrupt` 提示 |
| 工作区档文件 | 工作区级默认关闭集 | 缺失 → 空档且**不告警**（首次使用是常态）；损坏 / 半写 / `version` 不符 → `EMPTY_WORKSPACES` + 一条 warn，面板显示「工作区档文件损坏或半写，已按空档处理」，会话照常创建、用户档照常播种 |

前三行是面板侧的三条主要接触点（RPC 通道 / 座位 / client 服务），其余按 Web 组合的实际接触点补齐：任何一条失效都只削弱对应的一个入口或一条读路径，不会让 GUI 崩溃。

## 配置

五个键全部可选，`cordis.patch.yml` 不带 `config:` 段，零配置可跑：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `storage` | `'auto'` | `auto` = 宿主模块可用则写会话日志，否则内存降级；`memory` = 只用内存（不解析宿主模块） |
| `protectedTools` | `[]` | 在硬保护基线之上**追加**保护名，只增不减 |
| `defaultsFile` | 省略 | 绝对路径覆盖用户级默认档位置（省略即 `$DSH_HOME/session-tool-toggle/defaults.json`）；相对路径按未设处理并 warn |
| `workspacesFile` | 省略 | 绝对路径覆盖工作区档位置（省略即 `$DSH_HOME/session-tool-toggle/workspaces.json`）；相对路径按未设处理并 warn |
| `hostModuleBase` | 省略 | 绝对路径覆盖宿主 `@deepseek-ai/dsh-session` 的解析锚点（排障 / 单测用） |

`Config` 用**原生 Schemastery** 声明（不是 zod / 标准 schema）：`--dump-config-schema` 只认原生 Schemastery 图，换成别的实现会把装入了本插件的 profile 的 schema dump 拖红。写错类型会被 schema 直接拒绝，而不是静默按默认值处理。

## 已知限制

- **读数取本会话作用域**：面板的清单宇宙、分组计数与工具描述，以及 `/tools status` 的清单与计数，全部只读**本会话**——`scoped`（本会话该 agent 视角当前可见的工具，即 `ctx.tools.schemas(agent)`，与 `/inventory` 同一条表达式）∪ `carried`（本插件上一轮已生效的关闭集保底）；宿主全局层（其他工作区 / 其他 agent 注册的名字）不参与任何推导，被其他作用域隔离（如 project-mcp 的工作区隔离）的名字既不进清单、也不进分组计数。与 `/inventory` 读的是同一份会话视角，但面板清单有两处**刻意差异**：① **已关条目仍在清单里**——上一轮已关闭、本会话仍受管的条目保留在清单中，用户能看到它们并重新打开（`/inventory` 只列当前可见工具，没有这些行）；② **多出 `tool:<name>` 与 `tool:skill` 行**——面板可关内置工具与技能整档，`/inventory` 只做清单、不提供开关。代价是**已关条目没有 `title` 描述**：描述经本会话层 `visibleSchemas()` 读取，已关条目在会话读数里没有 schema，面板只显示名字、不显示描述。技能行同走会话视角（`scope: agent` 读技能注册表），不受工具读数口径影响。
- **两个默认档界面只列本会话可见工具，且没有添加入口**：用户级与工作区级默认档的分组开关清单，宇宙与面板同源（本会话两读：可见 ∪ 已关保底），不是「这份档可能命中的全部地址」。界面能写进档的关闭项因此只有清单里出现过的地址；给**不在本会话清单里**的地址补一条默认关只能走命令行：用户级 `/tools default off <地址>`，工作区级 `/tools workspace off <地址>`（**只作用本会话所属工作区**，没有 `--path` 形态）。于是**其他工作区**里那些「本会话从未出现」的地址（典型是该工作区私有的 project-mcp 服务器）既没有界面也没有 CLI 可新增，只能手改 `$DSH_HOME/session-tool-toggle/workspaces.json`（键 = 工作区规范绝对路径，文件形状见「排障」）——这是「宇宙取本会话视角」与「界面无自由文本」两条口径叠加后的能力边界，已知并接受；界面上的命令提示只覆盖「本会话所属工作区」这一种情形。
- **切其他工作区看到的是「当前会话视角」的近似**：统一「工作区配置」弹窗的分节可下拉切到其他已登记工作区，但切过去后的分组清单仍是**本会话**的宇宙，不是那个工作区自己会话的清单——该工作区私有的名字（上句那类「本会话从未出现」的地址）不会出现在分组里，该档里已有的只会落进残留地址区。「整组默认关则组内行禁用」在这个近似下同样表达意图：行禁用 = 该组地址已在所选工作区的档里，不代表该工作区真的没有这些工具。
- **已关条目无描述（默认档界面同此）**：首条已说明面板上的已关（`carried`）条目没有 `title` 描述；两个默认档界面的宇宙与面板同源，因此那里的已关条目同样只有名字、不显示描述——不是默认档少读了什么，而是会话读数里本就没有它的 schema。
- **无 skills 的 Web 组合受限（上游硬依赖）**：上游 agent preset 需要 `skill-filesystem` / `tool-skill`，`skills` 缺席时新会话创建直接失败（`agent-preset/invalid … waiting for skills`），因此该组合下没有可调整的活会话；这是上游 preset 的硬依赖，不是本插件的降级失败。此时命令面照常可用，技能地址只记意图，RPC 面板快照按 `skills-unavailable` 降级（技能区不渲染开关）。
- **跨窗口不广播**：`command/executed` 只在命令提交的那个窗口发出，另一个窗口要靠 focus 或手动「刷新」才收敛；两处并发修改按「后写者胜」。
- **`--dump-config-schema` 整体可能 exit 1**：本部署的 web profile 自带 4 条 `unrecognized Loader tree carrier` 诊断（`/186`–`/189`，与本插件无关，全新空 `DSH_HOME` 同样红）。核对本插件的口径是 `x-cordis.entries` 中本插件条目的 `status` 为 `"schema"` 且没有指向本插件的诊断，不要追全局 exit 0。
- **非目标**：不做追溯（默认档与工作区档都只对之后新建的会话生效，`/tools reset` 只回本会话创建时快照）；不做上游 patch（ADR-0002：`@deepseek-ai/dsh*` 零修改、零 import，技能影子只走公开 `skills.register`，不替换 `dsh-tool-skill` / `dsh-skill` 行）；上游工作区行菜单入口留作**后续变更**（上游座位定名后另立变更，本期工作区默认档只有统一「工作区配置」弹窗的分节入口，依赖 holder 同装）；不做全局 / 进程级服务器启停（`plugin_manager` 已有）、不做子代理继承会话开关、不做投影 wire 实时推送或轮询、不改写历史、不适配 DSH `>=0.3.0`（走既有基线升级流程）。
- 无 Web 组合时只有命令面；面板入口与通道都不出现，也不报错。

## 排障

插件诊断统一带 `dsh-plugin-session-tool-toggle：` 前缀，并同时写 `ctx.logger` 与 console（web profile 启动后没有 logger exporter，单写 logger 在进程日志里看不见）：

```bash
docker logs dsh 2>&1 | grep dsh-plugin-session-tool-toggle
```

值得先看的几行：`已装配：inject=[agents, tools]，默认档 …，工作区档 …，保护名单 N 项，持久化 …`（插件起来了）、`持久化通道：record` 或 `持久化通道：memory`（`auto` 解析后的实际生效通道；`storage: memory` 时改为启动行的「持久化 memory（配置指定）」）、`会话 <id>：已按默认档播种（快照 N 项，已生效）`、`已注册 /tools 命令`、`已注册 host-only 投影 sessionToolToggle`、`已挂载 RPC 通道 /session-tool-toggle`、`connection 服务解析为空（宿主未提供 Connection），RPC 通道未挂载`。另有两条按需出现的诊断行：`技能分面降级：首个会话挂载时 skills 服务未就绪…`（warn，技能开关只记意图）与 `会话 <id>：无法归属工作区，本次只按用户级默认档播种`（info，cwd 缺失 / 目录已删）。

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
- **工作区档写坏 / 想手改**：文件是 `{"version": 1, "workspaces": {"/abs/workspace": {"disabled": ["skill:foo"]}}}`，键是工作区**规范绝对路径**（realpath；`/tools workspace` 会显示本会话的键与文件路径）。权限位同默认档（文件 `0o600`、目录 `0o700`）；缺失按空档且不告警，损坏 / `version` 不符按空档 + 一条 warn。改好后**下一个在该工作区新建的会话**生效，当前会话不变。键不可跨机移植：换机器或换挂载点后要重写键。
- **技能开关「记了但没生效」**：看 `/tools status` 的「技能」段——「意图 N」大于 0 表示有已关但未遮蔽的技能。若整段是「技能：不可用」，说明本组合没有 `skills` 服务（技能地址只记意图，模型目录不会变）；若是单个技能失败，面板给 `skill-shadow-failed`（同层已有同名 runtime 先到先得），解决命名冲突后下一次 `skills/change` 自动重试。
- **面板入口不出现**：依次确认 bundle patch 里那条**裸包名行**还在、profile 已重启、座位属于当前 Web 组合；用 `docker exec dsh dsh --profile web --dump-config | grep -A2 'id: session-tool-toggle'` 看装配行。座位注册被拒时浏览器控制台会有一条 `session-tool-toggle: 会话头部工具区座位注册失败`（或 `工作区配置分节座位注册失败` 的 warn）（client 侧日志不进 `docker logs`）。
- **改了源码或升级了版本**：`cd ~/develop/docker && docker compose restart dsh` 重启 web profile 生效（`link:` 安装的插件不在 hmr 的模块监听根内）。

## 构建与测试

双端自包含产物，`build.mjs`（esbuild）一次产出两个文件：`lib/index.js`（宿主 ESM，只外置 `node:*`，schemastery 打进产物）与 `lib/client.js`（浏览器 CJS bundle 包进 `window.__ModuleLoader__.load` 壳，`react` / `react-dom` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives` 等由浏览器壳的 loader 提供，CSS modules 编译成运行时 `<style>` 注入）。不产 d.ts、不产 sourcemap。

```bash
cd plugins/session-tool-toggle   # 本包是 dsh-plugins workspace 成员
pnpm install
pnpm build        # esbuild → lib/index.js + lib/client.js
pnpm typecheck    # tsc -b：host + client 双工程（solution tsconfig）
pnpm test         # vitest：文法/状态/掩码/技能筹划/层与技能分面/持久化/默认档/工作区档/归属/命令/内核/面板/技能面板/工作区编辑器/RPC/client 套件
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

`dsh plugin add` 会把包写进 profile `package.json` 并把本包的 `cordis.patch.yml` 追加进 `dsh.profile.bundles`（插入 `id: session-tool-toggle` 的裸包名行）。升级 = 改 tag 重装后重启；回滚 = 指回旧 tag 重装后重启（代价见下）。git 安装形态与 `insteadOf` 陷阱见仓库根 [README](../../README.md#装入-profile)。

### 回滚代价

指回旧 tag 重装并重启即可回到旧版，**但回到不含本功能的旧版（本功能之前的 1.4.0 / 1.5.0 均如此）有代价**：

- **`skill:<name>` 条目被按自校验丢弃**：旧版 `parseAddress` 不认识 `skill:` 前缀，读状态记录时只保留能解析的条目——技能开关在面板与 `/tools status` 里**静默消失**（进程日志会留一条「条目不合法，已丢弃」的 warn）。若旧版在回滚期间写过状态，这些条目就不再出现在最新记录里，重新升级也读不回来，需要按名字重关一遍。
- **工作区级默认档不再参与播种**：旧版完全不读 `workspaces.json`，新会话只按 `defaults.json` 播种；文件本身不会被删，重新升级后继续生效。
- 工具地址（`mcp:` / `tool:`）的关闭集与 `defaults.json` 不受影响：这两类偏好在旧版同样可读，跨版本兼容。

会话日志里的整值状态记录仍是 `version: 1`，回滚不需要迁移或清理文件；代价只是本功能引入的技能条目与工作区档在旧版进程里不可见。

## 许可

Apache-2.0。
